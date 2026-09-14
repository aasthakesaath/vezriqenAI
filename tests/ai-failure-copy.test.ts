import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  aiFailureMessage,
  aiFailureStatus,
  isRetryableFailure,
  type AISurface,
} from "@/lib/ai/failure-copy";
import {
  AIExtractionError,
  AIServiceError,
  AITruncationError,
  type AIFailureKind,
} from "@/lib/ai/provider";

/**
 * A failure says what actually went wrong, on the screen it went wrong on.
 *
 * A 502 from a billing failure on /api/tasks/[id]/stuck rendered:
 *
 *   "Vezri couldn't work with that plan. Try a clearer version, or paste the
 *    plan text."
 *
 * Wrong surface and wrong advice. There is no plan on the "I'm stuck" panel,
 * the user had typed nothing that could be made clearer, and no edit fixes an
 * unpaid balance. The cause was that the PROVIDER wrote the sentence: the copy
 * was authored when extraction was the only caller, and every surface added
 * afterwards inherited messages about documents.
 */

const SURFACES: AISurface[] = ["extraction", "unblock", "guidance"];

/** Every kind the provider can report. */
const KINDS: AIFailureKind[] = [
  "not_configured",
  "unauthorised",
  "billing",
  "not_found",
  "rate_limited",
  "overloaded",
  "timed_out",
  "unavailable",
  "too_large",
  "bad_request",
  "unusable_output",
  "truncated",
];

/** Kinds where nothing the user has entered is implicated. */
const OUR_FAULT: AIFailureKind[] = [
  "not_configured",
  "unauthorised",
  "billing",
  "not_found",
  "rate_limited",
  "overloaded",
  "unavailable",
];

describe("every kind has something to say on every surface", () => {
  for (const surface of SURFACES) {
    for (const kind of KINDS) {
      it(`${surface} / ${kind}`, () => {
        const message = aiFailureMessage(surface, kind);
        expect(message.length).toBeGreaterThan(10);
        // The generic backstop means a kind was added without a decision.
        expect(message).not.toBe("Vezri couldn't finish that just now. Try again in a moment.");
      });
    }
  }
});

describe("a failure on our side never blames the input", () => {
  /**
   * The assertion the bug report is. Any of these reaching a user with
   * "try a clearer version" is the same defect in a new place.
   */
  it("says nothing about editing, rewriting or re-pasting anything", () => {
    const blaming = /clearer|rewrite|re-?paste|paste the|try a different|shorter|simplify|your (?:plan|input|wording)/i;
    for (const surface of SURFACES) {
      for (const kind of OUR_FAULT) {
        expect(aiFailureMessage(surface, kind), `${surface}/${kind}`).not.toMatch(blaming);
      }
    }
  });

  it("mentions no plan or document on a surface that has neither", () => {
    for (const surface of ["unblock", "guidance"] as AISurface[]) {
      for (const kind of KINDS) {
        expect(aiFailureMessage(surface, kind), `${surface}/${kind}`).not.toMatch(
          /\bplan\b|\bdocument\b/i,
        );
      }
    }
  });

  it("is worded identically on every surface, because the screen is irrelevant", () => {
    for (const kind of OUR_FAULT) {
      const said = SURFACES.map((surface) => aiFailureMessage(surface, kind));
      expect(new Set(said).size, `${kind} should read the same everywhere`).toBe(1);
    }
  });
});

describe("a billing or quota failure", () => {
  const message = aiFailureMessage("unblock", "billing");

  it("says the service is unavailable right now", () => {
    expect(message).toContain("unavailable right now");
  });

  it("says whose problem it is", () => {
    expect(message).toMatch(/on our side/i);
  });

  it("says plainly that nothing the user changes will fix it", () => {
    expect(message).toMatch(/nothing you.*caused it/i);
    expect(message).toMatch(/nothing you change will fix it/i);
  });

  it("is the exact sentence that used to appear, and no longer does", () => {
    const gone = "Vezri couldn't work with that plan. Try a clearer version, or paste the plan text.";
    for (const surface of SURFACES) {
      if (surface === "extraction") continue; // where that sentence is correct
      for (const kind of KINDS) {
        expect(aiFailureMessage(surface, kind)).not.toBe(gone);
      }
    }
    // And it is never what a billing failure says, on any surface at all.
    for (const surface of SURFACES) {
      expect(aiFailureMessage(surface, "billing")).not.toBe(gone);
    }
  });

  /** Extraction keeps its document wording — for the case that is about one. */
  it("leaves the extraction copy in place for a genuinely bad document", () => {
    expect(aiFailureMessage("extraction", "bad_request")).toBe(
      "Vezri couldn't work with that plan. Try a clearer version, or paste the plan text.",
    );
  });
});

