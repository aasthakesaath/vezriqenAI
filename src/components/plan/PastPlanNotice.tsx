"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDayKey } from "@/lib/time";

/**
 * A plan that arrived already behind (PRD §14).
 *
 * People bring Vezri a plan they are late on — that is most of the reason they
 * are here. The old behaviour was to mark every card overdue and print "this
 * should already have started" thirty-four times, which is both useless and
 * the scolding §4 forbids.
 *
 * So: the slip is named once, plainly; the offer is to spread the work that is
 * past across the time actually left; the target date does not move; and
 * nothing is written until the user says yes (§6, §4.3). "Keep my dates" is a
 * real answer, not a dismissal — a plan someone is deliberately behind on is
 * still their plan.
 */

type Move = { id: string; title: string; from: string; to: string };

type Proposal = {
  targetDate: string;
  milestoneMoves: Move[];
  taskMoves: Move[];
  keptCount: number;
  spreadUntil: string | null;
};

export default function PastPlanNotice({
  goalId,
  summary,
}: {
  goalId: string;
  /** "This plan was written for a start in August. 6 of 34 milestones are already past." */
  summary: string;
}) {
  const router = useRouter();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "applying" | "kept" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function call(confirm: boolean) {
    setState(confirm ? "applying" : "loading");
    setError(null);
    const response = await fetch(`/api/goals/${goalId}/reshape`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm }),
    }).catch(() => null);

    const payload = await response?.json().catch(() => null);

    if (!response?.ok) {
      setError(payload?.error ?? "Vezri couldn't work that out just now. Try again.");
      setState("error");
      return;
    }

    if (confirm) {
      router.refresh();
      return;
    }

    setProposal(payload?.proposal ?? null);
    setExplanation(payload?.explanation ?? null);
    setState("idle");
  }

  if (state === "kept") return null;

  return (
    <section
      aria-labelledby="past-plan-heading"
      className="mt-6 rounded-2xl border border-blush bg-white p-6 shadow-soft"
    >
      <h2 id="past-plan-heading" className="text-lg font-semibold text-ink">
        Some of this plan is already behind you
      </h2>
      <p className="mt-2 text-mauve">{summary}</p>
      <p className="mt-2 text-mauve">
        Vezri can spread that work across the time you have left, without moving your target date.
        Nothing changes until you say so.
      </p>

      {explanation && <p className="mt-3 font-medium text-ink">{explanation}</p>}

      {proposal && proposal.milestoneMoves.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <caption className="sr-only">Proposed new dates</caption>
            <thead>
              <tr className="text-mauve-light">
                <th scope="col" className="py-1 pr-4 font-medium">Milestone</th>
                <th scope="col" className="py-1 pr-4 font-medium">Was</th>
                <th scope="col" className="py-1 font-medium">Becomes</th>
              </tr>
            </thead>
            <tbody>
              {proposal.milestoneMoves.map((move) => (
                <tr key={move.id} className="border-t border-blush/60">
                  <td className="py-2 pr-4 text-ink">{move.title}</td>
                  <td className="py-2 pr-4 text-mauve-light line-through">
                    {formatDayKey(move.from)}
                  </td>
                  <td className="py-2 font-medium text-ink">{formatDayKey(move.to)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        {!proposal ? (
          <button
            type="button"
            onClick={() => void call(false)}
            disabled={state === "loading"}
            className="rounded-xl bg-rose px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {state === "loading" ? "Working it out…" : "Show me what would change"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void call(true)}
            disabled={state === "applying"}
            className="rounded-xl bg-rose px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {state === "applying" ? "Updating your plan…" : "Use these dates"}
          </button>
        )}

        <button
          type="button"
          onClick={() => setState("kept")}
          className="rounded-xl border border-blush px-4 py-2.5 text-sm font-medium text-mauve hover:bg-blush-wash"
        >
          Keep my dates
        </button>
      </div>

      {error && (
        <p role="status" className="mt-3 text-sm text-mauve">
          {error}
        </p>
      )}
    </section>
  );
}
