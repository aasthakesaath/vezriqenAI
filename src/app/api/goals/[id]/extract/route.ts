import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildPlanForGoal, isIncomplete } from "@/lib/plan/build";
import { AIExtractionError } from "@/lib/ai";
import { AI_CONFIGURED, ConfigurationError, SUPABASE_CONFIGURED } from "@/lib/env";
import { assertSchemaReady, describeSchemaGaps } from "@/lib/db/verify-schema";

export const runtime = "nodejs";
/** Extraction is a long reasoning call over a whole document. */
export const maxDuration = 300;

/** PRD §5 Step 3 — Vezri reads the plan and builds the execution path. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
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
  // A CONTINUATION is the client coming straight back for the rest of a run it
  // already started — it does not spend an attempt against the retry cap.
  // REDO is the deliberate "read it again from scratch"; without it a goal that
  // already has a confirmed target is returned as it stands rather than
  // re-extracted, which is what a stray second request used to do.
  const query = new URL(request.url).searchParams;
  const continuation = query.get("continue") === "1";
  const redo = query.get("redo") === "1";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  // BEFORE the model runs, not after. A migration written but never applied
  // cost a whole extraction: every pass completed, then the final write failed
  // with "Could not find the 'short_label' column of 'goals' in the schema
  // cache" and the work was discarded. Checking first turns two minutes of
  // billed work thrown away into a fast 503 that names the column.
  const schemaGap = await assertSchemaReady(supabase);
  if (schemaGap) {
    return NextResponse.json(
      {
        error:
          "Vezriqen's database is behind its code, so a plan can't be saved yet. " +
          "This needs a migration applied — it isn't something to retry.",
        detail: describeSchemaGaps(schemaGap),
      },
      { status: 503 },
    );
  }

  // NDJSON, one line per thing that has actually happened, then a final line
  // carrying the result or the error.
  //
  // The screen used to advance its own stage text on a timer, so it showed
  // "Reading your plan" through to "nearly there" whether or not a request had
  // been sent — and it did exactly that during a window in which the server
  // logs show no extract request at all. Every line below corresponds to a
  // pass that finished. If nothing is happening, nothing is reported.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        } catch {
          // The client navigated away mid-extraction. The work continues and
          // is still written; there is simply nobody listening.
        }
      };

      try {
        const result = await buildPlanForGoal({
          supabase,
          userId: user.id,
          goalId: id,
          continuation,
          redo,
          onProgress: (event) => send({ type: "progress", ...event }),
        });

        // The budget ran out with passes still to go. Everything finished is
        // written; the client comes straight back for the rest. This is what
        // replaces being killed at the platform's 300-second ceiling.
        if (isIncomplete(result)) {
          send({ type: "incomplete", passes_done: result.passesDone });
          return;
        }

        send({
          type: "done",
          goal_id: id,
          milestones: result.milestoneCount,
          tasks: result.taskCount,
          clarifying_questions: result.plan.clarifying_questions,
          missing_information: result.smart.missing_information,
        });
      } catch (error) {
        const status =
          error instanceof ConfigurationError ? 503 : error instanceof AIExtractionError ? 422 : 500;
        // The response is already 200 with an open stream by the time this
        // runs, so the status travels IN the final line. The client treats a
        // failed line exactly as it treats a non-2xx.
        send({
          type: "error",
          status,
          error:
            error instanceof ConfigurationError || error instanceof AIExtractionError
              ? error.message
              : error instanceof Error
                ? error.message
                : "Couldn't read that plan.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      // Vercel and any intermediate proxy must not buffer this, or every line
      // arrives at once at the end and the progress is worthless.
      "X-Accel-Buffering": "no",
    },
  });
}
