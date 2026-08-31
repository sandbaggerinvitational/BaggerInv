import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { recalculateCalcuttaAfterCanonicalMutation } from "../lib/calcutta-post-commit.js";

const [server, route, mobileRoute] = await Promise.all([
  readFile(new URL("../lib/production-calcutta-server.js", import.meta.url), "utf8"),
  readFile(new URL("../app/api/admin/production-calcutta-v1/route.js", import.meta.url), "utf8"),
  readFile(new URL("../app/api/mobile/v1/calcutta/route.js", import.meta.url), "utf8"),
]);

test("Production Calcutta server exposes only the exact fixed-resource V1 RPCs", () => {
  assert.match(server, /^import "server-only";/);
  for (const rpc of [
    "inspect_production_cutover_authority",
    "inspect_production_calcutta_v1",
    "configure_production_calcutta_v1",
    "replace_production_calcutta_v1_auction_facts",
    "publish_production_calcutta_v1",
    "unpublish_production_calcutta_v1",
    "enqueue_production_calcutta_v1_recalculation",
    "claim_production_calcutta_v1_recalculation",
    "complete_production_calcutta_v1_recalculation",
    "fail_production_calcutta_v1_recalculation",
  ]) assert.match(server, new RegExp(`"${rpc}"`));
  assert.match(server, /PRODUCTION_SUPABASE_PROJECT_REF/);
  assert.match(server, /PRODUCTION_SUPABASE_URL/);
  assert.match(server, /PRODUCTION_GOOGLE_WORKBOOK_ID/);
  assert.match(server, /PRODUCTION_TOURNAMENT_ID/);
  assert.match(server, /vercel_project_id: PRODUCTION_VERCEL_PROJECT_ID/);
  assert.match(server, /vercel_team_id: PRODUCTION_VERCEL_TEAM_ID/);
  assert.match(server, /expected_epoch_id: epochId/);
  assert.match(server, /requiredPhase: "OBSERVATION"/);
  assert.match(server, /safeRpcFailureCode\(payload\)/);
  assert.doesNotMatch(server, /google-sheets|sheets\.googleapis|docs\.google\.com/);
});

