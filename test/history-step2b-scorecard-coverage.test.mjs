import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildScorecardAnalytics } from "../lib/scorecard-analytics.js";
import {
  buildLegacyHistoryScorecardCoverage,
  legacyHistoryScorecardAvailability,
} from "../lib/legacy-history-scorecard-coverage.js";

const fullHoles = () => Array.from({ length: 18 }, (_, index) => ({
  holeNumber: index + 1,
  score: 4,
}));

function rawMatch(year, round, match, format) {
  const prefix = `${year}-R${round}-${match}`;
  return {
    "Match ID": prefix,
    Year: year,
    Round: round,
    Match: match,
    Format: format,
    "Course ID": `C${year}`,
    "Team 1 Player 1": `${prefix}-A1`,
    "Team 1 Player 2": format === "SI" ? "465" : `${prefix}-A2`,
    "Team 2 Player 1": `${prefix}-B1`,
    "Team 2 Player 2": format === "SI" ? "465" : `${prefix}-B2`,
  };
}

function normalizedCard({ match, playerId = "", teamId = "", status = "COMPLETE", holes = 18 }) {
  return {
    matchId: match["Match ID"],
    year: match.Year,
    round: match.Round,
    matchNumber: match.Match,
    format: match.Format,
    scoreType: teamId ? "TEAM" : "INDIVIDUAL",
    playerId: playerId || undefined,
    teamId: teamId || undefined,
    status,
    completedHoleCount: holes,
    holes: Array.from({ length: holes }, (_, index) => ({ holeNumber: index + 1, score: 4 })),
  };
}

function yearFixture(year, missing = new Set()) {
  const matches = [];
  const scorecards = [];
  for (const [round, format, count] of [[1, "BB", 6], [2, "SC", 6], [3, "SI", 12]]) {
    for (let matchNumber = 1; matchNumber <= count; matchNumber += 1) {
      const match = rawMatch(year, round, matchNumber, format);
      matches.push(match);
      const identities = format === "SC"
        ? [{ teamId: "T1" }, { teamId: "T2" }]
        : [1, 2].flatMap((side) => {
            const prefix = `Team ${side} Player`;
            return format === "SI"
              ? [{ playerId: match[`${prefix} 1`] }]
              : [{ playerId: match[`${prefix} 1`] }, { playerId: match[`${prefix} 2`] }];
          });
      identities.forEach((identity, index) => {
        const key = `${round}-${matchNumber}-${index}`;
        scorecards.push(normalizedCard({
          match,
          ...identity,
          status: missing.has(key) ? "MISSING" : "COMPLETE",
          holes: missing.has(key) ? 0 : 18,
        }));
      });
    }
  }
  return { matches, scorecards };
}

const missing2023 = new Set(["1-1-0", "2-3-0", "2-3-1", "2-5-0", "2-5-1", "3-5-0"]);
const missing2025 = new Set(["3-1-0", "3-7-0", "3-7-1"]);

test("canonical 2023–2025 coverage distinguishes logical cards from complete match detail", () => {
  const expectations = {
    2023: [54, 6, 20, 2, 2],
    2024: [60, 0, 24, 0, 0],
    2025: [57, 3, 22, 1, 1],
  };
  for (const year of [2023, 2024, 2025]) {
    const fixture = yearFixture(year, year === 2023 ? missing2023 : year === 2025 ? missing2025 : new Set());
    const coverage = buildLegacyHistoryScorecardCoverage({ year, ...fixture, teamIds: ["T1", "T2"] });
    const [complete, missing, completeMatches, partialMatches, none] = expectations[year];
    assert.equal(coverage.canonicalMatches, 24, `${year} matches`);
    assert.equal(coverage.expectedLogicalScorecards, 60, `${year} expected logical cards`);
    assert.equal(coverage.completeLogicalScorecards, complete, `${year} complete logical cards`);
    assert.equal(coverage.partialLogicalScorecards, 0, `${year} partial logical cards`);
    assert.equal(coverage.missingLogicalScorecards, missing, `${year} missing logical cards`);
    assert.equal(coverage.completeMatchScorecards, completeMatches, `${year} complete matches`);
    assert.equal(coverage.partialMatchScorecards, partialMatches, `${year} partial matches`);
    assert.equal(coverage.noScorecardMatches, none, `${year} matches with no detail`);
    assert.equal(coverage.duplicateLogicalRows, 0);
    assert.equal(coverage.unexpectedLogicalRows, 0);
  }
});

