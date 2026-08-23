import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/production_migrations/202608230006_production_import_evidence_hardening.sql",
  import.meta.url,
);
const sql = await readFile(migrationUrl, "utf8");
const compact = sql.replace(/\s+/g, " ");

test("migration 006 is forward-only, transactional, and Production-isolated", () => {
  assert.match(sql, /^begin;\s*$/im);
  assert.equal(sql.match(/^commit;\s*$/gim)?.length || 0, 1);
  assert.match(sql, /notify pgrst,'reload schema';\s*commit;\s*$/);
  assert.doesNotMatch(sql, /idgigvjjqkfbqjeredpb|1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts|\bPREVIEW\b/i);
  assert.doesNotMatch(sql, /insert\s+into\s+auth\.|google_outbox_events|odds_google_mirror_jobs/i);
});

test("all projection writes require matching canonical source and payload evidence", () => {
  assert.match(sql, /source_canonical_json/);
  assert.match(sql, /payload_canonical_json/);
  assert.match(sql, /source_value is distinct from input->'source_payload'/);
  assert.match(sql, /payload_value is distinct from input->'payload'/);
  assert.match(sql, /digest\(source_text,'sha256'\)/);
  assert.match(sql, /digest\(payload_text,'sha256'\)/);
  assert.match(sql, /PRODUCTION_PROJECTION_CANONICAL_EVIDENCE_MISMATCH/);
});

test("Prediction Settings and Published Odds verify their inner deterministic hashes", () => {
  assert.match(sql, /settings_canonical_json/);
  assert.match(sql, /effective_settings_canonical_json/);
  assert.match(sql, /PRODUCTION_PREDICTION_SETTINGS_INNER_FINGERPRINT_MISMATCH/);
  assert.match(sql, /published_payload_canonical_json/);
  assert.match(sql, /snapshot_value is distinct from snapshot_item->'published_payload'/);
  assert.match(sql, /PRODUCTION_PUBLISHED_ODDS_SNAPSHOT_HASH_MISMATCH/);
});

test("current shadow mutation is fail-closed pending a reviewed v2 claim", () => {
  const definition = sql.match(/create or replace function public\.import_production_current_tournament_shadow[\s\S]*?\$\$;\s*revoke all/i)?.[0] || "";
  assert.match(definition, /PRODUCTION_CURRENT_SHADOW_IMPORT_V2_REQUIRED/);
  assert.match(definition, /'blocked', true/);
  assert.match(definition, /'changed', false/);
  assert.match(definition, /'google_write', false/);
  assert.match(definition, /'scoring_ingress', 'DISABLED'/);
  assert.doesNotMatch(definition, /\b(?:insert\s+into|update|delete\s+from)\b/i);
  assert.match(compact, /grant execute on function public\.import_production_current_tournament_shadow\(jsonb\) to service_role;/i);
});

test("certified history is frozen while readback remains untouched", () => {
  assert.match(compact, /revoke all on function public\.import_production_completed_history_year\(jsonb\) from public, anon, authenticated, service_role;/i);
  assert.doesNotMatch(compact, /grant execute on function public\.import_production_completed_history_year\(jsonb\) to service_role;/i);
  assert.doesNotMatch(sql, /read_production_completed_history_shadow/);
});

test("Net Skins and Calcutta fail with actionable prerequisites before the private v1 writer", () => {
  assert.match(sql, /PRODUCTION_NET_SKINS_TOURNAMENT_REQUIRED/);
  assert.match(sql, /PRODUCTION_CALCUTTA_TOURNAMENT_REQUIRED/);
  assert.match(sql, /production_control\.import_production_net_skins_configuration_v1_internal\(input\)/);
  assert.match(sql, /production_control\.import_production_calcutta_configuration_v1_internal\(input\)/);
  for (const name of [
    "import_production_net_skins_configuration_v1_internal",
    "import_production_calcutta_configuration_v1_internal",
  ]) {
    assert.match(compact, new RegExp(`revoke all on function production_control\\.${name}\\(jsonb\\) from public, anon, authenticated, service_role;`, "i"));
    assert.doesNotMatch(compact, new RegExp(`grant execute on function production_control\\.${name}\\(jsonb\\)`));
  }
});
