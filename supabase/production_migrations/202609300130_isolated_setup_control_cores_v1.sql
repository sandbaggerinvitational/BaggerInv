-- P0-F canonical capability closure. Inert installation; no hosted registration.
-- Existing Production admission remains at the original public entry points.
-- One private domain implementation is shared by separately admitted profiles.
begin;

do $baseline$
declare expected record; actual text;
begin
 if to_regprocedure('public.read_isolated_director_operation_context_v1(jsonb)') is null then
  raise exception 'ISOLATED_DIRECTOR_CONTEXT_INSTALL_REQUIRED'; end if;
 for expected in select * from(values
  ('public.mutate_production_match_control(jsonb)','4b33ecdfea83e640caca982d1a4bf1058268a7f2230c20eda16e37deecff9534'),
  ('production_control.read_tournament_setup_before_round_workspace_v1(jsonb)','2b5cd38458adac1c45dcbfd0c3406a07091e4c4ec2196511e701095159906657'),
  ('production_control.mutate_setup_before_late_r3_v1(jsonb)','9cacadd1dafdb8e7e2949e37ee01e646525b2922d68597a05e362f2b1f3672ec'),
  ('production_control.mutate_round_pairings_before_late_r3_v1(jsonb)','1f0bb4ba15893ce72f058d1fa90413f93699f9d2ce81d16b6afff57edd4e57a6'),
  ('public.read_production_tournament_setup_v1(jsonb)','6b42946f0af5c0c5fe832d053f7d2ee223dd6758f4866985e968b2dba440c1d6'),
  ('production_control.mutate_late_r3_dispatch_v1(jsonb,boolean)','42bca560decc8c4b6322b544874241d8ca7eec06dcb8b63561b1e8f6839ebde2'),
  ('public.mutate_production_round_pairings_v1(jsonb)','24f847cdea143f0e259adbc7700a23d8219b001d7c1f70cb54a4021094e1a1c5'),
  ('public.mutate_production_tournament_setup_v1(jsonb)','9425dcc387d10b9d8f3c79d6b72afcc3f4cfe148044fd3cb1f8346f7cc20b63d')
 ) baseline(signature,sha256) loop
  select encode(extensions.digest(prosrc,'sha256'),'hex') into actual
   from pg_proc where oid=expected.signature::regprocedure;
  if actual is distinct from expected.sha256 then
   raise exception 'ISOLATED_SETUP_SOURCE_BASELINE_MISMATCH: %',expected.signature; end if;
  -- Body hashes do not cover privileges or callable attributes. A retained
  -- custom grant could bypass the new wrapper after admission is extracted.
  if exists(select 1 from pg_proc p join pg_language l on l.oid=p.prolang
    where p.oid=expected.signature::regprocedure and (
      pg_get_userbyid(p.proowner)<>current_user or not p.prosecdef
      or l.lanname<>case when expected.signature in(
       'public.mutate_production_tournament_setup_v1(jsonb)',
       'public.mutate_production_round_pairings_v1(jsonb)') then 'sql' else 'plpgsql' end
      or p.provolatile<>case when expected.signature in(
       'public.read_production_tournament_setup_v1(jsonb)',
       'production_control.read_tournament_setup_before_round_workspace_v1(jsonb)') then 's' else 'v' end
      or p.proconfig is distinct from array[case when expected.signature in(
       'public.mutate_production_tournament_setup_v1(jsonb)',
       'public.mutate_production_round_pairings_v1(jsonb)',
       'production_control.mutate_late_r3_dispatch_v1(jsonb,boolean)') then 'search_path=pg_catalog'
       else 'search_path=pg_catalog, production_control, scoring_authority' end]
      or exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        where a.grantee<>p.proowner and not(expected.signature like 'public.%'
          and a.grantee='service_role'::regrole and a.privilege_type='EXECUTE' and not a.is_grantable))
      or has_function_privilege('service_role',p.oid,'EXECUTE') is distinct from (expected.signature like 'public.%')
    )) then raise exception 'ISOLATED_SETUP_PRIVILEGE_BASELINE_MISMATCH: %',expected.signature; end if;
 end loop;
 -- An OID-bound caller could otherwise keep reaching a relocated admission-free
 -- core. This baseline has no inbound catalog dependencies on these functions.
 -- Fail closed if another installation has added any; review that caller first.
 if exists(select 1 from pg_depend d where d.refclassid='pg_proc'::regclass
   and d.refobjid in(select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname,p.proname) in(
      ('public','mutate_production_match_control'),
      ('public','read_production_tournament_setup_v1'),
      ('production_control','read_tournament_setup_before_round_workspace_v1'),
      ('production_control','mutate_setup_before_late_r3_v1'),
      ('production_control','mutate_round_pairings_before_late_r3_v1'),
      ('production_control','mutate_late_r3_dispatch_v1')))) then
  raise exception 'ISOLATED_SETUP_UNREVIEWED_OID_DEPENDENCY';
 end if;
 -- CREATE of replacement wrappers must not silently change definer identity.
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in('mutate_production_match_control',
      'read_production_tournament_setup_v1','mutate_production_tournament_setup_v1',
      'mutate_production_round_pairings_v1') and pg_get_userbyid(p.proowner)<>current_user) then
  raise exception 'ISOLATED_SETUP_MIGRATION_OWNER_MISMATCH';
 end if;
