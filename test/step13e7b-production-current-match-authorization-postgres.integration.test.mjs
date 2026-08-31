import assert from "node:assert/strict";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = path.join(root, "supabase", "production_migrations",
  "202608300079_production_current_match_authorization_v1.sql");
const pgBin = "/opt/homebrew/opt/postgresql@17/bin";
const bin = Object.fromEntries(["createdb", "initdb", "pg_ctl", "psql"]
  .map((name) => [name, path.join(pgBin, name)]));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0) {
    throw new Error([command, result.stdout, result.stderr]
      .filter(Boolean).join("\n"));
  }
  return result.stdout.trim();
}

function environment(cluster) {
  return {
    ...process.env,
    PGHOST: cluster.socket,
    PGPORT: "5432",
    PGUSER: "postgres",
    PGOPTIONS: "-c request.jwt.claim.role=service_role",
  };
}

function sql(cluster, database, input) {
  return run(bin.psql,
    ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", database], {
      env: environment(cluster),
      input,
    });
}

function sqlFile(cluster, database, filename) {
  return run(bin.psql,
    ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", database,
      "-f", filename], { env: environment(cluster) });
}

function sqlAsync(cluster, database, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin.psql,
      ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", database], {
        cwd: root,
        env: environment(cluster),
        stdio: ["pipe", "pipe", "pipe"],
      });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (value) => { stdout += value; });
    child.stderr.on("data", (value) => { stderr += value; });
    child.on("error", reject);
    child.on("close", (code) => code === 0
      ? resolve(stdout.trim())
      : reject(new Error([stdout, stderr].filter(Boolean).join("\n"))));
    child.stdin.end(input);
  });
}

function markedTransaction(cluster, database, input, marker) {
  let markReady;
  const ready = new Promise((resolve) => { markReady = resolve; });
  const completed = new Promise((resolve, reject) => {
    const child = spawn(bin.psql,
      ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", database], {
        cwd: root,
        env: environment(cluster),
        stdio: ["pipe", "pipe", "pipe"],
      });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (value) => {
      stdout += value;
      if (stdout.includes(`${marker}\n`)) markReady();
    });
    child.stderr.on("data", (value) => { stderr += value; });
    child.on("error", reject);
    child.on("close", (code) => code === 0
      ? resolve(stdout.trim())
      : reject(new Error([stdout, stderr].filter(Boolean).join("\n"))));
    child.stdin.end(input);
  });
  return { ready, completed };
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
  // PostgreSQL limits Unix socket paths on macOS; /private/tmp keeps the
  // disposable cluster well below that boundary.
  const directory = await mkdtemp("/private/tmp/bma-pg17-");
  const data = path.join(directory, "data");
  const socket = path.join(directory, "s");
  const log = path.join(directory, "postgres.log");
  await mkdir(socket, { mode: 0o700 });
  run(bin.initdb, ["-D", data, "--username=postgres", "--auth=trust",
    "--no-locale", "--encoding=UTF8", "--set=shared_memory_type=mmap",
    "--set=dynamic_shared_memory_type=mmap"]);
  run(bin.pg_ctl, ["-D", data, "-l", log, "-o",
    `-F -k ${socket} -h '' -p 5432`, "-w", "start"]);
  return { directory, data, socket, log, started: true };
}

async function destroyCluster(cluster) {
  if (cluster?.started) {
    run(bin.pg_ctl, ["-D", cluster.data, "-m", "fast", "-w", "stop"]);
  }
  if (cluster?.directory) {
    assert.equal(path.dirname(cluster.directory), "/private/tmp");
    assert.match(path.basename(cluster.directory),
      /^bma-pg17-/);
    await rm(cluster.directory, { recursive: true, force: true });
  }
}

