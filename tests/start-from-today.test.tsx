import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import {
  anchorDay,
  describeStartToday,
  isSafeStartToday,
  overdueTasks,
  planStartFromToday,
  type ShiftableTask,
} from "@/lib/plan/start-today";
import TodayScreen from "@/components/app/TodayScreen";
import { daysBetween } from "@/lib/time-zone";

// The button refreshes the route after the write lands. There is no app
// router in a server-render test, and the mock keeps the assertion on the
// markup rather than on Next's internals.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

/**
 * The overdue wall.
 *
 * /today opened with "33 things are past the date Vezri worked back to." A
 * number that size is not information a person can act on; it is a measure of
 * how far behind they are, delivered before anything else on the screen, every
 * morning. §4.6 rules that out and §4.5 rules out the twelve rows that
 * followed it.
 *
 * What replaced it: no count anywhere, at most three cards, one line and one
 * button. These tests are about the button doing what the line says — and
 * about the count not coming back.
 */

const TODAY = "2026-09-13";

const task = (overrides: Partial<ShiftableTask> = {}): ShiftableTask => ({
  id: "t1",
  goalId: "g1",
  title: "Task",
  status: "not_started",
  deadline: null,
  startBy: null,
  ...overrides,
});

/** A plan written for a start six weeks ago, with its own internal spacing. */
const LATE_PLAN: ShiftableTask[] = [
  task({ id: "a", deadline: "2026-08-01" }),
  task({ id: "b", deadline: "2026-08-08" }),
  task({ id: "c", deadline: "2026-08-29" }),
];

describe("what counts as late", () => {
  it("judges a task by its deadline, and only then by its start date", () => {
    // The same precedence lib/plan/goal-today uses for the badge. Two modules
    // disagreeing about this is how one row read "8 days overdue" on one
    // screen and "Past its start date" on another.
    expect(anchorDay(task({ deadline: "2026-09-20", startBy: "2026-08-01" }))).toBe("2026-09-20");
    expect(anchorDay(task({ startBy: "2026-08-01" }))).toBe("2026-08-01");
    expect(anchorDay(task())).toBeNull();
  });

  it("leaves work whose story is over alone", () => {
    for (const status of ["done", "skipped"]) {
      expect(overdueTasks([task({ status, deadline: "2026-01-01" })], TODAY), status).toEqual([]);
    }
  });

  /**
   * This used to filter on OPEN_TASK_STATUSES, which is the set that answers
   * "does this belong on today's list" — it excludes `blocked` and `not_done`.
   * So the two states a person reaches by telling Vezri something went wrong
   * were the two the "start my plan from today" button refused to move, and
   * their dates stayed in August while everything around them slid forward.
   * See tests/task-state.test.ts for the same rule asserted over the whole
   * enum, per route.
   */
  it("moves work that is stuck or was not done, which is most of why the button exists", () => {
    for (const status of ["blocked", "not_done", "in_progress", "unconfirmed", "not_started"]) {
      expect(
        overdueTasks([task({ status, deadline: "2026-01-01" })], TODAY).map((t) => t.status),
        status,
      ).toEqual([status]);
    }
  });

  it("leaves work that is not late alone", () => {
    expect(overdueTasks([task({ deadline: TODAY })], TODAY)).toEqual([]);
    expect(overdueTasks([task({ deadline: "2026-12-01" })], TODAY)).toEqual([]);
    expect(overdueTasks([task()], TODAY)).toEqual([]);
  });
});

