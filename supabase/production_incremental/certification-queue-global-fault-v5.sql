\set ON_ERROR_STOP on
-- Forward-only Certification fault v5. No provider trigger/secret/job/domain changes.
-- Install OFF/disabled/paused after Queue v2, publisher v3 and safeupdate v4.
-- ARM targets committed unpublished reservations; every TAKE follows canonical BEGIN.
begin;
select pg_advisory_xact_lock(hashtextextended('certification-worker-supervision-v1-install',0));
do $preflight$begin
 perform production_control.worker_supervisor_owner_v1();
 perform pg_advisory_xact_lock(production_control.scoring_admission_lock_key());
 perform 1 from production_control.worker_supervisor_v1 where singleton for update;
 if not exists(select 1 from production_control.canonical_resource_v1 where singleton
  and resource_class='CERTIFICATION'and resource_id='CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51'
  and project_ref='trmcwrljjxwhgtikfdgu'and registration_revision=1 and database_name=current_database())
  or exists(select 1 from production_control.certification_admission_v1 where enabled)
  or exists(select 1 from scoring_authority.ingress_gates where state<>'PAUSED')
  or (select count(*)from production_control.worker_supervisor_v1)<>1
  or not exists(select 1 from production_control.worker_supervisor_v1 where singleton and state='OFF')
  or exists(select 1 from production_control.worker_supervisor_invocations_v1 where state in('RESERVED','RUNNING','UNKNOWN'))
  or (production_control.worker_supervisor_counts_v1()->>'active_claims')::integer<>0
  or (production_control.worker_supervisor_counts_v1()->>'active_leases')::integer<>0 then
  raise exception 'SUPERVISOR_SAFE_INSTALL_CONTEXT_REQUIRED';end if;
 if to_regclass('production_control.worker_supervisor_global_fault_installation_v5')is null then
  if (select image from production_control.worker_supervisor_safeupdate_installation_v4 where singleton)
   is distinct from production_control.worker_supervisor_publisher_image_v3()then raise exception 'SUPERVISOR_PREDECESSOR_DRIFT';end if;
 else
  if (select image from production_control.worker_supervisor_global_fault_installation_v5 where singleton)
   is distinct from production_control.worker_supervisor_global_fault_image_v5()then raise exception 'SUPERVISOR_GLOBAL_FAULT_ARTIFACT_DRIFT';end if;
 end if;
end;$preflight$;
create table if not exists production_control.worker_supervisor_global_faults_v5(
 plan_id uuid primary key,epoch uuid not null unique,supervisor_revision bigint not null,
 binding_digest text not null,authority_context jsonb not null,
 fault text not null check(fault in('GLOBAL_TRANSIENT','GLOBAL_DETERMINISTIC','INVOCATION_LOST_ACK')),
 target_invocations uuid[] not null check(cardinality(target_invocations)between 1 and 3),
 initial_uses integer not null check(initial_uses between 1 and 3),
 remaining_uses integer not null check(remaining_uses between 0 and initial_uses),
 cancelled_uses integer not null default 0 check(cancelled_uses between 0 and initial_uses),
 expires_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),
 owner_name text not null,corrected_at timestamptz,correction_result text,
 check(remaining_uses+cancelled_uses<=initial_uses),check(initial_uses=cardinality(target_invocations)),check(fault='GLOBAL_TRANSIENT'or initial_uses=1));
create table if not exists production_control.worker_supervisor_global_fault_consumptions_v5(
 invocation_id uuid primary key references production_control.worker_supervisor_invocations_v1(invocation_id),
 plan_id uuid not null references production_control.worker_supervisor_global_faults_v5(plan_id),
 boundary text not null check(boundary in('TICK','ACK')),fault text not null,
 consumed_at timestamptz not null default clock_timestamp(),result text not null);
create table if not exists production_control.worker_supervisor_global_fault_receipts_v5(
 request_id uuid primary key,request_hash text not null,response jsonb not null,created_at timestamptz not null default clock_timestamp());
create table if not exists production_control.worker_supervisor_global_fault_installation_v5(
 singleton boolean primary key default true check(singleton),predecessor_image jsonb not null,
 image jsonb not null,history jsonb not null,metadata jsonb not null,installed_at timestamptz not null default clock_timestamp());
