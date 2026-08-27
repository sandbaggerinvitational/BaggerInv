import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
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
const targetMigration =
  "202608270047_production_partial_roster_participant_identity.sql";
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
const actor = "partial-roster-identity-postgres-test";
const deploymentCommit = "1234567890abcdef1234567890abcdef12345678";
const sourceFingerprint = fingerprint("partial-roster-staged-source");
const cbEmail = "cb01@baggerinv.com";
const amEmail = "am01@baggerinv.com";

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

function rpcNoArgs(cluster, database, name) {
  assert.match(name, /^[a-z][a-z0-9_]+$/);
  return parseJsonOutput(psql(
    cluster,
    database,
    `select public.${name}()::text;`,
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
  const clusterRoot = await mkdtemp(path.join(os.tmpdir(), "bagger-identity-pg17-"));
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
  assert.equal(path.dirname(cluster.clusterRoot), path.resolve(os.tmpdir()));
  assert.match(path.basename(cluster.clusterRoot), /^bagger-identity-pg17-/);
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

async function installProductionMigrations(cluster, database, {
  firstMigration = null,
  lastMigration = targetMigration,
} = {}) {
  const migrationNames = (await readdir(migrationsDirectory))
    .filter((name) => /^\d+_.*\.sql$/.test(name))
    .sort();
  const startIndex = firstMigration == null
    ? 0
    : migrationNames.indexOf(firstMigration);
  const endIndex = migrationNames.indexOf(lastMigration);
  assert.notEqual(startIndex, -1, `Missing ${firstMigration}`);
  assert.notEqual(endIndex, -1, `Missing ${lastMigration}`);
  assert.ok(startIndex <= endIndex, "Production migration range must be ordered");
  for (const migrationName of migrationNames.slice(startIndex, endIndex + 1)) {
    psqlFile(cluster, database, path.join(migrationsDirectory, migrationName));
  }
}

function installIdentityFixture(cluster, database) {
  const revisionOneFingerprint = fingerprint("partial-roster-revision-1");
  psql(cluster, database, `
    insert into scoring_authority.tournaments (
      tournament_id, tournament_year, name, source_workbook_id,
      scoring_authority
    ) values (
      '2026', 2026, 'Partial identity PostgreSQL test tournament',
      ${sqlLiteral(scope.source_workbook_id)}, 'GOOGLE'
    );

    insert into scoring_authority.teams (
      tournament_id, team_id, team_side, name
    ) values
      ('2026', 'PICKLES', 1, 'The Pickles'),
      ('2026', 'MASHED', 2, 'The Mashed Potatoes');

    insert into scoring_authority.players (player_id, display_name) values
      ('CB01', 'CB01 Test Director'),
      ('AM01', 'AM01 Test Participant');

    insert into scoring_authority.tournament_players (
      tournament_id, player_id, team_id, team_side,
      participation_status, source_roster_key
    ) values
      ('2026', 'CB01', 'PICKLES', 1, 'ACTIVE', '2026:CB01'),
      ('2026', 'AM01', 'MASHED', 2, 'ACTIVE', '2026:AM01');

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
      'partial-roster-postgres-v1', 'BB', 'course-1', 'Member', 72,
      'LOW_BALL',
      jsonb_agg(jsonb_build_object(
        'hole_number', hole_number,
        'par', 4,
        'stroke_index', hole_number
      ) order by hole_number),
      '{}'::jsonb, '{}'::jsonb,
      ${sqlLiteral(fingerprint("partial-roster-snapshot"))}
    from generate_series(1, 18) as hole_number;

    insert into scoring_authority.matches (
      match_id, tournament_id, round_number, format,
      scoring_snapshot_id, status
    ) values (
      '2026-R1-1', '2026', 1, 'BB', 'snapshot-2026-r1-m1', 'LIVE'
    );

    insert into scoring_authority.scoring_permissions (
      match_id, player_id, can_score, permission_revision
    ) values
      ('2026-R1-1', 'CB01', true, 1),
      ('2026-R1-1', 'AM01', true, 1);

    insert into scoring_authority.ingress_gates (
      tournament_id, state, authority, active_epoch_id,
      unresolved_client_queues, updated_by
    ) values ('2026', 'PAUSED', 'GOOGLE', null, 0, ${sqlLiteral(actor)});

    insert into participant_identity.identity_config_import_runs (
      tournament_id, source_system, source_workbook_id, source_fingerprint,
      configuration_revision, status, roster_count, received_count,
      valid_count, missing_count, validation_report,
      requested_by, approved_by, approved_at
    ) values (
      '2026', 'PRODUCTION_OWNER_APPROVED_IDENTITY_EVIDENCE',
      ${sqlLiteral(scope.source_workbook_id)},
      ${sqlLiteral(revisionOneFingerprint)}, 1, 'APPROVED', 2, 1, 1, 1,
      '{"fullRosterProjection":false,"authUsersCreated":0}'::jsonb,
      ${sqlLiteral(actor)}, ${sqlLiteral(actor)}, now()
    );

    insert into participant_identity.identity_context_revisions (
      tournament_id, context_revision, configuration_fingerprint, updated_by
    ) values (
      '2026', 1, ${sqlLiteral(revisionOneFingerprint)}, ${sqlLiteral(actor)}
    );

    insert into participant_identity.participant_identity_contacts (
      tournament_id, player_id, email, email_normalized, identity_active,
      configuration_revision, verified_by, verified_at,
      source_system, source_workbook_id
    ) values (
      '2026', 'CB01', ${sqlLiteral(cbEmail)}, ${sqlLiteral(cbEmail)}, true,
      1, ${sqlLiteral(actor)}, now(),
      'PRODUCTION_OWNER_APPROVED_IDENTITY_EVIDENCE',
      ${sqlLiteral(scope.source_workbook_id)}
    );
  `);
}

function state(cluster, database) {
  return parseJsonOutput(psql(cluster, database, `
    select jsonb_build_object(
      'activationState', activation.state,
      'activationRevision', activation.activation_revision,
      'scoringAuthority', resource.scoring_authority,
      'identityAuthority', resource.participant_identity_authority,
      'authUserCreationEnabled', resource.auth_user_creation_enabled,
      'scoringIngressEnabled', resource.scoring_ingress_enabled,
      'workersEnabled', resource.workers_enabled,
      'firstWritePossible', activation.first_supabase_write_possible_at,
      'firstWriteObserved', activation.first_supabase_write_observed_at
    )
    from production_control.cutover_activation_state activation
    cross join production_control.resource_scope resource
    where activation.scope_key = 'BAGGER_INV_PRODUCTION'
      and resource.scope_key = 'BAGGER_INV_PRODUCTION';
  `));
}

function stageIdentityFixture(cluster, database) {
  psql(cluster, database, `
    update production_control.cutover_activation_state
    set state = 'STAGED',
        expected_deployment_commit = ${sqlLiteral(deploymentCommit)},
        expected_vercel_project_id = 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU',
        expected_source_fingerprint = ${sqlLiteral(sourceFingerprint)},
        staged_by = ${sqlLiteral(actor)},
        staged_at = now(),
        updated_by = ${sqlLiteral(actor)},
        updated_at = now()
    where scope_key = 'BAGGER_INV_PRODUCTION';
  `);
  return state(cluster, database);
}

function activationInput(current, label) {
  return {
    ...scope,
    contract_version: "production-participant-identity-cutover-v2",
    phase: "IDENTITY",
    actor_id: actor,
    deployment_commit: deploymentCommit,
    expected_activation_revision: Number(current.activationRevision),
    request_fingerprint: fingerprint(`${label}-activate`),
  };
}

function activatePartialIdentity(cluster, database, label) {
  const staged = stageIdentityFixture(cluster, database);
  return rpc(
    cluster,
    database,
    "activate_production_participant_identity",
    activationInput(staged, label),
  );
}

function otpDecision(cluster, database, email, label) {
  return rpc(
    cluster,
    database,
    "authorize_production_participant_otp_request",
    {
      email,
      client_request_hash: fingerprint(`${label}-client-request`),
    },
  );
}

function promoteAm01ToApprovedEnrollment(cluster, database) {
  const revisionTwoFingerprint = fingerprint("partial-roster-revision-2");
  psql(cluster, database, `
    begin;
    insert into participant_identity.identity_config_import_runs (
      tournament_id, source_system, source_workbook_id, source_fingerprint,
      configuration_revision, status, roster_count, received_count,
      valid_count, missing_count, validation_report,
      requested_by, approved_by, approved_at
    ) values (
      '2026', 'PRODUCTION_OWNER_APPROVED_IDENTITY_EVIDENCE',
      ${sqlLiteral(scope.source_workbook_id)},
      ${sqlLiteral(revisionTwoFingerprint)}, 2, 'APPROVED', 2, 2, 2, 0,
      '{"fullRosterProjection":false,"authUsersCreated":0}'::jsonb,
      ${sqlLiteral(actor)}, ${sqlLiteral(actor)}, now()
    );
    update participant_identity.participant_identity_contacts
    set configuration_revision = 2,
        updated_at = now()
    where tournament_id = '2026' and player_id = 'CB01';
    insert into participant_identity.participant_identity_contacts (
      tournament_id, player_id, email, email_normalized, identity_active,
      configuration_revision, verified_by, verified_at,
      source_system, source_workbook_id
    ) values (
      '2026', 'AM01', ${sqlLiteral(amEmail)}, ${sqlLiteral(amEmail)}, true,
      2, ${sqlLiteral(actor)}, now(),
      'PRODUCTION_OWNER_APPROVED_IDENTITY_EVIDENCE',
      ${sqlLiteral(scope.source_workbook_id)}
    );
    update participant_identity.identity_context_revisions
    set context_revision = 2,
        configuration_fingerprint = ${sqlLiteral(revisionTwoFingerprint)},
        updated_by = ${sqlLiteral(actor)},
        updated_at = now()
    where tournament_id = '2026';
    commit;
  `);
}

function seedResidualAm01Authority(cluster, database) {
  const authUserId = randomUUID();
  psql(cluster, database, `
    insert into auth.users (
      id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data
    ) values (
      ${sqlLiteral(authUserId)}::uuid,
      ${sqlLiteral(amEmail)},
      now(),
      jsonb_build_object(
        'provisioning_scope', 'production_controlled_first_login',
        'player_id', 'AM01',
        'tournament_id', '2026'
      ),
      jsonb_build_object('player_id', 'AM01')
    );
    insert into participant_identity.user_player_links (
      auth_user_id, player_id, status, link_method, email_identity_hash,
      linked_at, linked_by
    ) values (
      ${sqlLiteral(authUserId)}::uuid,
      'AM01',
      'ACTIVE',
      'PRODUCTION_CONTROLLED_FIRST_LOGIN',
      ${sqlLiteral(fingerprint(amEmail))},
      now(),
      ${sqlLiteral(actor)}
    );
    insert into participant_identity.participant_auth_identifiers (
      player_id, auth_user_id, identifier_type, normalized_value_private,
      status, verified_at, verification_source, source_system,
      source_tournament_id, source_configuration_revision,
      created_by, updated_by
    ) values (
      'AM01',
      ${sqlLiteral(authUserId)}::uuid,
      'EMAIL',
      ${sqlLiteral(amEmail)},
      'VERIFIED',
      now(),
      'PRODUCTION_EMAIL_OTP',
      'STALE_PRODUCTION_PARTICIPANT_IDENTITY',
      '2026',
      1,
      ${sqlLiteral(actor)},
      ${sqlLiteral(actor)}
    );
    insert into participant_identity.tournament_roles (
      tournament_id, auth_user_id, role, role_active, granted_by
    ) values (
      '2026',
      ${sqlLiteral(authUserId)}::uuid,
      'PARTICIPANT',
      true,
      ${sqlLiteral(actor)}
    );
  `);
  return authUserId;
}

function identityObjectCounts(cluster, database, playerId) {
  return parseJsonOutput(psql(cluster, database, `
    select jsonb_build_object(
      'authUsers', (select count(*) from auth.users),
      'claims', (select count(*)
        from participant_identity.production_participant_enrollment_claims
        where player_id = ${sqlLiteral(playerId)}),
      'links', (select count(*) from participant_identity.user_player_links
        where player_id = ${sqlLiteral(playerId)}),
      'identifiers', (select count(*)
        from participant_identity.participant_auth_identifiers
        where player_id = ${sqlLiteral(playerId)}),
      'participantRoles', (select count(*)
        from participant_identity.tournament_roles role_value
        join participant_identity.user_player_links link
          on link.auth_user_id = role_value.auth_user_id
        where link.player_id = ${sqlLiteral(playerId)}
          and role_value.role = 'PARTICIPANT'
          and role_value.role_active)
    );
  `));
}

function identityFunctionPrivileges(cluster, database) {
  return parseJsonOutput(psql(cluster, database, `
    select jsonb_build_object(
      'wrapperServiceRole', pg_catalog.has_function_privilege(
        'service_role',
        'public.inspect_production_participant_identity_enrollment()',
        'EXECUTE'
      ),
      'wrapperAnon', pg_catalog.has_function_privilege(
        'anon',
        'public.inspect_production_participant_identity_enrollment()',
        'EXECUTE'
      ),
      'wrapperAuthenticated', pg_catalog.has_function_privilege(
        'authenticated',
        'public.inspect_production_participant_identity_enrollment()',
        'EXECUTE'
      ),
      'internalServiceRole', pg_catalog.has_function_privilege(
        'service_role',
        'production_control.build_production_participant_identity_enrollment_inspection()',
        'EXECUTE'
      ),
      'internalAnon', pg_catalog.has_function_privilege(
        'anon',
        'production_control.build_production_participant_identity_enrollment_inspection()',
        'EXECUTE'
      ),
      'internalAuthenticated', pg_catalog.has_function_privilege(
        'authenticated',
        'production_control.build_production_participant_identity_enrollment_inspection()',
        'EXECUTE'
      )
    );
  `));
}

test(
  "Production partial-roster participant identity is safe in PostgreSQL 17",
  { timeout: 120_000 },
  async (t) => {
    if (!(await allBinariesAvailable())) {
      t.skip(`PostgreSQL 17 toolchain is unavailable at ${pgBin}`);
      return;
    }

    const cluster = await createCluster();
    const templateDatabase = "partial_identity_047_template";
    let databaseCounter = 0;
    const clone = (label) => {
      databaseCounter += 1;
      const database = `partial_identity_047_${databaseCounter}_${label}`;
      createDatabase(cluster, database, templateDatabase);
      return database;
    };

    try {
      createDatabase(cluster, templateDatabase);
      installSupabaseCompatibility(cluster, templateDatabase);
      await installProductionMigrations(cluster, templateDatabase, {
        lastMigration:
          "202608260038_production_provider_preview_target_inventory_v4.sql",
      });
      installIdentityFixture(cluster, templateDatabase);
      await installProductionMigrations(cluster, templateDatabase, {
        firstMigration:
          "202608260039_production_all_project_provider_inventory_v3.sql",
      });

      await t.test("partial-roster activation preserves every non-identity authority", () => {
        const before = state(cluster, templateDatabase);
        assert.deepEqual(before, {
          activationState: "DORMANT",
          activationRevision: 0,
          scoringAuthority: "GOOGLE",
          identityAuthority: "PASSPORT",
          authUserCreationEnabled: false,
          scoringIngressEnabled: false,
          workersEnabled: false,
          firstWritePossible: null,
          firstWriteObserved: null,
        });

        const dormantInspection = rpcNoArgs(
          cluster,
          templateDatabase,
          "inspect_production_participant_identity_enrollment",
        );
        assert.equal(
          dormantInspection.contractVersion,
          "production-participant-identity-partial-enrollment-v1",
        );
        assert.equal(dormantInspection.enrollmentPolicy, "APPROVED_PARTIAL_ROSTER");
        assert.equal(Number(dormantInspection.activeRosterCount), 2);
        assert.equal(Number(dormantInspection.enrolledCount), 1);
        assert.equal(Number(dormantInspection.notEnrolledCount), 1);
        assert.equal(Number(dormantInspection.invalidEnrolledCount), 0);
        assert.equal(Number(dormantInspection.distinctEmailCount), 1);
        assert.equal(dormantInspection.activationEligible, true);
        assert.equal(
          dormantInspection.players.find((player) => player.playerId === "AM01")
            ?.enrollmentStatus,
          "NOT_ENROLLED",
        );
        assert.deepEqual(identityFunctionPrivileges(cluster, templateDatabase), {
          wrapperServiceRole: true,
          wrapperAnon: false,
          wrapperAuthenticated: false,
          internalServiceRole: false,
          internalAnon: false,
          internalAuthenticated: false,
        });

        const database = clone("partial_activation");
        const activated = activatePartialIdentity(cluster, database, "partial");
        assert.equal(activated.authority, "SUPABASE");
        assert.equal(Number(activated.approvedParticipants), 1);
        assert.equal(activated.enrollmentPolicy, "APPROVED_PARTIAL_ROSTER");
        assert.equal(Number(activated.activeRosterCount), 2);
        assert.equal(Number(activated.enrolledCount), 1);
        assert.equal(Number(activated.notEnrolledCount), 1);
        assert.equal(activated.authUserCreationEnabled, true);
        assert.deepEqual(
          {
            scoringAuthority: state(cluster, database).scoringAuthority,
            identityAuthority: state(cluster, database).identityAuthority,
            ingress: state(cluster, database).scoringIngressEnabled,
            workers: state(cluster, database).workersEnabled,
            possible: state(cluster, database).firstWritePossible,
            observed: state(cluster, database).firstWriteObserved,
          },
          {
            scoringAuthority: "GOOGLE",
            identityAuthority: "SUPABASE",
            ingress: false,
            workers: false,
            possible: null,
            observed: null,
          },
        );
      });

      await t.test("an unenrolled roster player is explicitly denied without provisioning", () => {
        const database = clone("unenrolled_denial");
        activatePartialIdentity(cluster, database, "unenrolled");
        const before = identityObjectCounts(cluster, database, "AM01");
        assert.deepEqual(before, {
          authUsers: 0,
          claims: 0,
          links: 0,
          identifiers: 0,
          participantRoles: 0,
        });

        const decision = otpDecision(cluster, database, amEmail, "unenrolled");
        assert.equal(decision.ok, true);
        assert.equal(decision.allowed, false);
        assert.equal(decision.provisioningRequired, false);
        assert.equal(decision.email, null);
        assert.equal(decision.playerId, null);
        assert.deepEqual(identityObjectCounts(cluster, database, "AM01"), before);

        const inspection = rpcNoArgs(
          cluster,
          database,
          "inspect_production_participant_identity_enrollment",
        );
        const am01 = inspection.players.find((player) => player.playerId === "AM01");
        assert.equal(am01?.enrollmentStatus, "NOT_ENROLLED");
        assert.equal(Object.hasOwn(am01 || {}, "maskedEmail"), false);
      });

      await t.test("residual participant authority makes an otherwise-unenrolled player invalid and blocks activation", () => {
        const database = clone("residual_authority");
        seedResidualAm01Authority(cluster, database);
        const staged = stageIdentityFixture(cluster, database);
        const inspection = rpcNoArgs(
          cluster,
          database,
          "inspect_production_participant_identity_enrollment",
        );
        const am01 = inspection.players.find((player) => player.playerId === "AM01");
        assert.equal(am01?.enrollmentStatus, "INVALID_ENROLLMENT");
        assert.notEqual(am01?.enrollmentStatus, "NOT_ENROLLED");
        assert.ok(Number(inspection.residualAuthorityCount) > 0);
        assert.equal(inspection.activationEligible, false);

        assertCommandFailure(
          () => rpc(
            cluster,
            database,
            "activate_production_participant_identity",
            activationInput(staged, "residual-authority"),
          ),
          /PRODUCTION_IDENTITY_APPROVED_PARTIAL_ROSTER_REQUIRED/,
        );
        const after = state(cluster, database);
        assert.equal(after.identityAuthority, "PASSPORT");
        assert.equal(after.authUserCreationEnabled, false);
        assert.equal(after.scoringAuthority, "GOOGLE");
      });

      await t.test("a later real approved email enables controlled first-login enrollment", () => {
        const database = clone("later_enrollment");
        activatePartialIdentity(cluster, database, "later-enrollment");
        assert.equal(
          otpDecision(cluster, database, amEmail, "before-real-email").allowed,
          false,
        );

        promoteAm01ToApprovedEnrollment(cluster, database);
        const inspection = rpcNoArgs(
          cluster,
          database,
          "inspect_production_participant_identity_enrollment",
        );
        assert.equal(Number(inspection.enrolledCount), 2);
        assert.equal(Number(inspection.notEnrolledCount), 0);
        assert.equal(
          inspection.players.find((player) => player.playerId === "AM01")
            ?.enrollmentStatus,
          "ENROLLED",
        );
        const cb01 = inspection.players.find((player) => player.playerId === "CB01");
        assert.equal(cb01?.enrollmentStatus, "ENROLLED");
        assert.equal(cb01?.maskedEmail, "c***@b***.com");
        assert.notEqual(cb01?.maskedEmail, cbEmail);

        const cbEligibility = otpDecision(
          cluster,
          database,
          cbEmail,
          "cb01-after-approved-revision",
        );
        assert.equal(cbEligibility.ok, true);
        assert.equal(cbEligibility.allowed, false);
        assert.equal(cbEligibility.provisioningRequired, true);
        assert.equal(cbEligibility.playerId, "CB01");
        assert.equal(cbEligibility.email, cbEmail);

        const initial = otpDecision(cluster, database, amEmail, "after-real-email");
        assert.equal(initial.ok, true);
        assert.equal(initial.allowed, false);
        assert.equal(initial.provisioningRequired, true);
        assert.equal(initial.playerId, "AM01");
        assert.equal(initial.email, amEmail);
        assert.match(initial.claimId, /^[0-9a-f-]{36}$/i);
        assert.equal(identityObjectCounts(cluster, database, "AM01").authUsers, 0);

        const authUserId = randomUUID();
        psql(cluster, database, `
          insert into auth.users (
            id, email, raw_app_meta_data, raw_user_meta_data
          ) values (
            ${sqlLiteral(authUserId)}::uuid,
            ${sqlLiteral(amEmail)},
            jsonb_build_object(
              'provisioning_scope', 'production_controlled_first_login',
              'player_id', 'AM01',
              'tournament_id', '2026'
            ),
            jsonb_build_object('player_id', 'AM01')
          );
        `);
        const completed = rpc(
          cluster,
          database,
          "complete_production_participant_first_login",
          { claim_id: initial.claimId, auth_user_id: authUserId },
        );
        assert.equal(completed.ok, true);
        assert.equal(completed.playerId, "AM01");
        assert.equal(completed.idempotent, false);

        const reauthorized = otpDecision(
          cluster,
          database,
          amEmail,
          "after-controlled-provisioning",
        );
        assert.equal(reauthorized.allowed, true);
        assert.equal(reauthorized.provisioningRequired, false);
        assert.equal(reauthorized.playerId, "AM01");
        assert.equal(reauthorized.authUserId, authUserId);
        assert.equal(reauthorized.verificationType, "signup");
      });

      await t.test("duplicate approved emails and pre-existing Auth collisions fail closed", () => {
        const database = clone("duplicate_collision");
        activatePartialIdentity(cluster, database, "duplicate-collision");
        promoteAm01ToApprovedEnrollment(cluster, database);

        assertCommandFailure(
          () => psql(cluster, database, `
            update participant_identity.participant_identity_contacts
            set email = ${sqlLiteral(cbEmail)},
                email_normalized = ${sqlLiteral(cbEmail)}
            where tournament_id = '2026' and player_id = 'AM01';
          `),
          /participant_identity_active_email_idx|duplicate key/i,
        );

        const collidingAuthUser = randomUUID();
        psql(cluster, database, `
          insert into auth.users (id, email, raw_app_meta_data)
          values (
            ${sqlLiteral(collidingAuthUser)}::uuid,
            ${sqlLiteral(amEmail)},
            '{"provisioning_scope":"unrelated-account"}'::jsonb
          );
        `);
        const decision = otpDecision(cluster, database, amEmail, "auth-collision");
        assert.equal(decision.ok, true);
        assert.equal(decision.allowed, false);
        assert.equal(decision.provisioningRequired, false);
        assert.equal(decision.email, null);
        assert.equal(decision.playerId, null);
        const counts = identityObjectCounts(cluster, database, "AM01");
        assert.equal(counts.authUsers, 1);
        assert.equal(counts.claims, 0);
        assert.equal(counts.links, 0);
        assert.equal(counts.identifiers, 0);
        assert.equal(counts.participantRoles, 0);
      });

      await t.test("an unenrolled roster player cannot obtain scoring authority", () => {
        const database = clone("scoring_denial");
        activatePartialIdentity(cluster, database, "scoring-denial");
        const unlinkedAuthUserId = randomUUID();
        const context = rpc(
          cluster,
          database,
          "read_production_scoring_participant_context",
          {
            ...scope,
            deployment_commit: deploymentCommit,
            match_id: "2026-R1-1",
            player_id: "AM01",
            auth_user_id: unlinkedAuthUserId,
            permission_revision: 1,
            role: "PLAYER",
          },
        );
        assert.equal(context.ok, true);
        assert.equal(context.data.authorization.verified, false);
        assert.equal(context.data.authorization.writable, false);

        assertCommandFailure(
          () => psql(cluster, database, `
            select production_control.assert_production_scoring_actor(
              jsonb_build_object(
                'authorization', jsonb_build_object(
                  'tournament_id', '2026',
                  'player_id', 'AM01',
                  'auth_user_id', ${sqlLiteral(unlinkedAuthUserId)},
                  'role', 'PLAYER'
                )
              ),
              false
            );
          `),
          /PRODUCTION_SCORING_AUTHORIZATION_REQUIRED/,
        );
        assert.deepEqual(identityObjectCounts(cluster, database, "AM01"), {
          authUsers: 0,
          claims: 0,
          links: 0,
          identifiers: 0,
          participantRoles: 0,
        });
      });
    } finally {
      await destroyCluster(cluster);
    }
  },
);
