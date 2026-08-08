import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("all round rows and shared headers include consistently formatted Points", async () => {
  const [dashboard, scramble, css] = await Promise.all([
    read("app/live/LeaderboardsDashboard.js"), read("app/live/ScrambleLeaderboard.js"), read("app/live/scramble-leaderboard.module.css"),
  ]);
  assert.match(dashboard, /\["points", "Points"\]/);
  assert.match(scramble, /\["points", "Team Points"\]/);
  assert.match(`${dashboard}\n${scramble}`, /formatPlayerPoints\(row\.points\)/);
  assert.match(css, /\.columnMetrics\{[^}]*repeat\(5/);
  assert.match(css, /\.metrics\{[^}]*repeat\(5/);
});

test("round detail sheets contain Round Points and the shared match breakdown", async () => {
  const [shared, breakdown] = await Promise.all([read("app/live/LeaderboardRow.js"), read("lib/leaderboard-round-breakdown.js")]);
  for (const label of ["Round Points", "Match Breakdown", "Match Result", "Points"]) assert.match(shared, new RegExp(label));
  for (const label of ["Front 9", "Back 9", "Overall"]) assert.match(breakdown, new RegExp(label));
  assert.match(shared, /<StatusBadge status=\{breakdown\.label\}/);
  assert.doesNotMatch(shared, /scorecard\.map|Hole-by-Hole Scoring/);
});

test("Overall centers identity and reuses the shared LIVE status pill", async () => {
  const dashboard = await read("app/live/LeaderboardsDashboard.js");
  assert.match(dashboard, /identity=\{<>.*PlayerLeaderboardIdentity.*<StatusBadge status=\{complete \? "Final" : "Live"\}/s);
});

test("competition changes preserve instant in-memory round navigation", async () => {
  const dashboard = await read("app/live/LeaderboardsDashboard.js");
  assert.match(dashboard, /window\.history\.pushState/);
  assert.doesNotMatch(dashboard, /router\.(push|replace)/);
  assert.doesNotMatch(dashboard, /fetch\([^)]*round/);
});
