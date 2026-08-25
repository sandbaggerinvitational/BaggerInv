import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/production_migrations/202608240033_production_precommit_release_abort.sql",
  import.meta.url,
);
const sql = await readFile(migrationUrl, "utf8");
const body = sql.slice(
  sql.indexOf("create or replace function public.abort_production_precommit_release"),
  sql.indexOf("revoke all on function public.abort_production_precommit_release"),
);

const escaped = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("precommit abort installs inertly and remains service-role only", () => {
  const installation = sql.slice(0, sql.indexOf("create or replace function"));
  assert.doesNotMatch(installation, /\b(?:insert|update|delete|truncate)\b/i);
  assert.match(body, /security definer/i);
  assert.match(body, /set search_path = pg_catalog,/i);
  assert.match(body, /set lock_timeout = '5s'/i);
  assert.doesNotMatch(
    body.match(/set search_path = ([\s\S]*?)\nas \$\$/i)?.[1] ?? "",
    /\bpublic\b|pg_temp/i,
  );
  assert.match(
    sql,
    /revoke all on function public\.abort_production_precommit_release\(jsonb\)[\s\S]*from public, anon, authenticated, service_role/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.abort_production_precommit_release\(jsonb\)[\s\S]*to service_role/i,
  );
  assert.doesNotMatch(sql, /grant execute[^;]+to (?:public|anon|authenticated)/i);
});

test("precommit abort binds the exact Production tuple, release, generation, and revision", () => {
  for (const value of [
    "ymqhhtxaywtqllynrmxe",
    "https://ymqhhtxaywtqllynrmxe.supabase.co",
    "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4",
    "bagger-inv",
    "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
    "https://baggerinv.com",
    "production-cutover-activation-v1",
    "ABORT_PRODUCTION_PRECOMMIT_RELEASE",
  ]) assert.match(body, new RegExp(escaped(value)));
  assert.match(body, /assert_exact_cutover_resource_scope\(input, false\)/i);
  assert.match(body, /activation\.activation_revision <> expected_revision/i);
  assert.match(body, /activation\.authority_generation_id <> expected_generation/i);
  assert.match(body, /activation\.expected_deployment_commit[\s\S]*deployment_commit_value/i);
  assert.match(body, /activation\.expected_source_fingerprint[\s\S]*source_fingerprint_value/i);
  assert.match(body, /input \? 'candidate_hostname'/i);
  assert.doesNotMatch(body, /idgigvjjqkfbqjeredpb|1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts/i);
});

test("precommit abort closes both otherwise stranded precommit states only", () => {
  assert.match(body, /activation\.state not in \('STAGED', 'GOOGLE_LEASE_ARMED'\)/i);
  assert.match(body, /prior_state = 'STAGED' and gate\.state <> 'PAUSED'/i);
  assert.match(body, /prior_state = 'GOOGLE_LEASE_ARMED' and gate\.state <> 'OPEN'/i);
  assert.match(body, /set state = 'DORMANT'/i);
  assert.doesNotMatch(body, /'CUTOVER_PREPARED'|'SCORING_COMMITTED'|'ROLLBACK_PREPARED'/i);
  assert.match(body, /active_transition_epoch_id is not null/i);
  assert.match(body, /authority_epochs[\s\S]*status = 'PREPARED'/i);
});

test("rolled-back reads are accepted only with the exact staged fingerprint", () => {
  assert.match(body, /activation\.read_cutover_phase <> 'STATIC_BACKEND'/i);
  assert.match(
    body,
    /activation\.read_source_fingerprint is not null[\s\S]*activation\.read_source_fingerprint[\s\S]*is distinct from activation\.expected_source_fingerprint/i,
  );
  assert.match(body, /activation\.public_reads_activated_at is not null/i);
  assert.match(body, /resource\.current_tournament_read_authority <> 'GOOGLE'/i);
  assert.match(body, /resource\.public_supabase_reads_enabled/i);
  assert.match(body, /read_source_fingerprint = null/i);
});

test("abort requires Google, Passport, dormant workers, runtime, and no first-write boundary", () => {
  assert.match(body, /activation\.current_authority <> 'GOOGLE'/i);
  assert.match(body, /resource\.scoring_authority <> 'GOOGLE'/i);
  assert.match(body, /resource\.participant_identity_authority <> 'PASSPORT'/i);
  for (const flag of [
    "scoring_ingress_enabled", "google_writes_enabled",
    "auth_user_creation_enabled", "workers_enabled", "odds_publication_enabled",
  ]) assert.match(body, new RegExp(`resource\\.${flag}`));
  assert.match(body, /worker\.enabled or worker\.scheduler_installed[\s\S]*worker\.google_writes_allowed/i);
  assert.match(body, /contract\.operation_allowed or contract\.scheduler_installed[\s\S]*contract\.authoritative_write_allowed/i);
  assert.match(body, /runtime\.enabled/i);
  assert.match(body, /runtime\.operation_mode <> 'DORMANT'/i);
  for (const field of [
    "first_supabase_write_possible_at", "first_supabase_write_observed_at",
    "first_supabase_mutation_key", "first_supabase_match_id",
    "first_supabase_match_revision",
  ]) assert.match(body, new RegExp(`activation\\.${field} is not null`));
});

