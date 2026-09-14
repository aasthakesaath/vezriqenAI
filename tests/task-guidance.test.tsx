import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import {
  GUIDANCE_SYSTEM,
  GuidanceSchema,
  MAX_STEPS,
  MAX_STEP_MINUTES,
  MIN_STEPS,
  parseStoredGuidance,
  tidyGuidance,
  tidyStep,
} from "@/lib/coach/guidance";
import {
  MAX_FIRST_ACTION_MINUTES,
  UNBLOCK_SYSTEM,
  UnblockSchema,
  interventionForReason,
  isBlockCategory,
  parseStoredUnblock,
} from "@/lib/coach/unblock";
import { JSON_ONLY, PLAIN_VOICE, instructionSystem } from "@/lib/ai/voice";
import { BLOCK_CATEGORIES, INTERVENTIONS_FOR } from "@/lib/coach/interventions";
import StuckPanel from "@/components/coach/StuckPanel";
import { isRetryableFailure } from "@/lib/ai/failure-copy";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

/** Prompts are hard-wrapped for reading; assertions are about the words. */
const unwrapped = (prompt: string) => prompt.replace(/\s+/g, " ");

const html = (node: React.ReactElement) => renderToStaticMarkup(node);
const text = (markup: string) =>
  markup
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;|&apos;|&rsquo;/g, "'")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

/* ---------------------------------------------------------------------------
 * One voice, defined once.
 * ------------------------------------------------------------------------- */
describe("the shared voice for the two instruction routes", () => {
  it("is composed into both, rather than written twice", () => {
    for (const system of [GUIDANCE_SYSTEM, UNBLOCK_SYSTEM]) {
      expect(system).toContain(PLAIN_VOICE);
      expect(system).toContain(JSON_ONLY);
    }
  });

  it("lives in one file, and the routes do not roll their own", () => {
    for (const file of ["src/lib/coach/guidance.ts", "src/lib/coach/unblock.ts"]) {
      expect(readFileSync(file, "utf8")).toContain('from "@/lib/ai/voice"');
    }
  });

  it("states each rule the owner asked for", () => {
    const voice = PLAIN_VOICE.toLowerCase();
    expect(voice).toContain("plain words");
    expect(voice).toContain("second person");
    expect(voice).toContain("no coaching-speak");
    expect(voice).toContain("no motivational filler");
    expect(voice).toContain("never mention how late");
    expect(voice).toContain("never state a fact about this person that you were not given");
  });

  it("names a real menu path as the standard for a known product", () => {
    // "Update your LinkedIn headline" is not a step. The menu path is.
    expect(PLAIN_VOICE).toContain("LinkedIn");
    expect(PLAIN_VOICE).toContain("exact menu path");
  });

  it("asks for JSON and nothing around it", () => {
    expect(JSON_ONLY).toContain("return JSON only");
    expect(JSON_ONLY).toContain("no markdown fence");
  });

  it("keeps the clinical boundary §13 sets", () => {
    expect(unwrapped(instructionSystem("Do a thing."))).toContain("not a clinician");
  });
});

/* ---------------------------------------------------------------------------
 * Problem 3 — the steps.
 * ------------------------------------------------------------------------- */
describe("the how-to steps", () => {
  const step = (over: Partial<{ action: string; minutes: number; where: string | null }> = {}) => ({
    action: "Open the draft",
    minutes: 5,
    where: null,
    ...over,
  });

  it("wants between three and five of them", () => {
    expect(MIN_STEPS).toBe(3);
    expect(MAX_STEPS).toBe(5);
    expect(GuidanceSchema.safeParse({ steps: [step(), step()] }).success).toBe(false);
    expect(GuidanceSchema.safeParse({ steps: Array(6).fill(step()) }).success).toBe(false);
    expect(GuidanceSchema.safeParse({ steps: Array(4).fill(step()) }).success).toBe(true);
  });

  /**
   * The constraint that carries the product decision, so it is in the SCHEMA
   * and not only in the prompt. A model asked for a ten-minute step can return
   * a two-hour one; a schema cannot.
   */
  it("refuses a step that takes longer than ten minutes", () => {
    expect(MAX_STEP_MINUTES).toBe(10);
    const eleven = Array(3).fill(step({ minutes: 11 }));
    expect(GuidanceSchema.safeParse({ steps: eleven }).success).toBe(false);
  });

  it("asks for the exact menu path where one exists, and null where it does not", () => {
    expect(GUIDANCE_SYSTEM).toContain("exact menu path");
    expect(GuidanceSchema.safeParse({ steps: Array(3).fill(step({ where: null })) }).success).toBe(
      true,
    );
    expect(
      GuidanceSchema.safeParse({
        steps: Array(3).fill(step({ where: "LinkedIn: Me > View Profile > the pencil" })),
      }).success,
    ).toBe(true);
  });

  it("tells the model a confidently wrong path costs more than no path", () => {
    expect(unwrapped(GUIDANCE_SYSTEM)).toContain(
      "A confidently wrong menu path costs more than no path.",
    );
  });
});

