-- Supabase CLI scaffold 20260930194156, ordered after Certification annual migration 138.
begin;
-- Existing canonical preactivation/runtime/content algorithms.
-- Certification future-only authoring uses its existing receipt/CAS contract,
-- serialized under the annual fence; it cannot mutate the scoring predecessor.
-- Production wrappers retain their prior admission and public function identities.

create temporary table canonical_authoring_original_attributes on commit drop as
select oid,pronamespace,proname,proargtypes,proowner,proacl,prosecdef,proconfig,provolatile from pg_proc where oid in('public.mutate_production_future_runtime_v2(jsonb)'::regprocedure,'public.create_production_guide_draft_v1(jsonb)'::regprocedure,'public.validate_production_guide_draft_v1(jsonb)'::regprocedure,'public.publish_production_guide_draft_v1(jsonb)'::regprocedure,'public.stage_production_draft_revision_v1(jsonb)'::regprocedure,'public.validate_production_draft_revision_v1(jsonb)'::regprocedure,'public.commit_production_draft_revision_v1(jsonb)'::regprocedure,'public.stage_production_prediction_settings_revision_v1(jsonb)'::regprocedure,'public.validate_production_prediction_settings_revision_v1(jsonb)'::regprocedure,'public.commit_production_prediction_settings_revision_v1(jsonb)'::regprocedure);

do $check$ begin if encode(extensions.digest((select prosrc from pg_proc where oid='mutate_production_future_runtime_v2(jsonb)'::regprocedure),'sha256'),'hex')<>'20e40c8b7f7916eb4cef0287afe4db66bc68c9c0c363a2b5b847859d8d970918' then raise exception 'CANONICAL_AUTHORING_PREDECESSOR_MISMATCH: mutate_production_future_runtime_v2';end if;end;$check$;

do $check$ begin if encode(extensions.digest((select prosrc from pg_proc where oid='create_production_guide_draft_v1(jsonb)'::regprocedure),'sha256'),'hex')<>'192c8acc87e543caae97480b4c9e8c395242bf0d34c8780e2a19087b206f514e' then raise exception 'CANONICAL_AUTHORING_PREDECESSOR_MISMATCH: create_production_guide_draft_v1';end if;end;$check$;

do $check$ begin if encode(extensions.digest((select prosrc from pg_proc where oid='validate_production_guide_draft_v1(jsonb)'::regprocedure),'sha256'),'hex')<>'d675a74d0485f8cfdf5970d53534115a52b7ac08111f54191bb66dbb2e0cf10a' then raise exception 'CANONICAL_AUTHORING_PREDECESSOR_MISMATCH: validate_production_guide_draft_v1';end if;end;$check$;

do $check$ begin if encode(extensions.digest((select prosrc from pg_proc where oid='publish_production_guide_draft_v1(jsonb)'::regprocedure),'sha256'),'hex')<>'fb21c350931252d9cc15f52d2acb94b1b6a4ccfc1c57b5288779a2c75ae2f655' then raise exception 'CANONICAL_AUTHORING_PREDECESSOR_MISMATCH: publish_production_guide_draft_v1';end if;end;$check$;

do $check$ begin if encode(extensions.digest((select prosrc from pg_proc where oid='stage_production_draft_revision_v1(jsonb)'::regprocedure),'sha256'),'hex')<>'f889a41ca2da6fa5e4cd7c0ea382d9c25f5dad815f664cf8d0bb65bf3f1516bf' then raise exception 'CANONICAL_AUTHORING_PREDECESSOR_MISMATCH: stage_production_draft_revision_v1';end if;end;$check$;

do $check$ begin if encode(extensions.digest((select prosrc from pg_proc where oid='validate_production_draft_revision_v1(jsonb)'::regprocedure),'sha256'),'hex')<>'5101dab672b5297098e9d80bf6955f45b73dd1f92bcd931550b70b0efd355a5c' then raise exception 'CANONICAL_AUTHORING_PREDECESSOR_MISMATCH: validate_production_draft_revision_v1';end if;end;$check$;

do $check$ begin if encode(extensions.digest((select prosrc from pg_proc where oid='commit_production_draft_revision_v1(jsonb)'::regprocedure),'sha256'),'hex')<>'f1f712459647a6185a7aca7289934345d1e368865d967611a6ba8013561b6807' then raise exception 'CANONICAL_AUTHORING_PREDECESSOR_MISMATCH: commit_production_draft_revision_v1';end if;end;$check$;

do $check$ begin if encode(extensions.digest((select prosrc from pg_proc where oid='stage_production_prediction_settings_revision_v1(jsonb)'::regprocedure),'sha256'),'hex')<>'f06bc67f5bbb2449bbe9dd33374b6586d3e3cb4cb76d292bf3ef0e285864ee08' then raise exception 'CANONICAL_AUTHORING_PREDECESSOR_MISMATCH: stage_production_prediction_settings_revision_v1';end if;end;$check$;

do $check$ begin if encode(extensions.digest((select prosrc from pg_proc where oid='validate_production_prediction_settings_revision_v1(jsonb)'::regprocedure),'sha256'),'hex')<>'5a2ccd1949e57c95a80e0271aa865013741980d3cf518511831f6cbcc7c35337' then raise exception 'CANONICAL_AUTHORING_PREDECESSOR_MISMATCH: validate_production_prediction_settings_revision_v1';end if;end;$check$;

do $check$ begin if encode(extensions.digest((select prosrc from pg_proc where oid='commit_production_prediction_settings_revision_v1(jsonb)'::regprocedure),'sha256'),'hex')<>'0fcf4dd59df97801117850a6a2c3137b9cfa1f56c41216f809531d38a3883aa0' then raise exception 'CANONICAL_AUTHORING_PREDECESSOR_MISMATCH: commit_production_prediction_settings_revision_v1';end if;end;$check$;

do $check$ begin if encode(extensions.digest((select prosrc from pg_proc where oid='production_control.assert_guide_authoring_v1(jsonb)'::regprocedure),'sha256'),'hex')<>'f9c2b634011ab34f8eab28f328779fa52217a0a1c157197bcbe735165c66afcc' then raise exception 'CANONICAL_AUTHORING_PREDECESSOR_MISMATCH: assert_guide_authoring_v1';end if;end;$check$;

do $check$ begin if encode(extensions.digest((select prosrc from pg_proc where oid='production_control.assert_draft_authoring_v1(jsonb)'::regprocedure),'sha256'),'hex')<>'aad6a46a4ac6d6d66ff413ef11269e0bb535272669e690032588b713bbc73c37' then raise exception 'CANONICAL_AUTHORING_PREDECESSOR_MISMATCH: assert_draft_authoring_v1';end if;end;$check$;

do $check$ begin if encode(extensions.digest((select prosrc from pg_proc where oid='production_control.assert_prediction_settings_authoring_v1(jsonb)'::regprocedure),'sha256'),'hex')<>'de320f3a46387b1fff0e4b942e9b12169f4956d00abc29322039295abf6a032a' then raise exception 'CANONICAL_AUTHORING_PREDECESSOR_MISMATCH: assert_prediction_settings_authoring_v1';end if;end;$check$;

create function production_control.assert_canonical_future_authoring_resource_v2(input jsonb, resource_context jsonb, required_contract text, require_owner boolean)
returns void language plpgsql security definer set search_path=pg_catalog as $guard$
declare live jsonb; registered production_control.canonical_resource_v1%rowtype;
begin
 if resource_context->>'resource_class'='PRODUCTION' then
  perform production_control.assert_annual_future_admin_scope_v1(input,required_contract,true,require_owner);
  live:=production_control.annual_resource_context_v2();
  if live->>'resource_class'<>'PRODUCTION' or live->>'resource_id' is distinct from resource_context->>'resource_id'
    or live->>'current_tournament_id' is distinct from resource_context->>'current_tournament_id' then
   raise exception using errcode='42501',message='CANONICAL_AUTHORING_RESOURCE_REQUIRED'; end if;
  return;
 end if;
 live:=production_control.current_certification_context_v1();
 select * into strict registered from production_control.canonical_resource_v1 where singleton;
 if resource_context is distinct from live or live->>'phase' is distinct from 'ANNUAL'
   or live->>'resource_class' is distinct from 'CERTIFICATION'
   or registered.resource_class is distinct from 'CERTIFICATION'
   or registered.resource_id is distinct from live->>'resource_id'
   or registered.database_name is distinct from current_database()
   or input->>'contract_version' is distinct from required_contract
   or input->>'environment' is distinct from 'CERTIFICATION'
   or input->>'project_ref' is distinct from registered.project_ref
   or input->>'project_url' is distinct from registered.project_url
   or input->>'source_workbook_id' is distinct from registered.provenance_id
   or input->>'tournament_id' is distinct from live->>'current_tournament_id'
   or input->>'tournament_year' is distinct from live->>'current_tournament_year'
   or input->'authorization' is distinct from live->'authorization' then
  raise exception using errcode='42501',message='CANONICAL_AUTHORING_RESOURCE_REQUIRED'; end if;
 perform production_control.assert_canonical_annual_actor_v2(input,live,require_owner);
end;
$guard$;
revoke all on function production_control.assert_canonical_future_authoring_resource_v2(jsonb,jsonb,text,boolean) from public,anon,authenticated,service_role;

create function production_control.assert_guide_authoring_resource_v2(input jsonb, resource_context jsonb) returns text
language plpgsql security definer set search_path=pg_catalog as $canonical$

declare
  pointer production_control.current_tournament_pointer_v1%rowtype;
  target text := pg_catalog.btrim(coalesce(
    input->>'target_tournament_id', ''));
  target_year integer;
begin
  perform production_control.assert_canonical_future_authoring_resource_v2(
    input, resource_context, 'production-guide-authoring-v1', false
  );
  begin
    target_year := (input->>'target_tournament_year')::integer;
  exception when others then
    raise exception using errcode = '22023',
      message = 'GUIDE_TOURNAMENT_REQUIRED';
  end;
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = (resource_context->>'resource_id');
  if target !~ '^20[0-9]{2}$' or target <> target_year::text then
    raise exception using errcode = '22023',
      message = 'GUIDE_TOURNAMENT_REQUIRED';
  end if;
  if target = pointer.tournament_id then
    if target_year <> pointer.tournament_year or not exists (
      select 1 from production_control.future_tournament_catalog_v1 value
      where value.tournament_id = target
        and value.tournament_year = target_year
        and value.lifecycle = 'ACTIVE'
        and value.lifecycle_revision = pointer.lifecycle_revision
    ) then
      raise exception using errcode = '55000',
        message = 'GUIDE_CURRENT_TOURNAMENT_REQUIRED';
    end if;
  elsif not exists (
    select 1
    from production_control.future_tournament_catalog_v1 catalog
    join production_control.future_tournament_resources_v1 resource
      on resource.tournament_id = catalog.tournament_id
    where catalog.tournament_id = target
      and catalog.tournament_year = target_year
      and catalog.tournament_year > pointer.tournament_year
      and catalog.lifecycle in ('DRAFT','CONFIGURING','READY_FOR_ACTIVATION')
      and resource.project_ref = input->>'project_ref'
      and resource.project_url = input->>'project_url'
      and (resource_context->>'resource_class'='CERTIFICATION'
        or resource.project_ref !~* '(preview|staging|test)')
  ) then
    raise exception using errcode = '42501',
      message = 'GUIDE_FUTURE_TOURNAMENT_REQUIRED';
  end if;
  return target;
end;

$canonical$;
revoke all on function production_control.assert_guide_authoring_resource_v2(jsonb,jsonb) from public,anon,authenticated,service_role;

create function production_control.assert_draft_authoring_resource_v2(input jsonb, resource_context jsonb) returns text
language plpgsql security definer set search_path=pg_catalog as $canonical$

declare
  pointer production_control.current_tournament_pointer_v1%rowtype;
  target text := pg_catalog.btrim(coalesce(
    input->>'target_tournament_id',''));
  target_year integer;
begin
  perform production_control.assert_canonical_future_authoring_resource_v2(
    input, resource_context, 'production-draft-authoring-v1', false
  );
  begin target_year := (input->>'target_tournament_year')::integer;
  exception when others then
    raise exception using errcode='22023',
      message='DRAFT_TOURNAMENT_REQUIRED';
  end;
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key=(resource_context->>'resource_id');
  if target !~ '^20[0-9]{2}$' or target <> target_year::text then
    raise exception using errcode='22023',
      message='DRAFT_TOURNAMENT_REQUIRED';
  end if;
  if target = pointer.tournament_id then
    if target_year <> pointer.tournament_year or not exists (
      select 1 from production_control.future_tournament_catalog_v1 value
      where value.tournament_id=target
        and value.tournament_year=target_year
        and value.lifecycle='ACTIVE'
        and value.lifecycle_revision=pointer.lifecycle_revision
    ) then
      raise exception using errcode='55000',
        message='DRAFT_CURRENT_TOURNAMENT_REQUIRED';
    end if;
  elsif not exists (
    select 1
    from production_control.future_tournament_catalog_v1 catalog
    join production_control.future_tournament_resources_v1 resource
      on resource.tournament_id=catalog.tournament_id
    where catalog.tournament_id=target
      and catalog.tournament_year=target_year
      and catalog.tournament_year>pointer.tournament_year
      and catalog.lifecycle in ('DRAFT','CONFIGURING','READY_FOR_ACTIVATION')
      and resource.project_ref=input->>'project_ref'
      and resource.project_url=input->>'project_url'
      and (resource_context->>'resource_class'='CERTIFICATION'
        or resource.project_ref !~* '(preview|staging|test)')
  ) then
    raise exception using errcode='42501',
      message='DRAFT_FUTURE_TOURNAMENT_REQUIRED';
  end if;
  return target;
end;

$canonical$;
revoke all on function production_control.assert_draft_authoring_resource_v2(jsonb,jsonb) from public,anon,authenticated,service_role;

create function production_control.assert_prediction_settings_authoring_resource_v2(input jsonb, resource_context jsonb) returns text
language plpgsql security definer set search_path=pg_catalog as $canonical$

declare
  pointer production_control.current_tournament_pointer_v1%rowtype;
  target text := pg_catalog.btrim(coalesce(
    input->>'target_tournament_id', ''
  ));
begin
  perform production_control.assert_canonical_future_authoring_resource_v2(
    input, resource_context, 'production-prediction-settings-authoring-v1', false
  );
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = (resource_context->>'resource_id');
  if target !~ '^20[0-9]{2}$' then
    raise exception using errcode = '22023',
      message = 'PREDICTION_SETTINGS_TOURNAMENT_REQUIRED';
  end if;
  if target = pointer.tournament_id then
    if not exists (
      select 1
      from production_control.future_tournament_catalog_v1 value
      where value.tournament_id = target
        and value.tournament_year = target::integer
        and value.lifecycle = 'ACTIVE'
        and value.lifecycle_revision = pointer.lifecycle_revision
    ) then
      raise exception using errcode = '55000',
        message = 'PREDICTION_SETTINGS_CURRENT_TOURNAMENT_REQUIRED';
    end if;
  elsif not exists (
    select 1
    from production_control.future_tournament_catalog_v1 catalog
    join production_control.future_tournament_resources_v1 resource
      on resource.tournament_id = catalog.tournament_id
    where catalog.tournament_id = target
      and catalog.tournament_year = target::integer
      and catalog.tournament_year > pointer.tournament_year
      and catalog.lifecycle in (
        'DRAFT', 'CONFIGURING', 'READY_FOR_ACTIVATION'
      )
      and resource.project_ref = input->>'project_ref'
      and resource.project_url = input->>'project_url'
      and (resource_context->>'resource_class'='CERTIFICATION'
        or resource.project_ref !~* '(preview|staging|test)')
  ) then
    raise exception using errcode = '42501',
      message = 'PREDICTION_SETTINGS_FUTURE_TOURNAMENT_REQUIRED';
  end if;
  return target;
end;

$canonical$;
revoke all on function production_control.assert_prediction_settings_authoring_resource_v2(jsonb,jsonb) from public,anon,authenticated,service_role;

create function production_control.canonical_mutate_future_runtime_resource_v2(input jsonb, resource_context jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $canonical$

declare
  action_value text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input->>'action', ''
  )));
  target_id text := pg_catalog.btrim(coalesce(
    input->>'target_tournament_id', ''
  ));
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', ''
  )));
  actor_auth uuid;
  request_id uuid;
  declared_hash text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'request_payload_hash', ''
  )));
  database_hash text;
  expected_revision bigint;
  receipt production_control.future_runtime_operation_receipts_v2%rowtype;
  catalog production_control.future_tournament_catalog_v1%rowtype;
  resource production_control.future_tournament_resources_v1%rowtype;
  promotion production_control.future_runtime_promotions_v2%rowtype;
  pointer production_control.current_tournament_pointer_v1%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  match_value scoring_authority.matches%rowtype;
  binding production_control.future_runtime_match_bindings_v2%rowtype;
  detail scoring_authority.tournament_setup_match_details_v1%rowtype;
  current_handicap uuid;
  handicap_revision_id_value uuid;
  next_revision bigint;
  prior_revision bigint := 0;
  result_value jsonb;
  safe_metadata jsonb := '{}'::jsonb;
  target_kind text := 'RUNTIME';
  target_object text;
  changed_value boolean := true;
  course_id_value text;
  tee_id_value text;
  course_name text;
  course_location text;
  rating_value numeric;
  slope_value integer;
  par_value integer;
  target_round_value integer;
  context_revision_value bigint;
  hole_value jsonb;
  hole_number_value integer;
  hole_par_value integer;
  stroke_index_value integer;
  yardage_value integer;
  manifest_fingerprint text;
  participants_input jsonb;
  participant jsonb;
  normalized jsonb := '[]'::jsonb;
  expected_count integer;
  player_value text;
  side_value integer;
  slot_value integer;
  context_value jsonb;
  holes_value jsonb;
  participant_manifest jsonb;
  preparation_fingerprint text;
  next_snapshot_revision bigint;
  next_snapshot_id text;
  next_snapshot_hash text;
  readiness jsonb;
  blockers jsonb;
  previous_pointer_revision bigint;
  source_fingerprint text;
  archive_fingerprint text;
  generation_id uuid;
  authority_generation_id_value uuid;
  admission_generation_id_value uuid;
  target_player_value text;
  target_auth_value uuid;
  target_auth_candidates uuid[];
  entitlement_value production_control.director_entitlements%rowtype;
  role_changed boolean := false;
