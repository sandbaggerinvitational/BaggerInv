import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/production_migrations/202608280054_production_postcutover_normal_release_rebind.sql",
  import.meta.url,
);
const sql = await readFile(migrationUrl, "utf8");

function statement(pattern, label) {
  const match = sql.match(pattern);
  assert.ok(match, `${label} statement is present`);
  return match[0];
}

test("migration 054 roots an append-only serial ledger at the immutable 053 release", () => {
  assert.match(sql, /postcutover_normal_release_rebindings/);
  assert.match(sql, /postcutover_normal_release_head/);
  assert.match(
    sql,
    /contract_version = 'production-postcutover-normal-release-rebind-v1'/,
  );
  assert.match(sql, /release_kind in \('BASELINE_053', 'NORMAL'\)/);
  assert.match(sql, /release_sequence bigint not null unique/);
  assert.match(
    sql,
    /predecessor_release_sequence = release_sequence - 1/,
  );
  assert.match(
    sql,
    /baseline_application_rebind_id uuid not null references[\s\S]*?postcutover_application_release_rebindings/,
  );
  assert.match(
    sql,
    /predecessor_release_rebind_id uuid references[\s\S]*?postcutover_normal_release_rebindings/,
  );
  assert.match(sql, /predecessor_deployment_id <> deployment_id/);
  assert.match(
    sql,
    /release_kind = 'BASELINE_053'[\s\S]*?predecessor_release_sequence is null/,
  );
  assert.match(
    sql,
    /release_kind = 'NORMAL'[\s\S]*?release_sequence >= 2/,
  );
});

test("migration-time backfill and ordered fresh-install bootstrap preserve the 053 audit row", () => {
  assert.match(
    sql,
    /bootstrap_postcutover_normal_release_baseline\(\)/,
  );
  assert.match(
    sql,
    /from production_control\.postcutover_application_release_rebindings value[\s\S]*?where value\.scope_key = 'BAGGER_INV_PRODUCTION'/,
  );
  assert.match(
    sql,
    /'production-postcutover-normal-release-rebind-v1', 'BASELINE_053',[\s\S]*?1, null/,
  );
  assert.match(sql, /on conflict \(release_sequence\) do nothing/);
  assert.match(
    sql,
    /create trigger production_postcutover_normal_release_baseline_insert[\s\S]*?after insert on[\s\S]*?postcutover_application_release_rebindings/,
  );
  assert.match(
    sql,
    /bootstrap_postcutover_normal_release_baseline_after_insert\(\)[\s\S]*?perform production_control\.bootstrap_postcutover_normal_release_baseline\(\)/,
  );
  assert.match(
    sql,
    /do \$\$[\s\S]*?bootstrap_postcutover_normal_release_baseline\(\)[\s\S]*?\$\$;/,
  );
  assert.match(
    sql,
    /postcutover_normal_release_head[\s\S]*?'BAGGER_INV_PRODUCTION', 1, baseline_release_id/,
  );
  assert.doesNotMatch(
    sql,
    /update production_control\.postcutover_application_release_rebindings/i,
  );
});

