import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/production_migrations/202608290058_production_handicap_revisions_v1.sql",
  import.meta.url,
);

const loadSql = () => readFile(migrationUrl, "utf8");

const functionBody = (sql, name, nextName) => {
  const start = sql.indexOf(`create or replace function ${name}`);
  assert.notEqual(start, -1, `${name} is installed`);
  const end = nextName
    ? sql.indexOf(`create or replace function ${nextName}`, start + 1)
    : sql.length;
  assert.notEqual(end, -1, `${nextName} follows ${name}`);
  return sql.slice(start, end);
};

test("migration 058 adds an exact, tournament-scoped revision and immutable evidence authority", async () => {
  const sql = await loadSql();

  assert.match(sql, /^begin;[\s\S]*commit;\s*$/m);
  assert.match(sql, /alter table scoring_authority\.tournament_players[\s\S]*add column tournament_handicap numeric,[\s\S]*add column handicap_revision_id uuid/);
  assert.doesNotMatch(sql, /tournament_handicap\s+numeric\s*\(/i);
  for (const table of [
    "handicap_revisions",
    "handicap_revision_entries",
    "handicap_revision_current",
    "handicap_operation_receipts",
    "handicap_audit_events",
    "handicap_match_refresh_events",
  ]) {
    assert.match(sql, new RegExp(`create table scoring_authority\\.${table} \\(`));
    assert.match(sql, new RegExp(`alter table scoring_authority\\.${table} enable row level security`));
  }
  assert.match(sql, /create unique index production_handicap_one_approved_revision[\s\S]*where status = 'APPROVED'/);
  assert.match(sql, /receipt_id uuid not null default extensions\.gen_random_uuid\(\) unique/);
  for (const immutable of [
    "handicap_revision_entries_immutable",
    "handicap_operation_receipts_immutable",
    "handicap_audit_events_immutable",
    "handicap_match_refresh_events_immutable",
  ]) assert.match(sql, new RegExp(`create trigger ${immutable}`));
});

test("stage validates the complete active roster and uses normalized payload-sensitive idempotency", async () => {
  const sql = await loadSql();
  const stage = functionBody(
    sql,
    "public.stage_production_handicap_revision_v1",
    "public.validate_production_handicap_revision_v1",
  );

  assert.match(stage, /assert_exact_cutover_resource_scope\(input, false\)/);
  assert.match(stage, /assert_production_scoring_actor\(input, true\)/);
  assert.match(stage, /assert_production_handicap_runtime\(\)/);
  assert.match(stage, /handicap_v1_json_decimal\([\s\S]*tournament_handicap/);
  assert.match(stage, /pg_catalog\.trim_scale\([\s\S]*::numeric/);
  assert.match(stage, /order by item\.value->>'player_id'/);
  for (const code of [
    "HANDICAP_ENTRY_NUMERIC_INVALID",
    "HANDICAP_DUPLICATE_PLAYER_ID",
    "HANDICAP_UNKNOWN_PLAYER_ID",
    "HANDICAP_INCOMPLETE_ACTIVE_ROSTER",
    "HANDICAP_PREDECESSOR_STALE",
    "HANDICAP_IDEMPOTENCY_CONFLICT",
  ]) assert.match(stage, new RegExp(code));
  assert.match(stage, /receipt\.declared_request_payload_hash = declared_hash[\s\S]*receipt\.request_payload_hash = database_request_hash/);
  assert.match(stage, /pg_advisory_xact_lock/);

  const decimal = functionBody(
    sql,
    "production_control.handicap_v1_json_decimal",
    "production_control.handicap_v1_roster_fingerprint",
  );
  assert.match(decimal, /jsonb_typeof\(value\) = 'number'/);
  assert.match(decimal, /jsonb_typeof\(value\) = 'string'/);
  assert.match(decimal, /\^-\?\(0\|\[1-9\]\[0-9\]\*\)\(\\\.\[0-9\]\+\)\?\$/);
});

test("validation blocks no-op, stale, changed-roster, and incomplete-context approvals", async () => {
  const sql = await loadSql();
  const validation = functionBody(
    sql,
    "production_control.validate_handicap_revision_v1",
  );

  for (const code of [
    "HANDICAP_NO_CHANGES",
    "HANDICAP_PREDECESSOR_STALE",
    "HANDICAP_ROSTER_CHANGED",
    "HANDICAP_REVISION_FINGERPRINT_MISMATCH",
    "HANDICAP_MATCH_CONTEXT_INCOMPLETE",
  ]) assert.match(validation, new RegExp(code));
  assert.match(validation, /changed_count = 0/);
  assert.match(validation, /snapshot\.rating is null/);
  assert.match(validation, /snapshot\.slope <= 0/);
  assert.match(validation, /match_value\.format not in \('BB', 'SC', 'SI'\)/);
  assert.match(validation, /started_frozen_matches/);
});

test("certified BB, SC, and SI formulas keep course handicap exact and playing/final fields distinct", async () => {
  const sql = await loadSql();
  const context = functionBody(
    sql,
    "production_control.handicap_v1_match_context",
    "production_control.validate_handicap_revision_v1",
  );

  assert.match(context, /entry\.tournament_handicap\s*\* \(snapshot_value\.slope::numeric \/ 113::numeric\)\s*\+ \(snapshot_value\.rating - snapshot_value\.par::numeric\)/);
  assert.match(context, /when 'SC' then 0::numeric\s*else pg_catalog\.round\(course\.course_handicap, 0\)/);
  assert.match(context, /when 'BB' then pg_catalog\.round\([\s\S]*pg_catalog\.min\(course\.course_handicap\) over \(\)[\s\S]*\* 0\.9/);
  assert.match(context, /when 'SI' then pg_catalog\.round\([\s\S]*course\.course_handicap[\s\S]*pg_catalog\.min\(course\.course_handicap\) over \(\)/);
  assert.match(context, /pg_catalog\.min\(\(value->>'course_handicap'\)::numeric\) \* 0\.35[\s\S]*pg_catalog\.max\(\(value->>'course_handicap'\)::numeric\) \* 0\.15/);
  assert.match(context, /'playing_handicap', calculated\.playing_handicap/);
  assert.match(context, /'final_strokes', calculated\.final_strokes/);
  assert.doesNotMatch(context, /course_handicap\s*:=?\s*pg_catalog\.round/i);
});

test("approval refreshes only strictly unstarted Supabase snapshots and mirrors the established roster JSON field", async () => {
  const sql = await loadSql();
  const safe = functionBody(
    sql,
    "production_control.handicap_v1_match_is_unstarted",
    "production_control.handicap_v1_stored_entries",
  );
  const approve = functionBody(
    sql,
    "public.approve_production_handicap_revision_v1",
    "public.read_production_handicap_revision_v1",
  );

  for (const predicate of [
    "status = 'UPCOMING'",
    "scoring_locked is false",
    "scored_holes = 0",
    "current_hole = 0",
    "holes_remaining = 18",
    "team_1_holes_won = 0",
    "team_2_holes_won = 0",
    "running_result = 'Scheduled'",
    "result_winner = ''",
    "clinched is false",
    "scorecard_complete is false",
    "unresolved_mutations = 0",
    "finalized_at is null",
  ]) assert.match(safe, new RegExp(predicate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(safe, /not exists \([\s\S]*scoring_authority\.hole_scores/);
  assert.match(safe, /not exists \([\s\S]*scoring_authority\.score_mutations/);

  assert.match(approve, /validation_value->'unstarted_matches'/);
  assert.match(approve, /HANDICAP_MATCH_BECAME_FROZEN/);
  assert.match(approve, /input#>>'\{confirmation,effective_date\}'/);
  assert.match(approve, /input#>>'\{confirmation,changed_player_count\}'/);
  assert.match(approve, /input#>>'\{confirmation,affected_match_count\}'/);
  assert.match(approve, /input#>>'\{confirmation,unstarted_refresh_count\}'/);
  assert.match(approve, /input#>>'\{confirmation,started_preserved_count\}'/);
  assert.match(approve, /HANDICAP_APPROVAL_CONFIRMATION_MISMATCH/);
  assert.match(approve, /'confirmation', pg_catalog\.jsonb_build_object\(/);
  assert.match(approve, /set snapshot_revision = next_snapshot_revision/);
  assert.match(approve, /participant_configuration =\s*context_value->'participant_configuration'/);
  assert.match(approve, /source_payload = pg_catalog\.jsonb_set\([\s\S]*array\['Tournament Handicap'\]::text\[][\s\S]*pg_catalog\.to_jsonb\(entry\.tournament_handicap\)/);
  assert.doesNotMatch(approve, /update scoring_authority\.matches/);
  assert.doesNotMatch(approve, /update scoring_authority\.(hole_scores|score_mutations)/);
  assert.doesNotMatch(approve, /google_outbox|google_write|http|net\./i);
});

test("read and history RPCs return decimal text, impact counts, receipts, and service-role-only access", async () => {
  const sql = await loadSql();
  const read = functionBody(
    sql,
    "public.read_production_handicap_revision_v1",
    "public.read_production_handicap_revision_history_v1",
  );
  const history = functionBody(
    sql,
    "public.read_production_handicap_revision_history_v1",
    "production_control.handicap_v1_hash",
  );

  assert.match(read, /'tournament_handicap', roster\.tournament_handicap::text/);
  assert.match(read, /'source_index', entry\.source_index::text/);
  assert.match(read, /'low_index', entry\.low_index::text/);
  assert.match(read, /'snapshot_action'[\s\S]*'PRESERVE_FROZEN'/);
  assert.match(history, /'tournament_handicap', entry\.tournament_handicap::text/);
  assert.match(history, /'changed_player_count'/);
  assert.match(history, /'affected_match_count'/);
  assert.match(history, /'receipt_id', receipt\.receipt_id/);
  assert.match(history, /'operation_request_id', receipt\.operation_request_id/);
  assert.match(sql, /'receipt', pg_catalog\.jsonb_build_object\([\s\S]*'request_payload_hash', declared_hash/);

  for (const rpc of [
    "stage_production_handicap_revision_v1",
    "validate_production_handicap_revision_v1",
    "approve_production_handicap_revision_v1",
    "read_production_handicap_revision_v1",
    "read_production_handicap_revision_history_v1",
  ]) {
    assert.match(sql, new RegExp(`grant execute on function\\s+public\\.${rpc}\\(jsonb\\) to service_role`));
  }
});
