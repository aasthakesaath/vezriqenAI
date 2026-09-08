import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { hashToken, verifyEmailActionToken } from "@/lib/crypto/tokens";

/**
 * Redeeming an email action link (PRD §12, §23).
 *
 * Three independent checks, in order: the HMAC signature, the expiry carried
 * inside the signed payload, and the single-use row in the database. The
 * signature stops forgery, the expiry stops an old link working forever, and
 * the row stops a forwarded email acting twice.
 */

export type RedeemOutcome =
  | { ok: true; taskId: string; action: "done" | "snooze" | "stuck"; needsCoach: boolean }
  | { ok: false; reason: "invalid" | "expired" | "already_used" | "not_found" };

export async function redeemEmailAction(options: {
  admin: SupabaseClient;
  token: string;
  now?: Date;
}): Promise<RedeemOutcome> {
  const now = options.now ?? new Date();

  const verified = verifyEmailActionToken(options.token, now);
  if (!verified.valid) {
    return { ok: false, reason: verified.reason === "expired" ? "expired" : "invalid" };
  }

  // Only the hash is stored, so a database leak cannot be replayed as links.
  const { data: row } = await options.admin
    .from("email_action_tokens")
    .select("id, user_id, task_id, reminder_id, action, used_at, expires_at")
    .eq("token_hash", hashToken(options.token))
    .maybeSingle();

  if (!row) return { ok: false, reason: "not_found" };
  if (row.used_at) return { ok: false, reason: "already_used" };
  if (new Date(row.expires_at).getTime() < now.getTime()) return { ok: false, reason: "expired" };

  const state =
    row.action === "done" ? "done" : row.action === "snooze" ? "snoozed" : "stuck";

  await options.admin.from("check_ins").insert({
    user_id: row.user_id,
    task_id: row.task_id,
    reminder_id: row.reminder_id,
    state,
    snooze_until:
      row.action === "snooze" ? new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString() : null,
  });

  await options.admin
    .from("tasks")
    .update({
      status: row.action === "done" ? "done" : row.action === "snooze" ? "snoozed" : "blocked",
      completed_at: row.action === "done" ? now.toISOString() : null,
    })
    .eq("id", row.task_id);

  if (row.reminder_id) {
    await options.admin
      .from("reminders")
      .update({ response: state, responded_at: now.toISOString() })
      .eq("id", row.reminder_id);
  }

  // Burn this token, and every sibling issued for the same reminder — once the
  // user has answered, the other buttons in that email must stop working.
  await options.admin
    .from("email_action_tokens")
    .update({ used_at: now.toISOString() })
    .eq("reminder_id", row.reminder_id)
    .is("used_at", null);

  return {
    ok: true,
    taskId: row.task_id,
    action: row.action as "done" | "snooze" | "stuck",
    // §13 — "I'm stuck" opens the coach rather than rescheduling.
    needsCoach: row.action === "stuck",
  };
}
