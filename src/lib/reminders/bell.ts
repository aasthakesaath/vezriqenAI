import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BellReminder } from "@/components/app/ReminderBell";

/**
 * What the header bell shows: due now, and recently answered.
 *
 * Deliberately NOT filtered to `scheduled_at <= now`, which is what the old
 * /reminders page did. That filter hid every upcoming reminder, so on top of
 * none being created for a behind plan, any that did exist were invisible
 * until their moment arrived. Upcoming ones are worth seeing.
 */
export async function loadBellReminders(options: {
  supabase: SupabaseClient;
  now?: Date;
  limit?: number;
}): Promise<BellReminder[]> {
  const { supabase } = options;
  const now = options.now ?? new Date();

  const { data } = await supabase
    .from("reminders")
    .select("id, task_id, scheduled_at, response_required, response, tasks(id, title)")
    .order("scheduled_at", { ascending: false })
    .limit(options.limit ?? 20);

  return (data ?? []).map((row) => {
    const task = Array.isArray(row.tasks) ? row.tasks[0] : row.tasks;
    return {
      id: row.id,
      taskId: row.task_id ?? null,
      taskTitle: (task as { title?: string } | null)?.title ?? "A task",
      scheduledAt: row.scheduled_at,
      due: new Date(row.scheduled_at).getTime() <= now.getTime(),
      // §12 — an unanswered checkpoint is unconfirmed, never done.
      answered: !row.response_required || row.response !== null,
    };
  });
}
