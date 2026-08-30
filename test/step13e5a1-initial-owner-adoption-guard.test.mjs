import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const migrationPath = path.join(
  repositoryRoot,
  "supabase/production_migrations/202608300062_initial_owner_adoption_guard_correction.sql",
);

test("migration 062 isolates the database-owner bootstrap resource assertion", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /^-- Step 13E\.5A\.1/m);
  assert.match(sql, /begin;[\s\S]*commit;/);
  assert.match(sql, /create or replace function\s+production_control\.assert_initial_owner_adoption_resource_scope_v1\([\s\S]*security definer[\s\S]*set search_path = pg_catalog, production_control/);
  assert.match(sql, /pg_has_role\([\s\S]*session_user, database_owner, 'member'/);
  assert.match(sql, /or claim_role is not null then[\s\S]*ACCESS_GOVERNANCE_DATABASE_OWNER_SESSION_REQUIRED/);
  assert.match(sql, /production-access-governance-v1/);
  assert.match(sql, /INITIAL_OWNER_ADOPTION/);

  for (const exactValue of [
    "BAGGER_INV_PRODUCTION",
    "ymqhhtxaywtqllynrmxe",
    "https://ymqhhtxaywtqllynrmxe.supabase.co",
    "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4",
    "bagger-inv",
    "https://baggerinv.com",
  ]) assert.ok(sql.includes(exactValue), `${exactValue} must remain exact`);
  assert.match(sql, /current_tournament_id <> '2026'/);
  assert.match(sql, /current_tournament_year <> 2026/);
  assert.match(sql, /tournament\.tournament_id = '2026'[\s\S]*tournament\.tournament_year = 2026/);
  assert.match(sql, /PRODUCTION_RESOURCE_SCOPE_INVALID/);
  assert.match(sql, /PRODUCTION_RESOURCE_ASSERTION_FAILED/);

  assert.match(sql, /create or replace function public\.adopt_initial_production_owner_v1\(input jsonb\)[\s\S]*production_control\.assert_initial_owner_adoption_resource_scope_v1\(input\)/);
  assert.doesNotMatch(
    sql,
    /perform production_control\.assert_exact_cutover_resource_scope\(input, false\)/,
  );
  assert.doesNotMatch(
    sql,
    /create or replace function production_control\.assert_production_service_role/,
  );
  assert.doesNotMatch(
    sql,
    /create or replace function production_control\.assert_exact_cutover_resource_scope/,
  );

  assert.match(sql, /ACCESS_GOVERNANCE_OWNER_ALREADY_ADOPTED/);
  assert.match(sql, /ACCESS_GOVERNANCE_REVISION_STALE/);
  assert.match(sql, /ACCESS_GOVERNANCE_OWNER_IDENTITY_NOT_READY/);
  assert.match(sql, /ACCESS_GOVERNANCE_ACTIVE_DIRECTOR_REQUIRED/);
  assert.match(sql, /ACCESS_GOVERNANCE_IDEMPOTENCY_CONFLICT/);
  assert.match(sql, /access_governance_operation_receipts_v1/);
  assert.match(sql, /access_governance_audit_events_v1/);

  assert.match(sql, /revoke all on function\s+production_control\.assert_initial_owner_adoption_resource_scope_v1\(jsonb\)[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(sql, /revoke all on function public\.adopt_initial_production_owner_v1\(jsonb\)[\s\S]*from public, anon, authenticated, service_role/);
  assert.doesNotMatch(sql, /grant execute on function/i);
  assert.doesNotMatch(sql, /select\s+public\.adopt_initial_production_owner_v1/i);
  assert.doesNotMatch(sql, /perform\s+public\.adopt_initial_production_owner_v1/i);
});