describe("starting the plan from today", () => {
  it("puts the oldest thing on today", () => {
    const plan = planStartFromToday({ tasks: LATE_PLAN, today: TODAY })!;
    expect(plan.oldestDay).toBe("2026-08-01");
    expect(plan.moves.find((move) => move.id === "a")!.deadline!.to).toBe(TODAY);
  });

  /**
   * The whole design, in one assertion. One delta for everything is what makes
   * this a slide rather than a reshape: a plan written for four weeks stays a
   * plan for four weeks, and the author's spacing survives.
   */
  it("keeps the gaps exactly as the plan wrote them", () => {
    const plan = planStartFromToday({ tasks: LATE_PLAN, today: TODAY })!;
    const to = Object.fromEntries(plan.moves.map((move) => [move.id, move.deadline!.to]));

    expect(daysBetween("2026-08-01", "2026-08-08")).toBe(daysBetween(to.a, to.b));
    expect(daysBetween("2026-08-08", "2026-08-29")).toBe(daysBetween(to.b, to.c));
  });

  it("moves a start date by the same delta, so the lead time survives", () => {
    const plan = planStartFromToday({
      tasks: [task({ deadline: "2026-08-15", startBy: "2026-08-01" })],
      today: TODAY,
    })!;
    const [move] = plan.moves;
    expect(daysBetween(move.deadline!.from, move.deadline!.to)).toBe(plan.shiftDays);
    expect(daysBetween(move.startBy!.from, move.startBy!.to)).toBe(plan.shiftDays);
  });

  it("gives a start-only task a start date and never invents a deadline", () => {
    // §7 — a deadline is a commitment the plan stated. Inventing one because a
    // task happens to be late would be Vezri writing a date into someone's
    // plan that nobody agreed to.
    const plan = planStartFromToday({ tasks: [task({ startBy: "2026-08-01" })], today: TODAY })!;
    expect(plan.moves[0]!.deadline).toBeNull();
    expect(plan.moves[0]!.startBy!.to).toBe(TODAY);
  });

  it("leaves future work exactly where it is", () => {
    // A date someone else set — a submission window, a competition deadline —
    // is not Vezri's to move, and those are the ones still ahead.
    const plan = planStartFromToday({
      tasks: [...LATE_PLAN, task({ id: "future", deadline: "2026-11-01" })],
      today: TODAY,
    })!;
    expect(plan.moves.map((move) => move.id)).toEqual(["a", "b", "c"]);
  });

  it("does nothing at all when nothing is late", () => {
    expect(planStartFromToday({ tasks: [task({ deadline: "2026-12-01" })], today: TODAY })).toBeNull();
    expect(planStartFromToday({ tasks: [], today: TODAY })).toBeNull();
  });

  it("names every goal it touched, so their reminders can be rebuilt", () => {
    const plan = planStartFromToday({
      tasks: [
        task({ id: "a", goalId: "g1", deadline: "2026-08-01" }),
        task({ id: "b", goalId: "g2", deadline: "2026-08-05" }),
        task({ id: "c", goalId: "g1", deadline: "2026-08-09" }),
      ],
      today: TODAY,
    })!;
    expect(plan.goalIds.sort()).toEqual(["g1", "g2"]);
  });
});

describe("the guard before anything is written", () => {
  it("accepts the plan it computed", () => {
    const plan = planStartFromToday({ tasks: LATE_PLAN, today: TODAY })!;
    expect(isSafeStartToday(plan, TODAY)).toBe(true);
  });

  it("refuses a date left in the past", () => {
    const plan = planStartFromToday({ tasks: LATE_PLAN, today: TODAY })!;
    plan.moves[0]!.deadline!.to = "2026-08-01";
    expect(isSafeStartToday(plan, TODAY)).toBe(false);
  });

  it("refuses a move that changed a gap", () => {
    // A gap that changed means the plan was re-shaped rather than slid, and
    // re-shaping is the thing /api/goals/[id]/reshape makes the user approve.
    const plan = planStartFromToday({ tasks: LATE_PLAN, today: TODAY })!;
    plan.moves[1]!.deadline!.to = "2026-12-25";
    expect(isSafeStartToday(plan, TODAY)).toBe(false);
  });
});

describe("what the button says about itself", () => {
  it("names the change without naming how late anything was", () => {
    const plan = planStartFromToday({ tasks: LATE_PLAN, today: TODAY })!;
    const summary = describeStartToday(plan);
    expect(summary).toContain("3 tasks moved forward");
    expect(summary).toContain("keeping the same gaps");
    for (const word of ["overdue", "behind", "late", "past"]) {
      expect(summary.toLowerCase(), word).not.toContain(word);
    }
  });
});

/* ---------------------------------------------------------------------------
 * The screen.
 * ------------------------------------------------------------------------- */

const html = (node: React.ReactElement) => renderToStaticMarkup(node);
const text = (markup: string) => markup.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

const screen = (planBehind: boolean) =>
  html(
    <TodayScreen
      dateLabel="Sunday 13 September"
      greeting="Good morning"
      firstName="Aastha"
      hasGoals
      planBehind={planBehind}
      tasks={[]}
      waitingOn={[]}
    />,
  );

describe("the count is gone", () => {
  it("says nothing about how many things are past their date", () => {
    const markup = text(screen(true));
    expect(markup).not.toContain("past the date");
    expect(markup).not.toMatch(/\d+\s+things/);
  });

  /**
   * Asserted at the source, not only in the markup: the count reached the
   * screen as a prop, and a prop that still exists is one a later change can
   * render again. TodayScreen takes a boolean now and cannot say a number it
   * was never given.
   */
  it("is not even passed to the screen any more", () => {
    const source = readFileSync("src/components/app/TodayScreen.tsx", "utf8");
    expect(source).not.toContain("behindCount");
    const page = readFileSync("src/app/(app)/today/page.tsx", "utf8");
    expect(page).not.toContain("behindCount");
  });

  it("offers one line and one button when something is late", () => {
    const markup = screen(true);
    expect(text(markup)).toContain("Start my plan from today");
    // ONE button in the notice. Two would be a decision to make before the
    // day has started.
    const notice = markup.slice(0, markup.indexOf("Nothing needs you today"));
    expect(notice.match(/<button/g)).toHaveLength(1);
  });

  it("offers nothing at all when nothing is late", () => {
    expect(text(screen(false))).not.toContain("Start my plan from today");
  });

  it("still points at the screen the rest of the work lives on", () => {
    expect(screen(true)).toContain('href="/goals"');
  });
});
