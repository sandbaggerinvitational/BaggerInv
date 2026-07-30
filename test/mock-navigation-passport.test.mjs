import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { tournamentStatusLabel } from "../lib/home-dashboard.js";
import { participantDestination } from "../lib/participant-shell.js";
import { playerPassportCookie } from "../lib/player-passport.js";

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("participant Home navigation uses the canonical same-origin dashboard", async () => {
  const [navigation, mobileHome, activation, score, tournament, profile] = await Promise.all([
    source("app/ParticipantIdentity.js"),
    source("app/home/page.js"),
    source("app/activate/PlayerPassportActivation.js"),
    source("app/score/ScoreEntry.js"),
    source("app/live/MatchCenter.js"),
    source("app/players/[slug]/page.js"),
  ]);

  assert.match(navigation, /href:\s*"\/home",\s*label:\s*"Home"/);
  assert.match(mobileHome, /getTournamentData/);
  assert.match(mobileHome, /MobileTournamentHome/);
  assert.doesNotMatch(mobileHome, /refreshHistoricalData|kiawahHero|Website Feed/);
  for (const participantSource of [activation, score, tournament, profile]) {
    assert.match(participantSource, /\/home/);
  }
  assert.equal(participantDestination("/home"), "Home");
});

test("mobile app navigation contains no absolute deployment or Production targets", async () => {
  const paths = [
    "app/ParticipantIdentity.js",
    "app/PersonalizedPlayerHome.js",
    "app/score/ScoreEntry.js",
    "app/score/MyMatchDashboard.js",
    "app/live/MatchCenter.js",
    "app/live/TournamentDashboard.js",
    "app/live/LeaderboardsDashboard.js",
    "app/game-center/GameCenter.js",
    "app/me/ParticipantProfile.js",
  ];
  const sources = await Promise.all(paths.map(source));
  for (const [index, value] of sources.entries()) {
    assert.doesNotMatch(value, /https?:\/\/[^"'`\s]*(?:vercel\.app|baggerinv\.com)/i, paths[index]);
  }
});

test("legacy public site remains separate from participant Home", async () => {
  const [publicNavigation, admin] = await Promise.all([
    source("app/navigation.js"),
    source("app/admin/AdminCenter.js"),
  ]);
  assert.match(publicNavigation, /label:\s*"Home",\s*href:\s*"\/"/);
  assert.match(admin, /Open public site/);
});

test("Home status follows the resolved tournament state", () => {
  assert.equal(tournamentStatusLabel("Upcoming"), "Upcoming");
  assert.equal(tournamentStatusLabel("LIVE"), "Live");
  assert.equal(tournamentStatusLabel("Complete"), "Final");
});

test("Passport cookie remains host-only and valid across every app path", () => {
  const cookie = playerPassportCookie("signed-token");
  assert.equal(cookie.path, "/");
  assert.equal(cookie.sameSite, "lax");
  assert.equal(cookie.httpOnly, true);
  assert.equal("domain" in cookie, false);
});

test("temporary Passport route failures preserve the last verified shell", async () => {
  const [navigation, session] = await Promise.all([
    source("app/ParticipantIdentity.js"),
    source("app/api/player-passport/session/route.js"),
  ]);
  assert.match(navigation, /response\.status === 401/);
  assert.match(navigation, /Preserve the last verified presentation shell/);
  assert.match(session, /status === "unavailable"/);
  assert.match(session, /status:\s*503/);
});

test("Upcoming Home renders its resolved status rather than a hard-coded Live badge", async () => {
  const [commandCenter, header] = await Promise.all([
    source("app/TournamentCommandCenter.js"),
    source("app/TournamentIdentityHeader.js"),
  ]);
  assert.match(commandCenter, /tournamentStatusLabel\(liveTournament\.status\)/);
  assert.match(commandCenter, /status=\{status\}/);
  assert.doesNotMatch(commandCenter, /status="Live"/);
  assert.match(header, /status === "Live"/);
});
