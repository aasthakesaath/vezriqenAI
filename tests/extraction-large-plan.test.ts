import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { z } from "zod";
import { AnthropicProvider } from "@/lib/ai/anthropic";
import { AIExtractionError, AITruncationError } from "@/lib/ai/provider";
import type { AIProvider, StructuredRequest } from "@/lib/ai/provider";
import {
  ExtractedPlanStructureSchema,
  ExtractedTaskBatchSchema,
} from "@/lib/ai/schemas";
import { extractPlanInPasses } from "@/lib/plan/build";

/**
 * Regression tests for the production failure of 2026-09-08.
 *
 * A 58 KB .docx execution plan failed with:
 *
 *   "Failed to parse structured output as JSON: Expected ',' or '}' after
 *    property value in JSON at position 25162"
 *
 * The response was not malformed. It was CUT OFF: the model hit max_tokens
 * (verified against the live API — stop_reason "max_tokens", output_tokens
 * 16000 of 16000) and the SDK's parser reported the resulting half-written
 * JSON as a syntax error. Nothing looked at stop_reason, so a known limit
 * surfaced as gibberish on a page written for humans.
 *
 * Every extraction test before this one used a document of a few lines, which
 * is exactly why 208 passing tests said nothing. These use a real one.
 */

const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "large-execution-plan.txt",
);
const LARGE_PLAN = readFileSync(FIXTURE, "utf8");

/** The exact prefix the SDK produced in production, cut mid-value. */
const TRUNCATED_JSON = `{"outcome":"Ship Atlas to general availability by 30 Octo`;

type CreateArgs = { max_tokens: number; system: string; messages: unknown[] };
type FakeReply = {
  stop_reason: string;
  text: string;
  outputTokens?: number;
};

/**
 * Drives the REAL AnthropicProvider against a stubbed transport, so these
 * assertions cover the shipped code path rather than a hand-written double.
 */
function providerWith(replies: FakeReply[] | ((args: CreateArgs) => FakeReply)) {
  const calls: CreateArgs[] = [];
  const provider = new AnthropicProvider("test-key");
  let index = 0;
  // Mirrors the SDK surface the provider actually uses: messages.stream(...)
  // returning something with finalMessage().
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (provider as any).client = {
    messages: {
      stream: (args: CreateArgs) => {
        calls.push(args);
        const reply =
          typeof replies === "function" ? replies(args) : replies[Math.min(index++, replies.length - 1)];
        return {
          finalMessage: async () => ({
            stop_reason: reply.stop_reason,
            content: [{ type: "text", text: reply.text }],
            usage: { input_tokens: 22146, output_tokens: reply.outputTokens ?? args.max_tokens },
          }),
        };
      },
    },
  };
  return { provider, calls };
}

const structureRequest = {
  action: "extract_plan_structure",
  system: "s",
  prompt: "p",
  schema: ExtractedPlanStructureSchema,
} as const;

/** Words a user must never see. Each one appeared in the production message. */
const PARSER_JARGON = [
  "JSON",
  "position",
  "property value",
  "Expected ','",
  "max_tokens",
  "stop_reason",
  "Zod",
  "undefined",
  "SyntaxError",
];

describe("the fixture is genuinely large", () => {
  it("is a realistic plan document, not a few lines of prose", () => {
    // The bug needed a big document to appear. A test that would have caught
    // it therefore needs one too — this guard stops the fixture being quietly
    // shrunk later, which is how the gap opened in the first place.
    expect(Buffer.byteLength(LARGE_PLAN, "utf8")).toBeGreaterThan(50_000);
    expect(LARGE_PLAN.split(/\s+/).length).toBeGreaterThan(8_000);
    expect(LARGE_PLAN.split("\n").length).toBeGreaterThan(500);
  });
});

