import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_CONFIGURED } from "@/lib/env";
import { loadUserSettings } from "@/lib/user-settings";
import { dayKeyIn } from "@/lib/time-zone";
import { OPEN_TASK_STATUSES } from "@/lib/plan/task-status";
import { isSafeSlide, planSlideToToday } from "@/lib/plan/start-today";
import { scheduleRemindersForGoal } from "@/lib/plan/schedule";

export const runtime = "nodejs";

/**
 * "Start my plan from today."
 *
 * The one button that replaced the overdue count on /today. It slides every
 * open task whose date is already behind forward by a single offset, so the
 * oldest becomes due today and the gaps between everything else survive
 * exactly as they were. lib/plan/start-today.ts holds the arithmetic and the
 * reasoning; this is the query, the guard and the write.
 *
 * ONE CALL, NOT TWO. /api/goals/[id]/reshape deliberately proposes first and
 * applies second, because it REDISTRIBUTES work across a runway and the user
 * has to see what it decided before agreeing to it. This does not decide
 * anything: it is a translation, the button says exactly what it does, and a
 * confirmation step in front of a one-sentence action is a second tap for no
 * information.
 *
 * Nothing is deleted. Nothing is completed. Nothing whose date is still ahead
 * of today is touched — a date somebody else set is not Vezri's to move (§14).
 */
export async function POST() {
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const { timeZone } = await loadUserSettings(supabase);
  const today = dayKeyIn(new Date(), timeZone);

  const { data: goals } = await supabase.from("goals").select("id").eq("status", "active");
  const goalIds = (goals ?? []).map((goal) => goal.id);
  if (goalIds.length === 0) {
    return NextResponse.json({ moved: 0, note: "Nothing is active yet." });
  }

  const { data: taskRows, error: readError } = await supabase
    .from("tasks")
    .select("id, goal_id, deadline, start_by")
    .in("goal_id", goalIds)
    .in("status", [...OPEN_TASK_STATUSES])
    // A task that was broken into pieces is represented by its pieces now.
    // Sliding it as well would move work that is no longer being offered.
    .is("split_at", null);

  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });

  const tasks = (taskRows ?? []).map((task) => ({
    id: task.id,
    deadline: task.deadline,
    startBy: task.start_by,
  }));

  const plan = planSlideToToday({ tasks, today });
  if (!plan) {
    return NextResponse.json({
      moved: 0,
      note: "Nothing on your plan is behind today, so there is nothing to move.",
    });
  }

  if (!isSafeSlide(plan, today)) {
    // The plan is computed here, so this can only fire if the rule and the
    // arithmetic ever disagree. Writing dates the user did not ask for is the
    // one outcome worth refusing outright.
    return NextResponse.json(
      { error: "Vezri couldn't work out a shift that lands your oldest task on today." },
      { status: 422 },
    );
  }

  const goalOf = new Map((taskRows ?? []).map((task) => [task.id, task.goal_id]));
  const touchedGoals = new Set<string>();

  for (const move of plan.moves) {
    const from = move.fromDeadline ?? move.fromStartBy;
    const { error } = await supabase
      .from("tasks")
      .update({
        deadline: move.toDeadline,
        // start_by is SHIFTED, not recomputed. A reshape recalculates it
        // because the deadline moved by a different amount than the start did;
        // here the whole task translates rigidly, so the lead time the §9
        // engine worked out is still exactly the right lead time.
        start_by: move.toStartBy,
        date_anchor: `Moved on ${today}, from ${from}, when you started your plan from today`,
      })
      .eq("id", move.id)
      .eq("user_id", user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const goalId = goalOf.get(move.id);
    if (goalId) touchedGoals.add(goalId);
  }

  // §20 — a change to the user's own dates is recorded with what it was based
  // on, so "why is this due today?" has an answer after the fact.
  await supabase.from("ai_action_logs").insert({
    user_id: user.id,
    goal_id: touchedGoals.size === 1 ? [...touchedGoals][0] : null,
    action_type: "start_plan_from_today",
    structured_input: { today, oldest_day: plan.oldestDay, time_zone: timeZone },
    structured_output: { offset_days: plan.offsetDays, moves: plan.moves },
    explanation: `Moved ${plan.moves.length} open ${plan.moves.length === 1 ? "task" : "tasks"} forward by ${plan.offsetDays} days, so the oldest is due today and the gaps between them are unchanged.`,
    model_version: "deterministic",
  });

  // The reminder set is derived from these dates, so it is rebuilt for every
  // goal that moved. A reminder still pointing at last month's date is how a
  // "fixed" plan starts sending notifications about days that have gone.
  let rescheduled = 0;
  for (const goalId of touchedGoals) {
    rescheduled += await scheduleRemindersForGoal({ supabase, userId: user.id, goalId });
  }

  return NextResponse.json({
    moved: plan.moves.length,
    offset_days: plan.offsetDays,
    goals_touched: touchedGoals.size,
    reminders_scheduled: rescheduled,
  });
}
