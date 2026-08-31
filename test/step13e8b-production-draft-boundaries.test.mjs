import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = path.join(root, "supabase", "production_migrations",
  "202608310081_production_draft_authoring_v1.sql");
const sql = await readFile(migrationPath, "utf8");

function body(name) {
  const marker = `create function ${name}`;
  const start = sql.indexOf(marker);
  assert.notEqual(start, -1, `${name} must be installed`);
  const next = sql.indexOf("\ncreate ", start + marker.length);
  return sql.slice(start, next === -1 ? sql.length : next);
}

test("migration 081 is additive, inert, and installs the bounded RPC surface", () => {
  assert.match(sql, /^-- Step 13E\.8B/m);
  assert.match(sql, /\nbegin;\s/);
  assert.match(sql, /\ncommit;\s*$/);
  for (const name of [
    "public.read_production_draft_authoring_v1(input jsonb)",
    "public.read_production_draft_view_v1(input jsonb)",
    "public.stage_production_draft_revision_v1(input jsonb)",
    "public.validate_production_draft_revision_v1(input jsonb)",
    "public.commit_production_draft_revision_v1(input jsonb)",
    "public.copy_production_draft_setup_v1(input jsonb)",
  ]) {
    const value = body(name);
    assert.match(value, /security definer/i);
    assert.match(value, /set search_path = pg_catalog/i);
  }
  assert.doesNotMatch(sql.slice(0, sql.indexOf("create function")),
    /insert into scoring_authority\.draft_(?:revisions|current_revisions|pick_facts|configuration_facts)/i);
  assert.doesNotMatch(sql.slice(0, sql.indexOf("create function")),
    /update scoring_authority\.draft_current_revisions/i);
});

test("Draft authoring tables are RLS-closed and only server RPCs are granted", () => {
  for (const table of [
    "draft_authoring_drafts_v1", "draft_revision_provenance_v1",
    "draft_operation_receipts_v1", "draft_authoring_audit_events_v1",
  ]) {
    assert.match(sql, new RegExp(`alter table production_control\\.${table}\\s+enable row level security`, "i"));
  }
  assert.match(sql, /revoke all on table[\s\S]*draft_authoring_drafts_v1[\s\S]*from public, anon, authenticated, service_role/i);
  assert.match(sql, /grant execute on function[\s\S]*read_production_draft_authoring_v1[\s\S]*copy_production_draft_setup_v1[\s\S]*to service_role/i);
  assert.doesNotMatch(sql, /grant\s+(?:select|insert|update|delete|all)[\s\S]{0,180}draft_authoring_(?:drafts|audit_events)_v1/i);
  assert.match(sql, /production_draft_provenance_immutable_v1/);
  assert.match(sql, /production_draft_receipt_immutable_v1/);
  assert.match(sql, /production_draft_audit_immutable_v1/);
});

test("validation preserves the certified Draft rules without trusting browser structure", () => {
  const value = body("production_control.validate_draft_authoring_v1(");
  assert.match(value, /team_one = team_two/);
  assert.match(value, /DRAFT_TOTAL_PICKS_INVALID/);
  assert.match(value, /DRAFT_DATE_INVALID/);
  assert.match(value, /DRAFT_TIME_INVALID/);
  assert.match(value, /DRAFT_TIME_ZONE_INVALID/);
  assert.match(value, /DRAFT_PICK_NUMBER_DUPLICATE/);
  assert.match(value, /DRAFT_PLAYER_DUPLICATE/);
  assert.match(value, /DRAFT_CAPTAIN_PICK_PROHIBITED/);
  assert.match(value, /participation_status = 'ACTIVE'/);
  assert.match(value, /value\.player_id = captain_one\s+and value\.participation_status = 'ACTIVE'/);
  assert.match(value, /value\.player_id = captain_two\s+and value\.participation_status = 'ACTIVE'/);
  assert.match(value, /value\.team_id = team_one/);
  assert.match(value, /value\.team_id = team_two/);
  assert.match(value, /value\.player_id = player_value and value\.team_id = team_value/);
  assert.match(value, /round_value := \(\(pick_value - 1\) \/ 2\) \+ 1/);
  assert.match(value, /within_value := pg_catalog\.mod\(pick_value - 1, 2\) \+ 1/);
  assert.match(value, /source_team_value := team_value/);
  assert.match(value, /DRAFT_SNAKE_TEAM_MISMATCH/);
  assert.doesNotMatch(value, /proposed_picks[\s\S]*->>'round_number'\)::integer/);
});

