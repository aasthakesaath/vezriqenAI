import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadGoalSnapshot } from "@/lib/health/load";
import HealthCard from "@/components/app/HealthCard";
import Disclosure from "@/components/app/Disclosure";
import Icon from "@/components/icons/Icon";
import GoalHeader from "@/components/goal/GoalHeader";
import GoalTabs from "@/components/goal/GoalTabs";
import GoalLayout from "@/components/goal/GoalLayout";
import GoalTodayPane from "@/components/goal/GoalTodayPane";
import { type GoalTaskView } from "@/components/goal/GoalTaskList";
import { type CompletedTaskView } from "@/components/goal/CompletedTaskList";
import NextMilestoneCard from "@/components/goal/NextMilestoneCard";
import GoalOverview from "@/components/goal/GoalOverview";
import ScopedPlan from "@/components/goal/ScopedPlan";
import FullPlan, { type PlanMilestoneRow, type PlanTaskRow } from "@/components/goal/FullPlan";
import PastPlanNotice from "@/components/plan/PastPlanNotice";
import { goalLabel, goalStatement, goalSummary } from "@/lib/goal-label";
import { DEFAULT_GOAL_TAB, isGoalTab, windowFor, type GoalTab } from "@/lib/plan/goal-tabs";
import { selectGoalToday, summarizeToday, VISIBLE_TASKS } from "@/lib/plan/goal-today";
import { OPEN_TASK_STATUSES } from "@/lib/plan/task-status";
import { describePastPlan, inspectPlanDates } from "@/lib/plan/reshape";
import DeleteGoal from "@/components/goal/DeleteGoal";
import { milestoneProgress, planForView } from "@/lib/plan/views";
import { goalReviewPath } from "@/lib/routes";
import { formatDayKey } from "@/lib/time";
import { dayKeyIn, toDayKey } from "@/lib/time-zone";
import { loadUserSettings } from "@/lib/user-settings";

export const metadata: Metadata = { title: "Goal", robots: { index: false } };

const OPEN = new Set<string>(OPEN_TASK_STATUSES);

/**
 * PRD §18 — one goal, in five views.
 *
 * The page answers "what does this goal need from me today?" first, because
 * that is the question every link into it is asking. Overview steps back,
 * Week and Month look forward, and Full Plan is the ONE place the whole
 * milestone list is rendered — the page used to repeat all of it under a view
 * already scoped to a single day, which put thirty-four rows between the user
 * and three tasks.
 *
 * Each view is a real URL (?view=…), so it survives a reload and can be
 * shared, and the switcher stays links with aria-current rather than a tablist.
 *
 * On a narrow screen the sidebar comes FIRST: goal health is the context for
 * the day's work, and reading "at risk, dependencies are slipping" after
 * scrolling past the tasks is reading it too late.
 */