begin
  if action_value not in (
    'ADD_GLOBAL_COURSE', 'CONFIGURE_GLOBAL_COURSE_CONTEXT',
    'ASSIGN_FUTURE_COURSE', 'PROMOTE_RUNTIME_STRUCTURE',
    'STAGE_HANDICAPS', 'APPROVE_HANDICAPS', 'CONFIGURE_MATCH',
    'REPLACE_PAIRINGS', 'PREPARE_SCORING_CONTEXT',
    'GRANT_FUTURE_DIRECTOR',
    'MARK_READY_FOR_ACTIVATION', 'ACTIVATE_TOURNAMENT',
    'CLOSE_TOURNAMENT', 'PREPARE_ARCHIVE_PLAN'
  ) then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_FUTURE_RUNTIME_ACTION_INVALID';
  end if;
  -- Both public wrappers reject legacy activation/close; keep the fence here too.
  if action_value in ('ACTIVATE_TOURNAMENT','CLOSE_TOURNAMENT') then
   raise exception using errcode='55000',message='PRODUCTION_ANNUAL_SCORING_TRANSITION_REQUIRED'; end if;
  perform production_control.assert_canonical_future_authoring_resource_v2(
    input, resource_context, 'production-future-runtime-activation-v2', action_value in (
      'ADD_GLOBAL_COURSE', 'CONFIGURE_GLOBAL_COURSE_CONTEXT',
      'PROMOTE_RUNTIME_STRUCTURE', 'GRANT_FUTURE_DIRECTOR',
      'MARK_READY_FOR_ACTIVATION', 'ACTIVATE_TOURNAMENT',
      'CLOSE_TOURNAMENT', 'PREPARE_ARCHIVE_PLAN'
    )
  );
  begin
    actor_auth := (input#>>'{authorization,auth_user_id}')::uuid;
    request_id := (input->>'operation_request_id')::uuid;
    expected_revision := (input->>'expected_revision')::bigint;
  exception when others then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_FUTURE_RUNTIME_INPUT_INVALID';
  end;
  perform production_control.assert_access_governance_safe_reason_v1(
    input->>'reason'
  );
  database_hash := production_control.future_runtime_hash_v2(
    input - 'request_payload_hash'
  );
  if declared_hash !~ '^[0-9a-f]{64}$'
     or declared_hash <> database_hash then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_FUTURE_RUNTIME_PAYLOAD_HASH_INVALID';
  end if;
  select value.* into receipt
  from production_control.future_runtime_operation_receipts_v2 value
  where value.action = action_value
    and value.operation_request_id = request_id;
  if receipt.receipt_id is not null then
    if receipt.database_request_payload_hash <> database_hash
       or receipt.declared_request_payload_hash <> declared_hash then
      raise exception using errcode = '23505',
        message = 'PRODUCTION_FUTURE_RUNTIME_IDEMPOTENCY_CONFLICT';
    end if;
    return receipt.response || pg_catalog.jsonb_build_object(
      'idempotent', true
    );
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'future-runtime-v2:' || action_value || ':' || coalesce(target_id, ''), 0
    )
  );
  select value.* into receipt
  from production_control.future_runtime_operation_receipts_v2 value
  where value.action = action_value
    and value.operation_request_id = request_id;
  if receipt.receipt_id is not null then
    if receipt.database_request_payload_hash <> database_hash
       or receipt.declared_request_payload_hash <> declared_hash then
      raise exception using errcode = '23505',
        message = 'PRODUCTION_FUTURE_RUNTIME_IDEMPOTENCY_CONFLICT';
    end if;
    return receipt.response || pg_catalog.jsonb_build_object(
      'idempotent', true
    );
  end if;
  target_object := nullif(target_id, '');

  if action_value = 'GRANT_FUTURE_DIRECTOR' then
    target_player_value := pg_catalog.upper(pg_catalog.btrim(coalesce(
      input->>'target_player_id', ''
    )));
    select value.* into strict catalog
    from production_control.future_tournament_catalog_v1 value
    where value.tournament_id = target_id for update;
    select value.governance_revision into prior_revision
    from production_control.future_tournament_director_governance_v1 value
    where value.tournament_id = target_id for update;
    prior_revision := coalesce(prior_revision, 0);
    if target_player_value !~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
       or catalog.tournament_year <= 2026
       or catalog.tournament_year <> (input->>'target_tournament_year')::integer
       or catalog.lifecycle not in ('DRAFT', 'CONFIGURING')
       or target_id = (select value.tournament_id
         from production_control.current_tournament_pointer_v1 value
         where value.scope_key = (resource_context->>'resource_id'))
       or expected_revision <> prior_revision
       or production_control.access_governance_global_status_v1(
         target_player_value
       ) <> 'ACTIVE'
       or not exists (
         select 1
         from production_control.future_tournament_roster_v1 membership
         where membership.tournament_id = target_id
           and membership.player_id = target_player_value
           and membership.participation_status = 'ACTIVE'
       ) then
      raise exception using errcode = '40001',
        message = 'PRODUCTION_FUTURE_DIRECTOR_PREDECESSOR_INVALID';
    end if;

    select pg_catalog.array_agg(candidate.auth_user_id order by
      candidate.auth_user_id::text) into target_auth_candidates
    from (
      select distinct link.auth_user_id
      from participant_identity.user_player_links link
      join auth.users auth_user on auth_user.id = link.auth_user_id
      join participant_identity.participant_auth_identifiers identifier
        on identifier.player_id = link.player_id
       and identifier.auth_user_id = link.auth_user_id
       and identifier.status = 'VERIFIED'
       and identifier.revoked_at is null
      where link.player_id = target_player_value
        and link.status = 'ACTIVE' and link.revoked_at is null
        and (
          (identifier.identifier_type = 'EMAIL'
            and auth_user.email_confirmed_at is not null
            and pg_catalog.lower(pg_catalog.btrim(coalesce(
              auth_user.email, ''
            ))) = identifier.normalized_value_private)
          or (identifier.identifier_type = 'PHONE'
            and auth_user.phone_confirmed_at is not null
            and pg_catalog.btrim(coalesce(auth_user.phone, '')) =
              identifier.normalized_value_private)
        )
    ) candidate;
    if coalesce(pg_catalog.cardinality(target_auth_candidates), 0) <> 1 then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_FUTURE_DIRECTOR_LINKED_IDENTITY_REQUIRED';
    end if;
    target_auth_value := target_auth_candidates[1];

    select value.* into entitlement_value
    from production_control.director_entitlements value
    where value.tournament_id = target_id
      and value.auth_user_id = target_auth_value;
    if entitlement_value.entitlement_id is not null and (
      entitlement_value.player_id is distinct from target_player_value
      or entitlement_value.role <> 'DIRECTOR'
    ) then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_FUTURE_DIRECTOR_IDENTITY_CONFLICT';
    end if;
    changed_value := entitlement_value.entitlement_id is null
      or entitlement_value.status <> 'ACTIVE'
      or entitlement_value.revoked_at is not null;
    if changed_value then
      insert into production_control.director_entitlements (
        auth_user_id, tournament_id, player_id, role, status,
        granted_by, granted_at, revoked_at
      ) values (
        target_auth_value, target_id, target_player_value, 'DIRECTOR',
        'ACTIVE', actor_player, pg_catalog.clock_timestamp(), null
      ) on conflict (auth_user_id, tournament_id) do update set
        player_id = excluded.player_id, role = 'DIRECTOR', status = 'ACTIVE',
        granted_by = excluded.granted_by, granted_at = excluded.granted_at,
        revoked_at = null;
      select value.* into strict entitlement_value
      from production_control.director_entitlements value
      where value.tournament_id = target_id
        and value.auth_user_id = target_auth_value;
      insert into production_control.director_entitlement_events (
        entitlement_id, action, actor, reason
      ) values (
        entitlement_value.entitlement_id, 'GRANTED', actor_player,
        pg_catalog.btrim(input->>'reason')
      );
    end if;
    role_changed := not exists (
      select 1 from participant_identity.tournament_roles role_value
      where role_value.tournament_id = target_id
        and role_value.auth_user_id = target_auth_value
        and role_value.role = 'DIRECTOR'
        and role_value.role_active and role_value.revoked_at is null
    );
    insert into participant_identity.tournament_roles (
      tournament_id, auth_user_id, role, role_active, role_revision,
      granted_at, granted_by, revoked_at, revoked_by
    ) values (
      target_id, target_auth_value, 'DIRECTOR', true, 1,
      pg_catalog.clock_timestamp(), actor_player, null, null
    ) on conflict (tournament_id, auth_user_id, role) do update set
      role_active = true,
      role_revision = participant_identity.tournament_roles.role_revision +
        case when participant_identity.tournament_roles.role_active
          and participant_identity.tournament_roles.revoked_at is null
          then 0 else 1 end,
      granted_at = case when participant_identity.tournament_roles.role_active
          and participant_identity.tournament_roles.revoked_at is null
        then participant_identity.tournament_roles.granted_at
        else pg_catalog.clock_timestamp() end,
      granted_by = case when participant_identity.tournament_roles.role_active
          and participant_identity.tournament_roles.revoked_at is null
        then participant_identity.tournament_roles.granted_by
        else actor_player end,
      revoked_at = null, revoked_by = null,
      updated_at = case when participant_identity.tournament_roles.role_active
          and participant_identity.tournament_roles.revoked_at is null
        then participant_identity.tournament_roles.updated_at
        else pg_catalog.clock_timestamp() end;
    changed_value := changed_value or role_changed;
    next_revision := prior_revision + case when changed_value then 1 else 0 end;
    if changed_value then
      insert into production_control.future_tournament_director_governance_v1 (
        tournament_id, governance_revision, updated_by_player_id,
        updated_by_auth_user_id
      ) values (
        target_id, next_revision, actor_player, actor_auth
      ) on conflict (tournament_id) do update set
        governance_revision = excluded.governance_revision,
        updated_by_player_id = excluded.updated_by_player_id,
        updated_by_auth_user_id = excluded.updated_by_auth_user_id,
        updated_at = pg_catalog.clock_timestamp();
    end if;
    target_kind := 'IDENTITY';
    target_object := target_player_value;
    safe_metadata := pg_catalog.jsonb_build_object(
      'summary', 'Future tournament Director granted',
      'playerId', target_player_value, 'role', 'DIRECTOR',
      'identityChanged', false, 'membershipChanged', false
    );
    result_value := pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'PRODUCTION_FUTURE_DIRECTOR_GRANTED',
      'action', action_value, 'tournamentId', target_id,
      'targetPlayerId', target_player_value,
      'priorRevision', prior_revision, 'nextRevision', next_revision,
      'changed', changed_value, 'idempotent', false
    );

  elsif action_value = 'ADD_GLOBAL_COURSE' then
    select value.allocator_revision into strict prior_revision
    from production_control.global_course_id_allocator_v1 value
    where value.scope_key = (resource_context->>'resource_id') for update;
    if expected_revision <> prior_revision then
      raise exception using errcode = '40001',
        message = 'PRODUCTION_GLOBAL_COURSE_ALLOCATOR_REVISION_STALE';
    end if;
    course_name := pg_catalog.btrim(coalesce(input->>'display_name', ''));
    course_location := nullif(pg_catalog.btrim(coalesce(
      input->>'location', ''
    )), '');
    if course_name = '' or pg_catalog.length(course_name) > 240
       or (course_location is not null
         and pg_catalog.length(course_location) > 240)
       or exists (
         select 1 from scoring_authority.global_course_library_v1 value
         where pg_catalog.lower(value.display_name) =
           pg_catalog.lower(course_name)
           and coalesce(pg_catalog.lower(value.location), '') =
             coalesce(pg_catalog.lower(course_location), '')
       ) then
      raise exception using errcode = '23505',
        message = 'PRODUCTION_GLOBAL_COURSE_IDENTITY_CONFLICT';
    end if;
    course_id_value := production_control.allocate_global_course_id_v1();
    insert into scoring_authority.global_course_catalog_v1 (
      course_id, display_name, location, catalog_status, identity_source,
      catalog_revision, created_by_player_id, created_by_auth_user_id
    ) values (
      course_id_value, course_name, course_location, 'ACTIVE',
      'DIRECTOR_CREATED', 1, actor_player, actor_auth
    );
    next_revision := prior_revision + 1;
    target_kind := 'GLOBAL_COURSE';
    target_object := course_id_value;
    safe_metadata := pg_catalog.jsonb_build_object(
      'summary', 'Global Course created', 'courseId', course_id_value
    );
    result_value := pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'PRODUCTION_GLOBAL_COURSE_CREATED',
      'action', action_value, 'courseId', course_id_value,
      'catalogRevision', 1, 'priorRevision', prior_revision,
      'nextRevision', next_revision, 'scoringReady', false,
      'idempotent', false
    );

  elsif action_value = 'CONFIGURE_GLOBAL_COURSE_CONTEXT' then
    course_id_value := pg_catalog.btrim(coalesce(input->>'course_id', ''));
    tee_id_value := pg_catalog.btrim(coalesce(input->>'tee_id', ''));
    holes_value := input->'holes';
    begin
      rating_value := (input->>'rating')::numeric;
      slope_value := (input->>'slope')::integer;
      par_value := (input->>'par')::integer;
    exception when others then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_GLOBAL_COURSE_CONTEXT_INPUT_INVALID';
    end;
    select value.catalog_revision into strict prior_revision
    from scoring_authority.global_course_catalog_v1 value
    where value.course_id = course_id_value
      and value.identity_source = 'DIRECTOR_CREATED'
      and value.catalog_status = 'ACTIVE'
    for update;
    if expected_revision <> prior_revision
       or tee_id_value = '' or pg_catalog.length(tee_id_value) > 120
       or rating_value <= 0 or rating_value > 100
       or slope_value not between 55 and 155
       or par_value not between 54 and 90
       or pg_catalog.jsonb_typeof(holes_value) <> 'array'
       or pg_catalog.jsonb_array_length(holes_value) <> 18 then
      raise exception using errcode = '40001',
        message = 'PRODUCTION_GLOBAL_COURSE_CONTEXT_PREDECESSOR_INVALID';
    end if;
    normalized := '[]'::jsonb;
    for hole_value in
      select entry.value from pg_catalog.jsonb_array_elements(holes_value)
        entry(value)
    loop
      begin
        hole_number_value := (hole_value->>'hole_number')::integer;
        hole_par_value := (hole_value->>'par')::integer;
        stroke_index_value := (hole_value->>'stroke_index')::integer;
        yardage_value := nullif(hole_value->>'yardage', '')::integer;
      exception when others then
        raise exception using errcode = '22023',
          message = 'PRODUCTION_GLOBAL_COURSE_HOLE_INPUT_INVALID';
      end;
      if hole_number_value not between 1 and 18
         or hole_par_value not between 3 and 6
         or stroke_index_value not between 1 and 18
         or (yardage_value is not null
           and yardage_value not between 1 and 999) then
        raise exception using errcode = '22023',
          message = 'PRODUCTION_GLOBAL_COURSE_HOLE_INPUT_INVALID';
      end if;
      normalized := normalized || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'hole_number', hole_number_value, 'par', hole_par_value,
          'stroke_index', stroke_index_value, 'yardage', yardage_value
        )
      );
    end loop;
    if (select pg_catalog.count(distinct (entry->>'hole_number')::integer)
          from pg_catalog.jsonb_array_elements(normalized) entry) <> 18
       or (select pg_catalog.count(distinct (entry->>'stroke_index')::integer)
          from pg_catalog.jsonb_array_elements(normalized) entry) <> 18
       or (select pg_catalog.sum((entry->>'par')::integer)
          from pg_catalog.jsonb_array_elements(normalized) entry) <> par_value then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_GLOBAL_COURSE_HOLES_INCOMPLETE';
    end if;
    next_revision := prior_revision + 1;
    delete from scoring_authority.global_course_hole_contexts_v1 value
    where value.course_id = course_id_value and value.tee_id = tee_id_value;
    insert into scoring_authority.global_course_tee_contexts_v1 (
      course_id, tee_id, rating, slope, par, context_revision,
      configured_by_player_id, configured_by_auth_user_id
    ) values (
      course_id_value, tee_id_value, rating_value, slope_value, par_value,
      next_revision, actor_player, actor_auth
    ) on conflict (course_id, tee_id) do update set
      rating = excluded.rating, slope = excluded.slope, par = excluded.par,
      context_revision = excluded.context_revision,
      configured_by_player_id = excluded.configured_by_player_id,
      configured_by_auth_user_id = excluded.configured_by_auth_user_id,
      updated_at = pg_catalog.clock_timestamp();
    insert into scoring_authority.global_course_hole_contexts_v1 (
      course_id, tee_id, hole_number, par, stroke_index, yardage,
      context_revision
    ) select course_id_value, tee_id_value,
      (entry->>'hole_number')::integer, (entry->>'par')::integer,
      (entry->>'stroke_index')::integer,
      nullif(entry->>'yardage', '')::integer, next_revision
    from pg_catalog.jsonb_array_elements(normalized) entry;
    update scoring_authority.global_course_catalog_v1 value set
      catalog_revision = next_revision,
      updated_at = pg_catalog.clock_timestamp()
    where value.course_id = course_id_value;
    target_kind := 'GLOBAL_COURSE';
    target_object := course_id_value || ':' || tee_id_value;
    safe_metadata := pg_catalog.jsonb_build_object(
      'summary', 'Global Course scoring context configured',
      'courseId', course_id_value, 'teeId', tee_id_value,
      'holeCount', 18
    );
    result_value := pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'PRODUCTION_GLOBAL_COURSE_CONTEXT_CONFIGURED',
      'action', action_value, 'courseId', course_id_value,
      'teeId', tee_id_value, 'contextRevision', next_revision,
      'priorRevision', prior_revision, 'nextRevision', next_revision,
      'scoringReady', true, 'idempotent', false
    );

  elsif action_value = 'ASSIGN_FUTURE_COURSE' then
    course_id_value := pg_catalog.btrim(coalesce(input->>'course_id', ''));
    tee_id_value := pg_catalog.btrim(coalesce(input->>'tee_id', ''));
    begin
      target_round_value := (input->>'round_number')::integer;
      context_revision_value := (input->>'course_context_revision')::bigint;
    exception when others then
      raise exception using errcode = '22023',
        message = 'FUTURE_GLOBAL_COURSE_ASSIGNMENT_INPUT_INVALID';
    end;
    select value.* into strict catalog
    from production_control.future_tournament_catalog_v1 value
    where value.tournament_id = target_id for update;
    select value.context_revision into strict context_revision_value
    from scoring_authority.global_course_tee_contexts_v1 value
    join scoring_authority.global_course_catalog_v1 course
      on course.course_id = value.course_id
    where value.course_id = course_id_value and value.tee_id = tee_id_value
      and value.context_revision = context_revision_value
      and course.catalog_status = 'ACTIVE'
      and course.identity_source = 'DIRECTOR_CREATED';
    prior_revision := catalog.setup_revision;
    if expected_revision <> prior_revision
       or catalog.lifecycle not in ('DRAFT', 'CONFIGURING')
       or exists (select 1
         from production_control.future_runtime_promotions_v2 promotion_value
         where promotion_value.tournament_id = target_id)
       or not exists (
         select 1 from production_control.future_tournament_rounds_v1 round_value
         where round_value.tournament_id = target_id
           and round_value.round_number = target_round_value
       )
       or (select pg_catalog.count(*)
         from scoring_authority.global_course_hole_contexts_v1 hole
         where hole.course_id = course_id_value
           and hole.tee_id = tee_id_value
           and hole.context_revision = context_revision_value) <> 18
       or (select pg_catalog.count(distinct hole.stroke_index)
         from scoring_authority.global_course_hole_contexts_v1 hole
         where hole.course_id = course_id_value
           and hole.tee_id = tee_id_value
           and hole.context_revision = context_revision_value) <> 18 then
      raise exception using errcode = '40001',
        message = 'FUTURE_GLOBAL_COURSE_ASSIGNMENT_PREDECESSOR_INVALID';
    end if;
    next_revision := prior_revision + 1;
    insert into production_control.future_tournament_course_references_v1 (
      tournament_id, round_number, course_id, tee_id,
      source_tournament_id, source_round_number, source_setup_revision,
      reference_status, setup_revision, updated_by_player_id
    ) values (
      target_id, target_round_value, course_id_value, tee_id_value,
      target_id, null, context_revision_value, 'GLOBAL_COURSE_CONTEXT',
      next_revision, actor_player
    ) on conflict (tournament_id, round_number) do update set
      course_id = excluded.course_id, tee_id = excluded.tee_id,
      source_tournament_id = excluded.source_tournament_id,
      source_round_number = excluded.source_round_number,
      source_setup_revision = excluded.source_setup_revision,
      reference_status = excluded.reference_status,
      setup_revision = excluded.setup_revision,
      updated_by_player_id = excluded.updated_by_player_id,
      updated_at = pg_catalog.clock_timestamp();
    update production_control.future_tournament_catalog_v1 value set
      lifecycle = 'CONFIGURING', setup_revision = next_revision,
      readiness_fingerprint = null, readiness_setup_revision = null,
      updated_by_player_id = actor_player,
      updated_by_auth_user_id = actor_auth,
      updated_at = pg_catalog.clock_timestamp()
    where value.tournament_id = target_id;
    target_kind := 'COURSE_ASSIGNMENT';
    target_object := target_id || ':R' || target_round_value::text;
    safe_metadata := pg_catalog.jsonb_build_object(
      'summary', 'Validated global Course assigned to future round',
      'courseId', course_id_value, 'teeId', tee_id_value,
      'roundNumber', target_round_value
    );
    result_value := pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'PRODUCTION_FUTURE_GLOBAL_COURSE_ASSIGNED',
      'action', action_value, 'tournamentId', target_id,
      'roundNumber', target_round_value, 'courseId', course_id_value,
      'teeId', tee_id_value, 'courseContextRevision', context_revision_value,
      'priorRevision', prior_revision, 'nextRevision', next_revision,
      'idempotent', false
    );

  elsif action_value = 'CONFIGURE_MATCH' then
    select value.* into strict catalog
    from production_control.future_tournament_catalog_v1 value
    where value.tournament_id = target_id for update;
    select value.* into strict match_value
    from scoring_authority.matches value
    where value.tournament_id = target_id
      and value.match_id = input->>'match_id' for update;
    select value.* into strict binding
    from production_control.future_runtime_match_bindings_v2 value
    where value.tournament_id = target_id
      and value.match_id = match_value.match_id for update;
    prior_revision := binding.runtime_revision;
    if expected_revision <> prior_revision
       or catalog.lifecycle not in ('DRAFT', 'CONFIGURING')
       or match_value.status <> 'UPCOMING' or match_value.match_revision <> 0
       or not match_value.scoring_locked
       or not exists (
         select 1 from scoring_authority.tournament_setup_course_tees_v1 tee
         join scoring_authority.tournament_setup_round_courses_v1 assignment
           on assignment.tournament_id = tee.tournament_id
          and assignment.course_id = tee.course_id
          and assignment.tee_id = tee.tee_id
         where tee.tournament_id = target_id
           and assignment.round_number = match_value.round_number
           and tee.course_id = input->>'course_id'
           and tee.tee_id = input->>'tee_id'
       ) then
      raise exception using errcode = '40001',
        message = 'FUTURE_MATCH_CONFIGURATION_PREDECESSOR_INVALID';
    end if;
    begin
      side_value := coalesce((input->>'starting_hole')::integer, 1);
      slot_value := (input->>'match_number')::integer;
    exception when others then
      raise exception using errcode = '22023',
        message = 'FUTURE_MATCH_CONFIGURATION_INPUT_INVALID';
    end;
    if side_value not between 1 and 18 or slot_value not between 1 and 99
       or (select pg_catalog.count(*)
         from scoring_authority.tournament_setup_course_holes_v1 hole
         where hole.tournament_id = target_id
           and hole.course_id = input->>'course_id'
           and hole.tee_id = input->>'tee_id') <> 18 then
      raise exception using errcode = '22023',
        message = 'FUTURE_MATCH_COURSE_CONTEXT_INCOMPLETE';
    end if;
    if match_value.scoring_snapshot_id is not null then
      delete from scoring_authority.match_holes value
      where value.match_id = match_value.match_id;
      update scoring_authority.matches set
        scoring_snapshot_id = null, scoring_locked = true,
        updated_at = pg_catalog.clock_timestamp()
      where match_id = match_value.match_id;
    end if;
    next_revision := prior_revision + 1;
    insert into scoring_authority.tournament_setup_match_details_v1 (
      match_id, tournament_id, round_number, match_number,
      course_id, tee_id, tee_time, starting_hole, setup_revision,
      prepared_setup_revision, prepared_configuration_fingerprint,
      updated_by_player_id
    ) values (
      match_value.match_id, target_id, match_value.round_number, slot_value,
      input->>'course_id', input->>'tee_id',
      nullif(input->>'tee_time', '')::time, side_value, next_revision,
      null, null, actor_player
    ) on conflict (match_id) do update set
      match_number = excluded.match_number,
      course_id = excluded.course_id, tee_id = excluded.tee_id,
      tee_time = excluded.tee_time, starting_hole = excluded.starting_hole,
      setup_revision = excluded.setup_revision,
      prepared_setup_revision = null,
      prepared_configuration_fingerprint = null,
      updated_by_player_id = excluded.updated_by_player_id,
      updated_at = pg_catalog.clock_timestamp();
    update production_control.future_runtime_match_bindings_v2 set
      runtime_revision = next_revision, runtime_state = 'CONFIGURED',
      configuration_fingerprint = null,
      updated_at = pg_catalog.clock_timestamp()
    where match_id = match_value.match_id;
    target_kind := 'MATCH'; target_object := match_value.match_id;
    safe_metadata := pg_catalog.jsonb_build_object(
      'summary', 'Future match configured', 'matchId', match_value.match_id,
      'round', match_value.round_number
    );
    result_value := pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'PRODUCTION_FUTURE_MATCH_CONFIGURED',
      'action', action_value, 'tournamentId', target_id,
      'matchId', match_value.match_id, 'priorRevision', prior_revision,
      'nextRevision', next_revision, 'snapshotPrepared', false,
      'idempotent', false
    );

  elsif action_value = 'REPLACE_PAIRINGS' then
    participants_input := input->'participants';
    select value.* into strict catalog
    from production_control.future_tournament_catalog_v1 value
    where value.tournament_id = target_id for update;
    select value.* into strict match_value
    from scoring_authority.matches value
    where value.tournament_id = target_id
      and value.match_id = input->>'match_id' for update;
    select value.* into strict binding
    from production_control.future_runtime_match_bindings_v2 value
    where value.match_id = match_value.match_id for update;
    select value.* into strict detail
    from scoring_authority.tournament_setup_match_details_v1 value
    where value.match_id = match_value.match_id;
    select value.revision_id into strict current_handicap
    from scoring_authority.handicap_revision_current value
    where value.tournament_id = target_id;
    prior_revision := binding.runtime_revision;
    expected_count := case when match_value.format = 'SI' then 2 else 4 end;
    if expected_revision <> prior_revision
       or catalog.lifecycle not in ('DRAFT', 'CONFIGURING')
       or match_value.status <> 'UPCOMING' or match_value.match_revision <> 0
       or pg_catalog.jsonb_typeof(participants_input) <> 'array'
       or pg_catalog.jsonb_array_length(participants_input) <> expected_count then
      raise exception using errcode = '40001',
        message = 'FUTURE_PAIRINGS_PREDECESSOR_INVALID';
    end if;
    for participant in select value
      from pg_catalog.jsonb_array_elements(participants_input) entry(value)
    loop
      begin
        player_value := pg_catalog.upper(pg_catalog.btrim(
          participant->>'player_id'
        ));
        side_value := (participant->>'team_side')::integer;
        slot_value := (participant->>'player_slot')::integer;
      exception when others then
        raise exception using errcode = '22023',
          message = 'FUTURE_PAIRING_STRUCTURE_INVALID';
      end;
      if side_value not in (1, 2)
         or slot_value not between 1 and
           (case when match_value.format = 'SI' then 1 else 2 end)
         or not exists (
           select 1 from scoring_authority.tournament_players membership
           where membership.tournament_id = target_id
             and membership.player_id = player_value
             and membership.team_side = side_value
             and membership.participation_status = 'ACTIVE'
             and membership.handicap_revision_id = current_handicap
             and membership.tournament_handicap is not null
         ) then
        raise exception using errcode = '22023',
          message = 'FUTURE_PAIRING_ACTIVE_TEAM_HANDICAP_REQUIRED';
      end if;
      normalized := normalized || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'player_id', player_value, 'team_side', side_value,
          'player_slot', slot_value
        )
      );
    end loop;
    if (select pg_catalog.count(distinct item->>'player_id')
      from pg_catalog.jsonb_array_elements(normalized) item) <> expected_count
       or (select pg_catalog.count(distinct
          (item->>'team_side') || ':' || (item->>'player_slot'))
        from pg_catalog.jsonb_array_elements(normalized) item) <> expected_count
       or (select pg_catalog.count(*)
        from pg_catalog.jsonb_array_elements(normalized) item
        where (item->>'team_side')::integer = 1) <> expected_count / 2
       or (select pg_catalog.count(*)
        from pg_catalog.jsonb_array_elements(normalized) item
        where (item->>'team_side')::integer = 2) <> expected_count / 2
       or exists (
         select 1 from pg_catalog.jsonb_array_elements(normalized) requested
         join scoring_authority.match_participants other
           on other.player_id = requested->>'player_id'
         join scoring_authority.matches other_match
           on other_match.match_id = other.match_id
          and other_match.tournament_id = target_id
          and other_match.round_number = match_value.round_number
          and other_match.match_id <> match_value.match_id
       ) then
      raise exception using errcode = '23505',
        message = 'FUTURE_PAIRING_DUPLICATE_OR_UNBALANCED';
    end if;
    if match_value.scoring_snapshot_id is not null then
      delete from scoring_authority.match_holes value
      where value.match_id = match_value.match_id;
      update scoring_authority.matches set scoring_snapshot_id = null,
        scoring_locked = true, updated_at = pg_catalog.clock_timestamp()
      where match_id = match_value.match_id;
    end if;
    delete from scoring_authority.scoring_permissions value
    where value.match_id = match_value.match_id;
    delete from scoring_authority.match_participants value
    where value.match_id = match_value.match_id;
    insert into scoring_authority.match_participants (
      match_id, player_id, team_side, player_slot, tournament_handicap,
      handicap_index, course_handicap, playing_handicap, final_strokes,
      handicap_revision_id
    ) select match_value.match_id, item->>'player_id',
      (item->>'team_side')::integer, (item->>'player_slot')::integer,
      entry.tournament_handicap, entry.tournament_handicap,
      entry.tournament_handicap, 0, 0, current_handicap
    from pg_catalog.jsonb_array_elements(normalized) item
    join scoring_authority.handicap_revision_entries entry
      on entry.revision_id = current_handicap
     and entry.tournament_id = target_id
     and entry.player_id = item->>'player_id';
    next_revision := prior_revision + 1;
    insert into scoring_authority.scoring_permissions (
      match_id, player_id, can_score, permission_revision,
      revoked_at, updated_at
    ) select match_value.match_id, item->>'player_id', false,
      next_revision, pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
    from pg_catalog.jsonb_array_elements(normalized) item;
    update scoring_authority.matches set
      permission_revision = next_revision,
      scoring_locked = true, updated_at = pg_catalog.clock_timestamp()
    where match_id = match_value.match_id;
    update scoring_authority.tournament_setup_match_details_v1 set
      setup_revision = next_revision,
      prepared_setup_revision = null,
      prepared_configuration_fingerprint = null,
      updated_by_player_id = actor_player,
      updated_at = pg_catalog.clock_timestamp()
    where match_id = match_value.match_id;
    update production_control.future_runtime_match_bindings_v2 set
      runtime_revision = next_revision, runtime_state = 'PAIRED',
      configuration_fingerprint = null,
      updated_at = pg_catalog.clock_timestamp()
    where match_id = match_value.match_id;
    target_kind := 'PAIRINGS'; target_object := match_value.match_id;
    safe_metadata := pg_catalog.jsonb_build_object(
      'summary', 'Future match pairings replaced',
      'matchId', match_value.match_id, 'participantCount', expected_count,
      'scoringAccessGranted', false
    );
    result_value := pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'PRODUCTION_FUTURE_PAIRINGS_REPLACED',
      'action', action_value, 'tournamentId', target_id,
      'matchId', match_value.match_id, 'participantCount', expected_count,
      'priorRevision', prior_revision, 'nextRevision', next_revision,
      'scoringAccessGranted', false, 'idempotent', false
    );

  elsif action_value = 'MARK_READY_FOR_ACTIVATION' then
    select value.* into strict catalog
    from production_control.future_tournament_catalog_v1 value
    where value.tournament_id = target_id for update;
    prior_revision := catalog.lifecycle_revision;
    readiness := production_control.future_runtime_readiness_v2(target_id);
    if expected_revision <> prior_revision
       or catalog.lifecycle <> 'CONFIGURING'
       or not (readiness->>'ready')::boolean
       or input->>'readiness_fingerprint'
         is distinct from readiness->>'fingerprint' then
      raise exception using errcode = '40001',
        message = 'FUTURE_ACTIVATION_READINESS_STALE_OR_BLOCKED';
    end if;
    next_revision := prior_revision + 1;
    update production_control.future_tournament_catalog_v1 set
      lifecycle = 'READY_FOR_ACTIVATION',
      lifecycle_revision = next_revision,
      readiness_fingerprint = readiness->>'fingerprint',
      readiness_setup_revision = setup_revision,
      updated_by_player_id = actor_player,
      updated_by_auth_user_id = actor_auth,
      updated_at = pg_catalog.clock_timestamp()
    where tournament_id = target_id;
    update production_control.future_runtime_promotions_v2 set
      runtime_status = 'READY', updated_at = pg_catalog.clock_timestamp()
    where tournament_id = target_id;
    target_kind := 'ACTIVATION'; target_object := target_id;
    safe_metadata := pg_catalog.jsonb_build_object(
      'summary', 'Tournament marked Ready for Activation',
      'readinessFingerprint', readiness->>'fingerprint'
    );
    result_value := pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'PRODUCTION_FUTURE_TOURNAMENT_READY',
      'action', action_value, 'tournamentId', target_id,
      'lifecycle', 'READY_FOR_ACTIVATION',
      'readinessFingerprint', readiness->>'fingerprint',
      'priorRevision', prior_revision, 'nextRevision', next_revision,
      'idempotent', false
    );

  elsif action_value = 'ACTIVATE_TOURNAMENT' then
    select value.* into strict pointer
    from production_control.current_tournament_pointer_v1 value
    where value.scope_key = (resource_context->>'resource_id') for update;
    select value.* into strict catalog
    from production_control.future_tournament_catalog_v1 value
    where value.tournament_id = target_id for update;
    select value.* into strict activation
    from production_control.cutover_activation_state value
    where value.scope_key = (resource_context->>'resource_id') for update;
    readiness := production_control.future_runtime_readiness_v2(target_id);
    begin previous_pointer_revision :=
      (input->>'expected_pointer_revision')::bigint;
    exception when others then
      raise exception using errcode = '22023',
        message = 'FUTURE_ACTIVATION_POINTER_REVISION_INVALID';
    end;
    prior_revision := catalog.lifecycle_revision;
    if expected_revision <> prior_revision
       or previous_pointer_revision <> pointer.pointer_revision
       or catalog.lifecycle <> 'READY_FOR_ACTIVATION'
       or catalog.readiness_fingerprint is null
       or catalog.readiness_fingerprint <> readiness->>'fingerprint'
       or input->>'readiness_fingerprint'
         is distinct from readiness->>'fingerprint'
       or not (readiness->>'ready')::boolean
       or not exists (
         select 1 from production_control.future_tournament_catalog_v1 current_value
         where current_value.tournament_id = pointer.tournament_id
           and current_value.lifecycle = 'CLOSED'
       )
       or activation.state <> 'SCORING_COMMITTED'
       or activation.current_authority <> 'SUPABASE'
       or not activation.scoring_ingress_enabled
       or activation.active_transition_epoch_id is not null
       or exists (select 1 from scoring_authority.scoring_ingress_leases value
         where value.expires_at > pg_catalog.clock_timestamp())
       or exists (select 1 from scoring_authority.google_outbox_events value
         where value.status in ('PENDING', 'PROCESSING', 'RETRYABLE'))
       or exists (select 1 from scoring_authority.scorecard_archive_jobs value
         where value.status in ('PENDING', 'PROCESSING', 'RETRYABLE')) then
      raise exception using errcode = '40001',
        message = 'FUTURE_TOURNAMENT_ACTIVATION_PREDECESSOR_INVALID';
    end if;
    if exists (select 1 from production_control.future_annual_runtime_generations_v1
      where generation_status = 'ACTIVE') then
      raise exception using errcode = '55000',
        message = 'FUTURE_ACTIVE_RUNTIME_GENERATION_EXISTS';
    end if;
    next_revision := prior_revision + 1;
    generation_id := extensions.gen_random_uuid();
    authority_generation_id_value := extensions.gen_random_uuid();
    admission_generation_id_value := extensions.gen_random_uuid();
    insert into production_control.future_annual_runtime_generations_v1 (
      runtime_generation_id, tournament_id, generation_status,
      runtime_revision, pointer_revision, authority_generation_id,
      admission_generation_id, authority, ingress_state,
      readiness_fingerprint
    ) values (
      generation_id, target_id, 'PREPARED', 1,
      pointer.pointer_revision + 1, authority_generation_id_value,
      admission_generation_id_value, 'SUPABASE', 'OPEN',
      readiness->>'fingerprint'
    );
    if pg_catalog.to_regprocedure(
      'production_control.assert_future_scoring_runtime_capability_v1(text,uuid,uuid,uuid)'
    ) is null then
      raise exception using errcode = '55000',
        message = 'FUTURE_SCORING_RUNTIME_CAPABILITY_NOT_INSTALLED';
    end if;
    execute 'select production_control.assert_future_scoring_runtime_capability_v1($1,$2,$3,$4)'
      using target_id, generation_id, authority_generation_id_value,
        admission_generation_id_value;
    if pg_catalog.to_regprocedure(
      'production_control.bind_future_participant_identity_runtime_v1(text,uuid,uuid,uuid,text,uuid)'
    ) is null then
      raise exception using errcode = '55000',
        message = 'FUTURE_PARTICIPANT_IDENTITY_CAPABILITY_NOT_INSTALLED';
    end if;
    execute 'select production_control.bind_future_participant_identity_runtime_v1($1,$2,$3,$4,$5,$6)'
      using target_id, generation_id, authority_generation_id_value,
        admission_generation_id_value, actor_player, actor_auth;
    update production_control.future_tournament_catalog_v1 set
      lifecycle = 'ACTIVE', lifecycle_revision = next_revision,
      updated_by_player_id = actor_player,
      updated_by_auth_user_id = actor_auth,
      updated_at = pg_catalog.clock_timestamp()
    where tournament_id = target_id;
    update production_control.current_tournament_pointer_v1 set
      tournament_id = target_id, tournament_year = catalog.tournament_year,
      pointer_revision = pointer.pointer_revision + 1,
      lifecycle_revision = next_revision,
      updated_by_player_id = actor_player,
      updated_by_auth_user_id = actor_auth,
      updated_at = pg_catalog.clock_timestamp()
    where scope_key = (resource_context->>'resource_id')
      and pointer_revision = previous_pointer_revision;
    if not found then
      raise exception using errcode = '40001',
        message = 'FUTURE_TOURNAMENT_POINTER_CAS_FAILED';
    end if;
    update production_control.future_annual_runtime_generations_v1 set
      generation_status = 'ACTIVE', activated_by_player_id = actor_player,
      activated_by_auth_user_id = actor_auth,
      activated_at = pg_catalog.clock_timestamp(),
      updated_at = pg_catalog.clock_timestamp()
    where runtime_generation_id = generation_id
      and generation_status = 'PREPARED';
    update production_control.future_runtime_promotions_v2 set
      runtime_status = 'ACTIVE', updated_at = pg_catalog.clock_timestamp()
    where tournament_id = target_id;
    target_kind := 'ACTIVATION'; target_object := target_id;
    safe_metadata := pg_catalog.jsonb_build_object(
      'summary', 'Future tournament activated',
      'pointerRevision', pointer.pointer_revision + 1,
      'runtimeGenerationId', generation_id
    );
    result_value := pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'PRODUCTION_FUTURE_TOURNAMENT_ACTIVATED',
      'action', action_value, 'tournamentId', target_id,
      'tournamentYear', catalog.tournament_year,
      'runtimeGenerationId', generation_id,
      'authorityGenerationId', authority_generation_id_value,
      'admissionGenerationId', admission_generation_id_value,
      'pointerRevision', pointer.pointer_revision + 1,
      'priorRevision', prior_revision, 'nextRevision', next_revision,
      'idempotent', false
    );

  elsif action_value = 'CLOSE_TOURNAMENT' then
    select value.* into strict pointer
    from production_control.current_tournament_pointer_v1 value
    where value.scope_key = (resource_context->>'resource_id') for update;
    select value.* into strict catalog
    from production_control.future_tournament_catalog_v1 value
    where value.tournament_id = target_id for update;
    prior_revision := catalog.lifecycle_revision;
    blockers := '[]'::jsonb;
    if pointer.tournament_id <> target_id or catalog.lifecycle <> 'ACTIVE' then
      blockers := blockers || pg_catalog.jsonb_build_array(
        'CURRENT_ACTIVE_TOURNAMENT_REQUIRED'
      );
    end if;
    if not exists (select 1 from scoring_authority.matches value
      where value.tournament_id = target_id)
       or exists (select 1 from scoring_authority.matches value
        where value.tournament_id = target_id
          and (value.status <> 'FINAL' or not value.scorecard_complete
            or value.unresolved_mutations <> 0)) then
      blockers := blockers || pg_catalog.jsonb_build_array(
        'ALL_MATCHES_FINAL_REQUIRED'
      );
    end if;
    if exists (select 1 from scoring_authority.matches match_value
      where match_value.tournament_id = target_id and not exists (
        select 1 from scoring_authority.finalized_scorecard_snapshots final
        where final.match_id = match_value.match_id and final.state = 'CURRENT'
          and final.match_revision = match_value.match_revision
          and final.scoring_snapshot_id = match_value.scoring_snapshot_id
      )) then
      blockers := blockers || pg_catalog.jsonb_build_array(
        'FINAL_SCORECARD_SNAPSHOT_REQUIRED'
      );
    end if;
    if exists (select 1 from scoring_authority.scoring_ingress_leases value
      where value.tournament_id = target_id
        and value.expires_at > pg_catalog.clock_timestamp())
       or exists (select 1 from scoring_authority.google_outbox_events value
        where value.tournament_id = target_id
          and value.status in ('PENDING', 'PROCESSING', 'RETRYABLE'))
       or exists (select 1 from scoring_authority.scorecard_archive_jobs value
        where value.tournament_id = target_id
          and value.status in ('PENDING', 'PROCESSING', 'RETRYABLE')) then
      blockers := blockers || pg_catalog.jsonb_build_array(
        'SCORING_OR_ARCHIVE_QUEUE_UNRESOLVED'
      );
    end if;
    if exists (
      select 1 from scoring_authority.net_skins_v1_configuration_current cfg
      where cfg.tournament_id = target_id and cfg.state = 'CONFIGURED'
        and exists (select 1 from scoring_authority.rounds round_value
          where round_value.tournament_id = target_id and not exists (
            select 1 from scoring_authority.net_skins_v1_result_revisions result
            where result.tournament_id = target_id
              and result.round_number = round_value.round_number
              and result.result_state = 'OFFICIAL' and result.is_current
          ))
    ) or exists (
      select 1 from scoring_authority.calcutta_v1_current value
      where value.tournament_id = target_id
        and value.state not in ('NOT_CONFIGURED', 'OFFICIAL')
    ) then
      blockers := blockers || pg_catalog.jsonb_build_array(
        'CONFIGURED_SIDE_GAME_OFFICIAL_RESULT_REQUIRED'
      );
    end if;
    if expected_revision <> prior_revision
       or pg_catalog.jsonb_array_length(blockers) > 0 then
      raise exception using errcode = '40001',
        message = 'FUTURE_TOURNAMENT_CLOSE_BLOCKED',
        detail = blockers::text;
    end if;
    next_revision := prior_revision + 1;
    update production_control.future_tournament_catalog_v1 set
      lifecycle = 'CLOSED', lifecycle_revision = next_revision,
      updated_by_player_id = actor_player,
      updated_by_auth_user_id = actor_auth,
      updated_at = pg_catalog.clock_timestamp()
    where tournament_id = target_id;
    update production_control.future_annual_runtime_generations_v1 set
      generation_status = 'CLOSED', closed_by_player_id = actor_player,
      closed_at = pg_catalog.clock_timestamp(),
      runtime_revision = runtime_revision + 1,
      updated_at = pg_catalog.clock_timestamp()
    where tournament_id = target_id and generation_status = 'ACTIVE';
    update production_control.future_runtime_promotions_v2 set
      runtime_status = 'CLOSED', updated_at = pg_catalog.clock_timestamp()
    where tournament_id = target_id;
    target_kind := 'CLOSE'; target_object := target_id;
    safe_metadata := pg_catalog.jsonb_build_object(
      'summary', 'Tournament closed', 'newScoringAllowed', false
    );
    result_value := pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'PRODUCTION_FUTURE_TOURNAMENT_CLOSED',
      'action', action_value, 'tournamentId', target_id,
      'lifecycle', 'CLOSED', 'priorRevision', prior_revision,
      'nextRevision', next_revision, 'idempotent', false
    );

  elsif action_value = 'PREPARE_ARCHIVE_PLAN' then
    select value.* into strict catalog
    from production_control.future_tournament_catalog_v1 value
    where value.tournament_id = target_id for update;
    prior_revision := coalesce((select pg_catalog.max(value.plan_revision)
      from production_control.future_archive_plans_v1 value
      where value.tournament_id = target_id), 0);
    if expected_revision <> prior_revision or catalog.lifecycle <> 'CLOSED' then
      raise exception using errcode = '40001',
        message = 'FUTURE_ARCHIVE_PLAN_PREDECESSOR_INVALID';
    end if;
    blockers := '[]'::jsonb;
    if exists (select 1 from scoring_authority.matches value
      where value.tournament_id = target_id and (
        value.status <> 'FINAL' or not value.scorecard_complete
      )) then blockers := blockers || pg_catalog.jsonb_build_array(
      'FINAL_MATCH_FACTS_INCOMPLETE'
    ); end if;
    if exists (select 1 from scoring_authority.scorecard_archive_checkpoints value
      where value.tournament_id = target_id and value.status <> 'VERIFIED') then
      blockers := blockers || pg_catalog.jsonb_build_array(
        'ROUND_SCORECARDS_ARCHIVE_INCOMPLETE'
      );
    end if;
    source_fingerprint := production_control.future_runtime_hash_v2(
      pg_catalog.jsonb_build_object(
        'contractVersion', 'production-future-archive-source-v1',
        'tournamentId', target_id,
        'tournament', (select pg_catalog.to_jsonb(value)
          from scoring_authority.tournaments value
          where value.tournament_id = target_id),
        'teams', (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(value)
          order by value.team_side) from scoring_authority.teams value
          where value.tournament_id = target_id),
        'roster', (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(value)
          order by value.player_id)
          from scoring_authority.tournament_players value
          where value.tournament_id = target_id),
        'rounds', (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(value)
          order by value.round_number) from scoring_authority.rounds value
          where value.tournament_id = target_id),
        'matches', (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(value)
          order by value.match_id) from scoring_authority.matches value
          where value.tournament_id = target_id),
        'finalizedScorecards', (select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'matchId', value.match_id, 'matchRevision', value.match_revision,
            'snapshotRevision', value.snapshot_revision,
            'sourceFingerprint', value.source_fingerprint,
            'payloadHash', value.payload_hash
          ) order by value.match_id)
          from scoring_authority.finalized_scorecard_snapshots value
          where value.tournament_id = target_id and value.state = 'CURRENT')
      )
    );
    archive_fingerprint := production_control.future_runtime_hash_v2(
      pg_catalog.jsonb_build_object(
        'contractVersion', 'production-future-archive-plan-v1',
        'tournamentId', target_id,
        'lifecycleRevision', catalog.lifecycle_revision,
        'sourceFingerprint', source_fingerprint,
        'blockers', blockers,
        'actualHistoryPromotionInstalled', false
      )
    );
    next_revision := prior_revision + 1;
    insert into production_control.future_archive_plans_v1 (
      tournament_id, plan_revision, lifecycle_revision,
      source_fingerprint, archive_fingerprint, readiness_status,
      blocker_codes, created_by_player_id
    ) values (
      target_id, next_revision, catalog.lifecycle_revision,
      source_fingerprint, archive_fingerprint,
      case when pg_catalog.jsonb_array_length(blockers) = 0
        then 'READY' else 'BLOCKED' end,
      blockers, actor_player
    );
    target_kind := 'ARCHIVE_PLAN'; target_object := target_id;
    safe_metadata := pg_catalog.jsonb_build_object(
      'summary', 'Archive readiness plan prepared',
      'ready', pg_catalog.jsonb_array_length(blockers) = 0,
      'historyPromotionExecuted', false
    );
    result_value := pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'PRODUCTION_FUTURE_ARCHIVE_PLAN_PREPARED',
      'action', action_value, 'tournamentId', target_id,
      'planRevision', next_revision,
      'readinessStatus', case when pg_catalog.jsonb_array_length(blockers) = 0
        then 'READY' else 'BLOCKED' end,
      'blockers', blockers, 'sourceFingerprint', source_fingerprint,
      'archiveFingerprint', archive_fingerprint,
      'historyPromotionExecuted', false,
      'priorRevision', prior_revision, 'nextRevision', next_revision,
      'idempotent', false
    );

  elsif action_value = 'PREPARE_SCORING_CONTEXT' then
    select value.* into strict catalog
    from production_control.future_tournament_catalog_v1 value
    where value.tournament_id = target_id for update;
    select value.* into strict match_value
    from scoring_authority.matches value
    where value.tournament_id = target_id
      and value.match_id = input->>'match_id' for update;
    select value.* into strict binding
    from production_control.future_runtime_match_bindings_v2 value
    where value.match_id = match_value.match_id for update;
    select value.* into strict detail
    from scoring_authority.tournament_setup_match_details_v1 value
    where value.match_id = match_value.match_id;
    select value.revision_id into strict current_handicap
    from scoring_authority.handicap_revision_current value
    where value.tournament_id = target_id;
    prior_revision := binding.runtime_revision;
    expected_count := case when match_value.format = 'SI' then 2 else 4 end;
    if expected_revision <> prior_revision
       or catalog.lifecycle not in ('DRAFT', 'CONFIGURING')
       or match_value.status <> 'UPCOMING' or match_value.match_revision <> 0
       or (select pg_catalog.count(*)
         from scoring_authority.match_participants value
         where value.match_id = match_value.match_id) <> expected_count
       or (select pg_catalog.count(*)
         from scoring_authority.tournament_setup_course_holes_v1 hole
         where hole.tournament_id = target_id
           and hole.course_id = detail.course_id
           and hole.tee_id = detail.tee_id) <> 18 then
      raise exception using errcode = '40001',
        message = 'FUTURE_SCORING_CONTEXT_PREDECESSOR_INVALID';
    end if;
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'hole_number', hole.hole_number, 'par', hole.par,
      'stroke_index', hole.stroke_index, 'yardage', hole.yardage
    ) order by hole.hole_number) into strict holes_value
    from scoring_authority.tournament_setup_course_holes_v1 hole
    where hole.tournament_id = target_id
      and hole.course_id = detail.course_id and hole.tee_id = detail.tee_id;
    context_value := production_control.future_handicap_match_context_v2(
      match_value.match_id, current_handicap
    );
    participant_manifest := context_value->'participant_configuration';
    preparation_fingerprint := production_control.future_runtime_hash_v2(
      pg_catalog.jsonb_build_object(
        'contractVersion', 'production-future-scoring-context-v1',
        'tournamentId', target_id, 'matchId', match_value.match_id,
        'round', match_value.round_number, 'format', match_value.format,
        'courseId', detail.course_id, 'teeId', detail.tee_id,
        'startingHole', detail.starting_hole,
        'holes', holes_value, 'participants', participant_manifest,
        'teams', context_value->'team_configuration',
        'handicapRevisionId', current_handicap,
        'setupRevision', detail.setup_revision,
        'runtimeRevision', binding.runtime_revision
      )
    );
    select coalesce(pg_catalog.max(value.snapshot_revision), 0) + 1
      into next_snapshot_revision
    from scoring_authority.scoring_snapshots value
    where value.match_id = match_value.match_id;
    next_snapshot_id := match_value.match_id || ':S' || next_snapshot_revision;
    next_snapshot_hash := production_control.future_runtime_hash_v2(
      pg_catalog.jsonb_build_object(
        'preparationFingerprint', preparation_fingerprint,
        'snapshotRevision', next_snapshot_revision,
        'participantConfiguration', participant_manifest,
        'teamConfiguration', context_value->'team_configuration'
      )
    );
    insert into scoring_authority.scoring_snapshots (
      snapshot_id, tournament_id, match_id, snapshot_revision,
      scoring_rules_version, format, handicap_allowance,
      course_id, tee, rating, slope, par, match_netting_baseline,
      hole_definitions, participant_configuration, team_configuration,
      effective_at, canonical_hash, handicap_revision_id
    ) select next_snapshot_id, target_id, match_value.match_id,
      next_snapshot_revision, 'production-scoring-rules-v1',
      match_value.format, round_value.handicap_allowance,
      detail.course_id, detail.tee_id, tee.rating, tee.slope, tee.par,
      'LOWEST_PLAYING_HANDICAP', holes_value, participant_manifest,
      context_value->'team_configuration', pg_catalog.clock_timestamp(),
      next_snapshot_hash, current_handicap
    from scoring_authority.rounds round_value
    join scoring_authority.tournament_setup_course_tees_v1 tee
      on tee.tournament_id = round_value.tournament_id
     and tee.course_id = detail.course_id and tee.tee_id = detail.tee_id
    where round_value.tournament_id = target_id
      and round_value.round_number = match_value.round_number;
    update scoring_authority.match_participants participant set
      tournament_handicap = (item->>'tournament_handicap')::numeric,
      handicap_index = (item->>'handicap_index')::numeric,
      course_handicap = (item->>'course_handicap')::numeric,
      playing_handicap = (item->>'playing_handicap')::numeric,
      final_strokes = (item->>'final_strokes')::integer,
      handicap_revision_id = current_handicap
    from pg_catalog.jsonb_array_elements(context_value->'participants') item
    where participant.match_id = match_value.match_id
      and participant.player_id = item->>'player_id';
    delete from scoring_authority.match_holes value
    where value.match_id = match_value.match_id;
    insert into scoring_authority.match_holes (
      match_id, hole_number, snapshot_id, stroke_index, par, yardage
    ) select match_value.match_id, (item->>'hole_number')::integer,
      next_snapshot_id, (item->>'stroke_index')::integer,
      (item->>'par')::integer, nullif(item->>'yardage', '')::integer
    from pg_catalog.jsonb_array_elements(holes_value) item;
    update scoring_authority.matches set
      scoring_snapshot_id = next_snapshot_id,
      scoring_locked = true, updated_at = pg_catalog.clock_timestamp()
    where match_id = match_value.match_id;
    next_revision := prior_revision + 1;
    update scoring_authority.tournament_setup_match_details_v1 set
      prepared_setup_revision = setup_revision,
      prepared_configuration_fingerprint = preparation_fingerprint,
      updated_by_player_id = actor_player,
      updated_at = pg_catalog.clock_timestamp()
    where match_id = match_value.match_id;
    update production_control.future_runtime_match_bindings_v2 set
      runtime_revision = next_revision, runtime_state = 'PREPARED',
      configuration_fingerprint = preparation_fingerprint,
      updated_at = pg_catalog.clock_timestamp()
    where match_id = match_value.match_id;
    target_kind := 'SCORING_CONTEXT'; target_object := match_value.match_id;
    safe_metadata := pg_catalog.jsonb_build_object(
      'summary', 'Future scoring snapshot prepared',
      'matchId', match_value.match_id,
      'snapshotRevision', next_snapshot_revision,
      'scoringAccessGranted', false, 'scoreFactsChanged', false
    );
    result_value := pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'PRODUCTION_FUTURE_SCORING_CONTEXT_PREPARED',
      'action', action_value, 'tournamentId', target_id,
      'matchId', match_value.match_id, 'snapshotId', next_snapshot_id,
      'snapshotRevision', next_snapshot_revision,
      'configurationFingerprint', preparation_fingerprint,
      'priorRevision', prior_revision, 'nextRevision', next_revision,
      'scoringAccessGranted', false, 'idempotent', false
    );


  elsif action_value = 'STAGE_HANDICAPS' then
    select value.* into strict catalog
    from production_control.future_tournament_catalog_v1 value
    where value.tournament_id = target_id for update;
    select value.* into strict promotion
    from production_control.future_runtime_promotions_v2 value
    where value.tournament_id = target_id;
    select coalesce(value.revision_number, 0), value.revision_id
      into prior_revision, current_handicap
    from scoring_authority.handicap_revision_current value
    where value.tournament_id = target_id;
    prior_revision := coalesce(prior_revision, 0);
    if expected_revision <> prior_revision
       or catalog.lifecycle not in ('DRAFT', 'CONFIGURING')
       or promotion.tournament_id is null
       or pg_catalog.jsonb_typeof(input->'entries') <> 'array'
       or pg_catalog.jsonb_array_length(input->'entries') < 1 then
      raise exception using errcode = '40001',
        message = 'FUTURE_HANDICAP_STAGE_PREDECESSOR_INVALID';
    end if;
    if (select pg_catalog.count(*)
      from pg_catalog.jsonb_array_elements(input->'entries')) <>
       (select pg_catalog.count(*)
        from scoring_authority.tournament_players value
        where value.tournament_id = target_id
          and value.participation_status = 'ACTIVE')
       or (select pg_catalog.count(distinct pg_catalog.upper(
          pg_catalog.btrim(item->>'player_id')))
        from pg_catalog.jsonb_array_elements(input->'entries') item) <>
         pg_catalog.jsonb_array_length(input->'entries')
       or exists (
         select 1 from pg_catalog.jsonb_array_elements(input->'entries') item
         where coalesce(item->>'player_id', '') !~
             '^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$'
           or coalesce(item->>'tournament_handicap', '') !~
             '^-?[0-9]+(?:\.[0-9]+)?$'
           or not exists (
             select 1 from scoring_authority.tournament_players membership
             where membership.tournament_id = target_id
               and membership.player_id = pg_catalog.upper(
                 pg_catalog.btrim(item->>'player_id')
               )
               and membership.participation_status = 'ACTIVE'
           )
       ) then
      raise exception using errcode = '22023',
        message = 'FUTURE_HANDICAP_COMPLETE_ACTIVE_ROSTER_REQUIRED';
    end if;
    next_revision := coalesce((select pg_catalog.max(value.revision_number)
      from scoring_authority.handicap_revisions value
      where value.tournament_id = target_id), 0) + 1;
    handicap_revision_id_value := extensions.gen_random_uuid();
    manifest_fingerprint := production_control.future_runtime_hash_v2(
      (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'player_id', pg_catalog.upper(pg_catalog.btrim(item->>'player_id')),
        'tournament_handicap', (item->>'tournament_handicap')::numeric,
        'source_index', nullif(item->>'source_index', '')::numeric,
        'low_index', nullif(item->>'low_index', '')::numeric
      ) order by pg_catalog.upper(pg_catalog.btrim(item->>'player_id')))
      from pg_catalog.jsonb_array_elements(input->'entries') item)
    );
    insert into scoring_authority.handicap_revisions (
      revision_id, tournament_id, revision_number, status,
      effective_date, method, source_metadata, source_evidence_date,
      canonical_fingerprint, roster_fingerprint,
      predecessor_revision, predecessor_revision_id,
      context_contract_version, created_by, created_by_auth_user_id
    ) values (
      handicap_revision_id_value, target_id, next_revision, 'DRAFT',
      catalog.start_date,
      pg_catalog.btrim(coalesce(input->>'method', 'DIRECTOR_REVIEW')),
      pg_catalog.jsonb_build_object(
        'source', 'DIRECTOR_FUTURE_RUNTIME_V2',
        'sourceYear', input->>'source_year',
        'carryForwardApproved', false
      ), nullif(input->>'source_evidence_date', '')::date,
      manifest_fingerprint,
      production_control.handicap_v1_roster_fingerprint(target_id),
      prior_revision, current_handicap,
      'production-handicap-context-v1', actor_player, actor_auth
    );
    insert into scoring_authority.handicap_revision_entries (
      revision_id, tournament_id, player_id, tournament_handicap,
      source_index, low_index, source_metadata
    ) select handicap_revision_id_value, target_id,
      pg_catalog.upper(pg_catalog.btrim(item->>'player_id')),
      (item->>'tournament_handicap')::numeric,
      nullif(item->>'source_index', '')::numeric,
      nullif(item->>'low_index', '')::numeric,
      pg_catalog.jsonb_build_object('source', 'DIRECTOR_FUTURE_RUNTIME_V2')
    from pg_catalog.jsonb_array_elements(input->'entries') item;
    insert into scoring_authority.handicap_audit_events (
      tournament_id, revision_id, action, actor_player_id,
      actor_auth_user_id, operation_request_id, request_payload_hash,
      canonical_fingerprint, before_state, after_state
    ) values (
      target_id, handicap_revision_id_value, 'REVISION_STAGED', actor_player,
      actor_auth, request_id, database_hash, manifest_fingerprint,
      pg_catalog.jsonb_build_object('approvedRevision', prior_revision),
      pg_catalog.jsonb_build_object(
        'draftRevision', next_revision, 'entryCount',
          pg_catalog.jsonb_array_length(input->'entries')
      )
    );
    target_kind := 'HANDICAP';
    target_object := handicap_revision_id_value::text;
    safe_metadata := pg_catalog.jsonb_build_object(
      'summary', 'Future handicap revision staged',
      'revision', next_revision,
      'entryCount', pg_catalog.jsonb_array_length(input->'entries')
    );
    result_value := pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'PRODUCTION_FUTURE_HANDICAPS_STAGED',
      'action', action_value, 'tournamentId', target_id,
      'revisionId', handicap_revision_id_value, 'revisionNumber', next_revision,
      'canonicalFingerprint', manifest_fingerprint,
      'priorRevision', prior_revision, 'nextRevision', next_revision,
      'idempotent', false
    );

  elsif action_value = 'APPROVE_HANDICAPS' then
    select value.* into strict catalog
    from production_control.future_tournament_catalog_v1 value
    where value.tournament_id = target_id for update;
    begin handicap_revision_id_value :=
      (input->>'handicap_revision_id')::uuid;
    exception when others then
      raise exception using errcode = '22023',
        message = 'FUTURE_HANDICAP_REVISION_ID_INVALID';
    end;
    select coalesce(value.revision_number, 0), value.revision_id
      into prior_revision, current_handicap
    from scoring_authority.handicap_revision_current value
    where value.tournament_id = target_id;
    prior_revision := coalesce(prior_revision, 0);
    if expected_revision <> prior_revision
       or catalog.lifecycle not in ('DRAFT', 'CONFIGURING')
       or not exists (
         select 1 from scoring_authority.handicap_revisions value
         where value.revision_id = handicap_revision_id_value
           and value.tournament_id = target_id and value.status = 'DRAFT'
           and value.predecessor_revision = prior_revision
       )
       or (select pg_catalog.count(*)
         from scoring_authority.handicap_revision_entries value
         where value.revision_id = handicap_revision_id_value) <>
         (select pg_catalog.count(*)
          from scoring_authority.tournament_players value
          where value.tournament_id = target_id
            and value.participation_status = 'ACTIVE') then
      raise exception using errcode = '40001',
        message = 'FUTURE_HANDICAP_APPROVAL_PREDECESSOR_INVALID';
    end if;
    if current_handicap is not null then
      update scoring_authority.handicap_revisions set
        status = 'SUPERSEDED', superseded_at = pg_catalog.clock_timestamp()
    where scoring_authority.handicap_revisions.revision_id = current_handicap;
    end if;
    update scoring_authority.handicap_revisions set
      status = 'APPROVED', approved_by = actor_player,
      approved_by_auth_user_id = actor_auth,
      approved_at = pg_catalog.clock_timestamp()
    where scoring_authority.handicap_revisions.revision_id =
      handicap_revision_id_value;
    select value.revision_number into strict next_revision
    from scoring_authority.handicap_revisions value
    where value.revision_id = handicap_revision_id_value;
    insert into scoring_authority.handicap_revision_current (
      tournament_id, revision_id, revision_number
    ) values (target_id, handicap_revision_id_value, next_revision)
    on conflict (tournament_id) do update set
      revision_id = excluded.revision_id,
      revision_number = excluded.revision_number,
      updated_at = pg_catalog.clock_timestamp();
    update scoring_authority.tournament_players membership set
      tournament_handicap = entry.tournament_handicap,
      handicap_revision_id = handicap_revision_id_value,
      updated_at = pg_catalog.clock_timestamp()
    from scoring_authority.handicap_revision_entries entry
    where entry.revision_id = handicap_revision_id_value
      and entry.tournament_id = target_id
      and membership.tournament_id = entry.tournament_id
      and membership.player_id = entry.player_id;
    -- A changed approved context invalidates only affected private, unstarted
    -- future snapshots.  Immutable snapshot rows remain as evidence.
    delete from scoring_authority.match_holes hole
    using scoring_authority.matches handicap_match
    where handicap_match.tournament_id = target_id
      and handicap_match.status = 'UPCOMING' and handicap_match.match_revision = 0
      and hole.match_id = handicap_match.match_id;
    update scoring_authority.matches set
      scoring_snapshot_id = null, scoring_locked = true,
      updated_at = pg_catalog.clock_timestamp()
    where tournament_id = target_id and status = 'UPCOMING'
      and match_revision = 0 and scoring_snapshot_id is not null;
    update scoring_authority.tournament_setup_match_details_v1 set
      prepared_setup_revision = null,
      prepared_configuration_fingerprint = null,
      updated_by_player_id = actor_player,
      updated_at = pg_catalog.clock_timestamp()
    where tournament_id = target_id;
    update production_control.future_runtime_match_bindings_v2 set
      runtime_state = case when exists (
        select 1 from scoring_authority.match_participants participant
        where participant.match_id = future_runtime_match_bindings_v2.match_id
      ) then 'PAIRED' else 'CONFIGURED' end,
      runtime_revision = runtime_revision + 1,
      configuration_fingerprint = null,
      updated_at = pg_catalog.clock_timestamp()
    where tournament_id = target_id;
    update scoring_authority.match_participants participant set
      tournament_handicap = entry.tournament_handicap,
      handicap_index = entry.tournament_handicap,
      handicap_revision_id = handicap_revision_id_value
    from scoring_authority.handicap_revision_entries entry,
      scoring_authority.matches handicap_match
    where handicap_match.match_id = participant.match_id
      and handicap_match.tournament_id = target_id
      and entry.revision_id = handicap_revision_id_value
      and entry.player_id = participant.player_id;
    insert into scoring_authority.handicap_audit_events (
      tournament_id, revision_id, action, actor_player_id,
      actor_auth_user_id, operation_request_id, request_payload_hash,
      canonical_fingerprint, before_state, after_state
    ) select target_id, value.revision_id, 'REVISION_APPROVED', actor_player,
      actor_auth, request_id, database_hash, value.canonical_fingerprint,
      pg_catalog.jsonb_build_object('approvedRevision', prior_revision),
      pg_catalog.jsonb_build_object('approvedRevision', next_revision)
    from scoring_authority.handicap_revisions value
    where value.revision_id = handicap_revision_id_value;
    target_kind := 'HANDICAP';
    target_object := handicap_revision_id_value::text;
    safe_metadata := pg_catalog.jsonb_build_object(
      'summary', 'Future handicap revision approved',
      'revision', next_revision, 'scoringFactsChanged', false
    );
    result_value := pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'PRODUCTION_FUTURE_HANDICAPS_APPROVED',
      'action', action_value, 'tournamentId', target_id,
      'revisionId', handicap_revision_id_value,
      'revisionNumber', next_revision,
      'priorRevision', prior_revision, 'nextRevision', next_revision,
      'snapshotsInvalidated', true, 'scoreFactsChanged', false,
      'idempotent', false
    );


  elsif action_value = 'PROMOTE_RUNTIME_STRUCTURE' then
    if target_id = '' then
      raise exception using errcode = '22023',
        message = 'FUTURE_RUNTIME_TARGET_REQUIRED';
    end if;
    select value.* into strict catalog
    from production_control.future_tournament_catalog_v1 value
    where value.tournament_id = target_id for update;
    select value.* into strict pointer
    from production_control.current_tournament_pointer_v1 value
    where value.scope_key = (resource_context->>'resource_id');
    select value.* into strict resource
    from production_control.future_tournament_resources_v1 value
    where value.tournament_id = target_id;
    prior_revision := coalesce((select value.promotion_revision
      from production_control.future_runtime_promotions_v2 value
      where value.tournament_id = target_id), 0);
    if expected_revision <> prior_revision
       or pointer.tournament_id = target_id
       or target_id = '2026'
       or catalog.lifecycle not in ('DRAFT', 'CONFIGURING')
       or catalog.setup_revision <= 0
       or resource.source_workbook_id is null
       or resource.project_ref is distinct from
         (select project_ref from production_control.canonical_resource_v1
          where resource_id = (resource_context->>'resource_id'))
       or resource.project_url is distinct from
         (select project_url from production_control.canonical_resource_v1
          where resource_id = (resource_context->>'resource_id')) then
      raise exception using errcode = '40001',
        message = 'FUTURE_RUNTIME_PROMOTION_PREDECESSOR_INVALID';
    end if;
    if prior_revision > 0 then
      raise exception using errcode = '55000',
        message = 'FUTURE_RUNTIME_ALREADY_PROMOTED';
    end if;
    if exists (select 1 from scoring_authority.tournaments value
      where value.tournament_id = target_id)
       or (select pg_catalog.count(*)
        from production_control.future_tournament_teams_v1 value
        where value.tournament_id = target_id and value.active) <> 2
       or not exists (select 1
        from production_control.future_tournament_roster_v1 value
        where value.tournament_id = target_id
          and value.participation_status = 'ACTIVE')
       or exists (select 1
        from production_control.future_tournament_roster_v1 value
        where value.tournament_id = target_id
          and value.participation_status = 'ACTIVE'
          and (value.team_id is null or value.team_side is null))
       or not exists (select 1
        from production_control.future_tournament_rounds_v1 value
        where value.tournament_id = target_id)
       or not exists (select 1
        from production_control.future_match_definitions_v1 value
        where value.tournament_id = target_id) then
      raise exception using errcode = '55000',
        message = 'FUTURE_RUNTIME_STAGED_STRUCTURE_INCOMPLETE';
    end if;
    manifest_fingerprint := production_control.future_runtime_hash_v2(
      pg_catalog.jsonb_build_object(
        'contractVersion', 'production-future-runtime-promotion-v2',
        'tournamentId', target_id, 'year', catalog.tournament_year,
        'setupRevision', catalog.setup_revision,
        'teams', (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(value)
          order by value.team_side)
          from production_control.future_tournament_teams_v1 value
          where value.tournament_id = target_id),
        'roster', (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(value)
          order by value.player_id)
          from production_control.future_tournament_roster_v1 value
          where value.tournament_id = target_id),
        'rounds', (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(value)
          order by value.round_number)
          from production_control.future_tournament_rounds_v1 value
          where value.tournament_id = target_id),
        'courses', (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(value)
          order by value.round_number)
          from production_control.future_tournament_course_references_v1 value
          where value.tournament_id = target_id),
        'matches', (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(value)
          order by value.round_number, value.match_number)
          from production_control.future_match_definitions_v1 value
          where value.tournament_id = target_id)
      )
    );
    insert into scoring_authority.tournaments (
      tournament_id, tournament_year, name, source_workbook_id,
      scoring_authority
    ) values (
      target_id, catalog.tournament_year, catalog.tournament_name,
      resource.source_workbook_id, 'SUPABASE'
    );
    insert into scoring_authority.teams (
      tournament_id, team_id, team_side, name, source_payload
    ) select target_id, value.team_id, value.team_side, value.team_name,
      pg_catalog.jsonb_build_object(
        'futureRuntimePromotion', true,
        'captainPlayerId', value.captain_player_id
      )
    from production_control.future_tournament_teams_v1 value
    where value.tournament_id = target_id and value.active;
    insert into scoring_authority.tournament_players (
      tournament_id, player_id, team_id, team_side,
      participation_status, source_roster_key, source_payload
    ) select target_id, value.player_id, value.team_id, value.team_side,
      value.participation_status,
      target_id || ':' || value.player_id,
      pg_catalog.jsonb_build_object('futureRuntimePromotion', true)
    from production_control.future_tournament_roster_v1 value
    where value.tournament_id = target_id
      and value.team_id is not null and value.team_side is not null;
    insert into scoring_authority.rounds (
      tournament_id, round_number, format, name, handicap_allowance,
      status, source_payload
    ) select target_id, value.round_number, value.format, value.round_name,
      value.handicap_allowance, 'UPCOMING',
      pg_catalog.jsonb_build_object('futureRuntimePromotion', true)
    from production_control.future_tournament_rounds_v1 value
    where value.tournament_id = target_id;
    insert into production_control.tournament_setup_context_v1 (
      tournament_id, contract_version, revision,
      updated_by_player_id, updated_by_auth_user_id
    ) values (
      target_id, 'production-tournament-setup-v1', catalog.setup_revision,
      actor_player, actor_auth
    );
    insert into scoring_authority.tournament_setup_operational_v1 (
      tournament_id, destination, start_date, end_date, timezone,
      operational_status, setup_revision, updated_by_player_id
    ) values (
      target_id, catalog.destination, catalog.start_date, catalog.end_date,
      catalog.timezone, 'UPCOMING', catalog.setup_revision, actor_player
    );
    insert into scoring_authority.tournament_setup_team_details_v1 (
      tournament_id, team_id, captain_player_id, setup_revision,
      updated_by_player_id
    ) select target_id, value.team_id, value.captain_player_id,
      catalog.setup_revision, actor_player
    from production_control.future_tournament_teams_v1 value
    where value.tournament_id = target_id and value.active;
    insert into scoring_authority.tournament_setup_round_details_v1 (
      tournament_id, round_number, team_size, points_available,
      display_order, setup_revision, updated_by_player_id
    ) select target_id, value.round_number, value.team_size,
      value.points_available, value.round_number, catalog.setup_revision,
      actor_player
    from production_control.future_tournament_rounds_v1 value
    where value.tournament_id = target_id;
    insert into scoring_authority.tournament_setup_course_tees_v1 (
      tournament_id, course_id, tee_id, display_name, location,
      rating, slope, par, setup_revision, updated_by_player_id
    ) select distinct target_id, source.course_id, source.tee_id,
      source.display_name, source.location, source.rating, source.slope,
      source.par, catalog.setup_revision, actor_player
    from (
      select reference.tournament_id, existing.course_id, existing.tee_id,
        existing.display_name, existing.location, existing.rating,
        existing.slope, existing.par
      from production_control.future_tournament_course_references_v1 reference
      join scoring_authority.tournament_setup_course_tees_v1 existing
        on existing.tournament_id = reference.source_tournament_id
       and existing.course_id = reference.course_id
       and existing.tee_id = reference.tee_id
      where reference.reference_status = 'EXISTING_REFERENCE'
      union all
      select reference.tournament_id, context.course_id, context.tee_id,
        global_course.display_name, global_course.location, context.rating,
        context.slope, context.par
      from production_control.future_tournament_course_references_v1 reference
      join scoring_authority.global_course_tee_contexts_v1 context
        on context.course_id = reference.course_id
       and context.tee_id = reference.tee_id
       and context.context_revision = reference.source_setup_revision
      join scoring_authority.global_course_catalog_v1 global_course
        on global_course.course_id = context.course_id
       and global_course.catalog_status = 'ACTIVE'
      where reference.reference_status = 'GLOBAL_COURSE_CONTEXT'
    ) source
    where source.tournament_id = target_id;
    insert into scoring_authority.tournament_setup_course_holes_v1 (
      tournament_id, course_id, tee_id, hole_number, par,
      stroke_index, yardage, setup_revision
    ) select target_id, source.course_id, source.tee_id,
      source.hole_number, source.par, source.stroke_index, source.yardage,
      catalog.setup_revision
    from (
      select reference.tournament_id, existing.course_id, existing.tee_id,
        existing.hole_number, existing.par, existing.stroke_index,
        existing.yardage
      from production_control.future_tournament_course_references_v1 reference
      join scoring_authority.tournament_setup_course_holes_v1 existing
        on existing.tournament_id = reference.source_tournament_id
       and existing.course_id = reference.course_id
       and existing.tee_id = reference.tee_id
      where reference.reference_status = 'EXISTING_REFERENCE'
      union all
      select reference.tournament_id, context.course_id, context.tee_id,
        context.hole_number, context.par, context.stroke_index,
        context.yardage
      from production_control.future_tournament_course_references_v1 reference
      join scoring_authority.global_course_hole_contexts_v1 context
        on context.course_id = reference.course_id
       and context.tee_id = reference.tee_id
       and context.context_revision = reference.source_setup_revision
      where reference.reference_status = 'GLOBAL_COURSE_CONTEXT'
    ) source
    where source.tournament_id = target_id;
    insert into scoring_authority.tournament_setup_round_courses_v1 (
      tournament_id, round_number, course_id, tee_id,
      setup_revision, updated_by_player_id
    ) select target_id, value.round_number, value.course_id, value.tee_id,
      catalog.setup_revision, actor_player
    from production_control.future_tournament_course_references_v1 value
    where value.tournament_id = target_id;
    insert into production_control.future_runtime_promotions_v2 (
      tournament_id, contract_version, promotion_revision,
      source_setup_revision, promoted_manifest_fingerprint,
      runtime_status, promoted_by_player_id, promoted_by_auth_user_id
    ) values (
      target_id, 'production-future-runtime-activation-v2', 1,
      catalog.setup_revision, manifest_fingerprint, 'PROMOTED',
      actor_player, actor_auth
    );
    insert into scoring_authority.matches (
      match_id, tournament_id, round_number, format, scoring_snapshot_id,
      status, scoring_locked
    ) select value.match_id, target_id, value.round_number, value.format,
      null, 'UPCOMING', true
    from production_control.future_match_definitions_v1 value
    where value.tournament_id = target_id;
    insert into production_control.future_runtime_match_bindings_v2 (
      tournament_id, match_id, structural_setup_revision,
      runtime_revision, runtime_state
    ) select target_id, value.match_id, value.setup_revision, 1, 'PROMOTED'
    from production_control.future_match_definitions_v1 value
    where value.tournament_id = target_id;
    -- Certification has no legacy presentation import. Derive the required
    -- display identity from the same promoted canonical setup facts atomically.
    -- No score, readiness state or archive certificate is manufactured here.
    if resource_context->>'resource_class'='CERTIFICATION' then
      insert into scoring_authority.game_center_presentations(
        match_id,tournament_id,course_name,course_yardage,display_match_number,match_sort_order,
        tournament_location,tournament_status,tournament_time_zone,source_workbook_id,
        source_payload_hash,imported_by)
      select definition.match_id,target_id,tee.display_name,
        coalesce((select sum(h.yardage)::text from scoring_authority.tournament_setup_course_holes_v1 h
          where h.tournament_id=target_id and h.course_id=assignment.course_id and h.tee_id=assignment.tee_id),''),
        definition.match_number::text,row_number() over(order by definition.round_number,definition.match_number)::integer,
        coalesce(catalog.destination,''),'UPCOMING',catalog.timezone,resource.source_workbook_id,
        production_control.future_runtime_hash_v2(jsonb_build_object('contract','canonical-promotion-presentation-v1',
          'match',to_jsonb(definition),'course',to_jsonb(assignment),'tee',to_jsonb(tee),
          'timezone',catalog.timezone,'resource_id',resource_context->>'resource_id')),
        'certification-canonical-promotion-v1'
      from production_control.future_match_definitions_v1 definition
      join scoring_authority.tournament_setup_round_courses_v1 assignment
        on assignment.tournament_id=definition.tournament_id and assignment.round_number=definition.round_number
      join scoring_authority.tournament_setup_course_tees_v1 tee on tee.tournament_id=assignment.tournament_id
        and tee.course_id=assignment.course_id and tee.tee_id=assignment.tee_id
      where definition.tournament_id=target_id;
      if (select count(*) from scoring_authority.game_center_presentations where tournament_id=target_id)
        <> (select count(*) from scoring_authority.matches where tournament_id=target_id) then
        raise exception using errcode='55000',message='CERTIFICATION_PROMOTION_PRESENTATION_INCOMPLETE';end if;
    end if;
    -- Google runtime retired: external delivery is not canonical authority.
    -- Google runtime retired: external delivery is not canonical authority.
    update production_control.future_tournament_catalog_v1 set
      lifecycle = 'CONFIGURING', lifecycle_revision = lifecycle_revision + 1,
      readiness_fingerprint = null, readiness_setup_revision = null,
      updated_by_player_id = actor_player,
      updated_by_auth_user_id = actor_auth,
      updated_at = pg_catalog.clock_timestamp()
    where tournament_id = target_id;
    prior_revision := 0;
    next_revision := 1;
    target_kind := 'RUNTIME';
    target_object := target_id;
    safe_metadata := pg_catalog.jsonb_build_object(
      'summary', 'Future tournament structure promoted',
      'runtimeMatches', (select pg_catalog.count(*)
        from scoring_authority.matches where tournament_id = target_id),
      'scoringAccessCreated', false, 'scoresCreated', false
    );
    result_value := pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'PRODUCTION_FUTURE_RUNTIME_PROMOTED',
      'action', action_value, 'tournamentId', target_id,
      'promotionRevision', 1, 'manifestFingerprint', manifest_fingerprint,
      'priorRevision', prior_revision, 'nextRevision', next_revision,
      'scoringAccessCreated', false, 'scoreFactsCreated', false,
      'idempotent', false
    );

  end if;

  if result_value is null then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_FUTURE_RUNTIME_RESULT_REQUIRED';
  end if;
  insert into production_control.future_runtime_audit_events_v2 (
    tournament_id, action, target_kind, target_id, actor_player_id,
    prior_revision, next_revision, operation_request_id, result, safe_metadata
  ) values (
    nullif(target_id, ''), action_value, target_kind,
    coalesce(target_object, target_id, 'GLOBAL'), actor_player,
    prior_revision, next_revision, request_id,
    case when changed_value then 'CHANGED' else 'NO_CHANGE' end,
    safe_metadata
  );
  insert into production_control.future_runtime_operation_receipts_v2 (
    tournament_id, action, operation_request_id,
    declared_request_payload_hash, database_request_payload_hash,
    actor_player_id, actor_auth_user_id, prior_revision, next_revision,
    response
  ) values (
    nullif(target_id, ''), action_value, request_id,
    declared_hash, database_hash, actor_player, actor_auth,
    prior_revision, next_revision, result_value
  );
  return result_value;
