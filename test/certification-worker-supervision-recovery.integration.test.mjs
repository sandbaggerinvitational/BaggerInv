import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {createSupervisorFixture} from './support/reliability/certification-supervisor-fixture.mjs';
import {destroyIsolatedCluster,sqlFile,jsonLiteral,repositoryRoot,sqlResult} from './support/reliability/postgres17.mjs';
import {supervisorEnvelope,handleSupervisorRequest,SUPERVISOR_PATH,createSupervisorTransport} from '../lib/certification-worker-supervision.js';
import {createCertificationWorkerDemand} from '../tools/reliability/certification-worker-demand.mjs';
import {certificationOperationRpc} from '../lib/certification-runtime-server.js';

test('private supervision durable fault/retry/recovery contracts',async t=>{
 let f;const evidence={environment:'OWNED_SOCKET_ONLY_POSTGRESQL17',hosted:false,cases:[]};
 const check=async(name,fn)=>{let error;await t.test(name,async()=>{try{await fn();evidence.cases.push({name,result:'PASS'});}catch(e){error=e;throw e;}});if(error)throw error;};
 try{
  f=await createSupervisorFixture();sqlFile(f.cluster,f.database,repositoryRoot+'/supabase/production_incremental/certification-worker-supervision-v1.sql',{role:''});
  const options={env:f.env,dependencies:f.dependencies},bound=supervisorEnvelope(f.env,f.dependencies);
  const owner=(fn,input={})=>fn==='reserve'?JSON.parse(f.q('select production_control.worker_supervisor_reserve_v1()')):f.owner('worker_supervisor_'+fn+'_v1',{...bound,...input});
  const status=()=>owner('status'),stop=()=>owner('control',{action:'STOP',request_id:randomUUID(),expected_revision:status().revision});
  owner('configure',{signing_secret_id:f.keyId});
  const start=(slots=1,action='START')=>{
   const expected=JSON.parse(f.q(`select production_control.worker_supervisor_binding_v1(${jsonLiteral(bound)})`));delete expected.resource;delete expected.deployment;
   return owner('control',{action,request_id:randomUUID(),expected_revision:status().revision,expected_context:expected,
    expires_at:new Date(Date.now()+600000).toISOString(),budget:20,slots,...(action==='RESUME'?{reconciliation_reason:'Owned local cause corrected and canonical claims settled'}:{})});
  };
  const request=ticket=>new Request(f.deployment.deployment_origin+SUPERVISOR_PATH,{method:'POST',headers:{'content-type':'application/json','x-bagger-worker-signature':ticket.signature},body:ticket.body});
  const invoke=async(ticket,overrides={})=>{const response=await handleSupervisorRequest(request(ticket),{...options,...overrides});const value=await response.json();
   assert.equal(response.status,200,JSON.stringify(value));return value;};
  const job=engine=>JSON.parse(f.q(`select to_jsonb(j)from scoring_authority.competition_recalculation_jobs j where engine_key='${engine}'`));
  const arm=(fault,engine='TEAM_MOMENTUM')=>{
   const j=job(engine),event=Number(f.q("select event_id from production_control.operation_audit_events where event_type='CERTIFICATION_PART2A_FIXTURE_BOOTSTRAPPED'"));
   return owner('fault_control',{action:'ARM',expected_revision:status().revision,fault,engine_key:engine,cycle:j.delivery_cycle,
    source_revision:j.requested_source_revision,fixture_event_id:event,expires_at:new Date(Date.now()+600000).toISOString()});
  };
  await check('supported fixed synthetic producer creates real new source cycles while leaving all four jobs for autonomous discovery',async()=>{
   f.toggle(true);const before=f.calls.filter(c=>c.operation?.startsWith('WORKERS.')).length;
   await createCertificationWorkerDemand(options);
   assert.equal(status().counts.pending_work,4);assert.equal(f.calls.filter(c=>c.operation?.startsWith('WORKERS.')).length,before);
   assert.equal(f.q("select status from scoring_authority.matches where match_id='2026-R3-11'"),'UPCOMING');
   assert.equal(f.q('select count(*)from scoring_authority.scoring_permissions where can_score'),'0');f.toggle(false);
  });
  await check('one-use transient claim fault follows normal durable retry/backoff without attempt reset',async()=>{
   arm('TRANSIENT');f.toggle(true);start();const ticket=owner('reserve');assert.equal(ticket.dispatched,true);
   const control=createSupervisorTransport(options);let wrongEngineChecked=false;
   const result=await invoke(ticket,{control:async(operation,payload)=>{
    if(operation==='FAULT'&&payload.fault_operation==='WORKERS.COMPETITION_WRITE'&&payload.payload.engine_key==='TEAM_MOMENTUM'){
     const wrong=await control(operation,{...payload,payload:{...payload.payload,engine_key:'TOURNAMENT_STORYLINES'}});
     assert.equal(wrong.fault,null);wrongEngineChecked=true;
    }
    return control(operation,payload);
   }});assert.equal(wrongEngineChecked,true);assert.equal(result.outcome,'JOB_RETRY',f.q(`select jsonb_build_object('plan',
    (select jsonb_agg(jsonb_build_object('epoch',epoch,'cycle',cycle,'source',source_revision,'consumed',consumed_at,'digest',binding_digest))from production_control.worker_supervisor_faults_v1),
    'supervisor',(select jsonb_build_object('epoch',epoch,'digest',binding_digest)from production_control.worker_supervisor_v1),
    'job',(select jsonb_build_object('cycle',delivery_cycle,'source',requested_source_revision,'owner',claimed_by,'status',status)from scoring_authority.competition_recalculation_jobs where engine_key='TEAM_MOMENTUM'))`));
   const j=job('TEAM_MOMENTUM');assert.equal(j.delivery_attempts,1);assert.equal(j.delivery_error_class,'RETRYABLE');
   assert.ok(Number(f.q("select extract(epoch from delivery_available_at-updated_at)from scoring_authority.competition_recalculation_jobs where engine_key='TEAM_MOMENTUM'"))>=2);assert.equal(j.delivery_dead_letter_at,null);
   const before=j.delivery_attempts;assert.equal(owner('reserve').dispatched,false);assert.equal(job('TEAM_MOMENTUM').delivery_attempts,before);
   stop();assert.equal(job('TEAM_MOMENTUM').delivery_attempts,before);
  });
  await check('fresh server invocation after real backoff succeeds; durable job attempt history persists',async()=>{
   await new Promise(resolve=>setTimeout(resolve,6200));start();await invoke(owner('reserve'));
   assert.equal(job('TEAM_MOMENTUM').status,'SUCCEEDED');assert.equal(job('TEAM_MOMENTUM').delivery_attempts,2);
   assert.equal(status().counts.pending_work,0);stop();f.toggle(false);
  });
  await check('Intelligence fault binds the real bundle engine and claim timestamp; normal durable retry drains the bundle',async()=>{
   f.toggle(true);await createCertificationWorkerDemand(options);f.toggle(false);arm('TRANSIENT','TOURNAMENT_INTELLIGENCE');
   f.toggle(true);start();assert.equal((await invoke(owner('reserve'))).outcome,'JOB_RETRY');
   assert.equal(job('TEAM_MOMENTUM').status,'SUCCEEDED');assert.equal(job('TOURNAMENT_STORYLINES').status,'SUCCEEDED');
   for(const engine of ['TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL']){
    assert.equal(job(engine).status,'PENDING');assert.equal(job(engine).delivery_attempts,1);assert.equal(job(engine).delivery_error_class,'RETRYABLE');
   }
   assert.equal(f.q("select count(*)from production_control.worker_supervisor_faults_v1 where fault='TRANSIENT'and engine_key='TOURNAMENT_INTELLIGENCE'and consumed_at is not null"),'1');
   stop();await new Promise(resolve=>setTimeout(resolve,6200));start();await invoke(owner('reserve'));
   for(const engine of ['TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL']){
    assert.equal(job(engine).status,'SUCCEEDED');assert.equal(job(engine).delivery_attempts,2);
   }
   assert.equal(status().counts.pending_work,0);stop();f.toggle(false);
  });
  await check('lost completion acknowledgement preserves actual committed output, current truth and no duplicate result',async()=>{
   f.toggle(true);await createCertificationWorkerDemand(options);f.toggle(false);arm('LOST_ACK');f.toggle(true);start();
   const ticket=owner('reserve'),result=await invoke(ticket);assert.ok(['JOB_RETRY','SUCCEEDED'].includes(result.outcome));
   assert.equal(job('TEAM_MOMENTUM').status,'SUCCEEDED');
   assert.equal(f.q("select count(*)from production_control.worker_supervisor_faults_v1 where fault='LOST_ACK'and consumed_at is not null"),'1');
   evidence.lostAck={canonicalOutcome:'SUCCEEDED',callerOutcome:result.outcome};stop();
   await new Promise(resolve=>setTimeout(resolve,6200));start();await invoke(owner('reserve'));stop();f.toggle(false);
  });
  await check('terminal fault records real dead letter and HALTED; existing Director cause-corrected requeue retains evidence',async()=>{
   f.toggle(true);await createCertificationWorkerDemand(options);f.toggle(false);arm('TERMINAL');f.toggle(true);start();
   const result=await invoke(owner('reserve'));assert.equal(result.outcome,'TERMINAL');assert.equal(status().state,'HALTED');
   const j=job('TEAM_MOMENTUM');assert.ok(j.delivery_dead_letter_at);assert.equal(j.delivery_error_class,'TERMINAL');
   assert.equal(owner('reserve').dispatched,false);
   const events=Number(f.q('select count(*)from production_control.score_derived_delivery_attempts_v1'));
   for(const engine of ['TEAM_MOMENTUM','TOURNAMENT_STORYLINES']){
    const row=job(engine);if(!row.delivery_dead_letter_at)continue;
    const requestId=randomUUID();const result=await certificationOperationRpc('DIRECTOR.REQUEUE_DERIVED',{contract_version:'score-derived-delivery-v1',tournament_id:'2026',family:'COMPETITION',
     work_identity:'2026:0:'+engine,request_id:requestId,expected_cycle:row.delivery_cycle,expected_attempt:row.delivery_attempts,
     reason:'Consumed Certification-only terminal fault corrected'}, {env:f.env,authorization:f.authorization,operationRequestId:requestId},f.dependencies);
    assert.equal(result.payload.ok,true);assert.equal(job(engine).delivery_cycle,row.delivery_cycle+1);
   }
   assert.ok(Number(f.q('select count(*)from production_control.score_derived_delivery_attempts_v1'))>events);
   assert.equal(status().counts.dead_letters,0);start(1,'RESUME');await invoke(owner('reserve'));stop();f.toggle(false);
  });
  await check('two-slot Certification contention uses canonical claim CAS with no duplicate current result',async()=>{
   f.toggle(true);await createCertificationWorkerDemand(options);f.toggle(false);arm('CONTENTION');f.toggle(true);start(2);
   const a=owner('reserve'),b=owner('reserve');assert.equal(a.dispatched,true);assert.equal(b.dispatched,true);assert.equal(owner('reserve').dispatched,false);
   const result=await Promise.all([invoke(a),invoke(b)]);assert.ok(result.every(r=>r.outcome==='SUCCEEDED'));
   assert.equal(status().counts.pending_work,0);assert.equal(status().counts.active_claims,0);
   for(const e of ['TEAM_MOMENTUM','TOURNAMENT_STORYLINES','TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL'])assert.equal(job(e).delivery_attempts,1,e);
   stop();f.toggle(false);
  });
  await check('durable global transient failures accumulate across processes; third unsuccessful invocation HALTS without restarting',async()=>{
   f.toggle(true);start();const control=createSupervisorTransport(options);
   const badFactory=async()=>({tick:async()=>{throw Object.assign(new Error('Injected global transport timeout'),{code:'ECONNRESET'});},
    processors:{CALCUTTA:async()=>({ok:true}),COMPETITION:async()=>({ok:true}),INTELLIGENCE:async()=>({ok:true})}});
   for(let index=1;index<=3;index++){
    // Real scheduler cadence, no counter/time rewrites. Separate control ACKs
    // retain the failure state across new handler/worker objects.
    if(index>1)await new Promise(resolve=>setTimeout(resolve,60100));
    const ticket=owner('reserve');assert.equal(ticket.dispatched,true);const result=await invoke(ticket,{adapterFactory:badFactory});
    assert.equal(result.outcome,'FAILED');assert.equal(status().consecutive_global_failures,index);
   }
   assert.equal(status().state,'HALTED');assert.equal(owner('reserve').dispatched,false);evidence.globalFailurePolicy='THREE_FAILED_INVOCATIONS_HALT_BEFORE_FIVE_TICK_CEILING';
   assert.equal(status().counts.pending_work,0);stop();f.toggle(false);
  });
  await check('STOP is durable across independent status/dispatch calls and preserves canonical outcomes',async()=>{
   assert.equal(status().state,'OFF');assert.equal(owner('reserve').dispatched,false);
   assert.equal(status().counts.active_claims,0);assert.equal(status().counts.active_leases,0);
   assert.equal(status().counts.dead_letters,0);assert.equal(f.q("select production_control.derived_final_recap_ready_v1('2026')"),'f');
   assert.equal(f.q('select count(*)from scoring_authority.odds_published_snapshots'),'0');
  });
 }finally{
  if(f)await destroyIsolatedCluster(f.cluster);
  await mkdir('docs/reliability/phase2d-worker-supervision/evidence',{recursive:true});
  await writeFile('docs/reliability/phase2d-worker-supervision/evidence/recovery.json',JSON.stringify(evidence,null,2)+'\n');
 }
});
