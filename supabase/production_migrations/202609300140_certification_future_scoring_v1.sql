-- CLI scaffold20260930195643 mapped to repository forward ordinal140.
-- Local synthetic Certification candidate only; no hosted changes.
begin;
-- Current future-year scoring uses the same canonical algorithms with resource-specific admission.
-- Production public identities and their original admission behavior remain intact.

create temporary table canonical_future_scoring_original_attributes on commit drop as
select oid,pronamespace,proname,proargtypes,proowner,proacl,prosecdef,proconfig,provolatile from pg_proc where oid in('future_production_submit_hole_score_v1(jsonb)'::regprocedure,'future_production_finalize_match_v1(jsonb)'::regprocedure,'future_production_reopen_match_v1(jsonb)'::regprocedure,'future_production_read_scoring_authority_v1(jsonb)'::regprocedure,'future_production_read_scoring_participant_context_v1(jsonb)'::regprocedure,'future_production_mutate_match_control_v1(jsonb)'::regprocedure,'read_production_future_participant_context_for_auth_v1(uuid,text)'::regprocedure,'read_production_future_participant_player_context_v1(text,text)'::regprocedure,'read_production_future_director_entitlement_v1(uuid,text)'::regprocedure);

do $check$ begin if encode(extensions.digest((select prosrc from pg_proc where oid='future_production_submit_hole_score_v1(jsonb)'::regprocedure),'sha256'),'hex')<>'57eba51f1e5f4ac864b8a3772f2b6ff38e2586f9be08c13460a1c916ce272ad0' then raise exception 'CANONICAL_FUTURE_SCORING_PREDECESSOR_MISMATCH: future_production_submit_hole_score_v1';end if;end;$check$;

do $check$ begin if encode(extensions.digest((select prosrc from pg_proc where oid='future_production_finalize_match_v1(jsonb)'::regprocedure),'sha256'),'hex')<>'1a01f3424057bd7aa46ca7a9df7f9f24729208afa18f992d3d1b9560fe5f4c4e' then raise exception 'CANONICAL_FUTURE_SCORING_PREDECESSOR_MISMATCH: future_production_finalize_match_v1';end if;end;$check$;

do $check$ begin if encode(extensions.digest((select prosrc from pg_proc where oid='future_production_reopen_match_v1(jsonb)'::regprocedure),'sha256'),'hex')<>'6693eb351a4d7c133091cf2c2fa1e6ef22d66eb49a54f5017ee553b796f00234' then raise exception 'CANONICAL_FUTURE_SCORING_PREDECESSOR_MISMATCH: future_production_reopen_match_v1';end if;end;$check$;

do $check$ begin if encode(extensions.digest((select prosrc from pg_proc where oid='future_production_read_scoring_authority_v1(jsonb)'::regprocedure),'sha256'),'hex')<>'6c38b3079ae4bf98f4403d47e242822def0128dad9f1fb97b74398aebb6eb615' then raise exception 'CANONICAL_FUTURE_SCORING_PREDECESSOR_MISMATCH: future_production_read_scoring_authority_v1';end if;end;$check$;

do $check$ begin if encode(extensions.digest((select prosrc from pg_proc where oid='future_production_read_scoring_participant_context_v1(jsonb)'::regprocedure),'sha256'),'hex')<>'b178b77e54d510d917bd8634a22b9546a6e2825f49ec0fcfb8e1d45e4aca769a' then raise exception 'CANONICAL_FUTURE_SCORING_PREDECESSOR_MISMATCH: future_production_read_scoring_participant_context_v1';end if;end;$check$;

do $check$ begin if encode(extensions.digest((select prosrc from pg_proc where oid='future_production_mutate_match_control_v1(jsonb)'::regprocedure),'sha256'),'hex')<>'e3f9f6f50856bf60378c1d8bd7e850ad84ada51de241d5e44be5a8096b33d9d5' then raise exception 'CANONICAL_FUTURE_SCORING_PREDECESSOR_MISMATCH: future_production_mutate_match_control_v1';end if;end;$check$;

do $check$ begin if encode(extensions.digest((select prosrc from pg_proc where oid='read_production_future_participant_context_for_auth_v1(uuid,text)'::regprocedure),'sha256'),'hex')<>'7cab9e9e91eba3a19d91b37d875d7be7d4c4492b8d93155faddd3defb0d302fb' then raise exception 'CANONICAL_FUTURE_SCORING_PREDECESSOR_MISMATCH: read_production_future_participant_context_for_auth_v1';end if;end;$check$;

do $check$ begin if encode(extensions.digest((select prosrc from pg_proc where oid='read_production_future_participant_player_context_v1(text,text)'::regprocedure),'sha256'),'hex')<>'0db3685a15aff344d71c5346244cb3aa0b7af3ff00d77ef6c9852c1ee83609b9' then raise exception 'CANONICAL_FUTURE_SCORING_PREDECESSOR_MISMATCH: read_production_future_participant_player_context_v1';end if;end;$check$;

do $check$ begin if encode(extensions.digest((select prosrc from pg_proc where oid='read_production_future_director_entitlement_v1(uuid,text)'::regprocedure),'sha256'),'hex')<>'f9eb5cf219b0c0fb5021ab80a81f66ff1ade59331a9f12ffd233f95d9304974e' then raise exception 'CANONICAL_FUTURE_SCORING_PREDECESSOR_MISMATCH: read_production_future_director_entitlement_v1';end if;end;$check$;

do $check$ begin if encode(extensions.digest((select prosrc from pg_proc where oid='production_control.assert_future_participant_identity_runtime_v1()'::regprocedure),'sha256'),'hex')<>'03c7bd8f4c93bb84263aaab8ab2f369878e402193bcaa9357df89a7636486a60' then raise exception 'CANONICAL_FUTURE_SCORING_PREDECESSOR_MISMATCH: assert_future_participant_identity_runtime_v1';end if;end;$check$;

do $check$ begin if encode(extensions.digest((select prosrc from pg_proc where oid='production_control.assert_future_production_scoring_actor_v1(jsonb,text,boolean)'::regprocedure),'sha256'),'hex')<>'948aa2ccf3de9acf7039ba10ee5cc89075a1bb9930d4a64cd6cf6263a1223a66' then raise exception 'CANONICAL_FUTURE_SCORING_PREDECESSOR_MISMATCH: assert_future_production_scoring_actor_v1';end if;end;$check$;

do $check$ begin if encode(extensions.digest((select prosrc from pg_proc where oid='production_control.assert_annual_scoring_runtime_pre_side_games_v1(jsonb,text,text)'::regprocedure),'sha256'),'hex')<>'f53ca8df756cf306b7eec0b0246ccc0737bd720ad5dd3b84df9192d22e7be216' then raise exception 'CANONICAL_FUTURE_SCORING_PREDECESSOR_MISMATCH: assert_annual_scoring_runtime_pre_side_games_v1';end if;end;$check$;

create function production_control.assert_current_certification_future_context_v1(resource_context jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $guard$
declare c jsonb; r production_control.canonical_resource_v1%rowtype;
 p production_control.current_tournament_pointer_v1%rowtype;
begin
 c:=production_control.current_certification_context_v1();
 select * into strict r from production_control.canonical_resource_v1 where singleton;
 select * into strict p from production_control.current_tournament_pointer_v1 where scope_key=r.resource_id;
 if resource_context is distinct from c or r.resource_class is distinct from 'CERTIFICATION'
  or r.database_name is distinct from current_database() or c->>'resource_id' is distinct from r.resource_id
  or c->>'current_tournament_id' is distinct from p.tournament_id
  or c->>'tournament_id' is distinct from p.tournament_id or p.tournament_year<=2026
  or (c->>'pointer_revision')::bigint is distinct from p.pointer_revision then
  raise exception using errcode='42501',message='CERTIFICATION_FUTURE_CONTEXT_REQUIRED';end if;
 return c;
end;$guard$;
revoke all on function production_control.assert_current_certification_future_context_v1(jsonb) from public,anon,authenticated,service_role;

create function production_control.assert_canonical_future_identity_runtime_v1(resource_context jsonb) returns text
language plpgsql security definer set search_path=pg_catalog as $core$

declare
  pointer production_control.current_tournament_pointer_v1%rowtype;
  catalog production_control.future_tournament_catalog_v1%rowtype;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  context participant_identity.future_tournament_identity_contexts_v1%rowtype;
  roster_count_value integer;
  binding_count_value integer;
  enrolled_count_value integer;
begin
  if resource_context is null then return production_control.assert_future_participant_identity_runtime_v1();end if;
  perform production_control.assert_current_certification_future_context_v1(resource_context);
  perform production_control.assert_production_service_role();
  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = resource_context->>'resource_id';
  select value.* into strict catalog
  from production_control.future_tournament_catalog_v1 value
  where value.tournament_id = pointer.tournament_id;
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.tournament_id = pointer.tournament_id
    and value.generation_status = 'ACTIVE';
  select value.* into strict context
  from participant_identity.future_tournament_identity_contexts_v1 value
  where value.tournament_id = pointer.tournament_id
    and value.status = 'CERTIFIED';
  select pg_catalog.count(*)::integer into roster_count_value
  from scoring_authority.tournament_players membership
  where membership.tournament_id = pointer.tournament_id
    and membership.participation_status = 'ACTIVE';
  select pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (
      where binding.enrollment_state = 'ENROLLED'
    )::integer
  into binding_count_value, enrolled_count_value
  from participant_identity.future_tournament_participant_bindings_v1 binding
  where binding.tournament_id = pointer.tournament_id;
  if pointer.tournament_year <= 2026
     or catalog.lifecycle <> 'ACTIVE'
     or catalog.lifecycle_revision <> pointer.lifecycle_revision
     or generation.pointer_revision <> pointer.pointer_revision
     or generation.authority <> 'SUPABASE'
     or generation.ingress_state <> 'OPEN'
     or context.runtime_generation_id <> generation.runtime_generation_id
     or context.authority_generation_id
       <> generation.authority_generation_id
     or context.admission_generation_id
       <> generation.admission_generation_id
     or context.pointer_revision <> generation.pointer_revision
     or context.roster_count <> roster_count_value
     or binding_count_value <> roster_count_value
     or context.enrolled_count <> enrolled_count_value
     or context.not_enrolled_count <>
       roster_count_value - enrolled_count_value
     or context.binding_fingerprint is distinct from
       production_control
         .future_participant_identity_binding_fingerprint_v1(
           pointer.tournament_id
         )
     or exists (
       select 1
       from participant_identity.future_tournament_participant_bindings_v1
         binding
       left join production_control
         .future_participant_identity_eligibility_v1(
           pointer.tournament_id
         ) eligibility
         on eligibility.player_id = binding.player_id
       where binding.tournament_id = pointer.tournament_id
         and (eligibility.player_id is null
           or (binding.enrollment_state = 'ENROLLED'
             and not eligibility.runtime_eligible)
           or (binding.contact_state = 'APPROVED'
             and not eligibility.contact_approved))
     )
     or not exists (
       select 1
       from production_control.future_global_owner_eligibility_v1()
     ) then
    raise exception using errcode = '55000',
      message = 'FUTURE_PARTICIPANT_IDENTITY_RUNTIME_REQUIRED';
  end if;
  return pointer.tournament_id;
end;

$core$;
revoke all on function production_control.assert_canonical_future_identity_runtime_v1(jsonb) from public,anon,authenticated,service_role;

create function production_control.assert_canonical_future_scoring_actor_v1(input jsonb, target_tournament text, require_director boolean, resource_context jsonb) returns void
language plpgsql security definer set search_path=pg_catalog as $core$

declare
  actor text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', ''
  )));
  actor_role text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,role}', 'PLAYER'
  )));
  actor_auth_user uuid;
  current_identity_target text;
begin
  begin
    actor_auth_user := nullif(
      input#>>'{authorization,auth_user_id}', ''
    )::uuid;
  exception when others then
    actor_auth_user := null;
  end;
  current_identity_target := production_control
    .assert_canonical_future_identity_runtime_v1(resource_context);
  if target_tournament <> current_identity_target
     or input#>>'{authorization,tournament_id}'
       is distinct from target_tournament
     or actor = '' or actor_auth_user is null
     or actor_role not in ('PLAYER', 'DIRECTOR')
     or (require_director and actor_role <> 'DIRECTOR')
     or not exists (
       select 1
       from production_control.future_participant_identity_eligibility_v1(
         target_tournament
       ) eligibility
       where eligibility.player_id = actor
         and eligibility.auth_user_id = actor_auth_user
         and eligibility.runtime_eligible
     )
     or (actor_role = 'DIRECTOR' and (
       not exists (
         select 1
         from participant_identity.tournament_roles role_value
         where role_value.tournament_id = target_tournament
           and role_value.auth_user_id = actor_auth_user
           and role_value.role = 'DIRECTOR'
           and role_value.role_active
           and role_value.revoked_at is null
       )
       or not exists (
         select 1
         from production_control.director_entitlements entitlement
         where entitlement.tournament_id = target_tournament
           and entitlement.auth_user_id = actor_auth_user
           and entitlement.player_id = actor
           and entitlement.role in ('DIRECTOR', 'OWNER')
           and entitlement.status = 'ACTIVE'
           and entitlement.revoked_at is null
       )
     )) then
    raise exception using errcode = '42501', message = case
      when require_director or actor_role = 'DIRECTOR'
        then 'PRODUCTION_DIRECTOR_AUTHORIZATION_REQUIRED'
      else 'PRODUCTION_SCORING_AUTHORIZATION_REQUIRED'
    end;
  end if;
