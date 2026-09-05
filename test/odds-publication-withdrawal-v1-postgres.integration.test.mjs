import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { publishedOddsFreshness } from "../lib/published-odds-supabase.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = path.join(root,
  "supabase/production_migrations/202609040087_production_odds_publication_withdrawal_v1.sql");
const compatibilityMigration = path.join(root,
  "supabase/production_migrations/202609050088_production_odds_legacy_projection_compatibility_v1.sql");
const pgBin = "/opt/homebrew/opt/postgresql@17/bin";
const bin = Object.fromEntries(["createdb", "initdb", "pg_ctl", "psql"]
  .map((name) => [name, path.join(pgBin, name)]));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, ...options,
  });
  if (result.error || result.status !== 0) {
    throw new Error([command, result.stdout, result.stderr].filter(Boolean).join("\n"));
  }
  return result.stdout.trim();
}

function environment(cluster, role = "service_role") {
  return { ...process.env, PGHOST: cluster.socket, PGPORT: String(cluster.port),
    PGUSER: "postgres", PGOPTIONS: `-c request.jwt.claim.role=${role}` };
}

function sql(cluster, database, input, role = "service_role") {
  return run(bin.psql, ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", database],
    { env: environment(cluster, role), input });
}

function sqlFile(cluster, database, filename) {
  return run(bin.psql, ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", database,
    "-f", filename], { env: environment(cluster) });
}

async function available() {
  try {
    await Promise.all(Object.values(bin).map((value) => access(value, fsConstants.X_OK)));
    return true;
  } catch { return false; }
}

async function createCluster() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "bagger-odds-withdraw-pg-"));
  const data = path.join(directory, "data");
  const socket = path.join(directory, "socket");
  const log = path.join(directory, "postgres.log");
  await mkdir(socket, { mode: 0o700 });
  run(bin.initdb, ["-D", data, "--username=postgres", "--auth=trust", "--no-locale", "--encoding=UTF8",
    "--set=shared_memory_type=mmap", "--set=dynamic_shared_memory_type=mmap"]);
  const port = 58900 + (process.pid % 300);
  run(bin.pg_ctl, ["-D", data, "-l", log, "-o", `-F -k ${socket} -h '' -p ${port}`, "-w", "start"]);
  return { directory, data, socket, log, port, started: true };
}

async function destroyCluster(cluster) {
  if (cluster?.started) run(bin.pg_ctl, ["-D", cluster.data, "-m", "fast", "-w", "stop"]);
  if (cluster?.directory) await rm(cluster.directory, { recursive: true, force: true });
}

const authUser = "00000000-0000-4000-8000-000000000001";
const snapshot1 = "10000000-0000-4000-8000-000000000001";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function withdrawalInput(overrides = {}) {
  const values = {
    actorAuthUserId: authUser,
    actorPlayerId: "CB01",
    contractVersion: "production-odds-publication-withdrawal-v1",
    expectedAnnualPointerRevision: 7,
    expectedCurrentTournamentId: "2026",
    expectedPublicationPointerRevision: 1,
    expectedPublicationRevision: 1,
    expectedPublicationSnapshotId: snapshot1,
    operation: "WITHDRAW",
    reasonCode: "TOURNAMENT_SETUP_CHANGED",
    targetTournamentId: "2026",
    ...overrides,
  };
  const requestCanonicalJson = JSON.stringify(canonical(values));
  return {
    operation: "WITHDRAW_PRODUCTION_ODDS_PUBLICATION_V1",
    contract_version: "production-odds-publication-withdrawal-v1",
    operation_request_id: "20000000-0000-4000-8000-000000000001",
    target_tournament_id: "2026",
    expected_annual_pointer_revision: values.expectedAnnualPointerRevision,
    expected_publication_pointer_revision: values.expectedPublicationPointerRevision,
    expected_publication_revision: values.expectedPublicationRevision,
    expected_snapshot_id: values.expectedPublicationSnapshotId,
    reason_code: values.reasonCode,
    request_canonical_json: requestCanonicalJson,
    request_payload_hash: createHash("sha256").update(requestCanonicalJson).digest("hex"),
    authorization: { auth_user_id: authUser, player_id: "CB01", role: "DIRECTOR", tournament_id: "2026" },
  };
}

