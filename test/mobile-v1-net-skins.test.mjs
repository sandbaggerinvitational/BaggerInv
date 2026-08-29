import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  MOBILE_NET_SKINS_STATES,
  mobileNetSkinsDataFromProductionView,
  mobileNetSkinsResult,
  readMobileProductionNetSkinsV1,
} from "../lib/mobile-v1-net-skins.js";

const fingerprint = "a".repeat(64);
const sourceFingerprint = "b".repeat(64);
const now = new Date("2026-09-25T18:00:00.000Z");
const identity = {
  playerId: "CB01",
  tournamentId: "2026",
  displayName: "Director",
  context: { privateEmail: "must-not-appear@example.test" },
};

function freshness(overrides = {}) {
  return {
    stale: false,
    configured_at: "2026-09-20T12:00:00.000Z",
    calculated_at: null,
    published_at: null,
    source_fingerprint: sourceFingerprint,
    ...overrides,
  };
}

function entry(overrides = {}) {
  return {
    entry_id: "2026-R1-SI-CB01",
    entry_type: "INDIVIDUAL",
    match_id: "2026-R1-1",
    player_ids: ["CB01"],
    ...overrides,
  };
}

function round(overrides = {}) {
  return {
    round_id: "2026:R1",
    round_number: 1,
    format: "SI",
    entry_type: "INDIVIDUAL",
    match_ids: ["2026-R1-1"],
    buy_in_per_entry: 25,
    eligible_entry_count: 2,
    eligible_player_ids: ["CB01", "P02"],
    state: "CONFIGURED",
    configuration_revision: 4,
    result_revision: null,
    configuration_fingerprint: fingerprint,
    freshness: freshness(),
    entries: [entry(), entry({ entry_id: "2026-R1-SI-P02", player_ids: ["P02"] })],
    official_results: null,
    ...overrides,
  };
}

function view(state = "CONFIGURED", overrides = {}) {
  const resultRevision = state === "OFFICIAL" ? 9 : null;
  return {
    contract_version: "production-net-skins-v1",
    tournament_id: "2026",
    state,
    publication_policy: "OFFICIAL_ONLY",
    configuration_revision: state === "NOT_CONFIGURED" || state === "UNAVAILABLE" ? 0 : 4,
    result_revision: resultRevision,
    configuration_fingerprint: state === "NOT_CONFIGURED" || state === "UNAVAILABLE" ? null : fingerprint,
    revision: `net-skins-v1:${state === "NOT_CONFIGURED" || state === "UNAVAILABLE" ? 0 : 4}:${resultRevision || 0}:${state}`,
    freshness: freshness({ configured_at: state === "NOT_CONFIGURED" ? null : "2026-09-20T12:00:00.000Z" }),
    rounds: state === "NOT_CONFIGURED" || state === "UNAVAILABLE" ? [] : [round()],
    internal_secret: "must-not-appear",
    ...overrides,
  };
}

function successfulRead(value) {
  return { payload: { ok: true, data: value }, durationMs: 4 };
}

test("NOT_CONFIGURED and UNAVAILABLE are stable successful domain states", async () => {
  for (const state of ["NOT_CONFIGURED", "UNAVAILABLE"]) {
    const result = await mobileNetSkinsResult(identity, {
      now,
      dependencies: { readProductionNetSkinsV1: async () => successfulRead(view(state)) },
    });
    assert.equal(result.status, 200);
    assert.equal(result.revision, `net-skins-v1:0:0:${state}`);
    assert.equal(result.body.data.state, state);
    assert.equal(result.body.data.published, false);
    assert.deepEqual(result.body.data.rounds, []);
    assert.equal(result.body.data.player.playerId, "CB01");
    assert.equal(JSON.stringify(result.body).includes("must-not-appear"), false);
  }

  const configuredUnavailable = await mobileNetSkinsResult(identity, {
    now,
    dependencies: {
      readProductionNetSkinsV1: async () => successfulRead(view("UNAVAILABLE", {
        configuration_revision: 4,
        configuration_fingerprint: fingerprint,
        revision: "net-skins-v1:4:0:UNAVAILABLE",
        rounds: [round({
          state: "UNAVAILABLE",
          freshness: freshness({ stale: true }),
        })],
      })),
    },
  });
  assert.equal(configuredUnavailable.body.data.state, "UNAVAILABLE");
  assert.equal(configuredUnavailable.body.data.published, false);
  assert.equal(configuredUnavailable.body.data.rounds.length, 1);
  assert.equal(configuredUnavailable.body.data.rounds[0].state, "UNAVAILABLE");
  assert.equal(configuredUnavailable.body.data.rounds[0].officialResults, null);
});

