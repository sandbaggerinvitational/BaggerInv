import assert from "node:assert/strict";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const migration = path.join(
  repositoryRoot,
  "supabase/production_migrations/202608300060_production_players_access_v1.sql",
);
const pgBin = "/opt/homebrew/opt/postgresql@17/bin";
const bin = Object.fromEntries(
  ["createdb", "initdb", "pg_ctl", "psql"].map((name) => [
    name,
    path.join(pgBin, name),
  ]),
);

const scope = Object.freeze({
  contract_version: "production-players-access-v1",
  environment: "PRODUCTION",
  project_ref: "ymqhhtxaywtqllynrmxe",
  project_url: "https://ymqhhtxaywtqllynrmxe.supabase.co",
  source_workbook_id: "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4",
  tournament_id: "2026",
});
const directorAuthorization = Object.freeze({
  tournament_id: "2026",
  player_id: "CB01",
  auth_user_id: "00000000-0000-4000-8000-000000000001",
  role: "DIRECTOR",
});

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0) {
    throw new Error([
      `${command} ${args.join(" ")}`,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join("\n"));
  }
  return result.stdout.trim();
}

function pgEnv(cluster, extras = {}) {
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
    env: pgEnv(cluster),
    input,
  });
}

function sqlFile(cluster, database, filename) {
  return run(
    bin.psql,
    ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", database, "-f", filename],
    { env: pgEnv(cluster) },
  );
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function jsonSql(value) {
  return `${sqlLiteral(JSON.stringify(value))}::jsonb`;
}

function parseJson(output) {
  const candidate = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1);
  assert.ok(candidate, `Expected JSON output, received:\n${output}`);
  return JSON.parse(candidate);
}

function rpc(cluster, database, name, input) {
  assert.match(name, /^[a-z][a-z0-9_]+$/);
  return parseJson(sql(
    cluster,
    database,
    `select public.${name}(${jsonSql(input)})::text;`,
  ));
}

function mutation({
  action,
  expectedRevision,
  requestId,
  hashCharacter,
  authorization = directorAuthorization,
  ...payload
}) {
  return {
    ...scope,
    action,
    expected_revision: expectedRevision,
    operation_request_id: requestId,
    request_payload_hash: hashCharacter.repeat(64),
    authorization,
    ...payload,
  };
}

async function available() {
  try {
    await Promise.all(Object.values(bin).map((value) => access(value, fsConstants.X_OK)));
    return true;
  } catch {
    return false;
  }
}

async function createCluster() {
  const root = await mkdtemp(path.join(os.tmpdir(), "bagger-player-access-pg17-"));
  const data = path.join(root, "data");
  const socket = path.join(root, "socket");
  const log = path.join(root, "postgres.log");
  await mkdir(socket, { mode: 0o700 });
  run(bin.initdb, [
    "-D", data,
    "--username=postgres",
    "--auth=trust",
    "--no-locale",
    "--encoding=UTF8",
  ]);
  run(bin.pg_ctl, [
    "-D", data,
    "-l", log,
    "-o", `-F -k ${socket} -h '' -p 5432`,
    "-w",
    "start",
  ]);
  return { root, data, socket, log, port: 5432, started: true };
}

async function destroyCluster(cluster) {
  if (cluster.started) {
    run(bin.pg_ctl, ["-D", cluster.data, "-m", "fast", "-w", "stop"]);
    cluster.started = false;
  }
  assert.equal(path.dirname(cluster.root), path.resolve(os.tmpdir()));
  assert.match(path.basename(cluster.root), /^bagger-player-access-pg17-/);
  await rm(cluster.root, { recursive: true, force: true });
}

