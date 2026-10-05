\set ON_ERROR_STOP on
-- Forward-only Queue v4 portability correction; safeupdate remains enabled.
-- Three function corrections: seven unqualified updates and one conditional transition.
-- No provider/fixture/job/admission changes. Historical v1/v2/v3 receipts preserved.
begin;
select pg_advisory_xact_lock(hashtextextended('certification-worker-supervision-v1-install',0));
do $preflight$
begin
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
 if not exists(select 1 from pg_constraint where conrelid='production_control.worker_supervisor_v1'::regclass
  and contype='p'and pg_get_constraintdef(oid)='PRIMARY KEY (singleton)')
  or not exists(select 1 from pg_constraint where conrelid='production_control.worker_supervisor_v1'::regclass
  and contype='c'and convalidated and pg_get_constraintdef(oid)='CHECK (singleton)')
  or not exists(select 1 from pg_attribute where attrelid='production_control.worker_supervisor_v1'::regclass
  and attname='singleton'and attnotnull and atttypid='boolean'::regtype)then
  raise exception 'SUPERVISOR_SINGLETON_CONTRACT_DRIFT';end if;
 if to_regclass('production_control.worker_supervisor_safeupdate_installation_v4')is null then
  if (select count(*)from production_control.worker_supervisor_publisher_installation_v3)<>1
   or (select image from production_control.worker_supervisor_publisher_installation_v3 where singleton)
    is distinct from production_control.worker_supervisor_publisher_image_v3()then
   raise exception 'SUPERVISOR_PREDECESSOR_DRIFT';end if;
 else
  if (select image from production_control.worker_supervisor_safeupdate_installation_v4 where singleton)
   is distinct from production_control.worker_supervisor_publisher_image_v3()then
   raise exception 'SUPERVISOR_SAFEUPDATE_ARTIFACT_DRIFT';end if;
 end if;
end;$preflight$;
create table if not exists production_control.worker_supervisor_safeupdate_installation_v4(
 singleton boolean primary key default true check(singleton),
 predecessor_image jsonb not null,image jsonb not null,history jsonb not null,metadata jsonb not null,
 installed_at timestamptz not null default clock_timestamp());
