import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/production_migrations/202609030083_production_empty_pairings_v1.sql",
  import.meta.url,
);

test("migration 083 is an inert additive replacement of the bounded pairing implementation", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /^-- Post-Step 14: general zero-or-complete pairing semantics\./);
  assert.match(sql, /Installation is inert/);
  assert.match(sql, /create or replace function production_control\.apply_tournament_setup_pairings_v1/);
  assert.match(sql, /participant_count not in \(0, expected_count\)/);
  assert.match(sql, /assert_tournament_setup_pairing_clear_safe_v1/);
  assert.match(sql, /materialize_tournament_setup_legacy_match_v1/);
  assert.match(sql, /TOURNAMENT_SETUP_PAIRING_CLEAR_UNSAFE/);
  assert.match(sql, /TOURNAMENT_SETUP_LEGACY_MATCH_CONTEXT_INVALID/);
  assert.match(sql, /delete from scoring_authority\.match_holes/);
  assert.match(sql, /prepared_setup_revision = null/);
  assert.match(sql, /'legacySnapshotRetained', match_value\.scoring_snapshot_id/);
  assert.match(sql, /'pairingsCleared', participant_count = 0/);
  assert.match(sql, /ODDS_PUBLICATION_DEPENDENCY/);
  assert.match(sql, /Published Odds remain unchanged/);
  assert.doesNotMatch(sql, /REMOVE_CB01|where\s+player_id\s*=\s*'CB01'/i);
  assert.doesNotMatch(sql, /drop\s+(?:table|function)|truncate/i);
  assert.match(sql, /revoke all on function[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(sql, /begin;[\s\S]*commit;\s*$/);
});

test("migration 083 preserves the public RPC surface and creates no browser-callable repair path", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.doesNotMatch(sql, /create or replace function public\./i);
  assert.doesNotMatch(sql, /grant execute/i);
  assert.doesNotMatch(sql, /service_role.*execute|authenticated.*execute|anon.*execute/i);
  assert.match(sql, /security definer[\s\S]*set search_path = pg_catalog, production_control, scoring_authority/);
  assert.match(sql, /production_control\.handicap_v1_match_is_unstarted\(target_match_id\)/);
  assert.match(sql, /finalized_scorecard_snapshots/);
  assert.match(sql, /scoring_ingress_leases/);
  assert.match(sql, /permission\.can_score/);
});
