import { describe, expect, it } from "vitest";
import {
  selectGoalToday,
  selectTodayByGoal,
  urgencyFor,
  type CrossGoalTask,
} from "@/lib/plan/goal-today";
import { goalTaskCounts } from "@/lib/plan/goal-progress";
import { goalIconFor } from "@/lib/goal-icon";
import { formatWeekdayDayKey } from "@/lib/time";

/**
 * Today, grouped by goal (PRD §17, §4.5, §18).
 *
 * What a row SAYS — the badge, the date, the order inside a goal, the day
 * boundary — belongs to selectGoalToday and is covered in goal-today.test.ts.
 * It is deliberately not re-tested here: /today and /goals/[id] were built in
 * parallel, each grew its own urgency rules, and the two disagreed about a
 * task past its start date. There is one engine now, and the last test in this
 * file is the one that keeps it that way.
 *
 * What IS new here is the cross-goal arrangement: which goal a row lands
 * under, which section leads, and what a card on My Goals counts.
 */

const TODAY = "2026-09-08";

let seq = 0;
function task(overrides: Partial<CrossGoalTask> = {}): CrossGoalTask {
  seq += 1;
  return {
    id: `t-${seq}`,
    title: `Task ${seq}`,
    rationale: null,
    taskType: "deep_work",
    status: "not_started",
    priority: 3,
    deadline: null,
    startBy: null,
    estimatedMinutes: 45,
    milestoneTitle: null,
    waitingOn: null,
    goalId: "goal-1",
    goalLabel: "SAT 1450+",
    goalTitle: "Pass the SAT",
    ...overrides,
  };
}

describe("one section per goal", () => {
  it("puts each goal's work under its own goal", () => {
    const sections = selectTodayByGoal(
      [
        task({ goalId: "g1", goalLabel: "SAT 1450+", deadline: TODAY }),
        task({ goalId: "g2", goalLabel: "College Applications", deadline: TODAY }),
        task({ goalId: "g1", goalLabel: "SAT 1450+", startBy: TODAY }),
      ],
      TODAY,
    );
    expect(sections).toHaveLength(2);
    expect(sections.map((s) => s.tasks.length).sort()).toEqual([1, 2]);
    expect(new Set(sections.map((s) => s.goalId))).toEqual(new Set(["g1", "g2"]));
  });

  it("gives a goal with nothing due today no section at all", () => {
    const sections = selectTodayByGoal(
      [
        task({ goalId: "g1", deadline: TODAY }),
        task({ goalId: "quiet", deadline: "2026-11-30" }),
      ],
      TODAY,
    );
    expect(sections.map((s) => s.goalId)).toEqual(["g1"]);
  });

  it("is not a backlog: nothing due, startable or overdue means no sections", () => {
    expect(selectTodayByGoal([task({ deadline: "2026-10-30" })], TODAY)).toEqual([]);
  });

  /**
   * §13 — across every goal at once, work waiting on somebody else would crowd
   * out work the user can actually do. It keeps its own section on the page
   * (selectWaitingOn) rather than disappearing. On a single goal's page it is
   * only demoted, because there it is still that goal's work.
   */
  it("leaves work waiting on someone else out of the goal sections", () => {
    const blocked = task({ deadline: "2026-08-09", waitingOn: "Ms Ndlovu" });
    expect(selectTodayByGoal([blocked], TODAY)).toEqual([]);
    // The same task on its own goal's page is kept, just ranked last.
    expect(selectGoalToday([blocked], TODAY).tasks).toHaveLength(1);
  });
});

describe("the order the sections are read in", () => {
  it("leads with the goal carrying the most pressing work", () => {
    const sections = selectTodayByGoal(
      [
        task({ goalId: "calm", goalLabel: "Build Calyqen", startBy: TODAY }),
        task({ goalId: "urgent", goalLabel: "TIME Kid", priority: 1, deadline: "2026-08-09" }),
      ],
      TODAY,
    );
    expect(sections.map((s) => s.goalId)).toEqual(["urgent", "calm"]);
  });

  it("reads down the page in one order — the first row of the first section leads", () => {
    const sections = selectTodayByGoal(
      [
        task({ goalId: "a", title: "Eight days", deadline: "2026-08-31" }),
        task({ goalId: "b", title: "A month", deadline: "2026-08-09" }),
        task({ goalId: "c", title: "Due today", deadline: TODAY }),
      ],
      TODAY,
    );
    expect(sections.flatMap((s) => s.tasks).map((t) => t.title)).toEqual([
      "A month",
      "Eight days",
      "Due today",
    ]);
  });
});

