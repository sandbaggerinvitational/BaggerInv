import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createPlayerPassportSession, verifyPlayerPassportSession } from "../lib/player-passport.js";
import { isTournamentDirectorActor } from "../lib/player-role.js";
import { notificationPreviewContextForPlayer, previewNotificationTemplate } from "../lib/notification-templates.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("signed Passport sessions retain the Director actor while selecting a Preview golfer", () => {
  const secret = "preview-impersonation-secret-long-enough";
  const token = createPlayerPassportSession({
    playerId: "DIRECTOR-1", tournamentId: "SBI-2026", deviceId: "device-1",
    sessionVersion: 2, impersonatedPlayerId: "PLAYER-5",
  }, secret);
  const session = verifyPlayerPassportSession(token, secret);
  assert.equal(session.playerId, "DIRECTOR-1");
  assert.equal(session.impersonatedPlayerId, "PLAYER-5");
  assert.equal(isTournamentDirectorActor({ actor: { role: "DIRECTOR" }, player: { role: "PLAYER" } }), true);
});

test("impersonation API and QA Tools are strictly Preview gated", async () => {
  const [route, dashboard, directorRoute] = await Promise.all([
    source("app/api/director/impersonation/route.js"),
    source("app/admin/director/DirectorDashboard.js"),
    source("app/api/director/route.js"),
  ]);
  assert.match(route, /process\.env\.VERCEL_ENV !== "preview"/);
  assert.match(route, /isTournamentDirectorActor/);
  assert.match(route, /playerPassportCookie\(sessionToken/);
  assert.match(route, /export async function DELETE/);
  assert.match(directorRoute, /qaTools: preview\.preview/);
  assert.match(dashboard, /QA Tools/);
  assert.match(dashboard, /Test As/);
  assert.match(dashboard, /Change Player/);
});

test("participant shell exposes a persistent and reversible Preview identity banner", async () => {
  const [sessionRoute, shell, writer] = await Promise.all([
    source("app/api/player-passport/session/route.js"),
    source("app/ParticipantIdentity.js"),
    source("lib/google-sheets-write.js"),
  ]);
  assert.match(sessionRoute, /result\.identity\.impersonating/);
  assert.match(shell, /Preview Mode/);
  assert.match(shell, /Viewing as/);
  assert.match(shell, /Return to Director/);
  assert.match(shell, /method: "DELETE"/);
  assert.match(writer, /playerAppearsInMatch\(match, identity\.player\.id\)/);
  assert.match(writer, /playerMatchSides\(match, identity\.player\.id\)/);
});

test("notification previews resolve selected-player match context", () => {
  const player = { id: "P5", name: "Patrick Noonan" };
  const data = {
    tournament: { year: 2026, teamOne: { name: "The Pickles" }, teamTwo: { name: "Lipp It and Rip It" } },
    rounds: [{ matches: [{
      id: "2026-R1-5", round: 1, match: 5, status: "Scheduled", teeTime: "8:20 AM",
      course: { name: "Turtle Point" }, team1Players: [player], team2Players: [{ id: "P9", name: "Jack Samis" }],
    }] }],
  };
  const context = notificationPreviewContextForPlayer(data, player);
  assert.equal(context.player, "Patrick Noonan");
  assert.equal(context.opponent, "Jack Samis");
  assert.equal(context.teeTime, "8:20 AM");
  assert.match(previewNotificationTemplate("singles-pairing", context).body, /Patrick Noonan vs\. Jack Samis/);
});
