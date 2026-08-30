import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canonicalCalcuttaDecimal,
  currentProductionCalcuttaV1,
  productionCalcuttaV1ContractData,
  productionCalcuttaV1Data,
} from "../lib/production-calcutta-v1.js";
import { calcuttaDestinationAvailable } from "../lib/calcutta-presentation-availability.js";
import { mobileCalcuttaDataFromProductionView } from "../lib/mobile-v1-calcutta.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "../lib/production-foundation-resource-contract.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const fingerprint = (character) => character.repeat(64);
const secret = `sb_secret_${"x".repeat(32)}`;
const commitSha = "a".repeat(40);
const activeProduction = Object.freeze({
  VERCEL_ENV: "production",
  VERCEL_PROJECT_ID: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
  VERCEL_PROJECT_NAME: "bagger-inv",
  VERCEL_GIT_COMMIT_SHA: commitSha,
  VERCEL_DEPLOYMENT_ID: "dpl_production_calcutta_v1",
  PRODUCTION_FOUNDATION_ENABLED: "true",
  PRODUCTION_CUTOVER_ACTIVATION_ENABLED: "true",
  PRODUCTION_CUTOVER_EXPECTED_COMMIT_SHA: commitSha,
  PRODUCTION_CUTOVER_EXPECTED_VERCEL_PROJECT_ID: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
  PRODUCTION_CANONICAL_DOMAIN: "https://baggerinv.com",
  PRODUCTION_CUTOVER_TOURNAMENT_ID: "2026",
  PRODUCTION_CUTOVER_TOURNAMENT_YEAR: "2026",
  PRODUCTION_CUTOVER_PHASE: "OBSERVATION",
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_SUPABASE_SECRET_KEY: secret,
  SUPABASE_SCORING_MIRROR_URL: PRODUCTION_SUPABASE_URL,
  SUPABASE_SCORING_MIRROR_SECRET_KEY: secret,
  GOOGLE_SHEETS_ID: PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PUBLIC_READS_ENABLED: "true",
  PRODUCTION_SUPABASE_DIRECTOR_AUTH_ENABLED: "true",
  PRODUCTION_SUPABASE_ADMIN_SESSION_REVALIDATION_ENABLED: "true",
  SCORING_AUTHORITY: "google",
  PARTICIPANT_IDENTITY_AUTHORITY: "passport",
});

const freshness = Object.freeze({
  stale: false,
  updating: false,
  configured_at: "2026-08-29T12:00:00.000Z",
  auction_recorded_at: "2026-08-29T12:05:00.000Z",
  published_at: "2026-08-29T12:06:00.000Z",
  calculated_at: "2026-08-29T12:10:00.000Z",
  source_fingerprint: fingerprint("d"),
});

const market = Object.freeze({
  pot: "300.000",
  purchases: [
    {
      player: { player_id: "CB01", display_name: "Clay" },
      purchase_price: "200.00",
      owners: [
        { player: { player_id: "CB01", display_name: "Clay" }, ownership_fraction: "0.6250" },
        { player: { player_id: "CL01", display_name: "Chris" }, ownership_fraction: "0.3750" },
      ],
    },
    {
      player: { player_id: "CL01", display_name: "Chris" },
      purchase_price: "100",
      owners: [
        { player: { player_id: "CL01", display_name: "Chris" }, ownership_fraction: "1" },
      ],
    },
  ],
});

const result = Object.freeze({
  available: true,
  year: 2026,
  pot: 300,
  tournamentComplete: false,
  completedRounds: [1],
  distributedPrizePool: 118.125,
  guaranteedDistributed: 60,
  remainingPrizePool: 240,
  golfers: [
    {
      playerId: "CB01",
      player: { id: "CB01", name: "Clay", photo: "", slug: "clay" },
      rank: 1,
      tieSize: 1,
      purchasePrice: 200,
      rounds: [
        {
          round: 1,
          format: "BB",
          gross: 75,
          net: 68,
          fullCourseHandicap: 7,
          place: 1,
          tieSize: 1,
          points: 30,
          payoutPercent: 0.2,
          guaranteedWinnings: 60,
        },
      ],
      totalPoints: 30,
      overallPayoutPercent: 0.19375,
      totalPayoutPercent: 0.39375,
      currentPayoutValue: 118.125,
      guaranteedWinnings: 60,
      remainingUpside: 58.125,
      netProfit: -81.875,
      roi: -0.409375,
    },
  ],
  portfolios: [
    {
      ownerId: "CB01",
      owner: { id: "CB01", name: "Clay" },
      rank: 1,
      investments: [{
        playerId: "CB01",
        player: { id: "CB01", name: "Clay" },
        ownership: 0.625,
        purchasePrice: 125,
        guaranteedWinnings: 37.5,
        currentPayoutValue: 73.828125,
        netProfit: -51.171875,
        roi: -0.409375,
      }],
      purchaseCost: 125,
      guaranteedWinnings: 37.5,
      currentPayoutValue: 73.828125,
      netProfit: -51.171875,
      roi: -0.409375,
    },
  ],
  storylines: [],
  hero: {},
});

