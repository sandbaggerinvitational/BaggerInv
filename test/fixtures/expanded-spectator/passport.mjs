// Isolated canonical golf fixture reused from the certified participant presenter tests.
import {mobilePassportDataFromCanonical} from '../../../lib/mobile-v1-passport.js';
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

export function passportData(overrides = {}) {
  return mobilePassportDataFromCanonical({
    identity,
    secondaryHistory: secondaryHistory(),
    leaders: leaders(),
    drafts: drafts(),
    officialLeaderboards: heldRecordLeaderboard(),
    ...overrides,
  });
}


export const passportInput=()=>({identity,secondaryHistory:secondaryHistory(),leaders:leaders(),drafts:drafts(),officialLeaderboards:heldRecordLeaderboard()});
