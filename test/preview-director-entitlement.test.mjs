import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createPlayerPassportSession } from "../lib/player-passport.js";
import { authorizePreviewDirector, revokeCurrentPreviewDirector } from "../lib/preview-director-authorization.js";

const secret = "preview-account-director-entitlement-secret";
const authUserId = "11111111-1111-4111-8111-111111111111";
const otherAuthUserId = "22222222-2222-4222-8222-222222222222";
const leaseId = "33333333-3333-4333-8333-333333333333";
const env = {
  VERCEL_ENV: "preview",
  PARTICIPANT_IDENTITY_AUTHORITY: "supabase",
  GOOGLE_SHEETS_ID: "preview-workbook",
  PREVIEW_SCORING_SHEET_ID: "preview-workbook",
  NEXT_PUBLIC_SUPABASE_AUTH_URL: "https://preview.supabase.co",
  NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY: "sb_publishable_preview",
  SUPABASE_SCORING_MIRROR_URL: "https://preview.supabase.co",
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "sb_secret_preview",
};

function request(values = {}) {
  const entries = Object.entries(values).map(([name, value]) => ({ name, value }));
  return { cookies: {
    get: (name) => values[name] ? { value: values[name] } : undefined,
    getAll: () => entries,
  } };
}

function activeEntitlement(overrides = {}) {
  return { payload: {
    ok: true, found: true, active: true, status: "ACTIVE",
    tournamentId: "2026", directorPlayerId: "DIR01", revision: 3,
    linkedAt: "2026-08-14T12:00:00.000Z",
    ...overrides,
  } };
}

function deps(overrides = {}) {
  return {
    verifyClaims: async () => ({ status: "active", claims: { sub: authUserId } }),
    readEntitlement: async () => activeEntitlement(),
    ...overrides,
  };
}

test("linked Director access follows the verified Supabase account with no Passport or Google inspection", async () => {
  let passportInspections = 0;
  for (const browser of ["pwa", "chrome", "safari"]) {
    const result = await authorizePreviewDirector({ request: request(), env, dependencies: deps({
      inspectPassport: async () => { passportInspections += 1; return { status: "active" }; },
    }) });
    assert.equal(result.status, "active", browser);
    assert.equal(result.source, "entitlement");
    assert.equal(result.identity.authUserId, authUserId);
    assert.equal(result.identity.actor.id, "DIR01");
  }
  assert.equal(passportInspections, 0);
});

test("capability follows account changes and a different participant account is denied", async () => {
  const result = await authorizePreviewDirector({ request: request(), env, dependencies: deps({
    verifyClaims: async () => ({ status: "active", claims: { sub: otherAuthUserId } }),
    readEntitlement: async ({ authUserId: current }) => {
      assert.equal(current, otherAuthUserId);
      return { payload: { ok: true, found: false, active: false } };
    },
  }), allowBootstrap: false });
  assert.equal(result.status, "inactive");
  assert.equal(result.code, "DIRECTOR_ENTITLEMENT_REQUIRED");
});

test("a valid canonical Passport bootstraps only a verified Supabase account", async () => {
  const token = createPlayerPassportSession({
    playerId: "DIR01", tournamentId: "2026", deviceId: "bootstrap-device", sessionVersion: 2,
  }, secret);
  let linkedInput;
  const result = await authorizePreviewDirector({
    request: request({ "sbi-preview-director-passport": token }), env,
    dependencies: deps({
      passportSecret: secret,
      readEntitlement: async () => ({ payload: { ok: true, found: false, active: false } }),
      inspectPassport: async () => ({ status: "active", identity: {
        actor: { id: "DIR01", name: "Canonical Director", role: "DIRECTOR" },
        player: { id: "DIR01", name: "Canonical Director", role: "DIRECTOR" },
      } }),
      linkEntitlement: async (input) => {
        linkedInput = input;
        return { payload: { ok: true, active: true, changed: true, tournamentId: "2026", directorPlayerId: "DIR01", revision: 1 } };
      },
    }),
  });
  assert.equal(result.status, "active");
  assert.equal(result.source, "passport-bootstrap");
  assert.equal(result.linked, true);
  assert.deepEqual(linkedInput, {
    auth_user_id: authUserId,
    tournament_id: "2026",
    director_player_id: "DIR01",
    bootstrap_source: "DIRECTOR_PASSPORT",
  });
});

test("revocation is central, fail-closed, and a stale Passport cannot reactivate it", async () => {
  let passportInspections = 0;
  const result = await authorizePreviewDirector({ request: request({ "sbi-preview-director-passport": "stale" }), env, dependencies: deps({
    readEntitlement: async () => ({ payload: { ok: true, found: true, active: false, status: "REVOKED" } }),
    inspectPassport: async () => { passportInspections += 1; return { status: "active" }; },
  }) });
  assert.equal(result.status, "forbidden");
  assert.equal(result.code, "DIRECTOR_ENTITLEMENT_REVOKED");
  assert.equal(passportInspections, 0);

  let revokedInput;
  const revoked = await revokeCurrentPreviewDirector({ request: request(), env, dependencies: deps({
    revokeEntitlement: async (input) => { revokedInput = input; return { payload: { ok: true, changed: true, revision: 4 } }; },
  }) });
  assert.equal(revoked.status, "revoked");
  assert.equal(revokedInput.auth_user_id, authUserId);
  assert.equal(revokedInput.actor_auth_user_id, authUserId);
});