function view({
  state = "AUCTION_COMPLETE",
  publicationState = "PUBLISHED",
  configurationRevision = 2,
  auctionRevision = 1,
  publicationRevision = 2,
  resultRevision = null,
  marketValue = market,
  resultValue = null,
} = {}) {
  return {
    contract_version: "production-calcutta-v1",
    tournament_id: "2026",
    state,
    publication_state: publicationState,
    published: publicationState === "PUBLISHED",
    currency_code: "USD",
    configuration_revision: configurationRevision,
    auction_revision: auctionRevision,
    publication_revision: publicationRevision,
    result_revision: resultRevision,
    configuration_fingerprint: state === "NOT_CONFIGURED" ? null : fingerprint("b"),
    auction_fingerprint: auctionRevision ? fingerprint("c") : null,
    revision: `calcutta-v1:${configurationRevision}:${auctionRevision}:${publicationRevision}:${resultRevision ?? 0}:${state}:${publicationState}`,
    freshness,
    market: publicationState === "PUBLISHED" ? marketValue : null,
    result: publicationState === "PUBLISHED" ? resultValue : null,
  };
}

test("Production Calcutta V1 keeps NOT_CONFIGURED and explicit unpublish fact-free", () => {
  const notConfigured = productionCalcuttaV1Data(view({
    state: "NOT_CONFIGURED",
    publicationState: "UNPUBLISHED",
    configurationRevision: 1,
    auctionRevision: 0,
    publicationRevision: 0,
    marketValue: null,
  }));
  assert.equal(notConfigured.calcuttaState.visible, false);
  assert.equal(notConfigured.calcutta, null);

  const unpublished = productionCalcuttaV1ContractData(view({
    state: "IN_PROGRESS",
    publicationState: "UNPUBLISHED",
    publicationRevision: 3,
    resultRevision: 7,
  }));
  assert.equal(unpublished.state, "IN_PROGRESS");
  assert.equal(unpublished.resultRevision, 7);
  assert.equal(unpublished.published, false);
  assert.equal(unpublished.market, null);
  assert.equal(unpublished.result, null);

  const unpublishedOfficial = productionCalcuttaV1ContractData(view({
    state: "OFFICIAL",
    publicationState: "UNPUBLISHED",
    publicationRevision: 5,
    resultRevision: 8,
  }));
  assert.equal(unpublishedOfficial.state, "OFFICIAL");
  assert.equal(unpublishedOfficial.result, null);

  assert.throws(() => productionCalcuttaV1ContractData({
    ...view({ publicationState: "UNPUBLISHED", marketValue: null }),
    market,
  }), (error) => error.code === "CALCUTTA_V1_UNPUBLISHED_FACTS_FORBIDDEN");
});

test("published auction facts produce a bounded participant market and existing PWA model", () => {
  const contract = productionCalcuttaV1ContractData(view());
  assert.equal(contract.market.pot, "300");
  assert.equal(contract.market.purchases[0].purchasePrice, "200");
  assert.deepEqual(contract.market.purchases[0].owners.map((owner) => owner.ownershipFraction), ["0.625", "0.375"]);
  assert.equal(contract.result, null);

  const web = productionCalcuttaV1Data(view());
  assert.equal(web.calcuttaState.visible, true);
  assert.equal(web.calcutta.available, true);
  assert.equal(web.calcutta.pot, 300);
  assert.equal(web.calcutta.golfers.length, 2);
  assert.equal(web.calcutta.portfolios.length, 2);
  assert.deepEqual(web.calcutta.completedRounds, []);
});

