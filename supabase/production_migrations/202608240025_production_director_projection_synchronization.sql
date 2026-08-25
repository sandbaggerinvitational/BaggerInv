-- Step 11: post-cutover Director-authored Google -> Supabase projections.
--
-- This surface is deliberately limited to Guide, Draft, and Prediction
-- Settings.  It is available only after the exact staged Production release,
-- read phase, Supabase participant identity, and active Director entitlement
-- have all been proven.  It does not enable workers, scoring ingress, Google
-- writes, Odds publication, or any automatic fallback.

begin;

create or replace function production_control.assert_active_production_director_sync_actor(
  input jsonb,
  required_phase text
) returns production_control.resource_scope
language plpgsql
security definer
stable
set search_path = pg_catalog, production_control, participant_identity, auth
as $$
declare
  resource production_control.resource_scope%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  actor_user uuid;
  actor_player text := btrim(coalesce(input->>'actor_player_id', ''));
begin
  resource := production_control.assert_production_cutover_read_scope(input, required_phase);
  select * into strict activation
  from production_control.cutover_activation_state
  where scope_key = 'BAGGER_INV_PRODUCTION';

  begin
    actor_user := nullif(btrim(coalesce(input->>'actor_auth_user_id', '')), '')::uuid;
  exception when others then
    raise exception using errcode = '42501', message = 'PRODUCTION_DIRECTOR_SYNC_ACTOR_REQUIRED';
  end;

  if actor_user is null
     or actor_player = ''
     or resource.participant_identity_authority <> 'SUPABASE'
     or upper(btrim(coalesce(input->>'operation_authority', ''))) <> 'GOOGLE_DIRECTOR_SYNC'
     or coalesce((input->>'expected_activation_revision')::bigint, -1)
       <> activation.activation_revision
     or not exists (
       select 1
       from production_control.director_entitlements entitlement
       join participant_identity.user_player_links link
         on link.auth_user_id = entitlement.auth_user_id
        and link.player_id = entitlement.player_id
        and link.status = 'ACTIVE'
       join participant_identity.tournament_roles role_value
         on role_value.tournament_id = entitlement.tournament_id
        and role_value.auth_user_id = entitlement.auth_user_id
        and role_value.role = 'DIRECTOR'
        and role_value.role_active
       join auth.users auth_user
         on auth_user.id = entitlement.auth_user_id
        and auth_user.email_confirmed_at is not null
       where entitlement.auth_user_id = actor_user
         and entitlement.player_id = actor_player
         and entitlement.tournament_id = resource.current_tournament_id
         and entitlement.status = 'ACTIVE'
     ) then
    raise exception using errcode = '42501', message = 'PRODUCTION_ACTIVE_DIRECTOR_SYNC_ENTITLEMENT_REQUIRED';
  end if;

  return resource;
end;
$$;

create or replace function public.read_production_director_sync_context(input jsonb)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, production_control, scoring_authority, participant_identity, auth, extensions
as $$
declare
  domain_value text := upper(btrim(coalesce(input->>'domain', '')));
  required_phase text := case
    when domain_value = 'PREDICTION_SETTINGS' then 'ODDS_WAR_ROOM'
    when domain_value in ('GUIDE', 'DRAFT') then 'READ_CUTOVER'
    else '' end;
  resource production_control.resource_scope%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  current_revision production_control.projection_revisions%rowtype;
  context_value jsonb := '{}'::jsonb;
