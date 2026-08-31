import assert from "node:assert/strict";
import test from "node:test";

import { MobileApiError } from "../lib/mobile-api-v1.js";
import {
  certifyMobileNativeOtp,
  mobileNativeCaptchaPage,
  readMobileNativeAuthJson,
  requestMobileNativeOtp,
} from "../lib/mobile-native-auth.js";
import { participantAuthEmailHash } from "../lib/participant-auth-rehearsal.js";
import { MOBILE_NATIVE_CERTIFICATION_SECONDS } from "../lib/mobile-native-certification.js";

const challengeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const authUserId = "11111111-1111-4111-8111-111111111111";
const wrongAuthUserId = "22222222-2222-4222-8222-222222222222";
const captchaToken = "turnstile-token-at-least-twenty-characters";
const previewWorkbookId = "1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts";
const previewSupabaseUrl = "https://idgigvjjqkfbqjeredpb.supabase.co";

const previewEnv = {
  VERCEL_ENV: "preview",
  GOOGLE_SHEETS_ID: previewWorkbookId,
  PREVIEW_SCORING_SHEET_ID: previewWorkbookId,
  PARTICIPANT_IDENTITY_AUTHORITY: "supabase",
  SUPABASE_SCORING_MIRROR_URL: previewSupabaseUrl,
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "sb_secret_server_only",
  SUPABASE_SCORING_MIRROR_ENABLED: "true",
  NEXT_PUBLIC_SUPABASE_AUTH_URL: previewSupabaseUrl,
  NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY: "sb_publishable_preview",
  HOME_READ_SOURCE: "supabase",
  TOURNAMENT_READ_SOURCE: "supabase",
  LEADERBOARDS_CORE_READ_SOURCE: "supabase",
  GUIDE_READ_SOURCE: "supabase",
  COURSE_PRESENTATION_READ_SOURCE: "supabase",
  SECONDARY_HISTORY_READ_SOURCE: "supabase",
  DRAFT_READ_SOURCE: "supabase",
  HISTORY_2026_READ_SOURCE: "supabase",
  COMPLETED_HISTORY_READ_SOURCE: "supabase",
  SCORING_READ_SOURCE: "supabase",
  MATCH_AUTHORIZATION_SOURCE: "supabase",
  SCORING_AUTHORITY: "supabase",
  PARTICIPANT_AUTH_RATE_LIMIT_SECRET: "preview-native-rate-limit-secret-at-least-32-chars",
  MOBILE_NATIVE_CERTIFICATION_SIGNING_SECRET: "preview-native-certification-secret-at-least-32-chars",
  MOBILE_NATIVE_SUPABASE_SIGNUPS_DISABLED: "true",
  MOBILE_NATIVE_EDGE_RATE_LIMIT_CONFIGURED: "true",
  MOBILE_NATIVE_AUTH_ANTI_ABUSE_MODE: "supabase-turnstile",
  PARTICIPANT_AUTH_CAPTCHA_REQUIRED: "true",
  PARTICIPANT_AUTH_CAPTCHA_CONFIGURED: "true",
  NEXT_PUBLIC_PARTICIPANT_AUTH_TURNSTILE_SITE_KEY: "preview-turnstile-site-key",
};

function request({ bearer = "", forwarded = "203.0.113.7", userAgent = "BaggerInvTests/1" } = {}) {
  const headers = new Headers({
    "x-forwarded-for": forwarded,
    "user-agent": userAgent,
  });
  if (bearer) headers.set("authorization", `Bearer ${bearer}`);
  return new Request("https://native-preview.example/api/mobile/v1/auth/otp/request", { headers });
}

const noDelay = {
  consumeClientRateLimit: () => ({ allowed: true }),
  minimumDurationMs: 0,
  now: () => 100,
  delay: async () => assert.fail("no delay expected"),
};

test("native request applies a hashed client limiter before eligibility or database work", async () => {
  let authorized = false;
  const result = await requestMobileNativeOtp({
    request: request(),
    input: { method: "email", identifier: "approved@example.com", captchaToken },
    env: previewEnv,
    dependencies: {
      ...noDelay,
      consumeClientRateLimit: (key, options) => {
        assert.match(key, /^mobile-native-otp:[0-9a-f]{64}$/);
        assert.deepEqual(options, { limit: 5, windowMs: 900_000 });
        return { allowed: false };
      },
      authorizeEligibility: async () => { authorized = true; },
    },
  });
  assert.equal(result.status, 202);
  assert.equal(result.body.data.accepted, true);
  assert.match(result.body.data.challengeId, /^[0-9a-f-]{36}$/);
  assert.equal(authorized, false);
});

