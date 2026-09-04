import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Preview Match Detail RPC is participant-scoped, bounded, and service-role only", async () => {
  const sql = await source(
    "supabase/migrations/202609030001_preview_mobile_match_detail_v1.sql",
  );

  assert.match(sql, /read_preview_mobile_match_detail_v1\(input jsonb\)/);
  assert.match(sql, /upper[\s\S]*environment[\s\S]*<> 'PREVIEW'/i);
  assert.match(sql, /tournament_players[\s\S]*participation_status = 'ACTIVE'/i);
  assert.match(sql, /value\.match_id = target_match[\s\S]*value\.tournament_id = target_tournament/i);

  assert.match(sql, /candidate\.round_number = match_row\.round_number/i);
  assert.match(sql, /order by candidate_presentation\.match_sort_order/i);
  assert.doesNotMatch(sql, /order by[^;\n]*match_id/i);
  assert.doesNotMatch(sql, /order by[^;\n]*display_match_number/i);
  assert.match(sql, /candidate_presentation\.match_sort_order is null/i);
  assert.match(sql, /group by candidate_presentation\.match_sort_order[\s\S]*having pg_catalog\.count\(\*\) > 1/i);
  assert.match(sql, /'round_match_index'/);
  assert.match(sql, /'round_match_count'/);
  assert.match(sql, /'previous_match_id'/);
  assert.match(sql, /'next_match_id'/);
  assert.match(sql, /'my_match_id'/);
  assert.match(sql, /'is_my_match'/);

  assert.match(sql, /count\(\*\) from scoring_authority\.match_holes[\s\S]*<> 18/i);
  assert.match(sql, /count\(\*\) from scoring_authority\.hole_scores[\s\S]*> 18/i);
  assert.doesNotMatch(sql, /limit 18/i);
  assert.match(sql, /count\(\*\) from scoring_authority\.teams[\s\S]*<> 2/i);
  assert.match(sql, /count\(\*\) from scoring_authority\.match_participants[\s\S]*not between 2 and 4/i);
  assert.match(sql, /jsonb_array_length\(score\.team_1_gross_scores\)[\s\S]*not between 1 and 2/i);
  assert.match(sql, /'playing_handicap', participant\.playing_handicap/i);
  assert.match(sql, /'final_strokes', participant\.final_strokes/i);
  assert.match(sql, /'authority_updated_at', match_row\.authority_updated_at/i);
  assert.match(sql, /'finalized_at', match_row\.finalized_at/i);

  for (const safeScoreField of [
    "team_1_gross_scores",
    "team_2_gross_scores",
    "team_1_strokes",
    "team_2_strokes",
    "team_1_net_score",
    "team_2_net_score",
    "hole_winner",
    "updated_at",
  ]) {
    assert.match(sql, new RegExp(`'${safeScoreField}'`));
  }

  for (const forbiddenAuthority of [
    "scoring_permissions",
    "permission_revision",
    "match_revision",
    "hole_revision",
    "mutation_key",
    "actor_id",
    "unresolved_mutations",
    "query_ms",
    "read_diagnostics",
    "course_handicap",
    "handicap_index",
  ]) {
    assert.doesNotMatch(sql, new RegExp(forbiddenAuthority, "i"));
  }

  assert.match(sql, /revoke all on function public\.read_preview_mobile_match_detail_v1\(jsonb\)[\s\S]*from public, anon, authenticated, service_role/i);
  assert.match(sql, /grant execute on function public\.read_preview_mobile_match_detail_v1\(jsonb\)[\s\S]*to service_role/i);
  assert.doesNotMatch(sql, /grant execute[\s\S]*to (anon|authenticated)/i);
  assert.match(sql, /notify pgrst, 'reload schema'/);
  assert.doesNotMatch(sql, /production/i);
});

test("Preview Match Detail RPC returns only the approved top-level projection", async () => {
  const sql = await source(
    "supabase/migrations/202609030001_preview_mobile_match_detail_v1.sql",
  );
  for (const key of [
    "tournament",
    "round",
    "match",
    "presentation",
    "snapshot",
    "teams",
    "participants",
    "holes",
    "scores",
    "navigation",
  ]) {
    assert.match(sql, new RegExp(`'${key}'`));
  }
});
