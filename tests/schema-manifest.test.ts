import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { EXPECTED_SCHEMA } from "@/lib/db/schema-manifest";

/**
 * The manifest must match the migrations.
 *
 * It is what /api/health/schema and the extract route's preflight compare the
 * live database against, so a stale manifest is a check that passes while the
 * database is behind — the exact failure it was written to catch.
 */
describe("the generated schema manifest", () => {
  it("is up to date with supabase/migrations", () => {
    const before = readFileSync("src/lib/db/schema-manifest.ts", "utf8");
    execFileSync("node", ["scripts/build-schema-manifest.mjs"], { stdio: "pipe" });
    const after = readFileSync("src/lib/db/schema-manifest.ts", "utf8");
    expect(
      after,
      "schema-manifest.ts is stale. Run: node scripts/build-schema-manifest.mjs",
    ).toBe(before);
  });

  it("covers the columns whose absence broke production", () => {
    // 0005 and 0006 were written and never applied; the write failed with
    // "Could not find the 'short_label' column of 'goals' in the schema cache"
    // after a full, billed extraction had already completed.
    expect(EXPECTED_SCHEMA["goals"]).toContain("short_label");
    expect(EXPECTED_SCHEMA["profiles"]).toContain("email_reminders");
  });

  it("knows about every table the migrations create", () => {
    expect(Object.keys(EXPECTED_SCHEMA)).toHaveLength(17);
    for (const table of ["goals", "tasks", "milestones", "reminders", "profiles"]) {
      expect(EXPECTED_SCHEMA[table]?.length ?? 0).toBeGreaterThan(3);
    }
  });
});