test("only an owner-authorized exact release intent can be consumed", () => {
  assert.match(sql, /postcutover_normal_release_intents/);
  assert.match(
    sql,
    /production_postcutover_normal_release_one_pending_idx[\s\S]*?where status = 'PENDING'/,
  );
  assert.match(
    sql,
    /production_control\.authorize_production_postcutover_normal_release\(\s*input jsonb\s*\)/,
  );
  assert.match(sql, /PRODUCTION_DATABASE_OWNER_REQUIRED/);
  assert.match(
    sql,
    /revoke all on function[\s\S]*?authorize_production_postcutover_normal_release\(jsonb\)[\s\S]*?from public, anon, authenticated, service_role/,
  );
  assert.doesNotMatch(
    sql,
    /grant execute on function[\s\S]*?authorize_production_postcutover_normal_release\(jsonb\)/i,
  );
  assert.match(
    sql,
    /target_sequence := head\.release_sequence \+ 1/,
  );
  assert.match(
    sql,
    /'domain', 'BAGGER_POSTCUTOVER_NORMAL_RELEASE_INTENT_V1'/,
  );
  assert.match(
    sql,
    /extensions\.digest\(manifest::text, 'sha256'\)/,
  );
  assert.match(
    sql,
    /value\.scope_key = 'BAGGER_INV_PRODUCTION'[\s\S]*?value\.status = 'PENDING'/,
  );
  assert.match(
    sql,
    /authorized_intent\.target_deployment_commit is distinct from[\s\S]*?input->>'deployment_commit'/,
  );
  assert.match(
    sql,
    /authorized_intent\.authorization_fingerprint is distinct from[\s\S]*?extensions\.digest\([\s\S]*?authorized_intent\.authorization_manifest::text/,
  );
  assert.match(
    sql,
    /update production_control\.postcutover_normal_release_intents[\s\S]*?set status = 'CONSUMED'[\s\S]*?consumed_release_rebind_id = new_release_rebind_id/,
  );
  assert.match(sql, /PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_INTENT_ADVANCED/);
});

test("the exact current 053 head receives only its already-approved sequence-2 intent", () => {
  assert.match(sql, /head\.release_sequence <> 1/);
  assert.match(sql, /head\.activation_revision <> 100/);
  assert.match(sql, /dpl_4CXVow7mjxqDauNB85g1NMKxGwdZ/);
  assert.match(sql, /56ded61379e3308ab5c465ce186140550f3827a7/);
  assert.match(
    sql,
    /'PENDING', 2,[\s\S]*?'migration-054-owner-authorized-homepage-release'/,
  );
  assert.match(sql, /on conflict \(release_sequence\) do nothing/);
});

test("the latest serial head overlays runtime authorization while the prior 053 path remains intact", () => {
  assert.match(
    sql,
    /assert_production_maintenance_runtime_capability_pre_normal_release/,
  );
  assert.match(
    sql,
    /if not found then[\s\S]*?assert_production_maintenance_runtime_capability_pre_normal_release\(\s*input, required_phase\s*\);[\s\S]*?return;/,
  );
  for (const predicate of [
    /head\.release_sequence is distinct from release\.release_sequence/,
    /head\.deployment_id is distinct from release\.deployment_id/,
    /head\.deployment_commit is distinct from release\.deployment_commit/,
    /head\.activation_revision is distinct from[\s\S]*?release\.activation_revision_after/,
    /head\.admission_revision is distinct from[\s\S]*?release\.admission_revision_after/,
    /input->>'deployment_id' is distinct from release\.deployment_id/,
    /input->>'deployment_commit'[\s\S]*?release\.deployment_commit/,
    /activation\.expected_deployment_commit is distinct from[\s\S]*?release\.deployment_commit/,
    /gate\.admission_deployment_id is distinct from release\.deployment_id/,
    /epoch\.deployment_commit is distinct from release\.deployment_commit/,
  ]) assert.match(sql, predicate);
  assert.match(
    sql,
    /release\.runtime_fingerprint is distinct from pg_catalog\.encode\([\s\S]*?extensions\.digest\(release\.runtime_manifest::text, 'sha256'\)/,
  );
  assert.match(
    sql,
    /PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_REQUIRED/,
  );
});

test("a normal release requires exact Ready Production runtime and unchanged resource/capability bindings", () => {
  for (const predicate of [
    /runtime_deployment_status' is distinct from 'READY'/,
    /runtime_readiness_evidence' is distinct from[\s\S]*?'LIVE_CANONICAL_PRODUCTION_ROUTE'/,
    /runtime_deployment_target' is distinct from 'PRODUCTION'/,
    /runtime_environment' is distinct from 'production'/,
    /runtime_vercel_project' is distinct from 'bagger-inv'/,
    /runtime_vercel_project_id' is distinct from[\s\S]*?'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'/,
    /runtime_vercel_team_id' is distinct from[\s\S]*?'team_kPw5zaib8uaQJALAwj4fWI6R'/,
    /runtime_canonical_hostname' is distinct from 'baggerinv\.com'/,
    /runtime_deployment_hostname' ~ '-git-'/,
    /runtime_deployment_commit' is distinct from[\s\S]*?input->>'deployment_commit'/,
    /runtime_deployment_capability_contract' is distinct from[\s\S]*?'production-maintenance-single-deployment-capability-v1'/,
    /runtime_deployment_capability_ceiling' is distinct from[\s\S]*?'OBSERVATION'/,
    /resource\.project_ref <> 'ymqhhtxaywtqllynrmxe'/,
    /resource\.google_workbook_id <>[\s\S]*?'1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'/,
    /resource\.current_tournament_id <> '2026'/,
    /resource\.current_tournament_read_authority <> 'SUPABASE'/,
    /resource\.scoring_authority <> 'SUPABASE'/,
    /resource\.participant_identity_authority <> 'SUPABASE'/,
    /binding\.capability_ceiling <> 'OBSERVATION'/,
  ]) assert.match(sql, predicate);
  assert.match(sql, /runtime_outbox_worker_secret_configured/);
  assert.match(sql, /runtime_archive_worker_secret_configured/);
  assert.match(sql, /runtime_prediction_settings_source_fingerprint/);
  assert.match(sql, /runtime_prediction_settings_effective_fingerprint/);
  assert.match(
    sql,
    /runtime_odds_publication_authority' is distinct from 'GOOGLE'/,
  );
});

test("serial predecessor, sequence, and replay checks fail closed", () => {
  assert.match(sql, /expected_release_sequence/);
  assert.match(sql, /expected_predecessor_deployment_id/);
  assert.match(sql, /expected_predecessor_deployment_commit/);
  assert.match(
    sql,
    /target_sequence is distinct from head\.release_sequence \+ 1/,
  );
  assert.match(
    sql,
    /expected_predecessor_deployment_id'[\s\S]*?head\.deployment_id/,
  );
  assert.match(
    sql,
    /expected_predecessor_deployment_commit'[\s\S]*?head\.deployment_commit/,
  );
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /postcutover_normal_release_head value[\s\S]*?for update/);
  assert.match(
    sql,
    /where scope_key = 'BAGGER_INV_PRODUCTION'[\s\S]*?release_rebind_id =[\s\S]*?predecessor\.release_rebind_id/,
  );
  assert.match(sql, /PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_HEAD_ADVANCED/);
  assert.match(sql, /PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_TARGET_ALREADY_USED/);
  assert.match(sql, /PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_REQUEST_CONFLICT/);
  assert.match(sql, /PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_STALE_REPLAY/);
});

test("the existing canonical v2 route is adapted only for an authorized normal release", () => {
  assert.match(
    sql,
    /rebind_production_maintenance_precommit_deployment_pre_normal_release/,
  );
  assert.match(
    sql,
    /activation\.state <> 'SCORING_COMMITTED'[\s\S]*?activation\.read_cutover_phase <> 'OBSERVATION'[\s\S]*?rebind_production_maintenance_precommit_deployment_pre_normal_release/,
  );
  assert.match(
    sql,
    /where value\.release_kind = 'NORMAL'[\s\S]*?value\.request_fingerprint = pg_catalog\.lower/,
  );
  assert.match(
    sql,
    /value\.status = 'PENDING'[\s\S]*?normalized := input \|\| pg_catalog\.jsonb_build_object/,
  );
  assert.match(
    sql,
    /'expected_predecessor_deployment_id',[\s\S]*?input->>'original_deployment_id'/,
  );
  assert.match(
    sql,
    /'expected_release_sequence', intent\.release_sequence/,
  );
  assert.match(
    sql,
    /return production_control\.rebind_production_postcutover_normal_release\(\s*normalized\s*\)/,
  );
  assert.match(sql, /PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_INTENT_REQUIRED/);
});

test("exact lost-response retry is payload-bound and cannot replay an older head", () => {
  assert.match(sql, /intent_input jsonb := input - 'runtime_observed_at'/);
  assert.match(
    sql,
    /where value\.request_fingerprint = pg_catalog\.lower\([\s\S]*?input->>'request_fingerprint'/,
  );
  assert.match(
    sql,
    /existing\.payload_hash is distinct from[\s\S]*?cutover_payload_hash\(intent_input\)/,
  );
  assert.match(
    sql,
    /head\.release_rebind_id is distinct from existing\.release_rebind_id/,
  );
  assert.match(
    sql,
    /return existing\.response_value \|\| pg_catalog\.jsonb_build_object\(\s*'idempotent', true\s*\)/,
  );
  assert.match(
    sql,
    /store_cutover_receipt\(\s*'REBIND_POSTCUTOVER_NORMAL_RELEASE', intent_input, response_value\s*\)/,
  );
});

test("unhealthy authority, ingress, workers, transitions, rollback, and reconciliation reject", () => {
  for (const predicate of [
    /activation\.state <> 'SCORING_COMMITTED'/,
    /activation\.read_cutover_phase <> 'OBSERVATION'/,
    /activation\.current_authority <> 'SUPABASE'/,
    /activation\.maintenance_state <> 'NORMAL'/,
    /not activation\.scoring_ingress_enabled/,
    /activation\.active_transition_epoch_id is not null/,
    /not resource\.scoring_ingress_enabled/,
    /not resource\.workers_enabled/,
    /gate\.authority <> 'SUPABASE'/,
    /gate\.state <> 'OPEN'/,
    /gate\.unresolved_client_queues <> 0/,
    /scoring_admission_unresolved_count\([\s\S]*?gate\.admission_generation_id/,
    /value\.status = 'PREPARED'/,
    /value\.closure_kind = 'SUPABASE_INGRESS'[\s\S]*?value\.status in \('CLOSING', 'CLOSED'\)/,
    /not odds_runtime\.enabled/,
    /controls\.enabled[\s\S]*?controls\.metadata->>'deployment_commit' = head\.deployment_commit/,
    /controls\.worker_name = 'ODDS_CALCULATION'[\s\S]*?controls\.metadata->>'activation_epoch_id' = epoch\.epoch_id::text/,
    /controls\.worker_name not in \([\s\S]*?'SCORING_GOOGLE_OUTBOX'[\s\S]*?'ROUND_SCORECARDS_ARCHIVE'[\s\S]*?'ODDS_CALCULATION'[\s\S]*?controls\.enabled[\s\S]*?or controls\.scheduler_installed[\s\S]*?or controls\.google_writes_allowed/,
  ]) assert.match(sql, predicate);
  assert.match(sql, /'pending_rollback_or_reconciliation', false/);
  assert.match(sql, /PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_NOT_SAFE/);
});

test("atomic mutation updates deployment metadata and revisions without changing authority or data", () => {
  const activationUpdate = statement(
    /update production_control\.cutover_activation_state[\s\S]*?where scope_key = 'BAGGER_INV_PRODUCTION';/,
    "activation update",
  );
  assert.match(activationUpdate, /expected_deployment_commit = input->>'deployment_commit'/);
  assert.match(activationUpdate, /activation_revision = next_activation_revision/);
  assert.doesNotMatch(
    activationUpdate,
    /\b(?:state|boundary_mode|read_cutover_phase|current_authority|maintenance_state|scoring_ingress_enabled|authority_generation_id|active_transition_epoch_id)\s*=/,
  );

  const gateUpdate = statement(
    /update scoring_authority\.ingress_gates[\s\S]*?where tournament_id = '2026';/,
    "gate update",
  );
  assert.match(gateUpdate, /admission_deployment_id = input->>'deployment_id'/);
  assert.doesNotMatch(
    gateUpdate,
    /\b(?:authority|state|admission_state|active_epoch_id|admission_generation_id|admission_protocol_enforced)\s*=/,
  );

  const workersUpdate = statement(
    /update production_control\.worker_controls[\s\S]*?where worker_name in \([\s\S]*?\);/,
    "worker update",
  );
  assert.match(workersUpdate, /postcutover_normal_release_sequence/);
  assert.doesNotMatch(
    workersUpdate,
    /\b(?:enabled|scheduler_installed|google_writes_allowed)\s*=/,
  );

  const oddsUpdate = statement(
    /update production_control\.odds_calculation_runtime[\s\S]*?where scope_key = 'BAGGER_INV_PRODUCTION';/,
    "Odds update",
  );
  assert.match(oddsUpdate, /deployment_commit = input->>'deployment_commit'/);
  assert.doesNotMatch(oddsUpdate, /\b(?:enabled|operation_mode|cutover_phase)\s*=/);
  assert.doesNotMatch(sql, /update production_control\.resource_scope/i);
  assert.doesNotMatch(sql, /update\s+(?:public\.)?(?:players|teams|rounds|matches|scores)\b/i);
});

test("RLS, service-role entrypoint, fixed search paths, and Provider Fence remain unchanged", () => {
  assert.match(
    sql,
    /alter table production_control\.postcutover_normal_release_rebindings[\s\S]*?enable row level security/,
  );
  assert.match(
    sql,
    /alter table production_control\.postcutover_normal_release_head[\s\S]*?enable row level security/,
  );
  assert.match(
    sql,
    /alter table production_control\.postcutover_normal_release_intents[\s\S]*?enable row level security/,
  );
  assert.match(
    sql,
    /revoke all on table[\s\S]*?postcutover_normal_release_rebindings,[\s\S]*?postcutover_normal_release_head[\s\S]*?from public, anon, authenticated, service_role/,
  );
  assert.match(
    sql,
    /production_control\.rebind_production_postcutover_normal_release\(input jsonb\)[\s\S]*?security definer[\s\S]*?set search_path = pg_catalog/,
  );
  assert.match(
    sql,
    /public\.rebind_production_postcutover_normal_release\(input jsonb\)[\s\S]*?security definer[\s\S]*?set search_path = pg_catalog/,
  );
  assert.match(
    sql,
    /grant execute on function[\s\S]*?public\.rebind_production_postcutover_normal_release\(jsonb\)[\s\S]*?to service_role/,
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
