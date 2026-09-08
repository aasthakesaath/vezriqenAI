import { z } from "zod";

/**
 * Adaptive replanning (PRD §14).
 *
 * "A missed task should trigger an impact calculation." The five questions §14
 * asks are answered deterministically below, because whether a milestone is
 * threatened is a fact about dates and dependencies, not a matter of opinion.
 * The model turns the answer into a sentence and proposes the smallest change.
 */

export type ImpactInputs = {
  now: Date;
  targetDate: Date | null;
  missedTask: {
    title: string;
    deadline: Date | null;
    startBy: Date | null;
    estimatedMinutes: number | null;
    milestoneId: string | null;
    priority: number;
  };
  /** Tasks that cannot start until the missed one is done. */
  dependentTaskCount: number;
  /** The milestone the missed task belongs to, if any. */
  milestone: { title: string; targetDate: Date | null; openTaskCount: number } | null;
  /** Remaining effort across the goal, in minutes. */
  remainingMinutes: number;
  /** Real availability before the target date, when Calendar is connected. */
  availableMinutes: number | null;
};

export type Impact = {
  affectsDependency: boolean;
  threatensMilestone: boolean;
  targetStillAchievable: boolean;
  hasCapacityToRecover: boolean | null;
  /** How far behind, in days, judged from the missed task's own dates. */
  daysBehind: number;
  /** True when the change needs explicit approval (§14). */
  requiresConfirmation: boolean;
  severity: "minor" | "material";
};

const DAY = 24 * 60 * 60 * 1000;

export function calculateImpact(input: ImpactInputs): Impact {
  const due = input.missedTask.deadline ?? input.missedTask.startBy;
  const daysBehind = due ? Math.max(0, Math.floor((input.now.getTime() - due.getTime()) / DAY)) : 0;

  const affectsDependency = input.dependentTaskCount > 0;

  // A milestone is threatened when the slip eats into the time left before it.
  let threatensMilestone = false;
  if (input.milestone?.targetDate) {
    const daysToMilestone = (input.milestone.targetDate.getTime() - input.now.getTime()) / DAY;
    threatensMilestone = daysToMilestone < 0 || daysBehind > daysToMilestone / 2;
  }

  const targetStillAchievable = input.targetDate
    ? input.targetDate.getTime() > input.now.getTime()
    : true;

  const hasCapacityToRecover =
    input.availableMinutes == null ? null : input.availableMinutes >= input.remainingMinutes;

  // §14 — minor schedule changes may be proposed quickly; anything that touches
  // a milestone, a dependency chain, or high-priority work needs the user.
  const severity: Impact["severity"] =
    threatensMilestone || affectsDependency || input.missedTask.priority <= 2 || daysBehind > 7
      ? "material"
      : "minor";

  return {
    affectsDependency,
    threatensMilestone,
    targetStillAchievable,
    hasCapacityToRecover,
    daysBehind,
    requiresConfirmation: severity === "material",
    severity,
  };
}

/**
 * The proposal. `keeps_target_date` exists so §14's "Never silently change the
 * user's final goal" is checkable rather than merely instructed — a proposal
 * that moves the target is rejected before it reaches the user.
 */
export const ReplanSchema = z.object({
  /** Plain-language consequence, one or two sentences (§14). */
  consequence: z.string().min(1).max(400),
  /** The smallest reasonable change, as concrete steps. */
  changes: z
    .array(
      z.object({
        kind: z.enum(["add_time", "move_task", "drop_optional", "reduce_scope", "reorder"]),
        description: z.string().min(1).max(300),
      }),
    )
    .min(1)
    .max(4),
  keeps_target_date: z.boolean(),
  reasoning: z.string().max(400),
});

export type Replan = z.infer<typeof ReplanSchema>;

export const REPLAN_SYSTEM = `You are Vezri, an execution coach.

Work has slipped. You are given a factual impact assessment. Propose the
SMALLEST reasonable change that keeps the outcome intact.

Rules:
- Never propose moving the user's final target date. keeps_target_date must be
  true. If the target genuinely looks unreachable, say so in consequence and
  still propose the best recovery you can.
- Do not stack all the missed hours onto one day. Spread recovery realistically.
- Prefer dropping optional work over extending every session.
- consequence states the effect in plain language, with numbers where you have
  them. No alarm, no guilt.
- At most four changes. Each one concrete enough to act on.

Example of the tone expected:
"You are about 3.5 study hours behind, but the certification date is still
achievable. I recommend +30 minutes Thursday, +60 minutes Saturday, and dropping
the optional chapter review."`;

export function replanPrompt(input: {
  goalTitle: string;
  targetDate: string | null;
  missedTask: string;
  impact: Impact;
  remainingMinutes: number;
  availableMinutes: number | null;
  optionalTasks: string[];
}): string {
  return [
    `Goal: ${input.goalTitle}`,
    `Target date: ${input.targetDate ?? "not set"}`,
    `Missed: ${input.missedTask} (${input.impact.daysBehind} days behind)`,
    `Affects other work: ${input.impact.affectsDependency ? "yes" : "no"}`,
    `Threatens a milestone: ${input.impact.threatensMilestone ? "yes" : "no"}`,
    `Target still reachable: ${input.impact.targetStillAchievable ? "yes" : "no"}`,
    `Remaining effort: about ${Math.round(input.remainingMinutes / 60)} hours`,
    input.availableMinutes != null
      ? `Available time before the target: about ${Math.round(input.availableMinutes / 60)} hours`
      : `Calendar is not connected, so available time is unknown.`,
    input.optionalTasks.length
      ? `Lower-priority work that could move: ${input.optionalTasks.join("; ")}`
      : `There is no lower-priority work to move.`,
    `Propose the smallest recovery that keeps the target date.`,
  ].join("\n");
}

/**
 * Rejects any proposal that would move the goalposts.
 *
 * §14: "Never silently change the user's final goal." Enforcing it here means a
 * model that ignores the instruction cannot reach the user with it.
 */
export function isSafeReplan(replan: Replan): boolean {
  return replan.keeps_target_date === true;
}
