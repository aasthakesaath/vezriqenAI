import { describe, expect, it } from "vitest";
import {
  addDays,
  dayKeyIn,
  daysBetween,
  hourIn,
  isValidTimeZone,
  safeTimeZone,
  toDayKey,
  zonedInstant,
} from "@/lib/time-zone";
import { WINDOW_TIME, applyQuietHours, isQuietHour, reminderInstant } from "@/lib/reminders/send-time";
import { backlogSummary, selectTodayCards, todayFor, type CandidateTask } from "@/lib/plan/today";
import { planForView } from "@/lib/plan/views";
import { greetingFor } from "@/lib/greeting";

/**
 * Dates belong to the user, not to the server.
 *
 * Vercel runs in UTC. Every day boundary in the product was therefore UTC's,
 * so at 8 PM in Texas the code thought it was already tomorrow: work due today
 * read as overdue, and a reminder "on the start-by date" was delivered at 6 or
 * 7 PM the evening before.
 *
 * Every test here sits deliberately close to a boundary, because that is the
 * only place the bug is visible — the middle of the afternoon looks fine in
 * every timezone, which is exactly why this went unnoticed.
 */

const CHICAGO = "America/Chicago";
const KOLKATA = "Asia/Kolkata";
const AUCKLAND = "Pacific/Auckland";

describe("which day it is", () => {
  it("is the user's day, not the server's, on either side of midnight", () => {
    // 02:30 UTC. Still the 8th in Chicago; already the 9th in Kolkata.
    const instant = new Date("2026-09-09T02:30:00Z");
    expect(dayKeyIn(instant, "UTC")).toBe("2026-09-09");
    expect(dayKeyIn(instant, CHICAGO)).toBe("2026-09-08");
    expect(dayKeyIn(instant, KOLKATA)).toBe("2026-09-09");
    expect(dayKeyIn(instant, AUCKLAND)).toBe("2026-09-09");
  });

  it("is still yesterday's date for someone whose evening runs past midnight UTC", () => {
    // 8 PM in Chicago on the 8th is already the 9th in UTC — the exact case
    // that made a plan an hour behind look a day behind.
    const evening = new Date("2026-09-09T01:00:00Z");
    expect(hourIn(evening, CHICAGO)).toBe(20);
    expect(todayFor({ now: evening, timeZone: CHICAGO })).toBe("2026-09-08");
    expect(todayFor({ now: evening })).toBe("2026-09-09"); // no zone: UTC, and wrong for them
  });

  it("greets by the reader's clock, not the datacentre's", () => {
    const evening = new Date("2026-09-09T01:00:00Z");
    expect(greetingFor({ now: evening, timeZone: CHICAGO })).toBe("Good evening");
    expect(greetingFor({ now: evening, timeZone: KOLKATA })).toBe("Good morning");
  });

  it("falls back to UTC rather than throwing on a zone it does not know", () => {
    expect(isValidTimeZone("Mars/Olympus_Mons")).toBe(false);
    expect(safeTimeZone("Mars/Olympus_Mons")).toBe("UTC");
    expect(safeTimeZone(null)).toBe("UTC");
    expect(dayKeyIn(new Date("2026-09-09T02:30:00Z"), "Mars/Olympus_Mons")).toBe("2026-09-09");
  });
});

describe("Today, for a user near a day boundary", () => {
  const base: CandidateTask = {
    id: "t1",
    goalId: "g1",
    goalTitle: "Ship Atlas to general availability by 1 December 2026",
    title: "Draft the launch note",
    rationale: null,
    taskType: "deep_work",
    priority: 2,
    deadline: null,
    startBy: null,
    estimatedMinutes: 45,
    status: "not_started",
    awaitingCheckpoint: false,
    blockedOnPerson: false,
  };

  // 9 PM on 8 September in Chicago. In UTC it is already the 9th.
  const evening = new Date("2026-09-09T02:00:00Z");

  it("does not call today's work overdue just because it is late in the evening", () => {
    const dueToday = { ...base, startBy: new Date("2026-09-08T00:00:00Z") };

    expect(backlogSummary([dueToday], { now: evening, timeZone: CHICAGO })).toEqual({
      behindCount: 0,
      planBehind: false,
    });
    const [card] = selectTodayCards([dueToday], { now: evening, timeZone: CHICAGO });
    expect(card.reason).toBe("today is the day to start");

    // The old behaviour, kept here as the contrast: on the server's clock the
    // same task is already a day late.
    expect(backlogSummary([dueToday], { now: evening }).behindCount).toBe(1);
  });

  it("still counts genuinely past work as behind", () => {
    const late = { ...base, startBy: new Date("2026-09-01T00:00:00Z") };
    expect(backlogSummary([late], { now: evening, timeZone: CHICAGO }).behindCount).toBe(1);
  });

  it("scopes the goal page's Today view to the user's day", () => {
    const milestones = [
      { id: "m1", title: "Pilot complete", status: "not_started", targetDate: new Date("2026-09-08T00:00:00Z") },
      { id: "m2", title: "Launch", status: "not_started", targetDate: new Date("2026-09-09T00:00:00Z") },
    ];
    const scoped = planForView("today", { milestones, tasks: [], now: evening, timeZone: CHICAGO });
    expect(scoped.milestones.map((m) => m.id)).toEqual(["m1"]);

    // Tomorrow's milestone arrives in tomorrow's view, not tonight's.
    const week = planForView("week", { milestones, tasks: [], now: evening, timeZone: CHICAGO });
    expect(week.milestones.map((m) => m.id)).toEqual(["m1", "m2"]);
  });
});