end;

$core$;
revoke all on function production_control.assert_canonical_future_scoring_actor_v1(jsonb,text,boolean,jsonb) from public,anon,authenticated,service_role;

create function production_control.assert_canonical_future_scoring_runtime_v1(input jsonb, resource_context jsonb) returns text
language plpgsql security definer set search_path=pg_catalog as $core$

declare
  pointer production_control.current_tournament_pointer_v1%rowtype;
  catalog production_control.future_tournament_catalog_v1%rowtype;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  annual production_control.annual_scoring_runtime_authorities_v1%rowtype;
  operation production_control.annual_scoring_rpc_allowlist_v1%rowtype;
  active_generation_count integer;
  readiness jsonb;
  certified_writer jsonb;
  origin production_control.certification_initialization_origins_v1%rowtype;
  live jsonb;
begin
  if resource_context is null then return production_control.assert_future_production_scoring_runtime_v1(input);end if;
  live:=production_control.assert_current_certification_future_context_v1(resource_context);
  select * into strict origin from production_control.certification_initialization_origins_v1
   where resource_id=live->>'resource_id';
  -- The shared transaction lock is held through the invoked scoring RPC.
  -- Annual close/transition/abort take the exclusive counterpart of this
  -- exact legacy key, so an admitted mutation cannot cross the boundary.
  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  select value.* into operation
  from production_control.annual_scoring_rpc_allowlist_v1 value
  where value.operation_name = input->>'annual_scoring_operation' and value.enabled;
  if operation.operation_name is null
     or input->>'annual_scoring_dispatch_contract'
       is distinct from 'production-annual-scoring-dispatch-v1'
     or input->>'annual_scoring_operation'
       is distinct from operation.operation_name
     or operation.required_worker is not null then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_ANNUAL_SCORING_OPERATION_NOT_ALLOWLISTED';
  end if;
  if input->>'annual_scoring_operation' not in ('submit_production_hole_score','finalize_production_match',
     'reopen_production_match','read_production_scoring_authority','read_production_scoring_participant_context','mutate_production_match_control')
   or live->>'phase' is distinct from (case input->>'annual_scoring_operation'
    when 'submit_production_hole_score' then 'SCORING' when 'finalize_production_match' then 'SCORING'
    when 'reopen_production_match' then 'DIRECTOR' when 'mutate_production_match_control' then 'DIRECTOR' else 'READS' end) then
   raise exception using errcode='42501',message='CERTIFICATION_FUTURE_OPERATION_NOT_ADMITTED';end if;
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = live->>'resource_id';
  if pointer.tournament_id = '2026' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_SCORING_TARGET_REQUIRED';
  end if;
  select value.* into strict catalog
  from production_control.future_tournament_catalog_v1 value
  where value.tournament_id = pointer.tournament_id;
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.tournament_id = pointer.tournament_id
    and value.generation_status = 'ACTIVE';
  select value.* into strict annual
  from production_control.annual_scoring_runtime_authorities_v1 value
  where value.tournament_id = pointer.tournament_id
    and value.runtime_generation_id = generation.runtime_generation_id;
