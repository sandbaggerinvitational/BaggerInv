import assert from "node:assert/strict";
import test from "node:test";
import { requestMobileNativeOtp, certifyMobileNativeOtp } from "../lib/mobile-native-auth.js";
import { resolveMobileBearerIdentity } from "../lib/mobile-bearer-identity.js";
import { recheckMobileNativeIdentity } from "../lib/mobile-native-admission.js";
import { issueMobileNativeCertification, verifyMobileNativeCertification } from "../lib/mobile-native-certification.js";
import { actor, environment, authorityFixtures, productionContext, request } from "./fixtures/pn2-native.mjs";
import { authorizeProductionParticipantEmailOtpEligibility } from "../lib/production-participant-auth-enrollment.js";

const participant = (revision = 1) => ({ authUserId: actor.authUserId, playerId: actor.playerId,
  tournament: { id: actor.tournamentId }, membership: { active: true }, contextRevision: revision });
const signedContext = (revision = 1) => ({ ...productionContext(), participant: participant(revision) });

test("PN-8A existing canonical recovery claim reuses Auth identity without creating another user", async () => {
  let attempts = 0, lookups = 0, completions = 0;
  const result = await authorizeProductionParticipantEmailOtpEligibility({ email: "synthetic@example.invalid" }, {
    env: environment(["auth"]), rpc: async name => {
      if (name === "complete_production_participant_first_login") { completions++; return { payload: { ok: true } }; }
      assert.equal(name, "authorize_production_participant_otp_request");
      return { productionRuntime: { tournamentId: "2026", futureGeneration: false }, payload: ++attempts === 1
        ? { provisioningRequired: true, claimId: actor.authUserId, recoveryAuthUserId: actor.authUserId, playerId: actor.playerId, email: "synthetic@example.invalid" }
        : { allowed: true, requestId: actor.authUserId, ...actor, verificationType: "signup" } };
    }, adminClient: { auth: { admin: {
      getUserById: async id => { assert.equal(id, actor.authUserId); lookups++; return { data: { user: { id } } }; },
      createUser: async () => { assert.fail("Recovery must never create a duplicate user"); },
    } } },
  });
  assert.equal(result.ok, true); assert.equal(lookups, 1); assert.equal(completions, 1); assert.equal(attempts, 2);
});

test("PN-8A AUTH OFF and malformed/client-selected enrollment input stop before the canonical adapter", async () => {
  for (const mode of ["off", "missing-captcha", "client-mode", "client-player"]) {
    const env = environment(mode === "off" ? [] : ["auth"]), f = authorityFixtures(env);
    let calls = 0;
    const input = { method: "email", identifier: "synthetic@example.invalid", captchaToken: "synthetic-captcha-token-at-least-twenty-characters" };
    if (mode === "missing-captcha") delete input.captchaToken;
    if (mode === "client-mode") input.verificationType = "signup";
    if (mode === "client-player") input.playerId = "arbitrary";
    await assert.rejects(() => requestMobileNativeOtp({ env, request: request("auth/otp/request"), input,
      dependencies: { nativeAdmission: f.dependencies, minimumDurationMs: 0,
        authorizeOptions: { rpc: async () => { calls++; throw new Error("must not reach adapter"); } } } }));
    assert.equal(calls, 0);
  }
});

test("PN-8A canonical participant revision R2 rejects an R1 certificate", () => {
  const env = environment(["certification", "reads"]);
  const proof = issueMobileNativeCertification({ ...actor, env, productionContext: signedContext() });
  assert.doesNotThrow(() => verifyMobileNativeCertification({ ...actor, env, token: proof.token, productionContext: signedContext() }));
  assert.throws(() => verifyMobileNativeCertification({ ...actor, env, token: proof.token, productionContext: signedContext(2) }), { code: "AUTH_CERTIFICATION_FAILED" });
});

