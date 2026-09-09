"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/icons/Icon";
import { formatDayKey } from "@/lib/time";
import { goalReviewPath } from "@/lib/routes";

/**
 * Plans Vezri started reading and never finished.
 *
 * Until now these appeared nowhere: My Goals lists confirmed goals, and the
 * goal dashboard sends anything unconfirmed to the review flow. Three of them
 * built up in one evening — thirty-odd milestones and a hundred tasks each,
 * reachable only if you still had the URL.
 *
 * §13's posture is that the user always knows where they stand and always has
 * something to press. Two things to press, here: finish it, which resumes from
 * the pass that never landed and costs one model call rather than the whole
 * document again, or delete it. No third state where it simply sits there.
 */

export type UnfinishedPlanView = {
  goalId: string;
  filename: string;
  pasted: boolean;
  createdAt: string;
  progress: string;
  note: string | null;
};

export default function UnfinishedPlans({ plans }: { plans: UnfinishedPlanView[] }) {
  const router = useRouter();
  const [removing, setRemoving] = useState<string | null>(null);
  const [gone, setGone] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const showing = plans.filter((plan) => !gone.includes(plan.goalId));
  if (showing.length === 0) return null;

  async function remove(goalId: string) {
    setRemoving(goalId);
    setError(null);
    const response = await fetch(`/api/goals/${goalId}`, { method: "DELETE" }).catch(() => null);
    setRemoving(null);

    if (!response?.ok) {
      setError("That didn't delete. Try again.");
      return;
    }
    setGone((previous) => [...previous, goalId]);
    router.refresh();
  }

  return (
    <section aria-labelledby="unfinished-heading" className="mt-10">
      <h2 id="unfinished-heading" className="flex items-center gap-2 text-lg font-semibold text-ink">
        <Icon name="document" className="h-5 w-5 text-berry" />
        {showing.length === 1
          ? "A plan Vezri didn\u2019t finish reading"
          : "Plans Vezri didn\u2019t finish reading"}
      </h2>
      <p className="mt-1.5 text-[0.98rem] text-mauve">
        Nothing here is scheduled or counted. Finishing one picks up where it stopped rather than
        reading the whole document again.
      </p>

      <ul className="mt-4 space-y-3">
        {showing.map((plan) => (
          <li
            key={plan.goalId}
            className="rounded-2xl border border-blush bg-white p-5 shadow-soft"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="min-w-0 font-semibold text-ink">
                {plan.pasted ? "Pasted plan" : plan.filename}
              </p>
              <p className="shrink-0 text-sm text-mauve-light">
                Brought in {formatDayKey(plan.createdAt.slice(0, 10))}
              </p>
            </div>

            <p className="mt-1.5 text-[0.98rem] text-mauve">{plan.progress}</p>
            {plan.note && <p className="mt-1 text-sm text-mauve-light">{plan.note}</p>}

            <div className="mt-4 flex flex-wrap gap-3">
              <Link href={goalReviewPath(plan.goalId)} className="btn-primary">
                Finish reading this plan
              </Link>
              <button
                type="button"
                onClick={() => void remove(plan.goalId)}
                disabled={removing === plan.goalId}
                className="rounded-xl border border-blush px-4 py-2.5 text-sm font-medium text-mauve hover:bg-blush-wash disabled:opacity-60"
              >
                {removing === plan.goalId ? "Deleting…" : "Delete"}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {error && (
        <p role="status" className="mt-3 text-sm text-mauve">
          {error}
        </p>
      )}
    </section>
  );
}
