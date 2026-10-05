\set ON_ERROR_STOP on
-- Forward-only Certification Queue retry envelope v6. One error DETAIL only.
-- No authority predicate, mutation, job/claim/lease/domain or provider change.
-- Exact v5 body/hash and metadata guarded; v1-v5 receipts remain historical.
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
 if to_regclass('production_control.worker_supervisor_retry_envelope_installation_v6')is null then
  if (select count(*)from production_control.worker_supervisor_global_fault_installation_v5)<>1
   or(select image from production_control.worker_supervisor_global_fault_installation_v5 where singleton)
   is distinct from production_control.worker_supervisor_global_fault_image_v5()then raise exception 'SUPERVISOR_PREDECESSOR_DRIFT';end if;
 else
  if(select image from production_control.worker_supervisor_retry_envelope_installation_v6 where singleton)
   is distinct from production_control.worker_supervisor_global_fault_image_v5()then raise exception 'SUPERVISOR_RETRY_ENVELOPE_ARTIFACT_DRIFT';end if;
 end if;
end;$preflight$;
create table if not exists production_control.worker_supervisor_retry_envelope_installation_v6(
 singleton boolean primary key default true check(singleton),predecessor_image jsonb not null,
 image jsonb not null,history jsonb not null,metadata jsonb not null,installed_at timestamptz not null default clock_timestamp());
alter table production_control.worker_supervisor_retry_envelope_installation_v6 enable row level security;
revoke all on production_control.worker_supervisor_retry_envelope_installation_v6 from public,anon,authenticated,service_role;
do $correction$
declare patch jsonb;edit jsonb;definition text;body text;before_metadata jsonb;after_metadata jsonb;
 all_metadata jsonb:='{}';history_snapshot jsonb;hash text;
 manifest jsonb:=$manifest$[
  {
    "signature": "public.execute_certification_queue_supervisor_v2(jsonb)",
    "old_hash": "4fb00bc4d25645732a46174656186120b8139bf4fa9d0c7a13b418125597075e",
    "new_hash": "26168835e5edd3448f7a38d64ce87c89d767b1f749fbd117d7ae77d7e16a2d33",
    "edits": [
      {
        "old": "raise exception using errcode='PT409',message='SUPERVISOR_NOT_DUE_OR_BUSY';end if;",
        "new": "raise exception using errcode='PT409',message='SUPERVISOR_NOT_DUE_OR_BUSY',\n    detail=jsonb_build_object('reason',case when clock_timestamp()<i.scheduled_at or clock_timestamp()<s.next_at then 'NOT_DUE'else 'BUSY'end,\n     'retry_after_seconds',case when clock_timestamp()<i.scheduled_at or clock_timestamp()<s.next_at\n      then greatest(1,ceil(extract(epoch from(greatest(i.scheduled_at,s.next_at)-clock_timestamp())))::integer)else 15 end)::text;end if;"
      }
    ]
  }
]$manifest$;
begin
 select jsonb_build_object('v1',(select to_jsonb(t)from production_control.worker_supervisor_installation_v1 t where singleton),
 'v2',(select to_jsonb(t)from production_control.worker_supervisor_queue_installation_v2 t where singleton),
 'v3',(select to_jsonb(t)from production_control.worker_supervisor_publisher_installation_v3 t where singleton),
 'v4',(select to_jsonb(t)from production_control.worker_supervisor_safeupdate_installation_v4 t where singleton),
 'v5',(select to_jsonb(t)from production_control.worker_supervisor_global_fault_installation_v5 t where singleton))into history_snapshot;
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
 if exists(select 1 from production_control.worker_supervisor_retry_envelope_installation_v6 where singleton and
  (image is distinct from production_control.worker_supervisor_global_fault_image_v5()or metadata is distinct from all_metadata
   or history is distinct from history_snapshot))then raise exception 'SUPERVISOR_RETRY_ENVELOPE_RECEIPT_DRIFT';end if;
 insert into production_control.worker_supervisor_retry_envelope_installation_v6(singleton,predecessor_image,image,history,metadata)
 values(true,history_snapshot#>'{v5,image}',production_control.worker_supervisor_global_fault_image_v5(),history_snapshot,all_metadata)on conflict do nothing;
end;$correction$;
commit;
