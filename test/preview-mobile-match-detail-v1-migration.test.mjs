import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("participant HCP migration changes only published read precedence, preserving the certified function", async () => {
  const sql = await source("supabase/migrations/202609050002_preview_mobile_participant_playing_hcp.sql");
  const previous = await source("supabase/migrations/202609050001_preview_mobile_scramble_team_hcp.sql");
  const oldLookup = "  -- The collection's read_tournament_live_view exposes this same published\n  -- presentation. Read only this tournament's exact Match key; never trim,\n  -- normalize, split or derive it. BB/SI do not use team-handicap projection.\n  if match_row.format = 'SC' then\n    select value.presentation->'tournamentMatchDisplay'->target_match\n    into published_match_display\n    from scoring_authority.participant_home_presentations value\n    where value.tournament_id = target_tournament;\n  end if;\n";
  const newLookup = "  -- Match and participant identity select the same published values as\n  -- /matches. The exact opaque Match key is never trimmed or normalized.\n  select value.presentation->'tournamentMatchDisplay'->target_match\n  into published_match_display\n  from scoring_authority.participant_home_presentations value\n  where value.tournament_id = target_tournament;\n";
  const oldField = "    'playing_handicap', participant.playing_handicap,";
  const newField = "    'playing_handicap', coalesce(\n      nullif((\n        select published.value->'playingHcp'\n        from pg_catalog.jsonb_array_elements(coalesce(\n          nullif(published_match_display->(case when participant.team_side = 1\n            then 'team1Players' else 'team2Players' end), 'null'::jsonb),\n          '[]'::jsonb)) with ordinality published(value, position)\n        where pg_catalog.btrim(coalesce(published.value->>'id', '')) =\n          pg_catalog.btrim(participant.player_id)\n        order by published.position\n        limit 1\n      ), 'null'::jsonb),\n      pg_catalog.to_jsonb(participant.playing_handicap)),";
  assert.equal(sql.split(newLookup).length, 2);
  assert.equal(sql.split(newField).length, 2);
  const restored = sql.slice(sql.indexOf("begin;"))
    .replace(newLookup, oldLookup).replace(newField, oldField);
  assert.equal(restored, previous.slice(previous.indexOf("begin;")),
    "strokes, score state, exact IDs, navigation, schema and privileges are otherwise byte-identical");
  assert.doesNotMatch(sql, /(?:insert into|update scoring_authority|delete from|alter table|create table)/i);
  assert.equal((sql.match(/create or replace function/g) || []).length, 1);
  assert.doesNotMatch(newField, /(?:round|floor|ceil|handicap_index|course_handicap|final_strokes)\s*\(/i);
  assert.match(newField, /order by published\.position\s+limit 1/);
});


test("Scramble Team HCP migration changes only exact published handicap pass-through", async () => {
  const sql = await source("supabase/migrations/202609050001_preview_mobile_scramble_team_hcp.sql");
  const previous = await source("supabase/migrations/202609040001_preview_mobile_opaque_match_id_contract.sql");
  assert.match(sql, /if match_row\.format = 'SC' then/);
  assert.match(sql, /value\.presentation->'tournamentMatchDisplay'->target_match/);
  assert.match(sql, /from scoring_authority\.participant_home_presentations value\s+where value\.tournament_id = target_tournament/);
  assert.doesNotMatch(sql, /(?:insert into|update scoring_authority|delete from|alter table|create table)/i);
  assert.equal((sql.match(/create or replace function/g) || []).length, 1);
  let unchanged = sql.slice(sql.indexOf("begin;"));
  unchanged = unchanged.replace("  published_match_display jsonb;\n", "");
  unchanged = unchanged.replace(/  -- The collection's read_tournament_live_view[\s\S]*?  end if;\n\n/, "");
  for (const side of [1, 2]) {
    const passThrough = `'team_${side}_playing_handicap', coalesce(\n          nullif(published_match_display->'team${side}PlayingHcp', 'null'::jsonb),\n          snapshot_row.team_configuration->'team_${side}_playing_handicap')`;
    assert.ok(unchanged.includes(passThrough));
    unchanged = unchanged.replace(passThrough, `'team_${side}_playing_handicap', snapshot_row.team_configuration->'team_${side}_playing_handicap'`);
  }
  assert.equal(unchanged, previous.slice(previous.indexOf("begin;")),
    "all existing Match-ID, schema, participant, scoring, navigation and privilege behavior must remain byte-identical");
});

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

test("additive opaque-ID repair keeps exact Unicode lookup and existing read-only privileges", async () => {
  const sql = await source(
    "supabase/migrations/202609040001_preview_mobile_opaque_match_id_contract.sql",
  );
  assert.match(sql, /current_setting\('server_encoding'\) <> 'UTF8'/);
  assert.match(sql, /target_match text := input->>'match_id'/);
  assert.match(sql, /jsonb_typeof\(input->'match_id'\) is distinct from 'string'/);
  assert.match(sql, /char_length\(target_match\) not between 1 and 200/);
  assert.match(sql, /target_match collate pg_catalog\."C" in \('\.', '\.\.'\)/);
  assert.doesNotMatch(sql, /(?:btrim|trim|normalize)\([^\n]*(?:match_id|target_match)/i);
  assert.match(sql, /value\.match_id collate pg_catalog\."C" = target_match collate pg_catalog\."C"/);
  assert.match(sql, /selected\.match_id collate pg_catalog\."C" = my_match\.match_id collate pg_catalog\."C"/);
  assert.match(sql, /language plpgsql\nstable\nsecurity definer\nset search_path = pg_catalog, scoring_authority, public/);
  assert.match(sql, /revoke all on function public\.read_preview_mobile_match_detail_v1\(jsonb\)\s+from public, anon, authenticated, service_role/);
  assert.match(sql, /grant execute on function public\.read_preview_mobile_match_detail_v1\(jsonb\)\s+to service_role/);
  assert.doesNotMatch(sql, /(?:insert into|update scoring_authority|delete from|alter table|create table)/i);
  assert.equal((sql.match(/create or replace function/g) || []).length, 1);
  assert.match(sql, /notify pgrst, 'reload schema'/);
});
