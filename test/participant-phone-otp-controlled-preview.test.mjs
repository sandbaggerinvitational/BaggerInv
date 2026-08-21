import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assertParticipantPhoneEnrollmentAuthUser,
  canonicalParticipantAuthPhone,
  inspectParticipantAuthUserPhone,
  normalizeParticipantPhoneOtpToken,
  participantPhoneOtpClientFingerprint,
  participantPhoneOtpProviderFailureCode,
  requestExistingParticipantPhoneEnrollment,
  requestExistingParticipantPhoneLogin,
  verifyExistingParticipantPhoneEnrollment,
  verifyExistingParticipantPhoneLogin,
} from "../lib/participant-phone-otp.js";
import { resolveSupabaseParticipantIdentity } from "../lib/participant-identity-resolver.js";
import {
  participantSmsAuthFeatureConfigured,
  participantSmsProviderTestConfigured,
} from "../lib/participant-sms-auth-feature.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const migrationPath = "supabase/migrations/202608210004_preview_phone_same_user_enrollment.sql";
const repairPath = "supabase/preview_repairs/20260821_step_8b_2a_remove_failed_admin_phone_attachment.sql";
const authId = "11111111-1111-4111-8111-111111111111";
const authB = "22222222-2222-4222-8222-222222222222";
const phone = "+12025550123";

function authClientFor({ updateUserId = authId, verifyUserId = authId } = {}) {
  const calls = [];
  return {
    calls,
    client: { auth: {
      async updateUser(input) {
        calls.push(["updateUser", input]);
        return { data: { user: { id: updateUserId } }, error: null };
      },
      async resend(input) {
        calls.push(["resend", input]);
        return { data: {}, error: null };
      },
      async signInWithOtp(input) {
        calls.push(["signInWithOtp", input]);
        return { data: {}, error: null };
      },
      async verifyOtp(input) {
        calls.push(["verifyOtp", input]);
        return { data: { user: { id: verifyUserId }, session: { access_token: "not-inspected" } }, error: null };
      },
    } },
  };
}

test("provider-test and public SMS flags remain separate and Preview-only", () => {
  assert.equal(participantSmsProviderTestConfigured({}), false);
  assert.equal(participantSmsProviderTestConfigured({ VERCEL_ENV: "production", PARTICIPANT_SMS_PROVIDER_TEST_ENABLED: "true" }), false);
  assert.equal(participantSmsProviderTestConfigured({ VERCEL_ENV: "preview", PARTICIPANT_SMS_PROVIDER_TEST_ENABLED: "true", PARTICIPANT_SMS_AUTH_ENABLED: "false" }), true);
  assert.equal(participantSmsAuthFeatureConfigured({ VERCEL_ENV: "preview", PARTICIPANT_SMS_AUTH_ENABLED: "false" }), false);
});

