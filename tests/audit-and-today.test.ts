import { describe, expect, it } from "vitest";
import { detectGaps, selectTopGaps, type AuditInputs } from "@/lib/health/audit";
import { selectTodayCards, selectWaitingOn, type CandidateTask } from "@/lib/plan/today";

const NOW = new Date("2027-03-01T00:00:00.000Z");

function auditInputs(overrides: Partial<AuditInputs> = {}): AuditInputs {
  return {
    now: NOW,
    targetDate: new Date("2027-09-01T00:00:00.000Z"),
    successMeasures: ["Score at least 1400"],
    milestones: [],
    dependencies: [],
    evidenceRequired: [],
    evidenceProvided: [],
    unansweredCheckpoints: [],
    unresolvedBlocks: [],
    requiredMinutes: 0,
    availableMinutes: null,
    ...overrides,
  };
}

describe("What am I missing? (PRD §16)", () => {
  it("finds nothing wrong with a complete plan", () => {
    const gaps = detectGaps(
      auditInputs({
        milestones: [{ id: "m1", title: "Diagnostic", status: "not_started", taskCount: 3 }],
      }),
    );
    expect(gaps).toHaveLength(0);
  });

  /**
   * §16's closing requirement: "This feature must distinguish missing
   * requirements from merely unfinished tasks." A plan whose every task is
   * overdue but structurally complete has no gaps — the user can already see
   * overdue work on Today.
   */
  it("reports no gap when work is merely unfinished rather than missing", () => {
    const gaps = detectGaps(
      auditInputs({
        milestones: [
          { id: "m1", title: "Practice tests", status: "not_started", taskCount: 5 },
          { id: "m2", title: "Review", status: "in_progress", taskCount: 2 },
        ],
      }),
    );
    expect(gaps).toHaveLength(0);
  });

  it("flags a milestone that has nothing scheduled under it", () => {
    const gaps = detectGaps(
      auditInputs({
        milestones: [{ id: "m1", title: "Register for the exam", status: "not_started", taskCount: 0 }],
      }),
    );
    expect(gaps.map((g) => g.category)).toContain("milestone_without_work");
    expect(gaps[0]!.title).toContain("Register for the exam");
  });

  it("flags a person nobody is chasing", () => {
    const gaps = detectGaps(
      auditInputs({
        dependencies: [
          {
            externalParty: "Ms. Alvarez",
            taskTitle: "Ask for a recommendation letter",
            resolved: false,
            hasFollowUp: false,
            startBy: new Date("2027-04-01T00:00:00.000Z"),
          },
        ],
      }),
    );
    const gap = gaps.find((g) => g.category === "unchased_dependency");
    expect(gap).toBeDefined();
    expect(gap!.title).toContain("Ms. Alvarez");
  });

  it("treats an overdue dependency as more severe than an unchased one", () => {
    const overdue = detectGaps(
      auditInputs({
        dependencies: [
          {
            externalParty: "Ms. Alvarez",
            taskTitle: "Recommendation",
            resolved: false,
            hasFollowUp: true,
            startBy: new Date("2027-01-01T00:00:00.000Z"),
          },
        ],
      }),
    )[0]!;
    const pending = detectGaps(
      auditInputs({
        dependencies: [
          {
            externalParty: "Ms. Alvarez",
            taskTitle: "Recommendation",
            resolved: false,
            hasFollowUp: false,
            startBy: new Date("2027-06-01T00:00:00.000Z"),
          },
        ],
      }),
    )[0]!;
    expect(overdue.severity).toBeGreaterThan(pending.severity);
  });

  it("ignores a dependency that has already come back", () => {
    const gaps = detectGaps(
      auditInputs({
        dependencies: [
          {
            externalParty: "Ms. Alvarez",
            taskTitle: "Recommendation",
            resolved: true,
            hasFollowUp: false,
            startBy: new Date("2027-01-01T00:00:00.000Z"),
          },
        ],
      }),
    );
    expect(gaps).toHaveLength(0);
  });

  it("flags required evidence that nothing has produced", () => {
    const gaps = detectGaps(
      auditInputs({
        evidenceRequired: ["Written partner verification", "Signed consent form"],
        evidenceProvided: ["Signed consent form"],
      }),
    );
    const evidence = gaps.filter((g) => g.category === "missing_evidence");
    expect(evidence).toHaveLength(1);
    expect(evidence[0]!.title).toContain("Written partner verification");
  });

  it("flags a goal with no target date and no success measure", () => {
    const gaps = detectGaps(auditInputs({ targetDate: null, successMeasures: [] }));
    const categories = gaps.map((g) => g.category);
    expect(categories).toContain("missing_target_date");
    expect(categories).toContain("missing_success_measure");
  });

  it("flags a plan that needs more time than the calendar has", () => {
    const gaps = detectGaps(
      auditInputs({ requiredMinutes: 600, availableMinutes: 450 }),
    );
    expect(gaps.map((g) => g.category)).toContain("insufficient_capacity");
  });

  // §16 — "Return no more than: top 3 gaps."
  it("returns at most three gaps, most severe first", () => {
    const gaps = detectGaps(
      auditInputs({
        targetDate: null,
        successMeasures: [],
        milestones: [
          { id: "m1", title: "A", status: "not_started", taskCount: 0 },
          { id: "m2", title: "B", status: "not_started", taskCount: 0 },
        ],
        evidenceRequired: ["Proof"],
        evidenceProvided: [],
      }),
    );
    const top = selectTopGaps(gaps);
    expect(gaps.length).toBeGreaterThan(3);
    expect(top).toHaveLength(3);
    expect(top[0]!.severity).toBeGreaterThanOrEqual(top[1]!.severity);
    expect(top[1]!.severity).toBeGreaterThanOrEqual(top[2]!.severity);
  });
});