end;

$canonical$;
revoke all on function production_control.canonical_mutate_future_runtime_resource_v2(jsonb,jsonb) from public,anon,authenticated,service_role;

create or replace function public.mutate_production_future_runtime_v2(input jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $wrapper$
begin
 if upper(btrim(coalesce(input->>'action',''))) not in (
  'ADD_GLOBAL_COURSE','CONFIGURE_GLOBAL_COURSE_CONTEXT','ASSIGN_FUTURE_COURSE','PROMOTE_RUNTIME_STRUCTURE',
  'STAGE_HANDICAPS','APPROVE_HANDICAPS','CONFIGURE_MATCH','REPLACE_PAIRINGS','PREPARE_SCORING_CONTEXT',
  'GRANT_FUTURE_DIRECTOR','MARK_READY_FOR_ACTIVATION','ACTIVATE_TOURNAMENT','CLOSE_TOURNAMENT','PREPARE_ARCHIVE_PLAN') then
  raise exception using errcode='22023',message='PRODUCTION_FUTURE_RUNTIME_ACTION_INVALID';end if;
 perform production_control.assert_future_runtime_service_scope_v2(input,true,upper(btrim(coalesce(input->>'action',''))) in (
  'ADD_GLOBAL_COURSE','CONFIGURE_GLOBAL_COURSE_CONTEXT','PROMOTE_RUNTIME_STRUCTURE','GRANT_FUTURE_DIRECTOR',
  'MARK_READY_FOR_ACTIVATION','ACTIVATE_TOURNAMENT','CLOSE_TOURNAMENT','PREPARE_ARCHIVE_PLAN'));
 return production_control.canonical_mutate_future_runtime_resource_v2(input,production_control.annual_resource_context_v2());
end;
$wrapper$;

create function production_control.canonical_create_guide_draft_resource_v2(input jsonb, resource_context jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $canonical$

declare
  target text;
  target_year integer;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}','')));
  actor_auth uuid;
  request_id uuid;
  declared_hash text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'request_payload_hash','')));
  expected_revision bigint;
  expected_revision_id_text text := pg_catalog.lower(pg_catalog.btrim(
    coalesce(input->>'expected_published_revision_id','')));
  reason_value text := pg_catalog.btrim(coalesce(input->>'reason',''));
  authoring_value jsonb := coalesce(input->'authoring_content',input->'content');
  projection_value jsonb := input->'projection_payload';
  validation jsonb;
  current_value jsonb;
  database_hash text;
  prior_receipt jsonb;
  draft_id_value uuid;
  response_value jsonb;
