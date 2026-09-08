import { addDays, daysBetween, type DayKey } from "@/lib/time-zone";

/**
 * Plans that were written for a start that has already passed (PRD §14).
 *
 * People bring Vezri a plan they are already behind on — that is most of the
 * reason they are here. The old behaviour was to mark every card overdue and
 * say "this should already have started" on all of them, which is both useless
 * and the scolding §4 forbids.
 *
 * What happens instead: the slip is named once, and Vezri offers to spread the
 * work that is past across the time that is actually left. The rules are the
 * same ones §14 already imposes on a replan —
 *
 *   * the target date never moves;
 *   * nothing already scheduled in the future moves, because a date someone
 *     else set (a submission window, a competition deadline) is not Vezri's to
 *     shift;
 *   * nothing is written until the user confirms it (§6, §4.3).
 *
 * Deterministic on purpose. A proposal the user is asked to approve has to be
 * explainable in one sentence and identical every time it is computed.
 */

export type PlannedItem = {
  id: string;
  title: string;
  date: DayKey | null;
  done: boolean;
  /** Set on tasks, so a task can follow the milestone it belongs to. */
  milestoneId?: string | null;
};

export type PastPlanReport = {
  total: number;
  /** Not-done items dated before today. */
  pastCount: number;
  /** Items with no date at all — a reshape cannot place these. */
  undatedCount: number;
  /** The earliest date in the plan, which is what the plan was written around. */
  earliestDate: DayKey | null;
  /** True when there is something worth telling the user about. */
  isBehind: boolean;
};

export function inspectPlanDates(options: {
  items: PlannedItem[];
  today: DayKey;
}): PastPlanReport {
  const { items, today } = options;
  const dated = items.filter((item) => item.date !== null);
  const past = dated.filter((item) => !item.done && item.date! < today);

  return {
    total: items.length,
    pastCount: past.length,
    undatedCount: items.length - dated.length,
    earliestDate: dated.length ? dated.map((i) => i.date!).sort()[0] : null,
    isBehind: past.length > 0,
  };
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * The slip, in one sentence.
 *
 * Named once, at the top — not repeated on every card, which is what turned a
 * plan that slipped into thirty-four small accusations.
 */
export function describePastPlan(report: PastPlanReport, noun = "milestones"): string {
  const single = noun.replace(/s$/, "");
  const started = report.earliestDate
    ? `This plan was written for a start in ${MONTHS[Number(report.earliestDate.slice(5, 7)) - 1]}. `
    : "";
  const count =
    report.pastCount === 1
      ? `1 of ${report.total} ${report.total === 1 ? single : noun} is already past.`
      : `${report.pastCount} of ${report.total} ${noun} are already past.`;
  return `${started}${count}`;
}

export type DateMove = { id: string; title: string; from: DayKey; to: DayKey };

export type ReshapeProposal = {
  /** Unchanged, always. The whole point of the §14 rule. */
  targetDate: DayKey;
  milestoneMoves: DateMove[];
  taskMoves: DateMove[];
  /** Future-dated work left exactly where it was. */
  keptCount: number;
  /** The last day the reshaped work spreads over, for the explanation. */
  spreadUntil: DayKey | null;
};

/**
 * Spreads the past-dated work across the days that are actually left.
 *
 * Even spacing between today and whichever comes first: the next milestone
 * still in the future, or the target date — unless the next future milestone
 * is too close to give the overdue work room, in which case the target date is
 * used and the reshaped items interleave with it. One rule, one sentence, and
 * the same answer every time.
 */
export function proposeReshape(options: {
  milestones: PlannedItem[];
  tasks: PlannedItem[];
  today: DayKey;
  targetDate: DayKey;
}): ReshapeProposal | null {
  const { milestones, tasks, today, targetDate } = options;
  if (targetDate < today) return null;

  const open = milestones.filter((m) => !m.done && m.date !== null);
  const overdue = open.filter((m) => m.date! < today).sort((a, b) => a.date!.localeCompare(b.date!));
  if (overdue.length === 0) return null;

  const future = open.filter((m) => m.date! >= today).map((m) => m.date!).sort();

  const daysToTarget = Math.max(0, daysBetween(today, targetDate));
  const daysToNextFuture = future.length ? Math.max(0, daysBetween(today, future[0])) : Infinity;
  // Room enough for one milestone per day before the next fixed date, or else
  // the whole runway. Never past the target.
  const span = Math.min(
    daysToNextFuture >= overdue.length ? daysToNextFuture : daysToTarget,
    daysToTarget,
  );

  const placement = new Map<string, DayKey>();
  const milestoneMoves: DateMove[] = [];
  overdue.forEach((milestone, index) => {
    const offset = Math.round(((index + 1) * span) / overdue.length);
    const to = addDays(today, offset);
    placement.set(milestone.id, to);
    milestoneMoves.push({ id: milestone.id, title: milestone.title, from: milestone.date!, to });
  });

  // Tasks follow their milestone by the same number of days, so the shape of
  // the work inside a milestone survives. A task whose milestone did not move
  // stays put even if it is overdue on its own — its milestone is the thing
  // that says when the work belongs.
  const shiftFor = new Map<string, number>();
  for (const move of milestoneMoves) {
    shiftFor.set(move.id, daysBetween(move.from, move.to));
  }

  const taskMoves: DateMove[] = [];
  for (const task of tasks) {
    if (task.done || !task.date) continue;
    const shift = task.milestoneId ? shiftFor.get(task.milestoneId) : undefined;
    if (!shift) continue;
    const to = addDays(task.date, shift);
    // Never past the target, whatever the shift works out to.
    taskMoves.push({ id: task.id, title: task.title, from: task.date, to: to > targetDate ? targetDate : to });
  }

  return {
    targetDate,
    milestoneMoves,
    taskMoves,
    keptCount: future.length,
    spreadUntil: milestoneMoves.at(-1)?.to ?? null,
  };
}

/**
 * Rejects any proposal that would move the goalposts.
 *
 * The same rule isSafeReplan enforces for §14, applied here: a reshape that
 * moved the target date would be Vezri quietly deciding the goal was too hard.
 */
export function isSafeReshape(proposal: ReshapeProposal, targetDate: DayKey, today: DayKey): boolean {
  if (proposal.targetDate !== targetDate) return false;
  return [...proposal.milestoneMoves, ...proposal.taskMoves].every(
    (move) => move.to <= targetDate && move.to >= today,
  );
}
