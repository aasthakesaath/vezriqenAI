import { beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ReminderPreferences from "@/components/app/ReminderPreferences";
import {
  formatDayTime,
  formatHour,
  formatQuietHours,
  formatTime,
  joinHour,
  splitHour,
  timeZoneLabel,
} from "@/lib/time";
import { buildReminderEmail } from "@/lib/email/templates";

/**
 * Every user-visible time is 12-hour with AM/PM.
 *
 * The sweep at the bottom is the part that matters: it strips markup and then
 * fails on any H:MM that is not followed by AM/PM, so a future screen cannot
 * quietly reintroduce "22:00" without turning this red.
 */

// The email builder signs its action links; the value is irrelevant here, it
// just has to exist.
beforeAll(() => {
  process.env.EMAIL_ACTION_SIGNING_KEY ??= randomBytes(32).toString("base64");
});

/** Any clock reading, so the sweep can check what follows each one. */
const CLOCK = /\b(\d{1,2}):(\d{2})(?!\d)/g;

/**
 * Every clock reading in `text` that is NOT followed by AM/PM.
 *
 * Deliberately runs on text content rather than markup: ISO timestamps and
 * Tailwind values legitimately contain colons, and neither is something a
 * person reads.
 */
export function bare24HourTimes(text: string): string[] {
  const offenders: string[] = [];
  for (const match of text.matchAll(CLOCK)) {
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 4);
    if (!/^\s*[AP]\.?M\.?/i.test(after)) offenders.push(`${match[0]}${after}`);
  }
  return offenders;
}

const textOf = (markup: string) =>
  markup
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z]+;|&#\d+;/gi, " ")
    .replace(/\s+/g, " ");

describe("the shared formatter", () => {
  it("renders whole hours as 12-hour clock times", () => {
    expect(formatHour(22)).toBe("10:00 PM");
    expect(formatHour(7)).toBe("7:00 AM");
    expect(formatHour(0)).toBe("12:00 AM");
    expect(formatHour(12)).toBe("12:00 PM");
    expect(formatHour(23)).toBe("11:00 PM");
  });

  it("round-trips an hour through the picker's two controls", () => {
    for (let hour = 0; hour < 24; hour += 1) {
      const { hour: h, meridiem } = splitHour(hour);
      expect(joinHour(h, meridiem)).toBe(hour);
      expect(h).toBeGreaterThanOrEqual(1);
      expect(h).toBeLessThanOrEqual(12);
    }
  });

  it("formats a moment with AM/PM", () => {
    const evening = new Date(Date.UTC(2026, 8, 8, 22, 15));
    expect(formatTime(evening, "UTC")).toBe("10:15 PM");
    // Not pinned to ICU's month abbreviation — it renders "Sept" here and
    // "Sep" elsewhere, and which one is not what this test is about.
    expect(formatDayTime(evening, "UTC")).toMatch(/^8 Sept?, 10:15 PM$/);
  });

  it("ignores the visitor's locale rather than letting it produce 24-hour time", () => {
    // A browser set to en-GB or de-DE would otherwise format 22:15, which is
    // exactly the case this rule exists for and the hardest one to notice.
    const evening = new Date(Date.UTC(2026, 8, 8, 22, 15));
    expect(bare24HourTimes(formatTime(evening, "UTC"))).toEqual([]);
  });

  it("names a timezone as a place, never as an offset", () => {
    expect(timeZoneLabel("America/Chicago")).toBe("Central Time");
    expect(timeZoneLabel("America/New_York")).toBe("Eastern Time");
    expect(timeZoneLabel("America/Los_Angeles")).toBe("Pacific Time");
    // Zones with no generic name must still not fall back to "GMT+00:00".
    for (const zone of ["Etc/UTC", "UTC", "Asia/Kolkata", "Australia/Sydney"]) {
      const label = timeZoneLabel(zone);
      expect(label).not.toMatch(/^(GMT|UTC)\s*[+-]/i);
      expect(label).not.toMatch(/^[+-]\d/);
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("puts the timezone in the quiet-hours sentence", () => {
    expect(formatQuietHours(22, 7, "America/Chicago")).toBe(
      "10:00 PM to 7:00 AM, Central Time",
    );
    // Server render, before the browser zone is known: still a valid sentence.
    expect(formatQuietHours(22, 7, null)).toBe("10:00 PM to 7:00 AM");
  });
});

describe("the sweep itself works", () => {
  it("catches a bare 24-hour time", () => {
    expect(bare24HourTimes("From 22:00 to 07:00")).toHaveLength(2);
    expect(bare24HourTimes("Quiet from 22 to 7")).toEqual([]);
  });

  it("accepts a 12-hour time", () => {
    expect(bare24HourTimes("From 10:00 PM to 7:00 AM")).toEqual([]);
    expect(bare24HourTimes("at 9:15 am")).toEqual([]);
  });
});

describe("no screen renders a bare 24-hour time", () => {
  it("settings shows quiet hours in 12-hour terms", () => {
    const markup = renderToStaticMarkup(
      <ReminderPreferences
        reminderStyle="both"
        accountability="balanced"
        productiveWindow="varies"
        quietStart={22}
        quietEnd={7}
        emailReminders
        emailConfigured={false}
      />,
    );
    const text = textOf(markup);
    expect(bare24HourTimes(text)).toEqual([]);
    expect(text).toContain("10:00 PM");
    expect(text).toContain("7:00 AM");
    // The old control put raw hours in front of the user.
    expect(text).not.toMatch(/From\s+22\b/);
  });

  it("reminder email carries no 24-hour time", () => {
    const email = buildReminderEmail({
      recipientName: "Nikita",
      taskTitle: "Request the recommendation letter",
      goalTitle: "Summer programme application",
      rationale: "Someone else has to reply before this can close.",
      startBy: new Date(Date.UTC(2026, 9, 10, 9, 0)),
      deadline: new Date(Date.UTC(2026, 10, 1, 17, 30)),
      taskId: "11111111-1111-4111-8111-111111111111",
      reminderId: "22222222-2222-4222-8222-222222222222",
      siteUrl: "https://www.vezriqen.com",
      responseRequired: true,
    });
    for (const body of [email.subject, email.text, email.html]) {
      expect(bare24HourTimes(textOf(body))).toEqual([]);
    }
  });

  it("no source file formats a time itself", () => {
    // One helper or none: a screen that reaches for toLocaleTimeString is how
    // 24-hour output comes back.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
          walk(path);
          continue;
        }
        if (!/\.tsx?$/.test(entry)) continue;
        if (path.endsWith(join("lib", "time.ts"))) continue;
        const source = readFileSync(path, "utf8");
        if (/toLocaleTimeString|toLocaleDateString|toLocaleString|new Intl\.DateTimeFormat/.test(source)) {
          offenders.push(path);
        }
      }
    };
    walk("src");
    expect(offenders).toEqual([]);
  });
});
