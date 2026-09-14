import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  TASK_STATUSES,
  TERMINAL_TASK_STATUSES,
  isOutstandingTaskStatus,
  isTerminalTaskStatus,
  terminalStatusReason,
  type TaskStatus,
} from "@/lib/plan/task-status";
import { overdueTasks, type ShiftableTask } from "@/lib/plan/start-today";

/**
 * What each route does with each status, for all nine of them.
 *
 * /api/tasks/[id]/stuck answered 404 three times in production for a task
 * that existed, belonged to the caller, and was sitting in `blocked` — the
 * single most likely state for someone to press "I'm stuck" from. Two
 * separate faults produced that, and both are covered here:
 *
 *   1. The select embedded `task_dependencies`, which has TWO foreign keys to
 *      `tasks`. PostgREST refuses an ambiguous embed (PGRST201) instead of
 *      returning rows, and the route discarded the error and reported the
 *      task missing. A failed query must never read as "not found".
 *   2. Nothing had ever decided what each status MEANS to each route, so the
 *      question "is blocked accepted?" had no answer to check.
 *
 * The table below is that answer, and it is asserted per route over the whole
 * enum rather than over the statuses someone happened to think of.
 */

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://testproj.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  // The model is never reached in these cases; a route that would call it
  // answers 503, which is past every check this file is about.
  delete process.env.ANTHROPIC_API_KEY;
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [{ name: "sb-testproj-auth-token", value: "session" }],
    set: () => {},
  }),
}));

/** The row the stand-in serves, rewritten per case. */
const world = vi.hoisted(() => ({
  status: "not_started" as string,
  /** Set to make the tasks select fail the way an ambiguous embed does. */
  queryError: null as { code: string; message: string } | null,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => {
    const task = {
      id: "task-1",
      goal_id: "goal-1",
      milestone_id: null,
      title: "Ask the youth centre for a letter",
      rationale: null,
      task_type: "external_dependency",
      estimated_minutes: 20,
      priority: 3,
      status: world.status,
      deadline: "2026-08-01",
      start_by: null,
      milestones: null,
      goals: { short_label: "TIME Kid of the Year", user_goal_text: "Win it" },
    };

    const builder = (table: string) => {
      const result =
        table === "tasks"
          ? world.queryError
            ? { data: null, error: world.queryError }
            : { data: task, error: null }
          : { data: [], error: null };

      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "is", "in", "not", "order", "limit", "update", "insert", "upsert", "delete"]) {
        chain[method] = () => chain;
      }
      chain.maybeSingle = async () => result;
      chain.single = async () => result;
      chain.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve(table === "tasks" ? result : { data: [], error: null }).then(resolve);
      return chain;
    };

    return {
      from: (table: string) => builder(table),
      auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
    };
  },
}));

const TASK_ID = "4a4e5a79-4e89-43a7-bbc1-2b947f796b4b";

