create or replace function public.claim_intelligence_derived_bundle(input jsonb)
returns jsonb language plpgsql security definer
set search_path = scoring_authority, public, extensions, pg_temp as $$
declare target text := btrim(coalesce(input->>'tournament_id','')); actor text := left(btrim(coalesce(input->>'requested_by','')),180);
  claim_time timestamptz := clock_timestamp(); key text;
begin
  if upper(btrim(coalesce(input->>'environment',''))) <> 'PREVIEW' or target = '' or actor = '' then
    return jsonb_build_object('ok',false,'code','COMPLETE_INTELLIGENCE_CLAIM_REQUIRED'); end if;
  for key in select upper(btrim(value)) from jsonb_array_elements_text(input->'engine_keys') loop
    if key not in ('TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL','TOURNAMENT_FINAL_RECAP') then
      return jsonb_build_object('ok',false,'code','DERIVED_ENGINE_NOT_SUPPORTED'); end if;
    insert into scoring_authority.competition_recalculation_jobs(tournament_id,round_number,engine_key,status,requested_source_revision,requested_at,started_at,updated_at)
    values(target,0,key,'RUNNING',jsonb_build_object('requestedBy',actor),claim_time,claim_time,now())
    on conflict(tournament_id,round_number,engine_key) do update set status='RUNNING',requested_source_revision=excluded.requested_source_revision,
      requested_at=claim_time,started_at=claim_time,completed_at=null,last_error_code=null,last_error_safe=null,updated_at=now();
  end loop;
  return jsonb_build_object('ok',true,'claim_started_at',claim_time);
end $$;
revoke all on function public.claim_intelligence_derived_bundle(jsonb) from public,anon,authenticated;
grant execute on function public.claim_intelligence_derived_bundle(jsonb) to service_role;

-- The writer now rejects a worker superseded by a newer bundle claim.
create or replace function public.intelligence_claim_is_current(target_tournament text,target_engine text,target_claim timestamptz)
returns boolean language sql security definer set search_path=scoring_authority,public,pg_temp as $$
  select exists(select 1 from scoring_authority.competition_recalculation_jobs j where j.tournament_id=target_tournament
    and j.round_number=0 and j.engine_key=target_engine and j.status='RUNNING' and j.started_at=target_claim)
