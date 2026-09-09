import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { hashToken, verifyEmailActionToken } from "@/lib/crypto/tokens";
import { isEmailAction, type EmailAction } from "./email-actions";

/**
 * Redeeming an email action link (PRD §12, §23).
 *
 * Three independent checks, in order: the HMAC signature, the expiry carried
 * inside the signed payload, and the single-use row in the database. The
 * signature stops forgery, the expiry stops an old link working forever, and
 * the row stops a forwarded email acting twice.
 */

export type RedeemOutcome =
  | { ok: true; taskId: string; action: EmailAction; needsCoach: boolean }
  | {
      ok: false;
      reason: "invalid" | "expired" | "already_used" | "not_found" | "retired_action";
    };

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

  // An action this product no longer offers — a link from an email sent before
  // it was cut. Checked BEFORE anything is written, and it writes nothing at
  // all: not the check-in, not the task, not even a used_at stamp on the
  // token. There is nothing truthful to record, and stamping the token would
  // turn the second tap into "you've already answered this one", which is not
  // what happened.
  if (!isEmailAction(row.action)) {
    return { ok: false, reason: "retired_action" };
  }
  const action: EmailAction = row.action;

  const state = action === "done" ? "done" : action === "not_done" ? "not_done" : "stuck";

  await options.admin.from("check_ins").insert({
    user_id: row.user_id,
    task_id: row.task_id,
    reminder_id: row.reminder_id,
    state,
  });

  await options.admin
    .from("tasks")
    .update({
      // The same mapping the in-app check-in uses: "I'm stuck" is `blocked`,
      // and "Not done" stays `not_done` rather than being tidied into
      // something that reads as progress.
      status: action === "done" ? "done" : action === "not_done" ? "not_done" : "blocked",
      completed_at: action === "done" ? now.toISOString() : null,
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
    action,
    // §13 — both of these open the coach rather than rescheduling, exactly as
    // they do in the app.
    needsCoach: action === "stuck" || action === "not_done",
  };
}