-- Google runtime retired; canonical authority checks remain below.
  select pg_catalog.count(*)::integer into active_generation_count
  from production_control.future_annual_runtime_generations_v1 value
  where value.generation_status = 'ACTIVE';
  if input->>'expected_current_tournament_id'
       is distinct from pointer.tournament_id
     or coalesce((input->>'expected_pointer_revision')::bigint, -1)
       <> pointer.pointer_revision
     or input->>'expected_runtime_generation_id'
       is distinct from generation.runtime_generation_id::text
     or input->>'expected_annual_authority_generation_id'
       is distinct from generation.authority_generation_id::text
     or input->>'expected_annual_admission_generation_id'
       is distinct from generation.admission_generation_id::text
     or generation.authority_generation_id
       is distinct from annual.authority_generation_id
     or generation.admission_generation_id
       is distinct from annual.admission_generation_id
     or generation.pointer_revision <> pointer.pointer_revision
     or annual.pointer_revision <> pointer.pointer_revision
     or active_generation_count <> 1
     or catalog.lifecycle <> 'ACTIVE'
     or catalog.lifecycle_revision <> pointer.lifecycle_revision
     or annual.lifecycle_revision <> pointer.lifecycle_revision
     or annual.platform_tournament_id <> '2026'
     or annual.resource_class is distinct from 'CERTIFICATION'
     or annual.certification_resource_id is distinct from origin.resource_id
     or annual.platform_authority_generation_id is distinct from origin.authority_epoch_id
     or annual.platform_admission_generation_id is distinct from origin.admission_generation_id
     or generation.authority_generation_id::text is distinct from live->>'authority_epoch_id'
     or not exists(select 1 from production_control.certification_ingress_generations_v1 ingress_generation
       where ingress_generation.resource_id=origin.resource_id
        and ingress_generation.generation_id=generation.admission_generation_id
        and ingress_generation.tournament_id=pointer.tournament_id
        and ingress_generation.pointer_revision=pointer.pointer_revision
        and ingress_generation.authority_epoch_id=generation.authority_generation_id
        and (operation.operation_class='READ' and ingress_generation.state in('OPEN','CLOSING','CLOSED')
          or operation.operation_class='MUTATION' and ingress_generation.state='OPEN'
          or operation.operation_class='WORKER' and ingress_generation.state in('OPEN','CLOSING')))
     or annual.authority_status not in ('ACTIVE', 'CLOSED')
     or (operation.operation_class = 'MUTATION' and (
       annual.authority_status <> 'ACTIVE'
       or annual.admission_state <> 'OPEN'
     ))
     or (operation.operation_class = 'WORKER' and (
       annual.authority_status <> 'ACTIVE'
       or annual.admission_state not in ('OPEN', 'CLOSING')
     ))
     or not exists (
       select 1 from scoring_authority.tournaments tournament_value
       where tournament_value.tournament_id = pointer.tournament_id
         and tournament_value.scoring_authority = 'SUPABASE'
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_SCORING_RUNTIME_REQUIRED';
  end if;
  if operation.operation_name = 'mutate_production_match_control'
     and pg_catalog.upper(coalesce(input->>'operation', '')) = 'MARK_LIVE'
  then
    readiness :=
      production_control.assert_future_production_match_scoring_ready_v1(
        input->>'match_id', pointer.tournament_id
      );
    if coalesce((readiness->>'ready')::boolean, false) is not true then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_ANNUAL_MARK_LIVE_READINESS_REQUIRED';
    end if;
  end if;
  perform production_control.ensure_annual_side_game_runtime_v1(pointer.tournament_id,
   generation.runtime_generation_id,generation.authority_generation_id,generation.admission_generation_id,false);
  return pointer.tournament_id;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_SCORING_RUNTIME_REQUIRED';
end;

$core$;
revoke all on function production_control.assert_canonical_future_scoring_runtime_v1(jsonb,jsonb) from public,anon,authenticated,service_role;

create function production_control.canonical_future_submit_hole_score_v1_resource(input jsonb, resource_context jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $core$

declare
  target_tournament text;
  match_row scoring_authority.matches%rowtype;
  hole_row scoring_authority.hole_scores%rowtype;
  mutation_row scoring_authority.score_mutations%rowtype;
  permission_row scoring_authority.scoring_permissions%rowtype;
  target_match text := input->>'match_id';
  target_hole integer := nullif(input->>'hole_number', '')::integer;
  mutation_identity text := input->>'mutation_key';
  actor text := input#>>'{authorization,player_id}';
  actor_role text := pg_catalog.upper(coalesce(input#>>'{authorization,role}', 'PLAYER'));
  team_1_gross jsonb := input->'team_1_gross_scores';
  team_2_gross jsonb := input->'team_2_gross_scores';
  expected_match bigint := coalesce(nullif(input->>'expected_match_revision', '')::bigint, -1);
  expected_hole bigint := coalesce(nullif(input->>'expected_hole_revision', '')::bigint, -1);
  expected_count integer;
  current_hole_revision bigint := 0;
  hole_exists boolean := false;
  next_hole_revision bigint;
  next_match_revision bigint;
  stroke_index_value integer;
  team_1_strokes jsonb;
  team_2_strokes jsonb;
  team_1_net integer;
  team_2_net integer;
  winner text;
  progress jsonb;
  before_state jsonb;
  payload_hash_value text;
  result_value jsonb;
  transition_at timestamptz := pg_catalog.clock_timestamp();
begin
  target_tournament := production_control.assert_canonical_future_scoring_runtime_v1(input,resource_context);
  perform production_control.assert_canonical_future_scoring_actor_v1(input,target_tournament,false,resource_context);
  if coalesce(target_match, '') = '' or coalesce(mutation_identity, '') = '' then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST');
  end if;
  select * into match_row from scoring_authority.matches
  where match_id = target_match and tournament_id = target_tournament for update;
  if not found then return pg_catalog.jsonb_build_object('ok', false, 'code', 'MATCH_NOT_FOUND'); end if;
  if input#>>'{authorization,match_id}' <> target_match then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED');
  end if;
  if actor_role = 'PLAYER' then
    select * into permission_row from scoring_authority.scoring_permissions
    where match_id = target_match and player_id = actor;
    if not found or not permission_row.can_score or permission_row.revoked_at is not null then
      return pg_catalog.jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED');
    end if;
    if coalesce((input#>>'{authorization,permission_revision}')::bigint, -1) <> permission_row.permission_revision
       or permission_row.permission_revision <> match_row.permission_revision then
      return pg_catalog.jsonb_build_object('ok', false, 'code', 'PERMISSION_STALE',
        'current_permission_revision', match_row.permission_revision);
    end if;
  elsif actor_role = 'DIRECTOR' then
    if coalesce((input#>>'{authorization,permission_revision}')::bigint, -1) <> match_row.permission_revision then
      return pg_catalog.jsonb_build_object('ok', false, 'code', 'PERMISSION_STALE',
        'current_permission_revision', match_row.permission_revision);
    end if;
  else return pg_catalog.jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED');
  end if;
  payload_hash_value := production_control.cutover_payload_hash(pg_catalog.jsonb_build_object(
    'match_id', target_match, 'hole_number', target_hole,
    'team_1_gross_scores', team_1_gross, 'team_2_gross_scores', team_2_gross,
    'actor_id', actor));
  select * into mutation_row from scoring_authority.score_mutations
  where match_id = target_match and mutation_key = mutation_identity;
  if found then
    if mutation_row.payload_hash = payload_hash_value then
      return mutation_row.result || pg_catalog.jsonb_build_object('idempotent', true);
    end if;
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT');
  end if;
  if match_row.scoring_locked then return pg_catalog.jsonb_build_object('ok', false, 'code', 'SCORING_LOCKED'); end if;
  if match_row.status = 'FINAL' then return pg_catalog.jsonb_build_object('ok', false, 'code', 'MATCH_FINAL'); end if;
  if target_hole not between 1 and 18 then return pg_catalog.jsonb_build_object('ok', false, 'code', 'INVALID_HOLE'); end if;
  if expected_match <> match_row.match_revision then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'MATCH_REVISION_CONFLICT',
      'current_match_revision', match_row.match_revision);
  end if;
  select * into hole_row from scoring_authority.hole_scores
  where match_id = target_match and hole_number = target_hole;
  hole_exists := found;
  if hole_exists then current_hole_revision := hole_row.hole_revision; end if;
  if expected_hole <> current_hole_revision then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'HOLE_REVISION_CONFLICT',
      'current_hole_revision', current_hole_revision);
  end if;
  expected_count := case when match_row.format = 'BB' then 2 else 1 end;
  if not scoring_authority.valid_gross_scores(team_1_gross, expected_count)
     or not scoring_authority.valid_gross_scores(team_2_gross, expected_count) then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'INVALID_GROSS_SCORES');
  end if;
  if hole_exists and hole_row.team_1_gross_scores = team_1_gross
     and hole_row.team_2_gross_scores = team_2_gross then
    progress := scoring_authority.match_progress(target_match, match_row.format);
    return pg_catalog.jsonb_build_object('ok', true, 'code', 'NO_CHANGE',
      'semantic_noop', true, 'idempotent', true, 'match_id', target_match,
      'hole_number', target_hole, 'hole_revision', hole_row.hole_revision,
      'match_revision', match_row.match_revision, 'updated_at', hole_row.updated_at,
      'match', progress, 'audit_created', false, 'google_outbox_created', false);
  end if;
  select stroke_index into stroke_index_value from scoring_authority.match_holes
  where match_id = target_match and hole_number = target_hole;
  if stroke_index_value is null then return pg_catalog.jsonb_build_object('ok', false, 'code', 'INVALID_SCORING_SNAPSHOT'); end if;
  if match_row.format = 'SC' then
    select pg_catalog.jsonb_build_array(scoring_authority.strokes_on_hole((snapshot.team_configuration->>'team_1_strokes')::integer, stroke_index_value)),
      pg_catalog.jsonb_build_array(scoring_authority.strokes_on_hole((snapshot.team_configuration->>'team_2_strokes')::integer, stroke_index_value))
    into team_1_strokes, team_2_strokes from scoring_authority.scoring_snapshots snapshot
    where snapshot.snapshot_id = match_row.scoring_snapshot_id and snapshot.tournament_id = target_tournament;
  else
    select pg_catalog.jsonb_agg(scoring_authority.strokes_on_hole(participant.final_strokes, stroke_index_value) order by participant.player_slot)
    into team_1_strokes from scoring_authority.match_participants participant
    where match_id = target_match and team_side = 1;
    select pg_catalog.jsonb_agg(scoring_authority.strokes_on_hole(participant.final_strokes, stroke_index_value) order by participant.player_slot)
    into team_2_strokes from scoring_authority.match_participants participant
    where match_id = target_match and team_side = 2;
  end if;
  if match_row.format = 'BB' then
    select pg_catalog.min(gross::integer - stroke::integer) into team_1_net
    from pg_catalog.jsonb_array_elements_text(team_1_gross) with ordinality g(gross, n)
    join pg_catalog.jsonb_array_elements_text(team_1_strokes) with ordinality s(stroke, n2) on n = n2;
    select pg_catalog.min(gross::integer - stroke::integer) into team_2_net
    from pg_catalog.jsonb_array_elements_text(team_2_gross) with ordinality g(gross, n)
    join pg_catalog.jsonb_array_elements_text(team_2_strokes) with ordinality s(stroke, n2) on n = n2;
  else
    team_1_net := (team_1_gross->>0)::integer - (team_1_strokes->>0)::integer;
    team_2_net := (team_2_gross->>0)::integer - (team_2_strokes->>0)::integer;
  end if;
  winner := case when team_1_net = team_2_net then 'Halved'
    when team_1_net < team_2_net then 'Team 1' else 'Team 2' end;
  before_state := case when current_hole_revision = 0 then '{}'::jsonb else pg_catalog.to_jsonb(hole_row) end;
  next_hole_revision := current_hole_revision + 1;
  next_match_revision := match_row.match_revision + 1;
  insert into scoring_authority.hole_scores (
    match_id, hole_number, hole_revision, team_1_gross_scores, team_2_gross_scores,
    team_1_strokes, team_2_strokes, team_1_net_score, team_2_net_score,
    hole_winner, mutation_key, actor_id
  ) values (
    target_match, target_hole, next_hole_revision, team_1_gross, team_2_gross,
    team_1_strokes, team_2_strokes, team_1_net, team_2_net, winner, mutation_identity, actor
  ) on conflict (match_id, hole_number) do update set
    hole_revision = excluded.hole_revision,
    team_1_gross_scores = excluded.team_1_gross_scores,
    team_2_gross_scores = excluded.team_2_gross_scores,
    team_1_strokes = excluded.team_1_strokes,
    team_2_strokes = excluded.team_2_strokes,
    team_1_net_score = excluded.team_1_net_score,
    team_2_net_score = excluded.team_2_net_score,
    hole_winner = excluded.hole_winner, mutation_key = excluded.mutation_key,
    actor_id = excluded.actor_id, updated_at = transition_at;
  progress := scoring_authority.match_progress(target_match, match_row.format);
  update scoring_authority.matches set
    match_revision = next_match_revision,
    scored_holes = (progress->>'scored_holes')::integer,
    current_hole = (progress->>'current_hole')::integer,
    holes_remaining = (progress->>'holes_remaining')::integer,
    team_1_holes_won = (progress->>'team_1_holes_won')::integer,
    team_2_holes_won = (progress->>'team_2_holes_won')::integer,
    running_result = progress->>'running_result', result_winner = progress->>'result_winner',
    clinched = (progress->>'clinched')::boolean,
    scorecard_complete = (progress->>'scorecard_complete')::boolean,
    authority_updated_at = transition_at, updated_at = transition_at
  where match_id = target_match and tournament_id = target_tournament;
  result_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'ACCEPTED', 'match_id', target_match,
    'google_target_match_id', target_match, 'hole_number', target_hole,
    'hole_revision', next_hole_revision, 'match_revision', next_match_revision,
    'permission_revision', match_row.permission_revision, 'updated_at', transition_at,
    'gross', pg_catalog.jsonb_build_object('team_1', team_1_gross, 'team_2', team_2_gross),
    'strokes', pg_catalog.jsonb_build_object('team_1', team_1_strokes, 'team_2', team_2_strokes),
    'net', pg_catalog.jsonb_build_object('team_1', team_1_net, 'team_2', team_2_net),
    'hole_winner', winner, 'match', progress,
    'audit_created', true, 'google_outbox_created', false);
  insert into scoring_authority.score_mutations (
    match_id, mutation_key, mutation_type, hole_number, payload_hash,
    previous_match_revision, next_match_revision, previous_hole_revision,
    next_hole_revision, result, actor_id, originating_auth_user_id
  ) values (target_match, mutation_identity, 'HOLE_SCORE', target_hole, payload_hash_value,
    match_row.match_revision, next_match_revision, current_hole_revision,
    next_hole_revision, result_value, actor, (input#>>'{authorization,auth_user_id}')::uuid);
  insert into scoring_authority.score_revision_history (
    match_id, hole_number, mutation_key, action, previous_match_revision,
    next_match_revision, previous_hole_revision, next_hole_revision,
    before_state, after_state, actor_id
  ) values (target_match, target_hole, mutation_identity, 'HOLE_SCORE_UPSERTED',
    match_row.match_revision, next_match_revision, current_hole_revision,
    next_hole_revision, before_state, result_value, actor);
  insert into scoring_authority.audit_events
    (tournament_id, match_id, mutation_key, action, actor_id, metadata)
  values (target_tournament, target_match, mutation_identity, 'HOLE_SCORE_UPSERTED', actor, result_value);
  -- Google runtime retired: external delivery is not canonical authority.
  return result_value;
end;

$core$;
revoke all on function production_control.canonical_future_submit_hole_score_v1_resource(jsonb,jsonb) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.future_production_submit_hole_score_v1(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
 return production_control.canonical_future_submit_hole_score_v1_resource(input,null);
end;
$function$
;

create function production_control.canonical_future_finalize_match_v1_resource(input jsonb, resource_context jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $core$

declare
  target_tournament text;
  match_row scoring_authority.matches%rowtype;
  next_match_row scoring_authority.matches%rowtype;
  mutation_row scoring_authority.score_mutations%rowtype;
  target_match text := input->>'match_id';
  mutation_identity text := input->>'mutation_key';
  actor text := input#>>'{authorization,player_id}';
  actor_role text := pg_catalog.upper(coalesce(input#>>'{authorization,role}', 'PLAYER'));
  expected_match bigint := coalesce((input->>'expected_match_revision')::bigint, -1);
  supplied_permission bigint := coalesce((input#>>'{authorization,permission_revision}')::bigint, -1);
  next_revision bigint;
  next_permission_revision bigint;
  payload_hash_value text;
  result_value jsonb;
  before_permissions jsonb;
  after_permissions jsonb;
  progress jsonb;
  archive_result jsonb;
  transition_at timestamptz := pg_catalog.clock_timestamp();
begin
  target_tournament := production_control.assert_canonical_future_scoring_runtime_v1(input,resource_context);
  perform production_control.assert_canonical_future_scoring_actor_v1(input,target_tournament,false,resource_context);
  select * into match_row from scoring_authority.matches
  where match_id = target_match and tournament_id = target_tournament for update;
  if not found then return pg_catalog.jsonb_build_object('ok', false, 'code', 'MATCH_NOT_FOUND'); end if;
  if input#>>'{authorization,match_id}' <> target_match or actor_role not in ('PLAYER', 'DIRECTOR') then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED');
  end if;
  payload_hash_value := production_control.cutover_payload_hash(pg_catalog.jsonb_build_object(
    'match_id', target_match, 'action', 'FINALIZE', 'actor_id', actor));
  select * into mutation_row from scoring_authority.score_mutations
  where match_id = target_match and mutation_key = mutation_identity;
  if found then
    if mutation_row.payload_hash = payload_hash_value then
      return mutation_row.result || pg_catalog.jsonb_build_object('idempotent', true);
    end if;
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT');
  end if;
  if supplied_permission <> match_row.permission_revision then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'PERMISSION_STALE',
      'current_permission_revision', match_row.permission_revision);
  end if;
  if actor_role = 'PLAYER' and not exists (
    select 1 from scoring_authority.scoring_permissions
    where match_id = target_match and player_id = actor and can_score
      and revoked_at is null and permission_revision = match_row.permission_revision
  ) then return pg_catalog.jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED'); end if;
  if match_row.status = 'FINAL' then return pg_catalog.jsonb_build_object('ok', false, 'code', 'MATCH_FINAL'); end if;
  if match_row.scoring_locked then return pg_catalog.jsonb_build_object('ok', false, 'code', 'SCORING_LOCKED'); end if;
  if expected_match <> match_row.match_revision then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'MATCH_REVISION_CONFLICT',
      'current_match_revision', match_row.match_revision);
  end if;
  if match_row.scored_holes <> 18 or not match_row.scorecard_complete then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'SCORECARD_INCOMPLETE',
      'scored_holes', match_row.scored_holes);
  end if;
  if match_row.unresolved_mutations > 0 then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'UNRESOLVED_MUTATIONS');
  end if;
  progress := scoring_authority.match_progress(target_match, match_row.format);
  if pg_catalog.btrim(coalesce(progress->>'result_winner', '')) = ''
     or progress->>'result_winner' <> match_row.result_winner
     or coalesce((progress->>'scorecard_complete')::boolean, false) is not true
     or progress->>'team_1_points' is null or progress->>'team_2_points' is null then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'RESULT_UNAVAILABLE');
  end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(permission)
    order by player_id), '[]'::jsonb) into before_permissions
  from scoring_authority.scoring_permissions permission where match_id = target_match;
  next_revision := match_row.match_revision + 1;
  next_permission_revision := match_row.permission_revision + 1;
  update scoring_authority.matches set status = 'FINAL', scoring_locked = true,
    match_revision = next_revision, permission_revision = next_permission_revision,
    finalized_at = transition_at, authority_updated_at = transition_at,
    updated_at = transition_at
  where match_id = target_match and tournament_id = target_tournament returning * into next_match_row;
  update scoring_authority.scoring_permissions set can_score = false,
    permission_revision = next_permission_revision, revoked_at = transition_at,
    updated_at = transition_at where match_id = target_match;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(permission)
    order by player_id), '[]'::jsonb) into after_permissions
  from scoring_authority.scoring_permissions permission where match_id = target_match;
  archive_result := scoring_authority.capture_finalized_scorecard_snapshot(target_match, actor);
  result_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'FINALIZED', 'match_id', target_match,
    'google_target_match_id', target_match, 'match_revision', next_revision,
    'permission_revision', next_permission_revision,
    'previous_permission_revision', match_row.permission_revision,
    'scoring_locked', true, 'access_active', false,
    'result_winner', match_row.result_winner, 'scorecard_complete', true,
    'scored_holes', 18, 'updated_at', transition_at, 'match', progress,
    'team_1_points', (progress->>'team_1_points')::numeric,
    'team_2_points', (progress->>'team_2_points')::numeric,
    'scorecard_archive', archive_result,
    'permission_transition', pg_catalog.jsonb_build_object(
      'before', before_permissions, 'after', after_permissions),
    'audit_created', true, 'google_outbox_created', false);
  insert into scoring_authority.score_mutations
    (match_id, mutation_key, mutation_type, payload_hash,
      previous_match_revision, next_match_revision, result, actor_id)
  values (target_match, mutation_identity, 'FINALIZE', payload_hash_value,
    match_row.match_revision, next_revision, result_value, actor);
  insert into scoring_authority.score_revision_history
    (match_id, mutation_key, action, previous_match_revision,
      next_match_revision, before_state, after_state, actor_id)
  values (target_match, mutation_identity, 'MATCH_FINALIZED', match_row.match_revision,
    next_revision,
    pg_catalog.jsonb_build_object('match', pg_catalog.to_jsonb(match_row), 'permissions', before_permissions),
    pg_catalog.jsonb_build_object('match', pg_catalog.to_jsonb(next_match_row), 'permissions', after_permissions), actor);
  insert into scoring_authority.audit_events
    (tournament_id, match_id, mutation_key, action, actor_id, metadata)
  values (target_tournament, target_match, mutation_identity, 'MATCH_FINALIZED', actor, result_value);
  -- Google runtime retired: external delivery is not canonical authority.
  return result_value;
end;

$core$;
revoke all on function production_control.canonical_future_finalize_match_v1_resource(jsonb,jsonb) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.future_production_finalize_match_v1(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
 return production_control.canonical_future_finalize_match_v1_resource(input,null);
end;
$function$
;

create function production_control.canonical_future_reopen_match_v1_resource(input jsonb, resource_context jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $core$

declare
  target_tournament text;
  match_row scoring_authority.matches%rowtype;
  next_match_row scoring_authority.matches%rowtype;
  mutation_row scoring_authority.score_mutations%rowtype;
  target_match text := input->>'match_id';
  mutation_identity text := input->>'mutation_key';
  actor text := input#>>'{authorization,player_id}';
  expected_match bigint := coalesce((input->>'expected_match_revision')::bigint, -1);
  supplied_permission bigint := coalesce((input#>>'{authorization,permission_revision}')::bigint, -1);
  next_revision bigint;
  next_permission_revision bigint;
  payload_hash_value text;
  result_value jsonb;
  before_permissions jsonb;
  after_permissions jsonb;
  archive_result jsonb;
  transition_at timestamptz := pg_catalog.clock_timestamp();
begin
  target_tournament := production_control.assert_canonical_future_scoring_runtime_v1(input,resource_context);
  perform production_control.assert_canonical_future_scoring_actor_v1(input,target_tournament,true,resource_context);
  select * into match_row from scoring_authority.matches
  where match_id = target_match and tournament_id = target_tournament for update;
  if not found then return pg_catalog.jsonb_build_object('ok', false, 'code', 'MATCH_NOT_FOUND'); end if;
  if input#>>'{authorization,match_id}' <> target_match then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'DIRECTOR_REQUIRED');
  end if;
  payload_hash_value := production_control.cutover_payload_hash(pg_catalog.jsonb_build_object(
    'match_id', target_match, 'action', 'REOPEN', 'actor_id', actor));
  select * into mutation_row from scoring_authority.score_mutations
  where match_id = target_match and mutation_key = mutation_identity;
  if found then
    if mutation_row.payload_hash = payload_hash_value then
      return mutation_row.result || pg_catalog.jsonb_build_object('idempotent', true);
    end if;
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT');
  end if;
  if supplied_permission <> match_row.permission_revision then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'PERMISSION_STALE',
      'current_permission_revision', match_row.permission_revision);
  end if;
  if match_row.status <> 'FINAL' then return pg_catalog.jsonb_build_object('ok', false, 'code', 'MATCH_NOT_FINAL'); end if;
  if expected_match <> match_row.match_revision then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'MATCH_REVISION_CONFLICT',
      'current_match_revision', match_row.match_revision);
  end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(permission)
    order by player_id), '[]'::jsonb) into before_permissions
  from scoring_authority.scoring_permissions permission where match_id = target_match;
  next_revision := match_row.match_revision + 1;
  next_permission_revision := match_row.permission_revision + 1;
  update scoring_authority.matches set status = 'LIVE', scoring_locked = false,
    match_revision = next_revision, permission_revision = next_permission_revision,
    finalized_at = null, authority_updated_at = transition_at, updated_at = transition_at
  where match_id = target_match and tournament_id = target_tournament returning * into next_match_row;
  update scoring_authority.scoring_permissions set can_score = true,
    permission_revision = next_permission_revision, revoked_at = null,
    updated_at = transition_at where match_id = target_match;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(permission)
    order by player_id), '[]'::jsonb) into after_permissions
  from scoring_authority.scoring_permissions permission where match_id = target_match;
  archive_result := scoring_authority.invalidate_finalized_scorecard_snapshot(target_match, next_revision, actor);
  result_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'REOPENED', 'match_id', target_match,
    'google_target_match_id', target_match, 'match_revision', next_revision,
    'permission_revision', next_permission_revision,
    'previous_permission_revision', match_row.permission_revision,
    'scoring_locked', false, 'access_active', true,
    'scorecard_complete', match_row.scorecard_complete, 'updated_at', transition_at,
    'official_points_active', false, 'scorecard_archive', archive_result,
    'permission_transition', pg_catalog.jsonb_build_object(
      'before', before_permissions, 'after', after_permissions),
    'audit_created', true, 'google_outbox_created', false);
  insert into scoring_authority.score_mutations
    (match_id, mutation_key, mutation_type, payload_hash,
      previous_match_revision, next_match_revision, result, actor_id)
  values (target_match, mutation_identity, 'REOPEN', payload_hash_value,
    match_row.match_revision, next_revision, result_value, actor);
  insert into scoring_authority.score_revision_history
    (match_id, mutation_key, action, previous_match_revision,
      next_match_revision, before_state, after_state, actor_id)
  values (target_match, mutation_identity, 'MATCH_REOPENED', match_row.match_revision,
    next_revision,
    pg_catalog.jsonb_build_object('match', pg_catalog.to_jsonb(match_row), 'permissions', before_permissions),
    pg_catalog.jsonb_build_object('match', pg_catalog.to_jsonb(next_match_row), 'permissions', after_permissions), actor);
  insert into scoring_authority.audit_events
    (tournament_id, match_id, mutation_key, action, actor_id, metadata)
  values (target_tournament, target_match, mutation_identity, 'MATCH_REOPENED', actor, result_value);
  -- Google runtime retired: external delivery is not canonical authority.
  return result_value;
