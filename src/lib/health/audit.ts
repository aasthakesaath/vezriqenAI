import { z } from "zod";

/**
 * "What am I missing?" (PRD §16).
 *
 * The section's hardest requirement is the last line: "This feature must
 * distinguish missing requirements from merely unfinished tasks." An overdue
 * task is not a gap — the user can already see it on Today. A gap is something
 * the plan needs that has no representation at all: a deliverable with nothing
 * producing it, a milestone with no work under it, a dependency nobody is
 * chasing, a success measure that cannot be evaluated.
 *
 * Detection is deterministic for exactly that reason. The model ranks and
 * phrases; it does not decide what counts as missing.
 */

export type GapCategory =
  | "missing_target_date"
  | "missing_success_measure"
  | "milestone_without_work"
  | "unchased_dependency"
  | "missing_evidence"
  | "unanswered_checkpoint"
  | "unresolved_block"
  | "insufficient_capacity";

export type Gap = {
  category: GapCategory;
  title: string;
  /** Why this matters, in the user's terms. */
  matters: string;
  /** Higher runs first. Consequence, not urgency. */
  severity: number;
};

export type AuditInputs = {
  now: Date;
  targetDate: Date | null;
  successMeasures: string[];
  milestones: Array<{ id: string; title: string; status: string; taskCount: number }>;
  dependencies: Array<{
    externalParty: string | null;
    taskTitle: string;
    resolved: boolean;
    /** Whether any task exists that chases this person. */
    hasFollowUp: boolean;
    startBy: Date | null;
  }>;
  evidenceRequired: string[];
  evidenceProvided: string[];
  unansweredCheckpoints: Array<{ taskTitle: string; priority: number; dueAt: Date }>;
  unresolvedBlocks: Array<{ taskTitle: string; category: string }>;
  requiredMinutes: number;
  availableMinutes: number | null;
};

/**
 * Finds structural gaps. Returns every gap found; ranking and the top-three cut
 * happen in selectTopGaps so the caller can log the full set.
 */
export function detectGaps(input: AuditInputs): Gap[] {
  const gaps: Gap[] = [];

  if (!input.targetDate) {
    gaps.push({
      category: "missing_target_date",
      title: "This goal has no target date",
      matters:
        "Without a date Vezri can't work backwards, so nothing has a real start-by date yet.",
      severity: 7,
    });
  }

  if (input.successMeasures.length === 0) {
    gaps.push({
      category: "missing_success_measure",
      title: "There's no way to tell when this is done",
      matters: "Progress can't be judged against anything, so 'on track' would be a guess.",
      severity: 6,
    });
  }

  // A milestone with no work under it is a requirement nobody is doing —
  // distinct from a milestone whose tasks are merely unfinished.
  for (const milestone of input.milestones) {
    if (milestone.status !== "done" && milestone.taskCount === 0) {
      gaps.push({
        category: "milestone_without_work",
        title: `Nothing is scheduled for "${milestone.title}"`,
        matters: "This milestone has no actions under it, so it can't move on its own.",
        severity: 8,
      });
    }
  }

  // Somebody else's action with nothing chasing it. §25.B's whole point.
  for (const dependency of input.dependencies) {
    if (dependency.resolved || !dependency.externalParty) continue;
    const overdue = dependency.startBy ? dependency.startBy.getTime() < input.now.getTime() : false;
    if (!dependency.hasFollowUp || overdue) {
      gaps.push({
        category: "unchased_dependency",
        title: `${dependency.externalParty} hasn't come back on "${dependency.taskTitle}"`,
        matters: overdue
          ? "This is past the date it needed to start, and it isn't in your control."
          : "Nothing is scheduled to follow this up, so it can go quiet without anyone noticing.",
        severity: overdue ? 9 : 7,
      });
    }
  }

  // Deliverables the plan requires that nothing has produced.
  const provided = new Set(input.evidenceProvided.map((e) => e.toLowerCase().trim()));
  for (const item of input.evidenceRequired) {
    if (!provided.has(item.toLowerCase().trim())) {
      gaps.push({
        category: "missing_evidence",
        title: `No record of "${item}" yet`,
        matters: "Your plan lists this as something you need to have, not just something to do.",
        severity: 8,
      });
    }
  }

  const importantUnanswered = input.unansweredCheckpoints.filter((c) => c.priority <= 2);
  if (importantUnanswered.length > 0) {
    gaps.push({
      category: "unanswered_checkpoint",
      title: `${importantUnanswered.length} important check-in${importantUnanswered.length > 1 ? "s" : ""} went unanswered`,
      matters:
        "Vezri never assumes work happened, so these are unknowns rather than progress.",
      severity: 6,
    });
  }

  for (const block of input.unresolvedBlocks) {
    gaps.push({
      category: "unresolved_block",
      title: `"${block.taskTitle}" is still stuck`,
      matters: "The thing that got in the way hasn't been dealt with, so it will happen again.",
      severity: 7,
    });
  }

  if (input.availableMinutes != null && input.requiredMinutes > input.availableMinutes) {
    const shortfallHours = Math.round((input.requiredMinutes - input.availableMinutes) / 60);
    gaps.push({
      category: "insufficient_capacity",
      title: `The plan needs about ${shortfallHours}h more than your calendar has`,
      matters: "Something will slip. Better to choose what, than to find out later.",
      severity: 8,
    });
  }

  return gaps;
}

/** §16 — "Return no more than: top 3 gaps." */
export function selectTopGaps(gaps: Gap[], limit = 3): Gap[] {
  return [...gaps].sort((a, b) => b.severity - a.severity).slice(0, limit);
}

/**
 * The narrative half. The model receives the detected gaps as facts and writes
 * the single highest-value next move (§16); it cannot add a gap of its own.
 */
export const AuditNarrativeSchema = z.object({
  /** One sentence per gap, in the user's terms. Same order as the input. */
  gap_explanations: z.array(z.string().max(300)).max(3),
  /** §16 — "the single highest-value next move". */
  next_move: z.string().min(1).max(300),
  reasoning: z.string().max(400),
});

export type AuditNarrative = z.infer<typeof AuditNarrativeSchema>;

export const AUDIT_SYSTEM = `You are Vezri, an execution coach.

You are given gaps that have ALREADY been detected in a user's plan. Your job is
to explain them and name the single highest-value next move.

Rules:
- Do NOT invent gaps. Work only from the list you are given.
- A gap is a missing requirement, not an unfinished task. Never tell the user to
  "complete your overdue tasks".
- next_move is ONE concrete action the user can take this week. Name it
  specifically. Not "make a plan" — say what to do.
- Be calm and non-judgmental. No guilt, no urgency theatre.
- One sentence per gap. No preamble.`;

export function auditPrompt(input: {
  goal: string;
  gaps: Gap[];
  successMeasures: string[];
}): string {
  const lines = input.gaps.map((gap, i) => `${i + 1}. ${gap.title} — ${gap.matters}`);
  return [
    `Goal: ${input.goal}`,
    input.successMeasures.length
      ? `Success is measured by: ${input.successMeasures.join("; ")}`
      : `No success measures are defined.`,
    `Detected gaps:\n${lines.join("\n")}`,
    `Explain each gap in one sentence, then give the single highest-value next move.`,
  ].join("\n\n");
}
