import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, type Authenticated } from "@/lib/api/auth";
import { loadOwnTask, waitingOnName } from "@/lib/api/task-access";
import { getAIProvider, AIExtractionError } from "@/lib/ai";
import { AI_CONFIGURED } from "@/lib/env";
import { BLOCK_CATEGORIES, type BlockCategory } from "@/lib/coach/interventions";
import {
  UNBLOCK_SYSTEM,
  UnblockSchema,
  interventionForReason,
  parseStoredUnblock,
  unblockPrompt,
} from "@/lib/coach/unblock";
import { recomputeExecutionProfile } from "@/lib/coach/profile";
import { BLOCK_CHOICES } from "@/lib/app-copy";
import { goalLabel } from "@/lib/goal-label";
import { loadUserSettings } from "@/lib/user-settings";
import { addDays, dayKeyIn } from "@/lib/time-zone";
import { withoutDuplicateTitles } from "@/lib/plan/task-title";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * "I'm stuck", end to end (PRD §13).
 *
 * The button used to collect a barrier and a line of free text and stop. The
 * row was written, so the data was there; nothing came back that the person
 * could do, which makes telling Vezri you are stuck cost thirty seconds and
 * return nothing.
 *
 * ONE ROUTE, FOUR ACTIONS, because they are one conversation about one block
 * and the three outcomes all act on the analysis the first one produced. That
 * analysis lives in execution_blocks.recommendation, and `block_id` is the
 * handle the outcomes pass back:
 *
 *   analyse   the model call. Writes the block, returns obstacle + one
 *             five-minute action + a 2-3 piece breakdown.
 *   commit    "I'll do that now". Block accepted and resolved; the task comes
 *             off blocked and onto in_progress.
 *   split     "Break it into N pieces". The breakdown becomes real tasks in
 *             the same goal; the parent is marked split and stands down.
 *   tomorrow  "Move to tomorrow". The task's own date moves one day out.
 *
 * NO PATH ENDS IN A CLOSED PANEL WITH NOTHING WRITTEN. Every one of the three
 * outcomes changes a row the next screen reads, and each returns what changed
 * so the panel can say so rather than just disappearing.
 */

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("analyse"),
    reason: z.enum(BLOCK_CATEGORIES),
    note: z.string().max(2000).optional(),
    check_in_id: z.string().uuid().optional(),
  }),
  z.object({ action: z.literal("commit"), block_id: z.string().uuid() }),
  z.object({ action: z.literal("split"), block_id: z.string().uuid() }),
  z.object({ action: z.literal("tomorrow"), block_id: z.string().uuid().optional() }),
]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUser("tasks/[id]/stuck");
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const { id } = await context.params;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "That isn't something Vezri can do here." }, { status: 400 });
  }

  // Read through the CALLER's client, so RLS is the ownership check: a task
  // belonging to someone else is simply not found.
  //
  // `task_dependencies` is NOT embedded here. It used to be, and that is what
  // made this route answer 404 for a task that existed — see the header of
  // lib/api/task-access. Who the task waits on is a separate query, made only
  // on the path that needs it.
  const lookup = await loadOwnTask<TaskRow>({
    supabase,
    route: "tasks/[id]/stuck",
    taskId: id,
    columns:
      "id, goal_id, milestone_id, title, rationale, task_type, estimated_minutes, priority, status, deadline, start_by, milestones(title), goals(short_label, user_goal_text)",
    // A blocked task is the single most likely thing someone presses "I'm
    // stuck" on, and not_done is the second. Only work that is genuinely over
    // is refused, and it is refused as a 409 that says which state it is in.
    requireOutstanding: true,
  });
  if (!lookup.ok) return lookup.response;
  const task = lookup.task;

  switch (parsed.data.action) {
    case "analyse":
      return analyse({ supabase, userId: user.id, task, input: parsed.data });
    case "commit":
      return commit({ supabase, userId: user.id, taskId: id, blockId: parsed.data.block_id });
    case "split":
      return split({ supabase, userId: user.id, task, blockId: parsed.data.block_id });
    case "tomorrow":
      return moveToTomorrow({ supabase, userId: user.id, task, blockId: parsed.data.block_id });
  }
}

/* ------------------------------------------------------------------------ */

type TaskRow = {
  id: string;
  goal_id: string;
  milestone_id: string | null;
  title: string;
  rationale: string | null;
  task_type: string;
  estimated_minutes: number | null;
  priority: number;
  status: string;
  deadline: string | null;
  start_by: string | null;
  milestones: unknown;
  goals: unknown;
};

/** The caller's client, as requireUser hands it back. */
type Client = Authenticated["supabase"];

function firstOf<T>(join: unknown): T | null {
  if (Array.isArray(join)) return (join[0] as T) ?? null;
  return (join as T) ?? null;
}

/**
 * The model call. Writes the block whatever happens next, because the barrier
 * the person reported is a fact about their week and §10 learns from it even
 * if they close the panel.
 */
