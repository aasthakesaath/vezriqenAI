import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAIProvider, AITruncationError, type AIProvider } from "@/lib/ai";
import {
  verifyProvenance,
  ExtractedPlanStructureSchema,
  ExtractedTaskBatchSchema,
  SmartTargetSchema,
  type ExtractedPlan,
  type ExtractedPlanStructure,
  type ExtractedTask,
  type SmartTarget,
} from "@/lib/ai/schemas";
import {
  EXTRACTION_SYSTEM,
  SMART_SYSTEM,
  VISION_EXTRACTION_NOTE,
  smartPrompt,
  structurePrompt,
  tasksPrompt,
} from "@/lib/ai/prompts";
import { calculateStartBy, type TaskType } from "./lead-time";
import { dayKeyIn, toDayKey } from "@/lib/time-zone";
import { loadUserSettings } from "@/lib/user-settings";
import { inspectPlanDates, type PastPlanReport } from "./reshape";
import {
  MAX_EXTRACTION_ATTEMPTS,
  PASS_STRUCTURE,
  PASS_TARGET,
  describePartial,
  isPassDone,
  loadExtractionProgress,
  markPassComplete,
  setExtractionState,
  taskPassKey,
  totalUsage,
  type ExtractionProgressRecord,
} from "./extraction-state";
import { AIExtractionError } from "@/lib/ai";
import { ConfigurationError } from "@/lib/env";

type Client = SupabaseClient;


/* ---------------------------------------------------------------------------
 * Extraction in passes.
 *
 * A single call cannot emit a whole large plan. We shipped one that tried, and
 * a 58 KB document made it run past max_tokens and return JSON that stopped
 * mid-value; the user saw the parser complaining about position 25162.
 *
 * Raising the ceiling only moves the wall — §7 allows documents up to 100
 * pages. So the work is split along the axis that actually makes the output
 * grow, which is the task list:
 *
 *   pass 1  goal, measures, constraints, risks, milestones   (bounded: <= 40)
 *   pass 2  tasks for milestones 1..n                        (bounded: <= 45)
 *   pass 3  tasks for milestones n+1..                       ...
 *
 * Task passes are independent, so they run concurrently and a big plan costs
 * roughly the wall-clock of one call rather than the sum of all of them.
 * ------------------------------------------------------------------------ */

/**
 * Milestones per task call.
 *
 * Three, not five. Five was the first guess and the live 58 KB run truncated on
 * it — a dense workstream milestone can carry a dozen tasks with quoted
 * provenance, and three of those already fill a good part of the budget.
 * Smaller batches also finish faster individually, which matters because the
 * extract route has a 300 s ceiling.
 */
const MILESTONES_PER_TASK_PASS = 3;

/**
 * Concurrent task passes. Six keeps a 20-milestone plan to about two waves,
 * which is what keeps the whole extraction inside the route's time budget.
 */
const TASK_PASS_CONCURRENCY = 6;