begin
  target := production_control.assert_guide_authoring_resource_v2(input, resource_context);
  target_year := target::integer;
  if input->>'operation' is distinct from
       'CREATE_PRODUCTION_GUIDE_DRAFT_V1'
     or coalesce(input->>'operation_request_id','')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or declared_hash !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'expected_published_revision','') !~ '^[0-9]+$'
     or coalesce(input->>'authoring_content_fingerprint','')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'content_fingerprint','') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'projection_payload_hash','') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'canonical_reference_fingerprint','')
       !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(authoring_value) is distinct from 'object'
     or pg_catalog.jsonb_typeof(projection_value) is distinct from 'object'
     or reason_value='' or pg_catalog.length(reason_value)>500 then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_INPUT_INVALID');
  end if;
  actor_auth := (input#>>'{authorization,auth_user_id}')::uuid;
  request_id := (input->>'operation_request_id')::uuid;
  expected_revision := (input->>'expected_published_revision')::bigint;
  validation := production_control.validate_guide_draft_structure_v1(
    target,target_year,authoring_value,projection_value,
    input->>'authoring_content_fingerprint',input->>'content_fingerprint',
    input->>'projection_payload_hash');
  database_hash := production_control.guide_authoring_hash_v1(
    pg_catalog.jsonb_build_object(
      'operation','CREATE','tournamentId',target,
      'actorPlayerId',actor_player,'actorAuthUserId',actor_auth,
      'expectedPublishedRevision',expected_revision,
      'expectedPublishedRevisionId',expected_revision_id_text,
      'authoringContent',authoring_value,'projectionPayload',projection_value,
      'canonicalReferenceFingerprint',
        input->>'canonical_reference_fingerprint',
      'reason',reason_value));
  prior_receipt := production_control.guide_operation_receipt_v1(
    target,'CREATE',request_id,declared_hash,database_hash);
  if prior_receipt is not null then return prior_receipt; end if;
  if not coalesce((validation->>'pass')::boolean,false) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_VALIDATION_FAILED',
      'issues',validation->'issues');
  end if;
  if input->>'canonical_reference_fingerprint' is distinct from
       production_control.guide_canonical_reference_fingerprint_v1(target) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_CANONICAL_REFERENCE_STALE');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'production-guide-authoring:'||target,0));
  prior_receipt := production_control.guide_operation_receipt_v1(
    target,'CREATE',request_id,declared_hash,database_hash);
  if prior_receipt is not null then return prior_receipt; end if;
  if input->>'canonical_reference_fingerprint' is distinct from
       production_control.guide_canonical_reference_fingerprint_v1(target) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_CANONICAL_REFERENCE_STALE');
  end if;
  current_value := production_control.guide_current_publication_v1(target);
  if (current_value->>'revision')::bigint <> expected_revision
     or (expected_revision_id_text <> '' and expected_revision_id_text
       is distinct from pg_catalog.lower(coalesce(
         current_value->>'revisionId',''))) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_PREDECESSOR_STALE',
      'currentRevision',(current_value->>'revision')::bigint,
      'currentRevisionId',current_value->>'revisionId');
  end if;
  if exists (select 1
    from production_control.guide_authoring_drafts_v1 value
    where value.tournament_id=target and value.state in ('DRAFT','VALIDATED'))
  then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_OPEN_DRAFT_EXISTS');
  end if;
  insert into production_control.guide_authoring_drafts_v1 (
    tournament_id,tournament_year,draft_version,state,authoring_kind,
    expected_published_revision,expected_published_revision_id,
    authoring_content,projection_payload,authoring_content_fingerprint,
    content_fingerprint,projection_payload_hash,canonical_reference_fingerprint,
    validation_diagnostics,
    reason,created_by_player_id,created_by_auth_user_id
  ) values (
    target,target_year,1,'DRAFT','DIRECTOR_EDIT',expected_revision,
    nullif(expected_revision_id_text,'')::uuid,
    validation->'authoringContent',validation->'projectionPayload',
    validation->>'authoringContentFingerprint',
    validation->>'contentFingerprint',validation->>'projectionPayloadHash',
    input->>'canonical_reference_fingerprint',
    (validation->'diagnostics')||pg_catalog.jsonb_build_object(
      'validated',false,'requiresReview',false),reason_value,
    actor_player,actor_auth
  ) returning draft_id into draft_id_value;
  response_value := pg_catalog.jsonb_build_object(
    'ok',true,'code','GUIDE_DRAFT_CREATED','idempotent',false,
    'tournamentId',target,'draftId',draft_id_value,'draftVersion',1,
    'state','DRAFT','expectedPublishedRevision',expected_revision,
    'authoringContent',validation->'authoringContent',
    'preview',validation->'projectionPayload',
    'projectionPayload',validation->'projectionPayload',
    'validationDiagnostics',validation->'diagnostics');
  insert into production_control.guide_authoring_audit_events_v1 (
    tournament_id,draft_id,action,actor_player_id,actor_auth_user_id,summary
  ) values (
    target,draft_id_value,'DRAFT_CREATED',actor_player,actor_auth,
    pg_catalog.jsonb_build_object(
      'draftVersion',1,
      'predecessorRevision',expected_revision,
      'itemCount',validation#>>'{diagnostics,authoringItemCount}'));
  insert into production_control.guide_authoring_operation_receipts_v1 (
    tournament_id,operation,operation_request_id,
    declared_request_payload_hash,request_payload_hash,
    actor_player_id,actor_auth_user_id,response
  ) values (
    target,'CREATE',request_id,declared_hash,database_hash,
    actor_player,actor_auth,response_value);
  return response_value;
exception when invalid_text_representation or numeric_value_out_of_range then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','GUIDE_INPUT_INVALID');
when unique_violation then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','GUIDE_OPERATION_CONFLICT');
end;

$canonical$;
revoke all on function production_control.canonical_create_guide_draft_resource_v2(jsonb,jsonb) from public,anon,authenticated,service_role;

create or replace function public.create_production_guide_draft_v1(input jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $wrapper$
begin
 perform production_control.assert_guide_authoring_v1(input);
 return production_control.canonical_create_guide_draft_resource_v2(input,production_control.annual_resource_context_v2());
end;
$wrapper$;

create function production_control.canonical_validate_guide_draft_resource_v2(input jsonb, resource_context jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $canonical$

declare
  target text;
  target_year integer;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}','')));
  actor_auth uuid;
  request_id uuid;
  draft_id_value uuid;
  expected_draft_version bigint;
  declared_hash text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'request_payload_hash','')));
  authoring_value jsonb := coalesce(input->'authoring_content',input->'content');
  projection_value jsonb := input->'projection_payload';
  database_hash text;
  prior_receipt jsonb;
  draft production_control.guide_authoring_drafts_v1%rowtype;
  current_value jsonb;
  validation jsonb;
  next_version bigint;
  response_value jsonb;
