import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAIProvider, AIExtractionError } from "@/lib/ai";
import { AI_CONFIGURED, SUPABASE_CONFIGURED } from "@/lib/env";
import {
  REPLAN_SYSTEM,
  ReplanSchema,
  calculateImpact,
  isSafeReplan,
  replanPrompt,
} from "@/lib/coach/replan";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Impact assessment and recovery proposal for slipped work (PRD §14).
 *
 * Read-only: it computes and proposes, and writes nothing to the plan. §14
 * requires the user to approve material changes, and the approval path is the
 * intervention flow, not this endpoint.
 */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const { id } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const { data: task } = await supabase
    .from("tasks")
    .select(
      "id, goal_id, milestone_id, title, deadline, start_by, estimated_minutes, priority, goals(normalized_goal, user_goal_text, target_date)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!task) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const goal = (Array.isArray(task.goals) ? task.goals[0] : task.goals) as {
    normalized_goal?: string | null;
    user_goal_text?: string | null;
    target_date?: string | null;
  } | null;

  const [{ data: siblings }, { data: dependents }, { data: milestone }] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, priority, estimated_minutes, status")
      .eq("goal_id", task.goal_id)
      .in("status", ["not_started", "in_progress"]),
    supabase.from("task_dependencies").select("task_id").eq("depends_on_task_id", id),
    task.milestone_id
      ? supabase
          .from("milestones")
          .select("title, target_date")
          .eq("id", task.milestone_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const open = siblings ?? [];
  const remainingMinutes = open.reduce((sum, t) => sum + (t.estimated_minutes ?? 0), 0);

  const impact = calculateImpact({
    now: new Date(),
    targetDate: goal?.target_date ? new Date(goal.target_date) : null,
    missedTask: {
      title: task.title,
      deadline: task.deadline ? new Date(task.deadline) : null,
      startBy: task.start_by ? new Date(task.start_by) : null,
      estimatedMinutes: task.estimated_minutes,
      milestoneId: task.milestone_id,
      priority: task.priority,
    },
    dependentTaskCount: (dependents ?? []).length,
    milestone: milestone
      ? {
          title: milestone.title,
          targetDate: milestone.target_date ? new Date(milestone.target_date) : null,
          openTaskCount: open.filter((t) => t.id !== id).length,
        }
      : null,
    remainingMinutes,
    availableMinutes: null,
  });

  const goalTitle = goal?.normalized_goal ?? goal?.user_goal_text ?? "your goal";
  let replan = null;

  if (AI_CONFIGURED) {
    try {
      const provider = getAIProvider();
      const result = await provider.generateStructured({
        action: "replan",
        system: REPLAN_SYSTEM,
        prompt: replanPrompt({
          goalTitle,
          targetDate: goal?.target_date ?? null,
          missedTask: task.title,
          impact,
          remainingMinutes,
          availableMinutes: null,
          optionalTasks: open
            .filter((t) => t.priority >= 4 && t.id !== id)
            .slice(0, 5)
            .map((t) => t.title),
        }),
        schema: ReplanSchema,
        effort: "medium",
      });

      // §14 — never silently change the user's final goal. A proposal that
      // moves the target is discarded rather than shown.
      if (isSafeReplan(result.data)) {
        replan = result.data;
        await supabase.from("ai_action_logs").insert({
          user_id: user.id,
          goal_id: task.goal_id,
          action_type: "replan",
          structured_input: { impact, task: task.title },
          structured_output: result.data,
          explanation: result.data.reasoning,
          model_version: result.modelVersion,
        });
      }
    } catch (error) {
      if (!(error instanceof AIExtractionError)) throw error;
    }
  }

  return NextResponse.json({
    impact,
    replan,
    requires_confirmation: impact.requiresConfirmation,
  });
}
