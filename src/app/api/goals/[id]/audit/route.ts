import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadGoalSnapshot } from "@/lib/health/load";
import {
  AUDIT_SYSTEM,
  AuditNarrativeSchema,
  auditPrompt,
  type AuditNarrative,
} from "@/lib/health/audit";
import { getAIProvider, AIExtractionError } from "@/lib/ai";
import { AI_CONFIGURED, SUPABASE_CONFIGURED } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * "What am I missing?" (PRD §16).
 *
 * Gaps are detected deterministically before the model is involved; the model
 * only explains them and names the next move. If the AI is unavailable the
 * audit still returns — the gaps are the substance, the prose is the polish.
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

  const snapshot = await loadGoalSnapshot({ supabase, goalId: id });
  if (!snapshot) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const goalTitle =
    snapshot.goal.normalized_goal ?? snapshot.goal.user_goal_text ?? "this goal";

  let narrative: AuditNarrative | null = null;
  let modelVersion: string | null = null;

  if (AI_CONFIGURED && snapshot.topGaps.length > 0) {
    try {
      const provider = getAIProvider();
      const result = await provider.generateStructured({
        action: "goal_audit",
        system: AUDIT_SYSTEM,
        prompt: auditPrompt({
          goal: goalTitle,
          gaps: snapshot.topGaps,
          successMeasures: snapshot.goal.success_criteria,
        }),
        schema: AuditNarrativeSchema,
        effort: "medium",
      });
      narrative = result.data;
      modelVersion = result.modelVersion;
    } catch (error) {
      // A model failure must not swallow the audit. The detected gaps stand on
      // their own; only the phrasing is lost.
      if (!(error instanceof AIExtractionError)) throw error;
    }
  }

  await supabase.from("goal_audits").insert({
    user_id: user.id,
    goal_id: id,
    health_inputs: {
      factors: snapshot.health.factors,
      gap_count: snapshot.gaps.length,
    },
    health_score: snapshot.health.score,
    health_status: snapshot.health.status,
    missing_items: snapshot.topGaps,
    explanation: narrative?.next_move ?? null,
  });

  if (narrative) {
    await supabase.from("ai_action_logs").insert({
      user_id: user.id,
      goal_id: id,
      action_type: "goal_audit",
      structured_input: { gaps: snapshot.topGaps },
      structured_output: narrative,
      explanation: narrative.reasoning,
      model_version: modelVersion,
    });
  }

  return NextResponse.json({
    health: { score: snapshot.health.score, status: snapshot.health.status },
    factors: snapshot.health.factors,
    gaps: snapshot.topGaps.map((gap, index) => ({
      ...gap,
      explanation: narrative?.gap_explanations[index] ?? gap.matters,
    })),
    next_move: narrative?.next_move ?? null,
  });
}
