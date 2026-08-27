import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/production_migrations/202608270045_production_maintenance_preprepare_abort.sql",
  import.meta.url,
);
const sql = await readFile(migrationUrl, "utf8");

test("migration 045 adds only the maintenance pre-prepare abort RPC", () => {
  assert.match(
    sql,
    /create or replace function public\.abort_production_scoring_maintenance_preprepare\(\s*input jsonb\s*\)/i,
  );
  assert.match(sql, /security definer[\s\S]*set search_path = pg_catalog/i);
  assert.match(
    sql,
    /revoke all on function\s+public\.abort_production_scoring_maintenance_preprepare\(jsonb\)[\s\S]*from public, anon, authenticated, service_role/i,
  );
  assert.match(
    sql,
    /grant execute on function\s+public\.abort_production_scoring_maintenance_preprepare\(jsonb\)\s+to service_role/i,
  );
  assert.doesNotMatch(sql, /alter\s+table|create\s+table|drop\s+table/i);
  assert.doesNotMatch(
    sql,
    /grant\s+(?:select|insert|update|delete|all)[^;]+to\s+(?:public|anon|authenticated)/i,
  );
});

test("pre-prepare abort fails closed across authority, write, lease, backlog, and resource boundaries", () => {
  assert.match(sql, /assert_maintenance_common_input\(input\)/i);
  assert.match(sql, /assert_no_active_physical_writer_fence\(\)/i);
  assert.match(sql, /boundary_mode <> 'MAINTENANCE_WINDOW_V1'/i);
  assert.match(sql, /maintenance_state <> 'SCORING_MAINTENANCE'/i);
  assert.match(sql, /activation\.state <> 'GOOGLE_LEASE_ARMED'/i);
  assert.match(sql, /current_authority <> 'GOOGLE'/i);
  assert.match(sql, /first_supabase_write_possible_at is not null/i);
  assert.match(sql, /first_supabase_write_observed_at is not null/i);
  assert.match(sql, /active_transition_epoch_id is not null/i);
  assert.match(sql, /gate\.active_epoch_id is not null/i);
  assert.match(sql, /epoch\.status = 'PREPARED'/i);
  assert.match(sql, /scoring_admission_unresolved_count/i);
  assert.match(sql, /scoring_admission_legacy_blocker_count/i);
  assert.match(sql, /google_outbox_events[\s\S]*status <> 'DELIVERED'/i);
  assert.match(
    sql,
    /scorecard_archive_jobs[\s\S]*status not in \('VERIFIED', 'SUPERSEDED'\)/i,
  );
  assert.match(sql, /worker_controls[\s\S]*controls\.enabled/i);
  assert.match(sql, /tournament\.scoring_authority = 'GOOGLE'/i);
});

test("pre-prepare abort reopens only its maintenance closure and is receipt-idempotent", () => {
  assert.match(
    sql,
    /lookup_cutover_receipt\(\s*'ABORT_SCORING_MAINTENANCE_PREPREPARE'/i,
  );
  assert.match(
    sql,
    /closure\.status is distinct from gate\.admission_state/i,
  );
  assert.match(sql, /closure\.status = 'CLOSED'/i);
  assert.match(
    sql,
    /set status = 'REOPENED', reopened_at = aborted_at/i,
  );
  assert.match(
    sql,
    /admission_state = 'OPEN'[\s\S]*admission_revision = admission_revision \+ 1[\s\S]*admission_generation_id = next_generation/i,
  );
  assert.match(
    sql,
    /state = 'GOOGLE_LEASE_ARMED', maintenance_state = 'NORMAL'/i,
  );
  assert.match(
    sql,
    /PRODUCTION_SCORING_MAINTENANCE_PREPREPARE_ABORTED/i,
  );
  assert.match(
    sql,
    /store_cutover_receipt\(\s*'ABORT_SCORING_MAINTENANCE_PREPREPARE'/i,
  );
});