alter table production_control.worker_supervisor_global_faults_v5 enable row level security;
alter table production_control.worker_supervisor_global_fault_consumptions_v5 enable row level security;
alter table production_control.worker_supervisor_global_fault_receipts_v5 enable row level security;
alter table production_control.worker_supervisor_global_fault_installation_v5 enable row level security;
revoke all on production_control.worker_supervisor_global_faults_v5,production_control.worker_supervisor_global_fault_consumptions_v5,
 production_control.worker_supervisor_global_fault_receipts_v5,production_control.worker_supervisor_global_fault_installation_v5
 from public,anon,authenticated,service_role;
create or replace function production_control.worker_supervisor_global_fault_control_v5(input jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare s production_control.worker_supervisor_v1%rowtype;b jsonb;plan production_control.worker_supervisor_global_faults_v5%rowtype;
 receipt production_control.worker_supervisor_global_fault_receipts_v5%rowtype;ids uuid[];n integer;deadline timestamptz;
 req uuid:=(input->>'request_id')::uuid;h text;response jsonb;
begin
 perform production_control.worker_supervisor_owner_v1();b:=production_control.worker_supervisor_queue_binding_v2(input);
 select * into strict s from production_control.worker_supervisor_v1 where singleton for update;
 if exists(select 1 from jsonb_object_keys(input)k where k not in('resource','deployment','action','request_id','expected_revision','fault','uses','expires_at'))
  or input->>'action'is null or input->>'action'not in('ARM','CORRECT')or req is null then raise exception using errcode='42501',message='SUPERVISOR_GLOBAL_FAULT_DENIED';end if;
 h:=production_control.tournament_setup_hash_v1(input);
 select * into receipt from production_control.worker_supervisor_global_fault_receipts_v5 where request_id=req;
 if found then if receipt.request_hash<>h then raise exception using errcode='PT409',message='SUPERVISOR_REQUEST_CONFLICT';end if;
  return receipt.response||jsonb_build_object('idempotent',true);end if;
 if input->>'expected_revision'is distinct from s.revision::text then raise exception using errcode='PT409',message='SUPERVISOR_REVISION_STALE';end if;
 if input->>'action'='ARM'then
  n:=(input->>'uses')::integer;deadline:=(input->>'expires_at')::timestamptz;
  if input->>'fault'is null or input->>'fault'not in('GLOBAL_TRANSIENT','GLOBAL_DETERMINISTIC','INVOCATION_LOST_ACK')or n is null or n not between 1 and 3
   or(input->>'fault'<>'GLOBAL_TRANSIENT'and n<>1)or deadline is null or deadline<=clock_timestamp()
   or deadline>clock_timestamp()+interval '10 minutes'or deadline>s.expires_at
   or s.state<>'ENABLED'or s.halt_latched or s.transport<>'QUEUE_V2'or s.authority_context is distinct from b
   or exists(select 1 from production_control.worker_supervisor_global_faults_v5 where epoch=s.epoch)
   or exists(select 1 from production_control.worker_supervisor_faults_v1 where epoch=s.epoch and expires_at>clock_timestamp())then
   raise exception using errcode='42501',message='SUPERVISOR_GLOBAL_FAULT_DENIED';end if;
  select array_agg(invocation_id order by sequence)into ids from(select invocation_id,sequence from production_control.worker_supervisor_invocations_v1
   where epoch=s.epoch and revision=s.revision and state='RESERVED'and transport='QUEUE_V2'and publication_state='RESERVED'
   and publication_attempts=0 and started_at is null and scheduled_at>clock_timestamp()and expires_at<=deadline
   order by sequence limit n for update)eligible;
  if coalesce(cardinality(ids),0)<>n then raise exception using errcode='42501',message='SUPERVISOR_GLOBAL_FAULT_DENIED';end if;
  insert into production_control.worker_supervisor_global_faults_v5(plan_id,epoch,supervisor_revision,binding_digest,authority_context,
   fault,target_invocations,initial_uses,remaining_uses,expires_at,owner_name)
  values(extensions.gen_random_uuid(),s.epoch,s.revision,s.binding_digest,b,input->>'fault',ids,n,n,deadline,current_user)returning * into plan;
  response:=jsonb_build_object('ok',true,'plan_id',plan.plan_id,'fault',plan.fault,'epoch',plan.epoch,'uses',n,'expires_at',deadline);
 else
  -- The owner correction invokes authoritative reconciliation itself. It cannot
  -- assert that missing ACKs rolled back, or clear an unresolved live outcome.
  perform production_control.worker_supervisor_reconcile_v1(input-'action'-'request_id'-'expected_revision');
  select * into strict s from production_control.worker_supervisor_v1 where singleton for update;
  select * into strict plan from production_control.worker_supervisor_global_faults_v5 where epoch=s.epoch for update;
  if s.state not in('OFF','HALTED')or exists(select 1 from production_control.worker_supervisor_invocations_v1
   where state in('RESERVED','RUNNING','UNKNOWN'))or (production_control.worker_supervisor_counts_v1()->>'active_claims')::integer<>0
   or (production_control.worker_supervisor_counts_v1()->>'active_leases')::integer<>0
   or (production_control.worker_supervisor_counts_v1()->>'dead_letters')::integer<>0 then
   raise exception using errcode='PT409',message='SUPERVISOR_FAULT_CORRECTION_REQUIRED';end if;
  update production_control.worker_supervisor_global_faults_v5 set cancelled_uses=cancelled_uses+remaining_uses,remaining_uses=0,corrected_at=coalesce(corrected_at,clock_timestamp()),
   correction_result='SYNTHETIC_CAUSE_REMOVED_CANONICAL_OUTCOMES_RECONCILED'where plan_id=plan.plan_id returning * into plan;
  if not found then raise exception using errcode='P0001',message='SUPERVISOR_GLOBAL_FAULT_DRIFT';end if;
  response:=jsonb_build_object('ok',true,'plan_id',plan.plan_id,'epoch',plan.epoch,'corrected',true,'remaining_uses',0);
 end if;
 insert into production_control.worker_supervisor_global_fault_receipts_v5(request_id,request_hash,response)values(req,h,response);
 insert into production_control.operation_audit_events(event_type,domain,actor,result,details)
 values('CERTIFICATION_GLOBAL_FAULT_'||(input->>'action'),'WORKERS',current_user,'SUCCEEDED',response);
 return response;
exception when no_data_found or invalid_text_representation then raise exception using errcode='42501',message='SUPERVISOR_GLOBAL_FAULT_DENIED';
end;$$;
create or replace function production_control.worker_supervisor_global_fault_take_v5(input jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare s production_control.worker_supervisor_v1%rowtype;i production_control.worker_supervisor_invocations_v1%rowtype;
 plan production_control.worker_supervisor_global_faults_v5%rowtype;b jsonb;
begin
 b:=production_control.worker_supervisor_queue_binding_v2(input);
 select * into strict s from production_control.worker_supervisor_v1 where singleton for update;
 select * into strict i from production_control.worker_supervisor_invocations_v1 where invocation_id=(input->>'invocation_id')::uuid for update;
 if input->>'boundary'is null or input->>'boundary'not in('TICK','ACK')or i.state<>'RUNNING'or i.transport<>'QUEUE_V2'
  or i.run_token_hash is null or i.run_token_hash is distinct from encode(extensions.digest(input->>'run_token','sha256'),'hex')
  or i.epoch<>s.epoch or i.revision<>s.revision or s.authority_context is distinct from b
  or s.state<>'ENABLED'or s.halt_latched or s.expires_at<=clock_timestamp()
  or clock_timestamp()>=i.started_at+interval '45 seconds'or i.step_sequence<1
  or(input->>'boundary'='TICK'and i.tick_recorded)or(input->>'boundary'='ACK'and not coalesce(i.tick_success,false))then
  raise exception using errcode='42501',message='SUPERVISOR_GLOBAL_FAULT_DENIED';end if;
 if exists(select 1 from production_control.worker_supervisor_global_fault_consumptions_v5 where invocation_id=i.invocation_id)then
  return jsonb_build_object('ok',true,'fault',null);end if;
 select * into plan from production_control.worker_supervisor_global_faults_v5 where epoch=s.epoch and supervisor_revision=s.revision
  and binding_digest=s.binding_digest and authority_context=b and corrected_at is null and expires_at>clock_timestamp()
  and remaining_uses>0 and i.invocation_id=any(target_invocations)
  and((input->>'boundary'='TICK'and fault in('GLOBAL_TRANSIENT','GLOBAL_DETERMINISTIC'))
   or(input->>'boundary'='ACK'and fault='INVOCATION_LOST_ACK'))for update;
 if not found then return jsonb_build_object('ok',true,'fault',null);end if;
 insert into production_control.worker_supervisor_global_fault_consumptions_v5(invocation_id,plan_id,boundary,fault,result)
 values(i.invocation_id,plan.plan_id,input->>'boundary',plan.fault,'FIXED_BOUNDARY_SELECTED');
 update production_control.worker_supervisor_global_faults_v5 set remaining_uses=remaining_uses-1 where plan_id=plan.plan_id and remaining_uses>0;
 if not found then raise exception using errcode='P0001',message='SUPERVISOR_GLOBAL_FAULT_DRIFT';end if;
 insert into production_control.operation_audit_events(event_type,domain,actor,result,details)
 values('CERTIFICATION_GLOBAL_FAULT_CONSUMED','WORKERS','PRIVATE_QUEUE','SELECTED',
  jsonb_build_object('plan_id',plan.plan_id,'epoch',s.epoch,'invocation_id',i.invocation_id,'fault',plan.fault,'boundary',input->>'boundary'));
 return jsonb_build_object('ok',true,'fault',plan.fault);
exception when no_data_found or invalid_text_representation then raise exception using errcode='42501',message='SUPERVISOR_GLOBAL_FAULT_DENIED';
end;$$;
create or replace function production_control.worker_supervisor_global_fault_image_v5()
returns jsonb language sql security invoker set search_path=pg_catalog as $$
 select jsonb_build_object('base',production_control.worker_supervisor_publisher_image_v3(),
 'functions',(select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'body',encode(extensions.digest(p.prosrc,'sha256'),'hex'),
 'owner',p.proowner,'acl',p.proacl,'security',p.prosecdef,'config',p.proconfig)order by p.oid::regprocedure::text)
 from pg_proc p where p.oid in('production_control.worker_supervisor_global_fault_control_v5(jsonb)'::regprocedure,
 'production_control.worker_supervisor_global_fault_take_v5(jsonb)'::regprocedure,
 'production_control.worker_supervisor_global_fault_image_v5()'::regprocedure)),
 'relations',(select jsonb_agg(jsonb_build_object('name',c.oid::regclass::text,'owner',c.relowner,'acl',c.relacl,'rls',c.relrowsecurity,
 'columns',(select jsonb_agg(jsonb_build_object('name',attname,'type',atttypid,'null',attnotnull)order by attnum)from pg_attribute where attrelid=c.oid and attnum>0 and not attisdropped),
 'constraints',(select jsonb_agg(pg_get_constraintdef(oid)order by conname)from pg_constraint where conrelid=c.oid))order by c.oid::regclass::text)
 from pg_class c where c.oid in('production_control.worker_supervisor_global_faults_v5'::regclass,
 'production_control.worker_supervisor_global_fault_consumptions_v5'::regclass,
 'production_control.worker_supervisor_global_fault_receipts_v5'::regclass,
 'production_control.worker_supervisor_global_fault_installation_v5'::regclass)));
