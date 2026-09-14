import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * A signed-in request reaches the handler; an anonymous one gets 401.
 *
 * Written after three new routes answered "Please sign in first." in
 * production to a browser whose session was working — /today was
 * server-rendering that user's real tasks, and four seconds before the 401,
 * POST /api/tasks/<id>/checkin had returned 200 on the same cookies and the
 * same deployment.
 *
 * The routes turned out to be character-for-character identical to the ones
 * that worked, which is the least useful thing a diff can tell you and took a
 * file-by-file comparison to establish. So two things are asserted here and
 * neither is about any one route:
 *
 *   1. every authenticated route goes through the SAME helper, so "do they
 *      differ?" is answerable by reading one file;
 *   2. each one, executed, reads the request's cookies and behaves the same
 *      way with and without a session.
 *
 * The second is a real execution of the exported POST, not a source scan:
 * next/headers and @supabase/ssr are stood in for, and the stand-in fails the
 * test if a handler ever builds a client that does not consult the cookie jar.
 */

/* ---------------------------------------------------------------------------
 * The cookie jar next/headers hands a route handler.
 * ------------------------------------------------------------------------- */
const jar = vi.hoisted(() => {
  let cookies: Array<{ name: string; value: string }> = [];
  return {
    /** How many times a Supabase client asked for the request's cookies. */
    reads: 0,
    signIn() {
      // The shape @supabase/ssr writes: one chunked auth token per project.
      cookies = [{ name: "sb-testproj-auth-token", value: "base64-session" }];
    },
    signOut() {
      cookies = [];
    },
    getAll() {
      jar.reads += 1;
      return [...cookies];
    },
    set() {
      /* A route handler may write refreshed cookies; nothing here reads them. */
    },
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => jar.getAll(), set: () => jar.set() }),
}));

/**
 * Set before anything imports @/lib/env, which reads process.env once at module
 * load. Mocking the module's exported constants does not work: the functions
 * inside it close over the originals, so requireSupabaseBrowserConfig would
 * still throw. vi.hoisted runs ahead of the imports, which is what makes this
 * the real env module under test rather than a stand-in for it.
 */
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://testproj.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  // Off on purpose: a route that would call the model answers 503 instead,
  // which is still past the auth gate and is what these cases are about.
  delete process.env.ANTHROPIC_API_KEY;
});

/**
 * Stands in for @supabase/ssr.
 *
 * The important line is the first one in createServerClient: it calls the
 * caller's own `cookies.getAll()`. A route that built a client unable to see
 * request cookies — the failure this test exists for — would leave `jar.reads`
 * at zero and be reported as such.
 */
vi.mock("@supabase/ssr", async () => {
  const { fakeSupabase } = await import("./helpers/fake-supabase");

  return {
    createServerClient: (
      _url: string,
      _key: string,
      options: { cookies: { getAll: () => Array<{ name: string; value: string }> } },
    ) => {
      const present = options.cookies.getAll();
      const signedIn = present.some((cookie) => cookie.name.includes("auth-token"));

      // Empty tables: every handler that gets past auth then fails to find the
      // task and answers 404, which is exactly the proof wanted — it ran.
      const fake = fakeSupabase({
        tasks: [],
        goals: [],
        profiles: [],
        execution_blocks: [],
        check_ins: [],
        reminders: [],
        ai_action_logs: [],
        task_guidance: [],
      });

      return {
        ...fake.client,
        auth: {
          getUser: async () =>
            signedIn
              ? { data: { user: { id: "user-1", email: "a@b.invalid" } }, error: null }
              : {
                  data: { user: null },
                  error: Object.assign(new Error("Auth session missing!"), {
                    name: "AuthSessionMissingError",
                    status: 400,
                  }),
                },
        },
      };
    },
  };
});

/* ---------------------------------------------------------------------------
 * Every route that takes a session, and how to call it.
 * ------------------------------------------------------------------------- */
const TASK_ID = "f0de44a5-1ee0-47ac-99ec-fd263df7e7f7";

/**
 * Next gives a route handler (request, { params }); a route with no dynamic
 * segment declares neither. One signature here, and the handler that ignores
 * its arguments carries on ignoring them.
 */
type Handler = (
  request: Request,
  context: { params: Promise<Record<string, string>> },
) => Promise<Response>;

type Case = {
  path: string;
  load: () => Promise<{ POST: unknown }>;
  body?: unknown;
  params?: Record<string, string>;
};

const CASES: Case[] = [
  {
    path: "tasks/[id]/stuck",
    load: () => import("@/app/api/tasks/[id]/stuck/route"),
    body: { action: "analyse", reason: "felt_too_big" },
    params: { id: TASK_ID },
  },
  {
    path: "tasks/[id]/guidance",
    load: () => import("@/app/api/tasks/[id]/guidance/route"),
    params: { id: TASK_ID },
  },
  {
    path: "tasks/start-from-today",
    load: () => import("@/app/api/tasks/start-from-today/route"),
  },
  // The controls. These already worked in production; if the harness reported
  // them broken it would be the harness that was wrong, not the routes.
  {
    path: "tasks/[id]/checkin",
    load: () => import("@/app/api/tasks/[id]/checkin/route"),
    body: { state: "done" },
    params: { id: TASK_ID },
  },
  {
    path: "tasks/[id]/block",
    load: () => import("@/app/api/tasks/[id]/block/route"),
    body: { category: "no_time" },
    params: { id: TASK_ID },
  },
];