export default async function GoalDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { id } = await params;
  const { view: requested } = await searchParams;
  const tab: GoalTab = isGoalTab(requested) ? requested : DEFAULT_GOAL_TAB;
  const supabase = await createClient();

  const { timeZone } = await loadUserSettings(supabase);

  // The status decides whether this page renders at all, so it is asked for
  // first. Goal Health is six factors over five queries, and computing it for
  // a goal that redirects on the very next line is work nobody ever sees —
  // and, since the score is now recorded, a write nobody asked for.
  const { data: statusRow } = await supabase
    .from("goals")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (!statusRow) notFound();

  // A goal that hasn't been confirmed yet belongs in the review flow.
  if (statusRow.status !== "active" && statusRow.status !== "achieved") {
    redirect(goalReviewPath(id));
  }

  const snapshot = await loadGoalSnapshot({ supabase, goalId: id });
  if (!snapshot) notFound();

  const [{ data: milestones }, { data: tasks }, { data: lastAudit }, { data: documents }, { data: dependencies }] =
    await Promise.all([
      supabase
        .from("milestones")
        .select("id, title, status, target_date, date_anchor, origin, confidence, sort_order")
        .eq("goal_id", id)
        .order("sort_order", { ascending: true }),
      supabase
        .from("tasks")
        .select(
          "id, title, rationale, task_type, status, priority, deadline, start_by, estimated_minutes, completed_at, milestone_id, origin, confidence",
        )
        .eq("goal_id", id)
        .order("priority", { ascending: true }),
      supabase
        .from("goal_audits")
        .select("explanation, created_at")
        .eq("goal_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("plan_documents")
        .select("id, filename, source_kind")
        .eq("goal_id", id)
        .order("created_at", { ascending: true }),
      // Who a task waits on. The name lives here, not on the task (§3, §13).
      supabase
        .from("task_dependencies")
        .select("task_id, external_party_name, tasks!inner(goal_id)")
        .eq("tasks.goal_id", id)
        .eq("dependency_type", "external_person")
        .is("resolved_at", null),
    ]);

  const milestoneRows = milestones ?? [];
  const taskRows = tasks ?? [];

  const waitingOnName = new Map<string, string>();
  for (const dependency of dependencies ?? []) {
    if (dependency.external_party_name) {
      waitingOnName.set(dependency.task_id, dependency.external_party_name);
    }
  }

  const milestoneTitle = new Map(milestoneRows.map((m) => [m.id, m.title]));
  // Days, as days. A deadline is a calendar date and is never shifted into a
  // timezone; only "which day is it right now" needs the user's zone.
  const today = dayKeyIn(new Date(), timeZone);

  const label = goalLabel(snapshot.goal);
  const doneMilestones = milestoneRows.filter((m) => m.status === "done").length;

  // §14 — said once, at the top, rather than "should already have started" on
  // every row underneath it.
  const pastPlan = inspectPlanDates({
    today,
    items: milestoneRows.map((m) => ({
      id: m.id,
      title: m.title,
      date: m.target_date,
      done: m.status === "done",
    })),
  });

  // ---- Today -------------------------------------------------------------
  const { tasks: todayTasks, counts } = selectGoalToday(
    taskRows.map((task) => ({
      id: task.id,
      title: task.title,
      rationale: task.rationale,
      taskType: task.task_type,
      status: task.status,
      priority: task.priority,
      deadline: task.deadline,
      startBy: task.start_by,
      estimatedMinutes: task.estimated_minutes,
      milestoneTitle: task.milestone_id ? (milestoneTitle.get(task.milestone_id) ?? null) : null,
      waitingOn: waitingOnName.get(task.id) ?? null,
    })),
    today,
  );

  const todayView: GoalTaskView[] = todayTasks.map((task) => ({
    id: task.id,
    title: task.title,
    reason: task.reason,
    urgencyKind: task.urgency.kind,
    urgencyLabel: task.urgency.label,
    dateLabel: task.urgency.dateLabel,
    estimatedMinutes: task.estimatedMinutes,
    milestoneTitle: task.milestoneTitle,
    waitingOn: task.waitingOn,
    reminderId: snapshot.reminderFor.get(task.id) ?? null,
  }));

  const completed: CompletedTaskView[] = taskRows
    .filter((task) => task.status === "done")
    .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))
    .map((task) => ({
      id: task.id,
      title: task.title,
      reason: task.rationale?.trim() || "it was part of this plan",
      completedOn: formatDayKey(toDayKey(task.completed_at)) || null,
      estimatedMinutes: task.estimated_minutes,
      milestoneTitle: task.milestone_id ? (milestoneTitle.get(task.milestone_id) ?? null) : null,
      origin: (task.origin as "explicit" | "inferred") ?? "inferred",
      confidence: Number(task.confidence ?? 0),
    }));

  // ---- The plan, for the views that show it ------------------------------
  const planRow = (task: (typeof taskRows)[number]): PlanTaskRow => ({
    id: task.id,
    title: task.title,
    status: task.status,
    startBy: toDayKey(task.start_by),
    deadline: toDayKey(task.deadline),
    estimatedMinutes: task.estimated_minutes,
    origin: (task.origin as "explicit" | "inferred") ?? "inferred",
    confidence: Number(task.confidence ?? 0),
  });

  const fullPlan: PlanMilestoneRow[] = milestoneRows.map((milestone) => ({
    id: milestone.id,
    title: milestone.title,
    status: milestone.status,
    targetDate: milestone.target_date,
    dateAnchor: milestone.date_anchor ?? null,
    tasks: taskRows.filter((task) => task.milestone_id === milestone.id).map(planRow),
  }));
  const looseTasks = taskRows.filter((task) => !task.milestone_id).map(planRow);

  const window = windowFor(tab);
  const scoped = window
    ? planForView(window, {
        milestones: milestoneRows.map((m) => ({
          id: m.id,
          title: m.title,
          status: m.status,
          targetDate: m.target_date ? new Date(m.target_date) : null,
        })),
        tasks: taskRows.map((task) => ({
          id: task.id,
          title: task.title,
          rationale: task.rationale,
          status: task.status,
          milestoneId: task.milestone_id ?? null,
          startBy: task.start_by ? new Date(task.start_by) : null,
          deadline: task.deadline ? new Date(task.deadline) : null,
          estimatedMinutes: task.estimated_minutes,
          origin: (task.origin as "explicit" | "inferred") ?? "inferred",
          confidence: Number(task.confidence ?? 0),
        })),
        timeZone,
      })
    : null;

  // §15 — the next milestone: the earliest dated one still open, and an
  // undated one only once the dated ones run out. A milestone with no date
  // cannot be "next" while something with a real date is waiting.
  const openMilestones = milestoneRows.filter((m) => m.status !== "done");
  const nextMilestone =
    openMilestones
      .filter((m) => m.target_date)
      .sort((a, b) => (a.target_date ?? "").localeCompare(b.target_date ?? ""))[0] ??
    openMilestones[0] ??
    null;

  return (
    <div className="shell max-w-6xl py-8 lg:py-12">
      <GoalHeader
        label={label}
        summary={goalSummary(snapshot.goal)}
        targetDate={snapshot.goal.target_date}
        achieved={snapshot.goal.status === "achieved"}
      >
        {/* Collapsed by default, and the ONE place the full statement can be
          opened. §6 requires the approved wording be preserved; a heading
          requires six words. Both are true here, one tap apart. */}
        <Disclosure label="Show full target" className="mt-5" headingLevel="h2">
        <p className="text-[1.02rem] leading-relaxed text-ink">{goalStatement(snapshot.goal)}</p>
        {snapshot.goal.success_criteria.length > 0 && (
          <>
            <h4 className="mt-4 text-sm font-semibold text-ink">How success is measured</h4>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-mauve">
              {snapshot.goal.success_criteria.map((measure) => (
                <li key={measure}>{measure}</li>
              ))}
            </ul>
          </>
        )}
        </Disclosure>
      </GoalHeader>

      {pastPlan.isBehind && snapshot.goal.target_date && (
        <PastPlanNotice goalId={id} summary={describePastPlan(pastPlan)} />
      )}

      <GoalTabs goalId={id} current={tab} />

      {/* Two cards beside the work, and only two: how the goal is doing, and
        what is next. A third would be something to read instead of doing
        the thing the page is for. */}
      <GoalLayout
        sidebar={
          <>
            <HealthCard
              title="Goal Health"
              score={snapshot.health.score}
              status={snapshot.health.status}
              factors={snapshot.health.factors}
              weakest={snapshot.health.weakest}
              recommendation={lastAudit?.explanation ?? null}
            />
            <NextMilestoneCard
              goalId={id}
              milestone={
                nextMilestone
                  ? {
                      id: nextMilestone.id,
                      title: nextMilestone.title,
                      targetDate: nextMilestone.target_date,
                      dateAnchor: nextMilestone.date_anchor ?? null,
                  }
                : null
            }
            done={doneMilestones}
            total={milestoneRows.length}
          />
        </>
        }
      >
        {tab === "today" && (
          <GoalTodayPane
            tasks={todayView}
            summary={summarizeToday(counts)}
            visibleCount={VISIBLE_TASKS}
            completed={completed}
          />
        )}

        {tab === "overview" && (
          <GoalOverview
            goalId={id}
            done={doneMilestones}
            total={milestoneRows.length}
            criticalDates={milestoneRows
              .filter((m) => m.status !== "done" && m.target_date)
              .sort((a, b) => (a.target_date ?? "").localeCompare(b.target_date ?? ""))
              .slice(0, 3)
              .map((m) => ({ id: m.id, title: m.title, targetDate: m.target_date as string }))}
            waitingOn={taskRows
              .filter((task) => OPEN.has(task.status) && waitingOnName.has(task.id))
              .map((task) => ({
                id: task.id,
                title: task.title,
                person: waitingOnName.get(task.id) ?? null,
              }))}
          />
        )}

        {window && scoped && (
          <ScopedPlan
            window={window}
            milestones={scoped.milestones.map((milestone) => {
              const progress = milestoneProgress(milestone, scoped.tasks);
              return {
                id: milestone.id,
                title: milestone.title,
                targetDate: toDayKey(milestone.targetDate),
                done: progress.done,
                total: progress.total,
              };
            })}
            tasks={scoped.tasks
              .filter((task) => task.status !== "done")
              .map((task) => ({
                id: task.id,
                title: task.title,
                status: task.status,
                startBy: toDayKey(task.startBy),
                deadline: toDayKey(task.deadline),
                estimatedMinutes: task.estimatedMinutes,
                origin: task.origin ?? "inferred",
                confidence: task.confidence ?? 0,
              }))}
          />
        )}

        {tab === "plan" && <FullPlan milestones={fullPlan} looseTasks={looseTasks} />}
      </GoalLayout>

      {/* Provenance, at the foot of the page. Useful — it is where every item
          above came from — but it is not a decision anyone makes daily, so it
          does not earn a slot beside the day's work. */}
      {(documents ?? []).length > 0 && (
        <section
          aria-labelledby="source-heading"
          className="mt-8 rounded-3xl border border-blush bg-white p-5 shadow-soft sm:p-6"
        >
          <h2
            id="source-heading"
            className="flex items-center gap-2 text-lg font-semibold text-ink"
          >
            <Icon name="document" className="h-5 w-5 text-mauve-light" />
            Where this came from
          </h2>
          <ul className="mt-3 space-y-1 text-mauve">
            {(documents ?? []).map((document) => (
              <li key={document.id}>
                {document.filename}
                {document.source_kind === "paste" ? " (pasted)" : ""}
              </li>
            ))}
          </ul>
          <Link
            href={goalReviewPath(id)}
            className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-berry hover:underline"
          >
            Review the extracted plan
            <Icon name="chevronRight" className="h-4 w-4" />
          </Link>
        </section>
      )}

      {/* The foot of the page, below the provenance. §23 promises a user can
          delete a goal and everything derived from it; until now there was an
          endpoint and no way to reach it. */}
      <DeleteGoal goalId={id} label={label} />
    </div>
  );
}