function task(overrides: Partial<CandidateTask> = {}): CandidateTask {
  return {
    id: crypto.randomUUID(),
    goalId: "goal-1",
    goalTitle: "Pass the SAT",
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

describe("Today selection (PRD §17, §4.5)", () => {
  // "Three important things beat 30 tasks."
  it("never shows more than three cards", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      task({ goalId: `goal-${i % 4}`, title: `Task ${i}` }),
    );
    expect(selectTodayCards(many, { now: NOW })).toHaveLength(3);
  });

  it("shows nothing when nothing is open", () => {
    expect(selectTodayCards([task({ status: "done" })], { now: NOW })).toHaveLength(0);
  });

  it("puts overdue work above work that isn't due yet", () => {
    const cards = selectTodayCards(
      [
        task({ goalId: "g1", title: "Later", startBy: new Date("2027-05-01T00:00:00.000Z") }),
        task({ goalId: "g2", title: "Overdue", startBy: new Date("2027-02-01T00:00:00.000Z") }),
      ],
      { now: NOW },
    );
    expect(cards[0]!.title).toBe("Overdue");
    expect(cards[0]!.reason).toContain("should already have started");
  });

  /**
   * §18 and §15 both care about a second goal drifting unnoticed, so spread
   * across goals comes before depth within one.
   */
  it("spreads across goals before giving one goal a second card", () => {
    const cards = selectTodayCards(
      [
        task({ goalId: "g1", title: "A", priority: 1 }),
        task({ goalId: "g1", title: "B", priority: 1 }),
        task({ goalId: "g2", title: "C", priority: 4 }),
      ],
      { now: NOW },
    );
    expect(new Set(cards.map((c) => c.goalId)).size).toBe(2);
  });

  it("backfills from one goal when there aren't enough goals to go round", () => {
    const cards = selectTodayCards(
      [
        task({ goalId: "g1", title: "A" }),
        task({ goalId: "g1", title: "B" }),
        task({ goalId: "g1", title: "C" }),
      ],
      { now: NOW },
    );
    expect(cards).toHaveLength(3);
  });

  // §13 — waiting on someone is real, but it isn't work the user can do today.
  it("demotes work that is blocked on another person", () => {
    const cards = selectTodayCards(
      [
        task({ goalId: "g1", title: "Blocked", priority: 1, blockedOnPerson: true }),
        task({ goalId: "g2", title: "Actionable", priority: 3 }),
      ],
      { now: NOW },
    );
    expect(cards[0]!.title).toBe("Actionable");
  });

  it("still surfaces blocked work separately so it can't be forgotten", () => {
    const waiting = selectWaitingOn([
      task({ title: "Chase Ms. Alvarez", blockedOnPerson: true }),
      task({ title: "Study" }),
    ]);
    expect(waiting).toHaveLength(1);
    expect(waiting[0]!.title).toBe("Chase Ms. Alvarez");
  });

  it("raises work whose check-in was never answered", () => {
    const cards = selectTodayCards(
      [
        task({ goalId: "g1", title: "Unknown", awaitingCheckpoint: true }),
        task({ goalId: "g2", title: "Quiet" }),
      ],
      { now: NOW },
    );
    expect(cards[0]!.title).toBe("Unknown");
    expect(cards[0]!.reason).toContain("doesn't know how this went");
  });

  it("gives every card a reason to show the user", () => {
    const cards = selectTodayCards([task({ rationale: "it unlocks the next module" })], {
      now: NOW,
    });
    expect(cards[0]!.reason).toBe("it unlocks the next module");
  });
});
