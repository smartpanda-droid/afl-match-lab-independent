-- AFL Match Lab — read-only database security audit
-- SAFE: SELECT-only. Run before any RLS / GRANT hardening.
-- Generated 2026-09-20.

-- 1) PostgREST / Data API schema exposure hints.
select
  current_setting('pgrst.db_schemas', true) as session_db_schemas,
  current_setting('pgrst.db_extra_search_path', true) as session_extra_search_path;

select rolname, rolconfig
from pg_roles
where rolname in ('authenticator','anon','authenticated','service_role')
order by rolname;

-- 2) Schema-level reachability.
select
  n.nspname as schema_name,
  has_schema_privilege('anon', n.oid, 'USAGE') as anon_usage,
  has_schema_privilege('authenticated', n.oid, 'USAGE') as authenticated_usage,
  has_schema_privilege('service_role', n.oid, 'USAGE') as service_role_usage
from pg_namespace n
where n.nspname in ('public','afl','afl_source')
order by n.nspname;

-- 3) Table/view privileges for client-facing roles.
select
  c.table_schema,
  c.table_name,
  c.table_type,
  has_table_privilege('anon', format('%I.%I',c.table_schema,c.table_name), 'SELECT') as anon_select,
  has_table_privilege('anon', format('%I.%I',c.table_schema,c.table_name), 'INSERT') as anon_insert,
  has_table_privilege('anon', format('%I.%I',c.table_schema,c.table_name), 'UPDATE') as anon_update,
  has_table_privilege('anon', format('%I.%I',c.table_schema,c.table_name), 'DELETE') as anon_delete,
  has_table_privilege('authenticated', format('%I.%I',c.table_schema,c.table_name), 'SELECT') as auth_select,
  has_table_privilege('authenticated', format('%I.%I',c.table_schema,c.table_name), 'INSERT') as auth_insert,
  has_table_privilege('authenticated', format('%I.%I',c.table_schema,c.table_name), 'UPDATE') as auth_update,
  has_table_privilege('authenticated', format('%I.%I',c.table_schema,c.table_name), 'DELETE') as auth_delete,
  has_table_privilege('service_role', format('%I.%I',c.table_schema,c.table_name), 'SELECT,INSERT,UPDATE,DELETE') as service_role_full_dml
from information_schema.tables c
where c.table_schema in ('public','afl','afl_source')
order by c.table_schema,c.table_name;

-- 4) RLS state and policies.
select
  n.nspname as schema_name,
  c.relname as relation_name,
  c.relkind,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls,
  count(p.policyname) as policy_count
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
left join pg_policies p
  on p.schemaname=n.nspname and p.tablename=c.relname
where n.nspname in ('public','afl','afl_source')
  and c.relkind in ('r','p','v','m')
group by n.nspname,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity
order by n.nspname,c.relname;

select
  schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_policies
where schemaname in ('public','afl','afl_source')
order by schemaname,tablename,policyname;

-- 5) Function/RPC surface, including SECURITY DEFINER and EXECUTE reachability.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_args,
  pg_get_userbyid(p.proowner) as owner,
  p.prosecdef as security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute,
  has_function_privilege('public', p.oid, 'EXECUTE') as public_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','afl','afl_source')
order by n.nspname,p.proname,identity_args;

-- 6) Public RPC definitions actually used by AFL Lab frontend.
select
  n.nspname as schema_name,
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  p.prosecdef as security_definer,
  pg_get_userbyid(p.proowner) as owner,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'afl_match_market_quote',
    'afl_player_market_quote',
    'afl_price_value',
    'afl_multi_lab_market_picker',
    'afl_multi_lab_match_market_quote',
    'afl_multi_lab_evaluate'
  )
order by p.proname;

-- 7) Default ACLs. Important because Supabase is moving to explicit opt-in grants.
select
  pg_get_userbyid(d.defaclrole) as owner,
  coalesce(n.nspname,'<all schemas>') as schema_name,
  d.defaclobjtype,
  d.defaclacl
from pg_default_acl d
left join pg_namespace n on n.oid=d.defaclnamespace
order by owner,schema_name,d.defaclobjtype;

-- 8) Detect internal objects reachable by anon/authenticated despite being outside public.
select
  n.nspname as schema_name,
  c.relname as relation_name,
  c.relkind,
  c.relrowsecurity as rls_enabled,
  has_schema_privilege('anon',n.oid,'USAGE') as anon_schema_usage,
  has_schema_privilege('authenticated',n.oid,'USAGE') as auth_schema_usage,
  has_table_privilege('anon',c.oid,'SELECT') as anon_select,
  has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE') as anon_write_any,
  has_table_privilege('authenticated',c.oid,'SELECT') as auth_select,
  has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE') as auth_write_any
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('afl','afl_source')
  and c.relkind in ('r','p','v','m')
order by n.nspname,c.relname;

-- 9) Candidate hardening should only be generated AFTER reviewing sections 1-8.
-- Do not append ALTER/REVOKE statements here. This file is intentionally read-only.