test("CONFIGURED and IN_PROGRESS expose stable configuration identity but no provisional payouts", () => {
  for (const state of ["CONFIGURED", "IN_PROGRESS"]) {
    const source = view(state, {
      revision: `net-skins-v1:4:0:${state}`,
      rounds: [round({ state })],
    });
    const data = mobileNetSkinsDataFromProductionView(source, identity);
    assert.equal(data.state, state);
    assert.equal(data.rounds[0].roundId, "2026:R1");
    assert.deepEqual(data.rounds[0].matchIds, ["2026-R1-1"]);
    assert.deepEqual(data.rounds[0].entries[0], {
      entryId: "2026-R1-SI-CB01",
      entryType: "INDIVIDUAL",
      matchId: "2026-R1-1",
      playerIds: ["CB01"],
    });
    assert.equal(data.rounds[0].officialResults, null);
    assert.deepEqual(data.player, {
      playerId: "CB01",
      eligibleRoundIds: ["2026:R1"],
      entryIds: ["2026-R1-SI-CB01"],
    });
  }
});

test("OFFICIAL exposes only normalized official results with stable entry, Match, pairing, and Player IDs", () => {
  const pairEntries = [entry({
    entry_id: "2026-R2-SC-PAIR-1",
    entry_type: "PAIRING",
    match_id: "2026-R2-1",
    player_ids: ["CB01", "P02"],
  })];
  const official = {
    pot: 50,
    eligible_count: 1,
    completed_holes: 18,
    skins_awarded: 1,
    skin_value: 50,
    complete: true,
    finalized: true,
    skins: [{
      skin_id: "2026:R2:H7",
      hole_number: 7,
      match_id: "2026-R2-1",
      winner_entry_id: "2026-R2-SC-PAIR-1",
      winner_player_ids: ["CB01", "P02"],
      winning_net_score: -1,
      skin_value: 50,
      winner_name: "must-not-appear",
    }],
    leaderboard: [{
      rank: 1,
      display_rank: "1",
      entry_id: "2026-R2-SC-PAIR-1",
      player_ids: ["CB01", "P02"],
      skins_won: 1,
      total_winnings: 50,
      winning_hole_numbers: [7],
    }],
    raw_result_payload: { private: "must-not-appear" },
  };
  const data = mobileNetSkinsDataFromProductionView(view("OFFICIAL", {
    rounds: [round({
      round_id: "2026:R2",
      round_number: 2,
      format: "SC",
      entry_type: "PAIRING",
      match_ids: ["2026-R2-1"],
      buy_in_per_entry: 50,
      eligible_entry_count: 1,
      eligible_player_ids: ["CB01", "P02"],
      state: "OFFICIAL",
      result_revision: 9,
      freshness: freshness({
        calculated_at: "2026-09-25T17:00:00.000Z",
        published_at: "2026-09-25T17:05:00.000Z",
      }),
      entries: pairEntries,
      official_results: official,
    })],
  }), identity);
  assert.equal(data.published, true);
  assert.equal(data.rounds[0].officialResults.skins[0].skinId, "2026:R2:H7");
  assert.equal(data.rounds[0].officialResults.skins[0].winnerEntryId, "2026-R2-SC-PAIR-1");
  assert.equal(data.rounds[0].officialResults.skins[0].winningNetScore, -1);
  assert.deepEqual(data.rounds[0].officialResults.leaderboard[0].playerIds, ["CB01", "P02"]);
  assert.equal(JSON.stringify(data).includes("must-not-appear"), false);
});

