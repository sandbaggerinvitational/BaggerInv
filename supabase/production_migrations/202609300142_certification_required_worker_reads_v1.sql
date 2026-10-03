-- CLI scaffold20260930200322 mapped to forward ordinal142.
-- Required worker public reads use exact current Certification resource authority.
-- Publication rows, calculation rules, withdrawal filtering and Production readers are unchanged.
begin;
create temporary table certification_worker_read_originals on commit drop as
select oid,proowner,proacl,prosecdef,proconfig,provolatile,prosrc from pg_proc where oid in(
 'public.read_published_odds_view(text,text)'::regprocedure,
 'production_control.annual_odds_publication_projection_pre_withdrawal_v1(text)'::regprocedure,
 'production_control.odds_publication_withdrawal_projection_v1(jsonb,text)'::regprocedure);
do $check$begin if encode(extensions.digest((select prosrc from pg_proc where oid=
 'production_control.annual_odds_publication_projection_pre_withdrawal_v1(text)'::regprocedure),'sha256'),'hex')<>'4c6207c819714b9c93d0c665c09403e14bc8a2886cf863cafafc729150b0e3f4'then
 raise exception 'CERTIFICATION_PUBLISHED_ODDS_PREDECESSOR_MISMATCH';end if;end;$check$;

create function production_control.assert_certification_current_projection_v1(target text,context jsonb)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare c jsonb:=production_control.current_certification_context_v1();r production_control.canonical_resource_v1%rowtype;
 p production_control.current_tournament_pointer_v1%rowtype;g production_control.future_annual_runtime_generations_v1%rowtype;
 catalog production_control.future_tournament_catalog_v1%rowtype;i production_control.certification_ingress_generations_v1%rowtype;
begin
 select * into strict r from production_control.canonical_resource_v1 where singleton;
 select * into strict p from production_control.current_tournament_pointer_v1 where scope_key=r.resource_id;
 if context is distinct from c or c->>'phase' is distinct from 'READS' or r.resource_class<>'CERTIFICATION'
  or r.database_name<>current_database() or c->>'resource_id' is distinct from r.resource_id
  or target is distinct from c->>'current_tournament_id' or target is distinct from p.tournament_id
  or c->>'pointer_revision' is distinct from p.pointer_revision::text then
  raise exception using errcode='42501',message='CERTIFICATION_READ_CONTEXT_DENIED';end if;
 if target<>'2026'then
  select * into strict g from production_control.future_annual_runtime_generations_v1 where tournament_id=target and generation_status='ACTIVE';
  select * into strict catalog from production_control.future_tournament_catalog_v1 where tournament_id=target;
  select * into strict i from production_control.certification_ingress_generations_v1
   where resource_id=r.resource_id and generation_id=g.admission_generation_id;
  if catalog.lifecycle<>'ACTIVE' or catalog.lifecycle_revision<>p.lifecycle_revision
   or g.pointer_revision<>p.pointer_revision or g.authority<>'SUPABASE'
   or g.authority_generation_id::text is distinct from c->>'authority_epoch_id'
   or i.authority_epoch_id<>g.authority_generation_id or i.tournament_id<>target or i.pointer_revision<>p.pointer_revision then
   raise exception using errcode='42501',message='CERTIFICATION_READ_CONTEXT_DENIED';end if;
 end if;
exception when no_data_found then raise exception using errcode='42501',message='CERTIFICATION_READ_CONTEXT_DENIED';
end;$$;
revoke all on function production_control.assert_certification_current_projection_v1(text,jsonb) from public,anon,authenticated,service_role;
create function production_control.canonical_published_odds_projection_v2(target text,canonical_context jsonb)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $core$
declare
  started_at timestamptz := pg_catalog.clock_timestamp();
  tournament_value scoring_authority.tournaments%rowtype;
  current_value scoring_authority.odds_publication_current%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  epoch_value uuid;activation_revision_value bigint;
  snapshots jsonb;
  history_count integer;
  publication_value jsonb;
