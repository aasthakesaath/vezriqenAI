import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { redeemEmailAction } from "@/lib/reminders/redeem";
import { RETIRED_EMAIL_ACTION_MESSAGE } from "@/lib/reminders/email-actions";
import { SUPABASE_SERVICE_ROLE_KEY } from "@/lib/env";

export const runtime = "nodejs";

const Schema = z.object({ token: z.string().min(10).max(4000) }).strict();

const MESSAGES = {
  invalid: "That link isn't valid.",
  expired: "That link has expired. You can still check in from the app.",
  already_used: "You've already answered this one.",
  not_found: "That link is no longer active.",
  retired_action: RETIRED_EMAIL_ACTION_MESSAGE,
} as const;

/**
 * 410 for an action that no longer exists, not 400 and certainly not 500.
 * The request was well-formed and the token was genuine — the thing it asked
 * for is gone, which is exactly what Gone means.
 */
const STATUS = {
  invalid: 400,
  expired: 400,
  already_used: 409,
  not_found: 400,
  retired_action: 410,
} as const;

/**
 * Redeems an email action link.
 *
 * Deliberately unauthenticated: the signed, single-use, short-lived token IS
 * the credential (PRD §12, §23), which is what lets someone answer from their
 * inbox without signing in first. It runs under the service role because there
 * is no session to scope by, and every write it performs is bound to the
 * user_id stored on the token row.
 */
export async function POST(request: Request) {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: MESSAGES.invalid }, { status: 400 });

  const outcome = await redeemEmailAction({
    admin: createAdminClient(),
    token: decodeURIComponent(parsed.data.token),
  });

  if (!outcome.ok) {
    return NextResponse.json(
      { error: MESSAGES[outcome.reason] },
      { status: STATUS[outcome.reason] },
    );
  }

  return NextResponse.json({
    recorded: outcome.action,
    task_id: outcome.taskId,
    needs_coach: outcome.needsCoach,
  });
}
