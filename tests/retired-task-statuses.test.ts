import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  OPEN_TASK_STATUSES,
  RETIRED_TASK_STATUSES,
  isOpenTaskStatus,
} from "@/lib/plan/task-status";

/**
 * `partial` and `snoozed` are retired (owner decision, 2026-09-09).
 *
 * Deleting the buttons is not enough on its own. Both statuses are still legal
 * values of the `task_status` enum, both still appear in `check_ins` history,
 * and the reason each was wrong is invisible at the call site — which is
 * exactly how one comes back. This test is the thing that notices.
 */

const RETIRED = Object.keys(RETIRED_TASK_STATUSES);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.tsx?$/.test(entry)) out.push(path);
  }
  return out;
}

describe("nothing writes a retired status", () => {
  /**
   * The two places allowed to name them, and why:
   *
   *   lib/plan/task-status.ts   defines the retirement and the destinations
   *   lib/reminders/redeem.ts   the email "Snooze" link, which predates this
   *                             and still writes `snoozed`. Flagged rather
   *                             than silently changed: changing what an email
   *                             button does is a product decision, and the
   *                             enum behind it is a database type.
   */
  const ALLOWED = [
    join("lib", "plan", "task-status.ts"),
    join("lib", "reminders", "redeem.ts"),
    // Reads `check_ins.state === "snoozed"` to count past snoozes. History is
    // a record of what people actually reported and is never rewritten, so
    // reading it stays correct after the button is gone.
    join("lib", "coach", "profile.ts"),
    // "partial" here is a CALENDAR CONNECTION state — some scopes granted,
    // some not. Nothing to do with a task.
    join("components", "app", "CalendarConnection.tsx"),
    join("api", "calendar", "callback", "route.ts"),
  ];

  it("names them nowhere but the retirement record and the known exception", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles("src")) {
      if (ALLOWED.some((suffix) => file.endsWith(suffix))) continue;
      const source = readFileSync(file, "utf8");
      for (const status of RETIRED) {
        // A quoted status, which is how one is written to the database.
        if (new RegExp(`["']${status}["']`).test(source)) {
          offenders.push(`${file} names "${status}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps them out of the check-in API's accepted states", () => {
    const route = readFileSync("src/app/api/tasks/[id]/checkin/route.ts", "utf8");
    const schema = route.slice(route.indexOf("const CheckInSchema"), route.indexOf("export async"));
    for (const status of RETIRED) {
      expect(schema, `the API still accepts ${status}`).not.toContain(`"${status}"`);
    }
    // The two that reach the Execution Block Coach are still accepted (§13).
    expect(schema).toContain('"not_done"');
    expect(schema).toContain('"stuck"');
  });

  it("records where existing rows go, so none is orphaned", () => {
    // The migration destination for each, written down where the code is
    // rather than in a commit message nobody reads again.
    expect(RETIRED_TASK_STATUSES.partial).toBe("in_progress");
    expect(RETIRED_TASK_STATUSES.snoozed).toBe("not_started");
  });
});

describe("the open set", () => {
  it("still reads `partial` until the migration has run", () => {
    // Dropping it from the read path before the data moves would HIDE those
    // tasks rather than migrate them — they are live user work.
    expect(isOpenTaskStatus("partial")).toBe(true);
  });

  it("counts the three statuses the product writes", () => {
    for (const status of ["not_started", "in_progress", "unconfirmed"]) {
      expect(isOpenTaskStatus(status)).toBe(true);
    }
    for (const status of ["done", "skipped", "blocked"]) {
      expect(isOpenTaskStatus(status)).toBe(false);
    }
  });

  it("is the one definition the planner shares", () => {
    // Five modules each had their own copy of this list. One of them drifting
    // is how `partial` came to mean "open" to the task lists and "not my
    // problem" to Goal Health.
    for (const file of [
      "src/lib/plan/today.ts",
      "src/lib/plan/views.ts",
      "src/lib/plan/goal-today.ts",
      "src/lib/plan/load-today.ts",
      "src/app/(app)/goals/[id]/page.tsx",
    ]) {
      expect(readFileSync(file, "utf8"), `${file} should share the set`).toContain(
        "OPEN_TASK_STATUSES",
      );
    }
    expect(OPEN_TASK_STATUSES.length).toBe(4);
  });
});
