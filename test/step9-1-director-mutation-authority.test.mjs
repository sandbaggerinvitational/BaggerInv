import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  DIRECTOR_MUTATION_ERROR_CODES,
  assertDirectorMutationAuthority,
  directorMutationAuthorityDiagnostics,
  directorMutationPolicyMatrix,
} from "../lib/director-mutation-authority.js";

const KNOWN_ACTIONS = Object.freeze({
  director: Object.freeze([
    "automation-check",
    "set-live",
    "open-round",
    "unlock-scoring",
    "lock-scoring",
    "close-round",
    "reopen-match",
    "match-unlock-scoring",
    "match-lock-scoring",
    "match-mark-live",
    "match-finalize",
    "match-reopen",
    "automation",
    "match-management",
    "round-pairings",
    "calcutta-management",
    "net-skins-eligibility",
    "course-tees",
    "reset-preview",
    "tournament-admin-update",
  ]),
  "live-matches": Object.freeze([
    "update",
    "mark-live",
    "pairing",
    "finalize",
    "reopen",
    "access-generate",
    "access-disable",
  ]),
  "admin-cms": Object.freeze([
    "players", "teams", "rosters", "courses", "matches", "awards",
    "draft-settings", "draft-picks", "schedule", "media", "settings", "prediction-settings",
  ]),
});

const SUPABASE_ALLOWED = Object.freeze({
  director: Object.freeze(["reopen-match", "match-finalize", "match-reopen"]),
  "live-matches": Object.freeze(["finalize", "reopen"]),
  "admin-cms": Object.freeze(["draft-settings", "draft-picks", "schedule", "media", "settings", "prediction-settings"]),
});

const source = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

function postBody(routeSource) {
  const index = routeSource.indexOf("export async function POST");
  assert.notEqual(index, -1, "route must export POST");
  return routeSource.slice(index);
}

function assertBefore(body, earlierToken, laterToken, context) {
  const earlier = body.indexOf(earlierToken);
  const later = body.indexOf(laterToken);
  assert.notEqual(earlier, -1, `${context}: missing ${earlierToken}`);
  assert.notEqual(later, -1, `${context}: missing ${laterToken}`);
  assert.ok(earlier < later, `${context}: ${earlierToken} must precede ${laterToken}`);
}

test("the Director mutation policy covers the complete known action matrix", () => {
  const matrix = directorMutationPolicyMatrix();
  assert.deepEqual(Object.keys(matrix).sort(), Object.keys(KNOWN_ACTIONS).sort());

  for (const [surface, expectedActions] of Object.entries(KNOWN_ACTIONS)) {
    assert.deepEqual(Object.keys(matrix[surface]).sort(), [...expectedActions].sort(), surface);
    for (const action of expectedActions) {
      const policy = matrix[surface][action];
      assert.notEqual(policy.domain, "UNKNOWN", `${surface}:${action} must classify its domain`);
      assert.match(policy.execution, /^(GOOGLE_DIRECT|AUTHORITY_AWARE_CANONICAL_LIFECYCLE|GOOGLE_DIRECTOR_AUTHORING)$/);
      assert.ok(policy.googleWriters.length > 0, `${surface}:${action} must name its legacy writers`);
      assert.equal(typeof policy.supabaseAllowed, "boolean");
      assert.ok(policy.description, `${surface}:${action} must be documented`);
    }
  }
});

