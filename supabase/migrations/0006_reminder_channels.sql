-- Reminder channel preference (UI spec, 2026-09-08).
--
-- Two channels in Phase 1. §3 puts SMS and WhatsApp under "Explicitly not
-- Phase 1", so there is no column for them and no enum value to grow into.
--
--   in-app  ALWAYS ON. Not represented here at all, because it is not a
--           preference: the reminder ROW is the in-app reminder. It exists the
--           moment the goal is activated, and no setting can remove it. That
--           is what guarantees a reminder always has somewhere to appear.
--   email   on by default, and the user may turn it off.
--
-- `default true` on ADD COLUMN backfills every existing row, which is the
-- point: nobody who never chose to disable email gets silently opted out.
alter table public.profiles
  add column if not exists email_reminders boolean not null default true;

comment on column public.profiles.email_reminders is
  'Email reminder channel. In-app is always on and has no column - the reminder row is the in-app reminder. Read at DISPATCH time, so toggling this affects reminders already scheduled.';
