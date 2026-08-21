-- Preview-only Odds publication hardening. The rehearsal branch executes the
-- real publication and mirror-job state machine inside a subtransaction and
-- deliberately rolls it back, so official snapshots and Google reporting rows
-- are never changed by certification.

create or replace function public.claim_preview_championship_odds_google_mirror(input jsonb) returns jsonb
language plpgsql security definer set search_path=scoring_authority,public,extensions,pg_temp as $$
declare
  target_snapshot uuid;
  actor text:=btrim(coalesce(input->>'actor_id',''));
  mirror_job scoring_authority.odds_google_mirror_jobs%rowtype;
  snapshot_row scoring_authority.odds_published_snapshots%rowtype;
begin
  if upper(btrim(coalesce(input->>'environment',''))) <> 'PREVIEW' then
    return jsonb_build_object('ok',false,'code','PREVIEW_ENVIRONMENT_REQUIRED');
  end if;
  if actor='' then return jsonb_build_object('ok',false,'code','ODDS_GOOGLE_MIRROR_ACTOR_REQUIRED'); end if;
  begin target_snapshot:=(input->>'snapshot_id')::uuid;
  exception when others then return jsonb_build_object('ok',false,'code','ODDS_GOOGLE_MIRROR_SNAPSHOT_REQUIRED'); end;

  select * into mirror_job from scoring_authority.odds_google_mirror_jobs where snapshot_id=target_snapshot for update;
  if mirror_job.id is null then return jsonb_build_object('ok',false,'code','ODDS_GOOGLE_MIRROR_JOB_NOT_FOUND'); end if;
  select * into snapshot_row from scoring_authority.odds_published_snapshots where id=target_snapshot;
  if snapshot_row.id is null then return jsonb_build_object('ok',false,'code','ODDS_PUBLICATION_NOT_FOUND'); end if;

  if mirror_job.status='SUCCEEDED' then
    return jsonb_build_object('ok',true,'deliver',false,'duplicate',true,'snapshot_id',target_snapshot,
      'status','SUCCEEDED','attempt_count',mirror_job.attempt_count);
  end if;
  if mirror_job.status='RUNNING' and mirror_job.updated_at > now()-interval '5 minutes' then
    return jsonb_build_object('ok',false,'code','ODDS_GOOGLE_MIRROR_IN_PROGRESS','retryable',true,
      'snapshot_id',target_snapshot,'attempt_count',mirror_job.attempt_count);
  end if;

  update scoring_authority.odds_google_mirror_jobs set status='RUNNING',attempt_count=attempt_count+1,
    last_error_safe=null,updated_at=now() where id=mirror_job.id returning * into mirror_job;
  insert into scoring_authority.audit_events(tournament_id,action,actor_id,metadata)
  values(mirror_job.tournament_id,'CHAMPIONSHIP_ODDS_GOOGLE_MIRROR_ATTEMPTED',actor,
    jsonb_build_object('snapshotId',target_snapshot,'attemptCount',mirror_job.attempt_count));
  return jsonb_build_object('ok',true,'deliver',true,'duplicate',false,'snapshot_id',target_snapshot,
    'job_id',mirror_job.id,'status','RUNNING','attempt_count',mirror_job.attempt_count,
    'tournament_id',snapshot_row.tournament_id,'milestone',snapshot_row.milestone,
    'publication_revision',snapshot_row.publication_revision,'published_payload',snapshot_row.published_payload,
    'payload_hash',snapshot_row.payload_hash);
end; $$;

create or replace function public.complete_preview_championship_odds_google_mirror(input jsonb) returns jsonb
language plpgsql security definer set search_path=scoring_authority,public,extensions,pg_temp as $$
declare
  target_snapshot uuid;
  target_status text:=upper(btrim(coalesce(input->>'status','')));
  actor text:=btrim(coalesce(input->>'actor_id',''));
  mirror_fingerprint text:=lower(btrim(coalesce(input->>'google_publication_fingerprint','')));
  mirror_job scoring_authority.odds_google_mirror_jobs%rowtype;
  snapshot_row scoring_authority.odds_published_snapshots%rowtype;
