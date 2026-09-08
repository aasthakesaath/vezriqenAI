"use client";

import { useState } from "react";
import { PROFILE_QUESTIONS } from "@/lib/app-copy";

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
}: {
  reminderStyle: string;
  accountability: string;
  productiveWindow: string;
  quietStart: number | null;
  quietEnd: number | null;
}) {
  const [values, setValues] = useState<Record<string, string>>({
    reminder_style: reminderStyle,
    accountability_level: accountability,
    productive_window: productiveWindow,
  });
  const [quiet, setQuiet] = useState({ start: quietStart ?? 22, end: quietEnd ?? 7 });
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

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
          <legend className="text-[0.95rem] font-semibold text-ink">Quiet hours</legend>
          <p className="mt-1 text-sm text-mauve-light">Vezri won&rsquo;t email you between these.</p>
          <div className="mt-2 flex items-center gap-3">
            <label htmlFor="quiet-start" className="text-sm text-mauve">
              From
            </label>
            <input
              id="quiet-start"
              type="number"
              min={0}
              max={23}
              value={quiet.start}
              onChange={(e) => setQuiet({ ...quiet, start: Number(e.target.value) })}
              onBlur={() => save({ quiet_hours_start: quiet.start })}
              className="w-20 rounded-xl border border-blush px-3 py-2 text-sm text-ink"
            />
            <label htmlFor="quiet-end" className="text-sm text-mauve">
              to
            </label>
            <input
              id="quiet-end"
              type="number"
              min={0}
              max={23}
              value={quiet.end}
              onChange={(e) => setQuiet({ ...quiet, end: Number(e.target.value) })}
              onBlur={() => save({ quiet_hours_end: quiet.end })}
              className="w-20 rounded-xl border border-blush px-3 py-2 text-sm text-ink"
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
