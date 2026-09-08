-- =========================================================================
-- PENDING MIGRATION 0008 — run this whole file in the Supabase SQL editor.
-- Run APPLY_0007.sql first if you have not already.
--
-- Dates belonged to the server, not to the user. Vercel runs in UTC, so every
-- day boundary was UTC's: at 8 PM in Texas the app thought it was tomorrow,
-- and a reminder "on the start-by date" landed at 6 PM the evening before.
--
-- Idempotent: every column is `add column if not exists`, and the two type
-- changes check the current type first. Safe to run twice.
--
-- NOTE: the extract route checks the schema before calling the model, so
-- extraction returns a fast 503 naming these columns until this is applied.
-- =========================================================================

begin;

-- Whose choice the timezone is. Automatic browser capture only writes
-- profiles.timezone while this is false, so a zone picked in Settings is never
-- silently overwritten by a laptop set to head-office time.
alter table public.profiles
  add column if not exists timezone_set_by_user boolean not null default false;

comment on column public.profiles.timezone_set_by_user is
  'True once the user picks a zone in Settings. Automatic capture only writes timezone while this is false.';

-- Deadlines are days, not instants. Written from "2026-10-01" they became
-- midnight UTC, which is 30 September in Texas. The cast is explicitly
-- `at time zone ''UTC''` because that is the zone they were written in.
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
  'A calendar day. The reminder built from it is scheduled at a wall-clock time in the user''s zone.';

-- Where a date came from (PRD §7). A date resolved from a relative phrase
-- ("before the first workshop") is an inference and has to say so.
alter table public.milestones
  add column if not exists date_anchor text;
alter table public.tasks
  add column if not exists date_anchor text;

comment on column public.milestones.date_anchor is
  'What a relative date was resolved against, e.g. "two weeks after the 4 September gate". Null when the date was stated outright.';
comment on column public.tasks.date_anchor is
  'What a relative date was resolved against. Null when the date was stated outright.';

-- A reshaped plan changes the user's own dates, so it is recorded.
alter table public.goals
  add column if not exists dates_reshaped_at timestamptz;

comment on column public.goals.dates_reshaped_at is
  'When the user confirmed a redistribution of past-dated work. Null until they do - Vezri never rewrites their dates on its own (PRD 6, 14).';

commit;

-- =========================================================================
-- VERIFY — expect five rows, and both task date columns reading `date`.
--
-- After this, https://www.vezriqen.com/api/health/schema should report
-- {"ok":true} with 192 columns and no gaps.
-- =========================================================================

select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and (   (table_name = 'profiles'   and column_name = 'timezone_set_by_user')
       or (table_name = 'milestones' and column_name = 'date_anchor')
       or (table_name = 'tasks'      and column_name in ('date_anchor', 'deadline', 'start_by'))
       or (table_name = 'goals'      and column_name = 'dates_reshaped_at'))
order by table_name, column_name;
