import { describe, expect, it } from "vitest";
import { ExtractedPlanSchema, verifyPlanProvenance, verifyProvenance } from "@/lib/ai/schemas";

/**
 * Live extraction tests.
 *
 * These call the real model and cost money, so they skip without a key — which
 * is what CI does. Run locally with ANTHROPIC_API_KEY set to check that the
 * prompt and schema still agree with the model's behaviour.
 */
const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);

const SAT_PLAN = `SAT Study Plan — Spring
Test date: 2027-03-13.
Weeks 1-4: complete Khan Academy diagnostic and review algebra fundamentals.
Weeks 5-8: two full practice tests, one every other Saturday.
I need a recommendation letter from Ms. Alvarez for the summer program; the
application is due 2027-02-01.
Target: score at least 1400.`;

describe.skipIf(!hasKey)("live extraction against the model", () => {
  it("extracts an outcome, milestones and tasks that satisfy the schema", async () => {
    const { AnthropicProvider } = await import("@/lib/ai/anthropic");
    const { EXTRACTION_SYSTEM, extractionPrompt } = await import("@/lib/ai/prompts");

    const provider = new AnthropicProvider(process.env.ANTHROPIC_API_KEY!);
    const result = await provider.generateStructured({
      action: "extract_plan",
      system: EXTRACTION_SYSTEM,
      prompt: extractionPrompt({
        documentText: SAT_PLAN,
        userGoalText: null,
        today: "2026-09-08",
      }),
      schema: ExtractedPlanSchema,
      effort: "medium",
    });

    const plan = result.data;
    expect(ExtractedPlanSchema.safeParse(plan).success).toBe(true);
    expect(plan.outcome.length).toBeGreaterThan(0);
    expect(plan.milestones.length).toBeGreaterThan(0);
    expect(plan.tasks.length).toBeGreaterThan(0);

    // The stated test date must be picked up, not invented.
    expect(plan.target_date).toBe("2027-03-13");

    // PRD §25.B — a recommendation letter is an external-person dependency.
    const external = plan.tasks.filter(
      (t) => t.task_type === "external_dependency" || t.external_party_name,
    );
    expect(external.length).toBeGreaterThan(0);

    // Every explicit claim must survive quote verification against the source.
    const verified = verifyPlanProvenance(plan, SAT_PLAN);
    const stillExplicit = verified.tasks.filter((t) => t.provenance.origin === "explicit");
    for (const task of stillExplicit) {
      expect(task.provenance.excerpt).toBeTruthy();
    }
  }, 180_000);

  it("returns a null date rather than inventing one", async () => {
    const { AnthropicProvider } = await import("@/lib/ai/anthropic");
    const { EXTRACTION_SYSTEM, extractionPrompt } = await import("@/lib/ai/prompts");

    const provider = new AnthropicProvider(process.env.ANTHROPIC_API_KEY!);
    const result = await provider.generateStructured({
      action: "extract_plan",
      system: EXTRACTION_SYSTEM,
      prompt: extractionPrompt({
        documentText: "I want to get fitter. Run three times a week and stretch after.",
        userGoalText: null,
        today: "2026-09-08",
      }),
      schema: ExtractedPlanSchema,
      effort: "low",
    });

    // PRD §20: "Never invent a deadline from an uploaded document."
    expect(result.data.target_date).toBeNull();
    for (const task of result.data.tasks) {
      if (task.provenance.origin === "explicit") {
        expect(task.deadline, `${task.title} claims an explicit deadline`).toBeNull();
      }
    }
  }, 180_000);
});

/** These run everywhere — no key needed. */
describe("provenance verification (PRD §7)", () => {
  const source = "Weeks 5-8: two full practice tests, one every other Saturday.";

  it("keeps an explicit claim whose quote really is in the document", () => {
    const result = verifyProvenance(
      { origin: "explicit", confidence: 0.9, excerpt: "two full practice tests", page_or_section: null },
      source,
    );
    expect(result.origin).toBe("explicit");
    expect(result.confidence).toBe(0.9);
  });

  it("tolerates reflowed whitespace and smart quotes", () => {
    const result = verifyProvenance(
      {
        origin: "explicit",
        confidence: 0.8,
        excerpt: "two   full\npractice tests",
        page_or_section: null,
      },
      source,
    );
    expect(result.origin).toBe("explicit");
  });

  // The failure this is here to prevent: the model asserting the document said
  // something it did not.
  it("demotes a fabricated quote to inferred and caps its confidence", () => {
    const result = verifyProvenance(
      {
        origin: "explicit",
        confidence: 0.95,
        excerpt: "the exam is on 1 December",
        page_or_section: null,
      },
      source,
    );
    expect(result.origin).toBe("inferred");
    expect(result.confidence).toBeLessThanOrEqual(0.5);
  });

  it("demotes an explicit claim that carries no quote at all", () => {
    const result = verifyProvenance(
      { origin: "explicit", confidence: 1, excerpt: null, page_or_section: null },
      source,
    );
    expect(result.origin).toBe("inferred");
  });

  it("demotes every explicit claim when there is no source text (image plans)", () => {
    const result = verifyProvenance(
      { origin: "explicit", confidence: 1, excerpt: "anything", page_or_section: null },
      null,
    );
    expect(result.origin).toBe("inferred");
  });

  it("leaves inferred items untouched", () => {
    const result = verifyProvenance(
      { origin: "inferred", confidence: 0.4, excerpt: null, page_or_section: null },
      source,
    );
    expect(result).toEqual({
      origin: "inferred",
      confidence: 0.4,
      excerpt: null,
      page_or_section: null,
    });
  });
});

/**
 * The 2026-09-08 production case, end to end against the real model.
 *
 * A single call on this document returns stop_reason "max_tokens" — that was
 * measured, not assumed. This asserts the multi-pass path gets a whole plan out
 * of it anyway.
 */
describe.skipIf(!hasKey)("live extraction of a large plan", () => {
  it("reads a 58 KB execution plan without truncating", { timeout: 900_000 }, async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const { AnthropicProvider } = await import("@/lib/ai/anthropic");
    const { extractPlanInPasses } = await import("@/lib/plan/build");

    const documentText = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "fixtures", "large-execution-plan.txt"),
      "utf8",
    );
    expect(Buffer.byteLength(documentText, "utf8")).toBeGreaterThan(50_000);

    const result = await extractPlanInPasses({
      provider: new AnthropicProvider(process.env.ANTHROPIC_API_KEY!),
      documentText,
      userGoalText: "Ship Atlas to GA by 30 October 2026",
      today: "2026-02-03",
    });

    expect(ExtractedPlanSchema.safeParse(result.plan).success).toBe(true);
    expect(result.plan.milestones.length).toBeGreaterThan(3);
    expect(result.plan.tasks.length).toBeGreaterThan(5);
    expect(result.passes).toBeGreaterThan(1);

    // The plan's own goal, not a hallucinated one.
    expect(result.plan.outcome.toLowerCase()).toContain("atlas");
  });
});
