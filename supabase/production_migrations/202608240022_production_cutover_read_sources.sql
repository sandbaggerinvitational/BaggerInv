-- Step 11: active Production read cutover and retained Director-sync scope.
--
-- Installation is inert.  The existing Google/Passport resource row remains
-- unchanged.  Public Supabase reads can be opened only by the audited,
-- service-role-only phase RPC after the exact release has been staged.
begin;

alter table production_control.cutover_activation_state
  add column if not exists read_cutover_phase text not null default 'STATIC_BACKEND',
  add column if not exists read_source_fingerprint text,
  add column if not exists public_reads_activated_at timestamptz;

alter table production_control.cutover_activation_state
  add constraint production_cutover_read_phase_check check (read_cutover_phase in (
    'STATIC_BACKEND','READ_CUTOVER','IDENTITY','CURRENT_READS','SCORING_PREPARE',
    'SCORING_COMMIT','WORKERS','ODDS_WAR_ROOM','OBSERVATION'
  )),
  add constraint production_cutover_read_fingerprint_check
    check (read_source_fingerprint is null or read_source_fingerprint ~ '^[0-9a-f]{64}$');

create or replace function production_control.cutover_phase_rank(phase_value text)
returns integer
language sql
immutable
security definer
set search_path = pg_catalog, production_control
as $$
  select case upper(btrim(coalesce(phase_value, '')))
    when 'STATIC_BACKEND' then 0 when 'READ_CUTOVER' then 1
    when 'IDENTITY' then 2 when 'CURRENT_READS' then 3
    when 'SCORING_PREPARE' then 4 when 'SCORING_COMMIT' then 5
    when 'WORKERS' then 6 when 'ODDS_WAR_ROOM' then 7
    when 'OBSERVATION' then 8 else -1 end
$$;

