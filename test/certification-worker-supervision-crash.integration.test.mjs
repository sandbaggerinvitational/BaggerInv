import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID}from'node:crypto';
import {spawn}from'node:child_process';
import {once}from'node:events';
import {mkdir,writeFile}from'node:fs/promises';
import {createSupervisorFixture}from'./support/reliability/certification-supervisor-fixture.mjs';
import {destroyIsolatedCluster,sqlFile,jsonLiteral,repositoryRoot}from'./support/reliability/postgres17.mjs';
import {supervisorEnvelope,handleSupervisorRequest,SUPERVISOR_PATH}from'../lib/certification-worker-supervision.js';
import {demandCheckpointSink} from './support/reliability/certification-demand-checkpoint.mjs';
import {createCertificationWorkerDemand}from'../tools/reliability/certification-worker-demand.mjs';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('real owned process disappearance, unchanged lease expiry/reclaim and source supersession',async t=>{
 let f,child;const evidence={hosted:false,environment:'OWNED_SOCKET_ONLY_POSTGRESQL17',cases:[]};
 const check=async(name,fn)=>{let error;await t.test(name,async()=>{try{await fn();evidence.cases.push({name,result:'PASS'});}catch(e){error=e;throw e;}});if(error)throw error;};
 try{
  f=await createSupervisorFixture();sqlFile(f.cluster,f.database,repositoryRoot+'/supabase/production_incremental/certification-worker-supervision-v1.sql',{role:''});
  const options={env:f.env,dependencies:f.dependencies,onCheckpoint:demandCheckpointSink(f.cluster)},bound=supervisorEnvelope(f.env,f.dependencies);
  const owner=(fn,input={})=>fn==='reserve'?JSON.parse(f.q('select production_control.worker_supervisor_reserve_v1()')):f.owner('worker_supervisor_'+fn+'_v1',{...bound,...input});
  const status=()=>owner('status'),stop=()=>owner('control',{action:'STOP',request_id:randomUUID(),expected_revision:status().revision});
  owner('configure',{signing_secret_id:f.keyId});
  const start=(slots=1,action='START')=>{const context=JSON.parse(f.q(`select production_control.worker_supervisor_binding_v1(${jsonLiteral(bound)})`));delete context.resource;delete context.deployment;
   return owner('control',{action,request_id:randomUUID(),expected_revision:status().revision,expected_context:context,
    expires_at:new Date(Date.now()+600000).toISOString(),budget:10,slots,
    ...(action==='RESUME'?{reconciliation_reason:'Obsolete completion denied; newer source current and old claims settled'}:{})});};
  const job=engine=>JSON.parse(f.q(`select to_jsonb(j)from scoring_authority.competition_recalculation_jobs j where engine_key='${engine}'`));
  const arm=fault=>{const j=job('TEAM_MOMENTUM');return owner('fault_control',{action:'ARM',expected_revision:status().revision,
   fault,engine_key:j.engine_key,cycle:j.delivery_cycle,source_revision:j.requested_source_revision,
   fixture_event_id:Number(f.q("select event_id from production_control.operation_audit_events where event_type='CERTIFICATION_PART2A_FIXTURE_BOOTSTRAPPED'")),
   expires_at:new Date(Date.now()+600000).toISOString()});};
  const runChild=ticket=>{const c=spawn(process.execPath,[repositoryRoot+'/test/support/reliability/certification-supervisor-child.mjs'],
   {env:{PATH:process.env.PATH},stdio:['ignore','ignore','pipe','ipc']});
   c.send({socket:f.cluster.socket,port:f.cluster.port,database:f.database,env:f.env,registrationManifest:f.dependencies.registrationManifest,ticket});return c;};
  const waitConsumed=async id=>{const limit=Date.now()+15000;while(Date.now()<limit){if(f.q(`select consumed_by is not null from production_control.worker_supervisor_faults_v1 where plan_id='${id}'`)==='t')return;await delay(100);}assert.fail('FAULT_NOT_REACHED');};
  const invoke=async ticket=>{const response=await handleSupervisorRequest(new Request(ticket.origin+SUPERVISOR_PATH,{method:'POST',headers:{'content-type':'application/json','x-bagger-worker-signature':ticket.signature},body:ticket.body}),options);
   const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));return result;};
  let ticket,plan,claim;
  await check('real process killed only after canonical claim; no fabricated success/failure acknowledgement',async()=>{
   f.toggle(true);await createCertificationWorkerDemand(options);f.toggle(false);plan=arm('DISAPPEAR');f.toggle(true);start();ticket=owner('reserve');
   child=runChild(ticket);await waitConsumed(plan.plan_id);claim=job('TEAM_MOMENTUM');assert.equal(claim.status,'RUNNING');assert.equal(claim.delivery_attempts,1);
   const exited=once(child,'exit');child.kill('SIGKILL');const[,signal]=await exited;assert.equal(signal,'SIGKILL');child=null;
   assert.equal(f.q(`select state from production_control.worker_supervisor_invocations_v1 where invocation_id='${ticket.invocation_id}'`),'RUNNING');
   assert.equal(status().counts.active_claims,2);assert.equal(owner('reserve').dispatched,false);
  });
  await check('real 90-second lease expiry and 120-second reconciliation preserve canonical uncertainty evidence',async()=>{
   const target=Date.parse(JSON.parse(f.q(`select to_jsonb(i)from production_control.worker_supervisor_invocations_v1 i where invocation_id='${ticket.invocation_id}'`)).reconcile_after);
   // Wait actual deadlines; never rewrite a lease, timestamp or attempt counter.
   await delay(Math.max(0,target-Date.now()+150));owner('reconcile');
   assert.equal(status().counts.active_claims,0);assert.equal(status().counts.expired_claims,2);
   const row=JSON.parse(f.q(`select to_jsonb(i)from production_control.worker_supervisor_invocations_v1 i where invocation_id='${ticket.invocation_id}'`));
   assert.equal(row.state,'RECONCILED');assert.ok(row.outcome.includes('RECONCILED'));assert.equal(row.evidence.canonical_jobs.length,2);
   assert.equal(job('TEAM_MOMENTUM').delivery_attempts,1);evidence.leaseSeconds=90;evidence.reconciliationSeconds=120;
  });
  await check('new process tick reclaims expired claims through normal backoff and preserves attempt history',async()=>{
   await invoke(owner('reserve'));stop();await delay(6200);start();await invoke(owner('reserve'));
   assert.equal(job('TEAM_MOMENTUM').status,'SUCCEEDED');assert.equal(job('TEAM_MOMENTUM').delivery_attempts,2);
   assert.equal(status().counts.expired_claims,0);assert.equal(status().counts.pending_work,0);stop();f.toggle(false);
  });
  await check('source supersession denies held obsolete completion and leaves genuine current work for next autonomous tick',async()=>{
   f.toggle(true);await createCertificationWorkerDemand(options);f.toggle(false);const source=job('TEAM_MOMENTUM');plan=arm('SUPERSEDE');f.toggle(true);start();ticket=owner('reserve');
   child=runChild(ticket);const message=once(child,'message'),exited=once(child,'exit');await waitConsumed(plan.plan_id);
   // A tee-time-only demand refresh does not change scoring source revision.
   // This distinct supersession case lawfully prepares the fresh revision-0
   // auction fixture; preparation is not part of the worker-demand producer.
   assert.equal(f.q('select auction_revision from scoring_authority.calcutta_v1_current'),'0');
   assert.equal((await f.mutation('prepare-scoring-context',{matchId:'2026-R3-11'})).payload.ok,true);
   assert.ok(job('TEAM_MOMENTUM').delivery_cycle>source.delivery_cycle);
   owner('fault_control',{action:'RELEASE',plan_id:plan.plan_id});const[result]=await message;await exited;child=null;
   assert.equal(result.status,200);assert.equal(job('TEAM_MOMENTUM').status,'PENDING');
   assert.equal(f.q("select count(*)from scoring_authority.competition_derived_snapshots where is_current and engine_key='TEAM_MOMENTUM'"),'1');
   stop();assert.equal(status().halt_latched,true);assert.throws(()=>start(),/SUPERVISOR_SAFE_START_REQUIRED/);
   start(1,'RESUME');assert.equal(status().halt_latched,false);await invoke(owner('reserve'));
   assert.equal(status().counts.pending_work,0);assert.equal(status().counts.active_claims,0);
   stop();f.toggle(false);
  });
  await check('two genuinely independent worker processes contend using canonical SQL CAS and complete drain',async()=>{
   f.toggle(true);await createCertificationWorkerDemand(options);f.toggle(false);
   const engines=['TEAM_MOMENTUM','TOURNAMENT_STORYLINES','TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL'];
   const priorAttempts=new Map(engines.map(engine=>[engine,job(engine).delivery_attempts]));
   arm('CONTENTION');f.toggle(true);start(2);
   const a=runChild(owner('reserve')),b=runChild(owner('reserve'));const messages=await Promise.all([once(a,'message'),once(b,'message')]);
   assert.ok(messages.every(([r])=>r.status===200&&r.result.outcome==='SUCCEEDED'));
   assert.equal(status().counts.pending_work,0);assert.equal(status().counts.active_claims,0);
   for(const engine of engines){
    assert.equal(job(engine).delivery_attempts,priorAttempts.get(engine)+1);
    assert.equal(f.q(`select count(*)from scoring_authority.competition_derived_snapshots where is_current and engine_key='${engine}'`),'1');
   }
   stop();f.toggle(false);
  });
  assert.equal(status().state,'OFF');assert.equal(status().counts.active_leases,0);assert.equal(status().counts.dead_letters,0);
 }finally{if(child){child.kill('SIGKILL');await once(child,'exit');}if(f)await destroyIsolatedCluster(f.cluster);
  await mkdir('docs/reliability/phase2d-worker-supervision/evidence',{recursive:true});await writeFile('docs/reliability/phase2d-worker-supervision/evidence/crash.json',JSON.stringify(evidence,null,2)+'\n');}
});
