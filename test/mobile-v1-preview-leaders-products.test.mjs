import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  mobileCalcuttaResult,
} from "../lib/mobile-v1-calcutta.js";
import {
  mobileNetSkinsResult,
} from "../lib/mobile-v1-net-skins.js";
import {
  readMobilePreviewCalcuttaV1,
  readMobilePreviewNetSkinsV1,
} from "../lib/mobile-v1-preview-leaders-products.js";
import { scoringShadowPayloadHash } from "../lib/scoring-shadow.js";

const now = new Date("2026-08-30T18:00:00.000Z");
const tournamentId = "2026";
const identity = Object.freeze({ tournamentId, playerId: "P1" });
const configurationFingerprint = "a".repeat(64);
const calcuttaSourceFingerprint = "c".repeat(64);

const previewEnv = Object.freeze({
  VERCEL_ENV: "preview",
  GOOGLE_SHEETS_ID: "1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts",
  PREVIEW_SCORING_SHEET_ID: "1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts",
  PARTICIPANT_IDENTITY_AUTHORITY: "supabase",
  SUPABASE_SCORING_MIRROR_URL: "https://idgigvjjqkfbqjeredpb.supabase.co",
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "server-only-test-key",
  SUPABASE_SCORING_MIRROR_ENABLED: "true",
  NEXT_PUBLIC_SUPABASE_AUTH_URL: "https://idgigvjjqkfbqjeredpb.supabase.co",
  NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY: "preview-publishable-test-key",
  HOME_READ_SOURCE: "supabase",
  TOURNAMENT_READ_SOURCE: "supabase",
  LEADERBOARDS_CORE_READ_SOURCE: "supabase",
  GUIDE_READ_SOURCE: "supabase",
  COURSE_PRESENTATION_READ_SOURCE: "supabase",
  SCORING_READ_SOURCE: "supabase",
  MATCH_AUTHORIZATION_SOURCE: "supabase",
  SCORING_AUTHORITY: "supabase",
  MOBILE_NATIVE_AUTH_ANTI_ABUSE_MODE: "supabase-turnstile",
  PARTICIPANT_AUTH_CAPTCHA_REQUIRED: "true",
  PARTICIPANT_AUTH_CAPTCHA_CONFIGURED: "true",
  NEXT_PUBLIC_PARTICIPANT_AUTH_TURNSTILE_SITE_KEY: "preview-turnstile-test-key",
  PARTICIPANT_AUTH_RATE_LIMIT_SECRET: "preview-rate-limit-secret-at-least-32-characters",
  MOBILE_NATIVE_CERTIFICATION_SIGNING_SECRET: "preview-certification-secret-at-least-32-characters",
  MOBILE_NATIVE_SUPABASE_SIGNUPS_DISABLED: "true",
  MOBILE_NATIVE_EDGE_RATE_LIMIT_CONFIGURED: "true",
});

function clone(value) {
  return structuredClone(value);
}

function successfulRead(data) {
  return { payload: { ok: true, data }, durationMs: 3 };
}

function match({ matchId, playerId, displayNumber }) {
  return {
    match: {
      match_id: matchId,
      round_number: 1,
      status: "FINAL",
      scored_holes: 18,
    },
    participants: [{ player_id: playerId }],
    presentation: { display_match_number: displayNumber },
  };
}

