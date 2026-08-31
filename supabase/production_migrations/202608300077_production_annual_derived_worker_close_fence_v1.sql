-- Step 13E.7B annual derived-worker close fence V1.
--
-- Installation is inert. It wraps the six frozen-2026 competition and
-- intelligence worker mutations with the same pointer/admission lock used by
-- annual scoring dispatch. It also prevents predecessor admission from
-- closing while any derived job is pending or running, and includes that
-- exact queue state in the final predecessor certificate. No job, snapshot,
-- score, tournament, pointer, authority, or worker state is changed here.
begin;

-- 076 is deliberately inert, so its implementation manifest may be extended
-- before the first future runtime is prepared. Refuse installation rather
-- than changing the meaning of already-retained certification evidence.
do $derived_worker_install_precondition$
begin
  if exists (
    select 1
    from production_control.annual_side_game_runtime_certifications_v1
  ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_SIDE_GAME_CERTIFICATION_ALREADY_BOUND';
  end if;
end;
$derived_worker_install_precondition$;

-- Annual administration keeps the immutable Step-12 project/workbook as its
-- platform root, but authorizes the actor against the pointer-selected current
-- tournament. Holding the same shared admission lock as scoring makes that
-- identity decision stable through the complete caller transaction. The
-- target future tournament remains a separately validated input.
create function production_control.assert_annual_future_admin_scope_v1(
  input jsonb,
  required_contract text,
  require_director boolean default true,
  require_owner boolean default false
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $annual_future_admin_scope$
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
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_FUTURE_RUNTIME_EXACT_RESOURCE_REQUIRED';
end;
$annual_future_admin_scope$;

/*
 * The following predicates are deliberately expressed above as two separate
 * authorization branches. A global Owner is annual governance and is not
 * cloned into each tournament; an ordinary Director must have both the
 * pointer-year role and pointer-year entitlement. Keeping this note beside
 * the effective function prevents a future refactor from reintroducing the
 * impossible mixed-year conjunction.
 */

-- Migration 065's annual-administration guard and migration 069's preserved
-- activation guard were intentionally 2026-bound. Replace only those internal
-- assertions; public operation names, inputs, revisions and receipts remain
-- unchanged, while 2027 -> 2028 can authorize against the locked 2027 pointer.
create or replace function production_control.assert_future_year_runtime_v1(
  input jsonb,
  require_owner boolean default false
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $annual_future_year_scope$
begin
  perform production_control.assert_annual_future_admin_scope_v1(
    input, 'production-future-year-administration-v1', true, require_owner
  );
end;
$annual_future_year_scope$;

create or replace function production_control
  .assert_future_runtime_service_scope_v2_pre_annual_scoring_fence(
    input jsonb,
    require_director boolean default true,
    require_owner boolean default false
  )
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $annual_future_runtime_scope$
begin
  perform production_control.assert_annual_future_admin_scope_v1(
    input, 'production-future-runtime-activation-v2',
    require_director, require_owner
  );
end;
$annual_future_runtime_scope$;

-- All frozen 2026 handicap, Players & Access, Access Governance, and
-- Tournament Setup mutations transitively use this assertion. Add the common
-- annual shared lock and pointer recheck once, preserving every installed
-- domain-specific predicate and response contract.
alter function production_control.assert_production_handicap_runtime()
  rename to assert_production_handicap_runtime_pre_annual_pointer_fence;

create function production_control.assert_production_handicap_runtime()
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $legacy_admin_pointer_fence$
declare
  pointer production_control.current_tournament_pointer_v1%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if pointer.tournament_id <> '2026' or pointer.tournament_year <> 2026 then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_HANDICAP_RUNTIME_NOT_SAFE';
  end if;
  perform production_control
    .assert_production_handicap_runtime_pre_annual_pointer_fence();
end;
$legacy_admin_pointer_fence$;

-- Annual future Director scoring requires an explicit current-tournament
-- DIRECTOR role plus the immutable Production root entitlement. Activation
-- creates the annual role but deliberately does not clone governance rows.
create or replace function production_control
  .assert_future_production_scoring_actor_v1(
    input jsonb,
    target_tournament text,
    require_director boolean default false
  )
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $annual_future_scoring_actor$
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
    .assert_future_participant_identity_runtime_v1();
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
$annual_future_scoring_actor$;

revoke all on function production_control
  .assert_annual_future_admin_scope_v1(jsonb,text,boolean,boolean)
  from public, anon, authenticated, service_role;
revoke all on function production_control
  .assert_future_year_runtime_v1(jsonb,boolean)
  from public, anon, authenticated, service_role;
revoke all on function production_control
  .assert_future_runtime_service_scope_v2_pre_annual_scoring_fence(
    jsonb,boolean,boolean
  ) from public, anon, authenticated, service_role;
revoke all on function production_control
  .assert_production_handicap_runtime()
  from public, anon, authenticated, service_role;
revoke all on function production_control
  .assert_production_handicap_runtime_pre_annual_pointer_fence()
  from public, anon, authenticated, service_role;
revoke all on function production_control
  .assert_future_production_scoring_actor_v1(jsonb,text,boolean)
  from public, anon, authenticated, service_role;

-- Function-body evidence alone cannot prove that scoring changes actually
-- dispatch side-game work. Extend the deterministic manifest with the nine
-- exact trigger bindings. Missing, disabled, rebound, or event/column-drifted
-- triggers fail before a future runtime can be certified or dispatched.
alter function production_control.annual_side_game_implementation_manifest_v1()
  rename to annual_side_game_implementation_manifest_pre_triggers_v1;

create function production_control.annual_side_game_implementation_manifest_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $annual_side_game_trigger_manifest$
declare
  baseline jsonb;
  trigger_manifest jsonb;
  derived_trigger_function_manifest jsonb;
  derived_trigger_function_secure boolean;
  valid_count integer;
begin
  baseline := production_control
    .annual_side_game_implementation_manifest_pre_triggers_v1();
  -- The trigger catalog proves where events are routed; separately retain the
  -- exact executable definition they reach. This closes the gap where all
  -- nine bindings remain intact while the shared trigger function body or
  -- privilege topology changes after certification.
  select pg_catalog.jsonb_build_object(
      'signature',
        'scoring_authority.enqueue_annual_derived_v1_change()',
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
    ),
    procedure_value.prosecdef
      and procedure_value.provolatile::text = 'v'
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
  into derived_trigger_function_manifest, derived_trigger_function_secure
  from pg_catalog.pg_proc procedure_value
  where procedure_value.oid = pg_catalog.to_regprocedure(
    'scoring_authority.enqueue_annual_derived_v1_change()'
  );
  if derived_trigger_function_manifest is null
     or derived_trigger_function_secure is not true then
    raise exception using errcode = '55000',
      message =
        'PRODUCTION_ANNUAL_DERIVED_TRIGGER_FUNCTION_SECURITY_REQUIRED';
  end if;

  with expected(
    ordinal, table_schema, table_name, trigger_name, target_function,
    trigger_type, update_columns
  ) as (values
    (1, 'scoring_authority', 'hole_scores',
      'production_annual_net_skins_v1_hole_score_recalculation',
      'scoring_authority.enqueue_annual_net_skins_v1_change()',
      29, array[]::text[]),
    (2, 'scoring_authority', 'matches',
      'production_annual_net_skins_v1_match_lifecycle_recalculation',
      'scoring_authority.enqueue_annual_net_skins_v1_change()',
      17, array[
        'finalized_at', 'match_revision', 'scorecard_complete', 'status'
      ]::text[]),
    (3, 'scoring_authority', 'hole_scores',
      'production_calcutta_v1_hole_score_recalculation',
      'scoring_authority.enqueue_production_calcutta_v1_change()',
      29, array[]::text[]),
    (4, 'scoring_authority', 'matches',
      'production_calcutta_v1_match_lifecycle_recalculation',
      'scoring_authority.enqueue_production_calcutta_v1_change()',
      17, array[
        'finalized_at', 'match_revision', 'result_winner',
        'scorecard_complete', 'status'
      ]::text[]),
    (5, 'scoring_authority', 'rounds',
      'production_calcutta_v1_round_lifecycle_recalculation',
      'scoring_authority.enqueue_production_calcutta_v1_change()',
      17, array['status']::text[]),
    (6, 'scoring_authority', 'hole_scores',
      'production_annual_derived_v1_hole_score_change',
      'scoring_authority.enqueue_annual_derived_v1_change()',
      29, array[]::text[]),
    (7, 'scoring_authority', 'matches',
      'production_annual_derived_v1_match_change',
      'scoring_authority.enqueue_annual_derived_v1_change()',
      17, array[
        'finalized_at', 'match_revision', 'result_winner',
        'scorecard_complete', 'status'
      ]::text[]),
    (8, 'scoring_authority', 'odds_published_snapshots',
      'production_annual_derived_v1_odds_publication_change',
      'scoring_authority.enqueue_annual_derived_v1_change()',
      21, array[
        'is_current_official', 'payload_hash', 'publication_revision'
      ]::text[]),
    (9, 'scoring_authority', 'net_skins_v1_result_revisions',
      'production_annual_derived_v1_net_skins_result_change',
      'scoring_authority.enqueue_annual_derived_v1_change()',
      21, array[
        'is_current', 'payload_hash', 'result_revision'
      ]::text[])
  ), actual as (
    select expected.*, trigger_value.oid as trigger_oid,
      trigger_value.tgenabled::text as enabled,
      trigger_value.tgtype::integer as actual_trigger_type,
      trigger_value.tgnargs::integer as actual_argument_count,
      trigger_value.tgqual is null as predicate_absent,
      trigger_value.tgconstraint = 0 as constraint_absent,
      not trigger_value.tgdeferrable as non_deferrable,
      not trigger_value.tginitdeferred as initially_immediate,
      procedure_value.oid::pg_catalog.regprocedure::text as actual_function,
      coalesce((
        select pg_catalog.array_agg(attribute_value.attname::text order by
          attribute_value.attname)
        from pg_catalog.unnest(
          trigger_value.tgattr::smallint[]
        ) as attribute_number(attnum)
        join pg_catalog.pg_attribute attribute_value
          on attribute_value.attrelid = trigger_value.tgrelid
         and attribute_value.attnum = attribute_number.attnum
      ), array[]::text[]) as actual_update_columns,
      case when trigger_value.oid is null then null
        else pg_catalog.pg_get_triggerdef(trigger_value.oid, true) end
        as definition
    from expected
    left join pg_catalog.pg_namespace namespace_value
      on namespace_value.nspname = expected.table_schema
    left join pg_catalog.pg_class table_value
      on table_value.relnamespace = namespace_value.oid
     and table_value.relname = expected.table_name
    left join pg_catalog.pg_trigger trigger_value
      on trigger_value.tgrelid = table_value.oid
     and trigger_value.tgname = expected.trigger_name
     and not trigger_value.tgisinternal
    left join pg_catalog.pg_proc procedure_value
      on procedure_value.oid = trigger_value.tgfoid
  ), projected as (
    select *, trigger_oid is not null and enabled = 'O'
      and actual_trigger_type = trigger_type
      and actual_argument_count = 0 and predicate_absent
      and constraint_absent and non_deferrable and initially_immediate
      and actual_function = target_function
      and actual_update_columns = update_columns as valid
    from actual
  )
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'table', table_schema || '.' || table_name,
      'trigger', trigger_name,
      'targetFunction', actual_function,
      'triggerType', actual_trigger_type,
      'argumentCount', actual_argument_count,
      'predicateAbsent', predicate_absent,
      'constraintAbsent', constraint_absent,
      'nonDeferrable', non_deferrable,
      'initiallyImmediate', initially_immediate,
      'updateColumns', actual_update_columns,
      'enabled', enabled,
      'definition', definition
    ) order by ordinal),
    pg_catalog.count(*) filter (where valid)::integer
  into trigger_manifest, valid_count
  from projected;
  if valid_count <> 9 then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_SIDE_GAME_TRIGGER_BINDING_REQUIRED';
  end if;
  return baseline || pg_catalog.jsonb_build_object(
    'derivedTriggerFunctionContract',
      'production-annual-derived-trigger-function-v1',
    'derivedTriggerFunction', derived_trigger_function_manifest,
    'triggerBindingContract',
      'production-annual-side-game-trigger-bindings-v1',
    'triggerBindings', trigger_manifest
  );
end;
$annual_side_game_trigger_manifest$;

revoke all on function
  production_control.annual_side_game_implementation_manifest_v1()
  from public, anon, authenticated, service_role;
revoke all on function production_control
  .annual_side_game_implementation_manifest_pre_triggers_v1()
  from public, anon, authenticated, service_role;

create function production_control.assert_frozen_2026_derived_worker_v1(
  input jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $frozen_derived_worker_scope$
declare
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
begin
  -- This assertion acquires and retains the shared scoring-admission lock,
  -- proves the pointer is still 2026, and preserves every installed resource,
  -- deployment, epoch, capability, authority, and admission predicate.
  perform production_control.assert_production_scoring_runtime(input, null);
  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if production_control.cutover_phase_rank(activation.read_cutover_phase)
       < production_control.cutover_phase_rank('WORKERS')
     or not resource.workers_enabled then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_DERIVED_WORKER_RUNTIME_REQUIRED';
  end if;
end;
$frozen_derived_worker_scope$;

-- Canonical scoring and official Odds changes create the derived dirty marker
-- inside the same transaction as the fact change. The shared annual admission
-- lock closes the application after-hook gap: CLOSE either observes these
-- PENDING rows or commits first and causes the source mutation to fail closed.
create function scoring_authority.enqueue_annual_derived_v1_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $annual_derived_change$
declare
  target_match text;
  target_tournament text;
  current_tournament text;
  runtime_generation uuid;
  reason_value text;
  revision_value jsonb;
  engine_values text[];
  engine_value text;
begin
  if tg_table_schema <> 'scoring_authority'
     or tg_table_name not in (
       'hole_scores', 'matches', 'odds_published_snapshots',
       'net_skins_v1_result_revisions'
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_DERIVED_TRIGGER_SCOPE_INVALID';
  end if;
  if tg_table_name = 'hole_scores' then
    target_match := case when tg_op = 'DELETE'
      then old.match_id else new.match_id end;
    select value.tournament_id into target_tournament
    from scoring_authority.matches value
    where value.match_id = target_match;
    reason_value := 'CANONICAL_HOLE_SCORE_CHANGED';
    revision_value := pg_catalog.jsonb_build_object(
      'matchId', target_match,
      'holeNumber', case when tg_op = 'DELETE'
        then old.hole_number else new.hole_number end,
      'holeRevision', case when tg_op = 'DELETE'
        then old.hole_revision else new.hole_revision end
    );
    engine_values := array[
      'TEAM_MOMENTUM', 'TOURNAMENT_STORYLINES',
      'TOURNAMENT_INTELLIGENCE', 'PROJECTION_EDITORIAL',
      'TOURNAMENT_FINAL_RECAP'
    ]::text[];
  elsif tg_table_name = 'matches' then
    target_match := new.match_id;
    target_tournament := new.tournament_id;
    reason_value := 'CANONICAL_MATCH_CHANGED';
    revision_value := pg_catalog.jsonb_build_object(
      'matchId', target_match,
      'matchRevision', new.match_revision,
      'status', new.status,
      'resultWinner', new.result_winner,
      'scorecardComplete', new.scorecard_complete
    );
    engine_values := array[
      'TEAM_MOMENTUM', 'TOURNAMENT_STORYLINES',
      'TOURNAMENT_INTELLIGENCE', 'PROJECTION_EDITORIAL',
      'TOURNAMENT_FINAL_RECAP'
    ]::text[];
  elsif tg_table_name = 'odds_published_snapshots' then
    target_tournament := new.tournament_id;
    reason_value := 'OFFICIAL_ODDS_PUBLICATION_CHANGED';
    revision_value := pg_catalog.jsonb_build_object(
      'publicationRevision', new.publication_revision,
      'payloadHash', new.payload_hash,
      'isCurrentOfficial', new.is_current_official
    );
    engine_values := array[
      'TOURNAMENT_INTELLIGENCE', 'PROJECTION_EDITORIAL',
      'TOURNAMENT_FINAL_RECAP'
    ]::text[];
  else
    if new.is_current is not true then
      return new;
    end if;
    target_tournament := new.tournament_id;
    reason_value := 'NET_SKINS_CURRENT_RESULT_CHANGED';
    revision_value := pg_catalog.jsonb_build_object(
      'roundNumber', new.round_number,
      'resultRevision', new.result_revision,
      'payloadHash', new.payload_hash,
      'isCurrent', new.is_current
    );
    engine_values := array['TOURNAMENT_STORYLINES']::text[];
  end if;
  if target_tournament is null then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_DERIVED_TRIGGER_TOURNAMENT_REQUIRED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  select value.tournament_id into strict current_tournament
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  -- Setup and historical corrections for a non-current tournament do not
  -- create current-runtime work. Their own activation preparation owns their
  -- future generation and readiness markers.
  if target_tournament <> current_tournament then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if target_tournament = '2026' then
    if not exists (
      select 1 from scoring_authority.ingress_gates value
      where value.tournament_id = '2026' and value.state = 'OPEN'
        and value.authority = 'SUPABASE'
    ) then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_ANNUAL_DERIVED_ADMISSION_CLOSED';
    end if;
  else
    select value.runtime_generation_id into runtime_generation
    from production_control.annual_scoring_runtime_authorities_v1 value
    where value.tournament_id = target_tournament
      and value.authority_status = 'ACTIVE'
      and value.admission_state = 'OPEN';
    if runtime_generation is null then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_ANNUAL_DERIVED_RUNTIME_REQUIRED';
    end if;
  end if;

  foreach engine_value in array engine_values loop
    insert into scoring_authority.competition_recalculation_jobs (
      tournament_id, round_number, engine_key, status,
      requested_source_revision, requested_at, started_at, completed_at,
      last_error_code, last_error_safe, runtime_generation_id,
      claim_token, claimed_by, lease_expires_at, updated_at
    ) values (
      target_tournament, 0, engine_value, 'PENDING',
      pg_catalog.jsonb_build_object(
        'reason', reason_value, 'revision', revision_value,
        'transactional', true
      ), pg_catalog.clock_timestamp(), null, null, null, null,
      runtime_generation, null, null, null, pg_catalog.clock_timestamp()
    ) on conflict (tournament_id, round_number, engine_key) do update set
      status = 'PENDING',
      requested_source_revision = excluded.requested_source_revision,
      requested_at = excluded.requested_at,
      started_at = null, completed_at = null,
      last_error_code = null, last_error_safe = null,
      runtime_generation_id = excluded.runtime_generation_id,
      claim_token = null, claimed_by = null, lease_expires_at = null,
      updated_at = excluded.updated_at;
  end loop;
  return case when tg_op = 'DELETE' then old else new end;
end;
$annual_derived_change$;

create trigger production_annual_derived_v1_hole_score_change
after insert or update or delete on scoring_authority.hole_scores
for each row execute function
  scoring_authority.enqueue_annual_derived_v1_change();

create trigger production_annual_derived_v1_match_change
after update of status, result_winner, scorecard_complete, finalized_at,
  match_revision on scoring_authority.matches
for each row execute function
  scoring_authority.enqueue_annual_derived_v1_change();

create trigger production_annual_derived_v1_odds_publication_change
after insert or update of is_current_official, publication_revision,
  payload_hash on scoring_authority.odds_published_snapshots
for each row execute function
  scoring_authority.enqueue_annual_derived_v1_change();

create trigger production_annual_derived_v1_net_skins_result_change
after insert or update of is_current, payload_hash, result_revision
on scoring_authority.net_skins_v1_result_revisions
for each row execute function
  scoring_authority.enqueue_annual_derived_v1_change();

-- Production environments that historically installed the Preview-derived
-- worker migration already have these six frozen 2026 bodies. Preserve those
-- exact installed functions behind private names. A clean Production chain
-- intentionally does not install Preview migrations, so the canonical latest
-- repository algorithms are also installed below as private fallbacks. The
-- public wrappers choose the preserved body when it exists and otherwise use
-- the byte-semantic fallback; either path is protected by the same annual
-- pointer/admission fence.
create function production_control
  .frozen_2026_request_competition_derived_recalculation_v1(input jsonb)
returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $frozen_2026_derived_request_algorithm$
declare
  target_tournament text := pg_catalog.btrim(coalesce(
    input->>'tournament_id', ''
  ));
  target_reason text := pg_catalog.left(pg_catalog.btrim(coalesce(
    input->>'reason', 'EXPLICIT_REBUILD'
  )), 120);
  target_actor text := pg_catalog.left(pg_catalog.btrim(coalesce(
    input->>'requested_by', 'Derived-state worker'
  )), 180);
  engine_value text;
  requested_count integer := 0;
begin
  if pg_catalog.upper(pg_catalog.btrim(coalesce(
       input->>'environment', ''
     ))) <> 'PREVIEW'
     or target_tournament = ''
     or pg_catalog.jsonb_typeof(input->'engine_keys') <> 'array' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'COMPLETE_DERIVED_REQUEST_REQUIRED'
    );
  end if;
  if not exists (
    select 1 from scoring_authority.tournaments value
    where value.tournament_id = target_tournament
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'TOURNAMENT_NOT_FOUND'
    );
  end if;
  for engine_value in
    select pg_catalog.upper(pg_catalog.btrim(value))
    from pg_catalog.jsonb_array_elements_text(input->'engine_keys') value
  loop
    if engine_value not in ('TEAM_MOMENTUM', 'TOURNAMENT_STORYLINES') then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'DERIVED_ENGINE_NOT_SUPPORTED'
      );
    end if;
    insert into scoring_authority.competition_recalculation_jobs (
      tournament_id, round_number, engine_key, status,
      requested_source_revision, requested_at, updated_at
    ) values (
      target_tournament, 0, engine_value, 'PENDING',
      pg_catalog.jsonb_build_object(
        'reason', target_reason, 'requestedBy', target_actor
      ), pg_catalog.now(), pg_catalog.now()
    ) on conflict (tournament_id, round_number, engine_key) do update set
      status = 'PENDING',
      requested_source_revision = excluded.requested_source_revision,
      requested_at = pg_catalog.now(), started_at = null,
      completed_at = null, last_error_code = null,
      last_error_safe = null, updated_at = pg_catalog.now();
    requested_count := requested_count + 1;
  end loop;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'requested', requested_count
  );
