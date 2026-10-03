-- Resource-bound reads. Supabase CLI migration scaffold 20260930175349;
-- repository ordinal135. Production wrappers retain exact admission and DTOs.
begin;

create function production_control.assert_certification_read_v1(context jsonb, input jsonb)
returns production_control.canonical_resource_v1 language plpgsql security definer set search_path=pg_catalog as $$
declare verified jsonb; r production_control.canonical_resource_v1%rowtype;
begin
 verified:=production_control.current_certification_context_v1();
 if context->>'context_token' is distinct from verified->>'context_token'
   or context->>'resource_id' is distinct from verified->>'resource_id'
   or verified->>'phase' is distinct from 'READS'
   or input ?| array['authorization','resource','deployment','environment','project_ref','project_url','source_workbook_id',
     'resource_id','installation_id','activation_revision','release_commit','binding_id']
   or (input ? 'target_tournament_id' and input->>'target_tournament_id' is distinct from '2026') then
  raise exception using errcode='42501',message='CERTIFICATION_READ_CONTEXT_DENIED';
 end if;
 select * into strict r from production_control.canonical_resource_v1 where resource_id=verified->>'resource_id';
 return r;
end;
$$;
revoke all on function production_control.assert_certification_read_v1(jsonb,jsonb) from public,anon,authenticated,service_role;

create function production_control.mark_certification_read_v1(value jsonb, context jsonb)
returns jsonb language sql immutable security invoker set search_path=pg_catalog as $$
 select value||jsonb_build_object('authoritative',true,'shadow_only',false,'google_foreground_requests',0,
 'fallback_used',false,'resource_class','CERTIFICATION','activation_revision',context->'activation_revision',
 'deployment_commit',context->>'release_commit')
$$;
revoke all on function production_control.mark_certification_read_v1(jsonb,jsonb) from public,anon,authenticated,service_role;

do $check$ declare p pg_proc%rowtype; begin
 select * into strict p from pg_proc where oid='public.read_production_cutover_completed_history(jsonb)'::regprocedure;
 if p.proowner<>(select oid from pg_roles where rolname=current_user) or not p.prosecdef
  or encode(extensions.digest(p.prosrc,'sha256'),'hex')<>'694df7b2fbc230e2962bcb2e8781756fb604ebeca7ab747ac544805d4ec60514' then
  raise exception 'CANONICAL_READ_PREDECESSOR_MISMATCH: read_production_cutover_completed_history';
 end if;
end; $check$;

