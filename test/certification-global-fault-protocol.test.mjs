import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile}from'node:fs/promises';
import {queueDatabaseFailure,queueDeliveryRetry}from'../lib/certification-queue-errors.js';
import {classifyDerivedFailure}from'../lib/score-derived-worker.js';
import {parseQueueMessage}from'../lib/certification-queue-supervision.js';
import {randomUUID}from'node:crypto';
test('new canonical fixed-fault denial ACKs; SQL programming failures remain failed deliveries',()=>{
 const denied=queueDatabaseFailure({status:400},{code:'42501',message:'SUPERVISOR_GLOBAL_FAULT_DENIED'},'SUPERVISOR_CONTROL_UNAVAILABLE','GLOBAL_FAULT');
 assert.equal(denied.queueDisposition,'ACK');assert.deepEqual(queueDeliveryRetry(denied,{deliveryCount:1}),{acknowledge:true});
 const programming=queueDatabaseFailure({status:400},{code:'21000',message:'UPDATE requires a WHERE clause'},'SUPERVISOR_CONTROL_UNAVAILABLE','GLOBAL_FAULT');
 assert.equal(programming.queueDisposition,'FAIL');assert.equal(queueDeliveryRetry(programming,{deliveryCount:1}),undefined);
});
test('lost outward acknowledgement retries finitely and never claims deterministic denial',()=>{
 const error={code:'SUPERVISOR_ACKNOWLEDGEMENT_UNKNOWN',queueDisposition:'RECONCILE'};
 assert.deepEqual(queueDeliveryRetry(error,{deliveryCount:1}),{afterSeconds:2});assert.equal(queueDeliveryRetry(error,{deliveryCount:5}),undefined);
});
test('fixed transient/global terminal use the established worker classifier',()=>{
 assert.equal(classifyDerivedFailure({code:'ECONNRESET'}).classification,'RETRYABLE');
 assert.equal(classifyDerivedFailure({code:'SUPERVISOR_TEST_GLOBAL_DETERMINISTIC'}).classification,'TERMINAL');
});
test('queue message cannot select fault, epoch, SQL, delay or any target',()=>{
 const message={version:'certification-queue-supervision-v2',invocation_id:randomUUID()};
 for(const extra of [{fault:'GLOBAL_TRANSIENT'},{epoch:randomUUID()},{sql:'select 1'},{delay:1},{resource:'PRODUCTION'},{url:'https://example.com'}])
  assert.throws(()=>parseQueueMessage({...message,...extra}),{code:'SUPERVISOR_MESSAGE_DENIED'});
});
test('consumer registration, retired public ingress and provider limits are untouched',async()=>{
 const route=await readFile('app/api/internal/derived-worker/queue/route.js','utf8');assert.match(route,/handleCallback/);assert.doesNotMatch(route,/GLOBAL_FAULT|adapterFactory/);
 const old=await readFile('app/api/internal/derived-worker/run/route.js','utf8');assert.doesNotMatch(old,/handleSupervisorRequest|executeBoundedSupervisor/);
 const manifest=JSON.parse(await readFile('vercel.certification-queue.json','utf8'));
 assert.equal(manifest.functions['app/api/internal/derived-worker/queue/route.js'].maxDuration,60);
 assert.equal(manifest.functions['app/api/internal/derived-worker/queue/route.js'].experimentalTriggers[0].maxDeliveries,5);
});
