-- Step 10B: bounded, service-role-only reads for the isolated Production-shadow
-- candidate. These functions never change authority, enqueue work, recalculate,
-- publish, archive, mirror, or mutate canonical data.

begin;

create or replace function production_control.assert_candidate_read_scope(input jsonb)
returns production_control.resource_scope
language plpgsql
security definer
stable
set search_path = pg_catalog, production_control, auth, pg_temp
as $$
declare
  scope production_control.resource_scope%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'PRODUCTION_CANDIDATE_SERVICE_ROLE_REQUIRED';
  end if;
  select value.* into scope
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if scope.scope_key is null
     or upper(btrim(coalesce(input->>'environment', ''))) <> 'PRODUCTION'
     or btrim(coalesce(input->>'project_ref', '')) <> scope.project_ref
     or btrim(coalesce(input->>'project_url', '')) <> scope.project_url
     or btrim(coalesce(input->>'source_workbook_id', '')) <> scope.google_workbook_id
     or btrim(coalesce(input->>'tournament_id', '')) <> '2026'
     or scope.project_ref <> 'ymqhhtxaywtqllynrmxe'
     or scope.project_url <> 'https://ymqhhtxaywtqllynrmxe.supabase.co'
     or scope.google_workbook_id <> '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
     or scope.vercel_project <> 'bagger-inv'
     or scope.canonical_domain <> 'https://baggerinv.com'
     or scope.current_tournament_read_authority <> 'GOOGLE'
     or scope.scoring_authority <> 'GOOGLE'
     or scope.participant_identity_authority <> 'PASSPORT'
     or scope.public_supabase_reads_enabled
     or scope.scoring_ingress_enabled
     or scope.google_writes_enabled
     or scope.auth_user_creation_enabled
     or scope.odds_publication_enabled
     or scope.workers_enabled
     or exists (
       select 1 from production_control.worker_controls worker
       where worker.enabled or worker.scheduler_installed or worker.google_writes_allowed
     ) then
    raise exception using errcode = '42501', message = 'PRODUCTION_CANDIDATE_DORMANT_SCOPE_REQUIRED';
  end if;
  return scope;
end;
$$;

