/**
 * Feedback plumbing, ported from Meriqen (`lib/feedback.ts`) rather than
 * rewritten — owner decision, 2026-09-08.
 *
 * Meriqen's version is the right shape for Vezriqen because of what it does
 * NOT do: it takes no session, writes to no table, and stores no identifier.
 * PRD §30.8 makes Feedback the support/contact path for the whole public site,
 * so it has to work for someone who cannot sign in — which rules out Calyqen's
 * authenticated variant, whose form sits behind /signin.
 *
 * The other inherited rule is the one that matters most: never tell someone
 * their message arrived when it did not. That is the same guarantee the
 * reminder pipeline makes, and it comes from the same place.
 */

/** Where feedback is delivered. Configuration, not a hardcoded inbox. */
export function feedbackInbox(): string {
  return (
    process.env.FEEDBACK_EMAIL_TO ??
    process.env.NEXT_PUBLIC_LEGAL_CONTACT_EMAIL ??
    "privacy@vezriqen.com"
  );
}

/**
 * The page a report came from, made safe to email. Ported verbatim in
 * behaviour from Meriqen.
 *
 * A report that does not say where it came from is much harder to act on, but
 * a raw pathname can carry things a feedback email must never hold. In
 * Vezriqen that is the email action token in /r/<token>, and goal and document
 * ids are path segments too. So: query and hash are stripped, token-shaped
 * segments (16+ chars of id-alphabet) are redacted to [id], and anything that
 * still is not a plain path comes back null rather than guessed at.
 *
 * Applied CLIENT-side when the link is built and SERVER-side on the API body,
 * because the API must not trust the client.
 */
export function sanitizePagePath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const path = raw.split(/[?#]/)[0]!.slice(0, 120);
  if (!path.startsWith("/")) return null;
  const redacted = path
    .split("/")
    .map((segment) => (/^[A-Za-z0-9_-]{16,}$/.test(segment) ? "[id]" : segment))
    .join("/");
  return /^[/A-Za-z0-9_\-[\]]*$/.test(redacted) ? redacted : null;
}

/** PRD §30.8 — the topics offered on the feedback form. */
export const FEEDBACK_TOPICS = [
  "Something is broken",
  "A suggestion",
  "A question",
  "Something else",
] as const;

export const MAX_FEEDBACK_CHARS = 4000;
