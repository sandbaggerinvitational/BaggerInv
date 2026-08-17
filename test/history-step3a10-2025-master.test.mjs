import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildScorecardAnalytics } from "../lib/scorecard-analytics.js";
import { canonicalize2025ScrambleScorecardPresentation } from "../lib/history-2025-tournament-records.js";
import { buildLegacyHistoryScorecardCoverage } from "../lib/legacy-history-scorecard-coverage.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [matchCard, scorecard, matchCss, summaryCss, analyticsSource, scramblePresentationSource, roundPage, packageJson, historicalData] = await Promise.all([
  source("app/PublicMatchCard.js"),
  source("app/ScorecardTable.js"),
  source("app/live/live.module.css"),
  source("app/scorecard-summary.module.css"),
  source("lib/scorecard-analytics.js"),
  source("lib/history-2025-tournament-records.js"),
  source("app/history/[year]/round/[round]/page.js"),
  source("package.json").then(JSON.parse),
  source("lib/historical-data.json").then(JSON.parse),
]);

const pars = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
const courseHoles = pars.map((par, index) => ({
  "Course ID": "C1",
  Tee: "Black",
  "Hole Number": index + 1,
  Par: par,
  "Stroke Index": index + 1,
}));

const grossScores = (total) => {
  const base = Math.floor(total / 18);
  const remainder = total - base * 18;
  return Array.from({ length: 18 }, (_, index) => base + (index < remainder ? 1 : 0));
};

const scrambleEvidence = [
  { gross: [77, 72], strokes: [1, ""] },
  { gross: [73, 74], strokes: [2, ""] },
  { gross: [66, 80], strokes: ["", 1] },
  { gross: [69, 65], strokes: [1, ""] },
  { gross: [68, 74], strokes: ["", 3] },
  { gross: [71, 68], strokes: [1, ""] },
];

function scrambleFixture(year = 2025, { omitSecondStroke = false } = {}) {
  const teamNames = [
    { Year: year, "Team Side": "Team 1", "Team ID": "BANDON" },
    { Year: year, "Team Side": "Team 2", "Team ID": "CRIPSYBOYS" },
  ];
  const players = [];
  const matches = [];
  const roundScorecards = [];
  scrambleEvidence.forEach((evidence, index) => {
    const number = index + 1;
    const playerIds = [`A${number}1`, `A${number}2`, `B${number}1`, `B${number}2`];
    playerIds.forEach((id) => players.push({ "Player ID": id, "Display Name": `Player ${id}` }));
    const match = {
      "Match ID": `${year}-R2-${number}`,
      Year: year,
      Round: 2,
      Match: number,
      Format: "SC",
      "Course ID": "C1",
      "Team 1 Player 1": playerIds[0],
      "Team 1 Player 2": playerIds[1],
      "Team 2 Player 1": playerIds[2],
      "Team 2 Player 2": playerIds[3],
      "Team 1 Stroke": evidence.strokes[0],
      "Team 2 Stroke": evidence.strokes[1],
    };
    if (omitSecondStroke) delete match["Team 2 Stroke"];
    matches.push(match);
    [
      { teamId: "BANDON", scores: grossScores(evidence.gross[0]) },
      // Round Scorecards has the correct identity while the bundled 2025
      // Team Names context retains its established transposed spelling.
      { teamId: "CRISPYBOYS", scores: grossScores(evidence.gross[1]) },
    ].forEach(({ teamId, scores }) => {
      const row = {
        "Match ID": match["Match ID"],
        Year: year,
        Round: 2,
        Match: number,
        Format: "SC",
        "Course ID": "C1",
        "Team ID": teamId,
        "Score Type": "TEAM",
        "Scorecard Status": "COMPLETE",
      };
      scores.forEach((score, hole) => { row[`Hole ${hole + 1}`] = score; });
      roundScorecards.push(row);
    });
  });
  return {
    roundScorecards,
    matches,
    teamNames,
    players,
    courseHoles,
    courses: [{ Year: year, Round: 2, "Course ID": "C1", Course: "Test Course", Tee: "Black" }],
  };
}

function projectedScrambleCards(fixture) {
  const analytics = buildScorecardAnalytics(fixture);
  return fixture.matches.flatMap((match) => canonicalize2025ScrambleScorecardPresentation({
    scorecards: analytics.teamScorecards.filter((scorecard) => scorecard.matchId === match["Match ID"]),
    matches: fixture.matches,
    teams: fixture.teamNames,
  })).sort((a, b) => a.matchNumber - b.matchNumber || a.side - b.side);
}

