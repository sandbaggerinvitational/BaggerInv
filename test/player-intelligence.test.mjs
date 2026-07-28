import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildPlayerIntelligence } from "../lib/player-intelligence.js";
import { buildGhostMatchExclusionSet } from "../lib/ghost-match.js";

const holes = (offset = 0) => Array.from({ length: 18 }, (_, index) => {
  const par = index % 3 === 0 ? 3 : index % 3 === 1 ? 4 : 5;
  const score = par + ((index + offset) % 5 === 0 ? -1 : 0);
  return {
    holeNumber: index + 1,
    par,
    score,
    toPar: score - par,
    netScore: score - (index < 4 ? 1 : 0),
  };
});

const holeWinners = Array.from({ length: 18 }, (_, index) => ({
  holeNumber: index + 1,
  winnerSide: index < 5 ? "A" : index < 12 ? "B" : undefined,
  winnerType: index >= 12 ? "HALVED" : "PLAYER",
}));

function scorecard(playerId, side, offset = 0) {
  const scoringHoles = holes(offset);
  return {
    matchId: "2025-R1-1",
    year: 2025,
    round: 1,
    format: "SI",
    status: "COMPLETE",
    completedHoleCount: 18,
    scoreType: "INDIVIDUAL",
    playerId,
    playerName: `Player ${playerId}`,
    participantPlayerIds: [playerId],
    participantNames: [`Player ${playerId}`],
    side,
    sideTeamId: `T${side}`,
    teamId: `T${side}`,
    teamName: `Team ${side}`,
    courseId: "C1",
    courseName: "Test Course",
    holes: scoringHoles,
    total: scoringHoles.reduce((sum, hole) => sum + hole.score, 0),
    totalToPar: scoringHoles.reduce((sum, hole) => sum + hole.toPar, 0),
    frontNine: scoringHoles.slice(0, 9).reduce((sum, hole) => sum + hole.score, 0),
    backNine: scoringHoles.slice(9).reduce((sum, hole) => sum + hole.score, 0),
    netTotals: {
      total: scoringHoles.reduce((sum, hole) => sum + hole.netScore, 0),
    },
    matchNetScoring: {
      rows: [
        { side: 1, teamId: "T1", name: "Team 1" },
        { side: 2, teamId: "T2", name: "Team 2" },
      ],
      holeWinners,
    },
  };
}

const record = (wins, losses, halves, points) => ({
  wins,
  losses,
  halves,
  points,
  matches: wins + losses + halves,
});

function playerRow(id, points, wins) {
  const overall = record(wins, 1, 0, points);
  const stats = {
    records: {
      overall,
      BB: record(0, 0, 0, 0),
      SC: record(0, 0, 0, 0),
      SI: overall,
    },
    percentages: { overall: 75, BB: 0, SC: 0, SI: 75 },
    appearances: [2025],
    championships: id === "P1" ? [2025] : [],
    careerTimeline: [{
      year: 2025,
      attended: true,
      result: id === "P1" ? "Champion" : "Runner-Up",
    }],
    seasons: [{
      year: 2025,
      teamName: id === "P1" ? "The Pickles" : "Lipp it and Rip it",
      teamLogo: id === "P1" ? "pickles.png" : "lipp.png",
      teamColor: id === "P1" ? "#0b4335" : "#9a7422",
      teamResolved: true,
      overall,
      BB: record(0, 0, 0, 0),
      SC: record(0, 0, 0, 0),
      SI: overall,
    }],
  };
  return {
    player: {
      "Player ID": id,
      "Display Name": `Player ${id}`,
      slug: `player-${id.toLowerCase()}`,
    },
    stats,
  };
}

function records(all) {
  const byPoints = [...all].sort((a, b) =>
    b.stats.records.overall.points - a.stats.records.overall.points
  );
  const byWins = [...all].sort((a, b) =>
    b.stats.records.overall.wins - a.stats.records.overall.wins
  );
  return {
    all,
    points: byPoints,
    wins: byWins,
    percentage: [...all],
    championships: [...all],
    appearances: [...all],
  };
}

