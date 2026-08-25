import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/production_migrations/202608240027_production_step11_completed_history_fixture.sql",
  import.meta.url,
);

test("Step 11 scoring fixture resolves only from the certified current completed-history revision", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /create or replace function production_rehearsal\.completed_source_fixture\(requested_match_id text\)/i);
  for (const relation of [
    "completed_history_current_revisions",
    "completed_history_revisions",
    "completed_history_tournament_facts",
    "completed_history_matches",
    "completed_history_match_participants",
    "completed_history_course_appearances",
  ]) {
    assert.match(sql, new RegExp(`scoring_authority\\.${relation}`, "i"));
  }

  assert.match(sql, /revision\.revision_id = current_revision\.revision_id/i);
  assert.match(sql, /revision\.project_ref = current_revision\.project_ref/i);
  assert.match(sql, /revision\.source_workbook_id = current_revision\.source_workbook_id/i);
  assert.match(sql, /current_revision\.project_ref = 'ymqhhtxaywtqllynrmxe'/i);
  assert.match(sql, /current_revision\.source_workbook_id = '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'/i);
  assert.match(sql, /current_revision\.tournament_year between 2017 and 2025/i);
  assert.match(sql, /current_revision\.tournament_id <> '2026'/i);
  assert.match(sql, /upper\(completed_match\.lifecycle\) = 'FINAL'/i);
  assert.match(sql, /upper\(completed_match\.format\) in \('BB', 'SC', 'SI'\)/i);
});

test("completed fixture preserves real participant, course, revision, and ordering provenance", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /jsonb_agg\([\s\S]*?participant\.player_id[\s\S]*?order by participant\.team_side, participant\.player_slot, participant\.player_id[\s\S]*?\) as participant_ids/i);
  assert.match(sql, /participants\.participant_count >= 2/i);
  assert.match(sql, /course\.appearance_id = completed_match\.course_appearance_id/i);
  for (const key of [
    "sourceRevisionId",
    "sourceRevisionNumber",
    "sourceRevisionFingerprint",
    "participantIds",
    "courseId",
    "tee",
  ]) {
    assert.match(sql, new RegExp(`'${key}'`));
  }
  assert.match(sql, /order by candidate\.tournament_year desc, candidate\.match_id/i);
  assert.match(sql, /PRODUCTION_STEP11_COMPLETED_SOURCE_MATCH_REQUIRED/);
});

test("begin-time verification binds the frozen fixture to that historical revision and never writes canonical facts", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /create or replace function public\.begin_production_step11_scoring_rehearsal\(input jsonb\)/i);
  assert.match(sql, /database_fixture := production_rehearsal\.completed_source_fixture\(source_match\)/i);
  assert.match(sql, /database_fixture->>'sourceTournamentId' <> source_tournament/i);
  assert.match(sql, /\(database_fixture->>'sourceTournamentYear'\)::integer, 0\) <> source_year/i);
  assert.match(sql, /database_fixture->>'sourceMatchId' <> source_match/i);
  assert.match(sql, /input->'frozen_fixture' <> database_fixture/i);
  assert.match(sql, /PRODUCTION_STEP11_SOURCE_FIXTURE_MISMATCH/i);

  assert.doesNotMatch(sql, /\b(?:insert\s+into|update|delete\s+from)\s+scoring_authority\./i);
  assert.doesNotMatch(sql, /\bscoring_authority\.(?:matches|tournaments|match_participants|scoring_snapshots)\b/i);
  assert.doesNotMatch(sql, /grant execute[^;]+to\s+(?:public|anon|authenticated)\b/i);
  assert.match(sql, /revoke all on function production_rehearsal\.completed_source_fixture\(text\)[\s\S]*?from public, anon, authenticated, service_role/i);
  assert.match(sql, /grant execute on function public\.begin_production_step11_scoring_rehearsal\(jsonb\)[\s\S]*?to service_role/i);
});
