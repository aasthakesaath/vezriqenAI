import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { planReminders, type TaskType } from "./lead-time";
import { WINDOW_TIME, reminderInstant } from "@/lib/reminders/send-time";
import { loadUserSettings } from "@/lib/user-settings";
import { dayKeyIn, toDayKey } from "@/lib/time-zone";

/**
 * Materialises the reminder plan for an activated goal (PRD §12).
 *
 * Only ever called from the activate route, so §4.3 holds: Vezri does not
 * schedule anything the user has not confirmed.
 *
 * WHAT HAPPENS TO A PLAN THAT IS ALREADY BEHIND. This used to drop every
 * reminder dated in the past, which sounds prudent and was in fact the reason
 * the reminder centre was empty: a plan uploaded after its own start dates —
 * the common case, since people bring Vezri a plan they are already behind on
 * — produced reminders that were ALL in the past, so nothing was inserted at
 * all. An empty screen is not restraint; it is the product silently declining
 * to do its one job.
 *
 * So the two kinds are treated differently, which is what the original comment
 * was reaching for:
 *
 *   heads-up      dropped when past. A nudge that work is about to begin is
 *                 worthless once it has begun, and §12 calls it informational.
 *   checkpoint    kept, and brought forward to now. This is the one that
 *                 closes the loop and makes the Execution Block Coach
 *                 reachable, and "did this happen?" is still a live question
 *                 for work that slipped. It surfaces in the in-app centre as
 *                 due, which is a list, not six pings.
 *
 * WHAT TIME OF DAY. A reminder date is a DAY; the moment it lands is chosen
 * here, on the user's clock, from their productive window and outside their
 * quiet hours. Before this it was implicit — the date string parsed as
 * midnight UTC — so every reminder arrived at 6 or 7 PM the evening BEFORE for
 * anyone west of Greenwich.
 */
export async function scheduleRemindersForGoal(options: {
  supabase: SupabaseClient;
  userId: string;
  goalId: string;
}): Promise<number> {
  const { supabase, userId, goalId } = options;
  const settings = await loadUserSettings(supabase);
  const localTime = WINDOW_TIME[settings.productiveWindow];

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
  const today = dayKeyIn(new Date(now), settings.timeZone);
  const rows: Array<Record<string, unknown>> = [];

  for (const task of tasks) {
    const plans = planReminders({
      startBy: task.start_by ? new Date(task.start_by) : null,
      deadline: task.deadline ? new Date(task.deadline) : null,
      taskType: task.task_type as TaskType,
      priority: task.priority,
    });

    for (const plan of plans) {
      // The day the reminder belongs to, then the time of day on that day.
      const day = toDayKey(plan.scheduledAt);
      if (!day) continue;
      const at = reminderInstant({
        day,
        time: localTime,
        timeZone: settings.timeZone,
        quietStart: settings.quietHoursStart,
        quietEnd: settings.quietHoursEnd,
      });

      const isPast = day < today || at.getTime() <= now;

      // A heads-up about work that has already started is noise.
      if (isPast && plan.type === "heads_up") continue;

      // A checkpoint that came due before the goal was started is still worth
      // asking; it arrives as due rather than as a missed date.
      const scheduledAt = isPast ? new Date(now) : at;

      rows.push({
        user_id: userId,
        task_id: task.id,
        type: plan.type,
        // In-app always works; email is added alongside in Milestone 6 for
        // the important ones only (§12 forbids one email per low-value task).
        channel: "in_app",
        scheduled_at: scheduledAt.toISOString(),
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
