"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * The one line and the one button that replaced the overdue count.
 *
 * The screen used to open with "33 things are past the date Vezri worked back
 * to. That happens — these are the ones worth picking up first." Everything
 * about that sentence is a dead end: the number is not actionable, it grows
 * with how badly the week went, and the only thing it invites is closing the
 * tab.
 *
 * What is here instead says what the button will do and nothing about how late
 * anything is. The offer is the whole message — a plan written for a start
 * that has passed is the normal case, and moving it is a one-tap answer.
 *
 * Deliberately NOT a confirmation dialog. The button names the action, the
 * action is one sentence long, and every date it writes is recorded with what
 * it was based on (lib/plan/start-today, and the route's ai_action_logs row),
 * so "why is this due today?" stays answerable afterwards.
 */
export default function StartFromToday() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moved, setMoved] = useState<number | null>(null);

  async function startFromToday() {
    setBusy(true);
    setError(null);

    let response: Response;
    try {
      response = await fetch("/api/tasks/start-today", { method: "POST" });
    } catch {
      // A dropped connection must not leave the button disabled for good.
      setError("That didn’t reach Vezri — check your connection and try again.");
      setBusy(false);
      return;
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError(payload.error ?? "Couldn’t move your plan just now.");
      setBusy(false);
      return;
    }

    const payload = (await response.json().catch(() => ({}))) as { moved?: number };
    setMoved(payload.moved ?? 0);
    setBusy(false);
    router.refresh();
  }

  if (moved !== null) {
    return (
      <p
        role="status"
        className="mt-6 rounded-2xl border border-blush bg-blush-light px-5 py-4 text-[0.98rem] leading-relaxed text-ink"
      >
        {moved > 0
          ? `Done — your plan now starts today. ${moved === 1 ? "One task kept" : `${moved} tasks kept`} the same order and the same spacing.`
          : "Nothing needed moving — your plan already starts today."}
      </p>
    );
  }

  return (
    <div className="mt-6 rounded-2xl border border-blush bg-blush-light px-5 py-4">
      {/* One line. It describes the offer, not the backlog: no count, and
          nothing about how long anything has been sitting (§4.6). */}
      <p className="text-[0.98rem] leading-relaxed text-ink">
        Your plan was written to start earlier than today. Vezri can move the open work
        forward, keeping the same order and the same gaps.
      </p>

      <button
        type="button"
        onClick={startFromToday}
        disabled={busy}
        className="btn-primary mt-4"
      >
        {busy ? "Moving your plan…" : "Start my plan from today"}
      </button>

      {/* Polite, not assertive: this is not an interruption. */}
      <p aria-live="polite" className="sr-only">
        {busy ? "Moving your plan" : ""}
      </p>

      {error && (
        <p role="alert" className="mt-3 text-sm text-berry">
          {error}
        </p>
      )}
    </div>
  );
}
