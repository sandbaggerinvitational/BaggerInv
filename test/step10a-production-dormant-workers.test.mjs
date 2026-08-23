import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const controlSql = fs.readFileSync(
  path.join(root, "supabase/production_migrations/202608230001_production_control_plane.sql"),
  "utf8",
);
const domainSql = fs.readFileSync(
  path.join(root, "supabase/production_migrations/202608230002_production_final_domain_schema.sql"),
  "utf8",
);
const workerSql = fs.readFileSync(
  path.join(root, "supabase/production_migrations/202608230005_production_dormant_worker_contracts.sql"),
  "utf8",
);

test("dormant worker contracts cover every Production operational domain", () => {
  for (const worker of [
    "ODDS_CALCULATION",
    "ODDS_GOOGLE_MIRROR",
    "SCORING_GOOGLE_OUTBOX",
    "ROUND_SCORECARDS_ARCHIVE",
    "GUIDE_SYNCHRONIZATION",
    "PREDICTION_SETTINGS_SYNCHRONIZATION",
    "DRAFT_SYNCHRONIZATION",
    "NET_SKINS_SYNCHRONIZATION",
    "CALCUTTA_SYNCHRONIZATION",
    "NET_SKINS_RECALCULATION",
    "CALCUTTA_RECALCULATION",
    "COMPETITION_DERIVED",
    "SCORING_AUTHORITY_TRANSITION",
  ]) {
    assert.match(workerSql, new RegExp(`'${worker}'`));
  }
});

test("durable Odds contracts preserve lifecycle, checkpoints, frozen input, and publication separation", () => {
  assert.match(workerSql, /scoring_authority\.odds_calculation_jobs/);
  assert.match(workerSql, /scoring_authority\.odds_calculation_checkpoints/);
  assert.match(workerSql, /"PENDING","RUNNING","SUCCEEDED","FAILED","RETRYABLE","SUPERSEDED"/);
  assert.match(workerSql, /"random_stream":"SEQUENTIAL_PRNG_STATE"/);
  assert.match(workerSql, /"frozen_input":true/);
  assert.match(workerSql, /"publication_separate":true/);
  assert.match(domainSql, /total_iterations = ANY \(ARRAY\[10000, 25000, 50000, 100000\]\)/);
  assert.match(domainSql, /odds_calculation_jobs_invocation_fingerprint_key/);
  assert.match(domainSql, /odds_calculation_checkpoints_job_id_completed_iterations_key/);
});

test("Google outbox and scorecard archive are modeled but cannot deliver", () => {
  assert.match(workerSql, /scoring_authority\.google_outbox_events/);
  assert.match(workerSql, /scoring_authority\.google_match_checkpoints/);
  assert.match(workerSql, /"idempotent_mutation_key":true/);
  assert.match(workerSql, /scoring_authority\.scorecard_archive_jobs/);
  assert.match(workerSql, /scoring_authority\.scorecard_archive_checkpoints/);
  assert.match(workerSql, /"readback_required":true/);
  assert.match(controlSql, /google_writes_enabled boolean not null default false check \(not google_writes_enabled\)/);
  assert.match(controlSql, /google_writes_allowed boolean not null default false check \(not google_writes_allowed\)/);
});

test("authority epoch and ingress contracts remain Google-authority dormant", () => {
  assert.match(workerSql, /scoring_authority\.authority_epochs/);
  assert.match(workerSql, /scoring_authority\.ingress_gates/);
  assert.match(workerSql, /"ingress_closed_before_commit":true/);
  assert.match(workerSql, /"unresolved_client_queues_zero":true/);
  assert.match(controlSql, /scoring_authority text not null default 'GOOGLE'/);
  assert.match(controlSql, /scoring_ingress_enabled boolean not null default false check \(not scoring_ingress_enabled\)/);
});

