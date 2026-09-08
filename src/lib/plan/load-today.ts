import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { backlogSummary, selectTodayCards, selectWaitingOn, type CandidateTask } from "./today";

/** Loads every open task across the user's active goals and picks the day's cards. */
export async function loadToday(options: { supabase: SupabaseClient; now?: Date }) {
  const { supabase } = options;
  const now = options.now ?? new Date();

  const { data: goals } = await supabase
    .from("goals")
    .select("id, normalized_goal, short_label, user_goal_text, health_status, primary_flag, status")
    .eq("status", "active");

  const activeGoals = goals ?? [];
  if (activeGoals.length === 0) {
    return {
      cards: [],
      waitingOn: [],
      backlog: { behindCount: 0, planBehind: false },
      goals: [],
      milestones: [],
      tasks: [],
      reminderFor: new Map<string, string>(),
    };
  }

  const goalIds = activeGoals.map((g) => g.id);

  const [{ data: tasks }, { data: openReminders }, { data: dependencies }, { data: milestones }] =
    await Promise.all([
    supabase
      .from("tasks")
      .select("id, goal_id, milestone_id, title, rationale, task_type, priority, deadline, start_by, estimated_minutes, status")
      .in("goal_id", goalIds)
      .in("status", ["not_started", "in_progress", "unconfirmed", "partial"]),
    supabase
      .from("reminders")
      .select("id, task_id, scheduled_at")
      .eq("response_required", true)
      .is("response", null)
      .lte("scheduled_at", now.toISOString()),
    supabase
      .from("task_dependencies")
      .select("task_id, external_party_name, resolved_at")
      .eq("dependency_type", "external_person")
      .is("resolved_at", null),
    // The milestone is the context a task card actually needs — the goal
    // statement is 60 words and belongs once, at the top.
    supabase
      .from("milestones")
      .select("id, goal_id, title, target_date, status")
      .in("goal_id", goalIds)
      .order("target_date", { ascending: true, nullsFirst: false }),
  ]);

  const awaiting = new Map<string, string>(); // task_id -> reminder_id
  for (const reminder of openReminders ?? []) awaiting.set(reminder.task_id, reminder.id);

  const blockedOnPerson = new Set((dependencies ?? []).map((d) => d.task_id));

  // Who each blocked task is waiting on. §3 keeps this to a NAME on the card:
  // no invitation, no account for that person, no email to them.
  const waitingOnName = new Map<string, string>();
  for (const dependency of dependencies ?? []) {
    if (dependency.external_party_name) {
      waitingOnName.set(dependency.task_id, dependency.external_party_name);
    }
  }

  const goalTitle = new Map(
    activeGoals.map((g) => [g.id, g.normalized_goal ?? g.user_goal_text ?? "Your goal"]),
  );
  const goalLabel = new Map(activeGoals.map((g) => [g.id, g.short_label ?? null]));
  const milestoneTitle = new Map((milestones ?? []).map((m) => [m.id, m.title]));

  const candidates: CandidateTask[] = (tasks ?? []).map((task) => ({
    id: task.id,
    goalId: task.goal_id,
    goalTitle: goalTitle.get(task.goal_id) ?? "Your goal",
    goalLabel: goalLabel.get(task.goal_id) ?? null,
    milestoneTitle: task.milestone_id ? (milestoneTitle.get(task.milestone_id) ?? null) : null,
    // The name lives on task_dependencies, not on the task itself.
    externalPartyName: waitingOnName.get(task.id) ?? null,
    title: task.title,
    rationale: task.rationale,
    taskType: task.task_type,
    priority: task.priority,
    deadline: task.deadline ? new Date(task.deadline) : null,
    startBy: task.start_by ? new Date(task.start_by) : null,
    estimatedMinutes: task.estimated_minutes,
    status: task.status,
    awaitingCheckpoint: awaiting.has(task.id),
    blockedOnPerson: blockedOnPerson.has(task.id),
  }));

  return {
    cards: selectTodayCards(candidates, { now }),
    waitingOn: selectWaitingOn(candidates),
    backlog: backlogSummary(candidates, { now }),
    goals: activeGoals,
    milestones: milestones ?? [],
    tasks: candidates,
    reminderFor: awaiting,
  };
}
