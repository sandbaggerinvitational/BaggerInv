import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
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
  "202608280049_production_maintenance_staging_provenance.sql";
const providerInventoryV4Migration =
  "202608260038_production_provider_preview_target_inventory_v4.sql";
const providerInventoryV3Migration =
  "202608260039_production_all_project_provider_inventory_v3.sql";
const targetMigration =
  "202608280050_production_maintenance_precommit_deployment_rebind.sql";
const capabilityMigration =
  "202608280051_production_maintenance_single_deployment_capability.sql";
const precommitCapabilityGuardMigration =
  "202608280052_production_maintenance_precommit_capability_guard.sql";
const postcutoverApplicationReleaseMigration =
  "202608280053_production_postcutover_application_release_rebind.sql";
const pgBin = "/opt/homebrew/opt/postgresql@17/bin";
const postgresBinaries = Object.fromEntries(
  ["createdb", "initdb", "pg_ctl", "psql"].map((name) => [
    name,
    path.join(pgBin, name),
  ]),
);

const releaseSha = "7baf9b284d4784d7387f3e4fa876b9d47cd0a177";
const postcutoverReleaseSha = "56ded61379e3308ab5c465ce186140550f3827a7";
const oldDeployment = "dpl_MaintenanceOriginal050";
const newDeployment = "dpl_MaintenanceReplacement050";
const postcutoverDeployment = "dpl_PostcutoverApplication053";
const postcutoverDeploymentHostname =
  "bagger-postcutover-application-053.vercel.app";
const candidateDeployment = "dpl_MaintenanceCandidate050";
const candidateDeploymentHostname = "bagger-maintenance-candidate.vercel.app";
const epochId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const closureId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const sourceFingerprint = "1".repeat(64);
const reconciliationFingerprint = "2".repeat(64);
const leaseFingerprint = "3".repeat(64);
const stagedCertificationFingerprint = "4".repeat(64);
const stagedEnvironmentFingerprint = "5".repeat(64);
const actor = "maintenance-rebind-postgres-test";
const predictionSourceFingerprint = "b".repeat(64);
const predictionEffectiveFingerprint = "c".repeat(64);
const scope = Object.freeze({
  environment: "PRODUCTION",
  project_ref: "ymqhhtxaywtqllynrmxe",
  project_url: "https://ymqhhtxaywtqllynrmxe.supabase.co",
  source_workbook_id:
    "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4",
  tournament_id: "2026",
});

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
    super([
      `Command failed (${result.status ?? "spawn error"}): ${command}`,
      (result.stdout || "").trim(),
      (result.stderr || "").trim(),
    ].filter(Boolean).join("\n"));
    this.name = "CommandFailure";
    this.status = result.status;
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

function psqlEnvironment(cluster, role = "service_role") {
  return {
    ...process.env,
    PGHOST: cluster.socketDirectory,
    PGPORT: String(cluster.port),
    PGUSER: "postgres",
    PGOPTIONS: `-c request.jwt.claim.role=${role}`,
  };
}

function psql(cluster, database, sql, { role = "service_role" } = {}) {
  return runCommand(
    postgresBinaries.psql,
    ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", database],
    { env: psqlEnvironment(cluster, role), input: sql },
  ).trim();
}

function psqlFile(cluster, database, filename) {
  return runCommand(
    postgresBinaries.psql,
    ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", database, "-f", filename],
    { env: psqlEnvironment(cluster) },
  );
}

function parseJsonOutput(output) {
  const candidate = output.split(/\r?\n/).map((line) => line.trim())
    .filter(Boolean).reverse()
    .find((line) => line.startsWith("{") || line.startsWith("["));
  assert.ok(candidate, `Expected JSON output, received:\n${output}`);
  return JSON.parse(candidate);
}

function rpc(cluster, database, name, input, options = {}) {
  assert.match(name, /^[a-z][a-z0-9_]+$/);
  return parseJsonOutput(psql(
    cluster,
    database,
    `select public.${name}(${jsonSql(input)})::text;`,
    options,
  ));
}

function ownerControlFunction(cluster, database, name, input) {
  assert.match(name, /^[a-z][a-z0-9_]+$/);
  return parseJsonOutput(runCommand(
    postgresBinaries.psql,
    ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", database],
    {
      env: {
        ...psqlEnvironment(cluster),
        PGOPTIONS: "",
      },
      input: `select production_control.${name}(${jsonSql(input)})::text;`,
    },
  ));
}

function assertCommandFailure(action, expected) {
  assert.throws(
    action,
    (error) => error instanceof CommandFailure && expected.test(error.message),
  );
}

async function allBinariesAvailable() {
  try {
    await Promise.all(Object.values(postgresBinaries).map((binary) =>
      access(binary, fsConstants.X_OK)));
    return true;
  } catch {
    return false;
  }
}

async function createCluster() {
  const clusterRoot = await mkdtemp(path.join(os.tmpdir(), "bagger-rb-pg17-"));
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
  assert.match(path.basename(cluster.clusterRoot), /^bagger-rb-pg17-/);
  await rm(cluster.clusterRoot, { recursive: true, force: true });
}

function createDatabase(cluster, database, template) {
  runCommand(
    postgresBinaries.createdb,
    template ? ["--template", template, database] : [database],
    { env: { ...psqlEnvironment(cluster), PGOPTIONS: "" } },
  );
}

function installSupabaseCompatibility(cluster, database) {
  psql(cluster, database, `
    do $roles$
    begin
      if not exists (
        select 1 from pg_catalog.pg_roles where rolname = 'anon'
      ) then create role anon nologin; end if;
      if not exists (
        select 1 from pg_catalog.pg_roles where rolname = 'authenticated'
      ) then create role authenticated nologin; end if;
      if not exists (
        select 1 from pg_catalog.pg_roles where rolname = 'service_role'
      ) then create role service_role nologin; end if;
    end
    $roles$;
    create schema auth;
    create table auth.users (
      id uuid primary key, email text, phone text, phone_change text,
      email_confirmed_at timestamptz, phone_confirmed_at timestamptz,
      confirmation_sent_at timestamptz,
      raw_app_meta_data jsonb default '{}'::jsonb,
      raw_user_meta_data jsonb default '{}'::jsonb,
      created_at timestamptz default now(), updated_at timestamptz default now()
    );
    create table auth.identities (
      id uuid primary key, user_id uuid not null references auth.users(id),
      provider text not null, identity_data jsonb default '{}'::jsonb,
      created_at timestamptz default now(), updated_at timestamptz default now()
    );
    create function auth.role() returns text language sql stable as $$
      select coalesce(
        nullif(current_setting('request.jwt.claim.role', true), ''),
        current_user
      )
    $$;
    create function public.rls_auto_enable()
    returns void language plpgsql as $$ begin end $$;
  `);
}

async function migrationNames() {
  return (await readdir(migrationsDirectory))
    .filter((name) => /^\d+_.*\.sql$/.test(name))
    .sort();
}

async function installThrough(
  cluster,
  database,
  lastMigration,
  firstMigration = null,
) {
  const names = await migrationNames();
  const start = firstMigration == null ? 0 : names.indexOf(firstMigration);
  const end = names.indexOf(lastMigration);
  assert.notEqual(start, -1, `Missing ${firstMigration}`);
  assert.notEqual(end, -1, `Missing ${lastMigration}`);
  assert.ok(start <= end);
  for (const name of names.slice(start, end + 1)) {
    psqlFile(cluster, database, path.join(migrationsDirectory, name));
  }
}

function baseState(cluster, database) {
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
      'first_write_possible_at', activation.first_supabase_write_possible_at,
      'first_write_observed_at', activation.first_supabase_write_observed_at,
      'resource_authority', resource.scoring_authority,
      'identity_authority', resource.participant_identity_authority,
      'read_authority', resource.current_tournament_read_authority,
      'resource_ingress', resource.scoring_ingress_enabled,
      'resource_workers', resource.workers_enabled,
      'admission_state', gate.admission_state,
      'admission_revision', gate.admission_revision,
      'admission_generation_id', gate.admission_generation_id,
      'admission_deployment_id', gate.admission_deployment_id,
      'execution_gate', gate.state,
      'active_epoch_id', gate.active_epoch_id,
      'active_closure_id', gate.active_closure_id
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
      '2026', 2026, 'Maintenance rebind test tournament',
      ${sqlLiteral(scope.source_workbook_id)}, 'GOOGLE'
    );
    insert into scoring_authority.ingress_gates (
      tournament_id, state, authority, active_epoch_id,
      unresolved_client_queues, updated_by
    ) values ('2026', 'PAUSED', 'GOOGLE', null, 0, ${sqlLiteral(actor)});
  `);
}

function installSemanticFixture(cluster, database) {
  const importPayloadFingerprint = fingerprint("maintenance-050-import-payload");
  const importDatabaseFingerprint = fingerprint("maintenance-050-import-db");
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
      ${sqlLiteral(importPayloadFingerprint)}, 'PENDING',
      '{"lifecycle":"PRE_TOURNAMENT","current_round":0,"team_1_score":0,"team_2_score":0,"live_message":""}'::jsonb,
      '[]'::jsonb,
      '{"current_only_player_ids":[],"historical_appearances_inferred":false,"join_key":"Player ID","missing_player_source_ids":[],"unresolved_current_only_ids":[]}'::jsonb,
      '{}'::jsonb, '{}'::jsonb, 'step10b-production-shadow-bootstrap'
    from run;
  `);
  const projectionText = psql(cluster, database, `
    select production_control
      .current_tournament_shadow_semantic_projection_v1('2026')::text;
  `);
  const canonicalJson = JSON.stringify(JSON.parse(projectionText));
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
      ${sqlLiteral(importDatabaseFingerprint)}, projection.value,
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

