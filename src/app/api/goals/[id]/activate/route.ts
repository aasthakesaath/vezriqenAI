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
