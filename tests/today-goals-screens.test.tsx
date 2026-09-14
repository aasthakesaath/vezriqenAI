import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import TodayTasks, { type TodayTaskView } from "@/components/app/TodayTasks";
import {
  TODAY_TASK_LIMIT,
  selectTopToday,
  type TodayGoalSection,
} from "@/lib/plan/goal-today";
import TaskActions from "@/components/app/TaskActions";
import ProgressRing from "@/components/app/ProgressRing";
import Icon from "@/components/icons/Icon";

/**
 * The two screens, as markup.
 *
 * `next/navigation` has no router in a unit test, and TaskActions needs one to
 * refresh after a check-in. Mocked the same way tests/app-nav.test.tsx mocks
 * `usePathname`.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  usePathname: () => "/today",
}));

const html = (node: React.ReactElement) => renderToStaticMarkup(node);
const text = (markup: string) => markup.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
const count = (markup: string, needle: string | RegExp) =>
  markup.match(typeof needle === "string" ? new RegExp(needle, "g") : new RegExp(needle, "g"))
    ?.length ?? 0;

function row(index: number, overrides: Partial<TodayTaskView> = {}): TodayTaskView {
  return {
    id: `task-${index}`,
    title: `Task ${index}`,
    reason: "Because it is the next thing that moves this forward.",
    badge: "30 days overdue",
    urgency: "overdue",
    dateLabel: "Due 10 Aug 2025",
    estimatedMinutes: 30,
    milestoneTitle: "Independent validation",
    reminderId: null,
    goalId: "g1",
    goalLabel: "Goal g1",
    icon: "trophy",
    ...overrides,
  };
}

const cards = (count: number, overrides: Partial<TodayTaskView> = {}) =>
  Array.from({ length: count }, (_, i) => row(i, overrides));

/** A goal's worth of eligible work, as selectTodayByGoal returns it. */
function section(id: string, taskCount: number): TodayGoalSection {
  const tasks = Array.from({ length: taskCount }, (_, i) => ({
    id: `${id}-${i}`,
    title: `Task ${id}${i}`,
    rationale: null,
    taskType: "simple_action",
    status: "not_started",
    priority: 3,
    deadline: null,
    startBy: null,
    estimatedMinutes: null,
    milestoneTitle: null,
    waitingOn: null,
    reason: "Because it is the next thing that moves this forward.",
    // Descending, so the first task of a section is its most pressing one.
    rank: 100 - i,
    urgency: {
      kind: "overdue" as const,
      label: "30 days overdue",
      dateLabel: "Due 10 Aug 2025",
      daysLate: 30,
    },
  }));
  return {
    goalId: id,
    goalLabel: `Goal ${id}`,
    goalTitle: `Goal ${id}`,
    tasks,
    counts: { overdue: taskCount, dueToday: 0, startNow: 0 },
    summary: `${taskCount} overdue`,
  };
}

describe("§4.5 — three important things, applied to the PAGE", () => {
  /**
   * The cap used to be applied per goal SECTION: three rows in each, and as
   * many sections as the person had goals. Four goals meant twelve rows on one
   * screen under a line reading "33 things are past the date Vezri worked back
   * to", which is a backlog with a scoreboard on it — the thing §4.5 and §4.6
   * each rule out on their own.
   *
   * So the cap moved to the page, and it is enforced in selectTopToday rather
   * than by the renderer: a component that has to remember to slice is a
   * component that will one day forget.
   */
  it("never returns more than three, however many goals there are", () => {
    const many = ["a", "b", "c", "d", "e"].map((id) => section(id, 12));
    expect(selectTopToday(many, TODAY_TASK_LIMIT)).toHaveLength(3);
  });

  // The rule that made the per-goal version defensible, kept: a second goal
  // with work past its date must not be crowded out by one goal's backlog.
  it("gives every goal its first card before any goal gets a second", () => {
    const chosen = selectTopToday(["a", "b", "c"].map((id) => section(id, 5)), 3);
    expect(chosen.map((task) => task.goalId)).toEqual(["a", "b", "c"]);
  });

  it("only doubles up on a goal once every other goal has had a turn", () => {
    const chosen = selectTopToday([section("a", 5), section("b", 1)], 3);
    expect(chosen.map((task) => task.goalId)).toEqual(["a", "b", "a"]);
    // And the second card from goal a is its SECOND task, not its first again.
    expect(chosen[2]!.id).toBe("a-1");
  });

  it("returns everything there is when that is fewer than three", () => {
    expect(selectTopToday([section("a", 2)], 3)).toHaveLength(2);
    expect(selectTopToday([], 3)).toHaveLength(0);
  });

  it("draws exactly what it is given, and offers no way to unfold more", () => {
    const markup = html(<TodayTasks tasks={cards(3)} />);
    expect(count(markup, /Task \d/)).toBe(3);
    // "Show 9 more" was the control that turned three rows into twelve. The
    // rest of the plan is on /goals, which is built for reading a backlog.
    expect(text(markup)).not.toContain("Show");
    expect(text(markup)).toContain("Open Goal g1");
  });
});

