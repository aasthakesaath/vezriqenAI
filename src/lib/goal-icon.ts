import type { IconName } from "@/components/icons/Icon";
import { goalLabel, goalStatement, type GoalNaming } from "@/lib/goal-label";

/**
 * Which icon stands for a goal.
 *
 * A chooser, not a set — the drawings live in components/icons/Icon.tsx with
 * every other icon in the product, on one grid at one stroke weight, so a goal
 * icon beside a calendar icon looks like it came from the same hand.
 *
 * Deliberately not a hash of the goal id. A hash spreads the set nicely and is
 * stable, but it would put a heart on a certification and a dumbbell on a
 * fundraising target — a picture that says something false about the goal is
 * worse than the same neutral picture twice. Anything unmatched gets `goal`,
 * which is true of every goal in the product.
 */

const KEYWORDS: ReadonlyArray<[IconName, readonly string[]]> = [
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
 * company-building goal an exam icon. Word boundaries are hand-rolled rather
 * than \b because a keyword may be a phrase ("kid of the year") and because
 * \b treats a digit as a word character, which is what "1450+" needs.
 */
const MATCHERS: ReadonlyArray<[IconName, ReadonlyArray<RegExp>]> = KEYWORDS.map(
  ([icon, words]) => [
    icon,
    words.map(
      (word) =>
        new RegExp(`(^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i"),
    ),
  ],
);

export function goalIconFor(goal: GoalNaming | null | undefined): IconName {
  // The label first, on its own. It is the six words a person chose to name
  // the goal, so a hit there is worth more than a hit anywhere in a sixty-word
  // statement — "SAT 1450+" is not a college-admissions goal merely because
  // its statement mentions college readiness.
  for (const source of [goalLabel(goal), goalStatement(goal)]) {
    for (const [icon, matchers] of MATCHERS) {
      if (matchers.some((matcher) => matcher.test(source))) return icon;
    }
  }
  return "goal";
}
