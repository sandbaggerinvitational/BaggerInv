import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [
  matchRow,
  resultCss,
  scorecardTable,
  pairingCss,
  roundPage,
  yearPage,
  packageJson,
] = await Promise.all([
  source("app/history/HistoricalMatchRow.js"),
  source("app/history/historical-match-result.module.css"),
  source("app/ScorecardTable.js"),
  source("app/scorecard-pairing.module.css"),
  source("app/history/[year]/round/[round]/page.js"),
  source("app/history/[year]/page.js"),
  source("package.json").then(JSON.parse),
]);

const block = (value, start, end) => value.slice(value.indexOf(start), value.indexOf(end));

test("2026 FINAL Official Result uses one smaller shared typography token", () => {
  assert.match(matchRow, /data-official-result=\{state === "final" \? "true" : undefined\}/);
  assert.match(resultCss, /\[data-official-result="true"\] strong\s*\{[\s\S]*font-size:\s*\.95rem;[\s\S]*line-height:\s*1\.24;/);
  assert.doesNotMatch(resultCss, /white-space:\s*nowrap/);
  assert.match(resultCss, /overflow-wrap:\s*break-word/);
});

test("Official Result and team points remain separate semantic lines", () => {
  assert.match(matchRow, /<div><span>\{state === "final"[\s\S]*<strong>\{result\}<\/strong><\/div>/);
  assert.match(matchRow, /<small>\{tournament\.teamOne\.name\}[\s\S]*formatTeamPoints\(match\.team2Points\)/);
  assert.match(resultCss, /grid-template-columns:\s*minmax\(0, 1fr\)/);
});

test("2026 Scramble identity is stacked golfer names without a repeated team or Net Scramble label", () => {
  const participant = block(scorecardTable, "function Participant", "function ScoreCell");
  assert.match(participant, /stackPairingIdentities && participantNames\.length[\s\S]*pairingStyles\.pairingNames[\s\S]*participantNames\.map/);
  assert.match(participant, /Scramble scoring side/);
  assert.doesNotMatch(participant, /stackPairingIdentities \? <small>/);
  assert.doesNotMatch(participant, /\[participantNames\.join\(" and "\), scorecard\.teamName/);
});

test("Net Scramble uses the shared derived-row label without repeated identity", () => {
  const netParticipant = block(scorecardTable, "function NetParticipant", "function ScoreGrid");
  assert.match(netParticipant, /className=\{pairingStyles\.derivedRowLabel\}>\{netRow\.label\}<\/span>/);
  assert.doesNotMatch(netParticipant, /toLowerCase\(\) === "net scramble"/);
  assert.match(pairingCss, /\.derivedRowLabel\s*\{[\s\S]*text-transform:\s*uppercase/);
});

test("Best Ball derived rows retain identity accessibly without repeating visible golfer names", () => {
  const netParticipant = block(scorecardTable, "function NetParticipant", "function ScoreGrid");
  assert.match(netParticipant, /pairingCards[\s\S]*scorecard\.playerName/);
  assert.match(netParticipant, /participantIdentity = players\.map[\s\S]*\.join\(" and "\) \|\| netRow\.name/);
  assert.match(netParticipant, /pairingStyles\.visuallyHidden[\s\S]*\{participantIdentity\}\. \{netRow\.label\}/);
  assert.doesNotMatch(netParticipant, /players\.map\(\(player\) => <strong/);
});

test("Scramble net rows retain both canonical golfer names in their accessible identity", () => {
  const netParticipant = block(scorecardTable, "function NetParticipant", "function ScoreGrid");
  assert.match(netParticipant, /scorecard\.participantNames \|\| \[\]/);
  assert.match(netParticipant, /players\.map\(\(player\) => player\.name\)\.join\(" and "\)/);
  assert.match(netParticipant, /pairingStyles\.visuallyHidden/);
});

test("Singles scorecard rendering remains on the unchanged individual identity path", () => {
  const participant = block(scorecardTable, "function Participant", "function ScoreCell");
  assert.match(participant, /scorecard\.scoreType === "TEAM"/);
  assert.match(participant, /scorecard\.playerName \|\| scorecard\.playerId \|\| "Player"/);
  assert.match(matchRow, /stackPairingIdentities=\{use2026Presentation\}/);
});

test("2026 Round Statistics place Birdie Leader before course-difficulty statistics", () => {
  const currentOrder = block(roundPage, "const roundStatisticItems = useSupabase2026", "const applicableRoundStatisticItems");
  const birdie = currentOrder.indexOf("birdieLeaderStatisticItem");
  const hardest = currentOrder.indexOf("hardestHoleStatisticItem");
  const easiest = currentOrder.indexOf("easiestHoleStatisticItem");
  assert.ok(birdie > -1 && birdie < hardest && hardest < easiest);
  assert.match(currentOrder, /lowestFrontNineStatisticItem[\s\S]*lowestBackNineStatisticItem[\s\S]*averageScoreStatisticItem[\s\S]*birdieLeaderStatisticItem/);
});

test("completed-year statistic rendering uses the final format-aware order", () => {
  const completedOrder = block(roundPage, "const completedHistoryRoundStatisticItems", "const roundStatisticItems = useSupabase2026");
  assert.match(completedOrder, /orderCompletedHistoryRoundStatistics/);
  assert.match(completedOrder, /lowestFrontNine:[\s\S]*lowestBackNine:[\s\S]*lowestRound:[\s\S]*lowestTeamRound:[\s\S]*birdieLeader:[\s\S]*averageScore:[\s\S]*hardestHole:[\s\S]*easiestHole:/);
  assert.match(roundPage, /completedHistoryMaster \? completedHistoryRoundStatisticItems : legacyHistoricalRoundStatisticItems/);
});

test("Most Birdies and inapplicable zero-sample statistics remain excluded from 2026", () => {
  assert.match(roundPage, /!completed2025 && !useSupabase2026[\s\S]*label: "Most Birdies"/);
  assert.match(roundPage, /item\.value !== "—"/);
  assert.match(roundPage, /!\/\^Based on 0 recorded\/i/);
});

test("Patrick Noonan and the 24-row inline standings correction remain frozen", () => {
  assert.match(yearPage, /data-current-standings-disclosure/);
  assert.match(yearPage, /View Full Standings/);
  assert.match(yearPage, /Show Top 5/);
  assert.doesNotMatch(yearPage, /View Full Leaderboard|router\.push|fetch\(/);
});

test("the approved 2026 reference remains on its dedicated HistoricalMatchRow path", () => {
  assert.match(matchRow, /use2026Presentation = Number\(tournament\?\.year\) === 2026/);
  assert.match(roundPage, /useSupabase2026 \? <HistoricalMatchRow/);
  assert.match(roundPage, /: <PublicMatchCard/);
});

test("Step 3A.8A adds no request, endpoint, source, cache, or dependency", () => {
  for (const value of [matchRow, scorecardTable, roundPage]) {
    assert.doesNotMatch(value, /fetch\(|axios|\/api\/live|gviz|createClient|supabase\.from|localStorage|sessionStorage/i);
  }
  assert.deepEqual(Object.keys(packageJson.dependencies).sort(), [
    "@supabase/ssr", "@supabase/supabase-js", "@vercel/analytics", "libphonenumber-js", "next", "openai", "qrcode", "react", "react-dom", "web-push",
  ]);
});
