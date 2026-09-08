import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { loadGoalSnapshot } from "@/lib/health/load";
import GoalsScreen, { type GoalCardView } from "@/components/app/GoalsScreen";
import { goalIconFor } from "@/lib/goal-icons";
import { goalLabel, goalSummary } from "@/lib/goal-label";
import { goalTaskCounts } from "@/lib/plan/goal-progress";
import { formatDayYear } from "@/lib/time";

export const metadata: Metadata = { title: "My Goals", robots: { index: false } };

/**
 * PRD §18 — every active goal in one place.
 *
 * Today stays cross-goal and is not nested under this: with several goals,
 * making someone open each one to find out what today needs is the
 * task-manager experience §4 exists to avoid. This answers a different
 * question — how is each goal doing — and links into the detail.
 *
 * Two numbers appear on every card and they are deliberately not the same
 * number. The ring counts finished tasks and says so. The pill is Goal Health,
 * which §15 computes from eight deterministic factors including critical-path
 * delay, dependencies and capacity, and which §4.10 requires NOT move just
 * because someone ticked off easy work. A goal at 80% of tasks with its one
 * blocking dependency untouched reads "80% of tasks done · At Risk", and both
 * halves of that are true.
 *
 * Works with one goal or with six; nothing here assumes a plural.
 */
export default async function GoalsPage() {
  const now = new Date();
  const supabase = await createClient();

  const [{ data: goals }, { data: profile }] = await Promise.all([
    supabase
      .from("goals")
      .select("id, short_label, normalized_goal, user_goal_text, target_date, status")
      .in("status", ["active", "achieved"])
      .order("created_at", { ascending: true }),
    supabase.from("profiles").select("timezone").maybeSingle(),
  ]);

  const rows = goals ?? [];
  const goalIds = rows.map((goal) => goal.id);
  const timeZone = profile?.timezone ?? undefined;

  // Batched rather than per goal: the counts and the next milestone are one
  // query each for the whole page, not two more per card.
  const [{ data: allTasks }, { data: allMilestones }] = goalIds.length
    ? await Promise.all([
        supabase.from("tasks").select("goal_id, status, deadline, start_by").in("goal_id", goalIds),
        supabase
          .from("milestones")
          .select("goal_id, title, status, target_date, sort_order")
          .in("goal_id", goalIds)
          .order("sort_order", { ascending: true }),
      ])
    : [{ data: [] }, { data: [] }];

  const cards: GoalCardView[] = await Promise.all(
    rows.map(async (goal) => {
      const health = (await loadGoalSnapshot({ supabase, goalId: goal.id, now }))?.health ?? null;

      return {
        id: goal.id,
        label: goalLabel(goal),
        summary: goalSummary(goal),
        icon: goalIconFor(goal),
        health: health?.status ?? null,
        targetDate: goal.target_date ? formatDayYear(goal.target_date, timeZone) : null,
        // The next thing this goal is working towards: earliest unfinished
        // milestone by date, falling back to the plan's own order for the ones
        // extraction gave no date.
        nextMilestone:
          (allMilestones ?? [])
            .filter((m) => m.goal_id === goal.id && m.status !== "done")
            .sort((a, b) => {
              if (a.target_date && b.target_date) return a.target_date < b.target_date ? -1 : 1;
              if (a.target_date) return -1;
              if (b.target_date) return 1;
              return (a.sort_order ?? 0) - (b.sort_order ?? 0);
            })[0]?.title ?? null,
        counts: goalTaskCounts(
          (allTasks ?? [])
            .filter((task) => task.goal_id === goal.id)
            .map((task) => ({
              status: task.status,
              deadline: task.deadline ? new Date(task.deadline) : null,
              startBy: task.start_by ? new Date(task.start_by) : null,
            })),
          { now, timeZone },
        ),
      };
    }),
  );

  return <GoalsScreen goals={cards} />;
}