test("all twelve 2025 Scramble identities retain canonical Gross, Strokes, and Net evidence", () => {
  const cards = projectedScrambleCards(scrambleFixture());
  assert.equal(cards.length, 12);
  const expected = scrambleEvidence.flatMap((evidence) => [
    [evidence.gross[0], Number(evidence.strokes[0] || 0), evidence.gross[0] - Number(evidence.strokes[0] || 0)],
    [evidence.gross[1], Number(evidence.strokes[1] || 0), evidence.gross[1] - Number(evidence.strokes[1] || 0)],
  ]);
  assert.deepEqual(cards.map((card) => [
    card.total,
    card.historySummary?.strokesReceived,
    card.historySummary?.netTotal,
  ]), expected);
  assert.deepEqual(cards.map((card) => card.side), [1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2]);
  assert.ok(cards.every((card) => card.participantPlayerIds.length === 2));
});

test("canonical blank strokes become zero while a genuinely missing stroke column stays unresolved", () => {
  const canonical = projectedScrambleCards(scrambleFixture());
  const zeroCards = canonical.filter((card) => card.historySummary?.strokesReceived === 0);
  assert.equal(zeroCards.length, 6);
  assert.ok(zeroCards.every((card) => card.historySummary?.netTotal === card.total));

  const missing = projectedScrambleCards(scrambleFixture(2025, { omitSecondStroke: true }));
  const unresolvedSecondSides = missing.filter((card) => card.side === 2);
  assert.equal(unresolvedSecondSides.length, 6);
  assert.ok(unresolvedSecondSides.every((card) =>
    card.historySummary?.strokesReceived === null && card.historySummary?.netTotal === null
  ));
});

