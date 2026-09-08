/**
 * Today / Week / Month, derived from what already exists.
 *
 * No new model and no new columns: a milestone has a target date and a task
 * has a start-by and a deadline, which is enough to answer "what does this
 * week need?". Adding a schedule table to answer a question the data already
 * answers would be inventing state that can then disagree with itself.
 */

import { FALLBACK_TIME_ZONE, addDays, dayKeyIn, toDayKey, type DayKey } from "@/lib/time-zone";

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

const OPEN = new Set(["not_started", "in_progress", "unconfirmed", "partial"]);

/**
 * The last calendar day a view covers, where the user is.
 *
 * Day keys rather than instants throughout: a deadline is a day, and comparing
 * it against a moment made "today" mean "today in UTC" — which after 6 PM in
 * Texas is tomorrow.
 */
function windowEnd(today: DayKey, days: number): DayKey {
  return addDays(today, days);
}

/** The day it is where the user is. */
export function viewToday(options: { now?: Date; timeZone?: string } = {}): DayKey {
  return dayKeyIn(options.now ?? new Date(), options.timeZone ?? FALLBACK_TIME_ZONE);
}

/**
 * Tasks that want attention within `days`.
 *
 * Anything already past its start-by counts as wanted now, not as missed — the
 * screen that lists it says so once at the top rather than per row (§4).
 */
export function tasksWithin(tasks: PlanTask[], today: DayKey, days: number): PlanTask[] {
  const end = windowEnd(today, days);
  const marker = (task: PlanTask) => toDayKey(task.startBy) ?? toDayKey(task.deadline);
  return tasks
    .filter((task) => {
      if (!OPEN.has(task.status)) return false;
      const day = marker(task);
      if (!day) return days >= 28; // undated work only surfaces in the widest view
      return day <= end;
    })
    .sort((a, b) => (marker(a) ?? "9999-12-31").localeCompare(marker(b) ?? "9999-12-31"));
}

/** Milestones whose target date falls within `days`, plus any already passed. */
export function milestonesWithin(
  milestones: PlanMilestone[],
  today: DayKey,
  days: number,
): PlanMilestone[] {
  const end = windowEnd(today, days);
  return milestones
    .filter((m) => m.status !== "done")
    .filter((m) => {
      const day = toDayKey(m.targetDate);
      return day === null || day <= end;
    })
    .sort((a, b) => (toDayKey(a.targetDate) ?? "").localeCompare(toDayKey(b.targetDate) ?? ""));
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
  input: { milestones: PlanMilestone[]; tasks: PlanTask[]; now?: Date; timeZone?: string },
): { milestones: PlanMilestone[]; tasks: PlanTask[] } {
  const today = viewToday(input);
  const days = view === "today" ? 0 : view === "week" ? 7 : 31;
  return {
    milestones: milestonesWithin(input.milestones, today, days),
    tasks: tasksWithin(input.tasks, today, days),
  };
}
