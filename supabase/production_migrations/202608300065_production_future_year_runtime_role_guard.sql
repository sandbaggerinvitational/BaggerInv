-- Step 13E.7 Production Future-Year Administration V1 runtime role guard.
--
-- PostgREST supplies the service role in request.jwt.claims for the installed
-- Production server transport. Reuse the certified Production assertion so
-- scalar/JSON precedence and fail-closed behavior remain centralized.

begin;

create or replace function production_control.assert_future_year_runtime_v1(
  input jsonb,
  require_owner boolean default false
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, production_control
as $$
declare
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', ''
  )));
  actor_auth uuid;
  scope production_control.resource_scope%rowtype;
  pointer production_control.current_tournament_pointer_v1%rowtype;
begin
  begin
    perform production_control.assert_production_service_role();
  exception
    when insufficient_privilege or invalid_text_representation then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_FUTURE_YEAR_SCOPE_REQUIRED';
  end;
  if input->>'contract_version'
       is distinct from 'production-future-year-administration-v1'
     or input->>'environment' is distinct from 'PRODUCTION'
     or input->>'tournament_id' is distinct from '2026'
     or coalesce(input#>>'{authorization,tournament_id}', '') <> '2026'
     or coalesce(input#>>'{authorization,role}', '') <> 'DIRECTOR'
     or actor_player !~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
     or coalesce(input#>>'{authorization,auth_user_id}', '')
       !~ '^[0-9a-fA-F-]{36}$'
     or (input ? 'actor_player_id' and pg_catalog.upper(pg_catalog.btrim(
       input->>'actor_player_id'
     )) is distinct from actor_player)
     or (input ? 'actor_auth_user_id' and pg_catalog.lower(pg_catalog.btrim(
       input->>'actor_auth_user_id'
     )) is distinct from pg_catalog.lower(pg_catalog.btrim(
       input#>>'{authorization,auth_user_id}'
     ))) then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_FUTURE_YEAR_SCOPE_REQUIRED';
  end if;
  begin
    actor_auth := (input#>>'{authorization,auth_user_id}')::uuid;
  exception when others then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_FUTURE_YEAR_SCOPE_REQUIRED';
  end;
  select value.* into strict scope
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if input->>'project_ref' is distinct from scope.project_ref
     or input->>'project_url' is distinct from scope.project_url
     or input->>'source_workbook_id'
       is distinct from scope.google_workbook_id
     or scope.current_tournament_id <> '2026'
     or scope.current_tournament_year <> 2026 then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_FUTURE_YEAR_EXACT_RESOURCE_REQUIRED';
  end if;
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if pointer.tournament_id <> '2026'
     or pointer.tournament_year <> 2026 then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_FUTURE_YEAR_CURRENT_POINTER_CHANGED';
  end if;
  -- Reuse the certified linked-identity and active Director proof. Only the
  -- annual creation/readiness actions add the installed Owner requirement;
  -- ordinary configuration remains available to active Directors.
  perform production_control.assert_player_access_runtime_v1(
    input || pg_catalog.jsonb_build_object(
      'contract_version', 'production-players-access-v1'
    )
  );
  if require_owner then
    begin
      perform production_control.assert_access_governance_owner_v1(
        '2026', actor_player, actor_auth
      );
    exception when insufficient_privilege then
      raise exception using errcode = '42501',
        message = 'FUTURE_TOURNAMENT_OWNER_REQUIRED';
    end;
  end if;
end;
$$;

revoke all on function
  production_control.assert_future_year_runtime_v1(jsonb, boolean)
  from public, anon, authenticated, service_role;

commit;
