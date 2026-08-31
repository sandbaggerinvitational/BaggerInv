import assert from "node:assert/strict";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = path.join(root, "supabase", "production_migrations");
const predecessor = "202608300068_production_future_participant_identity_runtime_v1.sql";
const migration070 = "202608300070_production_future_identity_mobile_dispatch_v1.sql";
const annualTerminal =
  "202608300079_production_current_match_authorization_v1.sql";
const providerInventoryV4 =
  "202608260038_production_provider_preview_target_inventory_v4.sql";
const pgBin = "/opt/homebrew/opt/postgresql@17/bin";
const bin = Object.fromEntries(["createdb", "initdb", "pg_ctl", "psql"]
  .map((name) => [name, path.join(pgBin, name)]));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0) {
    throw new Error([command, result.stdout, result.stderr]
      .filter(Boolean).join("\n"));
  }
  return result.stdout.trim();
}

function environment(cluster, extras = {}) {
  return {
    ...process.env,
    PGHOST: cluster.socket,
    PGPORT: String(cluster.port),
    PGUSER: "postgres",
    PGOPTIONS: "-c request.jwt.claim.role=service_role",
    ...extras,
  };
}

function sql(cluster, database, input) {
  return run(bin.psql, ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", database], {
    env: environment(cluster),
    input,
  });
}

function sqlFile(cluster, database, filename) {
  return run(bin.psql, ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", database,
    "-f", filename], { env: environment(cluster) });
}

function sqlAsync(cluster, database, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin.psql, [
      "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", database,
    ], {
      cwd: root,
      env: environment(cluster),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (value) => { stdout += value; });
    child.stderr.on("data", (value) => { stderr += value; });
    child.on("error", reject);
    child.on("close", (code) => code === 0
      ? resolve(stdout.trim())
      : reject(new Error([stdout, stderr].filter(Boolean).join("\n"))));
    child.stdin.end(input);
  });
}

function markedTransaction(cluster, database, input, marker) {
  let markReady;
  const ready = new Promise((resolve) => { markReady = resolve; });
  const completed = new Promise((resolve, reject) => {
    const child = spawn(bin.psql, [
      "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", database,
    ], {
      cwd: root,
      env: environment(cluster),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (value) => {
      stdout += value;
      if (stdout.includes(`${marker}\n`)) markReady();
    });
    child.stderr.on("data", (value) => { stderr += value; });
    child.on("error", reject);
    child.on("close", (code) => code === 0
      ? resolve(stdout.trim())
      : reject(new Error([stdout, stderr].filter(Boolean).join("\n"))));
    child.stdin.end(input);
  });
  return { ready, completed };
}

async function available() {
  try {
    await Promise.all(Object.values(bin).map((value) =>
      access(value, fsConstants.X_OK)));
    return true;
  } catch {
    return false;
  }
}

async function createCluster() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "bagger-13e7b-pg17-"));
  const data = path.join(directory, "data");
  const socket = path.join(directory, "socket");
  const log = path.join(directory, "postgres.log");
  await mkdir(socket, { mode: 0o700 });
  run(bin.initdb, ["-D", data, "--username=postgres", "--auth=trust",
    "--no-locale", "--encoding=UTF8", "--set=shared_memory_type=mmap",
    "--set=dynamic_shared_memory_type=mmap"]);
  const port = 59000 + (process.pid % 400);
  run(bin.pg_ctl, ["-D", data, "-l", log, "-o",
    `-F -k ${socket} -h '' -p ${port}`, "-w", "start"]);
  return { directory, data, socket, log, port, started: true };
}

async function destroyCluster(cluster) {
  if (cluster?.started) {
    run(bin.pg_ctl, ["-D", cluster.data, "-m", "fast", "-w", "stop"]);
  }
  if (cluster?.directory) {
    assert.equal(path.dirname(cluster.directory), path.resolve(os.tmpdir()));
    assert.match(path.basename(cluster.directory), /^bagger-13e7b-pg17-/);
    await rm(cluster.directory, { recursive: true, force: true });
  }
}

function installSupabaseCompatibility(cluster, database) {
  sql(cluster, database, `
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create schema auth;
    create table auth.users (
      id uuid primary key,
      email text,
      phone text,
      phone_change text,
      email_confirmed_at timestamptz,
      phone_confirmed_at timestamptz,
      confirmation_sent_at timestamptz,
      raw_app_meta_data jsonb default '{}'::jsonb,
      raw_user_meta_data jsonb default '{}'::jsonb,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
    create table auth.identities (
      id uuid primary key,
      user_id uuid not null references auth.users(id),
      provider text not null,
      identity_data jsonb default '{}'::jsonb,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
    create function auth.role()
    returns text language sql stable
    as $$
      select coalesce(
        nullif(current_setting('request.jwt.claim.role', true), ''),
        current_user
      )
    $$;
    create function public.rls_auto_enable()
    returns void language plpgsql as $$ begin end $$;
  `);
}

function installAnnualPlatformCertificationFixture(cluster, database) {
  // Migration 069 snapshots the already-certified live deployment. This
  // disposable schema is intentionally dormant, so provide only that immutable
  // platform row; replication mode bypasses its historical rebind/epoch FKs,
  // while all shape/check/unique constraints still apply.
  sql(cluster, database, `
    set session_replication_role = replica;
    insert into production_control.maintenance_deployment_capability_bindings (
      capability_binding_id, rebind_id, boundary_mode, contract_version,
      capability_ceiling, tournament_id, epoch_id, deployment_id,
      deployment_commit, capability_manifest, capability_fingerprint,
      runtime_observed_at, request_fingerprint, payload_hash, actor_id,
      response_value
    )
    select
      '70000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000002',
      'MAINTENANCE_WINDOW_V1',
      'production-maintenance-single-deployment-capability-v1',
      'OBSERVATION', '2026', value.authority_generation_id,
      'dpl_IdentityMobile070', repeat('7', 40), '{}'::jsonb,
      repeat('7', 64), pg_catalog.clock_timestamp(), repeat('8', 64),
      repeat('9', 64), 'step13e7b-platform-fixture', '{}'::jsonb
    from production_control.cutover_activation_state value
    where value.scope_key = 'BAGGER_INV_PRODUCTION';
    set session_replication_role = origin;
  `);
}

async function migrationNames() {
  return (await readdir(migrationsDirectory))
    .filter((name) => /^\d+_.*\.sql$/.test(name))
    .sort();
}

const frozenIdentityFunctions = [
  "public.authorize_production_participant_otp_request(jsonb)",
  "public.complete_production_participant_first_login(jsonb)",
  "public.record_production_participant_first_login_cleanup(jsonb)",
  "public.record_production_participant_otp_delivery(jsonb)",
  "public.authorize_production_participant_otp_verification(jsonb)",
  "public.record_production_participant_otp_verification(jsonb)",
  "public.recover_production_participant_otp_verification(uuid,uuid)",
  "public.read_production_participant_context_for_auth(uuid,text)",
  "public.read_production_participant_player_context(text,text)",
  "public.record_production_participant_logout(uuid,text)",
  "public.read_production_cutover_director_entitlement(uuid,text)",
];

const frozenScoringFunctions = [
  "public.read_production_scoring_authority(jsonb)",
  "public.read_production_scoring_participant_context(jsonb)",
  "public.submit_production_hole_score(jsonb)",
  "public.finalize_production_match(jsonb)",
  "public.reopen_production_match(jsonb)",
  "public.mutate_production_match_control(jsonb)",
  "public.claim_production_google_outbox(jsonb)",
  "public.claim_production_google_outbox_event(jsonb)",
  "public.complete_production_google_outbox(jsonb)",
  "public.fail_production_google_outbox(jsonb)",
  "public.inspect_production_scoring_workers(jsonb)",
  "public.claim_production_scorecard_archive_job(jsonb)",
  "public.complete_production_scorecard_archive_job(jsonb)",
  "public.fail_production_scorecard_archive_job(jsonb)",
  "public.inspect_production_scorecard_archive_state(jsonb)",
];

const frozenNetSkinsMutationFunctions = [
  "production_control.build_production_net_skins_v1_manifest(integer[])",
  "production_control.enqueue_production_net_skins_v1_round(integer,text,text)",
  "production_control.normalize_production_net_skins_v1_official_result(integer,jsonb)",
  "scoring_authority.enqueue_production_net_skins_v1_change()",
  "public.configure_production_net_skins_v1(jsonb)",
  "public.enqueue_production_net_skins_v1_recalculation(jsonb)",
  "public.claim_production_net_skins_v1_recalculation(jsonb)",
  "public.complete_production_net_skins_v1_recalculation(jsonb)",
  "public.fail_production_net_skins_v1_recalculation(jsonb)",
];

const futureIdentityFunctions = [
  "public.authorize_production_future_participant_otp_request_v1(jsonb)",
  "public.complete_production_future_participant_first_login_v1(jsonb)",
  "public.record_production_future_participant_first_login_cleanup_v1(jsonb)",
  "public.record_production_future_participant_otp_delivery_v1(jsonb)",
  "public.authorize_production_future_participant_otp_verification_v1(jsonb)",
  "public.record_production_future_participant_otp_verification_v1(jsonb)",
  "public.recover_production_future_participant_otp_verification_v1(uuid,uuid)",
  "public.read_production_future_participant_context_for_auth_v1(uuid,text)",
  "public.read_production_future_participant_player_context_v1(text,text)",
  "public.record_production_future_participant_logout_v1(uuid,text)",
  "public.read_production_future_director_entitlement_v1(uuid,text)",
];

const frozenReadFunctions = new Map([
  [
    "public.read_production_cutover_current_view(jsonb)",
    "public.read_production_cutover_current_view_frozen_2026_v1(jsonb)",
  ],
  [
    "public.read_production_net_skins_v1(jsonb)",
    "public.read_production_net_skins_frozen_2026_v1(jsonb)",
  ],
  [
    "public.read_production_calcutta_v1(jsonb)",
    "public.read_production_calcutta_frozen_2026_v1(jsonb)",
  ],
  [
    "public.read_production_guide_projection(jsonb)",
    "public.read_production_guide_projection_frozen_2026_v1(jsonb)",
  ],
]);

function functionContract(cluster, database, signature) {
  const escaped = signature.replaceAll("'", "''");
  return JSON.parse(sql(cluster, database, `
    select pg_catalog.jsonb_build_object(
      'source', procedure.prosrc,
      'language', language.lanname,
      'volatility', procedure.provolatile,
      'securityDefiner', procedure.prosecdef,
      'configuration', procedure.proconfig,
      'returnType', procedure.prorettype::pg_catalog.regtype::text
    )::text
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_language language on language.oid = procedure.prolang
    where procedure.oid = '${escaped}'::pg_catalog.regprocedure;
  `));
}

