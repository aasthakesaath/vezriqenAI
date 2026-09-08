import type { Config } from "tailwindcss";

/**
 * Palette A from PRD §30.2, plus `berry` — a deeper brand shade derived from the
 * approved mockup's CTA colour. Dusty rose (#C98F9D) cannot carry white text at
 * WCAG AA, and §30.11 requires accessible contrast, so interactive surfaces and
 * body links use `berry` while Palette A carries the soft decorative canvas.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        rose: { DEFAULT: "#C98F9D", soft: "#DCB0BB" },
        blush: { DEFAULT: "#E8C1C8", light: "#F7E7EA", wash: "#FDF6F7" },
        mauve: { DEFAULT: "#76545D", light: "#8E7078" },
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
