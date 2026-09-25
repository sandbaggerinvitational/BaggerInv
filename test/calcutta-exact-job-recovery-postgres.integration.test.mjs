import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {available,createCluster,destroyCluster,run,bin,environment,sql,sqlFile,installSupabaseCompatibility,installAnnualPlatformFixture,migrationNames} from './step13e7b1-production-annual-calcutta-postgres.integration.test.mjs';
import {calculateProductionFullNetCalcutta} from '../lib/production-full-net.js';
import {mobileCalcuttaDataFromProductionView,mobileCalcuttaResult} from '../lib/mobile-v1-calcutta.js';
const root=path.resolve(import.meta.dirname,'..'),dir=process.env.BAGGER_CALCUTTA_RECOVERY_FIXTURE;
const lit=x=>`'${JSON.stringify(x).replaceAll("'","''")}'::jsonb`,fp=()=>randomBytes(32).toString('hex');
const jobId='83ed6e87-1a2c-4100-a8d6-9480621c7e8e';
const actor={tournament_id:'2026',player_id:'CB01',auth_user_id:'11000000-0000-4000-8000-000000000001',role:'DIRECTOR'};

test('exact-job recovery and real SQL claim calculate complete participant read', {skip:!dir},async t=>{
 assert.ok(await available(),'PostgreSQL 17 required');
 const fixture=JSON.parse(fs.readFileSync(path.join(dir,'fixture-export.json'))).rows[0].evidence;
 const canon=JSON.parse(fs.readFileSync(path.join(dir,'canonical-inputs.json')));
 const exact=JSON.parse(fs.readFileSync(path.join(dir,'source-exact.json'))).rows[0].evidence;assert.equal(exact.currentSourceHash,exact.jobSourceHash);
 const raw="'"+exact.currentSourceText.replaceAll("'","''")+"'::jsonb";
 const c=await createCluster();t.after(()=>destroyCluster(c));const db='recovery';
 run(bin.createdb,[db],{env:environment(c)});installSupabaseCompatibility(c,db);
 for(const name of await migrationNames()){
  if(name>'202608300075_production_annual_calcutta_v1.sql')break;
  if(name==='202608300069_production_annual_scoring_authority_v1.sql')installAnnualPlatformFixture(c,db);
  sqlFile(c,db,path.join(root,'supabase/production_migrations',name));
  if(name==='202608260038_production_provider_preview_target_inventory_v4.sql')sql(c,db,`insert into scoring_authority.tournaments(tournament_id,tournament_year,name,source_workbook_id,scoring_authority) values('2026',2026,'ISOLATED RECOVERY FIXTURE','1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4','GOOGLE'); insert into scoring_authority.ingress_gates(tournament_id,state,authority,unresolved_client_queues,updated_by) values('2026','PAUSED','GOOGLE',0,'fixture');`);
 }
 // Exact installed processor/read functions; copied Production golf projections are
 // fixed local input authorities. Only external deployment/resource checks are stubbed.
 sql(c,db,`set check_function_bodies=off;${fixture.functions.map(f=>f.definition).join(';')};\n${fixture.claimDefinition};${JSON.parse(fs.readFileSync(path.join(dir,'hosted-reader-helper.json'))).rows[0].evidence.map(f=>f.definition).join(';')};${JSON.parse(fs.readFileSync(path.join(dir,'hosted-read-helper.json'))).rows[0].evidence.map(f=>f.definition).join(';')};
 create or replace function production_control.assert_production_scoring_runtime(input jsonb, required_worker text default null) returns void language plpgsql as $$ begin end $$;
 create or replace function production_control.assert_production_cutover_read_scope(input jsonb, required_phase text) returns production_control.resource_scope language sql as $$ select * from production_control.resource_scope where scope_key='BAGGER_INV_PRODUCTION' $$;
 create or replace function production_control.calcutta_v1_source_revision(target_tournament_id text) returns jsonb language sql as $$select ${raw}$$;
 create or replace function production_control.full_net_tournament_v1(target_tournament_id text) returns jsonb language sql as $$select ${lit(canon.fullNet)}$$;
 create or replace function public.read_leaderboards_core_view(target_tournament_id text default null) returns jsonb language sql as $$select ${lit(canon.core)}$$;
 create or replace function production_control.calcutta_v1_completed_rounds() returns integer[] language sql as $$select '{}'::integer[]$$;
 create or replace function production_control.late_r3_result_compatible_v1(result_id uuid,source_fingerprint text) returns boolean language sql as $$select false$$;
 create table production_control.release_attempts_v1(plan_hash text primary key,state text not null);
 insert into production_control.release_attempts_v1 values(repeat('e',64),'ACTIVE');
 alter table scoring_authority.calcutta_v1_result_revisions drop constraint calcutta_v1_result_revisions_engine_version_check;
 alter table scoring_authority.calcutta_v1_result_revisions add check(engine_version in('calcutta-js-v1','calcutta-full-net-v3'));
 set session_replication_role=replica;`);
 const setup=[`set session_replication_role=replica;`];
 const replaceRow=(table,values)=>setup.push(`delete from ${table};insert into ${table} select * from jsonb_populate_recordset(null::${table},${lit(values)});`);
 replaceRow('production_control.cutover_activation_state',[fixture.activation]);replaceRow('production_control.resource_scope',[fixture.resource]);replaceRow('production_control.postcutover_normal_release_head',[fixture.head]);replaceRow('production_control.postcutover_normal_release_rebindings',[fixture.rebinding]);
 const map={calcutta_v1_current:'current',calcutta_v1_configuration_revisions:'config',calcutta_v1_auction_fact_revisions:'auction',calcutta_v1_publication_revisions:'publication',calcutta_v1_recalculation_jobs:'jobs',calcutta_v1_result_revisions:'results'};
 for(const [table,key]of Object.entries(map))replaceRow('scoring_authority.'+table,fixture[key]||[]);
 setup.push(`update scoring_authority.calcutta_v1_recalculation_jobs set source_revision=${raw};insert into auth.users(id,email,email_confirmed_at) values('${actor.auth_user_id}','isolated@example.invalid',now());
 insert into scoring_authority.players(player_id,display_name) select p->>'player_id',p->>'player_id' from jsonb_array_elements(${lit(fixture.auction[0].auction_manifest.purchases)}) p;
 insert into scoring_authority.teams(tournament_id,team_id,team_side,name) values('2026','PICKLES',1,'The Pickles'),('2026','LIPPIT',2,'Lipp it and Rip it');
 insert into scoring_authority.tournament_players(tournament_id,player_id,team_id,team_side,source_roster_key) select '2026',player_id,'PICKLES',1,'isolated:'||player_id from scoring_authority.players;
 insert into participant_identity.user_player_links(auth_user_id,player_id,status,link_method,email_identity_hash) values('${actor.auth_user_id}','CB01','ACTIVE','DIRECTOR_RECONCILIATION',repeat('a',64));
 insert into participant_identity.participant_auth_identifiers(player_id,auth_user_id,identifier_type,normalized_value_private,status,verified_at,verification_source,source_system,created_by,updated_by) values('CB01','${actor.auth_user_id}','EMAIL','isolated@example.invalid','VERIFIED',now(),'DIRECTOR','DIRECTOR','fixture','fixture');
 insert into participant_identity.tournament_roles(tournament_id,auth_user_id,role,granted_by) values('2026','${actor.auth_user_id}','DIRECTOR','fixture');
 insert into production_control.director_entitlements(auth_user_id,tournament_id,player_id,role,granted_by) values('${actor.auth_user_id}','2026','CB01','OWNER','fixture');set session_replication_role=origin;`);
 sql(c,db,setup.join('\n'));
 const query=(q,dbname=db)=>sql(c,dbname,"set timezone='UTC';"+q),json=q=>JSON.parse(query(q));
 const before=query(`select jsonb_agg(to_jsonb(j) order by job_id) from scoring_authority.calcutta_v1_recalculation_jobs j`);
 sqlFile(c,db,path.join(root,'supabase/production_incremental/calcutta-exact-job-activation-recovery-v1.sql'));
 assert.equal(query(`select jsonb_agg(to_jsonb(j) order by job_id) from scoring_authority.calcutta_v1_recalculation_jobs j`),before,'installation inert');
 const installed=query(`select pg_get_functiondef('public.claim_production_calcutta_v1_recalculation(jsonb)'::regprocedure)`);
 assert.equal(installed.trim(),fixture.claimDefinition.replace('pg_catalog.least(','least(').replace('pg_catalog.greatest(','greatest(').trim(),'only two qualifiers change');
 // Simulate canonical release advancement; do not retain old activation.
 query(`update production_control.cutover_activation_state set activation_revision=233;
 update production_control.postcutover_normal_release_head set activation_revision=233;
 update production_control.postcutover_normal_release_rebindings set activation_revision_before=232,activation_revision_after=233;`);
 const cur=fixture.current[0];
 const base={environment:'PRODUCTION',expected_tournament_id:'2026',tournament_id:'2026',contract_version:'production-calcutta-v1',authorization:actor,player_id:'CB01',actor_id:'isolated-recovery',expected_activation_revision:233,expected_prior_activation_revision:232,expected_configuration_revision:2,expected_configuration_fingerprint:cur.configuration_fingerprint,expected_auction_revision:37,expected_auction_fingerprint:cur.auction_fingerprint,expected_publication_revision:41,job_id:jobId,expected_job_hash:json(`select to_jsonb(production_control.calcutta_v1_hash(to_jsonb(j))) from scoring_authority.calcutta_v1_recalculation_jobs j where job_id='${jobId}'`),release_plan_hash:'e'.repeat(64),reason_code:'STRANDED_PENDING_JOB_AFTER_PROTECTED_RELEASE',vercel_project_id:'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU',vercel_team_id:'team_kPw5zaib8uaQJALAwj4fWI6R',vercel_environment:'production',worker_id:'isolated-calcutta-worker',lease_seconds:60};
 const req=extra=>({...base,request_fingerprint:fp(),...extra});
 const call=(fn,input)=>json(`select ${fn}(${lit(input)})`);
 const recovery='production_control.carry_forward_exact_calcutta_job_v1',claim='public.claim_production_calcutta_v1_recalculation';
 assert.equal(call(claim,req()).job,null,'old activation cannot claim');
 let checks=0;
 for(const role of ['anon','authenticated','service_role']){
  assert.throws(()=>query(`set role ${role};select ${recovery}(${lit(req())})`),/permission denied/);checks++;
 }
 const denies=[
 ['wrong job',{job_id:'00000000-0000-4000-8000-000000000000'},''],
 ['wrong prior',{expected_prior_activation_revision:231},''],
 ['wrong target',{expected_activation_revision:234},''],
 ['wrong tournament',{expected_tournament_id:'2027'},''],
 ['wrong auction',{expected_auction_revision:36},''],
 ['wrong publication',{expected_publication_revision:40},''],
 ['wrong hash',{expected_job_hash:'0'.repeat(64)},''],
 ['participant',{authorization:{...actor,role:'PLAYER'}},''],
 ['unauthenticated',{authorization:{}},''],
 ['revoked Director',{},`update production_control.director_entitlements set status='REVOKED',revoked_at=now();`],
 ['running',{},`update scoring_authority.calcutta_v1_recalculation_jobs set status='RUNNING',attempts=1,claimed_by='worker',claim_token=gen_random_uuid(),lease_expires_at=now()+interval '1 minute',started_at=now() where job_id='${jobId}';`],
 ['succeeded',{},`update scoring_authority.calcutta_v1_recalculation_jobs set status='SUCCEEDED',completed_at=now() where job_id='${jobId}';`],
 ['superseded',{},`update scoring_authority.calcutta_v1_recalculation_jobs set status='SUPERSEDED',completed_at=now() where job_id='${jobId}';`],
 ['attempted',{},`update scoring_authority.calcutta_v1_recalculation_jobs set attempts=1 where job_id='${jobId}';`],
 ['lease on pending',{},`update scoring_authority.calcutta_v1_recalculation_jobs set lease_expires_at=now() where job_id='${jobId}';`],
 ['started',{},`update scoring_authority.calcutta_v1_recalculation_jobs set started_at=now() where job_id='${jobId}';`],
 ['finished',{},`update scoring_authority.calcutta_v1_recalculation_jobs set completed_at=now() where job_id='${jobId}';`],
 ['recorded error',{},`update scoring_authority.calcutta_v1_recalculation_jobs set last_error_code='FAILURE' where job_id='${jobId}';`],
 ['unpublished',{},`update scoring_authority.calcutta_v1_current set publication_state='UNPUBLISHED';`],
 ['result exists',{},`update scoring_authority.calcutta_v1_current set result_revision=1;`],
 ['changed facts',{},`update scoring_authority.calcutta_v1_auction_fact_revisions set auction_manifest=jsonb_set(auction_manifest,'{pot}','0') where auction_revision=37;`],
 ['newer auction',{},`insert into scoring_authority.calcutta_v1_auction_fact_revisions select (jsonb_populate_record(null::scoring_authority.calcutta_v1_auction_fact_revisions,to_jsonb(a)||jsonb_build_object('auction_revision_id',gen_random_uuid(),'auction_revision',38,'recorded_by_auth_user_id','${actor.auth_user_id}','request_fingerprint',repeat('1',64)))).* from scoring_authority.calcutta_v1_auction_fact_revisions a where auction_revision=37;`],
 ['newer publication',{},`insert into scoring_authority.calcutta_v1_publication_revisions select (jsonb_populate_record(null::scoring_authority.calcutta_v1_publication_revisions,to_jsonb(a)||jsonb_build_object('publication_revision_id',gen_random_uuid(),'publication_revision',42,'actor_auth_user_id','${actor.auth_user_id}','request_fingerprint',repeat('2',64)))).* from scoring_authority.calcutta_v1_publication_revisions a where publication_revision=41;`],
 ['newer calculation',{},`insert into scoring_authority.calcutta_v1_recalculation_jobs select (jsonb_populate_record(null::scoring_authority.calcutta_v1_recalculation_jobs,to_jsonb(j)||jsonb_build_object('job_id',gen_random_uuid(),'status','SUCCEEDED','completed_at',now(),'requested_at',now(),'request_fingerprint',repeat('3',64)))).* from scoring_authority.calcutta_v1_recalculation_jobs j where job_id='${jobId}';`]
 ];
 for(const [name,extra,change] of denies){
  assert.throws(()=>query(`begin;${change}select ${recovery}(${lit(req(extra))});rollback;`),['finished','lease on pending'].includes(name)?/calcutta_v1_recalculation_jobs_check/:/PRODUCTION_/,name);checks++;
 }
 const asyncSQL=(dbname,q)=>new Promise(resolve=>{const p=spawn(bin.psql,['-X','-qAt','-v','ON_ERROR_STOP=1','-d',dbname],{env:environment(c)});let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('close',code=>resolve({code,out,err}));p.stdin.end("set timezone='UTC';set statement_timeout='8s';"+q);});
 const races=[];
 const actions={
  recovery:x=>`select ${recovery}(${lit(x)})`,
  claim:x=>`select ${claim}(${lit(x)})`,
  queue:x=>`select public.enqueue_production_calcutta_v1_recalculation(${lit(x)})`,
  save:x=>`select public.replace_production_calcutta_v1_auction_facts(${lit({...x,purchases:fixture.auction[0].auction_manifest.purchases,ownership:fixture.auction[0].auction_manifest.ownership})})`,
  unpublish:x=>`select public.unpublish_production_calcutta_v1(${lit(x)})`,
  publish:x=>`select public.publish_production_calcutta_v1(${lit(x)})`,
  newpublication:x=>`select public.unpublish_production_calcutta_v1(${lit(x)});select public.publish_production_calcutta_v1(${lit({...x,request_fingerprint:fp(),expected_publication_revision:42})})`,
  release:()=>`select pg_advisory_xact_lock(production_control.scoring_admission_lock_key());update production_control.cutover_activation_state set activation_revision=234;update production_control.postcutover_normal_release_head set activation_revision=234;`
 };
 let ri=0;
 for(const kind of Object.keys(actions))for(const order of [0,1]){
  const rdb='race_'+ri++;run(bin.createdb,['-T',db,rdb],{env:environment(c)});
  const first=order?kind:'recovery',second=order?'recovery':kind;
  const a=asyncSQL(rdb,`begin;${actions[first](req())};select pg_sleep(0.25);commit;`);
  await new Promise(r=>setTimeout(r,70));const b=asyncSQL(rdb,`${actions[second](req())};`);
  const [one,two]=await Promise.all([a,b]);
  assert.equal(one.code,0,`${first} first: ${one.err}`);
  if(two.code!==0)assert.match(two.err,/PRODUCTION_|deadlock detected/,`${second} race: ${two.err}`);
  const after=JSON.parse(query(`select jsonb_build_object('job',to_jsonb(j),'receipts',(select count(*) from production_control.calcutta_exact_job_recoveries_v1)) from scoring_authority.calcutta_v1_recalculation_jobs j where job_id='${jobId}'`,rdb));
  assert.ok(after.receipts<=1);if(after.job.activation_revision===233)assert.equal(after.receipts,1,'no unaudited partial rebind');
  if(after.receipts===0)assert.equal(after.job.activation_revision,232);
  if(kind==='recovery'){assert.equal(two.code,0,two.err);assert.equal(after.receipts,1);}
  races.push({first,second,firstSucceeded:true,secondSucceeded:two.code===0,receiptCount:after.receipts,jobActivation:after.job.activation_revision});
 }
 fs.writeFileSync(path.join(dir,'concurrency.json'),JSON.stringify(races,null,2));
 const preJob=query(`select to_jsonb(j)-'activation_revision' from scoring_authority.calcutta_v1_recalculation_jobs j where job_id='${jobId}'`);
 const recovered=call(recovery,req());assert.equal(recovered.new_activation,233);assert.equal(recovered.job_id,jobId);
 const j=json(`select to_jsonb(j) from scoring_authority.calcutta_v1_recalculation_jobs j where job_id='${jobId}'`);
 const original=fixture.jobs.find(j=>j.job_id===jobId);for(const k of ['requested_at','updated_at'])original[k]=j[k];assert.deepEqual(j,{...original,activation_revision:233});
 assert.equal(query(`select to_jsonb(j)-'activation_revision' from scoring_authority.calcutta_v1_recalculation_jobs j where job_id='${jobId}'`),preJob,'only activation changes');
 assert.equal(call(recovery,req()).idempotent,true);assert.equal(query(`select count(*) from production_control.calcutta_exact_job_recoveries_v1`),'1');
 for(const operation of ['update production_control.calcutta_exact_job_recoveries_v1 set prior_activation=231','delete from production_control.calcutta_exact_job_recoveries_v1','truncate production_control.calcutta_exact_job_recoveries_v1'])assert.throws(()=>query(operation),/EVIDENCE_IMMUTABLE/);
 // Real claim lease boundaries; each probe rolls back all job/receipt mutations.
 for(const [value,expected]of [[-5,15],[0,15],[14,15],[15,15],[60,60],[300,300],[301,300],[null,60],[undefined,60]]){
  const r=req({lease_seconds:value});const out=query(`begin;select (${claim}(${lit(r)}))->'job';select extract(epoch from lease_expires_at-now()) from scoring_authority.calcutta_v1_recalculation_jobs where job_id='${jobId}';rollback;`).split('\n');assert.equal(Number(out.at(-1)),expected);
 }
 assert.throws(()=>call(claim,req({lease_seconds:'invalid'})),/invalid input syntax/);
 // Expired lease is recovered by the unchanged normal claim path, not carry-forward.
 const expired=query(`begin;update scoring_authority.calcutta_v1_recalculation_jobs set status='RUNNING',attempts=1,claimed_by='expired',claim_token=gen_random_uuid(),lease_expires_at=now()-interval '1 second',started_at=now()-interval '1 minute' where job_id='${jobId}';select (${claim}(${lit(req())}))->'job';select attempts from scoring_authority.calcutta_v1_recalculation_jobs where job_id='${jobId}';rollback;`).split('\n');assert.equal(expired.at(-1),'2');
 const doubleDb='double_claim';run(bin.createdb,['-T',db,doubleDb],{env:environment(c)});
 const doubles=await Promise.all([asyncSQL(doubleDb,`select ${claim}(${lit(req())})`),asyncSQL(doubleDb,`select ${claim}(${lit(req())})`)]);assert.ok(doubles.every(x=>x.code===0));assert.equal(doubles.filter(x=>JSON.parse(x.out.trim()).job).length,1);
 const claimed=call(claim,req());assert.equal(claimed.job.job_id,jobId);assert.equal(call(claim,req()).job,null,'active lease double claim excluded');
 const calc=calculateProductionFullNetCalcutta(claimed.calculation_input,claimed.calculation_input.core_view);
 assert.equal(calc.resultState,'PROVISIONAL');assert.equal(calc.calcutta.golfers.length,24);assert.equal(calc.calcutta.portfolios.length,24);assert.deepEqual(calc.calcutta.completedRounds,[]);assert.equal(calc.calcutta.pot,18500);
 const complete=req({claim_token:claimed.job.claim_token,expected_result_revision:claimed.job.expected_result_revision,expected_source_fingerprint:claimed.job.source_fingerprint,engine_version:'calcutta-full-net-v3',result_state:calc.resultState,result_payload:calc.calcutta});
 assert.throws(()=>call('public.complete_production_calcutta_v1_recalculation',{...complete,worker_id:'stale'}),/LEASE_REQUIRED/);
 const completed=call('public.complete_production_calcutta_v1_recalculation',complete);assert.equal(completed.result_revision,1);assert.equal(call('public.complete_production_calcutta_v1_recalculation',complete).idempotent,true);
 assert.equal(call(claim,req()).job,null,'succeeded excluded');
 const view=call('public.read_production_calcutta_v1',req());assert.ok(view.ok);assert.ok(view.data.result);assert.equal(view.data.publication_revision,41);assert.equal(view.data.auction_revision,37);
 const envelope=await mobileCalcuttaResult({tournamentId:'2026',playerId:'CB01'},{dependencies:{readCalcuttaV1:async()=>({payload:view})}});assert.equal(envelope.status,200);
 const mobile=mobileCalcuttaDataFromProductionView(view.data,{tournamentId:'2026',playerId:'CB01'});assert.ok(mobile.presentation);assert.ok(mobile.published);
 fs.writeFileSync(path.join(dir,'isolated-native-data.json'),JSON.stringify(mobile));
 fs.writeFileSync(path.join(dir,'isolated-claim.json'),JSON.stringify(claimed));fs.writeFileSync(path.join(dir,'isolated-result.json'),JSON.stringify(calc));
 fs.writeFileSync(path.join(dir,'local-e2e.json'),JSON.stringify({status:'PASS',denialChecks:checks,leaseBoundaryChecks:10,oldClaim:null,recovered,completed,presentationPresent:!!mobile.presentation,golfers:24,portfolios:24,pot:18500,completedRounds:[],normalGuardUnchanged:true,concurrencyCases:races.length+1,participantHTTPEnvelope:envelope.status},null,2));
});
