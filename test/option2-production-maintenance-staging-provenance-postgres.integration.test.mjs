import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const migrationsDirectory = path.join(
  repositoryRoot,
  "supabase",
  "production_migrations",
);
const priorMigration =
  "202608270048_production_current_shadow_semantic_fingerprint.sql";
const providerInventoryV4Migration =
  "202608260038_production_provider_preview_target_inventory_v4.sql";
const providerInventoryV3Migration =
  "202608260039_production_all_project_provider_inventory_v3.sql";
const targetMigration =
  "202608280049_production_maintenance_staging_provenance.sql";
const pgBin = "/opt/homebrew/opt/postgresql@17/bin";
const postgresBinaries = Object.fromEntries(
  ["createdb", "initdb", "pg_ctl", "psql"].map((name) => [
    name,
    path.join(pgBin, name),
  ]),
);

const exactRelease = "6911c63cee6f6fe40c03a95bf7a7ba824be0d1fb";
const deploymentId = "dpl_Maintenance049Exact";
const stableHostname =
  "bagger-inv-git-feature-mock-tour-b4f752-sandbagger-invitational.vercel.app";
const actor = "maintenance-provenance-postgres-test";
const scope = Object.freeze({
  environment: "PRODUCTION",
  project_ref: "ymqhhtxaywtqllynrmxe",
  project_url: "https://ymqhhtxaywtqllynrmxe.supabase.co",
  source_workbook_id: "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4",
  tournament_id: "2026",
});
const sourceFingerprint = fingerprint("maintenance-provenance-source");
const importPayloadFingerprint = fingerprint("maintenance-import-payload");
const importDatabaseFingerprint = fingerprint("maintenance-import-database");

function fingerprint(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function jsonSql(value) {
  return `${sqlLiteral(JSON.stringify(value))}::jsonb`;
}

class CommandFailure extends Error {
  constructor(command, result) {
    const stdout = result.stdout || "";
    const stderr = result.stderr || "";
    super([
      `Command failed (${result.status ?? "spawn error"}): ${command}`,
      stdout.trim(),
      stderr.trim(),
    ].filter(Boolean).join("\n"));
    this.name = "CommandFailure";
    this.status = result.status;
    this.stdout = stdout;
    this.stderr = stderr;
    this.cause = result.error;
  }
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0) {
    throw new CommandFailure([command, ...args].join(" "), result);
  }
  return result.stdout;
}

function runCommandAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env: options.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (status) => {
      const result = { status, stdout, stderr };
      if (status !== 0) {
        reject(new CommandFailure([command, ...args].join(" "), result));
        return;
      }
      resolve(stdout);
    });
    child.stdin.end(options.input ?? "");
  });
}

function psqlEnvironment(cluster, extras = {}) {
  return {
    ...process.env,
    PGHOST: cluster.socketDirectory,
    PGPORT: String(cluster.port),
    PGUSER: "postgres",
    PGOPTIONS: "-c request.jwt.claim.role=service_role",
    ...extras,
  };
}

function psql(cluster, database, sql, options = {}) {
  return runCommand(
    postgresBinaries.psql,
    ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", database],
    {
      env: psqlEnvironment(cluster),
      input: sql,
      ...options,
    },
  ).trim();
}

async function psqlAsync(cluster, database, sql) {
  const output = await runCommandAsync(
    postgresBinaries.psql,
    ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", database],
    {
      env: psqlEnvironment(cluster),
      input: sql,
    },
  );
  return output.trim();
}

function psqlFile(cluster, database, filename) {
  return runCommand(
    postgresBinaries.psql,
    ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", database, "-f", filename],
    { env: psqlEnvironment(cluster) },
  );
}

function parseJsonOutput(output) {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const candidate = [...lines].reverse().find(
    (line) => line.startsWith("{") || line.startsWith("["),
  );
  assert.ok(candidate, `Expected JSON output, received:\n${output}`);
  return JSON.parse(candidate);
}

function rpc(cluster, database, name, input) {
  assert.match(name, /^[a-z][a-z0-9_]+$/);
  return parseJsonOutput(psql(
    cluster,
    database,
    `select public.${name}(${jsonSql(input)})::text;`,
  ));
}

function assertCommandFailure(action, expected) {
  assert.throws(
    action,
    (error) => error instanceof CommandFailure && expected.test(error.message),
  );
}

