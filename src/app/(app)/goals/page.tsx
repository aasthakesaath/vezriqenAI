import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadGoalSnapshot } from "@/lib/health/load";
import { VezriPoseImage } from "@/components/VezriWorking";
import { POSE_FOR } from "@/lib/vezri-poses";
import { HEALTH_LABELS } from "@/lib/app-copy";
import { goalLabel } from "@/lib/goal-label";
import { APP_ROUTES, goalPath } from "@/lib/routes";
import { formatDayKey } from "@/lib/time";

export const metadata: Metadata = { title: "My Goals", robots: { index: false } };

/**
 * PRD §18 — every active goal in one place.
 *
 * Today stays cross-goal and is not nested under this: with several goals,
 * making someone open each one to find out what today needs is the
 * task-manager experience §4 exists to avoid. This answers a different
 * question — how is each goal doing — and links into the detail.
 *
 * Works with one goal or with six; nothing here assumes a plural.
 */
export default async function GoalsPage() {
  const supabase = await createClient();

  const { data: goals } = await supabase
    .from("goals")
    .select("id, short_label, normalized_goal, user_goal_text, target_date, status")
    .in("status", ["active", "achieved"])
    .order("created_at", { ascending: true });

  const rows = goals ?? [];
  const snapshots = await Promise.all(
    rows.map(async (goal) => {
      const snapshot = await loadGoalSnapshot({ supabase, goalId: goal.id });
      const [{ data: milestones }, { data: nextTask }] = await Promise.all([
        supabase.from("milestones").select("id, status").eq("goal_id", goal.id),
        supabase
          .from("tasks")
          .select("title")
          .eq("goal_id", goal.id)
          .in("status", ["not_started", "in_progress", "unconfirmed", "partial"])
          .order("priority", { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);
      const all = milestones ?? [];
      return {
        goal,
        health: snapshot?.health ?? null,
        done: all.filter((m) => m.status === "done").length,
        total: all.length,
        nextAction: nextTask?.title ?? null,
      };
    }),
  );

  return (
    <div className="shell max-w-3xl py-12 lg:py-16">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">My Goals</h1>
          <p className="mt-2 text-mauve">Where each one stands, and what it needs next.</p>
        </div>
        <VezriPoseImage
          pose={POSE_FOR.goalHealth}
          alt=""
          className="h-16 w-auto shrink-0 sm:h-24"
        />
      </div>

      {rows.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-blush bg-white p-6 shadow-soft">
          <div className="flex items-center gap-4">
            <VezriPoseImage pose="reading" alt="" className="h-20 w-auto shrink-0" />
            <p className="text-mauve">
              No goals yet. Bring Vezri a plan and it becomes something you can follow.
            </p>
          </div>
          <Link href={APP_ROUTES.start} className="btn-primary mt-5">
            Bring Vezri a plan
          </Link>
        </div>
      ) : (
        <ul className="mt-8 space-y-4">
          {snapshots.map(({ goal, health, done, total, nextAction }) => (
            <li key={goal.id}>
              <Link
                href={goalPath(goal.id)}
                className="block rounded-2xl border border-blush bg-white p-6 shadow-soft transition-colors hover:bg-blush-wash"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  {/* The six-word label, never the SMART statement — that is
                      ~60 words and lives on the detail page. */}
                  <h2 className="text-lg font-semibold text-ink">{goalLabel(goal)}</h2>
                  {health && (
                    <span className="shrink-0 rounded-pill bg-blush-light px-3 py-1 text-sm font-medium text-berry">
                      {HEALTH_LABELS[health.status]}
                    </span>
                  )}
                </div>

                {nextAction && (
                  <p className="mt-2 text-[0.98rem] text-mauve">
                    <span className="font-medium text-ink">Next:</span> {nextAction}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-mauve-light">
                  {total > 0 && (
                    <span>
                      {done} of {total} milestones complete
                    </span>
                  )}
                  {goal.target_date && <span>By {formatDayKey(goal.target_date)}</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