function activeContext(overrides = {}) {
  return {
    authUserId,
    playerId: "CB01",
    tournament: { id: "2026" },
    membership: { active: true },
    ...overrides,
  };
}

test("approved native email request reuses eligibility, sends existing-user OTP, and returns only an opaque challenge", async () => {
  const calls = [];
  const authClient = { auth: { signInWithOtp: async (input) => {
    calls.push(["provider", input]);
    return { data: {}, error: null };
  } } };
  const result = await requestMobileNativeOtp({
    request: request(),
    input: { method: "email", identifier: " Approved@Example.com ", captchaToken },
    env: previewEnv,
    dependencies: {
      ...noDelay,
      authClient,
      authorizeEligibility: async (input) => {
        calls.push(["authorize", input]);
        assert.equal(input.email, "approved@example.com");
        assert.match(input.client_request_hash, /^[0-9a-f]{64}$/);
        return { ok: true, authorization: { payload: {
          ok: true,
          allowed: true,
          requestId: challengeId,
          email: "approved@example.com",
          authUserId,
          playerId: "CB01",
        } } };
      },
      readIdentityForRequest: async ({ authUserId: received }) => {
        assert.equal(received, authUserId);
        return { payload: { ok: true, data: activeContext() } };
      },
      recordDelivery: async (input) => calls.push(["delivery", input]),
    },
  });

  assert.equal(result.status, 202);
  assert.deepEqual(result.body, {
    ok: true,
    apiVersion: "v1",
    data: {
      accepted: true,
      method: "email",
      verificationType: "email",
      challengeId,
      expiresInSeconds: 900,
      resendAfterSeconds: 60,
      message: "If that email is approved for The Bagger, a sign-in code will be sent.",
    },
  });
  assert.deepEqual(calls[1], ["provider", {
    email: "approved@example.com",
    options: { shouldCreateUser: false, captchaToken },
  }]);
  assert.equal(calls[2][0], "delivery");
  assert.equal(calls[2][1].succeeded, true);
  const serialized = JSON.stringify(result.body);
  for (const privateValue of [authUserId, "CB01", previewSupabaseUrl, previewEnv.SUPABASE_SCORING_MIRROR_SECRET_KEY]) {
    assert.equal(serialized.includes(privateValue), false);
  }
});

test("an authorization decision is rechecked against current canonical membership before OTP delivery", async () => {
  for (const identityPayload of [
    { ok: false, code: "ACTIVE_USER_PLAYER_LINK_REQUIRED" },
    { ok: true, data: activeContext({ membership: { active: false } }) },
    { ok: true, data: activeContext({ playerId: "OTHER" }) },
  ]) {
    let providerCalls = 0;
    const deliveries = [];
    const result = await requestMobileNativeOtp({
      request: request(),
      input: { method: "email", identifier: "approved@example.com", captchaToken },
      env: previewEnv,
      dependencies: {
        ...noDelay,
        authorizeEligibility: async () => ({ ok: true, authorization: { payload: {
          ok: true,
          allowed: true,
          requestId: challengeId,
          email: "approved@example.com",
          authUserId,
          playerId: "CB01",
        } } }),
        readIdentityForRequest: async () => ({ payload: identityPayload }),
        sendOtp: async () => { providerCalls += 1; return { error: null }; },
        recordDelivery: async (input) => deliveries.push(input),
      },
    });
    assert.equal(result.status, 202);
    assert.equal(providerCalls, 0);
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].succeeded, false);
    assert.equal(deliveries[0].safe_reason, "IDENTITY_NOT_ELIGIBLE");
  }
});

test("native delivery audit preserves safe CAPTCHA and provider failure classification", async () => {
  const deliveries = [];
  await requestMobileNativeOtp({
    request: request(),
    input: { method: "email", identifier: "approved@example.com", captchaToken },
    env: previewEnv,
    dependencies: {
      ...noDelay,
      authorizeEligibility: async () => ({ ok: true, authorization: { payload: {
        ok: true,
        allowed: true,
        requestId: challengeId,
        email: "approved@example.com",
        authUserId,
        playerId: "CB01",
      } } }),
      readIdentityForRequest: async () => ({ payload: { ok: true, data: activeContext() } }),
      sendOtp: async () => ({ error: { code: "captcha_failed", message: "Captcha verification failed", status: 400 } }),
      recordDelivery: async (input) => deliveries.push(input),
    },
  });
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].succeeded, false);
  assert.equal(deliveries[0].safe_reason, "AUTH_CAPTCHA_REJECTED");
});

