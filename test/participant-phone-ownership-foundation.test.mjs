import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  maskParticipantAuthPhone,
  normalizeParticipantAuthPhone,
  participantAuthPhoneErrorMessage,
  participantAuthPhoneStatusLabel,
} from "../lib/participant-auth-phone.js";
import { participantSmsAuthFeatureConfigured } from "../lib/participant-sms-auth-feature.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const migrationPath = "supabase/migrations/202608190001_preview_participant_auth_identifiers.sql";

test("friendly US phone inputs normalize to one E.164 value", () => {
  for (const input of ["2025550123", "202-555-0123", "(202) 555-0123", "+1 202 555 0123"]) {
    const normalized = normalizeParticipantAuthPhone(input);
    assert.equal(normalized.e164, "+12025550123");
    assert.equal(normalized.masked, "••• ••• 0123");
  }
});

test("phone parsing keeps an international-safe foundation and rejects impossible or extended values", () => {
  assert.equal(normalizeParticipantAuthPhone("+44 20 7946 0018").e164, "+442079460018");
  for (const input of ["", "123", "202-555-0123 ext 7", "+99912345678", "not a phone"]) {
    assert.throws(() => normalizeParticipantAuthPhone(input), /valid mobile number/i);
  }
});

test("one canonical masking and status language helper avoids routine raw display", () => {
  assert.equal(maskParticipantAuthPhone("+12025550123"), "••• ••• 0123");
  assert.equal(maskParticipantAuthPhone(""), "Not configured");
  assert.equal(participantAuthPhoneStatusLabel("ELIGIBLE_NOT_VERIFIED"), "Eligible · Not verified");
  assert.equal(participantAuthPhoneStatusLabel("AUTH_SETUP_REQUIRED"), "Auth setup required");
  assert.equal(participantAuthPhoneErrorMessage("PHONE_DUPLICATE"), "This mobile number is already assigned to another participant.");
  assert.doesNotMatch(participantAuthPhoneErrorMessage("PHONE_DUPLICATE"), /player|202|0123/i);
});

test("SMS feature flag is Preview-only and is not enabled by Step 8B.1 defaults", () => {
  assert.equal(participantSmsAuthFeatureConfigured({}), false);
  assert.equal(participantSmsAuthFeatureConfigured({ VERCEL_ENV: "preview", PARTICIPANT_SMS_AUTH_ENABLED: "false" }), false);
  assert.equal(participantSmsAuthFeatureConfigured({ VERCEL_ENV: "production", PARTICIPANT_SMS_AUTH_ENABLED: "true" }), false);
  assert.equal(participantSmsAuthFeatureConfigured({ VERCEL_ENV: "preview", PARTICIPANT_SMS_AUTH_ENABLED: "true" }), true);
});

test("forward migration creates one protected method-neutral EMAIL/PHONE authority", async () => {
  const migration = await source(migrationPath);
  assert.match(migration, /create table participant_identity\.participant_auth_identifiers/);
  assert.match(migration, /identifier_type in \('EMAIL', 'PHONE'\)/);
  assert.match(migration, /status in \('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED', 'REVOKED'\)/);
  assert.match(migration, /normalized_value_private ~ '\^\\\+\[1-9\]\[0-9\]\{7,14\}\$'/);
  assert.match(migration, /status <> 'VERIFIED' or verified_at is not null/);
  assert.match(migration, /status not in \('ELIGIBLE', 'VERIFICATION_PENDING'\) or verified_at is null/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on participant_identity\.participant_auth_identifiers from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update on participant_identity\.participant_auth_identifiers to service_role/);
  assert.doesNotMatch(migration, /create policy|using\s*\(\s*true\s*\)/i);
});

test("database constraints enforce one active phone per player, Auth user, and normalized value", async () => {
  const migration = await source(migrationPath);
  assert.match(migration, /participant_auth_identifier_current_player_method_idx/);
  assert.match(migration, /participant_auth_identifier_current_user_method_idx/);
  assert.match(migration, /participant_auth_identifier_active_phone_unique_idx/);
  assert.match(migration, /where identifier_type = 'PHONE' and status in \('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED'\)/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /PHONE_DUPLICATE/);
  assert.match(migration, /This mobile number is already assigned to another participant/);
});

test("email compatibility backfill is fail-closed while the existing resolver proof remains intact", async () => {
  const migration = await source(migrationPath);
  assert.match(migration, /SYSTEM_EMAIL_COMPATIBILITY_BACKFILL/);
  assert.match(migration, /identifier_type = 'EMAIL'/);
  assert.match(migration, /Participant Auth email identifier backfill did not reach complete Player-link parity/);
  assert.match(migration, /create or replace function public\.admin_link_auth_user_to_player/);
  assert.match(migration, /email_identity_hash/);
  assert.match(migration, /DIRECTOR_APPROVED_EMAIL/);
  assert.doesNotMatch(migration, /drop\s+(?:column\s+)?email_identity_hash|alter\s+column\s+email_identity_hash\s+drop/i);
  const resolver = await source("supabase/migrations/202608120023_preview_participant_tournament_context.sql");
  assert.match(resolver, /link\.email_identity_hash/);
});