function commandFailureMessage(action) {
  try {
    action();
  } catch (error) {
    assert.ok(error instanceof CommandFailure);
    return error.message;
  }
  assert.fail("Expected command failure");
}

async function allBinariesAvailable() {
  try {
    await Promise.all(
      Object.values(postgresBinaries).map((binary) =>
        access(binary, fsConstants.X_OK)
      ),
    );
    return true;
  } catch {
    return false;
  }
}

async function createCluster() {
  const clusterRoot = await mkdtemp(
    path.join(os.tmpdir(), "bagger-mp-pg17-"),
  );
  const dataDirectory = path.join(clusterRoot, "data");
  const socketDirectory = path.join(clusterRoot, "socket");
  const logFile = path.join(clusterRoot, "postgres.log");
  const port = 5432;
  await mkdir(socketDirectory, { mode: 0o700 });
  runCommand(postgresBinaries.initdb, [
    "-D", dataDirectory,
    "--username=postgres",
    "--auth=trust",
    "--no-locale",
    "--encoding=UTF8",
  ]);
  runCommand(postgresBinaries.pg_ctl, [
    "-D", dataDirectory,
    "-l", logFile,
    "-o", `-F -k ${socketDirectory} -h '' -p ${port}`,
    "-w", "start",
  ]);
  return {
    clusterRoot,
    dataDirectory,
    socketDirectory,
    logFile,
    port,
    started: true,
  };
}

async function destroyCluster(cluster) {
  if (cluster.started) {
    try {
      runCommand(postgresBinaries.pg_ctl, [
        "-D", cluster.dataDirectory,
        "-m", "fast",
        "-w", "stop",
      ]);
    } finally {
      cluster.started = false;
    }
  }
  assert.equal(path.dirname(cluster.clusterRoot), path.resolve(os.tmpdir()));
  assert.match(
    path.basename(cluster.clusterRoot),
    /^bagger-mp-pg17-/,
  );
  await rm(cluster.clusterRoot, { recursive: true, force: true });
}

function createDatabase(cluster, database, template) {
  runCommand(
    postgresBinaries.createdb,
    template ? ["--template", template, database] : [database],
    { env: psqlEnvironment(cluster, { PGOPTIONS: "" }) },
  );
}

function installSupabaseCompatibility(cluster, database) {
  psql(cluster, database, `
    do $roles$
    begin
      if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
        create role anon nologin;
      end if;
      if not exists (
        select 1 from pg_catalog.pg_roles where rolname = 'authenticated'
      ) then
        create role authenticated nologin;
      end if;
      if not exists (
        select 1 from pg_catalog.pg_roles where rolname = 'service_role'
      ) then
        create role service_role nologin;
      end if;
    end
    $roles$;
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
    returns text
    language sql
    stable
    as $$
      select coalesce(
        nullif(current_setting('request.jwt.claim.role', true), ''),
        current_user
      )
    $$;
    create function public.rls_auto_enable()
    returns void
    language plpgsql
    as $$ begin end $$;
  `);
}

async function installProductionMigrations(
  cluster,
  database,
  lastMigration,
  firstMigration = null,
) {
  const migrationNames = (await readdir(migrationsDirectory))
    .filter((name) => /^\d+_.*\.sql$/.test(name))
    .sort();
  const startIndex = firstMigration == null
    ? 0
    : migrationNames.indexOf(firstMigration);
  const endIndex = migrationNames.indexOf(lastMigration);
  assert.notEqual(startIndex, -1, `Missing ${firstMigration}`);
  assert.notEqual(endIndex, -1, `Missing ${lastMigration}`);
  assert.ok(startIndex <= endIndex);
  for (const migrationName of migrationNames.slice(startIndex, endIndex + 1)) {
    psqlFile(cluster, database, path.join(migrationsDirectory, migrationName));
  }
}

