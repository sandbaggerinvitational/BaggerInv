-- CLI scaffold20261003014427; repository forward ordinal150.
-- An approved current-source publication is not identified by its numerical
-- result alone. Preserve the original configuration fingerprint and include
-- the148 canonical live-source revision in new Certification publication keys.
-- No index, Production branch, historical snapshot or operation replay change.
begin;
do $identity$ declare
 function_id regprocedure:='production_control.canonical_publish_odds_v2(jsonb,text,jsonb)'::regprocedure;
 before_value pg_proc%rowtype;after_value pg_proc%rowtype;definition text;reversed text;
 before_dependencies jsonb;after_dependencies jsonb;before_indexes jsonb;after_indexes jsonb;
 old_fragments text[];new_fragments text[];i integer;
begin
 select * into strict before_value from pg_proc where oid=function_id;
 select coalesce(jsonb_agg(to_jsonb(d)order by to_jsonb(d)::text),'[]')into before_dependencies
  from pg_depend d where(d.classid='pg_proc'::regclass and d.objid=function_id)
   or(d.refclassid='pg_proc'::regclass and d.refobjid=function_id);
 select jsonb_agg(jsonb_build_object('oid',indexrelid,'definition',pg_get_indexdef(indexrelid))order by indexrelid)
  into before_indexes from pg_index where indrelid='scoring_authority.odds_published_snapshots'::regclass;
 old_fragments:=array[
  $old$  if context is null then
  binding := pg_catalog.jsonb_build_object(
    'contract_version', 'production-odds-publication-v1',$old$,
  $old$      'result_fingerprint',job.result_fingerprint,'actor_player_id',actor_player,'actor_auth_user_id',actor_auth_user);$old$,
  $old$    nullif(job.source_revision->>'source_fingerprint', ''),
    job.engine_version,$old$
 ];
 new_fragments:=array[
  $new$  if context is not null then
    -- Both components have already been checked against current canonical
    -- authority under148's publication locks. Keep their original meanings.
    source_revision_value:=source_revision_value||jsonb_build_object(
      'publication_source_identity',jsonb_build_object(
        'contract_version','certification-odds-publication-source-v1',
        'configuration_source_fingerprint',job.source_revision->>'source_fingerprint',
        'canonical_live_source_fingerprint',job.input_snapshot#>>'{metadata,certificationLiveSourceFingerprint}'));
    source_revision_value:=jsonb_set(source_revision_value,'{publication_source_identity,fingerprint}',
      to_jsonb(production_control.odds_publication_v1_hash(source_revision_value->'publication_source_identity')));
  end if;
  if context is null then
  binding := pg_catalog.jsonb_build_object(
    'contract_version', 'production-odds-publication-v1',$new$,
  $new$      'result_fingerprint',job.result_fingerprint,'actor_player_id',actor_player,'actor_auth_user_id',actor_auth_user)
      ||jsonb_build_object('publication_source_identity',source_revision_value->'publication_source_identity');$new$,
  $new$    case when context is null then nullif(job.source_revision->>'source_fingerprint', '')
      else source_revision_value#>>'{publication_source_identity,fingerprint}'end,
    job.engine_version,$new$
 ];
 definition:=pg_get_functiondef(function_id);
 for i in 1..array_length(old_fragments,1)loop
  if length(definition)-length(replace(definition,old_fragments[i],''))<>length(old_fragments[i])then
   raise exception 'CERTIFICATION_ODDS_PUBLICATION_IDENTITY_SOURCE_DRIFT:%',i;end if;
  definition:=replace(definition,old_fragments[i],new_fragments[i]);
 end loop;
 execute definition;
 select * into strict after_value from pg_proc where oid=function_id;
 reversed:=after_value.prosrc;
 for i in reverse array_length(old_fragments,1)..1 loop
  reversed:=replace(reversed,new_fragments[i],old_fragments[i]);
 end loop;
 if reversed is distinct from before_value.prosrc then
  raise exception 'CERTIFICATION_ODDS_PUBLICATION_IDENTITY_BODY_CHANGED';end if;
 if(to_jsonb(after_value)-'prosrc')is distinct from(to_jsonb(before_value)-'prosrc')then
  raise exception 'CERTIFICATION_ODDS_PUBLICATION_IDENTITY_ATTRIBUTES_CHANGED';end if;
 select coalesce(jsonb_agg(to_jsonb(d)order by to_jsonb(d)::text),'[]')into after_dependencies
  from pg_depend d where(d.classid='pg_proc'::regclass and d.objid=function_id)
   or(d.refclassid='pg_proc'::regclass and d.refobjid=function_id);
 select jsonb_agg(jsonb_build_object('oid',indexrelid,'definition',pg_get_indexdef(indexrelid))order by indexrelid)
  into after_indexes from pg_index where indrelid='scoring_authority.odds_published_snapshots'::regclass;
 if before_dependencies is distinct from after_dependencies or before_indexes is distinct from after_indexes then
  raise exception 'CERTIFICATION_ODDS_PUBLICATION_IDENTITY_INDEX_DEPENDENCY_CHANGED';end if;
end;$identity$;
commit;
