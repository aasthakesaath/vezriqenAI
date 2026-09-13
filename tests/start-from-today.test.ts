import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  anchorDay,
  isSafeSlide,
  overdueTasks,
  planSlideToToday,
} from "@/lib/plan/start-today";
import { capTodaySections, selectTodayByGoal, type CrossGoalTask } from "@/lib/plan/goal-today";

/**
 * The overdue wall, and the button that replaced it.
 *
 * The screen opened with "33 things are past the date Vezri worked back to."
 * A number nobody can act on, at the top of the page, growing with how badly
 * the month went. It is gone, and so is the per-goal version of it.
 *
 * What is here instead: three rows, and — when something is behind — one line
 * and one button that slides the open work forward as a single block, so the
 * oldest piece lands on today and every gap between the pieces survives.
 */

const TODAY = "2026-09-13";

const task = (id: string, deadline: string | null, startBy: string | null = null) => ({
  id,
  deadline,
  startBy,
});

describe("which work counts as behind", () => {
  it("judges a task by its deadline when it has one", () => {
    expect(anchorDay(task("a", "2026-09-01", "2026-08-01"))).toBe("2026-09-01");
  });

  it("falls back to the start-by day when there is no deadline", () => {
    expect(anchorDay(task("a", null, "2026-08-01"))).toBe("2026-08-01");
  });

  it("leaves a task whose deadline is still ahead alone, however old its start date", () => {
    // This is the case that makes the rule worth stating. A task that should
    // have STARTED three weeks ago but is not due until December is not
    // overdue, and sliding it would push a deadline that has not arrived.
    const notYet = task("a", "2026-12-01", "2026-08-20");
    expect(overdueTasks([notYet], TODAY)).toEqual([]);
    expect(planSlideToToday({ tasks: [notYet], today: TODAY })).toBeNull();
  });

  it("counts nothing when the plan is on time", () => {
    expect(planSlideToToday({ tasks: [task("a", TODAY), task("b", "2026-10-01")], today: TODAY }))
      .toBeNull();
  });
});

describe("the slide", () => {
  it("lands the oldest piece on today", () => {
    const plan = planSlideToToday({
      tasks: [task("a", "2026-08-14"), task("b", "2026-08-20"), task("c", "2026-09-02")],
      today: TODAY,
    })!;

    expect(plan.oldestDay).toBe("2026-08-14");
    expect(plan.offsetDays).toBe(30);
    expect(plan.moves.find((move) => move.id === "a")!.toDeadline).toBe(TODAY);
  });

  it("keeps the gaps between tasks exactly as they were", () => {
    // Six days between a and b, thirteen between b and c. Same after.
    const plan = planSlideToToday({
      tasks: [task("a", "2026-08-14"), task("b", "2026-08-20"), task("c", "2026-09-02")],
      today: TODAY,
    })!;

    const landed = Object.fromEntries(plan.moves.map((move) => [move.id, move.toDeadline!]));
    expect(landed).toEqual({
      a: "2026-09-13",
      b: "2026-09-19",
      c: "2026-10-02",
    });
  });

  it("moves the lead time with the task rather than recomputing it", () => {
    // A task needing a fortnight's run-up still has one afterwards. reshape.ts
    // recalculates start_by because its deadlines move by DIFFERENT amounts;
    // a rigid translation must not.
    const plan = planSlideToToday({
      tasks: [task("a", "2026-08-14", "2026-07-31")],
      today: TODAY,
    })!;
    const move = plan.moves[0];
    expect(move.toStartBy).toBe("2026-08-30");
    expect(move.toDeadline).toBe(TODAY);
  });

  it("slides a task that has only a start-by day", () => {
    const plan = planSlideToToday({ tasks: [task("a", null, "2026-09-08")], today: TODAY })!;
    expect(plan.moves[0].toStartBy).toBe(TODAY);
    expect(plan.moves[0].toDeadline).toBeNull();
  });

  it("does not touch anything dated today or later", () => {
    const plan = planSlideToToday({
      tasks: [task("a", "2026-09-01"), task("b", TODAY), task("c", "2026-11-30")],
      today: TODAY,
    })!;
    // A date somebody else set — a submission window, a competition deadline —
    // is not Vezri's to move (§14).
    expect(plan.moves.map((move) => move.id)).toEqual(["a"]);
  });

  it("deletes nothing and completes nothing", () => {
    // The plan is a list of date changes and holds no other verb. Asserted
    // because "tidy up the ones that are really old" is the obvious next
    // suggestion and it is the one thing this button must never do.
    const plan = planSlideToToday({ tasks: [task("a", "2026-08-01")], today: TODAY })!;
    for (const move of plan.moves) {
      expect(Object.keys(move).sort()).toEqual([
        "fromDeadline",
        "fromStartBy",
        "id",
        "toDeadline",
        "toStartBy",
      ]);
    }
  });
});

describe("the guard in front of the write", () => {
  const plan = planSlideToToday({
    tasks: [task("a", "2026-08-14"), task("b", "2026-09-02")],
    today: TODAY,
  })!;

  it("passes a slide that lands the oldest on today and nothing before it", () => {
    expect(isSafeSlide(plan, TODAY)).toBe(true);
  });

  it("refuses a slide that leaves the oldest piece in the past", () => {
    const short = { ...plan, moves: plan.moves.map((m) => ({ ...m, toDeadline: "2026-09-01" })) };
    expect(isSafeSlide(short, TODAY)).toBe(false);
  });

  it("refuses a slide that lands nothing on today at all", () => {
    const late = { ...plan, moves: plan.moves.map((m) => ({ ...m, toDeadline: "2026-09-20" })) };
    expect(isSafeSlide(late, TODAY)).toBe(false);
  });
});

