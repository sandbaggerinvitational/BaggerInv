import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/production_migrations/202608300064_production_future_year_administration_v1.sql",
  import.meta.url,
);
const sql = await readFile(migrationUrl, "utf8");
const contains = (pattern, message) => assert.match(sql, pattern, message);
const roleGuardMigrationUrl = new URL(
  "../supabase/production_migrations/202608300065_production_future_year_runtime_role_guard.sql",
  import.meta.url,
);
const roleGuardSql = await readFile(roleGuardMigrationUrl, "utf8");

test("migration 064 is additive, inert, and preserves the represented 2026 current state", () => {
  assert.ok(sql.startsWith("-- Step 13E.7 Production Future-Year Administration V1."));
  assert.equal((sql.match(/\bbegin;/gi) ?? []).length, 1);
  assert.equal((sql.match(/\bcommit;/gi) ?? []).length, 1);
  assert.doesNotMatch(sql, /\btruncate\b/i);
  assert.doesNotMatch(sql, /\bdrop\s+(?:table|schema|function)\b/i);
  assert.doesNotMatch(sql, /['"]2027['"]/i,
    "installation must not create a Production 2027 fixture");
  contains(/'2026', 2026, 1, 1/);
  contains(/'ACTIVE', 1, 0, 'EXISTING'/);
  contains(/'representationOnly', true/);
  assert.doesNotMatch(sql, /insert into scoring_authority\.(?:matches|scoring_snapshots|scoring_permissions|hole_scores|score_mutations)\b/i);
});

test("annual catalog, lifecycle, pointer, staging, receipts, and audit are explicit", () => {
  for (const table of [
    "future_tournament_catalog_v1",
    "current_tournament_pointer_v1",
    "future_tournament_resources_v1",
    "future_tournament_teams_v1",
    "future_tournament_roster_v1",
    "future_tournament_rounds_v1",
    "future_tournament_course_references_v1",
    "future_match_definitions_v1",
    "future_match_google_compatibility_jobs_v1",
    "future_year_operation_receipts_v1",
    "future_year_audit_events_v1",
  ]) {
    contains(new RegExp(`create table production_control\\.${table}`));
    contains(new RegExp(`alter table [^;]*${table}\\s+enable row level security;`, "i"));
    contains(new RegExp(`revoke all on table\\s+[^;]*${table}[^;]*from public, anon, authenticated, service_role;`, "i"));
  }
  for (const lifecycle of [
    "DRAFT", "CONFIGURING", "READY_FOR_ACTIVATION", "ACTIVE",
    "CLOSED", "ARCHIVED",
  ]) contains(new RegExp(`'${lifecycle}'`));
  contains(/create unique index production_future_tournament_single_active_v1[\s\S]*where lifecycle = 'ACTIVE'/i);
  contains(/pointer_revision bigint not null check \(pointer_revision > 0\)/i);
  contains(/PRODUCTION_FUTURE_YEAR_IMMUTABLE_RECORD/);
});

test("transport is service-role-only, exact Production-scoped, Director-based, and Owner-bounded", () => {
  contains(/create or replace function public\.read_production_future_year_administration_v1\(\s*input jsonb/i);
  contains(/create or replace function public\.mutate_production_future_year_administration_v1\(\s*input jsonb/i);
  contains(/current_setting\('request\.jwt\.claim\.role', true\)[\s\S]*service_role/i);
  contains(/production-future-year-administration-v1/);
  contains(/environment'[\s\S]*PRODUCTION/);
  contains(/tournament_id'[\s\S]*2026/);
  contains(/project_ref'[\s\S]*scope\.project_ref/);
  contains(/source_workbook_id'[\s\S]*scope\.google_workbook_id/);
  contains(/assert_player_access_runtime_v1/);
  contains(/action_value in \('CREATE_TOURNAMENT', 'MARK_READY'\)/);
  contains(/assert_access_governance_owner_v1/);
  contains(/FUTURE_TOURNAMENT_OWNER_REQUIRED/);
  contains(/grant execute on function[\s\S]*read_production_future_year_administration_v1\(jsonb\)[\s\S]*to service_role;/i);
  contains(/grant execute on function[\s\S]*mutate_production_future_year_administration_v1\(jsonb\)[\s\S]*to service_role;/i);
  assert.doesNotMatch(sql, /grant execute[\s\S]{0,160}\bto\s+(?:anon|authenticated|public)\b/i);
});

test("migration 065 accepts the PostgREST JSON service-role claim without weakening the guard", () => {
  assert.ok(roleGuardSql.startsWith(
    "-- Step 13E.7 Production Future-Year Administration V1 runtime role guard.",
  ));
  assert.equal((roleGuardSql.match(/\bbegin;/gi) ?? []).length, 1);
  assert.equal((roleGuardSql.match(/\bcommit;/gi) ?? []).length, 1);
  assert.match(roleGuardSql,
    /perform production_control\.assert_production_service_role\(\);/i);
  assert.match(roleGuardSql,
    /when insufficient_privilege or invalid_text_representation[\s\S]*message = 'PRODUCTION_FUTURE_YEAR_SCOPE_REQUIRED'/i);
  assert.match(roleGuardSql,
    /create or replace function production_control\.assert_future_year_runtime_v1/i);
  assert.match(roleGuardSql,
    /revoke all on function[\s\S]*assert_future_year_runtime_v1\(jsonb, boolean\)[\s\S]*from public, anon, authenticated, service_role;/i);
  assert.doesNotMatch(roleGuardSql, /\bgrant\b/i,
    "the correction must not broaden execute access");
  assert.doesNotMatch(roleGuardSql, /\b(?:insert|update|delete|truncate)\b/i,
    "the correction must be inert");
});

test("bounded action contract supports only safe Draft structure operations", () => {
  for (const action of [
    "CREATE_TOURNAMENT", "UPDATE_TOURNAMENT", "CONFIGURE_TEAM",
    "REPLACE_ROSTER", "CONFIGURE_ROUND", "ASSIGN_COURSE",
    "GENERATE_MATCH_STRUCTURE", "MARK_READY",
  ]) contains(new RegExp(`'${action}'`));
  contains(/creation_mode[\s\S]*'BLANK'[\s\S]*'CLONE_STRUCTURE'/i);
  contains(/allowlistedDomains/);
  contains(/forbiddenFactsCopied', false/);
  contains(/membershipCopied', false/);
  contains(/identityCopied', false/);
  contains(/authUsersCreated', false/);
  contains(/runtimeMatchesCreated', false/);
  contains(/snapshotsCreated', false/);
  contains(/scoringAccessCreated', false/);
  contains(/googleWriterInvoked', false/);
});

test("future match generation is deterministic structural metadata with downstream blockers only", () => {
  contains(/target_id \|\| '-R' \|\| target_round::text \|\| '-' \|\| sequence::text/);
  contains(/future_match_definitions_v1/);
  contains(/has_runtime_match boolean not null default false check/);
  contains(/has_scoring_snapshot boolean not null default false check/);
  contains(/has_scoring_access boolean not null default false check/);
  contains(/future_match_google_compatibility_jobs_v1/);
  contains(/'PROVISIONING_REQUIRED'/);
  contains(/writer_installed boolean not null default false/);
  contains(/GOOGLE_COMPATIBILITY_PROVISIONING_REQUIRED/);
  assert.doesNotMatch(sql, /googleapis|sheets\.google|gviz/i);
});

test("course reuse requires an exact existing certified tee and complete hole context", () => {
  contains(/tournament_setup_course_tees_v1/);
  contains(/tournament_setup_course_holes_v1/);
  contains(/hole\.course_id = target_course and hole\.tee_id = target_tee[\s\S]*<> 18/i);
  contains(/FUTURE_EXISTING_COURSE_TEE_REQUIRED/);
  contains(/'assignable', true/);
  assert.doesNotMatch(sql, /insert into scoring_authority\.completed_history_course_identities/i);
});

test("team, roster, round, revision, idempotency, and isolation guards fail closed", () => {
  contains(/FUTURE_TEAM_SIDE_IMMUTABLE/);
  contains(/team_side integer not null check \(team_side in \(1, 2\)\)/);
  contains(/roster\.team_id = target_team[\s\S]*roster\.team_side = target_side/);
  contains(/FUTURE_ROSTER_TEAM_INVALID/);
  contains(/format in \('BB', 'SC'\) and team_size = 2/);
  contains(/format = 'SI' and team_size = 1/);
  contains(/FUTURE_ROUND_MATCH_STRUCTURE_LOCKED/);
  contains(/match_value\.team_size is distinct from round_value\.team_size/);
  contains(/FUTURE_TOURNAMENT_REVISION_STALE/);
  contains(/PRODUCTION_FUTURE_YEAR_IDEMPOTENCY_CONFLICT/);
  contains(/pg_advisory_xact_lock/);
  contains(/target_id = '2026'[\s\S]*FUTURE_TOURNAMENT_STRUCTURE_LOCKED/);
});

test("read projection exposes safe selectors, sanitized audit, readiness, and explicit missing capabilities", () => {
  for (const field of [
    "currentTournament", "selectedTournament", "catalog", "teams", "roster",
    "rounds", "courseAssignments", "matchDefinitions", "compatibilityJobs",
    "playerCatalog", "courseLibrary", "audit", "readiness", "activationPlan",
    "capabilities",
  ]) contains(new RegExp(`'${field}'`));
  contains(/'globalStatus'/);
  contains(/'createTournament', actor_is_owner/);
  contains(/'summary', audit\.safe_metadata->>'summary'/);
  assert.doesNotMatch(sql, /authUuid|email|phone|service_role_key/i);
  for (const code of [
    "FUTURE_TOURNAMENT_ACTIVATION_NOT_INSTALLED",
    "FUTURE_TOURNAMENT_CLOSE_NOT_INSTALLED",
    "FUTURE_TOURNAMENT_ARCHIVE_NOT_INSTALLED",
    "GLOBAL_COURSE_CREATION_NOT_INSTALLED",
    "FUTURE_HANDICAP_REVISION_REQUIRED",
    "FUTURE_PAIRINGS_AND_SCORING_PREPARATION_REQUIRED",
  ]) contains(new RegExp(code));
  contains(/'activateTournament', false/);
  contains(/'closeTournament', false/);
  contains(/'archiveTournament', false/);
  contains(/'runtimeMatchCreation', false/);
  contains(/'googleCompatibilityWriter', false/);
});
