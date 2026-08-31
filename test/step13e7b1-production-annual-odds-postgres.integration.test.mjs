import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = path.join(root, "supabase", "production_migrations");
const predecessor =
  "202608300068_production_future_participant_identity_runtime_v1.sql";
const migration072 =
  "202608300072_production_annual_google_writer_certification_v1.sql";
const migration073 = "202608300073_production_annual_odds_v1.sql";
const providerInventoryV4 =
  "202608260038_production_provider_preview_target_inventory_v4.sql";
const pgBin = "/opt/homebrew/opt/postgresql@17/bin";
const bin = Object.fromEntries(["createdb", "initdb", "pg_ctl", "psql"]
  .map((name) => [name, path.join(pgBin, name)]));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options,
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
  return run(bin.psql, [
    "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", database,
  ], { env: environment(cluster, jwtRole), input });
}

function sqlFile(cluster, database, filename) {
  return run(bin.psql, [
    "-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", database,
    "-f", filename,
  ], { env: environment(cluster) });
}

function json(value) {
  return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
}

async function available() {
  try {
    await Promise.all(Object.values(bin).map((value) =>
      access(value, fsConstants.X_OK)));
    return true;
  } catch {
    return false;
  }
}

async function createCluster() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "bagger-annual-odds-pg-"));
  const data = path.join(directory, "data");
  const socket = path.join(directory, "socket");
  const log = path.join(directory, "postgres.log");
  await mkdir(socket, { mode: 0o700 });
  run(bin.initdb, [
    "-D", data, "--username=postgres", "--auth=trust", "--no-locale",
    "--encoding=UTF8", "--set=shared_memory_type=mmap",
    "--set=dynamic_shared_memory_type=mmap",
  ]);
  const port = 58600 + (process.pid % 300);
  run(bin.pg_ctl, [
    "-D", data, "-l", log, "-o", `-F -k ${socket} -h '' -p ${port}`,
    "-w", "start",
  ]);
  return { directory, data, socket, log, port, started: true };
}

async function destroyCluster(cluster) {
  if (cluster?.started) {
    run(bin.pg_ctl, ["-D", cluster.data, "-m", "fast", "-w", "stop"]);
  }
  if (cluster?.directory) {
    assert.equal(path.dirname(cluster.directory), path.resolve(os.tmpdir()));
    assert.match(path.basename(cluster.directory), /^bagger-annual-odds-pg-/);
    await rm(cluster.directory, { recursive: true, force: true });
  }
}

