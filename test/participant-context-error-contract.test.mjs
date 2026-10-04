import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { requireParticipantIdentityAuthority } from "../lib/participant-identity-authority.js";
import {
  ParticipantIdentityResolutionError,
  participantIdentityPublicError,
  resolveSupabaseParticipantIdentity,
} from "../lib/participant-identity-resolver.js";

// Execute the actual shipping route and resolver with local Auth/DB boundaries.
// No provider, hosted database, Google transport or privileged credential is used.
const env = {
  VERCEL_ENV: "preview",
  PARTICIPANT_IDENTITY_AUTHORITY: "supabase",
  SUPABASE_SCORING_MIRROR_URL: "https://idgigvjjqkfbqjeredpb.supabase.co",
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "synthetic-local-server-credential",
  NEXT_PUBLIC_SUPABASE_AUTH_URL: "https://idgigvjjqkfbqjeredpb.supabase.co",
  NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY: "synthetic-local-public-credential",
};
const authUserId = "11111111-1111-4111-8111-111111111111";
const participant = {
  playerId: "P12", displayName: "Synthetic Participant A",
  tournament: { id: "2026", year: 2026, name: "Synthetic Certification" },
  team: { id: "T1", name: "Synthetic Team One" },
  membership: { active: true, status: "ACTIVE" },
  matches: [{ matchId: "2026-R3-12", canScore: false, permissionRevision: 1 }],
  contextRevision: 1,
};
const cookieStore = { getAll: () => [], get: () => undefined, set: () => {} };
const unexpected = () => assert.fail("No Passport, Google, fallback or shadow operation is allowed");

async function route({ verified = true, context = participant, identityCode, error, runtime = env } = {}) {
  const calls = [];
  const logs = [];
  const dependencies = {
    cookies: async () => cookieStore,
    NextResponse: { json: (body, init) => Response.json(body, init) },
    requireParticipantIdentityAuthority,
    playerPassportTokenFromRequest: unexpected, verifyPlayerPassportSession: unexpected,
    inspectPlayerPassportToken: unexpected, readParticipantIdentityContext: unexpected,
    observeParticipantIdentityShadow: unexpected, verifyParticipantAuthClaims: unexpected,
    ParticipantIdentityResolutionError, participantIdentityPublicError,
    applicationRequestEnvironment: () => runtime,
    resolveSupabaseParticipantIdentity: async input => {
      if (error) throw error;
      return resolveSupabaseParticipantIdentity({ ...input, dependencies: {
        verifyClaims: async () => {
          calls.push("verify-claims");
          return verified ? { status: "active", claims: { sub: authUserId } }
            : { status: "inactive", error: "No verified Auth session" };
        },
        readForAuth: async args => {
          calls.push({ operation: "canonical-context", args });
          return { payload: identityCode ? { ok: false, code: identityCode } : { ok: true, data: context } };
        },
      } });
    },
    process: { env: runtime }, console: { error: (...args) => logs.push(args), info: () => {} },
  };
  const source = (await readFile(new URL("../app/api/participant/context/route.js", import.meta.url), "utf8"))
    .replace(/^import\s+\{[\s\S]*?\}\s+from\s+[^;]+;\n/gm, "")
    .replace("export const dynamic", "const dynamic")
    .replace("export async function GET", "async function GET");
  const get = new Function(...Object.keys(dependencies), `${source}; return GET;`)(...Object.values(dependencies));
  const request = new Request("https://certification.example.invalid/api/participant/context?playerId=P11&resource=PRODUCTION");
  request.cookies = cookieStore;
  const response = await get(request);
  return { response, body: await response.json(), calls, logs };
}

