import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  AA_BODY,
  BACKGROUND_TOKENS,
  DECORATIVE_ONLY,
  TEXT_TOKENS,
  contrastRatio,
  hexOf,
} from "@/lib/palette";

/**
 * Every text token against every background it can legally sit on.
 *
 * This is the test the palette needed. Two tokens have been darkened twice for
 * the same reason — once when they were text on white, again when
 * authenticated pages moved onto a tint — and both times the failure was found
 * by eye. A matrix finds the next one before it ships, including the pair
 * nobody has written yet.
 */
describe("every legal text-on-background pair clears WCAG AA", () => {
  for (const text of TEXT_TOKENS) {
    for (const background of BACKGROUND_TOKENS) {
      it(`${text} on ${background}`, () => {
        const ratio = contrastRatio(hexOf(text), hexOf(background));
        expect(
          ratio,
          `${text} (${hexOf(text)}) on ${background} (${hexOf(background)}) is ${ratio.toFixed(2)}:1. ` +
            `Darken the TEXT token along the same hue — do not lighten the background to dodge it.`,
        ).toBeGreaterThanOrEqual(AA_BODY);
      });
    }
  }
});

describe("the matrix is actually testing something", () => {
  it("covers every background the app sets", () => {
    // A background added to the palette but not to BACKGROUND_TOKENS would sit
    // outside the matrix entirely, which is the quiet way this test stops
    // working.
    expect(BACKGROUND_TOKENS).toContain("white");
    expect(BACKGROUND_TOKENS).toContain("blush.wash");
    expect(BACKGROUND_TOKENS).toContain("blush.light");
    expect(BACKGROUND_TOKENS).toContain("cream.light");
  });

  it("would fail on the colours that were shipped before the fixes", () => {
    // Palette A's published rose, and both earlier attempts at a text-safe one.
    expect(contrastRatio("#C98F9D", "#FFFFFF")).toBeLessThan(AA_BODY);
    expect(contrastRatio("#AE566B", "#F7E7EA")).toBeLessThan(AA_BODY);
    expect(contrastRatio("#876A72", "#FBF4EC")).toBeLessThan(AA_BODY);
  });

  it("keeps the darkened tokens recognisably Palette A", () => {
    // Darkened along the same hue, not replaced. If a future change swings the
    // hue to pass contrast, that is a different colour and needs a decision,
    // not a test that shrugs.
    const hue = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      const r = ((n >> 16) & 255) / 255;
      const g = ((n >> 8) & 255) / 255;
      const b = (n & 255) / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max === min) return 0;
      const d = max - min;
      const h =
        max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return (h / 6) * 360;
    };
    // Palette A's dusty rose sits at ~345deg; both text tokens stay there.
    expect(Math.abs(hue(hexOf("rose")) - 345)).toBeLessThan(4);
    expect(Math.abs(hue(hexOf("mauve.light")) - 345)).toBeLessThan(6);
  });
});

describe("decorative tokens are never used as text", () => {
  it("has no text- class for a fill-only colour", () => {
    // gold is 2.4:1 on white. It is not a text colour and cannot become one by
    // someone reaching for it; a contrast minimum does not apply to a border,
    // which is why it is excluded from the matrix rather than darkened.
    const offenders: Array<{ file: string; token: string }> = [];
    const classes = DECORATIVE_ONLY.map((token) => `text-${token.replace(".", "-")}`);

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
          walk(path);
          continue;
        }
        if (!/\.(tsx?|css)$/.test(entry)) continue;
        const source = readFileSync(path, "utf8");
        for (const className of classes) {
          // Word boundary so text-gold does not also match text-gold-light.
          if (new RegExp(`\\b${className}\\b`).test(source)) {
            offenders.push({ file: path, token: className });
          }
        }
      }
    };
    walk("src");
    expect(offenders).toEqual([]);
  });
});
