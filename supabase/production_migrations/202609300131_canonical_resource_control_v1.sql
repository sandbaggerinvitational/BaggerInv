-- Phase2D-R2: one immutable canonical resource per physical database.
-- CLI scaffold: canonical_resource_control_v1; repository ordinal131.
-- No resource activation, hosted registration or competitive-row rewrite.
begin;

-- Owner-approved069 forward compatibility for an existing130 installation.
-- Delivers the approved069 provider-compatibility definitions to an already
-- installed130 database. It never replays069 installation, creates a platform
-- certificate, rebinds authority, edits facts, or grants a runtime role.
-- Source baseline: 7cec5128409286f5b4a5f3524d4c5488124a7be7 (original069).
-- Approved correction source: worktree069 at draft generation.
-- The original annual_scoring_platform_certification_v1 getter is deliberately
-- NOT replaced. This preserves its076 implementation-manifest evidence.
-- Exactly three old definitions + absent helper may advance. Exactly three
-- new definitions + exact helper are a verified no-op. Mixed/unknown states
-- fail closed. Existing function identities and catalog privileges must remain.
-- Owner equality follows130's existing migration-owner convention.
-- No private schema name is treated as an authorization boundary by itself.
DO $annual_069_forward_bridge$
DECLARE
  expected record;
  actual record;
  owner_oid oid := (select oid from pg_catalog.pg_roles where rolname=current_user);
  helper_oid oid;
  affected_oids oid[] := array[]::oid[];
  original_count integer := 0;
  corrected_count integer := 0;
  actual_hash text;
  before_catalog jsonb;
  after_catalog jsonb;
  before_dependencies jsonb;
  after_dependencies jsonb;
BEGIN
  -- This function is embedded in076's immutable side-game implementation
  -- manifest. It must retain its original069 body, including its STRICT
  -- missing-row denial; this compatibility bridge never replaces it.
  if (
    select pg_catalog.encode(extensions.digest(p.prosrc,'sha256'),'hex')
    from pg_catalog.pg_proc p
    where p.oid=pg_catalog.to_regprocedure(
      'production_control.annual_scoring_platform_certification_v1(jsonb)')
      and p.pronargdefaults=0 and p.proargdefaults is null
  ) is distinct from 'b5901e457769b9ba801408c42a24f06faff378bfc8a39933165606acac0db335' then
    raise exception using errcode='55000',
      message='ANNUAL_069_BRIDGE_ORIGINAL_CERTIFICATE_GETTER_REQUIRED';
  end if;
  for expected in select * from (values
    ('production_control.assert_production_scoring_runtime(jsonb,text)','v','1acd6bff4a975cf2815a8bad51a9412ddaecf7d4bde7b009fc7b1bdcc4c054d7','dc4b594779bb82f6d37508a76508a2c2294727123ccda7341157437dfb95ddcb'),
    ('production_control.assert_annual_transition_platform_owner_v1(jsonb)','v','4040e229622fd9f35f67eccd1c414d52a1a7d139353c17fc6a1a978dfce30216','491379f8a8b1640c3addefcaf9d19ae70171ddb41608a46e5cd484c9c2777d86'),
    ('production_control.annual_scoring_transition_readiness_v1(text)','s','e0c9d2446f0784c3d5efe10f588d629685e7a828393ace14f3f17734dca1d73f','5da45e8358a2b11a34e254141aaa93e3cac757d9c880c04a59ad438d1086c09c')
  ) contract(signature,volatility,original_hash,corrected_hash) loop
    select p.*, l.lanname into actual
    from pg_catalog.pg_proc p
    join pg_catalog.pg_language l on l.oid=p.prolang
    where p.oid=pg_catalog.to_regprocedure(expected.signature);
    if not found then
      raise exception using errcode='55000',message='ANNUAL_069_BRIDGE_FUNCTION_MISSING';
    end if;
    if actual.proowner<>owner_oid or not actual.prosecdef
       or actual.lanname<>'plpgsql'
       or actual.provolatile::text<>expected.volatility
       or actual.proconfig is distinct from array['search_path=pg_catalog']::text[]
       or actual.prokind<>'f' or actual.proisstrict or actual.proleakproof
       or actual.proparallel<>'u' or actual.proretset or actual.prosupport<>0
       or exists (
         select 1 from pg_catalog.aclexplode(coalesce(actual.proacl,
           pg_catalog.acldefault('f',actual.proowner))) a
         where a.grantee<>actual.proowner
       )
       or pg_catalog.has_function_privilege('anon',actual.oid,'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated',actual.oid,'EXECUTE')
       or pg_catalog.has_function_privilege('service_role',actual.oid,'EXECUTE') then
      raise exception using errcode='55000',message='ANNUAL_069_BRIDGE_PRIVILEGE_BASELINE_MISMATCH';
    end if;
    -- Body hashes do not cover argument defaults. In particular, a worker
    -- default must never turn a one-argument canonical call into worker drain.
    if (expected.signature='production_control.assert_production_scoring_runtime(jsonb,text)'
        and (actual.pronargdefaults<>1
          or pg_catalog.pg_get_expr(actual.proargdefaults,0) is distinct from 'NULL::text'))
       or (expected.signature<>'production_control.assert_production_scoring_runtime(jsonb,text)'
        and (actual.pronargdefaults<>0 or actual.proargdefaults is not null)) then
      raise exception using errcode='55000',message='ANNUAL_069_BRIDGE_ARGUMENT_DEFAULT_MISMATCH';
    end if;
    actual_hash:=pg_catalog.encode(extensions.digest(actual.prosrc,'sha256'),'hex');
    if actual_hash=expected.original_hash then original_count:=original_count+1;
    elsif actual_hash=expected.corrected_hash then corrected_count:=corrected_count+1;
    else
      raise exception using errcode='55000',message='ANNUAL_069_BRIDGE_SOURCE_BASELINE_MISMATCH';
    end if;
    affected_oids:=pg_catalog.array_append(affected_oids,actual.oid);
  end loop;
  helper_oid:=pg_catalog.to_regprocedure('production_control.assert_legacy_provider_origin_v1()');
  if corrected_count=3 and original_count=0 and helper_oid is not null then
    -- The helper must be exactly the approved private owner-only definition.
    select p.*, l.lanname into actual
    from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid=p.prolang
    where p.oid=pg_catalog.to_regprocedure('production_control.assert_legacy_provider_origin_v1()');
    if not found then
      raise exception using errcode='55000',message='ANNUAL_069_BRIDGE_HELPER_MISSING';
    end if;
    if pg_catalog.encode(extensions.digest(actual.prosrc,'sha256'),'hex')<>'e58d460016a5cb5ee5c9cef976672defdaa90fb15ec75d39d9f6e354be330a5a'
       or actual.proowner<>owner_oid or not actual.prosecdef
       or actual.lanname<>'plpgsql' or actual.provolatile<>'s'
       or actual.proconfig is distinct from array['search_path=pg_catalog']::text[]
       or actual.prokind<>'f' or actual.proisstrict or actual.proleakproof
       or actual.proparallel<>'u' or actual.proretset or actual.prosupport<>0
       or actual.pronargs<>0 or actual.pronargdefaults<>0 or actual.proargdefaults is not null
       or actual.prorettype<>'pg_catalog.void'::pg_catalog.regtype
       or exists (
         select 1 from pg_catalog.aclexplode(coalesce(actual.proacl,
           pg_catalog.acldefault('f',actual.proowner))) a
         where a.grantee<>actual.proowner
       )
       or pg_catalog.has_function_privilege('anon',actual.oid,'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated',actual.oid,'EXECUTE')
       or pg_catalog.has_function_privilege('service_role',actual.oid,'EXECUTE') then
      raise exception using errcode='55000',message='ANNUAL_069_BRIDGE_HELPER_CONTRACT_MISMATCH';
    end if;
    -- Do not CREATE OR REPLACE, revoke, re-own or rewrite even catalog rows.
    return;
  end if;
  if original_count<>3 or corrected_count<>0 or helper_oid is not null then
    raise exception using errcode='55000',message='ANNUAL_069_BRIDGE_MIXED_INSTALLATION';
  end if;

  select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p)-'prosrc' order by p.oid)
  into before_catalog from pg_catalog.pg_proc p where p.oid=any(affected_oids);
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(d)
    order by d.classid,d.objid,d.objsubid,d.refclassid,d.refobjid,d.refobjsubid,d.deptype),'[]'::jsonb)
  into before_dependencies from pg_catalog.pg_depend d
  where (d.classid='pg_catalog.pg_proc'::pg_catalog.regclass and d.objid=any(affected_oids))
     or (d.refclassid='pg_catalog.pg_proc'::pg_catalog.regclass and d.refobjid=any(affected_oids));

  execute $approved_069_helper$