describe("truncation is detected, not mistaken for malformed output", () => {
  it("throws a typed truncation error when the model runs out of budget", async () => {
    const { provider } = providerWith([{ stop_reason: "max_tokens", text: TRUNCATED_JSON }]);

    await expect(provider.generateStructured(structureRequest)).rejects.toBeInstanceOf(
      AITruncationError,
    );
  });

  it("never puts a parser error in front of the user", async () => {
    const { provider } = providerWith([{ stop_reason: "max_tokens", text: TRUNCATED_JSON }]);

    // This is the assertion that fails against the code we shipped: it threw
    // AIExtractionError carrying the SDK's own "…at position 25162" string,
    // and the route returned that verbatim as `error`.
    const error = await provider.generateStructured(structureRequest).catch((e) => e);
    expect(error).toBeInstanceOf(AIExtractionError);
    for (const jargon of PARSER_JARGON) {
      expect(error.message).not.toContain(jargon);
    }
    expect(error.message).toBe("That plan is larger than Vezri can read in one pass.");
  });

  it("records what actually happened for the server log", async () => {
    const { provider } = providerWith([
      { stop_reason: "max_tokens", text: TRUNCATED_JSON, outputTokens: 16000 },
    ]);
    const error = (await provider
      .generateStructured(structureRequest)
      .catch((e) => e)) as AITruncationError;

    expect(error.detail.action).toBe("extract_plan_structure");
    expect(error.detail.outputTokens).toBe(16000);
    expect(error.detail.maxTokens).toBeGreaterThan(0);
  });

  it("escalates the budget once before giving up", async () => {
    const { provider, calls } = providerWith([{ stop_reason: "max_tokens", text: TRUNCATED_JSON }]);
    await provider.generateStructured(structureRequest).catch(() => {});

    expect(calls).toHaveLength(2);
    expect(calls[1].max_tokens).toBeGreaterThan(calls[0].max_tokens);
  });

  it("recovers when the retry fits", async () => {
    const complete = JSON.stringify({
      outcome: "Ship Atlas to GA",
      target_date: "2026-10-30",
      success_measures: [],
      constraints: [],
      risks: [],
      evidence_required: [],
      milestones: [],
      clarifying_questions: [],
      reasoning: "Read the programme plan.",
    });
    const { provider, calls } = providerWith([
      { stop_reason: "max_tokens", text: TRUNCATED_JSON },
      { stop_reason: "end_turn", text: complete },
    ]);

    const result = await provider.generateStructured(structureRequest);
    expect(result.data.outcome).toBe("Ship Atlas to GA");
    expect(calls).toHaveLength(2);
  });

  it("does not escalate a budget the caller set deliberately", async () => {
    const { provider, calls } = providerWith([{ stop_reason: "max_tokens", text: TRUNCATED_JSON }]);
    await provider
      .generateStructured({ ...structureRequest, maxTokens: 4000 })
      .catch(() => {});

    expect(calls).toHaveLength(1);
    expect(calls[0].max_tokens).toBe(4000);
  });
});

describe("no failure mode leaks machine text to the user", () => {
  const cases: Array<[string, FakeReply]> = [
    ["truncated", { stop_reason: "max_tokens", text: TRUNCATED_JSON }],
    ["malformed", { stop_reason: "end_turn", text: "{not json at all" }],
    ["empty", { stop_reason: "end_turn", text: "   " }],
    ["schema violation", { stop_reason: "end_turn", text: `{"outcome":123}` }],
  ];

  for (const [name, reply] of cases) {
    it(`${name} output produces a plain-language message`, async () => {
      const { provider } = providerWith([reply]);
      const error = await provider.generateStructured(structureRequest).catch((e) => e);

      expect(error).toBeInstanceOf(AIExtractionError);
      for (const jargon of PARSER_JARGON) {
        expect(error.message).not.toContain(jargon);
      }
      // A sentence, not a dump.
      expect(error.message.length).toBeLessThan(200);
      expect(error.message).toMatch(/^[A-Z].*[.!]$/s);
    });
  }

  it("keeps the technical detail on the error's cause, where logs can reach it", async () => {
    const { provider } = providerWith([{ stop_reason: "end_turn", text: "{not json at all" }]);
    const error = (await provider
      .generateStructured(structureRequest)
      .catch((e) => e)) as AIExtractionError;

    expect(error.cause).toBeInstanceOf(Error);
    expect(String((error.cause as Error).message)).toMatch(/JSON/i);
  });
});

/* -------------------------------------------------------------------------
 * The cause, not the symptom: one call must never be asked to emit a whole
 * large plan in the first place.
 * ---------------------------------------------------------------------- */

type Recorded = { action: string; schema: unknown; prompt: string };

/** Identity check across the generic boundary, where `===` cannot be typed. */
const isTaskBatch = (schema: unknown) => schema === (ExtractedTaskBatchSchema as unknown);

function recordingProvider(taskCountPerBatch = 6): { provider: AIProvider; seen: Recorded[] } {
  const seen: Recorded[] = [];
  const provider: AIProvider = {
    name: "fake",
    modelVersion: "test",
    async generateStructured<T extends z.ZodTypeAny>(request: StructuredRequest<T>) {
      seen.push({ action: request.action, schema: request.schema, prompt: request.prompt });
      const data =
        isTaskBatch(request.schema)
          ? {
              tasks: Array.from({ length: taskCountPerBatch }, (_, i) => ({
                title: `${request.action} task ${i}`,
                rationale: null,
                milestone_title: null,
                task_type: "simple_action",
                estimated_minutes: 30,
                deadline: null,
                deadline_is_hard: false,
                recurrence_rule: null,
                external_party_name: null,
                depends_on_titles: [],
                provenance: { origin: "inferred", confidence: 0.5, excerpt: null, page_or_section: null },
              })),
            }
          : {
              outcome: "Ship Atlas to general availability",
              target_date: "2026-10-30",
              success_measures: [],
              constraints: [],
              risks: [],
              evidence_required: [],
              milestones: Array.from({ length: 23 }, (_, i) => ({
                title: `Milestone ${i + 1}`,
                target_date: null,
                weight: 3,
                already_complete: false,
                provenance: { origin: "inferred", confidence: 0.5, excerpt: null, page_or_section: null },
              })),
              clarifying_questions: [],
              reasoning: "Read the programme plan.",
            };
      return {
        data: data as z.infer<T>,
        modelVersion: "test",
        usage: { inputTokens: 1, outputTokens: 1 },
      };
    },
  };
  return { provider, seen };
}

