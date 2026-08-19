import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { scorecardPresentationData } from "../lib/scorecard-presentation.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [
  scorecard,
  matchCard,
  currentMatchRow,
  career,
  formatHistory,
  archive,
  tournament,
  leaderboard,
  participantShell,
  appHeader,
  publicComponents,
] = await Promise.all([
  source("app/ScorecardTable.js"),
  source("app/PublicMatchCard.js"),
  source("app/history/HistoricalMatchRow.js"),
  source("app/players/[slug]/PlayerIntelligenceSections.js"),
  source("app/players/[slug]/PlayerFormatMatchHistory.js"),
  source("app/history/page.js"),
  source("app/history/[year]/page.js"),
  source("app/TournamentLeaderboard.js"),
  source("app/ParticipantIdentity.js"),
  source("app/ParticipantAppHeader.js"),
  source("app/components.js"),
]);

test("closed Round scorecards defer their canonical detail without a request boundary", () => {
  assert.match(scorecard, /deferClosedContent = false/);
  assert.match(scorecard, /useState\(!deferClosedContent\)/);
  assert.match(scorecard, /\{hasRenderedContent \? <div>/);
  assert.match(scorecard, /inert=\{open \? undefined : true\}/);
  assert.match(scorecard, /window\.matchMedia\("\(max-width: 700px\)"\)/);
  assert.match(scorecard, /!deferClosedContent \|\| !mobileHistoryLayout/);
  assert.match(scorecard, /!deferClosedContent \|\| mobileHistoryLayout/);
  assert.match(matchCard, /deferClosedContent=\{historyDensity\}/);
  assert.match(currentMatchRow, /compact deferClosedContent historyDensity/);
  for (const value of [scorecard, matchCard, currentMatchRow]) {
    assert.doesNotMatch(value, /fetch\(|axios|\/api\/|supabase|googleapis/i);
  }
});

test("the Round client boundary receives a compact immutable scorecard presentation", () => {
  const matchNetScoring = {
    available: true,
    rows: [{
      side: 1,
      name: "Side A",
      label: "Net Best Ball",
      available: true,
      holes: [{ holeNumber: 1, netScore: 4, netToPar: 0, unused: "drop" }],
      netTotals: { frontNine: 36, backNine: 37, total: 73, toPar: 1, unused: "drop" },
    }],
    holeWinners: [{ holeNumber: 1, winnerType: "SIDE_A", winnerName: "Side A", abbreviation: "A", unused: "drop" }],
    summary: { sideAWins: 9, sideBWins: 7, halved: 2, unused: "drop" },
    unused: "drop",
  };
  const input = [1, 2].map((side) => ({
    matchId: "2025-R1-1",
    scoreType: "PLAYER",
    status: "COMPLETE",
    completedHoleCount: 18,
    courseName: "Old Macdonald",
    tee: "Green",
    side,
    playerId: `P${side}`,
    playerName: `Player ${side}`,
    playerSlug: `player-${side}`,
    frontNine: 36,
    backNine: 37,
    total: 73,
    totalToPar: 1,
    strokesReceived: 2,
    netAvailable: true,
    netTotals: { frontNine: 35, backNine: 36, total: 71, toPar: -1, unused: "drop" },
    historySummary: { strokesReceived: 2, netTotal: 71, unused: "drop" },
    holes: [{ holeNumber: 1, score: 4, toPar: 0, strokesAllocated: 1, netScore: 3, netToPar: -1, unused: "drop" }],
    matchNetScoring,
    analyticsUniverse: { unused: true },
  }));
  const before = structuredClone(input);
  const output = scorecardPresentationData(input);

  assert.deepEqual(input, before);
  assert.equal(output.length, 2);
  assert.equal(output[0].holes[0].netScore, 3);
  assert.equal(output[0].netTotals.total, 71);
  assert.equal(output[0].matchNetScoring.rows[0].netTotals.total, 73);
  assert.equal(output[0].matchNetScoring.holeWinners[0].abbreviation, "A");
  assert.equal(output[1].matchNetScoring, null);
  assert.equal("analyticsUniverse" in output[0], false);
  assert.equal("unused" in output[0].holes[0], false);
  assert.ok(JSON.stringify(output).length < JSON.stringify(input).length);

  const missingFirst = scorecardPresentationData([
    {
      ...input[0],
      status: "MISSING",
      completedHoleCount: 0,
      holes: [],
    },
    input[1],
  ]);
  assert.equal(missingFirst[0].matchNetScoring, null);
  assert.equal(missingFirst[1].matchNetScoring.summary.sideAWins, 9);
});

test("deep Career detail mounts locally on first expansion and remains mounted", () => {
  assert.match(career, /^"use client";/);
  assert.equal((career.match(/<IntelligenceSection defer /g) || []).length, 4);
  assert.match(career, /title="Career Snapshot" open/);
  assert.match(career, /title="Records Held">/);
  assert.match(career, /useState\(open \|\| !defer\)/);
  assert.match(career, /data-detail-mounted=\{hasRenderedContent \? "true" : "false"\}/);
  assert.match(career, /nextOpen = event\.currentTarget\.open/);
  assert.match(career, /\{hasRenderedContent \? <div className=\{styles\.playerIntelligenceBody\}>/);
  assert.match(career, /return `\$\{record\.wins\}-\$\{record\.losses\}-\$\{record\.halves\}`/);
  assert.match(career, /return `\$\{value\.toFixed\(1\)\}%`/);
  assert.match(formatHistory, /useState\(false\)/);
  assert.match(formatHistory, /if \(!open\) setHasRenderedContent\(true\)/);
  assert.match(formatHistory, /\{hasRenderedContent \? <>/);
  for (const value of [career, formatHistory]) {
    assert.doesNotMatch(value, /fetch\(|axios|\/api\/|supabase|googleapis/i);
  }
});

test("History prefetch is bounded to recent Archive, first Round, teams, and shell destinations", () => {
  assert.match(archive, /newestCompletedYear = tournaments\.find/);
  assert.match(archive, /prefetch=\{Number\(tournament\.year\) === Number\(newestCompletedYear\) \? undefined : false\}/);
  assert.equal((tournament.match(/prefetch=\{index === 0 \? undefined : false\}/g) || []).length, 3);
  assert.ok((tournament.match(/overviewRoundCourse[^>]*prefetch=\{false\}/g) || []).length >= 2);
  assert.match(tournament, /prefetchPlayerLinks=\{false\}/);
  assert.match(leaderboard, /prefetch=\{prefetch\}/);
  assert.match(tournament, /label: "All Tournament Years",[\s\S]*prefetch: false/);
  assert.match(tournament, /className=\{styles\.draftHistoryLink\}[\s\S]*prefetch=\{false\}/);
  assert.match(participantShell, /participantIdlePrefetchRoutes\(pathname, searchParams\.toString\(\)\)/);
  assert.match(participantShell, /router\.prefetch\(href\)/);
});

test("the existing Sandbagger logo uses bounded responsive delivery without a branding change", () => {
  assert.match(appHeader, /optimizedAssetUrl\("\/images\/sandbagger-logo\.png", 96, 82\)/);
  assert.match(publicComponents, /optimizedAssetUrl\("\/images\/sandbagger-logo\.png", 128, 82\)/);
  assert.doesNotMatch(appHeader, /src="\/images\/sandbagger-logo\.png"/);
  assert.doesNotMatch(publicComponents, /src="\/images\/sandbagger-logo\.png"/);
});
