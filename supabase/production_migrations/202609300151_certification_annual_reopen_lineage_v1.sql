-- CLI scaffold20261003014950; repository forward ordinal151.
-- Certification-only annual ABORT/reopen lineage repair. Annual activation
-- origin stays immutable; a new closure names its immediate ingress parent.
-- No role, public API, Production body, guard, row or historical receipt change.
begin;
create temporary table certification_reopen_lineage_before on commit drop as
 select p.*,(select coalesce(jsonb_agg(to_jsonb(d)order by to_jsonb(d)::text),'[]')from pg_depend d
  where(d.classid='pg_proc'::regclass and d.objid=p.oid)
   or(d.refclassid='pg_proc'::regclass and d.refobjid=p.oid))as retained_dependencies
 from pg_proc p where p.oid in(
  'production_control.close_certification_annual_predecessor_v1(jsonb,text)'::regprocedure,
  'production_control.certification_annual_predecessor_certificate_v1(text)'::regprocedure,
  'production_control.guard_canonical_annual_row_v1()'::regprocedure);

do $repair$ declare function_id regprocedure;definition text;before_body text;after_body text;
 old_fragment text;new_fragment text;ancestry text;cursor_source text;failure text;
begin
 -- Identical validation is embedded into the two existing private functions;
 -- no new callable authority or ACL surface is introduced. Only exact indexed
 -- closure/generation IDs are traversed, never a historical tournament scan.
 ancestry:=$ancestry$
  declare ancestor production_control.scoring_admission_closures%rowtype;
   parent_generation production_control.certification_ingress_generations_v1%rowtype;
   child_generation production_control.certification_ingress_generations_v1%rowtype;
   cursor_id uuid;seen uuid[]:=array[]::uuid[];lineage_valid boolean:=false;
  begin
   child_generation:=g;
   __CURSOR__
   loop
    if cursor_id is null or cursor_id=any(seen)then exit;end if;
    seen:=array_append(seen,cursor_id);
    select * into ancestor from production_control.scoring_admission_closures where closure_id=cursor_id;
    if ancestor.closure_id is null or ancestor.resource_class is distinct from'CERTIFICATION'
     or ancestor.certification_resource_id is distinct from o.resource_id
     or ancestor.boundary_mode is distinct from'CERTIFICATION_INGRESS_V1'
     or ancestor.closure_kind is distinct from'SUPABASE_INGRESS'
     or ancestor.authority is distinct from'SUPABASE' then exit;end if;
    select * into parent_generation from production_control.certification_ingress_generations_v1
     where resource_id=o.resource_id and generation_id=ancestor.admission_generation_id;
    if parent_generation.generation_id is null or parent_generation.state is distinct from'CLOSED'
     or child_generation.predecessor_generation_id is distinct from parent_generation.generation_id
     or ancestor.tournament_id is distinct from parent_generation.tournament_id
     or ancestor.authority_generation_id is distinct from parent_generation.authority_epoch_id
     or ancestor.closed_admission_revision is distinct from parent_generation.revision
     or ancestor.lease_high_watermark is distinct from parent_generation.high_watermark
     or ancestor.lease_set_fingerprint is distinct from parent_generation.lease_fingerprint then exit;end if;
    if ancestor.closure_id=a.predecessor_closure_id then
     -- Existing Certification ACTIVATE retains CLOSED. Its exact COMMITTED
     -- annual transition proves consumption; do not invent a status rewrite.
     lineage_valid:=ancestor.status in('CLOSED','CONSUMED')
      and ancestor.tournament_id=a.predecessor_tournament_id and ancestor.tournament_id<>target_tournament
      and parent_generation.pointer_revision=g.pointer_revision-1
      and exists(select 1 from production_control.annual_scoring_transitions_v1 t
       where t.resource_class='CERTIFICATION' and t.certification_resource_id=o.resource_id
        and t.runtime_generation_id=a.runtime_generation_id and t.transition_status='COMMITTED'
        and t.predecessor_closure_id=a.predecessor_closure_id
        and t.predecessor_tournament_id=a.predecessor_tournament_id
        and t.predecessor_boundary_fingerprint=a.predecessor_boundary_fingerprint
        and t.successor_tournament_id=target_tournament
        and t.expected_pointer_revision=g.pointer_revision-1
        and t.authority_generation_id=g.authority_epoch_id);
     exit;
    end if;
    if ancestor.status is distinct from'REOPENED' or ancestor.tournament_id is distinct from target_tournament
     or parent_generation.authority_epoch_id is distinct from g.authority_epoch_id
     or parent_generation.pointer_revision is distinct from g.pointer_revision then exit;end if;
    child_generation:=parent_generation;
    cursor_id:=ancestor.prior_certification_closure_id;
   end loop;
   if not coalesce(lineage_valid,false)then __FAILURE__ end if;
  end;
