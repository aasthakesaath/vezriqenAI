-- Short goal label (UI spec, 2026-09-08).
--
-- The SMART statement is ~60 words. It is the right thing to STORE — §6
-- requires both the user's wording and the normalized target, and §7 forbids an
-- inference standing in for a document fact — but it is the wrong thing to
-- render on a task card, where it buried the actual task under four lines of
-- goal.
--
-- So: a second, purely cosmetic field. Six words, plain language. Nothing
-- derives from it and nothing is decided by it; normalized_goal remains the
-- record of what the goal is, and the plan-approval screen (§5 Step 6) still
-- shows that statement in full and never this.
--
-- Nullable on purpose: goals extracted before this migration have no label, and
-- every surface falls back to normalized_goal rather than showing a blank.

alter table public.goals
  add column if not exists short_label text;

-- Six words is the product rule; the length cap is the guard rail that keeps a
-- runaway model response out of a nav item. Both are enforced in the schema
-- too — this is the backstop, not the only check.
alter table public.goals
  drop constraint if exists goals_short_label_length;

alter table public.goals
  add constraint goals_short_label_length
  check (short_label is null or char_length(short_label) between 1 and 80);

comment on column public.goals.short_label is
  'Cosmetic 6-word label for cards, nav and headings. Never replaces normalized_goal on the approval screen (PRD 5.6, 7).';
