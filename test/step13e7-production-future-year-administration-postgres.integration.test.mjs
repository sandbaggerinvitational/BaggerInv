import assert from "node:assert/strict";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = path.join(root,
  "supabase/production_migrations/202608300064_production_future_year_administration_v1.sql");
const pgBin = "/opt/homebrew/opt/postgresql@17/bin";
const bin = Object.fromEntries(["createdb", "initdb", "pg_ctl", "psql"]
  .map((name) => [name, path.join(pgBin, name)]));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, ...options,
  });
  if (result.error || result.status !== 0) {
    const error = new Error([command, result.stdout, result.stderr]
      .filter(Boolean).join("\n"));
    error.result = result;
    throw error;
  }
  return result.stdout.trim();
}

function environment(cluster, role = "service_role") {
  return {
    ...process.env,
    PGHOST: cluster.socket,
    PGPORT: String(cluster.port),
    PGUSER: "postgres",
    PGOPTIONS: role ? `-c request.jwt.claim.role=${role}` : "",
  };
}

function sql(cluster, database, input, { role = "service_role" } = {}) {
  return run(bin.psql, ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", database], {
    env: environment(cluster, role), input,
  });
}

function sqlFile(cluster, database, filename) {
  return run(bin.psql, ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", database,
    "-f", filename], { env: environment(cluster) });
}

async function available() {
  try {
    await Promise.all(Object.values(bin)
      .map((value) => access(value, fsConstants.X_OK)));
    return true;
  } catch { return false; }
}