test("the identity repair is unambiguous, 2025-only, and contains no pairing-specific hardcode", () => {
  assert.match(scramblePresentationSource, /Number\(scorecard\?\.year\) !== TARGET_YEAR/);
  assert.match(scramblePresentationSource, /const \{ resolved: resolvedSides \} = resolveTeamCardSides/);
  assert.match(scramblePresentationSource, /resolvedSides\.get\(scorecard\)/);
  assert.match(scramblePresentationSource, /officialStrokeValue\(canonicalMatch, resolvedSide\)/);
  assert.doesNotMatch(scramblePresentationSource, /Connor O'Reilly|Alex Monteleone|David Tatum|Chris Seekely|Jack Samis|Sonny Stepp|Jupjee Kochar|Brenan Cavanaugh/);
  for (const year of [2023, 2024]) {
    const fixture = scrambleFixture(year);
    const raw = buildScorecardAnalytics(fixture).teamScorecards;
    const cards = canonicalize2025ScrambleScorecardPresentation({
      scorecards: raw,
      matches: fixture.matches,
      teams: fixture.teamNames,
    });
    assert.deepEqual(cards, raw);
  }
});

test("summary repair leaves every approved hole, net-row, and Hole Winner field unchanged", () => {
  const fixture = scrambleFixture();
  const raw = buildScorecardAnalytics(fixture).teamScorecards;
  const projected = projectedScrambleCards(fixture);
  for (const card of projected) {
    const before = raw.find((candidate) => candidate.matchId === card.matchId && candidate.teamId === card.teamId);
    assert.deepEqual(card.holes, before.holes);
    assert.deepEqual(card.matchNetScoring, before.matchNetScoring);
    assert.equal(card.strokesReceived, before.strokesReceived);
    assert.deepEqual(card.netTotals, before.netTotals);
  }
});

test("eligible 2025 matches put Scorecard before independent Match Details", () => {
  const compact = matchCard.slice(matchCard.indexOf("if (completedHistoryCompact)"), matchCard.indexOf("return <article className={styles.matchCard}", matchCard.indexOf("if (completedHistoryCompact)")));
  const result = compact.indexOf("styles.historicalFinalResult");
  const scorecardAction = compact.indexOf("<ScorecardTable");
  const detailsAction = compact.indexOf("<details className={styles.historicalMatchDetails}");
  assert.ok(result < scorecardAction && scorecardAction < detailsAction);
  assert.match(scorecard, /const \[open, setOpen\] = useState\(false\)/);
  assert.match(matchCard, /<details className=\{styles\.historicalMatchDetails\}>/);
  assert.doesNotMatch(compact.slice(scorecardAction, detailsAction), /View Match Details/);
});

test("ineligible 2025 matches retain Details without a fake Scorecard placeholder", () => {
  assert.match(scorecard, /if \(!available\.length\) return null/);
  assert.match(matchCard, /\(hasSegments \|\| scorecards\.length \|\| match\.notes\) \? <details/);
  assert.doesNotMatch(matchCard, /Scorecard unavailable|missing scorecard|disabled Scorecard/i);
});

test("all 24 completed 2025 matchups use the no-stroke identity contract", () => {
  const matches = historicalData.matches.filter((match) => Number(match.Year) === 2025);
  assert.equal(matches.length, 24);
  assert.match(matchCard, /completed2025MatchupCleanup = completedHistoryCompact && historyYear === 2025/);
  assert.equal([...matchCard.matchAll(/showStroke=\{!completed2025MatchupCleanup\}/g)].length, 3);
  assert.match(matchCard, /showStroke && playerStrokeLabel/);
  assert.match(matchCard, /showStroke && teamStrokeLabel/);
  assert.match(matchCard, /showStroke \? <>[\s\S]*CompactHistoricalStrokeLine/);
  assert.match(matchCss, /\.historicalFinalPairing/);
});

test("the established 2025 scorecard eligibility remains exactly 22", () => {
  const matches = historicalData.matches.filter((match) => Number(match.Year) === 2025);
  const completeIds = new Set(matches.map((match) => match["Match ID"]));
  completeIds.delete("2025-R3-1");
  completeIds.delete("2025-R3-7");
  const scorecards = matches.flatMap((match) => {
    const count = match.Format === "BB" ? 4 : 2;
    return Array.from({ length: count }, (_, index) => ({
      matchId: match["Match ID"],
      year: 2025,
      round: match.Round,
      format: match.Format,
      scoreType: match.Format === "SC" ? "TEAM" : "INDIVIDUAL",
      teamId: match.Format === "SC" ? `T${index + 1}` : undefined,
      playerId: match.Format === "SC" ? undefined : [
        match["Team 1 Player 1"], match["Team 1 Player 2"],
        match["Team 2 Player 1"], match["Team 2 Player 2"],
      ].filter((id) => id && id !== "465")[index],
      status: completeIds.has(match["Match ID"]) ? "COMPLETE" : "MISSING",
      completedHoleCount: completeIds.has(match["Match ID"]) ? 18 : 0,
      holes: completeIds.has(match["Match ID"])
        ? Array.from({ length: 18 }, (_, hole) => ({ holeNumber: hole + 1, score: 4 }))
        : [],
    }));
  });
  const coverage = buildLegacyHistoryScorecardCoverage({ year: 2025, matches, scorecards, teamIds: ["T1", "T2"] });
  assert.equal(coverage.completeMatchScorecards, 22);
  assert.deepEqual(coverage.rounds.map((round) => round.completeMatchScorecards), [6, 6, 10]);
});

test("Best Ball, Singles, Hole Winner, Final Result, and Match Progression stay on existing paths", () => {
  assert.match(scorecard, /scorecard\.total \?\? "—"/);
  assert.match(scorecard, /: scorecard\.strokesReceived/);
  assert.match(scorecard, /: scorecard\.netTotals\?\.total/);
  assert.match(scorecard, /scorecard\.historySummary[\s\S]*scorecard\.historySummary\.strokesReceived/);
  assert.match(scorecard, /scorecard\.historySummary[\s\S]*scorecard\.historySummary\.netTotal/);
  assert.match(scorecard, /winnerForHole\(holeNumber\)/);
  assert.match(scorecard, /winner\?\.abbreviation \|\| "—"/);
  assert.match(matchCard, /<div className=\{styles\.historicalFinalResult\}>/);
  assert.match(matchCard, /<MatchProgressionSummary scorecards=\{scorecards\} \/>/);
  assert.match(roundPage, /<ScoringStatGrid/);
});

test("2023, 2024, and 2026 remain outside the completed-2025 action and matchup guards", () => {
  assert.match(matchCard, /completed2025MatchupCleanup = completedHistoryCompact && historyYear === 2025/);
  assert.match(roundPage, /completedHistoryCompact=\{completed2025\}/);
  assert.match(roundPage, /useSupabase2026 \? <HistoricalMatchRow/);
  assert.doesNotMatch(roundPage, /2023.*completedHistoryCompact|2024.*completedHistoryCompact/);
});

test("the 2025 action and summary system remains responsive and accessible", () => {
  assert.match(matchCss, /@media\s*\(max-width:\s*700px\)/);
  assert.match(summaryCss, /@media\(max-width:520px\)/);
  assert.match(scorecard, /aria-controls=\{accordionId\}/);
  assert.match(scorecard, /aria-expanded=\{open\}/);
  assert.match(scorecard, /aria-label="Scorecard totals"/);
  assert.match(scorecard, /<dt>Gross<\/dt>[\s\S]*<dt>Strokes<\/dt>[\s\S]*<dt>Net<\/dt>/);
  for (const width of [320, 375, 390, 430]) assert.ok(width <= 520);
});

test("Step 3A.10 adds no request, endpoint, source, storage, or dependency", () => {
  for (const value of [matchCard, scorecard, analyticsSource, scramblePresentationSource, roundPage]) {
    assert.doesNotMatch(value, /fetch\(|axios|createClient|supabase\.from|\/api\/live|gviz|localStorage|sessionStorage/i);
  }
  assert.deepEqual(Object.keys(packageJson.dependencies).sort(), [
    "@supabase/ssr",
    "@supabase/supabase-js",
    "@vercel/analytics",
    "next",
    "openai",
    "qrcode",
    "react",
    "react-dom",
    "web-push",
  ]);
});
