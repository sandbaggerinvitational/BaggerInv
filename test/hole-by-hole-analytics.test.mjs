import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAdvancedHoleRecords,
  buildPlayerHoleByHoleAnalytics,
  HOLE_BY_HOLE_COMPLETE_STATUSES,
} from "../lib/hole-by-hole-analytics.js";

const holes = (offset = 0) => Array.from({ length: 18 }, (_, index) => {
  const par = index % 3 === 0 ? 3 : index % 3 === 1 ? 4 : 5;
  const score = par + ((index + offset) % 5 === 0 ? -1 : (index + offset) % 5 === 1 ? 1 : 0);
  return {
    holeNumber: index + 1,
    par,
    score,
    toPar: score - par,
    netScore: score - (index === 0 ? 1 : 0),
  };
});

function card({ playerId, side, status = "COMPLETE", offset = 0, matchId = "M1" }) {
  const playerHoles = holes(offset);
  const gross = playerHoles.reduce((sum, hole) => sum + hole.score, 0);
  const net = playerHoles.reduce((sum, hole) => sum + hole.netScore, 0);
  return {
    matchId,
    status,
    completedHoleCount: status === "PARTIAL" ? 9 : 18,
    scoreType: "INDIVIDUAL",
    playerId,
    playerName: `Player ${playerId}`,
    participantPlayerIds: [playerId],
    side,
    holes: playerHoles,
    total: gross,
    frontNine: playerHoles.slice(0, 9).reduce((sum, hole) => sum + hole.score, 0),
    backNine: playerHoles.slice(9).reduce((sum, hole) => sum + hole.score, 0),
    netTotals: { total: net },
  };
}

function winnerData() {
  return {
    holeWinners: Array.from({ length: 18 }, (_, index) => ({
      holeNumber: index + 1,
      winnerSide: index < 7 ? "A" : index < 12 ? "B" : null,
      winnerType: index >= 12 ? "HALVED" : "TEAM",
    })),
  };
}

test("only COMPLETE and VERIFIED scorecards contribute", () => {
  assert.deepEqual([...HOLE_BY_HOLE_COMPLETE_STATUSES].sort(), ["COMPLETE", "VERIFIED"]);
  const completeA = card({ playerId: "A", side: 1 });
  const completeB = card({ playerId: "B", side: 2, offset: 2 });
  completeA.matchNetScoring = winnerData();
  completeB.matchNetScoring = winnerData();
  const partial = card({ playerId: "A", side: 1, status: "PARTIAL", matchId: "M2" });
  const rows = buildPlayerHoleByHoleAnalytics([completeA, completeB, partial]);
  const playerA = rows.find((row) => row.playerId === "A");
  assert.equal(playerA.sample.completeScorecards, 1);
  assert.equal(playerA.sample.scoringHoles, 18);
  assert.equal(playerA.totalHolesPlayed, 18);
});

test("match-play totals, nines, closing holes, and differential are calculated once per match", () => {
  const completeA = card({ playerId: "A", side: 1 });
  const completeB = card({ playerId: "B", side: 2 });
  completeA.matchNetScoring = winnerData();
  completeB.matchNetScoring = winnerData();
  const rows = buildPlayerHoleByHoleAnalytics([completeA, completeB]);
  const playerA = rows.find((row) => row.playerId === "A");
  assert.equal(playerA.holesWon, 7);
  assert.equal(playerA.holesLost, 5);
  assert.equal(playerA.holesHalved, 6);
  assert.equal(playerA.holeDifferential, 2);
  assert.equal(playerA.frontNineHolesWon, 7);
  assert.equal(playerA.backNineHolesWon, 0);
  assert.equal(playerA.closingHolesWon, 0);
});

test("career scoring totals, gross/net averages, and rates are exposed", () => {
  const completeA = card({ playerId: "A", side: 1 });
  const completeB = card({ playerId: "B", side: 2, offset: 2 });
  completeA.matchNetScoring = winnerData();
  completeB.matchNetScoring = winnerData();
  const playerA = buildPlayerHoleByHoleAnalytics([completeA, completeB]).find((row) => row.playerId === "A");
  assert.ok(Number.isFinite(playerA.averageGrossScore));
  assert.ok(Number.isFinite(playerA.averageNetScore));
  assert.equal(playerA.birdies + playerA.eagles + playerA.pars + playerA.bogeys + playerA.doubleBogeysOrWorse, 18);
  assert.equal(
    Number((playerA.birdieRate + playerA.parRate + playerA.bogeyRate + playerA.doubleBogeyOrWorseRate).toFixed(1)),
    100
  );
});

test("advanced records use the same shared player aggregates", () => {
  const completeA = card({ playerId: "A", side: 1 });
  const completeB = card({ playerId: "B", side: 2, offset: 2 });
  completeA.matchNetScoring = winnerData();
  completeB.matchNetScoring = winnerData();
  const records = buildAdvancedHoleRecords([completeA, completeB]);
  assert.equal(records.players.length, 2);
  assert.equal(records.mostHolesWon.playerId, "A");
  assert.ok(records.lowestAverageScore);
  assert.ok(records.lowestPar5Average);
});
