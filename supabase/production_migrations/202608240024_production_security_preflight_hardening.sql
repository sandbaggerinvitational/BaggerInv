-- Step 11 Production security-advisor hardening.
--
-- This migration is intentionally behavior-neutral for the dormant application
-- plane.  It removes browser-callable EXECUTE inherited through PUBLIC from the
-- Supabase automatic-RLS event-trigger helper and pins the two immutable
-- scoring helpers to pg_catalog so their name resolution cannot be influenced
-- by a caller-controlled search_path.

revoke all on function public.rls_auto_enable()
  from public, anon, authenticated, service_role;

alter function scoring_authority.strokes_on_hole(integer, integer)
  set search_path = pg_catalog;

alter function scoring_authority.valid_gross_scores(jsonb, integer)
  set search_path = pg_catalog;

do $security_preflight$
declare
  target record;
begin
  for target in
    select role_name
    from (values ('anon'), ('authenticated'), ('service_role')) roles(role_name)
  loop
    if has_function_privilege(
      target.role_name,
      'public.rls_auto_enable()'::regprocedure,
      'EXECUTE'
    ) then
      raise exception using
        errcode = '42501',
        message = 'PRODUCTION_RLS_AUTO_ENABLE_BROWSER_EXECUTE_REMAINS';
    end if;
  end loop;

  if not exists (
    select 1
    from pg_proc function_value
    join pg_namespace namespace_value
      on namespace_value.oid = function_value.pronamespace
    where namespace_value.nspname = 'scoring_authority'
      and function_value.proname = 'strokes_on_hole'
      and function_value.proconfig @> array['search_path=pg_catalog']::text[]
  ) or not exists (
    select 1
    from pg_proc function_value
    join pg_namespace namespace_value
      on namespace_value.oid = function_value.pronamespace
    where namespace_value.nspname = 'scoring_authority'
      and function_value.proname = 'valid_gross_scores'
      and function_value.proconfig @> array['search_path=pg_catalog']::text[]
  ) then
    raise exception using
      errcode = '42501',
      message = 'PRODUCTION_SCORING_HELPER_SEARCH_PATH_NOT_FIXED';
  end if;
end
$security_preflight$;
