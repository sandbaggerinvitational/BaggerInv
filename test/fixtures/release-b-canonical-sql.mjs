// Disposable PostgreSQL data only. No Preview reconstruction or live values.
// Existing authority computes contexts; fixed inputs intentionally hit rounding
// boundaries, signed cycles and a 35/15 team result distinct from Matchup Net.
export const releaseBSeed = `
set session_replication_role=replica;
insert into auth.users(id) values('10000000-0000-4000-8000-000000000009');
insert into scoring_authority.players(player_id,display_name) values('P1','One'),('P2','Two'),('P3','Three'),('P4','Four');
insert into scoring_authority.teams(tournament_id,team_id,team_side,name) values('2026','T1',1,'One'),('2026','T2',2,'Two');
insert into scoring_authority.rounds(tournament_id,round_number,format,name) values('2026',1,'BB','Best Ball'),('2026',2,'SC','Scramble'),('2026',3,'SI','Singles');
insert into scoring_authority.handicap_revisions(revision_id,tournament_id,revision_number,status,effective_date,method,
 canonical_fingerprint,roster_fingerprint,predecessor_revision,context_contract_version,created_by,approved_by,approved_at)
 values('10000000-0000-4000-8000-000000000001','2026',7,'APPROVED','2026-09-23','ISOLATED DETERMINISTIC TEST',
 repeat('a',64),repeat('b',64),0,'production-handicap-context-v1','fixture','P1',now());
insert into scoring_authority.handicap_revision_entries(revision_id,tournament_id,player_id,tournament_handicap)
 values('10000000-0000-4000-8000-000000000001','2026','P1',8.46),
 ('10000000-0000-4000-8000-000000000001','2026','P2',-0.5),
 ('10000000-0000-4000-8000-000000000001','2026','P3',36.5),
 ('10000000-0000-4000-8000-000000000001','2026','P4',0);
insert into scoring_authority.tournament_players(tournament_id,player_id,team_id,team_side,source_roster_key,tournament_handicap,handicap_revision_id)
 select '2026',player_id,case when player_id in('P1','P2') then 'T1' else 'T2' end,
 case when player_id in('P1','P2') then 1 else 2 end,'fixture:'||player_id,tournament_handicap,revision_id
 from scoring_authority.handicap_revision_entries where tournament_id='2026';
insert into scoring_authority.scoring_snapshots(snapshot_id,tournament_id,match_id,snapshot_revision,scoring_rules_version,format,
 handicap_allowance,course_id,tee,rating,slope,par,match_netting_baseline,hole_definitions,participant_configuration,team_configuration,canonical_hash,handicap_revision_id)
 select 'M'||round_number||':S1','2026','M'||round_number,1,'fixture',format,1,'C1','Tee',72,113,72,'fixture',
 (select jsonb_agg(jsonb_build_object('hole_number',n,'par',4,'stroke_index',n)) from generate_series(1,18)n),
 '{}','{}',repeat('c',64),'10000000-0000-4000-8000-000000000001' from scoring_authority.rounds where tournament_id='2026';
insert into scoring_authority.matches(match_id,tournament_id,round_number,format,scoring_snapshot_id,status)
 select 'M'||round_number,'2026',round_number,format,'M'||round_number||':S1','UPCOMING' from scoring_authority.rounds where tournament_id='2026';
insert into scoring_authority.match_participants(match_id,player_id,team_side,player_slot,handicap_index,course_handicap,playing_handicap,final_strokes,tournament_handicap,handicap_revision_id)
 select m.match_id,p.player_id,p.team_side,case when p.player_id in('P1','P3') then 1 else 2 end,
 p.tournament_handicap,p.tournament_handicap,0,0,p.tournament_handicap,p.handicap_revision_id
 from scoring_authority.matches m cross join scoring_authority.tournament_players p
 where m.tournament_id='2026' and p.tournament_id='2026' and (m.format<>'SI' or p.player_id in('P1','P3'));
insert into scoring_authority.match_holes(match_id,hole_number,snapshot_id,stroke_index,par)
 select match_id,n,scoring_snapshot_id,n,4 from scoring_authority.matches cross join generate_series(1,18)n where tournament_id='2026';
insert into scoring_authority.tournament_setup_course_tees_v1(tournament_id,course_id,tee_id,display_name,rating,slope,par,setup_revision,updated_by_player_id)
 values('2026','C1','Tee','Fixture Course',72,113,72,1,'P1');
insert into scoring_authority.tournament_setup_match_details_v1(match_id,tournament_id,round_number,match_number,course_id,tee_id,setup_revision,
 prepared_setup_revision,prepared_configuration_fingerprint,updated_by_player_id)
 select match_id,'2026',round_number,1,'C1','Tee',1,1,repeat('d',64),'P1' from scoring_authority.matches where tournament_id='2026';
do $$declare m record; ctx jsonb; p jsonb;begin
 for m in select * from scoring_authority.matches where tournament_id='2026' loop
 ctx:=production_control.handicap_v1_match_context(m.match_id,'10000000-0000-4000-8000-000000000001');
 update scoring_authority.scoring_snapshots set participant_configuration=ctx->'participant_configuration',team_configuration=ctx->'team_configuration' where snapshot_id=m.scoring_snapshot_id;
 for p in select value from jsonb_array_elements(ctx->'participants') loop
 update scoring_authority.match_participants set course_handicap=(p->>'course_handicap')::numeric,
 playing_handicap=(p->>'playing_handicap')::numeric,final_strokes=(p->>'final_strokes')::integer
 where match_id=m.match_id and player_id=p->>'player_id'; end loop; end loop;
end$$;
insert into scoring_authority.hole_scores(match_id,hole_number,hole_revision,team_1_gross_scores,team_2_gross_scores,team_1_strokes,team_2_strokes,
 team_1_net_score,team_2_net_score,hole_winner,mutation_key,actor_id)
 select match_id,n,1,case format when 'BB' then '[4,4]'::jsonb else '[4]'::jsonb end,
 case format when 'BB' then '[4,4]'::jsonb else '[4]'::jsonb end,'[0,0]','[0,0]',4,4,'Halved','fixture:'||n,'fixture'
 from scoring_authority.matches cross join generate_series(1,18)n where tournament_id='2026';
set session_replication_role=origin;
`;