async function analyse(options: {
  supabase: Client;
  userId: string;
  task: TaskRow;
  input: { reason: BlockCategory; note?: string; check_in_id?: string };
}) {
  const { supabase, userId, task, input } = options;

  if (!AI_CONFIGURED) {
    return NextResponse.json(
      {
        error: "Vezri can't work this one out right now. This needs a fix on our side.",
        retryable: false,
      },
      { status: 503 },
    );
  }

  const externalParty = await waitingOnName({ supabase, taskId: task.id });
  const reasonLabel =
    BLOCK_CHOICES.find((choice) => choice.id === input.reason)?.label ?? input.reason;

  let unblock;
  let modelVersion: string;
  try {
    const provider = getAIProvider();
    const result = await provider.generateStructured({
      action: "task_unblock",
      system: UNBLOCK_SYSTEM,
      prompt: unblockPrompt({
        taskTitle: task.title,
        taskType: task.task_type,
        estimatedMinutes: task.estimated_minutes,
        rationale: task.rationale,
        goalLabel: goalLabel(firstOf(task.goals) ?? {}),
        milestoneTitle: firstOf<{ title: string }>(task.milestones)?.title ?? null,
        reasonLabel,
        note: input.note?.trim() || null,
        externalParty,
      }),
      schema: UnblockSchema,
      effort: "medium",
    });
    unblock = result.data;
    modelVersion = result.modelVersion;
  } catch (error) {
    if (!(error instanceof AIExtractionError)) throw error;
    // A bad response is an inline retry, never a crash and never a panel that
    // closes with nothing in it. lib/ai has already written the message for a
    // human; `retryable` is what puts the button on it.
    return NextResponse.json({ error: error.message, retryable: true }, { status: 502 });
  }

  const { data: block, error } = await supabase
    .from("execution_blocks")
    .insert({
      user_id: userId,
      task_id: task.id,
      check_in_id: input.check_in_id ?? null,
      category: input.reason,
      user_text: input.note?.trim() || null,
      intervention_type: interventionForReason(input.reason),
      // The whole analysis, so the three buttons act on exactly what the
      // person was shown rather than on a second, differently-worded call.
      recommendation: unblock,
      explanation: unblock.obstacle,
      accepted: null,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("ai_action_logs").insert({
    user_id: userId,
    goal_id: task.goal_id,
    action_type: "task_unblock",
    structured_input: { task: task.title, reason: input.reason, had_note: Boolean(input.note) },
    structured_output: unblock,
    explanation: unblock.obstacle,
    model_version: modelVersion,
  });

  return NextResponse.json({
    block_id: block.id,
    obstacle: unblock.obstacle,
    first_action: unblock.first_action,
    breakdown: unblock.breakdown,
  });
}

/**
 * Loads the block this outcome acts on, and refuses one that has already been
 * answered. Two taps on "Break it into 3 pieces" must not write six tasks.
 */
async function loadOpenBlock(supabase: Client, blockId: string, taskId: string) {
  const { data: block } = await supabase
    .from("execution_blocks")
    .select("id, task_id, category, recommendation, accepted")
    .eq("id", blockId)
    .maybeSingle();

  if (!block || block.task_id !== taskId) return { block: null, problem: "not_found" as const };
  if (block.accepted !== null) return { block: null, problem: "already_answered" as const };
  return { block, problem: null };
}

/** "I'll do that now." The panel closes, and the task is under way. */
async function commit(options: {
  supabase: Client;
  userId: string;
  taskId: string;
  blockId: string;
}) {
  const { supabase, userId, taskId, blockId } = options;

  const { block, problem } = await loadOpenBlock(supabase, blockId, taskId);
  if (problem === "not_found") return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (problem === "already_answered") {
    return NextResponse.json({ error: "You've already answered this one." }, { status: 409 });
  }

  await supabase
    .from("execution_blocks")
    .update({ accepted: true, resolved_at: new Date().toISOString() })
    .eq("id", block!.id);

  // The check-in put the task on `blocked` when they said they were stuck.
  // Saying they will do the first action now is the thing that takes it off,
  // and it is why this path is not just a closed dialog: the row moves.
  const { error } = await supabase
    .from("tasks")
    .update({ status: "in_progress" })
    .eq("id", taskId)
    .eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recomputeExecutionProfile({ supabase, userId });

  return NextResponse.json({
    applied: true,
    outcome: "committed",
    task_status: "in_progress",
    message: "It's on your list as under way.",
  });
}

/**
 * "Break it into N pieces."
 *
 * The breakdown becomes real rows in the same goal, and the parent stands
 * down: split_at records when, split_from_task_id on each child records where
 * it came from, and the parent's status moves out of the open set so Today
 * does not show it beside its own pieces — which is the duplicate that
 * migration 0012 exists to stop, arriving by a different door.
 *
 * The parent is NOT deleted and NOT completed. The work it describes is
 * unfinished; it is simply no longer the row that tracks it.
 */
async function split(options: {
  supabase: Client;
  userId: string;
  task: TaskRow;
  blockId: string;
}) {
  const { supabase, userId, task, blockId } = options;

  const { block, problem } = await loadOpenBlock(supabase, blockId, task.id);
  if (problem === "not_found") return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (problem === "already_answered") {
    return NextResponse.json({ error: "You've already answered this one." }, { status: 409 });
  }

  const unblock = parseStoredUnblock(block!.recommendation);
  if (!unblock) {
    return NextResponse.json(
      { error: "Vezri couldn't read that breakdown back. Ask it again.", retryable: true },
      { status: 502 },
    );
  }

  // A goal cannot hold the same task title twice (0012). Offering a piece that
  // collides would either fail the insert or vanish silently, so the titles the
  // goal already has are checked first and any collision is dropped here, where
  // the count in the response can be honest about it.
  const { data: existing } = await supabase
    .from("tasks")
    .select("title")
    .eq("goal_id", task.goal_id);

  const pieces = withoutDuplicateTitles(
    unblock.breakdown,
    (piece) => piece.title,
    (existing ?? []).map((row) => row.title),
  );

  if (pieces.length === 0) {
    return NextResponse.json(
      {
        error: "Those pieces are already on this goal, so nothing new was added.",
        retryable: false,
      },
      { status: 409 },
    );
  }

  const { data: created, error: insertError } = await supabase
    .from("tasks")
    .insert(
      // Inserted in the order the model wrote them, which is the order the
      // work is done in. tasks has no sort column; created_at carries it, and
      // one statement preserves the array's order.
      pieces.map((piece) => ({
        user_id: userId,
        goal_id: task.goal_id,
        milestone_id: task.milestone_id,
        title: piece.title,
        rationale: `Part of "${task.title}".`,
        task_type: task.task_type,
        estimated_minutes: piece.minutes,
        // The parent's dates carry over unchanged. Splitting a task is not a
        // reason to move when it is due, and inventing a new date per piece
        // would be Vezri rewriting a deadline it was given (§7, §14).
        deadline: task.deadline,
        start_by: task.start_by,
        priority: task.priority,
        status: "not_started" as const,
        // Vezri's suggestion, not something the plan said.
        origin: "inferred" as const,
        confidence: 0.6,
        split_from_task_id: task.id,
      })),
    )
    .select("id, title");

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const { error: parentError } = await supabase
    .from("tasks")
    .update({
      split_at: new Date().toISOString(),
      // Out of OPEN_TASK_STATUSES, so the parent leaves Today and the goal's
      // own list. `skipped` is the closest true statement the enum has: this
      // row is not being worked, and it is not done either.
      status: "skipped",
    })
    .eq("id", task.id)
    .eq("user_id", userId);
  if (parentError) return NextResponse.json({ error: parentError.message }, { status: 500 });

  await supabase
    .from("execution_blocks")
    .update({
      accepted: true,
      resolved_at: new Date().toISOString(),
      intervention_type: "split_task",
    })
    .eq("id", block!.id);

  await recomputeExecutionProfile({ supabase, userId });

  const count = created?.length ?? 0;
  return NextResponse.json({
    applied: true,
    outcome: "split",
    created_task_ids: (created ?? []).map((row) => row.id),
    created_titles: (created ?? []).map((row) => row.title),
    skipped_duplicates: unblock.breakdown.length - pieces.length,
    message:
      count === 1
        ? "1 smaller task is on this goal now."
        : `${count} smaller tasks are on this goal now.`,
  });
}

/**
 * "Move to tomorrow."
 *
 * Which date moves is deliberate. A task with a deadline has its deadline
 * moved; a task with only a start date has its start date moved. A task with
 * neither is given a START date of tomorrow and never a deadline — §7 forbids
 * inventing a date the plan does not state, and a deadline is a commitment
 * while a start date is an intention.
 */
async function moveToTomorrow(options: {
  supabase: Client;
  userId: string;
  task: TaskRow;
  blockId?: string;
}) {
  const { supabase, userId, task, blockId } = options;

  const { timeZone } = await loadUserSettings(supabase);
  const tomorrow = addDays(dayKeyIn(new Date(), timeZone), 1);

  const update: Record<string, unknown> = {
    date_anchor: `Moved to ${tomorrow} when you said you were stuck`,
  };
  // Off `blocked`, and only off `blocked`. The check-in put it there when they
  // said they were stuck, and a date is what unblocks it. A task already
  // `in_progress` stays that way — resetting it to not_started would be this
  // route quietly deciding the work they had started did not count.
  if (task.status === "blocked") update.status = "not_started";
  const movedField = task.deadline ? "deadline" : "start_by";
  update[movedField] = tomorrow;

  const { error } = await supabase
    .from("tasks")
    .update(update)
    .eq("id", task.id)
    .eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (blockId) {
    await supabase
      .from("execution_blocks")
      .update({
        accepted: true,
        resolved_at: new Date().toISOString(),
        intervention_type: "reschedule_window",
      })
      .eq("id", blockId)
      .eq("task_id", task.id)
      .is("accepted", null);
  }

  await recomputeExecutionProfile({ supabase, userId });

  return NextResponse.json({
    applied: true,
    outcome: "moved",
    moved_field: movedField,
    moved_to: tomorrow,
    message: movedField === "deadline" ? "Due tomorrow now." : "Starts tomorrow now.",
  });
}
