import { OPEN_TASK_STATUSES } from "./task-status";
import { daysBetween, toDayKey, type DayKey } from "@/lib/time-zone";

/**
 * The numbers on a goal card.
 *
 * Kept apart from Goal Health on purpose. §15 says health "must be more than
 * percent of tasks completed" and §4.10 that low-value work must not make a
 * goal look healthier than it is — so this file is allowed to count tasks, and
 * only because the card says out loud that counting tasks is all it is doing.
 * Nothing here feeds lib/health/score.ts, and nothing here may be presented as
 * a verdict on whether the goal will be met.
 *
 * "Overdue" and "due this week" are questions about the reader's calendar, so
 * the day comes in as an argument rather than being read off the server's
 * clock — see lib/time-zone for why that distinction is the whole point.
 */

export type GoalTaskLike = {
  status: string;
  /** A calendar day ("2026-09-08") or a legacy timestamp. Never an instant that matters. */
  deadline: string | Date | null;
  startBy: string | Date | null;
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

// The shared set plus `not_done`: a task the user reported not doing is still
// outstanding work for a progress count, even though the day's list does not
// offer it back to them.
const OPEN_STATUSES = new Set<string>([...OPEN_TASK_STATUSES, "not_done"]);

/** How many days ahead "this week" reaches, counting today as day one. */
const WEEK = 6;

export function goalTaskCounts(tasks: GoalTaskLike[], today: DayKey): GoalTaskCounts {
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
    // Health's schedule factor and the Today list both use, so a card and a
    // health card cannot disagree about which tasks are late.
    const due = toDayKey(task.deadline) ?? toDayKey(task.startBy);
    if (!due) continue;

    const days = daysBetween(today, due);
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
