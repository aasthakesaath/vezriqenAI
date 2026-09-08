-- =============================================================================
-- Vezriqen AI — Milestone 2 foundation
-- Identity, execution profile, goals, and plan-document ingestion.
--
-- Security posture (PRD §23):
--   * RLS is enabled on every table in this file.
--   * Every policy is scoped to the owning user via (select auth.uid()).
--     The scalar sub-select form is deliberate: it lets Postgres evaluate the
--     uid once per statement instead of once per row.
--   * The client never filters by user id. It cannot see another user's rows
--     even if it tries, because the policy — not the query — does the scoping.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enum types
-- ---------------------------------------------------------------------------
create type public.reminder_style   as enum ('early_heads_up', 'close_to_task', 'both');
create type public.accountability   as enum ('gentle', 'balanced', 'keep_me_accountable');
create type public.productive_window as enum ('morning', 'afternoon', 'evening', 'varies');
create type public.goal_status       as enum ('draft', 'awaiting_confirmation', 'active', 'achieved', 'archived');
create type public.health_status     as enum ('on_track', 'needs_attention', 'at_risk', 'off_track', 'achieved');
create type public.parse_status      as enum ('pending', 'parsing', 'parsed', 'failed');

-- ---------------------------------------------------------------------------
-- profiles — one row per authenticated user (PRD §21 User)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  email                text,
  name                 text,
  timezone             text not null default 'UTC',
  primary_goal_id      uuid,
  reminder_style       public.reminder_style   not null default 'both',
  accountability_level public.accountability   not null default 'balanced',
  productive_window    public.productive_window not null default 'varies',
  quiet_hours_start    smallint check (quiet_hours_start between 0 and 23),
  quiet_hours_end      smallint check (quiet_hours_end   between 0 and 23),
  onboarded_at         timestamptz,
  created_at           timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: read own"   on public.profiles for select using ((select auth.uid()) = id);
create policy "profiles: insert own" on public.profiles for insert with check ((select auth.uid()) = id);
create policy "profiles: update own" on public.profiles for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "profiles: delete own" on public.profiles for delete using ((select auth.uid()) = id);

-- ---------------------------------------------------------------------------
-- execution_profiles — learned behaviour (PRD §10, §21 ExecutionProfile)
-- Written by the server as the user executes; never configured by a form.
-- ---------------------------------------------------------------------------
create table public.execution_profiles (
  user_id                uuid primary key references auth.users (id) on delete cascade,
  preferred_block_minutes smallint not null default 45,
  completion_by_time     jsonb not null default '{}'::jsonb,
  snooze_patterns        jsonb not null default '{}'::jsonb,
  estimate_accuracy      jsonb not null default '{}'::jsonb,
  common_blocks          jsonb not null default '{}'::jsonb,
  effective_interventions jsonb not null default '{}'::jsonb,
  profile_confidence     numeric(3,2) not null default 0 check (profile_confidence between 0 and 1),
  updated_at             timestamptz not null default now()
);

alter table public.execution_profiles enable row level security;

create policy "execution_profiles: read own"   on public.execution_profiles for select using ((select auth.uid()) = user_id);
create policy "execution_profiles: insert own" on public.execution_profiles for insert with check ((select auth.uid()) = user_id);
create policy "execution_profiles: update own" on public.execution_profiles for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "execution_profiles: delete own" on public.execution_profiles for delete using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- goals (PRD §21 Goal)
-- user_goal_text preserves the user's own wording; normalized_goal holds the
-- SMART rewrite. §6 requires both to survive.
-- ---------------------------------------------------------------------------
create table public.goals (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  user_goal_text   text,
  normalized_goal  text,
  target_date      date,
  success_criteria jsonb not null default '[]'::jsonb,
  constraints      jsonb not null default '[]'::jsonb,
  status           public.goal_status not null default 'draft',
  health_score     smallint check (health_score between 0 and 100),
  health_status    public.health_status,
  primary_flag     boolean not null default false,
  activated_at     timestamptz,
  created_at       timestamptz not null default now()
);

alter table public.goals enable row level security;

create policy "goals: read own"   on public.goals for select using ((select auth.uid()) = user_id);
create policy "goals: insert own" on public.goals for insert with check ((select auth.uid()) = user_id);
create policy "goals: update own" on public.goals for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "goals: delete own" on public.goals for delete using ((select auth.uid()) = user_id);