test("same-revision result maps money and fractions without cent rounding", () => {
  const raw = view({
    state: "IN_PROGRESS",
    publicationRevision: 4,
    resultRevision: 7,
    resultValue: result,
  });
  const mobile = mobileCalcuttaDataFromProductionView(raw, {
    tournamentId: "2026",
    playerId: "CB01",
  });
  assert.equal(mobile.viewer.playerId, "CB01");
  assert.equal(mobile.result.golfers[0].tournamentValue, "118.125");
  assert.equal(mobile.result.golfers[0].overallPayoutFraction, "0.19375");
  assert.equal(mobile.result.golfers[0].roi, "-0.409375");
  assert.equal(mobile.result.portfolios[0].investments[0].tournamentValue, "73.828125");
  assert.equal(mobile.result.golfers[0].rounds[0].roundId, "2026:R1");
  assert.equal(canonicalCalcuttaDecimal("118.125000"), "118.125");

  const web = productionCalcuttaV1Data(raw);
  assert.equal(web.calcutta.currentPayoutValue, undefined);
  assert.equal(web.calcutta.golfers[0].currentPayoutValue, 118.125);
  assert.equal(web.calcutta.golfers[0].rounds[1].round, 1);
  assert.equal(web.calcutta.golfers[0].owners[0].ownerId, "CB01");
  assert.equal(web.calcutta.golfers[0].owners[0].ownership, 0.625);
  assert.equal(web.calcutta.source.mode, "production-calcutta-v1-published-result");
});

test("invalid publication, resource, revision, and stale result contracts fail closed", () => {
  assert.throws(() => productionCalcuttaV1ContractData({
    ...view(),
    tournament_id: "preview-2026",
  }), (error) => error.code === "CALCUTTA_V1_RESOURCE_BINDING_REQUIRED");
  assert.throws(() => productionCalcuttaV1ContractData({
    ...view(),
    revision: "caller-selected",
  }), (error) => error.code === "CALCUTTA_V1_RESOURCE_BINDING_REQUIRED");
  assert.throws(() => productionCalcuttaV1ContractData(view({
    state: "CONFIGURED",
    publicationState: "PUBLISHED",
  })), (error) => error.code === "CALCUTTA_V1_PUBLICATION_STATE_REQUIRED");
  assert.throws(() => productionCalcuttaV1ContractData(view({
    state: "IN_PROGRESS",
    publicationRevision: 4,
    resultRevision: null,
    resultValue: result,
  })), (error) => error.code === "CALCUTTA_V1_RESULT_REQUIRED");
  assert.throws(() => productionCalcuttaV1ContractData(view({
    state: "IN_PROGRESS",
    publicationRevision: 4,
    resultRevision: 7,
    resultValue: { ...result, tournamentComplete: true },
  })), (error) => error.code === "CALCUTTA_V1_RESULT_REQUIRED");
  assert.throws(() => productionCalcuttaV1ContractData(view({
    state: "UNAVAILABLE",
    publicationRevision: 4,
    resultRevision: 7,
    resultValue: result,
  })), (error) => error.code === "CALCUTTA_V1_RESULT_REQUIRED");
  assert.throws(() => productionCalcuttaV1ContractData({
    ...view({ state: "UNAVAILABLE", publicationRevision: 4, resultRevision: null }),
    auction_fingerprint: null,
  }), (error) => error.code === "CALCUTTA_V1_RESOURCE_BINDING_REQUIRED");
  assert.throws(() => productionCalcuttaV1ContractData(view({
    state: "NOT_CONFIGURED",
    publicationState: "UNPUBLISHED",
    configurationRevision: 2,
    auctionRevision: 0,
    publicationRevision: 0,
    marketValue: null,
  })), (error) => error.code === "CALCUTTA_V1_RESOURCE_BINDING_REQUIRED");
  assert.throws(() => productionCalcuttaV1ContractData(view({
    state: "NOT_CONFIGURED",
    publicationState: "UNPUBLISHED",
    configurationRevision: 1,
    auctionRevision: 0,
    publicationRevision: 1,
    marketValue: null,
  })), (error) => error.code === "CALCUTTA_V1_RESOURCE_BINDING_REQUIRED");
  assert.throws(() => productionCalcuttaV1ContractData(view({
    state: "CONFIGURED",
    publicationState: "UNPUBLISHED",
    auctionRevision: 1,
    publicationRevision: 2,
  })), (error) => error.code === "CALCUTTA_V1_RESOURCE_BINDING_REQUIRED");
  assert.throws(() => productionCalcuttaV1ContractData(view({
    state: "CONFIGURED",
    publicationState: "UNPUBLISHED",
    auctionRevision: 0,
    publicationRevision: 2,
    resultRevision: 7,
    marketValue: null,
  })), (error) => error.code === "CALCUTTA_V1_RESOURCE_BINDING_REQUIRED");

  const zeroShare = structuredClone(market);
  zeroShare.purchases[0].owners[0].ownership_fraction = "0";
  zeroShare.purchases[0].owners[1].ownership_fraction = "1";
  assert.throws(() => productionCalcuttaV1ContractData(view({ marketValue: zeroShare })),
    (error) => error.code === "CALCUTTA_V1_PUBLISHED_MARKET_REQUIRED");

  const unreconciled = structuredClone(market);
  unreconciled.purchases[0].owners[0].ownership_fraction = "0.75";
  unreconciled.purchases[0].owners[1].ownership_fraction = "0.75";
  assert.throws(() => productionCalcuttaV1ContractData(view({ marketValue: unreconciled })),
    (error) => error.code === "CALCUTTA_V1_PUBLISHED_MARKET_REQUIRED");

  const invalidResultOwnership = structuredClone(result);
  invalidResultOwnership.portfolios[0].investments[0].ownership = 2;
  assert.throws(() => productionCalcuttaV1ContractData(view({
    state: "IN_PROGRESS",
    publicationRevision: 4,
    resultRevision: 7,
    resultValue: invalidResultOwnership,
  })), (error) => error.code === "CALCUTTA_V1_PUBLISHED_MARKET_REQUIRED");
});