/* ---------------------------------------------------------------------------
 * §13 "didn't know how to start" — answered before the work is missed.
 *
 * A card offered Done, Not done and I'm stuck and never once said HOW. The
 * barrier was already one of the eight the coach asks about, so the product
 * knew this was real and still only answered it after the fact.
 * ------------------------------------------------------------------------- */
describe("a task card expands into the steps", () => {
  const markup = html(<TodayTasks tasks={cards(1)} />);

  it("puts the question on every card", () => {
    expect(text(markup)).toContain("How do I do this?");
  });

  it("uses the accordion pattern the rest of the product uses", () => {
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('aria-controls="today-task-task-0"');
    expect(markup).toContain('id="today-task-task-0" hidden=""');
  });

  it("does not pay for the model call until it is opened", () => {
    // The panel is mounted only when open, and mounting TaskGuidance is what
    // fires POST /api/tasks/[id]/guidance. A closed card must cost nothing.
    expect(text(markup)).not.toContain("Working out the steps");
  });
});

describe("§13 — every row can reach the Execution Block Coach", () => {
  /**
   * The single most important assertion in this file. "Not done" and "I'm
   * stuck" are the two states the check-in API answers `needs_coach` for, so a
   * row that cannot say either has quietly removed the product's core
   * differentiator rather than tidied a button away.
   */
  it("gives every visible row both routes into the coach", () => {
    const markup = html(<TodayTasks tasks={cards(3)} />);
    expect(count(markup, "Not done")).toBe(3);
    expect(count(markup, "I’m stuck")).toBe(3);
  });

  it("keeps I'm stuck a real button rather than an option inside a menu", () => {
    const markup = html(<TaskActions taskId="t1" onNeedsCoach={() => {}} />);
    const stuck = markup.slice(0, markup.indexOf("I’m stuck"));
    // The last element opened before the label is the button carrying it.
    expect(stuck.lastIndexOf("<button")).toBeGreaterThan(stuck.lastIndexOf("hidden"));
  });
});

describe("§12 — the response set reports what actually happened", () => {
  const markup = html(<TaskActions taskId="t1" onNeedsCoach={() => {}} />);

  it("offers Done, Not done and I'm stuck, all at the top level", () => {
    for (const label of ["Done", "Not done", "I’m stuck"]) {
      expect(markup).toContain(label);
    }
    // Three buttons, and nothing behind a disclosure: at 375px the row wraps
    // to two lines rather than hiding the one that opens the coach.
    expect(markup.match(/<button/g)).toHaveLength(3);
    expect(markup).not.toContain("hidden");
    expect(markup).not.toContain("aria-expanded");
  });

  /**
   * Retired 2026-09-09 (owner decision), and asserted absent rather than
   * simply deleted from the test: both wrote a status nothing read correctly,
   * and a button with no consequence is the kind of thing that comes back.
   *
   *  - "Partly" wrote `partial`, which sits outside both of Goal Health's open
   *    sets — tapping it on an overdue task RAISED the score and recorded
   *    nothing about what was left.
   *  - "Snooze" wrote `snoozed`, which is outside every open set, and nothing
   *    has ever read `snooze_until`: the task left Today and never returned.
   *  - "More" existed only to hold Snooze.
   */
  it("offers no Partly, no Snooze and no More", () => {
    for (const gone of ["Partly", "Snooze", "More", "Fewer options"]) {
      expect(text(markup), `${gone} is retired`).not.toContain(gone);
    }
  });

  it("offers no Start, which nothing records", () => {
    expect(text(markup)).not.toMatch(/\bStart\b/);
  });

  it("uses no three-dot menu anywhere", () => {
    expect(markup).not.toContain("⋯");
    expect(markup).not.toContain("•••");
    expect(text(markup)).not.toContain("...");
  });
});

