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

export { browserTimeZone } from "./time-zone";

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

/**
 * A calendar day, as words. "1 Oct"
 *
 * Days are not instants and must never be moved by a timezone. A deadline of
 * "2026-10-01" read as midnight UTC and then formatted in Central Time reads
 * as 30 September — a whole day earlier than the plan says. So day-valued
 * fields (a deadline, a start-by date, a milestone's target) come through
 * here, and only genuine moments (when a reminder is sent) take a zone.
 */
export function formatDayKey(day: string | null | undefined): string {
  if (!day) return "";
  const [year, month, date] = day.slice(0, 10).split("-").map(Number);
  if (!year || !month || !date) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, date)));
}

/**
 * A calendar day, with the year. "31 Dec 2026"
 *
 * Separate from formatDayKey because most dates in the product are days away
 * and the year is noise on them. A goal's target date is the exception: it is
 * routinely a year or more out, and "31 Dec" beside a two-year plan does not
 * say which December.
 */
export function formatDayKeyYear(day: string | null | undefined): string {
  if (!day) return "";
  const [year, month, date] = day.slice(0, 10).split("-").map(Number);
  if (!year || !month || !date) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, date)));
}

/** The same, with room for the weekday. "Thursday, 1 October" */
export function formatLongDayKey(day: string | null | undefined): string {
  if (!day) return "";
  const [year, month, date] = day.slice(0, 10).split("-").map(Number);
  if (!year || !month || !date) return "";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, date)));
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
 * The date heading on Today. "Tuesday, 8 Sept 2026"
 *
 * A DayKey formatter like formatDayKey and formatDayKeyYear beside it, not a
 * Date one: the day has already been resolved in the reader's zone by
 * lib/time-zone, and re-deriving it from an instant here is how it drifts back
 * onto the server's clock.
 *
 * en-GB with the rest of the product rather than the mockup's "Sep 9, 2025" —
 * a screen that says "Tuesday, Sep 9" above a row that says "Due 10 Aug" is
 * two date conventions in one viewport. formatLongDayKey is the same date
 * without a year, which is the wrong trade here: the heading is the one place
 * the reader is told what day it actually is.
 */
export function formatWeekdayDayKey(day: string | null | undefined): string {
  if (!day) return "";
  const [year, month, date] = day.slice(0, 10).split("-").map(Number);
  if (!year || !month || !date) return "";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, date)));
}