function state(cluster, database) {
  return parseJsonOutput(psql(cluster, database, `
    select pg_catalog.jsonb_build_object(
      'activation_state', activation.state,
      'activation_revision', activation.activation_revision,
      'authority_generation_id', activation.authority_generation_id,
      'authority', activation.current_authority,
      'boundary_mode', activation.boundary_mode,
      'read_cutover_phase', activation.read_cutover_phase,
      'maintenance_state', activation.maintenance_state,
      'activation_ingress', activation.scoring_ingress_enabled,
      'expected_deployment_commit', activation.expected_deployment_commit,
      'staged_certification_fingerprint',
        activation.staged_certification_fingerprint,
      'staged_environment_delta_fingerprint_v2',
        activation.staged_environment_delta_fingerprint_v2,
      'first_write_possible_at', activation.first_supabase_write_possible_at,
      'first_write_observed_at', activation.first_supabase_write_observed_at,
      'resource_authority', resource.scoring_authority,
      'identity_authority', resource.participant_identity_authority,
      'read_authority', resource.current_tournament_read_authority,
      'public_reads', resource.public_supabase_reads_enabled,
      'resource_ingress', resource.scoring_ingress_enabled,
      'resource_workers', resource.workers_enabled,
      'admission_state', gate.admission_state,
      'admission_revision', gate.admission_revision,
      'admission_generation_id', gate.admission_generation_id,
      'execution_gate', gate.state,
      'worker_count', (
        select pg_catalog.count(*)
        from production_control.worker_controls worker
        where worker.enabled or worker.scheduler_installed
          or worker.google_writes_allowed
      )
    )
    from production_control.cutover_activation_state activation
    cross join production_control.resource_scope resource
    cross join scoring_authority.ingress_gates gate
    where activation.scope_key = 'BAGGER_INV_PRODUCTION'
      and resource.scope_key = 'BAGGER_INV_PRODUCTION'
      and gate.tournament_id = '2026';
  `));
}

function installControlFixture(cluster, database) {
  psql(cluster, database, `
    insert into scoring_authority.tournaments (
      tournament_id, tournament_year, name, source_workbook_id,
      scoring_authority
    ) values (
      '2026', 2026, 'Maintenance provenance test tournament',
      ${sqlLiteral(scope.source_workbook_id)}, 'GOOGLE'
    );
    insert into scoring_authority.ingress_gates (
      tournament_id, state, authority, active_epoch_id,
      unresolved_client_queues, updated_by
    ) values ('2026', 'PAUSED', 'GOOGLE', null, 0, ${sqlLiteral(actor)});
  `);
}

function installSemanticFixture(cluster, database) {
  psql(cluster, database, `
    with run as (
      insert into production_control.import_runs (
        domain, tournament_id, tournament_year, source_workbook_id,
        source_fingerprint, payload_fingerprint, database_fingerprint,
        importer_contract, actor, status, counts, completed_at
      ) values (
        'CURRENT_SCORING_SHADOW', '2026', 2026,
        ${sqlLiteral(scope.source_workbook_id)},
        ${sqlLiteral(sourceFingerprint)},
        ${sqlLiteral(importPayloadFingerprint)},
        ${sqlLiteral(importDatabaseFingerprint)},
        'production-current-shadow-v2',
        'step10b-production-shadow-bootstrap', 'SUCCEEDED',
        '{"players":0,"tournament_players":0,"teams":0,"rounds":0,"snapshots":0,"matches":0,"match_participants":0,"permissions":0,"match_holes":0,"hole_scores":0,"checkpoints":0}'::jsonb,
        pg_catalog.now()
      ) returning import_run_id
    )
    insert into production_control.current_shadow_revisions (
      import_run_id, tournament_id, tournament_year, source_workbook_id,
      source_fingerprint, payload_fingerprint, pairing_state,
      current_context, tournament_rules, identity_reconciliation,
      shadow_safety, source_payload, imported_by
    )
    select import_run_id, '2026', 2026,
      ${sqlLiteral(scope.source_workbook_id)},
      ${sqlLiteral(sourceFingerprint)},
      ${sqlLiteral(importPayloadFingerprint)},
      'PENDING',
      '{"lifecycle":"PRE_TOURNAMENT","current_round":0,"team_1_score":0,"team_2_score":0,"live_message":""}'::jsonb,
      '[]'::jsonb,
      '{"current_only_player_ids":[],"historical_appearances_inferred":false,"join_key":"Player ID","missing_player_source_ids":[],"unresolved_current_only_ids":[]}'::jsonb,
      '{}'::jsonb, '{}'::jsonb,
      'step10b-production-shadow-bootstrap'
    from run;
  `);

  const projectionText = psql(cluster, database, `
    select production_control
      .current_tournament_shadow_semantic_projection_v1('2026')::text;
  `);
  const projection = JSON.parse(projectionText);
  const canonicalJson = JSON.stringify(projection);
  const payloadFingerprint = fingerprint(canonicalJson);
  psql(cluster, database, `
    insert into production_control.current_shadow_semantic_baselines (
      tournament_id, tournament_year, contract_version, import_run_id,
      source_workbook_id, source_fingerprint,
      expected_payload_semantic_fingerprint,
      legacy_database_fingerprint, legacy_reconstructed_fingerprint,
      semantic_projection, semantic_database_fingerprint,
      section_fingerprints, established_by
    )
    select
      '2026', 2026, 'production-current-shadow-semantic-parity-v1',
      run.import_run_id, run.source_workbook_id, run.source_fingerprint,
      ${sqlLiteral(payloadFingerprint)},
      ${sqlLiteral(importDatabaseFingerprint)},
      ${sqlLiteral(importDatabaseFingerprint)},
      projection.value,
      pg_catalog.encode(
        extensions.digest(projection.value::text, 'sha256'), 'hex'
      ),
      (
        select pg_catalog.jsonb_object_agg(
          entry.key,
          pg_catalog.encode(
            extensions.digest(entry.value::text, 'sha256'), 'hex'
          ) order by entry.key
        )
        from pg_catalog.jsonb_each(projection.value) entry
      ),
      'production-migration-048'
    from production_control.import_runs run
    cross join lateral (
      select production_control
        .current_tournament_shadow_semantic_projection_v1('2026') value
    ) projection
    where run.domain = 'CURRENT_SCORING_SHADOW'
      and run.source_fingerprint = ${sqlLiteral(sourceFingerprint)};
  `);
  return { canonicalJson, payloadFingerprint };
}

