"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type CheckInState = "done" | "not_done" | "stuck" | "waiting_on_someone";

/** What each button says while its own request is in flight. */
const LABELS: Record<"done" | "not_done" | "stuck", { idle: string; busy: string }> = {
  done: { idle: "Done", busy: "Saving…" },
  not_done: { idle: "Not done", busy: "Saving…" },
  stuck: { idle: "I’m stuck", busy: "Saving…" },
};

/**
 * PRD §12 and §13 — what a person can say happened.
 *
 * Three buttons, all of them directly tappable at every width. Two of the five
 * that used to be here were cut (owner decision, 2026-09-09) because neither
 * had a consequence:
 *
 *  - "Partly" wrote `partial`, which sat outside both of Goal Health's open
 *    sets. Tapping it on an overdue task removed it from the overdue penalty
 *    and from required effort, so the score ROSE with no record of what was
 *    left — §4.10's failure mode — and nothing anywhere captured the remaining
 *    scope, because no field for it exists.
 *  - "Snooze" was the behaviour §13 exists to replace, and it lost work:
 *    `snoozed` is outside every open set and nothing has ever read
 *    `snooze_until`, so the task left Today and never came back.
 *
 * "More" went with Snooze; it existed to hold it.
 *
 * What stays is the set that reports something true about the work, and both
 * of the states that reach the Execution Block Coach. Every one of them is a
 * real button on the row at 375px — §13's differentiator cannot live behind a
 * disclosure.
 */
export default function TaskActions({
  taskId,
  reminderId,
  onNeedsCoach,
  onRecorded,
}: {
  taskId: string;
  reminderId?: string | null;
  onNeedsCoach: (taskId: string) => void;
  /**
   * A check-in landed and the page is about to refresh.
   *
   * The confirmation belongs to the LIST, not to this row: a completed task
   * leaves the list on refresh, and a message that unmounts with the row it
   * describes is a message nobody reads.
   */
  onRecorded?: (state: CheckInState) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<CheckInState | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function checkIn(state: CheckInState) {
    setBusy(state);
    setError(null);

    let response: Response;
    try {
      response = await fetch(`/api/tasks/${taskId}/checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state, reminder_id: reminderId ?? undefined }),
      });
    } catch {
      // A dropped connection used to reject inside the click handler with
      // nothing catching it: `busy` stayed set, every button on the row stayed
      // disabled for good, and no error was ever shown. The row comes back.
      setError("That didn’t reach Vezri — check your connection and try again.");
      setBusy(null);
      return;
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError(payload.error ?? "Couldn’t save that.");
      setBusy(null);
      return;
    }

    const payload = (await response.json().catch(() => ({}))) as { needs_coach?: boolean };
    setBusy(null);

    // §13 — "not done" and "I'm stuck" open the coach rather than rescheduling.
    // The coach appearing in place of these buttons is the confirmation.
    if (payload.needs_coach) {
      onNeedsCoach(taskId);
      return;
    }

    onRecorded?.(state);
    router.refresh();
  }

  const secondary =
    "rounded-pill border border-blush bg-white px-3.5 py-2 text-sm font-semibold transition-colors hover:bg-blush-wash disabled:opacity-60";

  return (
    <div>
      {/* Wraps on narrow screens; never scrolls sideways, and nothing is
          hidden behind a control at any width. */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => checkIn("done")}
          disabled={busy !== null}
          className="rounded-pill bg-berry px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-berry-deep disabled:opacity-60"
        >
          {busy === "done" ? LABELS.done.busy : LABELS.done.idle}
        </button>
        <button
          type="button"
          onClick={() => checkIn("not_done")}
          disabled={busy !== null}
          className={`${secondary} text-mauve`}
        >
          {busy === "not_done" ? LABELS.not_done.busy : LABELS.not_done.idle}
        </button>
        <button
          type="button"
          onClick={() => checkIn("stuck")}
          disabled={busy !== null}
          className={`${secondary} text-mauve`}
        >
          {busy === "stuck" ? LABELS.stuck.busy : LABELS.stuck.idle}
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
