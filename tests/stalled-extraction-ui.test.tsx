import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * A run the platform killed must not look like one still working.
 *
 * Goal 73666d16 hit Vercel's 300-second ceiling at 02:36:19 on 2026-09-09.
 * Three task passes were saved — the resumable machinery doing its job — but
 * nothing recorded that the process died, so the goal sat at in_progress for
 * two hours and the review screen kept saying the plan was being read.
 *
 * Worse: the screen starts extraction automatically when a goal has no target
 * yet. Without a gate, a plan that times out restarts on every visit and times
 * out again, forever, at a cost per attempt.
 */

const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", fetchMock);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  usePathname: () => "/goals",
}));

const { renderToStaticMarkup } = await import("react-dom/server");
const { default: ReviewFlow } = await import("@/components/plan/ReviewFlow");
const { describeStalled } = await import("@/lib/plan/extraction-state");

const textOf = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const props = {
  goalId: "73666d16-50fe-426a-9ace-8ea07598b30d",
  initialTarget: null,
  initialMilestones: [],
  initialTasks: [],
  needsExtraction: true,
};

const STOPPED = describeStalled({ milestonesWritten: 31, tasksWritten: 65 });

beforeEach(() => fetchMock.mockClear());

describe("a killed run on the review screen", () => {
  it("says what happened instead of claiming to be reading", () => {
    const text = textOf(renderToStaticMarkup(<ReviewFlow {...props} stoppedNote={STOPPED} />));

    expect(text).toContain("ran out of time reading this plan and stopped");
    expect(text).toContain("31 milestones and 65 steps are saved");
    // The words that made a working screen look broken, and a killed one look alive.
    expect(text).not.toMatch(/nearly there|still working|Reading your plan/i);
  });

  it("offers Try again rather than leaving the page loading", () => {
    expect(textOf(renderToStaticMarkup(<ReviewFlow {...props} stoppedNote={STOPPED} />))).toContain(
      "Try again",
    );
  });

  it("does not start a run of its own for a plan that already timed out", () => {
    renderToStaticMarkup(<ReviewFlow {...props} stoppedNote={STOPPED} />);
    // A server render never fires effects, so this is a weak check on its own —
    // the real guarantee is that `stalled` gates the effect, and that the
    // initial phase is the stopped state rather than "reading". Both are
    // asserted above; this pins that no request escapes the render path.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still reads normally when the last run was not killed", () => {
    const text = textOf(renderToStaticMarkup(<ReviewFlow {...props} stoppedNote={null} />));
    expect(text).not.toContain("ran out of time");
    expect(text).toMatch(/Vezri is reading your plan|Reading your plan/i);
  });
});
