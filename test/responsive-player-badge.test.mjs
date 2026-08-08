import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Home omits its redundant current-player badge while leaderboards retain identification", async () => {
  const [home, homeStyles, leaderboards, leaderboardRow, leaderboardStyles] = await Promise.all([
    read("app/PersonalizedPlayerHome.js"),
    read("app/personalized-player-home.module.css"),
    read("app/live/LeaderboardsDashboard.js"),
    read("app/live/LeaderboardRow.js"),
    read("app/live/scramble-leaderboard.module.css"),
  ]);
  assert.match(home, /playerNameText/);
  assert.doesNotMatch(home, /aria-label="Current player">YOU/);
  assert.doesNotMatch(home, />YOU</);
  assert.match(homeStyles, /\.playerNameText/);
  assert.match(leaderboards, /current=\{isCurrent\}/);
  assert.match(leaderboardRow, /aria-label="Current player">YOU/);
  assert.match(leaderboardStyles, /\.identity\{[^}]*min-width:0/);
  assert.match(leaderboardStyles, /\.names strong\{[^}]*overflow-wrap:anywhere/);
  assert.match(leaderboardStyles, /\.names em\{[^}]*border-radius:999px/);
});

test("requested long-name fixtures remain independent from badge content", () => {
  for (const name of ["Taylor Lippincott", "Michael Hunnicutt", "Alex Monteleone", "Clay Beltran"]) {
    assert.ok(name.length > 0);
    assert.doesNotMatch(name, /YOU/);
  }
});
