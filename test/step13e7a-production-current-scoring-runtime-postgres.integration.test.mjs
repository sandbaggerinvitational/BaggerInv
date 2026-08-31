import assert from "node:assert/strict";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrations = [
  "202608300064_production_future_year_administration_v1.sql",
  "202608300065_production_future_year_runtime_role_guard.sql",
  "202608300066_production_future_runtime_activation_v1.sql",
  "202608300067_production_current_scoring_runtime_v1.sql",
].map((name) => path.join(root, "supabase/production_migrations", name));
const pgBin = "/opt/homebrew/opt/postgresql@17/bin";
const bin = Object.fromEntries(["createdb", "initdb", "pg_ctl", "psql"]
  .map((name) => [name, path.join(pgBin, name)]));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, ...options,
  });
  if (result.error || result.status !== 0) {
    throw new Error([command, result.stdout, result.stderr]
      .filter(Boolean).join("\n"));
  }
  return result.stdout.trim();
}

function environment(cluster) {
  return { ...process.env, PGHOST: cluster.socket, PGPORT: String(cluster.port),
    PGUSER: "postgres", PGOPTIONS: "-c request.jwt.claim.role=service_role" };
}

function sql(cluster, database, input) {
  return run(bin.psql, ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", database],
    { env: environment(cluster), input });
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
  } catch { return false; }
}

async function createCluster() {
  const directory = await mkdtemp("/tmp/bagger-step13e7a-pg-");
  const data = path.join(directory, "data");
  const socket = path.join(directory, "socket");
  const log = path.join(directory, "postgres.log");
  await mkdir(socket, { mode: 0o700 });
  run(bin.initdb, ["-D", data, "--username=postgres", "--auth=trust",
    "--no-locale", "--encoding=UTF8", "--set=shared_memory_type=mmap",
    "--set=dynamic_shared_memory_type=mmap"]);
  const port = 56600 + (process.pid % 700);
  run(bin.pg_ctl, ["-D", data, "-l", log, "-o",
    `-F -k ${socket} -h '' -p ${port}`, "-w", "start"]);
  return { directory, data, socket, log, port, started: true };
}

async function destroyCluster(cluster) {
  if (cluster?.started) run(bin.pg_ctl,
    ["-D", cluster.data, "-m", "fast", "-w", "stop"]);
  if (cluster?.directory) await rm(cluster.directory,
    { recursive: true, force: true });
}

