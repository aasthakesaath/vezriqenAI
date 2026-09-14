import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAIProvider, AIExtractionError } from "@/lib/ai";
import { AI_CONFIGURED, SUPABASE_CONFIGURED } from "@/lib/env";
import {
  GUIDANCE_SYSTEM,
  GuidanceSchema,
  guidancePrompt,
  parseStoredGuidance,
  tidyGuidance,
} from "@/lib/coach/guidance";
import { goalLabel } from "@/lib/goal-label";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * The steps for one task (PRD §13, §20).
 *
 * Called when a task card is expanded. Generated once and cached in
 * task_guidance keyed by task_id: the steps for a task do not change between
 * two Tuesdays, and paying for a model call every time a card is opened would
 * make expanding one an expensive habit.
 *
 * WHY THE WRITE IS SERVICE-ROLE. task_guidance has a select-own policy and no
 * insert policy at all (migration 0013), so nothing holding a user's session
 * can write a row there. These rows are rendered to the reader as instructions
 * to follow; a client able to author them could put its own text in front of
 * the next person to open the card. The ownership check that a policy would
 * have done is done here instead, explicitly, before the admin client is
 * touched: the task is read through the CALLER's client, so RLS has already
 * refused it if it is not theirs.
 *
 * The model call itself never leaves the server — ANTHROPIC_API_KEY is read by
 * lib/ai and nothing in this file reaches the browser.
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

  // Through the caller's client, so RLS is the ownership check. A task
  // belonging to someone else is simply not found.
  const { data: task } = await supabase
    .from("tasks")
    .select(
      "id, goal_id, title, rationale, task_type, estimated_minutes, milestones(title), goals(short_label, user_goal_text)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!task) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // ---- Cached? Then there is nothing to generate. -------------------------
  const { data: cached } = await supabase
    .from("task_guidance")
    .select("steps, created_at")
    .eq("task_id", id)
    .maybeSingle();

  if (cached) {
    const stored = parseStoredGuidance(cached.steps);
    // A row that no longer parses is a row from before a shape change. Fall
    // through and regenerate rather than rendering undefined into a list.
    if (stored) {
      return NextResponse.json({ steps: stored.steps, cached: true });
    }
  }

  if (!AI_CONFIGURED) {
    // Said plainly rather than as an empty list. An empty list looks like "there
    // is nothing to say about this task", which is a different claim.
    return NextResponse.json(
      {
        error: "Vezri can't write the steps right now. This needs a fix on our side.",
        retryable: false,
      },
      { status: 503 },
    );
  }

  const milestoneJoin = Array.isArray(task.milestones) ? task.milestones[0] : task.milestones;
  const goalJoin = Array.isArray(task.goals) ? task.goals[0] : task.goals;

  let guidance;
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
        // The six-word label, never the SMART statement: it is 60 words and
        // would be most of the prompt.
        goalLabel: goalLabel(goalJoin ?? {}),
        milestoneTitle:
          (milestoneJoin as { title?: string } | null | undefined)?.title ?? null,
      }),
      schema: GuidanceSchema,
      effort: "medium",
    });
    guidance = tidyGuidance(result.data);
    modelVersion = result.modelVersion;
  } catch (error) {
    if (!(error instanceof AIExtractionError)) throw error;
    // A bad or unparseable response is a retry, not a crash. The message is
    // already written for a human by lib/ai; `retryable` is what puts the
    // button in the panel instead of an error page.
    return NextResponse.json({ error: error.message, retryable: true }, { status: 502 });
  }

  // ---- Cache it. The write is service-role; see the header. ---------------
  //
  // Not fatal. The steps are in hand and the person asked for them; failing
  // the request because the cache would not take would be throwing away the
  // thing they were waiting for. It costs another call next time and says so
  // in the log.
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("task_guidance").upsert(
      {
        task_id: id,
        user_id: user.id,
        steps: guidance.steps,
        model_version: modelVersion,
      },
      { onConflict: "task_id" },
    );
    if (error) console.error(`[guidance] could not cache steps for task ${id}: ${error.message}`);
  } catch (error) {
    console.error(`[guidance] could not cache steps for task ${id}:`, error);
  }

  // §20 — every structured model call is logged with its output and a reason.
  await supabase.from("ai_action_logs").insert({
    user_id: user.id,
    goal_id: task.goal_id,
    action_type: "task_guidance",
    structured_input: { task: task.title, task_type: task.task_type },
    structured_output: guidance,
    explanation: `Wrote ${guidance.steps.length} steps for "${task.title}".`,
    model_version: modelVersion,
  });

  return NextResponse.json({ steps: guidance.steps, cached: false });
}
