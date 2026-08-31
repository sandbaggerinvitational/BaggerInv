-- Step 13E.7B.1: annual side-game runtime certification and close fence.
--
-- Installation is inert. It records no runtime certification until the
-- already-bounded annual PREPARE operation creates an exact PREPARED runtime
-- generation. It does not create or configure Odds, Net Skins, or Calcutta
-- data, move the current-tournament pointer, close 2026 admission, or enqueue
-- work. The certification is derived only from installed SQL definitions and
-- exact annual resources; no caller supplies a manifest or fingerprint.
begin;

create table production_control.annual_side_game_runtime_certifications_v1 (
  runtime_generation_id uuid not null references
    production_control.future_annual_runtime_generations_v1(
      runtime_generation_id
    ) on delete restrict,
  contract_version text not null check (
    contract_version = 'production-annual-side-game-runtime-v1'
  ),
  tournament_id text not null references
    production_control.future_tournament_catalog_v1(tournament_id)
    on delete restrict,
  pointer_revision bigint not null check (pointer_revision > 1),
  authority_generation_id uuid not null,
  admission_generation_id uuid not null,
  project_ref text not null,
  project_url text not null,
  source_workbook_id text not null,
  resource_revision bigint not null check (resource_revision > 0),
  resource_fingerprint text not null check (
    resource_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  implementation_manifest jsonb not null check (
    pg_catalog.jsonb_typeof(implementation_manifest) = 'object'
  ),
  implementation_fingerprint text not null check (
    implementation_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  certification_fingerprint text not null check (
    certification_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  certified_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (runtime_generation_id, admission_generation_id),
  unique (tournament_id, runtime_generation_id, admission_generation_id),
  check (
    runtime_generation_id <> authority_generation_id
    and runtime_generation_id <> admission_generation_id
    and authority_generation_id <> admission_generation_id
  )
);

alter table production_control.annual_side_game_runtime_certifications_v1
  enable row level security;
revoke all on table
  production_control.annual_side_game_runtime_certifications_v1
  from public, anon, authenticated, service_role;

create trigger production_annual_side_game_certification_immutable_v1
before update or delete
on production_control.annual_side_game_runtime_certifications_v1
for each row execute function
  production_control.reject_future_runtime_immutable_v2();

create function production_control.annual_side_game_implementation_manifest_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $annual_side_game_manifest$
declare
  core_runtime_signatures constant text[] := array[
    'production_control.assert_annual_scoring_runtime_v1(jsonb,text,text)',
    'production_control.assert_annual_scoring_runtime_pre_side_games_v1(jsonb,text,text)',
    'production_control.assert_annual_scoring_platform_v1(jsonb,text,text)',
    'production_control.annual_scoring_platform_certification_v1(jsonb)',
    'production_control.assert_future_production_scoring_runtime_v1(jsonb,text)',
    'production_control.assert_future_scoring_runtime_capability_v1(text,uuid,uuid,uuid)',
    'production_control.assert_future_scoring_runtime_capability_pre_side_games_v1(text,uuid,uuid,uuid)'
  ];
  core_runtime_volatility constant text[] := array[
    'v', 'v', 's', 's', 'v', 'v', 's'
  ];
  odds_signatures constant text[] := array[
    'public.dispatch_production_annual_odds_v1(jsonb)',
    'public.future_production_dispatch_odds_v1(jsonb)',
    'public.read_published_odds_view(text,text)',
    'production_control.assert_annual_odds_runtime_v1(jsonb,text)',
    'production_control.current_annual_odds_inputs_v1(text,text,jsonb,boolean)',
    'production_control.current_annual_odds_inputs_before_pairing_context_v1(text,text,jsonb,boolean)',
    'production_control.annual_odds_pairing_fingerprint_v1(text)',
    'production_control.materialize_future_annual_odds_inputs_v1(jsonb,jsonb)',
    'public.synchronize_production_future_annual_projection_v1(jsonb)',
    'public.synchronize_production_future_annual_projection_before_odds_v1(jsonb)',
    'production_control.assert_annual_odds_job_scope_v1(jsonb,text,scoring_authority.odds_calculation_jobs)',
    'production_control.annual_odds_publication_projection_v1(text)',
    'production_control.publish_annual_odds_v1(jsonb,text)'
  ];
  net_skins_signatures constant text[] := array[
    'public.future_production_configure_net_skins_v1(jsonb)',
    'public.future_production_enqueue_net_skins_recalculation_v1(jsonb)',
    'public.future_production_claim_net_skins_recalculation_v1(jsonb)',
    'public.future_production_complete_net_skins_recalculation_v1(jsonb)',
    'public.future_production_fail_net_skins_recalculation_v1(jsonb)',
    'production_control.assert_annual_net_skins_v1(jsonb,text)',
    'production_control.read_annual_net_skins_v1(text)',
    'production_control.build_annual_net_skins_v1_manifest(text,integer[])',
    'production_control.enqueue_annual_net_skins_v1_round(text,uuid,integer,text,text)',
    'production_control.normalize_annual_net_skins_v1_official_result(text,integer,jsonb)',
    'scoring_authority.enqueue_annual_net_skins_v1_change()'
  ];
  calcutta_signatures constant text[] := array[
    'public.future_production_configure_calcutta_v1(jsonb)',
    'public.future_production_replace_calcutta_auction_facts_v1(jsonb)',
    'public.future_production_publish_calcutta_v1(jsonb)',
    'public.future_production_unpublish_calcutta_v1(jsonb)',
    'public.future_production_enqueue_calcutta_recalculation_v1(jsonb)',
    'public.future_production_claim_calcutta_recalculation_v1(jsonb)',
    'public.future_production_complete_calcutta_recalculation_v1(jsonb)',
    'public.future_production_fail_calcutta_recalculation_v1(jsonb)',
    'public.future_production_inspect_calcutta_v1(jsonb)',
    'public.future_production_resolve_calcutta_postcommit_match_v1(jsonb)',
    'public.resolve_production_calcutta_postcommit_match_v1(jsonb)',
    'production_control.assert_annual_calcutta_runtime_v1(jsonb,text)',
    'production_control.annual_calcutta_resource_fingerprint_v1(text,uuid)',
    'production_control.build_annual_calcutta_v1_configuration(jsonb,text)',
    'production_control.build_annual_calcutta_v1_auction(jsonb,text)',
    'production_control.enqueue_annual_calcutta_v1(text,uuid,bigint,text,text,boolean,text,text)',
    'production_control.mutate_annual_calcutta_publication_v1(jsonb,boolean)',
    'production_control.project_annual_calcutta_v1_result(text,jsonb)',
    'production_control.validate_annual_calcutta_v1_result(text,text,jsonb)',
    'production_control.project_production_calcutta_v1_result(jsonb)',
    'production_control.project_production_calcutta_v1_result_frozen_2026_v1(jsonb)',
    'production_control.read_annual_calcutta_v1(text,text)',
    'scoring_authority.enqueue_production_calcutta_v1_change()'
  ];
  odds_manifest jsonb;
  net_skins_manifest jsonb;
  calcutta_manifest jsonb;
  core_runtime_manifest jsonb;
  core_runtime_count integer;
  secure_core_runtime_count integer;
  odds_operations jsonb;
  net_skins_operations jsonb;
  calcutta_operations jsonb;
  annual_target_manifest jsonb;
  annual_target_count integer;
  enabled_target_count integer;
  exposed_target_count integer;
  dispatcher_manifest jsonb;
  dispatcher_is_security_definer boolean;
  dispatcher_has_fixed_path boolean;
  dispatcher_anon_execute boolean;
  dispatcher_authenticated_execute boolean;
  dispatcher_service_execute boolean;
begin
  -- The side-game certificate is also the final release gate for the central
  -- annual resolver/assertion chain. Bind both sides of every wrapper added by
  -- this migration: otherwise a post-certification replacement of the
  -- predecessor can preserve the wrapper body while changing what PREPARE,
  -- scoring, or ACTIVATE actually proves. Raw pg_proc evidence and effective
  -- privileges are retained in deterministic signature order.
  with expected as (
    select requested.signature, requested.ordinality,
      core_runtime_volatility[requested.ordinality::integer]
        as expected_volatility
    from pg_catalog.unnest(core_runtime_signatures) with ordinality
      requested(signature, ordinality)
  )
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'signature', expected.signature,
      'source', procedure_value.prosrc,
      'securityDefiner', procedure_value.prosecdef,
      'volatility', procedure_value.provolatile::text,
      'configuration', coalesce(
        pg_catalog.to_jsonb(procedure_value.proconfig), '[]'::jsonb
      ),
      'acl', coalesce(
        pg_catalog.to_jsonb(procedure_value.proacl), '[]'::jsonb
      ),
      'definitionFingerprint', production_control.future_runtime_hash_v2(
        pg_catalog.jsonb_build_object(
          'source', procedure_value.prosrc,
          'securityDefiner', procedure_value.prosecdef,
          'volatility', procedure_value.provolatile::text,
          'configuration', coalesce(
            pg_catalog.to_jsonb(procedure_value.proconfig), '[]'::jsonb
          ),
          'acl', coalesce(
            pg_catalog.to_jsonb(procedure_value.proacl), '[]'::jsonb
          )
        )
      ),
      'effectiveExecute', pg_catalog.jsonb_build_object(
        'anon', pg_catalog.has_function_privilege(
          'anon', procedure_value.oid, 'EXECUTE'
        ),
        'authenticated', pg_catalog.has_function_privilege(
          'authenticated', procedure_value.oid, 'EXECUTE'
        ),
        'serviceRole', pg_catalog.has_function_privilege(
          'service_role', procedure_value.oid, 'EXECUTE'
        )
      )
    ) order by expected.ordinality),
    pg_catalog.count(procedure_value.oid)::integer,
    pg_catalog.count(*) filter (where
      procedure_value.oid is not null
      and procedure_value.prosecdef
      and procedure_value.provolatile::text = expected.expected_volatility
      and coalesce(
        procedure_value.proconfig, array[]::text[]
      ) = array['search_path=pg_catalog']::text[]
      and not pg_catalog.has_function_privilege(
        'anon', procedure_value.oid, 'EXECUTE'
      )
      and not pg_catalog.has_function_privilege(
        'authenticated', procedure_value.oid, 'EXECUTE'
      )
      and not pg_catalog.has_function_privilege(
        'service_role', procedure_value.oid, 'EXECUTE'
      )
    )::integer
  into core_runtime_manifest, core_runtime_count,
    secure_core_runtime_count
  from expected
  left join pg_catalog.pg_proc procedure_value
    on procedure_value.oid = pg_catalog.to_regprocedure(expected.signature);

  if core_runtime_count <> pg_catalog.cardinality(core_runtime_signatures)
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_CORE_RUNTIME_IMPLEMENTATION_REQUIRED';
  end if;
  if secure_core_runtime_count <>
       pg_catalog.cardinality(core_runtime_signatures) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_CORE_RUNTIME_SECURITY_REQUIRED';
  end if;

  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'signature', requested.signature,
    'definitionFingerprint', production_control.future_runtime_hash_v2(
      pg_catalog.jsonb_build_object(
        'source', procedure_value.prosrc,
        'securityDefiner', procedure_value.prosecdef,
        'volatility', procedure_value.provolatile::text,
        'configuration', coalesce(
          pg_catalog.to_jsonb(procedure_value.proconfig), '[]'::jsonb
        ),
        'acl', coalesce(
          pg_catalog.to_jsonb(procedure_value.proacl), '[]'::jsonb
        )
      )
    )
  ) order by requested.ordinality) into odds_manifest
  from pg_catalog.unnest(odds_signatures) with ordinality
    requested(signature, ordinality)
  join pg_catalog.pg_proc procedure_value
    on procedure_value.oid = pg_catalog.to_regprocedure(requested.signature);

  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'signature', requested.signature,
    'definitionFingerprint', production_control.future_runtime_hash_v2(
      pg_catalog.jsonb_build_object(
        'source', procedure_value.prosrc,
        'securityDefiner', procedure_value.prosecdef,
        'volatility', procedure_value.provolatile::text,
        'configuration', coalesce(
          pg_catalog.to_jsonb(procedure_value.proconfig), '[]'::jsonb
        ),
        'acl', coalesce(
          pg_catalog.to_jsonb(procedure_value.proacl), '[]'::jsonb
        )
      )
    )
  ) order by requested.ordinality) into net_skins_manifest
  from pg_catalog.unnest(net_skins_signatures) with ordinality
    requested(signature, ordinality)
  join pg_catalog.pg_proc procedure_value
    on procedure_value.oid = pg_catalog.to_regprocedure(requested.signature);

  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'signature', requested.signature,
    'definitionFingerprint', production_control.future_runtime_hash_v2(
      pg_catalog.jsonb_build_object(
        'source', procedure_value.prosrc,
        'securityDefiner', procedure_value.prosecdef,
        'volatility', procedure_value.provolatile::text,
        'configuration', coalesce(
          pg_catalog.to_jsonb(procedure_value.proconfig), '[]'::jsonb
        ),
        'acl', coalesce(
          pg_catalog.to_jsonb(procedure_value.proacl), '[]'::jsonb
        )
      )
    )
  ) order by requested.ordinality) into calcutta_manifest
  from pg_catalog.unnest(calcutta_signatures) with ordinality
    requested(signature, ordinality)
  join pg_catalog.pg_proc procedure_value
    on procedure_value.oid = pg_catalog.to_regprocedure(requested.signature);

  if pg_catalog.jsonb_array_length(coalesce(odds_manifest, '[]'::jsonb))
       <> pg_catalog.cardinality(odds_signatures)
     or pg_catalog.jsonb_array_length(
       coalesce(net_skins_manifest, '[]'::jsonb)
     ) <> pg_catalog.cardinality(net_skins_signatures)
     or pg_catalog.jsonb_array_length(
       coalesce(calcutta_manifest, '[]'::jsonb)
     ) <> pg_catalog.cardinality(calcutta_signatures) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_SIDE_GAME_IMPLEMENTATION_REQUIRED';
  end if;

  -- Direct annual targets accept the operation name as part of their bounded
  -- dispatcher input. They must therefore never be executable by an API role:
  -- only the generic dispatcher may be exposed to service_role. Use effective
  -- privilege checks so role-membership or PUBLIC grants cannot be hidden by
  -- hashing the raw ACL alone.
  select pg_catalog.count(*)::integer into enabled_target_count
  from production_control.annual_scoring_rpc_allowlist_v1 value
  where value.enabled;
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'operation', allowlist.operation_name,
      'target', allowlist.target_rpc,
      'securityDefiner', procedure_value.prosecdef,
      'configuration', coalesce(
        pg_catalog.to_jsonb(procedure_value.proconfig), '[]'::jsonb
      ),
      'definitionFingerprint', production_control.future_runtime_hash_v2(
        pg_catalog.jsonb_build_object(
          'source', procedure_value.prosrc,
          'securityDefiner', procedure_value.prosecdef,
          'volatility', procedure_value.provolatile::text,
          'configuration', coalesce(
            pg_catalog.to_jsonb(procedure_value.proconfig), '[]'::jsonb
          ),
          'acl', coalesce(
            pg_catalog.to_jsonb(procedure_value.proacl), '[]'::jsonb
          )
        )
      ),
      'effectiveExecute', pg_catalog.jsonb_build_object(
        'anon', pg_catalog.has_function_privilege(
          'anon', procedure_value.oid, 'EXECUTE'
        ),
        'authenticated', pg_catalog.has_function_privilege(
          'authenticated', procedure_value.oid, 'EXECUTE'
        ),
        'serviceRole', pg_catalog.has_function_privilege(
          'service_role', procedure_value.oid, 'EXECUTE'
        )
      )
    ) order by allowlist.operation_name),
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (where
      pg_catalog.has_function_privilege(
        'anon', procedure_value.oid, 'EXECUTE'
      ) or pg_catalog.has_function_privilege(
        'authenticated', procedure_value.oid, 'EXECUTE'
      ) or pg_catalog.has_function_privilege(
        'service_role', procedure_value.oid, 'EXECUTE'
      )
    )::integer
  into annual_target_manifest, annual_target_count, exposed_target_count
  from production_control.annual_scoring_rpc_allowlist_v1 allowlist
  join pg_catalog.pg_proc procedure_value on procedure_value.oid =
    pg_catalog.to_regprocedure(allowlist.target_rpc || '(jsonb)')
  where allowlist.enabled;

  select pg_catalog.jsonb_build_object(
      'signature',
        'public.dispatch_production_annual_scoring_v1(jsonb)',
      'securityDefiner', procedure_value.prosecdef,
      'configuration', coalesce(
        pg_catalog.to_jsonb(procedure_value.proconfig), '[]'::jsonb
      ),
      'definitionFingerprint', production_control.future_runtime_hash_v2(
        pg_catalog.jsonb_build_object(
          'source', procedure_value.prosrc,
          'securityDefiner', procedure_value.prosecdef,
          'volatility', procedure_value.provolatile::text,
          'configuration', coalesce(
            pg_catalog.to_jsonb(procedure_value.proconfig), '[]'::jsonb
          ),
          'acl', coalesce(
            pg_catalog.to_jsonb(procedure_value.proacl), '[]'::jsonb
          )
        )
      ),
      'effectiveExecute', pg_catalog.jsonb_build_object(
        'anon', pg_catalog.has_function_privilege(
          'anon', procedure_value.oid, 'EXECUTE'
        ),
        'authenticated', pg_catalog.has_function_privilege(
          'authenticated', procedure_value.oid, 'EXECUTE'
        ),
        'serviceRole', pg_catalog.has_function_privilege(
          'service_role', procedure_value.oid, 'EXECUTE'
        )
      )
    ), procedure_value.prosecdef,
    coalesce(procedure_value.proconfig, array[]::text[])
      @> array['search_path=pg_catalog']::text[],
    pg_catalog.has_function_privilege(
      'anon', procedure_value.oid, 'EXECUTE'
    ),
    pg_catalog.has_function_privilege(
      'authenticated', procedure_value.oid, 'EXECUTE'
    ),
    pg_catalog.has_function_privilege(
      'service_role', procedure_value.oid, 'EXECUTE'
    )
  into dispatcher_manifest, dispatcher_is_security_definer,
    dispatcher_has_fixed_path, dispatcher_anon_execute,
    dispatcher_authenticated_execute, dispatcher_service_execute
  from pg_catalog.pg_proc procedure_value
  where procedure_value.oid = pg_catalog.to_regprocedure(
    'public.dispatch_production_annual_scoring_v1(jsonb)'
  );

  if annual_target_count is distinct from enabled_target_count
     or exposed_target_count <> 0
     or dispatcher_manifest is null
     or dispatcher_is_security_definer is not true
     or dispatcher_has_fixed_path is not true
     or dispatcher_anon_execute is not false
     or dispatcher_authenticated_execute is not false
     or dispatcher_service_execute is not true then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_DISPATCH_PRIVILEGE_TOPOLOGY_REQUIRED';
  end if;

  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'operation', value.operation_name,
    'target', value.target_rpc,
    'phase', value.required_phase,
    'class', value.operation_class,
    'worker', value.required_worker
  ) order by value.operation_name) into odds_operations
  from production_control.annual_scoring_rpc_allowlist_v1 value
  where value.operation_name = 'dispatch_production_annual_odds_v1'
    and value.enabled;

  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'operation', value.operation_name,
    'target', value.target_rpc,
    'phase', value.required_phase,
    'class', value.operation_class,
    'worker', value.required_worker
  ) order by value.operation_name) into net_skins_operations
  from production_control.annual_scoring_rpc_allowlist_v1 value
  where value.operation_name in (
    'configure_production_net_skins_v1',
    'enqueue_production_net_skins_v1_recalculation',
    'claim_production_net_skins_v1_recalculation',
    'complete_production_net_skins_v1_recalculation',
    'fail_production_net_skins_v1_recalculation'
  ) and value.enabled;

  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'operation', value.operation_name,
    'target', value.target_rpc,
    'phase', value.required_phase,
    'class', value.operation_class,
    'worker', value.required_worker
  ) order by value.operation_name) into calcutta_operations
  from production_control.annual_scoring_rpc_allowlist_v1 value
  where value.operation_name in (
    'configure_production_calcutta_v1',
    'replace_production_calcutta_v1_auction_facts',
    'publish_production_calcutta_v1',
    'unpublish_production_calcutta_v1',
    'enqueue_production_calcutta_v1_recalculation',
    'claim_production_calcutta_v1_recalculation',
    'complete_production_calcutta_v1_recalculation',
    'fail_production_calcutta_v1_recalculation',
    'inspect_production_calcutta_v1',
    'resolve_production_calcutta_postcommit_match_v1'
  ) and value.enabled;

  if pg_catalog.jsonb_array_length(coalesce(odds_operations, '[]'::jsonb)) <> 1
     or pg_catalog.jsonb_array_length(
       coalesce(net_skins_operations, '[]'::jsonb)
     ) <> 5
     or pg_catalog.jsonb_array_length(
       coalesce(calcutta_operations, '[]'::jsonb)
     ) <> 10 then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_SIDE_GAME_ALLOWLIST_REQUIRED';
  end if;

  return pg_catalog.jsonb_build_object(
    'contractVersion', 'production-annual-side-game-implementation-v1',
    'coreRuntime', pg_catalog.jsonb_build_object(
      'contractVersion', 'production-annual-core-runtime-manifest-v1',
      'functions', core_runtime_manifest
    ),
    'annualDispatchSecurity', pg_catalog.jsonb_build_object(
      'contractVersion', 'production-annual-dispatch-privileges-v1',
      'dispatcher', dispatcher_manifest,
      'targets', annual_target_manifest
    ),
    'odds', pg_catalog.jsonb_build_object(
      'functions', odds_manifest,
      'annualDispatcher', odds_operations,
      'operations', (
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'operation', value.operation_name,
          'class', value.operation_class,
          'enabled', value.enabled
        ) order by value.operation_name)
        from production_control.annual_odds_operation_allowlist_v1 value
      )
    ),
    'netSkins', pg_catalog.jsonb_build_object(
      'functions', net_skins_manifest,
      'operations', net_skins_operations
    ),
    'calcutta', pg_catalog.jsonb_build_object(
      'functions', calcutta_manifest,
      'operations', calcutta_operations
    )
  );
