import { rawFixture } from "./fixtures/pn1-mobile.mjs";
import assert from "node:assert/strict";
import test from "node:test";

import { GET as matchDetailGET } from "../app/api/mobile/v1/matches/[matchId]/route.js";
import { issueMobileNativeCertification } from "../lib/mobile-native-certification.js";
import { mobileMatchesResult } from "../lib/mobile-v1-tournament-reads.js";
import {
  MOBILE_MATCH_DETAIL_LIMITS,
  mobileMatchDetailDataFromPreviewView,
  mobileMatchDetailResult,
  readMobilePreviewMatchDetailV1,
} from "../lib/mobile-v1-match-detail.js";
import { assertMobileV1Schema } from "./support/mobile-v1-schema-validator.mjs";
import { validOpaqueMatchIDs, invalidOpaqueMatchIDs } from "./support/mobile-opaque-match-id-cases.mjs";

const preview = Object.freeze({
  VERCEL_ENV: "preview",
  GOOGLE_SHEETS_ID: "1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts",
  PREVIEW_SCORING_SHEET_ID: "1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts",
  PARTICIPANT_IDENTITY_AUTHORITY: "supabase",
  SUPABASE_SCORING_MIRROR_URL: "https://idgigvjjqkfbqjeredpb.supabase.co",
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "synthetic-server-secret",
  SUPABASE_SCORING_MIRROR_ENABLED: "true",
  NEXT_PUBLIC_SUPABASE_AUTH_URL: "https://idgigvjjqkfbqjeredpb.supabase.co",
  NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY: "synthetic-publishable-key",
  HOME_READ_SOURCE: "supabase",
  TOURNAMENT_READ_SOURCE: "supabase",
  LEADERBOARDS_CORE_READ_SOURCE: "supabase",
  GUIDE_READ_SOURCE: "supabase",
  COURSE_PRESENTATION_READ_SOURCE: "supabase",
  SECONDARY_HISTORY_READ_SOURCE: "supabase",
  DRAFT_READ_SOURCE: "supabase",
  HISTORY_2026_READ_SOURCE: "supabase",
  COMPLETED_HISTORY_READ_SOURCE: "supabase",
  SCORING_READ_SOURCE: "supabase",
  MATCH_AUTHORIZATION_SOURCE: "supabase",
  SCORING_AUTHORITY: "supabase",
  MOBILE_NATIVE_AUTH_ANTI_ABUSE_MODE: "supabase-turnstile",
  PARTICIPANT_AUTH_CAPTCHA_REQUIRED: "true",
  PARTICIPANT_AUTH_CAPTCHA_CONFIGURED: "true",
  NEXT_PUBLIC_PARTICIPANT_AUTH_TURNSTILE_SITE_KEY: "synthetic-preview-site-key",
  PARTICIPANT_AUTH_RATE_LIMIT_SECRET: "synthetic-preview-rate-limit-secret-at-least-32-chars",
  MOBILE_NATIVE_CERTIFICATION_SIGNING_SECRET: "synthetic-preview-certification-secret-at-least-32-chars",
  MOBILE_NATIVE_SUPABASE_SIGNUPS_DISABLED: "true",
  MOBILE_NATIVE_EDGE_RATE_LIMIT_CONFIGURED: "true",
});

const identity = Object.freeze({ tournamentId: "2026", playerId: "P1" });
const authUserId = "11111111-1111-4111-8111-111111111111";
const environmentKeys = Object.keys(preview);

async function withEnvironment(values, run) {
  const previous = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
  Object.entries(values).forEach(([key, value]) => { process.env[key] = value; });
  try {
    return await run();
  } finally {
    environmentKeys.forEach((key) => {
      if (previous[key] == null) delete process.env[key];
      else process.env[key] = previous[key];
    });
  }
}

function certifiedHeaders(extra = {}, overrides = {}) {
  const { token } = issueMobileNativeCertification({
    authUserId,
    playerId: "P1",
    tournamentId: "2026",
    env: preview,
    ...overrides,
  });
  return { Authorization: "Bearer valid", "X-Bagger-Certification": token, ...extra };
}

function participantContext() {
  return { ok: true, data: {
    authUserId,
    playerId: "P1",
    displayName: "Preview Golfer",
    tournament: { id: "2026", year: 2026, name: "Sandbagger Invitational" },
    membership: { active: true },
  } };
}

// Shared canonical fixture also exercises the Production DTO adapter.

