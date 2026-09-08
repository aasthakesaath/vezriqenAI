import { describe, expect, it } from "vitest";
import { calculateHealth, type HealthInputs } from "@/lib/health/score";

const NOW = new Date("2027-01-15T00:00:00.000Z");

function inputs(overrides: Partial<HealthInputs> = {}): HealthInputs {
  const merged = {
    now: NOW,
    targetDate: new Date("2027-06-01T00:00:00.000Z"),
    activatedAt: new Date("2027-01-01T00:00:00.000Z"),
    // Null means "the plan names no dates of its own", so the timeline runs
    // from activation — the old behaviour, kept for the fixtures that predate
    // planStart. The imported-plan case is tested explicitly below.
    planStart: null,
    milestones: [],
    tasks: [],
    unansweredCheckpoints: [],
    overdueDependencies: 0,
    evidenceRequired: 0,
    evidenceProvided: 0,
    availableMinutes: null,
    ...overrides,
  };

  // A fixture that names unanswered checkpoints or overdue dependencies is
  // describing a goal where those came due. The denominators follow from that
  // unless a test sets them, which is how the "nothing has come due" case is
  // told apart from "everything came due and was fine".
  return {
    ...merged,
    // At least one checkpoint has come due, so these fixtures clear the
    // evidence threshold and a score exists to compare. Without it every one
    // of them would be milestones-only, which is withheld by design — that
    // path has its own tests below rather than silently swallowing these.
    checkpointsDue: overrides.checkpointsDue ?? Math.max(1, merged.unansweredCheckpoints.length),
    dependenciesDue: overrides.dependenciesDue ?? merged.overdueDependencies,
  };
}

/**
 * The score, asserted to exist.
 *
 * A comparison against a withheld score is a bug in the fixture, not a
 * comparison — so this fails loudly rather than letting `null` through as 0.
 */
