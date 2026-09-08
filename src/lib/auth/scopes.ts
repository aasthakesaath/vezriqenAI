/**
 * Google scope policy.
 *
 * PRD §5, §23 and §30.7 all require the same thing: authenticating with Google
 * must not grant Calendar access. Keeping the sign-in scope list here — as data,
 * with no code path that appends to it — is what makes that assertable in a
 * test rather than a claim in a comment.
 *
 * Calendar scopes are requested by a separate consent step in Milestone 6, from
 * a different Google client, and never travel through sign-in.
 */
export const SIGN_IN_SCOPES = ["openid", "email", "profile"] as const;

export const SIGN_IN_SCOPE_STRING = SIGN_IN_SCOPES.join(" ");

/** Anything matching this is a sensitive scope that sign-in must never request. */
export function isCalendarScope(scope: string): boolean {
  return scope.toLowerCase().includes("calendar");
}

export function assertNoCalendarScope(scopes: readonly string[]): void {
  const offending = scopes.filter(isCalendarScope);
  if (offending.length > 0) {
    throw new Error(
      `Sign-in must never request Calendar access (PRD §5, §23, §30.7). Offending scopes: ${offending.join(", ")}`,
    );
  }
}