function map(raw) {
  return mobileMatchDetailDataFromPreviewView(raw, { ...identity, matchId: raw.match.match_id });
}

test("Best Ball Match Detail maps canonical participant facts and server-derived golf intelligence", () => {
  const data = map(rawFixture());
  const match = data.match;
  assert.equal(data.tournament.tournamentId, "2026");
  assert.equal(data.tournament.location, "Kiawah Island");
  assert.equal(match.round.format, "BB");
  assert.equal(match.round.formatName, "Best Ball");
  assert.equal(match.authenticatedPlayer.involved, true);
  assert.deepEqual(match.authenticatedPlayer.partnerPlayerIds, ["P12"]);
  assert.deepEqual(match.authenticatedPlayer.opponentPlayerIds, ["P21", "P22"]);
  assert.equal(match.teams[0].teamId, "PICKLES");
  assert.equal(match.teams[0].participants[0].playingHandicap, 17.25);
  assert.equal(match.teams[0].participants[0].strokesReceived, 4);
  assert.equal(match.teams[0].playingHandicap, null);
  assert.equal(match.progress.holesPlayed, 4);
  assert.equal(match.result.summary, "The Pickles 1 UP");
  assert.equal(match.result.winnerSide, 1);
  assert.equal(match.result.winnerTeamId, "PICKLES");
  assert.equal(match.scorecard.state, "inProgress");
  assert.equal(match.scorecard.complete, false);
  assert.equal(match.scorecard.holes.length, 18);
  assert.equal(match.scorecard.holes[0].official, true);
  assert.equal(match.scorecard.holes[0].sideOne.scope, "players");
  assert.deepEqual(match.scorecard.holes[0].sideOne.playerScores, [
    { playerId: "P1", gross: 4, strokes: 0 },
    { playerId: "P12", gross: 5, strokes: 1 },
  ]);
  assert.equal(match.scorecard.holes[4].state, "unplayed");
  assert.equal(match.scorecard.holes[4].official, false);
  assert.equal(match.flow.front.status, "leading");
  assert.equal(match.flow.back.status, "notStarted");
  assert.equal(match.stats.holesPlayed, 4);
  assert.equal(match.stats.halved, 1);
  assert.equal(match.freshness.updatedAt, "2026-09-03T13:00:00.000Z");
});

test("freshness is the latest canonical Match, presentation, finalization, or score instant", () => {
  const raw = rawFixture();
  raw.presentation.updated_at = "2026-09-03T13:05:00.000Z";
  raw.scores[0].updated_at = "2026-09-03T13:09:00.000Z";
  assert.equal(map(raw).match.freshness.updatedAt, "2026-09-03T13:09:00.000Z");
});

test("Scramble exposes only canonical team Playing Handicap and team score units", () => {
  const match = map(rawFixture({ format: "SC" })).match;
  assert.equal(match.round.formatName, "Scramble");
  assert.equal(match.teams[0].playingHandicap, 3.25);
  assert.equal(match.teams[0].strokesReceived, 2);
  assert.equal(match.teams[1].playingHandicap, 1);
  assert.equal(match.teams[1].strokesReceived, 0);
  assert.ok(match.teams.flatMap((team) => team.participants).every((player) => player.strokesReceived === null));
  const side = match.scorecard.holes[0].sideOne;
  assert.deepEqual(side, {
    side: 1,
    scope: "team",
    playerScores: [],
    teamScore: { gross: 4, strokes: 0 },
    netScore: 4,
  });
});

test("final Singles supports a non-owned Match, official confirmation, full flow, and canonical clinch", () => {
  const winners = [
    ...Array(6).fill("Team 1"),
    ...Array(6).fill("Halved"),
    "Team 1",
    ...Array(5).fill("Halved"),
  ];
  const raw = rawFixture({ format: "SI", status: "FINAL", owned: false, winners, clinched: true });
  raw.match.running_result = "Team 1 wins 7 & 5";
  const match = map(raw).match;
  assert.equal(match.authenticatedPlayer.involved, false);
  assert.equal(match.navigation.isMyMatch, false);
  assert.equal(match.navigation.myMatchId, "2026-R1-4");
  assert.equal(match.result.summary, "The Pickles 7 & 5");
  assert.equal(match.result.notation, "7 & 5");
  assert.deepEqual(match.clinch, {
    holeNumber: 13,
    winnerSide: 1,
    winnerTeamId: "PICKLES",
    summary: "The Pickles clinched on Hole 13.",
  });
  assert.equal(match.scorecard.state, "confirmed");
  assert.equal(match.scorecard.complete, true);
  assert.equal(match.scorecard.confirmedAt, "2026-09-03T13:01:00.000Z");
  assert.equal(match.scorecard.holes[13].story, "The match was already decided on Hole 13.");
  assert.equal(match.flow.front.status, "final");
  assert.equal(match.flow.back.status, "final");
  assert.equal(match.flow.overall.status, "final");
  assert.equal(match.stats.sideOneHolesWon, 7);
});

