import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import GoalHeader from "@/components/goal/GoalHeader";
import GoalTabs from "@/components/goal/GoalTabs";
import GoalTaskList, { type GoalTaskView } from "@/components/goal/GoalTaskList";
import CompletedTaskList from "@/components/goal/CompletedTaskList";
import NextMilestoneCard from "@/components/goal/NextMilestoneCard";
import HealthCard from "@/components/app/HealthCard";
import { goalLabel, goalSummary } from "@/lib/goal-label";
import { GOAL_TABS } from "@/lib/plan/goal-tabs";
import { calculateHealth } from "@/lib/health/score";

// The check-in buttons refresh the route after a save. There is no app router
// in a server-render test, and the mock keeps the assertion on the markup
// rather than on Next's internals.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

/**
 * The goal page, held to the rules that a redesign loses first.
 *
 * Rendered rather than asserted against a screenshot where the rule is about
 * markup — a hidden panel, an aria-current, a button that must exist at every
 * width — and read off the source where the rule is about what the PAGE puts
 * where, which no single component can answer.
 */

const GOAL = {
  short_label: "TIME Kid of the Year",
  normalized_goal:
    "By 31 December 2026, turn Calyqen's community workshops into measurable, independently " +
    "verified impact by running twelve sessions, publishing outcomes for at least three hundred " +
    "participants, and obtaining written verification from two partner organisations.",
};