function json(value) {
  return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
}

function installFixture(cluster, database) {
  sql(cluster, database, String.raw`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema extensions; create extension pgcrypto with schema extensions;
    create schema auth; create schema production_control; create schema scoring_authority;
    create table auth.users(id uuid primary key);
    create table scoring_authority.tournaments(tournament_id text primary key);
    create table scoring_authority.players(player_id text primary key);
    create table scoring_authority.odds_calculation_jobs(
      job_id text primary key, tournament_id text not null, status text not null,
      publication_status text not null
    );
    create table scoring_authority.odds_published_snapshots(
      id uuid primary key, tournament_id text not null,
      milestone text not null, phase_order integer not null,
      publication_revision bigint not null,
      publication_state_revision bigint,
      published_at timestamptz not null,
      published_payload jsonb not null, payload_hash text not null,
      logical_payload_hash text, source_fingerprint text,
      engine_version text, engine_metadata jsonb,
      settings_fingerprint text, ratings_fingerprint text,
      pairing_fingerprint text, authority_contract_version text,
      publication_authority text, source_calculation_job_id text,
      published_by_player_id text, google_publication_fingerprint text,
      is_current_for_milestone boolean not null default false,
      is_current_official boolean not null default false,
      publication_verified boolean not null default true,
      imported_at timestamptz not null default now()
    );
    create table scoring_authority.odds_publication_current(
      tournament_id text primary key, contract_version text not null,
      publication_authority text not null, publication_state text not null,
      freshness text not null, current_snapshot_id uuid,
      publication_revision bigint not null, source_calculation_revision jsonb not null,
      published_at timestamptz, published_by_player_id text,
      published_by_auth_user_id uuid, authority_epoch_id uuid,
      resource_binding jsonb not null, resource_binding_fingerprint text,
      adoption_kind text, activated_by text, activated_at timestamptz,
      updated_at timestamptz not null default now()
    );
    create table scoring_authority.audit_events(
      event_id bigserial primary key, tournament_id text not null,
      action text not null, actor_id text not null, metadata jsonb not null
    );
    create table production_control.operation_audit_events(
      event_id bigserial primary key, event_type text not null, domain text not null,
      tournament_id text not null, actor text not null,
      request_fingerprint text not null, result text not null, details jsonb not null
    );
    create table production_control.current_tournament_pointer_v1(
      scope_key text primary key, tournament_id text not null, pointer_revision bigint not null
    );
    create table production_control.future_annual_runtime_generations_v1(
      tournament_id text primary key, generation_status text not null,
      runtime_generation_id uuid, authority_generation_id uuid, admission_generation_id uuid
    );
    create table production_control.future_tournament_resources_v1(
      tournament_id text primary key, source_workbook_id text not null
    );
    create table production_control.annual_odds_operation_allowlist_v1(
      operation_name text primary key, operation_class text not null,
      enabled boolean not null default true
    );

    create function production_control.scoring_admission_lock_key() returns bigint
      language sql immutable as $$ select 731132026057::bigint $$;
    create function production_control.assert_frozen_2026_current_read_v1() returns void
      language plpgsql as $$ begin end $$;
    create function production_control.assert_annual_current_read_v1(jsonb) returns void
      language plpgsql as $$ begin end $$;
    create function production_control.assert_production_scoring_actor(jsonb,boolean) returns void
      language plpgsql as $$ begin end $$;
    create function production_control.assert_future_production_scoring_actor_v1(jsonb,text,boolean) returns void
      language plpgsql as $$ begin end $$;
    create function production_control.assert_annual_odds_runtime_v1(input jsonb, expected_operation text)
      returns text language sql as $$ select input->>'target_tournament_id' $$;
    create function production_control.prediction_settings_canonical_json_v1(value jsonb)
      returns text language plpgsql immutable strict as $$
    declare value_type text := jsonb_typeof(value); result_value text;
    begin
      if value_type = 'object' then
        select '{' || coalesce(string_agg(to_jsonb(entry.key)::text || ':' ||
          production_control.prediction_settings_canonical_json_v1(entry.value),
          ',' order by entry.key collate "C"), '') || '}' into result_value
        from jsonb_each(value) entry;
        return result_value;
      elsif value_type = 'array' then
        select '[' || coalesce(string_agg(
          production_control.prediction_settings_canonical_json_v1(entry.value),
          ',' order by entry.ordinality), '') || ']' into result_value
        from jsonb_array_elements(value) with ordinality entry(value, ordinality);
        return result_value;
      end if;
      return value::text;
    end $$;

    create function production_control.tournament_setup_dependency_codes_v1(
      target_player text default null, target_team text default null,
      target_round integer default null, target_match text default null,
      change_kind text default 'STRUCTURAL'
    ) returns jsonb language plpgsql stable as $$
    declare codes jsonb := '[]'::jsonb;
    begin
      if exists (
      select 1 from scoring_authority.odds_publication_current current_value
      where current_value.tournament_id = '2026'
        and current_value.publication_state = 'PUBLISHED'
    ) or exists (
      select 1 from scoring_authority.odds_calculation_jobs job
      where job.tournament_id = '2026'
        and (
          job.status in ('PENDING', 'RUNNING', 'RETRYABLE')
          or (job.status = 'SUCCEEDED' and job.publication_status = 'READY')
        )
    ) then codes := codes || '"ODDS_PUBLICATION_DEPENDENCY"'::jsonb; end if;
      return codes;
    end $$;
    create function public.read_production_tournament_setup_v1(input jsonb)
      returns jsonb language plpgsql stable as $$
    declare dependencies_value jsonb;
    begin
      select jsonb_build_object('oddsPublished', exists (
      select 1 from scoring_authority.odds_publication_current current_value
      where current_value.tournament_id = '2026'
        and current_value.publication_state = 'PUBLISHED'
    )) into dependencies_value;
      return jsonb_build_object('ok',true,'data',dependencies_value);
    end $$;

    create function public.read_production_odds_publication_frozen_2026_v1(input jsonb)
      returns jsonb language sql stable as $$
      select jsonb_build_object('ok',true,'data',jsonb_build_object(
        'tournament',jsonb_build_object('tournament_id','2026','tournament_year',2026),
        'publication',jsonb_build_object('authority','SUPABASE','state','PUBLISHED',
          'snapshot_id','${snapshot1}','publication_revision',1,'freshness','CURRENT',
          'published_at','2026-07-01T12:00:00Z','authority_epoch_id','30000000-0000-4000-8000-000000000001',
          'activation_revision',153,'adoption_kind','LEGACY_GOOGLE_ADOPTED'),
        'snapshots',jsonb_build_array(jsonb_build_object('milestone','Pre-Tournament',
          'phase_order',0,'publication_state_revision',null,'publication_revision',1,
          'authority_contract_version','legacy-google-published-odds-v1',
          'origin_authority','GOOGLE','published_at','2026-07-01T12:00:00Z',
          'payload_hash',repeat('a',64),
          'payload',jsonb_build_object('phase','Pre-Tournament','phaseOrder',0,'publishedAt','2026-07-01T12:00:00Z'),
          'is_current_official',(select is_current_official from scoring_authority.odds_published_snapshots where id='${snapshot1}'),
          'publication_verified',true)), 'history_count',1)) $$;
    create function production_control.annual_odds_publication_projection_v1(target text)
      returns jsonb language sql stable as $$ select public.read_production_odds_publication_frozen_2026_v1('{}') $$;
    create function public.future_production_dispatch_odds_v1(input jsonb)
      returns jsonb language sql as $$ select jsonb_build_object('ok',false,'code','FIXTURE') $$;
    create function public.read_published_odds_view_frozen_2026_v1(text,text)
      returns jsonb language sql stable as $$ select public.read_production_odds_publication_frozen_2026_v1('{}') $$;

    insert into auth.users values ('${authUser}');
    insert into scoring_authority.tournaments values ('2026');
    insert into scoring_authority.players values ('CB01');
    insert into scoring_authority.odds_published_snapshots(
      id,tournament_id,milestone,phase_order,publication_revision,
      publication_state_revision,published_at,published_payload,payload_hash,
      authority_contract_version,publication_authority,is_current_for_milestone,
      is_current_official,publication_verified
    ) values ('${snapshot1}','2026','Pre-Tournament',0,1,null,
      '2026-07-01T12:00:00Z','{"phase":"Pre-Tournament"}',repeat('a',64),
      'legacy-google-published-odds-v1','SUPABASE',true,true,true);
    insert into scoring_authority.odds_publication_current values (
      '2026','production-odds-publication-v1','SUPABASE','PUBLISHED','CURRENT',
      '${snapshot1}',1,'{}','2026-07-01T12:00:00Z','CB01','${authUser}',
      '30000000-0000-4000-8000-000000000001','{}',repeat('b',64),
      'LEGACY_GOOGLE_ADOPTED','migration',now(),now());
    insert into production_control.current_tournament_pointer_v1 values (
      'BAGGER_INV_PRODUCTION','2026',7);
  `);
}

