import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { leaderboardModulesForNetSkinsState } from "../lib/leaderboards-navigation.js";
import {
  currentProductionNetSkinsV1,
  productionNetSkinsV1Data,
} from "../lib/production-net-skins-v1.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "../lib/production-foundation-resource-contract.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const secret = `sb_secret_${"x".repeat(32)}`;
const commitSha = "a".repeat(40);
const activeProduction = Object.freeze({
  VERCEL_ENV: "production",
  VERCEL_PROJECT_ID: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
  VERCEL_PROJECT_NAME: "bagger-inv",
  VERCEL_GIT_COMMIT_SHA: commitSha,
  PRODUCTION_FOUNDATION_ENABLED: "true",
  PRODUCTION_CUTOVER_ACTIVATION_ENABLED: "true",
  PRODUCTION_CUTOVER_EXPECTED_COMMIT_SHA: commitSha,
  PRODUCTION_CUTOVER_EXPECTED_VERCEL_PROJECT_ID: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
  PRODUCTION_CANONICAL_DOMAIN: "https://baggerinv.com",
  PRODUCTION_CUTOVER_TOURNAMENT_ID: "2026",
  PRODUCTION_CUTOVER_TOURNAMENT_YEAR: "2026",
  PRODUCTION_CUTOVER_PHASE: "CURRENT_READS",
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
  configured_at: "2026-08-29T12:00:00.000Z",
  calculated_at: null,
  published_at: null,
  source_fingerprint: "b".repeat(64),
});

const frozen2026Dispatch = async (_functionName, body) => ({
  pointerAware: true,
  frozen2026: true,
  body,
  annualRuntimeInput: null,
});

function view(state, rounds = []) {
  return {
    contract_version: "production-net-skins-v1",
    tournament_id: "2026",
    state,
    publication_policy: "OFFICIAL_ONLY",
    configuration_revision: state === "NOT_CONFIGURED" ? 0 : 3,
    result_revision: state === "OFFICIAL" ? 7 : null,
    configuration_fingerprint: state === "NOT_CONFIGURED" ? null : "c".repeat(64),
    revision: `net-skins-v1:${state === "NOT_CONFIGURED" ? 0 : 3}:${state === "OFFICIAL" ? 7 : 0}:${state}`,
    freshness,
    rounds,
  };
}

function round(state, overrides = {}) {
  return {
    round_id: "2026:R1",
    round_number: 1,
    format: "BB",
    entry_type: "INDIVIDUAL",
    buy_in_per_entry: 25,
    eligible_entry_count: 2,
    eligible_player_ids: ["CB01", "CL01"],
    match_ids: ["2026-R1-1"],
    entries: [
      { entry_id: "entry-cb01", entry_type: "INDIVIDUAL", match_id: "2026-R1-1", player_ids: ["CB01"] },
      { entry_id: "entry-cl01", entry_type: "INDIVIDUAL", match_id: "2026-R1-1", player_ids: ["CL01"] },
    ],
    state,
    configuration_revision: 3,
    result_revision: state === "OFFICIAL" ? 7 : null,
    configuration_fingerprint: "c".repeat(64),
    freshness,
    result_payload: null,
    official_results: null,
    ...overrides,
  };
}

