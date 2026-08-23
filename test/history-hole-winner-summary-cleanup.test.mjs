import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [scorecard, roundPage, historicalMatchRow, publicMatchCard, packageJson] = await Promise.all([
  source("app/ScorecardTable.js"),
  source("app/history/[year]/round/[round]/page.js"),
  source("app/history/HistoricalMatchRow.js"),
  source("app/PublicMatchCard.js"),
  source("package.json").then(JSON.parse),
]);

const block = (value, start, end) => {
  const startIndex = value.indexOf(start);
  return value.slice(startIndex, value.indexOf(end, startIndex));
};
const scoreGrid = block(scorecard, "function ScoreGrid", "function ScorecardSummary");
const holeWinnerRow = block(scoreGrid, "{showNet && matchNet?.holeWinners?.length", "</tr>");

test("History scorecards omit only the aggregate Hole Winner summary", () => {
  assert.match(scoreGrid, /hideHoleWinnerSummary = false/);
  assert.match(holeWinnerRow, /<strong>Hole Winner<\/strong>/);
  assert.match(holeWinnerRow, /!hideHoleWinnerSummary \? <small>/);
  assert.match(holeWinnerRow, /matchNet\.summary\.sideAWins}–{matchNet\.summary\.sideBWins} · {matchNet\.summary\.halved} halved/);

  const invocations = [...scorecard.matchAll(/<ScoreGrid\b[^>]*\/>/g)].map((match) => match[0]);
  assert.equal(invocations.length, 3, "desktop, Front 9, and Back 9 share the same score grid");
  for (const invocation of invocations) {
    assert.match(invocation, /hideHoleWinnerSummary=\{historyDensity\}/);
  }
});

test("per-hole winner indicators and accessible labels stay on the existing path", () => {
  assert.match(holeWinnerRow, /holeNumbers\.map\(\(holeNumber\) =>/);
  assert.match(holeWinnerRow, /winnerForHole\(holeNumber\)/);
  assert.match(holeWinnerRow, /winner\?\.winnerType === "HALVED"/);
  assert.match(holeWinnerRow, /`Hole \$\{holeNumber\} was halved`/);
  assert.match(holeWinnerRow, /winner\?\.winnerName \|\| winner\?\.abbreviation/);
  assert.match(holeWinnerRow, /<td aria-label=\{label\} key=\{holeNumber\}>/);
  assert.match(holeWinnerRow, /winner\?\.abbreviation \|\| "—"/);
});

test("scorecard values, totals, and eligibility remain unchanged", () => {
  assert.match(scoreGrid, /<ScoreCell[\s\S]*hole=\{scorecard\.holes\.find/);
  assert.match(scoreGrid, /scorecard\.frontNine \?\? "—"/);
  assert.match(scoreGrid, /scorecard\.backNine \?\? "—"/);
  assert.match(scoreGrid, /scorecard\.totalToPar === null \? "—" : toPar\(scorecard\.totalToPar\)/);
  assert.match(scoreGrid, /scorecard\.netTotals\?\.total \?\? "—"/);
  assert.match(scoreGrid, /<NetCell hole=\{netRow\.holes\.find/);
  assert.match(scorecard, /scorecard\.status !== "MISSING"/);
  assert.match(scorecard, /scorecard\.completedHoleCount > 0/);
  assert.match(scorecard, /scorecard\.holes\?\.some\(\(hole\) => hasValue\(hole\.score\)\)/);
});

test("all tournament History scorecards inherit the shared cleanup without year exceptions", () => {
  assert.match(historicalMatchRow, /<ScorecardTable scorecards=\{scorecardTableData\} compact deferClosedContent historyDensity/);
  assert.match(publicMatchCard, /<ScorecardTable[\s\S]*?scorecards=\{scorecardTableData\}[\s\S]*?deferClosedContent=\{historyDensity\}[\s\S]*?historyDensity=\{historyDensity\}/);
  assert.match(roundPage, /variant="historical"[\s\S]*historyDensity/);
  assert.match(roundPage, /completeLegacyMatchIds\.has\(match\.id\) \? displayScorecardsForMatch\(match\.id\) : \[\]/);
  assert.doesNotMatch(scorecard, /2023|2024|2025|2026/);
});

test("the presentation cleanup adds no request or dependency", () => {
  assert.doesNotMatch(scorecard, /fetch\(|axios|createClient|supabase\.from|\/api\//i);
  assert.deepEqual(Object.keys(packageJson.dependencies).sort(), [
    "@supabase/ssr", "@supabase/supabase-js", "@vercel/analytics", "libphonenumber-js", "next", "openai", "qrcode", "react", "react-dom", "server-only", "web-push",
  ]);
});
