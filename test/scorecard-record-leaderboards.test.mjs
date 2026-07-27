import assert from "node:assert/strict";
import test from "node:test";
import {
  buildScorecardRecordLeaderboards,
  scorecardLeaderboardRows,
} from "../lib/scorecard-record-leaderboards.js";
import { addTournamentRanks } from "../lib/rankings.js";

const pars = Array.from({ length: 18 }, (_, index) => index % 3 === 0 ? 3 : index % 3 === 1 ? 4 : 5);
const holes = (adjustment = 0) => pars.map((par, index) => ({
  holeNumber: index + 1,
  par,
  score: par + adjustment,
  toPar: adjustment,
  netScore: par + adjustment,
}));

function individual({ playerId, side, totalAdjustment = 0, matchId = "BB1", format = "BB" }) {
  const playerHoles = holes(totalAdjustment);
  return {
    matchId,
    year: 2025,
    round: 1,
    format,
    courseId: "C1",
    courseName: "Test Course",
    status: "COMPLETE",
    completedHoleCount: 18,
    scoreType: "INDIVIDUAL",
    playerId,
    playerName: `Player ${playerId}`,
    playerSlug: `player-${playerId.toLowerCase()}`,
    participantPlayerIds: [playerId],
    participantNames: [`Player ${playerId}`],
    side,
    sideTeamId: side === 1 ? "T1" : "T2",
    holes: playerHoles,
    total: playerHoles.reduce((sum, hole) => sum + hole.score, 0),
    totalToPar: totalAdjustment * 18,
    frontNine: playerHoles.slice(0, 9).reduce((sum, hole) => sum + hole.score, 0),
    backNine: playerHoles.slice(9).reduce((sum, hole) => sum + hole.score, 0),
    netTotals: {
      total: playerHoles.reduce((sum, hole) => sum + hole.netScore, 0),
    },
  };
}

function scramble(teamId, playerIds, adjustment = 0) {
  const teamHoles = holes(adjustment);
  return {
    matchId: `SC-${teamId}`,
    year: 2025,
    round: 2,
    format: "SC",
    courseId: "C2",
    courseName: "Scramble Course",
    status: "VERIFIED",
    completedHoleCount: 18,
    scoreType: "TEAM",
    teamId,
    teamName: `Team ${teamId}`,
    participantPlayerIds: playerIds,
    participantNames: playerIds.map((id) => `Player ${id}`),
    holes: teamHoles,
    total: teamHoles.reduce((sum, hole) => sum + hole.score, 0),
    totalToPar: adjustment * 18,
    frontNine: teamHoles.slice(0, 9).reduce((sum, hole) => sum + hole.score, 0),
    backNine: teamHoles.slice(9).reduce((sum, hole) => sum + hole.score, 0),
  };
}

function fixtures() {
  const cards = [
    individual({ playerId: "P1", side: 1 }),
    individual({ playerId: "P2", side: 1 }),
    individual({ playerId: "P3", side: 2, totalAdjustment: 1 }),
    individual({ playerId: "P4", side: 2, totalAdjustment: 1 }),
    scramble("T1", ["P1", "P2"], -1),
    scramble("T2", ["P3", "P4"], 0),
  ];
  const matchNetScoring = {
    rows: [
      {
        side: 1,
        type: "BEST_BALL_NET",
        teamId: "T1",
        name: "Team T1",
        available: true,
        holes: holes(0).map((hole) => ({ ...hole, netToPar: 0 })),
        netTotals: { total: 72, toPar: 0, frontNine: 36, backNine: 36 },
      },
      {
        side: 2,
        type: "BEST_BALL_NET",
        teamId: "T2",
        name: "Team T2",
        available: true,
        holes: holes(1).map((hole) => ({ ...hole, netToPar: 1 })),
        netTotals: { total: 90, toPar: 18, frontNine: 45, backNine: 45 },
      },
    ],
    holeWinners: [],
  };
  cards.filter((card) => card.format === "BB").forEach((card) => {
    card.matchNetScoring = matchNetScoring;
  });
  return cards;
}

test("individual and team records use separate source pools", () => {
  const catalog = buildScorecardRecordLeaderboards(fixtures());
  assert.ok(catalog.groups.individual.every((record) =>
    record.entries.every((entry) => entry.entityType === "PLAYER")
  ));
  assert.ok(catalog.groups.team.every((record) =>
    record.entries.every((entry) => entry.entityType === "TEAM_PERFORMANCE")
  ));
});

test("Scramble and Best Ball entries retain team and golfer identities", () => {
  const catalog = buildScorecardRecordLeaderboards(fixtures());
  const scrambleWinner = catalog.bySlug["lowest-scramble-round"].winners[0];
  const bestBallWinner = catalog.bySlug["lowest-best-ball-team-round"].winners[0];

  assert.equal(scrambleWinner.teamName, "Team T1");
  assert.deepEqual(scrambleWinner.playerNames, ["Player P1", "Player P2"]);
  assert.equal(bestBallWinner.teamName, "Team T1");
  assert.deepEqual(bestBallWinner.playerNames, ["Player P1", "Player P2"]);
  assert.equal(bestBallWinner.value, 72);
});

test("leaderboards omit invalid metrics, retain all eligible rows, and competition-rank ties", () => {
  const cards = fixtures();
  cards.push({ ...individual({ playerId: "P5", side: 1, matchId: "MISSING" }), total: null });
  const record = buildScorecardRecordLeaderboards(cards).bySlug["most-individual-birdies"];
  const rows = scorecardLeaderboardRows(record);
  const ranked = addTournamentRanks(rows, "value");

  assert.equal(rows.length, 5);
  assert.equal(ranked[0].tournamentRank, "T1");
  assert.equal(ranked[1].tournamentRank, "T1");
  assert.ok(rows.every((row) => Number.isFinite(row.value)));
});
