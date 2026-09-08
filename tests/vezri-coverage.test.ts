import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Vezri appears on every page.
 *
 * Checked at the source level rather than by rendering: most of these are
 * async server components that reach for Supabase, so rendering them in a unit
 * test would be testing a mock of the database rather than the page. What
 * matters here is that each route pulls Vezri in from somewhere — its own
 * file, or a shared component the route renders.
 *
 * The visual half of this — that no container clips the artwork — is checked
 * against the real rendered pages in the accessibility/screenshot pass, since
 * a clipped bounding box is a layout fact and cannot be read off the source.
 */

const PAGES = "src/app";

/** Components that themselves render a pose, so a page using one is covered. */
const CARRIERS = [
  "VezriPoseImage",
  "VezriWorking",
  "LegalPage",
  "AuthPanel",
  "PlanIntake",
  "VezriNote",
  "AppHeader",
  "Wordmark",
  "ProgressPreview",
  "FinalCta",
];

function sourcesFor(file: string): string {
  return readFileSync(file, "utf8");
}

function routeFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (entry === "page.tsx") found.push(path);
    }
  };
  walk(PAGES);
  return found;
}

/** Does this page, or the layout above it, bring Vezri in? */
function rendersVezri(page: string): boolean {
  const candidates = [page];
  // The layout that wraps it counts: the app header carries the avatar.
  let dir = join(page, "..");
  for (let depth = 0; depth < 4; depth += 1) {
    candidates.push(join(dir, "layout.tsx"));
    dir = join(dir, "..");
  }
  for (const file of candidates) {
    let source: string;
    try {
      source = sourcesFor(file);
    } catch {
      continue;
    }
    if (/brand\/vezri/.test(source)) return true;
    if (CARRIERS.some((name) => new RegExp(`\\b${name}\\b`).test(source))) return true;
  }
  return false;
}

describe("every route renders Vezri", () => {
  const pages = routeFiles();

  it("finds the routes at all", () => {
    expect(pages.length).toBeGreaterThan(8);
  });

  for (const page of routeFiles()) {
    it(page.replace("src/app/", "").replace("/page.tsx", "") || "/", () => {
      expect(
        rendersVezri(page),
        `${page} renders no Vezri. Add a VezriPoseImage, or render a component that carries one.`,
      ).toBe(true);
    });
  }
});

describe("poses are never rendered inside a clipping container", () => {
  it("no pose sits in an overflow-hidden or rounded-full parent", () => {
    // The avatar failed exactly this way: a circular mask cut the hair bow.
    // The full-body poses are wider than they are tall at the shoulders, so a
    // mask or a fixed-size overflow-hidden box would clip the archer's bow.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
          walk(path);
          continue;
        }
        if (!entry.endsWith(".tsx")) continue;
        const source = readFileSync(path, "utf8");
        // Look at the ~240 characters before each pose for a clipping class on
        // the element wrapping it.
        for (const match of source.matchAll(/<VezriPoseImage\b/g)) {
          const before = source.slice(Math.max(0, match.index - 240), match.index);
          const lastOpen = before.lastIndexOf("<span");
          const lastDiv = before.lastIndexOf("<div");
          const wrapper = before.slice(Math.max(lastOpen, lastDiv));
          if (/overflow-hidden|rounded-full/.test(wrapper)) {
            offenders.push(`${path}: pose inside "${wrapper.slice(0, 90)}…"`);
          }
        }
      }
    };
    walk("src");
    expect(offenders).toEqual([]);
  });

  it("keeps the head-crop avatar out of the pose component", () => {
    // vezri-avatar.webp is a deliberate crop for a 36px circle. A pose is not,
    // and the two must not be confused at a call site.
    const pose = readFileSync("src/components/VezriWorking.tsx", "utf8");
    expect(pose).not.toContain("vezri-avatar");
  });
});
