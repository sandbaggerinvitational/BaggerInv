// Historical-volume fixture only. Runs through the owned socket-only cluster API.
// It adds unrelated synthetic seasons without advancing any current pointer.
import assert from "node:assert/strict";
import { sql } from "./postgres17.mjs";

export function archivedYearCounts(scale) {
  assert.ok([1, 2, 5, 10].includes(scale));
  return { archivedYears: scale, archivedPlayers: 24 * scale,
    archivedRounds: 3 * scale, archivedMatches: 24 * scale,
    archivedParticipants: 72 * scale, archivedMatchHoles: 432 * scale,
    archivedScores: 432 * scale };
}

export function seedSyntheticArchivedYears(cluster, database, scale) {
  const expected = archivedYearCounts(scale);
  const pointerBefore = sql(cluster, database,
    "select current_tournament_id from production_control.resource_scope where scope_key='BAGGER_INV_PRODUCTION'", { role: "" });
  // All names are generated here; no external payload or Production connection.
  for (let offset = 1; offset <= scale; offset++) {
    const year = String(2026 - offset);
    const prefix = `H${year}-`;
    sql(cluster, database, `begin;
      set local session_replication_role=replica;
      insert into scoring_authority.tournaments
        select (jsonb_populate_record(null::scoring_authority.tournaments,
          to_jsonb(t)||jsonb_build_object('tournament_id','${year}','tournament_year',${year},
          'name','Synthetic historical ${year}','source_workbook_id','synthetic-local-${year}'))).*
        from scoring_authority.tournaments t where tournament_id='2026';
      insert into scoring_authority.teams
        select (jsonb_populate_record(null::scoring_authority.teams,to_jsonb(t)||
          jsonb_build_object('tournament_id','${year}'))).*
        from scoring_authority.teams t where tournament_id='2026';
      insert into scoring_authority.rounds
        select (jsonb_populate_record(null::scoring_authority.rounds,to_jsonb(t)||
          jsonb_build_object('tournament_id','${year}','status','FINAL'))).*
        from scoring_authority.rounds t where tournament_id='2026';
      insert into scoring_authority.players
        select (jsonb_populate_record(null::scoring_authority.players,to_jsonb(t)||
          jsonb_build_object('player_id','${prefix}'||player_id,
          'display_name','Synthetic historical ${year} '||player_id))).*
        from scoring_authority.players t where player_id ~ '^P[0-9]{2}$';
      insert into scoring_authority.tournament_players
        select (jsonb_populate_record(null::scoring_authority.tournament_players,to_jsonb(t)||
          jsonb_build_object('tournament_id','${year}','player_id','${prefix}'||player_id,
          'source_roster_key','synthetic:${year}:'||player_id,'handicap_revision_id',null))).*
        from scoring_authority.tournament_players t where tournament_id='2026';
      insert into scoring_authority.scoring_snapshots
        select (jsonb_populate_record(null::scoring_authority.scoring_snapshots,to_jsonb(t)||
          jsonb_build_object('tournament_id','${year}','snapshot_id',replace(snapshot_id,'2026-','${year}-'),
          'match_id',replace(match_id,'2026-','${year}-'),'handicap_revision_id',null,
          'participant_configuration',replace(participant_configuration::text,'"P','"${prefix}P')::jsonb,
          'team_configuration',replace(team_configuration::text,'"P','"${prefix}P')::jsonb,
          'canonical_hash',md5('${year}:'||snapshot_id)||md5(snapshot_id||':${year}')))).*
        from scoring_authority.scoring_snapshots t where tournament_id='2026';
      insert into scoring_authority.matches
        select (jsonb_populate_record(null::scoring_authority.matches,to_jsonb(t)||
          jsonb_build_object('tournament_id','${year}','match_id',replace(match_id,'2026-','${year}-'),
          'scoring_snapshot_id',replace(scoring_snapshot_id,'2026-','${year}-'),
          'status','FINAL','scoring_locked',true,'scored_holes',18,'current_hole',18,
          'holes_remaining',0,'scorecard_complete',true,'finalized_at','${year}-09-27T18:00:00Z'))).*
        from scoring_authority.matches t where tournament_id='2026';
      insert into scoring_authority.match_participants
        select (jsonb_populate_record(null::scoring_authority.match_participants,to_jsonb(t)||
          jsonb_build_object('match_id',replace(match_id,'2026-','${year}-'),
          'player_id','${prefix}'||player_id,'handicap_revision_id',null))).*
        from scoring_authority.match_participants t where match_id like '2026-%';
      insert into scoring_authority.match_holes
        select (jsonb_populate_record(null::scoring_authority.match_holes,to_jsonb(t)||
          jsonb_build_object('match_id',replace(match_id,'2026-','${year}-'),
          'snapshot_id',replace(snapshot_id,'2026-','${year}-')))).*
        from scoring_authority.match_holes t where match_id like '2026-%';
      insert into scoring_authority.hole_scores(match_id,hole_number,hole_revision,
        team_1_gross_scores,team_2_gross_scores,team_1_strokes,team_2_strokes,
        team_1_net_score,team_2_net_score,hole_winner,mutation_key,actor_id)
        select m.match_id,h.hole_number,1,
          case when m.format='BB' then '[4,5]'::jsonb else '[4]'::jsonb end,
          case when m.format='BB' then '[5,6]'::jsonb else '[5]'::jsonb end,
          case when m.format='BB' then '[0,0]'::jsonb else '[0]'::jsonb end,
          case when m.format='BB' then '[0,0]'::jsonb else '[0]'::jsonb end,
          4,5,'Team 1','synthetic-history:'||m.match_id||':'||h.hole_number,'synthetic-fixture'
        from scoring_authority.matches m join scoring_authority.match_holes h using(match_id)
        where m.tournament_id='${year}';
      commit;`, { role: "" });
  }
  const actual = JSON.parse(sql(cluster, database, `select jsonb_build_object(
    'archivedYears',(select count(*) from scoring_authority.tournaments where source_workbook_id like 'synthetic-local-%'),
    'archivedPlayers',(select count(*) from scoring_authority.players where player_id ~ '^H[0-9]{4}-P'),
    'archivedRounds',(select count(*) from scoring_authority.rounds where tournament_id <> '2026'),
    'archivedMatches',(select count(*) from scoring_authority.matches where tournament_id <> '2026'),
    'archivedParticipants',(select count(*) from scoring_authority.match_participants where player_id ~ '^H[0-9]{4}-P'),
    'archivedMatchHoles',(select count(*) from scoring_authority.match_holes where match_id not like '2026-%'),
    'archivedScores',(select count(*) from scoring_authority.hole_scores where match_id not like '2026-%'))`, { role: "" }));
  assert.deepEqual(actual, expected);
  assert.equal(sql(cluster, database,
    "select current_tournament_id from production_control.resource_scope where scope_key='BAGGER_INV_PRODUCTION'", { role: "" }), pointerBefore);
  return actual;
}