begin
  target := production_control.assert_guide_authoring_resource_v2(input, resource_context);
  target_year := target::integer;
  if input->>'operation' is distinct from
       'VALIDATE_PRODUCTION_GUIDE_DRAFT_V1'
     or coalesce(input->>'operation_request_id','')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'draft_id','')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'expected_draft_version','') !~ '^[1-9][0-9]*$'
     or declared_hash !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'authoring_content_fingerprint','')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'content_fingerprint','') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'projection_payload_hash','') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'canonical_reference_fingerprint','')
       !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(authoring_value) is distinct from 'object'
     or pg_catalog.jsonb_typeof(projection_value) is distinct from 'object' then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_INPUT_INVALID');
  end if;
  actor_auth := (input#>>'{authorization,auth_user_id}')::uuid;
  request_id := (input->>'operation_request_id')::uuid;
  draft_id_value := (input->>'draft_id')::uuid;
  expected_draft_version := (input->>'expected_draft_version')::bigint;
  database_hash := production_control.guide_authoring_hash_v1(
    pg_catalog.jsonb_build_object(
      'operation','VALIDATE','tournamentId',target,
      'actorPlayerId',actor_player,'actorAuthUserId',actor_auth,
      'draftId',draft_id_value,'expectedDraftVersion',expected_draft_version,
      'authoringContent',authoring_value,'projectionPayload',projection_value,
      'canonicalReferenceFingerprint',
        input->>'canonical_reference_fingerprint'));
  prior_receipt := production_control.guide_operation_receipt_v1(
    target,'VALIDATE',request_id,declared_hash,database_hash);
  if prior_receipt is not null then return prior_receipt; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'production-guide-authoring:'||target,0));
  prior_receipt := production_control.guide_operation_receipt_v1(
    target,'VALIDATE',request_id,declared_hash,database_hash);
  if prior_receipt is not null then return prior_receipt; end if;
  select value.* into strict draft
  from production_control.guide_authoring_drafts_v1 value
  where value.draft_id=draft_id_value and value.tournament_id=target
  for update;
  current_value := production_control.guide_current_publication_v1(target);
  if draft.state not in ('DRAFT','VALIDATED')
     or draft.draft_version<>expected_draft_version then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_DRAFT_VERSION_STALE',
      'currentDraftVersion',draft.draft_version);
  end if;
  if draft.expected_published_revision<>(current_value->>'revision')::bigint
     or draft.expected_published_revision_id::text is distinct from
       nullif(current_value->>'revisionId','') then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_PREDECESSOR_STALE');
  end if;
  if coalesce((draft.validation_diagnostics->>'requiresReview')::boolean,false)
  then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_COPY_REVIEW_REQUIRED');
  end if;
  if authoring_value is distinct from draft.authoring_content then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_DRAFT_CONTENT_STALE');
  end if;
  if input->>'canonical_reference_fingerprint' is distinct from
       production_control.guide_canonical_reference_fingerprint_v1(target) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_CANONICAL_REFERENCE_STALE');
  end if;
  validation := production_control.validate_guide_authoring_v1(
    target,target_year,authoring_value,projection_value,
    input->>'authoring_content_fingerprint',input->>'content_fingerprint',
    input->>'projection_payload_hash');
  if not coalesce((validation->>'pass')::boolean,false) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_VALIDATION_FAILED','issues',validation->'issues');
  end if;
  next_version := case when draft.state='VALIDATED'
      and draft.projection_payload=projection_value
      and draft.authoring_content_fingerprint=
        validation->>'authoringContentFingerprint'
      and draft.content_fingerprint=validation->>'contentFingerprint'
      and draft.projection_payload_hash=validation->>'projectionPayloadHash'
      and draft.canonical_reference_fingerprint=
        input->>'canonical_reference_fingerprint'
      and draft.validated_canonical_reference_fingerprint=
        input->>'canonical_reference_fingerprint'
    then draft.draft_version else draft.draft_version+1 end;
  if next_version<>draft.draft_version then
    update production_control.guide_authoring_drafts_v1 set
      draft_version=next_version,state='VALIDATED',
      projection_payload=validation->'projectionPayload',
      authoring_content_fingerprint=
        validation->>'authoringContentFingerprint',
      content_fingerprint=validation->>'contentFingerprint',
      projection_payload_hash=validation->>'projectionPayloadHash',
      canonical_reference_fingerprint=
        input->>'canonical_reference_fingerprint',
      validated_content_fingerprint=validation->>'contentFingerprint',
      validated_canonical_reference_fingerprint=
        input->>'canonical_reference_fingerprint',
      validation_diagnostics=(validation->'diagnostics')||
        pg_catalog.jsonb_build_object(
          'validated',true,'validatedDraftVersion',next_version,
          'requiresReview',false),
      validated_at=pg_catalog.clock_timestamp(),
      updated_at=pg_catalog.clock_timestamp()
    where draft_id=draft_id_value;
    insert into production_control.guide_authoring_audit_events_v1 (
      tournament_id,draft_id,action,actor_player_id,actor_auth_user_id,summary
    ) values (
      target,draft_id_value,'VALIDATION_COMPLETED',actor_player,actor_auth,
      pg_catalog.jsonb_build_object(
        'draftVersion',next_version,
        'issueCount',0,
        'itemCount',validation#>>'{diagnostics,authoringItemCount}'));
  end if;
  response_value := pg_catalog.jsonb_build_object(
    'ok',true,'code','GUIDE_DRAFT_VALIDATED','idempotent',false,
    'tournamentId',target,'draftId',draft_id_value,
    'draftVersion',next_version,'state','VALIDATED',
    'authoringContent',validation->'authoringContent',
    'preview',validation->'projectionPayload',
    'projectionPayload',validation->'projectionPayload',
    'validationDiagnostics',validation->'diagnostics');
  insert into production_control.guide_authoring_operation_receipts_v1 (
    tournament_id,operation,operation_request_id,
    declared_request_payload_hash,request_payload_hash,
    actor_player_id,actor_auth_user_id,response
  ) values (
    target,'VALIDATE',request_id,declared_hash,database_hash,
    actor_player,actor_auth,response_value);
  return response_value;
exception when no_data_found then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','GUIDE_DRAFT_NOT_FOUND');
when invalid_text_representation or numeric_value_out_of_range then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','GUIDE_INPUT_INVALID');
end;

$canonical$;
revoke all on function production_control.canonical_validate_guide_draft_resource_v2(jsonb,jsonb) from public,anon,authenticated,service_role;

create or replace function public.validate_production_guide_draft_v1(input jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $wrapper$
begin
 perform production_control.assert_guide_authoring_v1(input);
 return production_control.canonical_validate_guide_draft_resource_v2(input,production_control.annual_resource_context_v2());
end;
$wrapper$;

create function production_control.canonical_publish_guide_draft_resource_v2(input jsonb, resource_context jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $canonical$

declare
  target text;
  target_year integer;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}','')));
  actor_auth uuid;
  request_id uuid;
  draft_id_value uuid;
  expected_draft_version bigint;
  expected_published_revision bigint;
  expected_published_revision_id_text text := pg_catalog.lower(
    pg_catalog.btrim(coalesce(input->>'expected_published_revision_id','')));
  expected_content_fingerprint text := pg_catalog.lower(
    pg_catalog.btrim(coalesce(input->>'expected_content_fingerprint','')));
  reason_value text := pg_catalog.btrim(coalesce(input->>'reason',''));
  declared_hash text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'request_payload_hash','')));
  authoring_value jsonb := coalesce(input->'authoring_content',input->'content');
  projection_value jsonb := input->'projection_payload';
  database_hash text;
  prior_receipt jsonb;
  draft production_control.guide_authoring_drafts_v1%rowtype;
  current_value jsonb;
  validation jsonb;
  annual_pointer production_control.current_tournament_pointer_v1%rowtype;
  resource production_control.canonical_resource_v1%rowtype;
  catalog production_control.future_tournament_catalog_v1%rowtype;
  annual_resource production_control.future_tournament_resources_v1%rowtype;
  promotion production_control.future_runtime_promotions_v2%rowtype;
  binding production_control.future_annual_projection_bindings_v1%rowtype;
  next_revision bigint;
  next_binding_revision bigint;
  native_revision_id uuid;
  previous_native_revision_id uuid;
  production_revision_id uuid;
  legacy_current_projection_id uuid;
  guide_revision_id uuid;
  source_value jsonb;
  source_text text;
  content_text text;
  payload_text text;
  source_hash text;
  effective_at_value timestamptz;
  response_value jsonb;
begin
  target := production_control.assert_guide_authoring_resource_v2(input, resource_context);
  target_year := target::integer;
  if input->>'operation' is distinct from
       'PUBLISH_PRODUCTION_GUIDE_DRAFT_V1'
     or coalesce(input->>'operation_request_id','')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'draft_id','')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'expected_draft_version','') !~ '^[1-9][0-9]*$'
     or coalesce(input->>'expected_published_revision','') !~ '^[0-9]+$'
     or expected_content_fingerprint !~ '^[0-9a-f]{64}$'
     or declared_hash !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'authoring_content_fingerprint','')
       !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'content_fingerprint','') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'projection_payload_hash','') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'canonical_reference_fingerprint','')
       !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(authoring_value) is distinct from 'object'
     or pg_catalog.jsonb_typeof(projection_value) is distinct from 'object'
     or input->>'confirmation' is distinct from
       'PUBLISH TOURNAMENT GUIDE'
     or reason_value='' or pg_catalog.length(reason_value)>500 then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_PUBLISH_INPUT_INVALID');
  end if;
  actor_auth := (input#>>'{authorization,auth_user_id}')::uuid;
  request_id := (input->>'operation_request_id')::uuid;
  draft_id_value := (input->>'draft_id')::uuid;
  expected_draft_version := (input->>'expected_draft_version')::bigint;
  expected_published_revision :=
    (input->>'expected_published_revision')::bigint;
  database_hash := production_control.guide_authoring_hash_v1(
    pg_catalog.jsonb_build_object(
      'operation','PUBLISH','tournamentId',target,
      'actorPlayerId',actor_player,'actorAuthUserId',actor_auth,
      'draftId',draft_id_value,'expectedDraftVersion',expected_draft_version,
      'expectedPublishedRevision',expected_published_revision,
      'expectedPublishedRevisionId',expected_published_revision_id_text,
      'expectedContentFingerprint',expected_content_fingerprint,
      'authoringContent',authoring_value,'projectionPayload',projection_value,
      'canonicalReferenceFingerprint',
        input->>'canonical_reference_fingerprint',
      'confirmation',input->>'confirmation','reason',reason_value));
  prior_receipt := production_control.guide_operation_receipt_v1(
    target,'PUBLISH',request_id,declared_hash,database_hash);
  if prior_receipt is not null then return prior_receipt; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'production-guide-authoring:'||target,0));
  prior_receipt := production_control.guide_operation_receipt_v1(
    target,'PUBLISH',request_id,declared_hash,database_hash);
  if prior_receipt is not null then return prior_receipt; end if;
  perform 1 from production_control.guide_authoring_current_v1 value
    where value.tournament_id=target for update;
  if target='2026' then
    select value.revision_id into legacy_current_projection_id
    from production_control.projection_current value
    where value.domain='GUIDE' and value.tournament_id=target for update;
    perform 1 from scoring_authority.guide_projection_current value
      where value.tournament_id=target for update;
  else
    perform 1 from production_control.future_annual_projection_bindings_v1 value
      where value.tournament_id=target and value.domain='GUIDE' for update;
  end if;
  select value.* into strict draft
  from production_control.guide_authoring_drafts_v1 value
  where value.draft_id=draft_id_value and value.tournament_id=target
  for update;
  current_value := production_control.guide_current_publication_v1(target);
  if draft.state<>'VALIDATED' or draft.draft_version<>expected_draft_version
     or coalesce((draft.validation_diagnostics->>'validated')::boolean,false)
       is not true
     or coalesce((draft.validation_diagnostics->>'validatedDraftVersion')::bigint,0)
       <> expected_draft_version then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_VALIDATED_DRAFT_REQUIRED');
  end if;
  if draft.expected_published_revision<>(current_value->>'revision')::bigint
     or draft.expected_published_revision_id::text is distinct from
       nullif(current_value->>'revisionId','')
     or expected_published_revision<>draft.expected_published_revision
     or (expected_published_revision_id_text<>'' and
       expected_published_revision_id_text is distinct from
         pg_catalog.lower(coalesce(current_value->>'revisionId',''))) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_PREDECESSOR_STALE',
      'currentRevision',(current_value->>'revision')::bigint);
  end if;
  if authoring_value is distinct from draft.authoring_content
     or projection_value is distinct from draft.projection_payload then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_DRAFT_CONTENT_STALE');
  end if;
  if input->>'canonical_reference_fingerprint' is distinct from
       production_control.guide_canonical_reference_fingerprint_v1(target)
     or draft.canonical_reference_fingerprint is distinct from
       input->>'canonical_reference_fingerprint'
     or draft.validated_canonical_reference_fingerprint is distinct from
       input->>'canonical_reference_fingerprint' then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_CANONICAL_REFERENCE_STALE');
  end if;
  validation := production_control.validate_guide_authoring_v1(
    target,target_year,authoring_value,projection_value,
    input->>'authoring_content_fingerprint',input->>'content_fingerprint',
    input->>'projection_payload_hash');
  if not coalesce((validation->>'pass')::boolean,false) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_VALIDATION_FAILED','issues',validation->'issues');
  end if;
  if validation->>'authoringContentFingerprint' is distinct from
       draft.authoring_content_fingerprint
     or validation->>'contentFingerprint' is distinct from
       draft.content_fingerprint
     or validation->>'contentFingerprint' is distinct from
       draft.validated_content_fingerprint
     or validation->>'projectionPayloadHash' is distinct from
       draft.projection_payload_hash
     or expected_content_fingerprint is distinct from
       draft.validated_content_fingerprint then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_DRAFT_VALIDATION_STALE');
  end if;
  if current_value->>'projectionPayloadHash' =
       validation->>'projectionPayloadHash' then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','GUIDE_NO_CHANGES');
  end if;

  select value.* into strict annual_pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key=(resource_context->>'resource_id');
  select value.* into strict resource
  from production_control.canonical_resource_v1 value
  where value.resource_id=(resource_context->>'resource_id');
  select value.revision_id into previous_native_revision_id
  from production_control.guide_authoring_current_v1 value
  where value.tournament_id=target;
  next_revision := (current_value->>'revision')::bigint + 1;
  effective_at_value := pg_catalog.clock_timestamp();
  source_value := pg_catalog.jsonb_build_object(
    'tournamentId',target,
    'source',pg_catalog.jsonb_build_object(
      'authoringAuthority','SUPABASE_DIRECTOR',
      'authoringContract','production-guide-authoring-v1',
      'sourceTabs',production_control.guide_authoring_source_tabs_v1(),
      'draftId',draft_id_value,'draftVersion',draft.draft_version));
  source_text := production_control.guide_authoring_canonical_json_v1(
    source_value);
  content_text := production_control.guide_authoring_canonical_json_v1(
    validation->'projectionPayload'->'content');
  payload_text := production_control.guide_authoring_canonical_json_v1(
    validation->'projectionPayload');
  source_hash := pg_catalog.encode(extensions.digest(source_text,'sha256'),'hex');

  if target='2026' then
    insert into production_control.projection_revisions (
      domain,tournament_id,tournament_year,revision_number,
      previous_revision_id,project_ref,project_url,source_workbook_id,
      source_tabs,contract_version,source_fingerprint,payload_fingerprint,
      source_payload,projection_payload,validation_status,
      validation_diagnostics,imported_by,imported_at
    ) values (
      'GUIDE','2026',2026,next_revision,
      legacy_current_projection_id,
      resource.project_ref,resource.project_url,resource.provenance_id,
      production_control.guide_authoring_source_tabs_v1(),
      'guide-projection-v1',source_hash,
      validation->>'projectionPayloadHash',source_value,
      validation->'projectionPayload','VALID',
      (validation->'diagnostics')||pg_catalog.jsonb_build_object(
        'authoringAuthority','SUPABASE_DIRECTOR',
        'authoringContract','production-guide-authoring-v1'),
      actor_player,effective_at_value
    ) returning revision_id into production_revision_id;
    insert into production_control.projection_current (
      domain,tournament_id,revision_id,advanced_by,advanced_at
    ) values (
      'GUIDE','2026',production_revision_id,actor_player,effective_at_value
    ) on conflict (domain,tournament_id) do update set
      revision_id=excluded.revision_id,advanced_by=excluded.advanced_by,
      advanced_at=excluded.advanced_at;

    select value.revision_id into guide_revision_id
    from scoring_authority.guide_content_revisions value
    where value.tournament_id='2026'
      and value.content_fingerprint=validation->>'contentFingerprint';
    if guide_revision_id is null then
      insert into scoring_authority.guide_content_revisions (
        tournament_id,projection_revision,source_workbook_id,
        content_fingerprint,source_workbook_fingerprint,payload_hash,
        source_canonical_json,content_canonical_json,payload_canonical_json,
        content_payload,validation_status,source_metadata,
        source_sync_sequence,trigger_type,imported_by,imported_at
      ) values (
        '2026',next_revision,resource.provenance_id,
        validation->>'contentFingerprint',source_hash,
        validation->>'projectionPayloadHash',source_text,content_text,
        payload_text,validation->'projectionPayload','VALID',
        pg_catalog.jsonb_build_object(
          'authoringAuthority','SUPABASE_DIRECTOR',
          'authoringContract','production-guide-authoring-v1',
          'draftVersion',draft.draft_version),
        next_revision,'MANUAL',actor_player,effective_at_value
      ) returning revision_id into guide_revision_id;
    end if;
    insert into scoring_authority.guide_projection_current (
      tournament_id,source_workbook_id,revision_id,publication_sequence,
      source_sync_sequence,published_at,last_verified_at
    ) values (
      '2026',resource.provenance_id,guide_revision_id,next_revision,
      next_revision,effective_at_value,effective_at_value
    ) on conflict (tournament_id) do update set
      source_workbook_id=excluded.source_workbook_id,
      revision_id=excluded.revision_id,
      publication_sequence=excluded.publication_sequence,
      source_sync_sequence=excluded.source_sync_sequence,
      published_at=excluded.published_at,
      last_verified_at=excluded.last_verified_at;
  else
    select value.* into strict catalog
    from production_control.future_tournament_catalog_v1 value
    where value.tournament_id=target for update;
    select value.* into strict annual_resource
    from production_control.future_tournament_resources_v1 value
    where value.tournament_id=target for share;
    select value.* into promotion
    from production_control.future_runtime_promotions_v2 value
    where value.tournament_id=target;
    select value.* into binding
    from production_control.future_annual_projection_bindings_v1 value
    where value.tournament_id=target and value.domain='GUIDE' for update;
    update production_control.future_tournament_catalog_v1 value set
      lifecycle=case when value.lifecycle='READY_FOR_ACTIVATION'
        then 'CONFIGURING' else value.lifecycle end,
      lifecycle_revision=case when value.lifecycle='READY_FOR_ACTIVATION'
        then value.lifecycle_revision+1 else value.lifecycle_revision end,
      setup_revision=case when promotion.tournament_id is null
        then value.setup_revision+1 else value.setup_revision end,
      readiness_fingerprint=null,readiness_setup_revision=null,
      updated_by_player_id=actor_player,updated_at=effective_at_value
    where value.tournament_id=target;
    next_binding_revision:=coalesce(binding.binding_revision,0)+1;
    insert into production_control.future_annual_projection_bindings_v1 (
      tournament_id,domain,source_workbook_id,source_revision,
      binding_revision,source_fingerprint,payload_fingerprint,projection,
      certification_status,certified_by_player_id,certified_at,
      authoring_authority
    ) values (
      target,'GUIDE',coalesce(annual_resource.source_workbook_id,
        'SUPABASE_DIRECTOR'),next_revision,
      next_binding_revision,source_hash,validation->>'projectionPayloadHash',
      validation->'projectionPayload','CERTIFIED',actor_player,
      effective_at_value,'SUPABASE_DIRECTOR'
    ) on conflict (tournament_id,domain) do update set
      source_workbook_id=excluded.source_workbook_id,
      source_revision=excluded.source_revision,
      binding_revision=excluded.binding_revision,
      source_fingerprint=excluded.source_fingerprint,
      payload_fingerprint=excluded.payload_fingerprint,
      projection=excluded.projection,
      certification_status=excluded.certification_status,
      certified_by_player_id=excluded.certified_by_player_id,
      certified_at=excluded.certified_at,
      authoring_authority=excluded.authoring_authority,
      updated_at=effective_at_value;
  end if;

  insert into production_control.guide_authoring_revisions_v1 (
    tournament_id,tournament_year,revision_number,
    previous_published_revision,previous_published_revision_id,
    previous_native_revision_id,draft_id,authoring_content,
    projection_payload,authoring_content_fingerprint,content_fingerprint,
    projection_payload_hash,validation_diagnostics,
    production_projection_revision_id,guide_content_revision_id,
    annual_binding_revision,published_by_player_id,published_by_auth_user_id,
    published_at
  ) values (
    target,target_year,next_revision,(current_value->>'revision')::bigint,
    nullif(current_value->>'revisionId','')::uuid,previous_native_revision_id,
    draft_id_value,validation->'authoringContent',
    validation->'projectionPayload',validation->>'authoringContentFingerprint',
    validation->>'contentFingerprint',validation->>'projectionPayloadHash',
    (validation->'diagnostics')||pg_catalog.jsonb_build_object(
      'authoringAuthority','SUPABASE_DIRECTOR'),production_revision_id,
    guide_revision_id,case when target='2026' then null
      else next_binding_revision end,actor_player,actor_auth,effective_at_value
  ) returning revision_id into native_revision_id;
  insert into production_control.guide_authoring_revision_provenance_v1 (
    revision_id,tournament_id,authoring_authority,authoring_contract,draft_id,
    actor_player_id,actor_auth_user_id,authoring_kind,source_tournament_id,
    created_at
  ) values (
    native_revision_id,target,'SUPABASE_DIRECTOR',
    'production-guide-authoring-v1',draft_id_value,actor_player,actor_auth,
    draft.authoring_kind,draft.source_tournament_id,effective_at_value);
  insert into production_control.guide_authoring_current_v1 (
    tournament_id,tournament_year,revision_id,revision_number,
    advanced_by_player_id,advanced_by_auth_user_id,advanced_at
  ) values (
    target,target_year,native_revision_id,next_revision,
    actor_player,actor_auth,effective_at_value
  ) on conflict (tournament_id) do update set
    tournament_year=excluded.tournament_year,
    revision_id=excluded.revision_id,revision_number=excluded.revision_number,
    advanced_by_player_id=excluded.advanced_by_player_id,
    advanced_by_auth_user_id=excluded.advanced_by_auth_user_id,
    advanced_at=excluded.advanced_at;
  update production_control.guide_authoring_drafts_v1 set
    state='SUPERSEDED',published_revision_id=null,published_at=null,
    validated_content_fingerprint=null,
    validated_canonical_reference_fingerprint=null,
    updated_at=effective_at_value
  where tournament_id=target and state='PUBLISHED';
  update production_control.guide_authoring_drafts_v1 set
    state='PUBLISHED',draft_version=draft_version+1,
    published_revision_id=native_revision_id,published_at=effective_at_value,
    updated_at=effective_at_value
  where draft_id=draft_id_value;

  response_value:=pg_catalog.jsonb_build_object(
    'ok',true,'code','GUIDE_REVISION_PUBLISHED','idempotent',false,
    'tournamentId',target,'revisionId',native_revision_id,
    'revision',next_revision,
    'previousRevision',(current_value->>'revision')::bigint,
    'authoringAuthority','SUPABASE_DIRECTOR',
    'effectiveAt',effective_at_value,
    'current',pg_catalog.jsonb_build_object(
      'revision',next_revision,'revisionId',native_revision_id,
      'authoringAuthority','SUPABASE_DIRECTOR',
      'projectionPayload',validation->'projectionPayload',
      'contentFingerprint',validation->>'contentFingerprint',
      'projectionPayloadHash',validation->>'projectionPayloadHash'));
  insert into production_control.guide_authoring_audit_events_v1 (
    tournament_id,draft_id,revision_id,action,actor_player_id,
    actor_auth_user_id,summary
  ) values (
    target,draft_id_value,native_revision_id,'REVISION_PUBLISHED',
    actor_player,actor_auth,pg_catalog.jsonb_build_object(
      'revision',next_revision,
      'predecessorRevision',(current_value->>'revision')::bigint,
      'summary','Tournament Guide Revision '||next_revision||' published'));
  insert into production_control.operation_audit_events (
    event_type,domain,tournament_id,actor,request_fingerprint,result,details
  ) values (
    'PRODUCTION_GUIDE_REVISION_PUBLISHED','GUIDE',target,actor_player,null,
    'SUCCEEDED',pg_catalog.jsonb_build_object(
      'revision',next_revision,'authoring_authority','SUPABASE_DIRECTOR'));
  insert into production_control.guide_authoring_operation_receipts_v1 (
    tournament_id,operation,operation_request_id,
    declared_request_payload_hash,request_payload_hash,
    actor_player_id,actor_auth_user_id,response
  ) values (
    target,'PUBLISH',request_id,declared_hash,database_hash,
    actor_player,actor_auth,response_value);
  return response_value;
