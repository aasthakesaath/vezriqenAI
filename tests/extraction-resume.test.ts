import { describe, expect, it, vi, beforeEach } from "vitest";
import type { z } from "zod";
import type { AIProvider, StructuredRequest } from "@/lib/ai/provider";
import { fakeSupabase, type Tables } from "./helpers/fake-supabase";

/**
 * Resumable extraction.
 *
 * Reading a plan is 8-10 model calls. It used to be all-or-nothing: on
 * 2026-09-08 every pass completed and the final write failed on a column that
 * had never been migrated, so all of it was discarded and "Try again" paid for
 * the whole thing a second time.
 *
 * These tests are about the money and the honesty, in that order: a resumed
 * run must not re-call the model for a pass that already landed, must not
 * delete what landed, and must never let a half-read plan look finished.
 */

const provider = vi.hoisted(() => {
  const calls: string[] = [];
  const failures = new Map<string, Error>();
  return { calls, failures };
});

vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return {
    ...actual,
    getAIProvider: (): AIProvider => ({
      name: "fake",
      modelVersion: "fake-model-1",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      generateStructured: (async (request: StructuredRequest<z.ZodTypeAny>) => {
        provider.calls.push(request.action);
        const failure = provider.failures.get(request.action);
        if (failure) throw failure;
        return {
          data: answerFor(request.action),
          modelVersion: "fake-model-1",
          usage: { inputTokens: 1000, outputTokens: 500 },
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
    }),
  };
});

const { buildPlanForGoal } = await import("@/lib/plan/build");

const provenance = {
  origin: "inferred" as const,
  confidence: 0.8,
  excerpt: null,
  page_or_section: null,
};

/** Seven milestones — three task passes at three milestones each. */
const MILESTONE_TITLES = ["M1", "M2", "M3", "M4", "M5", "M6", "M7"];

function answerFor(action: string): unknown {
  if (action === "extract_plan_structure") {
    return {
      outcome: "Ship Atlas to general availability",
      target_date: "2026-12-01",
      success_measures: ["Atlas is live"],
      constraints: [],
      risks: [],
      evidence_required: [],
      milestones: MILESTONE_TITLES.map((title) => ({
        title,
        target_date: "2026-11-01",
        weight: 3,
        already_complete: false,
        provenance,
      })),
      clarifying_questions: [],
      reasoning: "Read from the plan.",
    };
  }
  if (action.startsWith("extract_plan_tasks_")) {
    const pass = action.slice("extract_plan_tasks_".length);
    return {
      tasks: [
        {
          title: `Task for pass ${pass}`,
          rationale: null,
          milestone_title: null,
          task_type: "deep_work",
          estimated_minutes: 60,
          deadline: "2026-10-01",
          deadline_is_hard: false,
          recurrence_rule: null,
          external_party_name: null,
          depends_on_titles: [],
          provenance,
        },
      ],
    };
  }
  return {
    user_wording: "Ship Atlas",
    normalized_goal: "Ship Atlas to general availability by 1 December 2026",
    short_label: "Ship Atlas to GA",
    target_date: "2026-12-01",
    success_measures: ["Atlas is live"],
    constraints: [],
    feasibility_note: null,
    missing_information: [],
    reasoning: "Restated from the plan.",
  };
}

function seed(): Tables {
  return {
    goals: [{ id: "goal-1", user_id: "user-1", user_goal_text: "Ship Atlas", normalized_goal: null }],
    plan_documents: [
      {
        id: "doc-1",
        goal_id: "goal-1",
        filename: "plan.docx",
        mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        storage_path: null,
        extracted_text: "Ship Atlas by December.",
        extraction_state: "not_started",
        extraction_passes: {},
        extraction_attempts: 0,
        extraction_usage: {},
        extraction_note: null,
        extracted_structure: null,
      },
    ],
    milestones: [],
    tasks: [],
    task_dependencies: [],
    plan_source_anchors: [],
    ai_action_logs: [],
  };
}

const run = (client: ReturnType<typeof fakeSupabase>["client"]) =>
  buildPlanForGoal({ supabase: client, userId: "user-1", goalId: "goal-1", today: "2026-09-08" });

const document = (db: Tables) => db.plan_documents[0];

beforeEach(() => {
  provider.calls.length = 0;
  provider.failures.clear();
});

describe("resumable extraction", () => {
  it("records every pass as it lands, not once at the end", async () => {
    const supabase = fakeSupabase(seed());
    await run(supabase.client);

    // 1 structure + 3 task batches (7 milestones, 3 per pass) + 1 target.
    expect(provider.calls).toHaveLength(5);
    expect(document(supabase.db).extraction_passes).toEqual({
      structure: true,
      "tasks:0": true,
      "tasks:1": true,
      "tasks:2": true,
      target: true,
    });
    expect(document(supabase.db).extraction_state).toBe("complete");
  });

  it("resumes from the first incomplete pass instead of paying for all of them again", async () => {
    const supabase = fakeSupabase(seed());

    // The 2026-09-08 shape: the last write fails after everything else worked.
    provider.failures.set("smart_target", new Error("Boom"));
    await expect(run(supabase.client)).rejects.toThrow();

    const firstAttempt = [...provider.calls];
    expect(firstAttempt).toEqual([
      "extract_plan_structure",
      "extract_plan_tasks_1",
      "extract_plan_tasks_2",
      "extract_plan_tasks_3",
      "smart_target",
    ]);
    const milestonesAfterFailure = supabase.db.milestones.length;
    const tasksAfterFailure = supabase.db.tasks.length;
    expect(milestonesAfterFailure).toBe(7);
    expect(tasksAfterFailure).toBe(3);

    provider.calls.length = 0;
    provider.failures.clear();
    await run(supabase.client);

    // THE POINT: only the pass that never landed is bought a second time.
    expect(provider.calls).toEqual(["smart_target"]);
    expect(supabase.db.milestones).toHaveLength(milestonesAfterFailure);
    expect(supabase.db.tasks).toHaveLength(tasksAfterFailure);
    expect(document(supabase.db).extraction_state).toBe("complete");
  });

  it("keeps the task batches that landed when a later batch fails", async () => {
    const supabase = fakeSupabase(seed());
    provider.failures.set("extract_plan_tasks_3", new Error("Boom"));
    await expect(run(supabase.client)).rejects.toThrow();

    expect(document(supabase.db).extraction_passes).toEqual({
      structure: true,
      "tasks:0": true,
      "tasks:1": true,
    });
    expect(supabase.db.tasks).toHaveLength(2);

    provider.calls.length = 0;
    provider.failures.clear();
    await run(supabase.client);

    expect(provider.calls).toEqual(["extract_plan_tasks_3", "smart_target"]);
    expect(supabase.db.tasks).toHaveLength(3);
  });

  it("never lets a half-read plan look finished", async () => {
    const supabase = fakeSupabase(seed());
    provider.failures.set("extract_plan_tasks_2", new Error("Boom"));

    await expect(run(supabase.client)).rejects.toThrow(
      /Vezri saved 7 milestones and 1 of 3 groups of steps before it stopped\. Try again to finish/,
    );

    const doc = document(supabase.db);
    expect(doc.extraction_state).toBe("failed_partial");
    // The goal is not confirmable: no normalized target was ever written.
    expect(supabase.db.goals[0].normalized_goal).toBeNull();
    expect(String(doc.extraction_note)).not.toMatch(/Boom/);
  });

  it("counts attempts and stops offering a retry that has never worked", async () => {
    const supabase = fakeSupabase(seed());
    provider.failures.set("extract_plan_structure", new Error("Boom"));

    for (let attempt = 1; attempt <= 6; attempt += 1) {
      provider.failures.set("extract_plan_structure", new Error("Boom"));
      await expect(run(supabase.client)).rejects.toThrow();
      expect(document(supabase.db).extraction_attempts).toBe(attempt);
    }

    provider.calls.length = 0;
    provider.failures.clear();
    // Past the cap the model is not called at all — the point is to stop
    // spending, so a seventh attempt must not reach the provider.
    await expect(run(supabase.client)).rejects.toThrow(/upload the plan again/);
    expect(provider.calls).toEqual([]);
  });

  it("logs what each pass cost, so a runaway is visible before it is expensive", async () => {
    const supabase = fakeSupabase(seed());
    await run(supabase.client);

    const usage = document(supabase.db).extraction_usage as Record<
      string,
      { inputTokens: number; outputTokens: number }
    >;
    expect(Object.keys(usage).sort()).toEqual([
      "structure",
      "target",
      "tasks:0",
      "tasks:1",
      "tasks:2",
    ]);
    expect(usage.structure).toEqual({ inputTokens: 1000, outputTokens: 500 });
  });
});
