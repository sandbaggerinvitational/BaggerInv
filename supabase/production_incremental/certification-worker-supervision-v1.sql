\set ON_ERROR_STOP on
-- Forward add-on; no historical function/body/ACL or baseline receipt changes.
-- Extensions/Vault keys/schedule are provisioned separately after owner approval.
begin;
select pg_advisory_xact_lock(hashtextextended('certification-worker-supervision-v1-install',0));
do $$begin
 if not exists(select 1 from production_control.canonical_resource_v1 where resource_class='CERTIFICATION'
  and resource_id='CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51'and project_ref='trmcwrljjxwhgtikfdgu'
  and database_name=current_database()and registration_revision=1)
  or exists(select 1 from production_control.certification_admission_v1 where enabled)
  or exists(select 1 from scoring_authority.ingress_gates where state<>'PAUSED')then
  raise exception 'SUPERVISOR_SAFE_INSTALL_CONTEXT_REQUIRED';end if;
 if to_regclass('production_control.worker_supervisor_installation_v1')is not null then
  if (select image from production_control.worker_supervisor_installation_v1 where singleton)
    is distinct from production_control.worker_supervisor_installation_image_v1()then
   raise exception 'SUPERVISOR_INSTALLED_ARTIFACT_DRIFT';end if;
 elsif to_regclass('production_control.worker_supervisor_v1')is not null then
  raise exception 'SUPERVISOR_UNRECEIPTED_INSTALL_DENIED';
 end if;
end;$$;
create table if not exists production_control.worker_supervisor_installation_v1(
 singleton boolean primary key default true check(singleton),image jsonb not null,installed_at timestamptz not null default clock_timestamp());
create table if not exists production_control.worker_supervisor_v1 (
 singleton boolean primary key default true check(singleton),
 state text not null default 'OFF' check(state in('OFF','ENABLED','STOPPING','HALTED')),
 epoch uuid not null default extensions.gen_random_uuid(), revision bigint not null default 1,
 binding jsonb, binding_digest text, authority_context jsonb,
 expires_at timestamptz, budget integer not null default 0 check(budget between 0 and 120),
 dispatched integer not null default 0, slots integer not null default 1 check(slots in(1,2)),
 signing_secret_id uuid, bypass_secret_id uuid,
 last_invocation uuid,last_success timestamptz,next_at timestamptz,
 tick_failures integer not null default 0, invocation_failures integer not null default 0,
 reason text, halt_latched boolean not null default false, last_halt_reason text, last_tick_sequence bigint not null default 0,
 engines text[] not null default array['TEAM_MOMENTUM','TOURNAMENT_STORYLINES','TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL']::text[]
);
create table if not exists production_control.worker_supervisor_invocations_v1 (
 invocation_id uuid primary key, epoch uuid not null, revision bigint not null,
 sequence bigint not null, nonce uuid not null unique, binding_digest text not null,
 ticket_body text not null, issued_at timestamptz not null, expires_at timestamptz not null,
 reconcile_after timestamptz not null,
 state text not null default 'RESERVED' check(state in('RESERVED','RUNNING','SUCCEEDED','FAILED','JOB_RETRY','TERMINAL','UNKNOWN','RECONCILED','STOPPED')),
 run_token_hash text, step_sequence integer not null default 0,
 started_at timestamptz, finished_at timestamptz,tick_recorded boolean not null default false,
 tick_success boolean, outcome text, http_request_id bigint,
 claim_evidence jsonb not null default '[]'::jsonb,
 reconciled_at timestamptz, evidence jsonb not null default '{}'::jsonb,
 unique(epoch,sequence)
);
create table if not exists production_control.worker_supervisor_receipts_v1 (
 request_id uuid primary key, request_hash text not null, response jsonb not null,
 created_at timestamptz not null default clock_timestamp()
);
create table if not exists production_control.worker_supervisor_faults_v1 (
 plan_id uuid primary key default extensions.gen_random_uuid(),epoch uuid,binding_digest text not null,
 fault text not null check(fault in('LOST_ACK','DISAPPEAR','TRANSIENT','TERMINAL','SUPERSEDE','CONTENTION')),
 engine_key text not null, cycle bigint not null, source_revision jsonb not null,
 expires_at timestamptz not null, consumed_by uuid, consumed_at timestamptz,released_at timestamptz,
 fixture_event_id bigint not null
);
alter table production_control.worker_supervisor_v1 enable row level security;
alter table production_control.worker_supervisor_invocations_v1 enable row level security;
alter table production_control.worker_supervisor_receipts_v1 enable row level security;
alter table production_control.worker_supervisor_faults_v1 enable row level security;
alter table production_control.worker_supervisor_installation_v1 enable row level security;
revoke all on production_control.worker_supervisor_v1,production_control.worker_supervisor_invocations_v1,
 production_control.worker_supervisor_receipts_v1,production_control.worker_supervisor_faults_v1,
 production_control.worker_supervisor_installation_v1 from public,anon,authenticated,service_role;
