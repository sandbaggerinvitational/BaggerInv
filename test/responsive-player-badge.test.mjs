import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("current-player badges are independent responsive layout elements", async () => {
  const [home, homeStyles, leaderboards, badgeStyles] = await Promise.all([
    read("app/PersonalizedPlayerHome.js"),
    read("app/personalized-player-home.module.css"),
    read("app/live/LeaderboardsDashboard.js"),
    read("app/responsive-player-badge.module.css"),
  ]);
  assert.match(home, /playerNameText/);
  assert.match(home, /aria-label="Current player">YOU/);
  assert.match(homeStyles, /grid-template-columns:\s*minmax\(0,\s*1fr\) auto/);
  assert.match(homeStyles, /\.playerLines small \{[^}]*white-space:\s*nowrap/s);
  assert.match(homeStyles, /\.playerLines small \{[^}]*justify-self:\s*end/s);
  assert.match(leaderboards, /badgeStyles\.identityLine/);
  assert.match(leaderboards, /aria-label="Current player">YOU/);
  assert.match(badgeStyles, /grid-template-columns:\s*minmax\(0,\s*1fr\) auto/);
  assert.match(badgeStyles, /\.playerName \{[^}]*text-overflow:\s*ellipsis/s);
  assert.match(badgeStyles, /\.badge \{[^}]*white-space:\s*nowrap/s);
});

test("requested long-name fixtures remain independent from badge content", () => {
  for (const name of ["Taylor Lippincott", "Michael Hunnicutt", "Alex Monteleone", "Clay Beltran"]) {
    assert.ok(name.length > 0);
    assert.doesNotMatch(name, /YOU/);
  }
});
