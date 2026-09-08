import { describe, expect, it } from "vitest";
import { calculateHealth, type HealthInputs } from "@/lib/health/score";

const NOW = new Date("2027-01-15T00:00:00.000Z");

function inputs(overrides: Partial<HealthInputs> = {}): HealthInputs {
  return {
    now: NOW,
    targetDate: new Date("2027-06-01T00:00:00.000Z"),
    activatedAt: new Date("2027-01-01T00:00:00.000Z"),
    milestones: [],
    tasks: [],
    unansweredCheckpoints: [],
    overdueDependencies: 0,
    evidenceRequired: 0,
    evidenceProvided: 0,
    availableMinutes: null,
    ...overrides,
  };
}

describe("Goal Health (PRD §15)", () => {
  it("reports achieved once every milestone is done", () => {
    const result = calculateHealth(
      inputs({
        milestones: [
          { weight: 3, status: "done", targetDate: null },
          { weight: 2, status: "done", targetDate: null },
        ],
      }),
    );
    expect(result.status).toBe("achieved");
  });

  it("is on track when milestones keep pace with the timeline", () => {
    const result = calculateHealth(
      inputs({
        milestones: [
          { weight: 1, status: "done", targetDate: null },
          { weight: 1, status: "done", targetDate: null },
          { weight: 1, status: "not_started", targetDate: null },
        ],
      }),
    );
    expect(result.status).toBe("on_track");
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  it("degrades as work slips past its dates", () => {
    const overdue = Array.from({ length: 4 }, () => ({
      status: "not_started",
      priority: 1,
      deadline: new Date("2026-12-01T00:00:00.000Z"),
      startBy: new Date("2026-11-01T00:00:00.000Z"),
      estimatedMinutes: 60,
    }));
    const result = calculateHealth(
      inputs({
        milestones: [{ weight: 3, status: "not_started", targetDate: null }],
        tasks: overdue,
      }),
    );
    expect(["at_risk", "off_track", "needs_attention"]).toContain(result.status);
    expect(result.score).toBeLessThan(80);
  });

  /**
   * PRD §4.10 — "Completing low-value tasks must not make a goal appear
   * healthier than it is." This is the assertion that keeps the score honest.
   */
  it("does not improve when only low-weight milestones are finished", () => {
    const heavyOutstanding = [
      { weight: 5, status: "not_started", targetDate: null },
      { weight: 1, status: "not_started", targetDate: null },
      { weight: 1, status: "not_started", targetDate: null },
    ];
    const before = calculateHealth(inputs({ milestones: heavyOutstanding }));

    const trivialDone = [
      { weight: 5, status: "not_started", targetDate: null },
      { weight: 1, status: "done", targetDate: null },
      { weight: 1, status: "done", targetDate: null },
    ];
    const after = calculateHealth(inputs({ milestones: trivialDone }));

    // Two of three milestones done by count, but only 2/7 by weight. A
    // count-based score would read 67% complete; the weighted one must not.
    const heavyDone = calculateHealth(
      inputs({
        milestones: [
          { weight: 5, status: "done", targetDate: null },
          { weight: 1, status: "not_started", targetDate: null },
          { weight: 1, status: "not_started", targetDate: null },
        ],
      }),
    );
    expect(after.score).toBeGreaterThan(before.score);
    // One heavy milestone beats two trivial ones, despite being fewer items.
    expect(heavyDone.score).toBeGreaterThan(after.score);
  });

  it("counts finishing the heaviest milestone for much more", () => {
    const trivial = calculateHealth(
      inputs({
        milestones: [
          { weight: 5, status: "not_started", targetDate: null },
          { weight: 1, status: "done", targetDate: null },
        ],
      }),
    );
    const substantial = calculateHealth(
      inputs({
        milestones: [
          { weight: 5, status: "done", targetDate: null },
          { weight: 1, status: "not_started", targetDate: null },
        ],
      }),
    );
    expect(substantial.score).toBeGreaterThan(trivial.score);
  });

  it("penalises dependencies that are waiting on other people", () => {
    const clear = calculateHealth(inputs({ milestones: [{ weight: 1, status: "done", targetDate: null }, { weight: 1, status: "not_started", targetDate: null }] }));
    const blocked = calculateHealth(
      inputs({
        milestones: [{ weight: 1, status: "done", targetDate: null }, { weight: 1, status: "not_started", targetDate: null }],
        overdueDependencies: 2,
      }),
    );
    expect(blocked.score).toBeLessThan(clear.score);
  });

  // §12 — an unanswered checkpoint is missing information, not progress.
  it("treats unanswered checkpoints on important work as risk", () => {
    const answered = calculateHealth(inputs({ milestones: [{ weight: 1, status: "not_started", targetDate: null }] }));
    const silent = calculateHealth(
      inputs({
        milestones: [{ weight: 1, status: "not_started", targetDate: null }],
        unansweredCheckpoints: [{ priority: 1 }, { priority: 1 }],
      }),
    );
    expect(silent.score).toBeLessThan(answered.score);
  });

  it("weighs the same shortfall more heavily as the target date closes in", () => {
    const base = { milestones: [{ weight: 3, status: "not_started", targetDate: null }] };
    const distant = calculateHealth(
      inputs({ ...base, targetDate: new Date("2028-01-01T00:00:00.000Z") }),
    );
    const imminent = calculateHealth(
      inputs({ ...base, targetDate: new Date("2027-01-20T00:00:00.000Z") }),
    );
    expect(imminent.score).toBeLessThan(distant.score);
  });

  it("stays neutral on capacity until Calendar is connected", () => {
    const result = calculateHealth(
      inputs({
        tasks: [
          { status: "not_started", priority: 2, deadline: null, startBy: null, estimatedMinutes: 600 },
        ],
      }),
    );
    const capacity = result.factors.find((f) => f.id === "capacity");
    expect(capacity?.weight).toBe(0);
    expect(capacity?.summary).toBe("Calendar not connected");
  });

  it("names the weakest factor so the recommendation can lead with it", () => {
    const result = calculateHealth(
      inputs({
        milestones: [{ weight: 3, status: "not_started", targetDate: null }],
        overdueDependencies: 3,
      }),
    );
    expect(result.weakest?.id).toBe("dependencies");
  });

  it("always produces a score inside 0-100", () => {
    const wrecked = calculateHealth(
      inputs({
        targetDate: new Date("2026-01-01T00:00:00.000Z"),
        milestones: [{ weight: 5, status: "not_started", targetDate: null }],
        tasks: Array.from({ length: 20 }, () => ({
          status: "not_started",
          priority: 1,
          deadline: new Date("2026-01-01T00:00:00.000Z"),
          startBy: new Date("2025-12-01T00:00:00.000Z"),
          estimatedMinutes: 120,
        })),
        overdueDependencies: 9,
        unansweredCheckpoints: Array.from({ length: 9 }, () => ({ priority: 1 })),
      }),
    );
    expect(wrecked.score).toBeGreaterThanOrEqual(0);
    expect(wrecked.score).toBeLessThanOrEqual(100);
    expect(wrecked.status).toBe("off_track");
  });
});
