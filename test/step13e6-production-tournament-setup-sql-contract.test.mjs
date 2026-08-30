import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/production_migrations/202608300063_production_tournament_setup_v1.sql",
  import.meta.url,
);
const sql = await readFile(migrationUrl, "utf8");
const setupOnlySql = sql.slice(0,
  sql.indexOf("-- Preserve the installed Production match-control contract"));

const contains = (pattern, message) => assert.match(sql, pattern, message);

test("migration 063 is additive, inert, RLS-protected, and transport-only", () => {
  assert.ok(sql.startsWith("-- Step 13E.6 Production Tournament Setup V1."));
  contains(/\bbegin;[\s\S]*\bcommit;\s*$/i);
  assert.doesNotMatch(sql, /\bdo\s+\$\$/i, "installation must not execute a bootstrap block");
  assert.doesNotMatch(sql, /\btruncate\b/i);
  assert.doesNotMatch(sql, /\bdrop\s+(?:table|function|schema)\b/i);

  for (const table of [
    "tournament_setup_context_v1",
    "tournament_setup_operational_v1",
    "tournament_setup_team_details_v1",
    "tournament_setup_round_details_v1",
    "tournament_setup_course_tees_v1",
    "tournament_setup_course_holes_v1",
    "tournament_setup_round_courses_v1",
    "tournament_setup_match_details_v1",
    "tournament_setup_operation_receipts_v1",
    "tournament_setup_audit_events_v1",
  ]) {
    contains(new RegExp(`alter table [^;]*${table} enable row level security;`, "i"));
    contains(new RegExp(`revoke all on table [^;]*${table}\\s+from public, anon, authenticated, service_role;`, "i"));
  }
  contains(/revoke all on function public\.read_production_tournament_setup_v1\(jsonb\)[\s\S]*from public, anon, authenticated, service_role;/i);
  contains(/grant execute on function public\.read_production_tournament_setup_v1\(jsonb\)\s+to service_role;/i);
  contains(/grant execute on function public\.mutate_production_tournament_setup_v1\(jsonb\)\s+to service_role;/i);
  contains(/revoke all on function[\s\S]*assert_production_match_scoring_ready_v1\(text\)[\s\S]*from public, anon, authenticated, service_role;/i);
  contains(/grant execute on function public\.mutate_production_match_control\(jsonb\)\s+to service_role;/i);
  assert.doesNotMatch(sql, /grant execute[\s\S]{0,160}\bto\s+(?:anon|authenticated|public)\b/i);
});