exception when no_data_found then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','GUIDE_DRAFT_OR_RESOURCE_NOT_FOUND');
when invalid_text_representation or numeric_value_out_of_range then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','GUIDE_PUBLISH_INPUT_INVALID');
when unique_violation then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','GUIDE_OPERATION_CONFLICT');
end;

$canonical$;
revoke all on function production_control.canonical_publish_guide_draft_resource_v2(jsonb,jsonb) from public,anon,authenticated,service_role;

create or replace function public.publish_production_guide_draft_v1(input jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $wrapper$
begin
 perform production_control.assert_guide_authoring_v1(input);
 return production_control.canonical_publish_guide_draft_resource_v2(input,production_control.annual_resource_context_v2());
end;
$wrapper$;

create function production_control.canonical_stage_draft_revision_resource_v2(input jsonb, resource_context jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $canonical$

declare
  target text;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}','')));
  actor_auth uuid;
  request_id uuid;
  declared_hash text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'request_payload_hash','')));
  expected_value bigint;
  reason_value text := pg_catalog.btrim(coalesce(input->>'reason',''));
  database_hash text;
  prior_receipt jsonb;
  current_pointer scoring_authority.draft_current_revisions%rowtype;
  current_revision scoring_authority.draft_revisions%rowtype;
  predecessor_picks jsonb := '[]'::jsonb;
  sanitized_picks jsonb;
  validation jsonb;
  next_draft_revision bigint;
  draft_id_value uuid;
  response_value jsonb;
  mutability jsonb;
begin
  target := production_control.assert_draft_authoring_resource_v2(input, resource_context);
  if input->>'operation' is distinct from
       'STAGE_PRODUCTION_DRAFT_REVISION_V1'
     or coalesce(input->>'operation_request_id','')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or declared_hash !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'expected_revision','') !~ '^[0-9]+$'
     or pg_catalog.jsonb_typeof(input->'configuration') is distinct from 'object'
     or pg_catalog.jsonb_typeof(input->'picks') is distinct from 'array'
     or reason_value='' or pg_catalog.length(reason_value)>500 then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','DRAFT_INPUT_INVALID');
  end if;
  actor_auth := (input#>>'{authorization,auth_user_id}')::uuid;
  request_id := (input->>'operation_request_id')::uuid;
  expected_value := (input->>'expected_revision')::bigint;
  database_hash := production_control.draft_authoring_hash_v1(
    pg_catalog.jsonb_build_object(
      'operation','STAGE','tournamentId',target,
      'actorPlayerId',actor_player,'actorAuthUserId',actor_auth,
      'expectedRevision',expected_value,
      'configuration',input->'configuration','picks',input->'picks',
      'reason',reason_value));
  prior_receipt := production_control.draft_operation_receipt_v1(
    target,'STAGE',request_id,declared_hash,database_hash);
  if prior_receipt is not null then return prior_receipt; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'production-draft-authoring:'||target,0));
  prior_receipt := production_control.draft_operation_receipt_v1(
    target,'STAGE',request_id,declared_hash,database_hash);
  if prior_receipt is not null then return prior_receipt; end if;
  mutability := production_control.draft_mutability_v1(target);
  if not coalesce((mutability->>'editable')::boolean,false) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','DRAFT_CORRECTION_REQUIRED',
      'mutability',mutability);
  end if;
  select value.* into current_pointer
  from scoring_authority.draft_current_revisions value
  where value.tournament_id=target for update;
  if current_pointer.revision_id is not null then
    select value.* into current_revision
    from scoring_authority.draft_revisions value
    where value.revision_id=current_pointer.revision_id;
    predecessor_picks := production_control.draft_projection_row_v1(
      current_pointer.revision_id)->'picks';
  end if;
  if coalesce(current_revision.revision_number,0)<>expected_value then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','DRAFT_PREDECESSOR_STALE',
      'currentRevision',coalesce(current_revision.revision_number,0));
  end if;
  sanitized_picks := production_control.draft_sanitize_pick_provenance_v1(
    input->'picks',predecessor_picks);
  validation := production_control.validate_draft_authoring_v1(
    target,input->'configuration',sanitized_picks);
  if not coalesce((validation->>'pass')::boolean,false) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','DRAFT_VALIDATION_FAILED',
      'issues',validation->'issues');
  end if;
  if current_revision.revision_id is not null
     and current_revision.payload_fingerprint=
       validation->>'payloadFingerprint' then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','DRAFT_NO_CHANGES');
  end if;
  update production_control.draft_authoring_drafts_v1 set state='SUPERSEDED'
  where tournament_id=target and state in ('STAGED','VALIDATED');
  select coalesce(pg_catalog.max(value.draft_revision),0)+1
    into next_draft_revision
  from production_control.draft_authoring_drafts_v1 value
  where value.tournament_id=target;
  insert into production_control.draft_authoring_drafts_v1 (
    tournament_id,draft_revision,state,authoring_kind,expected_revision,
    predecessor_revision_id,configuration,picks,presentation_seed,
    configuration_fingerprint,picks_fingerprint,payload_fingerprint,
    validation_diagnostics,reason,created_by_player_id,
    created_by_auth_user_id
  ) values (
    target,next_draft_revision,'STAGED','DIRECTOR_EDIT',expected_value,
    current_revision.revision_id,validation->'configuration',validation->'picks',
    validation->'presentationSeed',validation->>'configurationFingerprint',
    validation->>'picksFingerprint',validation->>'payloadFingerprint',
    validation->'diagnostics',reason_value,actor_player,actor_auth
  ) returning draft_id into draft_id_value;
  response_value := pg_catalog.jsonb_build_object(
    'ok',true,'code','DRAFT_REVISION_STAGED','idempotent',false,
    'tournamentId',target,'draftId',draft_id_value,
    'draftRevision',next_draft_revision,'state','STAGED',
    'expectedRevision',expected_value,
    'configuration',validation->'configuration','picks',validation->'picks',
    'validationDiagnostics',validation->'diagnostics');
  insert into production_control.draft_authoring_audit_events_v1 (
    tournament_id,draft_id,action,actor_player_id,actor_auth_user_id,
    operation_request_id,summary
  ) values (
    target,draft_id_value,'REVISION_STAGED',actor_player,actor_auth,request_id,
    pg_catalog.jsonb_build_object(
      'draftRevision',next_draft_revision,
      'predecessorRevision',expected_value,
      'totalPicks',(validation#>>'{configuration,total_picks}')::integer,
      'selectedPicks',(validation#>>'{diagnostics,selectedPicks}')::integer));
  insert into production_control.draft_operation_receipts_v1 (
    tournament_id,operation,operation_request_id,
    declared_request_payload_hash,request_payload_hash,
    actor_player_id,actor_auth_user_id,response
  ) values (
    target,'STAGE',request_id,declared_hash,database_hash,
    actor_player,actor_auth,response_value);
  return response_value;
exception when invalid_text_representation or numeric_value_out_of_range then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','DRAFT_INPUT_INVALID');
when unique_violation then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','DRAFT_OPERATION_CONFLICT');
end;

$canonical$;
revoke all on function production_control.canonical_stage_draft_revision_resource_v2(jsonb,jsonb) from public,anon,authenticated,service_role;

create or replace function public.stage_production_draft_revision_v1(input jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $wrapper$
begin
 perform production_control.assert_draft_authoring_v1(input);
 return production_control.canonical_stage_draft_revision_resource_v2(input,production_control.annual_resource_context_v2());
end;
$wrapper$;

create function production_control.canonical_validate_draft_revision_resource_v2(input jsonb, resource_context jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $canonical$

declare
  target text;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}','')));
  actor_auth uuid;
  request_id uuid;
  draft_id_value uuid;
  declared_hash text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'request_payload_hash','')));
  expected_value bigint;
  database_hash text;
  prior_receipt jsonb;
  draft production_control.draft_authoring_drafts_v1%rowtype;
  current_revision scoring_authority.draft_revisions%rowtype;
  validation jsonb;
  response_value jsonb;
  mutability jsonb;
begin
  target := production_control.assert_draft_authoring_resource_v2(input, resource_context);
  if input->>'operation' is distinct from
       'VALIDATE_PRODUCTION_DRAFT_REVISION_V1'
     or coalesce(input->>'operation_request_id','')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'draft_id','')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or declared_hash !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'expected_revision','') !~ '^[0-9]+$' then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','DRAFT_INPUT_INVALID');
  end if;
  actor_auth := (input#>>'{authorization,auth_user_id}')::uuid;
  request_id := (input->>'operation_request_id')::uuid;
  draft_id_value := (input->>'draft_id')::uuid;
  expected_value := (input->>'expected_revision')::bigint;
  database_hash := production_control.draft_authoring_hash_v1(
    pg_catalog.jsonb_build_object(
      'operation','VALIDATE','tournamentId',target,
      'actorPlayerId',actor_player,'actorAuthUserId',actor_auth,
      'draftId',draft_id_value,'expectedRevision',expected_value));
  prior_receipt := production_control.draft_operation_receipt_v1(
    target,'VALIDATE',request_id,declared_hash,database_hash);
  if prior_receipt is not null then return prior_receipt; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'production-draft-authoring:'||target,0));
  prior_receipt := production_control.draft_operation_receipt_v1(
    target,'VALIDATE',request_id,declared_hash,database_hash);
  if prior_receipt is not null then return prior_receipt; end if;
  mutability := production_control.draft_mutability_v1(target);
  if not coalesce((mutability->>'editable')::boolean,false) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','DRAFT_CORRECTION_REQUIRED','mutability',mutability);
  end if;
  select value.* into strict draft
  from production_control.draft_authoring_drafts_v1 value
  where value.draft_id=draft_id_value and value.tournament_id=target
  for update;
  select revision.* into current_revision
  from scoring_authority.draft_current_revisions pointer
  join scoring_authority.draft_revisions revision
    on revision.revision_id=pointer.revision_id
  where pointer.tournament_id=target for update of pointer;
  if coalesce(current_revision.revision_number,0)<>expected_value
     or draft.expected_revision<>expected_value
     or draft.state not in ('STAGED','VALIDATED') then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','DRAFT_PREDECESSOR_STALE');
  end if;
  validation := production_control.validate_draft_authoring_v1(
    target,draft.configuration,draft.picks);
  if not coalesce((validation->>'pass')::boolean,false) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','DRAFT_VALIDATION_FAILED',
      'issues',validation->'issues');
  end if;
  update production_control.draft_authoring_drafts_v1 set
    state='VALIDATED',configuration=validation->'configuration',
    picks=validation->'picks',presentation_seed=validation->'presentationSeed',
    configuration_fingerprint=validation->>'configurationFingerprint',
    picks_fingerprint=validation->>'picksFingerprint',
    payload_fingerprint=validation->>'payloadFingerprint',
    validation_diagnostics=validation->'diagnostics'||
      pg_catalog.jsonb_build_object('validated',true),
    validated_at=coalesce(validated_at,pg_catalog.clock_timestamp())
  where draft_id=draft_id_value;
  if draft.state='STAGED' then
    insert into production_control.draft_authoring_audit_events_v1 (
      tournament_id,draft_id,action,actor_player_id,actor_auth_user_id,
      operation_request_id,summary
    ) values (
      target,draft_id_value,'REVISION_VALIDATED',actor_player,actor_auth,
      request_id,pg_catalog.jsonb_build_object(
        'draftRevision',draft.draft_revision,
        'totalPicks',(validation#>>'{configuration,total_picks}')::integer,
        'selectedPicks',(validation#>>'{diagnostics,selectedPicks}')::integer));
  end if;
  response_value := pg_catalog.jsonb_build_object(
    'ok',true,'code','DRAFT_REVISION_VALIDATED',
    'idempotent',draft.state='VALIDATED','tournamentId',target,
    'draftId',draft_id_value,'draftRevision',draft.draft_revision,
    'state','VALIDATED','configuration',validation->'configuration',
    'picks',validation->'picks',
    'validationDiagnostics',validation->'diagnostics');
  insert into production_control.draft_operation_receipts_v1 (
    tournament_id,operation,operation_request_id,
    declared_request_payload_hash,request_payload_hash,
    actor_player_id,actor_auth_user_id,response
  ) values (
    target,'VALIDATE',request_id,declared_hash,database_hash,
    actor_player,actor_auth,response_value);
  return response_value;
exception when no_data_found then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','DRAFT_STAGED_REVISION_NOT_FOUND');
end;

$canonical$;
revoke all on function production_control.canonical_validate_draft_revision_resource_v2(jsonb,jsonb) from public,anon,authenticated,service_role;

create or replace function public.validate_production_draft_revision_v1(input jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $wrapper$
begin
 perform production_control.assert_draft_authoring_v1(input);
 return production_control.canonical_validate_draft_revision_resource_v2(input,production_control.annual_resource_context_v2());
end;
$wrapper$;

create function production_control.canonical_commit_draft_revision_resource_v2(input jsonb, resource_context jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $canonical$

declare
  target text;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}','')));
  actor_auth uuid;
  request_id uuid;
  draft_id_value uuid;
  declared_hash text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'request_payload_hash','')));
  expected_value bigint;
  database_hash text;
  prior_receipt jsonb;
  draft production_control.draft_authoring_drafts_v1%rowtype;
  current_revision scoring_authority.draft_revisions%rowtype;
  pointer production_control.current_tournament_pointer_v1%rowtype;
  resource production_control.canonical_resource_v1%rowtype;
  catalog production_control.future_tournament_catalog_v1%rowtype;
  annual_resource production_control.future_tournament_resources_v1%rowtype;
  promotion production_control.future_runtime_promotions_v2%rowtype;
  binding production_control.future_annual_projection_bindings_v1%rowtype;
  final_picks jsonb;
  validation jsonb;
  next_revision bigint;
  next_binding_revision bigint;
  revision_id_value uuid;
  source_hash text;
  binding_payload_hash text;
  selected_count integer;
  effective_at_value timestamptz;
  projection_row jsonb;
  projection_value jsonb;
  response_value jsonb;
  operation_value text;
  mutability jsonb;
  pick_event record;
begin
  target := production_control.assert_draft_authoring_resource_v2(input, resource_context);
  if input->>'operation' is distinct from
       'COMMIT_PRODUCTION_DRAFT_REVISION_V1'
     or coalesce(input->>'operation_request_id','')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'draft_id','')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or declared_hash !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'expected_revision','') !~ '^[0-9]+$'
     or input->>'confirmation' is distinct from 'SAVE DRAFT REVISION' then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','DRAFT_COMMIT_INPUT_INVALID');
  end if;
  actor_auth := (input#>>'{authorization,auth_user_id}')::uuid;
  request_id := (input->>'operation_request_id')::uuid;
  draft_id_value := (input->>'draft_id')::uuid;
  expected_value := (input->>'expected_revision')::bigint;
  database_hash := production_control.draft_authoring_hash_v1(
    pg_catalog.jsonb_build_object(
      'operation','COMMIT','tournamentId',target,
      'actorPlayerId',actor_player,'actorAuthUserId',actor_auth,
      'draftId',draft_id_value,'expectedRevision',expected_value,
      'confirmation',input->>'confirmation'));
  prior_receipt := production_control.draft_operation_receipt_v1(
    target,'COMMIT',request_id,declared_hash,database_hash);
  if prior_receipt is not null then return prior_receipt; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'production-draft-authoring:'||target,0));
  prior_receipt := production_control.draft_operation_receipt_v1(
    target,'COMMIT',request_id,declared_hash,database_hash);
  if prior_receipt is not null then return prior_receipt; end if;
  mutability := production_control.draft_mutability_v1(target);
  if not coalesce((mutability->>'editable')::boolean,false) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','DRAFT_CORRECTION_REQUIRED','mutability',mutability);
  end if;
  select value.* into strict draft
  from production_control.draft_authoring_drafts_v1 value
  where value.draft_id=draft_id_value and value.tournament_id=target
  for update;
  select revision.* into current_revision
  from scoring_authority.draft_current_revisions current_value
  join scoring_authority.draft_revisions revision
    on revision.revision_id=current_value.revision_id
  where current_value.tournament_id=target for update of current_value;
  if coalesce(current_revision.revision_number,0)<>expected_value
     or draft.expected_revision<>expected_value then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','DRAFT_PREDECESSOR_STALE',
      'currentRevision',coalesce(current_revision.revision_number,0));
  end if;
  if draft.state<>'VALIDATED' then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','DRAFT_STAGED_REVISION_NOT_VALIDATED');
  end if;
  effective_at_value := pg_catalog.clock_timestamp();
  final_picks := production_control.draft_commit_pick_provenance_v1(
    draft.picks,actor_player,effective_at_value);
  validation := production_control.validate_draft_authoring_v1(
    target,draft.configuration,final_picks);
  if not coalesce((validation->>'pass')::boolean,false) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','DRAFT_VALIDATION_FAILED',
      'issues',validation->'issues');
  end if;
  if current_revision.revision_id is not null
     and current_revision.payload_fingerprint=
       validation->>'payloadFingerprint' then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','DRAFT_NO_CHANGES');
  end if;
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key=(resource_context->>'resource_id');
  select value.* into strict resource
  from production_control.canonical_resource_v1 value
  where value.resource_id=(resource_context->>'resource_id');
  select coalesce(pg_catalog.max(value.revision_number),0)+1
    into next_revision
  from scoring_authority.draft_revisions value
  where value.tournament_id=target;
  source_hash := production_control.draft_authoring_hash_v1(
    pg_catalog.jsonb_build_object(
      'authoringAuthority','SUPABASE_DIRECTOR',
      'authoringContract','production-draft-authoring-v1',
      'tournamentId',target,'revision',next_revision,
      'configuration',validation->'configuration',
      'picks',validation->'picks'));
  selected_count := (validation#>>'{diagnostics,selectedPicks}')::integer;
  operation_value := case when draft.authoring_kind='COPIED_PREVIOUS'
    then 'DIRECTOR_CLONE' else 'DIRECTOR_REVISION' end;
  perform pg_catalog.set_config(
    'scoring_authority.draft_projection_import','on',true);
  insert into scoring_authority.draft_revisions (
    project_ref,source_workbook_id,source_tabs,tournament_id,tournament_year,
    revision_number,previous_revision_id,source_fingerprint,
    configuration_fingerprint,picks_fingerprint,payload_fingerprint,
    contract_version,validation_status,validation_diagnostics,
    source_settings,source_picks,configuration,presentation_seed,
    operation,correction_reason,synchronized_by,synchronized_at
  ) values (
    resource.project_ref,resource.provenance_id,
    '["Draft Settings","Draft Picks"]'::jsonb,target,target::integer,
    next_revision,current_revision.revision_id,source_hash,
    validation->>'configurationFingerprint',validation->>'picksFingerprint',
    validation->>'payloadFingerprint','draft-projection-v1','VALID',
    (validation->'diagnostics')||pg_catalog.jsonb_build_object(
      'authoringAuthority','SUPABASE_DIRECTOR',
      'authoringContract','production-draft-authoring-v1'),
    validation->'configuration',validation->'picks',
    validation->'configuration',validation->'presentationSeed',
    operation_value,null,actor_player,effective_at_value
  ) returning revision_id into revision_id_value;
  insert into scoring_authority.draft_configuration_facts (
    revision_id,tournament_id,tournament_year,draft_name,draft_date,draft_time,
    time_zone,location,status_mode,draft_format,total_picks,team_1_id,team_2_id,
    team_1_captain_player_id,team_2_captain_player_id,first_pick_team_id,notes
  ) values (
    revision_id_value,target,target::integer,
    validation#>>'{configuration,name}',
    nullif(validation#>>'{configuration,date}',''),
    nullif(validation#>>'{configuration,time}',''),
    nullif(validation#>>'{configuration,time_zone}',''),
    nullif(validation#>>'{configuration,location}',''),
    nullif(validation#>>'{configuration,status_mode}',''),
    nullif(validation#>>'{configuration,format}',''),
    (validation#>>'{configuration,total_picks}')::integer,
    validation#>>'{configuration,team_1_id}',
    validation#>>'{configuration,team_2_id}',
    nullif(validation#>>'{configuration,team_1_captain_player_id}',''),
    nullif(validation#>>'{configuration,team_2_captain_player_id}',''),
    validation#>>'{configuration,first_pick_team_id}',
    nullif(validation#>>'{configuration,notes}',''));
  insert into scoring_authority.draft_pick_facts (
    revision_id,tournament_id,tournament_year,pick_number,round_number,
    pick_within_round,source_team_id,team_id,player_id,player_name_snapshot,
    selected_at_source,selected_by_source,pick_status,notes,
    presentation_snapshot
  ) select revision_id_value,target,target::integer,
    (item.value->>'pick_number')::integer,
    (item.value->>'round_number')::integer,
    (item.value->>'pick_within_round')::integer,
    nullif(item.value->>'source_team_id',''),nullif(item.value->>'team_id',''),
    nullif(item.value->>'player_id',''),nullif(item.value->>'player_name',''),
    nullif(item.value->>'selected_at',''),nullif(item.value->>'selected_by',''),
    item.value->>'status',nullif(item.value->>'notes',''),
    coalesce(item.value->'presentation','{}'::jsonb)
  from pg_catalog.jsonb_array_elements(validation->'picks') item;
  insert into scoring_authority.draft_current_revisions (
    tournament_id,tournament_year,revision_id,advanced_by,advanced_at
  ) values (
    target,target::integer,revision_id_value,actor_player,effective_at_value
  ) on conflict (tournament_id) do update set
    tournament_year=excluded.tournament_year,
    revision_id=excluded.revision_id,advanced_by=excluded.advanced_by,
    advanced_at=excluded.advanced_at;
  insert into production_control.draft_revision_provenance_v1 (
    revision_id,tournament_id,authoring_authority,authoring_contract,draft_id,
    actor_player_id,actor_auth_user_id,authoring_kind,selected_pick_count,
    created_at
  ) values (
    revision_id_value,target,'SUPABASE_DIRECTOR',
    'production-draft-authoring-v1',draft_id_value,actor_player,actor_auth,
    draft.authoring_kind,selected_count,effective_at_value);

  if target<>pointer.tournament_id then
    select value.* into strict catalog
    from production_control.future_tournament_catalog_v1 value
    where value.tournament_id=target for update;
    select value.* into strict annual_resource
    from production_control.future_tournament_resources_v1 value
    where value.tournament_id=target
      and value.source_workbook_id is not null
      and value.resource_status='CURRENT_RESOURCE_BOUND' for share;
    select value.* into promotion
    from production_control.future_runtime_promotions_v2 value
    where value.tournament_id=target;
    select value.* into binding
    from production_control.future_annual_projection_bindings_v1 value
    where value.tournament_id=target and value.domain='DRAFT' for update;
    update production_control.future_tournament_catalog_v1 value set
      lifecycle=case when value.lifecycle='READY_FOR_ACTIVATION'
        then 'CONFIGURING' else value.lifecycle end,
      lifecycle_revision=case when value.lifecycle='READY_FOR_ACTIVATION'
        then value.lifecycle_revision+1 else value.lifecycle_revision end,
      setup_revision=case when promotion.tournament_id is null
        then value.setup_revision+1 else value.setup_revision end,
      readiness_fingerprint=null,readiness_setup_revision=null,
      updated_by_player_id=actor_player,updated_at=effective_at_value
    where value.tournament_id=target;
    select value.* into strict catalog
    from production_control.future_tournament_catalog_v1 value
    where value.tournament_id=target;
    next_binding_revision:=coalesce(binding.binding_revision,0)+1;
    projection_row:=production_control.draft_projection_row_v1(
      revision_id_value);
    projection_value:=pg_catalog.jsonb_build_object(
      'drafts',pg_catalog.jsonb_build_array(projection_row),
      'synchronization_fingerprint',source_hash,
      'authoring_authority','SUPABASE_DIRECTOR');
    binding_payload_hash:=production_control.draft_authoring_hash_v1(
      projection_value);
    insert into production_control.future_annual_projection_bindings_v1 (
      tournament_id,domain,source_workbook_id,source_revision,
      binding_revision,source_fingerprint,payload_fingerprint,projection,
      certification_status,certified_by_player_id,certified_at,
      authoring_authority
    ) values (
      target,'DRAFT',annual_resource.source_workbook_id,next_revision,
      next_binding_revision,source_hash,binding_payload_hash,projection_value,
      'CERTIFIED',actor_player,effective_at_value,'SUPABASE_DIRECTOR'
    ) on conflict (tournament_id,domain) do update set
      source_workbook_id=excluded.source_workbook_id,
      source_revision=excluded.source_revision,
      binding_revision=excluded.binding_revision,
      source_fingerprint=excluded.source_fingerprint,
      payload_fingerprint=excluded.payload_fingerprint,
      projection=excluded.projection,
      certification_status=excluded.certification_status,
      certified_by_player_id=excluded.certified_by_player_id,
      certified_at=excluded.certified_at,
      authoring_authority=excluded.authoring_authority,
      updated_at=effective_at_value;
  end if;
  update production_control.draft_authoring_drafts_v1 set
    state='COMMITTED',configuration=validation->'configuration',
    picks=validation->'picks',presentation_seed=validation->'presentationSeed',
    configuration_fingerprint=validation->>'configurationFingerprint',
    picks_fingerprint=validation->>'picksFingerprint',
    payload_fingerprint=validation->>'payloadFingerprint',
    validation_diagnostics=validation->'diagnostics'||
      pg_catalog.jsonb_build_object('committed',true),
    committed_revision_id=revision_id_value,committed_at=effective_at_value
  where draft_id=draft_id_value;
  response_value:=pg_catalog.jsonb_build_object(
    'ok',true,'code','DRAFT_REVISION_COMMITTED','idempotent',false,
    'tournamentId',target,'revisionId',revision_id_value,
    'revision',next_revision,'previousRevisionId',current_revision.revision_id,
    'authoringAuthority','SUPABASE_DIRECTOR',
    'selectedPickCount',selected_count,'effectiveAt',effective_at_value,
    'current',production_control.draft_projection_row_v1(revision_id_value));
  insert into production_control.draft_authoring_audit_events_v1 (
    tournament_id,draft_id,revision_id,action,actor_player_id,
    actor_auth_user_id,operation_request_id,summary
  ) values (
    target,draft_id_value,revision_id_value,'REVISION_COMMITTED',
    actor_player,actor_auth,request_id,pg_catalog.jsonb_build_object(
      'revision',next_revision,'predecessorRevision',expected_value,
      'selectedPickCount',selected_count,
      'summary','Draft Revision '||next_revision||' saved'));
  for pick_event in
    select current_pick.pick_number,current_pick.team_id,
      current_pick.player_id,current_pick.pick_status,
      previous_pick.player_id as previous_player_id,
      previous_pick.team_id as previous_team_id
    from scoring_authority.draft_pick_facts current_pick
    left join scoring_authority.draft_pick_facts previous_pick
      on previous_pick.revision_id=current_revision.revision_id
     and previous_pick.pick_number=current_pick.pick_number
     and previous_pick.pick_status='SELECTED'
    where current_pick.revision_id=revision_id_value and (
      (current_pick.pick_status='SELECTED' and (
        previous_pick.pick_number is null
        or previous_pick.player_id is distinct from current_pick.player_id
        or previous_pick.team_id is distinct from current_pick.team_id
      )) or (
        current_pick.pick_status<>'SELECTED'
        and previous_pick.pick_number is not null
      )
    )
    order by current_pick.pick_number
  loop
    insert into production_control.draft_authoring_audit_events_v1 (
      tournament_id,draft_id,revision_id,action,actor_player_id,
      actor_auth_user_id,operation_request_id,summary
    ) values (
      target,draft_id_value,revision_id_value,
      case when pick_event.previous_player_id is null
             and pick_event.pick_status='SELECTED'
        then 'PICK_RECORDED' else 'PICK_CORRECTED' end,
      actor_player,actor_auth,request_id,pg_catalog.jsonb_strip_nulls(
        pg_catalog.jsonb_build_object(
        'pickNumber',pick_event.pick_number,
        'playerId',case when pick_event.pick_status='SELECTED'
          then pick_event.player_id else null end,
        'teamId',pick_event.team_id,
        'summary',case
          when pick_event.pick_status<>'SELECTED'
            then 'Pick '||pick_event.pick_number||' cleared'
          when pick_event.previous_player_id is null
          then 'Pick '||pick_event.pick_number||' recorded — Player '||
            pick_event.player_id||' to Team '||pick_event.team_id
          else 'Pick '||pick_event.pick_number||' corrected — Player '||
            pick_event.player_id||' to Team '||pick_event.team_id end)));
  end loop;
  if (
       pg_catalog.upper(validation#>>'{configuration,status_mode}')='COMPLETE'
       or selected_count >= (validation#>>'{configuration,total_picks}')::integer
     ) and not (
       pg_catalog.upper(coalesce(
         current_revision.configuration->>'status_mode',''))='COMPLETE'
       or (
         coalesce((current_revision.configuration->>'total_picks')::integer,0)>0
         and (select pg_catalog.count(*)::integer
           from scoring_authority.draft_pick_facts previous_pick
           where previous_pick.revision_id=current_revision.revision_id
             and previous_pick.pick_status='SELECTED') >=
           coalesce((current_revision.configuration->>'total_picks')::integer,0)
       )
     ) then
    insert into production_control.draft_authoring_audit_events_v1 (
      tournament_id,draft_id,revision_id,action,actor_player_id,
      actor_auth_user_id,operation_request_id,summary
    ) values (
      target,draft_id_value,revision_id_value,'DRAFT_COMPLETED',
      actor_player,actor_auth,request_id,pg_catalog.jsonb_build_object(
        'revision',next_revision,
        'summary','Draft completed at Revision '||next_revision));
  end if;
  insert into production_control.operation_audit_events (
    event_type,domain,tournament_id,actor,request_fingerprint,result,details
  ) values (
    'PRODUCTION_DRAFT_REVISION_COMMITTED','DRAFT',target,actor_player,null,
    'SUCCEEDED',pg_catalog.jsonb_build_object(
      'revision',next_revision,'selected_pick_count',selected_count,
      'authoring_authority','SUPABASE_DIRECTOR'));
  insert into production_control.draft_operation_receipts_v1 (
    tournament_id,operation,operation_request_id,
    declared_request_payload_hash,request_payload_hash,
    actor_player_id,actor_auth_user_id,response
  ) values (
    target,'COMMIT',request_id,declared_hash,database_hash,
    actor_player,actor_auth,response_value);
  return response_value;
exception when no_data_found then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','DRAFT_STAGED_REVISION_NOT_FOUND');
when unique_violation then
  return pg_catalog.jsonb_build_object(
    'ok',false,'code','DRAFT_OPERATION_CONFLICT');
end;

$canonical$;
revoke all on function production_control.canonical_commit_draft_revision_resource_v2(jsonb,jsonb) from public,anon,authenticated,service_role;

create or replace function public.commit_production_draft_revision_v1(input jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $wrapper$
begin
 perform production_control.assert_draft_authoring_v1(input);
 return production_control.canonical_commit_draft_revision_resource_v2(input,production_control.annual_resource_context_v2());
end;
$wrapper$;

create function production_control.canonical_stage_prediction_settings_revision_resource_v2(input jsonb, resource_context jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $canonical$

declare
  target text;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', ''
  )));
  actor_auth uuid;
  request_id uuid;
  declared_hash text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'request_payload_hash', ''
  )));
  expected_revision bigint;
  current_config scoring_authority.odds_input_configurations%rowtype;
  validation jsonb;
  database_hash text;
  prior_receipt jsonb;
  next_draft_revision bigint;
  draft_id_value uuid;
  response_value jsonb;
  reason_value text := pg_catalog.btrim(coalesce(input->>'reason', ''));
begin
  target := production_control.assert_prediction_settings_authoring_resource_v2(input, resource_context);
  if input->>'operation' is distinct from
       'STAGE_PRODUCTION_PREDICTION_SETTINGS_REVISION_V1'
     or coalesce(input->>'operation_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or declared_hash !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'expected_configuration_revision', '')
       !~ '^[0-9]+$'
     or pg_catalog.jsonb_typeof(input->'canonical_settings')
       is distinct from 'object'
     or reason_value = '' or pg_catalog.length(reason_value) > 500 then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PREDICTION_SETTINGS_INPUT_INVALID'
    );
  end if;
  actor_auth := (input#>>'{authorization,auth_user_id}')::uuid;
  request_id := (input->>'operation_request_id')::uuid;
  expected_revision := (input->>'expected_configuration_revision')::bigint;
  database_hash := production_control.prediction_settings_hash_v1(
    pg_catalog.jsonb_build_object(
      'operation', 'STAGE', 'tournamentId', target,
      'actorPlayerId', actor_player, 'actorAuthUserId', actor_auth,
      'expectedConfigurationRevision', expected_revision,
      'canonicalSettings', input->'canonical_settings',
      'reason', reason_value
    )
  );
  prior_receipt := production_control.prediction_settings_receipt_v1(
    target, 'STAGE', request_id, declared_hash, database_hash
  );
  if prior_receipt is not null then return prior_receipt; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'production-prediction-settings:' || target, 0
  ));
  prior_receipt := production_control.prediction_settings_receipt_v1(
    target, 'STAGE', request_id, declared_hash, database_hash
  );
  if prior_receipt is not null then return prior_receipt; end if;
  select value.* into current_config
  from scoring_authority.odds_input_configurations value
  where value.tournament_id = target and value.is_current for update;
  if coalesce(current_config.configuration_revision, 0) <> expected_revision then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PREDICTION_SETTINGS_PREDECESSOR_STALE',
      'currentRevision', coalesce(current_config.configuration_revision, 0)
    );
  end if;
  validation := production_control.validate_prediction_settings_v1(
    input->'canonical_settings', current_config.canonical_settings
  );
  if not coalesce((validation->>'pass')::boolean, false) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PREDICTION_SETTINGS_VALIDATION_FAILED',
      'issues', validation->'issues'
    );
  end if;
  if coalesce((validation->>'changedSettingCount')::integer, 0) = 0 then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PREDICTION_SETTINGS_NO_CHANGES'
    );
  end if;
  update production_control.prediction_settings_drafts_v1 set
    state = 'SUPERSEDED'
  where tournament_id = target and state in ('STAGED', 'VALIDATED');
  select coalesce(pg_catalog.max(value.draft_revision), 0) + 1
    into next_draft_revision
  from production_control.prediction_settings_drafts_v1 value
  where value.tournament_id = target;
  insert into production_control.prediction_settings_drafts_v1 (
    tournament_id, draft_revision, state, authoring_kind,
    expected_configuration_revision, predecessor_configuration_id,
    canonical_settings, effective_settings, settings_fingerprint,
    effective_settings_fingerprint, changed_keys,
    validation_diagnostics, reason, created_by_player_id,
    created_by_auth_user_id
  ) values (
    target, next_draft_revision, 'STAGED', 'DIRECTOR_EDIT',
    expected_revision, current_config.id,
    validation->'canonicalSettings', validation->'effectiveSettings',
    validation->>'settingsFingerprint',
    validation->>'effectiveSettingsFingerprint',
    validation->'changedKeys',
    pg_catalog.jsonb_build_object(
      'contractVersion', 'production-prediction-settings-authoring-v1',
      'settingsContractVersion', 'prediction-settings-v1',
      'completeSchema', true,
      'legacyRecalibrationProfile',
        coalesce((validation->>'legacyRecalibrationProfile')::boolean, false),
      'issues', '[]'::jsonb
    ),
    reason_value, actor_player, actor_auth
  ) returning draft_id into draft_id_value;
  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PREDICTION_SETTINGS_REVISION_STAGED',
    'idempotent', false,
    'tournamentId', target,
    'draftId', draft_id_value,
    'draftRevision', next_draft_revision,
    'state', 'STAGED',
    'expectedConfigurationRevision', expected_revision,
    'changedKeys', validation->'changedKeys',
    'changedSettingCount',
      (validation->>'changedSettingCount')::integer,
    'recalculationRequiredAfterCommit', true
  );
  insert into production_control.prediction_settings_audit_events_v1 (
    tournament_id, draft_id, action, actor_player_id,
    actor_auth_user_id, operation_request_id, request_payload_hash, summary
  ) values (
    target, draft_id_value, 'REVISION_STAGED', actor_player, actor_auth,
    request_id, database_hash, pg_catalog.jsonb_build_object(
      'draftRevision', next_draft_revision,
      'predecessorConfigurationRevision', expected_revision,
      'changedSettingCount',
        (validation->>'changedSettingCount')::integer
    )
  );
  insert into production_control.prediction_settings_operation_receipts_v1 (
    tournament_id, operation, operation_request_id,
    declared_request_payload_hash, request_payload_hash,
    actor_player_id, actor_auth_user_id, response
  ) values (
    target, 'STAGE', request_id, declared_hash, database_hash,
    actor_player, actor_auth, response_value
  );
  return response_value;
exception when invalid_text_representation or numeric_value_out_of_range then
  return pg_catalog.jsonb_build_object(
    'ok', false, 'code', 'PREDICTION_SETTINGS_INPUT_INVALID'
  );
end;

$canonical$;
revoke all on function production_control.canonical_stage_prediction_settings_revision_resource_v2(jsonb,jsonb) from public,anon,authenticated,service_role;

create or replace function public.stage_production_prediction_settings_revision_v1(input jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $wrapper$
begin
 perform production_control.assert_prediction_settings_authoring_v1(input);
 return production_control.canonical_stage_prediction_settings_revision_resource_v2(input,production_control.annual_resource_context_v2());
end;
$wrapper$;

create function production_control.canonical_validate_prediction_settings_revision_resource_v2(input jsonb, resource_context jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $canonical$

declare
  target text;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', ''
  )));
  actor_auth uuid;
  request_id uuid;
  draft_id_value uuid;
  declared_hash text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'request_payload_hash', ''
  )));
  expected_revision bigint;
  database_hash text;
  prior_receipt jsonb;
  draft production_control.prediction_settings_drafts_v1%rowtype;
  current_config scoring_authority.odds_input_configurations%rowtype;
  validation jsonb;
  response_value jsonb;
begin
  target := production_control.assert_prediction_settings_authoring_resource_v2(input, resource_context);
  if input->>'operation' is distinct from
       'VALIDATE_PRODUCTION_PREDICTION_SETTINGS_REVISION_V1'
     or coalesce(input->>'operation_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or declared_hash !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'draft_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'expected_configuration_revision', '')
       !~ '^[0-9]+$' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PREDICTION_SETTINGS_INPUT_INVALID'
    );
  end if;
  actor_auth := (input#>>'{authorization,auth_user_id}')::uuid;
  request_id := (input->>'operation_request_id')::uuid;
  draft_id_value := (input->>'draft_id')::uuid;
  expected_revision := (input->>'expected_configuration_revision')::bigint;
  database_hash := production_control.prediction_settings_hash_v1(
    pg_catalog.jsonb_build_object(
      'operation', 'VALIDATE', 'tournamentId', target,
      'actorPlayerId', actor_player, 'actorAuthUserId', actor_auth,
      'draftId', draft_id_value,
      'expectedConfigurationRevision', expected_revision
    )
  );
  prior_receipt := production_control.prediction_settings_receipt_v1(
    target, 'VALIDATE', request_id, declared_hash, database_hash
  );
  if prior_receipt is not null then return prior_receipt; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'production-prediction-settings:' || target, 0
  ));
  prior_receipt := production_control.prediction_settings_receipt_v1(
    target, 'VALIDATE', request_id, declared_hash, database_hash
  );
  if prior_receipt is not null then return prior_receipt; end if;
  select value.* into strict draft
  from production_control.prediction_settings_drafts_v1 value
  where value.draft_id = draft_id_value
    and value.tournament_id = target for update;
  select value.* into current_config
  from scoring_authority.odds_input_configurations value
  where value.tournament_id = target and value.is_current for update;
  if coalesce(current_config.configuration_revision, 0) <> expected_revision
     or draft.expected_configuration_revision <> expected_revision
     or draft.state not in ('STAGED', 'VALIDATED') then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PREDICTION_SETTINGS_PREDECESSOR_STALE'
    );
  end if;
  validation := production_control.validate_prediction_settings_v1(
    draft.canonical_settings, current_config.canonical_settings
  );
  if not coalesce((validation->>'pass')::boolean, false) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PREDICTION_SETTINGS_VALIDATION_FAILED',
      'issues', validation->'issues'
    );
  end if;
  if coalesce((validation->>'changedSettingCount')::integer, 0) = 0 then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PREDICTION_SETTINGS_NO_CHANGES'
    );
  end if;
  update production_control.prediction_settings_drafts_v1 set
    state = 'VALIDATED',
    effective_settings = validation->'effectiveSettings',
    settings_fingerprint = validation->>'settingsFingerprint',
    effective_settings_fingerprint =
      validation->>'effectiveSettingsFingerprint',
    changed_keys = validation->'changedKeys',
    validation_diagnostics = validation_diagnostics ||
      pg_catalog.jsonb_build_object('validated', true),
    validated_at = coalesce(validated_at, pg_catalog.clock_timestamp())
  where draft_id = draft_id_value;
  if draft.state = 'STAGED' then
    insert into production_control.prediction_settings_audit_events_v1 (
      tournament_id, draft_id, action, actor_player_id,
      actor_auth_user_id, operation_request_id, request_payload_hash, summary
    ) values (
      target, draft_id_value, 'REVISION_VALIDATED',
      actor_player, actor_auth, request_id, database_hash,
      pg_catalog.jsonb_build_object(
        'draftRevision', draft.draft_revision,
        'changedSettingCount',
          (validation->>'changedSettingCount')::integer
      )
    );
  end if;
  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PREDICTION_SETTINGS_REVISION_VALIDATED',
    'idempotent', draft.state = 'VALIDATED',
    'draftId', draft_id_value,
    'draftRevision', draft.draft_revision,
    'state', 'VALIDATED',
    'canonicalSettings', draft.canonical_settings,
    'effectiveSettings', validation->'effectiveSettings',
    'changedKeys', validation->'changedKeys',
    'changedSettingCount',
      (validation->>'changedSettingCount')::integer
  );
  insert into production_control.prediction_settings_operation_receipts_v1 (
    tournament_id, operation, operation_request_id,
    declared_request_payload_hash, request_payload_hash,
    actor_player_id, actor_auth_user_id, response
  ) values (
    target, 'VALIDATE', request_id, declared_hash, database_hash,
    actor_player, actor_auth, response_value
  );
  return response_value;
