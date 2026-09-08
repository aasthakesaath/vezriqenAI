import { FALLBACK_TIME_ZONE, hourIn } from "@/lib/time-zone";

/**
 * "Good morning" at 9 PM is a small lie, and it was on the screen every visit.
 *
 * Today greeted everyone with "Good morning" whatever the hour, because there
 * was no clock to consult that belonged to the reader. There is one now.
 */
export function greetingFor(options: { now?: Date; timeZone?: string } = {}): string {
  const hour = hourIn(options.now ?? new Date(), options.timeZone ?? FALLBACK_TIME_ZONE);
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