begin
  if upper(btrim(coalesce(input->>'environment',''))) <> 'PREVIEW' then
    return jsonb_build_object('ok',false,'code','PREVIEW_ENVIRONMENT_REQUIRED');
  end if;
  if actor='' or target_status not in ('SUCCEEDED','FAILED') then
    return jsonb_build_object('ok',false,'code','COMPLETE_GOOGLE_MIRROR_RESULT_REQUIRED');
  end if;
  if target_status='SUCCEEDED' and mirror_fingerprint !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok',false,'code','GOOGLE_MIRROR_FINGERPRINT_REQUIRED');
  end if;
  begin target_snapshot:=(input->>'snapshot_id')::uuid;
  exception when others then return jsonb_build_object('ok',false,'code','ODDS_GOOGLE_MIRROR_SNAPSHOT_REQUIRED'); end;

  select * into mirror_job from scoring_authority.odds_google_mirror_jobs where snapshot_id=target_snapshot for update;
  if mirror_job.id is null then return jsonb_build_object('ok',false,'code','ODDS_GOOGLE_MIRROR_JOB_NOT_FOUND'); end if;
  select * into snapshot_row from scoring_authority.odds_published_snapshots where id=target_snapshot for update;
  if mirror_job.status='SUCCEEDED' then
    if target_status='SUCCEEDED' and snapshot_row.google_publication_fingerprint=mirror_fingerprint then
      return jsonb_build_object('ok',true,'changed',false,'duplicate',true,'snapshot_id',target_snapshot,
        'status','SUCCEEDED','attempt_count',mirror_job.attempt_count);
    end if;
    return jsonb_build_object('ok',false,'code','ODDS_GOOGLE_MIRROR_ALREADY_VERIFIED');
  end if;
  if mirror_job.status<>'RUNNING' then
    return jsonb_build_object('ok',false,'code','ODDS_GOOGLE_MIRROR_CLAIM_REQUIRED','retryable',true);
  end if;

  update scoring_authority.odds_google_mirror_jobs set status=target_status,
    last_error_safe=case when target_status='FAILED' then left(btrim(coalesce(input->>'error_safe','Google reporting mirror is delayed.')),400) else null end,
    updated_at=now() where id=mirror_job.id returning * into mirror_job;
  update scoring_authority.odds_published_snapshots set mirror_status=target_status,
    google_publication_fingerprint=case when target_status='SUCCEEDED' then mirror_fingerprint else google_publication_fingerprint end,
    google_publication_reference=case when target_status='SUCCEEDED' then coalesce(input->'google_publication_reference','{}'::jsonb) else google_publication_reference end
  where id=target_snapshot returning * into snapshot_row;
  insert into scoring_authority.audit_events(tournament_id,action,actor_id,metadata)
  values(mirror_job.tournament_id,
    case when target_status='SUCCEEDED' then 'CHAMPIONSHIP_ODDS_GOOGLE_MIRROR_VERIFIED' else 'CHAMPIONSHIP_ODDS_GOOGLE_MIRROR_FAILED' end,
    actor,jsonb_build_object('snapshotId',target_snapshot,'attemptCount',mirror_job.attempt_count,'status',target_status));
  return jsonb_build_object('ok',true,'changed',true,'duplicate',false,'snapshot_id',target_snapshot,
    'status',target_status,'attempt_count',mirror_job.attempt_count,'retryable',target_status='FAILED');
end; $$;

