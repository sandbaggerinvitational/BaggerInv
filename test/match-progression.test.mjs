import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMatchProgressionAnalytics,
  formatMatchPosition,
  matchProgressionLeaderboardRows,
  reconstructMatchProgression,
} from "../lib/match-progression.js";
import { buildGhostMatchExclusionSet } from "../lib/ghost-match.js";

function winners(sequence) {
  return sequence.map((winnerSide, index) => ({
    holeNumber: index + 1,
    winnerSide: ["A", "B"].includes(winnerSide) ? winnerSide : undefined,
    winnerType: winnerSide === "H" ? "HALVED" : "TEAM",
  }));
}

function matchCards(sequence, matchId = "M1") {
  const matchNetScoring = {
    rows: [
      { side: 1, teamId: "T1", name: "The Pickles" },
      { side: 2, teamId: "T2", name: "Lipp it and Rip it" },
    ],
    holeWinners: winners(sequence),
  };
  return [
    {
      matchId,
      year: 2025,
      round: 1,
      matchNumber: 1,
      format: "SI",
      courseId: "C1",
      courseName: "Test Course",
      status: "COMPLETE",
      completedHoleCount: 18,
      scoreType: "INDIVIDUAL",
      side: 1,
      sideTeamId: "T1",
      playerId: "P1",
      playerName: "Player One",
      participantPlayerIds: ["P1"],
      participantNames: ["Player One"],
      matchNetScoring,
    },
    {
      matchId,
      year: 2025,
      round: 1,
      matchNumber: 1,
      format: "SI",
      courseId: "C1",
      courseName: "Test Course",
      status: "VERIFIED",
      completedHoleCount: 18,
      scoreType: "INDIVIDUAL",
      side: 2,
      sideTeamId: "T2",
      playerId: "P2",
      playerName: "Player Two",
      participantPlayerIds: ["P2"],
      participantNames: ["Player Two"],
      matchNetScoring,
    },
  ];
}

const comebackSequence = [
  "A", "A", "A", "H", "B", "B", "B", "B", "H",
  "B", "A", "H", "B", "H", "A", "B", "H", "H",
];

test("reconstructs running position, leads, lead changes, segments, and final margin", () => {
  const match = reconstructMatchProgression(matchCards(comebackSequence));
  assert.equal(match.progression.length, 18);
  assert.equal(match.progression[2].position, 3);
  assert.equal(match.largestLead.A, 3);
  assert.equal(match.largestComeback, 3);
  assert.equal(match.winnerSide, "B");
  assert.equal(match.finalMargin.label, "2 & 1");
  assert.equal(match.leadChanges, 1);
  assert.equal(match.frontNine.A.won, 3);
  assert.equal(match.frontNine.B.won, 4);
  assert.equal(match.closing.B.won, 1);
  assert.equal(formatMatchPosition(0), "All Square");
  assert.equal(formatMatchPosition(-2, "A", "B"), "B 2 Up");
});

test("derives early match-play winning margins", () => {
  const sequence = [
    "A", "A", "A", "A", "B", "A", "H", "A", "H",
    "A", "B", "A", "H", "H", "H", "H", "H", "H",
  ];
  const match = reconstructMatchProgression(matchCards(sequence, "M2"));
  assert.equal(match.finalMargin.winnerSide, "A");
  assert.match(match.finalMargin.label, /^\d+ (?:&|Up)/);
});

test("Ghost Match golfers keep progression credit but are excluded from negative outcomes", () => {
  const exclusions = buildGhostMatchExclusionSet([
    { "Match ID": "M1", "Player ID": "P1" },
  ]);
  const analytics = buildMatchProgressionAnalytics(matchCards(comebackSequence), {
    ghostMatchExclusions: exclusions,
  });
  const playerOne = analytics.player("P1");
  const playerTwo = analytics.player("P2");

  assert.equal(playerOne.largestLeadHeld, 3);
  assert.equal(playerOne.mostLeadChangesExperienced, 1);
  assert.ok(playerOne.frontNine.won > 0);
  assert.equal(playerOne.largestLeadBlown, 0);
  assert.equal(playerOne.mostConsecutiveHolesLost, 0);
  assert.equal(playerTwo.largestComebackCompleted, 3);
  assert.equal(playerTwo.matchesWonAfterTrailing, 1);
  assert.equal(
    analytics.byRecordSlug["largest-lead-blown"].entries.some((entry) =>
      entry.playerIds.includes("P1")
    ),
    false
  );
});

test("every progression record exposes a complete eligible leaderboard", () => {
  const analytics = buildMatchProgressionAnalytics(matchCards(comebackSequence));
  assert.equal(analytics.records.length, 12);
  assert.ok(analytics.records.every((record) => Array.isArray(record.entries)));
  assert.ok(analytics.byRecordSlug["largest-match-victory"].entries.length);
  assert.ok(analytics.byRecordSlug["most-lead-changes"].entries.length);
  assert.equal(
    analytics.byRecordSlug["best-front-nine-match"].title,
    "Most Front-Nine Holes Won in a Match"
  );
  assert.ok(analytics.byRecordSlug["most-consecutive-holes-halved"].entries.every(
    (entry) => entry.value >= 2
  ));
});

test("progression leaderboards present Singles as players and team formats with participants", () => {
  const singles = buildMatchProgressionAnalytics(matchCards(comebackSequence));
  const singlesRows = matchProgressionLeaderboardRows(
    singles.byRecordSlug["best-front-nine-match"]
  );
  assert.ok(singlesRows.every((row) => row.entityType === "PLAYER"));
  assert.ok(singlesRows.every((row) => row.name.startsWith("Player ")));
  assert.ok(singlesRows.every((row) => row.subtitle === ""));

  const bestBallCards = matchCards(comebackSequence, "BB2").map((card, index) => ({
    ...card,
    format: "BB",
    playerId: `BB${index + 1}`,
    playerName: `Best Ball ${index + 1}`,
    participantPlayerIds: [`BB${index + 1}`, `PARTNER${index + 1}`],
    participantNames: [`Best Ball ${index + 1}`, `Partner ${index + 1}`],
  }));
  const bestBall = buildMatchProgressionAnalytics(bestBallCards);
  const teamRows = matchProgressionLeaderboardRows(
    bestBall.byRecordSlug["best-front-nine-match"]
  );
  assert.ok(teamRows.every((row) => row.entityType === "TEAM_PERFORMANCE"));
  assert.ok(teamRows.every((row) => row.name));
  assert.ok(teamRows.every((row) => row.subtitle.includes(" & ")));
});

test("a single halved hole is excluded before progression ranking", () => {
  const sequence = [
    "A", "H", "B", "A", "B", "A", "B", "A", "B",
    "A", "B", "A", "B", "A", "B", "A", "B", "A",
  ];
  const analytics = buildMatchProgressionAnalytics(matchCards(sequence, "ONE-HALVE"));
  const record = analytics.byRecordSlug["most-consecutive-holes-halved"];
  assert.equal(record.entries.length, 0);
  assert.equal(record.winners.length, 0);
  assert.equal(record.emptyState, "No recorded streak of two or more halved holes yet.");
});
