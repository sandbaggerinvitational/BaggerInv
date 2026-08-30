import assert from "node:assert/strict";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = path.join(
  repositoryRoot,
  "supabase/production_migrations/202608300059_production_director_private_operations_v1.sql",
);
const pgBin = "/opt/homebrew/opt/postgresql@17/bin";
const bin = Object.fromEntries(["initdb", "pg_ctl", "createdb", "psql"].map((name) => [
  name,
  path.join(pgBin, name),
]));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0) {
    throw new Error([
      `${command} ${args.join(" ")}`,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join("\n"));
  }
  return result.stdout.trim();
}

function pgEnv(cluster) {
  return {
    ...process.env,
    PGHOST: cluster.socket,
    PGPORT: String(cluster.port),
    PGUSER: "postgres",
  };
}

function sql(cluster, database, input) {
  return run(bin.psql, ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", database], {
    env: pgEnv(cluster),
    input,
  });
}

function sqlFile(cluster, database, filename) {
  return run(bin.psql, ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", database, "-f", filename], {
    env: pgEnv(cluster),
  });
}

async function available() {
  try {
    await Promise.all(Object.values(bin).map((value) => access(value, fsConstants.X_OK)));
    return true;
  } catch {
    return false;
  }
}

async function cluster() {
  const root = await mkdtemp(path.join(os.tmpdir(), "bdp-pg17-"));
  const data = path.join(root, "data");
  const socket = path.join(root, "socket");
  const log = path.join(root, "postgres.log");
  await mkdir(socket, { mode: 0o700 });
  run(bin.initdb, ["-D", data, "--username=postgres", "--auth=trust", "--no-locale", "--encoding=UTF8"]);
  run(bin.pg_ctl, ["-D", data, "-l", log, "-o", `-F -k ${socket} -h '' -p 5432`, "-w", "start"]);
  return { root, data, socket, log, port: 5432, started: true };
}

async function destroy(value) {
  if (value.started) {
    run(bin.pg_ctl, ["-D", value.data, "-m", "fast", "-w", "stop"]);
    value.started = false;
  }
  assert.equal(path.dirname(value.root), path.resolve(os.tmpdir()));
  assert.match(path.basename(value.root), /^bdp-pg17-/);
  await rm(value.root, { recursive: true, force: true });
}

