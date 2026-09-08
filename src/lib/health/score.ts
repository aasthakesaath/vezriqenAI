/**
 * Goal Health (PRD §15).
 *
 * "Goal Health must be more than percent of tasks completed." Every factor here
 * is deterministic and the inputs are stored alongside the result, because §15
 * is explicit that "AI may explain the score but should not invent it". The
 * model gets the numbers and writes the sentence; it never picks the number.
 *
 * §4.10 is the other constraint: completing low-value work must not make a goal
 * look healthier than it is. Milestone progress is therefore weighted, and
 * finished tasks contribute nothing on their own.
 */

export type HealthStatus =
  | "on_track"
  | "needs_attention"
  | "at_risk"
  | "off_track"
  | "achieved"
  /** Too few factors have any evidence. No score is computed at all. */
  | "insufficient_data";

export type HealthInputs = {
  now: Date;
  targetDate: Date | null;
  activatedAt: Date | null;
  /**
   * The earliest date the PLAN ITSELF names — its first milestone or start-by.
   *
   * An imported plan does not get a fresh clock. Measuring elapsed time from
   * activation meant a plan written for an August start, uploaded in September,
   * read as 0% through its timeline: every late plan was handed a blank slate
   * on the one factor that measures progress.
   */
  planStart: Date | null;
  milestones: Array<{ weight: number; status: string; targetDate: Date | null }>;
  tasks: Array<{
    status: string;
    priority: number;
    deadline: Date | null;
    startBy: Date | null;
    estimatedMinutes: number | null;
  }>;
  /** Checkpoints that came due and were never answered (§12 `unconfirmed`). */
  unansweredCheckpoints: Array<{ priority: number }>;
  /**
   * Checkpoints that have come due at all, answered or not.
   *
   * The denominator. Zero of these is not a clean record — it is no record,
   * and the factor abstains rather than scoring full marks.
   */
  checkpointsDue: number;
  /** External dependencies still unresolved past the date they should have started. */
  overdueDependencies: number;
  /** External dependencies whose date has passed at all — the denominator, as above. */
  dependenciesDue: number;
  /** Evidence/deliverables the plan requires, and how many are recorded. */
  evidenceRequired: number;
  evidenceProvided: number;
  /** Minutes of real availability before the target date, when Calendar is connected. */
  availableMinutes: number | null;
};

export type HealthFactor = {
  id: string;
  label: string;
  /** 0-1, where 1 is healthy. Meaningless when weight is 0. */
  value: number;
  weight: number;
  /** Short phrase for the Goal Health card (§15 example layout). */
  summary: string;
  /**
   * What would give this factor something to measure.
   *
   * Present only when it has nothing. "Nothing overdue" and "no dated tasks, so
   * nothing CAN be overdue" are different facts and the card has to be able to
   * tell them apart — this is the second one, in the user's terms.
   */
  absent?: string;
};

export type HealthResult = {
  /** Null when there is not enough signal to compute one. Never a stand-in. */
  score: number | null;
  status: HealthStatus;
  factors: HealthFactor[];
  /** Factors that had evidence and voted. */
  counted: HealthFactor[];
  /** Factors that had nothing to measure, with what would give them something. */
  abstained: HealthFactor[];
  /** The single highest-risk factor, used to lead the recommendation (§15). */
  weakest: HealthFactor | null;
};

/**
 * How much evidence a score needs before it is worth showing.
 *
 * TWO conditions, because either alone lets a bad number through:
 *
 *   at least two factors     one factor is not a health score, it is that
 *                            factor. A goal whose only evidence was milestone
 *                            completion read 0/100 "Off track" on the day it
 *                            was created — the score had become a progress bar.
 *
 *   combined weight above 3  milestones alone weigh exactly 3, so this is the
 *                            condition that stops the progress bar dressing
 *                            itself up as a second opinion. Any real pairing
 *                            clears it: milestones + schedule is 5,
 *                            milestones + check-ins is 4, schedule +
 *                            dependencies is 4.
 *
 * Below the line the answer is not a low score. It is no score: the card says
 * what it can see, says plainly that it cannot judge the goal yet, and names
 * what would change that.
 */
