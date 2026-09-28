import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import path from "node:path";
import {
  repositoryRoot,
  sql,
  sqlFile,
} from "./postgres17.mjs";

export const release139Sha = "b2065c901f9f6cbdc3dc2f1f37f6b1b782309ec6";
export const lastRelease139Migration =
  "202609270120_bounded_late_r3_result_compatibility_v1.sql";

const migrationsDirectory = path.join(repositoryRoot, "supabase", "production_migrations");
const incrementalDirectory = path.join(repositoryRoot, "supabase", "production_incremental");
const candidatesDirectory = path.join(repositoryRoot, "candidates");

export async function migrationNames() {
  return (await readdir(migrationsDirectory))
    .filter((name) => /^\d+_.*\.sql$/.test(name))
    .sort();
}

export function installSupabaseCompatibility(cluster, database) {
  sql(cluster, database, `
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create schema auth;
    create table auth.users (
      id uuid primary key, email text, phone text, phone_change text,
      email_confirmed_at timestamptz, phone_confirmed_at timestamptz,
      confirmation_sent_at timestamptz,
      raw_app_meta_data jsonb default '{}'::jsonb,
      raw_user_meta_data jsonb default '{}'::jsonb,
      created_at timestamptz default now(), updated_at timestamptz default now()
    );
    create table auth.identities (
      id uuid primary key, user_id uuid not null references auth.users(id),
      provider text not null, identity_data jsonb default '{}'::jsonb,
      created_at timestamptz default now(), updated_at timestamptz default now()
    );
    create function auth.role() returns text language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), current_user)
    $$;
    create function public.rls_auto_enable()
    returns void language plpgsql as $$ begin end $$;
  `, { role: "" });
}

function installAnnualPlatformFixture(cluster, database) {
  sql(cluster, database, `
    set session_replication_role = replica;
    insert into production_control.maintenance_deployment_capability_bindings (
      capability_binding_id, rebind_id, boundary_mode, contract_version,
      capability_ceiling, tournament_id, epoch_id, deployment_id,
      deployment_commit, capability_manifest, capability_fingerprint,
      runtime_observed_at, request_fingerprint, payload_hash, actor_id,
      response_value
    ) select
      '75000000-0000-4000-8000-000000000001',
      '75000000-0000-4000-8000-000000000002',
      'MAINTENANCE_WINDOW_V1',
      'production-maintenance-single-deployment-capability-v1',
      'OBSERVATION', '2026', value.authority_generation_id,
      'dpl_ReliabilityFixture139', repeat('7', 40), '{}'::jsonb,
      repeat('7', 64), pg_catalog.clock_timestamp(), repeat('8', 64),
      repeat('9', 64), 'reliability-fixture', '{}'::jsonb
    from production_control.cutover_activation_state value
    where value.scope_key = 'BAGGER_INV_PRODUCTION';
    set session_replication_role = origin;
  `, { role: "" });
}

export async function installRelease139Schema(cluster, database) {
  installSupabaseCompatibility(cluster, database);
  const names = (await migrationNames()).filter((name) => name <= lastRelease139Migration);
  assert.equal(names.at(-1), lastRelease139Migration,
    "Release 139 migration boundary is missing");
  for (const name of names) {
    sqlFile(cluster, database, path.join(migrationsDirectory, name), { role: "" });
    if (name.startsWith("202608260038")) {
      sql(cluster, database, `
        insert into scoring_authority.tournaments(
          tournament_id,tournament_year,name,source_workbook_id,scoring_authority
        ) values(
          '2026',2026,'Synthetic Reliability Tournament',
          '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4','GOOGLE'
        );
        insert into scoring_authority.ingress_gates(
          tournament_id,state,authority,unresolved_client_queues,updated_by
        ) values('2026','PAUSED','GOOGLE',0,'reliability-fixture');
      `, { role: "" });
    }
    if (name.startsWith("202608300068")) {
      installAnnualPlatformFixture(cluster, database);
    }
  }
  return names;
}

export function installCertifiedSqlRepairs(cluster, database) {
  sqlFile(cluster, database,
    path.join(incrementalDirectory, "net-skins-sql-expressions-v1.sql"));
  sqlFile(cluster, database,
    path.join(incrementalDirectory, "calcutta-exact-job-activation-recovery-v1.sql"));
}

export function installRelease139FunctionCandidates(cluster, database) {
  // The atomic round migration calls the Resume helper shipped in this
  // function-only candidate. Keep this source bundle explicit because the Git
  // candidate alone is not independent evidence that a hosted DB installed it.
  sqlFile(cluster, database, path.join(candidatesDirectory, "scored-match-resume.sql"),
    { role: "" });
}
