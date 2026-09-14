import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { loadUserSettings } from "@/lib/user-settings";
import { dayKeyIn } from "@/lib/time-zone";
import { TERMINAL_TASK_STATUSES } from "@/lib/plan/task-status";
import {
  describeStartToday,
  isSafeStartToday,
  planStartFromToday,
  type ShiftableTask,
} from "@/lib/plan/start-today";
import { scheduleRemindersForGoal } from "@/lib/plan/schedule";

export const runtime = "nodejs";

/**
 * "Start my plan from today" (PRD §14, §4.6).
 *
 * The one button that replaced the overdue count on /today. Every open task
 * across every active goal whose own date has passed moves forward by the same
 * number of days, so the oldest becomes due today and the distances between
 * them are exactly what the plan said they were.
 *
 * ONE CALL, NOT TWO. /api/goals/[id]/reshape deliberately proposes first and
 * writes only on confirm, because a reshape re-spaces the work and the user
 * has to see where it lands. This does not re-space anything: it is a single
 * uniform slide, described completely by the button's own label, and it is
 * reversible by moving any date back. A confirmation dialog in front of a
 * one-sentence, one-outcome action is friction, not consent.
 *
 * NOTHING IS DELETED AND NOTHING IS COMPLETED. The only columns this writes on
 * a task are deadline, start_by and date_anchor. Status is not touched, and
 * work with no date at all is not given one.
 */
export async function POST() {
  const auth = await requireUser("tasks/start-from-today");
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const { timeZone } = await loadUserSettings(supabase);
  const today = dayKeyIn(new Date(), timeZone);

  // Active goals only. A draft plan has not been agreed to yet (§4.3), and
  // moving the dates of something nobody has started is Vezri editing a
  // document it was given.
  const { data: goals } = await supabase.from("goals").select("id").eq("status", "active");
  const goalIds = (goals ?? []).map((goal) => goal.id);
  if (goalIds.length === 0) {
    return NextResponse.json({ moved: 0, note: "There is no active plan to move." });
  }

  const { data: taskRows, error: readError } = await supabase
    .from("tasks")
    .select("id, goal_id, title, status, deadline, start_by")
    .in("goal_id", goalIds)
    // Everything except work that is over. Expressed as an exclusion so that
    // a status added to the enum later is moved rather than silently stranded
    // in the past — the failure mode an allow-list has already produced once.
    .not("status", "in", `(${TERMINAL_TASK_STATUSES.join(",")})`);

  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });

  const tasks: ShiftableTask[] = (taskRows ?? []).map((task) => ({
    id: task.id,
    goalId: task.goal_id,
    title: task.title,
    status: task.status,
    deadline: task.deadline,
    startBy: task.start_by,
  }));

  const plan = planStartFromToday({ tasks, today });
  if (!plan) {
    return NextResponse.json({ moved: 0, note: "Nothing in your plan is behind today." });
  }

  if (!isSafeStartToday(plan, today)) {
    // The plan is computed here, so this can only fire if the maths and the
    // rule disagree. It is checked anyway: the alternative to refusing is
    // writing dates nobody intended across every goal at once.
    return NextResponse.json(
      { error: "Vezri couldn't work out a safe way to move those dates." },
      { status: 422 },
    );
  }

  const anchor = `Moved on ${today} when you started your plan from today, by ${plan.shiftDays} days`;

  for (const move of plan.moves) {
    const update: Record<string, unknown> = { date_anchor: anchor };
    if (move.deadline) update.deadline = move.deadline.to;
    if (move.startBy) update.start_by = move.startBy.to;

    const { error } = await supabase
      .from("tasks")
      .update(update)
      .eq("id", move.id)
      .eq("user_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // §14 — a change to the user's own dates is recorded on the goals it touched.
  await supabase
    .from("goals")
    .update({ dates_reshaped_at: new Date().toISOString() })
    .in("id", plan.goalIds)
    .eq("user_id", user.id);

  // §20 — deterministic, and logged with what it was computed from, so
  // "why did this move?" has an answer after the fact.
  await supabase.from("ai_action_logs").insert(
    plan.goalIds.map((goalId) => ({
      user_id: user.id,
      goal_id: goalId,
      action_type: "start_plan_from_today",
      structured_input: { today, oldest_day: plan.oldestDay, shift_days: plan.shiftDays },
      structured_output: { moves: plan.moves.filter((move) => move.goalId === goalId) },
      explanation: describeStartToday(plan),
      model_version: "deterministic",
    })),
  );

  // The reminder set is derived from these dates, so it is rebuilt. Without
  // this every checkpoint still fires against the day the task used to be on.
  let remindersScheduled = 0;
  for (const goalId of plan.goalIds) {
    remindersScheduled += await scheduleRemindersForGoal({ supabase, userId: user.id, goalId });
  }

  return NextResponse.json({
    moved: plan.moves.length,
    shift_days: plan.shiftDays,
    goals_touched: plan.goalIds.length,
    reminders_scheduled: remindersScheduled,
    summary: describeStartToday(plan),
  });
}
