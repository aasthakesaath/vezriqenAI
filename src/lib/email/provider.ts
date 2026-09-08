/**
 * Email delivery (PRD §12).
 *
 * The result type is the important part of this file. Delivery either happened
 * or it did not, and the caller must be able to tell which without guessing:
 * `sent: false` carries a machine-readable reason, and the reminders table's
 * check constraint makes it impossible to record a sent_at alongside it.
 *
 * A "success" that quietly dropped the message is the failure mode this design
 * exists to prevent.
 */

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type DeliveryResult =
  | { sent: true; providerMessageId: string | null }
  | {
      sent: false;
      reason: "not_configured" | "provider_error" | "invalid_recipient";
      detail: string;
    };

export interface EmailProvider {
  readonly name: string;
  readonly configured: boolean;
  send(message: EmailMessage): Promise<DeliveryResult>;
}

/**
 * Used when no provider key is present.
 *
 * It does not pretend to send. It logs loudly, once per message, and returns
 * sent: false — so the reminder stays visible in the in-app centre and is
 * recorded as `suppressed`, never as delivered.
 */
export class UnconfiguredEmailProvider implements EmailProvider {
  readonly name = "unconfigured";
  readonly configured = false;

  async send(message: EmailMessage): Promise<DeliveryResult> {
    console.warn(
      `[vezriqen:email] NOT SENT — EMAIL_PROVIDER_API_KEY is not set. ` +
        `Recipient: ${message.to}. Subject: "${message.subject}". ` +
        `The reminder is still available in the in-app reminder centre and has been ` +
        `recorded as suppressed, not sent.`,
    );
    return {
      sent: false,
      reason: "not_configured",
      detail: "EMAIL_PROVIDER_API_KEY is not set, so no email was sent.",
    };
  }
}
