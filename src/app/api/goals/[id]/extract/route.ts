import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildPlanForGoal } from "@/lib/plan/build";
import { AIExtractionError } from "@/lib/ai";
import { AI_CONFIGURED, ConfigurationError, SUPABASE_CONFIGURED } from "@/lib/env";

export const runtime = "nodejs";
/** Extraction is a long reasoning call over a whole document. */
export const maxDuration = 300;

/** PRD §5 Step 3 — Vezri reads the plan and builds the execution path. */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ error: "Vezriqen isn't configured." }, { status: 503 });
  }
  if (!AI_CONFIGURED) {
    return NextResponse.json(
      { error: "Plan extraction isn't configured. Set ANTHROPIC_API_KEY." },
      { status: 503 },
    );
  }

  const { id } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  try {
    const result = await buildPlanForGoal({ supabase, userId: user.id, goalId: id });
    return NextResponse.json({
      goal_id: id,
      milestones: result.milestoneCount,
      tasks: result.taskCount,
      clarifying_questions: result.plan.clarifying_questions,
      missing_information: result.smart.missing_information,
    });
  } catch (error) {
    if (error instanceof ConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof AIExtractionError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Couldn't read that plan." },
      { status: 500 },
    );
  }
}
