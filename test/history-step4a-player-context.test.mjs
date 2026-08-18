import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  COMPLETED_HISTORY_PLAYER_YEARS,
  historicalPlayerProfileHref,
  historicalPlayerReturnContext,
  isCompletedHistoryPlayerYear,
} from "../lib/context-navigation.js";
import {
  COMPLETED_CAREER_HISTORY_YEARS,
  mergeCanonicalCareerHistoricalData,
} from "../lib/career-history-authority.js";
import { buildPlayerIntelligence } from "../lib/player-intelligence.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [overview, profile, intelligenceUi, stats, sheets, scorecardData, profileCss, completedCss] = await Promise.all([
  source("app/history/[year]/page.js"),
  source("app/players/[slug]/page.js"),
  source("app/players/[slug]/PlayerIntelligenceSections.js"),
  source("lib/stats.js"),
  source("lib/google-sheets-data.js"),
  source("lib/scorecard-data.js"),
  source("app/historical.module.css"),
  source("app/history/[year]/completed-year-2025.module.css"),
]);

const record = ({ wins = 0, losses = 0, halves = 0, points = 0, recordedPointMatches = 0 } = {}) => ({
  wins,
  losses,
  halves,
  matches: wins + losses + halves,
  points,
  recordedPointMatches,
});

test("completed History player context is explicit, deterministic, and limited to 2017–2025", () => {
  assert.deepEqual(COMPLETED_HISTORY_PLAYER_YEARS, COMPLETED_CAREER_HISTORY_YEARS);
  assert.deepEqual(
    Array.from({ length: 11 }, (_, index) => 2016 + index).filter(isCompletedHistoryPlayerYear),
    [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]
  );
  assert.equal(
    historicalPlayerProfileHref("Holman-Moores", 2023),
    "/players/Holman-Moores?from=history&year=2023"
  );
  assert.deepEqual(historicalPlayerReturnContext({ from: "history", year: "2023" }), {
    year: 2023,
    href: "/history/2023",
    label: "2023 Tournament",
    accessibleLabel: "Back to 2023 Tournament",
  });
  assert.equal(historicalPlayerReturnContext({ from: "history", year: "2026" }), null);
  assert.equal(historicalPlayerReturnContext({ from: "history", year: "9999" }), null);
  assert.equal(historicalPlayerReturnContext({ from: "browse", year: "2023" }), null);
});

test("Career authority replaces only frozen completed-year rows and preserves current 2026 identity", () => {
  const canonical = {
    players: [{ "Player ID": "P1", Slug: "archive" }, { "Player ID": "P2", Slug: "archive-only" }],
    matches: [{ Year: 2023, value: "canonical" }, { Year: 2026, value: "archive-current" }],
    tournaments: [{ Year: 2023, value: "canonical" }],
    rounds: [{ Name: "archive-round" }],
  };
  const current = {
    players: [{ "Player ID": "P1", Slug: "current" }, { "Player ID": "P3", Slug: "current-only" }],
    matches: [{ Year: 2023, value: "stale" }, { Year: 2026, value: "current" }],
    tournaments: [{ Year: 2023, value: "stale" }, { Year: 2026, value: "current" }],
    rounds: [{ Name: "current-round" }],
  };
  const merged = mergeCanonicalCareerHistoricalData({ canonical, current });
  assert.deepEqual(merged.matches, [
    { Year: 2023, value: "canonical" },
    { Year: 2026, value: "current" },
  ]);
  assert.deepEqual(merged.tournaments, [
    { Year: 2023, value: "canonical" },
    { Year: 2026, value: "current" },
  ]);
  assert.deepEqual(merged.rounds, [{ Name: "current-round" }]);
  assert.deepEqual(Object.fromEntries(merged.players.map((player) => [player["Player ID"], player.Slug])), {
    P1: "current",
    P2: "archive-only",
    P3: "current-only",
  });
});