end;
$frozen_2026_derived_request_algorithm$;

create function production_control
  .frozen_2026_claim_competition_derived_jobs_v1(input jsonb)
returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $frozen_2026_derived_claim_algorithm$
declare
  target_tournament text := pg_catalog.btrim(coalesce(
    input->>'tournament_id', ''
  ));
  target_engines text[];
  claims jsonb;
begin
  if pg_catalog.upper(pg_catalog.btrim(coalesce(
       input->>'environment', ''
     ))) <> 'PREVIEW'
     or target_tournament = ''
     or pg_catalog.jsonb_typeof(input->'engine_keys') <> 'array' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'COMPLETE_DERIVED_CLAIM_REQUIRED'
    );
  end if;
  select coalesce(pg_catalog.array_agg(
    pg_catalog.upper(pg_catalog.btrim(value))
  ), array[]::text[]) into target_engines
  from pg_catalog.jsonb_array_elements_text(input->'engine_keys') value;
  if pg_catalog.cardinality(target_engines) = 0 or exists (
    select 1 from pg_catalog.unnest(target_engines) requested(engine_key)
    where requested.engine_key not in (
      'TEAM_MOMENTUM', 'TOURNAMENT_STORYLINES'
    )
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'DERIVED_ENGINE_NOT_SUPPORTED'
    );
  end if;
  with candidates as (
    select value.tournament_id, value.round_number, value.engine_key
    from scoring_authority.competition_recalculation_jobs value
    where value.tournament_id = target_tournament
      and value.round_number = 0
      and value.engine_key = any(target_engines)
      and value.status in ('PENDING', 'FAILED')
    order by value.engine_key
    for update skip locked
  ), claimed as (
    update scoring_authority.competition_recalculation_jobs value set
      status = 'RUNNING', attempts = value.attempts + 1,
      started_at = pg_catalog.clock_timestamp(), completed_at = null,
      last_error_code = null, last_error_safe = null,
      updated_at = pg_catalog.now()
    from candidates candidate
    where value.tournament_id = candidate.tournament_id
      and value.round_number = candidate.round_number
      and value.engine_key = candidate.engine_key
    returning value.engine_key, value.started_at, value.requested_at,
      value.requested_source_revision, value.attempts
  ) select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'engine_key', engine_key, 'claim_started_at', started_at,
      'requested_at', requested_at,
      'requested_source_revision', requested_source_revision,
      'attempt', attempts
    ) order by engine_key), '[]'::jsonb)
  into claims from claimed;
  return pg_catalog.jsonb_build_object('ok', true, 'claims', claims);
