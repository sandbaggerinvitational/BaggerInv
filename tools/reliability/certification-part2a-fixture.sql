-- Repository-controlled Certification owner provisioning, never a client RPC.
-- Render with certification-part2a-fixture.mjs. Execute only after owner approval
-- and independent physical connection verification. No DDL or admitted context.
\set ON_ERROR_STOP on
begin;
set local search_path=pg_catalog;
set local lock_timeout='5s';
set local statement_timeout='60s';
DO $certification_fixture$
declare
 input jsonb:=/*OWNER_REQUEST*/;
 r production_control.canonical_resource_v1%rowtype;
 a production_control.certification_admission_v1%rowtype;
 p production_control.current_tournament_pointer_v1%rowtype;
 g scoring_authority.ingress_gates%rowtype;
 epoch scoring_authority.authority_epochs%rowtype;
 gen production_control.certification_ingress_generations_v1%rowtype;
 origin production_control.certification_initialization_origins_v1%rowtype;
 installed production_control.canonical_bootstrap_installation_v1%rowtype;
 prior production_control.operation_audit_events%rowtype;
 request_hash text;
 controls_before jsonb;
 controls_after jsonb;
 state_hash text;
 contact_fingerprint text;
 identity_row jsonb;
 match_row record;
 context jsonb;
 participant jsonb;
 cfg jsonb;
 cfg_manifest jsonb;
 guide_validation jsonb;
 guide_source jsonb;
 guide_source_text text;
 guide_source_hash text;
 guide_projection_id uuid;
 guide_content_id uuid;
 handicap_id constant uuid:='10000000-0000-4000-8000-000000000001';
