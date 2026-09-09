/**
 * What one goal needs from you today (PRD §17, §4.5, §4.6).
 *
 * The cross-goal Today screen answers "what are my three most important moves
 * across everything?" — lib/plan/today.ts, which spreads its three slots over
 * goals so a second goal cannot drift unseen. This module answers a narrower
 * question inside a single goal: which of ITS tasks want attention today, in
 * what order, and what each row should say about itself.
 *
 * Two rules shape everything here.
 *
 * §4.5, "three important things beat 30 tasks": the list is capped at three
 * VISIBLE rows. Not three rows total — the rest are one tap away — because a
 * goal page that hides work is lying, and one that opens with thirty rows is
 * the task manager §4 exists to avoid.
 *
 * §4.6, "no guilt": a badge states a fact and never a reproach. "30 days
 * overdue" is a fact. Styling it as an alarm, or wording it as "you should
 * have done this", is the same fact delivered as a telling-off.
 *
 * Everything below is pure and takes the day as an argument, so a test can ask
 * what a Tuesday in Chicago looks like without waiting for one.
 */

import { OPEN_TASK_STATUSES } from "./task-status";
import { taskContextLine } from "./today";
import { formatDayKey } from "@/lib/time";
import { daysBetween, toDayKey, type DayKey } from "@/lib/time-zone";

/** §4.5 — how many rows are visible before the user asks for more. */
export const VISIBLE_TASKS = 3;

/** Statuses that still want doing. Same set the rest of the planner uses. */
const OPEN = new Set<string>(OPEN_TASK_STATUSES);

export type GoalTaskInput = {
  id: string;
  title: string;
  rationale: string | null;
  taskType: string;
  status: string;
  /** 1 (highest) to 5. Vezri's own priority, never shown as a number (§17). */
  priority: number;
  deadline: string | Date | null;
  startBy: string | Date | null;
  estimatedMinutes: number | null;
  milestoneTitle: string | null;
  /** Set when a task waits on a named person (§13). A name only — §3. */
  waitingOn: string | null;
};

export type UrgencyKind = "overdue" | "due_today" | "start_overdue" | "start_today";

export type Urgency = {
  kind: UrgencyKind;
  /** The badge. A fact, in the user's language, never a score (§17). */
  label: string;
  /** The date beside the actions. "Due 12 Aug", "Due today". */
  dateLabel: string;
  /** Whole days past the date that made this urgent. 0 when it is today. */
  daysLate: number;
};

export type GoalTodayTask = GoalTaskInput & {
  urgency: Urgency;
  /** Why this matters, as a finished sentence. Rendered as-is, never wrapped. */
  reason: string;
  /** Higher is more urgent. Never rendered — §17 forbids a visible score. */
  rank: number;
};

export type TodayCounts = { overdue: number; dueToday: number; startNow: number };

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/**
 * Why this task is on today's list, or null if it is not.
 *
 * Order matters: a passed deadline outranks anything its start-by date says,
 * because the deadline is the fact the user is being held to. Ordinary future
 * work reaches none of these branches and is left for the Week and Month
 * views — §17's "do not default to a giant backlog".
 */
export function urgencyFor(
  task: Pick<GoalTaskInput, "deadline" | "startBy">,
  today: DayKey,
): Urgency | null {
  const deadline = toDayKey(task.deadline);
  const startBy = toDayKey(task.startBy);

  if (deadline) {
    const days = daysBetween(today, deadline);
    if (days < 0) {
      const late = Math.abs(days);
      return {
        kind: "overdue",
        // "30 days overdue" — a fact, and the only place it is said on the
        // row. The row's tone is carried by its styling, which stays
        // informational: §4.6 is about how it feels, not only how it reads.
        label: `${plural(late, "day")} overdue`,
        dateLabel: `Due ${formatDayKey(deadline)}`,
        daysLate: late,
      };
    }
    if (days === 0) {
      return { kind: "due_today", label: "Due today", dateLabel: "Due today", daysLate: 0 };
    }
  }

  if (startBy) {
    const days = daysBetween(today, startBy);
    if (days < 0) {
      return {
        kind: "start_overdue",
        // Not "you should have started this". The date is the fact; the
        // sentence about the person is the thing §4.6 rules out.
        label: "Past its start date",
        dateLabel: `Start by ${formatDayKey(startBy)}`,
        daysLate: Math.abs(days),
      };
    }
    if (days === 0) {
      return {
        kind: "start_today",
        label: "Start today",
        dateLabel: "Start by today",
        daysLate: 0,
      };
    }
  }

  return null;
}

/**
 * How far up the list a task belongs.
 *
 * Deliberately not "most overdue first". §17's own example is that a hard
 * deadline today must be able to outrank an older but low-value slip, so
 * Vezri's priority is worth as much as the urgency band it sits in, and how
 * late something is only tips it within a band.
 *
 * Work that waits on somebody else drops below everything the user can
 * actually do (§13). It stays on the list rather than disappearing — it is
 * still this goal's work, and hiding it is how a dependency is forgotten.
 */
function rankOf(task: GoalTaskInput, urgency: Urgency): number {
  const priority = (6 - Math.min(5, Math.max(1, task.priority))) * 10; // 10 … 50

  let band: number;
  switch (urgency.kind) {
    case "overdue":
      band = 60 + Math.min(30, urgency.daysLate);
      break;
    case "due_today":
      band = 55;
      break;
    case "start_overdue":
      band = 30 + Math.min(15, Math.floor(urgency.daysLate / 2));
      break;
    default:
      band = 20;
  }

  return priority + band - (task.waitingOn ? 120 : 0);
}

