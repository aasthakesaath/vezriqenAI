-- =============================================================================
-- Vezriqen AI — Milestone 5: reminders, checkpoints, coaching, health
--
-- Two rules from the PRD are enforced here in the schema rather than in code:
--
--   * §12 "Never assume completion." A reminder that was never delivered can
--     never read as delivered: sent_at is only meaningful alongside
--     delivery_status = 'sent', and the check constraint below makes the
--     inconsistent combination unrepresentable.
--   * §12 unanswered checkpoints resolve to 'unconfirmed', which is a real
--     state in task_status — not a null masquerading as "probably fine".
-- =============================================================================

create type public.reminder_type    as enum ('heads_up', 'action_checkpoint');
create type public.reminder_channel as enum ('in_app', 'email');
create type public.delivery_status  as enum ('pending', 'sent', 'failed', 'suppressed');
create type public.checkin_state    as enum (
  'done', 'partial', 'not_done', 'snoozed', 'stuck', 'waiting_on_someone'
);
create type public.block_category as enum (
  'no_time', 'didnt_know_how_to_start', 'felt_too_big', 'kept_avoiding',
  'waiting_on_someone', 'forgot', 'priorities_changed', 'something_else'
);
create type public.intervention_type as enum (
  'shrink_first_step', 'clarify_first_action', 'split_task', 'timebox',
  'reschedule_window', 'resolve_prerequisite', 'follow_up_other_person',
  'reduce_scope', 'move_lower_priority', 'alternative_action', 'ask_user'
);

-- ---------------------------------------------------------------------------
-- reminders (PRD §21 Reminder, §12)
-- ---------------------------------------------------------------------------
create table public.reminders (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  task_id           uuid not null references public.tasks (id) on delete cascade,
  type              public.reminder_type not null,
  channel           public.reminder_channel not null,
  scheduled_at      timestamptz not null,
  response_required boolean not null default false,
  delivery_status   public.delivery_status not null default 'pending',
  sent_at           timestamptz,
  failure_reason    text,
  responded_at      timestamptz,
  response          public.checkin_state,
  follow_up_count   smallint not null default 0,
  created_at        timestamptz not null default now(),

  -- §12 / Milestone 6 email rule: a reminder is only "sent" when it actually
  -- went out. No key, no delivery, no sent_at — and never a silent success.
  constraint reminders_sent_at_matches_status check (
    (delivery_status = 'sent' and sent_at is not null) or
    (delivery_status <> 'sent' and sent_at is null)
  )
);

alter table public.reminders enable row level security;

create policy "reminders: read own"   on public.reminders for select using ((select auth.uid()) = user_id);
create policy "reminders: insert own" on public.reminders for insert with check ((select auth.uid()) = user_id);
create policy "reminders: update own" on public.reminders for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "reminders: delete own" on public.reminders for delete using ((select auth.uid()) = user_id);

create index reminders_due_idx  on public.reminders (scheduled_at) where delivery_status = 'pending';
create index reminders_user_idx on public.reminders (user_id, scheduled_at desc);
create index reminders_open_checkpoint_idx
  on public.reminders (user_id, scheduled_at)
  where response_required and response is null;

-- ---------------------------------------------------------------------------
-- check_ins (PRD §21 CheckIn, §12 action set)
-- The immutable record of what the user said actually happened.
-- ---------------------------------------------------------------------------
create table public.check_ins (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  task_id     uuid not null references public.tasks (id) on delete cascade,
  reminder_id uuid references public.reminders (id) on delete set null,
  state       public.checkin_state not null,
  note        text,
  snooze_until timestamptz,
  created_at  timestamptz not null default now()
);

alter table public.check_ins enable row level security;

create policy "check_ins: read own"   on public.check_ins for select using ((select auth.uid()) = user_id);
create policy "check_ins: insert own" on public.check_ins for insert with check ((select auth.uid()) = user_id);
create policy "check_ins: delete own" on public.check_ins for delete using ((select auth.uid()) = user_id);

create index check_ins_task_idx on public.check_ins (task_id, created_at desc);
create index check_ins_user_idx on public.check_ins (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- execution_blocks (PRD §21 ExecutionBlock, §13 the core differentiator)
-- One row per "what got in the way?" answer plus the single intervention Vezri
-- offered and whether the user took it. `accepted` is what feeds §24's
-- intervention-success metric and §10's effective_interventions.
-- ---------------------------------------------------------------------------
create table public.execution_blocks (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  task_id           uuid not null references public.tasks (id) on delete cascade,
  check_in_id       uuid references public.check_ins (id) on delete set null,
  category          public.block_category not null,
  user_text         text,
  intervention_type public.intervention_type,
  recommendation    jsonb,
  explanation       text,
  accepted          boolean,
  resolved_at       timestamptz,
  created_at        timestamptz not null default now()
);

alter table public.execution_blocks enable row level security;

create policy "execution_blocks: read own"   on public.execution_blocks for select using ((select auth.uid()) = user_id);
create policy "execution_blocks: insert own" on public.execution_blocks for insert with check ((select auth.uid()) = user_id);
create policy "execution_blocks: update own" on public.execution_blocks for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "execution_blocks: delete own" on public.execution_blocks for delete using ((select auth.uid()) = user_id);

create index execution_blocks_task_idx on public.execution_blocks (task_id, created_at desc);
create index execution_blocks_open_idx on public.execution_blocks (user_id) where resolved_at is null;

-- ---------------------------------------------------------------------------
-- goal_audits (PRD §21 GoalAudit, §15 Goal Health, §16 What am I missing)
-- health_inputs stores the deterministic factors the score was computed from,
-- so §15's "AI may explain the score but should not invent it" is auditable:
-- the numbers are in the row, the prose is derived from them.
-- ---------------------------------------------------------------------------
create table public.goal_audits (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  goal_id       uuid not null references public.goals (id) on delete cascade,
  health_inputs jsonb not null,
  health_score  smallint not null check (health_score between 0 and 100),
  health_status public.health_status not null,
  missing_items jsonb not null default '[]'::jsonb,
  explanation   text,
  created_at    timestamptz not null default now()
);

alter table public.goal_audits enable row level security;

create policy "goal_audits: read own"   on public.goal_audits for select using ((select auth.uid()) = user_id);
create policy "goal_audits: insert own" on public.goal_audits for insert with check ((select auth.uid()) = user_id);
create policy "goal_audits: delete own" on public.goal_audits for delete using ((select auth.uid()) = user_id);

create index goal_audits_goal_idx on public.goal_audits (goal_id, created_at desc);
