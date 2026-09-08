-- =============================================================================
-- Vezriqen AI — security self-audit
--
-- Run this in the Supabase SQL editor AFTER applying 0001–0004. It reproduces
-- the checks the Supabase security advisor performs that matter to PRD §23.
-- Every row it returns is something to look at; a clean run returns only the
-- rows explicitly marked EXPECTED.
-- =============================================================================

-- 1. Every public table must have RLS enabled. Any row here is a defect.
select 'RLS DISABLED (defect)' as finding, c.relname as object
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity

union all

-- 2. RLS on but no policies = deny-all. Expected for exactly two tables.
select
  case when c.relname in ('calendar_credentials', 'email_action_tokens')
       then 'EXPECTED deny-all (server-only secrets)'
       else 'RLS ON BUT NO POLICY (defect)' end,
  c.relname
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  and not exists (select 1 from pg_policy p where p.polrelid = c.oid)

union all

-- 3. SECURITY DEFINER functions executable by anon/authenticated.
--    handle_new_user must NOT appear: 0001 revokes execute from both roles.
select 'SECURITY DEFINER executable by anon/authenticated (defect)', p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and (has_function_privilege('anon', p.oid, 'execute')
    or has_function_privilege('authenticated', p.oid, 'execute'))

union all

-- 4. Functions with a mutable search_path are injectable.
select 'MUTABLE search_path (defect)', p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and not exists (
    select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%'
  )

union all

-- 5. SECURITY DEFINER views bypass the querying user's RLS.
select 'SECURITY DEFINER view (defect)', c.relname
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'v'
  and c.reloptions::text like '%security_definer%'

union all

-- 6. Policies calling auth.uid() unwrapped re-evaluate per row.
--    Every policy in 0001–0004 uses (select auth.uid()), so this stays empty.
select 'auth.uid() not wrapped in SELECT (performance)', p.polname
from pg_policy p
join pg_class c on c.oid = p.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and pg_get_expr(p.polqual, p.polrelid) like '%auth.uid()%'
  and pg_get_expr(p.polqual, p.polrelid) not like '%select auth.uid()%'

order by 1, 2;

-- -----------------------------------------------------------------------------
-- Coverage summary: every table should show 4 policies, except the two
-- deny-all tables (0) and the append-only logs (3 — no UPDATE by design).
-- -----------------------------------------------------------------------------
select c.relname as table_name,
       count(p.polname) as policy_count,
       c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public' and c.relkind = 'r'
group by c.relname, c.relrowsecurity
order by c.relname;
