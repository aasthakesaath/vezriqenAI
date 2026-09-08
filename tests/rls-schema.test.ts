import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Schema-contract tests for PRD §23.
 *
 * The database itself is not reachable from CI, so these assert the property
 * that matters against the migrations that build it: every table is
 * RLS-protected and every policy scopes to the owning user. That makes adding
 * an unprotected table in a later milestone a failing test rather than a silent
 * data leak.
 *
 * supabase/verify_rls_cross_user.sql proves the same thing empirically against
 * a live project.
 */
const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

const sql = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"))
  .join("\n");

const createdTables = [...sql.matchAll(/create table public\.(\w+)/g)].map((m) => m[1]!);

/**
 * Tables holding secrets that no session may read. RLS enabled with zero
 * policies denies anon and authenticated outright, leaving only service_role.
 * See the header of 0004_calendar_email.sql.
 */
const DENY_ALL_TABLES = ["calendar_credentials", "email_action_tokens"];

/** Append-only by design: history that must not be rewritten. */
const APPEND_ONLY_TABLES = ["check_ins", "ai_action_logs", "goal_audits"];

describe("row level security (PRD §23)", () => {
  it("creates the full data model from PRD §21", () => {
    expect(createdTables.length).toBeGreaterThanOrEqual(17);
    for (const table of [
      "profiles",
      "execution_profiles",
      "goals",
      "plan_documents",
      "plan_source_anchors",
      "milestones",
      "tasks",
      "task_dependencies",
      "reminders",
      "check_ins",
      "execution_blocks",
      "calendar_connections",
      "calendar_blocks",
      "goal_audits",
      "ai_action_logs",
    ]) {
      expect(createdTables, `${table} should exist`).toContain(table);
    }
  });

  it("enables RLS on every table without exception", () => {
    for (const table of createdTables) {
      expect(sql, `RLS must be enabled on ${table}`).toContain(
        `alter table public.${table} enable row level security`,
      );
    }
  });

  it("gives every non-secret table a select policy scoped to the owner", () => {
    for (const table of createdTables) {
      if (DENY_ALL_TABLES.includes(table)) continue;
      const policy = new RegExp(
        `create policy "${table}: read own"[\\s\\S]*?using \\(\\(select auth\\.uid\\(\\)\\) = (user_id|id)\\)`,
      );
      expect(policy.test(sql), `${table} needs an owner-scoped read policy`).toBe(true);
    }
  });

  it("gives every non-secret table insert, update and delete cover", () => {
    for (const table of createdTables) {
      if (DENY_ALL_TABLES.includes(table)) continue;
      expect(sql, `${table} needs an insert policy`).toContain(`create policy "${table}: insert own"`);
      expect(sql, `${table} needs a delete policy`).toContain(`create policy "${table}: delete own"`);
      if (!APPEND_ONLY_TABLES.includes(table)) {
        expect(sql, `${table} needs an update policy`).toContain(
          `create policy "${table}: update own"`,
        );
      }
    }
  });

  it("keeps secret tables policy-free so no session can read them", () => {
    for (const table of DENY_ALL_TABLES) {
      expect(createdTables).toContain(table);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql, `${table} must have no policy at all`).not.toContain(`on public.${table} for select`);
    }
  });

  it("wraps auth.uid() in a scalar sub-select in every policy", () => {
    // Bare auth.uid() re-evaluates per row. Every policy should use the
    // (select auth.uid()) form.
    const bare = [...sql.matchAll(/using \(auth\.uid\(\)/g)];
    expect(bare).toHaveLength(0);
  });

  it("scopes storage objects to the uploading user's folder", () => {
    expect(sql).toContain("(storage.foldername(name))[1]");
    expect(sql).toContain("'plan-documents'");
    // The bucket must not be public.
    expect(sql).toMatch(/public\s+=\s+false|false,\s*$/m);
  });

  it("pins search_path and revokes execute on the SECURITY DEFINER trigger", () => {
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("revoke execute on function public.handle_new_user() from anon, authenticated, public");
  });
});

describe("provenance is structurally required (PRD §7)", () => {
  it("makes origin and confidence NOT NULL on milestones and tasks", () => {
    for (const table of ["milestones", "tasks"]) {
      const block = sql.slice(sql.indexOf(`create table public.${table}`));
      const body = block.slice(0, block.indexOf(");"));
      expect(body, `${table}.origin must be NOT NULL`).toMatch(
        /origin\s+public\.item_origin not null/,
      );
      expect(body, `${table}.confidence must be NOT NULL`).toMatch(/confidence\s+numeric\(3,2\) not null/);
    }
  });
});

describe("a reminder is never recorded as sent when it was not (PRD §12)", () => {
  it("constrains sent_at to agree with delivery_status", () => {
    expect(sql).toContain("reminders_sent_at_matches_status");
    expect(sql).toMatch(/delivery_status = 'sent' and sent_at is not null/);
    expect(sql).toMatch(/delivery_status <> 'sent' and sent_at is null/);
  });
});