end;

$core$;
revoke all on function production_control.canonical_future_reopen_match_v1_resource(jsonb,jsonb) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.future_production_reopen_match_v1(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
 return production_control.canonical_future_reopen_match_v1_resource(input,null);
end;
$function$
;

create function production_control.canonical_future_read_scoring_authority_v1_resource(input jsonb, resource_context jsonb) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $core$

declare
  target_tournament text;
  target_match text := input->>'match_id';
  mode text := pg_catalog.upper(coalesce(input->>'mode', 'DIAGNOSTICS'));
  payload jsonb;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
begin
  target_tournament := production_control.assert_canonical_future_scoring_runtime_v1(input,resource_context);
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.tournament_id = target_tournament and value.generation_status = 'ACTIVE';
  if mode = 'MATCH' then
    select pg_catalog.to_jsonb(match_value) into payload
    from scoring_authority.matches match_value
    where match_id = target_match and tournament_id = target_tournament;
  elsif mode = 'SCORECARD' then
    select pg_catalog.jsonb_build_object(
      'match', pg_catalog.to_jsonb(match_value),
      'holes', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(hole) order by hole_number)
        from scoring_authority.hole_scores hole where hole.match_id = match_value.match_id), '[]'::jsonb)
    ) into payload from scoring_authority.matches match_value
    where match_id = target_match and tournament_id = target_tournament;
  elsif mode = 'CURRENT_STATE' then
    select pg_catalog.jsonb_build_object(
      'matches', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(value) order by round_number, match_id)
        from scoring_authority.matches value where tournament_id = target_tournament), '[]'::jsonb),
      'holes', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(hole) order by hole.match_id, hole.hole_number)
        from scoring_authority.hole_scores hole join scoring_authority.matches match_value using (match_id)
        where match_value.tournament_id = target_tournament), '[]'::jsonb),
      'players', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(value) order by player_id)
        from scoring_authority.tournament_players value where tournament_id = target_tournament), '[]'::jsonb),
      'snapshots', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(value) order by match_id)
        from scoring_authority.scoring_snapshots value where tournament_id = target_tournament), '[]'::jsonb),
      'permissions', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(permission) order by match_id, player_id)
        from scoring_authority.scoring_permissions permission join scoring_authority.matches match_value using (match_id)
        where match_value.tournament_id = target_tournament), '[]'::jsonb),
      'checkpoints', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(checkpoint) order by match_id)
        from scoring_authority.google_match_checkpoints checkpoint join scoring_authority.matches match_value using (match_id)
        where match_value.tournament_id = target_tournament), '[]'::jsonb)
    ) into payload;
  elsif mode = 'DIAGNOSTICS' then
    select pg_catalog.jsonb_build_object(
      'matches', (select pg_catalog.count(*) from scoring_authority.matches where tournament_id = target_tournament),
      'holes', (select pg_catalog.count(*) from scoring_authority.hole_scores hole join scoring_authority.matches match_value using (match_id)
        where match_value.tournament_id = target_tournament),
      'permissions', (select pg_catalog.count(*) from scoring_authority.scoring_permissions permission join scoring_authority.matches match_value using (match_id)
        where match_value.tournament_id = target_tournament),
      'pending_outbox', 0 /* external Google delivery retired */,
      'authority', (select scoring_authority from scoring_authority.tournaments where tournament_id = target_tournament),
      'ingress', pg_catalog.jsonb_build_object(
        'tournament_id', target_tournament, 'state', generation.ingress_state,
        'authority', generation.authority,
        'active_epoch_id', generation.authority_generation_id,
        'unresolved_client_queues', 0, 'updated_at', generation.updated_at)
    ) into payload;
  else
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'INVALID_READ_MODE');
  end if;
  return pg_catalog.jsonb_build_object('ok', true, 'mode', mode, 'data', payload);
end;

$core$;
revoke all on function production_control.canonical_future_read_scoring_authority_v1_resource(jsonb,jsonb) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.future_production_read_scoring_authority_v1(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
 return production_control.canonical_future_read_scoring_authority_v1_resource(input,null);
end;
$function$
;

create function production_control.canonical_future_read_scoring_participant_context_v1_resource(input jsonb, resource_context jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $core$

declare
  target_tournament text;
  target_match text := input->>'match_id';
  actor text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input->>'player_id', ''
  )));
  actor_auth_user uuid := nullif(input->>'auth_user_id', '')::uuid;
  participant_role text := pg_catalog.upper(coalesce(
    input->>'role', 'PLAYER'
  ));
  supplied_permission_revision bigint := coalesce(
    (input->>'permission_revision')::bigint, -1
  );
  match_row scoring_authority.matches%rowtype;
  permission_ok boolean := false;
begin
  target_tournament := production_control
    .assert_canonical_future_scoring_runtime_v1(input,resource_context);
  if production_control.assert_canonical_future_identity_runtime_v1(resource_context)
       <> target_tournament then
    raise exception using errcode = '55000',
      message = 'FUTURE_PARTICIPANT_IDENTITY_RUNTIME_REQUIRED';
  end if;
  select value.* into match_row
  from scoring_authority.matches value
  where value.match_id = target_match
    and value.tournament_id = target_tournament;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'MATCH_NOT_FOUND'
    );
  end if;
  if actor_auth_user is not null
     and participant_role in ('PLAYER', 'DIRECTOR')
     and supplied_permission_revision = match_row.permission_revision
     and exists (
       select 1
       from production_control.future_participant_identity_eligibility_v1(
         target_tournament
       ) eligibility
       where eligibility.auth_user_id = actor_auth_user
         and eligibility.player_id = actor
         and eligibility.runtime_eligible
     )
     and (participant_role <> 'DIRECTOR' or (
       exists (
         select 1
         from participant_identity.tournament_roles role_value
         where role_value.tournament_id = target_tournament
           and role_value.auth_user_id = actor_auth_user
           and role_value.role = 'DIRECTOR'
           and role_value.role_active
           and role_value.revoked_at is null
       )
       and exists (
         select 1
         from production_control.director_entitlements entitlement
         where entitlement.auth_user_id = actor_auth_user
           and entitlement.tournament_id = target_tournament
           and entitlement.player_id = actor
           and entitlement.role = 'DIRECTOR'
           and entitlement.status = 'ACTIVE'
           and entitlement.revoked_at is null
       )
     )) then
    if participant_role = 'PLAYER' then
      select exists (
        select 1
        from scoring_authority.scoring_permissions permission
        where permission.match_id = target_match
          and permission.player_id = actor
          and permission.can_score
          and permission.revoked_at is null
          and permission.permission_revision = match_row.permission_revision
      ) into permission_ok;
    elsif participant_role = 'DIRECTOR' then
      permission_ok := true;
    end if;
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'data', pg_catalog.jsonb_build_object(
      'match', pg_catalog.to_jsonb(match_row),
      'holes', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(hole) order by hole.hole_number
        )
        from scoring_authority.hole_scores hole
        where hole.match_id = target_match
      ), '[]'::jsonb),
      'authorization', pg_catalog.jsonb_build_object(
        'verified', permission_ok,
        'writable', permission_ok and match_row.status <> 'FINAL'
          and not match_row.scoring_locked,
        'permission_revision', match_row.permission_revision
      )
    )
  );
end;

