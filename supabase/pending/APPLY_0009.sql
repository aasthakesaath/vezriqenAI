-- =========================================================================
-- PENDING MIGRATION 0009 — run this whole file in the Supabase SQL editor.
-- Run APPLY_0007.sql and APPLY_0008.sql first if you have not already.
--
-- A goal with no evidence has no health. Goal Health returned 100 "On Track"
-- when no factor had anything to measure — an empty goal scored better than a
-- goal in trouble. The score is now withheld instead, so it has to be nullable
-- and the status needs a value for "not enough to judge yet".
--
-- Idempotent: `add value if not exists`, and dropping a NOT NULL that is
-- already dropped is a no-op.
--
-- The two statements are deliberately NOT wrapped in begin/commit: Postgres
-- refuses to use a new enum value in the transaction that created it, and
-- some versions refuse to add one inside a transaction at all. Run them in
-- order; the editor runs each statement on its own.
--
-- NOTE: nothing breaks before this is applied. The app computes and shows the
-- withheld state either way; it just cannot RECORD one until the column allows
-- it, and logs a warning instead of failing the page.
-- =========================================================================

alter type public.health_status add value if not exists 'insufficient_data';

alter table public.goal_audits
  alter column health_score drop not null;

comment on column public.goal_audits.health_score is
  'Null when too few factors had evidence to compute a score. Never a placeholder - the card shows no number in that case.';

-- =========================================================================
-- VERIFY — expect health_score nullable ("YES"), and the enum to list
-- insufficient_data alongside the five grades.
-- =========================================================================

select
  (select is_nullable from information_schema.columns
     where table_schema = 'public' and table_name = 'goal_audits' and column_name = 'health_score')
    as health_score_nullable,
  (select string_agg(enumlabel, ', ' order by enumsortorder)
     from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'health_status')
    as health_status_values;
