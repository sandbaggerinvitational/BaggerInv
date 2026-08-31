import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/production_migrations/202608300076_production_annual_side_game_activation_v1.sql",
  import.meta.url,
);

const source = await readFile(migrationUrl, "utf8");
const derivedFenceSource = await readFile(new URL(
  "../supabase/production_migrations/202608300077_production_annual_derived_worker_close_fence_v1.sql",
  import.meta.url,
), "utf8");

test("annual activation binds an immutable deterministic side-game implementation certificate", () => {
  assert.match(source,
    /create table production_control\.annual_side_game_runtime_certifications_v1/);
  assert.match(source,
    /annual_side_game_implementation_manifest_v1\(\)/);
  assert.match(source,
    /future_runtime_hash_v2\(\s*implementation_manifest_value/);
  assert.match(source,
    /generation\.generation_status not in \('PREPARED', 'ACTIVE'\)/);
  assert.match(source,
    /retained\.implementation_manifest is distinct from\s*implementation_manifest_value/);
  assert.match(source,
    /retained\.certification_fingerprint is distinct from\s*certification_fingerprint_value/);
  assert.match(source,
    /reject_future_runtime_immutable_v2/);
  assert.match(source,
    /enable row level security/);
  assert.doesNotMatch(source,
    /grant execute on function\s+production_control\.ensure_annual_side_game_runtime_v1/);
});

test("certificate covers material Odds, Net Skins, and Calcutta algorithms and exact annual resources", () => {
  for (const signature of [
    "public.dispatch_production_annual_odds_v1(jsonb)",
    "production_control.assert_annual_odds_job_scope_v1(jsonb,text,scoring_authority.odds_calculation_jobs)",
    "production_control.assert_annual_net_skins_v1(jsonb,text)",
    "production_control.enqueue_annual_net_skins_v1_round(text,uuid,integer,text,text)",
    "production_control.normalize_annual_net_skins_v1_official_result(text,integer,jsonb)",
    "production_control.assert_annual_calcutta_runtime_v1(jsonb,text)",
    "production_control.build_annual_calcutta_v1_auction(jsonb,text)",
    "production_control.validate_annual_calcutta_v1_result(text,text,jsonb)",
    "scoring_authority.enqueue_production_calcutta_v1_change()",
  ]) assert.match(source, new RegExp(signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const field of [
    "projectRef", "projectUrl", "sourceWorkbookId", "tournamentId",
    "tournamentYear", "resourceRevision", "promotionRevision",
    "promotionFingerprint", "runtimeGenerationId", "pointerRevision",
    "authorityGenerationId", "admissionGenerationId",
    "googleWriterGenerationId", "googleTargetFingerprint",
  ]) assert.match(source, new RegExp(`'${field}'`));
  assert.doesNotMatch(source, /'lifecycleRevision', catalog\.lifecycle_revision/,
    "the READY-to-ACTIVE transition cannot invalidate an otherwise immutable certificate");
});

test("certificate binds the private annual resolver and capability chain", () => {
  for (const signature of [
    "production_control.assert_annual_scoring_runtime_v1(jsonb,text,text)",
    "production_control.assert_annual_scoring_runtime_pre_side_games_v1(jsonb,text,text)",
    "production_control.assert_annual_scoring_platform_v1(jsonb,text,text)",
    "production_control.annual_scoring_platform_certification_v1(jsonb)",
    "production_control.assert_future_production_scoring_runtime_v1(jsonb,text)",
    "production_control.assert_future_scoring_runtime_capability_v1(text,uuid,uuid,uuid)",
    "production_control.assert_future_scoring_runtime_capability_pre_side_games_v1(text,uuid,uuid,uuid)",
  ]) assert.match(source,
    new RegExp(signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const evidence of [
    "'source', procedure_value.prosrc",
    "'securityDefiner', procedure_value.prosecdef",
    "'volatility', procedure_value.provolatile::text",
    "pg_catalog.to_jsonb(procedure_value.proconfig)",
    "pg_catalog.to_jsonb(procedure_value.proacl)",
    "'effectiveExecute'",
  ]) assert.match(source,
    new RegExp(evidence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(source, /'coreRuntime'/);
  assert.match(source, /PRODUCTION_ANNUAL_CORE_RUNTIME_SECURITY_REQUIRED/);
  assert.match(source,
    /array\['search_path=pg_catalog'\]::text\[\]/);
  assert.match(source,
    /not pg_catalog\.has_function_privilege\(\s*'service_role'/);
});

test("prepare, scoring, reads, and predecessor closure all consume the certificate", () => {
  assert.match(source,
    /assert_future_scoring_runtime_capability_pre_side_games_v1/);
  assert.match(source,
    /ensure_annual_side_game_runtime_v1\([\s\S]*?true\s*\)/);
  assert.match(source,
    /assert_annual_scoring_runtime_pre_side_games_v1/);
  assert.match(source,
    /ensure_annual_side_game_runtime_v1\([\s\S]*?false\s*\)/);
  assert.match(source,
    /assert_annual_current_read_pre_side_games_v1/);
  assert.match(source,
    /annual_scoring_predecessor_certificate_pre_side_games_v1/);
});

test("predecessor fence blocks every nonterminal side-game job and generation mismatch", () => {
  assert.match(source,
    /net_skins_v1_recalculation_jobs[\s\S]*?status not in \('SUCCEEDED', 'SUPERSEDED'\)/);
  assert.match(source,
    /calcutta_v1_recalculation_jobs[\s\S]*?status not in \('SUCCEEDED', 'SUPERSEDED'\)/);
  assert.match(source,
    /odds_calculation_jobs[\s\S]*?status = 'FAILED'[\s\S]*?publication_status = 'NOT_REQUESTED'[\s\S]*?status = 'SUPERSEDED'[\s\S]*?publication_status = 'STALE'[\s\S]*?status = 'SUCCEEDED'[\s\S]*?publication_status in \('PUBLISHED', 'REHEARSAL_ONLY'\)/);
  assert.match(source,
    /odds_google_mirror_jobs[\s\S]*?status not in \('SUCCEEDED', 'SUPERSEDED'\)/);
  assert.match(source,
    /odds_google_mirror_jobs[\s\S]*?runtime_generation_id is distinct from runtime_generation/);
  assert.match(source, /PREDECESSOR_NET_SKINS_DRAIN_INCOMPLETE/);
  assert.match(source, /PREDECESSOR_CALCUTTA_DRAIN_INCOMPLETE/);
  assert.match(source, /PREDECESSOR_ODDS_DRAIN_INCOMPLETE/);
  assert.match(source, /PREDECESSOR_SIDE_GAME_GENERATION_MISMATCH/);
});

test("installation is inert and leaves the pointer on 2026", () => {
  assert.match(source, /PRODUCTION_ANNUAL_SIDE_GAME_INSTALL_NOT_INERT/);
  assert.match(source,
    /annual_side_game_runtime_certifications_v1[\s\S]*?tournament_id = '2026'/);
  assert.doesNotMatch(source, /insert into scoring_authority\.(?:odds|net_skins|calcutta)/);
});

test("annual dispatcher privilege topology is certified and direct targets remain private", () => {
  assert.match(source, /annualDispatchSecurity/);
  assert.match(source, /has_function_privilege\(\s*'service_role'/);
  assert.match(source, /has_function_privilege\(\s*'authenticated'/);
  assert.match(source, /has_function_privilege\(\s*'anon'/);
  assert.match(source,
    /PRODUCTION_ANNUAL_DISPATCH_PRIVILEGE_TOPOLOGY_REQUIRED/);
  assert.match(source,
    /dispatch_production_annual_scoring_v1\(jsonb\)/);
  assert.match(source, /dispatcher_service_execute is not true/);
});

test("derived-worker fence certifies exact triggers and synchronously marks canonical changes dirty", () => {
  for (const triggerName of [
    "production_annual_derived_v1_hole_score_change",
    "production_annual_derived_v1_match_change",
    "production_annual_derived_v1_odds_publication_change",
    "production_annual_derived_v1_net_skins_result_change",
  ]) assert.match(derivedFenceSource, new RegExp(triggerName));
  for (const invariant of [
    "predicate_absent", "constraint_absent", "non_deferrable",
    "initially_immediate", "actual_argument_count = 0",
  ]) assert.match(derivedFenceSource, new RegExp(invariant));
  assert.match(derivedFenceSource, /valid_count <> 9/);
  assert.match(derivedFenceSource, /'derivedTriggerFunction'/);
  assert.match(derivedFenceSource,
    /'source', procedure_value\.prosrc/);
  assert.match(derivedFenceSource,
    /'acl', coalesce\([\s\S]*?procedure_value\.proacl/);
  assert.match(derivedFenceSource,
    /PRODUCTION_ANNUAL_DERIVED_TRIGGER_FUNCTION_SECURITY_REQUIRED/);
  assert.match(derivedFenceSource,
    /not pg_catalog\.has_function_privilege\(\s*'service_role'/);
  assert.match(derivedFenceSource,
    /perform pg_catalog\.pg_advisory_xact_lock_shared\([\s\S]*scoring_admission_lock_key/);
  assert.match(derivedFenceSource,
    /NET_SKINS_CURRENT_RESULT_CHANGED[\s\S]*TOURNAMENT_STORYLINES/);
  for (const engine of [
    "TEAM_MOMENTUM", "TOURNAMENT_STORYLINES",
    "TOURNAMENT_INTELLIGENCE", "PROJECTION_EDITORIAL",
    "TOURNAMENT_FINAL_RECAP",
  ]) assert.match(derivedFenceSource, new RegExp(`'${engine}'`));
});

test("annual close drains exact derived engines and only SUCCEEDED is terminal", () => {
  assert.match(derivedFenceSource,
    /close_annual_scoring_predecessor_v1\([\s\S]*pg_advisory_xact_lock\([\s\S]*scoring_admission_lock_key/);
  assert.match(derivedFenceSource, /value\.status <> 'SUCCEEDED'/);
  assert.match(derivedFenceSource,
    /PRODUCTION_ANNUAL_PREDECESSOR_DERIVED_WORK_PENDING/);
  assert.match(derivedFenceSource,
    /PREDECESSOR_DERIVED_WORK_DRAIN_INCOMPLETE/);
  assert.match(derivedFenceSource,
    /PREDECESSOR_DERIVED_WORK_GENERATION_MISMATCH/);
  assert.doesNotMatch(derivedFenceSource,
    /engine_key in \('NET_SKINS', 'CALCUTTA'\)/);
});
