"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/icons/Icon";

/**
 * The steps, inside an expanded task card (PRD §13).
 *
 * A card offered Done, Not done and I'm stuck and never said how to do the
 * thing. This is what the expansion shows: three to five steps, each one
 * startable now, numbered and tickable.
 *
 * The ticks are LOCAL. They are a working aid for the next twenty minutes —
 * "I've done the first two" — not a record of progress, and the task's own
 * status is what says whether the work happened. Persisting them server-side
 * would create a second, quieter definition of "done" alongside the check-in,
 * and §12 has one.
 */

export type GuidanceStepView = {
  action: string;
  minutes: number;
  /** "LinkedIn: Me › View Profile › the pencil beside your name", or null. */
  where: string | null;
};

const STORAGE_KEY = "vezriqen.guidance.ticked";

function readTicked(taskId: string): number[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return [];
    const forTask = (parsed as Record<string, unknown>)[taskId];
    if (!Array.isArray(forTask)) return [];
    return forTask.filter((value): value is number => typeof value === "number");
  } catch {
    // Private mode, a quota, a hand-edited value. Untickable is not unusable.
    return [];
  }
}

function writeTicked(taskId: string, ticked: number[]): void {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    const all = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...all, [taskId]: ticked }));
  } catch {
    // Not being able to remember a tick is not a reason to refuse one.
  }
}

export default function TaskGuidance({ taskId }: { taskId: string }) {
  const [steps, setSteps] = useState<GuidanceStepView[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** False for a failure nothing on this side can fix — no key, not a blip. */
  const [retryable, setRetryable] = useState(true);
  const [ticked, setTicked] = useState<number[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    let response: Response;
    try {
      response = await fetch(`/api/tasks/${taskId}/guidance`, { method: "POST" });
    } catch {
      // A dropped connection rejects inside the handler; without this the
      // panel spins for good.
      setError("That didn’t reach Vezri — check your connection and try again.");
      setRetryable(true);
      setLoading(false);
      return;
    }

    const payload = (await response.json().catch(() => ({}))) as {
      steps?: GuidanceStepView[];
      error?: string;
      retryable?: boolean;
    };

    if (!response.ok || !Array.isArray(payload.steps)) {
      // §0.6 — a bad response shows a retry, never a crash and never a blank
      // panel that looks like "there is nothing to say about this task".
      setError(payload.error ?? "Vezri couldn’t write the steps just now.");
      setRetryable(payload.retryable !== false);
      setLoading(false);
      return;
    }

    setSteps(payload.steps);
    setLoading(false);
  }, [taskId]);

  useEffect(() => {
    setTicked(readTicked(taskId));
    void load();
  }, [taskId, load]);

  function toggle(index: number) {
    setTicked((current) => {
      const next = current.includes(index)
        ? current.filter((value) => value !== index)
        : [...current, index];
      writeTicked(taskId, next);
      return next;
    });
  }

  if (loading) {
    return (
      <p role="status" className="rounded-xl bg-blush-wash px-4 py-3 text-sm text-mauve">
        Working out the steps…
      </p>
    );
  }

  if (error) {
    return (
      <div role="alert" className="rounded-xl border border-blush bg-blush-wash px-4 py-3">
        <p className="text-sm text-ink">{error}</p>
        {retryable && (
          <button
            type="button"
            onClick={() => void load()}
            className="mt-2 rounded-pill border border-blush bg-white px-3.5 py-1.5 text-sm font-semibold text-berry transition-colors hover:bg-blush-light"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  if (!steps || steps.length === 0) return null;

  return (
    <div className="rounded-xl border border-blush bg-blush-wash p-4 sm:p-5">
      <h5 className="text-sm font-semibold text-ink">How to do this</h5>

      {/* An ordered list, so the numbers are the list's own and a screen
          reader announces "3 of 5" rather than reading a digit off a span. */}
      <ol className="mt-3 space-y-2.5">
        {steps.map((step, index) => {
          const done = ticked.includes(index);
          const inputId = `step-${taskId}-${index}`;
          return (
            <li key={inputId} className="flex gap-3">
              <span
                aria-hidden="true"
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-berry"
              >
                {index + 1}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-start gap-2.5">
                  <input
                    id={inputId}
                    type="checkbox"
                    checked={done}
                    onChange={() => toggle(index)}
                    className="mt-1 h-4 w-4 shrink-0 rounded border-blush text-berry"
                  />
                  <label
                    htmlFor={inputId}
                    className={`text-[0.95rem] leading-relaxed ${
                      done ? "text-mauve-light line-through" : "text-ink"
                    }`}
                  >
                    {step.action}
                  </label>
                </span>

                <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 pl-[1.625rem] text-sm text-mauve-light">
                  <span className="flex items-center gap-1">
                    <Icon name="clock" className="h-3.5 w-3.5" />~{step.minutes} min
                  </span>
                  {step.where && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="min-w-0">{step.where}</span>
                    </>
                  )}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
