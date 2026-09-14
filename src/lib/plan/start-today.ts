/**
 * "Start my plan from today."
 *
 * People bring Vezri a plan they are already behind on — that is most of the
 * reason they are here — and the screen answered it with a count: "33 things
 * are past the date Vezri worked back to." A number that large is not
 * information, it is a wall, and §4.6 rules out exactly this kind of opening.
 *
 * The count is gone and this is what replaces it: one button that moves the
 * whole run of late work forward as a block, so the oldest late thing is due
 * today and everything else keeps the same distance from it that the plan gave
 * it. A plan written for three weeks stays a plan for three weeks; it just
 * starts now.
 *
 * How it differs from lib/plan/reshape.ts, which also moves dates:
 *
 *   reshape       one goal, milestone-led, SPREADS overdue work evenly across
 *                 the time left before the target date. It re-shapes the plan
 *                 and needs the user to approve a proposal, because the gaps
 *                 the author chose do not survive it.
 *   start-today   every goal, task-level, one uniform slide. The gaps ARE the
 *                 plan and they are preserved exactly, which is what makes it
 *                 safe enough to be a single button.
 *
 * Everything here is pure and takes the day as an argument. Nothing is
 * deleted, nothing is completed, and no date moves backwards.
 */

import { addDays, daysBetween, toDayKey, type DayKey } from "@/lib/time-zone";
import { isOutstandingTaskStatus } from "./task-status";

export type ShiftableTask = {
  id: string;
  goalId: string;
  title: string;
  status: string;
  /** `tasks.deadline` — a calendar day. */
  deadline: string | Date | null;
  /** `tasks.start_by` — a calendar day. */
  startBy: string | Date | null;
};

/**
 * The day a task is judged by.
 *
 * Deadline first, then start-by. The same precedence lib/plan/goal-today.ts
 * uses for the badge, and for the same reason: a passed deadline is the fact
 * the person is being held to, and a start date only matters while the
 * deadline is still ahead. Two modules disagreeing about which date makes a
 * task late is how the same row came to read "8 days overdue" on one screen
 * and "Past its start date" on another.
 */
export function anchorDay(task: ShiftableTask): DayKey | null {
  return toDayKey(task.deadline) ?? toDayKey(task.startBy);
}

/** Open work whose own date has already passed. */
export function overdueTasks(tasks: ShiftableTask[], today: DayKey): ShiftableTask[] {
  return tasks.filter((task) => {
    // Everything whose work is not over, which is wider than OPEN_TASK_STATUSES
    // on purpose. That set answers "does this belong on today's list", and it
    // excludes `blocked` and `not_done` — both of which are outstanding work
    // carrying a date that has passed, and both of which were therefore left
    // behind by a button whose whole job is to move the plan forward. A plan
    // that starts from today with its stuck items still dated in August has
    // not started from today.
    if (!isOutstandingTaskStatus(task.status)) return false;
    const anchor = anchorDay(task);
    return anchor !== null && anchor < today;
  });
}

export type TaskShift = {
  id: string;
  goalId: string;
  title: string;
  /** Null when the task had no deadline. A start date is not promoted to one. */
  deadline: { from: DayKey; to: DayKey } | null;
  startBy: { from: DayKey; to: DayKey } | null;
};

export type StartTodayPlan = {
  /** Whole days every late task moves forward. Always positive. */
  shiftDays: number;
  /** The oldest date in the late work — the one that becomes today. */
  oldestDay: DayKey;
  moves: TaskShift[];
  /** Goals with at least one moved task, so their reminders can be rebuilt. */
  goalIds: string[];
};

/**
 * Works out the slide.
 *
 * One delta for everything, measured from the oldest late date to today. That
 * single number is the whole design: applying the same shift to every date on
 * every late task is what preserves the gaps, and it is why this needs no
 * approval screen — the answer is the same every time it is computed and it
 * can be described in one sentence on the button that runs it.
 *
 * Work that is not late is not touched. A date someone else set — a submission
 * window, a competition deadline — is not Vezri's to move, and the tasks
 * carrying those dates are the ones still in the future.
 *
 * Returns null when nothing is late, so the caller has one thing to check
 * rather than an empty plan that still looks like a plan.
 */
export function planStartFromToday(options: {
  tasks: ShiftableTask[];
  today: DayKey;
}): StartTodayPlan | null {
  const { tasks, today } = options;

  const late = overdueTasks(tasks, today);
  if (late.length === 0) return null;

  const oldestDay = late
    .map((task) => anchorDay(task)!)
    .reduce((oldest, day) => (day < oldest ? day : oldest));

  const shiftDays = daysBetween(oldestDay, today);
  // anchorDay < today for every task in `late`, so this cannot be zero or
  // negative. Asserted rather than assumed: a zero shift would write every row
  // for no change, and a negative one would move work into the past.
  if (shiftDays <= 0) return null;

  const moves: TaskShift[] = [];
  for (const task of late) {
    const deadline = toDayKey(task.deadline);
    const startBy = toDayKey(task.startBy);

    moves.push({
      id: task.id,
      goalId: task.goalId,
      title: task.title,
      deadline: deadline ? { from: deadline, to: addDays(deadline, shiftDays) } : null,
      // Shifted by the same delta rather than recomputed from the new
      // deadline: lead-time would give a lead the plan never had, and the
      // distance between "start this" and "this is due" is part of the shape
      // being preserved.
      startBy: startBy ? { from: startBy, to: addDays(startBy, shiftDays) } : null,
    });
  }

  return {
    shiftDays,
    oldestDay,
    moves,
    goalIds: [...new Set(moves.map((move) => move.goalId))],
  };
}

/**
 * The rule the write is checked against before it happens.
 *
 * Three things must hold, and each one has a failure it prevents: no date may
 * land before today (the point of the whole operation), every date must move
 * by exactly the shift (a gap that changed means the plan was re-shaped, not
 * slid), and no date may move backwards.
 */
export function isSafeStartToday(plan: StartTodayPlan, today: DayKey): boolean {
  if (plan.shiftDays <= 0) return false;
  return plan.moves.every((move) =>
    [move.deadline, move.startBy].every((change) => {
      if (!change) return true;
      return change.to >= today && daysBetween(change.from, change.to) === plan.shiftDays;
    }),
  );
}

/**
 * What the button says it will do, in one sentence.
 *
 * No count of what is late and no mention of how late it is (§4.6) — the
 * sentence is about the plan moving, not about the person falling behind.
 */
export function describeStartToday(plan: StartTodayPlan): string {
  const tasks = plan.moves.length === 1 ? "1 task" : `${plan.moves.length} tasks`;
  const days = plan.shiftDays === 1 ? "1 day" : `${plan.shiftDays} days`;
  return `${tasks} moved forward ${days}, keeping the same gaps between them.`;
}
