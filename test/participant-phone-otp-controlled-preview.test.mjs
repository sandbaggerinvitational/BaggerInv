import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assertParticipantPhoneEnrollmentAuthUser,
  canonicalParticipantAuthPhone,
  classifyParticipantPhoneOtpProviderFailure,
  createParticipantPhoneLoginProof,
  inspectParticipantAuthUserPhone,
  maskParticipantAuthPhone,
  normalizeParticipantPhoneEnrollmentStageB,
  normalizeParticipantPhoneOtpToken,
  participantPhoneOtpClientFingerprint,
  participantPhoneOtpErrorMessage,
  participantPhoneOtpProviderFailureCode,
  requestExistingParticipantPhoneEnrollment,
  requestExistingParticipantPhoneLogin,
  participantPhoneLoginProofCookie,
  verifyParticipantPhoneLoginProof,
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
const residualRepairPath = "supabase/preview_repairs/20260821_step_8b_2a_2_clear_residual_unconfirmed_phone.sql";
const compromisedRepairPath = "supabase/preview_repairs/20260821_step_8b_2a_4_cancel_compromised_phone_change.sql";
const pendingTransitionMigrationPath = "supabase/migrations/202608210008_preview_phone_enrollment_pending_transition.sql";
const latestCompromisedRepairPath = "supabase/preview_repairs/20260821_step_8b_2a_5_cancel_compromised_pending_transition.sql";
const controlledLoginMigrationPath = "supabase/migrations/202608210010_preview_controlled_phone_login_proof.sql";
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
        return { data: { user: { id: verifyUserId }, session: { access_token: "not-inspected", refresh_token: "not-inspected" } }, error: null };
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
  assert.equal(verify.sessionCreated, true);
  assert.equal(verify.refreshSessionAvailable, true);
  assert.deepEqual(mock.calls, [
    ["signInWithOtp", { phone, options: { shouldCreateUser: false, channel: "sms" } }],
    ["verifyOtp", { phone, token: "123456", type: "sms" }],
  ]);
});

test("controlled phone-login proof is signed, short-lived, HttpOnly, and tamper-evident", () => {
  const secret = "controlled-preview-phone-proof-secret-value";
  const now = Date.UTC(2026, 7, 21, 18, 0, 0);
  const proof = createParticipantPhoneLoginProof({
    proofId: "33333333-3333-4333-8333-333333333333",
    authUserId: authId,
    playerId: "CB01",
    tournamentId: "2026",
    identifierId: "44444444-4444-4444-8444-444444444444",
    identifierRevision: 2,
  }, secret, { now });
  const verified = verifyParticipantPhoneLoginProof(proof, secret, { now: now + 30_000 });
  assert.equal(verified.authUserId, authId);
  assert.equal(verified.playerId, "CB01");
  assert.equal(verified.expiresAt - verified.issuedAt, 600);
  assert.throws(() => verifyParticipantPhoneLoginProof(`${proof}x`, secret, { now }));
  assert.throws(() => verifyParticipantPhoneLoginProof(proof, secret, { now: now + 601_000 }));
  const cookie = participantPhoneLoginProofCookie(proof);
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.secure, true);
  assert.equal(cookie.sameSite, "strict");
});

test("Operation B route is signed-out, one-proof scoped, and never accepts a client phone or ownership id", async () => {
  const route = await source("app/api/participant/auth/phone-login-proof/route.js");
  assert.match(route, /participantSmsProviderTestConfigured/);
  assert.match(route, /action === "arm"/);
  assert.match(route, /signOut\(\{ scope: "local" \}\)/);
  assert.match(route, /requireSignedOut/);
  assert.match(route, /beginParticipantPhoneLogin/);
  assert.match(route, /phone: attempt\.phoneE164/);
  assert.match(route, /phone: allowed\.phoneE164/);
  assert.doesNotMatch(route, /input\.(?:phone|phoneE164|playerId|authUserId|tournamentId|identifierId)/);
  assert.doesNotMatch(route, /auth\.admin\.(?:createUser|updateUserById)/);
  assert.match(route, /readParticipantIdentityContextForAuth\(\{ authUserId: verified\.userId \}\)/);
  assert.match(route, /authClient\.auth\.getUser\(\)/);
});

