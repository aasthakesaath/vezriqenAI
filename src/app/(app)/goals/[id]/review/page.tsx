import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PastPlanNotice from "@/components/plan/PastPlanNotice";
import { describePastPlan, inspectPlanDates } from "@/lib/plan/reshape";
import { dayKeyIn, toDayKey } from "@/lib/time-zone";
import { loadUserSettings } from "@/lib/user-settings";
import ReviewFlow from "@/components/plan/ReviewFlow";
import {
  describeStalled,
  isRunDead,
  loadExtractionProgress,
} from "@/lib/plan/extraction-state";
import DeleteDocumentButton from "@/components/app/DeleteDocumentButton";
import { humanFileSize } from "@/lib/ingest/limits";
import { APP_ROUTES } from "@/lib/routes";
import type { PlanMilestone, PlanTask } from "@/components/plan/PlanConfirmation";

export const metadata: Metadata = { title: "Your plan", robots: { index: false } };

/**
 * PRD §5 Steps 3-6. Loads whatever state the goal is in and hands it to the
 * client flow, which drives extraction, target confirmation and Start Goal.
 */
export default async function GoalReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  // No user_id filter: RLS scopes every one of these reads to the caller.
  const { data: goal } = await supabase
    .from("goals")
    .select("id, user_goal_text, normalized_goal, target_date, success_criteria, constraints, status")
    .eq("id", id)
    .maybeSingle();

  if (!goal) notFound();
  if (goal.status === "active") redirect(APP_ROUTES.today);

  const [{ data: documents }, { data: milestoneRows }, { data: taskRows }, { data: lastSmart }] =
    await Promise.all([
      supabase
        .from("plan_documents")
        .select("id, filename, mime_type, byte_size, page_count, source_kind, parse_status")
        .eq("goal_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("milestones")
        .select("id, title, target_date, status, origin, confidence, plan_source_anchors(excerpt)")
        .eq("goal_id", id)
        .order("sort_order", { ascending: true }),
      supabase
        .from("tasks")
        .select(
          "id, title, rationale, task_type, deadline, start_by, start_by_reason, priority, estimated_minutes, origin, confidence, plan_source_anchors(excerpt), task_dependencies(external_party_name)",
        )
        .eq("goal_id", id),
      supabase
        .from("ai_action_logs")
        .select("structured_output")
        .eq("goal_id", id)
        .eq("action_type", "smart_target")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  type AnchorJoin = { excerpt: string } | { excerpt: string }[] | null;
  const excerptOf = (anchor: AnchorJoin): string | null =>
    Array.isArray(anchor) ? (anchor[0]?.excerpt ?? null) : (anchor?.excerpt ?? null);

  const milestones: PlanMilestone[] = (milestoneRows ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    target_date: row.target_date,
    status: row.status,
    origin: row.origin,
    confidence: Number(row.confidence),
    excerpt: excerptOf(row.plan_source_anchors as AnchorJoin),
  }));

  const tasks: PlanTask[] = (taskRows ?? []).map((row) => {
    const deps = (row.task_dependencies ?? []) as Array<{ external_party_name: string | null }>;
    return {
      id: row.id,
      title: row.title,
      rationale: row.rationale,
      task_type: row.task_type,
      deadline: row.deadline,
      start_by: row.start_by,
      start_by_reason: row.start_by_reason,
      priority: row.priority,
      estimated_minutes: row.estimated_minutes,
      origin: row.origin,
      confidence: Number(row.confidence),
      excerpt: excerptOf(row.plan_source_anchors as AnchorJoin),
      external_party: deps.find((d) => d.external_party_name)?.external_party_name ?? null,
    };
  });

  const feasibility =
    (lastSmart?.structured_output as { feasibility_note?: string | null } | null)
      ?.feasibility_note ?? null;

  const document = documents?.[0] ?? null;
  const needsExtraction = !goal.normalized_goal;

  // A run killed at the platform's function ceiling cannot write its own
  // epitaph, so a stale in_progress is read as dead here rather than being
  // shown as work still in flight. 73666d16 sat at "being read" for two hours
  // after a 300-second timeout.
  const progress = await loadExtractionProgress(supabase, goal.id);
  const stoppedNote = isRunDead(progress)
    ? describeStalled({ milestonesWritten: milestones.length, tasksWritten: tasks.length })
    : null;

  // §14 — a plan brought in after its own start dates. Shown here, BEFORE the
  // goal is started, because §6 says the user confirms the plan they will
  // actually run; discovering half of it was overdue after Start Goal is too
  // late to be a choice.
  const { timeZone } = await loadUserSettings(supabase);
  const pastPlan = inspectPlanDates({
    today: dayKeyIn(new Date(), timeZone),
    items: milestones.map((m) => ({
      id: m.id,
      title: m.title,
      date: toDayKey(m.target_date),
      done: m.status === "done",
    })),
  });

  return (
    <div className="shell max-w-3xl py-12 lg:py-16">
      <p className="eyebrow">Plan received</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
        {goal.user_goal_text?.trim() || "Your plan"}
      </h1>

      {document && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blush bg-white px-5 py-4 text-sm shadow-soft">
          <span className="text-mauve">
            <span className="font-semibold text-ink">{document.filename}</span>
            {" · "}
            {document.source_kind === "paste" ? "Pasted text" : humanFileSize(document.byte_size)}
            {document.page_count ? ` · ${document.page_count} pages` : ""}
          </span>
          {/* PRD §23 — delete the document and everything derived from it. */}
          <DeleteDocumentButton documentId={document.id} />
        </div>
      )}

      {pastPlan.isBehind && goal.target_date && (
        <PastPlanNotice goalId={goal.id} summary={describePastPlan(pastPlan)} />
      )}

      <ReviewFlow
        goalId={goal.id}
        needsExtraction={needsExtraction}
        stoppedNote={stoppedNote}
        initialTarget={
          goal.normalized_goal
            ? {
                goalId: goal.id,
                normalizedGoal: goal.normalized_goal,
                targetDate: goal.target_date,
                successCriteria: (goal.success_criteria as string[]) ?? [],
                constraints: (goal.constraints as string[]) ?? [],
                feasibilityNote: feasibility,
              }
            : null
        }
        initialMilestones={milestones}
        initialTasks={tasks}
      />
    </div>
  );
}