$core$;
revoke all on function production_control.canonical_future_read_scoring_participant_context_v1_resource(jsonb,jsonb) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.future_production_read_scoring_participant_context_v1(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
 return production_control.canonical_future_read_scoring_participant_context_v1_resource(input,null);
end;
$function$
;

create function production_control.canonical_future_mutate_match_control_v1_resource(input jsonb, resource_context jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $core$

declare
  target_tournament text;
  match_row scoring_authority.matches%rowtype;
  next_match_row scoring_authority.matches%rowtype;
  mutation_row scoring_authority.score_mutations%rowtype;
  target_match text := input->>'match_id';
  operation text := pg_catalog.upper(coalesce(input->>'operation', ''));
  mutation_identity text := input->>'mutation_key';
  actor text := input#>>'{authorization,player_id}';
  expected_match bigint := coalesce((input->>'expected_match_revision')::bigint, -1);
  expected_permission bigint := coalesce((input#>>'{authorization,permission_revision}')::bigint, -1);
  next_match_revision bigint;
  next_permission_revision bigint;
  permission_changes boolean;
  target_locked boolean;
  target_access boolean;
  event_type text;
  payload_hash_value text;
  result_value jsonb;
  before_permissions jsonb;
  after_permissions jsonb;
  readiness_value jsonb;
  transition_at timestamptz := pg_catalog.clock_timestamp();
begin
  target_tournament := production_control.assert_canonical_future_scoring_runtime_v1(input,resource_context);
  perform production_control.assert_canonical_future_scoring_actor_v1(input,target_tournament,true,resource_context);
  if operation not in ('MARK_LIVE', 'SCORING_LOCK', 'SCORING_UNLOCK', 'ACCESS_ACTIVATE', 'ACCESS_REVOKE')
     or coalesce(target_match, '') = '' or coalesce(mutation_identity, '') = '' then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'INVALID_CONTROL_OPERATION');
  end if;
  if operation = 'MARK_LIVE' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'production-access-governance-v1:' || target_tournament, 0));
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'production-tournament-setup-v1:' || target_tournament, 0));
  end if;
  select * into match_row from scoring_authority.matches
  where match_id = target_match and tournament_id = target_tournament for update;
  if not found then return pg_catalog.jsonb_build_object('ok', false, 'code', 'MATCH_NOT_FOUND'); end if;
  if input#>>'{authorization,match_id}' <> target_match then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'DIRECTOR_REQUIRED');
  end if;
  payload_hash_value := production_control.cutover_payload_hash(pg_catalog.jsonb_build_object(
    'match_id', target_match, 'operation', operation, 'actor_id', actor));
  select * into mutation_row from scoring_authority.score_mutations
  where match_id = target_match and mutation_key = mutation_identity;
  if found then
    if mutation_row.payload_hash = payload_hash_value then
      return mutation_row.result || pg_catalog.jsonb_build_object('idempotent', true);
    end if;
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT');
  end if;
  if expected_match <> match_row.match_revision then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'MATCH_REVISION_CONFLICT',
      'current_match_revision', match_row.match_revision);
  end if;
  if expected_permission <> match_row.permission_revision then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'PERMISSION_STALE',
      'current_permission_revision', match_row.permission_revision);
  end if;
  if match_row.status = 'FINAL' then return pg_catalog.jsonb_build_object('ok', false, 'code', 'MATCH_FINAL'); end if;
  if operation = 'MARK_LIVE' and match_row.status = 'LIVE' then
    return pg_catalog.jsonb_build_object('ok', true, 'code', 'NO_CHANGE',
      'semantic_noop', true, 'match_id', target_match,
      'match_revision', match_row.match_revision,
      'permission_revision', match_row.permission_revision,
      'status', match_row.status, 'scoring_locked', match_row.scoring_locked,
      'google_outbox_created', false);
  end if;
  if operation = 'MARK_LIVE' and match_row.status <> 'UPCOMING' then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'MATCH_NOT_UPCOMING');
  end if;
  if operation = 'MARK_LIVE' then
    readiness_value := production_control.assert_future_production_match_scoring_ready_v1(
      target_match, target_tournament);
    if coalesce((readiness_value->>'ready')::boolean, false) is not true then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'PRODUCTION_MATCH_NOT_SCORING_READY',
        'match_id', target_match, 'match_revision', match_row.match_revision,
        'permission_revision', match_row.permission_revision,
        'status', match_row.status, 'scoring_locked', match_row.scoring_locked,
        'scoring_readiness_contract', 'production-match-scoring-readiness-v1',
        'reasons', coalesce(readiness_value->'reasons', '[]'::jsonb),
        'audit_created', false, 'google_outbox_created', false);
    end if;
  end if;
  if operation in ('SCORING_UNLOCK', 'ACCESS_ACTIVATE') and (
       (operation = 'ACCESS_ACTIVATE' and match_row.scoring_locked)
       or (operation = 'SCORING_UNLOCK' and not match_row.scoring_locked)
     ) then
    if operation = 'ACCESS_ACTIVATE' and match_row.scoring_locked then
      return pg_catalog.jsonb_build_object('ok', false, 'code', 'SCORING_LOCKED');
    end if;
    if not exists (select 1 from scoring_authority.scoring_permissions
      where match_id = target_match and (not can_score or revoked_at is not null
        or permission_revision <> match_row.permission_revision)) then
      return pg_catalog.jsonb_build_object('ok', true, 'code', 'NO_CHANGE',
        'semantic_noop', true, 'match_id', target_match,
        'match_revision', match_row.match_revision,
        'permission_revision', match_row.permission_revision,
        'scoring_locked', match_row.scoring_locked,
        'access_active', true, 'google_outbox_created', false);
    end if;
  end if;
  if operation = 'SCORING_LOCK' and match_row.scoring_locked and not exists (
    select 1 from scoring_authority.scoring_permissions
    where match_id = target_match and (can_score or revoked_at is null
      or permission_revision <> match_row.permission_revision)
  ) then
    return pg_catalog.jsonb_build_object('ok', true, 'code', 'NO_CHANGE',
      'semantic_noop', true, 'match_id', target_match,
      'match_revision', match_row.match_revision,
      'permission_revision', match_row.permission_revision,
      'scoring_locked', true, 'access_active', false,
      'google_outbox_created', false);
  end if;
  if operation = 'ACCESS_REVOKE' and not exists (
    select 1 from scoring_authority.scoring_permissions
    where match_id = target_match and (can_score or revoked_at is null
      or permission_revision <> match_row.permission_revision)
  ) then
    return pg_catalog.jsonb_build_object('ok', true, 'code', 'NO_CHANGE',
      'semantic_noop', true, 'match_id', target_match,
      'match_revision', match_row.match_revision,
      'permission_revision', match_row.permission_revision,
      'scoring_locked', match_row.scoring_locked, 'access_active', false,
      'google_outbox_created', false);
  end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(permission)
    order by permission.player_id), '[]'::jsonb) into before_permissions
  from scoring_authority.scoring_permissions permission where match_id = target_match;
  next_match_revision := match_row.match_revision + 1;
  permission_changes := operation <> 'MARK_LIVE';
  next_permission_revision := match_row.permission_revision + case when permission_changes then 1 else 0 end;
  target_locked := case operation when 'SCORING_LOCK' then true
    when 'SCORING_UNLOCK' then false else match_row.scoring_locked end;
  target_access := case operation when 'SCORING_LOCK' then false
    when 'SCORING_UNLOCK' then true when 'ACCESS_ACTIVATE' then true
    when 'ACCESS_REVOKE' then false else exists (select 1
      from scoring_authority.scoring_permissions where match_id = target_match
        and can_score and revoked_at is null) end;
  event_type := case operation when 'MARK_LIVE' then 'MATCH_MARKED_LIVE'
    when 'SCORING_LOCK' then 'SCORING_LOCKED'
    when 'SCORING_UNLOCK' then 'SCORING_UNLOCKED'
    when 'ACCESS_ACTIVATE' then 'SCORING_ACCESS_ACTIVATED'
    else 'SCORING_ACCESS_REVOKED' end;
  update scoring_authority.matches set
    status = case when operation = 'MARK_LIVE' then 'LIVE' else status end,
    scoring_locked = target_locked, match_revision = next_match_revision,
    permission_revision = next_permission_revision,
    authority_updated_at = transition_at, updated_at = transition_at
  where match_id = target_match and tournament_id = target_tournament returning * into next_match_row;
  if permission_changes then
    update scoring_authority.scoring_permissions set can_score = target_access,
      permission_revision = next_permission_revision,
      revoked_at = case when target_access then null else transition_at end,
      updated_at = transition_at where match_id = target_match;
  end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(permission)
    order by permission.player_id), '[]'::jsonb) into after_permissions
  from scoring_authority.scoring_permissions permission where match_id = target_match;
  result_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', operation, 'match_id', target_match,
    'google_target_match_id', target_match, 'match_revision', next_match_revision,
    'previous_permission_revision', match_row.permission_revision,
    'permission_revision', next_permission_revision, 'status', next_match_row.status,
    'scoring_locked', target_locked, 'access_active', target_access,
    'updated_at', transition_at,
    'permission_transition', pg_catalog.jsonb_build_object(
      'before', before_permissions, 'after', after_permissions),
    'audit_created', true, 'google_outbox_created', false);
  insert into scoring_authority.score_mutations (
    match_id, mutation_key, mutation_type, payload_hash,
    previous_match_revision, next_match_revision, result, actor_id
  ) values (target_match, mutation_identity, operation, payload_hash_value,
    match_row.match_revision, next_match_revision, result_value, actor);
  insert into scoring_authority.score_revision_history (
    match_id, mutation_key, action, previous_match_revision,
    next_match_revision, before_state, after_state, actor_id
  ) values (target_match, mutation_identity, event_type, match_row.match_revision,
    next_match_revision,
    pg_catalog.jsonb_build_object('match', pg_catalog.to_jsonb(match_row), 'permissions', before_permissions),
    pg_catalog.jsonb_build_object('match', pg_catalog.to_jsonb(next_match_row), 'permissions', after_permissions), actor);
  insert into scoring_authority.audit_events
    (tournament_id, match_id, mutation_key, action, actor_id, metadata)
  values (target_tournament, target_match, mutation_identity, event_type, actor, result_value);
  -- Google runtime retired: external delivery is not canonical authority.
  return result_value;
end;

$core$;
revoke all on function production_control.canonical_future_mutate_match_control_v1_resource(jsonb,jsonb) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.future_production_mutate_match_control_v1(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
 return production_control.canonical_future_mutate_match_control_v1_resource(input,null);
end;
$function$
;

create function production_control.canonical_future_identity_for_auth_v1(target_auth_user_id uuid, target_tournament_id text, resource_context jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $core$

declare
  target_id text;
  target_player text;
  context_value jsonb;
begin
  target_id := production_control
    .assert_canonical_future_identity_runtime_v1(resource_context);
  if target_auth_user_id is null
     or nullif(pg_catalog.btrim(coalesce(target_tournament_id, '')), '')
       is distinct from target_id then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PRODUCTION_AUTH_SCOPE_INVALID'
    );
  end if;
  select eligibility.player_id into target_player
  from production_control.future_participant_identity_eligibility_v1(
    target_id
  ) eligibility
  where eligibility.auth_user_id = target_auth_user_id
    and eligibility.runtime_eligible;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'ACTIVE_USER_PLAYER_LINK_REQUIRED'
    );
  end if;
  context_value := public.read_participant_identity_context(
    target_id, target_player
  );
  if coalesce((context_value->>'ok')::boolean, false) then
    return pg_catalog.jsonb_set(
      context_value, '{data,authUserId}',
      pg_catalog.to_jsonb(target_auth_user_id), true
    );
  end if;
  return context_value;
end;

$core$;
revoke all on function production_control.canonical_future_identity_for_auth_v1(uuid,text,jsonb) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.read_production_future_participant_context_for_auth_v1(target_auth_user_id uuid, target_tournament_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
 return production_control.canonical_future_identity_for_auth_v1(target_auth_user_id,target_tournament_id,null);
end;
$function$
;

create function production_control.canonical_future_identity_for_player_v1(target_tournament_id text, target_player_id text, resource_context jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $core$

declare
  target_id text;
  target_user uuid;
begin
  target_id := production_control
    .assert_canonical_future_identity_runtime_v1(resource_context);
  if pg_catalog.btrim(coalesce(target_tournament_id, '')) <> target_id then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PRODUCTION_AUTH_SCOPE_INVALID'
    );
  end if;
  select eligibility.auth_user_id into target_user
  from production_control.future_participant_identity_eligibility_v1(
    target_id
  ) eligibility
  where eligibility.player_id = pg_catalog.btrim(target_player_id)
    and eligibility.runtime_eligible;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'ACTIVE_USER_PLAYER_LINK_REQUIRED'
    );
  end if;
  return production_control.canonical_future_identity_for_auth_v1(
    target_user, target_id, resource_context
  );
end;

$core$;
revoke all on function production_control.canonical_future_identity_for_player_v1(text,text,jsonb) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.read_production_future_participant_player_context_v1(target_tournament_id text, target_player_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
 return production_control.canonical_future_identity_for_player_v1(target_tournament_id,target_player_id,null);
end;
$function$
;

create function production_control.canonical_future_director_entitlement_v1(target_auth_user_id uuid, target_tournament_id text, resource_context jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $core$

declare
  target_id text;
  owner_value record;
  target_player text;
  entitlement_value production_control.director_entitlements%rowtype;
  revision_value bigint;
begin
  target_id := production_control
    .assert_canonical_future_identity_runtime_v1(resource_context);
  if target_auth_user_id is null
     or pg_catalog.btrim(coalesce(target_tournament_id, '')) <> target_id then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PRODUCTION_AUTH_SCOPE_INVALID'
    );
  end if;

  -- Global Owner governance survives annual pointer changes and does not
  -- imply annual participant membership or a cloned Director entitlement.
  select value.* into owner_value
  from production_control.future_global_owner_eligibility_v1() value
  where value.auth_user_id = target_auth_user_id;
  if found then
    return pg_catalog.jsonb_build_object(
      'ok', true, 'found', true, 'active', true,
      'status', 'ACTIVE', 'tournamentId', target_id,
      'directorPlayerId', owner_value.player_id,
      'role', 'OWNER',
      'revision', owner_value.capability_revision,
      'grantedAt', owner_value.adopted_at,
      'revokedAt', null
    );
  end if;

  select eligibility.player_id into target_player
  from production_control.future_participant_identity_eligibility_v1(
    target_id
  ) eligibility
  join participant_identity.tournament_roles director_role
    on director_role.tournament_id = target_id
   and director_role.auth_user_id = eligibility.auth_user_id
   and director_role.role = 'DIRECTOR'
   and director_role.role_active
   and director_role.revoked_at is null
  where eligibility.auth_user_id = target_auth_user_id
    and eligibility.runtime_eligible;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', true, 'found', false, 'active', false,
      'tournamentId', target_id
    );
  end if;
  select value.* into entitlement_value
  from production_control.director_entitlements value
  where value.tournament_id = target_id
    and value.player_id = target_player
    and value.auth_user_id = target_auth_user_id
    and value.role = 'DIRECTOR'
    and value.status = 'ACTIVE'
    and value.revoked_at is null;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', true, 'found', false, 'active', false,
      'tournamentId', target_id
    );
  end if;
  select coalesce(pg_catalog.max(event_value.event_id), 0)
  into revision_value
  from production_control.director_entitlement_events event_value
  where event_value.entitlement_id = entitlement_value.entitlement_id;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'found', true, 'active', true,
    'status', 'ACTIVE', 'tournamentId', target_id,
    'directorPlayerId', target_player,
    'role', 'DIRECTOR', 'revision', revision_value,
    'grantedAt', entitlement_value.granted_at,
    'revokedAt', entitlement_value.revoked_at
  );
