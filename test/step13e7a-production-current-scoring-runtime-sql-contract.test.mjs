import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL(
  "../supabase/production_migrations/202608300067_production_current_scoring_runtime_v1.sql",
  import.meta.url,
), "utf8");

const futureRpcs = [
  "future_production_read_scoring_authority_v1",
  "future_production_read_scoring_participant_context_v1",
  "future_production_submit_hole_score_v1",
  "future_production_mutate_match_control_v1",
  "future_production_finalize_match_v1",
  "future_production_reopen_match_v1",
  "future_production_claim_google_outbox_v1",
  "future_production_claim_google_outbox_event_v1",
  "future_production_complete_google_outbox_v1",
  "future_production_fail_google_outbox_v1",
  "future_production_inspect_scoring_workers_v1",
  "future_production_claim_scorecard_archive_job_v1",
  "future_production_complete_scorecard_archive_job_v1",
  "future_production_fail_scorecard_archive_job_v1",
  "future_production_inspect_scorecard_archive_state_v1",
];

test("067 is additive and leaves every frozen 2026 RPC untouched", () => {
  assert.doesNotMatch(sql, /alter\s+function\s+(?:public|production_control)\./i);
  for (const name of [
    "read_production_scoring_authority", "submit_production_hole_score",
    "mutate_production_match_control", "finalize_production_match",
    "reopen_production_match", "claim_production_google_outbox",
  ]) assert.doesNotMatch(sql, new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\(`,
    "i",
  ));
});

test("future runtime is pointer and independent-generation bound", () => {
  for (const marker of [
    "current_tournament_pointer_v1", "future_annual_runtime_generations_v1",
    "generation_status = 'ACTIVE'", "generation.authority <> 'SUPABASE'",
    "generation.ingress_state <> 'OPEN'", "expected_current_tournament_id",
    "expected_pointer_revision", "expected_runtime_generation_id",
    "expected_annual_authority_generation_id",
    "expected_annual_admission_generation_id", "active_generation_count <> 1",
  ]) assert.ok(sql.includes(marker), marker);
  assert.match(sql, /assert_production_scoring_runtime\s*\(\s*input\s*,\s*required_worker/i);
});

test("activation capability is inert and fail closed", () => {
  assert.match(sql, /assert_future_scoring_runtime_capability_v1/i);
  assert.match(sql, /generation_status\s*<>\s*'PREPARED'/i);
  assert.match(sql, /FUTURE_SCORING_RUNTIME_CAPABILITY_INVALID/i);
  assert.doesNotMatch(sql, /insert\s+into\s+production_control\.future_annual_runtime_generations_v1/i);
  assert.doesNotMatch(sql, /update\s+production_control\.current_tournament_pointer_v1/i);
});

test("actor and MARK_LIVE assertions are target scoped", () => {
  for (const marker of [
    "participant_identity.user_player_links",
    "participant_identity.participant_auth_identifiers",
    "participant_identity.tournament_roles",
    "scoring_authority.tournament_players",
    "assert_future_production_match_scoring_ready_v1",
    "future_runtime_match_bindings_v2", "runtime_state <> 'PREPARED'",
    "SCORING_SNAPSHOT_NOT_CURRENT", "PAIRINGS_INCOMPLETE",
    "HANDICAP_CONTEXT_NOT_CURRENT", "COURSE_HOLES_INCOMPLETE",
    "PRODUCTION_MATCH_NOT_SCORING_READY",
  ]) assert.ok(sql.includes(marker), marker);
});

test("future RPC surface is complete and service-role only", () => {
  for (const name of futureRpcs) {
    assert.match(sql, new RegExp(`function\\s+public\\.${name}\\s*\\(`, "i"));
    assert.ok(sql.includes(`public.${name}(jsonb)`), name);
  }
  assert.match(sql, /revoke all on function %s from public, anon, authenticated, service_role/i);
  assert.match(sql, /grant execute on function %s to service_role/i);
  assert.doesNotMatch(sql, /grant\s+execute[\s\S]*?to\s+(?:anon|authenticated)/i);
  assert.match(sql, /set\s+search_path\s*=\s*pg_catalog/gi);
});

test("future writes and worker queues remain target scoped", () => {
  for (const table of [
    "matches", "tournament_players", "scoring_snapshots",
    "google_outbox_events", "scorecard_archive_jobs",
    "finalized_scorecard_snapshots", "scorecard_archive_checkpoints",
  ]) assert.match(sql, new RegExp(`${table}[\\s\\S]{0,800}target_tournament`, "i"));
  assert.match(sql, /insert\s+into\s+scoring_authority\.audit_events[\s\S]*?target_tournament/i);
  assert.match(sql, /insert\s+into\s+scoring_authority\.google_outbox_events[\s\S]*?target_tournament/i);
  assert.doesNotMatch(sql, /update\s+auth\.users|insert\s+into\s+auth\.users/i);
});
