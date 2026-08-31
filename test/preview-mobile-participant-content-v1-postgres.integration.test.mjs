import assert from "node:assert/strict";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = path.join(repositoryRoot, "supabase", "migrations");
const pgBin = "/opt/homebrew/opt/postgresql@17/bin";
const postgresBinaries = Object.fromEntries(
  ["createdb", "initdb", "pg_ctl", "psql"].map((name) => [name, path.join(pgBin, name)]),
);

class CommandFailure extends Error {
  constructor(command, result) {
    super([`Command failed: ${command}`, result.stdout, result.stderr].filter(Boolean).join("\n"));
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

function psqlEnvironment(cluster) {
  return {
    ...process.env,
    PGHOST: cluster.socketDirectory,
    PGPORT: String(cluster.port),
    PGUSER: "postgres",
  };
}

function psql(cluster, database, sql) {
  return runCommand(
    postgresBinaries.psql,
    ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", database],
    { env: psqlEnvironment(cluster), input: sql },
  ).trim();
}

function psqlFile(cluster, database, filename) {
  return runCommand(
    postgresBinaries.psql,
    ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", database, "-f", filename],
    { env: psqlEnvironment(cluster) },
  );
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function jsonSql(value) {
  return `${sqlLiteral(JSON.stringify(value))}::jsonb`;
}

function parseJsonOutput(output) {
  const line = output.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).at(-1);
  assert.ok(line, "The Preview RPC must return JSON.");
  return JSON.parse(line);
}

function rpc(cluster, database, input, { role = "service_role" } = {}) {
  assert.match(role, /^(service_role|authenticated|anon)$/);
  return parseJsonOutput(psql(
    cluster,
    database,
    `set role ${role}; select public.read_preview_mobile_participant_content_v1(${jsonSql(input)})::text; reset role;`,
  ));
}

async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function allBinariesAvailable() {
  try {
    await Promise.all(Object.values(postgresBinaries).map((binary) => access(binary, fsConstants.X_OK)));
    return true;
  } catch {
    return false;
  }
}

async function createCluster() {
  const clusterRoot = await mkdtemp("/tmp/bagger-preview-content-pg17-");
  const dataDirectory = path.join(clusterRoot, "data");
  const socketDirectory = path.join(clusterRoot, "socket");
  const logFile = path.join(clusterRoot, "postgres.log");
  const port = await availablePort();
  await mkdir(socketDirectory, { mode: 0o700 });
  runCommand(postgresBinaries.initdb, [
    "-D", dataDirectory, "--username=postgres", "--auth=trust", "--no-locale", "--encoding=UTF8",
  ]);
  runCommand(postgresBinaries.pg_ctl, [
    "-D", dataDirectory, "-l", logFile,
    "-o", `-F -k ${socketDirectory} -h '' -p ${port}`, "-w", "start",
  ]);
  return { clusterRoot, dataDirectory, socketDirectory, logFile, port, started: true };
}

async function destroyCluster(cluster) {
  if (cluster.started) {
    runCommand(postgresBinaries.pg_ctl, [
      "-D", cluster.dataDirectory, "-m", "fast", "-w", "stop",
    ]);
    cluster.started = false;
  }
  assert.equal(path.dirname(cluster.clusterRoot), "/tmp");
  assert.match(path.basename(cluster.clusterRoot), /^bagger-preview-content-pg17-/);
  await rm(cluster.clusterRoot, { recursive: true, force: true });
}

function installSupabaseCompatibility(cluster, database) {
  psql(cluster, database, `
    do $roles$
    begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
    end
    $roles$;
    create schema if not exists extensions;
    create extension if not exists pgcrypto with schema extensions;
  `);
}

function installRequiredMigrations(cluster, database) {
  for (const name of [
    "202608120001_preview_scoring_authority_schema.sql",
    "202608120033_preview_published_odds_snapshots.sql",
    "202608210005_preview_completed_history_foundation.sql",
  ]) {
    psqlFile(cluster, database, path.join(migrationsDirectory, name));
  }
}

function seedParticipantAndOdds(cluster, database) {
  const publishedAt = "2026-08-30T12:00:00.000Z";
  const payload = {
    year: 2026,
    phase: "After Round 1",
    phaseOrder: 1,
    publishedAt,
    teams: [{ side: 1 }],
    players: [{ id: "P1" }],
  };
  psql(cluster, database, `
    insert into scoring_authority.tournaments
      (tournament_id, tournament_year, name, source_workbook_id, scoring_authority)
    values
      ('2026', 2026, 'Synthetic Preview', 'preview-workbook', 'SUPABASE'),
      ('2027', 2027, 'Wrong Preview Tournament', 'wrong-preview-workbook', 'SUPABASE');
    insert into scoring_authority.teams (tournament_id, team_id, team_side, name)
    values
      ('2026', 'T1', 1, 'Team One'), ('2026', 'T2', 2, 'Team Two'),
      ('2027', 'T1-2027', 1, 'Wrong Team One'), ('2027', 'T2-2027', 2, 'Wrong Team Two');
    insert into scoring_authority.players (player_id, display_name)
    values ('P1', 'Active Player'), ('P2', 'Inactive Player'), ('PW', 'Wrong Tournament Player');
    insert into scoring_authority.tournament_players
      (tournament_id, player_id, team_id, team_side, participation_status, source_roster_key)
    values
      ('2026', 'P1', 'T1', 1, 'ACTIVE', 'P1'),
      ('2026', 'P2', 'T1', 1, 'INACTIVE', 'P2'),
      ('2027', 'PW', 'T1-2027', 1, 'ACTIVE', 'PW');
    insert into scoring_authority.odds_published_snapshots (
      tournament_id, milestone, phase_order, publication_revision, published_at,
      published_payload, payload_hash, google_publication_fingerprint,
      is_current_for_milestone, is_current_official, publication_verified, imported_by
    ) values (
      '2026', 'After Round 1', 1, 3, ${sqlLiteral(publishedAt)},
      ${jsonSql(payload)}, ${sqlLiteral("a".repeat(64))}, ${sqlLiteral("b".repeat(64))},
      true, true, true, 'integration-test'
    );
  `);
}

function publicationState(cluster, database) {
  return parseJsonOutput(psql(cluster, database, `
    select jsonb_build_object(
      'state', publication_state,
      'revision', publication_revision,
      'snapshot', current_snapshot_id,
      'milestone', current_milestone,
      'publishedAt', published_at
    )::text
    from scoring_authority.preview_mobile_odds_publications
    where tournament_id = '2026';
  `));
}

test("Preview mobile participant-content migration compiles and enforces Odds withdrawal in PostgreSQL 17", {
  timeout: 120_000,
}, async (t) => {
  if (!(await allBinariesAvailable())) {
    t.skip(`PostgreSQL 17 toolchain is unavailable at ${pgBin}`);
    return;
  }

  const cluster = await createCluster();
  const database = "participant_content_v1";
  try {
    runCommand(postgresBinaries.createdb, [database], { env: psqlEnvironment(cluster) });
    installSupabaseCompatibility(cluster, database);
    installRequiredMigrations(cluster, database);
    seedParticipantAndOdds(cluster, database);
    psqlFile(cluster, database, path.join(
      migrationsDirectory,
      "202608300002_preview_mobile_participant_content_v1.sql",
    ));

    const migrationSql = await readFile(path.join(
      migrationsDirectory,
      "202608300002_preview_mobile_participant_content_v1.sql",
    ), "utf8");
    assert.match(migrationSql, /notify pgrst, 'reload schema'/);

    const initialPublication = publicationState(cluster, database);
    assert.match(initialPublication.snapshot, /^[0-9a-f-]{36}$/);
    assert.equal(Date.parse(initialPublication.publishedAt), Date.parse("2026-08-30T12:00:00.000Z"));
    assert.deepEqual({ ...initialPublication, snapshot: "<uuid>", publishedAt: "<instant>" }, {
      state: "PUBLISHED",
      revision: 3,
      snapshot: "<uuid>",
      milestone: "After Round 1",
      publishedAt: "<instant>",
    });

    const visible = rpc(cluster, database, {
      environment: "PREVIEW", tournament_id: "2026", player_id: "P1", scope: "ODDS",
    });
    assert.equal(visible.ok, true);
    assert.equal(visible.data.publication.state, "PUBLISHED");
    assert.equal(visible.data.snapshots.length, 1);

    for (const input of [
      { environment: "PREVIEW", tournament_id: "2026", player_id: "P2", scope: "ODDS" },
      { environment: "PREVIEW", tournament_id: "2026", player_id: "PW", scope: "ODDS" },
      { environment: "PREVIEW", tournament_id: "2027", player_id: "P1", scope: "ODDS" },
      { environment: "PRODUCTION", tournament_id: "2026", player_id: "P1", scope: "ODDS" },
    ]) {
      const denied = rpc(cluster, database, input);
      assert.equal(denied.ok, false);
      assert.equal(denied.code, "PREVIEW_PARTICIPANT_RESOURCE_REQUIRED");
    }

    const privileges = psql(cluster, database, `
      select concat_ws('|',
        has_function_privilege('service_role',
          'public.read_preview_mobile_participant_content_v1(jsonb)', 'EXECUTE'),
        has_function_privilege('authenticated',
          'public.read_preview_mobile_participant_content_v1(jsonb)', 'EXECUTE'),
        has_function_privilege('anon',
          'public.read_preview_mobile_participant_content_v1(jsonb)', 'EXECUTE'),
        has_function_privilege('service_role',
          'public.set_preview_mobile_odds_publication(jsonb)', 'EXECUTE'),
        has_function_privilege('authenticated',
          'public.set_preview_mobile_odds_publication(jsonb)', 'EXECUTE'),
        has_function_privilege('service_role',
          'scoring_authority.capture_preview_mobile_odds_publication()', 'EXECUTE'),
        has_table_privilege('service_role',
          'scoring_authority.preview_mobile_odds_publications', 'SELECT'),
        has_table_privilege('authenticated',
          'scoring_authority.preview_mobile_odds_publications', 'SELECT'),
        has_table_privilege('anon',
          'scoring_authority.preview_mobile_odds_publications', 'SELECT'),
        has_table_privilege('service_role',
          'scoring_authority.preview_mobile_odds_publications', 'DELETE'));
    `);
    assert.equal(privileges, "t|f|f|t|f|f|t|f|f|f");
    assert.throws(() => rpc(cluster, database, {
      environment: "PREVIEW", tournament_id: "2026", player_id: "P1", scope: "ODDS",
    }, { role: "authenticated" }), /permission denied for function read_preview_mobile_participant_content_v1/i);

    // Mentioning a trigger column without changing its value must not create a
    // new publication or revision.
    psql(cluster, database, `
      update scoring_authority.odds_published_snapshots
      set is_current_official = is_current_official
      where tournament_id = '2026' and is_current_official;
    `);
    assert.equal(publicationState(cluster, database).revision, 3);

    psql(cluster, database, `
      update scoring_authority.odds_published_snapshots
      set publication_verified = false
      where tournament_id = '2026' and is_current_official;
    `);
    const withdrawn = publicationState(cluster, database);
    assert.deepEqual(withdrawn, {
      state: "UNPUBLISHED", revision: 4, snapshot: null, milestone: null, publishedAt: null,
    });
    const hidden = rpc(cluster, database, {
      environment: "PREVIEW", tournament_id: "2026", player_id: "P1", scope: "ODDS",
    });
    assert.equal(hidden.ok, true);
    assert.equal(hidden.data.publication.state, "UNPUBLISHED");
    assert.deepEqual(hidden.data.snapshots, []);

    psql(cluster, database, `
      update scoring_authority.odds_published_snapshots
      set publication_verified = true
      where tournament_id = '2026' and is_current_official;
    `);
    assert.equal(publicationState(cluster, database).state, "PUBLISHED");
    assert.equal(publicationState(cluster, database).revision, 5);

    psql(cluster, database, `
      update scoring_authority.odds_published_snapshots
      set is_current_official = false
      where tournament_id = '2026' and is_current_official;
    `);
    assert.deepEqual(publicationState(cluster, database), {
      state: "UNPUBLISHED", revision: 6, snapshot: null, milestone: null, publishedAt: null,
    });
  } finally {
    await destroyCluster(cluster);
  }
});
