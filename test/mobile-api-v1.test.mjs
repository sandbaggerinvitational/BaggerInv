import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  MOBILE_API_ERROR_CODES,
  MobileApiError,
  mobileApiErrorResult,
  mobileHealthResult,
  mobileSessionResult,
} from "../lib/mobile-api-v1.js";
import {
  mobileBearerTokenFromRequest,
  resolveMobileBearerIdentity,
  verifyMobileSupabaseAccessToken,
} from "../lib/mobile-bearer-identity.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const authUserId = "11111111-1111-4111-8111-111111111111";
const previewEnv = {
  VERCEL_ENV: "preview",
  GOOGLE_SHEETS_ID: "preview-workbook",
  PREVIEW_SCORING_SHEET_ID: "preview-workbook",
  PARTICIPANT_IDENTITY_AUTHORITY: "supabase",
  SUPABASE_SCORING_MIRROR_URL: "https://preview.supabase.co",
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "server-only-secret",
  NEXT_PUBLIC_SUPABASE_AUTH_URL: "https://preview.supabase.co",
  NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY: "publishable-preview-key",
};

const canonicalContext = (overrides = {}) => ({
  authUserId,
  playerId: "CB01",
  displayName: "Chris B",
  tournament: { id: "2026", year: 2026, name: "2026 Sandbagger Invitational" },
  team: { id: "PICKLES", name: "The Pickles", side: 1 },
  membership: { active: true, status: "ACTIVE" },
  matches: [{ matchId: "2026-R1-1", canScore: true, permissionRevision: 4 }],
  email: "private@example.test",
  phone: "+15555550100",
  authMetadata: { provider: "email" },
  ...overrides,
});

function requestWithAuthorization(authorization, url = "https://preview.example/api/mobile/v1/session") {
  return {
    url,
    headers: { get: (name) => name.toLowerCase() === "authorization" ? authorization : null },
    body: { playerId: "ATTACKER", displayName: "Fake Player" },
  };
}

test("Preview health is a stable v1 contract and never leaks configuration", () => {
  const result = mobileHealthResult(previewEnv);
  assert.deepEqual(result, {
    status: 200,
    body: { ok: true, apiVersion: "v1", service: "bagger-mobile-api", environment: "preview" },
  });
  const serialized = JSON.stringify(result.body);
  for (const sensitive of [
    previewEnv.SUPABASE_SCORING_MIRROR_SECRET_KEY,
    previewEnv.SUPABASE_SCORING_MIRROR_URL,
    previewEnv.NEXT_PUBLIC_SUPABASE_AUTH_URL,
    previewEnv.NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY,
  ]) assert.equal(serialized.includes(sensitive), false);
});

test("Production and incomplete Preview environments fail closed without identity fallback", () => {
  for (const env of [
    { ...previewEnv, VERCEL_ENV: "production" },
    { ...previewEnv, PARTICIPANT_IDENTITY_AUTHORITY: "passport" },
    { ...previewEnv, SUPABASE_SCORING_MIRROR_SECRET_KEY: "" },
    { ...previewEnv, NEXT_PUBLIC_SUPABASE_AUTH_URL: "https://different-project.supabase.co" },
  ]) {
    assert.deepEqual(mobileHealthResult(env), {
      status: 503,
      body: {
        ok: false,
        apiVersion: "v1",
        error: { code: "MOBILE_API_UNAVAILABLE", message: "The mobile API is unavailable in this environment." },
      },
    });
  }
});

test("Bearer parsing rejects missing, wrong, empty, malformed, and ambiguous headers", () => {
  for (const authorization of [
    null,
    "Basic abc",
    "Bearer",
    "Bearer ",
    "Bearer token extra",
    "Bearer token,second",
    `Bearer ${"x".repeat(8_193)}`,
  ]) {
    assert.throws(
      () => mobileBearerTokenFromRequest(requestWithAuthorization(authorization)),
      (error) => error instanceof MobileApiError && error.code === "UNAUTHORIZED" && error.status === 401,
    );
  }
  assert.equal(mobileBearerTokenFromRequest(requestWithAuthorization("bearer valid-token")), "valid-token");
});

