// Complete annual chronology. Publication is a separate explicit synthetic
// Director operation; this helper never makes a worker or annual control publish.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {jsonLiteral,openSqlSession} from './postgres17.mjs';
import {drainCertificationAutomaticWorkers,certificationWorkerTransport} from './certification-worker-proof.mjs';
import {certificationAnnualObservations,assertNoPrivateResourceProvenance} from './certification-annual-observations.mjs';
import {proveCertificationFinalRecapFailure} from './certification-final-recap-failure-proof.mjs';
import {certificationReadAliasRpc} from '../../../lib/certification-read-adapters.js';
import {proveCertificationSuccessorReads} from './certification-successor-read-proof.mjs';
import {certificationOddsStack} from './certification-odds-proof.mjs';

function denied(body,pattern){
 let captured;
 try{body();}catch(error){captured=error;}
 assert.ok(captured,'The invalid annual operation must fail closed');
 assert.match(captured.message,pattern);
 return{status:'DENIED',message:captured.message.slice(-1500)};
}

function proveReopenedAnnualAncestry(fixture,runtime,{target,payload,closure,closedGeneration,annualRoot}){
 const literal=value=>`${jsonLiteral(value)}#>>'{}'`;
 const generation=`(${literal(closedGeneration)})::uuid`,closureId=`(${literal(closure.closure_id)})::uuid`;
 const parentId=`(${literal(closure.prior_certification_closure_id)})::uuid`;
 const rootId=`(${literal(annualRoot.predecessor_closure_id)})::uuid`;
 const stateSql=`select jsonb_build_object(
  'closures',(select md5(jsonb_agg(to_jsonb(c)order by closure_id)::text)from production_control.scoring_admission_closures c),
  'generations',(select md5(jsonb_agg(to_jsonb(g)order by generation_id)::text)from production_control.certification_ingress_generations_v1 g),
  'annual',(select md5(jsonb_agg(to_jsonb(a)order by runtime_generation_id)::text)from production_control.annual_scoring_runtime_authorities_v1 a),
  'pointer',(select to_jsonb(p)from production_control.current_tournament_pointer_v1 p))`;
 const before=fixture.q(stateSql),input=runtime.transitionRequest('ACTIVATE',payload);
 const cases=[
  ['SKIPPED_IMMEDIATE_PARENT',`update production_control.scoring_admission_closures set prior_certification_closure_id=${rootId} where closure_id=${closureId}`],
  ['GENERATION_CYCLE',`update production_control.certification_ingress_generations_v1 set predecessor_generation_id=generation_id where generation_id=${generation}`],
  ['WRONG_EPOCH',`update production_control.certification_ingress_generations_v1 set authority_epoch_id=(select authority_epoch_id from production_control.certification_initialization_origins_v1) where generation_id=${generation}`],
  ['FOREIGN_RESOURCE',`update production_control.scoring_admission_closures set certification_resource_id='CERTIFICATION:foreign' where closure_id=${closureId}`],
  ['WRONG_ANNUAL_ROOT',`update production_control.annual_scoring_runtime_authorities_v1 set predecessor_closure_id=${closureId} where tournament_id=${literal(target)}`],
  ['ANNUAL_BOUNDARY_FINGERPRINT',`update production_control.annual_scoring_runtime_authorities_v1 set predecessor_boundary_fingerprint=repeat('f',64) where tournament_id=${literal(target)}`],
  ['IMMEDIATE_PARENT_FINGERPRINT',`update production_control.scoring_admission_closures set lease_set_fingerprint=repeat('f',64) where closure_id=${parentId}`]
 ];
 const results=[];
 for(const[name,mutation]of cases){
  const result=JSON.parse(fixture.q(`begin;create temporary table ancestry_observation(value jsonb);
   do $fault$declare code text;message text;changed integer;response jsonb;begin
    begin ${mutation};get diagnostics changed=row_count;if changed<>1 then raise exception 'ANCESTRY_FAULT_TARGET_COUNT:%',changed;end if;
    exception when others then get stacked diagnostics code=returned_sqlstate,message=message_text;
     insert into ancestry_observation values(jsonb_build_object('stage','MUTATION_DENIED','sqlstate',code,'message',message));return;end;
    begin response:=public.mutate_certification_annual_transition_v1(${jsonLiteral(input)});
     insert into ancestry_observation values(jsonb_build_object('stage','ACTIVATE_ADMITTED','response',response));
    exception when others then get stacked diagnostics code=returned_sqlstate,message=message_text;
     insert into ancestry_observation values(jsonb_build_object('stage','ACTIVATE_DENIED','sqlstate',code,'message',message));end;
   end;$fault$;select value from ancestry_observation;rollback;`,'service_role'));
  if(result.stage==='MUTATION_DENIED'){
   // The preserved annual row guard classifies invalid root lineage as an
   // authorization failure; immutable columns use the separate55000 contract.
   const expected=name==='WRONG_ANNUAL_ROOT'
    ?{sqlstate:'42501',message:'CERTIFICATION_ANNUAL_LINEAGE_REQUIRED'}
    :{sqlstate:'55000',message:(name==='GENERATION_CYCLE'||name==='WRONG_EPOCH')
      ?'CERTIFICATION_INGRESS_GENERATION_IMMUTABLE':'CERTIFICATION_ANNUAL_PROVENANCE_IMMUTABLE'};
   assert.equal(result.sqlstate,expected.sqlstate,`${name}:${JSON.stringify(result)}`);
   assert.equal(result.message,expected.message,name);
  }else{
   assert.equal(result.stage,'ACTIVATE_DENIED',name);assert.equal(result.sqlstate,'40001');
   assert.match(result.message,/PRODUCTION_ANNUAL_SCORING_PRECOMMIT_ABORTED|CERTIFICATION_ANNUAL_LINEAGE_REQUIRED/);
  }
  assert.equal(fixture.q(stateSql),before,'Invalid ancestry must not persist or advance authority');
  results.push({name,...result,persistedChange:false});
 }
 for(const role of['service_role','anon','authenticated']){
  assert.throws(()=>fixture.q(`set role ${role};select production_control.certification_annual_predecessor_certificate_v1(${literal(target)})`,role),/permission denied/);
  assert.throws(()=>fixture.q(`set role ${role};select production_control.close_certification_annual_predecessor_v1('{}',${literal(target)})`,role),/permission denied/);
 }
 return{proofLayer:'POSTGRESQL_RPC_ROLLBACK_FAILURE_INJECTION',triggersDisabled:false,privateCoreDirectAccess:'DENIED',cases:results};
}