test("Director operations are revision-bound, explicit, and never caller-select publication policy", () => {
  assert.match(server, /PRODUCTION_CALCUTTA_V1_PUBLICATION_POLICY/);
  assert.match(server, /expected_configuration_revision/);
  assert.match(server, /expected_configuration_fingerprint/);
  assert.match(server, /nullable: \[0, 1\]\.includes\(Number\(expectedConfigurationRevision\)\)/);
  assert.match(server, /expected_auction_revision/);
  assert.match(server, /expected_auction_fingerprint/);
  assert.match(server, /expected_publication_revision/);
  assert.match(server, /operationFingerprint\(requestFingerprint, "CONFIGURE"\)/);
  assert.match(server, /operationFingerprint\(requestFingerprint, "REPLACE_AUCTION"\)/);
  assert.match(server, /publicationOperation\("PUBLISH"/);
  assert.match(server, /publicationOperation\("UNPUBLISH"/);
  assert.match(server, /exactDecimalTotal/);
  assert.match(server, /BigInt/);
  assert.doesNotMatch(server, /toFixed\(|Math\.round\(/);
});

test("admin route forwards both exact revision fingerprints", () => {
  assert.match(route, /expectedConfigurationFingerprint: input\.expectedConfigurationFingerprint/);
  assert.match(route, /expectedAuctionFingerprint: input\.expectedAuctionFingerprint/);
  assert.match(route, /const revisions = \{[\s\S]*expectedConfigurationRevision[\s\S]*expectedConfigurationFingerprint[\s\S]*expectedAuctionRevision[\s\S]*expectedAuctionFingerprint[\s\S]*expectedPublicationRevision/);
});

test("bounded worker reuses the existing Calcutta engine and binds both current revisions", () => {
  assert.match(server, /calculateCalcuttaFromSupabaseViews/);
  assert.match(server, /CALCUTTA_ENGINE_VERSION/);
  assert.match(server, /claimedConfigurationFingerprint !== configurationFingerprint/);
  assert.match(server, /claimedAuctionFingerprint !== auctionFingerprint/);
  assert.match(server, /\["PROVISIONAL", "OFFICIAL"\]\)\.has\(state\)/);
  assert.match(server, /result_state: productionCalcuttaResultState\(calculated\.resultState\)/);
  assert.match(server, /expected_source_fingerprint: sourceFingerprint/);
  assert.match(server, /result_payload: calculated\.calcutta/);
  assert.match(server, /complete_production_calcutta_v1_recalculation/);
  assert.match(server, /fail_production_calcutta_v1_recalculation/);
  assert.match(server, /Calcutta recalculation is temporarily unavailable\./);
  assert.doesNotMatch(server, /paid|unpaid|collection|payment|balance|settlement/i);
});

test("worker inspects service-only revision tokens without using the participant market read", () => {
  assert.match(server, /export async function inspectProductionCalcuttaV1/);
  assert.match(server, /mutationRpc\("inspect_production_calcutta_v1", \{/);
  assert.match(server, /dependencies\.inspectProductionCalcuttaV1/);
  assert.match(server, /state\.configuration_revision/);
  assert.match(server, /state\.auction_revision/);
  assert.doesNotMatch(server, /currentProductionCalcuttaV1/);
});

test("admin route is Production-only, Director-bound, same-origin, and has no GET", () => {
  assert.match(route, /assertProductionCutoverActivation\(\{ requiredPhase: "OBSERVATION" \}\)/);
  assert.match(route, /assertProductionCutoverRequest\(request, process\.env, \{ requireOrigin: true \}\)/);
  assert.match(route, /authorizePreviewDirector\(\{[\s\S]*allowBootstrap: false/);
  for (const action of ["configure", "replace-auction", "publish", "unpublish", "enqueue", "process"]) {
    assert.match(route, new RegExp(`"${action}"`));
  }
  assert.doesNotMatch(route, /export async function GET|export const GET/);
  assert.doesNotMatch(route, /Google|google-sheets|Passport/);
});

test("mobile route is a read-only Bearer wrapper around the bounded DTO", () => {
  assert.match(mobileRoute, /mobileCalcuttaResult/);
  assert.match(mobileRoute, /mobileV1ReadResponse/);
  assert.match(mobileRoute, /export const GET/);
  assert.doesNotMatch(mobileRoute, /POST|PUT|PATCH|DELETE|google/i);
});

test("post-commit selector drains Production V1 and never invokes Preview mutation RPCs", async () => {
  let productionCalls = 0;
  let previewCalls = 0;
  const result = await recalculateCalcuttaAfterCanonicalMutation("2026", {
    calculatedBy: "focused test",
    mutationKey: "mutation-1",
    matchId: "R1-M1",
  }, {
    env: { VERCEL_ENV: "production" },
    dependencies: {
      resolveProductionCalcuttaPostCommitMatch: async ({ matchId }) => {
        assert.equal(matchId, "R1-M1");
        return { tournamentId: "2026", matchId };
      },
      drainCurrentProductionCalcuttaV1Jobs: async (input) => {
        productionCalls += 1;
        assert.equal(input.workerId, "production-calcutta-v1-post-commit-worker");
        assert.match(input.requestFingerprint, /^[0-9a-f]{64}$/);
        return { ok: true, processed: 1 };
      },
      recalculatePreviewCalcuttaTournament: async () => {
        previewCalls += 1;
        throw new Error("Preview mutation must not run in Production");
      },
    },
  });
  assert.equal(result.processed, 1);
  assert.equal(productionCalls, 1);
  assert.equal(previewCalls, 0);
});

test("post-commit selector preserves the existing Preview calculator", async () => {
  let productionCalls = 0;
  let previewCalls = 0;
  const result = await recalculateCalcuttaAfterCanonicalMutation("PREVIEW-2026", {
    calculatedBy: "focused preview test",
  }, {
    env: { VERCEL_ENV: "preview" },
    dependencies: {
      drainCurrentProductionCalcuttaV1Jobs: async () => {
        productionCalls += 1;
      },
      recalculatePreviewCalcuttaTournament: async (tournamentId, input) => {
        previewCalls += 1;
        assert.equal(tournamentId, "PREVIEW-2026");
        assert.equal(input.calculatedBy, "focused preview test");
        return { ok: true, preview: true };
      },
    },
  });
  assert.equal(result.preview, true);
  assert.equal(previewCalls, 1);
  assert.equal(productionCalls, 0);
});

test("canonical scoring routes use the environment-selected Calcutta worker", async () => {
  const paths = [
    "lib/mobile-v1-scoring-post-commit.js",
    "app/api/director/route.js",
    "app/api/live-matches/route.js",
    "app/api/scoring/current/route.js",
    "app/api/scoring/matches/[matchId]/route.js",
  ];
  for (const path of paths) {
    const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
    assert.match(source, /recalculateCalcuttaAfterCanonicalMutation/);
    assert.doesNotMatch(source, /from ["'][^"']*calcutta-supabase\.js["']/);
  }
});