const post = (body?: unknown) =>
  new Request("https://www.vezriqen.com/api/route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const context = { params: Promise.resolve({ id: TASK_ID }) };

beforeEach(() => {
  world.status = "not_started";
  world.queryError = null;
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

/* ---------------------------------------------------------------------------
 * The vocabulary itself.
 * ------------------------------------------------------------------------- */
describe("which statuses mean the work is over", () => {
  it("lists exactly the enum the migration declares", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase", "migrations", "0002_plan_structure.sql"),
      "utf8",
    );
    const block = sql.slice(
      sql.indexOf("create type public.task_status"),
      sql.indexOf(");", sql.indexOf("create type public.task_status")),
    );
    const declared = [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);
    expect([...TASK_STATUSES].sort()).toEqual(declared.sort());
  });

  it("counts only done and skipped as over", () => {
    expect([...TERMINAL_TASK_STATUSES]).toEqual(["done", "skipped"]);
  });

  /** The assertion the production 404 was missing. */
  it("does not treat blocked as over", () => {
    expect(isTerminalTaskStatus("blocked")).toBe(false);
    expect(isOutstandingTaskStatus("blocked")).toBe(true);
  });

  it("treats every non-terminal status as outstanding, including the retired ones", () => {
    for (const status of TASK_STATUSES) {
      expect(isOutstandingTaskStatus(status), status).toBe(!isTerminalTaskStatus(status));
    }
    // `partial` and `snoozed` are no longer written, but a row could still
    // hold one. Refusing it would strand the row with no way to act on it.
    expect(isOutstandingTaskStatus("partial")).toBe(true);
    expect(isOutstandingTaskStatus("snoozed")).toBe(true);
  });

  /**
   * The default matters more than the list. An allow-list is what silently
   * refused `blocked`, and it would do it again for whatever is added next.
   */
  it("treats a status it has never seen as outstanding rather than refusing it", () => {
    expect(isOutstandingTaskStatus("some_future_status")).toBe(true);
  });

  it("says why, in words a person can act on", () => {
    expect(terminalStatusReason("done")).toContain("already marked done");
    expect(terminalStatusReason("skipped")).toContain("broken into smaller ones");
  });
});

/* ---------------------------------------------------------------------------
 * Per route, per status.
 * ------------------------------------------------------------------------- */
type RouteCase = {
  name: string;
  load: () => Promise<{ POST: unknown }>;
  body?: unknown;
  /** Accepted means: got past the state check. Never 404, never 409. */
  accepts: (status: TaskStatus) => boolean;
};

const ROUTES: RouteCase[] = [
  {
    name: "tasks/[id]/stuck",
    load: () => import("@/app/api/tasks/[id]/stuck/route"),
    body: { action: "analyse", reason: "felt_too_big" },
    // Everything that is still work. "I'm stuck" on a blocked task is the
    // case this whole file exists for.
    accepts: (status) => !isTerminalTaskStatus(status),
  },
  {
    name: "tasks/[id]/block",
    load: () => import("@/app/api/tasks/[id]/block/route"),
    body: { category: "no_time" },
    accepts: (status) => !isTerminalTaskStatus(status),
  },
  {
    name: "tasks/[id]/guidance",
    load: () => import("@/app/api/tasks/[id]/guidance/route"),
    // Same rule, but applied only before GENERATING: see the cached case below.
    accepts: (status) => !isTerminalTaskStatus(status),
  },
];

type Handler = (
  request: Request,
  context: { params: Promise<Record<string, string>> },
) => Promise<Response>;

for (const route of ROUTES) {
  describe(`${route.name}: every status in the enum`, () => {
    for (const status of TASK_STATUSES) {
      const accepted = route.accepts(status);

      it(`${accepted ? "accepts" : "refuses"} ${status}`, async () => {
        world.status = status;
        const handler = (await route.load()).POST as Handler;
        const response = await handler(post(route.body), context);
        const payload = (await response.json()) as { error?: string; task_status?: string };

        // Whatever happens, the task was found. A 404 here would be the
        // production bug: the row exists and is the caller's.
        expect(response.status, `${status} must not read as missing`).not.toBe(404);

        if (accepted) {
          expect(response.status, `${status} should be accepted`).not.toBe(409);
        } else {
          // A real state conflict, distinguishable from both "missing" and
          // "broken", carrying the state it refused and a reason.
          expect(response.status, `${status} should be a conflict`).toBe(409);
          expect(payload.task_status).toBe(status);
          expect(payload.error).toBe(terminalStatusReason(status));
        }
      });
    }

    it("logs the refusal with the route and the state", async () => {
      const info = vi.spyOn(console, "info").mockImplementation(() => {});
      world.status = "done";
      const handler = (await route.load()).POST as Handler;
      await handler(post(route.body), context);

      const line = info.mock.calls.map((call) => String(call[0])).join("\n");
      expect(line).toContain(route.name);
      expect(line).toContain("done");
    });

    /**
     * The fault underneath the 404. A query that FAILED is not a task that is
     * absent, and answering 404 for it sent everyone looking for a missing
     * row that was there the whole time.
     */
    it("answers a failed query with 502 and the PostgREST code, never 404", async () => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      world.queryError = {
        code: "PGRST201",
        message: "Could not embed because more than one relationship was found",
      };

      const handler = (await route.load()).POST as Handler;
      const response = await handler(post(route.body), context);

      expect(response.status).toBe(502);
      expect(response.status).not.toBe(404);
      const payload = (await response.json()) as { retryable?: boolean };
      expect(payload.retryable).toBe(true);
      expect(logged.mock.calls.map((call) => String(call[0])).join("\n")).toContain("PGRST201");
    });
  });
}

