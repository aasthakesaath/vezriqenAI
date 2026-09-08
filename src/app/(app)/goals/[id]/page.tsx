import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadGoalSnapshot } from "@/lib/health/load";
import HealthCard from "@/components/app/HealthCard";
import AuditPanel from "@/components/app/AuditPanel";
import ProvenanceBadge from "@/components/plan/ProvenanceBadge";
import { APP_ROUTES, goalReviewPath } from "@/lib/routes";
import { formatDay } from "@/lib/time";

const shortDate = (value: string | null) => (value ? formatDay(value) : null);

export const metadata: Metadata = { title: "Goal", robots: { index: false } };


/** PRD §18 — the goal dashboard. */
export default async function GoalDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
        .select("id, title, status, target_date, origin, confidence")
        .eq("goal_id", id)
        .order("sort_order", { ascending: true }),
      supabase
        .from("tasks")
        .select("id, title, rationale, status, priority, deadline, start_by, origin, confidence")
        .eq("goal_id", id)
        .in("status", ["not_started", "in_progress", "unconfirmed", "partial"])
        .order("priority", { ascending: true })
        .limit(3),
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

  const title =
    snapshot.goal.normalized_goal ?? snapshot.goal.user_goal_text ?? "Your goal";
  const done = (milestones ?? []).filter((m) => m.status === "done").length;

  return (
    <div className="shell max-w-3xl py-12 lg:py-16">
      <Link href={APP_ROUTES.today} className="text-sm font-medium text-berry hover:underline">
        ← Today
      </Link>

      <h1 className="mt-4 text-3xl font-bold tracking-tight text-ink sm:text-4xl">{title}</h1>
      {snapshot.goal.target_date && (
        <p className="mt-2 text-mauve">By {shortDate(snapshot.goal.target_date)}</p>
      )}

      {snapshot.goal.success_criteria.length > 0 && (
        <ul className="mt-4 list-disc space-y-1 pl-5 text-mauve">
          {snapshot.goal.success_criteria.map((measure) => (
            <li key={measure}>{measure}</li>
          ))}
        </ul>
      )}

      <div className="mt-8 space-y-6">
        <HealthCard
          title="Goal Health"
          status={snapshot.health.status}
          factors={snapshot.health.factors}
          recommendation={lastAudit?.explanation ?? null}
        />

        <AuditPanel goalId={id} />

        {(tasks ?? []).length > 0 && (
          <section
            aria-labelledby="next-heading"
            className="rounded-2xl border border-blush bg-white p-6 shadow-soft"
          >
            <h2 id="next-heading" className="text-lg font-semibold text-ink">
              Next actions
            </h2>
            <ul className="mt-4 space-y-3">
              {(tasks ?? []).map((task) => (
                <li key={task.id} className="border-t border-blush pt-3 first:border-0 first:pt-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <span className="font-medium text-ink">{task.title}</span>
                    <ProvenanceBadge origin={task.origin} confidence={Number(task.confidence)} />
                  </div>
                  {task.rationale && <p className="mt-1 text-sm text-mauve">{task.rationale}</p>}
                  <div className="mt-1.5 flex flex-wrap gap-x-4 text-sm text-mauve-light">
                    {task.start_by && <span>Start by {shortDate(task.start_by)}</span>}
                    {task.deadline && <span>Due {shortDate(task.deadline)}</span>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

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
