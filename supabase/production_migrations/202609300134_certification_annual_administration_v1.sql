-- Shared annual CREATE/read authority, with independently admitted resource classes.
-- CLI2.56.1 scaffold 20260930175419_certification_annual_administration_v1.sql;
-- mapped to repository ordinal134. Production wrappers preserve original guards.
-- Fixed2026 governance/clone/course/audit semantics are intentionally unchanged.
begin;

create temporary table canonical_annual_original_attributes on commit drop as
select oid,pronamespace,proname,proargtypes,proowner,proacl,prosecdef,proconfig,provolatile
from pg_proc where oid in(
 'production_control.assert_annual_future_admin_scope_v1(jsonb,text,boolean,boolean)'::regprocedure,
 'public.mutate_production_future_year_administration_v1(jsonb)'::regprocedure,
 'public.read_production_future_year_administration_v1(jsonb)'::regprocedure);
do $check$ begin if encode(extensions.digest((select prosrc from pg_proc where oid='production_control.assert_annual_future_admin_scope_v1(jsonb,text,boolean,boolean)'::regprocedure),'sha256'),'hex')<>'e1e303b265c98316570f41ac740fa066a66261d87904665d51286f5467b5e6d3' then raise exception 'CERTIFICATION_ANNUAL_PREDECESSOR_MISMATCH: assert_annual_future_admin_scope_v1';end if;end; $check$;
do $check$ begin if encode(extensions.digest((select prosrc from pg_proc where oid='public.mutate_production_future_year_administration_v1(jsonb)'::regprocedure),'sha256'),'hex')<>'1814fb9ded9e13ea89351406a436db09453109354dc24e8b14cccfb12e9ba01c' then raise exception 'CERTIFICATION_ANNUAL_PREDECESSOR_MISMATCH: mutate_production_future_year_administration_v1';end if;end; $check$;
do $check$ begin if encode(extensions.digest((select prosrc from pg_proc where oid='public.read_production_future_year_administration_v1(jsonb)'::regprocedure),'sha256'),'hex')<>'aae06784a9df79f3c35b2101154e2115122bf99b358b99d6b478afa7a84e257f' then raise exception 'CERTIFICATION_ANNUAL_PREDECESSOR_MISMATCH: read_production_future_year_administration_v1';end if;end; $check$;
-- One actor implementation, called by the original Production resource guard
-- and the separately validated certification context. No new authorized role.
create function production_control.assert_canonical_annual_actor_v2(input jsonb, context jsonb, require_owner boolean)
returns void language plpgsql security definer set search_path=pg_catalog as $fn$
declare
 pointer production_control.current_tournament_pointer_v1%rowtype;
 actor_player text:=upper(btrim(coalesce(input#>>'{authorization,player_id}',input->>'actor_player_id','')));
 actor_auth uuid; owner_valid boolean:=false; director_valid boolean:=false;
begin
 if context->>'governance_tournament_id' is distinct from '2026' then
  raise exception using errcode='42501',message='CANONICAL_ANNUAL_GOVERNANCE_CONTRACT_REQUIRED'; end if;
 select * into strict pointer from production_control.current_tournament_pointer_v1
 where scope_key=context->>'resource_id';
 if pointer.tournament_id is distinct from context->>'current_tournament_id' then
  raise exception using errcode='40001',message='CANONICAL_ANNUAL_POINTER_STALE'; end if;
  begin
    actor_auth := coalesce(
      nullif(input#>>'{authorization,auth_user_id}', ''),
      nullif(input->>'actor_auth_user_id', '')
    )::uuid;
  exception when others then
    actor_auth := null;
  end;
  if actor_player !~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
     or actor_auth is null
     or input#>>'{authorization,tournament_id}'
       is distinct from pointer.tournament_id
     or input#>>'{authorization,role}' is distinct from 'DIRECTOR'
     or (input ? 'actor_player_id' and pg_catalog.upper(pg_catalog.btrim(
       input->>'actor_player_id'
     )) is distinct from actor_player)
     or (input ? 'actor_auth_user_id' and pg_catalog.lower(pg_catalog.btrim(
       input->>'actor_auth_user_id'
     )) is distinct from actor_auth::text)
     or not exists (
       select 1
       from participant_identity.user_player_links link
       where link.auth_user_id = actor_auth
         and link.player_id = actor_player
         and link.status = 'ACTIVE'
         and link.revoked_at is null
     ) then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_FUTURE_RUNTIME_DIRECTOR_REQUIRED';
  end if;
  select exists (
    select 1
    from production_control.tournament_owner_capabilities_v1 owner_value
    where owner_value.tournament_id = '2026'
      and owner_value.player_id = actor_player
      and owner_value.auth_user_id = actor_auth
      and owner_value.status = 'ACTIVE'
      and owner_value.revoked_at is null
  ) into owner_valid;
  select exists (
    select 1
    from scoring_authority.tournament_players membership
    join participant_identity.tournament_roles role_value
      on role_value.tournament_id = membership.tournament_id
     and role_value.auth_user_id = actor_auth
     and role_value.role = 'DIRECTOR'
     and role_value.role_active
     and role_value.revoked_at is null
    join production_control.director_entitlements entitlement
      on entitlement.tournament_id = membership.tournament_id
     and entitlement.auth_user_id = actor_auth
     and entitlement.player_id = membership.player_id
     and entitlement.role in ('DIRECTOR', 'OWNER')
     and entitlement.status = 'ACTIVE'
     and entitlement.revoked_at is null
    where membership.tournament_id = pointer.tournament_id
      and membership.player_id = actor_player
      and membership.participation_status = 'ACTIVE'
  ) into director_valid;
  if require_owner and not owner_valid then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_FUTURE_RUNTIME_OWNER_REQUIRED';
  end if;
  if not require_owner and not owner_valid and not director_valid then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_FUTURE_RUNTIME_DIRECTOR_REQUIRED';
  end if;
  if require_owner then
    begin
      perform production_control.assert_access_governance_owner_v1(
        '2026', actor_player, actor_auth
      );
    exception when others then
      raise exception using errcode = '42501',
        message = 'PRODUCTION_FUTURE_RUNTIME_OWNER_REQUIRED';
    end;
  end if;
exception when invalid_text_representation or numeric_value_out_of_range then
 raise exception using errcode='42501',message='PRODUCTION_FUTURE_RUNTIME_EXACT_RESOURCE_REQUIRED';
end;
$fn$;
revoke all on function production_control.assert_canonical_annual_actor_v2(jsonb,jsonb,boolean) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION production_control.assert_annual_future_admin_scope_v1(input jsonb, required_contract text, require_director boolean DEFAULT true, require_owner boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  scope production_control.resource_scope%rowtype;
  pointer production_control.current_tournament_pointer_v1%rowtype;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', input->>'actor_player_id', ''
  )));
  actor_auth uuid;
  owner_valid boolean := false;
  director_valid boolean := false;
begin
  begin
    perform production_control.assert_production_service_role();
  exception when others then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_FUTURE_RUNTIME_SERVICE_ROLE_REQUIRED';
  end;
  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  select value.* into strict scope
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if input->>'contract_version' is distinct from required_contract
     or input->>'environment' is distinct from 'PRODUCTION'
     or input->>'project_ref' is distinct from scope.project_ref
     or input->>'project_url' is distinct from scope.project_url
     or input->>'source_workbook_id' is distinct from scope.google_workbook_id
     or input->>'project_ref' ~* '(preview|staging|test)'
     or input->>'source_workbook_id' ~* '(preview|staging|test)'
     or input->>'tournament_id' is distinct from pointer.tournament_id
     or coalesce((input->>'tournament_year')::integer, -1)
       <> pointer.tournament_year
     or pointer.tournament_id !~ '^20[0-9]{2}$'
     or pointer.tournament_year <> pointer.tournament_id::integer
     or not exists (
       select 1
       from production_control.future_tournament_catalog_v1 catalog
       where catalog.tournament_id = pointer.tournament_id
         and catalog.tournament_year = pointer.tournament_year
         and catalog.lifecycle = 'ACTIVE'
         and catalog.lifecycle_revision = pointer.lifecycle_revision
     ) then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_FUTURE_RUNTIME_EXACT_RESOURCE_REQUIRED';
  end if;
  if not require_director then return; end if;
  perform production_control.assert_canonical_annual_actor_v2(input,jsonb_build_object(
    'resource_id','BAGGER_INV_PRODUCTION','governance_tournament_id','2026',
    'current_tournament_id',pointer.tournament_id),require_owner);
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_FUTURE_RUNTIME_EXACT_RESOURCE_REQUIRED';
end;
$function$
;

create function production_control.production_annual_context_v2(input jsonb, require_owner boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
declare r production_control.canonical_resource_v1%rowtype; p production_control.current_tournament_pointer_v1%rowtype;
begin
 perform production_control.assert_future_year_runtime_v1(input,require_owner);
 select * into strict r from production_control.canonical_resource_v1 where singleton;
 if r.resource_class<>'PRODUCTION' or r.resource_id<>'BAGGER_INV_PRODUCTION' then
  raise exception using errcode='42501',message='PRODUCTION_FUTURE_RUNTIME_EXACT_RESOURCE_REQUIRED'; end if;
 select * into strict p from production_control.current_tournament_pointer_v1 where scope_key=r.resource_id;
 return jsonb_build_object('resource_id',r.resource_id,'resource_class','PRODUCTION','governance_tournament_id','2026',
  'current_tournament_id',p.tournament_id,'current_tournament_year',p.tournament_year);
end;
$fn$;
create function production_control.assert_canonical_annual_context_v2(input jsonb, context jsonb, require_owner boolean)
returns void language plpgsql security definer set search_path=pg_catalog as $fn$
declare live jsonb;
begin
 if context->>'resource_class'='PRODUCTION' then
  live:=production_control.production_annual_context_v2(input,require_owner);
  if live is distinct from context then raise exception using errcode='40001',message='CANONICAL_ANNUAL_POINTER_STALE';end if;
  return;
 end if;
 live:=production_control.current_certification_context_v1();
 if live is distinct from context or context->>'resource_class' is distinct from 'CERTIFICATION'
   or context->>'phase' is distinct from 'ANNUAL'
   or context->>'governance_tournament_id' is distinct from '2026'
   or input->>'environment' is distinct from 'CERTIFICATION'
   or input->>'contract_version' is distinct from 'production-future-year-administration-v1'
   or input->>'tournament_id' is distinct from context->>'current_tournament_id'
   or input->>'tournament_year' is distinct from context->>'current_tournament_year'
   or input->'authorization' is distinct from context->'authorization' then
  raise exception using errcode='42501',message='CANONICAL_ANNUAL_CONTEXT_REQUIRED'; end if;
 perform production_control.assert_canonical_annual_actor_v2(input,context,require_owner);
end;
$fn$;
revoke all on function production_control.production_annual_context_v2(jsonb,boolean),production_control.assert_canonical_annual_context_v2(jsonb,jsonb,boolean) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION production_control.canonical_mutate_future_year_administration_v2(input jsonb, context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority'
AS $function$
declare
  action_value text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input->>'operation', input->>'action', ''
  )));
  target_id text := pg_catalog.btrim(coalesce(
    input->>'target_tournament_id', ''
  ));
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', ''
  )));
  actor_auth uuid;
  operation_request uuid;
  receipt_uuid uuid := extensions.gen_random_uuid();
  expected_revision bigint;
  current_revision bigint;
  next_revision bigint;
  declared_hash text := pg_catalog.lower(coalesce(
    input->>'request_payload_hash', ''
  ));
  database_hash text;
  reason_value text := pg_catalog.btrim(coalesce(input->>'reason', ''));
  receipt production_control.future_year_operation_receipts_v1%rowtype;
  tournament_value production_control.future_tournament_catalog_v1%rowtype;
  response_value jsonb;
  readiness_value jsonb;
  safe_metadata jsonb := '{}'::jsonb;
  target_kind text := 'TOURNAMENT';
  audit_target text;
  creation_mode text;
  clone_source text;
  tournament_year integer;
  name_value text;
  destination_value text;
  start_value date;
  end_value date;
  timezone_value text;
  item jsonb;
  item_player text;
  item_team text;
  item_side integer;
  target_team text;
  target_side integer;
  target_round integer;
  target_format text;
  team_size_value integer;
  points_value numeric;
  allowance_value numeric;
  target_course text;
  target_tee text;
  source_setup bigint;
  match_count_value integer;
  generated_count integer := 0;
  summary_value text;