end;
$frozen_2026_derived_claim_algorithm$;

create function production_control
  .frozen_2026_mark_competition_derived_job_failed_v1(input jsonb)
returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $frozen_2026_derived_fail_algorithm$
declare
  target_tournament text := pg_catalog.btrim(coalesce(
    input->>'tournament_id', ''
  ));
  target_engine text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input->>'engine_key', ''
  )));
  target_claim timestamptz := (input->>'claim_started_at')::timestamptz;
  updated_count integer := 0;
begin
  if pg_catalog.upper(pg_catalog.btrim(coalesce(
       input->>'environment', ''
     ))) <> 'PREVIEW'
     or target_tournament = ''
     or target_engine not in ('TEAM_MOMENTUM', 'TOURNAMENT_STORYLINES')
     or target_claim is null then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'COMPLETE_DERIVED_FAILURE_REQUIRED'
    );
  end if;
  update scoring_authority.competition_recalculation_jobs value set
    status = 'FAILED', completed_at = pg_catalog.now(),
    last_error_code = pg_catalog.left(pg_catalog.btrim(coalesce(
      input->>'error_code', 'DERIVED_CALCULATION_FAILED'
    )), 120),
    last_error_safe = pg_catalog.left(pg_catalog.btrim(coalesce(
      input->>'error_safe',
      'Prepared competition content is temporarily unavailable.'
    )), 400),
    updated_at = pg_catalog.now()
  where value.tournament_id = target_tournament
    and value.round_number = 0 and value.engine_key = target_engine
    and value.status = 'RUNNING' and value.started_at = target_claim;
  get diagnostics updated_count = row_count;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'marked', updated_count = 1,
    'superseded', updated_count = 0
  );
