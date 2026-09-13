import { z } from "zod";
import { USER_TEXT_IS_DATA, VEZRI_VOICE } from "@/lib/ai/voice";
import { BLOCK_CHOICES } from "@/lib/app-copy";
import type { BlockCategory } from "./interventions";

/**
 * What happens after "I'm stuck" (PRD §13).
 *
 * The old flow asked what got in the way, took a sentence about it, and
 * closed. Collecting a reason and doing nothing with it is worse than not
 * asking: it teaches someone that saying they are stuck costs them something
 * and returns nothing.
 *
 * Three things come back now, and the split matters:
 *
 *   obstacle   ONE sentence naming what is actually in the way — which is
 *              usually not the category they tapped. "Waiting on someone" is
 *              often "you have not decided what to ask them".
 *   action     ONE thing, five minutes or less, doable now. Not a plan, not a
 *              list to choose from. A list is another decision, and being
 *              unable to decide is half of what being stuck IS.
 *   breakdown  two or three steps that are the task, reshaped. This is what
 *              "Break it into N pieces" writes, so it is not advice — those
 *              strings become task rows.
 *
 * Every one of the three buttons the panel renders changes something in the
 * database. None of them is a close-and-forget.
 */

/** Five minutes is the contract, not a suggestion. */
export const MAX_ACTION_MINUTES = 5;

const StepSchema = z.object({
  text: z.string().min(1).max(300),
  minutes: z.number().int().min(1).max(60),
});

export const UnstickSchema = z.object({
  /** One sentence. What is actually in the way, said plainly. */
  obstacle: z.string().min(1).max(300),
  /** The one thing to do now. Five minutes or less, no exceptions. */
  action: z.object({
    text: z.string().min(1).max(300),
    minutes: z.number().int().min(1).max(MAX_ACTION_MINUTES),
  }),
  /** Two or three pieces. These become real tasks if the user says so. */
  breakdown: z.array(StepSchema).min(2).max(3),
});

export type Unstick = z.infer<typeof UnstickSchema>;

export const UNSTICK_SYSTEM = `${VEZRI_VOICE}

Someone has said they are stuck on one task and told you what got in the way.
Give them three things and nothing else.

1. obstacle — ONE sentence naming what is actually stopping them. Look past the
   label they picked: "waiting on someone" is often "you have not decided what
   to ask"; "it felt too big" is often "the first step is not defined". Say the
   real one, plainly, without softening it and without sympathy.
2. action — ONE thing they can do in ${MAX_ACTION_MINUTES} minutes or less,
   starting now, with what they already have in front of them. Not a choice
   between options: deciding is often the thing they cannot do. It must be a
   real action with an end — "open the document and write the first sentence",
   not "think about what you want to say".
3. breakdown — the same task as two or three smaller tasks, in order. Each one
   is a title someone could put on a to-do list: starts with a verb, is
   concrete, and is genuinely smaller than the original. Together they must add
   up to the whole task. Do not include the original task as one of them.

Rescheduling is not one of the three. The user has their own button for that,
and offering a later date as advice is how "I'm stuck" became a way to quietly
move work instead of solving it.

${USER_TEXT_IS_DATA}

Return JSON of exactly this shape and nothing else:
{"obstacle":"...","action":{"text":"...","minutes":5},"breakdown":[{"text":"...","minutes":20}]}`;

export function unstickPrompt(input: {
  taskTitle: string;
  taskType: string;
  estimatedMinutes: number | null;
  rationale: string | null;
  goalLabel: string | null;
  category: BlockCategory;
  categoryLabel: string;
  note: string | null;
}): string {
  return [
    `Task: <user_text>${input.taskTitle}</user_text>`,
    `Kind of work: ${input.taskType}`,
    input.estimatedMinutes ? `The plan allows about ${input.estimatedMinutes} minutes for it.` : null,
    input.rationale ? `Why it is on the plan: <user_text>${input.rationale}</user_text>` : null,
    input.goalLabel ? `The goal it serves: <user_text>${input.goalLabel}</user_text>` : null,
    `What they said got in the way: ${input.categoryLabel}`,
    input.note ? `In their own words: <user_text>${input.note}</user_text>` : null,
    // Deliberately no dates and no history. There is nothing the answer could
    // correctly do with either, and a model holding a date is one sentence
    // away from mentioning it.
    `Give the obstacle, the one action, and the breakdown.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function categoryLabel(category: BlockCategory): string {
  return BLOCK_CHOICES.find((choice) => choice.id === category)?.label ?? category;
}

/**
 * What to say with no model available.
 *
 * §13 has to keep working without AI — a person who has just said they are
 * stuck and gets an error has been abandoned at the exact moment this feature
 * is supposed to earn its keep. These are generic by necessity and concrete by
 * rule: every one of them still names one five-minute action and still breaks
 * the task into pieces that can be written as rows, so all three buttons work
 * and no path ends in a closed panel.
 *
 * This is NOT used when a configured model returns something unusable. That
 * case shows an inline retry instead, because retrying is the thing that
 * actually fixes it.
 */
export function fallbackUnstick(category: BlockCategory, taskTitle: string): Unstick {
  const shared = {
    breakdown: [
      { text: `Write down what "done" looks like for ${taskTitle}`, minutes: 10 },
      { text: `Do the first half of ${taskTitle}`, minutes: 25 },
      { text: `Finish ${taskTitle} and put it where it needs to go`, minutes: 25 },
    ],
  };

  switch (category) {
    case "no_time":
      return {
        obstacle: "This needs a block of time you have not set aside.",
        action: { text: "Open your calendar and put 25 minutes for this on tomorrow", minutes: 3 },
        ...shared,
      };
    case "didnt_know_how_to_start":
      return {
        obstacle: "The first move is not defined, so there is nothing to pick up.",
        action: { text: "Write one sentence saying what the first move is", minutes: 3 },
        ...shared,
      };
    case "felt_too_big":
      return {
        obstacle: "It is one large thing on the list, so there is no small end to take hold of.",
        action: { text: "Open whatever this task produces and give the file a name", minutes: 3 },
        ...shared,
      };
    case "kept_avoiding":
      return {
        obstacle: "Something about the task is unclear enough that starting keeps costing a decision.",
        action: { text: "Set a timer for five minutes and do any part of this until it goes off", minutes: 5 },
        ...shared,
      };
    case "waiting_on_someone":
      return {
        obstacle: "This is not in your hands right now, and no one has been asked.",
        action: { text: "Write the one-line message asking for what you need and send it", minutes: 5 },
        breakdown: [
          { text: "Send the message asking for what you need", minutes: 5 },
          { text: `Do the part of ${taskTitle} that does not depend on the reply`, minutes: 30 },
        ],
      };
    case "forgot":
      return {
        obstacle: "Nothing put this in front of you at a moment you could act on it.",
        action: { text: "Do the smallest visible part of this right now, before closing the page", minutes: 5 },
        ...shared,
      };
    case "priorities_changed":
      return {
        obstacle: "This is competing with something that matters more this week.",
        action: { text: "Write one line saying what the smallest useful version of this is", minutes: 4 },
        breakdown: [
          { text: `Do the smallest useful version of ${taskTitle}`, minutes: 20 },
          { text: "Note what was left out, so it is a choice rather than a gap", minutes: 5 },
        ],
      };
    default:
      return {
        obstacle: "The task as written does not say what to actually do first.",
        action: { text: "Write the first concrete action for this in one line", minutes: 3 },
        ...shared,
      };
  }
}
