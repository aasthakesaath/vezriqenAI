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
    summary: "2 overdue · 3 due today",
    tasks: Array.from({ length: taskCount }, (_, i) => row(i)),
  };
}

describe("§4.5 — three important things, applied inside each goal", () => {
  /**
   * The mockup shows five rows plus "Show 5 more", which is ten rows on one
   * screen. §4 exists to keep this simpler than a task manager and §4.5 caps
   * the day at three priority actions; grouping by goal changes which SET the
   * cap applies to, not the cap.
   */
  it("shows three rows and says how many are behind the control", () => {
    const markup = html(<TodayGoalSections sections={[section("g1", 7)]} />);
    expect(count(markup, /Task \d/)).toBe(3);
    expect(text(markup)).toContain("Show 4 more");
    expect(text(markup)).not.toContain("Task 3");
  });

  it("offers no control when three or fewer need attention", () => {
    const markup = html(<TodayGoalSections sections={[section("g1", 3)]} />);
    expect(count(markup, /Task \d/)).toBe(3);
    expect(text(markup)).not.toContain("more");
  });

  it("never renders a backlog, however many goals there are", () => {
    const many = ["a", "b", "c", "d", "e"].map((id) => section(id, 12));
    const markup = html(<TodayGoalSections sections={many} />);
    // Three per section and no more, whether the section is open or closed —
    // 60 eligible tasks across five goals put 15 rows in the document, of
    // which one section's worth is on screen.
    expect(count(markup, /Task \d/)).toBe(3 * many.length);
    expect(text(markup)).not.toContain("Task 3");
    expect(count(markup, "Show 9 more")).toBe(many.length);
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

  it("keeps Done, Partly, Not done and I'm stuck at the top level", () => {
    for (const label of ["Done", "Partly", "Not done", "I’m stuck"]) {
      expect(markup).toContain(label);
    }
  });

  it("keeps Snooze, one tap away rather than gone", () => {
    expect(text(markup)).toContain("Snooze a day");
    // Behind a control that says it is closed, not hidden with no way back.
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("More");
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

describe("a collapsed section still says what is inside it", () => {
  const sections = [section("g1", 2), section("g2", 2), section("g3", 2)];
  const markup = html(<TodayGoalSections sections={sections} />);

  it("opens the first and closes the rest, as drawn", () => {
    expect(markup).toMatch(/id="today-section-g1"(?! hidden)/);
    expect(markup).toContain('id="today-section-g2" hidden=""');
    expect(markup).toContain('id="today-section-g3" hidden=""');
  });

  it("puts the count on the header, so closing tidies rather than hides", () => {
    // Twice per section: the desktop pill and the line that replaces it below
    // 640px, where the pill would squeeze the goal name to nothing.
    expect(count(markup, "2 overdue · 3 due today")).toBe(sections.length * 2);
  });

  it("marks every header with the state it is in", () => {
    expect(count(markup, 'aria-expanded="true"')).toBe(1);
    expect(count(markup, 'aria-controls="today-section-g2"')).toBeGreaterThan(0);
  });

  it("keeps the panel in the document rather than unmounting it", () => {
    // `hidden`, not removed: in-page find still reaches the text and a screen
    // reader's cursor is not surprised by content appearing from nowhere.
    expect(markup).toContain('hidden=""');
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