async function migrationNames() {
  return (await readdir(migrationsDirectory))
    .filter((name) => /^\d+_.*\.sql$/.test(name))
    .sort();
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
      'dpl_AnnualOddsFixture', repeat('7', 40), '{}'::jsonb,
      repeat('7', 64), pg_catalog.clock_timestamp(), repeat('8', 64),
      repeat('9', 64), 'step13e7b1-odds-fixture', '{}'::jsonb
    from production_control.cutover_activation_state value
    where value.scope_key = 'BAGGER_INV_PRODUCTION';
    set session_replication_role = origin;
  `);
}

const frozenSignatures = [
  "production_control.assert_production_odds_calculation_scope(jsonb,boolean)",
  "public.read_production_odds_calculation_inputs(jsonb)",
  "public.request_production_odds_calculation_job(jsonb)",
  "public.claim_production_odds_calculation_job(jsonb)",
  "public.checkpoint_production_odds_calculation_job(jsonb)",
  "public.complete_production_odds_calculation_job(jsonb)",
  "public.fail_production_odds_calculation_job(jsonb)",
  "public.supersede_production_odds_calculation_job(jsonb)",
  "public.read_production_odds_calculation_jobs(jsonb)",
  "public.read_production_odds_publication_v1(jsonb)",
  "public.publish_production_championship_odds_v1(jsonb)",
  "public.read_published_odds_view(text,text)",
];

function functionHashes(cluster, database, signatures) {
  return Object.fromEntries(signatures.map((signature) => [signature,
    sql(cluster, database, `select encode(extensions.digest(value.prosrc,
      'sha256'),'hex') from pg_catalog.pg_proc value
      where value.oid='${signature}'::regprocedure;`),
  ]));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

test("migration 073 preserves 2026 bodies and isolates future Odds jobs in PostgreSQL", async (t) => {
  if (!(await available())) return t.skip("PostgreSQL 17 binaries unavailable");
  const cluster = await createCluster();
  t.after(() => destroyCluster(cluster));
  const database = "step13e7b1_annual_odds";
  run(bin.createdb, [database], {
    env: { ...environment(cluster), PGOPTIONS: "" },
  });
  installSupabaseCompatibility(cluster, database);

  const names = await migrationNames();
  const predecessorIndex = names.indexOf(predecessor);
  const migration072Index = names.indexOf(migration072);
  const migration073Index = names.indexOf(migration073);
  assert.ok(predecessorIndex >= 0 && migration072Index > predecessorIndex);
  assert.equal(migration073Index, migration072Index + 1);
  for (const name of names.slice(0, predecessorIndex + 1)) {
    sqlFile(cluster, database, path.join(migrationsDirectory, name));
    if (name === providerInventoryV4) {
      sql(cluster, database, `
        insert into scoring_authority.tournaments (
          tournament_id,tournament_year,name,source_workbook_id,
          scoring_authority
        ) values (
          '2026',2026,'Annual Odds fixture',
          '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4','GOOGLE'
        );
        insert into scoring_authority.ingress_gates (
          tournament_id,state,authority,active_epoch_id,
          unresolved_client_queues,updated_by
        ) values ('2026','PAUSED','GOOGLE',null,0,'step13e7b1');
      `);
    }
  }
  installAnnualPlatformCertificationFixture(cluster, database);
  for (const name of names.slice(predecessorIndex + 1, migration072Index + 1)) {
    sqlFile(cluster, database, path.join(migrationsDirectory, name));
  }

  const frozenBefore = functionHashes(cluster, database, frozenSignatures);
  const inertBefore = sql(cluster, database, `select concat_ws('|',
    (select count(*) from scoring_authority.odds_input_configurations),
    (select count(*) from scoring_authority.odds_calculation_jobs),
    (select count(*) from scoring_authority.odds_published_snapshots),
    (select count(*) from scoring_authority.odds_publication_current),
    (select tournament_id from
      production_control.current_tournament_pointer_v1
      where scope_key='BAGGER_INV_PRODUCTION'));`);
  sqlFile(cluster, database, path.join(migrationsDirectory, migration073));
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select count(*) from scoring_authority.odds_input_configurations),
    (select count(*) from scoring_authority.odds_calculation_jobs),
    (select count(*) from scoring_authority.odds_published_snapshots),
    (select count(*) from scoring_authority.odds_publication_current),
    (select tournament_id from
      production_control.current_tournament_pointer_v1
      where scope_key='BAGGER_INV_PRODUCTION'));`), inertBefore);

  const renamed = [
    "production_control.assert_production_odds_calculation_scope_frozen_2026_v1(jsonb,boolean)",
    ...frozenSignatures.slice(1, 9),
    "public.read_production_odds_publication_frozen_2026_v1(jsonb)",
    frozenSignatures[10],
    "public.read_published_odds_view_frozen_2026_v1(text,text)",
  ];
  const frozenAfter = functionHashes(cluster, database, renamed);
  for (let index = 0; index < frozenSignatures.length; index += 1) {
    assert.equal(frozenAfter[renamed[index]], frozenBefore[frozenSignatures[index]],
      `${frozenSignatures[index]} body changed`);
  }
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select count(*) from
      production_control.annual_odds_2026_body_certifications_v1),
    has_function_privilege('service_role',
      'public.dispatch_production_annual_odds_v1(jsonb)','EXECUTE'),
    has_function_privilege('authenticated',
      'public.dispatch_production_annual_odds_v1(jsonb)','EXECUTE'),
    has_function_privilege('service_role',
      'public.future_production_dispatch_odds_v1(jsonb)','EXECUTE'))`),
  "12|f|f|f");

  const runtimeGeneration = "10000000-0000-4000-8000-000000000001";
  const authorityGeneration = "20000000-0000-4000-8000-000000000002";
  const admissionGeneration = "30000000-0000-4000-8000-000000000003";
  const workbook = "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4";
  const configId2026 = "40000000-0000-4000-8000-000000000004";
  sql(cluster, database, `
    insert into auth.users(id,email,email_confirmed_at)
    values ('00000000-0000-4000-8000-000000000001',
      'owner@example.org',pg_catalog.clock_timestamp())
    on conflict (id) do update set email=excluded.email,
      email_confirmed_at=excluded.email_confirmed_at;
    insert into scoring_authority.players(player_id,display_name,source_payload)
    values ('CB01','Owner','{}') on conflict (player_id) do nothing;
    insert into participant_identity.user_player_links(
      auth_user_id,player_id,status,link_revision,link_method,
      email_identity_hash,linked_at,linked_by
    ) values ('00000000-0000-4000-8000-000000000001','CB01','ACTIVE',1,
      'APPROVED_EMAIL_OTP',encode(extensions.digest(
        'owner@example.org','sha256'),'hex'),pg_catalog.clock_timestamp(),
      'step13e7b1') on conflict (auth_user_id) do nothing;
    insert into participant_identity.participant_auth_identifiers(
      player_id,auth_user_id,identifier_type,normalized_value_private,
      status,verified_at,verification_source,revision,source_system,
      source_tournament_id,source_configuration_revision,created_by,updated_by
    ) values ('CB01','00000000-0000-4000-8000-000000000001','EMAIL',
      'owner@example.org','VERIFIED',pg_catalog.clock_timestamp(),'OTP',1,
      'SUPABASE','2026',1,'step13e7b1','step13e7b1')
    on conflict do nothing;
    insert into production_control.director_entitlements(
      entitlement_id,auth_user_id,tournament_id,player_id,role,status,
      granted_by,granted_at
    ) values ('00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000001','2026','CB01','DIRECTOR',
      'ACTIVE','step13e7b1',pg_catalog.clock_timestamp())
    on conflict (auth_user_id,tournament_id) do nothing;
    insert into production_control.director_entitlement_events(
      event_id,entitlement_id,action,actor,reason
    ) overriding system value values (9001,
      '00000000-0000-4000-8000-000000000002','GRANTED','step13e7b1',
      'Certified annual Odds fixture Director') on conflict do nothing;
    insert into production_control.tournament_owner_capabilities_v1(
      tournament_id,player_id,auth_user_id,adopted_from_entitlement_id,
      adopted_entitlement_event_id,adopted_entitlement_event_count,status,
      capability_revision,adopted_by_player_id,adopted_at
    ) values ('2026','CB01','00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',9001,1,'ACTIVE',1,'CB01',
      pg_catalog.clock_timestamp()) on conflict do nothing;
    insert into scoring_authority.tournaments(
      tournament_id,tournament_year,name,source_workbook_id,
      scoring_authority
    ) values ('2099',2099,'Annual Odds target','${workbook}','SUPABASE');
    update production_control.future_tournament_catalog_v1
      set lifecycle='CLOSED',lifecycle_revision=2
      where tournament_id='2026';
    insert into production_control.future_tournament_catalog_v1(
      tournament_id,tournament_year,contract_version,tournament_name,
      lifecycle,lifecycle_revision,setup_revision,creation_mode
    ) values ('2099',2099,'production-future-year-administration-v1',
      'Annual Odds target','DRAFT',1,1,'BLANK');
    insert into production_control.future_tournament_resources_v1(
      tournament_id,project_ref,project_url,source_workbook_id,
      resource_status,resource_revision,google_compatibility_policy
    ) values ('2099','ymqhhtxaywtqllynrmxe',
      'https://ymqhhtxaywtqllynrmxe.supabase.co','${workbook}',
      'CURRENT_RESOURCE_BOUND',1,'CURRENT_CERTIFIED');
    insert into scoring_authority.odds_input_configurations(
      id,tournament_id,configuration_revision,source_workbook_id,settings,
      historical_ratings,settings_fingerprint,ratings_fingerprint,
      pairing_fingerprint,bundle_fingerprint,is_current,imported_by,
      source_fingerprint,canonical_settings,effective_settings,
      effective_settings_fingerprint,settings_contract_version,
      validation_status,validation_diagnostics,synchronized_at
    ) values (
      '${configId2026}','2026',1,
       '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4','[]','{}',
       repeat('1',64),repeat('2',64),repeat('3',64),repeat('4',64),true,
       'step13e7b1',repeat('5',64),'{}',
       (select jsonb_object_agg('setting_' || value,value)
          from generate_series(1,30) value),repeat('6',64),
       'prediction-settings-v1','VALID','{}',pg_catalog.clock_timestamp());

    select public.synchronize_production_future_annual_projection_v1(
      jsonb_build_object(
        'contract_version','production-future-runtime-activation-v2',
        'environment','PRODUCTION','project_ref','ymqhhtxaywtqllynrmxe',
        'project_url','https://ymqhhtxaywtqllynrmxe.supabase.co',
        'source_workbook_id','${workbook}',
        'tournament_id','2026','tournament_year',2026,
        'target_tournament_id','2099','target_tournament_year',2099,
        'domain','PREDICTION_SETTINGS','source_revision',1,
        'source_fingerprint',repeat('b',64),
        'payload_fingerprint',repeat('d',64),
        'validation_status','VALID',
        'validation_diagnostics',jsonb_build_object('fixture',true),
        'requested_by','Production Director CB01',
        'projection',jsonb_build_object(
          'settings',(select jsonb_agg(jsonb_build_object(
            'Key','setting_' || value,'Value',value) order by value)
            from generate_series(1,30) value),
          'settings_fingerprint',repeat('7',64),
          'canonical_settings',(select jsonb_object_agg(
            'setting_' || value,value) from generate_series(1,30) value),
          'effective_settings',(select jsonb_object_agg(
            'setting_' || value,value) from generate_series(1,30) value),
          'effective_settings_fingerprint',repeat('c',64),
          'settings_contract_version','prediction-settings-v1',
          'source_tab','Prediction Settings'),
        'expected_setup_revision',1,'expected_runtime_revision',0,
        'authorization',jsonb_build_object(
          'player_id','CB01','auth_user_id',
          '00000000-0000-4000-8000-000000000001',
          'role','DIRECTOR','tournament_id','2026')
      )
    );
  `);
  const synchronizedConfiguration = JSON.parse(sql(cluster, database, `select
    jsonb_build_object(
      'id',value.id,'revision',value.configuration_revision,
      'sourceFingerprint',value.source_fingerprint,
      'settingsFingerprint',value.settings_fingerprint,
      'effectiveSettingsFingerprint',value.effective_settings_fingerprint,
      'ratingsFingerprint',value.ratings_fingerprint,
      'pairingFingerprint',value.pairing_fingerprint,
      'bundleFingerprint',value.bundle_fingerprint,
      'settingsCount',jsonb_array_length(value.settings),
      'effectiveCount',scoring_authority.jsonb_object_length(
        value.effective_settings),
      'ratingsSourceTournamentId',
        value.validation_diagnostics->>'historicalRatingsSourceTournamentId',
      'annualSetupRevision',
        value.validation_diagnostics->>'annualSetupRevision'
    )::text from scoring_authority.odds_input_configurations value
    where value.tournament_id='2099' and value.is_current;`));
  const configId2099 = synchronizedConfiguration.id;
  assert.deepEqual({
    revision: synchronizedConfiguration.revision,
    sourceFingerprint: synchronizedConfiguration.sourceFingerprint,
    settingsFingerprint: synchronizedConfiguration.settingsFingerprint,
    effectiveSettingsFingerprint:
      synchronizedConfiguration.effectiveSettingsFingerprint,
    ratingsFingerprint: synchronizedConfiguration.ratingsFingerprint,
    settingsCount: synchronizedConfiguration.settingsCount,
    effectiveCount: synchronizedConfiguration.effectiveCount,
    ratingsSourceTournamentId:
      synchronizedConfiguration.ratingsSourceTournamentId,
    annualSetupRevision: synchronizedConfiguration.annualSetupRevision,
  }, {
    revision: 1,
    sourceFingerprint: "b".repeat(64),
    settingsFingerprint: "7".repeat(64),
    effectiveSettingsFingerprint: "c".repeat(64),
    ratingsFingerprint: "2".repeat(64),
    settingsCount: 30,
    effectiveCount: 30,
    ratingsSourceTournamentId: "2026",
    annualSetupRevision: "2",
  });
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select count(*) from production_control.future_annual_projection_bindings_v1
      where tournament_id='2099' and domain='PREDICTION_SETTINGS'),
    (select count(*) from scoring_authority.odds_input_configurations
      where tournament_id='2099' and is_current),
    (select count(*) from scoring_authority.odds_input_import_runs
      where tournament_id='2099'),
    (select count(*) from scoring_authority.odds_calculation_jobs
      where tournament_id='2099'),
    (select count(*) from scoring_authority.odds_published_snapshots
      where tournament_id='2099'));`), "1|1|1|0|0");

  sql(cluster, database, `
    update production_control.future_tournament_catalog_v1
      set lifecycle='ACTIVE',lifecycle_revision=2
      where tournament_id='2099';
    insert into production_control.future_annual_runtime_generations_v1(
      runtime_generation_id,tournament_id,generation_status,runtime_revision,
      pointer_revision,authority_generation_id,admission_generation_id,
      authority,ingress_state,readiness_fingerprint,activated_at
    ) values ('${runtimeGeneration}','2099','ACTIVE',1,2,
      '${authorityGeneration}','${admissionGeneration}','SUPABASE','OPEN',
      repeat('a',64),pg_catalog.clock_timestamp());
    update production_control.current_tournament_pointer_v1
      set tournament_id='2099',tournament_year=2099,pointer_revision=2,
        lifecycle_revision=2,updated_at=pg_catalog.clock_timestamp()
      where scope_key='BAGGER_INV_PRODUCTION';

    insert into scoring_authority.odds_calculation_jobs(
      job_id,tournament_id,phase,total_iterations,engine_version,
      publication_contract_version,checkpoint_contract_version,
      deterministic_seed,input_fingerprint,settings_fingerprint,
      invocation_fingerprint,source_revision,input_snapshot,
      checkpoint_payload,checkpoint_hash,requested_by,output_timestamp,
      input_configuration_id,effective_settings_fingerprint,
      input_bundle_fingerprint,production_operation_mode,
      production_deployment_commit,publication_status,publication_reference
    ) values (repeat('d',64),'2026','After Round 1',10000,'engine-v1',
      'publication-v1','checkpoint-v1','seed',repeat('e',64),repeat('1',64),
      repeat('d',64),jsonb_build_object(
        'production_job_identity_contract',
          'production-odds-calculation-job-identity-v2'),
      '{}'::jsonb,'{}'::jsonb,repeat('f',64),'predecessor',
      '2026-01-01T00:00:00Z','${configId2026}',repeat('6',64),
      repeat('4',64),'PRODUCTION_CUTOVER',repeat('1',40),
      'NOT_REQUESTED','{}'::jsonb);

    -- This focused fixture starts before the real Step-12 state mutation. Set
    -- only the certified Odds/runtime control rows to their already-proven
    -- post-cutover values so migration 073's real Odds guard remains under
    -- test. No tournament fact, publication, or calculation result is added.
    set session_replication_role = replica;
    update production_control.resource_scope set
      scoring_authority='SUPABASE',
      current_tournament_read_authority='SUPABASE',
      odds_publication_authority='SUPABASE',
      odds_publication_enabled=true,
      workers_enabled=true
    where scope_key='BAGGER_INV_PRODUCTION';
    update production_control.odds_calculation_runtime set
      enabled=true,
      operation_mode='PRODUCTION_CUTOVER',
      cutover_phase='ODDS_WAR_ROOM',
      deployment_commit=repeat('1',40),
      activation_revision=1
    where scope_key='BAGGER_INV_PRODUCTION';
    update production_control.worker_controls set
      enabled=true,google_writes_allowed=false
    where worker_name='ODDS_CALCULATION';
    update production_control.worker_contracts set
      operation_allowed=true,scheduler_installed=false,
      authoritative_write_allowed=false
    where worker_name='ODDS_CALCULATION';
    update production_control.worker_controls set
      enabled=false,google_writes_allowed=false
    where worker_name='ODDS_GOOGLE_MIRROR';
    set session_replication_role = origin;

    -- Keep migration 073's Odds assertion intact. This fixture replaces only
    -- the already-covered annual platform/runtime assertion so the focused
    -- test reaches the real Odds target checks through the public outer
    -- dispatcher without recreating the entire activation transaction here.
    create or replace function production_control.assert_annual_scoring_runtime_v1(
      input jsonb, expected_operation text, required_worker text default null
    ) returns text language plpgsql security definer
    set search_path=pg_catalog as $$
    begin
      if expected_operation is distinct from
           'dispatch_production_annual_odds_v1'
         or required_worker is not null
         or input->>'annual_scoring_operation' is distinct from
           'dispatch_production_annual_odds_v1'
         or input->>'tournament_id' is distinct from '2026'
         or coalesce((input->>'tournament_year')::integer, 0) <> 2026
         or input->>'target_tournament_id' is distinct from '2099'
         or coalesce((input->>'target_tournament_year')::integer, 0) <> 2099
         or input->>'expected_current_tournament_id' is distinct from '2099'
         or input->>'expected_runtime_generation_id' is distinct from
           '${runtimeGeneration}'
         or input->>'annual_destination_workbook_id' is distinct from '${workbook}'
      then
        raise exception using errcode='55000',
          message='PRODUCTION_ANNUAL_SCORING_RUNTIME_REQUIRED';
      end if;
      return '2099';
    end $$;
  `);

  const inputSnapshot = {
    metadata: { settingsFingerprint: "7".repeat(64) },
    sheets: { tournaments: [{ "Tournament ID": "2099" }] },
  };
  const checkpoint = {};
  const inputFingerprint = sha256(JSON.stringify(inputSnapshot));
  const checkpointHash = sha256(JSON.stringify(checkpoint));
  const invocation = {
    productionJobIdentityContract:
      "production-odds-calculation-job-identity-v2",
    jobContractVersion: "championship-odds-calculation-job-v1",
    tournamentId: "2099",
    phase: "After Round 1",
    iterations: 10000,
    inputFingerprint,
    settingsFingerprint: "7".repeat(64),
    engineVersion: "engine-v1",
    publicationContractVersion: "publication-v1",
    checkpointContractVersion: "checkpoint-v1",
    deterministicSeed: "annual-seed",
    operationMode: "PRODUCTION_CUTOVER",
    deploymentCommit: "1".repeat(40),
    candidateHostname: "",
    rehearsalNamespace: "",
    rehearsalFixtureFingerprint: "",
    annualRuntimeGenerationId: runtimeGeneration,
    annualPointerRevision: 2,
    annualAuthorityGenerationId: authorityGeneration,
    annualAdmissionGenerationId: admissionGeneration,
  };
  const invocationCanonical = JSON.stringify(invocation);
  const jobId = sha256(invocationCanonical);
  const sourceRevision = {
    configuration_id: configId2099,
    configuration_revision: 1,
    source_fingerprint: "b".repeat(64),
    bundle_fingerprint: synchronizedConfiguration.bundleFingerprint,
    settings_fingerprint: "7".repeat(64),
    effective_settings_fingerprint: "c".repeat(64),
    ratings_fingerprint: synchronizedConfiguration.ratingsFingerprint,
    pairing_fingerprint: synchronizedConfiguration.pairingFingerprint,
    production_job_identity_contract:
      "production-odds-calculation-job-identity-v2",
    annual_odds_contract: "production-annual-odds-dispatch-v1",
    annual_tournament_id: "2099",
    annual_pointer_revision: 2,
    annual_runtime_generation_id: runtimeGeneration,
    annual_authority_generation_id: authorityGeneration,
    annual_admission_generation_id: admissionGeneration,
  };
  const request = {
    annual_scoring_dispatch_contract: "production-annual-scoring-dispatch-v1",
    annual_scoring_operation: "dispatch_production_annual_odds_v1",
    annual_odds_dispatch_contract: "production-annual-odds-dispatch-v1",
    annual_odds_operation: "request_production_odds_calculation_job",
    expected_current_tournament_id: "2099",
    expected_pointer_revision: 2,
    expected_runtime_generation_id: runtimeGeneration,
    expected_annual_authority_generation_id: authorityGeneration,
    expected_annual_admission_generation_id: admissionGeneration,
    annual_destination_workbook_id: workbook,
    tournament_id: "2026",
    tournament_year: 2026,
    target_tournament_id: "2099",
    target_tournament_year: 2099,
    phase: "After Round 1",
    total_iterations: 10000,
    engine_version: "engine-v1",
    publication_contract_version: "publication-v1",
    checkpoint_contract_version: "checkpoint-v1",
    deterministic_seed: "annual-seed",
    input_fingerprint: inputFingerprint,
    settings_fingerprint: "7".repeat(64),
    effective_settings_fingerprint: "c".repeat(64),
    input_bundle_fingerprint: synchronizedConfiguration.bundleFingerprint,
    job_id: jobId,
    invocation_fingerprint: jobId,
    invocation_canonical_json: invocationCanonical,
    input_snapshot: inputSnapshot,
    input_snapshot_canonical_json: JSON.stringify(inputSnapshot),
    checkpoint_payload: checkpoint,
    checkpoint_hash: checkpointHash,
    checkpoint_canonical_json: JSON.stringify(checkpoint),
    source_revision: sourceRevision,
    input_configuration_id: configId2099,
    configuration_revision: 1,
    requested_by: "step13e7b1",
    output_timestamp: "2099-01-01T00:00:00Z",
    deployment_commit: "1".repeat(40),
  };

  const oddsRuntimeState = JSON.parse(sql(cluster, database, `select
    jsonb_build_object(
      'publicationAuthority',resource.odds_publication_authority,
      'publicationEnabled',resource.odds_publication_enabled,
      'scoringAuthority',resource.scoring_authority,
      'readAuthority',resource.current_tournament_read_authority,
      'workersEnabled',resource.workers_enabled,
      'runtimeEnabled',runtime.enabled,
      'runtimeMode',runtime.operation_mode,
      'runtimePhase',runtime.cutover_phase,
      'runtimeCommit',runtime.deployment_commit,
      'workerEnabled',worker.enabled,
      'workerGoogleWrites',worker.google_writes_allowed,
      'contractAllowed',contract.operation_allowed,
      'schedulerInstalled',contract.scheduler_installed,
      'authoritativeWriteAllowed',contract.authoritative_write_allowed
    )::text
    from production_control.resource_scope resource
    cross join production_control.odds_calculation_runtime runtime
    cross join production_control.worker_controls worker
    cross join production_control.worker_contracts contract
    where resource.scope_key='BAGGER_INV_PRODUCTION'
      and runtime.scope_key='BAGGER_INV_PRODUCTION'
      and worker.worker_name='ODDS_CALCULATION'
      and contract.worker_name='ODDS_CALCULATION';`));
  assert.equal(oddsRuntimeState.runtimeCommit, request.deployment_commit,
    JSON.stringify(oddsRuntimeState));

  const created = JSON.parse(sql(cluster, database, `select
    public.dispatch_production_annual_scoring_v1(${json(request)})::text;`));
  assert.equal(created.ok, true);
  assert.equal(created.changed, true);
  assert.equal(created.job.tournament_id, "2099");
  assert.equal(created.job.runtime_generation_id, runtimeGeneration);
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select status from scoring_authority.odds_calculation_jobs
      where tournament_id='2026'),
    (select count(*) from scoring_authority.odds_calculation_jobs
      where tournament_id='2026'),
    (select count(*) from scoring_authority.odds_calculation_jobs
      where tournament_id='2099' and runtime_generation_id=
        '${runtimeGeneration}'));`), "PENDING|1|1");

  const duplicate = JSON.parse(sql(cluster, database, `select
    public.dispatch_production_annual_scoring_v1(${json(request)})::text;`));
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(sql(cluster, database, `select count(*) from
    scoring_authority.odds_calculation_jobs where tournament_id='2099';`), "1");

  const read = JSON.parse(sql(cluster, database, `select
    public.dispatch_production_annual_scoring_v1(${json({
      ...request,
      annual_odds_operation: "read_production_odds_calculation_jobs",
      job_id: "",
    })})::text;`));
  assert.equal(read.jobs.length, 1);
  assert.equal(read.jobs[0].tournament_id, "2099");
  assert.equal(read.jobs[0].runtime_generation_id, runtimeGeneration);

  for (const [invalid, errorCode] of [
    [{ expected_current_tournament_id: "2026" },
      /PRODUCTION_ANNUAL_SCORING_RUNTIME_REQUIRED/],
    [{ expected_runtime_generation_id:
      "90000000-0000-4000-8000-000000000009" },
    /PRODUCTION_ANNUAL_SCORING_RUNTIME_REQUIRED/],
    [{ target_tournament_id: "2028" },
      /PRODUCTION_ANNUAL_SCORING_RUNTIME_REQUIRED/],
    [{ annual_destination_workbook_id: "wrong-workbook" },
      /PRODUCTION_ANNUAL_SCORING_RUNTIME_REQUIRED/],
  ]) {
    assert.throws(() => sql(cluster, database, `select
      public.dispatch_production_annual_scoring_v1(${json({
        ...request,
        ...invalid,
      })});`), errorCode);
  }
});
