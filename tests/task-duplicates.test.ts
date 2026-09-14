import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { z } from "zod";
import type { AIProvider, StructuredRequest } from "@/lib/ai/provider";
import { fakeSupabase, type Tables } from "./helpers/fake-supabase";
import {
  isSameTaskTitle,
  taskTitleKey,
  withoutDuplicateTitles,
} from "@/lib/plan/task-title";

/**
 * One task, one row.
 *
 * The same piece of work reached the model in two passes — named in its
 * milestone's own section and again in the plan's summary — and both copies
 * were inserted. /today rendered one task twice under one goal with two
 * different rationales under it, which is not a cosmetic problem: a person
 * looking at two near-identical rows cannot tell whether they are two things
 * or one, and ticking either leaves the other on the list.
 *
 * The fix is in two halves and both are asserted here, because either alone
 * comes apart. The database refuses a duplicate (migration 0012); the
 * extraction upserts so being refused costs one row rather than a whole
 * paid-for pass.
 */

const MIGRATION = readFileSync(
  join(process.cwd(), "supabase", "migrations", "0012_task_title_dedupe.sql"),
  "utf8",
);

/* ---------------------------------------------------------------------------
 * What counts as the same title.
 * ------------------------------------------------------------------------- */
describe("the title key", () => {
  it("ignores case, punctuation and whitespace", () => {
    const forms = [
      "Draft the outreach email",
      "draft the outreach email.",
      "Draft the outreach  email",
      "  DRAFT THE OUTREACH EMAIL!  ",
      "Draft the outreach — email",
    ];
    for (const form of forms) {
      expect(taskTitleKey(form), form).toBe("draft the outreach email");
    }
  });

  /**
   * The line this must not cross. A normaliser that merged two different
   * sentences would be Vezri deciding the plan was wrong, and the row it
   * deleted would be work nobody ever sees again.
   */
  it("never merges two different sentences", () => {
    expect(isSameTaskTitle("Email Priya", "Send Priya an email")).toBe(false);
    expect(isSameTaskTitle("Draft chapter 1", "Draft chapter 2")).toBe(false);
    expect(isSameTaskTitle("Review the budget", "Approve the budget")).toBe(false);
  });

  it("keeps letters outside ASCII rather than stripping them", () => {
    // `[[:alnum:]]` in a UTF-8 Postgres matches these, so \\p{L}\\p{N} must too
    // — otherwise "Répondre à Léa" and "Repondre a Lea" would collide here and
    // not in the database, or the other way round.
    expect(taskTitleKey("Répondre à Léa")).toBe("répondre à léa");
    expect(isSameTaskTitle("Répondre à Léa", "Repondre a Lea")).toBe(false);
  });

  /**
   * Null, not "". A title with no alphanumeric content has no key, NULLs do
   * not collide in a Postgres unique index, and two unreadable titles are not
   * evidence of a duplicate — refusing the second would lose a row.
   */
  it("has no key for a title with nothing in it", () => {
    for (const empty of ["", "   ", "???", "--", null, undefined]) {
      expect(taskTitleKey(empty), JSON.stringify(empty)).toBeNull();
    }
    expect(isSameTaskTitle("???", "!!!")).toBe(false);
  });
});

describe("dropping duplicates before they are written", () => {
  const titleOf = (item: { title: string }) => item.title;

  it("keeps the first of a repeated title, which is what 0012 keeps too", () => {
    const kept = withoutDuplicateTitles(
      [{ title: "Book the room" }, { title: "book the room." }, { title: "Send the agenda" }],
      titleOf,
    );
    expect(kept.map(titleOf)).toEqual(["Book the room", "Send the agenda"]);
  });

  it("drops one the goal already holds", () => {
    const kept = withoutDuplicateTitles([{ title: "Book the room" }], titleOf, [
      "  BOOK THE ROOM  ",
    ]);
    expect(kept).toEqual([]);
  });

  it("writes an unkeyable title rather than dropping it", () => {
    const kept = withoutDuplicateTitles([{ title: "???" }, { title: "???" }], titleOf);
    expect(kept).toHaveLength(2);
  });
});

/* ---------------------------------------------------------------------------
 * The database half.
 *
 * Asserted against the migration rather than a live connection — CI has no
 * database, and the same approach tests/rls-schema.test.ts takes for §23.
 * ------------------------------------------------------------------------- */
describe("migration 0012", () => {
  it("declares the normaliser IMMUTABLE, which a generated column requires", () => {
    expect(MIGRATION).toContain("create or replace function public.normalized_task_title(title text)");
    expect(MIGRATION).toMatch(/language sql\s+immutable/);
  });

  it("normalises the same way the TypeScript does", () => {
    // Case-folded, non-alphanumerics collapsed to a space, trimmed, and empty
    // becomes null. If this expression changes, task-title.ts changes with it.
    expect(MIGRATION).toContain(
      "nullif(btrim(regexp_replace(lower($1), '[^[:alnum:]]+', ' ', 'g')), '')",
    );
  });

  it("cleans up before it constrains, or the index could not be built", () => {
    expect(MIGRATION.indexOf("delete from public.tasks t")).toBeLessThan(
      MIGRATION.indexOf("create unique index"),
    );
  });

  it("keeps the OLDEST row in each group", () => {
    expect(MIGRATION).toMatch(/partition by goal_id, public\.normalized_task_title\(title\)/);
    // created_at first, id only as the tiebreaker, so the choice is
    // deterministic when two rows landed in the same millisecond.
    expect(MIGRATION).toMatch(/order by created_at, id/);
  });

  /**
   * The two things a delete must not destroy. Both are the user's, not
   * extraction's: a completion they recorded, and the history of what they
   * reported. Everything else on a surplus row is scheduling and cascades.
   */
  it("carries a completion onto the kept row rather than untelling it", () => {
    expect(MIGRATION).toContain("where t.status = 'done'");
    expect(MIGRATION).toMatch(/update public\.tasks k\s+set status\s+= 'done'/);
  });

  it("re-points the history instead of cascading it away", () => {
    expect(MIGRATION).toMatch(/update public\.check_ins c\s+set task_id = d\.keeper_id/);
    expect(MIGRATION).toMatch(/update public\.execution_blocks b\s+set task_id = d\.keeper_id/);
  });

  it("makes it impossible to happen again", () => {
    expect(MIGRATION).toContain("generated always as (public.normalized_task_title(title)) stored");
    expect(MIGRATION).toContain(
      "create unique index if not exists tasks_goal_title_key_unique\n  on public.tasks (goal_id, title_key)",
    );
  });

  it("reports the count before and after, so the clean-up is auditable", () => {
    expect(MIGRATION).toContain("duplicate task rows before");
    expect(MIGRATION).toContain("duplicate task rows after");
  });
});

