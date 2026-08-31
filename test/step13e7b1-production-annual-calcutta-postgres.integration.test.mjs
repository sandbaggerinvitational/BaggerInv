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
const predecessor = "202608300068_production_future_participant_identity_runtime_v1.sql";
const migration075 = "202608300075_production_annual_calcutta_v1.sql";
const providerInventory = "202608260038_production_provider_preview_target_inventory_v4.sql";
const pgBin = "/opt/homebrew/opt/postgresql@17/bin";
const bin = Object.fromEntries(["createdb", "initdb", "pg_ctl", "psql"]
  .map((name) => [name, path.join(pgBin, name)]));

const frozenMutations = [
  "public.configure_production_calcutta_v1(jsonb)",
  "public.replace_production_calcutta_v1_auction_facts(jsonb)",
  "public.publish_production_calcutta_v1(jsonb)",
  "public.unpublish_production_calcutta_v1(jsonb)",
  "public.enqueue_production_calcutta_v1_recalculation(jsonb)",
  "public.claim_production_calcutta_v1_recalculation(jsonb)",
  "public.complete_production_calcutta_v1_recalculation(jsonb)",
  "public.fail_production_calcutta_v1_recalculation(jsonb)",
];

const futureTargets = [
  "public.future_production_configure_calcutta_v1(jsonb)",
  "public.future_production_replace_calcutta_auction_facts_v1(jsonb)",
  "public.future_production_publish_calcutta_v1(jsonb)",
  "public.future_production_unpublish_calcutta_v1(jsonb)",
  "public.future_production_enqueue_calcutta_recalculation_v1(jsonb)",
  "public.future_production_claim_calcutta_recalculation_v1(jsonb)",
  "public.future_production_complete_calcutta_recalculation_v1(jsonb)",
  "public.future_production_fail_calcutta_recalculation_v1(jsonb)",
  "public.future_production_inspect_calcutta_v1(jsonb)",
  "public.future_production_resolve_calcutta_postcommit_match_v1(jsonb)",
];

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

function environment(cluster, extras = {}) {
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
    env: environment(cluster),
    input,
  });
}

function sqlFile(cluster, database, filename) {
  return run(bin.psql, ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", database,
    "-f", filename], { env: environment(cluster) });
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
  const directory = await mkdtemp(path.join(os.tmpdir(), "bagger-calcutta75-pg17-"));
  const data = path.join(directory, "data");
  const socket = path.join(directory, "socket");
  const log = path.join(directory, "postgres.log");
  await mkdir(socket, { mode: 0o700 });
  run(bin.initdb, ["-D", data, "--username=postgres", "--auth=trust",
    "--no-locale", "--encoding=UTF8", "--set=shared_memory_type=mmap",
    "--set=dynamic_shared_memory_type=mmap"]);
  const port = 59400 + (process.pid % 300);
  run(bin.pg_ctl, ["-D", data, "-l", log, "-o",
    `-F -k ${socket} -h '' -p ${port}`, "-w", "start"]);
  return { directory, data, socket, log, port, started: true };
}

