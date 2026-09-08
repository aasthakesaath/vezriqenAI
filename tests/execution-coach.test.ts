import { describe, expect, it } from "vitest";
import {
  BLOCK_CATEGORIES,
  INTERVENTIONS_FOR,
  fallbackIntervention,
  type BlockCategory,
} from "@/lib/coach/interventions";
import { calculateImpact, isSafeReplan, type Replan } from "@/lib/coach/replan";
import { bestWindow, rankEffectiveInterventions, windowForHour } from "@/lib/coach/profile";
import { BLOCK_CHOICES } from "@/lib/app-copy";

/**
 * PRD §13 is the product's core differentiator, and its whole claim rests on
 * one behaviour: "'Not done' is a signal to solve the barrier, not merely move
 * the task." These tests exist to make regressing to a bare reschedule fail.
 */
describe("Execution Block Coach (PRD §13)", () => {
  it("offers the eight quick choices §13 lists", () => {
    expect(BLOCK_CHOICES).toHaveLength(8);
    expect(BLOCK_CHOICES.map((c) => c.id).sort()).toEqual([...BLOCK_CATEGORIES].sort());
  });

  it("has at least one intervention for every barrier", () => {
    for (const category of BLOCK_CATEGORIES) {
      expect(INTERVENTIONS_FOR[category].length).toBeGreaterThan(0);
    }
  });

  // The central assertion. Avoidance and overwhelm are not clock problems, and
  // giving them a later date is the failure §13 was written against.
  it("never offers rescheduling as a way out of avoidance or overwhelm", () => {
    for (const category of ["felt_too_big", "kept_avoiding", "didnt_know_how_to_start"] as const) {
      expect(
        INTERVENTIONS_FOR[category],
        `${category} must not be answered with a reschedule`,
      ).not.toContain("reschedule_window");
    }
  });

  it("reaches for a smaller first step when the task felt too big", () => {
    expect(INTERVENTIONS_FOR.felt_too_big[0]).toBe("shrink_first_step");
  });

  it("answers a genuine time problem with time-shaped interventions", () => {
    expect(INTERVENTIONS_FOR.no_time).toContain("timebox");
    expect(INTERVENTIONS_FOR.no_time).toContain("reschedule_window");
  });

  // §13's worked example: "This is not in your control right now."
  it("moves the user onward when they are waiting on someone", () => {
    expect(INTERVENTIONS_FOR.waiting_on_someone).toContain("follow_up_other_person");
    expect(INTERVENTIONS_FOR.waiting_on_someone).toContain("alternative_action");
  });

  it("never proposes a bare reschedule for work blocked on another person", () => {
    expect(INTERVENTIONS_FOR.waiting_on_someone).not.toContain("reschedule_window");
  });
});

describe("coaching without the model (PRD §13 must still work)", () => {
  it("produces a concrete intervention for every barrier", () => {
    for (const category of BLOCK_CATEGORIES) {
      const intervention = fallbackIntervention(category as BlockCategory, "Finish module 4", null);
      expect(intervention.message.length).toBeGreaterThan(0);
      expect(INTERVENTIONS_FOR[category as BlockCategory]).toContain(
        intervention.intervention_type,
      );
    }
  });

  it("shrinks the task rather than moving it when it felt too big", () => {
    const intervention = fallbackIntervention("felt_too_big", "Finish module 4", null);
    expect(intervention.intervention_type).toBe("shrink_first_step");
    expect(intervention.proposal.new_task_minutes).toBeLessThanOrEqual(15);
    expect(intervention.proposal.new_task_title).toContain("Finish module 4");
  });

  it("creates a follow-up naming the person when blocked on someone", () => {
    const intervention = fallbackIntervention(
      "waiting_on_someone",
      "Recommendation letter",
      "Ms. Alvarez",
    );
    expect(intervention.intervention_type).toBe("follow_up_other_person");
    expect(intervention.proposal.follow_up_with).toBe("Ms. Alvarez");
    expect(intervention.message).toContain("isn't in your control");
  });

  // §10 and §13 both forbid characterising the user.
  it("never uses guilt or character language", () => {
    const forbidden = /lazy|undisciplined|procrastinat|should have|failed|excuse|discipline/i;
    for (const category of BLOCK_CATEGORIES) {
      const intervention = fallbackIntervention(category as BlockCategory, "A task", "Sam");
      expect(intervention.message, `${category}: "${intervention.message}"`).not.toMatch(forbidden);
    }
  });
});

