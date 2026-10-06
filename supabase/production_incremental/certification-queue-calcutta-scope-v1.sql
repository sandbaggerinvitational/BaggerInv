\set ON_ERROR_STOP on
-- Forward-only Certification Calcutta scope. Five exact supervisor function corrections.
-- No domain, claim, lease, calculation, publication, owner/role or provider changes.
-- v1-v7 receipts and attempt-cycle/Net Skins corrections remain truthful.
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
  or exists(select 1 from scoring_authority.calcutta_v1_recalculation_jobs where status='RUNNING')
  or (production_control.worker_supervisor_counts_v1()->>'active_claims')::integer<>0
  or (production_control.worker_supervisor_counts_v1()->>'active_leases')::integer<>0 then
  raise exception 'SUPERVISOR_SAFE_INSTALL_CONTEXT_REQUIRED';end if;
 if to_regclass('production_control.worker_supervisor_calcutta_installation_v1')is null then
  if (select count(*)from production_control.worker_supervisor_routing_closure_installation_v7)<>1
   or(select image from production_control.worker_supervisor_routing_closure_installation_v7 where singleton)
   is distinct from production_control.worker_supervisor_global_fault_image_v5()then raise exception 'SUPERVISOR_PREDECESSOR_DRIFT';end if;
 else
  if(select image from production_control.worker_supervisor_calcutta_installation_v1 where singleton)
   is distinct from production_control.worker_supervisor_global_fault_image_v5()then raise exception 'SUPERVISOR_CALCUTTA_ARTIFACT_DRIFT';end if;
 end if;
end;$preflight$;
create table if not exists production_control.worker_supervisor_calcutta_installation_v1(
 singleton boolean primary key default true check(singleton),predecessor_image jsonb not null,
 image jsonb not null,history jsonb not null,metadata jsonb not null,installed_at timestamptz not null default clock_timestamp());