export const MIN_COUNTED_FACTORS = 2;
export const MIN_COUNTED_WEIGHT = 4;

const DAY = 24 * 60 * 60 * 1000;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * A factor with nothing to measure.
 *
 * Weight 0, so it is left out of the weighted average entirely — which is what
 * Calendar capacity and Evidence already did correctly and the other four did
 * not. Absence of evidence was being scored as evidence: on a goal started this
 * morning, "nothing overdue" and "nothing waiting on anyone" were worth 50 of
 * the 73 points on the card, and neither meant anything had gone right.
 */
function abstains(
  id: string,
  factorLabel: string,
  summary: string,
  absent: string,
): HealthFactor {
  return { id, label: factorLabel, value: 1, weight: 0, summary, absent };
}

/**
 * How much of the plan's own timeline has gone.
 *
 * From the earliest date the plan names, not from when the user pressed Start.
 * Null when there is nothing to measure against — no target date, or a plan
 * whose first date is still ahead — and callers abstain rather than guess.
 */
export function timelineElapsed(input: HealthInputs): number | null {
  if (!input.targetDate) return null;

  // The earlier of the two: an imported plan's own start when it predates
  // activation, activation for a plan written from today forward.
  const candidates = [input.planStart, input.activatedAt].filter(
    (date): date is Date => date instanceof Date,
  );
  if (candidates.length === 0) return null;
  const start = new Date(Math.min(...candidates.map((d) => d.getTime())));

  const span = input.targetDate.getTime() - start.getTime();
  if (span <= 0) return 1;
  return clamp01((input.now.getTime() - start.getTime()) / span);
}

/**
 * The smallest denominator pace is allowed.
 *
 * The original guard was right about the problem — at 2% elapsed, any
 * completion at all divides out to "perfect" — and wrong about the fix: it
 * awarded pace a free 1.0, which is how a goal with nothing done scored 85 and
 * "On track". Clamping the DENOMINATOR fixes the same problem without paying
 * anyone for time they have not spent: at 0% complete the ratio is 0 however
 * early it is, and a goal that really is ahead still reads ahead.
 *
 * Dropping pace entirely below the threshold was tried first and is worse: it
 * puts a 30-point discontinuity at exactly this line (a goal at 50% complete
 * scores 50 the day before and 80 the day after), and it makes a goal early in
 * a long timeline score BELOW an identical goal late in a short one — which
 * inverts the urgency multiplier it is supposed to work with.
 */
const MEANINGFUL_ELAPSED = 0.1;

function label(value: number): string {
  if (value >= 0.8) return "On track";
  if (value >= 0.6) return "Slightly behind";
  if (value >= 0.4) return "Behind";
  return "Well behind";
}

/**
 * Weighted milestone completion, judged against how much of the timeline has
 * already gone. Being 30% done is healthy at week two and alarming at week ten,
 * so raw completion alone would be misleading.
 */
function milestoneFactor(input: HealthInputs): HealthFactor {
  const total = input.milestones.reduce((sum, m) => sum + m.weight, 0);
  if (total === 0) {
    return abstains(
      "milestones",
      "Milestones",
      "No milestones yet",
      "Vezri hasn't found any milestones in this plan.",
    );
  }

  const done = input.milestones
    .filter((m) => m.status === "done")
    .reduce((sum, m) => sum + m.weight, 0);
  const completion = done / total;

  // Pace still cannot be judged from a sliver of a timeline — at 2% elapsed,
  // any completion at all divides out to "perfect", which would let two trivial
  // milestones mask an untouched heavy one (§4.10). The denominator is clamped
  // rather than the result being handed a free 1.0: nothing done is 0% of the
  // pace it should be, however early in the plan it is.
  //
  // With no target date there is no timeline at all, so pace abstains and the
  // factor reports the completion it can actually see.
  const elapsed = timelineElapsed(input);
  const pace =
    elapsed === null ? null : clamp01(completion / Math.max(elapsed, MEANINGFUL_ELAPSED));
  const value = pace === null ? completion : clamp01(0.6 * pace + 0.4 * completion);

  return {
    id: "milestones",
    label: "Milestones",
    value,
    weight: 3,
    summary: `${Math.round(completion * 100)}% complete · ${label(value)}`,
  };
}