/** The date a row is sorted by when two rank the same: earliest first. */
function markerDay(task: GoalTaskInput): string {
  return toDayKey(task.deadline) ?? toDayKey(task.startBy) ?? "9999-12-31";
}

/**
 * Today's list for one goal, in the order it should be read.
 *
 * Returns everything eligible, not the first three: the cap is a rendering
 * decision (VISIBLE_TASKS) and the count line has to be able to say how many
 * there really are.
 */
export function selectGoalToday(
  tasks: GoalTaskInput[],
  today: DayKey,
): { tasks: GoalTodayTask[]; counts: TodayCounts } {
  const chosen: GoalTodayTask[] = [];

  for (const task of tasks) {
    if (!OPEN.has(task.status)) continue;
    const urgency = urgencyFor(task, today);
    if (!urgency) continue;
    chosen.push({
      ...task,
      urgency,
      reason: taskContextLine(task),
      rank: rankOf(task, urgency),
    });
  }

  chosen.sort(
    (a, b) =>
      b.rank - a.rank ||
      markerDay(a).localeCompare(markerDay(b)) ||
      a.title.localeCompare(b.title),
  );

  return {
    tasks: chosen,
    counts: {
      overdue: chosen.filter((t) => t.urgency.kind === "overdue").length,
      dueToday: chosen.filter((t) => t.urgency.kind === "due_today").length,
      startNow: chosen.filter(
        (t) => t.urgency.kind === "start_today" || t.urgency.kind === "start_overdue",
      ).length,
    },
  };
}

/**
 * The count line: "2 overdue · 3 due today".
 *
 * Only the buckets that have something in them, so the line never pads itself
 * out with zeros, and empty when there is nothing at all — the list shows its
 * own empty state rather than a sentence saying nothing happened.
 */
export function summarizeToday(counts: TodayCounts): string {
  const parts = [
    counts.overdue > 0 ? `${counts.overdue} overdue` : null,
    counts.dueToday > 0 ? `${counts.dueToday} due today` : null,
    counts.startNow > 0 ? `${counts.startNow} to start` : null,
  ].filter((part): part is string => part !== null);
  return parts.join(" · ");
}

/* ---------------------------------------------------------------------------
 * The same day's work, grouped by goal, for the cross-goal Today screen.
 *
 * /today and /goals/[id] were built in parallel and each grew its own answer
 * to "is this overdue, and what does the badge say". Two answers is one too
 * many: they disagreed on the wording for a task past its start date, so the
 * same row read "8 days overdue" on one screen and "Past its start date" on
 * the other. Everything below delegates to urgencyFor and selectGoalToday
 * above, so there is one engine, one wording and one order. What is added
 * here is only the grouping and the order the SECTIONS appear in.
 * ------------------------------------------------------------------------- */

export type TodayGoalSection = {
  goalId: string;
  /** Raw naming columns; the page resolves them through lib/goal-label. */
  goalLabel: string | null;
  goalTitle: string;
  tasks: GoalTodayTask[];
  counts: TodayCounts;
  /** "2 overdue · 3 due today" — the section header's status pill. */
  summary: string;
};

/** What a candidate task carries beyond GoalTaskInput when it comes from Today. */
export type CrossGoalTask = GoalTaskInput & {
  goalId: string;
  goalLabel?: string | null;
  goalTitle: string;
};

/**
 * Today's work, split into one section per goal.
 *
 * §4.5's cap of three is applied WITHIN a section by the renderer
 * (VISIBLE_TASKS), not across the screen. Three cards in total was the older
 * reading and it let a second goal with two things a month overdue go
 * unmentioned, which §18 and §15 both care about. Everything eligible is
 * returned so a section can say how many more there are.
 *
 * Sections are ordered by their own first row, using the ranking
 * selectGoalToday already applied inside them. That is what makes the page
 * read in one order: the first row of the first section is the most pressing
 * thing on the screen.
 */
export function selectTodayByGoal(candidates: CrossGoalTask[], today: DayKey): TodayGoalSection[] {
  const byGoal = new Map<string, CrossGoalTask[]>();
  for (const task of candidates) {
    // §13 — work that is not in the user's control keeps its own section on
    // the page rather than taking a slot they cannot act on. selectGoalToday
    // only demotes it, because on a single goal's page it is still that
    // goal's work; across every goal at once it would crowd out work that
    // can actually be done today.
    if (task.waitingOn) continue;
    const existing = byGoal.get(task.goalId);
    if (existing) existing.push(task);
    else byGoal.set(task.goalId, [task]);
  }

  const sections: TodayGoalSection[] = [];
  for (const [goalId, tasks] of byGoal) {
    const { tasks: chosen, counts } = selectGoalToday(tasks, today);
    if (chosen.length === 0) continue;
    sections.push({
      goalId,
      goalLabel: tasks[0]!.goalLabel ?? null,
      goalTitle: tasks[0]!.goalTitle,
      tasks: chosen,
      counts,
      summary: summarizeToday(counts),
    });
  }

  return sections.sort(
    (a, b) =>
      b.tasks[0]!.rank - a.tasks[0]!.rank ||
      b.counts.overdue - a.counts.overdue ||
      b.tasks.length - a.tasks.length,
  );
}
