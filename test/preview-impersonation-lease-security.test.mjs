import assert from "node:assert/strict";
import test from "node:test";
import { createPlayerPassportSession, verifyPlayerPassportSession } from "../lib/player-passport.js";
import {
  inspectPreviewImpersonationDirectorSession,
  inspectTournamentDirectorToken,
} from "../lib/player-passport-server.js";
import {
  ParticipantIdentityResolutionError,
  resolveSupabaseParticipantIdentity,
} from "../lib/participant-identity-resolver.js";
import { validateAuthoritativeParticipantSession } from "../lib/scoring-participant-authorization.js";

const secret = "preview-impersonation-security-secret";
const leaseId = "22222222-2222-4222-8222-222222222222";
const previewEnv = {
  VERCEL_ENV: "preview",
  GOOGLE_SHEETS_ID: "preview-workbook",
  PREVIEW_SCORING_SHEET_ID: "preview-workbook",
  PARTICIPANT_IDENTITY_AUTHORITY: "supabase",
  SCORING_AUTHORITY: "supabase",
  SUPABASE_SCORING_MIRROR_URL: "https://preview.supabase.co",
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "sb_secret_preview",
  NEXT_PUBLIC_SUPABASE_AUTH_URL: "https://preview.supabase.co",
  NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY: "sb_publishable_preview",
};

function signedSession(overrides = {}) {
  const token = createPlayerPassportSession({
    playerId: "DIR01",
    tournamentId: "2026",
    deviceId: "director-device-1",
    sessionVersion: 7,
    impersonatedPlayerId: "HM01",
    previewImpersonationLeaseId: leaseId,
    previewDirector: { id: "DIR01", name: "Tournament Director", role: "DIRECTOR" },
    ...overrides,
  }, secret);
  return { token, session: verifyPlayerPassportSession(token, secret) };
}

function context(playerId = "HM01", tournamentId = "2026") {
  return {
    playerId,
    displayName: "Holman Moores",
    tournament: { id: tournamentId, year: Number(tournamentId), name: "Sandbagger Invitational" },
    team: { id: "PICKLES", name: "The Pickles", side: 1 },
    membership: { active: true, status: "ACTIVE" },
    matches: [],
    contextRevision: 4,
  };
}

function activeLease(overrides = {}) {
  return { payload: {
    ok: true,
    leaseId,
    directorPlayerId: "DIR01",
    targetPlayerId: "HM01",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    context: context(),
    ...overrides,
  } };
}

function directorIdentity(overrides = {}) {
  return {
    player: { id: "DIR01", name: "Tournament Director", role: "DIRECTOR" },
    actor: { id: "DIR01", name: "Tournament Director", role: "DIRECTOR" },
    ...overrides,
  };
}

function requestFor(token) {
  return { cookies: { get: () => ({ value: token }) } };
}

function cookieStore() {
  return { getAll: () => [], get: () => undefined, set: () => {} };
}

async function withPreview(action) {
  const previous = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = "preview";
  try { return await action(); }
  finally {
    if (previous == null) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
  }
}

test("A: Director Passport, active lease, and signed cookie are all required", async () => withPreview(async () => {
  const { session } = signedSession();
  let strippedDirectorSession;
  const result = await inspectPreviewImpersonationDirectorSession(session, {
    env: previewEnv,
    verifyLease: async (input) => {
      assert.deepEqual(input, { leaseId, tournamentId: "2026", directorPlayerId: "DIR01", playerId: "HM01" });
      return activeLease();
    },
    validateDirector: async (base) => { strippedDirectorSession = base; return directorIdentity(); },
  });
  assert.equal(result.status, "active");
  assert.equal(result.identity.impersonation.leaseId, leaseId);
  assert.equal(Object.hasOwn(strippedDirectorSession, "impersonatedPlayerId"), false);
  assert.equal(strippedDirectorSession.deviceId, "director-device-1");
  assert.equal(strippedDirectorSession.sessionVersion, 7);
}));

