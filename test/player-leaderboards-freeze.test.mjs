import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("current golfer treatment is shared by Overall, Best Ball, Scramble, and Singles", async () => {
  const [dashboard, scramble, shared] = await Promise.all([
    read("app/live/LeaderboardsDashboard.js"), read("app/live/ScrambleLeaderboard.js"), read("app/live/LeaderboardRow.js"),
  ]);
  assert.match(dashboard, /<RoundPlayers data=\{data\} selectedRound=\{selectedRound\} currentPlayer=\{currentPlayer\}/);
  assert.match(dashboard, /current=\{isCurrent\}/);
  assert.match(scramble, /row\.playerIds\.some/);
  assert.match(scramble, /current=\{isCurrent\}/);
  assert.match(shared, /data-current=\{current \|\| undefined\}/);
});

test("round summaries use authoritative values and one presentation-only net sentence", async () => {
  const shared = await read("app/live/LeaderboardRow.js");
  assert.match(shared, /function netPerformanceSummary/);
  assert.match(shared, /final \? "Finished" : "Currently playing"/);
  assert.match(shared, /value < 0 \? "under" : "over"/);
  assert.match(shared, /Currently playing/);
  assert.match(shared, /netPerformanceSummary\(netToPar, final\)/);
});

test("Overall round breakdown uses format-aware cards for every configured round", async () => {
  const source = await read("app/live/LeaderboardsDashboard.js");
  assert.match(source, /rounds\.map\(\(round\)/);
  assert.match(source, /\{round\.label\} • \{formatName\(round\.format\)\}/);
  assert.match(source, /<small>Record<\/small>/);
  assert.match(source, /<small>Points<\/small>/);
});

test("leaderboard hero and empty states use complete participant-facing language", async () => {
  const [dashboard, scramble] = await Promise.all([read("app/live/LeaderboardsDashboard.js"), read("app/live/ScrambleLeaderboard.js")]);
  assert.match(dashboard, /Player, team, round standings, and Championship projections\./);
  for (const copy of ["Scores pending.", "Round not started.", "official scores are recorded"]) assert.match(`${dashboard}\n${scramble}`, new RegExp(copy.replace(".", "\\.")));
  assert.doesNotMatch(`${dashboard}\n${scramble}`, /workbook|Google Sheets|API error/i);
});

test("freeze polish remains presentation-only and adds no data request", async () => {
  const [shared, scramble] = await Promise.all([read("app/live/LeaderboardRow.js"), read("app/live/ScrambleLeaderboard.js")]);
  assert.doesNotMatch(`${shared}\n${scramble}`, /fetch\(|google|workbook|spreadsheet/i);
});
