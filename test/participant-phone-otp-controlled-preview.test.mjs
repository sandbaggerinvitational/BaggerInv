import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  attachPhoneToExistingParticipantAuthUser,
  inspectParticipantAuthUserPhone,
  normalizeParticipantPhoneOtpToken,
  participantPhoneOtpClientFingerprint,
  participantPhoneOtpProviderFailureCode,
  requestExistingParticipantPhoneOtp,
  verifyExistingParticipantPhoneOtp,
} from "../lib/participant-phone-otp.js";
import {
  participantSmsAuthFeatureConfigured,
  participantSmsProviderTestConfigured,
} from "../lib/participant-sms-auth-feature.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const migrationPath = "supabase/migrations/202608210003_preview_participant_phone_otp_proof.sql";
const authId = "11111111-1111-4111-8111-111111111111";

function adminClientFor(initialUser) {
  let user = { ...initialUser };
  const updates = [];
  return {
    updates,
    client: { auth: { admin: {
      async getUserById() { return { data: { user: { ...user } }, error: null }; },
      async updateUserById(id, values) {
        updates.push({ id, values });
        user = { ...user, phone: values.phone, phone_confirmed_at: values.phone_confirm ? "confirmed" : null };
        return { data: { user: { ...user } }, error: null };
      },
    } } },
  };
}

test("provider-test and public SMS flags remain separate and Preview-only", () => {
  assert.equal(participantSmsProviderTestConfigured({}), false);
  assert.equal(participantSmsProviderTestConfigured({ VERCEL_ENV: "production", PARTICIPANT_SMS_PROVIDER_TEST_ENABLED: "true" }), false);
  assert.equal(participantSmsProviderTestConfigured({ VERCEL_ENV: "preview", PARTICIPANT_SMS_PROVIDER_TEST_ENABLED: "true", PARTICIPANT_SMS_AUTH_ENABLED: "false" }), true);
  assert.equal(participantSmsProviderTestConfigured({ VERCEL_ENV: "preview", PARTICIPANT_SMS_PROVIDER_TEST_ENABLED: "true", PARTICIPANT_SMS_AUTH_ENABLED: "true" }), false);
  assert.equal(participantSmsAuthFeatureConfigured({ VERCEL_ENV: "preview", PARTICIPANT_SMS_AUTH_ENABLED: "false" }), false);
});

