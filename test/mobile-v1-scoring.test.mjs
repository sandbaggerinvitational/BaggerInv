import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MobileApiError, mobileApiErrorResult } from "../lib/mobile-api-v1.js";
import {
  mobileScoringCurrentResult,
  mobileScoringFinalizeResult,
  mobileScoringHoleResult,
  normalizeMobileFinalizeMutation,
  normalizeMobileHoleMutation,
} from "../lib/mobile-v1-scoring.js";

const now = new Date("2026-09-25T14:30:00.000Z");
const identity = (matches = [{
  matchId: "M1", round: 2, format: "BB", status: "LIVE", scoringLocked: false,
  matchRevision: 10, canScore: true, permissionRevision: 7,
}]) => ({
  authUserId: "11111111-1111-4111-8111-111111111111",
  playerId: "P1",
  tournamentId: "2026",
  displayName: "Player One",
  context: {
    membership: { active: true },
    team: { id: "T1", name: "Pickles", side: 1 },
    matches,
    email: "private@example.test",
    phone: "+15555550100",
  },
});

const activeDecision = (action = "START_SCORING") => ({
  allowed: true,
  code: "AUTHORIZED",
  action,
  tournament_id: "2026",
  player_id: "P1",
  match_id: "M1",
  match_status: "LIVE",
  can_score: true,
  permission_revision: 7,
  match_permission_revision: 7,
  read_only: action !== "START_SCORING",
});

const availability = {
  scoringAuthorityEnvironment: () => ({ resolved: "supabase" }),
  requireScoringReadSource: () => ({ resolved: "supabase" }),
};

function readData({ status = "LIVE", writable = true, canConfirm = false } = {}) {
  return {
    match: {
      "Match ID": "M1", Round: 2, Format: "BB", "Course ID": "C1", Tee: "Blue",
      "Course Rating": 72.4, "Slope Rating": 131, Par: 72,
      "Team 1 Team ID": "T1", "Team 2 Team ID": "T2",
      "Team 1 Player 1": "P1", "Team 1 Player 1 Handicap Index": 8.2,
      "Team 1 Player 1 Course HCP": 9, "Team 1 Player 1 Playing HCP": 8, "Team 1 Player 1 Stroke": 2,
      "Team 1 Player 2": "P2", "Team 1 Player 2 Handicap Index": 9.1,
      "Team 1 Player 2 Course HCP": 10, "Team 1 Player 2 Playing HCP": 9, "Team 1 Player 2 Stroke": 3,
      "Team 2 Player 1": "P3", "Team 2 Player 1 Handicap Index": 6,
      "Team 2 Player 1 Course HCP": 7, "Team 2 Player 1 Playing HCP": 6, "Team 2 Player 1 Stroke": 0,
      "Team 2 Player 2": "P4", "Team 2 Player 2 Handicap Index": 12,
      "Team 2 Player 2 Course HCP": 13, "Team 2 Player 2 Playing HCP": 12, "Team 2 Player 2 Stroke": 6,
      "Match Status": status === "FINAL" ? "Final" : "Live", "Current Hole": 1, "Holes Remaining": 17,
      "Match Status Text": "Team 1 1 UP through 1", "Matchup Winner": status === "FINAL" ? "Team 1" : "",
      Revision: 10, matchRevision: 10, permissionRevision: 7,
    },
    display: {
      courseName: "Ocean Course", teamNames: { 1: "Pickles", 2: "Rippers" },
      playerNames: { P1: "Player One", P2: "Player Two", P3: "Player Three", P4: "Player Four" },
    },
    participantSide: 1,
    courseHoles: [{ "Hole Number": 1, Par: 4, "Stroke Index": 3, Yardage: 412 }],
    holeScores: [{
      "Hole Number": 1, Revision: 2,
      "Team 1 Gross Scores": "4/5", "Team 2 Gross Scores": "5/5",
      "Team 1 Strokes": [1, 0], "Team 2 Strokes": [0, 1],
      "Team 1 Net Score": 3, "Team 2 Net Score": 4, "Hole Winner": "Team 1",
      "Updated At": "2026-09-25T14:29:00.000Z",
    }],
    canConfirm,
    authority: {
      writable, status, matchRevision: 10, permissionRevision: 7,
      scoringLocked: status === "FINAL", scorecardComplete: canConfirm,
      scoringSnapshotId: "M1:S1", scoringSnapshotRevision: 1,
      scoringSnapshotFingerprint: "must-not-leak",
    },
  };
}