create index goals_user_status_idx on public.goals (user_id, status);

-- At most one primary goal per user (PRD §27: "Yes; one Primary goal").
create unique index goals_one_primary_per_user
  on public.goals (user_id) where primary_flag;

alter table public.profiles
  add constraint profiles_primary_goal_fk
  foreign key (primary_goal_id) references public.goals (id) on delete set null;

-- ---------------------------------------------------------------------------
-- plan_documents (PRD §21 PlanDocument)
-- storage_path points into the private `plan-documents` bucket. Deleting the
-- row cascades to anchors, which is what makes §23's "delete an uploaded
-- document and its derived content" a single operation.
-- ---------------------------------------------------------------------------
create table public.plan_documents (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  goal_id        uuid references public.goals (id) on delete cascade,
  filename       text not null,
  mime_type      text not null,
  byte_size      integer not null check (byte_size > 0),
  page_count     integer check (page_count > 0),
  storage_path   text unique,
  source_kind    text not null default 'upload' check (source_kind in ('upload', 'paste')),
  extracted_text text,
  parse_status   public.parse_status not null default 'pending',
  parse_error    text,
  is_primary     boolean not null default true,
  created_at     timestamptz not null default now()
);

alter table public.plan_documents enable row level security;

create policy "plan_documents: read own"   on public.plan_documents for select using ((select auth.uid()) = user_id);
create policy "plan_documents: insert own" on public.plan_documents for insert with check ((select auth.uid()) = user_id);
create policy "plan_documents: update own" on public.plan_documents for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "plan_documents: delete own" on public.plan_documents for delete using ((select auth.uid()) = user_id);

create index plan_documents_goal_idx on public.plan_documents (goal_id);

-- ---------------------------------------------------------------------------
-- plan_source_anchors (PRD §21 PlanSourceAnchor, §7 provenance)
-- Milestones and tasks point here so every extracted item can be traced back
-- to the sentence it came from.
-- ---------------------------------------------------------------------------
create table public.plan_source_anchors (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  document_id       uuid not null references public.plan_documents (id) on delete cascade,
  page_or_section   text,
  excerpt           text not null,
  location_metadata jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

alter table public.plan_source_anchors enable row level security;

create policy "plan_source_anchors: read own"   on public.plan_source_anchors for select using ((select auth.uid()) = user_id);
create policy "plan_source_anchors: insert own" on public.plan_source_anchors for insert with check ((select auth.uid()) = user_id);
create policy "plan_source_anchors: update own" on public.plan_source_anchors for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "plan_source_anchors: delete own" on public.plan_source_anchors for delete using ((select auth.uid()) = user_id);

create index plan_source_anchors_document_idx on public.plan_source_anchors (document_id);

-- ---------------------------------------------------------------------------
-- New-user bootstrap.
--
-- SECURITY DEFINER is required and deliberate (PRD §23): the trigger fires as
-- the auth system inserts into auth.users, at which point there is no
-- authenticated role to satisfy the RLS policies above. It is a trigger on
-- auth.users only — it is NOT exposed to anon or authenticated as an RPC, and
-- EXECUTE is revoked from both roles below. search_path is pinned to defeat
-- search-path injection.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do nothing;

  insert into public.execution_profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from anon, authenticated, public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Private storage for uploaded plans (PRD §23).
-- Objects live at <user_id>/<goal_id>/<uuid>.<ext>; the policies below compare
-- the first path segment to the caller's uid, so one user can never read
-- another's document even with a guessed path.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'plan-documents',
  'plan-documents',
  false,
  26214400, -- 25 MB, PRD §7
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
    'image/jpeg',
    'image/png'
  ]
)
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public             = false;

create policy "plan-documents: read own"
  on storage.objects for select
  using (bucket_id = 'plan-documents' and (select auth.uid())::text = (storage.foldername(name))[1]);

create policy "plan-documents: insert own"
  on storage.objects for insert
  with check (bucket_id = 'plan-documents' and (select auth.uid())::text = (storage.foldername(name))[1]);

create policy "plan-documents: update own"
  on storage.objects for update
  using (bucket_id = 'plan-documents' and (select auth.uid())::text = (storage.foldername(name))[1]);

create policy "plan-documents: delete own"
  on storage.objects for delete
  using (bucket_id = 'plan-documents' and (select auth.uid())::text = (storage.foldername(name))[1]);