insert into production_control.worker_supervisor_v1(singleton)values(true)on conflict do nothing;

create or replace function production_control.worker_supervisor_owner_v1()
returns void language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if current_user<>pg_get_userbyid((select relowner from pg_class where oid='production_control.canonical_resource_v1'::regclass))
 or coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'postgres')<>'postgres' then
  raise exception using errcode='42501',message='SUPERVISOR_OWNER_REQUIRED';end if;
end;$$;

-- Can validate an OFF deployment; never impersonates enabled WORKERS context.
create or replace function production_control.worker_supervisor_binding_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare r production_control.canonical_resource_v1%rowtype;a production_control.certification_admission_v1%rowtype;
 p production_control.current_tournament_pointer_v1%rowtype;b jsonb;k text;
begin
 perform pg_advisory_xact_lock_shared(production_control.scoring_admission_lock_key());
 select * into strict r from production_control.canonical_resource_v1 where singleton for share;
 select * into strict a from production_control.certification_admission_v1 where resource_id=r.resource_id for share;
 select * into strict p from production_control.current_tournament_pointer_v1 where scope_key=r.resource_id for share;
 if r.resource_class<>'CERTIFICATION' or r.resource_id<>'CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51'
  or r.project_ref<>'trmcwrljjxwhgtikfdgu' or r.registration_revision<>1 or r.database_name<>current_database()or p.tournament_id<>'2026'
  or exists(select 1 from production_control.resource_scope) or exists(select 1 from production_control.cutover_activation_state)
  or not exists(select 1 from production_control.canonical_bootstrap_installation_v1)
  or not exists(select 1 from scoring_authority.authority_epochs e where e.epoch_id=a.authority_epoch_id
   and e.epoch_type='CERTIFICATION_INITIALIZATION' and e.status='COMMITTED') then
  raise exception using errcode='42501',message='SUPERVISOR_RESOURCE_DENIED';end if;
 foreach k in array array['resource_id','resource_class','installation_id','project_ref','project_url','registration_revision','manifest_digest','schema_contract','schema_digest']loop
  if input#>>array['resource',k] is distinct from to_jsonb(r)->>k then
   raise exception using errcode='42501',message='SUPERVISOR_RESOURCE_DENIED';end if;end loop;
 b:=jsonb_build_object('vercel_team_id',r.vercel_team_id,'vercel_project_id',r.vercel_project_id,
  'git_branch',a.git_branch,'deployment_class',a.deployment_class,'release_commit',a.release_commit,
  'deployment_id',a.deployment_id,'deployment_origin',a.deployment_origin);
 if input->'deployment' is distinct from b or a.deployment_class<>'preview'
  or a.deployment_origin !~ '^https://[a-z0-9-]+\.vercel\.app$' then
  raise exception using errcode='42501',message='SUPERVISOR_DEPLOYMENT_DENIED';end if;
 return jsonb_build_object('resource',input->'resource','deployment',b,'binding_id',a.binding_id,
  'authority_epoch_id',a.authority_epoch_id,'activation_revision',a.activation_revision,
  'admission_revision',a.admission_revision,'pointer_revision',p.pointer_revision,'tournament_id',p.tournament_id);
exception when no_data_found then raise exception using errcode='42501',message='SUPERVISOR_RESOURCE_DENIED';
end;$$;

