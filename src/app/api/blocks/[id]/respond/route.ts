import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_CONFIGURED } from "@/lib/env";
import { recomputeExecutionProfile } from "@/lib/coach/profile";

export const runtime = "nodejs";

const RespondSchema = z.object({ accepted: z.boolean() }).strict();

type Proposal = {
  new_task_title: string | null;
  new_task_minutes: number | null;
  suggested_start: string | null;
  revised_title: string | null;
  follow_up_with: string | null;
};

/**
 * Applies (or declines) an intervention (PRD §13, §14).
 *
 * This is the only place a block's proposal touches the plan, and it runs
 * strictly on the user's word — §4.3 and §14 both require the user to approve
 * material changes. Declining is recorded too, because §10 learns from what
 * this person actually takes up, not just from what Vezri offered.
 */
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

  const parsed = RespondSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid response." }, { status: 400 });

  const { data: block } = await supabase
    .from("execution_blocks")
    .select("id, task_id, intervention_type, recommendation, accepted")
    .eq("id", id)
    .maybeSingle();
  if (!block) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (block.accepted !== null) {
    return NextResponse.json({ error: "You've already answered this one." }, { status: 409 });
  }

  await supabase
    .from("execution_blocks")
    .update({
      accepted: parsed.data.accepted,
      resolved_at: parsed.data.accepted ? new Date().toISOString() : null,
    })
    .eq("id", id);

  if (!parsed.data.accepted) {
    await recomputeExecutionProfile({ supabase, userId: user.id });
    return NextResponse.json({ applied: false });
  }

  const { data: task } = await supabase
    .from("tasks")
    .select("id, goal_id, milestone_id, title, priority, estimated_minutes")
    .eq("id", block.task_id)
    .maybeSingle();

  // The task can be gone if the user deleted the goal between being offered the
  // intervention and accepting it. The block stays recorded either way.
  if (!task) return NextResponse.json({ applied: false, reason: "task_removed" });

  const proposal = (block.recommendation ?? {}) as Proposal;
  const created: string[] = [];

  // A smaller first step becomes its own task, ahead of the original. The
  // original is not deleted — §13 shrinks the entry point, it does not shrink
  // the outcome.
  if (proposal.new_task_title) {
    const { data: newTask } = await supabase
      .from("tasks")
      .insert({
        user_id: user.id,
        goal_id: task.goal_id,
        milestone_id: task.milestone_id,
        title: proposal.new_task_title,
        rationale: `A smaller way into "${task.title}".`,
        task_type: proposal.follow_up_with ? "external_dependency" : "simple_action",
        estimated_minutes: proposal.new_task_minutes ?? 10,
        start_by: proposal.suggested_start ?? null,
        priority: 1,
        status: "not_started",
        // Vezri's suggestion, not something the document said (§7).
        origin: "inferred",
        confidence: 0.6,
      })
      .select("id")
      .single();

    if (newTask) {
      created.push(newTask.id);
      if (proposal.follow_up_with) {
        await supabase.from("task_dependencies").insert({
          user_id: user.id,
          task_id: newTask.id,
          depends_on_task_id: null,
          dependency_type: "external_person",
          external_party_name: proposal.follow_up_with,
        });
      }
    }
  }

  const updates: Record<string, unknown> = {};
  if (proposal.revised_title) updates.title = proposal.revised_title;
  if (proposal.new_task_minutes && !proposal.new_task_title) {
    updates.estimated_minutes = proposal.new_task_minutes;
  }
  if (proposal.suggested_start && !proposal.new_task_title) {
    updates.start_by = proposal.suggested_start;
  }
  // The task comes off "blocked" now that there is a way forward.
  updates.status = "not_started";

  await supabase.from("tasks").update(updates).eq("id", block.task_id);

  await recomputeExecutionProfile({ supabase, userId: user.id });

  return NextResponse.json({ applied: true, created_task_ids: created });
}
