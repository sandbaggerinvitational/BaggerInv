// Proof layers: UNIT / server API adapter with synthetic transport only.
// The proof runner denies outbound network. No hosted database or Google calls.
import assert from "node:assert/strict";
import test from "node:test";
import { closureReadCandidate } from "./support/reliability/closure-routing-fixture.mjs";
import {
  history2026ReadEnvironment,
  isSupabaseHistory2026,
  requireHistory2026ReadSource,
} from "../lib/history-2026-read-source.js";
import { history2026RpcContext, inspectHistory2026SupabaseSecurity, readHistory2026SupabaseView } from "../lib/history-2026-supabase.js";
import {
  predictionInputBundleEnvironment,
  requirePredictionInputBundleEnvironment,
} from "../lib/prediction-input-bundle-source.js";
import { loadHistory2026View } from "../lib/history-2026-service.js";
import { readGuideProjection } from "../lib/guide-supabase.js";
import { readLeaderboardsCoreView } from "../lib/leaderboards-core-supabase.js";
import { readCompletedHistory } from "../lib/completed-history-supabase.js";
import { readPreviewSecondaryHistoryPlayers } from "../lib/player-public-profile-projection.js";
import { makeHistory2026Aggregate, makeGuideProjection } from "./fixtures/history-2026.mjs";
import { preparePredictionInputBundle } from "../lib/prediction-input-bundle-service.js";
import {
  productionShadowCandidateReadEnvironment,
  productionShadowCandidateRequestEnvironment,
  productionShadowCandidateScoringMutationDecision,
} from "../lib/production-shadow-candidate.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "../lib/production-foundation-resource-contract.js";
import { PRODUCTION_SHADOW_CANDIDATE_READ_RPCS, scoringShadowRpc } from "../lib/scoring-shadow.js";

const candidate = Object.freeze({
  ...closureReadCandidate,
  HISTORY_2026_READ_SOURCE: "supabase",
  WAR_ROOM_INPUT_SOURCE: "supabase",
  SUPABASE_SCORING_MIRROR_ENABLED: "false",
});
const ordinaryPreview = Object.freeze({
  VERCEL_ENV: "preview",
  HISTORY_2026_READ_SOURCE: "supabase",
  WAR_ROOM_INPUT_SOURCE: "supabase",
  SECONDARY_HISTORY_READ_SOURCE: "supabase",
  SUPABASE_SCORING_MIRROR_URL: "https://idgigvjjqkfbqjeredpb.supabase.co",
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "synthetic-preview-secret",
  SUPABASE_SCORING_MIRROR_ENABLED: "true",
  SCORING_AUTHORITY: "supabase",
});
// Existing protected Production selector contract is evaluated as pure data.
// No test uses this fixture for transport or makes a Production request.
const protectedSelector = Object.freeze({
  VERCEL_ENV: "production",
  VERCEL_PROJECT_ID: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
  VERCEL_PROJECT_NAME: "bagger-inv",
  VERCEL_GIT_COMMIT_SHA: "a".repeat(40),
  PRODUCTION_FOUNDATION_ENABLED: "true",
  PRODUCTION_CUTOVER_ACTIVATION_ENABLED: "true",
  PRODUCTION_CUTOVER_EXPECTED_COMMIT_SHA: "a".repeat(40),
  PRODUCTION_CUTOVER_EXPECTED_VERCEL_PROJECT_ID: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
  PRODUCTION_CANONICAL_DOMAIN: "https://baggerinv.com",
  PRODUCTION_CUTOVER_TOURNAMENT_ID: "2026",
  PRODUCTION_CUTOVER_TOURNAMENT_YEAR: "2026",
  PRODUCTION_CUTOVER_PHASE: "ODDS_WAR_ROOM",
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_SUPABASE_SECRET_KEY: "sb_secret_" + "x".repeat(32),
  SUPABASE_SCORING_MIRROR_URL: PRODUCTION_SUPABASE_URL,
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "sb_secret_" + "x".repeat(32),
  GOOGLE_SHEETS_ID: PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PUBLIC_READS_ENABLED: "true",
  PRODUCTION_SUPABASE_DIRECTOR_AUTH_ENABLED: "true",
  PRODUCTION_SUPABASE_ADMIN_SESSION_REVALIDATION_ENABLED: "true",
  SCORING_AUTHORITY: "google",
  PARTICIPANT_IDENTITY_AUTHORITY: "passport",
  HISTORY_2026_READ_SOURCE: "supabase",
  WAR_ROOM_INPUT_SOURCE: "supabase",
  SECONDARY_HISTORY_READ_SOURCE: "supabase",
});

