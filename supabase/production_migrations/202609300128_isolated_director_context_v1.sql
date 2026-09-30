-- Additive isolated authority admission. Inert: no binding or entitlement is installed.
-- Existing Production resource/admission predicates are not changed.
begin;
create table production_control.isolated_director_context_v1 (
  scope_key text primary key check(scope_key='ISOLATED_DIRECTOR_V1'),
  binding_id uuid not null unique,
  database_name text not null,
  project_ref text not null,
  project_url text not null,
  schema_contract text not null default 'canonical-through-127' check(schema_contract='canonical-through-127'),
  enabled boolean not null default false,
  tournament_id text not null references scoring_authority.tournaments(tournament_id) check(tournament_id='2026'),
  governance_tournament_id text not null check(governance_tournament_id='2026'),
  binding_revision bigint not null default 1 check(binding_revision>0),
  activation_revision bigint not null check(activation_revision>0),
  admission_revision bigint not null check(admission_revision>0),
  authority_epoch_id uuid not null,
  release_commit text not null check(release_commit~'^[0-9a-f]{40}$'),
  authority text not null default 'SUPABASE' check(authority='SUPABASE'),
  identity_authority text not null default 'SUPABASE' check(identity_authority='SUPABASE'),
  read_phase text not null default 'OBSERVATION' check(read_phase='OBSERVATION'),
  admission_state text not null default 'CLOSED' check(admission_state in('OPEN','CLOSED')),
  maintenance_state text not null default 'NORMAL' check(maintenance_state='NORMAL'),
  created_at timestamptz not null default clock_timestamp(),
  check((project_ref='LOCAL_ISOLATED' and project_url ~ '^https?://(localhost|127[.]0[.]0[.]1|\[::1\])(:[0-9]{1,5})?/?$')
    or (project_ref='idgigvjjqkfbqjeredpb' and project_url='https://idgigvjjqkfbqjeredpb.supabase.co'))
);
alter table production_control.isolated_director_context_v1 enable row level security;
revoke all on production_control.isolated_director_context_v1 from public,anon,authenticated,service_role;
comment on table production_control.isolated_director_context_v1 is
  'Owner-provisioned non-Production canonical schema binding; no runtime role can enable or rewrite it. No row is installed by migration.';

