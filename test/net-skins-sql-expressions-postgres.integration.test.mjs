import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {available,createCluster,destroyCluster,run,bin,environment,sql,sqlFile,installSupabaseCompatibility,installAnnualPlatformFixture,migrationNames} from './step13e7b1-production-annual-calcutta-postgres.integration.test.mjs';
import {calculateProductionFullNetSkins} from '../lib/production-full-net.js';
import {mobileNetSkinsResult} from '../lib/mobile-v1-net-skins.js';
const root=path.resolve(import.meta.dirname,'..'),dir=process.env.BAGGER_NET_SKINS_SQL_FIXTURE;
const lit=v=>`'${JSON.stringify(v).replaceAll("'","''")}'::jsonb`,fp=()=>randomBytes(32).toString('hex');
const read=n=>JSON.parse(fs.readFileSync(path.join(dir,n+'.json'))).rows[0].evidence;
const installer=path.join(root,'supabase/production_incremental/net-skins-sql-expressions-v1.sql');

test('Net Skins exact installed SQL read claim normalization and completion', {skip:!dir},async t=>{
 assert.ok(await available(),'PostgreSQL 17 required');
 const fixture=read('net-skins-export'), canon=read('canonical-read'), p=read('processor-fixture');
 assert.equal(fixture.tables['scoring_authority.net_skins_v1_recalculation_jobs'].length,0);
 assert.equal(fixture.tables['scoring_authority.net_skins_v1_result_revisions'].length,0);
 const c=await createCluster();t.after(()=>destroyCluster(c));const db='skins';
 run(bin.createdb,[db],{env:environment(c)});installSupabaseCompatibility(c,db);
 for(const name of await migrationNames()){
  if(name>'202608300075_production_annual_calcutta_v1.sql')break;
  if(name==='202608300069_production_annual_scoring_authority_v1.sql')installAnnualPlatformFixture(c,db);
  sqlFile(c,db,path.join(root,'supabase/production_migrations',name));
  if(name.startsWith('202608260038'))sql(c,db,`insert into scoring_authority.tournaments(tournament_id,tournament_year,name,source_workbook_id,scoring_authority) values('2026',2026,'ISOLATED NET SKINS FIXTURE','1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4','GOOGLE');insert into scoring_authority.ingress_gates(tournament_id,state,authority,unresolved_client_queues,updated_by) values('2026','PAUSED','GOOGLE',0,'fixture');`);
 }
 // Real installed Net Skins bodies, SQL table constraints, runtime activation guard,
 // receipts, lease/claim/normalization/completion. Only external live resource checks
 // and read-only input suppliers are local fixture boundaries; never hosted writes.
 const functions=fixture.functions.filter(f=>!f.name.includes('import_production')&&!f.name.includes('net_skins_entry_')&&!f.name.includes('net_skins_entries_'));
 sql(c,db,`set check_function_bodies=off;${functions.map(f=>f.definition).join(';')};${p.helpers.filter(f=>!f.signature.includes('net_skins_v1_round_source_revision')).map(f=>f.definition).join(';')};
 create or replace function production_control.assert_production_scoring_runtime(input jsonb,required_worker text default null) returns void language plpgsql as $$begin perform production_control.assert_production_service_role();end$$;
 create or replace function production_control.assert_production_cutover_read_scope(input jsonb,required_phase text) returns production_control.resource_scope language sql as $$select * from production_control.resource_scope where scope_key='BAGGER_INV_PRODUCTION'$$;
 create or replace function production_control.assert_frozen_2026_current_read_v1() returns void language plpgsql as $$begin end$$;
 create or replace function production_control.net_skins_v1_round_source_revision(target_tournament_id text,target_round_number integer) returns jsonb language sql as $$select case when $2=1 then ${lit(canon.sourceR1)} else ${lit(canon.sourceR2)} end$$;
 create or replace function public.read_net_skins_input_view(target_tournament_id text default null) returns jsonb language sql as $$select ${lit(p.input)}$$;
 create or replace function production_control.full_net_tournament_v1(target_tournament_id text) returns jsonb language sql as $$select ${lit(p.fullNet)}$$;
 create or replace function production_control.net_skins_entries_projection_v1(target text) returns jsonb language sql as $$select ${lit(canon.entries)}$$;
 alter table scoring_authority.net_skins_v1_result_revisions drop constraint net_skins_v1_result_revisions_engine_version_check;
 alter table scoring_authority.net_skins_v1_result_revisions add check(engine_version in('net-skins-js-v1','net-skins-full-net-v2'));
 `);
 const setup=['set session_replication_role=replica;'];
 for(const [table,rows] of Object.entries({...Object.fromEntries(Object.entries(fixture.tables).filter(([k])=>k.startsWith('scoring_authority.'))),'production_control.cutover_activation_state':[p.activation],'production_control.resource_scope':[p.resource],'production_control.postcutover_normal_release_head':[p.head],'production_control.postcutover_normal_release_rebindings':[p.rebinding],'scoring_authority.matches':p.matches}))
  {const cols=sql(c,db,`select string_agg(quote_ident(attname),',' order by attnum) from pg_attribute where attrelid='${table}'::regclass and attnum>0 and not attisdropped and attgenerated=''`);setup.push(`delete from ${table};insert into ${table}(${cols}) select ${cols} from jsonb_populate_recordset(null::${table},${lit(rows)});`);}
 setup.push('set session_replication_role=origin;');sql(c,db,setup.join('\n'));
 const query=(q,d=db)=>sql(c,d,"set timezone='UTC';"+q),json=q=>JSON.parse(query(q));
 const base={environment:'PRODUCTION',tournament_id:'2026',expected_tournament_id:'2026',expected_activation_revision:233,expected_configuration_revision:2,vercel_project_id:'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU',vercel_team_id:'team_kPw5zaib8uaQJALAwj4fWI6R',vercel_environment:'production',worker_id:'isolated-net-skins-worker',actor_id:'isolated-net-skins-certification'};
 const req=extra=>({...base,request_fingerprint:fp(),...extra});
 const readFn='public.read_production_net_skins_v1',claimFn='public.claim_production_net_skins_v1_recalculation',queueFn='public.enqueue_production_net_skins_v1_recalculation',completeFn='public.complete_production_net_skins_v1_recalculation',normFn='production_control.normalize_production_net_skins_v1_official_result';
 const call=(fn,input)=>json(`select ${fn}(${lit(input)})`);
 assert.throws(()=>call(readFn,req()),/pg_catalog.greatest\(bigint, bigint\) does not exist/);
 assert.throws(()=>call(claimFn,req()),/pg_catalog.greatest\(integer, integer\) does not exist/);
 const unchanged=()=>query(`select jsonb_build_object('configuration',(select jsonb_agg(to_jsonb(x)) from scoring_authority.net_skins_v1_configuration_revisions x),'entries',(select jsonb_agg(to_jsonb(x) order by entry_id) from scoring_authority.net_skins_configuration_entries x),'jobs',(select count(*) from scoring_authority.net_skins_v1_recalculation_jobs),'results',(select count(*) from scoring_authority.net_skins_v1_result_revisions))`);
 const pre=unchanged();
 const security=()=>query(`select jsonb_agg(jsonb_build_array(oid::regprocedure::text,proacl,prosecdef,proconfig,proowner) order by oid) from pg_proc where oid in ('public.read_production_net_skins_frozen_2026_v1(jsonb)'::regprocedure,'public.claim_production_net_skins_v1_recalculation(jsonb)'::regprocedure,'${normFn}(integer,jsonb)'::regprocedure)`);
 const sec=security();sqlFile(c,db,installer);assert.equal(unchanged(),pre);assert.equal(security(),sec);
 sqlFile(c,db,installer);assert.equal(unchanged(),pre,'idempotent installer is inert');
 for(const change of JSON.parse(fs.readFileSync(path.join(dir,'SQL-CHANGES.json')))){
  const d=query(`select pg_get_functiondef('${change.signature}'::regprocedure)`)+'\n';
  assert.equal(createHash('sha256').update(d).digest('hex'),change.afterHash,'only certified qualifier replacements');
 }
 const configured=call(readFn,req());assert.equal(configured.data.state,'CONFIGURED');
 assert.deepEqual(configured.data.rounds.map(r=>r.eligible_entry_count),[24,12]);
 assert.ok(configured.data.rounds.every(r=>!r.result_payload&&!r.official_results));
 fs.writeFileSync(path.join(dir,'isolated-configured-read.json'),JSON.stringify(configured,null,2));
 const envelope=await mobileNetSkinsResult({tournamentId:'2026',playerId:'CB01'},{dependencies:{readProductionNetSkinsV1:async()=>({payload:configured})}});assert.equal(envelope.status,200);
 fs.writeFileSync(path.join(dir,'configured-native-envelope.json'),JSON.stringify(envelope.body));
 let denialChecks=0;
 for(const fn of [claimFn,queueFn,completeFn])for(const extra of [{expected_activation_revision:232},{expected_activation_revision:234},{vercel_environment:'preview'},{vercel_project_id:'wrong'}]){assert.throws(()=>call(fn,req(extra)),/PRODUCTION_NET_SKINS_(ACTIVATION_REVISION_CONFLICT|RUNTIME_REQUIRED)/);denialChecks++;}
 for(const role of ['anon','authenticated'])for(const fn of [readFn,claimFn,queueFn,completeFn]){assert.throws(()=>query(`set role ${role};set request.jwt.claim.role='${role}';select ${fn}(${lit(req())})`),/permission denied|SERVICE_ROLE/);denialChecks++;}
 assert.throws(()=>call(queueFn,req({round_numbers:[3]})),/ROUND_NOT_CONFIGURED/);denialChecks++;
 assert.throws(()=>call(queueFn,req({round_numbers:[1,1]})),/ROUNDS_INVALID/);denialChecks++;
 assert.throws(()=>call(claimFn,req({expected_configuration_revision:1})),/CONFIGURATION_REVISION_CONFLICT/);denialChecks++;
 const queuedReq=req({round_numbers:[1]});const queued=call(queueFn,queuedReq);assert.equal(queued.jobs.length,1);assert.equal(call(queueFn,queuedReq).idempotent,true);
 const job=queued.jobs[0];assert.equal(call(queueFn,req({round_numbers:[1]})).jobs[0].job_id,job.job_id,'same current source reuses job');
 for(const [v,expected] of [[-5,15],[0,15],[14,15],[15,15],[16,16],[60,60],[299,299],[300,300],[301,300],[null,60],[undefined,60]]){
  const out=query(`begin;select (${claimFn}(${lit(req({lease_seconds:v}))}))->'job';select extract(epoch from lease_expires_at-now()) from scoring_authority.net_skins_v1_recalculation_jobs where job_id='${job.job_id}';rollback;`).split('\n');assert.equal(Number(out.at(-1)),expected);
 }
 assert.throws(()=>call(claimFn,req({lease_seconds:'invalid'})),/invalid input syntax/);
 const asyncSQL=(q,d=db)=>new Promise(resolve=>{const s=spawn(bin.psql,['-X','-qAt','-v','ON_ERROR_STOP=1','-d',d],{env:environment(c)});let out='',err='';s.stdout.on('data',b=>out+=b);s.stderr.on('data',b=>err+=b);s.on('close',code=>resolve({code,out,err}));s.stdin.end("set timezone='UTC';set statement_timeout='10s';"+q);});
 run(bin.createdb,['-T',db,'concurrent_claims'],{env:environment(c)});
 const concurrent=await Promise.all([1,2].map(()=>asyncSQL(`select ${claimFn}(${lit(req())})`,'concurrent_claims')));assert.ok(concurrent.every(x=>x.code===0),JSON.stringify(concurrent));assert.equal(concurrent.filter(x=>JSON.parse(x.out.trim()).job).length,1);
 const expired=query(`begin;update scoring_authority.net_skins_v1_recalculation_jobs set status='RUNNING',attempts=1,claimed_by='expired',claim_token=extensions.gen_random_uuid(),lease_expires_at=now()-interval '1 second',started_at=now()-interval '2 minutes' where job_id='${job.job_id}';select (${claimFn}(${lit(req())}))->'job';select attempts from scoring_authority.net_skins_v1_recalculation_jobs where job_id='${job.job_id}';rollback;`).split('\n');assert.equal(expired.at(-1),'2');
 const exhausted=query(`begin;update scoring_authority.net_skins_v1_recalculation_jobs set status='RUNNING',attempts=5,claimed_by='expired',claim_token=extensions.gen_random_uuid(),lease_expires_at=now()-interval '1 second',started_at=now()-interval '2 minutes' where job_id='${job.job_id}';select (${claimFn}(${lit(req())}))->'job';select status from scoring_authority.net_skins_v1_recalculation_jobs where job_id='${job.job_id}';rollback;`).split('\n');assert.equal(exhausted.at(-1),'FAILED');
 const claimReq=req();const claimed=call(claimFn,claimReq);assert.equal(claimed.job.job_id,job.job_id);assert.equal(call(claimFn,claimReq).idempotent,true);assert.equal(call(claimFn,req()).job,null);
 const calc=calculateProductionFullNetSkins(claimed.calculation_input);const first=calc.netSkins.rounds.find(r=>r.round===1);assert.equal(first.resultState,'PROVISIONAL');assert.equal(first.completedHoles,0);assert.equal(first.finalized,false);
 const completeReq=req({job_id:job.job_id,claim_token:claimed.job.claim_token,source_fingerprint:claimed.job.source_fingerprint,expected_result_revision:0,engine_version:'net-skins-full-net-v2',result_state:'PROVISIONAL',result_payload:first});
 for(const extra of [{worker_id:'other'},{claim_token:'00000000-0000-4000-8000-000000000000'},{source_fingerprint:'0'.repeat(64)},{expected_result_revision:1}]){assert.throws(()=>call(completeFn,{...completeReq,request_fingerprint:fp(),...extra}),/PRODUCTION_NET_SKINS_/);denialChecks++;}
 const completed=call(completeFn,completeReq);assert.equal(completed.published,false);assert.equal(call(completeFn,completeReq).idempotent,true);
 assert.equal(query('select published_at is null and public_result_payload is null from scoring_authority.net_skins_v1_result_revisions'),'t');
 // Future completed-golf fixtures derive from actual configured players/pairs and
 // canonical Full Net allocations. No Production score or result is submitted.
 const future=structuredClone(claimed.calculation_input);
 for(const m of future.full_net_authority.matches.filter(m=>[1,2].includes(m.roundNumber))){m.official=true;for(const [i,e]of m.entries.entries()){e.complete=true;for(const h of e.holes){h.gross=4+i+(h.hole%3);h.fullNet=h.gross-h.fullCourseHandicapStrokes;}e.totalGross=e.holes.reduce((s,h)=>s+h.gross,0);e.totalFullNet=e.holes.reduce((s,h)=>s+h.fullNet,0);}}
 const rounds=calculateProductionFullNetSkins(future).netSkins.rounds;assert.ok(rounds.every(r=>r.finalized));
 for(const r of rounds)assert.throws(()=>json(`select ${normFn}(${r.round},${lit(r)})`),/REFERENCED_MATCHES_NOT_OFFICIAL/);
 query(`set session_replication_role=replica;update scoring_authority.matches set status='FINAL',scorecard_complete=true,scored_holes=18,finalized_at=now(),result_winner='TEAM_1' where round_number in(1,2);set session_replication_role=origin;`);
 for(const r of rounds){
  const normalized=json(`select ${normFn}(${r.round},${lit(r)})`);assert.equal(normalized.eligible_count,r.round===1?24:12);assert.equal(normalized.pot,600);assert.equal(normalized.skins_awarded,r.skins.length);
  // Null/empty/unknown winners cannot change pair scope; reverse pair order retains it.
  if(r.skins.length){
   const bad=structuredClone(r);bad.skins[0].winnerPlayerId='UNKNOWN';assert.throws(()=>json(`select ${normFn}(${r.round},${lit(bad)})`),/OFFICIAL_RESULT_INVALID/);
   if(r.round===2){const reversed=structuredClone(r);for(const s of reversed.skins)[s.winnerPlayerId,s.winnerPlayerId2]=[s.winnerPlayerId2,s.winnerPlayerId];assert.deepEqual(json(`select ${normFn}(2,${lit(reversed)})`),normalized);}
  }
  for(const [key,value]of [['complete',false],['finalized',false],['completedHoles',17],['eligibleCount',0],['pot',0]]){assert.throws(()=>json(`select ${normFn}(${r.round},${lit({...r,[key]:value})})`),/OFFICIAL_RESULT_INVALID/);denialChecks++;}
 }
 // Real enqueue/claim/complete for independent official R2. R1 provisional stays separate.
 fs.writeFileSync(path.join(dir,'isolated-future-rounds.json'),JSON.stringify(rounds,null,2));
 const q2=call(queueFn,req({round_numbers:[2]}));const c2=call(claimFn,req());assert.equal(c2.job.job_id,q2.jobs[0].job_id);
 const done2=call(completeFn,req({job_id:c2.job.job_id,claim_token:c2.job.claim_token,source_fingerprint:c2.job.source_fingerprint,expected_result_revision:0,engine_version:'net-skins-full-net-v2',result_state:'OFFICIAL',result_payload:rounds.find(r=>r.round===2)}));assert.equal(done2.published,true);assert.equal(done2.result_revision,1);
 assert.deepEqual(json(`select jsonb_agg(jsonb_build_array(round_number,result_state,published_at is not null) order by round_number) from scoring_authority.net_skins_v1_result_revisions`),[[1,'PROVISIONAL',false],[2,'OFFICIAL',true]]);
 fs.writeFileSync(path.join(dir,'POSTGRES-ACCEPTANCE.json'),JSON.stringify({status:'PASS',configuredReadHTTP:envelope.status,configuration:[24,12],leaseBoundaryCases:12,denialChecks,concurrentClaims:2,successfulConcurrentClaims:1,normalizationRounds:[1,2],activationGuardUnchanged:true,installerInert:true,grantsUnchanged:true,provisionalNotPublished:true,officialCompletionPublishes:true,realProductionJobsCreated:0,realProductionResultsCreated:0},null,2));
});