exception when no_data_found then
  return pg_catalog.jsonb_build_object(
    'ok', false, 'code', 'PREDICTION_SETTINGS_DRAFT_NOT_FOUND'
  );
end;

$canonical$;
revoke all on function production_control.canonical_validate_prediction_settings_revision_resource_v2(jsonb,jsonb) from public,anon,authenticated,service_role;

create or replace function public.validate_production_prediction_settings_revision_v1(input jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $wrapper$
begin
 perform production_control.assert_prediction_settings_authoring_v1(input);
 return production_control.canonical_validate_prediction_settings_revision_resource_v2(input,production_control.annual_resource_context_v2());
end;
$wrapper$;

create function production_control.canonical_commit_prediction_settings_revision_resource_v2(input jsonb, resource_context jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $canonical$

declare
  target text;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', ''
  )));
  actor_auth uuid;
  request_id uuid;
  draft_id_value uuid;
  declared_hash text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'request_payload_hash', ''
  )));
  expected_revision bigint;
  database_hash text;
  prior_receipt jsonb;
  draft production_control.prediction_settings_drafts_v1%rowtype;
  current_config scoring_authority.odds_input_configurations%rowtype;
  seed_config scoring_authority.odds_input_configurations%rowtype;
  pointer production_control.current_tournament_pointer_v1%rowtype;
  catalog production_control.future_tournament_catalog_v1%rowtype;
  promotion production_control.future_runtime_promotions_v2%rowtype;
  resource production_control.future_tournament_resources_v1%rowtype;
  binding production_control.future_annual_projection_bindings_v1%rowtype;
  validation jsonb;
  pairing_fingerprint_value text;
  next_revision bigint;
  next_binding_revision bigint;
  next_bundle text;
  source_fingerprint_value text;
  source_workbook_value text;
  projection_value jsonb;
  payload_fingerprint_value text;
  configuration_id_value uuid;
  effective_at_value timestamptz;
  response_value jsonb;