function denial(result, status, code) {
  assert.equal(result.response.status, status);
  assert.equal(result.body.code, code);
  assert.equal(result.body.identityAuthority, "supabase");
  assert.equal(result.body.session.status, status === 401 ? "inactive" : "unavailable");
  assert.equal(result.response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(Object.keys(result.body).sort(), ["code", "error", "identityAuthority", "session"]);
  assert.equal(Object.hasOwn(result.body, "playerId"), false);
  assert.equal(Object.hasOwn(result.body, "matches"), false);
  assert.equal(JSON.stringify(result.body).includes(participant.displayName), false);
}

test("signed-out participant context returns 401 AUTH_SESSION_REQUIRED before any canonical read", async () => {
  const result = await route({ verified: false });
  denial(result, 401, "AUTH_SESSION_REQUIRED");
  assert.deepEqual(result.calls, ["verify-claims"]);
});

test("authenticated but unlinked participant context returns 403 without participant data", async () => {
  const result = await route({ identityCode: "ACTIVE_USER_PLAYER_LINK_REQUIRED" });
  denial(result, 403, "ACTIVE_USER_PLAYER_LINK_REQUIRED");
  assert.equal(result.calls[1].args.authUserId, authUserId);
});

for (const [code, status] of [
  ["AUTH_SESSION_EXPIRED", 401],
  ["USER_PLAYER_LINK_SUSPENDED", 403], ["USER_PLAYER_LINK_REVOKED", 403],
  ["TOURNAMENT_MEMBERSHIP_INACTIVE", 403], ["APPROVED_TOURNAMENT_CONTEXT_REQUIRED", 403],
  ["WRONG_TOURNAMENT", 403], ["IMPERSONATION_LEASE_NOT_FOUND", 403],
  ["IMPERSONATION_LEASE_REVOKED", 403], ["IMPERSONATION_LEASE_EXPIRED", 403],
  ["IMPERSONATION_LEASE_MISMATCH", 403], ["IMPERSONATION_TARGET_INACTIVE", 403],
  ["PRODUCTION_AUTH_CERTIFICATION_REQUIRED", 403],
  ["IDENTITY_AUTHORITY_UNAVAILABLE", 503], ["PARTICIPANT_CONTEXT_UNAVAILABLE", 503],
  ["PRODUCTION_CURRENT_TOURNAMENT_IDENTITY_NOT_POINTER_AWARE", 503],
]) {
  test(`typed ${code} without authority metadata preserves its ${status} contract`, async () => {
    const error = new ParticipantIdentityResolutionError(code, "Internal detail must remain private");
    assert.equal(Object.hasOwn(error, "authority"), false);
    const result = await route({ error });
    denial(result, status, code);
    assert.equal(JSON.stringify(result.body).includes(error.message), false);
  });
}

test("linked participant success preserves the exact context and ignores client-selected identity/resource", async () => {
  const result = await route();
  assert.equal(result.response.status, 200, JSON.stringify(result.logs));
  const { identityTimings, ...body } = result.body;
  assert.deepEqual(body, { identityAuthority: "supabase", session: { status: "active" },
    ...participant, previewMode: false, impersonation: null });
  assert.ok(Number.isFinite(identityTimings.totalIdentityMs));
  assert.equal(result.response.headers.get("x-participant-identity-authority"), "supabase");
  assert.equal(result.response.headers.get("x-participant-identity-google-requests"), "0");
  assert.deepEqual(result.calls[1], { operation: "canonical-context", args: { authUserId, tournamentId: undefined } });
});

for (const [name, error] of [
  ["generic internal failure", new Error("Private database connection detail")],
  ["untyped authorization-shaped error", Object.assign(new Error("Private internal detail"), { code: "AUTH_SESSION_REQUIRED", status: 401 })],
  ["untyped named impostor", Object.assign(new Error("Private internal detail"), { name: "ParticipantIdentityResolutionError", code: "AUTH_SESSION_REQUIRED", status: 401 })],
  ["service/database unavailable", Object.assign(new Error("Private database connection detail"), { code: "ECONNREFUSED", status: 503 })],
]) {
  test(`${name} remains generic 503 rather than becoming an authorization denial`, async () => {
    const result = await route({ error });
    assert.equal(result.response.status, 503);
    assert.deepEqual(result.body, { identityAuthority: "unavailable", session: { status: "unavailable" }, error: "Participant context is temporarily unavailable." });
  });
}

test("an actual canonical read outage remains 503 without returning partial/private context", async () => {
  const result = await route({ identityCode: "PARTICIPANT_CONTEXT_UNAVAILABLE" });
  denial(result, 503, "PARTICIPANT_CONTEXT_UNAVAILABLE");
});

test("invalid physical resource selection remains unavailable before Auth or canonical context", async () => {
  const result = await route({ runtime: { ...env, SUPABASE_SCORING_MIRROR_URL: "https://unapproved-resource.invalid" } });
  assert.equal(result.response.status, 503);
  assert.deepEqual(result.body, { identityAuthority: "unavailable", session: { status: "unavailable" }, error: "Participant context is temporarily unavailable." });
  assert.deepEqual(result.calls, []);
  assert.equal(Object.hasOwn(result.body, "playerId"), false);
});

test("participant-context diagnostic route stays unavailable outside Preview", async () => {
  const result = await route({ runtime: { ...env, VERCEL_ENV: "production" } });
  assert.equal(result.response.status, 404);
  assert.deepEqual(result.body, { error: "Not found." });
  assert.deepEqual(result.calls, []);
});
