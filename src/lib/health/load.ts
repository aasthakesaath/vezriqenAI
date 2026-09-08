import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateHealth, timelineElapsed, type HealthInputs, type HealthResult } from "./score";
import { detectGaps, selectTopGaps, type AuditInputs, type Gap } from "./audit";

/**
 * Gathers everything Goal Health and the audit need in one pass.
 *
 * Both features read the same rows, so loading twice would double the queries
 * and risk the two disagreeing about the same goal at the same moment.
 */
export type GoalSnapshot = {
  goal: {
    id: string;
    /** The six-word name. Without it goalLabel falls back to a cut statement. */
    short_label: string | null;
    normalized_goal: string | null;
    user_goal_text: string | null;
    target_date: string | null;
    success_criteria: string[];
    status: string;
    activated_at: string | null;
    primary_flag: boolean;
  };
  health: HealthResult;
  gaps: Gap[];
  topGaps: Gap[];
  healthInputs: HealthInputs;
  /**
   * task_id -> reminder_id for checkpoints that came due and were never
   * answered. The rows are already loaded for the health calculation, so the
   * goal page gets the map for free rather than asking the database the same
   * question a second time — and a check-in that carries the reminder id
   * closes the loop, which is what stops it counting against health forever.
   */
  reminderFor: Map<string, string>;
};

function toDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Writes the score AND the numbers it came from (§15).
 *
 * §15 requires the inputs to be stored alongside the result, and they were not:
 * the score was computed on every page render and thrown away. When a goal read
 * 73 and the same formula on the same rows later gave 48, there was no way to
 * recover which state produced the 73 — that gap is the bug this closes.
 *
 * Deduplicated on (score, status) against the most recent row, so a table that
 * would otherwise gain a row per page view only gains one when something
 * actually changed. Best-effort: a goal page must not fail to render because
 * its audit trail could not be written.
 */
async function recordHealthSnapshot(options: {
  supabase: SupabaseClient;
  goalId: string;
  health: HealthResult;
  inputs: HealthInputs;
}): Promise<void> {
  const { supabase, goalId, health, inputs } = options;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: last } = await supabase
    .from("goal_audits")
    .select("health_score, health_status")
    .eq("goal_id", goalId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (last?.health_score === health.score && last?.health_status === health.status) return;

  const { error } = await supabase.from("goal_audits").insert({
    user_id: user.id,
    goal_id: goalId,
    health_score: health.score,
    health_status: health.status,
    // The factor table as rendered, plus the raw counts behind it — enough to
    // reproduce the arithmetic later without the rows it was read from.
    health_inputs: {
      factors: health.factors,
      computed_at: inputs.now.toISOString(),
      plan_start: inputs.planStart?.toISOString() ?? null,
      activated_at: inputs.activatedAt?.toISOString() ?? null,
      target_date: inputs.targetDate?.toISOString() ?? null,
      elapsed: timelineElapsed(inputs),
      milestones_total: inputs.milestones.length,
      milestone_weight: inputs.milestones.reduce((sum, m) => sum + m.weight, 0),
      milestone_weight_done: inputs.milestones
        .filter((m) => m.status === "done")
        .reduce((sum, m) => sum + m.weight, 0),
      tasks_open: inputs.tasks.filter((t) => t.status !== "done").length,
      checkpoints_due: inputs.checkpointsDue,
      checkpoints_unanswered: inputs.unansweredCheckpoints.length,
      dependencies_due: inputs.dependenciesDue,
      dependencies_overdue: inputs.overdueDependencies,
    },
  });

  if (error) console.warn(`[health] could not record the score for ${goalId}: ${error.message}`);
}

