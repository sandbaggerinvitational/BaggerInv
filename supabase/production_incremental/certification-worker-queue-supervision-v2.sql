\set ON_ERROR_STOP on
-- Forward-only retirement of HMAC/pg_net custody. No provider extensions/ACLs/keys.
-- Install v1 first for a fresh add-on. Retain its original receipt unchanged.
begin;
select pg_advisory_xact_lock(hashtextextended('certification-worker-supervision-v1-install',0));
do $$begin
 perform production_control.worker_supervisor_owner_v1();
 if not exists(select 1 from production_control.canonical_resource_v1 where resource_class='CERTIFICATION'
  and resource_id='CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51'and project_ref='trmcwrljjxwhgtikfdgu'
  and registration_revision=1 and database_name=current_database())
  or exists(select 1 from production_control.certification_admission_v1 where enabled)
  or exists(select 1 from scoring_authority.ingress_gates where state<>'PAUSED')
  or not exists(select 1 from production_control.worker_supervisor_v1 where state='OFF')
  or exists(select 1 from production_control.worker_supervisor_invocations_v1 where state in('RESERVED','RUNNING','UNKNOWN')) then
  raise exception 'SUPERVISOR_SAFE_INSTALL_CONTEXT_REQUIRED';end if;
 if to_regclass('production_control.worker_supervisor_queue_installation_v2')is null then
  if (select image from production_control.worker_supervisor_installation_v1 where singleton)
   is distinct from production_control.worker_supervisor_installation_image_v1() then raise exception 'SUPERVISOR_PREDECESSOR_DRIFT';end if;
 else
  if (select image from production_control.worker_supervisor_queue_installation_v2 where singleton)
   is distinct from production_control.worker_supervisor_installation_image_v1() then raise exception 'SUPERVISOR_QUEUE_ARTIFACT_DRIFT';end if;
 end if;
end;$$;
create table if not exists production_control.worker_supervisor_queue_installation_v2(
 singleton boolean primary key default true check(singleton),predecessor_image jsonb not null,image jsonb not null,
 installed_at timestamptz not null default clock_timestamp());
alter table production_control.worker_supervisor_queue_installation_v2 enable row level security;
revoke all on production_control.worker_supervisor_queue_installation_v2 from public,anon,authenticated,service_role;
alter table production_control.worker_supervisor_v1 add column if not exists transport text not null default 'QUEUE_V2';
alter table production_control.worker_supervisor_v1 add column if not exists cadence_seconds integer not null default 60 check(cadence_seconds=60);
alter table production_control.worker_supervisor_invocations_v1 add column if not exists transport text not null default 'LEGACY_RETIRED';
alter table production_control.worker_supervisor_invocations_v1 add column if not exists scheduled_at timestamptz;
alter table production_control.worker_supervisor_invocations_v1 add column if not exists reservation_digest text;
alter table production_control.worker_supervisor_invocations_v1 add column if not exists publication_state text not null default 'RESERVED'
 check(publication_state in('RESERVED','UNKNOWN','ACCEPTED','DELIVERED','CANCELLED'));
alter table production_control.worker_supervisor_invocations_v1 add column if not exists publication_attempts integer not null default 0;
alter table production_control.worker_supervisor_invocations_v1 add column if not exists provider_message_id text;
-- References are obsolete; historical invocation/audit/receipt rows are preserved.
update production_control.worker_supervisor_v1 set signing_secret_id=null,bypass_secret_id=null;

