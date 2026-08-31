import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import historicalData from "../lib/historical-data.json" with { type: "json" };
import { createHistoricalStatsModel } from "../lib/stats.js";

import {
  MOBILE_PASSPORT_LIMITS,
  mobilePassportDataFromCanonical,
  mobilePassportRepresentationRevision,
  mobilePassportResult,
} from "../lib/mobile-v1-passport.js";
import { assertMobileV1Schema } from "./support/mobile-v1-schema-validator.mjs";

const now = new Date("2026-09-25T18:00:00.000Z");
const identity = {
  playerId: "P1",
  tournamentId: "2026",
  displayName: "Player One",
  authUserId: "must-not-appear-auth-uuid",
  context: {
    membership: { active: true },
    team: { id: "T1", name: "Pickles" },
    privateEmail: "must-not-appear@example.test",
  },
};

const record = (overrides = {}) => ({
  wins: 2,
  losses: 1,
  halves: 1,
  matches: 4,
  points: 2.5,
  recordedPointMatches: 4,
  ...overrides,
});

function stats(playerId = "P1") {
  const overall = record(playerId === "P1" ? {} : { wins: 1, losses: 2, points: 1 });
  return {
    records: {
      overall,
      BB: record({ wins: 1, losses: 0, halves: 0, matches: 1, points: 1, recordedPointMatches: 1 }),
      SC: record({ wins: 0, losses: 1, halves: 0, matches: 1, points: 0, recordedPointMatches: 1 }),
      SI: record({ wins: 1, losses: 0, halves: 1, matches: 2, points: 1.5, recordedPointMatches: 2 }),
    },
    percentages: { overall: 62.5, BB: 100, SC: 0, SI: 75 },
    appearances: [2025, 2026],
    championships: playerId === "P1" ? [2025] : [],
    sandbaggerOfYearYears: playerId === "P1" ? [2025] : [],
    pointsChampionYears: playerId === "P1" ? [2025] : [],
    averageHandicap: playerId === "P1" ? 8.25 : 10,
    seasons: [{
      year: 2025,
      teamSide: "Team 1",
      teamName: "Pickles",
      teamLogo: "pickles.svg",
      teamColor: "#123456",
      teamResolved: true,
      handicap: 8.5,
      overall,
      BB: record(), SC: record(), SI: record(),
    }, {
      year: 2026,
      teamSide: "Team 1",
      teamName: "Pickles",
      teamLogo: "pickles.svg",
      teamColor: "#123456",
      teamResolved: true,
      handicap: 8,
      overall: record({ wins: 0, losses: 0, halves: 0, matches: 0, points: 0, recordedPointMatches: 0 }),
      BB: record(), SC: record(), SI: record(),
    }],
    careerTimeline: [
      { year: 2025, attended: true, teamSide: "Team 1", teamName: "Pickles", result: "Champion" },
      { year: 2026, attended: true, teamSide: "Team 1", teamName: "Pickles", result: "Upcoming" },
    ],
    partners: playerId === "P1" ? [{
      player: { "Player ID": "P2", "Display Name": "A Partner With A Long Name" },
      record: record({ wins: 1, losses: 0, halves: 1, matches: 2, points: 1.5, recordedPointMatches: 2 }),
      percentage: 75,
    }] : [],
    opponents: [],
    biggestRival: playerId === "P1" ? {
      player: { "Player ID": "P2", "Display Name": "Player Two" },
      record: record({ wins: 1, losses: 1, halves: 1, matches: 3, points: 1.5, recordedPointMatches: 3 }),
    } : null,
  };
}

function officialRecords() {
  const all = [
    { player: { "Player ID": "P1", "Display Name": "Player One" }, stats: stats("P1") },
    { player: { "Player ID": "P2", "Display Name": "Player Two" }, stats: stats("P2") },
  ];
  return {
    all,
    points: all,
    wins: all,
    losses: all,
    halves: all,
    matches: all,
    championships: all,
    soy: all,
    appearances: all,
    percentage: all,
    pointsPerMatch: all,
    pointsPerAppearance: all,
    averageHandicap: all,
    byFormat: { BB: all, SC: all, SI: all },
  };
}

