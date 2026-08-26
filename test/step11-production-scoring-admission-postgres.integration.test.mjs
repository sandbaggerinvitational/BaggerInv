import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
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
const pgBin = "/opt/homebrew/opt/postgresql@17/bin";
const postgresBinaries = Object.fromEntries(
  ["createdb", "initdb", "pg_ctl", "psql"].map((name) => [
    name,
    path.join(pgBin, name),
  ]),
);

const scope = Object.freeze({
  environment: "PRODUCTION",
  project_ref: "ymqhhtxaywtqllynrmxe",
  project_url: "https://ymqhhtxaywtqllynrmxe.supabase.co",
  source_workbook_id: "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4",
  tournament_id: "2026",
});
const actor = "postgres-admission-integration-test";
const deploymentCommit = "1234567890abcdef1234567890abcdef12345678";
const deploymentId = "dpl_PostgresAdmission034";
const sourceFingerprint = fingerprint("staged-source-boundary");
const advisoryLockKey = 731102026032n;

function fingerprint(label) {
  return createHash("sha256").update(label).digest("hex");
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function jsonSql(value) {
  return `${sqlLiteral(JSON.stringify(value))}::jsonb`;
}

function rpcSql(name, input) {
  assert.match(name, /^[a-z][a-z0-9_]+$/);
  return `select public.${name}(${jsonSql(input)})::text;`;
}

class CommandFailure extends Error {
  constructor(command, result) {
    const stdout = result.stdout || "";
    const stderr = result.stderr || "";
    super(
      [
        `Command failed (${result.status ?? "spawn error"}): ${command}`,
        stdout.trim(),
        stderr.trim(),
      ].filter(Boolean).join("\n"),
    );
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
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0) {
    throw new CommandFailure([command, ...args].join(" "), result);
  }
  return result.stdout;
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

function psqlFile(cluster, database, filename) {
  return runCommand(
    postgresBinaries.psql,
    [
      "-X",
      "-q",
      "-v",
      "ON_ERROR_STOP=1",
      "-d",
      database,
      "-f",
      filename,
    ],
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
  return parseJsonOutput(psql(cluster, database, rpcSql(name, input)));
}

function assertCommandFailure(action, expected) {
  assert.throws(
    action,
    (error) => error instanceof CommandFailure && expected.test(error.message),
  );
}

function spawnPsql(cluster, database, sql) {
  const child = spawn(
    postgresBinaries.psql,
    ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", database, "-c", sql],
    {
      cwd: repositoryRoot,
      env: psqlEnvironment(cluster),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  let stdout = "";
  let stderr = "";
  const waiters = [];
  const notifyWaiters = () => {
    for (const waiter of waiters) {
      if (!waiter.done && stdout.includes(waiter.marker)) {
        waiter.done = true;
        waiter.resolve();
      }
    }
  };
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    notifyWaiters();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const done = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (status) => {
      if (status === 0) {
        resolve({ stdout, stderr, status });
        return;
      }
      reject(new CommandFailure("concurrent psql session", {
        status,
        stdout,
        stderr,
      }));
    });
  });
  return {
    child,
    done,
    snapshot() {
      return { stdout, stderr };
    },
    waitFor(marker, timeoutMilliseconds = 5_000) {
      if (stdout.includes(marker)) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const waiter = { marker, resolve, done: false };
        waiters.push(waiter);
        const timeout = setTimeout(() => {
          if (waiter.done) return;
          waiter.done = true;
          reject(new Error(
            `Timed out waiting for ${marker}; stdout=${stdout}; stderr=${stderr}`,
          ));
        }, timeoutMilliseconds);
        const originalResolve = waiter.resolve;
        waiter.resolve = () => {
          clearTimeout(timeout);
          originalResolve();
        };
      });
    },
  };
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForAdvisoryLocks(
  cluster,
  database,
  { mode, granted, minimum = 1, timeoutMilliseconds = 5_000 },
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMilliseconds) {
    const count = Number(psql(cluster, database, `
      select count(*)
      from pg_catalog.pg_locks
      where locktype = 'advisory'
        and mode = ${sqlLiteral(mode)}
        and granted is ${granted ? "true" : "false"};
    `));
    if (count >= minimum) return count;
    await delay(10);
  }
  throw new Error(
    `Timed out waiting for ${minimum} ${granted ? "granted" : "waiting"} ${mode} advisory locks`,
  );
}

async function createCluster() {
  const clusterRoot = await mkdtemp(path.join(os.tmpdir(), "bagger-pg17-"));
  const dataDirectory = path.join(clusterRoot, "data");
  const socketDirectory = path.join(clusterRoot, "socket");
  const logFile = path.join(clusterRoot, "postgres.log");
  const port = 5432;
  await mkdir(socketDirectory, { mode: 0o700 });
  runCommand(postgresBinaries.initdb, [
    "-D",
    dataDirectory,
    "--username=postgres",
    "--auth=trust",
    "--no-locale",
    "--encoding=UTF8",
  ]);
  runCommand(postgresBinaries.pg_ctl, [
    "-D",
    dataDirectory,
    "-l",
    logFile,
    "-o",
    `-F -k ${socketDirectory} -h '' -p ${port}`,
    "-w",
    "start",
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
        "-D",
        cluster.dataDirectory,
        "-m",
        "fast",
        "-w",
        "stop",
      ]);
    } finally {
      cluster.started = false;
    }
  }
  const expectedParent = path.resolve(os.tmpdir());
  assert.equal(path.dirname(cluster.clusterRoot), expectedParent);
  assert.match(path.basename(cluster.clusterRoot), /^bagger-pg17-/);
  await rm(cluster.clusterRoot, { recursive: true, force: true });
}

async function installProductionMigrations(cluster, database) {
  const migrationNames = (await readdir(migrationsDirectory))
    .filter((name) => /^\d+_.*\.sql$/.test(name))
    .sort();
  const admissionMigration =
    "202608260034_production_scoring_admission_fence_v2.sql";
  const endIndex = migrationNames.indexOf(admissionMigration);
  assert.notEqual(endIndex, -1, `Missing ${admissionMigration}`);
  for (const migrationName of migrationNames.slice(0, endIndex + 1)) {
    psqlFile(cluster, database, path.join(migrationsDirectory, migrationName));
  }
}

function createDatabase(cluster, database, template) {
  const args = template
    ? ["--template", template, database]
    : [database];
  runCommand(postgresBinaries.createdb, args, {
    env: psqlEnvironment(cluster, { PGOPTIONS: "" }),
  });
}

