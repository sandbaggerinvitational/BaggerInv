import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repairMigration = "supabase/migrations/202608200003_preview_participant_auth_phone_link_invariant.sql";
const foundationMigration = "supabase/migrations/202608190001_preview_participant_auth_identifiers.sql";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Director mobile read model treats blank Supabase Auth phone sentinels as unset", async () => {
  const migration = await source(repairMigration);
  assert.match(migration, /nullif\(btrim\(coalesce\(expected_user\.phone, ''\)\), ''\) is not null/);
  assert.match(migration, /nullif\(btrim\(coalesce\(expected_user\.phone_change, ''\)\), ''\) is not null/);
  assert.match(migration, /when current_phone\.status = 'VERIFIED'/);
  assert.match(migration, /then 'AUTH_USER_MISMATCH'/);
  assert.doesNotMatch(migration, /when current_phone\.identifier_id is not null then 'NONE'/);
});

test("current phone identifiers are database-guarded by active link and matching email ownership", async () => {
  const migration = await source(repairMigration);
  assert.match(migration, /create or replace function participant_identity\.enforce_current_phone_auth_link/);
  assert.match(migration, /new\.identifier_type <> 'PHONE'/);
  assert.match(migration, /new\.status not in \('ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED'\)/);
  assert.match(migration, /link\.player_id = new\.player_id/);
  assert.match(migration, /link\.status = 'ACTIVE'/);
  assert.match(migration, /new\.auth_user_id <> canonical_auth_user_id/);
  assert.match(migration, /email_identifier\.auth_user_id = canonical_auth_user_id/);
  assert.match(migration, /before insert or update of player_id, auth_user_id, identifier_type, status/);
  assert.match(migration, /execute function participant_identity\.enforce_current_phone_auth_link/);
});

test("migration fails closed rather than hiding any pre-existing mismatched phone", async () => {
  const migration = await source(repairMigration);
  assert.match(migration, /Existing data must already satisfy the invariant/);
  assert.match(migration, /phone_identifier\.auth_user_id <> link\.auth_user_id/);
  assert.match(migration, /email_identifier\.identifier_id is null/);
  assert.match(migration, /raise exception 'Participant Auth mobile ownership has % active Auth-link mismatch\(es\)\.'/);
});

test("Add and Change Mobile derive Auth ownership server-side from the canonical active link", async () => {
  const foundation = await source(foundationMigration);
  const route = await source("app/api/director/participant-identity/route.js");
  assert.match(foundation, /select \* into link_row[\s\S]*where player_id = target_player and status = 'ACTIVE'[\s\S]*for update/);
  assert.match(foundation, /target_player, link_row\.auth_user_id, 'PHONE', target_phone, 'ELIGIBLE'/);
  assert.match(foundation, /if current_phone\.auth_user_id <> link_row\.auth_user_id then/);
  assert.match(foundation, /'PHONE_AUTH_SETUP_REQUIRED'/);
  const phoneBranch = route.slice(route.indexOf("if (PHONE_ACTIONS.has(action))"), route.indexOf('if (action === "initialize-source")'));
  assert.doesNotMatch(phoneBranch, /input\.(?:authUserId|auth_user_id)|input\[['"]auth_user_id['"]\]/i);
  assert.match(phoneBranch, /playerId/);
});

test("privacy-safe alignment diagnostics expose equality only and remain service-only", async () => {
  const migration = await source(repairMigration);
  const diagnostic = migration.slice(migration.indexOf("create or replace function public.inspect_participant_auth_phone_link_alignment"));
  assert.match(diagnostic, /'linkAuthLabel'/);
  assert.match(diagnostic, /'emailAuthUserMatch'/);
  assert.match(diagnostic, /'phoneAuthUserMatch'/);
  assert.match(diagnostic, /'expectedAuthPhoneState'/);
  assert.match(diagnostic, /revoke all on function public\.inspect_participant_auth_phone_link_alignment\(text\)[\s\S]*from public, anon, authenticated/);
  assert.match(diagnostic, /grant execute on function public\.inspect_participant_auth_phone_link_alignment\(text\)[\s\S]*to service_role/);
  assert.doesNotMatch(diagnostic, /'phoneE164'|'email'\s*,|'authUserId'\s*,/);
});

test("8B.1B performs no Auth phone mutation, SMS, or provider integration", async () => {
  const migration = await source(repairMigration);
  assert.doesNotMatch(migration, /^\s*(?:update\s+auth\.users|insert\s+into\s+auth\.users|delete\s+from\s+auth\.users)/im);
  assert.doesNotMatch(migration, /twilio|signInWithOtp|verifyOtp|sendSms|phone provider/i);
  const login = await source("app/participant-auth/ParticipantAuthRehearsal.js");
  assert.doesNotMatch(login, /Text Me a Code|Mobile Number|type="tel"/);
});