create function production_control.assert_legacy_provider_origin_v1()
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if not exists (
    select 1
    from production_control.resource_scope resource
    join production_control.cutover_activation_state activation using (scope_key)
    join production_control.current_tournament_pointer_v1 pointer using (scope_key)
    join scoring_authority.ingress_gates gate
      on gate.tournament_id = '2026'
    join scoring_authority.authority_epochs epoch
      on epoch.epoch_id = activation.authority_generation_id
    join production_control.scoring_admission_closures closure
      on closure.closure_id = epoch.admission_closure_id
    join production_control.scoring_external_fence_evidence evidence
      on evidence.evidence_id = epoch.external_fence_evidence_id
    where resource.scope_key = 'BAGGER_INV_PRODUCTION'
      and resource.project_ref = 'ymqhhtxaywtqllynrmxe'
      and resource.project_url = 'https://ymqhhtxaywtqllynrmxe.supabase.co'
      and resource.google_workbook_id = '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
      and resource.vercel_project = 'bagger-inv'
      and resource.canonical_domain = 'https://baggerinv.com'
      and resource.current_tournament_id = '2026'
      and resource.current_tournament_year = 2026
      and resource.scoring_authority = 'SUPABASE'
      and resource.scoring_ingress_enabled
      and pointer.tournament_id = '2026'
      and activation.boundary_mode = 'PROVIDER_FENCE_V2'
      and activation.state = 'SCORING_COMMITTED'
      and activation.current_authority = 'SUPABASE'
      and activation.scoring_ingress_enabled
      and activation.active_transition_epoch_id is null
      and gate.boundary_mode = 'PROVIDER_FENCE_V2'
      and gate.authority = 'SUPABASE'
      and gate.admission_state = 'CLOSED'
      and gate.admission_protocol_enforced
      and gate.active_epoch_id = epoch.epoch_id
      and epoch.boundary_mode = 'PROVIDER_FENCE_V2'
      and epoch.status = 'COMMITTED'
      and epoch.epoch_type = 'CUTOVER'
      and epoch.authority_before = 'GOOGLE'
      and epoch.authority_after = 'SUPABASE'
      and epoch.tournament_id = '2026'
      and epoch.deployment_commit = activation.expected_deployment_commit
      and closure.boundary_mode = 'PROVIDER_FENCE_V2'
      and closure.closure_kind = 'LEGACY_ADMISSION'
      and closure.authority = 'GOOGLE'
      and closure.status = 'CONSUMED'
      and closure.consumed_epoch_id = epoch.epoch_id
      and closure.tournament_id = '2026'
      and closure.deployment_id = gate.admission_deployment_id
      and evidence.deployment_id = gate.admission_deployment_id
      and evidence.deployment_commit = activation.expected_deployment_commit
      and evidence.vercel_project_id = activation.expected_vercel_project_id
      and evidence.source_workbook_id = resource.google_workbook_id
      and evidence.legacy_deployments_fenced
      and evidence.legacy_google_credentials_fenced
      and evidence.non_owner_manual_google_scoring_fenced
      and evidence.owner_override_operationally_frozen
      and evidence.revoked_at is null
      and epoch.admission_generation_id = closure.admission_generation_id
      and epoch.closure_boundary_fingerprint = closure.lease_set_fingerprint
      and closure.external_fence_evidence_id = evidence.evidence_id
      and epoch.google_writer_provider_fence_id = evidence.provider_fence_id
      and epoch.google_writer_provider_verification_id = evidence.provider_fence_verification_id
      and closure.google_writer_provider_fence_id = evidence.provider_fence_id
      and closure.google_writer_provider_verification_id = evidence.provider_fence_verification_id
      and not exists (
        select 1 from production_control.maintenance_deployment_capability_bindings binding
        where binding.epoch_id = epoch.epoch_id
      )
      and not exists (
        select 1 from production_control.postcutover_application_release_rebindings
        where scope_key = resource.scope_key
      )
      and not exists (
        select 1 from production_control.postcutover_normal_release_head
        where scope_key = resource.scope_key
      )
  ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_LEGACY_PROVIDER_ORIGIN_REQUIRED';
  end if;
end;
$$;
$approved_069_helper$;
  execute 'revoke all on function production_control.assert_legacy_provider_origin_v1() from public,anon,authenticated,service_role';

  execute $approved_069_body_1$
create or replace function production_control.assert_production_scoring_runtime(
  input jsonb,
  required_worker text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  pointer production_control.current_tournament_pointer_v1%rowtype;
  boundary_mode_value text;
begin
  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if pointer.tournament_id <> '2026' then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_LEGACY_SCORING_POINTER_CHANGED';
  end if;
  select boundary_mode into strict boundary_mode_value
  from production_control.cutover_activation_state
  where scope_key = 'BAGGER_INV_PRODUCTION';
  if boundary_mode_value = 'PROVIDER_FENCE_V2' then
    perform production_control.assert_legacy_provider_origin_v1();
  else
    perform production_control.annual_scoring_platform_certification_v1(input);
  end if;
  perform production_control
    .assert_production_scoring_runtime_pre_annual_pointer_fence(
      input, required_worker
    );
end;
$$;
$approved_069_body_1$;

  execute $approved_069_body_2$
create or replace function
  production_control.assert_annual_transition_platform_owner_v1(input jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  scope production_control.resource_scope%rowtype;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', input->>'actor_player_id', ''
  )));
  actor_auth uuid;
