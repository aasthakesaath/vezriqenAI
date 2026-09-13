import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAIProvider, AIExtractionError, AIServiceError } from "@/lib/ai";
import { AI_CONFIGURED, SUPABASE_CONFIGURED } from "@/lib/env";
import { BLOCK_CATEGORIES, type BlockCategory } from "@/lib/coach/interventions";
import { recomputeExecutionProfile } from "@/lib/coach/profile";
import {
  UnstickSchema,
  UNSTICK_SYSTEM,
  categoryLabel,
  fallbackUnstick,
  unstickPrompt,
  type Unstick,
} from "@/lib/coach/unstick";
import { goalLabel } from "@/lib/goal-label";
import { loadUserSettings } from "@/lib/user-settings";
import { addDays, dayKeyIn } from "@/lib/time-zone";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * "I'm stuck", and what happens next (PRD §13).
 *
 * The old panel asked what got in the way, took a sentence about it, and
 * closed. Asking someone to explain a failure and then returning nothing is
 * worse than not asking — it teaches them that telling the truth here costs
 * something and buys nothing.
 *
 * FOUR INTENTS, ONE ROUTE. `advise` is the model call; the other three are
 * the buttons the answer is rendered with, and every one of them writes
 * something:
 *
 *   do_now    the block is accepted and resolved, and the task comes off
 *             `blocked` into `in_progress`. They said they are doing it now.
 *   split     the breakdown becomes real task rows in the same goal, and the
 *             parent is marked split.
 *   tomorrow  the task's dates move to tomorrow and it comes off `blocked`.
 *
 * They are one route rather than four because the three apply-paths only make
 * sense against the block that `advise` wrote, and splitting them across
 * endpoints would mean four ways to forget the ownership check.
 *
 * WHY THE TASK STATUS ALWAYS MOVES. A "stuck" check-in writes `blocked`, which
 * is outside OPEN_TASK_STATUSES — so a task left in it disappears from Today,
 * from the week view and from every count. A path that ends with the task
 * still `blocked` has not just failed to change something; it has quietly
 * removed the work. That is the dead end this route exists to close.
 */

const AdviseSchema = z.object({
  intent: z.literal("advise"),
  category: z.enum(BLOCK_CATEGORIES),
  note: z.string().max(2000).optional(),
});

const ApplySchema = z.object({
  intent: z.enum(["do_now", "split", "tomorrow"]),
  block_id: z.string().uuid(),
});

const BodySchema = z.discriminatedUnion("intent", [AdviseSchema, ApplySchema]);

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

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "That isn't something Vezri recognises." }, { status: 400 });
  }

  // RLS scopes this to the caller's own rows: someone else's task reads as
  // missing rather than forbidden.
  const { data: task } = await supabase
    .from("tasks")
    .select(
      "id, goal_id, milestone_id, title, rationale, task_type, estimated_minutes, priority, deadline, start_by, status, goals(short_label, user_goal_text)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!task) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (parsed.data.intent === "advise") {
    return advise({ supabase, user, task, body: parsed.data });
  }

  return apply({ supabase, user, task, intent: parsed.data.intent, blockId: parsed.data.block_id });
}

/* -------------------------------------------------------------------------
 * Step one — what is actually in the way.
 * ---------------------------------------------------------------------- */

type TaskRow = {
  id: string;
  goal_id: string;
  milestone_id: string | null;
  title: string;
  rationale: string | null;
  task_type: string;
  estimated_minutes: number | null;
  priority: number;
  deadline: string | null;
  start_by: string | null;
  status: string;
  goals: unknown;
};

// The Supabase client's generated types are not wired up in this project, so
// the shape is asserted once here rather than at every property access.
type Client = Awaited<ReturnType<typeof createClient>>;
type SessionUser = { id: string };

