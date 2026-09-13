import {historicalCanonicalData,historicalFixture} from './fixtures/reviewer-history.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {releaseBSeed} from './fixtures/release-b-canonical-sql.mjs';
import {available,createCluster,destroyCluster,run,bin,environment,sql,sqlFile,
 installSupabaseCompatibility,installAnnualPlatformFixture,migrationNames}
 from './step13e7b1-production-annual-calcutta-postgres.integration.test.mjs';
test('2K1 additive shipping migrations install over the complete canonical schema',async t=>{
 assert.ok(await available());const c=await createCluster();t.after(()=>destroyCluster(c));
 const db='shipping';run(bin.createdb,[db],{env:environment(c)});installSupabaseCompatibility(c,db);
 const dir=new URL('../supabase/production_migrations/',import.meta.url);
 const names=await migrationNames();
 for(const name of names.filter(n=>n<'202609110101')) {
  sqlFile(c,db,new URL(name,dir).pathname);
  if(name.startsWith('202608260038'))sql(c,db,`insert into scoring_authority.tournaments(tournament_id,tournament_year,name,source_workbook_id,scoring_authority)
   values('2026',2026,'Local shipping fixture','1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4','GOOGLE');
   insert into scoring_authority.ingress_gates(tournament_id,state,authority,unresolved_client_queues,updated_by)values('2026','PAUSED','GOOGLE',0,'local');`);
  if(name.startsWith('202608300068'))installAnnualPlatformFixture(c,db);
 }
 const signatures=['public.complete_production_calcutta_v1_recalculation(jsonb)',
  'public.configure_production_net_skins_v1(jsonb)',
  'public.complete_production_net_skins_v1_recalculation(jsonb)',
  'production_control.normalize_production_net_skins_v1_official_result(integer,jsonb)'];
 const fingerprint=()=>signatures.map(s=>sql(c,db,`select md5(prosrc) from pg_proc where oid='${s}'::regprocedure`));
 const before=fingerprint();
 for(const name of names.filter(n=>n>='202609110101'))sqlFile(c,db,new URL(name,dir).pathname);
 assert.deepEqual(fingerprint(),before,'Calculation/mutation/publication authority functions must remain unchanged');
 sql(c,db,`insert into auth.users(id,email,email_confirmed_at) values('40000000-0000-4000-8000-000000000001','fixture@example.invalid',now());
 insert into scoring_authority.players(player_id,display_name) values('FIXTURE_DELETE','Historical Fixture');
 insert into participant_identity.user_player_links(auth_user_id,player_id,status,link_method,email_identity_hash)
 values('40000000-0000-4000-8000-000000000001','FIXTURE_DELETE','ACTIVE','local-test',repeat('a',64));`);
 const deletion=JSON.parse(sql(c,db,`set request.jwt.claim.role='service_role'; select public.initiate_account_deletion_v1('40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001')`));
 assert.equal(deletion.status,'READY');
 sql(c,db,`delete from auth.users where id='40000000-0000-4000-8000-000000000001'`);
 assert.equal(sql(c,db,`select count(*) from scoring_authority.players where player_id='FIXTURE_DELETE'`),'1');
 assert.equal(sql(c,db,`select status from participant_identity.account_deletion_requests_v1 where request_id='50000000-0000-4000-8000-000000000001'`),'COMPLETED');

 sql(c,db,releaseBSeed);
 const detail={policy:'production-full-course-handicap-v1',official:true,entryId:'M2:team:1',matchId:'M2',snapshotId:'M2:S1',playerIds:['P1','P2']};
 const labels=(d=detail)=>JSON.parse(sql(c,db,`select coalesce(production_control.native_published_skins_labels_v1('2026','${JSON.stringify({calculationPolicy:'production-full-course-handicap-v1',fullNetDetail:[d]})}'::jsonb),'null'::jsonb)`));
 assert.equal(labels(),null,'Upcoming match cannot supply official labels');
 // Fixture setup only: no remote match or finalization authority invoked.
 sql(c,db,`set session_replication_role=replica; update scoring_authority.matches set status='FINAL',scorecard_complete=true where match_id='M2'; set session_replication_role=origin;`);
 const publishedLabels=labels();
 assert.deepEqual(publishedLabels.entries[0].players,[{playerId:'P1',name:'One'},{playerId:'P2',name:'Two'}]);
 assert.deepEqual(publishedLabels.entries[0].team,{teamId:'T1',name:'One'});
 assert.equal(publishedLabels.entries[0].course.courseId,'C1');
 assert.equal(labels({...detail,snapshotId:'wrong'}),null);
 assert.equal(labels({...detail,playerIds:['P1','missing']}),null);
 assert.equal(labels({...detail,official:false}),null);
 assert.equal(sql(c,db,`select count(*) from participant_identity.review_access_v1`),'0');
 assert.equal(sql(c,db,`select count(*) from participant_identity.account_deletion_requests_v1 where status <> 'COMPLETED'`),'0');
 assert.equal(sql(c,db,`select has_function_privilege('authenticated','production_control.native_published_skins_labels_v1(text,jsonb)','execute')`),'f');
 assert.equal(sql(c,db,`select production_control.native_published_skins_labels_v1('2026','{}') is null`),'t');
 // Disposable identities exercise the full canonical reviewer SQL boundary.
 const reviewer='60000000-0000-4000-8000-000000000001';
 sql(c,db,`insert into auth.users(id,email,email_confirmed_at) values('${reviewer}','review-fixture@example.invalid',now());
 insert into participant_identity.review_access_v1(auth_user_id,tournament_id,final_match_id,active,protected,expires_at)
 values('${reviewer}','2026','M2',true,true,now()+interval '1 hour');`);
 const readReviewer=()=>JSON.parse(sql(c,db,`set request.jwt.claim.role='service_role';select public.read_native_review_context_v1('${reviewer}','2026')`));
 assert.equal(readReviewer().data.kind,'observer');assert.equal(readReviewer().data.playerId,undefined);
 assert.equal(sql(c,db,`select count(*) from participant_identity.user_player_links where auth_user_id='${reviewer}'`),'0');
 assert.equal(sql(c,db,`select has_function_privilege('authenticated','public.native_review_otp_v1(text,jsonb)','execute')`),'f');
 const otp=(operation,input)=>JSON.parse(sql(c,db,`set request.jwt.claim.role='service_role';select public.native_review_otp_v1('${operation}','${JSON.stringify(input)}'::jsonb)`));
 assert.equal(otp('request',{email:'unapproved@example.invalid',client_request_hash:'b'.repeat(64)}).handled,false);
 const issued=otp('request',{email:'review-fixture@example.invalid',client_request_hash:'b'.repeat(64)});
 assert.equal(issued.allowed,true);assert.equal(issued.playerId,undefined);
 assert.equal(otp('request',{email:'review-fixture@example.invalid',client_request_hash:'b'.repeat(64)}).allowed,false);
 const binding={request_id:issued.requestId,auth_user_id:reviewer,email_identity_hash:sql(c,db,`select encode(extensions.digest('review-fixture@example.invalid','sha256'),'hex')`)};
 assert.equal(otp('verify',binding).allowed,false,'Must have recorded delivery');
 assert.equal(otp('delivery',{request_id:issued.requestId,succeeded:true}).allowed,true);
 assert.equal(otp('verify',{...binding,auth_user_id:'60000000-0000-4000-8000-000000000002'}).allowed,false);
 assert.equal(otp('complete',binding).allowed,true);
 const revision=readReviewer().data.contextRevision;
 sql(c,db,`update participant_identity.review_access_v1 set active=false where auth_user_id='${reviewer}'`);
 assert.equal(readReviewer().ok,false);assert.equal(otp('verify',binding).allowed,false);
 sql(c,db,`update participant_identity.review_access_v1 set active=true where auth_user_id='${reviewer}'`);
 assert.equal(readReviewer().data.contextRevision,revision+2);assert.equal(otp('verify',binding).allowed,false,'Old challenge remains revoked after reactivation');
 const protectedReceipt=JSON.parse(sql(c,db,`set request.jwt.claim.role='service_role';select public.initiate_account_deletion_v1('${reviewer}','70000000-0000-4000-8000-000000000001')`));
 assert.equal(protectedReceipt.status,'PENDING_REVIEW_ACCESS_HANDOFF');assert.equal(protectedReceipt.completed,false);
 assert.throws(()=>sql(c,db,`delete from auth.users where id='${reviewer}'`));
 assert.equal(readReviewer().ok,true,'Pending deletion must preserve review access');
 assert.equal(sql(c,db,`select count(*) from auth.users where id='${reviewer}'`),'1');
 assert.equal(sql(c,db,`set request.jwt.claim.role='service_role';select production_control.native_calcutta_reader_v1(null,'2026','${reviewer}')`),'t');
 assert.equal(sql(c,db,`set request.jwt.claim.role='service_role';select production_control.native_calcutta_reader_v1('P1','2026','${reviewer}')`),'f','Cannot mix observer and competitive identity');
 assert.equal(sql(c,db,`set request.jwt.claim.role='service_role';select production_control.native_calcutta_reader_v1(null,'2026','60000000-0000-4000-8000-000000000099')`),'f');
 for(const role of ['anon','authenticated']) {
   assert.equal(sql(c,db,`select has_table_privilege('${role}','participant_identity.review_access_v1','insert')`),'f');
   assert.equal(sql(c,db,`select has_function_privilege('${role}','public.read_native_review_context_v1(uuid,text)','execute')`),'f');
 }
 sql(c,db,`set session_replication_role=replica;update scoring_authority.matches set status='LIVE' where match_id='M2';set session_replication_role=origin;`);
 assert.equal(readReviewer().ok,true,'Identity must remain eligible independently of any match');
 assert.equal(JSON.parse(sql(c,db,`set request.jwt.claim.role='service_role';select public.read_native_review_history_fixture_v1('${reviewer}','2026')`)).ok,false,'Missing historical binding grants no fixture access');
 assert.equal(sql(c,db,`set request.jwt.claim.role='service_role';select production_control.native_calcutta_reader_v1(null,'2026','${reviewer}')`),'t','Published reads are independent of fixture availability');
 // Historical facts below are disposable local fixtures, never remote writes.
 const history=historicalCanonicalData(), rev=historicalFixture.revisionId;
 const insert=(table,row)=>{const keys=Object.keys(row);const values=keys.map(k=>row[k]===null?'null':typeof row[k]==='object'?`'${JSON.stringify(row[k]).replaceAll("'","''")}'::jsonb`:`'${String(row[k]).replaceAll("'","''")}'`);sql(c,db,`set session_replication_role=replica;insert into scoring_authority.${table}(${keys.join(',')}) values(${values.join(',')});set session_replication_role=origin;`);};
 insert('completed_history_revisions',{revision_id:rev,project_ref:'ymqhhtxaywtqllynrmxe',source_workbook_id:'1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4',tournament_id:'2025',tournament_year:2025,revision_number:1,source_fingerprint:'a'.repeat(64),payload_fingerprint:'b'.repeat(64),database_payload_fingerprint:'c'.repeat(64),import_contract_version:'completed-history-v1',correction_set_version:'local-test',importer_version:'local-test',source_counts:{},canonical_counts:{},certification:{},operation:'INITIAL_IMPORT',imported_by:'local-test'});
 insert('completed_history_current_revisions',{revision_id:rev,tournament_id:'2025',tournament_year:2025,project_ref:'ymqhhtxaywtqllynrmxe',source_workbook_id:'1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4',advanced_by:'local-test'});
 insert('completed_history_course_appearances',{...history.course_appearances[0],source_course_id:'PDGC03'});
 insert('completed_history_matches',{...history.matches[0],result_winner:'Team 2',source_match_key:'2025-R3-10'});
 for(const row of history.match_participants)insert('completed_history_match_participants',row);
 for(const row of history.scorecards)insert('completed_history_scorecards',row);
 const historyFingerprint=()=>sql(c,db,`select md5(jsonb_build_array((select jsonb_agg(to_jsonb(m) order by m.revision_id,m.match_id) from scoring_authority.completed_history_matches m),(select jsonb_agg(to_jsonb(s) order by s.revision_id,s.scorecard_id) from scoring_authority.completed_history_scorecards s))::text)`);
 const preserved=historyFingerprint(), identityRevision=readReviewer().data.contextRevision;
 const readFixture=()=>JSON.parse(sql(c,db,`set request.jwt.claim.role='service_role';select public.read_native_review_history_fixture_v1('${reviewer}','2026')`));
 sql(c,db,`insert into participant_identity.review_history_fixtures_v1(auth_user_id,tournament_id,tournament_year,revision_id,match_id,active,changed_by) values('${reviewer}','2025',2025,'${rev}','2025-R3-10',true,'local-test')`);
 assert.equal(readFixture().data.matchId,'2025-R3-10');assert.equal(readFixture().data.revisionId,rev);
 assert.equal(readReviewer().data.tournament.id,'2026');assert.equal(readReviewer().data.contextRevision,identityRevision);
 sql(c,db,`update participant_identity.review_history_fixtures_v1 set active=false where auth_user_id='${reviewer}'`);
 assert.equal(readFixture().ok,false);assert.equal(readReviewer().ok,true);assert.equal(readReviewer().data.contextRevision,identityRevision);
 sql(c,db,`update participant_identity.review_history_fixtures_v1 set active=true where auth_user_id='${reviewer}'`);
 assert.equal(readFixture().data.bindingRevision,3);
 assert.throws(()=>sql(c,db,`update scoring_authority.completed_history_scorecards set recorded_holes=17,coverage_status='PARTIAL' where revision_id='${rev}' and player_id='MB01'`),'Historical source is append-only');
 // Simulate an invalid imported card only in the disposable corruption fixture.
 sql(c,db,`set session_replication_role=replica;update scoring_authority.completed_history_scorecards set recorded_holes=17,coverage_status='PARTIAL' where revision_id='${rev}' and player_id='MB01';set session_replication_role=origin;`);
 assert.equal(readFixture().ok,false);assert.equal(readReviewer().ok,true);
 sql(c,db,`set session_replication_role=replica;update scoring_authority.completed_history_scorecards set recorded_holes=18,coverage_status='COMPLETE' where revision_id='${rev}' and player_id='MB01';set session_replication_role=origin;`);
 assert.equal(readFixture().ok,true);assert.equal(historyFingerprint(),preserved);
 assert.throws(()=>sql(c,db,`update scoring_authority.completed_history_matches set lifecycle='LIVE' where revision_id='${rev}'`),'Database cannot represent a non-Final archived match');
 for(const role of ['anon','authenticated']) {
  assert.equal(sql(c,db,`select has_table_privilege('${role}','participant_identity.review_history_fixtures_v1','insert')`),'f');
  assert.equal(sql(c,db,`select has_function_privilege('${role}','public.read_native_review_history_fixture_v1(uuid,text)','execute')`),'f');
 }
 const replacement='60000000-0000-4000-8000-000000000002';
 sql(c,db,`insert into auth.users(id,email,email_confirmed_at) values('${replacement}','replacement@example.invalid',now());
 insert into participant_identity.review_access_v1(auth_user_id,tournament_id,active,protected,expires_at) values('${replacement}','2026',true,false,now()+interval '1 hour');`);
 assert.equal(sql(c,db,`select participant_identity.account_deletion_status_v1('${reviewer}')`),'READY','Replacement reviewer eligibility must not depend on any fixture');
 assert.equal(readFixture().ok,true);assert.equal(historyFingerprint(),preserved);
 sql(c,db,`set session_replication_role=replica;update scoring_authority.matches set status='FINAL' where match_id='M2';set session_replication_role=origin;
 update participant_identity.review_access_v1 set protected=false where auth_user_id='${reviewer}'`);
 const ready=JSON.parse(sql(c,db,`set request.jwt.claim.role='service_role';select public.initiate_account_deletion_v1('${reviewer}','70000000-0000-4000-8000-000000000001')`));
 assert.equal(ready.status,'READY');
 sql(c,db,`delete from auth.users where id='${reviewer}'`);
 assert.equal(readReviewer().ok,false);assert.equal(otp('verify',binding).handled,false);
 assert.equal(sql(c,db,`select count(*) from participant_identity.review_access_v1 where auth_user_id='${reviewer}'`),'0');
 assert.equal(sql(c,db,`select status from participant_identity.account_deletion_requests_v1 where request_id='70000000-0000-4000-8000-000000000001'`),'COMPLETED');

 for(const f of ['public.read_production_net_skins_frozen_2026_v1(jsonb)','production_control.read_annual_net_skins_v1(text)']) {
  const body=sql(c,db,`select prosrc from pg_proc where oid='${f}'::regprocedure`);
  assert.match(body,/case when round_state = 'OFFICIAL'\s+then result_value.engine_result_payload \|\|/);
 }
});