begin
  begin
    perform production_control.assert_production_service_role();
  exception when others then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_FUTURE_RUNTIME_SERVICE_ROLE_REQUIRED';
  end;
  if not exists (
    select 1 from production_control.annual_scoring_platform_certifications_v1
    where scope_key = 'BAGGER_INV_PRODUCTION'
  ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_SCORING_PLATFORM_CERTIFICATION_REQUIRED';
  end if;
  select value.* into strict scope
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if input->>'contract_version'
       is distinct from 'production-future-runtime-activation-v2'
     or input->>'environment' is distinct from 'PRODUCTION'
     or input->>'project_ref' is distinct from scope.project_ref
     or input->>'project_url' is distinct from scope.project_url
     or input->>'source_workbook_id' is distinct from scope.google_workbook_id
     or input->>'project_ref' ~* '(preview|staging|test)'
     or input->>'source_workbook_id' ~* '(preview|staging|test)'
     or input->>'tournament_id' is distinct from '2026'
     or coalesce((input->>'tournament_year')::integer, -1) <> 2026
     or input#>>'{authorization,tournament_id}' is distinct from '2026'
     or input#>>'{authorization,role}' is distinct from 'DIRECTOR'
     or actor_player !~ '^[A-Z0-9][A-Z0-9_-]{1,31}$' then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_ANNUAL_SCORING_PLATFORM_OWNER_REQUIRED';
  end if;
  begin
    actor_auth := coalesce(
      nullif(input#>>'{authorization,auth_user_id}', ''),
      nullif(input->>'actor_auth_user_id', '')
    )::uuid;
  exception when others then
    actor_auth := null;
  end;
  if actor_auth is null
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
      message = 'PRODUCTION_ANNUAL_SCORING_PLATFORM_OWNER_REQUIRED';
  end if;
  begin
    perform production_control.assert_access_governance_owner_v1(
      '2026', actor_player, actor_auth
    );
  exception when others then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_ANNUAL_SCORING_PLATFORM_OWNER_REQUIRED';
  end;
exception
  when invalid_text_representation or numeric_value_out_of_range
    or no_data_found then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_ANNUAL_SCORING_PLATFORM_OWNER_REQUIRED';
end;
$$;
$approved_069_body_2$;

  execute $approved_069_body_3$
create or replace function
  production_control.annual_scoring_transition_readiness_v1(
    target_tournament_id text
  )
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  pointer production_control.current_tournament_pointer_v1%rowtype;
  baseline jsonb;
  certificate jsonb;
  blockers jsonb;
  fingerprint_value text;
begin
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  baseline := production_control.future_runtime_readiness_v2(
    target_tournament_id
  );
  select coalesce(pg_catalog.jsonb_agg(value), '[]'::jsonb)
    into blockers
  from pg_catalog.jsonb_array_elements(
    coalesce(baseline->'blockers', '[]'::jsonb)
  ) value
  where value->>'code' <>
    'FUTURE_PREDECESSOR_SCORING_CLOSE_FENCE_NOT_CERTIFIED';
  if not exists (
    select 1 from production_control.annual_scoring_platform_certifications_v1
    where scope_key = 'BAGGER_INV_PRODUCTION'
  ) then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'PRODUCTION_ANNUAL_SCORING_PLATFORM_CERTIFICATION_REQUIRED',
        'section', 'Activation',
        'message', 'Annual activation requires its lawful platform certification.'
      )
    );
  end if;
  certificate :=
    production_control.annual_scoring_predecessor_certificate_v1(
      pointer.tournament_id
    );
  if coalesce((certificate->>'certified')::boolean, false) is not true then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'FUTURE_PREDECESSOR_SCORING_CLOSE_FENCE_NOT_CERTIFIED',
        'section', 'Activation',
        'message', 'The current tournament scoring close and drain boundary is not certified.',
        'details', certificate->'blockers'
      )
    );
  end if;
  fingerprint_value := production_control.future_runtime_hash_v2(
    pg_catalog.jsonb_build_object(
      'contractVersion', 'production-annual-scoring-transition-readiness-v1',
      'targetTournamentId', target_tournament_id,
      'predecessorTournamentId', pointer.tournament_id,
      'expectedPointerRevision', pointer.pointer_revision,
      'baselineFingerprint', baseline->>'fingerprint',
      'predecessorBoundaryFingerprint', certificate->>'fingerprint',
      'blockers', blockers
    )
  );
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'contractVersion',
      'production-annual-scoring-transition-readiness-v1',
    'targetTournamentId', target_tournament_id,
    'predecessorTournamentId', pointer.tournament_id,
    'expectedPointerRevision', pointer.pointer_revision,
    'ready', pg_catalog.jsonb_array_length(blockers) = 0,
    'fingerprint', fingerprint_value,
    'predecessorCertificate', certificate,
    'blockers', blockers
  );
