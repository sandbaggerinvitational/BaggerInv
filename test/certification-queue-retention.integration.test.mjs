import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createGlobalFaultFixture} from './support/reliability/certification-global-fault-fixture.mjs';
import {destroyIsolatedCluster} from './support/reliability/postgres17.mjs';
import {consumeProcess,consumerProcess,demand,invocation,delay,waitFor,assertDrain} from './support/reliability/certification-global-fault-process.mjs';
import {queuePublicationTiming,requireQueueAttemptLifetime,QUEUE_TIMING as T} from '../lib/certification-queue-timing.js';
test('owned PG17, safeupdate, real child termination and natural 90-second lease with modeled retained Queue messages',async t=>{
 let f,held;const proof={hosted:false,postgres:17,realChildren:true,remoteTransport:'MODELED_ONLY',manualLeaseWrites:0,cases:[]};
 const check=async(name,fn)=>{let error;await t.test(name,async()=>{try{await fn();proof.cases.push({name,result:'PASS'});}catch(e){error=e;throw e;}});if(error)throw error;};
 try{
  f=await createGlobalFaultFixture({emptyAuction:true});assert.equal(f.q("select current_setting('safeupdate.enabled')"),'on');
  await check('actual maximum START creates 120 reservations; each delay has a full 540-second post-schedule lifetime',async()=>{
   f.start({budget:120,duration_seconds:7200});const batch=f.batch(),published=Date.now();assert.equal(batch.messages.length,120);
   for(const e of batch.messages){const timing=queuePublicationTiming(e,published);
    assert.ok(published+timing.retentionSeconds*1000>=Date.parse(e.scheduled_at)+540_000);
    assert.ok(timing.retentionSeconds<=T.maximumRetentionSeconds);assert.ok(Date.parse(e.expires_at)<=Date.parse(e.scheduled_at)+30_000);}
   assert.equal(f.status().budget,120);f.stop();assert.equal(f.status().state,'OFF');
   await assert.rejects(f.consume(batch.messages[0]),/SUPERVISOR_ADMISSION_DENIED|SUPERVISOR_RESERVATION_DENIED|SUPERVISOR_DISABLED_OR_STALE/);
   proof.maximumBatch={ticks:120,duration:7200,cadence:60,safe:true};
  });
  let original,claim,leaseDeadline,physicalExpiry,started;
  await check('real child claims all required families through unchanged worker; original message stays live beyond reservation expiry',async()=>{
   f.toggle(true);await demand(f);f.toggle(false);const plan=f.arm('DISAPPEAR');f.toggle(true);
   f.start({budget:2,duration_seconds:180});const batch=f.batch();original=batch.messages[0];await f.due(original);
   physicalExpiry=Date.parse(original.scheduled_at)+540_000;started=Date.now();held=consumerProcess(f,original);
   await waitFor(()=>f.q(`select consumed_by is not null from production_control.worker_supervisor_faults_v1 where plan_id='${plan.plan_id}'`),v=>v==='t');
   claim=f.job('TEAM_MOMENTUM');assert.equal(claim.status,'RUNNING');assert.equal(claim.delivery_attempts,1);
   assert.equal(Number(f.q("select extract(epoch from coalesce(lease_expires_at,started_at+interval '90 seconds')-started_at)from scoring_authority.competition_recalculation_jobs where engine_key='TEAM_MOMENTUM'")),90);
   leaseDeadline=Date.parse(f.q("select coalesce(lease_expires_at,started_at+interval '90 seconds')from scoring_authority.competition_recalculation_jobs where engine_key='TEAM_MOMENTUM'"));
   proof.claim={at:claim.started_at,leaseDeadline:new Date(leaseDeadline).toISOString(),leaseSeconds:90,attempt:1,
    reservationExpiresAt:original.expires_at,messageExpiresAt:new Date(physicalExpiry).toISOString()};
   assert.ok(physicalExpiry>leaseDeadline+30_000);
   // Model provider termination only: the real process is allowed 60 seconds.
   await delay(Math.max(0,started+60_000-Date.now()));held.child.kill('SIGKILL');await held.exited;held=null;
   assert.equal(invocation(f,original).state,'RUNNING');assert.ok(Date.now()<leaseDeadline);
   assert.ok(Date.now()>Date.parse(original.expires_at));assert.ok(Date.now()<physicalExpiry);
   proof.termination={ceilingSeconds:60,elapsedMs:Date.now()-started,signal:'SIGKILL',hostedProvider:false};
   const early=await consumeProcess(f,batch.messages[1]);assert.equal(early.result.code,'SUPERVISOR_NOT_DUE_OR_BUSY');
   assert.equal(f.job('TEAM_MOMENTUM').delivery_attempts,1);assert.equal(f.job('TEAM_MOMENTUM').started_at,claim.started_at);
   // A live physical redelivery cannot revive the consumed/expired authority.
   const duplicate=await consumeProcess(f,original);assert.equal(duplicate.status,403);assert.equal(f.job('TEAM_MOMENTUM').delivery_attempts,1);
   proof.earlyReclaim='DENIED';proof.expiredReservationWithLiveMessage='DENIED';
  });
  await check('lease expires naturally; reconciliation and new reservations reclaim attempt two without duplicate current output',async()=>{
   await delay(Math.max(0,leaseDeadline-Date.now()+150));assert.equal(f.status().counts.active_claims,0);
   assert.equal(f.status().counts.expired_claims,2);assert.equal(f.job('TEAM_MOMENTUM').delivery_attempts,1);
   const reconcileDeadline=Date.parse(invocation(f,original).reconcile_after);f.stop();
   await delay(Math.max(0,reconcileDeadline-Date.now()+150));f.ownerQueue('reconcile');
   assert.equal(invocation(f,original).state,'RECONCILED');assert.ok(Date.now()<physicalExpiry);
   requireQueueAttemptLifetime({createdAt:new Date(started-10_000),expiresAt:new Date(physicalExpiry)});
   let recoveryTicks=0;
   for(let n=0;n<2&&f.status().counts.pending_work;n++){
    if(n)await delay(6200);f.start({budget:1});const current=f.batch().messages[0];
    const r=await consumeProcess(f,current);assert.equal(r.status,200);recoveryTicks++;f.stop();
   }
   for(const engine of ['TEAM_MOMENTUM','TOURNAMENT_STORYLINES','TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL']){
    assert.equal(f.job(engine).status,'SUCCEEDED');
    assert.equal(f.q(`select count(*)from scoring_authority.competition_derived_snapshots where is_current and engine_key='${engine}'`),'1');
   }
   assert.equal(f.job('TEAM_MOMENTUM').delivery_attempts,2);assert.ok(Date.now()<physicalExpiry);
   proof.reclaim={naturalLeaseExpiry:true,recoveryTicks,attempts:[1,2],currentOutputsPerFamily:1,elapsedMs:Date.now()-Date.parse(original.scheduled_at),
    sameReservationWorkerReruns:0,visibilityError:null};
   const late=await consumeProcess(f,original);assert.equal(late.status,403);assert.equal(f.job('TEAM_MOMENTUM').delivery_attempts,2);
   f.toggle(false);assertDrain(f);
  });
  await check('STOP and a new epoch cannot admit live physical old messages; no authority/domain/financial expansion',async()=>{
   f.toggle(true);f.start({budget:1});const old=f.batch().messages[0];f.stop();
   await assert.rejects(f.consume(old),/SUPERVISOR_ADMISSION_DENIED|SUPERVISOR_RESERVATION_DENIED|SUPERVISOR_DISABLED_OR_STALE/);
   f.start({budget:1});await assert.rejects(f.consume(old),/SUPERVISOR_RESERVATION_DENIED|SUPERVISOR_ADMISSION_DENIED|SUPERVISOR_DISABLED_OR_STALE/);f.stop();
   f.toggle(false);assertDrain(f);assert.equal(f.status().state,'OFF');
   assert.equal(f.q('select auction_revision from scoring_authority.calcutta_v1_current'),'2');
   assert.equal(f.q('select count(*)from scoring_authority.hole_scores'),'0');
   assert.equal(f.q("select enabled from production_control.certification_admission_v1"),'f');
   assert.equal(f.q('select state from scoring_authority.ingress_gates'),'PAUSED');
   proof.final={pending:0,claims:0,leases:0,unknown:0,deadLetters:0,auctionRevision:2,odds:0,finalRecap:false};
  });
 }finally{
  if(held){held.child.kill('SIGKILL');await held.exited;}if(f)await destroyIsolatedCluster(f.cluster);
  await mkdir('docs/reliability/phase2d-worker-supervision/retention/evidence',{recursive:true});
  await writeFile('docs/reliability/phase2d-worker-supervision/retention/evidence/recovery-cases.json',JSON.stringify(proof,null,2)+'\n');
 }
});
