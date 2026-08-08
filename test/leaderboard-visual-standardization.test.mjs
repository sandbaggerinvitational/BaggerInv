import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("leaderboard headers and rows share one responsive column grid", async () => {
  const [shared, dashboard, scramble, css] = await Promise.all([
    read("app/live/LeaderboardRow.js"), read("app/live/LeaderboardsDashboard.js"),
    read("app/live/ScrambleLeaderboard.js"), read("app/live/scramble-leaderboard.module.css"),
  ]);
  assert.match(shared, /export function LeaderboardColumnHeader/);
  assert.match(dashboard, /<LeaderboardColumnHeader/);
  assert.match(scramble, /<LeaderboardColumnHeader identityLabel="Pairing"/);
  assert.match(css, /\.columnGrid,\.entry\{--leaderboard-columns:/);
  assert.match(css, /grid-template-columns:var\(--leaderboard-columns\)/);
  assert.doesNotMatch(css, /overflow-x\s*:\s*(auto|scroll)/);
});

test("Overall uses the shared centered detail sheet and complete round breakdown", async () => {
  const source = await read("app/live/LeaderboardsDashboard.js");
  assert.match(source, /<LeaderboardDetailSheet title="Overall Player"/);
  for (const label of ["Overall Record", "Points", "Gross Average", "Net Average", "Round Breakdown"]) assert.match(source, new RegExp(label));
  assert.match(source, /team=\{row\.team\}/);
  assert.match(source, /rounds\.map/);
  assert.doesNotMatch(source, /className=\{leaderboardStyles\.details\}><PlayerDetails/);
});

test("all round sheets share context, status, metric cards, and canonical scorecard action", async () => {
  const [shared, dashboard, scramble] = await Promise.all([
    read("app/live/LeaderboardRow.js"), read("app/live/LeaderboardsDashboard.js"), read("app/live/ScrambleLeaderboard.js"),
  ]);
  assert.match(shared, /context=\{\{ primary: \[roundLabel, formatLabel\]/);
  assert.match(shared, /status=\{final \? "Final" : "Live"\}/);
  assert.match(shared, /View Scorecard/);
  assert.match(dashboard, /formatLabel=\{clean\(round\?\.format\).*"Singles" : "Best Ball"\}/);
  assert.match(scramble, /formatLabel="Scramble"/);
  assert.doesNotMatch(scramble, />Team Members</);
  assert.doesNotMatch(scramble, /Hole-by-Hole Scoring|row\.scorecard/);
});

test("shared sheet geometry centers identity and preserves sticky safe-area scrolling", async () => {
  const css = await read("app/live/scramble-leaderboard.module.css");
  assert.match(css, /\.sheetIdentity\{[^}]*align-items:center[^}]*justify-content:center/);
  assert.match(css, /\.sheet>header\{position:sticky/);
  assert.match(css, /max-height:calc\(90dvh - env\(safe-area-inset-top\)\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /-webkit-overflow-scrolling:touch/);
});
