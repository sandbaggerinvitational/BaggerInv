import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildHistory2026Adapter,
  leaderboardFromMatches,
} from "../lib/history-2026-adapter.js";
import {
  build2026BestBallLowestTeamRound,
  build2026CanonicalFinalResult,
  build2026ScrambleRoundStatisticHolders,
} from "../lib/history-2026-round-presentation.js";
import { buildScoringHighlights } from "../lib/scorecard-analytics.js";
import { makeGuideProjection, makeHistory2026Aggregate } from "./fixtures/history-2026.mjs";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [
  roundPage,
  matchRow,
  matchResultCss,
  scorecardTable,
  pairingCss,
  yearPage,
  adapterSource,
  packageJson,
] = await Promise.all([
  source("app/history/[year]/round/[round]/page.js"),
  source("app/history/HistoricalMatchRow.js"),
  source("app/history/historical-match-result.module.css"),
  source("app/ScorecardTable.js"),
  source("app/scorecard-pairing.module.css"),
  source("app/history/[year]/page.js"),
  source("lib/history-2026-adapter.js"),
  source("package.json").then(JSON.parse),
]);

const view = buildHistory2026Adapter(makeHistory2026Aggregate(), {
  guideProjection: makeGuideProjection(),
});
const scorecardsForRound = (round) => view.analytics.usableScorecards.filter((scorecard) => scorecard.round === round);

function resultFixture({ winner = "A", clinchHole = 18, lead = 1 } = {}) {
  const holes = Array.from({ length: 18 }, (_, index) => ({
    holeNumber: index + 1,
    winnerType: "HALVED",
    winnerSide: null,
  }));
  if (winner) {
    for (let index = Math.max(0, clinchHole - lead); index < clinchHole; index += 1) {
      holes[index] = { holeNumber: index + 1, winnerType: "WINNER", winnerSide: winner };
    }
  }
  const matchNetScoring = {
    rows: [
      { side: 1, name: "The Pickles", teamId: "PICKLES" },
      { side: 2, name: "Lipp it and Rip it", teamId: "LIPPIT" },
    ],
    holeWinners: holes,
  };
  return [
    { matchId: "result-fixture", year: 2026, round: 3, format: "SI", side: 1, playerId: "A1", playerName: "Alex Monteleone", matchNetScoring },
    { matchId: "result-fixture", year: 2026, round: 3, format: "SI", side: 2, playerId: "B1", playerName: "Taylor Lippincott", matchNetScoring },
  ];
}

test("FINAL presentation uses canonical closed-match X & Y, 1 UP, and halved language", () => {
  assert.equal(build2026CanonicalFinalResult(resultFixture({ winner: "A", clinchHole: 16, lead: 3 })).text, "Alex Monteleone wins 3 & 2");
  assert.equal(build2026CanonicalFinalResult(resultFixture({ winner: "B", clinchHole: 18, lead: 1 })).text, "Taylor Lippincott wins 1 UP");
  assert.equal(build2026CanonicalFinalResult(resultFixture({ winner: null })).text, "Match halved");
  assert.match(matchRow, /use2026Presentation = Number\(tournament\?\.year\) === 2026/);
  assert.match(matchRow, /use2026Presentation \? build2026CanonicalFinalResult\(scorecards\) : null/);
  assert.doesNotMatch(matchRow, /canonicalResult[\s\S]{0,220}through 18/i);
});

test("LIVE presentation stays on the existing current-state path while FINAL uses scorecard evidence", () => {
  assert.match(matchRow, /state === "final"[\s\S]*build2026CanonicalFinalResult\(scorecards\)/);
  assert.match(matchRow, /state === "live"\) return replaceTeamLabels\(match\.liveStatusText/);
  assert.match(matchRow, /formatTeamPoints\(match\.team1Points\)/);
});