test("live Singles preserves an early clinch while a complete scorecard awaits final confirmation", () => {
  const winners = [
    ...Array(7).fill("Team 1"),
    ...Array(5).fill("Halved"),
    ...Array(6).fill("Team 1"),
  ];
  const raw = rawFixture({ format: "SI", status: "LIVE", winners, clinched: true });
  raw.match.result_winner = "Team 1";
  raw.match.scorecard_complete = true;
  raw.match.running_result = "Team 1 wins 7 & 6";

  const match = map(raw).match;

  assert.equal(match.status, "inProgress");
  assert.equal(match.scorecard.state, "inProgress");
  assert.equal(match.scorecard.complete, true);
  assert.deepEqual(match.clinch, {
    holeNumber: 12,
    winnerSide: 1,
    winnerTeamId: "PICKLES",
    summary: "The Pickles clinched on Hole 12.",
  });
});

test("final Singles decided on Hole 18 does not invent an early-clinch hole", () => {
  const raw = rawFixture({
    format: "SI",
    status: "FINAL",
    winners: ["Team 1", ...Array(17).fill("Halved")],
    clinched: true,
  });
  raw.match.running_result = "Team 1 wins 1 UP";

  const match = map(raw).match;

  assert.equal(match.status, "completed");
  assert.equal(match.result.notation, "1 UP");
  assert.equal(match.clinch, null);
  assert.equal(match.scorecard.state, "confirmed");
});

test("Singles still fails closed when canonical clinched state has no decided result", () => {
  const raw = rawFixture({
    format: "SI",
    status: "LIVE",
    winners: ["Halved"],
    clinched: true,
  });

  assert.throws(() => map(raw), /mobile API is unavailable/i);
});

test("scheduled Match Detail keeps a bounded unplayed official record without inventing a result", () => {
  const raw = rawFixture({ status: "UPCOMING", winners: [] });
  raw.match.running_result = "Scheduled";
  const match = map(raw).match;
  assert.equal(match.status, "scheduled");
  assert.equal(match.result, null);
  assert.equal(match.scorecard.state, "unavailable");
  assert.equal(match.scorecard.complete, false);
  assert.equal(match.scorecard.holes.length, 18);
  assert.ok(match.scorecard.holes.every((hole) => hole.state === "unplayed" && hole.official === false));
  assert.equal(match.flow.front.status, "notStarted");
  assert.equal(match.flow.back.status, "notStarted");
  assert.equal(match.flow.overall.status, "notStarted");
});

test("strict projection rejects malformed, over-bounded, or inconsistent authority", () => {
  const duplicateHole = rawFixture();
  duplicateHole.holes[17].hole_number = 17;
  assert.throws(() => map(duplicateHole), /mobile API is unavailable/i);

  const excessiveScore = rawFixture();
  excessiveScore.scores[0].team_1_gross_scores.push(6);
  assert.throws(() => map(excessiveScore), /mobile API is unavailable/i);

  const inconsistentProgress = rawFixture();
  inconsistentProgress.match.team_1_holes_won = 9;
  assert.throws(() => map(inconsistentProgress), /mobile API is unavailable/i);

  const inconsistentCurrentHole = rawFixture();
  inconsistentCurrentHole.match.current_hole -= 1;
  assert.throws(() => map(inconsistentCurrentHole), /mobile API is unavailable/i);

  const inconsistentRemaining = rawFixture();
  inconsistentRemaining.match.holes_remaining -= 1;
  assert.throws(() => map(inconsistentRemaining), /mobile API is unavailable/i);

  const wrongTournament = rawFixture();
  wrongTournament.tournament.tournament_id = "OTHER";
  assert.throws(() => map(wrongTournament), /mobile API is unavailable/i);

  const missingCanonicalCourseName = rawFixture();
  missingCanonicalCourseName.presentation.course_name = null;
  assert.throws(() => map(missingCanonicalCourseName), /mobile API is unavailable/i);

  const scheduledWithScore = rawFixture({ status: "UPCOMING" });
  assert.throws(() => map(scheduledWithScore), /mobile API is unavailable/i);

  const liveWithFinalization = rawFixture();
  liveWithFinalization.match.finalized_at = "2026-09-03T13:01:00.000Z";
  assert.throws(() => map(liveWithFinalization), /mobile API is unavailable/i);

  const finalWithoutResult = rawFixture({ status: "FINAL" });
  finalWithoutResult.match.result_winner = "";
  assert.throws(() => map(finalWithoutResult), /mobile API is unavailable/i);

  const finalWithWrongWinner = rawFixture({ status: "FINAL", winners: Array(18).fill("Team 1") });
  finalWithWrongWinner.match.result_winner = "Team 2";
  assert.throws(() => map(finalWithWrongWinner), /mobile API is unavailable/i);

  const finalWithFalseHalve = rawFixture({ status: "FINAL", winners: Array(18).fill("Team 1") });
  finalWithFalseHalve.match.result_winner = "Halved";
  assert.throws(() => map(finalWithFalseHalve), /mobile API is unavailable/i);
});

