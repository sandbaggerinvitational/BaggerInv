-- Supabase CLI scaffold20261003004554; repository forward ordinal148.
-- Approved Certification-only two-part freshness. No historical backfill,
-- Production fingerprint change, current settings authority or auto-publication.
begin;
create temporary table certification_odds_freshness_before on commit drop as
 select p.oid,p.proowner,p.proacl,p.prosecdef,p.proconfig,p.provolatile,p.prosrc,
  (select coalesce(jsonb_agg(to_jsonb(d)order by to_jsonb(d)::text),'[]')from pg_depend d
   where d.classid='pg_proc'::regclass and d.objid=p.oid)dependencies
 from pg_proc p where p.oid in(
  'production_control.canonical_commit_prediction_settings_revision_resource_v2(jsonb,jsonb)'::regprocedure,
  'production_control.current_canonical_odds_inputs_v2(text,text,jsonb,boolean,jsonb)'::regprocedure,
  'production_control.canonical_odds_dispatch_v2(jsonb,jsonb)'::regprocedure,
  'production_control.canonical_publish_odds_v2(jsonb,text,jsonb)'::regprocedure,
  'production_control.annual_odds_pairing_fingerprint_v1(text)'::regprocedure);

-- Reuse the exact existing structural manifest, with one documented removal.
-- The legacy function/OID remains untouched for Production and old evidence.
do $structure$ declare definition text;begin
 definition:=pg_get_functiondef('production_control.annual_odds_pairing_fingerprint_v1(text)'::regprocedure);
 if length(definition)-length(replace(definition,$needle$        'status', match_value.status,
$needle$,''))<>length($needle$        'status', match_value.status,
$needle$) then raise exception 'CERTIFICATION_ODDS_STRUCTURE_SOURCE_DRIFT';end if;
 definition:=replace(definition,'production_control.annual_odds_pairing_fingerprint_v1(',
  'production_control.certification_odds_pairing_structure_fingerprint_v1(');
 definition:=replace(definition,'production-annual-odds-pairing-context-v1','certification-odds-pairing-structure-v1');
 definition:=replace(definition,$needle$        'status', match_value.status,
$needle$,'');
 execute definition;
end;$structure$;
revoke all on function production_control.certification_odds_pairing_structure_fingerprint_v1(text)
 from public,anon,authenticated,service_role;

-- Existing scoring and Finalize acquire the target match row FOR UPDATE before
-- changing either match or hole authority. Lock these exact current rows in
-- deterministic order before reading or locking a job. Structural authoring is
-- excluded by the already-held shared scoring-admission fence. This adds no
-- work to score transactions, and no lock is held across worker HTTP calls.
create function production_control.lock_certification_odds_source_v1(target text,context jsonb)
returns void language plpgsql security definer set search_path=pg_catalog as $$
begin
 if context is distinct from production_control.current_certification_context_v1()
  or context->>'resource_class'is distinct from'CERTIFICATION'
  or context->>'tournament_id'is distinct from target then
  raise exception using errcode='42501',message='CERTIFICATION_ODDS_CONTEXT_REQUIRED';end if;
 if target='2026'then
  -- Initial setup has the legacy shared admission fence and these canonical
  -- authoring locks. Preserve its existing access -> setup -> match ordering.
  perform pg_advisory_xact_lock(hashtextextended('production-access-governance-v1:2026',0));
  perform pg_advisory_xact_lock(hashtextextended('production-tournament-setup-v1:2026',0));
 end if;
 perform 1 from scoring_authority.matches m where m.tournament_id=target order by m.match_id for share;
 perform 1 from scoring_authority.participant_home_presentations p where p.tournament_id=target for share;
end;$$;
revoke all on function production_control.lock_certification_odds_source_v1(text,jsonb)
 from public,anon,authenticated,service_role;

-- The immutable engine snapshot already records this canonical live revision
-- and is included in the invocation input hash. Comparing the JSON directly
-- retains every existing lifecycle/match/hole/presentation invalidator.
create function production_control.assert_certification_odds_live_source_v1(target text,snapshot jsonb,context jsonb)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare current_value jsonb;captured jsonb:=snapshot#>'{metadata,sourceRevision}';
 captured_fingerprint text:=snapshot#>>'{metadata,certificationLiveSourceFingerprint}';
