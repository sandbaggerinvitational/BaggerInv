import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildScorecardAnalytics, buildScoringHighlights } from "../lib/scorecard-analytics.js";
import {
  buildCanonicalHistoryCourseHoleAliases,
  buildHistoricalIndividualBirdieHolders,
  buildHistoricalIndividualStatisticHolders,
  omitMeaninglessHistoricalBirdieLeader,
  selectCanonical2024IndividualStatisticScorecards,
  selectCanonical2024NetPresentationScorecards,
} from "../lib/history-2024-net-projection.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [scorecardData, roundPage, overviewPage, matchCard, migrationRequirement, packageJson] = await Promise.all([
  source("lib/scorecard-data.js"),
  source("app/history/[year]/round/[round]/page.js"),
  source("app/history/[year]/page.js"),
  source("app/PublicMatchCard.js"),
  source("docs/history-2023-migration-requirements.md"),
  source("package.json").then(JSON.parse),
]);

function courseHoles(courseId, tee) {
  return Array.from({ length: 18 }, (_, index) => ({
    "Course ID": courseId,
    Tee: tee,
    "Hole Number": index + 1,
    Par: 4,
    "Stroke Index": index + 1,
  }));
}

function scorecardRow({ matchId, year = 2024, round, match, format, courseId, playerId, scores }) {
  return {
    "Match ID": matchId,
    Year: year,
    Round: round,
    Match: match,
    Format: format,
    "Course ID": courseId,
    "Player ID": playerId,
    "Score Type": "INDIVIDUAL",
    "Scorecard Status": "COMPLETE",
    ...Object.fromEntries(scores.map((score, index) => [`Hole ${index + 1}`, score])),
  };
}

function individualFixture({ round, format, courseId, displayTee, sourceTee, playersPerSide }) {
  const matchId = `2024-R${round}-1`;
  const players = playersPerSide === 2
    ? ["A1", "A2", "B1", "B2"]
    : ["A1", "B1"];
  const match = {
    "Match ID": matchId,
    Year: 2024,
    Round: round,
    Match: 1,
    Format: format,
    "Course ID": courseId,
    "Team 1 Player 1": "A1",
    "Team 1 Player 1 Stroke": 2,
    "Team 2 Player 1": "B1",
    "Team 2 Player 1 Stroke": 0,
  };
  if (playersPerSide === 2) Object.assign(match, {
    "Team 1 Player 2": "A2",
    "Team 1 Player 2 Stroke": 1,
    "Team 2 Player 2": "B2",
    "Team 2 Player 2 Stroke": 3,
  });
  const input = {
    matches: [match],
    courses: [{ Year: 2024, Round: round, "Course ID": courseId, Course: "Archive Course", "Tee Played": displayTee }],
    courseHoles: courseHoles(courseId, sourceTee),
    teamNames: [
      { Year: 2024, "Team Side": "Team 1", "Team ID": "TEAM-A", "Team Name": "Team A" },
      { Year: 2024, "Team Side": "Team 2", "Team ID": "TEAM-B", "Team Name": "Team B" },
    ],
    players: players.map((id) => ({ "Player ID": id, "Display Name": id })),
    roundScorecards: players.map((playerId) => scorecardRow({
      matchId,
      round,
      match: 1,
      format,
      courseId,
      playerId,
      scores: Array(18).fill(4),
    })),
  };
  return input;
}

test("the mixed-source tee boundary is repaired only by an unambiguous complete canonical hole set", () => {
  const input = individualFixture({ round: 1, format: "BB", courseId: "SVGC01", displayTee: "Back", sourceTee: "Black", playersPerSide: 2 });
  const base = buildScorecardAnalytics(input);
  assert.equal(base.scorecards.every((card) => card.netAvailable === false), true);
  const aliases = buildCanonicalHistoryCourseHoleAliases({ year: 2024, courses: input.courses, courseHoles: input.courseHoles });
  assert.deepEqual(aliases.audit, [{ courseId: "SVGC01", displayTee: "Back", sourceTee: "Black", state: "ALIASED", rows: 18 }]);
  const projected = buildScorecardAnalytics({ ...input, courseHoles: aliases.courseHoles });
  assert.equal(projected.scorecards.every((card) => card.netAvailable), true);
  assert.equal(projected.scorecards.find((card) => card.playerId === "A1").netTotals.total, 70);
  assert.equal(projected.scorecards[0].matchNetScoring.available, true);
});

