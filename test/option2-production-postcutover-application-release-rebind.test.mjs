import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/production_migrations/202608280053_production_postcutover_application_release_rebind.sql",
  import.meta.url,
);
const sql = await readFile(migrationUrl, "utf8");

const OLD_SHA = "7baf9b284d4784d7387f3e4fa876b9d47cd0a177";
const NEW_SHA = "56ded61379e3308ab5c465ce186140550f3827a7";

function statement(pattern, label) {
  const match = sql.match(pattern);
  assert.ok(match, `${label} statement is present`);
  return match[0];
}

test("migration 053 installs one exact, one-shot post-cutover application rebind", () => {
  assert.match(sql, /postcutover_application_release_rebindings/);
  assert.match(
    sql,
    /scope_key text not null unique check \(scope_key = 'BAGGER_INV_PRODUCTION'\)/,
  );
  assert.match(
    sql,
    /contract_version = 'production-postcutover-application-release-rebind-v1'/,
  );
  assert.match(sql, new RegExp(`prior_deployment_commit[\\s\\S]*?'${OLD_SHA}'`));
  assert.match(sql, new RegExp(`deployment_commit[\\s\\S]*?'${NEW_SHA}'`));
  assert.match(sql, /deployment_id text not null unique/);
  assert.match(sql, /prior_deployment_id <> deployment_id/);
  assert.match(sql, /deployment_id ~ '\^dpl_\[A-Za-z0-9\]\{8,64\}\$'/);
  assert.match(
    sql,
    /production_control\.rebind_production_postcutover_application_release\(\s*input jsonb\s*\)/,
  );
  assert.match(sql, /PRODUCTION_POSTCUTOVER_APPLICATION_RELEASE_ALREADY_USED/);
  assert.match(sql, /application_rebind_id uuid primary key/);
  assert.match(sql, /capability_binding_id uuid not null unique/);
  assert.match(sql, /epoch_id uuid not null unique/);
});

