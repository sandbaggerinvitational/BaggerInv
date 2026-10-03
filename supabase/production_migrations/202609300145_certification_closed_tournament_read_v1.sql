-- Supabase CLI scaffold20261002214707; repository ordinal145. Read-only
-- predecessor History for the approved Certification annual chronology.
-- Existing Production2026 admission and projection fields remain unchanged.
begin;
create temporary table certification_history_read_originals on commit drop as
 select p.oid,p.proowner,p.proacl,p.prosecdef,p.proconfig,p.provolatile,p.prosrc,
  (select coalesce(jsonb_agg(to_jsonb(d)order by to_jsonb(d)::text),'[]')from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid)dependencies
 from pg_proc p where p.oid in('production_control.canonical_current_view_read_v1(jsonb,jsonb)'::regprocedure,
  'public.read_certification_projection_v1(jsonb)'::regprocedure);

create function production_control.canonical_finalized_tournament_projection_v1(target text,schema_version text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare result_value jsonb;finalized_value jsonb;
begin
 result_value:=public.read_leaderboards_core_view(target);
 if coalesce((result_value->>'ok')::boolean,false)then
  select coalesce(jsonb_agg(jsonb_build_object(
   'tournament_id',finalized.tournament_id,'match_id',finalized.match_id,'snapshot_revision',finalized.snapshot_revision,
   'state',finalized.state,'match_revision',finalized.match_revision,'scoring_snapshot_id',finalized.scoring_snapshot_id,
   'scoring_snapshot_revision',finalized.scoring_snapshot_revision,'source_fingerprint',finalized.source_fingerprint,
   'payload_hash',finalized.payload_hash,'payload',finalized.payload,'finalized_at',finalized.finalized_at)
   order by finalized.match_id),'[]'::jsonb)into finalized_value
  from scoring_authority.finalized_scorecard_snapshots finalized
  join scoring_authority.matches match_value on match_value.match_id=finalized.match_id
  where finalized.tournament_id=target and finalized.state='CURRENT'and match_value.status='FINAL'
   and finalized.match_revision=match_value.match_revision and finalized.scoring_snapshot_id=match_value.scoring_snapshot_id;
  result_value:=jsonb_set(jsonb_set(result_value,'{data,schema_version}',to_jsonb(schema_version),true),
   '{data,finalized_snapshots}',finalized_value,true);
 end if;
 return result_value;
end;$$;
revoke all on function production_control.canonical_finalized_tournament_projection_v1(text,text)from public,anon,authenticated,service_role;

create function production_control.certification_closed_tournament_read_v1(input jsonb,context jsonb)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare target text:=input->>'target_tournament_id';verified jsonb;r production_control.canonical_resource_v1%rowtype;
 t production_control.annual_scoring_transitions_v1%rowtype;c production_control.scoring_admission_closures%rowtype;
 g production_control.certification_ingress_generations_v1%rowtype;result_value jsonb;
begin
 verified:=production_control.current_certification_context_v1();
 if context is distinct from verified or context->>'resource_class' is distinct from 'CERTIFICATION'
  or context->>'phase' is distinct from 'READS' or jsonb_typeof(input) is distinct from 'object'
  or exists(select 1 from jsonb_object_keys(input)k where k<>'target_tournament_id')
  or target is null or target!~'^20[0-9]{2}$' or target=context->>'current_tournament_id' then
  raise exception using errcode='42501',message='CERTIFICATION_HISTORY_TARGET_DENIED';end if;
 if (context->>'current_tournament_year')::integer>2026 then
  perform production_control.assert_current_certification_future_context_v1(context);end if;
 select * into strict r from production_control.canonical_resource_v1 where singleton and resource_id=context->>'resource_id'
  and resource_class='CERTIFICATION' and database_name=current_database();
 select * into strict t from production_control.annual_scoring_transitions_v1 where resource_class='CERTIFICATION'
  and certification_resource_id=r.resource_id and predecessor_tournament_id=target and transition_status='COMMITTED';
 select * into strict c from production_control.scoring_admission_closures where closure_id=t.predecessor_closure_id
  and resource_class='CERTIFICATION'and certification_resource_id=r.resource_id and tournament_id=target
  and boundary_mode='CERTIFICATION_INGRESS_V1'and status='CLOSED';
 select * into strict g from production_control.certification_ingress_generations_v1 where resource_id=r.resource_id
  and generation_id=c.admission_generation_id and tournament_id=target and state='CLOSED'
  and authority_epoch_id=c.authority_generation_id and revision=c.closed_admission_revision
  and high_watermark=c.lease_high_watermark;
 if not exists(select 1 from production_control.future_tournament_catalog_v1 where tournament_id=target and lifecycle='CLOSED')
  or not exists(select 1 from scoring_authority.authority_epochs where epoch_id=g.authority_epoch_id and tournament_id=target
   and status='COMMITTED'and epoch_type in('CERTIFICATION_INITIALIZATION','CERTIFICATION_ANNUAL_TRANSITION')
   and boundary_mode='CERTIFICATION_INGRESS_V1')
  or not exists(select 1 from scoring_authority.matches where tournament_id=target)
  or exists(select 1 from scoring_authority.matches where tournament_id=target and(status<>'FINAL'or not scorecard_complete))then
  raise exception using errcode='42501',message='CERTIFICATION_HISTORY_CLOSED_AUTHORITY_REQUIRED';end if;
 result_value:=production_control.canonical_finalized_tournament_projection_v1(target,'canonical-completed-tournament-v1');
 if not coalesce((result_value->>'ok')::boolean,false)
  or jsonb_array_length(result_value#>'{data,finalized_snapshots}')<>(select count(*)from scoring_authority.matches where tournament_id=target)then
  raise exception using errcode='55000',message='CERTIFICATION_HISTORY_FINAL_SNAPSHOTS_REQUIRED';end if;
 return production_control.mark_certification_read_v1(result_value,context);
exception when no_data_found or too_many_rows then
 raise exception using errcode='42501',message='CERTIFICATION_HISTORY_CLOSED_AUTHORITY_REQUIRED';
end;$$;
revoke all on function production_control.certification_closed_tournament_read_v1(jsonb,jsonb)from public,anon,authenticated,service_role;

do $patch$
declare definition text;old_branch text;from_offset integer;to_offset integer;
begin
 definition:=pg_get_functiondef('production_control.canonical_current_view_read_v1(jsonb,jsonb)'::regprocedure);
 from_offset:=strpos(definition,$find$  elsif surface = 'HISTORY_2026' then$find$);
 to_offset:=strpos(definition,$find$  elsif surface = 'PARTICIPANT_HOME' then$find$);
 if from_offset=0 or to_offset<=from_offset then raise exception 'CERTIFICATION_HISTORY_PROJECTION_PREDECESSOR_MISMATCH';end if;
 old_branch:=substring(definition from from_offset for to_offset-from_offset);
 if strpos(old_branch,$find$where finalized.tournament_id = '2026'$find$)=0
  or strpos(old_branch,$find$'{data,finalized_snapshots}'$find$)=0 then
  raise exception 'CERTIFICATION_HISTORY_PROJECTION_PREDECESSOR_MISMATCH';end if;
 definition:=replace(definition,old_branch,$new$  elsif surface = 'HISTORY_2026' then
    result_value:=production_control.canonical_finalized_tournament_projection_v1('2026','production-2026-history-v1');
$new$);
 execute definition;
 definition:=pg_get_functiondef('public.read_certification_projection_v1(jsonb)'::regprocedure);
 old_branch:=$old$ context:=production_control.push_certification_context_v1(input,'READS',false);$old$;
 if(length(definition)-length(replace(definition,old_branch,'')))/length(old_branch)<>1 then
  raise exception 'CERTIFICATION_HISTORY_GATEWAY_PREDECESSOR_MISMATCH';end if;
 execute replace(definition,old_branch,old_branch||$new$
 if input->>'operation'='READS.CLOSED_TOURNAMENT'then
  result:=production_control.certification_closed_tournament_read_v1(payload,context);
  perform production_control.pop_certification_context_v1();return result;end if;$new$);
end;$patch$;

do $acl$declare p pg_proc%rowtype;oldrow record;deps jsonb;
begin
 for oldrow in select * from certification_history_read_originals loop
  select * into strict p from pg_proc where oid=oldrow.oid;
  select coalesce(jsonb_agg(to_jsonb(d)order by to_jsonb(d)::text),'[]')into deps from pg_depend d
   where d.classid='pg_proc'::regclass and d.objid=p.oid;
  if p.proowner<>oldrow.proowner or p.proacl is distinct from oldrow.proacl or p.prosecdef<>oldrow.prosecdef
   or p.proconfig is distinct from oldrow.proconfig or p.provolatile<>oldrow.provolatile or deps is distinct from oldrow.dependencies then
   raise exception 'CERTIFICATION_HISTORY_WRAPPER_ATTRIBUTES_CHANGED';end if;
 end loop;
 for p in select *from pg_proc where pronamespace='production_control'::regnamespace
  and proname in('canonical_finalized_tournament_projection_v1','certification_closed_tournament_read_v1')loop
  if p.proowner<>(select oid from pg_roles where rolname=current_user)or not p.prosecdef
   or p.proconfig<>array['search_path=pg_catalog'] or exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a
    where a.grantee<>p.proowner and a.privilege_type='EXECUTE')then
   raise exception 'CERTIFICATION_HISTORY_PRIVATE_PRIVILEGE_EXPANSION';end if;
 end loop;
end;$acl$;
commit;