create or replace function production_control.worker_supervisor_counts_v1()
returns jsonb language sql security definer set search_path=pg_catalog as $$
 select jsonb_build_object('pending_work',(select count(*)from scoring_authority.competition_recalculation_jobs j
  where j.engine_key in('TEAM_MOMENTUM','TOURNAMENT_STORYLINES','TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL')
   and j.status in('PENDING','FAILED')and j.delivery_dead_letter_at is null),
 'active_claims',(select count(*)from scoring_authority.competition_recalculation_jobs where status='RUNNING'
  and coalesce(lease_expires_at,started_at+interval '90 seconds')>clock_timestamp()),
 'expired_claims',(select count(*)from scoring_authority.competition_recalculation_jobs where status='RUNNING'
  and coalesce(lease_expires_at,started_at+interval '90 seconds')<=clock_timestamp()),
 'dead_letters',(select count(*)from scoring_authority.competition_recalculation_jobs where delivery_dead_letter_at is not null),
 'active_leases',(select count(*)from production_control.certification_ingress_leases_v1 where state in('ADMITTED','UNKNOWN')),
 'pending_intents',(select count(*)from scoring_authority.score_derived_intents_v1 where status not in('SUCCEEDED','SUPERSEDED')));
$$;

create or replace function production_control.worker_supervisor_scope_v1()
returns void language plpgsql security definer set search_path=pg_catalog as $$
begin
 if production_control.derived_final_recap_ready_v1('2026')
  or exists(select 1 from scoring_authority.odds_published_snapshots)
  or exists(select 1 from scoring_authority.calcutta_v1_recalculation_jobs where status in('PENDING','RUNNING'))
  or exists(select 1 from scoring_authority.calcutta_v1_auction_fact_revisions a join scoring_authority.calcutta_v1_current c on c.auction_revision_id=a.auction_revision_id
   where (jsonb_array_length(a.auction_manifest->'purchases')<>0 or jsonb_array_length(a.auction_manifest->'ownership')<>0)) then
  raise exception using errcode='42501',message='SUPERVISOR_ENGINE_SCOPE_DENIED';end if;
end;$$;

-- Some extension releases grant queue/view access to PUBLIC. Never enqueue a
-- signature or protection credential until the reviewed provider ACL is closed.
create or replace function production_control.worker_supervisor_provider_acl_v1()
returns void language plpgsql security invoker set search_path=pg_catalog as $$
declare object record;role_name text;
begin
 for object in select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in('net','vault')and c.relkind in('r','p','v','m')loop
  foreach role_name in array array['anon','authenticated','service_role']loop
   if has_table_privilege(role_name,object.oid,'SELECT,INSERT,UPDATE,DELETE')then
    raise exception 'SUPERVISOR_PROVIDER_SECRET_ACL_REQUIRED';end if;
  end loop;
 end loop;
 if to_regclass('vault.decrypted_secrets')is null then raise exception 'SUPERVISOR_PROVIDER_SECRET_ACL_REQUIRED';end if;
end;$$;