function fixture(cluster, database) {
  sql(cluster, database, String.raw`
    set check_function_bodies = off;
    create role anon nologin; create role authenticated nologin;
    create role service_role nologin;
    create schema extensions; create extension pgcrypto with schema extensions;
    create schema auth; create schema production_control;
    create schema scoring_authority; create schema participant_identity;
    create table auth.users(id uuid primary key);
    create table scoring_authority.players(player_id text primary key,
      display_name text not null, source_payload jsonb not null default '{}');
    create table scoring_authority.tournaments(tournament_id text primary key,
      tournament_year int unique not null, name text not null,
      source_workbook_id text not null, scoring_authority text not null default 'SUPABASE',
      updated_at timestamptz not null default now());
    create table scoring_authority.teams(tournament_id text not null,
      team_id text not null, team_side int not null, name text not null,
      source_payload jsonb not null default '{}', primary key(tournament_id,team_id));
    create table scoring_authority.tournament_players(tournament_id text not null,
      player_id text not null, team_id text, team_side int,
      participation_status text not null default 'ACTIVE', source_roster_key text,
      source_payload jsonb not null default '{}', tournament_handicap numeric,
      handicap_index numeric, course_handicap numeric, playing_handicap numeric,
      final_strokes int, handicap_revision_id uuid,
      primary key(tournament_id,player_id));
    create table scoring_authority.rounds(tournament_id text not null,
      round_number int not null, format text not null, name text not null,
      handicap_allowance numeric, status text not null default 'UPCOMING',
      source_payload jsonb not null default '{}', primary key(tournament_id,round_number));
    create table scoring_authority.matches(match_id text primary key,
      tournament_id text not null, round_number int not null default 1,
      format text not null default 'BB', scoring_snapshot_id text not null default 'S',
      status text not null default 'UPCOMING', scoring_locked boolean not null default true,
      match_revision bigint not null default 0, scored_holes int not null default 0,
      current_hole int not null default 0, holes_remaining int not null default 18,
      unresolved_mutations int not null default 0, scorecard_complete boolean not null default false,
      finalized_at timestamptz, updated_at timestamptz not null default now());
    create table scoring_authority.scoring_snapshots(snapshot_id text primary key,
      tournament_id text not null, match_id text, snapshot_revision bigint,
      scoring_rules_version text, format text, handicap_allowance numeric,
      course_id text, tee text, rating numeric, slope int, par int,
      match_netting_baseline text, hole_definitions jsonb,
      participant_configuration jsonb, team_configuration jsonb,
      effective_at timestamptz, canonical_hash text, handicap_revision_id uuid);
    create table scoring_authority.completed_history_course_identities(
      course_id text primary key, canonical_name text, canonical_location text);
    create table scoring_authority.tournament_setup_course_tees_v1(
      tournament_id text, course_id text, tee_id text, display_name text,
      location text, rating numeric, slope int, par int, setup_revision bigint,
      updated_by_player_id text, primary key(tournament_id,course_id,tee_id));
    create table scoring_authority.tournament_setup_course_holes_v1(
      tournament_id text, course_id text, tee_id text, hole_number int,
      par int, stroke_index int, yardage int, setup_revision bigint,
      primary key(tournament_id,course_id,tee_id,hole_number));
    create table scoring_authority.tournament_setup_round_courses_v1(
      tournament_id text, round_number int, course_id text, tee_id text,
      setup_revision bigint, updated_by_player_id text,
      primary key(tournament_id,round_number));
    create table scoring_authority.tournament_setup_round_details_v1(
      tournament_id text, round_number int, team_size int default 2,
      points_available numeric, display_order int, setup_revision bigint,
      updated_by_player_id text, primary key(tournament_id,round_number));
    create table scoring_authority.tournament_setup_operational_v1(
      tournament_id text primary key, destination text, start_date date,
      end_date date, timezone text, operational_status text,
      setup_revision bigint, updated_by_player_id text);
    create table scoring_authority.tournament_setup_team_details_v1(
      tournament_id text, team_id text, captain_player_id text,
      setup_revision bigint, updated_by_player_id text,
      primary key(tournament_id,team_id));
    create table scoring_authority.tournament_setup_match_details_v1(
      match_id text primary key, tournament_id text, match_number int,
      course_id text, tee_id text, tee_time timestamptz, starting_hole int,
      setup_revision bigint, prepared_setup_revision bigint,
      prepared_configuration_fingerprint text, updated_by_player_id text,
      updated_at timestamptz default now());
    create table scoring_authority.match_participants(match_id text,
      team_side int, player_slot int, player_id text, team_id text,
      tournament_handicap numeric, handicap_index numeric, course_handicap numeric,
      playing_handicap numeric, final_strokes int, handicap_revision_id uuid,
      primary key(match_id,team_side,player_slot));
    create table scoring_authority.match_holes(match_id text,hole_number int,
      snapshot_id text,stroke_index int,par int,yardage int,
      primary key(match_id,hole_number));
    create table scoring_authority.hole_scores(match_id text,hole_number int);
    create table scoring_authority.score_mutations(match_id text,mutation_key text);
    create table scoring_authority.scoring_permissions(match_id text,player_id text,
      can_score boolean,revoked_at timestamptz);
    create table scoring_authority.scoring_ingress_leases(lease_id uuid,
      match_id text,expires_at timestamptz);
    create table scoring_authority.google_match_checkpoints(match_id text primary key,
      last_supabase_match_revision bigint,google_match_revision bigint,
      google_hole_revisions jsonb);
    create table scoring_authority.finalized_scorecard_snapshots(
      snapshot_id uuid default gen_random_uuid(),match_id text,state text);
    create table scoring_authority.google_outbox_events(
      id uuid,status text,tournament_id text);
    create table scoring_authority.scorecard_archive_jobs(
      job_id uuid,status text,tournament_id text);
    create table scoring_authority.handicap_revisions(revision_id uuid primary key,
      tournament_id text,revision_number bigint,effective_date date,status text,
      source_system text,source_fingerprint text,entry_count int,reason text,
      created_by_player_id text,approved_by_player_id text,approved_at timestamptz,
      created_at timestamptz default now());
    create table scoring_authority.handicap_revision_entries(revision_id uuid,
      tournament_id text,player_id text,tournament_handicap numeric,
      handicap_index numeric,notes text,source_payload jsonb,
      primary key(revision_id,player_id));
    create table scoring_authority.handicap_revision_current(tournament_id text primary key,
      revision_id uuid,revision_number bigint,effective_date date,approved_at timestamptz);
    create table production_control.resource_scope(scope_key text primary key,
      project_ref text,project_url text,google_workbook_id text,
      current_tournament_id text,current_tournament_year int);
    create table production_control.cutover_activation_state(scope_key text primary key,
      state text,current_authority text,scoring_ingress_enabled boolean,
      active_transition_epoch_id uuid,authority_generation_id uuid,
      activation_revision bigint);
    create table production_control.tournament_setup_context_v1(
      tournament_id text primary key,contract_version text,revision bigint,
      updated_by_player_id text,updated_by_auth_user_id uuid);
    create table production_control.tournament_owner_capabilities_v1(
      tournament_id text,player_id text,auth_user_id uuid,status text,revoked_at timestamptz);
    create table production_control.director_fixture(tournament_id text,
      player_id text,auth_user_id uuid);
    create function production_control.assert_production_service_role()
    returns void language plpgsql as $f$ begin null; end $f$;
    create function production_control.assert_player_access_runtime_v1(jsonb)
    returns void language plpgsql as $f$ begin null; end $f$;
    create function production_control.assert_access_governance_owner_v1(text,text,uuid)
    returns void language plpgsql as $f$ begin null; end $f$;
    create function production_control.assert_access_governance_safe_reason_v1(text)
    returns void language plpgsql as $f$ begin null; end $f$;
    create function production_control.assert_production_scoring_runtime(
      jsonb, text default null
    ) returns void language plpgsql as $f$ begin null; end $f$;
    create function production_control.access_governance_global_status_v1(text)
    returns text language sql as $f$ select 'ACTIVE'::text $f$;
    insert into auth.users values('00000000-0000-4000-8000-000000000001');
    insert into scoring_authority.players values('CB01','Owner','{}');
    insert into scoring_authority.tournaments(tournament_id,tournament_year,name,
      source_workbook_id) values('2026',2026,'Tournament','workbook-production');
    insert into production_control.resource_scope values('BAGGER_INV_PRODUCTION',
      'ymqhhtxaywtqllynrmxe','https://ymqhhtxaywtqllynrmxe.supabase.co',
      'workbook-production','2026',2026);
    insert into production_control.cutover_activation_state values(
      'BAGGER_INV_PRODUCTION','SCORING_COMMITTED','SUPABASE',true,null,
      '00000000-0000-4000-8000-000000000010',1);
    insert into production_control.tournament_owner_capabilities_v1 values(
      '2026','CB01','00000000-0000-4000-8000-000000000001','ACTIVE',null);
  `);
}

