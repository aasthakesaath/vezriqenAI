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
 *
 * WHY THIS LIVES ON THE GOAL. It lived on plan_documents until 0010, and every
 * write was guarded by `if (!progress.documentId) return;`. A goal-only goal
 * has no document row, so for that whole class of goal the ledger wrote
 * nothing: resumption was inert, no terminal state was ever set, and the retry
 * cap never engaged. Goal e2893b2b ran two complete 130-second extractions on
 * 2026-09-09 and the ledger recorded "0 passes, 0 tokens, attempt 0" for both.
 * An extraction run is per goal — a goal may hold several documents, and a
 * goal with none is still extracted — so the goal is where it belongs.
 */

export type ExtractionState = "not_started" | "in_progress" | "complete" | "failed_partial";

/** Keys in plan_documents.extraction_passes. */
export const PASS_STRUCTURE = "structure";
export const PASS_TARGET = "target";
export const taskPassKey = (index: number) => `tasks:${index}`;

export type PassUsage = { inputTokens: number; outputTokens: number };

export type ExtractionProgressRecord = {
  goalId: string;
  state: ExtractionState;
  passes: Record<string, boolean>;
  attempts: number;
  usage: Record<string, PassUsage>;
  note: string | null;
  /** When the current run began. Null when nothing has started. */
  startedAt: Date | null;
  /** The structure pass output, cached so a resumed run skips that pass. */
  structure: unknown;
};

/**
 * How long an in_progress run can be trusted before it is read as dead.
 *
 * A function killed at Vercel's 300-second ceiling cannot write its own
 * epitaph — the process is gone mid-statement. So "this run died" is not
 * recorded by the writer, it is inferred by the reader: anything still
 * in_progress past the ceiling plus a margin was killed.
 *
 * 73666d16 sat at in_progress for two hours after a timeout, and every screen
 * that looked at it said the plan was still being read.
 */
export const EXTRACTION_STALE_AFTER_MS = 360_000;

/** True when an in_progress run is older than any live run could be. */
export function isRunDead(progress: ExtractionProgressRecord, now = new Date()): boolean {
  if (progress.state !== "in_progress") return false;
  // No start time at all is the pre-0010 shape: unknowable, so not claimed.
  if (!progress.startedAt) return false;
  return now.getTime() - progress.startedAt.getTime() > EXTRACTION_STALE_AFTER_MS;
}

/**
 * What to tell someone whose run was killed.
 *
 * Names what survived and what pressing the button will do. §13: never a dead
 * end, and never a claim about what is happening when nothing is.
 */
export function describeStalled(options: {
  milestonesWritten: number;
  tasksWritten: number;
}): string {
  const { milestonesWritten, tasksWritten } = options;

  if (milestonesWritten === 0 && tasksWritten === 0) {
    return "Vezri started reading this plan and stopped before anything was saved. Try again.";
  }

  const milestones = milestonesWritten === 1 ? "1 milestone" : `${milestonesWritten} milestones`;
  const steps = tasksWritten === 1 ? "1 step" : `${tasksWritten} steps`;
  const saved = tasksWritten > 0 ? `${milestones} and ${steps} are saved` : `${milestones} are saved`;

  return `Vezri ran out of time reading this plan and stopped. ${saved}. Try again picks up from there rather than starting over.`;
}

/**
 * How many times one document may be extracted.
 *
 * Retries are billable and a loop is expensive, so there is a ceiling and the
 * user is told plainly when it is reached rather than being offered a Try
 * again that will not help. Resumption means a retry now costs only the passes
 * that are still missing, so this is a backstop, not a budget.
 */
export const MAX_EXTRACTION_ATTEMPTS = 6;

export const EXTRACTION_LEDGER_COLUMNS =
  "extraction_state, extraction_passes, extraction_attempts, extraction_usage, extraction_note, extraction_started_at, extracted_structure";

/** Shapes a goal row's ledger columns. Exported so readers that already have the row skip a query. */
export function progressFromGoal(
  goalId: string,
  row: Record<string, unknown> | null,
): ExtractionProgressRecord {
  return {
    goalId,
    state: (row?.extraction_state as ExtractionState) ?? "not_started",
    passes: (row?.extraction_passes as Record<string, boolean>) ?? {},
    attempts: (row?.extraction_attempts as number) ?? 0,
    usage: (row?.extraction_usage as Record<string, PassUsage>) ?? {},
    note: (row?.extraction_note as string) ?? null,
    startedAt: row?.extraction_started_at ? new Date(row.extraction_started_at as string) : null,
    structure: row?.extracted_structure ?? null,
  };
}

export async function loadExtractionProgress(
  supabase: SupabaseClient,
  goalId: string,
): Promise<ExtractionProgressRecord> {
  const { data } = await supabase
    .from("goals")
    .select(EXTRACTION_LEDGER_COLUMNS)
    .eq("id", goalId)
    .maybeSingle();

  return progressFromGoal(goalId, data as Record<string, unknown> | null);
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

  progress.passes = { ...progress.passes, [key]: true };
  if (usage) progress.usage = { ...progress.usage, [key]: usage };

  console.info(
    `[extract] pass ${key} written` +
      (usage ? ` (in ${usage.inputTokens} / out ${usage.outputTokens} tokens)` : ""),
  );

  const { error } = await supabase
    .from("goals")
    .update({ extraction_passes: progress.passes, extraction_usage: progress.usage })
    .eq("id", progress.goalId);

  // FATAL, not merely loud. A pass that landed but was not recorded will be
  // bought again by the next run, and if this write failed once it will fail
  // for every remaining pass — so continuing means paying for the whole
  // document to record nothing. On 2026-09-09 that is exactly what happened
  // twice over: ~114,000 tokens, every ledger write refused, nothing kept.
  if (error) {
    throw new Error(
      `Couldn't record the ${key} pass, so the rest of this reading would not be saved: ${error.message}`,
    );
  }
}

export async function setExtractionState(options: {
  supabase: SupabaseClient;
  progress: ExtractionProgressRecord;
  state: ExtractionState;
  note?: string | null;
  bumpAttempt?: boolean;
  /**
   * Refresh started_at without spending an attempt.
   *
   * A run split across several requests is one asking. Each request restamps
   * so that a continuation the platform kills is still readable as dead, but
   * only the first one counts against the retry cap.
   */
  restamp?: boolean;
  /** Throw rather than log if the write fails. See below. */
  required?: boolean;
}): Promise<void> {
  const { supabase, progress, state, note, bumpAttempt, restamp } = options;

  progress.state = state;
  if (note !== undefined) progress.note = note;
  if (bumpAttempt) progress.attempts += 1;
  if (bumpAttempt || restamp) progress.startedAt = new Date();

  const { error } = await supabase
    .from("goals")
    .update({
      extraction_state: state,
      extraction_note: progress.note,
      ...(bumpAttempt ? { extraction_attempts: progress.attempts } : {}),
      // Stamped when the run begins, so a reader can tell a live run from one
      // the platform killed mid-statement.
      ...(bumpAttempt || restamp
        ? { extraction_started_at: progress.startedAt?.toISOString() ?? null }
        : {}),
    })
    .eq("id", progress.goalId);

  // The opening write is fatal: a run that cannot record that it started
  // cannot record anything else either, and must not spend a model call
  // finding that out. The closing writes are not — by then the work is done
  // and saved, and losing the bookkeeping is worse reported than thrown.
  if (error) {
    if (options.required) {
      throw new Error(
        `Couldn't record that this reading started, so nothing it does would be saved: ${error.message}`,
      );
    }
    console.error(`[extract] could not set state ${state}: ${error.message}`);
  }
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
