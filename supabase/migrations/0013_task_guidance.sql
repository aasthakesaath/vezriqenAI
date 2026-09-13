-- =========================================================================
-- 0013 — how to actually do it, and what happens when it is broken up.
--
-- A task card offered Done, Not done and I'm stuck, and never once said how to
-- do the thing. "Didn't know how to start" is one of the eight barriers §13
-- already asks about, so the product knew this was a real failure and still
-- answered it only after the work had been missed.
--
-- Two additions:
--
--   task_guidance   the steps, cached per task so they are generated once. A
--                   model call per card expansion would be paid for on every
--                   visit, and the steps for a task do not change between two
--                   Tuesdays.
--
--   tasks.split_at  where a task went when the user broke it into pieces, and
--   split_from_...  which pieces came from it. Without these the parent either
--                   stays on the list beside its own children — the duplicate
--                   this milestone's other migration exists to stop — or it
--                   silently disappears with no record of why.
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- task_guidance (PRD §13 "didn't know how to start", §20 explanations)
--
-- Keyed by task_id, not a surrogate id: one task has one set of steps, and a
-- primary key is the cheapest way to say so. Deleting the task takes the
-- guidance with it.
--
-- RLS IS DELIBERATELY ASYMMETRIC. Select-own, and no insert, update or delete
-- policy at all — so a session can read its own steps and cannot write any.
-- The rows are model output paid for by us and rendered as instructions; a
-- client able to write here could put its own text in front of the next
-- reader. Only the service-role key, which never reaches the browser, writes
-- them, and it does so in /api/tasks/[id]/guidance after checking the task
-- belongs to the caller.
--
-- A security scanner reporting "table has RLS but no insert policy" is
-- describing the intent, the same way it does for calendar_credentials.
-- -------------------------------------------------------------------------
create table public.task_guidance (
  task_id       uuid primary key references public.tasks (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  -- [{ action, minutes, where }] — 3 to 5 of them, validated in the route
  -- against a Zod schema before anything is written.
  steps         jsonb not null,
  model_version text,
  created_at    timestamptz not null default now()
);

alter table public.task_guidance enable row level security;

create policy "task_guidance: read own"
  on public.task_guidance for select
  using ((select auth.uid()) = user_id);

comment on table public.task_guidance is
  'Cached how-to steps for one task. Select-own for authenticated; every write is service-role, so rendered instructions cannot be authored by a client.';

create index task_guidance_user_idx on public.task_guidance (user_id);

-- -------------------------------------------------------------------------
-- A task the user broke into smaller pieces (PRD §13 split_task).
--
-- One ALTER per column: scripts/build-schema-manifest.mjs reads the first
-- column of an `add column` statement, so a combined ALTER would leave the
-- second one out of the manifest and out of the preflight check.
-- -------------------------------------------------------------------------
alter table public.tasks
  add column if not exists split_at timestamptz;

alter table public.tasks
  add column if not exists split_from_task_id uuid references public.tasks (id) on delete set null;

comment on column public.tasks.split_at is
  'When the user broke this task into smaller ones. The row moves to status skipped at the same time - the work now lives in its children, and leaving it open would put the parent on Today beside them.';

comment on column public.tasks.split_from_task_id is
  'The task this one was split out of. Null for everything extraction created.';

create index tasks_split_from_idx on public.tasks (split_from_task_id)
  where split_from_task_id is not null;

commit;