function currentDependencies(overrides = {}) {
  return {
    ...availability,
    authorizeMatchAccess: async ({ action }) => ({ payload: activeDecision(action) }),
    readParticipantScoringMatch: async () => ({ data: readData(), diagnostics: { source: "supabase" } }),
    ...overrides,
  };
}

function successfulHole({ idempotent = false, semanticNoop = false, matchRevision = 11 } = {}) {
  return {
    authority: "supabase",
    result: {
      hole: {
        "Match ID": "M1", "Hole Number": 2, Revision: 1,
        "Team 1 Gross Scores": [4, 5], "Team 2 Gross Scores": [5, 6],
        "Team 1 Strokes": [1, 0], "Team 2 Strokes": [0, 1],
        "Team 1 Net Score": 3, "Team 2 Net Score": 4, "Hole Winner": "Team 1",
        "Updated At": "2026-09-25T14:30:00.000Z",
      },
      liveStatus: { currentHole: 2, holesRemaining: 16, statusText: "Team 1 2 UP through 2" },
      matchComplete: false,
      matchRevision,
      idempotent,
      semanticNoop,
    },
  };
}

const holeRequest = (overrides = {}) => ({
  matchId: "M1",
  holeNumber: 2,
  teamOneGrossScores: [4, 5],
  teamTwoGrossScores: [5, 6],
  mutationId: "11111111-1111-4111-8111-111111111111",
  expectedMatchRevision: 10,
  expectedHoleRevision: 0,
  ...overrides,
});

