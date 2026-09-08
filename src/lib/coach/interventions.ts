import { z } from "zod";

/**
 * Execution Block Coach (PRD §13) — the core differentiator.
 *
 * The rule the whole section turns on: "'Not done' is a signal to solve the
 * barrier, not merely move the task." Rescheduling is one intervention out of
 * eleven, and it is never the automatic answer.
 */

export const BLOCK_CATEGORIES = [
  "no_time",
  "didnt_know_how_to_start",
  "felt_too_big",
  "kept_avoiding",
  "waiting_on_someone",
  "forgot",
  "priorities_changed",
  "something_else",
] as const;

export type BlockCategory = (typeof BLOCK_CATEGORIES)[number];

export const INTERVENTION_TYPES = [
  "shrink_first_step",
  "clarify_first_action",
  "split_task",
  "timebox",
  "reschedule_window",
  "resolve_prerequisite",
  "follow_up_other_person",
  "reduce_scope",
  "move_lower_priority",
  "alternative_action",
  "ask_user",
] as const;

export type InterventionType = (typeof INTERVENTION_TYPES)[number];

/**
 * Which interventions actually address which barrier.
 *
 * Constraining the model to this map is what stops it reaching for
 * "reschedule" every time — the failure mode §13 was written against. A person
 * who kept avoiding a task does not need a later date; they need a smaller
 * first step.
 */
export const INTERVENTIONS_FOR: Record<BlockCategory, InterventionType[]> = {
  no_time: ["timebox", "reschedule_window", "move_lower_priority", "shrink_first_step"],
  didnt_know_how_to_start: ["clarify_first_action", "shrink_first_step", "ask_user"],
  felt_too_big: ["shrink_first_step", "split_task", "reduce_scope"],
  kept_avoiding: ["shrink_first_step", "timebox", "clarify_first_action"],
  waiting_on_someone: ["follow_up_other_person", "alternative_action", "resolve_prerequisite"],
  forgot: ["reschedule_window", "timebox"],
  priorities_changed: ["reduce_scope", "move_lower_priority", "alternative_action"],
  something_else: ["ask_user", "clarify_first_action", "shrink_first_step"],
};

/**
 * The structured intervention. `proposal` is what the user is shown and what
 * gets applied — nothing is written until they accept (§4.3, §14).
 */
export const InterventionSchema = z.object({
  intervention_type: z.enum(INTERVENTION_TYPES),
  /** One short line. §13: "Do not give a motivational essay." */
  message: z.string().min(1).max(400),
  proposal: z.object({
    /** A concrete, smaller first action, when the intervention creates one. */
    new_task_title: z.string().max(300).nullable(),
    new_task_minutes: z.number().int().min(5).max(240).nullable(),
    /** ISO datetime when the intervention proposes a specific window. */
    suggested_start: z.string().nullable(),
    /** Rewritten title when scope is reduced. */
    revised_title: z.string().max(300).nullable(),
    /** Who to chase, for waiting-on-someone. */
    follow_up_with: z.string().max(200).nullable(),
  }),
  /** Saved to execution_blocks.explanation for "Why did Vezri suggest this?" */
  reasoning: z.string().max(400),
});

export type Intervention = z.infer<typeof InterventionSchema>;

export const COACH_SYSTEM = `You are Vezri, an execution coach.

The user did not complete a task and has told you what got in the way. Your job
is to remove the barrier, NOT to move the task to a later date.

Rules:
- Give exactly ONE intervention. No lists of options, no motivational essay.
- Rescheduling is a last resort. Only choose reschedule_window when the barrier
  really was the clock, and never for avoidance or overwhelm.
- Be concrete. "Break it down" is useless; "open module 4 and do the first ten
  minutes" is an intervention.
- No guilt, no praise, no commentary on the user's character. Never call anyone
  a procrastinator, lazy, or undisciplined. Missing work is information.
- If the task is blocked on another person, say plainly that it is not in their
  control right now, propose the follow-up, and move on.
- message is at most two short sentences, addressed to the user.

BOUNDARY: You are an execution coach, not a clinician. You may help with
starting, overwhelm, prioritisation and practical barriers. You must not
diagnose a mental-health condition, offer therapy, or present yourself as a
substitute for professional help. If someone describes distress beyond task
execution, acknowledge it briefly, keep your suggestion practical and small,
and do not speculate about causes.`;