test("course summary fails closed when canonical par or rating exceeds the mobile contract", () => {
  const identity = { tournamentId: "preview-2026", playerId: "player-1" };
  for (const [field, value] of [["par", 101], ["rating", 100.001], ["rating", 0.999]]) {
    const raw = rawFixture();
    raw.snapshot[field] = value;
    assert.throws(
      () => mobileMatchDetailDataFromPreviewView(raw, identity),
      ({ code }) => code === "MOBILE_API_UNAVAILABLE",
    );
  }
});

test("participant-safe DTO excludes permissions, revisions, actors, and mutation authority", () => {
  const raw = rawFixture();
  raw.permissions = [{ player_id: "P1", can_score: true, permission_revision: 99 }];
  raw.match.match_revision = 99;
  raw.scores[0].mutation_key = "private-mutation";
  raw.scores[0].actor_id = "private-actor";
  const encoded = JSON.stringify(map(raw));
  for (const forbidden of ["permissions", "can_score", "revision", "mutation", "actor_id", "course_handicap", "handicap_index"]) {
    assert.equal(encoded.toLowerCase().includes(forbidden), false, forbidden);
  }
});

test("Preview reader calls only the isolated participant-bound RPC with exact authority", async () => {
  const calls = [];
  await readMobilePreviewMatchDetailV1({ ...identity, matchId: "2026-R1-2" }, {
    env: preview,
    dependencies: {
      scoringShadowRpc: async (...args) => { calls.push(args); return { payload: rawFixture() }; },
    },
  });
  assert.deepEqual(calls, [[
    "read_preview_mobile_match_detail_v1",
    { input: { environment: "PREVIEW", tournament_id: "2026", player_id: "P1", match_id: "2026-R1-2" } },
    { env: preview, timeoutMs: 8_000 },
  ]]);
  await assert.rejects(() => readMobilePreviewMatchDetailV1({ ...identity, matchId: "2026-R1-2" }, {
    env: { ...preview, VERCEL_ENV: "production" },
    dependencies: { scoringShadowRpc: async () => { throw new Error("must not run"); } },
  }), /mobile API is unavailable/i);
});

test("opaque Match IDs pass unchanged through the Preview reader and canonical projection", async () => {
  const opaqueMatchId = "match:round/2#opaque";
  const raw = rawFixture({ format: "SC", matchId: opaqueMatchId });
  raw.navigation.previous_match_id = "match:round/2#previous";
  raw.navigation.next_match_id = "match:round/2#next";
  raw.navigation.my_match_id = opaqueMatchId;
  const calls = [];
  await readMobilePreviewMatchDetailV1({ ...identity, matchId: opaqueMatchId }, {
    env: preview,
    dependencies: {
      scoringShadowRpc: async (...args) => { calls.push(args); return { payload: raw }; },
    },
  });
  assert.equal(calls[0][1].input.match_id, opaqueMatchId);

  const projected = mobileMatchDetailDataFromPreviewView(raw, { ...identity, matchId: opaqueMatchId });
  assert.equal(projected.match.matchId, opaqueMatchId);
  assert.deepEqual(projected.match.navigation, {
    roundMatchIndex: 2,
    roundMatchCount: 6,
    previousMatchId: "match:round/2#previous",
    nextMatchId: "match:round/2#next",
    myMatchId: opaqueMatchId,
    isMyMatch: true,
  });
  await assertMobileV1Schema("match-detail", {
    ok: true,
    apiVersion: "v1",
    data: projected,
    meta: { generatedAt: "2026-09-03T15:00:00.000Z", revision: "opaque-match-id-fixture" },
  });

  await assert.rejects(
    () => readMobilePreviewMatchDetailV1({ ...identity, matchId: "m".repeat(201) }, {
      env: preview,
      dependencies: { scoringShadowRpc: async () => { throw new Error("must not run"); } },
    }),
    /mobile API is unavailable/i,
  );
});

