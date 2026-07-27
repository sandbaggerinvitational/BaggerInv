import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLineupPlans,
  comparisonEdge,
  confidenceForPartnership,
  pairingScore,
  rankPairings,
  validateLineupPlan,
} from "../lib/team-intelligence-utils.js";
import { buildPartnershipIntelligence } from "../lib/team-intelligence.js";

test("comparison direction supports lower-is-better, ties, and unavailable data", () => {
  assert.equal(comparisonEdge(4, 6, "lower"), "TEAM_A");
  assert.equal(comparisonEdge(7, 7), "TIE");
  assert.equal(comparisonEdge(null, 7), "UNAVAILABLE");
});

test("lineup validation rejects conflicting same-round assignments", () => {
  const result = validateLineupPlan([
    { id: "bb-1", roundId: "R1", playerIds: ["P1", "P2"] },
    { id: "bb-2", roundId: "R1", playerIds: ["P1", "P3"] },
  ]);
  assert.equal(result.valid, false);
  assert.equal(result.conflicts[0].playerId, "P1");
  assert.equal(validateLineupPlan([
    { id: "r1", roundId: "R1", playerIds: ["P1"] },
    { id: "r2", roundId: "R2", playerIds: ["P1"] },
  ]).valid, true);
});

test("full lineup alternatives remain advisory, distinct, and conflict-free", () => {
  const row = (id, players, points) => ({ id, label: id, players: players.map((playerId) => ({ id: playerId })), averageExpectedPoints: points, confidence: "MODERATE" });
  const plans = buildLineupPlans({
    bestBall: [row("bb1", ["A", "B"], 2), row("bb2", ["C", "D"], 1.8)],
    scramble: [row("sc1", ["C", "D"], 2), row("sc2", ["A", "B"], 1.7)],
    singles: [row("s1", ["A"], 2), row("s2", ["B"], 1.8)],
  });
  assert.equal(plans.length, 3);
  assert.ok(plans.every((plan) => plan.validation.valid));
  assert.deepEqual(plans.map((plan) => plan.label), ["Best Overall", "Safest", "Highest Upside"]);
});

test("recommendation modes rank the same shared prediction rows differently", () => {
  const rows = [
    { id: "steady", averageExpectedPoints: 1.7, averageWinProbability: 55, worstCaseExpectedPoints: 1.4, bestCaseWinProbability: 60, chemistryScore: 70, closingScore: 50 },
    { id: "upside", averageExpectedPoints: 1.6, averageWinProbability: 53, worstCaseExpectedPoints: 1.0, bestCaseWinProbability: 75, chemistryScore: 50, closingScore: 80 },
  ];
  assert.equal(rankPairings(rows, "best")[0].id, "steady");
  assert.equal(rankPairings(rows, "upside")[0].id, "upside");
  assert.equal(rankPairings(rows, "closing")[0].id, "upside");
});

test("pairing score remains transparent and confidence uses sample depth", () => {
  const score = pairingScore({ chemistry: 80, scoring: 70, matchPlay: 60, closing: 50, volatility: 4, confidence: "HIGH" });
  assert.equal(score.confidence, "HIGH");
  assert.ok(score.overall >= 60 && score.overall <= 80);
  assert.equal(confidenceForPartnership({ matches: 1, scorecards: 0 }), "LOW");
  assert.equal(confidenceForPartnership({ matches: 5, scorecards: 4 }), "HIGH");
});

test("partnership analytics count players only when they share a side", () => {
  const players = [{ id: "A", name: "A" }, { id: "B", name: "B" }, { id: "C", name: "C" }];
  const rows = buildPartnershipIntelligence({
    players,
    partnershipRows: [],
    progressionMatches: [{
      matchId: "M1", format: "BB",
      sideA: { playerIds: ["A", "B"] }, sideB: { playerIds: ["C"] },
      holesWon: { A: 5, B: 3 }, holesLost: { A: 3, B: 5 }, holesHalved: 10,
      closing: { A: { won: 2, lost: 0 }, B: { won: 0, lost: 2 } },
      largestLead: { A: 2, B: 1 }, longestHolesWon: { A: 2, B: 1 },
      winnerSide: "A", largestComeback: 1,
    }],
    tournaments: [],
    tournamentMatches: [],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].key, "A|B");
  assert.equal(rows[0].holeDifferential, 2);
});
