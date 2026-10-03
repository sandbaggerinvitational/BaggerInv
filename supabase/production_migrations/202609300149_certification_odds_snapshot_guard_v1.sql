-- CLI scaffold20261003012011; repository forward ordinal149.
-- Approved resource-aware repair for the retained057 snapshot UPDATE guard.
-- No new publication policy, role, immutable-field exception or Production row.
begin;
do $guard$ declare
 function_id regprocedure:='production_control.guard_odds_snapshot_immutability()'::regprocedure;
 before_value pg_proc%rowtype;after_value pg_proc%rowtype;definition text;reversed text;
 before_dependencies jsonb;after_dependencies jsonb;before_triggers jsonb;after_triggers jsonb;
 old_fragment text:=$old$  select odds_publication_authority into strict authority_value
  from production_control.resource_scope
  where scope_key = 'BAGGER_INV_PRODUCTION';$old$;
 new_fragment text:=$new$  declare
    registered production_control.canonical_resource_v1%rowtype;
    context jsonb;
  begin
    select * into registered from production_control.canonical_resource_v1 where singleton;
    if registered.resource_class='CERTIFICATION'
      or old.resource_binding->>'resource_class'='CERTIFICATION' then
      -- This getter revalidates the private transaction marker and its original
      -- admitted request. A client JSON object or GUC is not an authority source.
      context:=production_control.current_certification_context_v1();
      if registered.resource_class is distinct from 'CERTIFICATION'
        or registered.database_name is distinct from current_database()
        or context->>'resource_class' is distinct from 'CERTIFICATION'
        or context->>'resource_id' is distinct from registered.resource_id
        or context->>'installation_id' is distinct from registered.installation_id::text
        or context->>'project_ref' is distinct from registered.project_ref
        or context->>'phase' is distinct from 'DIRECTOR'
        or context->>'tournament_id' is distinct from old.tournament_id
        or nullif(context->>'operation_request_id','') is null
        or old.publication_authority is distinct from 'SUPABASE'
        or old.resource_binding->>'contract_version' is distinct from 'certification-odds-publication-v1'
        or old.resource_binding->>'resource_class' is distinct from 'CERTIFICATION'
        or old.resource_binding->>'resource_id' is distinct from registered.resource_id
        or old.resource_binding->>'installation_id' is distinct from registered.installation_id::text
        or old.resource_binding->>'project_ref' is distinct from registered.project_ref
        or old.resource_binding->>'tournament_id' is distinct from old.tournament_id
        or old.resource_binding_fingerprint is distinct from
          production_control.odds_publication_v1_hash(old.resource_binding) then
        raise exception using errcode='42501',message='CERTIFICATION_ODDS_SNAPSHOT_RESOURCE_DENIED';
      end if;
      perform production_control.assert_certification_odds_actor_v1(
        jsonb_build_object('authorization',context->'authorization'),context);
      authority_value:='SUPABASE';
    else
      select odds_publication_authority into strict authority_value
      from production_control.resource_scope
      where scope_key = 'BAGGER_INV_PRODUCTION';
    end if;
  end;$new$;
begin
 select * into strict before_value from pg_proc where oid=function_id;
 select coalesce(jsonb_agg(to_jsonb(d)order by to_jsonb(d)::text),'[]')into before_dependencies
  from pg_depend d where(d.classid='pg_proc'::regclass and d.objid=function_id)
   or(d.refclassid='pg_proc'::regclass and d.refobjid=function_id);
 select jsonb_agg(to_jsonb(t)order by oid)into before_triggers from pg_trigger t where tgfoid=function_id;
 definition:=pg_get_functiondef(function_id);
 if length(definition)-length(replace(definition,old_fragment,''))<>length(old_fragment)then
  raise exception 'CERTIFICATION_ODDS_SNAPSHOT_GUARD_PREDECESSOR_DRIFT';end if;
 execute replace(definition,old_fragment,new_fragment);
 select * into strict after_value from pg_proc where oid=function_id;
 reversed:=replace(after_value.prosrc,new_fragment,old_fragment);
 if reversed is distinct from before_value.prosrc then
  raise exception 'CERTIFICATION_ODDS_SNAPSHOT_GUARD_BODY_CHANGED';end if;
 if (to_jsonb(after_value)-'prosrc')is distinct from(to_jsonb(before_value)-'prosrc')then
  raise exception 'CERTIFICATION_ODDS_SNAPSHOT_GUARD_ATTRIBUTES_CHANGED';end if;
 select coalesce(jsonb_agg(to_jsonb(d)order by to_jsonb(d)::text),'[]')into after_dependencies
  from pg_depend d where(d.classid='pg_proc'::regclass and d.objid=function_id)
   or(d.refclassid='pg_proc'::regclass and d.refobjid=function_id);
 select jsonb_agg(to_jsonb(t)order by oid)into after_triggers from pg_trigger t where tgfoid=function_id;
 if before_dependencies is distinct from after_dependencies or before_triggers is distinct from after_triggers then
  raise exception 'CERTIFICATION_ODDS_SNAPSHOT_GUARD_DEPENDENCY_CHANGED';end if;
end;$guard$;
commit;