end;

$core$;
revoke all on function production_control.canonical_future_director_entitlement_v1(uuid,text,jsonb) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.read_production_future_director_entitlement_v1(target_auth_user_id uuid, target_tournament_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
 return production_control.canonical_future_director_entitlement_v1(target_auth_user_id,target_tournament_id,null);
end;
$function$
;

create or replace function production_control.certification_ingress_identity_v1(input jsonb,recovery boolean default false)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare op text:=input->>'operation_id';id text:=input->>'operation_request_id';target text:=input#>>'{authorization,tournament_id}';
 m text:=input#>>'{payload,match_id}';actor text:=input#>>'{authorization,player_id}';role_name text:=input#>>'{authorization,role}';
 auth_id uuid:=(input#>>'{authorization,auth_user_id}')::uuid;
begin
 if not production_control.certification_ingress_required_v1(op)or id is null or id!~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
  or target is null or target!~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$' or actor is null or auth_id is null
  or role_name not in('PLAYER','DIRECTOR')or role_name is null then
   raise exception using errcode='22023',message='CERTIFICATION_INGRESS_IDENTITY_INVALID';end if;
 if(op like 'SCORING.%'or op='DIRECTOR.MATCH_CONTROL')and(m is null or m!~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$')then
  raise exception using errcode='22023',message='CERTIFICATION_INGRESS_MATCH_REQUIRED';end if;
 if op like 'DIRECTOR.%'and id!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'then
  raise exception using errcode='22023',message='CERTIFICATION_INGRESS_IDENTITY_INVALID';end if;
 if op like 'SCORING.%'and input#>>'{authorization,match_id}'is distinct from m then
  raise exception using errcode='42501',message='CERTIFICATION_INGRESS_MATCH_DENIED';end if;
 if recovery then perform production_control.assert_certification_ingress_recovery_actor_v1(input,target,op like 'DIRECTOR.%'or op='SCORING.REOPEN_MATCH');
 elsif target='2026'then perform production_control.assert_production_scoring_actor(input,op like 'DIRECTOR.%'or op='SCORING.REOPEN_MATCH');
 else perform production_control.assert_canonical_future_scoring_actor_v1(input,target,op like 'DIRECTOR.%'or op='SCORING.REOPEN_MATCH',production_control.current_certification_context_v1());end if;
 return jsonb_build_object('operation_id',op,'operation_request_id',id,'tournament_id',target,'match_id',m,
  'target_key',case when op like 'SCORING.%'or op='DIRECTOR.MATCH_CONTROL'then 'MATCH:'||m else 'TOURNAMENT'end,
  'actor_auth_user_id',auth_id,'actor_player_id',actor,'actor_role',role_name);
exception when invalid_text_representation then raise exception using errcode='22023',message='CERTIFICATION_INGRESS_IDENTITY_INVALID';
end;$$;
create or replace function public.admit_certification_operation_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare r production_control.canonical_resource_v1%rowtype;i jsonb;ctx jsonb;phase text;hash text;
 l production_control.certification_ingress_leases_v1%rowtype;g production_control.certification_ingress_generations_v1%rowtype;
 m scoring_authority.matches%rowtype;
begin
 r:=production_control.certification_ingress_recovery_resource_v1(input);
 i:=jsonb_build_object('operation_id',input->>'operation_id','operation_request_id',input->>'operation_request_id',
  'target_key',case when input->>'operation_id'like'SCORING.%'or input->>'operation_id'='DIRECTOR.MATCH_CONTROL'
  then'MATCH:'||(input#>>'{payload,match_id}')else'TOURNAMENT'end);
 if jsonb_typeof(input->'payload')is distinct from 'object'or input->'payload'?|array['resource','deployment','authorization','environment','project_ref','project_url',
 'actor_player_id','actor_auth_user_id','auth_user_id','role','context_token','expected_context_token','binding_id','resource_id','resource_class',
 'installation_id','release_commit','activation_revision','admission_revision','governance_tournament_id']
 or(input->'payload'?'player_id'and not coalesce(input->>'operation_id'='DIRECTOR.CLEAR_CALCUTTA_AUCTION'
  or(input->>'operation_id'='DIRECTOR.MUTATE_SETUP'and input#>>'{payload,action}'='assign-roster-team'),false))then
  raise exception using errcode='42501',message='CERTIFICATION_INGRESS_PAYLOAD_INVALID';end if;
 -- Match mutation keys share canonical receipt identity across all four families.
 -- Serialize their admission before any row exists; other families retain their
 -- existing operation-specific namespace.
 perform pg_advisory_xact_lock(hashtextextended(r.resource_id||':'||
  case when i->>'operation_id'in('SCORING.SUBMIT_HOLE','SCORING.FINALIZE_MATCH','SCORING.REOPEN_MATCH','DIRECTOR.MATCH_CONTROL')
   then 'MATCH_MUTATION'else i->>'operation_id'end||':'||(i->>'target_key')||':'||(i->>'operation_request_id'),19361));
 l:=production_control.certification_ingress_lookup_v1(input||jsonb_build_object('verify_request',true),true);
 if l.lease_id is not null then return production_control.certification_ingress_response_v1(l);end if;
 if coalesce((input->>'replay_only')::boolean,false)then
  return jsonb_build_object('ok',true,'contract','certification-ingress-v1','state','UNKNOWN','lease_id',null,'operation_request_id',i->>'operation_request_id');end if;
 phase:=production_control.certification_operation_phase_v1(input->>'operation_id',true);
 ctx:=production_control.push_certification_context_v1(input,phase,true);
 i:=production_control.certification_ingress_identity_v1(input);
 hash:=production_control.certification_ingress_request_hash_v1(input,i);
 if i->>'tournament_id'is distinct from ctx->>'tournament_id'then raise exception using errcode='42501',message='CERTIFICATION_INGRESS_TARGET_DENIED';end if;
 if(input#>>'{payload,tournament_id}'is not null and input#>>'{payload,tournament_id}'is distinct from ctx->>'tournament_id')
  or(input#>>'{payload,expected_epoch_id}'is not null and input#>>'{payload,expected_epoch_id}'is distinct from ctx->>'authority_epoch_id')
  or(input->>'operation_id'like'SCORING.%'and input#>>'{payload,mutation_key}'is distinct from input->>'operation_request_id')then
  raise exception using errcode='42501',message='CERTIFICATION_INGRESS_TARGET_DENIED';end if;
 select * into strict g from production_control.certification_ingress_generations_v1 where resource_id=r.resource_id and state='OPEN'for share;
 if g.tournament_id is distinct from ctx->>'tournament_id'or g.authority_epoch_id::text is distinct from ctx->>'authority_epoch_id'
  or g.pointer_revision::text is distinct from ctx->>'pointer_revision'then
  raise exception using errcode='40001',message='CERTIFICATION_INGRESS_GENERATION_STALE';end if;
 if i->>'match_id'is not null then
  select * into strict m from scoring_authority.matches where match_id=i->>'match_id'and tournament_id=g.tournament_id for share;
  if i->>'actor_role'='PLAYER'and not exists(select 1 from scoring_authority.scoring_permissions p
   where p.match_id=m.match_id and p.player_id=i->>'actor_player_id'and p.can_score and p.revoked_at is null
    and p.permission_revision=m.permission_revision
    and p.permission_revision::text=input#>>'{authorization,permission_revision}')then
   raise exception using errcode='42501',message='CERTIFICATION_INGRESS_PERMISSION_DENIED';end if;
 end if;
 if i->>'operation_id'in('SCORING.SUBMIT_HOLE','SCORING.FINALIZE_MATCH','SCORING.REOPEN_MATCH','DIRECTOR.MATCH_CONTROL')
  and exists(select 1 from production_control.certification_ingress_leases_v1 existing
   where existing.resource_id=r.resource_id and existing.target_key=i->>'target_key'
    and existing.operation_request_id=i->>'operation_request_id'and existing.operation_id<>i->>'operation_id'
    and existing.operation_id in('SCORING.SUBMIT_HOLE','SCORING.FINALIZE_MATCH','SCORING.REOPEN_MATCH','DIRECTOR.MATCH_CONTROL'))then
  raise exception using errcode='40001',message='CERTIFICATION_INGRESS_IDEMPOTENCY_CONFLICT';end if;
 l.resource_id:=r.resource_id;l.tournament_id:=g.tournament_id;l.operation_id:=i->>'operation_id';
 l.operation_request_id:=i->>'operation_request_id';l.match_id:=i->>'match_id';l.domain_action:=input#>>'{payload,action}';
 if production_control.certification_ingress_canonical_receipt_v1(l)is not null then
  raise exception using errcode='40001',message='CERTIFICATION_INGRESS_EXISTING_RECEIPT_REQUIRES_RECOVERY';end if;
 insert into production_control.certification_ingress_leases_v1(resource_id,admission_generation_id,tournament_id,authority_epoch_id,
 operation_id,operation_request_id,target_key,match_id,domain_action,actor_auth_user_id,actor_player_id,actor_role,request_hash,context_token,admission_context,predecessor_auction_revision)
 values(r.resource_id,g.generation_id,g.tournament_id,g.authority_epoch_id,i->>'operation_id',i->>'operation_request_id',i->>'target_key',
 i->>'match_id',input#>>'{payload,action}',(i->>'actor_auth_user_id')::uuid,i->>'actor_player_id',i->>'actor_role',hash,ctx->>'context_token',
  ctx-array['authorization','actor_auth_user_id','actor_player_id','resource','deployment'],case when i->>'operation_id'in('DIRECTOR.REPLACE_CALCUTTA_AUCTION','DIRECTOR.CLEAR_CALCUTTA_AUCTION')
   then(input#>>'{payload,expected_auction_revision}')::bigint else null end)returning * into l;
 insert into production_control.operation_audit_events(event_type,domain,tournament_id,actor,request_fingerprint,result,details)
 values('CERTIFICATION_INGRESS_ADMITTED','CERTIFICATION',l.tournament_id,l.actor_player_id,hash,'SUCCEEDED',
 jsonb_build_object('resource_id',r.resource_id,'generation_id',g.generation_id,'lease_id',l.lease_id,'operation_id',l.operation_id,
 'operation_request_id',l.operation_request_id,'admission_sequence',l.admission_sequence));
 perform production_control.pop_certification_context_v1();return production_control.certification_ingress_response_v1(l);
exception when no_data_found then raise exception using errcode='55000',message='CERTIFICATION_INGRESS_AUTHORITY_UNAVAILABLE';
end;$$;
create or replace function public.read_certification_projection_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare context jsonb; payload jsonb:=coalesce(input->'payload','{}'); result jsonb;
begin
 context:=production_control.push_certification_context_v1(input,'READS',false);
 if (context->>'current_tournament_year')::integer>2026 then
  perform production_control.assert_current_certification_future_context_v1(context);
  if jsonb_typeof(payload) is distinct from 'object' or payload->>'target_tournament_id' is distinct from context->>'tournament_id'
   or exists(select 1 from jsonb_object_keys(payload) k where k not in('target_auth_user_id','target_player_id','target_tournament_id')) then
   raise exception using errcode='42501',message='CERTIFICATION_READ_TARGET_DENIED';end if;
  case input->>'operation'
  when 'READS.IDENTITY_FOR_AUTH' then result:=production_control.canonical_future_identity_for_auth_v1((payload->>'target_auth_user_id')::uuid,payload->>'target_tournament_id',context);
  when 'READS.IDENTITY_FOR_PLAYER' then result:=production_control.canonical_future_identity_for_player_v1(payload->>'target_tournament_id',payload->>'target_player_id',context);
  when 'READS.DIRECTOR_ENTITLEMENT' then result:=production_control.canonical_future_director_entitlement_v1((payload->>'target_auth_user_id')::uuid,payload->>'target_tournament_id',context);
  else raise exception using errcode='42501',message='CERTIFICATION_FUTURE_READ_OPERATION_DENIED';end case;
  perform production_control.pop_certification_context_v1();return result;
 end if;
 perform production_control.assert_certification_read_v1(context,payload);
 case input->>'operation'
 when 'READS.IDENTITY_FOR_AUTH' then result:=production_control.canonical_identity_for_auth_v1((payload->>'target_auth_user_id')::uuid,coalesce(payload->>'target_tournament_id','2026'),context);
 when 'READS.IDENTITY_FOR_PLAYER' then result:=production_control.canonical_identity_for_player_v1(payload->>'target_tournament_id',payload->>'target_player_id',context);
 when 'READS.DIRECTOR_ENTITLEMENT' then result:=production_control.canonical_director_entitlement_read_v1((payload->>'target_auth_user_id')::uuid,payload->>'target_tournament_id',context);
 when 'READS.CURRENT_VIEW' then result:=production_control.canonical_current_view_read_v1(payload,context);
 when 'READS.HISTORY_2026' then result:=production_control.canonical_current_view_read_v1(payload||jsonb_build_object('surface','HISTORY_2026'),context);
 when 'READS.COMPLETED_HISTORY' then result:=production_control.canonical_completed_history_read_v1(payload,context);
 when 'READS.DRAFT' then result:=production_control.canonical_draft_read_v1(payload,context);
 when 'READS.GUIDE' then result:=production_control.canonical_guide_read_v1(payload||jsonb_build_object('domain','GUIDE',
  'contract_version','guide-projection-v1','source_tabs',
  '["Tournaments","Guide Sections","Tournament Itinerary","Tournament Timeline","Rule Book","Tournament Rules","Rounds","Dining","Local Guide","Important Contacts","Courses"]'::jsonb),context);
 when 'READS.PREDICTION_SETTINGS' then result:=production_control.canonical_projection_read_v1(payload||jsonb_build_object('domain','PREDICTION_SETTINGS',
  'contract_version','prediction-settings-v1','source_tabs','["Prediction Settings"]'::jsonb),
  'PREDICTION_SETTINGS','prediction-settings-v1','["Prediction Settings"]'::jsonb,context);
 when 'READS.PLAYER_EDITORIAL' then result:=production_control.canonical_player_editorial_read_v1(payload||jsonb_build_object('domain','PLAYER_EDITORIAL',
  'contract_version','player-public-profile-v1','source_tabs','["Players"]'::jsonb),context);
 else raise exception using errcode='42501',message='CERTIFICATION_READ_OPERATION_DENIED';
 end case;
 perform production_control.pop_certification_context_v1();
 return result;
end;
$$;
create function production_control.dispatch_certification_future_scoring_v1(input jsonb, context jsonb, mutation boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $dispatch$
declare op text:=input->>'operation_id';payload jsonb:=input->'payload';command jsonb;operation_name text;
 generation production_control.future_annual_runtime_generations_v1%rowtype;
begin
 perform production_control.assert_current_certification_future_context_v1(context);
 if jsonb_typeof(payload) is distinct from 'object' or payload ?| array['resource','deployment','authorization','environment','project_ref','project_url',
  'source_workbook_id','actor_player_id','actor_auth_user_id','auth_user_id','role','player_id','context_token','expected_context_token',
  'binding_id','resource_id','resource_class','installation_id','release_commit','activation_revision','admission_revision','governance_tournament_id',
  'annual_scoring_dispatch_contract','annual_scoring_operation','expected_runtime_generation_id','expected_annual_authority_generation_id',
  'expected_annual_admission_generation_id','expected_current_tournament_id','expected_pointer_revision'] then
  raise exception using errcode='42501',message='CERTIFICATION_OPERATION_AUTHORITY_FIELD_REJECTED';end if;
 if (payload ? 'tournament_id' and payload->>'tournament_id' is distinct from context->>'tournament_id')
  or (payload ? 'expected_epoch_id' and payload->>'expected_epoch_id' is distinct from context->>'authority_epoch_id')
  or(input#>>'{authorization,tournament_id}' is not null and input#>>'{authorization,tournament_id}' is distinct from context->>'tournament_id') then
  raise exception using errcode='42501',message='CERTIFICATION_OPERATION_TARGET_MISMATCH';end if;
 case op
 when 'SCORING.SUBMIT_HOLE' then operation_name:='submit_production_hole_score';
 when 'SCORING.FINALIZE_MATCH' then operation_name:='finalize_production_match';
 when 'SCORING.REOPEN_MATCH' then operation_name:='reopen_production_match';
 when 'SCORING.READ_AUTHORITY' then operation_name:='read_production_scoring_authority';
 when 'SCORING.READ_PARTICIPANT_CONTEXT' then operation_name:='read_production_scoring_participant_context';
 when 'DIRECTOR.MATCH_CONTROL' then operation_name:='mutate_production_match_control';
 when 'DIRECTOR.READ_SETUP' then
  if mutation or payload->>'family' is distinct from 'MATCH_CONTROL' then
   raise exception using errcode='42501',message='CERTIFICATION_FUTURE_OPERATION_NOT_ADMITTED';end if;
  return production_control.read_certification_future_match_control_v1(input,context);
 else raise exception using errcode='42501',message='CERTIFICATION_FUTURE_OPERATION_NOT_ADMITTED';end case;
 if mutation is distinct from (op in('SCORING.SUBMIT_HOLE','SCORING.FINALIZE_MATCH','SCORING.REOPEN_MATCH','DIRECTOR.MATCH_CONTROL')) then
  raise exception using errcode='42501',message='CERTIFICATION_FUTURE_OPERATION_NOT_ADMITTED';end if;
 select * into strict generation from production_control.future_annual_runtime_generations_v1
  where tournament_id=context->>'tournament_id' and generation_status='ACTIVE';
 command:=payload||jsonb_build_object('tournament_id',context->>'tournament_id','authorization',input->'authorization',
  'expected_epoch_id',context->>'authority_epoch_id','annual_scoring_dispatch_contract','production-annual-scoring-dispatch-v1',
  'annual_scoring_operation',operation_name,'expected_current_tournament_id',context->>'current_tournament_id',
  'expected_pointer_revision',context->'pointer_revision','expected_runtime_generation_id',generation.runtime_generation_id,
  'expected_annual_authority_generation_id',generation.authority_generation_id,'expected_annual_admission_generation_id',generation.admission_generation_id);
 if mutation and op like 'SCORING.%' and payload->>'mutation_key' is distinct from input->>'operation_request_id' then
  raise exception using errcode='22023',message='CERTIFICATION_OPERATION_ID_MISMATCH';end if;
 case op

 when 'SCORING.SUBMIT_HOLE' then return production_control.canonical_future_submit_hole_score_v1_resource(command,context);

 when 'SCORING.FINALIZE_MATCH' then return production_control.canonical_future_finalize_match_v1_resource(command,context);

 when 'SCORING.REOPEN_MATCH' then return production_control.canonical_future_reopen_match_v1_resource(command,context);

 when 'SCORING.READ_AUTHORITY' then return production_control.canonical_future_read_scoring_authority_v1_resource(command,context);

 when 'SCORING.READ_PARTICIPANT_CONTEXT' then
  return production_control.canonical_future_read_scoring_participant_context_v1_resource(command||jsonb_build_object('player_id',input#>>'{authorization,player_id}',
   'auth_user_id',input#>>'{authorization,auth_user_id}','role',input#>>'{authorization,role}'),context);
 when 'DIRECTOR.MATCH_CONTROL' then
  if payload->>'action' not in('mark-live','scoring-lock','scoring-unlock','access-activate','access-revoke')
   or coalesce(payload->>'expected_match_revision','')!~'^[0-9]+$'
   or coalesce(payload->>'expected_permission_revision','')!~'^[0-9]+$' then
   raise exception using errcode='22023',message='ISOLATED_DIRECTOR_CONTROL_INPUT_INVALID';end if;
  command:=command||jsonb_build_object('mutation_key',input->>'operation_request_id','operation',
   case payload->>'action' when 'mark-live' then 'MARK_LIVE' when 'scoring-lock' then 'SCORING_LOCK'
    when 'scoring-unlock' then 'SCORING_UNLOCK' when 'access-activate' then 'ACCESS_ACTIVATE' when 'access-revoke' then 'ACCESS_REVOKE' end,
   'authorization',input->'authorization'||jsonb_build_object('match_id',payload->>'match_id','permission_revision',payload->'expected_permission_revision'));
  return production_control.canonical_future_mutate_match_control_v1_resource(command,context);
 else raise exception using errcode='42501',message='CERTIFICATION_FUTURE_OPERATION_NOT_ADMITTED';end case;
end;$dispatch$;
revoke all on function production_control.dispatch_certification_future_scoring_v1(jsonb,jsonb,boolean) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION production_control.dispatch_certification_operation_v1(input jsonb, context jsonb, mutation boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
 operation_id text:=input->>'operation_id'; payload jsonb:=input->'payload'; command jsonb;
 actor_context jsonb; dispatch_input jsonb; family text; action text; result jsonb;
 status_read boolean:=not mutation and operation_id in('DIRECTOR.SETUP_STATUS','DIRECTOR.MATCH_CONTROL_STATUS','DIRECTOR.NET_SKINS_STATUS','DIRECTOR.CALCUTTA_STATUS');
begin
 if mutation and (operation_id like 'WORKERS.%' or operation_id in('DIRECTOR.NET_SKINS_CLAIM','DIRECTOR.NET_SKINS_COMPLETE','DIRECTOR.NET_SKINS_FAIL','DIRECTOR.REQUEUE_DERIVED')) then
  return production_control.dispatch_certification_derived_operation_v1(input,context);
 end if;
 if (context->>'current_tournament_year')::integer>2026 then
  return production_control.dispatch_certification_future_scoring_v1(input,context,mutation);
 end if;
 -- The marker is owner-only and revalidates registered resource/deployment,
 -- current pointer, admission revision and live ingress under transaction locks.
 perform production_control.assert_canonical_scoring_context_v1('{}'::jsonb,context,'RUNTIME');
 if jsonb_typeof(payload) is distinct from 'object' then
  raise exception using errcode='22023',message='CERTIFICATION_OPERATION_INPUT_INVALID'; end if;
 if status_read and (coalesce(input->>'operation_request_id','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  or coalesce(payload->>'original_context_token','') !~ '^[0-9a-f]{64}$') then
  raise exception using errcode='22023',message='CERTIFICATION_OPERATION_RECOVERY_INPUT_REQUIRED'; end if;
 if payload ?| array['resource','deployment','authorization','environment','project_ref','project_url',
  'actor_player_id','actor_auth_user_id','auth_user_id','role','context_token','expected_context_token',
  'binding_id','resource_id','resource_class','installation_id','release_commit','activation_revision',
  'admission_revision','governance_tournament_id'] or (payload ? 'player_id' and not coalesce(
   operation_id='DIRECTOR.CLEAR_CALCUTTA_AUCTION' or
   (operation_id='DIRECTOR.MUTATE_SETUP' and payload->>'action'='assign-roster-team'),false)) then
  raise exception using errcode='42501',message='CERTIFICATION_OPERATION_AUTHORITY_FIELD_REJECTED'; end if;
 if (payload ? 'tournament_id' and payload->>'tournament_id' is distinct from context->>'tournament_id')
  or (payload ? 'expected_epoch_id' and payload->>'expected_epoch_id' is distinct from context->>'authority_epoch_id')
  or (input#>>'{authorization,tournament_id}' is not null and input#>>'{authorization,tournament_id}' is distinct from context->>'tournament_id') then
  raise exception using errcode='42501',message='CERTIFICATION_OPERATION_TARGET_MISMATCH'; end if;
 command:=payload||jsonb_build_object('tournament_id',context->>'tournament_id',
  'expected_epoch_id',context->>'authority_epoch_id','authorization',input->'authorization');
 if mutation and operation_id like 'SCORING.%' and command->>'mutation_key' is distinct from input->>'operation_request_id' then
  raise exception using errcode='22023',message='CERTIFICATION_OPERATION_ID_MISMATCH'; end if;
 if operation_id in('SCORING.REOPEN_MATCH') or operation_id like 'DIRECTOR.%' then
  perform production_control.assert_production_scoring_actor(command,true);
  actor_context:=context||jsonb_build_object('actor_player_id',input#>>'{authorization,player_id}',
   'actor_auth_user_id',input#>>'{authorization,auth_user_id}','authorization',input->'authorization',
   'operation_request_id',input->>'operation_request_id',
   'resource_fingerprint',production_control.cutover_payload_hash(input->'resource'));
 end if;
 case operation_id
 when 'SCORING.READ_AUTHORITY' then
  return production_control.canonical_read_scoring_authority_v2(command,context);
 when 'SCORING.READ_PARTICIPANT_CONTEXT' then
  return production_control.canonical_read_scoring_participant_context_v2(command||jsonb_build_object(
   'player_id',input#>>'{authorization,player_id}','auth_user_id',input#>>'{authorization,auth_user_id}',
   'role',input#>>'{authorization,role}'),context);
 when 'SCORING.READ_MUTATION_STATUS' then
  return production_control.read_score_mutation_status_v1(command,'2026');
 when 'SCORING.SUBMIT_HOLE' then
  return production_control.canonical_submit_hole_score_v2(command,context);
 when 'SCORING.FINALIZE_MATCH' then
  return production_control.canonical_finalize_match_v2(command,context);
 when 'SCORING.REOPEN_MATCH' then
  return production_control.canonical_reopen_match_v2(command,context);
 when 'DIRECTOR.READ_SETUP' then
  family:=coalesce(payload->>'family','TOURNAMENT_SETUP'); action:='read';
  if family not in('TOURNAMENT_SETUP','ROUND_PAIRINGS','MATCH_CONTROL') then
   raise exception using errcode='22023',message='CERTIFICATION_OPERATION_INPUT_INVALID'; end if;
 when 'DIRECTOR.MUTATE_SETUP' then family:='TOURNAMENT_SETUP'; action:=payload->>'action';
 when 'DIRECTOR.SETUP_STATUS' then
  family:=coalesce(payload->>'family','TOURNAMENT_SETUP'); action:=payload->>'action';
  if family not in('TOURNAMENT_SETUP','ROUND_PAIRINGS') then
   raise exception using errcode='22023',message='CERTIFICATION_OPERATION_INPUT_INVALID'; end if;
 when 'DIRECTOR.MUTATE_PAIRINGS' then family:='ROUND_PAIRINGS'; action:='replace-round-pairings';
 when 'DIRECTOR.MATCH_CONTROL' then family:='MATCH_CONTROL'; action:=payload->>'action';
 when 'DIRECTOR.MATCH_CONTROL_STATUS' then family:='MATCH_CONTROL'; action:=payload->>'action';
 when 'DIRECTOR.READ_NET_SKINS' then family:='NET_SKINS_ENTRIES'; action:='read';
 when 'DIRECTOR.SAVE_NET_SKINS_ENTRIES' then family:='NET_SKINS_ENTRIES'; action:='save';
 when 'DIRECTOR.NET_SKINS_STATUS' then family:='NET_SKINS_ENTRIES'; action:='save';
 when 'DIRECTOR.READ_CALCUTTA' then family:='CALCUTTA_MANAGEMENT'; action:='read';
 when 'DIRECTOR.CALCUTTA_STATUS' then family:='CALCUTTA_MANAGEMENT'; action:=payload->>'action';
 when 'DIRECTOR.REPLACE_CALCUTTA_AUCTION' then family:='CALCUTTA_MANAGEMENT'; action:='replace-auction';
 when 'DIRECTOR.CLEAR_CALCUTTA_AUCTION' then family:='CALCUTTA_MANAGEMENT'; action:='clear-entry';
 else raise exception using errcode='42501',message='CERTIFICATION_OPERATION_NOT_ADMITTED';
 end case;
 dispatch_input:=input||jsonb_build_object('family',family,'action',action,'payload',payload-array['action','family','original_context_token']);
 if status_read then
  -- The original token is receipt-hash provenance only. The current outer
  -- context was freshly admitted and remains the sole execution authority.
  dispatch_input:=dispatch_input||jsonb_build_object('mode','status','expected_context_token',payload->>'original_context_token');
 end if;
 if family in('TOURNAMENT_SETUP','ROUND_PAIRINGS','MATCH_CONTROL') then
  return production_control.canonical_director_setup_operation_v2(dispatch_input,actor_context,mutation);
 end if;
 return production_control.canonical_director_financial_operation_v2(dispatch_input,actor_context,mutation);
end;
$function$;
create function production_control.read_certification_future_match_control_v1(input jsonb, context jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $read$
declare target text; matches_value jsonb;
begin
 perform production_control.assert_current_certification_future_context_v1(context);
 if context->>'phase' is distinct from 'DIRECTOR' then raise exception using errcode='42501',message='CERTIFICATION_FUTURE_CONTEXT_REQUIRED';end if;
 target:=production_control.assert_canonical_future_identity_runtime_v1(context);
 perform production_control.assert_canonical_future_scoring_actor_v1(input,target,true,context);
 select coalesce(jsonb_agg(jsonb_build_object('matchId',m.match_id,'round',m.round_number,'format',m.format,'status',m.status,
  'matchRevision',m.match_revision,'permissionRevision',m.permission_revision,
  'scorecardComplete',m.scorecard_complete,'unresolvedMutations',m.unresolved_mutations,
  'resultWinner',m.result_winner,'scoringLocked',m.scoring_locked,
  'scoringReady',coalesce((production_control.assert_future_production_match_scoring_ready_v1(m.match_id,target)->>'ready')::boolean,false),
  'permissionComplete',(select count(*) from scoring_authority.scoring_permissions p where p.match_id=m.match_id)=
   (select count(*) from scoring_authority.match_participants p where p.match_id=m.match_id)
   and exists(select 1 from scoring_authority.match_participants p where p.match_id=m.match_id),
  'accessState',case when not exists(select 1 from scoring_authority.scoring_permissions p where p.match_id=m.match_id and p.can_score and p.revoked_at is null) then 'REVOKED'
   when not exists(select 1 from scoring_authority.scoring_permissions p where p.match_id=m.match_id and (not p.can_score or p.revoked_at is not null or p.permission_revision<>m.permission_revision)) then 'ACTIVE' else 'MIXED' end)
  order by m.round_number,m.match_id),'[]') into matches_value from scoring_authority.matches m where m.tournament_id=target;
 return jsonb_build_object('ok',true,'data',jsonb_build_object('tournament',jsonb_build_object('tournamentId',target),'matches',matches_value));
end;$read$;
revoke all on function production_control.read_certification_future_match_control_v1(jsonb,jsonb) from public,anon,authenticated,service_role;

do $check$ begin
 if exists(select 1 from canonical_future_scoring_original_attributes b left join pg_proc a on a.oid=b.oid
  where a.oid is null or row(a.pronamespace,a.proname,a.proargtypes,a.proowner,a.proacl,a.prosecdef,a.proconfig,a.provolatile)
  is distinct from row(b.pronamespace,b.proname,b.proargtypes,b.proowner,b.proacl,b.prosecdef,b.proconfig,b.provolatile)) then
  raise exception 'CANONICAL_FUTURE_SCORING_PRODUCTION_ATTRIBUTES_CHANGED';end if;
end;$check$;

do $acl$ declare candidate pg_proc%rowtype;original_owner oid;
begin
 select proowner into strict original_owner from pg_proc where oid='future_production_submit_hole_score_v1(jsonb)'::regprocedure;
 select * into strict candidate from pg_proc where oid='production_control.canonical_future_submit_hole_score_v1_resource(jsonb,jsonb)'::regprocedure;
 if candidate.proowner<>original_owner or not candidate.prosecdef or candidate.proconfig<>array['search_path=pg_catalog']
  or has_function_privilege('anon',candidate.oid,'EXECUTE') or has_function_privilege('authenticated',candidate.oid,'EXECUTE')
  or has_function_privilege('service_role',candidate.oid,'EXECUTE') then
  raise exception 'CANONICAL_FUTURE_SCORING_PRIVATE_CORE_PRIVILEGE_INVALID: canonical_future_submit_hole_score_v1_resource';end if;
end;$acl$;

do $acl$ declare candidate pg_proc%rowtype;original_owner oid;
begin
 select proowner into strict original_owner from pg_proc where oid='future_production_finalize_match_v1(jsonb)'::regprocedure;
 select * into strict candidate from pg_proc where oid='production_control.canonical_future_finalize_match_v1_resource(jsonb,jsonb)'::regprocedure;
 if candidate.proowner<>original_owner or not candidate.prosecdef or candidate.proconfig<>array['search_path=pg_catalog']
  or has_function_privilege('anon',candidate.oid,'EXECUTE') or has_function_privilege('authenticated',candidate.oid,'EXECUTE')
  or has_function_privilege('service_role',candidate.oid,'EXECUTE') then
  raise exception 'CANONICAL_FUTURE_SCORING_PRIVATE_CORE_PRIVILEGE_INVALID: canonical_future_finalize_match_v1_resource';end if;
end;$acl$;

do $acl$ declare candidate pg_proc%rowtype;original_owner oid;
begin
 select proowner into strict original_owner from pg_proc where oid='future_production_reopen_match_v1(jsonb)'::regprocedure;
 select * into strict candidate from pg_proc where oid='production_control.canonical_future_reopen_match_v1_resource(jsonb,jsonb)'::regprocedure;
 if candidate.proowner<>original_owner or not candidate.prosecdef or candidate.proconfig<>array['search_path=pg_catalog']
  or has_function_privilege('anon',candidate.oid,'EXECUTE') or has_function_privilege('authenticated',candidate.oid,'EXECUTE')
  or has_function_privilege('service_role',candidate.oid,'EXECUTE') then
  raise exception 'CANONICAL_FUTURE_SCORING_PRIVATE_CORE_PRIVILEGE_INVALID: canonical_future_reopen_match_v1_resource';end if;
end;$acl$;

do $acl$ declare candidate pg_proc%rowtype;original_owner oid;
begin
 select proowner into strict original_owner from pg_proc where oid='future_production_read_scoring_authority_v1(jsonb)'::regprocedure;
 select * into strict candidate from pg_proc where oid='production_control.canonical_future_read_scoring_authority_v1_resource(jsonb,jsonb)'::regprocedure;
 if candidate.proowner<>original_owner or not candidate.prosecdef or candidate.proconfig<>array['search_path=pg_catalog']
  or has_function_privilege('anon',candidate.oid,'EXECUTE') or has_function_privilege('authenticated',candidate.oid,'EXECUTE')
  or has_function_privilege('service_role',candidate.oid,'EXECUTE') then
  raise exception 'CANONICAL_FUTURE_SCORING_PRIVATE_CORE_PRIVILEGE_INVALID: canonical_future_read_scoring_authority_v1_resource';end if;
end;$acl$;

do $acl$ declare candidate pg_proc%rowtype;original_owner oid;
begin
 select proowner into strict original_owner from pg_proc where oid='future_production_read_scoring_participant_context_v1(jsonb)'::regprocedure;
 select * into strict candidate from pg_proc where oid='production_control.canonical_future_read_scoring_participant_context_v1_resource(jsonb,jsonb)'::regprocedure;
 if candidate.proowner<>original_owner or not candidate.prosecdef or candidate.proconfig<>array['search_path=pg_catalog']
  or has_function_privilege('anon',candidate.oid,'EXECUTE') or has_function_privilege('authenticated',candidate.oid,'EXECUTE')
  or has_function_privilege('service_role',candidate.oid,'EXECUTE') then
  raise exception 'CANONICAL_FUTURE_SCORING_PRIVATE_CORE_PRIVILEGE_INVALID: canonical_future_read_scoring_participant_context_v1_resource';end if;
end;$acl$;

do $acl$ declare candidate pg_proc%rowtype;original_owner oid;
begin
 select proowner into strict original_owner from pg_proc where oid='future_production_mutate_match_control_v1(jsonb)'::regprocedure;
 select * into strict candidate from pg_proc where oid='production_control.canonical_future_mutate_match_control_v1_resource(jsonb,jsonb)'::regprocedure;
 if candidate.proowner<>original_owner or not candidate.prosecdef or candidate.proconfig<>array['search_path=pg_catalog']
  or has_function_privilege('anon',candidate.oid,'EXECUTE') or has_function_privilege('authenticated',candidate.oid,'EXECUTE')
  or has_function_privilege('service_role',candidate.oid,'EXECUTE') then
  raise exception 'CANONICAL_FUTURE_SCORING_PRIVATE_CORE_PRIVILEGE_INVALID: canonical_future_mutate_match_control_v1_resource';end if;
end;$acl$;

do $acl$ declare candidate pg_proc%rowtype;original_owner oid;
begin
 select proowner into strict original_owner from pg_proc where oid='read_production_future_participant_context_for_auth_v1(uuid,text)'::regprocedure;
 select * into strict candidate from pg_proc where oid='production_control.canonical_future_identity_for_auth_v1(uuid,text,jsonb)'::regprocedure;
 if candidate.proowner<>original_owner or not candidate.prosecdef or candidate.proconfig<>array['search_path=pg_catalog']
  or has_function_privilege('anon',candidate.oid,'EXECUTE') or has_function_privilege('authenticated',candidate.oid,'EXECUTE')
  or has_function_privilege('service_role',candidate.oid,'EXECUTE') then
  raise exception 'CANONICAL_FUTURE_SCORING_PRIVATE_CORE_PRIVILEGE_INVALID: canonical_future_identity_for_auth_v1';end if;
end;$acl$;

do $acl$ declare candidate pg_proc%rowtype;original_owner oid;
begin
 select proowner into strict original_owner from pg_proc where oid='read_production_future_participant_player_context_v1(text,text)'::regprocedure;
 select * into strict candidate from pg_proc where oid='production_control.canonical_future_identity_for_player_v1(text,text,jsonb)'::regprocedure;
 if candidate.proowner<>original_owner or not candidate.prosecdef or candidate.proconfig<>array['search_path=pg_catalog']
  or has_function_privilege('anon',candidate.oid,'EXECUTE') or has_function_privilege('authenticated',candidate.oid,'EXECUTE')
  or has_function_privilege('service_role',candidate.oid,'EXECUTE') then
  raise exception 'CANONICAL_FUTURE_SCORING_PRIVATE_CORE_PRIVILEGE_INVALID: canonical_future_identity_for_player_v1';end if;
end;$acl$;

do $acl$ declare candidate pg_proc%rowtype;original_owner oid;
begin
 select proowner into strict original_owner from pg_proc where oid='read_production_future_director_entitlement_v1(uuid,text)'::regprocedure;
 select * into strict candidate from pg_proc where oid='production_control.canonical_future_director_entitlement_v1(uuid,text,jsonb)'::regprocedure;
 if candidate.proowner<>original_owner or not candidate.prosecdef or candidate.proconfig<>array['search_path=pg_catalog']
  or has_function_privilege('anon',candidate.oid,'EXECUTE') or has_function_privilege('authenticated',candidate.oid,'EXECUTE')
  or has_function_privilege('service_role',candidate.oid,'EXECUTE') then
  raise exception 'CANONICAL_FUTURE_SCORING_PRIVATE_CORE_PRIVILEGE_INVALID: canonical_future_director_entitlement_v1';end if;
end;$acl$;

notify pgrst,'reload schema';
commit;
