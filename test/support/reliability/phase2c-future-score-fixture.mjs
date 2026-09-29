// Synthetic initial authority for the protected2099 annual-admission fixture only.
// No guard/calculator/trigger replacement. Fixture DML precedes scored mutations.
// This does not prove the Director preparation UI or an entire future tournament.
export const futureScoreFixture = Object.freeze({
 tournamentId:'2099',matchId:'2099-R3-1',actor:'AR01',authUserId:'00000000-0000-4000-8000-000000000091',
 handicapRevision:'20990000-0000-4000-8000-000000000001',seed:'phase2c-protected-future-score-v1',
 snapshotId:'2099-R3-1:PHASE2C-S1',format:'SI',round:3,
});
export const futureScoreFixtureSql = `begin;
set local session_replication_role=replica;
do $fixture$ begin
 if not exists(select 1 from scoring_authority.tournaments where tournament_id='2099' and scoring_authority='SUPABASE')
  or not exists(select 1 from scoring_authority.tournament_players where tournament_id='2099' and player_id='AR01')
  or exists(select 1 from scoring_authority.matches where match_id='2099-R3-1') then
  raise exception 'PROTECTED_ANNUAL_SCORE_FIXTURE_PREREQUISITE';end if;
end $fixture$;
insert into scoring_authority.players(player_id,display_name,source_payload)
 values('AR02','Synthetic Annual Opponent','{"synthetic":true}');
insert into scoring_authority.teams(tournament_id,team_id,team_side,name)
 values('2099','AR_TEAM1',1,'Synthetic One'),('2099','AR_TEAM2',2,'Synthetic Two');
insert into scoring_authority.rounds(tournament_id,round_number,format,name,handicap_allowance)
 values('2099',3,'SI','Synthetic Singles',1);
insert into scoring_authority.handicap_revisions(revision_id,tournament_id,revision_number,status,effective_date,method,
 canonical_fingerprint,roster_fingerprint,predecessor_revision,context_contract_version,created_by,approved_by,approved_at)
 values('20990000-0000-4000-8000-000000000001','2099',1,'APPROVED','2099-09-28','SYNTHETIC FIXTURE',
 repeat('a',64),repeat('b',64),0,'production-handicap-context-v1','phase2c','AR01',clock_timestamp());
insert into scoring_authority.handicap_revision_entries(revision_id,tournament_id,player_id,tournament_handicap)
 values('20990000-0000-4000-8000-000000000001','2099','AR01',6),
 ('20990000-0000-4000-8000-000000000001','2099','AR02',12);
insert into scoring_authority.handicap_revision_current(tournament_id,revision_id,revision_number)
 values('2099','20990000-0000-4000-8000-000000000001',1);
update scoring_authority.tournament_players set team_id='AR_TEAM1',team_side=1,tournament_handicap=6,
 handicap_revision_id='20990000-0000-4000-8000-000000000001',participation_status='ACTIVE'
 where tournament_id='2099' and player_id='AR01';
insert into scoring_authority.tournament_players(tournament_id,player_id,team_id,team_side,participation_status,
 source_roster_key,tournament_handicap,handicap_revision_id)
 values('2099','AR02','AR_TEAM2',2,'ACTIVE','phase2c-synthetic-opponent',12,'20990000-0000-4000-8000-000000000001');
insert into scoring_authority.tournament_setup_course_tees_v1(tournament_id,course_id,tee_id,display_name,rating,slope,par,
 setup_revision,updated_by_player_id)
 values('2099','AR_COURSE','Synthetic','Synthetic Annual Course',72,113,72,1,'AR01');
insert into scoring_authority.tournament_setup_course_holes_v1(tournament_id,course_id,tee_id,hole_number,par,stroke_index,yardage,setup_revision)
 select '2099','AR_COURSE','Synthetic',n,4,n,400,1 from generate_series(1,18)n;
insert into scoring_authority.tournament_setup_round_courses_v1(tournament_id,round_number,course_id,tee_id,setup_revision,updated_by_player_id)
 values('2099',3,'AR_COURSE','Synthetic',1,'AR01');
insert into scoring_authority.scoring_snapshots(snapshot_id,tournament_id,match_id,snapshot_revision,scoring_rules_version,
 format,handicap_allowance,course_id,tee,rating,slope,par,match_netting_baseline,hole_definitions,participant_configuration,
 team_configuration,canonical_hash,handicap_revision_id)
 values('2099-R3-1:PHASE2C-S1','2099','2099-R3-1',1,'phase2c-protected-future-score-v1','SI',1,'AR_COURSE','Synthetic',72,113,72,
 'FROZEN_MATCH_RELATIVE',
 (select jsonb_agg(jsonb_build_object('hole_number',n,'par',4,'stroke_index',n,'yardage',400)order by n)from generate_series(1,18)n),
 '{}','{}',encode(extensions.digest('phase2c-protected-future-score-v1','sha256'),'hex'),'20990000-0000-4000-8000-000000000001');
insert into scoring_authority.matches(match_id,tournament_id,round_number,format,scoring_snapshot_id,status)
 values('2099-R3-1','2099',3,'SI','2099-R3-1:PHASE2C-S1','LIVE');
insert into scoring_authority.match_participants(match_id,player_id,team_side,player_slot,tournament_handicap,handicap_index,
 course_handicap,playing_handicap,final_strokes,handicap_revision_id)
 values('2099-R3-1','AR01',1,1,6,6,6,6,0,'20990000-0000-4000-8000-000000000001'),
 ('2099-R3-1','AR02',2,1,12,12,12,12,6,'20990000-0000-4000-8000-000000000001');
insert into scoring_authority.tournament_setup_match_details_v1(match_id,tournament_id,round_number,match_number,course_id,tee_id,
 setup_revision,prepared_setup_revision,prepared_configuration_fingerprint,updated_by_player_id)
 values('2099-R3-1','2099',3,1,'AR_COURSE','Synthetic',1,1,repeat('d',64),'AR01');
insert into production_control.future_runtime_match_bindings_v2(tournament_id,match_id,structural_setup_revision,runtime_revision,
 runtime_state,configuration_fingerprint)
 values('2099','2099-R3-1',1,1,'PREPARED',repeat('d',64));
do $context$ declare context jsonb;participant jsonb;begin
 context:=production_control.future_handicap_match_context_v2('2099-R3-1','20990000-0000-4000-8000-000000000001');
 if jsonb_array_length(context->'participants')<>2 then raise exception 'ANNUAL_FIXTURE_PARTICIPANTS_REQUIRED';end if;
 update scoring_authority.scoring_snapshots set participant_configuration=context->'participant_configuration',
  team_configuration=context->'team_configuration' where snapshot_id='2099-R3-1:PHASE2C-S1';
 for participant in select value from jsonb_array_elements(context->'participants') loop
  update scoring_authority.match_participants set tournament_handicap=(participant->>'tournament_handicap')::numeric,
   handicap_index=(participant->>'handicap_index')::numeric,course_handicap=(participant->>'course_handicap')::numeric,
   playing_handicap=(participant->>'playing_handicap')::numeric,final_strokes=(participant->>'final_strokes')::integer
   where match_id='2099-R3-1' and player_id=participant->>'player_id';
 end loop;
end $context$;
insert into scoring_authority.match_holes(match_id,hole_number,snapshot_id,stroke_index,par,yardage)
 select '2099-R3-1',n,'2099-R3-1:PHASE2C-S1',n,4,400 from generate_series(1,18)n;
insert into scoring_authority.scoring_permissions(match_id,player_id,can_score,permission_revision)
 values('2099-R3-1','AR01',true,1),('2099-R3-1','AR02',true,1);
set local session_replication_role=origin;
do $proof$ declare readiness jsonb;begin
 readiness:=production_control.assert_future_production_match_scoring_ready_v1('2099-R3-1','2099');
 if readiness->>'ready'<>'true' then raise exception 'ANNUAL_SCORE_FIXTURE_NOT_READY: %',readiness;end if;
end $proof$;
commit;`;
export function futureScoreFixtureInput(annualInput) {
 return {...annualInput,annual_scoring_operation:'submit_production_hole_score',match_id:futureScoreFixture.matchId,
  hole_number:1,mutation_key:'20990000-0000-4000-8000-000000000101',expected_match_revision:0,expected_hole_revision:0,
  team_1_gross_scores:[4],team_2_gross_scores:[6],authorization:{tournament_id:'2099',match_id:futureScoreFixture.matchId,
   auth_user_id:futureScoreFixture.authUserId,player_id:futureScoreFixture.actor,role:'PLAYER',permission_revision:1}};
}
