import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAIProvider, AITruncationError, type AIProvider } from "@/lib/ai";
import {
  ExtractedPlanStructureSchema,
  ExtractedTaskBatchSchema,
  SmartTargetSchema,
  verifyPlanProvenance,
  type ExtractedPlan,
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
import { calculateStartBy, formatDate, type TaskType } from "./lead-time";

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
}): Promise<{ plan: ExtractedPlan; modelVersion: string; passes: number }> {
  const { provider, documentText, userGoalText, today, image } = options;
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

  const batchResults = await mapLimit(batches, TASK_PASS_CONCURRENCY, async (titlesForBatch, i) => {
    try {
      return (await runBatch(titlesForBatch, i)).data.tasks;
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
};

/**
 * Reads a goal's plan document, extracts structure, and persists it with
 * provenance (PRD §7).
 *
 * Ordering matters: anchors are written first so milestones and tasks can point
 * at them, and every write goes through the caller's RLS-scoped client — the
 * service role is never used here, so a bug cannot cross a user boundary.
 */
export async function buildPlanForGoal(options: {
  supabase: Client;
  userId: string;
  goalId: string;
  today?: string;
}): Promise<BuildResult> {
  const { supabase, userId, goalId } = options;
  const today = options.today ?? formatDate(new Date());

  const { data: goal, error: goalError } = await supabase
    .from("goals")
    .select("id, user_goal_text")
    .eq("id", goalId)
    .single();
  if (goalError || !goal) throw new Error("That goal no longer exists.");

  const { data: documents } = await supabase
    .from("plan_documents")
    .select("id, filename, mime_type, storage_path, extracted_text")
    .eq("goal_id", goalId)
    .order("created_at", { ascending: true });

  const document = documents?.[0] ?? null;
  const documentText = document?.extracted_text ?? null;

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

  const extraction = await extractPlanInPasses({
    provider,
    documentText,
    userGoalText: goal.user_goal_text,
    today,
    image,
  });

  // Never trust an origin="explicit" claim; check the quote is really there.
  const plan = verifyPlanProvenance(extraction.plan, documentText);

  const smartResult = await provider.generateStructured({
    action: "smart_target",
    system: SMART_SYSTEM,
    prompt: smartPrompt({
      outcome: plan.outcome,
      userGoalText: goal.user_goal_text,
      targetDate: plan.target_date,
      successMeasures: plan.success_measures,
      constraints: plan.constraints,
      today,
    }),
    schema: SmartTargetSchema,
    effort: "medium",
  });
  const smart = smartResult.data;

  // ---- Replace any previous extraction for this goal -----------------------
  // Re-running extraction should not duplicate the plan. Tasks cascade from
  // milestones only for the milestone link, so both are cleared explicitly.
  await supabase.from("tasks").delete().eq("goal_id", goalId);
  await supabase.from("milestones").delete().eq("goal_id", goalId);

  // ---- Anchors -------------------------------------------------------------
  const excerpts = new Map<string, string>(); // excerpt -> anchor id
  if (document) {
    const unique = new Set<string>();
    for (const item of [...plan.milestones, ...plan.tasks]) {
      const excerpt = item.provenance.excerpt?.trim();
      if (item.provenance.origin === "explicit" && excerpt) unique.add(excerpt);
    }

    if (unique.size > 0) {
      const rows = [...unique].map((excerpt) => ({
        user_id: userId,
        document_id: document.id,
        excerpt,
        page_or_section: null,
      }));
      const { data: anchors } = await supabase
        .from("plan_source_anchors")
        .insert(rows)
        .select("id, excerpt");
      for (const anchor of anchors ?? []) excerpts.set(anchor.excerpt, anchor.id);
    }
  }

  const anchorFor = (excerpt: string | null, origin: string): string | null =>
    origin === "explicit" && excerpt ? (excerpts.get(excerpt.trim()) ?? null) : null;

  // ---- Milestones ----------------------------------------------------------
  const milestoneRows = plan.milestones.map((milestone, index) => ({
    user_id: userId,
    goal_id: goalId,
    title: milestone.title,
    target_date: milestone.target_date,
    status: milestone.already_complete ? ("done" as const) : ("not_started" as const),
    weight: milestone.weight,
    source_anchor_id: anchorFor(milestone.provenance.excerpt, milestone.provenance.origin),
    origin: milestone.provenance.origin,
    confidence: milestone.provenance.confidence,
    sort_order: index,
  }));

  const milestoneIds = new Map<string, string>(); // title -> id
  if (milestoneRows.length > 0) {
    const { data: inserted, error } = await supabase
      .from("milestones")
      .insert(milestoneRows)
      .select("id, title");
    if (error) throw new Error(`Couldn't save milestones: ${error.message}`);
    for (const row of inserted ?? []) milestoneIds.set(row.title, row.id);
  }

  // ---- Tasks ---------------------------------------------------------------
  const taskRows = plan.tasks.map((task) => {
    const deadline = parseDate(task.deadline);
    const priority = derivePriority(task);
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
      priority,
      status: "not_started" as const,
      recurrence_rule: task.recurrence_rule,
      source_anchor_id: anchorFor(task.provenance.excerpt, task.provenance.origin),
      origin: task.provenance.origin,
      confidence: task.provenance.confidence,
    };
  });

  const taskIds = new Map<string, string>();
  if (taskRows.length > 0) {
    const { data: inserted, error } = await supabase
      .from("tasks")
      .insert(taskRows)
      .select("id, title");
    if (error) throw new Error(`Couldn't save tasks: ${error.message}`);
    for (const row of inserted ?? []) taskIds.set(row.title, row.id);
  }

  // ---- Dependencies --------------------------------------------------------
  const dependencyRows: Array<Record<string, unknown>> = [];
  for (const task of plan.tasks) {
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

  // ---- Goal: SMART target, awaiting the user's confirmation ----------------
  const { error: updateError } = await supabase
    .from("goals")
    .update({
      normalized_goal: smart.normalized_goal,
      target_date: smart.target_date,
      success_criteria: smart.success_measures,
      constraints: smart.constraints,
      status: "awaiting_confirmation",
    })
    .eq("id", goalId);
  if (updateError) throw new Error(`Couldn't save the target: ${updateError.message}`);

  // ---- Audit trail (§20, §23 "Why did Vezri suggest this?") ----------------
  await supabase.from("ai_action_logs").insert([
    {
      user_id: userId,
      goal_id: goalId,
      action_type: "extract_plan",
      structured_input: {
        document_id: document?.id ?? null,
        used_vision: Boolean(image),
        extraction_passes: extraction.passes,
      },
      structured_output: plan,
      explanation: plan.reasoning,
      model_version: extraction.modelVersion,
    },
    {
      user_id: userId,
      goal_id: goalId,
      action_type: "smart_target",
      structured_input: { outcome: plan.outcome, target_date: plan.target_date },
      structured_output: smart,
      explanation: smart.reasoning,
      model_version: smartResult.modelVersion,
    },
  ]);

  if (document) {
    await supabase.from("plan_documents").update({ parse_status: "parsed" }).eq("id", document.id);
  }

  return {
    plan,
    smart,
    milestoneCount: milestoneRows.length,
    taskCount: taskRows.length,
  };
}
