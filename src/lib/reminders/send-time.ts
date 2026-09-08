import { addDays, zonedInstant, type DayKey } from "@/lib/time-zone";

/**
 * When a reminder actually lands, on the user's clock.
 *
 * A start-by date is a DAY. Turning it into a moment used to be implicit — the
 * date string parsed as midnight UTC — so a reminder for "start on 12 October"
 * arrived at 7 PM on the 11th in Texas, which reads as the wrong day and is
 * also the middle of the evening. The day and the time of day are now two
 * separate decisions, and both are made in the user's zone.
 */

export type ProductiveWindow = "morning" | "afternoon" | "evening" | "varies";

export type LocalTime = { hour: number; minute: number };

/**
 * The hour a reminder aims for, from the user's stated productive window (§10).
 *
 * "varies" gets 9 AM: early enough to act on the same day, late enough not to
 * be the first thing on a phone at dawn.
 */
export const WINDOW_TIME: Record<ProductiveWindow, LocalTime> = {
  morning: { hour: 8, minute: 0 },
  afternoon: { hour: 13, minute: 0 },
  evening: { hour: 18, minute: 0 },
  varies: { hour: 9, minute: 0 },
};

/** True when `hour` falls inside a quiet window, which may wrap midnight. */
export function isQuietHour(hour: number, start: number | null, end: number | null): boolean {
  if (start === null || end === null || start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

export type QuietShift = { time: LocalTime; nextDay: boolean };

/**
 * Moves a time out of quiet hours, to the moment they end.
 *
 * Deferred rather than dropped: a reminder inside someone's quiet hours is
 * still a reminder they asked for. §12's promise is about not pinging at
 * night, not about losing the nudge.
 */
export function applyQuietHours(
  time: LocalTime,
  start: number | null,
  end: number | null,
): QuietShift {
  if (!isQuietHour(time.hour, start, end)) return { time, nextDay: false };
  // A window that wraps midnight (10 PM to 7 AM) ends on the following day for
  // anything scheduled in the evening, and on the same day for the small hours.
  const wraps = start !== null && end !== null && start > end;
  return { time: { hour: end!, minute: 0 }, nextDay: wraps && time.hour >= start! };
}

/**
 * The UTC instant at which a reminder for `day` should be delivered.
 *
 * Stored as UTC, chosen in the user's zone — the split the whole date fix
 * rests on.
 */
export function reminderInstant(options: {
  day: DayKey;
  time: LocalTime;
  timeZone: string;
  quietStart?: number | null;
  quietEnd?: number | null;
}): Date {
  const { day, time, timeZone } = options;
  const shifted = applyQuietHours(time, options.quietStart ?? null, options.quietEnd ?? null);
  const onDay = shifted.nextDay ? addDays(day, 1) : day;
  return zonedInstant(onDay, shifted.time.hour, shifted.time.minute, timeZone);
}