test("every opaque ID and navigation reference remains exact through reader and canonical projection", async () => {
  for (const [index, { case: name, value }] of validOpaqueMatchIDs.entries()) {
    const raw = rawFixture({ matchId: value });
    raw.navigation.previous_match_id = validOpaqueMatchIDs[(index + 1) % validOpaqueMatchIDs.length].value;
    raw.navigation.next_match_id = validOpaqueMatchIDs[(index + 2) % validOpaqueMatchIDs.length].value;
    const calls = [];
    await readMobilePreviewMatchDetailV1({ ...identity, matchId: value }, {
      env: preview,
      dependencies: { scoringShadowRpc: async (...args) => { calls.push(args); return { payload: raw }; } },
    });
    assert.equal(calls[0][1].input.match_id, value, name);
    const projected = map(raw);
    assert.equal(projected.match.matchId, value, name);
    assert.equal(projected.match.navigation.myMatchId, value, name);
    assert.equal(projected.match.navigation.previousMatchId, raw.navigation.previous_match_id, name);
    assert.equal(projected.match.navigation.nextMatchId, raw.navigation.next_match_id, name);
    await assertMobileV1Schema("match-detail", {
      ok: true, apiVersion: "v1", data: projected,
      meta: { generatedAt: "2026-09-03T15:00:00.000Z", revision: "opaque-exact-projection" },
    });
  }
});

test("invalid opaque IDs fail closed before RPC and in every projected navigation ID", async () => {
  for (const { case: name, value } of invalidOpaqueMatchIDs) {
    await assert.rejects(() => readMobilePreviewMatchDetailV1({ ...identity, matchId: value }, {
      env: preview,
      dependencies: { scoringShadowRpc: async () => assert.fail("invalid ID must not reach RPC") },
    }), { code: "MOBILE_API_UNAVAILABLE" }, name);
    const invalidMatch = rawFixture();
    invalidMatch.match.match_id = value;
    assert.throws(() => map(invalidMatch), { code: "MOBILE_API_UNAVAILABLE" }, name);
    if (value === null || value === undefined) continue;
    for (const field of ["previous_match_id", "next_match_id", "my_match_id"]) {
      const invalidNavigation = rawFixture();
      invalidNavigation.navigation[field] = value;
      assert.throws(() => map(invalidNavigation), { code: "MOBILE_API_UNAVAILABLE" }, `${name}: ${field}`);
    }
  }
});

test("exact Match identity comparison cannot trim or Unicode-normalize mismatched RPC data", () => {
  for (const [requested, returned] of [[" match", "match"], ["match ", "match"], ["match-é", "match-e\u0301"]]) {
    const raw = rawFixture({ matchId: returned });
    assert.throws(() => mobileMatchDetailDataFromPreviewView(raw, { ...identity, matchId: requested }),
      { code: "MOBILE_API_UNAVAILABLE" });
  }
});

test("Match Detail response ETag is representation-stable and changes with canonical scores", async () => {
  const firstRaw = rawFixture();
  const first = await mobileMatchDetailResult(identity, firstRaw.match.match_id, {
    env: preview,
    now: new Date("2026-09-03T15:00:00.000Z"),
    dependencies: { readMobilePreviewMatchDetailV1: async () => ({ payload: firstRaw }) },
  });
  const repeated = await mobileMatchDetailResult(identity, firstRaw.match.match_id, {
    env: preview,
    now: new Date("2026-09-03T16:00:00.000Z"),
    dependencies: { readMobilePreviewMatchDetailV1: async () => ({ payload: structuredClone(firstRaw) }) },
  });
  assert.equal(first.revision, repeated.revision);
  assert.notEqual(first.body.meta.generatedAt, repeated.body.meta.generatedAt);

  const changedRaw = structuredClone(firstRaw);
  changedRaw.scores[0].team_1_gross_scores[0] = 3;
  const changed = await mobileMatchDetailResult(identity, changedRaw.match.match_id, {
    env: preview,
    dependencies: { readMobilePreviewMatchDetailV1: async () => ({ payload: changedRaw }) },
  });
  assert.notEqual(changed.revision, first.revision);
});

