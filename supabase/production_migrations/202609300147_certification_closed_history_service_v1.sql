-- Supabase CLI scaffold20261002233804; repository ordinal147.
-- Existing same-resource predecessor authority, retained Guide and metadata.
-- Read-only; no closure mutation, publication, new role or Production change.
begin;
create temporary table certification_closed_history_wrapper_before on commit drop as
 select p.oid,p.proowner,p.proacl,p.prosecdef,p.proconfig,p.provolatile,
  (select coalesce(jsonb_agg(to_jsonb(d)order by to_jsonb(d)::text),'[]')from pg_depend d
   where d.classid='pg_proc'::regclass and d.objid=p.oid)dependencies
 from pg_proc p where p.oid='public.read_certification_projection_v1(jsonb)'::regprocedure;

create function production_control.certification_closed_history_2026_read_v1(input jsonb,context jsonb)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare history_value jsonb;guide_value jsonb;metadata_value jsonb;courses_value jsonb;tournament_value jsonb;
 r production_control.canonical_resource_v1%rowtype;
 revision production_control.projection_revisions%rowtype;
 pointer production_control.projection_current%rowtype;
 closure_time timestamptz;
begin
 if jsonb_typeof(input)is distinct from'object' or input->>'target_tournament_id'is distinct from'2026'
  or exists(select 1 from jsonb_object_keys(input)k where k not in('target_tournament_id','include_tournament_player_metadata'))
  or(input?'include_tournament_player_metadata'and jsonb_typeof(input->'include_tournament_player_metadata')is distinct from'boolean')then
  raise exception using errcode='22023',message='CERTIFICATION_HISTORY_INPUT_INVALID';end if;
 -- This existing boundary validates the installed READS context, exact resource,
 -- completed annual lineage, closed generation and every canonical Final snapshot.
 history_value:=production_control.certification_closed_tournament_read_v1(
  jsonb_build_object('target_tournament_id','2026'),context);
 select *into strict r from production_control.canonical_resource_v1 where singleton
  and resource_id=context->>'resource_id'and resource_class='CERTIFICATION'and database_name=current_database();
 select c.closed_at into strict closure_time
 from production_control.annual_scoring_transitions_v1 t
 join production_control.scoring_admission_closures c on c.closure_id=t.predecessor_closure_id
 where t.resource_class='CERTIFICATION'and t.certification_resource_id=r.resource_id
  and t.predecessor_tournament_id='2026'and t.transition_status='COMMITTED'
  and c.resource_class='CERTIFICATION'and c.certification_resource_id=r.resource_id
  and c.tournament_id='2026'and c.status='CLOSED';
 select *into pointer from production_control.projection_current where domain='GUIDE'and tournament_id='2026';
 select *into revision from production_control.projection_revisions where revision_id=pointer.revision_id;
 if revision.revision_id is null then return jsonb_build_object('ok',false,'code','GUIDE_PROJECTION_UNAVAILABLE');end if;
 -- Retained published authority, not a claim that the annual fingerprint pins
 -- Guide content. The same registered canonical pointer used before close is
 -- required, published before the closure; no successor/current fallback.
 if revision.domain<>'GUIDE'or revision.tournament_id<>'2026'or revision.tournament_year<>2026
  or revision.contract_version<>'guide-projection-v1'
  or revision.source_tabs is distinct from production_control.guide_authoring_source_tabs_v1()
  or revision.validation_status<>'VALID'
  or revision.project_ref is distinct from r.project_ref or revision.project_url is distinct from r.project_url
  or revision.source_workbook_id is distinct from r.provenance_id or closure_time is null
  or revision.imported_at is null or pointer.advanced_at is null
  or revision.imported_at>closure_time or pointer.advanced_at>closure_time
  or revision.payload_fingerprint is distinct from production_control.guide_authoring_hash_v1(revision.projection_payload)
  or revision.source_fingerprint is distinct from production_control.guide_authoring_hash_v1(revision.source_payload)then
  raise exception using errcode='55000',message='CERTIFICATION_HISTORY_GUIDE_PROVENANCE_UNAVAILABLE';end if;
 select jsonb_build_object('tournament_id',t.tournament_id,'tournament_year',t.tournament_year,'name',t.name)
 into strict tournament_value from scoring_authority.tournaments t where t.tournament_id='2026';
 courses_value:=production_control.guide_canonical_course_context_v1('2026');
 if scoring_authority.guide_course_context_is_eligible(courses_value)is not true then
  raise exception using errcode='55000',message='GUIDE_CANONICAL_CONTEXT_UNAVAILABLE';end if;
 guide_value:=jsonb_build_object('ok',true,'data',jsonb_build_object(
  'domain',revision.domain,'tournament_id',revision.tournament_id,'tournament_year',revision.tournament_year,
  'revision_id',revision.revision_id,'revision_number',revision.revision_number,'previous_revision_id',revision.previous_revision_id,
  'source_tabs',revision.source_tabs,'contract_version',revision.contract_version,
  'source_fingerprint',revision.source_fingerprint,'payload_fingerprint',revision.payload_fingerprint,
  'validation_status',revision.validation_status,'validation_diagnostics',revision.validation_diagnostics,
  'payload',revision.projection_payload,'imported_at',revision.imported_at,
  'tournament',tournament_value,'course_context',courses_value,
  'delivery_fingerprint',encode(extensions.digest(jsonb_build_object('publication',revision.payload_fingerprint,
   'tournament',tournament_value,'course_context',courses_value)::text,'sha256'),'hex'),
  'authoritative',true,'shadow_only',false,'google_foreground_requests',0,'fallback_used',false));
 if coalesce((input->>'include_tournament_player_metadata')::boolean,false)then
  -- The closed aggregate already uses the canonical leaderboard projection.
  -- Retain only the public presentation keys consumed by the existing merge.
  metadata_value:=jsonb_build_object('ok',true,'data',jsonb_build_object(
   'players',(select coalesce(jsonb_agg(jsonb_build_object('player_id',p->'player_id','team_side',p->'team_side',
    'presentation',jsonb_build_object('captain',p#>'{presentation,captain}'),
    'source_payload',jsonb_build_object('Captain',p#>'{source_payload,Captain}'),
    'tournament_source_payload',jsonb_build_object('Tournament Handicap',p#>'{tournament_source_payload,Tournament Handicap}',
      'Captain',p#>'{tournament_source_payload,Captain}'))),'[]')from jsonb_array_elements(history_value#>'{data,players}')p),
   'teams',(select coalesce(jsonb_agg(jsonb_build_object('team_side',t->'team_side','captain_player_id',t->'captain_player_id',
    'captain_id',t->'captain_id','source_payload',jsonb_build_object('Captain Player ID',t#>'{source_payload,Captain Player ID}',
     'Captain ID',t#>'{source_payload,Captain ID}','Captain',t#>'{source_payload,Captain}'))),'[]')
     from jsonb_array_elements(history_value#>'{data,teams}')t),
   'tournament',jsonb_build_object('source_payload',jsonb_build_object(
    'Captain Team 1',history_value#>'{data,tournament,source_payload,Captain Team 1}',
    'Captain Team 2',history_value#>'{data,tournament,source_payload,Captain Team 2}'))));
 end if;
 return jsonb_build_object('ok',true,'data',jsonb_build_object('history',history_value,'guide',guide_value,
  'tournament_player_metadata',metadata_value),'google_foreground_requests',0,'fallback_used',false,'authoritative',true);
end;$$;
revoke all on function production_control.certification_closed_history_2026_read_v1(jsonb,jsonb)from public,anon,authenticated,service_role;

do $patch$declare definition text;anchor text:=$old$ context:=production_control.push_certification_context_v1(input,'READS',false);$old$;
begin
 definition:=pg_get_functiondef('public.read_certification_projection_v1(jsonb)'::regprocedure);
 if(length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then
  raise exception 'CERTIFICATION_CLOSED_HISTORY_GATEWAY_PREDECESSOR_MISMATCH';end if;
 execute replace(definition,anchor,anchor||$new$
 if input->>'operation'='READS.CLOSED_HISTORY_2026'then
  result:=production_control.certification_closed_history_2026_read_v1(payload,context);
  perform production_control.pop_certification_context_v1();return result;end if;$new$);
end;$patch$;
do $acl$declare p pg_proc%rowtype;oldrow record;deps jsonb;
begin
 select *into strict oldrow from certification_closed_history_wrapper_before;
 select *into strict p from pg_proc where oid=oldrow.oid;
 select coalesce(jsonb_agg(to_jsonb(d)order by to_jsonb(d)::text),'[]')into deps from pg_depend d
  where d.classid='pg_proc'::regclass and d.objid=p.oid;
 if p.proowner<>oldrow.proowner or p.proacl is distinct from oldrow.proacl or p.prosecdef<>oldrow.prosecdef
  or p.proconfig is distinct from oldrow.proconfig or p.provolatile<>oldrow.provolatile or deps is distinct from oldrow.dependencies then
  raise exception 'CERTIFICATION_CLOSED_HISTORY_WRAPPER_ATTRIBUTES_CHANGED';end if;
 select *into strict p from pg_proc where oid='production_control.certification_closed_history_2026_read_v1(jsonb,jsonb)'::regprocedure;
 if p.proowner<>(select oid from pg_roles where rolname=current_user)or not p.prosecdef
  or p.proconfig<>array['search_path=pg_catalog']or exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a
   where a.grantee<>p.proowner and a.privilege_type='EXECUTE')then raise exception 'CERTIFICATION_CLOSED_HISTORY_PRIVATE_PRIVILEGE_EXPANSION';end if;
end;$acl$;
commit;
