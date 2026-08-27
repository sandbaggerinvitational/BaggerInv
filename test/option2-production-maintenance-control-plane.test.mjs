import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/production_migrations/202608270044_production_maintenance_window_cutover.sql",
  import.meta.url,
);
const sql = await readFile(migrationUrl, "utf8");

const privilegedRpcs = [
  "begin_production_scoring_maintenance",
  "drain_production_scoring_maintenance",
  "finalize_production_scoring_maintenance_snapshot",
  "prepare_production_maintenance_authority_epoch",
  "commit_production_maintenance_authority_epoch",
  "resume_production_supabase_scoring",
  "abort_production_maintenance_authority_epoch",
  "begin_production_supabase_rollback_maintenance",
  "finalize_production_maintenance_rollback_snapshot",
  "rollback_production_maintenance_authority_epoch",
  "resume_production_google_scoring_after_maintenance_rollback",
];

test("migration 044 installs an inert, mode-scoped maintenance boundary", () => {
  assert.match(
    sql,
    /add column if not exists boundary_mode text not null\s+default 'PROVIDER_FENCE_V2'/i,
  );
  assert.match(
    sql,
    /add column if not exists maintenance_state text not null default 'NORMAL'/i,
  );
  assert.match(
    sql,
    /boundary_mode in \('PROVIDER_FENCE_V2', 'MAINTENANCE_WINDOW_V1'\)/i,
  );
  assert.match(
    sql,
    /boundary_mode = 'PROVIDER_FENCE_V2'[\s\S]*external_fence_evidence_id is not null[\s\S]*boundary_mode = 'MAINTENANCE_WINDOW_V1'[\s\S]*external_fence_evidence_id is null/i,
  );

  // Installation only adds schema and callable contracts. It cannot activate
  // maintenance, change authority, or open ingress by itself.
  const beforeFirstFunction = sql.slice(0, sql.indexOf("create or replace function"));
  assert.doesNotMatch(
    beforeFirstFunction,
    /update\s+production_control\.cutover_activation_state/i,
  );
  assert.doesNotMatch(
    beforeFirstFunction,
    /update\s+(?:table\s+)?scoring_authority\.ingress_gates/i,
  );
  assert.doesNotMatch(
    beforeFirstFunction,
    /insert\s+into\s+scoring_authority\.authority_epochs/i,
  );
});

test("maintenance predicates preserve exact scope, quiescence, parity, and paused-ingress boundaries", () => {
  assert.match(
    sql,
    /assert_maintenance_common_input[\s\S]*assert_exact_cutover_resource_scope\(input, true\)/i,
  );
  assert.match(
    sql,
    /assert_maintenance_cutover_snapshot_safe[\s\S]*admission_state <> 'CLOSED'[\s\S]*scoring_admission_unresolved_count[\s\S]*scoring_admission_legacy_blocker_count/i,
  );
  assert.match(
    sql,
    /final_source_fingerprint is distinct from[\s\S]*supabase_shadow_fingerprint[\s\S]*unexplained_difference_count <> 0/i,
  );
  assert.match(
    sql,
    /assert_maintenance_cutover_prepare_safe[\s\S]*assert_maintenance_cutover_snapshot_safe/i,
  );
  assert.match(
    sql,
    /commit_production_maintenance_authority_epoch[\s\S]*first_supabase_canonical_write_possible[^;]*false/i,
  );
  assert.match(
    sql,
    /resume_production_supabase_scoring[\s\S]*first_supabase_canonical_write_possible[^;]*true/i,
  );
});

test("maintenance RPCs remain service-role-only SECURITY DEFINER contracts", () => {
  for (const rpc of privilegedRpcs) {
    assert.match(
      sql,
      new RegExp(
        `create or replace function public\\.${rpc}\\(\\s*input jsonb\\s*\\)[\\s\\S]*?security definer[\\s\\S]*?set search_path = pg_catalog`,
        "i",
      ),
      `${rpc} must be SECURITY DEFINER with a fixed search_path`,
    );
    assert.match(sql, new RegExp(`'public\\.${rpc}\\(jsonb\\)'`, "i"));
  }

  assert.match(
    sql,
    /execute 'revoke all on function ' \|\| function_name \|\|\s+' from public, anon, authenticated, service_role'/i,
  );
  assert.match(
    sql,
    /execute 'grant execute on function ' \|\| function_name \|\|\s+' to service_role'/i,
  );

  assert.doesNotMatch(
    sql,
    /grant\s+(?:select|insert|update|delete|all)[^;]+to\s+(?:public|anon|authenticated)/i,
  );
  assert.doesNotMatch(
    sql,
    /grant execute[^;]+to\s+(?:public|anon|authenticated)/i,
  );
});

test("provider-fence mode is delegated unchanged and active physical fences fail maintenance closed", () => {
  assert.match(
    sql,
    /rename to stage_production_cutover_release_provider_fence_v2/i,
  );
  assert.match(
    sql,
    /if input->>'boundary_mode' = 'MAINTENANCE_WINDOW_V1'[\s\S]*stage_production_maintenance_release\(input\)[\s\S]*stage_production_cutover_release_provider_fence_v2\(input\)/i,
  );
  assert.match(
    sql,
    /assert_no_active_physical_writer_fence[\s\S]*google_writer_provider_fences[\s\S]*vercel_writer_critical_waf_epochs[\s\S]*google_writer_fence_rehearsals/i,
  );
  assert.match(sql, /PRODUCTION_MAINTENANCE_ACTIVE_PHYSICAL_FENCE/i);
});
