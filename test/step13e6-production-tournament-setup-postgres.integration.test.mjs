import assert from "node:assert/strict";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";
import { identicalLegacyCourses } from "./fixtures/identical-legacy-courses.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = path.join(root,
  "supabase/production_migrations/202608300063_production_tournament_setup_v1.sql");
const emptyPairingsMigration = path.join(root,
  "supabase/production_migrations/202609030083_production_empty_pairings_v1.sql");
const startingHoleRetirementMigration = path.join(root,
  "supabase/production_migrations/202609040084_production_starting_hole_retirement_v1.sql");
const identicalAdoptionMigration = path.join(root,
  "supabase/production_migrations/202609040086_production_identical_legacy_course_adoption_v1.sql");
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
    const error = new Error([command, result.stdout, result.stderr].filter(Boolean).join("\n"));
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
    env: environment(cluster, role),
    input,
  });
}

function sqlFile(cluster, database, filename) {
  return run(bin.psql, ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", database, "-f", filename], {
    env: environment(cluster),
  });
}

async function available() {
  try {
    await Promise.all(Object.values(bin).map((value) => access(value, fsConstants.X_OK)));
    return true;
  } catch { return false; }
}

async function createCluster() {
  const directory = await mkdtemp("/tmp/bagger-setup-pg-");
  const data = path.join(directory, "data");
  const socket = path.join(directory, "socket");
  const log = path.join(directory, "postgres.log");
  await mkdir(socket, { mode: 0o700 });
  run(bin.initdb, ["-D", data, "--username=postgres", "--auth=trust", "--no-locale", "--encoding=UTF8"]);
  const port = 55436;
  run(bin.pg_ctl, ["-D", data, "-l", log, "-o", `-F -k ${socket} -h '' -p ${port}`, "-w", "start"]);
  return { directory, data, socket, log, port, started: true };
}

async function destroyCluster(cluster) {
  if (cluster?.started) run(bin.pg_ctl, ["-D", cluster.data, "-m", "fast", "-w", "stop"]);
  if (cluster?.directory) await rm(cluster.directory, { recursive: true, force: true });
}

const actor = {
  playerId: "CB01",
  authUserId: "00000000-0000-4000-8000-000000000001",
};

function scope(operation, overrides = {}) {
  return {
    contract_version: "production-tournament-setup-v1",
    environment: "PRODUCTION",
    project_ref: "ymqhhtxaywtqllynrmxe",
    project_url: "https://ymqhhtxaywtqllynrmxe.supabase.co",
    source_workbook_id: "workbook-production",
    tournament_id: "2026",
    actor_player_id: actor.playerId,
    actor_auth_user_id: actor.authUserId,
    authorization: {
      tournament_id: "2026",
      player_id: actor.playerId,
      auth_user_id: actor.authUserId,
      role: "DIRECTOR",
    },
    operation,
    ...overrides,
  };
}

function json(value) {
  return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
}

