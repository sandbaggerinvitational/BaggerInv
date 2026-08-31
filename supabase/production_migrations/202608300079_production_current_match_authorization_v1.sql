-- Step 13E.7B current Production Match authorization decision V1.
--
-- Installation is additive and inert. It does not change a Match, permission,
-- participant, annual runtime, or current-tournament pointer. The normal
-- application resolves the current runtime on the server; this RPC repeats
-- the exact pointer assertion while holding the shared scoring-transition
-- lock, then returns the existing native match_access_decision JSON.
begin;

create or replace function public.authorize_production_current_match_access_v1(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $production_current_match_authorization$
declare
  pointer production_control.current_tournament_pointer_v1%rowtype;
  target_tournament text;
begin
  -- Annual pointer transitions take the exclusive counterpart of this lock.
  -- Holding it through the decision closes the server-resolver/RPC race.
  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';

  -- These values are overwritten by the trusted server translator. Repeating
  -- them here makes a stale resolver or a direct wrong-target service call
  -- fail before any tournament-scoped fact is read.
  if input->>'target_tournament_id' is distinct from pointer.tournament_id
     or input->>'expected_current_tournament_id'
       is distinct from pointer.tournament_id
     or coalesce((input->>'expected_pointer_revision')::bigint, -1)
       <> pointer.pointer_revision then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CURRENT_MATCH_AUTHORIZATION_POINTER_STALE';
  end if;

  if pointer.tournament_id = '2026' then
    perform production_control.assert_frozen_2026_current_read_v1();
    if pointer.tournament_year <> 2026 then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_CURRENT_MATCH_AUTHORIZATION_RUNTIME_REQUIRED';
    end if;
    target_tournament := pointer.tournament_id;
  else
    target_tournament :=
      production_control.assert_annual_current_read_v1(input);
    if target_tournament is distinct from pointer.tournament_id then
      raise exception using errcode = '40001',
        message = 'PRODUCTION_CURRENT_MATCH_AUTHORIZATION_POINTER_STALE';
    end if;
  end if;

  return scoring_authority.match_access_decision(
    target_tournament,
    pg_catalog.btrim(coalesce(input->>'target_player_id', '')),
    pg_catalog.btrim(coalesce(input->>'target_match_id', '')),
    pg_catalog.upper(pg_catalog.btrim(coalesce(
      input->>'requested_action', ''
    )))
  );
exception
  when invalid_text_representation or numeric_value_out_of_range
    or no_data_found then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_CURRENT_MATCH_AUTHORIZATION_RUNTIME_REQUIRED';
end;
$production_current_match_authorization$;

revoke all on function
  public.authorize_production_current_match_access_v1(jsonb)
from public, anon, authenticated, service_role;
grant execute on function
  public.authorize_production_current_match_access_v1(jsonb)
to service_role;

comment on function
  public.authorize_production_current_match_access_v1(jsonb)
is 'Service-only current Production Match authorization decision; exact-pointer fenced and native-DTO preserving.';

notify pgrst, 'reload schema';
commit;
