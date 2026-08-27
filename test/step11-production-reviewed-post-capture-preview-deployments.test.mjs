import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration036Url = new URL(
  "../supabase/production_migrations/202608260036_production_reviewed_post_capture_preview_deployments_v2.sql",
  import.meta.url,
);
const migration037Url = new URL(
  "../supabase/production_migrations/202608260037_production_provider_rpc_name_and_inventory_v3.sql",
  import.meta.url,
);
const migration038Url = new URL(
  "../supabase/production_migrations/202608260038_production_provider_preview_target_inventory_v4.sql",
  import.meta.url,
);
const sql036 = await readFile(migration036Url, "utf8");
const sql037 = await readFile(migration037Url, "utf8");
const sql038 = await readFile(migration038Url, "utf8");
const reviewedMatch = sql036.match(
  /normalized_reviewed\s*:=\s*production_control\.normalized_vercel_origin_inventory\(\s*'(\[[\s\S]*?\])'::jsonb\s*\);/,
);
const reviewedAddition037Match = sql037.match(
  /reviewed_addition\s*:=\s*production_control\.normalized_vercel_origin_inventory\(\s*'(\[[\s\S]*?\])'::jsonb\s*\);/,
);
const reviewedAddition038Match = sql038.match(
  /reviewed_addition\s*:=\s*production_control\.normalized_vercel_origin_inventory\(\s*'(\[[\s\S]*?\])'::jsonb\s*\);/,
);

