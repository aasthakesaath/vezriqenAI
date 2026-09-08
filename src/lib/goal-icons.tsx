import { goalLabel, goalStatement, type GoalNaming } from "@/lib/goal-label";

/**
 * One icon set for goals, drawn rather than typed.
 *
 * Emoji were the obvious shortcut and are the wrong answer here. They render as
 * a different picture on every platform — the trophy is a shaded gold cup on
 * one device and a flat orange glyph on another — they carry their own colour,
 * which drags a saturated yellow and green into Palette A wherever a goal
 * appears, and a screen reader announces them by their Unicode name whether or
 * not that helps. These are strokes in `currentColor`: they inherit the palette,
 * they look like one family at 16px and at 40px, and they are decorative
 * (`aria-hidden`) because the goal's name is right beside them.
 *
 * Every path is drawn on the same 24×24 grid with the same 1.7 stroke and
 * rounded joins, which is what makes a set a set.
 */

export type GoalIconName =
  | "trophy"
  | "book"
  | "graduation"
  | "briefcase"
  | "heart"
  | "fitness"
  | "rocket"
  | "pen"
  | "globe"
  | "target";

const PATHS: Record<GoalIconName, React.ReactNode> = {
  trophy: (
    <>
      <path d="M7 4h10v5.2a5 5 0 0 1-10 0V4Z" />
      <path d="M17 5.6h2a2.4 2.4 0 0 1 0 4.8h-2M7 5.6H5a2.4 2.4 0 0 0 0 4.8h2" />
      <path d="M12 14.2V17M8.5 20h7" />
    </>
  ),
  book: (
    <>
      <path d="M12 7.1C10.5 5.8 8.6 5.1 6.4 5.1H3.8v11.6h2.6c2.2 0 4.1.7 5.6 2" />
      <path d="M12 7.1c1.5-1.3 3.4-2 5.6-2h2.6v11.6h-2.6c-2.2 0-4.1.7-5.6 2" />
      <path d="M12 7.1v11.6" />
    </>
  ),
  graduation: (
    <>
      <path d="M12 4 2.6 8.8 12 13.6l9.4-4.8L12 4Z" />
      <path d="M6.6 11v4.6c0 1.4 2.4 2.6 5.4 2.6s5.4-1.2 5.4-2.6V11" />
      <path d="M21.4 8.8v5.4" />
    </>
  ),
  briefcase: (
    <>
      <path d="M4.2 8.6h15.6a1.4 1.4 0 0 1 1.4 1.4v8.2a1.4 1.4 0 0 1-1.4 1.4H4.2a1.4 1.4 0 0 1-1.4-1.4V10a1.4 1.4 0 0 1 1.4-1.4Z" />
      <path d="M9 8.6V6.8A1.8 1.8 0 0 1 10.8 5h2.4A1.8 1.8 0 0 1 15 6.8v1.8" />
      <path d="M2.8 13.2h18.4" />
    </>
  ),
  heart: (
    <path d="M12 19.6 4.9 12.5a4.5 4.5 0 0 1 6.4-6.3l.7.7.7-.7a4.5 4.5 0 0 1 6.4 6.3L12 19.6Z" />
  ),
  fitness: (
    <>
      <path d="M3.4 9.4v5.2M6.6 7.2v9.6M17.4 7.2v9.6M20.6 9.4v5.2" />
      <path d="M6.6 12h10.8" />
    </>
  ),
  rocket: (
    <>
      <path d="M12 3.2c2.9 2.2 4.6 5.7 4.6 9.4L14.3 15H9.7l-2.3-2.4c0-3.7 1.7-7.2 4.6-9.4Z" />
      <path d="M9.7 15 8 19.4l3.1-1.3M14.3 15l1.7 4.4-3.1-1.3" />
      <circle cx="12" cy="9.8" r="1.5" />
    </>
  ),
  pen: (
    <>
      <path d="M4.4 19.6h3.4L19.5 7.9a2 2 0 0 0-2.8-2.8L5 16.8v2.8Z" />
      <path d="M14.6 7.2 17.4 10" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M3.6 12h16.8" />
      <path d="M12 3.6c2.2 2.3 3.4 5.3 3.4 8.4S14.2 18.1 12 20.4c-2.2-2.3-3.4-5.3-3.4-8.4S9.8 5.9 12 3.6Z" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <circle cx="12" cy="12" r="4.6" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
};

/**
 * Words that pick an icon, checked in order.
 *
 * Deliberately not a hash of the goal id. A hash spreads the set nicely and is
 * stable, but it would put a heart on a certification and a dumbbell on a
 * fundraising target — a picture that says something false about the goal is
 * worse than the same neutral picture twice. Anything unmatched gets `target`,
 * which is true of every goal in the product.
 */
const KEYWORDS: ReadonlyArray<[GoalIconName, readonly string[]]> = [
  ["graduation", ["college", "university", "degree", "admission", "scholarship", "school", "graduate"]],
  ["book", ["sat", "act", "exam", "study", "revision", "course", "certification", "read", "learn", "gcse", "test", "tests"]],
  ["fitness", ["fitness", "gym", "marathon", "5k", "10k", "training", "workout", "sport"]],
  ["heart", ["health", "wellbeing", "wellness", "sleep", "therapy", "meditation", "habit", "family"]],
  ["briefcase", ["business", "company", "startup", "revenue", "client", "career", "job", "product", "build", "launch"]],
  ["rocket", ["ship", "release", "growth", "scale", "mvp", "app"]],
  ["pen", ["write", "writing", "essay", "novel", "blog", "portfolio", "thesis"]],
  ["globe", ["travel", "community", "volunteer", "outreach", "nonprofit", "charity", "impact", "global"]],
  ["trophy", ["award", "prize", "championship", "competition", "win", "kid of the year", "recognition", "finalist"]],
];

/**
 * Whole words only.
 *
 * A substring match looked fine until "impact" matched "act" and gave a
 * company-building goal an exam icon, and "expanding" would match "pan" for
 * anyone who added a cooking keyword. Word boundaries are hand-rolled rather
 * than \b because a keyword may be a phrase ("kid of the year") and because
 * \b treats a digit as a word character, which is what "1450+" needs.
 */
const MATCHERS: ReadonlyArray<[GoalIconName, ReadonlyArray<RegExp>]> = KEYWORDS.map(
  ([icon, words]) => [
    icon,
    words.map(
      (word) =>
        new RegExp(`(^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i"),
    ),
  ],
);

/**
 * The icon for a goal, from what the goal actually says.
 *
 * Both names are searched: the six-word label is usually the more specific
 * ("TIME Kid of the Year"), and the SMART statement is the fallback for goals
 * created before short_label existed.
 */
export function goalIconFor(goal: GoalNaming | null | undefined): GoalIconName {
  // The label first, on its own. It is the six words a person chose to name
  // the goal, so a hit there is worth more than a hit anywhere in a sixty-word
  // statement — "SAT 1450+" is not a college-admissions goal merely because
  // its statement mentions college readiness.
  for (const source of [goalLabel(goal), goalStatement(goal)]) {
    for (const [icon, matchers] of MATCHERS) {
      if (matchers.some((matcher) => matcher.test(source))) return icon;
    }
  }
  return "target";
}

/**
 * Decorative by default — `aria-hidden`, no title, no label.
 *
 * The goal's name is always beside it, so an accessible name here would make a
 * screen reader read the goal twice.
 */
export default function GoalIcon({
  name,
  className = "h-6 w-6",
}: {
  name: GoalIconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name]}
    </svg>
  );
}