end;
$$;
$approved_069_body_3$;

  -- The helper must be exactly the approved private owner-only definition.
  select p.*, l.lanname into actual
  from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid=p.prolang
  where p.oid=pg_catalog.to_regprocedure('production_control.assert_legacy_provider_origin_v1()');
  if not found then
    raise exception using errcode='55000',message='ANNUAL_069_BRIDGE_HELPER_MISSING';
  end if;
  if pg_catalog.encode(extensions.digest(actual.prosrc,'sha256'),'hex')<>'e58d460016a5cb5ee5c9cef976672defdaa90fb15ec75d39d9f6e354be330a5a'
     or actual.proowner<>owner_oid or not actual.prosecdef
     or actual.lanname<>'plpgsql' or actual.provolatile<>'s'
     or actual.proconfig is distinct from array['search_path=pg_catalog']::text[]
     or actual.prokind<>'f' or actual.proisstrict or actual.proleakproof
     or actual.proparallel<>'u' or actual.proretset or actual.prosupport<>0
     or actual.pronargs<>0 or actual.pronargdefaults<>0 or actual.proargdefaults is not null
     or actual.prorettype<>'pg_catalog.void'::pg_catalog.regtype
     or exists (
       select 1 from pg_catalog.aclexplode(coalesce(actual.proacl,
         pg_catalog.acldefault('f',actual.proowner))) a
       where a.grantee<>actual.proowner
     )
     or pg_catalog.has_function_privilege('anon',actual.oid,'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated',actual.oid,'EXECUTE')
     or pg_catalog.has_function_privilege('service_role',actual.oid,'EXECUTE') then
    raise exception using errcode='55000',message='ANNUAL_069_BRIDGE_HELPER_CONTRACT_MISMATCH';
  end if;

  for expected in select * from (values
    ('production_control.assert_production_scoring_runtime(jsonb,text)','v','1acd6bff4a975cf2815a8bad51a9412ddaecf7d4bde7b009fc7b1bdcc4c054d7','dc4b594779bb82f6d37508a76508a2c2294727123ccda7341157437dfb95ddcb'),
    ('production_control.assert_annual_transition_platform_owner_v1(jsonb)','v','4040e229622fd9f35f67eccd1c414d52a1a7d139353c17fc6a1a978dfce30216','491379f8a8b1640c3addefcaf9d19ae70171ddb41608a46e5cd484c9c2777d86'),
    ('production_control.annual_scoring_transition_readiness_v1(text)','s','e0c9d2446f0784c3d5efe10f588d629685e7a828393ace14f3f17734dca1d73f','5da45e8358a2b11a34e254141aaa93e3cac757d9c880c04a59ad438d1086c09c')
  ) contract(signature,volatility,original_hash,corrected_hash) loop
    select p.*, l.lanname into actual
    from pg_catalog.pg_proc p
    join pg_catalog.pg_language l on l.oid=p.prolang
    where p.oid=pg_catalog.to_regprocedure(expected.signature);
    if not found then
      raise exception using errcode='55000',message='ANNUAL_069_BRIDGE_FUNCTION_MISSING';
    end if;
    if actual.proowner<>owner_oid or not actual.prosecdef
       or actual.lanname<>'plpgsql'
       or actual.provolatile::text<>expected.volatility
       or actual.proconfig is distinct from array['search_path=pg_catalog']::text[]
       or actual.prokind<>'f' or actual.proisstrict or actual.proleakproof
       or actual.proparallel<>'u' or actual.proretset or actual.prosupport<>0
       or exists (
         select 1 from pg_catalog.aclexplode(coalesce(actual.proacl,
           pg_catalog.acldefault('f',actual.proowner))) a
         where a.grantee<>actual.proowner
       )
       or pg_catalog.has_function_privilege('anon',actual.oid,'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated',actual.oid,'EXECUTE')
       or pg_catalog.has_function_privilege('service_role',actual.oid,'EXECUTE') then
      raise exception using errcode='55000',message='ANNUAL_069_BRIDGE_PRIVILEGE_BASELINE_MISMATCH';
    end if;
    if pg_catalog.encode(extensions.digest(actual.prosrc,'sha256'),'hex')<>expected.corrected_hash then
      raise exception using errcode='55000',message='ANNUAL_069_BRIDGE_RESULT_MISMATCH';
    end if;
  end loop;
  select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p)-'prosrc' order by p.oid)
  into after_catalog from pg_catalog.pg_proc p where p.oid=any(affected_oids);
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(d)
    order by d.classid,d.objid,d.objsubid,d.refclassid,d.refobjid,d.refobjsubid,d.deptype),'[]'::jsonb)
  into after_dependencies from pg_catalog.pg_depend d
  where (d.classid='pg_catalog.pg_proc'::pg_catalog.regclass and d.objid=any(affected_oids))
     or (d.refclassid='pg_catalog.pg_proc'::pg_catalog.regclass and d.refobjid=any(affected_oids));
  if after_catalog is distinct from before_catalog
     or after_dependencies is distinct from before_dependencies then
    raise exception using errcode='55000',message='ANNUAL_069_BRIDGE_IDENTITY_PRIVILEGE_DEPENDENCY_CHANGED';
  end if;
END;
$annual_069_forward_bridge$;

create table production_control.canonical_resource_v1 (
  singleton boolean primary key default true check(singleton),
  resource_id text not null unique,
  resource_class text not null check(resource_class in('PRODUCTION','CERTIFICATION')),
  installation_id uuid not null unique,
  database_name text not null,
  project_ref text not null unique check(project_ref ~ '^[a-z]{20}$'),
  project_url text not null unique,
  vercel_team_id text not null check(length(vercel_team_id) between 6 and 100),
  vercel_project_id text not null check(length(vercel_project_id) between 6 and 100),
  registration_revision bigint not null check(registration_revision>0),
  manifest_digest text not null check(manifest_digest ~ '^[0-9a-f]{64}$'),
  schema_contract text not null check(schema_contract='canonical-resource-v1'),
  schema_digest text not null check(schema_digest ~ '^[0-9a-f]{64}$'),
  provenance_id text not null unique,
  created_at timestamptz not null default clock_timestamp(),
  unique(resource_id,resource_class),
  unique(project_ref,project_url),
  check(project_url='https://' || project_ref || '.supabase.co'),
  check((resource_class='PRODUCTION' and resource_id='BAGGER_INV_PRODUCTION'
      and project_ref='ymqhhtxaywtqllynrmxe'
      and provenance_id='1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4')
    or (resource_class='CERTIFICATION'
      and resource_id='CERTIFICATION:' || installation_id::text
      and project_ref not in('ymqhhtxaywtqllynrmxe','idgigvjjqkfbqjeredpb')
      and provenance_id='urn:bagger:synthetic:' || installation_id::text))
);
alter table production_control.canonical_resource_v1 enable row level security;
revoke all on production_control.canonical_resource_v1 from public,anon,authenticated,service_role;

-- Deterministic descriptor of the existing identity only. Fresh baselines copy
-- definitions, never this registration row or any legacy activation seed.
insert into production_control.canonical_resource_v1
  (resource_id,resource_class,installation_id,database_name,project_ref,project_url,
   vercel_team_id,vercel_project_id,registration_revision,manifest_digest,
   schema_contract,schema_digest,provenance_id)
select scope_key,'PRODUCTION',md5('canonical-resource-v1:'||scope_key||':'||project_ref)::uuid,
  current_database(),project_ref,project_url,'team_kPw5zaib8uaQJALAwj4fWI6R',
  'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU',1,
  encode(extensions.digest('existing-production-registration-v1:'||scope_key||':'||project_ref,'sha256'),'hex'),
  'canonical-resource-v1',encode(extensions.digest('canonical-resource-v1','sha256'),'hex'),google_workbook_id
from production_control.resource_scope where scope_key='BAGGER_INV_PRODUCTION';

create table production_control.canonical_bootstrap_installation_v1 (
  contract_version text primary key,
  manifest_sha256 text not null check(manifest_sha256 ~ '^[0-9a-f]{64}$'),
  schema_sha256 text not null check(schema_sha256 ~ '^[0-9a-f]{64}$'),
  static_data_sha256 text not null check(static_data_sha256 ~ '^[0-9a-f]{64}$'),
  installed_at timestamptz not null default clock_timestamp()
);
alter table production_control.canonical_bootstrap_installation_v1 enable row level security;
revoke all on production_control.canonical_bootstrap_installation_v1 from public,anon,authenticated,service_role;

