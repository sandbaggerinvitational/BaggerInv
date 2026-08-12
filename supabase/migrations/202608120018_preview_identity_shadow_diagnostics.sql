-- Preview-only, service-role diagnostic for the formal participant identity
-- shadow comparison. It intentionally excludes email addresses and Auth UUIDs.

create or replace function public.read_participant_identity_shadow_diagnostics(target_tournament_id text)
returns jsonb
language plpgsql
security definer
set search_path = participant_identity, public, pg_temp
as $$
declare
  target text := btrim(coalesce(target_tournament_id, ''));
  latest participant_identity.participant_identity_shadow_observations%rowtype;
  total_count bigint;
begin
  if target = '' then return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_REQUIRED'); end if;
  select count(*) into total_count
  from participant_identity.participant_identity_shadow_observations o
  where o.tournament_id = target;
  select * into latest
  from participant_identity.participant_identity_shadow_observations o
  where o.tournament_id = target
  order by o.observed_at desc
  limit 1;
  return jsonb_build_object(
    'ok', true,
    'count', total_count,
    'latest', case when latest.observation_id is null then null else jsonb_build_object(
      'observationId', latest.observation_id,
      'observedAt', latest.observed_at,
      'passportPlayerId', latest.passport_player_id,
      'linkedPlayerId', latest.linked_player_id,
      'passportTeamId', latest.passport_team_id,
      'linkedTeamId', latest.linked_team_id,
      'passportMembershipActive', latest.passport_membership_active,
      'linkedMembershipActive', latest.linked_membership_active,
      'passportMatchIds', latest.passport_match_ids,
      'linkedMatchIds', latest.linked_match_ids,
      'passportScoringPermissions', latest.passport_scoring_permissions,
      'linkedScoringPermissions', latest.linked_scoring_permissions,
      'passportContextRevision', latest.passport_context_revision,
      'linkedContextRevision', latest.linked_context_revision,
      'comparisonStatus', latest.comparison_status,
      'comparisonDiagnostics', latest.comparison_diagnostics
    ) end
  );
end;
$$;

revoke all on function public.read_participant_identity_shadow_diagnostics(text) from public, anon, authenticated;
grant execute on function public.read_participant_identity_shadow_diagnostics(text) to service_role;
