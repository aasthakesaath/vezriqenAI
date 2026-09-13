"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Icon from "@/components/icons/Icon";

/**
 * One line and one button, where a count used to be (PRD §14, §4.6).
 *
 * The page opened with "33 things are past the date Vezri worked back to.
 * That happens — these are the ones worth picking up first." The second
 * sentence was doing its best, but the number in front of it is the whole
 * problem: 33 is not information a person can act on, it is a measure of how
 * far behind they are, and putting it at the top of the screen every morning
 * is the telling-off §4.6 exists to prevent.
 *
 * So the count is gone and this is what is there instead. The line says what
 * is true about the PLAN — its dates were written for a start that has passed
 * — and never how much of it or how long ago. The button moves the whole run
 * of late work forward as a block, keeping the gaps the plan gave it, so the
 * oldest thing is due today.
 *
 * No confirmation step. /api/goals/[id]/reshape proposes first because a
 * reshape re-spaces work and the user has to see where it lands; this does not
 * re-space anything, the label describes it completely, and any date can be
 * moved back afterwards. A dialog in front of a one-sentence action is
 * friction rather than consent.
 */
export default function StartFromToday() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);

    let response: Response;
    try {
      response = await fetch("/api/tasks/start-from-today", { method: "POST" });
    } catch {
      setError("That didn’t reach Vezri — check your connection and try again.");
      setBusy(false);
      return;
    }

    const payload = (await response.json().catch(() => ({}))) as {
      summary?: string;
      note?: string;
      moved?: number;
      error?: string;
    };

    if (!response.ok) {
      setError(payload.error ?? "Vezri couldn’t move those dates just now.");
      setBusy(false);
      return;
    }

    setBusy(false);
    setDone(payload.summary ?? payload.note ?? "Your plan starts from today.");
    router.refresh();
  }

  if (done) {
    return (
      <p
        role="status"
        className="mt-6 flex items-start gap-2 rounded-2xl border border-blush bg-blush-light px-5 py-4 text-[0.98rem] leading-relaxed text-ink"
      >
        <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-berry" />
        {done}
      </p>
    );
  }

  return (
    <div className="mt-6 rounded-2xl border border-blush bg-blush-light px-5 py-4">
      {/* States a fact about the plan. Not about the person, not a number, and
          nothing about how long anything has been waiting. */}
      <p className="text-[0.98rem] leading-relaxed text-ink">
        Some of this plan was written for dates that have gone by. Vezri can move it forward so it
        starts today, keeping the same gaps between things.
      </p>

      <button
        type="button"
        onClick={() => void start()}
        disabled={busy}
        className="mt-3 rounded-pill bg-berry px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-berry-deep disabled:opacity-60"
      >
        {busy ? "Moving your plan…" : "Start my plan from today"}
      </button>

      <p aria-live="polite" className="sr-only">
        {busy ? "Moving your plan forward" : ""}
      </p>

      {error && (
        <p role="alert" className="mt-2 text-sm text-berry">
          {error}
        </p>
      )}
    </div>
  );
}