$$;
revoke all on function public.intelligence_claim_is_current(text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.intelligence_claim_is_current(text,text,timestamptz) to service_role;

create or replace function public.write_intelligence_derived_bundle(input jsonb)
returns jsonb language plpgsql security definer
set search_path = scoring_authority, public, extensions, pg_temp as $$
declare
  target_tournament text := btrim(coalesce(input->>'tournament_id',''));
  target_source text := lower(btrim(coalesce(input->>'source_fingerprint','')));
  target_actor text := left(btrim(coalesce(input->>'calculated_by','')),180);
  target_duration numeric := greatest(0,coalesce((input->>'duration_ms')::numeric,0));
  engine jsonb; target_engine_key text; target_engine_version text; payload jsonb;
  target_payload_hash text; target_claim timestamptz; snapshot_id uuid; written jsonb := '[]'::jsonb;
begin
  if upper(btrim(coalesce(input->>'environment',''))) <> 'PREVIEW' or target_tournament = '' or target_actor = ''
      or target_source !~ '^[0-9a-f]{64}$' or jsonb_typeof(input->'engines') <> 'array' then
    return jsonb_build_object('ok',false,'code','COMPLETE_INTELLIGENCE_BUNDLE_REQUIRED'); end if;
  if not exists(select 1 from scoring_authority.tournaments where tournament_id=target_tournament) then
    return jsonb_build_object('ok',false,'code','TOURNAMENT_NOT_FOUND'); end if;
  for engine in select value from jsonb_array_elements(input->'engines') loop
    target_engine_key := upper(btrim(coalesce(engine->>'key','')));
    target_engine_version := btrim(coalesce(engine->>'version',''));
    payload := coalesce(engine->'result','null'::jsonb);
    target_payload_hash := lower(btrim(coalesce(engine->>'payload_hash','')));
    begin target_claim := (engine->>'claim_started_at')::timestamptz; exception when others then target_claim := null; end;
    if target_engine_key not in ('TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL','TOURNAMENT_FINAL_RECAP')
        or target_engine_version = '' or jsonb_typeof(payload) <> 'object' or target_payload_hash !~ '^[0-9a-f]{64}$'
        or target_claim is null then
      return jsonb_build_object('ok',false,'code','INVALID_INTELLIGENCE_ENGINE_PAYLOAD'); end if;
    if target_engine_key='TOURNAMENT_FINAL_RECAP' and coalesce((input#>>'{final_gate,eligible}')::boolean,false) is not true then
      return jsonb_build_object('ok',false,'code','FINAL_RECAP_GATE_REQUIRED'); end if;
    if not public.intelligence_claim_is_current(target_tournament,target_engine_key,target_claim) then
      return jsonb_build_object('ok',false,'code','STALE_INTELLIGENCE_WORKER','superseded',true,'engineKey',target_engine_key); end if;

    select s.id into snapshot_id from scoring_authority.competition_derived_snapshots s
      where s.tournament_id=target_tournament and s.round_number=0 and s.engine_key=target_engine_key
        and s.engine_version=target_engine_version and s.source_fingerprint=target_source
        and s.payload_hash=target_payload_hash limit 1;
    update scoring_authority.competition_derived_snapshots s set is_current=false
      where s.tournament_id=target_tournament and s.round_number=0 and s.engine_key=target_engine_key
        and s.is_current and s.id is distinct from snapshot_id;
    if snapshot_id is null then
      insert into scoring_authority.competition_derived_snapshots(tournament_id,round_number,engine_key,engine_version,
        configuration_fingerprint,source_fingerprint,result_state,result_payload,payload_hash,is_current,calculated_at)
      values(target_tournament,0,target_engine_key,target_engine_version,
        encode(digest(target_engine_version||':canonical-supabase-input-v1','sha256'),'hex'),target_source,
        case when target_engine_key='TOURNAMENT_FINAL_RECAP' then 'OFFICIAL' else 'PROVISIONAL' end,
        payload,target_payload_hash,true,now()) returning id into snapshot_id;
    else update scoring_authority.competition_derived_snapshots set is_current=true,calculated_at=now() where id=snapshot_id; end if;
    insert into scoring_authority.competition_derived_runs(tournament_id,round_number,engine_key,engine_version,
      configuration_fingerprint,source_fingerprint,payload_hash,status,calculated_by,started_at,completed_at,duration_ms)
    values(target_tournament,0,target_engine_key,target_engine_version,
      encode(digest(target_engine_version||':canonical-supabase-input-v1','sha256'),'hex'),target_source,target_payload_hash,
      'SUCCEEDED',target_actor,target_claim,now(),target_duration)
    on conflict(tournament_id,round_number,engine_key,engine_version,configuration_fingerprint,source_fingerprint,payload_hash,status)
      do update set completed_at=now(),duration_ms=excluded.duration_ms;
    update scoring_authority.competition_recalculation_jobs set status='SUCCEEDED',
      requested_source_revision=jsonb_build_object('sourceFingerprint',target_source,'payloadHash',target_payload_hash),
      completed_at=now(),updated_at=now(),last_error_code=null,last_error_safe=null
      where tournament_id=target_tournament and round_number=0 and engine_key=target_engine_key
        and status='RUNNING' and started_at=target_claim;
    if not found then return jsonb_build_object('ok',false,'code','STALE_INTELLIGENCE_WORKER','superseded',true,'engineKey',target_engine_key); end if;
    written := written || jsonb_build_array(jsonb_build_object('engineKey',target_engine_key,'snapshotId',snapshot_id));
  end loop;
  insert into scoring_authority.audit_events(tournament_id,action,actor_id,metadata)
    values(target_tournament,'INTELLIGENCE_DERIVED_BUNDLE_CALCULATED',target_actor,
      jsonb_build_object('sourceFingerprint',target_source,'engines',written,'finalGate',input->'final_gate'));
  return jsonb_build_object('ok',true,'written',written,'final_gate',input->'final_gate');
end $$;
revoke all on function public.write_intelligence_derived_bundle(jsonb) from public,anon,authenticated;
grant execute on function public.write_intelligence_derived_bundle(jsonb) to service_role;
notify pgrst,'reload schema';