describe("tasks/[id]/guidance serves what was already generated, whatever the state", () => {
  it("only refuses a terminal task at the point of generating", async () => {
    // Reading steps that were already paid for costs nothing and a person
    // looking back at how they did something finished should not be told it
    // is gone. The 409 guards the model call, not the read.
    const source = readFileSync("src/app/api/tasks/[id]/guidance/route.ts", "utf8");
    // The CALL, not the import at the top of the file.
    const guard = source.indexOf("isTerminalTaskStatus(task.status)");
    expect(guard).toBeGreaterThan(-1);
    expect(source.indexOf('from("task_guidance")')).toBeLessThan(guard);
    expect(guard).toBeLessThan(source.indexOf("generateStructured"));
  });
});

/* ---------------------------------------------------------------------------
 * start-from-today decides by status too, in bulk rather than per task.
 * ------------------------------------------------------------------------- */
describe("tasks/start-from-today: every status in the enum", () => {
  const late = (status: string): ShiftableTask => ({
    id: `t-${status}`,
    goalId: "g1",
    title: status,
    status,
    deadline: "2026-08-01",
    startBy: null,
  });

  for (const status of TASK_STATUSES) {
    const moved = !isTerminalTaskStatus(status);

    it(`${moved ? "moves" : "leaves"} a late ${status} task`, () => {
      const picked = overdueTasks([late(status)], "2026-09-14");
      expect(picked.map((task) => task.status)).toEqual(moved ? [status] : []);
    });
  }

  /**
   * The filter that really was excluding `blocked`. It used to be
   * OPEN_TASK_STATUSES — the set that answers "does this belong on today's
   * list" — so a task the user had just told Vezri they were stuck on kept
   * its August date while everything around it moved.
   */
  it("moves work that is stuck or was not done, not only work that is untouched", () => {
    const picked = overdueTasks(
      [late("blocked"), late("not_done"), late("unconfirmed"), late("done"), late("skipped")],
      "2026-09-14",
    );
    expect(picked.map((task) => task.status).sort()).toEqual([
      "blocked",
      "not_done",
      "unconfirmed",
    ]);
  });

  it("asks the database for the same set the page asks for", () => {
    // The /today button's visibility comes from overdueTasks and the route's
    // write comes from this query. If they disagree the button appears with
    // nothing behind it, or fails to appear when there is something.
    const source = readFileSync("src/app/api/tasks/start-from-today/route.ts", "utf8");
    expect(source).toContain("TERMINAL_TASK_STATUSES");
    expect(source).not.toContain("OPEN_TASK_STATUSES");
  });
});

/* ---------------------------------------------------------------------------
 * The embed that caused it, gone everywhere.
 * ------------------------------------------------------------------------- */
describe("nothing embeds task_dependencies inside a tasks select", () => {
  it("has two foreign keys from task_dependencies to tasks, which is why", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase", "migrations", "0002_plan_structure.sql"),
      "utf8",
    );
    const block = sql.slice(sql.indexOf("create table public.task_dependencies"));
    const body = block.slice(0, block.indexOf(");"));
    const toTasks = [...body.matchAll(/references public\.tasks/g)];
    expect(toTasks.length).toBe(2);
  });

  it("embeds it nowhere", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(path);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name)) continue;
        const source = readFileSync(path, "utf8");
        // The embed form, inside a select string. A plain `.from("task_
        // dependencies")` query is the correct way and is not this.
        for (const line of source.split("\n")) {
          // Prose is allowed to name it — the comments explaining why the
          // embed is gone are the most useful thing in those files.
          const trimmed = line.trim();
          if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
          if (/task_dependencies\(/.test(line)) offenders.push(`${path}: ${trimmed.slice(0, 80)}`);
        }
      }
    };
    walk("src");
    expect(offenders).toEqual([]);
  });
});
