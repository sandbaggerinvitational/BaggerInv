import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {available,createCluster,destroyCluster,run,bin,environment,sql,sqlFile,installSupabaseCompatibility,installAnnualPlatformFixture,migrationNames} from './step13e7b1-production-annual-calcutta-postgres.integration.test.mjs';
import {fixture} from './calcutta-management.test.mjs';
const root=path.resolve(import.meta.dirname,'..');
const lit=x=>`'${JSON.stringify(x).replaceAll("'","''")}'::jsonb`;
const actor={tournament_id:'2026',player_id:'P1',auth_user_id:'11000000-0000-4000-8000-000000000001',role:'DIRECTOR'};
const fp=()=>randomBytes(32).toString('hex');

test('single-entry clear uses immutable revisions, real Director authority, guards and database locks',async t=>{
 assert.ok(await available(),'PostgreSQL required');const c=await createCluster();t.after(()=>destroyCluster(c));const db='clear_entry';
 run(bin.createdb,[db],{env:environment(c,{PGOPTIONS:''})});installSupabaseCompatibility(c,db);
 for(const name of await migrationNames()){
  if(name>'202608300075_production_annual_calcutta_v1.sql')break;
  if(name==='202608300069_production_annual_scoring_authority_v1.sql')installAnnualPlatformFixture(c,db);
  sqlFile(c,db,path.join(root,'supabase/production_migrations',name));
  if(name==='202608260038_production_provider_preview_target_inventory_v4.sql')sql(c,db,`insert into scoring_authority.tournaments(tournament_id,tournament_year,name,source_workbook_id,scoring_authority) values('2026',2026,'ISOLATED CLEAR FIXTURE','1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4','GOOGLE'); insert into scoring_authority.ingress_gates(tournament_id,state,authority,unresolved_client_queues,updated_by) values('2026','PAUSED','GOOGLE',0,'fixture');`);
 }
 sqlFile(c,db,path.join(root,'supabase/production_incremental/director-calcutta-management-read-v1.sql'));
 const before=sql(c,db,`select row_to_json(c) from scoring_authority.calcutta_v1_current c where tournament_id='2026'`);
 sqlFile(c,db,path.join(root,'supabase/production_incremental/director-calcutta-clear-entry-v1.sql'));
 assert.equal(sql(c,db,`select row_to_json(c) from scoring_authority.calcutta_v1_current c where tournament_id='2026'`),before,'installation inert');
 // Only the deployed-resource runtime gate is substituted in this disposable DB.
 // Real production actor/link/role checks, schema, revisions, receipts and locks remain installed.
 sql(c,db,`create or replace function production_control.assert_production_calcutta_v1_runtime(input jsonb) returns void language plpgsql as $$ begin if input->>'tournament_id' is distinct from '2026' then raise exception 'RUNTIME_SCOPE_DENIED'; end if; end $$;
 set session_replication_role=replica;
 insert into auth.users(id,email,email_confirmed_at) values('${actor.auth_user_id}','synthetic@example.invalid',now());
 insert into scoring_authority.players(player_id,display_name) select 'P'||n,'Synthetic golfer '||n from generate_series(1,24)n;
 insert into scoring_authority.teams(tournament_id,team_id,team_side,name) values('2026','T1',1,'Synthetic One');
 insert into scoring_authority.tournament_players(tournament_id,player_id,team_id,team_side,source_roster_key) select '2026','P'||n,'T1',1,'fixture:'||n from generate_series(1,24)n;
 insert into participant_identity.user_player_links(auth_user_id,player_id,status,link_method,email_identity_hash) values('${actor.auth_user_id}','P1','ACTIVE','DIRECTOR_RECONCILIATION',repeat('a',64));
 insert into participant_identity.participant_auth_identifiers(player_id,auth_user_id,identifier_type,normalized_value_private,status,verified_at,verification_source,source_system,created_by,updated_by) values('P1','${actor.auth_user_id}','EMAIL','synthetic@example.invalid','VERIFIED',now(),'DIRECTOR','DIRECTOR','fixture','fixture');
 insert into participant_identity.tournament_roles(tournament_id,auth_user_id,role,granted_by) values('2026','${actor.auth_user_id}','DIRECTOR','fixture');
 insert into production_control.director_entitlements(auth_user_id,tournament_id,player_id,role,granted_by) values('${actor.auth_user_id}','2026','P1','OWNER','fixture');
 set session_replication_role=origin;`);
 const m=fixture();const cfg={contract_version:'production-calcutta-v1',point_structure:m.point_structure,payout_structure:m.payout_structure};
 sql(c,db,`insert into scoring_authority.calcutta_v1_configuration_revisions(tournament_id,configuration_revision,contract_version,state,configuration_manifest,configuration_fingerprint,resource_fingerprint,activation_revision,configured_by_player_id,configured_by_auth_user_id,request_fingerprint,request_payload_hash,configured_at) values('2026',2,'production-calcutta-v1','CONFIGURED',production_control.build_production_calcutta_v1_configuration(${lit(cfg)}),repeat('a',64),repeat('b',64),1,'P1','${actor.auth_user_id}',repeat('c',64),repeat('d',64),now()); update scoring_authority.calcutta_v1_current set configuration_revision=2,configuration_revision_id=(select configuration_revision_id from scoring_authority.calcutta_v1_configuration_revisions where configuration_revision=2),configuration_fingerprint=repeat('a',64),state='CONFIGURED' where tournament_id='2026';`);
 const current=()=>JSON.parse(sql(c,db,`select production_control.director_calcutta_management_projection_v1('2026')`));
 const input=(extra={})=>{const m=current();return{contract_version:'production-calcutta-v1',tournament_id:'2026',expected_tournament_id:'2026',player_id:'P2',authorization:actor,expected_configuration_revision:2,expected_configuration_fingerprint:m.configuration_fingerprint,expected_auction_revision:m.auction_revision,expected_auction_fingerprint:m.auction_fingerprint,expected_publication_revision:m.publication_revision,request_fingerprint:fp(),...extra};};
 const call=(fn,x)=>JSON.parse(sql(c,db,`select public.${fn}(${lit(x)})`));
 const clear=x=>call('clear_production_calcutta_v1_auction_entry',x);
 const save=(purchases,ownership)=>call('replace_production_calcutta_v1_auction_facts',input({purchases,ownership}));
 const purchase={player_id:'P2',purchase_price:'100'};
 const owners=[{player_id:'P2',owner_player_id:'P3',ownership_fraction:'0.5'},{player_id:'P2',owner_player_id:'P4',ownership_fraction:'0.5'}];
 save([purchase],owners);const history=sql(c,db,`select row_to_json(a) from scoring_authority.calcutta_v1_auction_fact_revisions a where auction_revision=1`);
 for(const role of ['anon','authenticated'])assert.throws(()=>sql(c,db,`set role ${role};select public.clear_production_calcutta_v1_auction_entry('{}')`),/permission denied/);
 assert.throws(()=>clear(input({authorization:{...actor,role:'PLAYER'}})),/DIRECTOR_AUTHORIZATION/);
 assert.throws(()=>clear(input({authorization:{...actor,auth_user_id:'11000000-0000-4000-8000-000000000009'}})),/DIRECTOR_AUTHORIZATION/);
 assert.throws(()=>clear(input({expected_tournament_id:'2099'})),/SCOPE_DENIED/);
 assert.throws(()=>clear(input({player_id:'UNKNOWN'})),/PLAYER_DENIED/);
 assert.throws(()=>clear(input({player_id:'P5'})),/NOT_ENTERED/);
 assert.throws(()=>clear(input({expected_auction_revision:0})),/REVISION_CONFLICT/);
 sql(c,db,`update scoring_authority.calcutta_v1_current set publication_state='PUBLISHED' where tournament_id='2026'`);assert.throws(()=>clear(input()),/PUBLISHED_DENIED/);sql(c,db,`update scoring_authority.calcutta_v1_current set publication_state='UNPUBLISHED',result_revision=1 where tournament_id='2026'`);assert.throws(()=>clear(input()),/RESULT_DEPENDENCY/);sql(c,db,`update scoring_authority.calcutta_v1_current set result_revision=0 where tournament_id='2026'`);

 // Actual enqueue creates a dependency; clear must reject it atomically.
 const dep=input();assert.throws(()=>sql(c,db,`begin;select public.enqueue_production_calcutta_v1_recalculation(${lit(dep)});select public.clear_production_calcutta_v1_auction_entry(${lit({...dep,request_fingerprint:fp()})});rollback;`),/CLEAR_RESULT_DEPENDENCY/);
 const request=input();const cleared=clear(request);assert.equal(cleared.auction_revision,2);assert.equal(cleared.cleared_player_id,'P2');assert.equal(clear(request).idempotent,true,'timeout after commit retries exact receipt');
 assert.deepEqual(current().purchases,[]);assert.deepEqual(current().ownership,[]);assert.equal(sql(c,db,`select row_to_json(a) from scoring_authority.calcutta_v1_auction_fact_revisions a where auction_revision=1`),history);
 assert.throws(()=>clear(input()),/NOT_ENTERED/);
 assert.throws(()=>call('publish_production_calcutta_v1',input()),/AUCTION_FACTS_REQUIRED/);
 assert.throws(()=>call('enqueue_production_calcutta_v1_recalculation',input()),/AUCTION_FACTS_REQUIRED/);
 const single=[{player_id:'P2',owner_player_id:'P3',ownership_fraction:'1'}];
 save([purchase,{player_id:'P5',purchase_price:'25'}],[...single,{player_id:'P5',owner_player_id:'P1',ownership_fraction:'1'}]);clear(input());assert.deepEqual(current().purchases,[{player_id:'P5',purchase_price:'25'}]);assert.equal(current().ownership.length,1);
 // Concurrent clients run actual separate PostgreSQL sessions.
 const asyncSQL=q=>new Promise(resolve=>{const p=spawn(bin.psql,['-X','-qAt','-v','ON_ERROR_STOP=1','-d',db],{env:environment(c)});let out='',err='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);p.on('close',code=>resolve({code,out,err}));p.stdin.end(q);});
 const race=async(first,second)=>{const a=asyncSQL(`begin; ${first}; select pg_sleep(0.4); commit;`);await new Promise(r=>setTimeout(r,80));return Promise.all([a,asyncSQL(second)]);};
 for(const kind of ['clear','save','publish']){
  save([purchase],owners);const x=input(),y={...x,request_fingerprint:fp()};
  const second=kind==='clear'?`select public.clear_production_calcutta_v1_auction_entry(${lit(y)})`:kind==='save'?`select public.replace_production_calcutta_v1_auction_facts(${lit({...y,purchases:[purchase],ownership:owners})})`:`select public.publish_production_calcutta_v1(${lit(y)})`;
  const [a,b]=await race(`select public.clear_production_calcutta_v1_auction_entry(${lit(x)})`,second);assert.equal(a.code,0,a.err);assert.notEqual(b.code,0);assert.match(b.err,/REVISION_CONFLICT/);assert.equal(current().purchases.length,0);
 }
 // Save and Publish winning the lock must also prevent a stale clear.
 save([purchase],owners);
 { const x=input(); const [a,b]=await race(`select public.replace_production_calcutta_v1_auction_facts(${lit({...x,purchases:[purchase],ownership:owners})})`,`select public.clear_production_calcutta_v1_auction_entry(${lit({...x,request_fingerprint:fp()})})`); assert.equal(a.code,0,a.err);assert.notEqual(b.code,0);assert.match(b.err,/REVISION_CONFLICT/);assert.equal(current().purchases.length,1); }
 { const x=input(); const [a,b]=await race(`select public.publish_production_calcutta_v1(${lit(x)})`,`select public.clear_production_calcutta_v1_auction_entry(${lit({...x,request_fingerprint:fp()})})`);assert.equal(a.code,0,a.err);assert.notEqual(b.code,0);assert.match(b.err,/PUBLISHED_DENIED/);assert.equal(current().purchases.length,1); }
 // Finish this synthetic database after proving Publish's queued dependency too.
 assert.equal(current().publication_state,'PUBLISHED');
 call('unpublish_production_calcutta_v1',input());
 assert.throws(()=>clear(input()),/RESULT_DEPENDENCY/);
 // Only disposable fixture cleanup; production implementation never clears jobs.
 sql(c,db,`update scoring_authority.calcutta_v1_recalculation_jobs set status='SUPERSEDED',completed_at=now() where tournament_id='2026'`);
 save([purchase],owners);const x=input();const [a,b]=await race(`select public.clear_production_calcutta_v1_auction_entry(${lit(x)})`,`select public.clear_production_calcutta_v1_auction_entry(${lit(x)})`);assert.equal(a.code,0,a.err);assert.equal(b.code,0,b.err);assert.match(b.out,/"idempotent": true/);
 assert.equal(sql(c,db,`select count(*) from scoring_authority.calcutta_v1_result_revisions`),'0');
 assert.equal(sql(c,db,`select count(*) from scoring_authority.calcutta_v1_recalculation_jobs where status in ('PENDING','RUNNING')`),'0');
});
