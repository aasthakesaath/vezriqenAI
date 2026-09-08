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

export type HealthStatus = "on_track" | "needs_attention" | "at_risk" | "off_track" | "achieved";

export type HealthInputs = {
  now: Date;
  targetDate: Date | null;
  activatedAt: Date | null;
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
  /** External dependencies still unresolved past the date they should have started. */
  overdueDependencies: number;
  /** Evidence/deliverables the plan requires, and how many are recorded. */
  evidenceRequired: number;
  evidenceProvided: number;
  /** Minutes of real availability before the target date, when Calendar is connected. */
  availableMinutes: number | null;
};

export type HealthFactor = {
  id: string;
  label: string;
  /** 0-1, where 1 is healthy. */
  value: number;
  weight: number;
  /** Short phrase for the Goal Health card (§15 example layout). */
  summary: string;
};

export type HealthResult = {
  score: number;
  status: HealthStatus;
  factors: HealthFactor[];
  /** The single highest-risk factor, used to lead the recommendation (§15). */
  weakest: HealthFactor | null;
};

const DAY = 24 * 60 * 60 * 1000;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

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
    return {
      id: "milestones",
      label: "Milestones",
      value: 1,
      weight: 0,
      summary: "No milestones yet",
    };
  }

  const done = input.milestones
    .filter((m) => m.status === "done")
    .reduce((sum, m) => sum + m.weight, 0);
  const completion = done / total;

  // How far through the timeline are we?
  let elapsed = 0;
  if (input.activatedAt && input.targetDate) {
    const span = input.targetDate.getTime() - input.activatedAt.getTime();
    elapsed = span > 0 ? clamp01((input.now.getTime() - input.activatedAt.getTime()) / span) : 1;
  }

  // Pace alone is misleading early on: at 9% of the timeline, any completion at
  // all divides out to "perfect", which would let two trivial milestones mask an
  // untouched heavy one — exactly what §4.10 forbids. So pace is only consulted
  // once enough time has passed to mean something, and absolute weighted
  // completion always contributes. That is what keeps weight visible in the
  // score rather than cancelled by the ratio.
  const pace = elapsed < 0.1 ? 1 : clamp01(completion / elapsed);
  const value = clamp01(0.6 * pace + 0.4 * completion);

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
  if (open.length === 0) {
    return { id: "schedule", label: "Schedule", value: 1, weight: 2, summary: "Nothing overdue" };
  }

  let penalty = 0;
  let capacity = 0;
  for (const task of open) {
    const importance = 6 - task.priority; // priority 1 → 5, priority 5 → 1
    capacity += importance;
    const due = task.deadline ?? task.startBy;
    if (due && due.getTime() < input.now.getTime()) {
      const daysLate = Math.floor((input.now.getTime() - due.getTime()) / DAY);
      penalty += importance * Math.min(1, 0.4 + daysLate / 14);
    }
  }

  const value = capacity === 0 ? 1 : clamp01(1 - penalty / capacity);
  const overdue = open.filter((t) => {
    const due = t.deadline ?? t.startBy;
    return due ? due.getTime() < input.now.getTime() : false;
  }).length;

  return {
    id: "schedule",
    label: "Schedule",
    value,
    weight: 2,
    summary: overdue === 0 ? "Nothing overdue" : `${overdue} past their start date`,
  };
}

/** Unresolved external dependencies — §2.4 and §25.B's failure mode. */
function dependencyFactor(input: HealthInputs): HealthFactor {
  if (input.overdueDependencies === 0) {
    return {
      id: "dependencies",
      label: "Dependencies",
      value: 1,
      weight: 2,
      summary: "Nothing waiting on anyone",
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
  const count = input.unansweredCheckpoints.length;
  if (count === 0) {
    return {
      id: "checkpoints",
      label: "Check-ins",
      value: 1,
      weight: 1,
      summary: "All answered",
    };
  }
  const important = input.unansweredCheckpoints.filter((c) => c.priority <= 2).length;
  const value = clamp01(1 - (important * 0.25 + (count - important) * 0.1));
  return {
    id: "checkpoints",
    label: "Check-ins",
    value,
    weight: 1,
    summary: `${count} unanswered`,
  };
}

/** Required effort against real availability. Neutral without Calendar (§11). */
function capacityFactor(input: HealthInputs): HealthFactor {
  const required = input.tasks
    .filter((t) => t.status === "not_started" || t.status === "in_progress")
    .reduce((sum, t) => sum + (t.estimatedMinutes ?? 0), 0);

  if (input.availableMinutes == null || required === 0) {
    return {
      id: "capacity",
      label: "Calendar capacity",
      value: 1,
      weight: 0,
      summary: input.availableMinutes == null ? "Calendar not connected" : "Sufficient",
    };
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
    return { id: "evidence", label: "Evidence", value: 1, weight: 0, summary: "None required" };
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

  const weighted = factors.filter((f) => f.weight > 0);
  const totalWeight = weighted.reduce((sum, f) => sum + f.weight, 0);
  const base =
    totalWeight === 0
      ? 1
      : weighted.reduce((sum, f) => sum + f.value * f.weight, 0) / totalWeight;

  const score = Math.round(clamp01(base * urgencyMultiplier(input)) * 100);

  const allDone =
    input.milestones.length > 0 && input.milestones.every((m) => m.status === "done");

  let status: HealthStatus;
  if (allDone) status = "achieved";
  else if (score >= 80) status = "on_track";
  else if (score >= 60) status = "needs_attention";
  else if (score >= 40) status = "at_risk";
  else status = "off_track";

  const weakest =
    weighted.length === 0
      ? null
      : weighted.reduce((worst, f) => (f.value < worst.value ? f : worst), weighted[0]!);

  return { score, status, factors, weakest };
}