test("abort serializes Odds and authority work, drains only elapsed leases, and refuses live leases", () => {
  assert.match(body, /pg_advisory_xact_lock\(731102026031::bigint\)/i);
  assert.match(body, /cutover_activation_state[\s\S]*for update;/i);
  assert.doesNotMatch(body, /resource_scope[\s\S]{0,160}for update;/i);
  const activeLeaseLock = body.indexOf("perform lease.lease_id");
  const gateLock = body.indexOf(
    "select * into strict gate",
    activeLeaseLock,
  );
  assert.ok(activeLeaseLock > 0);
  assert.ok(gateLock > activeLeaseLock);
  assert.match(
    body.slice(activeLeaseLock, gateLock),
    /status = 'ACTIVE'[\s\S]*order by lease\.lease_id[\s\S]*for update;/i,
  );
  assert.match(body, /set status = 'EXPIRED', completed_at = now\(\)[\s\S]*status = 'ACTIVE' and expires_at <= now\(\)/i);
  assert.match(
    body,
    /update production_control\.current_shadow_import_claims[\s\S]*set status = 'EXPIRED'[\s\S]*status = 'PENDING' and expires_at <= now\(\)/i,
  );
  assert.match(body, /status = 'ACTIVE' and expires_at > now\(\)/i);
  assert.match(body, /PRODUCTION_PRECOMMIT_ABORT_ACTIVE_GOOGLE_LEASES/i);
  assert.match(body, /lock table[\s\S]*scoring_authority\.google_outbox_events[\s\S]*production_rehearsal\.scoring_runs[\s\S]*in share mode/i);
  assert.equal((body.match(/lookup_cutover_receipt\([\s\S]*?'ABORT_PRECOMMIT_RELEASE'/g) ?? []).length, 2);
});

test("abort refuses every pending operational or publishable boundary", () => {
  assert.match(body, /google_outbox_events[\s\S]*status <> 'DELIVERED'/i);
  assert.match(body, /scorecard_archive_jobs[\s\S]*status not in \('VERIFIED', 'SUPERSEDED'\)/i);
  assert.match(body, /odds_calculation_jobs[\s\S]*'PENDING', 'RUNNING', 'RETRYABLE'/i);
  assert.match(body, /publication_status in \('READY', 'PUBLISHED'\)/i);
  assert.match(body, /odds_google_mirror_jobs[\s\S]*'PENDING', 'RUNNING'/i);
  assert.match(body, /guide_sync_runs[\s\S]*status = 'CLAIMED'/i);
  assert.match(body, /import_runs[\s\S]*'PENDING', 'RUNNING'/i);
  assert.match(body, /production_participant_enrollment_claims[\s\S]*'PENDING', 'CLEANUP_REQUIRED'/i);
  assert.match(body, /production_rehearsal\.scoring_runs[\s\S]*'PREPARED', 'ACTIVE'/i);
  assert.match(body, /PRODUCTION_PRECOMMIT_ABORT_PENDING_WORK/i);
});

test("successful abort pauses the gate, clears only candidate metadata, preserves generation, and audits", () => {
  assert.match(body, /set state = 'PAUSED', authority = 'GOOGLE', active_epoch_id = null/i);
  assert.match(body, /activation_revision = activation_revision \+ 1/i);
  for (const field of [
    "expected_deployment_commit", "expected_vercel_project_id",
    "expected_source_fingerprint", "staged_by", "staged_at",
    "read_source_fingerprint", "public_reads_activated_at",
  ]) assert.match(body, new RegExp(`${field} = null`, "i"));
  assert.doesNotMatch(body, /authority_generation_id\s*=/i);
  assert.match(body, /PRODUCTION_PRECOMMIT_RELEASE_ABORTED/i);
  assert.match(body, /'prior_state', prior_state/i);
  assert.match(body, /'authority_generation_preserved', true/i);
  assert.match(body, /store_cutover_receipt\([\s\S]*'ABORT_PRECOMMIT_RELEASE'/i);
});

test("abort cannot mutate authority facts, publish, transport, or destructively clean data", () => {
  assert.doesNotMatch(body, /set\s+(?:current_authority|scoring_authority|participant_identity_authority)\s*=/i);
  assert.doesNotMatch(body, /insert\s+into\s+scoring_authority\.(?:score_mutations|odds_published_snapshots|odds_google_mirror_jobs)/i);
  assert.doesNotMatch(body, /\bdelete\s+from\b|truncate\b/i);
  assert.doesNotMatch(body, /sheets\.googleapis|docs\.google\.com|net\.http_|pg_net|cron\.|fetch\s*\(/i);
  assert.match(body, /'no_automatic_fallback', true/i);
});

test("migration is one balanced transaction", () => {
  assert.match(sql, /^--[\s\S]*\nbegin;\n/i);
  assert.match(sql, /notify pgrst, 'reload schema';\ncommit;\n$/);
  assert.equal((sql.match(/\$\$/g) ?? []).length % 2, 0);
  assert.equal((sql.match(/\bbegin;/gi) ?? []).length, 1);
  assert.equal((sql.match(/\bcommit;/gi) ?? []).length, 1);
});