test("client rate-limit fingerprint is keyed and contains no raw request values", () => {
  const request = { headers: { get: (name) => name === "x-forwarded-for" ? "203.0.113.9, 10.0.0.1" : "Mobile Safari" } };
  const fingerprint = participantPhoneOtpClientFingerprint(request, "x".repeat(32));
  assert.match(fingerprint, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(fingerprint, /203|Safari/);
});

test("Auth phone comparison accepts hosted normalization without weakening collision checks", () => {
  assert.equal(canonicalParticipantAuthPhone(phone), "12025550123");
  assert.equal(canonicalParticipantAuthPhone("12025550123"), "12025550123");
  assert.deepEqual(inspectParticipantAuthUserPhone({ phone: "12025550123", phone_change: "" }, phone), {
    phoneState: "EXPECTED", phoneChangeState: "EMPTY", phoneConfirmed: false,
  });
  assert.equal(inspectParticipantAuthUserPhone({ phone: "12025550124" }, phone).phoneState, "CONFLICT");
});

test("same-user enrollment begins with authenticated updateUser and never signInWithOtp", async () => {
  const mock = authClientFor();
  const result = await requestExistingParticipantPhoneEnrollment({
    authClient: mock.client, expectedAuthUserId: authId, targetPhone: phone,
  });
  assert.equal(result.sameAuthUser, true);
  assert.equal(result.userId, authId);
  assert.deepEqual(mock.calls, [["updateUser", { phone }]]);
});

test("pending phone_change resend uses the documented phone_change resend flow", async () => {
  const mock = authClientFor();
  const result = await requestExistingParticipantPhoneEnrollment({
    authClient: mock.client, expectedAuthUserId: authId, targetPhone: phone, resend: true,
  });
  assert.equal(result.method, "RESEND_PHONE_CHANGE");
  assert.deepEqual(mock.calls, [["resend", { type: "phone_change", phone }]]);
});

test("phone enrollment verifies phone_change and preserves Auth UUID A", async () => {
  const mock = authClientFor();
  const verified = await verifyExistingParticipantPhoneEnrollment({
    authClient: mock.client, phone, token: "123456", expectedAuthUserId: authId,
  });
  assert.equal(verified.ok, true);
  assert.equal(verified.userId, authId);
  assert.deepEqual(mock.calls, [["verifyOtp", { phone, token: "123456", type: "phone_change" }]]);
});

test("unexpected Auth UUID B is rejected by both enrollment and login gates", async () => {
  const enrollment = authClientFor({ verifyUserId: authB });
  const enrolled = await verifyExistingParticipantPhoneEnrollment({
    authClient: enrollment.client, phone, token: "123456", expectedAuthUserId: authId,
  });
  assert.equal(enrolled.ok, false);
  assert.equal(enrolled.sessionCreated, true);
  const login = authClientFor({ verifyUserId: authB });
  const signedIn = await verifyExistingParticipantPhoneLogin({
    authClient: login.client, phone, token: "123456", expectedAuthUserId: authId,
  });
  assert.equal(signedIn.ok, false);
});

test("subsequent phone login is a separate shouldCreateUser:false sms flow resolving to A", async () => {
  const mock = authClientFor();
  const request = await requestExistingParticipantPhoneLogin({ authClient: mock.client, phone });
  const verify = await verifyExistingParticipantPhoneLogin({
    authClient: mock.client, phone, token: "123456", expectedAuthUserId: authId,
  });
  assert.equal(request.method, "SIGNED_OUT_PHONE_LOGIN");
  assert.equal(verify.ok, true);
  assert.deepEqual(mock.calls, [
    ["signInWithOtp", { phone, options: { shouldCreateUser: false, channel: "sms" } }],
    ["verifyOtp", { phone, token: "123456", type: "sms" }],
  ]);
});

test("Auth state phases require empty phone, staged phone_change, then confirmed phone on A", () => {
  const base = { id: authId, email: "golfer@example.net" };
  assert.doesNotThrow(() => assertParticipantPhoneEnrollmentAuthUser(
    { ...base, phone: "", phone_change: "", phone_confirmed_at: null },
    { expectedAuthUserId: authId, expectedEmail: base.email, targetPhone: phone, phase: "before" },
  ));
  assert.doesNotThrow(() => assertParticipantPhoneEnrollmentAuthUser(
    { ...base, phone: "", phone_change: "12025550123", phone_confirmed_at: null },
    { expectedAuthUserId: authId, expectedEmail: base.email, targetPhone: phone, phase: "pending" },
  ));
  assert.doesNotThrow(() => assertParticipantPhoneEnrollmentAuthUser(
    { ...base, phone: "12025550123", phone_change: "", phone_confirmed_at: "confirmed" },
    { expectedAuthUserId: authId, expectedEmail: base.email, targetPhone: phone, phase: "verified" },
  ));
  assert.throws(() => assertParticipantPhoneEnrollmentAuthUser(
    { ...base, phone: "", phone_change: "12025550124", phone_confirmed_at: null },
    { expectedAuthUserId: authId, expectedEmail: base.email, targetPhone: phone, phase: "pending" },
  ), /did not match/i);
});

test("OTP input and provider errors stay in bounded safe categories", () => {
  assert.equal(normalizeParticipantPhoneOtpToken("123 456"), "123456");
  for (const token of ["", "12345", "1234567", "12a456"]) assert.throws(() => normalizeParticipantPhoneOtpToken(token));
  assert.equal(participantPhoneOtpProviderFailureCode({ status: 429 }, "send"), "PHONE_OTP_RATE_LIMITED");
  assert.equal(participantPhoneOtpProviderFailureCode({ status: 400 }, "verify"), "PHONE_OTP_INVALID_OR_EXPIRED");
});

test("migration binds enrollment to actor A, active link, email, phone revision, and phone_change", async () => {
  const migration = await source(migrationPath);
  assert.match(migration, /auth_user_id = actor_auth_user/);
  assert.match(migration, /requested_by_auth_user_id = actor_auth_user/);
  assert.match(migration, /user_player_links/);
  assert.match(migration, /identifier\.revision <> attempt\.identifier_revision/);
  assert.match(migration, /auth_user\.phone_change/);
  assert.match(migration, /canonical_auth_phone/);
  assert.match(migration, /returned_auth_user <> attempt\.auth_user_id/);
  assert.match(migration, /auth_user\.phone_confirmed_at is null/);
  assert.match(migration, /verification_source = 'SUPABASE_AUTH_TWILIO_VERIFY'/);
});

test("migration never creates users, relinks Players, or accepts B", async () => {
  const migration = await source(migrationPath);
  assert.doesNotMatch(migration, /insert\s+into\s+auth\.users|delete\s+from\s+auth\.users/i);
  assert.doesNotMatch(migration, /insert\s+into\s+participant_identity\.user_player_links/i);
  assert.doesNotMatch(migration, /update\s+participant_identity\.user_player_links/i);
  assert.match(migration, /status = 'UUID_MISMATCH'/);
  assert.match(migration, /status = 'ELIGIBLE'/);
});

test("same-user enrollment RPCs remain service-role only and store no OTP", async () => {
  const migration = await source(migrationPath);
  for (const name of ["begin_participant_phone_enrollment", "record_participant_phone_enrollment_send",
    "authorize_participant_phone_enrollment_verification", "record_participant_phone_enrollment_failure",
    "complete_participant_phone_enrollment"]) {
    assert.match(migration, new RegExp(`public\\.${name}`));
  }
  assert.match(migration, /revoke all on function %s from public, anon, authenticated/);
  assert.match(migration, /grant execute on function %s to service_role/);
  assert.doesNotMatch(migration, /otp\s+(?:text|varchar)|token\s+(?:text|varchar)|verification_code/i);
});

test("Preview repair is one-attempt guarded, preserves A/email/link, and never deletes an Auth user", async () => {
  const repair = await source(repairPath);
  assert.match(repair, /status = 'SEND_FAILED'/);
  assert.match(repair, /safe_reason = 'PHONE_OTP_AUTH_MISMATCH'/);
  assert.match(repair, /not attempt\.provider_called/);
  assert.match(repair, /attempt\.expires_at <= now\(\)/);
  assert.match(repair, /created_at between failed_attempt\.requested_at/);
  assert.match(repair, /delete from auth\.identities/);
  assert.match(repair, /update auth\.users set phone = null/);
  assert.doesNotMatch(repair, /delete\s+from\s+auth\.users/i);
  assert.match(repair, /emailPreserved', true/);
  assert.match(repair, /playerLinkPreserved', true/);
});

test("Director cannot send enrollment SMS; participant email session owns Operation A", async () => {
  const [directorRoute, participantRoute, panel, participantUi] = await Promise.all([
    source("app/api/director/participant-identity/route.js"),
    source("app/api/participant/auth/phone-enrollment/route.js"),
    source("app/admin/director/ParticipantIdentityFoundationPanel.js"),
    source("app/participant-auth/ParticipantAuthRehearsal.js"),
  ]);
  assert.doesNotMatch(directorRoute, /send-test-phone-otp|verify-test-phone-otp|updateUser\(\{ phone/);
  assert.doesNotMatch(panel, /Send Test Verification Code|send-test-phone-otp/);
  assert.match(panel, /Email-session enrollment required/);
  assert.match(participantRoute, /verifyParticipantAuthClaims/);
  assert.match(participantRoute, /requestExistingParticipantPhoneEnrollment/);
  assert.match(participantRoute, /verifyExistingParticipantPhoneEnrollment/);
  assert.match(participantRoute, /signOut\(\{ scope: "local" \}\)/);
  assert.match(participantUi, /window\.confirm/);
  assert.match(participantUi, /Begin phone enrollment/);
  assert.match(participantUi, /Operation B is separate/);
  assert.doesNotMatch(participantUi, /useEffect\([\s\S]{0,300}phone-enrollment/);
});

test("email sign-in remains enabled while public phone login remains absent", async () => {
  const [emailRequest, participantUi] = await Promise.all([
    source("app/api/participant/auth/otp/request/route.js"),
    source("app/participant-auth/ParticipantAuthRehearsal.js"),
  ]);
  assert.match(emailRequest, /signInWithOtp\(\{ email/);
  assert.match(emailRequest, /shouldCreateUser: false/);
  assert.match(participantUi, /type="email"/);
  assert.doesNotMatch(participantUi, /signInWithOtp\(\{\s*phone|Text Me a Code/);
});

test("unlinked Auth UUID B receives no participant or scoring identity", async () => {
  const env = {
    VERCEL_ENV: "preview", GOOGLE_SHEETS_ID: "preview-workbook", PREVIEW_SCORING_SHEET_ID: "preview-workbook",
    PARTICIPANT_IDENTITY_AUTHORITY: "supabase", SCORING_AUTHORITY: "supabase",
    SUPABASE_SCORING_MIRROR_URL: "https://preview.supabase.co", SUPABASE_SCORING_MIRROR_SECRET_KEY: "sb_secret_preview",
    NEXT_PUBLIC_SUPABASE_AUTH_URL: "https://preview.supabase.co", NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY: "sb_publishable_preview",
  };
  await assert.rejects(() => resolveSupabaseParticipantIdentity({
    cookieStore: { getAll: () => [], get: () => undefined, set: () => {} },
    env,
    dependencies: {
      verifyClaims: async () => ({ status: "active", claims: { sub: authB } }),
      readForAuth: async () => ({ payload: { ok: false, code: "ACTIVE_USER_PLAYER_LINK_REQUIRED" } }),
    },
  }), (error) => error.code === "ACTIVE_USER_PLAYER_LINK_REQUIRED");
});

test("no Twilio SDK, credentials, or application-side Twilio send is introduced", async () => {
  const [pkg, env, route] = await Promise.all([
    source("package.json").then(JSON.parse), source(".env.example"),
    source("app/api/participant/auth/phone-enrollment/route.js"),
  ]);
  assert.equal(pkg.dependencies.twilio, undefined);
  assert.doesNotMatch(env, /TWILIO_(?:AUTH_TOKEN|ACCOUNT_SID|VERIFY_SERVICE_SID)/);
  assert.doesNotMatch(route, /from\s+["']twilio["']|twilio\.(?:verify|messages)/i);
});