function selectedConfiguration(input) {
  return {
    contract_version: "production-maintenance-environment-delta-v2",
    release_sha: exactRelease,
    candidate_deployment_id: input.deployment_id,
    candidate_deployment_target: "PREVIEW",
    candidate_runtime_environment: "preview",
    candidate_hostname: stableHostname,
    preview_isolation_contract: "production-shadow-candidate-v1",
    preview_isolation_allowed: true,
    preview_commit_approved: true,
    preview_no_authoritative_features: true,
    production_deployment_target: "PRODUCTION",
    vercel_environment: "production",
    vercel_project: "bagger-inv",
    vercel_project_id: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
    canonical_domain: "https://baggerinv.com",
    supabase_project_ref: scope.project_ref,
    supabase_project_url: scope.project_url,
    google_workbook_id: scope.source_workbook_id,
    tournament_id: "2026",
    tournament_year: 2026,
    boundary_mode: "MAINTENANCE_WINDOW_V1",
    read_cutover_phase: "STATIC_BACKEND",
    current_tournament_read_authority: "GOOGLE",
    scoring_authority: "GOOGLE",
    participant_identity_authority: "PASSPORT",
    maintenance_state: "NORMAL",
    legacy_admission: "OPEN",
    scoring_ingress_enabled: false,
    workers_enabled: false,
    first_supabase_write_possible: false,
    first_supabase_write_observed: false,
    maintenance_window_contract: "production-maintenance-window-v1",
    maintenance_window_migration:
      "202608270044_production_maintenance_window_cutover.sql",
    semantic_parity_contract:
      "production-current-shadow-semantic-parity-v1",
    semantic_parity_migration:
      "202608270048_production_current_shadow_semantic_fingerprint.sql",
    staging_provenance_contract:
      "production-maintenance-staging-provenance-v1",
    staging_provenance_migration:
      "202608280049_production_maintenance_staging_provenance.sql",
  };
}

function preflightInput(current, semantic, label) {
  const input = {
    ...scope,
    actor_id: actor,
    contract_version: "production-cutover-activation-v1",
    boundary_mode: "MAINTENANCE_WINDOW_V1",
    maintenance_provenance_contract:
      "production-maintenance-staging-provenance-v1",
    vercel_environment: "production",
    vercel_project: "bagger-inv",
    vercel_project_id: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
    canonical_domain: "https://baggerinv.com",
    tournament_year: 2026,
    deployment_id: deploymentId,
    deployment_commit: exactRelease,
    candidate_commit_sha: exactRelease,
    candidate_deployment_target: "PREVIEW",
    candidate_runtime_environment: "preview",
    candidate_hostname: stableHostname,
    preview_isolation_contract: "production-shadow-candidate-v1",
    preview_isolation_allowed: true,
    preview_commit_approved: true,
    preview_no_authoritative_features: true,
    source_fingerprint: sourceFingerprint,
    semantic_parity_contract:
      "production-current-shadow-semantic-parity-v1",
    semantic_payload_fingerprint: semantic.payloadFingerprint,
    semantic_payload_canonical_json: semantic.canonicalJson,
    expected_activation_revision: Number(current.activation_revision),
    expected_authority_generation: current.authority_generation_id,
    expected_admission_revision: Number(current.admission_revision),
    expected_admission_generation: current.admission_generation_id,
    request_fingerprint: fingerprint(`maintenance-provenance-${label}`),
  };
  input.selected_release_configuration = selectedConfiguration(input);
  return input;
}