describe("putting a drifting step back in the imperative", () => {
  /**
   * A repair, not a rejection. The schema guarantees the shape; it cannot
   * guarantee grammar, and throwing a usable response away to show a retry
   * button costs the reader ten seconds and us another call.
   */
  it("strips the run-ups a model reaches for", () => {
    expect(tidyStep("You should open the draft")).toBe("Open the draft");
    expect(tidyStep("First, open the draft")).toBe("Open the draft");
    expect(tidyStep("Step 2: open the draft")).toBe("Open the draft");
    expect(tidyStep("The first step is to open the draft")).toBe("Open the draft");
    expect(tidyStep("1. Open the draft")).toBe("Open the draft");
  });

  it("turns the common gerund back into a verb", () => {
    expect(tidyStep("Writing the first paragraph")).toBe("Write the first paragraph");
    expect(tidyStep("Opening the draft")).toBe("Open the draft");
  });

  it("leaves a step that was already right exactly as it is", () => {
    for (const good of [
      "Open the draft and read the first paragraph",
      "Send Priya the one-line update",
      "Choose the three names you already know",
    ]) {
      expect(tidyStep(good), good).toBe(good);
    }
  });

  it("never rewrites its way to an empty step", () => {
    expect(tidyStep("You should")).not.toBe("");
    expect(tidyStep("   Next,   ")).not.toBe("");
  });

  it("tidies whole responses and trims an empty menu path to null", () => {
    const tidied = tidyGuidance({
      steps: [
        { action: "You should open the draft", minutes: 3, where: "   " },
        { action: "Writing the summary", minutes: 8, where: " Gmail: Compose " },
        { action: "Send it", minutes: 1, where: null },
      ],
    });
    expect(tidied.steps.map((s) => s.action)).toEqual([
      "Open the draft",
      "Write the summary",
      "Send it",
    ]);
    expect(tidied.steps[0]!.where).toBeNull();
    expect(tidied.steps[1]!.where).toBe("Gmail: Compose");
  });
});

describe("reading a cached row back", () => {
  it("regenerates rather than rendering a shape that no longer parses", () => {
    expect(parseStoredGuidance([{ action: "Open it", minutes: 3, where: null }])).toBeNull();
    expect(parseStoredGuidance(null)).toBeNull();
    expect(parseStoredGuidance("nonsense")).toBeNull();
    expect(
      parseStoredGuidance(Array(3).fill({ action: "Open it", minutes: 3, where: null })),
    ).not.toBeNull();
  });
});

/* ---------------------------------------------------------------------------
 * Problem 4 — "I'm stuck" ends in something changing.
 * ------------------------------------------------------------------------- */