describe("a retry is only offered when it could work", () => {
  it("offers none for a failure a retry cannot clear", () => {
    for (const kind of ["billing", "unauthorised", "not_configured", "not_found"] as AIFailureKind[]) {
      expect(isRetryableFailure(kind), kind).toBe(false);
    }
  });

  it("offers none when the same input would just be sent again", () => {
    expect(isRetryableFailure("bad_request")).toBe(false);
    expect(isRetryableFailure("too_large")).toBe(false);
  });

  it("offers one when waiting is genuinely the answer", () => {
    for (const kind of ["rate_limited", "overloaded", "timed_out", "unavailable"] as AIFailureKind[]) {
      expect(isRetryableFailure(kind), kind).toBe(true);
    }
  });

  it("offers one when the model simply returned something unusable", () => {
    expect(isRetryableFailure("unusable_output")).toBe(true);
    expect(isRetryableFailure("truncated")).toBe(true);
  });
});

describe("the status a route answers with", () => {
  it("never reads as the caller's fault when it is ours", () => {
    for (const kind of OUR_FAULT) {
      expect(aiFailureStatus(kind), kind).toBe(503);
    }
  });

  it("is 422 for something genuinely wrong with what was sent", () => {
    expect(aiFailureStatus("bad_request")).toBe(422);
    expect(aiFailureStatus("too_large")).toBe(422);
  });

  it("is 502 for a model that answered with something unusable", () => {
    expect(aiFailureStatus("unusable_output")).toBe(502);
    expect(aiFailureStatus("truncated")).toBe(502);
  });
});

/* ---------------------------------------------------------------------------
 * Classification: the kind has to be right, or the copy does not matter.
 * ------------------------------------------------------------------------- */

const provider = vi.hoisted(() => ({ nextError: null as unknown }));

vi.mock("@anthropic-ai/sdk", () => {
  class FakeAnthropic {
    messages = {
      stream: () => ({
        finalMessage: async () => {
          throw provider.nextError;
        },
      }),
    };
  }
  return { default: FakeAnthropic };
});

vi.mock("@anthropic-ai/sdk/helpers/zod", () => ({ zodOutputFormat: () => ({}) }));

vi.hoisted(() => {
  process.env.ANTHROPIC_API_KEY = "test-key";
});

const { createAnthropicProvider } = await import("@/lib/ai/anthropic");
const { z } = await import("zod");

