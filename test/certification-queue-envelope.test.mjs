import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {QueueClient} from '@vercel/queue';
import {handleQueueEnvelope,preflightQueueCallback,requireQueueEnvelopeMetadata,queueCallbackEnvelope} from '../lib/certification-queue-envelope.js';
import {queueDatabaseFailure,queueDeliveryRetry} from '../lib/certification-queue-errors.js';
import {QUEUE_TOPIC,QUEUE_CONTRACT} from '../lib/certification-queue-supervision.js';
const clock=Date.parse('2026-10-05T12:00:00Z');
const bound={resource:{resource_id:'CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51',project_ref:'trmcwrljjxwhgtikfdgu'},
 deployment:{deployment_id:'dpl_LocalQueueEnvelope',deployment_class:'preview'}};
const message={version:QUEUE_CONTRACT,invocation_id:randomUUID()};
const request=(prefetched=false)=>new Request('https://synthetic.invalid/api/internal/derived-worker/queue',{
 method:'POST',headers:{'content-type':'application/json','ce-type':'com.vercel.queue.v2beta','ce-vqsqueuename':QUEUE_TOPIC,
  'ce-vqsconsumergroup':'synthetic_consumer','ce-vqsmessageid':'msg_synthetic','ce-vqsregion':'iad1',
  ...(prefetched?{'ce-vqsreceipthandle':'local_synthetic_ticket','ce-vqsdeliverycount':'1',
   'ce-vqscreatedat':new Date(clock).toISOString(),'ce-vqsexpiresat':new Date(clock+540000).toISOString(),
   'ce-vqsvisibilitydeadline':new Date(clock+300000).toISOString()}:{} )},body:prefetched?JSON.stringify(message):undefined});
const raw=(changes={})=>({messageId:'msg_synthetic',deliveryCount:2,timestamp:new Date(clock).toISOString(),
 expiresAt:new Date(clock+540000).toISOString(),body:Buffer.from(JSON.stringify(message)).toString('base64'),...changes});
