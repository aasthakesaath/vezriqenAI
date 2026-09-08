-- =========================================================================
-- 0009 — a goal with no evidence has no health.
--
-- Goal Health used to return 1.0 (a score of 100, "On Track") when no factor
-- had anything to measure, and a full mark for each individual factor that had
-- nothing to say. A goal containing nothing scored better than a goal in
-- trouble. §15 asks for a score built on evidence; the honest answer when the
-- evidence is not there is no score, not a flattering one.
--
-- So the score is now nullable and the status has a value for "not enough to
-- judge yet". Both are recorded, because a withheld judgement is a judgement
-- worth being able to look up later.
-- =========================================================================

-- Postgres will not let a new enum value be used in the same transaction that
-- adds it, so this sits outside the migration's own statements.
alter type public.health_status add value if not exists 'insufficient_data';

alter table public.goal_audits
  alter column health_score drop not null;

comment on column public.goal_audits.health_score is
  'Null when too few factors had evidence to compute a score. Never a placeholder - the card shows no number in that case.';