begin
  perform production_control.assert_canonical_annual_context_v2(
    input, context, action_value in ('CREATE_TOURNAMENT', 'MARK_READY')
  );
  if action_value in ('ACTIVATE_TOURNAMENT', 'ACTIVATE') then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'FUTURE_TOURNAMENT_ACTIVATION_NOT_INSTALLED'
    );
  elsif action_value in ('CLOSE_TOURNAMENT', 'CLOSE') then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'FUTURE_TOURNAMENT_CLOSE_NOT_INSTALLED'
    );
  elsif action_value in ('ARCHIVE_TOURNAMENT', 'ARCHIVE') then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'FUTURE_TOURNAMENT_ARCHIVE_NOT_INSTALLED'
    );
  elsif action_value in ('CREATE_COURSE', 'ADD_COURSE') then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'GLOBAL_COURSE_CREATION_NOT_INSTALLED'
    );
  end if;
  if action_value not in (
       'CREATE_TOURNAMENT', 'UPDATE_TOURNAMENT', 'CONFIGURE_TEAM',
       'REPLACE_ROSTER', 'CONFIGURE_ROUND', 'ASSIGN_COURSE',
       'GENERATE_MATCH_STRUCTURE', 'MARK_READY'
     )
     or target_id !~ '^[0-9]{4}$'
     or coalesce(input->>'operation_request_id', '')
       !~ '^[0-9a-fA-F-]{36}$'
     or declared_hash !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'expected_revision', '') !~ '^[0-9]+$' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PRODUCTION_FUTURE_YEAR_INPUT_INVALID'
    );
  end if;
  begin
    actor_auth := (input#>>'{authorization,auth_user_id}')::uuid;
    operation_request := (input->>'operation_request_id')::uuid;
    expected_revision := (input->>'expected_revision')::bigint;
  exception when others then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PRODUCTION_FUTURE_YEAR_INPUT_INVALID'
    );
  end;
  perform production_control.assert_access_governance_safe_reason_v1(
    reason_value
  );
  database_hash := production_control.future_year_hash_v1(
    input - 'request_payload_hash'
  );
  select value.* into receipt
  from production_control.future_year_operation_receipts_v1 value
  where value.target_tournament_id = target_id
    and value.action = action_value
    and value.operation_request_id = operation_request;
  if found then
    if receipt.declared_request_payload_hash = declared_hash
       and receipt.database_request_payload_hash = database_hash then
      return receipt.response || pg_catalog.jsonb_build_object(
        'idempotent', true
      );
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PRODUCTION_FUTURE_YEAR_IDEMPOTENCY_CONFLICT'
    );
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'production-future-year-administration-v1:' || target_id, 0
  ));
  select value.* into receipt
  from production_control.future_year_operation_receipts_v1 value
  where value.target_tournament_id = target_id
    and value.action = action_value
    and value.operation_request_id = operation_request;
  if found then
    if receipt.declared_request_payload_hash = declared_hash
       and receipt.database_request_payload_hash = database_hash then
      return receipt.response || pg_catalog.jsonb_build_object(
        'idempotent', true
      );
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PRODUCTION_FUTURE_YEAR_IDEMPOTENCY_CONFLICT'
    );
  end if;

  if action_value = 'CREATE_TOURNAMENT' then
    if expected_revision <> 0 or target_id = '2026'
       or exists (
         select 1
         from production_control.future_tournament_catalog_v1 value
         where value.tournament_id = target_id
       ) then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'FUTURE_TOURNAMENT_CREATE_PREDECESSOR_INVALID'
      );
    end if;
    begin
      -- Annual CREATE v1: tournament_year is current authorization scope.
      -- The future year is explicit target metadata, never a scope override.
      if pg_catalog.jsonb_typeof(input->'target_tournament_year') is distinct from 'number'
         or coalesce(input->>'target_tournament_year', '') !~ '^[0-9]{4}$' then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'code', 'FUTURE_TOURNAMENT_METADATA_INVALID'
        );
      end if;
      tournament_year := (input->>'target_tournament_year')::integer;
      start_value := nullif(input->>'start_date', '')::date;
      end_value := nullif(input->>'end_date', '')::date;
    exception when others then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'FUTURE_TOURNAMENT_METADATA_INVALID'
      );
    end;
    name_value := pg_catalog.btrim(coalesce(
      input->>'tournament_name', ''
    ));
    destination_value := nullif(pg_catalog.btrim(coalesce(
      input->>'destination', ''
    )), '');
    timezone_value := nullif(pg_catalog.btrim(coalesce(
      input->>'time_zone', input->>'timezone', ''
    )), '');
    creation_mode := pg_catalog.upper(pg_catalog.btrim(coalesce(
      input->>'creation_mode', 'BLANK'
    )));
    clone_source := nullif(pg_catalog.btrim(coalesce(
      input->>'clone_source_tournament_id', ''
    )), '');
    if tournament_year <= (input->>'tournament_year')::integer
       or tournament_year > 2200 or target_id <> tournament_year::text
       or name_value = '' or pg_catalog.length(name_value) > 180
       or destination_value is null or start_value is null or end_value is null
       or start_value > end_value or timezone_value is null
       or not exists (
         select 1 from pg_catalog.pg_timezone_names zone
         where zone.name = timezone_value
       )
       or creation_mode not in ('BLANK', 'CLONE_STRUCTURE')
       or (creation_mode = 'CLONE_STRUCTURE' and clone_source <> '2026')
       or (creation_mode = 'BLANK' and clone_source is not null) then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'FUTURE_TOURNAMENT_METADATA_INVALID'
      );
    end if;
    insert into production_control.future_tournament_catalog_v1 (
      tournament_id, tournament_year, contract_version, tournament_name,
      destination, start_date, end_date, timezone, lifecycle,
      lifecycle_revision, setup_revision, creation_mode,
      clone_source_tournament_id, created_by_player_id,
      created_by_auth_user_id, updated_by_player_id,
      updated_by_auth_user_id, source_manifest
    ) values (
      target_id, tournament_year,
      'production-future-year-administration-v1', name_value,
      destination_value, start_value, end_value, timezone_value, 'DRAFT',
      1, 1, creation_mode, clone_source, actor_player, actor_auth,
      actor_player, actor_auth, pg_catalog.jsonb_build_object(
        'cloneContractVersion', case when creation_mode = 'CLONE_STRUCTURE'
          then 'production-future-structure-clone-v1' else null end,
        'allowlistedDomains', case when creation_mode = 'CLONE_STRUCTURE'
          then pg_catalog.jsonb_build_array('TEAMS', 'ROUNDS',
            'COURSE_REFERENCES') else '[]'::jsonb end,
        'forbiddenFactsCopied', false
      )
    );
    insert into production_control.future_tournament_resources_v1 (
      tournament_id, project_ref, project_url, source_workbook_id,
      resource_status, resource_revision, google_compatibility_policy,
      updated_by_player_id
    )
    select target_id, scope.project_ref, scope.project_url, scope.provenance_id,
      'CURRENT_RESOURCE_BOUND', 1, 'RETIRED', actor_player
    from production_control.canonical_resource_v1 scope
    where scope.resource_id = context->>'resource_id';
    if creation_mode = 'CLONE_STRUCTURE' then
      insert into production_control.future_tournament_teams_v1 (
        tournament_id, team_id, team_side, team_name, captain_player_id,
        active, setup_revision, updated_by_player_id
      )
      select target_id, team.team_id, team.team_side, team.name, null,
        true, 1, actor_player
      from scoring_authority.teams team
      where team.tournament_id = '2026';
      insert into production_control.future_tournament_rounds_v1 (
        tournament_id, round_number, round_name, format, team_size,
        points_available, handicap_allowance, setup_revision,
        updated_by_player_id
      )
      select target_id, round_value.round_number, round_value.name,
        round_value.format,
        case when round_value.format = 'SI' then 1 else 2 end,
        coalesce(detail.points_available, 0),
        coalesce(round_value.handicap_allowance, 1), 1, actor_player
      from scoring_authority.rounds round_value
      left join scoring_authority.tournament_setup_round_details_v1 detail
        on detail.tournament_id = round_value.tournament_id
       and detail.round_number = round_value.round_number
      where round_value.tournament_id = '2026';
      insert into production_control.future_tournament_course_references_v1 (
        tournament_id, round_number, course_id, tee_id,
        source_tournament_id, source_round_number, source_setup_revision,
        setup_revision, updated_by_player_id
      )
      select target_id, assignment.round_number, assignment.course_id,
        assignment.tee_id, '2026', assignment.round_number,
        assignment.setup_revision, 1, actor_player
      from scoring_authority.tournament_setup_round_courses_v1 assignment
      where assignment.tournament_id = '2026'
        and exists (
          select 1
          from production_control.future_tournament_rounds_v1 target_round_value
          where target_round_value.tournament_id = target_id
            and target_round_value.round_number = assignment.round_number
        );
    end if;
    current_revision := 0;
    next_revision := 1;
    target_kind := 'TOURNAMENT';
    audit_target := target_id;
    summary_value := case when creation_mode = 'CLONE_STRUCTURE'
      then 'Future tournament Draft created from an allowlisted structure clone.'
      else 'Blank future tournament Draft created.' end;
    safe_metadata := pg_catalog.jsonb_build_object(
      'summary', summary_value, 'creationMode', creation_mode,
      'forbiddenFactsCopied', false, 'scoringFactsCreated', false,
      'membershipCopied', false, 'identityCopied', false
    );
  else
    select value.* into tournament_value
    from production_control.future_tournament_catalog_v1 value
    where value.tournament_id = target_id
    for update;
    if tournament_value.tournament_id is null then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'FUTURE_TOURNAMENT_NOT_FOUND'
      );
    end if;
    if tournament_value.lifecycle not in ('DRAFT', 'CONFIGURING')
       or target_id = '2026' then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'FUTURE_TOURNAMENT_STRUCTURE_LOCKED'
      );
    end if;
    current_revision := tournament_value.setup_revision;
    if expected_revision <> current_revision then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'FUTURE_TOURNAMENT_REVISION_STALE',
        'expectedRevision', current_revision
      );
    end if;
    next_revision := current_revision + 1;

    if action_value = 'UPDATE_TOURNAMENT' then
      begin
        start_value := nullif(input->>'start_date', '')::date;
        end_value := nullif(input->>'end_date', '')::date;
      exception when others then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'code', 'FUTURE_TOURNAMENT_METADATA_INVALID'
        );
      end;
      name_value := pg_catalog.btrim(coalesce(
        input->>'tournament_name', ''
      ));
      destination_value := nullif(pg_catalog.btrim(coalesce(
        input->>'destination', ''
      )), '');
      timezone_value := nullif(pg_catalog.btrim(coalesce(
        input->>'time_zone', input->>'timezone', ''
      )), '');
      if name_value = '' or destination_value is null
         or start_value is null or end_value is null or start_value > end_value
         or timezone_value is null or not exists (
           select 1 from pg_catalog.pg_timezone_names zone
           where zone.name = timezone_value
         ) then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'code', 'FUTURE_TOURNAMENT_METADATA_INVALID'
        );
      end if;
      update production_control.future_tournament_catalog_v1 value set
        tournament_name = name_value,
        destination = destination_value,
        start_date = start_value, end_date = end_value,
        timezone = timezone_value
      where value.tournament_id = target_id;
      target_kind := 'TOURNAMENT';
      audit_target := target_id;
      summary_value := 'Future tournament operational details updated.';
    elsif action_value = 'CONFIGURE_TEAM' then
      target_team := pg_catalog.upper(pg_catalog.btrim(coalesce(
        input->>'team_id', ''
      )));
      name_value := pg_catalog.btrim(coalesce(input->>'team_name', ''));
      begin
        target_side := (input->>'team_side')::integer;
      exception when others then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'code', 'FUTURE_TEAM_INPUT_INVALID'
        );
      end;
      item_player := nullif(pg_catalog.upper(pg_catalog.btrim(coalesce(
        input->>'captain_player_id', ''
      ))), '');
      if target_team !~ '^[A-Z0-9][A-Z0-9_-]{0,31}$'
         or target_side not in (1, 2) or name_value = '' then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'code', 'FUTURE_TEAM_CAPTAIN_OR_INPUT_INVALID'
        );
      end if;
      if exists (
        select 1 from production_control.future_tournament_teams_v1 team
        where team.tournament_id = target_id and team.team_id = target_team
          and team.team_side <> target_side
      ) then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'code', 'FUTURE_TEAM_SIDE_IMMUTABLE'
        );
      end if;
      if exists (
        select 1 from production_control.future_tournament_teams_v1 team
        where team.tournament_id = target_id
          and team.team_side = target_side and team.team_id <> target_team
      ) then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'code', 'FUTURE_TEAM_SIDE_ALREADY_ASSIGNED'
        );
      end if;
      if item_player is not null and not exists (
        select 1 from production_control.future_tournament_roster_v1 roster
        where roster.tournament_id = target_id
          and roster.player_id = item_player
          and roster.team_id = target_team
          and roster.team_side = target_side
          and roster.participation_status = 'ACTIVE'
      ) then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'code', 'FUTURE_TEAM_CAPTAIN_OR_INPUT_INVALID'
        );
      end if;
      insert into production_control.future_tournament_teams_v1 (
        tournament_id, team_id, team_side, team_name, captain_player_id,
        active, setup_revision, updated_by_player_id
      ) values (
        target_id, target_team, target_side, name_value, item_player,
        coalesce((input->>'active')::boolean, true),
        next_revision, actor_player
      ) on conflict (tournament_id, team_id) do update set
        team_side = excluded.team_side, team_name = excluded.team_name,
        captain_player_id = excluded.captain_player_id,
        active = excluded.active, setup_revision = excluded.setup_revision,
        updated_by_player_id = excluded.updated_by_player_id,
        updated_at = pg_catalog.clock_timestamp();
      target_kind := 'TEAM';
      audit_target := target_team;
      summary_value := 'Future tournament team configuration updated.';
    elsif action_value = 'REPLACE_ROSTER' then
      if pg_catalog.jsonb_typeof(input->'roster') is distinct from 'array'
         or pg_catalog.jsonb_array_length(input->'roster') > 200
         or exists (
           select 1 from (
             select pg_catalog.upper(pg_catalog.btrim(value->>'player_id')) id,
               pg_catalog.count(*)
             from pg_catalog.jsonb_array_elements(input->'roster') value
             group by 1 having pg_catalog.count(*) > 1
           ) duplicate
         ) then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'code', 'FUTURE_ROSTER_INPUT_INVALID'
        );
      end if;
      for item in select value
        from pg_catalog.jsonb_array_elements(input->'roster') value
      loop
        item_player := pg_catalog.upper(pg_catalog.btrim(coalesce(
          item->>'player_id', ''
        )));
        item_team := nullif(pg_catalog.upper(pg_catalog.btrim(coalesce(
          item->>'team_id', ''
        ))), '');
        if item_player !~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
           or not exists (
             select 1 from scoring_authority.players player
             where player.player_id = item_player
               and production_control.access_governance_global_status_v1(
                 player.player_id
               ) = 'ACTIVE'
           )
           or pg_catalog.upper(pg_catalog.btrim(coalesce(
             item->>'participation_status', 'ACTIVE'
           ))) not in ('ACTIVE', 'INACTIVE', 'WITHDRAWN') then
          return pg_catalog.jsonb_build_object(
            'ok', false, 'code', 'FUTURE_ROSTER_PLAYER_INVALID'
          );
        end if;
        if item_team is not null then
          select team.team_side into item_side
          from production_control.future_tournament_teams_v1 team
          where team.tournament_id = target_id
            and team.team_id = item_team and team.active;
          if item_side is null
             or (item ? 'team_side'
               and (item->>'team_side')::integer <> item_side) then
            return pg_catalog.jsonb_build_object(
              'ok', false, 'code', 'FUTURE_ROSTER_TEAM_INVALID'
            );
          end if;
        else
          item_side := null;
        end if;
      end loop;
      delete from production_control.future_tournament_roster_v1 roster
      where roster.tournament_id = target_id;
      for item in select value
        from pg_catalog.jsonb_array_elements(input->'roster') value
      loop
        item_player := pg_catalog.upper(pg_catalog.btrim(item->>'player_id'));
        item_team := nullif(pg_catalog.upper(pg_catalog.btrim(coalesce(
          item->>'team_id', ''
        ))), '');
        select team.team_side into item_side
        from production_control.future_tournament_teams_v1 team
        where team.tournament_id = target_id and team.team_id = item_team;
        insert into production_control.future_tournament_roster_v1 (
          tournament_id, player_id, team_id, team_side,
          participation_status, setup_revision, updated_by_player_id
        ) values (
          target_id, item_player, item_team, item_side,
          pg_catalog.upper(pg_catalog.btrim(coalesce(
            item->>'participation_status', 'ACTIVE'
          ))), next_revision, actor_player
        );
      end loop;
      target_kind := 'ROSTER';
      audit_target := target_id;
      summary_value := 'Future tournament roster selection replaced atomically.';
      safe_metadata := pg_catalog.jsonb_build_object(
        'rosterCount', pg_catalog.jsonb_array_length(input->'roster'),
        'identityCopied', false, 'authUsersCreated', false
      );
    elsif action_value = 'CONFIGURE_ROUND' then
      begin
        target_round := (input->>'round_number')::integer;
        team_size_value := (input->>'team_size')::integer;
        points_value := (input->>'points_available')::numeric;
        allowance_value := (input->>'handicap_allowance')::numeric;
      exception when others then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'code', 'FUTURE_ROUND_INPUT_INVALID'
        );
      end;
      target_format := pg_catalog.upper(pg_catalog.btrim(coalesce(
        input->>'format', ''
      )));
      name_value := pg_catalog.btrim(coalesce(input->>'round_name', ''));
      if target_round not between 1 and 99
         or target_format not in ('BB', 'SC', 'SI')
         or name_value = '' or points_value < 0
         or allowance_value < 0 or allowance_value > 1
         or (target_format in ('BB', 'SC') and team_size_value <> 2)
         or (target_format = 'SI' and team_size_value <> 1) then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'code', 'FUTURE_ROUND_INPUT_INVALID'
        );
      end if;
      if exists (
        select 1
        from production_control.future_match_definitions_v1 match_value
        join production_control.future_tournament_rounds_v1 round_value
          on round_value.tournament_id = match_value.tournament_id
         and round_value.round_number = match_value.round_number
        where match_value.tournament_id = target_id
          and match_value.round_number = target_round
          and (round_value.format is distinct from target_format
            or round_value.team_size is distinct from team_size_value)
      ) then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'code', 'FUTURE_ROUND_MATCH_STRUCTURE_LOCKED'
        );
      end if;
      insert into production_control.future_tournament_rounds_v1 (
        tournament_id, round_number, round_name, format, team_size,
        points_available, handicap_allowance, setup_revision,
        updated_by_player_id
      ) values (
        target_id, target_round, name_value, target_format,
        team_size_value, points_value, allowance_value,
        next_revision, actor_player
      ) on conflict (tournament_id, round_number) do update set
        round_name = excluded.round_name, format = excluded.format,
        team_size = excluded.team_size,
        points_available = excluded.points_available,
        handicap_allowance = excluded.handicap_allowance,
        setup_revision = excluded.setup_revision,
        updated_by_player_id = excluded.updated_by_player_id,
        updated_at = pg_catalog.clock_timestamp();
      target_kind := 'ROUND';
      audit_target := target_id || ':R' || target_round::text;
      summary_value := 'Future tournament round configuration updated.';
    elsif action_value = 'ASSIGN_COURSE' then
      begin
        target_round := (input->>'round_number')::integer;
      exception when others then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'code', 'FUTURE_COURSE_REFERENCE_INVALID'
        );
      end;
      target_course := pg_catalog.btrim(coalesce(input->>'course_id', ''));
      target_tee := pg_catalog.btrim(coalesce(input->>'tee', ''));
      begin
        item_side := nullif(input->>'source_round_number', '')::integer;
      exception when others then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'code', 'FUTURE_COURSE_REFERENCE_INVALID'
        );
      end;
      if coalesce(input->>'source_tournament_id', '2026') <> '2026'
         or target_course !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$'
         or target_tee = '' or not exists (
           select 1
           from production_control.future_tournament_rounds_v1 round_value
           where round_value.tournament_id = target_id
             and round_value.round_number = target_round
         ) then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'code', 'FUTURE_COURSE_REFERENCE_INVALID'
        );
      end if;
      select tee.setup_revision into source_setup
      from scoring_authority.tournament_setup_course_tees_v1 tee
      where tee.tournament_id = '2026' and tee.course_id = target_course
        and tee.tee_id = target_tee
        and (item_side is null or exists (
          select 1
          from scoring_authority.tournament_setup_round_courses_v1 assignment
          where assignment.tournament_id = '2026'
            and assignment.round_number = item_side
            and assignment.course_id = tee.course_id
            and assignment.tee_id = tee.tee_id
        ));
      if source_setup is null or (
        select pg_catalog.count(*)
        from scoring_authority.tournament_setup_course_holes_v1 hole
        where hole.tournament_id = '2026'
          and hole.course_id = target_course and hole.tee_id = target_tee
      ) <> 18 then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'code', 'FUTURE_EXISTING_COURSE_TEE_REQUIRED'
        );
      end if;
      insert into production_control.future_tournament_course_references_v1 (
        tournament_id, round_number, course_id, tee_id,
        source_tournament_id, source_round_number, source_setup_revision,
        setup_revision, updated_by_player_id
      ) values (
        target_id, target_round, target_course, target_tee,
        '2026', item_side, source_setup, next_revision, actor_player
      ) on conflict (tournament_id, round_number) do update set
        course_id = excluded.course_id, tee_id = excluded.tee_id,
        source_tournament_id = excluded.source_tournament_id,
        source_round_number = excluded.source_round_number,
        source_setup_revision = excluded.source_setup_revision,
        setup_revision = excluded.setup_revision,
        updated_by_player_id = excluded.updated_by_player_id,
        updated_at = pg_catalog.clock_timestamp();
      target_kind := 'COURSE_REFERENCE';
      audit_target := target_id || ':R' || target_round::text;
      summary_value := 'Existing certified course and tee referenced for a future round.';
    elsif action_value = 'GENERATE_MATCH_STRUCTURE' then
      begin
        target_round := (input->>'round_number')::integer;
        match_count_value := (input->>'match_count')::integer;
      exception when others then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'code', 'FUTURE_MATCH_STRUCTURE_INPUT_INVALID'
        );
      end;
      select round_value.format into target_format
      from production_control.future_tournament_rounds_v1 round_value
      where round_value.tournament_id = target_id
        and round_value.round_number = target_round;
      if target_format is null or match_count_value not between 1 and 99 then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'code', 'FUTURE_MATCH_STRUCTURE_INPUT_INVALID'
        );
      end if;
      if exists (
        select 1 from production_control.future_match_definitions_v1 match_value
        where match_value.tournament_id = target_id
          and match_value.round_number = target_round
      ) then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'code', 'FUTURE_MATCH_STRUCTURE_ALREADY_GENERATED'
        );
      end if;
      insert into production_control.future_match_definitions_v1 (
        tournament_id, match_id, round_number, match_number, format, team_size,
        setup_revision, created_by_player_id
      )
      select target_id,
        target_id || '-R' || target_round::text || '-' || sequence::text,
        target_round, sequence, target_format,
        (select round_value.team_size
         from production_control.future_tournament_rounds_v1 round_value
         where round_value.tournament_id = target_id
           and round_value.round_number = target_round),
        next_revision, actor_player
      from pg_catalog.generate_series(1, match_count_value) sequence;
      get diagnostics generated_count = row_count;
      -- Google runtime retired: external delivery is not canonical authority.
      target_kind := 'MATCH_STRUCTURE';
      audit_target := target_id || ':R' || target_round::text;
      summary_value := 'Empty future match structure generated without scoring facts.';
      safe_metadata := pg_catalog.jsonb_build_object(
        'matchDefinitionCount', generated_count,
        'runtimeMatchesCreated', false, 'snapshotsCreated', false,
        'scoringAccessCreated', false,
        'googleWriterInvoked', false
      );
    elsif action_value = 'MARK_READY' then
      readiness_value := production_control.future_year_readiness_v1(target_id);
      if not coalesce((readiness_value->>'readyForActivation')::boolean, false)
      then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'code', 'FUTURE_TOURNAMENT_NOT_READY',
          'readiness', readiness_value
        );
      end if;
      update production_control.future_tournament_catalog_v1 value set
        lifecycle = 'READY_FOR_ACTIVATION',
        lifecycle_revision = value.lifecycle_revision + 1,
        readiness_fingerprint = readiness_value->>'fingerprint',
        readiness_setup_revision = value.setup_revision
      where value.tournament_id = target_id;
      target_kind := 'READINESS';
      audit_target := target_id;
      summary_value := 'Future tournament marked Ready for Activation.';
    end if;

    update production_control.future_tournament_catalog_v1 value set
      lifecycle = case
        when action_value = 'MARK_READY' then value.lifecycle
        when value.lifecycle = 'DRAFT' then 'CONFIGURING'
        else value.lifecycle end,
      setup_revision = next_revision,
      readiness_fingerprint = case when action_value = 'MARK_READY'
        then value.readiness_fingerprint else null end,
      readiness_setup_revision = case when action_value = 'MARK_READY'
        then value.readiness_setup_revision else null end,
      updated_by_player_id = actor_player,
      updated_by_auth_user_id = actor_auth,
      updated_at = pg_catalog.clock_timestamp()
    where value.tournament_id = target_id;
  end if;

  readiness_value := production_control.future_year_readiness_v1(target_id);
  safe_metadata := safe_metadata || pg_catalog.jsonb_build_object(
    'summary', summary_value,
    'authorityChanged', false, 'currentPointerChanged', false,
    'tournamentFactsChanged', false
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_FUTURE_YEAR_' || action_value || '_COMPLETED',
    'operation', action_value, 'idempotent', false,
    'target_tournament_id', target_id,
    'revision', next_revision,
    'receipt_id', receipt_uuid,
    'lifecycle', (
      select value.lifecycle
      from production_control.future_tournament_catalog_v1 value
      where value.tournament_id = target_id
    ),
    'readiness', readiness_value
  );
  insert into production_control.future_year_audit_events_v1 (
    provenance_tournament_id, target_tournament_id, action,
    target_kind, target_id, actor_player_id, actor_auth_user_id,
    operation_request_id, prior_revision, next_revision,
    result, safe_metadata
  ) values (
    '2026', target_id, action_value, target_kind,
    coalesce(audit_target, target_id), actor_player, actor_auth,
    operation_request, current_revision, next_revision,
    'CHANGED', safe_metadata
  );
  insert into production_control.future_year_operation_receipts_v1 (
    receipt_id, provenance_tournament_id, target_tournament_id, action,
    operation_request_id, declared_request_payload_hash,
    database_request_payload_hash, actor_player_id, actor_auth_user_id,
    prior_revision, next_revision, response
  ) values (
    receipt_uuid, '2026', target_id, action_value, operation_request,
    declared_hash, database_hash, actor_player, actor_auth,
    current_revision, next_revision, response_value
  );
  return response_value;
