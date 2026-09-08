import type { TASK_TYPES } from "@/lib/ai/schemas";

export type TaskType = (typeof TASK_TYPES)[number];

/**
 * Lead-time intelligence (PRD §9).
 *
 * "A deadline is not the same as the date work should begin." This is
 * deliberately deterministic — no model call. A start-by date the user is asked
 * to trust has to be explainable and reproducible, and §4.8 requires a
 * one-sentence reason for the high-impact ones.
 */

/**
 * Days of runway each type needs before its deadline, before effort is added.
 *
 * The ordering is the point: anything that depends on another person gets the
 * most, because the user cannot recover that time by working harder — the §25.B
 * recommendation letter is the worked example.
 */
const BASE_BUFFER_DAYS: Record<TaskType, number> = {
  external_dependency: 21,
  multi_step_project: 21,
  submission: 14,
  study_prep: 14,
  approval_review: 10,
  deep_work: 7,
  purchase_reservation: 7,
  meeting: 2,
  simple_action: 2,
  routine_habit: 0,
};

/** Plain-language reason, used verbatim in the UI (§4.8). */
const BUFFER_REASON: Record<TaskType, string> = {
  external_dependency: "this needs someone else to act, and you can't control their timing",
  multi_step_project: "this has several stages that have to happen in order",
  submission: "submissions leave no room to recover if something goes wrong late",
  study_prep: "this needs repeated sessions rather than one sitting",
  approval_review: "approvals usually take longer than expected",
  deep_work: "this needs uninterrupted time you'll have to find",
  purchase_reservation: "prices and availability get worse close to the date",
  meeting: "this just needs scheduling",
  simple_action: "this is quick",
  routine_habit: "this is a routine",
};

/** Hours of real work assumed available per day when spreading effort. */
const ASSUMED_DAILY_CAPACITY_MINUTES = 90;

export type LeadTimeInput = {
  taskType: TaskType;
  deadline: Date | null;
  estimatedMinutes: number | null;
  /** Number of unresolved prerequisites; each adds runway. */
  dependencyCount: number;
  /** Learned preference; a shorter block means the work spreads over more days. */
  preferredBlockMinutes?: number;
};

export type LeadTimeResult = {
  startBy: Date | null;
  /** One sentence, PRD §4.8. Null when there is no deadline to work back from. */
  reason: string | null;
  bufferDays: number;
};

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Works backward from the deadline to the date work must start.
 *
 * Buffer = type baseline + effort spread over realistic daily capacity + a few
 * days per unresolved dependency.
 */
export function calculateStartBy(input: LeadTimeInput): LeadTimeResult {
  const base = BASE_BUFFER_DAYS[input.taskType];

  const capacity = input.preferredBlockMinutes ?? ASSUMED_DAILY_CAPACITY_MINUTES;
  const effortDays = input.estimatedMinutes
    ? Math.ceil(input.estimatedMinutes / Math.max(capacity, 15))
    : 0;

  const dependencyDays = Math.min(input.dependencyCount, 4) * 3;
  const bufferDays = base + effortDays + dependencyDays;

  if (!input.deadline) {
    return { startBy: null, reason: null, bufferDays };
  }

  const startBy = addDays(input.deadline, -bufferDays);

  const clauses = [BUFFER_REASON[input.taskType]];
  if (effortDays > 1) clauses.push(`it's about ${effortDays} days of actual work`);
  if (dependencyDays > 0) clauses.push("something else has to happen first");

  const reason = `Start by ${formatDate(startBy)} because ${clauses.join(", and ")}.`;

  return { startBy, reason, bufferDays };
}

/**
 * Reminder schedule for a task (PRD §9 output, §12 two reminder types).
 *
 * A heads-up before work should begin, and an action checkpoint that requires a
 * response. §12: "Every important task should eventually produce an action
 * checkpoint."
 */
export type ReminderPlan = {
  type: "heads_up" | "action_checkpoint";
  scheduledAt: Date;
  responseRequired: boolean;
};

export function planReminders(input: {
  startBy: Date | null;
  deadline: Date | null;
  taskType: TaskType;
  priority: number;
}): ReminderPlan[] {
  const reminders: ReminderPlan[] = [];

  if (input.startBy) {
    // Heads-up the day before work should begin — informational, no response.
    reminders.push({
      type: "heads_up",
      scheduledAt: addDays(input.startBy, -1),
      responseRequired: false,
    });

    // Checkpoint on the start-by date itself. This is the one that closes the
    // loop, and it is what makes the Execution Block Coach reachable.
    reminders.push({
      type: "action_checkpoint",
      scheduledAt: input.startBy,
      responseRequired: true,
    });
  }

  // A hard deadline that is not the start-by date earns one more check, but
  // only for work that matters — §12 forbids one email per low-value task.
  if (input.deadline && input.priority <= 2) {
    const check = addDays(input.deadline, -2);
    const alreadyCovered = reminders.some(
      (r) => Math.abs(r.scheduledAt.getTime() - check.getTime()) < 24 * 60 * 60 * 1000,
    );
    if (!alreadyCovered) {
      reminders.push({ type: "action_checkpoint", scheduledAt: check, responseRequired: true });
    }
  }

  return reminders.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}