function generateProvenance(cluster, database, semantic, label) {
  const input = preflightInput(state(cluster, database), semantic, label);
  const provenance = rpc(
    cluster,
    database,
    "inspect_production_maintenance_stage_provenance",
    input,
  );
  assert.equal(provenance.ok, true);
  assert.equal(provenance.eligible, true);
  assert.match(provenance.environment_delta_fingerprint_v2, /^[0-9a-f]{64}$/);
  assert.match(provenance.certification_fingerprint, /^[0-9a-f]{64}$/);
  return {
    input: {
      ...input,
      environment_delta_fingerprint_v2:
        provenance.environment_delta_fingerprint_v2,
      certification_fingerprint: provenance.certification_fingerprint,
    },
    provenance,
  };
}

function providerStageInput(current) {
  return {
    ...scope,
    actor_id: actor,
    contract_version: "production-cutover-activation-v1",
    vercel_project: "bagger-inv",
    canonical_domain: "https://baggerinv.com",
    tournament_year: 2026,
    vercel_project_id: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
    deployment_commit: "1234567890abcdef1234567890abcdef12345678",
    source_fingerprint: fingerprint("provider-source"),
    certification_fingerprint: fingerprint("provider-certification"),
    environment_delta_fingerprint_v2: fingerprint("provider-environment"),
    expected_activation_revision: Number(current.activation_revision),
    request_fingerprint: fingerprint("provider-stage-request"),
  };
}