end;
$function$
;
CREATE OR REPLACE FUNCTION production_control.canonical_read_future_year_administration_v2(input jsonb, context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority'
AS $function$
declare
  selected_id text := nullif(pg_catalog.btrim(coalesce(
    input->>'target_tournament_id', ''
  )), '');
  selected_value production_control.future_tournament_catalog_v1%rowtype;
  pointer_value production_control.current_tournament_pointer_v1%rowtype;
  catalog_value jsonb;
  selected_json jsonb;
  teams_value jsonb;
  roster_value jsonb;
  rounds_value jsonb;
  courses_value jsonb;
  matches_value jsonb;
  jobs_value jsonb;
  players_value jsonb;
  library_value jsonb;
  audit_value jsonb;
  readiness_value jsonb;
  editable boolean;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', ''
  )));
  actor_auth uuid;
  actor_is_owner boolean := false;
begin
  perform production_control.assert_canonical_annual_context_v2(input, context, false);
  if input->>'operation'
       is distinct from 'READ_PRODUCTION_FUTURE_YEAR_ADMINISTRATION_V1'
     or (selected_id is not null and (
       selected_id !~ '^[0-9]{4}$' or selected_id = '2026'
     )) then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_FUTURE_YEAR_READ_INPUT_INVALID';
  end if;
  select value.* into strict pointer_value
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = context->>'resource_id';
  actor_auth := (input#>>'{authorization,auth_user_id}')::uuid;
  actor_is_owner := exists (
    select 1
    from production_control.tournament_owner_capabilities_v1 owner_value
    where owner_value.tournament_id = '2026'
      and owner_value.player_id = actor_player
      and owner_value.auth_user_id = actor_auth
      and owner_value.status = 'ACTIVE'
      and owner_value.revoked_at is null
  );
  select value.* into selected_value
  from production_control.future_tournament_catalog_v1 value
  where value.tournament_id = selected_id;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'tournamentId', value.tournament_id,
    'tournamentYear', value.tournament_year,
    'name', value.tournament_name,
    'lifecycle', value.lifecycle,
    'setupRevision', value.setup_revision,
    'lifecycleRevision', value.lifecycle_revision,
    'creationMode', value.creation_mode,
    'cloneSourceTournamentId', value.clone_source_tournament_id,
    'isCurrent', value.tournament_id = pointer_value.tournament_id
  ) order by value.tournament_year), '[]'::jsonb)
  into catalog_value
  from production_control.future_tournament_catalog_v1 value;

  if selected_value.tournament_id is null then
    selected_json := null;
    teams_value := '[]'::jsonb;
    roster_value := '[]'::jsonb;
    rounds_value := '[]'::jsonb;
    courses_value := '[]'::jsonb;
    matches_value := '[]'::jsonb;
    jobs_value := '[]'::jsonb;
    readiness_value := production_control.future_year_readiness_v1(selected_id);
    editable := false;
  else
    editable := selected_value.lifecycle in ('DRAFT', 'CONFIGURING');
    selected_json := pg_catalog.jsonb_build_object(
      'tournamentId', selected_value.tournament_id,
      'tournamentYear', selected_value.tournament_year,
      'name', selected_value.tournament_name,
      'destination', selected_value.destination,
      'startDate', selected_value.start_date,
      'endDate', selected_value.end_date,
      'timezone', selected_value.timezone,
      'lifecycle', selected_value.lifecycle,
      'lifecycleRevision', selected_value.lifecycle_revision,
      'setupRevision', selected_value.setup_revision,
      'creationMode', selected_value.creation_mode,
      'cloneSourceTournamentId', selected_value.clone_source_tournament_id,
      'readinessFingerprint', selected_value.readiness_fingerprint,
      'readinessSetupRevision', selected_value.readiness_setup_revision,
      'isCurrent', selected_value.tournament_id = pointer_value.tournament_id
    );
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'teamId', team.team_id, 'teamSide', team.team_side,
      'name', team.team_name,
      'captainPlayerId', team.captain_player_id,
      'captainName', captain.display_name,
      'active', team.active, 'setupRevision', team.setup_revision
    ) order by team.team_side), '[]'::jsonb) into teams_value
    from production_control.future_tournament_teams_v1 team
    left join scoring_authority.players captain
      on captain.player_id = team.captain_player_id
    where team.tournament_id = selected_id;
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'playerId', roster.player_id, 'displayName', player.display_name,
      'teamId', roster.team_id, 'teamSide', roster.team_side,
      'participationStatus', roster.participation_status,
      'setupRevision', roster.setup_revision
    ) order by player.display_name, roster.player_id), '[]'::jsonb)
    into roster_value
    from production_control.future_tournament_roster_v1 roster
    join scoring_authority.players player on player.player_id = roster.player_id
    where roster.tournament_id = selected_id;
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'roundNumber', round_value.round_number,
      'name', round_value.round_name, 'format', round_value.format,
      'teamSize', round_value.team_size,
      'pointsAvailable', round_value.points_available::text,
      'handicapAllowance', round_value.handicap_allowance::text,
      'setupRevision', round_value.setup_revision
    ) order by round_value.round_number), '[]'::jsonb) into rounds_value
    from production_control.future_tournament_rounds_v1 round_value
    where round_value.tournament_id = selected_id;
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'roundNumber', course.round_number, 'courseId', course.course_id,
      'tee', course.tee_id,
      'sourceTournamentId', course.source_tournament_id,
      'sourceRoundNumber', course.source_round_number,
      'sourceSetupRevision', course.source_setup_revision,
      'referenceStatus', course.reference_status,
      'setupRevision', course.setup_revision
    ) order by course.round_number), '[]'::jsonb) into courses_value
    from production_control.future_tournament_course_references_v1 course
    where course.tournament_id = selected_id;
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'matchDefinitionId', match_value.match_definition_id,
      'matchId', match_value.match_id,
      'roundNumber', match_value.round_number,
      'matchNumber', match_value.match_number,
      'format', match_value.format, 'teamSize', match_value.team_size,
      'lifecycle', match_value.lifecycle,
      'hasRuntimeMatch', false, 'hasScoringSnapshot', false,
      'hasScoringAccess', false, 'setupRevision', match_value.setup_revision
    ) order by match_value.round_number, match_value.match_number), '[]'::jsonb)
    into matches_value
    from production_control.future_match_definitions_v1 match_value
    where match_value.tournament_id = selected_id;
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'jobId', job.job_id, 'matchId', job.match_id,
      'requirementClass', job.requirement_class, 'status', job.status,
      'writerInstalled', false, 'safeErrorCode', job.safe_error_code
    ) order by job.match_id), '[]'::jsonb) into jobs_value
    from production_control.future_match_google_compatibility_jobs_v1 job
    where job.tournament_id = selected_id;
    readiness_value := production_control.future_year_readiness_v1(selected_id);
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'playerId', player.player_id, 'displayName', player.display_name,
    'globalStatus', production_control.access_governance_global_status_v1(
      player.player_id
    )
  ) order by player.display_name, player.player_id), '[]'::jsonb)
  into players_value from scoring_authority.players player;

  -- Only current certified course/tee contexts with all 18 holes are
  -- assignable. Historical identities alone do not prove scoring context.
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'courseId', candidate.course_id, 'name', candidate.course_name,
    'location', candidate.location, 'tees', candidate.tees,
    'assignable', true
  ) order by candidate.course_name, candidate.course_id), '[]'::jsonb)
  into library_value
  from (
    select tee.course_id, pg_catalog.min(tee.display_name) as course_name,
      pg_catalog.min(tee.location) as location,
      pg_catalog.jsonb_agg(tee.tee_id order by tee.tee_id) as tees
    from scoring_authority.tournament_setup_course_tees_v1 tee
    where tee.tournament_id = '2026'
      and (
        select pg_catalog.count(*)
        from scoring_authority.tournament_setup_course_holes_v1 hole
        where hole.tournament_id = tee.tournament_id
          and hole.course_id = tee.course_id and hole.tee_id = tee.tee_id
      ) = 18
    group by tee.course_id
  ) candidate;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', audit.event_id, 'action', audit.action,
    'targetKind', audit.target_kind, 'targetId', audit.target_id,
    'actorPlayerId', audit.actor_player_id, 'result', audit.result,
    'timestamp', audit.occurred_at,
    'summary', audit.safe_metadata->>'summary'
  ) order by audit.occurred_at desc), '[]'::jsonb) into audit_value
  from (
    select value.*
    from production_control.future_year_audit_events_v1 value
    where value.target_tournament_id = selected_id
    order by value.occurred_at desc
    limit 50
  ) audit;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'data', pg_catalog.jsonb_build_object(
      'contractVersion', 'production-future-year-administration-v1',
      'currentTournament', pg_catalog.jsonb_build_object(
        'tournamentId', pointer_value.tournament_id,
        'tournamentYear', pointer_value.tournament_year,
        'pointerRevision', pointer_value.pointer_revision,
        'lifecycleRevision', pointer_value.lifecycle_revision,
        'lifecycle', 'ACTIVE'
      ),
      'selectedTournament', selected_json,
      'catalog', catalog_value, 'teams', teams_value,
      'roster', roster_value, 'rounds', rounds_value,
      'courseAssignments', courses_value,
      'matchDefinitions', matches_value,
      'compatibilityJobs', jobs_value,
      'playerCatalog', players_value, 'courseLibrary', library_value,
      'audit', audit_value, 'readiness', readiness_value,
      'activationPlan', pg_catalog.jsonb_build_object(
        'status', 'BLOCKED', 'executable', false,
        'code', 'FUTURE_TOURNAMENT_ACTIVATION_NOT_INSTALLED',
        'blockers', readiness_value->'blockers'
      ),
      'capabilities', pg_catalog.jsonb_build_object(
        'createTournament', actor_is_owner,
        'cloneStructure', actor_is_owner,
        'editTournament', editable, 'configureTeams', editable,
        'replaceRoster', editable, 'configureRounds', editable,
        'assignExistingCourse', editable,
        'generateMatchStructure', editable, 'markReady', false,
        'activateTournament', false, 'closeTournament', false,
        'archiveTournament', false, 'createGlobalCourse', false,
        'runtimeMatchCreation', false,
        'googleCompatibilityWriter', false
      )
    )
  );