alter table production_control.worker_supervisor_safeupdate_installation_v4 enable row level security;
revoke all on production_control.worker_supervisor_safeupdate_installation_v4 from public,anon,authenticated,service_role;
do $correction$
declare patch jsonb;edit jsonb;definition text;body text;before_metadata jsonb;after_metadata jsonb;
 all_metadata jsonb:='{}';history_snapshot jsonb;hash text;
 manifest jsonb:= $manifest$[
 {
  "signature": "production_control.worker_supervisor_control_v1(jsonb)",
  "old_hash": "366cc182977c3ee27524b03907d25e9b4014c6f7560b63eca3565ade49e57c58",
  "new_hash": "aebd1b571c015fb5c66d6cce7eca266a23cc3ec868355dca16b45b1e9793fd35",
  "edits": [
   {
    "old": "update production_control.worker_supervisor_v1 set state='ENABLED',epoch=extensions.gen_random_uuid(),revision=revision+1,\n   binding=jsonb_build_object('resource',input->'resource','deployment',input->'deployment'),\n   binding_digest=production_control.tournament_setup_hash_v1(b),authority_context=b,\n   expires_at=clock_timestamp()+make_interval(secs=>duration),budget=n,dispatched=n,slots=(input->>'slots')::integer,\n   tick_failures=0,invocation_failures=0,last_tick_sequence=0,next_at=clock_timestamp(),reason=null,halt_latched=false,\n   transport='QUEUE_V2' returning * into s;",
    "new": "update production_control.worker_supervisor_v1 set state='ENABLED',epoch=extensions.gen_random_uuid(),revision=revision+1,\n   binding=jsonb_build_object('resource',input->'resource','deployment',input->'deployment'),\n   binding_digest=production_control.tournament_setup_hash_v1(b),authority_context=b,\n   expires_at=clock_timestamp()+make_interval(secs=>duration),budget=n,dispatched=n,slots=(input->>'slots')::integer,\n   tick_failures=0,invocation_failures=0,last_tick_sequence=0,next_at=clock_timestamp(),reason=null,halt_latched=false,\n   transport='QUEUE_V2' where singleton and epoch=s.epoch and revision=s.revision returning * into s;\n  if not found then raise exception using errcode='P0001',message='SUPERVISOR_SINGLETON_DRIFT';end if;"
   },
   {
    "old": "update production_control.worker_supervisor_v1 set state=case when exists(select 1 from production_control.worker_supervisor_invocations_v1 where state in('RUNNING','UNKNOWN'))then 'STOPPING'else 'OFF'end,\n   revision=revision+1,reason='OWNER_STOP';",
    "new": "update production_control.worker_supervisor_v1 set state=case when exists(select 1 from production_control.worker_supervisor_invocations_v1 where state in('RUNNING','UNKNOWN'))then 'STOPPING'else 'OFF'end,\n   revision=revision+1,reason='OWNER_STOP' where singleton and epoch=s.epoch and revision=s.revision;\n  if not found then raise exception using errcode='P0001',message='SUPERVISOR_SINGLETON_DRIFT';end if;"
   }
  ]
 },
 {
  "signature": "public.execute_certification_queue_supervisor_v2(jsonb)",
  "old_hash": "033a8475fda4e018756868ef0062a815db9db328df710646e4d8974c21284484",
  "new_hash": "061b99fd50ff253aa3d2160ced7cff5c4d1496dd6894e638c60b6beec5f69997",
  "edits": [
   {
    "old": "select * into strict s from production_control.worker_supervisor_v1 for update;",
    "new": "select * into s from production_control.worker_supervisor_v1 where singleton for update;\n if not found then raise exception using errcode='P0001',message='SUPERVISOR_SINGLETON_DRIFT';end if;"
   },
   {
    "old": "update production_control.worker_supervisor_v1 set last_invocation=i.invocation_id;",
    "new": "update production_control.worker_supervisor_v1 set last_invocation=i.invocation_id where singleton and epoch=s.epoch and revision=s.revision;\n  if not found then raise exception using errcode='P0001',message='SUPERVISOR_SINGLETON_DRIFT';end if;"
   },
   {
    "old": "update production_control.worker_supervisor_v1 set tick_failures=0,last_success=clock_timestamp(),last_tick_sequence=i.sequence;",
    "new": "update production_control.worker_supervisor_v1 set tick_failures=0,last_success=clock_timestamp(),last_tick_sequence=i.sequence where singleton and epoch=s.epoch and revision=s.revision;\n  if not found then raise exception using errcode='P0001',message='SUPERVISOR_SINGLETON_DRIFT';end if;"
   },
   {
    "old": "update production_control.worker_supervisor_v1 set tick_failures=tick_failures+1,last_tick_sequence=greatest(last_tick_sequence,i.sequence),\n    state=case when input->>'classification'='TERMINAL'or tick_failures+1>=5 then 'HALTED'else state end,\n    halt_latched=halt_latched or input->>'classification'='TERMINAL'or tick_failures+1>=5,\n    last_halt_reason=case when input->>'classification'='TERMINAL'then 'TERMINAL_TICK_FAILURE'when tick_failures+1>=5 then 'TICK_RETRY_EXHAUSTED'else last_halt_reason end,\n    reason=case when input->>'classification'='TERMINAL'then 'TERMINAL_TICK_FAILURE'when tick_failures+1>=5 then 'TICK_RETRY_EXHAUSTED'else input->>'code'end,\n    next_at=greatest(next_at,clock_timestamp()+make_interval(secs=>least(300,power(2,tick_failures+1)::integer)));",
    "new": "update production_control.worker_supervisor_v1 set tick_failures=tick_failures+1,last_tick_sequence=greatest(last_tick_sequence,i.sequence),\n    state=case when input->>'classification'='TERMINAL'or tick_failures+1>=5 then 'HALTED'else state end,\n    halt_latched=halt_latched or input->>'classification'='TERMINAL'or tick_failures+1>=5,\n    last_halt_reason=case when input->>'classification'='TERMINAL'then 'TERMINAL_TICK_FAILURE'when tick_failures+1>=5 then 'TICK_RETRY_EXHAUSTED'else last_halt_reason end,\n    reason=case when input->>'classification'='TERMINAL'then 'TERMINAL_TICK_FAILURE'when tick_failures+1>=5 then 'TICK_RETRY_EXHAUSTED'else input->>'code'end,\n    next_at=greatest(next_at,clock_timestamp()+make_interval(secs=>least(300,power(2,tick_failures+1)::integer))) where singleton and epoch=s.epoch and revision=s.revision;\n  if not found then raise exception using errcode='P0001',message='SUPERVISOR_SINGLETON_DRIFT';end if;"
   },
   {
    "old": "update production_control.worker_supervisor_v1 set invocation_failures=case when input->>'outcome' in('SUCCEEDED','JOB_RETRY','STOPPED')then 0 else invocation_failures+1 end,\n   state=case when input->>'outcome'='TERMINAL'or (input->>'outcome' in('FAILED','UNKNOWN')and invocation_failures+1>=3)then 'HALTED'else state end,\n   halt_latched=halt_latched or input->>'outcome'='TERMINAL'or(input->>'outcome'in('FAILED','UNKNOWN')and invocation_failures+1>=3),\n   last_halt_reason=case when input->>'outcome'='TERMINAL'then 'TERMINAL_JOB_FAILURE'when input->>'outcome'in('FAILED','UNKNOWN')and invocation_failures+1>=3 then 'INVOCATION_RETRY_EXHAUSTED'else last_halt_reason end,\n   reason=case when input->>'outcome'='TERMINAL'then 'TERMINAL_JOB_FAILURE'when input->>'outcome'in('FAILED','UNKNOWN')and invocation_failures+1>=3 then 'INVOCATION_RETRY_EXHAUSTED'else reason end;",
    "new": "update production_control.worker_supervisor_v1 set invocation_failures=case when input->>'outcome' in('SUCCEEDED','JOB_RETRY','STOPPED')then 0 else invocation_failures+1 end,\n   state=case when input->>'outcome'='TERMINAL'or (input->>'outcome' in('FAILED','UNKNOWN')and invocation_failures+1>=3)then 'HALTED'else state end,\n   halt_latched=halt_latched or input->>'outcome'='TERMINAL'or(input->>'outcome'in('FAILED','UNKNOWN')and invocation_failures+1>=3),\n   last_halt_reason=case when input->>'outcome'='TERMINAL'then 'TERMINAL_JOB_FAILURE'when input->>'outcome'in('FAILED','UNKNOWN')and invocation_failures+1>=3 then 'INVOCATION_RETRY_EXHAUSTED'else last_halt_reason end,\n   reason=case when input->>'outcome'='TERMINAL'then 'TERMINAL_JOB_FAILURE'when input->>'outcome'in('FAILED','UNKNOWN')and invocation_failures+1>=3 then 'INVOCATION_RETRY_EXHAUSTED'else reason end where singleton and epoch=s.epoch and revision=s.revision;\n  if not found then raise exception using errcode='P0001',message='SUPERVISOR_SINGLETON_DRIFT';end if;"
   }
  ]
 },
 {
  "signature": "production_control.worker_supervisor_reconcile_v1(jsonb)",
  "old_hash": "ba3bdd5bb9873d4edf3549821f722878babef24ec27fabd44e5e61d43676a95a",
  "new_hash": "97e4df3933f1077cb9bfebdef150c531676f2c0addc91862f5d78f1b299be167",
  "edits": [
   {
    "old": "update production_control.worker_supervisor_v1 set invocation_failures=invocation_failures+1,\n    state=case when invocation_failures+1>=3 then 'HALTED'else state end,halt_latched=halt_latched or invocation_failures+1>=3,\n    last_halt_reason=case when invocation_failures+1>=3 then 'INVOCATION_RETRY_EXHAUSTED'else last_halt_reason end,reason='INVOCATION_ACKNOWLEDGEMENT_UNKNOWN';",
    "new": "update production_control.worker_supervisor_v1 set invocation_failures=invocation_failures+1,\n    state=case when invocation_failures+1>=3 then 'HALTED'else state end,halt_latched=halt_latched or invocation_failures+1>=3,\n    last_halt_reason=case when invocation_failures+1>=3 then 'INVOCATION_RETRY_EXHAUSTED'else last_halt_reason end,reason='INVOCATION_ACKNOWLEDGEMENT_UNKNOWN' where singleton and epoch=s.epoch and revision=s.revision;\n  if not found then raise exception using errcode='P0001',message='SUPERVISOR_SINGLETON_DRIFT';end if;"
   },
   {
    "old": "update production_control.worker_supervisor_v1 set state='OFF'where state='STOPPING'and not exists(\n  select 1 from production_control.worker_supervisor_invocations_v1 where state in('RESERVED','RUNNING','UNKNOWN'));",
    "new": "update production_control.worker_supervisor_v1 set state='OFF'where singleton and epoch=s.epoch and revision=s.revision and state='STOPPING'and not exists(\n  select 1 from production_control.worker_supervisor_invocations_v1 where state in('RESERVED','RUNNING','UNKNOWN'));"
   }
  ]
 }
]$manifest$::jsonb;
begin
 history_snapshot:=jsonb_build_object('v1',(select to_jsonb(t)from production_control.worker_supervisor_installation_v1 t where singleton),
  'v2',(select to_jsonb(t)from production_control.worker_supervisor_queue_installation_v2 t where singleton),
  'v3',(select to_jsonb(t)from production_control.worker_supervisor_publisher_installation_v3 t where singleton));
 if exists(select 1 from production_control.worker_supervisor_safeupdate_installation_v4 where singleton and worker_supervisor_safeupdate_installation_v4.history is distinct from history_snapshot)then
  raise exception 'SUPERVISOR_HISTORY_DRIFT';end if;
 for patch in select value from jsonb_array_elements(manifest)loop
  select p.prosrc,jsonb_build_object('owner',p.proowner,'acl',p.proacl,'security',p.prosecdef,'config',p.proconfig,
   'language',p.prolang,'volatile',p.provolatile,'parallel',p.proparallel,'strict',p.proisstrict)
   into strict body,before_metadata from pg_proc p where p.oid=(patch->>'signature')::regprocedure;
  hash:=encode(extensions.digest(body,'sha256'),'hex');
  if hash not in(patch->>'old_hash',patch->>'new_hash')then raise exception 'SUPERVISOR_FUNCTION_PREDECESSOR_DRIFT: %',patch->>'signature';end if;
  if hash=patch->>'old_hash'then
   definition:=pg_get_functiondef((patch->>'signature')::regprocedure);
   for edit in select value from jsonb_array_elements(patch->'edits')loop
    if (length(body)-length(replace(body,edit->>'old','')))/length(edit->>'old')<>1 then raise exception 'SUPERVISOR_PATCH_COUNT_DRIFT';end if;
    body:=replace(body,edit->>'old',edit->>'new');
    definition:=replace(definition,edit->>'old',edit->>'new');
   end loop;
   if encode(extensions.digest(body,'sha256'),'hex')<>patch->>'new_hash'then raise exception 'SUPERVISOR_PATCH_HASH_DRIFT';end if;
   execute definition;
  end if;
  select jsonb_build_object('owner',p.proowner,'acl',p.proacl,'security',p.prosecdef,'config',p.proconfig,
   'language',p.prolang,'volatile',p.provolatile,'parallel',p.proparallel,'strict',p.proisstrict)
   into strict after_metadata from pg_proc p where p.oid=(patch->>'signature')::regprocedure;
  if before_metadata is distinct from after_metadata then raise exception 'SUPERVISOR_FUNCTION_METADATA_DRIFT';end if;
  if (select encode(extensions.digest(prosrc,'sha256'),'hex')from pg_proc where oid=(patch->>'signature')::regprocedure)<>patch->>'new_hash'then
   raise exception 'SUPERVISOR_FUNCTION_POSTIMAGE_DRIFT';end if;
  all_metadata:=all_metadata||jsonb_build_object(patch->>'signature',after_metadata);
 end loop;
 if exists(select 1 from production_control.worker_supervisor_safeupdate_installation_v4 where singleton and metadata is distinct from all_metadata)then
  raise exception 'SUPERVISOR_RECEIPT_METADATA_DRIFT';end if;
 insert into production_control.worker_supervisor_safeupdate_installation_v4(singleton,predecessor_image,image,history,metadata)
 values(true,history_snapshot#>'{v3,image}',production_control.worker_supervisor_publisher_image_v3(),history_snapshot,all_metadata)on conflict do nothing;
end;$correction$;
commit;
