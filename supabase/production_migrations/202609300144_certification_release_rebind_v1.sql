-- Owner approved the exact bounded operation after its first review rejection.
-- A normally reviewed local install succeeded; the initial-generation predicate
-- rejected a valid request before any release update. The owner subsequently
-- approved exact generation selection and outgoing-release Odds drain guards;
-- see RELEASE-CONTROL-APPROVAL-BLOCK.md. No hosted install.
-- CLI scaffold20261002213300; repository ordinal144.
-- No new actor role or runtime privilege; unchanged Production release contracts.
begin;
create function production_control.rebind_certification_release_v1(input jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $proposal$
declare r production_control.canonical_resource_v1%rowtype;
 a production_control.certification_admission_v1%rowtype;
 p production_control.current_tournament_pointer_v1%rowtype;
 gate scoring_authority.ingress_gates%rowtype;
 origin production_control.certification_initialization_origins_v1%rowtype;
 g production_control.certification_ingress_generations_v1%rowtype;
 gate_generation uuid; ingress_evidence jsonb;
 request_id uuid; request_hash text; previous jsonb; result jsonb;
begin
 if current_user<>pg_get_userbyid((select relowner from pg_class where oid='production_control.canonical_resource_v1'::regclass)) then
  raise exception using errcode='42501',message='CANONICAL_RESOURCE_OWNER_REQUIRED';end if;
 if jsonb_typeof(input) is distinct from 'object'
  or input->>'contract_version' is distinct from 'certification-release-rebind-v1'
  or coalesce(input->>'operation_request_id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  or coalesce(input->>'new_release_commit','') !~ '^[a-f0-9]{40}$'
  or coalesce(input->>'new_deployment_id','') !~ '^dpl_[A-Za-z0-9_-]{1,120}$'
  or coalesce(input->>'new_deployment_origin','') !~ '^https://[a-z0-9][a-z0-9-]{0,61}[a-z0-9]\.vercel\.app$'
  or input->>'deployment_class' is distinct from 'preview'
  or length(btrim(coalesce(input->>'reason','')))=0
  or exists(select 1 from jsonb_object_keys(input)k where k not in(
   'contract_version','operation_request_id','resource','expected_admission_revision',
   'expected_release_commit','expected_deployment_id','expected_deployment_origin',
   'expected_current_tournament_id','expected_pointer_revision','expected_authority_epoch_id',
   'expected_ingress_generation_id','deployment_class','new_release_commit','new_deployment_id','new_deployment_origin','reason'))then
  raise exception using errcode='22023',message='CERTIFICATION_RELEASE_INPUT_INVALID';end if;
 request_id:=(input->>'operation_request_id')::uuid;
 request_hash:=production_control.tournament_setup_hash_v1(input);
 perform pg_advisory_xact_lock(production_control.scoring_admission_lock_key());
 select * into strict r from production_control.canonical_resource_v1 where singleton for update;
 if r.resource_class<>'CERTIFICATION' or r.database_name<>current_database()
  or exists(select 1 from production_control.resource_scope)or exists(select 1 from production_control.cutover_activation_state)
  or input->'resource' is distinct from jsonb_build_object('resource_id',r.resource_id,'resource_class',r.resource_class,
   'installation_id',r.installation_id,'project_ref',r.project_ref,'project_url',r.project_url,
   'vercel_team_id',r.vercel_team_id,'vercel_project_id',r.vercel_project_id,
   'registration_revision',r.registration_revision,'manifest_digest',r.manifest_digest,
   'schema_contract',r.schema_contract,'schema_digest',r.schema_digest)then
  raise exception using errcode='42501',message='CERTIFICATION_RELEASE_RESOURCE_DENIED';end if;
 select e.details into previous from production_control.operation_audit_events e
  where e.event_type='CERTIFICATION_RELEASE_REBOUND' and e.details->>'resource_id'=r.resource_id
   and e.details->>'operation_request_id'=request_id::text;
 if found then
  if previous->>'request_hash' is distinct from request_hash then
   raise exception using errcode='40001',message='CERTIFICATION_RELEASE_IDEMPOTENCY_CONFLICT';end if;
  return previous->'receipt';
 end if;
 select * into strict a from production_control.certification_admission_v1 where resource_id=r.resource_id for update;
 select * into strict p from production_control.current_tournament_pointer_v1 where scope_key=r.resource_id for share;
 select * into strict gate from scoring_authority.ingress_gates where tournament_id=p.tournament_id for share;
 select * into strict origin from production_control.certification_initialization_origins_v1 where resource_id=r.resource_id;
 select * into strict g from production_control.certification_ingress_generations_v1
  where resource_id=r.resource_id and generation_id=(input->>'expected_ingress_generation_id')::uuid for share;
 if a.enabled then raise exception using errcode='55000',message='CERTIFICATION_RELEASE_ADMISSION_MUST_BE_DISABLED';end if;
 if input->>'expected_admission_revision' is distinct from a.admission_revision::text
  or input->>'expected_release_commit' is distinct from a.release_commit
  or input->>'expected_deployment_id' is distinct from a.deployment_id
  or input->>'expected_deployment_origin' is distinct from a.deployment_origin
  or input->>'expected_current_tournament_id' is distinct from p.tournament_id
  or input->>'expected_pointer_revision' is distinct from p.pointer_revision::text
  or input->>'expected_authority_epoch_id' is distinct from a.authority_epoch_id::text
  or g.tournament_id is distinct from p.tournament_id or g.pointer_revision is distinct from p.pointer_revision
  or g.authority_epoch_id is distinct from a.authority_epoch_id
  or gate.state<>'PAUSED' or gate.authority<>'SUPABASE' or gate.boundary_mode<>'CERTIFICATION_INGRESS_V1'
  or gate.active_epoch_id is distinct from a.authority_epoch_id
  or exists(select 1 from production_control.certification_ingress_generations_v1 child
    where child.resource_id=r.resource_id and child.predecessor_generation_id=g.generation_id)
  or exists(select 1 from production_control.certification_ingress_generations_v1 other
    where other.resource_id=r.resource_id and other.generation_id<>g.generation_id
      and other.state in('OPEN','CLOSING')) then
  raise exception using errcode='40001',message='CERTIFICATION_RELEASE_CONTEXT_STALE';end if;
 -- A real current gate binding always outranks the immutable initial origin,
 -- including a reopened initial tournament with the same pointer and epoch.
 select bound.generation_id into gate_generation
  from production_control.certification_ingress_generations_v1 bound
  where bound.resource_id=r.resource_id and bound.generation_id=gate.admission_generation_id
   and bound.tournament_id=p.tournament_id and bound.pointer_revision=p.pointer_revision
   and bound.authority_epoch_id=a.authority_epoch_id;
 if gate_generation is not null then
  if gate_generation<>g.generation_id then
   raise exception using errcode='40001',message='CERTIFICATION_RELEASE_CONTEXT_STALE';end if;
 else
  -- Only the unchanged legacy gate shape at the actual initialization origin
  -- may lack a Certification gate binding. No time/latest-row discovery.
  if gate.admission_contract_version is distinct from 'production-scoring-admission-v2'
   or gate.admission_protocol_enforced is distinct from false or gate.admission_revision is distinct from 0
   or exists(select 1 from production_control.certification_ingress_generations_v1 bound
    where bound.generation_id=gate.admission_generation_id)
   or origin.resource_id is distinct from r.resource_id or origin.resource_class is distinct from r.resource_class
   or origin.installation_id is distinct from r.installation_id or origin.database_name is distinct from r.database_name
   or origin.project_ref is distinct from r.project_ref or origin.project_url is distinct from r.project_url
   or origin.registration_revision is distinct from r.registration_revision
   or origin.registration_manifest_digest is distinct from r.manifest_digest
   or origin.schema_digest is distinct from r.schema_digest or origin.binding_id is distinct from a.binding_id
   or origin.initial_tournament_id is distinct from p.tournament_id
   or origin.initial_pointer_revision is distinct from p.pointer_revision
   or origin.authority_epoch_id is distinct from a.authority_epoch_id
   or origin.admission_generation_id is distinct from g.generation_id or g.predecessor_generation_id is not null
   or exists(select 1 from production_control.certification_ingress_generations_v1 other
    where other.resource_id=r.resource_id and other.generation_id<>g.generation_id
     and other.tournament_id=p.tournament_id and other.pointer_revision=p.pointer_revision
     and other.authority_epoch_id=a.authority_epoch_id) then
   raise exception using errcode='40001',message='CERTIFICATION_RELEASE_CONTEXT_STALE';end if;
 end if;
 if g.state='CLOSED' then
  ingress_evidence:=production_control.certification_ingress_evidence_v1(r.resource_id,g.generation_id);
  if ingress_evidence->>'drained' is distinct from 'true'
   or ingress_evidence->>'fingerprint_matches' is distinct from 'true'
   or ingress_evidence->>'captured_high_watermark' is distinct from g.high_watermark::text
   or ingress_evidence->>'captured_fingerprint' is distinct from g.lease_fingerprint
   or not exists(select 1 from production_control.scoring_admission_closures closed
    where closed.resource_class='CERTIFICATION' and closed.certification_resource_id=r.resource_id
     and closed.admission_generation_id=g.generation_id and closed.tournament_id=p.tournament_id
     and closed.authority_generation_id=a.authority_epoch_id and closed.authority='SUPABASE'
     and closed.closure_kind='SUPABASE_INGRESS' and closed.status='CLOSED'
     and closed.closed_admission_revision=g.revision and closed.closing_admission_revision=g.revision
     and closed.lease_high_watermark=g.high_watermark
     and closed.lease_set_fingerprint=g.lease_fingerprint
     and closed.lease_set_fingerprint=ingress_evidence->>'fingerprint') then
   raise exception using errcode='40001',message='CERTIFICATION_RELEASE_CLOSED_EVIDENCE_REQUIRED';end if;
 end if;
 --143 intentionally rejects cross-release execution/publication. Do not
 -- strand unfinished old-release work or adopt it into the new release.
 if exists(select 1 from scoring_authority.odds_calculation_jobs job
  where job.production_operation_mode='CERTIFICATION' and job.tournament_id=p.tournament_id
   and job.production_deployment_commit=a.release_commit
   and job.source_revision->>'resource_id'=r.resource_id
   and job.source_revision->>'installation_id'=r.installation_id::text
   and job.source_revision->>'certification_ingress_generation_id'=g.generation_id::text
   and job.source_revision->>'annual_authority_generation_id'=a.authority_epoch_id::text
   and job.source_revision->>'annual_pointer_revision'=p.pointer_revision::text
   and (job.status in('PENDING','RUNNING','RETRYABLE')
    or(job.status='SUCCEEDED' and job.publication_status='READY'))) then
  raise exception using errcode='55000',message='CERTIFICATION_RELEASE_ODDS_DRAIN_REQUIRED';end if;
 update production_control.certification_admission_v1 set release_commit=input->>'new_release_commit',
  deployment_id=input->>'new_deployment_id',deployment_origin=input->>'new_deployment_origin',
  admission_revision=admission_revision+1 where resource_id=r.resource_id;
 result:=jsonb_build_object('ok',true,'contract','certification-release-rebind-v1','resource_id',r.resource_id,
  'operation_request_id',request_id,'enabled',false,'admission_revision',a.admission_revision+1,
  'release_commit',input->>'new_release_commit','deployment_id',input->>'new_deployment_id',
  'deployment_origin',input->>'new_deployment_origin');
 insert into production_control.operation_audit_events(event_type,domain,tournament_id,actor,result,details)
 values('CERTIFICATION_RELEASE_REBOUND','RESOURCE',p.tournament_id,current_user,'SUCCEEDED',
  jsonb_build_object('resource_id',r.resource_id,'installation_id',r.installation_id,
   'operation_request_id',request_id,'request_hash',request_hash,'before_release_commit',a.release_commit,
   'before_deployment_id',a.deployment_id,'before_deployment_origin',a.deployment_origin,
   'before_admission_revision',a.admission_revision,'authority_epoch_id',a.authority_epoch_id,
   'pointer_revision',p.pointer_revision,'admission_generation_id',g.generation_id,
   'reason',input->>'reason','receipt',result));
 return result;
end;$proposal$;
revoke all on function production_control.rebind_certification_release_v1(jsonb) from public,anon,authenticated,service_role;

comment on function production_control.rebind_certification_release_v1(jsonb) is
 'Owner-only, admission-disabled Certification release CAS. Preserves resource, epoch, pointer, ingress generation, durable outcomes and domain history.';
commit;