create or replace function production_control.worker_supervisor_status_v1(input jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare s production_control.worker_supervisor_v1%rowtype;b jsonb;
begin
 perform production_control.worker_supervisor_owner_v1();b:=production_control.worker_supervisor_binding_v1(input);
 select * into strict s from production_control.worker_supervisor_v1;
 return jsonb_build_object('ok',true,'state',s.state,'enabled',s.state='ENABLED'and s.expires_at>clock_timestamp(),
 'epoch',s.epoch,'revision',s.revision,'expiry',s.expires_at,'deployment',b->'deployment','slots',s.slots,
 'budget',s.budget,'dispatched',s.dispatched,'last_invocation',s.last_invocation,'last_successful_tick',s.last_success,
 'consecutive_global_failures',s.tick_failures,'consecutive_invocation_failures',s.invocation_failures,
 'next_eligible_at',s.next_at,'reason',s.reason,'halt_latched',s.halt_latched,'last_halt_reason',s.last_halt_reason,'degraded',exists(select 1 from production_control.worker_supervisor_invocations_v1 where epoch=s.epoch and state='UNKNOWN'),
 'counts',production_control.worker_supervisor_counts_v1());
end;$$;

create or replace function production_control.worker_supervisor_control_v1(input jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare s production_control.worker_supervisor_v1%rowtype;b jsonb;h text;receipt production_control.worker_supervisor_receipts_v1%rowtype;
 action text:=input->>'action';response jsonb;req_id uuid:=(input->>'request_id')::uuid; expiry timestamptz:=(input->>'expires_at')::timestamptz;
begin
 perform production_control.worker_supervisor_owner_v1();b:=production_control.worker_supervisor_binding_v1(input);
 select * into strict s from production_control.worker_supervisor_v1 for update;
 h:=production_control.tournament_setup_hash_v1(input);
 select * into receipt from production_control.worker_supervisor_receipts_v1 where request_id=req_id;
 if found then if receipt.request_hash<>h then raise exception using errcode='PT409',message='SUPERVISOR_REQUEST_CONFLICT';end if;
  return receipt.response||jsonb_build_object('idempotent',true);end if;
 if req_id is null or input->>'expected_revision' is distinct from s.revision::text then
  raise exception using errcode='PT409',message='SUPERVISOR_REVISION_STALE';end if;
 if action in('START','RESUME')then
  if s.state not in('OFF','HALTED')or(action='START'and(s.state='HALTED'or s.halt_latched))
   or(action='RESUME'and length(coalesce(input->>'reconciliation_reason',''))not between 8 and 500)
   or expiry is null or expiry<=clock_timestamp()or expiry>clock_timestamp()+interval '2 hours'
   or coalesce((input->>'budget')::integer,0)not between 1 and 120
   or coalesce((input->>'slots')::integer,0)not in(1,2)
   or s.signing_secret_id is null
   or exists(select 1 from production_control.worker_supervisor_invocations_v1 where state in('RESERVED','RUNNING','UNKNOWN'))
   or (production_control.worker_supervisor_counts_v1()->>'active_claims')::integer<>0
   or (production_control.worker_supervisor_counts_v1()->>'active_leases')::integer<>0
   or (production_control.worker_supervisor_counts_v1()->>'dead_letters')::integer<>0 then
   raise exception using errcode='42501',message='SUPERVISOR_SAFE_START_REQUIRED';end if;
  perform production_control.worker_supervisor_scope_v1();
  if ((input->>'slots')::integer=2 and not exists(select 1 from production_control.worker_supervisor_faults_v1
    where epoch is null and fault='CONTENTION'and expires_at>clock_timestamp()))or exists(
   select 1 from production_control.worker_supervisor_faults_v1 f where f.epoch is null and f.expires_at>clock_timestamp()
    and not exists(select 1 from scoring_authority.competition_recalculation_jobs j where j.tournament_id='2026'
     and j.engine_key=f.engine_key and j.delivery_cycle=f.cycle and j.requested_source_revision=f.source_revision and j.status='PENDING'))then
   raise exception using errcode='42501',message='SUPERVISOR_FAULT_SOURCE_DENIED';end if;
  -- Explicit owner CAS against authority revisions. START changes no admission.
  if input->'expected_context' is distinct from b-array['resource','deployment']then
   raise exception using errcode='PT409',message='SUPERVISOR_AUTHORITY_CONTEXT_STALE';end if;
  update production_control.worker_supervisor_v1 set state='ENABLED',epoch=extensions.gen_random_uuid(),revision=revision+1,
   binding=input-'action'-'expected_context'-'request_id'-'expected_revision'-'expires_at'-'budget'-'slots'-'reconciliation_reason',
   binding_digest=production_control.tournament_setup_hash_v1(b),authority_context=b,
   expires_at=expiry,budget=(input->>'budget')::integer,dispatched=0,slots=(input->>'slots')::integer,
   tick_failures=0,invocation_failures=0,last_tick_sequence=0,next_at=clock_timestamp(),reason=null,halt_latched=false;
  update production_control.worker_supervisor_faults_v1 set epoch=(select epoch from production_control.worker_supervisor_v1),
   binding_digest=production_control.tournament_setup_hash_v1(b)
   where epoch is null and expires_at>clock_timestamp()
    and binding_digest=production_control.tournament_setup_hash_v1(b-'admission_revision');
 elsif action='STOP'then
  update production_control.worker_supervisor_v1 set state=case when exists(select 1 from production_control.worker_supervisor_invocations_v1
   where state in('RUNNING','UNKNOWN'))then 'STOPPING'else 'OFF'end,revision=revision+1,reason='OWNER_STOP';
  update production_control.worker_supervisor_invocations_v1 set state='RECONCILED',outcome='NOT_STARTED',reconciled_at=clock_timestamp()
   where state='RESERVED';
 else raise exception using errcode='42501',message='SUPERVISOR_OPERATION_DENIED';end if;
 response:=production_control.worker_supervisor_status_v1(input);
 insert into production_control.worker_supervisor_receipts_v1 values(req_id,h,response,clock_timestamp());
 insert into production_control.operation_audit_events(event_type,domain,actor,result,details)
 values('CERTIFICATION_SUPERVISOR_'||action,'RESOURCE',current_user,'SUCCEEDED',response-'counts');
 return response;
end;$$;

-- Configuration stores Vault REFERENCES only. Key contents are never arguments.
create or replace function production_control.worker_supervisor_configure_v1(input jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
begin
 perform production_control.worker_supervisor_owner_v1();perform production_control.worker_supervisor_binding_v1(input);
 perform 1 from production_control.worker_supervisor_v1 where state='OFF'for update;
 if not found then raise exception using errcode='42501',message='SUPERVISOR_OFF_REQUIRED';end if;
 if (input->>'signing_secret_id')::uuid is null then raise exception using errcode='22023',message='SUPERVISOR_SECRET_REFERENCE_REQUIRED';end if;
 update production_control.worker_supervisor_v1 set signing_secret_id=(input->>'signing_secret_id')::uuid,
  bypass_secret_id=nullif(input->>'bypass_secret_id','')::uuid,revision=revision+1;
 return jsonb_build_object('ok',true,'state','OFF');
end;$$;

-- Vault read is never exposed as a public RPC or owner status response.
create or replace function production_control.worker_supervisor_key_v1(secret_id uuid)
returns text language plpgsql security definer set search_path=pg_catalog as $$
declare secret text;
begin
 execute 'select decrypted_secret from vault.decrypted_secrets where id=$1'into strict secret using secret_id;
 if secret !~ '^[0-9a-f]{64,128}$'then raise exception using errcode='55000',message='SUPERVISOR_SIGNING_KEY_UNAVAILABLE';end if;
 return secret;
end;$$;

create or replace function production_control.worker_supervisor_reserve_v1()
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare s production_control.worker_supervisor_v1%rowtype;b jsonb;id uuid:=extensions.gen_random_uuid();nonce uuid:=extensions.gen_random_uuid();
 ticket jsonb;body text;issued bigint;signature text;
begin
 perform production_control.worker_supervisor_owner_v1();
 select * into strict s from production_control.worker_supervisor_v1 for update;
 if s.state<>'ENABLED'then return jsonb_build_object('ok',true,'dispatched',false);end if;
 if s.expires_at<=clock_timestamp()or s.dispatched>=s.budget then
  update production_control.worker_supervisor_v1 set state='OFF',revision=revision+1,reason='WINDOW_OR_BUDGET_EXHAUSTED';
  return jsonb_build_object('ok',true,'dispatched',false);end if;
 b:=production_control.worker_supervisor_binding_v1(s.binding);
 if b is distinct from s.authority_context then
  update production_control.worker_supervisor_v1 set state='HALTED',halt_latched=true,last_halt_reason='BINDING_CHANGED',reason='BINDING_CHANGED',revision=revision+1;
  return jsonb_build_object('ok',true,'dispatched',false);end if;
 if (s.next_at>clock_timestamp()and not(s.slots=2 and s.dispatched<2 and exists(select 1 from production_control.worker_supervisor_faults_v1
  where epoch=s.epoch and fault='CONTENTION'and expires_at>clock_timestamp())))
  or exists(select 1 from production_control.worker_supervisor_invocations_v1 where epoch=s.epoch and state='UNKNOWN')
  or (select count(*)from production_control.worker_supervisor_invocations_v1 where epoch=s.epoch and state in('RESERVED','RUNNING'))>=s.slots then
  return jsonb_build_object('ok',true,'dispatched',false);end if;
 -- The existing runtime gate is required, never enabled by supervision.
 if not exists(select 1 from production_control.certification_admission_v1 where resource_id=b#>>'{resource,resource_id}'and enabled)
  or not exists(select 1 from scoring_authority.ingress_gates where tournament_id=b->>'tournament_id'and state='OPEN')then
  return jsonb_build_object('ok',true,'dispatched',false);end if;
 perform production_control.worker_supervisor_scope_v1();
 issued:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
 ticket:=jsonb_build_object('contract','certification-worker-supervision-v1','invocation_id',id,'nonce',nonce,'epoch',s.epoch,
  'revision',s.revision,'binding_digest',s.binding_digest,'issued_at',issued,'expires_at',issued+30000);body:=ticket::text;
 signature:=encode(extensions.hmac('POST'||chr(10)||'/api/internal/derived-worker/run'||chr(10)||
  (b#>>'{deployment,deployment_origin}')||chr(10)||encode(extensions.digest(body,'sha256'),'hex'),
  production_control.worker_supervisor_key_v1(s.signing_secret_id),'sha256'),'hex');
 insert into production_control.worker_supervisor_invocations_v1(invocation_id,epoch,revision,sequence,nonce,binding_digest,
  ticket_body,issued_at,expires_at,reconcile_after)values(id,s.epoch,s.revision,s.dispatched+1,nonce,s.binding_digest,body,
  to_timestamp(issued/1000.0),to_timestamp((issued+30000)/1000.0),clock_timestamp()+interval '120 seconds');
 update production_control.worker_supervisor_v1 set dispatched=dispatched+1,last_invocation=id,next_at=clock_timestamp()+interval '60 seconds';
 -- Only the owner dispatcher receives a signature, never STATUS/evidence.
 return jsonb_build_object('ok',true,'dispatched',true,'invocation_id',id,'body',body,'signature',signature,
  'origin',b#>>'{deployment,deployment_origin}');
end;$$;

create or replace function public.execute_certification_supervisor_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare s production_control.worker_supervisor_v1%rowtype;i production_control.worker_supervisor_invocations_v1%rowtype;
 b jsonb;ticket jsonb;operation text:=input->>'operation';token text;expected_signature text;plan production_control.worker_supervisor_faults_v1%rowtype;
begin
 perform production_control.assert_production_service_role();
 if input->>'contract' is distinct from 'certification-worker-supervision-v1'then raise exception using errcode='42501',message='SUPERVISOR_OPERATION_DENIED';end if;
 b:=production_control.worker_supervisor_binding_v1(input);
 select * into strict s from production_control.worker_supervisor_v1 for update;
 if operation='BEGIN'then
  ticket:=(input->>'body')::jsonb;
  select * into strict i from production_control.worker_supervisor_invocations_v1 where invocation_id=(ticket->>'invocation_id')::uuid for update;
  expected_signature:=encode(extensions.hmac('POST'||chr(10)||'/api/internal/derived-worker/run'||chr(10)||
   (b#>>'{deployment,deployment_origin}')||chr(10)||encode(extensions.digest(input->>'body','sha256'),'hex'),
   production_control.worker_supervisor_key_v1(s.signing_secret_id),'sha256'),'hex');
  if input->>'signature' is distinct from expected_signature or i.ticket_body is distinct from input->>'body'
   or i.expires_at<=clock_timestamp()then raise exception using errcode='42501',message='SUPERVISOR_SIGNATURE_OR_EXPIRY_DENIED';end if;
  if i.state<>'RESERVED'then raise exception using errcode='42501',message='SUPERVISOR_REPLAY_DENIED';end if;
  if s.state<>'ENABLED'or s.expires_at<=clock_timestamp()or i.epoch<>s.epoch or i.revision<>s.revision
   or b is distinct from s.authority_context then raise exception using errcode='42501',message='SUPERVISOR_DISABLED_OR_STALE';end if;
  perform production_control.worker_supervisor_scope_v1();
  if not exists(select 1 from production_control.certification_admission_v1 where resource_id=b#>>'{resource,resource_id}'and enabled)
   or not exists(select 1 from scoring_authority.ingress_gates where tournament_id=b->>'tournament_id'and state='OPEN')then
   raise exception using errcode='42501',message='SUPERVISOR_ADMISSION_DENIED';end if;
  token:=encode(extensions.gen_random_bytes(32),'hex');
  update production_control.worker_supervisor_invocations_v1 set state='RUNNING',started_at=clock_timestamp(),
   run_token_hash=encode(extensions.digest(token,'sha256'),'hex')where invocation_id=i.invocation_id;
  return jsonb_build_object('ok',true,'invocation_id',i.invocation_id,'run_token',token);
 end if;
 select * into strict i from production_control.worker_supervisor_invocations_v1 where invocation_id=(input->>'invocation_id')::uuid for update;
 if i.run_token_hash is null or i.run_token_hash is distinct from encode(extensions.digest(input->>'run_token','sha256'),'hex')
  or i.epoch<>s.epoch or i.state<>'RUNNING'or i.reconcile_after<=clock_timestamp() then
  raise exception using errcode='42501',message='SUPERVISOR_RUN_TOKEN_DENIED';end if;
 if operation='STEP'then
  if s.state<>'ENABLED'or s.expires_at<=clock_timestamp()or b is distinct from s.authority_context
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

-- No missing HTTP response is proof of job rollback. Expired invocations retain
-- UNKNOWN evidence until owner reconciliation after canonical claims settle.
create or replace function production_control.worker_supervisor_reconcile_v1(input jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare s production_control.worker_supervisor_v1%rowtype;i production_control.worker_supervisor_invocations_v1%rowtype;c jsonb;
begin
 perform production_control.worker_supervisor_owner_v1();perform production_control.worker_supervisor_binding_v1(input);
 select * into strict s from production_control.worker_supervisor_v1 for update;c:=production_control.worker_supervisor_counts_v1();
 for i in select * from production_control.worker_supervisor_invocations_v1 where state in('RESERVED','RUNNING','UNKNOWN')for update loop
  if i.reconcile_after>clock_timestamp()then continue;end if;
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
 perform production_control.worker_supervisor_owner_v1();perform production_control.worker_supervisor_binding_v1(input);
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
 values(null,production_control.tournament_setup_hash_v1(production_control.worker_supervisor_binding_v1(input)-'admission_revision'),input->>'fault',j.engine_key,j.delivery_cycle,j.requested_source_revision,(input->>'expires_at')::timestamptz,
  (input->>'fixture_event_id')::bigint)returning worker_supervisor_faults_v1.plan_id into plan_id;
 insert into production_control.operation_audit_events(event_type,domain,actor,result,details)
 values('CERTIFICATION_SUPERVISOR_FAULT_ARMED','RESOURCE',current_user,'SUCCEEDED',jsonb_build_object('plan_id',plan_id,'fault',input->>'fault','engine_key',j.engine_key,'cycle',j.delivery_cycle));
 return jsonb_build_object('ok',true,'plan_id',plan_id);
end;$$;

-- Short database dispatch, no calculator/network wait under the control lock.
-- pg_net queues only at commit; missing ACK is reconciled from durable state.
create or replace function production_control.worker_supervisor_dispatch_v1()
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare s production_control.worker_supervisor_v1%rowtype;ticket jsonb;headers jsonb;request_id bigint;bypass text;
begin
 perform production_control.worker_supervisor_owner_v1();select * into strict s from production_control.worker_supervisor_v1;
 if s.binding is not null then
  -- A legitimate later release rebind makes the stored dispatcher target stale.
  -- Latch it durably instead of retrying the same old binding every minute.
  begin perform production_control.worker_supervisor_reconcile_v1(s.binding);
  exception when insufficient_privilege then
   update production_control.worker_supervisor_v1 set state=case when state='ENABLED'then 'HALTED'else state end,
    halt_latched=halt_latched or state='ENABLED',last_halt_reason=case when state='ENABLED'then 'STORED_BINDING_STALE'else last_halt_reason end,
    reason='STORED_BINDING_STALE',revision=revision+case when state='ENABLED'then 1 else 0 end
    where epoch=s.epoch;
   return jsonb_build_object('ok',false,'dispatched',false,'code','SUPERVISOR_BINDING_STALE');
  end;
 end if;
 ticket:=production_control.worker_supervisor_reserve_v1();
 if not (ticket->>'dispatched')::boolean then return jsonb_build_object('ok',true,'dispatched',false);end if;
 perform production_control.worker_supervisor_provider_acl_v1();
 headers:=jsonb_build_object('content-type','application/json','x-bagger-worker-signature',ticket->>'signature');
 if s.bypass_secret_id is not null then
  execute 'select decrypted_secret from vault.decrypted_secrets where id=$1'into strict bypass using s.bypass_secret_id;
  headers:=headers||jsonb_build_object('x-vercel-protection-bypass',bypass);end if;
 -- pg_net serializes jsonb with PostgreSQL's jsonb::text, exactly the signed body.
 execute 'select net.http_post(url:=$1,body:=$2,headers:=$3,timeout_milliseconds:=70000)'
  into request_id using (ticket->>'origin')||'/api/internal/derived-worker/run',(ticket->>'body')::jsonb,headers;
 update production_control.worker_supervisor_invocations_v1 set http_request_id=request_id where invocation_id=(ticket->>'invocation_id')::uuid;
 return jsonb_build_object('ok',true,'dispatched',true,'invocation_id',ticket->>'invocation_id');
end;$$;

-- Install only after separately approved provider prerequisites. OFF dispatches
-- perform no work/network request; STOP is effective without editing cron rows.
create or replace function production_control.worker_supervisor_schedule_v1(input jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare job_id bigint;
begin
 perform production_control.worker_supervisor_owner_v1();perform production_control.worker_supervisor_binding_v1(input);
 if not exists(select 1 from production_control.worker_supervisor_v1 where state='OFF')then
  raise exception using errcode='42501',message='SUPERVISOR_OFF_REQUIRED';end if;
 if not exists(select 1 from pg_extension where extname='pg_cron')or not exists(select 1 from pg_extension where extname='pg_net')
  or to_regclass('vault.decrypted_secrets')is null then raise exception using errcode='55000',message='SUPERVISOR_PROVIDER_PREREQUISITES_REQUIRED';end if;
 perform production_control.worker_supervisor_provider_acl_v1();
 execute 'select cron.schedule($1,$2,$3)'into job_id using 'certification-derived-worker-v1','* * * * *',
  'select production_control.worker_supervisor_dispatch_v1()';
 return jsonb_build_object('ok',true,'job_id',job_id,'supervisor','OFF');
end;$$;

do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where (n.nspname='production_control'and p.proname like 'worker_supervisor_%_v1')or(n.nspname='public'and p.proname='execute_certification_supervisor_v1')loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);end loop;
end;$$;
grant execute on function public.execute_certification_supervisor_v1(jsonb)to service_role;
create or replace function production_control.worker_supervisor_installation_image_v1()
returns jsonb language sql security invoker set search_path=pg_catalog as $$
 select jsonb_build_object('functions',(select jsonb_agg(jsonb_build_object('identity',p.oid::regprocedure::text,
  'body',encode(extensions.digest(pg_get_functiondef(p.oid),'sha256'),'hex'),'owner',p.proowner,'acl',p.proacl::text)
  order by p.oid::regprocedure::text)from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where(n.nspname='production_control'and p.proname like 'worker_supervisor_%_v1')
   or(n.nspname='public'and p.proname='execute_certification_supervisor_v1')),
 'tables',(select jsonb_agg(jsonb_build_object('identity',c.oid::regclass::text,'owner',c.relowner,'acl',c.relacl::text,
  'rls',c.relrowsecurity,'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',a.atttypid,
   'nullable',not a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid))order by a.attnum)
   from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
   where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
  'constraints',(select jsonb_agg(pg_get_constraintdef(k.oid)order by k.conname)from pg_constraint k where k.conrelid=c.oid))
  order by c.oid::regclass::text)from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='production_control'and c.relkind='r'and c.relname like 'worker_supervisor_%_v1'));
$$;
revoke all on function production_control.worker_supervisor_installation_image_v1()from public,anon,authenticated,service_role;
insert into production_control.worker_supervisor_installation_v1(singleton,image)
 values(true,production_control.worker_supervisor_installation_image_v1())on conflict do nothing;
commit;
