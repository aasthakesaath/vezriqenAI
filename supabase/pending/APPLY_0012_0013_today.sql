-- =========================================================================
-- PENDING MIGRATIONS 0012 and 0013 — the Today screen rework (2026-09-13).
--
-- Unlike the earlier files in this directory, the migrations themselves are
-- NOT inlined here. 0012 is ~190 lines with a temp-table cleanup in the middle
-- of it, and a second copy of that is a copy that drifts. Run the files:
--
--     supabase/migrations/0012_task_title_uniqueness.sql
--     supabase/migrations/0013_task_guidance_and_split.sql
--
-- in that order, whole, in the SQL editor. Both are wrapped in begin/commit,
-- both are idempotent as written, and 0012 reports its own before-and-after
-- counts as NOTICEs while it runs.
--
-- What this file is for: the numbers. STEP 1 is the count BEFORE, STEP 3 is
-- the count AFTER, and they are the same query so the two are comparable.
--
-- ORDER MATTERS AGAINST THE DEPLOY.
--   0012 before or after the deploy is fine, with one caveat: the extraction
--   upsert names (goal_id, title_key) as its conflict target, so a deploy
--   that lands BEFORE 0012 makes every task write fail with "there is no
--   unique or exclusion constraint matching the ON CONFLICT specification" —
--   at the end of a paid-for extraction. Run 0012 first.
--   0013 must also precede the deploy: /api/tasks/[id]/guidance writes
--   task_guidance, and the "break it into pieces" path writes tasks.split_at.
--
-- /api/health/schema compares the live database against the checked-in
-- manifest, so it answers "did this actually apply?" without a query.
-- =========================================================================

-- -------------------------------------------------------------------------
-- STEP 1 — the duplicate count BEFORE. Run this on its own and keep the row.
--
-- The expression is 0012's normalisation written out inline, because
-- public.task_title_key() does not exist yet at this point. It must stay
-- identical to the function body in 0012:
--
--     nullif(btrim(regexp_replace(lower(coalesce(title,'')),'[^a-z0-9]+',' ','g')),'')
--
-- duplicate_groups  how many distinct tasks exist in more than one copy
-- duplicate_rows    how many rows will be deleted (each group loses all but
--                   its oldest row)
-- goals_affected    how many goals are showing a doubled day
-- -------------------------------------------------------------------------
with keyed as (
  select
    goal_id,
    nullif(btrim(regexp_replace(lower(coalesce(title, '')), '[^a-z0-9]+', ' ', 'g')), '') as title_key
  from public.tasks
),
grouped as (
  select goal_id, title_key, count(*) as copies
  from keyed
  where title_key is not null
  group by goal_id, title_key
  having count(*) > 1
)
select
  (select count(*) from public.tasks)                    as total_tasks,
  coalesce((select count(*) from grouped), 0)            as duplicate_groups,
  coalesce((select sum(copies - 1) from grouped), 0)     as duplicate_rows,
  coalesce((select count(distinct goal_id) from grouped), 0) as goals_affected;

-- Optional: see them. Useful for confirming these really are the same task
-- twice rather than two tasks that happen to normalise alike.
--
-- select t.goal_id, t.title, t.created_at, t.rationale
-- from public.tasks t
-- join (
--   select goal_id,
--          nullif(btrim(regexp_replace(lower(coalesce(title,'')),'[^a-z0-9]+',' ','g')),'') as k
--   from public.tasks
--   group by 1, 2 having count(*) > 1
-- ) d
--   on d.goal_id = t.goal_id
--  and d.k = nullif(btrim(regexp_replace(lower(coalesce(t.title,'')),'[^a-z0-9]+',' ','g')),'')
-- order by t.goal_id, d.k, t.created_at;

-- -------------------------------------------------------------------------
-- STEP 2 — run the two migration files, in order. Nothing to paste here.
--
-- 0012 prints, as it runs:
--     NOTICE:  0012: N duplicate task rows across M goals
--     NOTICE:  0012: 0 duplicate groups remaining (expected 0)
--
-- The first N is the same number STEP 1 reported as duplicate_rows. If it is
-- not, something wrote a task between the two — re-run STEP 1 afterwards and
-- trust STEP 3.
-- -------------------------------------------------------------------------

-- -------------------------------------------------------------------------
-- STEP 3 — the duplicate count AFTER. Expect duplicate_groups = 0.
--
-- This one can use the real function, which is the point: it proves the
-- function the index is built on gives the same answer STEP 1 computed by
-- hand.
-- -------------------------------------------------------------------------
with grouped as (
  select goal_id, title_key, count(*) as copies
  from public.tasks
  where title_key is not null
  group by goal_id, title_key
  having count(*) > 1
)
select
  (select count(*) from public.tasks)                as total_tasks,
  coalesce((select count(*) from grouped), 0)        as duplicate_groups,
  coalesce((select sum(copies - 1) from grouped), 0) as duplicate_rows;

-- -------------------------------------------------------------------------
-- STEP 4 — verify the structure, not just the data.
--
-- Expect: title_key present and ALWAYS generated; the unique index over
-- (goal_id, title_key); task_guidance with exactly one policy, a SELECT one;
-- tasks.split_at and tasks.split_parent_id present.
-- -------------------------------------------------------------------------
select
  (select is_generated from information_schema.columns
     where table_schema = 'public' and table_name = 'tasks' and column_name = 'title_key')
    as title_key_generated,
  (select count(*) from pg_indexes
     where schemaname = 'public' and indexname = 'tasks_goal_title_key_idx')
    as unique_index_present,
  (select string_agg(column_name, ', ' order by column_name)
     from information_schema.columns
     where table_schema = 'public' and table_name = 'tasks'
       and column_name in ('split_at', 'split_parent_id'))
    as split_columns,
  -- polcmd is "char", which has no unambiguous || against text. Cast it.
  (select string_agg(polname || ' (' || polcmd::text || ')', ', ')
     from pg_policy p join pg_class c on c.oid = p.polrelid
     where c.relname = 'task_guidance')
    as task_guidance_policies;

-- -------------------------------------------------------------------------
-- STEP 5 — prove the door is shut. This MUST fail.
--
-- Swap in a real goal_id and the title of a task that already exists in it.
-- Expect: duplicate key value violates unique constraint
--         "tasks_goal_title_key_idx"
--
-- Wrapped so it cannot leave a row behind if it unexpectedly succeeds.
-- -------------------------------------------------------------------------
-- begin;
-- insert into public.tasks (user_id, goal_id, title, origin, confidence)
-- select user_id, goal_id, upper(title) || '!!', origin, confidence
-- from public.tasks
-- where goal_id = '<a goal id>'
-- limit 1;
-- rollback;

-- =========================================================================
-- NOT DONE HERE, and why:
--
--   Nothing is merged across goals. The same title under two goals is two
--   different pieces of work; collapsing those would be a bug, not a fix.
--
--   A duplicate's pending reminders and calendar blocks cascade away with it
--   (0003, 0004). The row that survives has its own set, scheduled off the
--   same dates. A Google Calendar event that Vezri created for a deleted
--   duplicate is NOT removed from the user's calendar — it is a near-copy of
--   the surviving task's own block, sitting in the same slot.
--
--   check_ins and execution_blocks are MOVED onto the surviving row rather
--   than cascaded. They are the record of what the user themselves reported,
--   and losing that to tidy up a row they never knew was duplicated would be
--   the worse trade.
-- =========================================================================
