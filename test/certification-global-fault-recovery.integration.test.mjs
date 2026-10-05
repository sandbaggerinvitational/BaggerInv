import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile}from'node:fs/promises';
import {createGlobalFaultFixture}from'./support/reliability/certification-global-fault-fixture.mjs';
import {destroyIsolatedCluster}from'./support/reliability/postgres17.mjs';
import {consumeProcess,demand,invocation,resume,delay,assertDrain}from'./support/reliability/certification-global-fault-process.mjs';
test('canonical global failures and outward lost ACK through independent private consumers',async t=>{
 let f;const evidence={hosted:false,postgres:17,safeupdate:true,adapterFactory:false,cases:[]};
 const check=async(name,fn)=>{let error;await t.test(name,async()=>{try{await fn();evidence.cases.push({name,result:'PASS'});}catch(e){error=e;throw e;}});if(error)throw error;};
 try{f=await createGlobalFaultFixture();
  await check('three bounded transient ticks persist counts 1/2/3, HALT, deny ordinary delivery and require owner correction',async()=>{
   f.toggle(true);f.start({budget:4,duration_seconds:240});const plan=f.armGlobal('GLOBAL_TRANSIENT',3),batch=f.batch();
   for(let n=1;n<=3;n++){const r=await consumeProcess(f,batch.messages[n-1]);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.result.outcome,'FAILED');
    assert.equal(f.status().consecutive_global_failures,n);assert.equal(invocation(f,batch.messages[n-1]).tick_success,false);
    assert.equal(f.status().counts.pending_work,0);assert.equal(f.q('select count(*)from production_control.score_derived_delivery_attempts_v1'),'0');}
   assert.equal(f.status().state,'HALTED');assert.equal(f.status().last_halt_reason,'INVOCATION_RETRY_EXHAUSTED');
   // It is unnecessary to wait for this doomed reservation's due time.
   await assert.rejects(f.consume(batch.messages[3]),{code:'SUPERVISOR_DISABLED_OR_STALE',queueDisposition:'ACK'});
   assert.throws(()=>resume(f),/SUPERVISOR_FAULT_CORRECTION_REQUIRED/);f.stop();
   const corrected=f.correctGlobal();assert.equal(corrected.corrected,true);assert.equal(f.status().global_faults.consumed_uses,3);
   assert.equal(f.q(`select remaining_uses from production_control.worker_supervisor_global_faults_v5 where plan_id='${plan.plan_id}'`),'0');
   resume(f);const healthy=await consumeProcess(f,f.batch().messages[0]);assert.equal(healthy.result.outcome,'SUCCEEDED');
   assert.equal(f.status().consecutive_global_failures,0);f.stop();f.toggle(false);assertDrain(f);
  });
  await check('fixed deterministic global tick HALTS immediately; owner RESUME only after cause correction',async()=>{
   f.toggle(true);f.start({budget:2,duration_seconds:120});f.armGlobal('GLOBAL_DETERMINISTIC');const batch=f.batch();
   const r=await consumeProcess(f,batch.messages[0]);assert.equal(r.result.outcome,'FAILED');assert.equal(f.status().state,'HALTED');
   assert.equal(f.status().last_halt_reason,'TERMINAL_TICK_FAILURE');assert.equal(f.status().consecutive_global_failures,1);
   await assert.rejects(f.consume(batch.messages[1]),{code:'SUPERVISOR_DISABLED_OR_STALE',queueDisposition:'ACK'});assert.throws(()=>resume(f),/SUPERVISOR_FAULT_CORRECTION_REQUIRED/);
   f.stop();f.correctGlobal();resume(f);assert.equal((await consumeProcess(f,f.batch().messages[0])).result.outcome,'SUCCEEDED');
   f.stop();f.toggle(false);assertDrain(f);
  });
  await check('real canonical outputs commit before outward ACK loss; UNKNOWN/redelivery and natural reconciliation preserve one result',async()=>{
   f.toggle(true);await demand(f);f.start({budget:1,duration_seconds:180});f.armGlobal('INVOCATION_LOST_ACK');const e=f.batch().messages[0];
   const r=await consumeProcess(f,e);assert.equal(r.status,503);assert.equal(r.result.code,'SUPERVISOR_ACKNOWLEDGEMENT_UNKNOWN');assert.equal(r.result.queueDisposition,'RECONCILE');
   let i=invocation(f,e);assert.equal(i.state,'UNKNOWN');assert.equal(i.tick_success,true);assert.equal(f.status().counts.pending_work,0);
   for(const engine of ['TEAM_MOMENTUM','TOURNAMENT_STORYLINES','TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL']){
    assert.equal(f.job(engine).status,'SUCCEEDED');assert.equal(f.job(engine).delivery_attempts,1);
    assert.equal(f.q(`select count(*)from scoring_authority.competition_derived_snapshots where is_current and engine_key='${engine}'`),'1');}
   const retry=await consumeProcess(f,e);assert.equal(retry.result.cycles,0);assert.equal(retry.result.uncertain,true);
   f.stop();assert.throws(()=>f.correctGlobal(),/SUPERVISOR_FAULT_CORRECTION_REQUIRED/);
   await delay(Math.max(0,Date.parse(i.reconcile_after)-Date.now()+200));f.correctGlobal();i=invocation(f,e);
   assert.equal(i.state,'RECONCILED');assert.equal(i.outcome,'TICK_RECORDED_JOB_STATE_RECONCILED');assert.equal(i.tick_success,true);
   assert.ok(i.evidence.canonical_jobs.every(j=>j.status==='SUCCEEDED'));
   assert.equal(f.status().state,'OFF');f.toggle(false);assertDrain(f);
   evidence.lostAck={outward:'LOST',ledger:'UNKNOWN -> '+i.outcome,realOutputs:4,reservationConsumes:1,naturalReconciliation:true};
  });
 }finally{if(f)await destroyIsolatedCluster(f.cluster);await mkdir('docs/reliability/phase2d-worker-supervision/global-fault-v5/evidence',{recursive:true});
  await writeFile('docs/reliability/phase2d-worker-supervision/global-fault-v5/evidence/recovery-cases.json',JSON.stringify(evidence,null,2)+'\n');}
});
