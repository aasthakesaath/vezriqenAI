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
