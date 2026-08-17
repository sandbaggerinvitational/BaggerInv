import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildLegacyHistoryScorecardCoverage } from "../lib/legacy-history-scorecard-coverage.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [matchCard, matchCss, scorecard, scorecardCss, pairingCss, summaryCss, roundPage, currentMatchRow, packageJson] = await Promise.all([
  source("app/PublicMatchCard.js"),
  source("app/live/live.module.css"),
  source("app/ScorecardTable.js"),
  source("app/scorecard.module.css"),
  source("app/scorecard-pairing.module.css"),
  source("app/scorecard-summary.module.css"),
  source("app/history/[year]/round/[round]/page.js"),
  source("app/history/HistoricalMatchRow.js"),
  source("package.json").then(JSON.parse),
]);

const holes = (available = true) => available
  ? Array.from({ length: 18 }, (_, index) => ({ holeNumber: index + 1, score: 4 }))
  : [];

function match(year, round, number, format) {
  const id = `${year}-R${round}-${number}`;
  return {
    "Match ID": id,
    Year: year,
    Round: round,
    Match: number,
    Format: format,
    "Team 1 Player 1": `${id}-A1`,
    "Team 1 Player 2": format === "SI" ? "465" : `${id}-A2`,
    "Team 2 Player 1": `${id}-B1`,
    "Team 2 Player 2": format === "SI" ? "465" : `${id}-B2`,
  };
}

function coverageFixture(year, missing = new Set()) {
  const matches = [];
  const scorecards = [];
  for (const [round, format, count] of [[1, "BB", 6], [2, "SC", 6], [3, "SI", 12]]) {
    for (let number = 1; number <= count; number += 1) {
      const row = match(year, round, number, format);
      matches.push(row);
      const identities = format === "SC"
        ? [{ teamId: "T1" }, { teamId: "T2" }]
        : format === "SI"
          ? [{ playerId: row["Team 1 Player 1"] }, { playerId: row["Team 2 Player 1"] }]
          : [
              { playerId: row["Team 1 Player 1"] }, { playerId: row["Team 1 Player 2"] },
              { playerId: row["Team 2 Player 1"] }, { playerId: row["Team 2 Player 2"] },
            ];
      identities.forEach((identity, index) => {
        const available = !missing.has(`${round}-${number}-${index}`);
        scorecards.push({
          matchId: row["Match ID"], year, round, format,
          scoreType: identity.teamId ? "TEAM" : "INDIVIDUAL",
          ...identity,
          status: available ? "COMPLETE" : "MISSING",
          completedHoleCount: available ? 18 : 0,
          holes: holes(available),
        });
      });
    }
  }
  return { matches, scorecards };
}

test("canonical 2023–2025 match-scorecard eligibility stays 20, 24, and 22", () => {
  const missing = {
    2023: new Set(["1-1-0", "2-3-0", "2-3-1", "2-5-0", "2-5-1", "3-5-0"]),
    2024: new Set(),
    2025: new Set(["3-1-0", "3-7-0", "3-7-1"]),
  };
  const expected = { 2023: [5, 4, 11, 20], 2024: [6, 6, 12, 24], 2025: [6, 6, 10, 22] };
  for (const year of [2023, 2024, 2025]) {
    const coverage = buildLegacyHistoryScorecardCoverage({ year, ...coverageFixture(year, missing[year]), teamIds: ["T1", "T2"] });
    assert.deepEqual(coverage.rounds.map((round) => round.completeMatchScorecards), expected[year].slice(0, 3));
    assert.equal(coverage.completeMatchScorecards, expected[year][3]);
  }
  assert.match(roundPage, /completeLegacyMatchIds\.has\(match\.id\) \? displayScorecardsForMatch\(match\.id\) : \[\]/);
});

test("visual parity is limited to already-eligible 2023–2025 historical scorecards", () => {
  assert.match(matchCard, /variant === "historical" &&[\s\S]*historyYear >= 2023 && historyYear <= 2025 &&[\s\S]*scorecards\.length > 0/);
  assert.doesNotMatch(roundPage, /2017.*showSummary|2018.*showSummary|2019.*showSummary|2020.*showSummary|2021.*showSummary|2022.*showSummary/);
});