begin
 perform production_control.lock_certification_odds_source_v1(target,context);
 current_value:=public.read_leaderboards_core_view(target);
 if current_value->>'ok'is distinct from'true'
  or jsonb_typeof(captured)is distinct from'object' or captured='{}'::jsonb
  or captured->>'tournamentId'is distinct from target
  or captured is distinct from current_value#>'{data,source_revision}'
  or captured_fingerprint is null or captured_fingerprint!~'^[0-9a-f]{64}$'
  or captured_fingerprint is distinct from production_control.future_runtime_hash_v2((current_value->'data')-'query_ms')then
  raise exception using errcode='40001',message='ODDS_CALCULATION_SOURCE_ADVANCED';end if;
end;$$;
revoke all on function production_control.assert_certification_odds_live_source_v1(text,jsonb,jsonb)
 from public,anon,authenticated,service_role;

-- Each replacement preserves the installed function identity and its original
-- authority branches. An exact reverse comparison prevents unrelated edits.
do $replace$ declare name regprocedure;definition text;before_body text;after_body text;
 old_fragment text;new_fragment text;reverse_old text[];reverse_new text[];i integer;
begin
 foreach name in array array[
  'production_control.canonical_commit_prediction_settings_revision_resource_v2(jsonb,jsonb)'::regprocedure,
  'production_control.current_canonical_odds_inputs_v2(text,text,jsonb,boolean,jsonb)'::regprocedure,
  'production_control.canonical_odds_dispatch_v2(jsonb,jsonb)'::regprocedure,
  'production_control.canonical_publish_odds_v2(jsonb,text,jsonb)'::regprocedure]loop
  select prosrc into strict before_body from pg_proc where oid=name;
  definition:=pg_get_functiondef(name);reverse_old:=array[]::text[];reverse_new:=array[]::text[];
  if name='production_control.canonical_commit_prediction_settings_revision_resource_v2(jsonb,jsonb)'::regprocedure then
   old_fragment:=$old$      'automaticPublicationRequested', false
    ),
    effective_at_value, current_config.id$old$;
   new_fragment:=$new$      'automaticPublicationRequested', false
    ) || case when resource_context->>'resource_class'='CERTIFICATION'
      and target<>pointer.tournament_id then jsonb_build_object(
        'certificationStructuralContract','certification-odds-pairing-structure-v1',
        'certificationStructuralFingerprint',production_control.certification_odds_pairing_structure_fingerprint_v1(target),
        'certificationStructuralSetupRevision',catalog.setup_revision)
      else '{}'::jsonb end,
    effective_at_value, current_config.id$new$;
   reverse_old:=array[old_fragment];reverse_new:=array[new_fragment];
  elsif name='production_control.current_canonical_odds_inputs_v2(text,text,jsonb,boolean,jsonb)'::regprocedure then
   old_fragment:=$old$  if c.pairing_fingerprint is distinct from production_control.annual_odds_pairing_fingerprint_v1(target)
   or coalesce((c.validation_diagnostics->>'annualSetupRevision')::bigint,-1)<>catalog.setup_revision then$old$;
   new_fragment:=$new$  if c.validation_diagnostics->>'certificationStructuralContract'is distinct from'certification-odds-pairing-structure-v1'
   or c.validation_diagnostics->>'certificationStructuralFingerprint'is distinct from production_control.certification_odds_pairing_structure_fingerprint_v1(target)
   or coalesce((c.validation_diagnostics->>'certificationStructuralSetupRevision')::bigint,-1)<>catalog.setup_revision
   or coalesce((c.validation_diagnostics->>'annualSetupRevision')::bigint,-1)<>catalog.setup_revision then$new$;
   reverse_old:=array[old_fragment];reverse_new:=array[new_fragment];
  elsif name='production_control.canonical_odds_dispatch_v2(jsonb,jsonb)'::regprocedure then
   reverse_old:=array[
    $old$  destination := input->>'annual_destination_workbook_id';$old$,
    $old$    return jsonb_set(public.read_championship_odds_inputs(target),'{data,certification_context}',production_control.certification_odds_runtime_v1(context));$old$,
    $old$  if operation_name = 'request_production_odds_calculation_job' then
    config :=$old$,
    $old$    perform production_control.assert_canonical_odds_job_v1(input,target,retained,context);
    begin
      config := production_control.current_canonical_odds_inputs_v2($old$,
    $old$    if retained.status <> 'RUNNING'
       or retained.claim_token is distinct from claim$old$
   ];
   reverse_new:=array[
    $new$  destination := input->>'annual_destination_workbook_id';
  if context is not null and operation_name in('read_production_odds_calculation_inputs',
    'request_production_odds_calculation_job','claim_production_odds_calculation_job',
    'checkpoint_production_odds_calculation_job','complete_production_odds_calculation_job',
    'publish_production_championship_odds_v1') then
   perform production_control.lock_certification_odds_source_v1(target,context);
  end if;$new$,
    $new$    publication_result:=public.read_championship_odds_inputs(target);
    -- Existing canonical read data; exclude measurement only. This supplements
    -- the old source_revision, which does not enumerate team/roster/round data.
    return jsonb_set(jsonb_set(publication_result,'{data,certification_context}',
      production_control.certification_odds_runtime_v1(context)),
      '{data,certification_live_source_fingerprint}',to_jsonb(production_control.future_runtime_hash_v2(
        (publication_result#>'{data,current_state}')-'query_ms')));$new$,
    $new$  if operation_name = 'request_production_odds_calculation_job' then
    if context is not null then
     perform production_control.assert_certification_odds_live_source_v1(target,input->'input_snapshot',context);
    end if;
    config :=$new$,
    $new$    perform production_control.assert_canonical_odds_job_v1(input,target,retained,context);
    -- A published job is retained history. A worker retry may observe its
    -- existing terminal result, but must never supersede it after source or
    -- configuration advancement. Preserve the existing completed/conflict
    -- outcomes; only Certification skips inapplicable current-input checks.
    if context is not null and retained.status='SUCCEEDED'
      and retained.publication_status='PUBLISHED' then
     if operation_name='claim_production_odds_calculation_job' then
      return jsonb_build_object('ok',true,'deliver',false,'completed',true,
       'job',to_jsonb(retained)-'claim_token');
     end if;
     return jsonb_build_object('ok',false,'code','ODDS_CALCULATION_RESULT_CONFLICT');
    end if;
    begin
      if context is not null then
       perform production_control.assert_certification_odds_live_source_v1(target,retained.input_snapshot,context);
      end if;
      config := production_control.current_canonical_odds_inputs_v2($new$,
    $new$    if context is not null and operation_name='checkpoint_production_odds_calculation_job' then
     perform production_control.assert_certification_odds_live_source_v1(target,retained.input_snapshot,context);
    end if;
    if retained.status <> 'RUNNING'
       or retained.claim_token is distinct from claim$new$
   ];
  else
   reverse_old:=array[$old$  config := production_control.current_canonical_odds_inputs_v2(
    target, annual_resource.source_workbook_id,$old$];
   reverse_new:=array[$new$  if context is not null then
   perform production_control.assert_certification_odds_live_source_v1(target,job.input_snapshot,context);
  end if;
  config := production_control.current_canonical_odds_inputs_v2(
    target, annual_resource.source_workbook_id,$new$];
  end if;
  for i in 1..array_length(reverse_old,1)loop
   if strpos(definition,reverse_old[i])=0 then raise exception 'CERTIFICATION_ODDS_FRESHNESS_SOURCE_DRIFT:%:%',name,i;end if;
   definition:=replace(definition,reverse_old[i],reverse_new[i]);
  end loop;
  execute definition;
  select prosrc into strict after_body from pg_proc where oid=name;
  for i in reverse array_length(reverse_old,1)..1 loop after_body:=replace(after_body,reverse_new[i],reverse_old[i]);end loop;
  if after_body is distinct from before_body then raise exception 'CERTIFICATION_ODDS_FRESHNESS_REVERSAL_FAILED:%',name;end if;
 end loop;
end;$replace$;

do $attributes$begin
 if exists(select 1 from certification_odds_freshness_before b join pg_proc p on p.oid=b.oid
  where b.oid='production_control.annual_odds_pairing_fingerprint_v1(text)'::regprocedure
   and p.prosrc is distinct from b.prosrc)then
  raise exception 'PRODUCTION_ODDS_PAIRING_FINGERPRINT_CHANGED';end if;
 if exists(select 1 from certification_odds_freshness_before b join pg_proc p on p.oid=b.oid
  where p.proowner is distinct from b.proowner or p.proacl is distinct from b.proacl
   or p.prosecdef is distinct from b.prosecdef or p.proconfig is distinct from b.proconfig
   or p.provolatile is distinct from b.provolatile or b.dependencies is distinct from
    (select coalesce(jsonb_agg(to_jsonb(d)order by to_jsonb(d)::text),'[]')from pg_depend d
     where d.classid='pg_proc'::regclass and d.objid=p.oid))then
  raise exception 'CERTIFICATION_ODDS_FRESHNESS_FUNCTION_ATTRIBUTES_CHANGED';end if;
end;$attributes$;
commit;