describe("what comes back from I'm stuck", () => {
  const answer = {
    obstacle: "You do not know which of the four sections the letter has to cover.",
    first_action: { text: "Open the brief and copy its four headings", minutes: 3, where: null },
    breakdown: [
      { title: "Draft the two sections you already know", minutes: 25 },
      { title: "Ask Priya for the missing figures", minutes: 10 },
    ],
  };

  it("is exactly three things: an obstacle, one action, and the pieces", () => {
    expect(UnblockSchema.safeParse(answer).success).toBe(true);
    expect(Object.keys(UnblockSchema.shape).sort()).toEqual([
      "breakdown",
      "first_action",
      "obstacle",
    ]);
  });

  it("holds the first action to five minutes", () => {
    expect(MAX_FIRST_ACTION_MINUTES).toBe(5);
    expect(
      UnblockSchema.safeParse({
        ...answer,
        first_action: { ...answer.first_action, minutes: 6 },
      }).success,
    ).toBe(false);
  });

  it("takes two or three pieces, never one and never a list", () => {
    const piece = { title: "Do the thing", minutes: 10 };
    expect(UnblockSchema.safeParse({ ...answer, breakdown: [piece] }).success).toBe(false);
    expect(UnblockSchema.safeParse({ ...answer, breakdown: Array(4).fill(piece) }).success).toBe(
      false,
    );
    expect(UnblockSchema.safeParse({ ...answer, breakdown: Array(3).fill(piece) }).success).toBe(
      true,
    );
  });

  it("asks for ONE action rather than a choice of them", () => {
    // Someone who could pick from three options was not stuck.
    expect(unwrapped(UNBLOCK_SYSTEM)).toContain("One action, never a choice of them.");
  });

  it("re-parses the stored recommendation before writing rows from it", () => {
    // "Break it into N pieces" writes tasks from this jsonb. Casting it would
    // be how a null title reaches a NOT NULL column.
    expect(parseStoredUnblock(answer)).not.toBeNull();
    expect(parseStoredUnblock({ ...answer, breakdown: [] })).toBeNull();
    expect(parseStoredUnblock(undefined)).toBeNull();
  });
});

describe("the block row this flow records", () => {
  it("only ever picks an intervention the barrier allows", () => {
    // The map that stops the coach reaching for "reschedule" on every
    // avoidance block. This flow is bound by it too.
    for (const category of BLOCK_CATEGORIES) {
      expect(INTERVENTIONS_FOR[category]).toContain(interventionForReason(category));
    }
  });

  it("shrinks the first step wherever that is allowed", () => {
    expect(interventionForReason("felt_too_big")).toBe("shrink_first_step");
    expect(interventionForReason("kept_avoiding")).toBe("shrink_first_step");
  });

  it("does not pretend shrinking answers forgetting", () => {
    // Nothing about having forgotten is solved by a smaller first step, and
    // INTERVENTIONS_FOR.forgot says so.
    expect(interventionForReason("forgot")).not.toBe("shrink_first_step");
  });

  it("narrows an unknown barrier off the wire", () => {
    expect(isBlockCategory("felt_too_big")).toBe(true);
    expect(isBlockCategory("gave_up")).toBe(false);
    expect(isBlockCategory(null)).toBe(false);
  });
});