begin
 /*PROVISIONING_GUARDS*/
 request_hash:=encode(extensions.digest(input::text,'sha256'),'hex');
 select * into prior from production_control.operation_audit_events
  where event_type='CERTIFICATION_PART2A_FIXTURE_BOOTSTRAPPED'
   and details->>'resource_id'=r.resource_id;
 if found then
  if prior.request_fingerprint is distinct from request_hash or prior.result<>'SUCCEEDED'
   or prior.details->>'operation_id' is distinct from input->>'operation_id' then
   raise exception using errcode='40001',message='CERTIFICATION_FIXTURE_CONFLICT';
  end if;
  state_hash:=encode(extensions.digest((/*FIXTURE_SNAPSHOT*/)::text,'sha256'),'hex');
  if state_hash is distinct from prior.details->>'fixture_state_sha256' then
   raise exception using errcode='40001',message='CERTIFICATION_FIXTURE_DRIFT';
  end if;
  raise notice 'CERTIFICATION_FIXTURE_IDEMPOTENT';
  return;
 end if;
 if /*EMPTY_FIXTURE*/ then
  raise exception using errcode='55000',message='CERTIFICATION_FIXTURE_EMPTY_BASE_REQUIRED';
 end if;

 insert into scoring_authority.players(player_id,display_name)
 values('P01','Synthetic Certification Director'),('P12','Synthetic Certification Participant A'),
  ('P11','Synthetic Certification Participant B'),('P24','Synthetic Certification Unlinked Opponent');
 insert into scoring_authority.teams(tournament_id,team_id,team_side,name)
 values('2026','T1',1,'Synthetic Certification Team One'),('2026','T2',2,'Synthetic Certification Team Two');
 insert into scoring_authority.rounds(tournament_id,round_number,format,name,handicap_allowance)
 values('2026',3,'SI','Synthetic Singles Smoke',1);
 insert into scoring_authority.handicap_revisions(revision_id,tournament_id,revision_number,status,effective_date,
  method,canonical_fingerprint,roster_fingerprint,predecessor_revision,context_contract_version,
  created_by,approved_by,approved_at,created_by_auth_user_id,approved_by_auth_user_id)
 values(handicap_id,'2026',1,'APPROVED','2026-09-23','SYNTHETIC CERTIFICATION FIXTURE',
  encode(extensions.digest('[{"id":"P01","handicap":0},{"id":"P11","handicap":0},{"id":"P12","handicap":0},{"id":"P24","handicap":0}]','sha256'),'hex'),
  encode(extensions.digest('["P01","P11","P12","P24"]','sha256'),'hex'),0,'production-handicap-context-v1',
  current_user,'P01',clock_timestamp(),'3003e93a-f0ec-422b-835e-5081fefb2e8e','3003e93a-f0ec-422b-835e-5081fefb2e8e');
 insert into scoring_authority.tournament_players(tournament_id,player_id,team_id,team_side,participation_status,
  source_roster_key,tournament_handicap,handicap_revision_id)
 select '2026',id,case when id in('P01','P12') then 'T1' else 'T2' end,
  case when id in('P01','P12') then 1 else 2 end,'ACTIVE','synthetic:'||id,0,handicap_id
 from unnest(array['P01','P12','P11','P24']) id;
 insert into scoring_authority.handicap_revision_entries(revision_id,tournament_id,player_id,tournament_handicap)
 select handicap_id,'2026',id,0 from unnest(array['P01','P12','P11','P24']) id;
 insert into scoring_authority.handicap_revision_current(tournament_id,revision_id,revision_number)
 values('2026',handicap_id,1);
 insert into scoring_authority.scoring_snapshots(snapshot_id,tournament_id,match_id,snapshot_revision,scoring_rules_version,
  format,handicap_allowance,course_id,tee,rating,slope,par,match_netting_baseline,hole_definitions,
  participant_configuration,team_configuration,canonical_hash,handicap_revision_id)
 select id||':S1','2026',id,1,'synthetic-reliability-v1','SI',1,'C3','Tournament',72,120,72,'synthetic',
  (select jsonb_agg(jsonb_build_object('hole_number',h,'par',4,'stroke_index',h,'yardage',400) order by h) from generate_series(1,18)h),
  '{}','{}',encode(extensions.digest(id||':S1','sha256'),'hex'),handicap_id
 from unnest(array['2026-R3-11','2026-R3-12']) id;
 insert into scoring_authority.matches(match_id,tournament_id,round_number,format,scoring_snapshot_id,status,scoring_locked)
 select id,'2026',3,'SI',id||':S1','UPCOMING',false from unnest(array['2026-R3-11','2026-R3-12']) id;
 insert into scoring_authority.match_participants(match_id,player_id,team_side,player_slot,tournament_handicap,
  handicap_index,course_handicap,playing_handicap,final_strokes,handicap_revision_id)
 select id,player_id,side,1,0,0,0,0,0,handicap_id from (values
  ('2026-R3-11','P01',1),('2026-R3-11','P11',2),('2026-R3-12','P12',1),('2026-R3-12','P24',2)) pair(id,player_id,side);
 insert into scoring_authority.tournament_setup_course_tees_v1(tournament_id,course_id,tee_id,display_name,rating,slope,par,
  setup_revision,updated_by_player_id) values('2026','C3','Tournament','Synthetic Certification Course',72,120,72,1,'P01');
 insert into scoring_authority.tournament_setup_course_holes_v1
 select '2026','C3','Tournament',h,4,h,400,1 from generate_series(1,18)h;
 insert into scoring_authority.tournament_setup_round_courses_v1(tournament_id,round_number,course_id,tee_id,setup_revision,updated_by_player_id)
 values('2026',3,'C3','Tournament',1,'P01');
 insert into scoring_authority.tournament_setup_match_details_v1(match_id,tournament_id,round_number,match_number,course_id,tee_id,
  setup_revision,prepared_setup_revision,prepared_configuration_fingerprint,updated_by_player_id)
 select id,'2026',3,n,'C3','Tournament',1,null,null,'P01' from (values('2026-R3-11',11),('2026-R3-12',12)) m(id,n);
 insert into production_control.tournament_setup_context_v1(tournament_id,contract_version,revision,updated_by_player_id,updated_by_auth_user_id)
 values('2026','production-tournament-setup-v1',1,'P01','3003e93a-f0ec-422b-835e-5081fefb2e8e');
 for match_row in select * from scoring_authority.matches loop
  context:=production_control.handicap_v1_match_context(match_row.match_id,handicap_id);
  update scoring_authority.scoring_snapshots set participant_configuration=context->'participant_configuration',
   team_configuration=context->'team_configuration' where snapshot_id=match_row.scoring_snapshot_id;
  for participant in select value from jsonb_array_elements(context->'participants') loop
   update scoring_authority.match_participants set tournament_handicap=(participant->>'tournament_handicap')::numeric,
    handicap_index=(participant->>'handicap_index')::numeric,course_handicap=(participant->>'course_handicap')::numeric,
    playing_handicap=(participant->>'playing_handicap')::numeric,final_strokes=(participant->>'final_strokes')::integer
   where match_id=match_row.match_id and player_id=participant->>'player_id';
  end loop;
 end loop;
 insert into scoring_authority.match_holes(match_id,hole_number,snapshot_id,stroke_index,par,yardage)
 select match_id,h,scoring_snapshot_id,h,4,400 from scoring_authority.matches cross join generate_series(1,18)h;
 insert into scoring_authority.scoring_permissions(match_id,player_id,can_score,permission_revision,revoked_at,updated_at)
 select match_id,player_id,false,1,clock_timestamp(),clock_timestamp() from scoring_authority.match_participants;
 insert into scoring_authority.game_center_presentations(match_id,tournament_id,match_sort_order,display_match_number,
  source_workbook_id,source_payload_hash,imported_by)
 select match_id,'2026',row_number() over(order by match_id),split_part(match_id,'-',3),r.provenance_id,
  encode(extensions.digest(match_id,'sha256'),'hex'),'CERTIFICATION_FIXTURE_OWNER' from scoring_authority.matches;
 for identity_row in select value from jsonb_array_elements(input->'identities') loop
  insert into participant_identity.user_player_links(auth_user_id,player_id,status,link_method,email_identity_hash)
  values((identity_row->>'auth_user_id')::uuid,identity_row->>'player_id','ACTIVE','SYNTHETIC_FIXTURE',
   encode(extensions.digest(identity_row->>'email','sha256'),'hex'));
  insert into participant_identity.participant_auth_identifiers(player_id,auth_user_id,identifier_type,normalized_value_private,
   status,verified_at,verification_source,source_system,created_by,updated_by)
  values(identity_row->>'player_id',(identity_row->>'auth_user_id')::uuid,'EMAIL',identity_row->>'email','VERIFIED',
   clock_timestamp(),'SYNTHETIC_FIXTURE','SYNTHETIC_FIXTURE',current_user,current_user);
  insert into participant_identity.tournament_roles(tournament_id,auth_user_id,role,granted_by)
  values('2026',(identity_row->>'auth_user_id')::uuid,identity_row->>'role',current_user);
 end loop;
 /*IDENTITY_CONTACTS*/
 /*SYNTHETIC_GUIDE*/
 insert into production_control.director_entitlements(auth_user_id,tournament_id,player_id,role,granted_by)
 values('3003e93a-f0ec-422b-835e-5081fefb2e8e','2026','P01','DIRECTOR',current_user);
 cfg:=jsonb_build_object('contract_version','production-calcutta-v1',
  'point_structure',(select jsonb_agg(jsonb_build_object('place',n,'round_1_award','0','round_2_award','0','round_3_award',(5-n)::text) order by n) from generate_series(1,4)n),
  'payout_structure',(select jsonb_agg(jsonb_build_object('place',n,'round_1_fraction','0','round_2_fraction','0',
   'round_3_fraction','0','overall_fraction',((5-n)::numeric/10)::text) order by n) from generate_series(1,4)n));
 cfg_manifest:=production_control.build_production_calcutta_v1_configuration(cfg);
 with added as(insert into scoring_authority.calcutta_v1_configuration_revisions(tournament_id,configuration_revision,contract_version,
  state,configuration_manifest,configuration_fingerprint,resource_fingerprint,activation_revision,authority_epoch_id,
  configured_by_player_id,configured_by_auth_user_id,request_fingerprint,request_payload_hash,configured_at)
 values('2026',1,'production-calcutta-v1','CONFIGURED',cfg_manifest,production_control.calcutta_v1_hash(cfg_manifest),
  production_control.calcutta_v1_hash(input->'resource'),a.activation_revision,a.authority_epoch_id,'P01',
  '3003e93a-f0ec-422b-835e-5081fefb2e8e',request_hash,production_control.calcutta_v1_hash(cfg),clock_timestamp()) returning *)
 insert into scoring_authority.calcutta_v1_current(tournament_id,configuration_revision_id,configuration_revision,configuration_fingerprint,state)
 select tournament_id,configuration_revision_id,configuration_revision,configuration_fingerprint,'CONFIGURED' from added;
 controls_after:=jsonb_build_object('resource',(select to_jsonb(v) from production_control.canonical_resource_v1 v),
  'admission',(select to_jsonb(v) from production_control.certification_admission_v1 v),'pointer',(select to_jsonb(v) from production_control.current_tournament_pointer_v1 v),
  'gate',(select to_jsonb(v) from scoring_authority.ingress_gates v),'epoch',(select to_jsonb(v) from scoring_authority.authority_epochs v),
  'generation',(select to_jsonb(v) from production_control.certification_ingress_generations_v1 v),
  'origin',(select to_jsonb(v) from production_control.certification_initialization_origins_v1 v),'receipt',(select to_jsonb(v) from production_control.canonical_bootstrap_installation_v1 v));
 if controls_after is distinct from controls_before then
  raise exception using errcode='55000',message='CERTIFICATION_FIXTURE_CONTROL_CHANGED';
 end if;
 state_hash:=encode(extensions.digest((/*FIXTURE_SNAPSHOT*/)::text,'sha256'),'hex');
 insert into production_control.operation_audit_events(event_type,domain,tournament_id,actor,request_fingerprint,result,details)
 values('CERTIFICATION_PART2A_FIXTURE_BOOTSTRAPPED','CERTIFICATION_FIXTURE','2026',current_user,request_hash,'SUCCEEDED',
  jsonb_build_object('contract',input->>'contract','operation_id',input->>'operation_id','resource_id',r.resource_id,
   'registration_revision',r.registration_revision,'deployment',input->'deployment','expected',input->'expected',
   'package_sha256',input->>'package_sha256','fixture_state_sha256',state_hash,'auth_links',input->'identities',
   'players',4,'teams',2,'rounds',1,'matches',2,'enabled',false,'ingress','PAUSED'));
 raise notice 'CERTIFICATION_FIXTURE_COMMITTED';
end;
$certification_fixture$;
commit;