end;
$annual_side_game_manifest$;

revoke all on function
  production_control.annual_side_game_implementation_manifest_v1()
  from public, anon, authenticated, service_role;

create function production_control.ensure_annual_side_game_runtime_v1(
  target_tournament_id text,
  expected_runtime_generation_id uuid,
  expected_authority_generation_id uuid,
  expected_admission_generation_id uuid,
  allow_binding boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $ensure_annual_side_game_runtime$
declare
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  catalog production_control.future_tournament_catalog_v1%rowtype;
  resource production_control.future_tournament_resources_v1%rowtype;
  scope production_control.resource_scope%rowtype;
  promotion production_control.future_runtime_promotions_v2%rowtype;
  writer production_control.future_google_writer_targets_v2%rowtype;
  retained
    production_control.annual_side_game_runtime_certifications_v1%rowtype;
  implementation_manifest_value jsonb;
  resource_manifest_value jsonb;
  implementation_fingerprint_value text;
  resource_fingerprint_value text;
  certification_fingerprint_value text;
begin
  if target_tournament_id is null or target_tournament_id = '2026' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_SIDE_GAME_RUNTIME_REQUIRED';
  end if;
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.tournament_id = target_tournament_id
    and value.runtime_generation_id = expected_runtime_generation_id;
  select value.* into strict catalog
  from production_control.future_tournament_catalog_v1 value
  where value.tournament_id = target_tournament_id;
  select value.* into strict resource
  from production_control.future_tournament_resources_v1 value
  where value.tournament_id = target_tournament_id;
  select value.* into strict scope
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict promotion
  from production_control.future_runtime_promotions_v2 value
  where value.tournament_id = target_tournament_id;
  select value.* into strict writer
  from production_control.future_google_writer_targets_v2 value
  where value.tournament_id = target_tournament_id
    and value.contract_status = 'CERTIFIED';

  implementation_manifest_value :=
    production_control.annual_side_game_implementation_manifest_v1();
  implementation_fingerprint_value :=
    production_control.future_runtime_hash_v2(
      implementation_manifest_value
    );
  resource_manifest_value := pg_catalog.jsonb_build_object(
    'contractVersion', 'production-annual-side-game-resource-v1',
    'environment', 'PRODUCTION',
    'projectRef', resource.project_ref,
    'projectUrl', resource.project_url,
    'sourceWorkbookId', resource.source_workbook_id,
    'tournamentId', target_tournament_id,
    'tournamentYear', catalog.tournament_year,
    'resourceRevision', resource.resource_revision,
    'promotionRevision', promotion.promotion_revision,
    'promotionFingerprint', promotion.promoted_manifest_fingerprint,
    'runtimeGenerationId', generation.runtime_generation_id,
    'pointerRevision', generation.pointer_revision,
    'authorityGenerationId', generation.authority_generation_id,
    'admissionGenerationId', generation.admission_generation_id,
    'googleWriterGenerationId', writer.writer_generation_id,
    'googleTargetFingerprint', writer.target_contract_fingerprint
  );
  resource_fingerprint_value :=
    production_control.future_runtime_hash_v2(resource_manifest_value);
  certification_fingerprint_value :=
    production_control.future_runtime_hash_v2(
      pg_catalog.jsonb_build_object(
        'contractVersion', 'production-annual-side-game-runtime-v1',
        'resourceFingerprint', resource_fingerprint_value,
        'implementationFingerprint', implementation_fingerprint_value
      )
    );

  if generation.authority_generation_id is distinct from
       expected_authority_generation_id
     or generation.admission_generation_id is distinct from
       expected_admission_generation_id
     or resource.project_ref is distinct from scope.project_ref
     or resource.project_url is distinct from scope.project_url
     or resource.resource_status <> 'CURRENT_RESOURCE_BOUND'
     or resource.source_workbook_id is null
     or resource.source_workbook_id is distinct from
       writer.destination_workbook_id
     or promotion.runtime_status not in ('READY', 'ACTIVE')
     or generation.generation_status not in ('PREPARED', 'ACTIVE')
     or catalog.lifecycle not in ('READY_FOR_ACTIVATION', 'ACTIVE') then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_SIDE_GAME_RUNTIME_REQUIRED';
  end if;

  select value.* into retained
  from production_control.annual_side_game_runtime_certifications_v1 value
  where value.runtime_generation_id = generation.runtime_generation_id
    and value.admission_generation_id = generation.admission_generation_id;
  if retained.runtime_generation_id is null then
    if not allow_binding
       or generation.generation_status not in ('PREPARED', 'ACTIVE') then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_ANNUAL_SIDE_GAME_CERTIFICATION_REQUIRED';
    end if;
    insert into production_control.annual_side_game_runtime_certifications_v1 (
      runtime_generation_id, contract_version, tournament_id,
      pointer_revision, authority_generation_id, admission_generation_id,
      project_ref, project_url, source_workbook_id, resource_revision,
      resource_fingerprint, implementation_manifest,
      implementation_fingerprint, certification_fingerprint
    ) values (
      generation.runtime_generation_id,
      'production-annual-side-game-runtime-v1', target_tournament_id,
      generation.pointer_revision, generation.authority_generation_id,
      generation.admission_generation_id, resource.project_ref,
      resource.project_url, resource.source_workbook_id,
      resource.resource_revision, resource_fingerprint_value,
      implementation_manifest_value, implementation_fingerprint_value,
      certification_fingerprint_value
    ) returning * into retained;
  end if;

  if retained.contract_version <> 'production-annual-side-game-runtime-v1'
     or retained.tournament_id <> target_tournament_id
     or retained.pointer_revision <> generation.pointer_revision
     or retained.authority_generation_id is distinct from
       generation.authority_generation_id
     or retained.admission_generation_id is distinct from
       generation.admission_generation_id
     or retained.project_ref is distinct from resource.project_ref
     or retained.project_url is distinct from resource.project_url
     or retained.source_workbook_id is distinct from
       resource.source_workbook_id
     or retained.resource_revision <> resource.resource_revision
     or retained.resource_fingerprint is distinct from
       resource_fingerprint_value
     or retained.implementation_manifest is distinct from
       implementation_manifest_value
     or retained.implementation_fingerprint is distinct from
       implementation_fingerprint_value
     or retained.certification_fingerprint is distinct from
       certification_fingerprint_value then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_SIDE_GAME_CERTIFICATION_REQUIRED';
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'contractVersion', retained.contract_version,
    'tournamentId', retained.tournament_id,
    'runtimeGenerationId', retained.runtime_generation_id,
    'resourceFingerprint', retained.resource_fingerprint,
    'implementationFingerprint', retained.implementation_fingerprint,
    'certificationFingerprint', retained.certification_fingerprint
  );