test("Director phone mutation preserves history, starts unverified, and never mutates Auth phone fields", async () => {
  const migration = await source(migrationPath);
  assert.match(migration, /create or replace function public\.manage_participant_auth_phone/);
  assert.match(migration, /'ADD_PHONE'/);
  assert.match(migration, /'CHANGE_PHONE'/);
  assert.match(migration, /'REVOKE_PHONE'/);
  assert.match(migration, /target_phone, 'ELIGIBLE'/);
  assert.match(migration, /revoke_reason = 'REPLACED_BY_DIRECTOR'/);
  assert.match(migration, /revoke_reason = 'DIRECTOR_REVOKED'/);
  assert.match(migration, /'verified', false/);
  assert.doesNotMatch(migration, /update\s+auth\.users|insert\s+into\s+auth\.users|phone_confirm\s*[:=]/i);
  assert.doesNotMatch(migration, /twilio|verify service|signInWithOtp|verifyOtp/i);
});

test("service-only phone readiness and eligibility are bounded and collision-aware", async () => {
  const migration = await source(migrationPath);
  assert.match(migration, /read_participant_auth_phone_admin\(\s*target_tournament_id text,\s*actor_auth_user_id uuid/);
  assert.match(migration, /preview_director_entitlements/);
  assert.match(migration, /PHONE_ADMIN_DIRECTOR_REQUIRED/);
  assert.match(migration, /read_participant_auth_phone_eligibility/);
  assert.match(migration, /inspect_participant_auth_identifier_foundation/);
  assert.match(migration, /'playerLinkParity'/);
  assert.match(migration, /auth_user\.phone = target_phone or auth_user\.phone_change = target_phone/);
  assert.match(migration, /PHONE_AUTH_COLLISION/);
  assert.match(migration, /grant execute on function %s to service_role/);
  assert.doesNotMatch(migration, /grant execute[\s\S]+(?:anon|authenticated)/i);
});

test("Director API uses existing authorization, validates same-origin mutations, and returns no raw phone", async () => {
  const route = await source("app/api/director/participant-identity/route.js");
  const phoneBranch = route.slice(
    route.indexOf("if (PHONE_ACTIONS.has(action))"),
    route.indexOf('if (action === "initialize-source")'),
  );
  assert.match(route, /authorizePreviewDirector/);
  assert.match(route, /sameOriginMutation/);
  assert.match(route, /origin === expectedOrigin/);
  assert.match(route, /add-mobile/);
  assert.match(route, /change-mobile/);
  assert.match(route, /revoke-mobile/);
  assert.match(route, /normalizeParticipantAuthPhone/);
  assert.match(route, /manageParticipantAuthPhone/);
  assert.match(route, /maskedPhone: payload\.lastFour \? maskParticipantAuthPhone/);
  assert.doesNotMatch(phoneBranch, /auth\.admin\.(?:createUser|updateUserById)|signInWithOtp|verifyOtp|twilio/i);
  assert.doesNotMatch(route, /console\.(?:log|error)\([^\n]*phone/i);
});

test("Director UI manages masked eligibility while participant login remains email-only", async () => {
  const panel = await source("app/admin/director/ParticipantIdentityFoundationPanel.js");
  const login = await source("app/participant-auth/ParticipantAuthRehearsal.js");
  const request = await source("app/api/participant/auth/otp/request/route.js");
  assert.match(panel, /Authentication methods/);
  assert.match(panel, /Add Mobile/);
  assert.match(panel, /Change Mobile/);
  assert.match(panel, /Revoke Mobile/);
  assert.match(panel, /No SMS is sent/);
  assert.match(panel, /type="tel"/);
  assert.match(panel, /Email sign-in remains available/);
  assert.doesNotMatch(login, /Text Me a Code|Mobile Number|type="tel"/);
  assert.match(request, /shouldCreateUser: false/);
  assert.doesNotMatch(`${login}\n${request}`, /phone|sms|twilio/i);
});

test("new dependency is server/domain-only and no Twilio runtime is added", async () => {
  const pkg = JSON.parse(await source("package.json"));
  assert.ok(pkg.dependencies["libphonenumber-js"]);
  assert.equal(pkg.dependencies.twilio, undefined);
  const panel = await source("app/admin/director/ParticipantIdentityFoundationPanel.js");
  assert.doesNotMatch(panel, /libphonenumber|participant-auth-phone/);
  const route = await source("app/api/director/participant-identity/route.js");
  assert.match(route, /participant-auth-phone/);
});
