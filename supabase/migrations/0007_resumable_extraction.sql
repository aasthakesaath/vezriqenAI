-- Resumable extraction (2026-09-08).
--
-- A plan is read in 8-10 model calls. Tonight every one of them completed and
-- the final write failed on a column that had never been migrated, so all of
-- it was discarded and "Try again" started from zero. That is real money for
-- no output, and it repeats on any write failure.
--
-- So each pass is written as it succeeds, and the document remembers which
-- ones are done.

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

-- Which passes are done, e.g. {"structure": true, "tasks:0": true, "target": false}.
-- A map rather than a counter: task batches complete out of order (they run
-- concurrently), so "how many" cannot tell you WHICH to resume from.
alter table public.plan_documents
  add column if not exists extraction_passes jsonb not null default '{}'::jsonb;

-- Retries are billable, so they are counted and capped.
alter table public.plan_documents
  add column if not exists extraction_attempts smallint not null default 0;

-- Tokens per pass, so a runaway is visible before it is expensive.
alter table public.plan_documents
  add column if not exists extraction_usage jsonb not null default '{}'::jsonb;

-- What to tell the user, e.g. "read 6 of 9 milestones before the save failed".
alter table public.plan_documents
  add column if not exists extraction_note text;

-- The structure pass's own output, so a resumed run has the model's outcome
-- wording and milestone list without paying for that pass a second time. The
-- milestone ROWS are already saved; this keeps the fields that never became
-- rows (the normalized outcome, the reasoning) available to the task prompts.
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
-- anything else starts from scratch. Without this every existing goal would
-- look partial and become unactivatable.
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
