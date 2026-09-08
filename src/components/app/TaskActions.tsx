"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type CheckInState =
  | "done"
  | "partial"
  | "not_done"
  | "snoozed"
  | "stuck"
  | "waiting_on_someone";

/**
 * PRD §17 — the actions on a Today card.
 *
 * "Not done" and "I'm stuck" hand off to the Execution Block Coach rather than
 * rescheduling, which is §13's central rule.
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
  const [busy, setBusy] = useState<CheckInState | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
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
          className="rounded-pill border border-blush px-4 py-2 text-sm font-semibold text-berry transition-colors hover:bg-blush-wash disabled:opacity-60"
        >
          Partly
        </button>
        <button
          type="button"
          onClick={() => checkIn("snoozed")}
          disabled={busy !== null}
          className="rounded-pill border border-blush px-4 py-2 text-sm font-semibold text-berry transition-colors hover:bg-blush-wash disabled:opacity-60"
        >
          Snooze
        </button>
        <button
          type="button"
          onClick={() => checkIn("not_done")}
          disabled={busy !== null}
          className="rounded-pill border border-blush px-4 py-2 text-sm font-semibold text-mauve transition-colors hover:bg-blush-wash disabled:opacity-60"
        >
          Not done
        </button>
        <button
          type="button"
          onClick={() => checkIn("stuck")}
          disabled={busy !== null}
          className="rounded-pill border border-blush px-4 py-2 text-sm font-semibold text-mauve transition-colors hover:bg-blush-wash disabled:opacity-60"
        >
          I&rsquo;m stuck
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-berry">
          {error}
        </p>
      )}
    </div>
  );
}