function selectedConfigurationV2(bindingFingerprint) {
  return {
    contract_version: "production-maintenance-environment-delta-v3",
    release_sha: releaseSha,
    candidate_deployment_id: candidateDeployment,
    candidate_deployment_hostname: candidateDeploymentHostname,
    candidate_deployment_target: "PREVIEW",
    candidate_runtime_environment: "preview",
    candidate_hostname:
      "bagger-inv-git-feature-mock-tour-b4f752-sandbagger-invitational.vercel.app",
    preview_isolation_contract: "production-shadow-candidate-v1",
    preview_isolation_allowed: true,
    preview_commit_approved: true,
    preview_no_authoritative_features: true,
    production_deployment_target: "PRODUCTION",
    vercel_environment: "production",
    vercel_project: "bagger-inv",
    vercel_project_id: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
    vercel_team_id: "team_kPw5zaib8uaQJALAwj4fWI6R",
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
      "production-maintenance-staging-provenance-v2",
    staging_provenance_migration: targetMigration,
    release_binding_contract: "production-maintenance-release-binding-v1",
    release_binding_fingerprint: bindingFingerprint,
    precommit_deployment_rebind_contract:
      "production-maintenance-precommit-deployment-rebind-v1",
    precommit_deployment_rebind_migration: targetMigration,
  };
}

function releaseBindingInput(current, semantic) {
  return {
    ...scope,
    actor_id: actor,
    contract_version: "production-cutover-activation-v1",
    boundary_mode: "MAINTENANCE_WINDOW_V1",
    maintenance_provenance_contract:
      "production-maintenance-staging-provenance-v2",
    vercel_environment: "production",
    vercel_project: "bagger-inv",
    vercel_project_id: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
    vercel_team_id: "team_kPw5zaib8uaQJALAwj4fWI6R",
    canonical_domain: "https://baggerinv.com",
    tournament_year: 2026,
    deployment_id: candidateDeployment,
    deployment_commit: releaseSha,
    candidate_commit_sha: releaseSha,
    candidate_deployment_status: "READY",
    candidate_deployment_target: "PREVIEW",
    candidate_runtime_environment: "preview",
    candidate_evidence_contract: "vercel-ready-live-runtime-v1",
    candidate_evidence_observed_at: new Date().toISOString(),
    candidate_git_branch: "feature/mock-tournament-qa-integration",
    candidate_hostname:
      "bagger-inv-git-feature-mock-tour-b4f752-sandbagger-invitational.vercel.app",
    candidate_deployment_hostname: candidateDeploymentHostname,
    preview_isolation_contract: "production-shadow-candidate-v1",
    preview_isolation_allowed: true,
    preview_commit_approved: true,
    preview_no_authoritative_features: true,
    step11_allowed: true,
    step11_sha_approved: true,
    source_fingerprint: sourceFingerprint,
    semantic_parity_contract:
      "production-current-shadow-semantic-parity-v1",
    semantic_payload_fingerprint: semantic.payloadFingerprint,
    semantic_payload_canonical_json: semantic.canonicalJson,
    expected_activation_revision: Number(current.activation_revision),
    expected_authority_generation: current.authority_generation_id,
    expected_admission_revision: Number(current.admission_revision),
    expected_admission_generation: current.admission_generation_id,
    request_fingerprint: fingerprint("bind-release-050"),
  };
}

function installPreparedFixture(cluster, database) {
  psql(cluster, database, `
    insert into production_control.scoring_admission_closures (
      closure_id, boundary_mode, closure_kind, prior_legacy_closure_id,
      tournament_id, authority, authority_generation_id,
      admission_generation_id, deployment_id, status,
      opening_admission_revision, closing_admission_revision,
      closed_admission_revision, lease_high_watermark,
      start_source_fingerprint, first_source_fingerprint,
      first_source_captured_at, second_source_captured_at,
      final_source_fingerprint, supabase_shadow_fingerprint,
      unexplained_difference_count, reconciliation_fingerprint,
      lease_set_fingerprint, supabase_match_revisions, google_checkpoints,
      external_fence_evidence_id, google_writer_provider_fence_id,
      google_writer_provider_verification_id, close_request_fingerprint,
      close_payload_hash, closing_at, closed_at, actor_id
    )
    select
      ${sqlLiteral(closureId)}::uuid, 'MAINTENANCE_WINDOW_V1',
      'LEGACY_ADMISSION', null, '2026', 'GOOGLE',
      activation.authority_generation_id, gate.admission_generation_id,
      ${sqlLiteral(oldDeployment)}, 'CLOSED', 5, 6, 7, 0,
      ${sqlLiteral(sourceFingerprint)}, ${sqlLiteral(sourceFingerprint)},
      pg_catalog.now() - interval '3 seconds',
      pg_catalog.now() - interval '1 second',
      ${sqlLiteral(sourceFingerprint)}, ${sqlLiteral(sourceFingerprint)}, 0,
      ${sqlLiteral(reconciliationFingerprint)},
      ${sqlLiteral(leaseFingerprint)}, '{}'::jsonb, '{}'::jsonb,
      null, null, null, ${sqlLiteral(fingerprint("closure-request"))},
      ${sqlLiteral(fingerprint("closure-payload"))},
      pg_catalog.now() - interval '4 seconds',
      pg_catalog.now() - interval '1 second', ${sqlLiteral(actor)}
    from production_control.cutover_activation_state activation
    cross join scoring_authority.ingress_gates gate
    where activation.scope_key = 'BAGGER_INV_PRODUCTION'
      and gate.tournament_id = '2026';

    insert into scoring_authority.authority_epochs (
      epoch_id, tournament_id, epoch_type, status, authority_before,
      authority_after, reconciliation_fingerprint, google_checkpoints,
      supabase_match_revisions, deployment_commit, actor_id, reason,
      request_fingerprint, source_fingerprint,
      prepared_activation_revision, prior_active_epoch_id,
      admission_closure_id, admission_generation_id,
      closed_admission_revision, closure_boundary_fingerprint,
      prior_source_fingerprint, external_fence_evidence_id,
      google_writer_provider_fence_id,
      google_writer_provider_verification_id, boundary_mode,
      supabase_shadow_fingerprint
    )
    select
      ${sqlLiteral(epochId)}::uuid, '2026', 'CUTOVER', 'PREPARED',
      'GOOGLE', 'SUPABASE', ${sqlLiteral(reconciliationFingerprint)},
      '{}'::jsonb, '{}'::jsonb, ${sqlLiteral(releaseSha)},
      ${sqlLiteral(actor)}, 'test prepared epoch',
      ${sqlLiteral(fingerprint("epoch-request"))},
      ${sqlLiteral(sourceFingerprint)}, 11, null,
      ${sqlLiteral(closureId)}::uuid, gate.admission_generation_id, 7,
      ${sqlLiteral(leaseFingerprint)}, ${sqlLiteral(sourceFingerprint)},
      null, null, null, 'MAINTENANCE_WINDOW_V1',
      ${sqlLiteral(sourceFingerprint)}
    from scoring_authority.ingress_gates gate
    where gate.tournament_id = '2026';

    update scoring_authority.ingress_gates
    set state = 'PAUSED', authority = 'GOOGLE',
        active_epoch_id = ${sqlLiteral(epochId)}::uuid,
        boundary_mode = 'MAINTENANCE_WINDOW_V1',
        admission_state = 'CLOSED', admission_revision = 7,
        admission_protocol_enforced = true,
        admission_enforced_at = pg_catalog.now() - interval '10 seconds',
        admission_opened_at = pg_catalog.now() - interval '10 seconds',
        admission_deployment_id = ${sqlLiteral(oldDeployment)},
        legacy_lease_set_fingerprint = ${sqlLiteral(leaseFingerprint)},
        active_closure_id = ${sqlLiteral(closureId)}::uuid,
        external_fence_evidence_id = null,
        google_writer_provider_fence_id = null,
        google_writer_provider_verification_id = null,
        unresolved_client_queues = 0
    where tournament_id = '2026';

    update production_control.resource_scope
    set public_supabase_reads_enabled = true,
        current_tournament_read_authority = 'SUPABASE',
        participant_identity_authority = 'SUPABASE',
        auth_user_creation_enabled = true,
        scoring_authority = 'GOOGLE', scoring_ingress_enabled = false,
        google_writes_enabled = false, workers_enabled = false
    where scope_key = 'BAGGER_INV_PRODUCTION';

    update production_control.cutover_activation_state
    set state = 'CUTOVER_PREPARED', activation_revision = 12,
        expected_deployment_commit = ${sqlLiteral(releaseSha)},
        expected_vercel_project_id =
          'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU',
        expected_source_fingerprint = ${sqlLiteral(sourceFingerprint)},
        current_authority = 'GOOGLE', scoring_ingress_enabled = false,
        read_cutover_phase = 'SCORING_PREPARE',
        read_source_fingerprint = ${sqlLiteral(sourceFingerprint)},
        boundary_mode = 'MAINTENANCE_WINDOW_V1',
        maintenance_state = 'SCORING_MAINTENANCE',
        maintenance_started_at = pg_catalog.now(),
        maintenance_ended_at = null,
        active_transition_epoch_id = ${sqlLiteral(epochId)}::uuid,
        staged_certification_fingerprint =
          ${sqlLiteral(stagedCertificationFingerprint)},
        staged_environment_delta_fingerprint_v2 =
          ${sqlLiteral(stagedEnvironmentFingerprint)},
        first_supabase_write_possible_at = null,
        first_supabase_write_observed_at = null,
        first_supabase_mutation_key = null,
        first_supabase_match_id = null,
        first_supabase_match_revision = null
    where scope_key = 'BAGGER_INV_PRODUCTION';

    insert into production_control.maintenance_release_candidates (
      contract_version, release_sha, candidate_deployment_id,
      candidate_hostname, candidate_deployment_hostname,
      candidate_evidence_observed_at, vercel_project_id, vercel_team_id,
      activation_revision, authority_generation_id, admission_revision,
      admission_generation_id, source_fingerprint,
      semantic_payload_fingerprint, semantic_database_fingerprint,
      binding_manifest, binding_fingerprint, request_fingerprint,
      payload_hash, actor_id
    )
    select
      'production-maintenance-release-binding-v1',
      ${sqlLiteral(releaseSha)}, ${sqlLiteral(candidateDeployment)},
      'bagger-inv-git-feature-mock-tour-b4f752-sandbagger-invitational.vercel.app',
      ${sqlLiteral(candidateDeploymentHostname)}, pg_catalog.now(),
      'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU',
      'team_kPw5zaib8uaQJALAwj4fWI6R', activation.activation_revision,
      activation.authority_generation_id, gate.admission_revision,
      gate.admission_generation_id, ${sqlLiteral(sourceFingerprint)},
      ${sqlLiteral("6".repeat(64))}, ${sqlLiteral("7".repeat(64))},
      '{}'::jsonb, ${sqlLiteral("8".repeat(64))},
      ${sqlLiteral("9".repeat(64))}, ${sqlLiteral("a".repeat(64))},
      ${sqlLiteral(actor)}
    from production_control.cutover_activation_state activation
    cross join scoring_authority.ingress_gates gate
    where activation.scope_key = 'BAGGER_INV_PRODUCTION'
      and gate.tournament_id = '2026';
  `);
}

