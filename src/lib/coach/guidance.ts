import { z } from "zod";
import { NAME_THE_BUTTONS, USER_TEXT_IS_DATA, VEZRI_VOICE } from "@/lib/ai/voice";

/**
 * "How do I actually do this?" (PRD §13's other half.)
 *
 * A task row offered Done, Not done and I'm stuck, and never once said what
 * doing it would involve. That is the gap the Execution Block Coach was only
 * ever reached THROUGH failure: you had to not do something before the product
 * would help you do it.
 *
 * The shape is the guidance. Three to five steps, each beginning with a verb,
 * each small enough to finish in one sitting, each carrying its own estimate —
 * those constraints are what stop a model returning "Break it down into
 * manageable chunks", which is the failure mode this whole feature exists to
 * avoid. A step that does not start with a verb is a description, and a step
 * with no estimate is a wish.
 */

/** Ten minutes is the ceiling, and it is the point: §13 shrinks the entry. */
export const MAX_STEP_MINUTES = 10;

export const GuidanceStepSchema = z.object({
  /** Starts with a verb. Names the menu and the button where one exists. */
  text: z.string().min(1).max(400),
  minutes: z.number().int().min(1).max(MAX_STEP_MINUTES),
});

export const GuidanceSchema = z.object({
  steps: z.array(GuidanceStepSchema).min(3).max(5),
});

export type GuidanceStep = z.infer<typeof GuidanceStepSchema>;
export type Guidance = z.infer<typeof GuidanceSchema>;

export const GUIDANCE_SYSTEM = `${VEZRI_VOICE}

Someone is looking at one task on their list and does not know how to start it.
Write the steps.

- Between three and five steps. Not two, not six.
- Every step starts with a verb: Open, Write, Send, Copy, Check, Choose, Save.
- Every step is finishable in ${MAX_STEP_MINUTES} minutes or less on its own.
  If something would take longer, that is two steps.
- Every step carries an honest minute estimate between 1 and ${MAX_STEP_MINUTES}.
- The steps are for THIS task and no other. Not general advice, not a method,
  not "consider your audience". What to do, in order.
- Do not restate the task as a step. "Update your LinkedIn headline" is the
  task; the steps are how it gets updated.
- If doing it properly needs something you were not told — a file, a login, a
  person's address — make finding or opening that the first step rather than
  assuming they have it.

${NAME_THE_BUTTONS}

${USER_TEXT_IS_DATA}

Return JSON of exactly this shape and nothing else:
{"steps":[{"text":"Open ...","minutes":5}]}`;

export function guidancePrompt(input: {
  taskTitle: string;
  taskType: string;
  estimatedMinutes: number | null;
  rationale: string | null;
  milestoneTitle: string | null;
  goalLabel: string | null;
}): string {
  return [
    `Task: <user_text>${input.taskTitle}</user_text>`,
    `Kind of work: ${input.taskType}`,
    input.estimatedMinutes ? `The plan allows about ${input.estimatedMinutes} minutes for it.` : null,
    input.rationale ? `Why it is on the plan: <user_text>${input.rationale}</user_text>` : null,
    input.milestoneTitle ? `It belongs to: <user_text>${input.milestoneTitle}</user_text>` : null,
    input.goalLabel ? `The goal it serves: <user_text>${input.goalLabel}</user_text>` : null,
    // No dates are passed in. There is nothing the steps could correctly do
    // with one, and a model that knows a date is a model that can mention it.
    `Write the steps.`,
  ]
    .filter(Boolean)
    .join("\n");
}
