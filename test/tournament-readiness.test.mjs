import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { tournamentReadiness } from "../lib/tournament-readiness.js";
import { directorReadinessLifecycle } from "../lib/tournament-director.js";

const future = "2099-01-01T00:00:00.000Z";
const subscription = JSON.stringify({ endpoint: "https://push.example/subscription", keys: { p256dh: "public-key", auth: "auth-key" } });
const players = [
  { id: "P1", name: "Ready Player", photo: "ready.webp" },
  { id: "P2", name: "Needs Setup", photo: "" },
];
const passports = [
  { "Tournament ID": "T1", "Player ID": "P1", "Activation Used At": "2026-01-01" },
  { "Tournament ID": "T1", "Player ID": "P2", "Activation Used At": "" },
];
const devices = [
  { "Tournament ID": "T1", "Player ID": "P1", "Expires At": future, "PWA Installed": "TRUE", "Notification Permission": "granted", "Push Subscription": subscription },
];
const handicaps = [{ "Player ID": "P1", "Team ID": "TEAM-1" }];

test("Tournament Readiness reports every trusted setup signal and missing player", () => {
  const model = tournamentReadiness({ tournamentId: "T1", players, passports, devices, handicaps, matches: [] });
  assert.equal(model.totalPlayers, 2);
  assert.equal(model.readyPlayers, 1);
  assert.equal(model.tournamentReady, false);
  assert.deepEqual(model.items.map(({ id, complete, total }) => ({ id, complete, total })), [
    { id: "passport", complete: 1, total: 2 },
    { id: "pwa", complete: 1, total: 2 },
    { id: "notifications", complete: 1, total: 2 },
    { id: "photos", complete: 1, total: 2 },
    { id: "teams", complete: 1, total: 2 },
  ]);
  assert.deepEqual(model.reminders.notifications, [{ id: "P2", name: "Needs Setup" }]);
});

test("team assignment can come from official match participation", () => {
  const model = tournamentReadiness({ tournamentId: "T1", players: [players[1]], passports: [], devices: [], handicaps: [], matches: [{ "Team 2 Player 1": "P2" }] });
  assert.equal(model.players[0].teamAssigned, true);
});

test("24 of 24 complete produces Tournament Ready", () => {
  const completePlayers = Array.from({ length: 24 }, (_, index) => ({ id: `P${index}`, name: `Player ${index}`, photo: `${index}.webp` }));
  const completeDevices = completePlayers.map((player) => ({ "Tournament ID": "T1", "Player ID": player.id, "Expires At": future, "PWA Installed": "TRUE", "Notification Permission": "granted", "Push Subscription": subscription }));
  const completePassports = completePlayers.map((player) => ({ "Tournament ID": "T1", "Player ID": player.id, "Activation Used At": "2026-01-01" }));
  const completeHandicaps = completePlayers.map((player) => ({ "Player ID": player.id, "Team ID": "TEAM-1" }));
  const model = tournamentReadiness({ tournamentId: "T1", players: completePlayers, passports: completePassports, devices: completeDevices, handicaps: completeHandicaps });
  assert.equal(model.tournamentReady, true);
  assert.equal(model.readyPlayers, 24);
});

test("Readiness is primary only before the first round opens", () => {
  assert.equal(directorReadinessLifecycle([{ status: "UPCOMING" }, { status: "UPCOMING" }]), "setup");
  assert.equal(directorReadinessLifecycle([{ status: "LIVE" }, { status: "UPCOMING" }]), "operations");
  assert.equal(directorReadinessLifecycle([{ status: "FINAL" }, { status: "UPCOMING" }]), "operations");
});

test("Director drill-down and Home setup banners consume shared readiness", async () => {
  const [director, home, banner, route, writer] = await Promise.all([
    readFile(new URL("../app/admin/director/DirectorDashboard.js", import.meta.url), "utf8"),
    readFile(new URL("../app/PersonalizedPlayerHome.js", import.meta.url), "utf8"),
    readFile(new URL("../app/PlayerSetupBanner.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/player-passport/readiness/route.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/google-sheets-write.js", import.meta.url), "utf8"),
  ]);
  assert.match(director, /Tournament Readiness/);
  assert.match(director, /Players needing setup/);
  assert.match(director, /Players Ready/);
  assert.match(director, /data\.readinessLifecycle === "setup"/);
  assert.match(director, /<summary>Pre-Tournament Setup<\/summary>/);
  assert.match(home, /<PlayerSetupBanner readiness=\{payload\?\.readiness\}/);
  assert.match(banner, /Get the full tournament experience/);
  assert.match(banner, /Never miss a match update/);
  assert.match(banner, /Notification\.requestPermission/);
  assert.match(route, /verifyPlayerPassportSession/);
  assert.match(writer, /requireIsolatedScoringSheet\(\);[\s\S]*updatePlayerReadiness/);
  assert.match(writer, /"PWA Installed"[\s\S]*"Notifications Enabled"/);
});
