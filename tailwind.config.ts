import type { Config } from "tailwindcss";

/**
 * Palette A from PRD §30.2, plus `berry` — a deeper brand shade derived from the
 * approved mockup's CTA colour. Dusty rose (#C98F9D) cannot carry white text at
 * WCAG AA, and §30.11 requires accessible contrast, so interactive surfaces and
 * body links use `berry` while Palette A carries the soft decorative canvas.
 *
 * Milestone 7 accessibility pass: two tokens were failing WCAG AA as *text* and
 * have been darkened along the same hue and saturation, so the palette still
 * reads as Palette A.
 *
 *   rose        #C98F9D -> #AE566B   was 2.66:1 on white, now 4.84:1
 *   mauve-light #8E7078 -> #876A72   was 4.43:1 on white, now 4.84:1
 *
 * Both clear 4.5:1 on the lightest ground they sit on (blush-wash #FDF6F7), not
 * merely on pure white. `rose.soft` is untouched: it is only ever a decorative
 * fill or border, where contrast minimums do not apply. Palette A's published
 * dusty rose therefore survives unchanged everywhere it is a surface, and is
 * darkened only where it has to be legible.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        rose: { DEFAULT: "#AE566B", soft: "#DCB0BB", surface: "#C98F9D" },
        blush: { DEFAULT: "#E8C1C8", light: "#F7E7EA", wash: "#FDF6F7" },
        mauve: { DEFAULT: "#76545D", light: "#876A72" },
        cream: { DEFAULT: "#F5E8D7", light: "#FBF4EC" },
        gold: { DEFAULT: "#C9A15C", light: "#E3CDA3" },
        berry: { DEFAULT: "#A82449", deep: "#8C1B3B", light: "#C2416A" },
        ink: { DEFAULT: "#1F1216", muted: "#5A464C" },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        script: ["var(--font-script)", "cursive"],
      },
      maxWidth: { shell: "1200px" },
      borderRadius: { pill: "999px" },
      boxShadow: {
        soft: "0 1px 2px rgba(118,84,93,.05), 0 8px 24px -12px rgba(118,84,93,.18)",
        lift: "0 2px 4px rgba(118,84,93,.06), 0 18px 40px -20px rgba(118,84,93,.28)",
      },
    },
  },
  plugins: [],
};

export default config;