exception
  when no_data_found or invalid_text_representation
    or numeric_value_out_of_range then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_SIDE_GAME_RUNTIME_REQUIRED';
end;
$ensure_annual_side_game_runtime$;

revoke all on function
  production_control.ensure_annual_side_game_runtime_v1(
    text, uuid, uuid, uuid, boolean
  ) from public, anon, authenticated, service_role;

-- A precommit abort after a future predecessor has been closed must rotate its
-- admission generation before reopening admission. Preserve the original
-- immutable certificate and derive one additional certificate for that exact
-- rotated generation inside the same locked transaction. This helper is not a
-- public re-certification API: it requires the current ACTIVE pointer/runtime,
-- the exact prior certified generation, the already-rebound identity context,
-- and the already-reopened annual authority row.
create function production_control.rebind_annual_side_game_admission_generation_v1(
  target_tournament_id text,
  target_runtime_generation_id uuid,
  target_authority_generation_id uuid,
  prior_admission_generation_id uuid,
  target_admission_generation_id uuid,
  target_pointer_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $rebind_annual_side_game_admission_generation$
declare
  pointer production_control.current_tournament_pointer_v1%rowtype;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  annual production_control.annual_scoring_runtime_authorities_v1%rowtype;
  identity_context
    participant_identity.future_tournament_identity_contexts_v1%rowtype;
  prior_certification
    production_control.annual_side_game_runtime_certifications_v1%rowtype;
  rebound jsonb;
begin
  perform production_control.assert_production_service_role();
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.tournament_id = target_tournament_id
    and value.runtime_generation_id = target_runtime_generation_id;
  select value.* into strict annual
  from production_control.annual_scoring_runtime_authorities_v1 value
  where value.tournament_id = target_tournament_id
    and value.runtime_generation_id = target_runtime_generation_id;
  select value.* into strict identity_context
  from participant_identity.future_tournament_identity_contexts_v1 value
  where value.tournament_id = target_tournament_id;
  select value.* into strict prior_certification
  from production_control.annual_side_game_runtime_certifications_v1 value
  where value.runtime_generation_id = target_runtime_generation_id
    and value.admission_generation_id = prior_admission_generation_id;

  if target_tournament_id = '2026'
     or target_admission_generation_id = prior_admission_generation_id
     or pointer.tournament_id <> target_tournament_id
     or pointer.pointer_revision <> target_pointer_revision
     or generation.generation_status <> 'ACTIVE'
     or generation.pointer_revision <> target_pointer_revision
     or generation.authority_generation_id is distinct from
       target_authority_generation_id
     or generation.admission_generation_id is distinct from
       target_admission_generation_id
     or annual.authority_status <> 'ACTIVE'
     or annual.admission_state <> 'OPEN'
     or annual.authority_generation_id is distinct from
       target_authority_generation_id
     or annual.admission_generation_id is distinct from
       target_admission_generation_id
     or identity_context.status <> 'CERTIFIED'
     or identity_context.runtime_generation_id is distinct from
       target_runtime_generation_id
     or identity_context.authority_generation_id is distinct from
       target_authority_generation_id
     or identity_context.admission_generation_id is distinct from
       target_admission_generation_id
     or identity_context.pointer_revision <> target_pointer_revision
     or prior_certification.tournament_id <> target_tournament_id
     or prior_certification.authority_generation_id is distinct from
       target_authority_generation_id then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_SIDE_GAME_ADMISSION_REBIND_REQUIRED';
  end if;

  rebound := production_control.ensure_annual_side_game_runtime_v1(
    target_tournament_id, target_runtime_generation_id,
    target_authority_generation_id, target_admission_generation_id, true
  );
  return rebound || pg_catalog.jsonb_build_object(
    'priorAdmissionGenerationId', prior_admission_generation_id,
    'admissionGenerationId', target_admission_generation_id,
    'rebound', true
  );
exception
  when no_data_found then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_SIDE_GAME_ADMISSION_REBIND_REQUIRED';
end;
$rebind_annual_side_game_admission_generation$;

revoke all on function
  production_control.rebind_annual_side_game_admission_generation_v1(
    text,uuid,uuid,uuid,uuid,bigint
  ) from public, anon, authenticated, service_role;

-- Bind the deterministic capability during PREPARE and re-prove it at DRAIN
-- and ACTIVATE. The predecessor function retains every existing scoring and
-- no-preactivation-fact predicate.
alter function production_control.assert_future_scoring_runtime_capability_v1(
  text, uuid, uuid, uuid
) rename to assert_future_scoring_runtime_capability_pre_side_games_v1;

create function production_control.assert_future_scoring_runtime_capability_v1(
  target_tournament_id text,
  expected_runtime_generation_id uuid,
  expected_authority_generation_id uuid,
  expected_admission_generation_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $assert_future_side_game_capability$
begin
  perform production_control
    .assert_future_scoring_runtime_capability_pre_side_games_v1(
      target_tournament_id, expected_runtime_generation_id,
      expected_authority_generation_id, expected_admission_generation_id
    );
  -- PREPARE, DRAIN, and ACTIVATE all reach this assertion while the annual
  -- transition holds the exclusive scoring-admission lock. Recompute the live
  -- SQL/ACL/trigger manifest here so a post-certification writer drift cannot
  -- survive until pointer commit.
  perform production_control
    .assert_future_google_writer_live_implementation_v2(
      target_tournament_id
    );
  perform production_control.ensure_annual_side_game_runtime_v1(
    target_tournament_id, expected_runtime_generation_id,
    expected_authority_generation_id, expected_admission_generation_id,
    true
  );
end;
$assert_future_side_game_capability$;

revoke all on function
  production_control.assert_future_scoring_runtime_capability_v1(
    text, uuid, uuid, uuid
  ) from public, anon, authenticated, service_role;
revoke all on function
  production_control.assert_future_scoring_runtime_capability_pre_side_games_v1(
    text, uuid, uuid, uuid
  ) from public, anon, authenticated, service_role;

-- Every future scoring/domain operation takes the existing shared admission
-- lock in the predecessor assertion and then re-proves the exact side-game
-- implementation/resource certificate before its target function executes.
alter function production_control.assert_annual_scoring_runtime_v1(
  jsonb, text, text
) rename to assert_annual_scoring_runtime_pre_side_games_v1;

create function production_control.assert_annual_scoring_runtime_v1(
  input jsonb,
  expected_operation text,
  required_worker text default null
)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $assert_annual_side_game_runtime$
declare
  target text;
begin
  target := production_control.assert_annual_scoring_runtime_pre_side_games_v1(
    input, expected_operation, required_worker
  );
  perform production_control.ensure_annual_side_game_runtime_v1(
    target, (input->>'expected_runtime_generation_id')::uuid,
    (input->>'expected_annual_authority_generation_id')::uuid,
    (input->>'expected_annual_admission_generation_id')::uuid,
    false
  );
  return target;
exception
  when invalid_text_representation then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_SIDE_GAME_RUNTIME_REQUIRED';
end;
$assert_annual_side_game_runtime$;

revoke all on function
  production_control.assert_annual_scoring_runtime_v1(jsonb, text, text)
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.assert_annual_scoring_runtime_pre_side_games_v1(
    jsonb, text, text
  ) from public, anon, authenticated, service_role;

-- Current participant/public reads use the same certified generation as
-- scoring, identity, and workers. Explicit historical reads remain untouched.
alter function production_control.assert_annual_current_read_v1(jsonb)
  rename to assert_annual_current_read_pre_side_games_v1;

create function production_control.assert_annual_current_read_v1(input jsonb)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $assert_annual_side_game_read$
declare
  target text;
begin
  target := production_control.assert_annual_current_read_pre_side_games_v1(
    input
  );
  perform production_control.ensure_annual_side_game_runtime_v1(
    target, (input->>'expected_runtime_generation_id')::uuid,
    (input->>'expected_annual_authority_generation_id')::uuid,
    (input->>'expected_annual_admission_generation_id')::uuid,
    false
  );
  return target;
exception
  when invalid_text_representation then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_SIDE_GAME_RUNTIME_REQUIRED';
end;
$assert_annual_side_game_read$;

revoke all on function
  production_control.assert_annual_current_read_v1(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.assert_annual_current_read_pre_side_games_v1(jsonb)
  from public, anon, authenticated, service_role;

-- A tournament cannot be replaced while a side-game worker can still publish
-- or persist a result for that predecessor. RUNNING rows remain blockers even
-- after lease expiry: recovery must explicitly return them to a terminal state.
alter function production_control.annual_scoring_predecessor_certificate_v1(text)
  rename to annual_scoring_predecessor_certificate_pre_side_games_v1;

create function production_control.annual_scoring_predecessor_certificate_v1(
  target_tournament_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $annual_side_game_close_certificate$
declare
  baseline jsonb;
  blockers jsonb;
  runtime_generation uuid;
  net_skins_unresolved integer;
  calcutta_unresolved integer;
  odds_unresolved integer;
  odds_mirror_rows integer;
  generation_mismatch integer;
  fingerprint_value text;
begin
  baseline := production_control
    .annual_scoring_predecessor_certificate_pre_side_games_v1(
      target_tournament_id
    );
  blockers := coalesce(baseline->'blockers', '[]'::jsonb);
  if target_tournament_id <> '2026' then
    select value.runtime_generation_id into runtime_generation
    from production_control.annual_scoring_runtime_authorities_v1 value
    where value.tournament_id = target_tournament_id;
  end if;

  select pg_catalog.count(*)::integer into net_skins_unresolved
  from scoring_authority.net_skins_v1_recalculation_jobs value
  where value.tournament_id = target_tournament_id
    and value.status not in ('SUCCEEDED', 'SUPERSEDED');
  select pg_catalog.count(*)::integer into calcutta_unresolved
  from scoring_authority.calcutta_v1_recalculation_jobs value
  where value.tournament_id = target_tournament_id
    and value.status not in ('SUCCEEDED', 'SUPERSEDED');
  select pg_catalog.count(*)::integer into odds_unresolved
  from scoring_authority.odds_calculation_jobs value
  where value.tournament_id = target_tournament_id
    and not (
      (value.status = 'FAILED'
        and value.publication_status = 'NOT_REQUESTED')
      or (value.status = 'SUPERSEDED'
        and value.publication_status = 'STALE')
      or (value.status = 'SUCCEEDED'
        and value.publication_status in ('PUBLISHED', 'REHEARSAL_ONLY'))
    );
  select pg_catalog.count(*)::integer into odds_mirror_rows
  from scoring_authority.odds_google_mirror_jobs value
  where value.tournament_id = target_tournament_id
    and value.status not in ('SUCCEEDED', 'SUPERSEDED');

  generation_mismatch := 0;
  if target_tournament_id <> '2026' then
    select (
      (select pg_catalog.count(*)
       from scoring_authority.net_skins_v1_recalculation_jobs value
       where value.tournament_id = target_tournament_id
         and value.status not in ('SUCCEEDED', 'SUPERSEDED')
         and value.runtime_generation_id is distinct from runtime_generation)
      +
      (select pg_catalog.count(*)
       from scoring_authority.calcutta_v1_recalculation_jobs value
       where value.tournament_id = target_tournament_id
         and value.status not in ('SUCCEEDED', 'SUPERSEDED')
         and value.runtime_generation_id is distinct from runtime_generation)
      +
      (select pg_catalog.count(*)
       from scoring_authority.odds_calculation_jobs value
       where value.tournament_id = target_tournament_id
         and not (
           (value.status = 'FAILED'
             and value.publication_status = 'NOT_REQUESTED')
           or (value.status = 'SUPERSEDED'
             and value.publication_status = 'STALE')
           or (value.status = 'SUCCEEDED'
             and value.publication_status in ('PUBLISHED', 'REHEARSAL_ONLY'))
         )
         and value.runtime_generation_id is distinct from runtime_generation)
      +
      (select pg_catalog.count(*)
       from scoring_authority.odds_google_mirror_jobs value
       where value.tournament_id = target_tournament_id
         and value.status not in ('SUCCEEDED', 'SUPERSEDED')
         and value.runtime_generation_id is distinct from runtime_generation)
    )::integer into generation_mismatch;
  end if;

  if net_skins_unresolved <> 0 then
    blockers := blockers || pg_catalog.jsonb_build_array(
      'PREDECESSOR_NET_SKINS_DRAIN_INCOMPLETE'
    );
  end if;
  if calcutta_unresolved <> 0 then
    blockers := blockers || pg_catalog.jsonb_build_array(
      'PREDECESSOR_CALCUTTA_DRAIN_INCOMPLETE'
    );
  end if;
  if odds_unresolved <> 0 then
    blockers := blockers || pg_catalog.jsonb_build_array(
      'PREDECESSOR_ODDS_DRAIN_INCOMPLETE'
    );
  end if;
  if odds_mirror_rows <> 0 then
    blockers := blockers || pg_catalog.jsonb_build_array(
      'PREDECESSOR_ODDS_RETIRED_MIRROR_PRESENT'
    );
  end if;
  if generation_mismatch <> 0 then
    blockers := blockers || pg_catalog.jsonb_build_array(
      'PREDECESSOR_SIDE_GAME_GENERATION_MISMATCH'
    );
  end if;

  fingerprint_value := production_control.future_runtime_hash_v2(
    pg_catalog.jsonb_build_object(
      'contractVersion',
        'production-annual-scoring-side-game-close-certificate-v1',
      'baselineFingerprint', baseline->>'fingerprint',
      'tournamentId', target_tournament_id,
      'runtimeGenerationId', runtime_generation,
      'netSkinsUnresolved', net_skins_unresolved,
      'calcuttaUnresolved', calcutta_unresolved,
      'oddsUnresolved', odds_unresolved,
      'oddsMirrorRows', odds_mirror_rows,
      'generationMismatch', generation_mismatch,
      'blockers', blockers
    )
  );
  return baseline || pg_catalog.jsonb_build_object(
    'certified', pg_catalog.jsonb_array_length(blockers) = 0,
    'fingerprint', fingerprint_value,
    'blockers', blockers,
    'sideGameDrain', pg_catalog.jsonb_build_object(
      'runtimeGenerationId', runtime_generation,
      'netSkinsUnresolved', net_skins_unresolved,
      'calcuttaUnresolved', calcutta_unresolved,
      'oddsUnresolved', odds_unresolved,
      'oddsMirrorRows', odds_mirror_rows,
      'generationMismatch', generation_mismatch
    )
  );
end;
$annual_side_game_close_certificate$;

revoke all on function
  production_control.annual_scoring_predecessor_certificate_v1(text)
  from public, anon, authenticated, service_role;
revoke all on function
  production_control
    .annual_scoring_predecessor_certificate_pre_side_games_v1(text)
  from public, anon, authenticated, service_role;

-- Installation must not bind a future generation or disturb the frozen 2026
-- pointer/runtime. The table can become non-empty only inside PREPARE.
do $annual_side_game_install_inert$
begin
  if exists (
       select 1
       from production_control.annual_side_game_runtime_certifications_v1
     ) or not exists (
       select 1 from production_control.current_tournament_pointer_v1 value
       where value.scope_key = 'BAGGER_INV_PRODUCTION'
         and value.tournament_id = '2026'
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_SIDE_GAME_INSTALL_NOT_INERT';
  end if;
end;
$annual_side_game_install_inert$;

comment on table
  production_control.annual_side_game_runtime_certifications_v1 is
  'Immutable server-derived Odds, Net Skins, and Calcutta implementation/resource certification for one future annual runtime generation.';
comment on function
  production_control.annual_scoring_predecessor_certificate_v1(text) is
  'Annual predecessor close certificate including exact scoring, mirror/archive, Odds, Net Skins, and Calcutta drain state.';

notify pgrst, 'reload schema';
commit;