end;
$function$
;

revoke all on function production_control.canonical_mutate_future_year_administration_v2(jsonb,jsonb),production_control.canonical_read_future_year_administration_v2(jsonb,jsonb) from public,anon,authenticated,service_role;
create or replace function public.mutate_production_future_year_administration_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,production_control,scoring_authority as $fn$
declare context jsonb;
begin
 context:=production_control.production_annual_context_v2(input,upper(btrim(coalesce(input->>'operation',input->>'action',''))) in('CREATE_TOURNAMENT','MARK_READY'));
 return production_control.canonical_mutate_future_year_administration_v2(input,context);
end;
$fn$;
create or replace function public.read_production_future_year_administration_v1(input jsonb)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,production_control,scoring_authority as $fn$
declare context jsonb;
begin
 context:=production_control.production_annual_context_v2(input,false);
 return production_control.canonical_read_future_year_administration_v2(input,context);
end;
$fn$;

create function production_control.dispatch_certification_annual_v1(input jsonb, context jsonb, mutation boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
declare payload jsonb:=input->'payload'; command jsonb; result jsonb; r production_control.canonical_resource_v1%rowtype;
begin
 if context->>'phase' is distinct from 'ANNUAL' or context->>'resource_class' is distinct from 'CERTIFICATION'
   or context is distinct from production_control.current_certification_context_v1()
   or jsonb_typeof(payload) is distinct from 'object' then
  raise exception using errcode='42501',message='CANONICAL_ANNUAL_CONTEXT_REQUIRED'; end if;
 if payload ?| array['authorization','environment','contract_version','resource','deployment','actor_player_id','actor_auth_user_id',
  'project_ref','project_url','source_workbook_id','tournament_id','tournament_year','operation_request_id',
  'resource_id','resource_class','installation_id','governance_tournament_id','expected_context_token'] then
  raise exception using errcode='42501',message='CERTIFICATION_OPERATION_AUTHORITY_FIELD_REJECTED'; end if;
 select * into strict r from production_control.canonical_resource_v1 where resource_id=context->>'resource_id';
 command:=payload||jsonb_build_object('contract_version','production-future-year-administration-v1','environment','CERTIFICATION',
  'project_ref',r.project_ref,'project_url',r.project_url,'source_workbook_id',r.provenance_id,
  'tournament_id',context->>'current_tournament_id','tournament_year',(context->>'current_tournament_year')::integer,
  'authorization',input->'authorization');
 if mutation then
  command:=command||jsonb_build_object('operation_request_id',input->>'operation_request_id');
  result:=production_control.canonical_mutate_future_year_administration_v2(command,context);
  if coalesce((result->>'ok')::boolean,false) and not coalesce((result->>'idempotent')::boolean,false) then
   insert into production_control.operation_audit_events(event_type,domain,tournament_id,actor,request_fingerprint,result,details)
   values('CERTIFICATION_ANNUAL_OPERATION','ANNUAL',context->>'current_tournament_id',input#>>'{authorization,player_id}',
    production_control.future_year_hash_v1(payload),'SUCCEEDED',jsonb_build_object('resource_class','CERTIFICATION',
     'resource_id',context->>'resource_id','installation_id',context->>'installation_id','binding_id',context->>'binding_id',
     'context_token',context->>'context_token','operation_request_id',input->>'operation_request_id',
     'release_commit',context->>'release_commit','admission_revision',context->'admission_revision',
     'actor_auth_user_id',input#>>'{authorization,auth_user_id}','receipt',result));
  end if;
  return result;
 end if;
 command:=command||jsonb_build_object('operation','READ_PRODUCTION_FUTURE_YEAR_ADMINISTRATION_V1');
 return production_control.canonical_read_future_year_administration_v2(command,context);
end;
$fn$;
revoke all on function production_control.dispatch_certification_annual_v1(jsonb,jsonb,boolean) from public,anon,authenticated,service_role;
create function public.read_certification_future_year_administration_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
declare context jsonb; result jsonb;
begin
 context:=production_control.push_certification_context_v1(input,'ANNUAL',false);
 result:=production_control.dispatch_certification_annual_v1(input,context,false);
 perform production_control.pop_certification_context_v1();return result;
end;
$fn$;
create function public.mutate_certification_future_year_administration_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
declare context jsonb; result jsonb;
begin
 context:=production_control.push_certification_context_v1(input,'ANNUAL',true);
 result:=production_control.dispatch_certification_annual_v1(input,context,true);
 perform production_control.pop_certification_context_v1();return result;
end;
$fn$;
revoke all on function public.read_certification_future_year_administration_v1(jsonb),public.mutate_certification_future_year_administration_v1(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.read_certification_future_year_administration_v1(jsonb),public.mutate_certification_future_year_administration_v1(jsonb) to service_role;
do $check$
begin
 if exists(select 1 from canonical_annual_original_attributes before_value
  left join pg_proc after_value on after_value.oid=before_value.oid
  where after_value.oid is null or
   row(after_value.pronamespace,after_value.proname,after_value.proargtypes,after_value.proowner,
    after_value.proacl,after_value.prosecdef,after_value.proconfig,after_value.provolatile)
   is distinct from row(before_value.pronamespace,before_value.proname,before_value.proargtypes,before_value.proowner,
    before_value.proacl,before_value.prosecdef,before_value.proconfig,before_value.provolatile)) then
  raise exception 'CERTIFICATION_ANNUAL_ORIGINAL_FUNCTION_ATTRIBUTES_CHANGED';
 end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='production_control' and p.proname in(
    'assert_canonical_annual_actor_v2','production_annual_context_v2','assert_canonical_annual_context_v2',
    'canonical_mutate_future_year_administration_v2','canonical_read_future_year_administration_v2','dispatch_certification_annual_v1')
   and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE')
    or has_function_privilege('service_role',p.oid,'EXECUTE'))) then
  raise exception 'CERTIFICATION_ANNUAL_PRIVATE_CORE_PRIVILEGE_EXPANDED';
 end if;
end;
$check$;
notify pgrst,'reload schema';
commit;
