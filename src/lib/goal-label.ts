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
