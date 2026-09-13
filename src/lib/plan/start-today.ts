/**
 * "Start my plan from today."
 *
 * A plan that was written for a start that has already passed is the normal
 * case, not the exception — it is most of the reason someone brings a plan
 * here at all. The Today screen used to open by counting it ("33 things are
 * past the date"), which is a number nobody can act on and a sentence that
 * reads as an accusation however neutrally it is worded.
 *
 * What replaces it is one button, and this is the arithmetic behind it: take
 * the work that is past, and slide all of it forward by the SAME number of
 * days, so that the oldest piece lands on today and everything else keeps its
 * position relative to it.
 *
 * ONE OFFSET, NOT A REDISTRIBUTION. lib/plan/reshape.ts already does the other
 * thing — it spreads past-dated milestones across the runway that is left, and
 * it is the right tool when a whole plan needs re-planning against a target
 * date. This is deliberately simpler and deliberately different: the shape of
 * the plan is the user's, the gaps between the pieces are information (a
 * three-day gap was three days of work), and a uniform shift is the only
 * transform that preserves every one of them. It is also the only one that can
 * be explained in a sentence, which matters for a one-tap action.
 *
 * What it does not do:
 *   * nothing is deleted;
 *   * nothing is marked done;
 *   * nothing whose date is still ahead of today is touched, because a date
 *     someone else set is not Vezri's to move (§14);
 *   * the lead time inside a task — the gap between its start-by day and its
 *     deadline — moves with it rather than being recomputed, so a task that
 *     needed a fortnight's run-up still has one.
 *
 * Pure, and takes the day as an argument. A test can ask what a Tuesday in
 * Chicago looks like without waiting for one.
 */

import { addDays, daysBetween, toDayKey, type DayKey } from "@/lib/time-zone";

export type SlidableTask = {
  id: string;
  /** The due day. A calendar day, never an instant (0008). */
  deadline: string | Date | null;
  /** The day work has to begin. Also a calendar day. */
  startBy: string | Date | null;
};

export type SlideMove = {
  id: string;
  fromDeadline: DayKey | null;
  toDeadline: DayKey | null;
  fromStartBy: DayKey | null;
  toStartBy: DayKey | null;
};

export type SlidePlan = {
  /** How many days everything moved. Always positive. */
  offsetDays: number;
  /** The day the whole thing was anchored on — the oldest one, now today. */
  oldestDay: DayKey;
  moves: SlideMove[];
};

/**
 * The day a task is judged by.
 *
 * The deadline when there is one, because that is the date the user is being
 * held to; the start-by day only when there is no deadline at all. This is
 * what makes the third case below come out right:
 *
 *   deadline passed                    → overdue, and it moves
 *   no deadline, start-by passed       → overdue, and it moves
 *   start-by passed, deadline ahead    → NOT overdue. Nothing about it is due
 *                                        yet, and sliding it would push a
 *                                        deadline that has not arrived.
 */
export function anchorDay(task: SlidableTask): DayKey | null {
  return toDayKey(task.deadline) ?? toDayKey(task.startBy);
}

/** The open work whose own date is already behind today. */
export function overdueTasks<T extends SlidableTask>(tasks: T[], today: DayKey): T[] {
  return tasks.filter((task) => {
    const day = anchorDay(task);
    return day !== null && day < today;
  });
}

/**
 * The moves, or null when there is nothing behind today.
 *
 * Returning null rather than an empty plan is the difference the caller cares
 * about: no plan means the button should not be offered at all.
 */
export function planSlideToToday(options: {
  tasks: SlidableTask[];
  today: DayKey;
}): SlidePlan | null {
  const { tasks, today } = options;

  const behind = overdueTasks(tasks, today);
  if (behind.length === 0) return null;

  const oldestDay = behind
    .map((task) => anchorDay(task)!)
    .reduce((oldest, day) => (day < oldest ? day : oldest));

  const offsetDays = daysBetween(oldestDay, today);
  // daysBetween is positive here by construction — oldestDay is strictly
  // before today — but a zero would mean "move everything by nothing", and
  // writing a no-op to every row is worse than doing nothing at all.
  if (offsetDays <= 0) return null;

  const moves = behind.map((task) => {
    const fromDeadline = toDayKey(task.deadline);
    const fromStartBy = toDayKey(task.startBy);
    return {
      id: task.id,
      fromDeadline,
      toDeadline: fromDeadline ? addDays(fromDeadline, offsetDays) : null,
      fromStartBy,
      toStartBy: fromStartBy ? addDays(fromStartBy, offsetDays) : null,
    };
  });

  return { offsetDays, oldestDay, moves };
}

/**
 * The guard, checked before anything is written.
 *
 * Two properties, and they are the whole contract of the button: nothing lands
 * before today, and the oldest piece of work lands exactly ON today. The
 * second is what "start my plan from today" means — a slide that left the
 * oldest item in the past would be a different, smaller promise.
 */
export function isSafeSlide(plan: SlidePlan, today: DayKey): boolean {
  const landings = plan.moves
    .map((move) => move.toDeadline ?? move.toStartBy)
    .filter((day): day is DayKey => day !== null);

  if (landings.length === 0) return false;
  if (landings.some((day) => day < today)) return false;
  return landings.some((day) => day === today);
}
