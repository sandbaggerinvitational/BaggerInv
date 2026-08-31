import assert from "node:assert/strict";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = path.join(root, "supabase", "production_migrations");
const migration081 = "202608310081_production_draft_authoring_v1.sql";
const predecessor = "202608300068_production_future_participant_identity_runtime_v1.sql";
const providerInventoryV4 =
  "202608260038_production_provider_preview_target_inventory_v4.sql";
const pgBin = "/opt/homebrew/opt/postgresql@17/bin";
const bin = Object.fromEntries(["createdb", "initdb", "pg_ctl", "psql"]
  .map((name) => [name, path.join(pgBin, name)]));
const workbook = "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4";
const projectRef = "ymqhhtxaywtqllynrmxe";
const projectUrl = `https://${projectRef}.supabase.co`;
const actorAuth = "00000000-0000-4000-8000-000000000001";

function actorScope(target = "2026") {
  return {
    contract_version: "production-draft-authoring-v1",
    environment: "PRODUCTION", project_ref: projectRef,
    project_url: projectUrl, source_workbook_id: workbook,
    tournament_id: "2026", tournament_year: 2026,
    target_tournament_id: target, target_tournament_year: Number(target),
    authorization: {
      tournament_id: "2026", auth_user_id: actorAuth,
      player_id: "P01", role: "DIRECTOR",
    },
  };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...options,
  });
  if (result.error || result.status !== 0) {
    throw new Error([command, result.stdout, result.stderr]
      .filter(Boolean).join("\n"));
  }
  return result.stdout.trim();
}

function environment(cluster, jwtRole = "service_role") {
  return {
    ...process.env, PGHOST: cluster.socket, PGPORT: String(cluster.port),
    PGUSER: "postgres",
    PGOPTIONS: `-c request.jwt.claim.role=${jwtRole}`,
  };
}

function sql(cluster, database, input, jwtRole = "service_role") {
  return run(bin.psql, ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", database], {
    env: environment(cluster, jwtRole), input,
  });
}

function sqlFile(cluster, database, filename) {
  return run(bin.psql,
    ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", database, "-f", filename],
    { env: environment(cluster) });
}

function json(value) {
  return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
}

async function available() {
  try {
    await Promise.all(Object.values(bin).map((value) =>
      access(value, fsConstants.X_OK)));
    return true;
  } catch { return false; }
}

async function createCluster() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "bagger-draft-pg-"));
  const data = path.join(directory, "data");
  const socket = path.join(directory, "socket");
  const log = path.join(directory, "postgres.log");
  await mkdir(socket, { mode: 0o700 });
  run(bin.initdb, ["-D", data, "--username=postgres", "--auth=trust",
    "--no-locale", "--encoding=UTF8", "--set=shared_memory_type=mmap",
    "--set=dynamic_shared_memory_type=mmap"]);
  const port = 59100 + (process.pid % 200);
  run(bin.pg_ctl, ["-D", data, "-l", log, "-o",
    `-F -k ${socket} -h '' -p ${port}`, "-w", "start"]);
  return { directory, data, socket, log, port, started: true };
}