test("unapproved, malformed, cooldown, and rate-limited identifiers stay enumeration-safe and never reach Auth", async () => {
  for (const reason of ["NOT_ELIGIBLE", "COOLDOWN", "RATE_LIMIT"]) {
    let providerCalls = 0;
    const result = await requestMobileNativeOtp({
      request: request(),
      input: { method: "email", identifier: reason === "NOT_ELIGIBLE" ? "not-an-email" : "unknown@example.com", captchaToken },
      env: previewEnv,
      dependencies: {
        ...noDelay,
        authorizeEligibility: async () => ({ ok: true, authorization: { payload: {
          ok: true,
          allowed: false,
          requestId: challengeId,
          safeReason: reason,
        } } }),
        sendOtp: async () => { providerCalls += 1; return { error: null }; },
      },
    });
    assert.equal(result.status, 202);
    assert.equal(result.body.data.accepted, true);
    assert.equal(result.body.data.challengeId, challengeId);
    assert.equal(result.body.data.message, "If that email is approved for The Bagger, a sign-in code will be sent.");
    assert.equal(providerCalls, 0);
    assert.equal(JSON.stringify(result.body).includes(reason), false);
  }
});

test("request cannot select Player/Auth/tournament identity and phone remains a reserved method without creating an account", async () => {
  for (const forbidden of ["playerId", "authUserId", "expectedAuthUserId", "tournamentId"]) {
    await assert.rejects(
      () => requestMobileNativeOtp({
        request: request(),
        input: { method: "email", identifier: "approved@example.com", captchaToken, [forbidden]: "attacker" },
        env: previewEnv,
        dependencies: noDelay,
      }),
      (error) => error instanceof MobileApiError && error.code === "INVALID_AUTH_REQUEST",
    );
  }
  let authorized = false;
  await assert.rejects(
    () => requestMobileNativeOtp({
      request: request(),
      input: { method: "phone", identifier: "+12025550123" },
      env: previewEnv,
      dependencies: { ...noDelay, authorizeEligibility: async () => { authorized = true; } },
    }),
    (error) => error instanceof MobileApiError && error.code === "AUTH_METHOD_UNAVAILABLE",
  );
  assert.equal(authorized, false);
});

test("native anti-abuse exception is explicit and cannot activate when the isolated-development gate is absent", async () => {
  for (const env of [
    { ...previewEnv, MOBILE_NATIVE_AUTH_ANTI_ABUSE_MODE: "" },
    { ...previewEnv, VERCEL_ENV: "production" },
    { ...previewEnv, PRODUCTION_SHADOW_CANDIDATE_ENABLED: "true" },
  ]) {
    await assert.rejects(
      () => requestMobileNativeOtp({
        request: request(),
        input: { method: "email", identifier: "approved@example.com", captchaToken },
        env,
        dependencies: noDelay,
      }),
      (error) => error instanceof MobileApiError && error.code === "MOBILE_API_UNAVAILABLE",
    );
  }
});

test("native email request requires a bounded Turnstile token before eligibility or provider work", async () => {
  let authorized = false;
  for (const missingOrInvalid of [undefined, "", "too-short", `bad token ${"x".repeat(30)}`]) {
    await assert.rejects(
      () => requestMobileNativeOtp({
        request: request(),
        input: { method: "email", identifier: "approved@example.com", captchaToken: missingOrInvalid },
        env: previewEnv,
        dependencies: { ...noDelay, authorizeEligibility: async () => { authorized = true; } },
      }),
      (error) => error instanceof MobileApiError && error.code === "INVALID_AUTH_REQUEST",
    );
  }
  assert.equal(authorized, false);
});

test("native Turnstile page is isolated, no-store, CSP-restricted, and returns tokens only through the WKWebView bridge", () => {
  const result = mobileNativeCaptchaPage(previewEnv);
  assert.equal(result.status, 200);
  assert.equal(result.headers["Cache-Control"], "private, no-store");
  assert.match(result.headers["Content-Security-Policy"], /default-src 'none'/);
  assert.match(result.headers["Content-Security-Policy"], /https:\/\/challenges\.cloudflare\.com/);
  assert.equal(result.headers["Referrer-Policy"], "no-referrer");
  assert.match(result.body, /challenges\.cloudflare\.com\/turnstile\/v0\/api\.js/);
  assert.match(result.body, /messageHandlers\.baggerTurnstile/);
  assert.match(result.body, /mobile_native_otp/);
  assert.match(result.body, new RegExp(previewEnv.NEXT_PUBLIC_PARTICIPANT_AUTH_TURNSTILE_SITE_KEY));
  assert.doesNotMatch(result.body, /SUPABASE_SCORING_MIRROR_SECRET_KEY|service_role|access[_-]?token|Bearer/i);
});

