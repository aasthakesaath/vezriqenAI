-- =========================================================================
-- PENDING DATA MIGRATION — retire `partial` and `snoozed` task statuses.
--
-- NOT RUN. Read the counts first (step 1), then decide.
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
-- STEP 1 — look before you leap. Run this on its own first.
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
-- AFTERWARDS — one line of code to remove.
--
-- `partial` is still in OPEN_TASK_STATUSES (src/lib/plan/task-status.ts) so
-- that tasks sitting in it stay VISIBLE until this has run. Once step 3
-- returns zero, delete that entry; tests/retired-task-statuses.test.ts will
-- need its matching assertion updated in the same commit.
-- ---------------------------------------------------------------------------
