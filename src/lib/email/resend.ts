import "server-only";

import type { DeliveryResult, EmailMessage, EmailProvider } from "./provider";

/**
 * Resend transactional email (PRD §22 suggests Resend or Postmark).
 *
 * Talks to the HTTP API directly rather than pulling in the SDK: one endpoint,
 * one shape, and no dependency to keep current.
 */
export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";
  readonly configured = true;

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<DeliveryResult> {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(message.to)) {
      return {
        sent: false,
        reason: "invalid_recipient",
        detail: `"${message.to}" is not a valid email address.`,
      };
    }

    let response: Response;
    try {
      response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html,
        }),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Network error";
      console.error(`[vezriqen:email] NOT SENT — could not reach Resend: ${detail}`);
      return { sent: false, reason: "provider_error", detail };
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => `HTTP ${response.status}`);
      console.error(`[vezriqen:email] NOT SENT — Resend rejected the message: ${detail}`);
      return { sent: false, reason: "provider_error", detail };
    }

    const payload = (await response.json().catch(() => ({}))) as { id?: string };
    return { sent: true, providerMessageId: payload.id ?? null };
  }
}
