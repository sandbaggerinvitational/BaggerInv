\set ON_ERROR_STOP on
-- Forward-only owner-to-Preview publisher handoff. No reusable credential, new
-- provider secret, worker authority, owner SQL grant, or consumer change.
begin;
select pg_advisory_xact_lock(hashtextextended('certification-worker-supervision-v1-install',0));
do $$begin
 perform production_control.worker_supervisor_owner_v1();
 if exists(select 1 from production_control.certification_admission_v1 where enabled)
  or exists(select 1 from scoring_authority.ingress_gates where state<>'PAUSED')
  or not exists(select 1 from production_control.worker_supervisor_v1 where state='OFF')
  or exists(select 1 from production_control.worker_supervisor_invocations_v1 where state in('RESERVED','RUNNING','UNKNOWN')) then
  raise exception 'SUPERVISOR_SAFE_INSTALL_CONTEXT_REQUIRED';end if;
 if to_regclass('production_control.worker_supervisor_publisher_installation_v3')is null then
  if (select image from production_control.worker_supervisor_queue_installation_v2 where singleton)
   is distinct from production_control.worker_supervisor_installation_image_v1()then raise exception 'SUPERVISOR_PREDECESSOR_DRIFT';end if;
 else
  if (select image from production_control.worker_supervisor_publisher_installation_v3 where singleton)
   is distinct from production_control.worker_supervisor_publisher_image_v3()then raise exception 'SUPERVISOR_PUBLISHER_ARTIFACT_DRIFT';end if;
 end if;
 if not exists(select 1 from production_control.canonical_resource_v1 where resource_class='CERTIFICATION'
  and resource_id='CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51'and project_ref='trmcwrljjxwhgtikfdgu'
  and registration_revision=1 and database_name=current_database())then raise exception 'SUPERVISOR_RESOURCE_DENIED';end if;
end;$$;
create table if not exists production_control.worker_supervisor_publisher_installation_v3(
 singleton boolean primary key default true check(singleton),predecessor_image jsonb not null,image jsonb not null,
 installed_at timestamptz not null default clock_timestamp());
create table if not exists production_control.worker_supervisor_publication_permits_v3(
 permit_id uuid primary key,permit_hash text not null unique check(permit_hash~'^[0-9a-f]{64}$'),
 epoch uuid not null,revision bigint not null,expires_at timestamptz not null,
 state text not null check(state in('ISSUED','CONSUMED','COMPLETE','CANCELLED')),
 started_at timestamptz,run_token_hash text,completed_at timestamptz);
