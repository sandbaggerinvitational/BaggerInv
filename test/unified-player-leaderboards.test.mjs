import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Overall, Best Ball, Scramble, and Singles share one leaderboard row system", async () => {
  const [dashboard, scramble, row] = await Promise.all([
    read("app/live/LeaderboardsDashboard.js"),
    read("app/live/ScrambleLeaderboard.js"),
    read("app/live/LeaderboardRow.js"),
  ]);
  assert.match(dashboard, /<LeaderboardEntry[^>]+PlayerLeaderboardIdentity/);
  assert.match(dashboard, /Best Ball Player Leaderboard/);
  assert.match(dashboard, /Singles Player Leaderboard/);
  assert.match(scramble, /<LeaderboardEntry/);
  for (const component of ["LeaderboardRank", "PlayerLeaderboardIdentity", "LeaderboardMetrics", "LeaderboardEntry"]) assert.match(row, new RegExp(`export function ${component}`));
});

test("individual and pairing formats retain their distinct official metrics and identities", async () => {
  const [dashboard, scramble, row] = await Promise.all([
    read("app/live/LeaderboardsDashboard.js"),
    read("app/live/ScrambleLeaderboard.js"),
    read("app/live/LeaderboardRow.js"),
  ]);
  for (const label of ["Record", "Points", "THRU", "Gross", "Net", "Net +/-"]) assert.match(dashboard, new RegExp(label.replace("+", "\\+")));
  assert.match(dashboard, /roundScoreRows\(data\.scoreLeaderboard \|\| \[\], round\?\.number, round\?\.format, sort\)/);
  assert.match(scramble, /ScrambleTeamIdentity/);
  assert.match(row, /PlayerAvatar/);
  assert.match(dashboard, /round\?\.course\?\.name/);
});

test("unified leaderboards add no data source, polling, or workbook request", async () => {
  const [row, scramble] = await Promise.all([read("app/live/LeaderboardRow.js"), read("app/live/ScrambleLeaderboard.js")]);
  assert.doesNotMatch(`${row}\n${scramble}`, /fetch\(|google|workbook|spreadsheet/i);
});

test("unified rows stack on iPhone without horizontal scrolling", async () => {
  const css = await read("app/live/scramble-leaderboard.module.css");
  assert.match(css, /@media\(max-width:620px\)/);
  assert.match(css, /grid-column:2/);
  assert.match(css, /data-variant=overall/);
  assert.doesNotMatch(css, /overflow-x\s*:\s*(auto|scroll)/);
});
