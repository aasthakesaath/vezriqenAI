import { describe, expect, it } from "vitest";
import {
  selectTodayByGoal,
  sectionSummary,
  taskContextLine,
  type CandidateTask,
} from "@/lib/plan/today";
import { goalTaskCounts } from "@/lib/plan/goal-progress";
import { goalIconFor } from "@/lib/goal-icons";
import { goalSummary } from "@/lib/goal-label";
import { dayKey, daysBetweenDays, formatDayYear, formatDueDate, formatWeekdayDate } from "@/lib/time";

/**
 * Today, grouped by goal (PRD §17, §4.5, §4.6).
 *
 * The cross-goal three-card selection is covered in audit-and-today.test.ts and
 * is unchanged. What is new here is the screen's arrangement: which work is
 * eligible for today at all, which goal it belongs under, what the badge says,
 * and — the part that is easiest to get wrong — that a day boundary is the
 * reader's day and not the server's.
 */

const NOW = new Date("2026-09-08T12:00:00.000Z"); // a Tuesday

function task(overrides: Partial<CandidateTask> = {}): CandidateTask {
  return {
    id: crypto.randomUUID(),
    goalId: "goal-1",
    goalTitle: "Pass the SAT",
    goalLabel: "SAT 1450+",
    title: "Study",
    rationale: null,
    taskType: "deep_work",
    priority: 3,
    deadline: null,
    startBy: null,
    estimatedMinutes: 45,
    status: "not_started",
    awaitingCheckpoint: false,
    blockedOnPerson: false,
    ...overrides,
  };
}

const day = (iso: string) => new Date(`${iso}T09:00:00.000Z`);

describe("what is eligible for Today", () => {
  it("is not a backlog: work that is neither due nor startable today stays off", () => {
    const sections = selectTodayByGoal(
      [task({ title: "Later", deadline: day("2026-10-30"), startBy: day("2026-10-01") })],
      { now: NOW },
    );
    expect(sections).toEqual([]);
  });

  it("takes overdue, due today, start today and an unanswered check-in", () => {
    const sections = selectTodayByGoal(
      [
        task({ title: "Overdue", deadline: day("2026-08-09") }),
        task({ title: "Due today", deadline: day("2026-09-08") }),
        task({ title: "Start today", startBy: day("2026-09-08") }),
        task({ title: "Unanswered", awaitingCheckpoint: true }),
        task({ title: "Next month", deadline: day("2026-10-20") }),
      ],
      { now: NOW },
    );
    expect(sections).toHaveLength(1);
    expect(sections[0]!.tasks.map((t) => t.title)).toEqual([
      "Overdue",
      "Due today",
      "Start today",
      "Unanswered",
    ]);
  });

  it("leaves closed work out", () => {
    const sections = selectTodayByGoal(
      [task({ status: "done", deadline: day("2026-08-09") })],
      { now: NOW },
    );
    expect(sections).toEqual([]);
  });

  /**
   * §13 — "This is not in your control right now." Blocked work keeps its own
   * section on the page (selectWaitingOn) rather than taking a slot the user
   * cannot act on.
   */
  it("leaves work that is blocked on another person out of the goal sections", () => {
    const sections = selectTodayByGoal(
      [task({ blockedOnPerson: true, deadline: day("2026-08-09") })],
      { now: NOW },
    );
    expect(sections).toEqual([]);
  });
});