async function withMockTransport(callback, response = { ok: true, data: {} }) {
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init, body: JSON.parse(init?.body || "null") });
    return typeof response === "function" ? response(calls.at(-1)) : Response.json(response);
  };
  try { return await callback(calls); }
  finally { globalThis.fetch = previous; }
}

function assertRequestedDenied(env) {
  const admission = productionShadowCandidateReadEnvironment(env);
  assert.equal(admission.requested, true);
  assert.equal(admission.eligible, false);
  const history = history2026ReadEnvironment(env);
  assert.equal(history.resolved, "unavailable");
  assert.equal(history.blocked, true);
  assert.equal(history.fallbackUsed, false);
  assert.equal(history.reason, admission.reason);
  const prediction = predictionInputBundleEnvironment(env);
  assert.equal(prediction.available, false);
  assert.equal(prediction.productionShadowCandidate, false);
  assert.equal(prediction.fallbackUsed, false);
  assert.equal(prediction.reason, admission.reason);
  assert.throws(() => requireHistory2026ReadSource(env), { code: "HISTORY_2026_SUPABASE_CONFIGURATION_REQUIRED" });
  assert.throws(() => requirePredictionInputBundleEnvironment(env), error => error.status === 503);
}

test("NA-P0F-HISTORY-READ-01: exact diagnostic History needs neither Google nor the mirror writer flag", () => {
  assert.equal(Object.keys(candidate).some(key => /GOOGLE|SHEETS|DRIVE/.test(key)), false);
  for (const authority of [undefined, "supabase", "google"]) {
    const env = { ...candidate, SCORING_AUTHORITY: authority };
    const read = history2026ReadEnvironment(env);
    assert.equal(read.resolved, "supabase");
    assert.equal(read.blocked, false);
    assert.equal(read.productionShadowCandidate, true);
    assert.equal(read.serviceEnabled, true);
    assert.equal(read.supabaseAuthority, true);
    assert.equal(read.approvedProject, true);
    assert.equal(read.tournamentId, "2026");
    assert.equal(read.tournamentYear, 2026);
    assert.equal(read.workbookId, productionShadowCandidateReadEnvironment(env).workbookId,
      "retained database provenance is server-bound, never provider availability");
    assert.equal(read.fallbackUsed, false);
    assert.equal(requireHistory2026ReadSource(env).resolved, "supabase");
  }
});

test("NA-P0F-PREDICTION-READ-01: exact diagnostic Prediction keeps the existing read contract without Google", () => {
  const read = requirePredictionInputBundleEnvironment(candidate);
  assert.equal(read.contract, "prediction-input-bundle-preview-gate-v1");
  assert.equal(read.available, true);
  assert.equal(read.productionShadowCandidate, true);
  assert.equal(read.projectRef, PRODUCTION_SUPABASE_PROJECT_REF);
  assert.equal(read.fallbackUsed, false);
  assert.equal(read.reason, "production-shadow-supabase-prediction-input-bundle");
});

