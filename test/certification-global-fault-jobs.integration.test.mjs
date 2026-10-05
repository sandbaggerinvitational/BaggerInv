import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID}from'node:crypto';
import {mkdir,writeFile}from'node:fs/promises';
import {createGlobalFaultFixture}from'./support/reliability/certification-global-fault-fixture.mjs';
import {destroyIsolatedCluster}from'./support/reliability/postgres17.mjs';
import {certificationOperationRpc}from'../lib/certification-runtime-server.js';
import {consumeProcess,consumerProcess,demand,invocation,resume,delay,waitFor,assertDrain}from'./support/reliability/certification-global-fault-process.mjs';
test('unchanged job faults, natural leases, supersession and concurrent native-consumer model',async t=>{
 let f,held;const evidence={hosted:false,postgres:17,safeupdate:true,realChildren:true,adapterFactory:false,cases:[]};
 const check=async(name,fn)=>{let error;await t.test(name,async()=>{try{await fn();evidence.cases.push({name,result:'PASS'});}catch(e){error=e;throw e;}});if(error)throw error;};
 const faultConsumed=plan=>waitFor(()=>f.q(`select consumed_by is not null from production_control.worker_supervisor_faults_v1 where plan_id='${plan.plan_id}'`),x=>x==='t');
 const requeue=async engine=>{const j=f.job(engine),id=randomUUID();const r=await certificationOperationRpc('DIRECTOR.REQUEUE_DERIVED',
  {contract_version:'score-derived-delivery-v1',tournament_id:'2026',family:'COMPETITION',work_identity:'2026:0:'+engine,request_id:id,
   expected_cycle:j.delivery_cycle,expected_attempt:j.delivery_attempts,reason:'Consumed fixed Certification synthetic cause removed'},
  {env:f.env,authorization:f.authorization,operationRequestId:id},f.dependencies);assert.equal(r.payload.ok,true);};
 try{f=await createGlobalFaultFixture({emptyAuction:true});
  assert.equal(f.q('select auction_revision from scoring_authority.calcutta_v1_current'),'2');
  assert.equal(f.q("select jsonb_array_length(auction_manifest->'purchases')from scoring_authority.calcutta_v1_auction_fact_revisions where auction_revision=2"),'0');
  await check('job transient fault uses canonical backoff and preserves attempts across fresh consumer processes',async()=>{
   f.toggle(true);await demand(f);f.toggle(false);f.arm('TRANSIENT');f.toggle(true);f.start({budget:1});
   const r=await consumeProcess(f,f.batch().messages[0]);assert.equal(r.result.outcome,'JOB_RETRY');const j=f.job('TEAM_MOMENTUM');
   assert.equal(j.delivery_attempts,1);assert.equal(j.delivery_error_class,'RETRYABLE');assert.equal(j.delivery_dead_letter_at,null);
   assert.ok(Date.parse(j.delivery_available_at)>Date.parse(j.updated_at));f.stop();await delay(Math.max(0,Date.parse(j.delivery_available_at)-Date.now()+100));
   f.start({budget:1});assert.equal((await consumeProcess(f,f.batch().messages[0])).result.outcome,'SUCCEEDED');
   assert.equal(f.job('TEAM_MOMENTUM').delivery_attempts,2);f.stop();f.toggle(false);assertDrain(f);
  });
  await check('terminal job fault creates real dead letter; certified Director recovery advances cycle and retains attempt history',async()=>{
   f.toggle(true);await demand(f);f.toggle(false);f.arm('TERMINAL');f.toggle(true);f.start({budget:1});
   const r=await consumeProcess(f,f.batch().messages[0]);assert.equal(r.result.outcome,'TERMINAL');assert.equal(f.status().state,'HALTED');
   const dead=f.job('TEAM_MOMENTUM');assert.ok(dead.delivery_dead_letter_at);assert.equal(dead.delivery_error_class,'TERMINAL');
   const history=Number(f.q('select count(*)from production_control.score_derived_delivery_attempts_v1'));
   for(const e of ['TEAM_MOMENTUM','TOURNAMENT_STORYLINES'])if(f.job(e).delivery_dead_letter_at)await requeue(e);
   assert.equal(f.job('TEAM_MOMENTUM').delivery_cycle,dead.delivery_cycle+1);
   assert.ok(Number(f.q('select count(*)from production_control.score_derived_delivery_attempts_v1'))>history);
   resume(f);assert.equal((await consumeProcess(f,f.batch().messages[0])).result.outcome,'SUCCEEDED');
   f.stop();f.toggle(false);assertDrain(f);evidence.terminal={attempt:dead.delivery_attempts,error:'TERMINAL',historyRetained:true,recovery:'DIRECTOR.REQUEUE_DERIVED'};
  });
  await check('real disappearance retains 90-second lease; early independent tick cannot steal; natural expiry safely reclaims',async()=>{
   f.toggle(true);await demand(f);f.toggle(false);const plan=f.arm('DISAPPEAR');f.toggle(true);f.start({budget:2,duration_seconds:180});
   const batch=f.batch();await f.due(batch.messages[0]);held=consumerProcess(f,batch.messages[0]);await faultConsumed(plan);
   const j=f.job('TEAM_MOMENTUM');assert.equal(j.status,'RUNNING');assert.equal(j.delivery_attempts,1);
   assert.equal(Number(f.q("select extract(epoch from coalesce(lease_expires_at,started_at+interval '90 seconds')-started_at)from scoring_authority.competition_recalculation_jobs where engine_key='TEAM_MOMENTUM'")),90);
   const leaseDeadline=f.q("select coalesce(lease_expires_at,started_at+interval '90 seconds')from scoring_authority.competition_recalculation_jobs where engine_key='TEAM_MOMENTUM'");
   held.child.kill('SIGKILL');await held.exited;held=null;
   assert.equal(invocation(f,batch.messages[0]).state,'RUNNING');assert.equal(f.status().counts.active_claims,2);
   const early=await consumeProcess(f,batch.messages[1]);assert.equal(early.result.code,'SUPERVISOR_NOT_DUE_OR_BUSY');assert.equal(early.result.queueDisposition,'RETRY');assert.equal(f.job('TEAM_MOMENTUM').delivery_attempts,1);
   assert.equal(f.job('TEAM_MOMENTUM').started_at,j.started_at); // no early ownership transfer
   await delay(Math.max(0,Date.parse(leaseDeadline)-Date.now()+100));assert.equal(f.status().counts.active_claims,0);assert.equal(f.status().counts.expired_claims,2);
   f.stop();await delay(Math.max(0,Date.parse(invocation(f,batch.messages[0]).reconcile_after)-Date.now()+150));f.ownerQueue('reconcile');
   // Reclaim applies the existing durable expiry/backoff contract first.
   if(f.status().counts.pending_work){f.start({budget:1});await consumeProcess(f,f.batch().messages[0]);f.stop();}
   if(f.status().counts.pending_work){await delay(6200);f.start({budget:1});await consumeProcess(f,f.batch().messages[0]);f.stop();}
   assert.equal(f.job('TEAM_MOMENTUM').status,'SUCCEEDED');assert.equal(f.job('TEAM_MOMENTUM').delivery_attempts,2);
   f.toggle(false);assertDrain(f);evidence.lease={seconds:90,natural:true,manualTimestampWrites:0,earlySteal:false,attempts:2};
  });
  await check('held old claim rejects a lawful scoring-lock source revision; current cycle drains without preparation or financial demand',async()=>{
   f.toggle(true);await demand(f);f.toggle(false);const old=f.job('TEAM_MOMENTUM'),plan=f.arm('SUPERSEDE');f.toggle(true);f.start({budget:1});
   const priorOutputs=Number(f.q("select count(*)from scoring_authority.competition_derived_snapshots where engine_key='TEAM_MOMENTUM'"));
   const e=f.batch().messages[0];await f.due(e);held=consumerProcess(f,e);await faultConsumed(plan);
   const m=JSON.parse(f.q("select to_jsonb(m)from scoring_authority.matches m where match_id='2026-R3-11'"));
   const r=await certificationOperationRpc('DIRECTOR.MATCH_CONTROL',{action:'scoring-lock',match_id:m.match_id,
    expected_match_revision:m.match_revision,expected_permission_revision:m.permission_revision},
    {env:f.env,authorization:f.authorization,operationRequestId:randomUUID()},f.dependencies);
   assert.equal(r.payload.ok,true,JSON.stringify(r));assert.ok(f.job('TEAM_MOMENTUM').delivery_cycle>old.delivery_cycle);
   assert.notDeepEqual(f.job('TEAM_MOMENTUM').requested_source_revision,old.requested_source_revision);
   f.ownerQueue('fault_control',{action:'RELEASE',plan_id:plan.plan_id});const done=await held.result;await held.exited;held=null;
   assert.equal(done.status,200);assert.equal(f.job('TEAM_MOMENTUM').status,'PENDING');
   assert.equal(Number(f.q("select count(*)from scoring_authority.competition_derived_snapshots where engine_key='TEAM_MOMENTUM'")),priorOutputs);
   const currentCycle=f.job('TEAM_MOMENTUM').delivery_cycle;f.stop();
   resume(f);await consumeProcess(f,f.batch().messages[0]);f.stop();
   assert.equal(f.q("select status from scoring_authority.matches where match_id='2026-R3-11'"),'UPCOMING');
   assert.equal(f.q('select count(*)from scoring_authority.hole_scores'),'0');f.toggle(false);assertDrain(f);
   assert.equal(f.q('select auction_revision from scoring_authority.calcutta_v1_current'),'2');
   assert.equal(f.q("select count(*)from scoring_authority.competition_derived_snapshots where is_current and engine_key='TEAM_MOMENTUM'"),'1');
   evidence.supersession={oldCycle:old.delivery_cycle,currentCycle,oldOutputCreated:false,preparation:false,auctionRevision:2};
  });
  await check('two slots, same reservation contention, out-of-order and duplicate deliveries retain one canonical owner/output',async()=>{
   // A tee-time refresh after the previous lock/source has current outputs is
   // not assumed to create eligible demand. Qualify contention independently
   // on a fresh owned counterpart, preserving the real PENDING source guard.
   assertDrain(f);await destroyIsolatedCluster(f.cluster);f=null;f=await createGlobalFaultFixture({emptyAuction:true});
   f.toggle(true);await demand(f);f.toggle(false);f.arm('CONTENTION');f.toggle(true);f.start({budget:2,slots:2,duration_seconds:120});
   const batch=f.batch();await f.due(batch.messages[0]);const a=consumerProcess(f,batch.messages[1]),b=consumerProcess(f,batch.messages[0]),duplicate=consumerProcess(f,batch.messages[0]);
   const results=await Promise.all([a.result,b.result,duplicate.result]);await Promise.all([a.exited,b.exited,duplicate.exited]);
   assert.ok(results.every(x=>x.status===200),JSON.stringify(results));assert.equal(results.filter(x=>x.result.cycles===1).length,2);
   assert.equal(f.status().consumed,2);assert.equal((await consumeProcess(f,batch.messages[0])).result.cycles,0);
   for(const e of ['TEAM_MOMENTUM','TOURNAMENT_STORYLINES','TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL']){
    assert.equal(f.job(e).delivery_attempts,1);assert.equal(f.q(`select count(*)from scoring_authority.competition_derived_snapshots where is_current and engine_key='${e}'`),'1');}
   f.stop();assert.equal((await f.consume(batch.messages[0])).cycles,0);f.toggle(false);assertDrain(f);
  });
 }finally{if(held){held.child.kill('SIGKILL');await held.exited;}if(f)await destroyIsolatedCluster(f.cluster);
  await mkdir('docs/reliability/phase2d-worker-supervision/global-fault-v5/evidence',{recursive:true});
  await writeFile('docs/reliability/phase2d-worker-supervision/global-fault-v5/evidence/job-cases.json',JSON.stringify(evidence,null,2)+'\n');}
});