test("migration 067 installs atomically and inertly on PostgreSQL 17", async (t) => {
  if (!(await available())) return t.skip("PostgreSQL 17 binaries unavailable");
  const cluster = await createCluster();
  t.after(() => destroyCluster(cluster));
  const database = "step13e7a_future_runtime";
  run(bin.createdb, [database], { env: environment(cluster) });
  fixture(cluster, database);
  sqlFile(cluster, database, migrations[0]);
  sqlFile(cluster, database, migrations[1]);
  const before = sql(cluster, database, `select concat_ws('|',
    (select count(*) from scoring_authority.tournaments),
    (select count(*) from scoring_authority.matches));`);
  sqlFile(cluster, database, migrations[2]);
  const before067 = sql(cluster, database, `select concat_ws('|',
    (select count(*) from scoring_authority.tournaments),
    (select count(*) from scoring_authority.matches),
    (select count(*) from production_control.future_annual_runtime_generations_v1));`);
  sqlFile(cluster, database, migrations[3]);
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select count(*) from scoring_authority.tournaments),
    (select count(*) from scoring_authority.matches),
    (select count(*) from production_control.future_annual_runtime_generations_v1));`), before067);
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select count(*) from scoring_authority.tournaments),
    (select count(*) from scoring_authority.matches));`), before);
  assert.equal(sql(cluster, database, `select count(*)
    from scoring_authority.global_course_catalog_v1;`), "0");
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select count(*) from production_control.future_runtime_promotions_v2),
    (select count(*) from production_control.future_annual_runtime_generations_v1),
    (select count(*) from production_control.future_archive_plans_v1));`), "0|0|0");
  assert.equal(sql(cluster, database, `select concat_ws('|',
    to_regprocedure('public.read_production_future_runtime_v2(jsonb)') is not null,
    to_regprocedure('public.mutate_production_future_runtime_v2(jsonb)') is not null,
    to_regprocedure('public.claim_production_future_google_compatibility_job_v1(jsonb)') is not null,
    has_function_privilege('service_role',
      'public.mutate_production_future_runtime_v2(jsonb)','EXECUTE'),
    has_function_privilege('authenticated',
      'public.mutate_production_future_runtime_v2(jsonb)','EXECUTE'));`), "t|t|t|t|f");
  assert.equal(sql(cluster, database, `select concat_ws('|',
    to_regprocedure('production_control.assert_future_scoring_runtime_capability_v1(text,uuid,uuid,uuid)') is not null,
    to_regprocedure('public.future_production_submit_hole_score_v1(jsonb)') is not null,
    to_regprocedure('public.future_production_mutate_match_control_v1(jsonb)') is not null,
    to_regprocedure('public.future_production_claim_google_outbox_v1(jsonb)') is not null,
    to_regprocedure('public.future_production_claim_scorecard_archive_job_v1(jsonb)') is not null,
    has_function_privilege('service_role',
      'public.future_production_submit_hole_score_v1(jsonb)','EXECUTE'),
    has_function_privilege('authenticated',
      'public.future_production_submit_hole_score_v1(jsonb)','EXECUTE'));`),
    "t|t|t|t|t|t|f");

  sql(cluster, database, `
    insert into scoring_authority.tournaments(
      tournament_id,tournament_year,name,source_workbook_id,scoring_authority
    ) values ('2027',2027,'Future Tournament','workbook-production','SUPABASE');
    insert into production_control.future_tournament_catalog_v1(
      tournament_id,tournament_year,contract_version,tournament_name,
      lifecycle,lifecycle_revision,setup_revision,creation_mode,source_manifest
    ) values ('2027',2027,'production-future-year-administration-v1',
      'Future Tournament','READY_FOR_ACTIVATION',1,1,'BLANK','{}');
    insert into production_control.future_annual_runtime_generations_v1(
      runtime_generation_id,tournament_id,generation_status,runtime_revision,
      pointer_revision,authority_generation_id,admission_generation_id,
      authority,ingress_state,readiness_fingerprint
    ) values (
      '10000000-0000-4000-8000-000000000001','2027','PREPARED',1,2,
      '20000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000003',
      'SUPABASE','OPEN',repeat('a',64)
    );
  `);
  assert.equal(sql(cluster, database, `select
    production_control.assert_future_scoring_runtime_capability_v1(
      '2027','10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000003');`), "");
  assert.equal(sql(cluster, database, `select concat_ws('|',
    has_function_privilege('service_role',
      'production_control.assert_future_scoring_runtime_capability_v1(text,uuid,uuid,uuid)',
      'EXECUTE'),
    has_function_privilege('authenticated',
      'production_control.assert_future_scoring_runtime_capability_v1(text,uuid,uuid,uuid)',
      'EXECUTE'));`), "f|f");
  assert.equal(sql(cluster, database, `do $test$
    begin
      perform production_control.assert_future_scoring_runtime_capability_v1(
        '2027','10000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000002',
        '40000000-0000-4000-8000-000000000004');
      raise exception 'EXPECTED_REJECTION';
    exception when sqlstate '55000' then
      if sqlerrm <> 'FUTURE_SCORING_RUNTIME_CAPABILITY_INVALID' then raise; end if;
    end $test$; select 'wrong-generation-rejected';`),
    "wrong-generation-rejected");

  sql(cluster, database, `
    update production_control.future_tournament_catalog_v1
      set lifecycle = 'CLOSED', lifecycle_revision = 2
      where tournament_id = '2026';
    update production_control.future_tournament_catalog_v1
      set lifecycle = 'ACTIVE', lifecycle_revision = 2
      where tournament_id = '2027';
    update production_control.current_tournament_pointer_v1
      set tournament_id = '2027', tournament_year = 2027,
          pointer_revision = 2, lifecycle_revision = 2
      where scope_key = 'BAGGER_INV_PRODUCTION';
    update production_control.future_annual_runtime_generations_v1
      set generation_status = 'ACTIVE', activated_at = clock_timestamp()
      where tournament_id = '2027';
  `);
  const exactRuntimeInput = `jsonb_build_object(
    'expected_current_tournament_id','2027',
    'expected_pointer_revision',2,
    'expected_runtime_generation_id','10000000-0000-4000-8000-000000000001',
    'expected_annual_authority_generation_id','20000000-0000-4000-8000-000000000002',
    'expected_annual_admission_generation_id','30000000-0000-4000-8000-000000000003'
  )`;
  assert.equal(sql(cluster, database, `select
    production_control.assert_future_production_scoring_runtime_v1(
      ${exactRuntimeInput}, null
    );`), "2027");
  assert.equal(sql(cluster, database, `select concat_ws('|',
    result->>'ok', result->>'mode', result#>>'{data,authority}',
    result#>>'{data,ingress,state}', result#>>'{data,matches}')
    from (select public.future_production_read_scoring_authority_v1(
      ${exactRuntimeInput} || jsonb_build_object('mode','DIAGNOSTICS')
    ) result) value;`), "true|DIAGNOSTICS|SUPABASE|OPEN|0");
  assert.equal(sql(cluster, database, `do $test$
    begin
      perform production_control.assert_future_production_scoring_runtime_v1(
        jsonb_build_object(
          'expected_current_tournament_id','2027',
          'expected_pointer_revision',1,
          'expected_runtime_generation_id','10000000-0000-4000-8000-000000000001',
          'expected_annual_authority_generation_id','20000000-0000-4000-8000-000000000002',
          'expected_annual_admission_generation_id','30000000-0000-4000-8000-000000000003'
        ), null);
      raise exception 'EXPECTED_REJECTION';
    exception when sqlstate '55000' then
      if sqlerrm <> 'PRODUCTION_FUTURE_SCORING_RUNTIME_REQUIRED' then raise; end if;
    end $test$; select 'stale-pointer-rejected';`), "stale-pointer-rejected");
});
