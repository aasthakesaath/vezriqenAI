-- =========================================================================
-- PENDING MIGRATION 0007 — run this whole file in the Supabase SQL editor.
--
-- 0001-0006 are applied (verified 2026-09-08: /api/health/schema returned
-- ok with 17 tables and 182 columns). 0007 is new and has never been run.
--
-- What it is for: reading a plan is 8-10 model calls, and until now a failure
-- at any point discarded every completed pass. That is exactly what happened
-- when 0005 was missing — every pass succeeded, the final write failed, and
-- "Try again" bought all of it a second time. These columns let a retry
-- resume from the first pass that never landed.
--
-- Everything below is idempotent: the enum creation swallows duplicate_object,
-- every column is `add column if not exists`, and the constraint is dropped
-- before it is added. Running it twice is safe.
--
-- IMPORTANT: the extract route checks the schema BEFORE calling the model, so
-- until this is applied, extraction returns a fast 503 naming these columns
-- rather than spending two minutes and then failing. That is deliberate, but
-- it does mean no plan can be read until this runs.
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- 0007_resumable_extraction.sql
-- -------------------------------------------------------------------------

do $$ begin
  create type public.extraction_state as enum (
    'not_started',
    'in_progress',
    'complete',
    'failed_partial'
  );
exception when duplicate_object then null; end $$;

alter table public.plan_documents
  add column if not exists extraction_state public.extraction_state not null default 'not_started';

-- Which passes are done, e.g. {"structure": true, "tasks:0": true}.
-- A map rather than a counter: a counter cannot tell you WHICH to resume from.
alter table public.plan_documents
  add column if not exists extraction_passes jsonb not null default '{}'::jsonb;

-- Retries are billable, so they are counted and capped (6, in code).
alter table public.plan_documents
  add column if not exists extraction_attempts smallint not null default 0;

-- Tokens per pass, so a runaway is visible before it is expensive.
alter table public.plan_documents
  add column if not exists extraction_usage jsonb not null default '{}'::jsonb;

-- What to tell the user, e.g. "saved 7 milestones and 1 of 3 groups of steps".
alter table public.plan_documents
  add column if not exists extraction_note text;

-- The structure pass's own output, so a resumed run rebuilds its task prompts
-- without paying for that pass again.
alter table public.plan_documents
  add column if not exists extracted_structure jsonb;

alter table public.plan_documents
  drop constraint if exists plan_documents_extraction_attempts_sane;

alter table public.plan_documents
  add constraint plan_documents_extraction_attempts_sane
  check (extraction_attempts between 0 and 100);

comment on column public.plan_documents.extraction_state is
  'not_started | in_progress | complete | failed_partial. A goal whose document is failed_partial is refused by the activate route, so a half-read plan never schedules reminders or reaches Today.';
comment on column public.plan_documents.extraction_passes is
  'Which passes have been written. Try again resumes from the first one missing; completed passes are never re-run.';
comment on column public.plan_documents.extraction_usage is
  'Input/output tokens per pass, for cost visibility.';
comment on column public.plan_documents.extracted_structure is
  'The structure pass output, so a resumed run rebuilds its prompts without re-running that pass.';

-- Existing documents that already produced a confirmed target are complete;
-- anything else starts from scratch. Without this, every goal you have already
-- read would look partial and the activate route would refuse it.
update public.plan_documents d
set extraction_state = 'complete',
    extraction_passes = '{"structure": true, "tasks": true, "target": true}'::jsonb
where d.extraction_state = 'not_started'
  and exists (
    select 1 from public.goals g
    where g.id = d.goal_id and g.normalized_goal is not null
  );

create index if not exists plan_documents_extraction_state_idx
  on public.plan_documents (goal_id, extraction_state);

commit;

-- =========================================================================
-- VERIFY — should return exactly six rows, one per new column.
--
-- After this, https://www.vezriqen.com/api/health/schema should report
-- {"ok":true} with 188 columns and no gaps.
-- =========================================================================

select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'plan_documents'
  and column_name in (
    'extraction_state',
    'extraction_passes',
    'extraction_attempts',
    'extraction_usage',
    'extraction_note',
    'extracted_structure'
  )
order by column_name;