function netSkinsSource() {
  const sourceRevision = {
    matches: [
      { round: 1, matchId: "2026-R1-1", revision: 7 },
      { round: 1, matchId: "2026-R1-2", revision: 9 },
    ],
    holes: [
      { matchId: "2026-R1-1", hole: 18, revision: 2 },
      { matchId: "2026-R1-2", hole: 18, revision: 4 },
    ],
  };
  const sourceFingerprint = scoringShadowPayloadHash({
    tournamentId,
    matches: sourceRevision.matches,
    holes: sourceRevision.holes,
  });
  return {
    configuration_revision: 4,
    result_revision: 9,
    input: {
      tournament: { tournament_id: tournamentId },
      configurations: [{
        configuration: {
          round_number: 1,
          format: "SI",
          entry_type: "INDIVIDUAL",
          enabled: true,
          buy_in_per_entry: 25,
          configuration_fingerprint: configurationFingerprint,
          approved_at: "2026-08-29T12:00:00.000Z",
        },
        entries: [
          {
            entry_id: "2026-R1-SI-P1",
            match_number: "1",
            player_id_1: "P1",
            player_id_2: null,
            eligible: true,
          },
          {
            entry_id: "2026-R1-SI-P2",
            match_number: "2",
            player_id_1: "P2",
            player_id_2: null,
            eligible: true,
          },
        ],
      }],
      matches: [
        match({ matchId: "2026-R1-1", playerId: "P1", displayNumber: "1" }),
        match({ matchId: "2026-R1-2", playerId: "P2", displayNumber: "2" }),
      ],
      source_revision: sourceRevision,
    },
    result: {
      snapshots: [{
        round_number: 1,
        configuration_fingerprint: configurationFingerprint,
        source_fingerprint: sourceFingerprint,
        result_state: "OFFICIAL",
        calculated_at: "2026-08-30T17:00:00.000Z",
        published_at: "2026-08-30T17:05:00.000Z",
        result_payload: {
          complete: true,
          finalized: true,
          pot: 50,
          completedHoles: 18,
          skinsAwarded: 1,
          skinValue: 50,
          skins: [{
            hole: 7,
            winnerPlayerId: "P1",
            winnerPlayerId2: null,
            winningNetScore: -1,
            skinValue: 50,
          }],
          leaderboard: [
            {
              rank: 1,
              displayRank: "1",
              id: "2026-R1-SI-P1",
              playerIds: ["P1"],
              skinsWon: 1,
              totalWinnings: 50,
              winningHoles: [{ hole: 7 }],
            },
            {
              rank: 2,
              displayRank: "2",
              id: "2026-R1-SI-P2",
              playerIds: ["P2"],
              skinsWon: 0,
              totalWinnings: 0,
              winningHoles: [],
            },
          ],
          internal_draft_detail: "must-never-leave-preview-authority",
        },
      }],
      jobs: [],
    },
  };
}

function calcuttaResultPayload() {
  return {
    tournamentComplete: false,
    completedRounds: [1],
    golfers: [{
      rank: 1,
      tieSize: 1,
      player: { id: "P1", name: "Player One" },
      rounds: [{
        round: 1,
        format: "SI",
        gross: 72,
        net: 70,
        fullCourseHandicap: 2,
        place: 1,
        tieSize: 1,
        points: 10,
        payoutPercent: "0.5",
        guaranteedWinnings: "50.125",
      }],
      totalPoints: 10,
      overallPayoutPercent: "0.5",
      totalPayoutPercent: "0.5",
      guaranteedWinnings: "50.125",
      currentPayoutValue: "50.125",
      netProfit: "-50.125",
      roi: "-0.5",
      remainingUpside: "0",
    }],
    portfolios: [{
      rank: 1,
      owner: { id: "P1", name: "Player One" },
      investments: [{
        player: { id: "P1", name: "Player One" },
        ownership: "1",
        purchasePrice: "100.250",
        guaranteedWinnings: "50.125",
        currentPayoutValue: "50.125",
        netProfit: "-50.125",
        roi: "-0.5",
      }],
      purchaseCost: "100.250",
      guaranteedWinnings: "50.125",
      currentPayoutValue: "50.125",
      netProfit: "-50.125",
      roi: "-0.5",
    }],
    protected_storylines: [{ private: "must-never-leave-preview-authority" }],
  };
}

function calcuttaSource({ publicationState = "PUBLISHED", publicationFingerprint = configurationFingerprint } = {}) {
  return {
    tournament_id: tournamentId,
    configuration: {
      configuration_revision: 2,
      configuration_fingerprint: configurationFingerprint,
      approved_at: "2026-08-29T12:00:00.000Z",
      imported_at: "2026-08-29T12:01:00.000Z",
      financial_contract: { total_market_value: "100.250" },
      purchases: [{ player_id: "P1", purchase_price: "100.250" }],
      ownership: [{ player_id: "P1", owner_player_id: "P1", ownership_fraction: "1" }],
      private_director_note: "must-never-leave-preview-authority",
    },
    publication: {
      publication_state: publicationState,
      publication_revision: 3,
      configuration_fingerprint: publicationFingerprint,
      published_at: "2026-08-30T16:00:00.000Z",
    },
    snapshot: {
      configuration_fingerprint: configurationFingerprint,
      source_fingerprint: calcuttaSourceFingerprint,
      result_state: "IN_PROGRESS",
      calculated_at: "2026-08-30T17:00:00.000Z",
      result_payload: calcuttaResultPayload(),
    },
    job: { status: "SUCCEEDED" },
    result_revision: 7,
    players: [{ player_id: "P1", display_name: "Player One" }],
  };
}

