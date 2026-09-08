import { describe, expect, it } from "vitest";
import { calculateStartBy, planReminders, formatDate } from "@/lib/plan/lead-time";

const deadline = new Date("2027-11-01T00:00:00.000Z");

/**
 * PRD §9 — "A deadline is not the same as the date work should begin."
 * These lock in the ordering the engine exists to produce.
 */
describe("start-by calculation (PRD §9)", () => {
  it("starts work well before a hard deadline, never on it", () => {
    const result = calculateStartBy({
      taskType: "submission",
      deadline,
      estimatedMinutes: null,
      dependencyCount: 0,
    });
    expect(result.startBy).not.toBeNull();
    expect(result.startBy!.getTime()).toBeLessThan(deadline.getTime());
  });

  // The §25.B worked example: a recommendation letter must start earliest,
  // because the user cannot recover that time by working harder.
  it("gives work that depends on another person the most runway", () => {
    const external = calculateStartBy({
      taskType: "external_dependency",
      deadline,
      estimatedMinutes: null,
      dependencyCount: 0,
    });
    const solo = calculateStartBy({
      taskType: "simple_action",
      deadline,
      estimatedMinutes: null,
      dependencyCount: 0,
    });
    expect(external.bufferDays).toBeGreaterThan(solo.bufferDays);
    expect(external.startBy!.getTime()).toBeLessThan(solo.startBy!.getTime());
  });

  it("orders the task types by how much runway they need", () => {
    const buffer = (taskType: Parameters<typeof calculateStartBy>[0]["taskType"]) =>
      calculateStartBy({ taskType, deadline, estimatedMinutes: null, dependencyCount: 0 })
        .bufferDays;

    expect(buffer("external_dependency")).toBeGreaterThan(buffer("submission"));
    expect(buffer("submission")).toBeGreaterThan(buffer("deep_work"));
    expect(buffer("deep_work")).toBeGreaterThan(buffer("simple_action"));
    expect(buffer("routine_habit")).toBe(0);
  });

  it("adds runway for the actual volume of work", () => {
    const quick = calculateStartBy({
      taskType: "deep_work",
      deadline,
      estimatedMinutes: 30,
      dependencyCount: 0,
    });
    const long = calculateStartBy({
      taskType: "deep_work",
      deadline,
      estimatedMinutes: 20 * 60,
      dependencyCount: 0,
    });
    expect(long.bufferDays).toBeGreaterThan(quick.bufferDays);
  });

  it("adds runway for each unresolved prerequisite", () => {
    const none = calculateStartBy({
      taskType: "deep_work",
      deadline,
      estimatedMinutes: null,
      dependencyCount: 0,
    });
    const blocked = calculateStartBy({
      taskType: "deep_work",
      deadline,
      estimatedMinutes: null,
      dependencyCount: 2,
    });
    expect(blocked.bufferDays).toBeGreaterThan(none.bufferDays);
  });

  // §4.8 — "Explain important decisions" in one sentence.
  it("explains the start-by date in plain language", () => {
    const result = calculateStartBy({
      taskType: "external_dependency",
      deadline,
      estimatedMinutes: null,
      dependencyCount: 0,
    });
    expect(result.reason).toContain("Start by");
    expect(result.reason).toContain("someone else");
    expect(result.reason!.endsWith(".")).toBe(true);
  });

  it("produces no start-by date and no claim when there is no deadline", () => {
    const result = calculateStartBy({
      taskType: "submission",
      deadline: null,
      estimatedMinutes: 120,
      dependencyCount: 1,
    });
    expect(result.startBy).toBeNull();
    expect(result.reason).toBeNull();
  });

  it("respects a learned shorter work block by spreading over more days", () => {
    const wide = calculateStartBy({
      taskType: "deep_work",
      deadline,
      estimatedMinutes: 300,
      dependencyCount: 0,
      preferredBlockMinutes: 150,
    });
    const narrow = calculateStartBy({
      taskType: "deep_work",
      deadline,
      estimatedMinutes: 300,
      dependencyCount: 0,
      preferredBlockMinutes: 30,
    });
    expect(narrow.bufferDays).toBeGreaterThan(wide.bufferDays);
  });
});

describe("reminder planning (PRD §12)", () => {
  const startBy = new Date("2027-10-08T00:00:00.000Z");

  it("pairs an informational heads-up with a checkpoint that needs an answer", () => {
    const plans = planReminders({ startBy, deadline, taskType: "submission", priority: 1 });

    const headsUp = plans.filter((p) => p.type === "heads_up");
    const checkpoints = plans.filter((p) => p.type === "action_checkpoint");

    expect(headsUp).toHaveLength(1);
    expect(headsUp[0]!.responseRequired).toBe(false);
    expect(checkpoints.length).toBeGreaterThanOrEqual(1);
    // §12: every important task eventually produces an action checkpoint.
    expect(checkpoints.every((c) => c.responseRequired)).toBe(true);
  });

  it("sends the heads-up before the checkpoint", () => {
    const plans = planReminders({ startBy, deadline, taskType: "submission", priority: 1 });
    expect(formatDate(plans[0]!.scheduledAt)).toBe("2027-10-07");
    expect(plans[0]!.type).toBe("heads_up");
  });

  // §12: "Do not spam users with one email per low-value task."
  it("does not add a deadline check for low-priority work", () => {
    const high = planReminders({ startBy, deadline, taskType: "submission", priority: 1 });
    const low = planReminders({ startBy, deadline, taskType: "simple_action", priority: 5 });
    expect(low.length).toBeLessThan(high.length);
  });

  it("schedules nothing when there is no start-by date to work from", () => {
    const plans = planReminders({
      startBy: null,
      deadline: null,
      taskType: "simple_action",
      priority: 3,
    });
    expect(plans).toHaveLength(0);
  });

  it("returns reminders in chronological order", () => {
    const plans = planReminders({ startBy, deadline, taskType: "external_dependency", priority: 1 });
    const times = plans.map((p) => p.scheduledAt.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});
