/**
 * Day boundaries, in the user's timezone.
 *
 * The product is about what to do TODAY, and "today" is a fact about where
 * someone is standing, not about where the server is. Vercel runs in UTC, so
 * every day boundary the app computed was UTC's: at 8 PM Central it was
 * already tomorrow according to the code, and a plan behind by an hour looked
 * behind by a day.
 *
 * The split this module keeps:
 *
 *   INSTANTS  (a reminder's scheduled_at) stay UTC in the database. Only the
 *             moment they are CREATED and the moment they are DISPLAYED care
 *             about a zone.
 *   DAYS      (a deadline, a milestone's target date) are calendar days and
 *             carry no zone at all. They are "YYYY-MM-DD" strings here and
 *             `date` columns in Postgres, so they read the same everywhere.
 *
 * Everything below is pure and zone-explicit. Nothing in it reads a default
 * zone from the environment, because the environment's zone is exactly the
 * thing that was wrong.
 */

/** A calendar day: "2026-09-08". Not an instant, and never a Date. */
export type DayKey = string;

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Intl formatters are expensive to build and are rebuilt per reminder without this. */
const dayFormatters = new Map<string, Intl.DateTimeFormat>();
const partFormatters = new Map<string, Intl.DateTimeFormat>();

export function isValidTimeZone(value: string | null | undefined): value is string {
  if (!value || typeof value !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * The zone to use when the stored one is missing or nonsense.
 *
 * UTC, and deliberately not the server's zone: a wrong answer that is the same
 * everywhere is debuggable, and one that depends on which region the function
 * happened to run in is not.
 */
export const FALLBACK_TIME_ZONE = "UTC";

export function safeTimeZone(value: string | null | undefined): string {
  return isValidTimeZone(value) ? value : FALLBACK_TIME_ZONE;
}

/** Which calendar day an instant falls on, where the user is. */
export function dayKeyIn(instant: Date, timeZone: string): DayKey {
  const zone = safeTimeZone(timeZone);
  let formatter = dayFormatters.get(zone);
  if (!formatter) {
    // en-CA formats as YYYY-MM-DD, which is the shape we want anyway.
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dayFormatters.set(zone, formatter);
  }
  return formatter.format(instant);
}

/**
 * The hour, 0-23, on the user's clock at a given instant.
 *
 * A NUMBER, not a rendered time — this is for deciding things (is it quiet
 * hours, is it morning), never for showing. Every user-visible time in the
 * product is produced by @/lib/time, which is 12-hour with AM/PM.
 */
export function hourIn(instant: Date, timeZone: string): number {
  const parts = zonedParts(instant, timeZone);
  return parts.hour;
}

/** How far the zone is from UTC at a given instant, in milliseconds. */
function offsetMsAt(instant: Date, timeZone: string): number {
  const parts = zonedParts(instant, timeZone);
  const asIfUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asIfUtc - instant.getTime();
}

/** The wall-clock fields a zone shows at an instant, as numbers. */
function zonedParts(instant: Date, timeZone: string) {
  const zone = safeTimeZone(timeZone);
  let formatter = partFormatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partFormatters.set(zone, formatter);
  }

  const parts: Record<string, number> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    // 24 at midnight in some ICU versions under hourCycle h23; normalise.
    hour: parts.hour % 24,
    minute: parts.minute,
    second: parts.second,
  };
}

/**
 * The instant at which a wall clock in `timeZone` reads `day` at `hour:minute`.
 *
 * Two passes, not one: the first guess uses the offset in force at the WRONG
 * instant, which is off by an hour for the two days a year a zone changes. The
 * second pass measures the offset at the corrected instant and lands right.
 */
export function zonedInstant(
  day: DayKey,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const [year, month, date] = day.split("-").map(Number);
  const naive = Date.UTC(year, month - 1, date, hour, minute, 0, 0);
  const firstGuess = new Date(naive - offsetMsAt(new Date(naive), timeZone));
  return new Date(naive - offsetMsAt(firstGuess, timeZone));
}

/** Midnight where the user is, as a UTC instant. */
export function startOfDayIn(instant: Date, timeZone: string): Date {
  return zonedInstant(dayKeyIn(instant, timeZone), 0, 0, timeZone);
}

/** The first instant of the NEXT day, so comparisons stay half-open. */
export function endOfDayIn(instant: Date, timeZone: string): Date {
  return zonedInstant(addDays(dayKeyIn(instant, timeZone), 1), 0, 0, timeZone);
}

/** A calendar day plus or minus whole days. Zone-free by construction. */
export function addDays(day: DayKey, days: number): DayKey {
  const [year, month, date] = day.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, date) + days * MS_PER_DAY);
  return shifted.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: DayKey, to: DayKey): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);
}

/** String order is date order for YYYY-MM-DD, which is why this shape is used. */
export function isBeforeDay(day: DayKey, other: DayKey): boolean {
  return day < other;
}

export function isDayKey(value: unknown): value is DayKey {
  return typeof value === "string" && DAY_KEY.test(value);
}

/**
 * A stored day value as a DayKey.
 *
 * Postgres `date` columns arrive as "2026-09-08" already. Anything that is
 * still a timestamp (older rows, or a column not yet migrated) is read in UTC,
 * which is the zone it was written in — reading it in the user's zone would
 * shift a date that was never an instant in the first place.
 */
export function toDayKey(value: string | Date | null | undefined): DayKey | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  if (isDayKey(value)) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

/** The visitor's own zone, or null on a server render where there is no visitor. */
export function browserTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(zone) ? zone : null;
  } catch {
    return null;
  }
}

/**
 * Every zone the runtime knows, for the Settings picker.
 *
 * A free-text box would let someone type a zone that formats as an error, and
 * a hand-maintained list goes stale; this is the list the same Intl that does
 * the formatting will accept.
 */
export function supportedTimeZones(): string[] {
  const withValues = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
  try {
    return withValues.supportedValuesOf?.("timeZone") ?? [];
  } catch {
    return [];
  }
}
