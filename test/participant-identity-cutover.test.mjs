import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createPlayerPassportSession } from "../lib/player-passport.js";
import {
  ParticipantIdentityResolutionError,
  resolveSupabaseParticipantIdentity,
} from "../lib/participant-identity-resolver.js";
import { validateAuthoritativeParticipantSession } from "../lib/scoring-participant-authorization.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
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
const context = (playerId = "CB01") => ({
  playerId,
  displayName: playerId === "CB01" ? "Chris B" : "Holman Moores",
  tournament: { id: "2026", year: 2026, name: "2026 Sandbagger Invitational" },
  team: { id: "PICKLES", name: "The Pickles", side: 1 },
  membership: { active: true, status: "ACTIVE" },
  matches: [{ matchId: "2026-R3-2", canScore: true, permissionRevision: 1 }],
  contextRevision: 1,
});

function cookieStore() { return { getAll: () => [], get: () => undefined, set: () => {} }; }

test("Supabase identity resolves verified claims to a stable Player ID without email or browser identity", async () => {
  const resolved = await resolveSupabaseParticipantIdentity({
    cookieStore: cookieStore(), env: previewEnv,
    dependencies: {
      verifyClaims: async () => ({ status: "active", claims: { sub: "11111111-1111-4111-8111-111111111111", email: "not-runtime-identity@example.test" } }),
      readForAuth: async ({ authUserId }) => ({ payload: { ok: true, data: { ...context(), authUserId } } }),
    },
  });
  assert.equal(resolved.identityAuthority, "supabase");
  assert.equal(resolved.playerId, "CB01");
  assert.equal(resolved.tournamentId, "2026");
  assert.equal(resolved.googleRequests, 0);
  assert.equal(Object.hasOwn(resolved, "email"), false);
});

test("missing, expired, suspended, revoked, inactive, and wrong-tournament identity fail deterministically", async () => {
  const attempt = (verifyClaims, payload) => resolveSupabaseParticipantIdentity({ cookieStore: cookieStore(), env: previewEnv,
    dependencies: { verifyClaims, readForAuth: async () => ({ payload }) } });
  await assert.rejects(() => attempt(async () => ({ status: "inactive", error: "No session" })),
    (error) => error instanceof ParticipantIdentityResolutionError && error.code === "AUTH_SESSION_REQUIRED");
  await assert.rejects(() => attempt(async () => ({ status: "inactive", error: "JWT expired" })),
    (error) => error.code === "AUTH_SESSION_EXPIRED");
  for (const code of ["USER_PLAYER_LINK_SUSPENDED", "USER_PLAYER_LINK_REVOKED", "TOURNAMENT_MEMBERSHIP_INACTIVE", "WRONG_TOURNAMENT"]) {
    await assert.rejects(() => attempt(async () => ({ status: "active", claims: { sub: "11111111-1111-4111-8111-111111111111" } }), { ok: false, code }),
      (error) => error.code === code);
  }
});

test("Director Preview impersonation is an audited lease and does not require a fake Auth user", async () => {
  const original = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = "preview";
  try {
    const secret = "preview-passport-secret-at-least-24-chars";
    const token = createPlayerPassportSession({ playerId: "DIR01", tournamentId: "2026", deviceId: "preview-device",
      impersonatedPlayerId: "HM01", previewImpersonationLeaseId: "22222222-2222-4222-8222-222222222222",
      previewDirector: { id: "DIR01", name: "Director" } }, secret);
    let authCalled = false;
    const resolved = await resolveSupabaseParticipantIdentity({
      request: { cookies: { get: () => ({ value: token }) } }, cookieStore: cookieStore(), env: previewEnv,
      dependencies: {
        passportSecret: secret,
        verifyClaims: async () => { authCalled = true; return { status: "inactive" }; },
        verifyImpersonation: async () => ({ payload: { ok: true, leaseId: "22222222-2222-4222-8222-222222222222",
          targetPlayerId: "HM01", expiresAt: "2026-08-12T23:00:00Z", context: context("HM01") } }),
      },
    });
    assert.equal(resolved.playerId, "HM01");
    assert.equal(resolved.previewMode, true);
    assert.equal(authCalled, false);
  } finally {
    if (original == null) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = original;
  }
});

