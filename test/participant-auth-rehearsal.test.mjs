import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertSingleParticipantAuthPreflight,
  isDummyParticipantIdentityEmail,
  participantAuthEmailHash,
  safeParticipantAuthCandidate,
} from "../lib/participant-auth-rehearsal.js";
import { participantIdentityAuthorityEnvironment } from "../lib/participant-identity-authority.js";
import { PRODUCTION_SPREADSHEET_ID } from "../lib/spreadsheet-environment.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const previewEnv = {
  VERCEL_ENV: "preview",
  GOOGLE_SHEETS_ID: "preview-workbook",
  PREVIEW_SCORING_SHEET_ID: "preview-workbook",
  PARTICIPANT_IDENTITY_AUTHORITY: "passport",
  SUPABASE_PARTICIPANT_AUTH_REHEARSAL_ENABLED: "true",
  SUPABASE_SCORING_MIRROR_URL: "https://preview.supabase.co",
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "server-secret",
  NEXT_PUBLIC_SUPABASE_AUTH_URL: "https://preview.supabase.co",
  NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY: "publishable",
};

test("single-player preflight accepts exactly one approved real identity and 23 dummy identities", () => {
  const candidate = assertSingleParticipantAuthPreflight({
    approved: true, ready: true, activePlayers: 24, realIdentityCount: 1, dummyIdentityCount: 23,
    dummyAuthUsers: 0, dummyLinks: 0,
    candidate: { playerId: "HM01", displayName: "Holman Moores", emailNormalized: "golfer@realmail.tld", configurationRevision: 4 },
  });
  assert.equal(candidate.playerId, "HM01");
  assert.equal(isDummyParticipantIdentityEmail("person@example.com"), true);
  assert.equal(isDummyParticipantIdentityEmail("person@qa.invalid"), true);
  assert.equal(isDummyParticipantIdentityEmail("person@realmail.tld"), false);
  assert.equal(participantAuthEmailHash(" Golfer@RealMail.TLD "), participantAuthEmailHash("golfer@realmail.tld"));
  assert.equal(safeParticipantAuthCandidate(candidate).maskedEmail.includes("golfer"), false);
});

test("single-player preflight rejects any dummy provisioning or ambiguous real identity", () => {
  assert.throws(() => assertSingleParticipantAuthPreflight({ approved: true, ready: true, activePlayers: 24,
    realIdentityCount: 2, dummyIdentityCount: 22, dummyAuthUsers: 0, dummyLinks: 0, candidate: { playerId: "P1", emailNormalized: "one@real.tld" } }), /Exactly one real/);
  assert.throws(() => assertSingleParticipantAuthPreflight({ approved: true, ready: true, activePlayers: 24,
    realIdentityCount: 1, dummyIdentityCount: 23, dummyAuthUsers: 1, dummyLinks: 0, candidate: { playerId: "P1", emailNormalized: "one@real.tld" } }), /Dummy identities/);
});

test("Auth rehearsal requires Preview, isolated workbook, Passport authority, and complete config", () => {
  assert.equal(participantIdentityAuthorityEnvironment(previewEnv).authRehearsalEnabled, true);
  assert.equal(participantIdentityAuthorityEnvironment({ ...previewEnv, PARTICIPANT_IDENTITY_AUTHORITY: "supabase" }).authRehearsalEnabled, false);
  assert.equal(participantIdentityAuthorityEnvironment({ ...previewEnv, VERCEL_ENV: "production" }).authRehearsalEnabled, false);
  assert.equal(participantIdentityAuthorityEnvironment({ ...previewEnv, GOOGLE_SHEETS_ID: PRODUCTION_SPREADSHEET_ID }).authRehearsalEnabled, false);
  assert.equal(participantIdentityAuthorityEnvironment({ ...previewEnv, NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY: "" }).authRehearsalEnabled, false);
});

