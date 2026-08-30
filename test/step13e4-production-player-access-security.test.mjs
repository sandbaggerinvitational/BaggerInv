import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("additive Player access SQL is inert, Director-only, fixed-scope, and privacy preserving", () => {
  const sql = source("supabase/production_migrations/202608300060_production_players_access_v1.sql");
  assert.match(sql, /begin;[\s\S]*commit;/);
  assert.match(sql, /assert_exact_cutover_resource_scope\(input, false\)/);
  assert.match(sql, /assert_production_scoring_actor\(input, true\)/);
  assert.match(sql, /assert_production_handicap_runtime\(\)/);
  assert.match(sql, /set search_path = pg_catalog/);
  assert.match(sql, /enable row level security/g);
  assert.match(sql, /grant execute on function public\.read_production_players_access_v1\(jsonb\)[\s\S]*to service_role/);
  assert.match(sql, /grant execute on function public\.mutate_production_players_access_v1\(jsonb\)[\s\S]*to service_role/);
  assert.match(sql, /revoke all on table participant_identity\.player_access_audit_events_v1[\s\S]*from public, anon, authenticated, service_role/);
  assert.doesNotMatch(sql, /grant (?:select|insert|update|delete).*authenticated/i);
  assert.doesNotMatch(sql, /insert into auth\.users/i);
  assert.doesNotMatch(sql, /supabase\.auth\.admin|signInWithOtp|sendOtp|twilioClient/i);
});

test("email eligibility preserves controlled first-login while rejecting unsafe identity changes", () => {
  const sql = source("supabase/production_migrations/202608300060_production_players_access_v1.sql");
  assert.match(sql, /PLAYER_ACCESS_EMAIL_INVALID/);
  assert.match(sql, /example\\\.\(com\|net\|org\)\|invalid\|test\|localhost/);
  assert.match(sql, /PLAYER_ACCESS_EMAIL_COLLISION/);
  assert.match(sql, /PLAYER_ACCESS_LINKED_EMAIL_REPAIR_REQUIRED/);
  assert.match(sql, /PLAYER_ACCESS_ENROLLMENT_CLAIM_IN_FLIGHT/);
  assert.match(sql, /insert into participant_identity\.identity_config_import_runs/);
  assert.match(sql, /status, roster_count[\s\S]*'APPROVED'/);
  assert.match(sql, /'auth_users_created', 0/);
  assert.match(sql, /'otp_sent', false/);
});

test("phone approval remains unverified readiness and Phone Primary requires verification", () => {
  const sql = source("supabase/production_migrations/202608300060_production_players_access_v1.sql");
  assert.match(sql, /status text not null check \(status in \('APPROVED', 'VERIFIED', 'REVOKED'\)\)/);
  assert.match(sql, /target_phone, 'APPROVED', 1/);
  assert.match(sql, /'status', 'APPROVED',[\s\S]*'verified', false, 'sms_sent', false/);
  assert.match(sql, /target_status = 'PHONE_PRIMARY'[\s\S]*identifier\.status = 'VERIFIED'/);
  assert.match(sql, /PLAYER_ACCESS_VERIFIED_PHONE_REQUIRED/);
  assert.match(sql, /'smsAuthenticationEnabled', false/);
});

test("mutations are optimistic, idempotent, audited, and bulk changes are atomic", () => {
  const sql = source("supabase/production_migrations/202608300060_production_players_access_v1.sql");
  assert.match(sql, /primary key \(tournament_id, operation, operation_request_id\)/);
  assert.match(sql, /PLAYER_ACCESS_IDEMPOTENCY_CONFLICT/);
  assert.match(sql, /PLAYER_ACCESS_REVISION_STALE/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /for item in select value[\s\S]*jsonb_array_elements\(input->'entries'\)/);
  assert.match(sql, /exception when others then[\s\S]*PLAYER_ACCESS_OPERATION_FAILED/);
  assert.match(sql, /BULK_ENROLLMENT_APPLIED/);
  assert.match(sql, /'atomic', true/);
  assert.match(sql, /reject_player_access_immutable_v1/);
  assert.match(sql, /production_participant_identity_claim_serialization_v1/);
  assert.match(sql, /production-participant-identity-config-v1:2026/);
  assert.match(sql, /status = 'CANCELLED'[\s\S]*expires_at <= pg_catalog\.clock_timestamp\(\)/);
  assert.match(sql, /'targets',[\s\S]*'player_id',[\s\S]*'identifier_types'/);
});

test("access suspension is bounded and membership, Player creation, and Director grants remain deferred", () => {
  const sql = source("supabase/production_migrations/202608300060_production_players_access_v1.sql");
  assert.match(sql, /SUSPEND_ACCESS/);
  assert.match(sql, /RESUME_ACCESS/);
  assert.match(sql, /PLAYER_ACCESS_DIRECTOR_ACCESS_REVIEW_REQUIRED/);
  assert.match(sql, /PLAYER_ACCESS_RESUME_IDENTITY_NOT_READY/);
  assert.match(sql, /action_value in \('SUSPEND_ACCESS', 'RESUME_ACCESS'\)[\s\S]*PLAYER_ACCESS_ACTIVE_MEMBERSHIP_REQUIRED/);
  assert.match(sql, /changed_value := changed_value or found/);
  assert.match(sql, /'changeExistingMembershipStatus', false/);
  assert.match(sql, /'createGlobalPlayer', false/);
  assert.match(sql, /'manageDirectorEntitlement', false/);
  assert.doesNotMatch(sql, /update scoring_authority\.tournament_players/i);
  assert.doesNotMatch(sql, /insert into scoring_authority\.players/i);
  assert.doesNotMatch(sql, /insert into production_control\.director_entitlements/i);
});

test("Director route rejects Preview/bootstrap access, enforces same-origin, and has zero Google fallback", () => {
  const route = source("app/api/director/players-access/route.js");
  const server = source("lib/production-player-access-server.js");
  assert.match(route, /VERCEL_ENV\)\.toLowerCase\(\) !== "production"/);
  assert.match(route, /allowBootstrap: false/);
  assert.match(route, /result\.source !== "production-director-entitlement"/);
  assert.match(route, /assertProductionCutoverRequest\(request, process\.env, \{ requireOrigin: true \}\)/);
  assert.match(route, /googleRequests: 0/);
  assert.match(server, /requiredPhase: "OBSERVATION"/);
  assert.match(server, /PRODUCTION_SUPABASE_PROJECT_REF/);
  assert.match(server, /PRODUCTION_GOOGLE_WORKBOOK_ID/);
  assert.match(server, /normalizeProductionPlayerAccessPayload/);
  assert.doesNotMatch(route + server, /google-sheets|readSheets|Passport|legacy.*password/i);
});