begin
  if canonical_context is null then
    if target = '2026' then
      raise exception using errcode = '55000',message = 'PRODUCTION_ANNUAL_ODDS_TARGET_REQUIRED';
    end if;
    select value.* into strict activation from production_control.cutover_activation_state value
      where value.scope_key = 'BAGGER_INV_PRODUCTION';
    select value.* into strict generation from production_control.future_annual_runtime_generations_v1 value
      where value.tournament_id=target and value.generation_status='ACTIVE';
    epoch_value:=activation.authority_generation_id;activation_revision_value:=activation.activation_revision;
  else
    perform production_control.assert_certification_current_projection_v1(target,canonical_context);
    epoch_value:=(canonical_context->>'authority_epoch_id')::uuid;
    activation_revision_value:=(canonical_context->>'activation_revision')::bigint;
    if target<>'2026' then
      select value.* into strict generation from production_control.future_annual_runtime_generations_v1 value
       where value.tournament_id=target and value.generation_status='ACTIVE';
    end if;
  end if;
  select value.* into strict tournament_value from scoring_authority.tournaments value where value.tournament_id=target;
  select value.* into current_value
  from scoring_authority.odds_publication_current value
  where value.tournament_id = target;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'milestone', value.milestone,
    'phase_order', value.phase_order,
    'publication_revision', value.publication_revision,
    'publication_state_revision', value.publication_state_revision,
    'published_at', value.published_at,
    'payload', value.published_payload,
    'payload_hash', value.payload_hash,
    'logical_payload_hash', value.logical_payload_hash,
    'source_fingerprint', value.source_fingerprint,
    'engine_version', value.engine_version,
    'engine_metadata', value.engine_metadata,
    'settings_fingerprint', value.settings_fingerprint,
    'ratings_fingerprint', value.ratings_fingerprint,
    'pairing_fingerprint', value.pairing_fingerprint,
    'authority_contract_version', value.authority_contract_version,
    'origin_authority', value.publication_authority,
    'source_calculation_job_id', value.source_calculation_job_id,
    'published_by_player_id', value.published_by_player_id,
    'google_publication_fingerprint', null,
    'is_current_official', value.is_current_official,
    'publication_verified', value.publication_verified,
    'imported_at', value.imported_at
  ) order by value.phase_order), '[]'::jsonb), pg_catalog.count(*)
    into snapshots, history_count
  from scoring_authority.odds_published_snapshots value
  where value.tournament_id = target
    and value.is_current_for_milestone and value.publication_verified;
  if current_value.tournament_id is null then
    publication_value := pg_catalog.jsonb_build_object(
      'contract_version', 'production-odds-publication-v1',
      'authority', 'SUPABASE', 'state', 'UNPUBLISHED',
      'snapshot_id', null, 'publication_revision', 0,
      'source_calculation_revision', '{}'::jsonb,
      'published_at', null, 'published_by_player_id', null,
      'freshness', 'UNPUBLISHED', 'stale', false,
      'authority_epoch_id', epoch_value,
      'activation_revision', activation_revision_value,
      'resource_binding_fingerprint', null, 'adoption_kind', null,
      'google_publication_fallback', false, 'google_mirror', 'RETIRED',
      'runtime_generation_id', generation.runtime_generation_id
    );
  elsif current_value.publication_authority <> 'SUPABASE'
     or current_value.publication_state <> 'PUBLISHED'
     or current_value.current_snapshot_id is null
     or current_value.publication_revision < 1 then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_ODDS_PUBLICATION_STATE_INVALID';
  else
    publication_value := pg_catalog.jsonb_build_object(
      'contract_version', current_value.contract_version,
      'authority', current_value.publication_authority,
      'state', current_value.publication_state,
      'snapshot_id', current_value.current_snapshot_id,
      'publication_revision', current_value.publication_revision,
      'source_calculation_revision',
        current_value.source_calculation_revision,
      'published_at', current_value.published_at,
      'published_by_player_id', current_value.published_by_player_id,
      'freshness', current_value.freshness,
      'stale', current_value.freshness = 'STALE',
      'authority_epoch_id', current_value.authority_epoch_id,
      'activation_revision', activation_revision_value,
      'resource_binding_fingerprint',
        current_value.resource_binding_fingerprint,
      'adoption_kind', current_value.adoption_kind,
      'google_publication_fallback', false, 'google_mirror', 'RETIRED',
      'runtime_generation_id', generation.runtime_generation_id
    );
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'data', pg_catalog.jsonb_build_object(
      'tournament', pg_catalog.to_jsonb(tournament_value),
      'publication', publication_value, 'snapshots', snapshots,
      'history_count', history_count,
      'query_ms', extract(epoch from (
        pg_catalog.clock_timestamp() - started_at
      )) * 1000
    )
  );