test("migration enforces one rehearsal identity, durable OTP limits, RLS, and service-only RPCs", async () => {
  const migration = await source("supabase/migrations/202608120014_preview_single_participant_auth_rehearsal.sql");
  assert.match(migration, /create table participant_identity\.participant_auth_rehearsals/);
  assert.match(migration, /create table participant_identity\.participant_auth_otp_attempts/);
  assert.match(migration, /unique \(auth_user_id\)/);
  assert.match(migration, /unique \(player_id\)/);
  assert.match(migration, /active_count = 24 and real_count = 1 and dummy_count = 23/);
  assert.match(migration, /dummy_auth_count = 0 and dummy_link_count = 0/);
  assert.match(migration, /interval '60 seconds'/);
  assert.match(migration, /recent_player >= 3 or recent_client >= 5/);
  assert.match(migration, /enable row level security/g);
  assert.match(migration, /revoke all on participant_identity\.participant_auth_rehearsals from public, anon, authenticated/);
  assert.doesNotMatch(migration, /create policy|using\s*\(\s*true\s*\)/i);
  assert.match(migration, /grant execute on function %s to service_role/);
  assert.doesNotMatch(migration, /grant execute[\s\S]+(?:anon|authenticated)/i);
});

test("provisioning administratively confirms the Director-approved email without sending mail or creating a password", async () => {
  const admin = await source("lib/supabase-auth-admin.js");
  const route = await source("app/api/director/participant-identity/route.js");
  assert.match(admin, /auth\.admin\.createUser/);
  assert.match(admin, /email_confirm: true/);
  assert.doesNotMatch(admin, /password\s*:/);
  assert.doesNotMatch(admin, /inviteUserByEmail|signInWithOtp/);
  assert.match(route, /assertSingleParticipantAuthPreflight/);
  assert.match(route, /admin_link_auth_user_to_player|linkAuthUserToPlayer/);
  assert.match(route, /approved_fingerprint/);
  assert.match(route, /deleteUser/);
  assert.match(route, /dummyAuthUsers !== 0 \|\| verified\.dummyLinks !== 0/);
});