function rebindInput(current, label, overrides = {}) {
  return {
    ...scope,
    boundary_mode: "MAINTENANCE_WINDOW_V1",
    operation: "REBIND_PRODUCTION_MAINTENANCE_PRECOMMIT_DEPLOYMENT",
    original_deployment_id: oldDeployment,
    deployment_id: newDeployment,
    deployment_commit: releaseSha,
    epoch_id: epochId,
    closure_id: closureId,
    expected_activation_revision: Number(current.activation_revision),
    expected_authority_generation: current.authority_generation_id,
    expected_admission_revision: Number(current.admission_revision),
    expected_admission_generation: current.admission_generation_id,
    staged_environment_delta_fingerprint_v2:
      stagedEnvironmentFingerprint,
    runtime_binding_contract:
      "production-maintenance-precommit-deployment-rebind-v1",
    runtime_deployment_status: "READY",
    runtime_readiness_evidence: "LIVE_CANONICAL_PRODUCTION_ROUTE",
    runtime_deployment_target: "PRODUCTION",
    runtime_environment: "production",
    runtime_vercel_project: "bagger-inv",
    runtime_vercel_project_id: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
    runtime_vercel_team_id: "team_kPw5zaib8uaQJALAwj4fWI6R",
    runtime_canonical_hostname: "baggerinv.com",
    runtime_deployment_hostname: "bagger-replacement-ready.vercel.app",
    runtime_cutover_phase: "SCORING_COMMIT",
    runtime_deployment_commit: releaseSha,
    runtime_scoring_authority: "SUPABASE",
    runtime_participant_identity_authority: "SUPABASE",
    runtime_expected_authority_epoch: epochId,
    runtime_expected_admission_generation: current.admission_generation_id,
    runtime_activation_enabled: true,
    runtime_foundation_enabled: true,
    runtime_google_ingress_lease_gate_enabled: true,
    runtime_supabase_scoring_ingress_enabled: true,
    runtime_workers_enabled: false,
    runtime_google_mirror_enabled: false,
    runtime_scorecard_archive_enabled: false,
    runtime_observed_at: new Date().toISOString(),
    actor_id: actor,
    request_fingerprint: fingerprint(`rebind-${label}`),
    ...overrides,
  };
}

function installOddsInputFixture(cluster, database) {
  psql(cluster, database, `
    insert into scoring_authority.odds_input_configurations (
      tournament_id, configuration_revision, source_workbook_id,
      settings, historical_ratings, settings_fingerprint,
      ratings_fingerprint, pairing_fingerprint, bundle_fingerprint,
      is_current, imported_by, source_fingerprint, canonical_settings,
      effective_settings, effective_settings_fingerprint,
      settings_contract_version, validation_status, validation_diagnostics,
      synchronized_at
    ) values (
      '2026', 1, ${sqlLiteral(scope.source_workbook_id)},
      '[]'::jsonb, '{}'::jsonb, ${sqlLiteral("d".repeat(64))},
      ${sqlLiteral("e".repeat(64))}, ${sqlLiteral("f".repeat(64))},
      ${sqlLiteral("1".repeat(64))}, true, ${sqlLiteral(actor)},
      ${sqlLiteral(predictionSourceFingerprint)}, '{}'::jsonb, '{}'::jsonb,
      ${sqlLiteral(predictionEffectiveFingerprint)},
      'prediction-settings-v1', 'VALID', '{}'::jsonb, pg_catalog.now()
    );
  `);
}

function rebindInputV2(current, label, overrides = {}) {
  return rebindInput(current, label, {
    runtime_binding_contract:
      "production-maintenance-precommit-deployment-rebind-v2",
    runtime_deployment_capability_contract:
      "production-maintenance-single-deployment-capability-v1",
    runtime_deployment_capability_ceiling: "OBSERVATION",
    runtime_public_supabase_reads_enabled: true,
    runtime_workers_enabled: true,
    runtime_google_mirror_enabled: true,
    runtime_scorecard_archive_enabled: true,
    runtime_outbox_worker_secret_configured: true,
    runtime_archive_worker_secret_configured: true,
    runtime_odds_calculation_enabled: true,
    runtime_war_room_input_source: "SUPABASE",
    runtime_prediction_settings_read_source: "SUPABASE",
    runtime_odds_calculation_input_source: "SUPABASE",
    runtime_prediction_settings_source_fingerprint:
      predictionSourceFingerprint,
    runtime_prediction_settings_effective_fingerprint:
      predictionEffectiveFingerprint,
    runtime_odds_publication_authority: "GOOGLE",
    runtime_supabase_odds_publication_enabled: false,
    runtime_supabase_odds_google_mirror_enabled: false,
    ...overrides,
  });
}

function postcutoverApplicationRebindInput(current, label, overrides = {}) {
  return rebindInputV2(current, label, {
    original_deployment_id: newDeployment,
    deployment_id: postcutoverDeployment,
    deployment_commit: postcutoverReleaseSha,
    runtime_deployment_commit: postcutoverReleaseSha,
    runtime_deployment_hostname: postcutoverDeploymentHostname,
    request_fingerprint: fingerprint(`postcutover-rebind-${label}`),
    ...overrides,
  });
}

function capabilityScope(extra = {}) {
  return {
    ...scope,
    deployment_id: newDeployment,
    deployment_commit: releaseSha,
    deployment_capability_contract:
      "production-maintenance-single-deployment-capability-v1",
    deployment_capability_ceiling: "OBSERVATION",
    ...extra,
  };
}

function postcutoverCapabilityScope(extra = {}) {
  return capabilityScope({
    deployment_id: postcutoverDeployment,
    deployment_commit: postcutoverReleaseSha,
    ...extra,
  });
}

function configureCurrentReadsBeforeCapabilityBinding(cluster, database, {
  boundaryMode = "MAINTENANCE_WINDOW_V1",
} = {}) {
  psql(cluster, database, `
    update production_control.cutover_activation_state
    set state = 'STAGED', activation_revision = 10,
        current_authority = 'GOOGLE',
        boundary_mode = ${sqlLiteral(boundaryMode)},
        read_cutover_phase = 'CURRENT_READS',
        read_source_fingerprint = ${sqlLiteral(sourceFingerprint)},
        maintenance_state = 'NORMAL', maintenance_started_at = null,
        maintenance_ended_at = null, active_transition_epoch_id = null,
        scoring_ingress_enabled = false,
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
        boundary_mode = ${sqlLiteral(boundaryMode)},
        admission_state = 'OPEN', active_closure_id = null,
        unresolved_client_queues = 0
    where tournament_id = '2026';
  `);
}

function commitInput(current, deployment, label) {
  return {
    ...scope,
    boundary_mode: "MAINTENANCE_WINDOW_V1",
    actor_id: actor,
    deployment_id: deployment,
    deployment_commit: releaseSha,
    epoch_id: epochId,
    closure_id: closureId,
    expected_activation_revision: Number(current.activation_revision),
    expected_authority_generation: current.authority_generation_id,
    expected_admission_revision: Number(current.admission_revision),
    expected_admission_generation: current.admission_generation_id,
    commit_google_source_fingerprint: sourceFingerprint,
    commit_google_captured_at: new Date().toISOString(),
    supabase_shadow_fingerprint: sourceFingerprint,
    reconciliation_fingerprint: reconciliationFingerprint,
    request_fingerprint: fingerprint(`commit-${label}`),
  };
}

function phaseInput(current, priorPhase, targetPhase, label) {
  return capabilityScope({
    actor_id: actor,
    mode: "ACTIVATE",
    expected_prior_phase: priorPhase,
    target_phase: targetPhase,
    source_fingerprint: sourceFingerprint,
    expected_activation_revision: Number(current.activation_revision),
    request_fingerprint: fingerprint(`phase-${label}`),
  });
}

function commitInputV2(current, label) {
  return {
    ...commitInput(current, newDeployment, label),
    deployment_capability_contract:
      "production-maintenance-single-deployment-capability-v1",
    deployment_capability_ceiling: "OBSERVATION",
  };
}