function rpc(cluster, database, name, input, options) {
  return JSON.parse(sql(cluster, database,
    `select public.${name}(${json(input)})::text;`, options));
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
    create schema participant_identity;

    create table auth.users (id uuid primary key, email text);
    create table scoring_authority.tournaments (
      tournament_id text primary key, tournament_year integer not null,
      name text not null, source_workbook_id text not null,
      updated_at timestamptz not null default now()
    );
    create table scoring_authority.players (
      player_id text primary key, display_name text not null,
      source_payload jsonb not null default '{}'::jsonb
    );
    create table scoring_authority.teams (
      tournament_id text not null, team_id text not null,
      team_side integer not null, name text not null,
      source_payload jsonb not null default '{}'::jsonb,
      primary key (tournament_id, team_id)
    );
    create table scoring_authority.tournament_players (
      tournament_id text not null, player_id text not null,
      team_id text not null, team_side integer not null,
      participation_status text not null, source_roster_key text not null,
      source_payload jsonb not null default '{}'::jsonb,
      tournament_handicap numeric, handicap_revision_id uuid,
      updated_at timestamptz not null default now(),
      primary key (tournament_id, player_id)
    );
    create table scoring_authority.rounds (
      tournament_id text not null, round_number integer not null,
      format text not null, name text not null, handicap_allowance numeric,
      status text not null default 'UPCOMING', source_payload jsonb not null default '{}'::jsonb,
      primary key (tournament_id, round_number)
    );
    create table scoring_authority.scoring_snapshots (
      snapshot_id text primary key, tournament_id text not null,
      match_id text not null, snapshot_revision bigint not null,
      scoring_rules_version text not null, format text not null,
      handicap_allowance numeric, course_id text not null, tee text not null,
      rating numeric, slope integer, par integer not null,
      match_netting_baseline text not null, hole_definitions jsonb not null,
      participant_configuration jsonb not null, team_configuration jsonb not null,
      effective_at timestamptz, imported_at timestamptz not null default now(),
      canonical_hash text not null, handicap_revision_id uuid,
      unique (match_id, snapshot_revision)
    );
    create table scoring_authority.matches (
      match_id text primary key, tournament_id text not null,
      round_number integer not null, format text not null,
      scoring_snapshot_id text not null, status text not null,
      scoring_locked boolean not null default false,
      permission_revision bigint not null default 1,
      match_revision bigint not null default 0,
      source_google_revision bigint not null default 0,
      scored_holes integer not null default 0, current_hole integer not null default 0,
      holes_remaining integer not null default 18,
      team_1_holes_won integer not null default 0, team_2_holes_won integer not null default 0,
      running_result text not null default 'Scheduled', result_winner text not null default '',
      clinched boolean not null default false, scorecard_complete boolean not null default false,
      unresolved_mutations integer not null default 0,
      source_google_updated_at timestamptz, authority_updated_at timestamptz not null default now(),
      finalized_at timestamptz, created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table scoring_authority.match_participants (
      match_id text not null, player_id text not null, team_side integer not null,
      player_slot integer not null, tournament_handicap numeric,
      handicap_index numeric, course_handicap numeric, playing_handicap numeric not null,
      final_strokes integer not null, handicap_revision_id uuid,
      primary key (match_id, team_side, player_slot), unique (match_id, player_id)
    );
    create table scoring_authority.scoring_permissions (
      match_id text not null, player_id text not null, can_score boolean not null,
      permission_revision bigint not null, revoked_at timestamptz,
      updated_at timestamptz not null default now(), primary key (match_id, player_id)
    );
    create table scoring_authority.match_holes (
      match_id text not null, hole_number integer not null, snapshot_id text not null,
      stroke_index integer not null, par integer not null, yardage integer,
      primary key (match_id, hole_number)
    );
    create table scoring_authority.hole_scores (match_id text not null);
    create table scoring_authority.score_mutations (
      match_id text not null, mutation_key text not null,
      mutation_type text not null, payload_hash text not null,
      previous_match_revision bigint not null, next_match_revision bigint not null,
      result jsonb not null, actor_id text not null,
      primary key (match_id, mutation_key)
    );
    create table scoring_authority.score_revision_history (
      match_id text not null, mutation_key text not null, action text not null,
      previous_match_revision bigint not null, next_match_revision bigint not null,
      before_state jsonb not null, after_state jsonb not null, actor_id text not null
    );
    create table scoring_authority.audit_events (
      tournament_id text not null, match_id text not null,
      mutation_key text not null, action text not null,
      actor_id text not null, metadata jsonb not null
    );
    create table scoring_authority.google_outbox_events (
      tournament_id text not null, match_id text not null,
      match_revision bigint not null, mutation_key text not null,
      event_type text not null, payload jsonb not null, payload_hash text not null
    );
    create table scoring_authority.finalized_scorecard_snapshots (
      snapshot_id uuid primary key default extensions.gen_random_uuid(),
      match_id text not null, state text not null
    );
    create table scoring_authority.scoring_ingress_leases (
      lease_id uuid primary key default extensions.gen_random_uuid(), tournament_id text not null,
      match_id text not null, authority text not null default 'SUPABASE', actor_id text not null default 'test',
      created_at timestamptz not null default now(), expires_at timestamptz not null
    );
    create table scoring_authority.game_center_presentations (
      match_id text primary key, tournament_id text not null,
      course_name text not null default '', course_logo text not null default '',
      course_yardage text not null default '', tee_time text not null default '',
      starting_hole text not null default '', display_match_number text not null default '',
      match_sort_order integer not null, team_1_logo text not null default '',
      team_1_primary_color text not null default '', team_1_secondary_color text not null default '',
      team_2_logo text not null default '', team_2_primary_color text not null default '',
      team_2_secondary_color text not null default '', tournament_location text not null default '',
      tournament_logo text not null default '', tournament_status text not null default '',
      tournament_time_zone text not null default 'America/Chicago', source_workbook_id text not null,
      source_updated_at timestamptz, source_payload_hash text not null, imported_by text not null,
      imported_at timestamptz not null default now(), updated_at timestamptz not null default now()
    );
    create table scoring_authority.completed_history_course_identities (
      course_id text primary key, canonical_name text not null,
      canonical_location text
    );
    create table scoring_authority.handicap_revision_current (
      tournament_id text primary key, revision_id uuid not null
    );
    create table scoring_authority.handicap_revision_entries (
      revision_id uuid not null, tournament_id text not null,
      player_id text not null, tournament_handicap numeric not null,
      primary key (revision_id, player_id)
    );
    create table scoring_authority.draft_current_revisions (
      tournament_id text primary key, revision_id uuid not null
    );
    create table scoring_authority.draft_pick_facts (
      revision_id uuid not null, tournament_id text not null, player_id text not null,
      team_id text, pick_status text not null
    );
    create table scoring_authority.draft_configuration_facts (
      revision_id uuid not null, tournament_id text not null,
      team_1_id text, team_2_id text,
      team_1_captain_player_id text, team_2_captain_player_id text
    );
    create table scoring_authority.net_skins_v1_configuration_revisions (
      configuration_revision_id uuid primary key, configuration_manifest jsonb not null
    );
    create table scoring_authority.net_skins_v1_configuration_current (
      tournament_id text primary key, configuration_revision_id uuid not null, state text not null
    );
    create table scoring_authority.net_skins_v1_recalculation_jobs (
      tournament_id text not null, round_number integer, status text not null
    );
    create table scoring_authority.net_skins_v1_result_revisions (
      tournament_id text not null, round_number integer, is_current boolean not null
    );
    create table scoring_authority.calcutta_v1_auction_fact_revisions (
      auction_revision_id uuid primary key, auction_manifest jsonb not null
    );
    create table scoring_authority.calcutta_v1_current (
      tournament_id text primary key, state text not null default 'NOT_CONFIGURED',
      auction_revision integer not null default 0, auction_revision_id uuid,
      publication_state text not null default 'UNPUBLISHED', result_revision integer not null default 0
    );
    create table scoring_authority.calcutta_v1_recalculation_jobs (
      tournament_id text not null, status text not null
    );
    create table scoring_authority.calcutta_v1_result_revisions (
      tournament_id text not null, is_current boolean not null
    );
    create table scoring_authority.odds_publication_current (
      tournament_id text primary key, publication_state text not null
    );
    create table scoring_authority.odds_calculation_jobs (
      tournament_id text not null, status text not null, publication_status text not null
    );
    create table production_control.access_governance_membership_revisions_v1 (
      tournament_id text not null, player_id text not null,
      membership_revision bigint not null, participation_status text not null,
      updated_by_player_id text not null, updated_by_auth_user_id uuid not null,
      updated_at timestamptz not null default now(), primary key (tournament_id, player_id)
    );
    create table production_control.tournament_owner_capabilities_v1 (
      tournament_id text not null, player_id text not null, auth_user_id uuid not null,
      status text not null, primary key (tournament_id, player_id)
    );

    create function production_control.assert_player_access_runtime_v1(input jsonb)
    returns void language plpgsql security definer
    set search_path = pg_catalog
    as $fixture$
    begin
      if current_setting('request.jwt.claim.role', true) is distinct from 'service_role'
         or input->>'contract_version' is distinct from 'production-players-access-v1'
         or input->>'environment' is distinct from 'PRODUCTION'
         or input->>'project_ref' is distinct from 'ymqhhtxaywtqllynrmxe'
         or input->>'project_url' is distinct from 'https://ymqhhtxaywtqllynrmxe.supabase.co'
         or input->>'source_workbook_id' is distinct from 'workbook-production'
         or input->>'tournament_id' is distinct from '2026'
         or input#>>'{authorization,player_id}' is distinct from 'CB01'
         or input#>>'{authorization,role}' is distinct from 'DIRECTOR' then
        raise exception using errcode = '42501', message = 'FIXTURE_DIRECTOR_SCOPE_REQUIRED';
      end if;
    end $fixture$;
    create function production_control.assert_production_scoring_runtime(
      input jsonb, required_worker text default null
    ) returns void language plpgsql security definer
    set search_path = pg_catalog as $fixture$
    begin
      if current_setting('request.jwt.claim.role', true) is distinct from 'service_role'
         or input->>'environment' is distinct from 'PRODUCTION'
         or input->>'project_ref' is distinct from 'ymqhhtxaywtqllynrmxe'
         or input->>'project_url' is distinct from 'https://ymqhhtxaywtqllynrmxe.supabase.co'
         or input->>'source_workbook_id' is distinct from 'workbook-production'
         or input->>'tournament_id' is distinct from '2026' then
        raise exception using errcode = '42501', message = 'FIXTURE_SCORING_SCOPE_REQUIRED';
      end if;
    end $fixture$;
    create function production_control.assert_production_scoring_actor(
      input jsonb, require_director boolean default false
    ) returns void language plpgsql security definer
    set search_path = pg_catalog as $fixture$
    begin
      if input#>>'{authorization,player_id}' is distinct from 'CB01'
         or input#>>'{authorization,auth_user_id}' is distinct from '${actor.authUserId}'
         or input#>>'{authorization,tournament_id}' is distinct from '2026'
         or input#>>'{authorization,role}' is distinct from 'DIRECTOR' then
        raise exception using errcode = '42501', message = 'FIXTURE_SCORING_DIRECTOR_REQUIRED';
      end if;
    end $fixture$;
    create function production_control.cutover_payload_hash(input jsonb)
    returns text language sql immutable
    set search_path = pg_catalog, extensions as $fixture$
      select encode(extensions.digest(input::text, 'sha256'), 'hex')
    $fixture$;
    create function production_control.access_governance_global_status_v1(target text)
    returns text language sql stable set search_path = pg_catalog as $fixture$
      select 'ACTIVE'::text
    $fixture$;
    create function production_control.handicap_v1_match_is_unstarted(target_match_id text)
    returns boolean language sql stable set search_path = pg_catalog, scoring_authority as $fixture$
      select value.status = 'UPCOMING' and value.scored_holes = 0
        and not value.scoring_locked and value.finalized_at is null
        and not exists (select 1 from scoring_authority.hole_scores score where score.match_id = value.match_id)
        and not exists (select 1 from scoring_authority.score_mutations mutation where mutation.match_id = value.match_id)
      from scoring_authority.matches value where value.match_id = target_match_id
    $fixture$;
    create function production_control.handicap_v1_match_context(target text, revision uuid)
    returns jsonb language sql stable set search_path = pg_catalog, scoring_authority as $fixture$
      select jsonb_build_object(
        'participants', jsonb_agg(jsonb_build_object(
          'match_id', participant.match_id,
          'player_id', participant.player_id,
          'team_side', participant.team_side,
          'player_slot', participant.player_slot,
          'tournament_handicap', entry.tournament_handicap,
          'handicap_index', entry.tournament_handicap,
          'course_handicap', entry.tournament_handicap,
          'playing_handicap', 0, 'final_strokes', 0
        ) order by participant.team_side, participant.player_slot),
        'participant_configuration', jsonb_build_object('all_ids', jsonb_agg(participant.player_id)),
        'team_configuration', '{}'::jsonb
      ) from scoring_authority.match_participants participant
        join scoring_authority.handicap_revision_entries entry
          on entry.revision_id = revision and entry.player_id = participant.player_id
      where participant.match_id = target
    $fixture$;
    create function production_control.build_production_net_skins_v1_manifest(rounds integer[])
    returns jsonb language sql stable set search_path = pg_catalog as $fixture$
      select jsonb_build_object('rounds', to_jsonb(rounds))
    $fixture$;

    insert into auth.users values ('${actor.authUserId}', 'director@example.invalid');
    insert into scoring_authority.tournaments values
      ('2026', 2026, 'Sandbagger Invitational', 'workbook-production', now());
    insert into scoring_authority.players values
      ('CB01','Director','{}'),('CB02','Player 2','{}'),
      ('CB03','Player 3','{}'),('CB04','Player 4','{}'),
      ('CB05','Available Player','{}'),
      ('WD01','Player 5','{}'),('WD02','Player 6','{}'),
      ('WD03','Player 7','{}'),('WD04','Player 8','{}');
    insert into scoring_authority.teams values
      ('2026','CB',1,'Pickles','{"Captain":"CB01"}'),
      ('2026','WD',2,'Mulligans','{"Captain":"WD01"}');
    insert into scoring_authority.tournament_players
      (tournament_id,player_id,team_id,team_side,participation_status,source_roster_key,source_payload)
    values ('2026','CB01','CB',1,'ACTIVE','2026:CB01','{}'),
      ('2026','CB02','CB',1,'ACTIVE','2026:CB02','{}'),
      ('2026','WD01','WD',2,'ACTIVE','2026:WD01','{}'),
      ('2026','WD02','WD',2,'ACTIVE','2026:WD02','{}'),
      ('2026','CB03','CB',1,'ACTIVE','2026:CB03','{}'),
      ('2026','CB04','CB',1,'ACTIVE','2026:CB04','{}'),
      ('2026','WD03','WD',2,'ACTIVE','2026:WD03','{}'),
      ('2026','WD04','WD',2,'ACTIVE','2026:WD04','{}');
    insert into scoring_authority.rounds values
      ('2026',1,'BB','Best Ball',0.9,'UPCOMING','{"Points Available":1}'),
      ('2026',2,'SC','Scramble',1,'UPCOMING','{"Points Available":1}'),
      ('2026',3,'SI','Singles',1,'UPCOMING','{"Points Available":1}');
    insert into scoring_authority.handicap_revision_current values
      ('2026','10000000-0000-4000-8000-000000000001');
    insert into scoring_authority.handicap_revision_entries
      select '10000000-0000-4000-8000-000000000001', '2026', player_id, 5
      from scoring_authority.players;
    update scoring_authority.tournament_players set tournament_handicap=5,
      handicap_revision_id='10000000-0000-4000-8000-000000000001';
    insert into scoring_authority.completed_history_course_identities values
      ('COURSE-1','Course One','Somewhere'),
      ('COURSE-2','Course Two','Elsewhere');
    insert into scoring_authority.scoring_snapshots values (
      '2026-R1-1:S1','2026','2026-R1-1',1,'sandbagger-2026-v1','BB',0.9,
      'COURSE-1','Tournament',72,120,72,'lowest-playing-handicap',
      (select jsonb_agg(jsonb_build_object('hole_number',n,'par',4,'stroke_index',n,'yardage',400) order by n)
        from generate_series(1,18) n),
      '{"team_1":[],"team_2":[],"all_ids":[]}','{}',now(),now(),repeat('a',64),
      '10000000-0000-4000-8000-000000000001'
    );
    insert into scoring_authority.scoring_snapshots values (
      '2026-R1-2:S1','2026','2026-R1-2',1,'sandbagger-2026-v1','BB',0.9,
      'COURSE-1','Tournament',72,120,72,'lowest-playing-handicap',
      (select jsonb_agg(jsonb_build_object('hole_number',n,'par',4,'stroke_index',n,'yardage',400) order by n)
        from generate_series(1,18) n),
      '{"team_1":[],"team_2":[],"all_ids":[]}','{}',now(),now(),repeat('c',64),
      '10000000-0000-4000-8000-000000000001'
    );
    insert into scoring_authority.scoring_snapshots values (
      '2026-R1-4:S1','2026','2026-R1-4',1,'sandbagger-2026-v1','BB',0.9,
      'COURSE-1','Tournament',72,120,72,'lowest-playing-handicap',
      (select jsonb_agg(jsonb_build_object('hole_number',n,'par',4,'stroke_index',n,'yardage',400) order by n)
        from generate_series(1,18) n),
      '{"team_1":["CB05"],"team_2":[],"all_ids":["CB05"]}','{}',now(),now(),repeat('d',64),
      '10000000-0000-4000-8000-000000000001'
    );
    insert into scoring_authority.scoring_snapshots values (
      '2026-R3-1:S1','2026','2026-R3-1',1,'sandbagger-2026-v1','SI',1,
      'COURSE-1','Tournament',72,120,72,'lowest-playing-handicap',
      (select jsonb_agg(jsonb_build_object('hole_number',n,'par',4,'stroke_index',n,'yardage',400) order by n)
        from generate_series(1,18) n),
      '{"team_1":[],"team_2":[],"all_ids":[]}','{}',now(),now(),repeat('f',64),
      '10000000-0000-4000-8000-000000000001'
    );
    insert into scoring_authority.matches
      (match_id,tournament_id,round_number,format,scoring_snapshot_id,status)
    values ('2026-R1-1','2026',1,'BB','2026-R1-1:S1','UPCOMING'),
      ('2026-R1-2','2026',1,'BB','2026-R1-2:S1','UPCOMING'),
      ('2026-R1-4','2026',1,'BB','2026-R1-4:S1','UPCOMING'),
      ('2026-R3-1','2026',3,'SI','2026-R3-1:S1','UPCOMING');
    insert into scoring_authority.match_participants
      (match_id,player_id,team_side,player_slot,tournament_handicap,handicap_index,
       course_handicap,playing_handicap,final_strokes,handicap_revision_id)
    values ('2026-R1-1','CB01',1,1,5,5,5,0,0,'10000000-0000-4000-8000-000000000001'),
      ('2026-R1-1','CB02',1,2,5,5,5,0,0,'10000000-0000-4000-8000-000000000001'),
      ('2026-R1-1','WD01',2,1,5,5,5,0,0,'10000000-0000-4000-8000-000000000001'),
      ('2026-R1-1','WD02',2,2,5,5,5,0,0,'10000000-0000-4000-8000-000000000001'),
      ('2026-R1-4','CB05',1,1,5,5,5,0,0,'10000000-0000-4000-8000-000000000001');
    update scoring_authority.scoring_snapshots snapshot set
      participant_configuration = context.value->'participant_configuration',
      team_configuration = context.value->'team_configuration'
    from (select production_control.handicap_v1_match_context(
      '2026-R1-1','10000000-0000-4000-8000-000000000001'
    ) value) context
    where snapshot.snapshot_id='2026-R1-1:S1';
    insert into scoring_authority.scoring_permissions
      select '2026-R1-1',player_id,false,1,now(),now()
      from scoring_authority.match_participants where match_id='2026-R1-1';
    insert into scoring_authority.scoring_permissions values
      ('2026-R1-4','CB05',false,1,now(),now());
    insert into scoring_authority.match_holes
      select '2026-R1-1',n,'2026-R1-1:S1',n,4,400 from generate_series(1,18) n;
    insert into scoring_authority.match_holes
      select '2026-R1-4',n,'2026-R1-4:S1',n,4,400 from generate_series(1,18) n;
    insert into scoring_authority.game_center_presentations
      (match_id,tournament_id,course_name,tee_time,starting_hole,display_match_number,
       match_sort_order,source_workbook_id,source_payload_hash,imported_by)
    values ('2026-R1-1','2026','Course One','08:00','1','1',101,
      'workbook-production',repeat('b',64),'fixture'),
      ('2026-R1-4','2026','Course One','08:40','','4',104,
      'workbook-production',repeat('e',64),'fixture');
    insert into scoring_authority.odds_publication_current values ('2026','UNPUBLISHED');
    insert into scoring_authority.calcutta_v1_current(tournament_id) values ('2026');
    insert into production_control.tournament_owner_capabilities_v1 values
      ('2026','CB01','${actor.authUserId}','ACTIVE');
  `);
}

test("migrations 063, 083, and 084 compile and enforce starting-hole-free zero-or-complete pairing behavior on PostgreSQL 17", async (context) => {
  if (!(await available())) return context.skip("PostgreSQL 17 binaries unavailable");
  const cluster = await createCluster();
  context.after(() => destroyCluster(cluster));
  const database = "tournament_setup_v1";
  run(bin.createdb, [database], { env: environment(cluster) });
  fixture(cluster, database);
  sqlFile(cluster, database, migration);
  sqlFile(cluster, database, emptyPairingsMigration);
  sqlFile(cluster, database, startingHoleRetirementMigration);

  assert.equal(sql(cluster, database, String.raw`
    select is_nullable || '|' || coalesce(column_default, '')
    from information_schema.columns
    where table_schema='scoring_authority'
      and table_name='tournament_setup_match_details_v1'
      and column_name='starting_hole';
  `), "YES|");
  assert.equal(sql(cluster, database, String.raw`
    select pg_get_functiondef(
      'production_control.apply_tournament_setup_scoring_context_v1(jsonb,bigint,text)'::regprocedure
    ) not like '%starting_hole%';
  `), "t");

  assert.equal(sql(cluster, database, String.raw`
    select concat_ws('|',
      has_function_privilege('service_role', 'public.mutate_production_tournament_setup_v1(jsonb)', 'execute'),
      has_function_privilege('service_role', 'production_control.apply_tournament_setup_pairings_v1(jsonb,bigint,text)', 'execute'),
      has_function_privilege('authenticated', 'production_control.assert_tournament_setup_pairing_clear_safe_v1(text)', 'execute'),
      has_function_privilege('anon', 'production_control.materialize_tournament_setup_legacy_match_v1(text,bigint,text)', 'execute'));
  `), "t|f|f|f");

  const read = rpc(cluster, database, "read_production_tournament_setup_v1",
    scope("READ_PRODUCTION_TOURNAMENT_SETUP_V1"));
  assert.equal(read.ok, true);
  assert.equal(read.data.contractVersion, "production-tournament-setup-v1");
  assert.equal(read.data.roster.length, 8);
  assert.equal(read.data.availablePlayers.length, 1);
  assert.equal(read.data.matches[0].participantCount, 4);
  assert.equal(read.data.matches[0].snapshot.current, true);
  assert.equal(read.data.matches[0].scoring_ready, true);
  assert.equal(read.data.matches[0].scoring_readiness_code,
    "PRODUCTION_MATCH_SCORING_READY");
  assert.deepEqual(read.data.matches[0].scoring_readiness_reasons, []);

  assert.equal(JSON.parse(sql(cluster, database, String.raw`
    select production_control.apply_tournament_setup_pairings_v1(
      '{"match_id":"2026-R3-1","format":"SI","participants":[]}'::jsonb,
      1, 'CB01'
    )::text;
  `)).changed, false);
  for (const count of [1, 2, 3]) {
    const invalidParticipants = Array.from({ length: count }, (_, index) => ({
      player_id: `CB0${index + 1}`, team_side: index < 2 ? 1 : 2,
      player_slot: index % 2 + 1,
    }));
    assert.throws(() => sql(cluster, database, String.raw`
      select production_control.apply_tournament_setup_pairings_v1(
        ${json({ match_id: "2026-R1-4", format: "BB", participants: invalidParticipants })},
        1, 'CB01'
      );
    `), /TOURNAMENT_SETUP_PAIRING_COUNT_INVALID/);
  }

  const legacyClear = scope("REPLACE_PAIRINGS", {
    expected_revision: 0,
    operation_request_id: "20000000-0000-4000-8000-000000000501",
    request_payload_hash: "5".repeat(64),
    match_id: "2026-R1-4",
    format: "BB",
    participants: [],
  });
  const legacyClearConflict = {
    ...legacyClear,
    request_payload_hash: "6".repeat(64),
  };
  const legacyMarkAfterClear = {
    environment: "PRODUCTION",
    project_ref: "ymqhhtxaywtqllynrmxe",
    project_url: "https://ymqhhtxaywtqllynrmxe.supabase.co",
    source_workbook_id: "workbook-production",
    tournament_id: "2026",
    expected_epoch_id: "30000000-0000-4000-8000-000000000001",
    operation: "MARK_LIVE",
    match_id: "2026-R1-4",
    mutation_key: "cleared-mark-live-000000001",
    expected_match_revision: 1,
    authorization: {
      tournament_id: "2026",
      match_id: "2026-R1-4",
      player_id: actor.playerId,
      auth_user_id: actor.authUserId,
      permission_revision: 2,
      role: "DIRECTOR",
    },
  };
  const legacyClearResults = sql(cluster, database, String.raw`
    begin;
    update scoring_authority.odds_publication_current
      set publication_state='PUBLISHED' where tournament_id='2026';
    update scoring_authority.scoring_permissions set revoked_at=null
      where match_id='2026-R1-4';
    select public.mutate_production_tournament_setup_v1(${json(legacyClear)})::text;
    select public.mutate_production_tournament_setup_v1(${json(legacyClear)})::text;
    select public.mutate_production_tournament_setup_v1(${json(legacyClearConflict)})::text;
    select concat_ws('|',
      (select count(*) from scoring_authority.match_participants where match_id='2026-R1-4'),
      (select count(*) from scoring_authority.scoring_permissions where match_id='2026-R1-4'),
      (select count(*) from scoring_authority.match_holes where match_id='2026-R1-4'),
      (select count(*) from scoring_authority.scoring_snapshots where snapshot_id='2026-R1-4:S1'),
      (select count(*) from scoring_authority.tournament_setup_match_details_v1 where match_id='2026-R1-4' and prepared_setup_revision is null),
      (select match_revision from scoring_authority.matches where match_id='2026-R1-4'),
      (select permission_revision from scoring_authority.matches where match_id='2026-R1-4'),
      (select revision from production_control.tournament_setup_context_v1 where tournament_id='2026'),
      (select count(*) from production_control.tournament_setup_operation_receipts_v1 where operation_request_id='20000000-0000-4000-8000-000000000501'),
      (select count(*) from production_control.tournament_setup_audit_events_v1 where operation_request_id='20000000-0000-4000-8000-000000000501'),
      (select starting_hole is null from scoring_authority.tournament_setup_match_details_v1 where match_id='2026-R1-4')
    );
    select production_control.assert_production_match_scoring_ready_v1('2026-R1-4')::text;
    select public.mutate_production_match_control(${json(legacyMarkAfterClear)})::text;
    select concat_ws('|',
      (select count(*) from scoring_authority.score_mutations where match_id='2026-R1-4'),
      (select publication_state from scoring_authority.odds_publication_current where tournament_id='2026'),
      (select count(*) from scoring_authority.handicap_revision_entries where revision_id='10000000-0000-4000-8000-000000000001' and player_id='CB05'));
    rollback;
  `).split("\n");
  const clearFirst = JSON.parse(legacyClearResults[0]);
  const clearRetry = JSON.parse(legacyClearResults[1]);
  const clearConflict = JSON.parse(legacyClearResults[2]);
  const clearReadiness = JSON.parse(legacyClearResults[4]);
  const clearMarkLive = JSON.parse(legacyClearResults[5]);
  assert.equal(clearFirst.ok, true);
  assert.equal(clearFirst.changed, true);
  assert.equal(clearFirst.revision, 1);
  assert.deepEqual(clearFirst.warnings, [
    "Published Odds remain unchanged; review them after new pairings are configured.",
  ]);
  assert.equal(clearRetry.idempotent, true);
  assert.equal(clearRetry.revision, 1);
  assert.equal(clearConflict.code, "TOURNAMENT_SETUP_IDEMPOTENCY_CONFLICT");
  assert.equal(legacyClearResults[3], "0|0|0|1|1|1|2|1|1|1|t");
  assert.equal(clearReadiness.ready, false);
  assert.ok(clearReadiness.reasons.some((item) => item.code === "PAIRINGS_INCOMPLETE"));
  assert.equal(clearMarkLive.ok, false);
  assert.equal(clearMarkLive.code, "PRODUCTION_MATCH_NOT_SCORING_READY");
  assert.equal(legacyClearResults[6], "0|PUBLISHED|1");
  assert.equal(sql(cluster, database, String.raw`
    select concat_ws('|',
      (select count(*) from scoring_authority.match_participants where match_id='2026-R1-4'),
      (select count(*) from scoring_authority.match_holes where match_id='2026-R1-4'),
      (select count(*) from scoring_authority.tournament_setup_match_details_v1 where match_id='2026-R1-4'),
      production_control.tournament_setup_revision_v1('2026'));
  `), "1|18|0|0");

  for (const unsafe of [
    "update scoring_authority.matches set status='LIVE' where match_id='2026-R1-4'",
    "insert into scoring_authority.hole_scores values ('2026-R1-4')",
    "update scoring_authority.matches set status='FINAL', finalized_at=now() where match_id='2026-R1-4'",
    "insert into scoring_authority.finalized_scorecard_snapshots(match_id,state) values ('2026-R1-4','CURRENT')",
    "insert into scoring_authority.scoring_ingress_leases(tournament_id,match_id,expires_at) values ('2026','2026-R1-4',now()+interval '5 minutes')",
    "insert into scoring_authority.score_mutations values ('2026-R1-4','unsafe','HOLE_SCORE',repeat('f',64),0,1,'{}','CB01')",
    "update scoring_authority.scoring_permissions set can_score=true where match_id='2026-R1-4'",
  ]) {
    assert.throws(() => sql(cluster, database, `begin; ${unsafe}; select production_control.assert_tournament_setup_pairing_clear_safe_v1('2026-R1-4');`),
      /TOURNAMENT_SETUP_PAIRING_CLEAR_UNSAFE/);
  }

  const operationId = (number) => `20000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
  const mutationFor = (operation, revision, number, values = {}) => scope(operation, {
    expected_revision: revision,
    operation_request_id: operationId(number),
    request_payload_hash: String(number % 10).repeat(64),
    ...values,
  });
  const mutate = (input) => rpc(cluster, database,
    "mutate_production_tournament_setup_v1", input);
  const matchRevisions = (matchId) => {
    const [matchRevision, permissionRevision] = sql(cluster, database,
      `select match_revision || '|' || permission_revision from scoring_authority.matches where match_id='${matchId}';`).split("|");
    return {
      matchRevision: Number(matchRevision),
      permissionRevision: Number(permissionRevision),
    };
  };
  const markLiveInput = (matchId, mutationKey) => {
    const revisions = matchRevisions(matchId);
    return {
      environment: "PRODUCTION",
      project_ref: "ymqhhtxaywtqllynrmxe",
      project_url: "https://ymqhhtxaywtqllynrmxe.supabase.co",
      source_workbook_id: "workbook-production",
      tournament_id: "2026",
      expected_epoch_id: "30000000-0000-4000-8000-000000000001",
      operation: "MARK_LIVE",
      match_id: matchId,
      mutation_key: mutationKey,
      expected_match_revision: revisions.matchRevision,
      authorization: {
        tournament_id: "2026",
        match_id: matchId,
        player_id: actor.playerId,
        auth_user_id: actor.authUserId,
        permission_revision: revisions.permissionRevision,
        role: "DIRECTOR",
      },
    };
  };
  const markLive = (matchId, mutationKey) => rpc(cluster, database,
    "mutate_production_match_control", markLiveInput(matchId, mutationKey));
  const holes = Array.from({ length: 18 }, (_, index) => ({
    hole_number: index + 1,
    par: 4,
    stroke_index: index + 1,
    yardage: 400,
  }));

  const legacyMarkInput = markLiveInput(
    "2026-R1-1", "legacy-mark-live-000000000001"
  );
  const legacyAttempt = sql(cluster, database, String.raw`
    begin;
    update scoring_authority.scoring_permissions
      set can_score=false, revoked_at=null
      where match_id='2026-R1-1';
    select public.mutate_production_match_control(${json(legacyMarkInput)})::text;
    select public.mutate_production_match_control(${json(legacyMarkInput)})::text;
    rollback;
  `).split("\n").map((value) => JSON.parse(value));
  assert.equal(legacyAttempt[0].code, "MARK_LIVE");
  assert.equal(legacyAttempt[0].status, "LIVE");
  assert.equal(legacyAttempt[1].idempotent, true);
  assert.equal(sql(cluster, database,
    "select status from scoring_authority.matches where match_id='2026-R1-1';"),
  "UPCOMING");
  assert.equal(sql(cluster, database,
    "select count(*) from scoring_authority.score_mutations;"), "0");

  const activeLockedInput = markLiveInput(
    "2026-R1-1", "active-locked-mark-00000001"
  );
  const activeLocked = JSON.parse(sql(cluster, database, String.raw`
    begin;
    update scoring_authority.matches set scoring_locked=true
      where match_id='2026-R1-1';
    update scoring_authority.scoring_permissions
      set can_score=true, revoked_at=null
      where match_id='2026-R1-1';
    select public.mutate_production_match_control(${json(activeLockedInput)})::text;
    rollback;
  `));
  assert.equal(activeLocked.code, "MARK_LIVE");
  assert.equal(activeLocked.scoring_locked, true);
  assert.equal(activeLocked.access_active, true);

  const mutation = mutationFor("UPDATE_TOURNAMENT", 0, 1, {
    tournament_name: "Sandbagger Invitational",
    destination: "Kiawah Island",
    start_date: "2026-09-24",
    end_date: "2026-09-27",
    time_zone: "America/New_York",
    operational_status: "UPCOMING",
  });
  const first = mutate(mutation);
  assert.equal(first.ok, true);
  assert.equal(first.revision, 1);
  assert.equal(first.idempotent, false);
  assert.equal(sql(cluster, database, String.raw`
    select tournament_location || '|' || tournament_time_zone || '|' || imported_by
    from scoring_authority.game_center_presentations
    where match_id='2026-R1-1';
  `), "Kiawah Island|America/New_York|production-tournament-setup-v1");
  const retry = mutate(mutation);
  assert.equal(retry.idempotent, true);
  assert.equal(retry.revision, 1);
  const conflict = mutate({ ...mutation, destination: "Elsewhere" });
  assert.equal(conflict.code, "TOURNAMENT_SETUP_IDEMPOTENCY_CONFLICT");

  assert.equal(mutate(mutationFor("UPDATE_TEAM", 1, 2, {
    team_id: "CB", team_name: "The Pickles", captain_player_id: "CB01",
  })).revision, 2);
  assert.equal(mutate(mutationFor("ASSIGN_ROSTER_TEAM", 2, 3, {
    player_id: "CB05", team_id: "CB",
  })).revision, 3);
  const roundResult = mutate(mutationFor("UPDATE_ROUND", 3, 4, {
    round_number: 1, round_name: "Best Ball", format: "BB",
    team_size: 2, points_available: "2", handicap_allowance: "0.9",
  }));
  assert.equal(roundResult.revision, 4);
  assert.equal(sql(cluster, database,
    "select source_payload->>'Points Available' from scoring_authority.rounds where tournament_id='2026' and round_number=1;"), "2");

  const courseResult = mutate(mutationFor("UPSERT_COURSE", 4, 5, {
    round_number: 1, course_id: "COURSE-1", course_name: "Course One",
    city: "Kiawah", state: "SC", tee: "Tournament",
    rating: "72", slope: 120, par: 72, holes,
  }));
  assert.equal(courseResult.revision, 5);
  const matchResult = mutate(mutationFor("UPSERT_MATCH", 5, 6, {
    match_id: "2026-R1-2", round_number: 1, match_number: 2,
    course_id: "COURSE-1", tee: "Tournament", tee_time: "08:20",
    starting_hole: 1,
  }));
  assert.equal(matchResult.revision, 6);
  assert.equal(sql(cluster, database,
    "select count(*) from scoring_authority.game_center_presentations where match_id='2026-R1-2';"), "1");
  const pairingResult = mutate(mutationFor("REPLACE_PAIRINGS", 6, 7, {
    match_id: "2026-R1-2", format: "BB", participants: [
      { player_id: "CB03", team_side: 1, player_slot: 1 },
      { player_id: "CB04", team_side: 1, player_slot: 2 },
      { player_id: "WD03", team_side: 2, player_slot: 1 },
      { player_id: "WD04", team_side: 2, player_slot: 2 },
    ],
  }));
  assert.equal(pairingResult.revision, 7);
  assert.equal(sql(cluster, database,
    "select count(*) from scoring_authority.scoring_permissions where match_id='2026-R1-2' and not can_score and revoked_at is not null;"), "4");
  const prepareResult = mutate(mutationFor("PREPARE_SCORING_CONTEXT", 7, 8, {
    match_id: "2026-R1-2",
  }));
  assert.equal(prepareResult.revision, 8);
  assert.equal(prepareResult.snapshotPrepared, true);
  assert.equal(sql(cluster, database,
    "select snapshot_revision from scoring_authority.scoring_snapshots where snapshot_id=(select scoring_snapshot_id from scoring_authority.matches where match_id='2026-R1-2');"), "2");

  const beforeSpoof = sql(cluster, database, String.raw`
    select concat_ws('|',
      (select revision from production_control.tournament_setup_context_v1 where tournament_id='2026'),
      (select count(*) from production_control.tournament_setup_operation_receipts_v1),
      (select count(*) from production_control.tournament_setup_audit_events_v1));
  `);
  const spoofedActor = mutate(mutationFor("UPDATE_TEAM", 8, 79, {
    actor_player_id: "WD01",
    team_id: "CB", team_name: "Spoofed", captain_player_id: "CB01",
  }));
  assert.equal(spoofedActor.code, "TOURNAMENT_SETUP_INPUT_INVALID");
  assert.equal(sql(cluster, database, String.raw`
    select concat_ws('|',
      (select revision from production_control.tournament_setup_context_v1 where tournament_id='2026'),
      (select count(*) from production_control.tournament_setup_operation_receipts_v1),
      (select count(*) from production_control.tournament_setup_audit_events_v1));
  `), beforeSpoof);

  const stale = mutate(mutationFor("UPDATE_TEAM", 0, 80, {
    team_id: "CB", team_name: "Stale", captain_player_id: "CB01",
  }));
  assert.equal(stale.code, "TOURNAMENT_SETUP_REVISION_STALE");

  assert.throws(() => mutate(mutationFor("REPLACE_PAIRINGS", 8, 81, {
    match_id: "2026-R1-2", format: "BB", participants: [
      { player_id: "CB03", team_side: 2, player_slot: 1 },
      { player_id: "CB04", team_side: 1, player_slot: 2 },
      { player_id: "WD03", team_side: 2, player_slot: 1 },
      { player_id: "WD04", team_side: 2, player_slot: 2 },
    ],
  })), /TOURNAMENT_SETUP_PAIRING_ACTIVE_TEAM_MEMBERSHIP_REQUIRED/);
  assert.throws(() => mutate(mutationFor("UPSERT_COURSE", 8, 82, {
    round_number: 1, course_id: "COURSE-1", course_name: "Course One",
    city: "Kiawah", state: "SC", tee: "Tournament",
    rating: "72", slope: 120, par: 72, holes: holes.slice(0, 17),
  })), /TOURNAMENT_SETUP_COURSE_SCORING_VALUES_INVALID/);

  sql(cluster, database, "update scoring_authority.matches set status='LIVE' where match_id='2026-R1-1';");
  const startedRound = mutate(mutationFor("UPSERT_MATCH", 8, 83, {
    match_id: "2026-R1-3", round_number: 1, match_number: 3,
    course_id: "COURSE-1", tee: "Tournament", tee_time: "08:40", starting_hole: 1,
  }));
  assert.equal(startedRound.code, "TOURNAMENT_SETUP_EXISTING_MATCH_REQUIRED");
  assert.equal(startedRound.revision, 8);
  assert.equal(sql(cluster, database,
    "select count(*) from scoring_authority.matches where match_id='2026-R1-3';"), "0");
  assert.throws(() => mutate(mutationFor("UPSERT_MATCH", 8, 85, {
    match_id: "2026-R1-1", round_number: 1, match_number: 1,
    course_id: "COURSE-1", tee: "Tournament", tee_time: "08:10", starting_hole: 1,
  })), /TOURNAMENT_SETUP_MATCH_FROZEN/);
  sql(cluster, database, "update scoring_authority.matches set status='UPCOMING' where match_id='2026-R1-1';");

  sql(cluster, database, "update scoring_authority.matches set format='SC' where match_id='2026-R1-2';");
  assert.throws(() => mutate(mutationFor("PREPARE_SCORING_CONTEXT", 8, 84, {
    match_id: "2026-R1-2",
  })), /TOURNAMENT_SETUP_MATCH_ROUND_FORMAT_MISMATCH/);
  sql(cluster, database, "update scoring_authority.matches set format='BB' where match_id='2026-R1-2';");

  assert.equal(mutate(mutationFor("UPSERT_COURSE", 8, 9, {
    round_number: 1, course_id: "COURSE-2", course_name: "Course Two",
    city: "Elsewhere", state: "SC", tee: "Tournament",
    rating: "71", slope: 118, par: 72, holes,
  })).revision, 9);
  sql(cluster, database,
    "update scoring_authority.game_center_presentations set course_logo='stale-logo',course_yardage='stale-yardage' where match_id='2026-R1-2';");
  assert.equal(mutate(mutationFor("UPSERT_MATCH", 9, 10, {
    match_id: "2026-R1-2", round_number: 1, match_number: 2,
    course_id: "COURSE-2", tee: "Tournament", tee_time: "08:20", starting_hole: 1,
  })).revision, 10);
  assert.equal(sql(cluster, database,
    "select course_logo || '|' || course_yardage from scoring_authority.game_center_presentations where match_id='2026-R1-2';"), "|");

  assert.throws(() => sql(cluster, database,
    `select public.read_production_tournament_setup_v1(${json(scope("READ_PRODUCTION_TOURNAMENT_SETUP_V1"))});`,
    { role: "authenticated" }), /FIXTURE_DIRECTOR_SCOPE_REQUIRED/);

  sql(cluster, database, String.raw`
    update scoring_authority.scoring_permissions set can_score=true,
      revoked_at=null where match_id='2026-R1-2' and player_id='CB03';
  `);
  const frozen = scope("UPSERT_MATCH", {
    expected_revision: 10,
    operation_request_id: "20000000-0000-4000-8000-000000000099",
    request_payload_hash: "d".repeat(64),
    match_id: "2026-R1-2", round_number: 1, match_number: 2,
    course_id: "COURSE-2", tee: "Tournament", tee_time: "08:30", starting_hole: 1,
  });
  assert.throws(() => sql(cluster, database,
    `select public.mutate_production_tournament_setup_v1(${json(frozen)});`),
  /TOURNAMENT_SETUP_MATCH_FROZEN/);

  sql(cluster, database, String.raw`
    update scoring_authority.scoring_permissions set can_score=false,
      revoked_at=now() where match_id='2026-R1-2';
  `);
  const beforeBlockedMark = sql(cluster, database, String.raw`
    select concat_ws('|',
      (select match_revision from scoring_authority.matches where match_id='2026-R1-2'),
      (select count(*) from scoring_authority.score_mutations),
      (select count(*) from scoring_authority.audit_events),
      (select count(*) from scoring_authority.google_outbox_events));
  `);
  const staleSetupMark = markLive(
    "2026-R1-2", "not-ready-mark-live-000001"
  );
  assert.equal(staleSetupMark.code, "PRODUCTION_MATCH_NOT_SCORING_READY");
  assert.ok(staleSetupMark.reasons.some(({ code }) =>
    code === "SETUP_SNAPSHOT_STALE"));
  assert.equal(sql(cluster, database, String.raw`
    select concat_ws('|',
      (select match_revision from scoring_authority.matches where match_id='2026-R1-2'),
      (select count(*) from scoring_authority.score_mutations),
      (select count(*) from scoring_authority.audit_events),
      (select count(*) from scoring_authority.google_outbox_events));
  `), beforeBlockedMark);

  assert.equal(mutate(mutationFor("PREPARE_SCORING_CONTEXT", 10, 11, {
    match_id: "2026-R1-2",
  })).revision, 11);
  assert.equal(mutate(mutationFor("UPSERT_MATCH", 11, 12, {
    match_id: "2026-R1-1", round_number: 1, match_number: 1,
    course_id: "COURSE-2", tee: "Tournament", tee_time: "08:00",
    starting_hole: 1,
  })).revision, 12);
  assert.equal(mutate(mutationFor("PREPARE_SCORING_CONTEXT", 12, 13, {
    match_id: "2026-R1-1",
  })).revision, 13);
  const unaffectedMarker = sql(cluster, database, String.raw`
    select setup_revision || '|' || prepared_setup_revision || '|'
      || prepared_configuration_fingerprint
    from scoring_authority.tournament_setup_match_details_v1
    where match_id='2026-R1-1';
  `);
  assert.equal(mutate(mutationFor("ASSIGN_ROSTER_TEAM", 13, 14, {
    player_id: "CB03", team_id: "WD",
  })).revision, 14);
  assert.equal(sql(cluster, database, String.raw`
    select prepared_setup_revision is null
    from scoring_authority.tournament_setup_match_details_v1
    where match_id='2026-R1-2';
  `), "t");
  assert.equal(sql(cluster, database, String.raw`
    select setup_revision || '|' || prepared_setup_revision || '|'
      || prepared_configuration_fingerprint
    from scoring_authority.tournament_setup_match_details_v1
    where match_id='2026-R1-1';
  `), unaffectedMarker);
  const membershipBlocked = markLive(
    "2026-R1-2", "membership-stale-mark-0001"
  );
  assert.equal(membershipBlocked.code, "PRODUCTION_MATCH_NOT_SCORING_READY");
  assert.ok(membershipBlocked.reasons.some(({ code }) =>
    code === "PAIRING_TEAM_MEMBERSHIP_INVALID"));
  assert.equal(mutate(mutationFor("ASSIGN_ROSTER_TEAM", 14, 15, {
    player_id: "CB03", team_id: "CB",
  })).revision, 15);
  assert.equal(mutate(mutationFor("PREPARE_SCORING_CONTEXT", 15, 16, {
    match_id: "2026-R1-2",
  })).revision, 16);

  sql(cluster, database, String.raw`
    insert into scoring_authority.handicap_revision_entries
      select '10000000-0000-4000-8000-000000000002','2026',player_id,6
      from scoring_authority.players;
    update scoring_authority.handicap_revision_current
      set revision_id='10000000-0000-4000-8000-000000000002'
      where tournament_id='2026';
  `);
  const staleHandicap = markLive(
    "2026-R1-2", "stale-handicap-mark-00001"
  );
  assert.equal(staleHandicap.code, "PRODUCTION_MATCH_NOT_SCORING_READY");
  assert.ok(staleHandicap.reasons.some(({ code }) =>
    code === "HANDICAP_CONTEXT_NOT_CURRENT"));
  sql(cluster, database, String.raw`
    update scoring_authority.handicap_revision_current
      set revision_id='10000000-0000-4000-8000-000000000001'
      where tournament_id='2026';
  `);

  sql(cluster, database, String.raw`
    update scoring_authority.match_participants set final_strokes=99
      where match_id='2026-R1-2' and player_id='CB03';
  `);
  const staleParticipant = markLive(
    "2026-R1-2", "stale-participant-mark-001"
  );
  assert.ok(staleParticipant.reasons.some(({ code }) =>
    code === "SCORING_PARTICIPANT_HANDICAPS_STALE"));
  sql(cluster, database, String.raw`
    update scoring_authority.match_participants set final_strokes=0
      where match_id='2026-R1-2' and player_id='CB03';
  `);
  sql(cluster, database, String.raw`
    update scoring_authority.scoring_permissions set can_score=true,
      revoked_at=null where match_id='2026-R1-2' and player_id='CB03';
  `);
  const mixedPermission = markLive(
    "2026-R1-2", "mixed-permission-mark-0001"
  );
  assert.ok(mixedPermission.reasons.some(({ code }) =>
    code === "SCORING_PERMISSION_COVERAGE_INVALID"));
  sql(cluster, database, String.raw`
    update scoring_authority.scoring_permissions set can_score=false,
      revoked_at=now() where match_id='2026-R1-2';
  `);

  assert.equal(mutate(mutationFor("UPDATE_ROUND", 16, 17, {
    round_number: 1, round_name: "Best Ball", format: "BB",
    team_size: 2, points_available: "3", handicap_allowance: "0.9",
  })).revision, 17);
  assert.equal(markLive("2026-R1-2", "round-stale-mark-0000001").code,
    "PRODUCTION_MATCH_NOT_SCORING_READY");
  assert.equal(mutate(mutationFor("PREPARE_SCORING_CONTEXT", 17, 18, {
    match_id: "2026-R1-2",
  })).revision, 18);
  assert.equal(mutate(mutationFor("REPLACE_PAIRINGS", 18, 19, {
    match_id: "2026-R1-2", format: "BB", participants: [
      { player_id: "CB04", team_side: 1, player_slot: 1 },
      { player_id: "CB03", team_side: 1, player_slot: 2 },
      { player_id: "WD04", team_side: 2, player_slot: 1 },
      { player_id: "WD03", team_side: 2, player_slot: 2 },
    ],
  })).revision, 19);
  assert.equal(markLive("2026-R1-2", "pairing-stale-mark-0001").code,
    "PRODUCTION_MATCH_NOT_SCORING_READY");
  assert.equal(mutate(mutationFor("PREPARE_SCORING_CONTEXT", 19, 20, {
    match_id: "2026-R1-2",
  })).revision, 20);
  const readyValue = JSON.parse(sql(cluster, database,
    "select production_control.assert_production_match_scoring_ready_v1('2026-R1-2')::text;"));
  assert.equal(readyValue.ready, true);

  const markInput = markLiveInput(
    "2026-R1-2", "successful-mark-live-00001"
  );
  const markedLive = rpc(cluster, database,
    "mutate_production_match_control", markInput);
  assert.equal(markedLive.code, "MARK_LIVE");
  assert.equal(markedLive.status, "LIVE");
  const markedRetry = rpc(cluster, database,
    "mutate_production_match_control", markInput);
  assert.equal(markedRetry.idempotent, true);
  assert.equal(markedRetry.code, "MARK_LIVE");

  const state = sql(cluster, database, String.raw`
    select concat_ws('|',
      (select revision from production_control.tournament_setup_context_v1 where tournament_id='2026'),
      (select count(*) from production_control.tournament_setup_operation_receipts_v1),
      (select count(*) from production_control.tournament_setup_audit_events_v1),
      (select count(*) from scoring_authority.hole_scores),
      (select count(*) from scoring_authority.score_mutations));
  `);
  assert.equal(state, "20|20|20|0|1");
  assert.equal(sql(cluster, database, String.raw`
    select concat_ws('|',
      (select count(*) from scoring_authority.score_revision_history),
      (select count(*) from scoring_authority.audit_events),
      (select count(*) from scoring_authority.google_outbox_events));
  `), "1|1|1");
});