test("client rate-limit fingerprint is keyed and never contains raw request values", () => {
  const request = { headers: { get: (name) => name === "x-forwarded-for" ? "203.0.113.9, 10.0.0.1" : "Mobile Safari" } };
  const fingerprint = participantPhoneOtpClientFingerprint(request, "x".repeat(32));
  assert.match(fingerprint, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(fingerprint, /203|Safari/);
  assert.throws(() => participantPhoneOtpClientFingerprint(request, "short"), /not completely configured/i);
});

test("blank, null, and whitespace phone_change values are treated as unset", () => {
  for (const phoneChange of [null, "", "   "]) {
    assert.deepEqual(inspectParticipantAuthUserPhone({ phone: "", phone_change: phoneChange }, "+12025550123"), {
      phoneState: "EMPTY", phoneChangeState: "EMPTY", phoneConfirmed: false,
    });
  }
  assert.equal(inspectParticipantAuthUserPhone({ phone: "", phone_change: "+12025550123" }, "+12025550123").phoneChangeState, "EXPECTED");
  assert.equal(inspectParticipantAuthUserPhone({ phone: "", phone_change: "+12025550124" }, "+12025550123").phoneChangeState, "CONFLICT");
});

test("supported Admin API attaches an unverified phone to the existing Auth UUID", async () => {
  const mock = adminClientFor({ id: authId, email: "golfer@example.net", phone: "", phone_change: "", phone_confirmed_at: null });
  const result = await attachPhoneToExistingParticipantAuthUser({
    adminClient: mock.client,
    expectedAuthUserId: authId,
    expectedEmail: "golfer@example.net",
    targetPhone: "+12025550123",
  });
  assert.equal(result.sameAuthUser, true);
  assert.equal(result.emailPreserved, true);
  assert.equal(result.attached, true);
  assert.deepEqual(mock.updates, [{ id: authId, values: { phone: "+12025550123", phone_confirm: false } }]);
  assert.equal(result.phoneStateAfter, "EXPECTED");
  assert.equal(result.phoneConfirmedAfterAttachment, false);
});

test("already attached same-user phone is reused and conflicting Auth state fails closed", async () => {
  const existing = adminClientFor({ id: authId, email: "golfer@example.net", phone: "+12025550123", phone_change: " ", phone_confirmed_at: null });
  const result = await attachPhoneToExistingParticipantAuthUser({ adminClient: existing.client, expectedAuthUserId: authId,
    expectedEmail: "golfer@example.net", targetPhone: "+12025550123" });
  assert.equal(result.attached, false);
  assert.equal(existing.updates.length, 0);
  const conflict = adminClientFor({ id: authId, email: "golfer@example.net", phone: "", phone_change: "+12025550124" });
  await assert.rejects(() => attachPhoneToExistingParticipantAuthUser({ adminClient: conflict.client, expectedAuthUserId: authId,
    expectedEmail: "golfer@example.net", targetPhone: "+12025550123" }), /did not match/i);
});

test("phone send forbids signup and verify enforces the returned Auth UUID", async () => {
  let sendInput;
  const otpClient = { auth: {
    async signInWithOtp(input) { sendInput = input; return { data: {}, error: null }; },
    async verifyOtp() { return { data: { user: { id: authId }, session: { access_token: "not-inspected" } }, error: null }; },
  } };
  assert.deepEqual(await requestExistingParticipantPhoneOtp({ otpClient, phone: "+12025550123" }), { providerAccepted: true });
  assert.deepEqual(sendInput, { phone: "+12025550123", options: { shouldCreateUser: false, channel: "sms" } });
  const verified = await verifyExistingParticipantPhoneOtp({ otpClient, phone: "+12025550123", token: "123456", expectedAuthUserId: authId });
  assert.equal(verified.ok, true);
  assert.equal(verified.sessionCreated, true);
  const mismatch = await verifyExistingParticipantPhoneOtp({ otpClient, phone: "+12025550123", token: "123456", expectedAuthUserId: "22222222-2222-4222-8222-222222222222" });
  assert.equal(mismatch.ok, false);
});

test("OTP input and provider failures use bounded safe categories", () => {
  assert.equal(normalizeParticipantPhoneOtpToken("123 456"), "123456");
  for (const token of ["", "12345", "1234567", "12a456"]) assert.throws(() => normalizeParticipantPhoneOtpToken(token));
  assert.equal(participantPhoneOtpProviderFailureCode({ status: 429 }, "send"), "PHONE_OTP_RATE_LIMITED");
  assert.equal(participantPhoneOtpProviderFailureCode({ status: 400 }, "verify"), "PHONE_OTP_INVALID_OR_EXPIRED");
  assert.equal(participantPhoneOtpProviderFailureCode({ status: 500 }, "send"), "PHONE_OTP_PROVIDER_UNAVAILABLE");
});

test("migration creates protected revision-bound attempts with durable abuse controls", async () => {
  const migration = await source(migrationPath);
  assert.match(migration, /create table participant_identity\.participant_phone_otp_attempts/);
  assert.match(migration, /identifier_revision bigint not null/);
  assert.match(migration, /requested_by_auth_user_id uuid not null/);
  assert.match(migration, /client_fingerprint text not null/);
  assert.match(migration, /expires_at timestamptz not null default \(now\(\) \+ interval '10 minutes'\)/);
  assert.match(migration, /interval '60 seconds'/);
  assert.match(migration, /recent_identifier >= 3 or recent_client >= 6/);
  assert.match(migration, /verify_failure_count between 0 and 5/);
  assert.match(migration, /participant_phone_otp_one_open_attempt_idx/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on participant_identity\.participant_phone_otp_attempts from public, anon, authenticated/);
  assert.doesNotMatch(migration, /create policy|using\s*\(\s*true\s*\)/i);
  assert.doesNotMatch(migration, /otp\s+(?:text|varchar)|token\s+(?:text|varchar)|verification_code/i);
});

test("database gates same rehearsal Auth UUID, active link, email, phone revision, collisions, and confirmed provider state", async () => {
  const migration = await source(migrationPath);
  assert.match(migration, /participant_auth_rehearsals/);
  assert.match(migration, /rehearsal\.auth_user_id/);
  assert.match(migration, /user_player_links/);
  assert.match(migration, /email_identifier\.auth_user_id/);
  assert.match(migration, /identifier\.revision <> attempt\.identifier_revision/);
  assert.match(migration, /other_user\.id <> attempt\.auth_user_id/);
  assert.match(migration, /auth_user\.phone_confirmed_at is null/);
  assert.match(migration, /'PHONE_OTP_AUTH_MISMATCH'/);
  assert.match(migration, /'PHONE_OTP_REPLAY'/);
  assert.match(migration, /'PHONE_REVOKED'/);
  assert.match(migration, /participant_phone_otp_identifier_invalidation/);
  assert.match(migration, /participant_phone_otp_link_invalidation/);
  assert.match(migration, /verification_source = 'SUPABASE_AUTH_TWILIO_VERIFY'/);
});

test("attempt RPCs and raw identifier data remain service-role only", async () => {
  const migration = await source(migrationPath);
  for (const name of ["begin_participant_phone_otp_attempt", "record_participant_phone_otp_send",
    "authorize_participant_phone_otp_verification", "record_participant_phone_otp_verification_failure",
    "complete_participant_phone_otp_verification", "read_participant_phone_otp_director_state"]) {
    assert.match(migration, new RegExp(`public\\.${name}`));
  }
  assert.match(migration, /revoke all on function %s from public, anon, authenticated/);
  assert.match(migration, /grant execute on function %s to service_role/);
  assert.doesNotMatch(migration, /grant execute on function[^\n]+\s+to\s+(?:anon|authenticated)/i);
  assert.match(migration, /'rawPhoneLogged', false/);
  assert.match(migration, /'otpLogged', false/);
  assert.doesNotMatch(migration, /insert\s+into\s+auth\.users|update\s+auth\.users|delete\s+from\s+auth\.users/i);
});

test("Director route alone orchestrates supported Supabase Auth send and verify", async () => {
  const route = await source("app/api/director/participant-identity/route.js");
  const participantLogin = await source("app/participant-auth/ParticipantAuthRehearsal.js");
  assert.match(route, /authorizePreviewDirector/);
  assert.match(route, /sameOriginMutation/);
  assert.match(route, /participantSmsProviderTestConfigured/);
  assert.match(route, /send-test-phone-otp/);
  assert.match(route, /verify-test-phone-otp/);
  assert.match(route, /attachPhoneToExistingParticipantAuthUser/);
  assert.match(route, /requestExistingParticipantPhoneOtp/);
  assert.match(route, /verifyExistingParticipantPhoneOtp/);
  assert.match(route, /returned_auth_user_id: verified\.userId/);
  assert.match(route, /signOut\(\{ scope: "local" \}\)/);
  assert.doesNotMatch(route, /createUser|signUp|from\s+["']twilio["']|twilio\.(?:verify|messages)/i);
  assert.doesNotMatch(participantLogin, /Text Me a Code|type="tel"|send-test-phone-otp/);
});

test("Director UI provides explicit send, six-digit OTP, autofill, countdown, and no automatic request", async () => {
  const panel = await source("app/admin/director/ParticipantIdentityFoundationPanel.js");
  assert.match(panel, /Send Test Verification Code/);
  assert.match(panel, /Verification pending/);
  assert.match(panel, /autoComplete="one-time-code"/);
  assert.match(panel, /inputMode="numeric"/);
  assert.match(panel, /maxLength=\{6\}/);
  assert.match(panel, /Resend in/);
  assert.match(panel, /never paste it into chat/i);
  assert.match(panel, /participant SMS login remains off/i);
  assert.doesNotMatch(panel, /useEffect\([\s\S]{0,300}send-test-phone-otp/);
});

test("no Twilio SDK or application Twilio secret is introduced", async () => {
  const pkg = JSON.parse(await source("package.json"));
  const env = await source(".env.example");
  assert.equal(pkg.dependencies.twilio, undefined);
  assert.match(env, /PARTICIPANT_SMS_PROVIDER_TEST_ENABLED=false/);
  assert.match(env, /PARTICIPANT_PHONE_OTP_RATE_LIMIT_SECRET=/);
  assert.doesNotMatch(env, /TWILIO_(?:AUTH_TOKEN|ACCOUNT_SID|VERIFY_SERVICE_SID)/);
});
