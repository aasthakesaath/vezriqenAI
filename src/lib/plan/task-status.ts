/**
 * What a task's status means, in one place.
 *
 * Five modules were each carrying their own copy of "which statuses are still
 * open work", and a sixth and seventh carried narrower sets for their own
 * reasons. That is how a status ends up meaning one thing to the task list and
 * another to Goal Health: `partial` was in every list's open set and in
 * neither of score.ts's, so marking a task Partly quietly removed it from the
 * overdue penalty and the score went UP with no record of what remained —
 * §4.10's exact failure mode.
 *
 * So the shared meaning lives here, and the sets that are deliberately
 * narrower say so where they are.
 */

/**
 * Work that still wants doing, for the lists that show a user their day.
 *
 * `partial` was in here until 2026-09-09, purely so that tasks sitting in a
 * retired status stayed VISIBLE while they waited to be migrated. The
 * migration has run (APPLY_0010), no task holds either retired status, and
 * reading them would now only be a way for one to come back unnoticed.
 */
export const OPEN_TASK_STATUSES = ["not_started", "in_progress", "unconfirmed"] as const;

/**
 * Statuses the product no longer writes, and where each one should land.
 *
 * `partial` — "Partly" wrote a status nothing read correctly. It sat outside
 * score.ts's open sets, so it removed a task from the overdue and capacity
 * maths; the execution profile counted it as a plain non-completion; nothing
 * captured what was left, and no field existed to capture it in. Unfinished
 * work that was started is `in_progress`.
 *
 * `snoozed` — "Snooze" was the behaviour §13 exists to replace, and it lost
 * data: the status sits outside every open set and nothing has ever read
 * `snooze_until`, so a snoozed task left Today permanently instead of coming
 * back. Deferred work that was never begun is `not_started`.
 *
 * Both remain in the `task_status` enum and both remain in `check_ins.state`
 * history, which is a record of what the user actually reported and is not
 * rewritten. This is only about the live status on the task itself.
 *
 * Applied 2026-09-09 by supabase/pending/APPLY_0010_retire_partial_snoozed.sql.
 * The map is kept afterwards rather than deleted: it is what the guard test
 * checks against, and it is the record of where the rows went.
 */
export const RETIRED_TASK_STATUSES = {
  partial: "in_progress",
  snoozed: "not_started",
} as const;

export type RetiredTaskStatus = keyof typeof RETIRED_TASK_STATUSES;

export function isOpenTaskStatus(status: string): boolean {
  return (OPEN_TASK_STATUSES as readonly string[]).includes(status);
}

/**
 * Every value of the `task_status` enum, in the order 0002 declares them.
 *
 * Here so a route can be asked "what do you do with each of these?" and
 * answer for all nine rather than for the three it happened to think about.
 * tests/task-state.test.ts iterates this list and fails if a new status is
 * added without each route deciding what it means.
 */
export const TASK_STATUSES = [
  "not_started",
  "in_progress",
  "done",
  "partial",
  "not_done",
  "snoozed",
  "blocked",
  "unconfirmed",
  "skipped",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

/**
 * Statuses where this ROW's work is over.
 *
 * `done` is finished. `skipped` is a task that was broken into smaller ones —
 * the work is still outstanding, but it is outstanding on the children now,
 * and the parent is no longer the row to act on.
 *
 * Nothing else belongs here, and `blocked` in particular does not: a blocked
 * task is the most likely thing in the product for someone to press "I'm
 * stuck" on, and a handler that will not accept one has refused help at the
 * exact moment it was asked for.
 */
export const TERMINAL_TASK_STATUSES = ["done", "skipped"] as const;

export function isTerminalTaskStatus(status: string): boolean {
  return (TERMINAL_TASK_STATUSES as readonly string[]).includes(status);
}

/**
 * Work that still wants doing, however badly it is going.
 *
 * Deliberately the COMPLEMENT of terminal rather than a list of its own. An
 * allow-list is what produced a route that silently refused `blocked`, and it
 * would do it again the next time a status is added: a new value would be
 * absent from the list and therefore refused, which is the wrong default. An
 * unrecognised status is treated as outstanding for the same reason — a
 * handler should not decline to help because it does not know what state
 * something is in.
 *
 * Not the same set as OPEN_TASK_STATUSES, which is narrower on purpose: that
 * one answers "does this belong on the day's list", and a blocked task does
 * not belong there while it still deserves an answer when asked about.
 */
export function isOutstandingTaskStatus(status: string): boolean {
  return !isTerminalTaskStatus(status);
}

/** Why a terminal task was refused, in the user's words. */
export function terminalStatusReason(status: string): string {
  if (status === "skipped") {
    return "This task was broken into smaller ones, so it isn't the row to work on any more.";
  }
  return "This task is already marked done.";
}
