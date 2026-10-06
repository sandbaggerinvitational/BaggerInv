\set ON_ERROR_STOP on
-- Forward-only read-only routing disposition v7. No BEGIN/claim/counter/domain mutation.
-- Exact v6 body/hash and existing function metadata preserved.
-- v1-v6 history remains truthful; provider-owned objects are untouched.
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
 if to_regclass('production_control.worker_supervisor_routing_closure_installation_v7')is null then
  if (select count(*)from production_control.worker_supervisor_retry_envelope_installation_v6)<>1
   or(select image from production_control.worker_supervisor_retry_envelope_installation_v6 where singleton)
   is distinct from production_control.worker_supervisor_global_fault_image_v5()then raise exception 'SUPERVISOR_PREDECESSOR_DRIFT';end if;
 else
  if(select image from production_control.worker_supervisor_routing_closure_installation_v7 where singleton)
   is distinct from production_control.worker_supervisor_global_fault_image_v5()then raise exception 'SUPERVISOR_ROUTING_CLOSURE_ARTIFACT_DRIFT';end if;
 end if;
end;$preflight$;
create table if not exists production_control.worker_supervisor_routing_closure_installation_v7(
 singleton boolean primary key default true check(singleton),predecessor_image jsonb not null,
 image jsonb not null,history jsonb not null,metadata jsonb not null,installed_at timestamptz not null default clock_timestamp());
