// Real canonical Odds requests, claims, calculation and explicit owner
// publication around the owner release fence. No job adoption/cancellation.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {jsonLiteral,openSqlSession} from './postgres17.mjs';
import {certificationOddsStack} from './certification-odds-proof.mjs';
import {certificationReleaseInput,certificationReleasePreservedSql} from './certification-release-proof.mjs';

function observedClient(stack){return async(...args)=>{
 try{return await stack.client(...args);}catch(error){
  const failed=stack.calls.findLast(call=>call.error);
  error.releaseOddsEvidence=failed?{rpc:failed.name,sqlstate:failed.error.sqlstate||null,
   message:failed.error.message||null,context:typeof failed.error.detail==='string'?failed.error.detail.split('\n')
    .filter(line=>/^(?:CONTEXT:.*PL\/pgSQL function|PL\/pgSQL function)/.test(line)).slice(0,8):null}:null;
  throw error;
 }
};}

export async function proveCertificationReleaseOddsDrain(f,{run,advanceCanonicalSource}){
 const stack=await certificationOddsStack(f),rpc=input=>f.rpc('dispatch_certification_odds_v1',input);
 const client=observedClient(stack);
 const workerCommand=(operation,payload)=>({...f.envelope,phase:'WORKERS',operation_id:'ODDS.'+operation,
  operation_request_id:randomUUID(),expected_context_token:f.context('WORKERS').context_token,payload:{odds_operation:operation,...payload}});
 const disable=()=>f.owner('set_certification_admission_v1',{resource_id:f.resource.resource_id,
  expected_admission_revision:Number(f.q('select admission_revision from production_control.certification_admission_v1')),
  enabled:false,reason:'Synthetic outgoing Odds drain proof'});
 const resume=()=>f.owner('set_certification_admission_v1',{resource_id:f.resource.resource_id,
  expected_admission_revision:Number(f.q('select admission_revision from production_control.certification_admission_v1')),
  enabled:true,reason:'Resume same release for lawful Odds completion'});
 const jobState=id=>JSON.parse(f.q(`select jsonb_build_object('status',status,'publication',publication_status)
  from scoring_authority.odds_calculation_jobs where job_id='${id}'`));
 const assertBlocked=async(status,publication,jobId)=>{
  assert.deepEqual(jobState(jobId),{status,publication});disable();
  const {input}=certificationReleaseInput(f,'blocked-'+status);
  const before=f.q(certificationReleasePreservedSql),admission=f.q('select to_jsonb(a)from production_control.certification_admission_v1 a');
  try{
   assert.throws(()=>f.owner('rebind_certification_release_v1',input),/CERTIFICATION_RELEASE_ODDS_DRAIN_REQUIRED/);
   assert.equal(f.q(certificationReleasePreservedSql),before);
   assert.equal(f.q('select to_jsonb(a)from production_control.certification_admission_v1 a'),admission);
   assert.equal(f.q(`select count(*)from production_control.operation_audit_events
    where event_type='CERTIFICATION_RELEASE_REBOUND'and details->>'operation_request_id'='${input.operation_request_id}'`),'0');
   await assert.rejects(stack.worker(jobId),/Canonical|Certification|resource|unavailable/i);
  }finally{resume();}
  return{status,publication,denial:'CERTIFICATION_RELEASE_ODDS_DRAIN_REQUIRED',authorityAndJobsUnchanged:true};
 };
 const current=await client(),request={action:'calculate',operationRequestId:randomUUID(),
  expectedContextToken:current.context.token,phase:'Pre-Tournament',iterations:10000};
 const requested=await client(request);assert.equal(requested.accepted,true);assert.equal(requested.publicationCreated,false);
 await run('outgoing PENDING Odds blocks release without mutating authority or jobs',()=>assertBlocked('PENDING','NOT_REQUESTED',requested.jobId));
 let claim;
 await run('actual in-flight worker fences owner release and leaves RUNNING work blocked',async()=>{
  const worker=openSqlSession(f.cluster,f.database),owner=openSqlSession(f.cluster,f.database);
  const command=workerCommand('claim_production_odds_calculation_job',{job_id:requested.jobId,worker_id:'release-fence-proof'});
  const {input,state}=certificationReleaseInput(f,'in-flight-worker');input.expected_admission_revision++;
  const disableInput={resource_id:f.resource.resource_id,expected_admission_revision:state.admission.admission_revision,
   enabled:false,reason:'Actual worker versus release fence'};
  try{
   await worker.query('begin;set local role service_role');
   claim=JSON.parse(await worker.query(`select public.dispatch_certification_odds_v1(${jsonLiteral(command)})`));assert.equal(claim.deliver,true);
   const pid=Number(await owner.query('select pg_backend_pid()'));let complete=false;
   const pending=owner.query(`begin;select production_control.set_certification_admission_v1(${jsonLiteral(disableInput)});
    select production_control.rebind_certification_release_v1(${jsonLiteral(input)})`).then(value=>({value}),error=>({error})).finally(()=>{complete=true;});
   for(let i=0;i<100;i++){if(Number(f.q(`select cardinality(pg_blocking_pids(${pid}))`)))break;await new Promise(r=>setTimeout(r,10));}
   assert.equal(complete,false);assert.equal(Number(f.q(`select cardinality(pg_blocking_pids(${pid}))`)),1);
   await worker.query('commit');const outcome=await pending;
   assert.match(outcome.error?.message||'',/CERTIFICATION_RELEASE_ODDS_DRAIN_REQUIRED/);
   try{await owner.query('rollback');}catch{} // ON_ERROR_STOP closes and rolls back the owned session.
   assert.deepEqual(JSON.parse(f.q('select to_jsonb(a)from production_control.certification_admission_v1 a')),state.admission);
  }finally{
   for(const session of[worker,owner]){try{await session.query('rollback');}catch{}}
   await Promise.all([worker.close(),owner.close()]);
  }
  return{realClaim:true,sharedFenceObserved:true,ownerChangeRolledBack:true};
 });
 await run('outgoing RUNNING Odds blocks release',()=>assertBlocked('RUNNING','NOT_REQUESTED',requested.jobId));
 // Inject an actual interrupted claimed worker through its existing failure
 // operation. This is a reliability fault, not a production cancellation path.
 const stopped=rpc(workerCommand('fail_production_odds_calculation_job',{job_id:requested.jobId,
  claim_token:claim.job.claim_token,retryable:true,error_code:'SYNTHETIC_RELEASE_WORKER_INTERRUPTION',
  error_safe:'Synthetic worker interrupted before calculation.'}));assert.equal(stopped.marked,true);
 await run('outgoing RETRYABLE Odds blocks release',()=>assertBlocked('RETRYABLE','NOT_REQUESTED',requested.jobId));
 const completed=await stack.worker(requested.jobId);assert.equal(completed.completed,true);
 await run('real completed READY Odds still blocks release until explicit owner publication',()=>assertBlocked('SUCCEEDED','READY',requested.jobId));
 const reviewed=await client(null,{jobId:requested.jobId});
 const publish={action:'publish',operationRequestId:randomUUID(),expectedContextToken:reviewed.context.token,jobId:requested.jobId,
  confirmPublication:true,expectedPublicationRevision:reviewed.publication.revision,expectedSnapshotId:reviewed.publication.snapshotId};
 const publication=await client(publish);assert.equal(publication.publicationCreated,true);
 assert.deepEqual(jobState(requested.jobId),{status:'SUCCEEDED',publication:'PUBLISHED'});
 let terminal,older,newer,newRequest,newPublish,newPublication;
 await run('real terminal failure and legitimate source supersession are retained without job adoption',async()=>{
  const view=await client();
  terminal=await client({action:'calculate',operationRequestId:randomUUID(),expectedContextToken:view.context.token,
   phase:'Pre-Tournament',iterations:50000});
  const claimed=rpc(workerCommand('claim_production_odds_calculation_job',{job_id:terminal.jobId,worker_id:'synthetic-fatal-fault'}));
  assert.equal(claimed.deliver,true);
  const failed=rpc(workerCommand('fail_production_odds_calculation_job',{job_id:terminal.jobId,claim_token:claimed.job.claim_token,
   retryable:false,error_code:'SYNTHETIC_TERMINAL_ENGINE_FAULT',error_safe:'Injected terminal worker failure, not cancellation.'}));
  assert.equal(failed.marked,true);assert.deepEqual(jobState(terminal.jobId),{status:'FAILED',publication:'NOT_REQUESTED'});
  const nextView=await client();
  older=await client({action:'calculate',operationRequestId:randomUUID(),expectedContextToken:nextView.context.token,
   phase:'Pre-Tournament',iterations:25000});
  const oldConfig=JSON.parse(f.q("select to_jsonb(c)from scoring_authority.odds_input_configurations c where tournament_id='2026'and is_current"));
  // A real supported score changes live calculation inputs. The existing claim
  // operation observes that change and performs its own lawful supersession;
  // no job, source configuration, readiness or history row is rewritten here.
  assert.equal(typeof advanceCanonicalSource,'function');
  const advanced=await advanceCanonicalSource();assert.equal(advanced.ok,true);
  const superseded=rpc(workerCommand('claim_production_odds_calculation_job',{job_id:older.jobId,worker_id:'actual-source-advance'}));
  assert.equal(superseded.code,'ODDS_CALCULATION_JOB_SUPERSEDED');
  // Restore the exact same10000 request after actual score advancement.150
  // must preserve a truthful full-source publication identity even when the
  // deterministic logical result is unchanged; original run7 remains evidence.
  const sourceView=await client();
  newRequest={action:'calculate',operationRequestId:randomUUID(),expectedContextToken:sourceView.context.token,
   phase:'Pre-Tournament',iterations:10000};newer=await client(newRequest);
  assert.deepEqual(jobState(older.jobId),{status:'SUPERSEDED',publication:'STALE'});
  assert.deepEqual(jobState(terminal.jobId),{status:'FAILED',publication:'NOT_REQUESTED'});
  const retained=JSON.parse(f.q(`select to_jsonb(c)from scoring_authority.odds_input_configurations c where id='${oldConfig.id}'`));
  assert.deepEqual(retained,oldConfig);
  const completed=await stack.worker(newer.jobId);assert.equal(completed.completed,true);
  const reviewed=await client(null,{jobId:newer.jobId});
  newPublish={action:'publish',operationRequestId:randomUUID(),expectedContextToken:reviewed.context.token,
   jobId:newer.jobId,confirmPublication:true,expectedPublicationRevision:reviewed.publication.revision,expectedSnapshotId:reviewed.publication.snapshotId};
  newPublication=await client(newPublish);assert.equal(newPublication.publicationCreated,true);
  return{terminalFailure:{jobId:terminal.jobId,...jobState(terminal.jobId)},superseded:{jobId:older.jobId,...jobState(older.jobId)},
   oldConfigurationPreserved:true,published:{jobId:newer.jobId,...jobState(newer.jobId)},actualCanonicalScoreAdvance:true};
 });
 const terminalHistory=f.q(`select jsonb_agg(to_jsonb(j)order by job_id)from scoring_authority.odds_calculation_jobs j
  where job_id in('${terminal.jobId}','${older.jobId}')`);
 return{stack,request:newRequest,publish:newPublish,requested:newer,publication:newPublication,workerCommand,
  terminalHistory,terminalIds:[terminal.jobId,older.jobId],
  priorPublishedReceipts:[{request,publish,requested,publication}],
  oldWorkerCommand:workerCommand('claim_production_odds_calculation_job',{job_id:requested.jobId,worker_id:'old-release-denial'}),
  preserved:f.q(certificationReleasePreservedSql)};
}

