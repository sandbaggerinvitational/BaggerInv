import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  buildTournamentAwardsMutation,
  stableTournamentAwardsValue,
} from "../lib/production-tournament-awards-contract.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = path.join(root, "supabase", "production_migrations");
const migration089 = "202609050089_production_tournament_awards_v1.sql";
const migration090 = "202609050090_production_tournament_awards_service_scope_v1.sql";
const annualPredecessor = "202608300068_production_future_participant_identity_runtime_v1.sql";
const hashPredecessor = "202608310080_production_prediction_settings_authoring_v1.sql";
const providerInventoryV4 = "202608260038_production_provider_preview_target_inventory_v4.sql";
const pgBin = "/opt/homebrew/opt/postgresql@17/bin";
const bin = Object.fromEntries(["createdb", "initdb", "pg_ctl", "psql"]
  .map((name) => [name, path.join(pgBin, name)]));
const workbook = "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4";
const projectRef = "ymqhhtxaywtqllynrmxe";
const projectUrl = `https://${projectRef}.supabase.co`;
const actorAuth = "00000000-0000-4000-8000-000000000001";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...options,
  });
  if (result.error || result.status !== 0) {
    throw new Error([command, result.stdout, result.stderr].filter(Boolean).join("\n"));
  }
  return result.stdout.trim();
}

function environment(cluster, jwtRole = "service_role") {
  return {
    ...process.env,
    PGHOST: cluster.socket,
    PGPORT: String(cluster.port),
    PGUSER: "postgres",
    PGOPTIONS: `-c request.jwt.claim.role=${jwtRole}`,
  };
}

function sql(cluster, database, input, jwtRole = "service_role") {
  return run(bin.psql, ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", database], {
    env: environment(cluster, jwtRole), input,
  });
}

function sqlWithClaims(cluster, database, input, {
  claimsRole = "service_role",
  databaseRole = "service_role",
} = {}) {
  return run(bin.psql, ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", database], {
    env: {
      ...environment(cluster),
      PGOPTIONS: `-c request.jwt.claims={\"role\":\"${claimsRole}\"}`,
    },
    input: `set role ${databaseRole};\n${input}`,
  });
}

function sqlFile(cluster, database, filename) {
  return run(bin.psql, ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", database, "-f", filename], {
    env: environment(cluster),
  });
}

function json(value) {
  return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
}

function rpc(cluster, database, name, input, jwtRole = "service_role") {
  return JSON.parse(sql(cluster, database, `select public.${name}(${json(input)})::text`, jwtRole));
}

function rpcWithClaims(cluster, database, name, input, options) {
  return JSON.parse(sqlWithClaims(
    cluster,
    database,
    `select public.${name}(${json(input)})::text`,
    options,
  ));
}

function canonicalHash(value) {
  return createHash("sha256").update(JSON.stringify(stableTournamentAwardsValue(value))).digest("hex");
}

function actorScope() {
  return {
    contract_version: "production-tournament-awards-v1",
    environment: "PRODUCTION",
    project_ref: projectRef,
    project_url: projectUrl,
    source_workbook_id: workbook,
    tournament_id: "2026",
    actor_player_id: "P01",
    actor_auth_user_id: actorAuth,
    authorization: {
      tournament_id: "2026",
      auth_user_id: actorAuth,
      player_id: "P01",
      role: "DIRECTOR",
    },
  };
}

function saveInput({ awards, expectedRevision, requestId }) {
  const operation = buildTournamentAwardsMutation({ awards, expectedRevision, operationRequestId: requestId });
  const scope = actorScope();
  return {
    ...scope,
    ...operation,
    request_payload_hash: canonicalHash({
      operation: "SAVE",
      tournamentId: "2026",
      actorPlayerId: "P01",
      actorAuthUserId: actorAuth,
      expectedRevision,
      awards: operation.awards,
    }),
  };
}

async function available() {
  try {
    await Promise.all(Object.values(bin).map((value) => access(value, fsConstants.X_OK)));
    return true;
  } catch { return false; }
}

