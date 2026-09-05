-- Production Director Tournament Awards V1.1 service-scope compatibility.
--
-- Migration 089 checked only the deprecated request.jwt.claim.role setting.
-- Supabase sb_secret_ requests expose the service role through the consolidated
-- request.jwt.claims object, which is already supported by the established
-- exact Production resource-scope assertion. Rebind only the private Awards
-- runtime helper to that established assertion; RPC grants and Awards data are
-- unchanged. Installation is inert.
begin;

create or replace function production_control.assert_tournament_awards_runtime_v1(
  input jsonb
)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $assert_tournament_awards_runtime$
declare
  scope production_control.resource_scope%rowtype;
  pointer production_control.current_tournament_pointer_v1%rowtype;
begin
  -- This private assertion accepts both the legacy role claim and the
  -- consolidated JWT claims emitted for the server-only sb_secret_ transport.
  -- It also revalidates the exact Production project/workbook/tournament scope.
  perform production_control.assert_exact_cutover_resource_scope(input, false);

  if input->>'contract_version'
       is distinct from 'production-tournament-awards-v1'
     or input->>'environment' is distinct from 'PRODUCTION'
     or input->>'tournament_id' is distinct from '2026'
     or input#>>'{authorization,tournament_id}' is distinct from '2026'
     or input#>>'{authorization,role}' is distinct from 'DIRECTOR'
     or pg_catalog.upper(pg_catalog.btrim(coalesce(
       input->>'actor_player_id', ''
     ))) is distinct from pg_catalog.upper(pg_catalog.btrim(coalesce(
       input#>>'{authorization,player_id}', ''
     )))
     or pg_catalog.lower(pg_catalog.btrim(coalesce(
       input->>'actor_auth_user_id', ''
     ))) is distinct from pg_catalog.lower(pg_catalog.btrim(coalesce(
       input#>>'{authorization,auth_user_id}', ''
     ))) then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_TOURNAMENT_AWARDS_SCOPE_REQUIRED';
  end if;

  select value.* into strict scope
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';

  if input->>'project_ref' is distinct from scope.project_ref
     or input->>'project_url' is distinct from scope.project_url
     or input->>'source_workbook_id' is distinct from scope.google_workbook_id
     or scope.current_tournament_id <> '2026'
     or scope.current_tournament_year <> 2026
     or pointer.tournament_id <> '2026'
     or pointer.tournament_year <> 2026 then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_TOURNAMENT_AWARDS_EXACT_RESOURCE_REQUIRED';
  end if;

  -- Re-read the Auth link, active tournament role, current roster membership,
  -- and Director entitlement rather than trusting the server request payload.
  perform production_control.assert_production_scoring_actor(input, true);
  return '2026';
end;
$assert_tournament_awards_runtime$;

comment on function production_control.assert_tournament_awards_runtime_v1(jsonb)
  is 'Private Awards runtime assertion using the established exact resource and Director actor contract for legacy JWT and sb_secret_ server transports.';

revoke all on function
  production_control.assert_tournament_awards_runtime_v1(jsonb)
from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