test(
  "maintenance staging provenance is deterministic and fail-closed in PostgreSQL 17",
  { timeout: 120_000 },
  async (t) => {
    if (!(await allBinariesAvailable())) {
      t.skip(`PostgreSQL 17 toolchain is unavailable at ${pgBin}`);
      return;
    }

    const cluster = await createCluster();
    const preMigrationDatabase = "maintenance_provenance_pre049";
    const templateDatabase = "maintenance_provenance_template";
    let cloneCounter = 0;
    const clone = (label) => {
      cloneCounter += 1;
      const database = `maintenance_provenance_${cloneCounter}_${label}`;
      createDatabase(cluster, database, templateDatabase);
      return database;
    };

    try {
      createDatabase(cluster, preMigrationDatabase);
      installSupabaseCompatibility(cluster, preMigrationDatabase);
      await installProductionMigrations(
        cluster,
        preMigrationDatabase,
        providerInventoryV4Migration,
      );
      installControlFixture(cluster, preMigrationDatabase);
      await installProductionMigrations(
        cluster,
        preMigrationDatabase,
        priorMigration,
        providerInventoryV3Migration,
      );
      const semantic = installSemanticFixture(cluster, preMigrationDatabase);
      const beforeMigrationState = state(cluster, preMigrationDatabase);
      const publicDispatcherBefore = psql(cluster, preMigrationDatabase, `
        select pg_catalog.pg_get_functiondef(
          'public.stage_production_cutover_release(jsonb)'::regprocedure
        );
      `);
      const providerFunctionBefore = psql(cluster, preMigrationDatabase, `
        select pg_catalog.pg_get_functiondef(
          'public.stage_production_cutover_release_provider_fence_v2(jsonb)'
            ::regprocedure
        );
      `);
      createDatabase(cluster, "maintenance_provider_before", preMigrationDatabase);

      psqlFile(
        cluster,
        preMigrationDatabase,
        path.join(migrationsDirectory, targetMigration),
      );
      assert.deepEqual(state(cluster, preMigrationDatabase), beforeMigrationState);
      assert.equal(psql(cluster, preMigrationDatabase, `
        select pg_catalog.pg_get_functiondef(
          'public.stage_production_cutover_release(jsonb)'::regprocedure
        );
      `), publicDispatcherBefore);
      assert.equal(psql(cluster, preMigrationDatabase, `
        select pg_catalog.pg_get_functiondef(
          'public.stage_production_cutover_release_provider_fence_v2(jsonb)'
            ::regprocedure
        );
      `), providerFunctionBefore);

      createDatabase(cluster, templateDatabase, preMigrationDatabase);

      await t.test("exact provenance stages and replays idempotently", () => {
        const database = clone("success");
        const before = state(cluster, database);
        const { input, provenance } = generateProvenance(
          cluster,
          database,
          semantic,
          "success",
        );
        const staged = rpc(
          cluster,
          database,
          "stage_production_cutover_release",
          input,
        );
        assert.equal(staged.code, "PRODUCTION_RELEASE_STAGED");
        assert.equal(staged.boundary_mode, "MAINTENANCE_WINDOW_V1");
        assert.equal(staged.maintenance_state, "NORMAL");
        assert.equal(
          staged.certification_fingerprint,
          provenance.certification_fingerprint,
        );
        assert.equal(
          staged.environment_delta_fingerprint_v2,
          provenance.environment_delta_fingerprint_v2,
        );
        const after = state(cluster, database);
        assert.deepEqual(
          {
            activation: after.activation_state,
            revision: Number(after.activation_revision),
            authorityGeneration: after.authority_generation_id,
            admissionGeneration: after.admission_generation_id,
            admissionRevision: Number(after.admission_revision),
            authority: after.authority,
            resourceAuthority: after.resource_authority,
            identity: after.identity_authority,
            reads: after.read_authority,
            readPhase: after.read_cutover_phase,
            maintenance: after.maintenance_state,
            admission: after.admission_state,
            executionGate: after.execution_gate,
            activationIngress: after.activation_ingress,
            resourceIngress: after.resource_ingress,
            publicReads: after.public_reads,
            workers: after.resource_workers,
            workerCount: Number(after.worker_count),
            possible: after.first_write_possible_at,
            observed: after.first_write_observed_at,
          },
          {
            activation: "STAGED",
            revision: Number(before.activation_revision) + 1,
            authorityGeneration: before.authority_generation_id,
            admissionGeneration: before.admission_generation_id,
            admissionRevision: Number(before.admission_revision),
            authority: "GOOGLE",
            resourceAuthority: "GOOGLE",
            identity: "PASSPORT",
            reads: "GOOGLE",
            readPhase: "STATIC_BACKEND",
            maintenance: "NORMAL",
            admission: "OPEN",
            executionGate: "PAUSED",
            activationIngress: false,
            resourceIngress: false,
            publicReads: false,
            workers: false,
            workerCount: 0,
            possible: null,
            observed: null,
          },
        );
        assert.equal(
          after.staged_certification_fingerprint,
          provenance.certification_fingerprint,
        );
        assert.equal(
          after.staged_environment_delta_fingerprint_v2,
          provenance.environment_delta_fingerprint_v2,
        );
        const replay = rpc(
          cluster,
          database,
          "stage_production_cutover_release",
          input,
        );
        assert.equal(replay.idempotent, true);
        assert.equal(state(cluster, database).activation_revision, after.activation_revision);
      });

      await t.test("delayed exact retry fails after cutover state advances", () => {
        for (const [label, advanceSql] of [
          ["revision", `
            update production_control.cutover_activation_state
            set activation_revision = activation_revision + 1
            where scope_key = 'BAGGER_INV_PRODUCTION';
          `],
          ["read", `
            update production_control.resource_scope
            set public_supabase_reads_enabled = true
            where scope_key = 'BAGGER_INV_PRODUCTION';
            update production_control.cutover_activation_state
            set read_cutover_phase = 'READ_CUTOVER',
                read_source_fingerprint = ${sqlLiteral(sourceFingerprint)},
                activation_revision = activation_revision + 1
            where scope_key = 'BAGGER_INV_PRODUCTION';
          `],
          ["identity", `
            update production_control.resource_scope
            set participant_identity_authority = 'SUPABASE',
                auth_user_creation_enabled = true
            where scope_key = 'BAGGER_INV_PRODUCTION';
            update production_control.cutover_activation_state
            set activation_revision = activation_revision + 1
            where scope_key = 'BAGGER_INV_PRODUCTION';
          `],
        ]) {
          const database = clone(`stale_retry_${label}`);
          const exact = generateProvenance(
            cluster,
            database,
            semantic,
            `stale-retry-${label}`,
          );
          assert.equal(
            rpc(
              cluster,
              database,
              "stage_production_cutover_release",
              exact.input,
            ).code,
            "PRODUCTION_RELEASE_STAGED",
          );
          psql(cluster, database, advanceSql);
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "stage_production_cutover_release",
              exact.input,
            ),
            /PRODUCTION_STAGE_PROVENANCE_IMMUTABLE/,
          );
        }
      });

      await t.test(
        "semantic source rows are locked until staging commits",
        async () => {
          const database = clone("semantic_lock");
          const exact = generateProvenance(
            cluster,
            database,
            semantic,
            "semantic-lock",
          );
          const triggerLockKey = 8049;
          psql(cluster, database, `
            create function public.test_hold_maintenance_stage()
            returns trigger
            language plpgsql
            set search_path = pg_catalog
            as $trigger$
            begin
              if old.state = 'DORMANT' and new.state = 'STAGED' then
                perform pg_catalog.pg_advisory_xact_lock(${triggerLockKey});
                perform pg_catalog.pg_sleep(2);
              end if;
              return new;
            end
            $trigger$;
            create trigger test_hold_maintenance_stage
            before update on production_control.cutover_activation_state
            for each row execute function public.test_hold_maintenance_stage();
          `);

          const staging = psqlAsync(
            cluster,
            database,
            `select public.stage_production_cutover_release(
              ${jsonSql(exact.input)}
            )::text;`,
          );

          let triggerReached = false;
          for (let attempt = 0; attempt < 80; attempt += 1) {
            if (psql(cluster, database, `
              select pg_catalog.count(*)
              from pg_catalog.pg_locks
              where locktype = 'advisory'
                and classid = 0
                and objid = ${triggerLockKey}
                and granted;
            `) === "1") {
              triggerReached = true;
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 25));
          }
          assert.equal(triggerReached, true, "staging trigger was not reached");

          assertCommandFailure(
            () => psql(cluster, database, `
              set lock_timeout = '250ms';
              update scoring_authority.tournaments
              set name = 'Concurrent semantic drift'
              where tournament_id = '2026';
            `),
            /canceling statement due to lock timeout/i,
          );

          const staged = parseJsonOutput(await staging);
          assert.equal(staged.code, "PRODUCTION_RELEASE_STAGED");
          assert.equal(state(cluster, database).activation_state, "STAGED");
          assert.equal(psql(cluster, database, `
            select name
            from scoring_authority.tournaments
            where tournament_id = '2026';
          `), "Maintenance provenance test tournament");
        },
      );

      await t.test("wrong SHA fails closed", () => {
        const database = clone("wrong_sha");
        const input = preflightInput(
          state(cluster, database),
          semantic,
          "wrong-sha",
        );
        input.deployment_commit = "a".repeat(40);
        input.candidate_commit_sha = "a".repeat(40);
        input.selected_release_configuration.release_sha = "a".repeat(40);
        assertCommandFailure(
          () => rpc(
            cluster,
            database,
            "inspect_production_maintenance_stage_provenance",
            input,
          ),
          /PRODUCTION_MAINTENANCE_RELEASE_CONFIGURATION_INVALID/,
        );
        assert.equal(state(cluster, database).activation_state, "DORMANT");
      });

      await t.test("wrong Production and Preview resources fail closed", () => {
        const database = clone("wrong_resources");
        for (const [label, overrides, expected] of [
          ["project", { project_ref: "idgigvjjqkfbqjeredpb" },
            /PRODUCTION_RESOURCE_ASSERTION_FAILED/],
          ["workbook", { source_workbook_id: "preview-workbook" },
            /PRODUCTION_RESOURCE_ASSERTION_FAILED/],
          ["vercel", { vercel_project_id: "prj_preview" },
            /PRODUCTION_MAINTENANCE_RELEASE_CONFIGURATION_INVALID/],
          ["environment", { environment: "PREVIEW" },
            /PRODUCTION_RESOURCE_ASSERTION_FAILED/],
        ]) {
          const input = {
            ...preflightInput(
              state(cluster, database),
              semantic,
              `wrong-${label}`,
            ),
            ...overrides,
          };
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "inspect_production_maintenance_stage_provenance",
              input,
            ),
            expected,
          );
        }
        assert.equal(state(cluster, database).activation_state, "DORMANT");
        assert.equal(psql(cluster, database, `
          select pg_catalog.count(*)
          from production_control.cutover_operation_receipts;
        `), "0");
      });

      await t.test("semantic parity false blocks staging", () => {
        const database = clone("semantic_drift");
        psql(cluster, database, `
          update scoring_authority.tournaments
          set name = 'Meaningful tournament fact drift'
          where tournament_id = '2026';
        `);
        const input = preflightInput(
          state(cluster, database),
          semantic,
          "semantic-drift",
        );
        assertCommandFailure(
          () => rpc(
            cluster,
            database,
            "inspect_production_maintenance_stage_provenance",
            input,
          ),
          /PRODUCTION_MAINTENANCE_SEMANTIC_PARITY_REQUIRED/,
        );
      });

      await t.test("environment delta and selected configuration mismatches fail", () => {
        const mismatchDatabase = clone("environment_mismatch");
        const exact = generateProvenance(
          cluster,
          mismatchDatabase,
          semantic,
          "environment-mismatch",
        );
        const wrongHashInput = {
          ...exact.input,
          environment_delta_fingerprint_v2: "f".repeat(64),
        };
        assertCommandFailure(
          () => rpc(
            cluster,
            mismatchDatabase,
            "stage_production_cutover_release",
            wrongHashInput,
          ),
          /PRODUCTION_MAINTENANCE_ENVIRONMENT_DELTA_MISMATCH/,
        );

        const configDatabase = clone("selected_config_mismatch");
        const altered = generateProvenance(
          cluster,
          configDatabase,
          semantic,
          "selected-config-mismatch",
        );
        altered.input.selected_release_configuration = {
          ...altered.input.selected_release_configuration,
          workers_enabled: true,
        };
        assertCommandFailure(
          () => rpc(
            cluster,
            configDatabase,
            "stage_production_cutover_release",
            altered.input,
          ),
          /PRODUCTION_MAINTENANCE_SELECTED_CONFIGURATION_INVALID/,
        );
      });

      await t.test("first-write possible or observed blocks provenance", () => {
        const possibleDatabase = clone("first_write_possible");
        psql(cluster, possibleDatabase, `
          update production_control.cutover_activation_state
          set first_supabase_write_possible_at = pg_catalog.now()
          where scope_key = 'BAGGER_INV_PRODUCTION';
        `);
        assertCommandFailure(
          () => rpc(
            cluster,
            possibleDatabase,
            "inspect_production_maintenance_stage_provenance",
            preflightInput(
              state(cluster, possibleDatabase),
              semantic,
              "first-write-possible",
            ),
          ),
          /PRODUCTION_MAINTENANCE_PROVENANCE_DORMANT_STATE_REQUIRED/,
        );

        const observedDatabase = clone("first_write_observed");
        psql(cluster, observedDatabase, `
          update production_control.cutover_activation_state
          set first_supabase_write_possible_at = pg_catalog.now(),
              first_supabase_write_observed_at = pg_catalog.now(),
              first_supabase_mutation_key = 'test-first-write',
              first_supabase_match_id = '2026-R1-M1',
              first_supabase_match_revision = 1
          where scope_key = 'BAGGER_INV_PRODUCTION';
        `);
        assertCommandFailure(
          () => rpc(
            cluster,
            observedDatabase,
            "inspect_production_maintenance_stage_provenance",
            preflightInput(
              state(cluster, observedDatabase),
              semantic,
              "first-write-observed",
            ),
          ),
          /PRODUCTION_MAINTENANCE_PROVENANCE_DORMANT_STATE_REQUIRED/,
        );
      });

      await t.test("PROVIDER_FENCE_V2 behavior is byte-identical", () => {
        const beforeState = state(cluster, "maintenance_provider_before");
        const beforeMessage = commandFailureMessage(() => rpc(
          cluster,
          "maintenance_provider_before",
          "stage_production_cutover_release",
          providerStageInput(beforeState),
        ));
        const afterDatabase = clone("provider_after");
        const afterMessage = commandFailureMessage(() => rpc(
          cluster,
          afterDatabase,
          "stage_production_cutover_release",
          providerStageInput(state(cluster, afterDatabase)),
        ));
        assert.match(
          beforeMessage,
          /PRODUCTION_GOOGLE_WRITER_DRIVE_ACL_REHEARSAL_CERTIFICATION_REQUIRED/,
        );
        assert.match(
          afterMessage,
          /PRODUCTION_GOOGLE_WRITER_DRIVE_ACL_REHEARSAL_CERTIFICATION_REQUIRED/,
        );
      });
    } finally {
      await destroyCluster(cluster);
    }
  },
);