function resumeInputV2(current, label) {
  return capabilityScope({
    boundary_mode: "MAINTENANCE_WINDOW_V1",
    actor_id: actor,
    epoch_id: epochId,
    expected_activation_revision: Number(current.activation_revision),
    expected_authority_generation: current.authority_generation_id,
    expected_admission_revision: Number(current.admission_revision),
    expected_admission_generation: current.admission_generation_id,
    runtime_verification_fingerprint: fingerprint(`runtime-${label}`),
    configuration_fingerprint: stagedEnvironmentFingerprint,
    request_fingerprint: fingerprint(`resume-${label}`),
  });
}

function workerInput(current, workerName, label) {
  return capabilityScope({
    actor_id: actor,
    worker_name: workerName,
    enabled: true,
    expected_activation_revision: Number(current.activation_revision),
    expected_epoch_id: current.authority_generation_id,
    google_service_account_email:
      "sbi-production-workbook@sandbagger-invitational.iam.gserviceaccount.com",
    request_fingerprint: fingerprint(`worker-${label}`),
  });
}

function oddsRuntimeInput(current, expectedEnabled, expectedRevision, label) {
  return capabilityScope({
    vercel_project_id: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
    canonical_domain: "https://baggerinv.com",
    tournament_year: 2026,
    worker_name: "ODDS_CALCULATION",
    operation_mode: "PRODUCTION_CUTOVER",
    cutover_phase: "ODDS_WAR_ROOM",
    actor_id: actor,
    enabled: true,
    expected_runtime_enabled: expectedEnabled,
    expected_runtime_revision: expectedRevision,
    expected_activation_revision: Number(current.activation_revision),
    request_fingerprint: fingerprint(`odds-${label}`),
  });
}

