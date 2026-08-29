import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL(
  "../supabase/production_migrations/202608290055_production_net_skins_v1.sql",
  import.meta.url,
), "utf8");

test("migration 055 installs one inert NOT_CONFIGURED Production Net Skins V1 seed", () => {
  assert.match(migration, /installation is intentionally inert/i);
  assert.match(migration, /'2026', 1, 'production-net-skins-v1', 'NOT_CONFIGURED'/i);
  assert.match(migration, /'publication_policy', 'OFFICIAL_ONLY'/i);
  assert.match(migration, /'rounds', '\[\]'::jsonb/i);
  assert.match(migration, /on conflict \(tournament_id\) do nothing/i);
  const installation = migration.slice(
    0,
    migration.indexOf("create or replace function public.configure_production_net_skins_v1"),
  );
  assert.doesNotMatch(
    installation,
    /update\s+production_control\.(?:resource_scope|cutover_activation_state)|update\s+scoring_authority\.(?:ingress_gates|authority_epochs)/i,
  );
  assert.doesNotMatch(installation, /insert\s+into\s+scoring_authority\.calcutta/i);
});

test("configuration is exact-Production, Director-authorized, optimistic, and canonical-input derived", () => {
  assert.match(migration, /function public\.configure_production_net_skins_v1\(\s*input jsonb/i);
  assert.match(migration, /assert_production_net_skins_v1_runtime\(input\)/i);
  assert.match(migration, /assert_production_scoring_actor\(input, true\)/i);
  assert.match(migration, /expected_configuration_revision/i);
  assert.match(migration, /PRODUCTION_NET_SKINS_CONFIGURATION_REVISION_CONFLICT/i);
  assert.match(migration, /PRODUCTION_NET_SKINS_ACTIVATION_REVISION_CONFLICT/i);
  assert.match(migration, /vercel_project_id[\s\S]*prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU/i);
  assert.match(migration, /vercel_team_id[\s\S]*team_kPw5zaib8uaQJALAwj4fWI6R/i);
  assert.match(migration, /project_ref[\s\S]*source_workbook_id[\s\S]*tournament_id/i);
  assert.match(migration, /from scoring_authority\.rounds/i);
  assert.match(migration, /from scoring_authority\.matches/i);
  assert.match(migration, /from scoring_authority\.match_participants/i);
  assert.match(migration, /exists \([\s\S]*from scoring_authority\.tournament_players membership/i);
  assert.match(migration, /participant\.player_id ~ '\^\[A-Z0-9\]/i);
  assert.match(migration, /PRODUCTION_NET_SKINS_CANONICAL_INPUT_INCOMPLETE/i);
  assert.match(migration, /request_fingerprint[\s\S]*request_payload_hash/i);
  assert.match(migration, /PRODUCTION_NET_SKINS_IDEMPOTENCY_CONFLICT/i);
  assert.match(migration, /PRODUCTION_NET_SKINS_V1_CONFIGURED/i);
});

test("V1 freezes the already-defined business rules without SQL calculation math", () => {
  assert.match(migration, /when 'SC' then 50 else 25/i);
  assert.match(migration, /'eligible_holes'[\s\S]*generate_series\(1, 18\)/i);
  assert.match(migration, /CANONICAL_SCORING_SNAPSHOT_TEAM_STROKES/i);
  assert.match(migration, /CANONICAL_MATCH_PARTICIPANT_FINAL_STROKES/i);
  assert.match(migration, /ALL_ELIGIBLE_ENTRIES_18_HOLES_AND_REFERENCED_MATCHES_OFFICIAL/i);
  assert.match(migration, /'payout_rounding', 'NONE'/i);
  assert.match(migration, /'tie_rule', 'NO_SKIN_NO_CARRY'/i);
  assert.match(migration, /'carry_rule', 'NO_CARRY'/i);
  assert.match(migration, /engine_version = 'net-skins-js-v1'/i);
  assert.doesNotMatch(migration, /create or replace function[^$]+calculate_net_skins/i);
  assert.doesNotMatch(migration, /googleapis|docs\.google\.com|sheets\.google|pg_net|net\.http_/i);
});

test("recalculation jobs are serial, lease-bound, source-bound, and lifecycle driven", () => {
  for (const rpc of [
    "enqueue_production_net_skins_v1_recalculation",
    "claim_production_net_skins_v1_recalculation",
    "complete_production_net_skins_v1_recalculation",
    "fail_production_net_skins_v1_recalculation",
  ]) {
    assert.match(migration, new RegExp(`function public\\.${rpc}\\(`, "i"));
    assert.match(migration, new RegExp(`grant execute on function[\\s\\S]*?public\\.${rpc}\\(jsonb\\)[\\s\\S]*?to service_role`, "i"));
  }
  assert.match(migration, /one_active_job_per_round/i);
  assert.match(migration, /production-net-skins-v1:enqueue:2026:R%s/i);
  assert.match(migration, /value\.status in \('PENDING', 'RUNNING'\)[\s\S]*order by value\.requested_at desc/i);
  assert.doesNotMatch(
    migration,
    /unique \(\s*tournament_id, round_number, configuration_revision,\s*source_fingerprint/i,
  );
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /claim_token/i);
  assert.match(migration, /lease_expires_at <= pg_catalog\.now\(\)/i);
  assert.match(migration, /attempts >= 5/i);
  assert.match(migration, /PRODUCTION_NET_SKINS_JOB_LEASE_REQUIRED/i);
  assert.match(migration, /PRODUCTION_NET_SKINS_SOURCE_REVISION_CONFLICT/i);
  assert.match(migration, /PRODUCTION_NET_SKINS_RESULT_REVISION_CONFLICT/i);
  assert.match(migration, /production_net_skins_v1_hole_score_recalculation/i);
  assert.match(migration, /production_net_skins_v1_match_lifecycle_recalculation/i);
  assert.match(migration, /drop trigger if exists net_skins_hole_score_recalculation/i);
  assert.match(migration, /drop trigger if exists net_skins_match_lifecycle_recalculation/i);
  assert.match(migration, /if not found or current_value\.state <> 'CONFIGURED'/i);
  assert.match(migration, /status = 'SUPERSEDED'/i);
});

test("claim supplies canonical input and completion stores only engine-computed payloads", () => {
  assert.match(migration, /calculation_input := public\.read_net_skins_input_view\('2026'\)/i);
  assert.match(migration, /'calculation_input', calculation_input->'data'/i);
  assert.match(migration, /input->>'engine_version' is distinct from 'net-skins-js-v1'/i);
  assert.match(migration, /result_payload_value jsonb := input->'result_payload'/i);
  assert.match(migration, /payload_hash_value := production_control\.net_skins_v1_hash\(\s*result_payload_value/i);
  assert.match(migration, /normalize_production_net_skins_v1_official_result/i);
  assert.match(migration, /status <> 'FINAL'/i);
  assert.match(migration, /not match_value\.scorecard_complete/i);
  assert.match(migration, /match_value\.scored_holes <> 18/i);
  assert.match(migration, /match_value\.finalized_at is null/i);
  assert.match(migration, /result_state = 'OFFICIAL'[\s\S]*public_result_payload is not null[\s\S]*published_at is not null/i);
  assert.match(migration, /result_state = 'PROVISIONAL'[\s\S]*public_result_payload is null[\s\S]*published_at is null/i);
});

test("bounded V1 read distinguishes every state and exposes stable IDs with official-only results", () => {
  assert.match(migration, /function public\.read_production_net_skins_v1\(input jsonb\)/i);
  assert.match(migration, /assert_production_cutover_read_scope\(\s*input, 'OBSERVATION'/i);
  for (const state of [
    "NOT_CONFIGURED", "CONFIGURED", "IN_PROGRESS", "OFFICIAL", "UNAVAILABLE",
  ]) assert.match(migration, new RegExp(`'${state}'`));
  assert.match(migration, /'revision', revision_token/i);
  assert.match(migration, /net-skins-v1:%s:%s:%s/i);
  assert.match(migration, /'round_id', round_value->>'round_id'/i);
  assert.match(migration, /'match_ids', round_value->'match_ids'/i);
  assert.match(migration, /'entries', entries_value/i);
  assert.match(migration, /'entry_id', entry->>'entry_id'/i);
  assert.match(migration, /'player_ids', entry->'player_ids'/i);
  assert.match(migration, /'eligible_player_ids', eligible_players_value/i);
  assert.match(migration, /'result_payload', case when round_state = 'OFFICIAL'[\s\S]*else null end/i);
  assert.match(migration, /'official_results', case when round_state = 'OFFICIAL'[\s\S]*else null end/i);
  for (const field of [
    "skin_id", "hole_number", "match_id", "winner_entry_id",
    "winner_player_ids", "winning_net_score", "skin_value",
    "rank", "display_rank", "skins_won", "total_winnings",
    "winning_hole_numbers",
  ]) assert.match(migration, new RegExp(`'${field}'`));
  assert.match(migration, /'2026:R%s:H%s'/i);
});

test("RLS, fixed search paths, and grants prevent direct participant writes", () => {
  for (const table of [
    "net_skins_v1_configuration_revisions",
    "net_skins_v1_configuration_current",
    "net_skins_v1_recalculation_jobs",
    "net_skins_v1_result_revisions",
  ]) {
    assert.match(migration, new RegExp(`alter table scoring_authority\\.${table}[\\s\\S]*?enable row level security`, "i"));
  }
  assert.match(migration, /revoke all on table[\s\S]*from public, anon, authenticated, service_role/i);
  assert.doesNotMatch(migration, /grant\s+(?:insert|update|delete|all)[^;]+to\s+(?:public|anon|authenticated|service_role)/i);
  assert.doesNotMatch(migration, /grant execute[^;]+to\s+(?:public|anon|authenticated)/i);
  for (const definition of migration.split(/create or replace function /i).slice(1)) {
    assert.match(definition, /security definer/i);
    assert.match(definition, /set search_path = pg_catalog,/i);
    assert.doesNotMatch(
      definition.match(/set search_path = ([^\n]+)/i)?.[1] ?? "",
      /\bpublic\b|pg_temp/i,
    );
  }
});

test("migration is additive, Preview-fail-closed, Calcutta-free, and one transaction", () => {
  assert.match(migration, /environment', ''\)\) <> 'PRODUCTION'/i);
  assert.match(migration, /assert_production_scoring_runtime\(input, null\)/i);
  assert.match(migration, /assert_production_cutover_read_scope\(\s*input, 'OBSERVATION'/i);
  assert.match(migration, /resource\.project_ref/i);
  assert.match(migration, /resource\.google_workbook_id/i);
  assert.doesNotMatch(migration, /\b(?:drop table|truncate)\b/i);
  assert.doesNotMatch(migration, /(?:insert|update|delete)\s+(?:into\s+|from\s+)?scoring_authority\.calcutta/i);
  assert.equal((migration.match(/^begin;$/gmi) ?? []).length, 1);
  assert.equal((migration.match(/^commit;$/gmi) ?? []).length, 1);
  assert.equal((migration.match(/\$\$/g) ?? []).length % 2, 0);
  assert.match(migration, /notify pgrst, 'reload schema';\ncommit;\n$/);
});