const rejectedFields = {
  VERCEL_ENV: "production",
  VERCEL_BRANCH_URL: "wrong.vercel.app",
  VERCEL_URL: "baggerinv.com",
  VERCEL_GIT_COMMIT_SHA: "b".repeat(40),
  VERCEL_PROJECT_ID: "wrong",
  VERCEL_PROJECT_NAME: "wrong",
  PRODUCTION_SHADOW_CANDIDATE_HOSTNAME: "different.vercel.app",
  PRODUCTION_SHADOW_CANDIDATE_EXPECTED_COMMIT_SHA: "c".repeat(40),
  PRODUCTION_SHADOW_CANDIDATE_EXPECTED_VERCEL_PROJECT_ID: "wrong",
  PRODUCTION_FOUNDATION_ENABLED: "false",
  PRODUCTION_SUPABASE_PROJECT_REF: "wrong",
  PRODUCTION_SUPABASE_URL: "https://wrong.invalid",
  PRODUCTION_SUPABASE_SECRET_KEY: "short",
  NEXT_PUBLIC_SUPABASE_AUTH_URL: "https://wrong.invalid",
  NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY: "short",
  PRODUCTION_SHADOW_CANDIDATE_AUTH_ENABLED: "false",
  SCORING_AUTHORITY: "unsupported-provider",
  PARTICIPANT_IDENTITY_AUTHORITY: "passport",
  PARTICIPANT_AUTH_CAPTCHA_REQUIRED: "false",
  PARTICIPANT_AUTH_CAPTCHA_CONFIGURED: "false",
  NEXT_PUBLIC_PARTICIPANT_AUTH_TURNSTILE_SITE_KEY: "short",
  PARTICIPANT_AUTH_RATE_LIMIT_SECRET: "short",
  PRODUCTION_SUPABASE_SCORING_INGRESS_ENABLED: "true",
  PRODUCTION_SUPABASE_GOOGLE_MIRROR_ENABLED: "true",
  PRODUCTION_SUPABASE_PUBLIC_READS_ENABLED: "true",
  PRODUCTION_SUPABASE_ODDS_PUBLICATION_ENABLED: "true",
  PRODUCTION_SUPABASE_AUTH_USER_CREATION_ENABLED: "true",
  SUPABASE_SCORING_MIRROR_ENABLED: "true",
  PRODUCTION_SHADOW_CANDIDATE_TRANSPORT_ASSERTED: "false",
  SUPABASE_SCORING_MIRROR_URL: ordinaryPreview.SUPABASE_SCORING_MIRROR_URL,
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "wrong",
};
for (const [key, value] of Object.entries(rejectedFields)) {
  test(`NA-P0F-READ-BOUNDARY: requested diagnostic rejects ${key} drift`, () => {
    assertRequestedDenied({ ...candidate, [key]: value });
  });
}

test("NA-P0F-PREDICTION-READ-02: invalid requested diagnostic cannot fall through to otherwise valid Preview", () => {
  assert.equal(predictionInputBundleEnvironment(ordinaryPreview).available, true);
  assert.equal(history2026ReadEnvironment(ordinaryPreview).resolved, "supabase");
  const otherwisePreview = {
    ...candidate,
    SUPABASE_SCORING_MIRROR_URL: ordinaryPreview.SUPABASE_SCORING_MIRROR_URL,
    SUPABASE_SCORING_MIRROR_SECRET_KEY: ordinaryPreview.SUPABASE_SCORING_MIRROR_SECRET_KEY,
  };
  assertRequestedDenied(otherwisePreview);
  assertRequestedDenied({ ...candidate, ...ordinaryPreview });
});

test("NA-P0F-PREDICTION-READ-03: invalid requested diagnostic cannot borrow protected Production cutover", () => {
  assert.equal(predictionInputBundleEnvironment(protectedSelector).available, true);
  assert.equal(history2026ReadEnvironment(protectedSelector).resolved, "supabase");
  assertRequestedDenied({ ...protectedSelector, PRODUCTION_SHADOW_CANDIDATE_ENABLED: "true" });
});

test("NA-P0F-READ-BASELINE-01: ordinary Preview retains its previous History and Prediction requirements", () => {
  const history = history2026ReadEnvironment(ordinaryPreview);
  const prediction = predictionInputBundleEnvironment(ordinaryPreview);
  assert.equal(history.resolved, "supabase");
  assert.equal(history.productionShadowCandidate, false);
  assert.equal(history.workbookId, "");
  assert.equal(prediction.available, true);
  assert.equal(prediction.productionShadowCandidate, false);
  assert.equal(prediction.reason, "preview-supabase-prediction-input-bundle");
  const mirrorDisabled = { ...ordinaryPreview, SUPABASE_SCORING_MIRROR_ENABLED: "false" };
  assert.equal(history2026ReadEnvironment(mirrorDisabled).reason, "supabase-service-disabled");
  assert.equal(predictionInputBundleEnvironment(mirrorDisabled).available, true);
  assert.equal(predictionInputBundleEnvironment({ ...ordinaryPreview, SECONDARY_HISTORY_READ_SOURCE: "unavailable" }).available, false);
  assert.equal(history2026ReadEnvironment({ ...ordinaryPreview, SCORING_AUTHORITY: "google" }).reason, "supabase-scoring-authority-required");
});