function installFixture(cluster, database) {
  sql(cluster, database, String.raw`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create schema extensions;
    create extension pgcrypto with schema extensions;
    create schema auth;
    create schema production_control;
    create schema scoring_authority;
    create schema participant_identity;

    create table auth.users (
      id uuid primary key,
      email text,
      email_confirmed_at timestamptz,
      phone text,
      raw_app_meta_data jsonb not null default '{}'::jsonb
    );
    create table scoring_authority.tournaments (
      tournament_id text primary key,
      tournament_year integer not null,
      name text not null,
      source_workbook_id text not null,
      scoring_authority text not null
    );
    create table scoring_authority.players (
      player_id text primary key,
      display_name text not null,
      source_payload jsonb not null default '{}'::jsonb
    );
    create table scoring_authority.teams (
      tournament_id text not null,
      team_id text not null,
      team_side integer not null,
      name text not null,
      primary key (tournament_id, team_id)
    );
    create table scoring_authority.tournament_players (
      tournament_id text not null,
      player_id text not null,
      team_id text not null,
      team_side integer not null,
      participation_status text not null,
      source_roster_key text not null,
      primary key (tournament_id, player_id)
    );
    create table scoring_authority.matches (
      match_id text primary key,
      tournament_id text not null
    );
    create table scoring_authority.match_participants (
      match_id text not null,
      player_id text not null
    );

    create table participant_identity.identity_context_revisions (
      tournament_id text primary key,
      context_revision bigint not null,
      configuration_fingerprint text,
      updated_by text not null,
      updated_at timestamptz not null default now()
    );
    create table participant_identity.identity_config_import_runs (
      run_id uuid primary key default extensions.gen_random_uuid(),
      tournament_id text not null,
      source_system text not null,
      source_workbook_id text,
      source_fingerprint text not null,
      configuration_revision bigint not null,
      status text not null,
      roster_count integer not null default 0,
      received_count integer not null default 0,
      valid_count integer not null default 0,
      missing_count integer not null default 0,
      duplicate_count integer not null default 0,
      malformed_count integer not null default 0,
      shared_count integer not null default 0,
      inactive_count integer not null default 0,
      unknown_player_count integer not null default 0,
      mapping_conflict_count integer not null default 0,
      validation_report jsonb not null default '{}'::jsonb,
      requested_by text not null,
      requested_at timestamptz not null default now(),
      approved_by text,
      approved_at timestamptz,
      updated_at timestamptz not null default now()
    );
    create unique index identity_import_approved_fingerprint
      on participant_identity.identity_config_import_runs(
        tournament_id, source_fingerprint
      ) where approved_at is not null;
    create table participant_identity.participant_identity_contacts (
      tournament_id text not null,
      player_id text not null,
      email text not null,
      email_normalized text not null,
      identity_active boolean not null default true,
      configuration_revision bigint not null,
      verified_by text,
      verified_at timestamptz,
      source_system text not null,
      source_workbook_id text,
      source_updated_at timestamptz,
      updated_at timestamptz not null default now(),
      primary key (tournament_id, player_id)
    );
    create unique index identity_contact_active_email
      on participant_identity.participant_identity_contacts(
        tournament_id, email_normalized
      ) where identity_active;
    create table participant_identity.participant_auth_identifiers (
      identifier_id uuid primary key default extensions.gen_random_uuid(),
      player_id text not null,
      auth_user_id uuid not null,
      identifier_type text not null,
      normalized_value_private text not null,
      status text not null,
      verified_at timestamptz,
      verification_source text,
      revision bigint not null default 1,
      source_system text not null,
      source_tournament_id text,
      source_configuration_revision bigint,
      created_by text not null,
      updated_by text not null,
      revoked_at timestamptz
    );
    create table participant_identity.production_participant_enrollment_claims (
      claim_id uuid primary key default extensions.gen_random_uuid(),
      tournament_id text not null,
      player_id text not null,
      email_identity_hash text not null,
      client_request_hash text not null,
      source_configuration_revision bigint not null,
      auth_user_id uuid,
      status text not null,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null default (now() + interval '10 minutes'),
      consumed_at timestamptz,
      cancelled_at timestamptz,
      cleanup_reason text,
      updated_at timestamptz not null default now()
    );
    create table participant_identity.user_player_links (
      link_id uuid primary key default extensions.gen_random_uuid(),
      auth_user_id uuid not null unique,
      player_id text not null,
      status text not null,
      link_revision bigint not null default 1,
      link_method text not null,
      email_identity_hash text not null,
      linked_at timestamptz,
      linked_by text,
      revoked_at timestamptz,
      updated_at timestamptz not null default now()
    );
    create unique index current_player_link
      on participant_identity.user_player_links(player_id)
      where status in ('PENDING', 'ACTIVE', 'SUSPENDED');
    create table participant_identity.tournament_roles (
      tournament_id text not null,
      auth_user_id uuid not null,
      role text not null,
      role_active boolean not null default true,
      role_revision bigint not null default 1,
      granted_at timestamptz not null default now(),
      granted_by text not null,
      revoked_at timestamptz,
      revoked_by text,
      updated_at timestamptz not null default now(),
      primary key (tournament_id, auth_user_id, role)
    );
    create table production_control.director_entitlements (
      entitlement_id uuid primary key default extensions.gen_random_uuid(),
      auth_user_id uuid not null,
      tournament_id text not null,
      player_id text,
      role text not null,
      status text not null,
      granted_by text not null,
      revoked_at timestamptz
    );
    create table production_control.authority_sentinel (
      scoring text not null,
      reads text not null,
      identity text not null,
      odds text not null,
      maintenance text not null,
      ingress text not null,
      workers boolean not null
    );

    create function production_control.assert_exact_cutover_resource_scope(
      input jsonb, ignored boolean
    ) returns void language plpgsql as $fixture$
    begin
      if input->>'environment' is distinct from 'PRODUCTION'
         or input->>'project_ref' is distinct from 'ymqhhtxaywtqllynrmxe'
         or input->>'project_url' is distinct from
           'https://ymqhhtxaywtqllynrmxe.supabase.co'
         or input->>'source_workbook_id' is distinct from
           '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
         or input->>'tournament_id' is distinct from '2026' then
        raise exception 'PRODUCTION_RESOURCE_ASSERTION_FAILED';
      end if;
    end
    $fixture$;
    create function production_control.assert_production_scoring_actor(
      input jsonb, require_director boolean
    ) returns void language plpgsql as $fixture$
    begin
      if require_director and (
        input#>>'{authorization,player_id}' is distinct from 'CB01'
        or input#>>'{authorization,auth_user_id}' is distinct from
          '00000000-0000-4000-8000-000000000001'
        or input#>>'{authorization,role}' is distinct from 'DIRECTOR'
      ) then
        raise exception 'PRODUCTION_DIRECTOR_AUTHORIZATION_REQUIRED';
      end if;
    end
    $fixture$;
    create function production_control.assert_production_handicap_runtime()
    returns void language plpgsql as $fixture$
    begin
      if not exists (
        select 1 from production_control.authority_sentinel
        where scoring = 'SUPABASE' and reads = 'SUPABASE'
          and identity = 'SUPABASE' and odds = 'SUPABASE'
          and maintenance = 'NORMAL' and ingress = 'OPEN' and workers
      ) then
        raise exception 'PRODUCTION_HANDICAP_RUNTIME_NOT_SAFE';
      end if;
    end
    $fixture$;
    create function
      production_control.build_production_participant_identity_enrollment_inspection()
    returns jsonb language sql stable as $fixture$
      with roster as (
        select player_id
        from scoring_authority.tournament_players
        where tournament_id = '2026' and participation_status = 'ACTIVE'
      ), status as (
        select roster.player_id, contact.email_normalized,
          case when contact.player_id is null
            then 'NOT_ENROLLED' else 'ENROLLED' end enrollment_status
        from roster
        left join participant_identity.participant_identity_contacts contact
          on contact.tournament_id = '2026'
         and contact.player_id = roster.player_id
         and contact.identity_active
      )
      select jsonb_build_object(
        'players', coalesce(jsonb_agg(jsonb_build_object(
          'playerId', player_id,
          'enrollmentStatus', enrollment_status,
          'maskedEmail', case when email_normalized is null then null
            else left(split_part(email_normalized, '@', 1), 1)
              || '***@' || left(split_part(email_normalized, '@', 2), 1)
              || '***.com' end
        ) order by player_id), '[]'::jsonb),
        'enrolledCount', count(*) filter (where enrollment_status = 'ENROLLED'),
        'notEnrolledCount', count(*) filter (
          where enrollment_status = 'NOT_ENROLLED'
        )
      ) from status
    $fixture$;

    insert into production_control.authority_sentinel values
      ('SUPABASE', 'SUPABASE', 'SUPABASE', 'SUPABASE', 'NORMAL', 'OPEN', true);
    insert into scoring_authority.tournaments values
      ('2026', 2026, 'Sandbagger Invitational',
       '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4', 'SUPABASE');
    insert into scoring_authority.teams values
      ('2026', 'USA', 1, 'Team USA'), ('2026', 'EUR', 2, 'Team Europe');
    insert into scoring_authority.players(player_id, display_name) values
      ('AA01', 'Atomic Player'),
      ('AL01', 'Alumni Player'),
      ('AM01', 'Linked Player'),
      ('CB01', 'Tournament Director'),
      ('XY01', 'Collision Player'),
      ('ZZ01', 'Enrollment Player');
    insert into scoring_authority.tournament_players values
      ('2026','AA01','USA',1,'ACTIVE','AA01'),
      ('2026','AM01','USA',1,'ACTIVE','AM01'),
      ('2026','CB01','USA',1,'ACTIVE','CB01'),
      ('2026','XY01','EUR',2,'ACTIVE','XY01'),
      ('2026','ZZ01','EUR',2,'ACTIVE','ZZ01');
    insert into auth.users values
      ('00000000-0000-4000-8000-000000000001',
       'director@real-domain.com', now(), null,
       '{"player_id":"CB01","tournament_id":"2026","provisioning_scope":"production_shadow_director_certification"}'),
      ('00000000-0000-4000-8000-000000000002',
       'linked@real-domain.com', now(), '+12145550109',
       '{"player_id":"AM01","tournament_id":"2026","provisioning_scope":"production_controlled_first_login"}'),
      ('00000000-0000-4000-8000-000000000003',
       'alumni@real-domain.com', now(), null,
       '{"player_id":"AL01","tournament_id":"2025","provisioning_scope":"production_controlled_first_login"}');
    insert into participant_identity.identity_context_revisions
      values ('2026', 1, repeat('0', 64), 'fixture', now());
    insert into participant_identity.identity_config_import_runs (
      tournament_id, source_system, source_workbook_id, source_fingerprint,
      configuration_revision, status, roster_count, received_count, valid_count,
      missing_count, requested_by, approved_by, approved_at
    ) values (
      '2026', 'DIRECTOR_CONSOLE',
      '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4', repeat('0',64),
      1, 'APPROVED', 5, 2, 2, 3, 'fixture', 'fixture', now()
    );
    insert into participant_identity.participant_identity_contacts (
      tournament_id, player_id, email, email_normalized, identity_active,
      configuration_revision, verified_by, verified_at, source_system,
      source_workbook_id
    ) values
      ('2026','CB01','director@real-domain.com','director@real-domain.com',true,
       1,'fixture',now(),'DIRECTOR_CONSOLE',
       '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'),
      ('2026','AM01','linked@real-domain.com','linked@real-domain.com',true,
       1,'fixture',now(),'DIRECTOR_CONSOLE',
       '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4');
    insert into participant_identity.production_participant_enrollment_claims (
      tournament_id, player_id, email_identity_hash, client_request_hash,
      source_configuration_revision, status, expires_at
    ) values (
      '2026', 'AM01', repeat('a', 64), repeat('b', 64),
      1, 'PENDING', now() - interval '1 minute'
    );
    insert into participant_identity.user_player_links (
      auth_user_id, player_id, status, link_method, email_identity_hash,
      linked_at, linked_by
    ) values
      ('00000000-0000-4000-8000-000000000001','CB01','ACTIVE','EMAIL_OTP',
       repeat('1',64),now(),'fixture'),
      ('00000000-0000-4000-8000-000000000002','AM01','ACTIVE','EMAIL_OTP',
       repeat('2',64),now(),'fixture'),
      ('00000000-0000-4000-8000-000000000003','AL01','ACTIVE','EMAIL_OTP',
       repeat('3',64),now(),'fixture');
    insert into participant_identity.participant_auth_identifiers (
      player_id, auth_user_id, identifier_type, normalized_value_private,
      status, verified_at, verification_source, source_system,
      source_tournament_id, source_configuration_revision, created_by, updated_by
    ) values
      ('CB01','00000000-0000-4000-8000-000000000001','EMAIL',
       'director@real-domain.com','VERIFIED',now(),'OTP','DIRECTOR_CONSOLE',
       '2026',1,'fixture','fixture'),
      ('AM01','00000000-0000-4000-8000-000000000002','EMAIL',
       'linked@real-domain.com','VERIFIED',now(),'OTP','DIRECTOR_CONSOLE',
       '2026',1,'fixture','fixture'),
      ('AM01','00000000-0000-4000-8000-000000000002','PHONE',
       '+12145550109','VERIFIED',now(),'OTP','DIRECTOR_CONSOLE',
       '2026',1,'fixture','fixture');
    insert into participant_identity.tournament_roles (
      tournament_id, auth_user_id, role, granted_by
    ) values
      ('2026','00000000-0000-4000-8000-000000000001','DIRECTOR','fixture'),
      ('2026','00000000-0000-4000-8000-000000000001','PARTICIPANT','fixture'),
      ('2026','00000000-0000-4000-8000-000000000002','PARTICIPANT','fixture');
    insert into production_control.director_entitlements (
      auth_user_id, tournament_id, player_id, role, status, granted_by
    ) values (
      '00000000-0000-4000-8000-000000000001','2026','CB01',
      'DIRECTOR','ACTIVE','fixture'
    );
  `);
}