test("Match Detail representation changes when canonical lifecycle and flow become final", async () => {
  const liveRaw = rawFixture({
    status: "LIVE",
    winners: [...Array(6).fill("Team 1"), ...Array(6).fill("Halved"), "Team 1"],
  });
  const live = await mobileMatchDetailResult(identity, liveRaw.match.match_id, {
    env: preview,
    dependencies: { readMobilePreviewMatchDetailV1: async () => ({ payload: liveRaw }) },
  });

  const finalRaw = rawFixture({
    status: "FINAL",
    winners: [...Array(6).fill("Team 1"), ...Array(6).fill("Halved"), "Team 1"],
    clinched: true,
  });
  finalRaw.match.running_result = "Team 1 wins 7 & 5";
  const final = await mobileMatchDetailResult(identity, finalRaw.match.match_id, {
    env: preview,
    dependencies: { readMobilePreviewMatchDetailV1: async () => ({ payload: finalRaw }) },
  });

  assert.equal(live.body.data.match.status, "inProgress");
  assert.equal(live.body.data.match.flow.overall.status, "leading");
  assert.equal(final.body.data.match.status, "completed");
  assert.equal(final.body.data.match.flow.overall.status, "final");
  assert.equal(final.body.data.match.scorecard.complete, true);
  assert.notEqual(final.revision, live.revision);
  assert.equal(MOBILE_MATCH_DETAIL_LIMITS.responseBytes, 262_144);
});

test("explicit safe not-found is distinct while all other projection failures remain fail-closed", async () => {
  await assert.rejects(() => mobileMatchDetailResult(identity, "2026-R1-99", {
    env: preview,
    dependencies: { readMobilePreviewMatchDetailV1: async () => ({ payload: { ok: false, code: "MATCH_DETAIL_NOT_FOUND" } }) },
  }), (error) => error.code === "MATCH_NOT_FOUND");
  await assert.rejects(() => mobileMatchDetailResult(identity, "2026-R1-2", {
    env: preview,
    dependencies: { readMobilePreviewMatchDetailV1: async () => ({ payload: { ok: false, code: "MATCH_DETAIL_AUTHORITY_UNAVAILABLE" } }) },
  }), (error) => error.code === "MOBILE_API_UNAVAILABLE");
});

function installRouteFetch({ participant = participantContext(), detail = rawFixture() } = {}) {
  const original = globalThis.fetch;
  const matchDetailBodies = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input?.url || input);
    if (url.includes("/auth/v1/user")) return Response.json({ id: authUserId });
    if (url.includes("/rest/v1/rpc/read_participant_identity_context_for_auth")) return Response.json(participant);
    if (url.includes("/rest/v1/rpc/read_preview_mobile_match_detail_v1")) {
      matchDetailBodies.push(JSON.parse(init.body));
      return Response.json(detail);
    }
    throw new Error(`Unexpected synthetic request: ${url}`);
  };
  return { matchDetailBodies, restore: () => { globalThis.fetch = original; } };
}

test("protected Match Detail route ignores client authority and supports private ETag revalidation", async () => {
  await withEnvironment(preview, async () => {
    const transport = installRouteFetch();
    try {
      const url = "https://native-preview.example/api/mobile/v1/matches/2026-R1-2?playerId=ATTACKER&tournamentId=OTHER";
      const first = await matchDetailGET(new Request(url, { headers: certifiedHeaders() }), {
        params: Promise.resolve({ matchId: "2026-R1-2" }),
      });
      assert.equal(first.status, 200);
      assert.equal(first.headers.get("cache-control"), "private, no-cache");
      assert.equal(first.headers.get("vary"), "Authorization, X-Bagger-Certification");
      const etag = first.headers.get("etag");
      assert.match(etag, /^"[0-9a-f]{64}"$/);
      const body = await first.json();
      await assertMobileV1Schema("match-detail", body);
      assert.equal(body.data.tournament.tournamentId, "2026");
      assert.equal(body.data.match.matchId, "2026-R1-2");
      assert.deepEqual(transport.matchDetailBodies[0], {
        input: { environment: "PREVIEW", tournament_id: "2026", player_id: "P1", match_id: "2026-R1-2" },
      });

      const second = await matchDetailGET(new Request(url, {
        headers: certifiedHeaders({ "If-None-Match": etag }),
      }), { params: Promise.resolve({ matchId: "2026-R1-2" }) });
      assert.equal(second.status, 304);
      assert.equal(second.headers.get("etag"), etag);
      assert.equal(await second.text(), "");
    } finally {
      transport.restore();
    }
  });
});

