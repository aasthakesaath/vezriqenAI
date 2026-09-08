import { describe, expect, it } from "vitest";
import {
  VISIBLE_TASKS,
  selectGoalToday,
  summarizeToday,
  urgencyFor,
  type GoalTaskInput,
} from "@/lib/plan/goal-today";
import { dayKeyIn } from "@/lib/time-zone";

/**
 * What one goal needs today (PRD §17, §4.5, §4.6).
 *
 * The rules being held here are the ones a redesign quietly breaks: that
 * ordinary future work stays out, that a badge states a fact rather than a
 * reproach, that priority can outrank age, and that the day is the user's day
 * rather than the server's.
 */

const TODAY = "2026-09-08";

function task(overrides: Partial<GoalTaskInput> = {}): GoalTaskInput {
  return {
    id: Math.random().toString(36).slice(2),
    title: "A task",
    rationale: "it moves the goal forward",
    taskType: "simple_action",
    status: "not_started",
    priority: 3,
    deadline: null,
    startBy: null,
    estimatedMinutes: 30,
    milestoneTitle: null,
    waitingOn: null,
    ...overrides,
  };
}

describe("what belongs on today's list", () => {
  it("keeps ordinary future work off it (§17 — not a backlog)", () => {
    const future = task({ deadline: "2026-10-01", startBy: "2026-09-20" });
    expect(urgencyFor(future, TODAY)).toBeNull();
    expect(selectGoalToday([future], TODAY).tasks).toEqual([]);
  });

  it("shows work due today", () => {
    expect(urgencyFor({ deadline: TODAY, startBy: null }, TODAY)).toMatchObject({
      kind: "due_today",
      label: "Due today",
    });
  });

  it("shows work whose start-by date is today", () => {
    expect(urgencyFor({ deadline: "2026-09-30", startBy: TODAY }, TODAY)).toMatchObject({
      kind: "start_today",
      label: "Start today",
    });
  });

  it("shows overdue work, and says how many days as a fact", () => {
    const urgency = urgencyFor({ deadline: "2026-08-09", startBy: null }, TODAY);
    expect(urgency).toMatchObject({ kind: "overdue", label: "30 days overdue", daysLate: 30 });
    // §4.6 — a fact, never a sentence about the person.
    expect(urgency?.label).not.toMatch(/should|failed|missed|you /i);
  });

  it("counts one day as a day, not as days", () => {
    expect(urgencyFor({ deadline: "2026-09-07", startBy: null }, TODAY)?.label).toBe(
      "1 day overdue",
    );
  });

  it("says a start date has passed without saying whose fault that is", () => {
    const urgency = urgencyFor({ deadline: "2026-12-01", startBy: "2026-08-25" }, TODAY);
    expect(urgency).toMatchObject({ kind: "start_overdue", label: "Past its start date" });
    expect(urgency?.dateLabel).toBe("Start by 25 Aug");
  });

  it("lets a passed deadline outrank what the start-by date says", () => {
    // Both are true; the deadline is the one the user is being held to.
    expect(urgencyFor({ deadline: "2026-09-01", startBy: "2026-08-01" }, TODAY)?.kind).toBe(
      "overdue",
    );
  });

  it("leaves finished and blocked work out", () => {
    for (const status of ["done", "not_done", "snoozed", "blocked", "skipped"]) {
      expect(selectGoalToday([task({ deadline: TODAY, status })], TODAY).tasks).toEqual([]);
    }
  });
});