create or replace function public.read_preview_championship_odds_publication_diagnostics(target_tournament_id text) returns jsonb
language plpgsql security definer stable set search_path=scoring_authority,public,extensions,pg_temp as $$
declare snapshots jsonb; jobs jsonb; current_config jsonb;
begin
  if btrim(coalesce(target_tournament_id,''))='' then return jsonb_build_object('ok',false,'code','TOURNAMENT_SCOPE_REQUIRED'); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'snapshot_id',s.id,'milestone',s.milestone,'phase_order',s.phase_order,'publication_revision',s.publication_revision,
    'published_at',s.published_at,'payload_hash',s.payload_hash,'logical_payload_hash',s.logical_payload_hash,
    'source_fingerprint',s.source_fingerprint,'settings_fingerprint',s.settings_fingerprint,
    'ratings_fingerprint',s.ratings_fingerprint,'pairing_fingerprint',s.pairing_fingerprint,
    'engine_version',s.engine_version,'deterministic_seed',s.deterministic_seed,
    'is_current_for_milestone',s.is_current_for_milestone,'is_current_official',s.is_current_official,
    'publication_verified',s.publication_verified,'mirror_status',s.mirror_status,
    'google_publication_fingerprint',s.google_publication_fingerprint)
    order by s.phase_order,s.publication_revision), '[]'::jsonb) into snapshots
  from scoring_authority.odds_published_snapshots s where s.tournament_id=target_tournament_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'event_id',j.id,'snapshot_id',j.snapshot_id,'status',j.status,'attempt_count',j.attempt_count,
    'last_error_safe',j.last_error_safe,'created_at',j.created_at,'updated_at',j.updated_at)
    order by j.created_at), '[]'::jsonb) into jobs
  from scoring_authority.odds_google_mirror_jobs j where j.tournament_id=target_tournament_id;
  select to_jsonb(c) into current_config from scoring_authority.odds_input_configurations c
    where c.tournament_id=target_tournament_id and c.is_current;
  return jsonb_build_object('ok',true,'data',jsonb_build_object('tournament_id',target_tournament_id,
    'snapshots',snapshots,'mirror_jobs',jobs,'current_input_configuration',current_config));
end; $$;

create or replace function public.publish_preview_championship_odds(input jsonb) returns jsonb
language plpgsql security definer set search_path=scoring_authority,public,extensions,pg_temp as $$
declare
  target text:=btrim(coalesce(input->>'tournament_id',''));
  phase text:=btrim(coalesce(input->>'milestone',''));
  actor text:=btrim(coalesce(input->>'actor_id',''));
  rehearsal boolean:=coalesce((input->>'rehearsal')::boolean,false);
  existing_id uuid; snapshot_id uuid; next_revision bigint; published_at timestamptz;
  current_config scoring_authority.odds_input_configurations%rowtype; current_state jsonb;
  before_state jsonb; after_state jsonb; simulated_state jsonb;
  publication_result jsonb; duplicate_publication jsonb; first_claim jsonb; failed_delivery jsonb;
  retry_claim jsonb; successful_delivery jsonb; duplicate_claim jsonb;
  rehearsal_pass boolean:=false;
