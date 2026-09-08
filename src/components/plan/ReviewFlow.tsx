"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import VezriWorking, { POSE_FOR } from "@/components/VezriWorking";
import { UNDERSTANDING_STEPS } from "@/lib/app-copy";
import TargetCard, { type TargetCardData } from "./TargetCard";
import PlanConfirmation, { type PlanMilestone, type PlanTask } from "./PlanConfirmation";

type Phase = "reading" | "target" | "plan" | "error";

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
  // React 18 StrictMode double-invokes effects in development; without this the
  // extraction would run twice and bill twice.
  const started = useRef(false);

  const extract = useCallback(async () => {
    setPhase("reading");
    setError(null);
    try {
      const response = await fetch(`/api/goals/${goalId}/extract`, { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        clarifying_questions?: string[];
        missing_information?: string[];
      };
      if (!response.ok) {
        setError(payload.error ?? "Vezri couldn't read that plan.");
        setPhase("error");
        return;
      }
      setQuestions([
        ...(payload.clarifying_questions ?? []),
        ...(payload.missing_information ?? []),
      ].slice(0, 3));
      // Pull the freshly written target and plan from the server.
      router.refresh();
      setPhase("target");
    } catch {
      setError("Couldn't reach Vezriqen. Check your connection and try again.");
      setPhase("error");
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
        stages={UNDERSTANDING_STEPS}
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
