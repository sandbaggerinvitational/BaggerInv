import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { navigationSections } from "../app/navigation.js";
import { participantAppShellRoute, participantNavigationRoute } from "../lib/participant-shell.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Production My Match and Score routes use current participant authority without the Preview-era gate", async () => {
  const [myMatchPage, scorePage] = await Promise.all([
    source("app/my-match/page.js"),
    source("app/score/page.js"),
  ]);

  for (const page of [myMatchPage, scorePage]) {
    assert.doesNotMatch(page, /liveTournamentV2Enabled|NEXT_PUBLIC_LIVE_TOURNAMENT_V2_ENABLED/);
    assert.doesNotMatch(page, /notFound\(\)/);
    assert.match(page, /applicationPageEnvironment\(\)/);
    assert.match(page, /requireParticipantIdentityAuthority\(env\)\.resolved/);
    assert.match(page, /participantIdentityAuthority=\{participantIdentityAuthority\}/);
    assert.match(page, /localFirstEnabled=\{previewMode && !productionShadowReadOnly\}/);
  }
});

test("My Match preserves signed-out, unavailable, and no-assignment states instead of route-level 404", async () => {
  const [entry, dashboard, myMatchRoute] = await Promise.all([
    source("app/score/ScoreEntry.js"),
    source("app/score/MyMatchDashboard.js"),
    source("app/api/my-match/route.js"),
  ]);

  assert.match(entry, /router\.replace\(`\/participant-auth\?next=\$\{dashboardOnly \? "\/my-match" : "\/score"\}`\)/);
  assert.match(entry, /Tournament information is temporarily unavailable\. Please try again\./);
  assert.match(dashboard, /No tournament matches are assigned yet\./);
  assert.match(dashboard, /Your matches will appear here when tournament pairings are published\./);
  assert.match(myMatchRoute, /resolveSupabaseParticipantIdentity/);
  assert.match(myMatchRoute, /readMyMatchView\(\{ tournamentId, playerId \}/);
  assert.match(myMatchRoute, /X-My-Match-Read-Source": "supabase"/);
  assert.match(myMatchRoute, /X-My-Match-Google-Requests": "0"/);
});

test("Score keeps server-authoritative scoring permission and unavailable states", async () => {
  const [entry, accessRoute, scoringRoute, authorizationRoute] = await Promise.all([
    source("app/score/ScoreEntry.js"),
    source("app/api/player-passport/matches/route.js"),
    source("app/api/scoring/current/route.js"),
    source("lib/match-authorization-supabase.js"),
  ]);

  assert.match(entry, /This match is not available for scoring\./);
  assert.match(entry, /No scoreable matches are available for the active round yet\./);
  assert.match(accessRoute, /authorizeMatchAccess\(\{ tournamentId: identity\.tournamentId, playerId, matchId, action \}\)/);
  assert.match(accessRoute, /if \(!authorized\.payload\.allowed\)/);
  assert.match(scoringRoute, /validateAuthoritativeParticipantSession/);
  assert.match(authorizationRoute, /START_SCORING/);
});

test("Production Home hides Preview labeling while Preview retains it", async () => {
  const [page, home, badge] = await Promise.all([
    source("app/home/page.js"),
    source("app/ParticipantSupabaseHome.js"),
    source("app/PreviewModeBadge.js"),
  ]);

  assert.match(page, /previewMode=\{process\.env\.VERCEL_ENV === "preview"\}/);
  assert.match(home, /previewMode = false/);
  assert.equal((home.match(/<PreviewModeBadge visible=\{previewMode\} \/>/g) || []).length, 2);
  assert.doesNotMatch(home, /<PreviewModeBadge visible \/>/);
  assert.match(badge, /Preview · Test Data/);
});

test("participant entry points remain owned by the PWA without public navigation crossover", async () => {
  const [identity, personalizedHome, profile, gameCenter, manifest, notifications] = await Promise.all([
    source("app/ParticipantIdentity.js"),
    source("app/PersonalizedPlayerHome.js"),
    source("app/me/ParticipantProfile.js"),
    source("app/game-center/GameCenter.js"),
    source("app/manifest.js"),
    source("lib/notification-templates.js"),
  ]);

  for (const route of ["/my-match", "/score"]) {
    assert.equal(participantAppShellRoute(route), true);
    assert.equal(participantNavigationRoute(route), true);
  }
  assert.match(identity, /href: "\/my-match"/);
  assert.match(personalizedHome, /href="\/my-match"/);
  assert.match(profile, /href="\/my-match"/);
  assert.match(gameCenter, /window\.location\.assign\("\/score"\)/);
  assert.match(manifest, /\/my-match\?source=shortcut/);
  assert.match(notifications, /url: \(\) => "\/my-match"/);

  const publicHrefs = navigationSections.flatMap((section) => section.links).map((link) => link.href);
  assert.equal(publicHrefs.some((href) => ["/home", "/my-match", "/score"].some((route) => href === route || href.startsWith(`${route}/`))), false);
});

test("web correction does not alter native mobile API or DTO sources", async () => {
  const [myMatchPage, scorePage, homePage] = await Promise.all([
    source("app/my-match/page.js"),
    source("app/score/page.js"),
    source("app/home/page.js"),
  ]);
  assert.doesNotMatch(`${myMatchPage}\n${scorePage}\n${homePage}`, /api\/mobile\/v1|native-ios|\.swift/i);
});