create function production_control.assert_isolated_director_operation_context_v1(input jsonb, mutation boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
declare binding production_control.isolated_director_context_v1%rowtype;
  gate scoring_authority.ingress_gates%rowtype; current_target text; token text; actor text; actor_auth uuid; request_id uuid;
begin
  perform production_control.assert_production_service_role();
  -- Annual transitions take this existing fence exclusively before locking
  -- the pointer/gate. Match that order before any isolated context row lock.
  perform pg_advisory_xact_lock_shared(production_control.scoring_admission_lock_key());
  if input->>'contract_version' is distinct from 'isolated-director-operations-v1'
    or jsonb_typeof(input->'resource') is distinct from 'object'
    or input#>>'{authorization,tournament_id}' is distinct from '2026'
    or input#>>'{authorization,role}' is distinct from 'DIRECTOR' then
    raise exception using errcode='42501',message='ISOLATED_DIRECTOR_CONTEXT_REQUIRED';
  end if;
  select * into strict binding from production_control.isolated_director_context_v1
    where scope_key='ISOLATED_DIRECTOR_V1' for share;
  if not binding.enabled or binding.database_name is distinct from current_database()
    or input#>>'{resource,binding_id}' is distinct from binding.binding_id::text
    or input#>>'{resource,project_ref}' is distinct from binding.project_ref
    or input#>>'{resource,project_url}' is distinct from binding.project_url
    or binding.admission_state<>'OPEN' then
    raise exception using errcode='42501',message='ISOLATED_DIRECTOR_CONTEXT_REQUIRED';
  end if;
  -- Never admit this profile to a canonical database without the established
  -- current golf/identity authority and safe ingress state.
  select tournament_id into strict current_target from production_control.current_tournament_pointer_v1
    where scope_key='BAGGER_INV_PRODUCTION' for share;
  select * into strict gate from scoring_authority.ingress_gates
    where tournament_id=binding.tournament_id for share;
  if gate.authority<>'SUPABASE' or gate.state<>'OPEN'
    or gate.active_epoch_id is distinct from binding.authority_epoch_id
    or gate.unresolved_client_queues<>0
    or current_target is distinct from '2026'
    or not exists(select 1 from scoring_authority.tournaments where tournament_id=binding.tournament_id
      and tournament_year=2026 and scoring_authority='SUPABASE') then
    raise exception using errcode='55000',message='ISOLATED_DIRECTOR_RUNTIME_NOT_SAFE';
  end if;
  -- This existing verifier checks confirmed Auth/link/verified identifier,
  -- ACTIVE membership/role and the canonical Director entitlement. It has no
  -- hosted-resource assertion and is not replaced or weakened here.
  perform production_control.assert_production_scoring_actor(input,true);
  actor:=input#>>'{authorization,player_id}';
  actor_auth:=(input#>>'{authorization,auth_user_id}')::uuid;
  token:=production_control.tournament_setup_hash_v1(to_jsonb(binding)-'created_at');
  if (mutation or input ? 'expected_context_token')
    and input->>'expected_context_token' is distinct from token then
    raise exception using errcode='40001',message='ISOLATED_DIRECTOR_CONTEXT_STALE';
  end if;
  if mutation or input->>'mode'='status' then
    request_id:=(input->>'operation_request_id')::uuid;
    if request_id is null then raise exception using errcode='22023',message='ISOLATED_DIRECTOR_OPERATION_ID_REQUIRED'; end if;
  end if;
  return jsonb_build_object('binding_id',binding.binding_id,'context_token',token,
    'tournament_id',binding.tournament_id,'governance_tournament_id',binding.governance_tournament_id,
    'activation_revision',binding.activation_revision,'admission_revision',binding.admission_revision,
    'authority_epoch_id',binding.authority_epoch_id,'release_commit',binding.release_commit,
    'resource_fingerprint',production_control.tournament_setup_hash_v1(jsonb_build_object(
      'environment','ISOLATED','binding_id',binding.binding_id,'project_ref',binding.project_ref,
      'project_url',binding.project_url,'database_name',binding.database_name,'tournament_id',binding.tournament_id,
      'activation_revision',binding.activation_revision,'admission_revision',binding.admission_revision,
      'authority_epoch_id',binding.authority_epoch_id,'release_commit',binding.release_commit)),
    'actor_auth_user_id',actor_auth,'actor_player_id',actor,
    'authorization',input->'authorization','operation_request_id',request_id);
exception when no_data_found then
  raise exception using errcode='42501',message='ISOLATED_DIRECTOR_CONTEXT_REQUIRED';
when invalid_text_representation or numeric_value_out_of_range then
  raise exception using errcode='22023',message='ISOLATED_DIRECTOR_INPUT_INVALID';
end;
$fn$;

create function production_control.isolated_director_context_projection_v1(context jsonb)
returns jsonb language sql immutable set search_path=pg_catalog as $fn$
 select jsonb_build_object('contract','isolated-director-operations-v1',
   'bindingId',context->>'binding_id','contextToken',context->>'context_token',
   'tournamentId',context->>'tournament_id','governanceTournamentId',context->>'governance_tournament_id',
   'activationRevision',(context->>'activation_revision')::bigint,
   'admissionRevision',(context->>'admission_revision')::bigint,
   'authorityEpochId',context->>'authority_epoch_id','releaseCommit',context->>'release_commit')
$fn$;

create function production_control.isolated_director_dispatch_v1(input jsonb, context jsonb, mutation boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
begin
  if input->>'family' in('TOURNAMENT_SETUP','ROUND_PAIRINGS','MATCH_CONTROL') then
    return production_control.isolated_director_setup_operation_v1(input,context,mutation);
  elsif input->>'family' in('NET_SKINS_ENTRIES','CALCUTTA_MANAGEMENT') then
    return production_control.isolated_director_financial_operation_v1(input,context,mutation);
  end if;
  raise exception using errcode='22023',message='ISOLATED_DIRECTOR_OPERATION_INVALID';
end;
$fn$;

create function public.read_isolated_director_operation_context_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
declare context jsonb; result jsonb;
begin
 if input ? 'mode' and input->>'mode' is distinct from 'status' then
   raise exception using errcode='22023',message='ISOLATED_DIRECTOR_OPERATION_INVALID';
 end if;
 if input->>'mode'='status' then
   if input->>'expected_context_token' !~ '^[0-9a-f]{64}$'
      or input->>'expected_context_token' is null
      or jsonb_typeof(input->'payload') is distinct from 'object' then
     raise exception using errcode='22023',message='ISOLATED_DIRECTOR_INPUT_INVALID';
   end if;
   -- The historical token participates only in the exact stored request hash.
   -- Admission is freshly checked against current owner-installed authority.
   -- An absent receipt is UNKNOWN; this read never claims rollback or executes.
   context:=production_control.assert_isolated_director_operation_context_v1(input-'expected_context_token',false);
 else
   context:=production_control.assert_isolated_director_operation_context_v1(input,false);
 end if;
 result:=jsonb_build_object('ok',true,'context',production_control.isolated_director_context_projection_v1(context));
 if input ? 'family' then result:=result||jsonb_build_object('data',production_control.isolated_director_dispatch_v1(input,context,false)); end if;
 return result;
end;
$fn$;

create function public.execute_isolated_director_operation_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
declare context jsonb; receipt jsonb;
begin
 context:=production_control.assert_isolated_director_operation_context_v1(input,true);
 if jsonb_typeof(input->'payload') is distinct from 'object' then
   raise exception using errcode='22023',message='ISOLATED_DIRECTOR_OPERATION_INVALID';
 end if;
 receipt:=production_control.isolated_director_dispatch_v1(input,context,true);
 return jsonb_build_object('ok',coalesce((receipt->>'ok')::boolean,false),
   'context',production_control.isolated_director_context_projection_v1(context),
   'family',input->>'family','action',input->>'action',
   'operationRequestId',context->>'operation_request_id','receipt',receipt);
end;
$fn$;
revoke all on function production_control.assert_isolated_director_operation_context_v1(jsonb,boolean),
 production_control.isolated_director_context_projection_v1(jsonb),
 production_control.isolated_director_dispatch_v1(jsonb,jsonb,boolean),
 public.read_isolated_director_operation_context_v1(jsonb),public.execute_isolated_director_operation_v1(jsonb)
 from public,anon,authenticated,service_role;
grant execute on function public.read_isolated_director_operation_context_v1(jsonb),
 public.execute_isolated_director_operation_v1(jsonb) to service_role;
-- Fail closed if the migration owner/default ACL differs from the reviewed
-- owner-only private context and service-only public entry points.
do $context_acl$
declare name text; owner_value oid; function_value regprocedure; public_entry boolean;
begin
 select oid into strict owner_value from pg_roles where rolname=current_user;
 foreach name in array array[
  'production_control.assert_isolated_director_operation_context_v1(jsonb,boolean)',
  'production_control.isolated_director_context_projection_v1(jsonb)',
  'production_control.isolated_director_dispatch_v1(jsonb,jsonb,boolean)',
  'public.read_isolated_director_operation_context_v1(jsonb)',
  'public.execute_isolated_director_operation_v1(jsonb)'] loop
  function_value:=name::regprocedure;public_entry:=name like 'public.%';
  if not exists(select 1 from pg_proc p where p.oid=function_value and p.proowner=owner_value
     and p.proconfig=array['search_path=pg_catalog']
     and not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a
       where (a.grantee<>owner_value and not(public_entry and a.grantee=(select oid from pg_roles where rolname='service_role')))
         or a.grantor<>owner_value or a.is_grantable)) then
   raise exception 'ISOLATED_DIRECTOR_CONTEXT_ACL_MISMATCH: %',name;
  end if;
 end loop;
 if not exists(select 1 from pg_class c where c.oid='production_control.isolated_director_context_v1'::regclass
   and c.relowner=owner_value and c.relrowsecurity
   and not exists(select 1 from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a
     where a.grantee<>owner_value or a.grantor<>owner_value)) then
  raise exception 'ISOLATED_DIRECTOR_CONTEXT_TABLE_ACL_MISMATCH';
 end if;
end;
$context_acl$;
commit;
