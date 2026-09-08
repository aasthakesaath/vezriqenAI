/**
 * How a goal is named on screen.
 *
 * Two strings exist for a reason. `normalized_goal` is the SMART statement —
 * ~60 words, the thing the user approved, and what §6 requires be preserved.
 * `short_label` is a six-word name for lists, cards and headings. Neither
 * substitutes for the other: §7 forbids an inference standing in for a stated
 * fact, so the approval screen renders the statement and never the label.
 *
 * This module is the boundary. A surface asks for the name it needs rather
 * than reaching for a column and hoping it is short.
 */

export type GoalNaming = {
  short_label?: string | null;
  normalized_goal?: string | null;
  user_goal_text?: string | null;
};

/** Words kept when a label has to be derived rather than read. */
const FALLBACK_WORDS = 6;

/**
 * The short name: for task cards, Today, the week view, nav and the goal
 * heading.
 *
 * Falls back to the first few words of the statement rather than the whole
 * thing, because goals extracted before short_label existed still have to fit
 * on a card — the bug this replaces was exactly a 60-word statement rendered
 * where a name belonged.
 */
export function goalLabel(goal: GoalNaming | null | undefined): string {
  if (!goal) return "Your goal";

  const label = goal.short_label?.trim();
  if (label) return label;

  const source = goal.normalized_goal?.trim() || goal.user_goal_text?.trim();
  if (!source) return "Your goal";

  const words = source.split(/\s+/);
  if (words.length <= FALLBACK_WORDS) return source.replace(/[.,;:]$/, "");
  return `${words.slice(0, FALLBACK_WORDS).join(" ").replace(/[.,;:]$/, "")}…`;
}

/**
 * The full statement: for the goal page body and the plan-approval screen,
 * where the user is agreeing to what it actually says.
 */
export function goalStatement(goal: GoalNaming | null | undefined): string {
  return (
    goal?.normalized_goal?.trim() || goal?.user_goal_text?.trim() || "Your goal"
  );
}

/**
 * One line about the goal, for a card that already carries the name.
 *
 * The first sentence of the statement, and only if it is short enough to be a
 * line. §6 requires the approved SMART statement be preserved and §7 forbids
 * an inference standing in for a stated fact, so this never rewrites or
 * summarises: it either shows the opening sentence the user approved, or it
 * shows nothing and the card is one line shorter. Returning null rather than
 * a truncated clause is the point — "Reach 1450+ on the SAT by March 14 so
 * that I can…" cut mid-thought reads as broken rendering.
 */
const SUMMARY_LIMIT = 110;

export function goalSummary(goal: GoalNaming | null | undefined): string | null {
  const source = goal?.normalized_goal?.trim() || goal?.user_goal_text?.trim();
  if (!source) return null;

  // First sentence, or the whole thing when there is only one.
  const sentence = (source.match(/^[^.!?]+[.!?]?/)?.[0] ?? source).trim();
  if (sentence.length > SUMMARY_LIMIT) return null;

  // Never a restatement of the name that already sits above it.
  const label = goalLabel(goal).replace(/…$/, "").trim().toLowerCase();
  if (label && sentence.toLowerCase() === label) return null;

  return sentence.replace(/[.,;:]$/, "");
}