test("native auth route JSON is content-type checked and bounded before parsing", async () => {
  assert.deepEqual(await readMobileNativeAuthJson(new Request("https://native-preview.example/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ challengeId }),
  })), { challengeId });
  for (const candidate of [
    new Request("https://native-preview.example/auth", { method: "POST", body: "{}" }),
    new Request("https://native-preview.example/auth", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{",
    }),
    new Request("https://native-preview.example/auth", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: "x".repeat(9_000) }),
    }),
  ]) {
    await assert.rejects(
      () => readMobileNativeAuthJson(candidate),
      (error) => error instanceof MobileApiError && error.code === "INVALID_AUTH_REQUEST",
    );
  }

  const chunkedOversize = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(`{"value":"${"x".repeat(5_000)}`));
      controller.enqueue(new TextEncoder().encode(`${"y".repeat(5_000)}"}`));
      controller.close();
    },
  });
  const chunkedRequest = new Request("https://native-preview.example/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: chunkedOversize,
    duplex: "half",
  });
  assert.equal(chunkedRequest.headers.has("content-length"), false);
  await assert.rejects(
    () => readMobileNativeAuthJson(chunkedRequest),
    (error) => error instanceof MobileApiError && error.code === "INVALID_AUTH_REQUEST",
  );
});

test("native certification rate-limits the verified Auth user and hashed client before challenge RPCs", async () => {
  let authorized = false;
  await assert.rejects(
    () => certifyMobileNativeOtp({
      request: request({ bearer: "native-access-token" }),
      input: { challengeId },
      env: previewEnv,
      dependencies: {
        verifyUser: async () => ({
          status: "active",
          authUserId,
          email: "approved@example.com",
          emailVerified: true,
        }),
        consumeCertificationRateLimit: (key, options) => {
          assert.match(key, /^mobile-native-certify:[0-9a-f]{64}$/);
          assert.deepEqual(options, { limit: 8, windowMs: 900_000 });
          return { allowed: false };
        },
        authorizeVerification: async () => { authorized = true; },
      },
    }),
    (error) => error instanceof MobileApiError && error.code === "AUTH_CERTIFICATION_FAILED",
  );
  assert.equal(authorized, false);
});

test("matching Bearer user and opaque challenge certify exact canonical identity without returning it", async () => {
  const events = [];
  const result = await certifyMobileNativeOtp({
    request: request({ bearer: "native-access-token" }),
    input: { challengeId },
    env: previewEnv,
    dependencies: {
      now: () => 100,
      verifyUser: async (token) => {
        assert.equal(token, "native-access-token");
        return { status: "active", authUserId, email: "approved@example.com", emailVerified: true };
      },
      authorizeVerification: async (input) => {
        events.push(["authorize", input]);
        assert.deepEqual(input, {
          request_id: challengeId,
          email_identity_hash: participantAuthEmailHash("approved@example.com"),
        });
        return { payload: { ok: true, allowed: true, authUserId, playerId: "CB01", tournamentId: "2026" } };
      },
      readIdentity: async (lookup) => {
        events.push(["identity", lookup]);
        return { payload: { ok: true, data: activeContext() } };
      },
      recordVerification: async (input) => {
        events.push(["record", input]);
        return { payload: { ok: true, status: "VERIFIED" } };
      },
      issueCertification: (input) => {
        events.push(["issue", input]);
        assert.equal(input.authUserId, authUserId);
        assert.equal(input.playerId, "CB01");
        assert.equal(input.tournamentId, "2026");
        return { token: "opaque-bagger-certification", expiresInSeconds: MOBILE_NATIVE_CERTIFICATION_SECONDS };
      },
    },
  });
  assert.deepEqual(result, {
    status: 200,
    body: {
      ok: true,
      apiVersion: "v1",
      data: {
        certified: true,
        certificationToken: "opaque-bagger-certification",
        expiresInSeconds: MOBILE_NATIVE_CERTIFICATION_SECONDS,
      },
    },
  });
  assert.deepEqual(events.map(([name]) => name), ["authorize", "identity", "record", "identity", "issue"]);
  const serialized = JSON.stringify(result.body);
  for (const excluded of [authUserId, "CB01", "2026", "approved@example.com", "native-access-token"]) {
    assert.equal(serialized.includes(excluded), false);
  }
});

