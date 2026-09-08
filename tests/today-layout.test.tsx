import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import TodayGoalSections, {
  type TodaySectionView,
} from "@/components/app/TodayGoalSections";
import GoalsScreen from "@/components/app/GoalsScreen";
import { goalLabel, goalStatement } from "@/lib/goal-label";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  usePathname: () => "/today",
}));

const html = (node: React.ReactElement) => renderToStaticMarkup(node);
const text = (markup: string) => markup.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

/** A real SMART statement: the shape that kept leaking into name slots. */
const STATEMENT =
  "By Dec 31, 2026, turn Calyqen into a profitable product with 500 paying users, " +
  "a repeatable acquisition channel and a support process that does not depend on me.";

/** Every three-word run in the statement. One appearing in a name is the bug. */
function shingles(sentence: string): string[] {
  const words = sentence.split(/\s+/);
  return words.slice(0, -2).map((_, i) => words.slice(i, i + 3).join(" "));
}

function section(overrides: Partial<TodaySectionView> = {}): TodaySectionView {
  return {
    goalId: "g1",
    goalLabel: "Build Calyqen",
    icon: "briefcase",
    summary: "2 overdue · 3 due today",
    tasks: [
      {
        id: "t1",
        title: "Ask the first host organization",
        reason: "Someone else has to act before this can close.",
        badge: "5 days overdue",
        urgency: "overdue",
        dateLabel: "Due 4 Sept",
        estimatedMinutes: 30,
        milestoneTitle: null,
        reminderId: null,
      },
    ],
    ...overrides,
  };
}

/* ---------------------------------------------------------------------------
 * A goal's name is never a slice of its statement.
 *
 * This shipped twice: as the goal page's heading, and again as a Today section
 * header reading "By Dec 31, 2026, turn Caly…". Both times the mechanism was
 * the same — goalLabel fell back to the first six words of normalized_goal
 * when short_label was missing, and CSS then cut that a second time mid-word.
 * A truncated sentence looks enough like a name to survive review, which is
 * why this is asserted rather than watched for.
 * ------------------------------------------------------------------------- */
describe("a goal name is a name, never the SMART statement", () => {
  it("never derives one from the statement, however short the statement is", () => {
    expect(goalLabel({ normalized_goal: STATEMENT })).toBe("Your goal");
    expect(goalLabel({ normalized_goal: "Run a marathon by June" })).toBe("Your goal");
    for (const run of shingles(STATEMENT)) {
      expect(goalLabel({ normalized_goal: STATEMENT }), run).not.toContain(run);
    }
  });

  it("uses the six-word label extraction wrote", () => {
    expect(goalLabel({ short_label: "Build Calyqen", normalized_goal: STATEMENT })).toBe(
      "Build Calyqen",
    );
  });

  /**
   * The user's own words are a name; the generated paragraph is not. Someone
   * who typed "Run a half marathon" should see that back rather than
   * "Your goal" — but a pasted paragraph in the same column is still a
   * paragraph, so length and sentence structure decide.
   */
  it("falls back to the user's own wording when it is short enough to be a name", () => {
    expect(goalLabel({ user_goal_text: "Run a half marathon" })).toBe("Run a half marathon");
    expect(
      goalLabel({ user_goal_text: "I want to run a half marathon. I have never run before." }),
    ).toBe("Your goal");
    expect(goalLabel({ user_goal_text: "x".repeat(200) })).toBe("Your goal");
  });

  it("still hands the full statement to the surfaces that are meant to show it", () => {
    // §6 — the approved statement is preserved and shown where the user is
    // agreeing to it. Only the NAME slots are restricted.
    expect(goalStatement({ normalized_goal: STATEMENT })).toBe(STATEMENT);
  });

  it("puts no part of the statement on Today", () => {
    const markup = html(<TodayGoalSections sections={[section()]} />);
    for (const run of shingles(STATEMENT)) expect(text(markup), run).not.toContain(run);
  });

  it("puts no part of the statement in a My Goals card name", () => {
    const markup = html(
      <GoalsScreen
        goals={[
          {
            id: "g1",
            label: goalLabel({ normalized_goal: STATEMENT }),
            summary: "",
            icon: "briefcase",
            health: "at_risk",
            targetDate: "31 Dec 2026",
            nextMilestone: "Launch next feature",
            counts: { total: 20, done: 16, percentComplete: 80, overdue: 1, dueThisWeek: 3 },
          },
        ]}
      />,
    );
    for (const run of shingles(STATEMENT)) expect(text(markup), run).not.toContain(run);
  });

  it("resolves the name before it reaches a component", () => {
    // Components take a resolved string. A component that could see
    // normalized_goal is a component that could render it as a name.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
          walk(path);
          continue;
        }
        if (!/\.tsx?$/.test(entry)) continue;
        // TargetCard is the approval screen: showing the statement is its job.
        if (path.endsWith(join("plan", "TargetCard.tsx"))) continue;
        if (/normalized_goal/.test(readFileSync(path, "utf8"))) offenders.push(path);
      }
    };
    walk("src/components");
    expect(offenders).toEqual([]);
  });

  it("does not cut a name with CSS either", () => {
    // `truncate` is text-overflow: ellipsis, which cuts mid-word — the second
    // half of how "turn Caly…" reached the screen. A short name wraps.
    const markup = html(<TodayGoalSections sections={[section()]} />);
    const header = markup.slice(0, markup.indexOf("Build Calyqen"));
    expect(header).not.toContain("truncate");
  });
});

