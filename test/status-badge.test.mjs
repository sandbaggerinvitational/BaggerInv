import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("shared StatusBadge owns the supported status language and live dot", async () => {
  const [component, styles, tokens] = await Promise.all([
    read("app/StatusBadge.js"),
    read("app/status-badge.module.css"),
    read("app/globals.css"),
  ]);
  for (const status of ["LIVE", "UPCOMING", "FINAL", "CURRENT MATCH", "MATCH COMPLETE", "LOCKED"]) {
    assert.match(component, new RegExp(`\"${status}\"`));
  }
  assert.match(component, /supported === "LIVE" \? <i aria-hidden="true" \/>/);
  assert.match(tokens, /--tournament-green:/);
  assert.match(tokens, /--tournament-gold:/);
  assert.match(tokens, /--status-live-red:/);
  assert.match(tokens, /--status-upcoming-gray:/);
  assert.match(tokens, /--status-final-neutral:/);
  assert.match(tokens, /--status-locked-neutral:/);
  assert.match(styles, /\.badge\[data-status="LIVE"\] i/);
});

test("participant, admin, and historical status pills consume StatusBadge", async () => {
  const paths = [
    "app/TournamentIdentityHeader.js",
    "app/TournamentCommandCenter.js",
    "app/PersonalizedPlayerHome.js",
    "app/score/MyMatchDashboard.js",
    "app/live/TournamentDashboard.js",
    "app/game-center/GameCenter.js",
    "app/live/LeaderboardsDashboard.js",
    "app/live/MatchCenter.js",
    "app/admin/live-matches/LiveMatchControl.js",
    "app/PublicMatchCard.js",
    "app/history/[year]/page.js",
  ];
  for (const path of paths) {
    const source = await read(path);
    assert.match(source, /StatusBadge/, path);
  }
});

test("legacy page-specific status-pill selectors are removed", async () => {
  const sources = await Promise.all([
    read("app/tournament-command-center.module.css"),
    read("app/personalized-player-home.module.css"),
    read("app/score/my-match-dashboard.module.css"),
    read("app/game-center/game-center.module.css"),
    read("app/live/tournament-dashboard.module.css"),
    read("app/live/leaderboards-dashboard.module.css"),
    read("app/admin/live-matches/live-match-control.module.css"),
  ]);
  const combined = sources.join("\n");
  assert.doesNotMatch(combined, /headerLive|liveBadge/);
  assert.doesNotMatch(combined, /cardState>span\[data-status/);
  assert.doesNotMatch(combined, /matchIdentity>span\[data-state/);
  assert.doesNotMatch(combined, /matchState em\[data-state/);
  assert.doesNotMatch(combined, /roundBoard header em/);
});
