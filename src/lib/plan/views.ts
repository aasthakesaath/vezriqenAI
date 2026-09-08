/**
 * Today / Week / Month, derived from what already exists.
 *
 * No new model and no new columns: a milestone has a target date and a task
 * has a start-by and a deadline, which is enough to answer "what does this
 * week need?". Adding a schedule table to answer a question the data already
 * answers would be inventing state that can then disagree with itself.
 */

export type PlanTask = {
  id: string;
  title: string;
  rationale: string | null;
  status: string;
  milestoneId: string | null;
  startBy: Date | null;
  deadline: Date | null;
  estimatedMinutes: number | null;
  externalPartyName?: string | null;
  /** §7 — provenance travels with the task wherever it is rendered. */
  origin?: "explicit" | "inferred";
  confidence?: number;
};

export type PlanMilestone = {
  id: string;
  title: string;
  status: string;
  targetDate: Date | null;
};

export type PlanView = "today" | "week" | "month";

export const PLAN_VIEWS: readonly { id: PlanView; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
] as const;

export function isPlanView(value: string | undefined): value is PlanView {
  return value === "today" || value === "week" || value === "month";
}

const DAY = 24 * 60 * 60 * 1000;
const OPEN = new Set(["not_started", "in_progress", "unconfirmed", "partial"]);

/** Inclusive window end, in days from now. */
function windowEnd(now: Date, days: number): number {
  return now.getTime() + days * DAY;
}

/**
 * Tasks that want attention within `days`.
 *
 * Anything already past its start-by counts as wanted now, not as missed — the
 * screen that lists it says so once at the top rather than per row (§4).
 */
export function tasksWithin(tasks: PlanTask[], now: Date, days: number): PlanTask[] {
  const end = windowEnd(now, days);
  return tasks
    .filter((task) => {
      if (!OPEN.has(task.status)) return false;
      const marker = task.startBy ?? task.deadline;
      if (!marker) return days >= 28; // undated work only surfaces in the widest view
      return marker.getTime() <= end;
    })
    .sort((a, b) => {
      const left = (a.startBy ?? a.deadline)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const right = (b.startBy ?? b.deadline)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return left - right;
    });
}

/** Milestones whose target date falls within `days`, plus any already passed. */
export function milestonesWithin(
  milestones: PlanMilestone[],
  now: Date,
  days: number,
): PlanMilestone[] {
  const end = windowEnd(now, days);
  return milestones
    .filter((m) => m.status !== "done")
    .filter((m) => !m.targetDate || m.targetDate.getTime() <= end)
    .sort((a, b) => (a.targetDate?.getTime() ?? 0) - (b.targetDate?.getTime() ?? 0));
}

/** How far through a milestone's tasks the user is. */
export function milestoneProgress(
  milestone: PlanMilestone,
  tasks: PlanTask[],
): { done: number; total: number } {
  const owned = tasks.filter((t) => t.milestoneId === milestone.id);
  return { done: owned.filter((t) => t.status === "done").length, total: owned.length };
}

/** The rollup a view needs. Today is 0 days out, week 7, month 31. */
export function planForView(
  view: PlanView,
  input: { milestones: PlanMilestone[]; tasks: PlanTask[]; now?: Date },
): { milestones: PlanMilestone[]; tasks: PlanTask[] } {
  const now = input.now ?? new Date();
  const days = view === "today" ? 0 : view === "week" ? 7 : 31;
  return {
    milestones: milestonesWithin(input.milestones, now, days),
    tasks: tasksWithin(input.tasks, now, days),
  };
}
