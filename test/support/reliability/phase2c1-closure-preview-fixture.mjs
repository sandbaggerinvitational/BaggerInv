// Synthetic fixture construction adapted verbatim from the existing Preview
// mobile PostgreSQL fixture. No runtime score write is replaced by fixture SQL.
import {createHash} from 'node:crypto';
import {sql,jsonLiteral} from './postgres17.mjs';
const literal=value=>`'${String(value).replaceAll("'","''")}'`;
export function seedPreviewDirectorFixture(cluster, database) {
  const holes = Array.from({ length: 18 }, (_, index) => ({
    hole_number: index + 1,
    par: 4,
    stroke_index: index + 1,
    yardage: 400 + index,
  }));
  const fingerprint = createHash("sha256").update("preview-mobile-scoring-fixture").digest("hex");
  sql(cluster, database, `
    insert into scoring_authority.tournaments
      (tournament_id, tournament_year, name, source_workbook_id, scoring_authority)
    values ('2026', 2026, 'Synthetic Preview', 'synthetic-preview-workbook', 'SUPABASE');
    insert into scoring_authority.teams (tournament_id, team_id, team_side, name)
    values ('2026', 'T1', 1, 'Team One'), ('2026', 'T2', 2, 'Team Two');
    insert into scoring_authority.players (player_id, display_name) values
      ('P1', 'Player One'), ('P2', 'Player Two'), ('P3', 'Player Three'),
      ('P4', 'Player Four'), ('P9', 'Unassigned Player');
    insert into scoring_authority.tournament_players
      (tournament_id, player_id, team_id, team_side, source_roster_key)
    values
      ('2026', 'P1', 'T1', 1, 'P1'), ('2026', 'P2', 'T1', 1, 'P2'),
      ('2026', 'P3', 'T2', 2, 'P3'), ('2026', 'P4', 'T2', 2, 'P4'),
      ('2026', 'P9', 'T2', 2, 'P9');
    insert into scoring_authority.rounds (tournament_id, round_number, format, name, status)
    values ('2026', 1, 'BB', 'Round 1', 'LIVE');
    insert into scoring_authority.scoring_snapshots
      (snapshot_id, tournament_id, match_id, snapshot_revision, scoring_rules_version, format,
       course_id, tee, rating, slope, par, match_netting_baseline, hole_definitions,
       participant_configuration, team_configuration, canonical_hash)
    values
      ('M1:S1', '2026', 'M1', 1, 'v1', 'BB', 'C1', 'Blue', 72, 125, 72, 'LOW',
       ${jsonLiteral(holes)}, '{}'::jsonb, '{}'::jsonb, ${literal(fingerprint)}),
      ('MF:S1', '2026', 'MF', 1, 'v1', 'BB', 'C1', 'Blue', 72, 125, 72, 'LOW',
       ${jsonLiteral(holes)}, '{}'::jsonb, '{}'::jsonb, ${literal(fingerprint)}),
      ('M2:S1', '2026', 'M2', 1, 'v1', 'BB', 'C1', 'Blue', 72, 125, 72, 'LOW',
       ${jsonLiteral(holes)}, '{}'::jsonb, '{}'::jsonb, ${literal(fingerprint)});
    insert into scoring_authority.matches
      (match_id, tournament_id, round_number, format, scoring_snapshot_id, status,
       scoring_locked, permission_revision, match_revision, scored_holes, current_hole,
       holes_remaining, team_1_holes_won, team_2_holes_won, running_result,
       result_winner, scorecard_complete)
    values
      ('M1', '2026', 1, 'BB', 'M1:S1', 'LIVE', false, 7, 10, 0, 0, 18, 0, 0, 'Scheduled', '', false),
      ('M2', '2026', 1, 'BB', 'M2:S1', 'LIVE', false, 7, 10, 0, 0, 18, 0, 0, 'Scheduled', '', false),
      ('MF', '2026', 1, 'BB', 'MF:S1', 'LIVE', false, 7, 18, 18, 18, 0, 18, 0,
       'Team 1 wins 18 UP', 'Team 1', true);
    insert into scoring_authority.match_participants
      (match_id, player_id, team_side, player_slot, playing_handicap, final_strokes)
    select match_id, player_id, team_side, player_slot, 0, 0
    from (values
      ('M1', 'P1', 1, 1), ('M1', 'P2', 1, 2), ('M1', 'P3', 2, 1), ('M1', 'P4', 2, 2),
      ('M2', 'P1', 1, 1), ('M2', 'P2', 1, 2), ('M2', 'P3', 2, 1), ('M2', 'P4', 2, 2),
      ('MF', 'P1', 1, 1), ('MF', 'P2', 1, 2), ('MF', 'P3', 2, 1), ('MF', 'P4', 2, 2)
    ) fixture(match_id, player_id, team_side, player_slot);
    insert into scoring_authority.scoring_permissions
      (match_id, player_id, can_score, permission_revision)
    select match_id, player_id, true, 7
    from (values
      ('M1', 'P1'), ('M1', 'P2'), ('M2', 'P1'), ('MF', 'P1')
    ) fixture(match_id, player_id);
    insert into scoring_authority.match_holes
      (match_id, hole_number, snapshot_id, stroke_index, par, yardage)
    select match_id, hole_number, match_id || ':S1', hole_number, 4, 400 + hole_number
    from (values ('M1'), ('M2'), ('MF')) matches(match_id)
    cross join generate_series(1, 18) holes(hole_number);
    insert into scoring_authority.hole_scores
      (match_id, hole_number, hole_revision, team_1_gross_scores, team_2_gross_scores,
       team_1_strokes, team_2_strokes, team_1_net_score, team_2_net_score,
       hole_winner, mutation_key, actor_id)
    select 'MF', hole_number, 1, '[4,5]'::jsonb, '[5,6]'::jsonb,
      '[0,0]'::jsonb, '[0,0]'::jsonb, 4, 5, 'Team 1', 'seed-mf-' || hole_number, 'P1'
    from generate_series(1, 18) holes(hole_number);
    insert into scoring_authority.ingress_gates
      (tournament_id, state, authority, updated_by)
    values ('2026', 'OPEN', 'SUPABASE', 'integration-test');
  `);
}
