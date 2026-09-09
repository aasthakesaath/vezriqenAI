/**
 * Copy for the signed-in product, kept as data for the same reason as
 * src/lib/site.ts: the tests assert against the specification rather than
 * against a retyped duplicate. Strings here come from PRD §5, §10, §12 and §13.
 */

/** PRD §5 Step 2 — the first screen after sign-in. */
export const ONBOARDING_HEADING = "What are you trying to achieve?";

export const INTAKE_MODES = [
  {
    id: "upload",
    label: "Upload my plan",
    hint: "PDF, Word, text, Markdown, or a screenshot.",
    emphasis: "primary",
  },
  {
    id: "paste",
    label: "Paste my plan",
    hint: "Straight from ChatGPT, Claude, an email, or a doc.",
    emphasis: "primary",
  },
  {
    id: "goal_only",
    label: "I only have a goal",
    hint: "Vezri will start something light you can build on.",
    emphasis: "secondary",
  },
] as const;

export type IntakeModeId = (typeof INTAKE_MODES)[number]["id"];

/** PRD §5 Step 3 — shown while Vezri reads the plan. */
/**
 * Stage lines for the shared VezriWorking component.
 *
 * Plain language only: the user is told what Vezri is doing for them, never
 * what the system is doing. "Reading your plan", not "extracting"; "working
 * out the timing", not "resolving dependencies and lead time".
 *
 * These advance on a timer because a single model call has no intermediate
 * events to report — which is precisely why VezriWorking shows no progress
 * bar. Stage text that turns out to be optimistic is a small cost; a bar that
 * looks measured and isn't would be a lie about how far along the work is.
 */
export const UNDERSTANDING_STEPS = [
  "Reading your plan",
  "Finding your milestones",
  "Working out the timing",
] as const;

/** PRD §16 — the "What am I missing?" audit is a model call too. */
export const AUDIT_STEPS = [
  "Looking at your goal",
  "Checking what your plan needs",
  "Finding what nothing is producing yet",
] as const;

/** PRD §13 — the Execution Block Coach. */
export const COACH_STEPS = [
  "Thinking about what got in the way",
  "Working out the smallest way forward",
] as const;

/** PRD §13 Step 1 — the one short question, and its quick choices. */
export const BLOCK_QUESTION = "What got in the way?";

export const BLOCK_CHOICES = [
  { id: "no_time", label: "Didn't have time" },
  { id: "didnt_know_how_to_start", label: "Didn't know how to start" },
  { id: "felt_too_big", label: "It felt too big" },
  { id: "kept_avoiding", label: "I kept avoiding it" },
  { id: "waiting_on_someone", label: "Waiting on someone" },
  { id: "forgot", label: "Forgot" },
  { id: "priorities_changed", label: "My priorities changed" },
  { id: "something_else", label: "Something else" },
] as const;

/**
 * PRD §12 — what a check-in can record.
 *
 * §12 listed six. Two were retired on 2026-09-09 (owner decision) because
 * neither had a consequence: `partial` wrote a status that sat outside Goal
 * Health's open sets, so it RAISED the score on an overdue task while
 * capturing nothing about what was left, and `snoozed` lost the task — it is
 * outside every open set and nothing has ever read `snooze_until`.
 * lib/plan/task-status.ts carries the full reasoning and where existing rows
 * go. History keeps both states; the API accepts neither.
 *
 * This list is what the API accepts. The first three are buttons on a task
 * row; `waiting_on_someone` is recorded by the coach rather than tapped.
 */
export const CHECKIN_ACTIONS = [
  { id: "done", label: "Done" },
  { id: "not_done", label: "Not done" },
  { id: "stuck", label: "I'm stuck" },
  { id: "waiting_on_someone", label: "Waiting on someone" },
] as const;

/** PRD §10 — minimal onboarding asks at most these three. */
export const PROFILE_QUESTIONS = [
  {
    id: "productive_window",
    question: "When are you usually most productive?",
    options: [
      { id: "morning", label: "Morning" },
      { id: "afternoon", label: "Afternoon" },
      { id: "evening", label: "Evening" },
      { id: "varies", label: "It varies" },
    ],
  },
  {
    id: "reminder_style",
    question: "How should Vezri remind you?",
    options: [
      { id: "early_heads_up", label: "Early heads-up" },
      { id: "close_to_task", label: "Close to the task" },
      { id: "both", label: "Both" },
    ],
  },
  {
    id: "accountability_level",
    question: "How persistent should Vezri be?",
    options: [
      { id: "gentle", label: "Gentle" },
      { id: "balanced", label: "Balanced" },
      { id: "keep_me_accountable", label: "Keep me accountable" },
    ],
  },
] as const;

/** PRD §15 — Goal Health statuses, with the labels shown to the user. */
export const HEALTH_LABELS = {
  on_track: "On Track",
  needs_attention: "Needs Attention",
  at_risk: "At Risk",
  off_track: "Off Track",
  achieved: "Achieved",
  /**
   * Not a grade. §15's score needs evidence from more than one direction, and
   * until it has that the honest answer is that Vezri cannot say yet — not a
   * low number, and certainly not the 100 an empty goal used to score.
   */
  insufficient_data: "Not enough to judge yet",
} as const;

/**
 * PRD §4.6 — the line beside Vezri on a goal page.
 *
 * Encouraging, and deliberately about the work rather than about the person's
 * record: "you've got this" beside a screen of overdue tasks reads as a
 * cheerful bystander. It says nothing about how far behind anything is,
 * because that is the count line's job and it only needs saying once.
 */
export const GOAL_ENCOURAGEMENT = "Big goals move in small steps. Today only needs one.";

/** PRD §17 — the goal page's Today list. */
export const GOAL_TODAY_HEADING = "Today's Tasks";
export const GOAL_TODAY_SUBTEXT = "Only what this goal needs from you today.";
export const GOAL_TODAY_EMPTY = "Nothing on this goal needs you today.";

/**
 * What the user is told after a check-in lands.
 *
 * The only signal used to be the row moving, which says nothing about what was
 * recorded and nothing at all when the row stays put. Done names where the
 * task went, because Completed Tasks is a collapsed section and a task that
 * vanishes into one reads as a task that was lost.
 */
export const CHECKIN_CONFIRMATION: Record<"done" | "not_done" | "stuck", string> = {
  done: "Recorded as done — it is in Completed Tasks below.",
  not_done: "Recorded. Vezri is working out the smallest way forward.",
  stuck: "Recorded. Vezri is working out the smallest way forward.",
};

/** The same, on a screen that has no history section of its own to point at. */
export const CHECKIN_CONFIRMATION_AWAY: Record<"done" | "not_done" | "stuck", string> = {
  done: "Recorded as done — it has moved to this goal’s completed work.",
  not_done: CHECKIN_CONFIRMATION.not_done,
  stuck: CHECKIN_CONFIRMATION.stuck,
};

/** The completed history, below the day's work. */
export const GOAL_COMPLETED_HEADING = "Completed Tasks";
export const GOAL_COMPLETED_SUBTEXT = "Everything you have finished on this goal.";

/** PRD §16 — the audit button label, verbatim. */
export const AUDIT_LABEL = "What am I missing?";