test("NA-P0F-READ-BASELINE-02: ordinary protected Production keeps current-read and later Prediction phases", () => {
  assert.equal(history2026ReadEnvironment(protectedSelector).productionCutover.handled, true);
  assert.equal(predictionInputBundleEnvironment(protectedSelector).contract, "prediction-input-bundle-production-cutover-gate-v1");
  const currentReadsOnly = { ...protectedSelector, PRODUCTION_CUTOVER_PHASE: "CURRENT_READS" };
  assert.equal(history2026ReadEnvironment(currentReadsOnly).resolved, "supabase");
  assert.equal(predictionInputBundleEnvironment(currentReadsOnly).available, false);
  const unactivated = { ...ordinaryPreview, VERCEL_ENV: "production" };
  assert.equal(history2026ReadEnvironment(unactivated).blocked, true);
  assert.equal(predictionInputBundleEnvironment(unactivated).available, false);
});

test("NA-P0F-HISTORY-READ-02: diagnostic History remains 2026-scoped and rejects wrong target before transport", async () => {
  assert.equal(history2026ReadEnvironment({ ...candidate, HISTORY_2026_TOURNAMENT_ID: "2027" }).reason,
    "approved-2026-tournament-required");
  assert.equal(isSupabaseHistory2026(2026, candidate), true);
  assert.equal(isSupabaseHistory2026(2027, candidate), false);
  assert.equal(history2026ReadEnvironment({ ...candidate, HISTORY_2026_READ_SOURCE: "google" }).blocked, true);
  await withMockTransport(async calls => {
    for (const target of [{ tournamentId: "2027" }, { tournamentId: "foreign" }, { year: 2025 }, { year: "2026-extra" }]) {
      await assert.rejects(readHistory2026SupabaseView({ env: candidate, ...target }),
        { code: "HISTORY_2026_EXPLICIT_TOURNAMENT_REQUIRED", status: 404 });
    }
    assert.equal(calls.length, 0);
  });
});

test("NA-P0F-READ-BOUNDARY: exact request host, origin, and HTTPS remain required before the read marker", () => {
  const request = (url, headers = {}) => new Request(url, {
    headers: { host: "closure-read.vercel.app", origin: "https://closure-read.vercel.app", ...headers },
  });
  const url = "https://closure-read.vercel.app/api/history/2026";
  assert.equal(productionShadowCandidateRequestEnvironment(request(url), candidate, { requireOrigin: true }).allowed, true);
  for (const bad of [
    request("https://wrong.vercel.app/api/history/2026"),
    request(url, { host: "wrong.vercel.app" }),
    request(url, { origin: "https://wrong.vercel.app" }),
    request(url, { "x-forwarded-host": "wrong.vercel.app" }),
    request(url, { "x-forwarded-proto": "http" }),
    request("http://closure-read.vercel.app/api/history/2026"),
  ]) {
    assert.equal(productionShadowCandidateRequestEnvironment(bad, candidate, { requireOrigin: true }).allowed, false);
  }
});

test("NA-P0F-READ-BOUNDARY: History and Prediction read admission cannot authorize writes", async () => {
  assert.equal(history2026ReadEnvironment(candidate).resolved, "supabase");
  assert.equal(predictionInputBundleEnvironment(candidate).available, true);
  assert.ok(PRODUCTION_SHADOW_CANDIDATE_READ_RPCS.every(name => name.startsWith("read_")));
  const request = new Request("https://closure-read.vercel.app/api/scoring/current", {
    method: "POST", headers: { host: "closure-read.vercel.app", origin: "https://closure-read.vercel.app" },
  });
  assert.equal(productionShadowCandidateScoringMutationDecision(request, candidate).code,
    "PRODUCTION_SHADOW_CANDIDATE_SCORING_READ_ONLY");
  await withMockTransport(async calls => {
    for (const rpc of [
      "submit_production_hole_score", "finalize_production_match", "reopen_production_match",
      "mutate_production_match_control", "claim_production_score_derived_intents_v1",
      "publish_production_odds_calculation", "replace_preview_scoring_authority_import",
      "execute_isolated_director_operation_v1", "mutate_production_annual_tournament_v1",
    ]) {
      await assert.rejects(scoringShadowRpc(rpc, { input: {} }, { env: candidate }),
        { code: "PRODUCTION_SHADOW_CANDIDATE_RPC_FORBIDDEN", status: 403 }, rpc);
    }
    assert.equal(calls.length, 0);
  });
});