async function createCluster() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "bagger-awards-pg-"));
  const data = path.join(directory, "data");
  const socket = path.join(directory, "socket");
  const log = path.join(directory, "postgres.log");
  await mkdir(socket, { mode: 0o700 });
  run(bin.initdb, ["-D", data, "--username=postgres", "--auth=trust", "--no-locale", "--encoding=UTF8", "--set=shared_memory_type=mmap", "--set=dynamic_shared_memory_type=mmap"]);
  const port = 59500 + (process.pid % 200);
  run(bin.pg_ctl, ["-D", data, "-l", log, "-o", `-F -k ${socket} -h '' -p ${port}`, "-w", "start"]);
  return { directory, data, socket, log, port, started: true };
}

async function destroyCluster(cluster) {
  if (cluster?.started) run(bin.pg_ctl, ["-D", cluster.data, "-m", "fast", "-w", "stop"]);
  if (cluster?.directory) {
    assert.equal(path.dirname(cluster.directory), path.resolve(os.tmpdir()));
    assert.match(path.basename(cluster.directory), /^bagger-awards-pg-/);
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
      select coalesce(nullif(current_setting('request.jwt.claim.role',true),''), current_user)
    $$;
    create function public.rls_auto_enable() returns void language plpgsql as $$ begin end $$;
  `);
}

function installAnnualFixture(cluster, database) {
  sql(cluster, database, `
    set session_replication_role=replica;
    insert into production_control.maintenance_deployment_capability_bindings (
      capability_binding_id,rebind_id,boundary_mode,contract_version,
      capability_ceiling,tournament_id,epoch_id,deployment_id,deployment_commit,
      capability_manifest,capability_fingerprint,runtime_observed_at,
      request_fingerprint,payload_hash,actor_id,response_value
    ) select
      '71000000-0000-4000-8000-000000000001',
      '71000000-0000-4000-8000-000000000002','MAINTENANCE_WINDOW_V1',
      'production-maintenance-single-deployment-capability-v1','OBSERVATION',
      '2026',value.authority_generation_id,'dpl_AwardsFixture',repeat('7',40),
      '{}'::jsonb,repeat('7',64),clock_timestamp(),repeat('8',64),
      repeat('9',64),'awards-fixture','{}'::jsonb
    from production_control.cutover_activation_state value
    where value.scope_key='BAGGER_INV_PRODUCTION';
    set session_replication_role=origin;
  `);
}

function seedActorAndRoster(cluster, database) {
  const players = Array.from({ length: 24 }, (_, index) => {
    const number = String(index + 1).padStart(2, "0");
    const playerId = `P${number}`;
    const payload = index === 0
      ? '{"Slug":"director-one","Photo Filename":"director.jpg"}'
      : `{\"Slug\":\"player-${number}\",\"Photo Filename\":\"player-${number}.jpg\"}`;
    return `('${playerId}','${index === 0 ? "Director One" : `Player ${number}`}','${payload}')`;
  }).join(",\n      ");
  const memberships = Array.from({ length: 24 }, (_, index) => {
    const number = String(index + 1).padStart(2, "0");
    const playerId = `P${number}`;
    const side = index < 12 ? 1 : 2;
    return `('2026','${playerId}','TEAM-${side}',${side},'ACTIVE','${playerId}','{}')`;
  }).join(",\n      ");
  sql(cluster, database, `
    insert into scoring_authority.players(player_id,display_name,source_payload)
    values
      ${players};
    insert into scoring_authority.teams(tournament_id,team_id,team_side,name,source_payload)
    values
      ('2026','TEAM-1',1,'Team One','{"Team Logo":"team-one.png"}'),
      ('2026','TEAM-2',2,'Team Two','{}');
    insert into scoring_authority.tournament_players(
      tournament_id,player_id,team_id,team_side,participation_status,
      source_roster_key,source_payload
    ) values
      ${memberships};
    insert into auth.users(id,email,email_confirmed_at)
    values ('${actorAuth}','director@example.org',clock_timestamp());
    insert into participant_identity.user_player_links(
      auth_user_id,player_id,status,link_revision,link_method,
      email_identity_hash,linked_at,linked_by
    ) values ('${actorAuth}','P01','ACTIVE',1,'APPROVED_EMAIL_OTP',
      encode(extensions.digest('director@example.org','sha256'),'hex'),
      clock_timestamp(),'awards-fixture');
    insert into participant_identity.participant_auth_identifiers(
      player_id,auth_user_id,identifier_type,normalized_value_private,
      status,verified_at,verification_source,revision,source_system,
      source_tournament_id,source_configuration_revision,created_by,updated_by
    ) values ('P01','${actorAuth}','EMAIL','director@example.org','VERIFIED',
      clock_timestamp(),'OTP',1,'SUPABASE','2026',1,
      'awards-fixture','awards-fixture');
    insert into participant_identity.tournament_roles(
      tournament_id,auth_user_id,role,role_active,granted_by
    ) values ('2026','${actorAuth}','DIRECTOR',true,'awards-fixture');
    insert into production_control.director_entitlements(
      entitlement_id,auth_user_id,tournament_id,player_id,role,status,
      granted_by,granted_at
    ) values ('00000000-0000-4000-8000-000000000002','${actorAuth}',
      '2026','P01','DIRECTOR','ACTIVE','awards-fixture',clock_timestamp());
  `);
}

