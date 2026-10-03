// Actual worker and canonical job lifecycle; only one transport response is
// deliberately failed. No job/result/status or publication is seeded/repaired.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createCurrentScoreDerivedDeliveryAdapter} from '../../../lib/score-derived-delivery.js';
import {runScoreDerivedWorker} from '../../../lib/score-derived-worker.js';
import {certificationWorkerTransport,drainCertificationAutomaticWorkers} from './certification-worker-proof.mjs';
import {jsonLiteral} from './postgres17.mjs';

export async function proveCertificationFinalRecapFailure({fixture,runtime,snapshot,closeProbe,evidence={}}){
 const target=runtime.current().tournament_id,before=snapshot();
 assert.equal(before.finalRecapEligible,true);assert.equal(before.publishedSnapshots,1);
 const transport=certificationWorkerTransport(fixture),baseFetch=transport.dependencies.fetchImpl;
 let injected=0;const capturedWrites=[],events=[];
 evidence.events=events;evidence.before=before;
 const fetchImpl=async(url,init)=>{
  const input=JSON.parse(init.body).input;
  if(input.operation_id==='WORKERS.INTELLIGENCE_WRITE'
   &&input.payload?.engines?.some(engine=>engine.key==='TOURNAMENT_FINAL_RECAP')){
   capturedWrites.push(input);
   if(injected++===0)return Response.json({code:'XX000',message:'SYNTHETIC_FINAL_RECAP_PROCESSING_FAILURE'},{status:400});
  }
  return baseFetch(url,init);
 };
 const adapter=await createCurrentScoreDerivedDeliveryAdapter({env:transport.env,
  certificationDependencies:{...transport.dependencies,fetchImpl}});
 const originalFetch=globalThis.fetch;
 globalThis.fetch=()=>{throw new Error('RETIREMENT_CONTRACT_VIOLATION_UNEXPECTED_NETWORK');};
 try{
  const result=await runScoreDerivedWorker({...adapter,maximumCycles:1,intervalMs:10,
   workerId:'final-recap-failure-'+randomUUID(),emit:event=>events.push(event)});
  assert.equal(result.ok,true,'Expected acknowledged feature-local failure, not worker authority failure');
 }finally{globalThis.fetch=originalFetch;}
 evidence.injected=injected;evidence.afterFailure=snapshot();
 assert.equal(injected,1);assert.equal(capturedWrites.length,1);
 assert.ok(events.some(event=>event.type==='failed'&&event.family==='INTELLIGENCE'&&event.classification==='TERMINAL'));
 const failed=snapshot();
 assert.equal(failed.competitiveFingerprint,before.competitiveFingerprint);
 assert.equal(failed.financialFingerprint,before.financialFingerprint);
 assert.deepEqual(failed.currentPublication,before.currentPublication);
 assert.equal(failed.publishedSnapshots,1);
 assert.ok(failed.finalRecapJobs.every(job=>job.status==='FAILED'&&job.delivery_dead_letter_at));
 closeProbe();
 const dead=JSON.parse(fixture.q(`select coalesce(jsonb_agg(to_jsonb(j)order by engine_key),'[]')
  from scoring_authority.competition_recalculation_jobs j where tournament_id=${jsonLiteral(target)}#>>'{}'
   and round_number=0 and engine_key in('TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL','TOURNAMENT_FINAL_RECAP')
   and status='FAILED'and delivery_dead_letter_at is not null`));
 assert.equal(dead.length,3,'A genuine failed bundle retains all three claimed members');
 // Recreate the runtime worker: dead letters remain blocked, never silently
 // reset because the process restarted.
 const restartedTransport=certificationWorkerTransport(fixture);
 const restarted=await createCurrentScoreDerivedDeliveryAdapter({env:restartedTransport.env,
  certificationDependencies:restartedTransport.dependencies});
 const tick=await restarted.tick({workerId:'final-recap-restarted-'+randomUUID(),operationId:randomUUID()});
 evidence.restartedTick=tick;
 // The canonical tick distinguishes terminal work in the current generation
 // from blockedAutomatic, which counts stale-generation/revision work.
 assert.equal(tick.ready.INTELLIGENCE,false);assert.equal(tick.terminal,3);
 assert.ok(tick.pendingAutomatic>=3);assert.equal(tick.activeLeases,0);
 const recovery=[];
 for(const job of dead){
  const id=randomUUID();
  const payload={family:'INTELLIGENCE',work_identity:`${target}:0:${job.engine_key}`,
   request_id:id,expected_cycle:job.delivery_cycle,expected_attempt:job.delivery_attempts,
   reason:'Synthetic FinalRecap failure recovery'};
  const command=runtime.request('DIRECTOR.REQUEUE_DERIVED',payload,runtime.authorization(),id);
  // Requeue owns its existing request receipt; the durable-ingress inventory
  // does not classify this control as a scoring ingress mutation.
  const result=fixture.rpc('execute_certification_operation_v1',command);assert.equal(result.ok,true);
  const replay=fixture.rpc('execute_certification_operation_v1',command);assert.equal(replay.ok,true);
  recovery.push({engine:job.engine_key,result,replay});
 }
 const completedWrites=[];
 const recoveryStarted=performance.now();
 const drain=await drainCertificationAutomaticWorkers(fixture,{onRequest:({input})=>{
  if(input.operation_id==='WORKERS.INTELLIGENCE_WRITE'
   &&input.payload?.engines?.some(engine=>engine.key==='TOURNAMENT_FINAL_RECAP'))completedWrites.push(input);
 }});
 const recoveryWorkerElapsedMs=performance.now()-recoveryStarted;
 const complete=snapshot();
 assert.equal(complete.pendingRequiredJobs,0);
 assert.ok(complete.finalRecapJobs.every(job=>job.status==='SUCCEEDED'&&!job.delivery_dead_letter_at));
 assert.equal(complete.currentFinalRecap.length,1,'Exactly one current FinalRecap result');
 assert.equal(complete.competitiveFingerprint,before.competitiveFingerprint);
 assert.equal(complete.financialFingerprint,before.financialFingerprint);
 assert.deepEqual(complete.currentPublication,before.currentPublication);
 // Deliver the actual completed claim again. Its original claim no longer
 // owns a RUNNING job, so the canonical writer must reject it without mutation.
 assert.equal(completedWrites.length,1,'One actual FinalRecap write was completed');
 const duplicateDelivery=fixture.rpc('execute_certification_operation_v1',completedWrites[0]);
 assert.equal(duplicateDelivery.ok,false);
 assert.equal(duplicateDelivery.code,'STALE_INTELLIGENCE_WORKER');
 const afterDelivery=snapshot();
 assert.deepEqual(afterDelivery.finalRecapJobs,complete.finalRecapJobs);
 assert.deepEqual(afterDelivery.currentFinalRecap,complete.currentFinalRecap);
 assert.deepEqual(afterDelivery.currentPublication,complete.currentPublication);
 assert.equal(afterDelivery.competitiveFingerprint,complete.competitiveFingerprint);
 assert.equal(afterDelivery.financialFingerprint,complete.financialFingerprint);
 // Restart again against the same finished demand. No fresh claim or result
 // may be invented merely because a worker starts again.
 const duplicate=await drainCertificationAutomaticWorkers(fixture);
 const afterDuplicate=snapshot();
 assert.deepEqual(afterDuplicate.finalRecapJobs,complete.finalRecapJobs);
 assert.deepEqual(afterDuplicate.currentFinalRecap,complete.currentFinalRecap);
 assert.equal(afterDuplicate.publishedSnapshots,1);
 return{...evidence,neverAgainId:'NA-2026-CERTIFICATION-FINAL-RECAP-RECOVERY',
  fault:'XX000 before actual bundle write after real claim',injected,events,
  deadLetters:dead.map(job=>({engine:job.engine_key,cycle:job.delivery_cycle,attempts:job.delivery_attempts})),
  restartBlocked:true,recovery,drain,duplicateDelivery,duplicate,publicationUnchanged:true,competitiveAuthorityUnchanged:true,
  recoveryWorkerElapsedMs,measurement:'Single actual post-requeue worker startup, processing and settled-poll drain; local elapsed time',
  manualJobWrites:0,googleCalls:0};
}