test("NA-P0F-HISTORY-TRANSPORT-01: previously certified History read translation stays read-only", async () => {
  await withMockTransport(async calls => {
    const read = await scoringShadowRpc("read_preview_2026_historical_view", { target_tournament_id: "2026" }, { env: candidate });
    assert.equal(read.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${PRODUCTION_SUPABASE_URL}/rest/v1/rpc/read_production_candidate_current_view`);
    assert.equal(calls[0].body.input.surface, "HISTORY_2026");
    assert.equal(calls[0].body.input.tournament_id, "2026");
    assert.equal(calls[0].body.input.tournament_year, 2026);
    assert.equal(calls[0].body.input.source_workbook_id, PRODUCTION_GOOGLE_WORKBOOK_ID);
  });
});

test("NA-P0F-HISTORY-TRANSPORT-02: actual canonical History reader reaches certified read-only transport", async () => {
  // This is a required behavior test, not an expected-red waiver. A missing
  // canonical RPC alias must remain a visible failure until separately fixed.
  await withMockTransport(async calls => {
    const read = await readHistory2026SupabaseView({ env: candidate, tournamentId: "2026", year: 2026 });
    assert.equal(read.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${PRODUCTION_SUPABASE_URL}/rest/v1/rpc/read_production_candidate_current_view`);
    assert.equal(calls[0].body.input.surface, "HISTORY_2026");
    assert.equal(calls[0].body.input.tournament_id, "2026");
    assert.equal(calls[0].body.input.tournament_year, 2026);
    assert.equal(calls[0].body.input.source_workbook_id, PRODUCTION_GOOGLE_WORKBOOK_ID);
    assert.equal(read.payload.data.counts.matches, 1);
    assert.equal(read.payload.data.counts.final_matches, 1);
    assert.equal(read.payload.data.matches[0].scoring_snapshot.format, "SINGLES");
  }, { ok: true, data: { players: [], rounds: [], teams: [], matches: [{ match: { match_id: "synthetic-2026-M1", status: "FINAL", format: "SINGLES" }, holes: [] }] } });
});

test("NA-P0F-PREDICTION-SERVICE-01: denied diagnostic request invokes neither current nor history dependency", async () => {
  let downstreamCalls = 0;
  const invalid = {
    ...candidate,
    SUPABASE_SCORING_MIRROR_URL: ordinaryPreview.SUPABASE_SCORING_MIRROR_URL,
    SUPABASE_SCORING_MIRROR_SECRET_KEY: ordinaryPreview.SUPABASE_SCORING_MIRROR_SECRET_KEY,
  };
  await withMockTransport(async calls => {
    await assert.rejects(preparePredictionInputBundle({ env: invalid, dependencies: {
      readOddsInputBundle: async () => { downstreamCalls++; throw new Error("must not reach current reader"); },
      loadSecondaryHistoryModel: async () => { downstreamCalls++; throw new Error("must not reach history reader"); },
    } }), { code: "PREDICTION_INPUT_BUNDLE_PREVIEW_CONFIGURATION_REQUIRED", status: 503 });
    assert.equal(downstreamCalls, 0);
    assert.equal(calls.length, 0);
  });
});

test("NA-P0F-PREDICTION-SERVICE-02: admitted canonical dependency failure is local and never a provider fallback", async () => {
  const upstreamFailure = Object.assign(new Error("Synthetic canonical read unavailable"), { code: "SYNTHETIC_CANONICAL_READ_UNAVAILABLE", status: 503 });
  let currentCalls = 0, historyCalls = 0;
  await withMockTransport(async calls => {
    await assert.rejects(preparePredictionInputBundle({ env: candidate, dependencies: {
      readOddsInputBundle: async (id, { env }) => {
        currentCalls++;
        assert.equal(id, "2026");
        assert.equal(env, candidate);
        throw upstreamFailure;
      },
      loadSecondaryHistoryModel: async ({ env }) => {
        historyCalls++;
        assert.equal(env, candidate);
        return {};
      },
    } }), error => error === upstreamFailure);
    assert.equal(currentCalls, 1);
    assert.equal(historyCalls, 1);
    assert.equal(calls.length, 0);
  });
});

