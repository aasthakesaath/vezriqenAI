/**
 * Time formatting. The ONE place the product turns a time into words.
 *
 * Every user-visible time is 12-hour with AM/PM. No screen formats a time
 * itself — tests/time-format.test.ts fails the build if a rendered string ever
 * contains a bare 24-hour clock, which is what stops a future screen quietly
 * reintroducing "22:00".
 *
 * Storage is unaffected: hours stay 0–23 in the database and timestamps stay
 * ISO. Only display and input are 12-hour.
 */

/**
 * Pinned to en-US, deliberately, rather than the visitor's locale.
 *
 * The requirement is 12-hour everywhere, and a browser set to en-GB formats
 * `hour12: true`… correctly, but a locale left to its own devices (de-DE,
 * fr-FR, en-GB with hourCycle h23) formats 24-hour. Honouring the visitor's
 * locale would therefore break the rule for exactly the people it is hardest
 * to notice for. This is a product decision, not an oversight.
 */
const LOCALE = "en-US";

export type Meridiem = "AM" | "PM";

/** Hours as they appear in the picker: 12, 1, 2 … 11. */
export const HOUR_CHOICES = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
export const MERIDIEMS: readonly Meridiem[] = ["AM", "PM"] as const;

/** 0–23 → the pair a person actually picks. 22 → { hour: 10, meridiem: "PM" } */
export function splitHour(hour24: number): { hour: number; meridiem: Meridiem } {
  const h = ((Math.trunc(hour24) % 24) + 24) % 24;
  const meridiem: Meridiem = h < 12 ? "AM" : "PM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return { hour, meridiem };
}

/** The inverse. { hour: 10, meridiem: "PM" } → 22 */
export function joinHour(hour: number, meridiem: Meridiem): number {
  const base = hour % 12;
  return meridiem === "PM" ? base + 12 : base;
}

/** A whole hour, 0–23, as a clock time. 22 → "10:00 PM", 7 → "7:00 AM" */
export function formatHour(hour24: number): string {
  const { hour, meridiem } = splitHour(hour24);
  return `${hour}:00 ${meridiem}`;
}

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

/** A moment as a time of day. "9:15 AM" */
export function formatTime(value: Date | string | number, timeZone?: string): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(LOCALE, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

/** A moment as a short date. "8 Sep" */
export function formatDay(value: Date | string | number, timeZone?: string): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

/** Date and time together. "8 Sep, 9:15 AM" */
export function formatDayTime(value: Date | string | number, timeZone?: string): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${formatDay(date, timeZone)}, ${formatTime(date, timeZone)}`;
}

/** A longer date for email, where there is room. "Tuesday, 8 September" */
export function formatLongDay(value: Date | string | number, timeZone?: string): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

/** True for anything that reads as an offset rather than a place. */
function looksLikeOffset(label: string | undefined): boolean {
  return !label || /^(GMT|UTC)\s*[+-]/i.test(label) || /^[+-]\d/.test(label);
}

/**
 * A timezone as a person would say it: "Central Time", not "UTC-6".
 *
 * An offset is meaningless to most people and changes twice a year; the
 * generic name does not, which is why it is the one shown. Three steps down:
 * the generic name, then the specific one, then the IANA city — because a few
 * zones (Etc/UTC among them) have no name but an offset, and an offset is
 * exactly what must not be shown.
 */
export function timeZoneLabel(timeZone: string): string {
  const named = (style: "longGeneric" | "long") => {
    try {
      return new Intl.DateTimeFormat(LOCALE, { timeZone, timeZoneName: style })
        .formatToParts(new Date())
        .find((part) => part.type === "timeZoneName")?.value;
    } catch {
      return undefined;
    }
  };

  const generic = named("longGeneric");
  if (!looksLikeOffset(generic)) return generic!;

  const specific = named("long");
  if (!looksLikeOffset(specific)) return specific!;

  // "Asia/Kolkata" → "Kolkata". Better than an offset, and always available.
  const city = timeZone.split("/").pop()?.replace(/_/g, " ");
  return city && city !== timeZone ? `${city} time` : timeZone;
}

/** The visitor's zone, or null on a server render where there is no visitor. */
export function browserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/**
 * The quiet-hours window in words.
 *
 * The timezone is part of the sentence rather than a footnote: a window
 * without one does not say anything — "no email between 10 PM and 7 AM" is a
 * promise that only means something once you know whose clock it is on.
 */
export function formatQuietHours(
  startHour: number,
  endHour: number,
  timeZone?: string | null,
): string {
  const window = `${formatHour(startHour)} to ${formatHour(endHour)}`;
  return timeZone ? `${window}, ${timeZoneLabel(timeZone)}` : window;
}

/**
 * A calendar day in a given zone, as "YYYY-MM-DD".
 *
 * The unit Today actually reasons in. "Overdue" and "due today" are questions
 * about the DAY a moment falls on for the person reading the screen, not about
 * elapsed milliseconds: a task due at 11pm is not "due tomorrow" for someone
 * six hours east, and subtracting timestamps says it is. en-CA because it is
 * the one common locale that formats ISO order natively.
 */
export function dayKey(value: Date | string | number, timeZone?: string): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

/**
 * Whole days from one day key to another. Positive when `to` is later.
 *
 * Parsed as UTC midnights deliberately: both sides are already resolved to a
 * calendar day, so this is date arithmetic and never crosses a DST boundary.
 */
export function daysBetweenDays(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.round((end - start) / 86_400_000);
}

/**
 * The date heading on Today. "Tuesday, 9 Sep 2026"
 *
 * en-GB with the rest of the product's dates rather than the mockup's
 * "Sep 9, 2025": a screen that says "Tuesday, Sep 9" above a row that says
 * "Due 10 Aug" is two date conventions in one viewport. The weekday and the
 * year are the parts the heading adds.
 */
export function formatWeekdayDate(value: Date | string | number, timeZone?: string): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

/** A date that always carries its year. "31 Dec 2026" */
export function formatDayYear(value: Date | string | number, timeZone?: string): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

/**
 * A due date, carrying the year only when it is not the current one.
 *
 * Today can show work that slipped past a year boundary, where "10 Aug" is
 * genuinely ambiguous. Everything inside the current year stays short.
 */
export function formatDueDate(
  value: Date | string | number,
  options: { now?: Date; timeZone?: string } = {},
): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "";
  const { now = new Date(), timeZone } = options;
  const sameYear = dayKey(date, timeZone).slice(0, 4) === dayKey(now, timeZone).slice(0, 4);
  return sameYear ? formatDay(date, timeZone) : formatDayYear(date, timeZone);
}