describe("every card says which goal it belongs to", () => {
  /**
   * The goal used to be a section header and the cards sat under it. With the
   * sections gone the name has to be ON the card, or three cards from three
   * goals read as one undifferentiated list — which is how work from a goal
   * someone had stopped thinking about looks identical to work from the one
   * they came here for.
   */
  const markup = html(
    <TodayTasks
      tasks={[
        row(0, { goalId: "g1", goalLabel: "Build Calyqen" }),
        row(1, { goalId: "g2", goalLabel: "Run a half marathon" }),
      ]}
    />,
  );

  it("names the goal on each card", () => {
    expect(text(markup)).toContain("Build Calyqen");
    expect(text(markup)).toContain("Run a half marathon");
  });

  it("links each card to the goal it came from", () => {
    expect(markup).toContain('href="/goals/g1"');
    expect(markup).toContain('href="/goals/g2"');
  });

  it("wraps the name rather than cutting it", () => {
    // `truncate` is text-overflow: ellipsis, which cuts mid-word. It is half
    // of how "By Dec 31, 2026, turn Caly…" reached this screen.
    expect(markup).not.toContain("truncate");
  });
});

describe("§4.6 — overdue is stated, not scolded", () => {
  const markup = html(
    <TodayTasks tasks={[row(0, { badge: "30 days overdue", dateLabel: "Due 10 Aug 2025" })]} />,
  );

  it("says the fact in words, so the status is not colour alone", () => {
    expect(text(markup)).toContain("30 days overdue");
  });

  it("does not put an alarm glyph on the row", () => {
    // The mockup's overdue marker is a saturated red disc with an exclamation
    // mark. The disc stays; the exclamation does not.
    const rowMarkup = markup.slice(markup.indexOf("<article"));
    expect(rowMarkup).not.toContain("!");
    expect(rowMarkup).not.toContain("⚠");
  });

  it("uses no red, only the product's own palette", () => {
    expect(markup).not.toMatch(/\b(bg|text|border)-(red|rose|amber|orange|yellow)-\d{2,3}\b/);
  });

  it("leaves the badge a sentence for a screen reader, uppercasing it in CSS", () => {
    expect(markup).toContain("uppercase");
    expect(markup).not.toContain("30 DAYS OVERDUE");
  });
});

describe("the empty state is not a failure state", () => {
  it("says being caught up is a good place to be", () => {
    const markup = html(<TodayTasks tasks={[]} />);
    expect(text(markup)).toContain("Nothing needs you today");
  });
});

describe("§15 — the ring counts tasks and says so", () => {
  it("names what it measures next to the number", () => {
    const markup = html(<ProgressRing percent={62} />);
    expect(text(markup)).toContain("62%");
    expect(text(markup)).toContain("of tasks done");
  });

  /**
   * §15: health "must be more than percent of tasks completed". A ring that
   * turned green at 80% and orange at 55% would BE the health verdict, drawn
   * from the one input §15 rejects. One colour at every value is what keeps
   * the two apart.
   */
  it("is the same colour at every value, so it cannot imply health", () => {
    const strokes = (markup: string) => markup.match(/stroke-[a-z-]+/g)?.sort();
    expect(strokes(html(<ProgressRing percent={12} />))).toEqual(
      strokes(html(<ProgressRing percent={94} />)),
    );
  });

  it("draws nothing at 0 and closes at 100", () => {
    expect(html(<ProgressRing percent={0} />)).toContain('stroke-dashoffset="163.36');
    expect(html(<ProgressRing percent={100} />)).toContain('stroke-dashoffset="0"');
  });

  it("cannot draw outside itself on a bad input", () => {
    expect(text(html(<ProgressRing percent={-40} />))).toContain("0%");
    expect(text(html(<ProgressRing percent={640} />))).toContain("100%");
  });
});

describe("goal icons are one drawn set", () => {
  it("is decorative: the goal's name is already beside it", () => {
    const markup = html(<Icon name="trophy" />);
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain("<svg");
  });

  it("uses no emoji anywhere the two screens draw a goal", () => {
    // An emoji renders as a different picture on every platform and brings its
    // own colour into Palette A.
    const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
    for (const file of [
      "src/components/icons/Icon.tsx",
      "src/lib/goal-icon.ts",
      "src/components/app/TodayTasks.tsx",
      "src/components/app/StartFromToday.tsx",
      "src/components/app/TodayScreen.tsx",
      "src/components/app/GoalsScreen.tsx",
      "src/app/(app)/today/page.tsx",
      "src/app/(app)/goals/page.tsx",
    ]) {
      expect(emoji.test(readFileSync(file, "utf8")), file).toBe(false);
    }
  });

  it("draws every icon on the same grid with the same stroke", () => {
    for (const name of ["trophy", "book", "graduation", "briefcase", "goal"] as const) {
      const markup = html(<Icon name={name} />);
      expect(markup).toContain('viewBox="0 0 24 24"');
      expect(markup).toContain('stroke-width="1.7"');
      expect(markup).toContain('stroke="currentColor"');
    }
  });
});