test("new revisions preserve canonical team presentation and emit bounded Draft events", () => {
  const team = body("production_control.draft_team_presentation_v1(");
  assert.match(team, /pg_catalog\.avg\(membership\.tournament_handicap\)/);
  assert.match(team, /pg_catalog\.count\(membership\.tournament_handicap\) =\s+pg_catalog\.count\(\*\)/);
  assert.match(team, /'\\\.\(png\|jpe\?g\|webp\|avif\)\$'/);
  const commit = body("public.commit_production_draft_revision_v1(input jsonb)");
  assert.match(commit, /'PICK_RECORDED'/);
  assert.match(commit, /'PICK_CORRECTED'/);
  assert.match(commit, /'DRAFT_COMPLETED'/);
  assert.doesNotMatch(commit, /previousPlayerId|previousTeamId/);
  const audit = body("production_control.director_private_audit_with_draft_v1()");
  for (const action of ["PICK_RECORDED", "PICK_CORRECTED", "DRAFT_COMPLETED", "PREVIOUS_SETUP_COPIED"]) {
    assert.match(audit, new RegExp(`when '${action}'`));
  }
});

test("completed history, optimistic revisions, and idempotency stay protected", () => {
  assert.match(sql, /DRAFT_CORRECTION_REQUIRED/g);
  assert.match(sql, /DRAFT_PREDECESSOR_STALE/g);
  assert.match(sql, /DRAFT_IDEMPOTENCY_CONFLICT/);
  assert.match(sql, /declared_request_payload_hash text not null/);
  assert.match(sql, /request_payload_hash text not null/);
  assert.match(sql, /operation_request_id uuid not null/);
  assert.match(body("public.commit_production_draft_revision_v1(input jsonb)"),
    /SAVE DRAFT REVISION/);
});

test("future clone is setup-only and public reads cannot reveal staged future years", () => {
  const copy = body("public.copy_production_draft_setup_v1(input jsonb)");
  assert.match(copy, /'status_mode','Automatic'/);
  assert.match(copy, /'player_id',''/);
  assert.match(copy, /'selected_at',''/);
  assert.match(copy, /'selected_by',''/);
  assert.match(copy, /'selectedPlayersCopied',false/);
  assert.match(copy, /'madeCurrent',false/);
  const read = body("public.read_production_draft_view_v1(input jsonb)");
  assert.match(read, /assert_frozen_2026_current_read_v1\(\)/);
  assert.match(read, /assert_annual_current_read_v1\(input\)/);
  assert.match(read, /pg_advisory_xact_lock_shared/);
  assert.match(read, /current_value\.tournament_year<=pointer\.tournament_year/);
  assert.match(body("public.read_production_draft_authoring_v1(input jsonb)"),
    /'targets',targets_value/);
  assert.match(body("public.read_production_draft_authoring_v1(input jsonb)"),
    /'dependencyReadiness'/);
  assert.match(sql, /DRAFT_SELECTED_PLAYER_INACTIVE_OR_MISSING/);
  assert.match(sql, /DRAFT_SELECTED_PLAYER_TEAM_CONFLICT/);
});

test("Google Draft authoring is retired while Guide remains delegated", () => {
  assert.match(sql, /DRAFT_GOOGLE_AUTHORING_RETIRED/g);
  assert.match(sql, /sync_prod_director_projection_before_draft_retirement_v1/);
  assert.match(sql, /sync_prod_future_projection_before_draft_retirement_v1/);
  assert.match(sql, /revoke all on function public\.import_production_draft_projection/);
  assert.doesNotMatch(sql, /GUIDE_GOOGLE_AUTHORING_RETIRED/);
});

test("sanitized Draft audit reaches the bounded Director operations feed", () => {
  const audit = body("production_control.director_private_audit_with_draft_v1()");
  assert.match(audit, /'DRAFT'::text category/);
  assert.match(audit, /interval '90 days'/);
  assert.match(audit, /limit 60/);
  assert.doesNotMatch(audit, /event\.event_id|event\.draft_id|event\.revision_id|operation_request_id|actor_auth_user_id/);
  assert.match(sql, /'audit_timeline',\s*production_control\.director_private_audit_with_draft_v1\(\)/);
  assert.doesNotMatch(body("public.read_production_draft_authoring_v1(input jsonb)"),
    /'eventId'/);
});