function installFixture(cluster, database) {
  sql(cluster, database, String.raw`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create schema production_control;
    create schema scoring_authority;

    create table production_control.current_tournament_pointer_v1 (
      scope_key text primary key,
      tournament_id text not null,
      tournament_year integer not null,
      pointer_revision bigint not null,
      lifecycle_revision bigint not null
    );
    insert into production_control.current_tournament_pointer_v1 values
      ('BAGGER_INV_PRODUCTION','2026',2026,1,1);

    create table production_control.annual_runtime_fixture (
      tournament_id text primary key,
      pointer_revision bigint not null,
      runtime_generation_id uuid not null,
      authority_generation_id uuid not null,
      admission_generation_id uuid not null,
      active boolean not null
    );
    insert into production_control.annual_runtime_fixture values (
      '2027',2,
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',true
    );

    create function production_control.scoring_admission_lock_key()
    returns bigint language sql immutable set search_path=pg_catalog
    as $$ select 130790079::bigint $$;

    create function production_control.assert_frozen_2026_current_read_v1()
    returns void language plpgsql security definer set search_path=pg_catalog
    as $$
    declare pointer production_control.current_tournament_pointer_v1%rowtype;
    begin
      perform pg_catalog.pg_advisory_xact_lock_shared(
        production_control.scoring_admission_lock_key()
      );
      select value.* into strict pointer
      from production_control.current_tournament_pointer_v1 value
      where value.scope_key='BAGGER_INV_PRODUCTION';
      if pointer.tournament_id <> '2026' or pointer.tournament_year <> 2026
      then raise exception using errcode='55000',
        message='PRODUCTION_CURRENT_READ_POINTER_NOT_2026'; end if;
    end;
    $$;

    create function production_control.assert_annual_current_read_v1(
      input jsonb
    ) returns text language plpgsql security definer set search_path=pg_catalog
    as $$
    declare
      pointer production_control.current_tournament_pointer_v1%rowtype;
      runtime production_control.annual_runtime_fixture%rowtype;
    begin
      perform pg_catalog.pg_advisory_xact_lock_shared(
        production_control.scoring_admission_lock_key()
      );
      select value.* into strict pointer
      from production_control.current_tournament_pointer_v1 value
      where value.scope_key='BAGGER_INV_PRODUCTION';
      select value.* into strict runtime
      from production_control.annual_runtime_fixture value
      where value.tournament_id=pointer.tournament_id and value.active;
      if pointer.tournament_id='2026'
         or input->>'target_tournament_id' is distinct from pointer.tournament_id
         or input->>'expected_current_tournament_id'
           is distinct from pointer.tournament_id
         or coalesce((input->>'expected_pointer_revision')::bigint,-1)
           <> pointer.pointer_revision
         or runtime.pointer_revision <> pointer.pointer_revision
         or input->>'expected_runtime_generation_id'
           is distinct from runtime.runtime_generation_id::text
         or input->>'expected_annual_authority_generation_id'
           is distinct from runtime.authority_generation_id::text
         or input->>'expected_annual_admission_generation_id'
           is distinct from runtime.admission_generation_id::text
      then raise exception using errcode='55000',
        message='PRODUCTION_ANNUAL_CURRENT_READ_RUNTIME_REQUIRED'; end if;
      return pointer.tournament_id;
    exception when invalid_text_representation or numeric_value_out_of_range
      or no_data_found then
      raise exception using errcode='55000',
        message='PRODUCTION_ANNUAL_CURRENT_READ_RUNTIME_REQUIRED';
    end;
    $$;

    create table scoring_authority.players (
      player_id text primary key, display_name text not null
    );
    create table scoring_authority.tournament_players (
      tournament_id text not null, player_id text not null,
      participation_status text not null,
      primary key(tournament_id,player_id)
    );
    create table scoring_authority.matches (
      match_id text primary key, tournament_id text not null,
      status text not null, scoring_locked boolean not null,
      permission_revision bigint not null, match_revision bigint not null
    );
    create table scoring_authority.match_participants (
      match_id text not null, player_id text not null,
      primary key(match_id,player_id)
    );
    create table scoring_authority.scoring_permissions (
      match_id text not null, player_id text not null,
      can_score boolean not null, revoked_at timestamptz,
      permission_revision bigint not null,
      primary key(match_id,player_id)
    );
    insert into scoring_authority.players values ('CB01','Clay');
    insert into scoring_authority.tournament_players values
      ('2026','CB01','ACTIVE'),('2027','CB01','ACTIVE'),
      ('2099','CB01','ACTIVE');
    insert into scoring_authority.matches values
      ('2026-M1','2026','FINAL',true,3,8),
      ('2027-M1','2027','LIVE',false,4,2),
      ('2099-M1','2099','LIVE',false,9,1);
    insert into scoring_authority.match_participants values
      ('2026-M1','CB01'),('2027-M1','CB01'),('2099-M1','CB01');
    insert into scoring_authority.scoring_permissions values
      ('2026-M1','CB01',false,now(),3),
      ('2027-M1','CB01',true,null,4),
      ('2099-M1','CB01',true,null,9);

    create function scoring_authority.match_access_decision(
      target_tournament_id text,target_player_id text,target_match_id text,
      requested_action text
    ) returns jsonb language plpgsql stable set search_path=pg_catalog as $$
    declare
      tournament_key text := pg_catalog.btrim(coalesce(target_tournament_id,''));
      player_key text := pg_catalog.btrim(coalesce(target_player_id,''));
      match_key text := pg_catalog.btrim(coalesce(target_match_id,''));
      action_key text := pg_catalog.upper(pg_catalog.btrim(coalesce(requested_action,'')));
      match_row scoring_authority.matches%rowtype;
      permission_row scoring_authority.scoring_permissions%rowtype;
      membership_active boolean := false;
      participant_member boolean := false;
      permission_active boolean := false;
      player_name text := '';
      allowed_value boolean := false;
      reason_code text := 'AUTHORIZED';
    begin
      select * into match_row from scoring_authority.matches value
      where value.match_id=match_key and value.tournament_id=tournament_key;
      select exists(select 1 from scoring_authority.tournament_players value
        where value.tournament_id=tournament_key and value.player_id=player_key
          and value.participation_status='ACTIVE') into membership_active;
      select exists(select 1 from scoring_authority.match_participants value
        where value.match_id=match_key and value.player_id=player_key)
        into participant_member;
      select coalesce(value.display_name,'') into player_name
      from scoring_authority.players value where value.player_id=player_key;
      select * into permission_row from scoring_authority.scoring_permissions value
      where value.match_id=match_key and value.player_id=player_key;
      permission_active := found and permission_row.can_score
        and permission_row.revoked_at is null;
      if action_key not in ('VIEW_MATCH','VIEW_FINAL_SCORECARD',
          'START_SCORING','VIEW_GAME_CENTER') then reason_code := 'INVALID_ACTION';
      elsif match_row.match_id is null then reason_code := 'MATCH_NOT_FOUND';
      elsif not membership_active then reason_code := 'TOURNAMENT_MEMBERSHIP_INACTIVE';
      elsif not participant_member then reason_code := 'NOT_MATCH_PARTICIPANT';
      elsif action_key in ('VIEW_MATCH','VIEW_GAME_CENTER') then allowed_value := true;
      elsif action_key='VIEW_FINAL_SCORECARD' then
        if match_row.status <> 'FINAL' then reason_code := 'MATCH_NOT_FINAL';
        else allowed_value := true; end if;
      elsif match_row.status='FINAL' then reason_code := 'MATCH_FINAL';
      elsif match_row.scoring_locked then reason_code := 'MATCH_LOCKED';
      elsif not permission_active then reason_code := 'SCORING_PERMISSION_REVOKED';
      elsif permission_row.permission_revision <> match_row.permission_revision
        then reason_code := 'SCORING_PERMISSION_STALE';
      elsif match_row.status <> 'LIVE' then reason_code := 'MATCH_NOT_SCOREABLE';
      else allowed_value := true;
      end if;
      return pg_catalog.jsonb_build_object(
        'allowed',allowed_value,
        'code',case when allowed_value then 'AUTHORIZED' else reason_code end,
        'action',action_key,'tournament_id',tournament_key,
        'player_id',player_key,'player_display_name',coalesce(player_name,''),
        'match_id',match_key,'membership_active',membership_active,
        'participant_membership',participant_member,
        'match_status',coalesce(match_row.status,''),
        'scoring_locked',coalesce(match_row.scoring_locked,false),
        'can_score',permission_active,
        'permission_revision',coalesce(permission_row.permission_revision,0),
        'match_permission_revision',coalesce(match_row.permission_revision,0),
        'match_revision',coalesce(match_row.match_revision,0),
        'context_revision',0,'read_only',action_key <> 'START_SCORING',
        'query_ms',0
      );
    end;
    $$;

    create function public.authorize_match_access(
      target_tournament_id text,target_player_id text,target_match_id text,
      requested_action text
    ) returns jsonb language sql stable security definer
    set search_path=pg_catalog as $$
      select scoring_authority.match_access_decision(
        target_tournament_id,target_player_id,target_match_id,requested_action
      )
    $$;
    revoke all on function public.authorize_match_access(text,text,text,text)
      from public,anon,authenticated,service_role;
  `);
}