test("an entitlement cannot bypass expired, revoked, missing, or mismatched impersonation leases", async () => {
  const impersonation = createPlayerPassportSession({
    playerId: "DIR01", tournamentId: "2026", deviceId: "account-pointer",
    impersonatedPlayerId: "HM01", previewImpersonationLeaseId: leaseId,
    previewDirector: { id: "DIR01", name: "Tournament Director", role: "DIRECTOR" },
    expiresInSeconds: 3600,
  }, secret);
  for (const code of ["IMPERSONATION_LEASE_EXPIRED", "IMPERSONATION_LEASE_REVOKED", "IMPERSONATION_LEASE_NOT_FOUND", "IMPERSONATION_LEASE_MISMATCH"]) {
    const result = await authorizePreviewDirector({ request: request({ "sbi-player-passport": impersonation }), env, dependencies: deps({
      passportSecret: secret,
      verifyLease: async (input) => {
        assert.equal(input.directorAuthUserId, authUserId);
        return { payload: { ok: false, code } };
      },
    }) });
    assert.equal(result.status, "forbidden");
    assert.equal(result.code, code);
  }
});

test("active entitlement plus an account-bound current lease preserves Preview impersonation", async () => {
  const impersonation = createPlayerPassportSession({
    playerId: "DIR01", tournamentId: "2026", deviceId: "account-pointer",
    impersonatedPlayerId: "HM01", previewImpersonationLeaseId: leaseId,
    previewDirector: { id: "DIR01", name: "Tournament Director", role: "DIRECTOR" },
    expiresInSeconds: 3600,
  }, secret);
  const result = await authorizePreviewDirector({ request: request({ "sbi-player-passport": impersonation }), env, dependencies: deps({
    passportSecret: secret,
    verifyLease: async () => ({ payload: {
      ok: true, leaseId, directorPlayerId: "DIR01", targetPlayerId: "HM01",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      context: { playerId: "HM01", tournament: { id: "2026" }, membership: { active: true } },
    } }),
  }) });
  assert.equal(result.status, "active");
  assert.equal(result.identity.impersonating, true);
  assert.equal(result.identity.impersonation.targetPlayerId, "HM01");
});

test("Production uses the unchanged legacy authorization path and never reads entitlements", async () => {
  let entitlementReads = 0;
  let legacyInspections = 0;
  const result = await authorizePreviewDirector({ request: request(), env: { ...env, VERCEL_ENV: "production" }, dependencies: {
    readEntitlement: async () => { entitlementReads += 1; return activeEntitlement(); },
    inspectPassport: async () => { legacyInspections += 1; return { status: "inactive", identity: null }; },
  } });
  assert.equal(result.status, "inactive");
  assert.equal(entitlementReads, 0);
  assert.equal(legacyInspections, 1);
});

test("schema is narrow, RLS-closed, account-bound, audited, and 2026-only", async () => {
  const sql = await readFile(new URL("../supabase/migrations/202608140001_preview_director_entitlements.sql", import.meta.url), "utf8");
  assert.match(sql, /preview_director_entitlements[\s\S]*auth_user_id uuid not null references auth\.users/);
  assert.match(sql, /primary key \(auth_user_id, tournament_id\)/);
  assert.match(sql, /check \(tournament_id = '2026'\)/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on participant_identity\.preview_director_entitlements from public, anon, authenticated/);
  assert.match(sql, /grant all on participant_identity\.preview_director_entitlements to service_role/);
  assert.match(sql, /user_player_links[\s\S]*auth_user_id = target_user and player_id = director_id and status = 'ACTIVE'/);
  assert.match(sql, /preview_director_entitlement_events/);
  assert.match(sql, /director_auth_user_id/);
  assert.match(sql, /DIRECTOR_ENTITLEMENT_REQUIRED/);
  assert.doesNotMatch(sql, /3026/);
});

test("menu warms account capability and every Director surface uses canonical account authorization", async () => {
  const menu = await readFile(new URL("../app/Menu.js", import.meta.url), "utf8");
  assert.match(menu, /if \(!appShell && !isOpen\) return/);
  assert.match(menu, /fetch\("\/api\/director\/access"/);
  const routes = [
    "app/admin/director/page.js",
    "app/admin/director/game-center-readiness/page.js",
    "app/api/director/route.js",
    "app/api/director/access/route.js",
    "app/api/director/impersonation/route.js",
    "app/api/director/guide-content/route.js",
    "app/api/director/participant-identity/route.js",
    "app/api/director/scoring-authority/route.js",
    "app/api/director/scoring-shadow/route.js",
    "app/api/director/reset-preview/route.js",
  ];
  for (const route of routes) {
    const source = await readFile(new URL(`../${route}`, import.meta.url), "utf8");
    assert.match(source, /authorizePreviewDirector/, route);
  }
});