end;
$core$;
revoke all on function production_control.canonical_published_odds_projection_v2(text,jsonb) from public,anon,authenticated,service_role;
create or replace function production_control.annual_odds_publication_projection_pre_withdrawal_v1(target text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
begin return production_control.canonical_published_odds_projection_v2(target,null);end;$$;
create function production_control.certification_published_odds_read_v1(target text,context jsonb)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
begin
 perform production_control.assert_certification_current_projection_v1(target,context);
 return production_control.odds_publication_withdrawal_projection_v1(
  production_control.canonical_published_odds_projection_v2(target,context),target);
end;$$;
revoke all on function production_control.certification_published_odds_read_v1(text,jsonb) from public,anon,authenticated,service_role;
do $check$begin if encode(extensions.digest((select prosrc from pg_proc where oid='production_control.canonical_current_view_read_v1(jsonb,jsonb)'::regprocedure),'sha256'),'hex')<>'55788c058c5991d39ba94a5318432eaf9d3a2111188051557f7b7a52f0b050cc'then raise exception 'CERTIFICATION_WORKER_READ_PREDECESSOR_MISMATCH';end if;end;$check$;
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
    if canonical_context is null then
      result_value := public.read_published_odds_view('2026', source_provenance);
    else result_value:=production_control.certification_published_odds_read_v1('2026',canonical_context);end if;
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

create function production_control.certification_worker_current_projection_v1(input jsonb,context jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare target text:=input->>'target_tournament_id';surface text:=input->>'surface';keys text[];result jsonb;
begin
 perform production_control.assert_certification_current_projection_v1(target,context);
 if jsonb_typeof(input) is distinct from 'object' or exists(select 1 from jsonb_object_keys(input)k
   where k not in('surface','target_tournament_id','engine_keys'))then
  raise exception using errcode='42501',message='CERTIFICATION_READ_TARGET_DENIED';end if;
 case surface
 when 'LEADERBOARDS'then result:=public.read_leaderboards_core_view(target);
 when 'NET_SKINS_RESULT'then result:=public.read_net_skins_result_view(target);
 when 'PUBLISHED_ODDS'then result:=production_control.certification_published_odds_read_v1(target,context);
 when 'COMPETITION_DERIVED'then
  if jsonb_typeof(input->'engine_keys') is distinct from 'array' then
   return jsonb_build_object('ok',false,'code','ENGINE_KEYS_REQUIRED');end if;
  select array_agg(value)into keys from jsonb_array_elements_text(input->'engine_keys');
  if keys is null or cardinality(keys)=0 or exists(select 1 from unnest(keys)k where k not in(
   'TEAM_MOMENTUM','TOURNAMENT_STORYLINES','CALCUTTA','TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL','TOURNAMENT_FINAL_RECAP'))then
   return jsonb_build_object('ok',false,'code','ENGINE_KEYS_INVALID');end if;
  result:=public.read_competition_derived_state(target,keys);
 else raise exception using errcode='42501',message='CERTIFICATION_FUTURE_READ_OPERATION_DENIED';end case;
 return production_control.mark_certification_read_v1(result,context);
end;$$;
revoke all on function production_control.certification_worker_current_projection_v1(jsonb,jsonb)from public,anon,authenticated,service_role;

do $patch$declare d text;before_clause text:=$old$ if (context->>'current_tournament_year')::integer>2026 then
  perform production_control.assert_current_certification_future_context_v1(context);$old$;
 after_clause text:=$new$ if (context->>'current_tournament_year')::integer>2026 then
  perform production_control.assert_current_certification_future_context_v1(context);
  if input->>'operation'='READS.CURRENT_VIEW' and payload->>'surface' in('LEADERBOARDS','NET_SKINS_RESULT','COMPETITION_DERIVED','PUBLISHED_ODDS')then
   result:=production_control.certification_worker_current_projection_v1(payload,context);
   perform production_control.pop_certification_context_v1();return result;end if;$new$;
begin
 d:=pg_get_functiondef('public.read_certification_projection_v1(jsonb)'::regprocedure);
 if (length(d)-length(replace(d,before_clause,'')))/length(before_clause)<>1 then
  raise exception 'CERTIFICATION_FUTURE_READ_PREDECESSOR_MISMATCH';end if;
 execute replace(d,before_clause,after_clause);
end;$patch$;
do $acl$declare p pg_proc%rowtype;oldrow record;begin
 for oldrow in select * from certification_worker_read_originals loop
  select * into strict p from pg_proc where oid=oldrow.oid;
  if p.proowner<>oldrow.proowner or p.proacl is distinct from oldrow.proacl or p.prosecdef<>oldrow.prosecdef
   or p.proconfig is distinct from oldrow.proconfig or p.provolatile<>oldrow.provolatile then
   raise exception 'CERTIFICATION_PUBLISHED_ODDS_PRODUCTION_ATTRIBUTES_CHANGED';end if;
  if p.oid<>'production_control.annual_odds_publication_projection_pre_withdrawal_v1(text)'::regprocedure
   and p.prosrc<>oldrow.prosrc then raise exception 'CERTIFICATION_PUBLISHED_ODDS_PRODUCTION_BODY_CHANGED';end if;
 end loop;
 for p in select * from pg_proc where pronamespace='production_control'::regnamespace and proname in(
  'assert_certification_current_projection_v1','canonical_published_odds_projection_v2',
  'certification_published_odds_read_v1','certification_worker_current_projection_v1')loop
  if p.proowner<>(select oid from pg_roles where rolname=current_user)or not p.prosecdef or p.proconfig<>array['search_path=pg_catalog']
   or exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a where a.grantee<>p.proowner and a.privilege_type='EXECUTE')then
   raise exception 'CERTIFICATION_PUBLISHED_ODDS_PRIVATE_PRIVILEGE_EXPANSION';end if;
 end loop;
end;$acl$;
commit;
