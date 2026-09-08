import { describe, expect, it } from "vitest";
import {
  describePastPlan,
  inspectPlanDates,
  isSafeReshape,
  proposeReshape,
  type PlannedItem,
} from "@/lib/plan/reshape";
import { backlogSummary, selectTodayCards, type CandidateTask } from "@/lib/plan/today";

/**
 * A plan that arrived already behind (PRD §14).
 *
 * The real case this comes from: a plan with a 23 August start and a 4
 * September gate, uploaded on 8 September. Every card said "this should
 * already have started" and nothing else happened — thirty-four separate
 * reproaches instead of one fact and an offer.
 */

const TODAY = "2026-09-08";
const TARGET = "2026-12-31";

/** Shaped like the plan that exposed this: some past, some ahead, some undated. */
function plan(): PlannedItem[] {
  const past = ["2026-08-14", "2026-08-23", "2026-08-28", "2026-09-01", "2026-09-04", "2026-09-04"];
  const ahead = ["2026-09-30", "2026-10-26", "2026-11-19", "2026-12-31"];
  const undated = 4;

  return [
    ...past.map((date, i) => ({ id: `past-${i}`, title: `Past ${i}`, date, done: false })),
    ...ahead.map((date, i) => ({ id: `ahead-${i}`, title: `Ahead ${i}`, date, done: false })),
    ...Array.from({ length: undated }, (_, i) => ({
      id: `undated-${i}`,
      title: `Undated ${i}`,
      date: null,
      done: false,
    })),
  ];
}

describe("noticing that a plan is behind", () => {
  it("counts what is past, once, instead of flagging every card", () => {
    const report = inspectPlanDates({ items: plan(), today: TODAY });
    expect(report).toMatchObject({
      total: 14,
      pastCount: 6,
      undatedCount: 4,
      earliestDate: "2026-08-14",
      isBehind: true,
    });
  });

  it("says it in one plain sentence, naming the month the plan was built for", () => {
    const report = inspectPlanDates({ items: plan(), today: TODAY });
    expect(describePastPlan(report)).toBe(
      "This plan was written for a start in August. 6 of 14 milestones are already past.",
    );
    // No blame, no imperative, no exclamation — §4.
    expect(describePastPlan(report)).not.toMatch(/should|failed|behind schedule|!/i);
  });

  it("does not cry wolf over a plan that is simply ahead of itself", () => {
    const ahead = [{ id: "a", title: "Later", date: "2026-11-01", done: false }];
    const report = inspectPlanDates({ items: ahead, today: TODAY });
    expect(report.isBehind).toBe(false);
    expect(proposeReshape({ milestones: ahead, tasks: [], today: TODAY, targetDate: TARGET })).toBeNull();
  });

  it("ignores past work that is already done", () => {
    const finished = [{ id: "d", title: "Done", date: "2026-08-01", done: true }];
    expect(inspectPlanDates({ items: finished, today: TODAY }).isBehind).toBe(false);
  });
});