create or replace function public.set_production_cutover_read_state(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control
as $$
declare
  existing jsonb;
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
  requested_mode text := upper(coalesce(input->>'mode', ''));
  prior_phase text := upper(coalesce(input->>'expected_prior_phase', ''));
  target_phase text := upper(coalesce(input->>'target_phase', ''));
  prior_rank integer;
  target_rank integer;
  public_reads boolean;
  current_reads boolean;
  scoring_before text;
  identity_before text;
  ingress_before boolean;
  google_writes_before boolean;
  workers_before boolean;
  odds_publication_before boolean;
  first_write_before timestamptz;
  response_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  existing := production_control.lookup_cutover_receipt('SET_READ_STATE', input);
  if existing is not null then return existing; end if;

  if coalesce(input->>'actor_id', '') = ''
     or requested_mode not in ('ACTIVATE', 'ROLLBACK')
     or coalesce(input->>'source_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or production_control.cutover_phase_rank(prior_phase) < 0
     or production_control.cutover_phase_rank(target_phase) < 0 then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_READ_STATE_INPUT_INVALID';
  end if;

  select * into strict activation
  from production_control.cutover_activation_state
  where scope_key = 'BAGGER_INV_PRODUCTION'
  for update;
  select * into strict resource
  from production_control.resource_scope
  where scope_key = 'BAGGER_INV_PRODUCTION'
  for update;

  prior_rank := production_control.cutover_phase_rank(activation.read_cutover_phase);
  target_rank := production_control.cutover_phase_rank(target_phase);
  if activation.activation_revision <> coalesce((input->>'expected_activation_revision')::bigint, -1)
     or activation.read_cutover_phase <> prior_phase
     or activation.expected_source_fingerprint is null
     or lower(input->>'source_fingerprint') <> activation.expected_source_fingerprint
     or (requested_mode = 'ACTIVATE' and target_rank <> prior_rank + 1)
     or (requested_mode = 'ROLLBACK' and target_rank >= prior_rank) then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_READ_STATE_PRECONDITION_FAILED';
  end if;

  scoring_before := resource.scoring_authority;
  identity_before := resource.participant_identity_authority;
  ingress_before := resource.scoring_ingress_enabled;
  google_writes_before := resource.google_writes_enabled;
  workers_before := resource.workers_enabled;
  odds_publication_before := resource.odds_publication_enabled;
  first_write_before := activation.first_supabase_write_observed_at;
  if requested_mode = 'ROLLBACK' and (
       (target_rank < production_control.cutover_phase_rank('IDENTITY')
         and identity_before = 'SUPABASE')
       or (target_rank < production_control.cutover_phase_rank('SCORING_COMMIT')
         and scoring_before = 'SUPABASE')
       or (target_rank < production_control.cutover_phase_rank('WORKERS')
         and (workers_before or google_writes_before))
     ) then
    raise exception using errcode = 'P0001',
      message = 'PRODUCTION_READ_ROLLBACK_REQUIRES_DEPENDENT_AUTHORITY_ROLLBACK';
  end if;
  public_reads := target_rank >= production_control.cutover_phase_rank('READ_CUTOVER');
  current_reads := target_rank >= production_control.cutover_phase_rank('CURRENT_READS');

  update production_control.resource_scope
  set public_supabase_reads_enabled = public_reads,
      current_tournament_read_authority = case when current_reads then 'SUPABASE' else 'GOOGLE' end
  where scope_key = 'BAGGER_INV_PRODUCTION';
  update production_control.cutover_activation_state
  set read_cutover_phase = target_phase,
      read_source_fingerprint = lower(input->>'source_fingerprint'),
      public_reads_activated_at = case
        when public_reads and public_reads_activated_at is null then now()
        when not public_reads then null else public_reads_activated_at end,
      activation_revision = activation_revision + 1,
      updated_by = left(input->>'actor_id', 160), updated_at = now()
  where scope_key = 'BAGGER_INV_PRODUCTION'
  returning * into activation;
  select * into strict resource from production_control.resource_scope
  where scope_key = 'BAGGER_INV_PRODUCTION';

  if resource.scoring_authority <> scoring_before
     or resource.participant_identity_authority <> identity_before
     or resource.scoring_ingress_enabled <> ingress_before
     or resource.google_writes_enabled <> google_writes_before
     or resource.workers_enabled <> workers_before
     or resource.odds_publication_enabled <> odds_publication_before
     or activation.first_supabase_write_observed_at is distinct from first_write_before then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_READ_STATE_AUTHORITY_SIDE_EFFECT';
  end if;

  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    case when requested_mode = 'ACTIVATE'
      then 'PRODUCTION_SUPABASE_READ_PHASE_ACTIVATED'
      else 'PRODUCTION_SUPABASE_READ_PHASE_ROLLED_BACK' end,
    'APPLICATION_READS', '2026', left(input->>'actor_id', 160),
    lower(input->>'request_fingerprint'), 'SUCCEEDED',
    jsonb_build_object(
      'prior_phase', prior_phase, 'target_phase', target_phase,
      'public_supabase_reads_enabled', resource.public_supabase_reads_enabled,
      'current_tournament_read_authority', resource.current_tournament_read_authority,
      'scoring_authority_unchanged', resource.scoring_authority,
      'participant_identity_authority_unchanged', resource.participant_identity_authority,
      'scoring_ingress_unchanged', resource.scoring_ingress_enabled,
      'google_writes_unchanged', resource.google_writes_enabled,
      'workers_unchanged', resource.workers_enabled,
      'odds_publication_unchanged', resource.odds_publication_enabled,
      'first_supabase_canonical_write_observed',
        activation.first_supabase_write_observed_at is not null,
      'source_fingerprint', activation.read_source_fingerprint
    )
  );

  response_value := jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_READ_STATE_UPDATED',
    'mode', requested_mode, 'prior_phase', prior_phase,
    'phase', target_phase, 'activation_revision', activation.activation_revision,
    'public_supabase_reads_enabled', resource.public_supabase_reads_enabled,
    'current_tournament_read_authority', resource.current_tournament_read_authority,
    'scoring_authority', resource.scoring_authority,
    'participant_identity_authority', resource.participant_identity_authority,
    'scoring_ingress_enabled', resource.scoring_ingress_enabled,
    'first_supabase_canonical_write_observed',
      activation.first_supabase_write_observed_at is not null,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt('SET_READ_STATE', input, response_value);
  return response_value;
end;
$$;

create or replace function production_control.mark_cutover_read_response(
  response_value jsonb,
  required_phase text
) returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, production_control
as $$
declare
  activation production_control.cutover_activation_state%rowtype;
begin
  select * into strict activation from production_control.cutover_activation_state
  where scope_key = 'BAGGER_INV_PRODUCTION';
  return coalesce(response_value, '{}'::jsonb) || jsonb_build_object(
    'authoritative', true, 'shadow_only', false,
    'google_foreground_requests', 0, 'fallback_used', false,
    'cutover_phase', activation.read_cutover_phase,
    'required_phase', upper(required_phase),
    'activation_revision', activation.activation_revision,
    'deployment_commit', activation.expected_deployment_commit,
    'first_supabase_canonical_write_observed',
      activation.first_supabase_write_observed_at is not null
  );
end;
$$;

create or replace function public.read_production_cutover_current_view(input jsonb)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, production_control, scoring_authority, participant_identity
as $$
declare
  resource production_control.resource_scope%rowtype;
  surface text := upper(btrim(coalesce(input->>'surface', '')));
  required_phase text := case
    when surface in ('PUBLISHED_ODDS', 'GUIDE_COURSE_CONTEXT') then 'READ_CUTOVER'
    when surface = 'ODDS_INPUT' then 'ODDS_WAR_ROOM'
    else 'CURRENT_READS' end;
  player_id_value text := btrim(coalesce(input->>'player_id', ''));
  match_id_value text := btrim(coalesce(input->>'match_id', ''));
  engine_keys_value text[];
  result_value jsonb;
  finalized_value jsonb;
begin
  resource := production_control.assert_production_cutover_read_scope(input, required_phase);
  if surface in ('TOURNAMENT_LIVE', 'LEADERBOARDS', 'GUIDE_COURSE_CONTEXT') then
    result_value := public.read_leaderboards_core_view('2026');
  elsif surface = 'HISTORY_2026' then
    result_value := public.read_leaderboards_core_view('2026');
    if coalesce((result_value->>'ok')::boolean, false) then
      select coalesce(jsonb_agg(jsonb_build_object(
        'tournament_id', finalized.tournament_id,
        'match_id', finalized.match_id,
        'snapshot_revision', finalized.snapshot_revision,
        'state', finalized.state,
        'match_revision', finalized.match_revision,
        'scoring_snapshot_id', finalized.scoring_snapshot_id,
        'scoring_snapshot_revision', finalized.scoring_snapshot_revision,
        'source_fingerprint', finalized.source_fingerprint,
        'payload_hash', finalized.payload_hash,
        'payload', finalized.payload,
        'finalized_at', finalized.finalized_at
      ) order by finalized.match_id), '[]'::jsonb)
      into finalized_value
      from scoring_authority.finalized_scorecard_snapshots finalized
      join scoring_authority.matches match_value on match_value.match_id = finalized.match_id
      where finalized.tournament_id = '2026' and finalized.state = 'CURRENT'
        and match_value.status = 'FINAL'
        and finalized.match_revision = match_value.match_revision
        and finalized.scoring_snapshot_id = match_value.scoring_snapshot_id;
      result_value := jsonb_set(
        jsonb_set(result_value, '{data,schema_version}', '"production-2026-history-v1"'::jsonb, true),
        '{data,finalized_snapshots}', finalized_value, true
      );
    end if;
  elsif surface = 'PARTICIPANT_HOME' then
    if player_id_value = '' then result_value := jsonb_build_object('ok',false,'code','PLAYER_ID_REQUIRED');
    else result_value := public.read_participant_home_view('2026', player_id_value); end if;
  elsif surface = 'MY_MATCH' then
    if player_id_value = '' then result_value := jsonb_build_object('ok',false,'code','PLAYER_ID_REQUIRED');
    else result_value := public.read_my_match_view('2026', player_id_value); end if;
  elsif surface = 'GAME_CENTER' then
    if match_id_value = '' or not exists (
      select 1 from scoring_authority.matches value
      where value.match_id = match_id_value and value.tournament_id = '2026'
    ) then result_value := jsonb_build_object('ok',false,'code','PRODUCTION_MATCH_NOT_FOUND');
    else result_value := public.read_game_center_view(match_id_value); end if;
  elsif surface = 'MATCH_AUTHORIZATION' then
    result_value := public.read_match_authorization_matrix('2026');
  elsif surface = 'NET_SKINS_INPUT' then
    result_value := public.read_net_skins_input_view('2026');
  elsif surface = 'NET_SKINS_RESULT' then
    result_value := public.read_net_skins_result_view('2026');
  elsif surface = 'CALCUTTA_CONFIGURATION' then
    result_value := public.read_calcutta_configuration_view('2026');
  elsif surface = 'PUBLISHED_ODDS' then
    result_value := public.read_published_odds_view('2026', resource.google_workbook_id);
  elsif surface = 'ODDS_INPUT' then
    result_value := public.read_championship_odds_inputs('2026');
  elsif surface = 'PARTICIPANT_IDENTITY' then
    if player_id_value = '' then result_value := jsonb_build_object('ok',false,'code','PLAYER_ID_REQUIRED');
    else result_value := public.read_participant_identity_context('2026', player_id_value); end if;
  elsif surface = 'COMPETITION_DERIVED' then
    if jsonb_typeof(input->'engine_keys') <> 'array' then
      result_value := jsonb_build_object('ok',false,'code','ENGINE_KEYS_REQUIRED');
    else
      select array_agg(value) into engine_keys_value
      from jsonb_array_elements_text(input->'engine_keys') value;
      if engine_keys_value is null or cardinality(engine_keys_value) = 0 or exists (
        select 1 from unnest(engine_keys_value) value where value not in (
          'TEAM_MOMENTUM','TOURNAMENT_STORYLINES','CALCUTTA',
          'TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL','TOURNAMENT_FINAL_RECAP'
        )
      ) then result_value := jsonb_build_object('ok',false,'code','ENGINE_KEYS_INVALID');
      else result_value := public.read_competition_derived_state('2026', engine_keys_value); end if;
    end if;
  else
    result_value := jsonb_build_object('ok',false,'code','PRODUCTION_CUTOVER_SURFACE_NOT_ALLOWED');
  end if;
  return production_control.mark_cutover_read_response(result_value, required_phase);
end;
$$;

create or replace function public.read_production_cutover_scoring_authority(input jsonb)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, production_control
as $$
begin
  perform production_control.assert_production_cutover_read_scope(input, 'CURRENT_READS');
  return production_control.mark_cutover_read_response(
    public.read_production_scoring_authority(input), 'CURRENT_READS'
  );
end;
$$;

create or replace function public.read_production_cutover_scoring_participant_context(input jsonb)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, production_control
as $$
begin
  perform production_control.assert_production_cutover_read_scope(input, 'CURRENT_READS');
  return production_control.mark_cutover_read_response(
    public.read_production_scoring_participant_context(input), 'CURRENT_READS'
  );
end;
$$;

create or replace function public.read_production_cutover_completed_history(input jsonb)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  resource production_control.resource_scope%rowtype;
  mode_value text := upper(btrim(coalesce(input->>'mode', input->>'scope', 'YEARS')));
  target_year integer;
  revision_value uuid;
  result_value jsonb;
begin
  resource := production_control.assert_production_cutover_read_scope(input, 'READ_CUTOVER');
  if mode_value = 'YEARS' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'tournament_id', revision.tournament_id,
      'tournament_year', revision.tournament_year,
      'revision_id', revision.revision_id,
      'revision_number', revision.revision_number,
      'source_fingerprint', revision.source_fingerprint,
      'payload_fingerprint', revision.payload_fingerprint,
      'import_contract_version', revision.import_contract_version,
      'correction_set_version', revision.correction_set_version,
      'importer_version', revision.importer_version,
      'certified_at', revision.certified_at,
      'canonical_counts', revision.canonical_counts,
      'certification', revision.certification,
      'tournament', jsonb_build_object(
        'name', tournament.name, 'start_date', fact.start_date, 'end_date', fact.end_date,
        'destination', fact.destination, 'lifecycle', fact.lifecycle,
        'score_availability', fact.score_availability,
        'official_team_1_points', fact.official_team_1_points,
        'official_team_2_points', fact.official_team_2_points,
        'total_awarded_points', fact.total_awarded_points,
        'champion_team_side', fact.champion_team_side,
        'champion_team_id', fact.champion_team_id
      )
    ) order by revision.tournament_year), '[]'::jsonb)
    into result_value
    from scoring_authority.completed_history_current_revisions current_pointer
    join scoring_authority.completed_history_revisions revision
      on revision.revision_id = current_pointer.revision_id
    join scoring_authority.tournaments tournament
      on tournament.tournament_id = revision.tournament_id
    join scoring_authority.completed_history_tournament_facts fact
      on fact.revision_id = revision.revision_id
    where revision.project_ref = resource.project_ref
      and revision.source_workbook_id = resource.google_workbook_id;
  elsif mode_value = 'YEAR' then
    begin
      target_year := coalesce(input->>'tournament_year', input->>'year')::integer;
    exception when others then
      return jsonb_build_object('ok', false, 'code', 'HISTORICAL_YEAR_REQUIRED');
    end;
    if target_year not between 2017 and 2025 then
      return jsonb_build_object('ok', false, 'code', 'HISTORICAL_YEAR_REQUIRED');
    end if;
    select current_pointer.revision_id into revision_value
    from scoring_authority.completed_history_current_revisions current_pointer
    join scoring_authority.completed_history_revisions revision
      on revision.revision_id = current_pointer.revision_id
    where current_pointer.tournament_year = target_year
      and revision.project_ref = resource.project_ref
      and revision.source_workbook_id = resource.google_workbook_id;
    if revision_value is null then
      return jsonb_build_object('ok', false, 'code', 'HISTORICAL_YEAR_NOT_CERTIFIED');
    end if;
    select jsonb_build_object(
      'revision', to_jsonb(revision),
      'tournament', to_jsonb(tournament) || to_jsonb(fact),
      'players', coalesce((
        select jsonb_agg(jsonb_build_object(
          'player_id', player.player_id,
          'display_name', player.display_name
        ) order by player.player_id)
        from scoring_authority.completed_history_roster_facts roster
        join scoring_authority.players player on player.player_id = roster.player_id
        where roster.revision_id = revision_value
      ), '[]'::jsonb),
      'teams', coalesce((
        select jsonb_agg(to_jsonb(team_fact) order by team_fact.team_side)
        from scoring_authority.completed_history_team_facts team_fact
        where team_fact.revision_id = revision_value
      ), '[]'::jsonb),
      'roster', coalesce((
        select jsonb_agg(to_jsonb(roster) order by roster.team_side, roster.display_name, roster.player_id)
        from scoring_authority.completed_history_roster_facts roster
        where roster.revision_id = revision_value
      ), '[]'::jsonb),
      'rounds', coalesce((
        select jsonb_agg(to_jsonb(round_fact) order by round_fact.round_number)
        from scoring_authority.completed_history_round_facts round_fact
        where round_fact.revision_id = revision_value
      ), '[]'::jsonb),
      'courses', coalesce((
        select jsonb_agg(jsonb_build_object(
          'course_id', course.course_id,
          'canonical_name', course.canonical_name,
          'canonical_location', course.canonical_location
        ) order by course.course_id)
        from (
          select distinct appearance.course_id
          from scoring_authority.completed_history_course_appearances appearance
          where appearance.revision_id = revision_value
        ) year_course
        join scoring_authority.completed_history_course_identities course
          on course.course_id = year_course.course_id
      ), '[]'::jsonb),
      'course_appearances', coalesce((
        select jsonb_agg(to_jsonb(appearance) || jsonb_build_object(
          'canonical_name', course.canonical_name,
          'canonical_location', course.canonical_location
        ) order by appearance.round_number)
        from scoring_authority.completed_history_course_appearances appearance
        join scoring_authority.completed_history_course_identities course
          on course.course_id = appearance.course_id
        where appearance.revision_id = revision_value
      ), '[]'::jsonb),
      'matches', coalesce((
        select jsonb_agg(to_jsonb(match_value) order by match_value.round_number, match_value.match_id)
        from scoring_authority.completed_history_matches match_value
        where match_value.revision_id = revision_value
      ), '[]'::jsonb),
      'match_participants', coalesce((
        select jsonb_agg(to_jsonb(participant) order by participant.match_id, participant.team_side, participant.player_slot)
        from scoring_authority.completed_history_match_participants participant
        where participant.revision_id = revision_value
      ), '[]'::jsonb),
      'scorecards', coalesce((
        select jsonb_agg(to_jsonb(scorecard) order by scorecard.match_id, scorecard.scorecard_id)
        from scoring_authority.completed_history_scorecards scorecard
        where scorecard.revision_id = revision_value
      ), '[]'::jsonb),
      'awards', coalesce((
        select jsonb_agg(to_jsonb(award) order by award.award_type, award.award_id)
        from scoring_authority.completed_history_awards award
        where award.revision_id = revision_value
      ), '[]'::jsonb),
      'record_eligibility', coalesce((
        select jsonb_agg(to_jsonb(eligibility) order by eligibility.match_id, eligibility.player_id)
        from scoring_authority.completed_history_record_eligibility eligibility
        where eligibility.revision_id = revision_value
      ), '[]'::jsonb),
      'corrections', coalesce((
        select jsonb_agg(to_jsonb(correction) order by correction.correction_id)
        from scoring_authority.completed_history_correction_applications correction
        where correction.revision_id = revision_value
      ), '[]'::jsonb)
    ) into result_value
    from scoring_authority.completed_history_revisions revision
    join scoring_authority.tournaments tournament
      on tournament.tournament_id = revision.tournament_id
    join scoring_authority.completed_history_tournament_facts fact
      on fact.revision_id = revision.revision_id
    where revision.revision_id = revision_value;
  else
    return jsonb_build_object(
      'ok', false, 'code', 'PRODUCTION_CUTOVER_HISTORY_MODE_NOT_ALLOWED'
    );
  end if;
  return production_control.mark_cutover_read_response(
    jsonb_build_object('ok', true, 'data', result_value), 'READ_CUTOVER'
  );