test("protected Match Detail route preserves an encoded opaque Match path component", async () => {
  await withEnvironment(preview, async () => {
    const opaqueMatchId = "match:round/2#opaque";
    const detail = rawFixture({ format: "SC", matchId: opaqueMatchId });
    detail.navigation.my_match_id = opaqueMatchId;
    const transport = installRouteFetch({ detail });
    try {
      const url = `https://native-preview.example/api/mobile/v1/matches/${encodeURIComponent(opaqueMatchId)}`;
      assert.match(url, /match%3Around%2F2%23opaque$/);
      const response = await matchDetailGET(new Request(url, { headers: certifiedHeaders() }), {
        params: Promise.resolve({ matchId: opaqueMatchId }),
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      await assertMobileV1Schema("match-detail", body);
      assert.equal(body.data.match.matchId, opaqueMatchId);
      assert.equal(body.data.match.navigation.myMatchId, opaqueMatchId);
      assert.equal(transport.matchDetailBodies[0].input.match_id, opaqueMatchId);
    } finally {
      transport.restore();
    }
  });
});

test("real Tournament Live projection round-trips every opaque /matches ID through protected Match Detail and ETag", async () => {
  await withEnvironment(preview, async () => {
    const details = validOpaqueMatchIDs.map(({ value }, index) => rawFixture({
      matchId: value, format: ["BB", "SC", "SI"][index % 3], owned: index % 2 === 0,
    }));
    const view = {
      tournament: details[0].tournament, teams: details[0].teams,
      rounds: [details[0].round], matches: details,
      tournament_presentation: { presentation: { tournament: { status: "Live", currentRound: 1 } } },
      live_revision: { revision: "opaque-exact-roundtrip" },
    };
    const collection = await mobileMatchesResult(identity, {
      env: preview, now: new Date("2026-09-03T15:00:00.000Z"),
      dependencies: {
        requireTournamentReadSource: () => ({ resolved: "supabase" }),
        readTournamentLiveView: async () => ({ payload: { ok: true, data: view } }),
        readGuideProjection: async () => ({ payload: { ok: true, data: {} } }),
        applyGuideCoursesToTournament: (value) => value,
      },
    });
    await assertMobileV1Schema("matches", collection.body);
    assert.deepEqual(collection.body.data.matches.map(({ matchId }) => matchId),
      validOpaqueMatchIDs.map(({ value }) => value));
    for (const [index, listedMatch] of collection.body.data.matches.entries()) {
      const transport = installRouteFetch({ detail: details[index] });
      try {
        const url = `https://native-preview.example/api/mobile/v1/matches/${encodeURIComponent(listedMatch.matchId)}`;
        const routeContext = { params: Promise.resolve({ matchId: listedMatch.matchId }) };
        const response = await matchDetailGET(new Request(url, { headers: certifiedHeaders() }), routeContext);
        assert.equal(response.status, 200, validOpaqueMatchIDs[index].case);
        const body = await response.json();
        await assertMobileV1Schema("match-detail", body);
        assert.equal(body.data.match.matchId, listedMatch.matchId);
        assert.equal(body.data.match.authenticatedPlayer.involved, listedMatch.authenticatedPlayer.involved);
        assert.deepEqual(Buffer.from(body.data.match.matchId, "utf8"), Buffer.from(details[index].match.match_id, "utf8"));
        assert.equal(transport.matchDetailBodies[0].input.match_id, listedMatch.matchId);
        const etag = response.headers.get("etag");
        const revalidated = await matchDetailGET(new Request(url, {
          headers: certifiedHeaders({ "If-None-Match": etag }),
        }), routeContext);
        assert.equal(revalidated.status, 304);
        assert.equal(revalidated.headers.get("etag"), etag);
        assert.equal(await revalidated.text(), "");
      } finally {
        transport.restore();
      }
    }
  });
});

test("Match Detail route requires Bearer, certification, and active canonical membership", async () => {
  await withEnvironment(preview, async () => {
    const transport = installRouteFetch();
    try {
      const noBearer = await matchDetailGET(new Request("https://native-preview.example/api/mobile/v1/matches/2026-R1-2"), {
        params: Promise.resolve({ matchId: "2026-R1-2" }),
      });
      assert.equal(noBearer.status, 401);
      assert.equal((await noBearer.json()).error.code, "UNAUTHORIZED");

      const noCertification = await matchDetailGET(new Request("https://native-preview.example/api/mobile/v1/matches/2026-R1-2", {
        headers: { Authorization: "Bearer valid" },
      }), { params: Promise.resolve({ matchId: "2026-R1-2" }) });
      assert.equal(noCertification.status, 403);
      assert.equal((await noCertification.json()).error.code, "AUTH_CERTIFICATION_FAILED");

      const invalidCertification = await matchDetailGET(new Request("https://native-preview.example/api/mobile/v1/matches/2026-R1-2", {
        headers: { Authorization: "Bearer valid", "X-Bagger-Certification": "not-a-valid-certification" },
      }), { params: Promise.resolve({ matchId: "2026-R1-2" }) });
      assert.equal(invalidCertification.status, 403);
      assert.equal((await invalidCertification.json()).error.code, "AUTH_CERTIFICATION_FAILED");
      assert.equal(transport.matchDetailBodies.length, 0);
    } finally {
      transport.restore();
    }

    const denied = installRouteFetch({ participant: { ok: false, code: "TOURNAMENT_MEMBERSHIP_INACTIVE" } });
    try {
      const response = await matchDetailGET(new Request("https://native-preview.example/api/mobile/v1/matches/2026-R1-2", {
        headers: certifiedHeaders(),
      }), { params: Promise.resolve({ matchId: "2026-R1-2" }) });
      assert.equal(response.status, 403);
      assert.equal((await response.json()).error.code, "PARTICIPANT_NOT_FOUND");
      assert.equal(denied.matchDetailBodies.length, 0);
    } finally {
      denied.restore();
    }

    const unmapped = installRouteFetch({ participant: { ok: false, code: "ACTIVE_USER_PLAYER_LINK_REQUIRED" } });
    try {
      const response = await matchDetailGET(new Request("https://native-preview.example/api/mobile/v1/matches/2026-R1-2", {
        headers: certifiedHeaders(),
      }), { params: Promise.resolve({ matchId: "2026-R1-2" }) });
      assert.equal(response.status, 403);
      assert.equal((await response.json()).error.code, "PARTICIPANT_NOT_FOUND");
      assert.equal(unmapped.matchDetailBodies.length, 0);
    } finally {
      unmapped.restore();
    }
  });
});

test("Match Detail route rejects a wrong certification identity before reading Match data", async () => {
  await withEnvironment(preview, async () => {
    const transport = installRouteFetch();
    try {
      for (const headers of [
        certifiedHeaders({}, { playerId: "ATTACKER" }),
        certifiedHeaders({}, { tournamentId: "OTHER" }),
      ]) {
        const response = await matchDetailGET(new Request("https://native-preview.example/api/mobile/v1/matches/2026-R1-2", { headers }), {
          params: Promise.resolve({ matchId: "2026-R1-2" }),
        });
        assert.equal(response.status, 403);
        assert.equal((await response.json()).error.code, "AUTH_CERTIFICATION_FAILED");
      }
      assert.equal(transport.matchDetailBodies.length, 0);
    } finally {
      transport.restore();
    }
  });
});

test("Match Detail route fails closed in Production before any authentication or database transport", async () => {
  await withEnvironment({ ...preview, VERCEL_ENV: "production" }, async () => {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; throw new Error("must not call"); };
    try {
      const response = await matchDetailGET(new Request("https://baggerinv.com/api/mobile/v1/matches/2026-R1-2", {
        headers: { Authorization: "Bearer production" },
      }), { params: Promise.resolve({ matchId: "2026-R1-2" }) });
      assert.equal(response.status, 503);
      assert.equal((await response.json()).error.code, "MOBILE_API_UNAVAILABLE");
      assert.equal(calls, 0);
    } finally {
      globalThis.fetch = original;
    }
  });
});

test("Match Detail route maps only tournament-scoped explicit not-found to the safe 404 envelope", async () => {
  await withEnvironment(preview, async () => {
    const transport = installRouteFetch({ detail: { ok: false, code: "MATCH_DETAIL_NOT_FOUND" } });
    try {
      const response = await matchDetailGET(new Request("https://native-preview.example/api/mobile/v1/matches/2026-R1-99", {
        headers: certifiedHeaders(),
      }), { params: Promise.resolve({ matchId: "2026-R1-99" }) });
      assert.equal(response.status, 404);
      assert.equal((await response.json()).error.code, "MATCH_NOT_FOUND");
    } finally {
      transport.restore();
    }
  });
});