test("controlled phone-login migration hard-gates VERIFIED A, one user, link, membership, collision, and Director denial", async () => {
  const migration = await source(controlledLoginMigrationPath);
  assert.match(migration, /select count\(\*\) from auth\.users\) <> 1/);
  assert.match(migration, /phone_identifier\.status <> 'VERIFIED'/);
  assert.match(migration, /SUPABASE_AUTH_TWILIO_VERIFY/);
  assert.match(migration, /phone_confirmed_at is null/);
  assert.match(migration, /auth_user\.phone_change/);
  assert.match(migration, /user_player_links/);
  assert.match(migration, /participation_status = 'ACTIVE'/);
  assert.match(migration, /provider = 'phone'/);
  assert.match(migration, /provider = 'email'/);
  assert.match(migration, /PHONE_OTP_AUTH_COLLISION/);
  assert.match(migration, /preview_director_entitlements[\s\S]*PHONE_LOGIN_DIRECTOR_ENTITLEMENT_PRESENT/);
  assert.match(migration, /directorAccessDenied', true/);
});

test("unknown, unverified, revoked, duplicate, and stale phone ownership cannot reach provider send", async () => {
  const migration = await source(controlledLoginMigrationPath);
  const route = await source("app/api/participant/auth/phone-login-proof/route.js");
  const authorize = migration.slice(migration.indexOf("authorize_participant_phone_login_proof"), migration.indexOf("begin_participant_phone_login"));
  const begin = migration.slice(migration.indexOf("begin_participant_phone_login"), migration.indexOf("record_participant_phone_login_send"));
  assert.match(authorize, /identifier_type = 'PHONE'/);
  assert.match(authorize, /status <> 'VERIFIED'/);
  assert.match(authorize, /expected_revision[\s\S]*PHONE_OTP_NOT_ELIGIBLE/);
  assert.match(authorize, /auth_phone_user_count <> 1/);
  assert.match(begin, /PHONE_LOGIN_PROOF_USED/);
  assert.match(begin, /PHONE_OTP_COOLDOWN/);
  assert.match(begin, /PHONE_OTP_RATE_LIMITED/);
  assert.ok(route.indexOf("beginParticipantPhoneLogin") < route.indexOf("requestExistingParticipantPhoneLogin"));
});