test("result hierarchy gives the primary result full width and team points a secondary line", () => {
  assert.match(matchRow, /resultStyles\.resultLayout/);
  assert.match(matchResultCss, /\.resultLayout\.resultLayout\s*\{[\s\S]*display:\s*grid[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)[\s\S]*gap:\s*8px/);
  assert.match(matchResultCss, /\.resultLayout\.resultLayout strong\s*\{[\s\S]*overflow-wrap:\s*break-word[\s\S]*line-height:\s*1\.22/);
  assert.match(matchResultCss, /\.resultLayout\.resultLayout small\s*\{[\s\S]*text-align:\s*left/);
});

test("2026 Best Ball and Scramble opt into stacked pairing identities while Singles data remains individual", () => {
  assert.match(matchRow, /stackPairingIdentities=\{use2026Presentation\}/);
  assert.match(scorecardTable, /pairingStyles\.pairingNames[\s\S]*participantNames\.map/);
  assert.match(scorecardTable, /participantIdentity = players\.map/);
  assert.match(scorecardTable, /scorecard\.scoreType === "TEAM"/);
  assert.match(scorecardTable, /return \([\s\S]*<strong>[\s\S]*scorecard\.playerName/);
  assert.match(pairingCss, /\.pairingNames\s*\{[\s\S]*display:\s*grid/);
  assert.match(scorecardTable, /pairingStyles\.visuallyHidden[\s\S]*participantIdentity/);
});

test("Best Ball Lowest Team Round reuses complete canonical net-best-ball rows", () => {
  const result = build2026BestBallLowestTeamRound(scorecardsForRound(1));
  assert.equal(result.sampleSize, 12);
  assert.ok(Number.isFinite(result.value));
  assert.ok(result.holders.length >= 1);
  assert.ok(result.holders.every((holder) => holder.name.includes(" & ") && holder.subtitle));
  assert.match(result.label, /complete Best Ball team rounds/);
});

test("Scramble holders resolve every accepted value to canonical two-golfer identities and preserve ties", () => {
  const cards = scorecardsForRound(2);
  const statistics = buildScoringHighlights(cards, cards.length);
  const holders = build2026ScrambleRoundStatisticHolders({
    scorecards: cards,
    acceptedValues: {
      birdieLeader: statistics.mostBirdies.value,
      lowestFrontNine: statistics.lowestFrontNine.value,
      lowestBackNine: statistics.lowestBackNine.value,
      lowestTeamRound: statistics.lowestTeamRound.value,
    },
  });
  for (const key of ["birdieLeader", "lowestFrontNine", "lowestBackNine", "lowestTeamRound"]) {
    assert.ok(holders[key].length >= 1, key);
    assert.ok(holders[key].every((holder) => holder.name.includes(" & ") && holder.subtitle), key);
  }
  assert.ok(holders.birdieLeader.length > 1, "the tied-holder fixture must not collapse to one source row");
});

test("2026 Round Statistics are format-aware and expose Birdie Leader only once", () => {
  assert.match(roundPage, /!completed2025 && !useSupabase2026[\s\S]*label: "Most Birdies"/);
  assert.match(roundPage, /showLowestRound = !\(useSupabase2026 && archive\.format === "SC"\)/);
  assert.match(roundPage, /showLowestTeamRound = !useSupabase2026 \|\| archive\.format === "SC"/);
  assert.match(roundPage, /archive\.format === "BB" && bestBallLowestTeamRound\?\.sampleSize > 0/);
  assert.match(roundPage, /useSupabase2026 \? applicableRoundStatisticItems/);
  assert.match(roundPage, /item\.value !== "—"/);
  assert.match(roundPage, /!\/\^Based on 0 recorded\/i/);
});

test("standings population starts from every canonical eligible player, including generic zero-contribution rows", () => {
  const players = [
    { "Player ID": "A", "Display Name": "Alpha", "Team Side": 1 },
    { "Player ID": "B", "Display Name": "Beta", "Team Side": 2 },
    { "Player ID": "C", "Display Name": "Charlie", "Team Side": 2 },
  ];
  const teams = [{ sideNumber: 1, name: "One" }, { sideNumber: 2, name: "Two" }];
  const matches = [{
    lifecycle: "FINAL", status: "FINAL", format: "SI", matchupWinner: "Team 1",
    team1Players: [{ id: "A" }], team2Players: [{ id: "B" }], team1Points: 3, team2Points: 0,
  }];
  const rows = leaderboardFromMatches(matches, players, teams);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.find((row) => row.id === "C"), {
    id: "C", player: players[2], teamSide: 2, teamName: "Two", wins: 0, losses: 0,
    halves: 0, points: 0, pointsTracked: true, winPercentage: 0,
  });
});

test("the current canonical adapter produces one standings row for all 24 roster identities", () => {
  assert.equal(view.players.length, 24);
  assert.equal(view.leaderboardRows.length, 24);
  assert.equal(new Set(view.leaderboardRows.map((row) => row.id)).size, 24);
});

test("production standings repair contains no participant-specific insertion or fuzzy matching", () => {
  assert.doesNotMatch(adapterSource, /Patrick Noonan|PN01/);
  assert.doesNotMatch(adapterSource, /fuzzy|levenshtein|similarity/i);
  assert.match(adapterSource, /for \(const player of players\)/);
});

test("full standings remain inline and request-neutral", () => {
  assert.match(yearPage, /data-current-standings-disclosure/);
  assert.match(yearPage, /View Full Standings/);
  assert.match(yearPage, /Show Top 5/);
  assert.doesNotMatch(yearPage, /View Full Leaderboard|\/live\?view=leaderboards|router\.push|fetch\(/);
});

test("Step 3A.8 adds no request, endpoint, source, cache, or dependency", () => {
  for (const value of [roundPage, matchRow, scorecardTable, adapterSource]) {
    assert.doesNotMatch(value, /fetch\(|axios|\/api\/live|gviz|createClient|supabase\.from|localStorage|sessionStorage/i);
  }
  assert.deepEqual(Object.keys(packageJson.dependencies).sort(), [
    "@supabase/ssr", "@supabase/supabase-js", "@vercel/analytics", "next", "openai", "qrcode", "react", "react-dom", "web-push",
  ]);
});