describe("a collapsed section still says what is inside it", () => {
  // A section that can be closed must state its contents, or closing hides
  // work rather than tidying it.
  it("counts what needs attention, and only the buckets that have anything", () => {
    const [section] = selectTodayByGoal(
      [
        task({ deadline: "2026-08-09" }),
        task({ deadline: "2026-08-31" }),
        task({ deadline: TODAY }),
        task({ startBy: TODAY }),
      ],
      TODAY,
    );
    expect(section!.summary).toBe("2 overdue · 1 due today · 1 to start");
    expect(section!.counts).toMatchObject({ overdue: 2, dueToday: 1, startNow: 1 });
  });

  it("returns everything eligible, so the count can exceed what is rendered", () => {
    const many = Array.from({ length: 9 }, () => task({ deadline: TODAY }));
    const [section] = selectTodayByGoal(many, TODAY);
    expect(section!.tasks).toHaveLength(9);
    expect(section!.summary).toBe("9 due today");
  });
});

describe("the numbers on a goal card count tasks and nothing else (§15, §4.10)", () => {
  const counted = (over: Partial<{ status: string; deadline: string | null; startBy: string | null }>) => ({
    status: "not_started",
    deadline: null,
    startBy: null,
    ...over,
  });

  it("is done over total", () => {
    expect(
      goalTaskCounts(
        [counted({ status: "done" }), counted({ status: "done" }), counted({}), counted({})],
        TODAY,
      ),
    ).toMatchObject({ total: 4, done: 2, percentComplete: 50 });
  });

  it("is 0 rather than NaN for a goal with no tasks yet", () => {
    expect(goalTaskCounts([], TODAY).percentComplete).toBe(0);
  });

  it("splits open work into overdue and due this week", () => {
    expect(
      goalTaskCounts(
        [
          counted({ deadline: "2026-08-09" }),
          counted({ startBy: "2026-09-01" }),
          counted({ deadline: TODAY }),
          counted({ deadline: "2026-09-14" }),
          counted({ deadline: "2026-09-30" }),
          counted({ status: "done", deadline: "2026-08-09" }),
        ],
        TODAY,
      ),
    ).toMatchObject({ overdue: 2, dueThisWeek: 2, done: 1, total: 6 });
  });

  /**
   * §4.10 — "Completing low-value tasks must not make a goal appear healthier
   * than it is." The ring is allowed to move because the card labels it as a
   * task count; what it must never do is claim to be the health verdict.
   */
  it("does not pretend to be Goal Health", () => {
    const counts = goalTaskCounts(
      [counted({ status: "done" }), counted({ deadline: "2026-08-09" })],
      TODAY,
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
    expect(goalIconFor({ short_label: "Zephyr" })).toBe("goal");
    expect(goalIconFor(null)).toBe("goal");
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
    expect(
      goalIconFor({
        short_label: "SAT 1450+",
        normalized_goal: "Reach 1450+ and strengthen college readiness.",
      }),
    ).toBe("book");
  });
});

describe("the date heading", () => {
  it("carries the weekday and the year, in the product's own convention", () => {
    // "Sept", not "Sep": en-GB, the same short month formatDayKey already uses
    // everywhere else. Two date conventions in one viewport is the bug.
    expect(formatWeekdayDayKey("2026-09-08")).toBe("Tuesday, 8 Sept 2026");
    expect(formatWeekdayDayKey(null)).toBe("");
  });

  it("does not move the day, whatever the server's clock says", () => {
    // A DayKey formatter, not a Date one. Formatting Date("2026-09-08") in a
    // western zone is how a heading renders the 7th.
    expect(formatWeekdayDayKey("2026-01-01")).toBe("Thursday, 1 Jan 2026");
  });
});

/**
 * The reason this file's scope is what it is.
 *
 * /today and /goals/[id] each described the same task, and before the two
 * branches were merged they described it differently: a task past its start
 * date read "8 days overdue" on one and "Past its start date" on the other.
 * Both screens now take the badge, the date and the order from the same
 * function, and this fails if a second engine is ever reintroduced.
 */
describe("both screens describe a task the same way", () => {
  it("takes the badge and the date from one engine", () => {
    const slipped = task({ startBy: "2026-08-31", deadline: "2026-09-30" });

    const onToday = selectTodayByGoal([slipped], TODAY)[0]!.tasks[0]!.urgency;
    const onGoalPage = selectGoalToday([slipped], TODAY).tasks[0]!.urgency;
    const direct = urgencyFor(slipped, TODAY)!;

    expect(onToday).toEqual(onGoalPage);
    expect(onToday).toEqual(direct);
    expect(onToday.label).toBe("Past its start date");
  });
});
