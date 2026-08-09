import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createPlayerPassportSession,
  playerAppearsInMatch,
  playerMatchSides,
  playerPassportCookie,
  verifyPlayerPassportSession,
} from "../lib/player-passport.js";
import { participantDestination } from "../lib/participant-shell.js";

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
  assert.deepEqual(playerMatchSides(match, "CB01"), {
    side: 1,
    participantIds: ["CB01", "WO01"],
    partnerIds: ["WO01"],
    opponentIds: ["AM01", "PN01"],
  });
  assert.deepEqual(playerMatchSides(match, "PN01"), {
    side: 2,
    participantIds: ["AM01", "PN01"],
    partnerIds: ["AM01"],
    opponentIds: ["CB01", "WO01"],
  });
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
  assert.match(activation, /Player Passport activation failed/);
  assert.match(activation, /PASSPORT_CODE_MISMATCH/);
  assert.match(activation, /Player Passport could not save this device/);
  assert.match(matches, /authorizePassportMatch/);
  assert.match(matches, /createScoringSession/);
  assert.match(session, /inspectPlayerPassportToken/);
  assert.match(sheets, /playerAppearsInMatch/);
  assert.match(sheets, /Revoked At/);
  assert.match(sheets, /Activation Code Hash/);
  assert.match(sheets, /PASSPORT_CODE_MISMATCH/);
  assert.match(sheets, /codeMatches\.length === 1/);
  assert.match(sheets, /invitation page open while an admin regenerates/);
  assert.match(sheets, /activation audit failed/);
  assert.match(sheets, /playerId:\s*player\.id/);
  assert.doesNotMatch(sheets, /"Activation Code"\s*:/);
  assert.match(scoreEntry, /Enter Match Code|match code/i);
  assert.match(scoreEntry, /Activate Player Passport/);
});

test("Player Passport admin accepts every unified Admin Center credential", async () => {
  const source = await readFile(new URL("../app/api/player-passport/admin/route.js", import.meta.url), "utf8");
  for (const variable of ["ADMIN_SECRET", "GUIDE_ADMIN_SECRET", "ODDS_ADMIN_SECRET", "LIVE_ADMIN_SECRET"]) {
    assert.match(source, new RegExp(`process\\.env\\.${variable}`));
  }
});

test("invitation references preselect identity but do not create authorization", async () => {
  const activationPage = await readFile(new URL("../app/activate/PlayerPassportActivation.js", import.meta.url), "utf8");
  assert.match(activationPage, /invitedReference/);
  assert.match(activationPage, /reference\s*\?/);
  assert.match(activationPage, /The invitation link alone does not activate access\./);
  assert.match(activationPage, /activationCode/);
});

test("active Passport replaces onboarding with participant destinations", async () => {
  const [page, activation, navigation, score, live, profile, sheets] = await Promise.all([
    readFile(new URL("../app/activate/page.js", import.meta.url), "utf8"),
    readFile(new URL("../app/activate/PlayerPassportActivation.js", import.meta.url), "utf8"),
    readFile(new URL("../app/ParticipantIdentity.js", import.meta.url), "utf8"),
    readFile(new URL("../app/score/ScoreEntry.js", import.meta.url), "utf8"),
    readFile(new URL("../app/live/MatchCenter.js", import.meta.url), "utf8"),
    readFile(new URL("../app/players/[slug]/page.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/google-sheets-write.js", import.meta.url), "utf8"),
  ]);
  assert.match(page, /resolvePlayerPassportToken/);
  assert.match(page, /activePlayer=/);
  assert.match(activation, /Player Passport active/);
  assert.match(activation, /Welcome back/);
  assert.match(activation, /history\.replaceState/);
  assert.match(activation, /location\.replace/);
  assert.match(navigation, /Home/);
  assert.match(navigation, /My Match/);
  assert.match(navigation, /Tournament/);
  assert.match(navigation, /Leaderboard/);
  assert.match(navigation, /Player/);
  assert.doesNotMatch(score, /My Tournament|Live Leaderboard/);
  assert.match(live, /Back to My Tournament/);
  assert.match(live, />My Tournament</);
  assert.match(profile, /Back to My Tournament/);
  assert.match(profile, /Browse All Sandbaggers/);
  assert.match(sheets, /record\["Course Name"\] \|\| record\.Course \|\| record\["Full Course Name"\]/);
});