test("087 is inert, withdraws atomically/idempotently, unblocks Setup, and preserves revision sequence", async (t) => {
  if (!(await available())) return t.skip("PostgreSQL 17 binaries unavailable");
  const cluster = await createCluster();
  t.after(() => destroyCluster(cluster));
  const database = "odds_withdrawal_v1";
  run(bin.createdb, [database], { env: { ...environment(cluster), PGOPTIONS: "" } });
  installFixture(cluster, database);

  const before = sql(cluster, database, `select concat_ws('|',
    (select count(*) from scoring_authority.odds_published_snapshots),
    (select count(*) from scoring_authority.odds_calculation_jobs),
    (select publication_revision from scoring_authority.odds_publication_current where tournament_id='2026'),
    (select is_current_official from scoring_authority.odds_published_snapshots where id='${snapshot1}'))`);
  sqlFile(cluster, database, migration);
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select count(*) from scoring_authority.odds_published_snapshots),
    (select count(*) from scoring_authority.odds_calculation_jobs),
    (select publication_revision from scoring_authority.odds_publication_current where tournament_id='2026'),
    (select is_current_official from scoring_authority.odds_published_snapshots where id='${snapshot1}'))`), before);
  assert.equal(sql(cluster, database, `select concat_ws('|',publication_state,
    current_publication_revision,current_snapshot_id,pointer_revision)
    from scoring_authority.odds_publication_public_pointer_v1 where tournament_id='2026'`),
  `PUBLISHED|1|${snapshot1}|1`);
  assert.match(sql(cluster, database, `select production_control.tournament_setup_dependency_codes_v1()::text`),
    /ODDS_PUBLICATION_DEPENDENCY/);

  // Exact Production legacy shape: 087 incorrectly drops the current flag
  // through the nested public projection before the additive patch is applied.
  assert.equal(sql(cluster, database, `select
    public.read_published_odds_view('2026',
      '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4')
      #>>'{data,snapshots,0,is_current_official}'`), "false");
  sqlFile(cluster, database, compatibilityMigration);
  const publicView = JSON.parse(sql(cluster, database, `select
    public.read_published_odds_view('2026',
      '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4')::text`));
  assert.equal(publicView.data.snapshots[0].is_current_official, true);
  assert.equal(publicView.data.snapshots[0].publication_lifecycle, "PUBLISHED");
  const publicModel = publishedOddsFreshness(publicView.data);
  assert.equal(publicModel.status, "CURRENT_OFFICIAL");
  assert.equal(publicModel.current, true);
  assert.equal(publicModel.publicationRevision, 1);

  const directBase = (snapshot, publication = {}) => json({
    ok: true,
    data: {
      publication: {
        state: "PUBLISHED",
        snapshot_id: snapshot1,
        publication_revision: 1,
        adoption_kind: "LEGACY_GOOGLE_ADOPTED",
        ...publication,
      },
      snapshots: [snapshot],
    },
  });
  const projectedCurrent = (snapshot, publication = {}) => sql(cluster,
    database, `select production_control.odds_publication_withdrawal_projection_v1(
      ${directBase(snapshot, publication)},'2026')
      #>>'{data,snapshots,0,is_current_official}'`);
  const legacy = {
    publication_state_revision: null,
    publication_revision: 1,
    authority_contract_version: "legacy-google-published-odds-v1",
    is_current_official: true,
  };
  assert.equal(projectedCurrent(legacy), "true");
  assert.equal(projectedCurrent({ ...legacy, publication_revision: 2 }), "false");
  assert.equal(projectedCurrent({ ...legacy, is_current_official: false }), "false");
  assert.equal(projectedCurrent({ ...legacy,
    authority_contract_version: "production-odds-publication-v1" }), "false");
  assert.throws(() => projectedCurrent(legacy, {
    snapshot_id: "10000000-0000-4000-8000-000000000009",
  }), /PRODUCTION_ODDS_PUBLIC_POINTER_DIVERGED/);
  assert.equal(projectedCurrent({
    publication_state_revision: 1,
    publication_revision: 1,
    authority_contract_version: "production-odds-publication-v1",
    is_current_official: true,
  }, { adoption_kind: "SUPABASE_DIRECTOR" }), "true");
  assert.equal(sql(cluster, database, `begin;
    delete from scoring_authority.odds_publication_public_pointer_v1
      where tournament_id='2026';
    select production_control.odds_publication_withdrawal_projection_v1(
      ${directBase(legacy)},'2026')
      #>>'{data,snapshots,0,is_current_official}'; rollback;`), "false");

  const input = withdrawalInput();
  for (const [status, publicationStatus] of [
    ["PENDING", "NOT_READY"],
    ["RUNNING", "NOT_READY"],
    ["RETRYABLE", "NOT_READY"],
    ["SUCCEEDED", "READY"],
  ]) {
    sql(cluster, database, `insert into scoring_authority.odds_calculation_jobs values
      ('blocking','2026','${status}','${publicationStatus}')`);
    assert.match(sql(cluster, database,
      `select public.withdraw_production_odds_publication_v1(${json(input)})::text`),
      /ODDS_WITHDRAWAL_CALCULATION_IN_PROGRESS/);
    sql(cluster, database, `delete from scoring_authority.odds_calculation_jobs`);
  }
  const stale = withdrawalInput({ expectedPublicationPointerRevision: 9 });
  stale.operation_request_id = "20000000-0000-4000-8000-000000000002";
  assert.match(sql(cluster, database,
    `select public.withdraw_production_odds_publication_v1(${json(stale)})::text`),
    /ODDS_WITHDRAWAL_PREDECESSOR_STALE/);
  const wrongSnapshot = withdrawalInput({
    expectedPublicationSnapshotId: "10000000-0000-4000-8000-000000000009",
  });
  wrongSnapshot.operation_request_id = "20000000-0000-4000-8000-000000000003";
  assert.match(sql(cluster, database,
    `select public.withdraw_production_odds_publication_v1(${json(wrongSnapshot)})::text`),
    /ODDS_WITHDRAWAL_PREDECESSOR_STALE/);

  const first = JSON.parse(sql(cluster, database,
    `select public.withdraw_production_odds_publication_v1(${json(input)})::text`));
  assert.equal(first.ok, true);
  assert.equal(first.idempotent, false);
  assert.equal(first.publication_state, "WITHDRAWN");
  assert.equal(first.current_publication, false);
  assert.equal(first.publication_revision, 1);
  assert.equal(first.historical_publication_preserved, true);
  assert.equal(sql(cluster, database, `select concat_ws('|',publication_state,
    coalesce(current_snapshot_id::text,'NONE'),last_publication_revision,
    pointer_revision) from scoring_authority.odds_publication_public_pointer_v1
    where tournament_id='2026'`), "WITHDRAWN|NONE|1|2");
  assert.equal(sql(cluster, database, `select concat_ws('|',count(*),
    bool_and(published_payload='{"phase":"Pre-Tournament"}'::jsonb),
    bool_and(publication_authority='SUPABASE'),bool_or(is_current_official))
    from scoring_authority.odds_published_snapshots where tournament_id='2026'`),
  "1|t|t|f");
  assert.equal(sql(cluster, database, `select production_control.tournament_setup_dependency_codes_v1()::text`), "[]");
  assert.equal(sql(cluster, database, `select count(*) from production_control.odds_publication_withdrawal_events_v1`), "1");
  assert.equal(sql(cluster, database, `select count(*) from production_control.odds_publication_withdrawal_receipts_v1`), "1");

  const retry = JSON.parse(sql(cluster, database,
    `select public.withdraw_production_odds_publication_v1(${json(input)})::text`));
  assert.equal(retry.ok, true);
  assert.equal(retry.idempotent, true);
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select pointer_revision from scoring_authority.odds_publication_public_pointer_v1 where tournament_id='2026'),
    (select count(*) from production_control.odds_publication_withdrawal_events_v1),
    (select count(*) from production_control.odds_publication_withdrawal_receipts_v1))`), "2|1|1");

  const read = JSON.parse(sql(cluster, database,
    `select public.read_production_odds_publication_v1('{}')::text`));
  assert.equal(read.data.publication.state, "WITHDRAWN");
  assert.equal(read.data.publication.snapshot_id, null);
  assert.equal(read.data.publication.publication_revision, 1);
  assert.equal(read.data.snapshots[0].publication_lifecycle, "WITHDRAWN");
  assert.equal(read.data.snapshots[0].is_current_official, false);

  const conflictingRetry = withdrawalInput({
    reasonCode: "PUBLICATION_CORRECTION_REQUIRED",
  });
  assert.match(sql(cluster, database,
    `select public.withdraw_production_odds_publication_v1(${json(conflictingRetry)})::text`),
    /ODDS_WITHDRAWAL_IDEMPOTENCY_CONFLICT/);
  sql(cluster, database, `do $$ begin
    begin
      update production_control.odds_publication_withdrawal_events_v1
      set reason_code='PUBLICATION_CORRECTION_REQUIRED';
      raise exception using errcode='P0001', message='immutable evidence update was accepted';
    exception when sqlstate '55000' then null; end;
  end $$;`);

  const snapshot2 = "10000000-0000-4000-8000-000000000002";
  sql(cluster, database, `insert into scoring_authority.odds_published_snapshots(
    id,tournament_id,milestone,phase_order,publication_revision,
    publication_state_revision,published_at,published_payload,payload_hash,
    authority_contract_version,publication_authority,is_current_for_milestone,
    is_current_official,publication_verified) values (
    '${snapshot2}','2026','After Round 1',1,1,2,now(),'{"phase":"After Round 1"}',
    repeat('c',64),'production-odds-publication-v1','SUPABASE',true,true,true);
    update scoring_authority.odds_publication_current set current_snapshot_id='${snapshot2}',
      publication_revision=2,published_at=now(),updated_at=now()
      where tournament_id='2026';`);
  assert.equal(sql(cluster, database, `select concat_ws('|',publication_state,
    current_publication_revision,last_publication_revision,pointer_revision)
    from scoring_authority.odds_publication_public_pointer_v1 where tournament_id='2026'`),
  "PUBLISHED|2|2|3");
  assert.equal(sql(cluster, database, `select count(*) from production_control.odds_publication_withdrawal_events_v1`), "1");
  assert.equal(sql(cluster, database, `select concat_ws('|',
    has_function_privilege('service_role','public.withdraw_production_odds_publication_v1(jsonb)','EXECUTE'),
    has_function_privilege('authenticated','public.withdraw_production_odds_publication_v1(jsonb)','EXECUTE'),
    has_table_privilege('authenticated','production_control.odds_publication_withdrawal_events_v1','SELECT'))`),
  "t|f|f");
});
