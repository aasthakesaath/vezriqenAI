"use client";

import { useMemo, useState } from "react";
import { browserTimeZone, supportedTimeZones, timeZoneLabelFor } from "@/lib/time-zone-label";

/**
 * The zone every date in the product is resolved against.
 *
 * Captured from the browser at first sign-in and changeable here, because the
 * browser is a good guess and not a fact: someone travelling, on a work laptop
 * set to head-office time, or using a VPN needs to be able to say so — and
 * once they do, the automatic capture stops overriding them (the `chosen` flag
 * below is what tells the server that).
 *
 * Named as a place, never as an offset. "Central Time" means something; "-06:00"
 * means something only to people who already know the answer.
 */
export default function TimeZoneSetting({ timeZone }: { timeZone: string }) {
  const [value, setValue] = useState(timeZone);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const zones = useMemo(() => {
    const all = supportedTimeZones();
    // The stored zone is always offered, even on a runtime whose list is empty
    // or missing it, so the control can never show something other than the
    // setting it claims to edit.
    return all.length ? [...new Set([timeZone, ...all])].sort() : [timeZone];
  }, [timeZone]);

  const detected = browserTimeZone();

  async function save(next: string) {
    setValue(next);
    setStatus("saving");
    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      // `chosen` is the difference between "my browser says so" and "I say so".
      body: JSON.stringify({ timezone: next, timezone_chosen: true }),
    }).catch(() => null);
    setStatus(response?.ok ? "saved" : "error");
  }

  return (
    <section
      aria-labelledby="timezone-heading"
      className="rounded-2xl border border-blush bg-white p-6 shadow-soft"
    >
      <h2 id="timezone-heading" className="scroll-mt-24 text-lg font-semibold text-ink">
        Your time zone
      </h2>
      <p className="mt-1 text-sm text-mauve">
        Everything Vezri calls &ldquo;today&rdquo; — due dates, quiet hours and when reminders
        arrive — is worked out on this clock.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label htmlFor="timezone" className="text-sm font-medium text-ink">
          Time zone
        </label>
        <select
          id="timezone"
          value={value}
          onChange={(event) => void save(event.target.value)}
          className="min-w-0 max-w-full rounded-xl border border-blush bg-white px-3 py-2 text-sm text-ink"
        >
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <span className="text-sm text-mauve">{timeZoneLabelFor(value)}</span>
      </div>

      {detected && detected !== value && (
        <button
          type="button"
          onClick={() => void save(detected)}
          className="mt-3 rounded-xl border border-blush px-3 py-2 text-sm font-medium text-mauve underline decoration-rose underline-offset-2 hover:bg-blush-wash"
        >
          Use {timeZoneLabelFor(detected)}, where this device is
        </button>
      )}

      <p role="status" aria-live="polite" className="mt-3 text-sm text-mauve">
        {status === "saving" && "Saving…"}
        {status === "saved" && "Saved."}
        {status === "error" && "That didn't save. Try again."}
      </p>
    </section>
  );
}