test("Passport navigation removal preserves public access and clears personalized state", async () => {
  const [navigation, activation, session] = await Promise.all([
    readFile(new URL("../app/ParticipantIdentity.js", import.meta.url), "utf8"),
    readFile(new URL("../app/activate/PlayerPassportActivation.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/player-passport/session/route.js", import.meta.url), "utf8"),
  ]);
  assert.match(navigation, /player-passport-cleared/);
  assert.match(navigation, /pathname\.startsWith\("\/admin"\)/);
  assert.match(activation, /method: "DELETE"/);
  assert.match(activation, /player-passport-cleared/);
  assert.match(session, /playerPassportCookie\("", 0\)/);
});

test("Participant Mode shell preserves verified identity across temporary revalidation failures", async () => {
  const [layout, navigation, session, server, styles, globals] = await Promise.all([
    readFile(new URL("../app/layout.js", import.meta.url), "utf8"),
    readFile(new URL("../app/ParticipantIdentity.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/player-passport/session/route.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/player-passport-server.js", import.meta.url), "utf8"),
    readFile(new URL("../app/participant-navigation.module.css", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /<ParticipantIdentity \/>/);
  assert.match(layout, /<Suspense fallback=\{null\}>/);
  assert.match(navigation, /sbi-participant-shell/);
  assert.match(navigation, /response\.status === 401/);
  assert.match(navigation, /Preserve the last verified presentation shell/);
  assert.match(navigation, /pathname\.startsWith\("\/admin"\)/);
  assert.match(session, /status === "unavailable"/);
  assert.match(session, /status: 503/);
  assert.match(server, /Player Passport validation temporarily unavailable/);
  assert.match(server, /PLAYER_IDENTITY_TTL_MS = 15 \* 1000/);
  assert.match(server, /pendingPlayerInspections/);
  assert.match(server, /PLAYER_VERIFICATION_RETRY_DELAYS = \[150, 350, 750\]/);
  assert.match(server, /playerPassportIdentityDiagnostics/);
  assert.match(styles, /position:fixed/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.match(styles, /z-index:110/);
  assert.match(globals, /body\.passport-navigation-active/);
});

test("participant navigation uses one fixed safe-area-aware native shell", async () => {
  const [navigation, styles, globals] = await Promise.all([
    readFile(new URL("../app/ParticipantIdentity.js", import.meta.url), "utf8"),
    readFile(new URL("../app/participant-navigation.module.css", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(navigation, /function NavIcon/);
  assert.match(navigation, /icon: "home"/);
  assert.match(navigation, /icon: "golf"/);
  assert.match(navigation, /icon: "trophy"/);
  assert.match(navigation, /icon: "podium"/);
  assert.match(navigation, /icon: "profile"/);
  assert.match(navigation, /strokeWidth: 1\.8/);
  assert.match(styles, /position:fixed!important/);
  assert.match(styles, /inset:auto 0 0!important/);
  assert.match(styles, /safe-area-inset-left/);
  assert.match(styles, /safe-area-inset-right/);
  assert.match(styles, /orientation:landscape/);
  assert.match(styles, /prefers-reduced-motion:reduce/);
  assert.match(globals, /--participant-nav-height: 68px/);
  assert.match(globals, /scroll-padding-bottom: calc\(var\(--participant-nav-height\) \+ env\(safe-area-inset-bottom\)\)/);
});

test("Participant Mode active destinations cover direct and nested routes", () => {
  assert.equal(participantDestination("/", "", "clay-beltran"), "Home");
  assert.equal(participantDestination("/home", "", "clay-beltran"), "Home");
  assert.equal(participantDestination("/my-match", "", "clay-beltran"), "My Match");
  assert.equal(participantDestination("/score", "", "clay-beltran"), "My Match");
  assert.equal(participantDestination("/score/access/token", "", "clay-beltran"), "My Match");
  assert.equal(participantDestination("/live", "", "clay-beltran"), "Tournament");
  assert.equal(participantDestination("/live", "?view=points", "clay-beltran"), "Leaderboards");
  assert.equal(participantDestination("/players/clay-beltran", "", "clay-beltran"), "Player");
  assert.equal(participantDestination("/players/another-player", "", "clay-beltran"), "");
  assert.equal(participantDestination("/records", "", "clay-beltran"), "");
});
