-- =============================================================================
-- 0012 — one task, one row.
--
-- The same task rendered twice inside one goal, with two different one-line
-- descriptions under it. Nothing in the product ever created a task twice on
-- purpose: extraction reads a plan in passes (0007, 0010), a pass that is
-- re-run writes its tasks again, and the two runs word the RATIONALE slightly
-- differently while producing the same title. The row is new, so it inserts;
-- the user sees their day duplicated and has no way to tell which copy is the
-- real one.
--
-- Three parts, in this order and only this order:
--
--   (a) a normalising function, so "Email Ms Ndlovu." and "email Ms  Ndlovu"
--       are one key rather than two rows;
--   (b) the existing duplicates removed, OLDEST ROW KEPT — the first write is
--       the one the rest of the plan was built around, and it is the one that
--       reminders, check-ins and dependencies already point at;
--   (c) a stored generated column and a unique index, so a second write of the
--       same title inside a goal can no longer land at all.
--
-- (c) cannot come before (b): the index would refuse to build on data that
-- still holds duplicates.
--
-- What is NOT here: nothing outside a goal is compared. The same title under
-- two different goals is two different pieces of work, and merging those would
-- be a bug rather than a fix.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- (a) The key.
--
-- IMMUTABLE is a hard requirement, not a decoration: a generated column may
-- only call immutable functions, and the unique index below is only sound if
-- the same title always produces the same key.
--
-- Deliberately ASCII-only. `[[:alnum:]]` and unaccent() both read the
-- database's collation or an extension's tables, which makes the answer
-- depend on where the query runs — the one thing an index key may never do.
-- Case, punctuation and repeated whitespace are what actually differ between
-- two writes of the same title; a title made entirely of characters outside
-- [a-z0-9] normalises to NULL, and NULLs are distinct in a unique index, so
-- such a row is left alone rather than mangled into a collision.
-- ---------------------------------------------------------------------------
create or replace function public.task_title_key(title text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(
    btrim(regexp_replace(lower(coalesce(title, '')), '[^a-z0-9]+', ' ', 'g')),
    ''
  );
$$;

comment on function public.task_title_key(text) is
  'Normalised task title: lowercased, every run of non-alphanumerics collapsed to one space, trimmed. NULL when nothing is left. Immutable because tasks.title_key is generated from it and indexed on it.';

-- ---------------------------------------------------------------------------
-- (b) The duplicates that are already there.
--
-- The keeper is the oldest row in the group (created_at, then id so the choice
-- is deterministic when two rows share a timestamp to the microsecond).
-- ---------------------------------------------------------------------------
create temporary table task_duplicate_map on commit drop as
select t.id as duplicate_id, k.keep_id
from public.tasks t
join (
  select goal_id,
         public.task_title_key(title) as title_key,
         (array_agg(id order by created_at, id))[1] as keep_id
  from public.tasks
  where public.task_title_key(title) is not null
  group by goal_id, public.task_title_key(title)
  having count(*) > 1
) k
  on k.goal_id  = t.goal_id
 and k.title_key = public.task_title_key(t.title)
where t.id <> k.keep_id;

-- Every task, mapped to the row that survives. Rows with no duplicate map to
-- themselves, which is what makes the dependency rewrite below a single join.
create temporary table task_keep_map on commit drop as
select t.id as from_id, coalesce(m.keep_id, t.id) as to_id
from public.tasks t
left join task_duplicate_map m on m.duplicate_id = t.id;

create index on task_keep_map (from_id);

do $$
declare
  duplicate_rows integer;
  affected_goals integer;
begin
  select count(*), count(distinct t.goal_id)
    into duplicate_rows, affected_goals
  from task_duplicate_map m
  join public.tasks t on t.id = m.duplicate_id;

  raise notice '0012: % duplicate task rows across % goals', duplicate_rows, affected_goals;
end $$;

-- History first. A check-in and a block are the user's own record of what
-- happened, and the row they were filed against is about to stop existing.
-- Moving them onto the keeper preserves them; the cascade would not.
update public.check_ins c
set task_id = m.keep_id
from task_duplicate_map m
where c.task_id = m.duplicate_id;

update public.execution_blocks b
set task_id = m.keep_id
from task_duplicate_map m
where b.task_id = m.duplicate_id;

-- A dependency edge that would point a task at itself once both ends are
-- remapped is not a dependency, and task_dependencies_no_self_reference would
-- refuse the update anyway. It goes before the rewrite, not after.
delete from public.task_dependencies d
using task_keep_map a, task_keep_map b
where d.task_id = a.from_id
  and d.depends_on_task_id = b.from_id
  and a.to_id = b.to_id;

update public.task_dependencies d
set task_id = m.keep_id
from task_duplicate_map m
where d.task_id = m.duplicate_id;

update public.task_dependencies d
set depends_on_task_id = m.keep_id
from task_duplicate_map m
where d.depends_on_task_id = m.duplicate_id;

-- The rewrite can leave two identical edges where the duplicate and the keeper
-- both had one. Same pair, same kind, same person: one edge.
delete from public.task_dependencies a
using public.task_dependencies b
where a.ctid > b.ctid
  and a.task_id = b.task_id
  and a.dependency_type = b.dependency_type
  and a.depends_on_task_id is not distinct from b.depends_on_task_id
  and a.external_party_name is not distinct from b.external_party_name;

-- Now the rows themselves. Pending reminders and calendar blocks belonging to
-- a duplicate cascade with it (0003, 0004) — they were scheduled off dates the
-- keeper carries too, and the keeper's own set stays.
delete from public.tasks t
using task_duplicate_map m
where t.id = m.duplicate_id;

-- ---------------------------------------------------------------------------
-- (c) It cannot happen again.
--
-- STORED rather than a plain index expression: the key is read by the
-- application (the extraction upsert names it as its conflict target), so it
-- has to be a column PostgREST can see.
-- ---------------------------------------------------------------------------
alter table public.tasks
  add column if not exists title_key text
  generated always as (public.task_title_key(title)) stored;

comment on column public.tasks.title_key is
  'Generated from title. The uniqueness key inside a goal, and the conflict target the plan extraction upserts against.';

create unique index if not exists tasks_goal_title_key_idx
  on public.tasks (goal_id, title_key);

do $$
declare
  remaining integer;
begin
  select count(*) into remaining
  from (
    select 1
    from public.tasks
    where title_key is not null
    group by goal_id, title_key
    having count(*) > 1
  ) still_duplicated;

  raise notice '0012: % duplicate groups remaining (expected 0)', remaining;
end $$;

commit;