test("ambiguous or incomplete tee evidence remains unavailable", () => {
  const input = individualFixture({ round: 3, format: "SI", courseId: "SVGC02", displayTee: "Back/Orange", sourceTee: "Black/Orange", playersPerSide: 1 });
  const ambiguous = buildCanonicalHistoryCourseHoleAliases({
    year: 2024,
    courses: input.courses,
    courseHoles: [...input.courseHoles, ...courseHoles("SVGC02", "Blue")],
  });
  assert.equal(ambiguous.aliases.length, 0);
  assert.equal(ambiguous.audit[0].state, "AMBIGUOUS");
});

const evidenceMatrix = [
  [1,1,"Wade Caston",74,2,72],[1,1,"Michael Hunnicutt",76,3,73],[1,1,"Memo Saldana",69,0,69],[1,1,"David Rees-Jones",75,3,72],
  [1,2,"Miles Berger",69,0,69],[1,2,"Alex Monteleone",86,12,74],[1,2,"Brian Atkinson",77,8,69],[1,2,"Nick Julian",73,7,66],
  [1,3,"David Tatum",74,5,69],[1,3,"Connor O'Reilly",82,9,73],[1,3,"Robert Murphy",71,0,71],[1,3,"Jason Powell",76,7,69],
  [1,4,"Max Markley",71,0,71],[1,4,"Raymond Hill",89,9,80],[1,4,"Chris Seekely",86,12,74],[1,4,"Taylor Lippincott",91,12,79],
  [1,5,"Brenan Cavanaugh",83,9,74],[1,5,"Jack Samis",90,10,80],[1,5,"Holman Moores",76,0,76],[1,5,"Jupjee Kochar",79,9,70],
  [1,6,"Chase Patterson",85,9,76],[1,6,"Matthew Smith",75,2,73],[1,6,"Sonny Stepp",88,11,77],[1,6,"Will Oliver",73,0,73],
  [3,1,"Miles Berger",71,0,71],[3,1,"Holman Moores",72,1,71],[3,2,"Raymond Hill",81,1,80],[3,2,"Brian Atkinson",81,0,81],
  [3,3,"Max Markley",72,0,72],[3,3,"Nick Julian",89,7,82],[3,4,"Wade Caston",79,0,79],[3,4,"Jason Powell",77,3,74],
  [3,5,"Chase Patterson",79,0,79],[3,5,"Jupjee Kochar",87,1,86],[3,6,"Connor O'Reilly",88,7,81],[3,6,"Memo Saldana",73,0,73],
  [3,7,"Jack Samis",87,0,87],[3,7,"Taylor Lippincott",95,2,93],[3,8,"David Tatum",80,0,80],[3,8,"David Rees-Jones",80,1,79],
  [3,9,"Brenan Cavanaugh",86,0,86],[3,9,"Sonny Stepp",91,2,89],[3,10,"Michael Hunnicutt",76,0,76],[3,10,"Chris Seekely",89,8,81],
  [3,11,"Matthew Smith",70,3,67],[3,11,"Robert Murphy",70,0,70],[3,12,"Alex Monteleone",87,14,73],[3,12,"Will Oliver",73,0,73],
];

test("all 24 R1 and all 24 R3 canonical golfer projections pass the complete-evidence presentation gate", () => {
  assert.equal(evidenceMatrix.filter(([round]) => round === 1).length, 24);
  assert.equal(evidenceMatrix.filter(([round]) => round === 3).length, 24);
  for (const round of [1, 3]) {
    const rows = evidenceMatrix.filter(([matrixRound]) => matrixRound === round);
    const base = rows.map(([matrixRound, match, player, gross, strokes]) => ({
      year: 2024, round: matrixRound, matchId: `2024-R${matrixRound}-${match}`, scoreType: "INDIVIDUAL", playerId: player, playerName: player,
      total: gross, strokesReceived: strokes, netAvailable: false, netTotals: null, holes: Array.from({ length: 18 }, (_, index) => ({ holeNumber: index + 1, netScore: null })),
    }));
    const projected = rows.map(([matrixRound, match, player, gross, strokes, net]) => ({
      year: 2024, round: matrixRound, matchId: `2024-R${matrixRound}-${match}`, scoreType: "INDIVIDUAL", playerId: player, playerName: player,
      total: gross, strokesReceived: strokes, netAvailable: true, netTotals: { total: net }, holes: Array.from({ length: 18 }, (_, index) => ({ holeNumber: index + 1, netScore: 4 })), matchNetScoring: { available: true },
    }));
    const selected = selectCanonical2024NetPresentationScorecards({ year: 2024, round, scorecards: base, projectedScorecards: projected });
    assert.deepEqual(selected.map((card) => [card.playerName, card.total, card.strokesReceived, card.netTotals.total]), rows.map(([, , player, gross, strokes, net]) => [player, gross, strokes, net]));
  }
});