test(
  "maintenance prepared deployment rebind is atomic, one-time, and fail-closed in PostgreSQL 17",
  { timeout: 120_000 },
  async (t) => {
    if (!(await allBinariesAvailable())) {
      t.skip(`PostgreSQL 17 toolchain is unavailable at ${pgBin}`);
      return;
    }
    const cluster = await createCluster();
    const preMigrationDatabase = "maintenance_rebind_pre050";
    const templateDatabase = "maintenance_rebind_template";
    let cloneCounter = 0;
    const clone = (label) => {
      cloneCounter += 1;
      const database = `maintenance_rebind_${cloneCounter}_${label}`;
      createDatabase(cluster, database, templateDatabase);
      return database;
    };
    try {
      createDatabase(cluster, preMigrationDatabase);
      installSupabaseCompatibility(cluster, preMigrationDatabase);
      await installThrough(
        cluster,
        preMigrationDatabase,
        providerInventoryV4Migration,
      );
      installControlFixture(cluster, preMigrationDatabase);
      await installThrough(
        cluster,
        preMigrationDatabase,
        priorMigration,
        providerInventoryV3Migration,
      );
      const beforeMigration = baseState(cluster, preMigrationDatabase);
      const providerBefore = psql(cluster, preMigrationDatabase, `
        select pg_catalog.pg_get_functiondef(
          'public.stage_production_cutover_release_provider_fence_v2(jsonb)'
            ::regprocedure
        );
      `);
      psqlFile(
        cluster,
        preMigrationDatabase,
        path.join(migrationsDirectory, targetMigration),
      );
      assert.deepEqual(baseState(cluster, preMigrationDatabase), beforeMigration);
      assert.equal(psql(cluster, preMigrationDatabase, `
        select pg_catalog.pg_get_functiondef(
          'public.stage_production_cutover_release_provider_fence_v2(jsonb)'
            ::regprocedure
        );
      `), providerBefore);
      const semantic = installSemanticFixture(cluster, preMigrationDatabase);
      const provenanceDatabase = "maintenance_rebind_provenance_v2";
      createDatabase(cluster, provenanceDatabase, preMigrationDatabase);

      await t.test("new exact release binding generates and stages v2 provenance", () => {
        const current = baseState(cluster, provenanceDatabase);
        const bindingInput = releaseBindingInput(current, semantic);
        const bound = ownerControlFunction(
          cluster,
          provenanceDatabase,
          "bind_production_maintenance_release_candidate",
          bindingInput,
        );
        assert.equal(bound.ok, true);
        assert.equal(bound.release_sha, releaseSha);
        assert.equal(bound.candidate_deployment_id, candidateDeployment);
        assert.match(bound.binding_fingerprint, /^[0-9a-f]{64}$/);
        assert.equal(psql(cluster, provenanceDatabase, `
          select pg_catalog.has_function_privilege(
            'service_role',
            'production_control.bind_production_maintenance_release_candidate(jsonb)',
            'EXECUTE'
          );
        `), "f");
        const provenanceInput = {
          ...bindingInput,
          release_binding_fingerprint: bound.binding_fingerprint,
          selected_release_configuration:
            selectedConfigurationV2(bound.binding_fingerprint),
          request_fingerprint: fingerprint("inspect-provenance-050"),
        };
        const provenance = rpc(
          cluster,
          provenanceDatabase,
          "inspect_production_maintenance_stage_provenance",
          provenanceInput,
        );
        assert.equal(provenance.ok, true);
        assert.equal(provenance.eligible, true);
        assert.equal(provenance.deployment_commit, releaseSha);
        assert.equal(
          provenance.maintenance_provenance_contract,
          "production-maintenance-staging-provenance-v2",
        );
        assert.match(provenance.certification_fingerprint, /^[0-9a-f]{64}$/);
        assert.match(
          provenance.environment_delta_fingerprint_v2,
          /^[0-9a-f]{64}$/,
        );
        const staged = rpc(
          cluster,
          provenanceDatabase,
          "stage_production_cutover_release",
          {
            ...provenanceInput,
            certification_fingerprint: provenance.certification_fingerprint,
            environment_delta_fingerprint_v2:
              provenance.environment_delta_fingerprint_v2,
            request_fingerprint: fingerprint("stage-provenance-050"),
          },
        );
        assert.equal(staged.code, "PRODUCTION_RELEASE_STAGED");
        assert.equal(staged.boundary_mode, "MAINTENANCE_WINDOW_V1");
        assert.equal(
          baseState(cluster, provenanceDatabase).expected_deployment_commit,
          releaseSha,
        );

        const secondInput = {
          ...bindingInput,
          deployment_commit: "b".repeat(40),
          candidate_commit_sha: "b".repeat(40),
          deployment_id: "dpl_AnotherCandidate050",
          candidate_deployment_hostname: "bagger-another-candidate.vercel.app",
          request_fingerprint: fingerprint("bind-release-050-second"),
        };
        assertCommandFailure(
          () => ownerControlFunction(
            cluster,
            provenanceDatabase,
            "bind_production_maintenance_release_candidate",
            secondInput,
          ),
          /PRODUCTION_MAINTENANCE_RELEASE_BINDING_ALREADY_BOUND/,
        );
      });

      await t.test("staged replay preserves the complete maintenance fail-closed state", () => {
        const database = "maintenance_rebind_stage_replay";
        createDatabase(cluster, database, preMigrationDatabase);
        const current = baseState(cluster, database);
        const bindingInput = releaseBindingInput(current, semantic);
        const bound = ownerControlFunction(
          cluster,
          database,
          "bind_production_maintenance_release_candidate",
          bindingInput,
        );
        const provenanceInput = {
          ...bindingInput,
          release_binding_fingerprint: bound.binding_fingerprint,
          selected_release_configuration:
            selectedConfigurationV2(bound.binding_fingerprint),
          request_fingerprint: fingerprint("inspect-stage-replay-050"),
        };
        const provenance = rpc(
          cluster,
          database,
          "inspect_production_maintenance_stage_provenance",
          provenanceInput,
        );
        const stageInput = {
          ...provenanceInput,
          certification_fingerprint: provenance.certification_fingerprint,
          environment_delta_fingerprint_v2:
            provenance.environment_delta_fingerprint_v2,
          request_fingerprint: fingerprint("stage-replay-050"),
        };
        rpc(cluster, database, "stage_production_cutover_release", stageInput);
        psql(cluster, database, `
          update production_control.resource_scope
          set google_writes_enabled = true
          where scope_key = 'BAGGER_INV_PRODUCTION';
        `);
        assertCommandFailure(
          () => rpc(
            cluster,
            database,
            "stage_production_cutover_release",
            stageInput,
          ),
          /PRODUCTION_STAGE_PROVENANCE_IMMUTABLE/,
        );
      });

      installPreparedFixture(cluster, preMigrationDatabase);
      createDatabase(cluster, templateDatabase, preMigrationDatabase);

      await t.test("prepared A to B rebind and exact replay", () => {
        const database = clone("success");
        const before = baseState(cluster, database);
        const input = rebindInput(before, "success");
        const result = rpc(
          cluster,
          database,
          "rebind_production_maintenance_precommit_deployment",
          input,
        );
        assert.equal(result.ok, true);
        assert.equal(result.idempotent, false);
        assert.equal(result.original_deployment_id, oldDeployment);
        assert.equal(result.deployment_id, newDeployment);
        assert.equal(result.authority, "GOOGLE");
        assert.equal(result.maintenance_state, "SCORING_MAINTENANCE");
        assert.equal(result.first_supabase_canonical_write_possible, false);
        const after = baseState(cluster, database);
        assert.equal(after.activation_revision, before.activation_revision + 1);
        assert.equal(after.admission_revision, before.admission_revision + 1);
        assert.equal(after.authority_generation_id, before.authority_generation_id);
        assert.equal(after.admission_generation_id, before.admission_generation_id);
        assert.equal(after.admission_deployment_id, newDeployment);
        assert.equal(after.activation_state, "CUTOVER_PREPARED");
        assert.equal(after.authority, "GOOGLE");
        assert.equal(after.maintenance_state, "SCORING_MAINTENANCE");
        assert.equal(after.activation_ingress, false);
        assert.equal(after.resource_workers, false);
        assert.equal(after.first_write_possible_at, null);
        assert.equal(after.first_write_observed_at, null);
        assert.equal(psql(cluster, database, `
          select pg_catalog.count(*)
          from production_control.maintenance_runtime_deployment_rebindings;
        `), "1");
        assert.equal(psql(cluster, database, `
          select deployment_id || ':' || closed_admission_revision
          from production_control.scoring_admission_closures
          where closure_id = ${sqlLiteral(closureId)}::uuid;
        `), `${newDeployment}:${after.admission_revision}`);
        assert.equal(psql(cluster, database, `
          select closed_admission_revision
          from scoring_authority.authority_epochs
          where epoch_id = ${sqlLiteral(epochId)}::uuid;
        `), String(after.admission_revision));
        const replay = rpc(
          cluster,
          database,
          "rebind_production_maintenance_precommit_deployment",
          {
            ...input,
            runtime_observed_at:
              new Date(Date.now() - 10 * 60 * 1000).toISOString(),
          },
        );
        assert.equal(replay.idempotent, true);
        assert.deepEqual(baseState(cluster, database), after);
      });

      await t.test("a different second rebind is rejected", () => {
        const database = clone("second");
        const before = baseState(cluster, database);
        rpc(cluster, database,
          "rebind_production_maintenance_precommit_deployment",
          rebindInput(before, "second-first"));
        assertCommandFailure(
          () => rpc(cluster, database,
            "rebind_production_maintenance_precommit_deployment",
            rebindInput(before, "second-different", {
              deployment_id: "dpl_AnotherReplacement050",
              runtime_deployment_hostname: "bagger-another.vercel.app",
            })),
          /PRODUCTION_MAINTENANCE_PRECOMMIT_REBIND_ALREADY_USED/,
        );
      });

      await t.test("runtime, resource, token, and Preview mismatches fail", () => {
        for (const [label, overrides, expected] of [
          ["not-ready", { runtime_deployment_status: "BUILDING" },
            /PRODUCTION_MAINTENANCE_PRECOMMIT_REBIND_INPUT_INVALID/],
          ["wrong-sha", {
            deployment_commit: "b".repeat(40),
            runtime_deployment_commit: "b".repeat(40),
          }, /PRODUCTION_EXACT_RELEASE_REQUIRED/],
          ["wrong-project", { runtime_vercel_project_id: "prj_preview" },
            /PRODUCTION_MAINTENANCE_PRECOMMIT_REBIND_INPUT_INVALID/],
          ["wrong-team", { runtime_vercel_team_id: "team_preview" },
            /PRODUCTION_MAINTENANCE_PRECOMMIT_REBIND_INPUT_INVALID/],
          ["wrong-phase", { runtime_cutover_phase: "SCORING_PREPARE" },
            /PRODUCTION_MAINTENANCE_PRECOMMIT_REBIND_INPUT_INVALID/],
          ["missing-observation", { runtime_observed_at: null },
            /PRODUCTION_MAINTENANCE_PRECOMMIT_RUNTIME_NOT_CURRENT/],
          ["preview", { environment: "PREVIEW" },
            /PRODUCTION_RESOURCE_ASSERTION_FAILED/],
          ["stale-revision", { expected_activation_revision: 11 },
            /PRODUCTION_MAINTENANCE_PRECOMMIT_REBIND_NOT_SAFE/],
          ["stale-generation", {
            expected_authority_generation:
              "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          }, /PRODUCTION_MAINTENANCE_PRECOMMIT_REBIND_NOT_SAFE/],
        ]) {
          const database = clone(`mismatch_${label}`);
          const before = baseState(cluster, database);
          const input = rebindInput(before, `mismatch-${label}`, overrides);
          if (overrides.expected_authority_generation) {
            input.runtime_expected_authority_epoch = epochId;
          }
          assertCommandFailure(
            () => rpc(cluster, database,
              "rebind_production_maintenance_precommit_deployment", input),
            expected,
          );
          assert.deepEqual(baseState(cluster, database), before);
        }
      });

      await t.test("unprepared, committed, write, worker, and unresolved states fail", () => {
        for (const [label, mutation] of [
          ["unprepared", `
            update scoring_authority.authority_epochs set status = 'ABORTED',
              aborted_at = pg_catalog.now()
            where epoch_id = ${sqlLiteral(epochId)}::uuid;
          `],
          ["committed", `
            update scoring_authority.authority_epochs set status = 'COMMITTED',
              committed_at = pg_catalog.now()
            where epoch_id = ${sqlLiteral(epochId)}::uuid;
          `],
          ["first-write", `
            update production_control.cutover_activation_state
            set first_supabase_write_possible_at = pg_catalog.now()
            where scope_key = 'BAGGER_INV_PRODUCTION';
          `],
          ["worker", `
            update production_control.worker_controls
            set enabled = true
            where worker_name = 'SCORING_GOOGLE_OUTBOX';
          `],
          ["queue", `
            update scoring_authority.ingress_gates
            set unresolved_client_queues = 1 where tournament_id = '2026';
          `],
          ["closure-boundary", `
            update scoring_authority.authority_epochs
            set closure_boundary_fingerprint = ${sqlLiteral("d".repeat(64))}
            where epoch_id = ${sqlLiteral(epochId)}::uuid;
          `],
        ]) {
          const database = clone(`unsafe_${label}`);
          const before = baseState(cluster, database);
          psql(cluster, database, mutation);
          assertCommandFailure(
            () => rpc(cluster, database,
              "rebind_production_maintenance_precommit_deployment",
              rebindInput(baseState(cluster, database), `unsafe-${label}`)),
            /PRODUCTION_MAINTENANCE_PRECOMMIT_REBIND_NOT_SAFE/,
          );
          assert.equal(psql(cluster, database, `
            select pg_catalog.count(*)
            from production_control.maintenance_runtime_deployment_rebindings;
          `), "0");
          assert.equal(before.admission_deployment_id, oldDeployment);
        }
      });

      await t.test("service role only and PROVIDER_FENCE_V2 fail closed", () => {
        const deniedDatabase = clone("denied");
        assertCommandFailure(
          () => rpc(cluster, deniedDatabase,
            "rebind_production_maintenance_precommit_deployment",
            rebindInput(baseState(cluster, deniedDatabase), "denied"),
            { role: "authenticated" }),
          /PRODUCTION_SERVICE_ROLE_REQUIRED/,
        );
        const providerDatabase = clone("provider");
        psql(cluster, providerDatabase, `
          update production_control.cutover_activation_state
          set boundary_mode = 'PROVIDER_FENCE_V2',
              maintenance_state = 'NORMAL',
              maintenance_started_at = null,
              maintenance_ended_at = pg_catalog.now()
          where scope_key = 'BAGGER_INV_PRODUCTION';
        `);
        assertCommandFailure(
          () => rpc(cluster, providerDatabase,
            "rebind_production_maintenance_precommit_deployment",
            rebindInput(baseState(cluster, providerDatabase), "provider")),
          /PRODUCTION_MAINTENANCE_PRECOMMIT_REBIND_NOT_SAFE/,
        );
      });

      await t.test("old deployment commit fails and rebound deployment commit/resume succeeds", () => {
        const oldDatabase = clone("old_commit");
        const oldBefore = baseState(cluster, oldDatabase);
        rpc(cluster, oldDatabase,
          "rebind_production_maintenance_precommit_deployment",
          rebindInput(oldBefore, "old-commit-rebind"));
        const rebound = baseState(cluster, oldDatabase);
        assertCommandFailure(
          () => rpc(cluster, oldDatabase, "commit_production_authority_epoch",
            commitInput(rebound, oldDeployment, "old-deployment")),
          /PRODUCTION_MAINTENANCE_CUTOVER_COMMIT_NOT_SAFE/,
        );

        const database = clone("new_commit");
        rpc(cluster, database,
          "rebind_production_maintenance_precommit_deployment",
          rebindInput(baseState(cluster, database), "new-commit-rebind"));
        const beforeCommit = baseState(cluster, database);
        const committed = rpc(
          cluster,
          database,
          "commit_production_authority_epoch",
          commitInput(beforeCommit, newDeployment, "new-deployment"),
        );
        assert.equal(committed.authority, "SUPABASE");
        assert.equal(committed.ingress, "PAUSED");
        assert.equal(committed.first_supabase_canonical_write_possible, false);
        const afterCommit = baseState(cluster, database);
        const resumed = rpc(
          cluster,
          database,
          "resume_production_supabase_scoring",
          {
            ...scope,
            boundary_mode: "MAINTENANCE_WINDOW_V1",
            actor_id: actor,
            deployment_id: newDeployment,
            deployment_commit: releaseSha,
            epoch_id: epochId,
            expected_activation_revision: Number(afterCommit.activation_revision),
            expected_authority_generation: epochId,
            expected_admission_revision: Number(afterCommit.admission_revision),
            expected_admission_generation: afterCommit.admission_generation_id,
            runtime_verification_fingerprint: "c".repeat(64),
            configuration_fingerprint: stagedEnvironmentFingerprint,
            request_fingerprint: fingerprint("resume-new-deployment"),
          },
        );
        assert.equal(resumed.authority, "SUPABASE");
        assert.equal(resumed.ingress, "OPEN");
        assert.equal(resumed.first_supabase_canonical_write_possible, true);
      });
    } finally {
      await destroyCluster(cluster);
    }
  },
);

test(
  "migration 051 binds one maintenance deployment through observation while database phases stay authoritative",
  { timeout: 120_000 },
  async (t) => {
    if (!(await allBinariesAvailable())) {
      t.skip(`PostgreSQL 17 toolchain is unavailable at ${pgBin}`);
      return;
    }
    const cluster = await createCluster();
    const templateDatabase = "maintenance_capability_template";
    let cloneCounter = 0;
    const clone = (label) => {
      cloneCounter += 1;
      const database = `maintenance_capability_${cloneCounter}_${label}`;
      createDatabase(cluster, database, templateDatabase);
      return database;
    };
    try {
      createDatabase(cluster, templateDatabase);
      installSupabaseCompatibility(cluster, templateDatabase);
      await installThrough(
        cluster,
        templateDatabase,
        providerInventoryV4Migration,
      );
      installControlFixture(cluster, templateDatabase);
      await installThrough(
        cluster,
        templateDatabase,
        targetMigration,
        providerInventoryV3Migration,
      );
      const beforeMigration = baseState(cluster, templateDatabase);
      assert.equal(beforeMigration.activation_state, "DORMANT");
      assert.equal(beforeMigration.authority, "GOOGLE");
      assert.equal(beforeMigration.resource_authority, "GOOGLE");
      assert.equal(beforeMigration.identity_authority, "PASSPORT");
      assert.equal(beforeMigration.maintenance_state, "NORMAL");
      assert.equal(beforeMigration.admission_state, "OPEN");
      assert.equal(beforeMigration.activation_ingress, false);
      assert.equal(beforeMigration.resource_ingress, false);
      assert.equal(beforeMigration.resource_workers, false);
      assert.equal(beforeMigration.first_write_possible_at, null);
      assert.equal(beforeMigration.first_write_observed_at, null);
      const providerBefore = psql(cluster, templateDatabase, `
        select pg_catalog.pg_get_functiondef(
          'public.stage_production_cutover_release_provider_fence_v2(jsonb)'
            ::regprocedure
        );
      `);
      psqlFile(
        cluster,
        templateDatabase,
        path.join(migrationsDirectory, capabilityMigration),
      );
      assert.deepEqual(baseState(cluster, templateDatabase), beforeMigration);
      assert.equal(psql(cluster, templateDatabase, `
        select pg_catalog.pg_get_functiondef(
          'public.stage_production_cutover_release_provider_fence_v2(jsonb)'
            ::regprocedure
        );
      `), providerBefore);
      const semantic = installSemanticFixture(cluster, templateDatabase);
      const provenanceDatabase = "maintenance_capability_provenance";
      createDatabase(cluster, provenanceDatabase, templateDatabase);

      await t.test("exact release provenance carries the versioned ceiling and safely supersedes an unused release", () => {
        const current = baseState(cluster, provenanceDatabase);
        const firstInput = releaseBindingInput(current, semantic);
        const first = ownerControlFunction(
          cluster,
          provenanceDatabase,
          "bind_production_maintenance_release_candidate",
          firstInput,
        );
        const firstConfiguration = parseJsonOutput(psql(
          cluster,
          provenanceDatabase,
          `select production_control
            .production_maintenance_selected_configuration_v2(
              ${sqlLiteral(releaseSha)},
              ${sqlLiteral(candidateDeployment)},
              ${sqlLiteral(candidateDeploymentHostname)},
              ${sqlLiteral(first.binding_fingerprint)}
            )::text;`,
        ));
        assert.equal(
          firstConfiguration.deployment_capability_contract,
          "production-maintenance-single-deployment-capability-v1",
        );
        assert.equal(
          firstConfiguration.deployment_capability_ceiling,
          "OBSERVATION",
        );
        assert.equal(firstConfiguration.postcommit_redeployment_required, false);
        const firstProvenance = rpc(
          cluster,
          provenanceDatabase,
          "inspect_production_maintenance_stage_provenance",
          {
            ...firstInput,
            release_binding_fingerprint: first.binding_fingerprint,
            selected_release_configuration: firstConfiguration,
            request_fingerprint: fingerprint("inspect-capability-provenance"),
          },
        );
        assert.equal(firstProvenance.eligible, true);
        assert.equal(firstProvenance.deployment_commit, releaseSha);

        const nextRelease = "b".repeat(40);
        const nextDeployment = "dpl_MaintenanceCandidate051B";
        const nextHostname = "bagger-maintenance-candidate-b.vercel.app";
        const secondInput = {
          ...firstInput,
          deployment_id: nextDeployment,
          deployment_commit: nextRelease,
          candidate_commit_sha: nextRelease,
          candidate_deployment_hostname: nextHostname,
          request_fingerprint: fingerprint("bind-release-051-b"),
        };
        const second = ownerControlFunction(
          cluster,
          provenanceDatabase,
          "bind_production_maintenance_release_candidate",
          secondInput,
        );
        assert.equal(second.release_sha, nextRelease);
        assert.equal(second.candidate_deployment_id, nextDeployment);
        assert.equal(psql(cluster, provenanceDatabase, `
          select pg_catalog.count(*)
          from production_control.maintenance_release_candidate_history;
        `), "1");
        assert.equal(psql(cluster, provenanceDatabase, `
          select release_sha
          from production_control.maintenance_release_candidates
          where scope_key = 'BAGGER_INV_PRODUCTION';
        `), nextRelease);
      });
      installPreparedFixture(cluster, templateDatabase);
      installOddsInputFixture(cluster, templateDatabase);

      await t.test("SCORING_COMMIT cannot advance without the exact binding", () => {
        const database = clone("unbound");
        assertCommandFailure(
          () => rpc(
            cluster,
            database,
            "set_production_cutover_read_state",
            phaseInput(
              baseState(cluster, database),
              "SCORING_PREPARE",
              "SCORING_COMMIT",
              "unbound",
            ),
          ),
          /PRODUCTION_MAINTENANCE_RUNTIME_CAPABILITY_REQUIRED/,
        );
        assert.equal(
          baseState(cluster, database).read_cutover_phase,
          "SCORING_PREPARE",
        );
      });

      await t.test("attestation is exact, dormant, and idempotent", () => {
        const database = clone("binding");
        const current = baseState(cluster, database);
        assertCommandFailure(
          () => rpc(
            cluster,
            database,
            "rebind_production_maintenance_precommit_deployment",
            rebindInputV2(current, "wrong-ceiling", {
              runtime_deployment_capability_ceiling: "WORKERS",
            }),
          ),
          /PRODUCTION_MAINTENANCE_CAPABILITY_ATTESTATION_INVALID/,
        );
        const exactInput = rebindInputV2(
          baseState(cluster, database),
          "exact-capability",
        );
        const rebound = rpc(
          cluster,
          database,
          "rebind_production_maintenance_precommit_deployment",
          exactInput,
        );
        assert.equal(rebound.deployment_capability_ceiling, "OBSERVATION");
        assert.equal(rebound.capabilities_dormant, true);
        assert.equal(rebound.workers_enabled, false);
        assert.equal(rebound.odds_runtime_enabled, false);
        const replay = rpc(
          cluster,
          database,
          "rebind_production_maintenance_precommit_deployment",
          exactInput,
        );
        assert.equal(replay.idempotent, true);
        assert.deepEqual(parseJsonOutput(psql(cluster, database, `
          select pg_catalog.jsonb_build_object(
            'workers', resource.workers_enabled,
            'google_writes', resource.google_writes_enabled,
            'odds_runtime', runtime.enabled,
            'worker_count', (
              select pg_catalog.count(*)
              from production_control.worker_controls value
              where value.enabled
            )
          )::text
          from production_control.resource_scope resource
          cross join production_control.odds_calculation_runtime runtime
          where resource.scope_key = 'BAGGER_INV_PRODUCTION'
            and runtime.scope_key = 'BAGGER_INV_PRODUCTION';
        `)), {
          workers: false,
          google_writes: false,
          odds_runtime: false,
          worker_count: 0,
        });
      });

      await t.test("the OBSERVATION ceiling never advances the database phase", () => {
        const database = clone("read-ceiling");
        rpc(
          cluster,
          database,
          "rebind_production_maintenance_precommit_deployment",
          rebindInputV2(baseState(cluster, database), "read-ceiling"),
        );
        const readScope = capabilityScope({
          cutover_phase: "OBSERVATION",
          read_contract: "ACTIVE_CUTOVER",
        });
        psql(cluster, database, `
          select production_control.assert_production_cutover_read_scope(
            ${jsonSql(readScope)}, 'CURRENT_READS'
          );
        `);
        assertCommandFailure(
          () => psql(cluster, database, `
            select production_control.assert_production_cutover_read_scope(
              ${jsonSql(readScope)}, 'ODDS_WAR_ROOM'
            );
          `),
          /PRODUCTION_CUTOVER_READ_SCOPE_REQUIRED/,
        );
        assertCommandFailure(
          () => psql(cluster, database, `
            select production_control.assert_production_cutover_read_scope(
              ${jsonSql({ ...readScope, deployment_id: oldDeployment })},
              'CURRENT_READS'
            );
          `),
          /PRODUCTION_MAINTENANCE_RUNTIME_CAPABILITY_REQUIRED/,
        );
        psql(cluster, database, `
          update scoring_authority.ingress_gates
          set admission_deployment_id = ${sqlLiteral(oldDeployment)}
          where tournament_id = '2026';
        `);
        assertCommandFailure(
          () => psql(cluster, database, `
            select production_control.assert_production_cutover_read_scope(
              ${jsonSql(readScope)}, 'CURRENT_READS'
            );
          `),
          /PRODUCTION_MAINTENANCE_RUNTIME_CAPABILITY_REQUIRED/,
        );
        psql(cluster, database, `
          update scoring_authority.ingress_gates
          set admission_deployment_id = ${sqlLiteral(newDeployment)}
          where tournament_id = '2026';
        `);
        psql(cluster, database, `
          update scoring_authority.odds_input_configurations
          set source_fingerprint = ${sqlLiteral("0".repeat(64))}
          where tournament_id = '2026' and is_current;
        `);
        assertCommandFailure(
          () => psql(cluster, database, `
            select production_control
              .assert_production_maintenance_runtime_capability(
                ${jsonSql(capabilityScope())}, 'ODDS_WAR_ROOM'
              );
          `),
          /PRODUCTION_MAINTENANCE_PREDICTION_SETTINGS_BINDING_REQUIRED/,
        );
        assert.equal(
          baseState(cluster, database).read_cutover_phase,
          "SCORING_PREPARE",
        );
      });

      await t.test("commit, workers, Odds, and observation require each database milestone", () => {
        const database = clone("phases");
        rpc(
          cluster,
          database,
          "rebind_production_maintenance_precommit_deployment",
          rebindInputV2(baseState(cluster, database), "phases"),
        );

        assertCommandFailure(
          () => rpc(
            cluster,
            database,
            "commit_production_authority_epoch",
            commitInputV2(baseState(cluster, database), "too-early"),
          ),
          /PRODUCTION_MAINTENANCE_SCORING_COMMIT_PHASE_REQUIRED/,
        );
        assertCommandFailure(
          () => rpc(
            cluster,
            database,
            "set_production_cutover_read_state",
            phaseInput(
              baseState(cluster, database),
              "SCORING_PREPARE",
              "WORKERS",
              "skip-to-workers",
            ),
          ),
          /PRODUCTION_READ_STATE_PRECONDITION_FAILED/,
        );

        const scoringCommitPhase = rpc(
          cluster,
          database,
          "set_production_cutover_read_state",
          phaseInput(
            baseState(cluster, database),
            "SCORING_PREPARE",
            "SCORING_COMMIT",
            "scoring-commit",
          ),
        );
        assert.equal(scoringCommitPhase.phase, "SCORING_COMMIT");
        const committed = rpc(
          cluster,
          database,
          "commit_production_authority_epoch",
          commitInputV2(baseState(cluster, database), "exact"),
        );
        assert.equal(committed.authority, "SUPABASE");
        assert.equal(committed.ingress, "PAUSED");

        assertCommandFailure(
          () => rpc(
            cluster,
            database,
            "set_production_cutover_worker_state",
            workerInput(
              baseState(cluster, database),
              "SCORING_GOOGLE_OUTBOX",
              "before-workers-phase",
            ),
          ),
          /PRODUCTION_CUTOVER_WORKERS_PHASE_REQUIRED/,
        );
        assertCommandFailure(
          () => rpc(
            cluster,
            database,
            "set_production_cutover_read_state",
            phaseInput(
              baseState(cluster, database),
              "SCORING_COMMIT",
              "WORKERS",
              "before-resume",
            ),
          ),
          /PRODUCTION_WORKERS_PHASE_PRECONDITION_REQUIRED/,
        );

        const resumed = rpc(
          cluster,
          database,
          "resume_production_supabase_scoring",
          resumeInputV2(baseState(cluster, database), "exact"),
        );
        assert.equal(resumed.ingress, "OPEN");
        const workersPhase = rpc(
          cluster,
          database,
          "set_production_cutover_read_state",
          phaseInput(
            baseState(cluster, database),
            "SCORING_COMMIT",
            "WORKERS",
            "workers",
          ),
        );
        assert.equal(workersPhase.phase, "WORKERS");
        assertCommandFailure(
          () => rpc(
            cluster,
            database,
            "set_production_cutover_read_state",
            phaseInput(
              baseState(cluster, database),
              "WORKERS",
              "ODDS_WAR_ROOM",
              "before-certified-workers",
            ),
          ),
          /PRODUCTION_ODDS_WORKER_PRECONDITION_REQUIRED/,
        );

        for (const [workerName, label] of [
          ["SCORING_GOOGLE_OUTBOX", "outbox"],
          ["ROUND_SCORECARDS_ARCHIVE", "archive"],
        ]) {
          const enabled = rpc(
            cluster,
            database,
            "set_production_cutover_worker_state",
            workerInput(baseState(cluster, database), workerName, label),
          );
          assert.equal(enabled.enabled, true);
        }
        const oddsPhase = rpc(
          cluster,
          database,
          "set_production_cutover_read_state",
          phaseInput(
            baseState(cluster, database),
            "WORKERS",
            "ODDS_WAR_ROOM",
            "odds-war-room",
          ),
        );
        assert.equal(oddsPhase.phase, "ODDS_WAR_ROOM");

        const configured = rpc(
          cluster,
          database,
          "configure_production_odds_calculation_runtime",
          oddsRuntimeInput(baseState(cluster, database), false, 0, "enable"),
        );
        assert.equal(configured.enabled, true);
        assert.equal(configured.cutover_phase, "ODDS_WAR_ROOM");
        const observation = rpc(
          cluster,
          database,
          "set_production_cutover_read_state",
          phaseInput(
            baseState(cluster, database),
            "ODDS_WAR_ROOM",
            "OBSERVATION",
            "observation",
          ),
        );
        assert.equal(observation.phase, "OBSERVATION");

        const reboundOdds = rpc(
          cluster,
          database,
          "configure_production_odds_calculation_runtime",
          oddsRuntimeInput(baseState(cluster, database), true, 1, "observe"),
        );
        assert.equal(reboundOdds.runtime_revision, 2);
        psql(cluster, database, `
          select production_control.assert_production_odds_calculation_scope(
            ${jsonSql(oddsRuntimeInput(
              baseState(cluster, database),
              true,
              2,
              "scope",
            ))},
            true
          );
        `);
        const finalState = baseState(cluster, database);
        assert.equal(finalState.read_cutover_phase, "OBSERVATION");
        assert.equal(finalState.admission_deployment_id, newDeployment);
        assert.equal(finalState.authority, "SUPABASE");
        assert.equal(finalState.resource_workers, true);

        const providerBeforeApplicationRelease = psql(cluster, database, `
          select pg_catalog.pg_get_functiondef(
            'public.stage_production_cutover_release_provider_fence_v2(jsonb)'
              ::regprocedure
          );
        `);
        psqlFile(
          cluster,
          database,
          path.join(migrationsDirectory, precommitCapabilityGuardMigration),
        );
        assert.deepEqual(baseState(cluster, database), finalState);
        psqlFile(
          cluster,
          database,
          path.join(
            migrationsDirectory,
            postcutoverApplicationReleaseMigration,
          ),
        );
        assert.deepEqual(baseState(cluster, database), finalState);
        assert.equal(psql(cluster, database, `
          select pg_catalog.pg_get_functiondef(
            'public.stage_production_cutover_release_provider_fence_v2(jsonb)'
              ::regprocedure
          );
        `), providerBeforeApplicationRelease);

        psql(cluster, database, `
          select production_control
            .assert_production_maintenance_runtime_capability(
              ${jsonSql(capabilityScope())}, 'OBSERVATION'
            );
        `);

        const wrongTargetInput = postcutoverApplicationRebindInput(
          baseState(cluster, database),
          "wrong-target",
          { runtime_deployment_target: "PREVIEW" },
        );
        assertCommandFailure(
          () => rpc(
            cluster,
            database,
            "rebind_production_maintenance_precommit_deployment",
            wrongTargetInput,
          ),
          /PRODUCTION_POSTCUTOVER_APPLICATION_RELEASE_INPUT_INVALID/,
        );
        assert.deepEqual(baseState(cluster, database), finalState);

        const exactApplicationInput = postcutoverApplicationRebindInput(
          baseState(cluster, database),
          "exact",
        );
        const applicationRebound = rpc(
          cluster,
          database,
          "rebind_production_maintenance_precommit_deployment",
          exactApplicationInput,
        );
        assert.equal(
          applicationRebound.code,
          "PRODUCTION_POSTCUTOVER_APPLICATION_RELEASE_REBOUND",
        );
        assert.equal(applicationRebound.idempotent, false);
        assert.equal(applicationRebound.deployment_commit, postcutoverReleaseSha);
        assert.equal(applicationRebound.deployment_id, postcutoverDeployment);
        assert.equal(applicationRebound.cutover_phase, "OBSERVATION");
        assert.equal(applicationRebound.authority, "SUPABASE");
        assert.equal(
          applicationRebound.participant_identity_authority,
          "SUPABASE",
        );
        assert.equal(applicationRebound.maintenance_state, "NORMAL");
        assert.equal(applicationRebound.ingress, "OPEN");
        assert.equal(applicationRebound.workers_enabled, true);

        const applicationState = baseState(cluster, database);
        assert.equal(
          applicationState.activation_revision,
          finalState.activation_revision + 1,
        );
        assert.equal(
          applicationState.admission_revision,
          finalState.admission_revision + 1,
        );
        assert.equal(
          applicationState.expected_deployment_commit,
          postcutoverReleaseSha,
        );
        assert.equal(
          applicationState.admission_deployment_id,
          postcutoverDeployment,
        );
        for (const field of [
          "activation_state",
          "authority_generation_id",
          "authority",
          "boundary_mode",
          "read_cutover_phase",
          "maintenance_state",
          "activation_ingress",
          "first_write_possible_at",
          "first_write_observed_at",
          "resource_authority",
          "identity_authority",
          "read_authority",
          "resource_ingress",
          "resource_workers",
          "admission_state",
          "admission_generation_id",
          "execution_gate",
          "active_epoch_id",
          "active_closure_id",
        ]) {
          assert.deepEqual(
            applicationState[field],
            finalState[field],
            `${field} is invariant across the application release`,
          );
        }

        assert.equal(psql(cluster, database, `
          select deployment_id
          from production_control.scoring_admission_closures
          where closure_id = ${sqlLiteral(closureId)}::uuid;
        `), postcutoverDeployment);
        assert.equal(psql(cluster, database, `
          select deployment_commit
          from scoring_authority.authority_epochs
          where epoch_id = ${sqlLiteral(epochId)}::uuid;
        `), postcutoverReleaseSha);
        assert.equal(psql(cluster, database, `
          select pg_catalog.count(*)
          from production_control.worker_controls value
          where value.worker_name in (
            'SCORING_GOOGLE_OUTBOX', 'ROUND_SCORECARDS_ARCHIVE',
            'ODDS_CALCULATION'
          )
            and value.enabled
            and value.metadata->>'deployment_commit' =
              ${sqlLiteral(postcutoverReleaseSha)}
            and value.metadata->>'deployment_id' =
              ${sqlLiteral(postcutoverDeployment)};
        `), "3");
        assert.equal(psql(cluster, database, `
          select deployment_commit
          from production_control.odds_calculation_runtime
          where scope_key = 'BAGGER_INV_PRODUCTION' and enabled;
        `), postcutoverReleaseSha);
        assert.equal(psql(cluster, database, `
          select pg_catalog.count(*)
          from production_control.postcutover_application_release_rebindings
          where prior_deployment_id = ${sqlLiteral(newDeployment)}
            and prior_deployment_commit = ${sqlLiteral(releaseSha)}
            and deployment_id = ${sqlLiteral(postcutoverDeployment)}
            and deployment_commit = ${sqlLiteral(postcutoverReleaseSha)};
        `), "1");

        assertCommandFailure(
          () => psql(cluster, database, `
            select production_control
              .assert_production_maintenance_runtime_capability(
                ${jsonSql(capabilityScope())}, 'OBSERVATION'
              );
          `),
          /PRODUCTION_(?:POSTCUTOVER_APPLICATION_RELEASE_REQUIRED|EXACT_RELEASE_REQUIRED)/,
        );
        psql(cluster, database, `
          select production_control
            .assert_production_maintenance_runtime_capability(
              ${jsonSql(postcutoverCapabilityScope())}, 'OBSERVATION'
            );
        `);

        const replay = rpc(
          cluster,
          database,
          "rebind_production_maintenance_precommit_deployment",
          exactApplicationInput,
        );
        assert.equal(replay.idempotent, true);
        assert.equal(replay.application_rebind_id, applicationRebound.application_rebind_id);
        assert.deepEqual(baseState(cluster, database), applicationState);
        assert.equal(psql(cluster, database, `
          select pg_catalog.count(*)
          from production_control.postcutover_application_release_rebindings;
        `), "1");
      });
    } finally {
      await destroyCluster(cluster);
    }
  },
);

test(
  "migration 052 treats the certified OBSERVATION ceiling as dormant until the precommit binding",
  { timeout: 120_000 },
  async (t) => {
    if (!(await allBinariesAvailable())) {
      t.skip(`PostgreSQL 17 toolchain is unavailable at ${pgBin}`);
      return;
    }
    const cluster = await createCluster();
    const templateDatabase = "maintenance_precommit_guard_template";
    let cloneCounter = 0;
    const clone = (label) => {
      cloneCounter += 1;
      const database = `maintenance_precommit_guard_${cloneCounter}_${label}`;
      createDatabase(cluster, database, templateDatabase);
      return database;
    };
    try {
      createDatabase(cluster, templateDatabase);
      installSupabaseCompatibility(cluster, templateDatabase);
      await installThrough(
        cluster,
        templateDatabase,
        providerInventoryV4Migration,
      );
      installControlFixture(cluster, templateDatabase);
      await installThrough(
        cluster,
        templateDatabase,
        capabilityMigration,
        providerInventoryV3Migration,
      );

      const beforeMigration = baseState(cluster, templateDatabase);
      const providerBefore = psql(cluster, templateDatabase, `
        select pg_catalog.pg_get_functiondef(
          'public.stage_production_cutover_release_provider_fence_v2(jsonb)'
            ::regprocedure
        );
      `);
      psqlFile(
        cluster,
        templateDatabase,
        path.join(migrationsDirectory, precommitCapabilityGuardMigration),
      );
      assert.deepEqual(baseState(cluster, templateDatabase), beforeMigration);
      assert.equal(psql(cluster, templateDatabase, `
        select pg_catalog.pg_get_functiondef(
          'public.stage_production_cutover_release_provider_fence_v2(jsonb)'
            ::regprocedure
        );
      `), providerBefore);

      const beforeApplicationReleaseMigration = baseState(
        cluster,
        templateDatabase,
      );
      psqlFile(
        cluster,
        templateDatabase,
        path.join(migrationsDirectory, postcutoverApplicationReleaseMigration),
      );
      assert.deepEqual(
        baseState(cluster, templateDatabase),
        beforeApplicationReleaseMigration,
      );
      assert.equal(psql(cluster, templateDatabase, `
        select pg_catalog.pg_get_functiondef(
          'public.stage_production_cutover_release_provider_fence_v2(jsonb)'
            ::regprocedure
        );
      `), providerBefore);

      installPreparedFixture(cluster, templateDatabase);
      installOddsInputFixture(cluster, templateDatabase);

      await t.test(
        "CURRENT_READS accepts the exact dormant OBSERVATION capability metadata",
        () => {
          const database = clone("current_reads");
          configureCurrentReadsBeforeCapabilityBinding(cluster, database);
          const readScope = capabilityScope({
            read_contract: "ACTIVE_CUTOVER",
            cutover_phase: "OBSERVATION",
          });
          psql(cluster, database, `
            select production_control.assert_production_cutover_read_scope(
              ${jsonSql(readScope)}, 'CURRENT_READS'
            );
          `);
          assert.equal(
            psql(cluster, database, `
              select pg_catalog.count(*)
              from production_control
                .maintenance_deployment_capability_bindings;
            `),
            "0",
          );
          assert.equal(baseState(cluster, database).active_epoch_id, null);
          assert.equal(
            baseState(cluster, database).read_cutover_phase,
            "CURRENT_READS",
          );
        },
      );

      await t.test(
        "CURRENT_READS rejects a wrong advertised contract or ceiling",
        () => {
          const database = clone("wrong_metadata");
          configureCurrentReadsBeforeCapabilityBinding(cluster, database);
          const exact = capabilityScope({
            read_contract: "ACTIVE_CUTOVER",
            cutover_phase: "OBSERVATION",
          });
          assertCommandFailure(
            () => psql(cluster, database, `
              select production_control.assert_production_cutover_read_scope(
                ${jsonSql({
                  ...exact,
                  deployment_capability_contract:
                    "production-maintenance-single-deployment-capability-v0",
                })},
                'CURRENT_READS'
              );
            `),
            /PRODUCTION_MAINTENANCE_RUNTIME_CAPABILITY_REQUIRED/,
          );
          assertCommandFailure(
            () => psql(cluster, database, `
              select production_control.assert_production_cutover_read_scope(
                ${jsonSql({
                  ...exact,
                  deployment_capability_ceiling: "WORKERS",
                })},
                'CURRENT_READS'
              );
            `),
            /PRODUCTION_MAINTENANCE_RUNTIME_CAPABILITY_REQUIRED/,
          );
        },
      );

      await t.test(
        "SCORING_COMMIT still rejects an unbound maintenance deployment",
        () => {
          const database = clone("scoring_commit_unbound");
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "set_production_cutover_read_state",
              phaseInput(
                baseState(cluster, database),
                "SCORING_PREPARE",
                "SCORING_COMMIT",
                "migration-052-unbound",
              ),
            ),
            /PRODUCTION_MAINTENANCE_RUNTIME_CAPABILITY_REQUIRED/,
          );
          assert.equal(
            baseState(cluster, database).read_cutover_phase,
            "SCORING_PREPARE",
          );
        },
      );

      await t.test(
        "the exact post-bind deployment guard remains strict",
        () => {
          const database = clone("post_bind");
          rpc(
            cluster,
            database,
            "rebind_production_maintenance_precommit_deployment",
            rebindInputV2(baseState(cluster, database), "migration-052"),
          );
          const readScope = capabilityScope({
            read_contract: "ACTIVE_CUTOVER",
            cutover_phase: "OBSERVATION",
          });
          psql(cluster, database, `
            select production_control.assert_production_cutover_read_scope(
              ${jsonSql(readScope)}, 'CURRENT_READS'
            );
          `);
          assertCommandFailure(
            () => psql(cluster, database, `
              select production_control.assert_production_cutover_read_scope(
                ${jsonSql({ ...readScope, deployment_id: oldDeployment })},
                'CURRENT_READS'
              );
            `),
            /PRODUCTION_MAINTENANCE_RUNTIME_CAPABILITY_REQUIRED/,
          );
          assert.equal(
            baseState(cluster, database).read_cutover_phase,
            "SCORING_PREPARE",
          );
        },
      );

      await t.test("PROVIDER_FENCE_V2 read behavior is unchanged", () => {
        const database = clone("provider_fence");
        configureCurrentReadsBeforeCapabilityBinding(cluster, database, {
          boundaryMode: "PROVIDER_FENCE_V2",
        });
        const exact = capabilityScope({
          read_contract: "ACTIVE_CUTOVER",
          cutover_phase: "CURRENT_READS",
        });
        const {
          deployment_capability_contract: ignoredContract,
          deployment_capability_ceiling: ignoredCeiling,
          ...providerReadScope
        } = exact;
        assert.equal(ignoredContract.length > 0, true);
        assert.equal(ignoredCeiling, "OBSERVATION");
        psql(cluster, database, `
          select production_control.assert_production_cutover_read_scope(
            ${jsonSql(providerReadScope)}, 'CURRENT_READS'
          );
        `);
        assertCommandFailure(
          () => psql(cluster, database, `
            select production_control.assert_production_cutover_read_scope(
              ${jsonSql({ ...exact, cutover_phase: "OBSERVATION" })},
              'CURRENT_READS'
            );
          `),
          /PRODUCTION_MAINTENANCE_RUNTIME_CAPABILITY_REQUIRED/,
        );
      });
    } finally {
      await destroyCluster(cluster);
    }
  },
);
