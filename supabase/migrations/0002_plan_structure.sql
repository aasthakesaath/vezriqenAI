-- =============================================================================
-- Vezriqen AI — Milestone 3: extracted plan structure
-- Milestones, tasks, dependencies, and the AI decision log.
--
-- Provenance (PRD §7) is not optional metadata here: origin and confidence are
-- NOT NULL on both milestones and tasks, so it is impossible to insert an
-- extracted item without recording whether it came from the document or from
-- Vezri's inference. §7's "never silently turn an inference into a document
-- fact" is enforced by the column definition, not by convention.
-- =============================================================================

create type public.item_origin      as enum ('explicit', 'inferred');
create type public.milestone_status as enum ('not_started', 'in_progress', 'done', 'blocked');
create type public.task_status      as enum (
  'not_started', 'in_progress', 'done', 'partial', 'not_done',
  'snoozed', 'blocked', 'unconfirmed', 'skipped'
);
create type public.task_type as enum (
  'routine_habit', 'simple_action', 'deep_work', 'submission', 'study_prep',
  'external_dependency', 'approval_review', 'purchase_reservation',
  'meeting', 'multi_step_project'
);
create type public.dependency_type as enum ('task', 'external_person', 'document', 'approval');

-- ---------------------------------------------------------------------------
-- milestones (PRD §21 Milestone)
-- ---------------------------------------------------------------------------
create table public.milestones (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  goal_id          uuid not null references public.goals (id) on delete cascade,
  title            text not null,
  target_date      date,
  status           public.milestone_status not null default 'not_started',
  -- Relative importance for Goal Health. §4.10: completing low-value work must
  -- not make a goal look healthier than it is, so weight drives the score.
  weight           smallint not null default 1 check (weight between 1 and 5),
  source_anchor_id uuid references public.plan_source_anchors (id) on delete set null,
  origin           public.item_origin not null,
  confidence       numeric(3,2) not null check (confidence between 0 and 1),
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now()
);

alter table public.milestones enable row level security;

create policy "milestones: read own"   on public.milestones for select using ((select auth.uid()) = user_id);
create policy "milestones: insert own" on public.milestones for insert with check ((select auth.uid()) = user_id);
create policy "milestones: update own" on public.milestones for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "milestones: delete own" on public.milestones for delete using ((select auth.uid()) = user_id);

create index milestones_goal_idx on public.milestones (goal_id, sort_order);

-- ---------------------------------------------------------------------------
-- tasks (PRD §21 Task, §8 task properties, §9 lead-time)
-- deadline is when it is due; start_by is when work must begin. §9 exists
-- because those are different dates and conflating them is the failure mode.
-- ---------------------------------------------------------------------------
create table public.tasks (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  goal_id           uuid not null references public.goals (id) on delete cascade,
  milestone_id      uuid references public.milestones (id) on delete set null,
  title             text not null,
  rationale         text,
  task_type         public.task_type not null default 'simple_action',
  estimated_minutes integer check (estimated_minutes > 0),
  deadline          timestamptz,
  start_by          timestamptz,
  start_by_reason   text,
  priority          smallint not null default 3 check (priority between 1 and 5),
  status            public.task_status not null default 'not_started',
  recurrence_rule   text,
  source_anchor_id  uuid references public.plan_source_anchors (id) on delete set null,
  origin            public.item_origin not null,
  confidence        numeric(3,2) not null check (confidence between 0 and 1),
  notes             text,
  completed_at      timestamptz,
  created_at        timestamptz not null default now()
);

alter table public.tasks enable row level security;

create policy "tasks: read own"   on public.tasks for select using ((select auth.uid()) = user_id);
create policy "tasks: insert own" on public.tasks for insert with check ((select auth.uid()) = user_id);
create policy "tasks: update own" on public.tasks for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "tasks: delete own" on public.tasks for delete using ((select auth.uid()) = user_id);

create index tasks_goal_idx      on public.tasks (goal_id, status);
create index tasks_start_by_idx  on public.tasks (user_id, start_by) where status in ('not_started', 'in_progress');
create index tasks_deadline_idx  on public.tasks (user_id, deadline) where status in ('not_started', 'in_progress');

-- ---------------------------------------------------------------------------
-- task_dependencies (PRD §21 TaskDependency, §2.4)
-- external_party_name carries the "waiting on a person" case that §13 and §25.B
-- both turn on.
-- ---------------------------------------------------------------------------
create table public.task_dependencies (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  task_id             uuid not null references public.tasks (id) on delete cascade,
  depends_on_task_id  uuid references public.tasks (id) on delete cascade,
  dependency_type     public.dependency_type not null default 'task',
  external_party_name text,
  resolved_at         timestamptz,
  created_at          timestamptz not null default now(),
  constraint task_dependencies_no_self_reference check (task_id <> depends_on_task_id),
  -- A 'task' dependency must name a task; any other kind must not.
  constraint task_dependencies_shape check (
    (dependency_type = 'task'  and depends_on_task_id is not null) or
    (dependency_type <> 'task' and depends_on_task_id is null)
  )
);

alter table public.task_dependencies enable row level security;

create policy "task_dependencies: read own"   on public.task_dependencies for select using ((select auth.uid()) = user_id);
create policy "task_dependencies: insert own" on public.task_dependencies for insert with check ((select auth.uid()) = user_id);
create policy "task_dependencies: update own" on public.task_dependencies for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "task_dependencies: delete own" on public.task_dependencies for delete using ((select auth.uid()) = user_id);

create index task_dependencies_task_idx on public.task_dependencies (task_id);

-- ---------------------------------------------------------------------------
-- ai_action_logs (PRD §21 AIActionLog, §20 "save a short explanation")
-- Every structured AI call lands here with its input, validated output and
-- one-line reason, which is what makes "Why did Vezri suggest this?" (§23)
-- answerable after the fact.
-- ---------------------------------------------------------------------------
create table public.ai_action_logs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  goal_id           uuid references public.goals (id) on delete cascade,
  action_type       text not null,
  structured_input  jsonb,
  structured_output jsonb,
  explanation       text,
  model_version     text,
  created_at        timestamptz not null default now()
);

alter table public.ai_action_logs enable row level security;

create policy "ai_action_logs: read own"   on public.ai_action_logs for select using ((select auth.uid()) = user_id);
create policy "ai_action_logs: insert own" on public.ai_action_logs for insert with check ((select auth.uid()) = user_id);
create policy "ai_action_logs: delete own" on public.ai_action_logs for delete using ((select auth.uid()) = user_id);

create index ai_action_logs_goal_idx on public.ai_action_logs (goal_id, created_at desc);
