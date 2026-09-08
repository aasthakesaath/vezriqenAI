import "server-only";

import { ResendEmailProvider } from "./resend";
import { UnconfiguredEmailProvider, type EmailProvider } from "./provider";

/**
 * Resolves the email provider.
 *
 * Without a key this returns a provider that logs clearly and reports
 * sent: false. It never throws and never no-ops silently: the in-app reminder
 * centre is the reliable channel (PRD §12 — browser push is not required in
 * Phase 1), and email supplements it. Losing email must degrade the product,
 * not break it or lie about it.
 */
export function getEmailProvider(): EmailProvider {
  const apiKey = process.env.EMAIL_PROVIDER_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Vezri <vezri@vezriqen.com>";

  if (!apiKey) return new UnconfiguredEmailProvider();
  return new ResendEmailProvider(apiKey, from);
}

export type { EmailProvider, DeliveryResult, EmailMessage } from "./provider";
export { UnconfiguredEmailProvider } from "./provider";