async function mobileNetSkinsFromSource(source) {
  return mobileNetSkinsResult(identity, {
    env: previewEnv,
    now,
    dependencies: {
      readPreviewNetSkinsV1: (requestedIdentity, options) =>
        readMobilePreviewNetSkinsV1(requestedIdentity, {
          ...options,
          dependencies: {
            ...options.dependencies,
            scoringShadowRpc: async () => successfulRead(source),
          },
        }),
    },
  });
}

async function mobileCalcuttaFromSource(source) {
  return mobileCalcuttaResult(identity, {
    env: previewEnv,
    now,
    dependencies: {
      readPreviewCalcuttaV1: (requestedIdentity, options) =>
        readMobilePreviewCalcuttaV1(requestedIdentity, {
          ...options,
          dependencies: {
            ...options.dependencies,
            scoringShadowRpc: async () => successfulRead(source),
          },
        }),
    },
  });
}

async function assertTopLevelSchemaShape(product, body) {
  const schema = JSON.parse(await readFile(
    new URL(`../contracts/mobile/v1/${product}.schema.json`, import.meta.url),
    "utf8",
  ));
  assert.deepEqual(Object.keys(body).sort(), Object.keys(schema.properties).sort());
  assert.deepEqual(
    Object.keys(body.data).sort(),
    Object.keys(schema.properties.data.properties).sort(),
  );
  assert.equal(body.ok, true);
  assert.equal(body.apiVersion, "v1");
  assert.match(body.meta.generatedAt, /^2026-08-30T18:00:00\.000Z$/);
  assert.match(body.meta.revision, /^[0-9a-f]{64}$/);
}

test("isolated Preview readers use exact authority and send only canonical participant-scoped RPC input", async () => {
  const calls = [];
  const dependencies = {
    scoringShadowRpc: async (...args) => {
      calls.push(args);
      return successfulRead(args[0].includes("net_skins") ? netSkinsSource() : calcuttaSource());
    },
  };
  const netSkins = await readMobilePreviewNetSkinsV1(identity, { env: previewEnv, dependencies });
  const calcutta = await readMobilePreviewCalcuttaV1(identity, { env: previewEnv, dependencies });

  assert.equal(netSkins.payload.data.contract_version, "production-net-skins-v1");
  assert.equal(calcutta.payload.data.contract_version, "production-calcutta-v1");
  assert.deepEqual(calls.map(([name, payload]) => [name, payload]), [
    ["read_preview_mobile_net_skins_v1", {
      input: { environment: "PREVIEW", tournament_id: tournamentId, player_id: "P1" },
    }],
    ["read_preview_mobile_calcutta_v1", {
      input: { environment: "PREVIEW", tournament_id: tournamentId, player_id: "P1" },
    }],
  ]);
  for (const [, payload, options] of calls) {
    assert.deepEqual(Object.keys(payload.input).sort(), ["environment", "player_id", "tournament_id"]);
    assert.equal(options.env, previewEnv);
    assert.equal(options.timeoutMs, 8_000);
    assert.equal(JSON.stringify(payload).includes("auth"), false);
    assert.equal(JSON.stringify(payload).includes("email"), false);
  }

  let rpcCalled = false;
  await assert.rejects(
    () => readMobilePreviewNetSkinsV1(identity, {
      env: { ...previewEnv, PRODUCTION_SHADOW_CANDIDATE_ENABLED: "true" },
      dependencies: { scoringShadowRpc: async () => { rpcCalled = true; } },
    }),
    (error) => error.code === "MOBILE_API_UNAVAILABLE" && error.status === 503,
  );
  assert.equal(rpcCalled, false, "Production-shadow mode must not reach a Preview product RPC");
});

