import assert from "node:assert/strict";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = path.join(root, "supabase/production_migrations",
  "202608300072_production_annual_google_writer_certification_v1.sql");
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
    const error = new Error([command, result.stdout, result.stderr]
      .filter(Boolean).join("\n"));
    error.result = result;
    throw error;
  }
  return result.stdout.trim();
}

function environment(cluster, jwtRole = "service_role") {
  return {
    ...process.env,
    PGHOST: cluster.socket,
    PGPORT: String(cluster.port),
    PGUSER: "postgres",
    PGOPTIONS: `-c request.jwt.claim.role=${jwtRole}`,
  };
}

function sql(cluster, database, input, jwtRole = "service_role") {
  return run(bin.psql, [
    "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", database,
  ], { env: environment(cluster, jwtRole), input });
}

function sqlFile(cluster, database, filename) {
  return run(bin.psql, [
    "-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", database,
    "-f", filename,
  ], { env: environment(cluster) });
}

function json(value) {
  return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
}

function withHash(cluster, database, value) {
  return JSON.parse(sql(cluster, database, `
    select (source.value || pg_catalog.jsonb_build_object(
      'request_payload_hash',
      production_control.future_runtime_hash_v2(source.value)
    ))::text
    from (select ${json(value)} value) source;
  `));
}

function rpc(cluster, database, name, input, jwtRole = "service_role") {
  return JSON.parse(sql(cluster, database,
    `select public.${name}(${json(input)})::text;`, jwtRole));
}

function failure(cluster, database, name, input, jwtRole = "service_role") {
  assert.throws(() => rpc(cluster, database, name, input, jwtRole),
    (error) => Boolean(error?.message));
  try {
    rpc(cluster, database, name, input, jwtRole);
  } catch (error) {
    return error.message;
  }
  return "";
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
  const directory = await mkdtemp("/tmp/bagger-annual-google-cert-pg-");
  const data = path.join(directory, "data");
  const socket = path.join(directory, "socket");
  const log = path.join(directory, "postgres.log");
  await mkdir(socket, { mode: 0o700 });
  run(bin.initdb, [
    "-D", data, "--username=postgres", "--auth=trust", "--no-locale",
    "--encoding=UTF8", "-c", "shared_memory_type=mmap",
    "-c", "dynamic_shared_memory_type=mmap",
  ]);
  const port = 57200 + (process.pid % 500);
  run(bin.pg_ctl, [
    "-D", data, "-l", log, "-o", `-F -k ${socket} -h '' -p ${port}`,
    "-w", "start",
  ]);
  return { directory, data, socket, log, port, started: true };
}

async function destroyCluster(cluster) {
  if (cluster?.started) {
    run(bin.pg_ctl, ["-D", cluster.data, "-m", "fast", "-w", "stop"]);
  }
  if (cluster?.directory) {
    await rm(cluster.directory, { recursive: true, force: true });
  }
}

const owner = {
  playerId: "CB01",
  authUserId: "00000000-0000-4000-8000-000000000001",
};
const director = {
  playerId: "CB02",
  authUserId: "00000000-0000-4000-8000-000000000002",
};

