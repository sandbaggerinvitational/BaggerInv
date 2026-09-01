import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { navigationSections } from "../app/navigation.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function assertBefore(value, first, second, label) {
  const firstIndex = value.indexOf(first);
  const secondIndex = value.indexOf(second);
  assert.notEqual(firstIndex, -1, `${label}: missing ${first}`);
  assert.notEqual(secondIndex, -1, `${label}: missing ${second}`);
  assert.ok(firstIndex < secondIndex, `${label}: ${first} must precede ${second}`);
}

test("Production legacy Admin redirects before loading the shared-password Admin Center", async () => {
  const page = await source("app/admin/page.js");
  assert.match(page, /process\.env\.VERCEL_ENV === "production"\) redirect\("\/admin\/director"\)/);
  assertBefore(page, "redirect(\"/admin/director\")", "refreshHistoricalData()", "/admin redirect");
  assert.match(page, /<AdminCenter[\s\S]*previewMode=/);
});

test("shared-password human Admin endpoints fail closed before secret or Google work in Production", async () => {
  const routes = await Promise.all([
    "app/api/admin/session/route.js",
    "app/api/admin/cms/route.js",
    "app/api/admin/tournament/route.js",
    "app/api/admin/scorecard-calibration/route.js",
    "app/api/player-passport/admin/route.js",
    "app/api/player-passport/activation/route.js",
  ].map(source));

  for (const route of routes) {
    assert.match(route, /VERCEL_ENV[^\n]+production/);
    assert.match(route, /error: "Not found\."/);
    assert.match(route, /status: 404/);
    assert.match(route, /Cache-Control": "private, no-store"/);
  }

  assertBefore(routes[0], "VERCEL_ENV === \"production\"", "request.headers.get(\"x-admin-secret\")", "admin session");
  assert.match(routes[1], /export async function GET[\s\S]*?retiredProductionHumanAdmin\(\);[\s\S]*?if \(retired\) return retired;[\s\S]*?authorized\(request\)/);
  assert.match(routes[2], /export async function GET[\s\S]*?retiredProductionHumanAdmin\(\);[\s\S]*?if \(retired\) return retired;[\s\S]*?authorized\(request\)/);
  assert.match(routes[3], /export async function GET[\s\S]*?VERCEL_ENV === "production"[\s\S]*?authorized\(request\)/);
  assert.match(routes[4], /export async function GET[\s\S]*?VERCEL_ENV === "production"[\s\S]*?authorized\(request\)/);
  assertBefore(routes[5], "VERCEL_ENV === \"production\"", "readPlayerPassportActivationOptions(reference)", "Passport activation GET");
});

test("legacy Production human routes lead to the bounded Director or current Auth surface", async () => {
  const [activate, live, guide, publishOdds, dataHealthAlias, oddsAlias, dataHealth] = await Promise.all([
    "app/activate/page.js",
    "app/admin/live-matches/page.js",
    "app/admin/tournament-guide/page.js",
    "app/admin/publish-odds/page.js",
    "app/admin/data-health/page.js",
    "app/odds-center/admin/page.js",
    "app/data-health/page.js",
  ].map(source));

  assert.match(activate, /VERCEL_ENV === "production"\) redirect\("\/participant-auth"\)/);
  assert.match(live, /VERCEL_ENV === "production"\) redirect\("\/admin\/director\?section=tournament-day"\)/);
  assert.match(guide, /VERCEL_ENV === "production"\) redirect\("\/admin\/director\?section=draft-guide"\)/);
  assert.match(publishOdds, /\/admin\/director\?section=odds-side-games/);
  assert.match(dataHealthAlias, /\/admin\/director\?section=system-audit/);
  assert.match(oddsAlias, /\/admin\/director\?section=odds-side-games/);
  assert.match(dataHealth, /VERCEL_ENV === "production"\) redirect\("\/admin\/director\?section=system-audit"\)/);
  assertBefore(dataHealth, "redirect(\"/admin/director?section=system-audit\")", "loadPredictionDiagnostics()", "data-health redirect");
});