test("existing single-player repair confirms only the approved linked user and records safe audit evidence", async () => {
  const admin = await source("lib/supabase-auth-admin.js");
  const route = await source("app/api/director/participant-identity/route.js");
  const migration = await source("supabase/migrations/202608120016_preview_single_participant_auth_email_confirmation.sql");
  assert.match(route, /action === "confirm-single-auth-email"/);
  assert.match(route, /participantAuthUsers !== 1/);
  assert.match(route, /participantLinks !== 1/);
  assert.match(route, /dummyAuthUsers !== 0/);
  assert.match(route, /dummyLinks !== 0/);
  assert.match(route, /updateUserById\(beforeUser\.id, \{ email_confirm: true \}\)/);
  assert.match(admin, /provisioning_scope !== "preview_phase_a_single_player"/);
  assert.match(admin, /app_metadata\?\.player_id/);
  assert.match(admin, /app_metadata\?\.tournament_id/);
  assert.match(migration, /AUTH_EMAIL_ADMIN_CONFIRMED/);
  assert.match(migration, /DIRECTOR_APPROVED_IDENTITY_MAPPING/);
  assert.match(migration, /emailValueStored', false/);
  assert.match(migration, /email_confirmed_at[\s\S]*auth\.users u/);
  assert.doesNotMatch(migration, /token_hash|refresh_token|access_token|otp_value/i);
});

test("safe Auth request audit exposes only action and delivery metadata", async () => {
  const migration = await source("supabase/migrations/202608120016_preview_single_participant_auth_email_confirmation.sql");
  const panel = await source("app/admin/director/ParticipantIdentityFoundationPanel.js");
  assert.match(migration, /read_single_participant_auth_request_audit/);
  assert.match(migration, /auth\.audit_log_entries/);
  assert.match(migration, /'action'/);
  assert.match(migration, /'logType'/);
  assert.match(migration, /'safeReason'/);
  assert.match(migration, /revoke all on function public\.read_single_participant_auth_request_audit\(text\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.read_single_participant_auth_request_audit\(text\) to service_role/);
  assert.doesNotMatch(migration, /payload\s*(?:,|as)|jsonb_agg\(payload\)|TokenHash|ConfirmationURL/i);
  assert.match(panel, /Auth participants:/);
  assert.match(panel, /attempts recorded/);
  assert.match(panel, /Safe Auth log:/);
  assert.match(panel, /No Auth payload, token, code, or IP is exposed/);
});

test("OTP route is no-signup, six-digit, scoped, durably audited, and returns generic unapproved behavior", async () => {
  const request = await source("app/api/participant/auth/otp/request/route.js");
  const verify = await source("app/api/participant/auth/otp/verify/route.js");
  assert.match(request, /authRehearsalEnabled/);
  assert.match(request, /resolved !== "passport"/);
  assert.match(request, /shouldCreateUser: false/);
  assert.match(request, /participantAuthGenericMessage/);
  assert.match(request, /recordSingleParticipantOtpDelivery/);
  assert.match(verify, /\^\\d\{6\}\$/);
  assert.match(verify, /auth\.verifyOtp/);
  assert.match(verify, /type: "email"/);
  assert.match(verify, /data\?\.user\?\.id === allowed\.payload\.authUserId/);
  assert.doesNotMatch(`${request}\n${verify}`, /console\.(?:log|error).*token|refresh_token|access_token/i);
});

test("SSR session, logout, shadow comparison, and participant context stay Passport-authoritative", async () => {
  const session = await source("app/api/participant/auth/session/route.js");
  const context = await source("app/api/participant/context/route.js");
  const page = await source("app/participant-auth/ParticipantAuthRehearsal.js");
  assert.match(session, /verifyParticipantAuthClaims/);
  assert.match(session, /signOut\(\{ scope: "global" \}\)/);
  assert.match(session, /recordSingleParticipantAuthLogout/);
  assert.match(context, /passportShadowDiagnostics/);
  assert.match(context, /isSingleParticipantAuthShadowEnabled/);
  assert.match(context, /recordParticipantIdentityShadowObservation/);
  assert.match(context, /identityAuthority: "passport"/);
  assert.match(context, /Participant Auth shadow comparison unavailable/);
  assert.match(page, /clearParticipantAuthClientState/);
  assert.doesNotMatch(`${session}\n${context}\n${page}`, /from\(["'](?:hole_scores|matches|score_mutations)["']\).*?(?:insert|update|delete)/is);
});

test("forward migration preserves the applied migration and adds durable physical-device diagnostics", async () => {
  const migration = await source("supabase/migrations/202608120015_preview_single_participant_auth_diagnostics.sql");
  const diagnostics = await source("lib/participant-auth-client-diagnostics.js");
  const diagnosticsComponent = await source("app/ParticipantAuthDiagnostics.js");
  const route = await source("app/api/participant/auth/diagnostics/route.js");
  const layout = await source("app/layout.js");
  assert.match(migration, /create table participant_identity\.participant_auth_client_diagnostics/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on participant_identity\.participant_auth_client_diagnostics from public, anon, authenticated/);
  assert.match(migration, /record_single_participant_auth_client_diagnostics/);
  assert.match(migration, /created_rehearsal := not found/);
  assert.match(diagnostics, /localStorage/);
  assert.match(diagnostics, /ROUTE_NAVIGATION/);
  assert.match(diagnosticsComponent, /PWA_REOPEN/);
  assert.match(route, /verifyParticipantAuthClaims/);
  assert.match(route, /samples\.slice\(0, 50\)/);
  assert.match(layout, /ParticipantAuthDiagnostics/);
});

test("Director can suspend and resume only the prepared rehearsal while Passport stays authoritative", async () => {
  const route = await source("app/api/director/participant-identity/route.js");
  const migration = await source("supabase/migrations/202608120014_preview_single_participant_auth_rehearsal.sql");
  assert.match(route, /suspend-single-auth/);
  assert.match(route, /resume-single-auth/);
  assert.match(route, /ban_duration/);
  assert.match(route, /setSingleParticipantAuthRehearsalStatus/);
  assert.match(migration, /PARTICIPANT_AUTH_SUSPENDED/);
  assert.match(migration, /link_revision = link_revision \+ 1/);
});

test("Preview Director impersonation remains separate from Supabase Auth", async () => {
  const impersonation = await source("app/api/director/impersonation/route.js");
  assert.match(impersonation, /createPlayerPassportSession/);
  assert.doesNotMatch(impersonation, /createUser|verifyOtp|supabase/i);
});
