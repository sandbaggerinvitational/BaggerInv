import assert from "node:assert/strict";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrations = path.join(root, "supabase", "production_migrations");
const migration091 = "202609050091_production_ghin_hybrid_foundation_v1.sql";
const annualPredecessor = "202608300068_production_future_participant_identity_runtime_v1.sql";
const hashPredecessor = "202608310080_production_prediction_settings_authoring_v1.sql";
const providerInventory = "202608260038_production_provider_preview_target_inventory_v4.sql";
const pgBin = "/opt/homebrew/opt/postgresql@17/bin";
const bin = Object.fromEntries(["createdb", "initdb", "pg_ctl", "psql"].map((name) => [name, path.join(pgBin, name)]));
const workbook = "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4";
const projectRef = "ymqhhtxaywtqllynrmxe";
const projectUrl = `https://${projectRef}.supabase.co`;
const actorAuth = "00000000-0000-4000-8000-000000000001";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0) throw new Error([command, result.stdout, result.stderr].filter(Boolean).join("\n"));
  return result.stdout.trim();
}

function environment(cluster, claims = false) {
  return {
    ...process.env, PGHOST: cluster.socket, PGPORT: String(cluster.port), PGUSER: "postgres",
    PGOPTIONS: claims ? '-c request.jwt.claims={"role":"service_role"}' : "-c request.jwt.claim.role=service_role",
  };
}

function sql(cluster, database, input, { claims = false, role = null } = {}) {
  return run(bin.psql, ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", database], {
    env: environment(cluster, claims), input: role ? `set role ${role};\n${input}` : input,
  });
}

function sqlFile(cluster, database, filename) {
  return run(bin.psql, ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", database, "-f", filename], { env: environment(cluster) });
}

const json = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
function rpc(cluster, database, name, input) {
  return JSON.parse(sql(cluster, database, `select public.${name}(${json(input)})::text`, { claims: true, role: "service_role" }));
}

function scope(operation) {
  return {
    contract_version: "production-handicap-source-v1", environment: "PRODUCTION",
    project_ref: projectRef, project_url: projectUrl, source_workbook_id: workbook,
    tournament_id: "2026", actor_player_id: "P01", actor_auth_user_id: actorAuth,
    authorization: { tournament_id: "2026", auth_user_id: actorAuth, player_id: "P01", role: "DIRECTOR" },
    operation,
  };
}

async function available() {
  try { await Promise.all(Object.values(bin).map((value) => access(value, fsConstants.X_OK))); return true; }
  catch { return false; }
}

async function createCluster() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "bagger-ghin-pg-"));
  const data = path.join(directory, "data"); const socket = path.join(directory, "socket"); const log = path.join(directory, "postgres.log");
  await mkdir(socket, { mode: 0o700 });
  run(bin.initdb, ["-D", data, "--username=postgres", "--auth=trust", "--no-locale", "--encoding=UTF8", "--set=shared_memory_type=mmap", "--set=dynamic_shared_memory_type=mmap"]);
  const port = 59700 + (process.pid % 180);
  run(bin.pg_ctl, ["-D", data, "-l", log, "-o", `-F -k ${socket} -h '' -p ${port}`, "-w", "start"]);
  return { directory, data, socket, log, port, started: true };
}

async function destroyCluster(cluster) {
  if (cluster?.started) run(bin.pg_ctl, ["-D", cluster.data, "-m", "fast", "-w", "stop"]);
  if (cluster?.directory) { assert.match(path.basename(cluster.directory), /^bagger-ghin-pg-/); await rm(cluster.directory, { recursive: true, force: true }); }
}

