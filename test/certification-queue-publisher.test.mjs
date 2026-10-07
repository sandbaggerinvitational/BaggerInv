import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createPreviewQueuePublisher,handleOwnerQueuePublication,PUBLICATION_PATH} from '../lib/certification-queue-publisher.js';
import {createOwnerQueuePublisher} from '../tools/reliability/certification-queue-control.mjs';
import {createQueueFixture} from './support/reliability/certification-queue-fixture.mjs';
import {destroyIsolatedCluster} from './support/reliability/postgres17.mjs';
const token=(d,environment='preview')=>['synthetic',Buffer.from(JSON.stringify({owner_id:d.vercel_team_id,project_id:d.vercel_project_id,environment,
 exp:Math.floor(Date.now()/1000)+120})).toString('base64url'),'synthetic'].join('.');
test('Preview publisher validates real identity predicate before SDK construction',async()=>{
 const f=await createQueueFixture();try{
  let options;const factory=x=>{options=x;return {send:async(topic,message)=>{assert.equal(topic,'bagger-certification-derived-wake-v2');
   assert.deepEqual(Object.keys(message).sort(),['invocation_id','version']);return{messageId:'msg_synthetic'};}};};
  const send=await createPreviewQueuePublisher({env:f.env,dependencies:f.dependencies,getToken:async()=>token(f.deployment),clientFactory:factory});
  await send({version:'certification-queue-supervision-v2',invocation_id:randomUUID()},{});
  assert.equal(options.deploymentId,f.deployment.deployment_id);
  for(const environment of ['development','production','custom'])await assert.rejects(createPreviewQueuePublisher({env:f.env,dependencies:f.dependencies,
   getToken:async()=>token(f.deployment,environment),clientFactory:()=>assert.fail()}),/SUPERVISOR_PROVIDER_IDENTITY_DENIED/);
  for(const field of ['VERCEL_ENV','VERCEL_DEPLOYMENT_ID','VERCEL_GIT_COMMIT_SHA','VERCEL_GIT_COMMIT_REF','VERCEL_PROJECT_ID','BAGGER_CERTIFICATION_RESOURCE_ID'])
   await assert.rejects(createPreviewQueuePublisher({env:{...f.env,[field]:'foreign'},dependencies:f.dependencies,getToken:()=>assert.fail(),clientFactory:()=>assert.fail()}));
  await assert.rejects(createPreviewQueuePublisher({env:{...f.env,VERCEL_QUEUE_BASE_URL:'https://other.invalid'},dependencies:f.dependencies,getToken:()=>assert.fail()}));
  assert.throws(()=>createOwnerQueuePublisher(),/SUPERVISOR_LOCAL_PUBLICATION_RETIRED/);
 }finally{await destroyIsolatedCluster(f.cluster);}
});
test('publisher body cannot select topic, resource, message, delay or transport',async()=>{
 const f=await createQueueFixture();try{
  const base={permit:'0'.repeat(64)};
  for(const extra of [{topic:'other'},{message:{}},{delay:0},{resource:'PRODUCTION'},{url:'https://other.invalid'},{action:'START'}])
   await assert.rejects(handleOwnerQueuePublication(new Request(f.deployment.deployment_origin+PUBLICATION_PATH,{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({...base,...extra})}),{env:f.env,dependencies:f.dependencies,createSend:()=>assert.fail(),control:()=>assert.fail()}),/SUPERVISOR_PUBLICATION_REQUEST_DENIED/);
  for(const suffix of ['?deployment=foreign','/other'])await assert.rejects(handleOwnerQueuePublication(new Request(f.deployment.deployment_origin+PUBLICATION_PATH+suffix,
   {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(base)}),{env:f.env,dependencies:f.dependencies,createSend:()=>assert.fail()}));
 }finally{await destroyIsolatedCluster(f.cluster);}
});
test('worker engine, job-fault transport and retired HTTP route stay byte-identical; consumer changes are transport-only; CLI remains retired',async()=>{
 const {execFileSync}=await import('node:child_process');
 // v5 extends only bounded supervisor orchestration with canonical global
 // fault controls. Native consumer, worker and existing job faults are reused.
 for(const file of ['lib/score-derived-worker.js','app/api/internal/derived-worker/run/route.js'])
  assert.equal(await readFile(file,'utf8'),execFileSync('git',['show','71d6a393:'+file],{encoding:'utf8'}));
 const consumer=await readFile('app/api/internal/derived-worker/queue/route.js','utf8');
 assert.match(consumer,/handleQueueEnvelope\(request,consume,\{bound,control:queueControl\(\),evidence:timingEvidence\}\)/);
 assert.match(consumer,/requireQueueEnvelopeMetadata\(metadata,message\)/);
 assert.match(consumer,/consumeCertificationQueueMessage\(message,metadata,\{timingEvidence\}\)/);
 assert.match(consumer,/observeQueueTransport/);
 const runtime=await readFile('lib/certification-worker-supervision.js','utf8');
 const original=execFileSync('git',['show','9ed929788b05d756b4eff6f72d0ec24821f3636e:lib/certification-worker-supervision.js'],{encoding:'utf8'});
 const jobTransport=s=>s.slice(s.indexOf('export function createSupervisorFaultTransport'),s.indexOf('export async function handleSupervisorRequest'));
 assert.equal(jobTransport(runtime),jobTransport(original));
 const tool=await readFile('tools/reliability/certification-queue-control.mjs','utf8');assert.doesNotMatch(tool,/new QueueClient|from '@vercel\/queue'/);
 assert.match(tool,/x-vercel-trusted-oidc-idp-token/);
 // Reuse the same official OIDC helper already installed by the pinned SDK
 // and used by the reviewed publisher; no new dependency is added.
 const lock=JSON.parse(await readFile('package-lock.json','utf8'));
 assert.equal(lock.packages['node_modules/@vercel/queue'].version,'0.7.0');
 assert.ok(lock.packages['node_modules/@vercel/queue'].dependencies['@vercel/oidc']);
 assert.equal(lock.packages['node_modules/@vercel/oidc'].version,'3.8.10');
 for(const file of ['package.json','package-lock.json'])assert.equal(await readFile(file,'utf8'),execFileSync('git',['show','71d6a393:'+file],{encoding:'utf8'}));
});
