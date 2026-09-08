import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { APP_NAV, currentNavHref, isCurrentNav } from "@/lib/nav";

/**
 * Exactly one nav item is current, and it is the right one.
 *
 * "Exactly one" is the assertion that matters: aria-current="page" on two
 * links tells a screen reader user they are in two places at once, and a
 * nested route added later is the way that happens.
 */

describe("route matching", () => {
  it("marks a destination on its own path", () => {
    expect(isCurrentNav("/today", "/today")).toBe(true);
    expect(isCurrentNav("/goals", "/goals")).toBe(true);
  });

  it("marks a parent from a nested route", () => {
    expect(isCurrentNav("/goals/abc", "/goals")).toBe(true);
    expect(isCurrentNav("/goals/abc/review", "/goals")).toBe(true);
  });

  it("does not match a different destination that merely shares a prefix", () => {
    // startsWith alone would call this a match.
    expect(isCurrentNav("/goalsomething", "/goals")).toBe(false);
    expect(isCurrentNav("/todayish", "/today")).toBe(false);
  });

  it("never lets '/' match everything", () => {
    expect(isCurrentNav("/today", "/")).toBe(false);
    expect(isCurrentNav("/", "/")).toBe(true);
  });
});

describe("exactly one destination is current", () => {
  const cases: Array<[string, string | null]> = [
    ["/today", "/today"],
    ["/goals", "/goals"],
    ["/goals/abc", "/goals"],
    ["/goals/abc/review", "/goals"],
    ["/settings", "/settings"],
    ["/start", null],
  ];

  for (const [pathname, expected] of cases) {
    it(`${pathname} -> ${expected ?? "no item"}`, () => {
      const matches = APP_NAV.filter((item) => isCurrentNav(pathname, item.href));
      expect(matches.length).toBeLessThanOrEqual(1);
      expect(currentNavHref(pathname)).toBe(expected);
    });
  }

  it("resolves the longest match if destinations ever nest", () => {
    // Guards a future /goals/archive style destination: the deeper one wins
    // rather than both lighting up.
    expect(currentNavHref("/goals/abc")).toBe("/goals");
  });
});

describe("the rendered header", () => {
  it("puts aria-current on exactly one link, and marks it without relying on colour", async () => {
    for (const [pathname, label] of [
      ["/today", "Today"],
      ["/goals/abc", "My Goals"],
      ["/settings", "Settings"],
    ] as const) {
      vi.resetModules();
      vi.doMock("next/navigation", () => ({ usePathname: () => pathname }));
      const { default: AppNav } = await import("@/components/app/AppNav");
      const markup = renderToStaticMarkup(<AppNav />);

      const marked = markup.match(/aria-current="page"/g) ?? [];
      expect(marked, `${pathname} should mark exactly one item`).toHaveLength(1);

      // …and it is the right one: the marked anchor carries that label.
      const anchor = markup.match(/<a[^>]*aria-current="page"[^>]*>([^<]*)</);
      expect(anchor?.[1]).toBe(label);

      // WCAG 1.4.1 — weight and a rule, not colour alone.
      expect(markup).toMatch(/aria-current="page"[^>]*class="[^"]*font-semibold/);
      expect(markup).toMatch(/aria-current="page"[^>]*class="[^"]*after:/);
    }
    vi.resetModules();
  });

  it("offers Today, My Goals and Settings, and no Reminders destination", () => {
    expect(APP_NAV.map((i) => i.label)).toEqual(["Today", "My Goals", "Settings"]);
    // §12's reminder centre is a surface behind the bell, not a place you go.
    expect(APP_NAV.some((i) => i.href.includes("reminders"))).toBe(false);
  });
});
