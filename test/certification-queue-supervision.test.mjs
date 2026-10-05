import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import registration from '../config/certification-resource-registration.json' with {type:'json'};
import {createOwnerQueuePublisher,validateOwnerQueueBatch,publishOwnerQueueBatch,startAndPublishOwnerQueue} from '../tools/reliability/certification-queue-control.mjs';
import {QUEUE_CONTRACT,parseQueueMessage,queueRetry} from '../lib/certification-queue-supervision.js';
const binding={resource:registration.registration,deployment:{vercel_team_id:registration.registration.vercel_team_id,
 vercel_project_id:registration.registration.vercel_project_id,git_branch:registration.registration.git_branch,deployment_class:'preview',
 deployment_id:'dpl_SyntheticQueueLocal',release_commit:'c'.repeat(40),deployment_origin:'https://local-synthetic.vercel.app'}};
const message=()=>({version:QUEUE_CONTRACT,invocation_id:randomUUID()});
const batch=()=>({binding,epoch:randomUUID(),messages:[]});
for(const [name,value]of Object.entries({missing:null,empty:{},resource:{...message(),resource:'PRODUCTION'},url:{...message(),url:'https://other.invalid'},worker:{...message(),worker:'CALCUTTA'},badVersion:{...message(),version:'other'},badId:{...message(),invocation_id:'id'}}))
 test('queue message denies '+name,()=>assert.throws(()=>parseQueueMessage(value),/SUPERVISOR_MESSAGE_DENIED/));
test('retired CLI publisher is incapable of hosted publication',()=>assert.throws(()=>createOwnerQueuePublisher(),/SUPERVISOR_LOCAL_PUBLICATION_RETIRED/));
test('publisher denies arbitrary physical resource or unpinned destination before SDK creation',()=>{
 for(const field of ['resource_id','project_ref','registration_revision']){const b=structuredClone(batch());b.binding.resource[field]='foreign';assert.throws(()=>validateOwnerQueueBatch(b));}
 for(const field of ['deployment_id','git_branch','release_commit','deployment_class','deployment_origin']){const b=structuredClone(batch());b.binding.deployment[field]='foreign';assert.throws(()=>validateOwnerQueueBatch(b));}
});
test('START remains truthful when credential acquisition fails after canonical commit',async()=>{
 const calls=[],b=batch();await assert.rejects(startAndPublishOwnerQueue({owner:async(op)=>{calls.push(op);return op==='publication'?b:{ok:true};},input:{},createSend:()=>{throw new Error('provider unavailable');}}));
 assert.deepEqual(calls,['control','publication']);
});
test('publisher lost acknowledgement never fabricates NOT_PUBLISHED or a complete schedule',async()=>{
 const b=batch();b.messages=[{message:message(),scheduled_at:new Date(Date.now()+1000).toISOString(),expires_at:new Date(Date.now()+31000).toISOString(),idempotency_key:'bagger-certification-'+b.epoch+'-1'}];
 const calls=[];const result=await publishOwnerQueueBatch({owner:async(op,input)=>{calls.push({op,input});return op==='publication'&&input.action==='BATCH'?b:{ok:true};},send:async()=>{throw new Error('accepted but ACK lost');}});
 assert.equal(result.results[0].outcome,'UNKNOWN');assert.equal(result.schedule_installed,false);assert.equal(calls.some(x=>x.input?.action==='ACK'),false);
});
test('queue retry is finite; security denials acknowledge without job work; errors preserve uncertainty',()=>{
 assert.deepEqual(queueRetry({status:403},{deliveryCount:1}),{acknowledge:true});assert.deepEqual(queueRetry({}, {deliveryCount:5}),{acknowledge:true});
 assert.deepEqual(queueRetry({status:503},{deliveryCount:1}),{afterSeconds:2});
});
test('only Certification manifest registers one private consumer; base Production manifest unchanged; pinned SDK',async()=>{
 const manifest=JSON.parse(await readFile('vercel.certification-queue.json','utf8')),base=JSON.parse(await readFile('vercel.json','utf8'));
 assert.equal(base.functions,undefined);assert.equal(Object.keys(manifest.functions).length,1);
 const consumer=manifest.functions['app/api/internal/derived-worker/queue/route.js'];assert.equal(consumer.maxDuration,60);assert.equal(consumer.experimentalTriggers[0].type,'queue/v2beta');
 assert.equal(consumer.experimentalTriggers[0].maxDeliveries,5);assert.equal(consumer.experimentalTriggers[0].topic,'bagger-certification-derived-wake-v2');
 const pkg=JSON.parse(await readFile('package.json','utf8'));assert.equal(pkg.dependencies['@vercel/queue'],'0.7.0');
 const route=await readFile('app/api/internal/derived-worker/queue/route.js','utf8');assert.match(route,/handleCallback/);assert.match(route,/queueRuntimeIdentity/);
 const old=await readFile('app/api/internal/derived-worker/run/route.js','utf8');assert.doesNotMatch(old,/handleSupervisorRequest|executeBoundedSupervisor/);
});
