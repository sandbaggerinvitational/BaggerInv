import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isLegacyCalcuttaModule, LEADERBOARD_MODULES, normalizeLeaderboardModule } from "../lib/leaderboards-navigation.js";
import { PLAYER_METRICS, rankPlayerRows, searchPlayerRows } from "../lib/mobile-leaderboards.js";

const dashboardUrl = new URL("../app/live/LeaderboardsDashboard.js", import.meta.url);
const rowUrl = new URL("../app/live/LeaderboardRow.js", import.meta.url);
const dashboardStylesUrl = new URL("../app/live/leaderboards-dashboard.module.css", import.meta.url);
const rowStylesUrl = new URL("../app/live/scramble-leaderboard.module.css", import.meta.url);
const teamStylesUrl = new URL("../app/live/teams-leaderboard.module.css", import.meta.url);
const skinsStylesUrl = new URL("../app/live/net-skins.module.css", import.meta.url);

test("mobile Leaderboards keeps the frozen four-module contract and Players default", () => {
  assert.deepEqual(LEADERBOARD_MODULES.map(({ label }) => label), ["Players", "Teams", "Net Skins", "Insights"]);
  assert.equal(LEADERBOARD_MODULES.length, 4);
  assert.equal(normalizeLeaderboardModule(""), "players");
  assert.equal(normalizeLeaderboardModule("calcutta"), "players");
  assert.equal(isLegacyCalcuttaModule("calcutta"), true);
});

test("Players uses one compact accessible Round and Rank By control surface", async () => {
  const [source, css] = await Promise.all([readFile(dashboardUrl, "utf8"), readFile(dashboardStylesUrl, "utf8")]);
  assert.match(source, /className=\{styles\.rankingControls\} aria-label="Leaderboard filters"/);
  assert.match(source, /aria-label="Round filter"/);
  assert.match(source, /aria-label="Rank players by"/);
  assert.match(source, /tab === "players" && selectedRound === "overall"/);
  assert.match(source, /!\["insights", "skins"\]\.includes\(tab\)/);
  assert.match(css, /\.rankingControls label\{[^}]*min-height:44px/);
  assert.match(css, /\.tabs button,.roundSelector button\{[^}]*min-height:44px/);
  assert.match(css, /\.tabs\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)\}/);
});

test("all five established player metrics remain available with Points first", () => {
  assert.deepEqual(PLAYER_METRICS, [
    ["points", "Points"],
    ["wins", "Wins"],
    ["winPct", "Win %"],
    ["grossAvg", "Gross Avg"],
    ["netAvg", "Net Avg"],
  ]);
});

test("native player rows prioritize rank, full identity, one metric, and current-player semantics", async () => {
  const [dashboard, row, css] = await Promise.all([readFile(dashboardUrl, "utf8"), readFile(rowUrl, "utf8"), readFile(rowStylesUrl, "utf8")]);
  assert.match(dashboard, /variant="overall"/);
  assert.match(dashboard, /team=\{row\.team\} meta=\{row\.record\}/);
  assert.match(dashboard, /current player, your position/);
  assert.match(row, /aria-label="Current player">YOU/);
  assert.match(row, /\[team, meta\]\.filter\(Boolean\)\.join\(" · "\)/);
  assert.match(css, /\.entry\[data-variant=overall\]\{grid-template-columns:[^}]*min-height:74px/);
  assert.match(css, /\.entry\[data-variant=overall\]>.metrics\{grid-column:3;grid-template-columns:1fr/);
  assert.match(css, /\.entry\[data-variant=overall\]\[data-current=true\]/);
  assert.match(css, /data-podium/);
});

test("ranking and search semantics preserve ties, full names, and local filtering", () => {
  const rows = [
    { id: "1", player: "Michael Hunnicutt", points: 4.75, wins: 2, losses: 0 },
    { id: "2", player: "Taylor Lippincott", points: 3, wins: 1, losses: 0 },
    { id: "3", player: "Alex Monteleone", points: 3, wins: 1, losses: 0 },
  ];
  const ranked = rankPlayerRows(rows, "points");
  assert.deepEqual(ranked.map(({ displayRank }) => displayRank), [1, 2, 2]);
  assert.equal(searchPlayerRows(ranked, "lippincott")[0].player, "Taylor Lippincott");
  assert.deepEqual(searchPlayerRows(ranked, "not present"), []);
});

test("search is colocated with the board and retains a compact empty state", async () => {
  const source = await readFile(dashboardUrl, "utf8");
  assert.match(source, /className=\{styles\.playerBoardHeader\}/);
  assert.match(source, /placeholder="Search players"/);
  assert.match(source, /aria-label="Clear player search"/);
  assert.match(source, /<strong>No players found\.<\/strong>/);
  assert.match(source, /className=\{styles\.playerCount\}>\{ranked\.length\} players/);
});

test("Teams and Net Skins use module-specific native summaries", async () => {
  const [source, teamCss, skinsCss] = await Promise.all([readFile(dashboardUrl, "utf8"), readFile(teamStylesUrl, "utf8"), readFile(skinsStylesUrl, "utf8")]);
  assert.match(source, /className=\{teamStyles\.teamRank\}/);
  assert.match(source, /className=\{teamStyles\.teamIdentity\}/);
  assert.match(source, /className=\{teamStyles\.teamMetrics\}/);
  assert.match(teamCss, /Two-team standings are summaries/);
  assert.match(source, /className=\{skinsStyles\.skinMetric\}/);
  assert.match(source, /className=\{skinsStyles\.winningsMetric\}/);
  assert.match(skinsCss, /Mobile Net Skins rows prioritize golfer identity, skins, and winnings/);
});

test("polish is presentation-only and does not add a leaderboard request path", async () => {
  const source = await readFile(dashboardUrl, "utf8");
  assert.equal((source.match(/fetchWithTransientRetry\(secondaryReadUrl/g) || []).length, 1);
  assert.equal((source.match(/fetch\(`\/api\/leaderboards\/insights/g) || []).length, 1);
  assert.doesNotMatch(source, /googleapis|script\.google|sheets\.google|\/api\/google/);
  assert.doesNotMatch(source, /calcutta/i);
});