begin
  if rehearsal then
    select jsonb_build_object(
      'snapshots',coalesce((select jsonb_agg(to_jsonb(s) order by s.phase_order,s.publication_revision) from scoring_authority.odds_published_snapshots s where s.tournament_id=target),'[]'::jsonb),
      'mirror_jobs',coalesce((select jsonb_agg(to_jsonb(j) order by j.created_at) from scoring_authority.odds_google_mirror_jobs j where j.tournament_id=target),'[]'::jsonb))
      into before_state;
    begin
      publication_result:=public.publish_preview_championship_odds(input-'rehearsal');
      if coalesce((publication_result->>'ok')::boolean,false) and coalesce((publication_result->>'changed')::boolean,false) then
        first_claim:=public.claim_preview_championship_odds_google_mirror(jsonb_build_object(
          'environment','PREVIEW','snapshot_id',publication_result->>'snapshot_id','actor_id',actor));
        failed_delivery:=public.complete_preview_championship_odds_google_mirror(jsonb_build_object(
          'environment','PREVIEW','snapshot_id',publication_result->>'snapshot_id','actor_id',actor,
          'status','FAILED','error_safe','Injected rehearsal failure; no Google request was sent.'));
        retry_claim:=public.claim_preview_championship_odds_google_mirror(jsonb_build_object(
          'environment','PREVIEW','snapshot_id',publication_result->>'snapshot_id','actor_id',actor));
        successful_delivery:=public.complete_preview_championship_odds_google_mirror(jsonb_build_object(
          'environment','PREVIEW','snapshot_id',publication_result->>'snapshot_id','actor_id',actor,
          'status','SUCCEEDED','google_publication_fingerprint',
            case when coalesce(input->>'rehearsal_google_publication_fingerprint','') ~ '^[0-9a-f]{64}$'
              then input->>'rehearsal_google_publication_fingerprint' else input->>'payload_hash' end,
          'google_publication_reference',jsonb_build_object('rehearsal',true,'googleWrites',0)));
        duplicate_publication:=public.publish_preview_championship_odds(input-'rehearsal');
        duplicate_claim:=public.claim_preview_championship_odds_google_mirror(jsonb_build_object(
          'environment','PREVIEW','snapshot_id',publication_result->>'snapshot_id','actor_id',actor));
      end if;
      select jsonb_build_object(
        'stored_snapshot_count',(select count(*) from scoring_authority.odds_published_snapshots s where s.tournament_id=target),
        'active_milestone_count',(select count(*) from scoring_authority.odds_published_snapshots s where s.tournament_id=target and s.is_current_for_milestone),
        'current_official',(select jsonb_build_object('snapshot_id',s.id,'milestone',s.milestone,'publication_revision',s.publication_revision,'payload_hash',s.payload_hash)
          from scoring_authority.odds_published_snapshots s where s.tournament_id=target and s.is_current_official),
        'mirror_job',(select to_jsonb(j) from scoring_authority.odds_google_mirror_jobs j where j.snapshot_id=(publication_result->>'snapshot_id')::uuid))
        into simulated_state;
      rehearsal_pass:=coalesce((publication_result->>'changed')::boolean,false)
        and coalesce((first_claim->>'deliver')::boolean,false)
        and failed_delivery->>'status'='FAILED'
        and coalesce((retry_claim->>'deliver')::boolean,false)
        and successful_delivery->>'status'='SUCCEEDED'
        and coalesce((duplicate_publication->>'duplicate')::boolean,false)
        and coalesce((duplicate_claim->>'duplicate')::boolean,false);
      raise exception using errcode='P4B01',message='CHAMPIONSHIP_ODDS_PUBLICATION_REHEARSAL_ROLLBACK';
    exception when sqlstate 'P4B01' then null;
    end;
    select jsonb_build_object(
      'snapshots',coalesce((select jsonb_agg(to_jsonb(s) order by s.phase_order,s.publication_revision) from scoring_authority.odds_published_snapshots s where s.tournament_id=target),'[]'::jsonb),
      'mirror_jobs',coalesce((select jsonb_agg(to_jsonb(j) order by j.created_at) from scoring_authority.odds_google_mirror_jobs j where j.tournament_id=target),'[]'::jsonb))
      into after_state;
    return jsonb_build_object('ok',rehearsal_pass and before_state=after_state,'rehearsal',true,'google_writes',0,
      'publication',publication_result,'first_claim',first_claim,'failed_delivery',failed_delivery,
      'retry_claim',retry_claim,'successful_delivery',successful_delivery,
      'duplicate_publication',duplicate_publication,'duplicate_claim',duplicate_claim,
      'simulated_state',simulated_state,'rollback',jsonb_build_object('performed',true,'official_state_unchanged',before_state=after_state));
  end if;

  if upper(btrim(coalesce(input->>'environment',''))) <> 'PREVIEW' then return jsonb_build_object('ok',false,'code','PREVIEW_ENVIRONMENT_REQUIRED'); end if;
  if target='' or actor='' or phase not in ('Pre-Tournament','After Round 1','After Round 2','Round 3 Pairings Announced','Final Results')
    or coalesce(input->>'payload_hash','') !~ '^[0-9a-f]{64}$' or coalesce(input->>'logical_payload_hash','') !~ '^[0-9a-f]{64}$'
    or coalesce(input->>'source_fingerprint','') !~ '^[0-9a-f]{64}$' or jsonb_typeof(input->'source_revision') <> 'object'
    then return jsonb_build_object('ok',false,'code','COMPLETE_ODDS_PUBLICATION_REQUIRED'); end if;
  if phase='Final Results' and exists(select 1 from scoring_authority.matches where tournament_id=target and (status<>'FINAL' or scorecard_complete is not true))
    then return jsonb_build_object('ok',false,'code','FINAL_RESULTS_NOT_READY'); end if;
  select * into current_config from scoring_authority.odds_input_configurations where tournament_id=target and is_current for share;
  if current_config.id is null or current_config.settings_fingerprint<>input->>'settings_fingerprint' or current_config.ratings_fingerprint<>input->>'ratings_fingerprint'
    then return jsonb_build_object('ok',false,'code','STALE_ODDS_INPUT_CONFIGURATION'); end if;
  current_state:=public.read_leaderboards_core_view(target);
  if coalesce((current_state->>'ok')::boolean,false) is not true or current_state->'data'->'source_revision' <> input->'source_revision'
    then return jsonb_build_object('ok',false,'code','STALE_ODDS_SOURCE_STATE'); end if;
  select id into existing_id from scoring_authority.odds_published_snapshots where tournament_id=target and milestone=phase
    and logical_payload_hash=input->>'logical_payload_hash' and source_fingerprint=input->>'source_fingerprint'
    and settings_fingerprint=input->>'settings_fingerprint' and ratings_fingerprint=input->>'ratings_fingerprint'
    and pairing_fingerprint=input->>'pairing_fingerprint' and engine_version=input->>'engine_version' and deterministic_seed=input->>'deterministic_seed';
  if existing_id is not null then return jsonb_build_object('ok',true,'changed',false,'snapshot_id',existing_id,'duplicate',true); end if;
  published_at:=(input->'published_payload'->>'publishedAt')::timestamptz;
  select coalesce(max(publication_revision),0)+1 into next_revision from scoring_authority.odds_published_snapshots where tournament_id=target and milestone=phase;
  update scoring_authority.odds_published_snapshots set is_current_for_milestone=false where tournament_id=target and milestone=phase and is_current_for_milestone;
  update scoring_authority.odds_published_snapshots set is_current_official=false where tournament_id=target and is_current_official;
  insert into scoring_authority.odds_published_snapshots(tournament_id,milestone,phase_order,publication_revision,published_at,published_payload,payload_hash,
    source_fingerprint,engine_version,engine_metadata,google_publication_fingerprint,google_publication_reference,is_current_for_milestone,is_current_official,
    publication_verified,imported_by,logical_payload_hash,settings_fingerprint,ratings_fingerprint,pairing_fingerprint,deterministic_seed,publication_actor_id,mirror_status)
  values(target,phase,array_position(array['Pre-Tournament','After Round 1','After Round 2','Round 3 Pairings Announced','Final Results'],phase)-1,next_revision,
    published_at,input->'published_payload',input->>'payload_hash',input->>'source_fingerprint',input->>'engine_version',coalesce(input->'simulation_metadata','{}'::jsonb),
    repeat('0',64),jsonb_build_object('status','PENDING'),true,true,true,actor,input->>'logical_payload_hash',input->>'settings_fingerprint',input->>'ratings_fingerprint',
    input->>'pairing_fingerprint',input->>'deterministic_seed',actor,'PENDING') returning id into snapshot_id;
  insert into scoring_authority.odds_google_mirror_jobs(tournament_id,snapshot_id) values(target,snapshot_id);
  insert into scoring_authority.audit_events(tournament_id,action,actor_id,metadata) values(target,'CHAMPIONSHIP_ODDS_PUBLISHED',actor,
    jsonb_build_object('snapshotId',snapshot_id,'milestone',phase,'publicationRevision',next_revision,'googleMirror','PENDING'));
  return jsonb_build_object('ok',true,'changed',true,'snapshot_id',snapshot_id,'publication_revision',next_revision,'google_mirror_status','PENDING');
end; $$;

revoke all on function public.claim_preview_championship_odds_google_mirror(jsonb) from public,anon,authenticated;
revoke all on function public.complete_preview_championship_odds_google_mirror(jsonb) from public,anon,authenticated;
revoke all on function public.read_preview_championship_odds_publication_diagnostics(text) from public,anon,authenticated;
revoke all on function public.publish_preview_championship_odds(jsonb) from public,anon,authenticated;
grant execute on function public.claim_preview_championship_odds_google_mirror(jsonb) to service_role;
grant execute on function public.complete_preview_championship_odds_google_mirror(jsonb) to service_role;
grant execute on function public.read_preview_championship_odds_publication_diagnostics(text) to service_role;
grant execute on function public.publish_preview_championship_odds(jsonb) to service_role;
notify pgrst,'reload schema';
