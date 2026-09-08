-- =========================================================================
-- PENDING MIGRATIONS — run this whole file in the Supabase SQL editor.
--
-- 0001-0004 were applied on 2026-09-08 (17 tables, RLS verified).
-- 0005 and 0006 were written after that and have never been applied, which
-- is why extraction completed and then failed at the final write with
--
--     Could not find the 'short_label' column of 'goals' in the schema cache
--
-- Everything below is idempotent — `add column if not exists`, and each
-- constraint is dropped before it is added — so running it twice is safe and
-- running it on a database that already has part of it is safe.
--
-- Audited against the code: these two are the ONLY drift. Every other column
-- the application reads or writes exists in 0001-0004. (The audit is now
-- checked in as src/lib/db/schema-manifest.ts, generated from the migrations,
-- and /api/health/schema compares it against the live database.)
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- 0005_goal_short_label.sql
--
-- The SMART statement is ~60 words. Right to store, wrong to render on a task
-- card, where it buried the actual task under four lines of goal. This is a
-- second, purely cosmetic field: six words, plain language. Nothing derives
-- from it and nothing is decided by it — normalized_goal stays the record of
-- what the goal is, and the plan-approval screen still shows that statement in
-- full and never this one.
--
-- Nullable on purpose: goals extracted before this have no label, and every
-- surface falls back to the first few words of the statement rather than
-- showing a blank.
-- -------------------------------------------------------------------------

alter table public.goals
  add column if not exists short_label text;

alter table public.goals
  drop constraint if exists goals_short_label_length;

alter table public.goals
  add constraint goals_short_label_length
  check (short_label is null or char_length(short_label) between 1 and 80);

comment on column public.goals.short_label is
  'Cosmetic 6-word label for cards, nav and headings. Never replaces normalized_goal on the approval screen (PRD 5.6, 7).';

-- -------------------------------------------------------------------------
-- 0006_reminder_channels.sql
--
-- Two channels in Phase 1. Section 3 puts SMS and WhatsApp under "Explicitly
-- not Phase 1", so there is no column for them.
--
--   in-app  ALWAYS ON. Not represented here at all, because it is not a
--           preference: the reminder ROW is the in-app reminder. No setting
--           can remove it, which is what guarantees a reminder always has
--           somewhere to appear.
--   email   on by default, and the user may turn it off.
--
-- `default true` on ADD COLUMN backfills every existing row, which is the
-- point: nobody who never chose to disable email is silently opted out.
-- -------------------------------------------------------------------------

alter table public.profiles
  add column if not exists email_reminders boolean not null default true;

comment on column public.profiles.email_reminders is
  'Email reminder channel. In-app is always on and has no column - the reminder row is the in-app reminder. Read at DISPATCH time, so toggling this affects reminders already scheduled.';

commit;

-- =========================================================================
-- VERIFY — both should return one row each.
-- =========================================================================

select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and (   (table_name = 'goals'    and column_name = 'short_label')
       or (table_name = 'profiles' and column_name = 'email_reminders'))
order by table_name;
