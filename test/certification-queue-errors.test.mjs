import test from 'node:test';
import assert from 'node:assert/strict';
import {QueueClient} from '@vercel/queue';
import {queueDatabaseFailure,queueTransportFailure,queueDeliveryRetry} from '../lib/certification-queue-errors.js';
const failure=(sqlstate,message,status=400)=>queueDatabaseFailure({status},{code:sqlstate,message,details:'private data'},'SUPERVISOR_CONTROL_UNAVAILABLE','BEGIN');
for(const code of ['SUPERVISOR_ADMISSION_DENIED','SUPERVISOR_RESERVATION_DENIED','SUPERVISOR_DISABLED_OR_STALE',
 'SUPERVISOR_RESOURCE_DENIED','SUPERVISOR_DEPLOYMENT_DENIED','SUPERVISOR_REQUEST_DENIED','SUPERVISOR_MESSAGE_DENIED',
 'SUPERVISOR_RUN_TOKEN_DENIED','SUPERVISOR_OWNER_PUBLICATION_REQUIRED','SUPERVISOR_PUBLISHER_SESSION_DENIED'])
 test(code+' is an explicit deterministic denial, ACK without worker',()=>{
  const e=failure('42501',code);assert.equal(e.code,code);assert.equal(e.status,403);
  assert.deepEqual(queueDeliveryRetry(e,{expiresAt:new Date(Date.now()+540000),deliveryCount:1}),{acknowledge:true});
 });
for(const code of ['SUPERVISOR_AUTHORITY_CONTEXT_STALE','SUPERVISOR_REVISION_STALE','CANONICAL_RESOURCE_CONTEXT_STALE'])
 test(code+' PT409 remains a typed nonretrying authority conflict',()=>{
  const e=failure('PT409',code);assert.equal(e.status,409);assert.deepEqual(queueDeliveryRetry(e,{expiresAt:new Date(Date.now()+540000),deliveryCount:1}),{acknowledge:true});
 });
for(const [state,message]of [['21000','UPDATE requires a WHERE clause'],['P0001','SUPERVISOR_SINGLETON_DRIFT'],
 ['42P01','missing relation'],['XX000','unexpected internal failure'],['42501','permission denied for private object'],
 ['21000','SUPERVISOR_ADMISSION_DENIED'],['42501','log: SUPERVISOR_ADMISSION_DENIED']])
 test(state+' '+message+' fails delivery without false authorization ACK',()=>{
  const e=failure(state,message);assert.equal(e.status,503);assert.equal(e.queueDisposition,'FAIL');
  assert.equal(queueDeliveryRetry(e,{expiresAt:new Date(Date.now()+540000),deliveryCount:1}),undefined);assert.ok(!JSON.stringify(e).includes('private data'));
 });
for(const code of ['SUPERVISOR_NOT_DUE_OR_BUSY','SUPERVISOR_PUBLISHER_BUSY'])
 test(code+' can become eligible and retries without ACK',()=>{
  assert.deepEqual(queueDeliveryRetry(failure('PT409',code),{expiresAt:new Date(Date.now()+540000),deliveryCount:1}),{afterSeconds:15});
 });
for(const state of ['40001','40P01','57014','08006'])
 test(state+' respects transaction retry/uncertainty without resetting attempts',()=>{
  const e=failure(state,'transient');assert.deepEqual(queueDeliveryRetry(e,{expiresAt:new Date(Date.now()+540000),deliveryCount:2}),{afterSeconds:4});
  assert.equal(queueDeliveryRetry(e,{expiresAt:new Date(Date.now()+540000),deliveryCount:5}),undefined);
  assert.equal(e.queueDisposition,['57014','08006'].includes(state)?'RECONCILE':'RETRY');
 });
test('timeout/connection remain uncertain; generic status alone cannot authorize ACK',()=>{
 for(const cause of [new TypeError('network'),Object.assign(new Error('timeout'),{name:'TimeoutError'})]){
  const e=queueTransportFailure('SUPERVISOR_CONTROL_UNAVAILABLE','BEGIN',cause);
  assert.equal(e.queueDisposition,'RECONCILE');assert.equal(e.operation,'BEGIN');
  assert.deepEqual(queueDeliveryRetry(e,{expiresAt:new Date(Date.now()+540000),deliveryCount:1}),{afterSeconds:2});
 }
 assert.notDeepEqual(queueDeliveryRetry({status:403},{expiresAt:new Date(Date.now()+540000),deliveryCount:1}),{acknowledge:true});
 assert.equal(queueDeliveryRetry(new TypeError('unexpected consumer programming failure'),{expiresAt:new Date(Date.now()+540000),deliveryCount:1}),undefined);
});
test('installed native SDK: ACK deletes lease; retry changes visibility; programming fault fails HTTP callback without ACK',async t=>{
 // Run the unmodified installed SDK callback/lifecycle. Only provider I/O is
 // replaced with a fixed synthetic API response; no actual Queue is created.
 const original=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,init)=>{
  assert.equal(new URL(url).origin,'https://queue-local.invalid');
  calls.push({method:init.method,body:init.body});return new Response('',{status:200});
 };
 try{
  const queue=new QueueClient({region:'iad1',token:'synthetic-local-sdk-token',deploymentId:'dpl_LocalQueueErrors',
   resolveBaseUrl:()=>new URL('https://queue-local.invalid'),telemetry:{enabled:false}});
  const request=()=>new Request('https://consumer-local.invalid',{method:'POST',headers:{
   'content-type':'application/json','ce-type':'com.vercel.queue.v2beta','ce-vqsqueuename':'bagger-certification-derived-wake-v2',
   'ce-vqscreatedat':new Date().toISOString(),'ce-vqsexpiresat':new Date(Date.now()+540000).toISOString(),'ce-vqsconsumergroup':'synthetic','ce-vqsmessageid':'msg_local','ce-vqsreceipthandle':'receipt_local','ce-vqsdeliverycount':'1'},body:'{}'});
  for(const [name,error,expectedMethod,expectedStatus]of [
   ['success',null,'DELETE',200],['authority',failure('42501','SUPERVISOR_ADMISSION_DENIED'),'DELETE',200],
   ['connection',failure('08006','connection lost'),'PATCH',200],['busy',failure('PT409','SUPERVISOR_NOT_DUE_OR_BUSY'),'PATCH',200],
   ['safeupdate',failure('21000','UPDATE requires a WHERE clause'),null,500]]){
   await t.test(name,async()=>{
    calls.length=0;const handle=queue.handleCallback(async()=>{if(error)throw error;},{visibilityTimeoutSeconds:90,retry:queueDeliveryRetry});
    const response=await handle(request());assert.equal(response.status,expectedStatus);
    assert.deepEqual(calls.map(c=>c.method),expectedMethod?[expectedMethod]:[]);
   });
  }
 }finally{globalThis.fetch=original;}
});
