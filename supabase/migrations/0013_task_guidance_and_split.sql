-- =============================================================================
-- 0013 — how to do it, and what happens when you cannot.
--
-- Two gaps on the Today screen, both of them the same shape: the product asked
-- the user a question and had nowhere to put the answer.
--
--   * A task row offered Done / Not done / I'm stuck and never said how to DO
--     the thing. The steps are worth generating once and keeping — they do not
--     change between Tuesday and Wednesday, and paying for them on every
--     expand would be a per-render model call.
--   * "I'm stuck" collected a reason and a sentence and then closed. Every
--     path out of it now changes something, and one of those paths is "break
--     this into smaller pieces", which needs somewhere to record that the
--     parent was broken up rather than abandoned.
--
-- SECURITY POSTURE — task_guidance is deliberately NOT symmetric with the rest
-- of the schema. It is model output about the user's own task, so the user may
-- read their own rows; nothing may WRITE one from a browser session. There is
-- no insert, update or delete policy, which denies all three to anon and
-- authenticated outright and leaves only service_role — the route generates
-- the steps server-side and writes them with the service key. A client that
-- could write here could put arbitrary text in front of the user under Vezri's
-- name.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- task_guidance — the 3-5 steps for one task, generated once.
--
-- Keyed BY task_id rather than having its own id: there is exactly one set of
-- steps per task, and making that a primary key is what makes "generated once"
-- a property of the table instead of a rule the route has to remember.
-- ---------------------------------------------------------------------------
create table public.task_guidance (
  task_id       uuid primary key references public.tasks (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  -- [{ "text": "...", "minutes": 5 }] — validated against a Zod schema before
  -- it is written, so nothing that failed the shape reaches the column.
  steps         jsonb not null,
  model_version text,
  created_at    timestamptz not null default now()
);

alter table public.task_guidance enable row level security;

-- Read your own. No insert, update or delete policy exists, on purpose: see
-- the security posture note above.
create policy "task_guidance: read own" on public.task_guidance for select using ((select auth.uid()) = user_id);

create index task_guidance_user_idx on public.task_guidance (user_id);

comment on table public.task_guidance is
  'Generated once per task and cached. Readable by the owning user; written only by the service role, because a session that could write here could put arbitrary text in front of the user in Vezri''s voice.';
comment on column public.task_guidance.steps is
  'Array of { text, minutes }. Three to five steps, each starting with a verb, each under ten minutes.';

-- ---------------------------------------------------------------------------
-- A task that was broken into pieces.
--
-- Not a new task_status value. Every status this product has ever added has
-- had to be taught to Goal Health, to the open sets and to the reminder
-- dispatcher, and two of them (`partial`, `snoozed`) were retired precisely
-- because a status that some readers understood and others did not lost the
-- user's work. The route sets the parent to `skipped`, which already exists
-- and which every reader already treats as "not open work" — so the pieces are
-- never counted on top of the parent they replaced — and this timestamp
-- answers the question `skipped` cannot: was it abandoned, or broken up?
--
-- The parent is NOT completed and NOT deleted. It stays on the goal page as
-- the record of the larger piece of work; the Today list stops offering it,
-- because the pieces are now what there is to do.
-- ---------------------------------------------------------------------------
alter table public.tasks
  add column if not exists split_at timestamptz;

alter table public.tasks
  add column if not exists split_parent_id uuid references public.tasks (id) on delete set null;

comment on column public.tasks.split_at is
  'When the user broke this task into smaller pieces. The row is never completed or deleted by that - Today stops offering it because its pieces are the work now, and the goal page still shows it.';
comment on column public.tasks.split_parent_id is
  'The task this one was broken out of. Null for everything extraction wrote.';

create index if not exists tasks_split_parent_idx
  on public.tasks (split_parent_id) where split_parent_id is not null;

commit;
