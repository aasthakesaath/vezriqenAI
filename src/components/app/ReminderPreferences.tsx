"use client";

import { useState } from "react";
import { PROFILE_QUESTIONS } from "@/lib/app-copy";
import {
  HOUR_CHOICES,
  MERIDIEMS,
  formatQuietHours,
  joinHour,
  splitHour,
  type Meridiem,
} from "@/lib/time";

/**
 * One bound of the quiet-hours window, picked the way a person says it.
 *
 * An hour and an AM/PM, not a number from 0 to 23. The old control asked
 * someone to work out that "10 at night" is 22 and type it, which is a
 * conversion the product should be doing, not the user.
 */
function HourPicker({
  id,
  label,
  hour24,
  onChange,
}: {
  id: string;
  label: string;
  hour24: number;
  onChange: (next: number) => void;
}) {
  const { hour, meridiem } = splitHour(hour24);
  const select =
    "rounded-xl border border-blush bg-white px-3 py-2 text-sm text-ink focus:border-berry";

  return (
    <span className="inline-flex items-center gap-2">
      <label htmlFor={id} className="text-sm text-mauve">
        {label}
      </label>
      <select
        id={id}
        aria-label={`${label} hour`}
        value={hour}
        onChange={(e) => onChange(joinHour(Number(e.target.value), meridiem))}
        className={select}
      >
        {/* Plain numerals, not "10:00": an option reading "10:00" beside an
            AM/PM select is a clock time with no meridiem, which is the thing
            this whole change exists to remove. The pair reads "10  PM"; the
            sentence above spells the window out in full. */}
        {HOUR_CHOICES.map((choice) => (
          <option key={choice} value={choice}>
            {choice}
          </option>
        ))}
      </select>
      <select
        aria-label={`${label} AM or PM`}
        value={meridiem}
        onChange={(e) => onChange(joinHour(hour, e.target.value as Meridiem))}
        className={select}
      >
        {MERIDIEMS.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </span>
  );
}

/**
 * PRD §10 minimal onboarding, and §3's "user controls for reminder intensity
 * and quiet hours".
 *
 * §10 caps this at three questions and forbids a personality questionnaire —
 * everything else about how the user works is learned from behaviour.
 */
export default function ReminderPreferences({
  reminderStyle,
  accountability,
  productiveWindow,
  quietStart,
  quietEnd,
  emailReminders,
  emailConfigured,
  timeZone,
}: {
  reminderStyle: string;
  accountability: string;
  productiveWindow: string;
  quietStart: number | null;
  quietEnd: number | null;
  emailReminders: boolean;
  /** Whether this deployment can actually send mail. */
  emailConfigured: boolean;
  /**
   * The zone quiet hours are actually enforced in — the one stored on the
   * profile, not the one this browser happens to be set to. Naming the
   * browser's zone here would promise a window the dispatcher does not keep.
   */
  timeZone: string;
}) {
  const [values, setValues] = useState<Record<string, string>>({
    reminder_style: reminderStyle,
    accountability_level: accountability,
    productive_window: productiveWindow,
  });
  const [quiet, setQuiet] = useState({ start: quietStart ?? 22, end: quietEnd ?? 7 });
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [email, setEmail] = useState(emailReminders);

  async function save(next: Record<string, unknown>) {
    setStatus("saving");
    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    setStatus(response.ok ? "saved" : "error");
  }

  return (
    <section
      aria-labelledby="reminders-heading"
      className="rounded-2xl border border-blush bg-white p-6 shadow-soft"
    >
      <h2 id="reminders-heading" className="text-lg font-semibold text-ink">
        Reminders
      </h2>

      <div className="mt-5 space-y-6">
        {PROFILE_QUESTIONS.map((question) => (
          <fieldset key={question.id}>
            <legend className="text-[0.95rem] font-semibold text-ink">{question.question}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {question.options.map((option) => {
                const selected = values[question.id] === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      const next = { ...values, [question.id]: option.id };
                      setValues(next);
                      void save({ [question.id]: option.id });
                    }}
                    className={[
                      "rounded-pill border px-4 py-2 text-sm font-medium transition-colors",
                      selected
                        ? "border-berry bg-blush-light text-berry"
                        : "border-blush bg-white text-mauve hover:bg-blush-wash",
                    ].join(" ")}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}

        <fieldset>
          <legend className="text-[0.95rem] font-semibold text-ink">How reminders reach you</legend>

          <div className="mt-2 flex items-start gap-3 rounded-xl bg-blush-wash px-4 py-3">
            <span
              aria-hidden="true"
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-berry bg-berry text-white"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5l4.5 4.5L19 7" />
              </svg>
            </span>
            <div>
              <p className="text-[0.95rem] font-medium text-ink">
                In the app <span className="font-normal text-mauve">— always on</span>
              </p>
              {/* Not a toggle, because it is not a choice. The reminder row IS
                  the in-app reminder; there is nothing to switch off, and this
                  is what guarantees a reminder always has somewhere to appear. */}
              <p className="mt-0.5 text-sm text-mauve-light">
                Every reminder appears in the bell at the top of the screen. This can&rsquo;t be
                turned off — it&rsquo;s what makes sure nothing is lost.
              </p>
            </div>
          </div>

          <label className="mt-3 flex items-start gap-3 rounded-xl px-4 py-3">
            <input
              type="checkbox"
              checked={email}
              onChange={(e) => {
                setEmail(e.target.checked);
                void save({ email_reminders: e.target.checked });
              }}
              className="mt-0.5 h-5 w-5 shrink-0 rounded-md border-blush text-berry focus:ring-berry"
            />
            <span>
              <span className="text-[0.95rem] font-medium text-ink">Email</span>
              <span className="mt-0.5 block text-sm text-mauve-light">
                For the ones that need an answer.
              </span>
              {!emailConfigured && (
                // The toggle shows the real preference; this says what the
                // system can actually do about it. Softening either one to make
                // the other look consistent would be the dishonest option.
                <span className="mt-2 block rounded-lg bg-cream-light px-3 py-2 text-sm leading-relaxed text-ink">
                  Email delivery isn&rsquo;t switched on in this environment yet, so nothing is
                  being sent by email right now. Your preference is saved and email will start
                  working once it is — you won&rsquo;t need to do anything.
                </span>
              )}
            </span>
          </label>
        </fieldset>

        <fieldset>
          <legend className="text-[0.95rem] font-semibold text-ink">Quiet hours</legend>
          <p className="mt-1 text-sm text-mauve-light">
            Vezri won&rsquo;t email you between{" "}
            <span className="font-medium text-mauve">
              {formatQuietHours(quiet.start, quiet.end, timeZone)}
            </span>
            .
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3">
            <HourPicker
              id="quiet-start"
              label="From"
              hour24={quiet.start}
              onChange={(start) => {
                setQuiet({ ...quiet, start });
                void save({ quiet_hours_start: start });
              }}
            />
            <HourPicker
              id="quiet-end"
              label="to"
              hour24={quiet.end}
              onChange={(end) => {
                setQuiet({ ...quiet, end });
                void save({ quiet_hours_end: end });
              }}
            />
          </div>
        </fieldset>
      </div>

      <p aria-live="polite" className="mt-4 text-sm text-mauve-light">
        {status === "saving" ? "Saving…" : status === "saved" ? "Saved." : status === "error" ? "Couldn't save that." : ""}
      </p>
    </section>
  );
}