test("one owner request uses shouldCreateUser false and one sms verification uses type sms", async () => {
  const helper = await source("lib/participant-phone-otp.js");
  const route = await source("app/api/participant/auth/phone-login-proof/route.js");
  assert.match(helper, /signInWithOtp\(\{[\s\S]*shouldCreateUser: false[\s\S]*channel: "sms"/);
  assert.match(helper, /verifyOtp\(\{ phone, token, type: "sms" \}\)/);
  assert.match(route, /provider_called: true/);
  assert.doesNotMatch(route, /setInterval|automatic resend|auth\.resend/i);
});

test("wrong returned UUID is locally terminated and cannot complete Passport or scoring authorization", async () => {
  const route = await source("app/api/participant/auth/phone-login-proof/route.js");
  const migration = await source(controlledLoginMigrationPath);
  assert.match(route, /!verified\.ok[\s\S]*signOut\(\{ scope: "local" \}\)/);
  assert.match(route, /PHONE_OTP_AUTH_MISMATCH/);
  assert.match(migration, /returned_auth_user <> expected_auth_user[\s\S]*status = 'UUID_MISMATCH'/);
  assert.ok(route.lastIndexOf("completeParticipantPhoneLogin") > route.lastIndexOf("readParticipantIdentityContextForAuth"));
});

test("successful login preserves ownership/scoring and establishes a refreshable CB01 session", async () => {
  const route = await source("app/api/participant/auth/phone-login-proof/route.js");
  const ui = await source("app/participant-auth/ParticipantAuthRehearsal.js");
  const migration = await source(controlledLoginMigrationPath);
  assert.match(ui, /sessionPayload\.session !== "active"/);
  assert.match(route, /participantSessionEstablished/);
  assert.match(route, /refreshSessionAvailable/);
  assert.match(route, /playerPassportResolved: true/);
  assert.match(migration, /SAME_AUTH_USER_PHONE_LOGIN_VERIFIED/);
  assert.match(migration, /phoneIdentifierUnchanged', true/);
  assert.match(migration, /scoringAuthorizationUnchanged', true/);
  assert.doesNotMatch(migration, /update\s+participant_identity\.user_player_links/i);
  assert.doesNotMatch(migration, /update\s+participant_identity\.participant_auth_identifiers/i);
  assert.doesNotMatch(migration, /update\s+scoring_authority\.scoring_permissions/i);
  assert.doesNotMatch(migration, /insert\s+into\s+auth\.users|update\s+auth\.users|delete\s+from\s+auth\.users/i);
});

test("controlled UI has no arbitrary phone input, restores pending proof, and retains email fallback", async () => {
  const ui = await source("app/participant-auth/ParticipantAuthRehearsal.js");
  assert.match(ui, /Operation B · Controlled Preview proof/);
  assert.match(ui, /Text the approved mobile a code/);
  assert.match(ui, /autoComplete="one-time-code"/);
  assert.match(ui, /phone-login-proof/);
  assert.match(ui, /sessionPayload\.session !== "inactive"/);
  assert.match(ui, /Email fallback remains available below/);
  assert.match(ui, /CAPTCHA and the ordinary public SMS login UI remain deferred to Step 8B\.3/);
  assert.doesNotMatch(ui, /type="tel"|name="phone"|placeholder="\+1/);
});

test("Operation B functions are service-role only and automated coverage contains no provider credentials or OTP storage", async () => {
  const migration = await source(controlledLoginMigrationPath);
  for (const name of ["authorize_participant_phone_login_proof", "begin_participant_phone_login",
    "record_participant_phone_login_send", "read_participant_phone_login_state",
    "authorize_participant_phone_login_verification", "record_participant_phone_login_failure",
    "complete_participant_phone_login"]) {
    assert.match(migration, new RegExp(`public\\.${name}`));
  }
  assert.match(migration, /revoke all on function %s from public, anon, authenticated/);
  assert.match(migration, /grant execute on function %s to service_role/);
  assert.doesNotMatch(migration, /auth token|account sid|verify service sid|otp\s+(?:text|varchar)|token\s+(?:text|varchar)/i);
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
  ), (error) => error.code === "PHONE_OTP_PENDING_STATE_MISMATCH");
});

test("hosted Supabase User new_phone shape preserves A and ignores phone identity ids", () => {
  const hostedPendingUser = {
    id: authId,
    email: "golfer@example.net",
    phone: "",
    new_phone: "12025550123",
    phone_confirmed_at: null,
    identities: [{
      id: authB,
      identity_id: authB,
      user_id: authId,
      provider: "email",
    }],
  };
  assert.deepEqual(inspectParticipantAuthUserPhone(hostedPendingUser, phone), {
    phoneState: "EMPTY", phoneChangeState: "EXPECTED", phoneConfirmed: false,
  });
  assert.doesNotThrow(() => assertParticipantPhoneEnrollmentAuthUser(
    hostedPendingUser,
    { expectedAuthUserId: authId, expectedEmail: hostedPendingUser.email, targetPhone: phone, phase: "pending" },
  ));
});

test("real hosted updateUser new_phone fixture advances Stage B before phone_change persistence catches up", () => {
  const updateUser = {
    id: authId,
    email: "golfer@example.net",
    phone: "",
    new_phone: "12025550123",
    phone_confirmed_at: null,
    identities: [{ id: authB, identity_id: authB, user_id: authId, provider: "email" }],
  };
  const persistedUserAtRecordBoundary = {
    id: authId,
    email: updateUser.email,
    phone: "",
    phone_change: "",
    phone_confirmed_at: null,
  };
  assert.deepEqual(normalizeParticipantPhoneEnrollmentStageB({
    updateUser,
    persistedUser: persistedUserAtRecordBoundary,
    expectedAuthUserId: authId,
    expectedEmail: updateUser.email,
    targetPhone: phone,
  }), {
    authUserId: authId,
    pendingPhoneMatches: true,
    pendingPhoneSource: "UPDATE_USER_NEW_PHONE",
    phoneRepresentationNormalized: true,
  });
  assert.equal(maskParticipantAuthPhone(phone), "••• ••• 0123");
});

test("Stage B reserves Auth mismatch for an Auth user UUID mismatch", () => {
  const base = { email: "golfer@example.net", phone: "", new_phone: "12025550123", phone_confirmed_at: null };
  assert.throws(() => normalizeParticipantPhoneEnrollmentStageB({
    updateUser: { ...base, id: authB }, persistedUser: { ...base, id: authId },
    expectedAuthUserId: authId, expectedEmail: base.email, targetPhone: phone,
  }), (error) => error.code === "PHONE_OTP_AUTH_MISMATCH");
  assert.throws(() => normalizeParticipantPhoneEnrollmentStageB({
    updateUser: { ...base, id: authId, new_phone: "" }, persistedUser: { ...base, id: authId, new_phone: "" },
    expectedAuthUserId: authId, expectedEmail: base.email, targetPhone: phone,
  }), (error) => error.code === "PHONE_OTP_PENDING_STATE_MISMATCH");
});

test("residual unconfirmed Auth phone blocks before provider use and repaired empty state is ready", () => {
  const base = { id: authId, email: "golfer@example.net", phone_change: "", phone_confirmed_at: null };
  assert.throws(() => assertParticipantPhoneEnrollmentAuthUser(
    { ...base, phone: "12025550123" },
    { expectedAuthUserId: authId, expectedEmail: base.email, targetPhone: phone, phase: "before" },
  ), (error) => error.code === "PHONE_OTP_REPAIR_REQUIRED");
  assert.doesNotThrow(() => assertParticipantPhoneEnrollmentAuthUser(
    { ...base, phone: "" },
    { expectedAuthUserId: authId, expectedEmail: base.email, targetPhone: phone, phase: "before" },
  ));
});

test("OTP input and provider errors stay in bounded safe categories", () => {
  assert.equal(normalizeParticipantPhoneOtpToken("123 456"), "123456");
  for (const token of ["", "12345", "1234567", "12a456"]) assert.throws(() => normalizeParticipantPhoneOtpToken(token));
  assert.equal(participantPhoneOtpProviderFailureCode({ status: 429 }, "send"), "PHONE_OTP_RATE_LIMITED");
  assert.equal(participantPhoneOtpProviderFailureCode({ status: 400 }, "verify"), "PHONE_OTP_INVALID_OR_EXPIRED");
});

test("Twilio trial recipient rejection is classified without exposing provider details", () => {
  const failure = classifyParticipantPhoneOtpProviderFailure({
    status: 422,
    code: "sms_send_failed",
    message: "Error sending phone_change OTP to provider: trial account recipient unverified (21608)",
  }, "send");
  assert.deepEqual(failure, {
    code: "PHONE_OTP_TRIAL_RECIPIENT_UNVERIFIED",
    authErrorCode: "sms_send_failed",
    authStatus: 422,
    providerErrorClass: "TWILIO_21608_TRIAL_RECIPIENT_UNVERIFIED",
    providerCalled: true,
  });
  assert.equal(participantPhoneOtpProviderFailureCode({
    status: 422, code: "sms_send_failed", message: "Trial accounts cannot send to an unverified number. 21608",
  }), "PHONE_OTP_TRIAL_RECIPIENT_UNVERIFIED");
  const safeMessage = participantPhoneOtpErrorMessage(failure.code);
  assert.doesNotMatch(safeMessage, /twilio|trial|21608|credential|sid|token/i);
  assert.equal(classifyParticipantPhoneOtpProviderFailure({
    status: 503, code: "unsafe code with details",
  }).authErrorCode, "UNKNOWN");
});

test("enrollment route records a rejected Twilio request as provider-called using safe metadata only", async () => {
  const route = await source("app/api/participant/auth/phone-enrollment/route.js");
  assert.match(route, /providerCalled = providerAccepted \|\| \(!localSafetyError && failure\.providerCalled === true\)/);
  assert.match(route, /authErrorCode: failure\.authErrorCode/);
  assert.match(route, /authStatus: failure\.authStatus/);
  assert.match(route, /providerErrorClass: failure\.providerErrorClass/);
  assert.doesNotMatch(route, /message:\s*error\?\.message|console\.(?:warn|error)\([^\n]+error\?\.message/);
});

test("send-stage safety failures do not claim that OTP verification occurred", async () => {
  const route = await source("app/api/participant/auth/phone-enrollment/route.js");
  assert.equal(participantPhoneOtpErrorMessage("PHONE_OTP_ENROLLMENT_START_FAILED"),
    "Phone enrollment could not be started safely.");
  assert.match(route, /localSafetyError[\s\S]*PHONE_OTP_ENROLLMENT_START_FAILED/);
  assert.match(route, /action === "start" && code === "PHONE_OTP_AUTH_MISMATCH"/);
  assert.equal(participantPhoneOtpErrorMessage("PHONE_OTP_AUTH_MISMATCH"),
    "The verified Auth identity did not match the approved participant.");
  assert.doesNotMatch(participantPhoneOtpErrorMessage("PHONE_OTP_PENDING_STATE_MISMATCH"), /verified Auth identity/i);
  assert.doesNotMatch(participantPhoneOtpErrorMessage("PHONE_OTP_SEND_FAILED"), /verified Auth identity/i);
  assert.doesNotMatch(participantPhoneOtpErrorMessage("PHONE_OTP_ENROLLMENT_START_FAILED"), /verified Auth identity/i);
});

test("Stage B record accepts normalized updateUser evidence without weakening UUID or collision gates", async () => {
  const migration = await source(pendingTransitionMigrationPath);
  assert.match(migration, /returned_auth_user is distinct from attempt\.auth_user_id[\s\S]*PHONE_OTP_AUTH_MISMATCH/);
  assert.match(migration, /pending_phone_matches[\s\S]*PHONE_OTP_PENDING_STATE_MISMATCH/);
  assert.match(migration, /pending_phone_source[\s\S]*UPDATE_USER_NEW_PHONE/);
  assert.match(migration, /status', 'VERIFICATION_PENDING'/);
  assert.match(migration, /status = case when succeeded then 'VERIFICATION_PENDING' else 'ELIGIBLE'/);
  assert.match(migration, /PHONE_OTP_AUTH_COLLISION/);
  assert.match(migration, /read_participant_phone_enrollment_state/);
  assert.doesNotMatch(migration, /insert\s+into\s+auth\.users|update\s+participant_identity\.user_player_links/i);
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

test("residual Preview repair is PII-safe, exact-attempt scoped, and leaves enrollment ready", async () => {
  const repair = await source(residualRepairPath);
  assert.match(repair, /order by attempt\.requested_at desc[\s\S]*limit 1/);
  assert.match(repair, /target_attempt\.status <> 'SEND_FAILED'/);
  assert.match(repair, /target_attempt\.safe_reason <> 'PHONE_OTP_AUTH_MISMATCH'/);
  assert.match(repair, /target_attempt\.provider_called/);
  assert.match(repair, /target_attempt\.expires_at > now\(\)/);
  assert.match(repair, /phone_confirmed_at is not null/);
  assert.match(repair, /phone_change_sent_at is not null/);
  assert.match(repair, /phone_change_token/);
  assert.match(repair, /created_at between target_attempt\.requested_at/);
  assert.match(repair, /delete from auth\.identities/);
  assert.match(repair, /update auth\.users[\s\S]*set phone = null/);
  assert.match(repair, /status = 'CANCELLED'/);
  assert.match(repair, /safe_reason = 'PREVIEW_AUTH_PHONE_RESIDUE_REPAIRED'/);
  assert.match(repair, /'PHONE_RESIDUAL_UNCONFIRMED_STATE_REPAIRED'/);
  assert.match(repair, /'phoneIdentifierStatus', 'ELIGIBLE'/);
  assert.match(repair, /'smsSent', false/);
  assert.doesNotMatch(repair, /delete\s+from\s+auth\.users/i);
  assert.doesNotMatch(repair, /(?:insert|update|delete)\s+(?:into\s+)?participant_identity\.user_player_links/i);
  assert.doesNotMatch(repair, /status\s*=\s*'VERIFIED'/i);
  assert.doesNotMatch(repair, /twilio|signInWithOtp|verifyOtp|updateUser\(\{\s*phone/i);
});

test("compromised real send is cancellable without accepting its OTP or changing ownership", async () => {
  const repair = await source(compromisedRepairPath);
  const executableRepair = repair.replace(/--.*$/gm, "");
  assert.match(repair, /target_attempt\.status <> 'SEND_FAILED'/);
  assert.match(repair, /target_attempt\.safe_reason <> 'PHONE_OTP_AUTH_MISMATCH'/);
  assert.match(repair, /not target_attempt\.provider_called/);
  assert.match(repair, /target_attempt\.verify_failure_count <> 0/);
  assert.match(repair, /phone_change_sent_at is null/);
  assert.match(repair, /phone_change_token/);
  assert.match(repair, /update auth\.users[\s\S]*set phone_change = ''/);
  assert.match(repair, /status = 'CANCELLED'/);
  assert.match(repair, /safe_reason = 'COMPROMISED_OTP_SCREENSHOT'/);
  assert.match(repair, /'PHONE_COMPROMISED_ENROLLMENT_CANCELLED'/);
  assert.match(repair, /'failureStage', 'AFTER_UPDATE_USER_BEFORE_VERIFY_OTP'/);
  assert.match(repair, /'phoneIdentifierStatus', 'ELIGIBLE'/);
  assert.match(repair, /'smsSentByRepair', false/);
  assert.doesNotMatch(repair, /delete\s+from\s+auth\.(?:users|identities)/i);
  assert.doesNotMatch(repair, /(?:insert|update|delete)\s+(?:into\s+)?participant_identity\.user_player_links/i);
  assert.doesNotMatch(repair, /status\s*=\s*'VERIFIED'/i);
  assert.doesNotMatch(executableRepair, /signInWithOtp|verifyOtp|updateUser\(\{\s*phone/i);
});

test("latest compromised Stage B attempt repair is exact, PII-safe, and sends no SMS", async () => {
  const repair = await source(latestCompromisedRepairPath);
  const executable = repair.replace(/--.*$/gm, "");
  assert.match(repair, /status <> 'SEND_FAILED'/);
  assert.match(repair, /safe_reason <> 'PHONE_OTP_AUTH_MISMATCH'/);
  assert.match(repair, /sent_at is not null/);
  assert.match(repair, /update auth\.users[\s\S]*phone_change = ''/);
  assert.match(repair, /safe_reason = 'COMPROMISED_OTP_SCREENSHOT'/);
  assert.match(repair, /IMMEDIATE_AUTH_USERS_PHONE_CHANGE_NOT_YET_VISIBLE/);
  assert.match(repair, /'phoneIdentifierStatus', 'ELIGIBLE'/);
  assert.match(repair, /'smsSentByRepair', false/);
  assert.doesNotMatch(repair, /delete\s+from\s+auth\.(?:users|identities)/i);
  assert.doesNotMatch(repair, /(?:insert|update|delete)\s+(?:into\s+)?participant_identity\.user_player_links/i);
  assert.doesNotMatch(repair, /status\s*=\s*'VERIFIED'/i);
  assert.doesNotMatch(executable, /signInWithOtp|verifyOtp|updateUser\(\{\s*phone/i);
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
  assert.match(participantRoute, /normalizeParticipantPhoneEnrollmentStageB/);
  assert.match(participantRoute, /readParticipantPhoneEnrollmentState/);
  assert.match(participantRoute, /signOut\(\{ scope: "local" \}\)/);
  assert.match(participantUi, /window\.confirm/);
  assert.match(participantUi, /Begin phone enrollment/);
  assert.match(participantUi, /Verification code sent/);
  assert.match(participantUi, /Six-digit phone enrollment code/);
  assert.match(participantUi, /resendSeconds/);
  assert.match(participantUi, /Operation B remains separate/);
  assert.doesNotMatch(participantUi, /useEffect\([\s\S]{0,300}(?:action:\s*["']start|action:\s*["']verify)/);
});

test("verification UI is wired only to verifyOtp phone_change after Stage B", async () => {
  const [route, ui] = await Promise.all([
    source("app/api/participant/auth/phone-enrollment/route.js"),
    source("app/participant-auth/ParticipantAuthRehearsal.js"),
  ]);
  assert.match(ui, /action: "verify", attemptId: phoneEnrollment\?\.attemptId, token: phoneToken/);
  assert.match(ui, /phoneEnrollment\?\.status !== "VERIFICATION_PENDING"/);
  assert.match(route, /verifyExistingParticipantPhoneEnrollment/);
  assert.match(await source("lib/participant-phone-otp.js"), /verifyOtp\(\{ phone, token, type: "phone_change" \}\)/);
});

test("email sign-in remains enabled while ordinary public phone login remains absent", async () => {
  const [emailRequest, participantUi, controlledRoute] = await Promise.all([
    source("app/api/participant/auth/otp/request/route.js"),
    source("app/participant-auth/ParticipantAuthRehearsal.js"),
    source("app/api/participant/auth/phone-login-proof/route.js"),
  ]);
  assert.match(emailRequest, /signInWithOtp\(\{ email/);
  assert.match(emailRequest, /shouldCreateUser: false/);
  assert.match(participantUi, /type="email"/);
  assert.doesNotMatch(participantUi, /type="tel"|name="phone"/);
  assert.match(participantUi, /Public participant SMS login remains off/);
  assert.doesNotMatch(controlledRoute, /input\.(?:phone|phoneE164)/);
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
