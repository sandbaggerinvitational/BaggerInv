import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/production_migrations/202608240019_production_cutover_activation.sql",
  import.meta.url,
);
const controlUrl = new URL(
  "../supabase/production_migrations/202608230001_production_control_plane.sql",
  import.meta.url,
);

const [sql, controlSql] = await Promise.all([
  readFile(migrationUrl, "utf8"),
  readFile(controlUrl, "utf8"),
]);
const installation = sql.slice(0, sql.indexOf("create or replace function public.stage_production_cutover_release"));

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("Production activation migration installs dormant state without changing live authorities", () => {
  assert.match(
    sql,
    /alter table production_control\.resource_scope[\s\S]*add column if not exists updated_at timestamptz not null default now\(\)/i,
  );
  assert.match(controlSql, /scoring_authority text not null default 'GOOGLE'/);
  assert.match(controlSql, /participant_identity_authority text not null default 'PASSPORT'/);
  assert.match(controlSql, /scoring_ingress_enabled boolean not null default false/);
  assert.match(controlSql, /google_writes_enabled boolean not null default false/);
  assert.match(controlSql, /workers_enabled boolean not null default false/);
  assert.match(sql, /state text not null default 'DORMANT'/);
  assert.match(sql, /current_authority text not null default 'GOOGLE'/);
  assert.match(sql, /scoring_ingress_enabled boolean not null default false/);
  assert.doesNotMatch(installation, /update\s+production_control\.resource_scope/i);
  assert.doesNotMatch(installation, /update\s+production_control\.worker_controls/i);
  assert.doesNotMatch(installation, /enable trigger capture_scorecard_archive_transition/i);
  assert.doesNotMatch(installation, /insert\s+into\s+scoring_authority\.(?:score_mutations|google_outbox_events|scorecard_archive_jobs)/i);
});

