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
  assert.match(menu, /aria-label="Tournament Hub navigation"/);
  assert.doesNotMatch(menu, /href: "\/home#today-schedule-title"/);
  assert.match(activation, /\/home/);
  assert.doesNotMatch(tournament, /href="\/(?:home|my-match|app\/)/);
  assert.match(profile, /participantPresentation \? "\/home" : playerDirectoryReturnHref/);
  assert.doesNotMatch(score, /My Tournament|Tournament Coverage|Live Leaderboard|My Profile/);
  assert.equal(participantDestination("/home"), "Home");
});

test("Home and Tournament page trees are isolated by pathname in the shared PWA shell", async () => {
  const [layout, frame, home, tournament] = await Promise.all([
    source("app/layout.js"),
    source("app/ParticipantRouteFrame.js"),
    source("app/home/page.js"),
    source("app/live/page.js"),
  ]);
  assert.match(layout, /<ParticipantRouteFrame navigation=\{<Suspense fallback=\{null\}><ParticipantIdentity \/><\/Suspense>\}>\{children\}<\/ParticipantRouteFrame>/);
  assert.match(frame, /usePathname\(\)/);
  assert.match(frame, /key=\{pathname\}/);
  assert.match(frame, /data-participant-route=\{pathname\}/);
  assert.match(home, /<MobileTournamentHome liveData=\{liveData\} participantIdentityAuthority=\{participantIdentityAuthority\}/);
  assert.doesNotMatch(home, /TournamentDashboard|MatchCenter/);
  assert.match(tournament, /<MatchCenter initialData=\{data\}/);
  assert.doesNotMatch(tournament, /MobileTournamentHome|TournamentCommandCenter/);
});

test("My Match navigation always opens the dashboard instead of restoring a scorecard", async () => {
  const [navigation, dashboardPage, scoreEntry, gameCenter, profile, activation, manifest] = await Promise.all([
    source("app/ParticipantIdentity.js"),
    source("app/my-match/page.js"),
    source("app/score/ScoreEntry.js"),
    source("app/game-center/GameCenter.js"),
    source("app/me/ParticipantProfile.js"),
    source("app/activate/PlayerPassportActivation.js"),
    source("lib/web-app-manifest.js"),
  ]);

  assert.match(navigation, /href:\s*"\/my-match",\s*label:\s*"My Match"/);
  assert.match(dashboardPage, /<ScoreEntry[\s\S]*dashboardOnly[\s\S]*localFirstEnabled=\{previewMode && !productionShadowReadOnly\}[\s\S]*participantIdentityAuthority=\{participantIdentityAuthority\}[\s\S]*scoringReadOnly=\{productionShadowReadOnly\}/);
  assert.match(scoreEntry, /dashboardOnly \? Promise\.resolve\(null\)/);
  assert.match(scoreEntry, /if \(dashboardOnly\) \{\s*window\.location\.assign\("\/score"\)/);
  assert.match(scoreEntry, /Return to My Match<\/Link>/);
  assert.match(scoreEntry, /href="\/my-match"/);
  assert.doesNotMatch(scoreEntry, /Return to My Match<\/Link>[\s\S]{0,100}href="\/score"/);
  assert.match(gameCenter, /const backHref = backTo === "home"[\s\S]*: "\/my-match"/);
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

test("administrative pages use the public brand home while Production redirects to the canonical Console", async () => {
  const [adminPage, directorPage] = await Promise.all([
    source("app/admin/page.js"),
    source("app/admin/director/page.js"),
  ]);
  assert.match(adminPage, /if \(process\.env\.VERCEL_ENV === "production"\) redirect\("\/admin\/director"\)/);
  assert.match(adminPage, /<Header\s*\/>/);
  assert.match(directorPage, /<Header\s*\/>/);
  assert.doesNotMatch(adminPage, /<Header homeHref="\/home"/);
  assert.doesNotMatch(directorPage, /<Header homeHref="\/home"/);
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
  assert.match(navigation, /\[401, 403\]\.includes\(response\.status\)/);
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
  assert.match(header, /<StatusBadge status=\{status\} \/>/);
});
