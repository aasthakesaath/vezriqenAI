/**
 * Palette A (PRD §30.2), as data.
 *
 * This file exists so the contrast rule has a subject. tailwind.config.ts
 * consumes it, so there is one set of hex values rather than two that drift,
 * and tests/palette-contrast.test.ts walks every legal text-on-background pair
 * and fails below WCAG AA's 4.5:1.
 *
 * That test is the point. Two tokens have now been darkened twice for the same
 * reason — once when they were text on white, and again when authenticated
 * pages moved onto a tint — and each time it was found by looking rather than
 * by a rule. The matrix stops the class of bug instead of the instance.
 */

export const COLORS = {
  rose: {
    /**
     * Text-safe dusty rose. Darkened twice, both times along the same hue:
     *   #C98F9D  Palette A as published   2.66:1 on white   FAILED
     *   #AE566B  Milestone 7 a11y pass    4.84:1 on white   4.05 on blush-light
     *   #A34E63  page background moved    5.49:1 on white   4.59 on blush-light
     * Hue moved 345.7deg to 345.2deg and saturation 35.2% to 35.3%, so it is
     * still Palette A's rose; it is only dark enough to be read on every
     * surface the product actually puts it on.
     */
    DEFAULT: "#A34E63",
    /** Decorative fill and border only. Never text — see TEXT_TOKENS. */
    soft: "#DCB0BB",
    /** Palette A's published dusty rose, kept for decorative surfaces. */
    surface: "#C98F9D",
  },
  blush: { DEFAULT: "#E8C1C8", light: "#F7E7EA", wash: "#FDF6F7" },
  mauve: {
    DEFAULT: "#76545D",
    /** Same story as rose: #8E7078 -> #876A72 -> #7D626A. */
    light: "#7D626A",
  },
  cream: { DEFAULT: "#F5E8D7", light: "#FBF4EC" },
  /** Decorative only. gold has never been used as text and cannot be: 2.4:1. */
  gold: { DEFAULT: "#C9A15C", light: "#E3CDA3" },
  berry: { DEFAULT: "#A82449", deep: "#8C1B3B", light: "#C2416A" },
  ink: { DEFAULT: "#1F1216", muted: "#5A464C" },
} as const;

/** Every surface a page, card or pill may set behind text. */
export const BACKGROUND_TOKENS = [
  "white",
  "blush.wash",
  "blush.light",
  "cream.light",
  "cream",
] as const;

/**
 * Every token used for text.
 *
 * gold, rose.soft and rose.surface are absent deliberately: they are fills and
 * borders. A contrast minimum does not apply to them, and the test asserts they
 * never appear as a text class so that stays true.
 */
export const TEXT_TOKENS = [
  "ink",
  "ink.muted",
  "mauve",
  "mauve.light",
  "berry",
  "berry.deep",
  "rose",
] as const;

/**
 * Tokens that must never be used as a text colour.
 *
 * berry.light is here on the matrix's advice, not mine. It reads fine on white
 * (5.44:1) but is 4.13:1 on blush-light and 4.09:1 on cream — so it is safe on
 * some surfaces and not others, which is precisely the trap this whole file
 * exists to close. It is currently used nowhere, and darkening a shade named
 * "light" until it passes on cream would leave it indistinguishable from
 * berry, so the honest answer is that it is a fill, not text. Anyone who wants
 * a lighter berry for text will be told by this test rather than by an audit.
 */
export const DECORATIVE_ONLY = [
  "gold",
  "gold.light",
  "rose.soft",
  "rose.surface",
  "berry.light",
] as const;

export type Token = string;

/** "blush.wash" -> "#FDF6F7". "white" is not in the palette but is a surface. */
export function hexOf(token: Token): string {
  if (token === "white") return "#FFFFFF";
  const [family, shade = "DEFAULT"] = token.split(".");
  const group = (COLORS as Record<string, Record<string, string>>)[family];
  const hex = group?.[shade];
  if (!hex) throw new Error(`Unknown palette token: ${token}`);
  return hex;
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
}

/** WCAG contrast ratio between two hex colours. */
export function contrastRatio(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** WCAG 2.1 AA for body text. */
export const AA_BODY = 4.5;
