import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  EXTRACTION_LEDGER_COLUMNS,
  PASS_TARGET,
  isRunDead,
  progressFromGoal,
  type ExtractionState,
} from "./extraction-state";

/**
 * Plans Vezri started reading and never finished.
 *
 * My Goals lists active goals only, and the goal dashboard redirects anything
 * unconfirmed to the review flow — so a goal whose extraction stopped partway
 * appears on no screen at all. Three of them accumulated in one evening, each
 * carrying thirty-odd milestones and a hundred tasks, reachable only by URL.
 *
 * That is the §13 posture failing in the quietest possible way: the user is
 * not told they are stuck, and has nothing to press. Extraction is resumable
 * now, so finishing one costs a single model call — but only if there is
 * somewhere to press "finish".
 */

export type UnfinishedPlan = {
  goalId: string;
  filename: string;
  pasted: boolean;
  createdAt: string;
  milestoneCount: number;
  taskCount: number;
  state: ExtractionState;
  /** True when a run was killed rather than finishing — inferred, not recorded. */
  stopped: boolean;
  /** What Vezri already got out of the document, in the user's terms. */
  progress: string;
  /** Why it is worth finishing rather than starting again. */
  note: string | null;
};

/**
 * How far it got, said in work rather than in passes.
 *
 * "Vezri read 35 milestones and 154 steps" is something the user recognises
 * from their own document. "2 of 3 passes complete" is not.
 */
export function describeUnfinished(options: {
  milestoneCount: number;
  taskCount: number;
  hasTarget: boolean;
}): string {
  const { milestoneCount, taskCount, hasTarget } = options;

  if (milestoneCount === 0 && taskCount === 0) {
    return "Vezri hasn't read any of this plan yet.";
  }

  const milestones = milestoneCount === 1 ? "1 milestone" : `${milestoneCount} milestones`;
  const steps = taskCount === 1 ? "1 step" : `${taskCount} steps`;
  const read = taskCount > 0 ? `${milestones} and ${steps}` : milestones;

  return hasTarget
    ? `Vezri read ${read} and wrote your target, but never finished.`
    : `Vezri read ${read}, then stopped before writing your target.`;
}

export async function loadUnfinishedPlans(options: {
  supabase: SupabaseClient;
}): Promise<UnfinishedPlan[]> {
  const { supabase } = options;

  // Anything not yet confirmed. `achieved` and `active` have their own screens;
  // everything else is either mid-review or abandoned, and both need a way out.
  const { data: goals } = await supabase
    .from("goals")
    .select(`id, created_at, normalized_goal, status, ${EXTRACTION_LEDGER_COLUMNS}`)
    .not("status", "in", "(active,achieved)")
    .order("created_at", { ascending: false });

  const rows = goals ?? [];
  if (rows.length === 0) return [];

  const goalIds = rows.map((goal) => goal.id);
  const [{ data: documents }, { data: milestones }, { data: tasks }] = await Promise.all([
    supabase.from("plan_documents").select("goal_id, filename, source_kind").in("goal_id", goalIds),
    supabase.from("milestones").select("goal_id").in("goal_id", goalIds),
    supabase.from("tasks").select("goal_id").in("goal_id", goalIds),
  ]);

  const countBy = (list: Array<{ goal_id: string }> | null) => {
    const counts = new Map<string, number>();
    for (const row of list ?? []) counts.set(row.goal_id, (counts.get(row.goal_id) ?? 0) + 1);
    return counts;
  };
  const milestoneCounts = countBy(milestones);
  const taskCounts = countBy(tasks);
  const documentFor = new Map((documents ?? []).map((d) => [d.goal_id, d]));

  return rows.flatMap((goal) => {
    const document = documentFor.get(goal.id);
    // A goal with no document at all is a bare goal the user typed and never
    // pursued. There is nothing to finish reading, so it is not listed here.
    if (!document) return [];

    const milestoneCount = milestoneCounts.get(goal.id) ?? 0;
    const taskCount = taskCounts.get(goal.id) ?? 0;
    // The ledger lives on the goal since 0010 — it used to be on the document,
    // where a goal-only goal had nowhere to write it.
    const progress = progressFromGoal(goal.id, goal as unknown as Record<string, unknown>);

    return [
      {
        goalId: goal.id,
        filename: document.filename,
        pasted: document.source_kind === "paste",
        createdAt: goal.created_at as string,
        milestoneCount,
        taskCount,
        state: progress.state,
        // A run the platform killed cannot say so itself; the reader decides.
        stopped: isRunDead(progress),
        progress: describeUnfinished({
          milestoneCount,
          taskCount,
          hasTarget: Boolean(goal.normalized_goal) || progress.passes[PASS_TARGET] === true,
        }),
        note: progress.note,
      },
    ];
  });
}