async function destroyCluster(cluster) {
  if (cluster?.started) run(bin.pg_ctl,
    ["-D", cluster.data, "-m", "fast", "-w", "stop"]);
  if (cluster?.directory) {
    assert.equal(path.dirname(cluster.directory), path.resolve(os.tmpdir()));
    assert.match(path.basename(cluster.directory), /^bagger-draft-pg-/);
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
      select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
        current_user)
    $$;
    create function public.rls_auto_enable()
      returns void language plpgsql as $$ begin end $$;
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
      '2026',value.authority_generation_id,'dpl_DraftFixture',repeat('7',40),
      '{}'::jsonb,repeat('7',64),clock_timestamp(),repeat('8',64),
      repeat('9',64),'step13e8b-fixture','{}'::jsonb
    from production_control.cutover_activation_state value
    where value.scope_key='BAGGER_INV_PRODUCTION';
    set session_replication_role=origin;
  `);
}

test("migration 081 parses, installs inertly, preserves 22 picks, and closes SQL grants", async (t) => {
  if (!(await available())) return t.skip("PostgreSQL 17 binaries unavailable");
  const cluster = await createCluster();
  t.after(() => destroyCluster(cluster));
  const database = "step13e8b_draft";
  run(bin.createdb, [database], { env: { ...environment(cluster), PGOPTIONS: "" } });
  installSupabaseCompatibility(cluster, database);
  const names = (await readdir(migrationsDirectory))
    .filter((name) => /^\d+_.*\.sql$/.test(name)).sort();
  const predecessorIndex = names.indexOf(predecessor);
  const migrationIndex = names.indexOf(migration081);
  assert.ok(predecessorIndex >= 0 && migrationIndex > predecessorIndex);
  for (const name of names.slice(0, predecessorIndex + 1)) {
    sqlFile(cluster, database, path.join(migrationsDirectory, name));
    if (name === providerInventoryV4) {
      sql(cluster, database, `
        insert into scoring_authority.tournaments(
          tournament_id,tournament_year,name,source_workbook_id,scoring_authority
        ) values ('2026',2026,'Draft fixture','${workbook}','GOOGLE');
        insert into scoring_authority.ingress_gates(
          tournament_id,state,authority,active_epoch_id,
          unresolved_client_queues,updated_by
        ) values ('2026','PAUSED','GOOGLE',null,0,'step13e8b');
      `);
    }
  }
  installAnnualFixture(cluster, database);
  for (const name of names.slice(predecessorIndex + 1, migrationIndex)) {
    sqlFile(cluster, database, path.join(migrationsDirectory, name));
  }

  sql(cluster, database, `
    insert into scoring_authority.teams(
      tournament_id,team_id,team_side,name,source_payload
    ) values ('2026','TEAM-1',1,'Team One','{}'),
      ('2026','TEAM-2',2,'Team Two','{}');
    insert into scoring_authority.players(player_id,display_name,source_payload)
    select 'P'||lpad(value::text,2,'0'),'Player '||value,
      jsonb_build_object('Photo Filename','P'||lpad(value::text,2,'0')||'.jpg')
    from generate_series(1,24) value;
    insert into scoring_authority.tournament_players(
      tournament_id,player_id,team_id,team_side,participation_status,
      source_roster_key,source_payload,tournament_handicap
    ) select '2026','P'||lpad(value::text,2,'0'),
      case when value%2=1 then 'TEAM-1' else 'TEAM-2' end,
      case when value%2=1 then 1 else 2 end,'ACTIVE',
      'P'||lpad(value::text,2,'0'),'{}'::jsonb,value::numeric
    from generate_series(1,24) value;
    begin;
    select set_config('scoring_authority.draft_projection_import','on',true);
    insert into scoring_authority.draft_revisions(
      revision_id,project_ref,source_workbook_id,source_tabs,tournament_id,
      tournament_year,revision_number,previous_revision_id,source_fingerprint,
      configuration_fingerprint,picks_fingerprint,payload_fingerprint,
      contract_version,validation_status,validation_diagnostics,
      source_settings,source_picks,configuration,presentation_seed,operation,
      correction_reason,synchronized_by,synchronized_at
    ) values (
      '81000000-0000-4000-8000-000000000001','${projectRef}','${workbook}',
      '["Draft Settings","Draft Picks"]','2026',2026,1,null,repeat('1',64),
      repeat('2',64),repeat('3',64),repeat('4',64),'draft-projection-v1',
      'VALID','{}','{}','[]',
      '{"year":2026,"name":"2026 Draft","date":"","time":"","time_zone":"America/Chicago","location":"","status_mode":"Complete","format":"Snake","total_picks":22,"team_1_id":"TEAM-1","team_2_id":"TEAM-2","team_1_captain_player_id":"P01","team_2_captain_player_id":"P02","first_pick_team_id":"TEAM-1","notes":""}',
      '{}','INITIAL_IMPORT',null,'Google synchronization','2026-01-01Z');
    insert into scoring_authority.draft_configuration_facts(
      revision_id,tournament_id,tournament_year,draft_name,draft_date,
      draft_time,time_zone,location,status_mode,draft_format,total_picks,
      team_1_id,team_2_id,team_1_captain_player_id,
      team_2_captain_player_id,first_pick_team_id,notes
    ) values ('81000000-0000-4000-8000-000000000001','2026',2026,
      '2026 Draft',null,null,'America/Chicago',null,'Complete','Snake',22,
      'TEAM-1','TEAM-2','P01','P02','TEAM-1',null);
    insert into scoring_authority.draft_pick_facts(
      revision_id,tournament_id,tournament_year,pick_number,round_number,
      pick_within_round,source_team_id,team_id,player_id,player_name_snapshot,
      selected_at_source,selected_by_source,pick_status,notes,
      presentation_snapshot
    ) select '81000000-0000-4000-8000-000000000001','2026',2026,value,
      ((value-1)/2)+1,mod(value-1,2)+1,
      case when value%2=1 then 'TEAM-1' else 'TEAM-2' end,
      case when value%2=1 then 'TEAM-1' else 'TEAM-2' end,
      'P'||lpad(value::text,2,'0'),'Player '||value,'2026-01-01Z',
      'Google','SELECTED',null,'{}'::jsonb
    from generate_series(1,22) value;
    insert into scoring_authority.draft_current_revisions(
      tournament_id,tournament_year,revision_id,advanced_by
    ) values ('2026',2026,'81000000-0000-4000-8000-000000000001','Google');
    commit;
  `);
  const before = sql(cluster, database, `select concat_ws('|',
    (select count(*) from scoring_authority.draft_revisions),
    (select count(*) from scoring_authority.draft_pick_facts),
    (select revision_id from scoring_authority.draft_current_revisions
      where tournament_id='2026'),
    (select status_mode from scoring_authority.draft_configuration_facts
      where revision_id='81000000-0000-4000-8000-000000000001'))`);
  sqlFile(cluster, database, path.join(migrationsDirectory, migration081));
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select count(*) from scoring_authority.draft_revisions),
    (select count(*) from scoring_authority.draft_pick_facts),
    (select revision_id from scoring_authority.draft_current_revisions
      where tournament_id='2026'),
    (select status_mode from scoring_authority.draft_configuration_facts
      where revision_id='81000000-0000-4000-8000-000000000001'))`), before);
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select count(*) from production_control.draft_authoring_drafts_v1),
    (select count(*) from production_control.draft_revision_provenance_v1),
    (select count(*) from production_control.draft_operation_receipts_v1),
    (select count(*) from production_control.draft_authoring_audit_events_v1),
    (select count(*) from production_control.future_annual_projection_bindings_v1
      where domain='DRAFT'))`), "0|0|0|0|0");
  assert.equal(sql(cluster, database, `select concat_ws('|',
    has_function_privilege('service_role',
      'public.stage_production_draft_revision_v1(jsonb)','EXECUTE'),
    has_function_privilege('authenticated',
      'public.stage_production_draft_revision_v1(jsonb)','EXECUTE'),
    has_function_privilege('anon',
      'public.read_production_draft_authoring_v1(jsonb)','EXECUTE'),
    has_table_privilege('service_role',
      'production_control.draft_authoring_drafts_v1','SELECT'))`),
  "t|f|f|f");
  sql(cluster, database, `
    insert into auth.users(id,email,email_confirmed_at)
    values ('${actorAuth}','director@example.org',clock_timestamp());
    insert into participant_identity.user_player_links(
      auth_user_id,player_id,status,link_revision,link_method,
      email_identity_hash,linked_at,linked_by
    ) values ('${actorAuth}','P01','ACTIVE',1,'APPROVED_EMAIL_OTP',
      encode(extensions.digest('director@example.org','sha256'),'hex'),
      clock_timestamp(),'step13e8b');
    insert into participant_identity.tournament_roles(
      tournament_id,auth_user_id,role,role_active,granted_by
    ) values ('2026','${actorAuth}','DIRECTOR',true,'step13e8b');
    insert into production_control.director_entitlements(
      entitlement_id,auth_user_id,tournament_id,player_id,role,status,
      granted_by,granted_at
    ) values ('00000000-0000-4000-8000-000000000002','${actorAuth}',
      '2026','P01','DIRECTOR','ACTIVE','step13e8b',clock_timestamp());
  `);
  const authoringRead = JSON.parse(sql(cluster, database,
    `select public.read_production_draft_authoring_v1(${json({
      ...actorScope(), operation: "READ_PRODUCTION_DRAFT_AUTHORING_V1",
      history_limit: 10,
    })})::text`));
  assert.equal(authoringRead.data.current.revision_number, 1);
  assert.equal(authoringRead.data.current.picks.length, 22);
  assert.equal(authoringRead.data.history[0].authoringAuthority,
    "GOOGLE_SYNCHRONIZATION");
  assert.equal(authoringRead.data.history[0].actorPlayerId, null);
  assert.equal(authoringRead.data.mutability.code, "DRAFT_CORRECTION_REQUIRED");
  assert.equal(authoringRead.data.dependencyReadiness.status, "READY");
  assert.equal(authoringRead.data.targets.length, 1);
  const blockedStage = JSON.parse(sql(cluster, database,
    `select public.stage_production_draft_revision_v1(${json({
      ...actorScope(), operation: "STAGE_PRODUCTION_DRAFT_REVISION_V1",
      operation_request_id: "82000000-0000-4000-8000-000000000001",
      request_payload_hash: "a".repeat(64), expected_revision: 1,
      reason: "Attempt ordinary edit of completed fixture",
      configuration: {}, picks: [],
    })})::text`));
  assert.equal(blockedStage.code, "DRAFT_CORRECTION_REQUIRED");
  assert.equal(sql(cluster, database,
    "select count(*) from production_control.draft_authoring_drafts_v1"), "0");

  sql(cluster, database, `
    set session_replication_role=replica;
    insert into scoring_authority.tournaments(
      tournament_id,tournament_year,name,source_workbook_id,scoring_authority
    ) values ('2027',2027,'2027 Draft fixture','${workbook}','SUPABASE');
    insert into production_control.future_tournament_catalog_v1(
      tournament_id,tournament_year,contract_version,tournament_name,
      lifecycle,lifecycle_revision,setup_revision,creation_mode,
      created_by_player_id,source_manifest
    ) values ('2027',2027,'production-future-year-administration-v1',
      '2027 Draft fixture','DRAFT',1,0,'BLANK','P01','{}');
    insert into production_control.future_tournament_resources_v1(
      tournament_id,project_ref,project_url,source_workbook_id,
      resource_status,resource_revision,google_compatibility_policy,
      updated_by_player_id
    ) values ('2027','${projectRef}','${projectUrl}','${workbook}',
      'CURRENT_RESOURCE_BOUND',1,'CURRENT_CERTIFIED','P01');
    insert into scoring_authority.teams(
      tournament_id,team_id,team_side,name,source_payload
    ) values ('2027','TEAM-1',1,'Team One','{}'),
      ('2027','TEAM-2',2,'Team Two','{}');
    insert into scoring_authority.tournament_players(
      tournament_id,player_id,team_id,team_side,participation_status,
      source_roster_key,source_payload,tournament_handicap
    ) select '2027','P'||lpad(value::text,2,'0'),
      case when value%2=1 then 'TEAM-1' else 'TEAM-2' end,
      case when value%2=1 then 1 else 2 end,'ACTIVE',
      'P'||lpad(value::text,2,'0'),'{}'::jsonb,value::numeric
    from generate_series(1,24) value;
    set session_replication_role=origin;
  `);
  const copyInput = {
    ...actorScope("2027"), operation: "COPY_PRODUCTION_DRAFT_SETUP_V1",
    operation_request_id: "82000000-0000-4000-8000-000000000002",
    request_payload_hash: "b".repeat(64), expected_revision: 0,
    source_tournament_id: "2026",
    reason: "Copy prior Draft setup for Director review",
  };
  const copied = JSON.parse(sql(cluster, database,
    `select public.copy_production_draft_setup_v1(${json(copyInput)})::text`));
  assert.equal(copied.ok, true);
  assert.equal(copied.madeCurrent, false);
  assert.equal(copied.configuration.status_mode, "Automatic");
  assert.equal(copied.picks.length, 22);
  assert.ok(copied.picks.every((pick) => pick.player_id === "" &&
    pick.selected_at === "" && pick.selected_by === ""));
  assert.equal(sql(cluster, database,
    "select count(*) from scoring_authority.draft_current_revisions where tournament_id='2027'"),
  "0");
  const copyRetry = JSON.parse(sql(cluster, database,
    `select public.copy_production_draft_setup_v1(${json(copyInput)})::text`));
  assert.equal(copyRetry.idempotent, true);
  const copyConflict = JSON.parse(sql(cluster, database,
    `select public.copy_production_draft_setup_v1(${json({
      ...copyInput, reason: "Different payload under the same operation key",
    })})::text`));
  assert.equal(copyConflict.code, "DRAFT_IDEMPOTENCY_CONFLICT");

  const validateInput = {
    ...actorScope("2027"), operation: "VALIDATE_PRODUCTION_DRAFT_REVISION_V1",
    operation_request_id: "82000000-0000-4000-8000-000000000003",
    request_payload_hash: "c".repeat(64), expected_revision: 0,
    draft_id: copied.draftId,
  };
  const validated = JSON.parse(sql(cluster, database,
    `select public.validate_production_draft_revision_v1(${json(validateInput)})::text`));
  assert.equal(validated.ok, true);
  const validateRetry = JSON.parse(sql(cluster, database,
    `select public.validate_production_draft_revision_v1(${json(validateInput)})::text`));
  assert.equal(validateRetry.idempotent, true);

  const commitInput = {
    ...actorScope("2027"), operation: "COMMIT_PRODUCTION_DRAFT_REVISION_V1",
    operation_request_id: "82000000-0000-4000-8000-000000000004",
    request_payload_hash: "d".repeat(64), expected_revision: 0,
    draft_id: copied.draftId, confirmation: "SAVE DRAFT REVISION",
  };
  const committed = JSON.parse(sql(cluster, database,
    `select public.commit_production_draft_revision_v1(${json(commitInput)})::text`));
  assert.equal(committed.ok, true);
  assert.equal(committed.revision, 1);
  assert.equal(committed.selectedPickCount, 0);
  const committedPresentation = JSON.parse(sql(cluster, database,
    `select presentation_seed::text from scoring_authority.draft_revisions
      where revision_id='${committed.revisionId}'`));
  assert.equal(Number(committedPresentation.teams[0].averageHandicap), 12);
  assert.equal(Number(committedPresentation.teams[1].averageHandicap), 13);
  assert.equal(committedPresentation.teams[0].captain.image,
    "/images/players/P01.webp");
  const commitRetry = JSON.parse(sql(cluster, database,
    `select public.commit_production_draft_revision_v1(${json(commitInput)})::text`));
  assert.equal(commitRetry.idempotent, true);
  const commitConflict = JSON.parse(sql(cluster, database,
    `select public.commit_production_draft_revision_v1(${json({
      ...commitInput, expected_revision: 1,
    })})::text`));
  assert.equal(commitConflict.code, "DRAFT_IDEMPOTENCY_CONFLICT");
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select authoring_authority from
      production_control.draft_revision_provenance_v1
      where revision_id='${committed.revisionId}'),
    (select authoring_authority from
      production_control.future_annual_projection_bindings_v1
      where tournament_id='2027' and domain='DRAFT'),
    (select tournament_id from production_control.current_tournament_pointer_v1
      where scope_key='BAGGER_INV_PRODUCTION'))`),
  "SUPABASE_DIRECTOR|SUPABASE_DIRECTOR|2026");
  const hiddenFuture = JSON.parse(sql(cluster, database,
    `select public.read_production_draft_view_v1(${json({
      environment: "PRODUCTION", project_ref: projectRef,
      project_url: projectUrl, source_workbook_id: workbook,
      contract_version: "draft-projection-v1",
      source_tabs: ["Draft Settings", "Draft Picks"], target_scope: "YEAR",
      target_year: 2027,
    })})::text`));
  assert.equal(hiddenFuture.data.drafts.length, 0);

  const invalidSchedule = JSON.parse(sql(cluster, database,
    `select public.stage_production_draft_revision_v1(${json({
      ...actorScope("2027"), operation: "STAGE_PRODUCTION_DRAFT_REVISION_V1",
      operation_request_id: "82000000-0000-4000-8000-000000000014",
      request_payload_hash: "8".repeat(64), expected_revision: 1,
      reason: "Exercise Draft schedule validation",
      configuration: { ...copied.configuration,
        date: "2/30/2027", time: "25:61", time_zone: "Not/A-Time-Zone" },
      picks: copied.picks,
    })})::text`));
  assert.equal(invalidSchedule.code, "DRAFT_VALIDATION_FAILED");
  for (const code of ["DRAFT_DATE_INVALID", "DRAFT_TIME_INVALID", "DRAFT_TIME_ZONE_INVALID"]) {
    assert.ok(invalidSchedule.issues.some((issue) => issue.code === code), code);
  }

  const invalidPicks = structuredClone(copied.picks);
  invalidPicks[0] = { ...invalidPicks[0], player_id: "P02" };
  const invalidStage = JSON.parse(sql(cluster, database,
    `select public.stage_production_draft_revision_v1(${json({
      ...actorScope("2027"), operation: "STAGE_PRODUCTION_DRAFT_REVISION_V1",
      operation_request_id: "82000000-0000-4000-8000-000000000005",
      request_payload_hash: "e".repeat(64), expected_revision: 1,
      reason: "Exercise canonical roster team validation",
      configuration: copied.configuration, picks: invalidPicks,
    })})::text`));
  assert.equal(invalidStage.code, "DRAFT_VALIDATION_FAILED");
  assert.ok(invalidStage.issues.some((issue) =>
    issue.code === "DRAFT_PLAYER_TEAM_INVALID"));
  assert.ok(invalidStage.issues.some((issue) =>
    issue.code === "DRAFT_CAPTAIN_PICK_PROHIBITED"));

  const selectedPicks = structuredClone(copied.picks);
  selectedPicks[0] = { ...selectedPicks[0], player_id: "P03",
    selected_at: "1999-01-01T00:00:00Z", selected_by: "FORGED-ACTOR" };
  const selectedStage = JSON.parse(sql(cluster, database,
    `select public.stage_production_draft_revision_v1(${json({
      ...actorScope("2027"), operation: "STAGE_PRODUCTION_DRAFT_REVISION_V1",
      operation_request_id: "82000000-0000-4000-8000-000000000006",
      request_payload_hash: "f".repeat(64), expected_revision: 1,
      reason: "Record one eligible pick through a full revision",
      configuration: copied.configuration, picks: selectedPicks,
    })})::text`));
  assert.equal(selectedStage.ok, true);
  assert.equal(selectedStage.picks[0].selected_at, "");
  assert.equal(selectedStage.picks[0].selected_by, "");
  const selectedValidate = JSON.parse(sql(cluster, database,
    `select public.validate_production_draft_revision_v1(${json({
      ...actorScope("2027"), operation: "VALIDATE_PRODUCTION_DRAFT_REVISION_V1",
      operation_request_id: "82000000-0000-4000-8000-000000000007",
      request_payload_hash: "1".repeat(64), expected_revision: 1,
      draft_id: selectedStage.draftId,
    })})::text`));
  assert.equal(selectedValidate.ok, true);
  const selectedCommit = JSON.parse(sql(cluster, database,
    `select public.commit_production_draft_revision_v1(${json({
      ...actorScope("2027"), operation: "COMMIT_PRODUCTION_DRAFT_REVISION_V1",
      operation_request_id: "82000000-0000-4000-8000-000000000008",
      request_payload_hash: "2".repeat(64), expected_revision: 1,
      draft_id: selectedStage.draftId, confirmation: "SAVE DRAFT REVISION",
    })})::text`));
  assert.equal(selectedCommit.revision, 2);
  assert.equal(sql(cluster, database, `select concat_ws('|',
    selected_by_source,selected_at_source<>'1999-01-01T00:00:00Z'
  ) from scoring_authority.draft_pick_facts
  where revision_id='${selectedCommit.revisionId}' and pick_number=1`),
  "P01|t");
  const staleStage = JSON.parse(sql(cluster, database,
    `select public.stage_production_draft_revision_v1(${json({
      ...actorScope("2027"), operation: "STAGE_PRODUCTION_DRAFT_REVISION_V1",
      operation_request_id: "82000000-0000-4000-8000-000000000009",
      request_payload_hash: "3".repeat(64), expected_revision: 1,
      reason: "Exercise stale predecessor protection",
      configuration: copied.configuration, picks: copied.picks,
    })})::text`));
  assert.equal(staleStage.code, "DRAFT_PREDECESSOR_STALE");
  const completedPicks = structuredClone(copied.picks);
  const completedPlayerIds = {
    "TEAM-1": ["P05", "P03", "P07", "P09", "P11", "P13", "P15", "P17", "P19", "P21", "P23"],
    "TEAM-2": ["P04", "P06", "P08", "P10", "P12", "P14", "P16", "P18", "P20", "P22", "P24"],
  };
  completedPicks.forEach((pick, index) => {
    pick.player_id = completedPlayerIds[pick.team_id].shift();
  });
  const completedStage = JSON.parse(sql(cluster, database,
    `select public.stage_production_draft_revision_v1(${json({
      ...actorScope("2027"), operation: "STAGE_PRODUCTION_DRAFT_REVISION_V1",
      operation_request_id: "82000000-0000-4000-8000-000000000010",
      request_payload_hash: "4".repeat(64), expected_revision: 2,
      reason: "Complete the isolated future Draft fixture",
      configuration: { ...copied.configuration, status_mode: "Live" },
      picks: completedPicks,
    })})::text`));
  assert.equal(completedStage.ok, true);
  const completedValidate = JSON.parse(sql(cluster, database,
    `select public.validate_production_draft_revision_v1(${json({
      ...actorScope("2027"), operation: "VALIDATE_PRODUCTION_DRAFT_REVISION_V1",
      operation_request_id: "82000000-0000-4000-8000-000000000011",
      request_payload_hash: "5".repeat(64), expected_revision: 2,
      draft_id: completedStage.draftId,
    })})::text`));
  assert.equal(completedValidate.ok, true);
  const completedCommit = JSON.parse(sql(cluster, database,
    `select public.commit_production_draft_revision_v1(${json({
      ...actorScope("2027"), operation: "COMMIT_PRODUCTION_DRAFT_REVISION_V1",
      operation_request_id: "82000000-0000-4000-8000-000000000012",
      request_payload_hash: "6".repeat(64), expected_revision: 2,
      draft_id: completedStage.draftId, confirmation: "SAVE DRAFT REVISION",
    })})::text`));
  assert.equal(completedCommit.revision, 3);
  assert.equal(completedCommit.selectedPickCount, 22);
  const frozenFuture = JSON.parse(sql(cluster, database,
    `select public.stage_production_draft_revision_v1(${json({
      ...actorScope("2027"), operation: "STAGE_PRODUCTION_DRAFT_REVISION_V1",
      operation_request_id: "82000000-0000-4000-8000-000000000013",
      request_payload_hash: "7".repeat(64), expected_revision: 3,
      reason: "Confirm completed Draft immutability",
      configuration: copied.configuration, picks: copied.picks,
    })})::text`));
  assert.equal(frozenFuture.code, "DRAFT_CORRECTION_REQUIRED");
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select count(*) from scoring_authority.draft_revisions
      where tournament_id='2026'),
    (select count(*) from scoring_authority.draft_pick_facts
      where tournament_id='2026'),
    (select revision_id from scoring_authority.draft_current_revisions
      where tournament_id='2026'),
    (select revision_number from scoring_authority.draft_revisions revision
      join scoring_authority.draft_current_revisions current_value
        on current_value.revision_id=revision.revision_id
      where current_value.tournament_id='2027'))`),
  "1|22|81000000-0000-4000-8000-000000000001|3");
  const auditTimeline = JSON.parse(sql(cluster, database,
    "select production_control.director_private_audit_with_draft_v1()::text"));
  const draftAudit = auditTimeline.filter((event) => event.category === "DRAFT");
  assert.ok(draftAudit.some((event) =>
    event.action === "PREVIOUS_SETUP_COPIED"));
  assert.ok(draftAudit.some((event) =>
    event.action === "REVISION_COMMITTED"));
  assert.ok(draftAudit.some((event) => event.action === "PICK_RECORDED"));
  assert.ok(draftAudit.some((event) => event.action === "PICK_CORRECTED"));
  assert.ok(draftAudit.some((event) => event.action === "DRAFT_COMPLETED"));
  assert.ok(draftAudit.every((event) => !/draftId|revisionId|request/i
    .test(JSON.stringify(event))));

  sql(cluster, database, `
    set session_replication_role=replica;
    update scoring_authority.tournament_players
    set participation_status='WITHDRAWN'
    where tournament_id='2027' and player_id='P03';
    set session_replication_role=origin;
  `);
  const conflictedRead = JSON.parse(sql(cluster, database,
    `select public.read_production_draft_authoring_v1(${json({
      ...actorScope("2027"), operation: "READ_PRODUCTION_DRAFT_AUTHORING_V1",
      history_limit: 10,
    })})::text`));
  assert.equal(conflictedRead.data.dependencyReadiness.status, "CONFLICT");
  assert.ok(conflictedRead.data.dependencyReadiness.issues.some((issue) =>
    issue.code === "DRAFT_SELECTED_PLAYER_INACTIVE_OR_MISSING" &&
    issue.count === 1));
  assert.equal(sql(cluster, database, `select count(*)
    from scoring_authority.draft_pick_facts
    where revision_id='${selectedCommit.revisionId}'
      and player_id='P03' and pick_status='SELECTED'`), "1");
  const retired = JSON.parse(sql(cluster, database,
    `select public.synchronize_production_director_projection(
      '{"domain":"DRAFT"}'::jsonb)::text`));
  assert.equal(retired.code, "DRAFT_GOOGLE_AUTHORING_RETIRED");
  const publicRead = JSON.parse(sql(cluster, database,
    `select public.read_production_draft_view_v1(${json({
      environment: "PRODUCTION", project_ref: projectRef,
      project_url: projectUrl, source_workbook_id: workbook,
      contract_version: "draft-projection-v1",
      source_tabs: ["Draft Settings", "Draft Picks"], target_scope: "CURRENT",
    })})::text`));
  assert.equal(publicRead.data.drafts.length, 1);
  assert.equal(publicRead.data.drafts[0].picks.length, 22);
  assert.equal(publicRead.data.drafts[0].authoring_authority,
    "GOOGLE_SYNCHRONIZATION");
  assert.equal(sql(cluster, database,
    `select production_control.draft_mutability_v1('2026')->>'code'`),
  "DRAFT_CORRECTION_REQUIRED");
});
