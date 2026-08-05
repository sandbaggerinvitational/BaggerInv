import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Tournament and Leaderboards share the approved primary page container", async () => {
  const [tournament, leaderboards, container] = await Promise.all([
    source("app/live/TournamentDashboard.js"),
    source("app/live/LeaderboardsDashboard.js"),
    source("app/primary-page-container.module.css"),
  ]);
  for (const page of [tournament, leaderboards]) {
    assert.match(page, /import containerStyles from "\.\.\/primary-page-container\.module\.css"/);
    assert.match(page, /\$\{styles\.page\} \$\{containerStyles\.primary\}/);
  }
  assert.match(container, /width:\s*min\(calc\(100% - 24px\)/);
  assert.match(container, /margin:\s*10px auto 0/);
  assert.match(container, /border:\s*1px solid var\(--home-card-border/);
  assert.match(container, /border-radius:\s*var\(--home-card-radius, 20px\)/);
  assert.match(container, /box-shadow:\s*var\(--home-card-shadow/);
});

test("both dashboards retain their established content widths and functionality", async () => {
  const [tournamentStyles, leaderboardStyles, tournament, leaderboards] = await Promise.all([
    source("app/live/tournament-dashboard.module.css"),
    source("app/live/leaderboards-dashboard.module.css"),
    source("app/live/TournamentDashboard.js"),
    source("app/live/LeaderboardsDashboard.js"),
  ]);
  assert.match(tournamentStyles, /--primary-page-max-width:860px/);
  assert.match(leaderboardStyles, /--primary-page-max-width:760px/);
  assert.match(tournament, /<Snapshot tournament=/);
  assert.match(leaderboards, /<OverallPlayers|<Insights/);
});