/* ---------------------------------------------------------------------------
 * Three things on the screen, and the rest behind the goals page.
 * ------------------------------------------------------------------------ */

let seq = 0;
function crossGoal(overrides: Partial<CrossGoalTask> = {}): CrossGoalTask {
  seq += 1;
  return {
    id: `t-${seq}`,
    title: `Task ${seq}`,
    rationale: null,
    taskType: "deep_work",
    status: "not_started",
    priority: 3,
    deadline: "2026-08-01",
    startBy: null,
    estimatedMinutes: 30,
    milestoneTitle: null,
    waitingOn: null,
    goalId: "g1",
    goalLabel: "A goal",
    goalTitle: "A goal",
    ...overrides,
  };
}

describe("§4.5 across the screen, not per goal", () => {
  const manyGoals = () =>
    selectTodayByGoal(
      ["g1", "g2", "g3", "g4"].flatMap((goalId) =>
        Array.from({ length: 12 }, () => crossGoal({ goalId, goalLabel: goalId })),
      ),
      TODAY,
    );

  it("shows three tasks in total, however many goals are behind", () => {
    const { sections } = capTodaySections(manyGoals());
    const shown = sections.flatMap((section) => section.tasks);
    expect(shown).toHaveLength(3);
  });

  it("gives three different goals a row before any goal gets a second", () => {
    // The reason lib/plan/today.ts already gives for the same choice: three
    // rows from one goal hides a second goal drifting entirely.
    const { sections } = capTodaySections(manyGoals());
    expect(sections).toHaveLength(3);
    expect(sections.every((section) => section.tasks.length === 1)).toBe(true);
  });

  it("gives one goal a second row when there are fewer goals than slots", () => {
    const twoGoals = selectTodayByGoal(
      ["g1", "g2"].flatMap((goalId) =>
        Array.from({ length: 4 }, () => crossGoal({ goalId, goalLabel: goalId })),
      ),
      TODAY,
    );
    const { sections } = capTodaySections(twoGoals);
    expect(sections.flatMap((section) => section.tasks)).toHaveLength(3);
    expect(sections.map((section) => section.tasks.length).sort()).toEqual([1, 2]);
  });

  it("says there is more without saying how much more", () => {
    // "and 30 more" is the overdue wall in a smaller font.
    expect(capTodaySections(manyGoals()).hasMore).toBe(true);
    const two = selectTodayByGoal([crossGoal(), crossGoal()], TODAY);
    expect(capTodaySections(two).hasMore).toBe(false);
  });

  it("drops a section it took nothing from rather than drawing an empty heading", () => {
    const { sections } = capTodaySections(manyGoals());
    expect(sections.every((section) => section.tasks.length > 0)).toBe(true);
  });

  it("keeps the most pressing section first", () => {
    const ordered = selectTodayByGoal(
      [
        crossGoal({ goalId: "calm", deadline: TODAY }),
        crossGoal({ goalId: "urgent", priority: 1, deadline: "2026-07-01" }),
      ],
      TODAY,
    );
    const { sections } = capTodaySections(ordered);
    expect(sections[0].goalId).toBe("urgent");
  });
});

/* ---------------------------------------------------------------------------
 * The screen and the route agree about what "behind" means.
 * ------------------------------------------------------------------------ */
describe("the button is offered exactly when it would do something", () => {
  const page = readFileSync(join(process.cwd(), "src/app/(app)/today/page.tsx"), "utf8");
  const route = readFileSync(
    join(process.cwd(), "src/app/api/tasks/start-today/route.ts"),
    "utf8",
  );

  it("asks the same module the route asks", () => {
    expect(page).toContain('from "@/lib/plan/start-today"');
    expect(page).toContain("overdueTasks(tasks, today)");
    expect(route).toContain('from "@/lib/plan/start-today"');
  });

  it("counts nothing on the page", () => {
    const screen = readFileSync(
      join(process.cwd(), "src/components/app/TodayScreen.tsx"),
      "utf8",
    );
    // Comments stripped first. The comment explaining what this screen used to
    // say quotes the sentence being removed, and that record is worth keeping.
    const rendered = screen.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(rendered).not.toContain("behindCount");
    expect(rendered).not.toContain("past the date");
    // A boolean, never a number: the prop cannot carry a count even by accident.
    expect(page).toContain("hasOverdue={");
    expect(screen).toContain("hasOverdue: boolean");
  });

  it("checks the session and refuses to move anything for a stranger", () => {
    expect(route).toContain("auth.getUser()");
    expect(route).toContain('.eq("user_id", user.id)');
  });

  it("writes no deletion and no completion", () => {
    expect(route).not.toContain(".delete()");
    expect(route).not.toContain('status: "done"');
    expect(route).not.toContain("completed_at");
  });

  it("rebuilds the reminders that were derived from the old dates", () => {
    // A "fixed" plan that keeps notifying about last month is not fixed.
    expect(route).toContain("scheduleRemindersForGoal");
  });

  it("records the change with what it was based on (§20)", () => {
    expect(route).toContain("ai_action_logs");
    expect(route).toContain("start_plan_from_today");
  });
});
