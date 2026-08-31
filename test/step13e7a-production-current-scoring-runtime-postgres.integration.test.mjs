import assert from "node:assert/strict";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrations = [
  "202608300064_production_future_year_administration_v1.sql",
  "202608300065_production_future_year_runtime_role_guard.sql",
  "202608300066_production_future_runtime_activation_v1.sql",
  "202608300067_production_current_scoring_runtime_v1.sql",
  "202608300069_production_annual_scoring_authority_v1.sql",
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

function sqlAsync(cluster, database, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin.psql, [
      "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", database,
    ], { cwd: root, env: environment(cluster), stdio: ["pipe", "pipe", "pipe"] });
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

function sqlLiteral(value) {
  return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
}

function annualInput(cluster, database, value) {
  return JSON.parse(sql(cluster, database, `select (source.value ||
    jsonb_build_object('request_payload_hash',
      production_control.future_runtime_hash_v2(source.value)))::text
    from (select ${sqlLiteral(value)} value) source;`));
}

function jsonRpc(cluster, database, functionName, input) {
  return JSON.parse(sql(cluster, database,
    `select public.${functionName}(${sqlLiteral(input)})::text;`));
}

function lockedPointerWriter(cluster, database, input) {
  let markLocked;
  const locked = new Promise((resolve) => { markLocked = resolve; });
  const completed = new Promise((resolve, reject) => {
    const child = spawn(bin.psql, [
      "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", database,
    ], { cwd: root, env: environment(cluster), stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (value) => {
      stdout += value;
      if (stdout.includes("LOCKED\n")) markLocked();
    });
    child.stderr.on("data", (value) => { stderr += value; });
    child.on("error", reject);
    child.on("close", (code) => code === 0
      ? resolve(stdout.trim())
      : reject(new Error([stdout, stderr].filter(Boolean).join("\n"))));
    child.stdin.end(input);
  });
  return { locked, completed };
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
    create table participant_identity.user_player_links(
      auth_user_id uuid primary key,player_id text not null,status text not null,
      revoked_at timestamptz);
    create table participant_identity.participant_auth_identifiers(
      identifier_id uuid primary key default gen_random_uuid(), player_id text,
      auth_user_id uuid, identifier_type text, normalized_value_private text,
      status text, revoked_at timestamptz);
    create table participant_identity.tournament_roles(
      tournament_id text, auth_user_id uuid, role text, role_active boolean,
      role_revision bigint default 1, granted_at timestamptz default now(),
      granted_by text, revoked_at timestamptz, revoked_by text,
      created_at timestamptz default now(), updated_at timestamptz default now(),
      primary key(tournament_id,auth_user_id,role));
    create table production_control.director_entitlements(
      entitlement_id uuid primary key default gen_random_uuid(),
      auth_user_id uuid, tournament_id text, player_id text, role text,
      status text, granted_by text, granted_at timestamptz default now(),
      revoked_at timestamptz, unique(auth_user_id,tournament_id));
    create table production_control.director_entitlement_events(
      event_id bigint generated always as identity primary key,
      entitlement_id uuid, action text, actor text, reason text,
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
    create function production_control.assert_production_scoring_runtime(
      jsonb, text default null
    ) returns void language plpgsql as $f$ begin null; end $f$;
    create function production_control.access_governance_global_status_v1(text)
    returns text language sql as $f$ select 'ACTIVE'::text $f$;
    insert into auth.users(id) values('00000000-0000-4000-8000-000000000001');
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
    insert into participant_identity.user_player_links values(
      '00000000-0000-4000-8000-000000000001','CB01','ACTIVE',null);
  `);
}

function annualFixture(cluster, database) {
  sql(cluster, database, String.raw`
    alter table production_control.resource_scope
      add column scoring_authority text not null default 'SUPABASE',
      add column workers_enabled boolean not null default true,
      add column google_writes_enabled boolean not null default true;
    alter table production_control.cutover_activation_state
      add column expected_deployment_commit text,
      add column boundary_mode text not null default 'MAINTENANCE_WINDOW_V1',
      add column read_cutover_phase text not null default 'OBSERVATION',
      add column updated_by text,
      add column updated_at timestamptz default now();
    update production_control.cutover_activation_state set
      expected_deployment_commit = repeat('a', 40);

    create table scoring_authority.ingress_gates(
      tournament_id text primary key, state text, authority text,
      admission_state text, active_epoch_id uuid,
      admission_generation_id uuid, admission_revision bigint,
      admission_deployment_id text, active_closure_id uuid,
      external_fence_evidence_id uuid, admission_enforced_at timestamptz,
      unresolved_client_queues integer default 0,
      updated_by text, updated_at timestamptz default now());
    create table production_control.scoring_admission_closures(
      closure_id uuid primary key default extensions.gen_random_uuid(),
      closure_kind text, prior_legacy_closure_id uuid,
      tournament_id text, authority text, authority_generation_id uuid,
      admission_generation_id uuid, deployment_id text, status text,
      opening_admission_revision bigint, closing_admission_revision bigint,
      closed_admission_revision bigint, lease_high_watermark bigint default 0,
      start_source_fingerprint text, final_source_fingerprint text,
      reconciliation_fingerprint text, lease_set_fingerprint text,
      supabase_match_revisions jsonb, google_checkpoints jsonb,
      external_fence_evidence_id uuid,
      google_writer_provider_fence_id uuid,
      google_writer_provider_verification_id uuid,
      close_request_fingerprint text, close_payload_hash text,
      closing_at timestamptz default now(), closed_at timestamptz,
      reopened_at timestamptz, consumed_at timestamptz,
      actor_id text, consumed_epoch_id uuid);
    create table production_control.maintenance_deployment_capability_bindings(
      capability_binding_id uuid primary key, epoch_id uuid,
      deployment_id text, deployment_commit text, contract_version text,
      capability_ceiling text, capability_manifest jsonb,
      capability_fingerprint text);
    create table production_control.postcutover_application_release_rebindings(
      scope_key text primary key, capability_binding_id uuid,
      deployment_id text, deployment_commit text,
      capability_contract text, capability_ceiling text);
    create table production_control.postcutover_normal_release_rebindings(
      release_rebind_id uuid primary key,
      release_sequence bigint not null,
      capability_binding_id uuid not null,
      deployment_id text not null,
      deployment_commit text not null,
      capability_contract text not null,
      capability_ceiling text not null);
    create table production_control.postcutover_normal_release_head(
      scope_key text primary key,
      release_sequence bigint not null,
      release_rebind_id uuid not null,
      deployment_id text not null,
      deployment_commit text not null,
      activation_revision bigint not null,
      admission_revision bigint not null);
    create table production_control.postcutover_normal_release_intents(
      scope_key text not null,
      status text not null);
    create table production_control.worker_controls(
      worker_name text primary key, enabled boolean,
      google_writes_allowed boolean, metadata jsonb);
    create table production_control.worker_contracts(
      worker_name text primary key, operation_allowed boolean,
      requires_google_write boolean, authoritative_write_allowed boolean);
    alter table scoring_authority.scoring_ingress_leases
      add column tournament_id text,
      add column admission_generation_id uuid,
      add column resolution_state text,
      add column admission_sequence bigint,
      add column operation text,
      add column provider_readback_fingerprint text,
      add column resolution_fingerprint text,
      add column close_fence_id uuid;

    create function production_control.scoring_admission_lock_key()
    returns bigint language sql immutable as $f$ select 731102026032::bigint $f$;
    create function production_control.assert_exact_cutover_resource_scope(
      input jsonb, require_tournament boolean default true
    ) returns void language plpgsql as $f$
    begin
      if input->>'environment' is distinct from 'PRODUCTION'
         or input->>'project_ref' is distinct from 'ymqhhtxaywtqllynrmxe'
         or input->>'project_url' is distinct from
           'https://ymqhhtxaywtqllynrmxe.supabase.co'
         or input->>'source_workbook_id' is distinct from 'workbook-production'
         or (require_tournament and input->>'tournament_id' is distinct from '2026')
      then raise exception 'EXACT_RESOURCE_SCOPE_REQUIRED'; end if;
    end $f$;
    create function production_control.cutover_phase_rank(value text)
    returns integer language sql immutable as $f$
      select case upper(value) when 'CURRENT_READS' then 3
        when 'SCORING_COMMIT' then 5 when 'WORKERS' then 6
        when 'OBSERVATION' then 7 else -1 end
    $f$;
    create function production_control.scoring_admission_legacy_blocker_count(
      timestamptz
    ) returns integer language sql stable as $f$ select 0 $f$;
    create function production_control.current_match_revisions(text)
    returns jsonb language sql stable as $f$ select '{}'::jsonb $f$;
    create function production_control.current_google_checkpoints(text)
    returns jsonb language sql stable as $f$ select '{}'::jsonb $f$;

    create or replace function
      production_control.assert_future_runtime_service_scope_v2(
        input jsonb, require_director boolean default true,
        require_owner boolean default false
      ) returns void language plpgsql security definer as $f$
      begin
        if input->>'environment' is distinct from 'PRODUCTION' then
          raise exception 'PRODUCTION_FUTURE_RUNTIME_SCOPE_REQUIRED';
        end if;
      end $f$;
    create or replace function production_control.future_runtime_readiness_v2(
      target_tournament text
    ) returns jsonb language plpgsql stable as $f$
    declare gate_state text; blockers jsonb; fingerprint text;
    begin
      select state into gate_state from scoring_authority.ingress_gates
        where tournament_id = '2026';
      blockers := case when gate_state = 'OPEN' then jsonb_build_array(
        jsonb_build_object(
          'code','FUTURE_PREDECESSOR_SCORING_CLOSE_FENCE_NOT_CERTIFIED',
          'section','Activation','message','close required'
        )) else '[]'::jsonb end;
      fingerprint := production_control.future_runtime_hash_v2(
        jsonb_build_object('target',target_tournament,'gate',gate_state,
          'blockers',blockers));
      return jsonb_build_object('ready',jsonb_array_length(blockers)=0,
        'fingerprint',fingerprint,'blockers',blockers);
    end $f$;

    create function public.close_production_scoring_admission(input jsonb)
    returns jsonb language plpgsql as $f$
    declare prior_id uuid; closure_id_value uuid := extensions.gen_random_uuid();
      activation_revision_value bigint; admission_revision_value bigint;
    begin
      select active_closure_id into prior_id from scoring_authority.ingress_gates
        where tournament_id = '2026' for update;
      insert into production_control.scoring_admission_closures(
        closure_id,closure_kind,prior_legacy_closure_id,tournament_id,authority,
        authority_generation_id,admission_generation_id,deployment_id,status,
        opening_admission_revision,closing_admission_revision,
        lease_high_watermark,start_source_fingerprint,
        external_fence_evidence_id,google_writer_provider_fence_id,
        google_writer_provider_verification_id,close_request_fingerprint,
        close_payload_hash,actor_id
      ) select closure_id_value,'SUPABASE_INGRESS',prior_id,'2026','SUPABASE',
        active_epoch_id,admission_generation_id,admission_deployment_id,
        'CLOSING',admission_revision,admission_revision+1,0,
        input->>'start_source_fingerprint',external_fence_evidence_id,
        '00000000-0000-4000-8000-000000000041',
        '00000000-0000-4000-8000-000000000042',
        input->>'request_fingerprint',repeat('9',64),input->>'actor_id'
      from scoring_authority.ingress_gates where tournament_id='2026';
      update scoring_authority.ingress_gates set state='PAUSED',
        admission_state='CLOSED',admission_revision=admission_revision+1,
        active_closure_id=closure_id_value where tournament_id='2026'
        returning admission_revision into admission_revision_value;
      update production_control.cutover_activation_state
        set activation_revision=activation_revision+1
        where scope_key='BAGGER_INV_PRODUCTION'
        returning activation_revision into activation_revision_value;
      return jsonb_build_object('ok',true,'closure_id',closure_id_value,
        'activation_revision',activation_revision_value,
        'admission_revision',admission_revision_value,
        'active_or_unresolved_leases',0);
    end $f$;
    create function public.drain_production_scoring_admission(input jsonb)
    returns jsonb language plpgsql as $f$
    begin
      update scoring_authority.ingress_gates
        set admission_revision=admission_revision+1 where tournament_id='2026';
      return jsonb_build_object('ok',true,'ready_to_finalize',true,
        'active_or_unresolved_leases',0,'lease_set_fingerprint',repeat('6',64));
    end $f$;
    create function public.finalize_production_scoring_admission(input jsonb)
    returns jsonb language plpgsql as $f$
    begin
      update production_control.scoring_admission_closures set status='CLOSED',
        closed_admission_revision=(select admission_revision+1
          from scoring_authority.ingress_gates where tournament_id='2026'),
        final_source_fingerprint=input->>'final_source_fingerprint',
        reconciliation_fingerprint=input->>'reconciliation_fingerprint',
        lease_set_fingerprint=input->>'lease_set_fingerprint',
        supabase_match_revisions=input->'supabase_match_revisions',
        google_checkpoints=input->'google_checkpoints',closed_at=now()
        where closure_id=(input->>'closure_id')::uuid;
      update scoring_authority.ingress_gates set admission_revision=admission_revision+1,
        admission_state='CLOSED' where tournament_id='2026';
      update production_control.cutover_activation_state
        set activation_revision=activation_revision+1
        where scope_key='BAGGER_INV_PRODUCTION';
      return jsonb_build_object('ok',true,'code','CLOSED');
    end $f$;

    insert into production_control.scoring_admission_closures(
      closure_id,closure_kind,tournament_id,authority,
      authority_generation_id,admission_generation_id,deployment_id,status,
      opening_admission_revision,closing_admission_revision,
      closed_admission_revision,lease_high_watermark,start_source_fingerprint,
      final_source_fingerprint,reconciliation_fingerprint,
      lease_set_fingerprint,supabase_match_revisions,google_checkpoints,
      external_fence_evidence_id,google_writer_provider_fence_id,
      google_writer_provider_verification_id,close_request_fingerprint,
      close_payload_hash,closed_at,consumed_at,actor_id,consumed_epoch_id
    ) values (
      '00000000-0000-4000-8000-000000000030','LEGACY_ADMISSION','2026','GOOGLE',
      '00000000-0000-4000-8000-000000000010',
      '00000000-0000-4000-8000-000000000020','dpl_CurrentRelease069',
      'CONSUMED',1,2,3,0,repeat('1',64),repeat('2',64),repeat('3',64),
      repeat('4',64),'{}','{}','00000000-0000-4000-8000-000000000040',
      '00000000-0000-4000-8000-000000000041',
      '00000000-0000-4000-8000-000000000042',repeat('5',64),repeat('6',64),
      now(),now(),'CB01','00000000-0000-4000-8000-000000000010');
    insert into scoring_authority.ingress_gates values(
      '2026','OPEN','SUPABASE','CLOSED',
      '00000000-0000-4000-8000-000000000010',
      '00000000-0000-4000-8000-000000000020',10,
      'dpl_CurrentRelease069','00000000-0000-4000-8000-000000000030',
      '00000000-0000-4000-8000-000000000040',now(),0,'CB01',now());
    insert into production_control.maintenance_deployment_capability_bindings
      values('00000000-0000-4000-8000-000000000050',
        '00000000-0000-4000-8000-000000000010','dpl_CurrentRelease069',
        repeat('a',40),'production-maintenance-single-deployment-capability-v1',
        'OBSERVATION','{}',encode(extensions.digest('{}'::jsonb::text,'sha256'),'hex'));
    insert into production_control.postcutover_application_release_rebindings
      values('BAGGER_INV_PRODUCTION','00000000-0000-4000-8000-000000000050',
        'dpl_CurrentRelease069',repeat('a',40),
        'production-maintenance-single-deployment-capability-v1','OBSERVATION');
    insert into production_control.worker_controls values
      ('SCORING_GOOGLE_OUTBOX',true,true,jsonb_build_object(
        'activation_epoch_id','00000000-0000-4000-8000-000000000010',
        'deployment_commit',repeat('a',40))),
      ('ROUND_SCORECARDS_ARCHIVE',true,true,jsonb_build_object(
        'activation_epoch_id','00000000-0000-4000-8000-000000000010',
        'deployment_commit',repeat('a',40)));
    insert into production_control.worker_contracts values
      ('SCORING_GOOGLE_OUTBOX',true,true,false),
      ('ROUND_SCORECARDS_ARCHIVE',true,true,false);
    insert into scoring_authority.matches(match_id,tournament_id,status,
      scorecard_complete,unresolved_mutations) values
      ('2026-R1-1','2026','FINAL',true,0);
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

test("migration 069 installs inert annual scoring authority and preserves current release rebinding", async (t) => {
  if (!(await available())) return t.skip("PostgreSQL 17 binaries unavailable");
  const cluster = await createCluster();
  t.after(() => destroyCluster(cluster));
  const database = "step13e7b_annual_scoring";
  run(bin.createdb, [database], { env: environment(cluster) });
  fixture(cluster, database);
  for (const migration of migrations.slice(0, 4)) sqlFile(cluster, database, migration);
  annualFixture(cluster, database);
  const before = sql(cluster, database, `select concat_ws('|',
    (select tournament_id from production_control.current_tournament_pointer_v1
      where scope_key='BAGGER_INV_PRODUCTION'),
    (select pointer_revision from production_control.current_tournament_pointer_v1
      where scope_key='BAGGER_INV_PRODUCTION'),
    (select state from scoring_authority.ingress_gates where tournament_id='2026'),
    (select count(*) from production_control.future_annual_runtime_generations_v1));`);
  sqlFile(cluster, database, migrations[4]);
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select tournament_id from production_control.current_tournament_pointer_v1
      where scope_key='BAGGER_INV_PRODUCTION'),
    (select pointer_revision from production_control.current_tournament_pointer_v1
      where scope_key='BAGGER_INV_PRODUCTION'),
    (select state from scoring_authority.ingress_gates where tournament_id='2026'),
    (select count(*) from production_control.future_annual_runtime_generations_v1));`), before);
  assert.equal(before, "2026|1|OPEN|0");

  assert.equal(sql(cluster, database, `select concat_ws('|',
    has_function_privilege('service_role',
      'public.close_production_annual_scoring_transition_v1(jsonb)','EXECUTE'),
    has_function_privilege('service_role',
      'public.drain_production_annual_scoring_transition_v1(jsonb)','EXECUTE'),
    has_function_privilege('authenticated',
      'public.close_production_annual_scoring_transition_v1(jsonb)','EXECUTE'),
    has_function_privilege('anon',
      'public.drain_production_annual_scoring_transition_v1(jsonb)','EXECUTE'),
    has_function_privilege('service_role',
      'public.future_production_submit_hole_score_v1(jsonb)','EXECUTE'));`),
  "t|t|f|f|f");
  for (const unsafeAction of ["ACTIVATE_TOURNAMENT", "CLOSE_TOURNAMENT"]) {
    assert.equal(sql(cluster, database, `do $test$ begin
      perform public.mutate_production_future_runtime_v2(
        jsonb_build_object('action','${unsafeAction}'));
      raise exception 'EXPECTED_UNSAFE_SPLIT_ACTION_REJECTION';
    exception when sqlstate '55000' then
      if sqlerrm <> 'PRODUCTION_ANNUAL_SCORING_TRANSITION_REQUIRED' then
        raise; end if;
    end $test$; select 'unsafe-split-action-rejected';`),
    "unsafe-split-action-rejected");
  }

  const inputA = `jsonb_build_object(
    'environment','PRODUCTION','project_ref','ymqhhtxaywtqllynrmxe',
    'project_url','https://ymqhhtxaywtqllynrmxe.supabase.co',
    'source_workbook_id','workbook-production','tournament_id','2026',
    'deployment_id','dpl_CurrentRelease069','deployment_commit',repeat('a',40),
    'deployment_capability_contract',
      'production-maintenance-single-deployment-capability-v1',
    'deployment_capability_ceiling','OBSERVATION',
    'expected_epoch_id','00000000-0000-4000-8000-000000000010')`;
  assert.equal(sql(cluster, database, `select concat_ws('|', result->>'ok',
    result->>'contractVersion', result->>'platformTournamentId')
    from (select public.read_production_scoring_dispatch_certification_v1(
      ${inputA}) result) value;`),
  "true|production-annual-scoring-platform-certification-v1|2026");

  sql(cluster, database, `update production_control.postcutover_application_release_rebindings
      set deployment_id='dpl_NextRelease069',deployment_commit=repeat('b',40)
      where scope_key='BAGGER_INV_PRODUCTION';
    update production_control.maintenance_deployment_capability_bindings
      set deployment_id='dpl_NextRelease069',deployment_commit=repeat('b',40)
      where capability_binding_id='00000000-0000-4000-8000-000000000050';
    update production_control.cutover_activation_state
      set expected_deployment_commit=repeat('b',40)
      where scope_key='BAGGER_INV_PRODUCTION';
    update scoring_authority.ingress_gates
      set admission_deployment_id='dpl_NextRelease069'
      where tournament_id='2026';`);
  const inputB = `jsonb_build_object(
    'environment','PRODUCTION','project_ref','ymqhhtxaywtqllynrmxe',
    'project_url','https://ymqhhtxaywtqllynrmxe.supabase.co',
    'source_workbook_id','workbook-production','tournament_id','2026',
    'deployment_id','dpl_NextRelease069','deployment_commit',repeat('b',40),
    'deployment_capability_contract',
      'production-maintenance-single-deployment-capability-v1',
    'deployment_capability_ceiling','OBSERVATION',
    'expected_epoch_id','00000000-0000-4000-8000-000000000010')`;
  assert.equal(sql(cluster, database, `select
    production_control.assert_production_scoring_runtime(${inputB},null);`), "");
  assert.equal(sql(cluster, database, `do $test$ begin
    perform production_control.assert_production_scoring_runtime(${inputA},null);
    raise exception 'EXPECTED_REJECTION';
  exception when sqlstate '55000' then
    if sqlerrm <> 'PRODUCTION_ANNUAL_SCORING_CURRENT_RELEASE_REQUIRED' then
      raise; end if;
  end $test$; select 'stale-release-rejected';`), "stale-release-rejected");

  sql(cluster, database, `insert into scoring_authority.tournaments(
      tournament_id,tournament_year,name,source_workbook_id,scoring_authority
    ) values ('2027',2027,'Future Tournament','workbook-production','SUPABASE');
    insert into production_control.future_tournament_catalog_v1(
      tournament_id,tournament_year,contract_version,tournament_name,
      lifecycle,lifecycle_revision,setup_revision,creation_mode,source_manifest
    ) values ('2027',2027,'production-future-year-administration-v1',
      'Future Tournament','CONFIGURING',1,1,'BLANK','{}');
    insert into production_control.future_runtime_promotions_v2(
      tournament_id,contract_version,promotion_revision,source_setup_revision,
      promoted_manifest_fingerprint,runtime_status,promoted_by_player_id,
      promoted_by_auth_user_id
    ) values ('2027','production-future-runtime-activation-v2',1,1,
      repeat('7',64),'PROMOTED','CB01',
      '00000000-0000-4000-8000-000000000001');`);
  const common = {
    contract_version: "production-future-runtime-activation-v2",
    environment: "PRODUCTION",
    project_ref: "ymqhhtxaywtqllynrmxe",
    project_url: "https://ymqhhtxaywtqllynrmxe.supabase.co",
    source_workbook_id: "workbook-production",
    tournament_id: "2026",
    tournament_year: 2026,
    target_tournament_id: "2027",
    expected_current_tournament_id: "2026",
    expected_pointer_revision: 1,
    authorization: {
      tournament_id: "2026",
      auth_user_id: "00000000-0000-4000-8000-000000000001",
      player_id: "CB01",
      role: "DIRECTOR",
    },
  };
  const initialReadiness = jsonRpc(cluster, database,
    "read_production_annual_scoring_transition_readiness_v1", common);
  assert.equal(initialReadiness.ready, false);
  assert.equal(initialReadiness.predecessorCertificate.certified, false);
  assert.deepEqual(initialReadiness.blockers.map((item) => item.code), [
    "FUTURE_PREDECESSOR_SCORING_CLOSE_FENCE_NOT_CERTIFIED",
  ]);
  const prepared = jsonRpc(cluster, database,
    "prepare_production_annual_scoring_transition_v1", annualInput(
      cluster, database, {
        ...common,
        expected_revision: 1,
        readiness_fingerprint: initialReadiness.fingerprint,
        operation_request_id: "10000000-0000-4000-8000-000000000001",
      }));
  assert.equal(prepared.code, "PRODUCTION_ANNUAL_SCORING_TRANSITION_PREPARED");
  assert.equal(prepared.predecessorClosed, false);
  assert.equal(prepared.predecessorAdmissionStopped, false);
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select state from scoring_authority.ingress_gates where tournament_id='2026'),
    (select transition_status from production_control.annual_scoring_transitions_v1
      where transition_id='${prepared.transitionId}'),
    (select tournament_id from production_control.current_tournament_pointer_v1
      where scope_key='BAGGER_INV_PRODUCTION'));`), "OPEN|PREPARED|2026");

  const generation = {
    transition_id: prepared.transitionId,
    expected_runtime_generation_id: prepared.runtimeGenerationId,
    expected_annual_authority_generation_id: prepared.authorityGenerationId,
    expected_annual_admission_generation_id: prepared.admissionGenerationId,
  };
  const closing = jsonRpc(cluster, database,
    "close_production_annual_scoring_transition_v1", annualInput(
      cluster, database, {
        ...common,
        ...generation,
        expected_platform_activation_revision: 1,
        expected_platform_authority_generation_id:
          "00000000-0000-4000-8000-000000000010",
        expected_platform_admission_generation_id:
          "00000000-0000-4000-8000-000000000020",
        expected_platform_admission_revision: 10,
        start_source_fingerprint: "1".repeat(64),
        final_source_fingerprint: "2".repeat(64),
        reconciliation_fingerprint: "3".repeat(64),
        operation_request_id: "10000000-0000-4000-8000-000000000002",
      }));
  assert.equal(closing.code,
    "PRODUCTION_ANNUAL_SCORING_PREDECESSOR_CLOSING");
  assert.equal(closing.predecessorAdmissionStopped, true);
  assert.equal(closing.predecessorClosed, false);
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select state from scoring_authority.ingress_gates where tournament_id='2026'),
    (select transition_status from production_control.annual_scoring_transitions_v1
      where transition_id='${prepared.transitionId}'),
    (select tournament_id from production_control.current_tournament_pointer_v1
      where scope_key='BAGGER_INV_PRODUCTION'));`), "PAUSED|CLOSING|2026");

  const drained = jsonRpc(cluster, database,
    "drain_production_annual_scoring_transition_v1", annualInput(
      cluster, database, {
        ...common,
        ...generation,
        final_source_fingerprint: "2".repeat(64),
        reconciliation_fingerprint: "3".repeat(64),
        operation_request_id: "10000000-0000-4000-8000-000000000003",
      }));
  assert.equal(drained.code, "PRODUCTION_ANNUAL_SCORING_PREDECESSOR_CLOSED");
  assert.equal(drained.predecessorClosed, true);
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select state from scoring_authority.ingress_gates where tournament_id='2026'),
    (select transition_status from production_control.annual_scoring_transitions_v1
      where transition_id='${prepared.transitionId}'),
    (select tournament_id from production_control.current_tournament_pointer_v1
      where scope_key='BAGGER_INV_PRODUCTION'));`), "PAUSED|CLOSED|2026");

  const [activationRevision, admissionRevision] = sql(cluster, database,
    `select concat_ws('|',
      (select activation_revision from production_control.cutover_activation_state
        where scope_key='BAGGER_INV_PRODUCTION'),
      (select admission_revision from scoring_authority.ingress_gates
        where tournament_id='2026'));`).split("|").map(Number);
  const aborted = jsonRpc(cluster, database,
    "abort_production_annual_scoring_transition_v1", annualInput(
      cluster, database, {
        ...common,
        ...generation,
        expected_platform_activation_revision: activationRevision,
        expected_platform_authority_generation_id:
          "00000000-0000-4000-8000-000000000010",
        expected_platform_admission_generation_id:
          "00000000-0000-4000-8000-000000000020",
        expected_platform_admission_revision: admissionRevision,
        operation_request_id: "10000000-0000-4000-8000-000000000004",
      }));
  assert.equal(aborted.code, "PRODUCTION_ANNUAL_SCORING_PRECOMMIT_ABORTED_SAFE");
  assert.equal(aborted.predecessorWasClosed, true);
  assert.equal(aborted.predecessorAdmissionReopened, true);
  assert.equal(aborted.requiresExplicitAdmissionRecovery, false);
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select state from scoring_authority.ingress_gates where tournament_id='2026'),
    (select transition_status from production_control.annual_scoring_transitions_v1
      where transition_id='${prepared.transitionId}'),
    (select generation_status from production_control.future_annual_runtime_generations_v1
      where runtime_generation_id='${prepared.runtimeGenerationId}'),
    (select tournament_id from production_control.current_tournament_pointer_v1
      where scope_key='BAGGER_INV_PRODUCTION'));`),
  "OPEN|ABORTED|ABORTED|2026");

  const writer = lockedPointerWriter(cluster, database, `begin;
    select pg_advisory_xact_lock(production_control.scoring_admission_lock_key());
    update production_control.current_tournament_pointer_v1
      set tournament_id='2027',tournament_year=2027,pointer_revision=2
      where scope_key='BAGGER_INV_PRODUCTION';
    select 'LOCKED'; select pg_sleep(1); commit;`);
  await writer.locked;
  const staleReader = sqlAsync(cluster, database, `do $test$ begin
    perform production_control.assert_production_scoring_runtime(${inputB},null);
    raise exception 'EXPECTED_STALE_ADMISSION_REJECTION';
  exception when sqlstate '40001' then
    if sqlerrm <> 'PRODUCTION_LEGACY_SCORING_POINTER_CHANGED' then raise; end if;
  end $test$; select 'stale-pre-switch-admission-rejected';`);
  const [writerResult, readerResult] = await Promise.all([
    writer.completed, staleReader,
  ]);
  assert.match(writerResult, /LOCKED/);
  assert.equal(readerResult, "stale-pre-switch-admission-rejected");

  // Restore only the disposable race fixture pointer. The rejected legacy
  // session observed the committed future pointer after waiting on the common
  // lock; a fresh, coherent transition below exercises the real atomic CAS.
  sql(cluster, database, `update production_control.current_tournament_pointer_v1
    set tournament_id='2026',tournament_year=2026,pointer_revision=1,
      lifecycle_revision=1
    where scope_key='BAGGER_INV_PRODUCTION';`);

  const retryRevision = Number(sql(cluster, database, `select lifecycle_revision
    from production_control.future_tournament_catalog_v1
    where tournament_id='2027';`));
  const retryReadiness = jsonRpc(cluster, database,
    "read_production_annual_scoring_transition_readiness_v1", common);
  assert.deepEqual(retryReadiness.blockers.map((item) => item.code), [
    "FUTURE_PREDECESSOR_SCORING_CLOSE_FENCE_NOT_CERTIFIED",
  ]);
  const preparedForCommit = jsonRpc(cluster, database,
    "prepare_production_annual_scoring_transition_v1", annualInput(
      cluster, database, {
        ...common,
        expected_revision: retryRevision,
        readiness_fingerprint: retryReadiness.fingerprint,
        operation_request_id: "10000000-0000-4000-8000-000000000011",
      }));
  const commitGeneration = {
    transition_id: preparedForCommit.transitionId,
    expected_runtime_generation_id: preparedForCommit.runtimeGenerationId,
    expected_annual_authority_generation_id:
      preparedForCommit.authorityGenerationId,
    expected_annual_admission_generation_id:
      preparedForCommit.admissionGenerationId,
  };
  const [retryActivationRevision, retryAdmissionRevision] = sql(
    cluster, database, `select concat_ws('|',
      (select activation_revision from production_control.cutover_activation_state
        where scope_key='BAGGER_INV_PRODUCTION'),
      (select admission_revision from scoring_authority.ingress_gates
        where tournament_id='2026'));`,
  ).split("|").map(Number);
  jsonRpc(cluster, database, "close_production_annual_scoring_transition_v1",
    annualInput(cluster, database, {
      ...common,
      ...commitGeneration,
      expected_platform_activation_revision: retryActivationRevision,
      expected_platform_authority_generation_id:
        "00000000-0000-4000-8000-000000000010",
      expected_platform_admission_generation_id:
        "00000000-0000-4000-8000-000000000020",
      expected_platform_admission_revision: retryAdmissionRevision,
      start_source_fingerprint: "a".repeat(64),
      final_source_fingerprint: "b".repeat(64),
      reconciliation_fingerprint: "c".repeat(64),
      operation_request_id: "10000000-0000-4000-8000-000000000012",
    }));
  jsonRpc(cluster, database, "drain_production_annual_scoring_transition_v1",
    annualInput(cluster, database, {
      ...common,
      ...commitGeneration,
      final_source_fingerprint: "b".repeat(64),
      reconciliation_fingerprint: "c".repeat(64),
      operation_request_id: "10000000-0000-4000-8000-000000000013",
    }));

  // A real certification operation is intentionally not installed by 069 or
  // 071. This disposable test fixture represents a separately authorized,
  // already-certified annual Google target and identity binder.
  sql(cluster, database, `
    create table production_control.future_google_writer_targets_v2(
      tournament_id text primary key,
      writer_generation_id uuid not null,
      destination_workbook_id text not null,
      target_contract_fingerprint text not null,
      contract_status text not null
    );
    insert into production_control.future_google_writer_targets_v2 values(
      '2027','50000000-0000-4000-8000-000000000005','workbook-2027',
      repeat('d',64),'CERTIFIED'
    );
    create table production_control.identity_bind_calls(
      tournament_id text, runtime_generation_id uuid,
      authority_generation_id uuid, admission_generation_id uuid
    );
    create function
      production_control.bind_future_participant_identity_runtime_v1(
        target_tournament_id text, expected_runtime_generation_id uuid,
        expected_authority_generation_id uuid,
        expected_admission_generation_id uuid, actor_player_id text,
        actor_auth_user_id uuid
      ) returns jsonb language plpgsql security definer
      set search_path=pg_catalog as $identity$
      begin
        insert into production_control.identity_bind_calls values(
          target_tournament_id, expected_runtime_generation_id,
          expected_authority_generation_id, expected_admission_generation_id
        );
        return pg_catalog.jsonb_build_object('ok',true);
      end $identity$;
  `);
  const activationBase = {
    ...common,
    ...commitGeneration,
    expected_google_writer_generation_id:
      "50000000-0000-4000-8000-000000000005",
    annual_destination_workbook_id: "workbook-2027",
    expected_google_target_contract_fingerprint: "d".repeat(64),
  };
  const badActivation = annualInput(cluster, database, {
    ...activationBase,
    expected_google_writer_generation_id:
      "50000000-0000-4000-8000-000000000099",
    operation_request_id: "10000000-0000-4000-8000-000000000014",
  });
  assert.equal(sql(cluster, database, `do $test$ begin
    perform public.activate_production_annual_scoring_transition_v1(
      ${sqlLiteral(badActivation)});
    raise exception 'EXPECTED_PRECOMMIT_REJECTION';
  exception when sqlstate '55000' then
    if sqlerrm <> 'PRODUCTION_ANNUAL_GOOGLE_DESTINATION_REQUIRED' then
      raise; end if;
  end $test$; select concat_ws('|',
    (select tournament_id from production_control.current_tournament_pointer_v1
      where scope_key='BAGGER_INV_PRODUCTION'),
    (select transition_status from production_control.annual_scoring_transitions_v1
      where transition_id='${preparedForCommit.transitionId}'),
    (select generation_status from production_control.future_annual_runtime_generations_v1
      where runtime_generation_id='${preparedForCommit.runtimeGenerationId}'),
    (select lifecycle from production_control.future_tournament_catalog_v1
      where tournament_id='2026'),
    (select lifecycle from production_control.future_tournament_catalog_v1
      where tournament_id='2027'));`),
  "2026|CLOSED|PREPARED|ACTIVE|READY_FOR_ACTIVATION");

  const activateInput = annualInput(cluster, database, {
    ...activationBase,
    operation_request_id: "10000000-0000-4000-8000-000000000015",
  });
  const activated = jsonRpc(cluster, database,
    "activate_production_annual_scoring_transition_v1", activateInput);
  assert.equal(activated.code,
    "PRODUCTION_ANNUAL_SCORING_TRANSITION_COMMITTED");
  assert.equal(activated.pointerChanged, true);
  assert.equal(activated.predecessorClosed, true);
  assert.equal(activated.successorActivated, true);
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select tournament_id from production_control.current_tournament_pointer_v1
      where scope_key='BAGGER_INV_PRODUCTION'),
    (select pointer_revision from production_control.current_tournament_pointer_v1
      where scope_key='BAGGER_INV_PRODUCTION'),
    (select lifecycle from production_control.future_tournament_catalog_v1
      where tournament_id='2026'),
    (select lifecycle from production_control.future_tournament_catalog_v1
      where tournament_id='2027'),
    (select transition_status from production_control.annual_scoring_transitions_v1
      where transition_id='${preparedForCommit.transitionId}'),
    (select generation_status from production_control.future_annual_runtime_generations_v1
      where runtime_generation_id='${preparedForCommit.runtimeGenerationId}'),
    (select concat_ws(':',authority_status,admission_state,
       google_writer_generation_id,destination_workbook_id)
       from production_control.annual_scoring_runtime_authorities_v1
       where tournament_id='2027'),
    (select count(*) from production_control.identity_bind_calls));`),
  "2027|2|CLOSED|ACTIVE|COMMITTED|ACTIVE|ACTIVE:OPEN:" +
    "50000000-0000-4000-8000-000000000005:workbook-2027|1");
  const committedState = sql(cluster, database, `select concat_ws('|',
    (select tournament_id from production_control.current_tournament_pointer_v1
      where scope_key='BAGGER_INV_PRODUCTION'),
    (select pointer_revision from production_control.current_tournament_pointer_v1
      where scope_key='BAGGER_INV_PRODUCTION'),
    (select lifecycle_revision from production_control.future_tournament_catalog_v1
      where tournament_id='2026'),
    (select lifecycle_revision from production_control.future_tournament_catalog_v1
      where tournament_id='2027'),
    (select count(*) from production_control.annual_scoring_runtime_authorities_v1
      where tournament_id='2027'),
    (select count(*) from production_control.identity_bind_calls),
    (select count(*) from production_control.annual_scoring_transition_receipts_v1
      where operation='ACTIVATE'
        and operation_request_id='10000000-0000-4000-8000-000000000015'));`);
  const replayed = jsonRpc(cluster, database,
    "activate_production_annual_scoring_transition_v1", activateInput);
  assert.equal(replayed.idempotent, true);
  assert.equal(replayed.transitionId, activated.transitionId);
  assert.equal(replayed.pointerRevision, activated.pointerRevision);
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select tournament_id from production_control.current_tournament_pointer_v1
      where scope_key='BAGGER_INV_PRODUCTION'),
    (select pointer_revision from production_control.current_tournament_pointer_v1
      where scope_key='BAGGER_INV_PRODUCTION'),
    (select lifecycle_revision from production_control.future_tournament_catalog_v1
      where tournament_id='2026'),
    (select lifecycle_revision from production_control.future_tournament_catalog_v1
      where tournament_id='2027'),
    (select count(*) from production_control.annual_scoring_runtime_authorities_v1
      where tournament_id='2027'),
    (select count(*) from production_control.identity_bind_calls),
    (select count(*) from production_control.annual_scoring_transition_receipts_v1
      where operation='ACTIVATE'
        and operation_request_id='10000000-0000-4000-8000-000000000015'));`),
  committedState);
  assert.throws(() => jsonRpc(cluster, database,
    "activate_production_annual_scoring_transition_v1", annualInput(
      cluster, database, {
        ...activationBase,
        reason: "Conflicting annual activation replay fixture",
        operation_request_id: "10000000-0000-4000-8000-000000000015",
      })), /PRODUCTION_ANNUAL_SCORING_IDEMPOTENCY_CONFLICT/);
  assert.equal(sql(cluster, database, `select
    ((select count(*) from scoring_authority.ingress_gates
       where tournament_id='2026' and state='OPEN') +
     (select count(*) from production_control.annual_scoring_runtime_authorities_v1
       where authority_status='ACTIVE' and admission_state='OPEN'))::text;`), "1");

  const futureAdmission = {
    ...JSON.parse(sql(cluster, database, `select ${inputB}::text;`)),
    annual_scoring_dispatch_contract: "production-annual-scoring-dispatch-v1",
    annual_scoring_operation: "finalize_production_match",
    expected_current_tournament_id: "2027",
    expected_pointer_revision: 2,
    expected_runtime_generation_id: preparedForCommit.runtimeGenerationId,
    expected_annual_authority_generation_id:
      preparedForCommit.authorityGenerationId,
    expected_annual_admission_generation_id:
      preparedForCommit.admissionGenerationId,
    expected_google_writer_generation_id:
      "50000000-0000-4000-8000-000000000005",
    annual_destination_workbook_id: "workbook-2027",
    expected_google_target_contract_fingerprint: "d".repeat(64),
  };
  assert.equal(sql(cluster, database, `select
    production_control.assert_annual_scoring_runtime_v1(
      ${sqlLiteral(futureAdmission)},'finalize_production_match',null);`),
  "2027");

  const dispatched2027 = JSON.parse(sql(cluster, database, `begin;
    set local role service_role;
    select public.dispatch_production_annual_scoring_v1(
      ${sqlLiteral({
        ...futureAdmission,
        annual_scoring_operation: "read_production_scoring_authority",
        mode: "DIAGNOSTICS",
      })}
    )::text; commit;`));
  assert.equal(dispatched2027.ok, true);
  assert.equal(dispatched2027.data.authority, "SUPABASE");
  assert.equal(dispatched2027.data.ingress.tournament_id, "2027");
  assert.throws(() => sql(cluster, database, `begin;
    set local role service_role;
    select public.dispatch_production_annual_scoring_v1(
      ${sqlLiteral({
        ...futureAdmission,
        annual_scoring_operation: "read_production_scoring_authority",
        expected_current_tournament_id: "2028",
        mode: "DIAGNOSTICS",
      })}
    ); rollback;`), /PRODUCTION_ANNUAL_SCORING_RUNTIME_REQUIRED/);

  // Exercise a second real annual handoff. This proves that annual Owner
  // authorization, predecessor fencing, runtime generation creation and the
  // pointer CAS are not accidentally frozen to the original 2026 root.
  sql(cluster, database, `
    insert into scoring_authority.tournaments(
      tournament_id,tournament_year,name,source_workbook_id,scoring_authority
    ) values ('2028',2028,'Second Future Tournament',
      'workbook-production','SUPABASE');
    insert into production_control.future_tournament_catalog_v1(
      tournament_id,tournament_year,contract_version,tournament_name,
      lifecycle,lifecycle_revision,setup_revision,creation_mode,source_manifest
    ) values ('2028',2028,'production-future-year-administration-v1',
      'Second Future Tournament','CONFIGURING',1,1,'BLANK','{}');
    insert into production_control.future_runtime_promotions_v2(
      tournament_id,contract_version,promotion_revision,source_setup_revision,
      promoted_manifest_fingerprint,runtime_status,promoted_by_player_id,
      promoted_by_auth_user_id
    ) values ('2028','production-future-runtime-activation-v2',1,1,
      repeat('8',64),'PROMOTED','CB01',
      '00000000-0000-4000-8000-000000000001');
    insert into production_control.future_google_writer_targets_v2 values(
      '2028','50000000-0000-4000-8000-000000000008','workbook-2028',
      repeat('e',64),'CERTIFIED'
    );
    set session_replication_role=replica;
    insert into scoring_authority.matches(
      match_id,tournament_id,status,scorecard_complete,unresolved_mutations
    ) values ('2027-R1-1','2027','FINAL',true,0);
    set session_replication_role=origin;
  `);
  const secondCommon = {
    ...common,
    target_tournament_id: "2028",
    expected_current_tournament_id: "2027",
    expected_pointer_revision: 2,
  };
  const secondReadiness = jsonRpc(cluster, database,
    "read_production_annual_scoring_transition_readiness_v1", secondCommon);
  assert.equal(secondReadiness.ready, false, JSON.stringify(secondReadiness));
  assert.deepEqual(secondReadiness.blockers.map((item) => item.code), [
    "FUTURE_PREDECESSOR_SCORING_CLOSE_FENCE_NOT_CERTIFIED",
  ]);
  const secondPrepared = jsonRpc(cluster, database,
    "prepare_production_annual_scoring_transition_v1", annualInput(
      cluster, database, {
        ...secondCommon,
        expected_revision: 1,
        readiness_fingerprint: secondReadiness.fingerprint,
        operation_request_id: "10000000-0000-4000-8000-000000000021",
      }));
  const secondGeneration = {
    transition_id: secondPrepared.transitionId,
    expected_runtime_generation_id: secondPrepared.runtimeGenerationId,
    expected_annual_authority_generation_id:
      secondPrepared.authorityGenerationId,
    expected_annual_admission_generation_id:
      secondPrepared.admissionGenerationId,
  };
  const predecessorAnnualRevision = Number(sql(cluster, database, `select
    admission_revision from production_control.annual_scoring_runtime_authorities_v1
    where tournament_id='2027';`));
  jsonRpc(cluster, database, "close_production_annual_scoring_transition_v1",
    annualInput(cluster, database, {
      ...secondCommon,
      ...secondGeneration,
      expected_predecessor_runtime_generation_id:
        preparedForCommit.runtimeGenerationId,
      expected_predecessor_annual_authority_generation_id:
        preparedForCommit.authorityGenerationId,
      expected_predecessor_annual_admission_generation_id:
        preparedForCommit.admissionGenerationId,
      expected_predecessor_annual_admission_revision:
        predecessorAnnualRevision,
      start_source_fingerprint: "4".repeat(64),
      final_source_fingerprint: "5".repeat(64),
      reconciliation_fingerprint: "6".repeat(64),
      operation_request_id: "10000000-0000-4000-8000-000000000022",
    }));
  assert.equal(sql(cluster, database, `select concat_ws('|',
    transition.transition_status,
    pointer.tournament_id,
    pointer.pointer_revision,
    target.lifecycle,
    generation.generation_status,
    closure.status,
    annual.authority_status,
    annual.admission_state,
    (select count(*) from production_control.scoring_admission_closures root
      where root.closure_id=annual.legacy_root_closure_id))
    from production_control.annual_scoring_transitions_v1 transition
    join production_control.current_tournament_pointer_v1 pointer
      on pointer.scope_key='BAGGER_INV_PRODUCTION'
    join production_control.future_tournament_catalog_v1 target
      on target.tournament_id=transition.successor_tournament_id
    join production_control.future_annual_runtime_generations_v1 generation
      on generation.runtime_generation_id=transition.runtime_generation_id
    join production_control.scoring_admission_closures closure
      on closure.closure_id=transition.predecessor_closure_id
    join production_control.annual_scoring_runtime_authorities_v1 annual
      on annual.tournament_id=transition.predecessor_tournament_id
    where transition.transition_id='${secondPrepared.transitionId}';`),
  "CLOSING|2027|2|READY_FOR_ACTIVATION|PREPARED|CLOSING|ACTIVE|CLOSING|1");
  const secondDrained = jsonRpc(cluster, database,
    "drain_production_annual_scoring_transition_v1", annualInput(
      cluster, database, {
        ...secondCommon,
        ...secondGeneration,
        final_source_fingerprint: "5".repeat(64),
        reconciliation_fingerprint: "6".repeat(64),
        operation_request_id: "10000000-0000-4000-8000-000000000023",
      }));
  assert.equal(secondDrained.predecessorClosed, true);
  const secondActivationInput = annualInput(cluster, database, {
    ...secondCommon,
    ...secondGeneration,
    expected_google_writer_generation_id:
      "50000000-0000-4000-8000-000000000008",
    annual_destination_workbook_id: "workbook-2028",
    expected_google_target_contract_fingerprint: "e".repeat(64),
    operation_request_id: "10000000-0000-4000-8000-000000000024",
  });
  const secondActivated = jsonRpc(cluster, database,
    "activate_production_annual_scoring_transition_v1",
    secondActivationInput);
  assert.equal(secondActivated.successorTournamentId, "2028");
  assert.equal(secondActivated.pointerRevision, 3);
  assert.equal(sql(cluster, database, `select concat_ws('|',
    (select tournament_id from production_control.current_tournament_pointer_v1
      where scope_key='BAGGER_INV_PRODUCTION'),
    (select pointer_revision from production_control.current_tournament_pointer_v1
      where scope_key='BAGGER_INV_PRODUCTION'),
    (select lifecycle from production_control.future_tournament_catalog_v1
      where tournament_id='2027'),
    (select lifecycle from production_control.future_tournament_catalog_v1
      where tournament_id='2028'),
    (select generation_status from production_control.future_annual_runtime_generations_v1
      where runtime_generation_id='${preparedForCommit.runtimeGenerationId}'),
    (select generation_status from production_control.future_annual_runtime_generations_v1
      where runtime_generation_id='${secondPrepared.runtimeGenerationId}'),
    (select count(*) from production_control.identity_bind_calls));`),
  "2028|3|CLOSED|ACTIVE|CLOSED|ACTIVE|2");
  const secondReplay = jsonRpc(cluster, database,
    "activate_production_annual_scoring_transition_v1",
    secondActivationInput);
  assert.equal(secondReplay.idempotent, true);
  assert.equal(secondReplay.pointerRevision, 3);
});
