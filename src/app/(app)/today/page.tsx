import type { Metadata } from "next";
import { createClient, getUser } from "@/lib/supabase/server";
import { loadToday } from "@/lib/plan/load-today";
import { todayFor } from "@/lib/plan/today";
import { capTodaySections, selectTodayByGoal } from "@/lib/plan/goal-today";
import { overdueTasks } from "@/lib/plan/start-today";
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
 * §4.5 caps the day at three priority actions, and the cap is applied ACROSS
 * THE SCREEN. It was briefly applied per goal section instead, so five goals
 * put fifteen rows on the page with a "Show 9 more" under each — a backlog
 * with headings on it, which is what §4.5 exists to prevent. Three rows,
 * spread across goals so a second goal cannot drift unseen, and everything
 * else lives on the goals page where the whole plan already is.
 *
 * Nothing here counts what is behind. The page used to open with "33 things
 * are past the date Vezri worked back to", which is a number nobody can act
 * on, in a sentence that reads as an accusation however carefully it is
 * worded. What replaces it is one line and one button that moves the work.
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

  const { waitingOn, goals, tasks, reminderFor, timeZone } = await loadToday({
    supabase,
    now,
  });
  const today = todayFor({ now, timeZone });

  const firstName =
    ((user?.user_metadata?.full_name ?? user?.user_metadata?.name) as string | undefined)?.split(
      " ",
    )[0] ?? null;

  const naming = new Map(goals.map((goal) => [goal.id, goal]));

  const allSections = selectTodayByGoal(
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

  const { sections: capped, hasMore } = capTodaySections(allSections);

  const sections: TodaySectionView[] = capped.map((section) => {
    // goalLabel no longer consults normalized_goal, so the fallback carries
    // only the name columns. Passing the statement here would imply it is
    // still a source for a name, which is exactly the bug being closed.
    const goal = naming.get(section.goalId) ?? { short_label: section.goalLabel };
    return {
      goalId: section.goalId,
      goalLabel: goalLabel(goal),
      icon: goalIconFor(goal),
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
      // The same predicate the route uses, so the button is never offered when
      // there is nothing it would move and never withheld when there is.
      // lib/plan/start-today owns the definition of "behind".
      hasOverdue={overdueTasks(tasks, today).length > 0}
      hasMore={hasMore}
      sections={sections}
      waitingOn={waitingOn.map((task) => ({
        id: task.id,
        title: task.title,
        waitingOn: task.externalPartyName ?? null,
        goalLabel: goalLabel({ short_label: task.goalLabel }),
      }))}
    />
  );
}
