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

/** PRD §12 — the action-checkpoint response set. */
export const CHECKIN_ACTIONS = [
  { id: "done", label: "Done" },
  { id: "partial", label: "Partially done" },
  { id: "not_done", label: "Not done" },
  { id: "snoozed", label: "Snooze" },
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
} as const;

/** PRD §16 — the audit button label, verbatim. */
export const AUDIT_LABEL = "What am I missing?";