function request(body: unknown): Request {
  return new Request("https://www.vezriqen.com/api/route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const context = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) });

/** The exported POST, at the one signature this file calls handlers with. */
async function handlerFor(testCase: Case): Promise<Handler> {
  return (await testCase.load()).POST as Handler;
}

beforeEach(() => {
  jar.reads = 0;
  jar.signOut();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("an anonymous request is refused", () => {
  for (const testCase of CASES) {
    it(`401s ${testCase.path}`, async () => {
      jar.signOut();
      const post = await handlerFor(testCase);
      const response = await post(request(testCase.body), context(testCase.params));

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "Please sign in first." });
    });
  }
});

describe("a signed-in request reaches the handler", () => {
  for (const testCase of CASES) {
    it(`lets ${testCase.path} through`, async () => {
      jar.signIn();
      const post = await handlerFor(testCase);
      const response = await post(request(testCase.body), context(testCase.params));

      // Past the gate. What it answers next depends on the route — 404 for a
      // task that is not in the fake database, 200 for the one that reports
      // there is nothing to move — but it is never the sign-in refusal.
      expect(response.status).not.toBe(401);
      const payload = (await response.json()) as { error?: string };
      expect(payload.error).not.toBe("Please sign in first.");
    });

    it(`builds ${testCase.path}'s client from the request's cookies`, async () => {
      // The failure this whole file was written for: a client that cannot see
      // the cookies authenticates nobody, however correct it looks.
      jar.signIn();
      const post = await handlerFor(testCase);
      await post(request(testCase.body), context(testCase.params));
      expect(jar.reads).toBeGreaterThan(0);
    });
  }
});

describe("the refusal is logged with its cause", () => {
  it("names the route and the auth error rather than discarding it", async () => {
    // Four causes shared one message and none of them reached a log, which is
    // why a production 401 on a working session could not be diagnosed.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    jar.signOut();

    const post = await handlerFor(CASES[0]!);
    await post(request({ action: "analyse", reason: "felt_too_big" }), context({ id: TASK_ID }));


    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0]![0]);
    expect(line).toContain("[auth] tasks/[id]/stuck");
    expect(line).toContain("AuthSessionMissingError");
    expect(line).toContain("Auth session missing!");
  });
});

/* ---------------------------------------------------------------------------
 * One pattern, structurally.
 * ------------------------------------------------------------------------- */
describe("no route hand-rolls its own session check", () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path, out);
      else if (entry === "route.ts") out.push(path);
    }
    return out;
  }

  const routes = walk(join(process.cwd(), "src", "app", "api"));
  const read = (file: string) => readFileSync(file, "utf8");
  const rel = (file: string) => relative(process.cwd(), file).replace(/\\/g, "/");

  /**
   * Routes that legitimately do their own thing, and why. Each is a different
   * kind of caller, not a different way of doing the same thing.
   */
  const EXEMPT: Record<string, string> = {
    "src/app/api/auth/google/start/route.ts": "starts sign-in; there is no session yet",
    "src/app/api/auth/google/callback/route.ts": "completes sign-in; creates the session",
    "src/app/api/auth/signout/route.ts": "clears cookies; safe without a session",
    "src/app/api/feedback/route.ts": "public feedback form (PRD §30.8)",
    "src/app/api/reminders/redeem/route.ts": "the signed token is the credential, not a cookie",
    "src/app/api/cron/reminders/route.ts": "scheduled job, guarded by CRON_SECRET",
    "src/app/api/health/schema/route.ts": "structure only, never a row",
    // These predate the helper and still carry their own copy. They are on
    // this list so the count is visible rather than silently growing: moving
    // one onto requireUser is a two-line change and deleting its line here.
    "src/app/api/account/route.ts": "not yet migrated",
    "src/app/api/plans/route.ts": "not yet migrated",
    "src/app/api/plans/[id]/route.ts": "not yet migrated",
    "src/app/api/profile/route.ts": "not yet migrated",
    "src/app/api/calendar/start/route.ts": "not yet migrated",
    "src/app/api/calendar/callback/route.ts": "not yet migrated",
    "src/app/api/calendar/disconnect/route.ts": "not yet migrated",
    "src/app/api/goals/[id]/route.ts": "not yet migrated",
    "src/app/api/goals/[id]/activate/route.ts": "not yet migrated",
    "src/app/api/goals/[id]/audit/route.ts": "not yet migrated",
    "src/app/api/goals/[id]/extract/route.ts": "not yet migrated",
    "src/app/api/goals/[id]/reshape/route.ts": "not yet migrated",
    "src/app/api/milestones/[id]/route.ts": "not yet migrated",
  };

  it("finds the API routes", () => {
    expect(routes.length).toBeGreaterThan(8);
  });

  it("keeps every task and block route on the shared helper", () => {
    for (const file of routes) {
      const key = rel(file);
      if (key in EXEMPT) continue;
      const source = read(file);
      expect(source, `${key} should call requireUser`).toContain("requireUser(");
      // The copy this replaced. Re-introducing it is how the two paths that
      // had to be compared by hand came to exist.
      expect(source, `${key} should not re-implement the 401`).not.toContain(
        'NextResponse.json({ error: "Please sign in first." }, { status: 401 })',
      );
    }
  });

  it("writes the sign-in message in exactly one place", () => {
    const authors = routes.filter((file) => read(file).includes('"Please sign in first."'));
    expect(authors.map(rel).filter((key) => !(key in EXEMPT))).toEqual([]);
  });

  it("names itself in every call, so a log line says which route refused", () => {
    for (const file of routes) {
      const source = read(file);
      for (const [, name] of source.matchAll(/requireUser\("([^"]*)"\)/g)) {
        expect(name.length, `${rel(file)} passes an empty route name`).toBeGreaterThan(0);
      }
    }
  });
});
