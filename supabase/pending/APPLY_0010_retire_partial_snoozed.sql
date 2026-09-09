-- =========================================================================
-- DATA MIGRATION — retire `partial` and `snoozed` task statuses.
--
-- APPLIED 2026-09-09. Kept here, like 0005-0009, as the record of what was
-- run. Steps 1 and 3 are safe to re-run at any time; step 2 is idempotent and
-- now affects nothing.
--
-- Why: "Partly" and "Snooze" were removed from the product on 2026-09-09
-- (owner decision). Both wrote a status nothing read correctly:
--
--   partial   sits outside BOTH of Goal Health's open sets, so a task marked
--             partly done dropped out of the overdue penalty and out of
--             required effort — the score ROSE, and nothing recorded what was
--             left, because no field for that exists. (§4.10.)
--   snoozed   sits outside EVERY open set, and nothing has ever read
--             `snooze_until`. A snoozed task left Today and never came back.
--
-- This moves the LIVE STATUS on tasks only. It does not touch check_ins:
-- those rows are the record of what a person actually reported, and rewriting
-- history to match a later product decision would be a lie about the past.
-- The `task_status` enum keeps both values for the same reason.
--
-- Destinations:
--   partial  -> in_progress   started, not finished. Re-enters the overdue
--                             and capacity maths, which is the point.
--   snoozed  -> not_started   deferred, never begun. Returns to Today.
--
-- Idempotent: running it twice affects nothing the second time.
-- =========================================================================

-- ---------------------------------------------------------------------------
-- STEP 1 — the counts, read before anything was changed.
-- ---------------------------------------------------------------------------
select
  status,
  count(*) as tasks,
  count(*) filter (where deadline < current_date) as overdue,
  min(created_at)::date as oldest,
  max(created_at)::date as newest
from public.tasks
where status in ('partial', 'snoozed')
group by status
order by status;

-- The history that will NOT be touched, for comparison:
select state, count(*) as check_ins
from public.check_ins
where state in ('partial', 'snoozed')
group by state
order by state;

-- ---------------------------------------------------------------------------
-- STEP 2 — the migration itself.
-- ---------------------------------------------------------------------------
begin;

update public.tasks
set status = 'in_progress'
where status = 'partial';

update public.tasks
set status = 'not_started'
where status = 'snoozed';

commit;

-- ---------------------------------------------------------------------------
-- STEP 3 — verify. Both counts must be zero.
-- ---------------------------------------------------------------------------
select count(*) as tasks_left_in_retired_statuses
from public.tasks
where status in ('partial', 'snoozed');

-- ---------------------------------------------------------------------------
-- AFTERWARDS — done.
--
-- `partial` was in OPEN_TASK_STATUSES (src/lib/plan/task-status.ts) only so
-- that tasks sitting in it stayed VISIBLE until this ran. It was removed once
-- this was applied, along with its assertion in
-- tests/retired-task-statuses.test.ts, which now checks the opposite: neither
-- retired status is readable, and both destinations are.
--
-- If step 3 ever returns a non-zero count again, something is writing a
-- retired status. tests/retired-task-statuses.test.ts is meant to catch that
-- before it ships; the one known writer outside the app is the email
-- reminder's Snooze link (src/lib/reminders/redeem.ts), which has not been
-- changed because it means changing what an email button does.
-- ---------------------------------------------------------------------------