const eligible=async(_operation,input)=>({ok:true,identified:true,execution_authorized:false,invocation_id:input.message.invocation_id,disposition:'ELIGIBLE',reason:'CURRENT'});
const peek=value=>new Response(JSON.stringify(value)+'\n',{headers:{'content-type':'application/x-ndjson'}});
const db=(code,state='PT409',details)=>queueDatabaseFailure({status:400},{code:state,message:code,details},'SUPERVISOR_CONTROL_UNAVAILABLE','BEGIN');
test('routing-only retry learns actual expiry through fixed provider zero-visibility peek before SDK entry',async()=>{
 let calls=0;const result=await preflightQueueCallback(request(),{bound,now:()=>clock,getToken:async()=>'synthetic-no-authority',fetchImpl:async(url,init)=>{
  calls++;assert.equal(url,`https://iad1.vercel-queue.com/api/v3/topic/${QUEUE_TOPIC}/consumer/synthetic_consumer/id/msg_synthetic`);
  assert.equal(init.headers['Vqs-Visibility-Timeout-Seconds'],'0');assert.equal(init.headers['Vqs-Deployment-Id'],bound.deployment.deployment_id);
  assert.equal(init.redirect,'error');return peek(raw());}});
 assert.equal(calls,1);assert.equal(result.expiresAt,raw().expiresAt);
});
test('bounded native envelope rejects arbitrary topic/region/group, malformed notification and Production context',async()=>{
 for(const [key,value]of [['ce-type','com.vercel.queue.v1beta'],['ce-vqsqueuename','foreign'],['ce-vqsregion','fra1'],
  ['ce-vqsconsumergroup','https://arbitrary.invalid'],['ce-vqsmessageid','']]){
  const r=request();r.headers.set(key,value);assert.throws(()=>queueCallbackEnvelope(r),/DELIVERY_DENIED/);
 }
 for(const changes of [{resource:{...bound.resource,resource_id:'PRODUCTION'}},{resource:{...bound.resource,project_ref:'foreign'}},
  {deployment:{...bound.deployment,deployment_class:'production'}}])await assert.rejects(preflightQueueCallback(request(),{
   bound:{...bound,...changes},getToken:async()=>assert.fail('denial precedes token access'),now:()=>clock}),/DELIVERY_DENIED/);
});
test('no actual expiry, exhausted horizon, wrong message or oversized provider response never start SDK timers/worker',async()=>{
 for(const value of [raw({expiresAt:null}),raw({timestamp:null}),raw({expiresAt:new Date(clock+179000).toISOString()}),raw({messageId:'foreign'}),
  raw({body:'x'.repeat(9000)})]){
  let sdk=0;const response=await handleQueueEnvelope(request(),()=>{sdk++;assert.fail();},{bound,control:eligible,now:()=>clock,
   getToken:async()=>'synthetic',fetchImpl:async()=>peek(value)});
  assert.equal(response.status,503);assert.equal(sdk,0);
 }
});
test('locked/already processed notification is skipped without ACKing the underlying message or executing a worker',async()=>{
 for(const status of [404,409,410]){
  let requests=0;const response=await handleQueueEnvelope(request(),()=>assert.fail(),{bound,control:eligible,now:()=>clock,
   getToken:async()=>'synthetic',fetchImpl:async()=>{requests++;return new Response(null,{status});}});
  assert.equal(response.status,200);assert.equal((await response.json()).status,'skipped');assert.equal(requests,1);
 }
});
test('NOT_DUE and BUSY use explicit safe delays; transport-only probes do not imply execution/ACK',()=>{
 const meta={deliveryCount:1,expiresAt:new Date(Date.now()+540000)};
 const notDue=db('SUPERVISOR_NOT_DUE_OR_BUSY','PT409',JSON.stringify({reason:'NOT_DUE',retry_after_seconds:30}));
 assert.equal(notDue.queueDisposition,'RETRY');assert.equal(notDue.retryAfterSeconds,30);
 assert.equal(queueDeliveryRetry(notDue,meta).afterSeconds,30);
 const early=db('SUPERVISOR_NOT_DUE_OR_BUSY','PT409',JSON.stringify({reason:'NOT_DUE',retry_after_seconds:1}));
 assert.deepEqual(queueDeliveryRetry(early,meta),{afterSeconds:5});
 assert.deepEqual(queueDeliveryRetry(db('SUPERVISOR_NOT_DUE_OR_BUSY'),meta),{afterSeconds:15});
 assert.equal(queueDeliveryRetry(notDue,{...meta,expiresAt:new Date(Date.now()+45000)}),undefined);
 assert.equal(queueDeliveryRetry(notDue,{...meta,deliveryCount:5}),undefined);
 assert.equal(queueDeliveryRetry(notDue,{deliveryCount:1}),undefined);
 const tooEarly=db('SUPERVISOR_NOT_DUE_OR_BUSY','PT409',JSON.stringify({reason:'NOT_DUE',retry_after_seconds:4000}));
 assert.equal(queueDeliveryRetry(tooEarly,{...meta,expiresAt:new Date(Date.now()+7200000)}),undefined);
 // Relative SQL duration survives independent database/runtime clock domains.
 const skewed=db('SUPERVISOR_NOT_DUE_OR_BUSY','PT409',JSON.stringify({reason:'NOT_DUE',retry_after_seconds:60}));
 assert.equal(queueDeliveryRetry(skewed,meta).afterSeconds,60);
});
test('authority/STOP/HALT/stale/replay deny with SDK ACK; infrastructure fails; UNKNOWN remains reconcilable',()=>{
 const meta={deliveryCount:1,expiresAt:new Date(Date.now()+540000)};
 for(const name of ['SUPERVISOR_RESERVATION_DENIED','SUPERVISOR_DISABLED_OR_STALE','SUPERVISOR_DEPLOYMENT_DENIED',
  'SUPERVISOR_RESOURCE_DENIED','SUPERVISOR_ADMISSION_DENIED'])assert.deepEqual(queueDeliveryRetry(db(name,'42501'),meta),{acknowledge:true});
 assert.equal(queueDeliveryRetry(db('unexpected','21000'),meta),undefined);
 assert.deepEqual(queueDeliveryRetry(db('connection','08006'),meta),{afterSeconds:2});
 assert.deepEqual(queueDeliveryRetry({code:'SUPERVISOR_ACK_UNKNOWN',queueDisposition:'RECONCILE'},meta),{afterSeconds:2});
 assert.deepEqual(queueDeliveryRetry(db('serialize','40001'),meta),{afterSeconds:2});
 assert.equal(queueDeliveryRetry({code:'SUPERVISOR_DELIVERY_LIMIT',queueDisposition:'FAIL'},meta),undefined);
});
test('real SDK first early denial reschedules with HTTP 200; routing-only retry pulls real metadata and executes once',async t=>{
 const prior=globalThis.fetch;const calls=[];let attempts=0,workers=0;
 t.mock.timers.enable({apis:['Date','setTimeout'],now:clock});
 globalThis.fetch=async(url,init)=>{
  assert.equal(new URL(url).origin,'https://iad1.vercel-queue.com');
  calls.push({method:init.method,visibility:new Headers(init.headers).get('Vqs-Visibility-Timeout-Seconds'),
   seconds:init.body?JSON.parse(init.body).visibilityTimeoutSeconds:null});
  if(init.method==='POST'&&new Headers(init.headers).get('accept')==='application/x-ndjson')return peek(raw());
  if(init.method==='POST')return new Response(`--synthetic\r\nContent-Type: application/json\r\nVqs-Message-Id: msg_synthetic\r\nVqs-Receipt-Handle: local_synthetic_ticket\r\nVqs-Delivery-Count: 2\r\nVqs-Timestamp: ${raw().timestamp}\r\nVqs-Expires-At: ${raw().expiresAt}\r\n\r\n${JSON.stringify(message)}\r\n--synthetic--\r\n`,{headers:{'content-type':'multipart/mixed; boundary=synthetic'}});
  return init.method==='DELETE'?new Response(null,{status:204}):Response.json({success:true});
 };
 try{
  const client=new QueueClient({region:'iad1',deploymentId:bound.deployment.deployment_id,token:'synthetic-local-only',telemetry:{isEnabled:false}});
  const callback=client.handleCallback(async(payload,meta)=>{
   requireQueueEnvelopeMetadata(meta);assert.deepEqual(payload,message);attempts++;
   if(attempts===1)throw db('SUPERVISOR_NOT_DUE_OR_BUSY','PT409',JSON.stringify({reason:'NOT_DUE',retry_after_seconds:1}));
   if(workers===0)workers++;
  },{visibilityTimeoutSeconds:90,retry:queueDeliveryRetry});
  const options={bound,control:eligible,getToken:async()=>'synthetic-local-only'};
  assert.equal((await handleQueueEnvelope(request(true),callback,options)).status,200);
  assert.equal(workers,0);assert.deepEqual(calls.map(c=>c.method),['PATCH']);assert.equal(calls[0].seconds,5);
  t.mock.timers.tick(5000);
  assert.equal((await handleQueueEnvelope(request(),callback,options)).status,200);
  assert.deepEqual(calls.map(c=>c.method),['PATCH','POST','POST','DELETE']);
  assert.equal(calls[1].visibility,'0');assert.equal(calls[2].visibility,'90');assert.equal(workers,1);
 }finally{globalThis.fetch=prior;t.mock.timers.reset();}
});
