import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL(
  "../supabase/production_migrations/202608230007_production_current_shadow_v2.sql",
  import.meta.url,
), "utf8");
const compact = migration.replace(/\s+/g, " ");

test("current shadow V2 migration is transactional, exact-resource scoped, and Preview-free", () => {
  assert.match(migration, /^begin;\s*$/im);
  assert.equal(migration.match(/^commit;\s*$/gim)?.length || 0, 1);
  assert.match(migration, /notify pgrst,'reload schema';\s*commit;\s*$/);
  assert.match(migration, /ymqhhtxaywtqllynrmxe/);
  assert.match(migration, /1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4/);
  assert.doesNotMatch(migration, /idgigvjjqkfbqjeredpb|1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts|\bPREVIEW\b/i);
});

test("V2 uses the approved short-lived, single-use service-role bootstrap claim", () => {
  assert.match(migration, /current_shadow_import_claims/);
  assert.match(migration, /claim_production_current_tournament_shadow_import/);
  assert.match(migration, /STEP10B_CURRENT_SHADOW_V2/);
  assert.match(migration, /CURRENT_TOURNAMENT_SHADOW_IMPORT/);
  assert.match(migration, /step10b-production-shadow-bootstrap/);
  assert.match(migration, /request_canonical_json/);
  assert.match(migration, /request_fingerprint/);
  assert.match(migration, /PRODUCTION_CURRENT_SHADOW_REQUEST_EVIDENCE_MISMATCH/);
  assert.match(migration, /PRODUCTION_CURRENT_SHADOW_BOOTSTRAP_ALREADY_USED/);
  assert.match(migration, /PRODUCTION_CURRENT_SHADOW_CONSUMED_CLAIM_DRIFT/);
  assert.match(migration, /claim\.status = 'CONSUMED'/);
  assert.match(migration, /'duplicate', true, 'consumed', true/);
  assert.match(migration, /auth\.role\(\).*service_role/s);
  assert.match(migration, /expires_at <= now\(\)/);
  assert.match(migration, /for update/);
  assert.match(migration, /interval '5 minutes'/);
  assert.match(migration, /claim\.source_fingerprint <> source_fingerprint_value/);
  assert.match(migration, /claim\.payload_fingerprint <> payload_fingerprint_value/);
  assert.match(migration, /set status='CONSUMED',consumed_at=now\(\),import_run_id=scoring_run_id/);
  assert.doesNotMatch(migration, /director_authorization/);
  assert.doesNotMatch(migration, /claim\.auth_user_id|claim\.entitlement_id/);
  assert.doesNotMatch(compact, /grant execute on function public\.claim_production_current_tournament_shadow_import\(jsonb\)/i);
  assert.match(migration, /bootstrap_import_production_current_tournament_shadow/);
  assert.match(migration, /Claim and import share one database transaction/);
  assert.match(compact, /grant execute on function public\.bootstrap_import_production_current_tournament_shadow\(jsonb\) to service_role;/i);
  assert.doesNotMatch(compact, /grant execute on function public\.bootstrap_import_production_current_tournament_shadow\(jsonb\) to (?:anon|authenticated)/i);
});

test("V2 verifies canonical source/payload evidence and the pre-tournament pairing contract", () => {
  assert.match(migration, /source_canonical_json/);
  assert.match(migration, /payload_canonical_json/);
  assert.match(migration, /source_value is distinct from input->'source_payload'/);
  assert.match(migration, /payload_value is distinct from payload_body/);
  assert.match(migration, /PRODUCTION_CURRENT_SHADOW_CANONICAL_EVIDENCE_MISMATCH/);
  assert.match(migration, /production-current-shadow-v2/);
  assert.match(migration, /production-current-pairing-state-v1/);
  assert.match(migration, /'PENDING','PARTIAL','COMPLETE'/);
  assert.match(migration, /no_pairings_inferred/);
  assert.match(migration, /count\(distinct \(rule->>'round_number'\)::integer\)/);
  assert.match(migration, /when 1 then 'BB' when 2 then 'SC' when 3 then 'SI'/);
  assert.match(migration, /CM01/);
  assert.match(migration, /JK02/);
  assert.match(migration, /PN01/);
  assert.match(migration, /expected_match_count <> 24/);
  assert.match(migration, /jsonb_array_length\(coalesce\(payload_body->'players'/);
  assert(migration.includes("substring(supplied->>'field' from '^Team ([12])')"));
});

test("V2 fails closed on active/scored/access/finalized facts and forces disabled ingress", () => {
  for (const evidence of [
    "activity,active", "activity,scored", "activity,access_active",
    "activity,scoring_locked", "activity,finalized",
  ]) assert.match(migration, new RegExp(evidence.replace(",", ",")));
  assert.match(migration, /PRODUCTION_CURRENT_SHADOW_ACTIVITY_PROHIBITED/);
  assert.match(migration, /jsonb_array_length\(coalesce\(payload_body->'hole_scores'/);
  assert.match(migration, /where coalesce\(\(value->>'can_score'\)::boolean, false\)/);
  assert.match(migration, /values \('2026','PAUSED','GOOGLE',null,0/);
  assert.match(migration, /scoring_ingress','DISABLED'/);
});

test("V2 cannot enqueue Google, archive, mirror, Auth, or public-read work", () => {
  assert.match(migration, /PRODUCTION_SHADOW_IMPORT_CREATED_DELIVERY_WORK/);
  assert.match(migration, /google_outbox_events/);
  assert.match(migration, /scorecard_archive_jobs/);
  assert.match(migration, /odds_google_mirror_jobs/);
  assert.doesNotMatch(migration, /insert\s+into\s+scoring_authority\.(?:google_outbox_events|scorecard_archive_jobs|odds_google_mirror_jobs)/i);
  assert.doesNotMatch(migration, /insert\s+into\s+auth\./i);
  assert.doesNotMatch(migration, /update\s+production_control\.resource_scope/i);
  assert.doesNotMatch(migration, /update\s+production_control\.worker_controls/i);
  assert.match(migration, /PRODUCTION_CURRENT_SHADOW_IDENTITY_ACTIVITY_PRESENT/);
  assert.match(migration, /exists \(select 1 from auth\.users\)/);
  assert.match(migration, /participant_identity\.participant_identity_contacts/);
});

test("V2 RPC grants preserve server-only import/readback and browser-inaccessible tables", () => {
  assert.doesNotMatch(compact, /grant execute on function public\.import_production_current_tournament_shadow\(jsonb\)/i);
  assert.match(compact, /grant execute on function public\.bootstrap_import_production_current_tournament_shadow\(jsonb\) to service_role;/i);
  assert.match(compact, /grant execute on function public\.read_production_current_shadow_v2_revision\(jsonb\) to service_role;/i);
  assert.match(compact, /revoke all on production_control\.current_shadow_import_claims from public, anon, authenticated, service_role;/i);
  assert.match(compact, /revoke all on production_control\.current_shadow_revisions from public, anon, authenticated, service_role;/i);
});