/** Total tasks kept, matching ExtractedPlanSchema's own ceiling. */
const MAX_TASKS = 150;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Runs jobs with a fixed concurrency ceiling, preserving input order. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  job: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await job(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

/** A thing that has actually happened, for the waiting screen to report. */
export type ExtractionProgress =
  | { phase: "reading" }
  | { phase: "structure_done"; milestones: number }
  | { phase: "tasks"; completed: number; total: number }
  | { phase: "tasks_done"; tasks: number }
  | { phase: "target" };

/**
 * Reads a plan document into the full ExtractedPlan shape, in as many passes as
 * the document needs. Callers downstream are unchanged — they still receive one
 * assembled plan.
 */
export async function extractPlanInPasses(options: {
  provider: AIProvider;
  documentText: string | null;
  userGoalText: string | null;
  today: string;
  image?: { data: string; mediaType: "image/jpeg" | "image/png" };
  /**
   * Called as each pass actually finishes.
   *
   * The waiting screen used to advance its own stage text on a 6-second
   * timer, so it displayed "Reading your plan" through to "nearly there"
   * whether or not a request had even been sent — and it did exactly that
   * during a window in which the server logs show no extract request at all.
   * Stage text has to come from work that happened.
   */
  onProgress?: (event: ExtractionProgress) => void;
}): Promise<{ plan: ExtractedPlan; modelVersion: string; passes: number }> {
  const { provider, documentText, userGoalText, today, image, onProgress } = options;
  const report = (event: ExtractionProgress) => onProgress?.(event);

  report({ phase: "reading" });
  const promptInput = { documentText, userGoalText, today };
  const withVisionNote = (prompt: string) =>
    image ? `${prompt}\n\n${VISION_EXTRACTION_NOTE}` : prompt;

  // ---- Pass 1: structure --------------------------------------------------
  const structureResult = await provider.generateStructured({
    action: "extract_plan_structure",
    system: EXTRACTION_SYSTEM,
    prompt: withVisionNote(structurePrompt(promptInput)),
    schema: ExtractedPlanStructureSchema,
    image,
    effort: "high",
  });
  const structure = structureResult.data;
  report({ phase: "structure_done", milestones: structure.milestones.length });

  // ---- Pass 2..n: tasks ---------------------------------------------------
  const titles = structure.milestones.map((m) => m.title);
  const wholePlan = titles.length === 0;
  const batches = wholePlan ? [[]] : chunk(titles, MILESTONES_PER_TASK_PASS);

  const runBatch = (milestoneTitles: string[], index: number) =>
    provider.generateStructured({
      action: `extract_plan_tasks_${index + 1}`,
      system: EXTRACTION_SYSTEM,
      prompt: withVisionNote(
        tasksPrompt({
          ...promptInput,
          outcome: structure.outcome,
          milestoneTitles,
          wholePlan,
        }),
      ),
      schema: ExtractedTaskBatchSchema,
      image,
      effort: "high",
    });

  let finishedBatches = 0;
  const batchDone = () => {
    finishedBatches += 1;
    report({ phase: "tasks", completed: finishedBatches, total: batches.length });
  };

  const batchResults = await mapLimit(batches, TASK_PASS_CONCURRENCY, async (titlesForBatch, i) => {
    try {
      const tasks = (await runBatch(titlesForBatch, i)).data.tasks;
      batchDone();
      return tasks;
    } catch (error) {
      // One dense batch truncating must not lose the rest of the plan. Split it
      // and retry; if a single milestone still will not fit, drop that
      // milestone's tasks rather than fail the whole extraction — the plan is
      // far more useful with one gap than not at all.
      if (!(error instanceof AITruncationError) || titlesForBatch.length <= 1) {
        if (error instanceof AITruncationError) {
          console.warn(
            `[ai] tasks for "${titlesForBatch[0]}" do not fit in one response; skipping that milestone's tasks.`,
          );
          batchDone();
          return [];
        }
        throw error;
      }
      const halves = chunk(titlesForBatch, Math.ceil(titlesForBatch.length / 2));
      const retried = await mapLimit(halves, TASK_PASS_CONCURRENCY, async (half, j) => {
        try {
          return (await runBatch(half, i * 10 + j)).data.tasks;
        } catch (retryError) {
          if (retryError instanceof AITruncationError) return [];
          throw retryError;
        }
      });
      batchDone();
      return retried.flat();
    }
  });

  // Deduplicate: a title can legitimately appear in two batches if the model
  // read an ambiguous heading twice, and two identical tasks is a worse
  // outcome than one.
  const seen = new Set<string>();
  const tasks: ExtractedTask[] = [];
  for (const task of batchResults.flat()) {
    const key = `${task.milestone_title ?? ""}\u0000${task.title.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tasks.push(task);
    if (tasks.length >= MAX_TASKS) break;
  }

  report({ phase: "tasks_done", tasks: tasks.length });

  return {
    plan: { ...structure, tasks },
    modelVersion: structureResult.modelVersion,
    // Recorded in the audit log: §20 asks the plan to be explainable, and "how
    // many passes did this take" is the first question when one looks wrong.
    passes: 1 + batches.length,
  };
}

/** Higher-consequence work sorts first on Today (PRD §17). */
function derivePriority(task: ExtractedTask): number {
  if (task.task_type === "external_dependency") return 1;
  if (task.task_type === "submission" && task.deadline_is_hard) return 1;
  if (task.deadline) return 2;
  if (task.task_type === "deep_work" || task.task_type === "study_prep") return 3;
  if (task.task_type === "routine_habit") return 4;
  return 3;
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export type BuildResult = {
  plan: ExtractedPlan;
  smart: SmartTarget;
  milestoneCount: number;
  taskCount: number;
  /** How much of the plan is already in the past, for the §14 offer. */
  pastPlan: PastPlanReport;
};

/**
 * The run spent its wall-clock budget with passes still to go.
 *
 * Not a failure: everything finished is written, and the caller resumes into a
 * fresh request. This exists because Vercel kills a function at 300 seconds
 * mid-statement, and a killed process cannot record anything — including that
 * it died. Stopping ourselves a minute short turns a hard kill into an
 * ordinary return.
 */
export type BuildIncomplete = {
  incomplete: true;
  /** Passes written across every attempt so far, for the log. */
  passesDone: number;
};

export function isIncomplete(result: BuildResult | BuildIncomplete): result is BuildIncomplete {
  return (result as BuildIncomplete).incomplete === true;
}

/**
 * How long one request may spend before handing back to the caller.
 *
 * Vercel's ceiling is 300s and it is not negotiable on this plan. 240 leaves a
 * minute for the pass in flight to finish its writes, which is the difference
 * between resuming from the last completed pass and losing it.
 */
export const REQUEST_BUDGET_MS = 240_000;

/**
 * Reads a goal's plan document, extracts structure, and persists it with
 * provenance (PRD §7).
 *
 * Ordering matters: anchors are written first so milestones and tasks can point
 * at them, and every write goes through the caller's RLS-scoped client — the
 * service role is never used here, so a bug cannot cross a user boundary.
 */
/* -------------------------------------------------------------------------
 * Resumption helpers.
 *
 * A resumed run needs the structure pass's OUTPUT, not just its rows: the task
 * prompts are built from the outcome and the milestone titles. Re-running the
 * structure pass to recover them would defeat the point, so it is stored on the
 * goal row and read back.
 * ---------------------------------------------------------------------- */

async function storeStructure(
  supabase: Client,
  progress: ExtractionProgressRecord,
  structure: ExtractedPlanStructure,
): Promise<void> {
  progress.structure = structure;
  const { error } = await supabase
    .from("goals")
    .update({ extracted_structure: structure })
    .eq("id", progress.goalId);
  // Not fatal: the milestone rows are already written, and loadStoredStructure
  // rebuilds from them if this cache is missing. Logged rather than swallowed,
  // so a resumed run that loses the model's wording says why.
  if (error) console.warn(`[extract] could not cache the structure: ${error.message}`);
}

/**
 * Rebuilds the structure a resumed run needs.
 *
 * From the milestone rows and the goal, not from the model — the whole point
 * is that a completed pass is never paid for twice.
 */
async function loadStoredStructure(
  supabase: Client,
  goalId: string,
  progress: ExtractionProgressRecord,
): Promise<ExtractedPlanStructure> {
  // The cache travels on the ledger, so a resumed run already has it in hand.
  const stored = progress.structure as ExtractedPlanStructure | null | undefined;
  if (stored?.milestones) return stored;

  const [{ data: goal }, { data: milestones }] = await Promise.all([
    supabase
      .from("goals")
      .select("normalized_goal, user_goal_text, target_date, success_criteria, constraints")
      .eq("id", goalId)
      .single(),
    supabase
      .from("milestones")
      .select("title, target_date, weight, status, origin, confidence, date_anchor")
      .eq("goal_id", goalId)
      .order("sort_order", { ascending: true }),
  ]);

  return {
    outcome: goal?.normalized_goal ?? goal?.user_goal_text ?? "Your goal",
    target_date: goal?.target_date ?? null,
    success_measures: (goal?.success_criteria as string[]) ?? [],
    constraints: (goal?.constraints as string[]) ?? [],
    risks: [],
    evidence_required: [],
    milestones: (milestones ?? []).map((m) => ({
      title: m.title,
      target_date: m.target_date,
      weight: m.weight,
      already_complete: m.status === "done",
      provenance: {
        origin: m.origin as "explicit" | "inferred",
        confidence: Number(m.confidence),
        excerpt: null,
        page_or_section: null,
        date_anchor: m.date_anchor ?? null,
      },
    })),
    clarifying_questions: [],
    reasoning: "Resumed from a partial extraction.",
  };
}

/** The confirmed target, when the target pass already ran. */
async function loadStoredTarget(supabase: Client, goalId: string): Promise<SmartTarget> {
  const { data } = await supabase
    .from("goals")
    .select("normalized_goal, short_label, target_date, success_criteria, constraints, user_goal_text")
    .eq("id", goalId)
    .single();

  return {
    user_wording: data?.user_goal_text ?? "",
    normalized_goal: data?.normalized_goal ?? "Your goal",
    short_label: data?.short_label ?? "Your goal",
    target_date: data?.target_date ?? null,
    success_measures: (data?.success_criteria as string[]) ?? [],
    constraints: (data?.constraints as string[]) ?? [],
    feasibility_note: null,
    missing_information: [],
    reasoning: "Resumed from a partial extraction.",
  };
}

/**
 * How many milestones actually landed, for the partial message.
 *
 * Counted from the rows rather than from the model's output: the message tells
 * someone what survived, and only the rows are evidence of that.
 */
async function countMilestones(supabase: Client, goalId: string): Promise<number> {
  const { count } = await supabase
    .from("milestones")
    .select("id", { count: "exact", head: true })
    .eq("goal_id", goalId);
  return count ?? 0;
}

async function countTasks(supabase: Client, goalId: string): Promise<number> {
  const { count } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("goal_id", goalId);
  return count ?? 0;
}

/** Writes one batch of tasks, its dependencies, and its anchors. */
async function writeTaskBatch(options: {
  supabase: Client;
  userId: string;
  goalId: string;
  tasks: ExtractedTask[];
  milestoneIds: Map<string, string>;
  anchorsFor: (
    items: Array<{ provenance: { origin: string; excerpt: string | null } }>,
  ) => Promise<Map<string, string>>;
}): Promise<void> {
  const { supabase, userId, goalId, tasks, milestoneIds, anchorsFor } = options;
  if (tasks.length === 0) return;

  const anchors = await anchorsFor(tasks);

  const rows = tasks.map((task) => {
    const deadline = parseDate(task.deadline);
    const { startBy, reason } = calculateStartBy({
      taskType: task.task_type as TaskType,
      deadline,
      estimatedMinutes: task.estimated_minutes,
      dependencyCount: task.depends_on_titles.length + (task.external_party_name ? 1 : 0),
    });

    return {
      user_id: userId,
      goal_id: goalId,
      milestone_id: task.milestone_title ? (milestoneIds.get(task.milestone_title) ?? null) : null,
      title: task.title,
      rationale: task.rationale,
      task_type: task.task_type,
      estimated_minutes: task.estimated_minutes,
      deadline: deadline?.toISOString() ?? null,
      start_by: startBy?.toISOString() ?? null,
      start_by_reason: reason,
      priority: derivePriority(task),
      status: "not_started" as const,
      recurrence_rule: task.recurrence_rule,
      source_anchor_id:
        task.provenance.origin === "explicit" && task.provenance.excerpt
          ? (anchors.get(task.provenance.excerpt.trim()) ?? null)
          : null,
      // NOT NULL, per §7 — every stored item carries its provenance.
      origin: task.provenance.origin,
      confidence: task.provenance.confidence,
      date_anchor: task.provenance.date_anchor ?? null,
    };
  });

  const { data: inserted, error } = await supabase.from("tasks").insert(rows).select("id, title");
  if (error) throw new Error(`Couldn't save tasks: ${error.message}`);

  const taskIds = new Map((inserted ?? []).map((row) => [row.title, row.id]));

  const dependencyRows: Array<Record<string, unknown>> = [];
  for (const task of tasks) {
    const taskId = taskIds.get(task.title);
    if (!taskId) continue;

    for (const dependsOnTitle of task.depends_on_titles) {
      const dependsOnId = taskIds.get(dependsOnTitle);
      if (dependsOnId && dependsOnId !== taskId) {
        dependencyRows.push({
          user_id: userId,
          task_id: taskId,
          depends_on_task_id: dependsOnId,
          dependency_type: "task",
        });
      }
    }

    if (task.external_party_name) {
      dependencyRows.push({
        user_id: userId,
        task_id: taskId,
        depends_on_task_id: null,
        dependency_type: "external_person",
        external_party_name: task.external_party_name,
      });
    }
  }
  if (dependencyRows.length > 0) {
    await supabase.from("task_dependencies").insert(dependencyRows);
  }
}
/**
 * The result for a goal that has already been read, assembled from the rows.
 *
 * No model call, no deletion, no bookkeeping — the work is done and this is
 * simply reporting it. A second request used to re-run the whole extraction
 * here, deleting every milestone and buying the document again.
 */
async function storedResult(options: {
  supabase: Client;
  goalId: string;
  today: string;
  timeZone: string;
}): Promise<BuildResult> {
  const { supabase, goalId, today } = options;

  const [{ data: goal }, { data: milestoneRows }, { count: taskCount }] = await Promise.all([
    supabase
      .from("goals")
      .select("user_goal_text, normalized_goal, short_label, target_date, success_criteria, constraints")
      .eq("id", goalId)
      .single(),
    supabase.from("milestones").select("id, title, target_date, status").eq("goal_id", goalId),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("goal_id", goalId),
  ]);

  const milestones = milestoneRows ?? [];

  return {
    plan: {
      outcome: goal?.normalized_goal ?? goal?.user_goal_text ?? "Your goal",
      target_date: goal?.target_date ?? null,
      success_measures: (goal?.success_criteria as string[]) ?? [],
      constraints: (goal?.constraints as string[]) ?? [],
      risks: [],
      evidence_required: [],
      milestones: [],
      tasks: [],
      clarifying_questions: [],
      reasoning: "Already read.",
    },
    smart: {
      user_wording: goal?.user_goal_text ?? "",
      normalized_goal: goal?.normalized_goal ?? "Your goal",
      short_label: goal?.short_label ?? "Your goal",
      target_date: goal?.target_date ?? null,
      success_measures: (goal?.success_criteria as string[]) ?? [],
      constraints: (goal?.constraints as string[]) ?? [],
      feasibility_note: null,
      missing_information: [],
      reasoning: "Already read.",
    },
    milestoneCount: milestones.length,
    taskCount: taskCount ?? 0,
    pastPlan: inspectPlanDates({
      today,
      items: milestones.map((m) => ({
        id: m.id,
        title: m.title,
        date: toDayKey(m.target_date),
        done: m.status === "done",
      })),
    }),
  };
}

export async function buildPlanForGoal(options: {
  supabase: Client;
  userId: string;
  goalId: string;
  today?: string;
  /** Reported as each pass completes, so the UI can show real progress. */
  onProgress?: (event: ExtractionProgress) => void;
  /**
   * True when the caller is continuing a run it already started, rather than
   * starting one. A continuation does not spend an attempt — the retry cap
   * counts times the user asked, not chunks of one asking.
   */
  continuation?: boolean;
  /** Wall-clock budget for THIS request. Defaults to REQUEST_BUDGET_MS. */
  budgetMs?: number;
  /** Read the plan again from scratch, discarding what is there. Never implicit. */
  redo?: boolean;
}): Promise<BuildResult | BuildIncomplete> {
  const { supabase, userId, goalId } = options;
  const deadline = Date.now() + (options.budgetMs ?? REQUEST_BUDGET_MS);
  // Passes completed inside THIS request. A continuation that finishes none is
  // not making progress, and resuming it again would loop forever.
  let passesThisRequest = 0;
  const outOfTime = () => passesThisRequest > 0 && Date.now() > deadline;

  /**
   * Stop cleanly with work still to do.
   *
   * The state stays in_progress with a fresh started_at, so a caller that
   * never comes back is still readable as dead rather than as running.
   */
  const handOff = async (): Promise<BuildIncomplete> => {
    console.info(
      `[extract] goal ${goalId} handing off after ${passesThisRequest} pass(es) this request; ` +
        `${Object.keys(progress.passes).length} done in total.`,
    );
    return { incomplete: true, passesDone: Object.keys(progress.passes).length };
  };

  // The model's only "now". In the USER's zone, not the server's: a plan read
  // at 8 PM in Texas was being told it was already tomorrow.
  const { timeZone } = await loadUserSettings(supabase);
  const today = options.today ?? dayKeyIn(new Date(), timeZone);
  const report = (event: ExtractionProgress) => options.onProgress?.(event);

  const { data: goal, error: goalError } = await supabase
    .from("goals")
    .select("id, user_goal_text, normalized_goal")
    .eq("id", goalId)
    .single();
  if (goalError || !goal) throw new Error("That goal no longer exists.");

  // Already read. A confirmed target is the proof — it is written by the final
  // pass and by nothing else. Re-running would delete every milestone and buy
  // the whole document again, which is what a stray second request used to do.
  // `redo` is the deliberate way to ask for that; arriving here twice is not.
  if (goal.normalized_goal && !options.redo) {
    console.info(`[extract] goal ${goalId} is already read — returning the stored plan.`);
    return await storedResult({ supabase, goalId, today, timeZone });
  }

  const { data: documents } = await supabase
    .from("plan_documents")
    .select("id, filename, mime_type, storage_path, extracted_text")
    .eq("goal_id", goalId)
    .order("created_at", { ascending: true });

  const document = documents?.[0] ?? null;
  const documentText = document?.extracted_text ?? null;

  // ---- Where did the last attempt get to? ---------------------------------
  const progress = await loadExtractionProgress(supabase, goalId);

  // A deliberate re-read starts from nothing. Without this, `redo` only skipped
  // the already-read shortcut and then found every pass marked done, so it made
  // no model calls and changed nothing — a button that appeared to work.
  if (options.redo) {
    progress.passes = {};
    progress.usage = {};
    await supabase
      .from("goals")
      .update({ extraction_passes: {}, extraction_usage: {}, extracted_structure: null })
      .eq("id", goalId);
  }

  if (progress.attempts >= MAX_EXTRACTION_ATTEMPTS) {
    // Retries are billable. Past the cap, another Try again would spend money
    // on something that has failed six times, so it is not offered.
    throw new AIExtractionError(
      `Vezri has tried to read this plan ${progress.attempts} times without finishing. ` +
        `Rather than keep retrying, upload the plan again — or paste the text instead, ` +
        `which usually works when a file doesn't.`,
    );
  }

  await setExtractionState({
    supabase,
    progress,
    state: "in_progress",
    note: null,
    // A continuation is one asking, carried across several requests — not six
    // separate attempts at the cap. It still stamps a fresh started_at, so a
    // continuation the platform kills is still readable as dead.
    bumpAttempt: !options.continuation,
    restamp: Boolean(options.continuation),
  });

  // An image plan has no text layer; the model reads the picture instead (§22).
  let image: { data: string; mediaType: "image/jpeg" | "image/png" } | undefined;
  if (!documentText && document?.storage_path && document.mime_type.startsWith("image/")) {
    const { data: blob } = await supabase.storage
      .from("plan-documents")
      .download(document.storage_path);
    if (blob) {
      const buffer = Buffer.from(await blob.arrayBuffer());
      image = {
        data: buffer.toString("base64"),
        mediaType: document.mime_type === "image/png" ? "image/png" : "image/jpeg",
      };
    }
  }

  const provider = getAIProvider();
  const promptInput = { documentText, userGoalText: goal.user_goal_text, today };
  const withVisionNote = (prompt: string) =>
    image ? `${prompt}\n\n${VISION_EXTRACTION_NOTE}` : prompt;

  /** Anchors for the quotes in one batch of items (§7). */
  const anchorsFor = async (
    items: Array<{ provenance: { origin: string; excerpt: string | null } }>,
  ): Promise<Map<string, string>> => {
    const map = new Map<string, string>();
    if (!document) return map;
    const unique = new Set<string>();
    for (const item of items) {
      const excerpt = item.provenance.excerpt?.trim();
      if (item.provenance.origin === "explicit" && excerpt) unique.add(excerpt);
    }
    if (unique.size === 0) return map;
    const { data: anchors } = await supabase
      .from("plan_source_anchors")
      .insert(
        [...unique].map((excerpt) => ({
          user_id: userId,
          document_id: document.id,
          excerpt,
          page_or_section: null,
        })),
      )
      .select("id, excerpt");
    for (const anchor of anchors ?? []) map.set(anchor.excerpt, anchor.id);
    return map;
  };

  let structure: ExtractedPlanStructure;
  let modelVersion = "";
  let milestoneIds = new Map<string, string>(); // title -> id

  try {
    // ===================================================================
    // PASS 1 — structure. Goal-level fields and milestones.
    // ===================================================================
    if (!isPassDone(progress, PASS_STRUCTURE)) {
      // A fresh run, so anything left by an earlier attempt goes. On a RESUME
      // this branch is skipped entirely, which is the point — completed work
      // is never deleted and never re-paid for.
      await supabase.from("tasks").delete().eq("goal_id", goalId);
      await supabase.from("milestones").delete().eq("goal_id", goalId);

      report({ phase: "reading" });
      const result = await provider.generateStructured({
        action: "extract_plan_structure",
        system: EXTRACTION_SYSTEM,
        prompt: withVisionNote(structurePrompt(promptInput)),
        schema: ExtractedPlanStructureSchema,
        image,
        effort: "high",
      });
      modelVersion = result.modelVersion;

      // §7 — verified per item, as it lands. Partial is not unverified.
      structure = {
        ...result.data,
        milestones: result.data.milestones.map((m) => ({
          ...m,
          provenance: verifyProvenance(m.provenance, documentText),
        })),
      };

      const anchors = await anchorsFor(structure.milestones);
      const rows = structure.milestones.map((milestone, index) => ({
        user_id: userId,
        goal_id: goalId,
        title: milestone.title,
        target_date: milestone.target_date,
        status: milestone.already_complete ? ("done" as const) : ("not_started" as const),
        weight: milestone.weight,
        source_anchor_id:
          milestone.provenance.origin === "explicit" && milestone.provenance.excerpt
            ? (anchors.get(milestone.provenance.excerpt.trim()) ?? null)
            : null,
        // NOT NULL in the schema and never defaulted here: §7 requires every
        // stored item to carry where it came from and how sure Vezri is.
        origin: milestone.provenance.origin,
        confidence: milestone.provenance.confidence,
        // What a relative date was resolved against, when it was not stated.
        date_anchor: milestone.provenance.date_anchor ?? null,
        sort_order: index,
      }));

      if (rows.length > 0) {
        const { data: inserted, error } = await supabase
          .from("milestones")
          .insert(rows)
          .select("id, title");
        if (error) throw new Error(`Couldn't save milestones: ${error.message}`);
        for (const row of inserted ?? []) milestoneIds.set(row.title, row.id);
      }

      // The goal's own fields, so a resumed run has them even if it never gets
      // to the target pass. status stays draft: §6 requires a confirmed target
      // before anything is scheduled.
      await supabase
        .from("goals")
        .update({
          success_criteria: structure.success_measures,
          constraints: structure.constraints,
        })
        .eq("id", goalId);

      await storeStructure(supabase, progress, structure);
      await markPassComplete({
        supabase,
        progress,
        key: PASS_STRUCTURE,
        usage: result.usage,
      });
      passesThisRequest += 1;
      report({ phase: "structure_done", milestones: structure.milestones.length });
    } else {
      // Resuming: the structure is already in the database.
      structure = await loadStoredStructure(supabase, goalId, progress);
      const { data: existing } = await supabase
        .from("milestones")
        .select("id, title")
        .eq("goal_id", goalId);
      milestoneIds = new Map((existing ?? []).map((m) => [m.title, m.id]));
      report({ phase: "structure_done", milestones: structure.milestones.length });
    }

    // ===================================================================
    // PASS 2..n — tasks, a few milestones at a time.
    // ===================================================================
    const titles = structure.milestones.map((m) => m.title);
    const wholePlan = titles.length === 0;
    const batches = wholePlan ? [[]] : chunk(titles, MILESTONES_PER_TASK_PASS);

    let batchesDone = batches.filter((_, i) => isPassDone(progress, taskPassKey(i))).length;
    report({ phase: "tasks", completed: batchesDone, total: batches.length });

    // Sequential, unlike the old concurrent run: each batch writes before the
    // next starts, so an interruption loses at most one batch. Concurrency
    // saved wall-clock at the cost of losing everything in flight, which is
    // the trade this whole change exists to reverse.
    for (let i = 0; i < batches.length; i += 1) {
      if (isPassDone(progress, taskPassKey(i))) continue;

      // Between passes, never inside one. Everything written stays written and
      // the caller comes straight back for the rest — a controlled hand-off
      // instead of a kill at the platform ceiling.
      if (outOfTime()) return handOff();

      const result = await provider.generateStructured({
        action: `extract_plan_tasks_${i + 1}`,
        system: EXTRACTION_SYSTEM,
        prompt: withVisionNote(
          tasksPrompt({
            ...promptInput,
            outcome: structure.outcome,
            milestoneTitles: batches[i],
            wholePlan,
          }),
        ),
        schema: ExtractedTaskBatchSchema,
        image,
        effort: "high",
      });
      modelVersion = modelVersion || result.modelVersion;

      const tasks = result.data.tasks.map((task) => ({
        ...task,
        provenance: verifyProvenance(task.provenance, documentText),
      }));

      await writeTaskBatch({
        supabase,
        userId,
        goalId,
        tasks,
        milestoneIds,
        anchorsFor,
      });

      await markPassComplete({
        supabase,
        progress,
        key: taskPassKey(i),
        usage: result.usage,
      });
      passesThisRequest += 1;
      batchesDone += 1;
      report({ phase: "tasks", completed: batchesDone, total: batches.length });
    }
    // The real number of task rows, resumed batches included — never a stand-in.
    report({ phase: "tasks_done", tasks: await countTasks(supabase, goalId) });

    // ===================================================================
    // FINAL PASS — the SMART target.
    // ===================================================================
    let smart: SmartTarget;
    if (!isPassDone(progress, PASS_TARGET)) {
      if (outOfTime()) return handOff();
      report({ phase: "target" });
      const smartResult = await provider.generateStructured({
        action: "smart_target",
        system: SMART_SYSTEM,
        prompt: smartPrompt({
          outcome: structure.outcome,
          userGoalText: goal.user_goal_text,
          targetDate: structure.target_date,
          successMeasures: structure.success_measures,
          constraints: structure.constraints,
          today,
        }),
        schema: SmartTargetSchema,
        effort: "medium",
      });
      smart = smartResult.data;
      modelVersion = modelVersion || smartResult.modelVersion;

      const { error: updateError } = await supabase
        .from("goals")
        .update({
          normalized_goal: smart.normalized_goal,
          short_label: smart.short_label,
          target_date: smart.target_date,
          success_criteria: smart.success_measures,
          constraints: smart.constraints,
          status: "awaiting_confirmation",
        })
        .eq("id", goalId);
      if (updateError) throw new Error(`Couldn't save the target: ${updateError.message}`);

      await markPassComplete({
        supabase,
        progress,
        key: PASS_TARGET,
        usage: smartResult.usage,
      });
      passesThisRequest += 1;
    } else {
      smart = await loadStoredTarget(supabase, goalId);
    }

    // ---- Audit trail (§20, §23 "Why did Vezri suggest this?") --------------
    const spend = totalUsage(progress);
    console.info(
      `[extract] goal ${goalId} complete: ${Object.keys(progress.passes).length} passes, ` +
        `${spend.inputTokens} in / ${spend.outputTokens} out tokens, attempt ${progress.attempts}.`,
    );

    const [{ count: milestoneCount }, { count: taskCount }, { data: dated }] = await Promise.all([
      supabase.from("milestones").select("id", { count: "exact", head: true }).eq("goal_id", goalId),
      supabase.from("tasks").select("id", { count: "exact", head: true }).eq("goal_id", goalId),
      supabase.from("milestones").select("id, title, target_date, status").eq("goal_id", goalId),
    ]);

    // §14 — a plan brought in after its own start dates is the common case,
    // not an error. It is measured here and reported to the user, who decides.
    const pastPlan = inspectPlanDates({
      today,
      items: (dated ?? []).map((m) => ({
        id: m.id,
        title: m.title,
        date: toDayKey(m.target_date),
        done: m.status === "done",
      })),
    });

    await supabase.from("ai_action_logs").insert([
      {
        user_id: userId,
        goal_id: goalId,
        action_type: "extract_plan",
        structured_input: {
          document_id: document?.id ?? null,
          used_vision: Boolean(image),
          passes: progress.passes,
          usage: progress.usage,
          attempt: progress.attempts,
        },
        structured_output: structure,
        explanation: structure.reasoning,
        model_version: modelVersion,
      },
      {
        user_id: userId,
        goal_id: goalId,
        action_type: "smart_target",
        structured_input: { outcome: structure.outcome, target_date: structure.target_date },
        structured_output: smart,
        explanation: smart.reasoning,
        model_version: modelVersion,
      },
    ]);

    await setExtractionState({ supabase, progress, state: "complete", note: null });
    if (document) {
      await supabase.from("plan_documents").update({ parse_status: "parsed" }).eq("id", document.id);
    }

    return {
      plan: { ...structure, tasks: [] },
      smart,
      milestoneCount: milestoneCount ?? 0,
      taskCount: taskCount ?? 0,
      pastPlan,
    };
  } catch (error) {
    // Whatever landed stays landed. The document records how far it got so the
    // next attempt resumes instead of paying for all of it again.
    const written = await countMilestones(supabase, goalId);
    const batchesTotal = Math.max(1, Math.ceil(written / MILESTONES_PER_TASK_PASS));
    const batchesDone = Object.keys(progress.passes).filter((k) => k.startsWith("tasks:")).length;
    const note = describePartial({ milestonesWritten: written, batchesDone, batchesTotal });

    await setExtractionState({ supabase, progress, state: "failed_partial", note });

    const spend = totalUsage(progress);
    console.error(
      `[extract] goal ${goalId} stopped on attempt ${progress.attempts} after ` +
        `${Object.keys(progress.passes).length} passes ` +
        `(${spend.inputTokens} in / ${spend.outputTokens} out tokens):`,
      error,
    );

    // A misconfiguration is not a partial extraction — it is not retryable and
    // saying "try again" would be wrong.
    if (error instanceof ConfigurationError) throw error;

    // The user gets what survived and what to do about it. The cause is above,
    // in the logs, where it belongs — "Couldn't save tasks: column ... does not
    // exist" is a message for me, not for them.
    throw new AIExtractionError(note);
  }
}
