"use client";

import { useEffect, useRef } from "react";
import { browserTimeZone } from "@/lib/time-zone";

/**
 * Learns the user's timezone from their browser, once.
 *
 * profiles.timezone existed from the first migration and defaulted to 'UTC'.
 * Nothing ever wrote it, so every day boundary in the product was computed on
 * the server's clock: at 8 PM in Texas the app thought it was tomorrow.
 *
 * Two rules make this safe to run on every page:
 *
 *   * it never overwrites a zone the user picked in Settings, which is what
 *     `setByUser` guards — an automatic guess must not beat a deliberate
 *     choice, including for someone who travels;
 *   * it writes only when the browser's zone differs from the stored one, so
 *     the steady state is no request at all.
 *
 * Renders nothing. It is an effect, not a UI.
 */
export default function TimeZoneSync({
  stored,
  setByUser,
}: {
  stored: string;
  setByUser: boolean;
}) {
  const sent = useRef(false);

  useEffect(() => {
    if (setByUser || sent.current) return;
    const detected = browserTimeZone();
    if (!detected || detected === stored) return;

    sent.current = true;
    void fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone: detected }),
    }).catch(() => {
      // A failed capture is not worth interrupting anyone for: the zone falls
      // back to what is stored, and the next page view tries again.
      sent.current = false;
    });
  }, [stored, setByUser]);

  return null;
}
