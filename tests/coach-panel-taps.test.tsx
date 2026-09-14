// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import StuckPanel from "@/components/coach/StuckPanel";
import ExecutionBlockCoach from "@/components/coach/ExecutionBlockCoach";
import { BLOCK_CHOICES } from "@/lib/app-copy";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

/**
 * The only tests in the suite that run in a browser.
 *
 * Everything else about these panels is provable from static markup, but the
 * three things asked for here are not: that a tap submits with no confirm
 * step, that the tapped chip carries the wait while the others go quiet, and
 * that a double tap fires ONE request. The last one in particular cannot be
 * read off the markup — it is a race between two clicks and a setState, and
 * the guard that wins it is a ref.
 */

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

/** A fetch whose response lands only when the test says so. */
function heldFetch() {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  let release!: () => void;
  const fetchMock = vi.fn((url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return new Promise<Response>((resolve) => {
      release = () =>
        resolve({
          ok: true,
          json: async () => ({
            block_id: "b1",
            obstacle: "The letter has no opening line yet.",
            first_action: { text: "Write one sentence.", minutes: 3, where: null },
            breakdown: [
              { title: "Draft the opening", minutes: 20 },
              { title: "Fill in the middle", minutes: 30 },
            ],
            intervention_type: "shrink_first_step",
            message: "Let's shrink it.",
            proposal: {
              new_task_title: "First 10 minutes",
              new_task_minutes: 10,
              suggested_start: null,
              revised_title: null,
              follow_up_with: null,
            },
          }),
        } as Response);
    });
  });
  return { calls, fetchMock, release: () => release() };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const chips = () =>
  Array.from(container.querySelectorAll("button")).filter((button) =>
    BLOCK_CHOICES.some((choice) => button.textContent?.startsWith(choice.label)),
  );

const chip = (label: string) => {
  const found = chips().find((button) => button.textContent?.startsWith(label));
  if (!found) throw new Error(`no chip labelled ${label}`);
  return found;
};

const tap = (button: HTMLButtonElement) =>
  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));

const PANELS = [
  {
    name: "I'm stuck",
    render: () => <StuckPanel taskId="t1" taskTitle="Write the letter" onDone={() => {}} />,
    endpoint: "/api/tasks/t1/stuck",
    /** What the route is told the barrier was. */
    reasonOf: (body: Record<string, unknown>) => body.reason,
  },
  {
    name: "Not done",
    render: () => (
      <ExecutionBlockCoach taskId="t1" taskTitle="Finish module 4" onDone={() => {}} />
    ),
    endpoint: "/api/tasks/t1/block",
    reasonOf: (body: Record<string, unknown>) => body.category,
  },
] as const;

describe.each(PANELS)("$name: the chip is the submit", (panel) => {
  it("sends on the tap, with no confirm step in between", () => {
    const { calls, fetchMock, release } = heldFetch();
    vi.stubGlobal("fetch", fetchMock);

    act(() => root.render(panel.render()));
    // Eight reasons and nothing else to press.
    expect(chips()).toHaveLength(BLOCK_CHOICES.length);
    expect(container.querySelectorAll("button")).toHaveLength(BLOCK_CHOICES.length);

    act(() => void tap(chip("It felt too big")));

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(panel.endpoint);
    expect(panel.reasonOf(calls[0]!.body)).toBe("felt_too_big");
    act(() => release());
  });

  /**
   * The one that needs a browser. Two clicks in the same tick both read the
   * pre-update value of `busy`, so a state flag cannot stop the second — and
   * each request here writes a row and pays for a model call.
   */
  it("fires one request for a double tap", () => {
    const { calls, fetchMock, release } = heldFetch();
    vi.stubGlobal("fetch", fetchMock);
    act(() => root.render(panel.render()));

    const target = chip("I kept avoiding it");
    act(() => {
      tap(target);
      tap(target);
    });

    expect(calls).toHaveLength(1);
    act(() => release());
  });

  it("ignores a second tap on a different chip while the first is in flight", () => {
    const { calls, fetchMock, release } = heldFetch();
    vi.stubGlobal("fetch", fetchMock);
    act(() => root.render(panel.render()));

    act(() => {
      tap(chip("Forgot"));
      tap(chip("Something else"));
    });

    expect(calls).toHaveLength(1);
    expect(panel.reasonOf(calls[0]!.body)).toBe("forgot");
    act(() => release());
  });

  it("shows the wait on the tapped chip and takes the others out of reach", () => {
    const { fetchMock, release } = heldFetch();
    vi.stubGlobal("fetch", fetchMock);
    act(() => root.render(panel.render()));

    act(() => void tap(chip("Waiting on someone")));

    const tapped = chip("Waiting on someone");
    expect(tapped.getAttribute("aria-busy")).toBe("true");
    // Not a spinner: globals.css collapses every animation under
    // prefers-reduced-motion, so the signal has to survive without motion.
    expect(tapped.textContent).toContain("…");

    // `.disabled` is deliberately NOT the check: it reflects a button's own
    // attribute, and these are disabled by the fieldset around them, so it
    // reads false on every one. `:disabled` is the inherited state — the one
    // that actually decides whether a browser delivers a tap.
    for (const other of chips()) {
      if (other === tapped) continue;
      expect(other.getAttribute("aria-busy")).toBeNull();
      expect(other.matches(":disabled")).toBe(true);
    }
    // The tapped one too, so the obvious way to double-fire is closed before
    // the ref guard is needed at all.
    expect(tapped.matches(":disabled")).toBe(true);

    act(() => release());
  });
});