test("Supabase authority permits canonical lifecycle transactions and explicitly retained Director authoring", () => {
  const allowed = {};
  for (const [surface, actions] of Object.entries(KNOWN_ACTIONS)) {
    allowed[surface] = [];
    for (const action of actions) {
      const diagnostics = directorMutationAuthorityDiagnostics({ surface, action, authority: "supabase" });
      assert.equal(diagnostics.fallbackAllowed, false);
      if (diagnostics.allowed) {
        allowed[surface].push(action);
        if (surface === "admin-cms") {
          assert.equal(diagnostics.execution, "GOOGLE_DIRECTOR_AUTHORING");
          assert.equal(diagnostics.canonicalLifecycleAction, "");
        } else {
          assert.equal(diagnostics.execution, "AUTHORITY_AWARE_CANONICAL_LIFECYCLE");
          assert.match(diagnostics.canonicalLifecycleAction, /^(finalize|reopen)$/);
        }
      } else {
        assert.equal(diagnostics.code, DIRECTOR_MUTATION_ERROR_CODES.NOT_SUPPORTED_UNDER_SUPABASE);
        assert.throws(
          () => assertDirectorMutationAuthority({ surface, action, authority: "supabase" }),
          (error) => {
            assert.equal(error.code, "OPERATION_NOT_SUPPORTED_UNDER_SUPABASE_AUTHORITY");
            assert.equal(error.status, 409);
            assert.equal(error.authorityDiagnostics?.surface, surface);
            assert.equal(error.authorityDiagnostics?.action, action);
            assert.equal(error.authorityDiagnostics?.fallbackAllowed, false);
            return true;
          },
        );
      }
    }
  }

  assert.deepEqual(allowed, {
    director: [...SUPABASE_ALLOWED.director],
    "live-matches": [...SUPABASE_ALLOWED["live-matches"]],
    "admin-cms": [...SUPABASE_ALLOWED["admin-cms"]],
  });
});

test("Google authority preserves every known Director mutation and explicit legacy rollback action", () => {
  for (const [surface, actions] of Object.entries(KNOWN_ACTIONS)) {
    for (const action of actions) {
      const diagnostics = assertDirectorMutationAuthority({ surface, action, authority: "google" });
      assert.equal(diagnostics.allowed, true, `${surface}:${action}`);
      assert.equal(diagnostics.resolvedAuthority, "google");
      assert.equal(diagnostics.fallbackAllowed, false);
    }
  }

  assert.throws(() => assertDirectorMutationAuthority({
    surface: "director", action: "future-explicit-google-rollback-action", authority: "google",
  }), (error) => error.code === DIRECTOR_MUTATION_ERROR_CODES.UNKNOWN_OPERATION && error.status === 400);
});

test("Production retires Google Prediction Settings authoring while Preview remains available", () => {
  const production = directorMutationAuthorityDiagnostics({
    surface: "admin-cms",
    action: "prediction-settings",
    authority: "supabase",
    env: { VERCEL_ENV: "production" },
  });
  assert.equal(production.allowed, false);
  assert.equal(production.productionGoogleAuthoringRetired, true);
  assert.equal(production.code,
    DIRECTOR_MUTATION_ERROR_CODES.PRODUCTION_GOOGLE_AUTHORING_RETIRED);
  assert.throws(() => assertDirectorMutationAuthority({
    surface: "admin-cms", action: "prediction-settings",
    authority: "supabase", env: { VERCEL_ENV: "production" },
  }), (error) => error.status === 410 &&
    error.code === "PRODUCTION_PREDICTION_SETTINGS_GOOGLE_AUTHORING_RETIRED");
  assert.equal(directorMutationAuthorityDiagnostics({
    surface: "admin-cms", action: "prediction-settings",
    authority: "supabase", env: { VERCEL_ENV: "preview" },
  }).allowed, true);
});

test("invalid mutation authority fails closed", () => {
  assert.throws(
    () => assertDirectorMutationAuthority({
      surface: "director",
      action: "match-finalize",
      authority: "not-an-authority",
    }),
    (error) => {
      assert.equal(error.code, DIRECTOR_MUTATION_ERROR_CODES.AUTHORITY_UNAVAILABLE);
      assert.equal(error.status, 503);
      assert.equal(error.authorityDiagnostics?.resolvedAuthority, "not-an-authority");
      assert.equal(error.authorityDiagnostics?.allowed, false);
      assert.equal(error.authorityDiagnostics?.fallbackAllowed, false);
      return true;
    },
  );
});