test("Production V1 maps every lifecycle state without exposing non-official results", () => {
  const notConfigured = productionNetSkinsV1Data(view("NOT_CONFIGURED"));
  assert.equal(notConfigured.netSkinsState.visible, false);
  assert.equal(notConfigured.netSkinsState.configured, false);
  assert.deepEqual(notConfigured.netSkins.rounds, []);

  for (const state of ["CONFIGURED", "IN_PROGRESS"]) {
    const bounded = productionNetSkinsV1Data(view(state, [round(state, {
      // Even a malformed server response cannot leak a provisional result.
      result_payload: { round: 1, skins: [{ hole: 4, winnerPlayerId: "CB01" }] },
      official_results: { skins: [{ hole_number: 4, winner_player_ids: ["CB01"] }] },
    })]));
    assert.equal(bounded.netSkinsState.state, state);
    assert.equal(bounded.netSkinsState.published, false);
    assert.equal(bounded.netSkins.rounds[0].resultState, state);
    assert.deepEqual(bounded.netSkins.rounds[0].skins, []);
    assert.deepEqual(bounded.netSkins.rounds[0].leaderboard, []);
    assert.deepEqual(bounded.netSkins.rounds[0].eligiblePlayerIds, ["CB01", "CL01"]);
  }

  const unavailable = productionNetSkinsV1Data(view("UNAVAILABLE"));
  assert.equal(unavailable.netSkinsState.state, "UNAVAILABLE");
  assert.equal(unavailable.netSkinsState.available, false);
  assert.equal(unavailable.netSkinsState.visible, true);
});

test("Production V1 exposes the existing presentation payload only for OFFICIAL rounds", () => {
  const resultPayload = {
    round: 1,
    format: "BB",
    matches: ["1"],
    pot: 50,
    eligibleCount: 2,
    completedHoles: 18,
    complete: true,
    finalized: true,
    skinsAwarded: 1,
    skinValue: 50,
    skins: [{ hole: 9, winnerPlayerId: "CB01", winnerPlayerId2: "", skinValue: 50 }],
    leaderboard: [{ id: "entry-cb01", playerIds: ["CB01"], rank: 1, displayRank: "1", skinsWon: 1, totalWinnings: 50, winningHoles: [], holeResults: [] }],
  };
  const officialResults = {
    pot: 50,
    eligible_count: 2,
    completed_holes: 18,
    skins_awarded: 1,
    skin_value: 50,
    complete: true,
    finalized: true,
    skins: [{ skin_id: "skin-9", hole_number: 9, match_id: "2026-R1-1", winner_entry_id: "entry-cb01", winner_player_ids: ["CB01"], winning_net_score: 3, skin_value: 50 }],
    leaderboard: [{ rank: 1, display_rank: "1", entry_id: "entry-cb01", player_ids: ["CB01"], skins_won: 1, total_winnings: 50, winning_hole_numbers: [9] }],
  };
  const official = productionNetSkinsV1Data(view("OFFICIAL", [round("OFFICIAL", {
    result_payload: resultPayload,
    official_results: officialResults,
  })]));
  assert.equal(official.netSkinsState.published, true);
  assert.equal(official.netSkins.rounds[0].resultState, "OFFICIAL");
  assert.deepEqual(official.netSkins.rounds[0].skins, resultPayload.skins);
  assert.deepEqual(official.netSkins.rounds[0].leaderboard, resultPayload.leaderboard);
  assert.equal(official.netSkins.results[0].winnerPlayerId, "CB01");
});

test("Production V1 requires the official-only publication policy", () => {
  assert.throws(
    () => productionNetSkinsV1Data({ ...view("CONFIGURED"), publication_policy: "PROVISIONAL" }),
    (error) => error.code === "NET_SKINS_V1_PUBLICATION_POLICY_REQUIRED",
  );
  assert.throws(
    () => productionNetSkinsV1Data({ ...view("CONFIGURED"), tournament_id: "preview-2026" }),
    (error) => error.code === "NET_SKINS_V1_RESOURCE_BINDING_REQUIRED",
  );
  assert.throws(
    () => productionNetSkinsV1Data({ ...view("CONFIGURED"), revision: "caller-selected" }),
    (error) => error.code === "NET_SKINS_V1_RESOURCE_BINDING_REQUIRED",
  );
});