create or replace function production_control.worker_supervisor_queue_binding_v2(input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare b jsonb;g production_control.certification_ingress_generations_v1%rowtype;
begin
 b:=production_control.worker_supervisor_binding_v1(input);
 select * into strict g from production_control.certification_ingress_generations_v1 where resource_id=b#>>'{resource,resource_id}'and state='OPEN';
 return b||jsonb_build_object('generation_id',g.generation_id,'generation_revision',g.revision);
end;$$;

create or replace function production_control.worker_supervisor_queue_digest_v2(id uuid,epoch uuid,revision bigint,sequence bigint,due timestamptz,expiry timestamptz,context jsonb,engines text[])
returns text language sql security invoker set search_path=pg_catalog as $$
 select production_control.tournament_setup_hash_v1(jsonb_build_object('version','certification-queue-supervision-v2',
 'id',id,'epoch',epoch,'revision',revision,'sequence',sequence,'scheduled_at',due,'expiry',expiry,'context',context,'engines',engines));
$$;

create or replace function production_control.worker_supervisor_status_v1(input jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare s production_control.worker_supervisor_v1%rowtype;b jsonb;
begin
 perform production_control.worker_supervisor_owner_v1();b:=production_control.worker_supervisor_queue_binding_v2(input);
 select * into strict s from production_control.worker_supervisor_v1;
 return jsonb_build_object('ok',true,'state',s.state,'enabled',s.state='ENABLED'and not s.halt_latched and s.expires_at>clock_timestamp(),
 'epoch',s.epoch,'revision',s.revision,'expiry',s.expires_at,'deployment',b->'deployment','slots',s.slots,'budget',s.budget,
 'reserved',(select count(*)from production_control.worker_supervisor_invocations_v1 where epoch=s.epoch and state='RESERVED'),
 'consumed',(select count(*)from production_control.worker_supervisor_invocations_v1 where epoch=s.epoch and started_at is not null),
 'remaining',(select count(*)from production_control.worker_supervisor_invocations_v1 where epoch=s.epoch and state='RESERVED'and expires_at>clock_timestamp()),
 'publication',(select jsonb_build_object('reserved',count(*)filter(where publication_state='RESERVED'),'unknown',count(*)filter(where publication_state='UNKNOWN'),
 'accepted',count(*)filter(where publication_state='ACCEPTED'),'delivered',count(*)filter(where publication_state='DELIVERED'),'cancelled',count(*)filter(where publication_state='CANCELLED'))
 from production_control.worker_supervisor_invocations_v1 where epoch=s.epoch),
 'schedule_installed',false,'delivery_certified',false,
 'last_invocation',s.last_invocation,'last_successful_tick',s.last_success,'consecutive_global_failures',s.tick_failures,
 'consecutive_invocation_failures',s.invocation_failures,'next_eligible_at',s.next_at,'reason',s.reason,'halt_latched',s.halt_latched,
 'last_halt_reason',s.last_halt_reason,'degraded',exists(select 1 from production_control.worker_supervisor_invocations_v1 where epoch=s.epoch and state='UNKNOWN'),
 'counts',production_control.worker_supervisor_counts_v1());
end;$$;

create or replace function production_control.worker_supervisor_control_v1(input jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare s production_control.worker_supervisor_v1%rowtype;b jsonb;h text;receipt production_control.worker_supervisor_receipts_v1%rowtype;
 action text:=input->>'action';response jsonb;req_id uuid:=(input->>'request_id')::uuid;n integer:=(input->>'budget')::integer;
 duration integer:=(input->>'duration_seconds')::integer;due timestamptz;id uuid;context jsonb;seq integer;
begin
 perform production_control.worker_supervisor_owner_v1();b:=production_control.worker_supervisor_queue_binding_v2(input);
 select * into strict s from production_control.worker_supervisor_v1 for update;
 h:=production_control.tournament_setup_hash_v1(input);
 select * into receipt from production_control.worker_supervisor_receipts_v1 where request_id=req_id;
 if found then if receipt.request_hash<>h then raise exception using errcode='PT409',message='SUPERVISOR_REQUEST_CONFLICT';end if;
  return receipt.response||jsonb_build_object('idempotent',true);end if;
 if req_id is null or input->>'expected_revision' is distinct from s.revision::text then raise exception using errcode='PT409',message='SUPERVISOR_REVISION_STALE';end if;
 if action in('START','RESUME')then
  if s.state not in('OFF','HALTED')or(action='START'and(s.state='HALTED'or s.halt_latched))
   or(action='RESUME'and length(coalesce(input->>'reconciliation_reason',''))not between 8 and 500)
   or coalesce(duration,0)not between 60 and 7200 or coalesce(n,0)not between 1 and 120 or n>duration/60
   or input->>'cadence_seconds' is distinct from '60' or coalesce((input->>'slots')::integer,0)not in(1,2)
   or input->'engines' is distinct from to_jsonb(s.engines)
   or exists(select 1 from production_control.worker_supervisor_invocations_v1 where state in('RESERVED','RUNNING','UNKNOWN'))
   or (production_control.worker_supervisor_counts_v1()->>'active_claims')::integer<>0
   or (production_control.worker_supervisor_counts_v1()->>'active_leases')::integer<>0
   or (production_control.worker_supervisor_counts_v1()->>'dead_letters')::integer<>0 then
   raise exception using errcode='42501',message='SUPERVISOR_SAFE_START_REQUIRED';end if;
  perform production_control.worker_supervisor_scope_v1();
  if input->'expected_context' is distinct from b-array['resource','deployment']then raise exception using errcode='PT409',message='SUPERVISOR_AUTHORITY_CONTEXT_STALE';end if;
  if ((input->>'slots')::integer=2 and not exists(select 1 from production_control.worker_supervisor_faults_v1
   where epoch is null and fault='CONTENTION'and expires_at>clock_timestamp()))or exists(
   select 1 from production_control.worker_supervisor_faults_v1 f where f.epoch is null and f.expires_at>clock_timestamp()
    and not exists(select 1 from scoring_authority.competition_recalculation_jobs j where j.tournament_id='2026'
    and j.engine_key=f.engine_key and j.delivery_cycle=f.cycle and j.requested_source_revision=f.source_revision and j.status='PENDING'))then
    raise exception using errcode='42501',message='SUPERVISOR_FAULT_SOURCE_DENIED';end if;
  update production_control.worker_supervisor_v1 set state='ENABLED',epoch=extensions.gen_random_uuid(),revision=revision+1,
   binding=jsonb_build_object('resource',input->'resource','deployment',input->'deployment'),
   binding_digest=production_control.tournament_setup_hash_v1(b),authority_context=b,
   expires_at=clock_timestamp()+make_interval(secs=>duration),budget=n,dispatched=n,slots=(input->>'slots')::integer,
   tick_failures=0,invocation_failures=0,last_tick_sequence=0,next_at=clock_timestamp(),reason=null,halt_latched=false,
   transport='QUEUE_V2' returning * into s;
  for seq in 1..n loop
   due:=s.next_at+interval '10 seconds'+make_interval(secs=>((seq-1)/s.slots)*60);
   id:=extensions.gen_random_uuid();
   insert into production_control.worker_supervisor_invocations_v1(invocation_id,epoch,revision,sequence,nonce,binding_digest,ticket_body,issued_at,
    scheduled_at,expires_at,reconcile_after,transport,reservation_digest)
   values(id,s.epoch,s.revision,seq,extensions.gen_random_uuid(),s.binding_digest,'',s.next_at,due,least(due+interval '30 seconds',s.expires_at),
    due+interval '150 seconds','QUEUE_V2',production_control.worker_supervisor_queue_digest_v2(id,s.epoch,s.revision,seq,due,least(due+interval '30 seconds',s.expires_at),b,s.engines));
  end loop;
  update production_control.worker_supervisor_faults_v1 set epoch=s.epoch,binding_digest=s.binding_digest where epoch is null and expires_at>clock_timestamp()
   and binding_digest=production_control.tournament_setup_hash_v1(b-'admission_revision');
 elsif action='STOP'then
  update production_control.worker_supervisor_v1 set state=case when exists(select 1 from production_control.worker_supervisor_invocations_v1 where state in('RUNNING','UNKNOWN'))then 'STOPPING'else 'OFF'end,
   revision=revision+1,reason='OWNER_STOP';
  update production_control.worker_supervisor_invocations_v1 set state='RECONCILED',outcome='NOT_STARTED',reconciled_at=clock_timestamp(),evidence=evidence||jsonb_build_object('publication_before_stop',publication_state,'provider_ack_before_stop',provider_message_id is not null),publication_state='CANCELLED'where state='RESERVED';
 else raise exception using errcode='42501',message='SUPERVISOR_OPERATION_DENIED';end if;
 response:=production_control.worker_supervisor_status_v1(input);
 insert into production_control.worker_supervisor_receipts_v1 values(req_id,h,response,clock_timestamp());
 insert into production_control.operation_audit_events(event_type,domain,actor,result,details)
 values('CERTIFICATION_QUEUE_SUPERVISOR_'||action,'RESOURCE',current_user,'SUCCEEDED',response-'counts');
 return response;
end;$$;

-- Private owner publication operation: never called through PostgREST/service_role.
-- TRY is committed BEFORE sending. Only a provider ACK or consumer delivery can
-- settle UNKNOWN. Repeating a send uses the identical epoch/sequence idempotency key.
create or replace function production_control.worker_supervisor_queue_publication_v2(input jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare s production_control.worker_supervisor_v1%rowtype;b jsonb;i production_control.worker_supervisor_invocations_v1%rowtype;response jsonb;
begin
 perform production_control.worker_supervisor_owner_v1();b:=production_control.worker_supervisor_queue_binding_v2(input);
 select * into strict s from production_control.worker_supervisor_v1 for update;
 if s.state<>'ENABLED'or s.halt_latched or s.authority_context is distinct from b or s.expires_at<=clock_timestamp()then raise exception using errcode='42501',message='SUPERVISOR_DISABLED_OR_STALE';end if;
 if input->>'action'='BATCH'then
  return jsonb_build_object('ok',true,'binding',s.binding,'epoch',s.epoch,'revision',s.revision,
   'messages',coalesce((select jsonb_agg(jsonb_build_object('message',jsonb_build_object('version','certification-queue-supervision-v2','invocation_id',invocation_id),
    'scheduled_at',scheduled_at,'expires_at',expires_at,'idempotency_key','bagger-certification-'||epoch::text||'-'||sequence::text)order by sequence)
    from production_control.worker_supervisor_invocations_v1 where epoch=s.epoch and state='RESERVED'and publication_state in('RESERVED','UNKNOWN')and expires_at>clock_timestamp()),'[]'::jsonb));
 end if;
 select * into strict i from production_control.worker_supervisor_invocations_v1 where invocation_id=(input->>'invocation_id')::uuid and epoch=s.epoch and transport='QUEUE_V2'for update;
 if i.state not in('RESERVED','RUNNING','SUCCEEDED','FAILED','JOB_RETRY','TERMINAL','UNKNOWN','RECONCILED','STOPPED')then raise exception 'SUPERVISOR_PUBLICATION_DENIED';end if;
 if input->>'action'='TRY'then
  if i.state<>'RESERVED'or i.expires_at<=clock_timestamp()then raise exception using errcode='42501',message='SUPERVISOR_PUBLICATION_DENIED';end if;
  if i.publication_state in('ACCEPTED','DELIVERED')then return jsonb_build_object('ok',true,'already_accepted',true);end if;
  update production_control.worker_supervisor_invocations_v1 set publication_state='UNKNOWN',publication_attempts=publication_attempts+1 where invocation_id=i.invocation_id;
 elsif input->>'action'='ACK'then
  if i.publication_attempts<1 or length(coalesce(input->>'message_id',''))not between 1 and 512 then raise exception using errcode='42501',message='SUPERVISOR_PUBLICATION_DENIED';end if;
  update production_control.worker_supervisor_invocations_v1 set publication_state=case when publication_state='DELIVERED'then 'DELIVERED'else 'ACCEPTED'end,
   provider_message_id=coalesce(provider_message_id,input->>'message_id')where invocation_id=i.invocation_id;
 else raise exception using errcode='42501',message='SUPERVISOR_PUBLICATION_DENIED';end if;
 return jsonb_build_object('ok',true,'outcome',input->>'action','invocation_id',i.invocation_id);
end;$$;
create or replace function public.execute_certification_queue_supervisor_v2(input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare s production_control.worker_supervisor_v1%rowtype;i production_control.worker_supervisor_invocations_v1%rowtype;
 b jsonb;ticket jsonb;operation text:=input->>'operation';token text;expected_signature text;plan production_control.worker_supervisor_faults_v1%rowtype;
begin
 perform production_control.assert_production_service_role();
 if input->>'contract' is distinct from 'certification-queue-supervision-v2'then raise exception using errcode='42501',message='SUPERVISOR_OPERATION_DENIED';end if;
 b:=production_control.worker_supervisor_queue_binding_v2(input);
 select * into strict s from production_control.worker_supervisor_v1 for update;
 if operation='BEGIN'then
  ticket:=input->'message';
  if ticket is null or jsonb_typeof(ticket)<>'object' or (select count(*)from jsonb_object_keys(ticket))<>2
   or ticket->>'version' is distinct from 'certification-queue-supervision-v2' then
   raise exception using errcode='42501',message='SUPERVISOR_MESSAGE_DENIED';end if;
  select * into strict i from production_control.worker_supervisor_invocations_v1
   where invocation_id=(ticket->>'invocation_id')::uuid and transport='QUEUE_V2' for update;
  if input->'runtime' is distinct from b->'deployment' then
   raise exception using errcode='42501',message='SUPERVISOR_DEPLOYMENT_DENIED';end if;
  if i.reservation_digest is distinct from production_control.worker_supervisor_queue_digest_v2(i.invocation_id,i.epoch,i.revision,i.sequence,i.scheduled_at,i.expires_at,s.authority_context,s.engines)
   or i.expires_at<=clock_timestamp() then raise exception using errcode='42501',message='SUPERVISOR_RESERVATION_DENIED';end if;
  if i.outcome='NOT_STARTED' or i.state='STOPPED' then raise exception using errcode='42501',message='SUPERVISOR_DISABLED_OR_STALE';end if;
  if i.state<>'RESERVED' then
   -- A duplicate observes the durable invocation, never starts another tick.
   return jsonb_build_object('ok',true,'admitted',false,'invocation_id',i.invocation_id,'outcome',i.state,
    'uncertain',i.state in('RUNNING','UNKNOWN'));
  end if;
  if s.state<>'ENABLED'or s.halt_latched or s.expires_at<=clock_timestamp()or i.epoch<>s.epoch or i.revision<>s.revision
   or b is distinct from s.authority_context then raise exception using errcode='42501',message='SUPERVISOR_DISABLED_OR_STALE';end if;
  if clock_timestamp()<i.scheduled_at or clock_timestamp()<s.next_at
   or(select count(*)from production_control.worker_supervisor_invocations_v1 where epoch=s.epoch and state='RUNNING')>=s.slots then
   raise exception using errcode='PT409',message='SUPERVISOR_NOT_DUE_OR_BUSY';end if;
  perform production_control.worker_supervisor_scope_v1();
  if not exists(select 1 from production_control.certification_admission_v1 where resource_id=b#>>'{resource,resource_id}'and enabled)
   or not exists(select 1 from scoring_authority.ingress_gates where tournament_id=b->>'tournament_id'and state='OPEN')then
   raise exception using errcode='42501',message='SUPERVISOR_ADMISSION_DENIED';end if;
  update production_control.worker_supervisor_v1 set last_invocation=i.invocation_id;
  token:=encode(extensions.gen_random_bytes(32),'hex');
  update production_control.worker_supervisor_invocations_v1 set state='RUNNING',publication_state='DELIVERED',started_at=clock_timestamp(),
   run_token_hash=encode(extensions.digest(token,'sha256'),'hex')where invocation_id=i.invocation_id;
  return jsonb_build_object('ok',true,'admitted',true,'invocation_id',i.invocation_id,'run_token',token);
 end if;
 select * into strict i from production_control.worker_supervisor_invocations_v1 where invocation_id=(input->>'invocation_id')::uuid for update;
 if i.run_token_hash is null or i.run_token_hash is distinct from encode(extensions.digest(input->>'run_token','sha256'),'hex')
  or i.epoch<>s.epoch or i.state<>'RUNNING'or i.reconcile_after<=clock_timestamp() then
  raise exception using errcode='42501',message='SUPERVISOR_RUN_TOKEN_DENIED';end if;
 if operation='STEP'then
  if s.state<>'ENABLED'or s.halt_latched or s.expires_at<=clock_timestamp()or b is distinct from s.authority_context
   or clock_timestamp()>=i.started_at+interval '45 seconds' or input->>'sequence' is distinct from (i.step_sequence+1)::text
   or input->>'kind'not in('TICK','COMPETITION','INTELLIGENCE')then
   raise exception using errcode='42501',message='SUPERVISOR_STEP_DENIED';end if;
  perform production_control.worker_supervisor_scope_v1();
  update production_control.worker_supervisor_invocations_v1 set step_sequence=step_sequence+1 where invocation_id=i.invocation_id;
 elsif operation='TICK_RESULT'then
  if i.tick_recorded or jsonb_typeof(input->'success')<>'boolean'then raise exception using errcode='42501',message='SUPERVISOR_TICK_REPLAY_DENIED';end if;
  update production_control.worker_supervisor_invocations_v1 set tick_recorded=true,tick_success=(input->>'success')::boolean where invocation_id=i.invocation_id;
  if (input->>'success')::boolean then
   if s.state='ENABLED'and i.sequence>s.last_tick_sequence then
    update production_control.worker_supervisor_v1 set tick_failures=0,last_success=clock_timestamp(),last_tick_sequence=i.sequence;
   end if;
  else
   if input->>'classification'not in('TERMINAL','RETRYABLE')or input->>'code'!~ '^[A-Z0-9_]{1,120}$'then
    raise exception using errcode='42501',message='SUPERVISOR_FAILURE_CLASS_DENIED';end if;
   update production_control.worker_supervisor_v1 set tick_failures=tick_failures+1,last_tick_sequence=greatest(last_tick_sequence,i.sequence),
    state=case when input->>'classification'='TERMINAL'or tick_failures+1>=5 then 'HALTED'else state end,
    halt_latched=halt_latched or input->>'classification'='TERMINAL'or tick_failures+1>=5,
    last_halt_reason=case when input->>'classification'='TERMINAL'then 'TERMINAL_TICK_FAILURE'when tick_failures+1>=5 then 'TICK_RETRY_EXHAUSTED'else last_halt_reason end,
    reason=case when input->>'classification'='TERMINAL'then 'TERMINAL_TICK_FAILURE'when tick_failures+1>=5 then 'TICK_RETRY_EXHAUSTED'else input->>'code'end,
    next_at=greatest(next_at,clock_timestamp()+make_interval(secs=>least(300,power(2,tick_failures+1)::integer)));
  end if;
 elsif operation='FINISH'then
  if input->>'outcome'not in('SUCCEEDED','FAILED','JOB_RETRY','TERMINAL','UNKNOWN','STOPPED')
   or (not i.tick_recorded and input->>'outcome'<>'STOPPED')then
   raise exception using errcode='42501',message='SUPERVISOR_OUTCOME_DENIED';end if;
  if input->>'outcome'='SUCCEEDED'and not i.tick_success then raise exception using errcode='42501',message='SUPERVISOR_FALSE_SUCCESS_DENIED';end if;
  update production_control.worker_supervisor_invocations_v1 set state=input->>'outcome',outcome=input->>'outcome',finished_at=clock_timestamp()where invocation_id=i.invocation_id;
  update production_control.worker_supervisor_v1 set invocation_failures=case when input->>'outcome' in('SUCCEEDED','JOB_RETRY','STOPPED')then 0 else invocation_failures+1 end,
   state=case when input->>'outcome'='TERMINAL'or (input->>'outcome' in('FAILED','UNKNOWN')and invocation_failures+1>=3)then 'HALTED'else state end,
   halt_latched=halt_latched or input->>'outcome'='TERMINAL'or(input->>'outcome'in('FAILED','UNKNOWN')and invocation_failures+1>=3),
   last_halt_reason=case when input->>'outcome'='TERMINAL'then 'TERMINAL_JOB_FAILURE'when input->>'outcome'in('FAILED','UNKNOWN')and invocation_failures+1>=3 then 'INVOCATION_RETRY_EXHAUSTED'else last_halt_reason end,
   reason=case when input->>'outcome'='TERMINAL'then 'TERMINAL_JOB_FAILURE'when input->>'outcome'in('FAILED','UNKNOWN')and invocation_failures+1>=3 then 'INVOCATION_RETRY_EXHAUSTED'else reason end;
  insert into production_control.operation_audit_events(event_type,domain,actor,result,details)
  values('CERTIFICATION_QUEUE_INVOCATION_FINISHED','RESOURCE','PRIVATE_QUEUE',input->>'outcome',
   jsonb_build_object('invocation_id',i.invocation_id,'epoch',i.epoch,'resource_id',b#>>'{resource,resource_id}',
    'deployment_id',b#>>'{deployment,deployment_id}','outcome',input->>'outcome'));
  return jsonb_build_object('ok',true,'outcome',input->>'outcome');
 elsif operation='FAULT'then
  if input->>'fault_operation'like '%CLAIM'then
   -- Read the committed canonical receipt, never a caller-provided claim result.
   if input#>>'{payload,worker_id}'is distinct from 'supervised-'||i.invocation_id::text then
    raise exception using errcode='42501',message='SUPERVISOR_FAULT_DENIED';end if;
   update production_control.worker_supervisor_invocations_v1 set claim_evidence=claim_evidence||coalesce((
    select jsonb_agg(jsonb_build_object('engine',j.engine_key,'cycle',j.delivery_cycle,
     'source',j.requested_source_revision,'started_at',j.started_at))
    from scoring_authority.competition_recalculation_jobs j join production_control.operation_audit_events a on
     a.event_type='CERTIFICATION_CANONICAL_OPERATION'and a.details->>'operation_id'=input->>'fault_operation'
     and a.details->>'operation_request_id'=input->>'request_id'
     and a.details->>'resource_id'=s.binding#>>'{resource,resource_id}'
     and a.details->>'release_commit'=s.binding#>>'{deployment,release_commit}'
     and a.request_fingerprint=production_control.cutover_payload_hash(input->'payload')
    where j.tournament_id='2026'and j.status='RUNNING'and j.engine_key=any(s.engines)
     and (j.started_at=(a.details#>>'{receipt,claim_started_at}')::timestamptz or exists(
      select 1 from jsonb_array_elements(coalesce(a.details#>'{receipt,claims}','[]'::jsonb))v
       where v->>'engine_key'=j.engine_key and (v->>'claim_started_at')::timestamptz=j.started_at))
   ),'[]'::jsonb)where invocation_id=i.invocation_id returning * into i;
  end if;
  select f.* into plan from production_control.worker_supervisor_faults_v1 f where f.epoch=s.epoch
   and f.binding_digest=s.binding_digest and f.expires_at>clock_timestamp()and f.consumed_by is null
   and ((f.fault in('LOST_ACK','TRANSIENT','TERMINAL')and input->>'fault_operation'like '%WRITE')or(f.fault in('DISAPPEAR','SUPERSEDE','CONTENTION')and input->>'fault_operation'like '%CLAIM'))
   and exists(select 1 from scoring_authority.competition_recalculation_jobs j where j.tournament_id='2026'
    and j.engine_key=f.engine_key and j.delivery_cycle=f.cycle and j.requested_source_revision=f.source_revision
    and j.status='RUNNING'and exists(select 1 from jsonb_array_elements(i.claim_evidence)v
     where v->>'engine'=j.engine_key and (v->>'cycle')::bigint=j.delivery_cycle
      and (v->>'started_at')::timestamptz=j.started_at
      and (input->>'fault_operation'like '%CLAIM'
       or (input->>'fault_operation'='WORKERS.COMPETITION_WRITE'
        and input#>>'{payload,engine_key}'=j.engine_key
        and (input#>>'{payload,claim_started_at}')::timestamptz=j.started_at)
       or (input->>'fault_operation'='WORKERS.INTELLIGENCE_WRITE'
        and exists(select 1 from jsonb_array_elements(coalesce(input#>'{payload,engines}','[]'::jsonb))engine
         where engine->>'key'=j.engine_key and (engine->>'claim_started_at')::timestamptz=j.started_at)))))
   order by f.plan_id limit 1 for update;
  if not found then return jsonb_build_object('ok',true,'fault',null);end if;
  update production_control.worker_supervisor_faults_v1 set consumed_by=i.invocation_id,consumed_at=clock_timestamp()where plan_id=plan.plan_id;
  return jsonb_build_object('ok',true,'fault',plan.fault,'plan_id',plan.plan_id);
 elsif operation='BARRIER'then
  select * into strict plan from production_control.worker_supervisor_faults_v1 where plan_id=(input->>'plan_id')::uuid;
  if plan.consumed_by<>i.invocation_id then raise exception using errcode='42501',message='SUPERVISOR_FAULT_DENIED';end if;
  return jsonb_build_object('ok',true,'released',plan.released_at is not null or plan.expires_at<=clock_timestamp());
 else raise exception using errcode='42501',message='SUPERVISOR_OPERATION_DENIED';end if;
 return jsonb_build_object('ok',true);
exception when no_data_found or invalid_text_representation then raise exception using errcode='42501',message='SUPERVISOR_REQUEST_DENIED';
end;$$;

create or replace function production_control.worker_supervisor_reconcile_v1(input jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare s production_control.worker_supervisor_v1%rowtype;i production_control.worker_supervisor_invocations_v1%rowtype;c jsonb;
begin
 perform production_control.worker_supervisor_owner_v1();perform production_control.worker_supervisor_queue_binding_v2(input);
 select * into strict s from production_control.worker_supervisor_v1 for update;c:=production_control.worker_supervisor_counts_v1();
 for i in select * from production_control.worker_supervisor_invocations_v1 where state in('RESERVED','RUNNING','UNKNOWN')for update loop
  if i.reconcile_after>clock_timestamp()then continue;end if;
  if i.state='RESERVED'then
   update production_control.worker_supervisor_invocations_v1 set state='RECONCILED',outcome='NOT_STARTED',publication_state='CANCELLED',reconciled_at=clock_timestamp(),evidence=c||jsonb_build_object('reason','UNCONSUMED_RESERVATION_EXPIRED')where invocation_id=i.invocation_id;
   continue;
  end if;
  if i.state<>'UNKNOWN'then
   update production_control.worker_supervisor_invocations_v1 set state='UNKNOWN',outcome='UNKNOWN',evidence=c where invocation_id=i.invocation_id;
   update production_control.worker_supervisor_v1 set invocation_failures=invocation_failures+1,
    state=case when invocation_failures+1>=3 then 'HALTED'else state end,halt_latched=halt_latched or invocation_failures+1>=3,
    last_halt_reason=case when invocation_failures+1>=3 then 'INVOCATION_RETRY_EXHAUSTED'else last_halt_reason end,reason='INVOCATION_ACKNOWLEDGEMENT_UNKNOWN';
  end if;
  if (c->>'active_claims')::integer=0 and (c->>'active_leases')::integer=0 then
   update production_control.worker_supervisor_invocations_v1 set state='RECONCILED',outcome=case when i.tick_recorded then 'TICK_RECORDED_JOB_STATE_RECONCILED'else 'INVOCATION_UNKNOWN_CANONICAL_STATE_RECONCILED'end,
    reconciled_at=clock_timestamp(),evidence=c||jsonb_build_object('canonical_jobs',coalesce((
     select jsonb_agg(jsonb_build_object('engine',j.engine_key,'cycle',j.delivery_cycle,'attempt',j.delivery_attempts,
      'status',j.status,'source',j.requested_source_revision,'available_at',j.delivery_available_at,
      'dead_letter',j.delivery_dead_letter_at is not null,'same_claim',j.started_at=(v->>'started_at')::timestamptz))
     from jsonb_array_elements(i.claim_evidence)v join scoring_authority.competition_recalculation_jobs j
      on j.tournament_id='2026'and j.engine_key=v->>'engine'
    ),'[]'::jsonb))where invocation_id=i.invocation_id;
  end if;
 end loop;
 update production_control.worker_supervisor_v1 set state='OFF'where state='STOPPING'and not exists(
  select 1 from production_control.worker_supervisor_invocations_v1 where state in('RESERVED','RUNNING','UNKNOWN'));
 return production_control.worker_supervisor_status_v1(input);
end;$$;

create or replace function production_control.worker_supervisor_fault_control_v1(input jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare s production_control.worker_supervisor_v1%rowtype;plan_id uuid; j scoring_authority.competition_recalculation_jobs%rowtype;
begin
 perform production_control.worker_supervisor_owner_v1();perform production_control.worker_supervisor_queue_binding_v2(input);
 select * into strict s from production_control.worker_supervisor_v1 for update;
 if input->>'action'='RELEASE'then
  update production_control.worker_supervisor_faults_v1 set released_at=clock_timestamp()
   where worker_supervisor_faults_v1.plan_id=(input->>'plan_id')::uuid and epoch=s.epoch and fault='SUPERSEDE'and consumed_at is not null;
  if not found then raise exception using errcode='42501',message='SUPERVISOR_FAULT_DENIED';end if;
  return jsonb_build_object('ok',true);
 end if;
 if input->>'action' is distinct from 'ARM' or exists(select 1 from production_control.certification_admission_v1 where enabled)
  or exists(select 1 from scoring_authority.ingress_gates where state<>'PAUSED')
  or s.state<>'OFF'or input->>'expected_revision' is distinct from s.revision::text
  or input->>'fault'not in('LOST_ACK','DISAPPEAR','TRANSIENT','TERMINAL','SUPERSEDE','CONTENTION')
  or input->>'engine_key'not in('TEAM_MOMENTUM','TOURNAMENT_STORYLINES','TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL')
  or (input->>'expires_at')::timestamptz<=clock_timestamp()or (input->>'expires_at')::timestamptz>clock_timestamp()+interval '10 minutes'
  or not exists(select 1 from production_control.operation_audit_events a where a.event_id=(input->>'fixture_event_id')::bigint
   and a.event_type='CERTIFICATION_PART2A_FIXTURE_BOOTSTRAPPED'and a.details->>'resource_id'='CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51')
  or exists(select 1 from production_control.worker_supervisor_faults_v1 where epoch is null and consumed_by is null and expires_at>clock_timestamp())then
  raise exception using errcode='42501',message='SUPERVISOR_FAULT_DENIED';end if;
 select * into strict j from scoring_authority.competition_recalculation_jobs where tournament_id='2026'and round_number=0
  and engine_key=input->>'engine_key'for share;
 if input->>'cycle' is distinct from j.delivery_cycle::text or input->'source_revision' is distinct from j.requested_source_revision
  or j.status<>'PENDING'then
  raise exception using errcode='42501',message='SUPERVISOR_FAULT_SOURCE_DENIED';end if;
 insert into production_control.worker_supervisor_faults_v1(epoch,binding_digest,fault,engine_key,cycle,source_revision,expires_at,fixture_event_id)
 values(null,production_control.tournament_setup_hash_v1(production_control.worker_supervisor_queue_binding_v2(input)-'admission_revision'),input->>'fault',j.engine_key,j.delivery_cycle,j.requested_source_revision,(input->>'expires_at')::timestamptz,
  (input->>'fixture_event_id')::bigint)returning worker_supervisor_faults_v1.plan_id into plan_id;
 insert into production_control.operation_audit_events(event_type,domain,actor,result,details)
 values('CERTIFICATION_SUPERVISOR_FAULT_ARMED','RESOURCE',current_user,'SUCCEEDED',jsonb_build_object('plan_id',plan_id,'fault',input->>'fault','engine_key',j.engine_key,'cycle',j.delivery_cycle));
 return jsonb_build_object('ok',true,'plan_id',plan_id);
end;$$;

create or replace function production_control.worker_supervisor_configure_v1(input jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$begin
 raise exception using errcode='42501',message='SUPERVISOR_TRANSPORT_RETIRED';end;$$;
create or replace function production_control.worker_supervisor_key_v1(secret_id uuid)
returns text language plpgsql security invoker set search_path=pg_catalog as $$begin
 raise exception using errcode='42501',message='SUPERVISOR_TRANSPORT_RETIRED';end;$$;
create or replace function production_control.worker_supervisor_reserve_v1()
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$begin
 raise exception using errcode='42501',message='SUPERVISOR_TRANSPORT_RETIRED';end;$$;
create or replace function production_control.worker_supervisor_dispatch_v1()
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$begin
 raise exception using errcode='42501',message='SUPERVISOR_TRANSPORT_RETIRED';end;$$;
create or replace function production_control.worker_supervisor_schedule_v1(input jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$begin
 raise exception using errcode='42501',message='SUPERVISOR_TRANSPORT_RETIRED';end;$$;
create or replace function production_control.worker_supervisor_provider_acl_v1()
returns void language plpgsql security invoker set search_path=pg_catalog as $$begin
 raise exception using errcode='42501',message='SUPERVISOR_TRANSPORT_RETIRED';end;$$;
create or replace function public.execute_certification_supervisor_v1(input jsonb)returns jsonb language plpgsql security definer set search_path=pg_catalog as $$begin
 raise exception using errcode='42501',message='SUPERVISOR_TRANSPORT_RETIRED';end;$$;
create or replace function production_control.worker_supervisor_installation_image_v1()
returns jsonb language sql security invoker set search_path=pg_catalog as $$
 select jsonb_build_object('functions',(select jsonb_agg(jsonb_build_object('identity',p.oid::regprocedure::text,
  'body',encode(extensions.digest(pg_get_functiondef(p.oid),'sha256'),'hex'),'owner',p.proowner,'acl',p.proacl::text)
  order by p.oid::regprocedure::text)from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where(n.nspname='production_control'and p.proname like 'worker_supervisor_%')
   or(n.nspname='public'and p.proname in('execute_certification_supervisor_v1','execute_certification_queue_supervisor_v2'))),
 'tables',(select jsonb_agg(jsonb_build_object('identity',c.oid::regclass::text,'owner',c.relowner,'acl',c.relacl::text,
  'rls',c.relrowsecurity,'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',a.atttypid,
   'nullable',not a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid))order by a.attnum)
   from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
   where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
  'constraints',(select jsonb_agg(pg_get_constraintdef(k.oid)order by k.conname)from pg_constraint k where k.conrelid=c.oid))
  order by c.oid::regclass::text)from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='production_control'and c.relkind='r'and c.relname like 'worker_supervisor_%'));
$$;
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where(n.nspname='production_control'and p.proname like 'worker_supervisor_%')or(n.nspname='public'and p.proname in('execute_certification_supervisor_v1','execute_certification_queue_supervisor_v2'))loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);end loop;
end;$$;
grant execute on function public.execute_certification_queue_supervisor_v2(jsonb)to service_role;
insert into production_control.worker_supervisor_queue_installation_v2(singleton,predecessor_image,image)
 select true,image,production_control.worker_supervisor_installation_image_v1()from production_control.worker_supervisor_installation_v1 where singleton on conflict do nothing;
commit;