test("an invalid Supabase token is rejected before canonical identity lookup", async () => {
  let identityRead = false;
  await assert.rejects(
    () => resolveMobileBearerIdentity({
      request: requestWithAuthorization("Bearer invalid-token"),
      env: previewEnv,
      dependencies: {
        verifyAccessToken: async () => ({ status: "invalid", authUserId: null }),
        readForAuth: async () => { identityRead = true; return null; },
      },
    }),
    (error) => error instanceof MobileApiError && error.code === "INVALID_TOKEN" && error.status === 401,
  );
  assert.equal(identityRead, false);
});

test("Supabase verification distinguishes rejected tokens from provider outages", async () => {
  const client = (error) => ({ auth: { getUser: async () => ({ data: { user: null }, error }) } });
  assert.deepEqual(
    await verifyMobileSupabaseAccessToken("invalid", { client: client({ status: 401, name: "AuthApiError" }) }),
    { status: "invalid", authUserId: null },
  );
  for (const error of [
    { status: 429, name: "AuthApiError" },
    { status: 503, name: "AuthApiError" },
    { status: 0, name: "AuthRetryableFetchError" },
  ]) {
    assert.deepEqual(
      await verifyMobileSupabaseAccessToken("unknown", { client: client(error) }),
      { status: "unavailable", authUserId: null },
    );
  }
});

test("verified Auth UUID resolves to the canonical Player and ignores client identity claims", async () => {
  const request = requestWithAuthorization(
    "Bearer verified-token",
    "https://preview.example/api/mobile/v1/session?playerId=ATTACKER&email=fake%40example.test&team=FAKE",
  );
  let receivedLookup;
  const identity = await resolveMobileBearerIdentity({
    request,
    env: previewEnv,
    dependencies: {
      verifyAccessToken: async (token) => {
        assert.equal(token, "verified-token");
        return { status: "active", authUserId };
      },
      readForAuth: async (lookup) => {
        receivedLookup = lookup;
        return { payload: { ok: true, data: canonicalContext() } };
      },
    },
  });
  assert.deepEqual(receivedLookup, { authUserId, tournamentId: undefined });
  assert.equal(identity.authUserId, authUserId);
  assert.equal(identity.playerId, "CB01");
  assert.equal(identity.tournamentId, "2026");

  const session = mobileSessionResult(identity);
  assert.deepEqual(session, {
    status: 200,
    body: {
      ok: true,
      apiVersion: "v1",
      data: {
        player: {
          playerId: "CB01",
          displayName: "Chris B",
          team: { teamId: "PICKLES", name: "The Pickles" },
        },
        tournament: {
          tournamentId: "2026",
          name: "2026 Sandbagger Invitational",
          year: 2026,
        },
      },
    },
  });
  const serialized = JSON.stringify(session.body);
  for (const excluded of [authUserId, "private@example.test", "+15555550100", "permissionRevision", "canScore", "authMetadata", "ATTACKER", "FAKE"]) {
    assert.equal(serialized.includes(excluded), false);
  }
});

test("missing, suspended, revoked, inactive, and unapproved mappings receive one controlled denial", async () => {
  for (const code of [
    "ACTIVE_USER_PLAYER_LINK_REQUIRED",
    "USER_PLAYER_LINK_SUSPENDED",
    "USER_PLAYER_LINK_REVOKED",
    "TOURNAMENT_MEMBERSHIP_INACTIVE",
    "APPROVED_TOURNAMENT_CONTEXT_REQUIRED",
    "WRONG_TOURNAMENT",
    "PARTICIPANT_CONTEXT_NOT_FOUND",
  ]) {
    let caught;
    try {
      await resolveMobileBearerIdentity({
        request: requestWithAuthorization("Bearer verified-token"),
        env: previewEnv,
        dependencies: {
          verifyAccessToken: async () => ({ status: "active", authUserId }),
          readForAuth: async () => ({ payload: { ok: false, code } }),
        },
      });
    } catch (error) { caught = error; }
    assert.deepEqual(mobileApiErrorResult(caught), {
      status: 403,
      body: {
        ok: false,
        apiVersion: "v1",
        error: { code: "PARTICIPANT_NOT_FOUND", message: "An active Bagger participant identity is required." },
      },
    });
  }
});

