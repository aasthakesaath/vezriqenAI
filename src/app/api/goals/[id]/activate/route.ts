import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_CONFIGURED } from "@/lib/env";
import { scheduleRemindersForGoal } from "@/lib/plan/schedule";

export const runtime = "nodejs";

/**
 * Start Goal (PRD §5 Step 6).
 *
 * This is the confirmation gate §4.3 requires: nothing is scheduled and no
 * reminder exists until the user presses the button. Activation is also where
 * the reminder plan is materialised, so an unactivated goal never nags.
 */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const { id } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const { data: goal, error: goalError } = await supabase
    .from("goals")
    .select("id, status, normalized_goal")
    .eq("id", id)
    .maybeSingle();

  if (goalError) return NextResponse.json({ error: goalError.message }, { status: 500 });
  if (!goal) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!goal.normalized_goal) {
    return NextResponse.json(
      { error: "Vezri hasn't read your plan yet." },
      { status: 409 },
    );
  }

  // A half-read plan must never start. Extraction is resumable now, so a run
  // that stopped partway leaves real milestones and a real target behind — and
  // without this check a plan missing most of its steps would schedule
  // reminders and look finished.
  const { data: document } = await supabase
    .from("plan_documents")
    .select("extraction_state, extraction_note")
    .eq("goal_id", id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (document?.extraction_state === "failed_partial") {
    return NextResponse.json(
      {
        error:
          document.extraction_note ??
          "Vezri didn't finish reading your plan. Try again before starting this goal.",
      },
      { status: 409 },
    );
  }

  const { error: updateError } = await supabase
    .from("goals")
    .update({ status: "active", activated_at: new Date().toISOString() })
    .eq("id", id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const scheduled = await scheduleRemindersForGoal({ supabase, userId: user.id, goalId: id });

  // First goal becomes primary automatically — one fewer decision (§4.7).
  const { count } = await supabase
    .from("goals")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");
  if ((count ?? 0) === 1) {
    await supabase.from("goals").update({ primary_flag: true }).eq("id", id);
  }

  return NextResponse.json({ goal_id: id, status: "active", reminders_scheduled: scheduled });
}