end;
$$;

-- Preserve the exact dormant candidate contracts under private names before
-- installing active dispatchers with the original signatures.
alter function production_control.assert_projection_read_scope(jsonb,text,text,jsonb)
  rename to assert_projection_read_scope_dormant_internal;
alter function production_control.assert_projection_scope(jsonb,text,text,jsonb)
  rename to assert_projection_scope_dormant_internal;
alter function public.import_production_guide_projection(jsonb)
  rename to import_production_guide_projection_dormant_internal;
alter function public.import_production_player_editorial(jsonb)
  rename to import_production_player_editorial_dormant_internal;
alter function public.import_production_prediction_settings(jsonb)
  rename to import_production_prediction_settings_dormant_internal;
alter function public.import_production_draft_projection(jsonb)
  rename to import_production_draft_projection_dormant_internal;
alter function public.import_production_net_skins_configuration(jsonb)
  rename to import_production_net_skins_configuration_dormant_internal;
alter function public.import_production_calcutta_configuration(jsonb)
  rename to import_production_calcutta_configuration_dormant_internal;
alter function public.import_production_published_odds(jsonb)
  rename to import_production_published_odds_dormant_internal;

create or replace function production_control.assert_projection_scope(
  input jsonb, expected_domain text, expected_contract text, expected_tabs jsonb
) returns void
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority, extensions
as $$
declare
  resource production_control.resource_scope%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  source_text text := coalesce(input->>'source_canonical_json','');
  payload_text text := coalesce(input->>'payload_canonical_json','');
  source_value jsonb;
  payload_value jsonb;
  settings_text text;
  effective_settings_text text;
  settings_value jsonb;
  effective_settings_value jsonb;
  snapshot_value jsonb;
  snapshot_item jsonb;
  snapshot_text text;