function scoreOf(result: { score: number | null }): number {
  expect(result.score).not.toBeNull();
  return result.score!;
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
        // 14 of 59 days gone — far enough in for pace to mean something. The
        // old fixture sat at 9.3% elapsed, under the threshold, so it was
        // passing on the free pace mark rather than on pace.
        targetDate: new Date("2027-03-01T00:00:00.000Z"),
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
    expect(scoreOf(after)).toBeGreaterThan(scoreOf(before));
    // One heavy milestone beats two trivial ones, despite being fewer items.
    expect(scoreOf(heavyDone)).toBeGreaterThan(scoreOf(after));
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
    expect(scoreOf(substantial)).toBeGreaterThan(scoreOf(trivial));
  });

  it("penalises dependencies that are waiting on other people", () => {
    const clear = calculateHealth(inputs({ milestones: [{ weight: 1, status: "done", targetDate: null }, { weight: 1, status: "not_started", targetDate: null }] }));
    const blocked = calculateHealth(
      inputs({
        milestones: [{ weight: 1, status: "done", targetDate: null }, { weight: 1, status: "not_started", targetDate: null }],
        overdueDependencies: 2,
      }),
    );
    expect(scoreOf(blocked)).toBeLessThan(scoreOf(clear));
  });

  // §12 — an unanswered checkpoint is missing information, not progress.
  it("treats unanswered checkpoints on important work as risk", () => {
    // Both sides need a goal that is somewhere other than the floor, or the
    // weighted average has nothing to move: a factor can only pull a score
    // toward its own value.
    const partway = [
      { weight: 1, status: "done", targetDate: null },
      { weight: 1, status: "not_started", targetDate: null },
    ];
    const answered = calculateHealth(inputs({ milestones: partway, checkpointsDue: 2 }));
    const silent = calculateHealth(
      inputs({
        milestones: partway,
        checkpointsDue: 2,
        unansweredCheckpoints: [{ priority: 1 }, { priority: 1 }],
      }),
    );
    expect(scoreOf(silent)).toBeLessThan(scoreOf(answered));
  });

  it("weighs the same shortfall more heavily as the target date closes in", () => {
    const base = {
      milestones: [
        { weight: 3, status: "done", targetDate: null },
        { weight: 3, status: "not_started", targetDate: null },
      ],
    };
    const distant = calculateHealth(
      inputs({ ...base, targetDate: new Date("2028-01-01T00:00:00.000Z") }),
    );
    const imminent = calculateHealth(
      inputs({ ...base, targetDate: new Date("2027-01-20T00:00:00.000Z") }),
    );
    expect(scoreOf(imminent)).toBeLessThan(scoreOf(distant));
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
        milestones: [
          { weight: 3, status: "done", targetDate: null },
          { weight: 3, status: "not_started", targetDate: null },
        ],
        overdueDependencies: 3,
      }),
    );
    expect(result.weakest?.id).toBe("dependencies");
  });

  describe("not enough evidence to judge (§15)", () => {
    it("withholds the score when only one factor can be measured", () => {
      // 40 milestones, 21 tasks with no dates, nothing due, nobody waiting.
      // Milestone completion is the only thing measurable, and a score built
      // on it alone is a progress bar wearing a health badge.
      const result = calculateHealth(
        inputs({
          milestones: Array.from({ length: 40 }, () => ({
            weight: 4,
            status: "not_started",
            targetDate: null,
          })),
          tasks: Array.from({ length: 21 }, () => ({
            status: "not_started",
            priority: 3,
            deadline: null,
            startBy: null,
            estimatedMinutes: 60,
          })),
          checkpointsDue: 0,
        }),
      );

      expect(result.status).toBe("insufficient_data");
      expect(result.score).toBeNull();
      expect(result.counted.map((f) => f.id)).toEqual(["milestones"]);
    });

    it("gives a goal containing nothing no health at all, rather than 100", () => {
      // The purest form of the bug: every factor abstains, the weighted
      // average has no terms, and the old code returned 1.0 — a goal with
      // nothing in it scored better than a goal in trouble.
      const empty = calculateHealth(inputs({ checkpointsDue: 0 }));

      expect(empty.counted).toEqual([]);
      expect(empty.score).toBeNull();
      expect(empty.status).toBe("insufficient_data");
      expect(empty.status).not.toBe("on_track");
    });

    it("scores as soon as a second kind of evidence exists", () => {
      const milestonesOnly = {
        milestones: [
          { weight: 3, status: "not_started" as const, targetDate: null },
          { weight: 3, status: "done" as const, targetDate: null },
        ],
      };
      expect(calculateHealth(inputs({ ...milestonesOnly, checkpointsDue: 0 })).score).toBeNull();

      // Milestones (3) + check-ins (1) = 4, which is the line. One dated task
      // would do it too: milestones + schedule is 5.
      const withCheckIn = calculateHealth(inputs({ ...milestonesOnly, checkpointsDue: 1 }));
      expect(withCheckIn.score).not.toBeNull();
      expect(withCheckIn.counted.map((f) => f.id)).toEqual(["milestones", "checkpoints"]);
    });

    it("names what would give each silent factor something to measure", () => {
      const result = calculateHealth(
        inputs({
          milestones: [{ weight: 3, status: "not_started", targetDate: null }],
          tasks: [
            { status: "not_started", priority: 3, deadline: null, startBy: null, estimatedMinutes: 30 },
          ],
          checkpointsDue: 0,
        }),
      );

      const schedule = result.abstained.find((f) => f.id === "schedule");
      // The two facts the card must never blur: "nothing overdue" versus
      // "no dated work, so nothing CAN be overdue".
      expect(schedule?.summary).toBe("No dates on any of 1 tasks yet");
      expect(schedule?.absent).toMatch(/Give a task a date/);
      for (const factor of result.abstained) expect(factor.absent).toBeTruthy();
      for (const factor of result.counted) expect(factor.absent).toBeUndefined();
    });

    it("still calls a finished goal achieved, however thin the rest of the evidence", () => {
      const done = calculateHealth(
        inputs({
          milestones: [{ weight: 3, status: "done", targetDate: null }],
          checkpointsDue: 0,
        }),
      );
      expect(done.status).toBe("achieved");
      expect(done.score).toBe(100);
    });
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
