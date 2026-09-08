import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAIProvider, AIExtractionError } from "@/lib/ai";
import { AI_CONFIGURED, SUPABASE_CONFIGURED } from "@/lib/env";
import {
  BLOCK_CATEGORIES,
  COACH_SYSTEM,
  INTERVENTIONS_FOR,
  InterventionSchema,
  coachPrompt,
  fallbackIntervention,
  type BlockCategory,
} from "@/lib/coach/interventions";
import { bestWindow, rankEffectiveInterventions } from "@/lib/coach/profile";
import { BLOCK_CHOICES } from "@/lib/app-copy";

export const runtime = "nodejs";
export const maxDuration = 120;

const BlockSchema = z
  .object({
    category: z.enum(BLOCK_CATEGORIES),
    user_text: z.string().max(2000).optional(),
    check_in_id: z.string().uuid().optional(),
  })
  .strict();

/**
 * Execution Block Coach, step 2 (PRD §13).
 *
 * The user has said what got in the way; this returns exactly one intervention.
 * Nothing is applied yet — §4.3 keeps the user in control, and §13's whole
 * point is that the task must not be silently rescheduled.
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

  const parsed = BlockSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "That isn't a barrier Vezri recognises." }, { status: 400 });
  }
  const category = parsed.data.category as BlockCategory;

  const { data: task } = await supabase
    .from("tasks")
    .select(
      "id, goal_id, title, task_type, estimated_minutes, deadline, goals(normalized_goal, user_goal_text), task_dependencies(external_party_name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!task) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const goalJoin = Array.isArray(task.goals) ? task.goals[0] : task.goals;
  const goalTitle =
    (goalJoin as { normalized_goal?: string; user_goal_text?: string } | null)?.normalized_goal ??
    (goalJoin as { user_goal_text?: string } | null)?.user_goal_text ??
    "your goal";

  const deps = (task.task_dependencies ?? []) as Array<{ external_party_name: string | null }>;
  const externalParty = deps.find((d) => d.external_party_name)?.external_party_name ?? null;

  const { data: profile } = await supabase
    .from("execution_profiles")
    .select("completion_by_time, effective_interventions")
    .eq("user_id", user.id)
    .maybeSingle();

  const allowed = INTERVENTIONS_FOR[category];
  const label = BLOCK_CHOICES.find((c) => c.id === category)?.label ?? category;

  let intervention = fallbackIntervention(category, task.title, externalParty);
  let modelVersion: string | null = null;

  if (AI_CONFIGURED) {
    try {
      const provider = getAIProvider();
      const result = await provider.generateStructured({
        action: "execution_block_coach",
        system: COACH_SYSTEM,
        prompt: coachPrompt({
          taskTitle: task.title,
          taskType: task.task_type,
          estimatedMinutes: task.estimated_minutes,
          deadline: task.deadline,
          goalTitle,
          category,
          categoryLabel: label,
          userText: parsed.data.user_text ?? null,
          externalParty,
          allowedInterventions: allowed,
          previouslyEffective: rankEffectiveInterventions(profile ?? {}),
          productiveWindow: bestWindow(profile ?? {}),
        }),
        schema: InterventionSchema,
        effort: "medium",
      });

      // The model may only choose from the interventions that fit this barrier.
      // Anything else falls back rather than being applied — this is the guard
      // against reaching for "reschedule" on an avoidance block.
      if (allowed.includes(result.data.intervention_type)) {
        intervention = result.data;
        modelVersion = result.modelVersion;
      }
    } catch (error) {
      // §13 has to work without AI. A user who says "not done" and gets nothing
      // back has been abandoned exactly when this feature should earn its keep.
      if (!(error instanceof AIExtractionError)) throw error;
    }
  }

  const { data: block, error } = await supabase
    .from("execution_blocks")
    .insert({
      user_id: user.id,
      task_id: id,
      check_in_id: parsed.data.check_in_id ?? null,
      category,
      user_text: parsed.data.user_text ?? null,
      intervention_type: intervention.intervention_type,
      recommendation: intervention.proposal,
      explanation: intervention.reasoning,
      accepted: null,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (modelVersion) {
    await supabase.from("ai_action_logs").insert({
      user_id: user.id,
      goal_id: task.goal_id,
      action_type: "execution_block_coach",
      structured_input: { category, task: task.title },
      structured_output: intervention,
      explanation: intervention.reasoning,
      model_version: modelVersion,
    });
  }

  return NextResponse.json({
    block_id: block.id,
    intervention_type: intervention.intervention_type,
    message: intervention.message,
    proposal: intervention.proposal,
  });
}
