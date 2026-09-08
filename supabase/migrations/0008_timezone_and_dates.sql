-- =========================================================================
-- 0008 — dates belong to the user, not to the server.
--
-- Three faults, one cause. Vercel runs in UTC, so every day boundary the app
-- computed was UTC's: at 8 PM Central it was already tomorrow, a reminder
-- "on the start-by date" fired at 6 PM the day before, and quiet hours were
-- stored but compared against nothing.
--
--   * profiles.timezone already existed and defaulted to 'UTC'. Nothing ever
--     wrote it and nothing ever read it. It is now captured at first sign-in
--     and settable, so this records WHO set it — an automatic capture must
--     never overwrite a zone the user chose by hand.
--   * tasks.deadline and tasks.start_by were timestamptz holding values that
--     were always calendar days: written from "2026-10-01" they became
--     midnight UTC, which is 30 September in Texas. A deadline is a day.
--   * §7 requires provenance for what Vezri infers. A date resolved from a
--     relative phrase ("before the first workshop", "post-Oct-30 builds") is
--     an inference, so it records what it was resolved against.
-- =========================================================================

-- -------------------------------------------------------------------------
-- Whose choice the timezone is.
-- -------------------------------------------------------------------------

alter table public.profiles
  add column if not exists timezone_set_by_user boolean not null default false;

comment on column public.profiles.timezone_set_by_user is
  'True once the user picks a zone in Settings. Automatic browser capture only writes timezone while this is false, so a deliberate choice is never silently overwritten.';

-- -------------------------------------------------------------------------
-- Deadlines are days, not instants.
--
-- The cast is explicitly `at time zone 'UTC'` because that is the zone these
-- values were written in — reading them in the session's zone would move a
-- date that never was a moment.
-- -------------------------------------------------------------------------

do $$ begin
  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'tasks' and column_name = 'deadline')
     = 'timestamp with time zone' then
    alter table public.tasks
      alter column deadline type date using (deadline at time zone 'UTC')::date;
  end if;
end $$;

do $$ begin
  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'tasks' and column_name = 'start_by')
     = 'timestamp with time zone' then
    alter table public.tasks
      alter column start_by type date using (start_by at time zone 'UTC')::date;
  end if;
end $$;

comment on column public.tasks.deadline is
  'A calendar day, not an instant. Renders the same in every timezone, which is the point.';
comment on column public.tasks.start_by is
  'A calendar day, not an instant. The reminder built from it is scheduled at a wall-clock time in the user''s zone.';

-- -------------------------------------------------------------------------
-- Where a date came from (PRD §7).
-- -------------------------------------------------------------------------

alter table public.milestones
  add column if not exists date_anchor text;

alter table public.tasks
  add column if not exists date_anchor text;

comment on column public.milestones.date_anchor is
  'What a relative date was resolved against, e.g. "two weeks after the 4 September gate". Null when the date was stated outright or there is no date.';
comment on column public.tasks.date_anchor is
  'What a relative date was resolved against. Null when the date was stated outright or there is no date.';

-- -------------------------------------------------------------------------
-- A reshaped plan is a change to the user's dates, so it is recorded.
-- -------------------------------------------------------------------------

alter table public.goals
  add column if not exists dates_reshaped_at timestamptz;

comment on column public.goals.dates_reshaped_at is
  'When the user confirmed a redistribution of past-dated work. Null until they do - Vezri never rewrites their dates on its own (PRD 6, 14).';