test("impersonation token lifetime honors the lease-sized lifetime without a one-hour floor", () => {
  const { session } = signedSession({ expiresInSeconds: 30 });
  const remaining = session.exp - Math.floor(Date.now() / 1000);
  assert.ok(remaining > 0 && remaining <= 30);
});

test("B-D: expired, revoked, and missing leases fail closed before Director freshness", async () => withPreview(async () => {
  const { session } = signedSession();
  for (const code of ["IMPERSONATION_LEASE_EXPIRED", "IMPERSONATION_LEASE_REVOKED", "IMPERSONATION_LEASE_NOT_FOUND"]) {
    let directorChecked = false;
    const result = await inspectPreviewImpersonationDirectorSession(session, {
      env: previewEnv,
      verifyLease: async () => ({ payload: { ok: false, code } }),
      validateDirector: async () => { directorChecked = true; return directorIdentity(); },
    });
    assert.equal(result.status, "forbidden");
    assert.equal(result.code, code);
    assert.equal(directorChecked, false);
  }
}));

test("E-F, J-K: mismatched player, wrong/3026 tournament, and inactive membership are denied", async () => withPreview(async () => {
  const { session } = signedSession();
  const mismatchedPlayer = await inspectPreviewImpersonationDirectorSession(session, {
    env: previewEnv,
    verifyLease: async () => activeLease({ targetPlayerId: "MS01", context: context("MS01") }),
    validateDirector: async () => directorIdentity(),
  });
  assert.equal(mismatchedPlayer.status, "forbidden");

  let fixtureLeaseRead = false;
  const fixture = signedSession({ tournamentId: "3026" }).session;
  const wrongTournament = await inspectPreviewImpersonationDirectorSession(fixture, {
    env: previewEnv,
    verifyLease: async () => { fixtureLeaseRead = true; return activeLease(); },
    validateDirector: async () => directorIdentity(),
  });
  assert.equal(wrongTournament.code, "WRONG_TOURNAMENT");
  assert.equal(fixtureLeaseRead, false);

  const inactive = await inspectPreviewImpersonationDirectorSession(session, {
    env: previewEnv,
    verifyLease: async () => ({ payload: { ok: false, code: "IMPERSONATION_TARGET_INACTIVE" } }),
    validateDirector: async () => directorIdentity(),
  });
  assert.equal(inactive.status, "forbidden");
}));

test("G-H: tampered cookies and another Director/session cannot replay a lease", async () => withPreview(async () => {
  const { token } = signedSession();
  const tampered = await inspectTournamentDirectorToken(`${token}x`, { passportSecret: secret, env: previewEnv });
  assert.equal(tampered.status, "inactive");

  const anotherDirector = signedSession({
    playerId: "DIR02",
    deviceId: "director-device-2",
    previewDirector: { id: "DIR02", name: "Other Director", role: "DIRECTOR" },
  }).session;
  const replay = await inspectPreviewImpersonationDirectorSession(anotherDirector, {
    env: previewEnv,
    verifyLease: async () => activeLease(),
    validateDirector: async () => directorIdentity({
      player: { id: "DIR02", role: "DIRECTOR" },
      actor: { id: "DIR02", role: "DIRECTOR" },
    }),
  });
  assert.equal(replay.status, "forbidden");
  assert.equal(replay.code, "IMPERSONATION_LEASE_MISMATCH");
}));

test("I: retaining the cookie after End Impersonation cannot restore a revoked lease", async () => withPreview(async () => {
  const { session } = signedSession();
  let revoked = false;
  const dependencies = {
    env: previewEnv,
    verifyLease: async () => revoked ? { payload: { ok: false, code: "IMPERSONATION_LEASE_REVOKED" } } : activeLease(),
    validateDirector: async () => directorIdentity(),
  };
  assert.equal((await inspectPreviewImpersonationDirectorSession(session, dependencies)).status, "active");
  revoked = true;
  const staleCookie = await inspectPreviewImpersonationDirectorSession(session, dependencies);
  assert.equal(staleCookie.status, "forbidden");
  assert.equal(staleCookie.code, "IMPERSONATION_LEASE_REVOKED");
}));