function canonicalStatisticFixture() {
  const birdies = (round, player) => {
    if (round === 1 && player === "Robert Murphy") return 4;
    if (round === 3 && player === "Robert Murphy") return 3;
    if (round === 3 && player === "Michael Hunnicutt") return 4;
    return 0;
  };
  const projected = evidenceMatrix.map(([round, match, player, gross, strokes, net]) => {
    const birdieCount = birdies(round, player);
    const holes = Array.from({ length: 18 }, (_, index) => ({
      holeNumber: index + 1,
      score: index < birdieCount ? 3 : 4,
      par: 4,
      toPar: index < birdieCount ? -1 : 0,
      netScore: index < strokes ? 3 : 4,
    }));
    return {
      year: 2024,
      round,
      format: round === 1 ? "BB" : "SI",
      matchId: `2024-R${round}-${match}`,
      scoreType: "INDIVIDUAL",
      playerId: player,
      playerName: player,
      status: "COMPLETE",
      completedHoleCount: 18,
      total: gross,
      strokesReceived: strokes,
      netAvailable: true,
      netTotals: { total: net },
      holes,
      metrics: { birdies: { value: birdieCount } },
      matchNetScoring: { available: true },
    };
  });
  return {
    projected,
    base: projected.map((scorecard) => ({
      ...scorecard,
      netAvailable: false,
      netTotals: null,
      holes: scorecard.holes.map((hole) => ({ ...hole, netScore: null })),
      matchNetScoring: { available: false },
    })),
  };
}

test("authorized 2024 Birdie Leaders and the tournament average use 48 complete individual gross rounds", () => {
  const fixture = canonicalStatisticFixture();
  const selected = selectCanonical2024IndividualStatisticScorecards({
    scorecards: fixture.base,
    projectedScorecards: fixture.projected,
  });
  assert.equal(selected.length, 48);
  assert.equal(selected.filter((scorecard) => scorecard.round === 1).length, 24);
  assert.equal(selected.filter((scorecard) => scorecard.round === 3).length, 24);

  const tournament = buildScoringHighlights(selected, selected.length);
  const roundOne = buildScoringHighlights(selected.filter((scorecard) => scorecard.round === 1), 24);
  const roundThree = buildScoringHighlights(selected.filter((scorecard) => scorecard.round === 3), 24);
  assert.equal(tournament.averageScore.sampleSize, 48);
  assert.equal(tournament.averageScore.value, 3821 / 48);
  assert.equal(tournament.averageScore.value.toFixed(1), "79.6");
  assert.equal(tournament.birdieLeader.value, 7);
  assert.equal(tournament.birdieLeader.scorecard.playerName, "Robert Murphy");
  assert.equal(roundOne.birdieLeader.value, 4);
  assert.equal(roundOne.birdieLeader.scorecard.playerName, "Robert Murphy");
  assert.equal(roundThree.birdieLeader.value, 4);
  assert.equal(roundThree.birdieLeader.scorecard.playerName, "Michael Hunnicutt");
  assert.deepEqual(
    buildHistoricalIndividualBirdieHolders({ year: 2024, scorecards: selected, acceptedValue: 7 }).map((holder) => holder.name),
    ["Robert Murphy"]
  );
});

test("the authorized statistics projection stays individual-only and leaves Scramble out of the tournament average", () => {
  const fixture = canonicalStatisticFixture();
  const scramble = {
    ...fixture.projected[0],
    round: 2,
    format: "SC",
    matchId: "2024-R2-1",
    scoreType: "TEAM",
    playerId: "",
    teamId: "TEAM-1",
    total: 63,
  };
  const selected = selectCanonical2024IndividualStatisticScorecards({
    scorecards: [...fixture.base, scramble],
    projectedScorecards: [...fixture.projected, scramble],
  });
  assert.equal(selected.length, 48);
  assert.equal(selected.some((scorecard) => scorecard.round === 2 || scorecard.scoreType === "TEAM"), false);
});

