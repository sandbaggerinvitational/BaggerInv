import assert from "node:assert/strict";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { PRODUCTION_PREDICTION_SETTING_SPECS } from
  "../lib/production-prediction-settings-contract.js";
import { scoringShadowPayloadHash } from "../lib/scoring-shadow.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = path.join(root, "supabase", "production_migrations");
const migration080 = "202608310080_production_prediction_settings_authoring_v1.sql";
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
  const directory = await mkdtemp(path.join(os.tmpdir(), "bagger-prediction-pg-"));
  const data = path.join(directory, "data");
  const socket = path.join(directory, "socket");
  const log = path.join(directory, "postgres.log");
  await mkdir(socket, { mode: 0o700 });
  run(bin.initdb, ["-D", data, "--username=postgres", "--auth=trust", "--no-locale",
    "--encoding=UTF8", "--set=shared_memory_type=mmap",
    "--set=dynamic_shared_memory_type=mmap"]);
  const port = 58900 + (process.pid % 200);
  run(bin.pg_ctl, ["-D", data, "-l", log, "-o",
    `-F -k ${socket} -h '' -p ${port}`, "-w", "start"]);
  return { directory, data, socket, log, port, started: true };
}

async function destroyCluster(cluster) {
  if (cluster?.started) run(bin.pg_ctl,
    ["-D", cluster.data, "-m", "fast", "-w", "stop"]);
  if (cluster?.directory) {
    assert.equal(path.dirname(cluster.directory), path.resolve(os.tmpdir()));
    assert.match(path.basename(cluster.directory), /^bagger-prediction-pg-/);
    await rm(cluster.directory, { recursive: true, force: true });
  }
}