test("participant identity also rejects expired/revoked/missing leases without Auth fallback", async () => withPreview(async () => {
  const { token } = signedSession();
  for (const code of ["IMPERSONATION_LEASE_EXPIRED", "IMPERSONATION_LEASE_REVOKED", "IMPERSONATION_LEASE_NOT_FOUND"]) {
    let authFallback = false;
    await assert.rejects(() => resolveSupabaseParticipantIdentity({
      request: requestFor(token), cookieStore: cookieStore(), env: previewEnv,
      dependencies: {
        passportSecret: secret,
        verifyImpersonation: async () => ({ payload: { ok: false, code } }),
        verifyClaims: async () => { authFallback = true; return { status: "active", claims: { sub: "auth-user" } }; },
      },
    }), (error) => error instanceof ParticipantIdentityResolutionError && error.code === code);
    assert.equal(authFallback, false);
  }
}));

test("L: normal Supabase participant identity and scoring remain unaffected", async () => {
  const resolved = await resolveSupabaseParticipantIdentity({
    cookieStore: cookieStore(), env: previewEnv,
    dependencies: {
      verifyClaims: async () => ({ status: "active", claims: { sub: "auth-user" } }),
      readForAuth: async () => ({ payload: { ok: true, data: context("HM01") } }),
    },
  });
  assert.equal(resolved.playerId, "HM01");
  assert.equal(resolved.previewMode, false);

  const session = { scope: "match", matchId: "2026-R3-4", tournamentId: "2026", playerId: "HM01",
    accessVersion: 3, readOnly: false, identityAuthority: "supabase" };
  const authorized = await validateAuthoritativeParticipantSession({}, session, { requireWritable: true, cookieStore: cookieStore(),
    dependencies: { env: previewEnv, resolveIdentity: async () => resolved,
      readScoringContext: async () => ({ payload: { ok: true, data: { match: { status: "LIVE", scoring_locked: false },
        authorization: { verified: true, writable: true, permission_revision: 3 } } } }) } });
  assert.equal(authorized.writable, true);
  assert.equal(authorized.googleRequests, 0);
});

test("expired impersonation cannot authorize an existing scoring session", async () => withPreview(async () => {
  const { token } = signedSession();
  const participantSession = { scope: "match", matchId: "2026-R3-4", tournamentId: "2026", playerId: "HM01",
    accessVersion: 3, readOnly: false, identityAuthority: "supabase" };
  await assert.rejects(() => validateAuthoritativeParticipantSession(requestFor(token), participantSession, {
    requireWritable: true, cookieStore: cookieStore(), dependencies: {
      env: previewEnv,
      identityDependencies: {
        passportSecret: secret,
        verifyImpersonation: async () => ({ payload: { ok: false, code: "IMPERSONATION_LEASE_EXPIRED" } }),
      },
      readScoringContext: async () => { throw new Error("must not reach scoring context"); },
    },
  }), (error) => error.code === "IMPERSONATION_LEASE_EXPIRED");
}));

test("M: Production hard-blocks Preview impersonation even with a valid signed cookie and lease", async () => withPreview(async () => {
  const { session } = signedSession();
  let leaseRead = false;
  const result = await inspectPreviewImpersonationDirectorSession(session, {
    env: { ...previewEnv, VERCEL_ENV: "production" },
    verifyLease: async () => { leaseRead = true; return activeLease(); },
    validateDirector: async () => directorIdentity(),
  });
  assert.equal(result.status, "forbidden");
  assert.equal(result.code, "PREVIEW_IMPERSONATION_UNAVAILABLE");
  assert.equal(leaseRead, false);
}));
