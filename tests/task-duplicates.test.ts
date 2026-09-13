import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { z } from "zod";
import type { AIProvider, StructuredRequest } from "@/lib/ai/provider";
import { dedupeByTitle, taskTitleKey } from "@/lib/plan/task-title-key";
import { fakeSupabase, type Tables } from "./helpers/fake-supabase";

/**
 * The same task, twice, in one goal (2026-09-13).
 *
 * A goal rendered two rows with the same title and two differently-worded
 * one-line descriptions under them. Nothing ever created a task twice on
 * purpose: a plan is read in passes, a pass that re-runs writes its tasks
 * again, and the model words the RATIONALE slightly differently the second
 * time while producing the same title. The row looked new, so it inserted.
 *
 * Two halves, and neither is sufficient alone:
 *
 *   the database  0012 normalises the title into a generated column and
 *                 puts a unique index on (goal_id, title_key), so a second
 *                 copy cannot land whatever writes it;
 *   the code      the extraction upserts with ignoreDuplicates, so a re-run
 *                 is a no-op rather than a 409 in the middle of a paid-for
 *                 pass.
 */

const MIGRATION = readFileSync(
  join(process.cwd(), "supabase/migrations/0012_task_title_uniqueness.sql"),
  "utf8",
);

/* ---------------------------------------------------------------------------
 * The key. Two implementations, one answer.
 * ------------------------------------------------------------------------ */