export async function completeCertificationAnnualChronology({fixture,runtime,successor,
 calculateAndPublish,proveRelease,evidence,exerciseAbort=false,concurrentActivation=false,terminalClosed=false}){
 const pointer=runtime.current(),target=pointer.tournament_id;
 const observation=certificationAnnualObservations(fixture,target);
 const snapshot=()=>observation.state();
 const annualRoot=()=>target==='2026'?null:JSON.parse(fixture.q(`select jsonb_build_object(
  'runtime_generation_id',runtime_generation_id,'predecessor_tournament_id',predecessor_tournament_id,
  'predecessor_closure_id',predecessor_closure_id,'predecessor_boundary_fingerprint',predecessor_boundary_fingerprint,
  'authority_generation_id',authority_generation_id,'pointer_revision',pointer_revision)
  from production_control.annual_scoring_runtime_authorities_v1 where tournament_id=${jsonLiteral(target)}#>>'{}'`));
 const immutableAnnualRoot=annualRoot();
 const record=(step,data)=>{evidence.chronology.push({step,...data});};
 evidence.neverAgainId='NA-2026-CERTIFICATION-ANNUAL-PUBLISHED-FINAL';
 evidence.chronology=[];
 evidence.prePublication=snapshot();
 assert.equal(evidence.prePublication.finals,24);assert.equal(evidence.prePublication.holes,432);
 assert.equal(evidence.prePublication.publishedSnapshots,0,'Last Final cannot publish');
 assert.equal(evidence.prePublication.finalRecapEligible,false);
 evidence.scoreIntegrity=observation.scoreIntegrity();
 let fixed2026Finalized;
 if(target==='2026'){
  const fixed=fixture.rpc('read_certification_projection_v1',{
   ...fixture.envelope,phase:'READS',operation:'READS.CURRENT_VIEW',
   expected_context_token:fixture.context('READS').context_token,
   payload:{surface:'HISTORY_2026',target_tournament_id:target}});
  assert.equal(fixed.ok,true);assert.equal(fixed.data.finalized_snapshots.length,24);
  fixed2026Finalized=fixed.data.finalized_snapshots;
 }
 record('CANONICAL_432_HOLES_24_FINALS',{publicationCount:0});

 evidence.workerBindingsBefore=observation.workerBindings();
 if(target!=='2026'){
  const beforeInvalidTick=observation.applicationState();
  const tick={...fixture.envelope,phase:'WORKERS',operation_id:'WORKERS.DELIVERY_TICK',
   operation_request_id:randomUUID(),expected_context_token:fixture.context('WORKERS').context_token,
   payload:{contract_version:'score-derived-delivery-v1',worker_id:'wrong-context-proof',cycle_operation_id:randomUUID()}};
  evidence.workerContextDenials={
   stale:denied(()=>fixture.rpc('execute_certification_operation_v1',{...tick,expected_context_token:'0'.repeat(64)}),/CONTEXT_STALE/),
   wrongResource:denied(()=>fixture.rpc('execute_certification_operation_v1',{...tick,
    resource:{...tick.resource,resource_id:'BAGGER_INV_PRODUCTION'}}),/RESOURCE|BINDING|CONTEXT/)};
  assert.deepEqual(observation.applicationState(),beforeInvalidTick,'Denied worker context cannot rebind or process jobs');
 }
 evidence.prePublicationWorkers=await drainCertificationAutomaticWorkers(fixture);
 evidence.workerBindingsAfter=observation.workerBindings();
 if(target!=='2026'){
  assert.ok(evidence.workerBindingsAfter.expectedRuntimeGeneration);
  assert.ok(evidence.workerBindingsAfter.families.COMPETITION.rows>=5);
  for(const value of Object.values(evidence.workerBindingsAfter.families)){
   assert.equal(value.mismatched,0,'Every existing required current job binds its exact active runtime');
   value.proof=value.rows?'ACTUAL_JOB_ROWS':'NOT_EXERCISED_NO_JOB';
  }
 }
 const waiting=snapshot();
 assert.equal(waiting.publishedSnapshots,0,'Worker drain cannot publish');
 assert.equal(waiting.finalRecapEligible,false);
 assert.ok(waiting.finalRecapJobs.some(j=>j.status!=='SUCCEEDED'),'Unpublished FinalRecap must remain unfinished');
 assert.ok(evidence.prePublicationWorkers.events.some(e=>e.type==='tick'&&e.waitingPublication>0));
 evidence.waitingFinalRecap=waiting;
 evidence.publicationBefore=observation.publicationProof();
 record('FINAL_RECAP_WAITING_PUBLISHED_FINAL_GATE',{pendingRequiredJobs:waiting.pendingRequiredJobs});

 const prepare=()=>{
  const ready=runtime.readiness(successor);
  return runtime.transition('PREPARE',{expected_current_tournament_id:target,expected_pointer_revision:pointer.pointer_revision,
   target_tournament_id:successor,expected_revision:Number(fixture.q(`select lifecycle_revision from production_control.future_tournament_catalog_v1 where tournament_id=${jsonLiteral(successor)}#>>'{}'`)),
   readiness_fingerprint:ready.fingerprint});
 };
 let prepared=prepare();
 assert.equal(snapshot().publishedSnapshots,0,'Annual PREPARE cannot publish');
 const transitionPayload=value=>({expected_current_tournament_id:target,expected_pointer_revision:pointer.pointer_revision,
  transition_id:value.result.transitionId,expected_runtime_generation_id:value.result.runtimeGenerationId,
  expected_annual_authority_generation_id:value.result.authorityGenerationId,
  expected_annual_admission_generation_id:value.result.admissionGenerationId});
 if(exerciseAbort){
  evidence.preparedAbort=runtime.transition('ABORT',transitionPayload(prepared));
  assert.equal(evidence.preparedAbort.result.pointerChanged,false);
  assert.equal(runtime.current().tournament_id,target);
  assert.equal(snapshot().publishedSnapshots,0,'Annual ABORT cannot publish');
  assert.equal(runtime.transitionStatus(evidence.preparedAbort.input).status,'COMMITTED');
  const replay=runtime.transition('ABORT',evidence.preparedAbort.input.payload,evidence.preparedAbort.input.operation_request_id);
  assert.equal(replay.result.idempotent,true);
  prepared=prepare();
 }
 evidence.prepare=prepared;
 assert.equal(runtime.transitionStatus(prepared.input).status,'COMMITTED');
 assert.equal(runtime.transition('PREPARE',prepared.input.payload,prepared.input.operation_request_id).result.idempotent,true);
 evidence.prepareIdentityConflict=denied(()=>runtime.transition('PREPARE',{
  ...prepared.input.payload,readiness_fingerprint:'0'.repeat(64)},prepared.input.operation_request_id),
 /REQUEST_REUSE|HASH|CONFLICT|FINGERPRINT/);
 let payload=transitionPayload(prepared);
 const closePayload=()=>{
  const generation=JSON.parse(fixture.q(`select to_jsonb(g)from production_control.certification_ingress_generations_v1 g where state='OPEN'and tournament_id=${jsonLiteral(target)}#>>'{}'`));
  assert.ok(generation);
  return{...payload,expected_certification_admission_generation_id:generation.generation_id,
   expected_certification_admission_revision:generation.revision};
 };
 const closeInput=closePayload();
 evidence.preCalculationClose=denied(()=>runtime.transition('CLOSE',closeInput),/PRODUCTION_ANNUAL_PREDECESSOR_DERIVED_WORK_PENDING/);
 assert.equal(snapshot().publishedSnapshots,0,'Annual CLOSE cannot publish');
 assert.equal(runtime.current().tournament_id,target);
 record('CLOSE_BEFORE_PUBLICATION_BLOCKED',{reason:'PRODUCTION_ANNUAL_PREDECESSOR_DERIVED_WORK_PENDING'});

 const before= snapshot();
 evidence.odds=await calculateAndPublish(fixture,{tournamentId:target,beforePublication:async calculation=>{
  const calculated=snapshot();
  assert.equal(calculated.publishedSnapshots,0,'Calculation completion cannot publish');
  assert.equal(calculated.finalRecapEligible,false);
  assert.equal(calculated.competitiveFingerprint,before.competitiveFingerprint);
  assert.equal(calculated.financialFingerprint,before.financialFingerprint);
  evidence.immediatelyBeforePublicationClose=denied(()=>runtime.transition('CLOSE',closeInput),/PRODUCTION_ANNUAL_PREDECESSOR_DERIVED_WORK_PENDING/);
  assert.equal(snapshot().publishedSnapshots,0,'Failed CLOSE cannot publish');
  record('GENUINE_CALCULATION_READY_STILL_UNPUBLISHED',{explicitOwnerActionPending:true});
 }});
 const published=snapshot();
 assert.equal(published.publishedSnapshots,1,'One explicit first publication');
 assert.equal(published.finalRecapEligible,true,'Real eligibility follows verified Final Results publication');
 assert.equal(published.competitiveFingerprint,before.competitiveFingerprint);
 assert.equal(published.financialFingerprint,before.financialFingerprint);
 evidence.afterExplicitPublication=published;
 evidence.publicationAfter=observation.publicationProof();
 record('EXPLICIT_DIRECTOR_PUBLICATION_COMMITTED',{snapshotId:published.currentPublication.current_snapshot_id,
  revision:published.currentPublication.publication_revision});

 evidence.finalRecapFailure={};
 evidence.finalRecapFailure=await proveCertificationFinalRecapFailure({fixture,runtime,snapshot,evidence:evidence.finalRecapFailure,
  closeProbe:()=>denied(()=>runtime.transition('CLOSE',closePayload()),/PRODUCTION_ANNUAL_PREDECESSOR_DERIVED_WORK_PENDING/)});
 evidence.postPublicationWorkers=evidence.finalRecapFailure.drain;
 const drained=snapshot();
 assert.equal(drained.pendingRequiredJobs,0,'Migration077 required jobs must actually finish');
 assert.ok(drained.finalRecapJobs.length>0);
 assert.ok(drained.finalRecapJobs.every(job=>job.status==='SUCCEEDED'));
 assert.equal(drained.publishedSnapshots,1,'FinalRecap processing cannot publish');
 assert.equal(drained.competitiveFingerprint,before.competitiveFingerprint);
 assert.equal(drained.financialFingerprint,before.financialFingerprint);
 evidence.completedFinalRecap=drained;
 evidence.publicFinalRecapDto=assertNoPrivateResourceProvenance(drained.currentFinalRecap.map(row=>row.result_payload),'FinalRecap');
 record('AUTOMATIC_FINAL_RECAP_COMPLETED',{jobs:drained.finalRecapJobs.map(job=>({tournamentId:job.tournament_id,
  roundNumber:job.round_number,engineKey:job.engine_key})),pendingRequiredJobs:0});

 if(exerciseAbort){
  evidence.publishedAbort=runtime.transition('ABORT',payload);
  assert.equal(evidence.publishedAbort.result.pointerChanged,false);
  assert.equal(runtime.current().tournament_id,target);
  assert.equal(runtime.transitionStatus(evidence.publishedAbort.input).status,'COMMITTED');
  assert.equal(runtime.transition('ABORT',evidence.publishedAbort.input.payload,
   evidence.publishedAbort.input.operation_request_id).result.idempotent,true);
  const afterAbort=snapshot();
  assert.equal(afterAbort.publishedSnapshots,1,'Abort cannot retract explicit owner publication');
  assert.deepEqual(afterAbort.currentPublication,drained.currentPublication);
  assert.equal(afterAbort.competitiveFingerprint,drained.competitiveFingerprint);
  assert.equal(afterAbort.financialFingerprint,drained.financialFingerprint);
  prepared=prepare();payload=transitionPayload(prepared);evidence.repreparedAfterPublication=prepared;
  record('ABORT_AFTER_PUBLICATION_REPREPARE',{publicationPreserved:true,pointerChanged:false});
 }

 if(target==='2026'){
  assert.equal(drained.unresolvedIngress,1,'Retain the deliberate UNKNOWN until authoritative resolution');
  const unresolved=runtime.ingressScenarios.unresolved;
  evidence.unknownResolution=fixture.rpc('resolve_certification_ingress_v1',unresolved.input);
  assert.equal(evidence.unknownResolution.state,'NOT_COMMITTED');
  assert.equal(fixture.rpc('read_certification_ingress_status_v1',unresolved.input).state,'NOT_COMMITTED');
  const late=fixture.rpc('execute_certification_operation_v1',{...unresolved.input,
   ingress:{lease_id:unresolved.leaseId,admission_generation_id:unresolved.admissionGenerationId}});
  assert.equal(late.ok,false);assert.equal(late.code,'CERTIFICATION_INGRESS_NOT_COMMITTED');
 }
 assert.equal(snapshot().unresolvedIngress,0);
 record('UNKNOWN_AUTHORITATIVELY_RESOLVED',{unresolvedIngress:0});

 const closeAndDrain=()=>{
  const closeStarted=performance.now();
  const close=runtime.transition('CLOSE',closePayload());
  const closeElapsedMs=performance.now()-closeStarted;
  assert.equal(close.result.predecessorAdmissionStopped,true);
  assert.equal(runtime.transitionStatus(close.input).status,'COMMITTED');
  assert.equal(runtime.transition('CLOSE',close.input.payload,close.input.operation_request_id).result.idempotent,true);
  const drainStarted=performance.now(),drain=runtime.transition('DRAIN',payload);
  const drainElapsedMs=performance.now()-drainStarted;
  assert.equal(drain.result.predecessorClosed,true);
  assert.equal(runtime.transitionStatus(drain.input).status,'COMMITTED');
  assert.equal(runtime.transition('DRAIN',drain.input.payload,drain.input.operation_request_id).result.idempotent,true);
  assert.equal(snapshot().publishedSnapshots,1,'CLOSE and DRAIN cannot publish');
  const closure=JSON.parse(fixture.q(`select to_jsonb(c)from production_control.scoring_admission_closures c where closure_id=(${jsonLiteral(close.result.closureId)}#>>'{}')::uuid`));
  assert.equal(closure.resource_class,'CERTIFICATION');assert.equal(closure.boundary_mode,'CERTIFICATION_INGRESS_V1');
  assert.match(closure.lease_set_fingerprint,/^[0-9a-f]{64}$/);assert.equal(closure.status,'CLOSED');
  assert.equal(closure.external_fence_evidence_id,null);assert.equal(closure.google_writer_provider_fence_id,null);
  assert.equal(closure.google_writer_provider_verification_id,null);
  record('ANNUAL_CLOSE_DRAIN_CERTIFIED',{closureId:closure.closure_id,watermark:closure.lease_high_watermark,leaseFingerprint:closure.lease_set_fingerprint});
  return{close,drain,closeElapsedMs,drainElapsedMs,closure};
 };
 Object.assign(evidence,closeAndDrain());
 assert.ok(Number(evidence.closure.lease_high_watermark)>0,'Actual first nonempty admission history required');
 if(terminalClosed){
  assert.ok(proveRelease);
  evidence.terminalClosedRelease=await proveRelease(fixture,{label:target+'_TERMINAL_CLOSED',
   expectedGenerationState:'CLOSED',leaveDisabled:true});
  assert.equal(runtime.current().tournament_id,target);
  assert.equal(fixture.q('select enabled from production_control.certification_admission_v1'),'f');
  assert.equal(fixture.q(`select state from scoring_authority.ingress_gates where tournament_id=${jsonLiteral(target)}#>>'{}'`),'PAUSED');
  evidence.terminalState=snapshot();
  assert.equal(evidence.terminalState.holes,432);assert.equal(evidence.terminalState.finals,24);
  assert.equal(evidence.terminalState.pendingRequiredJobs,0);assert.equal(evidence.terminalState.unresolvedIngress,0);
  assert.equal(evidence.terminalState.googleJobs,0);assert.equal(evidence.terminalState.publishedSnapshots,1);
  assert.equal(evidence.terminalState.competitiveFingerprint,before.competitiveFingerprint);
  assert.equal(evidence.terminalState.financialFingerprint,before.financialFingerprint);
  evidence.terminalClosed=true;
  record('TERMINAL_CLOSED_RELEASE_COMMITTED_ADMISSION_DISABLED',{continuationClaim:false});
  return evidence;
 }
 if(proveRelease){
  evidence.closedRelease=await proveRelease(fixture,{label:target+'_CLOSED_COMMITTED',
   expectedGenerationState:'CLOSED'});
 }
 if(exerciseAbort){
  const closedGeneration=evidence.closure.admission_generation_id;
  const closedEpoch=evidence.closure.authority_generation_id;
  evidence.closedAbortBoundary={close:evidence.close,drain:evidence.drain,closure:evidence.closure};
  const closedGenerationRow=JSON.parse(fixture.q(`select to_jsonb(g)from production_control.certification_ingress_generations_v1 g
   where generation_id=(${jsonLiteral(closedGeneration)}#>>'{}')::uuid`));
  assert.equal(closedGenerationRow.state,'CLOSED');
  const abortPayload={...payload,expected_certification_admission_generation_id:closedGenerationRow.generation_id,
   expected_certification_admission_revision:closedGenerationRow.revision};
  if(target!=='2026'){
   const annual=JSON.parse(fixture.q(`select to_jsonb(a)from production_control.annual_scoring_runtime_authorities_v1 a
    where tournament_id=${jsonLiteral(target)}#>>'{}'`));
   Object.assign(abortPayload,{expected_predecessor_runtime_generation_id:annual.runtime_generation_id,
    expected_predecessor_annual_authority_generation_id:annual.authority_generation_id,
    expected_predecessor_annual_admission_generation_id:annual.admission_generation_id,
    expected_predecessor_annual_admission_revision:annual.admission_revision});
  }
  evidence.closedAbort=runtime.transition('ABORT',abortPayload);
  assert.equal(evidence.closedAbort.result.pointerChanged,false);
  assert.equal(runtime.transitionStatus(evidence.closedAbort.input).status,'COMMITTED');
  assert.equal(runtime.transition('ABORT',abortPayload,evidence.closedAbort.input.operation_request_id).result.idempotent,true);
  assert.equal(runtime.current().tournament_id,target);assert.equal(runtime.current().pointer_revision,pointer.pointer_revision);
  const reopened=JSON.parse(fixture.q(`select to_jsonb(g)from production_control.certification_ingress_generations_v1 g
   where g.tournament_id=${jsonLiteral(target)}#>>'{}' and g.state='OPEN'`));
  assert.ok(reopened);assert.notEqual(reopened.generation_id,closedGeneration);
  assert.equal(reopened.predecessor_generation_id,closedGeneration);assert.equal(reopened.authority_epoch_id,closedEpoch);
  assert.equal(fixture.q(`select state from production_control.certification_ingress_generations_v1
   where generation_id=(${jsonLiteral(closedGeneration)}#>>'{}')::uuid`),'CLOSED');
  assert.equal(fixture.q(`select status from production_control.scoring_admission_closures
   where closure_id=(${jsonLiteral(evidence.closure.closure_id)}#>>'{}')::uuid`),'REOPENED');
  const reopenedState=snapshot();
  assert.deepEqual(reopenedState.currentPublication,drained.currentPublication);
  assert.equal(reopenedState.competitiveFingerprint,drained.competitiveFingerprint);
  assert.equal(reopenedState.financialFingerprint,drained.financialFingerprint);
  evidence.reopenedGeneration=reopened;
  assert.deepEqual(annualRoot(),immutableAnnualRoot,'ABORT cannot rewrite the annual activation origin');
  if(proveRelease)evidence.reopenedRelease=await proveRelease(fixture,{label:target+'_ABORT_REOPENED_OPEN',
   expectedGenerationState:'OPEN',historicalGenerationId:closedGeneration});
  prepared=prepare();payload=transitionPayload(prepared);evidence.repreparedAfterClosedAbort=prepared;
  Object.assign(evidence,closeAndDrain());
  assert.deepEqual(annualRoot(),immutableAnnualRoot,'Re-CLOSE cannot replace the annual activation origin');
  if(immutableAnnualRoot){
   assert.equal(evidence.closure.prior_certification_closure_id,evidence.closedAbortBoundary.closure.closure_id);
   assert.notEqual(evidence.closure.prior_certification_closure_id,immutableAnnualRoot.predecessor_closure_id);
   evidence.immutableAnnualRoot=immutableAnnualRoot;
   evidence.reopenAncestry=proveReopenedAnnualAncestry(fixture,runtime,{target,payload,closure:evidence.closure,
    closedGeneration:reopened.generation_id,annualRoot:immutableAnnualRoot});
  }
  // No additional competitive write is fabricated merely to populate the new
  // generation. The first genuine nonempty closure remains preserved above.
  record('CLOSED_ABORT_REOPEN_REPREPARE',{pointerUnchanged:true,epochUnchanged:true,
   historicalGenerationClosed:true,newGeneration:reopened.generation_id,
   secondClosureWatermark:evidence.closure.lease_high_watermark});
 }

 const activateStarted=performance.now();
 if(concurrentActivation){
  const input=runtime.transitionRequest('ACTIVATE',payload),sessions=[openSqlSession(fixture.cluster,fixture.database),openSqlSession(fixture.cluster,fixture.database)];
  let results;
  try{results=await Promise.allSettled(sessions.map(s=>s.query(`set role service_role;select public.mutate_certification_annual_transition_v1(${jsonLiteral(input)})`)));}
  finally{await Promise.all(sessions.map(s=>s.close()));}
  const successes=results.filter(r=>r.status==='fulfilled').map(r=>JSON.parse(r.value));
  const conflicts=results.filter(r=>r.status==='rejected').map(r=>r.reason.message);
  assert.ok(successes.length>=1);assert.ok(successes.every(r=>r.successorActivated));
  assert.ok(conflicts.every(message=>/CONTEXT_STALE|REVISION_CONFLICT|GENERATION_STALE|BINDING/.test(message)),JSON.stringify(conflicts));
  evidence.activate={input,result:successes[0]};evidence.activationConcurrency={callers:2,successes:successes.length,conflicts};
 }else evidence.activate=runtime.transition('ACTIVATE',payload);
 evidence.activateElapsedMs=performance.now()-activateStarted;
 evidence.timingMethod='Single local client/process-inclusive actual annual operation; ACTIVATE includes both callers when concurrent. No p95/p99 claim.';
 assert.equal(evidence.activate.result.successorActivated,true);
 assert.equal(runtime.current().tournament_id,successor);assert.equal(runtime.current().pointer_revision,pointer.pointer_revision+1);
 assert.equal(runtime.transitionStatus(evidence.activate.input).status,'COMMITTED','Lost activation acknowledgement must resolve at the new pointer');
 assert.equal(runtime.transition('ACTIVATE',payload,evidence.activate.input.operation_request_id).result.idempotent,true);
 assert.equal(runtime.current().pointer_revision,pointer.pointer_revision+1,'Replay cannot advance pointer again');
 const successorIngress=JSON.parse(fixture.q(`select jsonb_build_object('boundary',boundary_mode,
  'legacyProtocolEnforced',admission_protocol_enforced,'legacyEnforcedAt',admission_enforced_at,
  'legacyDeployment',admission_deployment_id,'legacyFingerprint',legacy_lease_set_fingerprint)
  from scoring_authority.ingress_gates where tournament_id=${jsonLiteral(successor)}#>>'{}'`));
 assert.deepEqual(successorIngress,{boundary:'CERTIFICATION_INGRESS_V1',legacyProtocolEnforced:false,
  legacyEnforcedAt:null,legacyDeployment:null,legacyFingerprint:null});
 assert.throws(()=>fixture.q(`set role service_role;select production_control.install_certification_annual_successor_v1(
  (${jsonLiteral(payload.transition_id)}#>>'{}')::uuid,'{}'::jsonb)`,'service_role'),/permission denied/);
 evidence.successorIngress={...successorIngress,privateInstallerDenied:true};
 if(proveRelease){
  evidence.transitionedRelease=await proveRelease(fixture,{label:target+'_TO_'+successor+'_TRANSITIONED_OPEN',
   expectedGenerationState:'OPEN'});
 }
 const after=snapshot();
 assert.equal(after.competitiveFingerprint,before.competitiveFingerprint);
 assert.equal(after.financialFingerprint,before.financialFingerprint);
 assert.equal(after.publishedSnapshots,1,'Annual ACTIVATE cannot publish');
 assert.equal(after.unresolvedIngress,0);assert.equal(after.googleJobs,0);
 const next=certificationAnnualObservations(fixture,successor).state();
 assert.equal(next.publishedSnapshots,0,'Successor cannot inherit predecessor publication');assert.equal(next.finalRecapEligible,false);
 evidence.successor=next;
 const beforeAdapterReplacement=observation.applicationState();
 // Recreate the application adapters against the existing database. This is
 // an adapter/process replacement model, not a deployment or bootstrap replay.
 const oddsRecovery=await certificationOddsStack(fixture,{tournamentId:successor});
 const oddsStatus={action:'status',originalAction:'publish',operationRequestId:evidence.odds.publicationOperationId,
  operationTournamentId:target};
 const recoveredPublication=await oddsRecovery.client(oddsStatus);
 assert.equal(recoveredPublication.state,'COMMITTED');
 assert.equal(recoveredPublication.receipt.snapshotId,evidence.odds.publication.snapshotId);
 await assert.rejects(()=>oddsRecovery.client({...oddsStatus,operationTournamentId:'2099'}),
  error=>/DENIED|RECOVERY|AUTHORIZATION|ENTITLEMENT/.test(error.code));
 oddsRecovery.setAuthorization({...oddsRecovery.authorization,identity:{...oddsRecovery.authorization.identity,
  authUserId:'b3000000-0000-4000-8000-999999999999'}});
 await assert.rejects(()=>oddsRecovery.client(oddsStatus),
  error=>/DENIED|RECOVERY|AUTHORIZATION|ENTITLEMENT/.test(error.code));
 evidence.predecessorPublicationRecovery={state:recoveredPublication.state,
  sameSnapshot:true,actualDirectorClient:true,wrongActorDenied:true,unauthorizedTargetDenied:true};
 const priorScore=runtime.receipts.find(receipt=>receipt.input.operation_id==='SCORING.SUBMIT_HOLE'
  &&receipt.input.authorization.tournament_id===target);
 assert.ok(priorScore);
 const originalScoreEnvelope=JSON.stringify(priorScore.input);
 if(priorScore.input.deployment.deployment_id!==fixture.deployment.deployment_id){
  assert.throws(()=>fixture.rpc('read_certification_ingress_status_v1',priorScore.input),/CERTIFICATION_INGRESS_RESOURCE_DENIED/);
 }
 // The currently admitted server transport performs recovery. Immutable actor,
 // operation and original target remain exactly those of the retained request.
 const recoveryRequest={...priorScore.input,deployment:{...fixture.deployment}};
 const historicalStatus=fixture.rpc('read_certification_ingress_status_v1',recoveryRequest);
 assert.equal(JSON.stringify(priorScore.input),originalScoreEnvelope,'Historical request provenance is immutable');
 assert.equal(historicalStatus.state,'COMMITTED','Predecessor committed outcome remains recoverable after annual advance');
 const staleIdentity=priorScore.input.operation_request_id+':after-annual';
 evidence.oldGenerationWrite=denied(()=>fixture.rpc('admit_certification_operation_v1',{
  ...recoveryRequest,operation_request_id:staleIdentity,payload:{...priorScore.input.payload,mutation_key:staleIdentity}}),
 /CONTEXT_STALE|TARGET_DENIED|GENERATION_STALE|AUTHORIZATION|IDENTITY|BINDING|MATCH_DENIED/);
 evidence.predecessorRecovery={state:historicalStatus.state,leaseId:historicalStatus.lease_id};
 const readPayload={surface:'LEADERBOARDS',target_tournament_id:successor};
 const currentRead=fixture.rpc('read_certification_projection_v1',{
  ...fixture.envelope,phase:'READS',operation:'READS.CURRENT_VIEW',
  expected_context_token:fixture.context('READS').context_token,payload:readPayload});
 assert.equal(currentRead.ok,true,'New current reads must resolve the successor');
 evidence.successorCurrentRead={ok:currentRead.ok,authoritative:currentRead.authoritative,fallbackUsed:currentRead.fallback_used};
 evidence.publicLeaderboardsDto=assertNoPrivateResourceProvenance(currentRead.data,'Leaderboards');
 const history=fixture.rpc('read_certification_projection_v1',{
  ...fixture.envelope,phase:'READS',operation:'READS.CLOSED_TOURNAMENT',
  expected_context_token:fixture.context('READS').context_token,payload:{target_tournament_id:target}});
 assert.equal(history.ok,true);assert.equal(history.data.finalized_snapshots.length,24);
 assert.ok(history.data.finalized_snapshots.every(row=>row.tournament_id===target));
 evidence.predecessorHistory={neverAgainId:'NA-2026-CERTIFICATION-CLOSED-HISTORY',
  ok:true,finalizedScorecards:24,fallbackUsed:history.fallback_used};
 evidence.publicHistoryDto=assertNoPrivateResourceProvenance(history.data,'History');
 const readTransport=certificationWorkerTransport(fixture);
 const historyAdapter=await certificationReadAliasRpc('read_canonical_closed_tournament_view',
  {target_tournament_id:target},{env:readTransport.env,certificationDependencies:readTransport.dependencies});
 assert.equal(historyAdapter.payload.ok,true);
 assert.deepEqual(historyAdapter.payload.data.finalized_snapshots,history.data.finalized_snapshots);
 evidence.predecessorHistory.adapter='ACTUAL_JS_THROUGH_CANONICAL_RPC';
 if(target==='2026'){
  assert.throws(()=>fixture.rpc('read_certification_projection_v1',{
   ...fixture.envelope,phase:'READS',operation:'READS.CURRENT_VIEW',
   expected_context_token:fixture.context('READS').context_token,payload:{surface:'HISTORY_2026',target_tournament_id:target}}),
   /CERTIFICATION_READ_TARGET_DENIED/);
  assert.deepEqual(fixed2026Finalized,history.data.finalized_snapshots);
  evidence.frozen2026HistoryCompatibility='PASS';
  evidence.staleCurrentHistoryRouteDenied=true;
 }
 evidence.successorReadContracts=await proveCertificationSuccessorReads(fixture,runtime,{predecessor:target});
 const afterAdapterReplacement=observation.applicationState();
 assert.deepEqual(afterAdapterReplacement,beforeAdapterReplacement);
 evidence.applicationReplacement={status:'PASS',model:'Fresh JS adapters, authorization module and canonical readbacks against retained database',
  before:beforeAdapterReplacement,after:afterAdapterReplacement,
  fullApplicationRestart:'NOT PROVEN',bootstrapReplay:'NOT PROVEN',hostedRedeploy:'NOT PROVEN'};
 record('ANNUAL_ACTIVATED_EXACTLY_ONCE',{currentTournament:successor,pointerRevision:runtime.current().pointer_revision});
 return evidence;
}