async function createCluster() {
  const directory = await mkdtemp("/tmp/bagger-future-year-pg-");
  const data = path.join(directory, "data");
  const socket = path.join(directory, "socket");
  const log = path.join(directory, "postgres.log");
  await mkdir(socket, { mode: 0o700 });
  run(bin.initdb, ["-D", data, "--username=postgres", "--auth=trust",
    "--no-locale", "--encoding=UTF8", "-c", "shared_memory_type=mmap",
    "-c", "dynamic_shared_memory_type=mmap"]);
  const port = 55437 + (process.pid % 1000);
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

const owner = {
  playerId: "CB01", authUserId: "00000000-0000-4000-8000-000000000001",
};
const director = {
  playerId: "CB02", authUserId: "00000000-0000-4000-8000-000000000002",
};

function json(value) {
  return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
}

function scope(actor, operation, overrides = {}) {
  return {
    contract_version: "production-future-year-administration-v1",
    environment: "PRODUCTION",
    project_ref: "ymqhhtxaywtqllynrmxe",
    project_url: "https://ymqhhtxaywtqllynrmxe.supabase.co",
    source_workbook_id: "workbook-production",
    tournament_id: "2026",
    actor_player_id: actor.playerId,
    actor_auth_user_id: actor.authUserId,
    authorization: {
      tournament_id: "2026", player_id: actor.playerId,
      auth_user_id: actor.authUserId, role: "DIRECTOR",
    },
    operation,
    ...overrides,
  };
}

function operationId(number) {
  return `20000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
}

function mutation(actor, operation, target, expectedRevision, number, values = {}) {
  return scope(actor, operation, {
    target_tournament_id: target,
    expected_revision: expectedRevision,
    operation_request_id: operationId(number),
    request_payload_hash: String(number % 10).repeat(64),
    reason: "Authorized future tournament administration operation",
    ...values,
  });
}

function rpc(cluster, database, functionName, input, options) {
  return JSON.parse(sql(cluster, database,
    `select public.${functionName}(${json(input)})::text;`, options));
}

function fixture(cluster, database) {
  sql(cluster, database, String.raw`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create schema extensions;
    create extension pgcrypto with schema extensions;
    create schema auth;
    create schema production_control;
    create schema scoring_authority;

    create table auth.users (id uuid primary key, email text);
    create table scoring_authority.players (
      player_id text primary key, display_name text not null,
      source_payload jsonb not null default '{}'::jsonb
    );
    create table scoring_authority.tournaments (
      tournament_id text primary key, tournament_year integer not null unique,
      name text not null, source_workbook_id text not null,
      updated_at timestamptz not null default now()
    );
    create table scoring_authority.teams (
      tournament_id text not null, team_id text not null,
      team_side integer not null, name text not null,
      source_payload jsonb not null default '{}'::jsonb,
      primary key (tournament_id, team_id)
    );
    create table scoring_authority.rounds (
      tournament_id text not null, round_number integer not null,
      format text not null, name text not null, handicap_allowance numeric,
      status text not null default 'UPCOMING',
      source_payload jsonb not null default '{}'::jsonb,
      primary key (tournament_id, round_number)
    );
    create table scoring_authority.matches (
      match_id text primary key, tournament_id text not null
    );
    create table scoring_authority.scoring_snapshots (
      snapshot_id text primary key, tournament_id text not null
    );
    create table scoring_authority.completed_history_course_identities (
      course_id text primary key, canonical_name text not null,
      canonical_location text
    );
    create table scoring_authority.tournament_setup_round_details_v1 (
      tournament_id text not null, round_number integer not null,
      points_available numeric not null, setup_revision bigint not null,
      primary key (tournament_id, round_number)
    );
    create table scoring_authority.tournament_setup_course_tees_v1 (
      tournament_id text not null, course_id text not null, tee_id text not null,
      display_name text not null, location text, rating numeric not null,
      slope integer not null, par integer not null, setup_revision bigint not null,
      primary key (tournament_id, course_id, tee_id)
    );
    create table scoring_authority.tournament_setup_course_holes_v1 (
      tournament_id text not null, course_id text not null, tee_id text not null,
      hole_number integer not null, par integer not null,
      stroke_index integer not null, yardage integer,
      primary key (tournament_id, course_id, tee_id, hole_number)
    );
    create table scoring_authority.tournament_setup_round_courses_v1 (
      tournament_id text not null, round_number integer not null,
      course_id text not null, tee_id text not null, setup_revision bigint not null,
      primary key (tournament_id, round_number)
    );
    create table production_control.resource_scope (
      scope_key text primary key, project_ref text not null,
      project_url text not null, google_workbook_id text not null,
      current_tournament_id text not null, current_tournament_year integer not null
    );
    create table production_control.tournament_owner_capabilities_v1 (
      tournament_id text not null, player_id text not null,
      auth_user_id uuid not null, status text not null,
      revoked_at timestamptz, primary key (tournament_id, player_id)
    );
    create table production_control.director_fixture (
      tournament_id text not null, player_id text not null,
      auth_user_id uuid not null, primary key (tournament_id, player_id)
    );

    create function production_control.assert_player_access_runtime_v1(input jsonb)
    returns void language plpgsql security definer set search_path=pg_catalog,
      production_control as $fixture$
    begin
      if current_setting('request.jwt.claim.role', true) is distinct from 'service_role'
         or input->>'contract_version' is distinct from 'production-players-access-v1'
         or input->>'environment' is distinct from 'PRODUCTION'
         or input->>'project_ref' is distinct from 'ymqhhtxaywtqllynrmxe'
         or input->>'project_url' is distinct from 'https://ymqhhtxaywtqllynrmxe.supabase.co'
         or input->>'source_workbook_id' is distinct from 'workbook-production'
         or input->>'tournament_id' is distinct from '2026'
         or input#>>'{authorization,tournament_id}' is distinct from '2026'
         or input#>>'{authorization,role}' is distinct from 'DIRECTOR'
         or not exists (
           select 1 from production_control.director_fixture value
           where value.tournament_id='2026'
             and value.player_id=input#>>'{authorization,player_id}'
             and value.auth_user_id=(input#>>'{authorization,auth_user_id}')::uuid
         ) then
        raise exception using errcode='42501', message='FIXTURE_DIRECTOR_REQUIRED';
      end if;
    end $fixture$;
    create function production_control.assert_access_governance_owner_v1(
      target_tournament text, actor_player text, actor_auth uuid
    ) returns void language plpgsql stable security definer
    set search_path=pg_catalog,production_control as $fixture$
    begin
      if not exists (
        select 1 from production_control.tournament_owner_capabilities_v1 value
        where value.tournament_id=target_tournament
          and value.player_id=actor_player and value.auth_user_id=actor_auth
          and value.status='ACTIVE' and value.revoked_at is null
      ) then
        raise exception using errcode='42501',
          message='ACCESS_GOVERNANCE_ACTIVE_OWNER_REQUIRED';
      end if;
    end $fixture$;
    create function production_control.assert_access_governance_safe_reason_v1(
      reason_value text
    ) returns void language plpgsql immutable set search_path=pg_catalog
    as $fixture$
    begin
      if length(btrim(coalesce(reason_value,''))) not between 10 and 500
         or reason_value ~ '@' then
        raise exception using errcode='22023', message='SAFE_REASON_REQUIRED';
      end if;
    end $fixture$;
    create function production_control.access_governance_global_status_v1(
      target text
    ) returns text language sql stable set search_path=pg_catalog
    as $fixture$ select 'ACTIVE'::text $fixture$;

    insert into auth.users values
      ('${owner.authUserId}','owner@example.invalid'),
      ('${director.authUserId}','director@example.invalid');
    insert into scoring_authority.players values
      ('CB01','Owner','{}'),('CB02','Director','{}'),
      ('CB03','Player Three','{}'),('WD01','Player Four','{}');
    insert into scoring_authority.tournaments values
      ('2026',2026,'Sandbagger Invitational','workbook-production',now());
    insert into scoring_authority.teams values
      ('2026','CB',1,'Pickles','{}'),('2026','WD',2,'Mulligans','{}');
    insert into scoring_authority.rounds values
      ('2026',1,'BB','Best Ball',0.9,'UPCOMING','{}'),
      ('2026',2,'SC','Scramble',1,'UPCOMING','{}'),
      ('2026',3,'SI','Singles',1,'UPCOMING','{}');
    insert into scoring_authority.tournament_setup_round_details_v1 values
      ('2026',1,1,1),('2026',2,1,1),('2026',3,1,1);
    insert into scoring_authority.completed_history_course_identities values
      ('ARCHIVE-ONLY','Archive Course','History');
    insert into scoring_authority.tournament_setup_course_tees_v1 values
      ('2026','COURSE-1','Tournament','Course One','Kiawah',72,120,72,1);
    insert into scoring_authority.tournament_setup_course_holes_v1
      select '2026','COURSE-1','Tournament',number,4,number,400
      from generate_series(1,18) number;
    insert into scoring_authority.tournament_setup_round_courses_v1 values
      ('2026',1,'COURSE-1','Tournament',1);
    insert into production_control.resource_scope values (
      'BAGGER_INV_PRODUCTION','ymqhhtxaywtqllynrmxe',
      'https://ymqhhtxaywtqllynrmxe.supabase.co','workbook-production',
      '2026',2026
    );
    insert into production_control.director_fixture values
      ('2026','${owner.playerId}','${owner.authUserId}'),
      ('2026','${director.playerId}','${director.authUserId}');
    insert into production_control.tournament_owner_capabilities_v1 values
      ('2026','${owner.playerId}','${owner.authUserId}','ACTIVE',null);
  `);
}

test("migration 064 compiles and enforces future-year staging on PostgreSQL 17", async (context) => {
  if (!(await available())) return context.skip("PostgreSQL 17 binaries unavailable");
  const cluster = await createCluster();
  context.after(() => destroyCluster(cluster));
  const database = "future_year_administration_v1";
  run(bin.createdb, [database], { env: environment(cluster) });
  fixture(cluster, database);

  const before = sql(cluster, database, String.raw`
    select concat_ws('|',
      (select count(*) from scoring_authority.tournaments),
      (select count(*) from scoring_authority.matches),
      (select count(*) from scoring_authority.scoring_snapshots));
  `);
  sqlFile(cluster, database, migration);
  assert.equal(sql(cluster, database, String.raw`
    select concat_ws('|',
      (select count(*) from scoring_authority.tournaments),
      (select count(*) from scoring_authority.matches),
      (select count(*) from scoring_authority.scoring_snapshots));
  `), before);
  assert.equal(sql(cluster, database, String.raw`
    select tournament_id || '|' || lifecycle || '|' || setup_revision
    from production_control.future_tournament_catalog_v1;
  `), "2026|ACTIVE|0");
  assert.equal(sql(cluster, database, String.raw`
    select tournament_id || '|' || pointer_revision
    from production_control.current_tournament_pointer_v1;
  `), "2026|1");
  assert.equal(sql(cluster, database, String.raw`
    select concat_ws('|',
      has_function_privilege('service_role',
        'public.read_production_future_year_administration_v1(jsonb)',
        'EXECUTE'),
      has_function_privilege('authenticated',
        'public.read_production_future_year_administration_v1(jsonb)',
        'EXECUTE'),
      has_table_privilege('service_role',
        'production_control.future_tournament_catalog_v1', 'SELECT'));
  `), "t|f|f");

  const catalogRead = rpc(cluster, database,
    "read_production_future_year_administration_v1",
    scope(director, "READ_PRODUCTION_FUTURE_YEAR_ADMINISTRATION_V1"));
  assert.equal(catalogRead.ok, true);
  assert.equal(catalogRead.data.currentTournament.tournamentId, "2026");
  assert.equal(catalogRead.data.selectedTournament, null);
  assert.equal(catalogRead.data.catalog.length, 1);
  assert.equal(catalogRead.data.playerCatalog.length, 4);
  assert.equal(catalogRead.data.courseLibrary.length, 1);
  assert.equal(catalogRead.data.courseLibrary[0].courseId, "COURSE-1");
  assert.equal(catalogRead.data.capabilities.activateTournament, false);
  assert.equal(catalogRead.data.capabilities.createTournament, false);
  const ownerCatalogRead = rpc(cluster, database,
    "read_production_future_year_administration_v1",
    scope(owner, "READ_PRODUCTION_FUTURE_YEAR_ADMINISTRATION_V1"));
  assert.equal(ownerCatalogRead.data.capabilities.createTournament, true);
  assert.throws(() => rpc(cluster, database,
    "read_production_future_year_administration_v1",
    scope(director, "READ_PRODUCTION_FUTURE_YEAR_ADMINISTRATION_V1", {
      project_ref: "preview-project",
    })), /PRODUCTION_FUTURE_YEAR_EXACT_RESOURCE_REQUIRED|FIXTURE_DIRECTOR_REQUIRED/);

  assert.throws(() => rpc(cluster, database,
    "mutate_production_future_year_administration_v1",
    mutation(director, "CREATE_TOURNAMENT", "2027", 0, 90, {
      tournament_year: 2027, tournament_name: "Sandbagger Invitational",
      destination: "Future Site", start_date: "2027-09-23",
      end_date: "2027-09-26", time_zone: "America/Chicago",
      creation_mode: "BLANK",
    })), /FUTURE_TOURNAMENT_OWNER_REQUIRED/);

  const createInput = mutation(owner, "CREATE_TOURNAMENT", "2027", 0, 1, {
    tournament_year: 2027, tournament_name: "Sandbagger Invitational",
    destination: "Future Site", start_date: "2027-09-23",
    end_date: "2027-09-26", time_zone: "America/Chicago",
    creation_mode: "BLANK",
  });
  const created = rpc(cluster, database,
    "mutate_production_future_year_administration_v1", createInput);
  assert.equal(created.ok, true);
  assert.equal(created.revision, 1);
  assert.equal(created.lifecycle, "DRAFT");
  const retry = rpc(cluster, database,
    "mutate_production_future_year_administration_v1", createInput);
  assert.equal(retry.idempotent, true);
  const conflict = rpc(cluster, database,
    "mutate_production_future_year_administration_v1",
    { ...createInput, destination: "Changed" });
  assert.equal(conflict.code, "PRODUCTION_FUTURE_YEAR_IDEMPOTENCY_CONFLICT");

  let revision = 1;
  const mutateAsDirector = (operation, number, values) => {
    const result = rpc(cluster, database,
      "mutate_production_future_year_administration_v1",
      mutation(director, operation, "2027", revision, number, values));
    if (result.ok) revision = result.revision;
    return result;
  };
  assert.equal(mutateAsDirector("CONFIGURE_TEAM", 2, {
    team_id: "CB", team_side: 1, team_name: "Pickles", active: true,
  }).ok, true);
  assert.equal(mutateAsDirector("CONFIGURE_TEAM", 3, {
    team_id: "WD", team_side: 2, team_name: "Mulligans", active: true,
  }).ok, true);
  assert.equal(mutateAsDirector("REPLACE_ROSTER", 4, { roster: [
    { player_id: "CB01", team_id: "CB", team_side: 1,
      participation_status: "ACTIVE" },
    { player_id: "CB03", team_id: "CB", team_side: 1,
      participation_status: "ACTIVE" },
    { player_id: "CB02", team_id: "WD", team_side: 2,
      participation_status: "ACTIVE" },
    { player_id: "WD01", team_id: "WD", team_side: 2,
      participation_status: "ACTIVE" },
  ] }).ok, true);
  const wrongCaptain = mutateAsDirector("CONFIGURE_TEAM", 5, {
    team_id: "CB", team_side: 1, team_name: "Pickles",
    captain_player_id: "CB02", active: true,
  });
  assert.equal(wrongCaptain.code, "FUTURE_TEAM_CAPTAIN_OR_INPUT_INVALID");
  assert.equal(mutateAsDirector("CONFIGURE_TEAM", 6, {
    team_id: "CB", team_side: 1, team_name: "Pickles",
    captain_player_id: "CB01", active: true,
  }).ok, true);
  assert.equal(mutateAsDirector("CONFIGURE_TEAM", 7, {
    team_id: "WD", team_side: 2, team_name: "Mulligans",
    captain_player_id: "CB02", active: true,
  }).ok, true);
  const sideChange = mutateAsDirector("CONFIGURE_TEAM", 8, {
    team_id: "CB", team_side: 2, team_name: "Pickles",
    captain_player_id: "CB01", active: true,
  });
  assert.equal(sideChange.code, "FUTURE_TEAM_SIDE_IMMUTABLE");
  assert.equal(mutateAsDirector("CONFIGURE_ROUND", 9, {
    round_number: 1, round_name: "Best Ball", format: "BB", team_size: 2,
    points_available: "1", handicap_allowance: "0.9",
  }).ok, true);
  const archiveOnly = mutateAsDirector("ASSIGN_COURSE", 10, {
    round_number: 1, course_id: "ARCHIVE-ONLY", tee: "Tournament",
    source_tournament_id: "2026", source_round_number: 1,
  });
  assert.equal(archiveOnly.code, "FUTURE_EXISTING_COURSE_TEE_REQUIRED");
  assert.equal(mutateAsDirector("ASSIGN_COURSE", 11, {
    round_number: 1, course_id: "COURSE-1", tee: "Tournament",
    source_tournament_id: "2026", source_round_number: 1,
  }).ok, true);
  const generated = mutateAsDirector("GENERATE_MATCH_STRUCTURE", 12, {
    round_number: 1, match_count: 2,
  });
  assert.equal(generated.ok, true);
  assert.equal(sql(cluster, database,
    "select string_agg(match_id || ':' || team_size,',' order by match_id) from production_control.future_match_definitions_v1 where tournament_id='2027';"),
  "2027-R1-1:2,2027-R1-2:2");
  const roundStructureLocked = mutateAsDirector("CONFIGURE_ROUND", 14, {
    round_number: 1, round_name: "Changed", format: "SC", team_size: 2,
    points_available: "1", handicap_allowance: "1",
  });
  assert.equal(roundStructureLocked.code, "FUTURE_ROUND_MATCH_STRUCTURE_LOCKED");
  assert.equal(sql(cluster, database,
    "select count(*) from production_control.future_match_google_compatibility_jobs_v1 where tournament_id='2027' and status='PROVISIONING_REQUIRED' and not writer_installed;"), "2");
  assert.equal(sql(cluster, database,
    "select count(*) from scoring_authority.matches where tournament_id='2027';"), "0");
  assert.equal(sql(cluster, database,
    "select count(*) from scoring_authority.scoring_snapshots where tournament_id='2027';"), "0");

  const selected = rpc(cluster, database,
    "read_production_future_year_administration_v1",
    scope(director, "READ_PRODUCTION_FUTURE_YEAR_ADMINISTRATION_V1", {
      target_tournament_id: "2027",
    }));
  assert.equal(selected.data.selectedTournament.tournamentId, "2027");
  assert.equal(selected.data.matchDefinitions.length, 2);
  assert.equal(selected.data.readiness.readyForActivation, false);
  assert.ok(selected.data.readiness.blockers.some((value) =>
    value.code === "GOOGLE_COMPATIBILITY_PROVISIONING_REQUIRED"));
  assert.ok(selected.data.readiness.blockers.some((value) =>
    value.code === "FUTURE_TOURNAMENT_ACTIVATION_NOT_INSTALLED"));
  assert.equal(selected.data.audit.some((value) =>
    typeof value.summary === "string"), true);
  assert.equal(JSON.stringify(selected.data.audit).includes("example.invalid"), false);

  const markReady = rpc(cluster, database,
    "mutate_production_future_year_administration_v1",
    mutation(owner, "MARK_READY", "2027", revision, 13));
  assert.equal(markReady.code, "FUTURE_TOURNAMENT_NOT_READY");
  for (const [operation, code] of [
    ["ACTIVATE_TOURNAMENT", "FUTURE_TOURNAMENT_ACTIVATION_NOT_INSTALLED"],
    ["CLOSE_TOURNAMENT", "FUTURE_TOURNAMENT_CLOSE_NOT_INSTALLED"],
    ["ARCHIVE_TOURNAMENT", "FUTURE_TOURNAMENT_ARCHIVE_NOT_INSTALLED"],
    ["CREATE_COURSE", "GLOBAL_COURSE_CREATION_NOT_INSTALLED"],
  ]) {
    const result = rpc(cluster, database,
      "mutate_production_future_year_administration_v1",
      mutation(owner, operation, "2027", revision, 20 + code.length));
    assert.equal(result.code, code);
  }

  const clone = rpc(cluster, database,
    "mutate_production_future_year_administration_v1",
    mutation(owner, "CREATE_TOURNAMENT", "2028", 0, 80, {
      tournament_year: 2028, tournament_name: "Sandbagger Invitational",
      destination: "Clone Site", start_date: "2028-09-21",
      end_date: "2028-09-24", time_zone: "America/Chicago",
      creation_mode: "CLONE_STRUCTURE", clone_source_tournament_id: "2026",
    }));
  assert.equal(clone.ok, true);
  assert.equal(sql(cluster, database,
    "select count(*) from production_control.future_tournament_teams_v1 where tournament_id='2028';"), "2");
  assert.equal(sql(cluster, database,
    "select count(*) from production_control.future_tournament_rounds_v1 where tournament_id='2028';"), "3");
  assert.equal(sql(cluster, database,
    "select count(*) from production_control.future_tournament_roster_v1 where tournament_id='2028';"), "0");
  assert.equal(sql(cluster, database,
    "select count(*) from scoring_authority.matches where tournament_id='2028';"), "0");
  assert.equal(sql(cluster, database,
    "select tournament_id || '|' || pointer_revision from production_control.current_tournament_pointer_v1;"), "2026|1");

  assert.throws(() => rpc(cluster, database,
    "read_production_future_year_administration_v1",
    scope(director, "READ_PRODUCTION_FUTURE_YEAR_ADMINISTRATION_V1"),
    { role: "authenticated" }), /PRODUCTION_FUTURE_YEAR_SCOPE_REQUIRED|FIXTURE_DIRECTOR_REQUIRED/);
});
