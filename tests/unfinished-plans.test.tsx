import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// `next/navigation` has no router in a unit test, and Delete refreshes the
// page after it succeeds.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  usePathname: () => "/goals",
}));

import UnfinishedPlans from "@/components/app/UnfinishedPlans";
import { describeUnfinished } from "@/lib/plan/unfinished";

/**
 * Plans Vezri started reading and never finished.
 *
 * Three of these accumulated in one evening — 32, 35 and 40 milestones, over a
 * hundred tasks each — and appeared on no screen at all: My Goals lists only
 * confirmed goals, and the goal dashboard redirects anything unconfirmed to
 * the review flow. They were reachable only if you still had the URL.
 */

const textOf = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const plan = {
  goalId: "9d4af9ea-8411-4a92-a009-aa7d5957dc52",
  filename: "Nikita_TIME_Kid_of_the_Year_Execution_Plan.docx",
  pasted: false,
  createdAt: "2026-09-08T16:33:22.000Z",
  progress: "Vezri read 35 milestones and 154 steps, then stopped before writing your target.",
  note: null as string | null,
};

describe("describing how far a plan got", () => {
  it("counts the work, not the passes", () => {
    // "2 of 3 passes complete" means nothing to someone holding a document.
    expect(describeUnfinished({ milestoneCount: 35, taskCount: 154, hasTarget: false })).toBe(
      "Vezri read 35 milestones and 154 steps, then stopped before writing your target.",
    );
    expect(describeUnfinished({ milestoneCount: 1, taskCount: 1, hasTarget: false })).toBe(
      "Vezri read 1 milestone and 1 step, then stopped before writing your target.",
    );
  });

  it("says so plainly when nothing was read at all", () => {
    expect(describeUnfinished({ milestoneCount: 0, taskCount: 0, hasTarget: false })).toBe(
      "Vezri hasn't read any of this plan yet.",
    );
  });

  it("does not claim the target is missing when it is not", () => {
    expect(describeUnfinished({ milestoneCount: 12, taskCount: 40, hasTarget: true })).toMatch(
      /wrote your target, but never finished/,
    );
  });
});

describe("the unfinished plans section", () => {
  it("gives every stranded plan two things to press", () => {
    const text = textOf(renderToStaticMarkup(<UnfinishedPlans plans={[plan]} />));

    expect(text).toContain("Nikita_TIME_Kid_of_the_Year_Execution_Plan.docx");
    expect(text).toContain("35 milestones and 154 steps");
    // §13 — never a dead end. Finish it, or be rid of it.
    expect(text).toContain("Finish reading this plan");
    expect(text).toContain("Delete");
  });

  it("links Finish to the review flow, where extraction resumes", () => {
    const markup = renderToStaticMarkup(<UnfinishedPlans plans={[plan]} />);
    expect(markup).toContain(`href="/goals/${plan.goalId}/review"`);
  });

  it("says these are not scheduled, so they cannot be read as goals", () => {
    const text = textOf(renderToStaticMarkup(<UnfinishedPlans plans={[plan]} />));
    expect(text).toContain("Nothing here is scheduled or counted");
    // And that finishing is cheap, which is the whole reason resumption exists.
    expect(text).toMatch(/picks up where it stopped/);
  });

  it("names a pasted plan as pasted rather than showing a filename", () => {
    const text = textOf(
      renderToStaticMarkup(<UnfinishedPlans plans={[{ ...plan, pasted: true }]} />),
    );
    expect(text).toContain("Pasted plan");
    expect(text).not.toContain(".docx");
  });

  it("renders nothing at all when every plan is finished", () => {
    expect(renderToStaticMarkup(<UnfinishedPlans plans={[]} />)).toBe("");
  });

  it("uses the singular heading for one and the plural for more", () => {
    const one = textOf(renderToStaticMarkup(<UnfinishedPlans plans={[plan]} />));
    expect(one).toContain("A plan Vezri didn\u2019t finish reading");

    const many = textOf(
      renderToStaticMarkup(
        <UnfinishedPlans plans={[plan, { ...plan, goalId: "1262ae90-72f9-4609-9600-faf01a1240d2" }]} />,
      ),
    );
    expect(many).toContain("Plans Vezri didn\u2019t finish reading");
  });

  it("shows the date it was brought in, zone-free", () => {
    // A calendar day. Formatting it in a timezone would print the day before
    // for every reader west of Greenwich — see lib/time.
    const text = textOf(renderToStaticMarkup(<UnfinishedPlans plans={[plan]} />));
    expect(text).toContain("Brought in 8 Sep");
  });
});