begin
  target := production_control.assert_prediction_settings_authoring_resource_v2(input, resource_context);
  if input->>'operation' is distinct from
       'COMMIT_PRODUCTION_PREDICTION_SETTINGS_REVISION_V1'
     or coalesce(input->>'operation_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'draft_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or declared_hash !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'expected_configuration_revision', '')
       !~ '^[0-9]+$'
     or input->>'confirmation' is distinct from
       'SAVE PREDICTION SETTINGS REVISION' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PREDICTION_SETTINGS_COMMIT_INPUT_INVALID'
    );
  end if;
  actor_auth := (input#>>'{authorization,auth_user_id}')::uuid;
  request_id := (input->>'operation_request_id')::uuid;
  draft_id_value := (input->>'draft_id')::uuid;
  expected_revision := (input->>'expected_configuration_revision')::bigint;
  database_hash := production_control.prediction_settings_hash_v1(
    pg_catalog.jsonb_build_object(
      'operation', 'COMMIT', 'tournamentId', target,
      'actorPlayerId', actor_player, 'actorAuthUserId', actor_auth,
      'draftId', draft_id_value,
      'expectedConfigurationRevision', expected_revision,
      'confirmation', input->>'confirmation'
    )
  );
  prior_receipt := production_control.prediction_settings_receipt_v1(
    target, 'COMMIT', request_id, declared_hash, database_hash
  );
  if prior_receipt is not null then return prior_receipt; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'production-prediction-settings:' || target, 0
  ));
  prior_receipt := production_control.prediction_settings_receipt_v1(
    target, 'COMMIT', request_id, declared_hash, database_hash
  );
  if prior_receipt is not null then return prior_receipt; end if;
  select value.* into strict draft
  from production_control.prediction_settings_drafts_v1 value
  where value.draft_id = draft_id_value
    and value.tournament_id = target for update;
  select value.* into current_config
  from scoring_authority.odds_input_configurations value
  where value.tournament_id = target and value.is_current for update;
  if coalesce(current_config.configuration_revision, 0) <> expected_revision
     or draft.expected_configuration_revision <> expected_revision then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PREDICTION_SETTINGS_PREDECESSOR_STALE'
    );
  end if;
  if draft.state <> 'VALIDATED' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PREDICTION_SETTINGS_DRAFT_NOT_VALIDATED'
    );
  end if;
  validation := production_control.validate_prediction_settings_v1(
    draft.canonical_settings, current_config.canonical_settings
  );
  if not coalesce((validation->>'pass')::boolean, false)
     or coalesce((validation->>'changedSettingCount')::integer, 0) = 0 then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PREDICTION_SETTINGS_VALIDATION_FAILED',
      'issues', validation->'issues'
    );
  end if;
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = (resource_context->>'resource_id');
  if current_config.id is not null then
    seed_config := current_config;
  else
    select value.* into strict seed_config
    from scoring_authority.odds_input_configurations value
    where value.tournament_id = pointer.tournament_id
      and value.is_current and value.validation_status = 'VALID';
  end if;
  if target = pointer.tournament_id then
    pairing_fingerprint_value := seed_config.pairing_fingerprint;
    source_workbook_value := seed_config.source_workbook_id;
  else
    select value.* into strict catalog
    from production_control.future_tournament_catalog_v1 value
    where value.tournament_id = target for update;
    select value.* into promotion
    from production_control.future_runtime_promotions_v2 value
    where value.tournament_id = target;
    select value.* into strict resource
    from production_control.future_tournament_resources_v1 value
    where value.tournament_id = target
      and value.source_workbook_id is not null
      and value.resource_status = 'CURRENT_RESOURCE_BOUND'
    for share;
    select value.* into binding
    from production_control.future_annual_projection_bindings_v1 value
    where value.tournament_id = target
      and value.domain = 'PREDICTION_SETTINGS'
    for update;

    -- Match the installed annual-projection invalidation semantics.  Before
    -- promotion, Prediction Settings are part of the setup manifest and
    -- advance setup revision.  After promotion, the promoted structure stays
    -- immutable, but readiness is cleared and a Ready candidate is returned
    -- to Configuring for explicit review.
    update production_control.future_tournament_catalog_v1 value set
      lifecycle = case when value.lifecycle = 'READY_FOR_ACTIVATION'
        then 'CONFIGURING' else value.lifecycle end,
      lifecycle_revision = case
        when value.lifecycle = 'READY_FOR_ACTIVATION'
          then value.lifecycle_revision + 1
        else value.lifecycle_revision end,
      setup_revision = case when promotion.tournament_id is null
        then value.setup_revision + 1 else value.setup_revision end,
      readiness_fingerprint = null,
      readiness_setup_revision = null,
      updated_by_player_id = actor_player,
      updated_at = pg_catalog.clock_timestamp()
    where value.tournament_id = target;
    select value.* into strict catalog
    from production_control.future_tournament_catalog_v1 value
    where value.tournament_id = target;

    source_workbook_value := resource.source_workbook_id;
    pairing_fingerprint_value := production_control
      .annual_odds_pairing_fingerprint_v1(target);
  end if;
  select coalesce(pg_catalog.max(value.configuration_revision), 0) + 1
    into next_revision
  from scoring_authority.odds_input_configurations value
  where value.tournament_id = target;
  source_fingerprint_value := production_control.prediction_settings_hash_v1(
    pg_catalog.jsonb_build_object(
      'contractVersion', 'production-prediction-settings-authoring-v1',
      'authoringAuthority', 'SUPABASE_DIRECTOR',
      'tournamentId', target,
      'configurationRevision', next_revision,
      'canonicalSettings', validation->'canonicalSettings'
    )
  );
  next_bundle := production_control.prediction_settings_hash_v1(
    pg_catalog.jsonb_build_object(
      'contractVersion', 'production-odds-input-bundle-v1',
      'tournamentId', target,
      'configurationRevision', next_revision,
      'settingsFingerprint', validation->>'settingsFingerprint',
      'effectiveSettingsFingerprint',
        validation->>'effectiveSettingsFingerprint',
      'ratingsFingerprint', seed_config.ratings_fingerprint,
      'pairingFingerprint', pairing_fingerprint_value,
      'previousConfigurationId', current_config.id
    )
  );
  effective_at_value := pg_catalog.clock_timestamp();
  update scoring_authority.odds_input_configurations set
    is_current = false,
    superseded_at = effective_at_value
  where tournament_id = target and is_current;
  insert into scoring_authority.odds_input_configurations (
    tournament_id, configuration_revision, source_workbook_id,
    settings, historical_ratings, settings_fingerprint,
    ratings_fingerprint, pairing_fingerprint, bundle_fingerprint,
    is_current, imported_by, source_tab, source_fingerprint,
    canonical_settings, effective_settings,
    effective_settings_fingerprint, settings_contract_version,
    validation_status, validation_diagnostics, synchronized_at,
    previous_configuration_id
  ) values (
    target, next_revision, source_workbook_value,
    validation->'settingsRows', seed_config.historical_ratings,
    validation->>'settingsFingerprint', seed_config.ratings_fingerprint,
    pairing_fingerprint_value, next_bundle, true,
    'Production Director ' || actor_player, 'Prediction Settings',
    source_fingerprint_value, validation->'canonicalSettings',
    validation->'effectiveSettings',
    validation->>'effectiveSettingsFingerprint',
    'prediction-settings-v1', 'VALID',
    pg_catalog.jsonb_build_object(
      'authoringAuthority', 'SUPABASE_DIRECTOR',
      'authoringContract', 'production-prediction-settings-authoring-v1',
      'completeSchema', true,
      'legacyRecalibrationProfile',
        (validation->>'legacyRecalibrationProfile')::boolean,
      'changedSettingCount',
        (validation->>'changedSettingCount')::integer,
      'annualSetupRevision', case when target = pointer.tournament_id
        then null else catalog.setup_revision end,
      'annualProjectionBindingRevision', case
        when target = pointer.tournament_id then null
        else coalesce(binding.binding_revision, 0) + 1 end,
      'automaticCalculationRequested', false,
      'automaticPublicationRequested', false
    ),
    effective_at_value, current_config.id
  ) returning id into configuration_id_value;

  if target <> pointer.tournament_id then
    next_binding_revision := coalesce(binding.binding_revision, 0) + 1;
    projection_value := pg_catalog.jsonb_build_object(
      'environment', 'PRODUCTION',
      'tournament_id', target,
      'tournament_year', catalog.tournament_year,
      'source_workbook_id', source_workbook_value,
      'source_tab', 'Prediction Settings',
      'source_revision', next_revision,
      'settings', validation->'settingsRows',
      'source_fingerprint', source_fingerprint_value,
      'settings_fingerprint', validation->>'settingsFingerprint',
      'canonical_settings', validation->'canonicalSettings',
      'effective_settings', validation->'effectiveSettings',
      'effective_settings_fingerprint',
        validation->>'effectiveSettingsFingerprint',
      'settings_contract_version', 'prediction-settings-v1',
      'validation_status', 'VALID',
      'validation_diagnostics', pg_catalog.jsonb_build_object(
        'authoringAuthority', 'SUPABASE_DIRECTOR',
        'authoringContract',
          'production-prediction-settings-authoring-v1',
        'annualSetupRevision', catalog.setup_revision,
        'annualProjectionBindingRevision', next_binding_revision,
        'completeSchema', true
      ),
      'authoring_authority', 'SUPABASE_DIRECTOR'
    );
    payload_fingerprint_value := production_control
      .prediction_settings_hash_v1(projection_value);
    insert into production_control.future_annual_projection_bindings_v1 (
      tournament_id, domain, source_workbook_id, source_revision,
      binding_revision, source_fingerprint, payload_fingerprint,
      projection, certification_status, certified_by_player_id,
      certified_at, authoring_authority
    ) values (
      target, 'PREDICTION_SETTINGS', source_workbook_value, next_revision,
      next_binding_revision, source_fingerprint_value,
      payload_fingerprint_value, projection_value, 'CERTIFIED',
      actor_player, effective_at_value, 'SUPABASE_DIRECTOR'
    ) on conflict (tournament_id, domain) do update set
      source_workbook_id = excluded.source_workbook_id,
      source_revision = excluded.source_revision,
      binding_revision = excluded.binding_revision,
      source_fingerprint = excluded.source_fingerprint,
      payload_fingerprint = excluded.payload_fingerprint,
      projection = excluded.projection,
      certification_status = excluded.certification_status,
      certified_by_player_id = excluded.certified_by_player_id,
      certified_at = excluded.certified_at,
      authoring_authority = excluded.authoring_authority,
      updated_at = effective_at_value;
  end if;
  insert into production_control.prediction_settings_revision_provenance_v1 (
    configuration_id, tournament_id, authoring_authority,
    authoring_contract, draft_id, actor_player_id, actor_auth_user_id,
    changed_setting_count, created_at
  ) values (
    configuration_id_value, target, 'SUPABASE_DIRECTOR',
    'production-prediction-settings-authoring-v1', draft_id_value,
    actor_player, actor_auth,
    (validation->>'changedSettingCount')::integer, effective_at_value
  );
  update production_control.prediction_settings_drafts_v1 set
    state = 'COMMITTED',
    committed_configuration_id = configuration_id_value,
    committed_at = effective_at_value
  where draft_id = draft_id_value;
  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PREDICTION_SETTINGS_REVISION_COMMITTED',
    'idempotent', false,
    'tournamentId', target,
    'configurationId', configuration_id_value,
    'configurationRevision', next_revision,
    'effectiveAt', effective_at_value,
    'directorPlayerId', actor_player,
    'changedKeys', validation->'changedKeys',
    'changedSettingCount',
      (validation->>'changedSettingCount')::integer,
    'recalculationRequired', true,
    'automaticCalculationRequested', false,
    'automaticPublicationRequested', false,
    'publishedSnapshotUnchanged', true,
    'authoringAuthority', 'SUPABASE_DIRECTOR'
  );
  insert into production_control.prediction_settings_audit_events_v1 (
    tournament_id, draft_id, configuration_id, action,
    actor_player_id, actor_auth_user_id, operation_request_id,
    request_payload_hash, summary
  ) values (
    target, draft_id_value, configuration_id_value,
    'REVISION_COMMITTED', actor_player, actor_auth, request_id,
    database_hash, pg_catalog.jsonb_build_object(
      'configurationRevision', next_revision,
      'predecessorConfigurationRevision', expected_revision,
      'changedSettingCount',
        (validation->>'changedSettingCount')::integer,
      'recalculationRequired', true,
      'automaticCalculationRequested', false,
      'automaticPublicationRequested', false
    )
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_PREDICTION_SETTINGS_REVISION_COMMITTED',
    'PREDICTION_SETTINGS', target, actor_player, database_hash,
    'SUCCEEDED', pg_catalog.jsonb_build_object(
      'configuration_revision', next_revision,
      'changed_setting_count',
        (validation->>'changedSettingCount')::integer,
      'authoring_authority', 'SUPABASE_DIRECTOR',
      'recalculation_required', true,
      'automatic_calculation_requested', false,
      'automatic_publication_requested', false
    )
  );
  insert into production_control.prediction_settings_operation_receipts_v1 (
    tournament_id, operation, operation_request_id,
    declared_request_payload_hash, request_payload_hash,
    actor_player_id, actor_auth_user_id, response
  ) values (
    target, 'COMMIT', request_id, declared_hash, database_hash,
    actor_player, actor_auth, response_value
  );
  return response_value;
exception when no_data_found then
  return pg_catalog.jsonb_build_object(
    'ok', false, 'code', 'PREDICTION_SETTINGS_ODDS_CONTEXT_REQUIRED'
  );
when unique_violation then
  return pg_catalog.jsonb_build_object(
    'ok', false, 'code', 'PREDICTION_SETTINGS_OPERATION_CONFLICT'
  );
end;

$canonical$;
revoke all on function production_control.canonical_commit_prediction_settings_revision_resource_v2(jsonb,jsonb) from public,anon,authenticated,service_role;

create or replace function public.commit_production_prediction_settings_revision_v1(input jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $wrapper$
begin
 perform production_control.assert_prediction_settings_authoring_v1(input);
 return production_control.canonical_commit_prediction_settings_revision_resource_v2(input,production_control.annual_resource_context_v2());
end;
$wrapper$;

create function public.mutate_certification_future_authoring_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $gateway$
declare context jsonb; resource production_control.canonical_resource_v1%rowtype;
 payload jsonb:=input->'payload'; command jsonb; result jsonb; op text:=input->>'operation_id';
 contract_value text; legacy_operation text; target_id text;
begin
 if jsonb_typeof(payload) is distinct from 'object' or payload ?| array[
  'authorization','environment','contract_version','resource','deployment','actor_player_id','actor_auth_user_id',
  'project_ref','project_url','source_workbook_id','tournament_id','tournament_year','operation_request_id',
  'resource_id','resource_class','installation_id','governance_tournament_id','expected_context_token','operation',
  'ingress','lease_id','admission_generation_id','request_hash'] then
  raise exception using errcode='42501',message='CERTIFICATION_OPERATION_AUTHORITY_FIELD_REJECTED'; end if;
 if op='ANNUAL.RUNTIME' then
  if upper(btrim(coalesce(payload->>'action',''))) not in (
    'ASSIGN_FUTURE_COURSE','PROMOTE_RUNTIME_STRUCTURE','STAGE_HANDICAPS','APPROVE_HANDICAPS',
    'CONFIGURE_MATCH','REPLACE_PAIRINGS','PREPARE_SCORING_CONTEXT','GRANT_FUTURE_DIRECTOR','MARK_READY_FOR_ACTIVATION') then
   raise exception using errcode='42501',message='CERTIFICATION_ANNUAL_ACTION_DENIED'; end if;
  contract_value:='production-future-runtime-activation-v2';
 else
  case op

  when 'ANNUAL.GUIDE_CREATE' then contract_value:='production-guide-authoring-v1';legacy_operation:='CREATE_PRODUCTION_GUIDE_DRAFT_V1';

  when 'ANNUAL.GUIDE_VALIDATE' then contract_value:='production-guide-authoring-v1';legacy_operation:='VALIDATE_PRODUCTION_GUIDE_DRAFT_V1';

  when 'ANNUAL.GUIDE_PUBLISH' then contract_value:='production-guide-authoring-v1';legacy_operation:='PUBLISH_PRODUCTION_GUIDE_DRAFT_V1';

  when 'ANNUAL.DRAFT_STAGE' then contract_value:='production-draft-authoring-v1';legacy_operation:='STAGE_PRODUCTION_DRAFT_REVISION_V1';

  when 'ANNUAL.DRAFT_VALIDATE' then contract_value:='production-draft-authoring-v1';legacy_operation:='VALIDATE_PRODUCTION_DRAFT_REVISION_V1';

  when 'ANNUAL.DRAFT_COMMIT' then contract_value:='production-draft-authoring-v1';legacy_operation:='COMMIT_PRODUCTION_DRAFT_REVISION_V1';

  when 'ANNUAL.PREDICTION_STAGE' then contract_value:='production-prediction-settings-authoring-v1';legacy_operation:='STAGE_PRODUCTION_PREDICTION_SETTINGS_REVISION_V1';

  when 'ANNUAL.PREDICTION_VALIDATE' then contract_value:='production-prediction-settings-authoring-v1';legacy_operation:='VALIDATE_PRODUCTION_PREDICTION_SETTINGS_REVISION_V1';

  when 'ANNUAL.PREDICTION_COMMIT' then contract_value:='production-prediction-settings-authoring-v1';legacy_operation:='COMMIT_PRODUCTION_PREDICTION_SETTINGS_REVISION_V1';

  else raise exception using errcode='42501',message='CERTIFICATION_ANNUAL_ACTION_DENIED';end case;
 end if;
 -- The fence is acquired first; nested readiness/certificate work must not upgrade shared locks.
 perform pg_advisory_xact_lock(production_control.scoring_admission_lock_key());
 context:=production_control.push_certification_context_v1(input,'ANNUAL',true);
 select * into strict resource from production_control.canonical_resource_v1 where singleton;
 target_id:=btrim(coalesce(payload->>'target_tournament_id',''));
 if payload ? 'target_tournament_year' and payload->>'target_tournament_year' is distinct from target_id then
  raise exception using errcode='22023',message='CERTIFICATION_FUTURE_TARGET_YEAR_INVALID';end if;
 if target_id !~ '^20[0-9]{2}$' or target_id::integer <= (context->>'current_tournament_year')::integer
   or not exists(select 1 from production_control.future_tournament_catalog_v1 c
     join production_control.future_tournament_resources_v1 r using(tournament_id)
     where c.tournament_id=target_id and c.tournament_year=target_id::integer
       and c.lifecycle in('DRAFT','CONFIGURING','READY_FOR_ACTIVATION')
       and r.project_ref=resource.project_ref and r.project_url=resource.project_url
       and r.source_workbook_id=resource.provenance_id) then
  raise exception using errcode='42501',message='CERTIFICATION_FUTURE_TARGET_REQUIRED';end if;
 command:=payload||jsonb_build_object('contract_version',contract_value,'environment','CERTIFICATION',
  'project_ref',resource.project_ref,'project_url',resource.project_url,'source_workbook_id',resource.provenance_id,
  'tournament_id',context->>'current_tournament_id','tournament_year',(context->>'current_tournament_year')::integer,
  'authorization',context->'authorization','operation_request_id',input->>'operation_request_id');
 if legacy_operation is not null then command:=command||jsonb_build_object('operation',legacy_operation);end if;
 -- Domain-authoring hashes stay unchanged. Runtime hashes cover the canonical server-bound command.
 if op='ANNUAL.RUNTIME' then
  command:=(command-'request_payload_hash')||jsonb_build_object('request_payload_hash',
    production_control.future_runtime_hash_v2(command-'request_payload_hash'));
 end if;
 case op

 when 'ANNUAL.RUNTIME' then result:=production_control.canonical_mutate_future_runtime_resource_v2(command,context);

 when 'ANNUAL.GUIDE_CREATE' then result:=production_control.canonical_create_guide_draft_resource_v2(command,context);

 when 'ANNUAL.GUIDE_VALIDATE' then result:=production_control.canonical_validate_guide_draft_resource_v2(command,context);

 when 'ANNUAL.GUIDE_PUBLISH' then result:=production_control.canonical_publish_guide_draft_resource_v2(command,context);

 when 'ANNUAL.DRAFT_STAGE' then result:=production_control.canonical_stage_draft_revision_resource_v2(command,context);

 when 'ANNUAL.DRAFT_VALIDATE' then result:=production_control.canonical_validate_draft_revision_resource_v2(command,context);

 when 'ANNUAL.DRAFT_COMMIT' then result:=production_control.canonical_commit_draft_revision_resource_v2(command,context);

 when 'ANNUAL.PREDICTION_STAGE' then result:=production_control.canonical_stage_prediction_settings_revision_resource_v2(command,context);

 when 'ANNUAL.PREDICTION_VALIDATE' then result:=production_control.canonical_validate_prediction_settings_revision_resource_v2(command,context);

 when 'ANNUAL.PREDICTION_COMMIT' then result:=production_control.canonical_commit_prediction_settings_revision_resource_v2(command,context);

 else raise exception using errcode='42501',message='CERTIFICATION_ANNUAL_ACTION_DENIED';end case;
 if coalesce((result->>'ok')::boolean,false) and not coalesce((result->>'idempotent')::boolean,false) then
  insert into production_control.operation_audit_events(event_type,domain,tournament_id,actor,request_fingerprint,result,details)
  values('CERTIFICATION_ANNUAL_AUTHORING','ANNUAL',target_id,context#>>'{authorization,player_id}',
   production_control.future_year_hash_v1(payload),'SUCCEEDED',jsonb_build_object('resource_class','CERTIFICATION',
    'resource_id',context->>'resource_id','installation_id',context->>'installation_id','binding_id',context->>'binding_id',
    'context_token',context->>'context_token','operation_request_id',input->>'operation_request_id','operation_id',op,
    'release_commit',context->>'release_commit','admission_revision',context->'admission_revision',
    'actor_auth_user_id',context#>>'{authorization,auth_user_id}','receipt',result));
 end if;
 perform production_control.pop_certification_context_v1();return result;
end;
$gateway$;
revoke all on function public.mutate_certification_future_authoring_v1(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.mutate_certification_future_authoring_v1(jsonb) to service_role;
do $check$
begin
 if exists(select 1 from canonical_authoring_original_attributes b left join pg_proc a on a.oid=b.oid
   where a.oid is null or row(a.pronamespace,a.proname,a.proargtypes,a.proowner,a.proacl,a.prosecdef,a.proconfig,a.provolatile)
    is distinct from row(b.pronamespace,b.proname,b.proargtypes,b.proowner,b.proacl,b.prosecdef,b.proconfig,b.provolatile)) then
  raise exception 'CANONICAL_AUTHORING_PRODUCTION_FUNCTION_ATTRIBUTES_CHANGED';end if;
end;$check$;

do $acl$ declare original_owner oid; candidate pg_proc%rowtype;
 begin
  select proowner into strict original_owner from pg_proc where oid='public.mutate_production_future_runtime_v2(jsonb)'::regprocedure;
  select * into strict candidate from pg_proc where oid='production_control.canonical_mutate_future_runtime_resource_v2(jsonb,jsonb)'::regprocedure;
  if candidate.proowner<>original_owner or not candidate.prosecdef or candidate.proconfig<>array['search_path=pg_catalog']
    or has_function_privilege('anon',candidate.oid,'EXECUTE') or has_function_privilege('authenticated',candidate.oid,'EXECUTE')
    or has_function_privilege('service_role',candidate.oid,'EXECUTE') then
   raise exception 'CANONICAL_AUTHORING_PRIVATE_CORE_PRIVILEGE_INVALID: canonical_mutate_future_runtime_resource_v2';end if;
 end;$acl$;

do $acl$ declare original_owner oid; candidate pg_proc%rowtype;
 begin
  select proowner into strict original_owner from pg_proc where oid='public.create_production_guide_draft_v1(jsonb)'::regprocedure;
  select * into strict candidate from pg_proc where oid='production_control.canonical_create_guide_draft_resource_v2(jsonb,jsonb)'::regprocedure;
  if candidate.proowner<>original_owner or not candidate.prosecdef or candidate.proconfig<>array['search_path=pg_catalog']
    or has_function_privilege('anon',candidate.oid,'EXECUTE') or has_function_privilege('authenticated',candidate.oid,'EXECUTE')
    or has_function_privilege('service_role',candidate.oid,'EXECUTE') then
   raise exception 'CANONICAL_AUTHORING_PRIVATE_CORE_PRIVILEGE_INVALID: canonical_create_guide_draft_resource_v2';end if;
 end;$acl$;

do $acl$ declare original_owner oid; candidate pg_proc%rowtype;
 begin
  select proowner into strict original_owner from pg_proc where oid='public.validate_production_guide_draft_v1(jsonb)'::regprocedure;
  select * into strict candidate from pg_proc where oid='production_control.canonical_validate_guide_draft_resource_v2(jsonb,jsonb)'::regprocedure;
  if candidate.proowner<>original_owner or not candidate.prosecdef or candidate.proconfig<>array['search_path=pg_catalog']
    or has_function_privilege('anon',candidate.oid,'EXECUTE') or has_function_privilege('authenticated',candidate.oid,'EXECUTE')
    or has_function_privilege('service_role',candidate.oid,'EXECUTE') then
   raise exception 'CANONICAL_AUTHORING_PRIVATE_CORE_PRIVILEGE_INVALID: canonical_validate_guide_draft_resource_v2';end if;
 end;$acl$;

do $acl$ declare original_owner oid; candidate pg_proc%rowtype;
 begin
  select proowner into strict original_owner from pg_proc where oid='public.publish_production_guide_draft_v1(jsonb)'::regprocedure;
  select * into strict candidate from pg_proc where oid='production_control.canonical_publish_guide_draft_resource_v2(jsonb,jsonb)'::regprocedure;
  if candidate.proowner<>original_owner or not candidate.prosecdef or candidate.proconfig<>array['search_path=pg_catalog']
    or has_function_privilege('anon',candidate.oid,'EXECUTE') or has_function_privilege('authenticated',candidate.oid,'EXECUTE')
    or has_function_privilege('service_role',candidate.oid,'EXECUTE') then
   raise exception 'CANONICAL_AUTHORING_PRIVATE_CORE_PRIVILEGE_INVALID: canonical_publish_guide_draft_resource_v2';end if;
 end;$acl$;

do $acl$ declare original_owner oid; candidate pg_proc%rowtype;
 begin
  select proowner into strict original_owner from pg_proc where oid='public.stage_production_draft_revision_v1(jsonb)'::regprocedure;
  select * into strict candidate from pg_proc where oid='production_control.canonical_stage_draft_revision_resource_v2(jsonb,jsonb)'::regprocedure;
  if candidate.proowner<>original_owner or not candidate.prosecdef or candidate.proconfig<>array['search_path=pg_catalog']
    or has_function_privilege('anon',candidate.oid,'EXECUTE') or has_function_privilege('authenticated',candidate.oid,'EXECUTE')
    or has_function_privilege('service_role',candidate.oid,'EXECUTE') then
   raise exception 'CANONICAL_AUTHORING_PRIVATE_CORE_PRIVILEGE_INVALID: canonical_stage_draft_revision_resource_v2';end if;
 end;$acl$;

do $acl$ declare original_owner oid; candidate pg_proc%rowtype;
 begin
  select proowner into strict original_owner from pg_proc where oid='public.validate_production_draft_revision_v1(jsonb)'::regprocedure;
  select * into strict candidate from pg_proc where oid='production_control.canonical_validate_draft_revision_resource_v2(jsonb,jsonb)'::regprocedure;
  if candidate.proowner<>original_owner or not candidate.prosecdef or candidate.proconfig<>array['search_path=pg_catalog']
    or has_function_privilege('anon',candidate.oid,'EXECUTE') or has_function_privilege('authenticated',candidate.oid,'EXECUTE')
    or has_function_privilege('service_role',candidate.oid,'EXECUTE') then
   raise exception 'CANONICAL_AUTHORING_PRIVATE_CORE_PRIVILEGE_INVALID: canonical_validate_draft_revision_resource_v2';end if;
 end;$acl$;

do $acl$ declare original_owner oid; candidate pg_proc%rowtype;
 begin
  select proowner into strict original_owner from pg_proc where oid='public.commit_production_draft_revision_v1(jsonb)'::regprocedure;
  select * into strict candidate from pg_proc where oid='production_control.canonical_commit_draft_revision_resource_v2(jsonb,jsonb)'::regprocedure;
  if candidate.proowner<>original_owner or not candidate.prosecdef or candidate.proconfig<>array['search_path=pg_catalog']
    or has_function_privilege('anon',candidate.oid,'EXECUTE') or has_function_privilege('authenticated',candidate.oid,'EXECUTE')
    or has_function_privilege('service_role',candidate.oid,'EXECUTE') then
   raise exception 'CANONICAL_AUTHORING_PRIVATE_CORE_PRIVILEGE_INVALID: canonical_commit_draft_revision_resource_v2';end if;
 end;$acl$;

do $acl$ declare original_owner oid; candidate pg_proc%rowtype;
 begin
  select proowner into strict original_owner from pg_proc where oid='public.stage_production_prediction_settings_revision_v1(jsonb)'::regprocedure;
  select * into strict candidate from pg_proc where oid='production_control.canonical_stage_prediction_settings_revision_resource_v2(jsonb,jsonb)'::regprocedure;
  if candidate.proowner<>original_owner or not candidate.prosecdef or candidate.proconfig<>array['search_path=pg_catalog']
    or has_function_privilege('anon',candidate.oid,'EXECUTE') or has_function_privilege('authenticated',candidate.oid,'EXECUTE')
    or has_function_privilege('service_role',candidate.oid,'EXECUTE') then
   raise exception 'CANONICAL_AUTHORING_PRIVATE_CORE_PRIVILEGE_INVALID: canonical_stage_prediction_settings_revision_resource_v2';end if;
 end;$acl$;

do $acl$ declare original_owner oid; candidate pg_proc%rowtype;
 begin
  select proowner into strict original_owner from pg_proc where oid='public.validate_production_prediction_settings_revision_v1(jsonb)'::regprocedure;
  select * into strict candidate from pg_proc where oid='production_control.canonical_validate_prediction_settings_revision_resource_v2(jsonb,jsonb)'::regprocedure;
  if candidate.proowner<>original_owner or not candidate.prosecdef or candidate.proconfig<>array['search_path=pg_catalog']
    or has_function_privilege('anon',candidate.oid,'EXECUTE') or has_function_privilege('authenticated',candidate.oid,'EXECUTE')
    or has_function_privilege('service_role',candidate.oid,'EXECUTE') then
   raise exception 'CANONICAL_AUTHORING_PRIVATE_CORE_PRIVILEGE_INVALID: canonical_validate_prediction_settings_revision_resource_v2';end if;
 end;$acl$;

do $acl$ declare original_owner oid; candidate pg_proc%rowtype;
 begin
  select proowner into strict original_owner from pg_proc where oid='public.commit_production_prediction_settings_revision_v1(jsonb)'::regprocedure;
  select * into strict candidate from pg_proc where oid='production_control.canonical_commit_prediction_settings_revision_resource_v2(jsonb,jsonb)'::regprocedure;
  if candidate.proowner<>original_owner or not candidate.prosecdef or candidate.proconfig<>array['search_path=pg_catalog']
    or has_function_privilege('anon',candidate.oid,'EXECUTE') or has_function_privilege('authenticated',candidate.oid,'EXECUTE')
    or has_function_privilege('service_role',candidate.oid,'EXECUTE') then
   raise exception 'CANONICAL_AUTHORING_PRIVATE_CORE_PRIVILEGE_INVALID: canonical_commit_prediction_settings_revision_resource_v2';end if;
 end;$acl$;

notify pgrst,'reload schema';
commit;