test("every worker remains hard-disabled and unscheduled", () => {
  for (const definition of [controlSql, workerSql]) {
    assert.doesNotMatch(definition, /cron\.|net\.http_|pg_net|create\s+extension\s+[^;]*http/i);
  }
  assert.match(workerSql, /operation_allowed boolean not null default false check \(not operation_allowed\)/);
  assert.match(workerSql, /scheduler_installed boolean not null default false check \(not scheduler_installed\)/);
  assert.match(workerSql, /authoritative_write_allowed boolean not null default false check \(not authoritative_write_allowed\)/);
  assert.doesNotMatch(workerSql, /update\s+production_control\.worker_controls\s+set\s+enabled\s*=\s*true/i);
  assert.doesNotMatch(workerSql, /enable\s+trigger/i);
});

test("Production worker requests require the exact certified resource tuple", () => {
  for (const exact of [
    "ymqhhtxaywtqllynrmxe",
    "https://ymqhhtxaywtqllynrmxe.supabase.co",
    "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4",
    "bagger-inv",
    "https://baggerinv.com",
  ]) {
    assert.match(workerSql, new RegExp(exact.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(workerSql, /requested_project_ref is distinct from scope_row\.project_ref/);
  assert.match(workerSql, /requested_project_url is distinct from scope_row\.project_url/);
  assert.match(workerSql, /requested_google_workbook_id is distinct from scope_row\.google_workbook_id/);
  assert.doesNotMatch(workerSql, /idgigvjjqkfbqjeredpb|1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts/);
  assert.doesNotMatch(workerSql, /like\s+['"]?%|position\s*\(/i);
});

test("every operational request consults both global and per-worker controls and fails closed", () => {
  assert.match(workerSql, /not scope_row\.workers_enabled or not control_row\.enabled/);
  assert.match(workerSql, /PRODUCTION_WORKER_DISABLED/);
  assert.match(workerSql, /PRODUCTION_GOOGLE_WRITES_DISABLED/);
  assert.match(workerSql, /PRODUCTION_ODDS_PUBLICATION_DISABLED/);
  assert.match(workerSql, /PRODUCTION_SCORING_INGRESS_DISABLED/);
  assert.match(workerSql, /PRODUCTION_DORMANT_CONTRACT_REQUIRES_ACTIVATION_MIGRATION/);
  assert.doesNotMatch(workerSql, /insert\s+into\s+scoring_authority|update\s+scoring_authority|delete\s+from\s+scoring_authority/i);
});

test("worker functions are fixed-search-path SECURITY DEFINER and browser-inaccessible", () => {
  const definitions = workerSql.split(/create or replace function /i).slice(1);
  assert.equal(definitions.length, 3);
  for (const definition of definitions) {
    assert.match(definition, /security definer/i);
    assert.match(definition, /set search_path to pg_catalog, production_control/i);
  }
  assert.match(workerSql, /revoke all on function production_control\.read_dormant_worker_status[\s\S]*from public, anon, authenticated, service_role;/i);
  assert.match(workerSql, /revoke all on function production_control\.request_dormant_worker_operation[\s\S]*from public, anon, authenticated, service_role;/i);
  assert.match(workerSql, /grant execute on function production_control\.read_dormant_worker_status[\s\S]*to service_role;/i);
  assert.match(workerSql, /grant execute on function production_control\.request_dormant_worker_operation[\s\S]*to service_role;/i);
  assert.doesNotMatch(workerSql, /grant execute[\s\S]*to (?:public|anon|authenticated)/i);
});

test("worker migration performs no publication, Google call, job insertion, or scheduler installation", () => {
  assert.doesNotMatch(workerSql, /insert\s+into\s+scoring_authority/i);
  assert.doesNotMatch(workerSql, /http[s]?:\/\/docs\.google|sheets\.googleapis|googleapis\.com/i);
  assert.doesNotMatch(workerSql, /insert\s+into\s+scoring_authority\.odds_published_snapshots/i);
  assert.doesNotMatch(workerSql, /create\s+(?:or\s+replace\s+)?trigger/i);
  assert.doesNotMatch(workerSql, /select\s+cron\.|schedule\s*\(/i);
});
