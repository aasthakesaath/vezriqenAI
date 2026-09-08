"use client";

import { useEffect, useState } from "react";
import { browserTimeZone, formatWeekdayDate } from "@/lib/time";

/**
 * Today's date, in the reader's day rather than the server's.
 *
 * The server renders `initial`, computed from `profiles.timezone` when the
 * user has one. When they do not, the server has no visitor to ask and would
 * otherwise print the datacentre's date — which for anyone west of UTC is
 * tomorrow for several hours every evening, on the one screen whose whole
 * subject is what day it is.
 *
 * So the correction happens after mount, the same way ReminderPreferences
 * resolves the zone: rendering the browser's zone during SSR would mismatch on
 * hydration, and guessing it on the server is not possible at all.
 */
export default function TodayDate({
  initial,
  /** True when the profile has a stored zone, so the server value is already right. */
  trusted,
  className = "",
}: {
  initial: string;
  trusted: boolean;
  className?: string;
}) {
  const [label, setLabel] = useState(initial);

  useEffect(() => {
    if (trusted) return;
    const zone = browserTimeZone();
    setLabel(formatWeekdayDate(new Date(), zone ?? undefined));
  }, [trusted]);

  return <p className={className}>{label}</p>;
}