// Use the existing canonical synthetic History fixture, encoded as the current
// read RPC returns it. No reader, translator, builder or sanitizer is replaced.
function historyWireFixture() {
  const aggregate = makeHistory2026Aggregate();
  aggregate.source_fingerprint = "read-adapter-extension-synthetic-revision";
  aggregate.matches = aggregate.matches.map(({ scoring_snapshot, ...record }) => ({
    ...record, snapshot: scoring_snapshot,
  }));
  aggregate.actor_id = "PRIVATE_ACTOR_SENTINEL";
  aggregate.service_role = "PRIVATE_SERVICE_SENTINEL";
  aggregate.archive_jobs = [{ claim_token: "PRIVATE_ARCHIVE_SENTINEL" }];
  aggregate.players[0].actor_id = "PRIVATE_PLAYER_ACTOR_SENTINEL";
  return aggregate;
}
function guideWireFixture() {
  const guide = makeGuideProjection();
  return { ok: true, data: {
    payload: guide.content, revision_number: guide.revision,
    payload_fingerprint: guide.contentFingerprint, imported_at: "2026-01-01T00:00:00Z",
  } };
}
function historyResponse(call) {
  const name = new URL(call.url).pathname.split("/").at(-1);
  if (name === "read_production_guide_projection") return Response.json(guideWireFixture());
  if (name === "read_production_candidate_current_view" && call.body?.input?.surface === "HISTORY_2026") {
    return Response.json({ ok: true, data: historyWireFixture() });
  }
  if (name === "read_production_candidate_current_view" && call.body?.input?.surface === "LEADERBOARDS") {
    const aggregate = makeHistory2026Aggregate();
    return Response.json({ ok: true, data: {
      teams: aggregate.teams,
      players: aggregate.players.map(player => ({
        player_id: player.player_id,
        tournament_source_payload: { "Tournament Handicap": player.tournament_handicap },
      })),
    } });
  }
  throw new Error(`Unexpected synthetic History transport: ${name}/${call.body?.input?.surface}`);
}

test("NA-P0F-HISTORY-SERVICE-01: actual service returns the canonical sanitized public DTO with zero Google", async () => {
  await withMockTransport(async calls => {
    const view = await loadHistory2026View({ env: candidate, year: 2026, includeTournamentPlayerMetadata: true });
    assert.equal(view.source, "supabase");
    assert.equal(view.year, 2026);
    assert.equal(view.matches.length, 24);
    assert.equal(view.diagnostics.finalMatches, 17);
    assert.equal(view.diagnostics.liveMatches, 7);
    assert.equal(view.analytics.scorecards.length, 46);
    assert.equal(view.analytics.scorecards.reduce((n, card) => n + card.holes.filter(hole => hole.score !== null).length, 0), 828);
    assert.equal(view.diagnostics.googleForegroundRequests, 0);
    assert.ok(view.tournament);
    assert.ok(view.analytics);
    assert.equal(calls.length, 3);
    assert.deepEqual(calls.map(call => new URL(call.url).pathname.split("/").at(-1)).sort(), [
      "read_production_candidate_current_view", "read_production_candidate_current_view", "read_production_guide_projection",
    ]);
    for (const call of calls) {
      assert.equal(new URL(call.url).origin, PRODUCTION_SUPABASE_URL);
      assert.equal(call.body.input.tournament_id, "2026");
      assert.equal(call.body.input.tournament_year, 2026);
      assert.equal(call.body.input.project_ref, PRODUCTION_SUPABASE_PROJECT_REF);
      assert.equal(call.body.input.source_workbook_id, PRODUCTION_GOOGLE_WORKBOOK_ID);
    }
    const serialized = JSON.stringify(view);
    for (const forbidden of [
      "finalized_snapshots", "snapshot_id", "payload_hash", "archive_jobs", "archive_checkpoints",
      "claim_token", "actor_id", "service_role", "mutation_key", "PRIVATE_", "synthetic-server-credential",
    ]) assert.doesNotMatch(serialized, new RegExp(forbidden, "i"));
    // This is intentionally a public read contract. It grants no Director,
    // participant scoring, session, or privileged inspection authority.
    assert.equal("session" in view, false);
    assert.equal("authorization" in view, false);
  }, historyResponse);
});