end;
$frozen_2026_derived_fail_algorithm$;

create function production_control
  .frozen_2026_write_competition_derived_snapshot_v1(input jsonb)
returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $frozen_2026_derived_write_algorithm$
declare
  target_tournament text := pg_catalog.btrim(coalesce(
    input->>'tournament_id', ''
  ));
  target_round integer := coalesce((input->>'round_number')::integer, 0);
  target_engine text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input->>'engine_key', ''
  )));
  target_engine_version text := pg_catalog.btrim(coalesce(
    input->>'engine_version', ''
  ));
  target_configuration text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'configuration_fingerprint', ''
  )));
  target_source text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'source_fingerprint', ''
  )));
  target_payload_hash text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'payload_hash', ''
  )));
  target_payload jsonb := coalesce(input->'result_payload', 'null'::jsonb);
  target_actor text := pg_catalog.btrim(coalesce(
    input->>'calculated_by', ''
  ));
  target_calculated_at timestamptz := coalesce(
    (input->>'calculated_at')::timestamptz, pg_catalog.now()
  );
  target_started_at timestamptz := coalesce(
    (input->>'started_at')::timestamptz, target_calculated_at
  );
  target_claim_started_at timestamptz :=
    (input->>'claim_started_at')::timestamptz;
  target_duration numeric := pg_catalog.greatest(
    0, coalesce((input->>'duration_ms')::numeric, 0)
  );
  snapshot_id uuid;
  run_id uuid;
  logical_replay boolean := false;
  claimed_job scoring_authority.competition_recalculation_jobs%rowtype;
