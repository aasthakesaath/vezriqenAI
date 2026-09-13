"use client";

import { useState } from "react";
import Icon from "@/components/icons/Icon";

/**
 * "How do I actually do this?"
 *
 * A task card offered Done, Not done and I'm stuck, and never said what doing
 * the thing would involve. The only route to help ran through failure: you had
 * to not do something before the product would help you do it.
 *
 * The steps arrive from /api/tasks/[id]/guidance on the first expand and are
 * cached in the database by task, so the second expand — and tomorrow's, and
 * next week's — is a row read rather than a model call. Nothing is fetched
 * until someone asks: three cards on a screen must not be three model calls
 * on page load.
 *
 * TICKS ARE LOCAL AND SAY SO. A ticked step is a scratchpad for the ten
 * minutes someone is inside the task, not a report about the work — the report
 * is the Done button, which is the one thing that writes a check-in. Keeping
 * ticks in localStorage rather than the database is what stops the card
 * growing a second, quieter completion state that Goal Health cannot see.
 */

export type GuidanceStep = { text: string; minutes: number };

const STORAGE_KEY = "vezriqen.today.steps";

function readTicks(taskId: string): number[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return [];
    const value = (parsed as Record<string, unknown>)[taskId];
    return Array.isArray(value) ? value.filter((n): n is number => typeof n === "number") : [];
  } catch {
    // Private mode, a quota, a hand-edited value. A step that will not
    // remember being ticked is still a step you can read.
    return [];
  }
}

function writeTicks(taskId: string, ticked: number[]) {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    const all = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...all, [taskId]: ticked }));
  } catch {
    // Not being able to remember is not a reason to refuse the tick.
  }
}

export default function TaskGuidance({ taskId }: { taskId: string }) {
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState<GuidanceStep[] | null>(null);
  const [ticked, setTicked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);

  const panelId = `steps-${taskId}`;

  async function load() {
    setBusy(true);
    setError(null);

    let response: Response;
    try {
      response = await fetch(`/api/tasks/${taskId}/guidance`, { method: "POST" });
    } catch {
      setError({
        message: "That didn’t reach Vezri — check your connection.",
        retryable: true,
      });
      setBusy(false);
      return;
    }

    // Defensive on purpose: the body is model output that has been through a
    // schema on the server, and the one thing that must not happen here is a
    // render crash inside a task row. Anything that is not the shape we expect
    // becomes an inline retry.
    const payload = (await response.json().catch(() => null)) as
      | { steps?: unknown; error?: string; retryable?: boolean }
      | null;

    if (!response.ok || !payload) {
      setError({
        message: payload?.error ?? "Vezri couldn’t write the steps for this one.",
        retryable: payload?.retryable !== false,
      });
      setBusy(false);
      return;
    }

    const parsed = Array.isArray(payload.steps)
      ? payload.steps.filter(
          (step): step is GuidanceStep =>
            !!step &&
            typeof step === "object" &&
            typeof (step as GuidanceStep).text === "string" &&
            (step as GuidanceStep).text.trim().length > 0,
        )
      : [];

    if (parsed.length === 0) {
      setError({ message: "Vezri couldn’t write the steps for this one.", retryable: true });
      setBusy(false);
      return;
    }

    setSteps(parsed);
    setTicked(readTicks(taskId));
    setBusy(false);
  }

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    // Fetched once per mount, and once ever per task on the server.
    if (next && steps === null && !busy) void load();
  }

  function toggleStep(index: number) {
    const next = ticked.includes(index)
      ? ticked.filter((i) => i !== index)
      : [...ticked, index];
    setTicked(next);
    writeTicks(taskId, next);
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={toggleOpen}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex items-center gap-1.5 rounded-pill px-1 py-1 text-sm font-semibold text-berry hover:underline"
      >
        <Icon name="list" className="h-4 w-4" />
        {open ? "Hide the steps" : "Show me how"}
        <span className={open ? "rotate-180" : ""}>
          <Icon name="chevronDown" className="h-4 w-4" />
        </span>
      </button>

      <div id={panelId} hidden={!open} className="mt-2">
        {busy && (
          <p role="status" className="rounded-xl bg-blush-wash px-4 py-3 text-sm text-mauve">
            Working out the steps…
          </p>
        )}

        {error && !busy && (
          <div role="alert" className="rounded-xl bg-blush-wash px-4 py-3">
            <p className="text-sm text-ink">{error.message}</p>
            {/* An inline retry, never a crash. And no retry offered when
                retrying cannot help — a button that is guaranteed to fail is a
                worse answer than the sentence above it. */}
            {error.retryable && (
              <button
                type="button"
                onClick={() => void load()}
                className="mt-2 text-sm font-semibold text-berry hover:underline"
              >
                Try again
              </button>
            )}
          </div>
        )}

        {steps && !busy && !error && (
          <ol className="space-y-1.5">
            {steps.map((step, index) => {
              const id = `${panelId}-${index}`;
              const done = ticked.includes(index);
              return (
                <li key={id} className="flex items-start gap-2.5 rounded-xl bg-blush-wash px-3 py-2.5">
                  <input
                    id={id}
                    type="checkbox"
                    checked={done}
                    onChange={() => toggleStep(index)}
                    className="mt-1 h-4 w-4 shrink-0 accent-berry"
                  />
                  <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer text-sm leading-relaxed">
                    {/* Numbered in the text rather than by the list marker: a
                        ticked step gets a line through it, and a number that
                        stays upright beside struck-through text reads as a
                        step that is still waiting. */}
                    <span className="font-semibold text-mauve">{index + 1}.</span>{" "}
                    <span className={done ? "text-mauve-light line-through" : "text-ink"}>
                      {step.text}
                    </span>
                    {typeof step.minutes === "number" && step.minutes > 0 && (
                      <span className="ml-1.5 whitespace-nowrap text-mauve-light">
                        ~{step.minutes} min
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