function officialRecordsFor(primaryStats) {
  const all = [{ player: { "Player ID": "P1", "Display Name": "Player One" }, stats: primaryStats }];
  return {
    all,
    points: all,
    wins: all,
    losses: all,
    halves: all,
    matches: all,
    championships: all,
    soy: all,
    appearances: all,
    percentage: all,
    pointsPerMatch: all,
    pointsPerAppearance: all,
    averageHandicap: all,
    byFormat: { BB: all, SC: all, SI: all },
  };
}

function emptyStats() {
  const empty = record({ wins: 0, losses: 0, halves: 0, matches: 0, points: 0, recordedPointMatches: 0 });
  return {
    records: { overall: { ...empty }, BB: { ...empty }, SC: { ...empty }, SI: { ...empty } },
    percentages: { overall: 0, BB: 0, SC: 0, SI: 0 },
    appearances: [],
    championships: [],
    sandbaggerOfYearYears: [],
    pointsChampionYears: [],
    averageHandicap: null,
    seasons: [],
    careerTimeline: [],
    partners: [],
    opponents: [],
    biggestRival: null,
  };
}

function emptyHistory(format) {
  return {
    format,
    matches: [],
    years: [],
    record: record({ wins: 0, losses: 0, halves: 0, matches: 0, points: 0, recordedPointMatches: 0 }),
    expectedRecord: record({ wins: 0, losses: 0, halves: 0, matches: 0, points: 0, recordedPointMatches: 0 }),
    consistent: true,
    firstYear: null,
    latestYear: null,
  };
}

function matchHistory(format) {
  const match = {
    id: `2025-${format}-1`,
    year: 2025,
    round: format === "BB" ? 1 : format === "SC" ? 2 : 3,
    format,
    matchNumber: 1,
    partner: format === "SI" ? [] : [{ id: "P2", name: "Player Two" }],
    opponents: [{ id: "P3", name: "Player Three" }, { id: "P4", name: "Player Four" }],
    team: { id: "T1", side: "Team 1", name: "Pickles", resolved: true },
    opposingTeam: { id: "T2", side: "Team 2", name: "Rippers", resolved: true },
    winner: "Pickles",
    winnerSide: 1,
    outcome: "win",
    course: { id: "C1", name: "Ocean Course" },
    segments: [{ label: "Overall", winner: "Pickles", side: 1 }],
    href: "/must-not-appear",
    issues: ["must-not-appear"],
  };
  return {
    format,
    matches: [match],
    years: [{ year: 2025, matches: [match] }],
    record: record(),
    expectedRecord: record(),
    consistent: true,
    firstYear: 2025,
    latestYear: 2025,
  };
}

function calculations() {
  const records = officialRecords();
  return {
    getPlayerMap: () => ({
      P1: {
        "Player ID": "P1",
        "Display Name": "Player One",
        "First Year": "2025",
        "Last Year": "Present",
        "Photo Filename": "player-one.webp",
        active: true,
        boardOfGovernors: true,
        handicapCommittee: false,
      },
      P2: { "Player ID": "P2", "Display Name": "Player Two", active: true },
    }),
    getRecords: () => records,
    getPlayerFormatMatchHistory: () => ({ BB: matchHistory("BB"), SC: matchHistory("SC"), SI: matchHistory("SI") }),
    getCaptainLegacy: () => ({
      seasons: [{ year: 2025, teamSide: "Team 1", teamName: "Pickles", result: "Champion" }],
      record: record({ wins: 1, losses: 0, halves: 0, matches: 1, points: 0, recordedPointMatches: 0 }),
      championships: 1,
    }),
    getTournament: (year) => ({ id: String(year), year, teams: [{ id: "T1", name: "Pickles" }] }),
    getTournamentPlayerLeaderboard: () => [
      { id: "P1", points: 2.5, wins: 2 },
      { id: "P2", points: 1, wins: 1 },
    ],
  };
}

function secondaryHistory() {
  return {
    source: "supabase",
    calculations: calculations(),
    scorecardAnalytics: {
      canonicalCareerScorecards: [],
      ghostMatchExclusions: new Set(),
    },
    diagnostics: { privateSource: "must-not-appear" },
  };
}