test("migration 090 accepts the sb_secret_ claims transport without weakening Awards security", async (t) => {
  if (!(await available())) return t.skip("PostgreSQL 17 binaries unavailable");
  const cluster = await createCluster();
  t.after(() => destroyCluster(cluster));
  const database = "production_awards_v1";
  run(bin.createdb, [database], { env: { ...environment(cluster), PGOPTIONS: "" } });
  installSupabaseCompatibility(cluster, database);

  const names = (await readdir(migrationsDirectory)).filter((name) => /^\d+_.*\.sql$/.test(name)).sort();
  const annualIndex = names.indexOf(annualPredecessor);
  const hashIndex = names.indexOf(hashPredecessor);
  assert.ok(annualIndex >= 0 && hashIndex > annualIndex);
  for (const name of names.slice(0, annualIndex + 1)) {
    sqlFile(cluster, database, path.join(migrationsDirectory, name));
    if (name === providerInventoryV4) {
      sql(cluster, database, `
        insert into scoring_authority.tournaments(
          tournament_id,tournament_year,name,source_workbook_id,scoring_authority
        ) values ('2026',2026,'Awards fixture','${workbook}','GOOGLE');
        insert into scoring_authority.ingress_gates(
          tournament_id,state,authority,active_epoch_id,
          unresolved_client_queues,updated_by
        ) values ('2026','PAUSED','GOOGLE',null,0,'awards-fixture');
      `);
    }
  }
  installAnnualFixture(cluster, database);
  for (const name of names.slice(annualIndex + 1, hashIndex + 1)) {
    sqlFile(cluster, database, path.join(migrationsDirectory, name));
  }
  seedActorAndRoster(cluster, database);

  const before = sql(cluster, database, `select concat_ws('|',
    (select count(*) from scoring_authority.tournament_players where tournament_id='2026'),
    (select count(*) from scoring_authority.teams where tournament_id='2026'),
    (select count(*) from scoring_authority.matches where tournament_id='2026'),
    (select count(*) from scoring_authority.hole_scores),
    (select tournament_id from production_control.current_tournament_pointer_v1 where scope_key='BAGGER_INV_PRODUCTION'))`);
  sqlFile(cluster, database, path.join(migrationsDirectory, migration089));
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select count(*) from scoring_authority.tournament_players where tournament_id='2026'),
    (select count(*) from scoring_authority.teams where tournament_id='2026'),
    (select count(*) from scoring_authority.matches where tournament_id='2026'),
    (select count(*) from scoring_authority.hole_scores),
    (select tournament_id from production_control.current_tournament_pointer_v1 where scope_key='BAGGER_INV_PRODUCTION'))`), before);
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select count(*) from production_control.tournament_award_revisions_v1),
    (select count(*) from production_control.tournament_award_items_v1),
    (select count(*) from production_control.tournament_awards_current_v1),
    (select count(*) from production_control.tournament_award_operation_receipts_v1),
    (select count(*) from production_control.tournament_award_audit_events_v1))`), "0|0|0|0|0");

  const emptyInput = {
    ...actorScope(), operation: "READ_PRODUCTION_TOURNAMENT_AWARDS_V1",
  };
  assert.throws(
    () => rpcWithClaims(cluster, database, "read_production_tournament_awards_v1", emptyInput),
    /PRODUCTION_TOURNAMENT_AWARDS_SCOPE_REQUIRED/,
  );

  const awardsBeforePatch = sql(cluster, database, `select concat_ws('|',
    (select count(*) from production_control.tournament_award_revisions_v1),
    (select count(*) from production_control.tournament_award_items_v1),
    (select count(*) from production_control.tournament_awards_current_v1),
    (select count(*) from production_control.tournament_award_operation_receipts_v1),
    (select count(*) from production_control.tournament_award_audit_events_v1))`);
  sqlFile(cluster, database, path.join(migrationsDirectory, migration090));
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select count(*) from production_control.tournament_award_revisions_v1),
    (select count(*) from production_control.tournament_award_items_v1),
    (select count(*) from production_control.tournament_awards_current_v1),
    (select count(*) from production_control.tournament_award_operation_receipts_v1),
    (select count(*) from production_control.tournament_award_audit_events_v1))`), awardsBeforePatch);

  const read = rpcWithClaims(
    cluster,
    database,
    "read_production_tournament_awards_v1",
    emptyInput,
  );
  assert.equal(read.revision, 0);
  assert.deepEqual(read.awards, []);
  assert.equal(read.roster.length, 24);
  assert.equal(new Set(read.roster.map((player) => player.playerId)).size, 24);
  assert.equal(read.teams.length, 2);
  assert.deepEqual(read.teams.map((team) => team.teamId), ["TEAM-1", "TEAM-2"]);

  const invalidMutation = {
    ...actorScope(),
    operation: "SAVE_PRODUCTION_TOURNAMENT_AWARDS_V1",
    operation_request_id: "89000000-0000-4000-8000-000000000100",
    expected_revision: 0,
    request_payload_hash: "a".repeat(64),
    awards: [{
      award_id: "89000000-0000-4000-8000-000000000099",
      title: "",
      display_order: 1,
      recipient_kind: "UNAVAILABLE",
      publication_state: "DRAFT",
    }],
  };
  assert.throws(
    () => rpcWithClaims(cluster, database, "save_production_tournament_awards_v1", invalidMutation),
    /TOURNAMENT_AWARDS_UNSAFE_CONTENT/,
  );

  const pendingId = "89000000-0000-4000-8000-000000000001";
  const playerId = "89000000-0000-4000-8000-000000000002";
  const firstRequest = "89000000-0000-4000-8000-000000000101";
  const firstAwards = [
    { awardId: pendingId, title: "Tournament MVP", displayOrder: 1, recipientKind: "UNAVAILABLE", publicationState: "DRAFT" },
    { awardId: playerId, title: "Sandbagger of the Year", displayOrder: 2, recipientKind: "PLAYER", winnerPlayerId: "P02", publicationState: "PUBLISHED" },
  ];
  const saved = rpcWithClaims(cluster, database, "save_production_tournament_awards_v1", saveInput({ awards: firstAwards, expectedRevision: 0, requestId: firstRequest }));
  assert.equal(saved.revision, 1);
  assert.equal(saved.itemCount, 2);
  assert.equal(saved.publishedCount, 1);
  const retry = rpcWithClaims(cluster, database, "save_production_tournament_awards_v1", saveInput({ awards: firstAwards, expectedRevision: 0, requestId: firstRequest }));
  assert.equal(retry.idempotent, true);
  assert.equal(retry.revision, 1);
  assert.equal(sql(cluster, database, "select count(*) from production_control.tournament_award_audit_events_v1"), "1");

  assert.throws(() => rpcWithClaims(cluster, database, "save_production_tournament_awards_v1", saveInput({ awards: firstAwards, expectedRevision: 0, requestId: "89000000-0000-4000-8000-000000000102" })), /TOURNAMENT_AWARDS_REVISION_STALE/);
  assert.throws(() => rpcWithClaims(cluster, database, "save_production_tournament_awards_v1", saveInput({ awards: [{ ...firstAwards[0], title: "Different" }, firstAwards[1]], expectedRevision: 0, requestId: firstRequest })), /TOURNAMENT_AWARDS_OPERATION_REQUEST_CONFLICT/);
  assert.throws(() => rpcWithClaims(cluster, database, "save_production_tournament_awards_v1", saveInput({ awards: [firstAwards[0]], expectedRevision: 1, requestId: "89000000-0000-4000-8000-000000000103" })), /TOURNAMENT_AWARDS_PUBLISHED_REMOVAL_INVALID/);

  const secondAwards = [
    firstAwards[0],
    { ...firstAwards[1], publicationState: "RETIRED" },
    { awardId: "89000000-0000-4000-8000-000000000003", title: "Team Award", displayOrder: 3, recipientKind: "TEAM", winnerTeamId: "TEAM-1", publicationState: "PUBLISHED" },
    { awardId: "89000000-0000-4000-8000-000000000004", title: "Recognition", displayOrder: 4, recipientKind: "TEXT", recipientDisplay: "Tournament volunteers", publicationState: "PUBLISHED" },
  ];
  const second = rpcWithClaims(cluster, database, "save_production_tournament_awards_v1", saveInput({ awards: secondAwards, expectedRevision: 1, requestId: "89000000-0000-4000-8000-000000000104" }));
  assert.equal(second.revision, 2);
  const after = rpcWithClaims(cluster, database, "read_production_tournament_awards_v1", {
    ...actorScope(), operation: "READ_PRODUCTION_TOURNAMENT_AWARDS_V1",
  });
  assert.equal(after.revision, 2);
  assert.equal(after.history.length, 2);
  assert.equal(after.public.awards.length, 2);
  assert.deepEqual(after.public.awards.map((award) => award.recipientKind), ["TEAM", "TEXT"]);
  assert.equal(JSON.parse(sql(cluster, database, "select production_control.tournament_awards_archive_projection_v1('2026')::text")).length, 2);
  assert.equal(sql(cluster, database, `select concat_ws('|',
    has_function_privilege('service_role','public.read_production_tournament_awards_v1(jsonb)','EXECUTE'),
    has_function_privilege('authenticated','public.read_production_tournament_awards_v1(jsonb)','EXECUTE'),
    has_function_privilege('anon','public.save_production_tournament_awards_v1(jsonb)','EXECUTE'),
    has_function_privilege('service_role','production_control.tournament_awards_public_projection_v1(text)','EXECUTE'),
    has_function_privilege('service_role','production_control.assert_tournament_awards_runtime_v1(jsonb)','EXECUTE'),
    has_table_privilege('authenticated','production_control.tournament_award_items_v1','SELECT'),
    has_table_privilege('service_role','production_control.tournament_award_items_v1','INSERT'))`), "t|f|f|f|f|f|f");
  assert.throws(
    () => rpcWithClaims(cluster, database, "read_production_tournament_awards_v1", emptyInput, {
      claimsRole: "authenticated", databaseRole: "authenticated",
    }),
    /permission denied for function read_production_tournament_awards_v1/,
  );
  assert.throws(
    () => rpcWithClaims(cluster, database, "read_production_tournament_awards_v1", emptyInput, {
      claimsRole: "anon", databaseRole: "anon",
    }),
    /permission denied for function read_production_tournament_awards_v1/,
  );
});
