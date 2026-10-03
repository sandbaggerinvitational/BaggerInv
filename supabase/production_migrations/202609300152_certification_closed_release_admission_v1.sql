-- CLI scaffold20261003015433; repository forward ordinal152.
-- Preserve genuine closed ingress when an owner reenables its deployment after
-- approved release maintenance. Existing READS/ANNUAL admission stays usable;
-- SCORING/DIRECTOR/WORKERS remain denied by the unchanged PAUSED phase guard.
-- No new authority, public API, grants, history rewrite or Production branch.
begin;
do $closed_enable$ declare
 function_id regprocedure:='production_control.set_certification_admission_v1(jsonb)'::regprocedure;
 before_value pg_proc%rowtype;after_value pg_proc%rowtype;definition text;reversed text;
 before_dependencies jsonb;after_dependencies jsonb;
 old_fragments text[];new_fragments text[];i integer;
begin
 select * into strict before_value from pg_proc where oid=function_id;
 if before_value.prosecdef or before_value.proconfig is distinct from array['search_path=pg_catalog']::text[]
  or before_value.proowner<>(select oid from pg_roles where rolname=current_user)then
  raise exception 'CERTIFICATION_CLOSED_ENABLE_PREDECESSOR_INVALID';end if;
 select coalesce(jsonb_agg(to_jsonb(d)order by to_jsonb(d)::text),'[]')into before_dependencies
  from pg_depend d where(d.classid='pg_proc'::regclass and d.objid=function_id)
   or(d.refclassid='pg_proc'::regclass and d.refobjid=function_id);
 old_fragments:=array[
  $old$ desired boolean;$old$,
  $old$ update production_control.certification_admission_v1 set enabled=desired,admission_revision=admission_revision+1$old$,
  $old$state=case when desired then 'OPEN' else 'PAUSED' end,$old$
 ];
 new_fragments:=array[
  $new$ desired boolean;closed_verified boolean:=false;
 gate scoring_authority.ingress_gates%rowtype;
 origin production_control.certification_initialization_origins_v1%rowtype;
 closed_generation production_control.certification_ingress_generations_v1%rowtype;
 gate_generation uuid;ingress_evidence jsonb;$new$,
  $new$ if desired then
  select * into strict gate from scoring_authority.ingress_gates where tournament_id=p.tournament_id for update;
  select * into origin from production_control.certification_initialization_origins_v1 where resource_id=r.resource_id;
  select * into closed_generation from production_control.certification_ingress_generations_v1 value
   where value.resource_id=r.resource_id and value.generation_id=coalesce((
    select bound.generation_id from production_control.certification_ingress_generations_v1 bound
     where bound.resource_id=r.resource_id and bound.generation_id=gate.admission_generation_id
      and bound.tournament_id=p.tournament_id and bound.pointer_revision=p.pointer_revision
      and bound.authority_epoch_id=a.authority_epoch_id),origin.admission_generation_id);
  -- A malformed current CLOSED graph must not fall through to OPEN. Historical
  -- CLOSED predecessors with a legitimate successor do not control its gate.
  if closed_generation.state='CLOSED' or exists(select 1 from production_control.certification_ingress_generations_v1 foreign_bound
   where foreign_bound.generation_id=gate.admission_generation_id and foreign_bound.state='CLOSED')
   or exists(select 1 from production_control.certification_ingress_generations_v1 candidate
   where candidate.resource_id=r.resource_id and candidate.tournament_id=p.tournament_id
    and candidate.pointer_revision=p.pointer_revision and candidate.authority_epoch_id=a.authority_epoch_id
    and candidate.state='CLOSED' and not exists(select 1 from production_control.certification_ingress_generations_v1 child
     where child.resource_id=r.resource_id and child.predecessor_generation_id=candidate.generation_id)) then
   if origin.resource_id is null or closed_generation.state is distinct from 'CLOSED' or closed_generation.tournament_id is distinct from p.tournament_id
    or closed_generation.pointer_revision is distinct from p.pointer_revision or closed_generation.authority_epoch_id is distinct from a.authority_epoch_id
    or gate.state<>'PAUSED' or gate.authority<>'SUPABASE' or gate.boundary_mode<>'CERTIFICATION_INGRESS_V1'
    or gate.active_epoch_id is distinct from a.authority_epoch_id
    or exists(select 1 from production_control.certification_ingress_generations_v1 child
     where child.resource_id=r.resource_id and child.predecessor_generation_id=closed_generation.generation_id)
    or exists(select 1 from production_control.certification_ingress_generations_v1 other
     where other.resource_id=r.resource_id and other.generation_id<>closed_generation.generation_id and other.state in('OPEN','CLOSING'))then
    raise exception using errcode='40001',message='CERTIFICATION_ADMISSION_CLOSED_CONTEXT_STALE';end if;
 -- A real current gate binding always outranks the immutable initial origin,
 -- including a reopened initial tournament with the same pointer and epoch.
 select bound.generation_id into gate_generation
  from production_control.certification_ingress_generations_v1 bound
  where bound.resource_id=r.resource_id and bound.generation_id=gate.admission_generation_id
   and bound.tournament_id=p.tournament_id and bound.pointer_revision=p.pointer_revision
   and bound.authority_epoch_id=a.authority_epoch_id;
 if gate_generation is not null then
  if gate_generation<>closed_generation.generation_id then
   raise exception using errcode='40001',message='CERTIFICATION_ADMISSION_CLOSED_CONTEXT_STALE';end if;
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
   or origin.admission_generation_id is distinct from closed_generation.generation_id or closed_generation.predecessor_generation_id is not null
   or exists(select 1 from production_control.certification_ingress_generations_v1 other
    where other.resource_id=r.resource_id and other.generation_id<>closed_generation.generation_id
     and other.tournament_id=p.tournament_id and other.pointer_revision=p.pointer_revision
     and other.authority_epoch_id=a.authority_epoch_id) then
   raise exception using errcode='40001',message='CERTIFICATION_ADMISSION_CLOSED_CONTEXT_STALE';end if;
 end if;
 if closed_generation.state='CLOSED' then
  ingress_evidence:=production_control.certification_ingress_evidence_v1(r.resource_id,closed_generation.generation_id);
  if ingress_evidence->>'drained' is distinct from 'true'
   or ingress_evidence->>'fingerprint_matches' is distinct from 'true'
   or ingress_evidence->>'captured_high_watermark' is distinct from closed_generation.high_watermark::text
   or ingress_evidence->>'captured_fingerprint' is distinct from closed_generation.lease_fingerprint
   or not exists(select 1 from production_control.scoring_admission_closures closed
    where closed.resource_class='CERTIFICATION' and closed.certification_resource_id=r.resource_id
     and closed.admission_generation_id=closed_generation.generation_id and closed.tournament_id=p.tournament_id
     and closed.authority_generation_id=a.authority_epoch_id and closed.authority='SUPABASE'
     and closed.closure_kind='SUPABASE_INGRESS' and closed.status='CLOSED'
     and closed.closed_admission_revision=closed_generation.revision and closed.closing_admission_revision=closed_generation.revision
     and closed.lease_high_watermark=closed_generation.high_watermark
     and closed.lease_set_fingerprint=closed_generation.lease_fingerprint
     and closed.lease_set_fingerprint=ingress_evidence->>'fingerprint') then
   raise exception using errcode='40001',message='CERTIFICATION_ADMISSION_CLOSED_EVIDENCE_REQUIRED';end if;
 end if;
   closed_verified:=true;
  end if;
 end if;
 update production_control.certification_admission_v1 set enabled=desired,admission_revision=admission_revision+1$new$,
  $new$state=case when desired and not closed_verified then 'OPEN' else 'PAUSED' end,$new$
 ];
 definition:=pg_get_functiondef(function_id);
 for i in 1..array_length(old_fragments,1)loop
  if length(definition)-length(replace(definition,old_fragments[i],''))<>length(old_fragments[i])then
   raise exception 'CERTIFICATION_CLOSED_ENABLE_SOURCE_DRIFT:%',i;end if;
  definition:=replace(definition,old_fragments[i],new_fragments[i]);
 end loop;
 execute definition;
 select * into strict after_value from pg_proc where oid=function_id;
 reversed:=after_value.prosrc;
 for i in reverse array_length(old_fragments,1)..1 loop
  reversed:=replace(reversed,new_fragments[i],old_fragments[i]);
 end loop;
 if reversed is distinct from before_value.prosrc or (to_jsonb(after_value)-'prosrc')is distinct from(to_jsonb(before_value)-'prosrc')then
  raise exception 'CERTIFICATION_CLOSED_ENABLE_UNRELATED_BODY_OR_ATTRIBUTES_CHANGED';end if;
 select coalesce(jsonb_agg(to_jsonb(d)order by to_jsonb(d)::text),'[]')into after_dependencies
  from pg_depend d where(d.classid='pg_proc'::regclass and d.objid=function_id)
   or(d.refclassid='pg_proc'::regclass and d.refobjid=function_id);
 if before_dependencies is distinct from after_dependencies then
  raise exception 'CERTIFICATION_CLOSED_ENABLE_DEPENDENCY_CHANGED';end if;
end;$closed_enable$;
commit;