alter table production_control.worker_supervisor_publisher_installation_v3 enable row level security;
alter table production_control.worker_supervisor_publication_permits_v3 enable row level security;
revoke all on production_control.worker_supervisor_publisher_installation_v3,production_control.worker_supervisor_publication_permits_v3 from public,anon,authenticated,service_role;
create or replace function production_control.worker_supervisor_publication_account_v3(input jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare s production_control.worker_supervisor_v1%rowtype;b jsonb;i production_control.worker_supervisor_invocations_v1%rowtype;response jsonb;
begin
 b:=production_control.worker_supervisor_queue_binding_v2(input);
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
create or replace function production_control.worker_supervisor_queue_publication_v2(input jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$begin
 perform production_control.worker_supervisor_owner_v1();
 return production_control.worker_supervisor_publication_account_v3(input);
end;$$;
-- SQL owner only. START must already be committed. A one-use, 60-second handoff
-- only delegates publication of the committed finite batch, never START/minting.
create or replace function production_control.worker_supervisor_publisher_permit_v3(input jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare s production_control.worker_supervisor_v1%rowtype;b jsonb;secret text;id uuid:=extensions.gen_random_uuid();
begin
 perform production_control.worker_supervisor_owner_v1();b:=production_control.worker_supervisor_queue_binding_v2(input);
 select * into strict s from production_control.worker_supervisor_v1 for update;
 if s.state<>'ENABLED'or s.halt_latched or s.expires_at<=clock_timestamp()or s.authority_context is distinct from b
  or input->>'expected_revision' is distinct from s.revision::text then raise exception using errcode='42501',message='SUPERVISOR_DISABLED_OR_STALE';end if;
 if exists(select 1 from production_control.worker_supervisor_publication_permits_v3 where epoch=s.epoch and state='CONSUMED'
  and started_at+interval '45 seconds'>clock_timestamp())then raise exception using errcode='PT409',message='SUPERVISOR_PUBLISHER_BUSY';end if;
 update production_control.worker_supervisor_publication_permits_v3 set state='CANCELLED'where state='ISSUED';
 secret:=encode(extensions.gen_random_bytes(32),'hex');
 insert into production_control.worker_supervisor_publication_permits_v3(permit_id,permit_hash,epoch,revision,expires_at,state)
 values(id,encode(extensions.digest(secret,'sha256'),'hex'),s.epoch,s.revision,clock_timestamp()+interval '60 seconds','ISSUED');
 insert into production_control.operation_audit_events(event_type,domain,actor,result,details)
 values('CERTIFICATION_QUEUE_PUBLICATION_HANDOFF','WORKERS',jsonb_build_object('role','OWNER'),'ISSUED',
  jsonb_build_object('permit_id',id,'epoch',s.epoch,'revision',s.revision));
 return jsonb_build_object('ok',true,'permit',secret,'expires_in_seconds',60);
end;$$;
-- Service role is transport only, not owner authority. A bare service-role call
-- cannot mint a permit or reservations. Only possession of the owner-issued,
-- single-use handoff admits an exact bound Preview publication session.
create or replace function public.execute_certification_queue_publication_v3(input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare s production_control.worker_supervisor_v1%rowtype;p production_control.worker_supervisor_publication_permits_v3%rowtype;
 b jsonb;token text;operation text:=input->>'operation';response jsonb;
begin
 perform production_control.assert_production_service_role();
 if input->>'contract' is distinct from 'certification-queue-publication-v3' or operation not in('BEGIN','BATCH','TRY','ACK','STATUS','CLOSE')
  or exists(select 1 from jsonb_object_keys(input)k where k not in('contract','resource','deployment','operation','permit','permit_id','run_token','invocation_id','message_id'))then
  raise exception using errcode='42501',message='SUPERVISOR_PUBLICATION_REQUEST_DENIED';end if;
 b:=production_control.worker_supervisor_queue_binding_v2(input);
 select * into strict s from production_control.worker_supervisor_v1 for update;
 if s.state<>'ENABLED'or s.halt_latched or s.expires_at<=clock_timestamp()or s.authority_context is distinct from b then
  raise exception using errcode='42501',message='SUPERVISOR_DISABLED_OR_STALE';end if;
 if operation='BEGIN'then
  if input->>'permit' is null or input->>'permit'!~'^[0-9a-f]{64}$'then raise exception using errcode='42501',message='SUPERVISOR_OWNER_PUBLICATION_REQUIRED';end if;
  select * into p from production_control.worker_supervisor_publication_permits_v3
   where permit_hash=encode(extensions.digest(input->>'permit','sha256'),'hex')for update;
  if not found or p.state<>'ISSUED'or p.expires_at<=clock_timestamp()or p.epoch<>s.epoch or p.revision<>s.revision then
   raise exception using errcode='42501',message='SUPERVISOR_OWNER_PUBLICATION_REQUIRED';end if;
  token:=encode(extensions.gen_random_bytes(32),'hex');
  update production_control.worker_supervisor_publication_permits_v3 set state='CONSUMED',started_at=clock_timestamp(),
   run_token_hash=encode(extensions.digest(token,'sha256'),'hex')where permit_id=p.permit_id;
  return jsonb_build_object('ok',true,'permit_id',p.permit_id,'run_token',token,
   'batch',production_control.worker_supervisor_publication_account_v3(input||jsonb_build_object('action','BATCH')));
 end if;
 select * into p from production_control.worker_supervisor_publication_permits_v3 where permit_id=(input->>'permit_id')::uuid for update;
 if not found or p.state<>'CONSUMED'or p.epoch<>s.epoch or p.revision<>s.revision or p.started_at+interval '45 seconds'<=clock_timestamp()
  or input->>'run_token' is null or p.run_token_hash is distinct from encode(extensions.digest(input->>'run_token','sha256'),'hex')then
  raise exception using errcode='42501',message='SUPERVISOR_PUBLISHER_SESSION_DENIED';end if;
 if operation in('BATCH','TRY','ACK')then
  return production_control.worker_supervisor_publication_account_v3(input||jsonb_build_object('action',operation));
 elsif operation='CLOSE'then
  update production_control.worker_supervisor_publication_permits_v3 set state='COMPLETE',completed_at=clock_timestamp()where permit_id=p.permit_id;
  insert into production_control.operation_audit_events(event_type,domain,actor,result,details)
  values('CERTIFICATION_QUEUE_PUBLICATION_FINISHED','WORKERS',jsonb_build_object('role','OWNER_HANDOFF'),'ACCOUNTED',jsonb_build_object('permit_id',p.permit_id,'epoch',s.epoch));
 end if;
 return jsonb_build_object('ok',true,'publication',(select jsonb_build_object('reserved',count(*)filter(where publication_state='RESERVED'),
  'unknown',count(*)filter(where publication_state='UNKNOWN'),'accepted',count(*)filter(where publication_state='ACCEPTED'),
  'delivered',count(*)filter(where publication_state='DELIVERED'),'cancelled',count(*)filter(where publication_state='CANCELLED'))
  from production_control.worker_supervisor_invocations_v1 where epoch=s.epoch));
end;$$;
create or replace function production_control.worker_supervisor_publisher_image_v3()
returns jsonb language sql security invoker set search_path=pg_catalog as $$
 select jsonb_build_object('supervisor',production_control.worker_supervisor_installation_image_v1(),'bridge',
  (select jsonb_build_object('body',encode(extensions.digest(pg_get_functiondef(p.oid),'sha256'),'hex'),'owner',p.proowner,'acl',p.proacl::text)
  from pg_proc p where p.oid='public.execute_certification_queue_publication_v3(jsonb)'::regprocedure));
$$;
revoke all on function production_control.worker_supervisor_publication_account_v3(jsonb),production_control.worker_supervisor_publisher_permit_v3(jsonb),
 production_control.worker_supervisor_publisher_image_v3(),public.execute_certification_queue_publication_v3(jsonb)from public,anon,authenticated,service_role;
grant execute on function public.execute_certification_queue_publication_v3(jsonb)to service_role;
insert into production_control.worker_supervisor_publisher_installation_v3(singleton,predecessor_image,image)
 select true,image,production_control.worker_supervisor_publisher_image_v3()from production_control.worker_supervisor_queue_installation_v2 where singleton on conflict do nothing;
commit;