$$;
revoke all on function production_control.worker_supervisor_global_fault_control_v5(jsonb),
 production_control.worker_supervisor_global_fault_take_v5(jsonb),production_control.worker_supervisor_global_fault_image_v5()
 from public,anon,authenticated,service_role;
do $correction$
declare patch jsonb;edit jsonb;definition text;body text;before_metadata jsonb;after_metadata jsonb;
 all_metadata jsonb:='{}';history_snapshot jsonb;hash text;
 manifest jsonb:=$manifest$[
 {
  "signature": "public.execute_certification_queue_supervisor_v2(jsonb)",
  "old_hash": "061b99fd50ff253aa3d2160ced7cff5c4d1496dd6894e638c60b6beec5f69997",
  "new_hash": "4fb00bc4d25645732a46174656186120b8139bf4fa9d0c7a13b418125597075e",
  "edits": [
   {
    "old": "return jsonb_build_object('ok',true,'admitted',true,'invocation_id',i.invocation_id,'run_token',token);",
    "new": "return jsonb_build_object('ok',true,'admitted',true,'invocation_id',i.invocation_id,'run_token',token,'fault_contract','certification-global-fault-v5');"
   },
   {
    "old": "elsif operation='FAULT'then",
    "new": "elsif operation='GLOBAL_FAULT'then\n  return production_control.worker_supervisor_global_fault_take_v5(input);\n elsif operation='FAULT'then"
   }
  ]
 },
 {
  "signature": "production_control.worker_supervisor_control_v1(jsonb)",
  "old_hash": "aebd1b571c015fb5c66d6cce7eca266a23cc3ec868355dca16b45b1e9793fd35",
  "new_hash": "4849cc5dbd7e8986f8bc9b693d0677e0cf532b3c494192f22fab3baebce31f08",
  "edits": [
   {
    "old": "if action in('START','RESUME')then",
    "new": "if action='RESUME'and exists(select 1 from production_control.worker_supervisor_global_faults_v5\n  where epoch=s.epoch and corrected_at is null)then\n  raise exception using errcode='PT409',message='SUPERVISOR_FAULT_CORRECTION_REQUIRED';end if;\n if action in('START','RESUME')then"
   }
  ]
 },
 {
  "signature": "production_control.worker_supervisor_status_v1(jsonb)",
  "old_hash": "1da494288e292087fdeb3f4fca3a9ad783c8448c06f09af1cd9082196d0ac0e3",
  "new_hash": "d395cf4d3e9cca0be243d40e29d58cb272c40eea0311d8791347ace5a010aeba",
  "edits": [
   {
    "old": "'counts',production_control.worker_supervisor_counts_v1());",
    "new": "'counts',production_control.worker_supervisor_counts_v1(),\n 'global_faults',(select jsonb_build_object('plans',count(*),'remaining_uses',coalesce(sum(remaining_uses),0),\n 'consumed_uses',coalesce(sum(initial_uses-remaining_uses-cancelled_uses),0),'cancelled_uses',coalesce(sum(cancelled_uses),0),'correction_required',coalesce(bool_or(corrected_at is null),false))\n from production_control.worker_supervisor_global_faults_v5 where epoch=s.epoch));"
   }
  ]
 }
]$manifest$;
begin
 select jsonb_build_object('v1',(select to_jsonb(t)from production_control.worker_supervisor_installation_v1 t where singleton),
 'v2',(select to_jsonb(t)from production_control.worker_supervisor_queue_installation_v2 t where singleton),
 'v3',(select to_jsonb(t)from production_control.worker_supervisor_publisher_installation_v3 t where singleton),
 'v4',(select to_jsonb(t)from production_control.worker_supervisor_safeupdate_installation_v4 t where singleton))into history_snapshot;
 if exists(select 1 from production_control.worker_supervisor_global_fault_installation_v5 where singleton and history is distinct from history_snapshot)then
  raise exception 'SUPERVISOR_HISTORY_RECEIPT_DRIFT';end if;
 for patch in select value from jsonb_array_elements(manifest)loop
  select p.prosrc,jsonb_build_object('owner',p.proowner,'acl',p.proacl,'security',p.prosecdef,'config',p.proconfig,
   'language',p.prolang,'volatile',p.provolatile,'parallel',p.proparallel,'strict',p.proisstrict)
   into strict body,before_metadata from pg_proc p where p.oid=(patch->>'signature')::regprocedure;
  hash:=encode(extensions.digest(body,'sha256'),'hex');
  if hash not in(patch->>'old_hash',patch->>'new_hash')then raise exception 'SUPERVISOR_FUNCTION_PREDECESSOR_DRIFT: %',patch->>'signature';end if;
  if hash=patch->>'old_hash'then
   definition:=pg_get_functiondef((patch->>'signature')::regprocedure);
   for edit in select value from jsonb_array_elements(patch->'edits')loop
    if(length(body)-length(replace(body,edit->>'old','')))/length(edit->>'old')<>1 then raise exception 'SUPERVISOR_PATCH_COUNT_DRIFT';end if;
    body:=replace(body,edit->>'old',edit->>'new');definition:=replace(definition,edit->>'old',edit->>'new');
   end loop;
   if encode(extensions.digest(body,'sha256'),'hex')<>patch->>'new_hash'then raise exception 'SUPERVISOR_PATCH_HASH_DRIFT';end if;
   execute definition;
  end if;
  select jsonb_build_object('owner',p.proowner,'acl',p.proacl,'security',p.prosecdef,'config',p.proconfig,
   'language',p.prolang,'volatile',p.provolatile,'parallel',p.proparallel,'strict',p.proisstrict)
   into strict after_metadata from pg_proc p where p.oid=(patch->>'signature')::regprocedure;
  if before_metadata is distinct from after_metadata then raise exception 'SUPERVISOR_FUNCTION_METADATA_DRIFT';end if;
  all_metadata:=all_metadata||jsonb_build_object(patch->>'signature',after_metadata);
 end loop;
 if exists(select 1 from production_control.worker_supervisor_global_fault_installation_v5 where singleton and
  (image is distinct from production_control.worker_supervisor_global_fault_image_v5()or metadata is distinct from all_metadata))then
  raise exception 'SUPERVISOR_GLOBAL_FAULT_RECEIPT_DRIFT';end if;
 insert into production_control.worker_supervisor_global_fault_installation_v5(singleton,predecessor_image,image,history,metadata)
 values(true,history_snapshot#>'{v4,image}',production_control.worker_supervisor_global_fault_image_v5(),history_snapshot,all_metadata)on conflict do nothing;
end;$correction$;
commit;