test("Supabase scoring and Finalization validate the current Auth-linked player without Google freshness", async () => {
  const session = { scope: "match", matchId: "2026-R3-2", tournamentId: "2026", playerId: "CB01",
    accessVersion: 1, readOnly: false, identityAuthority: "supabase" };
  const result = await validateAuthoritativeParticipantSession({}, session, { requireWritable: true, cookieStore: cookieStore(),
    dependencies: { env: previewEnv, resolveIdentity: async () => ({ playerId: "CB01", tournamentId: "2026" }),
      readScoringContext: async () => ({ payload: { ok: true, data: { match: { status: "LIVE", scoring_locked: false },
        authorization: { verified: true, writable: true, permission_revision: 1 } } } }) } });
  assert.equal(result.googleRequests, 0);
  assert.equal(result.writable, true);

  const final = await validateAuthoritativeParticipantSession({}, { ...session, matchId: "2026-R2-5", readOnly: true }, {
    cookieStore: cookieStore(), dependencies: { env: previewEnv,
      resolveIdentity: async () => ({ playerId: "CB01", tournamentId: "2026" }),
      authorizeMatch: async () => ({ payload: { allowed: true, read_only: true, code: "AUTHORIZED" } }) } });
  assert.equal(final.writable, false);
  assert.equal(final.googleRequests, 0);
});

test("authority-boundary, link mismatch, revoked permission, and locked/final scoring cannot silently fall back", async () => {
  const base = { scope: "match", matchId: "M1", tournamentId: "2026", playerId: "CB01", accessVersion: 1,
    readOnly: false, identityAuthority: "supabase" };
  const deps = { env: previewEnv, resolveIdentity: async () => ({ playerId: "CB01", tournamentId: "2026" }),
    readScoringContext: async () => ({ payload: { ok: true, data: { match: { status: "LIVE" }, authorization: { verified: false, writable: false } } } }) };
  await assert.rejects(() => validateAuthoritativeParticipantSession({}, { ...base, identityAuthority: "passport" }, { cookieStore: cookieStore(), dependencies: deps }),
    (error) => error.code === "IDENTITY_AUTHORITY_BOUNDARY_MISMATCH");
  await assert.rejects(() => validateAuthoritativeParticipantSession({}, base, { cookieStore: cookieStore(), dependencies: deps }),
    (error) => error.code === "SCORING_PERMISSION_REVOKED");
  await assert.rejects(() => validateAuthoritativeParticipantSession({}, base, { cookieStore: cookieStore(), dependencies: {
    ...deps, resolveIdentity: async () => ({ playerId: "HM01", tournamentId: "2026" }) } }),
  (error) => error.code === "ACTIVE_USER_PLAYER_LINK_REQUIRED");
});

test("cutover migration and routes preserve RLS, audit, rollback, and zero-Google identity semantics", async () => {
  const [migration, tournamentContextMigration, contextRoute, matchRoute, scoring, session, initialize, impersonation] = await Promise.all([
    source("supabase/migrations/202608120022_preview_participant_identity_cutover.sql"),
    source("supabase/migrations/202608120023_preview_participant_tournament_context.sql"),
    source("app/api/participant/context/route.js"), source("app/api/player-passport/matches/route.js"),
    source("lib/scoring-participant-authorization.js"), source("app/api/player-passport/session/route.js"),
    source("app/api/player-passport/initialize/route.js"), source("app/api/director/impersonation/route.js"),
  ]);
  assert.match(migration, /preview_impersonation_leases[\s\S]*enable row level security/);
  assert.match(migration, /PREVIEW_IMPERSONATION_STARTED/);
  assert.match(migration, /PREVIEW_IMPERSONATION_ENDED/);
  assert.match(migration, /revoke all on function[\s\S]*from public, anon, authenticated/);
  assert.doesNotMatch(migration, /create policy|using\s*\(\s*true\s*\)/i);
  assert.match(tournamentContextMigration, /resolve_approved_participant_tournament/);
  assert.match(tournamentContextMigration, /participant_identity_contacts/);
  assert.match(tournamentContextMigration, /status = 'APPROVED'/);
  assert.match(tournamentContextMigration, /APPROVED_TOURNAMENT_CONTEXT_REQUIRED/);
  assert.match(tournamentContextMigration, /inspect_participant_identity_tournament_resolution/);
  assert.doesNotMatch(tournamentContextMigration, /order by t\.tournament_year desc/);
  assert.doesNotMatch(tournamentContextMigration, /create policy|using\s*\(\s*true\s*\)/i);
  for (const route of [contextRoute, matchRoute, session, initialize]) {
    assert.match(route, /resolveSupabaseParticipantIdentity/);
    assert.match(route, /X-Participant-Identity-Google-Requests|Google-Requests/);
  }
  assert.match(scoring, /IDENTITY_AUTHORITY_BOUNDARY_MISMATCH/);
  assert.match(scoring, /resolveSupabaseParticipantIdentity/);
  assert.match(impersonation, /beginPreviewIdentityImpersonation/);
  assert.match(impersonation, /endPreviewIdentityImpersonation/);
  assert.doesNotMatch(impersonation, /createUser|verifyOtp|fake JWT/i);
});