/* ---------------------------------------------------------------------------
 * Boxes that overlap the box below them.
 *
 * Three times on this screen. Every instance was the same mechanism: a
 * VERTICAL negative margin pulling an element up into its stacked sibling.
 * The last one was `-mt-2` on the Today section's mobile count line, which
 * overlapped the header by exactly 8px at every width below 640.
 *
 * Geometry needs a browser, and this suite has none — the overlap detector
 * that found it drives the real pages in Chromium and is part of the release
 * checks. What runs here is the rule that mechanism breaks, because a static
 * rule is what stops the fourth instance being written in the first place.
 *
 * Horizontal negative margins are left alone: `-mx-1` paired with `px-1` is
 * the standard way to stop a scroll container clipping a focus ring, it
 * cancels itself out, and it cannot pull one stacked card into another.
 * ------------------------------------------------------------------------- */
describe("nothing is pulled into the box above it", () => {
  it("uses no vertical negative margin anywhere in the UI", () => {
    const vertical = /(?:^|[\s"'`])-m[tby]-[0-9.]+/;
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
          walk(path);
          continue;
        }
        if (!/\.tsx$/.test(entry)) continue;
        const source = readFileSync(path, "utf8");
        for (const line of source.split("\n")) {
          if (vertical.test(line)) offenders.push(`${path}: ${line.trim().slice(0, 80)}`);
        }
      }
    };
    walk("src/components");
    walk("src/app");
    expect(offenders).toEqual([]);
  });
});

/* ---------------------------------------------------------------------------
 * The coach must be able to grow.
 *
 * §13 makes the Execution Block Coach the core interaction, and it opens
 * INSIDE a task row: the panel is taller than everything else on the screen,
 * and it grows again when the intervention arrives. Any ancestor that clips
 * or fixes height turns "the write worked" into "the screen is broken".
 * ------------------------------------------------------------------------- */
describe("no ancestor can clamp the Execution Block Coach", () => {
  const sources = [
    "src/components/app/TodayGoalSections.tsx",
    "src/components/goal/GoalTaskList.tsx",
  ];

  it("clips nothing on the path from the card to the coach", () => {
    for (const path of sources) {
      const source = readFileSync(path, "utf8");
      // Only in className strings — the word appears in the comment explaining
      // why it is gone, and that comment is the point.
      const classNames = [...source.matchAll(/className=[{`"]([^"`]*)[`"}]/g)].map((m) => m[1]);
      for (const cls of classNames) {
        expect(cls, `${path}: ${cls}`).not.toMatch(/\boverflow-hidden\b/);
        expect(cls, `${path}: ${cls}`).not.toMatch(/\bmax-h-/);
        expect(cls, `${path}: ${cls}`).not.toMatch(/\bh-screen\b/);
        // A fixed height WITHOUT a matching width is a container being
        // clamped. With one it is a glyph being sized — `h-9 w-9` on the
        // urgency disc is not what swallows a coach panel.
        const height = /(?:^|\s)h-(\[[^\]]+\]|\d+)/.exec(cls);
        if (height) {
          expect(cls, `${path}: fixed height with no matching width: ${cls}`).toMatch(
            /(?:^|\s)w-(\[[^\]]+\]|\d+|auto|full)/,
          );
        }
      }
    }
  });

  it("keeps the rounded corners it gave up overflow-hidden for", () => {
    const closed = html(<TodayGoalSections sections={[section()]} />);
    expect(closed).toContain("rounded-2xl");
  });
});