async function destroyCluster(cluster) {
  if (cluster?.started) {
    run(bin.pg_ctl, ["-D", cluster.data, "-m", "fast", "-w", "stop"]);
  }
  if (cluster?.directory) {
    assert.equal(path.dirname(cluster.directory), path.resolve(os.tmpdir()));
    assert.match(path.basename(cluster.directory), /^bagger-calcutta75-pg17-/);
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
      select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), current_user)
    $$;
    create function public.rls_auto_enable()
    returns void language plpgsql as $$ begin end $$;
  `);
}

function installAnnualPlatformFixture(cluster, database) {
  sql(cluster, database, `
    set session_replication_role = replica;
    insert into production_control.maintenance_deployment_capability_bindings (
      capability_binding_id, rebind_id, boundary_mode, contract_version,
      capability_ceiling, tournament_id, epoch_id, deployment_id,
      deployment_commit, capability_manifest, capability_fingerprint,
      runtime_observed_at, request_fingerprint, payload_hash, actor_id,
      response_value
    ) select
      '75000000-0000-4000-8000-000000000001',
      '75000000-0000-4000-8000-000000000002',
      'MAINTENANCE_WINDOW_V1',
      'production-maintenance-single-deployment-capability-v1',
      'OBSERVATION', '2026', value.authority_generation_id,
      'dpl_CalcuttaAnnual075', repeat('7', 40), '{}'::jsonb,
      repeat('7', 64), pg_catalog.clock_timestamp(), repeat('8', 64),
      repeat('9', 64), 'step13e7b1-calcutta-fixture', '{}'::jsonb
    from production_control.cutover_activation_state value
    where value.scope_key = 'BAGGER_INV_PRODUCTION';
    set session_replication_role = origin;
  `);
}

function functionDefinition(cluster, database, signature) {
  const escaped = signature.replaceAll("'", "''");
  return sql(cluster, database, `select pg_catalog.pg_get_functiondef(
    '${escaped}'::pg_catalog.regprocedure);`);
}

async function migrationNames() {
  return (await readdir(migrationsDirectory))
    .filter((name) => /^\d+_.*\.sql$/.test(name))
    .sort();
}

test("migration 075 compiles inertly, preserves 2026 RPCs, and enforces PostgreSQL cross-year isolation", async (t) => {
  if (!(await available())) return t.skip("PostgreSQL 17 binaries unavailable");
  const cluster = await createCluster();
  t.after(() => destroyCluster(cluster));
  const database = "step13e7b1_calcutta";
  run(bin.createdb, [database], { env: environment(cluster, { PGOPTIONS: "" }) });
  installSupabaseCompatibility(cluster, database);

  const names = await migrationNames();
  const predecessorIndex = names.indexOf(predecessor);
  const migrationIndex = names.indexOf(migration075);
  assert.ok(predecessorIndex >= 0 && migrationIndex > predecessorIndex);
  for (const name of names.slice(0, predecessorIndex + 1)) {
    sqlFile(cluster, database, path.join(migrationsDirectory, name));
    if (name === providerInventory) {
      sql(cluster, database, `
        insert into scoring_authority.tournaments (
          tournament_id, tournament_year, name, source_workbook_id,
          scoring_authority
        ) values (
          '2026', 2026, 'Calcutta annual fixture',
          '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4', 'GOOGLE'
        );
        insert into scoring_authority.ingress_gates (
          tournament_id, state, authority, active_epoch_id,
          unresolved_client_queues, updated_by
        ) values ('2026', 'PAUSED', 'GOOGLE', null, 0, 'step13e7b1');
      `);
    }
  }
  installAnnualPlatformFixture(cluster, database);

  const frozenBefore = Object.fromEntries(frozenMutations.map((signature) =>
    [signature, functionDefinition(cluster, database, signature)]));
  const inertBefore = sql(cluster, database, `select concat_ws('|',
    (select count(*) from scoring_authority.calcutta_v1_configuration_revisions),
    (select count(*) from scoring_authority.calcutta_v1_auction_fact_revisions),
    (select count(*) from scoring_authority.calcutta_v1_publication_revisions),
    (select count(*) from scoring_authority.calcutta_v1_current),
    (select count(*) from scoring_authority.calcutta_v1_recalculation_jobs),
    (select count(*) from scoring_authority.calcutta_v1_result_revisions),
    (select count(*) from production_control.operation_audit_events
      where domain='CALCUTTA'));`);

  for (const name of names.slice(predecessorIndex + 1, migrationIndex + 1)) {
    sqlFile(cluster, database, path.join(migrationsDirectory, name));
  }

  for (const signature of frozenMutations) {
    assert.equal(functionDefinition(cluster, database, signature),
      frozenBefore[signature], `${signature} must retain its frozen 2026 body`);
  }
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select count(*) from scoring_authority.calcutta_v1_configuration_revisions),
    (select count(*) from scoring_authority.calcutta_v1_auction_fact_revisions),
    (select count(*) from scoring_authority.calcutta_v1_publication_revisions),
    (select count(*) from scoring_authority.calcutta_v1_current),
    (select count(*) from scoring_authority.calcutta_v1_recalculation_jobs),
    (select count(*) from scoring_authority.calcutta_v1_result_revisions),
    (select count(*) from production_control.operation_audit_events
      where domain='CALCUTTA'));`), inertBefore);

  const targetRegprocedures = futureTargets.map((signature) =>
    `'${signature}'::pg_catalog.regprocedure`).join(",");
  assert.equal(sql(cluster, database, `select concat_ws('|',
    pg_catalog.bool_and(not pg_catalog.has_function_privilege(
      'service_role', value.oid, 'EXECUTE')),
    pg_catalog.bool_and(not pg_catalog.has_function_privilege(
      'authenticated', value.oid, 'EXECUTE')),
    pg_catalog.bool_and(not pg_catalog.has_function_privilege(
      'anon', value.oid, 'EXECUTE')))
    from pg_catalog.unnest(array[${targetRegprocedures}]) value(oid);`),
  "t|t|t");
  assert.equal(sql(cluster, database, `select concat_ws('|',
    count(*),
    count(*) filter (where required_phase='OBSERVATION'),
    count(*) filter (where operation_class='MUTATION'),
    count(*) filter (where operation_class='READ'))
    from production_control.annual_scoring_rpc_allowlist_v1
    where operation_name like '%calcutta%';`), "10|10|8|2");

  // The 2026 direct path re-checks the pointer only after acquiring the shared
  // admission lock. A stale service resolver cannot mutate the predecessor.
  sql(cluster, database, `
    set session_replication_role=replica;
    update production_control.future_tournament_catalog_v1
      set lifecycle='CLOSED', lifecycle_revision=2
      where tournament_id='2026';
    insert into production_control.future_tournament_catalog_v1(
      tournament_id,tournament_year,contract_version,tournament_name,
      lifecycle,lifecycle_revision,setup_revision,creation_mode
    ) values (
      '2099',2099,'production-future-year-administration-v1',
      'Calcutta Future Fixture','ACTIVE',2,1,'BLANK'
    );
    update production_control.current_tournament_pointer_v1
      set tournament_id='2099',tournament_year=2099,pointer_revision=2,
        lifecycle_revision=2 where scope_key='BAGGER_INV_PRODUCTION';
    set session_replication_role=origin;
  `);
  assert.throws(() => sql(cluster, database, `select
    public.configure_production_calcutta_v1('{}'::jsonb);`),
  /PRODUCTION_LEGACY_SCORING_POINTER_CHANGED/);

  // Auction validation accepts only exact-target memberships and never uses
  // a same-ID/previous-year roster row as a substitute.
  sql(cluster, database, `
    insert into scoring_authority.tournaments(
      tournament_id,tournament_year,name,source_workbook_id,scoring_authority
    ) values (
      '2099',2099,'Calcutta Future Fixture',
      'future-calcutta-workbook-2099','SUPABASE'
    );
    insert into scoring_authority.players(player_id,display_name) values
      ('C2601','Predecessor-only entrant'),
      ('C9901','Future entrant'),('C9902','Future owner');
    insert into scoring_authority.teams(tournament_id,team_id,team_side,name)
    values ('2026','C26T',1,'Predecessor'),
      ('2099','C99T',1,'Future');
    insert into scoring_authority.tournament_players(
      tournament_id,player_id,team_id,team_side,source_roster_key
    ) values ('2026','C2601','C26T',1,'C2601'),
      ('2099','C9901','C99T',1,'C9901'),
      ('2099','C9902','C99T',1,'C9902');
  `);
  const invalidAuction = `jsonb_build_object(
    'contract_version','production-calcutta-v1',
    'purchases',jsonb_build_array(jsonb_build_object(
      'player_id','C2601','purchase_price','100.125')),
    'ownership',jsonb_build_array(jsonb_build_object(
      'player_id','C2601','owner_player_id','C9902',
      'ownership_fraction','1')))`;
  assert.throws(() => sql(cluster, database, `select
    production_control.build_annual_calcutta_v1_auction(
      ${invalidAuction},'2099');`), /PRODUCTION_CALCUTTA_PURCHASE_INVALID/);
  const validAuction = JSON.parse(sql(cluster, database, `select
    production_control.build_annual_calcutta_v1_auction(
      jsonb_build_object(
        'contract_version','production-calcutta-v1',
        'purchases',jsonb_build_array(jsonb_build_object(
          'player_id','C9901','purchase_price','100.125')),
        'ownership',jsonb_build_array(jsonb_build_object(
          'player_id','C9901','owner_player_id','C9902',
          'ownership_fraction','1'))
      ),'2099')::text;`));
  assert.equal(validAuction.tournament_id, "2099");
  assert.equal(Number(validAuction.pot), 100.125);

  assert.throws(() => sql(cluster, database, `set role service_role;
    select public.future_production_inspect_calcutta_v1('{}'::jsonb);`),
  /permission denied for function future_production_inspect_calcutta_v1/);
});