test("identity authority outages and Auth UUID mismatches fail safely", async () => {
  const base = {
    request: requestWithAuthorization("Bearer verified-token"),
    env: previewEnv,
  };
  await assert.rejects(
    () => resolveMobileBearerIdentity({ ...base, dependencies: {
      verifyAccessToken: async () => ({ status: "unavailable" }),
    } }),
    (error) => error.code === "MOBILE_API_UNAVAILABLE" && error.status === 503,
  );
  await assert.rejects(
    () => resolveMobileBearerIdentity({ ...base, dependencies: {
      verifyAccessToken: async () => ({ status: "active", authUserId }),
      readForAuth: async () => ({ payload: { ok: true, data: canonicalContext({ authUserId: "22222222-2222-4222-8222-222222222222" }) } }),
    } }),
    (error) => error.code === "MOBILE_API_UNAVAILABLE" && error.status === 503,
  );
  await assert.rejects(
    () => resolveMobileBearerIdentity({ ...base, dependencies: {
      verifyAccessToken: async () => ({ status: "active", authUserId }),
      readForAuth: async () => {
        const context = canonicalContext();
        delete context.authUserId;
        return { payload: { ok: true, data: context } };
      },
    } }),
    (error) => error.code === "MOBILE_API_UNAVAILABLE" && error.status === 503,
  );
});

test("unclassified errors use a stable participant-safe response", () => {
  const internal = mobileApiErrorResult(new Error("database host and secret details"));
  assert.deepEqual(internal, {
    status: 500,
    body: {
      ok: false,
      apiVersion: "v1",
      error: { code: "INTERNAL_ERROR", message: "The mobile API could not complete the request." },
    },
  });
  assert.equal(JSON.stringify(internal).includes("database host"), false);
});

test("v1 schemas and documentation describe the exact bounded contract", async () => {
  const [health, session, error, documentation] = await Promise.all([
    source("contracts/mobile/v1/health.schema.json"),
    source("contracts/mobile/v1/session.schema.json"),
    source("contracts/mobile/v1/error.schema.json"),
    source("contracts/mobile/v1/README.md"),
  ]);
  const healthSchema = JSON.parse(health);
  const sessionSchema = JSON.parse(session);
  const errorSchema = JSON.parse(error);
  assert.equal(healthSchema.properties.apiVersion.const, "v1");
  assert.equal(healthSchema.properties.service.const, "bagger-mobile-api");
  assert.deepEqual(errorSchema.properties.error.properties.code.enum, MOBILE_API_ERROR_CODES);
  assert.equal(sessionSchema.properties.data.properties.player.additionalProperties, false);
  assert.equal(sessionSchema.properties.data.properties.tournament.additionalProperties, false);
  for (const required of ["Authorization: Bearer", "Preview", "Production", "MOBILE_API_UNAVAILABLE", "No email", "Handicap is not included"]) {
    assert.match(documentation, new RegExp(required));
  }
});

test("mobile Bearer transport remains isolated from browser cookies, Passport, and scoring", async () => {
  const [mobileAuth, mobileSession, browserAuth, browserResolver, passportSession] = await Promise.all([
    source("lib/mobile-bearer-identity.js"),
    source("app/api/mobile/v1/session/route.js"),
    source("lib/supabase-auth-server.js"),
    source("lib/participant-identity-resolver.js"),
    source("app/api/player-passport/session/route.js"),
  ]);
  assert.match(mobileAuth, /auth\.getUser\(token\)/);
  assert.match(mobileAuth, /readParticipantIdentityContextForAuth/);
  assert.doesNotMatch(mobileAuth, /SUPABASE_SCORING_MIRROR_SECRET_KEY|service_role|console\.|playerPassport|scoringSession|searchParams|request\.json/);
  assert.doesNotMatch(mobileSession, /cookies|playerPassport|scoring|searchParams|request\.json|console\./i);
  assert.match(browserAuth, /createServerClient/);
  assert.match(browserAuth, /auth\.getClaims\(\)/);
  assert.match(browserResolver, /verifyParticipantAuthClaims/);
  assert.match(browserResolver, /playerPassportTokenFromRequest/);
  assert.match(passportSession, /PLAYER_PASSPORT_COOKIE/);
  assert.match(passportSession, /createParticipantAuthServerClient/);
});
