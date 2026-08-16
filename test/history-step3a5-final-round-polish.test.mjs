import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  historicalPairingPlayerRows,
  historicalStrokeText,
} from "../lib/history-match-presentation.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [matchCard, matchCss, roundPage, overview, packageJson] = await Promise.all([
  source("app/PublicMatchCard.js"),
  source("app/live/live.module.css"),
  source("app/history/[year]/round/[round]/page.js"),
  source("app/history/[year]/page.js"),
  source("package.json").then(JSON.parse),
]);

const player = (name, stroke) => ({ id: name, name, stroke });

test("historical stroke text preserves visible copy and suppresses zero or missing values", () => {
  assert.equal(historicalStrokeText(1), "1 stroke received");
  assert.equal(historicalStrokeText(2), "2 strokes received");
  assert.equal(historicalStrokeText(0), "");
  assert.equal(historicalStrokeText(null), "");
  assert.equal(historicalStrokeText(undefined), "");
});

test("pairing slots cover every left/right stroke combination without changing participant order", () => {
  const combinations = [
    { label: "both golfers have strokes", left: [2, 4], right: [1, 3], expected: [[true, true], [true, true]] },
    { label: "neither golfer has strokes", left: [0, 0], right: [0, 0], expected: [[false, false], [false, false]] },
    { label: "left has strokes and right does not", left: [2, 3], right: [0, 0], expected: [[true, false], [true, false]] },
    { label: "right has strokes and left does not", left: [0, 0], right: [2, 3], expected: [[false, true], [false, true]] },
    { label: "Player 1 has strokes and Player 2 does not", left: [2, 0], right: [3, 0], expected: [[true, true], [false, false]] },
    { label: "Player 2 has strokes and Player 1 does not", left: [0, 2], right: [0, 3], expected: [[false, false], [true, true]] },
  ];

  for (const combination of combinations) {
    const left = combination.left.map((stroke, index) => player(`Left ${index + 1}`, stroke));
    const right = combination.right.map((stroke, index) => player(`Right ${index + 1}`, stroke));
    const rows = historicalPairingPlayerRows(left, right);
    assert.deepEqual(rows.map((row) => [Boolean(row.left.strokeText), Boolean(row.right.strokeText)]), combination.expected, combination.label);
    assert.deepEqual(rows.map((row) => [row.left.player.name, row.right.player.name]), [
      ["Left 1", "Right 1"],
      ["Left 2", "Right 2"],
    ], combination.label);
  }
});

test("Best Ball and Scramble use shared name/stroke grid rows with invisible reserved stroke lines", () => {
  assert.match(matchCard, /function CompactHistoricalPairing/);
  assert.match(matchCard, /historicalPairingPlayerRows\(teamOnePlayers, teamTwoPlayers\)/);
  assert.match(matchCard, /<CompactHistoricalPlayerName player=\{row\.left\.player\} side="1" slot=\{row\.slot\}/);
  assert.match(matchCard, /<CompactHistoricalPlayerName player=\{row\.right\.player\} side="2" slot=\{row\.slot\}/);
  assert.match(matchCard, /<CompactHistoricalStrokeLine label=\{row\.left\.strokeText\} side="1" slot=\{row\.slot\}/);
  assert.match(matchCard, /<CompactHistoricalStrokeLine label=\{row\.right\.strokeText\} side="2" slot=\{row\.slot\}/);
  assert.match(matchCard, /data-empty=\{empty \? "true" : undefined\}/);
  assert.match(matchCard, /aria-hidden=\{empty \? "true" : undefined\}/);
  assert.match(matchCard, />\{label \|\| "\\u00a0"\}<\/small>/);
  assert.match(matchCss, /historicalFinalPlayerName \{[^}]*align-self:\s*start/);
  assert.match(matchCss, /historicalFinalStrokeLine,[^{]+\{[^}]*min-height:\s*\.7375rem;[^}]*align-self:\s*stretch/);
  assert.match(matchCss, /historicalFinalStrokePlaceholder \{ visibility:\s*hidden; \}/);
});

test("Singles retain the existing compact side without pairing-only blank stroke rows", () => {
  const compact = matchCard.slice(matchCard.indexOf("if (completedHistoryCompact)"));
  assert.match(compact, /match\.format === "SI" \? <div className=\{styles\.historicalFinalMatchup\}>/);
  assert.match(compact, /<CompactHistoricalSide team=\{tournament\.teamOne\}/);
  assert.match(compact, /: <CompactHistoricalPairing/);
});

test("2025 rounds expose exactly one Birdie Leader while other years keep their existing categories", () => {
  assert.match(roundPage, /\.\.\.\(!completed2025 \? \[\{ label: "Most Birdies"/);
  assert.match(roundPage, /const roundBirdieLeader = completed2025 && archive\.format === "SC"[\s\S]*roundStatistics\.mostBirdies[\s\S]*roundStatistics\.birdieLeader/);
  assert.match(roundPage, /label: "Birdie Leader"[\s\S]*holders: completed2025 && archive\.format === "SC" \? scrambleStatisticHolders\?\.mostBirdies/);
});

test("the micro pass adds no request, dependency, overview change, or scoring calculation", () => {
  for (const file of [matchCard, roundPage]) {
    assert.doesNotMatch(file, /fetch\(|\/api\/live|gviz|localStorage|sessionStorage/i);
  }
  assert.doesNotMatch(overview, /historicalPairingPlayerRows|roundBirdieLeader/);
  assert.doesNotMatch(roundPage, /build2025TournamentRecords|reduce\(|filter\(.*bird/i);
  assert.deepEqual(Object.keys(packageJson.dependencies).sort(), [
    "@supabase/ssr", "@supabase/supabase-js", "@vercel/analytics", "next", "openai", "qrcode", "react", "react-dom", "web-push",
  ]);
});
