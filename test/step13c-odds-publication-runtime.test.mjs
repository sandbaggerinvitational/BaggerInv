import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { oddsCalculationEnvironment } from "../lib/odds-calculation-source.js";
import { productionOddsCalculationEnvironment } from "../lib/production-odds-calculation-contract.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "../lib/production-foundation-resource-contract.js";
import { publishedOddsReadEnvironment } from "../lib/published-odds-read-source.js";

const SHA = "a".repeat(40);
const PROJECT_ID = "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU";
const SECRET = `sb_secret_${"x".repeat(32)}`;
const base = Object.freeze({
  VERCEL_ENV: "production",
  VERCEL_GIT_COMMIT_SHA: SHA,
  VERCEL_PROJECT_ID: PROJECT_ID,
  VERCEL_PROJECT_NAME: "bagger-inv",
  PRODUCTION_FOUNDATION_ENABLED: "true",
  PRODUCTION_CUTOVER_ACTIVATION_ENABLED: "true",
  PRODUCTION_CUTOVER_PHASE: "OBSERVATION",
  PRODUCTION_CUTOVER_EXPECTED_COMMIT_SHA: SHA,
  PRODUCTION_CUTOVER_EXPECTED_VERCEL_PROJECT_ID: PROJECT_ID,
  PRODUCTION_CANONICAL_DOMAIN: "https://baggerinv.com",
  PRODUCTION_CUTOVER_TOURNAMENT_ID: "2026",
  PRODUCTION_CUTOVER_TOURNAMENT_YEAR: "2026",
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_SUPABASE_SECRET_KEY: SECRET,
  SUPABASE_SCORING_MIRROR_URL: PRODUCTION_SUPABASE_URL,
  SUPABASE_SCORING_MIRROR_SECRET_KEY: SECRET,
  GOOGLE_SHEETS_ID: PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PUBLIC_READS_ENABLED: "true",
  PRODUCTION_SUPABASE_DIRECTOR_AUTH_ENABLED: "true",
  PRODUCTION_SUPABASE_ADMIN_SESSION_REVALIDATION_ENABLED: "true",
  SCORING_AUTHORITY: "supabase",
  PARTICIPANT_IDENTITY_AUTHORITY: "supabase",
  PRODUCTION_SUPABASE_WORKERS_ENABLED: "true",
  PRODUCTION_SUPABASE_ODDS_CALCULATION_ENABLED: "true",
  ODDS_CALCULATION_INPUT_SOURCE: "supabase",
  PUBLISHED_ODDS_READ_SOURCE: "supabase",
  ODDS_PUBLICATION_AUTHORITY: "supabase",
  PRODUCTION_SUPABASE_ODDS_PUBLICATION_ENABLED: "true",
  PRODUCTION_SUPABASE_ODDS_GOOGLE_MIRROR_ENABLED: "false",
});

test("Production Odds accepts only the exact Supabase authority tuple after migration", () => {
  const selector = oddsCalculationEnvironment(base);
  assert.equal(selector.inputSource, "supabase");
  assert.equal(selector.publicationAuthority, "supabase");
  assert.equal(selector.publicationEligible, true);
  assert.equal(selector.publicationBlocked, false);

  const runtime = productionOddsCalculationEnvironment(base);
  assert.equal(runtime.allowed, true);
  assert.equal(runtime.canonicalSupabasePublication, true);
  assert.equal(runtime.legacyGooglePublication, false);

  for (const mutation of [
    { PRODUCTION_SUPABASE_ODDS_PUBLICATION_ENABLED: "false" },
    { PRODUCTION_SUPABASE_ODDS_GOOGLE_MIRROR_ENABLED: "true" },
    { ODDS_PUBLICATION_AUTHORITY: "google" },
  ]) {
    const state = productionOddsCalculationEnvironment({ ...base, ...mutation });
    assert.equal(state.allowed, false, JSON.stringify(mutation));
  }
});

test("canonical Supabase Odds publication cannot resolve a Production Google read fallback", () => {
  const current = publishedOddsReadEnvironment(base);
  assert.equal(current.resolved, "supabase");
  assert.equal(current.blocked, false);

  const staleSelector = publishedOddsReadEnvironment({
    ...base,
    PUBLISHED_ODDS_READ_SOURCE: "google",
  });
  assert.equal(staleSelector.resolved, "unavailable");
  assert.equal(staleSelector.blocked, true);
  assert.equal(staleSelector.reason, "supabase-publication-requires-supabase-read");
});