/** Overdue work, weighted so a missed high-priority task hurts more. */
function scheduleFactor(input: HealthInputs): HealthFactor {
  const open = input.tasks.filter(
    (t) => t.status === "not_started" || t.status === "in_progress" || t.status === "unconfirmed",
  );

  // Only DATED work can be late, so only dated work is measured. Dividing the
  // penalty across every open task meant 100 undated tasks diluted the six that
  // had slipped — adding work with no date RAISED the score.
  const dated = open.filter((t) => t.deadline !== null || t.startBy !== null);
  if (dated.length === 0) {
    return abstains(
      "schedule",
      "Schedule",
      open.length === 0 ? "Nothing scheduled yet" : `No dates on any of ${open.length} tasks yet`,
      open.length === 0
        ? "There is no open work to fall behind on."
        : "Give a task a date, and Vezri can tell you whether you are behind.",
    );
  }

  let penalty = 0;
  let capacity = 0;
  let overdue = 0;
  for (const task of dated) {
    const importance = 6 - task.priority; // priority 1 → 5, priority 5 → 1
    capacity += importance;
    // §9: a deadline is not when work begins. Whichever comes first is the
    // date this task was meant to be under way by — reading the deadline and
    // ignoring an earlier start-by hid every task that was late to start.
    const due = earliest(task.startBy, task.deadline);
    if (due && due.getTime() < input.now.getTime()) {
      overdue += 1;
      const daysLate = Math.floor((input.now.getTime() - due.getTime()) / DAY);
      penalty += importance * Math.min(1, 0.4 + daysLate / 14);
    }
  }

  const value = capacity === 0 ? 1 : clamp01(1 - penalty / capacity);

  return {
    id: "schedule",
    label: "Schedule",
    value,
    weight: 2,
    summary:
      overdue === 0
        ? `Nothing overdue of ${dated.length} dated`
        : `${overdue} of ${dated.length} past their start date`,
  };
}

/** The first of two dates that exist, if either does. */
function earliest(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() <= b.getTime() ? a : b;
}

/** Unresolved external dependencies — §2.4 and §25.B's failure mode. */
function dependencyFactor(input: HealthInputs): HealthFactor {
  // Nobody's turn has come yet. That is not a clean record, it is no record.
  if (input.dependenciesDue === 0) {
    return abstains(
      "dependencies",
      "Dependencies",
      "Nobody's turn yet",
      "No work is waiting on another person yet.",
    );
  }
  if (input.overdueDependencies === 0) {
    return {
      id: "dependencies",
      label: "Dependencies",
      value: 1,
      weight: 2,
      summary: `Nothing waiting of ${input.dependenciesDue} due`,
    };
  }
  const value = clamp01(1 - input.overdueDependencies * 0.35);
  return {
    id: "dependencies",
    label: "Dependencies",
    value,
    weight: 2,
    summary: `${input.overdueDependencies} waiting on someone else`,
  };
}

/**
 * Unanswered checkpoints. §12: never assume completion — an unanswered
 * checkpoint is missing information, and on important work that is a risk.
 */
function checkpointFactor(input: HealthInputs): HealthFactor {
  // No checkpoint has come due, so there is nothing to have answered.
  if (input.checkpointsDue === 0) {
    return abstains(
      "checkpoints",
      "Check-ins",
      "None due yet",
      "The first check-in hasn't come due.",
    );
  }

  const count = input.unansweredCheckpoints.length;
  if (count === 0) {
    return {
      id: "checkpoints",
      label: "Check-ins",
      value: 1,
      weight: 1,
      summary: `All ${input.checkpointsDue} answered`,
    };
  }
  const important = input.unansweredCheckpoints.filter((c) => c.priority <= 2).length;
  const value = clamp01(1 - (important * 0.25 + (count - important) * 0.1));
  return {
    id: "checkpoints",
    label: "Check-ins",
    value,
    weight: 1,
    summary: `${count} of ${input.checkpointsDue} unanswered`,
  };
}

