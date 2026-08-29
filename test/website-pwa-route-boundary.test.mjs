import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  participantAppHref,
  participantAppShellRoute,
  participantNavigationRoute,
} from "../lib/participant-shell.js";
import { navigationSections } from "../app/navigation.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const publicRoutes = [
  "/", "/live", "/players", "/players/holman-moores", "/history", "/history/2026",
  "/courses", "/courses/CPGC01", "/odds-center", "/tournament-guide", "/tournament-guide/rules", "/rules",
];
const participantRoutes = [
  "/home", "/my-match", "/score", "/game-center/2026-R1-1", "/me",
  "/app/tournament", "/app/leaderboards", "/app/players", "/app/history", "/app/courses", "/app/guide", "/app/odds",
];
const forbiddenPublicDestinations = [
  "/home", "/my-match", "/me", "/score", "/game-center/", "/participant-auth", "/app/",
];

test("URL ownership, never authentication, selects website or participant presentation", () => {
  for (const route of publicRoutes) {
    assert.equal(participantAppShellRoute(route), false, route);
    assert.equal(participantNavigationRoute(route), false, route);
  }
  for (const route of participantRoutes) {
    assert.equal(participantAppShellRoute(route), true, route);
    assert.equal(participantNavigationRoute(route), true, route);
  }
});

test("the explicit participant namespace is not indexed as duplicate public content", async () => {
  const layout = await source("app/app/layout.js");
  assert.match(layout, /robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/);
});

test("normal website navigation has no participant or PWA destination", () => {
  const links = navigationSections.flatMap((section) => section.links).map((link) => link.href);
  for (const href of links) {
    assert.equal(forbiddenPublicDestinations.some((prefix) => href === prefix || href.startsWith(prefix)), false, href);
  }
});

test("the public Admin navigation branch returns to the website rather than PWA Home", async () => {
  const pages = await Promise.all([
    "app/admin/page.js",
    "app/admin/director/page.js",
    "app/admin/director/game-center-readiness/page.js",
    "app/admin/director/completed-history/page.js",
  ].map(source));
  for (const page of pages) assert.doesNotMatch(page, /homeHref="\/home"|redirect\("\/home"\)/);
  assert.match(pages[0], /<Header\s*\/>/);
  for (const page of pages.slice(1)) assert.match(page, /redirect\("\/"\)[\s\S]*<Header\s*\/>/);
});

test("public Match Center stays website-owned for anonymous and authenticated viewers while retaining Supabase reads", async () => {
  const [route, matchCenter, transport] = await Promise.all([
    source("app/live/page.js"),
    source("app/live/MatchCenter.js"),
    source("app/live/TournamentSupabaseRead.js"),
  ]);
  assert.match(route, /requireTournamentReadSource\(env\)/);
  assert.match(route, /source\.resolved === "supabase"/);
  assert.match(route, /<TournamentSupabaseRead[\s\S]*presentation=\{participantPresentation \? "participant" : "public"\}/);
  assert.match(route, /participantPresentation \? null : <Header \/>/);
  assert.match(route, /participantPresentation \? null : <Footer \/>/);
  assert.match(transport, /presentation === "public"[\s\S]*<MatchCenterExperience/);
  assert.match(transport, /fetch\("\/api\/tournament\/live"/);
  assert.doesNotMatch(matchCenter, /player-passport\/session|participantIdentity|passportPlayer/);
  assert.doesNotMatch(matchCenter, /href="\/(?:home|my-match|app\/)/);
});

test("public Players and player profiles remain website-owned even with a participant session", async () => {
  const [directory, profile, appDirectory, appProfile] = await Promise.all([
    source("app/players/page.js"),
    source("app/players/[slug]/page.js"),
    source("app/app/players/page.js"),
    source("app/app/players/[slug]/page.js"),
  ]);
  for (const page of [directory, profile]) {
    assert.match(page, /participantPresentation \? null : <Header \/>/);
    assert.match(page, /participantPresentation \? null : <Footer \/>/);
  }
  assert.doesNotMatch(profile, /cookies\(\)|resolveSupabaseParticipantIdentity|resolvePlayerPassportToken|PLAYER_PASSPORT_COOKIE/);
  assert.match(profile, /participantPresentation \? "\/home" : playerDirectoryReturnHref/);
  assert.match(appDirectory, /participantPresentation: true/);
  assert.match(appProfile, /participantPresentation: true/);
});

test("shared History, Courses, Guide, and Odds pages default to website chrome and expose explicit app wrappers", async () => {
  const pairs = [
    ["app/history/page.js", "app/app/history/page.js"],
    ["app/courses/page.js", "app/app/courses/page.js"],
    ["app/tournament-guide/page.js", "app/app/guide/page.js"],
    ["app/odds-center/page.js", "app/app/odds/page.js"],
  ];
  for (const [publicPath, participantPath] of pairs) {
    const [publicPage, participantPage] = await Promise.all([source(publicPath), source(participantPath)]);
    assert.match(publicPage, /participantPresentation\s*\?\s*null\s*:\s*<Header\s*\/>/);
    assert.match(publicPage, /participantPresentation\s*\?\s*null\s*:\s*<Footer\s*\/>/);
    assert.match(participantPage, /participantPresentation: true/);
  }
});

test("participant navigation retains five canonical destinations only inside the participant frame", async () => {
  const [frame, navigation, foundation] = await Promise.all([
    source("app/ParticipantRouteFrame.js"),
    source("app/ParticipantIdentity.js"),
    source("app/PwaFoundation.js"),
  ]);
  const items = ["/home", "/my-match", "/app/tournament", "/app/leaderboards", "/me"];
  for (const href of items) assert.match(navigation, new RegExp(`href: "${href}"`));
  assert.equal((navigation.match(/href: "/g) || []).length, 5);
  assert.match(frame, /if \(!appRoute\) return <div[\s\S]*>\{children\}<\/div>/);
  assert.match(frame, /data-participant-app-shell[\s\S]*\{navigation\}/);
  assert.match(foundation, /if \(!participantPresentation\) return null/);
  assert.match(navigation, /classList\.toggle\("preview-impersonation-active", navigationVisible && Boolean\(impersonation\)\)/);
});

test("participant links are deterministically namespaced without changing backend adapters", () => {
  assert.equal(participantAppHref("/live"), "/app/tournament");
  assert.equal(participantAppHref("/live?view=leaderboards"), "/app/leaderboards");
  assert.equal(participantAppHref("/players/holman-moores"), "/app/players/holman-moores");
  assert.equal(participantAppHref("/history/2026/round/1"), "/app/history/2026/round/1");
  assert.equal(participantAppHref("/courses/CPGC01"), "/app/courses/CPGC01");
  assert.equal(participantAppHref("/tournament-guide/rules"), "/app/guide/rules");
  assert.equal(participantAppHref("/odds-center"), "/app/odds");
});