begin
  if pg_catalog.upper(pg_catalog.btrim(coalesce(
       input->>'environment', ''
     ))) <> 'PREVIEW' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PREVIEW_ENVIRONMENT_REQUIRED'
    );
  end if;
  if target_tournament = '' or target_actor = ''
     or target_engine_version = ''
     or target_engine not in ('TEAM_MOMENTUM', 'TOURNAMENT_STORYLINES')
     or target_configuration !~ '^[0-9a-f]{64}$'
     or target_source !~ '^[0-9a-f]{64}$'
     or target_payload_hash !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(target_payload) <> 'object'
     or target_claim_started_at is null then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'COMPLETE_DERIVED_SNAPSHOT_REQUIRED'
    );
  end if;
  select value.* into claimed_job
  from scoring_authority.competition_recalculation_jobs value
  where value.tournament_id = target_tournament
    and value.round_number = target_round
    and value.engine_key = target_engine and value.status = 'RUNNING'
    and value.started_at = target_claim_started_at
  for update;
  if claimed_job.engine_key is null then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'STALE_DERIVED_JOB', 'superseded', true
    );
  end if;
  select value.id into snapshot_id
  from scoring_authority.competition_derived_snapshots value
  where value.tournament_id = target_tournament
    and value.round_number = target_round
    and value.engine_key = target_engine
    and value.engine_version = target_engine_version
    and value.configuration_fingerprint = target_configuration
    and value.source_fingerprint = target_source
    and value.payload_hash = target_payload_hash
  limit 1;
  logical_replay := snapshot_id is not null;
  update scoring_authority.competition_derived_snapshots value set
    is_current = false
  where value.tournament_id = target_tournament
    and value.round_number = target_round
    and value.engine_key = target_engine and value.is_current
    and value.id is distinct from snapshot_id;
  if snapshot_id is null then
    insert into scoring_authority.competition_derived_snapshots (
      tournament_id, round_number, engine_key, engine_version,
      configuration_fingerprint, source_fingerprint, result_state,
      result_payload, payload_hash, is_current, calculated_at
    ) values (
      target_tournament, target_round, target_engine,
      target_engine_version, target_configuration, target_source,
      'PROVISIONAL', target_payload, target_payload_hash, true,
      target_calculated_at
    ) returning id into snapshot_id;
  else
    update scoring_authority.competition_derived_snapshots value set
      is_current = true, result_payload = target_payload,
      calculated_at = target_calculated_at
    where value.id = snapshot_id;
  end if;
  insert into scoring_authority.competition_derived_runs (
    tournament_id, round_number, engine_key, engine_version,
    configuration_fingerprint, source_fingerprint, payload_hash, status,
    calculated_by, started_at, completed_at, duration_ms
  ) values (
    target_tournament, target_round, target_engine, target_engine_version,
    target_configuration, target_source, target_payload_hash, 'SUCCEEDED',
    target_actor, target_started_at, target_calculated_at, target_duration
  ) on conflict (
    tournament_id, round_number, engine_key, engine_version,
    configuration_fingerprint, source_fingerprint, payload_hash, status
  ) do update set
    completed_at = excluded.completed_at,
    duration_ms = excluded.duration_ms,
    calculated_by = excluded.calculated_by
  returning id into run_id;
  update scoring_authority.competition_recalculation_jobs value set
    status = 'SUCCEEDED', requested_source_revision =
      pg_catalog.jsonb_build_object(
        'sourceFingerprint', target_source,
        'configurationFingerprint', target_configuration,
        'payloadHash', target_payload_hash
      ),
    completed_at = pg_catalog.now(), last_error_code = null,
    last_error_safe = null, updated_at = pg_catalog.now()
  where value.tournament_id = target_tournament
    and value.round_number = target_round
    and value.engine_key = target_engine and value.status = 'RUNNING'
    and value.started_at = target_claim_started_at;
  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    target_tournament, target_engine || '_DERIVED_STATE_CALCULATED',
    target_actor, pg_catalog.jsonb_build_object(
      'snapshotId', snapshot_id, 'runId', run_id,
      'sourceFingerprint', target_source,
      'payloadHash', target_payload_hash,
      'engineVersion', target_engine_version,
      'logicalReplay', logical_replay,
      'claimStartedAt', target_claim_started_at
    )
  );
  return pg_catalog.jsonb_build_object(
    'ok', true, 'snapshot_id', snapshot_id,
    'run_id', run_id, 'logical_replay', logical_replay
  );
end;
$frozen_2026_derived_write_algorithm$;

create function production_control
  .frozen_2026_claim_intelligence_derived_bundle_v1(input jsonb)
returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $frozen_2026_intelligence_claim_algorithm$
declare
  target text := pg_catalog.btrim(coalesce(input->>'tournament_id', ''));
  actor text := pg_catalog.left(pg_catalog.btrim(coalesce(
    input->>'requested_by', ''
  )), 180);
  claim_time timestamptz := pg_catalog.clock_timestamp();
  key_value text;
begin
  if pg_catalog.upper(pg_catalog.btrim(coalesce(
       input->>'environment', ''
     ))) <> 'PREVIEW'
     or target = '' or actor = '' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'COMPLETE_INTELLIGENCE_CLAIM_REQUIRED'
    );
  end if;
  for key_value in
    select pg_catalog.upper(pg_catalog.btrim(value))
    from pg_catalog.jsonb_array_elements_text(input->'engine_keys') value
  loop
    if key_value not in (
      'TOURNAMENT_INTELLIGENCE', 'PROJECTION_EDITORIAL',
      'TOURNAMENT_FINAL_RECAP'
    ) then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'DERIVED_ENGINE_NOT_SUPPORTED'
      );
    end if;
    insert into scoring_authority.competition_recalculation_jobs (
      tournament_id, round_number, engine_key, status,
      requested_source_revision, requested_at, started_at, updated_at
    ) values (
      target, 0, key_value, 'RUNNING',
      pg_catalog.jsonb_build_object('requestedBy', actor),
      claim_time, claim_time, pg_catalog.now()
    ) on conflict (tournament_id, round_number, engine_key) do update set
      status = 'RUNNING',
      requested_source_revision = excluded.requested_source_revision,
      requested_at = claim_time, started_at = claim_time,
      completed_at = null, last_error_code = null,
      last_error_safe = null, updated_at = pg_catalog.now();
  end loop;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'claim_started_at', claim_time
  );
end;
$frozen_2026_intelligence_claim_algorithm$;

create function production_control
  .frozen_2026_intelligence_claim_is_current_v1(
    target_tournament text,
    target_engine text,
    target_claim timestamptz
  )
returns boolean
language sql security definer set search_path = pg_catalog
as $frozen_2026_intelligence_claim_current$
  select exists (
    select 1
    from scoring_authority.competition_recalculation_jobs value
    where value.tournament_id = target_tournament
      and value.round_number = 0 and value.engine_key = target_engine
      and value.status = 'RUNNING' and value.started_at = target_claim
  )
$frozen_2026_intelligence_claim_current$;

create function production_control
  .frozen_2026_write_intelligence_derived_bundle_v1(input jsonb)
returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $frozen_2026_intelligence_write_algorithm$
declare
  target_tournament text := pg_catalog.btrim(coalesce(
    input->>'tournament_id', ''
  ));
  target_source text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'source_fingerprint', ''
  )));
  target_actor text := pg_catalog.left(pg_catalog.btrim(coalesce(
    input->>'calculated_by', ''
  )), 180);
  target_duration numeric := pg_catalog.greatest(
    0, coalesce((input->>'duration_ms')::numeric, 0)
  );
  engine jsonb;
  target_engine_key text;
  target_engine_version text;
  target_payload jsonb;
  target_payload_hash text;
  target_claim timestamptz;
  snapshot_id uuid;
  written jsonb := '[]'::jsonb;
