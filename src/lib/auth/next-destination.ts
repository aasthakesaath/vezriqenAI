/**
 * Where to land someone after they sign in or sign up.
 *
 * Ported from Calyqen (`src/lib/auth/next-destination.ts`) rather than
 * rewritten — owner decision, 2026-09-08. Vezriqen already had a weaker
 * inline version of this check in the Google routes; this one is stricter and
 * is now the single implementation both paths use.
 *
 * ANY value that reaches a redirect is an open-redirect risk, and this one
 * arrives in a URL a stranger can craft and send to someone else. So it is
 * validated rather than trusted:
 *
 *   - must be a path on this site, beginning with a single "/"
 *   - never "//host" or "/\host", which browsers read as protocol-relative
 *     URLs to another origin
 *   - no scheme, so "javascript:" and "https:" can never survive
 *   - no whitespace or control character, which is how a redirect header
 *     gets split
 *   - anything else falls back to onboarding, silently
 *
 * The fallback is deliberate: a malformed destination should land someone
 * somewhere useful, not show them an error about a URL they never typed.
 */

/** PRD §30.7 — first signup flows straight into plan upload/paste. */
export const DEFAULT_DESTINATION = "/start";

export function safeNextDestination(
  value: string | null | undefined,
  fallback: string = DEFAULT_DESTINATION,
): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return fallback;
  // Protocol-relative: "//evil.example" and the backslash variant browsers
  // normalise to it.
  if (trimmed.startsWith("//") || trimmed.startsWith("/\\")) return fallback;
  // Whitespace and control characters, as two explicit tests rather than one
  // character class: an earlier draft combined them into a class whose middle
  // was a range ending at the hyphen, which rejected every real id.
  if (/\s/.test(trimmed)) return fallback;
  const hasControlCharacter = [...trimmed].some((character) => {
    const code = character.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  });
  if (hasControlCharacter) return fallback;
  return trimmed;
}
