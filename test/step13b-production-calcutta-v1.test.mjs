import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/production_migrations/202608290056_production_calcutta_v1.sql",
  import.meta.url,
);
const migration = await readFile(migrationUrl, "utf8");

function functionBody(name) {
  const marker = `create or replace function ${name}`;
  const start = migration.toLowerCase().indexOf(marker.toLowerCase());
  assert.notEqual(start, -1, `${name} must exist`);
  const next = migration.toLowerCase().indexOf(
    "create or replace function ",
    start + marker.length,
  );
  return migration.slice(start, next === -1 ? migration.length : next);
}

test("Calcutta V1 installation is additive and leaves Production NOT_CONFIGURED", () => {
  assert.match(migration, /^begin;/m);
  assert.match(migration, /notify pgrst, 'reload schema';\s*commit;\s*$/);
  assert.equal((migration.match(/^begin;/gm) || []).length, 1);
  assert.equal((migration.match(/^commit;/gm) || []).length, 1);
  assert.match(migration, /'2026', 1, 'production-calcutta-v1', 'NOT_CONFIGURED'/);
  assert.match(migration, /on conflict \(tournament_id, configuration_revision\) do nothing/);
  assert.match(migration, /on conflict \(tournament_id\) do nothing/);
  assert.match(migration, /select '2026'[\s\S]*0, 0, 'UNPUBLISHED', 'NOT_CONFIGURED', 0/);
  assert.doesNotMatch(migration, /\bAUCTION_OPEN\b/);
  assert.doesNotMatch(migration, /(?:update|delete\s+from)\s+production_control\.(?:resource_scope|cutover_activation_state|worker_activation_state|maintenance_state)/i);
  assert.doesNotMatch(migration, /insert\s+into\s+production_control\.(?:resource_scope|cutover_activation_state|worker_activation_state|maintenance_state)/i);
  assert.doesNotMatch(migration, /(?:insert|update|delete)\s+(?:into\s+|from\s+)?scoring_authority\.calcutta_configurations/i);
});

