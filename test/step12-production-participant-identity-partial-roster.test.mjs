import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [migration, authority, rpcClient, otpRoute, scoringAuthorization, baseline, operator] = await Promise.all([
  source("supabase/production_migrations/202608270047_production_partial_roster_participant_identity.sql"),
  source("lib/participant-identity-authority.js"),
  source("lib/participant-identity-supabase.js"),
  source("app/api/participant/auth/otp/request/route.js"),
  source("lib/scoring-participant-authorization.js"),
  source("supabase/production_migrations/202608240020_production_participant_identity_cutover.sql"),
  source("tools/step11-6-operator/operator.mjs"),
]);

test("migration 047 is additive, installation-inert, and service-role only", () => {
  assert.match(migration, /Applying this migration performs no authority or identity-data mutation/);
  assert.match(migration, /create or replace function\s+public\.inspect_production_participant_identity_enrollment\(\)/i);
  assert.match(migration, /create or replace function public\.activate_production_participant_identity\(input jsonb\)/i);
  assert.match(migration, /security definer[\s\S]*set search_path = pg_catalog/i);
  assert.match(migration, /revoke all on function\s+public\.inspect_production_participant_identity_enrollment\(\)[\s\S]*from public, anon, authenticated, service_role/i);
  assert.match(migration, /grant execute on function\s+public\.inspect_production_participant_identity_enrollment\(\)\s+to service_role/i);
  assert.match(migration, /revoke all on function public\.activate_production_participant_identity\(jsonb\)[\s\S]*from public, anon, authenticated, service_role/i);
  assert.match(migration, /grant execute on function public\.activate_production_participant_identity\(jsonb\)\s+to service_role/i);
  assert.doesNotMatch(migration, /create\s+table|alter\s+table|drop\s+table|create\s+policy/i);
});

test("v2 activation accepts only a non-empty, fully valid approved subset", () => {
  assert.match(migration, /production-participant-identity-cutover-v2/);
  assert.doesNotMatch(migration, /production-participant-identity-cutover-v1/);
  assert.match(migration, /active_contacts as \([\s\S]*contact\.identity_active/i);
  assert.match(migration, /join active_roster membership[\s\S]*membership\.player_id = contact\.player_id/i);
  assert.match(migration, /current_revision\.context_revision = contact\.configuration_revision/i);
  assert.match(migration, /import_run\.status = 'APPROVED'[\s\S]*import_run\.approved_at is not null/i);
  assert.match(migration, /contact\.source_workbook_id = resource\.google_workbook_id/i);
  assert.match(migration, /contact\.player_id ~ '\^\[A-Z0-9\]/i);
  assert.match(migration, /example\\\.\(com\|net\|org\)\|invalid\|test\|localhost/i);
  assert.match(migration, /enrolled_count >= 1/);
  assert.match(migration, /active_contact_count = enrolled_count/);
  assert.match(migration, /invalid_enrolled_count = 0/);
  assert.match(migration, /distinct_email_count = enrolled_count/);
  assert.doesNotMatch(migration, /enrolled_count\s*=\s*active_roster_count/);
  assert.match(migration, /PRODUCTION_IDENTITY_APPROVED_PARTIAL_ROSTER_REQUIRED/);
  assert.match(operator, /case "identity": return \{ contract_version: "production-participant-identity-cutover-v2", phase: "IDENTITY" \}/);
  assert.doesNotMatch(operator, /case "identity"[^\n]+production-participant-identity-cutover-v1/);
});

test("readiness diagnostics explicitly distinguish enrolled and unenrolled stable Player IDs", () => {
  assert.match(migration, /'enrollmentStatus', status\.enrollment_status/);
  assert.match(migration, /'NOT_ENROLLED'/);
  assert.match(migration, /'INVALID_ENROLLMENT'/);
  assert.match(migration, /when status\.enrollment_status = 'ENROLLED'[\s\S]*'maskedEmail'/i);
  assert.match(migration, /'enrollmentPolicy', 'APPROVED_PARTIAL_ROSTER'/);
  assert.match(migration, /'activeRosterParticipants', active_roster_count/);
  assert.match(migration, /'enrolledParticipants', enrolled_count/);
  assert.match(migration, /'notEnrolledParticipants', not_enrolled_count/);
  assert.match(migration, /PRODUCTION_PARTICIPANT_IDENTITY_ACTIVATED/);
});

test("the application exposes only the private readiness RPC and preserves OTP/scoring denial", () => {
  assert.match(authority, /"inspect_production_participant_identity_enrollment"/);
  assert.match(rpcClient, /inspectProductionParticipantIdentityEnrollment/);
  assert.match(rpcClient, /participantIdentityRpc\(\s*"inspect_production_participant_identity_enrollment"/);
  assert.match(otpRoute, /normalizeParticipantAuthCaptchaToken\(input\.captchaToken, \{ required: experience\.captchaRequired \}\)/);
  assert.match(otpRoute, /if \(decision\.allowed !== true\) return enumerationSafeRequestResponse/);
  assert.match(otpRoute, /authorizeProductionParticipantEmailOtpEligibility/);
  assert.match(scoringAuthorization, /resolveSupabaseParticipantIdentity/);
  assert.match(scoringAuthorization, /clean\(identity\.playerId\) !== clean\(session\.playerId\)/);
  assert.match(baseline, /provisioningRequired', false/);
  assert.match(baseline, /ACTIVE_USER_PLAYER_LINK_REQUIRED/);
  assert.match(baseline, /PRODUCTION_PARTICIPANT_IDENTITY_COLLISION/);
});
