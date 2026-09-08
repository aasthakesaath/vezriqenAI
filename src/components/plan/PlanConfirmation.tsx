"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import ProvenanceBadge from "./ProvenanceBadge";
import { APP_ROUTES } from "@/lib/routes";

export type PlanMilestone = {
  id: string;
  title: string;
  target_date: string | null;
  status: string;
  origin: "explicit" | "inferred";
  confidence: number;
  excerpt: string | null;
};

export type PlanTask = {
  id: string;
  title: string;
  rationale: string | null;
  task_type: string;
  deadline: string | null;
  start_by: string | null;
  start_by_reason: string | null;
  priority: number;
  estimated_minutes: number | null;
  origin: "explicit" | "inferred";
  confidence: number;
  excerpt: string | null;
  external_party: string | null;
};

function shortDate(value: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * PRD §5 Step 6 — milestones, immediate priorities, major deadlines,
 * dependencies and proposed start-by dates, then Start Goal.
 *
 * Nothing here is scheduled yet: §4.3 puts the user in control, so the button
 * is the moment reminders come into existence.
 */
export default function PlanConfirmation({
  goalId,
  milestones,
  tasks,
}: {
  goalId: string;
  milestones: PlanMilestone[];
  tasks: PlanTask[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // §5 Step 6 shows "immediate priorities", not the whole backlog.
  const immediate = [...tasks]
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      const aWhen = a.start_by ?? a.deadline ?? "9999";
      const bWhen = b.start_by ?? b.deadline ?? "9999";
      return aWhen.localeCompare(bWhen);
    })
    .slice(0, 6);

  const dependencies = tasks.filter((t) => t.external_party);

  async function startGoal() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/goals/${goalId}/activate`, { method: "POST" });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError(payload.error ?? "Couldn't start that goal.");
      setBusy(false);
      return;
    }
    router.push(APP_ROUTES.today);
  }

  return (
    <div className="mt-8 space-y-8">
      {milestones.length > 0 && (
        <section aria-labelledby="milestones-heading">
          <h2 id="milestones-heading" className="text-lg font-semibold text-ink">
            Milestones
          </h2>
          <ul className="mt-3 space-y-2">
            {milestones.map((milestone) => (
              <li
                key={milestone.id}
                className="rounded-xl border border-blush bg-white px-5 py-4 shadow-soft"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <span className="font-medium text-ink">{milestone.title}</span>
                  <ProvenanceBadge
                    origin={milestone.origin}
                    confidence={milestone.confidence}
                    excerpt={milestone.excerpt}
                  />
                </div>
                {milestone.target_date && (
                  <p className="mt-1 text-sm text-mauve">By {shortDate(milestone.target_date)}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {immediate.length > 0 && (
        <section aria-labelledby="priorities-heading">
          <h2 id="priorities-heading" className="text-lg font-semibold text-ink">
            What happens first
          </h2>
          <ul className="mt-3 space-y-2">
            {immediate.map((task) => (
              <li
                key={task.id}
                className="rounded-xl border border-blush bg-white px-5 py-4 shadow-soft"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <span className="font-medium text-ink">{task.title}</span>
                  <ProvenanceBadge
                    origin={task.origin}
                    confidence={task.confidence}
                    excerpt={task.excerpt}
                  />
                </div>
                {task.rationale && <p className="mt-1 text-sm text-mauve">{task.rationale}</p>}

                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-mauve">
                  {task.start_by && <span>Start by {shortDate(task.start_by)}</span>}
                  {task.deadline && <span>Due {shortDate(task.deadline)}</span>}
                  {task.estimated_minutes && <span>~{task.estimated_minutes} min</span>}
                </div>

                {/* §4.8 — explain the important decisions in one sentence. */}
                {task.start_by_reason && (
                  <p className="mt-2 text-sm italic leading-relaxed text-mauve-light">
                    {task.start_by_reason}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {dependencies.length > 0 && (
        <section aria-labelledby="dependencies-heading">
          <h2 id="dependencies-heading" className="text-lg font-semibold text-ink">
            People this depends on
          </h2>
          <ul className="mt-3 space-y-2">
            {dependencies.map((task) => (
              <li key={task.id} className="rounded-xl bg-blush-wash px-5 py-4">
                <span className="font-medium text-ink">{task.external_party}</span>
                <p className="mt-0.5 text-sm text-mauve">{task.title}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-cream-light px-4 py-3 text-sm text-ink">
          {error}
        </p>
      )}

      <div className="border-t border-blush pt-6">
        <button type="button" onClick={startGoal} disabled={busy} className="btn-primary disabled:opacity-60">
          {busy ? "Starting…" : "Start Goal"}
        </button>
        <p className="mt-3 text-sm text-mauve-light">
          Nothing is scheduled until you start. You can change any of this later.
        </p>
      </div>
    </div>
  );
}