describe("the order the list is read in", () => {
  it("puts a hard deadline today above an older low-value slip (§17)", () => {
    const critical = task({ title: "Submit the application", deadline: TODAY, priority: 1 });
    const stale = task({ title: "Tidy the notes", deadline: "2026-08-20", priority: 5 });
    const { tasks } = selectGoalToday([stale, critical], TODAY);
    expect(tasks.map((t) => t.title)).toEqual(["Submit the application", "Tidy the notes"]);
  });

  it("puts the older of two equal slips first", () => {
    const older = task({ title: "Older", deadline: "2026-08-01", priority: 3 });
    const newer = task({ title: "Newer", deadline: "2026-09-01", priority: 3 });
    expect(selectGoalToday([newer, older], TODAY).tasks.map((t) => t.title)).toEqual([
      "Older",
      "Newer",
    ]);
  });

  it("drops work that waits on someone else below work the user can do (§13)", () => {
    // Blocked and severely overdue and top priority: still below an ordinary
    // task, because the user cannot act on it today.
    const blocked = task({
      title: "Hear back from the school",
      deadline: "2026-07-01",
      priority: 1,
      waitingOn: "Ms Naidoo",
    });
    const mine = task({ title: "Draft the fact sheet", deadline: TODAY, priority: 5 });
    const { tasks } = selectGoalToday([blocked, mine], TODAY);
    expect(tasks.map((t) => t.title)).toEqual(["Draft the fact sheet", "Hear back from the school"]);
    // Visible, though. Hiding it is how a dependency is forgotten.
    expect(tasks).toHaveLength(2);
  });

  it("gives every row a line about why it matters, as a finished sentence", () => {
    const { tasks } = selectGoalToday(
      [task({ deadline: TODAY, rationale: null, taskType: "submission" })],
      TODAY,
    );
    expect(tasks[0]!.reason).toBe("Because it has a hard cut-off.");
  });

  /**
   * The line arrives ready to render. Both screens used to punctuate it
   * themselves and disagreed: wrapping a model-written sentence in
   * "Because {reason}." produced "Because This is a key piece of independent
   * validation." — a capital letter mid-sentence. §7 also forbids re-wording
   * what the model said about a plan, so it is punctuated, never edited.
   */
  it("uses the model's own sentence verbatim, only punctuating it", () => {
    const { tasks } = selectGoalToday(
      [task({ deadline: TODAY, rationale: "This is a key piece of independent validation" })],
      TODAY,
    );
    expect(tasks[0]!.reason).toBe("This is a key piece of independent validation.");
    expect(tasks[0]!.reason).not.toContain("Because");
  });

  it("never exposes the number it sorted by (§17)", () => {
    const { tasks } = selectGoalToday([task({ deadline: TODAY })], TODAY);
    expect(tasks[0]!.urgency.label).not.toMatch(/\d+ (points|score)/);
    expect(Object.keys(tasks[0]!.urgency)).not.toContain("rank");
  });
});

describe("the count line", () => {
  it("reads like the screen it sits on", () => {
    const tasks = [
      task({ deadline: "2026-08-01" }),
      task({ deadline: "2026-09-05" }),
      task({ deadline: TODAY }),
      task({ deadline: TODAY }),
      task({ deadline: TODAY }),
    ];
    const { counts } = selectGoalToday(tasks, TODAY);
    expect(summarizeToday(counts)).toBe("2 overdue · 3 due today");
  });

  it("leaves out the buckets that are empty", () => {
    const { counts } = selectGoalToday([task({ deadline: TODAY })], TODAY);
    expect(summarizeToday(counts)).toBe("1 due today");
  });

  it("says nothing at all when there is nothing", () => {
    expect(summarizeToday({ overdue: 0, dueToday: 0, startNow: 0 })).toBe("");
  });

  it("counts a passed start date as work to start, not as overdue", () => {
    const { counts } = selectGoalToday(
      [task({ deadline: "2026-12-01", startBy: "2026-09-01" })],
      TODAY,
    );
    expect(counts).toEqual({ overdue: 0, dueToday: 0, startNow: 1 });
    expect(summarizeToday(counts)).toBe("1 to start");
  });
});

describe("the day is the user's day, not the server's", () => {
  it("does not call a task overdue because it is already tomorrow in UTC", () => {
    // 9 PM on 8 September in Chicago is the 9th in UTC. A task due on the 8th
    // is due TODAY for this user, and calling it overdue is the bug that
    // shipped once already.
    const evening = new Date("2026-09-09T02:00:00Z");
    const today = dayKeyIn(evening, "America/Chicago");
    expect(today).toBe("2026-09-08");
    expect(urgencyFor({ deadline: "2026-09-08", startBy: null }, today)?.kind).toBe("due_today");
  });
});

describe("the cap", () => {
  it("is three, per §4.5", () => {
    expect(VISIBLE_TASKS).toBe(3);
  });

  it("returns everything eligible so the count line can tell the truth", () => {
    const many = Array.from({ length: 9 }, (_, index) =>
      task({ title: `Task ${index}`, deadline: TODAY }),
    );
    const { tasks, counts } = selectGoalToday(many, TODAY);
    expect(tasks).toHaveLength(9);
    expect(counts.dueToday).toBe(9);
  });
});
