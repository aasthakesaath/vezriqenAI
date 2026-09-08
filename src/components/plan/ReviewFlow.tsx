"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import VezriWorking, { POSE_FOR } from "@/components/VezriWorking";
import { UNDERSTANDING_STEPS } from "@/lib/app-copy";
import TargetCard, { type TargetCardData } from "./TargetCard";
import PlanConfirmation, { type PlanMilestone, type PlanTask } from "./PlanConfirmation";

type Phase = "reading" | "target" | "plan" | "error";

/**
 * How long the client waits before giving up on extraction.
 *
 * Longer than the route's own 300s ceiling, so a server that answers slowly
 * still wins the race and reports its own error; short enough that a request
 * lost in transit cannot hold the screen indefinitely.
 */
const EXTRACTION_TIMEOUT_MS = 330_000;

/** One NDJSON line from the extract route. */
type ExtractEvent =
  | { type: "progress"; phase: "reading" }
  | { type: "progress"; phase: "structure_done"; milestones: number }
  | { type: "progress"; phase: "tasks"; completed: number; total: number }
  | { type: "progress"; phase: "tasks_done"; tasks: number }
  | { type: "progress"; phase: "target" }
  | { type: "error"; status: number; error: string }
  | {
      type: "done";
      clarifying_questions?: string[];
      missing_information?: string[];
    };

/**
 * Plain language for a thing that has happened.
 *
 * "6 of 9" is real progress — it counts passes that actually completed — which
 * is why it is allowed here while a percentage or a countdown is not.
 */
function describeProgress(event: Extract<ExtractEvent, { type: "progress" }>): string {
  switch (event.phase) {
    case "reading":
      return "Reading your plan";
    case "structure_done":
      return event.milestones === 1
        ? "Found 1 milestone"
        : `Found ${event.milestones} milestones`;
    case "tasks":
      return `Working through your milestones — ${event.completed} of ${event.total}`;
    case "tasks_done":
      return "Working out the timing";
    case "target":
      return "Writing your target";
  }
}

/**
 * Drives PRD §5 Steps 3 → 5 → 6.
 *
 * Extraction is kicked off from the client rather than during the server render
 * because it is a long model call: rendering the page first means the user sees
 * the §5 Step 3 progress state immediately instead of a blank pending request.
 */
export default function ReviewFlow({
  goalId,
  initialTarget,
  initialMilestones,
  initialTasks,
  needsExtraction,
}: {
  goalId: string;
  initialTarget: TargetCardData | null;
  initialMilestones: PlanMilestone[];
  initialTasks: PlanTask[];
  needsExtraction: boolean;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(needsExtraction ? "reading" : "target");
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  /**
   * The stage line, set ONLY from a server event.
   *
   * Never a timer. The old component advanced through its whole stage list on
   * a 6-second interval, so the screen read "Reading your plan" then "Working
   * out the timing" then "nearly there" during a period in which no extract
   * request existed at all. If the server is not reporting, this does not move.
   */
  const [stage, setStage] = useState<string>(UNDERSTANDING_STEPS[0]);
  // React 18 StrictMode double-invokes effects in development; without this the
  // extraction would run twice and bill twice.
  const started = useRef(false);

  const extract = useCallback(async () => {
    setPhase("reading");
    setError(null);

    // A request that never settles is how the screen sat on "Working out the
    // timing" for six minutes after the server had already answered 422. The
    // waiting state must be bounded by something the client controls, not by
    // the server's good behaviour.
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), EXTRACTION_TIMEOUT_MS);

    try {
      const response = await fetch(`/api/goals/${goalId}/extract`, {
        method: "POST",
        signal: abort.signal,
      });

      if (!response.ok || !response.body) {
        // A non-2xx never reaches the stream: read it as JSON and stop.
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        // `||`, not `??`: an empty-string error is nullish-coalesced straight
        // through, and an empty message used to render as "no error at all".
        setError(payload.error || "Vezri couldn't read that plan.");
        setPhase("error");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let settled = false;

      const handle = (line: string) => {
        if (!line.trim()) return;
        let event: ExtractEvent;
        try {
          event = JSON.parse(line) as ExtractEvent;
        } catch {
          return; // a partial line; the buffer will complete it
        }

        if (event.type === "progress") {
          setStage(describeProgress(event));
          return;
        }
        if (event.type === "error") {
          settled = true;
          setError(event.error || "Vezri couldn't read that plan.");
          setPhase("error");
          return;
        }
        if (event.type === "done") {
          settled = true;
          setQuestions(
            [...(event.clarifying_questions ?? []), ...(event.missing_information ?? [])].slice(0, 3),
          );
          router.refresh();
          setPhase("target");
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) handle(line);
      }
      handle(buffer);

      if (!settled) {
        // The stream ended without a verdict — the function was killed, or a
        // proxy cut it. Silence is not success.
        setError("Vezri stopped partway through reading your plan. Nothing was saved — try again.");
        setPhase("error");
      }
    } catch (caught) {
      setError(
        (caught as Error)?.name === "AbortError"
          ? "That took longer than expected and Vezri stopped waiting. Your plan is saved — try again."
          : "Couldn't reach Vezriqen. Check your connection and try again.",
      );
      setPhase("error");
    } finally {
      clearTimeout(timer);
    }
  }, [goalId, router]);

  useEffect(() => {
    if (!needsExtraction || started.current) return;
    started.current = true;
    void extract();
  }, [needsExtraction, extract]);

  // The wait and the failure are the same component: a model call that fails
  // must not drop the user onto a differently-shaped screen, and keeping both
  // in VezriWorking is what guarantees a failed run always offers a way out
  // instead of leaving the page loading forever.
  if (phase === "reading" || phase === "error") {
    return (
      <VezriWorking
        className="mt-8"
        stages={[stage]}
        pose={POSE_FOR.readingPlan}
        error={phase === "error" ? error : null}
        errorPose={POSE_FOR.failure}
        onRetry={() => void extract()}
      />
    );
  }

  if (!initialTarget) {
    return (
      <div className="mt-8 rounded-2xl border border-blush bg-white p-6 shadow-soft">
        <p className="text-mauve">Vezri hasn&rsquo;t read this plan yet.</p>
        <button type="button" onClick={() => void extract()} className="btn-primary mt-5">
          Read my plan
        </button>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-8">
      {/* §5 Step 4 — at most three questions, and only the ones that matter. */}
      {questions.length > 0 && phase === "target" && (
        <section
          aria-labelledby="questions-heading"
          className="rounded-2xl bg-blush-wash p-6"
        >
          <h2 id="questions-heading" className="font-semibold text-ink">
            A couple of things Vezri needs
          </h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-mauve">
            {questions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-mauve-light">
            You can answer these by adjusting the target below, or later.
          </p>
        </section>
      )}

      <TargetCard data={initialTarget} onConfirmed={() => setPhase("plan")} />

      {phase === "plan" && (
        <PlanConfirmation
          goalId={goalId}
          milestones={initialMilestones}
          tasks={initialTasks}
        />
      )}
    </div>
  );
}
