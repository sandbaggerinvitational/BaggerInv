import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/production_migrations/202608240031_production_staged_release_abort.sql",
  import.meta.url,
);
const priorScopeUrl = new URL(
  "../supabase/production_migrations/202608240029_production_odds_observation_phase_rebind.sql",
  import.meta.url,
);
const [sql, priorScopeSql] = await Promise.all([
  readFile(migrationUrl, "utf8"),
  readFile(priorScopeUrl, "utf8"),
]);
const scopeStart = "create or replace function production_control.assert_production_odds_calculation_scope";
const lockedScope = sql.slice(
  sql.indexOf(scopeStart),
  sql.indexOf("create or replace function public.abort_production_staged_release"),
);
const priorScope = priorScopeSql.slice(
  priorScopeSql.indexOf(scopeStart),
  priorScopeSql.indexOf("revoke all on function production_control.assert_production_odds_calculation_scope"),
);
const body = sql.slice(
  sql.indexOf("create or replace function public.abort_production_staged_release"),
  sql.indexOf("revoke all on function public.abort_production_staged_release"),
);

test("staged-release abort is installation-inert and service-role only", () => {
  const installation = sql.slice(0, sql.indexOf("create or replace function"));
  assert.doesNotMatch(installation, /\b(?:insert|update|delete)\b/i);
  assert.match(body, /security definer/i);
  assert.match(body, /set search_path = pg_catalog,/i);
  assert.doesNotMatch(body.match(/set search_path = ([\s\S]*?)\nas \$\$/i)?.[1] ?? "", /\bpublic\b|pg_temp/i);
  assert.match(sql, /revoke all on function public\.abort_production_staged_release\(jsonb\)[\s\S]*from public, anon, authenticated, service_role/i);
  assert.match(sql, /grant execute on function public\.abort_production_staged_release\(jsonb\)[\s\S]*to service_role/i);
  assert.doesNotMatch(sql, /grant execute[^;]+to (?:public|anon|authenticated)/i);
});

