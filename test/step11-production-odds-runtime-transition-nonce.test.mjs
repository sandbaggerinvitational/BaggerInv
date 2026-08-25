import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/production_migrations/202608240030_production_odds_runtime_transition_nonce.sql",
  import.meta.url,
);

test("Odds runtime transitions use an atomic monotonic nonce and exact current state", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /add column if not exists runtime_revision bigint not null default 0/i);
  assert.match(sql, /where scope_key = 'BAGGER_INV_PRODUCTION' for update/i);
  assert.match(sql, /runtime\.runtime_revision <> expected_runtime_revision/i);
  assert.match(sql, /runtime\.enabled is distinct from expected_runtime_enabled/i);
  assert.match(sql, /runtime_revision = runtime_revision \+ 1/i);
  assert.match(sql, /runtime\.runtime_revision <> previous_runtime_revision \+ 1/i);
  assert.match(sql, /PRODUCTION_ODDS_RUNTIME_TRANSITION_CONFLICT/i);
  assert.match(sql, /previous_runtime_revision/i);
  assert.match(sql, /previous_runtime_enabled/i);
});

test("replay hardening remains service-role-only and externally inert", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql,
    /create or replace function public\.inspect_production_odds_calculation_runtime_control/i);
  assert.match(sql,
    /grant execute on function public\.inspect_production_odds_calculation_runtime_control\(jsonb\)\s+to service_role/i);
  assert.match(sql,
    /grant execute on function public\.configure_production_odds_calculation_runtime\(jsonb\)\s+to service_role/i);
  assert.doesNotMatch(sql, /grant execute[^;]+to (?:public|anon|authenticated)/i);
  assert.match(sql, /scheduler_installed', false/i);
  assert.match(sql, /authoritative_write_allowed', false/i);
  assert.match(sql, /google_writes_allowed', false/i);
  assert.match(sql, /publication_created', false/i);
  assert.match(sql, /mirror_created', false/i);
  assert.doesNotMatch(sql,
    /insert into scoring_authority\.odds_published_snapshots|insert into scoring_authority\.odds_google_mirror_jobs|sheets\.googleapis|docs\.google\.com|net\.http_|pg_net|cron\./i);
  assert.doesNotMatch(sql,
    /idgigvjjqkfbqjeredpb|1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts/i);
});

test("runtime inspection exposes the nonce without changing state", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  const inspect = sql.slice(
    sql.indexOf("create or replace function public.inspect_production_odds_calculation_runtime_control"),
    sql.indexOf("create or replace function public.configure_production_odds_calculation_runtime"),
  );
  assert.match(inspect, /'runtime_revision', runtime\.runtime_revision/i);
  assert.match(inspect, /assert_exact_cutover_resource_scope\(input, false\)/i);
  assert.doesNotMatch(inspect, /\b(?:insert|update|delete)\s+(?:into\s+|from\s+)?production_control\./i);
});