alter table production_control.worker_supervisor_calcutta_installation_v1 enable row level security;
revoke all on production_control.worker_supervisor_calcutta_installation_v1 from public,anon,authenticated,service_role;
do $correction$
declare patch jsonb;edit jsonb;definition text;body text;before_metadata jsonb;after_metadata jsonb;
 all_metadata jsonb:='{}';history_snapshot jsonb;hash text;
 manifest jsonb:=$manifest$[
  {
    "signature": "production_control.worker_supervisor_counts_v1()",
    "old_hash": "2d75106af0d3fcc93edefb8e331941e2067b7ea2b3e87fa1ae930c36c0c46166",
    "new_hash": "76ba2feaecac2c1fe63e451b810d0009e9ad3cf28c47e7fd97eab71cd432c4fe",
    "edits": [
      {
        "old": "\n select jsonb_build_object('pending_work',(select count(*)from scoring_authority.competition_recalculation_jobs j\n  where j.engine_key in('TEAM_MOMENTUM','TOURNAMENT_STORYLINES','TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL')\n   and j.status in('PENDING','FAILED')and j.delivery_dead_letter_at is null),\n 'active_claims',(select count(*)from scoring_authority.competition_recalculation_jobs where status='RUNNING'\n  and coalesce(lease_expires_at,started_at+interval '90 seconds')>clock_timestamp()),\n 'expired_claims',(select count(*)from scoring_authority.competition_recalculation_jobs where status='RUNNING'\n  and coalesce(lease_expires_at,started_at+interval '90 seconds')<=clock_timestamp()),\n 'dead_letters',(select count(*)from scoring_authority.competition_recalculation_jobs where delivery_dead_letter_at is not null),\n 'active_leases',(select count(*)from production_control.certification_ingress_leases_v1 where state in('ADMITTED','UNKNOWN')),\n 'pending_intents',(select count(*)from scoring_authority.score_derived_intents_v1 where status not in('SUCCEEDED','SUPERSEDED')));\n",
        "new": "\n select jsonb_build_object('pending_work',\n  (select count(*)from scoring_authority.competition_recalculation_jobs j where j.tournament_id='2026'\n   and j.engine_key in('TEAM_MOMENTUM','TOURNAMENT_STORYLINES','TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL')\n   and j.status in('PENDING','FAILED')and j.delivery_dead_letter_at is null)\n  +(select count(*)from scoring_authority.calcutta_v1_recalculation_jobs where tournament_id='2026'\n   and status in('PENDING','FAILED')and delivery_dead_letter_at is null),\n 'active_claims',(select count(*)from scoring_authority.competition_recalculation_jobs where tournament_id='2026'and status='RUNNING'\n  and coalesce(lease_expires_at,started_at+interval '90 seconds')>clock_timestamp())\n  +(select count(*)from scoring_authority.calcutta_v1_recalculation_jobs where tournament_id='2026'and status='RUNNING'and lease_expires_at>clock_timestamp()),\n 'expired_claims',(select count(*)from scoring_authority.competition_recalculation_jobs where tournament_id='2026'and status='RUNNING'\n  and coalesce(lease_expires_at,started_at+interval '90 seconds')<=clock_timestamp())\n  +(select count(*)from scoring_authority.calcutta_v1_recalculation_jobs where tournament_id='2026'and status='RUNNING'and lease_expires_at<=clock_timestamp()),\n 'dead_letters',(select count(*)from scoring_authority.competition_recalculation_jobs where tournament_id='2026'and delivery_dead_letter_at is not null)\n  +(select count(*)from scoring_authority.calcutta_v1_recalculation_jobs where tournament_id='2026'and delivery_dead_letter_at is not null),\n 'active_leases',(select count(*)from production_control.certification_ingress_leases_v1 where state in('ADMITTED','UNKNOWN')),\n 'pending_intents',(select count(*)from scoring_authority.score_derived_intents_v1 where tournament_id='2026'and status not in('SUCCEEDED','SUPERSEDED')));\n"
      }
    ]
  },
  {
    "signature": "production_control.worker_supervisor_scope_v1()",
    "old_hash": "e7538f6621de8d0d1e74028822f7a95156790c9ccd759a8d5cb0921ff279d82b",
    "new_hash": "2fd57b8c7acd4eece188720199da1577aace2b473e1d3960c99957bb87b5301e",
    "edits": [
      {
        "old": "\nbegin\n if production_control.derived_final_recap_ready_v1('2026')\n  or exists(select 1 from scoring_authority.odds_published_snapshots)\n  or exists(select 1 from scoring_authority.calcutta_v1_recalculation_jobs where status in('PENDING','RUNNING'))\n  or exists(select 1 from scoring_authority.calcutta_v1_auction_fact_revisions a join scoring_authority.calcutta_v1_current c on c.auction_revision_id=a.auction_revision_id\n   where (jsonb_array_length(a.auction_manifest->'purchases')<>0 or jsonb_array_length(a.auction_manifest->'ownership')<>0)) then\n  raise exception using errcode='42501',message='SUPERVISOR_ENGINE_SCOPE_DENIED';end if;\nend;",
        "new": "\nbegin\n -- Closed installed registry, never a message/client engine selector.\n if not exists(select 1 from production_control.worker_supervisor_v1 where singleton and\n  engines=array['TEAM_MOMENTUM','TOURNAMENT_STORYLINES','TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL','CALCUTTA']::text[])\n  or production_control.derived_final_recap_ready_v1('2026')\n  or exists(select 1 from scoring_authority.odds_published_snapshots) then\n  raise exception using errcode='42501',message='SUPERVISOR_ENGINE_SCOPE_DENIED';end if;\nend;"
      }
    ]
  },
  {
    "signature": "production_control.worker_supervisor_status_v1(jsonb)",
    "old_hash": "d395cf4d3e9cca0be243d40e29d58cb272c40eea0311d8791347ace5a010aeba",
    "new_hash": "7fc0043ab08aa2e7def9bb3315edc722d90e1233876c0cda7701265eef86ac48",
    "edits": [
      {
        "old": " 'epoch',s.epoch,'revision',s.revision,",
        "new": " 'engine_scope_contract','certification-queue-calcutta-scope-v1','engines',to_jsonb(s.engines),\n 'epoch',s.epoch,'revision',s.revision,"
      }
    ]
  },
  {
    "signature": "production_control.worker_supervisor_reconcile_v1(jsonb)",
    "old_hash": "97e4df3933f1077cb9bfebdef150c531676f2c0addc91862f5d78f1b299be167",
    "new_hash": "1632701d826bddd143f3e5161a09e705f45de443a521445ae1140230f2f868eb",
    "edits": [
      {
        "old": "     select jsonb_agg(jsonb_build_object('engine',j.engine_key,'cycle',j.delivery_cycle,'attempt',j.delivery_attempts,\n      'status',j.status,'source',j.requested_source_revision,'available_at',j.delivery_available_at,\n      'dead_letter',j.delivery_dead_letter_at is not null,'same_claim',j.started_at=(v->>'started_at')::timestamptz))\n     from jsonb_array_elements(i.claim_evidence)v join scoring_authority.competition_recalculation_jobs j\n      on j.tournament_id='2026'and j.engine_key=v->>'engine'\n",
        "new": "     select jsonb_agg(evidence)from(\n     select jsonb_build_object('engine',j.engine_key,'cycle',j.delivery_cycle,'attempt',j.delivery_attempts,\n      'status',j.status,'source',j.requested_source_revision,'available_at',j.delivery_available_at,\n      'dead_letter',j.delivery_dead_letter_at is not null,'same_claim',j.started_at=(v->>'started_at')::timestamptz)as evidence\n     from jsonb_array_elements(i.claim_evidence)v join scoring_authority.competition_recalculation_jobs j\n      on j.tournament_id='2026'and j.engine_key=v->>'engine'\n     union all\n     select jsonb_build_object('engine','CALCUTTA','job_id',j.job_id,'cycle',j.delivery_cycle,'attempt',j.delivery_attempts,\n      'status',j.status,'source_fingerprint',j.source_fingerprint,'available_at',j.delivery_available_at,\n      'dead_letter',j.delivery_dead_letter_at is not null,'same_claim',j.started_at=(v->>'started_at')::timestamptz)\n     from jsonb_array_elements(i.claim_evidence)v join scoring_authority.calcutta_v1_recalculation_jobs j\n      on j.tournament_id='2026'and v->>'engine'='CALCUTTA'and j.job_id::text=v->>'job_id'\n    )collected\n"
      }
    ]
  },
  {
    "signature": "execute_certification_queue_supervisor_v2(jsonb)",
    "old_hash": "082380fb52b76f82f704663786f3cbae13bc6f71b7fa5676cbde59d263468f8c",
    "new_hash": "46aa6ff6551e1eaf80660bc999bfb42e8eea6c30b0d3da3616515538aeab8478",
    "edits": [
      {
        "old": "'invocation_id',i.invocation_id,'run_token',token,'fault_contract','certification-global-fault-v5');",
        "new": "'invocation_id',i.invocation_id,'run_token',token,'fault_contract','certification-global-fault-v5',\n   'engine_scope_contract','certification-queue-calcutta-scope-v1','engines',to_jsonb(s.engines));"
      },
      {
        "old": "input->>'kind'not in('TICK','COMPETITION','INTELLIGENCE')",
        "new": "input->>'kind'not in('TICK','COMPETITION','INTELLIGENCE','CALCUTTA')"
      },
      {
        "old": " elsif operation='FAULT'then\n",
        "new": " elsif operation='FAULT'then\n  if input->>'fault_operation'='WORKERS.CALCUTTA_CLAIM'then\n   -- Observe a committed canonical claim only. This adds no Calcutta fault\n   -- selector and gives the worker no Director or publication authority.\n   if input#>>'{payload,worker_id}'is distinct from 'supervised-'||i.invocation_id::text then\n    raise exception using errcode='42501',message='SUPERVISOR_FAULT_DENIED';end if;\n   update production_control.worker_supervisor_invocations_v1 set claim_evidence=claim_evidence||coalesce((\n    select jsonb_agg(jsonb_build_object('engine','CALCUTTA','job_id',j.job_id,'cycle',j.delivery_cycle,\n     'source_fingerprint',j.source_fingerprint,'started_at',j.started_at))\n    from scoring_authority.calcutta_v1_recalculation_jobs j join production_control.operation_audit_events a on\n     a.event_type='CERTIFICATION_CANONICAL_OPERATION'and a.details->>'operation_id'='WORKERS.CALCUTTA_CLAIM'\n     and a.details->>'operation_request_id'=input->>'request_id'\n     and a.details->>'resource_id'=s.binding#>>'{resource,resource_id}'\n     and a.details->>'release_commit'=s.binding#>>'{deployment,release_commit}'\n     and a.request_fingerprint=production_control.cutover_payload_hash(input->'payload')\n     and a.details#>>'{receipt,job,job_id}'=j.job_id::text\n    where j.tournament_id='2026'and j.status='RUNNING'\n     and j.claimed_by='supervised-'||i.invocation_id::text\n     and j.activation_revision=(s.authority_context->>'activation_revision')::bigint\n     and j.lease_expires_at>clock_timestamp()\n   ),'[]'::jsonb)where invocation_id=i.invocation_id;\n   return jsonb_build_object('ok',true,'fault',null);\n  end if;\n"
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
 'v6',(select to_jsonb(t)from production_control.worker_supervisor_retry_envelope_installation_v6 t where singleton),
 'v7',(select to_jsonb(t)from production_control.worker_supervisor_routing_closure_installation_v7 t where singleton))into history_snapshot;
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
 if not exists(select 1 from production_control.worker_supervisor_calcutta_installation_v1 where singleton)then
  update production_control.worker_supervisor_v1
   set engines=array['TEAM_MOMENTUM','TOURNAMENT_STORYLINES','TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL','CALCUTTA']::text[]
   where singleton and state='OFF'and engines=array['TEAM_MOMENTUM','TOURNAMENT_STORYLINES','TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL']::text[];
  if not found then raise exception 'SUPERVISOR_CALCUTTA_SCOPE_DRIFT';end if;
 end if;
 perform production_control.worker_supervisor_scope_v1();
 if exists(select 1 from production_control.worker_supervisor_calcutta_installation_v1 where singleton and
  (image is distinct from production_control.worker_supervisor_global_fault_image_v5()or metadata is distinct from all_metadata
   or history is distinct from history_snapshot))then raise exception 'SUPERVISOR_CALCUTTA_RECEIPT_DRIFT';end if;
 insert into production_control.worker_supervisor_calcutta_installation_v1(singleton,predecessor_image,image,history,metadata)
 values(true,history_snapshot#>'{v7,image}',production_control.worker_supervisor_global_fault_image_v5(),history_snapshot,all_metadata)on conflict do nothing;
end;$correction$;
commit;