alter table production_control.current_tournament_pointer_v1
  drop constraint current_tournament_pointer_v1_scope_key_fkey,
  add constraint current_tournament_pointer_v1_scope_key_fkey
    foreign key(scope_key) references production_control.canonical_resource_v1(resource_id) on delete restrict,
  drop constraint current_tournament_pointer_v1_contract_version_check,
  add constraint current_tournament_pointer_v1_contract_version_check check(
    (scope_key='BAGGER_INV_PRODUCTION' and contract_version='production-current-tournament-pointer-v1')
    or (scope_key like 'CERTIFICATION:%' and contract_version='certification-current-tournament-pointer-v1'));

create table production_control.certification_admission_v1 (
  resource_id text primary key,
  resource_class text not null default 'CERTIFICATION' check(resource_class='CERTIFICATION'),
  binding_id uuid not null unique,
  enabled boolean not null default false,
  git_branch text not null check(length(git_branch) between 1 and 200),
  deployment_class text not null check(deployment_class='preview'),
  release_commit text not null check(release_commit ~ '^[0-9a-f]{40}$'),
  deployment_id text not null check(length(deployment_id) between 1 and 200),
  deployment_origin text not null check(deployment_origin ~ '^https://[a-z0-9][a-z0-9.-]*[a-z0-9]$'),
  governance_tournament_id text not null references scoring_authority.tournaments(tournament_id),
  authority_epoch_id uuid not null references scoring_authority.authority_epochs(epoch_id),
  activation_revision bigint not null check(activation_revision>0),
  admission_revision bigint not null check(admission_revision>0),
  capabilities text[] not null check(cardinality(capabilities)>0 and capabilities <@ array['READS','SCORING','DIRECTOR','WORKERS','ANNUAL']::text[]),
  created_at timestamptz not null default clock_timestamp(),
  foreign key(resource_id,resource_class) references production_control.canonical_resource_v1(resource_id,resource_class)
);
alter table production_control.certification_admission_v1 enable row level security;
revoke all on production_control.certification_admission_v1 from public,anon,authenticated,service_role;

create table production_control.canonical_operation_context_v1 (
  backend_pid integer not null,
  transaction_id xid8 not null,
  depth integer not null check(depth between 1 and 32),
  phase text not null check(phase in('READS','SCORING','DIRECTOR','WORKERS','ANNUAL')),
  mutation boolean not null,
  validated_request jsonb not null check(jsonb_typeof(validated_request)='object'),
  context jsonb not null check(jsonb_typeof(context)='object'),
  primary key(backend_pid,transaction_id)
);
alter table production_control.canonical_operation_context_v1 enable row level security;
revoke all on production_control.canonical_operation_context_v1 from public,anon,authenticated,service_role;

create function production_control.guard_canonical_resource_identity_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog as $fn$
begin
  if tg_op='DELETE' then
    raise exception using errcode='55000',message='CANONICAL_RESOURCE_IDENTITY_IMMUTABLE';
  end if;
  if (to_jsonb(new)-array['registration_revision','manifest_digest','schema_contract','schema_digest'])
      is distinct from (to_jsonb(old)-array['registration_revision','manifest_digest','schema_contract','schema_digest']) then
    raise exception using errcode='55000',message='CANONICAL_RESOURCE_IDENTITY_IMMUTABLE';
  end if;
  if new.registration_revision<>old.registration_revision+1
    or exists(select 1 from production_control.certification_admission_v1 where resource_id=old.resource_id and enabled) then
    raise exception using errcode='40001',message='CANONICAL_RESOURCE_REVISION_REQUIRES_CLOSED_ADMISSION';
  end if;
  return new;
end;
$fn$;
create trigger guard_canonical_resource_identity before update or delete
  on production_control.canonical_resource_v1 for each row
  execute function production_control.guard_canonical_resource_identity_v1();

create function production_control.register_certification_resource_v1(input jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $fn$
declare existing production_control.canonical_resource_v1%rowtype; installed production_control.canonical_resource_v1%rowtype;
begin
  -- Invoker and table ACLs are deliberately used for owner-only installation.
  if current_user <> pg_get_userbyid((select relowner from pg_class where oid='production_control.canonical_resource_v1'::regclass)) then
    raise exception using errcode='42501',message='CANONICAL_RESOURCE_OWNER_REQUIRED';
  end if;
  if jsonb_typeof(input) is distinct from 'object'
    or input->>'resource_class' is distinct from 'CERTIFICATION'
    or input->>'schema_contract' is distinct from 'canonical-resource-v1'
    or exists(select 1 from production_control.resource_scope)
    or exists(select 1 from production_control.cutover_activation_state) then
    raise exception using errcode='42501',message='CERTIFICATION_REGISTRATION_REJECTED';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('canonical-resource-registration-v1',0));
  select * into existing from production_control.canonical_resource_v1 where singleton for update;
  if found then
    if existing.resource_class<>'CERTIFICATION'
      or input->>'resource_id' is distinct from existing.resource_id
      or input->>'installation_id' is distinct from existing.installation_id::text
      or input->>'project_ref' is distinct from existing.project_ref
      or input->>'project_url' is distinct from existing.project_url
      or input->>'vercel_team_id' is distinct from existing.vercel_team_id
      or input->>'vercel_project_id' is distinct from existing.vercel_project_id
      or (input->>'registration_revision')::bigint is distinct from existing.registration_revision
      or input->>'manifest_digest' is distinct from existing.manifest_digest
      or input->>'schema_digest' is distinct from existing.schema_digest
      or current_database() is distinct from existing.database_name then
      raise exception using errcode='40001',message='CERTIFICATION_REGISTRATION_CONFLICT';
    end if;
    return to_jsonb(existing)-'created_at';
  end if;
  insert into production_control.canonical_resource_v1
    (resource_id,resource_class,installation_id,database_name,project_ref,project_url,
     vercel_team_id,vercel_project_id,registration_revision,manifest_digest,schema_contract,schema_digest,provenance_id)
  values(input->>'resource_id','CERTIFICATION',(input->>'installation_id')::uuid,current_database(),
    input->>'project_ref',input->>'project_url',input->>'vercel_team_id',input->>'vercel_project_id',
    (input->>'registration_revision')::bigint,input->>'manifest_digest',input->>'schema_contract',input->>'schema_digest',
    'urn:bagger:synthetic:'||(input->>'installation_id')) returning * into installed;
  insert into production_control.operation_audit_events(event_type,domain,actor,result,details)
  values('CERTIFICATION_RESOURCE_REGISTERED','RESOURCE',current_user,'SUCCEEDED',to_jsonb(installed)-'created_at');
  return to_jsonb(installed)-'created_at';
exception when invalid_text_representation or not_null_violation or check_violation then
  raise exception using errcode='22023',message='CERTIFICATION_REGISTRATION_INVALID';
end;
$fn$;