test("abort binds the exact Production release tuple and optimistic revision", () => {
  for (const value of [
    "ymqhhtxaywtqllynrmxe",
    "https://ymqhhtxaywtqllynrmxe.supabase.co",
    "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4",
    "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
    "https://baggerinv.com",
    "production-cutover-activation-v1",
  ]) assert.match(body, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(body, /assert_exact_cutover_resource_scope\(input, false\)/i);
  assert.match(body, /activation\.state <> 'STAGED'/i);
  assert.match(body, /activation\.activation_revision <> expected_revision/i);
  assert.match(body, /activation\.expected_deployment_commit[\s\S]*deployment_commit_value/i);
  assert.match(body, /activation\.expected_source_fingerprint[\s\S]*source_fingerprint_value/i);
  assert.match(body, /input \? 'candidate_hostname'/i);
  assert.doesNotMatch(body, /'candidate_hostname'\s*,/i);
  assert.match(body, /PRODUCTION_STAGED_RELEASE_ABORT_REVISION_CONFLICT/i);
  assert.doesNotMatch(body, /idgigvjjqkfbqjeredpb|1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts/i);
});

test("abort requires the untouched Google, Passport, and PAUSED shadow baseline", () => {
  assert.match(body, /activation\.current_authority <> 'GOOGLE'/i);
  assert.match(body, /activation\.read_cutover_phase <> 'STATIC_BACKEND'/i);
  assert.match(body, /gate\.state <> 'PAUSED'/i);
  assert.match(body, /gate\.authority <> 'GOOGLE'/i);
  assert.match(body, /resource\.current_tournament_read_authority <> 'GOOGLE'/i);
  assert.match(body, /resource\.scoring_authority <> 'GOOGLE'/i);
  assert.match(body, /resource\.participant_identity_authority <> 'PASSPORT'/i);
  for (const flag of [
    "public_supabase_reads_enabled", "scoring_ingress_enabled",
    "google_writes_enabled", "auth_user_creation_enabled", "workers_enabled",
    "odds_publication_enabled",
  ]) assert.match(body, new RegExp(`resource\\.${flag}`));
  assert.match(body, /worker\.enabled or worker\.scheduler_installed[\s\S]*worker\.google_writes_allowed/i);
  assert.match(body, /contract\.operation_allowed or contract\.scheduler_installed[\s\S]*contract\.authoritative_write_allowed/i);
});

test("abort refuses every authority, first-write, runtime, and pending-work boundary", () => {
  for (const field of [
    "active_transition_epoch_id", "first_supabase_write_possible_at",
    "first_supabase_write_observed_at", "first_supabase_mutation_key",
    "first_supabase_match_id", "first_supabase_match_revision",
  ]) assert.match(body, new RegExp(`activation\\.${field} is not null`));
  assert.match(body, /runtime\.enabled/i);
  assert.match(body, /runtime\.operation_mode <> 'DORMANT'/i);
  assert.match(body, /authority_epochs[\s\S]*status = 'PREPARED'/i);
  assert.match(body, /scoring_ingress_leases[\s\S]*status = 'ACTIVE'/i);
  assert.match(body, /google_outbox_events[\s\S]*status <> 'DELIVERED'/i);
  assert.match(body, /scorecard_archive_jobs[\s\S]*status not in \('VERIFIED', 'SUPERSEDED'\)/i);
  assert.match(body, /odds_calculation_jobs[\s\S]*'PENDING', 'RUNNING', 'RETRYABLE'/i);
  assert.match(body, /odds_google_mirror_jobs[\s\S]*'PENDING', 'RUNNING'/i);
  assert.match(body, /production_participant_enrollment_claims[\s\S]*'PENDING', 'CLEANUP_REQUIRED'/i);
  assert.match(body, /PRODUCTION_STAGED_RELEASE_ABORT_PENDING_WORK/i);
});

test("abort serializes in-flight work and safely replays a concurrent receipt", () => {
  assert.match(lockedScope, /if require_enabled then[\s\S]*pg_advisory_xact_lock_shared\(731102026031::bigint\)[\s\S]*end if;/i);
  assert.match(body, /pg_advisory_xact_lock\(731102026031::bigint\)/i);
  assert.match(body, /lock table[\s\S]*scoring_authority\.odds_calculation_jobs[\s\S]*in share mode/i);
  assert.match(body, /lock table[\s\S]*scoring_authority\.google_outbox_events/i);
  assert.equal((body.match(/lookup_cutover_receipt\([\s\S]*?'ABORT_STAGED_RELEASE'/g) ?? []).length, 2);
  assert.match(body, /for update;[\s\S]*lock table[\s\S]*lookup_cutover_receipt/i);
  assert.match(body, /store_cutover_receipt\([\s\S]*'ABORT_STAGED_RELEASE'/i);
});

test("the lock-preserving scope replacement changes no prior authorization behavior", () => {
  const normalize = (value) => value
    .replace(/--.*$/gm, "")
    .replace(
      /if require_enabled then\s*perform pg_catalog\.pg_advisory_xact_lock_shared\(731102026031::bigint\);\s*end if;/i,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
  assert.equal(normalize(lockedScope), normalize(priorScope));
  assert.doesNotMatch(sql, /grant execute on function production_control\.assert_production_odds_calculation_scope/i);
});

test("successful abort clears only staged metadata, increments revision, and audits evidence", () => {
  assert.match(body, /set state = 'DORMANT'/i);
  assert.match(body, /activation_revision = activation_revision \+ 1/i);
  for (const field of [
    "expected_deployment_commit", "expected_vercel_project_id",
    "expected_source_fingerprint", "staged_by", "staged_at",
    "read_source_fingerprint", "public_reads_activated_at",
  ]) assert.match(body, new RegExp(`${field} = null`, "i"));
  assert.doesNotMatch(body, /authority_generation_id\s*=/i);
  assert.doesNotMatch(body, /runtime_revision\s*=/i);
  assert.match(body, /PRODUCTION_STAGED_RELEASE_ABORTED/i);
  assert.match(body, /'authority', 'GOOGLE'/i);
  assert.match(body, /'participant_identity_authority', 'PASSPORT'/i);
  assert.match(body, /'first_supabase_canonical_write_possible', false/i);
  assert.match(body, /'first_supabase_canonical_write_observed', false/i);
});

test("abort performs no authority write, external transport, publication, or destructive cleanup", () => {
  assert.doesNotMatch(body, /set\s+(?:current_authority|scoring_authority|participant_identity_authority)\s*=/i);
  assert.doesNotMatch(body, /insert\s+into\s+scoring_authority\.(?:score_mutations|odds_published_snapshots|odds_google_mirror_jobs)/i);
  assert.doesNotMatch(body, /\bdelete\s+from\b|truncate\b/i);
  assert.doesNotMatch(body, /sheets\.googleapis|docs\.google\.com|net\.http_|pg_net|cron\.|fetch\s*\(/i);
});

test("migration is one balanced transaction", () => {
  assert.match(sql, /^--[\s\S]*\nbegin;\n/i);
  assert.match(sql, /notify pgrst, 'reload schema';\ncommit;\n$/);
  assert.equal((sql.match(/\$\$/g) ?? []).length % 2, 0);
  assert.equal((sql.match(/\bbegin;/gi) ?? []).length, 1);
  assert.equal((sql.match(/\bcommit;/gi) ?? []).length, 1);
});
