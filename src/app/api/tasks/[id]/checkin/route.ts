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
 *
 * `partial` and `snoozed` are gone (owner decision, 2026-09-09). Both are
 * refused here rather than merely dropped from the buttons: each wrote a
 * status that nothing read correctly, and an endpoint that still accepts one
 * is a way for it to come back. See lib/plan/task-status.ts for what each
 * meant and where existing rows go. History keeps its states; the enum keeps
 * its values.
 */
const CheckInSchema = z
  .object({
    state: z.enum(["done", "not_done", "stuck", "waiting_on_someone"]),
    note: z.string().max(2000).optional(),
    reminder_id: z.string().uuid().optional(),
  })
  .strict();

/** How a reported state maps onto the task's own status. */
const TASK_STATUS: Record<string, string> = {
  done: "done",
  not_done: "not_done",
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
  const { state, note, reminder_id } = parsed.data;

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
    })
    .select("id")
    .single();

  if (checkInError) {
    return NextResponse.json({ error: checkInError.message }, { status: 500 });
  }

  // The write the user is actually asking for, and the one whose failure was
  // invisible: this update's error was not checked, so a rejected write still
  // returned 200 and the screen refreshed against unchanged data. A broken
  // button and a working one looked identical. It is fatal now, and the
  // check-in row above is left in place deliberately — it is the record that
  // the user reported something, and deleting it to "tidy up" would lose the
  // one fact we are sure of.
  const { error: taskError } = await supabase
    .from("tasks")
    .update({
      status: TASK_STATUS[state],
      completed_at: state === "done" ? new Date().toISOString() : null,
    })
    .eq("id", id);

  if (taskError) {
    return NextResponse.json(
      { error: "That was recorded, but the task didn't update. Try again." },
      { status: 500 },
    );
  }

  // Close the loop on the reminder that asked, so it stops counting as
  // unanswered in Goal Health.
  //
  // Not fatal, and not ignored either: the check-in landed and the task moved,
  // so failing the whole request would tell the user nothing happened when
  // most of it did — and a retry would write a second check-in. The caller is
  // told instead, and an unanswered checkpoint keeps counting against health,
  // which is the truthful outcome rather than a silent one.
  let checkpointClosed: boolean | null = null;
  if (reminder_id) {
    const { error: reminderError } = await supabase
      .from("reminders")
      .update({ response: state, responded_at: new Date().toISOString() })
      .eq("id", reminder_id);
    checkpointClosed = !reminderError;
  }

  // §13 — these two open the coach rather than rescheduling.
  const needsCoach = state === "not_done" || state === "stuck";

  return NextResponse.json({
    check_in_id: checkIn.id,
    task_id: id,
    state,
    needs_coach: needsCoach,
    checkpoint_closed: checkpointClosed,
  });
}
