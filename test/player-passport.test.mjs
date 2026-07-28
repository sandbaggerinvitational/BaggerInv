import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createPlayerPassportSession,
  playerAppearsInMatch,
  playerPassportCookie,
  verifyPlayerPassportSession,
} from "../lib/player-passport.js";

const secret = "player-passport-test-secret-long-enough";

test("trusted Player Passport sessions persist and retain only revocable identifiers", () => {
  const token = createPlayerPassportSession({
    playerId: "CB01", tournamentId: "SBI-2026", deviceId: "device-opaque", sessionVersion: 3,
  }, secret);
  const session = verifyPlayerPassportSession(token, secret);
  assert.equal(session.playerId, "CB01");
  assert.equal(session.tournamentId, "SBI-2026");
  assert.equal(session.deviceId, "device-opaque");
  assert.equal(session.sessionVersion, 3);
  assert.equal(playerPassportCookie(token).httpOnly, true);
  assert.equal(playerPassportCookie(token).sameSite, "lax");
});

test("tampered Player Passport sessions are rejected", () => {
  const token = createPlayerPassportSession({ playerId: "CB01", tournamentId: "SBI-2026", deviceId: "device-opaque" }, secret);
  assert.throws(() => verifyPlayerPassportSession(`${token}x`, secret));
});

test("Player Passport match eligibility is limited to participating players", () => {
  const match = {
    "Team 1 Player 1": "CB01", "Team 1 Player 2": "WO01",
    "Team 2 Player 1": "AM01", "Team 2 Player 2": "PN01",
  };
  assert.equal(playerAppearsInMatch(match, "CB01"), true);
  assert.equal(playerAppearsInMatch(match, "PN01"), true);
  assert.equal(playerAppearsInMatch(match, "OTHER"), false);
});

test("activation and match routes enforce rate limiting and server-side Passport checks", async () => {
  const [activation, matches, session, sheets, scoreEntry] = await Promise.all([
    readFile(new URL("../app/api/player-passport/activation/route.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/player-passport/matches/route.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/player-passport/session/route.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/google-sheets-write.js", import.meta.url), "utf8"),
    readFile(new URL("../app/score/ScoreEntry.js", import.meta.url), "utf8"),
  ]);
  assert.match(activation, /consumeRateLimit/);
  assert.match(activation, /Unable to activate Player Passport\./);
  assert.match(matches, /authorizePassportMatch/);
  assert.match(matches, /createScoringSession/);
  assert.match(session, /validatePlayerPassport/);
  assert.match(sheets, /playerAppearsInMatch/);
  assert.match(sheets, /Revoked At/);
  assert.match(sheets, /Activation Code Hash/);
  assert.doesNotMatch(sheets, /"Activation Code"\s*:/);
  assert.match(scoreEntry, /Enter Match Code|match code/i);
  assert.match(scoreEntry, /Activate Player Passport/);
});

test("invitation references preselect identity but do not create authorization", async () => {
  const activationPage = await readFile(new URL("../app/activate/PlayerPassportActivation.js", import.meta.url), "utf8");
  assert.match(activationPage, /invitedReference/);
  assert.match(activationPage, /reference\s*\?/);
  assert.match(activationPage, /The invitation link alone does not activate access\./);
  assert.match(activationPage, /activationCode/);
});