test("086 permits only identical first-time legacy adoption, inert installation and serialized Odds dependencies", async (context) => {
  if (!(await available())) return context.skip("PostgreSQL 17 binaries unavailable");
  const cluster = await createCluster();
  context.after(() => destroyCluster(cluster));
  const database = "identical_course_adoption";
  run(bin.createdb, [database], { env: environment(cluster) });
  fixture(cluster, database);
  sqlFile(cluster, database, migration);
  sqlFile(cluster, database, emptyPairingsMigration);
  sqlFile(cluster, database, startingHoleRetirementMigration);
  // Exercise the installed started-state definition, not the harness stub.
  const handicapSql = await readFile(path.join(root,
    "supabase/production_migrations/202608290058_production_handicap_revisions_v1.sql"), "utf8");
  const unstarted = handicapSql.match(/create or replace function production_control\.handicap_v1_match_is_unstarted\([\s\S]*?\$\$;/)[0];
  sql(cluster, database, unstarted);
  sql(cluster, database, `
    delete from scoring_authority.matches where match_id='2026-R3-1';
    delete from scoring_authority.scoring_snapshots where match_id='2026-R3-1';
    insert into scoring_authority.rounds(tournament_id,round_number,format,name,handicap_allowance)
      values ('2026',2,'SC','Scramble',1) on conflict do nothing;
    alter table scoring_authority.odds_publication_current
      add column publication_revision integer default 1,
      add column payload_hash text default repeat('a',64),
      add column freshness_state text default 'CURRENT',
      add column pairing_fingerprint text default 'old-pairing-fingerprint';
    update scoring_authority.odds_publication_current set publication_state='PUBLISHED';
  `);
  for (const course of identicalLegacyCourses) {
    const round = course.round_numbers[0];
    sql(cluster, database, `
      insert into scoring_authority.completed_history_course_identities
        values ('${course.course_id}','${course.course_name}','Kiawah Island');
      insert into scoring_authority.scoring_snapshots
        (snapshot_id,tournament_id,match_id,snapshot_revision,scoring_rules_version,format,
        handicap_allowance,course_id,tee,rating,slope,par,match_netting_baseline,
        hole_definitions,participant_configuration,team_configuration,canonical_hash)
      select '2026-R${round}-'||n||':S1','2026','2026-R${round}-'||n,1,'sandbagger-2026-v1',
        '${round === 2 ? "SC" : "SI"}',1,'${course.course_id}','${course.tee}',
        ${course.rating},${course.slope},${course.par},'lowest-playing-handicap',
        ${json(course.holes)},'{"team_1":[],"team_2":[],"all_ids":[]}','{}',repeat('e',64)
      from generate_series(1,${course.matchCount}) n;
      insert into scoring_authority.matches
        (match_id,tournament_id,round_number,format,scoring_snapshot_id,status)
      select match_id,'2026',${round},format,snapshot_id,'UPCOMING'
      from scoring_authority.scoring_snapshots where course_id='${course.course_id}';
      insert into scoring_authority.match_holes
      select s.match_id,(h->>'hole_number')::integer,s.snapshot_id,(h->>'stroke_index')::integer,
        (h->>'par')::integer,(h->>'yardage')::integer
      from scoring_authority.scoring_snapshots s,
        jsonb_array_elements(s.hole_definitions) h where s.course_id='${course.course_id}';
    `);
  }
  const invariantTables = [
    "matches", "scoring_snapshots", "match_holes", "match_participants", "scoring_permissions",
    "hole_scores", "score_mutations", "finalized_scorecard_snapshots", "tournament_players",
    "handicap_revision_current", "handicap_revision_entries", "odds_publication_current",
    "odds_calculation_jobs", "net_skins_v1_configuration_current", "net_skins_v1_result_revisions",
    "calcutta_v1_current", "calcutta_v1_result_revisions",
  ];
  const fingerprint = (tables) => sql(cluster, database,
    `select encode(extensions.digest(jsonb_build_array(${tables.map((name) =>
      `(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from ${name} t)`).join(",")})::text,'sha256'),'hex');`);
  const invariants = invariantTables.map((name) => "scoring_authority." + name);
  const setupTables = ["scoring_authority.tournament_setup_course_tees_v1",
    "scoring_authority.tournament_setup_course_holes_v1", "scoring_authority.tournament_setup_round_courses_v1",
    "scoring_authority.tournament_setup_match_details_v1", "production_control.tournament_setup_context_v1",
    "production_control.tournament_setup_operation_receipts_v1", "production_control.tournament_setup_audit_events_v1"];
  const beforeInstall = fingerprint([...invariants, ...setupTables]);
  const guardBefore = sql(cluster, database,
    "select pg_get_functiondef('production_control.tournament_setup_dependency_codes_v1(text,text,integer,text,text)'::regprocedure);");
  sqlFile(cluster, database, identicalAdoptionMigration);
  assert.equal(fingerprint([...invariants, ...setupTables]), beforeInstall, "installation creates no domain state");
  assert.equal(sql(cluster, database,
    "select pg_get_functiondef('production_control.tournament_setup_dependency_codes_v1(text,text,integer,text,text)'::regprocedure);"), guardBefore);
  const beforeAdoption = fingerprint(invariants);
  const certificate = (course) => JSON.parse(sql(cluster, database,
    `select production_control.certify_identical_legacy_course_adoption_v1('2026',${json(course)})::text;`));
  const makeRequest = (course, revision = 0, id = 1) => scope("UPSERT_COURSE", {
    expected_revision: revision,
    operation_request_id: `60000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
    request_payload_hash: String(id % 10).repeat(64), course,
  });
  const mutate = (input) => rpc(cluster, database, "mutate_production_tournament_setup_v1", input);
  for (const course of identicalLegacyCourses) {
    const proof = certificate(course);
    assert.equal(proof.eligible, true);
    assert.equal(proof.orderedHoleFingerprint, course.fingerprint);
    assert.equal(proof.matchCount, course.matchCount);
    assert.equal(certificate({ ...course, holes: [...course.holes].reverse() }).eligible, true,
      "input order normalizes by hole number");
  }
  const r2 = identicalLegacyCourses[0], r3 = identicalLegacyCourses[1];
  const assertBlocked = (course, before = "", label = "") => {
    let result;
    try {
      result = JSON.parse(sql(cluster, database, `begin; ${before}
        select public.mutate_production_tournament_setup_v1(${json(makeRequest(course))})::text;
        rollback;`));
    } catch (error) {
      assert.match(error.message, /TOURNAMENT_SETUP_(COURSE_SCORING_VALUES_INVALID|HOLE_NUMBER_STROKE_INDEX_INCOMPLETE|HOLE_DEFINITION_INVALID)/, label);
      return;
    }
    assert.equal(result.ok, false, label);
    assert.ok(result.blockers?.some((code) => ["ODDS_PUBLICATION_DEPENDENCY",
      "STARTED_MATCH_DEPENDENCY", "ACTIVE_SCORING_ACCESS_DEPENDENCY",
      "NET_SKINS_RESULT_DEPENDENCY", "CALCUTTA_AUCTION_DEPENDENCY"].includes(code)), JSON.stringify(result));
  };
  for (const [field, value] of [["course_id","OCGC01"],["tee","Gold"],["rating",72.8],["slope",139]]) {
    assertBlocked({ ...r2, [field]: value }, "", field);
  }
  assertBlocked({ ...r2, par: 73, holes: r2.holes.map((h,i) => i ? h : { ...h, par: 5 }) }, "", "par");
  for (const field of ["par", "stroke_index", "yardage"]) {
    const changed = structuredClone(r2);
    if (field === "yardage") changed.holes[0].yardage++;
    else [changed.holes[0][field], changed.holes[1][field]] = [changed.holes[1][field], changed.holes[0][field]];
    assertBlocked(changed, "", field);
  }
  assertBlocked({ ...r2, holes: r2.holes.slice(0,17) }, "", "partial holes");
  assertBlocked({ ...r2, round_numbers: [2,3] }, "", "round overreach");
  const unsafeStates = [
    "update scoring_authority.scoring_snapshots set rating=72.8 where match_id='2026-R2-6';",
    "update scoring_authority.scoring_snapshots set course_id='OCGC01' where match_id='2026-R2-6';",
    "update scoring_authority.scoring_snapshots set hole_definitions='[]' where match_id='2026-R2-6';",
    "delete from scoring_authority.match_holes where match_id='2026-R2-6' and hole_number=18;",
    "update scoring_authority.match_holes set yardage=yardage+1 where match_id='2026-R2-6' and hole_number=18;",
    "update scoring_authority.match_holes set snapshot_id='old' where match_id='2026-R2-6';",
    ...["status='LIVE'", "status='FINAL'", "scored_holes=1", "current_hole=1", "holes_remaining=17",
      "scoring_locked=true", "unresolved_mutations=1", "result_winner='Team 1'", "running_result='1 UP'",
      "team_1_holes_won=1", "scorecard_complete=true", "clinched=true", "finalized_at=now()"]
      .map((change) => `update scoring_authority.matches set ${change} where match_id='2026-R2-6';`),
    "insert into scoring_authority.hole_scores values ('2026-R2-6');",
    "insert into scoring_authority.score_mutations values ('2026-R2-6','test','CONTROL',repeat('f',64),0,1,'{}','CB01');",
    "insert into scoring_authority.finalized_scorecard_snapshots(match_id,state) values ('2026-R2-6','SUPERSEDED');",
    "insert into scoring_authority.scoring_ingress_leases(tournament_id,match_id,expires_at) values ('2026','2026-R2-6',now()+interval '5 minutes');",
    "insert into scoring_authority.scoring_permissions values ('2026-R2-6','CB01',true,1,null,now());",
    "insert into scoring_authority.scoring_permissions values ('2026-R2-6','CB01',false,1,null,now());",
    "insert into scoring_authority.scoring_permissions values ('2026-R2-6','CB01',false,2,now(),now());",
    `insert into scoring_authority.tournament_setup_course_tees_v1
      (tournament_id,course_id,tee_id,display_name,rating,slope,par,setup_revision,updated_by_player_id)
      values ('2026','OTHER','Gold','Other',74,150,72,1,'CB01');
      insert into scoring_authority.tournament_setup_match_details_v1
      (match_id,tournament_id,round_number,match_number,course_id,tee_id,setup_revision,
      prepared_setup_revision,prepared_configuration_fingerprint,updated_by_player_id)
      values ('2026-R2-6','2026',2,6,'OTHER','Gold',1,1,repeat('f',64),'CB01');`,
  ];
  for (const state of unsafeStates) assertBlocked(r2, state, state);
  for (const [status, publication] of [["PENDING","NOT_READY"],["RUNNING","NOT_READY"],
    ["RETRYABLE","NOT_READY"],["SUCCEEDED","READY"]]) {
    assertBlocked(r2, `insert into scoring_authority.odds_calculation_jobs values ('2026','${status}','${publication}');`, status);
  }
  // Other-domain dependencies and the global guard are never removed.
  assertBlocked(r2, "update scoring_authority.calcutta_v1_current set auction_revision=1;", "Calcutta");
  assertBlocked(r2, "insert into scoring_authority.net_skins_v1_recalculation_jobs values ('2026',2,'PENDING');", "Net Skins");
  assert.equal(fingerprint([...invariants, ...setupTables]), beforeInstall, "all failed attempts are inert");

  // An in-flight job owns the existing shared runtime lock. Adoption waits,
  // then sees the committed job rather than bypassing it on an old read.
  const job = spawn(bin.psql, ["-X","-qAt","-v","ON_ERROR_STOP=1","-d",database], { env: environment(cluster) });
  let output = "", errors = "";
  const locked = new Promise((resolve, reject) => {
    job.stdout.on("data", (data) => { output += data; if (output.includes("JOB_LOCK_HELD")) resolve(); });
    job.stderr.on("data", (data) => { errors += data; });
    job.on("error", reject);
    job.on("exit", (code) => { if (!output.includes("JOB_LOCK_HELD")) reject(new Error(errors || String(code))); });
  });
  const jobDone = new Promise((resolve) => job.on("exit", resolve));
  job.stdin.end(`begin; select pg_advisory_xact_lock_shared(731102026031::bigint);
    insert into scoring_authority.odds_calculation_jobs values ('2026','PENDING','NOT_READY');
    select 'JOB_LOCK_HELD'; select pg_sleep(0.5); commit;`);
  await locked;
  const raced = mutate(makeRequest(r2));
  assert.equal(raced.ok, false);
  assert.ok(raced.blockers.includes("ODDS_PUBLICATION_DEPENDENCY"));
  assert.equal(await jobDone, 0, errors);
  sql(cluster, database, "delete from scoring_authority.odds_calculation_jobs;");

  // A terminal rehearsal job and another year's job are not active 2026 work.
  sql(cluster, database, `insert into scoring_authority.odds_calculation_jobs values
    ('2026','SUCCEEDED','REHEARSAL_ONLY'),('2027','PENDING','NOT_READY');`);
  const beforeAllowed = fingerprint(invariants);
  const first = mutate(makeRequest(r2));
  assert.equal(first.ok, true);
  assert.equal(first.revision, 1);
  assert.deepEqual(first.warnings, ["ODDS_PUBLICATION_REVIEW_REQUIRED"]);
  assert.equal(first.snapshotPrepared, false);
  assert.equal(first.scoringMutationCreated, false);
  const retry = mutate(makeRequest(r2));
  assert.equal(retry.idempotent, true);
  assert.equal(retry.revision, 1);
  assert.equal(mutate({ ...makeRequest(r2), course: { ...r2, slope: 139 } }).code,
    "TOURNAMENT_SETUP_IDEMPOTENCY_CONFLICT");
  assert.equal(mutate(makeRequest(r3,0,2)).code, "TOURNAMENT_SETUP_REVISION_STALE");
  const second = mutate(makeRequest(r3,1,2));
  assert.equal(second.ok, true);
  assert.equal(second.revision, 2);
  assert.deepEqual(second.warnings, ["ODDS_PUBLICATION_REVIEW_REQUIRED"]);
  assert.equal(mutate(makeRequest(r3,1,2)).idempotent, true);
  assert.equal(fingerprint(invariants), beforeAllowed, "all domain facts and publication bits unchanged");

  const after = rpc(cluster, database, "read_production_tournament_setup_v1",
    scope("READ_PRODUCTION_TOURNAMENT_SETUP_V1"));
  for (const course of identicalLegacyCourses) {
    const row = after.data.courses.find((item) => item.courseId === course.course_id);
    assert.equal(row.setupManaged, true);
    const result = JSON.parse(sql(cluster, database, `
      select jsonb_build_object(
        'holes',production_control.legacy_course_adoption_holes_v1(jsonb_agg(
          jsonb_build_object('hole_number',hole_number,'par',par,'stroke_index',stroke_index,'yardage',yardage)
          order by hole_number)),
        'fingerprint',encode(extensions.digest(production_control.legacy_course_adoption_holes_v1(jsonb_agg(
          jsonb_build_object('hole_number',hole_number,'par',par,'stroke_index',stroke_index,'yardage',yardage)
          order by hole_number))::text,'sha256'),'hex'))
      from scoring_authority.tournament_setup_course_holes_v1 where course_id='${course.course_id}';`));
    assert.deepEqual(result.holes, course.holes);
    assert.equal(result.fingerprint, course.fingerprint);
    // The unchanged exact inputs produce the same canonical Course Handicap.
    assert.equal(sql(cluster, database, `
      select bool_and((h.tournament_handicap*c.slope/113+(c.rating-c.par)) =
        (h.tournament_handicap*s.slope/113+(s.rating-s.par)))
      from scoring_authority.tournament_setup_course_tees_v1 c
      join scoring_authority.scoring_snapshots s on s.course_id=c.course_id and s.tee=c.tee_id
      cross join scoring_authority.handicap_revision_entries h where c.course_id='${course.course_id}';`), "t");
  }
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select count(*) from production_control.tournament_setup_operation_receipts_v1),
    (select count(*) from production_control.tournament_setup_audit_events_v1),
    (select count(*) from scoring_authority.tournament_setup_match_details_v1 where starting_hole is not null
      or prepared_setup_revision is not null), production_control.tournament_setup_revision_v1('2026'));`), "2|2|0|2");
  const material = mutate(makeRequest({ ...r2, rating: 72.8 }, 2, 3));
  assert.equal(material.ok, false);
  assert.ok(material.blockers.includes("ODDS_PUBLICATION_DEPENDENCY"));
  for (const role of ["anon","authenticated","service_role"]) {
    assert.equal(sql(cluster, database, `select has_function_privilege('${role}',
      'production_control.certify_identical_legacy_course_adoption_v1(text,jsonb)','execute');`), "f");
  }
  for (const overrides of [{ environment: "PREVIEW" }, { tournament_id: "2027" },
    { authorization: { ...scope("").authorization, role: "PARTICIPANT" } }]) {
    assert.throws(() => mutate({ ...makeRequest(r2,2,4), ...overrides }), /FIXTURE_DIRECTOR_SCOPE_REQUIRED/);
  }
  assert.equal(sql(cluster, database, `select bool_and(relrowsecurity) from pg_class
    where oid in ('scoring_authority.tournament_setup_course_tees_v1'::regclass,
      'scoring_authority.tournament_setup_course_holes_v1'::regclass,
      'production_control.tournament_setup_operation_receipts_v1'::regclass);`), "t");
  assert.equal(sql(cluster, database, `select bool_and(prosecdef and proconfig @> array['search_path=pg_catalog'])
    from pg_proc where oid in (
      'production_control.legacy_course_adoption_holes_v1(jsonb)'::regprocedure,
      'production_control.certify_identical_legacy_course_adoption_v1(text,jsonb)'::regprocedure);`), "t");
  sql(cluster, database, "delete from scoring_authority.odds_calculation_jobs;");
  assert.equal(fingerprint(invariants), beforeAdoption);
});
