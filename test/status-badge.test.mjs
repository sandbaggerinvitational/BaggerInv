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
  for (const status of ["LIVE", "UPCOMING", "FINAL", "CURRENT MATCH", "LOCKED"]) {
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

test("standalone status pills and match status blocks use the shared status system", async () => {
  const badgePaths = [
    "app/TournamentIdentityHeader.js",
    "app/TournamentCommandCenter.js",
    "app/live/LeaderboardsDashboard.js",
    "app/live/MatchCenter.js",
    "app/admin/live-matches/LiveMatchControl.js",
    "app/history/[year]/page.js",
  ];
  for (const path of badgePaths) {
    const source = await read(path);
    assert.match(source, /StatusBadge/, path);
  }
  const blockPaths = [
    "app/PersonalizedPlayerHome.js",
    "app/score/MyMatchDashboard.js",
    "app/live/TournamentDashboard.js",
    "app/game-center/GameCenter.js",
    "app/PublicMatchCard.js",
  ];
  for (const path of blockPaths) {
    const source = await read(path);
    assert.match(source, /MatchStatusBlock/, path);
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

test("shared MatchStatusBlock centers one badge and every result on one fixed axis", async () => {
  const [component, styles] = await Promise.all([
    read("app/MatchStatusBlock.js"),
    read("app/match-status-block.module.css"),
  ]);
  assert.match(component, /<StatusBadge status=\{status\}/);
  assert.equal((component.match(/<StatusBadge/g) || []).length, 1);
  assert.match(component, /result \? <strong/);
  assert.match(styles, /justify-items: center/);
  assert.match(styles, /gap: 2px/);
  assert.match(styles, /\.block \{[^}]*width: 112px/s);
  assert.match(styles, /\.block \{[^}]*min-width: 112px/s);
  assert.match(styles, /text-align: center/);
  assert.match(styles, /\.badge \{[^}]*width: 104px/s);
  assert.doesNotMatch(styles, /justify-self: end|justify-items: end/);
  assert.match(styles, /\.block strong \{[^}]*white-space: nowrap/s);
  for (const result of [
    "Won 1 UP",
    "Won 2 UP",
    "Won 3 & 2",
    "Won 5 & 4",
    "Halved",
    "Lost 1 UP",
    "Lost 2 & 1",
  ]) {
    assert.ok(result.length <= 10, `${result} fits the shared non-wrapping result width`);
  }
});

test("completed statuses use FINAL exclusively", async () => {
  const [component, formatter, styles] = await Promise.all([
    read("app/StatusBadge.js"),
    read("lib/formatters.js"),
    read("app/status-badge.module.css"),
  ]);
  assert.doesNotMatch(component, /MATCH COMPLETE|Match Complete/);
  assert.doesNotMatch(formatter, /Match Complete/);
  assert.doesNotMatch(styles, /MATCH-COMPLETE/);
  assert.match(formatter, /if \(complete\) return "Final"/);
});

test("completed participant matches resolve Final before stale scoring flags", async () => {
  const { appMatchStatus } = await import("../lib/mobile-tournament-app.js");
  assert.equal(appMatchStatus({
    status: "Final",
    scoringEnabled: true,
    accessActive: true,
    result: { officialResult: "The Pickles 2 UP" },
  }), "Final");
  assert.equal(appMatchStatus({
    status: "Scheduled",
    accessActive: true,
    result: { winner: "Halved" },
  }), "Final");
});

test("match cards render exactly one shared status-result block", async () => {
  for (const path of [
    "app/PersonalizedPlayerHome.js",
    "app/score/MyMatchDashboard.js",
    "app/live/TournamentDashboard.js",
    "app/game-center/GameCenter.js",
    "app/PublicMatchCard.js",
  ]) {
    const source = await read(path);
    assert.match(source, /MatchStatusBlock/, path);
  }
  const myMatch = await read("app/score/MyMatchDashboard.js");
  assert.equal((myMatch.match(/<MatchStatusBlock/g) || []).length, 1);
  assert.doesNotMatch(myMatch, /<StatusBadge/);
});