function leaders() {
  const finalMatch = {
    id: "2026-R1-1",
    status: "Final",
    archiveFinal: true,
    finalizedAt: "2026-09-25T17:00:00.000Z",
    team1Players: [{ id: "P1" }, { id: "P2" }],
    team2Players: [{ id: "P3" }, { id: "P4" }],
    team1Points: 2,
    team2Points: 1,
    matchupWinner: "Team 1",
    expectedRoundMatchCount: 1,
    pointsAvailable: 3,
  };
  return {
    tournament: {
      id: "2026",
      year: 2026,
      name: "Bagger Invitational",
      status: "Live",
      currentRound: 2,
      teamOne: { id: "T1", name: "Pickles", score: 2 },
      teamTwo: { id: "T2", name: "Rippers", score: 1 },
    },
    players: [
      { id: "P1", name: "Player One", photo: "player-one.webp", teamSide: 1, tournamentHandicap: 8 },
      { id: "P2", name: "Player Two", teamSide: 1, tournamentHandicap: 9 },
    ],
    rounds: [{ number: 1, format: "BB", status: "Final", matches: [finalMatch] },
      { number: 2, format: "SC", status: "Upcoming", matches: [] }],
    currentMatchLifecycle: [{ round: 1, matches: [{ id: "2026-R1-1", status: "Final", playerIds: ["P1", "P2", "P3", "P4"] }] }],
    scoreLeaderboard: [{ id: "P1", round: 1, entityType: "PLAYER", holes: 18, gross: 74, net: 70, netToPar: -2 }],
    roundLeaderboards: { 1: [{ id: "P1", points: 1.5 }], 2: [] },
    leaderboard: [{
      id: "P1", player: "Player One", team: "Pickles", teamSide: 1,
      wins: 1, losses: 0, halves: 0, matchesPlayed: 1, points: 1.5,
    }],
    slotVerification: { pass: true },
    revision: "leaders-revision",
    privateRows: ["must-not-appear"],
  };
}

function drafts() {
  return [{
    state: "complete",
    year: 2025,
    picks: [{
      pickNumber: 3,
      player: { id: "P1", name: "Player One" },
      team: { id: "T1", name: "Pickles", primaryColor: "#123456" },
    }],
  }];
}

function heldRecordLeaderboard() {
  return [{
    slug: "career-points",
    title: "Career Points",
    direction: "highest",
    columns: [{ key: "points", numeric: true }],
    rows: [{ id: "P1", name: "Player One", points: 2.5 }, { id: "P2", name: "Player Two", points: 2.5 }],
  }];
}

function buildData(overrides = {}) {
  return mobilePassportDataFromCanonical({
    identity,
    secondaryHistory: secondaryHistory(),
    leaders: leaders(),
    drafts: drafts(),
    officialLeaderboards: heldRecordLeaderboard(),
    ...overrides,
  });
}

