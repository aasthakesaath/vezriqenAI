import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchDueReminders } from "@/lib/reminders/dispatch";
import { SUPABASE_SERVICE_ROLE_KEY } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // No secret configured means the endpoint stays shut, rather than open.
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const provided = header.replace(/^Bearer\s+/i, "");
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Reminder delivery run (PRD §12, §22 "durable scheduled job system").
 *
 * Called on a schedule with a shared secret. Returns the delivery summary so a
 * missing email key is visible in the run output rather than silently absorbed.
 */
export async function POST(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const summary = await dispatchDueReminders({ admin: createAdminClient() });
  return NextResponse.json(summary);
}

/** Vercel Cron issues GET; same guard, same work. */
export async function GET(request: Request) {
  return POST(request);
}