export function coachPrompt(input: {
  taskTitle: string;
  taskType: string;
  estimatedMinutes: number | null;
  deadline: string | null;
  goalTitle: string;
  category: BlockCategory;
  categoryLabel: string;
  userText: string | null;
  externalParty: string | null;
  allowedInterventions: InterventionType[];
  /** §10 — what has actually worked for this person before. */
  previouslyEffective: string[];
  productiveWindow: string;
}): string {
  return [
    `Goal: ${input.goalTitle}`,
    `Task: ${input.taskTitle} (${input.taskType}${input.estimatedMinutes ? `, about ${input.estimatedMinutes} minutes` : ""})`,
    input.deadline ? `Deadline: ${input.deadline}` : `No deadline.`,
    input.externalParty ? `Blocked on: ${input.externalParty}` : null,
    `What got in the way: ${input.categoryLabel}`,
    input.userText ? `In their words: "${input.userText}"` : null,
    `They are usually most productive in the ${input.productiveWindow}.`,
    input.previouslyEffective.length
      ? `Interventions that have worked for this person before: ${input.previouslyEffective.join(", ")}.`
      : null,
    `Choose exactly one intervention from: ${input.allowedInterventions.join(", ")}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Fallback when the model is unavailable.
 *
 * §13 must keep working without AI: a user who says "not done" and gets nothing
 * back has been abandoned at the exact moment the product is supposed to earn
 * its keep. These are deliberately generic but still concrete and still never
 * a bare reschedule.
 */
export function fallbackIntervention(
  category: BlockCategory,
  taskTitle: string,
  externalParty: string | null,
): Intervention {
  const base = {
    proposal: {
      new_task_title: null,
      new_task_minutes: null,
      suggested_start: null,
      revised_title: null,
      follow_up_with: null,
    },
    reasoning: "Offline fallback selected from the intervention library for this barrier.",
  };

  switch (category) {
    case "waiting_on_someone":
      return {
        ...base,
        intervention_type: "follow_up_other_person",
        message: `This isn't in your control right now. Let's set a follow-up${externalParty ? ` with ${externalParty}` : ""} and move you to work that doesn't depend on them.`,
        proposal: {
          ...base.proposal,
          follow_up_with: externalParty,
          new_task_title: `Follow up${externalParty ? ` with ${externalParty}` : ""} on: ${taskTitle}`,
          new_task_minutes: 10,
        },
      };
    case "felt_too_big":
    case "kept_avoiding":
    case "didnt_know_how_to_start":
      return {
        ...base,
        intervention_type: "shrink_first_step",
        message: `Let's shrink it. Do just the first ten minutes of "${taskTitle}" and stop there.`,
        proposal: {
          ...base.proposal,
          new_task_title: `First 10 minutes of: ${taskTitle}`,
          new_task_minutes: 10,
        },
      };
    case "no_time":
      return {
        ...base,
        intervention_type: "timebox",
        message: `Let's make it fit. Give "${taskTitle}" a fixed 20 minutes rather than an open-ended session.`,
        proposal: { ...base.proposal, new_task_minutes: 20 },
      };
    case "priorities_changed":
      return {
        ...base,
        intervention_type: "reduce_scope",
        message: `If this matters less now, let's shrink it rather than drop it, so the goal still moves.`,
        proposal: base.proposal,
      };
    case "forgot":
      return {
        ...base,
        intervention_type: "reschedule_window",
        message: `No problem. Let's put it somewhere you'll actually see it.`,
        proposal: base.proposal,
      };
    default:
      return {
        ...base,
        intervention_type: "clarify_first_action",
        message: `Let's find the first concrete step. What would the very first action on "${taskTitle}" be?`,
        proposal: base.proposal,
      };
  }
}
