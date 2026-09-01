import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildPlayerIntelligence } from "../lib/player-intelligence.js";
import {
  buildCanonicalRecordHolderAuthority,
  recordEntryPlayerIds,
} from "../lib/record-holder-authority.js";

const pars = Array.from({ length: 18 }, (_, index) =>
  index % 3 === 0 ? 3 : index % 3 === 1 ? 4 : 5
);
const holes = (adjustment = 0) => pars.map((par, index) => ({
  holeNumber: index + 1,
  par,
  score: par + adjustment,
  toPar: adjustment,
  netScore: par + adjustment,
}));

function winnerRows(sequence) {
  return sequence.map((winnerSide, index) => ({
    holeNumber: index + 1,
    winnerSide: ["A", "B"].includes(winnerSide) ? winnerSide : undefined,
    winnerType: winnerSide === "H" ? "HALVED" : "PLAYER",
  }));
}

function singlesMatch(sequence, matchId = "M1") {
  const matchNetScoring = {
    rows: [
      { side: 1, teamId: "T1", name: "Side One" },
      { side: 2, teamId: "T2", name: "Side Two" },
    ],
    holeWinners: winnerRows(sequence),
  };
  return [
    {
      matchId,
      year: 2025,
      round: 1,
      format: "SI",
      courseId: "C1",
      courseName: "Test Course",
      status: "COMPLETE",
      completedHoleCount: 18,
      scoreType: "INDIVIDUAL",
      playerId: "P1",
      playerName: "Player One",
      playerSlug: "player-one",
      participantPlayerIds: ["P1"],
      participantNames: ["Player One"],
      side: 1,
      sideTeamId: "T1",
      holes: holes(),
      total: 72,
      totalToPar: 0,
      frontNine: 36,
      backNine: 36,
      netTotals: { total: 72 },
      matchNetScoring,
    },
    {
      matchId,
      year: 2025,
      round: 1,
      format: "SI",
      courseId: "C1",
      courseName: "Test Course",
      status: "VERIFIED",
      completedHoleCount: 18,
      scoreType: "INDIVIDUAL",
      playerId: "P2",
      playerName: "Player Two",
      playerSlug: "player-two",
      participantPlayerIds: ["P2"],
      participantNames: ["Player Two"],
      side: 2,
      sideTeamId: "T2",
      holes: holes(1),
      total: 90,
      totalToPar: 18,
      frontNine: 45,
      backNine: 45,
      netTotals: { total: 90 },
      matchNetScoring,
    },
  ];
}

function scramble(teamId, playerIds, adjustment) {
  const cardHoles = holes(adjustment);
  return {
    matchId: `SC-${teamId}`,
    year: 2025,
    round: 2,
    format: "SC",
    courseId: "C2",
    courseName: "Scramble Course",
    status: "COMPLETE",
    completedHoleCount: 18,
    scoreType: "TEAM",
    teamId,
    teamName: `Team ${teamId}`,
    participantPlayerIds: playerIds,
    participantNames: playerIds.map((id) => `Player ${id}`),
    holes: cardHoles,
    total: cardHoles.reduce((sum, hole) => sum + hole.score, 0),
    totalToPar: adjustment * 18,
    frontNine: cardHoles.slice(0, 9).reduce((sum, hole) => sum + hole.score, 0),
    backNine: cardHoles.slice(9).reduce((sum, hole) => sum + hole.score, 0),
  };
}

function officialLeaderboard() {
  return {
    slug: "career-points",
    title: "Career Points",
    direction: "highest",
    columns: [{ key: "points", label: "Points", numeric: true }],
    rows: [
      { id: "P1", name: "Player One", points: 10 },
      { id: "P2", name: "Player Two", points: 10 },
      { id: "P3", name: "Player Three", points: 8 },
    ],
  };
}

const officialRecordSlugs = [
  "career-points",
  "match-wins",
  "win-percentage",
  "championships",
  "appearances",
  "points-per-match",
  "points-per-appearance",
  "average-handicap",
  "sandbagger-of-the-year",
  "best-ball",
  "scramble",
  "singles",
];

function completeOfficialInventory() {
  return officialRecordSlugs.map((slug) => ({
    ...officialLeaderboard(),
    slug,
    title: slug,
    direction: slug === "average-handicap" ? "lowest" : "highest",
  }));
}

function emptyRecord() {
  return { wins: 0, losses: 0, halves: 0, matches: 0, points: 0 };
}

function playerStats() {
  return {
    records: {
      overall: emptyRecord(),
      BB: emptyRecord(),
      SC: emptyRecord(),
      SI: emptyRecord(),
    },
    percentages: { overall: 0, BB: 0, SC: 0, SI: 0 },
    appearances: [],
    championships: [],
    careerTimeline: [],
    seasons: [],
  };
}

