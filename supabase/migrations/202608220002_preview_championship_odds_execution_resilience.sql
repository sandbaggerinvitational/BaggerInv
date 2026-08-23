-- Preview-only durable Championship Odds calculation jobs. Calculations are
-- immutable inputs plus resumable engine checkpoints; publication remains a
-- separate Director-authorized operation.

create table scoring_authority.odds_calculation_jobs (
  job_id text primary key check (job_id ~ '^[0-9a-f]{64}$'),
  tournament_id text not null references scoring_authority.tournaments on delete cascade,
  phase text not null check (phase in ('Pre-Tournament','After Round 1','After Round 2','Round 3 Pairings Announced','Final Results')),
  total_iterations integer not null check (total_iterations in (10000,25000,50000,100000)),
  completed_iterations integer not null default 0 check (completed_iterations >= 0 and completed_iterations <= total_iterations),
  engine_version text not null,
  publication_contract_version text not null,
  checkpoint_contract_version text not null,
  deterministic_seed text not null,
  input_fingerprint text not null check (input_fingerprint ~ '^[0-9a-f]{64}$'),
  settings_fingerprint text not null check (settings_fingerprint ~ '^[0-9a-f]{64}$'),
  invocation_fingerprint text not null unique check (invocation_fingerprint ~ '^[0-9a-f]{64}$' and invocation_fingerprint = job_id),
  source_revision jsonb not null default '{}'::jsonb check (jsonb_typeof(source_revision) = 'object'),
  input_snapshot jsonb not null check (jsonb_typeof(input_snapshot) = 'object'),
  checkpoint_payload jsonb not null check (jsonb_typeof(checkpoint_payload) = 'object'),
  checkpoint_hash text not null check (checkpoint_hash ~ '^[0-9a-f]{64}$'),
  checkpoint_count integer not null default 0 check (checkpoint_count >= 0),
  status text not null default 'PENDING' check (status in ('PENDING','RUNNING','SUCCEEDED','FAILED','RETRYABLE','SUPERSEDED')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  claim_token uuid,
  lease_expires_at timestamptz,
  requested_by text not null,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  output_timestamp timestamptz not null,
  result_payload jsonb check (result_payload is null or jsonb_typeof(result_payload) = 'object'),
  result_fingerprint text check (result_fingerprint is null or result_fingerprint ~ '^[0-9a-f]{64}$'),
  output_payload_bytes integer check (output_payload_bytes is null or output_payload_bytes >= 0),
  resource_metrics jsonb not null default '{}'::jsonb check (jsonb_typeof(resource_metrics) = 'object'),
  last_error_code text,
  last_error_safe text,
  superseded_by text references scoring_authority.odds_calculation_jobs(job_id),
  superseded_at timestamptz,
  publication_status text not null default 'NOT_REQUESTED' check (publication_status in ('NOT_REQUESTED','READY','PUBLISHED','STALE')),
  publication_reference jsonb not null default '{}'::jsonb check (jsonb_typeof(publication_reference) = 'object')
);

create index odds_calculation_jobs_scope_idx on scoring_authority.odds_calculation_jobs
  (tournament_id, phase, requested_at desc);
create index odds_calculation_jobs_claim_idx on scoring_authority.odds_calculation_jobs
  (status, lease_expires_at, requested_at);

create table scoring_authority.odds_calculation_checkpoints (
  id bigint generated always as identity primary key,
  job_id text not null references scoring_authority.odds_calculation_jobs(job_id) on delete cascade,
  checkpoint_sequence integer not null check (checkpoint_sequence > 0),
  completed_iterations integer not null check (completed_iterations > 0),
  checkpoint_contract_version text not null,
  checkpoint_payload jsonb not null check (jsonb_typeof(checkpoint_payload) = 'object'),
  checkpoint_hash text not null check (checkpoint_hash ~ '^[0-9a-f]{64}$'),
  attempt_number integer not null check (attempt_number > 0),
  resource_metrics jsonb not null default '{}'::jsonb check (jsonb_typeof(resource_metrics) = 'object'),
  created_at timestamptz not null default now(),
  unique (job_id, checkpoint_sequence),
  unique (job_id, completed_iterations)
);

alter table scoring_authority.odds_calculation_jobs enable row level security;
alter table scoring_authority.odds_calculation_checkpoints enable row level security;
revoke all on scoring_authority.odds_calculation_jobs, scoring_authority.odds_calculation_checkpoints from public, anon, authenticated;
grant select, insert, update on scoring_authority.odds_calculation_jobs, scoring_authority.odds_calculation_checkpoints to service_role;

create or replace function public.request_preview_odds_calculation_job(input jsonb) returns jsonb
language plpgsql security definer set search_path=scoring_authority,public,extensions,pg_temp as $$
declare
  target_job text := lower(btrim(coalesce(input->>'job_id','')));
  target_tournament text := btrim(coalesce(input->>'tournament_id',''));
  target_phase text := btrim(coalesce(input->>'phase',''));
  target_iterations integer := coalesce((input->>'total_iterations')::integer,0);
  target_input text := lower(btrim(coalesce(input->>'input_fingerprint','')));
  target_settings text := lower(btrim(coalesce(input->>'settings_fingerprint','')));
  target_checkpoint text := lower(btrim(coalesce(input->>'checkpoint_hash','')));
  existing scoring_authority.odds_calculation_jobs%rowtype;
  superseded_count integer := 0;
begin
  if upper(btrim(coalesce(input->>'environment',''))) <> 'PREVIEW' then return jsonb_build_object('ok',false,'code','PREVIEW_ENVIRONMENT_REQUIRED'); end if;
  if target_job !~ '^[0-9a-f]{64}$' or target_job <> lower(btrim(coalesce(input->>'invocation_fingerprint','')))
      or target_tournament = '' or target_phase not in ('Pre-Tournament','After Round 1','After Round 2','Round 3 Pairings Announced','Final Results')
      or target_iterations not in (10000,25000,50000,100000) or target_input !~ '^[0-9a-f]{64}$'
      or target_settings !~ '^[0-9a-f]{64}$' or target_checkpoint !~ '^[0-9a-f]{64}$'
      or jsonb_typeof(input->'input_snapshot') <> 'object' or jsonb_typeof(input->'checkpoint_payload') <> 'object'
      or (input ? 'resource_metrics' and jsonb_typeof(input->'resource_metrics') <> 'object')
      or btrim(coalesce(input->>'requested_by','')) = '' or coalesce(input->>'output_timestamp','') = '' then
    return jsonb_build_object('ok',false,'code','COMPLETE_ODDS_CALCULATION_JOB_REQUIRED');
  end if;
  if not exists(select 1 from scoring_authority.tournaments where tournament_id=target_tournament) then
    return jsonb_build_object('ok',false,'code','TOURNAMENT_NOT_FOUND');
  end if;
  select * into existing from scoring_authority.odds_calculation_jobs where job_id=target_job;
  if existing.job_id is not null then
    if existing.input_fingerprint <> target_input or existing.settings_fingerprint <> target_settings or existing.total_iterations <> target_iterations then
      return jsonb_build_object('ok',false,'code','ODDS_CALCULATION_JOB_IDENTITY_CONFLICT');
    end if;
    return jsonb_build_object('ok',true,'changed',false,'duplicate',true,'job',to_jsonb(existing)-'input_snapshot'-'checkpoint_payload'-'result_payload');
  end if;

  insert into scoring_authority.odds_calculation_jobs (
    job_id,tournament_id,phase,total_iterations,engine_version,publication_contract_version,
    checkpoint_contract_version,deterministic_seed,input_fingerprint,settings_fingerprint,
    invocation_fingerprint,source_revision,input_snapshot,checkpoint_payload,checkpoint_hash,
    requested_by,output_timestamp,resource_metrics
  ) values (
    target_job,target_tournament,target_phase,target_iterations,btrim(input->>'engine_version'),
    btrim(input->>'publication_contract_version'),btrim(input->>'checkpoint_contract_version'),
    btrim(input->>'deterministic_seed'),target_input,target_settings,target_job,
    coalesce(input->'source_revision','{}'::jsonb),input->'input_snapshot',input->'checkpoint_payload',
    target_checkpoint,btrim(input->>'requested_by'),(input->>'output_timestamp')::timestamptz,
    coalesce(input->'resource_metrics','{}'::jsonb)
  ) returning * into existing;
  update scoring_authority.odds_calculation_jobs set
    status='SUPERSEDED', publication_status='STALE', superseded_by=target_job,
    superseded_at=now(), claim_token=null, lease_expires_at=null, updated_at=now()
  where job_id <> target_job and tournament_id=target_tournament and phase=target_phase
    and input_fingerprint <> target_input and status in ('PENDING','RUNNING','RETRYABLE','SUCCEEDED')
    and publication_status <> 'PUBLISHED';
  get diagnostics superseded_count = row_count;
  insert into scoring_authority.audit_events(tournament_id,action,actor_id,metadata)
  values(target_tournament,'CHAMPIONSHIP_ODDS_CALCULATION_REQUESTED',btrim(input->>'requested_by'),
    jsonb_build_object('jobId',target_job,'phase',target_phase,'iterations',target_iterations,
      'inputFingerprint',target_input,'supersededJobs',superseded_count));
  return jsonb_build_object('ok',true,'changed',true,'duplicate',false,'superseded_jobs',superseded_count,
    'job',to_jsonb(existing)-'input_snapshot'-'checkpoint_payload'-'result_payload');
end; $$;

create or replace function public.claim_preview_odds_calculation_job(input jsonb) returns jsonb
language plpgsql security definer set search_path=scoring_authority,public,extensions,pg_temp as $$
declare
  target_job text := lower(btrim(coalesce(input->>'job_id','')));
  worker_id text := left(btrim(coalesce(input->>'worker_id','Odds calculation worker')),180);
  retained scoring_authority.odds_calculation_jobs%rowtype;
begin
  if upper(btrim(coalesce(input->>'environment',''))) <> 'PREVIEW' or target_job !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok',false,'code','COMPLETE_ODDS_CALCULATION_CLAIM_REQUIRED');
  end if;
  select * into retained from scoring_authority.odds_calculation_jobs where job_id=target_job for update;
  if retained.job_id is null then return jsonb_build_object('ok',false,'code','ODDS_CALCULATION_JOB_NOT_FOUND'); end if;
  if retained.status='SUCCEEDED' then return jsonb_build_object('ok',true,'deliver',false,'completed',true,'job',to_jsonb(retained)); end if;
  if retained.status in ('SUPERSEDED','FAILED') then return jsonb_build_object('ok',false,'code','ODDS_CALCULATION_JOB_'||retained.status,'retryable',false); end if;
  if retained.status='RUNNING' and retained.lease_expires_at > now() then
    return jsonb_build_object('ok',true,'deliver',false,'in_progress',true,'job',to_jsonb(retained)-'input_snapshot'-'checkpoint_payload'-'result_payload');
  end if;
  update scoring_authority.odds_calculation_jobs set
    status='RUNNING', attempt_count=attempt_count+1, claim_token=gen_random_uuid(),
    lease_expires_at=now()+interval '12 minutes', started_at=coalesce(started_at,now()),
    last_error_code=null,last_error_safe=null,updated_at=now()
  where job_id=target_job returning * into retained;
  return jsonb_build_object('ok',true,'deliver',true,'worker',worker_id,'job',to_jsonb(retained));
end; $$;

create or replace function public.checkpoint_preview_odds_calculation_job(input jsonb) returns jsonb
language plpgsql security definer set search_path=scoring_authority,public,extensions,pg_temp as $$
declare
  target_job text := lower(btrim(coalesce(input->>'job_id','')));
  target_claim uuid := (input->>'claim_token')::uuid;
  target_progress integer := coalesce((input->>'completed_iterations')::integer,0);
  target_hash text := lower(btrim(coalesce(input->>'checkpoint_hash','')));
  retained scoring_authority.odds_calculation_jobs%rowtype;
  next_sequence integer;
begin
  if upper(btrim(coalesce(input->>'environment',''))) <> 'PREVIEW' or target_job !~ '^[0-9a-f]{64}$'
      or target_claim is null or target_hash !~ '^[0-9a-f]{64}$' or jsonb_typeof(input->'checkpoint_payload') <> 'object' then
    return jsonb_build_object('ok',false,'code','COMPLETE_ODDS_CALCULATION_CHECKPOINT_REQUIRED');
  end if;
  select * into retained from scoring_authority.odds_calculation_jobs where job_id=target_job for update;
  if retained.job_id is null then return jsonb_build_object('ok',false,'code','ODDS_CALCULATION_JOB_NOT_FOUND'); end if;
  if retained.status <> 'RUNNING' or retained.claim_token is distinct from target_claim then
    return jsonb_build_object('ok',false,'code','ODDS_CALCULATION_CLAIM_STALE','retryable',false);
  end if;
  if target_progress < retained.completed_iterations or target_progress > retained.total_iterations then
    return jsonb_build_object('ok',false,'code','ODDS_CALCULATION_PROGRESS_INVALID');
  end if;
  if target_progress = retained.completed_iterations then
    if retained.checkpoint_hash=target_hash then return jsonb_build_object('ok',true,'duplicate',true,'checkpoint_count',retained.checkpoint_count); end if;
    return jsonb_build_object('ok',false,'code','ODDS_CALCULATION_CHECKPOINT_CONFLICT');
  end if;
  next_sequence:=retained.checkpoint_count+1;
  insert into scoring_authority.odds_calculation_checkpoints(job_id,checkpoint_sequence,completed_iterations,
    checkpoint_contract_version,checkpoint_payload,checkpoint_hash,attempt_number,resource_metrics)
  values(target_job,next_sequence,target_progress,retained.checkpoint_contract_version,input->'checkpoint_payload',
    target_hash,retained.attempt_count,coalesce(input->'resource_metrics','{}'::jsonb));
  update scoring_authority.odds_calculation_jobs set
    completed_iterations=target_progress,checkpoint_payload=input->'checkpoint_payload',checkpoint_hash=target_hash,
    checkpoint_count=next_sequence,resource_metrics=coalesce(input->'resource_metrics',resource_metrics),
    lease_expires_at=now()+interval '12 minutes',updated_at=now()
  where job_id=target_job returning * into retained;
  return jsonb_build_object('ok',true,'duplicate',false,'completed_iterations',target_progress,
    'total_iterations',retained.total_iterations,'checkpoint_count',next_sequence);
end; $$;

create or replace function public.complete_preview_odds_calculation_job(input jsonb) returns jsonb
language plpgsql security definer set search_path=scoring_authority,public,extensions,pg_temp as $$
declare
  target_job text := lower(btrim(coalesce(input->>'job_id','')));
  target_claim uuid := (input->>'claim_token')::uuid;
  target_result text := lower(btrim(coalesce(input->>'result_fingerprint','')));
  retained scoring_authority.odds_calculation_jobs%rowtype;
begin
  if upper(btrim(coalesce(input->>'environment',''))) <> 'PREVIEW' or target_job !~ '^[0-9a-f]{64}$'
      or target_claim is null or target_result !~ '^[0-9a-f]{64}$' or jsonb_typeof(input->'result_payload') <> 'object' then
    return jsonb_build_object('ok',false,'code','COMPLETE_ODDS_CALCULATION_RESULT_REQUIRED');
  end if;
  select * into retained from scoring_authority.odds_calculation_jobs where job_id=target_job for update;
  if retained.job_id is null then return jsonb_build_object('ok',false,'code','ODDS_CALCULATION_JOB_NOT_FOUND'); end if;
  if retained.status='SUCCEEDED' then
    if retained.result_fingerprint=target_result then return jsonb_build_object('ok',true,'duplicate',true,'job_id',target_job,'result_fingerprint',target_result); end if;
    return jsonb_build_object('ok',false,'code','ODDS_CALCULATION_RESULT_CONFLICT');
  end if;
  if retained.status <> 'RUNNING' or retained.claim_token is distinct from target_claim then
    return jsonb_build_object('ok',false,'code','ODDS_CALCULATION_CLAIM_STALE');
  end if;
  if retained.completed_iterations <> retained.total_iterations then return jsonb_build_object('ok',false,'code','ODDS_CALCULATION_INCOMPLETE'); end if;
  update scoring_authority.odds_calculation_jobs set
    status='SUCCEEDED',publication_status='READY',result_payload=input->'result_payload',
    result_fingerprint=target_result,output_payload_bytes=greatest(0,coalesce((input->>'output_payload_bytes')::integer,0)),
    resource_metrics=coalesce(input->'resource_metrics',resource_metrics),claim_token=null,lease_expires_at=null,
    completed_at=now(),updated_at=now(),last_error_code=null,last_error_safe=null
  where job_id=target_job returning * into retained;
  insert into scoring_authority.audit_events(tournament_id,action,actor_id,metadata)
  values(retained.tournament_id,'CHAMPIONSHIP_ODDS_CALCULATION_SUCCEEDED',retained.requested_by,
    jsonb_build_object('jobId',target_job,'phase',retained.phase,'iterations',retained.total_iterations,
      'resultFingerprint',target_result,'checkpointCount',retained.checkpoint_count,'attemptCount',retained.attempt_count));
  return jsonb_build_object('ok',true,'duplicate',false,'job_id',target_job,'result_fingerprint',target_result,
    'checkpoint_count',retained.checkpoint_count,'attempt_count',retained.attempt_count);
end; $$;

create or replace function public.fail_preview_odds_calculation_job(input jsonb) returns jsonb
language plpgsql security definer set search_path=scoring_authority,public,extensions,pg_temp as $$
declare
  target_job text := lower(btrim(coalesce(input->>'job_id','')));
  target_claim uuid := (input->>'claim_token')::uuid;
  retryable boolean := coalesce((input->>'retryable')::boolean,true);
  retained scoring_authority.odds_calculation_jobs%rowtype;
begin
  if upper(btrim(coalesce(input->>'environment',''))) <> 'PREVIEW' or target_job !~ '^[0-9a-f]{64}$' or target_claim is null then
    return jsonb_build_object('ok',false,'code','COMPLETE_ODDS_CALCULATION_FAILURE_REQUIRED');
  end if;
  update scoring_authority.odds_calculation_jobs set
    status=case when retryable then 'RETRYABLE' else 'FAILED' end,claim_token=null,lease_expires_at=null,
    last_error_code=left(btrim(coalesce(input->>'error_code','ODDS_CALCULATION_FAILED')),120),
    last_error_safe=left(btrim(coalesce(input->>'error_safe','Championship calculation can be retried safely.')),400),
    completed_at=case when retryable then completed_at else now() end,updated_at=now()
  where job_id=target_job and status='RUNNING' and claim_token=target_claim returning * into retained;
  if retained.job_id is null then return jsonb_build_object('ok',true,'marked',false,'stale_claim',true); end if;
  return jsonb_build_object('ok',true,'marked',true,'retryable',retryable,'status',retained.status,
    'completed_iterations',retained.completed_iterations,'checkpoint_count',retained.checkpoint_count);
end; $$;

create or replace function public.supersede_preview_odds_calculation_job(input jsonb) returns jsonb
language plpgsql security definer set search_path=scoring_authority,public,extensions,pg_temp as $$
declare updated_count integer:=0;
begin
  if upper(btrim(coalesce(input->>'environment',''))) <> 'PREVIEW' or coalesce(input->>'job_id','') !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok',false,'code','COMPLETE_ODDS_CALCULATION_SUPERSESSION_REQUIRED');
  end if;
  update scoring_authority.odds_calculation_jobs set status='SUPERSEDED',publication_status='STALE',
    superseded_at=now(),claim_token=null,lease_expires_at=null,last_error_code='ODDS_CALCULATION_SOURCE_ADVANCED',
    last_error_safe='Canonical calculation inputs advanced after this calculation was requested.',updated_at=now()
  where job_id=input->>'job_id' and status in ('PENDING','RUNNING','RETRYABLE','SUCCEEDED') and publication_status <> 'PUBLISHED';
  get diagnostics updated_count=row_count;
  return jsonb_build_object('ok',true,'superseded',updated_count=1);
end; $$;

create or replace function public.mark_preview_odds_calculation_published(input jsonb) returns jsonb
language plpgsql security definer set search_path=scoring_authority,public,extensions,pg_temp as $$
declare retained scoring_authority.odds_calculation_jobs%rowtype;
begin
  if upper(btrim(coalesce(input->>'environment',''))) <> 'PREVIEW' or coalesce(input->>'job_id','') !~ '^[0-9a-f]{64}$'
      or jsonb_typeof(input->'publication_reference') <> 'object' then
    return jsonb_build_object('ok',false,'code','COMPLETE_ODDS_CALCULATION_PUBLICATION_REFERENCE_REQUIRED');
  end if;
  select * into retained from scoring_authority.odds_calculation_jobs where job_id=input->>'job_id' for update;
  if retained.status <> 'SUCCEEDED' then return jsonb_build_object('ok',false,'code','ODDS_CALCULATION_NOT_PUBLISHABLE'); end if;
  if retained.publication_status='PUBLISHED' then return jsonb_build_object('ok',true,'duplicate',true); end if;
  update scoring_authority.odds_calculation_jobs set publication_status='PUBLISHED',
    publication_reference=input->'publication_reference',updated_at=now() where job_id=input->>'job_id';
  return jsonb_build_object('ok',true,'duplicate',false);
end; $$;

create or replace function public.read_preview_odds_calculation_jobs(target_tournament_id text, target_job_id text default null) returns jsonb
language plpgsql security definer stable set search_path=scoring_authority,public,extensions,pg_temp as $$
declare jobs jsonb; checkpoints jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(j) order by j.requested_at desc),'[]'::jsonb) into jobs
  from scoring_authority.odds_calculation_jobs j
  where j.tournament_id=target_tournament_id and (target_job_id is null or j.job_id=target_job_id);
  select coalesce(jsonb_agg(to_jsonb(c)-'checkpoint_payload' order by c.job_id,c.checkpoint_sequence),'[]'::jsonb) into checkpoints
  from scoring_authority.odds_calculation_checkpoints c join scoring_authority.odds_calculation_jobs j on j.job_id=c.job_id
  where j.tournament_id=target_tournament_id and (target_job_id is null or c.job_id=target_job_id);
  return jsonb_build_object('ok',true,'jobs',jobs,'checkpoints',checkpoints);