begin
  if pg_catalog.upper(pg_catalog.btrim(coalesce(
       input->>'environment', ''
     ))) <> 'PREVIEW'
     or target_tournament = '' or target_actor = ''
     or target_source !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(input->'engines') <> 'array' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'COMPLETE_INTELLIGENCE_BUNDLE_REQUIRED'
    );
  end if;
  if not exists (
    select 1 from scoring_authority.tournaments value
    where value.tournament_id = target_tournament
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'TOURNAMENT_NOT_FOUND'
    );
  end if;
  for engine in
    select value from pg_catalog.jsonb_array_elements(input->'engines') value
  loop
    target_engine_key := pg_catalog.upper(pg_catalog.btrim(coalesce(
      engine->>'key', ''
    )));
    target_engine_version := pg_catalog.btrim(coalesce(
      engine->>'version', ''
    ));
    target_payload := coalesce(engine->'result', 'null'::jsonb);
    target_payload_hash := pg_catalog.lower(pg_catalog.btrim(coalesce(
      engine->>'payload_hash', ''
    )));
    begin
      target_claim := (engine->>'claim_started_at')::timestamptz;
    exception when others then
      target_claim := null;
    end;
    if target_engine_key not in (
      'TOURNAMENT_INTELLIGENCE', 'PROJECTION_EDITORIAL',
      'TOURNAMENT_FINAL_RECAP'
    ) or target_engine_version = ''
      or pg_catalog.jsonb_typeof(target_payload) <> 'object'
      or target_payload_hash !~ '^[0-9a-f]{64}$'
      or target_claim is null then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'INVALID_INTELLIGENCE_ENGINE_PAYLOAD'
      );
    end if;
    if target_engine_key = 'TOURNAMENT_FINAL_RECAP'
       and coalesce((input#>>'{final_gate,eligible}')::boolean, false)
         is not true then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'FINAL_RECAP_GATE_REQUIRED'
      );
    end if;
    if not production_control
      .frozen_2026_intelligence_claim_is_current_v1(
        target_tournament, target_engine_key, target_claim
      ) then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'STALE_INTELLIGENCE_WORKER',
        'superseded', true, 'engineKey', target_engine_key
      );
    end if;
    select value.id into snapshot_id
    from scoring_authority.competition_derived_snapshots value
    where value.tournament_id = target_tournament
      and value.round_number = 0
      and value.engine_key = target_engine_key
      and value.engine_version = target_engine_version
      and value.source_fingerprint = target_source
      and value.payload_hash = target_payload_hash
    limit 1;
    update scoring_authority.competition_derived_snapshots value set
      is_current = false
    where value.tournament_id = target_tournament
      and value.round_number = 0
      and value.engine_key = target_engine_key and value.is_current
      and value.id is distinct from snapshot_id;
    if snapshot_id is null then
      insert into scoring_authority.competition_derived_snapshots (
        tournament_id, round_number, engine_key, engine_version,
        configuration_fingerprint, source_fingerprint, result_state,
        result_payload, payload_hash, is_current, calculated_at
      ) values (
        target_tournament, 0, target_engine_key, target_engine_version,
        pg_catalog.encode(extensions.digest(
          target_engine_version || ':canonical-supabase-input-v1',
          'sha256'
        ), 'hex'), target_source,
        case when target_engine_key = 'TOURNAMENT_FINAL_RECAP'
          then 'OFFICIAL' else 'PROVISIONAL' end,
        target_payload, target_payload_hash, true, pg_catalog.now()
      ) returning id into snapshot_id;
    else
      update scoring_authority.competition_derived_snapshots value set
        is_current = true, calculated_at = pg_catalog.now()
      where value.id = snapshot_id;
    end if;
    insert into scoring_authority.competition_derived_runs (
      tournament_id, round_number, engine_key, engine_version,
      configuration_fingerprint, source_fingerprint, payload_hash,
      status, calculated_by, started_at, completed_at, duration_ms
    ) values (
      target_tournament, 0, target_engine_key, target_engine_version,
      pg_catalog.encode(extensions.digest(
        target_engine_version || ':canonical-supabase-input-v1',
        'sha256'
      ), 'hex'), target_source, target_payload_hash, 'SUCCEEDED',
      target_actor, target_claim, pg_catalog.now(), target_duration
    ) on conflict (
      tournament_id, round_number, engine_key, engine_version,
      configuration_fingerprint, source_fingerprint, payload_hash, status
    ) do update set
      completed_at = pg_catalog.now(), duration_ms = excluded.duration_ms;
    update scoring_authority.competition_recalculation_jobs value set
      status = 'SUCCEEDED', requested_source_revision =
        pg_catalog.jsonb_build_object(
          'sourceFingerprint', target_source,
          'payloadHash', target_payload_hash
        ),
      completed_at = pg_catalog.now(), updated_at = pg_catalog.now(),
      last_error_code = null, last_error_safe = null
    where value.tournament_id = target_tournament
      and value.round_number = 0 and value.engine_key = target_engine_key
      and value.status = 'RUNNING' and value.started_at = target_claim;
    if not found then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'STALE_INTELLIGENCE_WORKER',
        'superseded', true, 'engineKey', target_engine_key
      );
    end if;
    written := written || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'engineKey', target_engine_key, 'snapshotId', snapshot_id
      )
    );
  end loop;
  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    target_tournament, 'INTELLIGENCE_DERIVED_BUNDLE_CALCULATED',
    target_actor, pg_catalog.jsonb_build_object(
      'sourceFingerprint', target_source,
      'engines', written, 'finalGate', input->'final_gate'
    )
  );
  return pg_catalog.jsonb_build_object(
    'ok', true, 'written', written, 'final_gate', input->'final_gate'
  );
end;
$frozen_2026_intelligence_write_algorithm$;

do $preserve_installed_frozen_2026_algorithms$
begin
  if pg_catalog.to_regprocedure(
       'public.request_competition_derived_recalculation(jsonb)'
     ) is not null then
    alter function public.request_competition_derived_recalculation(jsonb)
      rename to request_competition_derived_recalculation_frozen_2026_installed_v1;
  end if;
  if pg_catalog.to_regprocedure(
       'public.claim_competition_derived_jobs(jsonb)'
     ) is not null then
    alter function public.claim_competition_derived_jobs(jsonb)
      rename to claim_competition_derived_jobs_frozen_2026_installed_v1;
  end if;
  if pg_catalog.to_regprocedure(
       'public.write_competition_derived_snapshot(jsonb)'
     ) is not null then
    alter function public.write_competition_derived_snapshot(jsonb)
      rename to write_competition_derived_snapshot_frozen_2026_installed_v1;
  end if;
  if pg_catalog.to_regprocedure(
       'public.mark_competition_derived_job_failed(jsonb)'
     ) is not null then
    alter function public.mark_competition_derived_job_failed(jsonb)
      rename to mark_competition_derived_job_failed_frozen_2026_installed_v1;
  end if;
  if pg_catalog.to_regprocedure(
       'public.claim_intelligence_derived_bundle(jsonb)'
     ) is not null then
    alter function public.claim_intelligence_derived_bundle(jsonb)
      rename to claim_intelligence_derived_bundle_frozen_2026_installed_v1;
  end if;
  if pg_catalog.to_regprocedure(
       'public.write_intelligence_derived_bundle(jsonb)'
     ) is not null then
    alter function public.write_intelligence_derived_bundle(jsonb)
      rename to write_intelligence_derived_bundle_frozen_2026_installed_v1;
  end if;
end;
$preserve_installed_frozen_2026_algorithms$;

