import { z } from "zod";
import { instructionSystem } from "@/lib/ai/voice";
import { BLOCK_CATEGORIES, INTERVENTIONS_FOR, type BlockCategory, type InterventionType } from "./interventions";

/**
 * What happens after "I'm stuck" (PRD §13).
 *
 * The button collected a barrier and a line of free text and then ended in a
 * closed panel. The reason was recorded — execution_blocks has the row — but
 * nothing the person could act on came back, which makes telling Vezri you are
 * stuck a worse use of thirty seconds than saying nothing.
 *
 * So the answer has exactly three parts, and each one exists because the two
 * without it are not enough:
 *
 *   obstacle      one sentence naming what is actually in the way. Not the
 *                 barrier they picked — that is a category — but the thing
 *                 their own words describe. Being told what the problem is
 *                 is most of being unstuck.
 *   firstAction   ONE thing, five minutes or less, doable now. Not a list:
 *                 a person who could pick from a list of three was not stuck.
 *   breakdown     two or three pieces the task becomes if the first action is
 *                 not the answer. This is what the "Break it into N pieces"
 *                 button writes, so these are task titles, not advice.
 *
 * Every route out of the panel changes something. See the route for what each
 * one writes.
 */

/** §13: "five minutes or less" is the promise the button makes. */
export const MAX_FIRST_ACTION_MINUTES = 5;

export const UnblockSchema = z.object({
  /**
   * One sentence. Names the obstacle; does not narrate it back, sympathise
   * with it, or say how long it has been there.
   */
  obstacle: z.string().min(3).max(240),
  first_action: z.object({
    /** Imperative, concrete, and finishable at a desk in five minutes. */
    text: z.string().min(3).max(240),
    minutes: z.number().int().min(1).max(MAX_FIRST_ACTION_MINUTES),
    /** Exact menu path when it happens inside a known product; null otherwise. */
    where: z.string().max(200).nullable(),
  }),
  /**
   * Two or three pieces. Each is a task title in its own right: it reads as
   * something to do, not as "part 2 of 3".
   */
  breakdown: z
    .array(
      z.object({
        title: z.string().min(3).max(240),
        minutes: z.number().int().min(5).max(120),
      }),
    )
    .min(2)
    .max(3),
});

export type Unblock = z.infer<typeof UnblockSchema>;

export const UNBLOCK_SYSTEM = instructionSystem(
  `Someone told you they are stuck on one task, picked a reason from a short
list, and may have typed a line of their own. Give them the way out.

Return three things and nothing else:

1. obstacle — ONE sentence naming what is actually in the way, in their
   situation, not in general. Take the reason they picked seriously and take
   what they typed more seriously than that. Do not repeat their words back to
   them, do not tell them the feeling is normal, and do not mention time
   having passed.
2. first_action — ONE thing to do, ${MAX_FIRST_ACTION_MINUTES} minutes or
   less, that can be started immediately with nothing else in place. It must
   make the obstacle smaller, not merely be easy. One action, never a choice
   of them.
3. breakdown — 2 or 3 pieces this task becomes. Each is a title someone could
   put on their list and understand a week from now, in the order they are
   done, and together they finish the task. Do not include the first action as
   one of them; it comes first and separately.

If the reason they gave is that they are waiting on another person, the
obstacle is the wait, the first action is the specific message that ends it,
and the breakdown is what they do with the answer.`,
);

export function unblockPrompt(input: {
  taskTitle: string;
  taskType: string;
  estimatedMinutes: number | null;
  rationale: string | null;
  goalLabel: string;
  milestoneTitle: string | null;
  reasonLabel: string;
  note: string | null;
  externalParty: string | null;
}): string {
  return [
    `Goal: ${input.goalLabel}`,
    input.milestoneTitle ? `Part of: ${input.milestoneTitle}` : null,
    `Task: ${input.taskTitle}`,
    `Kind of work: ${input.taskType.replace(/_/g, " ")}`,
    input.estimatedMinutes ? `They expect it to take about ${input.estimatedMinutes} minutes.` : null,
    input.rationale ? `Why it is on the plan: ${input.rationale}` : null,
    input.externalParty ? `This task waits on: ${input.externalParty}` : null,
    "",
    `What they said got in the way: ${input.reasonLabel}`,
    input.note ? `In their own words: "${input.note}"` : "They did not add anything of their own.",
    "",
    "Return the obstacle, the first action, and the breakdown.",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

/**
 * The intervention_type this flow records against the block.
 *
 * execution_blocks.intervention_type is a constrained enum and INTERVENTIONS_FOR
 * says which values answer which barrier — the map that stops the coach
 * reaching for "reschedule" every time someone avoids something. This flow
 * always offers a smaller first step, so it takes shrink_first_step where the
 * barrier allows it and the barrier's own first choice where it does not.
 * "forgot" is the case that matters: nothing about forgetting is answered by
 * shrinking, and the map says so.
 */
export function interventionForReason(reason: BlockCategory): InterventionType {
  const allowed = INTERVENTIONS_FOR[reason];
  return allowed.includes("shrink_first_step") ? "shrink_first_step" : allowed[0]!;
}

/** Narrowing for a value that arrived over the wire. */
export function isBlockCategory(value: unknown): value is BlockCategory {
  return typeof value === "string" && (BLOCK_CATEGORIES as readonly string[]).includes(value);
}

/**
 * A stored recommendation, back out of jsonb.
 *
 * The three buttons act on what the model returned minutes earlier, and the
 * only copy of it is execution_blocks.recommendation. Re-parsed rather than
 * cast: "Break it into 3 pieces" writes rows from this, and writing rows from
 * an unvalidated jsonb blob is how a null title reaches a NOT NULL column.
 */
export function parseStoredUnblock(value: unknown): Unblock | null {
  const parsed = UnblockSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
