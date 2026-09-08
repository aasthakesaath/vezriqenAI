import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import VezriWorking from "@/components/VezriWorking";
import { UNDERSTANDING_STEPS } from "@/lib/app-copy";

/**
 * A failed extraction must always reach the error state.
 *
 * Production returned 422 one second after upload and the screen sat on
 * "Working out the timing…" for six minutes. Two things made that possible and
 * both are covered here: a falsy-but-present error message was treated as no
 * error at all, and nothing bounded the request, so a reply that never arrived
 * held the waiting state forever.
 */

const text = (markup: string) => markup.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

describe("any error at all switches the card out of the waiting state", () => {
  const cases: Array<[string, string]> = [
    ["a normal message", "Vezri couldn't read that plan."],
    // The one that hung: `payload.error ?? fallback` passes "" straight
    // through, and `if (error)` is false for "".
    ["an empty string from the server", ""],
    ["whitespace", "   "],
  ];

  for (const [name, error] of cases) {
    it(name, () => {
      const markup = renderToStaticMarkup(
        <VezriWorking stages={UNDERSTANDING_STEPS} error={error} onRetry={() => {}} />,
      );
      // Never the waiting state.
      expect(markup).toContain('aria-busy="false"');
      expect(markup).not.toContain('aria-live="polite"');
      expect(markup).toContain('role="alert"');
      // And always a way out.
      expect(text(markup)).toContain("Try again");
      // Even with no message, the user is told something.
      expect(text(markup).trim().length).toBeGreaterThan(20);
    });
  }

  it("still shows the waiting state when there is genuinely no error", () => {
    const markup = renderToStaticMarkup(
      <VezriWorking stages={UNDERSTANDING_STEPS} error={null} />,
    );
    expect(markup).toContain('aria-busy="true"');
    expect(markup).not.toContain('role="alert"');
  });
});

describe("the client cannot wait forever", () => {
  const source = readFileSync("src/components/plan/ReviewFlow.tsx", "utf8");

  it("bounds the extraction request with an abort signal", () => {
    expect(source).toContain("AbortController");
    expect(source).toMatch(/signal:\s*abort\.signal/);
    expect(source).toMatch(/EXTRACTION_TIMEOUT_MS/);
  });

  it("routes every non-2xx to the error state", () => {
    expect(source).toMatch(/!response\.ok/);
    // `||`, not `??` — the distinction that kept the screen spinning on "".
    expect(source).toMatch(/payload\.error \|\| /);
    expect(source).not.toMatch(/payload\.error \?\? /);
  });

  it("treats a stream that ends without a verdict as a failure", () => {
    // Silence is not success: if the function is killed or a proxy cuts the
    // response, the screen must not sit on the last stage it happened to see.
    expect(source).toMatch(/if \(!settled\)/);
    expect(source).toMatch(/stopped partway through/);
  });

  it("takes its stage text from server events and never from a clock", () => {
    expect(source).toContain("describeProgress");
    expect(source).toMatch(/setStage\(describeProgress\(event\)\)/);
    // No timer anywhere in the waiting path.
    expect(source).not.toMatch(/setInterval|setTimeout\(\s*\(\)\s*=>\s*setStage/);
  });

  it("tells a timeout apart from a dead connection", () => {
    expect(source).toContain("AbortError");
    expect(source).toMatch(/stopped waiting/);
  });
});

/** Comments explain why a string was removed; they are not the string. */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the waiting copy is honest about how long this takes", () => {
  const source = stripComments(readFileSync("src/components/VezriWorking.tsx", "utf8"));

  it("no longer promises a few seconds", () => {
    // A 58 KB plan took 138 seconds. "A few seconds" then holding someone for
    // over two minutes is most of what makes a slow screen feel broken.
    expect(source).not.toContain("This takes a few seconds");
  });

  it("says something true at each stage of the wait", () => {
    expect(source).toContain("Vezri is reading your plan.");
    expect(source).toContain("Larger plans take a minute or two.");
    expect(source).toContain("Still working — nearly there.");
  });

  it("never shows a countdown or a percentage", () => {
    const markup = renderToStaticMarkup(<VezriWorking stages={UNDERSTANDING_STEPS} />);
    expect(text(markup)).not.toMatch(/\d+\s*%/);
    expect(text(markup)).not.toMatch(/\d+\s*(seconds|minutes|s left|remaining)/i);
    expect(markup).not.toContain('role="progressbar"');
  });
});

describe("no component advances a stage on a timer", () => {
  const component = readFileSync("src/components/VezriWorking.tsx", "utf8");

  it("VezriWorking has no stage clock at all", () => {
    // It used to walk its stage list every 6 seconds, which is how the screen
    // reported "Reading your plan" through to "nearly there" during a window
    // in which the server logs show no request was ever made.
    expect(component).not.toMatch(/setIndex/);
    expect(component).not.toMatch(/stageMs/);
    const advancing = component.match(/setTimeout\([^)]*setIndex/g) ?? [];
    expect(advancing).toEqual([]);
  });

  it("shows the stage it was given, and only that", () => {
    const markup = renderToStaticMarkup(<VezriWorking stages={["Reading your plan"]} />);
    expect(text(markup)).toContain("Reading your plan");
    expect(text(markup)).not.toContain("Working out the timing");
  });
});

describe("the idle motion is presence, not a spinner", () => {
  it("uses one slow breath and no second suppression rule", () => {
    const component = readFileSync("src/components/VezriWorking.tsx", "utf8");
    const css = readFileSync("src/app/globals.css", "utf8");

    expect(component).toContain("animate-vezri-breathe");
    expect(css).toContain("@keyframes vezri-breathe");
    // 3s a cycle, small amplitude — calm, not a loading indicator.
    expect(css).toMatch(/animation:\s*vezri-breathe\s+3s/);
    expect(css).toMatch(/scale\(1\.0\d+\)/);

    // The global prefers-reduced-motion rule already collapses every
    // animation; a second, local one would be a second thing to keep right.
    // Counted as MEDIA QUERIES, not as mentions — the comments explaining the
    // rule name it too.
    const queries = css.match(/@media\s*\(prefers-reduced-motion/g) ?? [];
    expect(queries).toHaveLength(1);
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion"));
    expect(reduced).toContain("animation-duration: 0.01ms !important");
  });

  it("has no spinner beside the mascot", () => {
    const markup = renderToStaticMarkup(<VezriWorking stages={UNDERSTANDING_STEPS} />);
    expect(markup).not.toMatch(/animate-spin|spinner/i);
  });
});