create function public.request_competition_derived_recalculation(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $frozen_derived_request$
declare
  legacy_input jsonb;
  result_value jsonb;
begin
  perform production_control.assert_frozen_2026_derived_worker_v1(input);
  legacy_input := input || pg_catalog.jsonb_build_object(
    'environment', 'PREVIEW', 'tournament_id', '2026'
  );
  if pg_catalog.to_regprocedure(
       'public.request_competition_derived_recalculation_frozen_2026_installed_v1(jsonb)'
     ) is not null then
    execute $installed$select public
      .request_competition_derived_recalculation_frozen_2026_installed_v1($1)
    $installed$ into strict result_value using legacy_input;
    return result_value;
  end if;
  return production_control
    .frozen_2026_request_competition_derived_recalculation_v1(legacy_input);
end;
$frozen_derived_request$;

create function public.claim_competition_derived_jobs(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $frozen_derived_claim$
declare
  legacy_input jsonb;
  result_value jsonb;
begin
  perform production_control.assert_frozen_2026_derived_worker_v1(input);
  legacy_input := input || pg_catalog.jsonb_build_object(
    'environment', 'PREVIEW', 'tournament_id', '2026'
  );
  if pg_catalog.to_regprocedure(
       'public.claim_competition_derived_jobs_frozen_2026_installed_v1(jsonb)'
     ) is not null then
    execute $installed$select public
      .claim_competition_derived_jobs_frozen_2026_installed_v1($1)
    $installed$ into strict result_value using legacy_input;
    return result_value;
  end if;
  return production_control
    .frozen_2026_claim_competition_derived_jobs_v1(legacy_input);
end;
$frozen_derived_claim$;

create function public.write_competition_derived_snapshot(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $frozen_derived_write$
declare
  legacy_input jsonb;
  result_value jsonb;
begin
  perform production_control.assert_frozen_2026_derived_worker_v1(input);
  legacy_input := input || pg_catalog.jsonb_build_object(
    'environment', 'PREVIEW', 'tournament_id', '2026'
  );
  if pg_catalog.to_regprocedure(
       'public.write_competition_derived_snapshot_frozen_2026_installed_v1(jsonb)'
     ) is not null then
    execute $installed$select public
      .write_competition_derived_snapshot_frozen_2026_installed_v1($1)
    $installed$ into strict result_value using legacy_input;
    return result_value;
  end if;
  return production_control
    .frozen_2026_write_competition_derived_snapshot_v1(legacy_input);
end;
$frozen_derived_write$;

create function public.mark_competition_derived_job_failed(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $frozen_derived_fail$
declare
  legacy_input jsonb;
  result_value jsonb;
begin
  perform production_control.assert_frozen_2026_derived_worker_v1(input);
  legacy_input := input || pg_catalog.jsonb_build_object(
    'environment', 'PREVIEW', 'tournament_id', '2026'
  );
  if pg_catalog.to_regprocedure(
       'public.mark_competition_derived_job_failed_frozen_2026_installed_v1(jsonb)'
     ) is not null then
    execute $installed$select public
      .mark_competition_derived_job_failed_frozen_2026_installed_v1($1)
    $installed$ into strict result_value using legacy_input;
    return result_value;
  end if;
  return production_control
    .frozen_2026_mark_competition_derived_job_failed_v1(legacy_input);
end;
$frozen_derived_fail$;

create function public.claim_intelligence_derived_bundle(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $frozen_intelligence_claim$
declare
  legacy_input jsonb;
  result_value jsonb;
begin
  perform production_control.assert_frozen_2026_derived_worker_v1(input);
  legacy_input := input || pg_catalog.jsonb_build_object(
    'environment', 'PREVIEW', 'tournament_id', '2026'
  );
  if pg_catalog.to_regprocedure(
       'public.claim_intelligence_derived_bundle_frozen_2026_installed_v1(jsonb)'
     ) is not null then
    execute $installed$select public
      .claim_intelligence_derived_bundle_frozen_2026_installed_v1($1)
    $installed$ into strict result_value using legacy_input;
    return result_value;
  end if;
  return production_control
    .frozen_2026_claim_intelligence_derived_bundle_v1(legacy_input);
end;
$frozen_intelligence_claim$;

create function public.write_intelligence_derived_bundle(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $frozen_intelligence_write$
declare
  legacy_input jsonb;
  result_value jsonb;
begin
  perform production_control.assert_frozen_2026_derived_worker_v1(input);
  legacy_input := input || pg_catalog.jsonb_build_object(
    'environment', 'PREVIEW', 'tournament_id', '2026'
  );
  if pg_catalog.to_regprocedure(
       'public.write_intelligence_derived_bundle_frozen_2026_installed_v1(jsonb)'
     ) is not null then
    execute $installed$select public
      .write_intelligence_derived_bundle_frozen_2026_installed_v1($1)
    $installed$ into strict result_value using legacy_input;
    return result_value;
  end if;
  return production_control
    .frozen_2026_write_intelligence_derived_bundle_v1(legacy_input);
end;
$frozen_intelligence_write$;

-- CLOSE owns the exclusive counterpart of the wrappers' shared lock. The
-- check therefore sees every claim/request committed before closure, while a
-- later claim cannot pass the admission assertion after closure commits.
alter function production_control.close_annual_scoring_predecessor_v1(
  jsonb, text
) rename to close_annual_scoring_predecessor_pre_derived_workers_v1;

create function production_control.close_annual_scoring_predecessor_v1(
  input jsonb,
  target_tournament_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $derived_worker_close_fence$
declare
  competition_unresolved integer;
  intelligence_unresolved integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select pg_catalog.count(*)::integer into competition_unresolved
  from scoring_authority.competition_recalculation_jobs value
  where value.tournament_id = target_tournament_id
    and value.round_number = 0
    and value.engine_key in ('TEAM_MOMENTUM', 'TOURNAMENT_STORYLINES')
    and value.status <> 'SUCCEEDED';
  select pg_catalog.count(*)::integer into intelligence_unresolved
  from scoring_authority.competition_recalculation_jobs value
  where value.tournament_id = target_tournament_id
    and value.round_number = 0
    and value.engine_key in (
      'TOURNAMENT_INTELLIGENCE', 'PROJECTION_EDITORIAL',
      'TOURNAMENT_FINAL_RECAP'
    )
    and value.status <> 'SUCCEEDED';
  if competition_unresolved + intelligence_unresolved <> 0 then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_PREDECESSOR_DERIVED_WORK_PENDING';
  end if;
  return production_control
    .close_annual_scoring_predecessor_pre_derived_workers_v1(
      input, target_tournament_id
    );
end;
$derived_worker_close_fence$;

-- Extend the immutable predecessor boundary with competition/intelligence
-- job state. Only SUCCEEDED is terminal; FAILED work must be retried before an
-- annual handoff, and a future row must carry the exact active generation.
alter function production_control.annual_scoring_predecessor_certificate_v1(
  text
) rename to annual_scoring_predecessor_certificate_pre_derived_workers_v1;

create function production_control.annual_scoring_predecessor_certificate_v1(
  target_tournament_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $derived_worker_close_certificate$
declare
  baseline jsonb;
  blockers jsonb;
  runtime_generation uuid;
  competition_unresolved integer;
  intelligence_unresolved integer;
  competition_generation_mismatch integer := 0;
  intelligence_generation_mismatch integer := 0;
  fingerprint_value text;
begin
  baseline := production_control
    .annual_scoring_predecessor_certificate_pre_derived_workers_v1(
      target_tournament_id
    );
  blockers := coalesce(baseline->'blockers', '[]'::jsonb);
  if target_tournament_id <> '2026' then
    select value.runtime_generation_id into runtime_generation
    from production_control.annual_scoring_runtime_authorities_v1 value
    where value.tournament_id = target_tournament_id;
  end if;
  select pg_catalog.count(*)::integer into competition_unresolved
  from scoring_authority.competition_recalculation_jobs value
  where value.tournament_id = target_tournament_id
    and value.round_number = 0
    and value.engine_key in ('TEAM_MOMENTUM', 'TOURNAMENT_STORYLINES')
    and value.status <> 'SUCCEEDED';
  select pg_catalog.count(*)::integer into intelligence_unresolved
  from scoring_authority.competition_recalculation_jobs value
  where value.tournament_id = target_tournament_id
    and value.round_number = 0
    and value.engine_key in (
      'TOURNAMENT_INTELLIGENCE', 'PROJECTION_EDITORIAL',
      'TOURNAMENT_FINAL_RECAP'
    )
    and value.status <> 'SUCCEEDED';
  if target_tournament_id <> '2026' then
    select pg_catalog.count(*)::integer
      into competition_generation_mismatch
    from scoring_authority.competition_recalculation_jobs value
    where value.tournament_id = target_tournament_id
      and value.round_number = 0
      and value.engine_key in ('TEAM_MOMENTUM', 'TOURNAMENT_STORYLINES')
      and value.status <> 'SUCCEEDED'
      and value.runtime_generation_id is distinct from runtime_generation;
    select pg_catalog.count(*)::integer
      into intelligence_generation_mismatch
    from scoring_authority.competition_recalculation_jobs value
    where value.tournament_id = target_tournament_id
      and value.round_number = 0
      and value.engine_key in (
        'TOURNAMENT_INTELLIGENCE', 'PROJECTION_EDITORIAL',
        'TOURNAMENT_FINAL_RECAP'
      )
      and value.status <> 'SUCCEEDED'
      and value.runtime_generation_id is distinct from runtime_generation;
  end if;
  if competition_unresolved + intelligence_unresolved <> 0 then
    blockers := blockers || pg_catalog.jsonb_build_array(
      'PREDECESSOR_DERIVED_WORK_DRAIN_INCOMPLETE'
    );
  end if;
  if competition_generation_mismatch
       + intelligence_generation_mismatch <> 0 then
    blockers := blockers || pg_catalog.jsonb_build_array(
      'PREDECESSOR_DERIVED_WORK_GENERATION_MISMATCH'
    );
  end if;
  fingerprint_value := production_control.future_runtime_hash_v2(
    pg_catalog.jsonb_build_object(
      'contractVersion',
        'production-annual-scoring-derived-worker-close-certificate-v1',
      'baselineFingerprint', baseline->>'fingerprint',
      'tournamentId', target_tournament_id,
      'runtimeGenerationId', runtime_generation,
      'competitionUnresolved', competition_unresolved,
      'intelligenceUnresolved', intelligence_unresolved,
      'competitionGenerationMismatch',
        competition_generation_mismatch,
      'intelligenceGenerationMismatch',
        intelligence_generation_mismatch,
      'blockers', blockers
    )
  );
  return baseline || pg_catalog.jsonb_build_object(
    'certified', pg_catalog.jsonb_array_length(blockers) = 0,
    'fingerprint', fingerprint_value,
    'blockers', blockers,
    'derivedWorkerDrain', pg_catalog.jsonb_build_object(
      'runtimeGenerationId', runtime_generation,
      'competitionUnresolved', competition_unresolved,
      'intelligenceUnresolved', intelligence_unresolved,
      'competitionGenerationMismatch',
        competition_generation_mismatch,
      'intelligenceGenerationMismatch',
        intelligence_generation_mismatch
    )
  );
end;
$derived_worker_close_certificate$;

do $derived_worker_privileges$
declare
  signature text;
begin
  foreach signature in array array[
    'public.request_competition_derived_recalculation(jsonb)',
    'public.claim_competition_derived_jobs(jsonb)',
    'public.write_competition_derived_snapshot(jsonb)',
    'public.mark_competition_derived_job_failed(jsonb)',
    'public.claim_intelligence_derived_bundle(jsonb)',
    'public.write_intelligence_derived_bundle(jsonb)'
  ] loop
    execute pg_catalog.format(
      'revoke all on function %s from public, anon, authenticated, service_role',
      signature
    );
    execute pg_catalog.format(
      'grant execute on function %s to service_role', signature
    );
  end loop;
  foreach signature in array array[
    'public.request_competition_derived_recalculation_frozen_2026_installed_v1(jsonb)',
    'public.claim_competition_derived_jobs_frozen_2026_installed_v1(jsonb)',
    'public.write_competition_derived_snapshot_frozen_2026_installed_v1(jsonb)',
    'public.mark_competition_derived_job_failed_frozen_2026_installed_v1(jsonb)',
    'public.claim_intelligence_derived_bundle_frozen_2026_installed_v1(jsonb)',
    'public.write_intelligence_derived_bundle_frozen_2026_installed_v1(jsonb)',
    'production_control.frozen_2026_request_competition_derived_recalculation_v1(jsonb)',
    'production_control.frozen_2026_claim_competition_derived_jobs_v1(jsonb)',
    'production_control.frozen_2026_write_competition_derived_snapshot_v1(jsonb)',
    'production_control.frozen_2026_mark_competition_derived_job_failed_v1(jsonb)',
    'production_control.frozen_2026_claim_intelligence_derived_bundle_v1(jsonb)',
    'production_control.frozen_2026_intelligence_claim_is_current_v1(text,text,timestamptz)',
    'production_control.frozen_2026_write_intelligence_derived_bundle_v1(jsonb)',
    'scoring_authority.enqueue_annual_derived_v1_change()',
    'production_control.assert_frozen_2026_derived_worker_v1(jsonb)',
    'production_control.annual_side_game_implementation_manifest_v1()',
    'production_control.annual_side_game_implementation_manifest_pre_triggers_v1()',
    'production_control.close_annual_scoring_predecessor_v1(jsonb,text)',
    'production_control.close_annual_scoring_predecessor_pre_derived_workers_v1(jsonb,text)',
    'production_control.annual_scoring_predecessor_certificate_v1(text)',
    'production_control.annual_scoring_predecessor_certificate_pre_derived_workers_v1(text)'
  ] loop
    if pg_catalog.to_regprocedure(signature) is not null then
      execute pg_catalog.format(
        'revoke all on function %s from public, anon, authenticated, service_role',
        signature
      );
    end if;
  end loop;
end;
$derived_worker_privileges$;

comment on function
  production_control.assert_frozen_2026_derived_worker_v1(jsonb) is
  'Exact-resource frozen-2026 derived-worker assertion holding the shared annual scoring-admission lock through the caller transaction.';
comment on function
  production_control.close_annual_scoring_predecessor_v1(jsonb,text) is
  'Exclusive annual predecessor close fence; refuses closure while any competition or intelligence derived job is pending or running.';
comment on function
  production_control.annual_scoring_predecessor_certificate_v1(text) is
  'Annual predecessor certificate including scoring, mirror/archive, side-game, and competition/intelligence derived-worker drain state.';

notify pgrst, 'reload schema';
commit;