test("invalid contract, tournament, revision, or identifier relationships fail enumeration-safely", async () => {
  const invalid = [
    view("CONFIGURED", { contract_version: "preview-net-skins-v1" }),
    view("CONFIGURED", { tournament_id: "preview-2026" }),
    view("CONFIGURED", { revision: "caller-selected" }),
    view("CONFIGURED", { rounds: [round({ entries: [entry()], eligible_entry_count: 2 })] }),
    view("CONFIGURED", { rounds: [round({ entries: [entry({ match_id: null }), entry({ entry_id: "2026-R1-SI-P02", player_ids: ["P02"] })] })] }),
  ];
  for (const payload of invalid) {
    await assert.rejects(
      () => mobileNetSkinsResult(identity, {
        dependencies: { readProductionNetSkinsV1: async () => successfulRead(payload) },
      }),
      (error) => error.code === "MOBILE_API_UNAVAILABLE" &&
        !error.message.includes("preview-2026") && !error.message.includes("caller-selected"),
    );
  }
});

test("the mobile dependency adapter is tournament-scoped and delegates to the service-only Production reader", async () => {
  let received;
  const response = successfulRead(view("NOT_CONFIGURED"));
  assert.equal(await readMobileProductionNetSkinsV1({ tournamentId: "2026", playerId: "CB01" }, {
    env: { marker: "production-env" },
    dependencies: {
      productionReadTransportEnvironment: () => ({ allowed: true }),
      readCanonicalProductionNetSkinsV1: async (input) => { received = input; return response; },
    },
  }), response);
  assert.deepEqual(received, { playerId: "CB01", env: { marker: "production-env" } });
  await assert.rejects(
    () => readMobileProductionNetSkinsV1({ tournamentId: "preview-2026", playerId: "CB01" }),
    (error) => error.code === "MOBILE_API_UNAVAILABLE",
  );
  let previewRpcCalled = false;
  await assert.rejects(
    () => readMobileProductionNetSkinsV1({ tournamentId: "2026", playerId: "CB01" }, {
      env: { VERCEL_ENV: "preview" },
      dependencies: {
        productionReadTransportEnvironment: () => ({ allowed: false }),
        readCanonicalProductionNetSkinsV1: async () => { previewRpcCalled = true; return response; },
      },
    }),
    (error) => error.code === "MOBILE_API_UNAVAILABLE",
  );
  assert.equal(previewRpcCalled, false);
});

test("route, schema, and documentation preserve the mobile v1 boundary without calculation duplication", async () => {
  const [route, implementation, schemaText, docs] = await Promise.all([
    readFile(new URL("../app/api/mobile/v1/net-skins/route.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/mobile-v1-net-skins.js", import.meta.url), "utf8"),
    readFile(new URL("../contracts/mobile/v1/net-skins.schema.json", import.meta.url), "utf8"),
    readFile(new URL("../contracts/mobile/v1/README.md", import.meta.url), "utf8"),
  ]);
  const schema = JSON.parse(schemaText);
  assert.match(route, /mobileV1ReadResponse/);
  assert.doesNotMatch(route, /cookies|Passport|request\.json|searchParams|Director/i);
  assert.doesNotMatch(implementation, /calculateNetSkins|google-sheets|cookies|Passport/i);
  assert.deepEqual(schema.$defs.state.enum, MOBILE_NET_SKINS_STATES);
  assert.equal(schema.properties.data.properties.contractVersion.const, "production-net-skins-v1");
  for (const term of [
    "GET /net-skins", "read_production_net_skins_v1", "NOT_CONFIGURED", "OFFICIAL_ONLY",
    "Production activation", "X-Bagger-Certification", "ETag", "Player ID",
  ]) assert.match(docs, new RegExp(term));
});
