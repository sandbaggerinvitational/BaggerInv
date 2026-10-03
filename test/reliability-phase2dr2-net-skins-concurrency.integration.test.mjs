// Actual resource admission, saved entries, unchanged calculator and owned SQL locks.
// Initial synthetic configuration is explicit fixture data; no history rewriting.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createCertificationFixture} from './support/reliability/phase2d-certification-fixture.mjs';
import {certificationProvisionalProfile} from './support/reliability/certification-provisional-profile.mjs';
import {destroyIsolatedCluster,jsonLiteral,openSqlSession} from './support/reliability/postgres17.mjs';
import {certificationTransportRegistration} from './support/reliability/certification-ingress-js-proof.mjs';
import {provisionCertificationNetSkinsFixture} from './support/reliability/certification-net-skins-fixture.mjs';
import {buildTournamentSetupMutation} from '../lib/production-tournament-setup-contract.js';
import {calculateProductionFullNetSkins,FULL_NET_SKINS_ENGINE} from '../lib/production-full-net.js';

const forwardMigrations=certificationProvisionalProfile;
const proofSources=[...forwardMigrations,'test/support/reliability/certification-provisional-profile.mjs','test/reliability-phase2dr2-net-skins-concurrency.integration.test.mjs',
 'test/support/reliability/certification-net-skins-fixture.mjs','test/support/reliability/certification-director-proof.mjs',
 'test/support/reliability/phase2d-certification-fixture.mjs','lib/production-full-net.js','lib/net-skins.js','lib/isolated-director-operations.js'];
