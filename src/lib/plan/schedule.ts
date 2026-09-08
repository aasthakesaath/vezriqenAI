import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { planReminders, type TaskType } from "./lead-time";

/**
 * Materialises the reminder plan for an activated goal (PRD §12).
 *
 * Only ever called from the activate route, so §4.3 holds: Vezri does not
 * schedule anything the user has not confirmed. Reminders in the past are
 * skipped rather than fired retroactively — nobody wants six overdue
 * notifications the moment they press Start Goal.
 */
export async function scheduleRemindersForGoal(options: {
  supabase: SupabaseClient;
  userId: string;
  goalId: string;
}): Promise<number> {
  const { supabase, userId, goalId } = options;

  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, task_type, start_by, deadline, priority, status")
    .eq("goal_id", goalId)
    .in("status", ["not_started", "in_progress"]);

  if (!tasks || tasks.length === 0) return 0;

  // Re-activating must not double the reminder set.
  const taskIds = tasks.map((t) => t.id);
  await supabase
    .from("reminders")
    .delete()
    .in("task_id", taskIds)
    .eq("delivery_status", "pending");

  const now = Date.now();
  const rows: Array<Record<string, unknown>> = [];

  for (const task of tasks) {
    const plans = planReminders({
      startBy: task.start_by ? new Date(task.start_by) : null,
      deadline: task.deadline ? new Date(task.deadline) : null,
      taskType: task.task_type as TaskType,
      priority: task.priority,
    });

    for (const plan of plans) {
      if (plan.scheduledAt.getTime() <= now) continue;
      rows.push({
        user_id: userId,
        task_id: task.id,
        type: plan.type,
        // In-app always works; email is added alongside in Milestone 6 for
        // the important ones only (§12 forbids one email per low-value task).
        channel: "in_app",
        scheduled_at: plan.scheduledAt.toISOString(),
        response_required: plan.responseRequired,
        delivery_status: "pending",
      });
    }
  }

  if (rows.length === 0) return 0;

  const { error } = await supabase.from("reminders").insert(rows);
  if (error) throw new Error(`Couldn't schedule reminders: ${error.message}`);

  return rows.length;
}