test("current scoring maps the immutable canonical snapshot and verified writable state", async () => {
  const calls = [];
  const result = await mobileScoringCurrentResult(identity(), { now, dependencies: currentDependencies({
    authorizeMatchAccess: async (input) => { calls.push(input); return { payload: activeDecision(input.action) }; },
    readParticipantScoringMatch: async (input) => {
      assert.equal(input.currentPlayerId, "P1");
      assert.deepEqual(input.authorization, { verified: true, writable: true });
      return { data: readData(), diagnostics: { source: "supabase" } };
    },
  }) });
  assert.deepEqual(calls.map((call) => call.action).sort(), ["START_SCORING", "VIEW_MATCH"]);
  assert.equal(result.body.data.scoring.match.matchId, "M1");
  assert.equal(result.body.data.scoring.match.status, "inProgress");
  assert.equal(result.body.data.scoring.player.playerId, "P1");
  assert.equal(result.body.data.scoring.player.teamSide, 1);
  assert.equal(result.body.data.scoring.sides[0].participants[0].handicapIndex, 8.2);
  assert.equal(result.body.data.scoring.course.holes[0].strokeIndex, 3);
  assert.deepEqual(result.body.data.scoring.scores[0].gross.teamOne, [4, 5]);
  assert.deepEqual(result.body.data.scoring.scores[0].strokes.teamOne, [1, 0]);
  assert.equal(result.body.data.scoring.scores[0].net.teamOne, 3);
  assert.equal(result.body.data.scoring.scores[0].winner, "teamOne");
  assert.deepEqual(result.body.data.scoring.permission, {
    canScore: true, readOnly: false, canFinalize: false, reason: null,
  });
  const serialized = JSON.stringify(result.body);
  for (const forbidden of ["must-not-leak", "private@example.test", "+15555550100", identity().authUserId, "permissions"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("current scoring returns bounded read-only final state and a stable no-match state", async () => {
  const finalIdentity = identity([{ matchId: "M-FINAL", round: 1, format: "BB", status: "FINAL", canScore: false, permissionRevision: 8 }]);
  const final = await mobileScoringCurrentResult(finalIdentity, { now, dependencies: currentDependencies({
    authorizeMatchAccess: async ({ action, matchId }) => ({ payload: action === "VIEW_MATCH"
      ? { ...activeDecision(action), match_id: matchId }
      : { allowed: false, code: "MATCH_FINAL", match_id: matchId } }),
    readParticipantScoringMatch: async () => ({ data: {
      ...readData({ status: "FINAL", writable: false, canConfirm: true }),
      match: { ...readData().match, "Match ID": "M-FINAL", "Match Status": "Final", "Matchup Winner": "Team 1" },
    } }),
  }) });
  assert.equal(final.body.data.scoring.match.status, "completed");
  assert.equal(final.body.data.scoring.permission.canScore, false);
  assert.equal(final.body.data.scoring.permission.readOnly, true);
  assert.equal(final.body.data.scoring.permission.reason, "matchFinalized");
  assert.equal(final.body.data.scoring.match.result, "teamOne");

  const none = await mobileScoringCurrentResult(identity([]), { now, dependencies: currentDependencies() });
  assert.deepEqual(none.body.data, { scoring: null });
});

test("current scoring cannot be redirected to another Player's match and fails closed outside Supabase authority", async () => {
  await assert.rejects(() => mobileScoringCurrentResult(identity(), {
    matchId: "OTHER", dependencies: currentDependencies(),
  }), (error) => error.code === "SCORING_NOT_AUTHORIZED");
  await assert.rejects(() => mobileScoringCurrentResult(identity(), { dependencies: currentDependencies({
    scoringAuthorityEnvironment: () => ({ resolved: "google" }),
  }) }), (error) => error.code === "SCORING_UNAVAILABLE");
});

test("hole mutation accepts gross-score intent only and delegates the exact PWA authority input", async () => {
  let persistenceInput;
  const result = await mobileScoringHoleResult(identity(), holeRequest(), { now, dependencies: currentDependencies({
    persistParticipantScore: async (input) => { persistenceInput = input; return successfulHole(); },
  }) });
  assert.deepEqual(persistenceInput.input, {
    holeNumber: 2,
    team1GrossScores: [4, 5],
    team2GrossScores: [5, 6],
    clientMutationId: holeRequest().mutationId,
    expectedMatchRevision: 10,
    expectedRevision: 0,
  });
  assert.equal(persistenceInput.current.playerId, "P1");
  assert.equal(persistenceInput.current.authUserId, identity().authUserId);
  assert.equal(persistenceInput.current.accessVersion, 7);
  assert.equal(persistenceInput.current.identityAuthority, "supabase");
  assert.deepEqual(persistenceInput.authorizationContext, {
    source: "mobile-native-certified",
    identity: {
      authUserId: identity().authUserId,
      playerId: "P1",
      tournamentId: "2026",
    },
  });
  assert.equal(persistenceInput.includeCanonicalAcknowledgement, true);
  assert.deepEqual(result.body.data.hole.strokes.teamOne, [1, 0]);
  assert.equal(result.body.data.hole.net.teamOne, 3);
  assert.equal(result.body.data.hole.winner, "teamOne");
  assert.equal(result.body.data.match.revision, 11);
  assert.equal(result.body.data.accepted, true);
});

test("strict mutation validation rejects spoofing, canonical outputs, malformed IDs, scores, revisions, and slot counts", async () => {
  const invalid = [
    holeRequest({ playerId: "ATTACKER" }),
    holeRequest({ netScore: 1 }),
    holeRequest({ strokes: [8] }),
    holeRequest({ winner: "teamOne" }),
    holeRequest({ matchId: "bad match" }),
    holeRequest({ mutationId: "" }),
    holeRequest({ mutationId: "x".repeat(129) }),
    holeRequest({ holeNumber: 19 }),
    holeRequest({ teamOneGrossScores: [0, 5] }),
    holeRequest({ expectedMatchRevision: -1 }),
    holeRequest({ expectedHoleRevision: 1.5 }),
    holeRequest({ holeNumber: "2" }),
    holeRequest({ teamOneGrossScores: ["4", 5] }),
    holeRequest({ expectedMatchRevision: "10" }),
    holeRequest({ mutationId: 123 }),
  ];
  for (const input of invalid) assert.throws(() => normalizeMobileHoleMutation(input), (error) => error.code === "INVALID_SCORE_INPUT");
  await assert.rejects(() => mobileScoringHoleResult(identity(), holeRequest({ teamOneGrossScores: [4] }), {
    dependencies: currentDependencies({ persistParticipantScore: async () => successfulHole() }),
  }), (error) => error.code === "INVALID_SCORE_INPUT");
  assert.throws(() => normalizeMobileFinalizeMutation({
    matchId: "M1", mutationId: "finalize-1", expectedMatchRevision: 10, result: "Team 1",
  }), (error) => error.code === "INVALID_SCORE_INPUT");
});

test("match membership, lifecycle, and permission are revalidated before every mutation", async () => {
  let persisted = false;
  await assert.rejects(() => mobileScoringHoleResult(identity(), holeRequest({ matchId: "OTHER" }), {
    dependencies: currentDependencies({ persistParticipantScore: async () => { persisted = true; } }),
  }), (error) => error.code === "SCORING_NOT_AUTHORIZED");
  assert.equal(persisted, false);

  for (const [code, expected] of [
    ["SCORING_PERMISSION_REVOKED", "SCORING_NOT_AUTHORIZED"],
    ["SCORING_PERMISSION_STALE", "SCORING_NOT_AUTHORIZED"],
    ["MATCH_LOCKED", "SCORING_READ_ONLY"],
    ["MATCH_NOT_SCOREABLE", "SCORING_READ_ONLY"],
    ["MATCH_FINAL", "MATCH_ALREADY_FINALIZED"],
  ]) {
    persisted = false;
    await assert.rejects(() => mobileScoringHoleResult(identity(), holeRequest(), { dependencies: currentDependencies({
      authorizeMatchAccess: async () => ({ payload: { allowed: false, code } }),
      persistParticipantScore: async () => {
        persisted = true;
        throw Object.assign(new Error(code), { code });
      },
    }) }), (error) => error.code === expected);
    assert.equal(persisted, ["SCORING_PERMISSION_REVOKED", "SCORING_PERMISSION_STALE", "MATCH_LOCKED",
      "MATCH_NOT_SCOREABLE", "MATCH_FINAL"].includes(code));
  }
});

test("same mutation replay is acknowledged idempotently while incompatible reuse and stale devices conflict", async () => {
  const seen = new Map();
  let matchRevision = 10;
  let effects = 0;
  const authority = async ({ input }) => {
    const intent = JSON.stringify([input.holeNumber, input.team1GrossScores, input.team2GrossScores]);
    if (seen.has(input.clientMutationId)) {
      const prior = seen.get(input.clientMutationId);
      if (prior.intent !== intent) {
        const error = Object.assign(new Error("conflict"), { code: "IDEMPOTENCY_CONFLICT", status: 409,
          authoritativeDiagnostics: { code: "IDEMPOTENCY_CONFLICT", current_match_revision: matchRevision } });
        throw error;
      }
      return successfulHole({ idempotent: true, matchRevision: prior.revision });
    }
    if (input.expectedMatchRevision !== matchRevision) {
      throw Object.assign(new Error("stale"), { code: "MATCH_REVISION_CONFLICT", status: 409,
        authoritativeDiagnostics: { code: "MATCH_REVISION_CONFLICT", current_match_revision: matchRevision } });
    }
    effects += 1;
    matchRevision += 1;
    seen.set(input.clientMutationId, { intent, revision: matchRevision });
    return successfulHole({ matchRevision });
  };
  const dependencies = currentDependencies({ persistParticipantScore: authority });
  const first = await mobileScoringHoleResult(identity(), holeRequest(), { now, dependencies });
  const retry = await mobileScoringHoleResult(identity(), holeRequest(), { now, dependencies });
  assert.equal(first.body.data.idempotent, false);
  assert.equal(retry.body.data.idempotent, true);
  assert.equal(retry.body.data.match.revision, 11);
  assert.equal(effects, 1);

  await assert.rejects(() => mobileScoringHoleResult(identity(), holeRequest({ teamOneGrossScores: [3, 5] }), {
    dependencies,
  }), (error) => error.code === "IDEMPOTENCY_CONFLICT" && error.data.currentMatchRevision === 11);
  await assert.rejects(() => mobileScoringHoleResult(identity(), holeRequest({
    mutationId: "22222222-2222-4222-8222-222222222222",
  }), { dependencies }), (error) => error.code === "REVISION_CONFLICT"
    && error.data.currentMatchRevision === 11 && error.data.refreshRequired === true);
  assert.equal(effects, 1);
});

test("permission revocation between devices prevents every subsequent write", async () => {
  let authorized = true;
  let effects = 0;
  const dependencies = currentDependencies({
    authorizeMatchAccess: async ({ action }) => ({ payload: authorized
      ? activeDecision(action)
      : { allowed: false, code: "SCORING_PERMISSION_REVOKED" } }),
    persistParticipantScore: async () => {
      if (!authorized) throw Object.assign(new Error("revoked"), { code: "UNAUTHORIZED" });
      effects += 1;
      return successfulHole();
    },
  });
  await mobileScoringHoleResult(identity(), holeRequest(), { dependencies });
  authorized = false;
  await assert.rejects(() => mobileScoringHoleResult(identity(), holeRequest({
    mutationId: "33333333-3333-4333-8333-333333333333", expectedMatchRevision: 11,
  }), { dependencies }), (error) => error.code === "SCORING_NOT_AUTHORIZED");
  assert.equal(effects, 1);
});

test("a committed hole acknowledgement remains replayable after another device finalizes the match", async () => {
  let calls = 0;
  const finalizedDecision = { allowed: false, code: "MATCH_FINAL", permission_revision: 8 };
  const replay = await mobileScoringHoleResult(identity(), holeRequest(), { dependencies: currentDependencies({
    authorizeMatchAccess: async () => ({ payload: finalizedDecision }),
    persistParticipantScore: async () => { calls += 1; return successfulHole({ idempotent: true, matchRevision: 11 }); },
  }) });
  assert.equal(replay.body.data.idempotent, true);
  assert.equal(replay.body.data.accepted, true);
  assert.equal(calls, 1);

  await assert.rejects(() => mobileScoringHoleResult(identity(), holeRequest({
    mutationId: "44444444-4444-4444-8444-444444444444",
  }), { dependencies: currentDependencies({
    authorizeMatchAccess: async () => ({ payload: finalizedDecision }),
    persistParticipantScore: async () => { throw Object.assign(new Error("final"), { code: "MATCH_FINAL" }); },
  }) }), (error) => error.code === "MATCH_ALREADY_FINALIZED");
});

test("explicit participant finalization delegates readiness and lifecycle to the canonical transaction", async () => {
  let persistenceInput;
  const result = await mobileScoringFinalizeResult(identity(), {
    matchId: "M1", mutationId: "finalize:M1:10", expectedMatchRevision: 10,
  }, { now, dependencies: currentDependencies({
    persistParticipantScore: async (input) => {
      persistenceInput = input;
      return { authority: "supabase", result: {
        matchComplete: true, matchRevision: 11, permissionRevision: 8,
        resultWinner: "Team 1", updatedAt: now.toISOString(), idempotent: false,
      } };
    },
  }) });
  assert.deepEqual(persistenceInput.input, {
    action: "confirm", clientMutationId: "finalize:M1:10", expectedMatchRevision: 10,
  });
  assert.equal(persistenceInput.current.playerId, "P1");
  assert.equal(persistenceInput.current.authUserId, identity().authUserId);
  assert.deepEqual(persistenceInput.authorizationContext, {
    source: "mobile-native-certified",
    identity: {
      authUserId: identity().authUserId,
      playerId: "P1",
      tournamentId: "2026",
    },
  });
  assert.equal(persistenceInput.includeCanonicalAcknowledgement, true);
  assert.equal(result.body.data.match.status, "completed");
  assert.equal(result.body.data.match.scoringLocked, true);
  assert.equal(result.body.data.match.result, "teamOne");
  assert.equal(result.body.data.match.permissionRevision, 8);
});

test("finalization exposes stable incomplete, stale, and already-finalized outcomes", async () => {
  const request = { matchId: "M1", mutationId: "finalize:M1:10", expectedMatchRevision: 10 };
  const canonicalError = (code, diagnostics = {}) => Object.assign(new Error(code), {
    code, status: 409, authoritativeDiagnostics: { code, ...diagnostics },
  });
  await assert.rejects(() => mobileScoringFinalizeResult(identity(), request, { dependencies: currentDependencies({
    persistParticipantScore: async () => { throw canonicalError("SCORECARD_INCOMPLETE", { scored_holes: 17 }); },
  }) }), (error) => error.code === "FINALIZATION_NOT_READY" && error.data.scoredHoles === 17);
  await assert.rejects(() => mobileScoringFinalizeResult(identity(), request, { dependencies: currentDependencies({
    persistParticipantScore: async () => { throw canonicalError("MATCH_REVISION_CONFLICT", { current_match_revision: 11 }); },
  }) }), (error) => error.code === "REVISION_CONFLICT" && error.data.currentMatchRevision === 11);
  await assert.rejects(() => mobileScoringFinalizeResult(identity(), request, { dependencies: currentDependencies({
    authorizeMatchAccess: async () => ({ payload: { allowed: false, code: "MATCH_FINAL" } }),
  }) }), (error) => error.code === "MATCH_ALREADY_FINALIZED");
});

test("conflict error responses expose only bounded refresh state", () => {
  const error = new MobileApiError("REVISION_CONFLICT", {
    matchId: "M1", currentMatchRevision: 11, currentHoleRevision: 2, refreshRequired: true,
  });
  assert.deepEqual(mobileApiErrorResult(error), {
    status: 409,
    body: {
      ok: false,
      apiVersion: "v1",
      error: { code: "REVISION_CONFLICT", message: "Official scoring state has changed." },
      data: { matchId: "M1", currentMatchRevision: 11, currentHoleRevision: 2, refreshRequired: true },
    },
  });
});

test("mobile handlers import the shared persistence authority and contain no scoring calculation or direct RPC write", async () => {
  const source = await readFile(new URL("../lib/mobile-v1-scoring.js", import.meta.url), "utf8");
  assert.match(source, /persistParticipantScore/);
  assert.doesNotMatch(source, /submitCanonicalHoleScore|finalizeCanonicalMatch|calculateLiveHole|calculateMatchPoints|scoringShadowRpc/);
});
