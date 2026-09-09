import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  OPEN_TASK_STATUSES,
  RETIRED_TASK_STATUSES,
  isOpenTaskStatus,
} from "@/lib/plan/task-status";
import {
  EMAIL_ACTIONS,
  RETIRED_EMAIL_ACTIONS,
  isEmailAction,
} from "@/lib/reminders/email-actions";

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
   * The places allowed to name them, and why.
   *
   * lib/reminders/redeem.ts used to be on this list: the email "Snooze a day"
   * link wrote `snoozed` from an inbox, bypassing the API that refuses it.
   * That link was cut on 2026-09-10, so the exception is gone with it and
   * this test now fails if redeem.ts ever names a retired status again.
   */
  const ALLOWED = [
    // Defines the retirement and each destination.
    join("lib", "plan", "task-status.ts"),
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
  it("no longer reads either retired status", () => {
    // `partial` was readable while live rows still held it — dropping it from
    // the read path before the data moved would have HIDDEN those tasks
    // rather than migrated them. APPLY_0010 moved them on 2026-09-09, so
    // reading it now would only be a way for it to come back unnoticed.
    for (const status of Object.keys(RETIRED_TASK_STATUSES)) {
      expect(isOpenTaskStatus(status), `${status} is retired`).toBe(false);
    }
  });

  it("keeps every migration destination inside the open set", () => {
    // The rows APPLY_0010 moved have to land somewhere the lists still show,
    // or the migration would have hidden them just as surely.
    for (const destination of Object.values(RETIRED_TASK_STATUSES)) {
      expect(isOpenTaskStatus(destination), `${destination} must stay open`).toBe(true);
    }
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
    expect(OPEN_TASK_STATUSES.length).toBe(3);
  });
});

/**
 * The email actions retired alongside them.
 *
 * A link in an inbox outlives a deploy, so `snooze` stays a legal value of the
 * `email_action` enum — the redeem path has to read one in order to refuse it.
 * Nothing may WRITE it, which is a different thing and is what this checks.
 */
describe("retired email actions", () => {
  it("offers exactly the three responses a task row offers", () => {
    expect([...EMAIL_ACTIONS]).toEqual(["done", "not_done", "stuck"]);
  });

  it("does not treat a retired action as current", () => {
    for (const action of RETIRED_EMAIL_ACTIONS) {
      expect(isEmailAction(action), `${action} is retired`).toBe(false);
    }
  });

  it("mints no link for a retired action", () => {
    // The email builder is the only thing that creates these rows.
    const template = readFileSync("src/lib/email/templates.ts", "utf8");
    for (const action of RETIRED_EMAIL_ACTIONS) {
      expect(template, `the email still mints a ${action} link`).not.toContain(`"${action}"`);
    }
    expect(template).toContain('"not_done"');
  });

  it("refuses a retired action before it writes anything", () => {
    // The order of these two matters more than either on its own: the check
    // has to come BEFORE the first write, or an old link still half-acts.
    const source = readFileSync("src/lib/reminders/redeem.ts", "utf8");
    expect(source.indexOf("isEmailAction")).toBeLessThan(source.indexOf('from("check_ins")'));
    expect(source.indexOf("isEmailAction")).toBeLessThan(source.indexOf('from("tasks")'));
  });
});
