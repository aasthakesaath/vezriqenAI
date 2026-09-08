import { z } from "zod";

/**
 * Structured extraction schemas (PRD §7, §22).
 *
 * Every AI response is validated against these before a single row is written.
 * §0.6 is explicit that free-form model output must never mutate user data, so
 * the boundary is here: unparsed output is an error, not a partial write.
 */

/** ISO date, or null. The model is told to return null rather than guess. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .nullable();

export const ORIGINS = ["explicit", "inferred"] as const;

export const TASK_TYPES = [
  "routine_habit",
  "simple_action",
  "deep_work",
  "submission",
  "study_prep",
  "external_dependency",
  "approval_review",
  "purchase_reservation",
  "meeting",
  "multi_step_project",
] as const;

/**
 * Where an item came from.
 *
 * `excerpt` is the quoted span the model claims to have read. §7 requires it,
 * and verifyProvenance() below checks the quote actually appears in the source
 * — the model asserting a quote is not the same as the quote existing.
 */
export const ProvenanceSchema = z.object({
  origin: z.enum(ORIGINS),
  confidence: z.number().min(0).max(1),
  excerpt: z.string().max(600).nullable(),
  page_or_section: z.string().max(200).nullable(),
});

export type Provenance = z.infer<typeof ProvenanceSchema>;

export const ExtractedMilestoneSchema = z.object({
  title: z.string().min(1).max(300),
  target_date: isoDate,
  /** 1–5; drives Goal Health weighting so low-value work cannot inflate it (§4.10). */
  weight: z.number().int().min(1).max(5),
  already_complete: z.boolean(),
  provenance: ProvenanceSchema,
});

export const ExtractedTaskSchema = z.object({
  title: z.string().min(1).max(300),
  /** One sentence tying the task to the outcome (§4.4, §17 "why it matters"). */
  rationale: z.string().max(400).nullable(),
  milestone_title: z.string().max(300).nullable(),
  task_type: z.enum(TASK_TYPES),
  estimated_minutes: z.number().int().min(1).max(60 * 24).nullable(),
  deadline: isoDate,
  /** Hard = stated in the plan; soft = Vezri's preference. §9 keeps them apart. */
  deadline_is_hard: z.boolean(),
  recurrence_rule: z.string().max(200).nullable(),
  /** Names a person the task waits on — the §25.B external-dependency case. */
  external_party_name: z.string().max(200).nullable(),
  depends_on_titles: z.array(z.string().max(300)).max(10),
  provenance: ProvenanceSchema,
});

export const ExtractedPlanSchema = z.object({
  /** The user's outcome in their own words, as found in the document (§6). */
  outcome: z.string().min(1).max(600),
  target_date: isoDate,
  success_measures: z.array(z.string().max(300)).max(10),
  constraints: z.array(z.string().max(300)).max(10),
  risks: z.array(z.string().max(300)).max(10),
  evidence_required: z.array(z.string().max(300)).max(10),
  milestones: z.array(ExtractedMilestoneSchema).max(40),
  tasks: z.array(ExtractedTaskSchema).max(150),
  /**
   * §5 Step 4 — at most three, asked only when the answer changes the plan.
   * The model is instructed to leave this empty when the document is clear.
   */
  clarifying_questions: z.array(z.string().max(300)).max(3),
  /** One short sentence for the AI action log (§20). */
  reasoning: z.string().max(600),
});

export type ExtractedPlan = z.infer<typeof ExtractedPlanSchema>;
export type ExtractedMilestone = z.infer<typeof ExtractedMilestoneSchema>;
export type ExtractedTask = z.infer<typeof ExtractedTaskSchema>;

/**
 * The SMART rewrite (§6). Both forms are preserved: the user's wording and the
 * normalized target, because §6 requires the user to still recognise their goal.
 */
export const SmartTargetSchema = z.object({
  user_wording: z.string().max(600),
  normalized_goal: z.string().min(1).max(400),
  target_date: isoDate,
  success_measures: z.array(z.string().max(300)).min(1).max(5),
  constraints: z.array(z.string().max(300)).max(5),
  /**
   * §6 — flag a stretched timeline without declaring it impossible. Null when
   * the plan looks achievable.
   */
  feasibility_note: z.string().max(400).nullable(),
  missing_information: z.array(z.string().max(300)).max(3),
  reasoning: z.string().max(600),
});

export type SmartTarget = z.infer<typeof SmartTargetSchema>;

/**
 * Normalises a string for quote matching: the model reflows whitespace and
 * smart quotes, so an exact substring test produces false negatives.
 */
function normaliseForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Demotes any item whose quoted excerpt is not actually in the source document.
 *
 * PRD §7: "Vezri must never silently turn an inference into a document fact."
 * A model claiming origin=explicit is not evidence; the quote appearing in the
 * source is. Anything that fails becomes origin=inferred with its confidence
 * capped, so downstream code and the UI treat it as Vezri's reading rather than
 * the document's word.
 */
export function verifyProvenance(provenance: Provenance, sourceText: string | null): Provenance {
  if (provenance.origin !== "explicit") return provenance;

  const excerpt = provenance.excerpt?.trim();
  if (!excerpt || !sourceText) {
    return { ...provenance, origin: "inferred", confidence: Math.min(provenance.confidence, 0.5) };
  }

  const haystack = normaliseForMatch(sourceText);
  const needle = normaliseForMatch(excerpt);
  if (needle.length >= 12 && haystack.includes(needle)) return provenance;

  return { ...provenance, origin: "inferred", confidence: Math.min(provenance.confidence, 0.5) };
}

/** Applies verifyProvenance across a whole extraction. */
export function verifyPlanProvenance(plan: ExtractedPlan, sourceText: string | null): ExtractedPlan {
  return {
    ...plan,
    milestones: plan.milestones.map((m) => ({
      ...m,
      provenance: verifyProvenance(m.provenance, sourceText),
    })),
    tasks: plan.tasks.map((t) => ({
      ...t,
      provenance: verifyProvenance(t.provenance, sourceText),
    })),
  };
}
