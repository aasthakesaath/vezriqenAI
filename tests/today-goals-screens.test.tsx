import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import TodayGoalSections, {
  type TodaySectionView,
  type TodayTaskView,
} from "@/components/app/TodayGoalSections";
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
    ...overrides,
  };
}

function section(id: string, taskCount: number): TodaySectionView {
  return {
    goalId: id,
    goalLabel: `Goal ${id}`,
    icon: "trophy",
    tasks: Array.from({ length: taskCount }, (_, i) => row(i)),
  };
}

/* ---------------------------------------------------------------------------
 * §4.5 is now a property of the PAGE, not of this component.
 *
 * The cap used to be applied here — three rows per section, with a "Show 9
 * more" under each. Five goals then put fifteen rows in the document and
 * offered forty-five more, which is a task manager with headings on it. The
 * cap moved to lib/plan/goal-today's capTodaySections, which trims to three
 * across the whole screen before anything is rendered; the arithmetic is
 * covered in today-by-goal.test.ts.
 *
 * What is asserted here is that this component has no second opinion: it draws
 * exactly what it is handed, and it offers no control that would reveal more.
 * ------------------------------------------------------------------------- */
describe("§4.5 — the page shows three things, and this draws what it is given", () => {
  it("renders every row it is handed and hides none of them", () => {
    const markup = html(<TodayGoalSections sections={[section("g1", 3)]} />);
    expect(count(markup, /Task \d/)).toBe(3);
    for (const title of ["Task 0", "Task 1", "Task 2"]) {
      expect(text(markup)).toContain(title);
    }
  });

  it("offers no way to unfold a backlog", () => {
    // "Show 4 more" was the control that let one goal put ten rows on the
    // screen. The rest of the work lives on the goals page now.
    const markup = html(<TodayGoalSections sections={[section("g1", 3)]} />);
    expect(text(markup)).not.toMatch(/Show \d+ more/);
    expect(text(markup)).not.toContain("Show fewer");
  });

  it("points at the goals page for everything it is not showing", () => {
    const markup = html(<TodayGoalSections sections={[section("g1", 2)]} />);
    expect(text(markup)).toContain("Open Goal g1");
    expect(markup).toContain('href="/goals/g1"');
  });
});

/* ---------------------------------------------------------------------------
 * The card explains the work before it asks whether the work is done.
 * ------------------------------------------------------------------------- */
describe("§13 — a task says how to do it", () => {
  const markup = html(<TodayGoalSections sections={[section("g1", 2)]} />);

  it("gives every row a way to expand into steps", () => {
    expect(count(markup, "Show me how")).toBe(2);
  });

  it("asks for the steps only when someone asks — not on page load", () => {
    // The panel is in the document and hidden, so in-page find reaches it and
    // a screen reader's cursor is not surprised. The fetch is behind the
    // control: three cards must not be three model calls on first paint.
    expect(markup).toContain('id="steps-task-0" hidden=""');
    expect(count(markup, 'aria-expanded="false"')).toBe(2);
  });

  it("puts the steps above the check-in buttons", () => {
    // A row that asks "did you do it?" before it has said how is the
    // arrangement this replaces.
    expect(markup.indexOf("Show me how")).toBeLessThan(markup.indexOf("I’m stuck"));
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
    const markup = html(<TodayGoalSections sections={[section("g1", 3)]} />);
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

/* ---------------------------------------------------------------------------
 * Sections do not collapse any more, and they carry no counts.
 *
 * Both existed to make a long list survivable: a section had to be closable,
 * and a closed section had to state what was inside it so that closing was
 * tidying rather than hiding. With three rows on the whole page there is
 * nothing to tidy — and a control that can hide the only task on the screen is
 * worse than no control. The per-goal count went with it: "12 overdue" beside
 * a goal name is the wall this screen removed, one goal at a time.
 * ------------------------------------------------------------------------- */
describe("a goal section is a heading and its rows", () => {
  const sections = [section("g1", 1), section("g2", 1), section("g3", 1)];
  const markup = html(<TodayGoalSections sections={sections} />);

  it("shows every section's rows without anything to open first", () => {
    expect(count(markup, /Task \d/)).toBe(3);
    for (const id of ["g1", "g2", "g3"]) expect(text(markup)).toContain(`Goal ${id}`);
  });

  it("names each goal with a heading rather than a toggle", () => {
    expect(count(markup, 'id="today-goal-g1"')).toBe(1);
    // The only aria-expanded left on the screen belongs to the steps panel on
    // each row, which is a real disclosure over real content.
    expect(count(markup, 'aria-expanded')).toBe(sections.length);
    expect(markup).toContain('aria-controls="steps-task-0"');
  });

  it("counts nothing on a goal header", () => {
    expect(text(markup)).not.toContain("2 overdue · 3 due today");
    expect(text(markup)).not.toMatch(/\d+ overdue ·/);
  });
});

describe("§4.6 — overdue is stated, not scolded", () => {
  const markup = html(
    <TodayGoalSections
      sections={[
        {
          ...section("g1", 1),
          tasks: [row(0, { badge: "30 days overdue", dateLabel: "Due 10 Aug 2025" })],
        },
      ]}
    />,
  );

  it("says the fact in words, so the status is not colour alone", () => {
    expect(text(markup)).toContain("30 days overdue");
  });

  it("does not put an alarm glyph on the row", () => {
    // The mockup's overdue marker is a saturated red disc with an exclamation
    // mark. The disc stays; the exclamation does not.
    const rowMarkup = markup.slice(markup.indexOf("<li"));
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
    const markup = html(<TodayGoalSections sections={[]} />);
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
      "src/components/app/TodayGoalSections.tsx",
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