const hashes=()=>Object.fromEntries(proofSources.map(file=>[file,createHash('sha256').update(readFileSync(file)).digest('hex')]));
test('Certification Net Skins mixed-round locks and owner calculator preserve authority',async t=>{
 const start=hashes(),evidence={environment:'OWNED_LOCAL_POSTGRESQL17',cases:[],googleCalls:0,googleJobs:0,deadlocks:0,externalNetwork:false};let f;
 const run=async(id,body)=>{let failure;await t.test(id,async()=>{try{evidence.cases.push({id,result:'PASS',details:await body()});}
 catch(error){failure=error;evidence.cases.push({id,result:'FAIL',error:error.message});throw error;}});if(failure)throw failure;};
 try{
  f=await createCertificationFixture({forwardMigrations,registrationFactory:certificationTransportRegistration});
  const {q,rpc,command}=f;
  const execute=input=>{const lease=rpc('admit_certification_operation_v1',input);return rpc('execute_certification_operation_v1',{
   ...input,ingress:{lease_id:lease.lease_id,admission_generation_id:lease.admission_generation_id}});};
  const setup=(action,values)=>{const id=randomUUID(),payload=buildTournamentSetupMutation(action,{expectedRevision:f.model().revision,operationRequestId:id,...values});
   delete payload.operation_request_id;return execute(command('DIRECTOR.MUTATE_SETUP',{...payload,action},{operation_request_id:id}));};
  const match=id=>JSON.parse(q(`select to_jsonb(m)from scoring_authority.matches m where match_id='${id}'`));
  const score=(round,hole)=>{const id=`2026-R${round}-1`,m=match(id),key=`r2:net.r${round}.h${hole}`;
   return execute(command('SCORING.SUBMIT_HOLE',{match_id:id,mutation_key:key,hole_number:hole,expected_match_revision:m.match_revision,
    expected_hole_revision:0,team_1_gross_scores:round===1?[4,4]:[4],team_2_gross_scores:round===1?[5,5]:[5]},
    {authorization:{...f.envelope.authorization,match_id:id,permission_revision:m.permission_revision},operation_request_id:key}));};
  for(const round of[1,2,3])setup('prepare-scoring-context',{matchId:`2026-R${round}-1`});
  const configuration=await provisionCertificationNetSkinsFixture(f);
  for(const round of[1,2,3]){const id=`2026-R${round}-1`;
   for(const action of['mark-live','access-activate']){const m=match(id);execute(command('DIRECTOR.MATCH_CONTROL',{
    action,match_id:id,expected_match_revision:m.match_revision,expected_permission_revision:m.permission_revision}));}}
  const workerEnvelope={...f.envelope,phase:'WORKERS',authorization:{}};
  const begin=`set statement_timeout='5s';set deadlock_timeout='100ms';begin;set local request.jwt.claim.role='service_role';do $context$begin
   perform production_control.push_certification_context_v1(${jsonLiteral(workerEnvelope)},'WORKERS',false);end$context$`;
  const flush="select production_control.flush_score_derived_intents_v1('2026','NET_SKINS',1)";
  const pending=()=>Number(q("select count(*)from scoring_authority.score_derived_intents_v1 where family='NET_SKINS'and status in('PENDING','RETRYABLE')"));
  const parity=()=>JSON.parse(q("select coalesce(jsonb_agg(jsonb_build_object('round',round_number,'status',status,'source',source_fingerprint,'configuration',configuration_fingerprint)order by round_number),'[]')from scoring_authority.net_skins_v1_recalculation_jobs where status in('PENDING','RUNNING')"));
  const financial=()=>q("select jsonb_build_object('configuration',(select jsonb_agg(to_jsonb(r)order by configuration_revision)from scoring_authority.net_skins_v1_configuration_revisions r),'entries',(select jsonb_agg(to_jsonb(e)order by round_number,entry_id)from scoring_authority.net_skins_configuration_entries e),'optins',(select jsonb_agg(to_jsonb(e)order by round_number,revision)from production_control.net_skins_entry_revisions_v1 e))");
  const financialBefore=financial();
  await run('known opposite-round lock cycle becomes one-way wait; concurrent score remains independent',async()=>{
   score(1,1);score(2,1);score(2,2);score(1,2);
   const sessions=[openSqlSession(f.cluster,f.database),openSqlSession(f.cluster,f.database)];let pendingCall;
   try{const pids=[];for(const s of sessions){pids.push(Number(await s.query('select pg_backend_pid()')));await s.query(begin);}
    assert.equal(JSON.parse(await sessions[0].query(flush)).processed,1);pendingCall=sessions[1].query(flush);
    let graph=[];for(let n=0;n<50;n++){graph=JSON.parse(q(`select coalesce(jsonb_agg(jsonb_build_object('pid',pid,'blockedBy',pg_blocking_pids(pid))),'[]')from pg_stat_activity where pid in(${pids})and wait_event='advisory'`));if(graph.length)break;await new Promise(r=>setTimeout(r,10));}
    assert.equal(graph.length,1);assert.equal(graph[0].pid,pids[1]);assert.deepEqual(graph[0].blockedBy,[pids[0]]);
    const start=performance.now();assert.equal(score(3,1).ok,true);const scoreMs=performance.now()-start;assert.ok(scoreMs<1000);
    assert.equal(JSON.parse(await sessions[0].query(flush)).processed,1);await sessions[0].query('commit');
    assert.equal(JSON.parse(await pendingCall).processed,1);assert.equal(JSON.parse(await sessions[1].query(flush)).processed,1);
    await sessions[1].query('commit');return{graph,scoreMs,deadlocks:0};
   }finally{await Promise.allSettled(sessions.map(s=>s.query('rollback')));await Promise.allSettled([pendingCall]);await Promise.allSettled(sessions.map(s=>s.close()));}
  });
  await run('eight mixed-round batches retain exact current source and configuration',async()=>{
   const batches=[];
   for(let iteration=0;iteration<8;iteration++){
    for(const round of(iteration%2?[3,2,1]:[1,2,3]))score(round,iteration+3);
    const expected=pending(),sessions=Array.from({length:3},()=>openSqlSession(f.cluster,f.database));
    try{
     const outcomes=await Promise.all(sessions.map(async s=>{await s.query(begin);const result=JSON.parse(await s.query("select production_control.flush_score_derived_intents_v1('2026','NET_SKINS',8)"));await s.query('commit');return result;}));
     assert.equal(outcomes.reduce((n,r)=>n+r.failed,0),0);assert.equal(outcomes.reduce((n,r)=>n+r.processed,0),expected);assert.equal(pending(),0);
     const jobs=parity();assert.equal(jobs.length,3);
     for(const job of jobs)assert.equal(job.source,q(`select production_control.net_skins_v1_hash(production_control.net_skins_v1_round_source_revision('2026',${job.round}))`));
     assert.equal(financial(),financialBefore);batches.push({iteration,workers:3,processed:expected,deadlocks:0});
    }finally{await Promise.allSettled(sessions.map(s=>s.query('rollback')));await Promise.allSettled(sessions.map(s=>s.close()));}
   }return batches;
  });
  await run('stale and superseded owner completion races current materialization without replacing authority',async()=>{
   const outcomes=[];
   for(const [iteration,scenario]of ['STALE_RUNNING','SUPERSEDED'].entries()){
    const payload={expected_configuration_revision:configuration.configurationRevision,worker_id:'certification-net-skins-stale',lease_seconds:60,
     request_fingerprint:createHash('sha256').update('r2-net-stale-claim-'+scenario).digest('hex')};
    const claimed=rpc('execute_certification_operation_v1',command('DIRECTOR.NET_SKINS_CLAIM',payload)),job=claimed.job;
    assert.ok(job?.claim_token);
    const actual=calculateProductionFullNetSkins(claimed.calculation_input).netSkins.rounds.find(r=>Number(r.round)===job.round_number);
    const completion=command('DIRECTOR.NET_SKINS_COMPLETE',{...payload,job_id:job.job_id,claim_token:job.claim_token,
     expected_result_revision:job.expected_result_revision,source_fingerprint:job.source_fingerprint,engine_version:FULL_NET_SKINS_ENGINE,
     result_state:'PROVISIONAL',result_payload:actual,request_fingerprint:createHash('sha256').update('r2-net-stale-complete-'+scenario).digest('hex')});
    assert.equal(score(job.round_number,11+iteration).ok,true);
    const currentSource=q(`select production_control.net_skins_v1_hash(production_control.net_skins_v1_round_source_revision('2026',${job.round_number}))`);
    assert.notEqual(currentSource,job.source_fingerprint);
    if(scenario==='SUPERSEDED'){
     assert.equal(JSON.parse(q(`${begin};${flush};commit`)).processed,1);
     assert.equal(q(`select status from scoring_authority.net_skins_v1_recalculation_jobs where job_id='${job.job_id}'`),'SUPERSEDED');
     // Another real score supplies the later current intent; no direct intent write.
     assert.equal(score(job.round_number,13).ok,true);
    }
    const expectedSource=q(`select production_control.net_skins_v1_hash(production_control.net_skins_v1_round_source_revision('2026',${job.round_number}))`);
    const sessions=[openSqlSession(f.cluster,f.database),openSqlSession(f.cluster,f.database)];
    try{
     await sessions[0].query(`set statement_timeout='5s';set deadlock_timeout='100ms';create function pg_temp.capture_stale_certification(input jsonb)
      returns jsonb language plpgsql as $fault$declare state text;message text;begin return public.execute_certification_operation_v1(input);
      exception when sqlstate '40001' or sqlstate '42501' then get stacked diagnostics state=returned_sqlstate,message=message_text;
      return jsonb_build_object('denied',true,'sqlstate',state,'code',message);end$fault$`);
     const calls=[()=>sessions[0].query(`begin;select pg_temp.capture_stale_certification(${jsonLiteral(completion)});commit`),
      ()=>sessions[1].query(`${begin};${flush};commit`)];
     const order=iteration?[1,0]:[0,1],results=await Promise.all(order.map(i=>calls[i]()));
     const denied=JSON.parse(results[order.indexOf(0)]),materialized=JSON.parse(results[order.indexOf(1)]);
     assert.equal(denied.denied,true,JSON.stringify(denied));
     assert.match(denied.code,/NET_SKINS_(SOURCE_REVISION_CONFLICT|JOB_LEASE_REQUIRED)/);
     assert.equal(materialized.failed,0);assert.equal(materialized.processed,1);
     assert.equal(q(`select count(*)from scoring_authority.net_skins_v1_result_revisions where job_id='${job.job_id}'`),'0');
     const current=parity().filter(j=>j.round===job.round_number);assert.equal(current.length,1);assert.equal(current[0].source,expectedSource);
     assert.equal(financial(),financialBefore);outcomes.push({scenario,round:job.round_number,denial:denied.code,sourcePreserved:true,deadlocks:0});
    }finally{await Promise.allSettled(sessions.map(s=>s.query('rollback')));await Promise.allSettled(sessions.map(s=>s.close()));}
   }return outcomes;
  });
  await run('typed40P01 materialization failure retains durable retry and recovers after actual backoff',async()=>{
   // Fault injection is an owned fixture trigger, removed before retry. Domain
   // functions, emitted receipts, historical rows and timestamps are untouched.
   q(`create function public.test_certification_net_skins_40p01()returns trigger language plpgsql as $fault$
    begin raise exception using errcode='40P01',message='SYNTHETIC_NET_SKINS_MATERIALIZATION_DEADLOCK';end$fault$;
    revoke all on function public.test_certification_net_skins_40p01()from public,anon,authenticated,service_role;
    create trigger test_certification_net_skins_40p01 before insert or update on scoring_authority.net_skins_v1_recalculation_jobs
    for each row execute function public.test_certification_net_skins_40p01()`);
   try{
    assert.equal(score(3,14).ok,true,'derived fault cannot abort canonical score');
    const result=JSON.parse(q(`${begin};${flush};commit`));assert.equal(result.processed,0);assert.equal(result.failed,1);
   }finally{q(`drop trigger test_certification_net_skins_40p01 on scoring_authority.net_skins_v1_recalculation_jobs;
    drop function public.test_certification_net_skins_40p01()`);}
   const retry=JSON.parse(q(`select to_jsonb(i)from scoring_authority.score_derived_intents_v1 i where family='NET_SKINS'and status='RETRYABLE'`));
   assert.equal(retry.last_sqlstate,'40P01');assert.equal(retry.attempts,1);
   const waitMs=Math.ceil(Number(q(`select greatest(0,extract(epoch from(available_at-clock_timestamp()))*1000)
    from scoring_authority.score_derived_intents_v1 where intent_id='${retry.intent_id}'`)))+30;
   assert.ok(waitMs>0&&waitMs<10000);await new Promise(resolve=>setTimeout(resolve,waitMs));
   const result=JSON.parse(q(`${begin};${flush};commit`));assert.equal(result.failed,0);assert.equal(result.processed,1);
   const recovered=JSON.parse(q(`select to_jsonb(i)from scoring_authority.score_derived_intents_v1 i where intent_id='${retry.intent_id}'`));
   assert.equal(recovered.status,'SUCCEEDED');assert.equal(recovered.attempts,2);assert.equal(recovered.last_sqlstate,null);
   assert.equal(pending(),0);assert.equal(financial(),financialBefore);
   return{sqlstate:'40P01',retryState:retry.status,actualBackoffMs:waitMs,recoveryState:recovered.status,attempts:recovered.attempts,canonicalScoreCommitted:true};
  });
  await run('explicit owner claims and unchanged calculator complete all formats without publishing or changing financial facts',()=>{
   const rounds=[];
   for(let n=0;n<3;n++){
    const payload={expected_configuration_revision:configuration.configurationRevision,worker_id:'certification-net-skins-owner',lease_seconds:60,request_fingerprint:createHash('sha256').update('r2-net-claim-'+n).digest('hex')};
    const request=command('DIRECTOR.NET_SKINS_CLAIM',payload),claimed=rpc('execute_certification_operation_v1',request),job=claimed.job;
    assert.ok(job?.claim_token);assert.equal(rpc('execute_certification_operation_v1',request).idempotent,true);
    const actual=calculateProductionFullNetSkins(claimed.calculation_input).netSkins.rounds.find(r=>Number(r.round)===job.round_number);
    assert.ok(actual.fullNetDetail.length>0);assert.equal(actual.finalized,false);
    const completion=command('DIRECTOR.NET_SKINS_COMPLETE',{...payload,job_id:job.job_id,claim_token:job.claim_token,
     expected_result_revision:job.expected_result_revision,source_fingerprint:job.source_fingerprint,engine_version:FULL_NET_SKINS_ENGINE,
     result_state:'PROVISIONAL',result_payload:actual,request_fingerprint:createHash('sha256').update('r2-net-complete-'+n).digest('hex')});
    assert.equal(rpc('execute_certification_operation_v1',completion).ok,true);assert.equal(rpc('execute_certification_operation_v1',completion).idempotent,true);
    const stored=JSON.parse(q(`select to_jsonb(r)from scoring_authority.net_skins_v1_result_revisions r where job_id='${job.job_id}'`));
    assert.deepEqual(stored.engine_result_payload,actual);assert.equal(stored.public_result_payload,null);assert.equal(stored.published_at,null);
    rounds.push({round:job.round_number,state:stored.result_state,fullNetEntrants:actual.fullNetDetail.length,resultId:stored.result_id});
   }
   assert.deepEqual(rounds.map(r=>r.round).sort(),[1,2,3]);assert.equal(financial(),financialBefore);return rounds;
  });
  await run('wrong resource and participant cannot claim owner financial work',()=>{
   const input=command('DIRECTOR.NET_SKINS_CLAIM',{expected_configuration_revision:configuration.configurationRevision,
    worker_id:'certification-net-skins-owner',request_fingerprint:'b'.repeat(64)});
   assert.throws(()=>rpc('execute_certification_operation_v1',{...input,resource:{...f.resource,resource_id:'CERTIFICATION:'+randomUUID()}}),/DENIED|MISMATCH/);
   assert.throws(()=>rpc('execute_certification_operation_v1',{...input,authorization:{...f.envelope.authorization,role:'PLAYER'}}),/DENIED|DIRECTOR|AUTHORIZATION/);
   assert.equal(q('select count(*)from production_control.resource_scope'),'0');
   assert.equal(q('select count(*)from scoring_authority.google_outbox_events'),'0');
  });
 }finally{
  evidence.sourceManifest=start;evidence.sourceStable=JSON.stringify(start)===JSON.stringify(hashes());
  evidence.limitations=['Known mixed-round ordered lock scenario only, not universal deadlock freedom','Initial synthetic configuration is declared fixture provisioning; entry saves and owner calculator are actual supported operations','No final financial publication or hosted capacity proof'];
  const dir='docs/reliability/phase2d-resource-model/implementation-evidence';mkdirSync(dir,{recursive:true});
  writeFileSync(dir+'/net-skins-concurrency-'+new Date().toISOString().replaceAll(':','-')+'.json',JSON.stringify(evidence,null,2)+'\n');
  if(f)await destroyIsolatedCluster(f.cluster);
 }
 assert.equal(evidence.sourceStable,true,'Source changed during proof');
});
