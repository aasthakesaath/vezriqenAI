"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

export type CheckInState =
  | "done"
  | "partial"
  | "not_done"
  | "snoozed"
  | "stuck"
  | "waiting_on_someone";

/**
 * PRD §12 and §13 — what a person can say happened.
 *
 * The mockup this screen was rebuilt from offers Start / Done / I'm stuck /
 * Edit. Three of those four are a different product:
 *
 *  - dropping "Not done" removes the Execution Block Coach. §13 makes it the
 *    core differentiator, and `not_done` is one of the two states the check-in
 *    API answers `needs_coach` for. A row that cannot say "not done" cannot
 *    reach the coach, so the feature would be gone rather than moved.
 *  - dropping "Partly" removes §12's partial completion, which is a distinct
 *    fact about the work and not a rounding of done or not done.
 *  - "Start" is a fifth state nothing records. It would write nothing, teach
 *    the execution profile nothing, and change nothing on the screen.
 *
 * So: Done, Partly, Not done, I'm stuck at the top level, and Snooze behind a
 * secondary control — it is the one response that reports nothing about the
 * work, so it is the one that can afford a tap. "I'm stuck" is never behind
 * that control at any width, for the same reason "Not done" is not dropped.
 */
export default function TaskActions({
  taskId,
  reminderId,
  onNeedsCoach,
}: {
  taskId: string;
  reminderId?: string | null;
  onNeedsCoach: (taskId: string) => void;
}) {
  const router = useRouter();
  const id = useId();
  const [busy, setBusy] = useState<CheckInState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  async function checkIn(state: CheckInState) {
    setBusy(state);
    setError(null);
    const response = await fetch(`/api/tasks/${taskId}/checkin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        state,
        reminder_id: reminderId ?? undefined,
        snooze_until:
          state === "snoozed"
            ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            : undefined,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError(payload.error ?? "Couldn't save that.");
      setBusy(null);
      return;
    }

    const payload = (await response.json()) as { needs_coach?: boolean };
    setBusy(null);
    if (payload.needs_coach) {
      onNeedsCoach(taskId);
      return;
    }
    router.refresh();
  }

  const secondary =
    "rounded-pill border border-blush bg-white px-3.5 py-2 text-sm font-semibold transition-colors hover:bg-blush-wash disabled:opacity-60";

  return (
    <div>
      {/* Wraps on narrow screens; never scrolls sideways. All four stay
          tappable at 375px — the row reflows to two lines rather than hiding
          the one that opens the coach. */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => checkIn("done")}
          disabled={busy !== null}
          className="rounded-pill bg-berry px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-berry-deep disabled:opacity-60"
        >
          {busy === "done" ? "Saving…" : "Done"}
        </button>
        <button
          type="button"
          onClick={() => checkIn("partial")}
          disabled={busy !== null}
          className={`${secondary} text-berry`}
        >
          Partly
        </button>
        <button
          type="button"
          onClick={() => checkIn("not_done")}
          disabled={busy !== null}
          className={`${secondary} text-mauve`}
        >
          Not done
        </button>
        <button
          type="button"
          onClick={() => checkIn("stuck")}
          disabled={busy !== null}
          className={`${secondary} text-mauve`}
        >
          I&rsquo;m stuck
        </button>

        {/* Not a three-dot menu: three dots promise an unknown list. This says
            how many more there are by opening one visible button. */}
        <button
          type="button"
          aria-expanded={moreOpen}
          aria-controls={`${id}-more`}
          onClick={() => setMoreOpen((value) => !value)}
          className="rounded-pill px-2.5 py-2 text-sm font-medium text-mauve-light underline-offset-2 transition-colors hover:text-berry hover:underline"
        >
          {moreOpen ? "Fewer options" : "More"}
        </button>
      </div>

      <div id={`${id}-more`} hidden={!moreOpen} className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => checkIn("snoozed")}
          disabled={busy !== null}
          className={`${secondary} text-mauve`}
        >
          Snooze a day
        </button>
      </div>

      {/* Polite, not assertive: saving is not an interruption. */}
      <p aria-live="polite" className="sr-only">
        {busy ? "Saving your check-in" : ""}
      </p>

      {error && (
        <p role="alert" className="mt-2 text-sm text-berry">
          {error}
        </p>
      )}
    </div>
  );
}