test("round matrices preserve Best Ball, Scramble, and Singles scoring units", () => {
  const fixture = yearFixture(2025, missing2025);
  const coverage = buildLegacyHistoryScorecardCoverage({ year: 2025, ...fixture, teamIds: ["T1", "T2"] });
  assert.deepEqual(coverage.rounds.map((round) => ({
    round: round.round,
    format: round.format,
    matches: round.canonicalMatches,
    expected: round.expectedLogicalScorecards,
    complete: round.completeLogicalScorecards,
    completeMatches: round.completeMatchScorecards,
  })), [
    { round: 1, format: "BB", matches: 6, expected: 24, complete: 24, completeMatches: 6 },
    { round: 2, format: "SC", matches: 6, expected: 12, complete: 12, completeMatches: 6 },
    { round: 3, format: "SI", matches: 12, expected: 24, complete: 21, completeMatches: 10 },
  ]);
  assert.equal(coverage.expectedLogicalScorecards, 24 + 12 + 24);
});

test("unused Singles slots never become expected cards", () => {
  const match = rawMatch(2025, 3, 1, "SI");
  const scorecards = [
    normalizedCard({ match, playerId: match["Team 1 Player 1"] }),
    normalizedCard({ match, playerId: match["Team 2 Player 1"] }),
  ];
  const coverage = buildLegacyHistoryScorecardCoverage({ year: 2025, matches: [match], scorecards });
  assert.equal(coverage.expectedLogicalScorecards, 2);
  assert.equal(coverage.unexpectedLogicalRows, 0);
  assert.equal(coverage.completeMatchScorecards, 1);
});

test("explicit source identities preserve a missing ghost-match participant omitted by fallback matches", () => {
  const match = rawMatch(2023, 3, 5, "SI");
  match["Team 1 Player 1"] = "";
  const scorecards = [
    normalizedCard({ match, playerId: "CP01", status: "MISSING", holes: 0 }),
    normalizedCard({ match, playerId: match["Team 2 Player 1"] }),
  ];
  const coverage = buildLegacyHistoryScorecardCoverage({ year: 2023, matches: [match], scorecards });
  assert.equal(coverage.expectedLogicalScorecards, 2);
  assert.equal(coverage.completeLogicalScorecards, 1);
  assert.equal(coverage.missingLogicalScorecards, 1);
  assert.equal(coverage.partialMatchScorecards, 1);
  assert.equal(coverage.completeMatchScorecards, 0);
});

test("duplicates do not inflate counts and 17 holes remain partial", () => {
  const match = rawMatch(2025, 3, 1, "SI");
  const complete = normalizedCard({ match, playerId: match["Team 1 Player 1"] });
  const partial = normalizedCard({ match, playerId: match["Team 2 Player 1"], status: "PARTIAL", holes: 17 });
  const coverage = buildLegacyHistoryScorecardCoverage({
    year: 2025,
    matches: [match],
    scorecards: [complete, { ...complete }, partial],
  });
  assert.equal(coverage.expectedLogicalScorecards, 2);
  assert.equal(coverage.completeLogicalScorecards, 1);
  assert.equal(coverage.partialLogicalScorecards, 1);
  assert.equal(coverage.duplicateLogicalRows, 1);
  assert.equal(coverage.completeMatchScorecards, 0);
  assert.equal(coverage.partialMatchScorecards, 1);
});

test("missing and cross-year evidence cannot advertise match detail", () => {
  const match = rawMatch(2025, 3, 1, "SI");
  const wrongYear = normalizedCard({ match, playerId: match["Team 1 Player 1"] });
  wrongYear.year = 2024;
  const coverage = buildLegacyHistoryScorecardCoverage({ year: 2025, matches: [match], scorecards: [wrongYear] });
  assert.equal(coverage.completeLogicalScorecards, 0);
  assert.equal(coverage.missingLogicalScorecards, 2);
  assert.equal(coverage.noScorecardMatches, 1);
  assert.equal(coverage.completeMatchIds.length, 0);
});

