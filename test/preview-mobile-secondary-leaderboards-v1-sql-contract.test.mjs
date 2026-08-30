import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/202608300001_preview_mobile_secondary_leaderboards_v1.sql",
  import.meta.url,
);
const sql = await readFile(migrationUrl, "utf8");

test("Preview secondary Leaders migration is atomic, Preview-only, and additive", () => {
  assert.match(sql, /\bbegin;[\s\S]*\bcommit;\s*$/i);
  assert.doesNotMatch(sql, /\b(?:drop|truncate)\s+(?:table|schema|function)\b/i);
  assert.doesNotMatch(sql, /production_(?:control|authority|net_skins|calcutta)|read_production_/i);
  assert.match(sql, /preview_mobile_calcutta_publications/);
  assert.match(sql, /read_preview_mobile_net_skins_v1/);
  assert.match(sql, /read_preview_mobile_calcutta_v1/);
});

test("Preview Calcutta publication is explicit, fingerprint-bound, and server-only", () => {
  assert.match(sql, /publication_state\s+text[\s\S]*UNPUBLISHED[\s\S]*PUBLISHED/i);
  assert.match(sql, /configuration_fingerprint/);
  assert.match(sql, /preview_mobile_calcutta_configuration_visibility/);
  assert.match(sql, /snapshot\.configuration_fingerprint\s*=\s*configuration\.configuration_fingerprint/i);
  assert.match(sql, /snapshot\.result_payload->>'available'\)\s*::boolean, false\)/i);
  assert.doesNotMatch(sql, /left join scoring_authority\.competition_derived_snapshots/i);
  assert.match(sql, /publication_state = 'UNPUBLISHED'[\s\S]*published_at = null/i);
  assert.match(sql, /set_preview_mobile_calcutta_publication\(input jsonb\)/i);
  assert.match(sql, /environment', ''\)\) <> 'PREVIEW'/i);
  assert.match(sql, /grant execute on function public\.set_preview_mobile_calcutta_publication\(jsonb\)\s+to service_role/i);
  assert.doesNotMatch(sql, /grant execute[\s\S]{0,180}\bto\s+(?:anon|authenticated|public)\b/i);
});

test("Preview mobile readers require active participant membership and expose no direct client grants", () => {
  for (const name of [
    "read_preview_mobile_net_skins_v1",
    "read_preview_mobile_calcutta_v1",
  ]) {
    assert.match(sql, new RegExp(`create or replace function public\\.${name}\\(input jsonb\\)`, "i"));
    assert.match(sql, new RegExp(`revoke all on function public\\.${name}\\(jsonb\\)[\\s\\S]*from public, anon, authenticated, service_role`, "i"));
    assert.match(sql, new RegExp(`grant execute on function public\\.${name}\\(jsonb\\)\\s+to service_role`, "i"));
  }
  assert.match(sql, /membership\.player_id = target_player[\s\S]*membership\.participation_status = 'ACTIVE'/i);
  assert.match(sql, /PREVIEW_PARTICIPANT_RESOURCE_REQUIRED/);
  assert.doesNotMatch(sql, /grant\s+(?:select|insert|update|delete)[\s\S]{0,180}\bto\s+(?:anon|authenticated|public)\b/i);
});

test("Net Skins remains official-only and Calcutta RPC output omits source/admin fields", () => {
  assert.match(sql, /read_net_skins_input_view/);
  assert.match(sql, /read_net_skins_result_view/);
  assert.match(sql, /configuration_revision/);
  assert.match(sql, /result_revision/);
  const calcuttaRead = sql.slice(sql.indexOf("create or replace function public.read_preview_mobile_calcutta_v1"));
  assert.match(calcuttaRead, /'purchases', scoring_authority\.preview_mobile_calcutta_precision_safe/);
  assert.match(calcuttaRead, /'ownership', scoring_authority\.preview_mobile_calcutta_precision_safe/);
  assert.match(sql, /preview_mobile_calcutta_precision_safe/);
  assert.doesNotMatch(calcuttaRead, /'source_workbook_id'|'imported_by'|'point_structure'|'payout_structure'/);
  assert.doesNotMatch(calcuttaRead, /email|phone|auth_user|service_role_key|access_token/i);
});

test("all new tables and helper functions keep RLS and least privilege", () => {
  assert.match(sql, /alter table scoring_authority\.preview_mobile_calcutta_publications\s+enable row level security/i);
  assert.match(sql, /revoke all on scoring_authority\.preview_mobile_calcutta_publications\s+from public, anon, authenticated/i);
  assert.match(sql, /revoke all on function\s+scoring_authority\.reset_preview_mobile_calcutta_publication\(\)\s+from public, anon, authenticated, service_role/i);
  assert.match(sql, /set search_path = pg_catalog, scoring_authority/g);
});