describe("the offer", () => {
  const milestones = plan();
  const proposal = proposeReshape({ milestones, tasks: [], today: TODAY, targetDate: TARGET })!;

  it("moves the past work and nothing else", () => {
    expect(proposal.milestoneMoves).toHaveLength(6);
    expect(proposal.milestoneMoves.map((m) => m.id)).toEqual([
      "past-0", "past-1", "past-2", "past-3", "past-4", "past-5",
    ]);
    // The four still ahead keep their dates: a submission window or a
    // competition deadline is not Vezri's to move.
    expect(proposal.keptCount).toBe(4);
  });

  it("keeps the target date, which is the whole §14 rule", () => {
    expect(proposal.targetDate).toBe(TARGET);
    expect(isSafeReshape(proposal, TARGET, TODAY)).toBe(true);
    for (const move of proposal.milestoneMoves) {
      expect(move.to <= TARGET).toBe(true);
      expect(move.to >= TODAY).toBe(true);
    }
  });

  it("spreads the work forward in order rather than piling it on one day", () => {
    const dates = proposal.milestoneMoves.map((m) => m.to);
    expect([...dates].sort()).toEqual(dates); // order preserved
    expect(new Set(dates).size).toBeGreaterThan(1); // genuinely spread
    expect(dates.at(-1)! <= "2026-09-30").toBe(true); // inside the next fixed date
  });

  it("carries a milestone's tasks along with it, and leaves the rest alone", () => {
    const tasks: PlannedItem[] = [
      { id: "t1", title: "Task on a moved milestone", date: "2026-08-20", done: false, milestoneId: "past-1" },
      { id: "t2", title: "Task on a milestone that did not move", date: "2026-10-20", done: false, milestoneId: "ahead-1" },
      { id: "t3", title: "Task already finished", date: "2026-08-20", done: true, milestoneId: "past-1" },
    ];
    const withTasks = proposeReshape({ milestones, tasks, today: TODAY, targetDate: TARGET })!;
    expect(withTasks.taskMoves.map((t) => t.id)).toEqual(["t1"]);
    expect(withTasks.taskMoves[0].to > TODAY).toBe(true);
  });

  it("refuses to reshape a goal whose target date has itself passed", () => {
    expect(
      proposeReshape({ milestones, tasks: [], today: TODAY, targetDate: "2026-01-01" }),
    ).toBeNull();
  });

  it("rejects a proposal that moved the goalposts", () => {
    const tampered = { ...proposal, targetDate: "2027-06-30" };
    expect(isSafeReshape(tampered, TARGET, TODAY)).toBe(false);

    const overshoot = {
      ...proposal,
      milestoneMoves: [{ id: "x", title: "x", from: "2026-08-01", to: "2027-01-15" }],
    };
    expect(isSafeReshape(overshoot, TARGET, TODAY)).toBe(false);
  });
});

describe("what the user sees instead of a wall of overdue cards", () => {
  /** The tasks under a plan whose start dates have all gone. */
  const overdueTasks: CandidateTask[] = Array.from({ length: 34 }, (_, i) => ({
    id: `t${i}`,
    goalId: "g1",
    goalTitle: "Turn Caly Cares into a documented, verified programme by 31 December 2026",
    title: `Step ${i}`,
    rationale: i % 2 === 0 ? `it unlocks step ${i + 1}` : null,
    taskType: i % 3 === 0 ? "external_dependency" : "deep_work",
    priority: 2,
    deadline: null,
    startBy: new Date("2026-08-20T00:00:00Z"),
    estimatedMinutes: 60,
    status: "not_started",
    awaitingCheckpoint: false,
    blockedOnPerson: false,
  }));

  const now = new Date("2026-09-08T15:00:00Z");
  const timeZone = "America/Chicago";

  it("says the plan is behind once, at the top, and never on a card", () => {
    const backlog = backlogSummary(overdueTasks, { now, timeZone });
    expect(backlog.planBehind).toBe(true);
    expect(backlog.behindCount).toBe(34);

    const cards = selectTodayCards(overdueTasks, { now, timeZone });
    expect(cards).toHaveLength(3); // §17 — three, not thirty-four
    for (const card of cards) {
      expect(card.reason).not.toMatch(/should already have started/);
    }
  });

  it("turns those same dates into one offer with a fixed target", () => {
    const milestones: PlannedItem[] = overdueTasks.map((task) => ({
      id: task.id,
      title: task.title,
      date: "2026-08-20",
      done: false,
    }));

    const report = inspectPlanDates({ items: milestones, today: TODAY });
    expect(describePastPlan(report)).toBe(
      "This plan was written for a start in August. 34 of 34 milestones are already past.",
    );

    const proposal = proposeReshape({ milestones, tasks: [], today: TODAY, targetDate: TARGET })!;
    expect(proposal.milestoneMoves).toHaveLength(34);
    expect(proposal.targetDate).toBe(TARGET);
    expect(isSafeReshape(proposal, TARGET, TODAY)).toBe(true);
    // Spread across the runway that is left, not stacked on today.
    expect(new Set(proposal.milestoneMoves.map((m) => m.to)).size).toBeGreaterThan(20);
  });
});