test("Production publication RPC is deterministic, optimistic, idempotent, and mirror-free", () => {
  const actorAuthUserId = "00000000-0000-4000-8000-000000000001";
  const jobId = "b".repeat(64);
  const snapshotId = "00000000-0000-4000-8000-000000000002";
  const authorityEpochId = "00000000-0000-4000-8000-000000000004";
  const script = `
    import {
      productionOddsPublicationRequestFingerprint,
      publishProductionOddsCalculation,
      readProductionOddsPublicationState,
    } from "./lib/production-odds-publication-server.js";
    const calls = [];
    const runtimeContext = { frozen2026: true,
      runtime: { tournamentId: "2026", tournamentYear: 2026 },
      googleDestination: null };
    const rpc = async (name, input) => {
      calls.push({ name, input });
      if (name === "read_production_odds_publication_v1") return { payload: {
        ok: true, data: { tournament_id: "2026", publication_authority: "SUPABASE",
          publication_revision: 4, activation_revision: 116,
          authority_epoch_id: "${authorityEpochId}", published_snapshot_id: "${snapshotId}" }
      } };
      return { payload: { ok: true,
        publication_contract_version: "production-odds-publication-v1",
        publication_authority: "SUPABASE", publication_state: "PUBLISHED",
        freshness: "CURRENT", snapshot_id: "00000000-0000-4000-8000-000000000003",
        publication_revision: 5, published_payload: { year: 2026, phase: "After Round 1" },
        mirror_created: false, google_writes: 0, idempotent: false }
      };
    };
    const state = await readProductionOddsPublicationState({ rpc,
      runtimeContext });
    const args = { jobId: "${jobId}", expectedPublicationRevision: state.publication_revision,
      expectedSnapshotId: state.published_snapshot_id,
      expectedActivationRevision: state.activation_revision,
      expectedAuthorityEpochId: state.authority_epoch_id,
      actorAuthUserId: "${actorAuthUserId}", actorPlayerId: "CB01" };
    const first = productionOddsPublicationRequestFingerprint(args);
    const retry = productionOddsPublicationRequestFingerprint({ ...args,
      expectedPublicationRevision: 5,
      expectedSnapshotId: "00000000-0000-4000-8000-000000000003" });
    const result = await publishProductionOddsCalculation({ ...args,
      requestFingerprint: first, rpc, runtimeContext });
    process.stdout.write(JSON.stringify({ calls, first, retry, result }));
  `;
  const child = spawnSync(process.execPath, [
    "--conditions=react-server", "--input-type=module", "-e", script,
  ], { cwd: new URL("..", import.meta.url), encoding: "utf8" });
  assert.equal(child.status, 0, child.stderr);
  const output = JSON.parse(child.stdout);
  assert.equal(output.first, output.retry, "lost-response retry retains one request identity");
  assert.equal(output.calls[0].name, "read_production_odds_publication_v1");
  assert.equal(output.calls[1].name, "publish_production_championship_odds_v1");
  assert.equal(output.calls[1].input.job_id, jobId);
  assert.equal(output.calls[1].input.expected_publication_revision, 4);
  assert.equal(output.calls[1].input.expected_snapshot_id, snapshotId);
  assert.equal(output.calls[1].input.expected_activation_revision, 116);
  assert.equal(output.calls[1].input.expected_authority_epoch_id, authorityEpochId);
  assert.equal(output.calls[1].input.operation, "PUBLISH_PRODUCTION_CHAMPIONSHIP_ODDS_V1");
  assert.equal(output.calls[1].input.authorization.player_id, "CB01");
  assert.equal(output.calls[1].input.authorization.auth_user_id, actorAuthUserId);
  assert.equal(output.result.mirror_created, false);
  assert.equal(output.result.google_writes, 0);
});

test("Production route uses active Director + retained job while Preview behavior remains isolated", async () => {
  const [route, admin, dashboard, directorRoute, deploymentRebind] = await Promise.all([
    readFile(new URL("../app/api/odds/publish/route.js", import.meta.url), "utf8"),
    readFile(new URL("../app/odds-center/admin/OddsAdmin.js", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/director/DirectorDashboard.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/director/route.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/production-maintenance-precommit-deployment-rebind.js", import.meta.url), "utf8"),
  ]);
  const productionBranch = route.slice(
    route.indexOf("async function publishProductionProjection"),
    route.indexOf("async function publishProjection"),
  );
  assert.match(productionBranch, /allowBootstrap: false/);
  assert.match(productionBranch, /readPublishableProductionOddsCalculation/);
  assert.match(productionBranch, /publishProductionOddsCalculation/);
  assert.match(productionBranch, /assertProductionCutoverRequest/);
  assert.doesNotMatch(productionBranch, /x-odds-admin-secret|publishOddsSnapshot|deliverSupabaseOddsGoogleMirror/);
  assert.match(route, /process\.env\.VERCEL_ENV === "preview"/,
    "Preview projection/mirror behavior remains separately gated");
  assert.match(admin, /productionMode\s*\?\s*"\/api\/admin\/production-odds-calculations"/);
  assert.match(admin, /if \(productionMode\) requestPayload\.jobId/);
  assert.match(dashboard, /productionMode=\{!data\.qaTools\}/);
  assert.match(directorRoute, /Production Championship Odds reads require Supabase/);
  assert.match(directorRoute, /loadProductionOddsCalculationInputs/);
  assert.match(directorRoute, /publishedOddsSnapshotsFromView/);
  assert.match(deploymentRebind, /canonicalSupabaseOddsPublication/);
  assert.match(deploymentRebind,
    /runtime_odds_publication_authority:\s*\n?\s*runtime\.oddsPublicationAuthority\.toUpperCase\(\)/);
  assert.match(deploymentRebind,
    /runtime_supabase_odds_publication_enabled:\s*\n?\s*runtime\.supabaseOddsPublicationEnabled/);
});

test("Step 13C does not introduce a native Odds API or change the current web-backed native contract", async () => {
  const files = await readFile(new URL("../docs/mobile-native-product-boundary-v1.md", import.meta.url), "utf8").catch(() => "");
  assert.doesNotMatch(files, /GET \/api\/mobile\/v1\/odds/);
  const route = await readFile(new URL("../app/api/odds/publish/route.js", import.meta.url), "utf8");
  assert.doesNotMatch(route, /api\/mobile\/v1/);
});
