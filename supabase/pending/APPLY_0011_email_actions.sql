-- =========================================================================
-- PENDING MIGRATION 0011 — run this whole file in the Supabase SQL editor.
--
-- 0001-0009 are applied. APPLY_0010 (the data-only retirement of the
-- `partial` and `snoozed` task statuses) was applied on 2026-09-09.
--
-- What this is for: the reminder email offered Done, "Snooze a day" and I'm
-- stuck. Snooze wrote `snoozed` onto the task, which is outside every open
-- set, so tapping it in an inbox made the task vanish from the whole product
-- and nothing brought it back. The email now offers the same three responses
-- a task row does: Done, Not done, I'm stuck — so `not_done` has to exist as
-- an email_action.
--
-- SAFE TO RUN BEFORE OR AFTER THE DEPLOY. Adding the value early does
-- nothing on its own; the code only starts writing it once deployed. Running
-- it twice is a no-op.
-- =========================================================================

-- ---------------------------------------------------------------------------
-- STEP 1 — what is outstanding, for information. No action needed either way.
--
-- Any unexpired, unredeemed `snooze` link still sitting in an inbox. These
-- are NOT modified: the app refuses them with a plain message ("that button
-- has been retired"), writes nothing, and leaves the row alone. They expire
-- on their own — tokens are issued with a 48-hour life — so this count
-- reaches zero within two days of the last email that carried one.
--
-- Stamping them used_at would be worse, not better: the next tap would then
-- say "you've already answered this one", which is not what happened.
-- ---------------------------------------------------------------------------
select
  count(*) filter (where used_at is null and expires_at > now()) as still_tappable,
  count(*) filter (where used_at is null and expires_at <= now()) as already_expired,
  count(*) filter (where used_at is not null) as already_used,
  max(expires_at) as last_one_dies
from public.email_action_tokens
where action = 'snooze';

-- ---------------------------------------------------------------------------
-- STEP 2 — the migration itself. One statement, deliberately not in a
-- transaction: ALTER TYPE ... ADD VALUE cannot be used in the same
-- transaction that adds it, and older Postgres refuses it inside one at all.
-- ---------------------------------------------------------------------------
alter type public.email_action add value if not exists 'not_done';

-- ---------------------------------------------------------------------------
-- STEP 3 — verify. Expect: done, not_done, snooze, stuck.
-- ---------------------------------------------------------------------------
select enumlabel
from pg_enum
where enumtypid = 'public.email_action'::regtype
order by enumsortorder;

-- ---------------------------------------------------------------------------
-- NOT DONE HERE, and why:
--
--   `snooze` is not removed from the enum. Dropping an enum value means
--   recreating the type and rewriting every row that uses it, and the rows
--   that use it are the record of links that were genuinely sent. They are
--   refused at redemption, which is where the decision belongs.
-- ---------------------------------------------------------------------------
