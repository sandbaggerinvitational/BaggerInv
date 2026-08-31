import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [migration, server, adminRoute, participantRoute, mobileAdapter] =
  await Promise.all([
    readFile(new URL(
      "../supabase/production_migrations/202608300074_production_annual_net_skins_v1.sql",
      import.meta.url,
    ), "utf8"),
    readFile(new URL("../lib/production-net-skins-server.js", import.meta.url), "utf8"),
    readFile(new URL(
      "../app/api/admin/production-net-skins-v1/route.js",
      import.meta.url,
    ), "utf8"),
    readFile(new URL(
      "../app/api/leaderboards/net-skins/route.js",
      import.meta.url,
    ), "utf8"),
    readFile(new URL("../lib/mobile-v1-net-skins.js", import.meta.url), "utf8"),
  ]);

const operations = new Map([
  ["configure_production_net_skins_v1",
    "public.future_production_configure_net_skins_v1"],
  ["enqueue_production_net_skins_v1_recalculation",
    "public.future_production_enqueue_net_skins_recalculation_v1"],
  ["claim_production_net_skins_v1_recalculation",
    "public.future_production_claim_net_skins_recalculation_v1"],
  ["complete_production_net_skins_v1_recalculation",
    "public.future_production_complete_net_skins_recalculation_v1"],
  ["fail_production_net_skins_v1_recalculation",
    "public.future_production_fail_net_skins_recalculation_v1"],
]);

test("migration 074 installs exactly five dispatcher-only future Net Skins operations", () => {
  assert.match(migration, /^-- Step 13E\.7B\.1/);
  assert.match(migration, /\bbegin;[\s\S]*\bcommit;\s*$/);
  for (const [operation, target] of operations) {
    assert.match(migration, new RegExp(`'${operation}'[\\s\\S]{0,120}'${target.replaceAll(".", "\\.")}'`));
    assert.match(migration, new RegExp(
      `'${target.replaceAll(".", "\\.")}'[\\s\\S]{0,80}'OBSERVATION', 'MUTATION', null`,
    ));
    assert.match(migration, new RegExp(`revoke all on function\\s+${target.replaceAll(".", "\\.")}\\(jsonb\\)[\\s\\S]{0,100}service_role`));
  }
  assert.doesNotMatch(migration,
    /grant execute on function\s+public\.future_production_(?:configure|enqueue|claim|complete|fail)_net_skins/i);
  assert.doesNotMatch(migration,
    /create or replace function public\.(?:configure|enqueue|claim|complete|fail)_production_net_skins/i);
  assert.doesNotMatch(migration, /production_(?:odds|calcutta)/i);
});

test("future Net Skins SQL is exact target and runtime-generation bound end to end", () => {
  assert.match(migration,
    /assert_annual_scoring_runtime_v1\(\s*input, expected_operation, null\s*\)/);
  assert.match(migration,
    /enqueue_annual_net_skins_v1_round\(\s*target text,\s*runtime_generation uuid/);
  assert.match(migration,
    /value\.tournament_id = target[\s\S]*value\.runtime_generation_id = runtime_generation[\s\S]*value\.generation_status = 'ACTIVE'/);
  assert.match(migration,
    /where value\.tournament_id = target[\s\S]*value\.runtime_generation_id = generation_id[\s\S]*value\.status = 'PENDING'/);
  assert.match(migration,
    /where value\.job_id = job_id_value[\s\S]*value\.tournament_id = target[\s\S]*value\.runtime_generation_id = generation_id for update/);
  assert.match(migration,
    /insert into scoring_authority\.net_skins_v1_recalculation_jobs[\s\S]*runtime_generation_id[\s\S]*runtime_generation/);
  assert.match(migration,
    /calculation_input := public\.read_net_skins_input_view\(target\)/);
  assert.match(migration,
    /source_revision,tournamentId[\s\S]*is distinct from target/);
  assert.match(migration,
    /update scoring_authority\.net_skins_v1_result_revisions[\s\S]*where tournament_id = target/);
  assert.match(migration,
    /insert into scoring_authority\.net_skins_v1_result_revisions[\s\S]*values \(\s*target,/);
  assert.match(migration,
    /read_annual_net_skins_v1[\s\S]*value\.runtime_generation_id = generation\.runtime_generation_id/);
  assert.match(migration,
    /result_job\.runtime_generation_id = generation\.runtime_generation_id/);
  assert.doesNotMatch(migration, /order by[^;]{0,160}(?:tournament_year|created_at) desc[\s\S]{0,80}limit 1/i);
});

test("annual queue recovery, invalidation, and publication remain target isolated", () => {
  assert.match(migration,
    /status = case when attempts >= 5 then 'FAILED' else 'PENDING' end/);
  assert.match(migration,
    /where tournament_id = target[\s\S]*runtime_generation_id = generation_id[\s\S]*status = 'RUNNING'[\s\S]*lease_expires_at <=/);
  assert.match(migration,
    /ANNUAL_NET_SKINS_V1_(?:ENQUEUE|CLAIM|COMPLETE|FAIL):%s/);
  assert.match(migration,
    /normalize_annual_net_skins_v1_official_result\(\s*target,/);
  assert.match(migration,
    /publication_policy', 'OFFICIAL_ONLY'/);
  assert.match(migration,
    /enqueue_annual_net_skins_v1_change\(\)[\s\S]*match_value\.tournament_id = '2026'[\s\S]*pg_advisory_xact_lock_shared[\s\S]*pointer\.tournament_id <> match_value\.tournament_id/);
  assert.match(migration,
    /production_annual_net_skins_v1_hole_score_recalculation/);
  assert.match(migration,
    /production_annual_net_skins_v1_match_lifecycle_recalculation/);
});

test("server and participant/native paths derive the tournament from current runtime", () => {
  assert.match(server, /resolveProductionScoringDispatchContext/);
  assert.match(server, /productionScoringOperationsRpc/);
  assert.match(server, /requiredPhase: "OBSERVATION"/);
  assert.match(server, /ANNUAL_RUNTIME_V1/);
  assert.match(server,
    /job\.tournament_id[\s\S]*job\.runtime_generation_id[\s\S]*PRODUCTION_NET_SKINS_JOB_RUNTIME_MISMATCH/);
  assert.doesNotMatch(adminRoute, /input\.(?:tournamentId|tournament_id)/);
  assert.match(participantRoute,
    /currentProductionNetSkinsV1\([\s\S]*tournamentId: identity\.tournamentId/);
  assert.match(mobileAdapter,
    /readCanonicalProductionNetSkinsV1[\s\S]*tournamentId: resolvedTournamentId/);
  assert.match(mobileAdapter,
    /tournamentId: identity\?\.tournamentId/);
  assert.doesNotMatch(mobileAdapter,
    /tournamentId\s*!==\s*PRODUCTION_TOURNAMENT_ID/);
});