CREATE OR REPLACE FUNCTION production_control.canonical_completed_history_read_v1(input jsonb, canonical_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority'
AS $function$
declare
  resource production_control.resource_scope%rowtype;
  cert_resource production_control.canonical_resource_v1%rowtype;
  source_ref text; source_provenance text;
  mode_value text := upper(btrim(coalesce(input->>'mode', input->>'scope', 'YEARS')));
  target_year integer;
  revision_value uuid;
  result_value jsonb;
begin
  if canonical_context is null then
    resource := production_control.assert_production_cutover_read_scope(input, 'READ_CUTOVER');
    source_ref:=resource.project_ref; source_provenance:=resource.google_workbook_id;
  else
    cert_resource:=production_control.assert_certification_read_v1(canonical_context,input);
    source_ref:=cert_resource.project_ref; source_provenance:=cert_resource.provenance_id;
  end if;
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
    where revision.project_ref = source_ref
      and revision.source_workbook_id = source_provenance;
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
      and revision.project_ref = source_ref
      and revision.source_workbook_id = source_provenance;
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
  if canonical_context is not null then return production_control.mark_certification_read_v1(
    jsonb_build_object('ok',true,'data',result_value),canonical_context); end if;
  return production_control.mark_cutover_read_response(
    jsonb_build_object('ok', true, 'data', result_value), 'READ_CUTOVER'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.read_production_cutover_completed_history(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority'
AS $function$
begin
 return production_control.canonical_completed_history_read_v1(input,null);
end;
$function$;

revoke all on function production_control.canonical_completed_history_read_v1(jsonb,jsonb) from public,anon,authenticated,service_role;

do $check$ declare p pg_proc%rowtype; begin
 select * into strict p from pg_proc where oid='public.read_production_cutover_current_view_frozen_2026_v1(jsonb)'::regprocedure;
 if p.proowner<>(select oid from pg_roles where rolname=current_user) or not p.prosecdef
  or encode(extensions.digest(p.prosrc,'sha256'),'hex')<>'12682b521bc6ae32eba9cc2ed0564cbb5402926e3454f4d8f55ac814d2f9d864' then
  raise exception 'CANONICAL_READ_PREDECESSOR_MISMATCH: read_production_cutover_current_view_frozen_2026_v1';
 end if;
end; $check$;

CREATE OR REPLACE FUNCTION production_control.canonical_current_view_read_v1(input jsonb, canonical_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority', 'participant_identity'
AS $function$
declare
  resource production_control.resource_scope%rowtype;
  cert_resource production_control.canonical_resource_v1%rowtype;
  source_provenance text;
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
  if canonical_context is null then
    resource := production_control.assert_production_cutover_read_scope(input, required_phase);
    source_provenance:=resource.google_workbook_id;
  else
    cert_resource:=production_control.assert_certification_read_v1(canonical_context,input);
    source_provenance:=cert_resource.provenance_id;
    if surface<>'HISTORY_2026' and canonical_context->>'current_tournament_id'<>'2026' then
      raise exception using errcode='55000',message='CERTIFICATION_CURRENT_READ_POINTER_NOT_2026';
    end if;
  end if;
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
    result_value := public.read_published_odds_view('2026', source_provenance);
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
  if canonical_context is not null then return production_control.mark_certification_read_v1(result_value,canonical_context); end if;
  return production_control.mark_cutover_read_response(result_value, required_phase);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.read_production_cutover_current_view_frozen_2026_v1(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority', 'participant_identity'
AS $function$
begin
 return production_control.canonical_current_view_read_v1(input,null);
end;
$function$;

revoke all on function production_control.canonical_current_view_read_v1(jsonb,jsonb) from public,anon,authenticated,service_role;

do $check$ declare p pg_proc%rowtype; begin
 select * into strict p from pg_proc where oid='production_control.read_projection(jsonb,text,text,jsonb)'::regprocedure;
 if p.proowner<>(select oid from pg_roles where rolname=current_user) or not p.prosecdef
  or encode(extensions.digest(p.prosrc,'sha256'),'hex')<>'fd5b494299058a6285b7b327d679bd0612b193a23f49832f805ff91671f49232' then
  raise exception 'CANONICAL_READ_PREDECESSOR_MISMATCH: read_projection';
 end if;
end; $check$;

CREATE OR REPLACE FUNCTION production_control.canonical_projection_read_v1(input jsonb, expected_domain text, expected_contract text, expected_tabs jsonb, canonical_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control'
AS $function$
declare
  revision production_control.projection_revisions%rowtype;
  resource production_control.resource_scope%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  active_read boolean;
  cert_resource production_control.canonical_resource_v1%rowtype;
begin
  if canonical_context is null then
  perform production_control.assert_projection_read_scope(
    input, expected_domain, expected_contract, expected_tabs
  );
  select * into strict resource from production_control.resource_scope
  where scope_key = 'BAGGER_INV_PRODUCTION';
  select * into strict activation from production_control.cutover_activation_state
  where scope_key = 'BAGGER_INV_PRODUCTION';
  active_read := resource.public_supabase_reads_enabled;
  else
    cert_resource:=production_control.assert_certification_read_v1(canonical_context,input);
    if canonical_context->>'current_tournament_id'<>'2026'
      or input->>'domain' is distinct from expected_domain
      or input->>'contract_version' is distinct from expected_contract
      or input->'source_tabs' is distinct from expected_tabs then
      raise exception using errcode='42501',message='CERTIFICATION_PROJECTION_CONTRACT_REQUIRED';
    end if;
    active_read:=true;
  end if;
  select value.* into revision
  from production_control.projection_current pointer
  join production_control.projection_revisions value on value.revision_id = pointer.revision_id
  where pointer.domain = expected_domain and pointer.tournament_id = '2026';
  if revision.revision_id is null then
    return jsonb_build_object('ok',false,'code',expected_domain || '_PROJECTION_UNAVAILABLE');
  end if;
  if canonical_context is not null and (revision.project_ref is distinct from cert_resource.project_ref
    or revision.project_url is distinct from cert_resource.project_url
    or revision.source_workbook_id is distinct from cert_resource.provenance_id) then
    raise exception using errcode='55000',message='CERTIFICATION_PROJECTION_PROVENANCE_INVALID';
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
  'cutover_phase',case when active_read and canonical_context is null then activation.read_cutover_phase else null end,
  'activation_revision',case when canonical_context is not null then (canonical_context->>'activation_revision')::bigint when active_read then activation.activation_revision else null end,
  'deployment_commit',case when canonical_context is not null then canonical_context->>'release_commit' when active_read then activation.expected_deployment_commit else null end);
end;
$function$
;

CREATE OR REPLACE FUNCTION production_control.read_projection(input jsonb, expected_domain text, expected_contract text, expected_tabs jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control'
AS $function$
begin
 return production_control.canonical_projection_read_v1(input,expected_domain,expected_contract,expected_tabs,null);
end;
$function$;

revoke all on function production_control.canonical_projection_read_v1(jsonb,text,text,jsonb,jsonb) from public,anon,authenticated,service_role;

do $check$ declare p pg_proc%rowtype; begin
 select * into strict p from pg_proc where oid='public.read_production_guide_projection(jsonb)'::regprocedure;
 if p.proowner<>(select oid from pg_roles where rolname=current_user) or not p.prosecdef
  or encode(extensions.digest(p.prosrc,'sha256'),'hex')<>'b89790ef8319f193a8c5af7c74ad9f100e8e12015599833afa1f9ab1d0581c80' then
  raise exception 'CANONICAL_READ_PREDECESSOR_MISMATCH: read_production_guide_projection';
 end if;
end; $check$;

CREATE OR REPLACE FUNCTION production_control.canonical_guide_read_v1(input jsonb, canonical_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  result_value jsonb;
  tournament_value jsonb;
  courses_value jsonb;
begin
  -- Preserve the annual pointer and exact release/resource/service checks.
  if canonical_context is null then perform production_control.assert_frozen_2026_current_read_v1();
  elsif canonical_context->>'current_tournament_id'<>'2026' then raise exception using errcode='55000',message='CERTIFICATION_CURRENT_READ_POINTER_NOT_2026'; end if;
  result_value := production_control.canonical_projection_read_v1(input,'GUIDE','guide-projection-v1',
    '["Tournaments","Guide Sections","Tournament Itinerary","Tournament Timeline","Rule Book","Tournament Rules","Rounds","Dining","Local Guide","Important Contacts","Courses"]'::jsonb,canonical_context);
  if coalesce((result_value->>'ok')::boolean, false) is not true then
    return result_value;
  end if;
  if result_value#>>'{data,tournament_id}' is distinct from '2026'
     or result_value#>>'{data,tournament_year}' is distinct from '2026' then
    raise exception using errcode = '55000', message = 'GUIDE_CANONICAL_CONTEXT_UNAVAILABLE';
  end if;
  select pg_catalog.jsonb_build_object(
    'tournament_id', value.tournament_id,
    'tournament_year', value.tournament_year,
    'name', value.name
  ) into strict tournament_value
  from scoring_authority.tournaments value where value.tournament_id = '2026';

  -- Reuse the same canonical assignment/tee/hole reader as Guide authoring.
  -- It already handles the frozen snapshot fallback; do not duplicate it here.
  courses_value := production_control.guide_canonical_course_context_v1('2026');
  if scoring_authority.guide_course_context_is_eligible(courses_value) is not true then
    raise exception using errcode = '55000', message = 'GUIDE_CANONICAL_CONTEXT_UNAVAILABLE';
  end if;
  return pg_catalog.jsonb_set(result_value, '{data}', result_value->'data' ||
    pg_catalog.jsonb_build_object(
      'tournament', tournament_value,
      'course_context', courses_value,
      'delivery_fingerprint', pg_catalog.encode(extensions.digest(
        pg_catalog.jsonb_build_object(
          'publication', result_value#>>'{data,payload_fingerprint}',
          'tournament', tournament_value,
          'course_context', courses_value
        )::text, 'sha256'), 'hex')
    ));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.read_production_guide_projection(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
 return production_control.canonical_guide_read_v1(input,null);
end;
$function$;

revoke all on function production_control.canonical_guide_read_v1(jsonb,jsonb) from public,anon,authenticated,service_role;

do $check$ declare p pg_proc%rowtype; begin
 select * into strict p from pg_proc where oid='public.read_production_player_editorial(jsonb)'::regprocedure;
 if p.proowner<>(select oid from pg_roles where rolname=current_user) or not p.prosecdef
  or encode(extensions.digest(p.prosrc,'sha256'),'hex')<>'73832569dadae9929ea89e89d4f06f1cdfbc80d8631c70314f920a4949112577' then
  raise exception 'CANONICAL_READ_PREDECESSOR_MISMATCH: read_production_player_editorial';
 end if;
end; $check$;

CREATE OR REPLACE FUNCTION production_control.canonical_player_editorial_read_v1(input jsonb, canonical_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority'
AS $function$
declare
  result_value jsonb;
  players_value jsonb;
begin
  result_value := production_control.canonical_projection_read_v1(
    input,
    'PLAYER_EDITORIAL',
    'player-public-profile-v1',
    '["Players"]'::jsonb,canonical_context
  );

  if result_value->>'ok' is distinct from 'true'
     or pg_catalog.jsonb_typeof(
       result_value#>'{data,payload,players}'
     ) is distinct from 'array' then
    return result_value;
  end if;

  select coalesce(pg_catalog.jsonb_agg(
    case when profile.player_id is null then editorial.value
      else pg_catalog.jsonb_set(
        editorial.value,
        '{public_profile,Active}',
        pg_catalog.to_jsonb(profile.global_status = 'ACTIVE'),
        true
      )
    end order by editorial.ordinality
  ), '[]'::jsonb)
  into players_value
  from pg_catalog.jsonb_array_elements(
    result_value#>'{data,payload,players}'
  ) with ordinality as editorial(value, ordinality)
  left join production_control.player_governance_profiles_v1 profile
    on profile.player_id = pg_catalog.btrim(coalesce(
      editorial.value->>'player_id', ''
    ));

  return pg_catalog.jsonb_set(
    result_value,
    '{data,payload,players}',
    players_value,
    false
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.read_production_player_editorial(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority'
AS $function$
begin
 return production_control.canonical_player_editorial_read_v1(input,null);
end;
$function$;

revoke all on function production_control.canonical_player_editorial_read_v1(jsonb,jsonb) from public,anon,authenticated,service_role;

do $check$ declare p pg_proc%rowtype; begin
 select * into strict p from pg_proc where oid='public.read_production_draft_view_v1(jsonb)'::regprocedure;
 if p.proowner<>(select oid from pg_roles where rolname=current_user) or not p.prosecdef
  or encode(extensions.digest(p.prosrc,'sha256'),'hex')<>'f265dcd3f05ea2126f97c63763f9f062ab590819bfe06250d6660ec7bd03091a' then
  raise exception 'CANONICAL_READ_PREDECESSOR_MISMATCH: read_production_draft_view_v1';
 end if;
end; $check$;

CREATE OR REPLACE FUNCTION production_control.canonical_draft_read_v1(input jsonb, canonical_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  resource production_control.resource_scope%rowtype;
  pointer production_control.current_tournament_pointer_v1%rowtype;
  scope_value text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input->>'target_scope','YEARS')));
  selected_year integer;
  player_value text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input->>'target_player_id','')));
  drafts_value jsonb;
begin
  if canonical_context is null then
  perform production_control.assert_production_service_role();
  select value.* into strict resource from production_control.resource_scope value
  where value.scope_key='BAGGER_INV_PRODUCTION';
  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key());
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key='BAGGER_INV_PRODUCTION';
  if input->>'environment' is distinct from 'PRODUCTION'
     or input->>'project_ref' is distinct from resource.project_ref
     or input->>'project_url' is distinct from resource.project_url
     or input->>'source_workbook_id' is distinct from resource.google_workbook_id
     or input->>'contract_version' is distinct from 'draft-projection-v1'
     or input->'source_tabs' is distinct from
       '["Draft Settings","Draft Picks"]'::jsonb
     or scope_value not in ('CURRENT','YEAR','YEARS','PLAYER') then
    raise exception using errcode='42501',
      message='PRODUCTION_DRAFT_READ_SCOPE_REQUIRED';
  end if;
  else
    perform production_control.assert_certification_read_v1(canonical_context,input);
    select value.* into strict pointer from production_control.current_tournament_pointer_v1 value
     where value.scope_key=canonical_context->>'resource_id';
    if scope_value not in ('CURRENT','YEAR','YEARS','PLAYER') then
      raise exception using errcode='42501',message='CERTIFICATION_DRAFT_READ_SCOPE_REQUIRED';
    end if;
  end if;
  if scope_value='CURRENT' then
    if canonical_context is not null then
      if pointer.tournament_id<>'2026' then raise exception using errcode='55000',message='CERTIFICATION_CURRENT_READ_POINTER_NOT_2026'; end if;
    elsif pointer.tournament_id='2026' and pointer.tournament_year=2026 then
      perform production_control.assert_frozen_2026_current_read_v1();
    else
      perform production_control.assert_annual_current_read_v1(input);
    end if;
    selected_year := pointer.tournament_year;
  elsif scope_value='YEAR' then
    begin selected_year := (input->>'target_year')::integer;
    exception when others then
      raise exception using errcode='22023',message='DRAFT_YEAR_REQUIRED';
    end;
    if selected_year not between 2000 and 2200 then
      raise exception using errcode='22023',message='DRAFT_YEAR_REQUIRED';
    end if;
  elsif scope_value='PLAYER' and player_value !~ '^[A-Z0-9][A-Z0-9_-]{1,31}$' then
    raise exception using errcode='22023',message='DRAFT_PLAYER_REQUIRED';
  end if;
  select coalesce(pg_catalog.jsonb_agg(
    production_control.draft_projection_row_v1(current_value.revision_id)
    order by current_value.tournament_year),'[]'::jsonb) into drafts_value
  from scoring_authority.draft_current_revisions current_value
  where current_value.tournament_year<=pointer.tournament_year
    and ((scope_value='YEARS')
      or (scope_value in ('CURRENT','YEAR')
        and current_value.tournament_year=selected_year)
      or (scope_value='PLAYER' and exists (
        select 1 from scoring_authority.draft_pick_facts pick
        where pick.revision_id=current_value.revision_id
          and pick.player_id=player_value and pick.pick_status='SELECTED'
      )));
  return pg_catalog.jsonb_build_object(
    'ok',true,
    'data',pg_catalog.jsonb_build_object(
      'contract_version','draft-projection-v1',
      'validation_status','VALID','drafts',drafts_value,
      'authoritative',true,'shadow_only',false,
      'google_foreground_requests',0,'fallback_used',false,
      'current_tournament_id',pointer.tournament_id,
      'current_tournament_year',pointer.tournament_year
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.read_production_draft_view_v1(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
 return production_control.canonical_draft_read_v1(input,null);
end;
$function$;

revoke all on function production_control.canonical_draft_read_v1(jsonb,jsonb) from public,anon,authenticated,service_role;


do $check$ declare p pg_proc%rowtype; begin
 select * into strict p from pg_proc where oid='public.read_production_participant_context_for_auth(uuid,text)'::regprocedure;
 if p.proowner<>(select oid from pg_roles where rolname=current_user) or not p.prosecdef
  or encode(extensions.digest(p.prosrc,'sha256'),'hex')<>'a2a65e691a5b7f9722c1c458f1c91cc4cda8094f6eb7d60c541efceb428c40ab' then
  raise exception 'CANONICAL_IDENTITY_PREDECESSOR_MISMATCH: read_production_participant_context_for_auth';
 end if;
end; $check$;
CREATE OR REPLACE FUNCTION production_control.canonical_identity_for_auth_v1(target_auth_user_id uuid, target_tournament_id text, canonical_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'participant_identity', 'scoring_authority', 'public', 'auth', 'extensions', 'pg_temp'
AS $function$
declare target_tournament text := btrim(coalesce(target_tournament_id, '2026'));
declare target_player text;
declare context jsonb;
begin
  if canonical_context is null then
  perform production_control.assert_production_participant_identity_cutover();
  else
    perform production_control.assert_certification_read_v1(canonical_context,jsonb_build_object('target_tournament_id',coalesce(target_tournament_id,'2026')));
    if canonical_context->>'current_tournament_id'<>'2026' then raise exception using errcode='55000',message='CERTIFICATION_IDENTITY_POINTER_NOT_2026'; end if;
  end if;
  if target_auth_user_id is null or target_tournament <> '2026' then
    return jsonb_build_object('ok', false, 'code', 'PRODUCTION_AUTH_SCOPE_INVALID');
  end if;
  select link.player_id into target_player
  from participant_identity.user_player_links link
  join auth.users auth_user on auth_user.id = link.auth_user_id and auth_user.email_confirmed_at is not null
  join participant_identity.participant_auth_identifiers identifier
    on identifier.auth_user_id = link.auth_user_id and identifier.player_id = link.player_id
    and identifier.identifier_type = 'EMAIL' and identifier.status = 'VERIFIED'
    and lower(btrim(auth_user.email)) = identifier.normalized_value_private
  join participant_identity.participant_identity_contacts contact
    on contact.tournament_id = '2026' and contact.player_id = link.player_id
    and contact.identity_active and contact.email_normalized = identifier.normalized_value_private
  join scoring_authority.tournament_players membership
    on membership.tournament_id = contact.tournament_id and membership.player_id = contact.player_id
    and membership.participation_status = 'ACTIVE'
  where link.auth_user_id = target_auth_user_id and link.status = 'ACTIVE';
  if not found then return jsonb_build_object('ok', false, 'code', 'ACTIVE_USER_PLAYER_LINK_REQUIRED'); end if;
  context := public.read_participant_identity_context('2026', target_player);
  if coalesce((context->>'ok')::boolean, false) then
    return jsonb_set(context, '{data,authUserId}', to_jsonb(target_auth_user_id), true);
  end if;
  return context;
end;
$function$
;
revoke all on function production_control.canonical_identity_for_auth_v1(uuid,text,jsonb) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.read_production_participant_context_for_auth(target_auth_user_id uuid, target_tournament_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'participant_identity', 'scoring_authority', 'public', 'auth', 'extensions', 'pg_temp'
AS $function$
begin return production_control.canonical_identity_for_auth_v1(target_auth_user_id,target_tournament_id,null); end;
$function$;
do $check$ declare p pg_proc%rowtype; begin
 select * into strict p from pg_proc where oid='public.read_production_participant_player_context(text,text)'::regprocedure;
 if p.proowner<>(select oid from pg_roles where rolname=current_user) or not p.prosecdef
  or encode(extensions.digest(p.prosrc,'sha256'),'hex')<>'0483ad727cfd9458ce357cec54bf051ff293dc290565bf0692289a51330e473c' then
  raise exception 'CANONICAL_IDENTITY_PREDECESSOR_MISMATCH: read_production_participant_player_context';
 end if;
end; $check$;
CREATE OR REPLACE FUNCTION production_control.canonical_identity_for_player_v1(target_tournament_id text, target_player_id text, canonical_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'participant_identity', 'public', 'pg_temp'
AS $function$
declare target_user uuid;
begin
  if canonical_context is null then
  perform production_control.assert_production_participant_identity_cutover();
  else
    perform production_control.assert_certification_read_v1(canonical_context,jsonb_build_object('target_tournament_id',coalesce(target_tournament_id,'2026')));
    if canonical_context->>'current_tournament_id'<>'2026' then raise exception using errcode='55000',message='CERTIFICATION_IDENTITY_POINTER_NOT_2026'; end if;
  end if;
  if btrim(coalesce(target_tournament_id, '')) <> '2026' then
    return jsonb_build_object('ok', false, 'code', 'PRODUCTION_AUTH_SCOPE_INVALID');
  end if;
  select auth_user_id into target_user from participant_identity.user_player_links
    where player_id = btrim(target_player_id) and status = 'ACTIVE';
  if not found then return jsonb_build_object('ok', false, 'code', 'ACTIVE_USER_PLAYER_LINK_REQUIRED'); end if;
  return production_control.canonical_identity_for_auth_v1(target_user, '2026',canonical_context);
end;
$function$
;
revoke all on function production_control.canonical_identity_for_player_v1(text,text,jsonb) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.read_production_participant_player_context(target_tournament_id text, target_player_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'participant_identity', 'public', 'pg_temp'
AS $function$
begin return production_control.canonical_identity_for_player_v1(target_tournament_id,target_player_id,null); end;
$function$;
do $check$ declare p pg_proc%rowtype; begin
 select * into strict p from pg_proc where oid='public.read_production_cutover_director_entitlement(uuid,text)'::regprocedure;
 if p.proowner<>(select oid from pg_roles where rolname=current_user) or not p.prosecdef
  or encode(extensions.digest(p.prosrc,'sha256'),'hex')<>'7b851d0b410110eb9d1c17e3ca80011d1f4df04268212027f9940a620c4a2ef9' then
  raise exception 'CANONICAL_IDENTITY_PREDECESSOR_MISMATCH: read_production_cutover_director_entitlement';
 end if;
end; $check$;
CREATE OR REPLACE FUNCTION production_control.canonical_director_entitlement_read_v1(target_auth_user_id uuid, target_tournament_id text, canonical_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'participant_identity', 'public', 'auth', 'pg_temp'
AS $function$
begin
  if canonical_context is null then
  perform production_control.assert_production_participant_identity_cutover();
  else
    perform production_control.assert_certification_read_v1(canonical_context,jsonb_build_object('target_tournament_id',coalesce(target_tournament_id,'2026')));
    if canonical_context->>'current_tournament_id'<>'2026' then raise exception using errcode='55000',message='CERTIFICATION_IDENTITY_POINTER_NOT_2026'; end if;
  end if;
  if target_auth_user_id is null or btrim(coalesce(target_tournament_id, '')) <> '2026' then
    return jsonb_build_object('ok', false, 'code', 'PRODUCTION_AUTH_SCOPE_INVALID');
  end if;
  return coalesce((select jsonb_build_object(
    'ok', true, 'found', true, 'active', entitlement.status = 'ACTIVE',
    'status', entitlement.status, 'tournamentId', entitlement.tournament_id,
    'directorPlayerId', entitlement.player_id, 'role', entitlement.role,
    'revision', coalesce((select max(event.event_id)
      from production_control.director_entitlement_events event
      where event.entitlement_id = entitlement.entitlement_id), 0),
    'grantedAt', entitlement.granted_at, 'revokedAt', entitlement.revoked_at
  ) from production_control.director_entitlements entitlement
  join participant_identity.user_player_links link
    on link.auth_user_id = entitlement.auth_user_id
    and link.player_id = entitlement.player_id and link.status = 'ACTIVE'
  join auth.users auth_user
    on auth_user.id = entitlement.auth_user_id and auth_user.email_confirmed_at is not null
  where entitlement.auth_user_id = target_auth_user_id
    and entitlement.tournament_id = '2026'
    and exists (select 1 from participant_identity.tournament_roles role_row
      where role_row.tournament_id = '2026'
        and role_row.auth_user_id = entitlement.auth_user_id
        and role_row.role = 'DIRECTOR' and role_row.role_active)),
  jsonb_build_object('ok', true, 'found', false, 'active', false));
end;
$function$
;
revoke all on function production_control.canonical_director_entitlement_read_v1(uuid,text,jsonb) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.read_production_cutover_director_entitlement(target_auth_user_id uuid, target_tournament_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'participant_identity', 'public', 'auth', 'pg_temp'
AS $function$
begin return production_control.canonical_director_entitlement_read_v1(target_auth_user_id,target_tournament_id,null); end;
$function$;

create function public.read_certification_projection_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare context jsonb; payload jsonb:=coalesce(input->'payload','{}'); result jsonb;
begin
 context:=production_control.push_certification_context_v1(input,'READS',false);
 perform production_control.assert_certification_read_v1(context,payload);
 case input->>'operation'
 when 'READS.IDENTITY_FOR_AUTH' then result:=production_control.canonical_identity_for_auth_v1((payload->>'target_auth_user_id')::uuid,coalesce(payload->>'target_tournament_id','2026'),context);
 when 'READS.IDENTITY_FOR_PLAYER' then result:=production_control.canonical_identity_for_player_v1(payload->>'target_tournament_id',payload->>'target_player_id',context);
 when 'READS.DIRECTOR_ENTITLEMENT' then result:=production_control.canonical_director_entitlement_read_v1((payload->>'target_auth_user_id')::uuid,payload->>'target_tournament_id',context);
 when 'READS.CURRENT_VIEW' then result:=production_control.canonical_current_view_read_v1(payload,context);
 when 'READS.HISTORY_2026' then result:=production_control.canonical_current_view_read_v1(payload||jsonb_build_object('surface','HISTORY_2026'),context);
 when 'READS.COMPLETED_HISTORY' then result:=production_control.canonical_completed_history_read_v1(payload,context);
 when 'READS.DRAFT' then result:=production_control.canonical_draft_read_v1(payload,context);
 when 'READS.GUIDE' then result:=production_control.canonical_guide_read_v1(payload||jsonb_build_object('domain','GUIDE',
  'contract_version','guide-projection-v1','source_tabs',
  '["Tournaments","Guide Sections","Tournament Itinerary","Tournament Timeline","Rule Book","Tournament Rules","Rounds","Dining","Local Guide","Important Contacts","Courses"]'::jsonb),context);
 when 'READS.PREDICTION_SETTINGS' then result:=production_control.canonical_projection_read_v1(payload||jsonb_build_object('domain','PREDICTION_SETTINGS',
  'contract_version','prediction-settings-v1','source_tabs','["Prediction Settings"]'::jsonb),
  'PREDICTION_SETTINGS','prediction-settings-v1','["Prediction Settings"]'::jsonb,context);
 when 'READS.PLAYER_EDITORIAL' then result:=production_control.canonical_player_editorial_read_v1(payload||jsonb_build_object('domain','PLAYER_EDITORIAL',
  'contract_version','player-public-profile-v1','source_tabs','["Players"]'::jsonb),context);
 else raise exception using errcode='42501',message='CERTIFICATION_READ_OPERATION_DENIED';
 end case;
 perform production_control.pop_certification_context_v1();
 return result;
end;
$$;
revoke all on function public.read_certification_projection_v1(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.read_certification_projection_v1(jsonb) to service_role;


-- Existing fixed Production constraints become equivalent exact registered-resource
-- FKs. No data is rewritten. An unknown predecessor cannot be silently rebound.
alter table production_control.canonical_resource_v1 add constraint canonical_resource_provenance_tuple_v1 unique(project_ref,project_url,provenance_id),
 add constraint canonical_resource_history_tuple_v1 unique(project_ref,provenance_id);
alter table production_control.projection_revisions
 drop constraint projection_revisions_project_ref_check,
 drop constraint projection_revisions_project_url_check,
 drop constraint projection_revisions_source_workbook_id_check,
 add constraint projection_registered_resource_v1 foreign key(project_ref,project_url,source_workbook_id)
 references production_control.canonical_resource_v1(project_ref,project_url,provenance_id);

alter table scoring_authority.completed_history_revisions
 drop constraint completed_history_revisions_project_ref_check,
 drop constraint completed_history_revisions_source_workbook_id_check,
 add constraint completed_history_revisions_registered_resource_v1 foreign key(project_ref,source_workbook_id)
 references production_control.canonical_resource_v1(project_ref,provenance_id);

alter table scoring_authority.completed_history_current_revisions
 drop constraint completed_history_current_revisions_project_ref_check,
 drop constraint completed_history_current_revisions_source_workbook_id_check,
 add constraint completed_history_current_revisions_registered_resource_v1 foreign key(project_ref,source_workbook_id)
 references production_control.canonical_resource_v1(project_ref,provenance_id);

alter table scoring_authority.draft_revisions
 drop constraint draft_revisions_project_ref_check,
 drop constraint draft_revisions_source_workbook_id_check,
 add constraint draft_revisions_registered_resource_v1 foreign key(project_ref,source_workbook_id)
 references production_control.canonical_resource_v1(project_ref,provenance_id);

alter table scoring_authority.guide_content_revisions
 drop constraint guide_content_revisions_source_workbook_id_check1,
 add constraint guide_content_revisions_registered_provenance_v1 foreign key(source_workbook_id)
 references production_control.canonical_resource_v1(provenance_id);

alter table scoring_authority.guide_projection_current
 drop constraint guide_projection_current_source_workbook_id_check1,
 add constraint guide_projection_current_registered_provenance_v1 foreign key(source_workbook_id)
 references production_control.canonical_resource_v1(provenance_id);


-- Older annual-resource history can contain dormant destinations. Preserve the
-- Production contract; Certification can bind only its registered local resource.
create function production_control.guard_certification_future_resource_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare r production_control.canonical_resource_v1%rowtype;
begin
 select * into r from production_control.canonical_resource_v1 where singleton;
 if r.resource_class='CERTIFICATION' and (new.project_ref is distinct from r.project_ref
  or new.project_url is distinct from r.project_url
  or new.source_workbook_id is distinct from r.provenance_id
  or new.google_compatibility_policy<>'RETIRED') then
  raise exception using errcode='42501',message='CERTIFICATION_FUTURE_RESOURCE_DENIED';
 end if;
 return new;
end;
$$;
revoke all on function production_control.guard_certification_future_resource_v1() from public,anon,authenticated,service_role;
create trigger guard_certification_future_resource before insert or update on production_control.future_tournament_resources_v1
 for each row execute function production_control.guard_certification_future_resource_v1();
commit;