test("player intelligence combines official, scoring, progression, rankings, formats, and history", () => {
  const all = [playerRow("P1", 4, 3), playerRow("P2", 2, 1)];
  const intelligence = buildPlayerIntelligence({
    playerId: "P1",
    stats: all[0].stats,
    allPlayerStats: all,
    officialRecords: records(all),
    scorecards: [scorecard("P1", 1), scorecard("P2", 2, 2)],
  });

  assert.equal(intelligence.official.recordDisplay, "3-1-0");
  assert.equal(intelligence.official.championships, 1);
  assert.equal(intelligence.hole.sample.completeScorecards, 1);
  assert.equal(intelligence.progression.largestLeadHeld, 5);
  assert.equal(intelligence.progression.closingRecord, "0-0-3");
  assert.equal(intelligence.rankings.careerPoints, 1);
  assert.equal(intelligence.tournamentHistory[0].year, 2025);
  assert.equal(intelligence.tournamentHistory[0].teamName, "The Pickles");
  assert.equal(intelligence.tournamentHistory[0].teamLogo, "pickles.png");
  assert.equal(intelligence.formats[0].code, "SI");
  assert.ok(intelligence.recordsHeld.some((item) => item.slug === "career-points"));
});

test("Ghost Match exclusions preserve scoring intelligence and suppress negative progression credit", () => {
  const all = [playerRow("P1", 4, 3), playerRow("P2", 2, 1)];
  const intelligence = buildPlayerIntelligence({
    playerId: "P1",
    stats: all[0].stats,
    allPlayerStats: all,
    officialRecords: records(all),
    scorecards: [scorecard("P1", 1), scorecard("P2", 2, 2)],
    ghostMatchExclusions: buildGhostMatchExclusionSet([
      { "Match ID": "2025-R1-1", "Player ID": "P1" },
    ]),
  });

  assert.equal(intelligence.hole.totalHolesPlayed, 18);
  assert.ok(intelligence.hole.birdies > 0);
  assert.equal(intelligence.progression.largestLeadBlown, 0);
  assert.equal(intelligence.progression.mostConsecutiveHolesLost, 0);
});

test("player intelligence UI uses dense cards, year-specific teams, finish treatments, and compact missing scores", async () => {
  const [component, profileCss, statsCss, dataHealth] = await Promise.all([
    readFile(new URL("../app/players/[slug]/PlayerIntelligenceSections.js", import.meta.url), "utf8"),
    readFile(new URL("../app/historical.module.css", import.meta.url), "utf8"),
    readFile(new URL("../app/scoring-stats.module.css", import.meta.url), "utf8"),
    readFile(new URL("../app/data-health/page.js", import.meta.url), "utf8"),
  ]);

  assert.match(component, /<ScoringStatGrid dense/);
  assert.match(component, /playerTournamentHistoryHead/);
  assert.match(component, /data-label="Finish"/);
  assert.match(component, /TeamLogoPlate/);
  assert.match(component, /playerTournamentTeam/);
  assert.match(component, /upcoming \|\| season\.averageScore === null[\s\S]*\? "—"/);
  assert.match(component, /data-finish=\{finishKey\}/);
  assert.match(profileCss, /\.playerRankingList strong[\s\S]*var\(--tsi-gold-600\)/);
  assert.match(profileCss, /\.playerTournamentHistory span[\s\S]*var\(--tsi-gold-600\)/);
  assert.match(profileCss, /--history-team-color/);
  assert.match(profileCss, /data-finish="champion"/);
  assert.match(statsCss, /\.dense \.card\{min-height:112px;padding:13px 15px/);
  assert.match(dataHealth, /unresolvedHistoricalRosterTeams/);
  assert.match(dataHealth, /Every historical roster assignment resolves to its year-specific team/);
});