async function advise(options: {
  supabase: Client;
  user: SessionUser;
  task: TaskRow;
  body: z.infer<typeof AdviseSchema>;
}) {
  const { supabase, user, task, body } = options;
  const category = body.category as BlockCategory;
  const note = body.note?.trim() || null;

  const goal = Array.isArray(task.goals) ? task.goals[0] : task.goals;

  let answer: Unstick = fallbackUnstick(category, task.title);
  let modelVersion: string | null = null;

  if (AI_CONFIGURED) {
    try {
      const provider = getAIProvider();
      const result = await provider.generateStructured({
        action: "unstick",
        system: UNSTICK_SYSTEM,
        prompt: unstickPrompt({
          taskTitle: task.title,
          taskType: task.task_type,
          estimatedMinutes: task.estimated_minutes,
          rationale: task.rationale,
          // The six-word name, never the SMART statement: nothing in the
          // answer needs sixty words of goal, and a model holding them quotes
          // them back.
          goalLabel: goal ? goalLabel(goal as Parameters<typeof goalLabel>[0]) : null,
          category,
          categoryLabel: categoryLabel(category),
          note,
        }),
        schema: UnstickSchema,
        effort: "medium",
      });
      answer = result.data;
      modelVersion = result.modelVersion;
    } catch (error) {
      if (!(error instanceof AIExtractionError)) throw error;
      // A configured model that returned something unusable is worth one more
      // try — retrying is the thing that actually fixes it, and the offline
      // wording would be a worse answer presented as a real one. The panel
      // renders this as an inline retry rather than a crash.
      const retryable = !(error instanceof AIServiceError && error.kind === "unauthorised");
      return NextResponse.json({ error: error.message, retryable }, { status: 502 });
    }
  }

  // The block is the record that this happened and the anchor the three
  // buttons write against. The whole answer goes in `recommendation`, because
  // "Break it into N pieces" turns that breakdown into rows later and must use
  // the same words the user was shown.
  const { data: block, error } = await supabase
    .from("execution_blocks")
    .insert({
      user_id: user.id,
      task_id: task.id,
      category,
      user_text: note,
      // The headline offer is one small action. If the user takes a different
      // path, apply() records the one they actually took — §10 learns from
      // what people accept, not from what was offered.
      intervention_type: "shrink_first_step",
      recommendation: answer,
      explanation: answer.obstacle,
      accepted: null,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (modelVersion) {
    await supabase.from("ai_action_logs").insert({
      user_id: user.id,
      goal_id: task.goal_id,
      action_type: "unstick",
      structured_input: { category, task: task.title, had_note: note !== null },
      structured_output: answer,
      explanation: answer.obstacle,
      model_version: modelVersion,
    });
  }

  return NextResponse.json({
    block_id: block.id,
    obstacle: answer.obstacle,
    action: answer.action,
    breakdown: answer.breakdown,
    source: modelVersion ? "model" : "offline",
  });
}

/* -------------------------------------------------------------------------
 * Step two — the three buttons. Each one changes something.
 * ---------------------------------------------------------------------- */

async function apply(options: {
  supabase: Client;
  user: SessionUser;
  task: TaskRow;
  intent: "do_now" | "split" | "tomorrow";
  blockId: string;
}) {
  const { supabase, user, task, intent, blockId } = options;

  const { data: block } = await supabase
    .from("execution_blocks")
    .select("id, task_id, recommendation, accepted")
    .eq("id", blockId)
    .maybeSingle();

  if (!block || block.task_id !== task.id) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (block.accepted !== null) {
    return NextResponse.json({ error: "You've already answered this one." }, { status: 409 });
  }

  const answer = (block.recommendation ?? {}) as Partial<Unstick>;

  if (intent === "do_now") {
    const { error } = await supabase
      .from("tasks")
      .update({ status: "in_progress" })
      .eq("id", task.id)
      .eq("user_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await closeBlock(supabase, blockId, "shrink_first_step");
    await recomputeExecutionProfile({ supabase, userId: user.id });
    return NextResponse.json({ applied: "do_now", task_status: "in_progress" });
  }

  if (intent === "split") {
    const pieces = (answer.breakdown ?? []).filter((piece) => piece?.text?.trim());
    if (pieces.length === 0) {
      return NextResponse.json(
        { error: "There is nothing to break this into. Try again." },
        { status: 422 },
      );
    }

    const rows = pieces.map((piece, index) => ({
      user_id: user.id,
      goal_id: task.goal_id,
      milestone_id: task.milestone_id,
      // The pieces inherit the parent's dates. Breaking a task up is not a
      // decision about WHEN — "Move to tomorrow" is the button for that, and
      // silently rescheduling here would be §13's original failure wearing a
      // different label.
      title: piece.text.trim(),
      rationale: `Part ${index + 1} of ${pieces.length} of "${task.title}".`,
      task_type: task.task_type,
      estimated_minutes: piece.minutes,
      deadline: task.deadline,
      start_by: task.start_by,
      priority: task.priority,
      status: "not_started" as const,
      split_parent_id: task.id,
      // Vezri worked these out; the document did not say them (§7).
      origin: "inferred" as const,
      confidence: 0.6,
    }));

    // The unique index on (goal_id, title_key) makes a re-tap or a piece that
    // matches an existing title a no-op rather than a 500. ignoreDuplicates is
    // the same posture the plan extraction takes (0012).
    const { error: insertError } = await supabase
      .from("tasks")
      .upsert(rows, { onConflict: "goal_id,title_key", ignoreDuplicates: true });

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

    // Which of them actually exist now — a piece whose title already existed
    // in this goal was not written, and saying "3 added" would be a lie.
    const { data: written } = await supabase
      .from("tasks")
      .select("id")
      .eq("goal_id", task.goal_id)
      .eq("split_parent_id", task.id);

    if ((written?.length ?? 0) === 0) {
      // Every piece collided with a title this goal already has, so there is
      // nothing standing in for the parent. Marking it split here would take
      // the work off Today and put nothing in its place — the one outcome
      // this whole route exists to prevent. Nothing is written, the block
      // stays open, and the other two buttons still work.
      return NextResponse.json(
        {
          error:
            "Those pieces are already on this goal. Try one of the other two, or open the goal to see them.",
        },
        { status: 409 },
      );
    }

    // The parent is marked, not deleted and not completed. `skipped` is the
    // one existing status that means "not being done as written, and not
    // done": it keeps the row on the goal page and out of every open set, so
    // the pieces are not counted twice. split_at says what actually happened.
    const { error: parentError } = await supabase
      .from("tasks")
      .update({ status: "skipped", split_at: new Date().toISOString() })
      .eq("id", task.id)
      .eq("user_id", user.id);

    if (parentError) return NextResponse.json({ error: parentError.message }, { status: 500 });

    await closeBlock(supabase, blockId, "split_task");
    await recomputeExecutionProfile({ supabase, userId: user.id });

    return NextResponse.json({
      applied: "split",
      pieces_created: written?.length ?? rows.length,
      parent_split: true,
    });
  }

  // intent === "tomorrow"
  const { timeZone } = await loadUserSettings(supabase);
  const tomorrow = addDays(dayKeyIn(new Date(), timeZone), 1);

  const { error } = await supabase
    .from("tasks")
    .update({
      deadline: tomorrow,
      // The start-by day moves too. Leaving it behind would leave the task
      // reading "past its start date" on a screen the user has just told it to
      // clear — which is a path that ends in nothing visibly changing.
      start_by: tomorrow,
      start_by_reason: "You moved this to tomorrow.",
      date_anchor: `Moved to ${tomorrow} when you said you were stuck`,
      status: "not_started",
    })
    .eq("id", task.id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await closeBlock(supabase, blockId, "reschedule_window");
  await recomputeExecutionProfile({ supabase, userId: user.id });

  return NextResponse.json({ applied: "tomorrow", deadline: tomorrow });
}

/**
 * Records which way out the user actually took.
 *
 * `accepted` is what §24's intervention-success metric and §10's
 * effective_interventions are both computed from, so it is the path chosen
 * rather than the path offered that is written here.
 */
async function closeBlock(supabase: Client, blockId: string, interventionType: string) {
  await supabase
    .from("execution_blocks")
    .update({
      accepted: true,
      intervention_type: interventionType,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", blockId);
}
