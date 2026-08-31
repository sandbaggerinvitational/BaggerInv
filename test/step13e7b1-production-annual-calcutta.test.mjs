import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { recalculateCalcuttaAfterCanonicalMutation } from
  "../lib/calcutta-post-commit.js";
import { productionCalcuttaV1ContractData } from
  "../lib/production-calcutta-v1.js";

const [migration, server, contract, participantRoute, mobileAdapter] =
  await Promise.all([
    readFile(new URL(
      "../supabase/production_migrations/202608300075_production_annual_calcutta_v1.sql",
      import.meta.url,
    ), "utf8"),
    readFile(new URL("../lib/production-calcutta-server.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/production-calcutta-v1.js", import.meta.url), "utf8"),
    readFile(new URL(
      "../app/api/leaderboards/calcutta/route.js",
      import.meta.url,
    ), "utf8"),
    readFile(new URL("../lib/mobile-v1-calcutta.js", import.meta.url), "utf8"),
  ]);

const operations = new Map([
  ["configure_production_calcutta_v1",
    "public.future_production_configure_calcutta_v1"],
  ["replace_production_calcutta_v1_auction_facts",
    "public.future_production_replace_calcutta_auction_facts_v1"],
  ["publish_production_calcutta_v1",
    "public.future_production_publish_calcutta_v1"],
  ["unpublish_production_calcutta_v1",
    "public.future_production_unpublish_calcutta_v1"],
  ["enqueue_production_calcutta_v1_recalculation",
    "public.future_production_enqueue_calcutta_recalculation_v1"],
  ["claim_production_calcutta_v1_recalculation",
    "public.future_production_claim_calcutta_recalculation_v1"],
  ["complete_production_calcutta_v1_recalculation",
    "public.future_production_complete_calcutta_recalculation_v1"],
  ["fail_production_calcutta_v1_recalculation",
    "public.future_production_fail_calcutta_recalculation_v1"],
  ["inspect_production_calcutta_v1",
    "public.future_production_inspect_calcutta_v1"],
  ["resolve_production_calcutta_postcommit_match_v1",
    "public.future_production_resolve_calcutta_postcommit_match_v1"],
]);

test("migration 075 registers exact OBSERVATION Calcutta operations as dispatcher-only targets", () => {
  assert.match(migration, /^-- Step 13E\.7B\.1/);
  assert.match(migration, /\bbegin;[\s\S]*\bcommit;\s*$/);
  for (const [operation, target] of operations) {
    assert.match(migration, new RegExp(
      `'${operation}'[\\s\\S]{0,160}'${target.replaceAll(".", "\\.")}'[\\s\\S]{0,80}'OBSERVATION'`,
    ));
    assert.match(migration, new RegExp(
      `revoke all on function\\s+${target.replaceAll(".", "\\.")}\\(jsonb\\)[\\s\\S]{0,100}service_role`,
    ));
  }
  assert.doesNotMatch(migration,
    /grant execute on function\s+public\.future_production_(?:configure|replace|publish|unpublish|enqueue|claim|complete|fail|inspect|resolve)[a-z0-9_]*calcutta/i);
  assert.match(migration,
    /'configure_production_calcutta_v1'[\s\S]{0,180}'MUTATION'/);
  assert.match(migration,
    /'claim_production_calcutta_v1_recalculation'[\s\S]{0,180}'MUTATION'/);
  assert.match(migration,
    /'inspect_production_calcutta_v1'[\s\S]{0,180}'READ'/);
});

