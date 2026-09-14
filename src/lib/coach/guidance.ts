import { z } from "zod";
import { instructionSystem } from "@/lib/ai/voice";

/**
 * How to actually do the task (PRD §13 "didn't know how to start").
 *
 * A task card offered Done, Not done and I'm stuck, and never said how. The
 * product already knew this was a real barrier — it is one of the eight the
 * Execution Block Coach asks about — but only answered it once the work had
 * already been missed. Expanding a card asks the question before that.
 *
 * The constraints are the product decision, so they are in the schema rather
 * than in the prompt alone: a model can be asked for a ten-minute step and
 * return a two-hour one, and a schema cannot.
 */

/** Nobody follows a nine-step list on a task card. Three to five. */
export const MIN_STEPS = 3;
export const MAX_STEPS = 5;

/** §13's whole argument: a step you cannot start in one sitting is not a step. */
export const MAX_STEP_MINUTES = 10;

export const GuidanceStepSchema = z.object({
  /**
   * Starts with a verb, in the imperative. Enforced at generation by the
   * prompt and repaired on the way in by `tidyStep` — a schema cannot tell a
   * verb from a noun, and failing the whole response over "You should open…"
   * would put a retry button in front of usable content.
   */
  action: z.string().min(3).max(240),
  /** Under ten minutes, and the schema is what makes that true. */
  minutes: z.number().int().min(1).max(MAX_STEP_MINUTES),
  /**
   * The exact menu path when the step happens inside a product the world
   * knows: "LinkedIn: Me › View Profile › the pencil beside your name".
   * Null when the step happens in the user's own head, on paper, or anywhere
   * a path would have to be invented.
   */
  where: z.string().max(200).nullable(),
});

export const GuidanceSchema = z.object({
  steps: z.array(GuidanceStepSchema).min(MIN_STEPS).max(MAX_STEPS),
});

export type GuidanceStep = z.infer<typeof GuidanceStepSchema>;
export type Guidance = z.infer<typeof GuidanceSchema>;

export const GUIDANCE_SYSTEM = instructionSystem(
  `Someone is looking at one task on their list and does not know how to begin.
Return the steps that get it done.

- Between ${MIN_STEPS} and ${MAX_STEPS} steps. Fewer than ${MIN_STEPS} is not a
  method; more than ${MAX_STEPS} is the task again in smaller type.
- Every step starts with a verb in the imperative: "Open", "Write", "Send",
  "Choose". Not "You should", not "The first step is", not a gerund.
- Every step is doable in under ${MAX_STEP_MINUTES} minutes, and minutes is
  your real estimate of THAT step, not a share of the total.
- The steps are in the order they are done, and the first one can be started
  right now with nothing else in place.
- Put the exact menu path in "where" when the step happens inside a product
  whose interface you actually know: the app name, then each click in order,
  then the control by its printed label. If you are not sure the labels are
  current, leave "where" null and describe the destination in the action
  instead. A confidently wrong menu path costs more than no path.
- Describe the work, never the person. No step may assume anything about their
  job, their tools, their team or their week beyond what you were told.`,
);

export function guidancePrompt(input: {
  taskTitle: string;
  taskType: string;
  estimatedMinutes: number | null;
  rationale: string | null;
  goalLabel: string;
  milestoneTitle: string | null;
}): string {
  return [
    `Goal: ${input.goalLabel}`,
    input.milestoneTitle ? `Part of: ${input.milestoneTitle}` : null,
    `Task: ${input.taskTitle}`,
    `Kind of work: ${input.taskType.replace(/_/g, " ")}`,
    input.estimatedMinutes ? `They expect it to take about ${input.estimatedMinutes} minutes.` : null,
    input.rationale ? `Why it is on the plan: ${input.rationale}` : null,
    "",
    "Return the steps.",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

/**
 * Defensive tidy-up on the way in.
 *
 * The schema guarantees the shape and the length; it cannot guarantee the
 * grammar. These are the three things a model does when it drifts out of the
 * imperative, and each one is a rewrite of the same sentence rather than a
 * reason to throw the response away and show a retry button — a retry costs
 * the user ten seconds and us another call, for output that was already
 * usable.
 *
 * Anything the tidy-up cannot rescue is left as it is. Silently rewriting
 * meaning would be worse than a slightly awkward first word.
 */
const LEADING_FILLER =
  /^(?:you(?:'| a)?(?:re| should| can| could| will| need to| want to| may)?|first,?|next,?|then,?|finally,?|start by|begin by|the first step is to|step \d+[.:)-]?)\s+/i;

/** "Opening the file" -> "Open the file". Only the common -ing forms. */
const GERUND = /^([A-Za-z]+?)(?:ing)\b/;

const GERUND_STEMS: Record<string, string> = {
  writ: "Write",
  mak: "Make",
  tak: "Take",
  giv: "Give",
  us: "Use",
  chos: "Choose",
  creat: "Create",
  sav: "Save",
  updat: "Update",
  writing: "Write",
};

export function tidyStep(action: string): string {
  let text = action.trim().replace(/^["'`]|["'`]$/g, "");

  // Strip a numbered prefix and any of the run-ups above, repeatedly: "Step 2:
  // First, you should open…" is one sentence carrying three of them.
  for (let pass = 0; pass < 3; pass += 1) {
    const stripped = text.replace(/^\s*\d+[.):]\s*/, "").replace(LEADING_FILLER, "");
    if (stripped === text) break;
    text = stripped;
  }

  const gerund = GERUND.exec(text);
  if (gerund) {
    const stem = gerund[1]!.toLowerCase();
    const imperative = GERUND_STEMS[stem];
    if (imperative) text = `${imperative}${text.slice(gerund[0].length)}`;
    else if (stem.length > 2) text = `${stem[0]!.toUpperCase()}${stem.slice(1)}${text.slice(gerund[0].length)}`;
  }

  text = text.trim();
  if (!text) return action.trim();
  return `${text[0]!.toUpperCase()}${text.slice(1)}`;
}

/** The whole response, tidied. Shape is already guaranteed by the schema. */
export function tidyGuidance(guidance: Guidance): Guidance {
  return {
    steps: guidance.steps.map((step) => ({
      action: tidyStep(step.action),
      minutes: step.minutes,
      where: step.where?.trim() ? step.where.trim() : null,
    })),
  };
}

/**
 * What a stored row looks like once it comes back out of jsonb.
 *
 * Re-parsed rather than trusted: the column is jsonb, an older row may predate
 * a schema change, and a card that renders `undefined` because the shape moved
 * is worse than one that regenerates.
 */
export function parseStoredGuidance(value: unknown): Guidance | null {
  const parsed = GuidanceSchema.safeParse({ steps: value });
  return parsed.success ? parsed.data : null;
}