$ancestry$;
 foreach function_id in array array[
  'production_control.close_certification_annual_predecessor_v1(jsonb,text)'::regprocedure,
  'production_control.certification_annual_predecessor_certificate_v1(text)'::regprocedure]loop
  select prosrc into strict before_body from pg_proc where oid=function_id;
  definition:=pg_get_functiondef(function_id);
  if function_id='production_control.close_certification_annual_predecessor_v1(jsonb,text)'::regprocedure then
   old_fragment:=$old$  prior_closure:=a.predecessor_closure_id;$old$;
   cursor_source:=$cursor$select closure_id into strict prior_closure from production_control.scoring_admission_closures
    where resource_class='CERTIFICATION' and certification_resource_id=o.resource_id
     and admission_generation_id=g.predecessor_generation_id;
   cursor_id:=prior_closure;$cursor$;
   failure:=$failure$raise exception using errcode='40001',message='CERTIFICATION_ANNUAL_LINEAGE_REQUIRED';$failure$;
   new_fragment:=replace(replace(ancestry,'__CURSOR__',cursor_source),'__FAILURE__',failure);
  else
   old_fragment:=$old$   or a.admission_generation_id<>g.generation_id or a.authority_generation_id<>g.authority_epoch_id
   or a.predecessor_closure_id is distinct from closed.prior_certification_closure_id then
   blocks:=blocks||jsonb_build_array('PREDECESSOR_SCORING_ADMISSION_NOT_CLOSED');end if;$old$;
   cursor_source:='cursor_id:=closed.prior_certification_closure_id;';
   failure:=$failure$blocks:=blocks||jsonb_build_array('PREDECESSOR_SCORING_ADMISSION_NOT_CLOSED');$failure$;
   new_fragment:=$new$   or a.admission_generation_id<>g.generation_id or a.authority_generation_id<>g.authority_epoch_id then
   blocks:=blocks||jsonb_build_array('PREDECESSOR_SCORING_ADMISSION_NOT_CLOSED');end if;$new$
    ||replace(replace(ancestry,'__CURSOR__',cursor_source),'__FAILURE__',failure);
  end if;
  if length(definition)-length(replace(definition,old_fragment,''))<>length(old_fragment)then
   raise exception 'CERTIFICATION_REOPEN_LINEAGE_PREDECESSOR_DRIFT:%',function_id;end if;
  execute replace(definition,old_fragment,new_fragment);
  select prosrc into strict after_body from pg_proc where oid=function_id;
  if replace(after_body,new_fragment,old_fragment)is distinct from before_body then
   raise exception 'CERTIFICATION_REOPEN_LINEAGE_BODY_CHANGED:%',function_id;end if;
 end loop;
end;$repair$;

do $attributes$ declare before_value record;after_value pg_proc%rowtype;dependencies jsonb;begin
 for before_value in select * from certification_reopen_lineage_before loop
  select * into strict after_value from pg_proc where oid=before_value.oid;
  select coalesce(jsonb_agg(to_jsonb(d)order by to_jsonb(d)::text),'[]')into dependencies from pg_depend d
   where(d.classid='pg_proc'::regclass and d.objid=before_value.oid)
    or(d.refclassid='pg_proc'::regclass and d.refobjid=before_value.oid);
  if(to_jsonb(before_value)-'retained_dependencies'-'prosrc')is distinct from(to_jsonb(after_value)-'prosrc')
   or before_value.retained_dependencies is distinct from dependencies then
   raise exception 'CERTIFICATION_REOPEN_LINEAGE_ATTRIBUTES_CHANGED:%',before_value.oid::regprocedure;end if;
  if before_value.oid='production_control.guard_canonical_annual_row_v1()'::regprocedure
   and before_value.prosrc is distinct from after_value.prosrc then
   raise exception 'CERTIFICATION_REOPEN_LINEAGE_GUARD_CHANGED';end if;
  if after_value.proowner<>(select oid from pg_roles where rolname=current_user)or not after_value.prosecdef
   or after_value.proconfig is distinct from array['search_path=pg_catalog']::text[]
   or exists(select 1 from aclexplode(coalesce(after_value.proacl,acldefault('f',after_value.proowner)))a
    where a.grantee<>after_value.proowner and a.privilege_type='EXECUTE')then
   raise exception 'CERTIFICATION_REOPEN_LINEAGE_PRIVILEGE_CHANGED:%',before_value.oid::regprocedure;end if;
 end loop;
end;$attributes$;
commit;