describe("the badge states a fact (§4.6)", () => {
  it("counts the days rather than characterising them", () => {
    const [section] = selectTodayByGoal(
      [
        task({ title: "A month", deadline: day("2026-08-09") }),
        task({ title: "Yesterday", deadline: day("2026-09-07") }),
        task({ title: "Today", deadline: day("2026-09-08") }),
        task({ title: "Begin", startBy: day("2026-09-08") }),
      ],
      { now: NOW },
    );
    const badges = Object.fromEntries(section!.tasks.map((t) => [t.title, t.badge]));
    expect(badges).toEqual({
      "A month": "30 days overdue",
      Yesterday: "1 day overdue",
      Today: "Due today",
      Begin: "Start today",
    });
  });

  it("carries no reproach, no exclamation and no second person", () => {
    const [section] = selectTodayByGoal(
      [
        task({ title: "A", deadline: day("2026-08-09") }),
        task({ title: "B", startBy: day("2026-08-30") }),
        task({ title: "C", awaitingCheckpoint: true }),
      ],
      { now: NOW },
    );
    for (const row of section!.tasks) {
      expect(row.badge).not.toMatch(/!|you|your|should|fail|missed|late|behind/i);
    }
  });

  it("says start-by, not due, for work that has slipped past its start date", () => {
    const [section] = selectTodayByGoal(
      [task({ startBy: day("2026-08-31"), deadline: day("2026-09-30") })],
      { now: NOW },
    );
    expect(section!.tasks[0]!.dateKind).toBe("start_by");
    expect(section!.tasks[0]!.badge).toBe("8 days overdue");
  });
});

describe("a day belongs to the reader, not the server", () => {
  /**
   * The bug this exists to stop: at 12:00 UTC it is already the 9th in
   * Auckland and still the 8th in Los Angeles. Subtracting timestamps answers
   * neither question — a task due at 23:00 on the 8th UTC is not "tomorrow"
   * for someone in Auckland, it is already yesterday's.
   */
  it("reads due-today in the user's zone", () => {
    // 06:00 UTC on the 8th. Still the 8th in UTC; already 18:00 on the 8th in
    // Auckland, where NOW (12:00 UTC) is already midnight on the 9th.
    const due = new Date("2026-09-08T06:00:00.000Z");

    expect(selectTodayByGoal([task({ deadline: due })], { now: NOW })[0]!.tasks[0]!.urgency).toBe(
      "due_today",
    );

    const auckland = selectTodayByGoal([task({ deadline: due })], {
      now: NOW,
      timeZone: "Pacific/Auckland",
    });
    expect(auckland[0]!.tasks[0]!.urgency).toBe("overdue");
    expect(auckland[0]!.tasks[0]!.badge).toBe("1 day overdue");
  });

  it("does not call something overdue that has not happened yet in the user's zone", () => {
    // 05:00 UTC on the 8th is 22:00 on the 7th in Los Angeles.
    const now = new Date("2026-09-08T05:00:00.000Z");
    const sections = selectTodayByGoal([task({ deadline: new Date("2026-09-08T04:00:00.000Z") })], {
      now,
      timeZone: "America/Los_Angeles",
    });
    expect(sections[0]!.tasks[0]!.urgency).toBe("due_today");
  });
});

describe("grouping and order", () => {
  it("gives every goal its own section", () => {
    const sections = selectTodayByGoal(
      [
        task({ goalId: "g1", goalLabel: "SAT 1450+", deadline: day("2026-09-08") }),
        task({ goalId: "g2", goalLabel: "College Applications", deadline: day("2026-09-08") }),
        task({ goalId: "g1", goalLabel: "SAT 1450+", startBy: day("2026-09-08") }),
      ],
      { now: NOW },
    );
    expect(sections).toHaveLength(2);
    expect(sections.map((s) => s.tasks.length).sort()).toEqual([1, 2]);
  });

  it("puts the goal carrying the most pressing work first", () => {
    const sections = selectTodayByGoal(
      [
        task({ goalId: "calm", goalLabel: "Build Calyqen", startBy: day("2026-09-08") }),
        task({ goalId: "urgent", goalLabel: "TIME Kid", priority: 1, deadline: day("2026-08-09") }),
      ],
      { now: NOW },
    );
    expect(sections.map((s) => s.goalId)).toEqual(["urgent", "calm"]);
  });

  it("orders a section overdue first, and older slippage before newer", () => {
    const [section] = selectTodayByGoal(
      [
        task({ title: "Due today", deadline: day("2026-09-08") }),
        task({ title: "Eight days", deadline: day("2026-08-31") }),
        task({ title: "Thirty days", deadline: day("2026-08-09") }),
        task({ title: "Start today", startBy: day("2026-09-08") }),
      ],
      { now: NOW },
    );
    expect(section!.tasks.map((t) => t.title)).toEqual([
      "Thirty days",
      "Eight days",
      "Due today",
      "Start today",
    ]);
  });
});