test("NA-P0F-HISTORY-SERVICE-02: actual service rejects wrong year, target, resource, transport and context before any read", async () => {
  const denied = [
    { env: candidate, year: 2027 },
    { env: candidate, tournamentId: "foreign" },
    { env: { ...candidate, PRODUCTION_SUPABASE_PROJECT_REF: "wrong" } },
    { env: { ...candidate, PRODUCTION_SHADOW_CANDIDATE_TRANSPORT_ASSERTED: "false" } },
    { env: { ...candidate, PRODUCTION_SHADOW_CANDIDATE_ENABLED: "false" } },
    { env: { ...candidate, NEXT_PUBLIC_SUPABASE_AUTH_URL: "https://wrong.invalid" } },
  ];
  await withMockTransport(async calls => {
    for (const options of denied) {
      await assert.rejects(loadHistory2026View(options), error =>
        ["HISTORY_2026_EXPLICIT_TOURNAMENT_REQUIRED", "HISTORY_2026_SUPABASE_CONFIGURATION_REQUIRED"].includes(error.code));
    }
    assert.equal(calls.length, 0);
  });
});

test("NA-P0F-HISTORY-SERVICE-03: canonical History outage fails locally without provider, session or navigation fallback", async () => {
  await withMockTransport(async calls => {
    await assert.rejects(loadHistory2026View({ env: candidate, year: 2026 }), error => {
      assert.equal(error.status, 503);
      assert.equal(error.shadowDiagnostics.code, "SYNTHETIC_HISTORY_OUTAGE");
      assert.equal("session" in error, false);
      assert.equal("redirect" in error, false);
      return true;
    });
    assert.equal(calls.length, 2, "only the History and course projection reads run");
    assert.ok(calls.every(call => new URL(call.url).origin === PRODUCTION_SUPABASE_URL));
  }, call => call.body?.input?.surface === "HISTORY_2026"
    ? Response.json({ code: "SYNTHETIC_HISTORY_OUTAGE" }, { status: 503 })
    : Response.json(guideWireFixture()));
});

test("NA-P0F-HISTORY-CONTEXT-01: validated diagnostic bit remains distinct from cutover and cannot be supplied by caller options", async () => {
  const diagnostic = history2026RpcContext(candidate);
  assert.equal(diagnostic.productionShadowCandidate, true);
  assert.equal(diagnostic.productionCutover, false);
  const isolated = history2026RpcContext(ordinaryPreview);
  assert.equal(isolated.productionShadowCandidate, false);
  assert.equal(isolated.productionCutover, false);
  const protectedRead = history2026RpcContext(protectedSelector);
  assert.equal(protectedRead.productionShadowCandidate, false);
  assert.equal(protectedRead.productionCutover, true);
  await withMockTransport(async calls => {
    await assert.rejects(readHistory2026SupabaseView({
      env: { ...candidate, PRODUCTION_SHADOW_CANDIDATE_TRANSPORT_ASSERTED: "false" },
      productionShadowCandidate: true, productionCutover: true,
      context: diagnostic,
    }), { code: "HISTORY_2026_SUPABASE_CONFIGURATION_REQUIRED" });
    assert.equal(calls.length, 0);
  });
});

test("NA-P0F-HISTORY-CONTEXT-02: public History admission never grants privileged inspection to caller role hints", async () => {
  await withMockTransport(async calls => {
    for (const role of ["PARTICIPANT", "SPECTATOR", "SIGNED_OUT"]) {
      await assert.rejects(inspectHistory2026SupabaseSecurity({ env: candidate, role }),
        { code: "PRODUCTION_SHADOW_CANDIDATE_RPC_FORBIDDEN", status: 403 });
    }
    assert.equal(calls.length, 0);
  });
});