function configureFrozenReadEquivalenceFixture(cluster, database) {
  sql(cluster, database, `
    update production_control.cutover_activation_state
    set state = 'STAGED', activation_revision = 1,
        expected_deployment_commit = repeat('4', 40),
        expected_vercel_project_id = 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU',
        expected_source_fingerprint = repeat('5', 64),
        read_source_fingerprint = repeat('5', 64),
        read_cutover_phase = 'OBSERVATION',
        boundary_mode = 'PROVIDER_FENCE_V2',
        current_authority = 'GOOGLE', scoring_ingress_enabled = false,
        maintenance_state = 'NORMAL', maintenance_started_at = null,
        maintenance_ended_at = null, active_transition_epoch_id = null,
        first_supabase_write_possible_at = null,
        first_supabase_write_observed_at = null
    where scope_key = 'BAGGER_INV_PRODUCTION';

    update production_control.resource_scope
    set public_supabase_reads_enabled = true,
        current_tournament_read_authority = 'SUPABASE',
        scoring_authority = 'GOOGLE', scoring_ingress_enabled = false,
        google_writes_enabled = false, workers_enabled = false
    where scope_key = 'BAGGER_INV_PRODUCTION';

    update scoring_authority.ingress_gates
    set state = 'PAUSED', authority = 'GOOGLE', active_epoch_id = null,
        boundary_mode = 'PROVIDER_FENCE_V2', admission_state = 'OPEN',
        active_closure_id = null, unresolved_client_queues = 0
    where tournament_id = '2026';

    insert into scoring_authority.players(player_id, display_name)
    values ('EQ001', 'Frozen read equivalence participant');
    insert into scoring_authority.teams(
      tournament_id, team_id, team_side, name
    ) values ('2026', 'EQT1', 2, 'Equivalence Team');
    insert into scoring_authority.tournament_players(
      tournament_id, player_id, team_id, team_side, source_roster_key
    ) values ('2026', 'EQ001', 'EQT1', 2, 'EQ001');
  `);
}

function frozenReadResults(cluster, database) {
  return JSON.parse(sql(cluster, database, `
    with scope as (
      select pg_catalog.jsonb_build_object(
        'environment', 'PRODUCTION',
        'project_ref', 'ymqhhtxaywtqllynrmxe',
        'project_url', 'https://ymqhhtxaywtqllynrmxe.supabase.co',
        'source_workbook_id',
          '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4',
        'tournament_id', '2026',
        'tournament_year', 2026,
        'deployment_commit', repeat('4', 40),
        'read_contract', 'ACTIVE_CUTOVER',
        'cutover_phase', 'OBSERVATION'
      ) input
    )
    select pg_catalog.jsonb_build_object(
      'currentView', public.read_production_cutover_current_view(
        scope.input || pg_catalog.jsonb_build_object(
          'surface', 'TOURNAMENT_LIVE'
        )
      ) #- '{data,query_ms}',
      'netSkins', public.read_production_net_skins_v1(scope.input),
      'calcutta', public.read_production_calcutta_v1(
        scope.input || pg_catalog.jsonb_build_object('player_id', 'EQ001')
      ) #- '{data,query_ms}',
      'guide', public.read_production_guide_projection(
        scope.input || pg_catalog.jsonb_build_object(
          'domain', 'GUIDE',
          'contract_version', 'guide-projection-v1',
          'source_tabs', pg_catalog.jsonb_build_array(
            'Tournaments', 'Guide Sections', 'Tournament Itinerary',
            'Tournament Timeline', 'Rule Book', 'Tournament Rules',
            'Rounds', 'Dining', 'Local Guide', 'Important Contacts',
            'Courses'
          )
        )
      )
    )::text
    from scope;
  `));
}

function frozenFingerprint(cluster, database) {
  const values = frozenIdentityFunctions.map((signature) =>
    `'${signature.replaceAll("'", "''")}'::regprocedure`);
  return sql(cluster, database, `
    select md5(pg_catalog.string_agg(
      pg_catalog.pg_get_functiondef(value.oid), E'\\n' order by value.oid
    ))
    from pg_catalog.unnest(array[${values.join(",")}]) value(oid);
  `);
}

function frozenScoringFingerprint(cluster, database) {
  const values = frozenScoringFunctions.map((signature) =>
    `'${signature.replaceAll("'", "''")}'::regprocedure`);
  return sql(cluster, database, `
    select md5(pg_catalog.string_agg(
      value.oid::regprocedure::text || E'\n' ||
      pg_catalog.pg_get_functiondef(value.oid), E'\n-- frozen scoring RPC --\n'
      order by value.oid::regprocedure::text
    ))
    from pg_catalog.unnest(array[${values.join(",")}]) value(oid);
  `);
}