test("point missingness is independent from match results and preserves recorded zero", () => {
  const overall = record({ wins: 2, losses: 1, points: 1.5, recordedPointMatches: 2 });
  const emptyFormat = record();
  const statsModel = {
    records: { overall, BB: overall, SC: emptyFormat, SI: emptyFormat },
    percentages: { overall: 66.6667, BB: 66.6667, SC: 0, SI: 0 },
    appearances: [2018, 2019, 2024],
    championships: [2018],
    careerTimeline: [
      { year: 2018, attended: true, result: "Champion" },
      { year: 2019, attended: true, result: "Runner-Up" },
      { year: 2024, attended: true, result: "Completed" },
    ],
    seasons: [
      { year: 2018, overall: record({ wins: 1 }), teamResolved: true, teamName: "Champions" },
      { year: 2019, overall: record({ losses: 1, points: 1.5, recordedPointMatches: 1 }), teamResolved: true, teamName: "Runners" },
      { year: 2024, overall: record({ wins: 1, points: 0, recordedPointMatches: 1 }), teamResolved: true, teamName: "Recorded Zero" },
    ],
  };
  const playerRow = { player: { "Player ID": "P1", "Display Name": "Player One" }, stats: statsModel };
  const officialRecords = {
    all: [playerRow],
    points: [playerRow],
    wins: [playerRow],
    percentage: [playerRow],
    championships: [playerRow],
    appearances: [playerRow],
  };
  const intelligence = buildPlayerIntelligence({
    playerId: "P1",
    stats: statsModel,
    allPlayerStats: [playerRow],
    officialRecords,
    scorecards: [],
  });
  assert.equal(intelligence.official.recordDisplay, "2-1-0");
  assert.equal(intelligence.official.careerPoints, 1.5);
  assert.deepEqual(intelligence.tournamentHistory.map((season) => [season.year, season.points, season.pointsRecorded]), [
    [2018, 0, false],
    [2019, 1.5, true],
    [2024, 0, true],
  ]);
  assert.equal(intelligence.hole.sample.completeScorecards, 0);
  assert.equal(intelligence.hole.sample.scoringHoles, 0);
});

test("Top 5 and Full Standings share canonical, request-neutral Career Profile links", () => {
  assert.match(overview, /historicalPlayerProfileHref\(player\.slug, tournament\.year\)/);
  assert.match(overview, /aria-label=\{`View \$\{player\.name\} career profile`\}/);
  assert.match(overview, /href=\{playerProfileHref\} prefetch=\{false\}/);
  assert.match(overview, /standings\.map\(\(row\) => renderStanding\(row, "summary"\)\)/);
  assert.match(overview, /leaderboard\.map\(\(row\) => renderStanding\(row, "full"\)\)/);
  assert.doesNotMatch(overview, /linkHistoricalPlayers/);
  assert.match(completedCss, /\.standingRow > span > a \{[\s\S]*min-height: 44px/);
});

test("History-context navigation takes precedence without changing normal profile identity", () => {
  assert.match(profile, /refreshCanonicalCareerHistoricalData/);
  assert.match(profile, /loadCanonicalCareerScorecardAnalytics/);
  assert.match(profile, /const historyReturnContext = historicalPlayerReturnContext\(query\)/);
  assert.match(profile, /href=\{historyReturnContext\?\.href \|\| \(participantIdentity \? "\/home" : playerDirectoryReturnHref\)\}/);
  assert.match(profile, /label=\{historyReturnContext\?\.label \|\| \(participantIdentity \? "Back to My Tournament" : "Back to All Sandbaggers"\)\}/);
  assert.match(profile, /path: `\/players\/\$\{slug\}`/);
  assert.doesNotMatch(profile, /history\.back|router\.back|window\.history/);
});

test("Tournament History links only completed years and exposes truthful missing points", () => {
  assert.match(intelligenceUi, /isCompletedHistoryPlayerYear\(season\.year\)/);
  assert.match(intelligenceUi, /href=\{`\/history\/\$\{season\.year\}`\}/);
  assert.match(intelligenceUi, /prefetch=\{false\}/);
  assert.match(intelligenceUi, /!season\.pointsRecorded \? "—" : formatPlayerPoints\(season\.points\)/);
  assert.match(intelligenceUi, /aria-label=\{upcoming \|\| !season\.pointsRecorded \? "Points not recorded"/);
  assert.match(intelligenceUi, /<div[\s\S]*className=\{styles\.playerTournamentHistoryRow\}[\s\S]*>\s*\{content\}\s*<\/div>/);
  assert.match(profileCss, /\.playerTournamentHistoryRow \{[\s\S]*min-height: 48px/);
  assert.match(profileCss, /\.playerTournamentHistoryRow\[href\]:focus-visible/);
});

test("Career point coverage, corrected 2023 authority, and canonical Net projections stay bounded", () => {
  assert.match(stats, /recordedPointMatches: 0/);
  assert.match(stats, /record\.recordedPointMatches \+= 1/);
  assert.match(sheets, /loadCanonicalCareerHistoricalData/);
  assert.match(sheets, /current: fallbackHistoricalData/);
  assert.match(sheets, /loadCanonicalCareerScorecardSheets/);
  assert.match(scorecardData, /canonicalCareerScorecards/);
  assert.match(scorecardData, /reconcileCanonical2023ScorecardPresentation/);
  assert.match(scorecardData, /selectCanonical2024NetPresentationScorecards/);
  assert.match(profile, /rival\.record\.recordedPointMatches > 0[\s\S]*formatPlayerPoints\(rival\.record\.points\)/);
  assert.doesNotMatch(profile, /<strong>\{rival\.record\.matches\}<\/strong>/);
});