/** Required effort against real availability. Neutral without Calendar (§11). */
function capacityFactor(input: HealthInputs): HealthFactor {
  const required = input.tasks
    .filter((t) => t.status === "not_started" || t.status === "in_progress")
    .reduce((sum, t) => sum + (t.estimatedMinutes ?? 0), 0);

  if (input.availableMinutes == null || required === 0) {
    return abstains(
      "capacity",
      "Calendar capacity",
      input.availableMinutes == null ? "Calendar not connected" : "Sufficient",
      input.availableMinutes == null
        ? "Connect your calendar and Vezri can weigh the work against your real time."
        : "There is no remaining effort to weigh.",
    );
  }

  const ratio = input.availableMinutes / required;
  const value = clamp01(ratio);
  return {
    id: "capacity",
    label: "Calendar capacity",
    value,
    weight: 2,
    summary:
      ratio >= 1
        ? "Sufficient"
        : `About ${Math.round(input.availableMinutes / 60)}h available, ${Math.round(required / 60)}h needed`,
  };
}

/** Deliverables the plan says must exist (§16 "required evidence"). */
function evidenceFactor(input: HealthInputs): HealthFactor {
  if (input.evidenceRequired === 0) {
    return abstains(
      "evidence",
      "Evidence",
      "None required",
      "This plan does not name any deliverables to record.",
    );
  }
  const value = clamp01(input.evidenceProvided / input.evidenceRequired);
  return {
    id: "evidence",
    label: "Evidence",
    value,
    weight: 1,
    summary: `${input.evidenceProvided} of ${input.evidenceRequired} recorded`,
  };
}

/** Deadline pressure — the same shortfall matters more as the date closes in. */
function urgencyMultiplier(input: HealthInputs): number {
  if (!input.targetDate) return 1;
  const daysLeft = (input.targetDate.getTime() - input.now.getTime()) / DAY;
  if (daysLeft > 60) return 1;
  if (daysLeft > 21) return 0.97;
  if (daysLeft > 7) return 0.93;
  if (daysLeft >= 0) return 0.88;
  return 0.75; // past the target date
}

export function calculateHealth(input: HealthInputs): HealthResult {
  const factors = [
    milestoneFactor(input),
    scheduleFactor(input),
    dependencyFactor(input),
    checkpointFactor(input),
    capacityFactor(input),
    evidenceFactor(input),
  ];

  const counted = factors.filter((f) => f.weight > 0);
  const abstained = factors.filter((f) => f.weight === 0);
  const totalWeight = counted.reduce((sum, f) => sum + f.weight, 0);

  const weakest =
    counted.length === 0
      ? null
      : counted.reduce((worst, f) => (f.value < worst.value ? f : worst), counted[0]!);

  // Finishing every milestone is decisive on its own, whatever else is missing.
  const allDone =
    input.milestones.length > 0 && input.milestones.every((m) => m.status === "done");
  if (allDone) {
    return { score: 100, status: "achieved", factors, counted, abstained, weakest };
  }

  // NOT ENOUGH TO JUDGE. The old code returned base = 1 here — a goal
  // containing nothing scored 100 and "On track", which is the purest form of
  // the number that should not exist. There is no number to give.
  if (counted.length < MIN_COUNTED_FACTORS || totalWeight < MIN_COUNTED_WEIGHT) {
    return { score: null, status: "insufficient_data", factors, counted, abstained, weakest };
  }

  const base = counted.reduce((sum, f) => sum + f.value * f.weight, 0) / totalWeight;
  const score = Math.round(clamp01(base * urgencyMultiplier(input)) * 100);

  let status: HealthStatus;
  if (score >= 80) status = "on_track";
  else if (score >= 60) status = "needs_attention";
  else if (score >= 40) status = "at_risk";
  else status = "off_track";

  return { score, status, factors, counted, abstained, weakest };
}
