import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_CONFIGURED } from "@/lib/env";
import { loadUserSettings } from "@/lib/user-settings";
import { dayKeyIn, toDayKey } from "@/lib/time-zone";
import {
  describePastPlan,
  inspectPlanDates,
  isSafeReshape,
  proposeReshape,
} from "@/lib/plan/reshape";
import { calculateStartBy, type TaskType } from "@/lib/plan/lead-time";
import { scheduleRemindersForGoal } from "@/lib/plan/schedule";

export const runtime = "nodejs";

/**
 * The §14 adaptive replan, for a plan that arrived already behind.
 *
 * Two calls, deliberately. POST with confirm:false returns a PROPOSAL and
 * writes nothing; POST with confirm:true applies exactly that proposal. §6 and
 * §4.3 both say the user confirms before anything is scheduled, and a single
 * endpoint that reshapes on sight would be Vezri rewriting someone's dates
 * because it thought it knew better.
 *
 * The target date never moves — the same rule isSafeReplan enforces for a
 * missed task, checked here again before anything is written.
 */
const Body = z.object({ confirm: z.boolean().default(false) }).strict();

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

  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const { timeZone } = await loadUserSettings(supabase);
  const today = dayKeyIn(new Date(), timeZone);

  const [{ data: goal }, { data: milestoneRows }, { data: taskRows }] = await Promise.all([
    supabase.from("goals").select("id, status, target_date").eq("id", id).maybeSingle(),
    supabase.from("milestones").select("id, title, target_date, status").eq("goal_id", id),
    supabase
      .from("tasks")
      .select("id, title, deadline, status, milestone_id, task_type, estimated_minutes")
      .eq("goal_id", id),
  ]);

  if (!goal) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const targetDate = toDayKey(goal.target_date);
  if (!targetDate) {
    return NextResponse.json(
      {
        error:
          "This goal has no target date yet, so there is no window to spread the work across. " +
          "Set a target date first.",
      },
      { status: 409 },
    );
  }

  const milestones = (milestoneRows ?? []).map((m) => ({
    id: m.id,
    title: m.title,
    date: toDayKey(m.target_date),
    done: m.status === "done",
  }));
  const tasks = (taskRows ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    date: toDayKey(t.deadline),
    done: t.status === "done",
    milestoneId: t.milestone_id ?? null,
  }));

  const report = inspectPlanDates({ items: milestones, today });
  const proposal = proposeReshape({ milestones, tasks, today, targetDate });

  if (!proposal) {
    return NextResponse.json({
      summary: describePastPlan(report),
      proposal: null,
      note: "Nothing in this plan is in the past, so there is nothing to move.",
    });
  }

  if (!isSafeReshape(proposal, targetDate, today)) {
    // Belt and braces: the proposal is computed here, so this can only fire if
    // the rule and the maths ever disagree. §14 says the goalposts do not move,
    // and a proposal that fails that is not shown, let alone applied.
    return NextResponse.json(
      { error: "Vezri couldn't work out a reshape that keeps your target date." },
      { status: 422 },
    );
  }

  if (!parsed.data.confirm) {
    return NextResponse.json({
      summary: describePastPlan(report),
      proposal,
      // Said in full, because this is the thing the user is agreeing to.
      explanation:
        `Your target date stays ${targetDate}. ` +
        `${proposal.milestoneMoves.length} ${proposal.milestoneMoves.length === 1 ? "milestone" : "milestones"} that are already past move into the time you have left` +
        (proposal.keptCount > 0
          ? `, and the ${proposal.keptCount} still ahead of you stay exactly where they are.`
          : ".") +
        (proposal.taskMoves.length > 0
          ? ` ${proposal.taskMoves.length} tasks move with them.`
          : ""),
    });
  }

  // ---- Confirmed. Only now is anything written. ---------------------------
  const anchor = `Moved on ${today} when you reshaped this plan`;

  for (const move of proposal.milestoneMoves) {
    const { error } = await supabase
      .from("milestones")
      .update({ target_date: move.to, date_anchor: `${anchor}, from ${move.from}` })
      .eq("id", move.id)
      .eq("user_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const taskById = new Map((taskRows ?? []).map((t) => [t.id, t]));
  for (const move of proposal.taskMoves) {
    const task = taskById.get(move.id);
    if (!task) continue;
    // start_by is not shifted, it is RECOMPUTED: §9's lead-time engine owns
    // that date, and a moved deadline changes how early the work must begin.
    const { startBy, reason } = calculateStartBy({
      taskType: task.task_type as TaskType,
      deadline: new Date(`${move.to}T00:00:00Z`),
      estimatedMinutes: task.estimated_minutes,
      dependencyCount: 0,
    });
    const { error } = await supabase
      .from("tasks")
      .update({
        deadline: move.to,
        start_by: startBy ? startBy.toISOString().slice(0, 10) : null,
        start_by_reason: reason,
        date_anchor: `${anchor}, from ${move.from}`,
      })
      .eq("id", move.id)
      .eq("user_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase
    .from("goals")
    .update({ dates_reshaped_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  // §20 — a change to the user's own dates is logged with what it was based on.
  await supabase.from("ai_action_logs").insert({
    user_id: user.id,
    goal_id: id,
    action_type: "reshape_dates",
    structured_input: { today, target_date: targetDate, past: report },
    structured_output: proposal,
    explanation: `Spread ${proposal.milestoneMoves.length} past-dated milestones across the time left, target date unchanged.`,
    model_version: "deterministic",
  });

  // The reminder set is derived from these dates, so it is rebuilt — but only
  // for a goal the user has already started. §4.3: nothing is scheduled for a
  // goal that has not been confirmed.
  let rescheduled = 0;
  if (goal.status === "active") {
    rescheduled = await scheduleRemindersForGoal({ supabase, userId: user.id, goalId: id });
  }

  return NextResponse.json({
    applied: true,
    milestones_moved: proposal.milestoneMoves.length,
    tasks_moved: proposal.taskMoves.length,
    reminders_scheduled: rescheduled,
    target_date: targetDate,
  });
}
