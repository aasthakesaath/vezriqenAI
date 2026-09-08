import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { selectTodayCards, selectWaitingOn, type CandidateTask } from "./today";

/** Loads every open task across the user's active goals and picks the day's cards. */
export async function loadToday(options: { supabase: SupabaseClient; now?: Date }) {
  const { supabase } = options;
  const now = options.now ?? new Date();

  const { data: goals } = await supabase
    .from("goals")
    .select("id, normalized_goal, user_goal_text, health_status, primary_flag, status")
    .eq("status", "active");

  const activeGoals = goals ?? [];
  if (activeGoals.length === 0) {
    return { cards: [], waitingOn: [], goals: [], openCheckpoints: [] };
  }

  const goalIds = activeGoals.map((g) => g.id);

  const [{ data: tasks }, { data: openReminders }, { data: dependencies }] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, goal_id, title, rationale, task_type, priority, deadline, start_by, estimated_minutes, status")
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
  ]);

  const awaiting = new Map<string, string>(); // task_id -> reminder_id
  for (const reminder of openReminders ?? []) awaiting.set(reminder.task_id, reminder.id);

  const blockedOnPerson = new Set((dependencies ?? []).map((d) => d.task_id));

  const goalTitle = new Map(
    activeGoals.map((g) => [g.id, g.normalized_goal ?? g.user_goal_text ?? "Your goal"]),
  );

  const candidates: CandidateTask[] = (tasks ?? []).map((task) => ({
    id: task.id,
    goalId: task.goal_id,
    goalTitle: goalTitle.get(task.goal_id) ?? "Your goal",
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
    goals: activeGoals,
    reminderFor: awaiting,
  };
}