test("canonical holder authority respects official ties, team membership, and non-holders", () => {
  const authority = buildCanonicalRecordHolderAuthority({
    officialLeaderboards: completeOfficialInventory(),
    scorecards: [
      scramble("T1", ["P1", "P2"], -1),
      scramble("T2", ["P3", "P4"], 0),
    ],
  });

  assert.deepEqual(
    authority.bySlug["career-points"].holderPlayerIds,
    ["P1", "P2"]
  );
  assert.deepEqual(
    authority.bySlug["lowest-scramble-round"].holderPlayerIds,
    ["P1", "P2"]
  );
  assert.equal(
    authority.recordsHeldForPlayer("P3").some((record) =>
      record.slug === "career-points" || record.slug === "lowest-scramble-round"
    ),
    false
  );
});

test("zero and missing qualifying values cannot create record holders", () => {
  const authority = buildCanonicalRecordHolderAuthority({
    scorecards: singlesMatch(Array(18).fill("H")),
  });

  assert.deepEqual(
    authority.bySlug["most-individual-eagles"].holderPlayerIds,
    []
  );
  assert.deepEqual(
    authority.bySlug["career-most-eagles"].holderPlayerIds,
    []
  );
  assert.equal(
    authority.recordsHeldForPlayer("P1").some((record) =>
      record.slug.includes("eagles")
    ),
    false
  );
});

test("every player-addressable record has complete holder-set parity", () => {
  const authority = buildCanonicalRecordHolderAuthority({
    officialLeaderboards: completeOfficialInventory(),
    scorecards: [
      ...singlesMatch([
        "A", "A", "A", "H", "B", "B", "B", "B", "H",
        "B", "A", "H", "B", "H", "A", "B", "H", "H",
      ]),
      scramble("T3", ["P3", "P4"], -1),
    ],
  });
  const playerIds = ["P1", "P2", "P3", "P4", "P5"];

  assert.equal(authority.records.length, 62);
  assert.equal(
    authority.records.filter((record) => record.playerAddressable).length,
    58
  );

  for (const record of authority.records.filter((item) => item.playerAddressable)) {
    const canonicalHolders = new Set(record.winners.flatMap(recordEntryPlayerIds));
    for (const playerId of playerIds) {
      const careerHolds = authority.recordsHeldForPlayer(playerId)
        .some((item) => item.slug === record.slug);
      assert.equal(
        careerHolds,
        canonicalHolders.has(playerId),
        `${playerId} / ${record.slug}`
      );
    }
  }
});

test("Career presentation scorecards cannot independently confer holder status", () => {
  const canonicalCards = singlesMatch([
    "B", "B", "B", "H", "A", "A", "A", "A", "H",
    "A", "B", "H", "A", "H", "B", "A", "H", "H",
  ]);
  const careerPresentationCards = singlesMatch([
    "A", "A", "A", "H", "B", "B", "B", "B", "H",
    "B", "A", "H", "B", "H", "A", "B", "H", "H",
  ]);
  const authority = buildCanonicalRecordHolderAuthority({ scorecards: canonicalCards });
  const stats = playerStats();
  const allPlayerStats = ["P1", "P2"].map((id) => ({
    player: { "Player ID": id, "Display Name": `Player ${id}` },
    stats,
  }));
  const officialRecords = {
    all: allPlayerStats,
    points: allPlayerStats,
    wins: allPlayerStats,
    percentage: [],
  };
  const intelligence = buildPlayerIntelligence({
    playerId: "P1",
    stats,
    allPlayerStats,
    officialRecords,
    scorecards: careerPresentationCards,
    recordsHeld: authority.recordsHeldForPlayer("P1"),
  });

  assert.equal(intelligence.progression.largestLeadBlown, 3);
  assert.equal(
    intelligence.recordsHeld.some((record) => record.slug === "largest-lead-blown"),
    false
  );
  assert.equal(
    authority.recordsHeldForPlayer("P2")
      .some((record) => record.slug === "largest-lead-blown"),
    true
  );
});

test("Player and Records consumers use the shared authority, with old Career holder logic absent", async () => {
  const [playerPage, playerIntelligence, recordsPage, recordDetail] = await Promise.all([
    readFile(new URL("../app/players/[slug]/page.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/player-intelligence.js", import.meta.url), "utf8"),
    readFile(new URL("../app/records/page.js", import.meta.url), "utf8"),
    readFile(new URL("../app/records/[slug]/page.js", import.meta.url), "utf8"),
  ]);

  assert.match(playerPage, /buildCanonicalRecordHolderAuthority/);
  assert.match(playerPage, /recordAuthority\.recordsHeldForPlayer/);
  assert.doesNotMatch(playerIntelligence, /currentRecordHolders|buildScorecardRecordLeaderboards/);
  assert.match(recordsPage, /buildCanonicalRecordHolderAuthority/);
  assert.match(recordDetail, /buildScorecardRecordLeaderboard/);
  assert.match(recordDetail, /buildMatchProgressionAnalytics/);
  assert.doesNotMatch(recordDetail, /buildCanonicalRecordHolderAuthority/);
});