describe("adaptive replanning (PRD §14)", () => {
  const NOW = new Date("2027-03-01T00:00:00.000Z");

  function impactInputs(overrides: Partial<Parameters<typeof calculateImpact>[0]> = {}) {
    return {
      now: NOW,
      targetDate: new Date("2027-09-01T00:00:00.000Z"),
      missedTask: {
        title: "Practice test 2",
        deadline: new Date("2027-02-25T00:00:00.000Z"),
        startBy: null,
        estimatedMinutes: 120,
        milestoneId: null,
        priority: 3,
      },
      dependentTaskCount: 0,
      milestone: null,
      remainingMinutes: 600,
      availableMinutes: null,
      ...overrides,
    };
  }

  it("measures how far behind the work is", () => {
    expect(calculateImpact(impactInputs()).daysBehind).toBe(4);
  });

  it("notices when other work is blocked behind the missed task", () => {
    expect(calculateImpact(impactInputs({ dependentTaskCount: 2 })).affectsDependency).toBe(true);
  });

  it("flags a milestone whose remaining time the slip has eaten into", () => {
    const impact = calculateImpact(
      impactInputs({
        milestone: {
          title: "Practice tests",
          targetDate: new Date("2027-03-04T00:00:00.000Z"),
          openTaskCount: 2,
        },
      }),
    );
    expect(impact.threatensMilestone).toBe(true);
  });

  it("keeps the target achievable while the date is still ahead", () => {
    expect(calculateImpact(impactInputs()).targetStillAchievable).toBe(true);
    expect(
      calculateImpact(impactInputs({ targetDate: new Date("2027-01-01T00:00:00.000Z") }))
        .targetStillAchievable,
    ).toBe(false);
  });

  // §14 — minor changes may be proposed quickly; material ones need the user.
  it("requires confirmation for a change that threatens a milestone", () => {
    const impact = calculateImpact(
      impactInputs({
        milestone: {
          title: "Practice tests",
          targetDate: new Date("2027-03-02T00:00:00.000Z"),
          openTaskCount: 1,
        },
      }),
    );
    expect(impact.severity).toBe("material");
    expect(impact.requiresConfirmation).toBe(true);
  });

  it("treats a small slip on low-priority work as minor", () => {
    const impact = calculateImpact(
      impactInputs({
        missedTask: {
          title: "Optional reading",
          deadline: new Date("2027-02-28T00:00:00.000Z"),
          startBy: null,
          estimatedMinutes: 30,
          milestoneId: null,
          priority: 5,
        },
      }),
    );
    expect(impact.severity).toBe("minor");
    expect(impact.requiresConfirmation).toBe(false);
  });

  it("leaves capacity unknown until Calendar is connected", () => {
    expect(calculateImpact(impactInputs()).hasCapacityToRecover).toBeNull();
    expect(
      calculateImpact(impactInputs({ availableMinutes: 900 })).hasCapacityToRecover,
    ).toBe(true);
  });

  // §14 — "Never silently change the user's final goal."
  it("rejects any recovery proposal that moves the target date", () => {
    const moves: Replan = {
      consequence: "You won't make it, so let's push the exam back a month.",
      changes: [{ kind: "reduce_scope", description: "Move the target date" }],
      keeps_target_date: false,
      reasoning: "",
    };
    const keeps: Replan = {
      consequence: "About 3.5 hours behind, still achievable.",
      changes: [{ kind: "add_time", description: "+30 minutes Thursday" }],
      keeps_target_date: true,
      reasoning: "",
    };
    expect(isSafeReplan(moves)).toBe(false);
    expect(isSafeReplan(keeps)).toBe(true);
  });
});

describe("Execution Profile (PRD §10)", () => {
  it("buckets hours into the windows §10 uses", () => {
    expect(windowForHour(8)).toBe("morning");
    expect(windowForHour(14)).toBe("afternoon");
    expect(windowForHour(21)).toBe("evening");
  });

  it("stays undecided until there is enough evidence", () => {
    expect(bestWindow({ completion_by_time: { morning: { completed: 1, total: 1 } } })).toBe(
      "varies",
    );
  });

  it("names the window where work actually gets finished", () => {
    expect(
      bestWindow({
        completion_by_time: {
          morning: { completed: 8, total: 10 },
          evening: { completed: 1, total: 6 },
        },
      }),
    ).toBe("morning");
  });

  it("says it varies when no window is reliable", () => {
    expect(
      bestWindow({
        completion_by_time: {
          morning: { completed: 1, total: 5 },
          evening: { completed: 1, total: 5 },
        },
      }),
    ).toBe("varies");
  });

  it("ranks interventions this person has actually taken up", () => {
    const ranked = rankEffectiveInterventions({
      effective_interventions: {
        shrink_first_step: { accepted: 4, offered: 5 },
        reschedule_window: { accepted: 1, offered: 6 },
        timebox: { accepted: 0, offered: 3 },
      },
    });
    expect(ranked[0]).toBe("shrink_first_step");
    // Never offered successfully — must not be recommended.
    expect(ranked).not.toContain("timebox");
  });

  it("returns nothing for a brand-new user", () => {
    expect(rankEffectiveInterventions({})).toEqual([]);
  });
});