describe("the title key", () => {
  /**
   * Every case here is a pair the extraction actually produced across two
   * passes, plus the ones that must NOT collapse.
   */
  const SAME: Array<[string, string]> = [
    ["Email Ms Ndlovu", "email Ms  Ndlovu."],
    ["Draft the one-page summary", "Draft the one page summary!"],
    ["Update the LinkedIn headline", "UPDATE THE LINKEDIN HEADLINE"],
    ["Book the venue", "  Book the venue  "],
    ["Send Ana the draft", "Send Ana the draft…"],
    ["Review — chapter 3", "Review: chapter 3"],
  ];

  const DIFFERENT: Array<[string, string]> = [
    ["Draft chapter 1", "Draft chapter 2"],
    ["Email Ana", "Email Anna"],
    ["Book the venue", "Book the caterer"],
  ];

  it("treats case, punctuation and spacing as the same title", () => {
    for (const [a, b] of SAME) {
      expect(taskTitleKey(a), `${a} / ${b}`).toBe(taskTitleKey(b));
      expect(taskTitleKey(a)).not.toBeNull();
    }
  });

  it("does not collapse titles that are genuinely different", () => {
    for (const [a, b] of DIFFERENT) {
      expect(taskTitleKey(a), `${a} / ${b}`).not.toBe(taskTitleKey(b));
    }
  });

  it("has no key for a title made only of punctuation", () => {
    // NULLs are distinct in a unique index, so such a row is left alone rather
    // than mangled into a collision with every other unnameable row.
    for (const nothing of ["???", "!!!", "   ", "", null, undefined]) {
      expect(taskTitleKey(nothing)).toBeNull();
    }
  });

  it("is the same rule the database applies", () => {
    // The SQL is the authority — tasks.title_key is generated from it and the
    // unique index is built over it. This asserts the TypeScript mirror was
    // not changed on its own.
    expect(MIGRATION).toContain("create or replace function public.task_title_key(title text)");
    expect(MIGRATION).toContain("[^a-z0-9]+");
    expect(MIGRATION).toMatch(/lower\(coalesce\(title, ''\)\)/);
    expect(MIGRATION).toMatch(/btrim\(/);
    expect(MIGRATION).toMatch(/nullif\(/);
  });

  it("is immutable, because a generated column may not call anything else", () => {
    const body = MIGRATION.slice(
      MIGRATION.indexOf("create or replace function public.task_title_key"),
    ).slice(0, 600);
    expect(body).toContain("immutable");
    // A collation- or extension-dependent key would give a different answer in
    // a different database, which is the one thing an index key may never do.
    expect(body).not.toContain("[:alnum:]");
    expect(body).not.toContain("unaccent");
  });
});

/* ---------------------------------------------------------------------------
 * The migration: normalise, clean up, then make it impossible.
 * ------------------------------------------------------------------------ */
describe("0012 removes the duplicates and closes the door", () => {
  it("keeps the OLDEST row in each group", () => {
    // The first write is the one the rest of the plan already points at —
    // its reminders, its check-ins, its dependency edges.
    expect(MIGRATION).toContain("array_agg(id order by created_at, id))[1] as keep_id");
  });

  it("compares within a goal and never across goals or users", () => {
    expect(MIGRATION).toContain("group by goal_id, public.task_title_key(title)");
    expect(MIGRATION).toContain("k.goal_id  = t.goal_id");
  });

  it("moves the user's own history onto the surviving row rather than losing it", () => {
    // check_ins and execution_blocks cascade from tasks. A duplicate carrying
    // the one check-in the user actually made would take it with it.
    expect(MIGRATION).toMatch(/update public\.check_ins[\s\S]*?set task_id = m\.keep_id/);
    expect(MIGRATION).toMatch(/update public\.execution_blocks[\s\S]*?set task_id = m\.keep_id/);
  });

  it("deletes the edges that would become self-references BEFORE remapping", () => {
    // task_dependencies_no_self_reference would refuse the update otherwise,
    // and the migration would fail halfway.
    const deleteAt = MIGRATION.indexOf("delete from public.task_dependencies d");
    const updateAt = MIGRATION.indexOf("update public.task_dependencies d");
    expect(deleteAt).toBeGreaterThan(-1);
    expect(deleteAt).toBeLessThan(updateAt);
  });

  it("adds the generated column and the unique index, in that order, after the cleanup", () => {
    const cleanup = MIGRATION.indexOf("delete from public.tasks t");
    const column = MIGRATION.indexOf("generated always as (public.task_title_key(title)) stored");
    const index = MIGRATION.indexOf("create unique index if not exists tasks_goal_title_key_idx");

    expect(cleanup).toBeLessThan(column);
    expect(column).toBeLessThan(index);
    expect(MIGRATION).toContain("on public.tasks (goal_id, title_key)");
  });

  it("reports what it found and what it left, so the run is checkable", () => {
    expect(MIGRATION).toContain("duplicate task rows across");
    expect(MIGRATION).toContain("duplicate groups remaining (expected 0)");
  });
});

/* ---------------------------------------------------------------------------
 * The write.
 * ------------------------------------------------------------------------ */
describe("in-batch duplicates never reach the database", () => {
  it("keeps the first of two rows that normalise the same", () => {
    const kept = dedupeByTitle(
      [
        { title: "Email Ms Ndlovu" },
        { title: "email Ms  Ndlovu." },
        { title: "Draft the summary" },
      ],
      (row) => row.title,
    );
    expect(kept.map((row) => row.title)).toEqual(["Email Ms Ndlovu", "Draft the summary"]);
  });

  it("keeps every unnameable row, because none of them collide", () => {
    const kept = dedupeByTitle([{ title: "???" }, { title: "!!!" }], (row) => row.title);
    expect(kept).toHaveLength(2);
  });
});

/* ---------------------------------------------------------------------------
 * End to end: the second run of a pass must not double the plan.
 * ------------------------------------------------------------------------ */

const provider = vi.hoisted(() => ({ calls: [] as string[] }));

vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return {
    ...actual,
    getAIProvider: (): AIProvider => ({
      name: "fake",
      modelVersion: "fake-model-1",
      generateStructured: (async (request: StructuredRequest<z.ZodTypeAny>) => {
        provider.calls.push(request.action);
        return {
          data: answerFor(request.action),
          modelVersion: "fake-model-1",
          usage: { inputTokens: 10, outputTokens: 10 },
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

/** How many times this fake has been asked for tasks, so run two can differ. */
let taskPass = 0;

function answerFor(action: string): unknown {
  if (action === "extract_plan_structure") {
    return {
      outcome: "Ship Atlas",
      target_date: "2026-12-01",
      success_measures: [],
      constraints: [],
      risks: [],
      evidence_required: [],
      milestones: [
        { title: "M1", target_date: "2026-11-01", weight: 3, already_complete: false, provenance },
      ],
      clarifying_questions: [],
      reasoning: "Read from the plan.",
    };
  }
  if (action.startsWith("extract_plan_tasks_")) {
    taskPass += 1;
    // The second reading words the rationale differently and punctuates the
    // title differently, which is exactly what happened in production.
    const second = taskPass > 1;
    return {
      tasks: [
        {
          title: second ? "email Ms  Ndlovu." : "Email Ms Ndlovu",
          rationale: second
            ? "Nothing after this can start until she replies."
            : "She has to confirm before anything else moves.",
          milestone_title: null,
          task_type: "simple_action",
          estimated_minutes: 15,
          deadline: "2026-10-01",
          deadline_is_hard: false,
          recurrence_rule: null,
          external_party_name: null,
          depends_on_titles: [],
          provenance,
        },
        {
          // A straight repeat inside the SAME batch.
          title: second ? "Email Ms Ndlovu" : "Email Ms Ndlovu",
          rationale: "A second copy from the same pass.",
          milestone_title: null,
          task_type: "simple_action",
          estimated_minutes: 15,
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
    short_label: "Ship Atlas",
    target_date: "2026-12-01",
    success_measures: [],
    constraints: [],
    feasibility_note: null,
    missing_information: [],
    reasoning: "Restated.",
  };
}

function seed(): Tables {
  return {
    goals: [
      {
        id: "goal-1",
        user_id: "user-1",
        user_goal_text: "Ship Atlas",
        normalized_goal: null,
        extraction_state: "not_started",
        extraction_passes: {},
        extraction_attempts: 0,
        extraction_usage: {},
        extraction_note: null,
        extraction_started_at: null,
        extracted_structure: null,
      },
    ],
    profiles: [
      {
        id: "user-1",
        timezone: "America/Chicago",
        timezone_set_by_user: false,
        quiet_hours_start: null,
        quiet_hours_end: null,
        productive_window: "varies",
        email_reminders: true,
      },
    ],
    plan_documents: [],
    milestones: [],
    tasks: [],
    task_dependencies: [],
    plan_source_anchors: [],
    ai_action_logs: [],
  };
}

beforeEach(() => {
  provider.calls.length = 0;
  taskPass = 0;
});

describe("reading the same plan twice", () => {
  it("writes one row when a batch contains the same task twice", async () => {
    const supabase = fakeSupabase(seed());

    await buildPlanForGoal({
      supabase: supabase.client,
      userId: "user-1",
      goalId: "goal-1",
      today: "2026-09-08",
    });

    const titles = supabase.db.tasks.map((task) => task.title);
    expect(titles, `wrote: ${titles.join(" | ")}`).toEqual(["Email Ms Ndlovu"]);
  });

  /**
   * The production shape, exactly.
   *
   * A task pass RE-RUNS while the structure pass is already recorded as done —
   * which is what a resumed run does, and what every goal-only goal did for a
   * fortnight while the ledger wrote nowhere (0010). The structure branch is
   * skipped, so nothing is cleared first, and the second write lands on a
   * table that already holds the row. Before 0012 that produced the two cards.
   */
  it("writes nothing new when a re-run pass re-reads a task that is already stored", async () => {
    const seeded = seed();
    seeded.goals[0].extraction_passes = { structure: true };
    seeded.goals[0].extracted_structure = {
      outcome: "Ship Atlas",
      target_date: "2026-12-01",
      success_measures: [],
      constraints: [],
      risks: [],
      evidence_required: [],
      milestones: [
        { title: "M1", target_date: "2026-11-01", weight: 3, already_complete: false, provenance },
      ],
      clarifying_questions: [],
      reasoning: "Read from the plan.",
    };
    seeded.milestones = [{ id: "m-1", goal_id: "goal-1", user_id: "user-1", title: "M1" }];
    // What the first run wrote, in the first run's wording.
    seeded.tasks = [
      {
        id: "task-1",
        goal_id: "goal-1",
        user_id: "user-1",
        title: "Email Ms Ndlovu",
        title_key: "email ms ndlovu",
        rationale: "She has to confirm before anything else moves.",
        status: "not_started",
      },
    ];
    // The re-run is the second reading, so the fake words it differently.
    taskPass = 1;

    const supabase = fakeSupabase(seeded);
    await buildPlanForGoal({
      supabase: supabase.client,
      userId: "user-1",
      goalId: "goal-1",
      today: "2026-09-08",
    });

    const titles = supabase.db.tasks.map((task) => task.title);
    expect(titles, `wrote: ${titles.join(" | ")}`).toEqual(["Email Ms Ndlovu"]);
    // And the wording the user already has is the wording they keep.
    expect(supabase.db.tasks[0].rationale).toBe(
      "She has to confirm before anything else moves.",
    );
  });

  it("keeps the first wording rather than the newest", () => {
    // Stated as the rule the upsert implements: ignoreDuplicates keeps what is
    // there. Asserting it on the source because it is a one-word change away
    // from "last write wins", which would rewrite a task under the user.
    const build = readFileSync(join(process.cwd(), "src/lib/plan/build.ts"), "utf8");
    expect(build).toContain('.upsert(rows, { onConflict: "goal_id,title_key", ignoreDuplicates: true })');
    expect(build).not.toMatch(/\.from\("tasks"\)\s*\.insert\(rows\)/);
  });
});