const quoteJson = (value) =>
  `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;

const frozenInput = Object.freeze({
  target_tournament_id: "2026",
  expected_current_tournament_id: "2026",
  expected_pointer_revision: 1,
  target_player_id: "CB01",
  target_match_id: "2026-M1",
  requested_action: "VIEW_FINAL_SCORECARD",
});

const futureInput = Object.freeze({
  target_tournament_id: "2027",
  expected_current_tournament_id: "2027",
  expected_pointer_revision: 2,
  expected_runtime_generation_id: "11111111-1111-4111-8111-111111111111",
  expected_annual_authority_generation_id:
    "22222222-2222-4222-8222-222222222222",
  expected_annual_admission_generation_id:
    "33333333-3333-4333-8333-333333333333",
  target_player_id: "CB01",
  target_match_id: "2027-M1",
  requested_action: "START_SCORING",
});

test("079 match authorization is pointer-locked, annual-current, and service-only", async (t) => {
  if (!(await available())) return t.skip("PostgreSQL 17 binaries unavailable");
  const cluster = await createCluster();
  t.after(() => destroyCluster(cluster));
  const database = "current_match_authorization";
  run(bin.createdb, [database], { env: { ...environment(cluster), PGOPTIONS: "" } });
  installFixture(cluster, database);
  sqlFile(cluster, database, migration);

  assert.equal(sql(cluster, database, `select concat_ws('|',
    has_function_privilege('service_role',
      'public.authorize_production_current_match_access_v1(jsonb)','EXECUTE'),
    has_function_privilege('authenticated',
      'public.authorize_production_current_match_access_v1(jsonb)','EXECUTE'),
    has_function_privilege('anon',
      'public.authorize_production_current_match_access_v1(jsonb)','EXECUTE'),
    has_function_privilege('service_role',
      'public.authorize_match_access(text,text,text,text)','EXECUTE'));`),
  "t|f|f|f");

  const frozenDirect = JSON.parse(sql(cluster, database, `select
    scoring_authority.match_access_decision(
      '2026','CB01','2026-M1','VIEW_FINAL_SCORECARD'
    )::text;`));
  const frozenDispatched = JSON.parse(sql(cluster, database, `set role service_role;
    select public.authorize_production_current_match_access_v1(
      ${quoteJson(frozenInput)}
    )::text; reset role;`));
  assert.deepEqual(frozenDispatched, frozenDirect);
  assert.equal(frozenDispatched.allowed, true);
  assert.equal(frozenDispatched.read_only, true);
  assert.throws(() => sql(cluster, database, `set role service_role;
    select public.authorize_match_access(
      '2026','CB01','2026-M1','VIEW_FINAL_SCORECARD'
    );`), /permission denied for function authorize_match_access/);

  assert.throws(() => sql(cluster, database, `set role service_role;
    select public.authorize_production_current_match_access_v1(
      ${quoteJson({ ...frozenInput, target_tournament_id: "2099" })}
    );`), /PRODUCTION_CURRENT_MATCH_AUTHORIZATION_POINTER_STALE/);
  assert.throws(() => sql(cluster, database, `set role service_role;
    select public.authorize_production_current_match_access_v1(
      ${quoteJson({ ...frozenInput, expected_pointer_revision: 99 })}
    );`), /PRODUCTION_CURRENT_MATCH_AUTHORIZATION_POINTER_STALE/);

  sql(cluster, database, `update
    production_control.current_tournament_pointer_v1
    set tournament_id='2027',tournament_year=2027,pointer_revision=2,
        lifecycle_revision=2
    where scope_key='BAGGER_INV_PRODUCTION';`);
  const future = JSON.parse(sql(cluster, database, `set role service_role;
    select public.authorize_production_current_match_access_v1(
      ${quoteJson(futureInput)}
    )::text; reset role;`));
  assert.equal(future.allowed, true);
  assert.equal(future.tournament_id, "2027");
  assert.equal(future.match_id, "2027-M1");
  assert.equal(future.action, "START_SCORING");
  assert.throws(() => sql(cluster, database, `set role service_role;
    select public.authorize_production_current_match_access_v1(
      ${quoteJson(frozenInput)}
    );`), /PRODUCTION_CURRENT_MATCH_AUTHORIZATION_POINTER_STALE/);
  assert.throws(() => sql(cluster, database, `set role service_role;
    select public.authorize_production_current_match_access_v1(
      ${quoteJson({
        ...futureInput,
        expected_runtime_generation_id:
          "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      })}
    );`), /PRODUCTION_ANNUAL_CURRENT_READ_RUNTIME_REQUIRED/);

  // Even a Match ID from another tournament is evaluated only within the
  // pointer-selected target; it cannot turn into a caller-selected read.
  const crossTournament = JSON.parse(sql(cluster, database, `set role service_role;
    select public.authorize_production_current_match_access_v1(
      ${quoteJson({ ...futureInput, target_match_id: "2099-M1" })}
    )::text; reset role;`));
  assert.equal(crossTournament.allowed, false);
  assert.equal(crossTournament.code, "MATCH_NOT_FOUND");
  assert.equal(crossTournament.tournament_id, "2027");

  // Simulate a resolver that observed 2026 while an annual transition wins
  // the exclusive admission lock. The decision must wait, then reject the
  // stale tuple rather than read either side of the pointer boundary.
  sql(cluster, database, `update
    production_control.current_tournament_pointer_v1
    set tournament_id='2026',tournament_year=2026,pointer_revision=1,
        lifecycle_revision=1
    where scope_key='BAGGER_INV_PRODUCTION';`);
  const transition = markedTransaction(cluster, database, `begin;
    select pg_catalog.pg_advisory_xact_lock(
      production_control.scoring_admission_lock_key()
    );
    update production_control.current_tournament_pointer_v1
    set tournament_id='2027',tournament_year=2027,pointer_revision=2,
        lifecycle_revision=2
    where scope_key='BAGGER_INV_PRODUCTION';
    select 'transition-ready';
    select pg_catalog.pg_sleep(0.8);
    commit;`, "transition-ready");
  await transition.ready;
  let authorizationSettled = false;
  const racedAuthorization = sqlAsync(cluster, database, `set role service_role;
    select public.authorize_production_current_match_access_v1(
      ${quoteJson(frozenInput)}
    );`).finally(() => { authorizationSettled = true; });
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(authorizationSettled, false,
    "authorization must wait behind the exclusive pointer transition");
  await transition.completed;
  await assert.rejects(racedAuthorization,
    /PRODUCTION_CURRENT_MATCH_AUTHORIZATION_POINTER_STALE/);
});
