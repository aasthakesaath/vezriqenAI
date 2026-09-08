import type { Metadata } from "next";
import { createClient, getUser } from "@/lib/supabase/server";
import { loadToday } from "@/lib/plan/load-today";
import { todayFor } from "@/lib/plan/today";
import { selectTodayByGoal } from "@/lib/plan/goal-today";
import TodayScreen from "@/components/app/TodayScreen";
import type { TodaySectionView } from "@/components/app/TodayGoalSections";
import { goalIconFor } from "@/lib/goal-icon";
import { goalLabel } from "@/lib/goal-label";
import { greetingFor } from "@/lib/greeting";
import { formatWeekdayDayKey } from "@/lib/time";

export const metadata: Metadata = { title: "Today", robots: { index: false } };

/**
 * PRD §17 — what needs you today, grouped by the goal it belongs to.
 *
 * §4.5 caps the day at three priority actions, and the cap is now applied per
 * goal section rather than across the whole screen: three cards in total meant
 * a second goal with two things a month overdue could go entirely unmentioned,
 * which §18 and §15 both care about. Nothing else about the cap moves — a
 * section shows three rows and says how many more there are, and only work
 * that needs attention TODAY is eligible at all. It stays cross-goal on one
 * screen, which is the whole reason §4 gives for not making someone open each
 * goal in turn.
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

  const { waitingOn, backlog, goals, tasks, reminderFor, timeZone } = await loadToday({
    supabase,
    now,
  });
  const today = todayFor({ now, timeZone });

  const firstName =
    ((user?.user_metadata?.full_name ?? user?.user_metadata?.name) as string | undefined)?.split(
      " ",
    )[0] ?? null;

  const naming = new Map(goals.map((goal) => [goal.id, goal]));

  const sections: TodaySectionView[] = selectTodayByGoal(
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
  ).map((section) => {
    const goal = naming.get(section.goalId) ?? {
      short_label: section.goalLabel,
      normalized_goal: section.goalTitle,
    };
    return {
      goalId: section.goalId,
      goalLabel: goalLabel(goal),
      icon: goalIconFor(goal),
      summary: section.summary,
      tasks: section.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        reason: task.reason,
        // The badge and the date come from the shared engine, already
        // resolved as calendar days. Nothing here re-derives a date.
        badge: task.urgency.label,
        urgency: task.urgency.kind,
        dateLabel: task.urgency.dateLabel,
        estimatedMinutes: task.estimatedMinutes,
        milestoneTitle: task.milestoneTitle,
        reminderId: reminderFor?.get(task.id) ?? null,
      })),
    };
  });

  return (
    <TodayScreen
      dateLabel={formatWeekdayDayKey(today)}
      greeting={greetingFor({ now, timeZone })}
      firstName={firstName}
      hasGoals={goals.length > 0}
      behindCount={backlog.behindCount}
      planBehind={backlog.planBehind}
      sections={sections}
      waitingOn={waitingOn.map((task) => ({
        id: task.id,
        title: task.title,
        waitingOn: task.externalPartyName ?? null,
        goalLabel: goalLabel({ short_label: task.goalLabel, normalized_goal: task.goalTitle }),
      }))}
    />
  );
}
