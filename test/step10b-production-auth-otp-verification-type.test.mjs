import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  requestParticipantEmailOtp,
  resolveParticipantEmailOtpVerificationType,
} from "../lib/participant-email-otp-mode.js";
import { authorizeParticipantEmailOtpEligibility } from "../lib/participant-email-otp-authorization.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("PREPARED signup confirmation uses resend and propagates the exact CAPTCHA token", async () => {
  const calls = [];
  const client = { auth: {
    resend: async (input) => { calls.push(["resend", input]); return { error: null }; },
    signInWithOtp: async (input) => { calls.push(["signInWithOtp", input]); return { error: null }; },
  } };
  await requestParticipantEmailOtp(client, {
    email: "director@baggerinv.com",
    captchaToken: "turnstile-token",
    verificationType: "signup",
  });
  assert.deepEqual(calls, [["resend", {
    type: "signup",
    email: "director@baggerinv.com",
    options: { captchaToken: "turnstile-token" },
  }]]);
});

test("VERIFIED email sign-in remains no-signup and propagates the exact CAPTCHA token", async () => {
  const calls = [];
  const client = { auth: {
    resend: async (input) => { calls.push(["resend", input]); return { error: null }; },
    signInWithOtp: async (input) => { calls.push(["signInWithOtp", input]); return { error: null }; },
  } };
  await requestParticipantEmailOtp(client, {
    email: "director@baggerinv.com",
    captchaToken: "turnstile-token",
    verificationType: "email",
  });
  assert.deepEqual(calls, [["signInWithOtp", {
    email: "director@baggerinv.com",
    options: { shouldCreateUser: false, captchaToken: "turnstile-token" },
  }]]);
});

test("missing Production verification type fails before any provider request", async () => {
  let providerCalls = 0;
  const client = { auth: {
    resend: async () => { providerCalls += 1; return { error: null }; },
    signInWithOtp: async () => { providerCalls += 1; return { error: null }; },
  } };
  await assert.rejects(
    () => requestParticipantEmailOtp(client, {
      email: "director@baggerinv.com",
      captchaToken: "turnstile-token",
      verificationType: "",
    }),
    (error) => error.code === "PARTICIPANT_EMAIL_OTP_VERIFICATION_TYPE_CONFIGURATION_REQUIRED",
  );
  assert.equal(providerCalls, 0);
  assert.equal(resolveParticipantEmailOtpVerificationType("", { required: false }), "email");
});

test("unknown identifiers remain generic and cannot reach either provider operation", async () => {
  let providerCalls = 0;
  const authorization = await authorizeParticipantEmailOtpEligibility({ email: "unknown@example.com" }, {
    authorize: async () => ({ payload: {
      ok: true,
      allowed: false,
      requestId: "00000000-0000-4000-8000-000000000000",
      verificationType: null,
    } }),
  });
  if (authorization.ok && authorization.authorization?.payload?.allowed === true) providerCalls += 1;
  assert.equal(authorization.authorization.payload.allowed, false);
  assert.equal(providerCalls, 0);
});

test("Production migration persists and binds signup/email mode privately", async () => {
  const sql = await source("supabase/production_migrations/202608240015_production_auth_otp_verification_type.sql");
  assert.match(sql, /add column verification_type text/);
  assert.match(sql, /set verification_type = 'email'[\s\S]*where verification_type is null/);
  assert.match(sql, /verification_type in \('signup', 'email'\)/);
  assert.match(sql, /candidate\.status[\s\S]*when 'PREPARED' then 'signup'[\s\S]*when 'VERIFIED' then 'email'/);
  assert.match(sql, /c\.status = 'PREPARED' and auth_user\.email_confirmed_at is null/);
  assert.match(sql, /c\.status = 'VERIFIED' and auth_user\.email_confirmed_at is not null/);
  assert.match(sql, /status, safe_reason, verification_type/);
  assert.match(sql, /'verificationType', case when allowed then selected_verification_type else null end/);
  assert.match(sql, /candidate\.status = 'PREPARED' and otp\.verification_type = 'signup'/);
  assert.match(sql, /candidate\.status = 'VERIFIED' and otp\.verification_type = 'email'/);
  assert.match(sql, /'verificationType', attempt\.verification_type/);
  assert.match(sql, /revoke all on table participant_identity\.participant_auth_otp_attempts[\s\S]*from public, anon, authenticated, service_role/);
  for (const fn of [
    "authorize_production_auth_candidate_otp_request",
    "authorize_production_auth_candidate_otp_verification",
  ]) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn}\\(jsonb\\)[\\s\\S]*?from public, anon, authenticated, service_role`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn}\\(jsonb\\)[\\s\\S]*?to service_role`));
  }
  assert.doesNotMatch(sql, /grant execute[\s\S]+to (?:anon|authenticated)/i);
  assert.doesNotMatch(sql, /email_confirm\s*[:=]|update\s+auth\.users|createUser|enable_signup/i);
});

test("request and verify routes bind provider mode to server-side authorization payload", async () => {
  const [request, verify] = await Promise.all([
    source("app/api/participant/auth/otp/request/route.js"),
    source("app/api/participant/auth/otp/verify/route.js"),
  ]);
  assert.match(request, /resolveParticipantEmailOtpVerificationType\(decision\.verificationType/);
  assert.match(request, /required: authority\.productionShadowCandidate/);
  assert.match(request, /requestParticipantEmailOtp\(client, \{[\s\S]*captchaToken[\s\S]*verificationType/);
  assert.match(verify, /resolveParticipantEmailOtpVerificationType\(allowed\.payload\.verificationType/);
  assert.match(verify, /verifyOtp\(\{ email, token, type: verificationType \}\)/);
  assert.doesNotMatch(verify, /input\.verificationType|type:\s*["']email["']/);
});

test("approved provider failures and unknown identifiers share the same public completion path", async () => {
  const request = await source("app/api/participant/auth/otp/request/route.js");
  assert.match(request, /if \(decision\.allowed !== true\) return enumerationSafeRequestResponse\(publicRequestStartedAt, decision\.requestId\)/);
  assert.match(request, /if \(error\) \{[\s\S]*Participant email delivery unavailable[\s\S]*\}[\s\S]*return enumerationSafeRequestResponse\(publicRequestStartedAt, decision\.requestId\)/);
  assert.doesNotMatch(request, /authFailure\.responseStatus/);
  assert.doesNotMatch(request, /authFailure\.responseCategory/);
});

test("approved-only configuration, client, and audit exceptions cannot escape the normalized response", async () => {
  const request = await source("app/api/participant/auth/otp/request/route.js");
  const pipelineStart = request.indexOf("let pipelineError = null");
  const normalizedReturn = request.lastIndexOf("return enumerationSafeRequestResponse(publicRequestStartedAt, decision.requestId)");
  assert.ok(pipelineStart >= 0 && normalizedReturn > pipelineStart);
  const pipeline = request.slice(pipelineStart, normalizedReturn);
  for (const operation of [
    "participantAuthServerConfiguration()",
    "createClient(config.url, config.publishableKey",
    "requestParticipantEmailOtp(client",
    "recordSingleParticipantOtpDelivery",
  ]) assert.match(pipeline, new RegExp(operation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(pipeline, /catch \(error\) \{[\s\S]*pipelineError = error/);
  assert.doesNotMatch(pipeline, /throw pipelineError|return json\(/);
});
