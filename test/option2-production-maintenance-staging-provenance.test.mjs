import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/production_migrations/202608280049_production_maintenance_staging_provenance.sql",
  import.meta.url,
);
const sql = await readFile(migrationUrl, "utf8");

test("maintenance staging provenance is exact-release and maintenance-only", () => {
  assert.match(sql, /6911c63cee6f6fe40c03a95bf7a7ba824be0d1fb/);
  assert.match(sql, /boundary_mode' is distinct from 'MAINTENANCE_WINDOW_V1'/);
  assert.match(sql, /production-maintenance-staging-provenance-v1/);
  assert.match(sql, /production-maintenance-environment-delta-v2/);
  assert.match(sql, /BAGGER_STEP12_MAINTENANCE_ENVIRONMENT_DELTA_V2/);
  assert.match(sql, /BAGGER_MAINTENANCE_WINDOW_RELEASE_CERTIFICATION_V1/);

  assert.doesNotMatch(
    sql,
    /create or replace function\s+public\.stage_production_cutover_release\s*\(/i,
  );
  assert.doesNotMatch(
    sql,
    /create or replace function\s+public\.stage_production_cutover_release_provider_fence_v2\s*\(/i,
  );
  assert.doesNotMatch(sql, /step11-6-production-google-drive-acl-v2-acceptance-v1/);
  assert.doesNotMatch(sql, /providerFenceRehearsal|aclV2Acceptance/);
});

test("maintenance provenance is derived from strict resources, live tokens, and semantic parity", () => {
  for (const exactValue of [
    "ymqhhtxaywtqllynrmxe",
    "https://ymqhhtxaywtqllynrmxe.supabase.co",
    "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4",
    "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
    "https://baggerinv.com",
    "production-shadow-candidate-v1",
    "production-current-shadow-semantic-parity-v1",
    "202608270044_production_maintenance_window_cutover.sql",
    "202608270048_production_current_shadow_semantic_fingerprint.sql",
  ]) assert.ok(sql.includes(exactValue), `missing exact binding ${exactValue}`);

  assert.match(sql, /selected_configuration is distinct from expected_configuration/);
  assert.match(sql, /expected_activation_revision/);
  assert.match(sql, /expected_authority_generation/);
  assert.match(sql, /expected_admission_revision/);
  assert.match(sql, /expected_admission_generation/);
  assert.match(sql, /read_production_current_tournament_shadow/);
  assert.match(sql, /semantic_payload_parity' is distinct from 'true'/);
  assert.match(sql, /semantic_database_parity' is distinct from 'true'/);
  assert.match(sql, /google_supabase_difference_sections/);
  assert.match(sql, /semantic_difference_sections/);
  assert.match(sql, /unexplained_semantic_difference_count', 0/);
});

test("database computes and rechecks both provenance claims", () => {
  const digestCount = (sql.match(/extensions\.digest\(/g) || []).length;
  assert.ok(digestCount >= 2, "both manifests must be hashed in PostgreSQL");
  assert.match(
    sql,
    /provenance->>'certification_fingerprint' is distinct from\s+certification_fingerprint/,
  );
  assert.match(
    sql,
    /provenance->>'environment_delta_fingerprint_v2' is distinct from\s+environment_fingerprint/,
  );
  assert.match(sql, /staged_certification_fingerprint = certification_fingerprint/);
  assert.match(
    sql,
    /staged_environment_delta_fingerprint_v2 = environment_fingerprint/,
  );
});

test("authority, admission, worker, isolation, and first-write gates fail closed", () => {
  for (const requiredPredicate of [
    "activation.state <> 'DORMANT'",
    "activation.current_authority <> 'GOOGLE'",
    "activation.read_cutover_phase <> 'STATIC_BACKEND'",
    "activation.maintenance_state <> 'NORMAL'",
    "resource.participant_identity_authority <> 'PASSPORT'",
    "gate.admission_state <> 'OPEN'",
    "gate.state <> 'PAUSED'",
    "worker_count <> 0",
    "worker_contract_count <> 0",
    "unresolved_lease_count <> 0",
    "activation.first_supabase_write_possible_at is not null",
    "activation.first_supabase_write_observed_at is not null",
    "preview_no_authoritative_features",
  ]) assert.ok(sql.includes(requiredPredicate), `missing ${requiredPredicate}`);
});

test("stale retries fail closed and semantic facts stay locked through staging", () => {
  const stageFunctionStart = sql.indexOf(
    "production_control.stage_production_maintenance_release(input jsonb)",
  );
  assert.notEqual(stageFunctionStart, -1);
  const stageFunction = sql.slice(stageFunctionStart);

  for (const retryPredicate of [
    "activation.activation_revision is distinct from",
    "(input->>'expected_activation_revision')::bigint + 1",
    "activation.authority_generation_id is distinct from",
    "activation.read_cutover_phase <> 'STATIC_BACKEND'",
    "resource.current_tournament_read_authority <> 'GOOGLE'",
    "resource.participant_identity_authority <> 'PASSPORT'",
    "resource.public_supabase_reads_enabled",
    "gate.admission_revision is distinct from",
    "gate.admission_generation_id is distinct from",
  ]) {
    assert.ok(
      stageFunction.includes(retryPredicate),
      `missing stale-retry predicate ${retryPredicate}`,
    );
  }

  const lockStart = stageFunction.indexOf("lock table");
  const provenanceRecheck = stageFunction.indexOf("provenance :=", lockStart);
  const baseStage = stageFunction.indexOf(
    "public.stage_production_cutover_release_pre_step11_6_rehearsal(input)",
    lockStart,
  );
  assert.ok(lockStart >= 0, "semantic table lock is required");
  assert.ok(provenanceRecheck > lockStart, "lock must precede parity recheck");
  assert.ok(baseStage > provenanceRecheck, "lock must span the base stage");
  assert.match(stageFunction.slice(lockStart, provenanceRecheck), /in share mode/);

  for (const lockedRelation of [
    "production_control.import_runs",
    "production_control.current_shadow_revisions",
    "production_control.current_shadow_semantic_baselines",
    "scoring_authority.tournaments",
    "scoring_authority.players",
    "scoring_authority.teams",
    "scoring_authority.rounds",
    "scoring_authority.matches",
    "scoring_authority.hole_scores",
    "scoring_authority.google_match_checkpoints",
    "scoring_authority.authority_epochs",
    "scoring_authority.google_outbox_events",
  ]) {
    assert.ok(
      stageFunction.slice(lockStart, provenanceRecheck).includes(lockedRelation),
      `missing staging lock for ${lockedRelation}`,
    );
  }
});

test("new functions retain fixed-search-path and service-role protections", () => {
  assert.match(
    sql,
    /production_maintenance_stage_provenance_v1[\s\S]*?security definer[\s\S]*?set search_path = pg_catalog/i,
  );
  assert.match(
    sql,
    /inspect_production_maintenance_stage_provenance[\s\S]*?security definer[\s\S]*?set search_path = pg_catalog/i,
  );
  assert.match(
    sql,
    /revoke all on function[\s\S]*?inspect_production_maintenance_stage_provenance\(jsonb\)[\s\S]*?from public, anon, authenticated, service_role/i,
  );
  assert.match(
    sql,
    /grant execute on function[\s\S]*?inspect_production_maintenance_stage_provenance\(jsonb\)[\s\S]*?to service_role/i,
  );
});
