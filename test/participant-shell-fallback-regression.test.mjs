import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isRecoverablePreviewImpersonationCode } from "../lib/participant-impersonation-recovery.js";
import { participantNavigationRoute } from "../lib/participant-shell.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("stale Preview impersonation failures are narrowly recoverable", () => {
  for (const code of [
    "IMPERSONATION_LEASE_NOT_FOUND",
    "IMPERSONATION_LEASE_REVOKED",
    "IMPERSONATION_LEASE_EXPIRED",
    "IMPERSONATION_LEASE_MISMATCH",
    "IMPERSONATION_TARGET_INACTIVE",
    "WRONG_TOURNAMENT",
  ]) assert.equal(isRecoverablePreviewImpersonationCode(code), true);
  for (const code of ["AUTH_SESSION_REQUIRED", "TOURNAMENT_MEMBERSHIP_INACTIVE", "PARTICIPANT_CONTEXT_UNAVAILABLE"])
    assert.equal(isRecoverablePreviewImpersonationCode(code), false);
});

test("shared participant navigation is route-owned during loading and errors", () => {
  for (const route of [
    "/home", "/my-match", "/score", "/game-center/2026-R3-4", "/live", "/live?view=leaderboards",
    "/odds-center", "/me", "/players/holman-moores", "/tournament-guide/rules", "/courses/CPGC01", "/history/2026",
  ]) assert.equal(participantNavigationRoute(route.split("?")[0]), true, route);
  for (const route of ["/", "/admin/director", "/participant-auth", "/activate", "/score/access/legacy"])
    assert.equal(participantNavigationRoute(route), false, route);
});

test("Home and identity session responses clear only a failed Preview impersonation pointer", async () => {
  const [homeRoute, sessionRoute, homeClient] = await Promise.all([
    source("app/api/participant/home/route.js"),
    source("app/api/player-passport/session/route.js"),
    source("app/ParticipantSupabaseHome.js"),
  ]);
  for (const route of [homeRoute, sessionRoute]) {
    assert.match(route, /isRecoverablePreviewImpersonationCode/);
    assert.match(route, /VERCEL_ENV === "preview"/);
    assert.match(route, /playerPassportCookie\("", 0\)/);
    assert.match(route, /X-Preview-Impersonation-Recovery/);
  }
  assert.match(homeClient, /response\.status === 403 && isRecoverablePreviewImpersonationCode\(result\.code\)/);
  assert.match(homeClient, /window\.dispatchEvent\(new Event\("player-passport-cleared"\)\)/);
  assert.match(homeClient, /if \(recoveredImpersonation\) window\.dispatchEvent\(new Event\("player-passport-changed"\)\)/);
  assert.equal((homeClient.match(/fetch\("\/api\/participant\/home"/g) || []).length >= 2, true);
});

test("authenticated players receive participant navigation only on participant routes", async () => {
  const shell = await source("app/ParticipantIdentity.js");
  assert.equal(participantNavigationRoute("/"), false);
  assert.equal(participantNavigationRoute("/home"), true);
  assert.match(shell, /const navigationVisible = participantNavigationRoute\(pathname\)/);
  assert.doesNotMatch(shell, /Boolean\(player\) \|\| participantNavigationRoute\(pathname\)/);
  assert.match(shell, /if \(!navigationVisible \|\| pathname\.startsWith\("\/admin"\)\) return null/);
  assert.doesNotMatch(shell, /if \(!player \|\| pathname\.startsWith\("\/admin"\)\) return null/);
  assert.match(shell, /player \? `\$\{player\.name\}'s tournament navigation` : "Tournament navigation"/);
  assert.match(shell, /passport-navigation-active", navigationVisible/);
});