describe("a large plan is extracted in bounded passes", () => {
  it("asks for structure first, with a schema that cannot contain tasks", async () => {
    const { provider, seen } = recordingProvider();
    await extractPlanInPasses({
      provider,
      documentText: LARGE_PLAN,
      userGoalText: null,
      today: "2026-02-03",
    });

    expect(seen[0].action).toBe("extract_plan_structure");
    expect(seen[0].schema).toBe(ExtractedPlanStructureSchema);
    expect(Object.keys(ExtractedPlanStructureSchema.shape)).not.toContain("tasks");
  });

  it("splits tasks across several calls instead of demanding them all at once", async () => {
    const { provider, seen } = recordingProvider();
    const result = await extractPlanInPasses({
      provider,
      documentText: LARGE_PLAN,
      userGoalText: null,
      today: "2026-02-03",
    });

    const taskCalls = seen.filter((c) => c.schema === ExtractedTaskBatchSchema);
    // 23 milestones at 3 per pass.
    expect(taskCalls).toHaveLength(8);
    expect(result.passes).toBe(9);
    expect(result.plan.tasks.length).toBeGreaterThan(0);

    // Every milestone is covered exactly once — no gaps, no duplicated work.
    const mentioned = taskCalls.flatMap((c) =>
      Array.from({ length: 23 }, (_, i) => `Milestone ${i + 1}`).filter((t) =>
        c.prompt.includes(`- ${t}\n`) || c.prompt.endsWith(`- ${t}`),
      ),
    );
    expect(new Set(mentioned).size).toBe(23);
    expect(mentioned).toHaveLength(23);
  });

  it("keeps each task pass inside the batch schema's ceiling", () => {
    // The ceiling is the whole point: it is what makes a pass fit. Asserted by
    // behaviour rather than by reading a zod internal, so it stays true across
    // library versions.
    const task = {
      title: "t",
      rationale: null,
      milestone_title: null,
      task_type: "simple_action",
      estimated_minutes: 30,
      deadline: null,
      deadline_is_hard: false,
      recurrence_rule: null,
      external_party_name: null,
      depends_on_titles: [],
      provenance: { origin: "inferred", confidence: 0.5, excerpt: null, page_or_section: null },
    };
    const batchOf = (n: number) =>
      ExtractedTaskBatchSchema.safeParse({ tasks: Array.from({ length: n }, () => task) }).success;

    expect(batchOf(30)).toBe(true);
    expect(batchOf(31)).toBe(false);
  });

  it("survives one batch that will not fit, without losing the rest of the plan", async () => {
    const { provider } = recordingProvider();
    const original = provider.generateStructured.bind(provider);
    let taskCall = 0;
    provider.generateStructured = (async (request: StructuredRequest<z.ZodTypeAny>) => {
      if (isTaskBatch(request.schema)) {
        taskCall += 1;
        // Every other task call truncates, including after the split-and-retry,
        // so the recovery path is exercised rather than sidestepped.
        if (taskCall % 2 === 0) {
          throw new AITruncationError("That plan is larger than Vezri can read in one pass.", {
            action: request.action,
            maxTokens: 16000,
            outputTokens: 16000,
          });
        }
      }
      return original(request);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

    const result = await extractPlanInPasses({
      provider,
      documentText: LARGE_PLAN,
      userGoalText: null,
      today: "2026-02-03",
    });

    // A gap in one milestone's tasks beats failing the whole extraction.
    expect(result.plan.tasks.length).toBeGreaterThan(0);
    expect(result.plan.milestones).toHaveLength(23);
  });

  it("still runs a single task pass for a plan with no milestones", async () => {
    const seen: Recorded[] = [];
    const provider: AIProvider = {
      name: "fake",
      modelVersion: "test",
      async generateStructured<T extends z.ZodTypeAny>(request: StructuredRequest<T>) {
        seen.push({ action: request.action, schema: request.schema, prompt: request.prompt });
        const data =
          isTaskBatch(request.schema)
            ? { tasks: [] }
            : {
                outcome: "A goal with no milestones",
                target_date: null,
                success_measures: [],
                constraints: [],
                risks: [],
                evidence_required: [],
                milestones: [],
                clarifying_questions: [],
                reasoning: "No milestones stated.",
              };
        return { data: data as z.infer<T>, modelVersion: "test", usage: { inputTokens: 1, outputTokens: 1 } };
      },
    };

    const result = await extractPlanInPasses({
      provider,
      documentText: "A short note about a goal.",
      userGoalText: null,
      today: "2026-02-03",
    });

    expect(seen.filter((c) => c.schema === ExtractedTaskBatchSchema)).toHaveLength(1);
    expect(result.passes).toBe(2);
  });
});
