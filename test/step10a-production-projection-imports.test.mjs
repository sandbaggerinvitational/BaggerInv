import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../supabase/production_migrations/202608230004_production_projection_imports.sql", import.meta.url);
const sql = await readFile(migrationUrl, "utf8");
const compact = sql.replace(/\s+/g, " ");

test("Production projection migration has exactly one transaction terminator", () => {
  assert.equal(sql.match(/^commit;\s*$/gim)?.length || 0, 1);
  assert.match(sql, /^begin;\s*$/im);
  assert.match(sql, /notify pgrst,'reload schema';\s*commit;\s*$/);
});

const imports = [
  "import_production_guide_projection",
  "import_production_player_editorial",
  "import_production_prediction_settings",
  "import_production_draft_projection",
  "import_production_net_skins_configuration",
  "import_production_calcutta_configuration",
  "import_production_published_odds",
];
test("Production projection imports assert exact isolated resources and dormant authorities", () => {
  assert.match(sql, /project_ref = 'ymqhhtxaywtqllynrmxe'/);
  assert.match(sql, /project_url = 'https:\/\/ymqhhtxaywtqllynrmxe\.supabase\.co'/);
  assert.match(sql, /source_workbook_id = '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'/);
  assert.match(sql, /current_tournament_read_authority <> 'GOOGLE'/);
  assert.match(sql, /scoring_authority <> 'GOOGLE'/);
  assert.match(sql, /participant_identity_authority <> 'PASSPORT'/);
  for (const flag of ["public_supabase_reads_enabled", "scoring_ingress_enabled", "google_writes_enabled", "auth_user_creation_enabled", "odds_publication_enabled", "workers_enabled"]) {
    assert.match(sql, new RegExp(`scope\\.${flag}`));
  }
  assert.doesNotMatch(sql, /idgigvjjqkfbqjeredpb|1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts|PREVIEW/i);
});

test("all seven retained domains have immutable revision and current-pointer imports", () => {
  assert.match(sql, /create table production_control\.projection_revisions/);
  assert.match(sql, /create table production_control\.projection_current/);
  assert.match(sql, /previous_revision_id uuid references production_control\.projection_revisions/);
  assert.match(sql, /unique \(domain, tournament_id, revision_number\)/);
  assert.match(sql, /PRODUCTION_SOURCE_PROJECTION_CONFLICT/);
  assert.match(sql, /expected_contract,actor,'SUCCEEDED'/);
  for (const name of imports) assert.match(sql, new RegExp(`function public\\.${name}\\(input jsonb\\)`));
});

test("every public import and read RPC is service-role only", () => {
  const rpcNames = [
    ...imports,
    "read_production_guide_projection",
    "read_production_player_editorial",
    "read_production_prediction_settings",
    "read_production_draft_projection",
    "read_production_net_skins_configuration",
    "read_production_calcutta_configuration",
    "read_production_published_odds",
  ];
  for (const name of rpcNames) {
    assert.match(compact, new RegExp(`revoke all on function public\\.${name}\\(jsonb\\) from public,anon,authenticated,service_role;`, "i"));
    assert.match(compact, new RegExp(`grant execute on function public\\.${name}\\(jsonb\\) to service_role;`, "i"));
  }
  assert.match(compact, /revoke all on all functions in schema production_control from public,anon,authenticated,service_role;/i);
});

test("projection imports record provenance and never authorize foreground traffic", () => {
  for (const field of ["source_fingerprint", "payload_fingerprint", "source_workbook_id", "contract_version", "imported_by", "previous_revision_id"]) {
    assert.match(sql, new RegExp(field));
  }
  assert.match(sql, /'google_foreground_requests',0/);
  assert.match(sql, /'fallback_used',false/);
  assert.match(sql, /'authoritative',false/);
  assert.match(sql, /'shadow_only',true/);
  assert.doesNotMatch(sql, /insert into scoring_authority\.google_outbox_events/i);
  assert.doesNotMatch(sql, /insert into scoring_authority\.odds_google_mirror_jobs/i);
  assert.doesNotMatch(sql, /insert into auth\.users/i);
  assert.doesNotMatch(sql, /net\.http|cron\.schedule/i);
});

test("Net Skins and Calcutta empty foundations have explicit NOT_CONFIGURED semantics", () => {
  assert.match(sql, /NET_SKINS_CONFIGURATION[\s\S]*NOT_CONFIGURED/);
  assert.match(sql, /CALCUTTA_CONFIGURATION[\s\S]*NOT_CONFIGURED/);
  assert.match(sql, /'recalculation_enqueued',false/g);
  assert.doesNotMatch(sql, /enqueue_calcutta_job|competition_recalculation_jobs/);
});

test("Published Odds imports verified Google history without publishing or mirroring", () => {
  assert.match(sql, /VERIFIED_GOOGLE_IMPORT/);
  assert.match(sql, /'publication_created',false/);
  assert.match(sql, /'mirror_job_created',false/);
  assert.match(sql, /'values_recalculated',false/);
  assert.doesNotMatch(sql, /publish_preview|publication_status\s*=\s*'PUBLISHED'/i);
});

test("Prediction Settings preserves the certified typed 30-key contract", () => {
  assert.match(sql, /prediction-settings-v1/g);
  assert.match(sql, /jsonb_object_length\(payload->'canonical_settings'\)<>30/);
  assert.match(sql, /jsonb_object_length\(payload->'effective_settings'\)<>30/);
  assert.match(sql, /previous_configuration_id/);
});

test("Draft preserves stable identity, ordering, immutability, and historical correction audit", () => {
  assert.match(sql, /draft-projection-v1/g);
  assert.match(sql, /PRODUCTION_DRAFT_PICK_ORDER_INVALID/);
  assert.match(sql, /tournament_players tp/);
  assert.match(sql, /HISTORICAL_CORRECTION/);
  assert.match(sql, /PRODUCTION_DRAFT_HISTORICAL_CORRECTION_REASON_REQUIRED/);
  assert.match(sql, /scoring_authority\.draft_projection_import/);
});
