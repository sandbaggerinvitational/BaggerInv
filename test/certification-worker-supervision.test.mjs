import test from'node:test';
import assert from'node:assert/strict';
import {randomUUID,randomBytes}from'node:crypto';
import registration from'../config/certification-resource-registration.json'with{type:'json'};
import {certificationSha256}from'../lib/canonical-resource-registration.js';
import {SUPERVISOR_PATH,SUPERVISOR_CONTRACT,signSupervisorInvocation,verifySupervisorRequest,executeBoundedSupervisor,handleSupervisorRequest}from'../lib/certification-worker-supervision.js';
const publicKey='synthetic-unit-public',serverKey='synthetic-unit-server';
const manifest={...registration,registration:{...registration.registration,public_key_sha256:certificationSha256(publicKey),server_key_sha256:certificationSha256(serverKey)}};
const r=manifest.registration,origin='https://unit-supervisor-certification.vercel.app';
const env={BAGGER_CERTIFICATION_RESOURCE_ID:r.resource_id,VERCEL_ENV:'preview',VERCEL_TEAM_ID:r.vercel_team_id,VERCEL_PROJECT_ID:r.vercel_project_id,
 VERCEL_GIT_COMMIT_REF:r.git_branch,VERCEL_GIT_COMMIT_SHA:'c'.repeat(40),VERCEL_DEPLOYMENT_ID:'dpl_UnitSupervision',VERCEL_URL:new URL(origin).hostname,
 SUPABASE_SCORING_MIRROR_URL:r.project_url,SUPABASE_SCORING_MIRROR_SECRET_KEY:serverKey,NEXT_PUBLIC_SUPABASE_AUTH_URL:r.project_url,
 NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY:publicKey,CERTIFICATION_WORKER_SIGNING_KEY:randomBytes(32).toString('hex')};
const dependencies={registrationManifest:manifest};
function ticket(){const now=Date.now();const body=JSON.stringify({contract:SUPERVISOR_CONTRACT,invocation_id:randomUUID(),nonce:randomUUID(),epoch:randomUUID(),revision:1,
 binding_digest:'a'.repeat(64),issued_at:now,expires_at:now+30000});return{body,signature:signSupervisorInvocation(body,origin,env.CERTIFICATION_WORKER_SIGNING_KEY)};}
function request(value,url=origin+SUPERVISOR_PATH){return new Request(url,{method:'POST',headers:{'content-type':'application/json','x-bagger-worker-signature':value.signature},body:value.body});}
test('signed ticket binds immutable path/origin/expiry; neither forwarded host nor arbitrary resource grants authority',()=>{
 const value=ticket();assert.equal(verifySupervisorRequest(request(value),value.body,{env,dependencies}).ticket.contract,SUPERVISOR_CONTRACT);
 for(const url of ['https://baggerinv.com'+SUPERVISOR_PATH,origin+SUPERVISOR_PATH+'?resource=arbitrary',origin+'/api/other'])assert.throws(()=>verifySupervisorRequest(request(value,url),value.body,{env,dependencies}));
 assert.throws(()=>verifySupervisorRequest(request(value),value.body,{env:{...env,CERTIFICATION_WORKER_SIGNING_KEY:''},dependencies}));
 assert.throws(()=>verifySupervisorRequest(request(value),value.body,{env,dependencies,now:JSON.parse(value.body).expires_at}));
});
test('45-second soft cutoff prevents a future tick/processor; existing runner exits after maximum one cycle',async()=>{
 let clock=Date.now(),ticks=0;const records=[];
 const control=async(op,input)=>{records.push(op);if(op==='BEGIN')return{invocation_id:randomUUID(),run_token:'synthetic-local-run'};
  if(op==='FINISH')return{outcome:input.outcome};return{ok:true};};
 const adapterFactory=async()=>{clock+=45000;return{tick:async()=>{ticks++;return{ok:true,ready:{}};},processors:{CALCUTTA:async()=>({ok:true}),COMPETITION:async()=>({ok:true}),INTELLIGENCE:async()=>({ok:true})}};};
 const result=await executeBoundedSupervisor({...ticket(),env,dependencies,control,adapterFactory,now:()=>clock});assert.equal(ticks,0);assert.equal(result.outcome,'STOPPED');assert.ok(!records.includes('STEP'));
});
test('STOP that wins a processor reservation prevents processing and admits no future poll',async()=>{
 let processed=0;const records=[];
 const control=async(op,input)=>{records.push(op);if(op==='BEGIN')return{invocation_id:randomUUID(),run_token:'synthetic-local-run'};
  if(op==='STEP'&&input.kind==='COMPETITION')throw Object.assign(new Error('SUPERVISOR_STEP_DENIED'),{code:'SUPERVISOR_STEP_DENIED',status:403});
  if(op==='FINISH')return{outcome:input.outcome};return{ok:true};};
 const adapterFactory=async()=>({tick:async()=>({ok:true,ready:{COMPETITION:true}}),processors:{CALCUTTA:async()=>({ok:true}),COMPETITION:async()=>{processed++;return{ok:true};},INTELLIGENCE:async()=>({ok:true})}});
 const result=await executeBoundedSupervisor({...ticket(),env,dependencies,control,adapterFactory});assert.equal(result.outcome,'STOPPED');assert.equal(processed,0);assert.equal(records.filter(r=>r==='TICK_RESULT').length,1);
});
test('deterministic adapter failure records global failure; unavailable accounting remains uncertain and sanitized',async()=>{
 const seen=[];const control=async(op,input)=>{seen.push({op,input});if(op==='BEGIN')return{invocation_id:randomUUID(),run_token:'synthetic-local-run'};return{ok:true};};
 const factory=async()=>{throw Object.assign(new Error('private details must not escape'),{code:'INVALID_ADAPTER'});};
 await assert.rejects(executeBoundedSupervisor({...ticket(),env,dependencies,control,adapterFactory:factory}));
 assert.equal(seen.find(s=>s.op==='TICK_RESULT').input.classification,'TERMINAL');assert.equal(seen.at(-1).input.outcome,'FAILED');
 const response=await handleSupervisorRequest(request(ticket()),{env,dependencies,control,adapterFactory:factory});assert.equal(response.status,503);
 assert.deepEqual(await response.json(),{ok:false,code:'SUPERVISOR_UNAVAILABLE'});
});