test("configuration, auction facts, publication, jobs, and results are separate revision ledgers", () => {
  for (const table of [
    "calcutta_v1_configuration_revisions",
    "calcutta_v1_auction_fact_revisions",
    "calcutta_v1_publication_revisions",
    "calcutta_v1_current",
    "calcutta_v1_recalculation_jobs",
    "calcutta_v1_result_revisions",
  ]) {
    assert.match(migration, new RegExp(`create table scoring_authority\\.${table}\\b`, "i"));
    assert.match(migration, new RegExp(`alter table scoring_authority\\.${table}\\s+enable row level security`, "i"));
  }
  assert.match(migration, /configuration_revision bigint not null check \(configuration_revision > 0\)/);
  assert.match(migration, /auction_revision bigint not null check \(auction_revision > 0\)/);
  assert.match(migration, /publication_revision bigint not null check \(publication_revision > 0\)/);
  assert.match(migration, /result_revision bigint not null check \(result_revision > 0\)/);
  assert.match(migration, /status in \('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SUPERSEDED'\)/);
  assert.match(migration, /state in \([\s\S]*'NOT_CONFIGURED'[\s\S]*'CONFIGURED'[\s\S]*'AUCTION_COMPLETE'[\s\S]*'IN_PROGRESS'[\s\S]*'OFFICIAL'[\s\S]*'UNAVAILABLE'/);
});

test("Director configuration preserves only established Calcutta rules", () => {
  const build = functionBody(
    "production_control.build_production_calcutta_v1_configuration",
  );
  const configure = functionBody("public.configure_production_calcutta_v1");
  assert.match(build, /'auction_unit', 'PLAYER'/);
  assert.match(build, /'auction_workflow', 'MANUAL_FINAL_AUCTION_FACTS'/);
  assert.match(build, /'live_bidding', false/);
  assert.match(build, /'minimum_bid', null/);
  assert.match(build, /'opening_bid', null/);
  assert.match(build, /'bid_increment', null/);
  assert.match(build, /'pot_rule', 'SUM_PURCHASE_PRICES'/);
  assert.match(build, /'COMPETITION_RANK_WITH_OCCUPIED_PLACE_AWARD_AVERAGING'/);
  assert.match(build, /'payout_rounding', 'NONE'/);
  assert.match(build, /'PLAYER_PURCHASE_WITH_PAIRING_PERFORMANCE_SPLIT_EQUALLY'/);
  assert.match(build, /'settlement_tracking', 'NOT_MODELED'/);
  assert.match(build, /if total_payout <> 1/);
  assert.match(build, /row_value \?& array\[[\s\S]*'round_3_award'/);
  assert.match(build, /row_value \?& array\[[\s\S]*'overall_fraction'/);
  assert.match(configure, /assert_production_calcutta_v1_runtime\(input\)/);
  assert.match(configure, /assert_production_scoring_actor\(input, true\)/);
  for (const binding of [
    "expected_configuration_revision",
    "expected_configuration_fingerprint",
    "expected_auction_revision",
    "expected_auction_fingerprint",
    "expected_publication_revision",
  ]) assert.match(configure, new RegExp(binding));
  assert.match(configure, /publication_state = 'UNPUBLISHED'/);
  assert.match(configure, /current_value\.state = 'NOT_CONFIGURED'[\s\S]*current_value\.configuration_revision = 1[\s\S]*current_value\.auction_revision = 0[\s\S]*current_value\.publication_revision = 0[\s\S]*expected_configuration_fingerprint/);
  assert.match(configure, /then 'AUCTION_COMPLETE' else 'CONFIGURED'/);
  assert.match(configure, /status = 'SUPERSEDED'/);
  assert.match(configure, /set is_current = false, superseded_at = pg_catalog\.now\(\)/);
  assert.match(build, /DIRECTOR_CONTROLLED_PARTICIPANT_FULL_MARKET/);
});

test("manual auction replacement validates stable active Players and exact ownership without inventing money", () => {
  const build = functionBody(
    "production_control.build_production_calcutta_v1_auction",
  );
  const replace = functionBody(
    "public.replace_production_calcutta_v1_auction_facts",
  );
  assert.match(build, /purchase_value \?& array\[[\s\S]*'purchase_price'/);
  assert.match(build, /ownership_value \?& array\[[\s\S]*'ownership_fraction'/);
  assert.match(build, /price_value < 0/);
  assert.doesNotMatch(build, /pot_value\s*<=?\s*0/);
  assert.match(build, /pot_value := pot_value \+ price_value/);
  assert.match(build, /participation_status = 'ACTIVE'/);
  assert.match(build, /entrant_value = any\(seen_entrants\)/);
  assert.match(build, /entrant_value \|\| ':' \|\| owner_value/);
  assert.match(build, /ownership_fraction'\)::numeric[\s\S]*<> 1/);
  assert.match(build, /'entry_workflow', 'MANUAL_FINAL_AUCTION_FACTS'/);
  assert.match(replace, /assert_production_scoring_actor\(input, true\)/);
  assert.match(replace, /publication_state = 'UNPUBLISHED'/);
  assert.match(replace, /state = 'AUCTION_COMPLETE'/);
  assert.match(replace, /status = 'SUPERSEDED'/);
  assert.match(replace, /set is_current = false, superseded_at = pg_catalog\.now\(\)/);
});

test("publish and unpublish are explicit, revisioned, audited, and idempotent", () => {
  const publish = functionBody("public.publish_production_calcutta_v1");
  const unpublish = functionBody("public.unpublish_production_calcutta_v1");
  for (const [body, operation, state] of [
    [publish, "CALCUTTA_V1_PUBLISH", "PUBLISHED"],
    [unpublish, "CALCUTTA_V1_UNPUBLISH", "UNPUBLISHED"],
  ]) {
    assert.match(body, /assert_production_scoring_actor\(input, true\)/);
    assert.match(body, new RegExp(`lookup_cutover_receipt\\(\\s*'${operation}'`));
    assert.match(body, new RegExp(`store_cutover_receipt\\(\\s*'${operation}'`));
    assert.match(body, /expected_configuration_revision/);
    assert.match(body, /expected_configuration_fingerprint/);
    assert.match(body, /expected_auction_revision/);
    assert.match(body, /expected_auction_fingerprint/);
    assert.match(body, /expected_publication_revision/);
    assert.match(body, new RegExp(`publication_state = '${state}'`));
    assert.match(body, /operation_audit_events/);
  }
  assert.match(publish, /PRODUCTION_CALCUTTA_V1_ALREADY_PUBLISHED/);
  assert.match(publish, /PRODUCTION_CALCUTTA_V1_ALREADY_PUBLISHED[\s\S]*'idempotent', true/);
  assert.match(publish, /enqueue_production_calcutta_v1\(/);
  assert.match(unpublish, /PRODUCTION_CALCUTTA_V1_ALREADY_UNPUBLISHED/);
  assert.match(unpublish, /PRODUCTION_CALCUTTA_V1_ALREADY_UNPUBLISHED[\s\S]*'idempotent', true/);
  assert.doesNotMatch(unpublish, /calcutta_v1_result_revisions\s+set|calcutta_v1_auction_fact_revisions\s+set/);
  assert.match(unpublish, /'state_preserved', current_value\.state/);
});

test("one JS-owned deterministic job lifecycle handles score correction, Reopen, and Finalize", () => {
  const enqueue = functionBody(
    "production_control.enqueue_production_calcutta_v1",
  );
  const claim = functionBody(
    "public.claim_production_calcutta_v1_recalculation",
  );
  const complete = functionBody(
    "public.complete_production_calcutta_v1_recalculation",
  );
  const validation = functionBody(
    "production_control.validate_production_calcutta_v1_result",
  );
  assert.match(migration, /production_calcutta_v1_hole_score_recalculation/);
  assert.match(migration, /production_calcutta_v1_match_lifecycle_recalculation/);
  assert.match(migration, /production_calcutta_v1_round_lifecycle_recalculation/);
  assert.match(migration, /drop trigger if exists calcutta_official_match_change/);
  assert.match(migration, /'CANONICAL_SCORE_CHANGED'/);
  assert.match(migration, /'CANONICAL_MATCH_LIFECYCLE_CHANGED'/);
  assert.match(migration, /'CANONICAL_ROUND_LIFECYCLE_CHANGED'/);
  assert.match(enqueue, /configuration_fingerprint =\s*current_value\.configuration_fingerprint/);
  assert.match(enqueue, /auction_fingerprint = current_value\.auction_fingerprint/);
  assert.match(enqueue, /activation_revision = activation\.activation_revision/);
  assert.match(enqueue, /source_fingerprint = source_fingerprint_value/);
  assert.doesNotMatch(enqueue, /calcutta_v1_result_revisions\s+set is_current = false/);
  assert.match(claim, /for update skip locked/);
  assert.match(claim, /attempts < 5/);
  assert.match(claim, /activation_revision =\s*\(input->>'expected_activation_revision'\)::bigint/);
  assert.match(claim, /SOURCE_ADVANCED_BEFORE_CLAIM/);
  assert.match(claim, /'configuration'[\s\S]*'purchases'[\s\S]*'ownership'[\s\S]*'point_structure'[\s\S]*'payout_structure'[\s\S]*'core_view'/);
  assert.match(complete, /input->>'engine_version' is distinct from 'calcutta-js-v1'/);
  assert.match(complete, /requested_result_state not in \('PROVISIONAL', 'OFFICIAL'\)/);
  assert.match(complete, /PRODUCTION_CALCUTTA_SOURCE_REVISION_CONFLICT/);
  assert.match(complete, /PRODUCTION_CALCUTTA_RESULT_REVISION_CONFLICT/);
  assert.match(complete, /set is_current = false, superseded_at = pg_catalog\.now\(\)/);
  assert.match(validation, /calcutta_v1_completed_rounds\(\)/);
  assert.match(validation, /completed_rounds is distinct from canonical_completed_rounds/);
  assert.match(validation, /not \(3 = any\(completed_rounds\)\)/);
  assert.match(validation, /project_production_calcutta_v1_result/);
  assert.doesNotMatch(migration, /payoutPercent\s*[*+\/-]|currentPayoutValue\s*[*+\/-]|overallPayoutPercent\s*[*+\/-]/);
});

test("participant read is Production-only, membership-bound, publication-safe, and cache-versioned", () => {
  const read = functionBody("public.read_production_calcutta_v1");
  const projection = functionBody(
    "production_control.project_production_calcutta_v1_result",
  );
  assert.match(read, /assert_production_service_role\(\)/);
  assert.match(read, /assert_production_cutover_read_scope\(\s*input, 'OBSERVATION'/);
  assert.match(read, /input->>'tournament_id' is distinct from '2026'/);
  assert.match(read, /participant_player = ''/);
  assert.match(read, /membership\.player_id = participant_player/);
  assert.match(read, /membership\.participation_status = 'ACTIVE'/);
  assert.match(read, /current_value\.publication_state = 'PUBLISHED'/);
  assert.match(read, /else\s+market_value := null/);
  assert.match(read, /and state_value <> 'UNAVAILABLE'/);
  assert.match(read, /project_production_calcutta_v1_result/);
  assert.match(read, /result_is_stale/);
  assert.match(read, /result_value\.source_fingerprint <> source_fingerprint_value/);
  assert.match(read, /when result_is_stale and updating_value/);
  assert.match(read, /when result_is_stale then 'UNAVAILABLE'/);
  assert.match(read, /not \(3 = any\(completed_rounds_value\)\) then 'UNAVAILABLE'/);
  assert.match(read, /'calcutta-v1:%s:%s:%s:%s:%s:%s'/);
  assert.match(read, /'publication_policy',[\s\S]*'DIRECTOR_CONTROLLED_PARTICIPANT_FULL_MARKET'/);
  assert.match(read, /'currency_code', 'USD'/);
  assert.match(read, /'purchase_price',[\s\S]*::numeric::text/);
  assert.match(read, /'ownership_fraction',[\s\S]*::numeric::text/);
  assert.match(projection, /This is an allowlist projection/);
  assert.doesNotMatch(projection, /engine_payload\s*\)?\s*(?:else|end|return)/i);
  for (const forbidden of ["email", "auth_user_id", "service_role", "credential"])
    assert.doesNotMatch(read, new RegExp(`'${forbidden}'`, "i"));
});

test("worker/admin inspection is distinct, service-only, and fact-free", () => {
  const inspect = functionBody("public.inspect_production_calcutta_v1");
  assert.match(inspect, /assert_production_service_role\(\)/);
  assert.match(inspect, /assert_production_cutover_read_scope\(\s*input, 'OBSERVATION'/);
  assert.match(inspect, /input->>'tournament_id' is distinct from '2026'/);
  assert.match(inspect, /'configuration_revision'/);
  assert.match(inspect, /'auction_revision'/);
  assert.match(inspect, /'publication_revision'/);
  assert.match(inspect, /'result_revision'/);
  assert.match(inspect, /'configuration_fingerprint'/);
  assert.match(inspect, /'auction_fingerprint'/);
  assert.doesNotMatch(inspect, /'market'|'result'|'purchases'|'ownership'|display_name|email|auth_user_id/i);
});

test("all V1 functions are fixed-search-path security definers and clients have no direct writes", () => {
  const functionHeaders = [...migration.matchAll(
    /create or replace function\s+([\w.]+)\s*\([^]*?\)\s*returns[^]*?security definer\s*set search_path\s*=\s*([^\n]+)\nas \$\$/gi,
  )];
  assert.ok(functionHeaders.length >= 15);
  for (const [, name, searchPath] of functionHeaders) {
    assert.doesNotMatch(searchPath, /\bpublic\b|pg_temp/i, `${name} search_path`);
    assert.match(searchPath, /pg_catalog/i, `${name} search_path`);
  }
  assert.match(migration, /revoke all on table[\s\S]*from public, anon, authenticated, service_role/);
  for (const rpc of [
    "configure_production_calcutta_v1",
    "replace_production_calcutta_v1_auction_facts",
    "publish_production_calcutta_v1",
    "unpublish_production_calcutta_v1",
    "enqueue_production_calcutta_v1_recalculation",
    "claim_production_calcutta_v1_recalculation",
    "complete_production_calcutta_v1_recalculation",
    "fail_production_calcutta_v1_recalculation",
    "read_production_calcutta_v1",
    "inspect_production_calcutta_v1",
  ]) {
    assert.match(migration, new RegExp(
      `revoke all on function\\s+(?:public\\.)?${rpc}\\(jsonb\\)\\s+from public, anon, authenticated, service_role;[\\s\\S]*?grant execute on function\\s+(?:public\\.)?${rpc}\\(jsonb\\)\\s+to service_role;`,
      "i",
    ));
  }
  assert.doesNotMatch(migration, /grant\s+(?:insert|update|delete|all)\s+on table[\s\S]*to\s+(?:anon|authenticated)/i);
});

test("Production contract contains no Google or Preview runtime fallback", () => {
  assert.doesNotMatch(migration, /replace_preview_calcutta_configuration|request_preview_calcutta_recalculation|claim_preview_calcutta_recalculation|write_preview_calcutta_result|fail_preview_calcutta_recalculation/);
  assert.doesNotMatch(migration, /updateDirectorCalcutta|publishOfficialCalcutta|Google Sheets API|sheets\.googleapis/i);
  assert.match(migration, /current_authority <> 'SUPABASE'/);
  assert.match(migration, /scoring_authority <> 'SUPABASE'/);
  assert.match(migration, /participant_identity_authority <> 'SUPABASE'/);
  assert.match(migration, /current_tournament_read_authority <> 'SUPABASE'/);
});