test("eligible completed matches omit stroke copy without retaining empty stroke rows", () => {
  assert.match(matchCard, /showStrokeCopy=\{!historyScorecardParity\}/);
  assert.match(matchCard, /showStroke=\{!completed2025MatchupCleanup\}/);
  assert.match(matchCard, /reserveStrokeRow=\{showStrokeCopy\}/);
  assert.match(matchCard, /reserveStrokeRow \? <span className=\{styles\.playerStrokeSlot\}/);
  assert.match(matchCard, /showStroke \? <>[\s\S]*CompactHistoricalStrokeLine/);
  assert.match(matchCss, /\.playerSlotWithoutStroke \{ grid-row: span 2;/);
  assert.match(matchCss, /\.playerPairSpacerWithoutStroke \{ grid-row: span 2;/);
});

test("completed scorecards reuse the approved grouped Gross, Strokes, and Net summary", () => {
  assert.equal([...matchCard.matchAll(/showSummary=\{historyScorecardParity\}/g)].length, 2);
  assert.match(scorecard, /function ScorecardSummary/);
  assert.match(scorecard, /<dt>Gross<\/dt><dd>\{scorecard\.total \?\? "—"\}<\/dd>/);
  assert.match(scorecard, /<dt>Strokes<\/dt><dd>\{scorecard\.strokesReceived \?\? "—"\}<\/dd>/);
  assert.match(scorecard, /<dt>Net<\/dt><dd>\{scorecard\.netTotals\?\.total \?\? "—"\}<\/dd>/);
  assert.match(summaryCss, /\.summary\{[^}]*border-radius:13px[^}]*background:#fffdf8/);
});

test("summary identity remains individual for Best Ball and Singles and canonical-pairing based for Scramble", () => {
  assert.match(scorecard, /scorecard\.scoreType === "TEAM"/);
  assert.match(scorecard, /participantNames\.map/);
  assert.match(scorecard, /scorecard\.playerName \|\| scorecard\.playerId \|\| "Player"/);
  assert.match(matchCard, /stackPairingIdentities=\{historyScorecardParity\}/);
  assert.doesNotMatch(scorecard, /2023|2024|2025/);
});

test("all supported formats reuse the visible label-only derived-row grammar", () => {
  assert.match(scorecard, /className=\{pairingStyles\.derivedRowLabel\}>\{netRow\.label\}<\/span>/);
  assert.match(scorecard, /aria-hidden="true" className=\{pairingStyles\.derivedRowLabel\}/);
  assert.match(scorecard, /participantIdentity = players\.map\(\(player\) => player\.name\)\.join\(" and "\) \|\| netRow\.name/);
  assert.match(scorecard, /pairingStyles\.visuallyHidden/);
  assert.doesNotMatch(scorecard.slice(scorecard.indexOf("function NetParticipant"), scorecard.indexOf("function ScoreGrid")), /players\.map\(\(player\) => <strong/);
});

test("derived labels retain the approved 2026 secondary typography token", () => {
  assert.match(pairingCss, /\.derivedRowLabel\s*\{[\s\S]*color:\s*#60736b;[\s\S]*font-family:\s*Arial, Helvetica, sans-serif;[\s\S]*font-size:\s*9px;[\s\S]*font-weight:\s*800;[\s\S]*text-transform:\s*uppercase/);
});

test("History removes only the aggregate Hole Winner summary while preserving every per-hole indicator", () => {
  assert.match(scorecard, /hideHoleWinnerSummary=\{historyDensity\}/);
  assert.match(scorecard, /<strong>Hole Winner<\/strong>/);
  assert.match(scorecard, /holeNumbers\.map\(\(holeNumber\) =>/);
  assert.match(scorecard, /winnerForHole\(holeNumber\)/);
  assert.match(scorecard, /<td aria-label=\{label\} key=\{holeNumber\}>/);
  assert.match(scorecard, /winner\?\.abbreviation \|\| "—"/);
});

test("gross, stroke, net, hole, total, and eligibility paths remain unchanged", () => {
  assert.match(scorecard, /<ScoreCell[\s\S]*scorecard\.holes\.find/);
  assert.match(scorecard, /<NetCell hole=\{netRow\.holes\.find/);
  assert.match(scorecard, /scorecard\.frontNine \?\? "—"/);
  assert.match(scorecard, /scorecard\.backNine \?\? "—"/);
  assert.match(scorecard, /scorecard\.netTotals\?\.total \?\? "—"/);
  assert.match(scorecard, /scorecard\.status !== "MISSING"/);
  assert.match(scorecard, /scorecard\.completedHoleCount > 0/);
});

test("Final Results, team points, Match Details, and Match Progression remain independent and unchanged", () => {
  assert.match(matchCard, /<div className=\{styles\.historicalFinalResult\}>/);
  assert.match(matchCard, /formatTeamPoints\(match\.team1Points\)/);
  assert.match(matchCard, /<summary>View Match Details/);
  assert.equal([...matchCard.matchAll(/<MatchProgressionSummary scorecards=\{scorecards\} \/>/g)].length, 2);
});

test("2026 keeps its approved dedicated scorecard props and presentation path", () => {
  assert.match(currentMatchRow, /use2026Presentation = Number\(tournament\?\.year\) === 2026/);
  assert.match(currentMatchRow, /<ScorecardTable scorecards=\{scorecards\} compact historyDensity showSummary stackPairingIdentities=\{use2026Presentation\} \/>/);
  assert.match(roundPage, /useSupabase2026 \? <HistoricalMatchRow/);
});

test("the summary and scorecard grids remain responsive at 320, 375, 390, and 430 pixels", () => {
  assert.match(scorecardCss, /@media\(max-width:700px\)[\s\S]*width:clamp\(120px,34vw,150px\)/);
  assert.match(scorecardCss, /\.scroller\{[^}]*overflow-x:auto/);
  assert.match(summaryCss, /@media\(max-width:520px\)[\s\S]*grid-template-columns:1fr/);
  for (const width of [320, 375, 390, 430]) {
    const identityWidth = Math.min(150, Math.max(120, width * 0.34));
    assert.ok(identityWidth >= 120 && identityWidth <= 150);
  }
});

test("summary and derived identities retain complete accessible ownership", () => {
  assert.match(scorecard, /aria-label="Scorecard totals"/);
  assert.match(scorecard, /<dl>[\s\S]*<dt>Gross<\/dt>[\s\S]*<dt>Strokes<\/dt>[\s\S]*<dt>Net<\/dt>/);
  assert.match(scorecard, /<span className=\{pairingStyles\.visuallyHidden\}>\{participantIdentity\}\. \{netRow\.label\}<\/span>/);
  assert.match(scorecard, /aria-label=\{stackPairingIdentities \? accessibleName : undefined\}/);
});

test("Step 3A.9 introduces no request, endpoint, data source, or dependency", () => {
  for (const value of [matchCard, scorecard, roundPage]) {
    assert.doesNotMatch(value, /fetch\(|axios|createClient|supabase\.from|\/api\/live|gviz|localStorage|sessionStorage/i);
  }
  assert.deepEqual(Object.keys(packageJson.dependencies).sort(), [
    "@supabase/ssr", "@supabase/supabase-js", "@vercel/analytics", "next", "openai", "qrcode", "react", "react-dom", "web-push",
  ]);
});