create function production_control.assert_certification_context_v1(input jsonb, required_phase text, mutation boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
declare resource production_control.canonical_resource_v1%rowtype;
  admission production_control.certification_admission_v1%rowtype;
  pointer production_control.current_tournament_pointer_v1%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  context jsonb; token text; operation_id text;
begin
  perform production_control.assert_production_service_role();
  if required_phase is null or required_phase not in('READS','SCORING','DIRECTOR','WORKERS','ANNUAL')
    or input->>'contract_version' is distinct from 'certification-runtime-v1'
    or input->>'phase' is distinct from required_phase
    or jsonb_typeof(input->'resource') is distinct from 'object'
    or input#>>'{resource,resource_class}' is distinct from 'CERTIFICATION'
    or jsonb_typeof(input->'deployment') is distinct from 'object' then
    raise exception using errcode='42501',message='CANONICAL_RESOURCE_CONTEXT_REQUIRED';
  end if;
  perform pg_advisory_xact_lock_shared(production_control.scoring_admission_lock_key());
  select * into strict resource from production_control.canonical_resource_v1 where singleton for share;
  if resource.resource_class<>'CERTIFICATION' or resource.database_name<>current_database()
    or exists(select 1 from production_control.resource_scope)
    or exists(select 1 from production_control.cutover_activation_state)
    or input#>>'{resource,resource_id}' is distinct from resource.resource_id
    or input#>>'{resource,installation_id}' is distinct from resource.installation_id::text
    or input#>>'{resource,project_ref}' is distinct from resource.project_ref
    or input#>>'{resource,project_url}' is distinct from resource.project_url then
    raise exception using errcode='42501',message='CANONICAL_RESOURCE_BINDING_DENIED';
  end if;
  if input#>>'{resource,schema_contract}' is distinct from resource.schema_contract
    or input#>>'{resource,schema_digest}' is distinct from resource.schema_digest then
    raise exception using errcode='55000',message='CANONICAL_RESOURCE_SCHEMA_UNAVAILABLE';
  end if;
  if input#>>'{resource,registration_revision}' is distinct from resource.registration_revision::text
    or input#>>'{resource,manifest_digest}' is distinct from resource.manifest_digest then
    raise exception using errcode='40001',message='CANONICAL_RESOURCE_REGISTRATION_STALE';
  end if;
  select * into strict admission from production_control.certification_admission_v1 where resource_id=resource.resource_id for share;
  if not admission.enabled or not required_phase=any(admission.capabilities)
    or input#>>'{deployment,vercel_team_id}' is distinct from resource.vercel_team_id
    or input#>>'{deployment,vercel_project_id}' is distinct from resource.vercel_project_id
    or input#>>'{deployment,git_branch}' is distinct from admission.git_branch
    or input#>>'{deployment,deployment_class}' is distinct from admission.deployment_class
    or input#>>'{deployment,release_commit}' is distinct from admission.release_commit
    or input#>>'{deployment,deployment_id}' is distinct from admission.deployment_id
    or input#>>'{deployment,deployment_origin}' is distinct from admission.deployment_origin then
    raise exception using errcode='42501',message='CANONICAL_RESOURCE_DEPLOYMENT_DENIED';
  end if;
  select * into strict pointer from production_control.current_tournament_pointer_v1 where scope_key=resource.resource_id for share;
  select * into strict gate from scoring_authority.ingress_gates where tournament_id=pointer.tournament_id for share;
  if gate.authority<>'SUPABASE'
    or gate.active_epoch_id is distinct from admission.authority_epoch_id
    or not exists(select 1 from scoring_authority.tournaments t where t.tournament_id=pointer.tournament_id
      and t.tournament_year=pointer.tournament_year and t.scoring_authority='SUPABASE')
    or not exists(select 1 from scoring_authority.authority_epochs e where e.epoch_id=admission.authority_epoch_id
      and e.status='COMMITTED' and e.authority_after='SUPABASE') then
    raise exception using errcode='55000',message='CANONICAL_RESOURCE_RUNTIME_UNAVAILABLE';
  end if;
  -- Reads/annual transitions must observe closed ingress safely; mutation
  -- domain/lifecycle guards remain independently enforced by their cores.
  if required_phase in('SCORING','DIRECTOR','WORKERS') and (gate.state<>'OPEN' or gate.unresolved_client_queues<>0) then
    raise exception using errcode='55000',message='CANONICAL_RESOURCE_INGRESS_CLOSED';
  end if;
  context:=jsonb_build_object(
    'resource_id',resource.resource_id,'resource_class',resource.resource_class,
    'installation_id',resource.installation_id,'project_ref',resource.project_ref,'project_url',resource.project_url,
    'registration_revision',resource.registration_revision,'manifest_digest',resource.manifest_digest,
    'schema_contract',resource.schema_contract,'schema_digest',resource.schema_digest,
    'binding_id',admission.binding_id,'current_tournament_id',pointer.tournament_id,'tournament_id',pointer.tournament_id,
    'current_tournament_year',pointer.tournament_year,'pointer_revision',pointer.pointer_revision,
    'governance_tournament_id',admission.governance_tournament_id,
    'authority_epoch_id',admission.authority_epoch_id,'activation_revision',admission.activation_revision,
    'admission_revision',admission.admission_revision,'release_commit',admission.release_commit,
    'vercel_team_id',resource.vercel_team_id,'vercel_project_id',resource.vercel_project_id,
    'git_branch',admission.git_branch,'deployment_class',admission.deployment_class,
    'deployment_id',admission.deployment_id,'deployment_origin',admission.deployment_origin);
  token:=production_control.tournament_setup_hash_v1(context);
  if (mutation or input ? 'expected_context_token') and input->>'expected_context_token' is distinct from token then
    raise exception using errcode='40001',message='CANONICAL_RESOURCE_CONTEXT_STALE';
  end if;
  if mutation then
    operation_id:=coalesce(input->>'operation_request_id',input->>'mutation_key');
    if operation_id is null then
      raise exception using errcode='22023',message='CANONICAL_RESOURCE_OPERATION_ID_REQUIRED';
    end if;
    if required_phase='SCORING' then
      if operation_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$' then
        raise exception using errcode='22023',message='CANONICAL_RESOURCE_OPERATION_ID_INVALID';
      end if;
    else
      perform operation_id::uuid;
    end if;
  end if;
  return context||jsonb_build_object('context_token',token,
    'resource_fingerprint',production_control.tournament_setup_hash_v1(to_jsonb(resource)-'created_at'),
    'phase',required_phase,'operation_request_id',operation_id,'authorization',input->'authorization',
    'actor_auth_user_id',input#>>'{authorization,auth_user_id}','actor_player_id',input#>>'{authorization,player_id}');
exception when no_data_found then
  raise exception using errcode='55000',message='CANONICAL_RESOURCE_NOT_INSTALLED';
when invalid_text_representation or numeric_value_out_of_range then
  raise exception using errcode='22023',message='CANONICAL_RESOURCE_INPUT_INVALID';
end;
$fn$;

create function public.read_certification_runtime_context_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
begin
  return jsonb_build_object('contract','certification-runtime-v1','context',
    production_control.assert_certification_context_v1(input,input->>'phase',false)
    -array['authorization','actor_auth_user_id','actor_player_id','operation_request_id']);
end;
$fn$;

create function production_control.push_certification_context_v1(input jsonb, required_phase text, mutation boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
declare context jsonb; prior production_control.canonical_operation_context_v1%rowtype;
begin
  context:=production_control.assert_certification_context_v1(input,required_phase,mutation);
  select * into prior from production_control.canonical_operation_context_v1
    where backend_pid=pg_backend_pid() and transaction_id=pg_current_xact_id() for update;
  if found then
    if prior.phase is distinct from required_phase or prior.mutation is distinct from mutation
      or prior.context->>'context_token' is distinct from context->>'context_token'
      or prior.context->>'operation_request_id' is distinct from context->>'operation_request_id'
      or prior.context->'authorization' is distinct from context->'authorization' then
      raise exception using errcode='42501',message='CANONICAL_RESOURCE_NESTED_CONTEXT_DENIED';
    end if;
    update production_control.canonical_operation_context_v1 set depth=depth+1
      where backend_pid=pg_backend_pid() and transaction_id=pg_current_xact_id();
  else
    insert into production_control.canonical_operation_context_v1
      values(pg_backend_pid(),pg_current_xact_id(),1,required_phase,mutation,input,context);
  end if;
  return context;
end;
$fn$;

create function production_control.current_certification_context_v1()
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
declare marker production_control.canonical_operation_context_v1%rowtype; context jsonb;
begin
  select * into marker from production_control.canonical_operation_context_v1
    where backend_pid=pg_backend_pid() and transaction_id=pg_current_xact_id();
  if not found then raise exception using errcode='42501',message='CANONICAL_RESOURCE_CONTEXT_REQUIRED'; end if;
  context:=production_control.assert_certification_context_v1(marker.validated_request,marker.phase,marker.mutation);
  if context is distinct from marker.context then
    raise exception using errcode='40001',message='CANONICAL_RESOURCE_CONTEXT_STALE';
  end if;
  return context;
end;
$fn$;

create function production_control.pop_certification_context_v1()
returns void language plpgsql security definer set search_path=pg_catalog as $fn$
begin
  delete from production_control.canonical_operation_context_v1
    where backend_pid=pg_backend_pid() and transaction_id=pg_current_xact_id() and depth=1;
  if not found then
    update production_control.canonical_operation_context_v1 set depth=depth-1
      where backend_pid=pg_backend_pid() and transaction_id=pg_current_xact_id() and depth>1;
    if not found then raise exception using errcode='42501',message='CANONICAL_RESOURCE_CONTEXT_REQUIRED'; end if;
  end if;
end;
$fn$;

revoke all on function production_control.guard_canonical_resource_identity_v1(),
  production_control.register_certification_resource_v1(jsonb),
  production_control.assert_certification_context_v1(jsonb,text,boolean),
  production_control.push_certification_context_v1(jsonb,text,boolean),
  production_control.current_certification_context_v1(),production_control.pop_certification_context_v1(),
  public.read_certification_runtime_context_v1(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.read_certification_runtime_context_v1(jsonb) to service_role;

comment on table production_control.canonical_resource_v1 is
  'One immutable resource per physical database. Owner-reviewed registration; runtime roles cannot register or reclassify.';
comment on table production_control.canonical_operation_context_v1 is
  'Private transactional admission marker, never a caller-set GUC. No direct runtime-role privileges.';

-- Certification starts as canonical Supabase authority. It never fabricates a
-- Google cutover epoch. Existing Production epoch values/guards are unchanged.
alter table scoring_authority.authority_epochs drop constraint authority_epochs_epoch_type_check,
 add constraint authority_epochs_epoch_type_check check(epoch_type in('CUTOVER','ROLLBACK','CERTIFICATION_INITIALIZATION'));
create function production_control.guard_certification_epoch_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if new.epoch_type='CERTIFICATION_INITIALIZATION' and (
   new.authority_before<>'SUPABASE' or new.authority_after<>'SUPABASE'
   or new.google_checkpoints<>'{}'::jsonb
   or not exists(select 1 from production_control.canonical_resource_v1 r
     where r.resource_class='CERTIFICATION' and r.database_name=current_database())
   or exists(select 1 from production_control.resource_scope)
   or exists(select 1 from production_control.cutover_activation_state)) then
  raise exception using errcode='42501',message='CERTIFICATION_EPOCH_RESOURCE_REQUIRED';
 end if;
 return new;
end;
$$;
create trigger guard_certification_epoch before insert or update on scoring_authority.authority_epochs
 for each row execute function production_control.guard_certification_epoch_v1();
revoke all on function production_control.guard_certification_epoch_v1() from public,anon,authenticated,service_role;

-- Owner-only initial control bootstrap, deliberately separate from schema and
-- resource registration. It creates no identities, permissions, matches,
-- scores, financial facts, external configuration or enabled runtime admission.
create function production_control.initialize_certification_resource_v1(input jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare r production_control.canonical_resource_v1%rowtype;
 a production_control.certification_admission_v1%rowtype;
 epoch_id uuid:=(input->>'authority_epoch_id')::uuid;
 binding_id uuid:=(input->>'binding_id')::uuid;
begin
 if current_user<>pg_get_userbyid((select relowner from pg_class where oid='production_control.canonical_resource_v1'::regclass)) then
  raise exception using errcode='42501',message='CANONICAL_RESOURCE_OWNER_REQUIRED';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('canonical-resource-registration-v1',0));
 select * into strict r from production_control.canonical_resource_v1 where singleton for update;
 if r.resource_class<>'CERTIFICATION' or r.database_name<>current_database()
   or input->>'resource_id' is distinct from r.resource_id
   or exists(select 1 from production_control.resource_scope)
   or exists(select 1 from production_control.cutover_activation_state)
   or input->>'initial_tournament_id' is distinct from '2026'
   or input->>'governance_tournament_id' is distinct from '2026'
   or input->>'release_commit' !~ '^[0-9a-f]{40}$'
   or epoch_id is null or binding_id is null then
  raise exception using errcode='42501',message='CERTIFICATION_BOOTSTRAP_INVALID';
 end if;
 select * into a from production_control.certification_admission_v1 where resource_id=r.resource_id;
 if found then
  if a.binding_id=binding_id and a.authority_epoch_id=epoch_id
    and a.release_commit=input->>'release_commit' and a.git_branch=input->>'git_branch'
    and a.deployment_id=input->>'deployment_id' and a.deployment_origin=input->>'deployment_origin'
    and a.capabilities=array(select jsonb_array_elements_text(input->'capabilities')) then
   return jsonb_build_object('ok',true,'idempotent',true,'resource_id',r.resource_id,'binding_id',a.binding_id);
  end if;
  raise exception using errcode='40001',message='CERTIFICATION_BOOTSTRAP_CONFLICT';
 end if;
 if exists(select 1 from scoring_authority.tournaments)
   or exists(select 1 from production_control.current_tournament_pointer_v1)
   or exists(select 1 from scoring_authority.authority_epochs) then
  raise exception using errcode='55000',message='CERTIFICATION_BOOTSTRAP_REQUIRES_EMPTY_AUTHORITY';
 end if;
 insert into scoring_authority.tournaments(tournament_id,tournament_year,name,source_workbook_id,scoring_authority)
 values('2026',2026,'Synthetic canonical certification',r.provenance_id,'SUPABASE');
 insert into production_control.future_tournament_catalog_v1(tournament_id,tournament_year,contract_version,
   tournament_name,lifecycle,lifecycle_revision,setup_revision,creation_mode,source_manifest)
 values('2026',2026,'production-future-year-administration-v1','Synthetic canonical certification','ACTIVE',1,0,'EXISTING',
   jsonb_build_object('resource_class','CERTIFICATION','resource_id',r.resource_id,'provenance_id',r.provenance_id));
 insert into production_control.current_tournament_pointer_v1(scope_key,contract_version,tournament_id,tournament_year,pointer_revision,lifecycle_revision)
 values(r.resource_id,'certification-current-tournament-pointer-v1','2026',2026,1,1);
 insert into production_control.future_tournament_resources_v1(tournament_id,project_ref,project_url,source_workbook_id,
   resource_status,resource_revision,google_compatibility_policy)
 values('2026',r.project_ref,r.project_url,r.provenance_id,'CURRENT_RESOURCE_BOUND',1,'RETIRED');
 insert into scoring_authority.authority_epochs(epoch_id,tournament_id,epoch_type,status,authority_before,authority_after,
   reconciliation_fingerprint,google_checkpoints,supabase_match_revisions,deployment_commit,actor_id,reason,committed_at)
 values(epoch_id,'2026','CERTIFICATION_INITIALIZATION','COMMITTED','SUPABASE','SUPABASE',
   production_control.tournament_setup_hash_v1(to_jsonb(r)-'created_at'),'{}','{}',input->>'release_commit',current_user,
   'Owner-installed synthetic Certification authority; no prior provider authority',clock_timestamp());
 insert into scoring_authority.ingress_gates(tournament_id,state,authority,active_epoch_id,unresolved_client_queues,updated_by)
 values('2026','PAUSED','SUPABASE',epoch_id,0,current_user);
 insert into production_control.certification_admission_v1(resource_id,binding_id,enabled,git_branch,deployment_class,
   release_commit,deployment_id,deployment_origin,governance_tournament_id,authority_epoch_id,
   activation_revision,admission_revision,capabilities)
 values(r.resource_id,binding_id,false,input->>'git_branch','preview',input->>'release_commit',input->>'deployment_id',
   input->>'deployment_origin','2026',epoch_id,1,1,array(select jsonb_array_elements_text(input->'capabilities')));
 insert into production_control.operation_audit_events(event_type,domain,actor,result,details)
 values('CERTIFICATION_AUTHORITY_INITIALIZED','RESOURCE',current_user,'SUCCEEDED',
   jsonb_build_object('resource_id',r.resource_id,'installation_id',r.installation_id,'binding_id',binding_id,
     'authority_epoch_id',epoch_id,'enabled',false,'ingress','PAUSED'));
 return jsonb_build_object('ok',true,'idempotent',false,'resource_id',r.resource_id,'binding_id',binding_id);
end;
$$;
revoke all on function production_control.initialize_certification_resource_v1(jsonb) from public,anon,authenticated,service_role;

create function production_control.set_certification_admission_v1(input jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare r production_control.canonical_resource_v1%rowtype;
 a production_control.certification_admission_v1%rowtype;
 p production_control.current_tournament_pointer_v1%rowtype;
 desired boolean;
begin
 if current_user<>pg_get_userbyid((select relowner from pg_class where oid='production_control.canonical_resource_v1'::regclass)) then
  raise exception using errcode='42501',message='CANONICAL_RESOURCE_OWNER_REQUIRED';
 end if;
 if jsonb_typeof(input->'enabled') is distinct from 'boolean' or length(btrim(coalesce(input->>'reason','')))=0 then
  raise exception using errcode='22023',message='CERTIFICATION_ADMISSION_INPUT_INVALID';
 end if;
 desired:=(input->>'enabled')::boolean;
 perform pg_advisory_xact_lock(production_control.scoring_admission_lock_key());
 select * into strict r from production_control.canonical_resource_v1 where singleton for update;
 if r.resource_class<>'CERTIFICATION' or r.database_name<>current_database()
   or input->>'resource_id' is distinct from r.resource_id
   or exists(select 1 from production_control.resource_scope)
   or exists(select 1 from production_control.cutover_activation_state) then
  raise exception using errcode='42501',message='CERTIFICATION_ADMISSION_RESOURCE_DENIED';
 end if;
 select * into strict a from production_control.certification_admission_v1 where resource_id=r.resource_id for update;
 select * into strict p from production_control.current_tournament_pointer_v1 where scope_key=r.resource_id for update;
 if input->>'expected_admission_revision' is distinct from a.admission_revision::text then
  raise exception using errcode='40001',message='CERTIFICATION_ADMISSION_REVISION_STALE';
 end if;
 if not exists(select 1 from scoring_authority.ingress_gates g where g.tournament_id=p.tournament_id
   and g.authority='SUPABASE' and g.active_epoch_id=a.authority_epoch_id and g.unresolved_client_queues=0)
   or not exists(select 1 from scoring_authority.authority_epochs e where e.epoch_id=a.authority_epoch_id
     and e.status='COMMITTED' and e.authority_after='SUPABASE') then
  raise exception using errcode='55000',message='CERTIFICATION_ADMISSION_CANONICAL_AUTHORITY_REQUIRED';
 end if;
 update production_control.certification_admission_v1 set enabled=desired,admission_revision=admission_revision+1
 where resource_id=r.resource_id;
 update scoring_authority.ingress_gates set state=case when desired then 'OPEN' else 'PAUSED' end,
   updated_by=current_user,updated_at=clock_timestamp() where tournament_id=p.tournament_id;
 insert into production_control.operation_audit_events(event_type,domain,actor,result,details)
 values('CERTIFICATION_ADMISSION_CHANGED','RESOURCE',current_user,'SUCCEEDED',
   jsonb_build_object('resource_id',r.resource_id,'installation_id',r.installation_id,'enabled',desired,
     'before_revision',a.admission_revision,'after_revision',a.admission_revision+1,'reason',input->>'reason'));
 return jsonb_build_object('ok',true,'enabled',desired,'admission_revision',a.admission_revision+1);
end;
$$;
revoke all on function production_control.set_certification_admission_v1(jsonb) from public,anon,authenticated,service_role;
commit;
