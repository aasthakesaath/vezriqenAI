import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAIProvider } from "@/lib/ai";
import {
  ExtractedPlanSchema,
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
  extractionPrompt,
  smartPrompt,
} from "@/lib/ai/prompts";
import { calculateStartBy, formatDate, type TaskType } from "./lead-time";

type Client = SupabaseClient;

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

  const basePrompt = extractionPrompt({
    documentText,
    userGoalText: goal.user_goal_text,
    today,
  });

  const extraction = await provider.generateStructured({
    action: "extract_plan",
    system: EXTRACTION_SYSTEM,
    prompt: image ? `${basePrompt}\n\n${VISION_EXTRACTION_NOTE}` : basePrompt,
    schema: ExtractedPlanSchema,
    image,
    effort: "high",
  });

  // Never trust an origin="explicit" claim; check the quote is really there.
  const plan = verifyPlanProvenance(extraction.data, documentText);

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
      structured_input: { document_id: document?.id ?? null, used_vision: Boolean(image) },
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
