import test from'node:test';
import assert from'node:assert/strict';
import {randomUUID}from'node:crypto';
import {readFile,mkdir,writeFile}from'node:fs/promises';
import {createSupervisorFixture}from'./support/reliability/certification-supervisor-fixture.mjs';
import {destroyIsolatedCluster,sqlFile,jsonLiteral,repositoryRoot}from'./support/reliability/postgres17.mjs';
import {certificationReleaseInput}from'./support/reliability/certification-release-proof.mjs';
import {supervisorEnvelope,createSupervisorTransport}from'../lib/certification-worker-supervision.js';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('installation, provider-secret ACL, expired reservation and stale release boundaries',async t=>{
 let f;const evidence={hosted:false,cases:[]};
 const check=async(name,fn)=>{let error;await t.test(name,async()=>{try{await fn();evidence.cases.push({name,result:'PASS'});}catch(e){error=e;throw e;}});if(error)throw error;};
 try{
  f=await createSupervisorFixture();const artifact=repositoryRoot+'/supabase/production_incremental/certification-worker-supervision-v1.sql';
  sqlFile(f.cluster,f.database,artifact,{role:''});let bound=supervisorEnvelope(f.env,f.dependencies);
  const owner=(fn,input={})=>fn==='reserve'?JSON.parse(f.q('select production_control.worker_supervisor_reserve_v1()')):f.owner('worker_supervisor_'+fn+'_v1',{...bound,...input});
  const status=()=>owner('status'),stop=()=>owner('control',{action:'STOP',request_id:randomUUID(),expected_revision:status().revision});
  const start=()=>{const context=JSON.parse(f.q(`select production_control.worker_supervisor_binding_v1(${jsonLiteral(bound)})`));delete context.resource;delete context.deployment;
   return owner('control',{action:'START',request_id:randomUUID(),expected_revision:status().revision,expected_context:context,
    expires_at:new Date(Date.now()+600000).toISOString(),budget:10,slots:1});};
  const control=createSupervisorTransport({env:f.env,dependencies:f.dependencies});owner('configure',{signing_secret_id:f.keyId});
  await check('forward replay rejects unexpected private function drift atomically; original restored definition still replays',async()=>{
   const original=f.q("select pg_get_functiondef('production_control.worker_supervisor_scope_v1()'::regprocedure)");
   f.q("comment on function production_control.worker_supervisor_scope_v1()is 'owned local test';alter function production_control.worker_supervisor_scope_v1()set search_path=pg_catalog,public");
   assert.throws(()=>sqlFile(f.cluster,f.database,artifact,{role:''}),/SUPERVISOR_INSTALLED_ARTIFACT_DRIFT/);
   f.q(original);sqlFile(f.cluster,f.database,artifact,{role:''});assert.equal(status().state,'OFF');
  });
  await check('unsafe provider queue ACL blocks dispatch before any reservation or credential-bearing HTTP request commits',async()=>{
   f.toggle(true);start();f.q('grant select on net.local_requests to public');
   assert.throws(()=>f.q('select production_control.worker_supervisor_dispatch_v1()'),/SUPERVISOR_PROVIDER_SECRET_ACL_REQUIRED/);
   assert.equal(f.q('select count(*)from net.local_requests'),'0');assert.equal(status().dispatched,0);
   f.q('revoke select on net.local_requests from public');stop();f.toggle(false);
  });
  await check('recorded reservation expires at the unchanged 30-second deadline; service transport cannot revive it',async()=>{
   f.toggle(true);start();const ticket=owner('reserve');assert.equal(ticket.dispatched,true);await delay(30200);
   await assert.rejects(control('BEGIN',{body:ticket.body,signature:ticket.signature}),/SUPERVISOR_SIGNATURE_OR_EXPIRY_DENIED/);
   assert.equal(f.q(`select state from production_control.worker_supervisor_invocations_v1 where invocation_id='${ticket.invocation_id}'`),'RESERVED');
   stop();assert.equal(f.q(`select outcome from production_control.worker_supervisor_invocations_v1 where invocation_id='${ticket.invocation_id}'`),'NOT_STARTED');f.toggle(false);
  });
  await check('single-use BEGIN, invalid run token and stale step sequence cannot execute worker control',async()=>{
   f.toggle(true);start();const ticket=owner('reserve'),begin=await control('BEGIN',{body:ticket.body,signature:ticket.signature});
   await assert.rejects(control('BEGIN',{body:ticket.body,signature:ticket.signature}),/SUPERVISOR_REPLAY_DENIED/);
   const auth={invocation_id:begin.invocation_id,run_token:begin.run_token};
   await assert.rejects(control('STEP',{...auth,run_token:'wrong',sequence:1,kind:'TICK'}),/SUPERVISOR_RUN_TOKEN_DENIED/);
   await assert.rejects(control('STEP',{...auth,sequence:2,kind:'TICK'}),/SUPERVISOR_STEP_DENIED/);
   stop();await assert.rejects(control('STEP',{...auth,sequence:1,kind:'TICK'}),/SUPERVISOR_STEP_DENIED/);
   await control('FINISH',{...auth,outcome:'STOPPED'});owner('reconcile');assert.equal(status().state,'OFF');f.toggle(false);
  });
  await check('real owner release rebind latches stored target HALTED; no old-deployment retry/dispatch or implicit restart',async()=>{
   start();const {input}=certificationReleaseInput(f,'local-supervisor-stale-release');input.resource={...bound.resource,vercel_team_id:bound.deployment.vercel_team_id,vercel_project_id:bound.deployment.vercel_project_id};
   const receipt=f.owner('rebind_certification_release_v1',input);assert.equal(receipt.ok,true);
   bound={...bound,deployment:{...bound.deployment,release_commit:receipt.release_commit,deployment_id:receipt.deployment_id,deployment_origin:receipt.deployment_origin}};
   const dispatch=JSON.parse(f.q('select production_control.worker_supervisor_dispatch_v1()'));assert.equal(dispatch.code,'SUPERVISOR_BINDING_STALE');
   assert.equal(status().state,'HALTED');assert.equal(status().reason,'STORED_BINDING_STALE');
   assert.equal(owner('reserve').dispatched,false);assert.throws(()=>start(),/SUPERVISOR_SAFE_START_REQUIRED/);
   assert.equal(f.q('select count(*)from net.local_requests'),'0');stop();assert.equal(status().state,'OFF');assert.equal(status().halt_latched,true);assert.throws(()=>start(),/SUPERVISOR_SAFE_START_REQUIRED/);
  });
 }finally{if(f)await destroyIsolatedCluster(f.cluster);
  await mkdir('docs/reliability/phase2d-worker-supervision/evidence',{recursive:true});await writeFile('docs/reliability/phase2d-worker-supervision/evidence/boundary.json',JSON.stringify(evidence,null,2)+'\n');}
});