end; $$;

revoke all on function public.request_preview_odds_calculation_job(jsonb) from public,anon,authenticated;
revoke all on function public.claim_preview_odds_calculation_job(jsonb) from public,anon,authenticated;
revoke all on function public.checkpoint_preview_odds_calculation_job(jsonb) from public,anon,authenticated;
revoke all on function public.complete_preview_odds_calculation_job(jsonb) from public,anon,authenticated;
revoke all on function public.fail_preview_odds_calculation_job(jsonb) from public,anon,authenticated;
revoke all on function public.supersede_preview_odds_calculation_job(jsonb) from public,anon,authenticated;
revoke all on function public.mark_preview_odds_calculation_published(jsonb) from public,anon,authenticated;
revoke all on function public.read_preview_odds_calculation_jobs(text,text) from public,anon,authenticated;
grant execute on function public.request_preview_odds_calculation_job(jsonb) to service_role;
grant execute on function public.claim_preview_odds_calculation_job(jsonb) to service_role;
grant execute on function public.checkpoint_preview_odds_calculation_job(jsonb) to service_role;
grant execute on function public.complete_preview_odds_calculation_job(jsonb) to service_role;
grant execute on function public.fail_preview_odds_calculation_job(jsonb) to service_role;
grant execute on function public.supersede_preview_odds_calculation_job(jsonb) to service_role;
grant execute on function public.mark_preview_odds_calculation_published(jsonb) to service_role;
grant execute on function public.read_preview_odds_calculation_jobs(text,text) to service_role;

notify pgrst,'reload schema';
