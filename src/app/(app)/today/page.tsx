import type { Metadata } from "next";
import { createClient, getUser } from "@/lib/supabase/server";
import { loadToday } from "@/lib/plan/load-today";
import { todayFor } from "@/lib/plan/today";
import { TODAY_TASK_LIMIT, selectTodayByGoal, selectTopToday } from "@/lib/plan/goal-today";
import { overdueTasks } from "@/lib/plan/start-today";
import TodayScreen from "@/components/app/TodayScreen";
import type { TodayTaskView } from "@/components/app/TodayTasks";
import { goalIconFor } from "@/lib/goal-icon";
import { goalLabel } from "@/lib/goal-label";
import { greetingFor } from "@/lib/greeting";
import { formatWeekdayDayKey } from "@/lib/time";

export const metadata: Metadata = { title: "Today", robots: { index: false } };

/**
 * PRD §17 — what needs you today, across every goal.
 *
 * §4.5 caps the day at three priority actions, and the cap is applied to the
 * PAGE. It was briefly applied per goal section instead, on the reasoning that
 * a second goal with two things past their date should not go unmentioned —
 * true, and answered by selectTopToday giving every goal its first card before
 * any goal gets a second, rather than by drawing three rows per goal and
 * ending up with twelve on screen.
 *
 * The overdue COUNT is gone. It opened the page with "33 things are past the
 * date Vezri worked back to", which is a measure of how far behind someone is
 * rather than anything they can act on, and §4.6 rules that out. What is left
 * is a boolean: is anything late, yes or no. If yes, the screen shows one line
 * and one button (StartFromToday); the rest of the plan is on /goals.
 *
 * Which day "today" is comes from the user's zone rather than the server's,
 * and the urgency engine is the one lib/plan/goal-today owns — the same one
 * the goal page's own Today list uses, so a task cannot read "30 days overdue"
 * here and something else there.
 *
 * The markup lives in TodayScreen. This is the query and the mapping.
 */
export default async function TodayPage() {
  const now = new Date();
  const user = await getUser();
  const supabase = await createClient();

  const { waitingOn, goals, tasks, reminderFor, timeZone } = await loadToday({ supabase, now });
  const today = todayFor({ now, timeZone });

  const firstName =
    ((user?.user_metadata?.full_name ?? user?.user_metadata?.name) as string | undefined)?.split(
      " ",
    )[0] ?? null;

  const naming = new Map(goals.map((goal) => [goal.id, goal]));

  const sections = selectTodayByGoal(
    tasks.map((task) => ({
      id: task.id,
      title: task.title,
      rationale: task.rationale,
      taskType: task.taskType,
      status: task.status,
      priority: task.priority,
      deadline: task.deadline,
      startBy: task.startBy,
      estimatedMinutes: task.estimatedMinutes,
      milestoneTitle: task.milestoneTitle ?? null,
      waitingOn: task.externalPartyName ?? null,
      goalId: task.goalId,
      goalLabel: task.goalLabel ?? null,
      goalTitle: task.goalTitle,
    })),
    today,
  );

  const cards: TodayTaskView[] = selectTopToday(sections, TODAY_TASK_LIMIT).map((task) => {
    // goalLabel no longer consults normalized_goal, so the fallback carries
    // only the name columns. Passing the statement here would imply it is
    // still a source for a name, which is exactly the bug being closed.
    const goal = naming.get(task.goalId) ?? { short_label: task.goalLabel };
    return {
      id: task.id,
      title: task.title,
      reason: task.reason,
      // The badge and the date come from the shared engine, already resolved
      // as calendar days. Nothing here re-derives a date.
      badge: task.urgency.label,
      urgency: task.urgency.kind,
      dateLabel: task.urgency.dateLabel,
      estimatedMinutes: task.estimatedMinutes,
      milestoneTitle: task.milestoneTitle,
      reminderId: reminderFor?.get(task.id) ?? null,
      goalId: task.goalId,
      goalLabel: goalLabel(goal),
      icon: goalIconFor(goal),
    };
  });

  // A boolean, deliberately. Whether the button is drawn is the only question
  // the screen asks about late work, and it is answered by the same function
  // the route uses to decide what moves — so the button never appears with
  // nothing behind it, and never fails to appear when there is.
  const planBehind =
    overdueTasks(
      tasks.map((task) => ({
        id: task.id,
        goalId: task.goalId,
        title: task.title,
        status: task.status,
        deadline: task.deadline,
        startBy: task.startBy,
      })),
      today,
    ).length > 0;

  return (
    <TodayScreen
      dateLabel={formatWeekdayDayKey(today)}
      greeting={greetingFor({ now, timeZone })}
      firstName={firstName}
      hasGoals={goals.length > 0}
      planBehind={planBehind}
      tasks={cards}
      waitingOn={waitingOn.map((task) => ({
        id: task.id,
        title: task.title,
        waitingOn: task.externalPartyName ?? null,
        goalLabel: goalLabel({ short_label: task.goalLabel }),
        estimatedMinutes: task.estimatedMinutes,
      }))}
    />
  );
}
