import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  LEADERBOARD_MODULES,
  isLegacyCalcuttaModule,
  normalizeLeaderboardModule,
  leaderboardModulesForNetSkinsState,
} from "../lib/leaderboards-navigation.js";
import { participantDestination } from "../lib/participant-shell.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("legacy module contract is preserved; current Supabase Leaderboards adds participant side games", async () => {
  assert.deepEqual(LEADERBOARD_MODULES.map(({ value, label }) => [value, label]), [
    ["players", "Players"],
    ["teams", "Teams"],
    ["skins", "Net Skins"],
    ["insights", "Insights"],
  ]);
  assert.equal(LEADERBOARD_MODULES.length, 4);

  const dashboard = await source("app/live/LeaderboardsDashboard.js");
  assert.equal((dashboard.match(/aria-label="Leaderboard category"/g) || []).length, 1);
  for (const supabase of [false, true]) {
    assert.deepEqual(leaderboardModulesForNetSkinsState({ state: "CONFIGURED", visible: true }, { supabase }), LEADERBOARD_MODULES);
    assert.deepEqual(leaderboardModulesForNetSkinsState({ state: "NOT_CONFIGURED", visible: false }, { supabase }).map(m => m.value),
      supabase ? ["players", "teams", "insights"] : ["players", "teams", "skins", "insights"]);
  }
  assert.match(dashboard, /normalizeLeaderboardModule\(params\.get\("tab"\)\)/);
  assert.doesNotMatch(dashboard, /CalcuttaExperience/);
  await (await import("./fixtures/release-gate-behavior.mjs")).leaderboardVisibilityContract(dashboard);
  assert.match(dashboard, /supabaseCore && params\.get\("tab"\) === "calcutta"/);
  assert.match(dashboard, /<ParticipantSideGames/);
});

test("legacy normalization remains bounded; current Supabase selection is tested independently", () => {
  for (const stale of ["calcutta", "CALCUTTA", "unknown", "", null, undefined]) {
    assert.equal(normalizeLeaderboardModule(stale), "players");
  }
  assert.equal(normalizeLeaderboardModule("skins"), "skins");
  assert.equal(isLegacyCalcuttaModule(" Calcutta "), true);
});

test("legacy Calcutta query intent redirects before Leaderboards data loads", async () => {
  const page = await source("app/live/page.js");
  const redirectCheck = page.indexOf("isLegacyCalcuttaModule(leaderboardTab)");
  assert.ok(redirectCheck > -1);
  assert.ok(redirectCheck < page.indexOf("requireTournamentReadSource(env)"));
  assert.match(page, /isLegacyCalcuttaModule\(leaderboardModule\)/);
  assert.match(page, /redirect\("\/live\?view=calcutta"\)/);
});

test("existing Tournament Calcutta deep link remains compatible", async () => {
  const [tournament, shell] = await Promise.all([
    source("app/live/TournamentDashboard.js"),
    source("lib/participant-shell.js"),
  ]);
  assert.match(tournament, /href="\/app\/tournament\?view=calcutta"/);
  assert.match(tournament, /<CalcuttaExperience model=\{data\.calcutta\}/);
  assert.equal(participantDestination("/app/tournament", "view=calcutta"), "Tournament");
  assert.doesNotMatch(shell, /Google|googleapis|script\.google/);
});

test("the installed PWA rechecks and activates the corrected navigation bundle", async () => {
  const [foundation, worker] = await Promise.all([
    source("app/PwaFoundation.js"),
    source("public/sw.js"),
  ]);
  assert.match(foundation, /updateViaCache: "none"/);
  assert.match(foundation, /registration\.update\(\)/);
  assert.match(worker, /const CACHE_VERSION = "sbi-shell-v6"/);
  assert.match(worker, /if \(url\.pathname\.startsWith\("\/_next\/"\)\) return/);
  assert.match(worker, /self\.skipWaiting\(\)/);
  assert.match(worker, /self\.clients\.claim\(\)/);
});
