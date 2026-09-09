-- =========================================================================
-- 0010 — the extraction ledger belongs to the goal, not to the document.
--
-- 0007 put extraction_state/passes/attempts/usage/note on plan_documents, and
-- every write to it was guarded by `if (!progress.documentId) return;`. A
-- goal-only goal has no plan_documents row, so for that whole class of goal
-- the ledger silently wrote nothing:
--
--   * resumption was inert — isPassDone always false, so every retry re-ran
--     and re-paid for the entire extraction;
--   * no terminal state was ever set;
--   * the attempt cap never engaged, so retries were unlimited and billable;
--   * the completion log reported "0 passes, 0 in / 0 out tokens, attempt 0"
--     for a run that had just spent 130 seconds on the model.
--
-- That was measured on goal e2893b2b: two full extractions at 02:41:45 and
-- 02:44:47 on 2026-09-09, both complete, both invisible to the ledger.
--
-- An extraction run is per GOAL — a goal may hold several documents, and a
-- goal with none is still extracted. So the ledger moves to where it belongs.
--
-- extraction_started_at is new. A function killed at Vercel's 300s ceiling
-- cannot write its own epitaph, so "this run is dead" has to be inferred by
-- the reader: an in_progress older than the ceiling was killed.
--
-- The plan_documents columns are deliberately LEFT IN PLACE. Dropping them in
-- the same step would break the running deployment between this SQL and the
-- code that reads the new home. A later migration removes them once the new
-- code is live.
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
