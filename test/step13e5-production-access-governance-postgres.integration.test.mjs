import assert from "node:assert/strict";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = path.join(
  repositoryRoot,
  "supabase/production_migrations/202608300061_production_access_governance_v1.sql",
);
const pgBin = "/opt/homebrew/opt/postgresql@17/bin";
const bin = Object.fromEntries(
  ["createdb", "initdb", "pg_ctl", "psql"].map((name) => [name, path.join(pgBin, name)]),
);

const scope = Object.freeze({
  contract_version: "production-access-governance-v1",
  environment: "PRODUCTION",
  project_ref: "ymqhhtxaywtqllynrmxe",
  project_url: "https://ymqhhtxaywtqllynrmxe.supabase.co",
  source_workbook_id: "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4",
  tournament_id: "2026",
});
const ownerActor = Object.freeze({
  playerId: "CB01",
  authUserId: "00000000-0000-4000-8000-000000000001",
});
const ownerEntitlementId = "10000000-0000-4000-8000-000000000001";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
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

function pgEnv(cluster, { databaseOwner = false, ...extras } = {}) {
  return {
    ...process.env,
    PGHOST: cluster.socket,
    PGPORT: String(cluster.port),
    PGUSER: "postgres",
    PGOPTIONS: databaseOwner ? "" : "-c request.jwt.claim.role=service_role",
    ...extras,
  };
}

function sql(cluster, database, input, options = {}) {
  return run(bin.psql, ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", database], {
    env: pgEnv(cluster, options),
    input,
  });
}

function sqlFile(cluster, database, filename) {
  return run(bin.psql, ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", database, "-f", filename], {
    env: pgEnv(cluster),
  });
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function jsonSql(value) {
  return `${sqlLiteral(JSON.stringify(value))}::jsonb`;
}

function parseJson(output) {
  const candidate = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1);
  assert.ok(candidate, `Expected JSON output, received:\n${output}`);
  return JSON.parse(candidate);
}

function rpc(cluster, database, name, input, options = {}) {
  assert.match(name, /^[a-z][a-z0-9_]+$/);
  return parseJson(sql(
    cluster,
    database,
    `select public.${name}(${jsonSql(input)})::text;`,
    options,
  ));
}

function mutation({
  action,
  expectedRevision,
  requestId,
  hashCharacter,
  actor = ownerActor,
  ...payload
}) {
  return {
    ...scope,
    action,
    expected_revision: expectedRevision,
    operation_request_id: requestId,
    request_payload_hash: hashCharacter.repeat(64),
    actor_player_id: actor.playerId,
    actor_auth_user_id: actor.authUserId,
    authorization: {
      tournament_id: "2026",
      player_id: actor.playerId,
      auth_user_id: actor.authUserId,
      role: "DIRECTOR",
    },
    ...payload,
  };
}

async function available() {
  try {
    await Promise.all(Object.values(bin).map((value) => access(value, fsConstants.X_OK)));
    return true;
  } catch {
    return false;
  }
}

async function createCluster() {
  // Keep the Unix socket path below PostgreSQL's 103-byte macOS limit even
  // when TMPDIR is the long per-user /var/folders path.
  const root = await mkdtemp(path.join("/tmp", "bagger-gov-pg-"));
  const data = path.join(root, "data");
  const socket = path.join(root, "socket");
  const log = path.join(root, "postgres.log");
  await mkdir(socket, { mode: 0o700 });
  run(bin.initdb, [
    "-D", data,
    "--username=postgres",
    "--auth=trust",
    "--no-locale",
    "--encoding=UTF8",
  ]);
  run(bin.pg_ctl, [
    "-D", data,
    "-l", log,
    "-o", `-F -k ${socket} -h '' -p 5432`,
    "-w",
    "start",
  ]);
  return { root, data, socket, log, port: 5432, started: true };
}

async function destroyCluster(cluster) {
  if (cluster.started) {
    run(bin.pg_ctl, ["-D", cluster.data, "-m", "fast", "-w", "stop"]);
    cluster.started = false;
  }
  assert.equal(path.dirname(cluster.root), "/tmp");
  assert.match(path.basename(cluster.root), /^bagger-gov-pg-/);
  await rm(cluster.root, { recursive: true, force: true });
}