end;
$baseline$;

create function pg_temp.move_setup_admission_v1(signature text, occurrences integer)
returns void language plpgsql set search_path=pg_catalog as $$
declare definition text; needle constant text := 'perform production_control.assert_tournament_setup_runtime_v1(input);';
begin
 select pg_get_functiondef(signature::regprocedure) into definition;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle) <> occurrences then
  raise exception 'ISOLATED_SETUP_ADMISSION_ANCHOR_MISMATCH: %',signature;
 end if;
 execute replace(definition,needle,'-- Admission is enforced by the public Production or isolated gateway before this private core.');
end;
$$;
select pg_temp.move_setup_admission_v1('production_control.read_tournament_setup_before_round_workspace_v1(jsonb)',1);
select pg_temp.move_setup_admission_v1('production_control.mutate_setup_before_late_r3_v1(jsonb)',1);
select pg_temp.move_setup_admission_v1('production_control.mutate_round_pairings_before_late_r3_v1(jsonb)',1);
select pg_temp.move_setup_admission_v1('production_control.mutate_late_r3_dispatch_v1(jsonb,boolean)',2);

alter function public.read_production_tournament_setup_v1(jsonb) set schema production_control;
alter function production_control.read_production_tournament_setup_v1(jsonb) rename to canonical_tournament_setup_read_v1;
create function public.read_production_tournament_setup_v1(input jsonb)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
begin
 perform production_control.assert_tournament_setup_runtime_v1(input);
 return production_control.canonical_tournament_setup_read_v1(input);
end;
$$;
create or replace function public.mutate_production_tournament_setup_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform production_control.assert_tournament_setup_runtime_v1(input);
 return production_control.mutate_late_r3_dispatch_v1(input,false);
end;
$$;
create or replace function public.mutate_production_round_pairings_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare failure_code text;
begin
 begin
  perform production_control.assert_tournament_setup_runtime_v1(input);
 exception when others then
  get stacked diagnostics failure_code=message_text;
  if failure_code !~ '^TOURNAMENT_SETUP_[A-Z0-9_]+$' then failure_code:='TOURNAMENT_SETUP_ROUND_OPERATION_FAILED'; end if;
  return jsonb_build_object('ok',false,'code',failure_code,'matchId',null,'playerId',null);
 end;
 return production_control.mutate_late_r3_dispatch_v1(input,true);
end;
$$;

-- Keep the public control OID: nested round-control callers continue to reach
-- its admitted wrapper. Only the private core accepts an isolated envelope.
do $control$
declare definition text;
 initial_gate constant text := E'  perform production_control.assert_production_scoring_runtime(input);\n  perform production_control.assert_production_scoring_actor(input, true);';
 locked_gate constant text := E'    perform production_control.assert_production_scoring_runtime(input);\n    perform production_control.assert_production_scoring_actor(input, true);';
 isolated_gate constant text := $gate$    if isolated_input is null then
      perform production_control.assert_production_scoring_runtime(input);
      perform production_control.assert_production_scoring_actor(input, true);
    else
      rechecked_context:=production_control.assert_isolated_director_operation_context_v1(isolated_input,true);
      if isolated_input->>'family' is distinct from 'MATCH_CONTROL'
        or isolated_input#>>'{payload,match_id}' is distinct from target_match
        or rechecked_context->>'actor_player_id' is distinct from input#>>'{authorization,player_id}'
        or rechecked_context->>'actor_auth_user_id' is distinct from input#>>'{authorization,auth_user_id}'
        or rechecked_context->>'operation_request_id' is distinct from mutation_identity
        or rechecked_context->>'tournament_id' is distinct from input->>'tournament_id' then
        raise exception using errcode='42501',message='ISOLATED_DIRECTOR_CONTEXT_REQUIRED';
      end if;
    end if;$gate$;