test("active Production read uses only the exact scoped Calcutta V1 RPC", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init.method, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, data: view() }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const read = await currentProductionCalcuttaV1({ playerId: "CB01", env: activeProduction });
    assert.equal(read.calcuttaState.state, "AUCTION_COMPLETE");
    assert.equal(read.recalculation, null);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/rest\/v1\/rpc\/read_production_calcutta_v1$/);
    assert.equal(calls[0].body.input.environment, "PRODUCTION");
    assert.equal(calls[0].body.input.project_ref, PRODUCTION_SUPABASE_PROJECT_REF);
    assert.equal(calls[0].body.input.project_url, PRODUCTION_SUPABASE_URL);
    assert.equal(calls[0].body.input.source_workbook_id, PRODUCTION_GOOGLE_WORKBOOK_ID);
    assert.equal(calls[0].body.input.tournament_id, "2026");
    assert.equal(calls[0].body.input.player_id, "CB01");
    assert.equal(calls[0].body.input.deployment_commit, commitSha);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("participant PWA uses authenticated V1 while the public secondary route stays closed", async () => {
  const [participant, legacyPublic, participantRead, dashboard, transport, sourcePolicy] = await Promise.all([
    source("app/api/leaderboards/calcutta/route.js"),
    source("app/api/tournament/secondary/route.js"),
    source("app/live/TournamentSupabaseRead.js"),
    source("app/live/TournamentDashboard.js"),
    source("lib/production-cutover-read-transport.js"),
    source("lib/calcutta-read-source.js"),
  ]);
  assert.match(participant, /resolveSupabaseParticipantIdentity/);
  assert.match(participant, /currentProductionCalcuttaV1/);
  assert.match(participant, /productionCutover\?\.handled === true/);
  assert.match(participant, /productionV1\s*\? await currentProductionCalcuttaV1/);
  assert.match(legacyPublic, /supabase-production-calcutta-v1-private/);
  assert.match(legacyPublic, /status: 404/);
  assert.match(participantRead, /secondaryReadUrl="\/api\/leaderboards\/calcutta"/);
  assert.match(dashboard, /const calcuttaAvailabilityResolved/);
  assert.match(dashboard, /current\?\.calcutta \? \{ calcutta: current\.calcutta \} : \{\}/);
  assert.match(dashboard, /setData\(\(current\) => preserveCalcuttaProjection\(initialData, current\)\)/);
  assert.match(dashboard, /setData\(\(current\) => preserveCalcuttaProjection\(payload\.data, current\)\)/);
  assert.match(dashboard, /if \(secondaryReadUrl\) loadCalcutta\(true\)/);
  assert.match(dashboard, /delete next\.calcutta;[\s\S]*delete next\.calcuttaState;/);
  assert.match(dashboard, /Calcutta is updating; showing the last calculated result\./);
  assert.match(dashboard, /Unable to refresh Calcutta; showing the last confirmed result\./);
  assert.match(transport, /"read_production_calcutta_v1"/);
  assert.match(transport, /name === "read_production_calcutta_v1"\) return "OBSERVATION"/);
  assert.match(sourcePolicy, /requiredPhase: "OBSERVATION"/);
  assert.doesNotMatch(sourcePolicy, /configurationRequiredForAnySource|requiredConfigurationFlag/);
  assert.equal(calcuttaDestinationAvailable({
    calcuttaState: { visible: false, state: "NOT_CONFIGURED" },
    presentation: { secondaryModules: ["calcutta"] },
  }), false);
  assert.equal(calcuttaDestinationAvailable({
    calcuttaState: { visible: true, state: "AUCTION_COMPLETE" },
    presentation: { secondaryModules: [] },
  }), true);
});