function installFixture(clusterValue, database) {
  sql(clusterValue, database, `
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create schema production_control;
    create schema scoring_authority;
    create schema participant_identity;
    create schema auth;

    create table scoring_authority.players (
      player_id text primary key, display_name text not null
    );
    create table scoring_authority.tournament_players (
      tournament_id text, player_id text, participation_status text
    );
    create table scoring_authority.rounds (
      tournament_id text, round_number integer, name text, format text
    );
    create table scoring_authority.matches (
      match_id text primary key, tournament_id text, round_number integer,
      format text, scoring_snapshot_id text
    );
    create table scoring_authority.match_participants (
      match_id text, player_id text, team_side integer, player_slot integer,
      playing_handicap numeric, final_strokes numeric
    );
    create table scoring_authority.match_holes (
      match_id text, hole_number integer
    );
    create table scoring_authority.scoring_snapshots (
      snapshot_id text primary key, tournament_id text, match_id text,
      team_configuration jsonb
    );
    create table scoring_authority.game_center_presentations (
      match_id text, tournament_id text, display_match_number text
    );
    create table scoring_authority.audit_events (
      created_at timestamptz, tournament_id text, match_id text,
      action text, actor_id text
    );

    create table scoring_authority.net_skins_v1_configuration_current (
      tournament_id text primary key, configuration_revision_id uuid,
      configuration_revision bigint, state text, updated_at timestamptz
    );
    create table scoring_authority.net_skins_v1_recalculation_jobs (
      job_id uuid primary key, tournament_id text, round_number integer,
      configuration_revision bigint, status text, requested_at timestamptz,
      started_at timestamptz, completed_at timestamptz, updated_at timestamptz
    );
    create table scoring_authority.net_skins_v1_result_revisions (
      result_id uuid primary key, tournament_id text, round_number integer,
      result_revision bigint, job_id uuid, is_current boolean
    );

    create table scoring_authority.calcutta_v1_configuration_revisions (
      configuration_revision_id uuid primary key, configuration_revision bigint,
      configuration_manifest jsonb, configured_at timestamptz
    );
    create table scoring_authority.calcutta_v1_auction_fact_revisions (
      auction_revision_id uuid primary key, auction_manifest jsonb,
      recorded_at timestamptz
    );
    create table scoring_authority.calcutta_v1_publication_revisions (
      publication_revision_id uuid primary key, published_at timestamptz
    );
    create table scoring_authority.calcutta_v1_result_revisions (
      result_id uuid primary key, tournament_id text,
      configuration_revision bigint, auction_revision bigint,
      result_revision bigint, job_id uuid, source_fingerprint text,
      result_state text, engine_result_payload jsonb, calculated_at timestamptz,
      is_current boolean
    );
    create table scoring_authority.calcutta_v1_recalculation_jobs (
      job_id uuid primary key, tournament_id text,
      configuration_revision bigint, auction_revision bigint,
      source_fingerprint text, status text, requested_at timestamptz,
      started_at timestamptz, completed_at timestamptz, updated_at timestamptz
    );
    create table scoring_authority.calcutta_v1_current (
      tournament_id text primary key,
      configuration_revision_id uuid, configuration_revision bigint,
      configuration_fingerprint text, auction_revision_id uuid,
      auction_revision bigint, auction_fingerprint text,
      publication_revision_id uuid, publication_revision bigint,
      publication_state text, state text, result_revision bigint,
      updated_at timestamptz
    );

    create table scoring_authority.handicap_revisions (
      revision_id uuid primary key, revision_number bigint
    );
    create table scoring_authority.handicap_audit_events (
      created_at timestamptz, tournament_id text, revision_id uuid,
      action text, actor_player_id text
    );
    create table production_control.operation_audit_events (
      created_at timestamptz, tournament_id text, domain text,
      event_type text, actor text, details jsonb, result text
    );
    create table production_control.authority_sentinel (
      scoring text, reads text, identity text, ingress text, workers boolean
    );
    insert into production_control.authority_sentinel
      values ('SUPABASE', 'SUPABASE', 'SUPABASE', 'OPEN', true);

    create function production_control.calcutta_v1_hash(input jsonb)
    returns text language sql immutable as $$ select input::text $$;
    create function production_control.calcutta_v1_source_revision(input text)
    returns jsonb language sql stable as $$ select '{}'::jsonb $$;
    create function production_control.assert_production_service_role()
    returns void language plpgsql as $$ begin end $$;
    create function production_control.assert_production_scoring_runtime(input jsonb, ignored text)
    returns void language plpgsql as $$ begin end $$;
    create function production_control.assert_production_cutover_read_scope(input jsonb, phase text)
    returns void language plpgsql as $$ begin end $$;
    create function production_control.assert_production_scoring_actor(input jsonb, director boolean)
    returns void language plpgsql as $$ begin end $$;

    insert into scoring_authority.net_skins_v1_configuration_current
      values ('2026', '10000000-0000-4000-8000-000000000001', 1,
        'NOT_CONFIGURED', now());
    insert into scoring_authority.calcutta_v1_configuration_revisions
      values ('20000000-0000-4000-8000-000000000001', 1,
        '{"state":"NOT_CONFIGURED"}'::jsonb, null);
    insert into scoring_authority.calcutta_v1_current
      values ('2026', '20000000-0000-4000-8000-000000000001', 1,
        null, null, 0, null, null, 0, 'UNPUBLISHED', 'NOT_CONFIGURED', 0,
        now());
  `);
}

function installCompleteCanonicalInputs(clusterValue, database) {
  sql(clusterValue, database, `
    insert into scoring_authority.rounds values
      ('2026', 1, 'Best Ball', 'BB'),
      ('2026', 2, 'Scramble', 'SC'),
      ('2026', 3, 'Singles', 'SI');
    insert into scoring_authority.scoring_snapshots values
      ('S1', '2026', 'M1', '{}'::jsonb),
      ('S2', '2026', 'M2', '{"team_1_strokes":"3.5","team_2_strokes":"4"}'::jsonb),
      ('S3', '2026', 'M3', '{}'::jsonb);
    insert into scoring_authority.matches values
      ('M1', '2026', 1, 'BB', 'S1'),
      ('M2', '2026', 2, 'SC', 'S2'),
      ('M3', '2026', 3, 'SI', 'S3');
    insert into scoring_authority.game_center_presentations values
      ('M1', '2026', '1'), ('M2', '2026', '1'), ('M3', '2026', '1');
    insert into scoring_authority.players
      select 'P' || lpad(value::text, 2, '0'), 'Player ' || value
      from generate_series(1, 10) value;
    insert into scoring_authority.tournament_players
      select '2026', player_id, 'ACTIVE' from scoring_authority.players;
    insert into scoring_authority.match_participants values
      ('M1','P01',1,1,null,1), ('M1','P02',1,2,null,2),
      ('M1','P03',2,1,null,3), ('M1','P04',2,2,null,4),
      ('M2','P05',1,1,null,null), ('M2','P06',1,2,null,null),
      ('M2','P07',2,1,null,null), ('M2','P08',2,2,null,null),
      ('M3','P09',1,1,null,1.5), ('M3','P10',2,1,null,2.5);
    insert into scoring_authority.match_holes
      select match_id, hole from (values ('M1'), ('M2'), ('M3')) matches(match_id)
      cross join generate_series(1, 18) hole;
  `);
}

