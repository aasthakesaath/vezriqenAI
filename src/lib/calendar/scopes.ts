/**
 * Google Calendar scopes (PRD §11, §23 "Request minimum Google scopes
 * necessary").
 *
 * These are requested by a SEPARATE Google OAuth client from sign-in, and only
 * at the moment the user opts in. Two reasons, and both matter:
 *
 *   1. §5, §23 and §30.7 all require Calendar consent to be a distinct step.
 *      Bundling it into sign-in would make every new user grant calendar access
 *      to create an account.
 *   2. The production sign-in client is PUBLISHED. Adding a sensitive scope to
 *      a published app before verification imposes a permanent user cap on the
 *      project that cannot be reset. Calendar is therefore developed against a
 *      second Google Cloud project in Testing status, via
 *      GOOGLE_CALENDAR_CLIENT_ID.
 *
 * freebusy rather than calendar.readonly: Vezri needs to know when the user is
 * busy, not what they are doing. Reading the titles of someone's whole calendar
 * to schedule around it is more access than the job requires.
 */
export const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.events",
] as const;

export const CALENDAR_SCOPE_STRING = CALENDAR_SCOPES.join(" ");

/** Every Calendar scope is a sensitive scope; sign-in must request none. */
export function isSensitiveScope(scope: string): boolean {
  return scope.startsWith("https://www.googleapis.com/auth/");
}