test("NA-P0F-HISTORY-TRANSPORT-03: ordinary isolated History retains direct canonical RPC and excludes workbook routing input", async () => {
  await withMockTransport(async calls => {
    const read = await readHistory2026SupabaseView({ env: ordinaryPreview, year: 2026 });
    assert.equal(read.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${ordinaryPreview.SUPABASE_SCORING_MIRROR_URL}/rest/v1/rpc/read_canonical_2026_historical_view`);
    assert.deepEqual(calls[0].body, { target_tournament_id: "2026" });
  });
});

test("NA-P0F-HISTORY-TRANSPORT-04: existing Production cutover retains its exact frozen History read translation", async () => {
  await withMockTransport(async calls => {
    const read = await readHistory2026SupabaseView({ env: protectedSelector, year: 2026 });
    assert.equal(read.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${PRODUCTION_SUPABASE_URL}/rest/v1/rpc/read_production_cutover_current_view`);
    assert.equal(calls[0].body.input.surface, "HISTORY_2026");
    assert.equal(calls[0].body.input.tournament_id, "2026");
    assert.equal(calls[0].body.input.tournament_year, 2026);
    assert.equal(calls[0].body.input.source_workbook_id, PRODUCTION_GOOGLE_WORKBOOK_ID);
    assert.equal(calls[0].body.input.project_ref, PRODUCTION_SUPABASE_PROJECT_REF);
  });
});

test("NA-P0F-ADJACENT-GUIDE: actual Guide adapter selects and transforms its existing read projection", async () => {
  await withMockTransport(async calls => {
    const read = await readGuideProjection({ env: candidate, tournamentId: "2026" });
    assert.equal(read.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${PRODUCTION_SUPABASE_URL}/rest/v1/rpc/read_production_guide_projection`);
    assert.equal(calls[0].body.input.domain, "GUIDE");
    assert.equal(calls[0].body.input.contract_version, "guide-projection-v1");
    assert.equal(calls[0].body.input.tournament_id, "2026");
    assert.equal(read.payload.data.projection_revision, 7);
    assert.equal(read.payload.data.content.courses.length, 3);
    assert.equal(read.payload.data.content_fingerprint, "f".repeat(64));
  }, guideWireFixture());
});

test("NA-P0F-ADJACENT-LEADERBOARD: actual leaderboard adapter retains current tournament scope and canonical payload", async () => {
  const data = { tournament: { tournament_id: "2026" }, players: [{ player_id: "SYNTHETIC_PLAYER", tournament_source_payload: { "Tournament Handicap": 12 } }] };
  await withMockTransport(async calls => {
    const read = await readLeaderboardsCoreView("2026", { env: candidate });
    assert.equal(read.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${PRODUCTION_SUPABASE_URL}/rest/v1/rpc/read_production_candidate_current_view`);
    assert.equal(calls[0].body.input.surface, "LEADERBOARDS");
    assert.equal(calls[0].body.input.target_tournament_id, "2026");
    assert.deepEqual(read.payload.data, data);
  }, { ok: true, data });
});

test("NA-P0F-ADJACENT-COMPLETED: actual completed-History adapter retains the explicit historical year selector", async () => {
  const data = { revisions: [{ tournament_year: 2025, revision_number: 1, status: "CURRENT" }] };
  await withMockTransport(async calls => {
    const read = await readCompletedHistory({ env: candidate, year: 2025 });
    assert.equal(read.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${PRODUCTION_SUPABASE_URL}/rest/v1/rpc/read_production_candidate_completed_history`);
    assert.equal(calls[0].body.input.mode, "YEAR");
    assert.equal(calls[0].body.input.tournament_year, 2025);
    assert.equal(calls[0].body.input.tournament_id, "2026");
    assert.deepEqual(read.payload.data, data);
  }, { ok: true, data });
});

test("NA-P0F-ADJACENT-EDITORIAL: actual player-editorial reader uses the certified immutable projection", async () => {
  const players = [{ player_id: "SYNTHETIC_PLAYER", public_profile: { nickname: "Synthetic" } }];
  await withMockTransport(async calls => {
    const read = await readPreviewSecondaryHistoryPlayers({ env: candidate });
    assert.equal(read.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${PRODUCTION_SUPABASE_URL}/rest/v1/rpc/read_production_player_editorial`);
    assert.equal(calls[0].body.input.domain, "PLAYER_EDITORIAL");
    assert.equal(calls[0].body.input.contract_version, "player-public-profile-v1");
    assert.equal(calls[0].body.input.tournament_id, "2026");
    assert.deepEqual(read.payload.data.players, players);
    assert.equal(read.payload.data.revision_number, 2);
  }, { ok: true, data: { payload: { players }, contract_version: "player-public-profile-v1", revision_number: 2, validation_status: "VALID" } });
});