test("PN-8A revision contract rejects absent/invalid/inactive/changed identity but ignores presentation churn", () => {
  const env = environment(["certification"]);
  const token = issueMobileNativeCertification({ ...actor, env, productionContext: signedContext() }).token;
  for (const change of [{ contextRevision: 0 }, { contextRevision: undefined }, { contextRevision: "1" },
    { membership: { active: false } }, { authUserId: "other" }, { playerId: "other" }, { tournament: { id: "2027" } }]) {
    assert.throws(() => verifyMobileNativeCertification({ ...actor, env, token,
      productionContext: { ...signedContext(), participant: { ...participant(), ...change } } }), { code: "AUTH_CERTIFICATION_FAILED" });
  }
  assert.doesNotThrow(() => verifyMobileNativeCertification({ ...actor, env, token,
    productionContext: { ...signedContext(), participant: { ...participant(), generatedAt: "later", displayName: "changed", matches: [] } } }));
});

test("PN-8A canonical revision or revocation during a read rejects response/304 recheck", async () => {
  const env = environment(["certification", "reads"]), f = authorityFixtures(env);
  let context = participant(), active = true;
  const token = issueMobileNativeCertification({ ...actor, env, productionContext: signedContext() }).token;
  const identity = await resolveMobileBearerIdentity({ env,
    request: request("today", { headers: { authorization: "Bearer synthetic", "x-bagger-certification": token } }),
    dependencies: { nativeAdmission: f.dependencies, verifyAccessToken: async () => ({ status: "active", authUserId: actor.authUserId }),
      readForAuth: async () => ({ payload: { ok: active, data: context } }), readCurrentTournamentRuntime: async () => f.current } });
  await recheckMobileNativeIdentity(identity, "reads", env);
  context = participant(2);
  await assert.rejects(() => recheckMobileNativeIdentity(identity, "reads", env), { code: "AUTH_CERTIFICATION_FAILED" });
  context = participant(); active = false;
  await assert.rejects(() => recheckMobileNativeIdentity(identity, "reads", env), { code: "AUTH_CERTIFICATION_FAILED" });
});

test("PN-8A default Production path reuses existing enrollment adapter and preserves generic response", async () => {
  const env = environment(["auth"]), f = authorityFixtures(env), calls = [];
  const rpc = async (name) => {
    calls.push(name);
    if (name === "authorize_production_participant_otp_request") return { productionRuntime: { tournamentId: "2026", futureGeneration: false },
      payload: calls.filter(n => n === name).length === 1
        ? { provisioningRequired: true, claimId: actor.authUserId, playerId: actor.playerId, email: "synthetic@example.invalid" }
        : { allowed: true, requestId: actor.authUserId, authUserId: actor.authUserId, playerId: actor.playerId, email: "synthetic@example.invalid", verificationType: "signup" } };
    assert.equal(name, "complete_production_participant_first_login"); return { payload: { ok: true } };
  };
  const result = await requestMobileNativeOtp({ env, request: request("auth/otp/request"),
    input: { method: "email", identifier: "synthetic@example.invalid", captchaToken: "synthetic-captcha-token-at-least-twenty-characters" },
    dependencies: { nativeAdmission: f.dependencies, minimumDurationMs: 0, consumeClientRateLimit: () => ({ allowed: true }),
      authorizeOptions: { rpc, adminClient: { auth: { admin: { createUser: async input => {
        assert.equal(input.email_confirm, false); calls.push("controlled-create"); return { data: { user: { id: actor.authUserId } } };
      } } } } },
      authClient: { auth: { resend: async input => { assert.equal(input.type, "signup"); assert.ok(input.options.captchaToken); calls.push("resend-signup"); return { error: null }; } } },
      recordDelivery: async input => { assert.equal(input.succeeded, true); calls.push("record-delivery"); },
    } });
  assert.deepEqual(calls, ["authorize_production_participant_otp_request", "controlled-create", "complete_production_participant_first_login",
    "authorize_production_participant_otp_request", "resend-signup", "record-delivery"]);
  assert.deepEqual(Object.keys(result.body.data).sort(), ["accepted", "challengeId", "expiresInSeconds", "message", "method", "resendAfterSeconds", "verificationType"].sort());
  assert.equal(result.body.data.verificationType, "email");
});