function installSupabaseCompatibility(cluster, database) {
  psql(cluster, database, `
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

function installScoringFixture(cluster, database) {
  psql(cluster, database, `
    insert into scoring_authority.tournaments (
      tournament_id, tournament_year, name, source_workbook_id,
      scoring_authority
    ) values (
      '2026', 2026, 'PostgreSQL admission test tournament',
      ${sqlLiteral(scope.source_workbook_id)}, 'GOOGLE'
    );

    insert into scoring_authority.rounds (
      tournament_id, round_number, format, name, status
    ) values ('2026', 1, 'BB', 'Round 1', 'UPCOMING');

    insert into scoring_authority.scoring_snapshots (
      snapshot_id, tournament_id, match_id, snapshot_revision,
      scoring_rules_version, format, course_id, tee, par,
      match_netting_baseline, hole_definitions,
      participant_configuration, team_configuration, canonical_hash
    )
    select
      'snapshot-2026-r1-m1', '2026', '2026-R1-1', 1,
      'postgres-test-v1', 'BB', 'course-1', 'Member', 72,
      'LOW_BALL',
      jsonb_agg(jsonb_build_object(
        'hole_number', hole_number,
        'par', 4,
        'stroke_index', hole_number
      ) order by hole_number),
      '{}'::jsonb, '{}'::jsonb, ${sqlLiteral(fingerprint("snapshot"))}
    from generate_series(1, 18) as hole_number;

    insert into scoring_authority.matches (
      match_id, tournament_id, round_number, format,
      scoring_snapshot_id, status
    ) values (
      '2026-R1-1', '2026', 1, 'BB', 'snapshot-2026-r1-m1', 'LIVE'
    );

    insert into scoring_authority.google_match_checkpoints (
      match_id, last_supabase_match_revision, google_match_revision,
      google_hole_revisions, verified_fingerprint, verified_at
    ) values (
      '2026-R1-1', 0, 0, '{}'::jsonb,
      ${sqlLiteral(fingerprint("google-checkpoint"))}, now()
    );

    insert into scoring_authority.ingress_gates (
      tournament_id, state, authority, active_epoch_id,
      unresolved_client_queues, updated_by
    ) values ('2026', 'PAUSED', 'GOOGLE', null, 0, ${sqlLiteral(actor)});
  `);
}

function state(cluster, database) {
  return parseJsonOutput(psql(cluster, database, `
    select jsonb_build_object(
      'activation_state', activation.state,
      'activation_revision', activation.activation_revision,
      'authority_generation_id', activation.authority_generation_id,
      'authority', activation.current_authority,
      'scoring_ingress_enabled', activation.scoring_ingress_enabled,
      'expected_source_fingerprint', activation.expected_source_fingerprint,
      'admission_state', gate.admission_state,
      'admission_revision', gate.admission_revision,
      'admission_generation_id', gate.admission_generation_id,
      'admission_deployment_id', gate.admission_deployment_id,
      'execution_gate', gate.state,
      'active_closure_id', gate.active_closure_id,
      'external_fence_evidence_id', gate.external_fence_evidence_id
    )
    from production_control.cutover_activation_state activation
    cross join scoring_authority.ingress_gates gate
    where activation.scope_key = 'BAGGER_INV_PRODUCTION'
      and gate.tournament_id = '2026';
  `));
}

function optimisticInput(current, label) {
  return {
    ...scope,
    deployment_id: deploymentId,
    deployment_commit: deploymentCommit,
    expected_activation_revision: Number(current.activation_revision),
    expected_authority_generation: current.authority_generation_id,
    expected_admission_generation: current.admission_generation_id,
    expected_admission_revision: Number(current.admission_revision),
    actor_id: actor,
    request_fingerprint: fingerprint(label),
  };
}

function closeInput(current, evidenceId, label) {
  return {
    ...optimisticInput(current, label),
    expected_authority: current.authority,
    external_fence_evidence_id: evidenceId,
    start_source_fingerprint: current.expected_source_fingerprint,
  };
}

function beginInput(
  current,
  label,
  leaseNonce = randomUUID(),
  operationRequestId = randomUUID(),
) {
  return {
    ...optimisticInput(current, label),
    expected_authority: "GOOGLE",
    writer_intent: "CANONICAL_LEGACY",
    match_id: "2026-R1-1",
    operation: "WRITE_HOLE_SCORE",
    operation_request_id: operationRequestId,
    lease_nonce: leaseNonce,
    lease_seconds: 180,
  };
}

function closureInput(current, evidenceId, closureId, label) {
  return {
    ...optimisticInput(current, label),
    closure_id: closureId,
    external_fence_evidence_id: evidenceId,
  };
}

function recordFenceEvidence(cluster, database, current, label) {
  const legacy = parseJsonOutput(psql(cluster, database, `
    select jsonb_build_object(
      'fingerprint', production_control.scoring_admission_legacy_set_fingerprint(),
      'count', count(*)::integer
    )
    from scoring_authority.scoring_ingress_leases
    where tournament_id = '2026' and protocol_version = 'LEGACY_V1';
  `));
  const evidence = rpc(
    cluster,
    database,
    "record_production_scoring_external_fence_evidence",
    {
      ...optimisticInput(current, `${label}-request`),
      operation: "RECORD_PRODUCTION_SCORING_EXTERNAL_FENCE_EVIDENCE",
      provider_evidence_fingerprint: fingerprint(`${label}-provider`),
      deployment_scope_fingerprint: fingerprint(`${label}-deployment-scope`),
      google_credential_scope_fingerprint: fingerprint(`${label}-credentials`),
      writer_coverage_fingerprint: fingerprint(`${label}-writer-coverage`),
      legacy_lease_set_fingerprint: legacy.fingerprint,
      legacy_lease_count: Number(legacy.count),
      legacy_deployments_fenced: true,
      google_credentials_fenced: true,
      manual_google_scoring_fenced: true,
      captured_at: new Date().toISOString(),
    },
  );
  assert.equal(
    evidence.code,
    "PRODUCTION_SCORING_EXTERNAL_FENCE_EVIDENCE_RECORDED",
  );
  return evidence;
}

function refreshFenceEvidence(
  cluster,
  database,
  current,
  closureId,
  priorEvidenceId,
  label,
) {
  const proof = parseJsonOutput(psql(cluster, database, `
    select jsonb_build_object(
      'provider_evidence_fingerprint', evidence.provider_evidence_fingerprint,
      'deployment_scope_fingerprint', evidence.deployment_scope_fingerprint,
      'google_credential_scope_fingerprint',
        evidence.google_credential_scope_fingerprint,
      'writer_coverage_fingerprint', evidence.writer_coverage_fingerprint,
      'legacy_lease_set_fingerprint',
        production_control.scoring_admission_legacy_set_fingerprint(),
      'legacy_lease_count', (
        select count(*)::integer
        from scoring_authority.scoring_ingress_leases lease
        where lease.tournament_id = '2026'
          and lease.protocol_version = 'LEGACY_V1'
      )
    )
    from production_control.scoring_external_fence_evidence evidence
    where evidence.evidence_id = ${sqlLiteral(priorEvidenceId)}::uuid;
  `));
  return rpc(
    cluster,
    database,
    "refresh_production_scoring_external_fence_evidence",
    {
      ...optimisticInput(current, `${label}-request`),
      operation: "REFRESH_PRODUCTION_SCORING_EXTERNAL_FENCE_EVIDENCE",
      prior_external_fence_evidence_id: priorEvidenceId,
      closure_id: closureId,
      ...proof,
      legacy_deployments_fenced: true,
      google_credentials_fenced: true,
      manual_google_scoring_fenced: true,
      captured_at: new Date().toISOString(),
    },
  );
}

function stageAndArm(cluster, database) {
  const beforeStage = state(cluster, database);
  const stage = rpc(cluster, database, "stage_production_cutover_release", {
    ...scope,
    actor_id: actor,
    contract_version: "production-cutover-activation-v1",
    vercel_project: "bagger-inv",
    canonical_domain: "https://baggerinv.com",
    tournament_year: 2026,
    vercel_project_id: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
    deployment_commit: deploymentCommit,
    source_fingerprint: sourceFingerprint,
    expected_activation_revision: Number(beforeStage.activation_revision),
    request_fingerprint: fingerprint("stage-release"),
  });
  assert.equal(stage.code, "PRODUCTION_RELEASE_STAGED");

  const staged = state(cluster, database);
  const evidence = recordFenceEvidence(
    cluster,
    database,
    staged,
    "external-fence-evidence",
  );

  const arm = rpc(
    cluster,
    database,
    "arm_production_google_ingress_lease_gate",
    {
      ...optimisticInput(staged, "arm-google-admission"),
      external_fence_evidence_id: evidence.evidence_id,
    },
  );
  assert.equal(arm.code, "PRODUCTION_GOOGLE_LEASE_GATE_V2_ARMED");
  const armed = state(cluster, database);
  assert.equal(armed.activation_state, "GOOGLE_LEASE_ARMED");
  assert.equal(armed.admission_state, "OPEN");
  assert.equal(armed.execution_gate, "OPEN");
  return { armed, evidenceId: evidence.evidence_id };
}

function finalBoundary(cluster, database) {
  return parseJsonOutput(psql(cluster, database, `
    select jsonb_build_object(
      'supabase_match_revisions',
        production_control.current_match_revisions('2026'),
      'google_checkpoints',
        production_control.current_google_checkpoints('2026'),
      'boundary_captured_at', clock_timestamp()
    );
  `));
}

function finalizationInput(
  current,
  evidenceId,
  closureId,
  drained,
  boundary,
  label,
) {
  return {
    ...closureInput(current, evidenceId, closureId, label),
    final_source_fingerprint: fingerprint(`${label}-final-source`),
    reconciliation_fingerprint: fingerprint(`${label}-reconciliation`),
    lease_set_fingerprint: drained.lease_set_fingerprint,
    supabase_match_revisions: boundary.supabase_match_revisions,
    google_checkpoints: boundary.google_checkpoints,
    boundary_captured_at: boundary.boundary_captured_at,
  };
}

function closeDrainFinalize(cluster, database, evidenceId, label) {
  const beforeClose = state(cluster, database);
  const close = rpc(
    cluster,
    database,
    "close_production_scoring_admission",
    closeInput(beforeClose, evidenceId, `${label}-close`),
  );
  const afterClose = state(cluster, database);
  const drained = rpc(
    cluster,
    database,
    "drain_production_scoring_admission",
    closureInput(
      afterClose,
      evidenceId,
      close.closure_id,
      `${label}-drain`,
    ),
  );
  assert.equal(drained.ready_to_finalize, true);
  const afterDrain = state(cluster, database);
  const boundary = finalBoundary(cluster, database);
  const finalized = rpc(
    cluster,
    database,
    "finalize_production_scoring_admission",
    finalizationInput(
      afterDrain,
      evidenceId,
      close.closure_id,
      drained,
      boundary,
      `${label}-finalize`,
    ),
  );
  assert.equal(finalized.admission_state, "CLOSED");
  return {
    close,
    drained,
    boundary,
    finalized,
    current: state(cluster, database),
  };
}

function drainFinalizeExistingClose(
  cluster,
  database,
  evidenceId,
  close,
  label,
) {
  const afterClose = state(cluster, database);
  const drained = rpc(
    cluster,
    database,
    "drain_production_scoring_admission",
    closureInput(
      afterClose,
      evidenceId,
      close.closure_id,
      `${label}-drain`,
    ),
  );
  assert.equal(drained.ready_to_finalize, true);
  const afterDrain = state(cluster, database);
  const boundary = finalBoundary(cluster, database);
  const finalized = rpc(
    cluster,
    database,
    "finalize_production_scoring_admission",
    finalizationInput(
      afterDrain,
      evidenceId,
      close.closure_id,
      drained,
      boundary,
      `${label}-finalize`,
    ),
  );
  assert.equal(finalized.admission_state, "CLOSED");
  return {
    close,
    drained,
    boundary,
    finalized,
    current: state(cluster, database),
  };
}

function prepareEpochInput(current, evidenceId, closed, epochType, label) {
  return {
    ...closureInput(
      current,
      evidenceId,
      closed.close.closure_id,
      `${label}-prepare`,
    ),
    epoch_type: epochType,
    source_fingerprint: closed.finalized.final_source_fingerprint,
    reconciliation_fingerprint: closed.finalized.reconciliation_fingerprint,
    closure_boundary_fingerprint: closed.finalized.lease_set_fingerprint,
    supabase_match_revisions: closed.boundary.supabase_match_revisions,
    google_checkpoints: closed.boundary.google_checkpoints,
    expected_prior_source_fingerprint: current.expected_source_fingerprint,
    reason: `${epochType.toLowerCase()} PostgreSQL integration boundary`,
  };
}

function commitEpochInput(current, evidenceId, closed, epochId, label) {
  return {
    ...closureInput(
      current,
      evidenceId,
      closed.close.closure_id,
      `${label}-commit`,
    ),
    epoch_id: epochId,
    reconciliation_fingerprint: closed.finalized.reconciliation_fingerprint,
  };
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

test(
  "production scoring admission v2 serializes real PostgreSQL 17 sessions",
  { timeout: 120_000 },
  async (t) => {
    if (!(await allBinariesAvailable())) {
      t.skip(`PostgreSQL 17 toolchain is unavailable at ${pgBin}`);
      return;
    }

    const cluster = await createCluster();
    let databaseCounter = 0;
    const baselineDatabase = "admission_034_baseline";
    const cloneDatabase = (label) => {
      databaseCounter += 1;
      const database = `admission_034_${databaseCounter}_${label}`;
      createDatabase(cluster, database, baselineDatabase);
      return database;
    };

    try {
      createDatabase(cluster, baselineDatabase);
      installSupabaseCompatibility(cluster, baselineDatabase);
      await installProductionMigrations(cluster, baselineDatabase);
      installScoringFixture(cluster, baselineDatabase);
      const baseline = stageAndArm(cluster, baselineDatabase);

      await t.test("begin linearizes before a waiting close", async () => {
        const database = cloneDatabase("begin_before_close");
        const current = state(cluster, database);
        const nonce = randomUUID();
        const begin = beginInput(current, "begin-before-close", nonce);
        const close = closeInput(
          current,
          baseline.evidenceId,
          "close-after-begin",
        );
        const beginSession = spawnPsql(cluster, database, `
          begin;
          select pg_advisory_xact_lock_shared(${advisoryLockKey});
          select pg_sleep(0.50);
          ${rpcSql("begin_production_scoring_ingress_v2", begin)}
          commit;
        `);
        await waitForAdvisoryLocks(cluster, database, {
          mode: "ShareLock",
          granted: true,
        });

        const closeSession = spawnPsql(
          cluster,
          database,
          rpcSql("close_production_scoring_admission", close),
        );
        await waitForAdvisoryLocks(cluster, database, {
          mode: "ExclusiveLock",
          granted: false,
        });

        const beginResult = parseJsonOutput((await beginSession.done).stdout);
        const closeResult = parseJsonOutput((await closeSession.done).stdout);
        assert.equal(beginResult.resolution_state, "ADMITTED");
        assert.equal(closeResult.admission_state, "CLOSING");
        assert.equal(Number(closeResult.lease_high_watermark), 1);
        assert.equal(Number(closeResult.active_or_unresolved_leases), 1);
      });

      await t.test("a close linearizes before a waiting begin", async () => {
        const database = cloneDatabase("close_before_begin");
        const current = state(cluster, database);
        const close = closeInput(
          current,
          baseline.evidenceId,
          "close-before-begin",
        );
        const begin = beginInput(current, "begin-after-close");
        const closeSession = spawnPsql(cluster, database, `
          begin;
          select pg_advisory_xact_lock(${advisoryLockKey});
          ${rpcSql("close_production_scoring_admission", close)}
          select pg_sleep(0.50);
          commit;
        `);
        await waitForAdvisoryLocks(cluster, database, {
          mode: "ExclusiveLock",
          granted: true,
        });

        const beginSession = spawnPsql(
          cluster,
          database,
          rpcSql("begin_production_scoring_ingress_v2", begin),
        );
        const beginDone = beginSession.done.then(
          (result) => ({ ok: true, result }),
          (error) => ({ ok: false, error }),
        );
        await waitForAdvisoryLocks(cluster, database, {
          mode: "ShareLock",
          granted: false,
        });

        const closeResult = parseJsonOutput((await closeSession.done).stdout);
        assert.equal(closeResult.admission_state, "CLOSING");
        const beginAfterClose = await beginDone;
        assert.equal(beginAfterClose.ok, false);
        assert.match(
          beginAfterClose.error.message,
          /PRODUCTION_SCORING_ADMISSION_V2_BOUNDARY_MISMATCH/,
        );
      });

      await t.test("a lost close response is recovered idempotently", () => {
        const database = cloneDatabase("lost_close");
        const current = state(cluster, database);
        const close = closeInput(
          current,
          baseline.evidenceId,
          "lost-close-response",
        );
        rpc(cluster, database, "close_production_scoring_admission", close);
        const recovered = rpc(
          cluster,
          database,
          "close_production_scoring_admission",
          close,
        );
        assert.equal(recovered.idempotent, true);
        assert.equal(
          psql(
            cluster,
            database,
            "select count(*) from production_control.scoring_admission_closures;",
          ),
          "1",
        );
        assertCommandFailure(
          () => rpc(
            cluster,
            database,
            "close_production_scoring_admission",
            { ...close, actor_id: `${actor}-changed` },
          ),
          /PRODUCTION_IDEMPOTENCY_CONFLICT/,
        );
      });

      await t.test(
        "an expired bound provider fence can be refreshed without reopening admission",
        () => {
          const database = cloneDatabase("expired_fence_refresh");
          const beforeClose = state(cluster, database);
          const close = rpc(
            cluster,
            database,
            "close_production_scoring_admission",
            closeInput(
              beforeClose,
              baseline.evidenceId,
              "close-before-fence-expiry",
            ),
          );
          psql(cluster, database, `
            update production_control.scoring_external_fence_evidence
            set captured_at = now() - interval '31 minutes',
                expires_at = now() - interval '1 minute'
            where evidence_id = ${sqlLiteral(baseline.evidenceId)}::uuid;
          `);
          const expiredState = state(cluster, database);
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "reopen_production_scoring_admission",
              closureInput(
                expiredState,
                baseline.evidenceId,
                close.closure_id,
                "reopen-with-expired-fence",
              ),
            ),
            /PRODUCTION_EXTERNAL_SCORING_FENCE_EVIDENCE_REQUIRED/,
          );
          const refreshed = refreshFenceEvidence(
            cluster,
            database,
            expiredState,
            close.closure_id,
            baseline.evidenceId,
            "refresh-expired-fence",
          );
          assert.equal(
            refreshed.code,
            "PRODUCTION_SCORING_EXTERNAL_FENCE_EVIDENCE_REFRESHED",
          );
          assert.notEqual(refreshed.evidence_id, baseline.evidenceId);
          const afterRefresh = state(cluster, database);
          assert.equal(afterRefresh.admission_state, "CLOSING");
          assert.equal(afterRefresh.execution_gate, "PAUSED");
          assert.equal(
            afterRefresh.external_fence_evidence_id,
            refreshed.evidence_id,
          );
          const reopened = rpc(
            cluster,
            database,
            "reopen_production_scoring_admission",
            closureInput(
              afterRefresh,
              refreshed.evidence_id,
              close.closure_id,
              "reopen-after-fence-refresh",
            ),
          );
          assert.equal(reopened.admission_state, "OPEN");
          assert.equal(reopened.execution_gate, "OPEN");
        },
      );

      await t.test(
        "a lost BEGIN response reuses one durable operation and rotates only its capability",
        () => {
          const database = cloneDatabase("lost_begin");
          const current = state(cluster, database);
          const operationRequestId = randomUUID();
          const firstNonce = randomUUID();
          const retryNonce = randomUUID();
          const admitted = rpc(
            cluster,
            database,
            "begin_production_scoring_ingress_v2",
            beginInput(
              current,
              "lost-begin-first-request",
              firstNonce,
              operationRequestId,
            ),
          );
          const recovered = rpc(
            cluster,
            database,
            "begin_production_scoring_ingress_v2",
            beginInput(
              current,
              "lost-begin-retry-request",
              retryNonce,
              operationRequestId,
            ),
          );
          assert.equal(recovered.lease_id, admitted.lease_id);
          assert.equal(recovered.operation_request_id, operationRequestId);
          assert.equal(recovered.idempotent, true);
          assert.equal(recovered.lease_nonce_rotated, true);
          assert.equal(recovered.replay_usable, true);
          assert.equal(
            psql(
              cluster,
              database,
              `select count(*) from scoring_authority.scoring_ingress_leases
               where operation_request_id = ${sqlLiteral(operationRequestId)}::uuid;`,
            ),
            "1",
          );
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "mark_production_scoring_ingress_write_started",
              {
                ...optimisticInput(current, "lost-begin-old-nonce"),
                lease_id: admitted.lease_id,
                lease_nonce: firstNonce,
              },
            ),
            /PRODUCTION_SCORING_LEASE_NONCE_INVALID/,
          );
          const started = rpc(
            cluster,
            database,
            "mark_production_scoring_ingress_write_started",
            {
              ...optimisticInput(current, "lost-begin-new-nonce"),
              lease_id: admitted.lease_id,
              lease_nonce: retryNonce,
            },
          );
          assert.equal(started.resolution_state, "WRITE_STARTED");
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "begin_production_scoring_ingress_v2",
              {
                ...beginInput(
                  current,
                  "lost-begin-conflicting-payload",
                  randomUUID(),
                  operationRequestId,
                ),
                operation: "FINALIZE_MATCH",
              },
            ),
            /PRODUCTION_SCORING_INGRESS_V2_IDEMPOTENCY_CONFLICT/,
          );
        },
      );

      await t.test("atomic admission overhead is operationally bounded", (benchmark) => {
        const database = cloneDatabase("admission_latency");
        const current = state(cluster, database);
        const input = beginInput(
          current,
          "admission-latency-probe",
          randomUUID(),
          randomUUID(),
        );
        const explain = JSON.parse(psql(
          cluster,
          database,
          `explain (analyze, format json) ${rpcSql("begin_production_scoring_ingress_v2", input)}`,
        ));
        const databaseExecutionMs = Number(explain?.[0]?.["Execution Time"]);
        const roundTripStartedAt = performance.now();
        const replay = rpc(
          cluster,
          database,
          "begin_production_scoring_ingress_v2",
          input,
        );
        const localRoundTripMs = performance.now() - roundTripStartedAt;
        assert.equal(replay.idempotent, true);
        assert.ok(Number.isFinite(databaseExecutionMs) && databaseExecutionMs >= 0);
        assert.ok(databaseExecutionMs < 250, `Admission RPC took ${databaseExecutionMs} ms in isolated PostgreSQL.`);
        benchmark.diagnostic(
          `isolated admission RPC: ${databaseExecutionMs.toFixed(3)} ms database execution; ` +
          `${localRoundTripMs.toFixed(3)} ms local psql process/connection round trip`,
        );
      });

      await t.test(
        "an admitted lost BEGIN is recoverable after close while new operations stay denied",
        () => {
          const database = cloneDatabase("lost_begin_across_close");
          const original = state(cluster, database);
          const operationRequestId = randomUUID();
          const firstNonce = randomUUID();
          const retryNonce = randomUUID();
          const admitted = rpc(
            cluster,
            database,
            "begin_production_scoring_ingress_v2",
            beginInput(
              original,
              "lost-begin-before-close",
              firstNonce,
              operationRequestId,
            ),
          );
          const close = rpc(
            cluster,
            database,
            "close_production_scoring_admission",
            closeInput(
              original,
              baseline.evidenceId,
              "close-after-lost-begin",
            ),
          );
          const recovered = rpc(
            cluster,
            database,
            "begin_production_scoring_ingress_v2",
            beginInput(
              original,
              "recover-lost-begin-after-close",
              retryNonce,
              operationRequestId,
            ),
          );
          assert.equal(recovered.lease_id, admitted.lease_id);
          assert.equal(recovered.idempotent, true);
          assert.equal(recovered.replay_usable, true);
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "begin_production_scoring_ingress_v2",
              beginInput(original, "new-begin-after-close"),
            ),
            /PRODUCTION_SCORING_ADMISSION_V2_BOUNDARY_MISMATCH/,
          );

          const outcomeEvidence = psql(cluster, database, `
            select production_control.scoring_lease_outcome_evidence_hash(
              lease_id, request_fingerprint, 'PROVEN_NO_WRITE',
              null, null, null, null,
              authority_generation_id, admission_generation_id,
              admission_revision
            )
            from scoring_authority.scoring_ingress_leases
            where lease_id = ${sqlLiteral(admitted.lease_id)}::uuid;
          `);
          const reported = rpc(
            cluster,
            database,
            "report_production_scoring_ingress_outcome",
            {
              ...optimisticInput(original, "report-lost-begin-no-write"),
              lease_id: admitted.lease_id,
              lease_nonce: retryNonce,
              outcome_state: "PROVEN_NO_WRITE",
              outcome_evidence_fingerprint: outcomeEvidence,
            },
          );
          assert.equal(reported.resolution_state, "PROVEN_NO_WRITE");
          const afterReport = state(cluster, database);
          const drained = rpc(
            cluster,
            database,
            "drain_production_scoring_admission",
            closureInput(
              afterReport,
              baseline.evidenceId,
              close.closure_id,
              "drain-recovered-lost-begin",
            ),
          );
          assert.equal(drained.ready_to_finalize, true);
          assert.equal(Number(drained.active_or_unresolved_leases), 0);
        },
      );

      await t.test("expired leases become durable ambiguity blockers", () => {
        const database = cloneDatabase("expired_blockers");
        const current = state(cluster, database);
        const admittedNonce = randomUUID();
        const startedNonce = randomUUID();
        const admitted = rpc(
          cluster,
          database,
          "begin_production_scoring_ingress_v2",
          beginInput(current, "expired-admitted", admittedNonce),
        );
        const started = rpc(
          cluster,
          database,
          "begin_production_scoring_ingress_v2",
          beginInput(current, "expired-write-started", startedNonce),
        );
        rpc(
          cluster,
          database,
          "mark_production_scoring_ingress_write_started",
          {
            ...optimisticInput(current, "mark-expired-write-started"),
            lease_id: started.lease_id,
            lease_nonce: startedNonce,
          },
        );
        psql(cluster, database, `
          update scoring_authority.scoring_ingress_leases
          set expires_at = now() - interval '1 second'
          where lease_id in (
            ${sqlLiteral(admitted.lease_id)}::uuid,
            ${sqlLiteral(started.lease_id)}::uuid
          );
        `);

        const close = rpc(
          cluster,
          database,
          "close_production_scoring_admission",
          closeInput(current, baseline.evidenceId, "close-expired-leases"),
        );
        const afterClose = state(cluster, database);
        const drained = rpc(
          cluster,
          database,
          "drain_production_scoring_admission",
          closureInput(
            afterClose,
            baseline.evidenceId,
            close.closure_id,
            "drain-expired-leases",
          ),
        );
        assert.equal(Number(drained.expired_became_ambiguous), 2);
        assert.equal(Number(drained.active_or_unresolved_leases), 2);
        assert.equal(drained.ready_to_finalize, false);
        assert.deepEqual(
          parseJsonOutput(psql(cluster, database, `
            select jsonb_agg(
              jsonb_build_object(
                'resolution_state', resolution_state,
                'last_error_code', last_error_code
              ) order by last_error_code
            )
            from scoring_authority.scoring_ingress_leases
            where lease_id in (
              ${sqlLiteral(admitted.lease_id)}::uuid,
              ${sqlLiteral(started.lease_id)}::uuid
            );
          `)),
          [
            {
              resolution_state: "AMBIGUOUS",
              last_error_code: "LEASE_EXPIRED_AFTER_WRITE_START",
            },
            {
              resolution_state: "AMBIGUOUS",
              last_error_code: "LEASE_EXPIRED_WITHOUT_WRITE_START_PROOF",
            },
          ],
        );

        const afterDrain = state(cluster, database);
        const boundary = finalBoundary(cluster, database);
        assertCommandFailure(
          () => rpc(
            cluster,
            database,
            "finalize_production_scoring_admission",
            finalizationInput(
              afterDrain,
              baseline.evidenceId,
              close.closure_id,
              drained,
              boundary,
              "finalize-with-ambiguity",
            ),
          ),
          /PRODUCTION_SCORING_ADMISSION_FINAL_BOUNDARY_CHANGED/,
        );
      });

      await t.test("finalization binds the exact drained fingerprint boundary", () => {
        const database = cloneDatabase("final_boundary");
        const beforeClose = state(cluster, database);
        const close = rpc(
          cluster,
          database,
          "close_production_scoring_admission",
          closeInput(beforeClose, baseline.evidenceId, "close-final-boundary"),
        );
        const afterClose = state(cluster, database);
        const drained = rpc(
          cluster,
          database,
          "drain_production_scoring_admission",
          closureInput(
            afterClose,
            baseline.evidenceId,
            close.closure_id,
            "drain-final-boundary",
          ),
        );
        assert.equal(drained.ready_to_finalize, true);
        const afterDrain = state(cluster, database);
        const boundary = finalBoundary(cluster, database);
        const finalize = finalizationInput(
          afterDrain,
          baseline.evidenceId,
          close.closure_id,
          drained,
          boundary,
          "finalize-boundary",
        );
        assertCommandFailure(
          () => rpc(
            cluster,
            database,
            "finalize_production_scoring_admission",
            {
              ...finalize,
              request_fingerprint: fingerprint("wrong-final-boundary-request"),
              lease_set_fingerprint: fingerprint("wrong-lease-set"),
            },
          ),
          /PRODUCTION_SCORING_ADMISSION_FINAL_BOUNDARY_CHANGED/,
        );
        const finalized = rpc(
          cluster,
          database,
          "finalize_production_scoring_admission",
          finalize,
        );
        assert.equal(finalized.admission_state, "CLOSED");
        assert.equal(finalized.lease_set_fingerprint, drained.lease_set_fingerprint);

        const beforeReopen = state(cluster, database);
        const oldGeneration = beforeReopen.admission_generation_id;
        const reopened = rpc(
          cluster,
          database,
          "reopen_production_scoring_admission",
          closureInput(
            beforeReopen,
            baseline.evidenceId,
            close.closure_id,
            "reopen-after-final-boundary",
          ),
        );
        assert.equal(reopened.admission_state, "OPEN");
        assert.notEqual(reopened.admission_generation_id, oldGeneration);
      });

      await t.test("reopen uses the same exclusive transition lock as close", async () => {
        const database = cloneDatabase("close_reopen_lock");
        const beforeClose = state(cluster, database);
        const closeResult = rpc(
          cluster,
          database,
          "close_production_scoring_admission",
          closeInput(
            beforeClose,
            baseline.evidenceId,
            "exclusive-close-before-reopen",
          ),
        );
        const afterClose = state(cluster, database);
        const sharedHolder = spawnPsql(cluster, database, `
          begin;
          select pg_advisory_xact_lock_shared(${advisoryLockKey});
          select pg_sleep(0.50);
          commit;
        `);
        await waitForAdvisoryLocks(cluster, database, {
          mode: "ShareLock",
          granted: true,
        });
        const reopenSession = spawnPsql(
          cluster,
          database,
          rpcSql(
            "reopen_production_scoring_admission",
            closureInput(
              afterClose,
              baseline.evidenceId,
              closeResult.closure_id,
              "exclusive-reopen-after-close",
            ),
          ),
        );
        await waitForAdvisoryLocks(cluster, database, {
          mode: "ExclusiveLock",
          granted: false,
        });

        await sharedHolder.done;
        const reopened = parseJsonOutput((await reopenSession.done).stdout);
        assert.equal(reopened.admission_state, "OPEN");
        assert.notEqual(
          reopened.admission_generation_id,
          closeResult.admission_generation_id,
        );
      });

      await t.test(
        "prepare and commit exclude reopen, and rollback pause waits for Supabase runtime",
        async () => {
          const database = cloneDatabase("authority_lock_order");
          const cutoverClosed = closeDrainFinalize(
            cluster,
            database,
            baseline.evidenceId,
            "cutover-boundary",
          );
          const preparePayload = prepareEpochInput(
            cutoverClosed.current,
            baseline.evidenceId,
            cutoverClosed,
            "CUTOVER",
            "exclusive-cutover",
          );
          const prepareLockHolder = spawnPsql(cluster, database, `
            begin;
            select pg_advisory_xact_lock_shared(${advisoryLockKey});
            select pg_sleep(0.75);
            commit;
          `);
          await waitForAdvisoryLocks(cluster, database, {
            mode: "ShareLock",
            granted: true,
          });
          const prepareSession = spawnPsql(
            cluster,
            database,
            rpcSql("prepare_production_authority_epoch", preparePayload),
          );
          await waitForAdvisoryLocks(cluster, database, {
            mode: "ExclusiveLock",
            granted: false,
          });
          const reopenDuringPrepareSession = spawnPsql(
            cluster,
            database,
            rpcSql(
              "reopen_production_scoring_admission",
              closureInput(
                cutoverClosed.current,
                baseline.evidenceId,
                cutoverClosed.close.closure_id,
                "reopen-during-cutover-prepare",
              ),
            ),
          );
          const reopenDuringPrepareDone = reopenDuringPrepareSession.done.then(
            (result) => ({ ok: true, result }),
            (error) => ({ ok: false, error }),
          );
          await waitForAdvisoryLocks(cluster, database, {
            mode: "ExclusiveLock",
            granted: false,
            minimum: 2,
          });

          await prepareLockHolder.done;
          const prepared = parseJsonOutput((await prepareSession.done).stdout);
          const reopenAfterPrepare = await reopenDuringPrepareDone;
          assert.equal(reopenAfterPrepare.ok, false);
          assert.match(
            reopenAfterPrepare.error.message,
            /PRODUCTION_SCORING_ADMISSION_NOT_REOPENABLE/,
          );
          const preparedState = state(cluster, database);
          assert.equal(preparedState.activation_state, "CUTOVER_PREPARED");
          assert.equal(preparedState.admission_state, "CLOSED");
          assert.equal(preparedState.execution_gate, "PAUSED");
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "begin_production_scoring_ingress",
              beginInput(preparedState, "legacy-begin-while-prepared"),
            ),
            /PRODUCTION_SCORING_ADMISSION_V2_BOUNDARY_MISMATCH/,
          );

          const commitPayload = commitEpochInput(
            preparedState,
            baseline.evidenceId,
            cutoverClosed,
            prepared.epoch_id,
            "exclusive-cutover",
          );
          const commitLockHolder = spawnPsql(cluster, database, `
            begin;
            select pg_advisory_xact_lock_shared(${advisoryLockKey});
            select pg_sleep(0.75);
            commit;
          `);
          await waitForAdvisoryLocks(cluster, database, {
            mode: "ShareLock",
            granted: true,
          });
          const commitSession = spawnPsql(
            cluster,
            database,
            rpcSql("commit_production_authority_epoch", commitPayload),
          );
          await waitForAdvisoryLocks(cluster, database, {
            mode: "ExclusiveLock",
            granted: false,
          });
          const reopenDuringCommitSession = spawnPsql(
            cluster,
            database,
            rpcSql(
              "reopen_production_scoring_admission",
              closureInput(
                preparedState,
                baseline.evidenceId,
                cutoverClosed.close.closure_id,
                "reopen-during-cutover-commit",
              ),
            ),
          );
          const reopenDuringCommitDone = reopenDuringCommitSession.done.then(
            (result) => ({ ok: true, result }),
            (error) => ({ ok: false, error }),
          );
          await waitForAdvisoryLocks(cluster, database, {
            mode: "ExclusiveLock",
            granted: false,
            minimum: 2,
          });

          await commitLockHolder.done;
          const committed = parseJsonOutput((await commitSession.done).stdout);
          const reopenAfterCommit = await reopenDuringCommitDone;
          assert.equal(reopenAfterCommit.ok, false);
          assert.match(
            reopenAfterCommit.error.message,
            /PRODUCTION_SCORING_ADMISSION_NOT_REOPENABLE/,
          );
          assert.equal(committed.authority, "SUPABASE");
          assert.equal(committed.admission_state, "CLOSED");
          assert.equal(committed.scoring_ingress_enabled, true);

          const committedState = state(cluster, database);
          const enabledOutboxWorker = rpc(
            cluster,
            database,
            "set_production_cutover_worker_state",
            {
              ...scope,
              actor_id: actor,
              deployment_commit: deploymentCommit,
              worker_name: "SCORING_GOOGLE_OUTBOX",
              enabled: true,
              expected_activation_revision: Number(
                committedState.activation_revision,
              ),
              expected_epoch_id: committedState.authority_generation_id,
              google_service_account_email:
                "sbi-production-workbook@sandbagger-invitational.iam.gserviceaccount.com",
              request_fingerprint: fingerprint(
                "enable-outbox-worker-before-rollback-drain",
              ),
            },
          );
          assert.equal(enabledOutboxWorker.enabled, true);
          const afterOutboxEnable = state(cluster, database);
          const enabledArchiveWorker = rpc(
            cluster,
            database,
            "set_production_cutover_worker_state",
            {
              ...scope,
              actor_id: actor,
              deployment_commit: deploymentCommit,
              worker_name: "ROUND_SCORECARDS_ARCHIVE",
              enabled: true,
              expected_activation_revision: Number(
                afterOutboxEnable.activation_revision,
              ),
              expected_epoch_id: afterOutboxEnable.authority_generation_id,
              google_service_account_email:
                "sbi-production-workbook@sandbagger-invitational.iam.gserviceaccount.com",
              request_fingerprint: fingerprint(
                "enable-archive-worker-before-rollback-drain",
              ),
            },
          );
          assert.equal(enabledArchiveWorker.enabled, true);

          // Model a canonical Supabase transaction that committed immediately
          // before rollback paused ingress. Its durable mirror and archive
          // events must be drainable while new canonical RPCs remain rejected.
          psql(cluster, database, `
            update scoring_authority.matches
            set match_revision = 1, updated_at = now()
            where match_id = '2026-R1-1';
            insert into scoring_authority.google_outbox_events (
              tournament_id, match_id, match_revision, hole_number,
              hole_revision, mutation_key, event_type, payload, payload_hash
            ) values (
              '2026', '2026-R1-1', 1, 1, 1,
              'rollback-drain-event', 'HOLE_SCORE_UPSERTED',
              '{"test":"rollback-worker-drain"}'::jsonb,
              ${sqlLiteral(fingerprint("rollback-worker-drain-payload"))}
            );
            insert into scoring_authority.finalized_scorecard_snapshots (
              snapshot_id, tournament_id, match_id, snapshot_revision,
              match_revision, scoring_snapshot_id,
              scoring_snapshot_revision, source_fingerprint, payload_hash,
              payload, state, finalized_at, invalidated_at
            ) values (
              '00000000-0000-4000-8000-000000000116',
              '2026', '2026-R1-1', 1, 0,
              'snapshot-2026-r1-m1', 1,
              ${sqlLiteral(fingerprint("rollback-archive-source"))},
              ${sqlLiteral(fingerprint("rollback-archive-payload"))},
              '{"test":"rollback-archive-drain"}'::jsonb,
              'INVALIDATED', now(), now()
            );
            insert into scoring_authority.scorecard_archive_jobs (
              tournament_id, match_id, snapshot_id, snapshot_revision,
              match_revision, event_type, source_fingerprint,
              archive_payload_hash
            ) values (
              '2026', '2026-R1-1',
              '00000000-0000-4000-8000-000000000116', 1, 0,
              'SCORECARD_ARCHIVE_INVALIDATE',
              ${sqlLiteral(fingerprint("rollback-archive-source"))},
              ${sqlLiteral(fingerprint("rollback-archive-payload"))}
            );
          `);

          const supabaseState = state(cluster, database);
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "begin_production_scoring_ingress",
              beginInput(supabaseState, "legacy-google-begin-after-commit"),
            ),
            /PRODUCTION_SCORING_ADMISSION_V2_BOUNDARY_MISMATCH/,
          );
          const rollbackEvidence = recordFenceEvidence(
            cluster,
            database,
            supabaseState,
            "rollback-external-fence",
          );
          const runtimeInput = {
            ...scope,
            deployment_commit: deploymentCommit,
            expected_epoch_id: supabaseState.authority_generation_id,
          };
          const runtimeSession = spawnPsql(cluster, database, `
            begin;
            select production_control.assert_production_scoring_runtime(
              ${jsonSql(runtimeInput)}
            );
            select pg_sleep(0.50);
            commit;
          `);
          await waitForAdvisoryLocks(cluster, database, {
            mode: "ShareLock",
            granted: true,
          });

          const rollbackCloseSession = spawnPsql(
            cluster,
            database,
            rpcSql(
              "close_production_scoring_admission",
              closeInput(
                supabaseState,
                rollbackEvidence.evidence_id,
                "rollback-close-after-runtime",
              ),
            ),
          );
          await waitForAdvisoryLocks(cluster, database, {
            mode: "ExclusiveLock",
            granted: false,
          });

          await runtimeSession.done;
          const rollbackClose = parseJsonOutput(
            (await rollbackCloseSession.done).stdout,
          );
          assert.equal(rollbackClose.admission_state, "CLOSED");
          assert.equal(rollbackClose.execution_gate, "PAUSED");

          assertCommandFailure(
            () => psql(cluster, database, `
              select production_control.assert_production_scoring_runtime(
                ${jsonSql(runtimeInput)}
              );
            `),
            /PRODUCTION_SUPABASE_SCORING_ADMISSION_V2_REQUIRED/,
          );
          assertCommandFailure(
            () => psql(cluster, database, `
              select production_control.assert_production_scoring_runtime(
                ${jsonSql(runtimeInput)}, 'UNRECOGNIZED_WORKER'
              );
            `),
            /PRODUCTION_SUPABASE_SCORING_ADMISSION_V2_REQUIRED/,
          );

          const blockedDrainState = state(cluster, database);
          const blockedDrain = rpc(
            cluster,
            database,
            "drain_production_scoring_admission",
            closureInput(
              blockedDrainState,
              rollbackEvidence.evidence_id,
              rollbackClose.closure_id,
              "rollback-queues-still-pending-drain",
            ),
          );
          assert.equal(blockedDrain.ready_to_finalize, true);
          const blockedBoundary = finalBoundary(cluster, database);
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "finalize_production_scoring_admission",
              finalizationInput(
                state(cluster, database),
                rollbackEvidence.evidence_id,
                rollbackClose.closure_id,
                blockedDrain,
                blockedBoundary,
                "rollback-queues-still-pending-finalize",
              ),
            ),
            /PRODUCTION_SCORING_ADMISSION_FINAL_BOUNDARY_CHANGED/,
          );

          const rollbackWorkerInput = {
            ...scope,
            deployment_commit: deploymentCommit,
            expected_epoch_id: supabaseState.authority_generation_id,
            worker_id: "rollback-drain-worker",
          };
          const claimedRollbackEvent = rpc(
            cluster,
            database,
            "claim_production_google_outbox",
            { ...rollbackWorkerInput, lease_seconds: 30 },
          );
          assert.equal(claimedRollbackEvent.ok, true);
          assert.equal(
            claimedRollbackEvent.event.mutation_key,
            "rollback-drain-event",
          );
          const completedRollbackEvent = rpc(
            cluster,
            database,
            "complete_production_google_outbox",
            {
              ...rollbackWorkerInput,
              event_id: claimedRollbackEvent.event.id,
              verified_fingerprint: fingerprint(
                "rollback-drain-google-readback",
              ),
              google_match_revision: 1,
              google_hole_revision: 1,
            },
          );
          assert.equal(completedRollbackEvent.ok, true);

          const claimedArchiveJob = rpc(
            cluster,
            database,
            "claim_production_scorecard_archive_job",
            {
              ...rollbackWorkerInput,
              worker_id: "rollback-archive-worker",
              lease_seconds: 30,
            },
          );
          assert.equal(claimedArchiveJob.ok, true);
          assert.equal(
            claimedArchiveJob.job.event_type,
            "SCORECARD_ARCHIVE_INVALIDATE",
          );
          const completedArchiveJob = rpc(
            cluster,
            database,
            "complete_production_scorecard_archive_job",
            {
              ...rollbackWorkerInput,
              worker_id: "rollback-archive-worker",
              job_id: claimedArchiveJob.job.id,
              claim_token: claimedArchiveJob.job.claim_token,
              source_fingerprint: fingerprint("rollback-archive-source"),
              archive_payload_hash: fingerprint("rollback-archive-payload"),
              snapshot_revision: 1,
              finalized_match_revision: 0,
              google_readback_hash: fingerprint(
                "rollback-archive-google-readback",
              ),
              expected_logical_identities: [],
              google_row_numbers: [],
              verified_status: "INVALIDATED",
            },
          );
          assert.equal(completedArchiveJob.ok, true);

          const rollbackClosed = drainFinalizeExistingClose(
            cluster,
            database,
            rollbackEvidence.evidence_id,
            rollbackClose,
            "rollback-boundary",
          );
          for (const workerName of [
            "SCORING_GOOGLE_OUTBOX",
            "ROUND_SCORECARDS_ARCHIVE",
          ]) {
            assertCommandFailure(
              () => psql(cluster, database, `
                select production_control.assert_production_scoring_runtime(
                  ${jsonSql(runtimeInput)}, ${sqlLiteral(workerName)}
                );
              `),
              /PRODUCTION_SUPABASE_SCORING_ADMISSION_V2_REQUIRED/,
            );
          }
          const rollbackPrepared = rpc(
            cluster,
            database,
            "prepare_production_authority_epoch",
            prepareEpochInput(
              rollbackClosed.current,
              rollbackEvidence.evidence_id,
              rollbackClosed,
              "ROLLBACK",
              "rollback-authority",
            ),
          );
          const afterRollbackPrepare = state(cluster, database);
          const rolledBack = rpc(
            cluster,
            database,
            "commit_production_authority_epoch",
            commitEpochInput(
              afterRollbackPrepare,
              rollbackEvidence.evidence_id,
              rollbackClosed,
              rollbackPrepared.epoch_id,
              "rollback-authority",
            ),
          );
          assert.equal(rolledBack.authority, "GOOGLE");
          assert.equal(rolledBack.admission_state, "CLOSED");
          assert.equal(rolledBack.scoring_ingress_enabled, false);
          assert.equal(state(cluster, database).execution_gate, "PAUSED");
        },
      );

      await t.test("stale admission revisions and generations fail closed", () => {
        const database = cloneDatabase("stale_tokens");
        const current = state(cluster, database);
        assertCommandFailure(
          () => rpc(
            cluster,
            database,
            "close_production_scoring_admission",
            {
              ...closeInput(
                current,
                baseline.evidenceId,
                "stale-close-revision",
              ),
              expected_admission_revision: Number(current.admission_revision) + 1,
            },
          ),
          /PRODUCTION_SCORING_ADMISSION_CLOSE_REVISION_CONFLICT/,
        );
        assertCommandFailure(
          () => rpc(
            cluster,
            database,
            "begin_production_scoring_ingress_v2",
            {
              ...beginInput(current, "stale-begin-generation"),
              expected_admission_generation: randomUUID(),
            },
          ),
          /PRODUCTION_SCORING_ADMISSION_V2_BOUNDARY_MISMATCH/,
        );
      });
    } finally {
      await destroyCluster(cluster);
    }
  },
);
