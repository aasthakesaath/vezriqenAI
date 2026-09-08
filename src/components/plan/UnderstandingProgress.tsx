"use client";

import { useEffect, useState } from "react";
import { UNDERSTANDING_STEPS } from "@/lib/app-copy";

/**
 * PRD §5 Step 3 — the short progress state while Vezri reads the plan.
 *
 * The steps advance on a timer rather than from real events: extraction is a
 * single model call, so there are no intermediate milestones to report. The
 * timing is tuned to a typical run and the list stops at the last step rather
 * than looping, so it never claims to have finished when it hasn't.
 */
export default function UnderstandingProgress({ active }: { active: boolean }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!active) return;
    setStep(0);
    const timer = setInterval(() => {
      setStep((current) => Math.min(current + 1, UNDERSTANDING_STEPS.length - 1));
    }, 6000);
    return () => clearInterval(timer);
  }, [active]);

  if (!active) return null;

  return (
    <div className="mt-8 rounded-2xl border border-blush bg-white p-6 shadow-soft">
      <p aria-live="polite" className="sr-only">
        {UNDERSTANDING_STEPS[step]}
      </p>
      <ul className="space-y-3">
        {UNDERSTANDING_STEPS.map((label, index) => {
          const done = index < step;
          const current = index === step;
          return (
            <li key={label} className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className={[
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  done
                    ? "bg-berry text-white"
                    : current
                      ? "bg-blush-light text-berry ring-2 ring-berry"
                      : "bg-blush-wash text-mauve-light",
                ].join(" ")}
              >
                {done ? "✓" : index + 1}
              </span>
              <span className={current || done ? "text-ink" : "text-mauve-light"}>{label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