alter table production_control.worker_supervisor_routing_closure_installation_v7 enable row level security;
revoke all on production_control.worker_supervisor_routing_closure_installation_v7 from public,anon,authenticated,service_role;
do $correction$
declare patch jsonb;edit jsonb;definition text;body text;before_metadata jsonb;after_metadata jsonb;
 all_metadata jsonb:='{}';history_snapshot jsonb;hash text;
 manifest jsonb:=$manifest$[
  {
    "signature": "public.execute_certification_queue_supervisor_v2(jsonb)",
    "old_hash": "26168835e5edd3448f7a38d64ce87c89d767b1f749fbd117d7ae77d7e16a2d33",
    "new_hash": "082380fb52b76f82f704663786f3cbae13bc6f71b7fa5676cbde59d263468f8c",
    "edits": [
      {
        "old": " b jsonb;ticket jsonb;",
        "new": " b jsonb;ticket jsonb;routing_reason text;routing_disposition text;"
      },
      {
        "old": " b:=production_control.worker_supervisor_queue_binding_v2(input);\n",
        "new": " b:=production_control.worker_supervisor_queue_binding_v2(input);\n if operation='DISPOSITION'then\n  -- Identification only: no BEGIN, row mutation, claim, counter or run token.\n  -- The owner publication ledger binds the opaque provider message to the\n  -- private invocation. A payload cannot assert its own terminal state.\n  if (select count(*)from jsonb_object_keys(input))<>7\n   or input->'runtime' is distinct from b->'deployment'\n   or jsonb_typeof(input->'provider_message_id') is distinct from 'string'\n   or length(input->>'provider_message_id')not between 1 and 512 then\n   raise exception using errcode='42501',message='SUPERVISOR_RESERVATION_DENIED';end if;\n  ticket:=input->'message';\n  if ticket is null or jsonb_typeof(ticket)<>'object' or(select count(*)from jsonb_object_keys(ticket))<>2\n   or ticket->>'version' is distinct from 'certification-queue-supervision-v2' then\n   raise exception using errcode='42501',message='SUPERVISOR_MESSAGE_DENIED';end if;\n  select * into strict s from production_control.worker_supervisor_v1 where singleton;\n  select * into strict i from production_control.worker_supervisor_invocations_v1\n   where invocation_id=(ticket->>'invocation_id')::uuid and transport='QUEUE_V2';\n  if i.binding_digest !~ '^[0-9a-f]{64}$'or i.reservation_digest !~ '^[0-9a-f]{64}$'\n   or not exists(select 1 from production_control.worker_supervisor_receipts_v1 r\n    where r.response->>'epoch'=i.epoch::text and r.response->'deployment'=b->'deployment')\n   or(i.epoch=s.epoch and i.reservation_digest is distinct from\n    production_control.worker_supervisor_queue_digest_v2(i.invocation_id,i.epoch,i.revision,i.sequence,\n     i.scheduled_at,i.expires_at,s.authority_context,s.engines))\n   or(i.provider_message_id is not null and i.provider_message_id is distinct from input->>'provider_message_id')then\n   raise exception using errcode='42501',message='SUPERVISOR_RESERVATION_DENIED';end if;\n  routing_disposition:='ACK';\n  if i.provider_message_id is null then\n   -- Publication acknowledgement may still be lost/in flight. Never delete a\n   -- message whose provider identity has not been authoritatively recorded.\n   routing_disposition:='RECONCILE';routing_reason:='PUBLICATION_UNKNOWN';\n  elsif i.state in('RUNNING','UNKNOWN')then\n   -- STOP/expiry cannot prove a possibly committed invocation rolled back.\n   routing_disposition:='RECONCILE';routing_reason:=i.state;\n  elsif s.state in('OFF','STOPPING')and i.epoch=s.epoch then routing_reason:='STOPPED';\n  elsif i.publication_state='CANCELLED'then routing_reason:='CANCELLED';\n  elsif i.state='STOPPED'or i.outcome='NOT_STARTED'then routing_reason:='STOPPED';\n  elsif i.epoch<>s.epoch or i.revision<>s.revision then routing_reason:='STALE_EPOCH';\n  elsif i.state<>'RESERVED'then routing_reason:='REPLAY';\n  elsif i.expires_at<=clock_timestamp()or s.expires_at<=clock_timestamp()then routing_reason:='EXPIRED';\n  elsif s.state='HALTED'or s.halt_latched then routing_reason:='HALTED';\n  elsif b is distinct from s.authority_context then routing_reason:='STALE_CONTEXT';\n  elsif not exists(select 1 from production_control.certification_admission_v1\n    where resource_id=b#>>'{resource,resource_id}'and enabled)\n   or not exists(select 1 from scoring_authority.ingress_gates\n    where tournament_id=b->>'tournament_id'and state='OPEN')then routing_reason:='ADMISSION_DENIED';\n  else routing_disposition:='ELIGIBLE';routing_reason:='CURRENT';end if;\n  return jsonb_build_object('ok',true,'identified',true,'execution_authorized',false,\n   'invocation_id',i.invocation_id,'disposition',routing_disposition,'reason',routing_reason);\n end if;\n"
      }
    ]
  }
]$manifest$;
begin
 select jsonb_build_object('v1',(select to_jsonb(t)from production_control.worker_supervisor_installation_v1 t where singleton),
 'v2',(select to_jsonb(t)from production_control.worker_supervisor_queue_installation_v2 t where singleton),
 'v3',(select to_jsonb(t)from production_control.worker_supervisor_publisher_installation_v3 t where singleton),
 'v4',(select to_jsonb(t)from production_control.worker_supervisor_safeupdate_installation_v4 t where singleton),
 'v5',(select to_jsonb(t)from production_control.worker_supervisor_global_fault_installation_v5 t where singleton),
 'v6',(select to_jsonb(t)from production_control.worker_supervisor_retry_envelope_installation_v6 t where singleton))into history_snapshot;
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
 if exists(select 1 from production_control.worker_supervisor_routing_closure_installation_v7 where singleton and
  (image is distinct from production_control.worker_supervisor_global_fault_image_v5()or metadata is distinct from all_metadata
   or history is distinct from history_snapshot))then raise exception 'SUPERVISOR_ROUTING_CLOSURE_RECEIPT_DRIFT';end if;
 insert into production_control.worker_supervisor_routing_closure_installation_v7(singleton,predecessor_image,image,history,metadata)
 values(true,history_snapshot#>'{v6,image}',production_control.worker_supervisor_global_fault_image_v5(),history_snapshot,all_metadata)on conflict do nothing;
end;$correction$;
commit;
