import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createQueueFixture} from './support/reliability/certification-queue-fixture.mjs';
import {destroyIsolatedCluster} from './support/reliability/postgres17.mjs';
import {createCertificationWorkerDemand} from '../tools/reliability/certification-worker-demand.mjs';
import {certificationOperationRpc} from '../lib/certification-runtime-server.js';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('native queue durable transient, terminal/recovery and cross-invocation halt',async t=>{
 let f;try{f=await createQueueFixture();const options={env:f.env,dependencies:f.dependencies};
 const check=async(name,fn)=>{let e;await t.test(name,async()=>{try{await fn();}catch(x){e=x;throw x;}});if(e)throw e;};
 const demand=async()=>{f.toggle(true);await createCertificationWorkerDemand(options);f.toggle(false);};
 const entry=async()=>{const e=f.batch().messages[0];await f.due(e);return e;};
 await check('one-use transient transport fault uses canonical durable attempts/backoff; a new consumer preserves attempt history',async()=>{
  await demand();f.arm('TRANSIENT');f.toggle(true);f.start({budget:1});
  const e=await entry(),result=await f.consume(e);assert.equal(result.outcome,'JOB_RETRY');assert.equal(f.job('TEAM_MOMENTUM').delivery_attempts,1);
  assert.equal(f.job('TEAM_MOMENTUM').delivery_error_class,'RETRYABLE');assert.ok(Date.parse(f.job('TEAM_MOMENTUM').delivery_available_at)>Date.parse(f.job('TEAM_MOMENTUM').updated_at));
  assert.equal((await f.consume(e)).cycles,0);assert.equal(f.job('TEAM_MOMENTUM').delivery_attempts,1);f.stop();
  await delay(6200);f.start({budget:1});await f.consume(await entry());assert.equal(f.job('TEAM_MOMENTUM').delivery_attempts,2);assert.equal(f.job('TEAM_MOMENTUM').status,'SUCCEEDED');
  assert.equal(f.status().counts.pending_work,0);f.stop();f.toggle(false);
 });
 await check('terminal fault retains truthful canonical dead-letter evidence; cause-corrected Director requeue and owner RESUME recover',async()=>{
  await demand();f.arm('TERMINAL');f.toggle(true);f.start({budget:2});const e=await entry();const remaining=f.batch().messages[1];assert.equal((await f.consume(e)).outcome,'TERMINAL');
  assert.equal(f.status().state,'HALTED');assert.ok(f.job('TEAM_MOMENTUM').delivery_dead_letter_at);
  await assert.rejects(f.consume(remaining),/SUPERVISOR_DISABLED_OR_STALE/);
  f.stop();assert.throws(()=>f.start({budget:1}),/SUPERVISOR_SAFE_START_REQUIRED/);
  const attempts=Number(f.q('select count(*)from production_control.score_derived_delivery_attempts_v1'));
  for(const engine of ['TEAM_MOMENTUM','TOURNAMENT_STORYLINES']){const j=f.job(engine);if(!j.delivery_dead_letter_at)continue;
   const id=randomUUID();const result=await certificationOperationRpc('DIRECTOR.REQUEUE_DERIVED',{contract_version:'score-derived-delivery-v1',tournament_id:'2026',family:'COMPETITION',
    work_identity:'2026:0:'+engine,request_id:id,expected_cycle:j.delivery_cycle,expected_attempt:j.delivery_attempts,reason:'Consumed fixed Certification terminal fault corrected'},
    {env:f.env,authorization:f.authorization,operationRequestId:id},f.dependencies);assert.equal(result.payload.ok,true);
   assert.equal(f.job(engine).delivery_cycle,j.delivery_cycle+1);
  }
  assert.ok(Number(f.q('select count(*)from production_control.score_derived_delivery_attempts_v1'))>attempts);
  assert.equal(f.status().counts.dead_letters,0);f.start({budget:1,action:'RESUME',reconciliation_reason:'Fixed terminal test consumed and canonical Director recovery complete'});
  await f.consume(await entry());assert.equal(f.status().counts.pending_work,0);f.stop();f.toggle(false);
 });
 await check('global failures accumulate across distinct consumer invocations and halt after three without resetting job attempts',async()=>{
  f.toggle(true);f.start({budget:3});const entries=f.batch().messages;
  const factory=async()=>({tick:async()=>{throw Object.assign(new Error('Synthetic transient tick'),{code:'ECONNRESET'});},processors:{CALCUTTA:async()=>({ok:true}),COMPETITION:async()=>({ok:true}),INTELLIGENCE:async()=>({ok:true})}});
  for(let n=0;n<3;n++){await f.due(entries[n]);assert.equal((await f.consume(entries[n],{adapterFactory:factory})).outcome,'FAILED');assert.equal(f.status().consecutive_global_failures,n+1);}
  assert.equal(f.status().state,'HALTED');assert.equal(f.status().last_halt_reason,'INVOCATION_RETRY_EXHAUSTED');assert.equal(f.status().consecutive_invocation_failures,3);
  f.stop();f.toggle(false);assert.equal(f.status().counts.active_claims,0);assert.equal(f.status().counts.active_leases,0);
  assert.equal(f.status().counts.dead_letters,0);assert.equal(f.q("select production_control.derived_final_recap_ready_v1('2026')"),'f');
 });
 }finally{if(f)await destroyIsolatedCluster(f.cluster);}
});