describe("a reminder lands at the time the user was promised", () => {
  it("sends at 9:15 AM on the user's clock, not the server's", () => {
    const instant = reminderInstant({
      day: "2026-10-12",
      time: { hour: 9, minute: 15 },
      timeZone: CHICAGO,
    });

    // Central Daylight Time is UTC-5 in October.
    expect(instant.toISOString()).toBe("2026-10-12T14:15:00.000Z");
    // Which is the only assertion that really matters: read back on their
    // clock, it is 9 AM on the day the plan said.
    expect(hourIn(instant, CHICAGO)).toBe(9);
    expect(dayKeyIn(instant, CHICAGO)).toBe("2026-10-12");
  });

  it("still says 9:15 after the clocks change", () => {
    const winter = reminderInstant({
      day: "2026-12-12",
      time: { hour: 9, minute: 15 },
      timeZone: CHICAGO,
    });
    // Standard time now: UTC-6, so a different instant for the same wall clock.
    expect(winter.toISOString()).toBe("2026-12-12T15:15:00.000Z");
    expect(hourIn(winter, CHICAGO)).toBe(9);
  });

  it("holds a 9:15 promise in a half-hour-offset zone", () => {
    const instant = reminderInstant({
      day: "2026-10-12",
      time: { hour: 9, minute: 15 },
      timeZone: KOLKATA,
    });
    expect(instant.toISOString()).toBe("2026-10-12T03:45:00.000Z");
    expect(hourIn(instant, KOLKATA)).toBe(9);
  });

  it("uses the productive window the user chose", () => {
    expect(WINDOW_TIME.morning).toEqual({ hour: 8, minute: 0 });
    expect(WINDOW_TIME.evening).toEqual({ hour: 18, minute: 0 });
    const evening = reminderInstant({
      day: "2026-10-12",
      time: WINDOW_TIME.evening,
      timeZone: CHICAGO,
    });
    expect(hourIn(evening, CHICAGO)).toBe(18);
  });
});

describe("quiet hours", () => {
  it("recognises a window that wraps midnight", () => {
    expect(isQuietHour(23, 22, 7)).toBe(true);
    expect(isQuietHour(3, 22, 7)).toBe(true);
    expect(isQuietHour(7, 22, 7)).toBe(false);
    expect(isQuietHour(12, 22, 7)).toBe(false);
    // Unset means no window at all, not a window of zero length.
    expect(isQuietHour(3, null, null)).toBe(false);
  });

  it("defers a reminder to when the quiet window ends, rather than dropping it", () => {
    // 11 PM, inside 10 PM - 7 AM: moves to 7 AM the NEXT morning.
    const late = applyQuietHours({ hour: 23, minute: 0 }, 22, 7);
    expect(late).toEqual({ time: { hour: 7, minute: 0 }, nextDay: true });

    // 3 AM is inside the same window but already on the far side of midnight,
    // so it moves to 7 AM the SAME morning.
    expect(applyQuietHours({ hour: 3, minute: 0 }, 22, 7)).toEqual({
      time: { hour: 7, minute: 0 },
      nextDay: false,
    });

    expect(applyQuietHours({ hour: 9, minute: 15 }, 22, 7)).toEqual({
      time: { hour: 9, minute: 15 },
      nextDay: false,
    });
  });

  it("moves an evening reminder to the next morning, on the user's clock", () => {
    const instant = reminderInstant({
      day: "2026-10-12",
      time: { hour: 23, minute: 0 },
      timeZone: CHICAGO,
      quietStart: 22,
      quietEnd: 7,
    });
    expect(dayKeyIn(instant, CHICAGO)).toBe("2026-10-13");
    expect(hourIn(instant, CHICAGO)).toBe(7);
  });
});

describe("day arithmetic", () => {
  it("adds days without a timezone anywhere near it", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-08", -1)).toBe("2026-03-07"); // a US DST changeover day
    expect(daysBetween("2026-09-08", "2026-12-31")).toBe(114);
    expect(daysBetween("2026-09-08", "2026-09-01")).toBe(-7);
  });

  it("reads a stored date as the day it was written, never shifted", () => {
    expect(toDayKey("2026-10-01")).toBe("2026-10-01");
    expect(toDayKey("2026-10-01T00:00:00+00:00")).toBe("2026-10-01");
    expect(toDayKey(new Date("2026-10-01T00:00:00Z"))).toBe("2026-10-01");
    expect(toDayKey(null)).toBeNull();
  });

  it("lands on the right instant across a spring-forward boundary", () => {
    // 2 AM does not exist in Chicago on 8 March 2026. The answer has to be a
    // real instant rather than NaN or an hour adrift.
    const instant = zonedInstant("2026-03-08", 2, 30, CHICAGO);
    expect(Number.isNaN(instant.getTime())).toBe(false);
    expect(dayKeyIn(instant, CHICAGO)).toBe("2026-03-08");
  });
});