test("Preview Net Skins emits the existing mobile DTO and exposes only exact official results", async () => {
  const official = await mobileNetSkinsFromSource(netSkinsSource());
  await assertTopLevelSchemaShape("net-skins", official.body);
  assert.equal(official.body.data.contractVersion, "production-net-skins-v1");
  assert.equal(official.body.data.state, "OFFICIAL");
  assert.equal(official.body.data.publicationPolicy, "OFFICIAL_ONLY");
  assert.equal(official.body.data.published, true);
  assert.equal(official.body.data.rounds[0].officialResults.skins[0].winnerEntryId, "2026-R1-SI-P1");
  assert.equal(official.body.data.rounds[0].officialResults.skins[0].winningNetScore, -1);
  assert.deepEqual(official.body.data.player, {
    playerId: "P1",
    eligibleRoundIds: ["2026:R1"],
    entryIds: ["2026-R1-SI-P1"],
  });
  assert.equal(JSON.stringify(official.body).includes("internal_draft_detail"), false);
  assert.equal(JSON.stringify(official.body).includes("must-never-leave"), false);

  const provisionalSource = netSkinsSource();
  provisionalSource.result.snapshots[0].result_state = "PROVISIONAL";
  const provisional = await mobileNetSkinsFromSource(provisionalSource);
  assert.equal(provisional.body.data.state, "IN_PROGRESS");
  assert.equal(provisional.body.data.published, false);
  assert.equal(provisional.body.data.rounds[0].officialResults, null);
  assert.equal(JSON.stringify(provisional.body).includes("winningNetScore"), false);
  assert.equal(JSON.stringify(provisional.body).includes("must-never-leave"), false);
});

test("Preview Calcutta enforces publication and preserves precision-safe existing mobile DTO semantics", async () => {
  const published = await mobileCalcuttaFromSource(calcuttaSource());
  await assertTopLevelSchemaShape("calcutta", published.body);
  assert.equal(published.body.data.contractVersion, "production-calcutta-v1");
  assert.equal(published.body.data.state, "IN_PROGRESS");
  assert.equal(published.body.data.publicationState, "PUBLISHED");
  assert.equal(published.body.data.published, true);
  assert.equal(published.body.data.market.pot, "100.25");
  assert.equal(published.body.data.market.purchases[0].purchasePrice, "100.25");
  assert.equal(published.body.data.market.purchases[0].owners[0].ownershipFraction, "1");
  assert.equal(published.body.data.result.golfers[0].guaranteedWinnings, "50.125");
  assert.equal(published.body.data.result.golfers[0].netProfit, "-50.125");
  assert.equal(published.body.data.viewer.playerId, "P1");
  assert.equal(JSON.stringify(published.body).includes("private_director_note"), false);
  assert.equal(JSON.stringify(published.body).includes("protected_storylines"), false);

  const unpublished = await mobileCalcuttaFromSource(calcuttaSource({ publicationState: "UNPUBLISHED" }));
  assert.equal(unpublished.body.data.state, "IN_PROGRESS");
  assert.equal(unpublished.body.data.publicationState, "UNPUBLISHED");
  assert.equal(unpublished.body.data.published, false);
  assert.equal(unpublished.body.data.market, null);
  assert.equal(unpublished.body.data.result, null);
  assert.equal(unpublished.body.data.freshness.publishedAt, null);
  const unpublishedJson = JSON.stringify(unpublished.body);
  for (const protectedValue of ["100.250", "50.125", "Player One", "protected_storylines"]) {
    assert.equal(unpublishedJson.includes(protectedValue), false, `unpublished response leaked ${protectedValue}`);
  }

  const mismatchedPublication = await mobileCalcuttaFromSource(calcuttaSource({
    publicationState: "PUBLISHED",
    publicationFingerprint: "f".repeat(64),
  }));
  assert.equal(mismatchedPublication.body.data.publicationState, "UNPUBLISHED");
  assert.equal(mismatchedPublication.body.data.published, false);
  assert.equal(mismatchedPublication.body.data.market, null);
  assert.equal(mismatchedPublication.body.data.result, null);
});