test("participant copy uses matches and summary-only years avoid numeric telemetry", () => {
  assert.equal(legacyHistoryScorecardAvailability({ completeMatchScorecards: 20, canonicalMatches: 24 }), "Available for 20 matches");
  assert.equal(legacyHistoryScorecardAvailability({ completeMatchScorecards: 24, canonicalMatches: 24 }), "Available for all 24 matches");
  assert.equal(legacyHistoryScorecardAvailability({ completeMatchScorecards: 0, canonicalMatches: 24 }), "Detailed historical scorecards are not available for this tournament.");
  assert.equal(legacyHistoryScorecardAvailability({ completeMatchScorecards: 0, canonicalMatches: 6 }, { scope: "round" }), "Detailed historical scorecards are not available for this round.");
});

test("the old 2025 78 expectation is corrected at the source boundary", () => {
  const fixture = yearFixture(2025, missing2025);
  const courseHoles = Array.from({ length: 18 }, (_, index) => ({
    "Course ID": "C2025",
    Tee: "Archive",
    "Hole Number": index + 1,
    Par: 4,
    "Stroke Index": index + 1,
  }));
  const rawScorecards = fixture.scorecards.map((scorecard) => {
    const row = {
      "Match ID": scorecard.matchId,
      Year: scorecard.year,
      Round: scorecard.round,
      Match: scorecard.matchNumber,
      Format: scorecard.format,
      "Course ID": "C2025",
      "Player ID": scorecard.playerId || "",
      "Team ID": scorecard.teamId || "",
      "Score Type": scorecard.scoreType,
      "Scorecard Status": scorecard.status,
    };
    scorecard.holes.forEach((hole) => { row[`Hole ${hole.holeNumber}`] = hole.score; });
    return row;
  });
  const analytics = buildScorecardAnalytics({
    roundScorecards: rawScorecards,
    matches: fixture.matches,
    courseHoles,
    courses: [{ Year: 2025, "Course ID": "C2025", Course: "Archive Course", Tee: "Archive" }],
    teamNames: [
      { Year: 2025, "Team Side": "Team 1", "Team ID": "T1" },
      { Year: 2025, "Team Side": "Team 2", "Team ID": "STALE-TYPO" },
    ],
  });
  assert.equal(analytics.usableScorecards.length, 57);
  assert.equal(analytics.missingScorecards.length, 3);
  assert.equal(analytics.report.unresolvedTeamIds.length, 0);
  assert.equal(57 + 3, 60);
  assert.equal(57 + 3 + 12 + 6, 78, "old denominator included 12 phantom Singles expectations and 6 stale-team expectations");
});

test("actual legacy render paths use complete match coverage without changing 2026", async () => {
  const [yearPage, roundPage, scorecardTable] = await Promise.all([
    readFile(new URL("../app/history/[year]/page.js", import.meta.url), "utf8"),
    readFile(new URL("../app/history/[year]/round/[round]/page.js", import.meta.url), "utf8"),
    readFile(new URL("../app/ScorecardTable.js", import.meta.url), "utf8"),
  ]);
  assert.match(yearPage, /label: "Historical Scorecards"/);
  assert.match(yearPage, /legacyScorecardCoverage\.completeMatchScorecards/);
  assert.match(roundPage, /completeLegacyMatchIds\.has\(match\.id\)/);
  assert.match(roundPage, /label: "Historical Scorecards"/);
  assert.doesNotMatch(roundPage, /scorecardCoverage\.available} of/);
  assert.match(yearPage, /function scoringItems/);
  assert.match(yearPage, /label: "Scorecard Coverage"/);
  assert.match(scorecardTable, /aria-expanded=\{open\}/);
  assert.match(scorecardTable, /title = "Hole-by-Hole Scorecard"/);
});