begin
  select * into strict resource from production_control.resource_scope
  where scope_key = 'BAGGER_INV_PRODUCTION';
  if not resource.public_supabase_reads_enabled then
    perform production_control.assert_projection_scope_dormant_internal(
      input, expected_domain, expected_contract, expected_tabs
    );
    return;
  end if;

  perform production_control.assert_production_cutover_read_scope(
    input, production_control.projection_required_phase(expected_domain)
  );
  select * into strict activation from production_control.cutover_activation_state
  where scope_key = 'BAGGER_INV_PRODUCTION';
  if upper(btrim(coalesce(input->>'operation_authority',''))) <> 'GOOGLE_DIRECTOR_SYNC'
     or coalesce((input->>'expected_activation_revision')::bigint,-1)
       <> activation.activation_revision
     or upper(btrim(coalesce(input->>'environment',''))) <> 'PRODUCTION'
     or btrim(coalesce(input->>'project_ref','')) <> resource.project_ref
     or btrim(coalesce(input->>'project_url','')) <> resource.project_url
     or btrim(coalesce(input->>'source_workbook_id','')) <> resource.google_workbook_id
     or btrim(coalesce(input->>'tournament_id','')) <> resource.current_tournament_id
     or coalesce((input->>'tournament_year')::integer,0) <> resource.current_tournament_year
     or upper(btrim(coalesce(input->>'domain',''))) <> expected_domain
     or btrim(coalesce(input->>'contract_version','')) <> expected_contract
     or coalesce(input->'source_tabs','null'::jsonb) <> expected_tabs
     or lower(btrim(coalesce(input->>'source_fingerprint',''))) !~ '^[0-9a-f]{64}$'
     or lower(btrim(coalesce(input->>'payload_fingerprint',''))) !~ '^[0-9a-f]{64}$'
     or btrim(coalesce(input->>'requested_by','')) = ''
     or upper(btrim(coalesce(input->>'validation_status',''))) not in ('VALID','NOT_CONFIGURED')
     or jsonb_typeof(coalesce(input->'validation_diagnostics','{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(input->'source_payload','null'::jsonb)) not in ('object','array')
     or jsonb_typeof(coalesce(input->'payload','null'::jsonb)) <> 'object'
     or btrim(source_text) = '' or btrim(payload_text) = '' then
    raise exception using errcode = '42501', message = 'PRODUCTION_ACTIVE_SYNC_SCOPE_REQUIRED';
  end if;

  begin
    source_value := source_text::jsonb;
    payload_value := payload_text::jsonb;
  exception when others then
    raise exception using errcode = '22023', message = 'PRODUCTION_PROJECTION_CANONICAL_JSON_INVALID';
  end;
  if source_value is distinct from input->'source_payload'
     or payload_value is distinct from input->'payload'
     or encode(extensions.digest(source_text,'sha256'),'hex')
       <> lower(btrim(input->>'source_fingerprint'))
     or encode(extensions.digest(payload_text,'sha256'),'hex')
       <> lower(btrim(input->>'payload_fingerprint')) then
    raise exception using errcode = '22023', message = 'PRODUCTION_PROJECTION_CANONICAL_EVIDENCE_MISMATCH';
  end if;

  if expected_domain = 'PREDICTION_SETTINGS' then
    settings_text := coalesce(input->>'settings_canonical_json','');
    effective_settings_text := coalesce(input->>'effective_settings_canonical_json','');
    if btrim(settings_text) = '' or btrim(effective_settings_text) = '' then
      raise exception using errcode = '22023', message = 'PRODUCTION_PREDICTION_SETTINGS_CANONICAL_EVIDENCE_REQUIRED';
    end if;
    begin
      settings_value := settings_text::jsonb;
      effective_settings_value := effective_settings_text::jsonb;
    exception when others then
      raise exception using errcode = '22023', message = 'PRODUCTION_PREDICTION_SETTINGS_CANONICAL_JSON_INVALID';
    end;
    if settings_value is distinct from input#>'{payload,settings}'
       or effective_settings_value is distinct from input#>'{payload,effective_settings}'
       or encode(extensions.digest(settings_text,'sha256'),'hex')
         <> lower(btrim(coalesce(input#>>'{payload,settings_fingerprint}','')))
       or encode(extensions.digest(effective_settings_text,'sha256'),'hex')
         <> lower(btrim(coalesce(input#>>'{payload,effective_settings_fingerprint}',''))) then
      raise exception using errcode = '22023', message = 'PRODUCTION_PREDICTION_SETTINGS_INNER_FINGERPRINT_MISMATCH';
    end if;
  end if;

  if expected_domain = 'PUBLISHED_ODDS' then
    if jsonb_typeof(input#>'{payload,snapshots}') <> 'array' then
      raise exception using errcode = '22023', message = 'PRODUCTION_PUBLISHED_ODDS_CANONICAL_EVIDENCE_REQUIRED';
    end if;
    for snapshot_item in select value from jsonb_array_elements(input#>'{payload,snapshots}')
    loop
      snapshot_text := coalesce(snapshot_item->>'published_payload_canonical_json','');
      if btrim(snapshot_text) = '' then
        raise exception using errcode = '22023', message = 'PRODUCTION_PUBLISHED_ODDS_CANONICAL_EVIDENCE_REQUIRED';
      end if;
      begin snapshot_value := snapshot_text::jsonb;
      exception when others then
        raise exception using errcode = '22023', message = 'PRODUCTION_PUBLISHED_ODDS_CANONICAL_JSON_INVALID';
      end;
      if snapshot_value is distinct from snapshot_item->'published_payload'
         or encode(extensions.digest(snapshot_text,'sha256'),'hex')
           <> lower(btrim(coalesce(snapshot_item->>'payload_hash',''))) then
        raise exception using errcode = '22023', message = 'PRODUCTION_PUBLISHED_ODDS_SNAPSHOT_HASH_MISMATCH';
      end if;
    end loop;
  end if;

  if not exists (
    select 1 from production_control.tournament_scopes value
    where value.tournament_id = resource.current_tournament_id
      and value.tournament_year = resource.current_tournament_year
      and value.source_workbook_id = resource.google_workbook_id
      and value.scope_kind = 'CURRENT_TOURNAMENT'
      and value.active_for_shadow_import
  ) then
    raise exception using errcode = '42501', message = 'PRODUCTION_TOURNAMENT_SCOPE_REQUIRED';
  end if;
end;
$$;

create or replace function production_control.read_projection(
  input jsonb, expected_domain text, expected_contract text, expected_tabs jsonb
) returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, production_control
as $$
declare
  revision production_control.projection_revisions%rowtype;
  resource production_control.resource_scope%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  active_read boolean;
begin
  perform production_control.assert_projection_read_scope(
    input, expected_domain, expected_contract, expected_tabs
  );
  select * into strict resource from production_control.resource_scope
  where scope_key = 'BAGGER_INV_PRODUCTION';
  select * into strict activation from production_control.cutover_activation_state
  where scope_key = 'BAGGER_INV_PRODUCTION';
  active_read := resource.public_supabase_reads_enabled;
  select value.* into revision
  from production_control.projection_current pointer
  join production_control.projection_revisions value on value.revision_id = pointer.revision_id
  where pointer.domain = expected_domain and pointer.tournament_id = '2026';
  if revision.revision_id is null then
    return jsonb_build_object('ok',false,'code',expected_domain || '_PROJECTION_UNAVAILABLE');
  end if;
  return jsonb_build_object('ok',true,'data',jsonb_build_object(
    'domain',revision.domain,'tournament_id',revision.tournament_id,
    'tournament_year',revision.tournament_year,'revision_id',revision.revision_id,
    'revision_number',revision.revision_number,'previous_revision_id',revision.previous_revision_id,
    'source_workbook_id',revision.source_workbook_id,'source_tabs',revision.source_tabs,
    'contract_version',revision.contract_version,'source_fingerprint',revision.source_fingerprint,
    'payload_fingerprint',revision.payload_fingerprint,'validation_status',revision.validation_status,
    'validation_diagnostics',revision.validation_diagnostics,'payload',revision.projection_payload,
    'imported_by',revision.imported_by,'imported_at',revision.imported_at,
    'google_foreground_requests',0,'fallback_used',false,
    'authoritative',active_read,'shadow_only',not active_read
  ),
  'google_foreground_requests',0,'fallback_used',false,
  'authoritative',active_read,'shadow_only',not active_read,
  'cutover_phase',case when active_read then activation.read_cutover_phase else null end,
  'activation_revision',case when active_read then activation.activation_revision else null end,
  'deployment_commit',case when active_read then activation.expected_deployment_commit else null end);
end;
$$;

create or replace function production_control.assert_production_cutover_read_scope(
  input jsonb,
  required_phase text
) returns production_control.resource_scope
language plpgsql
security definer
stable
set search_path = pg_catalog, production_control
as $$
declare
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
  required_rank integer := production_control.cutover_phase_rank(required_phase);
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  select * into strict activation from production_control.cutover_activation_state
  where scope_key = 'BAGGER_INV_PRODUCTION';
  select * into strict resource from production_control.resource_scope
  where scope_key = 'BAGGER_INV_PRODUCTION';
  if required_rank < production_control.cutover_phase_rank('READ_CUTOVER')
     or not resource.public_supabase_reads_enabled
     or production_control.cutover_phase_rank(activation.read_cutover_phase) < required_rank
     or upper(coalesce(input->>'read_contract', '')) <> 'ACTIVE_CUTOVER'
     or upper(coalesce(input->>'cutover_phase', '')) <> activation.read_cutover_phase
     or activation.read_source_fingerprint is null
     or activation.read_source_fingerprint is distinct from activation.expected_source_fingerprint
     or (required_rank >= production_control.cutover_phase_rank('CURRENT_READS')
       and resource.current_tournament_read_authority <> 'SUPABASE') then
    raise exception using errcode = '42501', message = 'PRODUCTION_CUTOVER_READ_SCOPE_REQUIRED';
  end if;
  return resource;
end;
$$;

create or replace function production_control.projection_required_phase(expected_domain text)
returns text
language sql
immutable
security definer
set search_path = pg_catalog, production_control
as $$
  select case upper(expected_domain)
    when 'PREDICTION_SETTINGS' then 'ODDS_WAR_ROOM'
    when 'NET_SKINS_CONFIGURATION' then 'CURRENT_READS'
    when 'CALCUTTA_CONFIGURATION' then 'CURRENT_READS'
    else 'READ_CUTOVER' end
$$;

create or replace function production_control.assert_projection_read_scope(
  input jsonb, expected_domain text, expected_contract text, expected_tabs jsonb
) returns void
language plpgsql
security definer
stable
set search_path = pg_catalog, production_control
as $$
declare
  resource production_control.resource_scope%rowtype;
begin
  select * into strict resource from production_control.resource_scope
  where scope_key = 'BAGGER_INV_PRODUCTION';
  if not resource.public_supabase_reads_enabled then
    perform production_control.assert_projection_read_scope_dormant_internal(
      input, expected_domain, expected_contract, expected_tabs
    );
    return;
  end if;
  perform production_control.assert_production_cutover_read_scope(
    input, production_control.projection_required_phase(expected_domain)
  );
  if upper(btrim(coalesce(input->>'environment',''))) <> 'PRODUCTION'
     or btrim(coalesce(input->>'project_ref','')) <> resource.project_ref
     or btrim(coalesce(input->>'project_url','')) <> resource.project_url
     or btrim(coalesce(input->>'source_workbook_id','')) <> resource.google_workbook_id
     or btrim(coalesce(input->>'tournament_id','')) <> resource.current_tournament_id
     or coalesce((input->>'tournament_year')::integer,0) <> resource.current_tournament_year
     or upper(btrim(coalesce(input->>'domain',''))) <> expected_domain
     or btrim(coalesce(input->>'contract_version','')) <> expected_contract
     or coalesce(input->'source_tabs','null'::jsonb) <> expected_tabs then
    raise exception using errcode = '42501', message = 'PRODUCTION_PROJECTION_READ_SCOPE_REQUIRED';
  end if;
end;
$$;

create or replace function production_control.mark_projection_operation_response(
  response_value jsonb,
  expected_domain text
) returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, production_control
as $$
declare
  resource production_control.resource_scope%rowtype;
begin
  select * into strict resource
  from production_control.resource_scope
  where scope_key = 'BAGGER_INV_PRODUCTION';
  if not resource.public_supabase_reads_enabled then
    return response_value;
  end if;
  return production_control.mark_cutover_read_response(
    response_value,
    production_control.projection_required_phase(expected_domain)
  );
end;
$$;

create or replace function public.import_production_guide_projection(input jsonb)
returns jsonb
language sql
security definer
set search_path = pg_catalog, production_control
as $$
  select production_control.mark_projection_operation_response(
    public.import_production_guide_projection_dormant_internal($1), 'GUIDE'
  )
$$;

create or replace function public.import_production_player_editorial(input jsonb)
returns jsonb
language sql
security definer
set search_path = pg_catalog, production_control
as $$
  select production_control.mark_projection_operation_response(
    public.import_production_player_editorial_dormant_internal($1), 'PLAYER_EDITORIAL'
  )
$$;

create or replace function public.import_production_prediction_settings(input jsonb)
returns jsonb
language sql
security definer
set search_path = pg_catalog, production_control
as $$
  select production_control.mark_projection_operation_response(
    public.import_production_prediction_settings_dormant_internal($1), 'PREDICTION_SETTINGS'
  )
$$;

create or replace function public.import_production_draft_projection(input jsonb)
returns jsonb
language sql
security definer
set search_path = pg_catalog, production_control
as $$
  select production_control.mark_projection_operation_response(
    public.import_production_draft_projection_dormant_internal($1), 'DRAFT'
  )
$$;

create or replace function public.import_production_net_skins_configuration(input jsonb)
returns jsonb
language sql
security definer
set search_path = pg_catalog, production_control
as $$
  select production_control.mark_projection_operation_response(
    public.import_production_net_skins_configuration_dormant_internal($1), 'NET_SKINS_CONFIGURATION'
  )
$$;

create or replace function public.import_production_calcutta_configuration(input jsonb)
returns jsonb
language sql
security definer
set search_path = pg_catalog, production_control
as $$
  select production_control.mark_projection_operation_response(
    public.import_production_calcutta_configuration_dormant_internal($1), 'CALCUTTA_CONFIGURATION'
  )
$$;

create or replace function public.import_production_published_odds(input jsonb)
returns jsonb
language sql
security definer
set search_path = pg_catalog, production_control
as $$
  select production_control.mark_projection_operation_response(
    public.import_production_published_odds_dormant_internal($1), 'PUBLISHED_ODDS'
  )
$$;

create or replace function public.inspect_production_cutover_read_state(input jsonb)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, production_control
as $$
declare
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  select * into strict activation
  from production_control.cutover_activation_state
  where scope_key = 'BAGGER_INV_PRODUCTION';
  select * into strict resource
  from production_control.resource_scope
  where scope_key = 'BAGGER_INV_PRODUCTION';
  return jsonb_build_object(
    'ok', true,
    'contract_version', activation.contract_version,
    'activation_state', activation.state,
    'activation_revision', activation.activation_revision,
    'read_cutover_phase', activation.read_cutover_phase,
    'read_source_fingerprint', activation.read_source_fingerprint,
    'public_supabase_reads_enabled', resource.public_supabase_reads_enabled,
    'current_tournament_read_authority', resource.current_tournament_read_authority,
    'scoring_authority', resource.scoring_authority,
    'participant_identity_authority', resource.participant_identity_authority,
    'scoring_ingress_enabled', resource.scoring_ingress_enabled,
    'google_writes_enabled', resource.google_writes_enabled,
    'workers_enabled', resource.workers_enabled,
    'odds_publication_enabled', resource.odds_publication_enabled,
    'first_supabase_canonical_write_possible',
      activation.first_supabase_write_possible_at is not null,
    'first_supabase_canonical_write_observed',
      activation.first_supabase_write_observed_at is not null,
    'deployment_commit', activation.expected_deployment_commit,
    'project_ref', resource.project_ref,
    'source_workbook_id', resource.google_workbook_id,
    'no_automatic_fallback', true
  );
end;
$$;

revoke all on function production_control.cutover_phase_rank(text)
  from public, anon, authenticated, service_role;
revoke all on function production_control.mark_cutover_read_response(jsonb,text)
  from public, anon, authenticated, service_role;
revoke all on function production_control.assert_production_cutover_read_scope(jsonb,text)
  from public, anon, authenticated, service_role;
revoke all on function production_control.projection_required_phase(text)
  from public, anon, authenticated, service_role;
revoke all on function production_control.assert_projection_scope(jsonb,text,text,jsonb)
  from public, anon, authenticated, service_role;
revoke all on function production_control.assert_projection_read_scope(jsonb,text,text,jsonb)
  from public, anon, authenticated, service_role;
revoke all on function production_control.read_projection(jsonb,text,text,jsonb)
  from public, anon, authenticated, service_role;
revoke all on function production_control.mark_projection_operation_response(jsonb,text)
  from public, anon, authenticated, service_role;
revoke all on function production_control.assert_projection_scope_dormant_internal(jsonb,text,text,jsonb)
  from public, anon, authenticated, service_role;
revoke all on function production_control.assert_projection_read_scope_dormant_internal(jsonb,text,text,jsonb)
  from public, anon, authenticated, service_role;

revoke all on function public.import_production_guide_projection_dormant_internal(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.import_production_player_editorial_dormant_internal(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.import_production_prediction_settings_dormant_internal(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.import_production_draft_projection_dormant_internal(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.import_production_net_skins_configuration_dormant_internal(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.import_production_calcutta_configuration_dormant_internal(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.import_production_published_odds_dormant_internal(jsonb)
  from public, anon, authenticated, service_role;

revoke all on function public.import_production_guide_projection(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.import_production_player_editorial(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.import_production_prediction_settings(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.import_production_draft_projection(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.import_production_net_skins_configuration(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.import_production_calcutta_configuration(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.import_production_published_odds(jsonb)
  from public, anon, authenticated, service_role;

revoke all on function public.set_production_cutover_read_state(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.read_production_cutover_current_view(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.read_production_cutover_completed_history(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.read_production_cutover_scoring_authority(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.read_production_cutover_scoring_participant_context(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.inspect_production_cutover_read_state(jsonb)
  from public, anon, authenticated, service_role;

grant execute on function public.set_production_cutover_read_state(jsonb) to service_role;
grant execute on function public.read_production_cutover_current_view(jsonb) to service_role;
grant execute on function public.read_production_cutover_completed_history(jsonb) to service_role;
grant execute on function public.read_production_cutover_scoring_authority(jsonb) to service_role;
grant execute on function public.read_production_cutover_scoring_participant_context(jsonb) to service_role;
grant execute on function public.inspect_production_cutover_read_state(jsonb) to service_role;
grant execute on function public.import_production_guide_projection(jsonb) to service_role;
grant execute on function public.import_production_player_editorial(jsonb) to service_role;
grant execute on function public.import_production_prediction_settings(jsonb) to service_role;
grant execute on function public.import_production_draft_projection(jsonb) to service_role;
grant execute on function public.import_production_net_skins_configuration(jsonb) to service_role;
grant execute on function public.import_production_calcutta_configuration(jsonb) to service_role;
grant execute on function public.import_production_published_odds(jsonb) to service_role;

notify pgrst, 'reload schema';
commit;
