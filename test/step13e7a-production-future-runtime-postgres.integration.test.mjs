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
].map((name) => path.join(root, "supabase/production_migrations", name));
const identityMigration = path.join(root, "supabase/production_migrations",
  "202608300068_production_future_participant_identity_runtime_v1.sql");
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
    create table auth.users(id uuid primary key, email text,
      email_confirmed_at timestamptz, phone text,
      phone_confirmed_at timestamptz);
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
    create table scoring_authority.google_outbox_events(id uuid,status text);
    create table scoring_authority.scorecard_archive_jobs(job_id uuid,status text);
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
    create table participant_identity.participant_identity_contacts(
      tournament_id text,player_id text,email text,email_normalized text,
      identity_active boolean,configuration_revision bigint,verified_by text,
      verified_at timestamptz,source_system text,source_workbook_id text,
      source_updated_at timestamptz,created_at timestamptz default now(),
      updated_at timestamptz default now(),primary key(tournament_id,player_id));
    create table participant_identity.user_player_links(
      link_id uuid primary key default gen_random_uuid(),auth_user_id uuid,
      player_id text,status text,link_revision bigint,link_method text,
      email_identity_hash text,linked_at timestamptz,linked_by text,
      revoked_at timestamptz,revoked_by text,revoke_reason text,
      created_at timestamptz default now(),updated_at timestamptz default now());
    create table participant_identity.participant_auth_identifiers(
      identifier_id uuid primary key default gen_random_uuid(),player_id text,
      auth_user_id uuid,identifier_type text,normalized_value_private text,
      status text,verified_at timestamptz,verification_source text,
      revision bigint,source_system text,source_tournament_id text,
      source_configuration_revision bigint,created_by text,updated_by text,
      revoked_at timestamptz,revoked_by text,revoke_reason text,
      created_at timestamptz default now(),updated_at timestamptz default now());
    create table participant_identity.tournament_roles(
      tournament_id text,auth_user_id uuid,role text,role_active boolean,
      role_revision bigint default 1,granted_at timestamptz default now(),
      granted_by text,revoked_at timestamptz,revoked_by text,
      created_at timestamptz default now(),updated_at timestamptz default now(),
      primary key(tournament_id,auth_user_id,role));
    create table participant_identity.identity_config_import_runs(
      run_id uuid primary key default gen_random_uuid(),tournament_id text,
      source_system text,source_workbook_id text,source_fingerprint text,
      configuration_revision bigint,status text,roster_count int,
      received_count int,valid_count int,missing_count int,duplicate_count int,
      malformed_count int,shared_count int,inactive_count int,
      unknown_player_count int,mapping_conflict_count int,
      validation_report jsonb,requested_by text,requested_at timestamptz,
      approved_by text,approved_at timestamptz,created_at timestamptz default now(),
      updated_at timestamptz default now());
    create table participant_identity.identity_context_revisions(
      tournament_id text primary key,context_revision bigint,
      configuration_fingerprint text,updated_at timestamptz default now(),
      updated_by text);
    create table participant_identity.identity_audit_events(
      event_id uuid primary key default gen_random_uuid(),event_type text,
      tournament_id text,auth_user_id uuid,player_id text,actor_id text,
      actor_name text,request_id text,reason_code text,link_revision bigint,
      configuration_revision bigint,safe_metadata jsonb,
      occurred_at timestamptz default now(),created_at timestamptz default now());
    create table participant_identity.participant_auth_otp_attempts(
      request_id uuid primary key,tournament_id text,player_id text,
      auth_user_id uuid,email_identity_hash text,client_request_hash text,
      status text,safe_reason text,verification_type text,
      request_duration_ms int,verification_duration_ms int,
      requested_at timestamptz default now(),sent_at timestamptz,
      verified_at timestamptz,updated_at timestamptz default now());
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
    create table production_control.director_entitlements(
      entitlement_id uuid primary key default gen_random_uuid(),
      auth_user_id uuid,tournament_id text,player_id text,role text,
      status text,granted_by text,granted_at timestamptz default now(),
      revoked_at timestamptz, unique(auth_user_id,tournament_id));
    create table production_control.director_entitlement_events(
      event_id bigint generated always as identity primary key,
      entitlement_id uuid,action text,actor text,reason text,
      created_at timestamptz default now());
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
    create function production_control.access_governance_global_status_v1(text)
    returns text language sql as $f$ select 'ACTIVE'::text $f$;
    insert into auth.users(id,email,email_confirmed_at) values(
      '00000000-0000-4000-8000-000000000001','owner@example.org',now());
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
    insert into production_control.director_entitlements(
      auth_user_id,tournament_id,player_id,role,status,granted_by
    ) values('00000000-0000-4000-8000-000000000001','2026','CB01',
      'OWNER','ACTIVE','fixture');
  `);
}

test("migration 066 installs atomically and inertly on PostgreSQL 17", async (t) => {
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

  // Representative isolated annual setup: no Production fixture is changed.
  sql(cluster, database, String.raw`
    insert into production_control.future_tournament_catalog_v1 (
      tournament_id,tournament_year,contract_version,tournament_name,
      destination,start_date,end_date,timezone,lifecycle,
      lifecycle_revision,setup_revision,creation_mode,source_manifest,
      created_by_player_id,created_by_auth_user_id
    ) values ('2099',2099,'production-future-year-administration-v1',
      'Fixture Future Tournament','Fixture','2099-01-01','2099-01-03',
      'America/Chicago','DRAFT',1,1,'BLANK','{}','CB01',
      '00000000-0000-4000-8000-000000000001');
    insert into production_control.future_tournament_resources_v1 (
      tournament_id,project_ref,project_url,source_workbook_id,
      resource_status,resource_revision,google_compatibility_policy,
      updated_by_player_id
    ) values ('2099','ymqhhtxaywtqllynrmxe',
      'https://ymqhhtxaywtqllynrmxe.supabase.co','workbook-production',
      'CURRENT_RESOURCE_BOUND',1,'CURRENT_CERTIFIED','CB01');
    insert into production_control.future_tournament_rounds_v1 (
      tournament_id,round_number,round_name,format,team_size,
      points_available,handicap_allowance,setup_revision,updated_by_player_id
    ) values ('2099',1,'Round 1','SI',1,1,1,1,'CB01');

    do $test$
    declare payload jsonb; response jsonb;
    begin
      payload := pg_catalog.jsonb_build_object(
        'contract_version','production-future-runtime-activation-v2',
        'environment','PRODUCTION','project_ref','ymqhhtxaywtqllynrmxe',
        'project_url','https://ymqhhtxaywtqllynrmxe.supabase.co',
        'source_workbook_id','workbook-production',
        'target_tournament_id','2099','action','ADD_GLOBAL_COURSE',
        'display_name','Fixture Course','location','Fixture City',
        'expected_revision',1,'reason','Fixture course creation certification',
        'operation_request_id','00000000-0000-4000-8000-000000000101',
        'authorization',pg_catalog.jsonb_build_object(
          'player_id','CB01','auth_user_id',
          '00000000-0000-4000-8000-000000000001',
          'role','DIRECTOR','tournament_id','2026'));
      response := public.mutate_production_future_runtime_v2(payload ||
        pg_catalog.jsonb_build_object('request_payload_hash',
          production_control.future_runtime_hash_v2(payload)));
      if response->>'code' <> 'PRODUCTION_GLOBAL_COURSE_CREATED'
         or response->>'courseId' <> 'CRS000001' then
        raise exception 'unexpected add-course response: %', response;
      end if;

      payload := pg_catalog.jsonb_build_object(
        'contract_version','production-future-runtime-activation-v2',
        'environment','PRODUCTION','project_ref','ymqhhtxaywtqllynrmxe',
        'project_url','https://ymqhhtxaywtqllynrmxe.supabase.co',
        'source_workbook_id','workbook-production',
        'target_tournament_id','2099',
        'action','CONFIGURE_GLOBAL_COURSE_CONTEXT',
        'course_id','CRS000001','tee_id','TOURNAMENT',
        'rating','72.1','slope',130,'par',72,
        'holes',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'hole_number',value,'par',4,'stroke_index',value,
          'yardage',400) order by value)
          from pg_catalog.generate_series(1,18) value),
        'expected_revision',1,
        'reason','Fixture course context certification',
        'operation_request_id','00000000-0000-4000-8000-000000000102',
        'authorization',pg_catalog.jsonb_build_object(
          'player_id','CB01','auth_user_id',
          '00000000-0000-4000-8000-000000000001',
          'role','DIRECTOR','tournament_id','2026'));
      response := public.mutate_production_future_runtime_v2(payload ||
        pg_catalog.jsonb_build_object('request_payload_hash',
          production_control.future_runtime_hash_v2(payload)));
      if response->>'code' <> 'PRODUCTION_GLOBAL_COURSE_CONTEXT_CONFIGURED'
         or (response->>'scoringReady')::boolean is not true then
        raise exception 'unexpected configure-course response: %', response;
      end if;

      payload := pg_catalog.jsonb_build_object(
        'contract_version','production-future-runtime-activation-v2',
        'environment','PRODUCTION','project_ref','ymqhhtxaywtqllynrmxe',
        'project_url','https://ymqhhtxaywtqllynrmxe.supabase.co',
        'source_workbook_id','workbook-production',
        'target_tournament_id','2099','action','ASSIGN_FUTURE_COURSE',
        'course_id','CRS000001','tee_id','TOURNAMENT','round_number',1,
        'course_context_revision',2,'expected_revision',1,
        'reason','Fixture future round assignment certification',
        'operation_request_id','00000000-0000-4000-8000-000000000103',
        'authorization',pg_catalog.jsonb_build_object(
          'player_id','CB01','auth_user_id',
          '00000000-0000-4000-8000-000000000001',
          'role','DIRECTOR','tournament_id','2026'));
      response := public.mutate_production_future_runtime_v2(payload ||
        pg_catalog.jsonb_build_object('request_payload_hash',
          production_control.future_runtime_hash_v2(payload)));
      if response->>'code' <> 'PRODUCTION_FUTURE_GLOBAL_COURSE_ASSIGNED' then
        raise exception 'unexpected course assignment response: %', response;
      end if;
    end $test$;
  `);
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select count(*) from scoring_authority.global_course_catalog_v1),
    (select count(*) from scoring_authority.global_course_tee_contexts_v1),
    (select count(*) from scoring_authority.global_course_hole_contexts_v1),
    (select reference_status from production_control.future_tournament_course_references_v1
      where tournament_id='2099' and round_number=1),
    (select setup_revision from production_control.future_tournament_catalog_v1
      where tournament_id='2099'));`), "1|1|18|GLOBAL_COURSE_CONTEXT|2");

  sql(cluster, database, String.raw`
    insert into scoring_authority.players values('FX02','Fixture Player','{}');
    insert into production_control.future_tournament_teams_v1
      (tournament_id,team_id,team_side,team_name,captain_player_id,active,
       setup_revision,updated_by_player_id)
    values ('2099','A',1,'A','CB01',true,2,'CB01'),
      ('2099','B',2,'B','FX02',true,2,'CB01');
    insert into production_control.future_tournament_roster_v1
      (tournament_id,player_id,team_id,team_side,participation_status,
       setup_revision,updated_by_player_id)
    values ('2099','CB01','A',1,'ACTIVE',2,'CB01'),
      ('2099','FX02','B',2,'ACTIVE',2,'CB01');
    insert into production_control.future_match_definitions_v1
      (tournament_id,match_id,round_number,match_number,format,team_size,
       setup_revision,created_by_player_id)
    values ('2099','2099-R1-1',1,1,'SI',1,2,'CB01');
    insert into production_control.future_match_google_compatibility_jobs_v1
      (tournament_id,match_id,requirement_class,status,writer_installed)
    values ('2099','2099-R1-1','OPTIONAL_ARCHIVE',
      'PROVISIONING_REQUIRED',false);
    insert into participant_identity.user_player_links(
      auth_user_id,player_id,status,link_revision,link_method,linked_by
    ) values (
      '00000000-0000-4000-8000-000000000001','CB01','ACTIVE',1,
      'APPROVED_EMAIL_OTP','fixture'
    );
    insert into participant_identity.participant_auth_identifiers(
      player_id,auth_user_id,identifier_type,normalized_value_private,
      status,verified_at,verification_source,revision,source_system,
      source_tournament_id,source_configuration_revision,created_by,updated_by
    ) values (
      'CB01','00000000-0000-4000-8000-000000000001','EMAIL',
      'owner@example.org','VERIFIED',now(),'OTP',1,'SUPABASE','2026',1,
      'fixture','fixture'
    );
    do $test$
    declare payload jsonb; response jsonb;
    begin
      payload := pg_catalog.jsonb_build_object(
        'contract_version','production-future-runtime-activation-v2',
        'environment','PRODUCTION','project_ref','ymqhhtxaywtqllynrmxe',
        'project_url','https://ymqhhtxaywtqllynrmxe.supabase.co',
        'source_workbook_id','workbook-production',
        'target_tournament_id','2099','target_tournament_year',2099,
        'action','GRANT_FUTURE_DIRECTOR','target_player_id','CB01',
        'expected_revision',0,
        'reason','Select an eligible future tournament Director',
        'operation_request_id','00000000-0000-4000-8000-000000000109',
        'authorization',pg_catalog.jsonb_build_object(
          'player_id','CB01','auth_user_id',
          '00000000-0000-4000-8000-000000000001',
          'role','DIRECTOR','tournament_id','2026'));
      response := public.mutate_production_future_runtime_v2(payload ||
        pg_catalog.jsonb_build_object('request_payload_hash',
          production_control.future_runtime_hash_v2(payload)));
      if response->>'code' <> 'PRODUCTION_FUTURE_DIRECTOR_GRANTED'
         or response->>'nextRevision' <> '1'
         or response->>'changed' <> 'true' then
        raise exception 'unexpected future Director grant: %', response;
      end if;
      response := public.mutate_production_future_runtime_v2(payload ||
        pg_catalog.jsonb_build_object('request_payload_hash',
          production_control.future_runtime_hash_v2(payload)));
      if response->>'idempotent' <> 'true'
         or response->>'nextRevision' <> '1' then
        raise exception 'future Director retry was not idempotent: %', response;
      end if;

      payload := pg_catalog.jsonb_build_object(
        'contract_version','production-future-runtime-activation-v2',
        'environment','PRODUCTION','project_ref','ymqhhtxaywtqllynrmxe',
        'project_url','https://ymqhhtxaywtqllynrmxe.supabase.co',
        'source_workbook_id','workbook-production',
        'target_tournament_id','2099','action','PROMOTE_RUNTIME_STRUCTURE',
        'expected_revision',0,'reason','Fixture promotion certification',
        'operation_request_id','00000000-0000-4000-8000-000000000104',
        'authorization',pg_catalog.jsonb_build_object(
          'player_id','CB01','auth_user_id',
          '00000000-0000-4000-8000-000000000001',
          'role','DIRECTOR','tournament_id','2026'));
      response := public.mutate_production_future_runtime_v2(payload ||
        pg_catalog.jsonb_build_object('request_payload_hash',
          production_control.future_runtime_hash_v2(payload)));
      if response->>'code' <> 'PRODUCTION_FUTURE_RUNTIME_PROMOTED' then
        raise exception 'unexpected promotion response: %', response;
      end if;
    end $test$;
  `);
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select count(*) from scoring_authority.tournaments where tournament_id='2099'),
    (select count(*) from scoring_authority.tournament_setup_course_holes_v1
      where tournament_id='2099' and course_id='CRS000001'),
    (select count(*) from scoring_authority.matches
      where tournament_id='2099' and scoring_snapshot_id is null),
    (select writer_installed from production_control.future_match_google_compatibility_jobs_v1
      where match_id='2099-R1-1'),
    (select governance_revision
      from production_control.future_tournament_director_governance_v1
      where tournament_id='2099'),
    (select count(*) from production_control.director_entitlements
      where tournament_id='2099' and player_id='CB01' and role='DIRECTOR'
        and status='ACTIVE' and revoked_at is null),
    (select count(*) from participant_identity.tournament_roles
      where tournament_id='2099'
        and auth_user_id='00000000-0000-4000-8000-000000000001'
        and role='DIRECTOR' and role_active and revoked_at is null));`),
    "1|18|1|f|1|1|1");

  // A certified annual projection is bound to the promoted runtime revision.
  // Changing it after Ready returns the tournament to Configuring exactly
  // once; an exact lost-response retry remains idempotent with the original
  // predecessor values.
  sql(cluster, database, String.raw`
    update production_control.future_tournament_catalog_v1
    set lifecycle='READY_FOR_ACTIVATION', lifecycle_revision=3,
      readiness_fingerprint=repeat('a',64), readiness_setup_revision=2
    where tournament_id='2099';
    do $test$
    declare payload jsonb; response jsonb;
    begin
      payload := pg_catalog.jsonb_build_object(
        'contract_version','production-future-runtime-activation-v2',
        'environment','PRODUCTION','project_ref','ymqhhtxaywtqllynrmxe',
        'project_url','https://ymqhhtxaywtqllynrmxe.supabase.co',
        'source_workbook_id','workbook-production',
        'target_tournament_id','2099','target_tournament_year',2099,
        'domain','GUIDE','source_revision',1,
        'source_fingerprint',repeat('b',64),
        'payload_fingerprint',repeat('c',64),
        'projection',pg_catalog.jsonb_build_object('sections','[]'::jsonb),
        'expected_setup_revision',2,'expected_runtime_revision',1,
        'authorization',pg_catalog.jsonb_build_object(
          'player_id','CB01','auth_user_id',
          '00000000-0000-4000-8000-000000000001',
          'role','DIRECTOR','tournament_id','2026'));
      response := public.read_production_future_annual_projection_v1(payload);
      if (response->>'runtime_revision')::bigint <> 1 then
        raise exception 'annual read omitted runtime predecessor: %', response;
      end if;
      response := public.synchronize_production_future_annual_projection_v1(payload);
      if response->>'changed' <> 'true'
         or response->>'setupRevision' <> '2'
         or response->>'lifecycleRevision' <> '4' then
        raise exception 'unexpected changed annual sync: %', response;
      end if;
      response := public.synchronize_production_future_annual_projection_v1(payload);
      if response->>'duplicate' <> 'true'
         or response->>'idempotent' <> 'true' then
        raise exception 'annual exact retry was not idempotent: %', response;
      end if;
    end $test$;
  `);
  assert.equal(sql(cluster, database, `select concat_ws('|',
    lifecycle,lifecycle_revision,setup_revision,
    readiness_fingerprint is null,readiness_setup_revision is null,
    (select count(*) from production_control.future_annual_projection_bindings_v1
      where tournament_id='2099' and domain='GUIDE')
    ) from production_control.future_tournament_catalog_v1
    where tournament_id='2099';`), "CONFIGURING|4|2|t|t|1");

  assert.match(sql(cluster, database, `select
    production_control.future_runtime_readiness_v2('2099')::text;`),
    /FUTURE_PREDECESSOR_SCORING_CLOSE_FENCE_NOT_CERTIFIED/);

  const beforeIdentity = sql(cluster, database, `select concat_ws('|',
    (select count(*) from participant_identity.future_tournament_identity_contexts_v1),
    (select count(*) from participant_identity.future_tournament_participant_bindings_v1),
    (select count(*) from participant_identity.tournament_roles),
    (select count(*) from participant_identity.participant_auth_otp_attempts));`);
  sqlFile(cluster, database, identityMigration);
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select count(*) from participant_identity.future_tournament_identity_contexts_v1),
    (select count(*) from participant_identity.future_tournament_participant_bindings_v1),
    (select count(*) from participant_identity.tournament_roles),
    (select count(*) from participant_identity.participant_auth_otp_attempts));`),
    beforeIdentity);
  assert.equal(sql(cluster, database, `select concat_ws('|',
    to_regprocedure('production_control.bind_future_participant_identity_runtime_v1(text,uuid,uuid,uuid,text,uuid)') is not null,
    has_function_privilege('service_role',
      'public.read_production_future_participant_context_for_auth_v1(uuid,text)','EXECUTE'),
    has_function_privilege('authenticated',
      'public.read_production_future_participant_context_for_auth_v1(uuid,text)','EXECUTE'),
    has_function_privilege('service_role',
      'production_control.bind_future_participant_identity_runtime_v1(text,uuid,uuid,uuid,text,uuid)','EXECUTE'));`),
    "t|t|f|f");
});
