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

  const secondary =
    "rounded-pill border border-blush bg-white px-4 py-2 text-sm font-semibold transition-colors hover:bg-blush-wash disabled:opacity-60";

  return (
    <div className="mt-4">
      {/* Not five equal choices. Done is the primary and sits alone; the rest
          are a quieter group. "I'm stuck" stays a directly tappable button at
          every width and is never behind a menu — §13 makes it the most
          important interaction in the product, and burying it would remove the
          feature rather than tidy it. Wraps on narrow screens; never scrolls
          sideways. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <button
          type="button"
          onClick={() => checkIn("done")}
          disabled={busy !== null}
          className="rounded-pill bg-berry px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-berry-deep disabled:opacity-60"
        >
          {busy === "done" ? "Saving…" : "Done"}
        </button>

        <span aria-hidden="true" className="hidden h-6 w-px bg-blush sm:block" />

        <button type="button" onClick={() => checkIn("partial")} disabled={busy !== null} className={`${secondary} text-berry`}>
          Partly
        </button>
        <button type="button" onClick={() => checkIn("snoozed")} disabled={busy !== null} className={`${secondary} text-berry`}>
          Snooze
        </button>
        <button type="button" onClick={() => checkIn("not_done")} disabled={busy !== null} className={`${secondary} text-mauve`}>
          Not done
        </button>
        <button type="button" onClick={() => checkIn("stuck")} disabled={busy !== null} className={`${secondary} text-mauve`}>
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
