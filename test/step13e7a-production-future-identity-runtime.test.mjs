import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = await readFile(path.join(root,
  "supabase/production_migrations/202608300068_production_future_participant_identity_runtime_v1.sql"), "utf8");

test("future identity binding is activation-only, partial-roster safe, and creates no Auth user", () => {
  assert.match(migration, /bind_future_participant_identity_runtime_v1\(/);
  assert.match(migration, /generation\.generation_status <> 'PREPARED'/);
  assert.match(migration, /catalog\.lifecycle <> 'READY_FOR_ACTIVATION'/);
  assert.match(migration, /'NOT_ENROLLED' else 'ENROLLED'/);
  assert.match(migration, /not_enrolled_count_value := roster_count_value - enrolled_count_value/);
  assert.match(migration, /FUTURE_PARTICIPANT_IDENTITY_OWNER_ENROLLMENT_REQUIRED/);
  assert.match(migration, /authUsersCreated', false/);
  assert.doesNotMatch(migration, /insert\s+into\s+auth\.users/i);
  assert.doesNotMatch(migration, /update\s+auth\.users/i);
});

test("future identity carries only linked verified identities and never clones identifiers or Auth ownership", () => {
  assert.match(migration, /source_identity_tournament_id/);
  assert.match(migration, /1, '2026', source_context\.context_revision/);
  assert.match(migration, /identifier\.identifier_type = 'EMAIL'/);
  assert.match(migration, /identifier\.status = 'VERIFIED'/);
  assert.match(migration, /auth_user\.email_confirmed_at is not null/);
  assert.match(migration, /link\.status = 'ACTIVE'/);
  assert.match(migration, /split_part\(contact\.email_normalized/);
  assert.doesNotMatch(migration, /insert\s+into\s+participant_identity\.user_player_links/i);
  assert.doesNotMatch(migration, /insert\s+into\s+participant_identity\.participant_auth_identifiers/i);
});

test("future participant runtime preserves enumeration-safe email OTP and current DTO shapes", () => {
  assert.match(migration, /authorize_production_future_participant_otp_request_v1/);
  assert.match(migration, /'allowed', reason = 'APPROVED'/);
  assert.match(migration, /'provisioningRequired', false/);
  assert.match(migration, /'email', case when reason = 'APPROVED' then normalized else null end/);
  assert.match(migration, /read_production_future_participant_context_for_auth_v1/);
  assert.match(migration, /jsonb_set\(context_value, '\{data,authUserId\}'/);
  assert.match(migration, /read_production_future_director_entitlement_v1/);
});

test("future identity functions are service-role-only and frozen 2026 functions are not replaced", () => {
  assert.match(migration, /grant execute on function %s to service_role/);
  assert.match(migration, /revoke all on function production_control\.bind_future_participant_identity_runtime_v1/);
  assert.match(migration, /revoke all on function production_control\.assert_future_participant_identity_runtime_v1/);
  for (const frozenName of [
    "authorize_production_participant_otp_request",
    "read_production_participant_context_for_auth",
    "read_production_cutover_director_entitlement",
  ]) {
    assert.doesNotMatch(migration, new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${frozenName}\\(`, "i"));
  }
});