test("PN-8A first-login certification completes canonical verification before resolving VERIFIED identity", async () => {
  const env = environment(["certification"]), f = authorityFixtures(env), calls = [];
  let verified = false;
  const result = await certifyMobileNativeOtp({ env, request: request("auth/otp/certify", { headers: { authorization: "Bearer synthetic" } }),
    input: { challengeId: actor.authUserId }, dependencies: {
      nativeAdmission: f.dependencies, consumeCertificationRateLimit: () => ({ allowed: true }),
      verifyUser: async () => ({ status: "active", authUserId: actor.authUserId, email: "synthetic@example.invalid", emailVerified: true }),
      authorizeVerification: async () => ({ payload: { allowed: true, ...actor, verificationType: "signup" } }),
      recordVerification: async () => { verified = true; calls.push("record"); return { payload: { ok: true, certified: true, authUserId: actor.authUserId, requestId: actor.authUserId } }; },
      readIdentity: async () => { assert.equal(verified, true); calls.push("identity"); return { payload: { ok: true, data: participant() } }; },
    } });
  assert.equal(result.status, 200);
  assert.deepEqual(calls, ["record", "identity"]);
  assert.ok(verifyMobileNativeCertification({ ...actor, env, token: result.body.data.certificationToken, productionContext: signedContext() }));
});

for (const outcome of ["unknown", "collision", "cleanup", "provider-failure", "audit-failure"]) {
  test(`PN-8A ${outcome} stays generic with no uncontrolled provisioning`, async () => {
    const env = environment(["auth"]), f = authorityFixtures(env); let created = 0, deleted = 0, sent = 0;
    const first = outcome === "cleanup";
    const result = await requestMobileNativeOtp({ env, request: request("auth/otp/request"),
      input: { method: "email", identifier: "synthetic@example.invalid", captchaToken: "synthetic-captcha-token-at-least-twenty-characters" },
      dependencies: { nativeAdmission: f.dependencies, minimumDurationMs: 0, consumeClientRateLimit: () => ({ allowed: true }),
        authorizeOptions: { rpc: async name => {
          if (name === "complete_production_participant_first_login") throw new Error("synthetic completion failure");
          if (name === "record_production_participant_first_login_cleanup") return { payload: { ok: true } };
          return { productionRuntime: { tournamentId: "2026", futureGeneration: false }, payload: first
            ? { provisioningRequired: true, claimId: actor.authUserId, playerId: actor.playerId, email: "synthetic@example.invalid" }
            : { allowed: outcome.endsWith("failure"), requestId: actor.authUserId, ...actor, email: "synthetic@example.invalid", verificationType: "email" } };
        }, adminClient: { auth: { admin: {
          createUser: async () => { created++; return { data: { user: { id: actor.authUserId } } }; },
          deleteUser: async () => { deleted++; return { error: null }; },
        } } } },
        readIdentityForRequest: async () => ({ payload: { ok: true, data: participant() } }), authClient: {},
        sendOtp: async () => { sent++; return { error: outcome === "provider-failure" ? new Error("synthetic provider failure") : null }; },
        recordDelivery: async () => { if (outcome === "audit-failure") throw new Error("synthetic audit failure"); },
      } });
    assert.equal(result.status, 202); assert.equal(result.body.data.verificationType, "email");
    assert.equal(created, first ? 1 : 0); assert.equal(deleted, first ? 1 : 0);
    assert.equal(sent, outcome.endsWith("failure") ? 1 : 0);
  });
}

test("PN-8A approved first-login request uses canonical signup delivery without requiring verified identity first", async () => {
  const env = environment(["auth"]), f = authorityFixtures(env);
  let sent = 0;
  const result = await requestMobileNativeOtp({ env, request: request("auth/otp/request"),
    input: { method: "email", identifier: "synthetic@example.invalid", captchaToken: "synthetic-captcha-token-at-least-twenty-characters" },
    dependencies: { nativeAdmission: f.dependencies, minimumDurationMs: 0, consumeClientRateLimit: () => ({ allowed: true }),
      authorizeEligibility: async () => ({ ok: true, authorization: { payload: {
        allowed: true, requestId: actor.authUserId, authUserId: actor.authUserId, playerId: actor.playerId,
        email: "synthetic@example.invalid", verificationType: "signup",
      } } }),
      readIdentityForRequest: async () => ({ payload: { ok: false, code: "ACTIVE_USER_PLAYER_LINK_REQUIRED" } }),
      authClient: {}, sendOtp: async (_, input) => { assert.equal(input.verificationType, "signup"); sent++; return { error: null }; },
      recordDelivery: async () => {},
    } });
  assert.equal(result.status, 202);
  assert.equal(result.body.data.verificationType, "email", "public response must not disclose enrollment mode");
  assert.equal(sent, 1);
});