function compatibility(cluster, database) {
  sql(cluster, database, `
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth;
    create table auth.users(id uuid primary key,email text,phone text,phone_change text,email_confirmed_at timestamptz,phone_confirmed_at timestamptz,confirmation_sent_at timestamptz,raw_app_meta_data jsonb default '{}',raw_user_meta_data jsonb default '{}',created_at timestamptz default now(),updated_at timestamptz default now());
    create table auth.identities(id uuid primary key,user_id uuid not null references auth.users(id),provider text not null,identity_data jsonb default '{}',created_at timestamptz default now(),updated_at timestamptz default now());
    create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),current_user) $$;
    create function public.rls_auto_enable() returns void language plpgsql as $$ begin end $$;
  `);
}

function annualFixture(cluster, database) {
  sql(cluster, database, `
    set session_replication_role=replica;
    insert into production_control.maintenance_deployment_capability_bindings(capability_binding_id,rebind_id,boundary_mode,contract_version,capability_ceiling,tournament_id,epoch_id,deployment_id,deployment_commit,capability_manifest,capability_fingerprint,runtime_observed_at,request_fingerprint,payload_hash,actor_id,response_value)
    select '71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002','MAINTENANCE_WINDOW_V1','production-maintenance-single-deployment-capability-v1','OBSERVATION','2026',value.authority_generation_id,'dpl_GhinFixture',repeat('7',40),'{}',repeat('7',64),clock_timestamp(),repeat('8',64),repeat('9',64),'ghin-fixture','{}' from production_control.cutover_activation_state value where value.scope_key='BAGGER_INV_PRODUCTION';
    set session_replication_role=origin;
  `);
}

function seed(cluster, database) {
  const players = Array.from({ length: 24 }, (_, index) => {
    const id = `P${String(index + 1).padStart(2, "0")}`;
    return `('${id}','${index === 0 ? "Director One" : `Player ${index + 1}`}','{}')`;
  }).join(",");
  const roster = Array.from({ length: 24 }, (_, index) => {
    const id = `P${String(index + 1).padStart(2, "0")}`; const side = index < 12 ? 1 : 2;
    return `('2026','${id}','TEAM-${side}',${side},'ACTIVE','${id}','{}')`;
  }).join(",");
  const entries = Array.from({ length: 24 }, (_, index) => {
    const id = `P${String(index + 1).padStart(2, "0")}`;
    return `('60000000-0000-4000-8000-000000000006','2026','${id}',6,6,5,'{}')`;
  }).join(",");
  sql(cluster, database, `
    insert into scoring_authority.players(player_id,display_name,source_payload) values ${players};
    insert into scoring_authority.teams(tournament_id,team_id,team_side,name,source_payload) values('2026','TEAM-1',1,'Team One','{}'),('2026','TEAM-2',2,'Team Two','{}');
    insert into auth.users(id,email,email_confirmed_at) values('${actorAuth}','director@example.org',clock_timestamp());
    insert into scoring_authority.tournament_players(tournament_id,player_id,team_id,team_side,participation_status,source_roster_key,source_payload) values ${roster};
    insert into participant_identity.user_player_links(auth_user_id,player_id,status,link_revision,link_method,email_identity_hash,linked_at,linked_by) values('${actorAuth}','P01','ACTIVE',1,'APPROVED_EMAIL_OTP',encode(extensions.digest('director@example.org','sha256'),'hex'),clock_timestamp(),'ghin-fixture');
    insert into participant_identity.participant_auth_identifiers(player_id,auth_user_id,identifier_type,normalized_value_private,status,verified_at,verification_source,revision,source_system,source_tournament_id,source_configuration_revision,created_by,updated_by) values('P01','${actorAuth}','EMAIL','director@example.org','VERIFIED',clock_timestamp(),'OTP',1,'SUPABASE','2026',1,'ghin-fixture','ghin-fixture');
    insert into participant_identity.tournament_roles(tournament_id,auth_user_id,role,role_active,granted_by) values('2026','${actorAuth}','DIRECTOR',true,'ghin-fixture');
    insert into production_control.director_entitlements(entitlement_id,auth_user_id,tournament_id,player_id,role,status,granted_by,granted_at) values('00000000-0000-4000-8000-000000000002','${actorAuth}','2026','P01','DIRECTOR','ACTIVE','ghin-fixture',clock_timestamp());
    insert into scoring_authority.handicap_revisions(revision_id,tournament_id,revision_number,status,effective_date,method,source_metadata,canonical_fingerprint,roster_fingerprint,predecessor_revision,predecessor_revision_id,context_contract_version,created_by,created_by_auth_user_id,approved_by,approved_by_auth_user_id,approved_at)
    values('60000000-0000-4000-8000-000000000006','2026',6,'APPROVED','2026-09-01','DIRECTOR_WEEKLY_HANDICAP_REVIEW','{}',repeat('6',64),production_control.handicap_v1_roster_fingerprint('2026'),0,null,'production-handicap-context-v1','P01','${actorAuth}','P01','${actorAuth}',clock_timestamp());
    insert into scoring_authority.handicap_revision_entries(revision_id,tournament_id,player_id,tournament_handicap,source_index,low_index,source_metadata) values ${entries};
    insert into scoring_authority.handicap_revision_current(tournament_id,revision_id,revision_number) values('2026','60000000-0000-4000-8000-000000000006',6);
    update scoring_authority.tournament_players set tournament_handicap=6,handicap_revision_id='60000000-0000-4000-8000-000000000006' where tournament_id='2026';
  `);
}