describe("the section header says what is inside it", () => {
  // A section that can be collapsed must state its contents, or collapsing
  // hides work rather than tidying it.
  it("counts what needs attention", () => {
    const [section] = selectTodayByGoal(
      [
        task({ deadline: day("2026-08-09") }),
        task({ deadline: day("2026-08-31") }),
        task({ deadline: day("2026-09-08") }),
        task({ startBy: day("2026-09-08") }),
      ],
      { now: NOW },
    );
    expect(section!.summary).toBe("2 overdue · 1 due today · 1 to start today");
  });

  it("names only the kinds that are actually there", () => {
    expect(
      sectionSummary({
        overdueCount: 2,
        dueTodayCount: 3,
        startTodayCount: 0,
        needsAnswerCount: 0,
      }),
    ).toBe("2 overdue · 3 due today");
  });
});

describe("the line under a title is about the work, not the date", () => {
  /**
   * The badge and the date already carry urgency. Repeating it in the context
   * line is the same reproach three times in one row, which is exactly how a
   * factual screen turns into a nagging one.
   */
  it("never restates the deadline", () => {
    const [section] = selectTodayByGoal([task({ deadline: day("2026-08-09") })], { now: NOW });
    expect(section!.tasks[0]!.reason).not.toMatch(/deadline|overdue|due/i);
  });

  it("uses the model's own rationale verbatim, only punctuated", () => {
    expect(taskContextLine(task({ rationale: "This is a key piece of independent validation" })))
      .toBe("This is a key piece of independent validation.");
    expect(taskContextLine(task({ rationale: "Already a sentence." }))).toBe("Already a sentence.");
  });

  it("falls back to something true about the kind of work", () => {
    expect(taskContextLine(task({ taskType: "external_dependency" }))).toBe(
      "Because someone else has to act before this can close.",
    );
  });
});

describe("the numbers on a goal card count tasks and nothing else (§15, §4.10)", () => {
  const counted = (overrides: Partial<{ status: string; deadline: Date | null; startBy: Date | null }>) => ({
    status: "not_started",
    deadline: null,
    startBy: null,
    ...overrides,
  });

  it("is done over total", () => {
    const counts = goalTaskCounts(
      [
        counted({ status: "done" }),
        counted({ status: "done" }),
        counted({}),
        counted({}),
      ],
      { now: NOW },
    );
    expect(counts).toMatchObject({ total: 4, done: 2, percentComplete: 50 });
  });

  it("is 0 rather than NaN for a goal with no tasks yet", () => {
    expect(goalTaskCounts([], { now: NOW }).percentComplete).toBe(0);
  });

  it("splits open work into overdue and due this week", () => {
    const counts = goalTaskCounts(
      [
        counted({ deadline: day("2026-08-09") }),
        counted({ startBy: day("2026-09-01") }),
        counted({ deadline: day("2026-09-08") }),
        counted({ deadline: day("2026-09-14") }),
        counted({ deadline: day("2026-09-30") }),
        counted({ status: "done", deadline: day("2026-08-09") }),
      ],
      { now: NOW },
    );
    expect(counts).toMatchObject({ overdue: 2, dueThisWeek: 2, done: 1, total: 6 });
  });

  /**
   * §4.10 — "Completing low-value tasks must not make a goal appear healthier
   * than it is." The ring is allowed to move because it is labelled as a task
   * count; what it must never do is claim to be the health verdict.
   */
  it("does not pretend to be Goal Health", () => {
    const counts = goalTaskCounts(
      [counted({ status: "done" }), counted({ deadline: day("2026-08-09") })],
      { now: NOW },
    );
    expect(counts.percentComplete).toBe(50);
    expect(counts).not.toHaveProperty("status");
    expect(counts).not.toHaveProperty("health");
  });
});

