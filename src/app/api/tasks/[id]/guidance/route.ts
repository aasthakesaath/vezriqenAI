import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAIProvider, AIExtractionError, AIServiceError } from "@/lib/ai";
import { AI_CONFIGURED, SUPABASE_CONFIGURED } from "@/lib/env";
import { GuidanceSchema, guidancePrompt, GUIDANCE_SYSTEM, type GuidanceStep } from "@/lib/coach/guidance";
import { goalLabel } from "@/lib/goal-label";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * The steps for one task, generated once and kept.
 *
 * WHY THE CACHE IS THE FEATURE. A task card expands on tap. Without a cache
 * that is a model call per expand, per task, per visit — the same four
 * sentences bought over and over. task_guidance is keyed by task_id, so the
 * second expand is a row read.
 *
 * WHY THE WRITE USES THE SERVICE ROLE. task_guidance has a select-own policy
 * and no insert policy at all (0013). A session that could write there could
 * put arbitrary text in front of the user in Vezri's voice, so the row is
 * written by the server, after the schema has validated it, and the user's own
 * client can only ever read it back. The ownership check below is therefore
 * not decoration: it is what stands in for the RLS the admin client bypasses.
 *
 * The key never reaches the browser — this runs on the server and the response
 * carries steps, not credentials.
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

  // RLS scopes this to the caller's own rows, so a task belonging to someone
  // else is indistinguishable from one that does not exist.
  const { data: task } = await supabase
    .from("tasks")
    .select(
      "id, goal_id, title, rationale, task_type, estimated_minutes, milestones(title), goals(short_label, user_goal_text)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!task) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { data: cached } = await supabase
    .from("task_guidance")
    .select("steps, created_at")
    .eq("task_id", id)
    .maybeSingle();

  if (cached?.steps) {
    return NextResponse.json({ steps: cached.steps as GuidanceStep[], cached: true });
  }

  if (!AI_CONFIGURED) {
    // Not retryable, and saying so is the point: a "Try again" that cannot
    // work is a worse answer than a straight one. There is no offline
    // fallback here on purpose — invented steps for a task Vezri has not read
    // would be worse than no steps.
    return NextResponse.json(
      {
        error: "Vezri can't write the steps for this right now. This one is on us to fix.",
        retryable: false,
      },
      { status: 503 },
    );
  }

  const milestone = Array.isArray(task.milestones) ? task.milestones[0] : task.milestones;
  const goal = Array.isArray(task.goals) ? task.goals[0] : task.goals;

  let steps: GuidanceStep[];
  let modelVersion: string;
  try {
    const provider = getAIProvider();
    const result = await provider.generateStructured({
      action: "task_guidance",
      system: GUIDANCE_SYSTEM,
      prompt: guidancePrompt({
        taskTitle: task.title,
        taskType: task.task_type,
        estimatedMinutes: task.estimated_minutes,
        rationale: task.rationale,
        milestoneTitle: (milestone as { title?: string } | null)?.title ?? null,
        // The six-word name, never the 60-word SMART statement: the statement
        // is not context a step needs, and a model holding it will quote it.
        goalLabel: goal ? goalLabel(goal) : null,
      }),
      schema: GuidanceSchema,
      effort: "medium",
    });
    steps = result.data.steps;
    modelVersion = result.modelVersion;
  } catch (error) {
    // A response that did not fit the schema, or a provider that was
    // unreachable. Both are worth one more try from the user's side, and
    // neither is worth a stack trace in front of them. The detail is on the
    // server, in the provider's own log line.
    if (error instanceof AIExtractionError) {
      const retryable = !(error instanceof AIServiceError && error.kind === "unauthorised");
      return NextResponse.json({ error: error.message, retryable }, { status: 502 });
    }
    throw error;
  }

  // Written with the service role, because the policy set on task_guidance
  // gives `authenticated` no way in. user_id is set from the session, never
  // from the request body.
  const admin = createAdminClient();
  const { error: writeError } = await admin
    .from("task_guidance")
    .upsert(
      { task_id: id, user_id: user.id, steps, model_version: modelVersion },
      { onConflict: "task_id" },
    );

  if (writeError) {
    // The steps are good; only the cache failed. Returning them is strictly
    // better than failing — the cost is that the next expand pays again.
    console.error(`[guidance] could not cache steps for task ${id}: ${writeError.message}`);
  }

  await supabase.from("ai_action_logs").insert({
    user_id: user.id,
    goal_id: task.goal_id,
    action_type: "task_guidance",
    structured_input: { task: task.title },
    structured_output: { steps },
    explanation: `Wrote ${steps.length} steps for "${task.title}".`,
    model_version: modelVersion,
  });

  return NextResponse.json({ steps, cached: false });
}