test("the replacement must be a fresh Ready Production runtime on the exact Vercel scope", () => {
  assert.match(
    sql,
    new RegExp(`input->>'deployment_commit' is distinct from\\s*'${NEW_SHA}'`),
  );
  assert.match(
    sql,
    new RegExp(`input->>'runtime_deployment_commit' is distinct from\\s*'${NEW_SHA}'`),
  );
  assert.match(sql, /runtime_deployment_status' is distinct from 'READY'/);
  assert.match(
    sql,
    /runtime_readiness_evidence' is distinct from\s*'LIVE_CANONICAL_PRODUCTION_ROUTE'/,
  );
  assert.match(sql, /runtime_deployment_target' is distinct from 'PRODUCTION'/);
  assert.match(sql, /runtime_environment' is distinct from 'production'/);
  assert.match(sql, /runtime_vercel_project' is distinct from 'bagger-inv'/);
  assert.match(
    sql,
    /runtime_vercel_project_id' is distinct from\s*'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'/,
  );
  assert.match(
    sql,
    /runtime_vercel_team_id' is distinct from\s*'team_kPw5zaib8uaQJALAwj4fWI6R'/,
  );
  assert.match(
    sql,
    /runtime_canonical_hostname' is distinct from 'baggerinv\.com'/,
  );
  assert.match(sql, /runtime_deployment_hostname'[\s\S]*?\.vercel\\\.app/);
  assert.match(
    sql,
    /runtime_deployment_hostname' in \([\s\S]*?bagger-inv-git-feature-mock-tour-b4f752[\s\S]*?bagger-inv\.vercel\.app/,
  );
  assert.match(sql, /input->>'deployment_id' = input->>'original_deployment_id'/);
});

test("the exact Production resources and committed OBSERVATION state are required", () => {
  assert.match(
    sql,
    /assert_exact_cutover_resource_scope\(input, false\)/,
  );
  assert.match(
    sql,
    /assert_scoring_admission_optimistic_input\(\s*input, false\s*\)/,
  );
  assert.match(sql, /assert_no_active_physical_writer_fence\(\)/);
  assert.match(sql, /activation\.boundary_mode <> 'MAINTENANCE_WINDOW_V1'/);
  assert.match(sql, /activation\.state <> 'SCORING_COMMITTED'/);
  assert.match(sql, /activation\.read_cutover_phase <> 'OBSERVATION'/);
  assert.match(sql, /activation\.current_authority <> 'SUPABASE'/);
  assert.match(sql, /activation\.maintenance_state <> 'NORMAL'/);
  assert.match(sql, /not activation\.scoring_ingress_enabled/);
  assert.match(sql, /activation\.active_transition_epoch_id is not null/);
  assert.match(
    sql,
    new RegExp(`activation\\.expected_deployment_commit is distinct from\\s*'${OLD_SHA}'`),
  );
  assert.match(
    sql,
    /activation\.activation_revision is distinct from\s*\(input->>'expected_activation_revision'\)::bigint/,
  );
  assert.match(
    sql,
    /activation\.authority_generation_id is distinct from\s*\(input->>'expected_authority_generation'\)::uuid/,
  );

  assert.match(sql, /resource\.project_ref <> 'ymqhhtxaywtqllynrmxe'/);
  assert.match(
    sql,
    /resource\.google_workbook_id <>\s*'1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'/,
  );
  assert.match(sql, /resource\.current_tournament_id <> '2026'/);
  assert.match(
    sql,
    /resource\.current_tournament_read_authority <> 'SUPABASE'/,
  );
  assert.match(sql, /resource\.scoring_authority <> 'SUPABASE'/);
  assert.match(
    sql,
    /resource\.participant_identity_authority <> 'SUPABASE'/,
  );
  assert.match(sql, /not resource\.public_supabase_reads_enabled/);
  assert.match(sql, /not resource\.scoring_ingress_enabled/);
  assert.match(sql, /not resource\.workers_enabled/);
  assert.match(sql, /not resource\.google_writes_enabled/);
  assert.match(sql, /resource\.odds_publication_enabled/);
});

test("the active epoch, admission generation, closure, and revisions must be unchanged and current", () => {
  assert.match(sql, /gate\.authority <> 'SUPABASE'/);
  assert.match(sql, /gate\.state <> 'OPEN'/);
  assert.match(sql, /gate\.admission_state <> 'CLOSED'/);
  assert.match(sql, /not gate\.admission_protocol_enforced/);
  assert.match(sql, /gate\.active_epoch_id is distinct from epoch\.epoch_id/);
  assert.match(
    sql,
    /epoch\.epoch_id is distinct from \(input->>'epoch_id'\)::uuid/,
  );
  assert.match(
    sql,
    /gate\.admission_generation_id is distinct from\s*\(input->>'expected_admission_generation'\)::uuid/,
  );
  assert.match(
    sql,
    /gate\.admission_revision is distinct from\s*\(input->>'expected_admission_revision'\)::bigint/,
  );
  assert.match(
    sql,
    /closure\.closure_id is distinct from \(input->>'closure_id'\)::uuid/,
  );
  assert.match(sql, /closure\.status <> 'CONSUMED'/);
  assert.match(sql, /closure\.consumed_epoch_id is distinct from epoch\.epoch_id/);
  assert.match(sql, /epoch\.status <> 'COMMITTED'/);
  assert.match(sql, /epoch\.authority_before <> 'GOOGLE'/);
  assert.match(sql, /epoch\.authority_after <> 'SUPABASE'/);
  assert.match(sql, /epoch\.admission_closure_id is distinct from closure\.closure_id/);
  assert.match(
    sql,
    /epoch\.admission_generation_id is distinct from\s*gate\.admission_generation_id/,
  );
  assert.match(
    sql,
    /runtime_expected_authority_epoch'[\s\S]*?expected_authority_generation/,
  );
  assert.match(
    sql,
    /runtime_expected_admission_generation'[\s\S]*?expected_admission_generation/,
  );
});

test("the certified capability ceiling, worker configuration, and Odds bindings remain exact", () => {
  assert.match(
    sql,
    /runtime_deployment_capability_contract' is distinct from\s*'production-maintenance-single-deployment-capability-v1'/,
  );
  assert.match(
    sql,
    /runtime_deployment_capability_ceiling' is distinct from\s*'OBSERVATION'/,
  );
  assert.match(sql, /binding\.contract_version <>\s*'production-maintenance-single-deployment-capability-v1'/);
  assert.match(sql, /binding\.capability_ceiling <> 'OBSERVATION'/);
  assert.match(
    sql,
    /extensions\.digest\(binding\.capability_manifest::text, 'sha256'\)/,
  );
  assert.match(sql, /runtime_workers_enabled'[\s\S]*?'true'::jsonb/);
  assert.match(sql, /runtime_google_mirror_enabled'[\s\S]*?'true'::jsonb/);
  assert.match(sql, /runtime_scorecard_archive_enabled'[\s\S]*?'true'::jsonb/);
  assert.match(
    sql,
    /runtime_outbox_worker_secret_configured'[\s\S]*?'true'::jsonb/,
  );
  assert.match(
    sql,
    /runtime_archive_worker_secret_configured'[\s\S]*?'true'::jsonb/,
  );
  assert.match(sql, /runtime_odds_calculation_enabled'[\s\S]*?'true'::jsonb/);
  assert.match(sql, /runtime_war_room_input_source' is distinct from 'SUPABASE'/);
  assert.match(
    sql,
    /runtime_prediction_settings_read_source' is distinct from\s*'SUPABASE'/,
  );
  assert.match(
    sql,
    /runtime_odds_calculation_input_source' is distinct from\s*'SUPABASE'/,
  );
  assert.match(sql, /odds_config\.validation_status <> 'VALID'/);
  assert.match(sql, /prediction_settings_source_fingerprint/);
  assert.match(sql, /prediction_settings_effective_fingerprint/);
  assert.match(
    sql,
    /runtime_odds_publication_authority' is distinct from 'GOOGLE'/,
  );
  assert.match(
    sql,
    /runtime_supabase_odds_publication_enabled'[\s\S]*?'false'::jsonb/,
  );
  assert.match(
    sql,
    /runtime_supabase_odds_google_mirror_enabled'[\s\S]*?'false'::jsonb/,
  );
});

test("pending rollback, reconciliation, unresolved leases, and stale transitions fail closed", () => {
  assert.match(
    sql,
    /scoring_admission_unresolved_count\(\s*gate\.admission_generation_id\s*\) <> 0/,
  );
  assert.match(
    sql,
    /authority_epochs value[\s\S]*?value\.status = 'PREPARED'/,
  );
  assert.match(
    sql,
    /closure_kind = 'SUPABASE_INGRESS'[\s\S]*?status in \('CLOSING', 'CLOSED'\)/,
  );
  assert.match(
    sql,
    /'pending_rollback_or_reconciliation', false/,
  );
});

test("the atomic metadata rebind covers deployment-sensitive epoch, closure, workers, and Odds state", () => {
  assert.match(
    sql,
    new RegExp(
      `update production_control\\.cutover_activation_state[\\s\\S]*?expected_deployment_commit =\\s*'${NEW_SHA}'[\\s\\S]*?activation_revision = next_activation_revision`,
    ),
  );
  assert.match(
    sql,
    /update scoring_authority\.ingress_gates[\s\S]*?admission_deployment_id = input->>'deployment_id'[\s\S]*?admission_revision = next_admission_revision/,
  );
  assert.match(
    sql,
    /update production_control\.scoring_admission_closures[\s\S]*?deployment_id = input->>'deployment_id'[\s\S]*?closed_admission_revision = next_admission_revision/,
  );
  assert.match(
    sql,
    new RegExp(
      `update scoring_authority\\.authority_epochs[\\s\\S]*?deployment_commit =\\s*'${NEW_SHA}'[\\s\\S]*?closed_admission_revision = next_admission_revision`,
    ),
  );
  assert.match(
    sql,
    new RegExp(
      `update production_control\\.worker_controls[\\s\\S]*?'deployment_commit',\\s*'${NEW_SHA}'[\\s\\S]*?'deployment_id', input->>'deployment_id'`,
    ),
  );
  assert.match(
    sql,
    new RegExp(
      `update production_control\\.odds_calculation_runtime[\\s\\S]*?deployment_commit =\\s*'${NEW_SHA}'[\\s\\S]*?activation_revision = next_activation_revision`,
    ),
  );
  assert.match(sql, /application_rebind_id[\s\S]*?postcutover_application_rebound_at/);
});

test("the rebind changes metadata only and preserves authority, phase, data, and enabled state", () => {
  const activationUpdate = statement(
    /update production_control\.cutover_activation_state[\s\S]*?where scope_key = 'BAGGER_INV_PRODUCTION';/,
    "activation update",
  );
  assert.doesNotMatch(
    activationUpdate,
    /\b(?:state|boundary_mode|read_cutover_phase|current_authority|maintenance_state|scoring_ingress_enabled|authority_generation_id|active_transition_epoch_id)\s*=/,
  );

  const gateUpdate = statement(
    /update scoring_authority\.ingress_gates[\s\S]*?where tournament_id = '2026';/,
    "admission gate update",
  );
  assert.doesNotMatch(
    gateUpdate,
    /\b(?:authority|state|admission_state|active_epoch_id|admission_generation_id|admission_protocol_enforced)\s*=/,
  );

  const epochUpdate = statement(
    /update scoring_authority\.authority_epochs[\s\S]*?where epoch_id = epoch\.epoch_id;/,
    "epoch update",
  );
  assert.doesNotMatch(
    epochUpdate,
    /\b(?:status|authority_before|authority_after|epoch_type|admission_generation_id|admission_closure_id)\s*=/,
  );

  const workerUpdate = statement(
    /update production_control\.worker_controls[\s\S]*?where worker_name in \([\s\S]*?\);/,
    "worker update",
  );
  assert.doesNotMatch(
    workerUpdate,
    /\b(?:enabled|scheduler_installed|google_writes_allowed)\s*=/,
  );

  const oddsUpdate = statement(
    /update production_control\.odds_calculation_runtime[\s\S]*?where scope_key = 'BAGGER_INV_PRODUCTION';/,
    "Odds runtime update",
  );
  assert.doesNotMatch(oddsUpdate, /\b(?:enabled|operation_mode|cutover_phase)\s*=/);

  assert.doesNotMatch(sql, /update production_control\.resource_scope/i);
  assert.doesNotMatch(sql, /update\s+(?:public\.)?(?:players|teams|rounds|matches|scores)\b/i);
  assert.doesNotMatch(sql, /update\s+google_/i);
});

test("lost-response retries are payload-bound and deterministic", () => {
  assert.match(sql, /intent_input jsonb := input - 'runtime_observed_at'/);
  assert.match(sql, /request_fingerprint text not null unique/);
  assert.match(sql, /payload_hash text not null/);
  assert.match(
    sql,
    /existing\.request_fingerprint is distinct from\s*pg_catalog\.lower\(input->>'request_fingerprint'\)/,
  );
  assert.match(
    sql,
    /existing\.payload_hash is distinct from\s*production_control\.cutover_payload_hash\(intent_input\)/,
  );
  assert.match(
    sql,
    /return existing\.response_value \|\| pg_catalog\.jsonb_build_object\(\s*'idempotent', true\s*\)/,
  );
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.ok(
    sql.match(/select value\.\* into existing[\s\S]*?scope_key = 'BAGGER_INV_PRODUCTION'/g)
      ?.length >= 2,
    "idempotency is checked both before and after the advisory lock",
  );
  assert.match(
    sql,
    /store_cutover_receipt\(\s*'REBIND_POSTCUTOVER_APPLICATION_RELEASE', intent_input, response_value\s*\)/,
  );
  assert.match(sql, /POSTCUTOVER_APPLICATION_RELEASE_REBOUND/);
});

test("the release fingerprint is database-computed from an explicit versioned manifest", () => {
  assert.match(
    sql,
    /runtime_manifest := pg_catalog\.jsonb_build_object\([\s\S]*?'domain', 'BAGGER_POSTCUTOVER_APPLICATION_RELEASE_REBIND_V1'/,
  );
  assert.match(
    sql,
    /runtime_fingerprint := pg_catalog\.encode\(\s*extensions\.digest\(runtime_manifest::text, 'sha256'\), 'hex'\s*\)/,
  );
  assert.doesNotMatch(sql, /runtime_fingerprint\s*:=\s*input->>/);
  assert.match(
    sql,
    /release\.runtime_fingerprint is distinct from pg_catalog\.encode\(\s*extensions\.digest\(release\.runtime_manifest::text, 'sha256'\), 'hex'\s*\)/,
  );
});

test("the capability wrapper preserves the original precommit path and leaves Provider Fence v2 untouched", () => {
  assert.match(
    sql,
    /assert_production_maintenance_runtime_capability_pre_application_release/,
  );
  assert.match(
    sql,
    /if not found then[\s\S]*?assert_production_maintenance_runtime_capability_pre_application_release\(\s*input, required_phase\s*\);[\s\S]*?return;/,
  );
  assert.match(
    sql,
    /rebind_production_maintenance_precommit_deployment_pre_application_release/,
  );
  assert.match(
    sql,
    /if activation\.boundary_mode = 'MAINTENANCE_WINDOW_V1'[\s\S]*?activation\.read_cutover_phase = 'OBSERVATION'[\s\S]*?rebind_production_postcutover_application_release\(input\)/,
  );
  assert.match(
    sql,
    /return public[\s\S]*?rebind_production_maintenance_precommit_deployment_pre_application_release\(\s*input\s*\)/,
  );
  assert.doesNotMatch(
    sql,
    /create or replace function\s+public\.prepare_production_authority_epoch_provider_fence_v2/i,
  );
  assert.doesNotMatch(
    sql,
    /create or replace function\s+public\.commit_production_authority_epoch_provider_fence_v2/i,
  );
});

test("new objects retain RLS, least privilege, and fixed-search-path protection", () => {
  assert.match(
    sql,
    /alter table production_control\.postcutover_application_release_rebindings\s*enable row level security/,
  );
  assert.match(
    sql,
    /revoke all on table\s*production_control\.postcutover_application_release_rebindings\s*from public, anon, authenticated, service_role/,
  );
  assert.match(
    sql,
    /production_control\.rebind_production_postcutover_application_release\([\s\S]*?security definer[\s\S]*?set search_path = pg_catalog/,
  );
  assert.match(
    sql,
    /production_control\.assert_production_maintenance_runtime_capability\([\s\S]*?security definer[\s\S]*?set search_path = pg_catalog/,
  );
  assert.match(
    sql,
    /public\.rebind_production_maintenance_precommit_deployment\(input jsonb\)[\s\S]*?security definer[\s\S]*?set search_path = pg_catalog/,
  );
  assert.match(
    sql,
    /revoke all on function\s*production_control\.rebind_production_postcutover_application_release\(jsonb\)\s*from public, anon, authenticated, service_role/,
  );
  assert.match(
    sql,
    /grant execute on function\s*public\.rebind_production_maintenance_precommit_deployment\(jsonb\)\s*to service_role/,
  );
  assert.doesNotMatch(
    sql,
    /grant execute on function[\s\S]*?rebind_production_postcutover_application_release\(jsonb\)[\s\S]*?to (?:public|anon|authenticated|service_role)/i,
  );
});