describe("goal icons", () => {
  it("picks from what the goal says, and repeats itself for the same goal", () => {
    expect(goalIconFor({ short_label: "SAT 1450+" })).toBe("book");
    expect(goalIconFor({ short_label: "College Applications" })).toBe("graduation");
    expect(goalIconFor({ short_label: "Build Calyqen" })).toBe("briefcase");
    expect(goalIconFor({ short_label: "TIME Kid of the Year" })).toBe("trophy");
    expect(goalIconFor({ short_label: "SAT 1450+" })).toBe("book");
  });

  it("falls back to something true of every goal rather than guessing", () => {
    expect(goalIconFor({ short_label: "Zephyr" })).toBe("target");
    expect(goalIconFor(null)).toBe("target");
  });

  it("matches whole words, not fragments inside them", () => {
    // "impact" contains "act", which gave a company-building goal an exam icon.
    expect(
      goalIconFor({
        short_label: "Build Calyqen",
        normalized_goal: "Continue developing and expanding impact.",
      }),
    ).toBe("briefcase");
  });

  it("trusts the six-word name over a word buried in the statement", () => {
    // The statement mentions college readiness; the goal is still the exam.
    expect(
      goalIconFor({
        short_label: "SAT 1450+",
        normalized_goal: "Reach 1450+ and strengthen college readiness.",
      }),
    ).toBe("book");
  });
});

describe("the one-line goal description", () => {
  it("is the first sentence the user approved", () => {
    expect(
      goalSummary({ normalized_goal: "Reach 1450 on the SAT. Sit the March test." }),
    ).toBe("Reach 1450 on the SAT");
  });

  it("shows nothing rather than a clause cut off mid-thought", () => {
    const long = `${"Reach a measurably better score ".repeat(6)}by March.`;
    expect(goalSummary({ normalized_goal: long })).toBeNull();
  });

  it("does not repeat the name already above it", () => {
    expect(goalSummary({ short_label: "Run a marathon", normalized_goal: "Run a marathon" })).toBeNull();
  });
});

describe("the date helpers Today depends on", () => {
  it("resolves a moment to a calendar day in a zone", () => {
    expect(dayKey(new Date("2026-09-08T23:30:00.000Z"))).toBe("2026-09-08");
    expect(dayKey(new Date("2026-09-08T23:30:00.000Z"), "Pacific/Auckland")).toBe("2026-09-09");
  });

  it("counts whole days between two calendar days", () => {
    expect(daysBetweenDays("2026-08-09", "2026-09-08")).toBe(30);
    expect(daysBetweenDays("2026-09-08", "2026-09-08")).toBe(0);
    // Across a DST change in the reader's zone: still 30 calendar days.
    expect(daysBetweenDays("2026-10-20", "2026-11-19")).toBe(30);
  });

  it("writes the heading with the weekday and the year", () => {
    // "Sept", not "Sep": en-GB, the same short month formatDay already uses
    // everywhere else in the product.
    expect(formatWeekdayDate(new Date("2026-09-08T12:00:00.000Z"))).toBe("Tuesday, 8 Sept 2026");
  });

  it("adds the year to a due date only when it is not this one", () => {
    expect(formatDueDate(new Date("2026-08-09T09:00:00.000Z"), { now: NOW })).toBe("9 Aug");
    expect(formatDueDate(new Date("2025-08-09T09:00:00.000Z"), { now: NOW })).toBe("9 Aug 2025");
    expect(formatDayYear(new Date("2026-12-31T09:00:00.000Z"))).toBe("31 Dec 2026");
  });
});
