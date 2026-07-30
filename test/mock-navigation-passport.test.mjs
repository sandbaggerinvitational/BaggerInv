import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { tournamentStatusLabel } from "../lib/home-dashboard.js";
import { participantDestination } from "../lib/participant-shell.js";
import { playerPassportCookie } from "../lib/player-passport.js";

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("participant Home navigation uses the canonical same-origin dashboard", async () => {
  const [navigation, mobileHome, menu, activation, score, tournament, profile] = await Promise.all([
    source("app/ParticipantIdentity.js"),
    source("app/home/page.js"),
    source("app/Menu.js"),
    source("app/activate/PlayerPassportActivation.js"),
    source("app/score/ScoreEntry.js"),
    source("app/live/MatchCenter.js"),
    source("app/players/[slug]/page.js"),
  ]);

  assert.match(navigation, /href:\s*"\/home",\s*label:\s*"Home"/);
  assert.match(mobileHome, /getTournamentData/);
  assert.match(mobileHome, /MobileTournamentHome/);
  assert.doesNotMatch(mobileHome, /refreshHistoricalData|kiawahHero|Website Feed/);
  assert.match(menu, /link\.href === "\/" \? homeHref : link\.href/);
  for (const participantSource of [activation, score, tournament, profile]) {
    assert.match(participantSource, /\/home/);
  }
  assert.equal(participantDestination("/home"), "Home");
});

test("My Match navigation always opens the dashboard instead of restoring a scorecard", async () => {
  const [navigation, dashboardPage, scoreEntry, gameCenter, profile, activation, manifest] = await Promise.all([
    source("app/ParticipantIdentity.js"),
    source("app/my-match/page.js"),
    source("app/score/ScoreEntry.js"),
    source("app/game-center/GameCenter.js"),
    source("app/me/ParticipantProfile.js"),
    source("app/activate/PlayerPassportActivation.js"),
    source("app/manifest.js"),
  ]);

  assert.match(navigation, /href:\s*"\/my-match",\s*label:\s*"My Match"/);
  assert.match(dashboardPage, /<ScoreEntry dashboardOnly \/>/);
  assert.match(scoreEntry, /dashboardOnly \? Promise\.resolve\(null\)/);
  assert.match(scoreEntry, /if \(dashboardOnly\) \{\s*window\.location\.assign\("\/score"\)/);
  assert.match(scoreEntry, /Return to My Match<\/Link>/);
  assert.match(scoreEntry, /href="\/my-match"/);
  assert.doesNotMatch(scoreEntry, /Return to My Match<\/Link>[\s\S]{0,100}href="\/score"/);
  assert.match(gameCenter, /backTo === "my-match" \? "\/my-match"/);
  assert.match(profile, /href="\/my-match"/);
  assert.match(activation, /href="\/my-match">Open My Match/);
  assert.match(manifest, /url:\s*"\/my-match\?source=shortcut"/);
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