function installFixture(cluster, database) {
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

    create table auth.users (
      id uuid primary key,
      email text,
      email_confirmed_at timestamptz,
      phone text,
      phone_confirmed_at timestamptz,
      raw_app_meta_data jsonb not null default '{}'::jsonb
    );
    create table scoring_authority.tournaments (
      tournament_id text primary key,
      tournament_year integer not null,
      name text not null
    );
    create table scoring_authority.players (
      player_id text primary key,
      display_name text not null,
      source_payload jsonb not null default '{}'::jsonb
    );
    create table production_control.fixture_player_editorial_projection (
      payload jsonb not null,
      source_fingerprint text not null,
      payload_fingerprint text not null,
      revision_id uuid not null,
      revision_number bigint not null
    );
    create table scoring_authority.teams (
      tournament_id text not null,
      team_id text not null,
      team_side integer not null,
      name text not null,
      primary key (tournament_id, team_id)
    );
    create table scoring_authority.tournament_players (
      tournament_id text not null,
      player_id text not null,
      team_id text not null,
      team_side integer not null,
      participation_status text not null,
      source_roster_key text not null,
      updated_at timestamptz not null default now(),
      primary key (tournament_id, player_id)
    );
    create table scoring_authority.matches (
      match_id text primary key,
      tournament_id text not null,
      status text not null,
      scored_holes integer not null default 0,
      current_hole integer not null default 0,
      scorecard_complete boolean not null default false,
      finalized_at timestamptz,
      unresolved_mutations integer not null default 0
    );
    create table scoring_authority.match_participants (
      match_id text not null,
      player_id text not null,
      primary key (match_id, player_id)
    );
    create table scoring_authority.hole_scores (
      score_id bigint generated always as identity primary key,
      match_id text not null
    );
    create table scoring_authority.score_mutations (
      mutation_id bigint generated always as identity primary key,
      match_id text not null
    );
    create table scoring_authority.finalized_scorecard_snapshots (
      snapshot_id uuid primary key default extensions.gen_random_uuid(),
      match_id text not null,
      state text not null
    );
    create table scoring_authority.scoring_ingress_leases (
      lease_id uuid primary key default extensions.gen_random_uuid(),
      tournament_id text not null,
      match_id text not null,
      expires_at timestamptz not null
    );
    create table scoring_authority.scoring_snapshots (
      snapshot_id uuid primary key default extensions.gen_random_uuid(),
      match_id text not null
    );
    create table scoring_authority.completed_history_match_participants (
      appearance_id bigint generated always as identity primary key,
      match_id text not null,
      player_id text not null
    );
    create table scoring_authority.draft_current_revisions (
      tournament_id text primary key,
      revision_id uuid not null
    );
    create table scoring_authority.draft_pick_facts (
      revision_id uuid not null,
      tournament_id text not null,
      player_id text not null,
      pick_status text not null
    );
    create table scoring_authority.net_skins_v1_configuration_revisions (
      configuration_revision_id uuid primary key,
      configuration_manifest jsonb not null
    );
    create table scoring_authority.net_skins_v1_configuration_current (
      tournament_id text primary key,
      configuration_revision_id uuid not null,
      state text not null
    );
    create table scoring_authority.calcutta_v1_auction_fact_revisions (
      auction_revision_id uuid primary key,
      auction_manifest jsonb not null
    );
    create table scoring_authority.calcutta_v1_current (
      tournament_id text primary key,
      auction_revision integer not null default 0,
      auction_revision_id uuid
    );
    create table scoring_authority.odds_published_snapshots (
      id uuid primary key,
      published_payload jsonb not null
    );
    create table scoring_authority.odds_publication_current (
      tournament_id text primary key,
      current_snapshot_id uuid,
      publication_state text not null
    );
    create table scoring_authority.handicap_revision_current (
      tournament_id text primary key,
      revision_id uuid not null
    );
    create table scoring_authority.handicap_revision_entries (
      revision_id uuid not null,
      tournament_id text not null,
      player_id text not null,
      tournament_handicap numeric(8,3) not null,
      primary key (revision_id, player_id)
    );

    create table participant_identity.user_player_links (
      link_id uuid primary key default extensions.gen_random_uuid(),
      auth_user_id uuid not null unique,
      player_id text not null,
      status text not null,
      link_revision bigint not null default 1,
      revoked_at timestamptz
    );
    create table participant_identity.participant_auth_identifiers (
      identifier_id uuid primary key default extensions.gen_random_uuid(),
      player_id text not null,
      auth_user_id uuid not null,
      identifier_type text not null,
      normalized_value_private text not null,
      status text not null,
      verified_at timestamptz
    );
    create table participant_identity.tournament_roles (
      tournament_id text not null,
      auth_user_id uuid not null,
      role text not null,
      role_active boolean not null default true,
      role_revision bigint not null default 1,
      granted_at timestamptz not null default now(),
      granted_by text not null,
      revoked_at timestamptz,
      revoked_by text,
      updated_at timestamptz not null default now(),
      primary key (tournament_id, auth_user_id, role)
    );
    create table production_control.director_entitlements (
      entitlement_id uuid primary key default extensions.gen_random_uuid(),
      auth_user_id uuid not null,
      tournament_id text not null,
      player_id text,
      role text not null,
      status text not null,
      granted_by text not null,
      granted_at timestamptz not null default now(),
      revoked_at timestamptz,
      unique (auth_user_id, tournament_id)
    );
    create table production_control.director_entitlement_events (
      event_id bigserial primary key,
      entitlement_id uuid not null,
      action text not null,
      actor text not null,
      reason text not null,
      occurred_at timestamptz not null default now()
    );
    create table production_control.authority_sentinel (
      scoring text not null,
      reads text not null,
      identity text not null,
      odds text not null,
      maintenance text not null,
      ingress text not null,
      workers boolean not null
    );

    create function production_control.assert_exact_cutover_resource_scope(
      input jsonb, ignored boolean
    ) returns void language plpgsql as $fixture$
    begin
      if input->>'environment' is distinct from 'PRODUCTION'
         or input->>'project_ref' is distinct from 'ymqhhtxaywtqllynrmxe'
         or input->>'project_url' is distinct from
           'https://ymqhhtxaywtqllynrmxe.supabase.co'
         or input->>'source_workbook_id' is distinct from
           '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
         or input->>'tournament_id' is distinct from '2026' then
        raise exception 'PRODUCTION_RESOURCE_ASSERTION_FAILED';
      end if;
    end
    $fixture$;
    create function production_control.read_projection(
      input jsonb,
      expected_domain text,
      expected_contract text,
      expected_tabs jsonb
    ) returns jsonb language plpgsql stable security definer
    set search_path = pg_catalog, production_control
    as $fixture$
    declare
      fixture production_control.fixture_player_editorial_projection%rowtype;
    begin
      if expected_domain is distinct from 'PLAYER_EDITORIAL'
         or expected_contract is distinct from 'player-public-profile-v1'
         or expected_tabs is distinct from '["Players"]'::jsonb then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'code', 'FIXTURE_PROJECTION_SCOPE_INVALID'
        );
      end if;
      select * into strict fixture
      from production_control.fixture_player_editorial_projection;
      return pg_catalog.jsonb_build_object(
        'ok', true,
        'data', pg_catalog.jsonb_build_object(
          'domain', expected_domain,
          'tournament_id', '2026',
          'tournament_year', 2026,
          'revision_id', fixture.revision_id,
          'revision_number', fixture.revision_number,
          'source_workbook_id',
            '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4',
          'source_tabs', expected_tabs,
          'contract_version', expected_contract,
          'source_fingerprint', fixture.source_fingerprint,
          'payload_fingerprint', fixture.payload_fingerprint,
          'validation_status', 'VALID',
          'validation_diagnostics', '{"fixture":true}'::jsonb,
          'payload', fixture.payload,
          'imported_by', 'fixture',
          'imported_at', '2026-08-29T12:00:00Z',
          'google_foreground_requests', 0,
          'fallback_used', false,
          'authoritative', false,
          'shadow_only', true
        )
      );
    end
    $fixture$;
    create function production_control.assert_production_handicap_runtime()
    returns void language plpgsql as $fixture$
    begin
      if not exists (
        select 1 from production_control.authority_sentinel
        where scoring = 'SUPABASE' and reads = 'SUPABASE'
          and identity = 'SUPABASE' and odds = 'SUPABASE'
          and maintenance = 'NORMAL' and ingress = 'OPEN' and workers
      ) then
        raise exception 'PRODUCTION_HANDICAP_RUNTIME_NOT_SAFE';
      end if;
    end
    $fixture$;
    create function production_control.assert_player_access_runtime_v1(input jsonb)
    returns void language plpgsql security definer
    set search_path = pg_catalog, production_control, participant_identity,
      scoring_authority, auth
    as $fixture$
    declare
      actor text := pg_catalog.upper(pg_catalog.btrim(coalesce(
        input#>>'{authorization,player_id}', ''
      )));
      actor_auth uuid := nullif(input#>>'{authorization,auth_user_id}', '')::uuid;
    begin
      perform production_control.assert_exact_cutover_resource_scope(input, false);
      perform production_control.assert_production_handicap_runtime();
      if input->>'contract_version' is distinct from 'production-players-access-v1'
         or input#>>'{authorization,tournament_id}' is distinct from '2026'
         or input#>>'{authorization,role}' is distinct from 'DIRECTOR'
         or actor = '' or actor_auth is null then
        raise exception 'PRODUCTION_DIRECTOR_AUTHORIZATION_REQUIRED';
      end if;
      if not exists (
        select 1
        from participant_identity.user_player_links link
        join auth.users auth_user on auth_user.id = link.auth_user_id
        join participant_identity.participant_auth_identifiers identifier
          on identifier.auth_user_id = link.auth_user_id
         and identifier.player_id = link.player_id
         and identifier.status = 'VERIFIED'
        join participant_identity.tournament_roles tournament_role
          on tournament_role.tournament_id = '2026'
         and tournament_role.auth_user_id = link.auth_user_id
         and tournament_role.role = 'DIRECTOR'
         and tournament_role.role_active
         and tournament_role.revoked_at is null
        join scoring_authority.tournament_players membership
          on membership.tournament_id = '2026'
         and membership.player_id = link.player_id
         and membership.participation_status = 'ACTIVE'
        join production_control.director_entitlements entitlement
          on entitlement.auth_user_id = link.auth_user_id
         and entitlement.tournament_id = '2026'
         and entitlement.player_id = link.player_id
         and entitlement.role in ('DIRECTOR', 'OWNER')
         and entitlement.status = 'ACTIVE'
         and entitlement.revoked_at is null
        where link.auth_user_id = actor_auth
          and link.player_id = actor
          and link.status = 'ACTIVE'
          and link.revoked_at is null
          and (auth_user.email_confirmed_at is not null
            or auth_user.phone_confirmed_at is not null)
      ) then
        raise exception 'PRODUCTION_DIRECTOR_AUTHORIZATION_REQUIRED';
      end if;
    end
    $fixture$;
    create function production_control.director_private_audit_v1()
    returns jsonb language sql stable as $fixture$
      select jsonb_build_array(jsonb_build_object(
        'occurred_at', now(),
        'category', 'SYSTEM',
        'action', 'FIXTURE_READY',
        'title', 'Private operations fixture ready',
        'summary', 'The pre-existing private audit projection remains present.',
        'status', 'SUCCESS',
        'actor', jsonb_build_object('display_name', 'Fixture Director'),
        'context', jsonb_build_object('tournament_id', '2026')
      ))
    $fixture$;
    create function production_control.director_private_calcutta_v1()
    returns jsonb language sql stable as $fixture$ select '{}'::jsonb $fixture$;
    create function production_control.director_private_net_skins_v1()
    returns jsonb language sql stable as $fixture$ select '{}'::jsonb $fixture$;
    create function production_control.assert_production_service_role()
    returns void language plpgsql stable as $fixture$ begin return; end $fixture$;
    create function production_control.assert_production_cutover_read_scope(
      input jsonb, required_phase text
    ) returns void language plpgsql stable as $fixture$ begin return; end $fixture$;
    create function production_control.assert_production_scoring_actor(
      input jsonb, require_director boolean
    ) returns void language plpgsql stable as $fixture$ begin return; end $fixture$;

    insert into production_control.authority_sentinel values
      ('SUPABASE', 'SUPABASE', 'SUPABASE', 'SUPABASE', 'NORMAL', 'OPEN', true);
    insert into scoring_authority.tournaments values
      ('2026', 2026, 'Sandbagger Invitational');
    insert into scoring_authority.teams values
      ('2026', 'USA', 1, 'Team USA'),
      ('2026', 'EUR', 2, 'Team Europe');
    insert into scoring_authority.players(player_id, display_name, source_payload) values
      ('BL01', 'Blocked Player', '{"First":"Blocked","Last":"Player","Slug":"blocked-player","Active":"TRUE"}'),
      ('CB01', 'Tournament Director', '{"First":"Tournament","Last":"Director","Slug":"tournament-director","Active":"TRUE"}'),
      ('GR01', 'Grant Recipient', '{"First":"Grant","Last":"Recipient","Slug":"grant-recipient","Active":"TRUE"}'),
      ('HP01', 'Historical Player', '{"First":"Historical","Last":"Player","Slug":"historical-player","Active":"TRUE","Legacy Marker":"preserve-me"}'),
      ('JD01', 'John Drake', '{"First":"John","Last":"Drake","Slug":"john-drake","Active":"TRUE"}'),
      ('JD03', 'Julia Dane', '{"First":"Julia","Last":"Dane","Slug":"julia-dane","Active":"TRUE"}'),
      ('MB01', 'Membership Blocked', '{"First":"Membership","Last":"Blocked","Slug":"membership-blocked","Active":"TRUE"}'),
      ('OP01', 'Protected Owner', '{"First":"Protected","Last":"Owner","Slug":"protected-owner","Active":"TRUE"}'),
      ('SL01', 'Existing Slug', '{"First":"Existing","Last":"Slug","Slug":"existing-slug","Active":"TRUE"}'),
      ('WD01', 'Withdraw Player', '{"First":"Withdraw","Last":"Player","Slug":"withdraw-player","Active":"TRUE"}');
    insert into production_control.fixture_player_editorial_projection(
      payload, source_fingerprint, payload_fingerprint, revision_id,
      revision_number
    )
    select pg_catalog.jsonb_build_object(
      'players', pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'player_id', player.player_id,
        'public_profile', player.source_payload || pg_catalog.jsonb_build_object(
          'Player ID', player.player_id,
          'Display Name', player.display_name,
          'Active', pg_catalog.upper(coalesce(
            player.source_payload->>'Active', 'TRUE'
          )) in ('TRUE', 'YES', '1', 'ACTIVE')
        )
      ) order by player.player_id)
    ), pg_catalog.repeat('a', 64), pg_catalog.repeat('b', 64),
      '90000000-0000-4000-8000-000000000001', 7
    from scoring_authority.players player;
    insert into scoring_authority.tournament_players (
      tournament_id, player_id, team_id, team_side, participation_status,
      source_roster_key
    ) values
      ('2026','BL01','EUR',2,'ACTIVE','roster:BL01'),
      ('2026','CB01','USA',1,'ACTIVE','roster:CB01'),
      ('2026','GR01','EUR',2,'ACTIVE','roster:GR01'),
      ('2026','MB01','USA',1,'ACTIVE','roster:MB01'),
      ('2026','OP01','EUR',2,'ACTIVE','roster:OP01'),
      ('2026','WD01','USA',1,'ACTIVE','roster:WD01');

    insert into auth.users values
      ('00000000-0000-4000-8000-000000000001','director@private.test',now(),null,null,'{}'),
      ('00000000-0000-4000-8000-000000000002','history@private.test',now(),null,null,'{}'),
      ('00000000-0000-4000-8000-000000000003','grant@private.test',now(),null,null,'{}'),
      ('00000000-0000-4000-8000-000000000004','owner@private.test',now(),null,null,'{}'),
      ('00000000-0000-4000-8000-000000000005','withdraw@private.test',now(),null,null,'{}'),
      ('00000000-0000-4000-8000-000000000006','historical-grant@private.test',now(),null,null,'{}');
    insert into participant_identity.user_player_links (
      auth_user_id, player_id, status, link_revision
    ) values
      ('00000000-0000-4000-8000-000000000001','CB01','ACTIVE',1),
      ('00000000-0000-4000-8000-000000000002','HP01','ACTIVE',1),
      ('00000000-0000-4000-8000-000000000003','GR01','ACTIVE',1),
      ('00000000-0000-4000-8000-000000000004','OP01','ACTIVE',1),
      ('00000000-0000-4000-8000-000000000005','WD01','ACTIVE',1);
    insert into participant_identity.user_player_links (
      auth_user_id, player_id, status, link_revision, revoked_at
    ) values (
      '00000000-0000-4000-8000-000000000006','GR01','REVOKED',1,now()
    );
    insert into participant_identity.participant_auth_identifiers (
      player_id, auth_user_id, identifier_type, normalized_value_private,
      status, verified_at
    ) values
      ('CB01','00000000-0000-4000-8000-000000000001','EMAIL','director@private.test','VERIFIED',now()),
      ('HP01','00000000-0000-4000-8000-000000000002','EMAIL','history@private.test','VERIFIED',now()),
      ('GR01','00000000-0000-4000-8000-000000000003','EMAIL','grant@private.test','VERIFIED',now()),
      ('OP01','00000000-0000-4000-8000-000000000004','EMAIL','owner@private.test','VERIFIED',now()),
      ('WD01','00000000-0000-4000-8000-000000000005','EMAIL','withdraw@private.test','VERIFIED',now());
    insert into participant_identity.tournament_roles (
      tournament_id, auth_user_id, role, role_active, granted_by
    ) values
      ('2026','00000000-0000-4000-8000-000000000001','DIRECTOR',true,'fixture'),
      ('2026','00000000-0000-4000-8000-000000000001','PARTICIPANT',true,'fixture'),
      ('2026','00000000-0000-4000-8000-000000000003','PARTICIPANT',true,'fixture'),
      ('2026','00000000-0000-4000-8000-000000000004','PARTICIPANT',true,'fixture'),
      ('2026','00000000-0000-4000-8000-000000000005','PARTICIPANT',true,'fixture');
    insert into production_control.director_entitlements (
      entitlement_id, auth_user_id, tournament_id, player_id, role, status,
      granted_by, granted_at, revoked_at
    ) values (
      '${ownerEntitlementId}','00000000-0000-4000-8000-000000000001',
      '2026','CB01','DIRECTOR','ACTIVE','fixture',now(),null
    ), (
      '10000000-0000-4000-8000-000000000006',
      '00000000-0000-4000-8000-000000000006',
      '2026','GR01','DIRECTOR','REVOKED','fixture',now(),now()
    );
    insert into production_control.director_entitlement_events (
      event_id, entitlement_id, action, actor, reason
    ) values (10, '${ownerEntitlementId}', 'GRANTED', 'fixture', 'Certified fixture grant');

    insert into scoring_authority.matches values
      ('M-UPCOMING','2026','UPCOMING',0,0,false,null,0),
      ('M-LIVE','2026','LIVE',0,1,false,null,0),
      ('M-SCORED','2026','UPCOMING',1,1,false,null,0),
      ('M-FINAL','2026','FINAL',18,18,true,now(),0);
    insert into scoring_authority.match_participants values
      ('M-UPCOMING','WD01'),
      ('M-LIVE','BL01'),
      ('M-SCORED','BL01'),
      ('M-FINAL','BL01');
    insert into scoring_authority.hole_scores(match_id) values ('M-SCORED');
    insert into scoring_authority.score_mutations(match_id) values ('M-SCORED');
    insert into scoring_authority.finalized_scorecard_snapshots(match_id, state)
      values ('M-FINAL','CURRENT');
    insert into scoring_authority.scoring_snapshots(match_id) values ('M-FINAL');
    insert into scoring_authority.completed_history_match_participants(match_id, player_id)
      values ('H-2025-1','HP01'), ('H-2025-2','WD01');
    insert into scoring_authority.draft_current_revisions values
      ('2026','20000000-0000-4000-8000-000000000001');
    insert into scoring_authority.draft_pick_facts values
      ('20000000-0000-4000-8000-000000000001','2026','WD01','SELECTED');
    insert into scoring_authority.handicap_revision_current values
      ('2026','30000000-0000-4000-8000-000000000001');
    insert into scoring_authority.handicap_revision_entries values
      ('30000000-0000-4000-8000-000000000001','2026','BL01',8.125),
      ('30000000-0000-4000-8000-000000000001','2026','CB01',4.500),
      ('30000000-0000-4000-8000-000000000001','2026','GR01',10.250),
      ('30000000-0000-4000-8000-000000000001','2026','MB01',11.000),
      ('30000000-0000-4000-8000-000000000001','2026','OP01',7.750),
      ('30000000-0000-4000-8000-000000000001','2026','WD01',9.375);
  `);
}

test("migration 061 enforces bounded Production access governance on PostgreSQL 17", async (context) => {
  if (!(await available())) {
    context.skip("PostgreSQL 17 binaries unavailable");
    return;
  }
  const cluster = await createCluster();
  try {
    const database = "production_access_governance_061";
    run(bin.createdb, [database], { env: pgEnv(cluster, { databaseOwner: true }) });
    installFixture(cluster, database);

    const before = parseJson(sql(cluster, database, `
      select jsonb_build_object(
        'players', (select count(*) from scoring_authority.players),
        'memberships', (select count(*) from scoring_authority.tournament_players),
        'authUsers', (select count(*) from auth.users),
        'links', (select count(*) from participant_identity.user_player_links),
        'entitlements', (select count(*) from production_control.director_entitlements),
        'sentinel', (select to_jsonb(value) from production_control.authority_sentinel value)
      )::text;
    `));
    sqlFile(cluster, database, migration);
    const afterInstall = parseJson(sql(cluster, database, `
      select jsonb_build_object(
        'players', (select count(*) from scoring_authority.players),
        'memberships', (select count(*) from scoring_authority.tournament_players),
        'authUsers', (select count(*) from auth.users),
        'links', (select count(*) from participant_identity.user_player_links),
        'entitlements', (select count(*) from production_control.director_entitlements),
        'sentinel', (select to_jsonb(value) from production_control.authority_sentinel value)
      )::text;
    `));
    assert.deepEqual(afterInstall, before, "installation must not mutate canonical Production facts");
    assert.deepEqual(parseJson(sql(cluster, database, `
      select jsonb_build_object(
        'profiles', (select count(*) from production_control.player_governance_profiles_v1),
        'owners', (select count(*) from production_control.tournament_owner_capabilities_v1),
        'context', (select count(*) from production_control.access_governance_context_v1),
        'membershipRevisions', (select count(*) from production_control.access_governance_membership_revisions_v1),
        'receipts', (select count(*) from production_control.access_governance_operation_receipts_v1),
        'audit', (select count(*) from production_control.access_governance_audit_events_v1)
      )::text;
    `)), {
      profiles: 0,
      owners: 0,
      context: 0,
      membershipRevisions: 0,
      receipts: 0,
      audit: 0,
    });

    const privileges = parseJson(sql(cluster, database, `
      select jsonb_build_object(
        'anonRead', has_function_privilege('anon',
          'public.read_production_access_governance_v1(jsonb)', 'execute'),
        'authenticatedRead', has_function_privilege('authenticated',
          'public.read_production_access_governance_v1(jsonb)', 'execute'),
        'serviceRead', has_function_privilege('service_role',
          'public.read_production_access_governance_v1(jsonb)', 'execute'),
        'serviceMutate', has_function_privilege('service_role',
          'public.mutate_production_access_governance_v1(jsonb)', 'execute'),
        'anonEditorial', has_function_privilege('anon',
          'public.read_production_player_editorial(jsonb)', 'execute'),
        'authenticatedEditorial', has_function_privilege('authenticated',
          'public.read_production_player_editorial(jsonb)', 'execute'),
        'serviceEditorial', has_function_privilege('service_role',
          'public.read_production_player_editorial(jsonb)', 'execute'),
        'serviceAdopt', has_function_privilege('service_role',
          'public.adopt_initial_production_owner_v1(jsonb)', 'execute')
      )::text;
    `));
    assert.deepEqual(privileges, {
      anonRead: false,
      authenticatedRead: false,
      serviceRead: true,
      serviceMutate: true,
      anonEditorial: false,
      authenticatedEditorial: false,
      serviceEditorial: true,
      serviceAdopt: false,
    });
    assert.equal(sql(cluster, database, `
      select bool_and(class_value.relrowsecurity)::text
      from pg_catalog.pg_class class_value
      join pg_catalog.pg_namespace namespace_value
        on namespace_value.oid = class_value.relnamespace
      where namespace_value.nspname = 'production_control'
        and class_value.relkind = 'r'
        and class_value.relname like '%governance%v1';
    `), "true");

    const initialReadInput = {
      ...scope,
      operation: "READ_PRODUCTION_ACCESS_GOVERNANCE_V1",
      actor_player_id: ownerActor.playerId,
      actor_auth_user_id: ownerActor.authUserId,
      authorization: {
        tournament_id: "2026",
        player_id: ownerActor.playerId,
        auth_user_id: ownerActor.authUserId,
        role: "DIRECTOR",
      },
    };
    const initialRead = rpc(cluster, database, "read_production_access_governance_v1", initialReadInput);
    assert.equal(initialRead.ok, true);
    assert.equal(initialRead.revision, 0);
    assert.equal(initialRead.ownerAdoptionRequired, true);
    assert.equal(initialRead.actor.owner, false);
    const initialActor = initialRead.players.find((value) => value.playerId === "CB01");
    assert.equal(initialActor.governance.canGrant, false);
    assert.ok(initialActor.governance.blockers.includes("OWNER_REQUIRED"));
    assert.ok(initialActor.governance.blockers.includes("SELF_REVOKE_PROTECTED"));
    assert.ok(initialActor.governance.blockers.includes("FINAL_ADMIN_PROTECTED"));

    const editorialReadInput = {
      ...scope,
      domain: "PLAYER_EDITORIAL",
      tournament_year: 2026,
      contract_version: "player-public-profile-v1",
      source_tabs: ["Players"],
    };
    const initialEditorial = rpc(
      cluster,
      database,
      "read_production_player_editorial",
      editorialReadInput,
    );
    assert.equal(initialEditorial.ok, true);
    assert.equal(initialEditorial.data.payload.players.length, 10);
    assert.equal(
      initialEditorial.data.payload.players.find((value) => value.player_id === "HP01")
        .public_profile.Active,
      true,
    );
    assert.equal(initialEditorial.data.source_fingerprint, "a".repeat(64));
    assert.equal(initialEditorial.data.payload_fingerprint, "b".repeat(64));
    const storedEditorialProjection = sql(cluster, database, `
      select payload::text
      from production_control.fixture_player_editorial_projection;
    `);

    const createInput = mutation({
      action: "CREATE_PLAYER",
      expectedRevision: 0,
      requestId: "40000000-0000-4000-8000-000000000001",
      hashCharacter: "a",
      first_name: "Jane",
      last_name: "Doe",
      display_name: "Jane Doe",
      slug: "jane-doe",
      global_status: "ACTIVE",
    });
    const created = rpc(cluster, database, "mutate_production_access_governance_v1", createInput);
    assert.equal(created.ok, true);
    assert.equal(created.playerId, "JD04", "the max JD two-digit ordinal advances deterministically");
    assert.match(created.playerId, /^JD[0-9]{2}$/);
    assert.equal(created.revision, 1);
    assert.equal(created.profileRevision, 1);
    assert.equal(created.membershipCreated, false);
    assert.equal(created.teamChanged, false);
    assert.equal(created.authUserCreated, false);
    assert.deepEqual(parseJson(sql(cluster, database, `
      select jsonb_build_object(
        'membership', (select count(*) from scoring_authority.tournament_players where player_id = 'JD04'),
        'handicap', (select count(*) from scoring_authority.handicap_revision_entries where player_id = 'JD04'),
        'authLink', (select count(*) from participant_identity.user_player_links where player_id = 'JD04'),
        'director', (select count(*) from production_control.director_entitlements where player_id = 'JD04')
      )::text;
    `)), { membership: 0, handicap: 0, authLink: 0, director: 0 });
    const editorialAfterCreate = rpc(
      cluster,
      database,
      "read_production_player_editorial",
      editorialReadInput,
    );
    assert.equal(editorialAfterCreate.data.payload.players.length, 10);
    assert.equal(
      editorialAfterCreate.data.payload.players.some(
        (value) => value.player_id === "JD04",
      ),
      false,
      "a global-only Player is not injected into the exact historical editorial projection",
    );

    const createRetry = rpc(cluster, database, "mutate_production_access_governance_v1", createInput);
    assert.equal(createRetry.idempotent, true);
    assert.equal(createRetry.playerId, "JD04");
    assert.equal(createRetry.revision, 1);
    const conflictingRetry = rpc(cluster, database, "mutate_production_access_governance_v1", {
      ...createInput,
      display_name: "Janet Doe",
      request_payload_hash: "b".repeat(64),
    });
    assert.equal(conflictingRetry.code, "ACCESS_GOVERNANCE_IDEMPOTENCY_CONFLICT");

    const duplicateIdentity = rpc(cluster, database, "mutate_production_access_governance_v1", mutation({
      action: "CREATE_PLAYER",
      expectedRevision: 1,
      requestId: "40000000-0000-4000-8000-000000000002",
      hashCharacter: "c",
      first_name: "Jane",
      last_name: "Doe",
      display_name: " jane doe ",
      slug: "jane-doe-copy",
      global_status: "ACTIVE",
    }));
    assert.equal(duplicateIdentity.code, "ACCESS_GOVERNANCE_PLAYER_IDENTITY_COLLISION");
    const slugCollision = rpc(cluster, database, "mutate_production_access_governance_v1", mutation({
      action: "CREATE_PLAYER",
      expectedRevision: 1,
      requestId: "40000000-0000-4000-8000-000000000003",
      hashCharacter: "d",
      first_name: "Janet",
      last_name: "Different",
      display_name: "Janet Different",
      slug: "jane-doe",
      global_status: "ACTIVE",
    }));
    assert.equal(slugCollision.code, "ACCESS_GOVERNANCE_PLAYER_SLUG_COLLISION");
    const invalidIdPrefix = rpc(cluster, database, "mutate_production_access_governance_v1", mutation({
      action: "CREATE_PLAYER",
      expectedRevision: 1,
      requestId: "40000000-0000-4000-8000-000000000018",
      hashCharacter: "e",
      first_name: "7",
      last_name: "Invalid",
      display_name: "7 Invalid",
      slug: "seven-invalid",
      global_status: "ACTIVE",
    }));
    assert.equal(invalidIdPrefix.code, "ACCESS_GOVERNANCE_PLAYER_INPUT_INVALID");
    assert.equal(sql(cluster, database, `select count(*) from scoring_authority.players where player_id = 'JD04';`), "1");

    const historicalSource = sql(cluster, database, `
      select source_payload::text from scoring_authority.players where player_id = 'HP01';
    `);
    const alumni = rpc(cluster, database, "mutate_production_access_governance_v1", mutation({
      action: "SET_GLOBAL_STATUS",
      expectedRevision: 1,
      requestId: "40000000-0000-4000-8000-000000000004",
      hashCharacter: "e",
      player_id: "HP01",
      global_status: "ALUMNI",
      expected_profile_revision: 0,
    }));
    assert.equal(alumni.ok, true);
    assert.equal(alumni.revision, 2);
    assert.equal(alumni.profileRevision, 1);
    assert.equal(sql(cluster, database, `select production_control.access_governance_global_status_v1('HP01');`), "ALUMNI");
    assert.equal(sql(cluster, database, `select source_payload::text from scoring_authority.players where player_id = 'HP01';`), historicalSource);
    assert.equal(sql(cluster, database, `select count(*) from scoring_authority.completed_history_match_participants where player_id = 'HP01';`), "1");
    assert.equal(sql(cluster, database, `select status from participant_identity.user_player_links where player_id = 'HP01';`), "ACTIVE");
    const alumniEditorial = rpc(
      cluster,
      database,
      "read_production_player_editorial",
      editorialReadInput,
    );
    const alumniPublicProfile = alumniEditorial.data.payload.players.find(
      (value) => value.player_id === "HP01",
    ).public_profile;
    assert.equal(alumniPublicProfile.Active, false);
    assert.equal(alumniPublicProfile["Legacy Marker"], "preserve-me");
    assert.equal(alumniEditorial.data.payload.players.length, 10);
    assert.equal(alumniEditorial.data.source_fingerprint, "a".repeat(64));
    assert.equal(alumniEditorial.data.payload_fingerprint, "b".repeat(64));
    assert.equal(sql(cluster, database, `
      select payload::text
      from production_control.fixture_player_editorial_projection;
    `), storedEditorialProjection, "the source projection must remain immutable");
    assert.equal(sql(cluster, database, `
      select payload#>>'{players,3,public_profile,Active}'
      from production_control.fixture_player_editorial_projection;
    `), "true", "the read-time overlay must not rewrite stored Active");

    const activeAgain = rpc(cluster, database, "mutate_production_access_governance_v1", mutation({
      action: "SET_GLOBAL_STATUS",
      expectedRevision: 2,
      requestId: "40000000-0000-4000-8000-000000000005",
      hashCharacter: "f",
      player_id: "HP01",
      global_status: "ACTIVE",
      expected_profile_revision: 1,
    }));
    assert.equal(activeAgain.ok, true);
    assert.equal(activeAgain.revision, 3);
    assert.equal(activeAgain.profileRevision, 2);
    assert.equal(sql(cluster, database, `select count(*) from scoring_authority.completed_history_match_participants where player_id = 'HP01';`), "1");
    const activeEditorial = rpc(
      cluster,
      database,
      "read_production_player_editorial",
      editorialReadInput,
    );
    assert.equal(
      activeEditorial.data.payload.players.find((value) => value.player_id === "HP01")
        .public_profile.Active,
      true,
    );

    const membershipBlocksAlumni = rpc(cluster, database, "mutate_production_access_governance_v1", mutation({
      action: "SET_GLOBAL_STATUS",
      expectedRevision: 3,
      requestId: "40000000-0000-4000-8000-000000000006",
      hashCharacter: "1",
      player_id: "MB01",
      global_status: "ALUMNI",
      expected_profile_revision: 0,
    }));
    assert.equal(membershipBlocksAlumni.code, "ACCESS_GOVERNANCE_ACTIVE_MEMBERSHIP_BLOCKS_ALUMNI");
    assert.equal(sql(cluster, database, `select participation_status from scoring_authority.tournament_players where player_id = 'MB01';`), "ACTIVE");

    const boundedBeforeMembership = parseJson(sql(cluster, database, `
      select jsonb_build_object(
        'team', (select team_id || ':' || team_side || ':' || source_roster_key from scoring_authority.tournament_players where player_id = 'WD01'),
        'handicap', (select tournament_handicap::text from scoring_authority.handicap_revision_entries where player_id = 'WD01'),
        'authUsers', (select count(*) from auth.users),
        'links', (select count(*) from participant_identity.user_player_links),
        'identifiers', (select count(*) from participant_identity.participant_auth_identifiers)
      )::text;
    `));
    const withdrawn = rpc(cluster, database, "mutate_production_access_governance_v1", mutation({
      action: "WITHDRAW_MEMBERSHIP",
      expectedRevision: 3,
      requestId: "40000000-0000-4000-8000-000000000007",
      hashCharacter: "2",
      player_id: "WD01",
      reason: "Approved annual roster withdrawal",
      expected_membership_revision: 0,
    }));
    assert.equal(withdrawn.ok, true);
    assert.equal(withdrawn.revision, 4);
    assert.equal(withdrawn.membershipRevision, 1);
    assert.equal(withdrawn.teamChanged, false);
    assert.equal(withdrawn.authUserCreated, false);
    assert.ok(withdrawn.readiness.warnings.includes("UNSTARTED_PAIRINGS_REQUIRE_SETUP_UPDATE"));
    assert.ok(withdrawn.readiness.warnings.includes("CURRENT_DRAFT_SELECTION_PRESERVED"));
    assert.ok(withdrawn.readiness.warnings.includes("COMPLETED_HISTORY_PRESERVED"));
    assert.equal(sql(cluster, database, `select participation_status from scoring_authority.tournament_players where player_id = 'WD01';`), "WITHDRAWN");

    const staleMembership = rpc(cluster, database, "mutate_production_access_governance_v1", mutation({
      action: "REACTIVATE_MEMBERSHIP",
      expectedRevision: 4,
      requestId: "40000000-0000-4000-8000-000000000008",
      hashCharacter: "3",
      player_id: "WD01",
      reason: "Approved roster return",
      expected_membership_revision: 0,
    }));
    assert.equal(staleMembership.code, "ACCESS_GOVERNANCE_MEMBERSHIP_REVISION_STALE");
    assert.equal(staleMembership.currentMembershipRevision, 1);
    const reactivated = rpc(cluster, database, "mutate_production_access_governance_v1", mutation({
      action: "REACTIVATE_MEMBERSHIP",
      expectedRevision: 4,
      requestId: "40000000-0000-4000-8000-000000000009",
      hashCharacter: "4",
      player_id: "WD01",
      reason: "Approved roster return",
      expected_membership_revision: 1,
    }));
    assert.equal(reactivated.ok, true);
    assert.equal(reactivated.revision, 5);
    assert.equal(reactivated.membershipRevision, 2);
    assert.equal(reactivated.membershipCreated, false);
    assert.equal(reactivated.teamChanged, false);
    assert.equal(reactivated.authUserCreated, false);
    assert.ok(reactivated.readiness.warnings.includes("UNSTARTED_PAIRINGS_REQUIRE_SETUP_UPDATE"));
    assert.deepEqual(parseJson(sql(cluster, database, `
      select jsonb_build_object(
        'team', (select team_id || ':' || team_side || ':' || source_roster_key from scoring_authority.tournament_players where player_id = 'WD01'),
        'handicap', (select tournament_handicap::text from scoring_authority.handicap_revision_entries where player_id = 'WD01'),
        'authUsers', (select count(*) from auth.users),
        'links', (select count(*) from participant_identity.user_player_links),
        'identifiers', (select count(*) from participant_identity.participant_auth_identifiers)
      )::text;
    `)), boundedBeforeMembership, "membership status changes must not synthesize team, handicap, or Auth state");

    const competitionBlocked = rpc(cluster, database, "mutate_production_access_governance_v1", mutation({
      action: "WITHDRAW_MEMBERSHIP",
      expectedRevision: 5,
      requestId: "40000000-0000-4000-8000-000000000010",
      hashCharacter: "5",
      player_id: "BL01",
      reason: "Attempted withdrawal with competition facts",
      expected_membership_revision: 0,
    }));
    assert.equal(competitionBlocked.code, "ACCESS_GOVERNANCE_MEMBERSHIP_DEPENDENCY_BLOCKED");
    assert.ok(competitionBlocked.readiness.hardBlockers.includes("CURRENT_COMPETITION_FACTS"));
    assert.equal(competitionBlocked.readiness.dependencyCounts.activeMatches, 1);
    assert.equal(competitionBlocked.readiness.dependencyCounts.finalizedMatches, 1);
    assert.ok(competitionBlocked.readiness.dependencyCounts.scoringActivity >= 2);
    assert.equal(sql(cluster, database, `select participation_status from scoring_authority.tournament_players where player_id = 'BL01';`), "ACTIVE");

    const ordinaryDirectorDenied = rpc(cluster, database, "mutate_production_access_governance_v1", mutation({
      action: "GRANT_DIRECTOR",
      expectedRevision: 5,
      requestId: "40000000-0000-4000-8000-000000000011",
      hashCharacter: "6",
      player_id: "GR01",
      reason: "Approved administration coverage",
      confirmed: true,
    }));
    assert.equal(ordinaryDirectorDenied.code, "ACCESS_GOVERNANCE_ACTIVE_OWNER_REQUIRED");
    assert.equal(sql(cluster, database, `select count(*) from production_control.tournament_owner_capabilities_v1;`), "0");

    const adoptionInput = {
      ...scope,
      action: "INITIAL_OWNER_ADOPTION",
      actor_player_id: ownerActor.playerId,
      actor_auth_user_id: ownerActor.authUserId,
      operation_request_id: "40000000-0000-4000-8000-000000000012",
      request_payload_hash: "7".repeat(64),
      expected_revision: 5,
      expected_entitlement_id: ownerEntitlementId,
      expected_entitlement_event_id: 10,
      expected_entitlement_event_count: 1,
      reason: "Certified initial Production owner adoption",
    };
    assert.throws(
      () => rpc(cluster, database, "adopt_initial_production_owner_v1", adoptionInput),
      /ACCESS_GOVERNANCE_DATABASE_OWNER_SESSION_REQUIRED/,
      "a service-role request cannot adopt an Owner even through the database owner connection",
    );
    assert.throws(
      () => sql(cluster, database, `set role service_role; select public.adopt_initial_production_owner_v1(${jsonSql(adoptionInput)});`, { databaseOwner: true }),
      /permission denied for function adopt_initial_production_owner_v1/,
    );
    assert.throws(
      () => rpc(cluster, database, "adopt_initial_production_owner_v1", {
        ...adoptionInput,
        operation_request_id: "40000000-0000-4000-8000-000000000099",
        request_payload_hash: "c".repeat(64),
        expected_entitlement_event_count: 2,
      }, { databaseOwner: true }),
      /ACCESS_GOVERNANCE_ENTITLEMENT_EVIDENCE_STALE/,
      "Owner adoption must bind the exact predecessor entitlement history",
    );
    const adopted = rpc(cluster, database, "adopt_initial_production_owner_v1", adoptionInput, { databaseOwner: true });
    assert.equal(adopted.ok, true);
    assert.equal(adopted.revision, 6);
    assert.equal(adopted.playerId, "CB01");
    const adoptionRetry = rpc(cluster, database, "adopt_initial_production_owner_v1", adoptionInput, { databaseOwner: true });
    assert.equal(adoptionRetry.idempotent, true);
    assert.equal(sql(cluster, database, `select role || ':' || status from production_control.director_entitlements where player_id = 'CB01';`), "DIRECTOR:ACTIVE");
    assert.equal(sql(cluster, database, `select role || ':' || role_active::text from participant_identity.tournament_roles where auth_user_id = '${ownerActor.authUserId}' and role = 'DIRECTOR';`), "DIRECTOR:true");

    const ownerRead = rpc(cluster, database, "read_production_access_governance_v1", initialReadInput);
    assert.equal(ownerRead.revision, 6);
    assert.equal(ownerRead.ownerAdoptionRequired, false);
    assert.equal(ownerRead.actor.owner, true);
    assert.equal(ownerRead.players.filter((value) => value.playerId === "GR01").length, 1,
      "a historical revoked Auth entitlement must not duplicate the current Player projection");
    const protectedActor = ownerRead.players.find((value) => value.playerId === "CB01");
    assert.equal(protectedActor.governance.canRevoke, false);
    assert.ok(protectedActor.governance.blockers.includes("OWNER_PROTECTED"));
    assert.ok(protectedActor.governance.blockers.includes("SELF_REVOKE_PROTECTED"));
    assert.ok(protectedActor.governance.blockers.includes("FINAL_ADMIN_PROTECTED"));
    const serializedRead = JSON.stringify(ownerRead);
    for (const privateValue of [
      "director@private.test",
      "history@private.test",
      "grant@private.test",
      ownerActor.authUserId,
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000003",
    ]) assert.equal(serializedRead.includes(privateValue), false, `${privateValue} must not leak through the read projection`);

    const granted = rpc(cluster, database, "mutate_production_access_governance_v1", mutation({
      action: "GRANT_DIRECTOR",
      expectedRevision: 6,
      requestId: "40000000-0000-4000-8000-000000000013",
      hashCharacter: "8",
      player_id: "GR01",
      reason: "Approved administration coverage",
      confirmed: true,
    }));
    assert.equal(granted.ok, true);
    assert.equal(granted.revision, 7);
    assert.equal(granted.authUserCreated, false);
    assert.equal(sql(cluster, database, `select role || ':' || status from production_control.director_entitlements where player_id = 'GR01' and auth_user_id = '00000000-0000-4000-8000-000000000003';`), "DIRECTOR:ACTIVE");
    assert.equal(sql(cluster, database, `select role_active::text from participant_identity.tournament_roles where auth_user_id = '00000000-0000-4000-8000-000000000003' and role = 'DIRECTOR';`), "true");

    const selfRevoke = rpc(cluster, database, "mutate_production_access_governance_v1", mutation({
      action: "REVOKE_DIRECTOR",
      expectedRevision: 7,
      requestId: "40000000-0000-4000-8000-000000000014",
      hashCharacter: "9",
      player_id: "CB01",
      reason: "Attempted self revocation",
      confirmed: true,
    }));
    assert.equal(selfRevoke.code, "ACCESS_GOVERNANCE_SELF_REVOKE_BLOCKED");

    sql(cluster, database, `
      insert into participant_identity.tournament_roles (
        tournament_id, auth_user_id, role, role_active, granted_by
      ) values (
        '2026','00000000-0000-4000-8000-000000000004','DIRECTOR',true,'fixture'
      );
      insert into production_control.director_entitlements (
        entitlement_id, auth_user_id, tournament_id, player_id, role, status,
        granted_by
      ) values (
        '10000000-0000-4000-8000-000000000004',
        '00000000-0000-4000-8000-000000000004','2026','OP01','DIRECTOR',
        'ACTIVE','fixture'
      );
      insert into production_control.director_entitlement_events (
        event_id, entitlement_id, action, actor, reason
      ) values (
        20, '10000000-0000-4000-8000-000000000004', 'GRANTED', 'fixture',
        'Certified protected Owner fixture grant'
      );
      insert into production_control.tournament_owner_capabilities_v1 (
        tournament_id, player_id, auth_user_id, adopted_from_entitlement_id,
        adopted_entitlement_event_id, adopted_entitlement_event_count, status,
        capability_revision, adopted_by_player_id, adopted_at
      ) values (
        '2026','OP01','00000000-0000-4000-8000-000000000004',
        '10000000-0000-4000-8000-000000000004',20,1,'ACTIVE',1,'CB01',now()
      );
    `);
    const ownerProtected = rpc(cluster, database, "mutate_production_access_governance_v1", mutation({
      action: "REVOKE_DIRECTOR",
      expectedRevision: 7,
      requestId: "40000000-0000-4000-8000-000000000015",
      hashCharacter: "a",
      player_id: "OP01",
      reason: "Attempted Owner revocation",
      confirmed: true,
    }));
    assert.equal(ownerProtected.code, "ACCESS_GOVERNANCE_OWNER_REVOKE_BLOCKED");

    const revoked = rpc(cluster, database, "mutate_production_access_governance_v1", mutation({
      action: "REVOKE_DIRECTOR",
      expectedRevision: 7,
      requestId: "40000000-0000-4000-8000-000000000016",
      hashCharacter: "b",
      player_id: "GR01",
      reason: "Administration coverage ended",
      confirmed: true,
    }));
    assert.equal(revoked.ok, true);
    assert.equal(revoked.revision, 8);
    assert.deepEqual(parseJson(sql(cluster, database, `
      select jsonb_object_agg(auth_user_id::text, status)::text
      from production_control.director_entitlements where player_id = 'GR01';
    `)), {
      "00000000-0000-4000-8000-000000000003": "REVOKED",
      "00000000-0000-4000-8000-000000000006": "REVOKED",
    });
    assert.equal(sql(cluster, database, `select role_active::text from participant_identity.tournament_roles where auth_user_id = '00000000-0000-4000-8000-000000000003' and role = 'DIRECTOR';`), "false");
    assert.equal(sql(cluster, database, `select status from participant_identity.user_player_links where player_id = 'GR01' and auth_user_id = '00000000-0000-4000-8000-000000000003';`), "ACTIVE");
    assert.equal(sql(cluster, database, `select participation_status from scoring_authority.tournament_players where player_id = 'GR01';`), "ACTIVE");

    assert.throws(
      () => rpc(cluster, database, "read_production_access_governance_v1", {
        ...initialReadInput,
        environment: "PREVIEW",
        project_ref: "preview-project",
      }),
      /PRODUCTION_ACCESS_GOVERNANCE_SCOPE_REQUIRED|PRODUCTION_RESOURCE_ASSERTION_FAILED/,
    );
    assert.throws(
      () => rpc(cluster, database, "read_production_access_governance_v1", {
        ...initialReadInput,
        project_ref: "another-production-project",
      }),
      /PRODUCTION_RESOURCE_ASSERTION_FAILED/,
    );

    assert.deepEqual(parseJson(sql(cluster, database, `
      select jsonb_build_object(
        'authUsers', (select count(*) from auth.users),
        'links', (select count(*) from participant_identity.user_player_links),
        'identifiers', (select count(*) from participant_identity.participant_auth_identifiers),
        'teams', (select count(*) from scoring_authority.teams),
        'handicaps', (select count(*) from scoring_authority.handicap_revision_entries)
      )::text;
    `)), {
      authUsers: before.authUsers,
      links: before.links,
      identifiers: 5,
      teams: 2,
      handicaps: 6,
    });
    assert.equal(sql(cluster, database, `
      select count(*) from production_control.access_governance_audit_events_v1
      where safe_metadata ?| array['email','phone','auth_user_id','authUserId','token','secret'];
    `), "0");
    const mergedAudit = parseJson(sql(cluster, database, `
      select production_control.director_private_audit_with_access_v1()::text;
    `, { databaseOwner: true }));
    assert.ok(mergedAudit.some((item) => item.action === "FIXTURE_READY"));
    assert.ok(mergedAudit.some((item) => item.category === "ACCESS" && item.action === "OWNER_ADOPTED"));
    assert.ok(mergedAudit.some((item) => item.category === "ACCESS" && item.action === "DIRECTOR_REVOKED"));
    assert.ok(mergedAudit.length <= 60);
    const serializedAudit = JSON.stringify(mergedAudit);
    assert.doesNotMatch(serializedAudit, /@private\.test/);
    assert.doesNotMatch(serializedAudit, /00000000-0000-4000-8000-00000000000[1-5]/);
  } finally {
    await destroyCluster(cluster);
  }
});