test("a partial projection cannot replace the truthful gross-only base", () => {
  const base = [{ year: 2024, round: 1, matchId: "M1", scoreType: "INDIVIDUAL", playerId: "P1" }];
  const selected = selectCanonical2024NetPresentationScorecards({ year: 2024, round: 1, scorecards: base, projectedScorecards: [] });
  assert.deepEqual(selected, base);
});

test("accepted gross statistics expose every tied individual holder without changing values", () => {
  const cards = [
    { year: 2024, round: 1, matchId: "M1", format: "BB", scoreType: "INDIVIDUAL", completedHoleCount: 18, playerId: "MEMO", playerName: "Memo Saldana", total: 69, frontNine: 35, backNine: 34 },
    { year: 2024, round: 1, matchId: "M2", format: "BB", scoreType: "INDIVIDUAL", completedHoleCount: 18, playerId: "MILES", playerName: "Miles Berger", total: 69, frontNine: 35, backNine: 34 },
  ];
  const holders = buildHistoricalIndividualStatisticHolders({ year: 2024, round: 1, scorecards: cards, acceptedValues: { lowestRound: 69, lowestBackNine: 34 } });
  assert.deepEqual(holders.lowestRound.map((holder) => holder.name), ["Memo Saldana", "Miles Berger"]);
  assert.deepEqual(holders.lowestBackNine.map((holder) => holder.name), ["Memo Saldana", "Miles Berger"]);
});

test("zero Birdie Leaders are omitted only from the audited 2024 presentation", () => {
  assert.equal(omitMeaninglessHistoricalBirdieLeader({ year: 2024, value: 0 }), true);
  assert.equal(omitMeaninglessHistoricalBirdieLeader({ year: 2024, value: 1 }), false);
  assert.equal(omitMeaninglessHistoricalBirdieLeader({ year: 2025, value: 0 }), false);
  assert.match(roundPage, /showBirdieLeader[\s\S]*completedHistoryRoundStatisticItems/);
  assert.match(overviewPage, /item\.label === "Birdie Leader"[\s\S]*omitMeaninglessHistoricalBirdieLeader/);
});

test("the 2023 migration audits Course ID and archive tee resolution before applying its isolated projection", () => {
  assert.match(migrationRequirement, /Course ID/);
  assert.match(migrationRequirement, /archive display tee label/);
  assert.match(migrationRequirement, /canonical Course Holes scoring-set tee label/);
  assert.match(migrationRequirement, /fail closed/i);
  assert.match(migrationRequirement, /20-scorecard eligibility contract/);
  assert.match(scorecardData, /canonical2023/i);
});

test("runtime projection reuses the existing analytics and is isolated to 2024 R1/R3", () => {
  assert.match(scorecardData, /buildCanonicalHistoryCourseHoleAliases/);
  assert.match(scorecardData, /reusableScorecardPass\(\{[\s\S]*courseHoles: history2024NetProjection\.courseHoles/);
  assert.match(roundPage, /completed2024 && \[1, 3\]\.includes\(Number\(archive\.round\)\)/);
  assert.match(roundPage, /selectCanonical2024NetPresentationScorecards/);
  assert.doesNotMatch(scorecardData, /calculateIndividualNetHoleScore|calculateBestBallNetHoleScore|getStrokesOnHole/);
});

test("accepted Final Results remain frozen while R1/R3 Match Intelligence uses canonical Net", () => {
  assert.match(matchCard, /useReconstructedFinalResult = historyYear !== 2024 \|\| match\.format === "SC"/);
  assert.match(roundPage, /<PublicMatchCard[\s\S]*scorecards=\{completeLegacyMatchIds\.has\(match\.id\) \? displayScorecardsForMatch\(match\.id\) : \[\]\}/);
});

test("Step 3B.1A adds no request, endpoint, dependency, or client scoring formula", () => {
  assert.doesNotMatch(roundPage + overviewPage, /fetch\(|axios|createClient|supabase\.from|\/api\/live/i);
  assert.doesNotMatch(roundPage + overviewPage, /Robert Murphy|Michael Hunnicutt|79\.6/);
  assert.deepEqual(Object.keys(packageJson.dependencies).sort(), [
    "@supabase/ssr", "@supabase/supabase-js", "@vercel/analytics", "libphonenumber-js", "next", "openai", "qrcode", "react", "react-dom", "server-only", "web-push",
  ].sort());
});
