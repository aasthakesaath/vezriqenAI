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

/**
 * How long the user's own wording may be and still work as a name.
 *
 * Generous rather than tight: this is a fallback, and a 50-character line in a
 * section header is untidy where a sliced sentence is wrong.
 */
const NAME_CHARS = 56;

/**
 * The short name: for task cards, Today, the week view, nav and every goal
 * heading. The ONE helper every rendered goal name goes through.
 *
 * It will not slice the SMART statement, and that is the whole point of this
 * function. The statement is ~60 words the user approved as a paragraph; the
 * first six of them are not a name, they are the opening of a sentence. This
 * shipped twice as "By Dec 31, 2026, turn Caly…" — once as a goal-page
 * heading, again as a Today section header — because a truncated statement
 * looks close enough to a name to pass review, and CSS then cut it a second
 * time mid-word.
 *
 * So the ladder is: the six-word label extraction wrote, then the user's own
 * words if they are short enough to be a name, then nothing. "Your goal" is a
 * worse label than a real one and a better one than a sentence fragment — and
 * a goal reaching it is a data problem (no short_label, no short user text),
 * visible as such, rather than a rendering problem disguised as a name.
 */
export function goalLabel(goal: GoalNaming | null | undefined): string {
  const label = goal?.short_label?.trim();
  if (label) return label;

  // The user's own phrasing, never the generated statement. Someone who typed
  // "Run a half marathon" gets that back; someone whose only text is a
  // paragraph gets the neutral name rather than the paragraph's first clause.
  const own = goal?.user_goal_text?.trim();
  if (own && own.length <= NAME_CHARS && !/[.!?]\s/.test(own)) {
    return own.replace(/[.,;:]$/, "");
  }

  return "Your goal";
}

/** How long a one-line description may run before it is cut at a word. */
const SUMMARY_CHARS = 150;

/**
 * One line about the goal, for under the heading.
 *
 * The heading is the short label and the full statement lives behind "Show
 * full target"; this sits between them, so the page says something about the
 * goal without either repeating the name or spending sixty words on it.
 *
 * Cut at a SENTENCE first and at a WORD only if the first sentence is itself
 * long. Never mid-word: the bug this page replaces rendered "By Dec 31, 2026,
 * turn Caly…" as the title, and a description that breaks the same way is the
 * same bug moved down a line.
 */
export function goalSummary(goal: GoalNaming | null | undefined): string {
  const statement = goal?.normalized_goal?.trim() || goal?.user_goal_text?.trim();
  if (!statement) return "";

  // The first sentence, when there is more than one and it is short enough to
  // stand alone.
  const firstStop = statement.search(/[.!?](\s|$)/);
  if (firstStop > 0 && firstStop + 1 <= SUMMARY_CHARS) {
    return statement.slice(0, firstStop + 1);
  }

  if (statement.length <= SUMMARY_CHARS) return statement;

  const cut = statement.slice(0, SUMMARY_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : cut.length).replace(/[,;:]$/, "")}…`;
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