describe("the panel offers three routes and every one of them writes", () => {
  const markup = html(<StuckPanel taskId="t1" taskTitle="Write the letter" onDone={() => {}} />);

  it("starts by asking the one question §13 asks", () => {
    expect(text(markup)).toContain("What got in the way?");
    // The eight quick choices, plus the optional free-text line.
    expect(markup.match(/<button/g)).toHaveLength(BLOCK_CATEGORIES.length);
    expect(text(markup)).toContain("Anything else?");
  });

  /**
   * The assertion this whole problem is about. Before, the panel collected a
   * barrier and a line of text and closed with nothing behind it. Each of the
   * three routes out now names an action the route handles, and the route
   * writes a row for each.
   */
  it("wires each button to an action the route implements", () => {
    const panel = readFileSync("src/components/coach/StuckPanel.tsx", "utf8");
    const route = readFileSync("src/app/api/tasks/[id]/stuck/route.ts", "utf8");

    for (const action of ["analyse", "commit", "split", "tomorrow"]) {
      expect(panel, `the panel never sends ${action}`).toContain(`action: "${action}"`);
      expect(route, `the route never accepts ${action}`).toContain(`z.literal("${action}")`);
    }
  });

  it("closes no path without a change to a row", () => {
    const route = readFileSync("src/app/api/tasks/[id]/stuck/route.ts", "utf8");
    // commit: the task comes off `blocked` and onto `in_progress`.
    expect(route).toContain('status: "in_progress"');
    // split: pieces inserted, parent marked and stood down.
    expect(route).toContain("split_from_task_id: task.id");
    expect(route).toContain("split_at: new Date().toISOString()");
    expect(route).toContain('status: "skipped"');
    // tomorrow: the task's own date moves.
    expect(route).toContain("update[movedField] = tomorrow");
  });

  it("never deletes the parent or ticks it off", () => {
    const route = readFileSync("src/app/api/tasks/[id]/stuck/route.ts", "utf8");
    expect(route).not.toMatch(/from\("tasks"\)\s*\.delete\(/);
    expect(route).not.toContain('status: "done"');
  });

  it("refuses a second tap on a block that was already answered", () => {
    // Two taps on "Break it into 3 pieces" must not write six tasks.
    const route = readFileSync("src/app/api/tasks/[id]/stuck/route.ts", "utf8");
    expect(route).toContain("already_answered");
    expect(route).toContain("You've already answered this one.");
  });
});

/* ---------------------------------------------------------------------------
 * The constraints that hold for both routes.
 * ------------------------------------------------------------------------- */
describe("model calls stay on the server", () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path, out);
      else if (/\.tsx?$/.test(entry)) out.push(path);
    }
    return out;
  }

  const clientFiles = walk("src").filter((file) =>
    readFileSync(file, "utf8").startsWith('"use client"'),
  );

  it("keeps the key and the provider out of every client component", () => {
    for (const file of [...clientFiles, "src/lib/coach/guidance.ts", "src/lib/coach/unblock.ts"]) {
      const source = readFileSync(file, "utf8");
      expect(source, `${file} must not name the key`).not.toContain("ANTHROPIC_API_KEY");
    }
    for (const file of clientFiles) {
      expect(readFileSync(file, "utf8"), file).not.toContain("@/lib/ai");
    }
  });

  it("caches the steps with the service role, never with the caller's session", () => {
    const route = readFileSync("src/app/api/tasks/[id]/guidance/route.ts", "utf8");
    // Read through the caller's client, so RLS is the ownership check…
    expect(route.indexOf('from("tasks")')).toBeLessThan(route.indexOf("createAdminClient()"));
    // …and written through the admin client, because task_guidance has no
    // insert policy at all (migration 0013).
    expect(route).toContain("createAdminClient");
    expect(route).toContain('admin.from("task_guidance").upsert');
  });

  it("generates the steps once", () => {
    const route = readFileSync("src/app/api/tasks/[id]/guidance/route.ts", "utf8");
    const cacheRead = route.indexOf('from("task_guidance")');
    const modelCall = route.indexOf("generateStructured");
    expect(cacheRead).toBeGreaterThan(-1);
    expect(cacheRead).toBeLessThan(modelCall);
  });
});

describe("a bad response is a retry, never a crash", () => {
  it("derives retryability from the kind rather than assuming it", () => {
    for (const file of [
      "src/app/api/tasks/[id]/guidance/route.ts",
      "src/app/api/tasks/[id]/stuck/route.ts",
    ]) {
      const route = readFileSync(file, "utf8");
      expect(route, file).toContain("AIExtractionError");
      // It used to be a hard-coded `retryable: true`, which offered a button
      // for failures a retry cannot clear — a billing problem among them.
      expect(route, file).toContain("isRetryableFailure(error.kind)");
      expect(route, file).toContain("aiFailureStatus(error.kind)");
      // Still never an unhandled throw: that is a 500 page, and the panel it
      // came from goes with it.
      expect(route, file).not.toMatch(/^\s*throw error;\s*$/m);
    }
  });

  it("still offers a retry for the failure that is worth retrying", () => {
    // A model that answered with something unusable is the case the inline
    // retry was built for, and it keeps it.
    expect(isRetryableFailure("unusable_output")).toBe(true);
    // A billing failure is not, and no longer pretends to be.
    expect(isRetryableFailure("billing")).toBe(false);
  });

  it("shows the retry inline, in the panel that failed", () => {
    for (const file of [
      "src/components/coach/TaskGuidance.tsx",
      "src/components/coach/StuckPanel.tsx",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toContain('role="alert"');
      expect(source, file).toContain("Try again");
    }
  });

  it("does not offer a retry for a failure a retry cannot fix", () => {
    // A missing key is not a blip. Inviting another attempt is a lie about
    // what will happen.
    const route = readFileSync("src/app/api/tasks/[id]/guidance/route.ts", "utf8");
    expect(route).toContain("retryable: false");
    expect(readFileSync("src/components/coach/TaskGuidance.tsx", "utf8")).toContain(
      "retryable && (",
    );
  });
});
