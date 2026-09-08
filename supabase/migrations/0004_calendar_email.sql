-- =============================================================================
-- Vezriqen AI — Milestone 6: Google Calendar and email reminders
--
-- The important design decision here is that OAuth tokens live in their own
-- table with RLS enabled and DELIBERATELY NO POLICIES.
--
-- RLS cannot restrict individual columns, so leaving tokens on a user-readable
-- row would mean any valid session could select them. A table with RLS on and
-- zero policies denies every request from anon and authenticated outright;
-- only service_role — which bypasses RLS and never reaches the browser — can
-- read it. That is how PRD §23's "never expose provider refresh tokens to the
-- browser" becomes a property of the database instead of a code review note.
--
-- A security scanner flagging "RLS enabled with no policy" on
-- calendar_credentials and email_action_tokens is reporting the intended
-- design, not a defect.
-- =============================================================================

create type public.calendar_provider   as enum ('google');
create type public.connection_status   as enum ('connected', 'revoked', 'error');
create type public.email_action        as enum ('done', 'snooze', 'stuck');

-- ---------------------------------------------------------------------------
-- calendar_connections — user-visible connection metadata (PRD §21).
-- Safe to read from a session: it holds no secret material.
-- ---------------------------------------------------------------------------
create table public.calendar_connections (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  provider      public.calendar_provider not null default 'google',
  scopes        text[] not null default '{}',
  google_email  text,
  status        public.connection_status not null default 'connected',
  last_synced_at timestamptz,
  connected_at  timestamptz not null default now()
);

alter table public.calendar_connections enable row level security;

create policy "calendar_connections: read own"   on public.calendar_connections for select using ((select auth.uid()) = user_id);
create policy "calendar_connections: insert own" on public.calendar_connections for insert with check ((select auth.uid()) = user_id);
create policy "calendar_connections: update own" on public.calendar_connections for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- §23: the user can always disconnect.
create policy "calendar_connections: delete own" on public.calendar_connections for delete using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- calendar_credentials — encrypted tokens. Server-only by construction.
-- Ciphertext is produced by the application with AES-256-GCM before it ever
-- reaches Postgres, so the column holds no readable secret even to an operator
-- with database access but without CALENDAR_TOKEN_ENCRYPTION_KEY.
-- ---------------------------------------------------------------------------
create table public.calendar_credentials (
  user_id                uuid primary key references auth.users (id) on delete cascade,
  access_token_cipher    text not null,
  refresh_token_cipher   text,
  -- AES-GCM nonce and auth tag, base64. Stored beside the ciphertext, useless
  -- without the key, which lives only in the server environment.
  token_iv               text not null,
  token_auth_tag         text not null,
  key_version            smallint not null default 1,
  expires_at             timestamptz,
  updated_at             timestamptz not null default now()
);

-- RLS on, no policies: denies anon and authenticated entirely. Intentional.
alter table public.calendar_credentials enable row level security;

-- ---------------------------------------------------------------------------
-- calendar_blocks (PRD §21 CalendarBlock, §11 write behaviour)
-- vezri_created is the guard for §11's "never edit or delete a non-Vezri
-- event": the update path filters on it, and the partial unique index keeps one
-- Vezri block per provider event.
-- ---------------------------------------------------------------------------
create table public.calendar_blocks (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  task_id           uuid not null references public.tasks (id) on delete cascade,
  provider_event_id text,
  start_at          timestamptz not null,
  end_at            timestamptz not null,
  vezri_created     boolean not null default true,
  confirmed_by_user boolean not null default false,
  created_at        timestamptz not null default now(),
  constraint calendar_blocks_end_after_start check (end_at > start_at)
);

alter table public.calendar_blocks enable row level security;

create policy "calendar_blocks: read own"   on public.calendar_blocks for select using ((select auth.uid()) = user_id);
create policy "calendar_blocks: insert own" on public.calendar_blocks for insert with check ((select auth.uid()) = user_id);
create policy "calendar_blocks: update own" on public.calendar_blocks for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "calendar_blocks: delete own" on public.calendar_blocks for delete using ((select auth.uid()) = user_id);

create index calendar_blocks_task_idx on public.calendar_blocks (task_id);
create unique index calendar_blocks_provider_event_uniq
  on public.calendar_blocks (user_id, provider_event_id)
  where provider_event_id is not null;

-- ---------------------------------------------------------------------------
-- email_action_tokens (PRD §12 deep links, §23 "short-lived signed tokens")
-- One row per issued link. The row is the replay guard: the token itself is
-- HMAC-signed and carries its own expiry, and consuming it stamps used_at so
-- a forwarded or leaked email cannot act twice.
--
-- RLS on, no policies — same rationale as calendar_credentials. These are
-- redeemed by an unauthenticated GET from an email client, so they are read
-- server-side with service_role and must never be listable from a session.
-- ---------------------------------------------------------------------------
create table public.email_action_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  task_id     uuid not null references public.tasks (id) on delete cascade,
  reminder_id uuid references public.reminders (id) on delete cascade,
  action      public.email_action not null,
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

alter table public.email_action_tokens enable row level security;

create index email_action_tokens_expiry_idx on public.email_action_tokens (expires_at) where used_at is null;
