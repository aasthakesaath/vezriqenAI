import { describe, expect, it, vi } from "vitest";

/**
 * Does the extract route actually stream?
 *
 * The waiting screen's honesty depends on it. If every NDJSON line arrives at
 * once when extraction finishes, the progress text is worthless — it would say
 * "Reading your plan" for two minutes and then jump straight to done, which is
 * indistinguishable from the timer that was removed for lying.
 *
 * This proves the half that lives in our code: a line written during the run
 * is readable by the client BEFORE the run finishes. The other half — whether
 * a proxy in front of the deployment re-buffers it — is not testable here and
 * is not claimed here.
 */

const gate = vi.hoisted(() => {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { held, release: () => release() };
});

vi.mock("@/lib/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/env")>()),
  SUPABASE_CONFIGURED: true,
  AI_CONFIGURED: true,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
  }),
}));

vi.mock("@/lib/db/verify-schema", () => ({
  assertSchemaReady: async () => null,
  describeSchemaGaps: () => "",
}));

vi.mock("@/lib/plan/build", () => ({
  buildPlanForGoal: async (options: {
    onProgress?: (event: { phase: string; milestones?: number }) => void;
  }) => {
    options.onProgress?.({ phase: "reading" });
    options.onProgress?.({ phase: "structure_done", milestones: 7 });
    // Extraction is still running at this point. The two lines above must be
    // readable now, not when this resolves.
    await gate.held;
    return {
      plan: { clarifying_questions: [] },
      smart: { missing_information: [] },
      milestoneCount: 7,
      taskCount: 21,
    };
  },
}));

const { POST } = await import("@/app/api/goals/[id]/extract/route");

describe("the extract route streams", () => {
  it("delivers progress lines while extraction is still running", async () => {
    const response = await POST(new Request("http://localhost/api/goals/g1/extract"), {
      params: Promise.resolve({ id: "g1" }),
    });

    expect(response.headers.get("Content-Type")).toBe("application/x-ndjson; charset=utf-8");
    // Vercel and any intermediate proxy are told explicitly not to buffer.
    expect(response.headers.get("X-Accel-Buffering")).toBe("no");
    expect(response.headers.get("Cache-Control")).toContain("no-transform");

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    const first = await reader.read();
    const lines = decoder.decode(first.value).trim().split("\n").map((line) => JSON.parse(line));

    // Read BEFORE the build promise is allowed to resolve — this is the whole
    // assertion. A buffered response would still be waiting here.
    expect(lines[0]).toEqual({ type: "progress", phase: "reading" });

    gate.release();

    let rest = "";
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      rest += decoder.decode(chunk.value);
    }
    const events = [...lines.slice(1), ...rest.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))];
    expect(events).toContainEqual({ type: "progress", phase: "structure_done", milestones: 7 });
    expect(events.at(-1)).toMatchObject({ type: "done", milestones: 7, tasks: 21 });
  });
});
