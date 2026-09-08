-- =============================================================================
-- Empirical proof that RLS blocks cross-user reads.
--
-- Run in the Supabase SQL editor. It simulates two signed-in users by setting
-- the role and JWT claims the way PostgREST does, writes a goal as each, and
-- checks what each can see. It cleans up after itself and commits nothing.
-- =============================================================================
begin;

-- Two throwaway identities.
create temporary table _ids (label text, id uuid);
insert into _ids values ('alice', gen_random_uuid()), ('bob', gen_random_uuid());

-- auth.users rows so the foreign keys hold.
insert into auth.users (id, instance_id, aud, role, email)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       label || '@rls-check.invalid'
from _ids;

-- ---- Alice writes a goal as herself -----------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from _ids where label = 'alice'), 'role', 'authenticated')::text,
  true);

insert into public.goals (user_id, user_goal_text)
values ((select id from _ids where label = 'alice'), 'Alice: pass the SAT');

-- ---- Bob writes his own ------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from _ids where label = 'bob'), 'role', 'authenticated')::text,
  true);

insert into public.goals (user_id, user_goal_text)
values ((select id from _ids where label = 'bob'), 'Bob: run a marathon');

-- ---- What can Bob see? -------------------------------------------------------
-- Expect exactly one row, his own. Alice's goal must be invisible.
select
  case
    when count(*) = 1 and bool_and(user_goal_text like 'Bob:%')
      then 'PASS - Bob sees only his own goal'
    else 'FAIL - Bob sees ' || count(*) || ' goals: ' || string_agg(user_goal_text, ', ')
  end as cross_user_read_check
from public.goals;

-- ---- Can Bob overwrite Alice's row? -----------------------------------------
-- The UPDATE must match zero rows; RLS filters it out before it applies.
with attempted as (
  update public.goals set user_goal_text = 'Bob was here'
  where user_goal_text like 'Alice:%'
  returning 1
)
select case when count(*) = 0
            then 'PASS - Bob cannot update Alice''s goal'
            else 'FAIL - Bob updated ' || count(*) || ' of Alice''s rows'
       end as cross_user_write_check
from attempted;

-- ---- Can Bob read the server-only token tables? -----------------------------
select case when count(*) = 0
            then 'PASS - calendar_credentials is invisible to a session'
            else 'FAIL - session read ' || count(*) || ' credential rows'
       end as secret_table_check
from public.calendar_credentials;

rollback;
