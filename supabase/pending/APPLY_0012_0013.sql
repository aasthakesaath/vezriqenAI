-- =========================================================================
-- APPLIED 2026-09-14. 0001-0013 are now applied.
--
-- Run by the project owner in the Supabase SQL editor. Verified afterwards:
-- normalized_task_title exists, tasks_goal_title_key_unique exists,
-- task_guidance exists with exactly one policy, tasks went 325 rows to 291
-- with zero duplicates remaining, and both split_at and split_from_task_id
-- are present on tasks.
--
-- So 0012 removed 34 surplus rows — 34 pieces of work that were on the plan
-- twice, each of them a task someone could tick off and still see sitting
-- there. That is the count the migration exists for, and it is now zero.
--
-- The file stays here, as APPLY_0005_0006 and APPLY_0007 do: it is the record
-- of what was run against live data and what it did, and STEP 1 below is
-- still the query that answers "are there duplicates" on any future day.
-- Nothing in it needs running again — every statement is idempotent, but the
-- clean-up has nothing left to clean.
--
-- 0012 stops the same task being stored twice in one goal. 0013 adds the
-- table the how-to steps are cached in, and the two columns that record a
-- task the user broke into pieces.
--
-- ORDER MATTERS ONLY IN ONE PLACE: the unique index in 0012 cannot be created
-- while duplicates exist, so the clean-up runs first, inside the same
-- transaction. Everything here is idempotent — running it twice is a no-op.
--
-- WHAT IT UNBLOCKED. lib/plan/build.ts upserts on (goal_id, title_key), so
-- extraction could not have written a task batch without the generated
-- column; "Break it into N pieces" writes split_at and split_from_task_id;
-- and the how-to steps had nowhere to cache, so every card expansion paid for
-- a fresh model call. All three are live now.
-- =========================================================================


-- =========================================================================
-- STEP 1 — the duplicate count. Read-only. It was 34 before the run and 0
-- after; it stays the query to run if duplicates are ever suspected again.
--
-- "Duplicate rows" means surplus rows: a title stored three times in one goal
-- counts as two. That is the number that goes to zero.
-- =========================================================================

select
  coalesce(sum(n - 1), 0)                         as duplicate_rows,
  count(*) filter (where n > 1)                   as affected_titles,
  count(distinct goal_id) filter (where n > 1)    as affected_goals
from (
  select
    goal_id,
    count(*) as n
  from public.tasks
  where nullif(btrim(regexp_replace(lower(title), '[^[:alnum:]]+', ' ', 'g')), '') is not null
  group by goal_id, nullif(btrim(regexp_replace(lower(title), '[^[:alnum:]]+', ' ', 'g')), '')
) groups;


-- The worst offenders, for a sanity check that these really are duplicates
-- and not two genuinely different tasks that happen to punctuate alike.
select
  goal_id,
  min(title)  as example_title,
  count(*)    as copies
from public.tasks
where nullif(btrim(regexp_replace(lower(title), '[^[:alnum:]]+', ' ', 'g')), '') is not null
group by goal_id, nullif(btrim(regexp_replace(lower(title), '[^[:alnum:]]+', ' ', 'g')), '')
having count(*) > 1
order by copies desc, example_title
limit 25;


-- =========================================================================
-- STEP 2 — DONE 2026-09-14: supabase/migrations/0012_task_title_dedupe.sql
-- then supabase/migrations/0013_task_guidance.sql, each run whole.
--
-- 0012 prints its own before/after to the Notices pane:
--   [0012] duplicate task rows before: N
--   [0012] duplicate task rows after: 0 (M completions carried to the kept row)
--
-- What 0012 does to a group, in order: if any copy was marked done, the kept
-- row is marked done too (an untick would be the migration undoing something
-- the user did); check_ins and execution_blocks are re-pointed at the kept
-- row so the history survives; then the surplus rows are deleted and their
-- reminders and calendar blocks cascade with them.
-- =========================================================================


-- =========================================================================
-- VERIFY — the duplicate count AFTER, plus the constraint that keeps it there.
--
-- Expect: duplicate_rows 0, title_key present, tasks_goal_title_key_unique
-- listed, task_guidance with rls_enabled true and exactly one policy (SELECT).
-- =========================================================================

select coalesce(sum(n - 1), 0) as duplicate_rows_after
from (
  select count(*) as n
  from public.tasks
  where public.normalized_task_title(title) is not null
  group by goal_id, public.normalized_task_title(title)
) groups;

select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'tasks'
       and column_name in ('title_key', 'split_at', 'split_from_task_id'))
    as new_task_columns,          -- expect 3
  (select count(*) from pg_indexes
     where schemaname = 'public' and indexname = 'tasks_goal_title_key_unique')
    as unique_index,              -- expect 1
  (select relrowsecurity from pg_class
     where oid = 'public.task_guidance'::regclass)
    as guidance_rls_enabled,      -- expect true
  (select string_agg(cmd::text, ', ' order by cmd::text) from pg_policies
     where schemaname = 'public' and tablename = 'task_guidance')
    as guidance_policies;         -- expect exactly: SELECT


-- The negative check that matters for 0013: no session-writable policy on
-- task_guidance. Expect zero rows.
select policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename = 'task_guidance'
  and cmd <> 'SELECT';