function installPrivateCalcutta(clusterValue, database) {
  sql(clusterValue, database, `
    with manifest as (
      select '{
        "point_structure":[{"place":1,"round_1_award":5,"round_2_award":4,"round_3_award":3}],
        "payout_structure":[{"place":1,"round_1_fraction":"0.125","round_2_fraction":"0.125","round_3_fraction":"0.25","overall_fraction":"0.5"}]
      }'::jsonb value
    )
    insert into scoring_authority.calcutta_v1_configuration_revisions
      select '20000000-0000-4000-8000-000000000002', 2, value, now()
      from manifest;
    with manifest as (
      select '{
        "pot":"1000.005",
        "purchases":[{"player_id":"P01","purchase_price":"1000.005"}],
        "ownership":[{"player_id":"P01","owner_player_id":"P02","ownership_fraction":"1"}]
      }'::jsonb value
    )
    insert into scoring_authority.calcutta_v1_auction_fact_revisions
      select '30000000-0000-4000-8000-000000000001', value, now()
      from manifest;
    update scoring_authority.calcutta_v1_current current_value set
      configuration_revision_id = '20000000-0000-4000-8000-000000000002',
      configuration_revision = 2,
      configuration_fingerprint = production_control.calcutta_v1_hash((
        select configuration_manifest
        from scoring_authority.calcutta_v1_configuration_revisions
        where configuration_revision = 2
      )),
      auction_revision_id = '30000000-0000-4000-8000-000000000001',
      auction_revision = 1,
      auction_fingerprint = production_control.calcutta_v1_hash((
        select auction_manifest
        from scoring_authority.calcutta_v1_auction_fact_revisions
        where auction_revision_id = '30000000-0000-4000-8000-000000000001'
      )),
      publication_revision_id = null,
      publication_revision = 0,
      publication_state = 'UNPUBLISHED',
      state = 'AUCTION_COMPLETE',
      result_revision = 0
    where current_value.tournament_id = '2026';
  `);
}

test("migration 059 executes on PostgreSQL 17 and returns bounded private facts without changing authority", async (context) => {
  if (!(await available())) {
    context.skip("PostgreSQL 17 binaries unavailable");
    return;
  }
  const clusterValue = await cluster();
  try {
    const database = "director_private_059";
    run(bin.createdb, [database], { env: pgEnv(clusterValue) });
    installFixture(clusterValue, database);
    sqlFile(clusterValue, database, migration);

    const privileges = sql(clusterValue, database, `
      select jsonb_build_object(
        'anon', has_function_privilege('anon',
          'public.read_production_director_operations_v1(jsonb)', 'execute'),
        'authenticated', has_function_privilege('authenticated',
          'public.read_production_director_operations_v1(jsonb)', 'execute'),
        'service_role', has_function_privilege('service_role',
          'public.read_production_director_operations_v1(jsonb)', 'execute')
      )::text;
    `);
    assert.deepEqual(JSON.parse(privileges), {
      anon: false,
      authenticated: false,
      service_role: true,
    });

    installCompleteCanonicalInputs(clusterValue, database);
    installPrivateCalcutta(clusterValue, database);
    const input = {
      contract_version: "production-director-private-operations-v1",
      operation: "READ_PRODUCTION_DIRECTOR_OPERATIONS_V1",
      environment: "PRODUCTION",
      project_ref: "ymqhhtxaywtqllynrmxe",
      project_url: "https://ymqhhtxaywtqllynrmxe.supabase.co",
      source_workbook_id: "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4",
      tournament_id: "2026",
      vercel_project_id: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
      vercel_team_id: "team_kPw5zaib8uaQJALAwj4fWI6R",
      vercel_environment: "production",
      authorization: {
        tournament_id: "2026",
        auth_user_id: "40000000-0000-4000-8000-000000000001",
        player_id: "P01",
        role: "DIRECTOR",
      },
    };
    const resultText = sql(clusterValue, database, `
      select public.read_production_director_operations_v1(
        ${`'${JSON.stringify(input).replaceAll("'", "''")}'`}::jsonb
      )::text;
    `);
    const result = JSON.parse(resultText);
    assert.equal(result.ok, true);
    assert.equal(result.data.net_skins.readiness.can_configure, true);
    assert.equal(result.data.net_skins.readiness.total_matches, 3);
    assert.equal(result.data.net_skins.readiness.ready_matches, 3);
    assert.deepEqual(result.data.net_skins.readiness.issues, []);
    assert.equal(result.data.calcutta.publication_state, "UNPUBLISHED");
    assert.equal(result.data.calcutta.auction.pot, "1000.005");
    assert.equal(result.data.calcutta.auction.purchases[0].purchase_price, "1000.005");
    assert.equal(result.data.calcutta.auction.purchases[0].owners[0].ownership_fraction, "1");
    assert.equal(result.data.bounds.job_limit_per_domain, 8);
    assert.equal(result.data.bounds.audit_limit, 60);
    assert.deepEqual(JSON.parse(sql(clusterValue, database,
      "select row_to_json(value)::text from production_control.authority_sentinel value;")), {
      scoring: "SUPABASE",
      reads: "SUPABASE",
      identity: "SUPABASE",
      ingress: "OPEN",
      workers: true,
    });
  } finally {
    await destroy(clusterValue);
  }
});