test("Phase 2A PostgreSQL contract is inert, private, append-only, idempotent, and draft-only", async (t) => {
  if (!(await available())) return t.skip("PostgreSQL 17 binaries unavailable");
  const cluster = await createCluster(); t.after(() => destroyCluster(cluster));
  const database = "production_ghin_phase_2a";
  run(bin.createdb, [database], { env: { ...environment(cluster), PGOPTIONS: "" } }); compatibility(cluster, database);
  const names = (await readdir(migrations)).filter((name) => /^\d+_.*\.sql$/.test(name)).sort();
  const annualIndex = names.indexOf(annualPredecessor); const hashIndex = names.indexOf(hashPredecessor);
  assert.ok(annualIndex >= 0 && hashIndex > annualIndex);
  for (const name of names.slice(0, annualIndex + 1)) {
    sqlFile(cluster, database, path.join(migrations, name));
    if (name === providerInventory) sql(cluster, database, `insert into scoring_authority.tournaments(tournament_id,tournament_year,name,source_workbook_id,scoring_authority) values('2026',2026,'GHIN fixture','${workbook}','GOOGLE'); insert into scoring_authority.ingress_gates(tournament_id,state,authority,active_epoch_id,unresolved_client_queues,updated_by) values('2026','PAUSED','GOOGLE',null,0,'ghin-fixture');`);
  }
  annualFixture(cluster, database);
  for (const name of names.slice(annualIndex + 1, hashIndex + 1)) sqlFile(cluster, database, path.join(migrations, name));
  seed(cluster, database);
  const before = sql(cluster, database, "select concat_ws('|',(select revision_number from scoring_authority.handicap_revision_current where tournament_id='2026'),(select count(*) from scoring_authority.handicap_revisions),(select count(*) from scoring_authority.match_participants),(select count(*) from scoring_authority.hole_scores))");
  sqlFile(cluster, database, path.join(migrations, migration091));
  assert.equal(sql(cluster, database, "select concat_ws('|',(select revision_number from scoring_authority.handicap_revision_current where tournament_id='2026'),(select count(*) from scoring_authority.handicap_revisions),(select count(*) from scoring_authority.match_participants),(select count(*) from scoring_authority.hole_scores))"), before);
  assert.equal(sql(cluster, database, "select concat_ws('|',(select count(*) from production_control.player_external_identities_v1),(select count(*) from production_control.handicap_source_observations_v1),(select count(*) from production_control.handicap_source_current_v1),(select count(*) from production_control.handicap_source_operation_receipts_v1),(select count(*) from production_control.handicap_source_audit_events_v1))"), "0|0|0|0|0");
  assert.equal(sql(cluster, database, "select concat_ws('|',production_control.hybrid_handicap_v1(12.2,10.8),production_control.hybrid_handicap_v1(10.1,10.0),production_control.hybrid_handicap_v1(-0.1,0),production_control.hybrid_handicap_v1(-0.8,-1.0),production_control.hybrid_handicap_v1(-0.8,0.6))"), "11.5|10.1|-0.1|-0.9|-0.1");

  const initial = rpc(cluster, database, "read_production_handicap_source_v1", scope("READ_PRODUCTION_HANDICAP_SOURCE_V1"));
  assert.equal(initial.rosterCount, 24); assert.equal(initial.coverageCount, 0); assert.equal(initial.complete, false);
  assert.equal(initial.autoRefresh, "DISABLED_AWAITING_PROVIDER_AUTHORIZATION");
  const setRequest = "91000000-0000-4000-8000-000000000001";
  const setInput = { ...scope("SET_PRODUCTION_PLAYER_GHIN_IDENTITY_V1"), operation_request_id: setRequest, request_payload_hash: "a".repeat(64), player_id: "P01", external_identifier: "1234567", expected_identity_id: null, replace_confirmed: false };
  const identity = rpc(cluster, database, "set_production_player_ghin_identity_v1", setInput);
  assert.equal(identity.code, "PRODUCTION_GHIN_IDENTITY_VERIFIED"); assert.equal(identity.maskedGhinNumber, "••••4567");
  assert.equal(rpc(cluster, database, "set_production_player_ghin_identity_v1", setInput).idempotent, true);
  assert.throws(() => rpc(cluster, database, "set_production_player_ghin_identity_v1", { ...setInput, external_identifier: "7654321" }), /PRODUCTION_HANDICAP_SOURCE_IDEMPOTENCY_CONFLICT/);

  const observationInput = { ...scope("RECORD_PRODUCTION_MANUAL_HANDICAP_SOURCE_V1"), operation_request_id: "91000000-0000-4000-8000-000000000002", request_payload_hash: "b".repeat(64), player_id: "P01", expected_identity_id: identity.identityId, expected_pointer_revision: 0, current_index: "-0.8", low_index: "0.6", low_index_date: "2026-09-05", provenance: "DIRECTOR_MANUAL" };
  const observation = rpc(cluster, database, "record_production_manual_handicap_source_v1", observationInput);
  assert.equal(observation.hybrid, "-0.1"); assert.equal(observation.pointerRevision, 1);
  assert.equal(rpc(cluster, database, "record_production_manual_handicap_source_v1", observationInput).idempotent, true);
  assert.throws(() => sql(cluster, database, `update production_control.handicap_source_observations_v1 set current_index=0 where observation_id='${observation.observationId}'`), /PRODUCTION_HANDICAP_SOURCE_IMMUTABLE/);
  assert.throws(() => sql(cluster, database, "select * from production_control.handicap_source_observations_v1", { role: "authenticated" }), /permission denied/);
  const afterOne = rpc(cluster, database, "read_production_handicap_source_v1", scope("READ_PRODUCTION_HANDICAP_SOURCE_V1"));
  assert.equal(afterOne.coverageCount, 1); assert.equal(afterOne.players[0].maskedGhinNumber.includes("1234567"), false);
  assert.throws(() => rpc(cluster, database, "set_production_player_ghin_identity_v1", { ...scope("SET_PRODUCTION_PLAYER_GHIN_IDENTITY_V1"), operation_request_id: "91000000-0000-4000-8000-000000000003", request_payload_hash: "f".repeat(64), player_id: "P02", external_identifier: "1234567", expected_identity_id: null, replace_confirmed: false }), /PRODUCTION_GHIN_IDENTITY_ALREADY_ASSIGNED/);
  const retired = rpc(cluster, database, "retire_production_player_ghin_identity_v1", { ...scope("RETIRE_PRODUCTION_PLAYER_GHIN_IDENTITY_V1"), operation_request_id: "91000000-0000-4000-8000-000000000004", request_payload_hash: "1".repeat(64), player_id: "P01", expected_identity_id: identity.identityId, retirement_confirmed: true });
  assert.equal(retired.code, "PRODUCTION_GHIN_IDENTITY_RETIRED");
  assert.equal(sql(cluster, database, "select concat_ws('|',(select count(*) from production_control.handicap_source_observations_v1 where player_id='P01'),(select count(*) from production_control.handicap_source_current_v1 where player_id='P01'))"), "1|0");
  const replacementP02 = rpc(cluster, database, "set_production_player_ghin_identity_v1", { ...scope("SET_PRODUCTION_PLAYER_GHIN_IDENTITY_V1"), operation_request_id: "91000000-0000-4000-8000-000000000005", request_payload_hash: "2".repeat(64), player_id: "P02", external_identifier: "1234567", expected_identity_id: null, replace_confirmed: false });
  rpc(cluster, database, "record_production_manual_handicap_source_v1", { ...scope("RECORD_PRODUCTION_MANUAL_HANDICAP_SOURCE_V1"), operation_request_id: "91000000-0000-4000-8000-000000000006", request_payload_hash: "3".repeat(64), player_id: "P02", expected_identity_id: replacementP02.identityId, expected_pointer_revision: 0, current_index: "8.2", low_index: "6.2", low_index_date: "2026-09-05", provenance: "DIRECTOR_MANUAL" });
  const replacementP01 = rpc(cluster, database, "set_production_player_ghin_identity_v1", { ...scope("SET_PRODUCTION_PLAYER_GHIN_IDENTITY_V1"), operation_request_id: "91000000-0000-4000-8000-000000000007", request_payload_hash: "4".repeat(64), player_id: "P01", external_identifier: "7654321", expected_identity_id: null, replace_confirmed: false });
  rpc(cluster, database, "record_production_manual_handicap_source_v1", { ...scope("RECORD_PRODUCTION_MANUAL_HANDICAP_SOURCE_V1"), operation_request_id: "91000000-0000-4000-8000-000000000008", request_payload_hash: "5".repeat(64), player_id: "P01", expected_identity_id: replacementP01.identityId, expected_pointer_revision: 0, current_index: "8.1", low_index: "6.1", low_index_date: "2026-09-05", provenance: "DIRECTOR_MANUAL" });

  for (let number = 3; number <= 24; number += 1) {
    const player = `P${String(number).padStart(2, "0")}`;
    const identityResult = rpc(cluster, database, "set_production_player_ghin_identity_v1", { ...scope("SET_PRODUCTION_PLAYER_GHIN_IDENTITY_V1"), operation_request_id: `91000000-0000-4000-8000-${String(number * 2 + 101).padStart(12, "0")}`, request_payload_hash: "c".repeat(64), player_id: player, external_identifier: String(2000000 + number), expected_identity_id: null, replace_confirmed: false });
    rpc(cluster, database, "record_production_manual_handicap_source_v1", { ...scope("RECORD_PRODUCTION_MANUAL_HANDICAP_SOURCE_V1"), operation_request_id: `91000000-0000-4000-8000-${String(number * 2 + 102).padStart(12, "0")}`, request_payload_hash: "d".repeat(64), player_id: player, expected_identity_id: identityResult.identityId, expected_pointer_revision: 0, current_index: String(8 + number / 10), low_index: String(6 + number / 10), low_index_date: "2026-09-05", provenance: "DIRECTOR_MANUAL" });
  }
  sql(cluster, database, "update production_control.handicap_source_current_v1 set source_status='STALE' where tournament_id='2026' and player_id='P24' and provider='GHIN'");
  const stale = rpc(cluster, database, "read_production_handicap_source_v1", scope("READ_PRODUCTION_HANDICAP_SOURCE_V1"));
  assert.equal(stale.coverageCount, 23); assert.equal(stale.complete, false);
  assert.equal(stale.players.find((player) => player.playerId === "P24").sourceState, "STALE");
  assert.throws(() => rpc(cluster, database, "stage_production_handicap_revision_from_hybrid_v1", {
    ...scope("STAGE_PRODUCTION_HANDICAP_REVISION_FROM_HYBRID_V1"), operation_request_id: "91000000-0000-4000-8000-000000000098",
    request_payload_hash: "8".repeat(64), expected_predecessor_revision: 6,
    expected_source_fingerprint: stale.sourceFingerprint, effective_date: "2026-09-06",
    entries: stale.players.map((player) => ({ player_id: player.playerId, tournament_handicap: player.hybrid })),
  }), /PRODUCTION_HANDICAP_SOURCE_INCOMPLETE_ROSTER/);
  sql(cluster, database, "update production_control.handicap_source_current_v1 set source_status='CURRENT' where tournament_id='2026' and player_id='P24' and provider='GHIN'");
  const complete = rpc(cluster, database, "read_production_handicap_source_v1", scope("READ_PRODUCTION_HANDICAP_SOURCE_V1"));
  assert.equal(complete.coverageCount, 24); assert.equal(complete.complete, true);
  sql(cluster, database, `
    update scoring_authority.tournaments set scoring_authority='SUPABASE' where tournament_id='2026';
    update production_control.cutover_activation_state set state='SCORING_COMMITTED',current_authority='SUPABASE',scoring_ingress_enabled=true,read_cutover_phase='OBSERVATION',maintenance_state='NORMAL',active_transition_epoch_id=null where scope_key='BAGGER_INV_PRODUCTION';
    update production_control.resource_scope set current_tournament_read_authority='SUPABASE',scoring_authority='SUPABASE',participant_identity_authority='SUPABASE',scoring_ingress_enabled=true,workers_enabled=true where scope_key='BAGGER_INV_PRODUCTION';
    set session_replication_role=replica;
    update scoring_authority.ingress_gates gate set state='OPEN',authority='SUPABASE',active_epoch_id=activation.authority_generation_id,unresolved_client_queues=0 from production_control.cutover_activation_state activation where gate.tournament_id='2026' and activation.scope_key='BAGGER_INV_PRODUCTION';
    set session_replication_role=origin;
  `);
  const entries = complete.players.map((player) => ({ player_id: player.playerId, tournament_handicap: player.hybrid }));
  const stageInput = { ...scope("STAGE_PRODUCTION_HANDICAP_REVISION_FROM_HYBRID_V1"), operation_request_id: "91000000-0000-4000-8000-000000000099", request_payload_hash: "e".repeat(64), expected_predecessor_revision: 6, expected_source_fingerprint: complete.sourceFingerprint, effective_date: "2026-09-06", entries };
  const staged = rpc(cluster, database, "stage_production_handicap_revision_from_hybrid_v1", stageInput);
  assert.equal(staged.code, "PRODUCTION_HYBRID_HANDICAP_DRAFT_STAGED"); assert.equal(staged.status, "DRAFT"); assert.equal(staged.autoApproved, false);
  assert.equal(sql(cluster, database, "select status from scoring_authority.handicap_revisions where revision_id='" + staged.revision_id + "'"), "DRAFT");
  assert.equal(sql(cluster, database, "select revision_number from scoring_authority.handicap_revision_current where tournament_id='2026'"), "6");
  assert.equal(sql(cluster, database, `select count(*) from scoring_authority.handicap_revision_entries where revision_id='${staged.revision_id}' and source_metadata->>'source'='HYBRID_HANDICAP' and source_metadata ? 'observation_id'`), "24");
  assert.equal(rpc(cluster, database, "stage_production_handicap_revision_from_hybrid_v1", stageInput).idempotent, true);
  assert.equal(sql(cluster, database, "select count(*) from scoring_authority.handicap_revisions where revision_number=7"), "1");
});
