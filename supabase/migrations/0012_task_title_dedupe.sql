-- =========================================================================
-- 0012 — one task, one row.
--
-- Extraction reads a plan in passes, and the same piece of work reached the
-- model more than once: a task named in a milestone's own section and again in
-- the plan's summary comes back twice, with the same title and two different
-- rationales. Both were inserted, and Today rendered the same task twice under
-- one goal with two different explanations under it.
--
-- The prompt already tells each task pass to ignore work belonging to another
-- milestone (see tasksPrompt). That is guidance, and guidance is not a
-- constraint — the duplicates are the proof. So the rule moves into the
-- database, where a second copy is refused rather than asked not to happen:
--
--   (a) a normalising function, so "Draft the outreach email." and
--       "Draft the outreach  email" are recognised as the same title;
--   (b) a one-time clean-up of what is already stored, oldest row kept;
--   (c) a generated title_key and a unique index on (goal_id, title_key),
--       which is what makes (b) a clean-up rather than a chore that repeats.
--
-- The application side of this is in lib/plan/build.ts, which upserts with
-- ignoreDuplicates so a second copy is skipped instead of failing the batch.
-- src/lib/plan/task-title.ts is the same normalisation in TypeScript, for the
-- call sites that need to dedupe before they write.
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- (a) What makes two titles the same title.
--
-- Case, punctuation and whitespace only. Nothing semantic: "Email Priya" and
-- "Send Priya an email" are two different sentences and merging them would be
-- Vezri deciding it knows better than the plan.
--
-- IMMUTABLE because a generated column and a unique index both require it.
-- The body is built from pg_catalog functions only, so it does not depend on
-- the caller's search_path.
--
-- Returns NULL for a title made entirely of punctuation. NULLs do not collide
-- in a unique index, which is the behaviour we want: two unreadable titles are
-- not evidence of a duplicate, and refusing the second would lose a row.
-- -------------------------------------------------------------------------
create or replace function public.normalized_task_title(title text)
returns text
language sql
immutable
parallel safe
returns null on null input
as $$
  select nullif(btrim(regexp_replace(lower($1), '[^[:alnum:]]+', ' ', 'g')), '')
$$;

comment on function public.normalized_task_title(text) is
  'Case-folded, punctuation-stripped, whitespace-collapsed title. The key tasks are deduplicated by within a goal. Null for a title with no alphanumeric content, which never collides.';

-- -------------------------------------------------------------------------
-- (b) The rows that are already duplicated.
--
-- The OLDEST row in each group is kept, as the one the rest of the plan was
-- built around: its id is what task_dependencies, reminders and calendar
-- blocks already point at.
--
-- Two things are carried across before the surplus rows go, because deleting
-- them would otherwise destroy something the user did rather than something
-- extraction did:
--
--   * a completion. If the copy the user ticked off is not the keeper, the
--     keeper is marked done rather than the task springing back to life.
--   * their history. check_ins and execution_blocks are re-pointed at the
--     keeper instead of being cascaded away with the row they hung off.
--
-- reminders, calendar_blocks and email_action_tokens are NOT re-pointed: they
-- are scheduling for a row that is about to stop existing, the keeper has its
-- own, and two reminders for one task is the duplicate showing up in an inbox
-- instead of on a screen. They cascade.
-- -------------------------------------------------------------------------
do $$
declare
  duplicates_before integer;
  duplicates_after  integer;
  completions_kept  integer;
begin
  select coalesce(sum(n - 1), 0) into duplicates_before
  from (
    select count(*) as n
    from public.tasks
    where public.normalized_task_title(title) is not null
    group by goal_id, public.normalized_task_title(title)
  ) groups
  where n > 1;

  raise notice '[0012] duplicate task rows before: %', duplicates_before;

  create temporary table _task_duplicates on commit drop as
  select id, keeper_id
  from (
    select
      id,
      first_value(id) over (
        partition by goal_id, public.normalized_task_title(title)
        order by created_at, id
      ) as keeper_id
    from public.tasks
    where public.normalized_task_title(title) is not null
  ) ranked
  where id <> keeper_id;

  -- A completion on a surplus row belongs to the keeper. The earliest one, so
  -- the record says when the work was actually finished.
  with carried as (
    select d.keeper_id, min(t.completed_at) as completed_at
    from _task_duplicates d
    join public.tasks t on t.id = d.id
    where t.status = 'done'
    group by d.keeper_id
  )
  update public.tasks k
  set status       = 'done',
      completed_at = coalesce(k.completed_at, carried.completed_at, now())
  from carried
  where k.id = carried.keeper_id
    and k.status <> 'done';

  get diagnostics completions_kept = row_count;

  update public.check_ins c
  set task_id = d.keeper_id
  from _task_duplicates d
  where c.task_id = d.id;

  update public.execution_blocks b
  set task_id = d.keeper_id
  from _task_duplicates d
  where b.task_id = d.id;

  delete from public.tasks t
  using _task_duplicates d
  where t.id = d.id;

  select coalesce(sum(n - 1), 0) into duplicates_after
  from (
    select count(*) as n
    from public.tasks
    where public.normalized_task_title(title) is not null
    group by goal_id, public.normalized_task_title(title)
  ) groups
  where n > 1;

  raise notice '[0012] duplicate task rows after: % (% completions carried to the kept row)',
    duplicates_after, completions_kept;
end $$;

-- -------------------------------------------------------------------------
-- (c) So it cannot happen again.
--
-- Generated and STORED rather than an expression index, because the
-- application needs to name the conflict target: PostgREST's upsert takes a
-- column list, not an expression, so `on_conflict=goal_id,title_key` is what
-- lets build.ts skip a duplicate instead of failing a whole batch of tasks.
-- -------------------------------------------------------------------------
alter table public.tasks
  add column if not exists title_key text
  generated always as (public.normalized_task_title(title)) stored;

comment on column public.tasks.title_key is
  'Generated from title. The unique index below is on (goal_id, title_key), so a goal cannot hold the same task twice however the title is punctuated.';

create unique index if not exists tasks_goal_title_key_unique
  on public.tasks (goal_id, title_key);

commit;