/* ---------------------------------------------------------------------------
 * The extraction half.
 *
 * Run against the in-memory PostgREST stand-in, whose upsert models the
 * unique index — so a duplicate is refused here for the same reason it is
 * refused in Postgres, rather than because this test says so.
 * ------------------------------------------------------------------------- */

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
      }) as AIProvider["generateStructured"],
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

const task = (title: string, rationale: string | null, dependsOn: string[] = []) => ({
  title,
  rationale,
  milestone_title: null,
  task_type: "deep_work",
  estimated_minutes: 60,
  deadline: "2026-10-01",
  deadline_is_hard: false,
  recurrence_rule: null,
  external_party_name: null,
  depends_on_titles: dependsOn,
  provenance,
});

/**
 * One milestone, so there is exactly one task pass — and that pass returns the
 * SAME piece of work three times over, which is the shape the model actually
 * produced: identical titles, different rationales.
 */
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
    return {
      tasks: [
        task("Draft the outreach email", "Named under the milestone."),
        task("Draft the outreach email.", "Named again in the plan summary."),
        task("draft the  OUTREACH email", "And once more in the appendix."),
        // A different task that DEPENDS on the duplicated one, so the
        // dependency wiring can be checked against a row that was skipped.
        task("Send the outreach email", null, ["Draft the outreach email"]),
      ],
    };
  }
  return {
    user_wording: "Ship Atlas",
    normalized_goal: "Ship Atlas by 1 December 2026",
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
    plan_documents: [
      {
        id: "doc-1",
        goal_id: "goal-1",
        filename: "plan.txt",
        mime_type: "text/plain",
        storage_path: null,
        extracted_text: "Draft the outreach email.",
      },
    ],
    milestones: [],
    tasks: [],
    task_dependencies: [],
    plan_source_anchors: [],
    ai_action_logs: [],
  };
}

beforeEach(() => {
  provider.calls.length = 0;
});

describe("extraction writes one row for one task", () => {
  it("stores the first copy and skips the rest", async () => {
    const supabase = fakeSupabase(seed());
    await buildPlanForGoal({
      supabase: supabase.client,
      userId: "user-1",
      goalId: "goal-1",
      today: "2026-09-08",
    });

    const titles = supabase.db.tasks.map((row) => row.title);
    expect(titles).toEqual(["Draft the outreach email", "Send the outreach email"]);
  });

  /**
   * The reason this is an upsert with ignoreDuplicates and not a plain insert.
   * Against the unique index a plain insert fails the WHOLE statement on one
   * repeat, which would turn a cosmetic duplicate into a lost task pass —
   * every other task in the batch gone, and paid for.
   */
  it("does not lose the rest of the batch to the duplicate", async () => {
    const supabase = fakeSupabase(seed());
    const result = await buildPlanForGoal({
      supabase: supabase.client,
      userId: "user-1",
      goalId: "goal-1",
      today: "2026-09-08",
    });

    // Complete, not partial: the duplicate cost one row, not the pass.
    expect("taskCount" in result ? result.taskCount : null).toBe(2);
    expect(supabase.db.goals[0].extraction_state).toBe("complete");
  });

  /**
   * ignoreDuplicates returns only the rows it actually inserted, so a
   * dependency pointing at a skipped title used to be dropped on the floor.
   * The ids are read back from the goal instead.
   */
  it("still wires a dependency that points at a title it skipped", async () => {
    const supabase = fakeSupabase(seed());
    await buildPlanForGoal({
      supabase: supabase.client,
      userId: "user-1",
      goalId: "goal-1",
      today: "2026-09-08",
    });

    const draft = supabase.db.tasks.find((row) => row.title === "Draft the outreach email");
    const send = supabase.db.tasks.find((row) => row.title === "Send the outreach email");
    expect(supabase.db.task_dependencies).toEqual([
      {
        id: expect.any(String),
        created_at: expect.any(String),
        user_id: "user-1",
        task_id: send!.id,
        depends_on_task_id: draft!.id,
        dependency_type: "task",
      },
    ]);
  });

  it("upserts on the conflict target the migration created", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/plan/build.ts"), "utf8");
    expect(source).toContain('onConflict: "goal_id,title_key"');
    expect(source).toContain("ignoreDuplicates: true");
    // The plain insert is gone. It is the thing that fails the whole batch.
    expect(source).not.toMatch(/from\("tasks"\)\s*\.insert\(/);
  });
});