function operationId(number) {
  return `70000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
}

function input(actor, action, number, overrides = {}) {
  return {
    action,
    contract_version: "production-future-runtime-activation-v2",
    environment: "PRODUCTION",
    project_ref: "ymqhhtxaywtqllynrmxe",
    project_url: "https://ymqhhtxaywtqllynrmxe.supabase.co",
    source_workbook_id: "workbook-production",
    tournament_id: "2026",
    tournament_year: 2026,
    target_tournament_id: "2027",
    expected_resource_revision: 1,
    expected_setup_revision: 4,
    operation_request_id: operationId(number),
    reason: "Authorized annual Google writer certification",
    authorization: {
      tournament_id: "2026",
      player_id: actor.playerId,
      auth_user_id: actor.authUserId,
      role: "DIRECTOR",
    },
    ...overrides,
  };
}

function installFixture(cluster, database) {
  sql(cluster, database, String.raw`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create schema extensions;
    create extension pgcrypto with schema extensions;
    create schema auth;
    create schema scoring_authority;
    create schema production_control;

    create table auth.users(id uuid primary key);
    create table scoring_authority.players(player_id text primary key);
    create table production_control.resource_scope(
      scope_key text primary key, project_ref text not null,
      project_url text not null, google_workbook_id text not null,
      current_tournament_id text not null, current_tournament_year integer not null
    );
    create table production_control.future_tournament_catalog_v1(
      tournament_id text primary key, tournament_year integer not null,
      lifecycle text not null, setup_revision bigint not null
    );
    create table production_control.current_tournament_pointer_v1(
      scope_key text primary key, tournament_id text not null,
      tournament_year integer not null, pointer_revision bigint not null,
      lifecycle_revision bigint not null
    );
    create table production_control.future_tournament_resources_v1(
      tournament_id text primary key references
        production_control.future_tournament_catalog_v1(tournament_id),
      project_ref text not null, project_url text not null,
      source_workbook_id text, resource_status text not null,
      resource_revision bigint not null,
      google_compatibility_policy text not null,
      updated_by_player_id text, updated_at timestamptz default now()
    );
    create table production_control.future_runtime_promotions_v2(
      tournament_id text primary key references
        production_control.future_tournament_catalog_v1(tournament_id),
      contract_version text not null, promotion_revision bigint not null,
      source_setup_revision bigint not null,
      promoted_manifest_fingerprint text not null,
      runtime_status text not null, promoted_by_player_id text not null,
      promoted_by_auth_user_id uuid not null,
      promoted_at timestamptz default now(), updated_at timestamptz default now()
    );
    create table production_control.future_google_writer_generations_v2(
      writer_generation_id uuid primary key default extensions.gen_random_uuid(),
      contract_version text not null,
      destination_workbook_id text not null,
      implementation_fingerprint text not null,
      certification_status text not null,
      certified_at timestamptz default now()
    );
    create unique index production_future_certified_google_writer_destination_v2
      on production_control.future_google_writer_generations_v2(
        destination_workbook_id
      ) where certification_status = 'CERTIFIED';
    alter table production_control.future_google_writer_generations_v2
      enable row level security;
    create table production_control.future_google_writer_targets_v2(
      tournament_id text primary key references
        production_control.future_runtime_promotions_v2(tournament_id),
      writer_generation_id uuid not null references
        production_control.future_google_writer_generations_v2(
          writer_generation_id
        ),
      destination_workbook_id text not null,
      target_contract_fingerprint text not null,
      contract_status text not null,
      certified_at timestamptz default now(), invalidated_at timestamptz
    );
    alter table production_control.future_google_writer_targets_v2
      enable row level security;
    create table production_control.future_runtime_match_bindings_v2(
      tournament_id text not null, match_id text not null,
      structural_setup_revision bigint not null,
      runtime_revision bigint not null, runtime_state text not null,
      configuration_fingerprint text,
      primary key(tournament_id, match_id)
    );
    alter table production_control.future_runtime_match_bindings_v2
      enable row level security;
    create table production_control.future_match_google_compatibility_jobs_v1(
      job_id uuid primary key default extensions.gen_random_uuid(),
      tournament_id text not null, match_id text not null,
      writer_installed boolean not null default false,
      status text not null default 'PROVISIONING_REQUIRED',
      attempts integer not null default 0,
      claim_token uuid, claimed_by text, lease_expires_at timestamptz,
      writer_generation_id uuid,
      destination_workbook_id text,
      target_contract_fingerprint text,
      structural_fingerprint text,
      structural_runtime_revision bigint,
      unique(tournament_id, match_id)
    );
    alter table production_control.future_match_google_compatibility_jobs_v1
      enable row level security;
    create table production_control.director_fixture(
      player_id text primary key, auth_user_id uuid not null
    );
    create table production_control.owner_fixture(
      player_id text primary key, auth_user_id uuid not null
    );

    create function production_control.future_runtime_hash_v2(value jsonb)
    returns text language sql immutable
    set search_path = pg_catalog, extensions as $$
      select pg_catalog.encode(extensions.digest(value::text, 'sha256'), 'hex')
    $$;
    create function production_control.reject_future_runtime_immutable_v2()
    returns trigger language plpgsql
    set search_path = pg_catalog, production_control as $$
    begin
      raise exception using errcode='55000', message='IMMUTABLE';
    end $$;
    create function production_control.assert_access_governance_safe_reason_v1(
      value text
    ) returns void language plpgsql set search_path = pg_catalog as $$
    begin
      if pg_catalog.length(pg_catalog.btrim(coalesce(value, ''))) < 8 then
        raise exception using errcode='22023', message='REASON_REQUIRED';
      end if;
    end $$;
    create function production_control.assert_future_runtime_service_scope_v2(
      input jsonb, require_director boolean default true,
      require_owner boolean default false
    ) returns void language plpgsql security definer
    set search_path = pg_catalog as $$
    declare scope production_control.resource_scope%rowtype;
    begin
      if current_setting('request.jwt.claim.role', true)
           is distinct from 'service_role' then
        raise exception using errcode='42501',
          message='PRODUCTION_FUTURE_RUNTIME_SERVICE_ROLE_REQUIRED';
      end if;
      select value.* into strict scope
      from production_control.resource_scope value
      where value.scope_key='BAGGER_INV_PRODUCTION';
      if input->>'contract_version'
           is distinct from 'production-future-runtime-activation-v2'
         or input->>'environment' is distinct from 'PRODUCTION'
         or input->>'project_ref' is distinct from scope.project_ref
         or input->>'project_url' is distinct from scope.project_url
         or input->>'source_workbook_id'
           is distinct from scope.google_workbook_id then
        raise exception using errcode='42501',
          message='PRODUCTION_FUTURE_RUNTIME_EXACT_RESOURCE_REQUIRED';
      end if;
      if require_director and not exists (
        select 1 from production_control.director_fixture value
        where value.player_id = input#>>'{authorization,player_id}'
          and value.auth_user_id::text =
            input#>>'{authorization,auth_user_id}'
      ) then
        raise exception using errcode='42501',
          message='PRODUCTION_FUTURE_RUNTIME_DIRECTOR_REQUIRED';
      end if;
      if require_owner and not exists (
        select 1 from production_control.owner_fixture value
        where value.player_id = input#>>'{authorization,player_id}'
          and value.auth_user_id::text =
            input#>>'{authorization,auth_user_id}'
      ) then
        raise exception using errcode='42501',
          message='PRODUCTION_FUTURE_RUNTIME_OWNER_REQUIRED';
      end if;
    end $$;
    create function production_control.sync_future_google_writer_job_v2(
      target_tournament text, target_match text
    ) returns void language plpgsql security definer
    set search_path = pg_catalog as $$
    declare target production_control.future_google_writer_targets_v2%rowtype;
    declare binding production_control.future_runtime_match_bindings_v2%rowtype;
    begin
      select value.* into target
      from production_control.future_google_writer_targets_v2 value
      where value.tournament_id=target_tournament
        and value.contract_status='CERTIFIED';
      select value.* into binding
      from production_control.future_runtime_match_bindings_v2 value
      where value.tournament_id=target_tournament
        and value.match_id=target_match;
      update production_control.future_match_google_compatibility_jobs_v1 value
      set writer_installed = target.tournament_id is not null
          and binding.runtime_state='PREPARED',
        writer_generation_id=target.writer_generation_id,
        destination_workbook_id=target.destination_workbook_id,
        target_contract_fingerprint=target.target_contract_fingerprint,
        structural_fingerprint=case when binding.runtime_state='PREPARED'
          then production_control.future_runtime_hash_v2(
            jsonb_build_object('matchId',target_match,
              'runtimeRevision',binding.runtime_revision)) else null end,
        structural_runtime_revision=case when binding.runtime_state='PREPARED'
          then binding.runtime_revision else null end
      where value.tournament_id=target_tournament
        and value.match_id=target_match;
    end $$;

    create function production_control.sync_future_google_writer_binding_v2()
    returns trigger language plpgsql security definer
    set search_path = pg_catalog as $$
    begin
      perform production_control.sync_future_google_writer_job_v2(
        new.tournament_id, new.match_id
      );
      return new;
    end $$;
    create trigger sync_future_google_writer_binding_v2
    after insert or update of runtime_state, runtime_revision,
      structural_setup_revision, configuration_fingerprint
    on production_control.future_runtime_match_bindings_v2
    for each row execute function
      production_control.sync_future_google_writer_binding_v2();

    create function production_control.future_google_match_manifest_v1(
      target_match text
    ) returns jsonb language sql stable security definer
    set search_path = pg_catalog as $$
      select pg_catalog.jsonb_build_object(
        'contractVersion', 'production-future-google-match-provisioning-v1',
        'matchId', target_match
      )
    $$;
    create function production_control.future_google_match_manifest_v2(
      target_match text
    ) returns jsonb language sql stable security definer
    set search_path = pg_catalog as $$
      select production_control.future_google_match_manifest_v1(target_match)
        || pg_catalog.jsonb_build_object(
          'contractVersion',
            'production-future-google-match-provisioning-v2'
        )
    $$;
    create function production_control.assert_future_google_writer_v2(
      input jsonb, require_exact_contract boolean default true
    ) returns text language plpgsql security definer
    set search_path = pg_catalog as $$
    declare target_id text := pg_catalog.btrim(coalesce(
      input->>'target_tournament_id', ''
    ));
    begin
      if target_id = '' or target_id = '2026' then
        raise exception using errcode='55000',
          message='PRODUCTION_FUTURE_GOOGLE_WRITER_CONTRACT_REQUIRED';
      end if;
      return target_id;
    end $$;

    create function public.resolve_production_future_match_google_compatibility_v2(
      input jsonb
    ) returns jsonb language sql stable security definer
    set search_path = pg_catalog as $$
      select pg_catalog.jsonb_build_object('ok', true)
    $$;
    create function public.claim_production_future_match_google_compatibility_v2(
      input jsonb
    ) returns jsonb language sql volatile security definer
    set search_path = pg_catalog as $$
      select pg_catalog.jsonb_build_object('ok', true, 'job', null)
    $$;
    create function public.complete_production_future_match_google_compatibility_v2(
      input jsonb
    ) returns jsonb language sql volatile security definer
    set search_path = pg_catalog as $$
      select pg_catalog.jsonb_build_object('ok', true)
    $$;
    create function public.fail_production_future_match_google_compatibility_v2(
      input jsonb
    ) returns jsonb language sql volatile security definer
    set search_path = pg_catalog as $$
      select pg_catalog.jsonb_build_object('ok', true)
    $$;

    create trigger future_google_writer_generation_immutable_v2
    before update or delete
    on production_control.future_google_writer_generations_v2
    for each row execute function
      production_control.reject_future_runtime_immutable_v2();
    create trigger future_google_writer_target_immutable_v2
    before update or delete
    on production_control.future_google_writer_targets_v2
    for each row execute function
      production_control.reject_future_runtime_immutable_v2();

    revoke all on table
      production_control.future_runtime_match_bindings_v2,
      production_control.future_match_google_compatibility_jobs_v1,
      production_control.future_google_writer_generations_v2,
      production_control.future_google_writer_targets_v2
    from public, anon, authenticated, service_role;
    revoke all on function
      production_control.future_runtime_hash_v2(jsonb),
      production_control.reject_future_runtime_immutable_v2(),
      production_control.sync_future_google_writer_job_v2(text,text),
      production_control.sync_future_google_writer_binding_v2(),
      production_control.future_google_match_manifest_v1(text),
      production_control.future_google_match_manifest_v2(text),
      production_control.assert_future_google_writer_v2(jsonb,boolean),
      public.resolve_production_future_match_google_compatibility_v2(jsonb),
      public.claim_production_future_match_google_compatibility_v2(jsonb),
      public.complete_production_future_match_google_compatibility_v2(jsonb),
      public.fail_production_future_match_google_compatibility_v2(jsonb)
    from public, anon, authenticated, service_role;
    grant execute on function
      public.resolve_production_future_match_google_compatibility_v2(jsonb),
      public.claim_production_future_match_google_compatibility_v2(jsonb),
      public.complete_production_future_match_google_compatibility_v2(jsonb),
      public.fail_production_future_match_google_compatibility_v2(jsonb)
    to service_role;

    insert into auth.users values
      ('00000000-0000-4000-8000-000000000001'),
      ('00000000-0000-4000-8000-000000000002');
    insert into scoring_authority.players values ('CB01'), ('CB02');
    insert into production_control.director_fixture values
      ('CB01','00000000-0000-4000-8000-000000000001'),
      ('CB02','00000000-0000-4000-8000-000000000002');
    insert into production_control.owner_fixture values
      ('CB01','00000000-0000-4000-8000-000000000001');
    insert into production_control.resource_scope values (
      'BAGGER_INV_PRODUCTION','ymqhhtxaywtqllynrmxe',
      'https://ymqhhtxaywtqllynrmxe.supabase.co',
      'workbook-production','2026',2026
    );
    insert into production_control.future_tournament_catalog_v1 values
      ('2026',2026,'ACTIVE',0), ('2027',2027,'DRAFT',4);
    insert into production_control.current_tournament_pointer_v1 values
      ('BAGGER_INV_PRODUCTION','2026',2026,1,1);
    insert into production_control.future_tournament_resources_v1 values
      ('2027','ymqhhtxaywtqllynrmxe',
       'https://ymqhhtxaywtqllynrmxe.supabase.co',null,
       'ANNUAL_RESOURCE_REQUIRED',1,'PROVISIONING_REQUIRED',null,now());
  `);
}

test("annual destination adoption and writer certification are bounded, deterministic, and inert", {
  skip: !(await available()),
  timeout: 120_000,
}, async () => {
  const cluster = await createCluster();
  const database = `annual_google_cert_${process.pid}`;
  try {
    run(bin.createdb, [database], { env: environment(cluster) });
    installFixture(cluster, database);
    sqlFile(cluster, database, migration);

    assert.equal(sql(cluster, database, `select concat_ws('|',
      (select count(*) from production_control.future_google_writer_generations_v2),
      (select count(*) from production_control.future_google_writer_targets_v2),
      (select count(*) from production_control.future_google_writer_certification_receipts_v1),
      (select count(*) from production_control.future_google_writer_certification_audit_v1),
      (select source_workbook_id is null from production_control.future_tournament_resources_v1 where tournament_id='2027'),
      (select resource_revision from production_control.future_tournament_resources_v1 where tournament_id='2027'));
    `), "0|0|0|0|t|1");

    const adoptBase = input(owner, "ADOPT_ANNUAL_GOOGLE_DESTINATION", 1);
    const adopt = withHash(cluster, database, adoptBase);
    assert.match(failure(cluster, database,
      "adopt_production_future_google_destination_v1", adopt, "anon"),
    /PRODUCTION_FUTURE_RUNTIME_SERVICE_ROLE_REQUIRED/);

    const ordinaryDirector = withHash(cluster, database,
      input(director, "ADOPT_ANNUAL_GOOGLE_DESTINATION", 2));
    assert.match(failure(cluster, database,
      "adopt_production_future_google_destination_v1", ordinaryDirector),
    /PRODUCTION_FUTURE_RUNTIME_OWNER_REQUIRED/);

    const arbitraryDestination = withHash(cluster, database, {
      ...input(owner, "ADOPT_ANNUAL_GOOGLE_DESTINATION", 3),
      destination_workbook_id: "preview-attacker-workbook",
    });
    assert.match(failure(cluster, database,
      "adopt_production_future_google_destination_v1", arbitraryDestination),
    /PRODUCTION_FUTURE_GOOGLE_DESTINATION_INPUT_INVALID/);

    const staleAdopt = withHash(cluster, database,
      input(owner, "ADOPT_ANNUAL_GOOGLE_DESTINATION", 4, {
        expected_resource_revision: 2,
      }));
    assert.match(failure(cluster, database,
      "adopt_production_future_google_destination_v1", staleAdopt),
    /PRODUCTION_FUTURE_GOOGLE_DESTINATION_PREDECESSOR_INVALID/);

    sql(cluster, database, `update production_control.current_tournament_pointer_v1
      set tournament_id='2027', tournament_year=2027;`);
    assert.match(failure(cluster, database,
      "adopt_production_future_google_destination_v1", adopt),
    /PRODUCTION_FUTURE_GOOGLE_DESTINATION_PREDECESSOR_INVALID/);
    sql(cluster, database, `update production_control.current_tournament_pointer_v1
      set tournament_id='2026', tournament_year=2026;`);

    const adopted = rpc(cluster, database,
      "adopt_production_future_google_destination_v1", adopt);
    assert.equal(adopted.code,
      "PRODUCTION_FUTURE_GOOGLE_DESTINATION_ADOPTED");
    assert.equal(adopted.resourceRevision, 2);
    assert.equal(adopted.idempotent, false);
    assert.equal(sql(cluster, database, `select concat_ws('|',
      source_workbook_id,resource_status,google_compatibility_policy,
      resource_revision) from production_control.future_tournament_resources_v1
      where tournament_id='2027';`),
    "workbook-production|CURRENT_RESOURCE_BOUND|PROVISIONING_REQUIRED|2");

    const adoptRetry = rpc(cluster, database,
      "adopt_production_future_google_destination_v1", adopt);
    assert.equal(adoptRetry.idempotent, true);
    assert.equal(sql(cluster, database, `select count(*) from
      production_control.future_google_writer_certification_receipts_v1
      where action='ADOPT_ANNUAL_GOOGLE_DESTINATION';`), "1");

    const conflictingAdopt = withHash(cluster, database, {
      ...adoptBase,
      reason: "A different authorized annual destination reason",
    });
    assert.match(failure(cluster, database,
      "adopt_production_future_google_destination_v1", conflictingAdopt),
    /PRODUCTION_FUTURE_GOOGLE_CERTIFICATION_IDEMPOTENCY_CONFLICT/);

    const certifyUnpromoted = withHash(cluster, database,
      input(owner, "CERTIFY_ANNUAL_GOOGLE_WRITER_TARGET", 5, {
        expected_resource_revision: 2,
        expected_promotion_revision: 1,
      }));
    assert.match(failure(cluster, database,
      "certify_production_future_google_writer_target_v1", certifyUnpromoted),
    /PRODUCTION_FUTURE_GOOGLE_CERTIFICATION_PREDECESSOR_INVALID/);

    sql(cluster, database, `
      update production_control.future_tournament_catalog_v1
      set lifecycle='CONFIGURING' where tournament_id='2027';
      insert into production_control.future_runtime_promotions_v2 values (
        '2027','production-future-runtime-activation-v2',1,4,
        repeat('a',64),'PROMOTED','CB01',
        '00000000-0000-4000-8000-000000000001',now(),now()
      );
      insert into production_control.future_runtime_match_bindings_v2 values (
        '2027','2027-R1-1',4,2,'PREPARED',repeat('b',64)
      );
      insert into production_control.future_match_google_compatibility_jobs_v1(
        tournament_id,match_id
      ) values ('2027','2027-R1-1');
    `);

    const staleCertify = withHash(cluster, database,
      input(owner, "CERTIFY_ANNUAL_GOOGLE_WRITER_TARGET", 6, {
        expected_resource_revision: 2,
        expected_setup_revision: 4,
        expected_promotion_revision: 2,
      }));
    assert.match(failure(cluster, database,
      "certify_production_future_google_writer_target_v1", staleCertify),
    /PRODUCTION_FUTURE_GOOGLE_CERTIFICATION_PREDECESSOR_INVALID/);

    const certifyBase = input(owner,
      "CERTIFY_ANNUAL_GOOGLE_WRITER_TARGET", 7, {
        expected_resource_revision: 2,
        expected_setup_revision: 4,
        expected_promotion_revision: 1,
      });
    const certify = withHash(cluster, database, certifyBase);
    const certified = rpc(cluster, database,
      "certify_production_future_google_writer_target_v1", certify);
    assert.equal(certified.code,
      "PRODUCTION_FUTURE_GOOGLE_WRITER_TARGET_CERTIFIED");
    assert.equal(certified.jobsClaimed, 0);
    assert.equal(certified.googleWrites, 0);
    assert.match(certified.implementationFingerprint, /^[0-9a-f]{64}$/);
    assert.match(certified.targetContractFingerprint, /^[0-9a-f]{64}$/);
    assert.equal(sql(cluster, database, `select concat_ws('|',
      writer_installed,status,attempts,claim_token is null,
      claimed_by is null,lease_expires_at is null)
      from production_control.future_match_google_compatibility_jobs_v1
      where tournament_id='2027';`),
    "t|PROVISIONING_REQUIRED|0|t|t|t");
    assert.equal(sql(cluster, database, `select concat_ws('|',
      (select count(*) from production_control.future_google_writer_generations_v2),
      (select count(*) from production_control.future_google_writer_targets_v2));
    `), "1|1");

    const exactRetry = rpc(cluster, database,
      "certify_production_future_google_writer_target_v1", certify);
    assert.equal(exactRetry.idempotent, true);
    assert.equal(exactRetry.targetContractFingerprint,
      certified.targetContractFingerprint);

    const secondCertification = withHash(cluster, database,
      input(owner, "CERTIFY_ANNUAL_GOOGLE_WRITER_TARGET", 8, {
        expected_resource_revision: 2,
        expected_setup_revision: 4,
        expected_promotion_revision: 1,
      }));
    const reused = rpc(cluster, database,
      "certify_production_future_google_writer_target_v1",
      secondCertification);
    assert.equal(reused.idempotent, true);
    assert.equal(reused.targetContractFingerprint,
      certified.targetContractFingerprint);
    assert.equal(reused.writerGenerationId, certified.writerGenerationId);
    assert.equal(sql(cluster, database, `select concat_ws('|',
      (select count(*) from production_control.future_google_writer_generations_v2),
      (select count(*) from production_control.future_google_writer_targets_v2));
    `), "1|1");

    const conflictingCertification = withHash(cluster, database, {
      ...certifyBase,
      reason: "A different writer certification payload",
    });
    assert.match(failure(cluster, database,
      "certify_production_future_google_writer_target_v1",
      conflictingCertification),
    /PRODUCTION_FUTURE_GOOGLE_CERTIFICATION_IDEMPOTENCY_CONFLICT/);

    sql(cluster, database, `update production_control.future_runtime_promotions_v2
      set runtime_status='READY' where tournament_id='2027';`);
    const wrongPromotionState = withHash(cluster, database,
      input(owner, "CERTIFY_ANNUAL_GOOGLE_WRITER_TARGET", 9, {
        expected_resource_revision: 2,
        expected_setup_revision: 4,
        expected_promotion_revision: 1,
      }));
    assert.match(failure(cluster, database,
      "certify_production_future_google_writer_target_v1",
      wrongPromotionState),
    /PRODUCTION_FUTURE_GOOGLE_CERTIFICATION_PREDECESSOR_INVALID/);

    assert.equal(sql(cluster, database, `select concat_ws('|',
      (select count(*) from production_control.future_google_writer_certification_receipts_v1),
      (select count(*) from production_control.future_google_writer_certification_audit_v1),
      (select count(*) from production_control.future_google_writer_targets_v2),
      (select coalesce(sum(attempts),0) from production_control.future_match_google_compatibility_jobs_v1));
    `), "3|3|1|0");
  } finally {
    await destroyCluster(cluster);
  }
});