test("wrong Auth UUID fails, consumes the pending attempt as a failure, and never resolves a Player", async () => {
  const records = [];
  let identityReads = 0;
  await assert.rejects(
    () => certifyMobileNativeOtp({
      request: request({ bearer: "wrong-user-token" }),
      input: { challengeId },
      env: previewEnv,
      dependencies: {
        now: () => 100,
        verifyUser: async () => ({ status: "active", authUserId: wrongAuthUserId, email: "wrong@example.com", emailVerified: true }),
        authorizeVerification: async () => ({ payload: { ok: true, allowed: true, authUserId, playerId: "CB01", tournamentId: "2026" } }),
        recordVerification: async (input) => records.push(input),
        readIdentity: async () => { identityReads += 1; },
      },
    }),
    (error) => error instanceof MobileApiError && error.code === "AUTH_CERTIFICATION_FAILED",
  );
  assert.equal(records.length, 1);
  assert.equal(records[0].auth_user_id, wrongAuthUserId);
  assert.equal(records[0].succeeded, false);
  assert.equal(identityReads, 0);
});

test("unmapped or inactive Auth user fails before certification and consumes the challenge", async () => {
  for (const payload of [
    { ok: false, code: "ACTIVE_USER_PLAYER_LINK_REQUIRED" },
    { ok: true, data: activeContext({ membership: { active: false } }) },
    { ok: true, data: activeContext({ playerId: "OTHER" }) },
  ]) {
    const records = [];
    await assert.rejects(
      () => certifyMobileNativeOtp({
        request: request({ bearer: "native-access-token" }),
        input: { challengeId },
        env: previewEnv,
        dependencies: {
          now: () => 100,
          verifyUser: async () => ({ status: "active", authUserId, email: "approved@example.com", emailVerified: true }),
          authorizeVerification: async () => ({ payload: { ok: true, allowed: true, authUserId, playerId: "CB01", tournamentId: "2026" } }),
          readIdentity: async () => ({ payload }),
          recordVerification: async (input) => records.push(input),
        },
      }),
      (error) => error instanceof MobileApiError && error.code === "AUTH_CERTIFICATION_FAILED",
    );
    assert.equal(records.length, 1);
    assert.equal(records[0].succeeded, false);
  }
});

test("expired, reused, and invalid challenges share one safe failure", async () => {
  for (const state of ["EXPIRED", "REUSED"]) {
    const records = [];
    await assert.rejects(
      () => certifyMobileNativeOtp({
        request: request({ bearer: "native-access-token" }),
        input: { challengeId },
        env: previewEnv,
        dependencies: {
          now: () => 100,
          verifyUser: async () => ({ status: "active", authUserId, email: "approved@example.com", emailVerified: true }),
          authorizeVerification: async () => ({ payload: { ok: true, allowed: false, status: state } }),
          recordVerification: async (input) => records.push(input),
        },
      }),
      (error) => error instanceof MobileApiError && error.code === "AUTH_CERTIFICATION_FAILED",
    );
    assert.equal(records.length, 1);
    assert.equal(records[0].succeeded, false);
  }
  await assert.rejects(
    () => certifyMobileNativeOtp({
      request: request({ bearer: "native-access-token" }),
      input: { challengeId: "not-a-challenge" },
      env: previewEnv,
    }),
    (error) => error instanceof MobileApiError && error.code === "AUTH_CERTIFICATION_FAILED",
  );
});

test("certification body cannot spoof Player, Auth user, tournament, email, or phone identity", async () => {
  for (const forbidden of ["playerId", "authUserId", "expectedAuthUserId", "tournamentId", "email", "phone"]) {
    await assert.rejects(
      () => certifyMobileNativeOtp({
        request: request({ bearer: "native-access-token" }),
        input: { challengeId, [forbidden]: "attacker" },
        env: previewEnv,
      }),
      (error) => error instanceof MobileApiError && error.code === "INVALID_AUTH_REQUEST",
    );
  }
});

test("unverified or malformed authenticated user claims are not eligible for Bagger certification", async () => {
  for (const verification of [
    { status: "invalid", authUserId: null, email: "", emailVerified: false },
    { status: "active", authUserId, email: "approved@example.com", emailVerified: false },
    { status: "active", authUserId, email: "not-an-email", emailVerified: true },
  ]) {
    await assert.rejects(
      () => certifyMobileNativeOtp({
        request: request({ bearer: "native-access-token" }),
        input: { challengeId },
        env: previewEnv,
        dependencies: { verifyUser: async () => verification },
      }),
      (error) => error instanceof MobileApiError && error.code === "INVALID_TOKEN",
    );
  }
});
