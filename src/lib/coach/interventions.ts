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
] as const;

export type InterventionType = (typeof INTERVENTION_TYPES)[number];

/**
 * Interventions the product no longer offers, and why.
 *
 * `ask_user` — it asks the user a question, and neither panel that shows an
 * intervention can take an answer. The Execution Block Coach offers "Let's do
 * that" and "Not this time"; the "I'm stuck" panel offers an action, a split
 * and a move. So the one response it invites is the one response impossible to
 * give, and a question nobody can answer is the dead end §13 exists to remove.
 * Both panels once had a free-text box beside the choices, which is presumably
 * what it was written for; both boxes are gone.
 *
 * Retired 2026-09-14. Kept as a list rather than deleted, the way
 * RETIRED_TASK_STATUSES is: it is what the guard test checks against, and it
 * is the record of why the value went.
 *
 * THE DATABASE ENUM KEEPS IT. public.intervention_type is a Postgres enum
 * (0003), and a value cannot be removed from one in place — it needs a new
 * type, a column swap and a rewrite of every row still holding it. Those rows
 * are the record of an intervention a person was actually offered, so
 * rewriting them would be falsifying history to tidy a list. The enum stays
 * permissive; nothing writes the value, because nothing can produce it.
 */
export const RETIRED_INTERVENTION_TYPES = ["ask_user"] as const;

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
  didnt_know_how_to_start: ["clarify_first_action", "shrink_first_step"],
  felt_too_big: ["shrink_first_step", "split_task", "reduce_scope"],
  kept_avoiding: ["shrink_first_step", "timebox", "clarify_first_action"],
  waiting_on_someone: ["follow_up_other_person", "alternative_action", "resolve_prerequisite"],
  forgot: ["reschedule_window", "timebox"],
  priorities_changed: ["reduce_scope", "move_lower_priority", "alternative_action"],
  // This barrier used to lead with "ask_user", which is now retired outright
  // — see RETIRED_INTERVENTION_TYPES. It was the likeliest choice here, since
  // this is the one barrier that carries no detail at all, but being likelier
  // on one chip was never what made it wrong.
  something_else: ["clarify_first_action", "shrink_first_step"],
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

The user did not complete a task and has picked what got in the way from a short
list of choices. That choice and the task are everything you have — there is no
free text, so do not write as though there were. Your job is to remove the
barrier, NOT to move the task to a later date.

Rules:
- Never ask the user a question. They have two buttons, "Let's do that" and
  "Not this time", and no way to type an answer, so a question is a dead end.
  Propose the thing you would have asked about instead.
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

If what got in the way was "Something else", the barrier is genuinely unknown
and you must not invent one. Do not guess at a feeling, a mood, or a reason the
user did not give — that is a fact about them you were not told. Work from the
task instead: the kind of work it is, its size, and what that kind of work
usually demands first. Choose an intervention that helps whatever the real
cause turns out to be — opening the thing, a first ten minutes, naming the
first concrete action — because one that only works if your guess was right is
worse than none.

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
    // No "in their words" line. The panel used to carry a free-text box and
    // this prompt leaned on it; with the box gone that line would have pointed
    // at nothing. The choice and the task are the whole input.
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
    // "Something else" — the barrier is unknown, so this has to be an action
    // that helps whatever the real cause is rather than a guess at it. It used
    // to ask "what would the very first action be?", which the panel has no
    // way to answer: a question with two buttons under it is a dead end.
    default:
      return {
        ...base,
        intervention_type: "shrink_first_step",
        message: `Let's find the way in. Do just the first ten minutes of "${taskTitle}" — that usually shows what's actually in the way.`,
        proposal: {
          ...base.proposal,
          new_task_title: `First 10 minutes of: ${taskTitle}`,
          new_task_minutes: 10,
        },
      };
  }
}