begin
 select pg_get_functiondef('public.mutate_production_match_control(jsonb)'::regprocedure) into definition;
 if (length(definition)-length(replace(definition,initial_gate,'')))/length(initial_gate)<>1
   or (length(definition)-length(replace(definition,locked_gate,'')))/length(locked_gate)<>1 then
  raise exception 'ISOLATED_CONTROL_ADMISSION_ANCHOR_MISMATCH'; end if;
 definition:=replace(definition,'FUNCTION public.mutate_production_match_control(input jsonb)',
  'FUNCTION production_control.canonical_match_control_v1(input jsonb, isolated_input jsonb)');
 definition:=replace(definition,E'AS $function$\ndeclare',E'AS $function$\ndeclare\n  rechecked_context jsonb;');
 definition:=replace(definition,initial_gate,'  -- Initial admission is enforced by the Production or isolated entry point.');
 definition:=replace(definition,locked_gate,isolated_gate);
 execute definition;
end;
$control$;
create or replace function public.mutate_production_match_control(input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform production_control.assert_production_scoring_runtime(input);
 perform production_control.assert_production_scoring_actor(input,true);
 return production_control.canonical_match_control_v1(input,null);
end;
$$;

-- The gateway owns the validated context. Neither browser nor service-role
-- callers can invoke this dispatcher directly or select another tournament.
create function production_control.isolated_director_setup_operation_v1(input jsonb, context jsonb, mutation boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
 family text:=input->>'family'; action text:=input->>'action';
 payload jsonb:=coalesce(input->'payload','{}'::jsonb);
 command jsonb; operation text; match_id_value text; current_read jsonb; control_matches jsonb;
 setup_receipt production_control.tournament_setup_operation_receipts_v1%rowtype;
 control_receipt scoring_authority.score_mutations%rowtype; expected_hash text;
begin
 if context->>'tournament_id' is distinct from '2026'
  or context->>'governance_tournament_id' is distinct from '2026'
  or context->>'actor_player_id' is null or context->>'actor_auth_user_id' is null
  or family not in('TOURNAMENT_SETUP','ROUND_PAIRINGS','MATCH_CONTROL')
  or jsonb_typeof(payload) is distinct from 'object' then
  raise exception using errcode='42501',message='ISOLATED_DIRECTOR_CONTEXT_REQUIRED';
 end if;
 command:=(payload-array['environment','project_ref','project_url','source_workbook_id','tournament_id',
  'authorization','actor_player_id','actor_auth_user_id','request_payload_hash','operation_request_id','mutation_key']) ||
  jsonb_build_object('contract_version','production-tournament-setup-v1','environment','ISOLATED',
   'tournament_id',context->>'tournament_id','actor_player_id',context->>'actor_player_id',
   'actor_auth_user_id',context->>'actor_auth_user_id','operation_request_id',context->>'operation_request_id',
   'authorization',jsonb_build_object('tournament_id',context->>'tournament_id',
    'player_id',context->>'actor_player_id','auth_user_id',context->>'actor_auth_user_id','role','DIRECTOR'));
 if not mutation and input->>'mode' is distinct from 'status' then
  current_read:=production_control.canonical_tournament_setup_read_v1(command ||
   jsonb_build_object('operation','READ_PRODUCTION_TOURNAMENT_SETUP_V1'));
  if family='MATCH_CONTROL' then
   select coalesce(jsonb_agg(item.value || jsonb_build_object(
    'matchRevision',m.match_revision,'permissionRevision',m.permission_revision,
    'scorecardComplete',m.scorecard_complete,'unresolvedMutations',m.unresolved_mutations,
    'resultWinner',m.result_winner,'scoringLocked',m.scoring_locked,
    'scoringReady',coalesce((item.value->>'scoring_ready')::boolean,false),
    'permissionComplete',(select count(*) from scoring_authority.scoring_permissions p where p.match_id=m.match_id)=
      (select count(*) from scoring_authority.match_participants p where p.match_id=m.match_id)
      and exists(select 1 from scoring_authority.match_participants p where p.match_id=m.match_id),
    'accessState',case when not exists(select 1 from scoring_authority.scoring_permissions p where p.match_id=m.match_id and p.can_score and p.revoked_at is null) then 'REVOKED'
      when not exists(select 1 from scoring_authority.scoring_permissions p where p.match_id=m.match_id and (not p.can_score or p.revoked_at is not null or p.permission_revision<>m.permission_revision)) then 'ACTIVE' else 'MIXED' end)
    order by m.round_number,m.match_id),'[]') into control_matches
   from jsonb_array_elements(current_read#>'{data,matches}') item(value)
   join scoring_authority.matches m on m.match_id=item.value->>'matchId' and m.tournament_id=context->>'tournament_id';
   current_read:=jsonb_set(current_read,'{data,matches}',control_matches);
  end if;
  return current_read;
 end if;
 if family='MATCH_CONTROL' then
  operation:=case action when 'mark-live' then 'MARK_LIVE' when 'scoring-lock' then 'SCORING_LOCK'
   when 'scoring-unlock' then 'SCORING_UNLOCK' when 'access-activate' then 'ACCESS_ACTIVATE'
   when 'access-revoke' then 'ACCESS_REVOKE' end;
  match_id_value:=payload->>'match_id';
  if operation is null or coalesce(match_id_value,'')='' or
   coalesce(payload->>'expected_match_revision','')!~'^[0-9]+$' or
   coalesce(payload->>'expected_permission_revision','')!~'^[0-9]+$' then
   raise exception using errcode='22023',message='ISOLATED_DIRECTOR_CONTROL_INPUT_INVALID'; end if;
  command:=command || jsonb_build_object('operation',operation,'mutation_key',context->>'operation_request_id',
   'authorization',(command->'authorization') || jsonb_build_object('match_id',match_id_value,
    'permission_revision',(payload->>'expected_permission_revision')::bigint));
  if input->>'mode'='status' then
   expected_hash:=production_control.cutover_payload_hash(jsonb_build_object(
    'match_id',match_id_value,'operation',operation,'actor_id',context->>'actor_player_id'));
   select * into control_receipt from scoring_authority.score_mutations
    where match_id=match_id_value and mutation_key=context->>'operation_request_id';
   if not found then return jsonb_build_object('ok',true,'outcome','UNKNOWN','receipt',null,
    'code','ISOLATED_DIRECTOR_RECEIPT_NOT_FOUND'); end if;
   if control_receipt.payload_hash is distinct from expected_hash then
    raise exception 'IDEMPOTENCY_CONFLICT'; end if;
   return jsonb_build_object('ok',true,'outcome','COMMITTED','receipt',control_receipt.result);
  end if;
  return production_control.canonical_match_control_v1(command,input);
 end if;
 operation:=case action when 'update-tournament' then 'UPDATE_TOURNAMENT' when 'update-team' then 'UPDATE_TEAM'
  when 'assign-roster-team' then 'ASSIGN_ROSTER_TEAM' when 'update-round' then 'UPDATE_ROUND'
  when 'upsert-course' then 'UPSERT_COURSE' when 'upsert-match' then 'UPSERT_MATCH'
  when 'replace-pairings' then 'REPLACE_PAIRINGS' when 'prepare-scoring-context' then 'PREPARE_SCORING_CONTEXT'
  when 'replace-round-pairings' then 'REPLACE_ROUND_PAIRINGS' end;
 if operation is null or (family='ROUND_PAIRINGS') is distinct from (operation='REPLACE_ROUND_PAIRINGS')
  or (payload ? 'operation' and payload->>'operation' is distinct from operation) then
  raise exception using errcode='22023',message='ISOLATED_DIRECTOR_SETUP_ACTION_INVALID'; end if;
 command:=command||jsonb_build_object('operation',operation);
 expected_hash:=production_control.tournament_setup_hash_v1(command);
 command:=command||jsonb_build_object('request_payload_hash',expected_hash);
 if input->>'mode'='status' then
  select r.* into setup_receipt from production_control.tournament_setup_operation_receipts_v1 r
   where r.tournament_id=context->>'tournament_id' and r.action=operation
    and r.operation_request_id=(context->>'operation_request_id')::uuid;
  if not found then return jsonb_build_object('ok',true,'outcome','UNKNOWN','receipt',null,
   'code','ISOLATED_DIRECTOR_RECEIPT_NOT_FOUND'); end if;
  if setup_receipt.declared_request_payload_hash is distinct from expected_hash
   or setup_receipt.database_request_payload_hash is distinct from expected_hash then
   raise exception 'TOURNAMENT_SETUP_IDEMPOTENCY_CONFLICT'; end if;
  return jsonb_build_object('ok',true,'outcome','COMMITTED','receipt',setup_receipt.response);
 end if;
 return production_control.mutate_late_r3_dispatch_v1(command,family='ROUND_PAIRINGS');
end;
$$;

revoke all on function production_control.read_tournament_setup_before_round_workspace_v1(jsonb),
 production_control.mutate_setup_before_late_r3_v1(jsonb),
 production_control.mutate_round_pairings_before_late_r3_v1(jsonb),
 production_control.mutate_late_r3_dispatch_v1(jsonb,boolean),
 production_control.canonical_tournament_setup_read_v1(jsonb),
 production_control.canonical_match_control_v1(jsonb,jsonb),
 production_control.isolated_director_setup_operation_v1(jsonb,jsonb,boolean)
 from public,anon,authenticated,service_role;
revoke all on function public.read_production_tournament_setup_v1(jsonb),
 public.mutate_production_tournament_setup_v1(jsonb),public.mutate_production_round_pairings_v1(jsonb),
 public.mutate_production_match_control(jsonb) from public,anon,authenticated;
grant execute on function public.read_production_tournament_setup_v1(jsonb),
 public.mutate_production_tournament_setup_v1(jsonb),public.mutate_production_round_pairings_v1(jsonb),
 public.mutate_production_match_control(jsonb) to service_role;
-- New functions can inherit environment-specific ALTER DEFAULT PRIVILEGES.
-- Reject any unexpected caller, owner or execution attribute before commit.
do $privileges$
declare fn record;
begin
 for fn in select p.*,n.nspname,l.lanname from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
  where (n.nspname,p.proname) in(
   ('production_control','read_tournament_setup_before_round_workspace_v1'),
   ('production_control','mutate_setup_before_late_r3_v1'),
   ('production_control','mutate_round_pairings_before_late_r3_v1'),
   ('production_control','mutate_late_r3_dispatch_v1'),
   ('production_control','canonical_tournament_setup_read_v1'),
   ('production_control','canonical_match_control_v1'),
   ('production_control','isolated_director_setup_operation_v1'),
   ('public','read_production_tournament_setup_v1'),
   ('public','mutate_production_tournament_setup_v1'),
   ('public','mutate_production_round_pairings_v1'),
   ('public','mutate_production_match_control')) loop
  if pg_get_userbyid(fn.proowner)<>current_user or not fn.prosecdef or fn.lanname<>'plpgsql'
   or fn.provolatile<>(case when fn.proname in('read_production_tournament_setup_v1',
     'read_tournament_setup_before_round_workspace_v1','canonical_tournament_setup_read_v1') then 's' else 'v' end)
   or fn.proconfig is distinct from array[case when fn.nspname='public'
     or fn.proname in('mutate_late_r3_dispatch_v1','isolated_director_setup_operation_v1')
     then 'search_path=pg_catalog' else 'search_path=pg_catalog, production_control, scoring_authority' end]
   or exists(select 1 from aclexplode(coalesce(fn.proacl,acldefault('f',fn.proowner))) a
    where a.grantee<>fn.proowner and not(fn.nspname='public' and a.grantee='service_role'::regrole
     and a.privilege_type='EXECUTE' and not a.is_grantable))
   or has_function_privilege('service_role',fn.oid,'EXECUTE') is distinct from (fn.nspname='public') then
   raise exception 'ISOLATED_SETUP_POST_INSTALL_PRIVILEGE_MISMATCH: %',fn.proname;
  end if;
 end loop;
end;
$privileges$;
commit;