begin
  if required_phase = '' then
    raise exception using errcode = '22023', message = 'PRODUCTION_DIRECTOR_SYNC_DOMAIN_NOT_ALLOWED';
  end if;
  select * into strict activation
  from production_control.cutover_activation_state
  where scope_key = 'BAGGER_INV_PRODUCTION';
  -- The read-only context call discovers the current activation revision.  It
  -- still exercises the same exact-revision assertion by binding the value
  -- from the locked-down control plane, rather than trusting caller input.
  -- The subsequent mutation must submit this returned revision and therefore
  -- fails closed if the cutover state changes between read and write.
  resource := production_control.assert_active_production_director_sync_actor(
    input || jsonb_build_object(
      'expected_activation_revision', activation.activation_revision
    ),
    required_phase
  );
  select revision.* into current_revision
  from production_control.projection_current pointer
  join production_control.projection_revisions revision
    on revision.revision_id = pointer.revision_id
  where pointer.domain = domain_value
    and pointer.tournament_id = resource.current_tournament_id;

  if domain_value = 'GUIDE' then
    context_value := jsonb_build_object(
      'canonical_course_context',
        scoring_authority.build_guide_course_context(resource.current_tournament_id)
    );
  elsif domain_value = 'DRAFT' then
    context_value := jsonb_build_object(
      'players', coalesce((
        select jsonb_agg(jsonb_build_object(
          'player_id', player.player_id,
          'display_name', player.display_name,
          'source_payload', player.source_payload
        ) order by player.player_id)
        from scoring_authority.players player
      ), '[]'::jsonb),
      'tournaments', coalesce((
        select jsonb_agg(jsonb_build_object(
          'tournament_id', tournament.tournament_id,
          'tournament_year', tournament.tournament_year,
          'name', tournament.name
        ) order by tournament.tournament_year)
        from scoring_authority.tournaments tournament
        where tournament.tournament_year between 2017 and 2026
          and tournament.source_workbook_id = resource.google_workbook_id
      ), '[]'::jsonb),
      'teams', coalesce((
        select jsonb_agg(jsonb_build_object(
          'tournament_id', team.tournament_id,
          'team_id', team.team_id,
          'team_side', team.team_side,
          'name', team.name,
          'source_payload', team.source_payload,
          'captain_player_id', coalesce(history_team.captain_player_id,
            nullif(team.source_payload->>'Captain Player ID', ''),
            nullif(team.source_payload->>'Captain', '')),
          'logo_key', coalesce(history_team.logo_key,
            nullif(team.source_payload->>'Logo Filename', ''),
            nullif(team.source_payload->>'Logo', '')),
          'presentation_identity', coalesce(history_team.presentation_identity, '{}'::jsonb)
        ) order by tournament.tournament_year, team.team_side, team.team_id)
        from scoring_authority.teams team
        join scoring_authority.tournaments tournament
          on tournament.tournament_id = team.tournament_id
        left join scoring_authority.completed_history_current_revisions history_pointer
          on history_pointer.tournament_id = team.tournament_id
        left join scoring_authority.completed_history_team_facts history_team
          on history_team.revision_id = history_pointer.revision_id
         and history_team.team_id = team.team_id
        where tournament.tournament_year between 2017 and 2026
          and tournament.source_workbook_id = resource.google_workbook_id
      ), '[]'::jsonb),
      'roster', coalesce((
        select jsonb_agg(jsonb_build_object(
          'tournament_id', roster.tournament_id,
          'tournament_year', tournament.tournament_year,
          'player_id', roster.player_id,
          'team_id', roster.team_id,
          'team_side', roster.team_side,
          'source_payload', roster.source_payload,
          'tournament_handicap', coalesce(
            history_roster.tournament_handicap::text,
            nullif(roster.source_payload->>'Tournament Handicap', ''),
            nullif(roster.source_payload->>'Handicap', '')
          )
        ) order by tournament.tournament_year, roster.team_side, roster.player_id)
        from scoring_authority.tournament_players roster
        join scoring_authority.tournaments tournament
          on tournament.tournament_id = roster.tournament_id
        left join scoring_authority.completed_history_current_revisions history_pointer
          on history_pointer.tournament_id = roster.tournament_id
        left join scoring_authority.completed_history_roster_facts history_roster
          on history_roster.revision_id = history_pointer.revision_id
         and history_roster.player_id = roster.player_id
        where tournament.tournament_year between 2017 and 2026
          and tournament.source_workbook_id = resource.google_workbook_id
      ), '[]'::jsonb)
    );
  end if;

  return production_control.mark_cutover_read_response(jsonb_build_object(
    'ok', true,
    'domain', domain_value,
    'required_phase', required_phase,
    'activation_revision', activation.activation_revision,
    'current_projection', case when current_revision.revision_id is null then null
      else jsonb_build_object(
        'revision_id', current_revision.revision_id,
        'revision_number', current_revision.revision_number,
        'source_fingerprint', current_revision.source_fingerprint,
        'payload_fingerprint', current_revision.payload_fingerprint,
        'validation_status', current_revision.validation_status,
        'imported_at', current_revision.imported_at
      ) end,
    'canonical_context', context_value,
    'fallback_used', false,
    'google_foreground_requests', 0
  ), required_phase);
end;
$$;

create or replace function public.synchronize_production_director_projection(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority, participant_identity, auth, extensions
as $$
declare
  domain_value text := upper(btrim(coalesce(input->>'domain', '')));
  required_phase text := case
    when domain_value = 'PREDICTION_SETTINGS' then 'ODDS_WAR_ROOM'
    when domain_value in ('GUIDE', 'DRAFT') then 'READ_CUTOVER'
    else '' end;
  result_value jsonb;
begin
  if required_phase = '' then
    raise exception using errcode = '22023', message = 'PRODUCTION_DIRECTOR_SYNC_DOMAIN_NOT_ALLOWED';
  end if;
  perform production_control.assert_active_production_director_sync_actor(input, required_phase);

  result_value := case domain_value
    when 'GUIDE' then public.import_production_guide_projection(input)
    when 'DRAFT' then public.import_production_draft_projection(input)
    when 'PREDICTION_SETTINGS' then public.import_production_prediction_settings(input)
  end;

  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_DIRECTOR_PROJECTION_SYNCHRONIZED', domain_value,
    input->>'tournament_id', input->>'requested_by',
    lower(input->>'source_fingerprint'),
    case when coalesce((result_value->>'ok')::boolean, false) then 'SUCCEEDED' else 'FAILED' end,
    jsonb_build_object(
      'changed', coalesce((result_value->>'changed')::boolean, false),
      'duplicate', coalesce((result_value->>'duplicate')::boolean, false),
      'revisionId', result_value->>'revision_id',
      'revisionNumber', result_value->>'revision_number',
      'sourceFingerprint', lower(input->>'source_fingerprint'),
      'payloadFingerprint', lower(input->>'payload_fingerprint'),
      'activationRevision', (input->>'expected_activation_revision')::bigint,
      'cutoverPhase', upper(input->>'cutover_phase'),
      'googleWrite', false,
      'fallbackUsed', false
    )
  );

  return result_value || jsonb_build_object(
    'domain', domain_value,
    'required_phase', required_phase,
    'google_write', false,
    'fallback_used', false
  );
end;
$$;

revoke all on function production_control.assert_active_production_director_sync_actor(jsonb,text)
  from public, anon, authenticated, service_role;
revoke all on function public.read_production_director_sync_context(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.synchronize_production_director_projection(jsonb)
  from public, anon, authenticated, service_role;

grant execute on function public.read_production_director_sync_context(jsonb)
  to service_role;
grant execute on function public.synchronize_production_director_projection(jsonb)
  to service_role;

notify pgrst, 'reload schema';
commit;
