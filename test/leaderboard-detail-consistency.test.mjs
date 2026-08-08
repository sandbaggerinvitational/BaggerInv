import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Best Ball and Singles rows open one shared player round summary", async () => {
  const [dashboard, shared] = await Promise.all([
    read("app/live/LeaderboardsDashboard.js"),
    read("app/live/LeaderboardRow.js"),
  ]);
  assert.match(dashboard, /onClick=\{\(\) => setSelectedId\(row\.id\)\}/);
  assert.match(dashboard, /title=\{clean\(round\?\.format\).*"Singles Player" : "Best Ball Player"\}/);
  assert.match(dashboard, /matchId=\{selectedMatch\?\.id\}/);
  for (const label of ["Current Rank", "Final Rank", "THRU", "Gross Score", "Net Score", "Net +/-", "View Scorecard"]) assert.match(shared, new RegExp(label.replace("+", "\\+")));
});

test("Scramble uses the same summary shell without duplicating a scorecard", async () => {
  const source = await read("app/live/ScrambleLeaderboard.js");
  assert.match(source, /<RoundLeaderboardSheet title="Scramble Pairing"/);
  assert.match(source, /matchId=\{match\?\.id\}/);
  assert.doesNotMatch(source, /row\.scorecard|Hole-by-Hole Scoring/);
});

test("View Scorecard targets the canonical Game Center and preserves leaderboard return state", async () => {
  const [dashboard, shared] = await Promise.all([
    read("app/live/LeaderboardsDashboard.js"),
    read("app/live/LeaderboardRow.js"),
  ]);
  assert.match(shared, /`\/game-center\/\$\{encodeURIComponent\(matchId\)\}\?from=\$\{encodeURIComponent\(returnTo\)\}`/);
  assert.match(dashboard, /`\/live\?view=leaderboards&tab=players&round=\$\{encodeURIComponent\(selectedRound\)\}`/);
});

test("Overall keeps its expanded tournament summary and Net Skins keeps hole storytelling", async () => {
  const dashboard = await read("app/live/LeaderboardsDashboard.js");
  assert.match(dashboard, /isOpen \? <div className=\{leaderboardStyles\.details\}><PlayerDetails/);
  assert.doesNotMatch(dashboard.slice(dashboard.indexOf("function OverallPlayers"), dashboard.indexOf("function RoundPlayers")), /Hole-by-Hole/);
  assert.match(dashboard, /Hole-by-Hole Net Skins Results/);
  assert.match(dashboard, /holeResults/);
});

test("leaderboard details reuse loaded round data and add no request path", async () => {
  const [dashboard, scramble, shared] = await Promise.all([
    read("app/live/LeaderboardsDashboard.js"),
    read("app/live/ScrambleLeaderboard.js"),
    read("app/live/LeaderboardRow.js"),
  ]);
  assert.match(dashboard, /round\?\.matches \|\| \[\]/);
  assert.match(scramble, /matches\.find/);
  assert.doesNotMatch(`${scramble}\n${shared}`, /fetch\(|google|workbook|spreadsheet/i);
});