export async function proveCertificationOddsAfterRelease(f,prior,{run}){
 await run('new release recovers old calculation and publication receipts without adopting old jobs',async()=>{
  const fresh=await certificationOddsStack(f);
  for(const[originalAction,input]of[['calculate',prior.request],['publish',prior.publish]]){
   const recovered=await fresh.client({action:'status',originalAction,operationRequestId:input.operationRequestId});
   assert.equal(recovered.state,'COMMITTED');
   if(originalAction==='publish')assert.equal(recovered.receipt.snapshotId,prior.publication.snapshotId);
   else assert.equal(recovered.receipt.jobId,prior.requested.jobId);
  }
  const current=await fresh.client();assert.equal(current.publication.snapshotId,prior.publication.snapshotId);
  assert.equal(f.q(`select jsonb_agg(to_jsonb(j)order by job_id)from scoring_authority.odds_calculation_jobs j
   where job_id in('${prior.terminalIds[0]}','${prior.terminalIds[1]}')`),prior.terminalHistory);
  assert.throws(()=>f.rpc('dispatch_certification_odds_v1',{...prior.oldWorkerCommand,deployment:f.deployment,
   expected_context_token:f.context('WORKERS').context_token}),/CERTIFICATION_ODDS_JOB_SCOPE_DENIED/);
  const requested=await fresh.client({action:'calculate',operationRequestId:randomUUID(),expectedContextToken:current.context.token,
   phase:'Pre-Tournament',iterations:50000});assert.notEqual(requested.jobId,prior.requested.jobId);
  assert.equal(f.q(`select production_deployment_commit from scoring_authority.odds_calculation_jobs where job_id='${requested.jobId}'`),f.deployment.release_commit);
  assert.equal(f.q(`select production_deployment_commit from scoring_authority.odds_calculation_jobs where job_id='${prior.requested.jobId}'`),prior.oldWorkerCommand.deployment.release_commit);
  const completed=await fresh.worker(requested.jobId);assert.equal(completed.completed,true);
  const ready=await fresh.client(null,{jobId:requested.jobId});
  const published=await fresh.client({action:'publish',operationRequestId:randomUUID(),expectedContextToken:ready.context.token,
   jobId:requested.jobId,confirmPublication:true,expectedPublicationRevision:ready.publication.revision,expectedSnapshotId:ready.publication.snapshotId});
  assert.equal(published.publicationCreated,true);
  return{oldCalculationRecovery:true,oldPublicationRecovery:true,oldJobScopeDenied:true,
   publishedSnapshotPreserved:true,newJobRelease:f.deployment.release_commit,googleCalls:0};
 });
}
