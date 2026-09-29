// Proof layer: UNIT, with injected identity dependencies. No provider or DB access.
import assert from "node:assert/strict";
import test from "node:test";
import { CANONICAL_PREVIEW_PROJECT_REF } from "../lib/canonical-runtime-source.js";
import {
  participantIdentityAuthorityEnvironment,
  requireParticipantIdentityAuthority,
  assertParticipantIdentityAdministrativeEnvironment,
} from "../lib/participant-identity-authority.js";
import { productionShadowCandidateEnvironment } from "../lib/production-shadow-candidate.js";
import { authorizePreviewDirector } from "../lib/preview-director-authorization.js";
import { resolveSupabaseParticipantIdentity } from "../lib/participant-identity-resolver.js";
import { createParticipantAuthAdminClient, createParticipantAuthOtpClient } from "../lib/supabase-auth-admin.js";

const preview = {
  VERCEL_ENV: "preview",
  PARTICIPANT_IDENTITY_AUTHORITY: "supabase",
  SUPABASE_SCORING_MIRROR_URL: `https://${CANONICAL_PREVIEW_PROJECT_REF}.supabase.co`,
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "synthetic-no-provider-key",
  NEXT_PUBLIC_SUPABASE_AUTH_URL: `https://${CANONICAL_PREVIEW_PROJECT_REF}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY: "synthetic-no-provider-public-key",
};
const requestedInvalidCandidate = { ...preview, PRODUCTION_SHADOW_CANDIDATE_ENABLED: "true" };
const denied = (error) => error.code === "IDENTITY_AUTHORITY_UNAVAILABLE" && error.status === 503;
const cookies = { get: () => undefined, getAll: () => [], set: () => {} };

test("UNIT requested invalid candidate cannot inherit otherwise valid Preview identity", () => {
  const candidate = productionShadowCandidateEnvironment(requestedInvalidCandidate);
  assert.equal(candidate.requested, true);
  assert.equal(candidate.allowed, false);
  const state = participantIdentityAuthorityEnvironment(requestedInvalidCandidate);
  assert.equal(state.eligible, false);
  assert.equal(state.blocked, true);
  assert.equal(state.resolved, "unavailable");
  assert.equal(state.participantAuthEnabled, false);
  assert.equal(state.reason, candidate.reason);
  assert.equal(state.cutoverReady, false);
  assert.throws(() => requireParticipantIdentityAuthority(requestedInvalidCandidate), denied);
});

test("UNIT invalid candidate blocks administrative authority and Auth client construction", () => {
  for (const operation of ["", "PRODUCTION_AUTH_USER_ADMIN", "read_participant_identity_context_for_auth", "unknown_operation"]) {
    assert.throws(() => assertParticipantIdentityAdministrativeEnvironment(requestedInvalidCandidate, { operation }), denied);
  }
  assert.throws(() => createParticipantAuthAdminClient(requestedInvalidCandidate), denied);
  assert.throws(() => createParticipantAuthOtpClient(requestedInvalidCandidate), denied);
});

test("UNIT unknown and retired identity authority cannot acquire administrative capability", () => {
  for (const authority of ["unknown", "passport", "google"]) {
    const env = { ...preview, PARTICIPANT_IDENTITY_AUTHORITY: authority };
    const state = participantIdentityAuthorityEnvironment(env);
    assert.equal(state.valid, false);
    assert.equal(state.blocked, true);
    assert.equal(state.participantAuthEnabled, false);
    assert.throws(() => assertParticipantIdentityAdministrativeEnvironment(env, { operation: "PRODUCTION_AUTH_USER_ADMIN" }), denied);
    assert.throws(() => createParticipantAuthAdminClient(env), denied);
    assert.throws(() => createParticipantAuthOtpClient(env), denied);
  }
});

test("UNIT mismatched Auth origin cannot acquire administrative capability", () => {
  const env = { ...preview, NEXT_PUBLIC_SUPABASE_AUTH_URL: "https://other-project.invalid" };
  assert.equal(participantIdentityAuthorityEnvironment(env).blocked, true);
  assert.throws(() => assertParticipantIdentityAdministrativeEnvironment(env), denied);
});

test("UNIT invalid candidate is denied before Director claims, entitlement, or Passport lookup", async () => {
  const calls = [];
  const result = await authorizePreviewDirector({
    env: requestedInvalidCandidate,
    cookieStore: cookies,
    allowBootstrap: true,
    dependencies: {
      verifyClaims: async () => { calls.push("claims"); return { status: "active", claims: { sub: "11111111-1111-4111-8111-111111111111" } }; },
      readEntitlement: async () => { calls.push("entitlement"); return { payload: { ok: true, found: true, active: true, status: "ACTIVE" } }; },
      inspectPassport: async () => { calls.push("passport"); return { status: "active" }; },
    },
  });
  assert.equal(result.status, "forbidden");
  assert.equal(result.code, "DIRECTOR_CANONICAL_AUTHORITY_REQUIRED");
  assert.deepEqual(calls, []);
});

test("UNIT invalid candidate is denied before participant claims or canonical context lookup", async () => {
  const calls = [];
  await assert.rejects(resolveSupabaseParticipantIdentity({
    env: requestedInvalidCandidate,
    cookieStore: cookies,
    dependencies: {
      verifyClaims: async () => { calls.push("claims"); return { status: "active", claims: { sub: "11111111-1111-4111-8111-111111111111" } }; },
      readForAuth: async () => { calls.push("context"); return { payload: { ok: false } }; },
    },
  }), denied);
  assert.deepEqual(calls, []);
});

test("UNIT ordinary admitted Preview identity and administration remain supported without Google", () => {
  const state = requireParticipantIdentityAuthority(preview);
  assert.equal(state.eligible, true);
  assert.equal(state.blocked, false);
  assert.equal(state.resolved, "supabase");
  assert.equal(state.participantAuthEnabled, true);
  assert.equal(state.productionShadowCandidateRequested, false);
  assert.equal(state.productionShadowCandidate, false);
  assert.equal(assertParticipantIdentityAdministrativeEnvironment(preview, { operation: "read_participant_identity_context_for_auth" }).resolved, "supabase");
  assert.equal(Object.keys(preview).some((name) => /GOOGLE|SHEET|DRIVE/.test(name)), false);
});