test("future Calcutta state, jobs, and results are exact tournament and runtime-generation scoped", () => {
  assert.match(migration,
    /assert_annual_scoring_runtime_v1\(\s*input, expected_operation, null\s*\)/);
  assert.match(migration, /catalog\.lifecycle <> 'ACTIVE'/);
  assert.match(migration,
    /generation\.pointer_revision <> pointer\.pointer_revision/);
  assert.match(migration,
    /annual_resource\.resource_status <> 'CURRENT_RESOURCE_BOUND'[\s\S]*annual_destination_workbook_id/);
  assert.match(migration,
    /build_annual_calcutta_v1_auction\(\s*input jsonb,\s*target text\s*\)[\s\S]*membership\.tournament_id = target/);
  assert.match(migration,
    /insert into scoring_authority\.calcutta_v1_configuration_revisions[\s\S]*values \(\s*target,/);
  assert.match(migration,
    /insert into scoring_authority\.calcutta_v1_auction_fact_revisions[\s\S]*values \(\s*target,/);
  assert.match(migration,
    /insert into scoring_authority\.calcutta_v1_recalculation_jobs[\s\S]*runtime_generation_id[\s\S]*runtime_generation/);
  assert.match(migration,
    /where value\.job_id = job_id_value[\s\S]*value\.tournament_id = target[\s\S]*value\.runtime_generation_id = generation\.runtime_generation_id/);
  assert.match(migration,
    /insert into scoring_authority\.calcutta_v1_result_revisions[\s\S]*values \(\s*target,/);
  assert.match(migration,
    /calcutta_v1_source_revision\(target\)/);
  assert.match(migration,
    /calcutta_v1_completed_rounds\(target\)/);
  assert.doesNotMatch(migration,
    /order by[^;]{0,180}(?:tournament_year|created_at) desc[\s\S]{0,80}limit 1/i);
});

test("legacy 2026 and scoring invalidation remain pointer fenced", () => {
  assert.match(migration,
    /target_tournament is distinct from pointer\.tournament_id[\s\S]*return case when tg_op = 'DELETE'/);
  assert.match(migration,
    /if target_tournament = '2026' then[\s\S]*resource\.current_tournament_id <> '2026'/);
  assert.match(migration,
    /resolve_production_calcutta_postcommit_match_v1[\s\S]*pointer\.tournament_id <> '2026'[\s\S]*target_tournament <> '2026'/);
  assert.match(migration,
    /future_production_resolve_calcutta_postcommit_match_v1[\s\S]*where value\.match_id = target_match[\s\S]*value\.tournament_id = target_tournament/);
});

test("server sends future Calcutta calls only through the certified annual dispatcher", () => {
  assert.match(server, /resolveProductionScoringDispatchContext/);
  assert.match(server, /productionScoringOperationsRpc/);
  assert.match(server, /requiredPhase: "OBSERVATION"/);
  assert.match(server, /ANNUAL_RUNTIME_V1/);
  assert.match(server, /scoringDispatchContext: dispatchContext/);
  assert.match(server,
    /const annual = clean\(dispatchContext\?\.runtime\?\.tournamentId\)[\s\S]*PRODUCTION_TOURNAMENT_ID/);
  assert.match(server, /rpc\(functionName,[\s\S]*annualOperationFingerprint/);
  assert.match(server,
    /job\.tournament_id[\s\S]*job\.runtime_generation_id[\s\S]*PRODUCTION_CALCUTTA_JOB_RUNTIME_MISMATCH/);
  assert.doesNotMatch(server,
    /productionCalcuttaV1Rpc\(["']future_production_/);
  const fixedAllowlist = server.match(/const RPC_ALLOWLIST = new Set\(\[([\s\S]*?)\]\);/)?.[1] || "";
  assert.doesNotMatch(fixedAllowlist, /future_production_/);
});

test("participant and native reads retain the current identity-selected tournament", () => {
  assert.match(participantRoute,
    /currentProductionCalcuttaV1\(\{[\s\S]*playerId: identity\.playerId[\s\S]*tournamentId: identity\.tournamentId/);
  assert.match(mobileAdapter,
    /readCanonicalProductionCalcuttaV1[\s\S]*tournamentId: resolvedTournamentId/);
  assert.match(contract,
    /resolveProductionCurrentReadDispatch/);
  assert.doesNotMatch(mobileAdapter,
    /resolvedTournamentId !== PRODUCTION_TOURNAMENT_ID/);
});

test("participant DTO distinguishes frozen 2026 and future unconfigured revisions without cross-year acceptance", () => {
  const view = (tournamentId, configurationRevision) => ({
    contract_version: "production-calcutta-v1",
    tournament_id: tournamentId,
    state: "NOT_CONFIGURED",
    publication_state: "UNPUBLISHED",
    published: false,
    currency_code: "USD",
    configuration_revision: configurationRevision,
    configuration_fingerprint: null,
    auction_revision: 0,
    auction_fingerprint: null,
    publication_revision: 0,
    result_revision: null,
    revision:
      `calcutta-v1:${configurationRevision}:0:0:0:NOT_CONFIGURED:UNPUBLISHED`,
    freshness: { stale: false, updating: false },
    market: null,
    result: null,
  });
  assert.equal(productionCalcuttaV1ContractData(view("2026", 1)).tournamentId,
    "2026");
  assert.equal(productionCalcuttaV1ContractData(view("2099", 0), {
    expectedTournamentId: "2099",
  }).tournamentId, "2099");
  assert.throws(() => productionCalcuttaV1ContractData(view("2099", 0), {
    expectedTournamentId: "2026",
  }), (error) => error.code === "CALCUTTA_V1_RESOURCE_BINDING_REQUIRED");
});

test("Production postcommit derives exact tournament from canonical Match and rejects a caller mismatch", async () => {
  let drainCalls = 0;
  const dependencies = {
    resolveProductionCalcuttaPostCommitMatch: async ({ matchId }) => ({
      matchId,
      tournamentId: "2099",
      runtimeGenerationId: "10000000-0000-4000-8000-000000000001",
    }),
    drainCurrentProductionCalcuttaV1Jobs: async () => {
      drainCalls += 1;
      return { ok: true, processed: 1 };
    },
  };
  await assert.rejects(
    recalculateCalcuttaAfterCanonicalMutation("2026", {
      matchId: "M-2099-01",
      mutationKey: "wrong-caller-scope",
    }, { env: { VERCEL_ENV: "production" }, dependencies }),
    (error) => error.code === "PRODUCTION_CALCUTTA_MATCH_TOURNAMENT_MISMATCH",
  );
  assert.equal(drainCalls, 0);
  const result = await recalculateCalcuttaAfterCanonicalMutation("2099", {
    matchId: "M-2099-01",
    mutationKey: "canonical-target",
  }, { env: { VERCEL_ENV: "production" }, dependencies });
  assert.equal(result.processed, 1);
  assert.equal(drainCalls, 1);
});

test("every canonical scoring/lifecycle postcommit call supplies the affected Match", async () => {
  const paths = [
    "app/api/scoring/current/route.js",
    "app/api/scoring/matches/[matchId]/route.js",
    "app/api/live-matches/route.js",
    "app/api/director/route.js",
    "app/api/mobile/v1/scoring/hole/route.js",
    "app/api/mobile/v1/scoring/finalize/route.js",
    "lib/mobile-v1-scoring-post-commit.js",
  ];
  for (const path of paths) {
    const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
    assert.match(source, /matchId/);
    assert.match(source,
      /recalculateCalcuttaAfterCanonicalMutation|runMobileScoringPostCommit/);
  }
});
