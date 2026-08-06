import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createPlayerPassportSession, previewPlayerFromRecords, verifyPlayerPassportSession } from "../lib/player-passport.js";
import { isTournamentDirectorActor } from "../lib/player-role.js";
import { notificationPreviewContextForPlayer, previewNotificationTemplate } from "../lib/notification-templates.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("signed Passport sessions retain the Director actor while selecting a Preview golfer", () => {
  const secret = "preview-impersonation-secret-long-enough";
  const token = createPlayerPassportSession({
    playerId: "DIRECTOR-1", tournamentId: "SBI-2026", deviceId: "device-1",
    sessionVersion: 2, impersonatedPlayerId: "PLAYER-5",
    previewDirector: { id: "DIRECTOR-1", name: "Tournament Director", role: "DIRECTOR" },
  }, secret);
  const session = verifyPlayerPassportSession(token, secret);
  assert.equal(session.playerId, "DIRECTOR-1");
  assert.equal(session.impersonatedPlayerId, "PLAYER-5");
  assert.equal(session.previewDirector.role, "DIRECTOR");
  assert.equal(isTournamentDirectorActor({ actor: { role: "DIRECTOR" }, player: { role: "PLAYER" } }), true);
});

test("impersonation API and QA Tools are strictly Preview gated", async () => {
  const [route, dashboard, directorRoute] = await Promise.all([
    source("app/api/director/impersonation/route.js"),
    source("app/admin/director/DirectorDashboard.js"),
    source("app/api/director/route.js"),
  ]);
  assert.match(route, /process\.env\.VERCEL_ENV !== "preview"/);
  assert.match(route, /inspectTournamentDirectorToken/);
  assert.match(route, /playerPassportCookie\(sessionToken/);
  assert.match(route, /export async function DELETE/);
  assert.match(directorRoute, /qaTools: preview\.preview/);
  assert.match(dashboard, /QA Tools/);
  assert.match(dashboard, /Preview As/);
  assert.match(dashboard, /Preview the app as the selected golfer\./);
  assert.match(dashboard, /onChange=\{\(event\) => \{ const playerId = event\.target\.value; setTestPlayerId\(playerId\); previewAsPlayer\(playerId\); \}\}/);
  assert.match(dashboard, /window\.dispatchEvent\(new Event\("player-passport-changed"\)\)[\s\S]*router\.push\("\/home"\)/);
  assert.doesNotMatch(dashboard, /Change Player/);
  assert.match(dashboard, /DirectorOperationsHub/);
  assert.match(dashboard, /title="Preview Tools"/);
});

test("participant shell exposes one persistent Preview identity with explicit controls", async () => {
  const [sessionRoute, shell, writer, server, profile] = await Promise.all([
    source("app/api/player-passport/session/route.js"),
    source("app/ParticipantIdentity.js"),
    source("lib/google-sheets-write.js"),
    source("lib/player-passport-server.js"),
    source("app/me/ParticipantProfile.js"),
  ]);
  assert.match(sessionRoute, /result\.identity\.impersonating/);
  assert.match(shell, /Preview Mode/);
  assert.match(shell, /Viewing as/);
  assert.match(shell, /Exit Preview/);
  assert.match(shell, /Change Preview Player/);
  assert.doesNotMatch(shell, /Return to Director/);
  assert.match(shell, /method: "DELETE"/);
  assert.match(shell, /router\.replace\("\/admin\/director"\)/);
  assert.match(server, /isPreviewImpersonationSession\(session\)[\s\S]*resolvePreviewImpersonationIdentity\(session\)/);
  assert.match(writer, /previewMode\s*\? \["Players", "Tournaments", "Handicaps", "Live Matches", "Courses", "Team Names", "Live Hole Scores"\]/);
  assert.match(writer, /readiness: previewMode \?/);
  assert.match(profile, /!previewMode \? <section/);
  assert.match(writer, /playerAppearsInMatch\(match, identity\.player\.id\)/);
  assert.match(writer, /playerMatchSides\(match, identity\.player\.id\)/);
});

test("notification previews resolve selected-player match context", () => {
  const player = { id: "P5", name: "Patrick Noonan" };
  const data = {
    tournament: { year: 2026, teamOne: { name: "The Pickles" }, teamTwo: { name: "Lipp It and Rip It" } },
    rounds: [{ matches: [{
      id: "2026-R1-5", round: 1, match: 5, status: "Scheduled", teeTime: "8:20 AM", formatName: "Singles",
      course: { name: "Turtle Point", tee: "Gold" }, team1Players: [player], team2Players: [{ id: "P9", name: "Jack Samis" }],
    }] }],
  };
  const context = notificationPreviewContextForPlayer(data, player);
  assert.equal(context.player, "Patrick Noonan");
  assert.equal(context.opponent, "Jack Samis");
  assert.equal(context.teeTime, "8:20 AM");
  assert.equal(previewNotificationTemplate("singles-pairing", context).body, "Round 1 • Singles\nvs Jack Samis\n8:20 AM • Gold Tees\nTurtle Point");
});

test("Preview identity switches cleanly among multiple active golfers", () => {
  const records = ["Clay Beltran", "David Tatum", "Patrick Noonan", "Jack Samis"].map((name, index) => ({
    "Player ID": `P${index + 1}`,
    "Display Name": name,
    Slug: name.toLowerCase().replaceAll(" ", "-"),
    Active: "TRUE",
    Role: "PLAYER",
  }));
  for (const [index, expectedName] of records.map((record) => record["Display Name"]).entries()) {
    const player = previewPlayerFromRecords(`P${index + 1}`, records);
    assert.equal(player.name, expectedName);
    assert.equal(player.id, `P${index + 1}`);
    assert.equal(player.active, true);
  }
  assert.equal(previewPlayerFromRecords("UNKNOWN", records), null);
});

test("Director Mode stays inside the installed PWA through same-origin client routing", async () => {
  const [menu, participantShell, dashboard, templates] = await Promise.all([
    source("app/Menu.js"),
    source("app/ParticipantIdentity.js"),
    source("app/admin/director/DirectorDashboard.js"),
    source("lib/notification-templates.js"),
  ]);
  assert.match(menu, /<Link className="directorMenuLink" href="\/admin\/director" prefetch=\{false\}/);
  assert.doesNotMatch(menu, /directorMenuLink[^\n]*(target=|window\.open|https?:\/\/)/);
  assert.match(participantShell, /useRouter/);
  assert.match(participantShell, /router\.replace\("\/admin\/director"\)/);
  assert.doesNotMatch(participantShell, /window\.location\.assign\("\/admin\/director"\)/);
  assert.match(dashboard, /router\.push\("\/home"\)/);
  assert.doesNotMatch(dashboard, /window\.location\.(?:assign|replace)|window\.open|target="_blank"/);
  for (const match of templates.matchAll(/url: \([^)]*\) => ([^,}\n]+)/g)) {
    assert.doesNotMatch(match[1], /https?:\/\//);
  }
});
