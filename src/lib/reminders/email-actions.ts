/**
 * What a reminder email can ask, and what a link is allowed to do.
 *
 * A PLAIN module on purpose: the landing page renders on the server and the
 * confirm button is a client component, and both have to agree about which
 * actions exist. The union used to be retyped in five files, which is how the
 * page and the email could have drifted apart.
 *
 * The set matches the three buttons on a task row exactly. An email that
 * offers a fourth thing the app cannot do is a second product with its own
 * semantics — and that is what "Snooze a day" was.
 */

export const EMAIL_ACTIONS = ["done", "not_done", "stuck"] as const;

export type EmailAction = (typeof EMAIL_ACTIONS)[number];

/**
 * Values the `email_action` enum still carries that the product no longer
 * offers.
 *
 * `snooze` wrote `snoozed` onto the task, and that status is outside every
 * open set — tapping it removed the task from every list and nothing ever
 * brought it back. It was cut from the app on 2026-09-09 and from email on
 * 2026-09-10.
 *
 * It stays in the enum because `email_action_tokens` rows written before then
 * still reference it, and because a link already sitting in somebody's inbox
 * has to be recognised in order to be REFUSED politely. Deleting the value
 * would turn those rows into a type error at read time, which is a 500 where
 * a sentence belongs.
 */
export const RETIRED_EMAIL_ACTIONS = ["snooze"] as const;

export type RetiredEmailAction = (typeof RETIRED_EMAIL_ACTIONS)[number];

export function isEmailAction(value: string): value is EmailAction {
  return (EMAIL_ACTIONS as readonly string[]).includes(value);
}

export function isRetiredEmailAction(value: string): value is RetiredEmailAction {
  return (RETIRED_EMAIL_ACTIONS as readonly string[]).includes(value);
}

/** The heading on the landing page, before anything has been recorded. */
export const EMAIL_ACTION_HEADING: Record<EmailAction, string> = {
  done: "Mark this done",
  not_done: "Tell Vezri this didn't happen",
  stuck: "Tell Vezri you're stuck",
};

/** What the user is told once the check-in has landed. */
export const EMAIL_ACTION_CONFIRMED: Record<EmailAction, string> = {
  done: "Recorded — nice one.",
  // §13 — neither of these reschedules anything, and both say so. Silence
  // here would leave the user guessing whether their plan just moved.
  not_done: "Noted, and nothing has been moved. Open Vezriqen and Vezri will find the smallest way forward.",
  stuck: "Noted, and nothing has been moved. Open Vezriqen and Vezri will help you get unstuck.",
};

/** The label on the button in the email itself. */
export const EMAIL_ACTION_LABEL: Record<EmailAction, string> = {
  done: "Done",
  not_done: "Not done",
  stuck: "I'm stuck",
};

/**
 * What someone sees when they tap a button from an older email whose action no
 * longer exists. A plain sentence, not an error: they did nothing wrong, and
 * the thing they asked for is simply not a thing any more.
 */
export const RETIRED_EMAIL_ACTION_MESSAGE =
  "Snoozing has been retired — it hid the task instead of bringing it back. Nothing has been changed. Open Vezriqen to say how this one actually went.";