async function migrationNames() {
  return (await readdir(migrationsDirectory))
    .filter((name) => /^\d+_.*\.sql$/.test(name)).sort();
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
      select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
        current_user)
    $$;
    create function public.rls_auto_enable()
      returns void language plpgsql as $$ begin end $$;
  `);
}

function installAnnualPlatformCertificationFixture(cluster, database) {
  sql(cluster, database, `
    set session_replication_role = replica;
    insert into production_control.maintenance_deployment_capability_bindings (
      capability_binding_id, rebind_id, boundary_mode, contract_version,
      capability_ceiling, tournament_id, epoch_id, deployment_id,
      deployment_commit, capability_manifest, capability_fingerprint,
      runtime_observed_at, request_fingerprint, payload_hash, actor_id,
      response_value
    ) select
      '71000000-0000-4000-8000-000000000001',
      '71000000-0000-4000-8000-000000000002',
      'MAINTENANCE_WINDOW_V1',
      'production-maintenance-single-deployment-capability-v1',
      'OBSERVATION', '2026', value.authority_generation_id,
      'dpl_PredictionFixture', repeat('7', 40), '{}'::jsonb,
      repeat('7', 64), pg_catalog.clock_timestamp(), repeat('8', 64),
      repeat('9', 64), 'step13e8a-fixture', '{}'::jsonb
    from production_control.cutover_activation_state value
    where value.scope_key = 'BAGGER_INV_PRODUCTION';
    set session_replication_role = origin;
  `);
}

function actorScope(targetTournamentId = "2026") {
  return {
    contract_version: "production-prediction-settings-authoring-v1",
    environment: "PRODUCTION",
    project_ref: projectRef,
    project_url: projectUrl,
    source_workbook_id: workbook,
    tournament_id: "2026",
    tournament_year: 2026,
    target_tournament_id: targetTournamentId,
    authorization: {
      tournament_id: "2026", auth_user_id: actorAuth,
      player_id: "CB01", role: "DIRECTOR",
    },
  };
}

function canonicalSettings() {
  return Object.fromEntries(PRODUCTION_PREDICTION_SETTING_SPECS
    .map((setting) => [setting.canonicalKey, setting.defaultValue]));
}

function settingsRows(settings) {
  return PRODUCTION_PREDICTION_SETTING_SPECS.map((setting) => ({
    Setting: setting.canonicalKey, Value: settings[setting.canonicalKey],
  }));
}

test("migration 080 installs inertly and certifies current/future Supabase-native settings revisions", async (t) => {
  if (!(await available())) return t.skip("PostgreSQL 17 binaries unavailable");
  const cluster = await createCluster();
  t.after(() => destroyCluster(cluster));
  const database = "step13e8a_prediction_settings";
  run(bin.createdb, [database], { env: { ...environment(cluster), PGOPTIONS: "" } });
  installSupabaseCompatibility(cluster, database);

  const names = await migrationNames();
  const predecessorIndex = names.indexOf(predecessor);
  const migrationIndex = names.indexOf(migration080);
  assert.ok(predecessorIndex >= 0 && migrationIndex > predecessorIndex);
  for (const name of names.slice(0, predecessorIndex + 1)) {
    sqlFile(cluster, database, path.join(migrationsDirectory, name));
    if (name === providerInventoryV4) {
      sql(cluster, database, `
        insert into scoring_authority.tournaments (
          tournament_id,tournament_year,name,source_workbook_id,
          scoring_authority
        ) values ('2026',2026,'Prediction fixture','${workbook}','GOOGLE');
        insert into scoring_authority.ingress_gates (
          tournament_id,state,authority,active_epoch_id,
          unresolved_client_queues,updated_by
        ) values ('2026','PAUSED','GOOGLE',null,0,'step13e8a');
      `);
    }
  }
  installAnnualPlatformCertificationFixture(cluster, database);
  for (const name of names.slice(predecessorIndex + 1, migrationIndex)) {
    sqlFile(cluster, database, path.join(migrationsDirectory, name));
  }

  const initial = canonicalSettings();
  const initialRows = settingsRows(initial);
  sql(cluster, database, `
    insert into scoring_authority.odds_input_configurations(
      id,tournament_id,configuration_revision,source_workbook_id,settings,
      historical_ratings,settings_fingerprint,ratings_fingerprint,
      pairing_fingerprint,bundle_fingerprint,is_current,imported_by,
      source_tab,source_fingerprint,canonical_settings,effective_settings,
      effective_settings_fingerprint,settings_contract_version,
      validation_status,validation_diagnostics,synchronized_at
    ) values (
      '10000000-0000-4000-8000-000000000001','2026',1,'${workbook}',
      ${json(initialRows)},'{}',repeat('1',64),repeat('2',64),repeat('3',64),
      repeat('4',64),true,'Google import','Prediction Settings',repeat('5',64),
      ${json(initial)},${json(initial)},repeat('6',64),
      'prediction-settings-v1','VALID','{}','2026-01-01T00:00:00Z'
    );
    set session_replication_role=replica;
    insert into scoring_authority.odds_calculation_jobs(
      job_id,tournament_id,phase,total_iterations,completed_iterations,
      engine_version,publication_contract_version,
      checkpoint_contract_version,deterministic_seed,input_fingerprint,
      settings_fingerprint,invocation_fingerprint,source_revision,
      input_snapshot,checkpoint_payload,checkpoint_hash,status,requested_by,
      requested_at,completed_at,output_timestamp,input_configuration_id,
      effective_settings_fingerprint,input_bundle_fingerprint,
      production_operation_mode,production_deployment_commit,
      publication_status
    ) values (
      repeat('7',64),'2026','Pre-Tournament',10000,10000,
      'prediction-settings-fixture','production-odds-publication-v1',
      'production-odds-checkpoint-v1','settings-revision-1',repeat('8',64),
      repeat('1',64),repeat('7',64),
      jsonb_build_object(
        'production_job_identity_contract',
          'production-odds-calculation-job-identity-v2',
        'configuration_revision',1),
      '{}'::jsonb,'{}'::jsonb,repeat('9',64),'SUCCEEDED','fixture',
      '2026-01-02T00:00:00Z','2026-01-02T01:00:00Z',
      '2026-01-02T01:00:00Z','10000000-0000-4000-8000-000000000001',
      repeat('6',64),repeat('4',64),'PRODUCTION_CUTOVER',repeat('a',40),
      'READY'
    );
    insert into scoring_authority.odds_published_snapshots(
      id,tournament_id,milestone,phase_order,publication_revision,
      published_at,published_payload,payload_hash,source_fingerprint,
      engine_version,engine_metadata,google_publication_fingerprint,
      google_publication_reference,is_current_for_milestone,
      is_current_official,publication_verified,imported_by
    ) values (
      '11000000-0000-4000-8000-000000000001','2026','Pre-Tournament',0,1,
      '2026-01-03T00:00:00Z','{"fixture":true}',repeat('b',64),
      repeat('c',64),'legacy-google-fixture','{}',repeat('d',64),
      '{"sheet":"Odds"}',true,false,true,'Google import'
    );
    set session_replication_role=origin;
  `);

  const inertBefore = sql(cluster, database, `select concat_ws('|',
    (select count(*) from scoring_authority.odds_input_configurations),
    (select count(*) from scoring_authority.odds_calculation_jobs),
    (select count(*) from scoring_authority.odds_published_snapshots),
    (select count(*) from scoring_authority.odds_publication_current),
    (select tournament_id from production_control.current_tournament_pointer_v1
      where scope_key='BAGGER_INV_PRODUCTION'));`);
  const preservedBefore = sql(cluster, database, `select concat_ws('|',
    encode(extensions.digest((select to_jsonb(value)::text
      from scoring_authority.odds_input_configurations value
      where value.id='10000000-0000-4000-8000-000000000001'),'sha256'),'hex'),
    encode(extensions.digest((select to_jsonb(value)::text
      from scoring_authority.odds_calculation_jobs value
      where value.job_id=repeat('7',64)),'sha256'),'hex'),
    encode(extensions.digest((select to_jsonb(value)::text
      from scoring_authority.odds_published_snapshots value
      where value.id='11000000-0000-4000-8000-000000000001'),'sha256'),'hex'),
    encode(extensions.digest((select to_jsonb(value)::text
      from scoring_authority.odds_publication_current value
      where value.tournament_id='2026'),'sha256'),'hex'));`);
  sqlFile(cluster, database, path.join(migrationsDirectory, migration080));
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select count(*) from scoring_authority.odds_input_configurations),
    (select count(*) from scoring_authority.odds_calculation_jobs),
    (select count(*) from scoring_authority.odds_published_snapshots),
    (select count(*) from scoring_authority.odds_publication_current),
    (select tournament_id from production_control.current_tournament_pointer_v1
      where scope_key='BAGGER_INV_PRODUCTION'));`), inertBefore);
  assert.equal(sql(cluster, database, `select concat_ws('|',
    encode(extensions.digest((select to_jsonb(value)::text
      from scoring_authority.odds_input_configurations value
      where value.id='10000000-0000-4000-8000-000000000001'),'sha256'),'hex'),
    encode(extensions.digest((select to_jsonb(value)::text
      from scoring_authority.odds_calculation_jobs value
      where value.job_id=repeat('7',64)),'sha256'),'hex'),
    encode(extensions.digest((select to_jsonb(value)::text
      from scoring_authority.odds_published_snapshots value
      where value.id='11000000-0000-4000-8000-000000000001'),'sha256'),'hex'),
    encode(extensions.digest((select to_jsonb(value)::text
      from scoring_authority.odds_publication_current value
      where value.tournament_id='2026'),'sha256'),'hex'));`), preservedBefore);
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select count(*) from production_control.prediction_setting_definitions_v1),
    has_function_privilege('service_role',
      'public.stage_production_prediction_settings_revision_v1(jsonb)','EXECUTE'),
    has_function_privilege('authenticated',
      'public.stage_production_prediction_settings_revision_v1(jsonb)','EXECUTE'),
    has_function_privilege('anon',
      'public.read_production_prediction_settings_authoring_v1(jsonb)','EXECUTE'));`),
  "30|t|f|f");
  const hashContractProbe = {
    z: [true, null, {
      decimal: 0.30000000000000004,
      tiny: 1e-7,
      negativeTiny: -1.234e-8,
      fixedBoundary: 1e-6,
      fixedLarge: 1e20,
      exponentLarge: 1e21,
      exponentLargeFraction: 1.0000000000000001e21,
    }],
    a: { "Long Setting Name": 15, "Another Setting": "value" },
  };
  assert.equal(sql(cluster, database,
    `select production_control.prediction_settings_hash_v1(${json(hashContractProbe)});`),
  scoringShadowPayloadHash(hashContractProbe));

  sql(cluster, database, `
    insert into auth.users(id,email,email_confirmed_at)
    values ('${actorAuth}','owner@example.org',pg_catalog.clock_timestamp());
    insert into scoring_authority.players(player_id,display_name,source_payload)
    values ('CB01','Owner','{}');
    insert into scoring_authority.teams(
      tournament_id,team_id,team_side,name,source_payload
    ) values ('2026','TEAM-1',1,'Team One','{}');
    insert into scoring_authority.tournament_players(
      tournament_id,player_id,team_id,team_side,participation_status,
      source_roster_key,source_payload
    ) values ('2026','CB01','TEAM-1',1,'ACTIVE','CB01','{}');
    insert into participant_identity.user_player_links(
      auth_user_id,player_id,status,link_revision,link_method,
      email_identity_hash,linked_at,linked_by
    ) values ('${actorAuth}','CB01','ACTIVE',1,'APPROVED_EMAIL_OTP',
      encode(extensions.digest('owner@example.org','sha256'),'hex'),
      pg_catalog.clock_timestamp(),'step13e8a');
    insert into participant_identity.tournament_roles(
      tournament_id,auth_user_id,role,role_active,granted_by
    ) values ('2026','${actorAuth}','DIRECTOR',true,'step13e8a');
    insert into production_control.director_entitlements(
      entitlement_id,auth_user_id,tournament_id,player_id,role,status,
      granted_by,granted_at
    ) values ('00000000-0000-4000-8000-000000000002','${actorAuth}',
      '2026','CB01','DIRECTOR','ACTIVE','step13e8a',
      pg_catalog.clock_timestamp());
  `);

  const initialRead = JSON.parse(sql(cluster, database,
    `select public.read_production_prediction_settings_authoring_v1(${json({
      ...actorScope(), operation: "READ_PRODUCTION_PREDICTION_SETTINGS_AUTHORING_V1",
      history_limit: 10,
    })})::text;`));
  assert.equal(initialRead.ok, true);
  assert.equal(initialRead.data.current.revision, 1);
  assert.equal(initialRead.data.current.authoringAuthority, "GOOGLE_IMPORT");
  assert.equal(initialRead.data.relationship.recalculationRequired, false);
  assert.equal(initialRead.data.relationship.latestCalculationSettingsRevision, 1);

  const proposed = { ...initial, "Player Category Weight": 43 };
  const stageInput = {
    ...actorScope(), operation: "STAGE_PRODUCTION_PREDICTION_SETTINGS_REVISION_V1",
    operation_request_id: "20000000-0000-4000-8000-000000000002",
    request_payload_hash: "a".repeat(64),
    expected_configuration_revision: 1,
    canonical_settings: proposed,
    reason: "Director reviewed model input",
  };
  const staged = JSON.parse(sql(cluster, database,
    `select public.stage_production_prediction_settings_revision_v1(${json(stageInput)})::text;`));
  assert.equal(staged.ok, true);
  assert.equal(staged.code, "PREDICTION_SETTINGS_REVISION_STAGED");
  assert.equal(staged.changedSettingCount, 1);

  const validateInput = {
    ...actorScope(), operation: "VALIDATE_PRODUCTION_PREDICTION_SETTINGS_REVISION_V1",
    operation_request_id: "21000000-0000-4000-8000-000000000002",
    request_payload_hash: "1".repeat(64),
    target_tournament_id: "2026", draft_id: staged.draftId,
    expected_configuration_revision: 1,
  };
  const validated = JSON.parse(sql(cluster, database,
    `select public.validate_production_prediction_settings_revision_v1(${json(validateInput)})::text;`));
  assert.equal(validated.ok, true);
  assert.equal(validated.state, "VALIDATED");
  assert.equal(validated.idempotent, false);
  const validateRetry = JSON.parse(sql(cluster, database,
    `select public.validate_production_prediction_settings_revision_v1(${json(validateInput)})::text;`));
  assert.equal(validateRetry.ok, true);
  assert.equal(validateRetry.idempotent, true);
  const validateConflict = JSON.parse(sql(cluster, database,
    `select public.validate_production_prediction_settings_revision_v1(${json({
      ...validateInput, expected_configuration_revision: 2,
      request_payload_hash: "2".repeat(64),
    })})::text;`));
  assert.equal(validateConflict.ok, false);
  assert.equal(validateConflict.code,
    "PREDICTION_SETTINGS_IDEMPOTENCY_CONFLICT");

  const commitInput = {
    ...actorScope(), operation: "COMMIT_PRODUCTION_PREDICTION_SETTINGS_REVISION_V1",
    operation_request_id: "30000000-0000-4000-8000-000000000003",
    request_payload_hash: "b".repeat(64),
    target_tournament_id: "2026", draft_id: staged.draftId,
    expected_configuration_revision: 1,
    confirmation: "SAVE PREDICTION SETTINGS REVISION",
  };
  const committed = JSON.parse(sql(cluster, database,
    `select public.commit_production_prediction_settings_revision_v1(${json(commitInput)})::text;`));
  assert.equal(committed.ok, true);
  assert.equal(committed.configurationRevision, 2);
  assert.equal(committed.directorPlayerId, "CB01");
  assert.match(committed.effectiveAt, /^2026-|^2027-/);
  assert.equal(committed.recalculationRequired, true);
  assert.equal(committed.automaticCalculationRequested, false);
  assert.equal(committed.automaticPublicationRequested, false);
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select configuration_revision from scoring_authority.odds_input_configurations
      where tournament_id='2026' and is_current),
    (select count(*) from production_control.prediction_settings_revision_provenance_v1),
    (select count(*) from scoring_authority.odds_calculation_jobs),
    (select count(*) from scoring_authority.odds_published_snapshots),
    (select count(*) from production_control.prediction_settings_audit_events_v1));`),
  "2|1|1|1|3");

  const postCommitRead = JSON.parse(sql(cluster, database,
    `select public.read_production_prediction_settings_authoring_v1(${json({
      ...actorScope(), operation: "READ_PRODUCTION_PREDICTION_SETTINGS_AUTHORING_V1",
      history_limit: 10,
    })})::text;`));
  assert.equal(postCommitRead.data.current.revision, 2);
  assert.equal(postCommitRead.data.current.authoringAuthority,
    "SUPABASE_DIRECTOR");
  assert.equal(postCommitRead.data.relationship.recalculationRequired, true);
  assert.equal(postCommitRead.data.relationship.latestCalculationSettingsRevision, 1);
  assert.equal(postCommitRead.data.relationship.publishedSnapshotUnchanged, true);

  sql(cluster, database, `
    set session_replication_role=replica;
    insert into scoring_authority.odds_calculation_jobs(
      job_id,tournament_id,phase,total_iterations,completed_iterations,
      engine_version,publication_contract_version,
      checkpoint_contract_version,deterministic_seed,input_fingerprint,
      settings_fingerprint,invocation_fingerprint,source_revision,
      input_snapshot,checkpoint_payload,checkpoint_hash,status,requested_by,
      requested_at,completed_at,output_timestamp,input_configuration_id,
      effective_settings_fingerprint,input_bundle_fingerprint,
      production_operation_mode,production_deployment_commit,
      publication_status
    ) select
      repeat('e',64),'2026','Pre-Tournament',10000,10000,
      'prediction-settings-fixture','production-odds-publication-v1',
      'production-odds-checkpoint-v1','settings-revision-2',repeat('f',64),
      value.settings_fingerprint,repeat('e',64),
      jsonb_build_object(
        'production_job_identity_contract',
          'production-odds-calculation-job-identity-v2',
        'configuration_revision',value.configuration_revision),
      '{}'::jsonb,'{}'::jsonb,repeat('0',64),'SUCCEEDED','fixture',
      '2026-01-04T00:00:00Z','2026-01-04T01:00:00Z',
      '2026-01-04T01:00:00Z',value.id,
      value.effective_settings_fingerprint,value.bundle_fingerprint,
      'PRODUCTION_CUTOVER',repeat('a',40),'READY'
    from scoring_authority.odds_input_configurations value
    where value.tournament_id='2026' and value.is_current;
    set session_replication_role=origin;
  `);
  const recalculatedRead = JSON.parse(sql(cluster, database,
    `select public.read_production_prediction_settings_authoring_v1(${json({
      ...actorScope(), operation: "READ_PRODUCTION_PREDICTION_SETTINGS_AUTHORING_V1",
      history_limit: 10,
    })})::text;`));
  assert.equal(recalculatedRead.data.relationship.recalculationRequired, false);
  assert.equal(recalculatedRead.data.relationship.latestCalculationSettingsRevision, 2);

  const retry = JSON.parse(sql(cluster, database,
    `select public.commit_production_prediction_settings_revision_v1(${json(commitInput)})::text;`));
  assert.equal(retry.ok, true);
  assert.equal(retry.idempotent, true);
  const conflict = JSON.parse(sql(cluster, database,
    `select public.commit_production_prediction_settings_revision_v1(${json({
      ...commitInput, request_payload_hash: "c".repeat(64),
    })})::text;`));
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, "PREDICTION_SETTINGS_IDEMPOTENCY_CONFLICT");

  const stale = JSON.parse(sql(cluster, database,
    `select public.stage_production_prediction_settings_revision_v1(${json({
      ...stageInput,
      operation_request_id: "40000000-0000-4000-8000-000000000004",
      request_payload_hash: "d".repeat(64),
    })})::text;`));
  assert.equal(stale.code, "PREDICTION_SETTINGS_PREDECESSOR_STALE");

  sql(cluster, database, `
    insert into scoring_authority.tournaments(
      tournament_id,tournament_year,name,source_workbook_id,scoring_authority
    ) values ('2027',2027,'Future fixture','${workbook}','SUPABASE');
    insert into production_control.future_tournament_catalog_v1(
      tournament_id,tournament_year,contract_version,tournament_name,
      lifecycle,lifecycle_revision,setup_revision,creation_mode
    ) values ('2027',2027,'production-future-year-administration-v1',
      'Future fixture','DRAFT',1,1,'BLANK');
    insert into production_control.future_tournament_resources_v1(
      tournament_id,project_ref,project_url,source_workbook_id,
      resource_status,resource_revision,google_compatibility_policy
    ) values ('2027','${projectRef}','${projectUrl}','${workbook}',
      'CURRENT_RESOURCE_BOUND',1,'CURRENT_CERTIFIED');
  `);
  const copyInput = {
    ...actorScope("2027"), operation: "COPY_PRODUCTION_PREDICTION_SETTINGS_DRAFT_V1",
    operation_request_id: "50000000-0000-4000-8000-000000000005",
    request_payload_hash: "e".repeat(64), source_tournament_id: "2026",
    expected_configuration_revision: 0,
    reason: "Copy values for future Director review",
  };
  const copied = JSON.parse(sql(cluster, database,
    `select public.copy_production_prediction_settings_draft_v1(${json(copyInput)})::text;`));
  assert.equal(copied.ok, true);
  assert.equal(copied.state, "STAGED");
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select count(*) from production_control.prediction_settings_drafts_v1
      where tournament_id='2027' and state='STAGED'),
    (select count(*) from scoring_authority.odds_input_configurations
      where tournament_id='2027'),
    (select count(*) from scoring_authority.odds_calculation_jobs
      where tournament_id='2027'),
    (select count(*) from scoring_authority.odds_published_snapshots
      where tournament_id='2027'),
    (select count(*) from production_control.future_annual_projection_bindings_v1
      where tournament_id='2027' and domain='PREDICTION_SETTINGS'));`),
  "1|0|0|0|0");

  const futureValidated = JSON.parse(sql(cluster, database,
    `select public.validate_production_prediction_settings_revision_v1(${json({
      ...actorScope("2027"),
      operation: "VALIDATE_PRODUCTION_PREDICTION_SETTINGS_REVISION_V1",
      operation_request_id: "51000000-0000-4000-8000-000000000005",
      request_payload_hash: "3".repeat(64),
      target_tournament_id: "2027", draft_id: copied.draftId,
      expected_configuration_revision: 0,
    })})::text;`));
  assert.equal(futureValidated.ok, true);
  const futureCommit = JSON.parse(sql(cluster, database,
    `select public.commit_production_prediction_settings_revision_v1(${json({
      ...actorScope("2027"),
      operation: "COMMIT_PRODUCTION_PREDICTION_SETTINGS_REVISION_V1",
      operation_request_id: "60000000-0000-4000-8000-000000000006",
      request_payload_hash: "f".repeat(64), target_tournament_id: "2027",
      draft_id: copied.draftId, expected_configuration_revision: 0,
      confirmation: "SAVE PREDICTION SETTINGS REVISION",
    })})::text;`));
  assert.equal(futureCommit.ok, true);
  assert.equal(futureCommit.configurationRevision, 1);
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select count(*) from scoring_authority.odds_input_configurations
      where tournament_id='2027' and is_current),
    (select authoring_authority from
      production_control.future_annual_projection_bindings_v1
      where tournament_id='2027' and domain='PREDICTION_SETTINGS'),
    (select certification_status from
      production_control.future_annual_projection_bindings_v1
      where tournament_id='2027' and domain='PREDICTION_SETTINGS'),
    (select setup_revision from production_control.future_tournament_catalog_v1
      where tournament_id='2027'),
    (select count(*) from scoring_authority.odds_calculation_jobs
      where tournament_id='2027'),
    (select count(*) from scoring_authority.odds_published_snapshots
      where tournament_id='2027'));`), "1|SUPABASE_DIRECTOR|CERTIFIED|2|0|0");

  assert.equal(sql(cluster, database, `select concat_ws('|',
    has_function_privilege('authenticated',
      'public.commit_production_prediction_settings_revision_v1(jsonb)','EXECUTE'),
    has_function_privilege('anon',
      'public.commit_production_prediction_settings_revision_v1(jsonb)','EXECUTE'),
    (select tournament_id from production_control.current_tournament_pointer_v1
      where scope_key='BAGGER_INV_PRODUCTION'));`), "f|f|2026");
});
