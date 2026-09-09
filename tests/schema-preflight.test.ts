import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The preflight is the only thing standing between a missing migration and two
 * minutes of billed work per attempt. On 2026-09-09 it was not standing.
 *
 * Goal b5f4bc82 ran twice against a database missing seven columns — roughly
 * 114,000 tokens across the two runs — logging a failure on every ledger write
 * and calling the model anyway, both runs killed at the 300-second ceiling with
 * nothing recorded. /api/health/schema reported ok, 182 columns checked, at the
 * same time.
 *
 * The cause: the probe used `{ head: true }`. A HEAD response carries no body,
 * so when PostgREST rejected the column list postgrest-js read an empty body,
 * failed to parse it, and returned `{ message: "" }` — and the caller's
 * `if (!error) continue` treated the empty string as success. Every missing
 * column read as a healthy table.
 *
 * These tests assert the guarantee itself: no model call happens when the
 * schema is behind. Asserting the status alone would have passed throughout.
 */

const ai = vi.hoisted(() => ({ generateStructured: vi.fn(), getProvider: vi.fn() }));

vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return {
    ...actual,
    getAIProvider: () => {
      ai.getProvider();
      return {
        name: "fake",
        modelVersion: "fake-1",
        generateStructured: ai.generateStructured,
      };
    },
  };
});

vi.mock("@/lib/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/env")>()),
  SUPABASE_CONFIGURED: true,
  AI_CONFIGURED: true,
}));

const supabaseMock = vi.hoisted(() => ({ client: null as unknown as SupabaseClient }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => supabaseMock.client }));

const { verifySchema, resetSchemaCache } = await import("@/lib/db/verify-schema");
const { POST } = await import("@/app/api/goals/[id]/extract/route");

/**
 * A client whose column probes fail exactly the way production's did: HTTP 400
 * with an EMPTY message, because a HEAD response has no body to read.
 */
function clientRejecting(options: { message: string }): SupabaseClient {
  const builder = () => {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "order", "limit", "update", "insert", "maybeSingle", "single"]) {
      chain[method] = () => chain;
    }
    chain.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve(resolve({ data: null, error: { message: options.message } }));
    return chain;
  };
  return {
    from: builder,
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
  } as unknown as SupabaseClient;
}

beforeEach(() => {
  resetSchemaCache();
  ai.generateStructured.mockClear();
  ai.getProvider.mockClear();
});

describe("the schema preflight", () => {
  it("reports a gap even when the error carries no message at all", async () => {
    // The exact production shape. An error with nothing to say is still an
    // error, and this is the assertion the old `if (!error)` could not make.
    const report = await verifySchema(clientRejecting({ message: "" }));

    expect(report.ok).toBe(false);
    expect(report.gaps.length + report.unreachable.length).toBeGreaterThan(0);
  });

  it("reports a gap for a named missing column", async () => {
    const report = await verifySchema(
      clientRejecting({
        message: "Could not find the 'extraction_passes' column of 'goals' in the schema cache",
      }),
    );

    expect(report.ok).toBe(false);
    expect(report.gaps.length).toBeGreaterThan(0);
  });

  it("does not call the model when the database is behind the code", async () => {
    supabaseMock.client = clientRejecting({ message: "" });

    const response = await POST(new Request("http://localhost/api/goals/g1/extract"), {
      params: Promise.resolve({ id: "g1" }),
    });

    expect(response.status).toBe(503);
    // THE POINT. The status was never the problem — the spend was.
    expect(ai.getProvider).not.toHaveBeenCalled();
    expect(ai.generateStructured).not.toHaveBeenCalled();
  });

  it("says which migration is missing rather than a bare failure", async () => {
    supabaseMock.client = clientRejecting({
      message: "Could not find the 'extraction_passes' column of 'goals' in the schema cache",
    });

    const response = await POST(new Request("http://localhost/api/goals/g1/extract"), {
      params: Promise.resolve({ id: "g1" }),
    });
    const payload = (await response.json()) as { error: string; detail?: string };

    expect(payload.error).toMatch(/database is behind its code/i);
    expect(payload.detail ?? "").toMatch(/goals/);
  });

  it("never probes with a HEAD request, which cannot carry an error body", () => {
    // Comments stripped: the file explains the bug at length, and the
    // explanation must not be mistaken for the bug.
    const code = readFileSync("src/lib/db/verify-schema.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/head:\s*true/);
  });
});
