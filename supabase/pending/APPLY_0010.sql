-- =========================================================================
-- PENDING MIGRATION 0010 — run this whole file in the Supabase SQL editor.
-- 0007, 0008 and 0009 are applied. This one is new.
--
-- The extraction ledger was on plan_documents, and every write to it was
-- guarded by `if (!progress.documentId) return;`. A goal-only goal has no
-- plan_documents row, so for that whole class of goal the ledger recorded
-- nothing: resumption was inert (every retry re-ran and re-paid for the whole
-- extraction), no terminal state was ever set, and the retry cap never
-- engaged. Measured on goal e2893b2b — two complete 130-second extractions on
-- 2026-09-09, both invisible to the ledger, the second one caused by a screen
-- that claimed to be "nearly there".
--
-- An extraction run is per GOAL, so the ledger moves to goals.
--
-- extraction_started_at is new: a function killed at Vercel's 300s ceiling
-- cannot write its own epitaph, so a stale in_progress is read as dead.
--
-- Idempotent: every column is `add column if not exists`, the constraint is
-- dropped before it is added, and both backfills only touch rows still at
-- 'not_started'. Safe to run twice.
--
-- The plan_documents columns are LEFT IN PLACE on purpose — dropping them now
-- would break the running deployment in the window between this SQL and the
-- code that reads the new home. A later migration removes them.
--
-- NOTE: nothing breaks before this is applied. The deployed code keeps using
-- the old columns until the matching push goes out.
-- =========================================================================

begin;

alter table public.goals
  add column if not exists extraction_state public.extraction_state not null default 'not_started',
  add column if not exists extraction_passes jsonb not null default '{}'::jsonb,
  add column if not exists extraction_attempts smallint not null default 0,
  add column if not exists extraction_usage jsonb not null default '{}'::jsonb,
  add column if not exists extraction_note text,
  add column if not exists extracted_structure jsonb,
  add column if not exists extraction_started_at timestamptz;

comment on column public.goals.extraction_state is
  'not_started | in_progress | complete | failed_partial. An in_progress older than the function ceiling was killed - see extraction_started_at.';
comment on column public.goals.extraction_passes is
  'Which passes have been written. Try again resumes from the first one missing; completed passes are never re-run.';
comment on column public.goals.extraction_attempts is
  'Billable retries, capped in code. Was never incremented for goal-only goals while this lived on plan_documents.';
comment on column public.goals.extraction_usage is
  'Input/output tokens per pass, for cost visibility.';
comment on column public.goals.extracted_structure is
  'The structure pass output, so a resumed run rebuilds its prompts without re-running that pass.';
comment on column public.goals.extraction_started_at is
  'When the current run began. A killed function cannot record its own death, so a stale in_progress is read as dead rather than as still working.';

alter table public.goals
  drop constraint if exists goals_extraction_attempts_sane;
alter table public.goals
  add constraint goals_extraction_attempts_sane
  check (extraction_attempts between 0 and 100);

-- ---- Carry across whatever the document rows already recorded. ----------
update public.goals g
set extraction_state    = d.extraction_state,
    extraction_passes   = d.extraction_passes,
    extraction_attempts = d.extraction_attempts,
    extraction_usage    = d.extraction_usage,
    extraction_note     = d.extraction_note,
    extracted_structure = d.extracted_structure
from (
  select distinct on (goal_id) goal_id, extraction_state, extraction_passes,
         extraction_attempts, extraction_usage, extraction_note, extracted_structure
  from public.plan_documents
  where goal_id is not null
  order by goal_id, created_at
) d
where d.goal_id = g.id
  and g.extraction_state = 'not_started';

-- Goals that finished but never had a document to record it on — the
-- goal-only case this migration exists for. A confirmed target is proof the
-- run completed, whatever the ledger failed to say at the time.
update public.goals
set extraction_state = 'complete',
    extraction_passes = '{"structure": true, "tasks": true, "target": true}'::jsonb
where extraction_state = 'not_started'
  and normalized_goal is not null;

create index if not exists goals_extraction_state_idx
  on public.goals (extraction_state);

commit;


-- =========================================================================
-- VERIFY — expect seven rows, then one row per goal showing the ledger.
-- =========================================================================

select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'goals'
  and column_name in (
    'extraction_state',
    'extraction_passes',
    'extraction_attempts',
    'extraction_usage',
    'extraction_note',
    'extracted_structure',
    'extraction_started_at'
  )
order by column_name;

select id, status, extraction_state, extraction_attempts,
       extraction_passes, extraction_started_at
from public.goals
order by created_at;
