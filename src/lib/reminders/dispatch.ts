import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getEmailProvider } from "@/lib/email";
import { buildReminderEmail } from "@/lib/email/templates";
import { hashToken } from "@/lib/crypto/tokens";
import { SITE_URL } from "@/lib/env";

/**
 * Reminder delivery (PRD §12).
 *
 * The contract this function keeps, which the user's brief made explicit and
 * §12 requires:
 *
 *   * The in-app reminder centre works with or without email. A reminder row
 *     exists the moment it is scheduled, so it is already visible in-app before
 *     this function runs. Delivery here is about the email channel only.
 *   * A reminder is marked `sent` only when an email genuinely went out. With
 *     no API key it is marked `suppressed`; on a provider error, `failed`. Both
 *     leave sent_at null, and the reminders table's check constraint makes the
 *     dishonest combination unrepresentable.
 *   * Failures are logged clearly rather than swallowed.
 */

export type DispatchSummary = {
  considered: number;
  emailed: number;
  suppressed: number;
  failed: number;
  /** Present when no provider key is configured, for the caller to surface. */
  notice: string | null;
};

/** §12: "Do not spam users with one email per low-value task." */
function deservesEmail(reminder: { response_required: boolean; priority: number }): boolean {
  if (reminder.response_required) return reminder.priority <= 3;
  return reminder.priority <= 2;
}

export async function dispatchDueReminders(options: {
  admin: SupabaseClient;
  now?: Date;
  limit?: number;
}): Promise<DispatchSummary> {
  const { admin } = options;
  const now = options.now ?? new Date();
  const provider = getEmailProvider();

  const { data: due } = await admin
    .from("reminders")
    .select(
      "id, user_id, task_id, type, response_required, scheduled_at, tasks(id, title, rationale, priority, start_by, deadline, goal_id, goals(normalized_goal, user_goal_text))",
    )
    .eq("delivery_status", "pending")
    .lte("scheduled_at", now.toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(options.limit ?? 100);

  const rows = due ?? [];
  const summary: DispatchSummary = {
    considered: rows.length,
    emailed: 0,
    suppressed: 0,
    failed: 0,
    notice: provider.configured
      ? null
      : "EMAIL_PROVIDER_API_KEY is not set. Reminders are visible in the in-app reminder centre and have been recorded as suppressed, not sent.",
  };

  if (rows.length === 0) return summary;

  // One lookup for the addresses rather than one per reminder.
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, email, name")
    .in("id", userIds);
  const profileFor = new Map((profiles ?? []).map((p) => [p.id, p]));

  const first = <T>(value: T | T[] | null | undefined): T | null =>
    Array.isArray(value) ? (value[0] ?? null) : (value ?? null);

  for (const reminder of rows) {
    const task = first(reminder.tasks) as {
      id: string;
      title: string;
      rationale: string | null;
      priority: number;
      start_by: string | null;
      deadline: string | null;
      goal_id: string;
      goals: unknown;
    } | null;

    if (!task) {
      await admin
        .from("reminders")
        .update({ delivery_status: "failed", failure_reason: "The task no longer exists." })
        .eq("id", reminder.id);
      summary.failed += 1;
      continue;
    }

    const profile = profileFor.get(reminder.user_id);
    const goal = first(task.goals) as {
      normalized_goal?: string | null;
      user_goal_text?: string | null;
    } | null;

    // Not every reminder earns an email; the in-app row already exists either
    // way, so this is a delivery decision, not a visibility one.
    if (!deservesEmail({ response_required: reminder.response_required, priority: task.priority })) {
      await admin
        .from("reminders")
        .update({
          delivery_status: "suppressed",
          failure_reason: "Below the email threshold; shown in the app only.",
        })
        .eq("id", reminder.id);
      summary.suppressed += 1;
      continue;
    }

    if (!profile?.email) {
      await admin
        .from("reminders")
        .update({
          delivery_status: "suppressed",
          failure_reason: "No email address on file; shown in the app only.",
        })
        .eq("id", reminder.id);
      summary.suppressed += 1;
      continue;
    }

    const email = buildReminderEmail({
      recipientName: profile.name?.split(" ")[0] ?? null,
      taskTitle: task.title,
      goalTitle: goal?.normalized_goal ?? goal?.user_goal_text ?? "Your goal",
      rationale: task.rationale,
      startBy: task.start_by ? new Date(task.start_by) : null,
      deadline: task.deadline ? new Date(task.deadline) : null,
      taskId: task.id,
      reminderId: reminder.id,
      siteUrl: SITE_URL,
      responseRequired: reminder.response_required,
    });

    const result = await provider.send({
      to: profile.email,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });

    if (!result.sent) {
      // No key, bad address, or provider failure. All three leave sent_at null.
      await admin
        .from("reminders")
        .update({
          delivery_status: result.reason === "not_configured" ? "suppressed" : "failed",
          failure_reason: result.detail,
        })
        .eq("id", reminder.id);

      if (result.reason === "not_configured") summary.suppressed += 1;
      else summary.failed += 1;
      continue;
    }

    // Only now, with delivery confirmed, are the action links armed.
    if (email.tokens.length > 0) {
      await admin.from("email_action_tokens").insert(
        email.tokens.map((entry) => ({
          user_id: reminder.user_id,
          task_id: task.id,
          reminder_id: reminder.id,
          action: entry.action,
          token_hash: hashToken(entry.token),
          expires_at: entry.expiresAt.toISOString(),
        })),
      );
    }

    await admin
      .from("reminders")
      .update({ delivery_status: "sent", sent_at: new Date().toISOString() })
      .eq("id", reminder.id);
    summary.emailed += 1;
  }

  if (!provider.configured && summary.suppressed > 0) {
    console.warn(
      `[vezriqen:reminders] ${summary.suppressed} reminder(s) were NOT emailed because ` +
        `EMAIL_PROVIDER_API_KEY is not set. They remain visible in the in-app reminder centre ` +
        `and are recorded as suppressed. No reminder has been marked as sent.`,
    );
  }

  return summary;
}