test("migrations 001-079 compile together while annual dispatch installation stays inert and preserves frozen mobile and side-game RPCs", async (t) => {
  if (!(await available())) return t.skip("PostgreSQL 17 binaries unavailable");
  const cluster = await createCluster();
  t.after(() => destroyCluster(cluster));
  const database = "step13e7b_identity_mobile";
  run(bin.createdb, [database], { env: environment(cluster, { PGOPTIONS: "" }) });
  installSupabaseCompatibility(cluster, database);

  const names = await migrationNames();
  const predecessorIndex = names.indexOf(predecessor);
  assert.notEqual(predecessorIndex, -1);
  for (const name of names.slice(0, predecessorIndex + 1)) {
    sqlFile(cluster, database, path.join(migrationsDirectory, name));
    if (name === providerInventoryV4) {
      sql(cluster, database, `
        insert into scoring_authority.tournaments (
          tournament_id, tournament_year, name, source_workbook_id,
          scoring_authority
        ) values (
          '2026', 2026, 'Identity mobile fixture',
          '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4', 'GOOGLE'
        );
        insert into scoring_authority.ingress_gates (
          tournament_id, state, authority, active_epoch_id,
          unresolved_client_queues, updated_by
        ) values ('2026', 'PAUSED', 'GOOGLE', null, 0, 'step13e7b');
      `);
    }
  }
  installAnnualPlatformCertificationFixture(cluster, database);

  const frozenBefore = frozenFingerprint(cluster, database);
  const frozenScoringBefore = frozenScoringFingerprint(cluster, database);
  const frozenNormalReleaseBefore = Object.fromEntries([
    "production_control.authorize_production_postcutover_normal_release(jsonb)",
    "production_control.rebind_production_postcutover_normal_release(jsonb)",
  ].map((signature) => [signature,
    functionContract(cluster, database, signature)]));
  const frozenNetSkinsBefore = Object.fromEntries(
    frozenNetSkinsMutationFunctions.map((signature) => [
      signature,
      functionContract(cluster, database, signature),
    ]),
  );
  configureFrozenReadEquivalenceFixture(cluster, database);
  const frozenReadContractsBefore = Object.fromEntries(
    [...frozenReadFunctions.keys()].map((signature) => [
      signature,
      functionContract(cluster, database, signature),
    ]),
  );
  const frozenReadResultsBefore = frozenReadResults(cluster, database);
  const inertBefore = sql(cluster, database, `select concat_ws('|',
    (select count(*) from participant_identity.future_tournament_identity_contexts_v1),
    (select count(*) from participant_identity.future_tournament_participant_bindings_v1),
    (select count(*) from participant_identity.production_participant_enrollment_claims),
    (select count(*) from auth.users));`);
  const annualTerminalIndex = names.indexOf(annualTerminal);
  assert.ok(annualTerminalIndex > predecessorIndex);
  const annualMigrations = names.slice(predecessorIndex + 1,
    annualTerminalIndex + 1);
  assert.ok(annualMigrations.includes(
    "202608300069_production_annual_scoring_authority_v1.sql"));
  assert.ok(annualMigrations.includes(migration070));
  assert.ok(annualMigrations.includes(
    "202608300071_production_annual_reads_workers_v1.sql"));
  assert.ok(annualMigrations.includes(
    "202608300072_production_annual_google_writer_certification_v1.sql"));
  assert.equal(annualMigrations.at(-1), annualTerminal);
  for (const name of annualMigrations) {
    sqlFile(cluster, database, path.join(migrationsDirectory, name));
  }

  assert.equal(frozenFingerprint(cluster, database), frozenBefore);
  assert.equal(frozenScoringFingerprint(cluster, database),
    frozenScoringBefore);
  assert.deepEqual(functionContract(cluster, database,
    "production_control.authorize_production_postcutover_normal_release_frozen_2026_v1(jsonb)"),
  frozenNormalReleaseBefore[
    "production_control.authorize_production_postcutover_normal_release(jsonb)"],
  "the annual release dispatcher must preserve the exact effective 2026 authorization body");
  assert.deepEqual(functionContract(cluster, database,
    "production_control.rebind_production_postcutover_normal_release_frozen_2026_v1(jsonb)"),
  frozenNormalReleaseBefore[
    "production_control.rebind_production_postcutover_normal_release(jsonb)"],
  "the annual release dispatcher must preserve the exact effective 2026 rebind body");
  for (const signature of frozenNetSkinsMutationFunctions) {
    assert.deepEqual(
      functionContract(cluster, database, signature),
      frozenNetSkinsBefore[signature],
      `${signature} must remain the exact frozen 2026 body`,
    );
  }
  for (const [legacySignature, frozenSignature] of frozenReadFunctions) {
    assert.deepEqual(
      functionContract(cluster, database, frozenSignature),
      frozenReadContractsBefore[legacySignature],
      `${legacySignature} must be preserved byte-for-byte as its 2026 body`,
    );
  }
  assert.deepEqual(
    frozenReadResults(cluster, database),
    frozenReadResultsBefore,
    "the pointer-fenced public RPCs must preserve representative 2026 reads",
  );
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select count(*) from participant_identity.future_tournament_identity_contexts_v1),
    (select count(*) from participant_identity.future_tournament_participant_bindings_v1),
    (select count(*) from participant_identity.production_participant_enrollment_claims),
    (select count(*) from auth.users));`), inertBefore);
  assert.equal(sql(cluster, database, `select concat_ws('|',
    to_regprocedure('production_control.future_participant_identity_eligibility_v1(text)') is not null,
    to_regprocedure('production_control.future_global_owner_eligibility_v1()') is not null,
    to_regprocedure('production_control.rebind_future_participant_identity_admission_generation_v1(text,uuid,uuid,uuid,uuid,bigint)') is not null,
    to_regprocedure('public.complete_production_future_participant_first_login_v1(jsonb)') is not null,
    to_regprocedure('public.read_production_future_director_entitlement_v1(uuid,text)') is not null,
    has_function_privilege('service_role',
      'public.complete_production_future_participant_first_login_v1(jsonb)','EXECUTE'),
    has_function_privilege('authenticated',
      'public.complete_production_future_participant_first_login_v1(jsonb)','EXECUTE'),
    has_function_privilege('service_role',
      'production_control.future_participant_identity_eligibility_v1(text)','EXECUTE'));`),
  "t|t|t|t|t|t|f|f");
  assert.equal(sql(cluster, database, `select concat_ws('|',
    to_regprocedure('public.read_production_annual_google_destination_v1(jsonb)')
      is not null,
    has_function_privilege('service_role',
      'public.read_production_annual_google_destination_v1(jsonb)','EXECUTE'),
    has_function_privilege('authenticated',
      'public.read_production_annual_google_destination_v1(jsonb)','EXECUTE'),
    has_function_privilege('anon',
      'public.read_production_annual_google_destination_v1(jsonb)','EXECUTE'),
    has_table_privilege('service_role',
      'production_control.future_google_writer_targets_v2','SELECT'),
    has_table_privilege('authenticated',
      'production_control.future_google_writer_targets_v2','SELECT'));`),
  "t|t|f|f|f|f");
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select count(*) from production_control.future_google_writer_generations_v2),
    (select count(*) from production_control.future_google_writer_targets_v2),
    (select count(*) from production_control.future_google_writer_certification_receipts_v1),
    (select count(*) from production_control.future_google_writer_certification_audit_v1),
    has_function_privilege('service_role',
      'public.adopt_production_future_google_destination_v1(jsonb)','EXECUTE'),
    has_function_privilege('authenticated',
      'public.adopt_production_future_google_destination_v1(jsonb)','EXECUTE'),
    has_function_privilege('anon',
      'public.certify_production_future_google_writer_target_v1(jsonb)','EXECUTE'));
  `), "0|0|0|0|t|f|f");
  const futureFunctionValues = futureIdentityFunctions.map((signature) =>
    `'${signature.replaceAll("'", "''")}'::regprocedure`);
  assert.equal(sql(cluster, database, `select concat_ws('|',
    bool_and(has_function_privilege('service_role', value.oid, 'EXECUTE')),
    bool_or(has_function_privilege('authenticated', value.oid, 'EXECUTE')),
    bool_or(has_function_privilege('anon', value.oid, 'EXECUTE')))
    from pg_catalog.unnest(array[${futureFunctionValues.join(",")}]) value(oid);`),
  "t|f|f");
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select relrowsecurity from pg_catalog.pg_class
      where oid='participant_identity.future_tournament_identity_contexts_v1'::regclass),
    (select relrowsecurity from pg_catalog.pg_class
      where oid='participant_identity.future_tournament_participant_bindings_v1'::regclass),
    (select relrowsecurity from pg_catalog.pg_class
      where oid='participant_identity.production_participant_enrollment_claims'::regclass),
    has_table_privilege('service_role',
      'participant_identity.future_tournament_identity_contexts_v1','SELECT'),
    has_table_privilege('service_role',
      'participant_identity.future_tournament_participant_bindings_v1','SELECT'));`),
  "t|t|t|f|f");

  const frozenFence = sql(cluster, database, `select
    pg_catalog.pg_get_functiondef(
      'production_control.assert_production_participant_identity_cutover()'::regprocedure
    );`);
  assert.match(frozenFence, /pg_advisory_xact_lock_shared/);
  assert.match(frozenFence, /scoring_admission_lock_key/);
  assert.match(frozenFence, /pointer\.tournament_id <> '2026'/);

  const director = sql(cluster, database, `select
    pg_catalog.pg_get_functiondef(
      'public.read_production_future_director_entitlement_v1(uuid,text)'::regprocedure
    );`);
  assert.match(director, /future_global_owner_eligibility_v1/);
  assert.match(director, /value\.tournament_id = target_id/);
  assert.doesNotMatch(director, /value\.tournament_id = '2026'/);

  sql(cluster, database, String.raw`
    insert into auth.users(id,email,email_confirmed_at) values
      ('00000000-0000-4000-8000-000000000101',
       'owner@baggerinv.com',pg_catalog.clock_timestamp()),
      ('00000000-0000-4000-8000-000000000103',
       'p200@baggerinv.com',pg_catalog.clock_timestamp());
    insert into scoring_authority.players(player_id,display_name) values
      ('OWN01','Global Owner'),('P100','Future First Login'),
      ('P200','Globally Linked Participant');
    insert into scoring_authority.tournaments(
      tournament_id,tournament_year,name,source_workbook_id,scoring_authority
    ) values ('2099',2099,'Future Identity Fixture',
      '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4','SUPABASE');
    insert into scoring_authority.teams(
      tournament_id,team_id,team_side,name
    ) values ('2026','TEAM1',1,'Team 1'),('2099','TEAM1',1,'Team 1');
    insert into scoring_authority.tournament_players(
      tournament_id,player_id,team_id,team_side,source_roster_key
    ) values ('2026','P100','TEAM1',1,'P100'),
      ('2099','P100','TEAM1',1,'P100'),
      ('2026','P200','TEAM1',1,'P200'),
      ('2099','P200','TEAM1',1,'P200');

    with entitlement as (
      insert into production_control.director_entitlements(
        auth_user_id,tournament_id,player_id,role,status,granted_by
      ) values (
        '00000000-0000-4000-8000-000000000101','2026','OWN01',
        'OWNER','ACTIVE','step13e7b'
      ) returning entitlement_id
    ), event_value as (
      insert into production_control.director_entitlement_events(
        entitlement_id,action,actor,reason
      ) select entitlement_id,'GRANTED','step13e7b','owner fixture'
      from entitlement returning entitlement_id,event_id
    )
    insert into production_control.tournament_owner_capabilities_v1(
      tournament_id,player_id,auth_user_id,adopted_from_entitlement_id,
      adopted_entitlement_event_id,adopted_entitlement_event_count,
      status,capability_revision,adopted_by_player_id,adopted_at
    ) select '2026','OWN01',
      '00000000-0000-4000-8000-000000000101',entitlement_id,event_id,1,
      'ACTIVE',1,'OWN01',pg_catalog.clock_timestamp()
    from event_value;
    with entitlement as (
      insert into production_control.director_entitlements(
        auth_user_id,tournament_id,player_id,role,status,granted_by
      ) values (
        '00000000-0000-4000-8000-000000000103','2026','P200',
        'DIRECTOR','ACTIVE','step13e7b'
      ) returning entitlement_id
    )
    insert into production_control.director_entitlement_events(
      entitlement_id,action,actor,reason
    ) select entitlement_id,'GRANTED','step13e7b',
      'frozen predecessor Director fixture' from entitlement;
    insert into participant_identity.user_player_links(
      auth_user_id,player_id,status,link_method,email_identity_hash,
      linked_at,linked_by
    ) values (
      '00000000-0000-4000-8000-000000000101','OWN01','ACTIVE',
      'OWNER_ADOPTION',encode(extensions.digest(
        'owner@baggerinv.com'::text,'sha256'),'hex'),
      pg_catalog.clock_timestamp(),'step13e7b'
    ),(
      '00000000-0000-4000-8000-000000000103','P200','ACTIVE',
      'PRODUCTION_CONTROLLED_FIRST_LOGIN',encode(extensions.digest(
        'p200@baggerinv.com'::text,'sha256'),'hex'),
      pg_catalog.clock_timestamp(),'step13e7b'
    );
    insert into participant_identity.participant_auth_identifiers(
      player_id,auth_user_id,identifier_type,normalized_value_private,
      status,verified_at,verification_source,source_system,
      source_tournament_id,source_configuration_revision,created_by,updated_by
    ) values (
      'OWN01','00000000-0000-4000-8000-000000000101','EMAIL',
      'owner@baggerinv.com','VERIFIED',pg_catalog.clock_timestamp(),
      'OWNER_ADOPTION','PRODUCTION_APPROVED_PARTICIPANT_IDENTITY',
      '2026',1,'step13e7b','step13e7b'
    ),(
      'P200','00000000-0000-4000-8000-000000000103','EMAIL',
      'p200@baggerinv.com','VERIFIED',pg_catalog.clock_timestamp(),
      'PRODUCTION_EMAIL_OTP','PRODUCTION_APPROVED_PARTICIPANT_IDENTITY',
      '2026',1,'step13e7b','step13e7b'
    );

    insert into participant_identity.identity_context_revisions(
      tournament_id,context_revision,configuration_fingerprint,updated_by
    ) values ('2026',1,repeat('a',64),'step13e7b');
    insert into participant_identity.identity_config_import_runs(
      tournament_id,source_system,source_workbook_id,source_fingerprint,
      configuration_revision,status,roster_count,received_count,valid_count,
      missing_count,duplicate_count,malformed_count,shared_count,
      inactive_count,unknown_player_count,mapping_conflict_count,
      requested_by,approved_by,approved_at
    ) values (
      '2026','GOOGLE_SHEETS',
      '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4',repeat('a',64),
      1,'APPROVED',2,2,2,0,0,0,0,0,0,0,
      'step13e7b','step13e7b',pg_catalog.clock_timestamp()
    );
    insert into participant_identity.participant_identity_contacts(
      tournament_id,player_id,email,email_normalized,identity_active,
      configuration_revision,verified_by,verified_at,source_system,
      source_workbook_id,source_updated_at
    ) values (
      '2026','P100','p100@baggerinv.com','p100@baggerinv.com',true,1,
      'step13e7b',pg_catalog.clock_timestamp(),'GOOGLE_SHEETS',
      '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4',
      pg_catalog.clock_timestamp()
    ),(
      '2026','P200','p200@baggerinv.com','p200@baggerinv.com',true,1,
      'step13e7b',pg_catalog.clock_timestamp(),'GOOGLE_SHEETS',
      '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4',
      pg_catalog.clock_timestamp()
    );

    insert into production_control.future_tournament_catalog_v1(
      tournament_id,tournament_year,contract_version,tournament_name,
      lifecycle,lifecycle_revision,setup_revision,creation_mode,
      created_by_player_id,created_by_auth_user_id
    ) values (
      '2099',2099,'production-future-year-administration-v1',
      'Future Identity Fixture','READY_FOR_ACTIVATION',1,1,'BLANK',
      'OWN01','00000000-0000-4000-8000-000000000101'
    );
    insert into production_control.future_annual_runtime_generations_v1(
      runtime_generation_id,tournament_id,generation_status,runtime_revision,
      pointer_revision,authority_generation_id,admission_generation_id,
      authority,ingress_state,readiness_fingerprint
    ) values (
      '10000000-0000-4000-8000-000000000001','2099','PREPARED',1,2,
      '20000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000003',
      'SUPABASE','OPEN',repeat('b',64)
    );
    insert into production_control.future_tournament_resources_v1(
      tournament_id,project_ref,project_url,source_workbook_id,
      resource_status,resource_revision,google_compatibility_policy,
      updated_by_player_id
    ) values (
      '2099','ymqhhtxaywtqllynrmxe',
      'https://ymqhhtxaywtqllynrmxe.supabase.co',
      'future-net-skins-workbook-2099','CURRENT_RESOURCE_BOUND',1,
      'PROVISIONING_REQUIRED','OWN01'
    );
    insert into production_control.future_runtime_promotions_v2(
      tournament_id,contract_version,promotion_revision,
      source_setup_revision,promoted_manifest_fingerprint,runtime_status,
      promoted_by_player_id,promoted_by_auth_user_id
    ) values (
      '2099','production-future-runtime-activation-v2',1,1,
      repeat('c',64),'READY','OWN01',
      '00000000-0000-4000-8000-000000000101'
    );
    insert into production_control.future_google_writer_generations_v2(
      writer_generation_id,contract_version,destination_workbook_id,
      implementation_fingerprint,certification_status
    ) values (
      '40000000-0000-4000-8000-000000000004',
      'production-future-google-match-provisioning-v2',
      'future-net-skins-workbook-2099',
      production_control.future_google_writer_implementation_fingerprint_v2(),
      'CERTIFIED'
    );
    insert into production_control.future_google_writer_targets_v2(
      tournament_id,writer_generation_id,destination_workbook_id,
      target_contract_fingerprint,contract_status,
      certification_contract_version,resource_revision,promotion_revision,
      source_setup_revision,promoted_manifest_fingerprint,
      resource_binding_fingerprint
    ) values (
      '2099','40000000-0000-4000-8000-000000000004',
      'future-net-skins-workbook-2099',repeat('e',64),'CERTIFIED',
      'production-annual-google-writer-certification-v1',1,1,1,
      repeat('c',64),repeat('f',64)
    );
  `);
  // Make the disposable writer target an exact live attestation so the same
  // capability assertion used by ACTIVATE reaches the side-game certificate.
  // Replication mode is limited to repairing this synthetic immutable fixture.
  sql(cluster, database, `
    set session_replication_role=replica;
    update production_control.future_google_writer_targets_v2 set
      resource_binding_fingerprint = production_control
        .future_google_writer_resource_fingerprint_v1('2099')
      where tournament_id='2099';
    update production_control.future_google_writer_targets_v2 set
      target_contract_fingerprint = production_control
        .future_google_writer_target_fingerprint_v1('2099')
      where tournament_id='2099';
    set session_replication_role=origin;
  `);

  const inheritedDirectorCount = sql(cluster, database, `select count(*)
    from production_control.director_entitlements
    where tournament_id='2099'
      and auth_user_id='00000000-0000-4000-8000-000000000103'
      and status='ACTIVE';`);
  assert.equal(inheritedDirectorCount, "0",
    "a 2026 Director must not inherit future tournament authority");
  sql(cluster, database, `
    insert into participant_identity.tournament_roles(
      tournament_id,auth_user_id,role,role_active,granted_by
    ) values (
      '2099','00000000-0000-4000-8000-000000000103',
      'DIRECTOR',true,'step13e7b-explicit-future-director'
    );
    with entitlement as (
      insert into production_control.director_entitlements(
        auth_user_id,tournament_id,player_id,role,status,granted_by
      ) values (
        '00000000-0000-4000-8000-000000000103','2099','P200',
        'DIRECTOR','ACTIVE','step13e7b-explicit-future-director'
      ) returning entitlement_id
    )
    insert into production_control.director_entitlement_events(
      entitlement_id,action,actor,reason
    ) select entitlement_id,'GRANTED','step13e7b',
      'explicit current-year Director fixture' from entitlement;
  `);

  const identityReadiness = JSON.parse(sql(cluster, database, `select
    production_control.future_participant_identity_readiness_v1('2099')::text;`));
  assert.equal(identityReadiness.ready, true);
  assert.equal(identityReadiness.partialRosterPolicy, true);
  assert.equal(identityReadiness.rosterCount, 2);
  assert.equal(identityReadiness.approvedContactCount, 2);
  assert.equal(identityReadiness.linkedVerifiedCount, 1);
  assert.equal(identityReadiness.notEnrolledCount, 1);
  assert.equal(identityReadiness.ownerEligibleCount, 1);

  const bound = JSON.parse(sql(cluster, database, `select
    production_control.bind_future_participant_identity_runtime_v1(
      '2099','10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000003',
      'OWN01','00000000-0000-4000-8000-000000000101'
    )::text;`));
  assert.equal(bound.rosterCount, 2);
  assert.equal(bound.approvedContactCount, 2);
  assert.equal(bound.enrolledCount, 1);
  assert.equal(bound.notEnrolledCount, 1);
  const sideGameCertification = JSON.parse(sql(cluster, database, `select
    production_control.ensure_annual_side_game_runtime_v1(
      '2099','10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000003',true
    )::text;`));
  assert.equal(sideGameCertification.ok, true);
  assert.equal(sideGameCertification.tournamentId, "2099");
  assert.match(sideGameCertification.certificationFingerprint,
    /^[0-9a-f]{64}$/);
  assert.equal(sql(cluster, database, `select count(*) from
    production_control.annual_side_game_runtime_certifications_v1;`), "1");

  const retainedImplementation = JSON.parse(sql(cluster, database, `select
    implementation_manifest::text from
      production_control.annual_side_game_runtime_certifications_v1
    where runtime_generation_id =
      '10000000-0000-4000-8000-000000000001';`));
  assert.equal(retainedImplementation.coreRuntime.functions.length, 7);
  assert.ok(retainedImplementation.coreRuntime.functions.every((value) =>
    value.securityDefiner === true
      && value.configuration.length === 1
      && value.configuration[0] === "search_path=pg_catalog"
      && value.effectiveExecute.anon === false
      && value.effectiveExecute.authenticated === false
      && value.effectiveExecute.serviceRole === false
      && typeof value.source === "string"
      && /^[0-9a-f]{64}$/.test(value.definitionFingerprint)));
  assert.equal(
    retainedImplementation.derivedTriggerFunction.securityDefiner, true);
  assert.deepEqual(
    retainedImplementation.derivedTriggerFunction.configuration,
    ["search_path=pg_catalog"]);
  assert.deepEqual(
    retainedImplementation.derivedTriggerFunction.effectiveExecute,
    { anon: false, authenticated: false, serviceRole: false });

  // This is the exact capability assertion invoked by PREPARE, DRAIN, and
  // ACTIVATE. Replacing any transitive core body changes retained evidence;
  // weakening SECURITY DEFINER, the fixed path, or an effective API-role ACL
  // fails even before the immutable certificate comparison.
  const annualCapability = `perform production_control
    .assert_future_scoring_runtime_capability_v1(
      '2099','10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000003'
    )`;
  for (const [label, tamper, expectedError] of [
    ["body", String.raw`
      create or replace function production_control
        .assert_future_production_scoring_runtime_v1(
          input jsonb, required_worker text default null
        ) returns text language plpgsql security definer
        set search_path=pg_catalog as $tampered$
        begin return null; end
        $tampered$`,
    "PRODUCTION_ANNUAL_SIDE_GAME_CERTIFICATION_REQUIRED"],
    ["security", `alter function production_control
      .assert_annual_scoring_platform_v1(jsonb,text,text)
      security invoker`,
    "PRODUCTION_ANNUAL_CORE_RUNTIME_SECURITY_REQUIRED"],
    ["path", `alter function production_control
      .annual_scoring_platform_certification_v1(jsonb)
      set search_path=public`,
    "PRODUCTION_ANNUAL_CORE_RUNTIME_SECURITY_REQUIRED"],
    ["acl", `grant execute on function production_control
      .assert_annual_scoring_runtime_pre_side_games_v1(jsonb,text,text)
      to service_role`,
    "PRODUCTION_ANNUAL_CORE_RUNTIME_SECURITY_REQUIRED"],
  ]) {
    assert.equal(sql(cluster, database, `begin; ${tamper};
      do $test$ begin
        ${annualCapability};
        raise exception 'EXPECTED_CORE_RUNTIME_TAMPER_REJECTION';
      exception when sqlstate '55000' then
        if sqlerrm <> '${expectedError}' then raise; end if;
      end $test$;
      rollback; select 'core-${label}-tamper-rejected';`),
    `core-${label}-tamper-rejected`);
  }

  // The nine trigger bindings and the executable they share are independent
  // evidence. Keep every trigger unchanged while tampering the function so
  // body, SECURITY, path, and ACL drift each prove ACTIVATE fails closed.
  for (const [label, tamper, expectedError] of [
    ["body", String.raw`
      create or replace function
        scoring_authority.enqueue_annual_derived_v1_change()
      returns trigger language plpgsql security definer
      set search_path=pg_catalog as $tampered$
      begin
        if tg_op = 'DELETE' then return old; end if;
        return new;
      end
      $tampered$`,
    "PRODUCTION_ANNUAL_SIDE_GAME_CERTIFICATION_REQUIRED"],
    ["security", `alter function
      scoring_authority.enqueue_annual_derived_v1_change()
      security invoker`,
    "PRODUCTION_ANNUAL_DERIVED_TRIGGER_FUNCTION_SECURITY_REQUIRED"],
    ["path", `alter function
      scoring_authority.enqueue_annual_derived_v1_change()
      set search_path=public`,
    "PRODUCTION_ANNUAL_DERIVED_TRIGGER_FUNCTION_SECURITY_REQUIRED"],
    ["acl", `grant execute on function
      scoring_authority.enqueue_annual_derived_v1_change()
      to authenticated`,
    "PRODUCTION_ANNUAL_DERIVED_TRIGGER_FUNCTION_SECURITY_REQUIRED"],
  ]) {
    assert.equal(sql(cluster, database, `begin; ${tamper};
      do $test$ begin
        ${annualCapability};
        raise exception 'EXPECTED_DERIVED_TRIGGER_TAMPER_REJECTION';
      exception when sqlstate '55000' then
        if sqlerrm <> '${expectedError}' then raise; end if;
      end $test$;
      rollback; select 'derived-${label}-tamper-rejected';`),
    `derived-${label}-tamper-rejected`);
  }

  // A completed calculation remains predecessor work until it is published.
  // Retired mirror history is terminal only after success/supersession.
  sql(cluster, database, `
    insert into scoring_authority.odds_calculation_jobs(
      job_id,tournament_id,phase,total_iterations,completed_iterations,
      engine_version,publication_contract_version,
      checkpoint_contract_version,deterministic_seed,input_fingerprint,
      settings_fingerprint,invocation_fingerprint,source_revision,
      input_snapshot,checkpoint_payload,checkpoint_hash,status,requested_by,
      output_timestamp,production_operation_mode,
      production_deployment_commit,publication_status
    ) values (
      repeat('8',64),'2026','Pre-Tournament',10000,10000,
      'annual-close-fence-fixture','production-odds-publication-v1',
      'production-odds-checkpoint-v1','annual-close-fence',repeat('6',64),
      repeat('7',64),repeat('8',64),jsonb_build_object(
        'production_job_identity_contract',
          'production-odds-calculation-job-identity-v2'
      ),'{}'::jsonb,'{}'::jsonb,repeat('9',64),'SUCCEEDED',
      'annual-close-fence-fixture',pg_catalog.clock_timestamp(),
      'PRODUCTION_CUTOVER',repeat('a',40),'READY'
    );
    set session_replication_role=replica;
    insert into scoring_authority.odds_google_mirror_jobs(
      id,tournament_id,snapshot_id,status
    ) values (
      '80000000-0000-4000-8000-000000000008','2026',
      '81000000-0000-4000-8000-000000000008','PENDING'
    );
    set session_replication_role=origin;
  `);
  const oddsBlocked = JSON.parse(sql(cluster, database, `select
    production_control.annual_scoring_predecessor_certificate_v1(
      '2026'
    )::text;`));
  assert.equal(oddsBlocked.sideGameDrain.oddsUnresolved, 1);
  assert.equal(oddsBlocked.sideGameDrain.oddsMirrorRows, 1);
  assert.ok(oddsBlocked.blockers.includes(
    "PREDECESSOR_ODDS_DRAIN_INCOMPLETE"));
  assert.ok(oddsBlocked.blockers.includes(
    "PREDECESSOR_ODDS_RETIRED_MIRROR_PRESENT"));

  sql(cluster, database, `
    update scoring_authority.odds_calculation_jobs
      set status='FAILED',publication_status='NOT_REQUESTED'
      where job_id=repeat('8',64);
    update scoring_authority.odds_google_mirror_jobs
      set status='SUCCEEDED'
      where id='80000000-0000-4000-8000-000000000008';
  `);
  const oddsTerminal = JSON.parse(sql(cluster, database, `select
    production_control.annual_scoring_predecessor_certificate_v1(
      '2026'
    )::text;`));
  assert.equal(oddsTerminal.sideGameDrain.oddsUnresolved, 0);
  assert.equal(oddsTerminal.sideGameDrain.oddsMirrorRows, 0);
  assert.equal(oddsTerminal.blockers.includes(
    "PREDECESSOR_ODDS_DRAIN_INCOMPLETE"), false);
  assert.equal(oddsTerminal.blockers.includes(
    "PREDECESSOR_ODDS_RETIRED_MIRROR_PRESENT"), false);
  sql(cluster, database, `
    delete from scoring_authority.odds_google_mirror_jobs
      where id='80000000-0000-4000-8000-000000000008';
    delete from scoring_authority.odds_calculation_jobs
      where job_id=repeat('8',64);
  `);

  // The exact trigger topology is part of the future-runtime implementation
  // certificate. Disabled, missing, rebound, or predicate-filtered bindings
  // must all fail closed, while the transaction rollback restores the exact
  // installed topology for the remaining behavioral checks.
  for (const tamper of [
    `alter table scoring_authority.hole_scores disable trigger
       production_annual_derived_v1_hole_score_change`,
    `drop trigger production_annual_derived_v1_hole_score_change
       on scoring_authority.hole_scores`,
    `drop trigger production_annual_derived_v1_hole_score_change
       on scoring_authority.hole_scores;
     create trigger production_annual_derived_v1_hole_score_change
       after insert or update or delete on scoring_authority.hole_scores
       for each row execute function
         scoring_authority.enqueue_annual_net_skins_v1_change()`,
    `drop trigger production_annual_derived_v1_hole_score_change
       on scoring_authority.hole_scores;
     create trigger production_annual_derived_v1_hole_score_change
       after insert or update or delete on scoring_authority.hole_scores
       for each row when (false) execute function
         scoring_authority.enqueue_annual_derived_v1_change()`,
  ]) {
    assert.equal(sql(cluster, database, `begin; ${tamper};
      do $test$ begin
        perform production_control
          .annual_side_game_implementation_manifest_v1();
        raise exception 'EXPECTED_TRIGGER_BINDING_REJECTION';
      exception when sqlstate '55000' then
        if sqlerrm <> 'PRODUCTION_ANNUAL_SIDE_GAME_TRIGGER_BINDING_REQUIRED'
        then raise; end if;
      end $test$;
      rollback; select 'trigger-tamper-rejected';`),
    "trigger-tamper-rejected");
  }
  const implementationManifest = JSON.parse(sql(cluster, database, `select
    production_control.annual_side_game_implementation_manifest_v1()::text;`));
  assert.equal(implementationManifest.triggerBindings.length, 9);
  assert.ok(implementationManifest.triggerBindings.every((value) =>
    value.enabled === "O" && value.predicateAbsent === true));

  // The dispatcher is the sole service-role API boundary. Every allowlisted
  // target remains private even if a caller knows the target RPC name.
  assert.equal(sql(cluster, database, `select concat_ws('|',
    count(*) filter (where allowlist.enabled),
    count(*) filter (where allowlist.enabled and (
      has_function_privilege('anon', procedure_value.oid, 'EXECUTE')
      or has_function_privilege(
        'authenticated', procedure_value.oid, 'EXECUTE'
      )
      or has_function_privilege(
        'service_role', procedure_value.oid, 'EXECUTE'
      )
    )),
    has_function_privilege('service_role',
      'public.dispatch_production_annual_scoring_v1(jsonb)','EXECUTE'),
    has_function_privilege('authenticated',
      'public.dispatch_production_annual_scoring_v1(jsonb)','EXECUTE'),
    has_function_privilege('anon',
      'public.dispatch_production_annual_scoring_v1(jsonb)','EXECUTE'))
    from production_control.annual_scoring_rpc_allowlist_v1 allowlist
    join pg_catalog.pg_proc procedure_value on procedure_value.oid =
      pg_catalog.to_regprocedure(allowlist.target_rpc || '(jsonb)');`),
  `${implementationManifest.annualDispatchSecurity.targets.length}|0|t|f|f`);
  assert.throws(() => sql(cluster, database, `set role service_role;
    select public.future_production_claim_net_skins_recalculation_v1(
      '{}'::jsonb
    );`), /permission denied for function/);
  assert.equal(sql(cluster, database, `begin;
    grant execute on function
      public.future_production_claim_net_skins_recalculation_v1(jsonb)
      to service_role;
    do $test$ begin
      perform production_control
        .annual_side_game_implementation_manifest_v1();
      raise exception 'EXPECTED_PRIVILEGE_TOPOLOGY_REJECTION';
    exception when sqlstate '55000' then
      if sqlerrm <>
        'PRODUCTION_ANNUAL_DISPATCH_PRIVILEGE_TOPOLOGY_REQUIRED'
      then raise; end if;
    end $test$;
    rollback; select 'privilege-drift-rejected';`),
  "privilege-drift-rejected");

  // Establish a disposable but exact current-2026 scoring fact. The source
  // mutation is canonical; it is not a fabricated Production mutation because
  // this entire cluster is isolated and removed at test completion.
  sql(cluster, database, `
    update production_control.cutover_activation_state set
      state='SCORING_COMMITTED', current_authority='SUPABASE',
      scoring_ingress_enabled=true, expected_deployment_commit=repeat('7',40),
      boundary_mode='MAINTENANCE_WINDOW_V1', read_cutover_phase='OBSERVATION',
      maintenance_state='NORMAL', active_transition_epoch_id=null
      where scope_key='BAGGER_INV_PRODUCTION';
    update production_control.resource_scope set
      current_tournament_read_authority='SUPABASE',
      scoring_authority='SUPABASE', scoring_ingress_enabled=true,
      google_writes_enabled=true, workers_enabled=true
      where scope_key='BAGGER_INV_PRODUCTION';
    set session_replication_role=replica;
    update scoring_authority.ingress_gates gate set
      state='OPEN', authority='SUPABASE',
      active_epoch_id=activation.authority_generation_id,
      admission_state='OPEN', active_closure_id=null,
      admission_deployment_id='dpl_IdentityMobile070',
      admission_protocol_enforced=true,
      admission_enforced_at=pg_catalog.clock_timestamp(),
      admission_opened_at=pg_catalog.clock_timestamp(),
      legacy_lease_set_fingerprint=repeat('0',64),
      boundary_mode='MAINTENANCE_WINDOW_V1'
      from production_control.cutover_activation_state activation
      where gate.tournament_id='2026'
        and activation.scope_key='BAGGER_INV_PRODUCTION';
    set session_replication_role=origin;
    update production_control.maintenance_deployment_capability_bindings
      set capability_fingerprint=encode(extensions.digest(
        capability_manifest::text,'sha256'),'hex')
      where deployment_id='dpl_IdentityMobile070';
    insert into scoring_authority.rounds(
      tournament_id,round_number,format,name,status
    ) values ('2026',3,'SI','Derived fence fixture','UPCOMING')
      on conflict (tournament_id,round_number) do nothing;
    insert into scoring_authority.scoring_snapshots(
      snapshot_id,tournament_id,match_id,snapshot_revision,
      scoring_rules_version,format,handicap_allowance,course_id,tee,
      rating,slope,par,match_netting_baseline,hole_definitions,
      participant_configuration,team_configuration,canonical_hash
    ) values (
      'DERIVED-FENCE-SNAPSHOT-2026','2026','DERIVED-FENCE-MATCH-2026',1,
      'derived-fence-fixture-v1','SI',100,'DERIVED-COURSE','DERIVED-TEE',
      72,113,72,'MATCH_PLAY',(
        select jsonb_agg(jsonb_build_object(
          'hole_number',hole,'stroke_index',hole,'par',4
        ) order by hole) from pg_catalog.generate_series(1,18) hole
      ),'{}'::jsonb,'{}'::jsonb,
      repeat('d',64)
    ) on conflict (snapshot_id) do nothing;
    insert into scoring_authority.matches(
      match_id,tournament_id,round_number,format,scoring_snapshot_id,status
    ) values (
      'DERIVED-FENCE-MATCH-2026','2026',3,'SI',
      'DERIVED-FENCE-SNAPSHOT-2026','UPCOMING'
    ) on conflict (match_id) do nothing;
    delete from scoring_authority.competition_recalculation_jobs
      where tournament_id='2026' and round_number=0 and engine_key in (
        'TEAM_MOMENTUM','TOURNAMENT_STORYLINES',
        'TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL',
        'TOURNAMENT_FINAL_RECAP','NET_SKINS','CALCUTTA'
      );
  `);

  const terminalBefore = JSON.parse(sql(cluster, database, `select
    production_control.annual_scoring_predecessor_certificate_v1(
      '2026'
    )::text;`));
  assert.equal(terminalBefore.derivedWorkerDrain.competitionUnresolved, 0);
  assert.equal(terminalBefore.derivedWorkerDrain.intelligenceUnresolved, 0);

  // Legacy NET_SKINS/CALCUTTA rows in the old shared queue are no longer
  // owned by this drain and cannot create a false annual-close blocker.
  sql(cluster, database, `insert into
    scoring_authority.competition_recalculation_jobs(
      tournament_id,round_number,engine_key,status,
      requested_source_revision
    ) values ('2026',0,'NET_SKINS','PENDING','{}'),
      ('2026',0,'CALCUTTA','RUNNING','{}');`);
  const legacySideGameRowsIgnored = JSON.parse(sql(cluster, database, `select
    production_control.annual_scoring_predecessor_certificate_v1(
      '2026'
    )::text;`));
  assert.equal(
    legacySideGameRowsIgnored.derivedWorkerDrain.competitionUnresolved, 0);
  assert.equal(
    legacySideGameRowsIgnored.derivedWorkerDrain.intelligenceUnresolved, 0);
  sql(cluster, database, `delete from
    scoring_authority.competition_recalculation_jobs
    where tournament_id='2026' and round_number=0
      and engine_key in ('NET_SKINS','CALCUTTA');`);

  sql(cluster, database, `insert into scoring_authority.hole_scores(
    match_id,hole_number,hole_revision,team_1_gross_scores,
    team_2_gross_scores,team_1_strokes,team_2_strokes,
    team_1_net_score,team_2_net_score,hole_winner,mutation_key,actor_id
  ) values (
    'DERIVED-FENCE-MATCH-2026',1,1,'{}','{}','{}','{}',4,4,
    'Halved','derived-fence-1','step13e7b'
  );`);
  assert.deepEqual(JSON.parse(sql(cluster, database, `select
    jsonb_agg(engine_key order by engine_key)::text
    from scoring_authority.competition_recalculation_jobs
    where tournament_id='2026' and round_number=0;`)), [
    "PROJECTION_EDITORIAL", "TEAM_MOMENTUM", "TOURNAMENT_FINAL_RECAP",
    "TOURNAMENT_INTELLIGENCE", "TOURNAMENT_STORYLINES",
  ]);
  assert.equal(sql(cluster, database, `select concat_ws('|',
    count(*), count(*) filter (where status='PENDING'),
    count(*) filter (where runtime_generation_id is null),
    count(*) filter (where
      requested_source_revision->>'reason'='CANONICAL_HOLE_SCORE_CHANGED'
      and requested_source_revision->>'transactional'='true'))
    from scoring_authority.competition_recalculation_jobs
    where tournament_id='2026' and round_number=0;`), "5|5|5|5");
  const dirty = JSON.parse(sql(cluster, database, `select
    production_control.annual_scoring_predecessor_certificate_v1(
      '2026'
    )::text;`));
  assert.equal(dirty.derivedWorkerDrain.competitionUnresolved, 2);
  assert.equal(dirty.derivedWorkerDrain.intelligenceUnresolved, 3);
  assert.ok(dirty.blockers.includes(
    "PREDECESSOR_DERIVED_WORK_DRAIN_INCOMPLETE"));
  assert.notEqual(dirty.fingerprint, terminalBefore.fingerprint);
  assert.throws(() => sql(cluster, database, `select
    production_control.close_annual_scoring_predecessor_v1(
      '{}'::jsonb,'2026'
    );`), /PRODUCTION_ANNUAL_PREDECESSOR_DERIVED_WORK_PENDING/);

  sql(cluster, database, `update
    scoring_authority.competition_recalculation_jobs set
      status=case when engine_key in (
        'TEAM_MOMENTUM','TOURNAMENT_STORYLINES'
      ) then 'SUCCEEDED' else 'FAILED' end,
      completed_at=pg_catalog.clock_timestamp()
    where tournament_id='2026' and round_number=0;`);
  const derivedTerminal = JSON.parse(sql(cluster, database, `select
    production_control.annual_scoring_predecessor_certificate_v1(
      '2026'
    )::text;`));
  assert.equal(derivedTerminal.derivedWorkerDrain.competitionUnresolved, 0);
  assert.equal(derivedTerminal.derivedWorkerDrain.intelligenceUnresolved, 3);
  assert.ok(derivedTerminal.blockers.includes(
    "PREDECESSOR_DERIVED_WORK_DRAIN_INCOMPLETE"));
  assert.notEqual(derivedTerminal.fingerprint, dirty.fingerprint);
  assert.throws(() => sql(cluster, database, `select
    production_control.close_annual_scoring_predecessor_v1(
      '{}'::jsonb,'2026'
    );`), /PRODUCTION_ANNUAL_PREDECESSOR_DERIVED_WORK_PENDING/);
  sql(cluster, database, `update
    scoring_authority.competition_recalculation_jobs set
      status='SUCCEEDED', completed_at=pg_catalog.clock_timestamp()
    where tournament_id='2026' and round_number=0;`);
  const allDerivedSucceeded = JSON.parse(sql(cluster, database, `select
    production_control.annual_scoring_predecessor_certificate_v1(
      '2026'
    )::text;`));
  assert.equal(allDerivedSucceeded.derivedWorkerDrain.competitionUnresolved, 0);
  assert.equal(allDerivedSucceeded.derivedWorkerDrain.intelligenceUnresolved, 0);
  assert.equal(allDerivedSucceeded.blockers.includes(
    "PREDECESSOR_DERIVED_WORK_DRAIN_INCOMPLETE"), false);

  // Source mutation wins the shared lock first: CLOSE waits, then observes
  // the committed dirty marker and fails. This proves there is no score
  // commit -> application-after-hook gap.
  sql(cluster, database, `delete from
    scoring_authority.competition_recalculation_jobs
    where tournament_id='2026' and round_number=0;`);
  const sourceFirst = markedTransaction(cluster, database, `begin;
    insert into scoring_authority.hole_scores(
      match_id,hole_number,hole_revision,team_1_gross_scores,
      team_2_gross_scores,team_1_strokes,team_2_strokes,
      team_1_net_score,team_2_net_score,hole_winner,mutation_key,actor_id
    ) values (
      'DERIVED-FENCE-MATCH-2026',2,1,'{}','{}','{}','{}',4,4,
      'Halved','derived-fence-2','step13e7b'
    );
    select 'SOURCE_LOCKED'; select pg_sleep(0.5); commit;`,
  "SOURCE_LOCKED");
  await sourceFirst.ready;
  const waitingClose = sqlAsync(cluster, database, `do $test$ begin
    perform production_control.close_annual_scoring_predecessor_v1(
      '{}'::jsonb,'2026'
    );
    raise exception 'EXPECTED_DERIVED_DRAIN_REJECTION';
  exception when sqlstate '55000' then
    if sqlerrm <> 'PRODUCTION_ANNUAL_PREDECESSOR_DERIVED_WORK_PENDING'
    then raise; end if;
  end $test$; select 'close-observed-source-dirty-marker';`);
  const [sourceFirstResult, waitingCloseResult] = await Promise.all([
    sourceFirst.completed, waitingClose,
  ]);
  assert.match(sourceFirstResult, /SOURCE_LOCKED/);
  assert.equal(waitingCloseResult, "close-observed-source-dirty-marker");

  // CLOSE wins the exclusive lock first: a later canonical source mutation
  // waits, rechecks admission, and rolls back both fact and job changes.
  sql(cluster, database, `delete from
    scoring_authority.competition_recalculation_jobs
    where tournament_id='2026' and round_number=0;`);
  const closeFirst = markedTransaction(cluster, database, `begin;
    select pg_advisory_xact_lock(
      production_control.scoring_admission_lock_key()
    );
    update scoring_authority.ingress_gates set state='PAUSED'
      where tournament_id='2026';
    select 'CLOSE_LOCKED'; select pg_sleep(0.5); commit;`, "CLOSE_LOCKED");
  await closeFirst.ready;
  const waitingSource = sqlAsync(cluster, database, `do $test$ begin
    insert into scoring_authority.hole_scores(
      match_id,hole_number,hole_revision,team_1_gross_scores,
      team_2_gross_scores,team_1_strokes,team_2_strokes,
      team_1_net_score,team_2_net_score,hole_winner,mutation_key,actor_id
    ) values (
      'DERIVED-FENCE-MATCH-2026',3,1,'{}','{}','{}','{}',4,4,
      'Halved','derived-fence-3','step13e7b'
    );
    raise exception 'EXPECTED_CLOSED_ADMISSION_REJECTION';
  exception when sqlstate '55000' then
    if sqlerrm <> 'PRODUCTION_ANNUAL_DERIVED_ADMISSION_CLOSED'
    then raise; end if;
  end $test$; select 'source-rejected-after-close';`);
  const [closeFirstResult, waitingSourceResult] = await Promise.all([
    closeFirst.completed, waitingSource,
  ]);
  assert.match(closeFirstResult, /CLOSE_LOCKED/);
  assert.equal(waitingSourceResult, "source-rejected-after-close");
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select count(*) from scoring_authority.hole_scores
      where match_id='DERIVED-FENCE-MATCH-2026' and hole_number=3),
    (select count(*) from scoring_authority.competition_recalculation_jobs
      where tournament_id='2026' and round_number=0));`), "0|0");
  sql(cluster, database, `update scoring_authority.ingress_gates
    set state='OPEN' where tournament_id='2026';`);

  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select count(*) from scoring_authority.tournament_players
      where tournament_id='2099' and player_id='OWN01'),
    (select count(*) from participant_identity.tournament_roles
      where tournament_id='2099' and role='DIRECTOR'),
    (select count(*) from production_control.director_entitlements
      where tournament_id='2099'),
    (select count(*) from participant_identity.tournament_roles
      where tournament_id='2099' and role='PARTICIPANT'
        and auth_user_id='00000000-0000-4000-8000-000000000103'),
    (select count(*) from auth.users));`), "0|1|1|1|2");

  sql(cluster, database, `
    update production_control.future_tournament_catalog_v1
      set lifecycle='CLOSED',lifecycle_revision=2
      where tournament_id='2026';
    update production_control.future_tournament_catalog_v1
      set lifecycle='ACTIVE',lifecycle_revision=2
      where tournament_id='2099';
    update production_control.current_tournament_pointer_v1
      set tournament_id='2099',tournament_year=2099,pointer_revision=2,
        lifecycle_revision=2,updated_by_player_id='OWN01',
        updated_by_auth_user_id='00000000-0000-4000-8000-000000000101',
        updated_at=pg_catalog.clock_timestamp()
      where scope_key='BAGGER_INV_PRODUCTION';
    update production_control.future_annual_runtime_generations_v1
      set generation_status='ACTIVE',
        activated_by_player_id='OWN01',
        activated_by_auth_user_id='00000000-0000-4000-8000-000000000101',
        activated_at=pg_catalog.clock_timestamp()
      where tournament_id='2099';
    update production_control.future_runtime_promotions_v2
      set runtime_status='ACTIVE' where tournament_id='2099';
  `);
  const activeSideGameCertification = JSON.parse(sql(cluster, database,
    `select production_control.ensure_annual_side_game_runtime_v1(
      '2099','10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000003',false
    )::text;`));
  assert.equal(activeSideGameCertification.certificationFingerprint,
    sideGameCertification.certificationFingerprint,
    "the READY to ACTIVE lifecycle transition must not invalidate the exact implementation/resource certificate");
  assert.equal(sql(cluster, database, `select
    production_control.assert_future_participant_identity_runtime_v1();`),
  "2099");

  const reused = JSON.parse(sql(cluster, database, `select
    public.authorize_production_future_participant_otp_request_v1(
      jsonb_build_object('email','p200@baggerinv.com',
        'client_request_hash',repeat('e',64),
        'target_tournament_id','2026')
    )::text;`));
  assert.equal(reused.allowed, true);
  assert.equal(reused.provisioningRequired, false);
  assert.equal(reused.verificationType, "email");
  assert.equal(reused.authUserId,
    "00000000-0000-4000-8000-000000000103");
  assert.equal(reused.playerId, "P200");
  assert.equal(reused.tournamentId, "2099");
  assert.equal(sql(cluster, database, "select count(*) from auth.users;"), "2");

  const claim = JSON.parse(sql(cluster, database, `select
    public.authorize_production_future_participant_otp_request_v1(
      jsonb_build_object('email','p100@baggerinv.com',
        'client_request_hash',repeat('c',64),
        'target_tournament_id','2026','tournament_id','2026')
    )::text;`));
  assert.equal(claim.provisioningRequired, true);
  assert.equal(claim.tournamentId, "2099");
  assert.equal(claim.playerId, "P100");
  sql(cluster, database, `
    insert into auth.users(id,email,raw_app_meta_data) values (
      '00000000-0000-4000-8000-000000000102','p100@baggerinv.com',
      jsonb_build_object(
        'provisioning_scope','production_controlled_first_login',
        'player_id','P100','tournament_id','2099'
      )
    );
  `);
  const completed = JSON.parse(sql(cluster, database, `select
    public.complete_production_future_participant_first_login_v1(
      jsonb_build_object('claim_id','${claim.claimId}',
        'auth_user_id','00000000-0000-4000-8000-000000000102')
    )::text;`));
  assert.equal(completed.tournamentId, "2099");
  assert.equal(completed.idempotent, false);

  const authorization = JSON.parse(sql(cluster, database, `select
    public.authorize_production_future_participant_otp_request_v1(
      jsonb_build_object('email','p100@baggerinv.com',
        'client_request_hash',repeat('d',64))
    )::text;`));
  assert.equal(authorization.allowed, true);
  assert.equal(authorization.verificationType, "signup");
  assert.equal(authorization.tournamentId, "2099");
  sql(cluster, database, `select
    public.record_production_future_participant_otp_delivery_v1(
      jsonb_build_object('request_id','${authorization.requestId}',
        'succeeded',true,'duration_ms',1)
    );`);
  const verifyAuthorization = JSON.parse(sql(cluster, database, `select
    public.authorize_production_future_participant_otp_verification_v1(
      jsonb_build_object('request_id','${authorization.requestId}',
        'email_identity_hash',encode(extensions.digest(
          'p100@baggerinv.com'::text,'sha256'),'hex'))
    )::text;`));
  assert.equal(verifyAuthorization.allowed, true);
  assert.equal(verifyAuthorization.verificationType, "signup");

  sql(cluster, database, `update auth.users
    set email_confirmed_at=pg_catalog.clock_timestamp()
    where id='00000000-0000-4000-8000-000000000102';`);
  const verified = JSON.parse(sql(cluster, database, `select
    public.record_production_future_participant_otp_verification_v1(
      jsonb_build_object('request_id','${authorization.requestId}',
        'auth_user_id','00000000-0000-4000-8000-000000000102',
        'succeeded',true,'duration_ms',2)
    )::text;`));
  assert.equal(verified.status, "VERIFIED");
  assert.equal(verified.duplicate, false);
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select enrollment_state
      from participant_identity.future_tournament_participant_bindings_v1
      where tournament_id='2099' and player_id='P100'),
    (select status from participant_identity.user_player_links
      where player_id='P100'),
    (select status from participant_identity.participant_auth_identifiers
      where player_id='P100' and identifier_type='EMAIL'),
    (select count(*) from participant_identity.tournament_roles
      where tournament_id='2099'
        and auth_user_id='00000000-0000-4000-8000-000000000102'
        and role='PARTICIPANT' and role_active));`),
  "ENROLLED|ACTIVE|VERIFIED|1");
  assert.equal(sql(cluster, database, `select
    production_control.assert_future_participant_identity_runtime_v1();`),
  "2099");

  const owner = JSON.parse(sql(cluster, database, `select
    public.read_production_future_director_entitlement_v1(
      '00000000-0000-4000-8000-000000000101','2099'
    )::text;`));
  assert.equal(owner.found, true);
  assert.equal(owner.role, "OWNER");
  assert.equal(owner.directorPlayerId, "OWN01");
  assert.equal(owner.tournamentId, "2099");

  const explicitDirector = JSON.parse(sql(cluster, database, `select
    public.read_production_future_director_entitlement_v1(
      '00000000-0000-4000-8000-000000000103','2099'
    )::text;`));
  assert.equal(explicitDirector.found, true);
  assert.equal(explicitDirector.active, true);
  assert.equal(explicitDirector.role, "DIRECTOR");
  assert.equal(explicitDirector.directorPlayerId, "P200");
  assert.equal(explicitDirector.tournamentId, "2099");

  // Exercise the annual Net Skins algorithm against the already-active
  // future pointer. The central annual-scoring assertion itself is covered by
  // migration 069; this narrowly substituted test assertion preserves its
  // exact operation/target/generation checks while keeping this domain test
  // independent from Google writer certification setup.
  sql(cluster, database, String.raw`
    create or replace function production_control.assert_annual_net_skins_v1(
      input jsonb, expected_operation text
    ) returns text language plpgsql security definer
    set search_path=pg_catalog as $$
    begin
      if input->>'annual_scoring_operation' is distinct from expected_operation
         or input->>'expected_current_tournament_id' is distinct from '2099'
         or input->>'expected_runtime_generation_id' is distinct from
           '10000000-0000-4000-8000-000000000001' then
        raise exception using errcode='55000',
          message='PRODUCTION_ANNUAL_NET_SKINS_RUNTIME_REQUIRED';
      end if;
      return '2099';
    end $$;
    create or replace function
      production_control.assert_future_production_scoring_actor_v1(
        input jsonb,target_tournament text,
        require_director boolean default false
      ) returns void language plpgsql security definer
      set search_path=pg_catalog as $$
      begin
        if target_tournament <> '2099'
           or input#>>'{authorization,tournament_id}' <> '2099'
           or input#>>'{authorization,player_id}' <> 'P200'
           or input#>>'{authorization,auth_user_id}' <>
             '00000000-0000-4000-8000-000000000103'
           or (require_director and
             input#>>'{authorization,role}' <> 'DIRECTOR') then
          raise exception using errcode='42501',
            message='PRODUCTION_DIRECTOR_AUTHORIZATION_REQUIRED';
        end if;
      end $$;

    set session_replication_role=replica;
    insert into production_control.annual_scoring_runtime_authorities_v1(
      runtime_generation_id,tournament_id,platform_tournament_id,
      platform_authority_generation_id,platform_admission_generation_id,
      pointer_revision,lifecycle_revision,authority_generation_id,
      admission_generation_id,google_writer_generation_id,
      destination_workbook_id,google_target_contract_fingerprint,
      authority_status,admission_state,admission_revision,
      legacy_root_closure_id,predecessor_tournament_id,
      predecessor_closure_id,predecessor_boundary_fingerprint,
      activated_by_player_id,activated_by_auth_user_id
    ) values (
      '10000000-0000-4000-8000-000000000001','2099','2026',
      '40000000-0000-4000-8000-000000000004',
      '50000000-0000-4000-8000-000000000005',2,2,
      '20000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000003',
      '40000000-0000-4000-8000-000000000004',
      'future-net-skins-workbook-2099',repeat('e',64),
      'ACTIVE','OPEN',1,
      '70000000-0000-4000-8000-000000000007','2026',
      '80000000-0000-4000-8000-000000000008',repeat('8',64),
      'OWN01','00000000-0000-4000-8000-000000000101'
    );
    set session_replication_role=origin;

    insert into scoring_authority.players(player_id,display_name) values
      ('NS001','Annual Net Skins One'),('NS002','Annual Net Skins Two');
    insert into scoring_authority.teams(
      tournament_id,team_id,team_side,name
    ) values ('2099','NST2',2,'Annual Side Two');
    insert into scoring_authority.tournament_players(
      tournament_id,player_id,team_id,team_side,source_roster_key
    ) values
      ('2099','NS001','TEAM1',1,'NS001'),
      ('2099','NS002','NST2',2,'NS002');
    insert into scoring_authority.rounds(
      tournament_id,round_number,format,name,status
    ) values ('2099',1,'SI','Annual Singles','UPCOMING');
    insert into scoring_authority.scoring_snapshots(
      snapshot_id,tournament_id,match_id,snapshot_revision,
      scoring_rules_version,format,handicap_allowance,course_id,tee,
      rating,slope,par,match_netting_baseline,hole_definitions,
      participant_configuration,team_configuration,canonical_hash
    ) values (
      'NS-SNAPSHOT-2099','2099','NS-MATCH-2099',1,
      'annual-net-skins-fixture-v1','SI',100,'COURSE-2099','TEE-2099',
      72,113,72,'MATCH_PLAY',(
        select jsonb_agg(jsonb_build_object(
          'hole_number',hole,'stroke_index',hole,'par',4
        ) order by hole) from pg_catalog.generate_series(1,18) hole
      ),'{}'::jsonb,'{}'::jsonb,
      repeat('a',64)
    );
    insert into scoring_authority.matches(
      match_id,tournament_id,round_number,format,scoring_snapshot_id,
      status
    ) values (
      'NS-MATCH-2099','2099',1,'SI','NS-SNAPSHOT-2099','UPCOMING'
    );
    insert into scoring_authority.match_participants(
      match_id,player_id,team_side,player_slot,playing_handicap,final_strokes
    ) values
      ('NS-MATCH-2099','NS001',1,1,4,4),
      ('NS-MATCH-2099','NS002',2,1,6,6);
    insert into scoring_authority.match_holes(
      match_id,hole_number,snapshot_id,stroke_index,par
    ) select 'NS-MATCH-2099',hole,'NS-SNAPSHOT-2099',hole,4
      from pg_catalog.generate_series(1,18) hole;

    -- A predecessor job is deliberately newer than the annual target job.
    -- The future claim must never select or supersede it.
    insert into scoring_authority.net_skins_v1_recalculation_jobs(
      tournament_id,round_number,configuration_revision_id,
      configuration_revision,configuration_fingerprint,source_revision,
      source_fingerprint,status,reason,requested_by
    ) select '2026',1,value.configuration_revision_id,
      value.configuration_revision,value.configuration_fingerprint,
      '{}'::jsonb,repeat('b',64),'PENDING','PREDECESSOR_DECOY','step13e7b'
    from scoring_authority.net_skins_v1_configuration_revisions value
    where value.tournament_id='2026' and value.configuration_revision=1;
  `);

  const annualBase = `jsonb_build_object(
    'annual_scoring_dispatch_contract','production-annual-scoring-dispatch-v1',
    'expected_current_tournament_id','2099',
    'expected_pointer_revision',2,
    'expected_runtime_generation_id',
      '10000000-0000-4000-8000-000000000001',
    'expected_annual_authority_generation_id',
      '20000000-0000-4000-8000-000000000002',
    'expected_annual_admission_generation_id',
      '30000000-0000-4000-8000-000000000003',
    'annual_destination_workbook_id','future-net-skins-workbook-2099'
  )`;
  const operationFingerprint = (label) => sql(cluster, database,
    `select encode(extensions.digest('${label}'::text,'sha256'),'hex');`);

  const configured = JSON.parse(sql(cluster, database, `select
    public.future_production_configure_net_skins_v1(
      ${annualBase} || jsonb_build_object(
        'annual_scoring_operation','configure_production_net_skins_v1',
        'contract_version','production-net-skins-v1',
        'expected_configuration_revision',0,
        'eligible_round_numbers',jsonb_build_array(1),
        'publication_policy','OFFICIAL_ONLY',
        'authorization',jsonb_build_object(
          'tournament_id','2099',
          'auth_user_id','00000000-0000-4000-8000-000000000103',
          'player_id','P200','role','DIRECTOR'),
        'request_fingerprint','${operationFingerprint("annual-configure")}'
      )
    )::text;`));
  assert.equal(configured.tournament_id, "2099");
  assert.equal(configured.runtime_generation_id,
    "10000000-0000-4000-8000-000000000001");
  assert.equal(configured.configuration_revision, 1);
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select state from scoring_authority.net_skins_v1_configuration_current
      where tournament_id='2026'),
    (select configuration_revision
      from scoring_authority.net_skins_v1_configuration_current
      where tournament_id='2026'),
    (select status from scoring_authority.net_skins_v1_recalculation_jobs
      where tournament_id='2026' and reason='PREDECESSOR_DECOY'),
    (select count(*) from scoring_authority.net_skins_configurations
      where tournament_id='2026' and enabled));`), "NOT_CONFIGURED|1|PENDING|0");

  // Make the referenced canonical match official. The future invalidation
  // trigger creates the first exact-generation job before the explicit
  // enqueue retries it idempotently.
  sql(cluster, database, `update scoring_authority.matches set
    status='FINAL',scored_holes=18,current_hole=18,holes_remaining=0,
    result_winner='NS001',scorecard_complete=true,
    finalized_at=pg_catalog.clock_timestamp(),match_revision=match_revision+1
    where match_id='NS-MATCH-2099';`);

  const enqueueInput = `${annualBase} || jsonb_build_object(
    'annual_scoring_operation',
      'enqueue_production_net_skins_v1_recalculation',
    'expected_configuration_revision',1,
    'round_numbers',jsonb_build_array(1),
    'reason','EXPLICIT_RECALCULATION','requested_by','step13e7b',
    'request_fingerprint','${operationFingerprint("annual-enqueue")}'
  )`;
  const enqueued = JSON.parse(sql(cluster, database, `select
    public.future_production_enqueue_net_skins_recalculation_v1(
      ${enqueueInput}
    )::text;`));
  assert.equal(enqueued.tournament_id, "2099");
  assert.equal(enqueued.jobs[0].tournament_id, "2099");
  assert.equal(enqueued.jobs[0].runtime_generation_id,
    "10000000-0000-4000-8000-000000000001");
  const enqueueRetry = JSON.parse(sql(cluster, database, `select
    public.future_production_enqueue_net_skins_recalculation_v1(
      ${enqueueInput}
    )::text;`));
  assert.equal(enqueueRetry.idempotent, true);

  const claimInput = `${annualBase} || jsonb_build_object(
    'annual_scoring_operation','claim_production_net_skins_v1_recalculation',
    'expected_configuration_revision',1,'worker_id','annual-net-skins-worker',
    'lease_seconds',60,
    'request_fingerprint','${operationFingerprint("annual-claim-one")}'
  )`;
  const claimed = JSON.parse(sql(cluster, database, `select
    public.future_production_claim_net_skins_recalculation_v1(
      ${claimInput}
    )::text;`));
  assert.equal(claimed.job.tournament_id, "2099");
  assert.equal(claimed.job.runtime_generation_id,
    "10000000-0000-4000-8000-000000000001");
  assert.equal(claimed.calculation_input.source_revision.tournamentId, "2099");

  // Simulate the adversarial ordering where Storylines finished before the
  // dependent Net Skins calculation. Publishing the new current Net Skins
  // result must transactionally make Storylines pending again.
  sql(cluster, database, `update
    scoring_authority.competition_recalculation_jobs set
      status='SUCCEEDED', completed_at=pg_catalog.clock_timestamp()
    where tournament_id='2099' and round_number=0;`);

  const completeInput = `${annualBase} || jsonb_build_object(
    'annual_scoring_operation',
      'complete_production_net_skins_v1_recalculation',
    'expected_configuration_revision',1,'expected_result_revision',0,
    'job_id','${claimed.job.job_id}','claim_token','${claimed.job.claim_token}',
    'worker_id','annual-net-skins-worker',
    'source_fingerprint','${claimed.job.source_fingerprint}',
    'engine_version','net-skins-js-v1','result_state','OFFICIAL',
    'result_payload',jsonb_build_object(
      'round',1,'format','SI','complete',true,'finalized',true,
      'completedHoles',18,'eligibleCount',2,'pot',50,
      'skinsAwarded',1,'skinValue',50,
      'skins',jsonb_build_array(jsonb_build_object(
        'hole',1,'winnerPlayerId','NS001','winnerPlayerId2','',
        'winningNetScore',3,'skinValue',50)),
      'leaderboard',jsonb_build_array(
        jsonb_build_object('rank',1,'displayRank','1',
          'id','2099:R1:PLAYER:NS001','skinsWon',1,'totalWinnings',50),
        jsonb_build_object('rank',2,'displayRank','2',
          'id','2099:R1:PLAYER:NS002','skinsWon',0,'totalWinnings',0)
      )),
    'request_fingerprint','${operationFingerprint("annual-complete-one")}'
  )`;
  const completedNetSkins = JSON.parse(sql(cluster, database, `select
    public.future_production_complete_net_skins_recalculation_v1(
      ${completeInput}
    )::text;`));
  assert.equal(completedNetSkins.tournament_id, "2099");
  assert.equal(completedNetSkins.result_revision, 1);
  assert.equal(completedNetSkins.result_state, "OFFICIAL");
  assert.equal(completedNetSkins.published, true);
  assert.equal(sql(cluster, database, `select concat_ws('|',engine_key,status,
      runtime_generation_id,
      requested_source_revision->>'reason')
    from scoring_authority.competition_recalculation_jobs
    where tournament_id='2099' and round_number=0 and status='PENDING';`),
  "TOURNAMENT_STORYLINES|PENDING|10000000-0000-4000-8000-000000000001|NET_SKINS_CURRENT_RESULT_CHANGED");
  const completedRetry = JSON.parse(sql(cluster, database, `select
    public.future_production_complete_net_skins_recalculation_v1(
      ${completeInput}
    )::text;`));
  assert.equal(completedRetry.idempotent, true);

  // A structural score-source change uses the future-only trigger and binds
  // the new work to the same exact runtime generation.
  sql(cluster, database, `update scoring_authority.matches
    set match_revision=match_revision+1
    where match_id='NS-MATCH-2099';`);
  assert.equal(sql(cluster, database, `select concat_ws('|',
    tournament_id,runtime_generation_id,status)
    from scoring_authority.net_skins_v1_recalculation_jobs
    where tournament_id='2099' and status='PENDING';`),
  "2099|10000000-0000-4000-8000-000000000001|PENDING");

  const recoveryClaimOne = JSON.parse(sql(cluster, database, `select
    public.future_production_claim_net_skins_recalculation_v1(
      ${annualBase} || jsonb_build_object(
        'annual_scoring_operation',
          'claim_production_net_skins_v1_recalculation',
        'expected_configuration_revision',1,
        'worker_id','annual-net-skins-worker','lease_seconds',60,
        'request_fingerprint','${operationFingerprint("annual-claim-two")}'
      )
    )::text;`));
  sql(cluster, database, `update scoring_authority.net_skins_v1_recalculation_jobs
    set lease_expires_at=pg_catalog.clock_timestamp()-interval '1 second'
    where job_id='${recoveryClaimOne.job.job_id}';`);
  const recoveryClaimTwo = JSON.parse(sql(cluster, database, `select
    public.future_production_claim_net_skins_recalculation_v1(
      ${annualBase} || jsonb_build_object(
        'annual_scoring_operation',
          'claim_production_net_skins_v1_recalculation',
        'expected_configuration_revision',1,
        'worker_id','annual-net-skins-worker','lease_seconds',60,
        'request_fingerprint','${operationFingerprint("annual-claim-recovery")}'
      )
    )::text;`));
  assert.equal(recoveryClaimTwo.job.job_id, recoveryClaimOne.job.job_id);
  assert.notEqual(recoveryClaimTwo.job.claim_token,
    recoveryClaimOne.job.claim_token);
  const failed = JSON.parse(sql(cluster, database, `select
    public.future_production_fail_net_skins_recalculation_v1(
      ${annualBase} || jsonb_build_object(
        'annual_scoring_operation',
          'fail_production_net_skins_v1_recalculation',
        'expected_configuration_revision',1,
        'job_id','${recoveryClaimTwo.job.job_id}',
        'claim_token','${recoveryClaimTwo.job.claim_token}',
        'worker_id','annual-net-skins-worker','error_code','TEST_FAILURE',
        'error_safe','Test failure.',
        'request_fingerprint','${operationFingerprint("annual-fail")}'
      )
    )::text;`));
  assert.equal(failed.tournament_id, "2099");
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select count(*) from scoring_authority.net_skins_v1_result_revisions
      where tournament_id='2099'),
    (select count(*) from scoring_authority.net_skins_v1_result_revisions
      where tournament_id='2026'),
    (select status from scoring_authority.net_skins_v1_recalculation_jobs
      where tournament_id='2026' and reason='PREDECESSOR_DECOY'),
    (select count(*) from scoring_authority.net_skins_v1_recalculation_jobs
      where tournament_id='2099' and runtime_generation_id is distinct from
        '10000000-0000-4000-8000-000000000001'));`), "1|0|PENDING|0");

  // Even a deliberately newer same-tournament row from another generation
  // cannot affect the participant/current projection.
  sql(cluster, database, `
    set session_replication_role=replica;
    insert into production_control.future_annual_runtime_generations_v1(
      runtime_generation_id,tournament_id,generation_status,runtime_revision,
      pointer_revision,authority_generation_id,admission_generation_id,
      authority,ingress_state,readiness_fingerprint,closed_at
    ) values (
      '10000000-0000-4000-8000-000000000099','2099','ABORTED',1,1,
      '20000000-0000-4000-8000-000000000099',
      '30000000-0000-4000-8000-000000000099',
      'SUPABASE','OPEN',repeat('9',64),pg_catalog.clock_timestamp()
    );
    insert into scoring_authority.net_skins_v1_recalculation_jobs(
      tournament_id,round_number,configuration_revision_id,
      configuration_revision,configuration_fingerprint,source_revision,
      source_fingerprint,status,reason,requested_by,runtime_generation_id,
      requested_at
    ) select value.tournament_id,value.round_number,
      value.configuration_revision_id,value.configuration_revision,
      value.configuration_fingerprint,value.source_revision,
      value.source_fingerprint,'PENDING','PREDECESSOR_GENERATION_DECOY',
      'step13e7b','10000000-0000-4000-8000-000000000099',
      pg_catalog.clock_timestamp()+interval '1 day'
    from scoring_authority.net_skins_v1_recalculation_jobs value
    where value.job_id='${recoveryClaimTwo.job.job_id}';
    update scoring_authority.competition_recalculation_jobs
      set runtime_generation_id='10000000-0000-4000-8000-000000000099'
      where tournament_id='2099' and round_number=0
        and engine_key='TEAM_MOMENTUM';
    set session_replication_role=origin;
  `);
  const wrongDerivedGeneration = JSON.parse(sql(cluster, database, `select
    production_control.annual_scoring_predecessor_certificate_v1(
      '2099'
    )::text;`));
  assert.equal(
    wrongDerivedGeneration.derivedWorkerDrain.competitionGenerationMismatch,
    1);
  assert.ok(wrongDerivedGeneration.blockers.includes(
    "PREDECESSOR_DERIVED_WORK_GENERATION_MISMATCH"));
  const generationBoundRead = JSON.parse(sql(cluster, database, `select
    production_control.read_annual_net_skins_v1('2099')::text;`));
  assert.equal(generationBoundRead.data.tournament_id, "2099");
  assert.equal(generationBoundRead.data.state, "UNAVAILABLE");
  assert.equal(generationBoundRead.data.result_revision, 1);

  assert.throws(() => sql(cluster, database, `select
    public.future_production_claim_net_skins_recalculation_v1(
      ${annualBase} || jsonb_build_object(
        'annual_scoring_operation',
          'claim_production_net_skins_v1_recalculation',
        'expected_runtime_generation_id',
          '10000000-0000-4000-8000-000000000099',
        'expected_configuration_revision',1,
        'worker_id','annual-net-skins-worker',
        'request_fingerprint','${operationFingerprint("wrong-generation")}'
      )
    );`), /PRODUCTION_ANNUAL_NET_SKINS_RUNTIME_REQUIRED/);
  assert.throws(() => sql(cluster, database, `select
    public.enqueue_production_net_skins_v1_recalculation('{}'::jsonb);`),
  /PRODUCTION_LEGACY_SCORING_POINTER_CHANGED/);

  assert.equal(sql(cluster, database, `select concat_ws('|',
    has_function_privilege('service_role',
      'public.future_production_configure_net_skins_v1(jsonb)','EXECUTE'),
    has_function_privilege('service_role',
      'public.future_production_claim_net_skins_recalculation_v1(jsonb)',
      'EXECUTE'),
    has_function_privilege('authenticated',
      'public.future_production_complete_net_skins_recalculation_v1(jsonb)',
      'EXECUTE'),
    has_function_privilege('anon',
      'public.future_production_fail_net_skins_recalculation_v1(jsonb)',
      'EXECUTE'));`), "f|f|f|f");
  assert.throws(() => sql(cluster, database, `select
    production_control.ensure_annual_side_game_runtime_v1(
      '2099','10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000003',false
    );`), /PRODUCTION_ANNUAL_SIDE_GAME_CERTIFICATION_REQUIRED/,
  "changing a certified side-game helper must invalidate the runtime");
});