test("Preview tools stay isolated while Preview legacy workflows remain available", async () => {
  const [readinessPage, completedHistory, resetPreview, impersonation, adminPage] = await Promise.all([
    "app/admin/director/game-center-readiness/page.js",
    "app/admin/director/completed-history/page.js",
    "app/api/director/reset-preview/route.js",
    "app/api/director/impersonation/route.js",
    "app/admin/page.js",
  ].map(source));

  for (const value of [readinessPage, completedHistory, resetPreview, impersonation]) {
    assert.match(value, /VERCEL_ENV !== "preview"/);
  }
  assert.match(adminPage, /previewMode=\{process\.env\.VERCEL_ENV === "preview"\}/);
});

test("Director Console remains the only advertised human Production administration surface", async () => {
  const [directorPage, consoleSource, menu, adminCenter] = await Promise.all([
    "app/admin/director/page.js",
    "app/admin/director/ProductionDirectorConsole.js",
    "app/Menu.js",
    "app/admin/AdminCenter.js",
  ].map(source));

  assert.match(directorPage, /productionDirectorEntitlementEnvironment/);
  assert.match(directorPage, /authorizePreviewDirector[\s\S]*allowBootstrap: !production\.production/);
  assert.doesNotMatch(directorPage, /ADMIN_SECRET|GUIDE_ADMIN_SECRET|ODDS_ADMIN_SECRET|LIVE_ADMIN_SECRET/);
  for (const section of [
    "overview", "players-access", "handicaps", "tournament-setup", "tournaments",
    "tournament-day", "odds-side-games", "draft-guide", "system-audit",
  ]) assert.match(consoleSource, new RegExp(`section === "${section}"`));

  const publicLinks = navigationSections.flatMap((section) => section.links);
  assert.equal(publicLinks.some(({ href }) => href.startsWith("/admin")), false);
  assert.doesNotMatch(menu, /href="\/admin"/);
  assert.match(menu, /directorAccess\?\.authorized === true/);
  assert.match(menu, /href="\/admin\/director"/);
  assert.match(adminCenter, /resource="media"/);
  assert.match(adminCenter, /resource="settings"/);
  assert.match(adminCenter, /<PlayerPassportAdmin/);
});

test("retired Google authoring stays fail-closed and retained machine infrastructure remains installed", async () => {
  const [synchronization, guide, mirror, archive, futureWriter] = await Promise.all([
    "app/api/admin/production-director-synchronization/route.js",
    "app/api/tournament-guide/route.js",
    "lib/scoring-google-outbox.js",
    "lib/scorecard-archive-worker.js",
    "lib/future-match-google-compatibility-worker.js",
  ].map(source));

  for (const code of [
    "PRODUCTION_PREDICTION_SETTINGS_GOOGLE_AUTHORING_RETIRED",
    "PRODUCTION_DRAFT_GOOGLE_AUTHORING_RETIRED",
    "PRODUCTION_GUIDE_GOOGLE_AUTHORING_RETIRED",
  ]) assert.match(synchronization, new RegExp(code));
  assert.match(guide, /PRODUCTION_GUIDE_GOOGLE_AUTHORING_RETIRED/);
  assert.match(mirror, /drainGoogleOutbox/);
  assert.match(archive, /drainScorecardArchiveJobs/);
  assert.match(futureWriter, /Google|google/);
});

test("retired routes remain private and absent from public search metadata", async () => {
  const [robots, sitemap, adminLayout, activate] = await Promise.all([
    "app/robots.js",
    "app/sitemap.js",
    "app/admin/layout.js",
    "app/activate/page.js",
  ].map(source));

  assert.match(robots, /"\/admin"/);
  assert.match(robots, /"\/data-health"/);
  assert.match(robots, /"\/odds-center\/admin"/);
  assert.doesNotMatch(sitemap, /["'`]\/admin(?:[\/"'`])/);
  assert.doesNotMatch(sitemap, /["'`]\/data-health["'`]/);
  assert.match(adminLayout, /robots:\s*\{ index: false, follow: false \}/);
  assert.match(adminLayout, /alternates:\s*\{ canonical: null \}/);
  assert.match(activate, /privatePageMetadata\("Activate Player Passport"\)/);
});