test("additive migration pins the exact shared reviewed deployment set", () => {
  assert.ok(reviewedMatch, "the reviewed SQL inventory must be statically extractable");
  assert.ok(reviewedAddition037Match,
    "the v3 additive reviewed SQL inventory must be statically extractable");
  assert.ok(reviewedAddition038Match,
    "the v4 additive reviewed SQL inventory must be statically extractable");
  const reviewed = [
    ...JSON.parse(reviewedMatch[1]),
    ...JSON.parse(reviewedAddition037Match[1]),
    ...JSON.parse(reviewedAddition038Match[1]),
  ];
  const normalizedReviewed = [...reviewed].sort((left, right) => {
    const leftKey = `${left[0]}\n${left[2]}`;
    const rightKey = `${right[0]}\n${right[2]}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  assert.equal(normalizedReviewed.length, 7);
  assert.equal(
    createHash("sha256").update(JSON.stringify(normalizedReviewed)).digest("hex"),
    "91cdd7ab6fc077cb422c4b8921a0ac431ddf38f043167c457cc7ad4cc288a01a",
  );
});

test("v3 assertion and PostgREST-safe inspection RPC are fixed-path and fail-closed", () => {
  assert.match(sql037, /^begin;/m);
  assert.match(sql037, /commit;\s*$/);
  assert.match(sql037,
    /create or replace function public\.inspect_production_vercel_provider_challenge_abandonment\(/);
  assert.ok(
    "inspect_production_vercel_provider_challenge_abandonment".length <= 63,
    "the PostgREST RPC name must survive PostgreSQL identifier storage exactly",
  );
  assert.match(sql037,
    /revoke all on function[\s\S]*?inspect_production_vercel_provider_challenge_abandonment\(jsonb\)[\s\S]*?from public, anon, authenticated, service_role;/);
  assert.match(sql037,
    /grant execute on function[\s\S]*?inspect_production_vercel_provider_challenge_abandonment\(jsonb\)[\s\S]*?to service_role;/);
  assert.match(sql037,
    /create or replace function production_control\.assert_exact_vercel_live_inventory\(/);
  assert.match(sql037, /language plpgsql\s+immutable\s+security definer\s+set search_path = pg_catalog/);
  assert.match(sql037,
    /revoke all on function production_control\.assert_exact_vercel_live_inventory\([\s\S]*?from public, anon, authenticated, service_role;/);
  assert.match(sql037,
    /grant execute on function production_control\.assert_exact_vercel_live_inventory\([\s\S]*?to service_role;/);
  assert.match(sql037, /candidate_deployment_id = reviewed_record->>0/);
  assert.match(sql037,
    /pg_catalog\.rtrim\(candidate_immutable_origin, '\/'\)[\s\S]*?reviewed_record->>2/);
  assert.match(sql037,
    /value->>0 = reviewed_record->>0[\s\S]*?value->>2 = reviewed_record->>2[\s\S]*?value is distinct from reviewed_record/);
  assert.match(sql037,
    /jsonb_agg\(\s*value order by \(value->>0\) collate "C",\s*pg_catalog\.lower\(pg_catalog\.rtrim\(value->>2, '\/'\)\)\s*\)/,
    "the delegated inventory must preserve the canonical C-collated order",
  );
  assert.match(sql037,
    /perform production_control\.assert_exact_vercel_live_inventory_v2\(/);
  assert.match(sql037, /notify pgrst, 'reload schema';/);
  assert.doesNotMatch(sql037, /idgigvjjqkfbqjeredpb|1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts/);
});

test("v4 assertion pins 68c81de, delegates v3, and limits control-plane mutation to staged provenance", () => {
  assert.match(sql038, /^begin;/m);
  assert.match(sql038, /commit;\s*$/);
  assert.match(sql038,
    /alter function production_control\.assert_exact_vercel_live_inventory\([\s\S]*?\) rename to assert_exact_vercel_live_inventory_v3;/);
  assert.match(sql038,
    /"dpl_3wULxzmgsbsmUPLmK7B1Ld4FAjeT"[\s\S]*?"68c81debe4c8f99662bb5615d5c82a34a10a011e"[\s\S]*?"https:\/\/bagger-99mqqt7qn-sandbagger-invitational\.vercel\.app"[\s\S]*?"FEATURE_PREVIEW", "READY", "GIT"/);
  assert.match(sql038,
    /create or replace function production_control\.assert_exact_vercel_live_inventory\(/);
  assert.match(sql038,
    /language plpgsql\s+immutable\s+security definer\s+set search_path = pg_catalog/);
  for (const functionName of [
    "assert_exact_vercel_live_inventory_v3",
    "assert_exact_vercel_live_inventory",
  ]) {
    assert.match(sql038, new RegExp(
      `revoke all on function production_control\\.${functionName}\\([\\s\\S]*?from public, anon, authenticated, service_role;`,
    ));
    assert.match(sql038, new RegExp(
      `grant execute on function production_control\\.${functionName}\\([\\s\\S]*?to service_role;`,
    ));
  }
  assert.match(sql038, /candidate_deployment_id = reviewed_record->>0/);
  assert.match(sql038,
    /pg_catalog\.rtrim\(candidate_immutable_origin, '\/'\)[\s\S]*?reviewed_record->>2/);
  assert.match(sql038,
    /value->>0 = reviewed_record->>0[\s\S]*?value->>2 = reviewed_record->>2[\s\S]*?value is distinct from reviewed_record/);
  assert.match(sql038,
    /perform production_control\.assert_exact_vercel_live_inventory_v3\(/);

  assert.match(sql038,
    /create or replace function public\.inspect_production_scoring_admission\(input jsonb\)/);
  const inspectStart = sql038.indexOf(
    "create or replace function public.inspect_production_scoring_admission",
  );
  const inspectEnd = sql038.indexOf("\n$$;", inspectStart);
  const inspectDefinition = sql038.slice(inspectStart, inspectEnd + 4);
  assert.match(inspectDefinition,
    /assert_exact_cutover_resource_scope\(input, false\)/);
  assert.doesNotMatch(inspectDefinition,
    /assert_exact_cutover_resource_scope\(input, true\)/);
  assert.match(inspectDefinition,
    /pg_advisory_xact_lock_shared\([\s\S]*?scoring_admission_lock_key\(\)/);
  assert.match(inspectDefinition,
    /language plpgsql\s+security definer\s+set search_path = pg_catalog/);
  for (const field of [
    "active_legacy_writers",
    "unresolved_legacy_writers",
    "ambiguous_google_writes",
    "partial_google_writes",
    "unresolved_outbox",
    "unresolved_archive",
  ]) assert.match(inspectDefinition, new RegExp(`'${field}'`));
  assert.match(inspectDefinition,
    /lease\.status = 'ACTIVE'[\s\S]*?lease\.protocol_version = 'ADMISSION_V2'[\s\S]*?lease\.admission_generation_id = gate\.admission_generation_id[\s\S]*?lease\.resolution_state in \([\s\S]*?'ADMITTED'[\s\S]*?'WRITE_STARTED'[\s\S]*?'AMBIGUOUS'[\s\S]*?'PARTIAL_WRITE'[\s\S]*?'LEGACY_UNCLASSIFIED'[\s\S]*?lease\.protocol_version = 'LEGACY_V1'[\s\S]*?lease\.resolution_state = 'LEGACY_UNCLASSIFIED'/);
  assert.match(inspectDefinition,
    /scoring_authority\.google_outbox_events event[\s\S]*?event\.tournament_id = '2026'[\s\S]*?event\.status <> 'DELIVERED'/);
  assert.match(inspectDefinition,
    /scoring_authority\.scorecard_archive_jobs job[\s\S]*?job\.tournament_id = '2026'[\s\S]*?job\.status not in \('VERIFIED', 'SUPERSEDED'\)/);
  assert.match(inspectDefinition,
    /into active_legacy_writers_value, unresolved_legacy_writers_value,[\s\S]*?ambiguous_google_writes_value, partial_google_writes_value,[\s\S]*?unresolved_outbox_value, unresolved_archive_value/,
    "all operational counts must share one PostgreSQL statement snapshot",
  );
  assert.match(sql038,
    /revoke all on function public\.inspect_production_scoring_admission\(jsonb\)\s+from public, anon, authenticated, service_role;/);
  assert.match(sql038,
    /grant execute on function public\.inspect_production_scoring_admission\(jsonb\)\s+to service_role;/);

  const stageProvenanceUpdate = sql038.match(
    /\n  update production_control\.cutover_activation_state\n  set staged_request_fingerprint = stage_request_fingerprint,\n      staged_payload_hash = stage_payload_hash,\n      staged_certification_fingerprint = certification_fingerprint,\n      staged_environment_delta_fingerprint_v2 =\n        environment_delta_fingerprint_v2\n  where scope_key = 'BAGGER_INV_PRODUCTION'\n    and state = 'STAGED'\n    and expected_deployment_commit = pg_catalog\.lower\(\n      input->>'deployment_commit'\n    \);/,
  );
  assert.ok(stageProvenanceUpdate,
    "the sole control-plane UPDATE must bind only the four staged provenance claims");
  assert.equal(sql038.match(/\n  update production_control\.cutover_activation_state\n/g)?.length, 1,
    "the migration must contain exactly one activation-state UPDATE");
  const provenanceResetTrigger = sql038.slice(
    sql038.indexOf(
      "create or replace function production_control.clear_stage_provenance_on_reset",
    ),
    sql038.indexOf("\n$$;", sql038.indexOf(
      "create or replace function production_control.clear_stage_provenance_on_reset",
    )) + 4,
  );
  assert.match(provenanceResetTrigger,
    /if new\.state = 'DORMANT' then\s+new\.staged_request_fingerprint := null;\s+new\.staged_payload_hash := null;\s+new\.staged_certification_fingerprint := null;\s+new\.staged_environment_delta_fingerprint_v2 := null;\s+end if;/);
  assert.deepEqual(
    [...provenanceResetTrigger.matchAll(/new\.([a-z0-9_]+)\s*:=/g)]
      .map((match) => match[1]),
    [
      "staged_request_fingerprint",
      "staged_payload_hash",
      "staged_certification_fingerprint",
      "staged_environment_delta_fingerprint_v2",
    ],
    "the reset trigger must assign exactly the four staged provenance fields",
  );
  assert.doesNotMatch(provenanceResetTrigger, /^\s*new\.[a-z0-9_]+\s*=(?!=)/m,
    "the reset trigger must not use an alternate assignment for another field");

  const sqlWithoutReviewedProvenanceUpdate = sql038.replace(
    stageProvenanceUpdate[0],
    "",
  );
  assert.doesNotMatch(sqlWithoutReviewedProvenanceUpdate,
    /^\s*(?:update|insert|delete)\s+(?:production_control|scoring_authority)\./im);
  assert.doesNotMatch(sql038,
    /idgigvjjqkfbqjeredpb|1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts/);
});
