import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Which passes of an extraction have been written, and whether the whole thing
 * finished.
 *
 * Extraction is 8-10 model calls. It used to be all-or-nothing: a failure at
 * any point discarded every completed pass, and "Try again" paid for all of
 * them again. Tonight that cost a full run — every pass succeeded and the
 * final write failed on an unmigrated column.
 *
 * The passes map is keyed rather than counted because task batches run
 * concurrently and finish out of order: "6 done" cannot tell you WHICH six.
 */

export type ExtractionState = "not_started" | "in_progress" | "complete" | "failed_partial";

/** Keys in plan_documents.extraction_passes. */
export const PASS_STRUCTURE = "structure";
export const PASS_TARGET = "target";
export const taskPassKey = (index: number) => `tasks:${index}`;

export type PassUsage = { inputTokens: number; outputTokens: number };

export type ExtractionProgressRecord = {
  documentId: string | null;
  state: ExtractionState;
  passes: Record<string, boolean>;
  attempts: number;
  usage: Record<string, PassUsage>;
  note: string | null;
};

/**
 * How many times one document may be extracted.
 *
 * Retries are billable and a loop is expensive, so there is a ceiling and the
 * user is told plainly when it is reached rather than being offered a Try
 * again that will not help. Resumption means a retry now costs only the passes
 * that are still missing, so this is a backstop, not a budget.
 */
export const MAX_EXTRACTION_ATTEMPTS = 6;

export async function loadExtractionProgress(
  supabase: SupabaseClient,
  goalId: string,
): Promise<ExtractionProgressRecord> {
  const { data } = await supabase
    .from("plan_documents")
    .select("id, extraction_state, extraction_passes, extraction_attempts, extraction_usage, extraction_note")
    .eq("goal_id", goalId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return {
    documentId: data?.id ?? null,
    state: (data?.extraction_state as ExtractionState) ?? "not_started",
    passes: (data?.extraction_passes as Record<string, boolean>) ?? {},
    attempts: data?.extraction_attempts ?? 0,
    usage: (data?.extraction_usage as Record<string, PassUsage>) ?? {},
    note: data?.extraction_note ?? null,
  };
}

export function isPassDone(progress: ExtractionProgressRecord, key: string): boolean {
  return progress.passes[key] === true;
}

/**
 * Records that one pass landed.
 *
 * Written immediately after the rows it describes, never before: a pass marked
 * done whose rows are missing is worse than no bookkeeping at all, because
 * resume would skip it forever.
 */
export async function markPassComplete(options: {
  supabase: SupabaseClient;
  progress: ExtractionProgressRecord;
  key: string;
  usage?: PassUsage;
}): Promise<void> {
  const { supabase, progress, key, usage } = options;
  if (!progress.documentId) return;

  progress.passes = { ...progress.passes, [key]: true };
  if (usage) progress.usage = { ...progress.usage, [key]: usage };

  console.info(
    `[extract] pass ${key} written` +
      (usage ? ` (in ${usage.inputTokens} / out ${usage.outputTokens} tokens)` : ""),
  );

  await supabase
    .from("plan_documents")
    .update({ extraction_passes: progress.passes, extraction_usage: progress.usage })
    .eq("id", progress.documentId);
}

export async function setExtractionState(options: {
  supabase: SupabaseClient;
  progress: ExtractionProgressRecord;
  state: ExtractionState;
  note?: string | null;
  bumpAttempt?: boolean;
}): Promise<void> {
  const { supabase, progress, state, note, bumpAttempt } = options;
  if (!progress.documentId) return;

  progress.state = state;
  if (note !== undefined) progress.note = note;
  if (bumpAttempt) progress.attempts += 1;

  await supabase
    .from("plan_documents")
    .update({
      extraction_state: state,
      extraction_note: progress.note,
      ...(bumpAttempt ? { extraction_attempts: progress.attempts } : {}),
    })
    .eq("id", progress.documentId);
}

/** Total tokens across every recorded pass, for the log line and the audit. */
export function totalUsage(progress: ExtractionProgressRecord): PassUsage {
  return Object.values(progress.usage).reduce(
    (sum, u) => ({
      inputTokens: sum.inputTokens + u.inputTokens,
      outputTokens: sum.outputTokens + u.outputTokens,
    }),
    { inputTokens: 0, outputTokens: 0 },
  );
}

/**
 * What to tell the user about an extraction that stopped partway.
 *
 * Concrete, and about the work rather than the machinery: someone who has just
 * lost two minutes needs to know what survived and that finishing it is cheap.
 * Counts come from the rows that were actually written, never from what the
 * model claimed to produce.
 */
export function describePartial(options: {
  milestonesWritten: number;
  batchesDone: number;
  batchesTotal: number;
}): string {
  const { milestonesWritten, batchesDone, batchesTotal } = options;
  const kept = "Try again to finish — the part that worked is kept.";

  if (milestonesWritten === 0) {
    return "Vezri didn't get as far as reading your milestones. Try again.";
  }

  const milestones = milestonesWritten === 1 ? "1 milestone" : `${milestonesWritten} milestones`;

  if (batchesDone < batchesTotal) {
    return (
      `Vezri saved ${milestones} and ${batchesDone} of ${batchesTotal} groups of steps ` +
      `before it stopped. ${kept}`
    );
  }
  return `Vezri saved ${milestones} and all your steps, but didn't finish writing your target. ${kept}`;
}
