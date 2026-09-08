import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadGoalSnapshot } from "@/lib/health/load";
import HealthCard from "@/components/app/HealthCard";
import AuditPanel from "@/components/app/AuditPanel";
import ProvenanceBadge from "@/components/plan/ProvenanceBadge";
import Disclosure from "@/components/app/Disclosure";
import PlanViewTabs from "@/components/app/PlanViewTabs";
import { VezriPoseImage } from "@/components/VezriWorking";
import { POSE_FOR } from "@/lib/vezri-poses";
import { goalLabel, goalStatement } from "@/lib/goal-label";
import { isPlanView, milestoneProgress, planForView, type PlanView } from "@/lib/plan/views";
import { APP_ROUTES, goalReviewPath } from "@/lib/routes";
import { formatDay } from "@/lib/time";

const shortDate = (value: string | null) => (value ? formatDay(value) : null);

export const metadata: Metadata = { title: "Goal", robots: { index: false } };


/** PRD §18 — the goal dashboard. */
export default async function GoalDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { id } = await params;
  const { view: requested } = await searchParams;
  const view: PlanView = isPlanView(requested) ? requested : "today";
  const supabase = await createClient();

  const snapshot = await loadGoalSnapshot({ supabase, goalId: id });
  if (!snapshot) notFound();

  // A goal that hasn't been confirmed yet belongs in the review flow.
  if (snapshot.goal.status !== "active" && snapshot.goal.status !== "achieved") {
    redirect(goalReviewPath(id));
  }

  const [{ data: milestones }, { data: tasks }, { data: lastAudit }, { data: documents }] =
    await Promise.all([
      supabase
        .from("milestones")
        .select("id, title, status, target_date, origin, confidence, sort_order")
        .eq("goal_id", id)
        .order("sort_order", { ascending: true }),
      supabase
        .from("tasks")
        .select(
          "id, title, rationale, status, priority, deadline, start_by, estimated_minutes, milestone_id, origin, confidence",
        )
        .eq("goal_id", id)
        .in("status", ["not_started", "in_progress", "unconfirmed", "partial", "done"])
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
    ]);

  const label = goalLabel(snapshot.goal);
  const statement = goalStatement(snapshot.goal);
  const done = (milestones ?? []).filter((m) => m.status === "done").length;

  // Today / Week / Month, rolled up from the milestone dates and task dates
  // that already exist. No schedule table, nothing new to keep in sync.
  const planMilestones = (milestones ?? []).map((m) => ({
    id: m.id,
    title: m.title,
    status: m.status,
    targetDate: m.target_date ? new Date(m.target_date) : null,
  }));
  const planTasks = (tasks ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    rationale: t.rationale,
    status: t.status,
    milestoneId: t.milestone_id ?? null,
    startBy: t.start_by ? new Date(t.start_by) : null,
    deadline: t.deadline ? new Date(t.deadline) : null,
    estimatedMinutes: t.estimated_minutes ?? null,
    // §7 — where each item came from stays visible wherever the item is.
    origin: t.origin as "explicit" | "inferred",
    confidence: Number(t.confidence),
  }));
  const scoped = planForView(view, { milestones: planMilestones, tasks: planTasks });

  return (
    <div className="shell max-w-3xl py-12 lg:py-16">
      <Link href={APP_ROUTES.today} className="text-sm font-medium text-berry hover:underline">
        ← Today
      </Link>

      <div className="mt-4 flex items-start justify-between gap-6">
        <div className="min-w-0">
          {/* Short label as the heading. The statement is a paragraph, and a
              paragraph makes a poor h1. */}
          <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">{label}</h1>
          {snapshot.goal.target_date && (
            <p className="mt-2 text-mauve">By {shortDate(snapshot.goal.target_date)}</p>
          )}
        </div>
        <VezriPoseImage
          pose={POSE_FOR.goalHealth}
          alt=""
          className="h-16 w-auto shrink-0 sm:h-24"
        />
      </div>

      {/* Collapsed by default. This is the ONE place the full statement can be
          expanded — a task card cannot, because Today shows three cards and 60
          words would push the other two off the screen. Here nothing is
          displaced. */}
      <Disclosure label="Show full target" className="mt-6">
        <p className="text-[1.02rem] leading-relaxed text-ink">{statement}</p>
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

      <PlanViewTabs goalId={id} current={view} />

      <section aria-label={`Plan for the ${view}`} className="mt-6 space-y-3">
        {scoped.milestones.length === 0 && scoped.tasks.length === 0 ? (
          <p className="rounded-2xl border border-blush bg-white p-6 text-mauve shadow-soft">
            {view === "today"
              ? "Nothing scheduled for today on this goal."
              : `Nothing falls in this ${view} yet.`}
          </p>
        ) : (
          <>
            {scoped.milestones.map((milestone) => {
              const progress = milestoneProgress(milestone, planTasks);
              return (
                <div
                  key={milestone.id}
                  className="rounded-2xl border border-blush bg-white p-5 shadow-soft"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="font-semibold text-ink">{milestone.title}</h3>
                    <span className="text-sm text-mauve-light">
                      {milestone.targetDate ? formatDay(milestone.targetDate) : "No date"}
                    </span>
                  </div>
                  {progress.total > 0 && (
                    <p className="mt-1 text-sm text-mauve">
                      {progress.done} of {progress.total} tasks done
                    </p>
                  )}
                </div>
              );
            })}

            {scoped.tasks.filter((t) => t.status !== "done").length > 0 && (
              <ul className="space-y-2">
                {scoped.tasks
                  .filter((t) => t.status !== "done")
                  .slice(0, 12)
                  .map((task) => (
                    <li
                      key={task.id}
                      className="rounded-xl border border-blush bg-white px-5 py-4 shadow-soft"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <p className="font-medium text-ink">{task.title}</p>
                        <ProvenanceBadge origin={task.origin ?? "inferred"} confidence={task.confidence ?? 0} />
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 text-sm text-mauve-light">
                        {task.estimatedMinutes && <span>~{task.estimatedMinutes} min</span>}
                        {task.startBy && <span>Start by {formatDay(task.startBy)}</span>}
                        {task.deadline && <span>Due {formatDay(task.deadline)}</span>}
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </>
        )}
      </section>

      <div className="mt-8 space-y-6">
        <HealthCard
          title="Goal Health"
          status={snapshot.health.status}
          factors={snapshot.health.factors}
          recommendation={lastAudit?.explanation ?? null}
        />

        <AuditPanel goalId={id} />


        {(milestones ?? []).length > 0 && (
          <section
            aria-labelledby="progress-heading"
            className="rounded-2xl border border-blush bg-white p-6 shadow-soft"
          >
            <h2 id="progress-heading" className="text-lg font-semibold text-ink">
              Progress
            </h2>
            <p className="mt-1 text-sm text-mauve">
              {done} of {(milestones ?? []).length} milestones complete
            </p>
            <ul className="mt-4 space-y-2.5">
              {(milestones ?? []).map((milestone) => (
                <li key={milestone.id} className="flex flex-wrap items-center justify-between gap-3">
                  <span
                    className={
                      milestone.status === "done" ? "text-mauve-light line-through" : "text-ink"
                    }
                  >
                    {milestone.title}
                  </span>
                  <span className="text-sm text-mauve-light">
                    {shortDate(milestone.target_date) ?? "No date"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {(documents ?? []).length > 0 && (
          <section className="rounded-2xl border border-blush bg-white p-6 shadow-soft">
            <h2 className="text-lg font-semibold text-ink">Where this came from</h2>
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
              className="mt-4 inline-block text-sm font-medium text-berry hover:underline"
            >
              Review the extracted plan
            </Link>
          </section>
        )}
      </div>
    </div>
  );
}