async function kindOf(error: unknown): Promise<AIFailureKind> {
  provider.nextError = error;
  try {
    await createAnthropicProvider().generateStructured({
      action: "test",
      system: "s",
      prompt: "p",
      schema: z.object({ ok: z.boolean() }),
      maxTokens: 100,
    });
  } catch (thrown) {
    if (thrown instanceof AIServiceError) return thrown.kind;
    throw thrown;
  }
  throw new Error("expected a failure");
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("classifying what came back", () => {
  /**
   * The canonical billing failure: HTTP 402, type billing_error. The API
   * reference documents `.type` as the way to classify, which is why it is
   * read before the status.
   */
  it("reads 402 billing_error as billing", async () => {
    expect(await kindOf({ status: 402, type: "billing_error", message: "Billing" })).toBe("billing");
  });

  /**
   * The shape that produced the bug report. A credit-balance problem can
   * arrive as a 400 invalid_request_error, which the old classifier filed as
   * bad_request — the branch whose copy says "try a clearer version".
   */
  it("reads a credit-balance 400 as billing, not as a bad request", async () => {
    const kind = await kindOf({
      status: 400,
      type: "invalid_request_error",
      message: "Your credit balance is too low to access the Anthropic API.",
    });
    expect(kind).toBe("billing");
    expect(aiFailureMessage("unblock", kind)).toMatch(/on our side/i);
  });

  it("still reads a genuinely invalid request as a bad request", async () => {
    expect(
      await kindOf({
        status: 400,
        type: "invalid_request_error",
        message: "messages: roles must alternate",
      }),
    ).toBe("bad_request");
  });

  it("separates the codes the API documents", async () => {
    const cases: Array<[Record<string, unknown>, AIFailureKind]> = [
      [{ status: 401, type: "authentication_error" }, "unauthorised"],
      [{ status: 403, type: "permission_error" }, "unauthorised"],
      [{ status: 404, type: "not_found_error" }, "not_found"],
      [{ status: 413, type: "request_too_large" }, "too_large"],
      [{ status: 429, type: "rate_limit_error" }, "rate_limited"],
      [{ status: 529, type: "overloaded_error" }, "overloaded"],
      [{ status: 500, type: "api_error" }, "unavailable"],
    ];
    for (const [error, expected] of cases) {
      expect(await kindOf({ ...error, message: "x" }), JSON.stringify(error)).toBe(expected);
    }
  });

  it("falls back to the status when nothing typed came back", async () => {
    expect(await kindOf({ status: 402, message: "payment" })).toBe("billing");
    expect(await kindOf({ status: 529, message: "overloaded" })).toBe("overloaded");
    expect(await kindOf({ status: 503, message: "down" })).toBe("unavailable");
  });

  it("recognises a timeout that never got a status at all", async () => {
    expect(await kindOf({ name: "APIConnectionTimeoutError", message: "timed out" })).toBe(
      "timed_out",
    );
  });

  it("does not mistake a rate limit for a billing problem", async () => {
    // "quota" language lives near both; only the 400 branch sniffs the message.
    expect(await kindOf({ status: 429, type: "rate_limit_error", message: "quota" })).toBe(
      "rate_limited",
    );
  });
});

describe("every AI failure carries a kind", () => {
  it("defaults a schema failure to unusable output", () => {
    expect(new AIExtractionError("bad json").kind).toBe("unusable_output");
  });

  it("marks a truncation as truncated", () => {
    const error = new AITruncationError("too big", {
      action: "a",
      maxTokens: 1,
      outputTokens: 1,
    });
    expect(error.kind).toBe("truncated");
  });

  it("is what the routes read, rather than a message the provider wrote", () => {
    for (const file of [
      "src/app/api/tasks/[id]/stuck/route.ts",
      "src/app/api/tasks/[id]/guidance/route.ts",
      "src/app/api/goals/[id]/extract/route.ts",
    ]) {
      const source = readFileSync(file, "utf8");

      // The property, rather than the absence of a string: the copy is chosen
      // from the KIND and the surface, which is what stops one screen's words
      // reaching another.
      expect(source, `${file} should choose copy by kind`).toMatch(
        /aiFailureMessage\("[a-z]+", error\.kind\)/,
      );

      // And no route AUTHORS the sentence from the bug report. Comments are
      // exempt: the ones recording what went wrong are worth keeping.
      const code = source
        .split("\n")
        .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
        .join("\n");
      expect(code, `${file} still writes extraction copy`).not.toContain("Try a clearer version");
    }
  });

  it("keeps the provider's own fallback copy surface-neutral", () => {
    // Nothing in anthropic.ts may name a plan or a document: it cannot know
    // which screen is asking, so it must not guess.
    const source = readFileSync("src/lib/ai/anthropic.ts", "utf8");

    // Every sentence the provider itself authors, not just the table: it
    // cannot know which screen is asking, so none of them may name a plan or
    // a document. Comments are exempt — the ones explaining why are the point.
    const authored = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
      .filter((line) => /"Vezri|"That |"Couldn/.test(line))
      .join("\n");
    expect(authored.length, "expected to find the provider's own copy").toBeGreaterThan(0);
    expect(authored).not.toMatch(/\bplan\b|\bdocument\b/i);
  });
});