test("Director mutation guards execute before legacy Google reads and writes", async () => {
  const director = postBody(await source("app/api/director/route.js"));
  const directorGuard = 'assertDirectorMutationAuthority({ surface: "director", action: input.action })';
  for (const operation of [
    "getTournamentData(",
    "updateTournamentAdminData(",
    "setMatchesLiveAndOpenScoring(",
    "enableLiveMatchAccess(",
    "disableLiveMatchAccess(",
    "persistDirectorMatchLifecycle(",
    "reopenLiveMatch(",
    "markLiveMatch(",
    "finalizeLiveMatch(",
    "updateDirectorMatchManagement(",
    "updateDirectorRoundPairings(",
    "updateDirectorCalcutta(",
    "updateDirectorNetSkins(",
    "updateDirectorCourseTees(",
    "readDirectorOperationsData(",
  ]) assertBefore(director, directorGuard, operation, "director POST");

  const liveMatches = postBody(await source("app/api/live-matches/route.js"));
  const liveGuard = 'assertDirectorMutationAuthority({ surface: "live-matches", action, authority: authority.resolved })';
  for (const operation of [
    "withWorkbookWriteDiagnostics(",
    "updateLiveMatch(",
    "markLiveMatch(",
    "updateLiveMatchPairing(",
    "persistDirectorMatchLifecycle(",
    "finalizeLiveMatch(",
    "reopenLiveMatch(",
    "generateLiveMatchAccess(",
    "disableLiveMatchAccess(",
  ]) assertBefore(liveMatches, liveGuard, operation, "live-matches POST");

  const resetPreview = postBody(await source("app/api/director/reset-preview/route.js"));
  const resetGuard = 'assertDirectorMutationAuthority({ surface: "director", action: "reset-preview" })';
  assertBefore(resetPreview, resetGuard, "getTournamentData(", "reset-preview POST");
  assertBefore(resetPreview, resetGuard, "resetPreviewTournament(", "reset-preview POST");

  const tournamentAdmin = postBody(await source("app/api/admin/tournament/route.js"));
  const tournamentAdminGuard = 'assertDirectorMutationAuthority({ surface: "director", action: "tournament-admin-update" })';
  assertBefore(tournamentAdmin, tournamentAdminGuard, "updateTournamentAdminData(", "tournament admin POST");

  const adminCms = postBody(await source("app/api/admin/cms/route.js"));
  const adminCmsGuard = 'assertDirectorMutationAuthority({ surface: "admin-cms", action: resource })';
  for (const operation of ["withWorkbookWriteDiagnostics(", "saveCmsRecord(", "archiveCmsRecord(", "deleteCmsRecord(", "reorderCmsRecord("])
    assertBefore(adminCms, adminCmsGuard, operation, "admin CMS POST");
});

test("Supabase Director lifecycle operations use canonical state before any legacy workbook read", async () => {
  const director = postBody(await source("app/api/director/route.js"));
  const supabaseBranch = director.slice(
    director.indexOf('if (mutationAuthority.resolvedAuthority === "supabase")'),
    director.indexOf("const data = await getTournamentData()"),
  );
  assert.match(supabaseBranch, /persistDirectorMatchLifecycle/);
  assert.match(supabaseBranch, /drainGoogleOutbox/);
  assert.doesNotMatch(supabaseBranch, /getTournamentData|readDirectorOperationsData|finalizeLiveMatch|reopenLiveMatch/);
});

test("live-match authorization does not accept Guide or Odds secrets", async () => {
  const liveMatches = await source("app/api/live-matches/route.js");
  assert.doesNotMatch(liveMatches, /GUIDE_ADMIN_SECRET/);
  assert.doesNotMatch(liveMatches, /ODDS_ADMIN_SECRET/);
  assert.match(liveMatches, /process\.env\.ADMIN_SECRET/);
  assert.match(liveMatches, /process\.env\.LIVE_ADMIN_SECRET/);
});

test("Supabase scoring authority blocks legacy secret and match-code sessions before credential handling", async () => {
  const scoringSession = postBody(await source("app/api/scoring/session/route.js"));
  const authorityGuard = 'if (authority.resolved === "supabase")';
  assert.match(scoringSession, /LEGACY_SCORING_SESSION_DISABLED_UNDER_SUPABASE_AUTHORITY/);
  assertBefore(scoringSession, authorityGuard, "request.json()", "scoring session POST");
  assertBefore(scoringSession, authorityGuard, "process.env.ADMIN_SECRET", "scoring session POST");
  assertBefore(scoringSession, authorityGuard, "process.env.LIVE_ADMIN_SECRET", "scoring session POST");
  assertBefore(scoringSession, authorityGuard, "authenticateParticipantMatch(", "scoring session POST");
});
