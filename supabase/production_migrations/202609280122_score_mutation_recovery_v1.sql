-- Phase 2C candidate only. No deployment authorization.
-- Keep score-write authorization/order unchanged. Retain authenticated origin
-- with each newly accepted receipt; recovery never grants mutation authority.
begin;
do $precondition$
begin
  if exists (select 1 from production_control.annual_side_game_runtime_certifications_v1) then
    raise exception using errcode='55000', message='SCORE_RECOVERY_EXISTING_ANNUAL_CERTIFICATION_REQUIRES_REVIEW';
  end if;
end;
$precondition$;
alter table scoring_authority.score_mutations add column originating_auth_user_id uuid;
-- No FK to auth.users: account deletion must not erase immutable forensic
-- receipts. Current active Auth/link/membership remains required to recover.
-- Legacy NULLs deliberately remain unbound; no speculative identity backfill.

create function pg_temp.patch_score_recovery_source_v1(signature text, expected_hash text, patches jsonb)
returns void language plpgsql set search_path=pg_catalog as $patch$
declare definition text; actual_hash text; item jsonb; needle text;
begin
  select pg_get_functiondef(oid), encode(extensions.digest(prosrc,'sha256'),'hex')
    into strict definition, actual_hash from pg_proc where oid=signature::regprocedure;
  if actual_hash is distinct from expected_hash then
    raise exception 'SCORE_RECOVERY_SOURCE_BASELINE_MISMATCH: %',signature;
  end if;
  for item in select value from jsonb_array_elements(patches) loop
    needle:=item->>0;
    if needle='' or (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then
      raise exception 'SCORE_RECOVERY_SOURCE_ANCHOR_MISMATCH: %',signature;
    end if;
    definition:=replace(definition,needle,item->>1);
  end loop;
  execute definition;
end;
$patch$;

select pg_temp.patch_score_recovery_source_v1('public.submit_production_hole_score(jsonb)',
  '21ba7d1ec29053e7957628657b3a137547e4553688ef6ba5d77dd62e1f7d1ed9', $changes$[["next_hole_revision, result, actor_id\n  ) values", "next_hole_revision, result, actor_id, originating_auth_user_id\n  ) values"], ["next_hole_revision, result_value, actor\n  );", "next_hole_revision, result_value, actor, (input#>>'{authorization,auth_user_id}')::uuid\n  );"]]$changes$::jsonb);

select pg_temp.patch_score_recovery_source_v1('public.future_production_submit_hole_score_v1(jsonb)',
  '33dac710f422adf8d3513605657b64a4d0611e74256f38993a966dd0807665dd', $changes$[["next_hole_revision, result, actor_id\n  ) values", "next_hole_revision, result, actor_id, originating_auth_user_id\n  ) values"], ["next_hole_revision, result_value, actor);", "next_hole_revision, result_value, actor, (input#>>'{authorization,auth_user_id}')::uuid);"]]$changes$::jsonb);
drop function pg_temp.patch_score_recovery_source_v1(text,text,jsonb);

create function production_control.read_score_mutation_status_v1(input jsonb, target_tournament text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $recovery$
declare
  target_match text:=input->>'match_id';
  target_mutation text:=input->>'mutation_key';
  actor text:=input#>>'{authorization,player_id}';
  actor_auth uuid;
  result_value jsonb;
begin
  if target_match is null or target_match !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'
     or target_mutation is null or target_mutation !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
     or input#>>'{authorization,match_id}' is distinct from target_match
     or input#>>'{authorization,tournament_id}' is distinct from target_tournament then
    raise exception using errcode='22023',message='SCORE_RECOVERY_INVALID_REQUEST';
  end if;
  -- Revalidate identity/membership, not score permission. These existing actor
  -- checks include current verified Auth linkage and current Director entitlement
  -- when a trusted Director transport supplies that role.
  if target_tournament='2026' then
    perform production_control.assert_production_scoring_actor(input,false);
  else
    perform production_control.assert_future_production_scoring_actor_v1(input,target_tournament,false);
  end if;
  actor_auth:=(input#>>'{authorization,auth_user_id}')::uuid;
  select mutation.result into result_value
    from scoring_authority.score_mutations mutation
    join scoring_authority.matches match_value using(match_id)
    where mutation.match_id=target_match and mutation.mutation_key=target_mutation
      and match_value.tournament_id=target_tournament
      and mutation.mutation_type='HOLE_SCORE' and mutation.actor_id=actor
      and mutation.originating_auth_user_id=actor_auth;
  if result_value is null then
    -- Absence may mean inflight, rollback, legacy unbound receipt, semantic
    -- NO_CHANGE, or another owner. Never expose another actor's receipt/existence.
    return jsonb_build_object('ok',true,'contract','score-mutation-recovery-v1',
      'status','UNKNOWN','match_id',target_match,'mutation_key',target_mutation);
  end if;
  if result_value->>'code' is distinct from 'ACCEPTED'
     or result_value->>'match_id' is distinct from target_match
     or result_value->>'ok' is distinct from 'true' then
    raise exception using errcode='55000',message='SCORE_RECOVERY_RECEIPT_INVALID';
  end if;
  return jsonb_build_object('ok',true,'contract','score-mutation-recovery-v1',
    'status','COMMITTED','match_id',target_match,'mutation_key',target_mutation,
    'result',result_value);
end;
$recovery$;
revoke all on function production_control.read_score_mutation_status_v1(jsonb,text)
  from public,anon,authenticated,service_role;

create function public.read_production_score_mutation_status_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $read$
begin
  perform production_control.assert_production_cutover_read_scope(input,'CURRENT_READS');
  return production_control.read_score_mutation_status_v1(input,'2026');
end;
$read$;
revoke all on function public.read_production_score_mutation_status_v1(jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.read_production_score_mutation_status_v1(jsonb) to service_role;

create function public.future_production_read_score_mutation_status_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $read$
declare target_tournament text;
begin
  target_tournament:=production_control.assert_future_production_scoring_runtime_v1(input);
  return production_control.read_score_mutation_status_v1(input,target_tournament);
end;
$read$;
-- Annual targets remain private. Only the reviewed dispatcher is API-executable.
revoke all on function public.future_production_read_score_mutation_status_v1(jsonb)
  from public,anon,authenticated,service_role;
insert into production_control.annual_scoring_rpc_allowlist_v1
  (operation_name,target_rpc,required_phase,operation_class,required_worker)
values ('read_production_score_mutation_status_v1',
  'public.future_production_read_score_mutation_status_v1','CURRENT_READS','READ',null);

-- Existing annual manifest enumerates the enabled dispatcher targets, therefore
-- it already captures the new private annual wrapper and changed annual scorer.
-- Extend it to bind the shared helper, 2026 scorer/read RPC, and origin column.
alter function production_control.annual_side_game_implementation_manifest_v1()
  rename to annual_side_game_implementation_manifest_pre_score_recovery_v1;
create function production_control.annual_side_game_implementation_manifest_v1()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $manifest$
declare baseline jsonb; helpers jsonb; column_manifest jsonb; valid_count integer;
begin
  baseline:=production_control.annual_side_game_implementation_manifest_pre_score_recovery_v1();
  select jsonb_agg(jsonb_build_object('signature',signature,'source',p.prosrc,
      'securityDefiner',p.prosecdef,'configuration',p.proconfig,'acl',p.proacl) order by signature),
    count(*) filter(where p.prosecdef and p.proconfig=array['search_path=pg_catalog']::text[]
      and not has_function_privilege('anon',p.oid,'EXECUTE')
      and not has_function_privilege('authenticated',p.oid,'EXECUTE')
      and has_function_privilege('service_role',p.oid,'EXECUTE')=exposed)::integer
    into helpers,valid_count
  from (values
    ('production_control.read_score_mutation_status_v1(jsonb,text)',false),
    ('public.read_production_score_mutation_status_v1(jsonb)',true),
    ('production_control.annual_side_game_implementation_manifest_pre_score_recovery_v1()',false)
  ) required(signature,exposed) left join pg_proc p on p.oid=to_regprocedure(signature);
  if valid_count<>3 then
    raise exception using errcode='55000',message='SCORE_RECOVERY_HELPER_SECURITY_REQUIRED';
  end if;
  select jsonb_build_object('name',attname,'type',format_type(atttypid,atttypmod),
    'notNull',attnotnull) into column_manifest from pg_attribute
    where attrelid='scoring_authority.score_mutations'::regclass
      and attname='originating_auth_user_id' and not attisdropped and atttypid='uuid'::regtype;
  if column_manifest is null then
    raise exception using errcode='55000',message='SCORE_RECOVERY_ORIGIN_COLUMN_REQUIRED';
  end if;
  return baseline||jsonb_build_object('scoreRecoveryContract','score-mutation-recovery-v1',
    'scoreRecoveryHelpers',helpers,'scoreRecoveryOriginColumn',column_manifest,
    'scoreRecoveryCanonical2026Source',(select prosrc from pg_proc
      where oid='public.submit_production_hole_score(jsonb)'::regprocedure));
end;
$manifest$;
revoke all on function production_control.annual_side_game_implementation_manifest_v1()
  from public,anon,authenticated,service_role;
revoke all on function production_control.annual_side_game_implementation_manifest_pre_score_recovery_v1()
  from public,anon,authenticated,service_role;
comment on column scoring_authority.score_mutations.originating_auth_user_id is
  'Validated Auth origin captured atomically for new canonical HOLE_SCORE receipts; NULL legacy provenance is intentionally unresolved.';
commit;