test("Preview product adapters fail closed for wrong tournament and rejected participant identity", async () => {
  for (const read of [readMobilePreviewNetSkinsV1, readMobilePreviewCalcuttaV1]) {
    let receivedPlayerId;
    await assert.rejects(
      () => read({ tournamentId, playerId: "UNMAPPED" }, {
        env: previewEnv,
        dependencies: {
          scoringShadowRpc: async (_name, payload) => {
            receivedPlayerId = payload.input.player_id;
            const error = new Error("database membership detail must stay private");
            error.code = "PARTICIPANT_NOT_FOUND";
            throw error;
          },
        },
      }),
      (error) => error.code === "MOBILE_API_UNAVAILABLE" &&
        error.status === 503 && !error.message.includes("membership"),
    );
    assert.equal(receivedPlayerId, "UNMAPPED");
  }

  await assert.rejects(
    () => readMobilePreviewNetSkinsV1(identity, {
      env: previewEnv,
      dependencies: {
        scoringShadowRpc: async () => successfulRead({
          ...netSkinsSource(),
          input: { ...netSkinsSource().input, tournament: { tournament_id: "OTHER" } },
        }),
      },
    }),
    (error) => error.code === "MOBILE_API_UNAVAILABLE",
  );
  await assert.rejects(
    () => readMobilePreviewCalcuttaV1(identity, {
      env: previewEnv,
      dependencies: {
        scoringShadowRpc: async () => successfulRead({ ...calcuttaSource(), tournament_id: "OTHER" }),
      },
    }),
    (error) => error.code === "MOBILE_API_UNAVAILABLE",
  );
});

test("Preview representation revisions change when participant-visible Net Skins or Calcutta output changes", async () => {
  const netSkins = netSkinsSource();
  const originalNetSkins = await mobileNetSkinsFromSource(netSkins);
  const changedNetSkins = clone(netSkins);
  changedNetSkins.result.snapshots[0].result_payload.skins[0].winningNetScore = -2;
  const changedNetSkinsResult = await mobileNetSkinsFromSource(changedNetSkins);
  assert.notEqual(changedNetSkinsResult.revision, originalNetSkins.revision);
  assert.equal(changedNetSkinsResult.body.meta.revision, changedNetSkinsResult.revision);

  const published = await mobileCalcuttaFromSource(calcuttaSource());
  const unpublished = await mobileCalcuttaFromSource(calcuttaSource({ publicationState: "UNPUBLISHED" }));
  assert.notEqual(published.revision, unpublished.revision);
  assert.equal(published.body.meta.revision, published.revision);
  assert.equal(unpublished.body.meta.revision, unpublished.revision);
});

test("top-level Preview products fail closed when runtime Preview is not the exact isolated authority", async () => {
  const invalidPreviewEnv = {
    ...previewEnv,
    NEXT_PUBLIC_SUPABASE_AUTH_URL: "https://wrong-preview-project.supabase.co",
  };
  let productionNetSkinsReads = 0;
  let productionCalcuttaReads = 0;

  await assert.rejects(
    () => mobileNetSkinsResult(identity, {
      env: invalidPreviewEnv,
      now,
      dependencies: {
        readProductionNetSkinsV1: async () => {
          productionNetSkinsReads += 1;
          throw new Error("Preview must never fall through to the Production reader");
        },
      },
    }),
    (error) => error.code === "MOBILE_API_UNAVAILABLE" && error.status === 503,
  );
  await assert.rejects(
    () => mobileCalcuttaResult(identity, {
      env: invalidPreviewEnv,
      now,
      dependencies: {
        readProductionCalcuttaV1: async () => {
          productionCalcuttaReads += 1;
          throw new Error("Preview must never fall through to the Production reader");
        },
      },
    }),
    (error) => error.code === "MOBILE_API_UNAVAILABLE" && error.status === 503,
  );

  assert.equal(productionNetSkinsReads, 0);
  assert.equal(productionCalcuttaReads, 0);
});

test("Calcutta representation revision covers participant-visible names and calculated freshness", async () => {
  const original = await mobileCalcuttaFromSource(calcuttaSource());

  const renamedSource = calcuttaSource();
  renamedSource.players[0].display_name = "Player One Updated";
  const renamed = await mobileCalcuttaFromSource(renamedSource);
  assert.equal(renamed.body.data.market.purchases[0].player.displayName, "Player One Updated");
  assert.notEqual(renamed.revision, original.revision);

  const recalculatedSource = calcuttaSource();
  recalculatedSource.snapshot.calculated_at = "2026-08-30T17:30:00.000Z";
  const recalculated = await mobileCalcuttaFromSource(recalculatedSource);
  assert.equal(recalculated.body.data.freshness.calculatedAt, "2026-08-30T17:30:00.000Z");
  assert.notEqual(recalculated.revision, original.revision);

  for (const result of [original, renamed, recalculated]) {
    assert.equal(result.body.meta.revision, result.revision);
    assert.match(result.revision, /^[0-9a-f]{64}$/);
  }
});
