import type { Metadata } from "next";
import { createClient, getUser } from "@/lib/supabase/server";
import { loadToday } from "@/lib/plan/load-today";
import { selectTodayByGoal } from "@/lib/plan/today";
import TodayScreen from "@/components/app/TodayScreen";
import type { TodaySectionView } from "@/components/app/TodayGoalSections";
import { goalIconFor } from "@/lib/goal-icons";
import { goalLabel } from "@/lib/goal-label";
import { formatDueDate, formatWeekdayDate } from "@/lib/time";

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
 * The markup lives in TodayScreen. This is the query and the mapping.
 */
export default async function TodayPage() {
  const now = new Date();
  const user = await getUser();
  const supabase = await createClient();

  const [{ waitingOn, backlog, goals, tasks, reminderFor }, { data: profile }] = await Promise.all([
    loadToday({ supabase, now }),
    supabase.from("profiles").select("timezone").maybeSingle(),
  ]);

  // The stored zone when there is one; the browser corrects the heading after
  // mount when there is not (see TodayDate).
  const timeZone = profile?.timezone ?? undefined;

  const firstName =
    ((user?.user_metadata?.full_name ?? user?.user_metadata?.name) as string | undefined)?.split(
      " ",
    )[0] ?? null;

  const naming = new Map(goals.map((goal) => [goal.id, goal]));

  const sections: TodaySectionView[] = selectTodayByGoal(tasks, { now, timeZone }).map(
    (section) => {
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
          badge: task.badge,
          urgency: task.urgency,
          // Formatted here, where the user's zone is known. The client
          // component never does date arithmetic.
          dateLabel:
            task.urgency === "due_today"
              ? "Due today"
              : task.urgency === "start_today"
                ? "Start today"
                : task.date
                  ? `${task.dateKind === "start_by" ? "Start by" : "Due"} ${formatDueDate(task.date, { now, timeZone })}`
                  : null,
          estimatedMinutes: task.estimatedMinutes,
          milestoneTitle: task.milestoneTitle ?? null,
          reminderId: reminderFor?.get(task.id) ?? null,
        })),
      };
    },
  );

  return (
    <TodayScreen
      dateLabel={formatWeekdayDate(now, timeZone)}
      dateIsTrusted={Boolean(profile?.timezone)}
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