test("every database operation is bound to the exact Production resource tuple", () => {
  for (const value of [
    "ymqhhtxaywtqllynrmxe",
    "https://ymqhhtxaywtqllynrmxe.supabase.co",
    "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4",
    "bagger-inv",
    "https://baggerinv.com",
    "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
    "2026",
  ]) assert.match(sql, new RegExp(escapeRegExp(value)));
  assert.match(sql, /upper\(coalesce\(input->>'environment', ''\)\) <> 'PRODUCTION'/);
  assert.match(sql, /input->>'project_ref' is distinct from resource\.project_ref/i);
  assert.match(sql, /input->>'project_url' is distinct from resource\.project_url/i);
  assert.match(sql, /input->>'source_workbook_id' is distinct from resource\.google_workbook_id/i);
  assert.match(sql, /input->>'tournament_id' is distinct from resource\.current_tournament_id/i);
  assert.match(sql, /input->>'deployment_commit' is distinct from activation\.expected_deployment_commit/i);
  assert.doesNotMatch(sql, /idgigvjjqkfbqjeredpb|1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts/);
  assert.doesNotMatch(sql, /\bpreview_|mock-tour|like\s+'%ymqh|position\s*\(/i);
});

test("release staging freezes SHA, Vercel project, source fingerprint, and optimistic revision", () => {
  assert.match(sql, /expected_deployment_commit ~ '\^\[0-9a-f\]\{40\}\$'/);
  assert.match(sql, /expected_source_fingerprint ~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(sql, /input->>'vercel_project_id'[\s\S]*is distinct from 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'/);
  assert.match(sql, /activation\.activation_revision <> expected_revision/);
  assert.match(sql, /state not in \('DORMANT', 'STAGED', 'ROLLED_BACK'\)/);
  assert.match(sql, /PRODUCTION_RELEASE_CANNOT_BE_RESTAGED/);
  assert.match(sql, /PRODUCTION_CUTOVER_RELEASE_STAGED/);
  assert.match(sql, /'authority_changed', false/);
  assert.match(sql, /'scoring_ingress_enabled', false/);
  assert.match(sql, /'workers_enabled', false/);
});

test("Google-authority ingress is generation-bound, race-safe, expiring, and idempotent", () => {
  assert.match(sql, /function public\.arm_production_google_ingress_lease_gate\(input jsonb\)/i);
  assert.match(sql, /function public\.begin_production_scoring_ingress\(input jsonb\)/i);
  assert.match(sql, /function public\.complete_production_scoring_ingress\(input jsonb\)/i);
  assert.match(sql, /from scoring_authority\.ingress_gates[\s\S]*for update;/i);
  assert.match(sql, /activation\.authority_generation_id <> expected_epoch/);
  assert.match(sql, /activation\.state <> 'GOOGLE_LEASE_ARMED'/);
  assert.match(sql, /gate\.state <> 'OPEN'/);
  assert.match(sql, /PRODUCTION_SCORING_AUTHORITY_BOUNDARY_MISMATCH/);
  assert.match(sql, /greatest\(30, least\(coalesce\(\(input->>'lease_seconds'\)::integer, 180\), 300\)\)/);
  assert.match(sql, /set status = 'EXPIRED', completed_at = now\(\)/);
  assert.match(sql, /where request_fingerprint = input_hash and status = 'ACTIVE'/);
  assert.match(sql, /'idempotent', true/);
  assert.match(sql, /set status = 'COMPLETED', completed_at = now\(\)/);
});

test("authority epoch prepare, commit, and abort are atomic, reconciled, and audited", () => {
  for (const rpc of [
    "prepare_production_authority_epoch",
    "commit_production_authority_epoch",
    "abort_production_authority_epoch",
  ]) assert.match(sql, new RegExp(`function public\\.${rpc}\\(input jsonb\\)`, "i"));
  assert.match(sql, /input->'supabase_match_revisions' <> current_revisions/);
  assert.match(sql, /input->'google_checkpoints' <> current_checkpoints/);
  assert.match(sql, /checkpoint\.match_id is null/);
  assert.match(sql, /where status = 'PREPARED'/);
  assert.match(sql, /set state = 'PAUSED', active_epoch_id = epoch\.epoch_id/);
  assert.match(sql, /epoch\.supabase_match_revisions <> production_control\.current_match_revisions\('2026'\)/);
  assert.match(sql, /epoch\.google_checkpoints <> production_control\.current_google_checkpoints\('2026'\)/);
  assert.match(sql, /set status = 'COMMITTED', committed_at = boundary_at/);
  assert.match(sql, /set state = 'OPEN', authority = epoch\.authority_after/);
  assert.match(sql, /set status = 'ABORTED', aborted_at = now\(\)/);
  assert.match(sql, /active_epoch_id = epoch\.prior_active_epoch_id/);
  assert.match(sql, /PRODUCTION_AUTHORITY_RECONCILIATION_CHANGED/);
  assert.match(sql, /PRODUCTION_AUTHORITY_COMMIT_PRECONDITION_FAILED/);
});

test("rollback cannot commit until mirror and archive reconciliation are complete", () => {
  assert.match(sql, /from scoring_authority\.google_outbox_events[\s\S]*status <> 'DELIVERED'/i);
  assert.match(sql, /from scoring_authority\.scorecard_archive_jobs[\s\S]*status not in \('VERIFIED', 'SUPERSEDED'\)/i);
  assert.match(sql, /checkpoint\.last_supabase_match_revision is distinct from match_value\.match_revision/i);
  assert.match(sql, /PRODUCTION_ROLLBACK_RECONCILIATION_INCOMPLETE/);
  assert.match(sql, /set scoring_authority = 'GOOGLE', scoring_ingress_enabled = false/);
  assert.match(sql, /disable trigger capture_scorecard_archive_transition/);
  assert.match(sql, /where worker_name in \('SCORING_GOOGLE_OUTBOX', 'ROUND_SCORECARDS_ARCHIVE'\)/);
});

test("commit is the observable first-write-possible boundary and the first real mutation is recorded atomically", () => {
  assert.match(sql, /'FIRST_SUPABASE_CANONICAL_WRITE_POSSIBLE'/);
  assert.match(sql, /first_supabase_write_possible_at = boundary_at/);
  assert.match(sql, /first_supabase_canonical_write_possible', epoch\.authority_after = 'SUPABASE'/);
  assert.match(sql, /create trigger capture_first_production_canonical_write/i);
  assert.match(sql, /after insert on scoring_authority\.score_mutations/i);
  assert.match(sql, /gate\.active_epoch_id = activation\.authority_generation_id/);
  assert.match(sql, /first_supabase_write_observed_at is null/);
  assert.match(sql, /'FIRST_SUPABASE_CANONICAL_WRITE_OBSERVED'/);
  assert.match(sql, /first_canonical_write_boundary/);
});

test("mirror and archive remain dormant until one explicit, dedicated-account RPC", () => {
  assert.match(sql, /function public\.set_production_cutover_worker_state\(input jsonb\)/i);
  assert.match(sql, /worker not in \('SCORING_GOOGLE_OUTBOX', 'ROUND_SCORECARDS_ARCHIVE'\)/);
  assert.match(sql, /sbi-production-workbook@sandbagger-invitational\.iam\.gserviceaccount\.com/);
  assert.match(sql, /PRODUCTION_DEDICATED_GOOGLE_SERVICE_ACCOUNT_REQUIRED/);
  assert.match(sql, /set operation_allowed = requested_enabled/);
  assert.match(sql, /authoritative_write_allowed = false/);
  assert.match(sql, /scheduler_installed = false/);
  assert.match(sql, /disable trigger capture_scorecard_archive_transition/);
  assert.doesNotMatch(sql, /enable trigger capture_scorecard_archive_transition/);
  assert.match(sql, /set workers_enabled = active_workers > 0/);
  assert.match(sql, /google_writes_enabled = active_google_writers > 0/);
});

test("mutating RPCs have request receipts and same-fingerprint/different-payload conflicts fail closed", () => {
  assert.match(sql, /create table production_control\.cutover_operation_receipts/);
  assert.match(sql, /primary key check \(request_fingerprint ~ '\^\[0-9a-f\]\{64\}\$'\)/);
  assert.match(sql, /receipt\.operation <> requested_operation or receipt\.payload_hash <> input_hash/);
  assert.match(sql, /PRODUCTION_IDEMPOTENCY_CONFLICT/);
  for (const operation of [
    "STAGE_RELEASE", "ARM_GOOGLE_LEASE_GATE", "PREPARE_AUTHORITY_EPOCH",
    "COMMIT_AUTHORITY_EPOCH", "ABORT_AUTHORITY_EPOCH", "SET_WORKER_STATE",
  ]) {
    assert.match(sql, new RegExp(`lookup_cutover_receipt\\('${operation}'`));
    assert.match(sql, new RegExp(`store_cutover_receipt\\('${operation}'`));
  }
});

test("all callable Production activation RPCs are service-role only with fixed search paths", () => {
  assert.match(sql, /PRODUCTION_SERVICE_ROLE_REQUIRED/);
  assert.match(sql, /request\.jwt\.claim\.role/);
  const definitions = sql.split(/create or replace function /i).slice(1);
  assert.ok(definitions.length >= 17);
  for (const definition of definitions) {
    assert.match(definition, /security definer/i);
    assert.match(definition, /set search_path = pg_catalog,/i);
    const searchPath = definition.match(/set search_path = ([^\n]+)/i)?.[1] ?? "";
    assert.doesNotMatch(searchPath, /\bpublic\b|pg_temp/i);
  }
  for (const rpc of [
    "stage_production_cutover_release", "arm_production_google_ingress_lease_gate",
    "begin_production_scoring_ingress", "complete_production_scoring_ingress",
    "prepare_production_authority_epoch", "commit_production_authority_epoch",
    "abort_production_authority_epoch", "set_production_cutover_worker_state",
    "inspect_production_cutover_authority",
  ]) {
    assert.match(sql, new RegExp(`'public\\.${rpc}\\(jsonb\\)'`, "i"));
    assert.match(sql, new RegExp(`grant execute on function public\\.${rpc}\\(jsonb\\) to service_role`, "i"));
  }
  assert.match(sql, /execute format\('revoke all on function %s from public, anon, authenticated, service_role', signature\)/i);
  assert.doesNotMatch(sql, /grant execute[^;]+to (?:public|anon|authenticated)/i);
});

test("activation migration has no scheduler, network transport, publication, or automatic fallback", () => {
  assert.doesNotMatch(sql, /cron\.|net\.http_|pg_net|sheets\.googleapis|docs\.google\.com|fetch\s*\(/i);
  assert.doesNotMatch(sql, /insert\s+into\s+scoring_authority\.odds_published_snapshots/i);
  assert.doesNotMatch(sql, /odds_publication_enabled\s*=\s*true/i);
  assert.doesNotMatch(sql, /historical-data\.json|google-sheets-data|catch\s*\(/i);
  assert.match(sql, /'no_automatic_fallback', true/);
});

test("migration text is a single balanced transaction with balanced dollar quoting", () => {
  assert.match(sql, /^--[\s\S]*\nbegin;\n/i);
  assert.match(sql, /notify pgrst, 'reload schema';\ncommit;\n$/);
  assert.equal((sql.match(/\$\$/g) ?? []).length % 2, 0);
  assert.equal((sql.match(/\bbegin;/gi) ?? []).length, 1);
  assert.equal((sql.match(/\bcommit;/gi) ?? []).length, 1);
});
