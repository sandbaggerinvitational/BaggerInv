import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isTournamentRecapPhase, projectionPresentationLabel, tournamentRecapFromSnapshot } from "../lib/projection-phases.js";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("participant labels preserve every internal publication identifier", () => {
  assert.equal(projectionPresentationLabel("Pre-Tournament"), "Opening Championship Projection");
  assert.equal(projectionPresentationLabel("After Round 1"), "Round 2 Pairings Projection");
  assert.equal(projectionPresentationLabel("After Round 2"), "Championship Outlook");
  assert.equal(projectionPresentationLabel("Round 3 Pairings Announced"), "Championship Singles Projection");
  assert.equal(projectionPresentationLabel("Final Results"), "Tournament Recap");
  assert.equal(isTournamentRecapPhase("Final Results"), true);
});

test("Tournament Recap derives official presentation from the published snapshot", () => {
  const recap = tournamentRecapFromSnapshot({
    teams: [{ side: 2, name: "B", expectedPoints: 30 }, { side: 1, name: "A", expectedPoints: 42 }],
    players: [{ id: "b", name: "B", expectedPoints: 2 }, { id: "a", name: "A", expectedPoints: 4 }],
  });
  assert.equal(recap.champions[0].name, "A");
  assert.equal(recap.pointsLeaders[0].name, "A");
});

test("Website and PWA consume the same authoritative published snapshot", async () => {
  const website = await read("app/odds-center/page.js");
  const pwa = await read("app/api/leaderboards/insights/route.js");
  const writer = await read("lib/google-sheets-write.js");
  assert.match(website, /readOddsSnapshots/);
  assert.match(pwa, /readOddsSnapshots/);
  assert.match(writer, /replaceRuntimeRecords\("Odds Snapshots"/);
  assert.doesNotMatch(`${website}\n${pwa}`, /simulateTournamentOdds/);
});

test("Director publishing uses participant labels and refreshes every shared consumer", async () => {
  const admin = await read("app/odds-center/admin/OddsAdmin.js");
  const route = await read("app/api/odds/publish/route.js");
  assert.match(admin, />Championship Projections</);
  assert.match(admin, /Generate & Publish Official Projection/);
  assert.match(admin, /projectionPresentationLabel/);
  for (const path of ["/odds-center", "/live", "/home"]) assert.match(route, new RegExp(path.replace("/", "\\/")));
});

test("Final Results transitions Website and PWA into Tournament Recap", async () => {
  const website = await read("app/odds-center/OddsCenter.js");
  const pwa = await read("app/live/LeaderboardsDashboard.js");
  assert.match(website, /isTournamentRecapPhase/);
  assert.match(pwa, /isTournamentRecapPhase/);
  assert.match(website, /Tournament Recap/);
  assert.match(pwa, /Championship Projections are now closed/);
});