export async function loadGoalSnapshot(options: {
  supabase: SupabaseClient;
  goalId: string;
  now?: Date;
  /**
   * The audit route writes its own richer row, so it turns this off rather than
   * recording the same computation twice.
   */
  persist?: boolean;
}): Promise<GoalSnapshot | null> {
  const { supabase, goalId } = options;
  const now = options.now ?? new Date();

  const { data: goal } = await supabase
    .from("goals")
    .select(
      "id, short_label, normalized_goal, user_goal_text, target_date, success_criteria, constraints, status, activated_at, primary_flag",
    )
    .eq("id", goalId)
    .maybeSingle();

  if (!goal) return null;

  const [{ data: milestones }, { data: tasks }, { data: reminders }, { data: blocks }, { data: deps }] =
    await Promise.all([
      supabase
        .from("milestones")
        .select("id, title, status, weight, target_date")
        .eq("goal_id", goalId),
      supabase
        .from("tasks")
        .select("id, title, status, priority, deadline, start_by, estimated_minutes, milestone_id")
        .eq("goal_id", goalId),
      // Every checkpoint that has come DUE, answered or not. The unanswered
      // ones are picked out below: a factor needs its denominator, or "none
      // unanswered" and "none asked" become the same number.
      supabase
        .from("reminders")
        .select("id, task_id, response, response_required, scheduled_at, tasks!inner(goal_id, title, priority)")
        .eq("tasks.goal_id", goalId)
        .eq("response_required", true)
        .lte("scheduled_at", now.toISOString()),
      supabase
        .from("execution_blocks")
        .select("id, category, tasks!inner(goal_id, title)")
        .eq("tasks.goal_id", goalId)
        .is("resolved_at", null),
      supabase
        .from("task_dependencies")
        .select("id, external_party_name, dependency_type, resolved_at, tasks!inner(goal_id, title, start_by)")
        .eq("tasks.goal_id", goalId),
    ]);

  const taskRows = tasks ?? [];
  const milestoneRows = milestones ?? [];

  type TaskJoin = { goal_id: string; title: string; priority?: number; start_by?: string | null };
  const joined = <T>(value: T | T[] | null): T | null =>
    Array.isArray(value) ? (value[0] ?? null) : value;

  const checkpointsDue = (reminders ?? []).length;
  // Answered ones are still fetched, because the factor needs its denominator
  // — but only an UNANSWERED checkpoint is something a task card can offer to
  // answer, so this map is built from those alone.
  const openCheckpoints = (reminders ?? []).filter((row) => row.response === null);

  const reminderFor = new Map<string, string>();
  for (const row of openCheckpoints) reminderFor.set(row.task_id, row.id);

  const unansweredCheckpoints = openCheckpoints.map((row) => {
    const task = joined(row.tasks as unknown as TaskJoin | TaskJoin[]);
    return {
      taskTitle: task?.title ?? "",
      priority: task?.priority ?? 3,
      dueAt: new Date(row.scheduled_at),
    };
  });

  const dependencyRows = (deps ?? []).map((row) => {
    const task = joined(row.tasks as unknown as TaskJoin | TaskJoin[]);
    return {
      externalParty: row.external_party_name,
      taskTitle: task?.title ?? "",
      resolved: Boolean(row.resolved_at),
      // A follow-up exists when another open task mentions the same person.
      hasFollowUp: taskRows.some(
        (t) =>
          row.external_party_name &&
          t.title.toLowerCase().includes(row.external_party_name.toLowerCase()) &&
          t.title !== task?.title,
      ),
      startBy: toDate(task?.start_by ?? null),
    };
  });

  const unresolvedBlocks = (blocks ?? []).map((row) => {
    const task = joined(row.tasks as unknown as TaskJoin | TaskJoin[]);
    return { taskTitle: task?.title ?? "", category: row.category as string };
  });

  // The earliest date the PLAN names, from every dated thing in it. This is
  // the clock the milestone factor runs on: a plan written for an August start
  // and uploaded in September is a month in, not starting fresh.
  const planDates = [
    ...milestoneRows.map((m) => toDate(m.target_date)),
    ...taskRows.map((t) => toDate(t.start_by)),
    ...taskRows.map((t) => toDate(t.deadline)),
  ].filter((date): date is Date => date !== null);
  const planStart = planDates.length
    ? new Date(Math.min(...planDates.map((d) => d.getTime())))
    : null;

  const dependenciesDue = dependencyRows.filter(
    (d) => d.externalParty && d.startBy && d.startBy.getTime() < now.getTime(),
  ).length;

  const healthInputs: HealthInputs = {
    now,
    targetDate: toDate(goal.target_date),
    activatedAt: toDate(goal.activated_at),
    planStart,
    milestones: milestoneRows.map((m) => ({
      weight: m.weight,
      status: m.status,
      targetDate: toDate(m.target_date),
    })),
    tasks: taskRows.map((t) => ({
      status: t.status,
      priority: t.priority,
      deadline: toDate(t.deadline),
      startBy: toDate(t.start_by),
      estimatedMinutes: t.estimated_minutes,
    })),
    unansweredCheckpoints: unansweredCheckpoints.map((c) => ({ priority: c.priority })),
    checkpointsDue,
    overdueDependencies: dependencyRows.filter(
      (d) => !d.resolved && d.externalParty && d.startBy && d.startBy.getTime() < now.getTime(),
    ).length,
    dependenciesDue,
    // Evidence tracking lands with the deliverables surface; until then the
    // factor stays neutral rather than inventing a shortfall.
    evidenceRequired: 0,
    evidenceProvided: 0,
    availableMinutes: null,
  };

  const health = calculateHealth(healthInputs);

  if (options.persist !== false) {
    await recordHealthSnapshot({ supabase, goalId, health, inputs: healthInputs });
  }

  const auditInputs: AuditInputs = {
    now,
    targetDate: healthInputs.targetDate,
    successMeasures: (goal.success_criteria as string[]) ?? [],
    milestones: milestoneRows.map((m) => ({
      id: m.id,
      title: m.title,
      status: m.status,
      taskCount: taskRows.filter((t) => t.milestone_id === m.id).length,
    })),
    dependencies: dependencyRows,
    evidenceRequired: [],
    evidenceProvided: [],
    unansweredCheckpoints,
    unresolvedBlocks,
    requiredMinutes: taskRows
      .filter((t) => t.status === "not_started" || t.status === "in_progress")
      .reduce((sum, t) => sum + (t.estimated_minutes ?? 0), 0),
    availableMinutes: null,
  };

  const gaps = detectGaps(auditInputs);

  return {
    goal: {
      id: goal.id,
      short_label: goal.short_label,
      normalized_goal: goal.normalized_goal,
      user_goal_text: goal.user_goal_text,
      target_date: goal.target_date,
      success_criteria: (goal.success_criteria as string[]) ?? [],
      status: goal.status,
      activated_at: goal.activated_at,
      primary_flag: goal.primary_flag,
    },
    health,
    gaps,
    topGaps: selectTopGaps(gaps),
    healthInputs,
    reminderFor,
  };
}
