import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_CONFIGURED } from "@/lib/env";

export const runtime = "nodejs";

/**
 * Recording what actually happened (PRD §12).
 *
 * The state the user reports is written to check_ins as an immutable record and
 * mirrored onto the task. "Not done" and "I'm stuck" deliberately do NOT
 * reschedule here — §13 is explicit that they open the Execution Block Coach
 * instead, and quietly moving the task would be the exact failure that section
 * exists to prevent.
 */
const CheckInSchema = z
  .object({
    state: z.enum(["done", "partial", "not_done", "snoozed", "stuck", "waiting_on_someone"]),
    note: z.string().max(2000).optional(),
    /** Only meaningful for `snoozed`. */
    snooze_until: z.string().datetime().optional(),
    reminder_id: z.string().uuid().optional(),
  })
  .strict();

/** How a reported state maps onto the task's own status. */
const TASK_STATUS: Record<string, string> = {
  done: "done",
  partial: "partial",
  not_done: "not_done",
  snoozed: "snoozed",
  stuck: "blocked",
  waiting_on_someone: "blocked",
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const { id } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const parsed = CheckInSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "That check-in isn't valid." }, { status: 400 });
  }
  const { state, note, snooze_until, reminder_id } = parsed.data;

  const { data: task } = await supabase
    .from("tasks")
    .select("id, goal_id, title")
    .eq("id", id)
    .maybeSingle();
  if (!task) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { data: checkIn, error: checkInError } = await supabase
    .from("check_ins")
    .insert({
      user_id: user.id,
      task_id: id,
      reminder_id: reminder_id ?? null,
      state,
      note: note ?? null,
      snooze_until: state === "snoozed" ? (snooze_until ?? null) : null,
    })
    .select("id")
    .single();

  if (checkInError) {
    return NextResponse.json({ error: checkInError.message }, { status: 500 });
  }

  await supabase
    .from("tasks")
    .update({
      status: TASK_STATUS[state],
      completed_at: state === "done" ? new Date().toISOString() : null,
    })
    .eq("id", id);

  // Close the loop on the reminder that asked, so it stops counting as
  // unanswered in Goal Health.
  if (reminder_id) {
    await supabase
      .from("reminders")
      .update({ response: state, responded_at: new Date().toISOString() })
      .eq("id", reminder_id);
  }

  // §13 — these two open the coach rather than rescheduling.
  const needsCoach = state === "not_done" || state === "stuck";

  return NextResponse.json({
    check_in_id: checkIn.id,
    task_id: id,
    state,
    needs_coach: needsCoach,
  });
}