test("migration 060 executes on PostgreSQL 17 and keeps Players & Access bounded", async (context) => {
  if (!(await available())) {
    context.skip("PostgreSQL 17 binaries unavailable");
    return;
  }
  const cluster = await createCluster();
  try {
    const database = "production_players_access_060";
    run(bin.createdb, [database], { env: pgEnv(cluster, { PGOPTIONS: "" }) });
    installFixture(cluster, database);
    const before = sql(cluster, database, `
      select jsonb_build_object(
        'players', (select count(*) from scoring_authority.players),
        'memberships', (select count(*) from scoring_authority.tournament_players),
        'contacts', (select count(*) from participant_identity.participant_identity_contacts),
        'links', (select count(*) from participant_identity.user_player_links),
        'sentinel', (select to_jsonb(value) from production_control.authority_sentinel value)
      )::text;
    `);
    sqlFile(cluster, database, migration);
    const afterInstall = sql(cluster, database, `
      select jsonb_build_object(
        'players', (select count(*) from scoring_authority.players),
        'memberships', (select count(*) from scoring_authority.tournament_players),
        'contacts', (select count(*) from participant_identity.participant_identity_contacts),
        'links', (select count(*) from participant_identity.user_player_links),
        'sentinel', (select to_jsonb(value) from production_control.authority_sentinel value)
      )::text;
      select jsonb_build_object(
        'context', (select count(*) from participant_identity.player_access_context_v1),
        'phones', (select count(*) from participant_identity.player_approved_phones_v1),
        'preferences', (select count(*) from participant_identity.player_login_preferences_v1),
        'receipts', (select count(*) from participant_identity.player_access_operation_receipts_v1),
        'audit', (select count(*) from participant_identity.player_access_audit_events_v1)
      )::text;
    `).split(/\r?\n/);
    assert.equal(afterInstall[0], before, "installation must not mutate canonical state");
    assert.deepEqual(JSON.parse(afterInstall[1]), {
      context: 0,
      phones: 0,
      preferences: 0,
      receipts: 0,
      audit: 0,
    });

    const privileges = parseJson(sql(cluster, database, `
      select jsonb_build_object(
        'anonRead', has_function_privilege('anon',
          'public.read_production_players_access_v1(jsonb)', 'execute'),
        'authenticatedRead', has_function_privilege('authenticated',
          'public.read_production_players_access_v1(jsonb)', 'execute'),
        'serviceRead', has_function_privilege('service_role',
          'public.read_production_players_access_v1(jsonb)', 'execute'),
        'anonMutate', has_function_privilege('anon',
          'public.mutate_production_players_access_v1(jsonb)', 'execute'),
        'serviceMutate', has_function_privilege('service_role',
          'public.mutate_production_players_access_v1(jsonb)', 'execute')
      )::text;
    `));
    assert.deepEqual(privileges, {
      anonRead: false,
      authenticatedRead: false,
      serviceRead: true,
      anonMutate: false,
      serviceMutate: true,
    });
    assert.equal(sql(cluster, database, `
      select bool_and(class_value.relrowsecurity)::text
      from pg_catalog.pg_class class_value
      join pg_catalog.pg_namespace namespace_value
        on namespace_value.oid = class_value.relnamespace
      where namespace_value.nspname = 'participant_identity'
        and class_value.relname in (
          'player_access_context_v1',
          'player_approved_phones_v1',
          'player_login_preferences_v1',
          'player_access_operation_receipts_v1',
          'player_access_audit_events_v1'
        );
    `), "true");
    assert.equal(sql(cluster, database, `
      select bool_or(
        has_table_privilege('service_role', class_value.oid, 'SELECT')
        or has_table_privilege('service_role', class_value.oid, 'INSERT')
        or has_table_privilege('service_role', class_value.oid, 'UPDATE')
        or has_table_privilege('service_role', class_value.oid, 'DELETE')
      )::text
      from pg_catalog.pg_class class_value
      join pg_catalog.pg_namespace namespace_value
        on namespace_value.oid = class_value.relnamespace
      where namespace_value.nspname = 'participant_identity'
        and class_value.relname in (
          'player_access_context_v1',
          'player_approved_phones_v1',
          'player_login_preferences_v1',
          'player_access_operation_receipts_v1',
          'player_access_audit_events_v1'
        );
    `), "false");

    const read = rpc(cluster, database, "read_production_players_access_v1", {
      ...scope,
      operation: "READ_PRODUCTION_PLAYERS_ACCESS_V1",
      authorization: directorAuthorization,
    });
    assert.equal(read.ok, true);
    assert.equal(read.data.summary.globalPlayers, 6);
    assert.equal(read.data.summary.activeRoster, 5);
    assert.equal(read.data.players.find((value) => value.playerId === "CB01").maskedEmail,
      "d***@r***.com");
    assert.equal(read.data.players.find((value) => value.playerId === "AM01").emailStatus,
      "VERIFIED");
    const serializedRead = JSON.stringify(read);
    assert.doesNotMatch(serializedRead, /director@real-domain\.com/);
    assert.doesNotMatch(serializedRead, /linked@real-domain\.com/);
    assert.doesNotMatch(serializedRead, /00000000-0000-4000-8000-00000000000[12]/);

    const approveEmailInput = mutation({
      action: "APPROVE_EMAIL",
      expectedRevision: 0,
      requestId: "10000000-0000-4000-8000-000000000001",
      hashCharacter: "a",
      player_id: "ZZ01",
      email: "new.player@real-domain.com",
    });
    const approvedEmail = rpc(
      cluster,
      database,
      "mutate_production_players_access_v1",
      approveEmailInput,
    );
    assert.equal(approvedEmail.ok, true);
    assert.equal(approvedEmail.changed, true);
    assert.equal(approvedEmail.revision, 1);
    assert.equal(approvedEmail.authUsersCreated, 0);
    assert.equal(approvedEmail.otpSent, false);
    const emailRetry = rpc(
      cluster,
      database,
      "mutate_production_players_access_v1",
      approveEmailInput,
    );
    assert.equal(emailRetry.idempotent, true);
    assert.equal(sql(cluster, database, `
      select count(*) from participant_identity.player_access_audit_events_v1
      where action = 'EMAIL_APPROVED';
    `), "1");
    assert.equal(sql(cluster, database, `
      select status from participant_identity.production_participant_enrollment_claims
      where player_id = 'AM01';
    `), "CANCELLED", "expired claims are retired before an identity snapshot advances");
    assert.throws(() => sql(cluster, database, `
      insert into participant_identity.production_participant_enrollment_claims (
        tournament_id, player_id, email_identity_hash, client_request_hash,
        source_configuration_revision, status
      ) values (
        '2026', 'AM01', repeat('c', 64), repeat('d', 64), 1, 'PENDING'
      );
    `), /PRODUCTION_PARTICIPANT_IDENTITY_CONFIGURATION_ADVANCED/,
    "a claim that read stale contact state cannot cross the serialized snapshot boundary");

    const stalePhone = rpc(
      cluster,
      database,
      "mutate_production_players_access_v1",
      mutation({
        action: "APPROVE_PHONE",
        expectedRevision: 0,
        requestId: "10000000-0000-4000-8000-000000000002",
        hashCharacter: "b",
        player_id: "ZZ01",
        phone_e164: "+12145550101",
      }),
    );
    assert.equal(stalePhone.code, "PLAYER_ACCESS_REVISION_STALE");
    assert.equal(stalePhone.currentRevision, 1);

    const emailCollision = rpc(
      cluster,
      database,
      "mutate_production_players_access_v1",
      mutation({
        action: "APPROVE_EMAIL",
        expectedRevision: 1,
        requestId: "10000000-0000-4000-8000-000000000003",
        hashCharacter: "c",
        player_id: "XY01",
        email: "NEW.PLAYER@real-domain.com",
      }),
    );
    assert.equal(emailCollision.code, "PLAYER_ACCESS_EMAIL_COLLISION");

    const approvedPhone = rpc(
      cluster,
      database,
      "mutate_production_players_access_v1",
      mutation({
        action: "APPROVE_PHONE",
        expectedRevision: 1,
        requestId: "10000000-0000-4000-8000-000000000004",
        hashCharacter: "d",
        player_id: "ZZ01",
        phone_e164: "+12145550101",
      }),
    );
    assert.equal(approvedPhone.ok, true);
    assert.equal(approvedPhone.revision, 2);
    const phoneState = sql(cluster, database, `
      select status || ':' || coalesce(verified_at::text, 'NULL')
      from participant_identity.player_approved_phones_v1
      where tournament_id = '2026' and player_id = 'ZZ01';
    `);
    assert.equal(phoneState, "APPROVED:NULL", "Director approval is not ownership verification");
    const stableMapping = parseJson(sql(cluster, database, `
      select jsonb_build_object(
        'emailPlayer', (select player_id
          from participant_identity.participant_identity_contacts
          where email_normalized = 'new.player@real-domain.com'),
        'phonePlayer', (select player_id
          from participant_identity.player_approved_phones_v1
          where phone_e164 = '+12145550101')
      )::text;
    `));
    assert.deepEqual(stableMapping, { emailPlayer: "ZZ01", phonePlayer: "ZZ01" });

    const phoneCollision = rpc(
      cluster,
      database,
      "mutate_production_players_access_v1",
      mutation({
        action: "APPROVE_PHONE",
        expectedRevision: 2,
        requestId: "10000000-0000-4000-8000-000000000005",
        hashCharacter: "e",
        player_id: "XY01",
        phone_e164: "+12145550101",
      }),
    );
    assert.equal(phoneCollision.code, "PLAYER_ACCESS_PHONE_COLLISION");

    const nonmemberSuspension = rpc(
      cluster,
      database,
      "mutate_production_players_access_v1",
      mutation({
        action: "SUSPEND_ACCESS",
        expectedRevision: 2,
        requestId: "10000000-0000-4000-8000-000000000012",
        hashCharacter: "6",
        player_id: "AL01",
      }),
    );
    assert.equal(nonmemberSuspension.code, "PLAYER_ACCESS_ACTIVE_MEMBERSHIP_REQUIRED");
    assert.equal(sql(cluster, database, `
      select status from participant_identity.user_player_links
      where player_id = 'AL01';
    `), "ACTIVE", "a nonmember's global identity remains untouched");

    const suspended = rpc(
      cluster,
      database,
      "mutate_production_players_access_v1",
      mutation({
        action: "SUSPEND_ACCESS",
        expectedRevision: 2,
        requestId: "10000000-0000-4000-8000-000000000006",
        hashCharacter: "f",
        player_id: "AM01",
      }),
    );
    assert.equal(suspended.ok, true);
    assert.equal(suspended.revision, 3);
    assert.equal(sql(cluster, database, `
      select link.status || ':' || role_value.role_active::text
      from participant_identity.user_player_links link
      join participant_identity.tournament_roles role_value
        on role_value.auth_user_id = link.auth_user_id
       and role_value.tournament_id = '2026'
       and role_value.role = 'PARTICIPANT'
      where link.player_id = 'AM01';
    `), "SUSPENDED:false");
    sql(cluster, database, `
      update participant_identity.tournament_roles set
        role_active = true, revoked_at = null, revoked_by = null
      where tournament_id = '2026'
        and auth_user_id = '00000000-0000-4000-8000-000000000002'
        and role = 'PARTICIPANT';
    `);
    const repairedSuspension = rpc(
      cluster,
      database,
      "mutate_production_players_access_v1",
      mutation({
        action: "SUSPEND_ACCESS",
        expectedRevision: 3,
        requestId: "10000000-0000-4000-8000-000000000011",
        hashCharacter: "5",
        player_id: "AM01",
      }),
    );
    assert.equal(repairedSuspension.ok, true);
    assert.equal(repairedSuspension.changed, true);
    assert.equal(repairedSuspension.revision, 4,
      "repairing a drifted active role advances the optimistic revision");
    const resumed = rpc(
      cluster,
      database,
      "mutate_production_players_access_v1",
      mutation({
        action: "RESUME_ACCESS",
        expectedRevision: 4,
        requestId: "10000000-0000-4000-8000-000000000007",
        hashCharacter: "1",
        player_id: "AM01",
      }),
    );
    assert.equal(resumed.ok, true,
      "a verified identity remains resumable after another Player advances the contact snapshot");
    assert.equal(resumed.revision, 5);

    const existingVerifiedPhone = rpc(
      cluster,
      database,
      "mutate_production_players_access_v1",
      mutation({
        action: "APPROVE_PHONE",
        expectedRevision: 5,
        requestId: "10000000-0000-4000-8000-000000000010",
        hashCharacter: "4",
        player_id: "AM01",
        phone_e164: "+12145550109",
      }),
    );
    assert.equal(existingVerifiedPhone.ok, true);
    assert.equal(existingVerifiedPhone.revision, 6);
    const afterVerifiedPhoneApproval = rpc(
      cluster,
      database,
      "read_production_players_access_v1",
      {
        ...scope,
        operation: "READ_PRODUCTION_PLAYERS_ACCESS_V1",
        authorization: directorAuthorization,
      },
    ).data.players.find((value) => value.playerId === "AM01");
    assert.equal(afterVerifiedPhoneApproval.phoneStatus, "VERIFIED",
      "an established verified identifier outranks a Director approval row");

    const contextBeforeBulk = sql(cluster, database, `
      select context_revision from participant_identity.identity_context_revisions
      where tournament_id = '2026';
    `);
    const failedBulk = rpc(
      cluster,
      database,
      "mutate_production_players_access_v1",
      mutation({
        action: "BULK_ENROLL",
        expectedRevision: 6,
        requestId: "10000000-0000-4000-8000-000000000008",
        hashCharacter: "2",
        entries: [
          { player_id: "AA01", email: "atomic@real-domain.com", phone_e164: "+12145550102" },
          { player_id: "XY01", email: "new.player@real-domain.com" },
        ],
      }),
    );
    assert.equal(failedBulk.code, "PLAYER_ACCESS_EMAIL_COLLISION");
    assert.equal(sql(cluster, database, `
      select count(*) from participant_identity.participant_identity_contacts
      where player_id = 'AA01';
    `), "0");
    assert.equal(sql(cluster, database, `
      select count(*) from participant_identity.player_approved_phones_v1
      where player_id = 'AA01';
    `), "0");
    assert.equal(sql(cluster, database, `
      select context_revision from participant_identity.identity_context_revisions
      where tournament_id = '2026';
    `), contextBeforeBulk);
    assert.equal(sql(cluster, database, `
      select revision from participant_identity.player_access_context_v1
      where tournament_id = '2026';
    `), "6");

    const successfulBulk = rpc(
      cluster,
      database,
      "mutate_production_players_access_v1",
      mutation({
        action: "BULK_ENROLL",
        expectedRevision: 6,
        requestId: "10000000-0000-4000-8000-000000000013",
        hashCharacter: "7",
        entries: [
          { player_id: "AA01", email: "atomic@real-domain.com", phone_e164: "+12145550102" },
          { player_id: "XY01", email: "collision.player@real-domain.com" },
        ],
      }),
    );
    assert.equal(successfulBulk.ok, true);
    assert.equal(successfulBulk.revision, 7);
    const bulkAudit = parseJson(sql(cluster, database, `
      select safe_metadata::text
      from participant_identity.player_access_audit_events_v1
      where action = 'BULK_ENROLLMENT_APPLIED'
      order by occurred_at desc limit 1;
    `));
    assert.deepEqual(bulkAudit.targets, [
      { player_id: "AA01", identifier_types: ["EMAIL", "PHONE"] },
      { player_id: "XY01", identifier_types: ["EMAIL"] },
    ]);
    assert.equal(JSON.stringify(bulkAudit).includes("atomic@real-domain.com"), false);

    assert.throws(
      () => rpc(
        cluster,
        database,
        "mutate_production_players_access_v1",
        mutation({
          action: "REVOKE_PHONE",
          expectedRevision: 7,
          requestId: "10000000-0000-4000-8000-000000000009",
          hashCharacter: "3",
          player_id: "ZZ01",
          authorization: {
            tournament_id: "2026",
            player_id: "AM01",
            auth_user_id: "00000000-0000-4000-8000-000000000002",
            role: "PLAYER",
          },
        }),
      ),
      /PRODUCTION_DIRECTOR_AUTHORIZATION_REQUIRED/,
    );
    assert.throws(
      () => rpc(cluster, database, "read_production_players_access_v1", {
        ...scope,
        project_ref: "preview-project",
        operation: "READ_PRODUCTION_PLAYERS_ACCESS_V1",
        authorization: directorAuthorization,
      }),
      /PRODUCTION_RESOURCE_ASSERTION_FAILED/,
    );

    const sentinel = parseJson(sql(cluster, database, `
      select to_jsonb(value)::text from production_control.authority_sentinel value;
    `));
    assert.deepEqual(sentinel, {
      scoring: "SUPABASE",
      reads: "SUPABASE",
      identity: "SUPABASE",
      odds: "SUPABASE",
      maintenance: "NORMAL",
      ingress: "OPEN",
      workers: true,
    });
  } finally {
    await destroyCluster(cluster);
  }
});