const textOf = (markup: string) =>
  markup
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;|&apos;|&rsquo;/g, "'")
    .replace(/&[a-z]+;|&#\d+;/gi, " ")
    // The product writes a typographic apostrophe; the assertions read like
    // the button label a person would say.
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

function taskView(overrides: Partial<GoalTaskView> = {}): GoalTaskView {
  return {
    id: Math.random().toString(36).slice(2),
    title: "Ask the youth centre for a verification letter",
    reason: "it is a key piece of independent validation",
    urgencyKind: "overdue",
    urgencyLabel: "30 days overdue",
    dateLabel: "Due 10 Aug",
    estimatedMinutes: 20,
    milestoneTitle: "Independent validation",
    waitingOn: null,
    reminderId: null,
    ...overrides,
  };
}

describe("the heading is the goal's NAME", () => {
  const markup = renderToStaticMarkup(
    <GoalHeader
      label={goalLabel(GOAL)}
      summary={goalSummary(GOAL)}
      targetDate="2026-12-31"
      achieved={false}
    />,
  );

  it("renders the short label, never the SMART statement", () => {
    expect(markup).toContain("<h1");
    const heading = markup.match(/<h1[^>]*>([^<]*)</)?.[1];
    expect(heading).toBe("TIME Kid of the Year");
  });

  it("is not a statement cut mid-word", () => {
    // The bug this page replaces: "By Dec 31, 2026, turn Caly…" as the title.
    const heading = markup.match(/<h1[^>]*>([^<]*)</)?.[1] ?? "";
    expect(heading).not.toContain("…");
    expect(heading).not.toMatch(/^By \d/);
  });

  it("says the target date with the year on it", () => {
    // "31 Dec" beside a two-year plan does not say which December.
    expect(textOf(markup)).toContain("Target: 31 Dec 2026");
  });

  it("goes back to My Goals, not to Today", () => {
    expect(markup).toContain('href="/goals"');
    expect(textOf(markup)).toContain("Back to My Goals");
  });

  it("describes the goal in one line that never breaks mid-word", () => {
    const summary = goalSummary(GOAL);
    expect(summary.length).toBeLessThanOrEqual(155);

    // The property that matters: what is shown is a prefix of what the user
    // approved, and it stops at a word boundary. "turn Caly…" is the bug.
    const kept = summary.replace(/…$/, "");
    expect(GOAL.normalized_goal.startsWith(kept)).toBe(true);
    expect(GOAL.normalized_goal[kept.length]).toBe(" ");
  });

  it("prefers a whole first sentence when there is one", () => {
    expect(goalSummary({ normalized_goal: "Run twelve workshops. Then publish the outcomes." })).toBe(
      "Run twelve workshops.",
    );
  });
});

describe("the five views are real URLs", () => {
  const markup = renderToStaticMarkup(<GoalTabs goalId="g1" current="today" />);

  it("offers Overview, Today, Week, Month and Full Plan", () => {
    expect(GOAL_TABS.map((tab) => tab.label)).toEqual([
      "Overview",
      "Today",
      "Week",
      "Month",
      "Full Plan",
    ]);
    for (const tab of GOAL_TABS) expect(markup).toContain(`href="/goals/g1?view=${tab.id}"`);
  });

  it("marks exactly one as the page you are on", () => {
    // Two aria-currents tells a screen reader user they are in two places.
    expect(markup.match(/aria-current="page"/g)).toHaveLength(1);
    expect(markup).toMatch(/href="\/goals\/g1\?view=today"[^>]*aria-current="page"/);
  });

  it("is links, not a tablist", () => {
    expect(markup).not.toContain('role="tab"');
    expect(markup).toContain('aria-label="Goal views"');
  });
});

describe("Today's Tasks", () => {
  const many = Array.from({ length: 8 }, (_, index) =>
    taskView({ title: `Task ${index + 1}`, id: `t${index + 1}` }),
  );
  const markup = renderToStaticMarkup(
    <GoalTaskList tasks={many} summary="2 overdue · 3 due today" visibleCount={3} />,
  );

  it("shows three rows and offers the rest (§4.5)", () => {
    expect(markup.match(/<li /g)).toHaveLength(3);
    expect(textOf(markup)).toContain("Show 5 more");
  });

  it("carries the count line and announces it when it changes", () => {
    expect(textOf(markup)).toContain("2 overdue · 3 due today");
    expect(markup).toContain('aria-live="polite"');
  });

  it("gives the load-more control both of its states", () => {
    expect(markup).toMatch(/aria-expanded="false"[^>]*aria-controls="/);
  });

  it("puts every visible row one tap from the coach (§13)", () => {
    // "I'm stuck" is the entry to the Execution Block Coach and is never
    // behind a menu, never dropped at a narrow width, and never on only some
    // of the rows.
    const stuck = textOf(markup).match(/I'm stuck/g);
    expect(stuck).toHaveLength(3);
    const notDone = textOf(markup).match(/Not done/g);
    expect(notDone).toHaveLength(3);
  });

  it("offers the three responses a row can record", () => {
    const text = textOf(markup);
    for (const action of ["Done", "Not done", "I'm stuck"]) {
      expect(text, `missing "${action}"`).toContain(action);
    }
  });

  /** Retired 2026-09-09 — see tests/today-goals-screens.test.tsx for why. */
  it("offers no Partly, no Snooze and no More", () => {
    const text = textOf(markup);
    for (const gone of ["Partly", "Snooze", "More", "Fewer options"]) {
      expect(text, `${gone} is retired`).not.toContain(gone);
    }
  });

  it("keeps all three reachable at 375px, none behind a disclosure", () => {
    // Nine buttons for three rows, and the only aria-expanded on the card is
    // the list's own "Show N more" — none of the actions is inside a panel
    // that can be closed.
    const rows = markup.slice(markup.indexOf("<ul"), markup.lastIndexOf("</ul>"));
    expect(rows.match(/<button/g)).toHaveLength(9);
    expect(rows).not.toContain("aria-expanded");
    // The `hidden` ATTRIBUTE, not the substring: every icon carries
    // aria-hidden, and matching that would make this assertion meaningless.
    expect(rows).not.toMatch(/\shidden[=>\s]/);
  });

  it("states the badge as a fact, with no menu and no score", () => {
    const text = textOf(markup);
    expect(text).toContain("30 days overdue");
    expect(text).not.toMatch(/should have|you failed|you missed/i);
    expect(markup).not.toContain("⋯");
  });

  it("says so plainly when there is nothing, rather than showing an empty card", () => {
    const empty = renderToStaticMarkup(<GoalTaskList tasks={[]} summary="" visibleCount={3} />);
    expect(textOf(empty)).toContain("Nothing on this goal needs you today.");
  });

  it("names who a task waits on, and nothing more about them (§3)", () => {
    const waiting = renderToStaticMarkup(
      <GoalTaskList
        tasks={[taskView({ waitingOn: "Ms Naidoo" })]}
        summary="1 overdue"
        visibleCount={3}
      />,
    );
    const text = textOf(waiting);
    expect(text).toContain("Waiting on: Ms Naidoo");
    expect(text).not.toMatch(/invite|email them|assign/i);
  });
});

describe("completed work stays quiet", () => {
  const markup = renderToStaticMarkup(
    <CompletedTaskList
      open={false}
      onOpenChange={() => {}}
      tasks={[
        {
          id: "c1",
          title: "Finalise the workshop agenda",
          reason: "the venue needed it before booking",
          completedOn: "8 Sep",
          estimatedMinutes: 45,
          milestoneTitle: "Run the workshops",
          origin: "explicit",
          confidence: 0.9,
        },
      ]}
    />,
  );

  it("is collapsed by default", () => {
    expect(markup).toMatch(/aria-expanded="false"/);
    expect(markup).toMatch(/hidden=""/);
  });

  it("shows a check, the title, the date and View", () => {
    const text = textOf(markup);
    expect(text).toContain("Finalise the workshop agenda");
    expect(text).toContain("Completed 8 Sep");
    expect(text).toContain("View");
  });

  it("renders nothing at all when there is no history", () => {
    expect(renderToStaticMarkup(<CompletedTaskList tasks={[]} open={false} onOpenChange={() => {}} />)).toBe("");
  });
});

describe("the sidebar", () => {
  const health = calculateHealth({
    now: new Date("2026-09-08T12:00:00Z"),
    targetDate: new Date("2026-12-31T00:00:00Z"),
    activatedAt: new Date("2026-01-01T00:00:00Z"),
    planStart: new Date("2026-01-01T00:00:00Z"),
    milestones: [
      { weight: 3, status: "done", targetDate: new Date("2026-03-01T00:00:00Z") },
      { weight: 3, status: "not_started", targetDate: new Date("2026-07-01T00:00:00Z") },
    ],
    tasks: [
      {
        status: "not_started",
        priority: 1,
        deadline: new Date("2026-08-01T00:00:00Z"),
        startBy: null,
        estimatedMinutes: 60,
      },
    ],
    unansweredCheckpoints: [],
    // One checkpoint has come due and was answered, one dependency's date has
    // passed — the denominators the factors need before they can vote.
    checkpointsDue: 1,
    overdueDependencies: 1,
    dependenciesDue: 1,
    evidenceRequired: 0,
    evidenceProvided: 0,
    availableMinutes: null,
  });

  const markup = renderToStaticMarkup(
    <HealthCard
      title="Goal Health"
      score={health.score}
      status={health.status}
      factors={health.factors}
      weakest={health.weakest}
      recommendation="Ask the partner for written verification this week."
    />,
  );

  it("shows the score, the state and the factors behind them (§15)", () => {
    const text = textOf(markup);
    expect(text).toContain(`${health.score} / 100`);
    expect(text).toMatch(/On Track|Needs Attention|At Risk|Off Track|Achieved/);
    expect(text).toContain("Milestones");
    expect(text).toContain("Schedule");
  });

  it("says in plain language what is pulling the score down", () => {
    expect(textOf(markup)).toContain("Pulling it down:");
  });

  it("is honest about which half of the card the model wrote (§15)", () => {
    const text = textOf(markup);
    expect(text).toContain("Vezri recommends:");
    expect(text).toContain("Vezri can explain it, never choose it.");
  });

  it("offers a date on a milestone that has none, rather than a blank", () => {
    const undated = renderToStaticMarkup(
      <NextMilestoneCard
        goalId="g1"
        milestone={{ id: "m1", title: "Independent validation", targetDate: null, dateAnchor: null }}
        done={1}
        total={34}
      />,
    );
    const text = textOf(undated);
    expect(text).toContain("No date yet");
    expect(text).toContain("Add a date");
    expect(undated).toContain('href="/goals/g1?view=plan#milestone-m1"');
  });
});

describe("what the page puts where", () => {
  const page = readFileSync("src/app/(app)/goals/[id]/page.tsx", "utf8");

  it("renders the whole milestone list in Full Plan and nowhere else", () => {
    // The duplicate "Progress" section repeated all thirty-four milestones
    // under a view already scoped to a single day.
    expect(page).not.toMatch(/id="progress-heading"/);
    expect(page.match(/<FullPlan/g) ?? []).toHaveLength(1);
    expect(page).toMatch(/tab === "plan" && <FullPlan/);
  });

  it("builds the two sidebar cards the goal needs, and no others", () => {
    // Not a "Best Next Move", not a second Full Plan card next to the tab that
    // already exists, and not a quote from the mascot.
    const start = page.indexOf("sidebar={");
    const sidebar = page.slice(start, page.indexOf("</>", start));
    expect(sidebar.match(/<[A-Z]\w+/g)).toEqual(["<HealthCard", "<NextMilestoneCard"]);

    const src = readFileSync("src/app/(app)/goals/[id]/page.tsx", "utf8");
    for (const absent of ["Best Next Move", "View source plan"]) {
      expect(src, `${absent} was asked for elsewhere`).not.toContain(absent);
    }
  });

  it("stacks the sidebar ABOVE the task list on a narrow screen", () => {
    // One DOM order at every width: the sidebar is first in the document and
    // is placed into the second column on a wide screen, so reading order and
    // focus order agree with each other everywhere.
    const layout = readFileSync("src/components/goal/GoalLayout.tsx", "utf8");
    expect(layout.indexOf("<aside")).toBeLessThan(layout.indexOf("lg:col-start-1"));
    expect(layout).toMatch(/<aside[^>]*lg:col-start-2 lg:row-start-1/s);
    // `order` would move the boxes and leave the DOM behind.
    expect(layout).not.toMatch(/\border-\d/);
  });

  it("keeps the source document at the foot of the page, below the lists", () => {
    expect(page.indexOf("Where this came from")).toBeGreaterThan(page.indexOf("</GoalLayout>"));
    expect(page.indexOf("Where this came from")).toBeGreaterThan(page.indexOf("<CompletedTaskList"));
  });

  it("caps the visible rows with the constant §4.5 owns", () => {
    expect(page).toContain("visibleCount={VISIBLE_TASKS}");
  });
});

describe("the goal surfaces stay on the design system", () => {
  const files = [
    "src/app/(app)/goals/[id]/page.tsx",
    ...readdirSync("src/components/goal").map((file) => join("src/components/goal", file)),
    "src/components/icons/Icon.tsx",
    "src/components/app/HealthCard.tsx",
  ];

  it("uses one icon set rather than emoji", () => {
    // An emoji is a different drawing on every platform, cannot inherit a
    // colour, and reads aloud beside a heading that already says the thing.
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2190}-\u{27BF}\u{FE0F}]/u;
    for (const file of files) {
      const offending = readFileSync(file, "utf8").match(emoji);
      expect(offending, `${file} contains ${offending?.[0]}`).toBeNull();
    }
  });

  it("has no alarm palette on it (§4.6)", () => {
    // Overdue is informational here. Red sirens are how a screen of ordinary
    // slippage starts reading as a telling-off.
    const alarm = /\b(?:bg|text|border)-(?:red|orange|amber|emerald|slate|rose-\d)/;
    for (const file of files) {
      expect(alarm.test(readFileSync(file, "utf8")), `${file} reaches outside the palette`).toBe(
        false,
      );
    }
  });
});