test("Production V1 uses the exact active cutover RPC and cannot accept caller resource overrides", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init.method, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, data: view("NOT_CONFIGURED") }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const result = await currentProductionNetSkinsV1({
      playerId: "CB01",
      env: activeProduction,
      resolveProductionCurrentReadDispatch: frozen2026Dispatch,
    });
    assert.equal(result.netSkinsState.state, "NOT_CONFIGURED");
    assert.equal(result.recalculation, null);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, "POST");
    assert.match(calls[0].url, /\/rest\/v1\/rpc\/read_production_net_skins_v1$/);
    assert.deepEqual(calls[0].body.input.player_id, "CB01");
    assert.equal(calls[0].body.input.environment, "PRODUCTION");
    assert.equal(calls[0].body.input.project_ref, PRODUCTION_SUPABASE_PROJECT_REF);
    assert.equal(calls[0].body.input.project_url, PRODUCTION_SUPABASE_URL);
    assert.equal(calls[0].body.input.source_workbook_id, PRODUCTION_GOOGLE_WORKBOOK_ID);
    assert.equal(calls[0].body.input.tournament_id, "2026");
    assert.equal(calls[0].body.input.deployment_commit, commitSha);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Production UI hides NOT_CONFIGURED while Preview navigation remains unchanged", () => {
  const state = { state: "NOT_CONFIGURED", visible: false };
  assert.deepEqual(
    leaderboardModulesForNetSkinsState(state, { supabase: true }).map(({ value }) => value),
    ["players", "teams", "insights"],
  );
  assert.deepEqual(
    leaderboardModulesForNetSkinsState(state, { supabase: false }).map(({ value }) => value),
    ["players", "teams", "skins", "insights"],
  );
  assert.ok(leaderboardModulesForNetSkinsState({ state: "CONFIGURED", visible: true }, { supabase: true })
    .some(({ value }) => value === "skins"));
  assert.ok(leaderboardModulesForNetSkinsState({ state: "IN_PROGRESS", visible: true }, { supabase: true })
    .some(({ value }) => value === "skins"));
  assert.ok(leaderboardModulesForNetSkinsState({ state: "UNAVAILABLE", visible: true }, { supabase: true })
    .some(({ value }) => value === "skins"));
});

test("Production consumers are read-only, optional, and never introduce a Google fallback", async () => {
  const [route, homepage, home, leaderboards, playerHome] = await Promise.all([
    source("app/api/leaderboards/net-skins/route.js"),
    source("lib/homepage-current-tournament.js"),
    source("app/ParticipantSupabaseHome.js"),
    source("app/live/LeaderboardsDashboard.js"),
    source("app/PersonalizedPlayerHome.js"),
  ]);
  assert.match(route, /productionCutover\?\.handled === true/);
  assert.match(route, /currentProductionNetSkinsV1/);
  assert.match(route, /if \(operational\.recalculation\) after/);
  assert.doesNotMatch(route, /google-sheets|sheetData|getTournamentData/);
  assert.match(homepage, /productionNetSkinsReader\(\{ env \}\)/);
  assert.match(homepage, /\.catch\(\(error\) => \(\{/);
  assert.match(home, /netSkinsState: result\.data\.netSkinsState/);
  assert.match(home, /canonicalNetSkinsPresentation/);
  assert.match(home, /productionNetSkinsV1[\s\S]*netSkins: null/);
  assert.match(leaderboards, /Net Skins are configured/);
  assert.match(leaderboards, /Net Skins are in progress/);
  assert.match(leaderboards, /Net Skins are temporarily unavailable/);
  assert.match(playerHome, /canonicalState === "NOT_CONFIGURED"\) return null/);
});

test("Production Home suppresses cached legacy Net Skins until canonical V1 state is known", async () => {
  const [page, home] = await Promise.all([
    source("app/home/page.js"),
    source("app/ParticipantSupabaseHome.js"),
  ]);
  assert.match(page, /productionNetSkinsV1=\{netSkinsSource\.productionCutover\?\.handled === true\}/);
  assert.match(home, /!productionNetSkinsV1 \|\| !payload\?\.liveData \|\| payload\.liveData\.netSkinsState/);
  assert.match(home, /liveData: \{ \.\.\.payload\.liveData, netSkins: null \}/);
});
