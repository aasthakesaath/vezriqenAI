import { dayKey, daysBetweenDays } from "@/lib/time";

/**
 * The numbers on a goal card.
 *
 * Kept apart from Goal Health on purpose. §15 says health "must be more than
 * percent of tasks completed" and §4.10 that low-value work must not make a
 * goal look healthier than it is — so this file is allowed to count tasks, and
 * only because the card says out loud that counting tasks is all it is doing.
 * Nothing here feeds lib/health/score.ts, and nothing here may be presented as
 * a verdict on whether the goal will be met.
 */

export type GoalTaskLike = {
  status: string;
  deadline: Date | null;
  startBy: Date | null;
};

export type GoalTaskCounts = {
  /** Every task in the plan, done or not. The denominator. */
  total: number;
  done: number;
  /** 0–100, rounded. Tasks complete. Not a likelihood, not a health score. */
  percentComplete: number;
  overdue: number;
  dueThisWeek: number;
};

const OPEN_STATUSES = new Set(["not_started", "in_progress", "unconfirmed", "partial", "not_done"]);

/** How many days ahead "this week" reaches, counting today as day one. */
const WEEK = 6;

export function goalTaskCounts(
  tasks: GoalTaskLike[],
  options: { now?: Date; timeZone?: string } = {},
): GoalTaskCounts {
  const now = options.now ?? new Date();
  const todayKey = dayKey(now, options.timeZone);

  let done = 0;
  let overdue = 0;
  let dueThisWeek = 0;

  for (const task of tasks) {
    if (task.status === "done") {
      done += 1;
      continue;
    }
    if (!OPEN_STATUSES.has(task.status)) continue;

    // The date the task is actually judged against — the same rule Goal
    // Health's schedule factor uses, so a card and a health card cannot
    // disagree about which tasks are late.
    const due = task.deadline ?? task.startBy;
    if (!due) continue;

    const days = daysBetweenDays(todayKey, dayKey(due, options.timeZone));
    if (days < 0) overdue += 1;
    else if (days <= WEEK) dueThisWeek += 1;
  }

  const total = tasks.length;
  return {
    total,
    done,
    percentComplete: total === 0 ? 0 : Math.round((done / total) * 100),
    overdue,
    dueThisWeek,
  };
}
