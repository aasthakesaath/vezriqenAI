import { describe, expect, it } from "vitest";
import { calculateStartBy, planReminders } from "@/lib/plan/lead-time";
import { selectTodayCards, selectWaitingOn, type CandidateTask } from "@/lib/plan/today";
import { calculateHealth } from "@/lib/health/score";
import { detectGaps, selectTopGaps } from "@/lib/health/audit";
import { calculateImpact, isSafeReplan } from "@/lib/coach/replan";
import { INTERVENTIONS_FOR, fallbackIntervention } from "@/lib/coach/interventions";
import { CHECKIN_ACTIONS } from "@/lib/app-copy";
import { verifyProvenance } from "@/lib/ai/schemas";

/**
 * PRD §25 Core Acceptance Tests, A through E.
 *
 * These drive the real engines rather than mocks. The extraction half of each
 * scenario is covered separately by the live model tests; what is asserted here
 * is the behaviour §25 describes once a plan exists — which is the part that
 * must hold whether or not the model is available.
 */

const NOW = new Date("2027-03-01T09:00:00.000Z");

function task(overrides: Partial<CandidateTask> = {}): CandidateTask {
  return {
    id: crypto.randomUUID(),
    goalId: "goal",
    goalTitle: "Goal",
    title: "Task",
    rationale: null,
    taskType: "simple_action",
    priority: 3,
    deadline: null,
    startBy: null,
    estimatedMinutes: 30,
    status: "not_started",
    awaitingCheckpoint: false,
    blockedOnPerson: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
describe("§25.A — seven-day morning routine", () => {
  const routineStart = new Date("2027-03-02T06:30:00.000Z");

  it("creates a night-before heads-up and a morning checkpoint", () => {
    const reminders = planReminders({
      startBy: routineStart,
      deadline: routineStart,
      taskType: "routine_habit",
      priority: 2,
    });

    const headsUp = reminders.find((r) => r.type === "heads_up");
    const checkpoint = reminders.find((r) => r.type === "action_checkpoint");

    expect(headsUp).toBeDefined();
    expect(checkpoint).toBeDefined();
    // Prep the night before, action check on the day.
    expect(headsUp!.scheduledAt.getTime()).toBeLessThan(checkpoint!.scheduledAt.getTime());
    expect(checkpoint!.responseRequired).toBe(true);
  });

  it("offers the full response set the user needs to report what happened", () => {
    expect(CHECKIN_ACTIONS.map((a) => a.id)).toEqual([
      "done",
      "partial",
      "not_done",
      "snoozed",
      "stuck",
      "waiting_on_someone",
    ]);
  });

  /** "A missed morning does not automatically fail the goal." */
  it("does not fail the goal when one morning is missed", () => {
    const health = calculateHealth({
      now: NOW,
      targetDate: new Date("2027-03-08T00:00:00.000Z"),
      activatedAt: new Date("2027-03-01T00:00:00.000Z"),
      milestones: [{ weight: 3, status: "not_started", targetDate: null }],
      tasks: [
        { status: "not_done", priority: 3, deadline: null, startBy: null, estimatedMinutes: 20 },
        ...Array.from({ length: 5 }, () => ({
          status: "done",
          priority: 3,
          deadline: null,
          startBy: null,
          estimatedMinutes: 20,
        })),
      ],
      unansweredCheckpoints: [],
      overdueDependencies: 0,
      evidenceRequired: 0,
      evidenceProvided: 0,
      availableMinutes: null,
    });

    expect(health.status).not.toBe("off_track");
    expect(health.score).toBeGreaterThan(40);
  });

  /** "Vezri proposes the smallest recovery plan." */
  it("treats a single missed low-priority morning as a minor change", () => {
    const impact = calculateImpact({
      now: NOW,
      targetDate: new Date("2027-03-08T00:00:00.000Z"),
      missedTask: {
        title: "Morning routine",
        deadline: new Date("2027-02-28T06:30:00.000Z"),
        startBy: null,
        estimatedMinutes: 20,
        milestoneId: null,
        priority: 4,
      },
      dependentTaskCount: 0,
      milestone: null,
      remainingMinutes: 120,
      availableMinutes: null,
    });
    expect(impact.severity).toBe("minor");
  });
});

// ---------------------------------------------------------------------------
describe("§25.B — recommendation letter", () => {
  const applicationDue = new Date("2027-11-01T00:00:00.000Z");

  /** "It proposes a start-by date well before the hard deadline." */
  it("starts the ask weeks before the application is due", () => {
    const result = calculateStartBy({
      taskType: "external_dependency",
      deadline: applicationDue,
      estimatedMinutes: 20,
      dependencyCount: 0,
    });

    expect(result.startBy).not.toBeNull();
    const daysEarly =
      (applicationDue.getTime() - result.startBy!.getTime()) / (24 * 60 * 60 * 1000);
    expect(daysEarly).toBeGreaterThanOrEqual(21);
  });

  it("explains why it starts that early", () => {
    const result = calculateStartBy({
      taskType: "external_dependency",
      deadline: applicationDue,
      estimatedMinutes: null,
      dependencyCount: 0,
    });
    expect(result.reason).toContain("someone else");
  });

  it("starts the ask earlier than the user's own preparation", () => {
    const ask = calculateStartBy({
      taskType: "external_dependency",
      deadline: applicationDue,
      estimatedMinutes: 20,
      dependencyCount: 0,
    });
    const prep = calculateStartBy({
      taskType: "simple_action",
      deadline: applicationDue,
      estimatedMinutes: 45,
      dependencyCount: 0,
    });
    expect(ask.startBy!.getTime()).toBeLessThan(prep.startBy!.getTime());
  });

  /** "If user says 'Waiting on someone', Vezri advances other independent work." */
  it("advances independent work when the user is waiting on someone", () => {
    const cards = selectTodayCards(
      [
        task({ goalId: "g1", title: "Chase Ms. Alvarez", priority: 1, blockedOnPerson: true }),
        task({ goalId: "g1", title: "Draft personal statement", priority: 3 }),
      ],
      { now: NOW },
    );

    expect(cards.map((c) => c.title)).toContain("Draft personal statement");
    expect(cards.map((c) => c.title)).not.toContain("Chase Ms. Alvarez");

    // Still visible, just not competing for a priority slot.
    const waiting = selectWaitingOn([
      task({ title: "Chase Ms. Alvarez", blockedOnPerson: true }),
    ]);
    expect(waiting).toHaveLength(1);
  });

  it("proposes a follow-up rather than a reschedule when blocked on a person", () => {
    const intervention = fallbackIntervention(
      "waiting_on_someone",
      "Recommendation letter",
      "Ms. Alvarez",
    );
    expect(intervention.intervention_type).toBe("follow_up_other_person");
    expect(INTERVENTIONS_FOR.waiting_on_someone).not.toContain("reschedule_window");
  });
});

// ---------------------------------------------------------------------------
describe("§25.C — certification", () => {
  /** "After missed sessions, it recalculates whether the target remains achievable." */
  it("keeps the target achievable while the exam date is ahead", () => {
    const impact = calculateImpact({
      now: NOW,
      targetDate: new Date("2027-08-01T00:00:00.000Z"),
      missedTask: {
        title: "Study session 4",
        deadline: new Date("2027-02-24T00:00:00.000Z"),
        startBy: null,
        estimatedMinutes: 120,
        milestoneId: "m1",
        priority: 2,
      },
      dependentTaskCount: 0,
      milestone: {
        title: "Study modules",
        targetDate: new Date("2027-06-01T00:00:00.000Z"),
        openTaskCount: 6,
      },
      remainingMinutes: 1800,
      availableMinutes: null,
    });

    expect(impact.targetStillAchievable).toBe(true);
    expect(impact.daysBehind).toBeGreaterThan(0);
    // Priority-2 work slipping is material — the user gets asked.
    expect(impact.requiresConfirmation).toBe(true);
  });

  it("reports the target unachievable once the exam date has passed", () => {
    const impact = calculateImpact({
      now: NOW,
      targetDate: new Date("2027-02-01T00:00:00.000Z"),
      missedTask: {
        title: "Study session 4",
        deadline: new Date("2027-01-20T00:00:00.000Z"),
        startBy: null,
        estimatedMinutes: 120,
        milestoneId: null,
        priority: 2,
      },
      dependentTaskCount: 0,
      milestone: null,
      remainingMinutes: 600,
      availableMinutes: null,
    });
    expect(impact.targetStillAchievable).toBe(false);
  });

  /** "It proposes a recovery plan rather than blindly stacking missed hours." */
  it("refuses any recovery that moves the exam date", () => {
    expect(
      isSafeReplan({
        consequence: "Push the exam back.",
        changes: [{ kind: "reduce_scope", description: "New date" }],
        keeps_target_date: false,
        reasoning: "",
      }),
    ).toBe(false);
  });

  it("detects a capacity shortfall against a real calendar", () => {
    const gaps = detectGaps({
      now: NOW,
      targetDate: new Date("2027-08-01T00:00:00.000Z"),
      successMeasures: ["Pass the exam"],
      milestones: [{ id: "m1", title: "Study modules", status: "not_started", taskCount: 6 }],
      dependencies: [],
      evidenceRequired: [],
      evidenceProvided: [],
      unansweredCheckpoints: [],
      unresolvedBlocks: [],
      requiredMinutes: 1800,
      availableMinutes: 900,
    });
    expect(gaps.map((g) => g.category)).toContain("insufficient_capacity");
  });
});

// ---------------------------------------------------------------------------
describe("§25.D — three-year company goal", () => {
  /** "Today shows only the highest-value next actions." */
  it("shows three actions no matter how large the plan is", () => {
    const hundred = Array.from({ length: 100 }, (_, i) =>
      task({ goalId: "company", title: `Task ${i}`, priority: (i % 5) + 1 }),
    );
    expect(selectTodayCards(hundred, { now: NOW })).toHaveLength(3);
  });

  it("surfaces the highest-priority work first out of a large plan", () => {
    const cards = selectTodayCards(
      [
        ...Array.from({ length: 40 }, () => task({ goalId: "company", priority: 5 })),
        task({ goalId: "company", title: "Sign the lease", priority: 1 }),
      ],
      { now: NOW },
    );
    expect(cards[0]!.title).toBe("Sign the lease");
  });

  /** "It preserves long-term milestones." */
  it("keeps distant milestones in the health calculation rather than dropping them", () => {
    const health = calculateHealth({
      now: NOW,
      targetDate: new Date("2030-03-01T00:00:00.000Z"),
      activatedAt: new Date("2027-01-01T00:00:00.000Z"),
      milestones: [
        { weight: 5, status: "not_started", targetDate: new Date("2030-01-01T00:00:00.000Z") },
        { weight: 3, status: "done", targetDate: new Date("2027-06-01T00:00:00.000Z") },
      ],
      tasks: [],
      unansweredCheckpoints: [],
      overdueDependencies: 0,
      evidenceRequired: 0,
      evidenceProvided: 0,
      availableMinutes: null,
    });
    const milestones = health.factors.find((f) => f.id === "milestones");
    expect(milestones!.weight).toBeGreaterThan(0);
    // The heavy far-future milestone still weighs on the score.
    expect(milestones!.value).toBeLessThan(1);
  });

  it("does not treat a long horizon as urgency", () => {
    const base = {
      now: NOW,
      activatedAt: new Date("2027-01-01T00:00:00.000Z"),
      milestones: [{ weight: 3, status: "not_started", targetDate: null }],
      tasks: [],
      unansweredCheckpoints: [],
      overdueDependencies: 0,
      evidenceRequired: 0,
      evidenceProvided: 0,
      availableMinutes: null,
    };
    const distant = calculateHealth({ ...base, targetDate: new Date("2030-03-01T00:00:00.000Z") });
    const soon = calculateHealth({ ...base, targetDate: new Date("2027-03-10T00:00:00.000Z") });
    expect(distant.score).toBeGreaterThan(soon.score);
  });
});

// ---------------------------------------------------------------------------
describe("§25.E — complex uploaded strategy document", () => {
  const source =
    "Phase 2 requires independent validation from a partner organisation before " +
    "the March review. Participant reach should exceed 500 by Q1.";

  /** "Every extracted item has provenance." */
  it("keeps a verifiable quote as explicit and demotes an unverifiable one", () => {
    const good = verifyProvenance(
      {
        origin: "explicit",
        confidence: 0.9,
        excerpt: "independent validation from a partner organisation",
        page_or_section: "Phase 2",
      },
      source,
    );
    expect(good.origin).toBe("explicit");

    const fabricated = verifyProvenance(
      {
        origin: "explicit",
        confidence: 0.95,
        excerpt: "the budget is fixed at £40,000",
        page_or_section: null,
      },
      source,
    );
    expect(fabricated.origin).toBe("inferred");
    expect(fabricated.confidence).toBeLessThanOrEqual(0.5);
  });

  /**
   * "'What am I missing?' can identify a missing requirement that is not simply
   * an overdue task." This is §25.E's sharpest assertion.
   */
  it("finds a missing requirement while ignoring merely overdue work", () => {
    const gaps = detectGaps({
      now: NOW,
      targetDate: new Date("2027-03-31T00:00:00.000Z"),
      successMeasures: ["500 participants", "One written partner verification"],
      // Every milestone has work under it and plenty of it is late — none of
      // that is a gap.
      milestones: [
        { id: "m1", title: "Media outreach", status: "in_progress", taskCount: 12 },
        { id: "m2", title: "Participant reach", status: "in_progress", taskCount: 8 },
      ],
      dependencies: [],
      // The requirement nothing is producing.
      evidenceRequired: ["Written partner verification"],
      evidenceProvided: [],
      unansweredCheckpoints: [],
      unresolvedBlocks: [],
      requiredMinutes: 0,
      availableMinutes: null,
    });

    const categories = gaps.map((g) => g.category);
    expect(categories).toContain("missing_evidence");
    expect(categories).not.toContain("milestone_without_work");
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.title).toContain("Written partner verification");
  });

  it("returns at most three gaps from a large document", () => {
    const gaps = detectGaps({
      now: NOW,
      targetDate: null,
      successMeasures: [],
      milestones: Array.from({ length: 6 }, (_, i) => ({
        id: `m${i}`,
        title: `Milestone ${i}`,
        status: "not_started",
        taskCount: 0,
      })),
      dependencies: [],
      evidenceRequired: ["A", "B", "C"],
      evidenceProvided: [],
      unansweredCheckpoints: [],
      unresolvedBlocks: [],
      requiredMinutes: 0,
      availableMinutes: null,
    });
    expect(gaps.length).toBeGreaterThan(3);
    expect(selectTopGaps(gaps)).toHaveLength(3);
  });

  /** "Low-confidence high-impact interpretations require confirmation." */
  it("marks low-confidence inferences so the UI can flag them", () => {
    const inferred = verifyProvenance(
      { origin: "explicit", confidence: 0.9, excerpt: "not in the document", page_or_section: null },
      source,
    );
    expect(inferred.origin).toBe("inferred");
    expect(inferred.confidence).toBeLessThan(0.6);
  });
});
