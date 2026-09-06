import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const base = await readFile(new URL('../supabase/migrations/202608120017_preview_game_center_reads.sql', import.meta.url), 'utf8');
const candidate = await readFile(new URL('../supabase/migrations/202609060001_preview_score_participant_playing_hcp.sql', import.meta.url), 'utf8');
const routine = source => source.match(/create or replace function public\.read_game_center_view[\s\S]*?\n\$\$;/)?.[0];

test('Score HCP migration changes only published lookup and participant HCP projection in the existing read routine', () => {
  const stripped = routine(candidate)
    .replace('  published_match_display jsonb;\n', '')
    .replace(/  -- Read projection only:[\s\S]*?where hp\.tournament_id = match_row\.tournament_id;\n/, '')
    .replace(/'course_handicap', mp\.course_handicap,\n    'playing_handicap', coalesce\([\s\S]*?pg_catalog\.to_jsonb\(mp\.playing_handicap\)\),/,
      "'course_handicap', mp.course_handicap, 'playing_handicap', mp.playing_handicap,");
  assert.equal(stripped, routine(base), 'Strokes, fields, formulas, IDs, query behavior and ordering must otherwise remain byte-identical');
});

test('migration keeps service-only read access and has no stored data or scoring write statement', () => {
  assert.match(candidate, /revoke all on function public\.read_game_center_view\(text\) from public, anon, authenticated;/);
  assert.match(candidate, /grant execute on function public\.read_game_center_view\(text\) to service_role;/);
  assert.doesNotMatch(candidate, /\b(?:insert\s+into|update\s+scoring_authority|delete\s+from|truncate|alter\s+table)\b/i);
  assert.equal((candidate.match(/create or replace function/g) || []).length, 1);
  assert.match(candidate, /hp\.presentation->'tournamentMatchDisplay'->match_row\.match_id/);
  assert.match(candidate, /hp\.tournament_id = match_row\.tournament_id/);
});