test("Passport maps the exact participant into a bounded current-and-career aggregate", async () => {
  const data = buildData();
  assert.equal(data.contractVersion, "mobile-passport-v1");
  assert.equal(data.player.playerId, "P1");
  assert.equal(data.player.displayName, "Player One");
  assert.equal(data.player.team.teamId, "T1");
  assert.equal(data.player.careerYears.lastYear, 2026);
  assert.equal(data.currentTournament.tournamentId, "2026");
  assert.equal(data.currentTournament.record.points, 1.5);
  assert.equal(data.currentTournament.rounds[0].format, "BB");
  assert.equal(data.currentTournament.rounds[0].status, "completed");
  assert.equal(data.currentTournament.rounds[1].gross, null);
  assert.deepEqual(data.career.honors.championshipYears, [2025]);
  assert.equal(data.career.tournamentHistory[0].result, "champion");
  assert.equal(data.career.tournamentHistory[1].points, null);
  assert.deepEqual(data.career.formatPerformance.map((row) => row.format).sort(), ["BB", "SC", "SI"]);
  assert.equal(data.career.formatPerformance[0].matches[0].href, undefined);
  assert.deepEqual(data.career.recordsHeld, [{ recordId: "career-points", title: "Career Points" }]);
  assert.equal(data.career.captainLegacy.championships, 1);
  assert.equal(data.career.biggestRival.player.playerId, "P2");
  assert.equal(data.career.draftHistory[0].pick, 3);
  assert.equal(data.career.topPartners[0].player.playerId, "P2");
  assert.equal(data.career.holePerformance.sample.completeScorecards, 0);
  assert.ok(Buffer.byteLength(JSON.stringify(data), "utf8") < MOBILE_PASSPORT_LIMITS.responseBytes);
  const serialized = JSON.stringify(data);
  for (const forbidden of ["must-not-appear", "authUserId", "privateEmail", "canonicalCareerScorecards", "rawScorecard", "href", "issues"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  const revision = mobilePassportRepresentationRevision(data);
  await assertMobileV1Schema("passport", {
    ok: true,
    apiVersion: "v1",
    data,
    meta: { generatedAt: now.toISOString(), revision },
  });
});

test("missing career points remain null rather than becoming an authoritative zero", () => {
  const data = buildData();
  const future = data.career.tournamentHistory.find((row) => row.year === 2026);
  assert.equal(future.record.recordedPointMatches, 0);
  assert.equal(future.record.points, null);
  assert.equal(future.points, null);
  assert.equal(data.career.captainLegacy.record.points, null);
});

test("a new participant receives intentional empty career modules, not fabricated history", () => {
  const history = secondaryHistory();
  const freshStats = emptyStats();
  const freshRecords = officialRecordsFor(freshStats);
  history.calculations.getPlayerMap = () => ({
    P1: {
      "Player ID": "P1",
      "Display Name": "New Player",
      "First Year": "",
      "Last Year": "Present",
      "Photo Filename": "",
      active: true,
      boardOfGovernors: false,
      handicapCommittee: false,
    },
  });
  history.calculations.getRecords = () => freshRecords;
  history.calculations.getPlayerFormatMatchHistory = () => ({
    BB: emptyHistory("BB"), SC: emptyHistory("SC"), SI: emptyHistory("SI"),
  });
  history.calculations.getCaptainLegacy = () => ({
    seasons: [],
    record: freshStats.records.overall,
    championships: 0,
  });
  history.calculations.getTournament = (year) => ({ id: String(year), year });
  history.calculations.getTournamentPlayerLeaderboard = () => [];

  const freshLeaders = leaders();
  freshLeaders.players = freshLeaders.players.map((player) => player.id === "P1"
    ? { ...player, name: "New Player", photo: "" }
    : player);
  const data = buildData({
    secondaryHistory: history,
    leaders: freshLeaders,
    drafts: [],
    officialLeaderboards: [],
  });
  assert.equal(data.player.displayName, "New Player");
  assert.deepEqual(data.player.careerYears, { firstYear: null, lastYear: null, current: true });
  assert.equal(data.player.portraitAssetKey, null);
  assert.deepEqual(data.career.tournamentHistory, []);
  assert.deepEqual(data.career.recordsHeld, []);
  assert.deepEqual(data.career.captainLegacy.seasons, []);
  assert.equal(data.career.biggestRival, null);
  assert.deepEqual(data.career.draftHistory, []);
  assert.deepEqual(data.career.topPartners, []);
  assert.ok(data.career.formatPerformance.every((format) => format.matches.length === 0));
});

test("canonical bounds accept long careers and names but reject oversized modules", () => {
  const history = secondaryHistory();
  const manyStats = emptyStats();
  manyStats.appearances = Array.from({ length: 64 }, (_, index) => 2000 + index);
  manyStats.seasons = manyStats.appearances.map((year) => ({
    year,
    teamSide: "Team 1",
    teamName: "A".repeat(160),
    teamLogo: "",
    teamColor: "#123456",
    teamResolved: true,
    handicap: null,
    overall: { ...manyStats.records.overall },
    BB: { ...manyStats.records.BB },
    SC: { ...manyStats.records.SC },
    SI: { ...manyStats.records.SI },
  }));
  manyStats.careerTimeline = manyStats.appearances.map((year) => ({
    year, attended: true, teamSide: "Team 1", teamName: "A".repeat(160), result: "Completed",
  }));
  const manyRecords = officialRecordsFor(manyStats);
  history.calculations.getPlayerMap = () => ({
    P1: {
      "Player ID": "P1", "Display Name": "N".repeat(160), "First Year": 2000,
      "Last Year": "Present", active: true, boardOfGovernors: false, handicapCommittee: false,
    },
  });
  history.calculations.getRecords = () => manyRecords;
  history.calculations.getPlayerFormatMatchHistory = () => ({
    BB: emptyHistory("BB"), SC: emptyHistory("SC"), SI: emptyHistory("SI"),
  });
  history.calculations.getCaptainLegacy = () => ({ seasons: [], record: manyStats.records.overall, championships: 0 });
  history.calculations.getTournament = (year) => ({ id: String(year), year });
  history.calculations.getTournamentPlayerLeaderboard = () => [];
  const data = buildData({ secondaryHistory: history, drafts: [], officialLeaderboards: [] });
  assert.equal(data.player.displayName.length, 160);
  assert.equal(data.career.tournamentHistory.length, 64);

  const overflowHistory = secondaryHistory();
  const histories = { BB: matchHistory("BB"), SC: emptyHistory("SC"), SI: emptyHistory("SI") };
  histories.BB.matches = Array.from({ length: MOBILE_PASSPORT_LIMITS.formatMatches + 1 }, (_, index) => ({
    ...matchHistory("BB").matches[0], id: `2025-BB-${index + 1}`,
  }));
  overflowHistory.calculations.getPlayerFormatMatchHistory = () => histories;
  assert.throws(
    () => buildData({ secondaryHistory: overflowHistory }),
    (error) => error.code === "MOBILE_API_UNAVAILABLE",
  );
});

test("Passport rejects canonical numeric values outside the direct schema bounds", () => {
  const tooManyHoles = leaders();
  tooManyHoles.scoreLeaderboard[0].holes = 19;
  assert.throws(
    () => buildData({ leaders: tooManyHoles }),
    (error) => error.code === "MOBILE_API_UNAVAILABLE",
  );

  const invalidThroughHole = leaders();
  invalidThroughHole.currentMatchLifecycle[0].matches[0] = {
    ...invalidThroughHole.currentMatchLifecycle[0].matches[0],
    status: "Live",
    currentHole: 19,
  };
  assert.throws(
    () => buildData({ leaders: invalidThroughHole }),
    (error) => error.code === "MOBILE_API_UNAVAILABLE",
  );

  for (const percentageField of ["overall", "BB", "SC", "SI"]) {
    const history = secondaryHistory();
    const invalidStats = stats();
    invalidStats.percentages[percentageField] = 100.01;
    history.calculations.getRecords = () => officialRecordsFor(invalidStats);
    assert.throws(
      () => buildData({ secondaryHistory: history }),
      (error) => error.code === "MOBILE_API_UNAVAILABLE",
      percentageField,
    );
  }
});

test("Passport rejects every schema year path outside 2000 through 2200", () => {
  const invalidCurrentTournament = leaders();
  invalidCurrentTournament.tournament.year = 2201;
  assert.throws(
    () => buildData({ leaders: invalidCurrentTournament }),
    (error) => error.code === "MOBILE_API_UNAVAILABLE",
  );

  const invalidCareerYears = secondaryHistory();
  const originalPlayers = invalidCareerYears.calculations.getPlayerMap();
  invalidCareerYears.calculations.getPlayerMap = () => ({
    ...originalPlayers,
    P1: { ...originalPlayers.P1, "First Year": 1999 },
  });
  assert.throws(
    () => buildData({ secondaryHistory: invalidCareerYears }),
    (error) => error.code === "MOBILE_API_UNAVAILABLE",
  );

  const invalidTournamentHistory = secondaryHistory();
  const invalidTournamentStats = stats();
  invalidTournamentStats.seasons[0].year = 1999;
  invalidTournamentStats.careerTimeline[0].year = 1999;
  invalidTournamentHistory.calculations.getRecords = () => officialRecordsFor(invalidTournamentStats);
  assert.throws(
    () => buildData({ secondaryHistory: invalidTournamentHistory }),
    (error) => error.code === "MOBILE_API_UNAVAILABLE",
  );

  const invalidFormatMatch = secondaryHistory();
  const formatMatches = { BB: matchHistory("BB"), SC: matchHistory("SC"), SI: matchHistory("SI") };
  formatMatches.BB.matches[0].year = 2201;
  invalidFormatMatch.calculations.getPlayerFormatMatchHistory = () => formatMatches;
  assert.throws(
    () => buildData({ secondaryHistory: invalidFormatMatch }),
    (error) => error.code === "MOBILE_API_UNAVAILABLE",
  );

  const invalidFormatYears = secondaryHistory();
  const histories = { BB: matchHistory("BB"), SC: matchHistory("SC"), SI: matchHistory("SI") };
  histories.SC.firstYear = 1999;
  invalidFormatYears.calculations.getPlayerFormatMatchHistory = () => histories;
  assert.throws(
    () => buildData({ secondaryHistory: invalidFormatYears }),
    (error) => error.code === "MOBILE_API_UNAVAILABLE",
  );

  const invalidCaptainYear = secondaryHistory();
  invalidCaptainYear.calculations.getCaptainLegacy = () => ({
    seasons: [{ year: 2201, teamSide: "Team 1", teamName: "Pickles", result: "Champion" }],
    record: record(),
    championships: 1,
  });
  assert.throws(
    () => buildData({ secondaryHistory: invalidCaptainYear }),
    (error) => error.code === "MOBILE_API_UNAVAILABLE",
  );

  const invalidDrafts = drafts();
  invalidDrafts[0].year = 1999;
  assert.throws(
    () => buildData({ drafts: invalidDrafts }),
    (error) => error.code === "MOBILE_API_UNAVAILABLE",
  );

  for (const honorsField of ["championships", "sandbaggerOfYearYears", "pointsChampionYears"]) {
    const history = secondaryHistory();
    const invalidStats = stats();
    invalidStats[honorsField] = [2201];
    history.calculations.getRecords = () => officialRecordsFor(invalidStats);
    assert.throws(
      () => buildData({ secondaryHistory: history }),
      (error) => error.code === "MOBILE_API_UNAVAILABLE",
      honorsField,
    );
  }
});

test("Passport captain results use only the exact schema enum", () => {
  for (const result of ["Champion", "Runner-Up", "Completed", "Upcoming"]) {
    const history = secondaryHistory();
    history.calculations.getCaptainLegacy = () => ({
      seasons: [{ year: 2025, teamSide: "Team 1", teamName: "Pickles", result }],
      record: record(),
      championships: result === "Champion" ? 1 : 0,
    });
    assert.equal(buildData({ secondaryHistory: history }).career.captainLegacy.seasons[0].result, result);
  }

  const invalid = secondaryHistory();
  invalid.calculations.getCaptainLegacy = () => ({
    seasons: [{ year: 2025, teamSide: "Team 1", teamName: "Pickles", result: "Disqualified" }],
    record: record(),
    championships: 0,
  });
  assert.throws(
    () => buildData({ secondaryHistory: invalid }),
    (error) => error.code === "MOBILE_API_UNAVAILABLE",
  );
});

test("Passport honors reject duplicate years instead of violating schema uniqueness", () => {
  const history = secondaryHistory();
  const duplicateStats = stats();
  duplicateStats.championships = [2025, 2025];
  history.calculations.getRecords = () => officialRecordsFor(duplicateStats);
  assert.throws(
    () => buildData({ secondaryHistory: history }),
    (error) => error.code === "MOBILE_API_UNAVAILABLE",
  );
});

test("portrait asset keys are canonical relative identifiers, never paths or URLs", () => {
  for (const malicious of ["../private-key", "images/player.png", "https://example.test/player.png", "player..secret"]) {
    const history = secondaryHistory();
    const original = history.calculations.getPlayerMap();
    history.calculations.getPlayerMap = () => ({
      ...original,
      P1: { ...original.P1, "Photo Filename": malicious },
    });
    assert.throws(
      () => buildData({ secondaryHistory: history }),
      (error) => error.code === "MOBILE_API_UNAVAILABLE",
      malicious,
    );
  }
  const apostrophe = secondaryHistory();
  const original = apostrophe.calculations.getPlayerMap();
  apostrophe.calculations.getPlayerMap = () => ({
    ...original,
    P1: { ...original.P1, "Photo Filename": "cameron-o'reilly-pic" },
  });
  assert.equal(buildData({ secondaryHistory: apostrophe }).player.portraitAssetKey, "cameron-o'reilly-pic");
});

test("the adapter accepts the existing canonical historical model without reimplementing its calculations", () => {
  const calculations = createHistoricalStatsModel(structuredClone(historicalData));
  const actualIdentity = { ...identity, playerId: "CB01", displayName: "Clay Beltran" };
  const actualLeaders = {
    tournament: {
      id: "2026", year: 2026, name: "Bagger Invitational", status: "Live", currentRound: null,
      teamOne: { id: "PICKLES", name: "Pickles" }, teamTwo: { id: "RIPPERS", name: "Rippers" },
    },
    players: [{ id: "CB01", name: "Clay Beltran", teamSide: 1, tournamentHandicap: 8 }],
    rounds: [],
    currentMatchLifecycle: [],
    scoreLeaderboard: [],
    roundLeaderboards: {},
    leaderboard: [],
    slotVerification: { pass: true },
  };
  const data = mobilePassportDataFromCanonical({
    identity: actualIdentity,
    leaders: actualLeaders,
    drafts: [],
    officialLeaderboards: [],
    secondaryHistory: {
      source: "supabase",
      calculations,
      scorecardAnalytics: { canonicalCareerScorecards: [], ghostMatchExclusions: new Set() },
    },
  });
  assert.equal(data.player.playerId, "CB01");
  assert.equal(data.player.careerYears.current, true);
  assert.equal(data.player.careerYears.lastYear, 2026);
  assert.deepEqual(data.career.formatPerformance.map((row) => row.format).sort(), ["BB", "SC", "SI"]);
  assert.ok(data.career.tournamentHistory.length > 0);
  assert.ok(Buffer.byteLength(JSON.stringify(data), "utf8") <= MOBILE_PASSPORT_LIMITS.responseBytes);
});

test("representation ETag is stable across response time and changes with participant-visible data", () => {
  const data = buildData();
  const revision = mobilePassportRepresentationRevision(data);
  assert.match(revision, /^[0-9a-f]{64}$/);
  assert.equal(mobilePassportRepresentationRevision(structuredClone(data)), revision);
  assert.notEqual(mobilePassportRepresentationRevision({
    ...data,
    player: { ...data.player, displayName: "Changed Name" },
  }), revision);
});

test("identity and tournament divergence fail closed without selecting by name or slug", () => {
  assert.throws(
    () => buildData({ identity: { ...identity, playerId: "P999", displayName: "Player One" } }),
    (error) => error.code === "MOBILE_API_UNAVAILABLE",
  );
  assert.throws(
    () => buildData({ identity: { ...identity, tournamentId: "OTHER" } }),
    (error) => error.code === "MOBILE_API_UNAVAILABLE",
  );
  const inactive = secondaryHistory();
  inactive.calculations.getPlayerMap = () => ({ P1: { "Player ID": "P1", "Display Name": "Player One", active: false } });
  assert.throws(
    () => buildData({ secondaryHistory: inactive }),
    (error) => error.code === "MOBILE_API_UNAVAILABLE",
  );
});

test("Passport result enforces all three Supabase selectors and uses injection-safe canonical readers", async () => {
  const stableHistory = secondaryHistory();
  let sharedLeadersPromise;
  const success = await mobilePassportResult(identity, {
    now,
    dependencies: {
      requireSecondaryHistoryReadSource: () => ({ resolved: "supabase" }),
      requireLeaderboardsCoreReadSource: () => ({ resolved: "supabase" }),
      requireDraftReadSource: () => ({ resolved: "supabase" }),
      loadMobileCareerAuthority: async (receivedIdentity, options) => {
        assert.equal(receivedIdentity, identity);
        sharedLeadersPromise = options.leaderboardsRead;
        assert.equal((await sharedLeadersPromise).payload.ok, true);
        return stableHistory;
      },
      readLeaderboardsCoreView: async () => ({ payload: { ok: true, data: {} } }),
      leaderboardsCoreDataFromSupabaseView: () => leaders(),
      getPlayerDrafts: async (playerId, options) => {
        assert.equal(playerId, "P1");
        assert.equal(options.history, stableHistory.calculations);
        return drafts();
      },
      officialLeaderboardsFromRecords: () => heldRecordLeaderboard(),
    },
  });
  assert.equal(success.status, 200);
  assert.equal(success.body.apiVersion, "v1");
  assert.equal(success.body.meta.generatedAt, now.toISOString());
  assert.equal(success.body.meta.revision, success.revision);
  assert.equal(success.body.data.player.playerId, "P1");
  assert.ok(sharedLeadersPromise instanceof Promise);

  for (const selector of [
    "requireSecondaryHistoryReadSource",
    "requireLeaderboardsCoreReadSource",
    "requireDraftReadSource",
  ]) {
    await assert.rejects(
      () => mobilePassportResult(identity, {
        dependencies: {
          requireSecondaryHistoryReadSource: () => ({ resolved: "supabase" }),
          requireLeaderboardsCoreReadSource: () => ({ resolved: "supabase" }),
          requireDraftReadSource: () => ({ resolved: "supabase" }),
          [selector]: () => ({ resolved: "google" }),
        },
      }),
      (error) => error.code === "MOBILE_API_UNAVAILABLE",
    );
  }
});

test("schema and route are strict, auth-only, private-read compatible contracts", async () => {
  const [schemaSource, routeSource, adapterSource] = await Promise.all([
    readFile(new URL("../contracts/mobile/v1/passport.schema.json", import.meta.url), "utf8"),
    readFile(new URL("../app/api/mobile/v1/passport/route.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/mobile-v1-passport.js", import.meta.url), "utf8"),
  ]);
  const schema = JSON.parse(schemaSource);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.data.additionalProperties, false);
  assert.equal(schema.properties.data.properties.contractVersion.const, "mobile-passport-v1");
  assert.equal(schema.$defs.career.additionalProperties, false);
  assert.equal(schema.$defs.id.maxLength, 128);
  assert.match(schema.$defs.id.pattern, /A-Za-z0-9/);
  assert.equal(schema.$defs.player.properties.displayName.maxLength, 160);
  assert.equal(schema.$defs.player.properties.portraitAssetKey.oneOf[1].maxLength, 128);
  assert.match(schema.$defs.player.properties.portraitAssetKey.oneOf[1].pattern, /\\\.\\\./);
  assert.equal(schema.$defs.currentTournament.properties.rounds.maxItems, 18);
  assert.equal(schema.$defs.currentRound.properties.throughHole.maximum, 18);
  assert.equal(schema.$defs.currentRound.properties.holesPlayed.maximum, 18);
  assert.equal(schema.$defs.careerSummary.properties.winPercentage.maximum, 100);
  assert.equal(schema.$defs.holePerformance.properties.birdieRate.maximum, 100);
  assert.equal(schema.$defs.holePerformance.properties.parRate.maximum, 100);
  assert.equal(schema.$defs.holePerformance.properties.bogeyRate.maximum, 100);
  assert.equal(schema.$defs.holePerformance.properties.doubleBogeyOrWorseRate.maximum, 100);
  assert.equal(schema.$defs.year.minimum, 2000);
  assert.equal(schema.$defs.year.maximum, 2200);
  assert.deepEqual(schema.$defs.captainSeason.properties.result.enum, [
    "Champion", "Runner-Up", "Completed", "Upcoming",
  ]);
  assert.equal(schema.$defs.career.properties.tournamentHistory.maxItems, 64);
  assert.equal(schema.$defs.career.properties.recordsHeld.maxItems, 64);
  assert.equal(schema.$defs.career.properties.draftHistory.maxItems, 64);
  assert.equal(schema.$defs.career.properties.topPartners.maxItems, 8);
  assert.equal(schema.$defs.formatPerformance.properties.matches.items.$ref, "#/$defs/formatMatch");
  assert.equal(schema.$defs.formatPerformance.properties.matches.maxItems, 128);
  assert.equal(schema.$defs.career.properties.formatPerformance.minItems, 3);
  assert.equal(schema.$defs.career.properties.formatPerformance.maxItems, 3);
  assert.match(routeSource, /mobileV1ReadResponse/);
  assert.match(routeSource, /mobilePassportResult\(identity\)/);
  for (const forbidden of ["searchParams", "request.json", "cookies", "playerId", "createClient", "supabase"] ) {
    assert.doesNotMatch(routeSource, new RegExp(forbidden, "i"));
  }
  assert.match(adapterSource, /mobile-v1-career-authority\.js/);
  assert.match(adapterSource, /leaderboardsRead: leadersReadPromise/);
  assert.doesNotMatch(adapterSource, /secondary-history-service\.js/);
});