test("exact Production Director scope, revision, idempotency, and immutable audit are preserved", () => {
  contains(/assert_player_access_runtime_v1\([\s\S]*production-players-access-v1/i);
  contains(/actor_player text := pg_catalog\.upper\(pg_catalog\.btrim\(coalesce\(\s*input#>>'\{authorization,player_id\}'/i);
  contains(/input \? 'actor_player_id'[\s\S]*is distinct from actor_player/i);
  contains(/actor_auth_user_id'[\s\S]*input#>>'\{authorization,auth_user_id\}'/i);
  contains(/production-tournament-setup-v1/);
  contains(/environment' is distinct from 'PRODUCTION'/i);
  contains(/tournament_id' is distinct from '2026'/i);
  contains(/project_ref|source_workbook_id/i);
  contains(/pg_advisory_xact_lock/);
  contains(/TOURNAMENT_SETUP_REVISION_STALE/);
  contains(/declared_request_payload_hash/);
  contains(/database_request_payload_hash/);
  contains(/TOURNAMENT_SETUP_IDEMPOTENCY_CONFLICT/);
  contains(/tournament_setup_operation_receipts_v1/);
  contains(/tournament_setup_audit_events_v1/);
  contains(/PRODUCTION_TOURNAMENT_SETUP_IMMUTABLE_RECORD/);
});

test("all eight bounded action payloads match the application contract", () => {
  for (const action of [
    "UPDATE_TOURNAMENT",
    "UPDATE_TEAM",
    "ASSIGN_ROSTER_TEAM",
    "UPDATE_ROUND",
    "UPSERT_COURSE",
    "UPSERT_MATCH",
    "REPLACE_PAIRINGS",
    "PREPARE_SCORING_CONTEXT",
  ]) contains(new RegExp(`'${action}'`));

  for (const field of [
    "tournament_name", "destination", "start_date", "end_date", "time_zone",
    "operational_status", "team_id", "team_name", "captain_player_id",
    "player_id", "round_number", "round_name", "format", "team_size",
    "points_available", "handicap_allowance", "course_id", "course_name",
    "city", "state", "tee", "rating", "slope", "par", "holes",
    "match_id", "match_number", "tee_time", "starting_hole", "participants",
    "team_side", "player_slot",
  ]) contains(new RegExp(`'${field}'`));
  contains(/course_id ~ '\^\[A-Za-z0-9\]\[A-Za-z0-9_\.:-\]\{0,95\}\$'/);
});

test("round, course, match, and pairing validation fail closed", () => {
  contains(/target_round not between 1 and 3/);
  contains(/target_format not in \('BB', 'SC', 'SI'\)/);
  contains(/TOURNAMENT_SETUP_ROUND_STARTED_LOCKED/);
  contains(/jsonb_array_length\(holes_input\) <> 18/);
  contains(/count\(distinct \(value->>'stroke_index'\)::integer\)[\s\S]*<> 18/);
  contains(/sum\(\(value->>'par'\)::integer\)[\s\S]*<> target_par/);
  contains(/TOURNAMENT_SETUP_ROUND_DUPLICATE_PLAYER/);
  contains(/TOURNAMENT_SETUP_PAIRING_ACTIVE_TEAM_MEMBERSHIP_REQUIRED/);
  contains(/expected_count := case when match_value\.format = 'SI' then 2 else 4 end/);
  contains(/count\(distinct[\s\S]*team_side[\s\S]*player_slot/);
  contains(/TOURNAMENT_SETUP_PAIRING_APPROVED_HANDICAP_REQUIRED/);
  contains(/TOURNAMENT_SETUP_MATCH_ROUND_COURSE_MISMATCH/);
  contains(/TOURNAMENT_SETUP_EXISTING_MATCH_REQUIRED/);
  assert.doesNotMatch(setupOnlySql,
    /insert into scoring_authority\.matches\b/i,
    "Tournament Setup must not provision a new canonical match");
});

test("structural edits lock started scoring, permissions, leases, and dependent domains", () => {
  contains(/assert_tournament_setup_match_mutable_v1/);
  contains(/handicap_v1_match_is_unstarted/);
  contains(/permission\.can_score or permission\.revoked_at is null[\s\S]*permission_revision[\s\S]*match_value\.permission_revision/);
  contains(/scoring_ingress_leases[\s\S]*expires_at > pg_catalog\.clock_timestamp\(\)/);
  for (const blocker of [
    "STARTED_MATCH_DEPENDENCY",
    "ACTIVE_SCORING_ACCESS_DEPENDENCY",
    "DRAFT_DEPENDENCY",
    "NET_SKINS_CONFIGURATION_DEPENDENCY",
    "NET_SKINS_RESULT_DEPENDENCY",
    "CALCUTTA_AUCTION_DEPENDENCY",
    "CALCUTTA_RESULT_DEPENDENCY",
    "ODDS_PUBLICATION_DEPENDENCY",
  ]) contains(new RegExp(blocker));
});

test("pairing replacement and snapshot preparation never create scoring facts or access", () => {
  contains(/insert into scoring_authority\.scoring_permissions[\s\S]*select target_match,[\s\S]*false,[\s\S]*next_permission_revision/);
  contains(/revoked_at/);
  contains(/handicap_v1_match_context/);
  contains(/select coalesce\(pg_catalog\.max\(snapshot\.snapshot_revision\), 0\) \+ 1/);
  contains(/insert into scoring_authority\.scoring_snapshots/);
  contains(/'handicap_allowance', round_value\.handicap_allowance/);
  contains(/current_snapshot\.scoring_rules_version, match_value\.format,[\s\S]*round_value\.handicap_allowance/);
  contains(/prepared_configuration_fingerprint = preparation_fingerprint/);
  contains(/'scoringPermissionGranted', false/);
  contains(/'scoringMutationCreated', false/);
  assert.doesNotMatch(setupOnlySql,
    /insert into scoring_authority\.(?:hole_scores|score_mutations)\b/i);
  assert.doesNotMatch(setupOnlySql,
    /update scoring_authority\.(?:hole_scores|score_mutations)\b/i);
});

test("current 2026 read projection includes setup readiness, native presentation continuity, and side-game derivation", () => {
  contains(/'availablePlayers'/);
  contains(/'availableCourseIdentities'/);
  contains(/'canAssignTeam'/);
  contains(/'frozenMatchCount'/);
  contains(/'courseName'/);
  contains(/'participantCount'/);
  contains(/'scoredHoles'/);
  contains(/'scoring_ready'/);
  contains(/'scoring_readiness_code'/);
  contains(/'scoring_readiness_reasons'/);
  contains(/'snapshot'[\s\S]*'prepared'[\s\S]*'current'/);
  contains(/insert into scoring_authority\.game_center_presentations/);
  contains(/on conflict \(match_id\) do update set/);
  contains(/update scoring_authority\.game_center_presentations as presentation set[\s\S]*tournament_location[\s\S]*tournament_time_zone[\s\S]*production-tournament-setup-v1/);
  contains(/tournament_setup_readiness_v1/);
  contains(/ROSTER_FORMAT_DIVISIBILITY_INVALID/);
  contains(/PAIRING_ROSTER_TEAM_MISMATCH/);
  contains(/SCORING_CONTEXT_INCOMPLETE/);
  contains(/build_production_net_skins_v1_manifest/);
  contains(/'derivedFromCanonicalSetup', true/);
  contains(/'optional', true, 'blocksTournamentReadiness', false/);
  contains(/'oddsPublished'/);
  contains(/'netSkinsConfigured'/);
  contains(/'calcuttaConfigured'/);
  contains(/'draftPickCount'/);
});

test("MARK_LIVE preserves its contract and fails closed on server scoring readiness", () => {
  contains(/create or replace function production_control\.assert_production_match_scoring_ready_v1\(\s*target_match_id text\s*\)/i);
  contains(/production-match-scoring-readiness-v1/);
  for (const predicate of [
    "ROUND_CONFIGURATION_INVALID",
    "SETUP_SNAPSHOT_STALE",
    "ROUND_COURSE_ASSIGNMENT_INVALID",
    "COURSE_HOLES_INCOMPLETE",
    "PAIRINGS_INCOMPLETE",
    "PAIRING_TEAM_MEMBERSHIP_INVALID",
    "ROUND_DUPLICATE_PLAYER",
    "HANDICAP_CONTEXT_NOT_CURRENT",
    "SCORING_SNAPSHOT_NOT_CURRENT",
    "SCORING_HOLES_NOT_CURRENT",
    "SCORING_PERMISSION_COVERAGE_INVALID",
    "MATCH_ALREADY_HAS_SCORING_ACTIVITY",
    "SCORING_PARTICIPANT_HANDICAPS_STALE",
  ]) contains(new RegExp(predicate));
  contains(/production-access-governance-v1:2026[\s\S]*production-tournament-setup-v1:2026[\s\S]*for update/i);
  contains(/if found then[\s\S]*mutation_row\.payload_hash[\s\S]*idempotent[\s\S]*PRODUCTION_MATCH_NOT_SCORING_READY/i);
  contains(/'code', 'PRODUCTION_MATCH_NOT_SCORING_READY'/);
  contains(/'audit_created', false[\s\S]*'google_outbox_created', false/);
  contains(/insert into scoring_authority\.score_mutations[\s\S]*insert into scoring_authority\.score_revision_history[\s\S]*insert into scoring_authority\.audit_events[\s\S]*insert into scoring_authority\.google_outbox_events/);
  contains(/detail_value\.match_id is null[\s\S]*CERTIFIED_CANONICAL_SNAPSHOT/);
  contains(/detail_value\.match_id is not null and not \([\s\S]*permission\.can_score[\s\S]*permission\.revoked_at/);
});

test("membership team changes invalidate only affected unstarted setup snapshots", () => {
  contains(/update scoring_authority\.tournament_setup_match_details_v1 detail set[\s\S]*prepared_setup_revision = null[\s\S]*participant\.player_id = target_player[\s\S]*match_value\.status = 'UPCOMING'/i);
  contains(/'invalidatedMatchCount', invalidated_match_count/);
});