revoke all on function production_control.assert_candidate_read_scope(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.read_production_candidate_current_view(input jsonb)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, production_control, scoring_authority, participant_identity, public, auth, extensions, pg_temp
as $$
declare
  scope production_control.resource_scope%rowtype;
  surface text := upper(btrim(coalesce(input->>'surface', '')));
  player_id_value text := btrim(coalesce(input->>'player_id', ''));
  match_id_value text := btrim(coalesce(input->>'match_id', ''));
  engine_keys_value text[];
  current_value jsonb;
  finalized_value jsonb;
begin
  scope := production_control.assert_candidate_read_scope(input);
  if surface in ('TOURNAMENT_LIVE', 'LEADERBOARDS') then
    return public.read_leaderboards_core_view('2026');
  elsif surface = 'HISTORY_2026' then
    -- Reuse the bounded current-state view, but add only the immutable current
    -- finalized snapshots required by the History adapter.  The JavaScript
    -- adapter translates `snapshot` to `scoring_snapshot` and copies the
    -- already-bounded hole definitions; no calculation or mutation occurs.
    current_value := public.read_leaderboards_core_view('2026');
    if not coalesce((current_value->>'ok')::boolean, false) then return current_value; end if;
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
    where finalized.tournament_id = '2026'
      and finalized.state = 'CURRENT'
      and match_value.status = 'FINAL'
      and finalized.match_revision = match_value.match_revision
      and finalized.scoring_snapshot_id = match_value.scoring_snapshot_id;
    return jsonb_set(
      jsonb_set(current_value, '{data,schema_version}', '"production-2026-history-shadow-v1"'::jsonb, true),
      '{data,finalized_snapshots}', finalized_value, true
    );
  elsif surface = 'PARTICIPANT_HOME' then
    if player_id_value = '' then return jsonb_build_object('ok', false, 'code', 'PLAYER_ID_REQUIRED'); end if;
    return public.read_participant_home_view('2026', player_id_value);
  elsif surface = 'MY_MATCH' then
    if player_id_value = '' then return jsonb_build_object('ok', false, 'code', 'PLAYER_ID_REQUIRED'); end if;
    return public.read_my_match_view('2026', player_id_value);
  elsif surface = 'GAME_CENTER' then
    if match_id_value = '' or not exists (
      select 1 from scoring_authority.matches match_value
      where match_value.match_id = match_id_value and match_value.tournament_id = '2026'
    ) then return jsonb_build_object('ok', false, 'code', 'PRODUCTION_MATCH_NOT_FOUND'); end if;
    return public.read_game_center_view(match_id_value);
  elsif surface = 'MATCH_AUTHORIZATION' then
    return public.read_match_authorization_matrix('2026');
  elsif surface = 'NET_SKINS_INPUT' then
    return public.read_net_skins_input_view('2026');
  elsif surface = 'NET_SKINS_RESULT' then
    return public.read_net_skins_result_view('2026');
  elsif surface = 'CALCUTTA_CONFIGURATION' then
    return public.read_calcutta_configuration_view('2026');
  elsif surface = 'PUBLISHED_ODDS' then
    return public.read_published_odds_view('2026', scope.google_workbook_id);
  elsif surface = 'ODDS_INPUT' then
    return public.read_championship_odds_inputs('2026');
  elsif surface = 'PARTICIPANT_IDENTITY' then
    if player_id_value = '' then return jsonb_build_object('ok', false, 'code', 'PLAYER_ID_REQUIRED'); end if;
    return public.read_participant_identity_context('2026', player_id_value);
  elsif surface = 'COMPETITION_DERIVED' then
    if jsonb_typeof(input->'engine_keys') <> 'array' then
      return jsonb_build_object('ok', false, 'code', 'ENGINE_KEYS_REQUIRED');
    end if;
    select array_agg(value) into engine_keys_value
    from jsonb_array_elements_text(input->'engine_keys') value;
    if engine_keys_value is null or cardinality(engine_keys_value) = 0 or exists (
      select 1 from unnest(engine_keys_value) value
      where value not in (
        'TEAM_MOMENTUM', 'TOURNAMENT_STORYLINES', 'CALCUTTA',
        'TOURNAMENT_INTELLIGENCE', 'PROJECTION_EDITORIAL', 'TOURNAMENT_FINAL_RECAP'
      )
    ) then return jsonb_build_object('ok', false, 'code', 'ENGINE_KEYS_INVALID'); end if;
    return public.read_competition_derived_state('2026', engine_keys_value);
  end if;
  return jsonb_build_object('ok', false, 'code', 'PRODUCTION_CANDIDATE_SURFACE_NOT_ALLOWED');
end;
$$;

revoke all on function public.read_production_candidate_current_view(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.read_production_candidate_current_view(jsonb) to service_role;

create or replace function public.read_production_candidate_completed_history(input jsonb)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, production_control, scoring_authority, public, auth, extensions, pg_temp
as $$
declare
  scope production_control.resource_scope%rowtype;
  mode_value text := upper(btrim(coalesce(input->>'mode', input->>'scope', 'YEARS')));
  target_year integer;
  revision_value uuid;
  result_value jsonb;
begin
  scope := production_control.assert_candidate_read_scope(input);
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
    join scoring_authority.completed_history_revisions revision on revision.revision_id = current_pointer.revision_id
    join scoring_authority.tournaments tournament on tournament.tournament_id = revision.tournament_id
    join scoring_authority.completed_history_tournament_facts fact on fact.revision_id = revision.revision_id
    where revision.project_ref = scope.project_ref and revision.source_workbook_id = scope.google_workbook_id;
  elsif mode_value = 'YEAR' then
    begin target_year := coalesce(input->>'tournament_year', input->>'year')::integer;
    exception when others then return jsonb_build_object('ok', false, 'code', 'HISTORICAL_YEAR_REQUIRED'); end;
    if target_year not between 2017 and 2025 then
      return jsonb_build_object('ok', false, 'code', 'HISTORICAL_YEAR_REQUIRED');
    end if;
    select current_pointer.revision_id into revision_value
    from scoring_authority.completed_history_current_revisions current_pointer
    join scoring_authority.completed_history_revisions revision on revision.revision_id = current_pointer.revision_id
    where current_pointer.tournament_year = target_year
      and revision.project_ref = scope.project_ref and revision.source_workbook_id = scope.google_workbook_id;
    if revision_value is null then return jsonb_build_object('ok', false, 'code', 'HISTORICAL_YEAR_NOT_CERTIFIED'); end if;
    select jsonb_build_object(
      'revision', to_jsonb(revision),
      'tournament', to_jsonb(tournament) || to_jsonb(fact),
      'players', coalesce((
        select jsonb_agg(jsonb_build_object('player_id', player.player_id, 'display_name', player.display_name) order by player.player_id)
        from scoring_authority.completed_history_roster_facts roster
        join scoring_authority.players player on player.player_id = roster.player_id
        where roster.revision_id = revision_value
      ), '[]'::jsonb),
      'teams', coalesce((
        select jsonb_agg(to_jsonb(team_fact) order by team_fact.team_side)
        from scoring_authority.completed_history_team_facts team_fact where team_fact.revision_id = revision_value
      ), '[]'::jsonb),
      'roster', coalesce((
        select jsonb_agg(to_jsonb(roster) order by roster.team_side, roster.display_name, roster.player_id)
        from scoring_authority.completed_history_roster_facts roster where roster.revision_id = revision_value
      ), '[]'::jsonb),
      'rounds', coalesce((
        select jsonb_agg(to_jsonb(round_fact) order by round_fact.round_number)
        from scoring_authority.completed_history_round_facts round_fact where round_fact.revision_id = revision_value
      ), '[]'::jsonb),
      'courses', coalesce((
        select jsonb_agg(jsonb_build_object('course_id', course.course_id,
          'canonical_name', course.canonical_name, 'canonical_location', course.canonical_location) order by course.course_id)
        from (select distinct appearance.course_id from scoring_authority.completed_history_course_appearances appearance
          where appearance.revision_id = revision_value) year_course
        join scoring_authority.completed_history_course_identities course on course.course_id = year_course.course_id
      ), '[]'::jsonb),
      'course_appearances', coalesce((
        select jsonb_agg(to_jsonb(appearance) || jsonb_build_object(
          'canonical_name', course.canonical_name, 'canonical_location', course.canonical_location) order by appearance.round_number)
        from scoring_authority.completed_history_course_appearances appearance
        join scoring_authority.completed_history_course_identities course on course.course_id = appearance.course_id
        where appearance.revision_id = revision_value
      ), '[]'::jsonb),
      'matches', coalesce((
        select jsonb_agg(to_jsonb(match_value) order by match_value.round_number, match_value.match_id)
        from scoring_authority.completed_history_matches match_value where match_value.revision_id = revision_value
      ), '[]'::jsonb),
      'match_participants', coalesce((
        select jsonb_agg(to_jsonb(participant) order by participant.match_id, participant.team_side, participant.player_slot)
        from scoring_authority.completed_history_match_participants participant where participant.revision_id = revision_value
      ), '[]'::jsonb),
      'scorecards', coalesce((
        select jsonb_agg(to_jsonb(scorecard) order by scorecard.match_id, scorecard.scorecard_id)
        from scoring_authority.completed_history_scorecards scorecard where scorecard.revision_id = revision_value
      ), '[]'::jsonb),
      'awards', coalesce((
        select jsonb_agg(to_jsonb(award) order by award.award_type, award.award_id)
        from scoring_authority.completed_history_awards award where award.revision_id = revision_value
      ), '[]'::jsonb),
      'record_eligibility', coalesce((
        select jsonb_agg(to_jsonb(eligibility) order by eligibility.match_id, eligibility.player_id)
        from scoring_authority.completed_history_record_eligibility eligibility where eligibility.revision_id = revision_value
      ), '[]'::jsonb),
      'corrections', coalesce((
        select jsonb_agg(to_jsonb(correction) order by correction.correction_id)
        from scoring_authority.completed_history_correction_applications correction where correction.revision_id = revision_value
      ), '[]'::jsonb)
    ) into result_value
    from scoring_authority.completed_history_revisions revision
    join scoring_authority.tournaments tournament on tournament.tournament_id = revision.tournament_id
    join scoring_authority.completed_history_tournament_facts fact on fact.revision_id = revision.revision_id
    where revision.revision_id = revision_value;
  else
    return jsonb_build_object('ok', false, 'code', 'PRODUCTION_CANDIDATE_HISTORY_MODE_NOT_ALLOWED');
  end if;
  return jsonb_build_object('ok', true, 'data', result_value,
    'google_foreground_requests', 0, 'fallback_used', false, 'shadow_only', true);
end;
$$;

revoke all on function public.read_production_candidate_completed_history(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.read_production_candidate_completed_history(jsonb) to service_role;

create or replace function public.inspect_production_candidate_read_security()
returns jsonb
language sql
security definer
stable
set search_path = pg_catalog, public, scoring_authority, production_control, pg_temp
as $$
  select jsonb_build_object(
    'ok',
      not has_function_privilege('anon', 'public.read_production_candidate_current_view(jsonb)', 'execute')
      and not has_function_privilege('authenticated', 'public.read_production_candidate_current_view(jsonb)', 'execute')
      and has_function_privilege('service_role', 'public.read_production_candidate_current_view(jsonb)', 'execute')
      and not has_function_privilege('anon', 'public.read_production_candidate_completed_history(jsonb)', 'execute')
      and not has_function_privilege('authenticated', 'public.read_production_candidate_completed_history(jsonb)', 'execute')
      and has_function_privilege('service_role', 'public.read_production_candidate_completed_history(jsonb)', 'execute'),
    'anon_current_execute', has_function_privilege('anon', 'public.read_production_candidate_current_view(jsonb)', 'execute'),
    'authenticated_current_execute', has_function_privilege('authenticated', 'public.read_production_candidate_current_view(jsonb)', 'execute'),
    'service_current_execute', has_function_privilege('service_role', 'public.read_production_candidate_current_view(jsonb)', 'execute'),
    'anon_history_execute', has_function_privilege('anon', 'public.read_production_candidate_completed_history(jsonb)', 'execute'),
    'authenticated_history_execute', has_function_privilege('authenticated', 'public.read_production_candidate_completed_history(jsonb)', 'execute'),
    'service_history_execute', has_function_privilege('service_role', 'public.read_production_candidate_completed_history(jsonb)', 'execute'),
    'public_scoring_table_select', has_table_privilege('anon', 'scoring_authority.matches', 'select')
  );
$$;

revoke all on function public.inspect_production_candidate_read_security()
  from public, anon, authenticated, service_role;
grant execute on function public.inspect_production_candidate_read_security() to service_role;

notify pgrst, 'reload schema';
commit;
