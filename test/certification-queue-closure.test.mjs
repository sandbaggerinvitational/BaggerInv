import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {QueueClient} from '@vercel/queue';
import {handleQueueEnvelope,QUEUE_CLOSURE_REASONS,requireQueueEnvelopeMetadata} from '../lib/certification-queue-envelope.js';
import {QUEUE_TOPIC,QUEUE_CONTRACT,queueRetry} from '../lib/certification-queue-supervision.js';
import {queueDatabaseFailure} from '../lib/certification-queue-errors.js';
import {createQueueTimingEvidence,validateQueueTimingReceipt} from '../lib/certification-queue-timing-evidence.js';
const bound={resource:{resource_id:'CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51',project_ref:'trmcwrljjxwhgtikfdgu'},
 deployment:{deployment_id:'dpl_LocalRoutingClosure',deployment_class:'preview'}};
const message={version:QUEUE_CONTRACT,invocation_id:randomUUID()};
const verdict=(disposition,reason='CURRENT')=>({ok:true,identified:true,execution_authorized:false,invocation_id:message.invocation_id,disposition,reason});
function model({prefetched=false,count=9,horizon=5,payload=message,expiry=true}={}){
 const now=Date.now(),created=new Date(now-600000).toISOString(),expires=new Date(now+horizon*1000).toISOString();
 let deleted=false;const calls=[];
 const request=()=>new Request('https://synthetic.invalid/api/internal/derived-worker/queue',{method:'POST',headers:{
  'content-type':'application/json','ce-type':'com.vercel.queue.v2beta','ce-vqsqueuename':QUEUE_TOPIC,'ce-vqsconsumergroup':'synthetic',
  'ce-vqsmessageid':'msg_local','ce-vqsregion':'iad1',...(prefetched?{'ce-vqsreceipthandle':'synthetic_receipt',
   'ce-vqsdeliverycount':String(count),'ce-vqscreatedat':created,'ce-vqsexpiresat':expiry?expires:'',
   'ce-vqsvisibilitydeadline':new Date(now+1000).toISOString()}:{} )},body:prefetched?JSON.stringify(payload):undefined});
 const fetchImpl=async(url,init)=>{
  assert.equal(new URL(url).origin,'https://iad1.vercel-queue.com');
  assert.equal(new Headers(init.headers).get('Vqs-Deployment-Id'),bound.deployment.deployment_id);
  calls.push({method:init.method,visibility:new Headers(init.headers).get('Vqs-Visibility-Timeout-Seconds'),body:init.body});
  if(init.method==='POST'){
   if(deleted)return new Response(null,{status:410});
   return new Response(JSON.stringify({messageId:'msg_local',receiptHandle:'synthetic_receipt',deliveryCount:count,
    timestamp:created,expiresAt:expiry?expires:null,body:Buffer.from(JSON.stringify(payload)).toString('base64')})+'\n',
    {headers:{'content-type':'application/x-ndjson'}});
  }
  if(init.method==='DELETE'){deleted=true;return new Response(null,{status:204});}
  return Response.json({success:true});
 };
 return {request,fetchImpl,calls,created,expires};
}
for(const reason of QUEUE_CLOSURE_REASONS)for(const prefetched of [false,true])test(`${reason}: terminal denial closes trusted ${prefetched?'prefetched':'routing-only'} delivery despite delivery count/lifetime`,async()=>{
 const m=model({prefetched});let lookups=0,sdk=0;
 const response=await handleQueueEnvelope(m.request(),()=>{sdk++;assert.fail('must never start SDK worker timer');},{bound,
  fetchImpl:m.fetchImpl,getToken:async()=>'synthetic-local-only',control:async(op,input)=>{
   lookups++;assert.equal(op,'DISPOSITION');assert.deepEqual(input.message,message);assert.equal(input.provider_message_id,'msg_local');return verdict('ACK',reason);
  }});
 assert.equal(response.status,200);const value=await response.json();assert.equal(value.execution_authorized,false);assert.equal(value.transport_acknowledged,true);
 assert.equal(value.reason,reason);assert.equal(sdk,0);assert.equal(lookups,1);
 assert.deepEqual(m.calls.map(c=>c.method),prefetched?['DELETE']:['POST','POST','DELETE']);
 if(!prefetched){assert.equal(m.calls[0].visibility,'0');assert.equal((await handleQueueEnvelope(m.request(),()=>assert.fail(),{bound,
  fetchImpl:m.fetchImpl,getToken:async()=>'synthetic-local-only',control:()=>assert.fail('already removed')})).status,200);
  assert.equal(m.calls.filter(c=>c.method==='DELETE').length,1);}
});
test('eligible over-limit remains a visible poison/budget failure; eligible short lifetime remains execution-denied',async()=>{
 for(const config of [{count:6,horizon:540},{count:1,horizon:179}]){
  const m=model(config);let sdk=0;const response=await handleQueueEnvelope(m.request(),()=>sdk++,{bound,fetchImpl:m.fetchImpl,
   getToken:async()=>'synthetic',control:async()=>verdict('ELIGIBLE')});assert.equal(response.status,503);assert.equal(sdk,0);
  assert.equal((await response.json()).code,config.count>5?'SUPERVISOR_DELIVERY_LIMIT':'SUPERVISOR_MESSAGE_HORIZON_EXHAUSTED');
  assert.equal(m.calls.filter(c=>c.method==='DELETE'||c.method==='PATCH').length,0);
 }
});
test('missing/invalid expiry or malformed terminal claim cannot ACK an unidentified message',async()=>{
 for(const config of [{expiry:false},{payload:{...message,state:'STOPPED'}},{payload:{version:QUEUE_CONTRACT,invocation_id:'invalid'}}]){
  const m=model(config);let reads=0;const response=await handleQueueEnvelope(m.request(),()=>assert.fail(),{bound,
   fetchImpl:m.fetchImpl,getToken:async()=>'synthetic',control:()=>{reads++;assert.fail();}});
  assert.notEqual(response.status,200);assert.equal(reads,0);assert.equal(m.calls.filter(c=>c.method==='DELETE').length,0);
 }
});
test('untrusted canonical response, identity denial, or database failure never becomes terminal ACK',async()=>{
 for(const control of [async()=>verdict('ACK','client-selected'),async()=>({...verdict('ACK','STOPPED'),invocation_id:randomUUID()}),
  async()=>{throw Object.assign(new Error('wrong deployment'),{status:403});},
  async()=>{throw queueDatabaseFailure({status:400},{code:'21000',message:'programming'},'CONTROL_FAILURE','DISPOSITION');}]){
  const m=model();const response=await handleQueueEnvelope(m.request(),()=>assert.fail(),{bound,
   fetchImpl:m.fetchImpl,getToken:async()=>'synthetic',control});assert.notEqual(response.status,200);
  assert.equal(m.calls.filter(c=>c.method==='DELETE').length,0);
 }
});
test('UNKNOWN is retained and explicitly rescheduled, never ACKed even if STOP is concurrent',async()=>{
 const m=model({count:1,horizon:540});const response=await handleQueueEnvelope(m.request(),()=>assert.fail('no second BEGIN'),{bound,
  fetchImpl:m.fetchImpl,getToken:async()=>'synthetic',control:async()=>verdict('RECONCILE','UNKNOWN')});
 assert.equal(response.status,200);assert.equal((await response.json()).reconciliation_required,true);
 assert.deepEqual(m.calls.map(c=>c.method),['POST','POST','PATCH']);assert.equal(JSON.parse(m.calls[2].body).visibilityTimeoutSeconds,2);
 const exhausted=model({count:6,horizon:5});assert.equal((await handleQueueEnvelope(exhausted.request(),()=>assert.fail(),{bound,
  fetchImpl:exhausted.fetchImpl,getToken:async()=>'synthetic',control:async()=>verdict('RECONCILE','UNKNOWN')})).status,503);
 assert.equal(exhausted.calls.filter(c=>c.method==='DELETE').length,0);
});
test('lost/failed terminal DELETE cannot report a confirmed ACK',async()=>{
 const m=model();const response=await handleQueueEnvelope(m.request(),()=>assert.fail(),{bound,
  fetchImpl:async(url,init)=>init.method==='DELETE'?new Response(null,{status:500}):m.fetchImpl(url,init),
  getToken:async()=>'synthetic',control:async()=>verdict('ACK','STOPPED')});assert.equal(response.status,503);
 assert.equal((await response.json()).reconciliation_required,true);
});
test('terminal disposition receipt retains canonical denial with no execution success or credentials',async()=>{
 const m=model(),records=[],evidence=createQueueTimingEvidence({bound,emit:r=>records.push(r)});
 evidence.callback(m.request());await handleQueueEnvelope(m.request(),()=>assert.fail(),{bound,evidence,
  fetchImpl:m.fetchImpl,getToken:async()=>'synthetic',control:async()=>verdict('ACK','STOPPED')});
 for(const r of records)validateQueueTimingReceipt(r);
 const r=records.find(r=>r.event==='CANONICAL_DISPOSITION_RESPONSE');assert.equal(r.denial_reason.value,'STOPPED');
 assert.equal(r.execution_authorized.value,false);assert.equal(r.disposition.value,'ACK');
 assert.equal(/synthetic_receipt|Bearer|msg_local|sb_secret/.test(JSON.stringify(records)),false);
});
test('installed SDK still maps early/BUSY to bounded native visibility PATCH/200 without worker or attempt accounting',async t=>{
 const previous=globalThis.fetch;
 try{for(const [reason,seconds]of [['NOT_DUE',1],['BUSY',15]]){
  const m=model({prefetched:true,count:1,horizon:540});globalThis.fetch=m.fetchImpl;let workers=0;
  const client=new QueueClient({region:'iad1',deploymentId:bound.deployment.deployment_id,token:'synthetic-local-only',telemetry:{isEnabled:false}});
  const callback=client.handleCallback(async(payload,meta)=>{
   requireQueueEnvelopeMetadata(meta,payload);
   throw queueDatabaseFailure({status:400},{code:'PT409',message:'SUPERVISOR_NOT_DUE_OR_BUSY',
    details:JSON.stringify({reason,retry_after_seconds:seconds})},'CONTROL_FAILURE','BEGIN');
  },{visibilityTimeoutSeconds:90,retry:queueRetry});
  const response=await handleQueueEnvelope(m.request(),callback,{bound,fetchImpl:m.fetchImpl,getToken:async()=>'synthetic',
   control:async()=>verdict('ELIGIBLE')});assert.equal(response.status,200);assert.equal(workers,0);
  assert.deepEqual(m.calls.map(c=>c.method),['PATCH']);assert.equal(JSON.parse(m.calls[0].body).visibilityTimeoutSeconds,reason==='BUSY'?15:5);
 }}finally{globalThis.fetch=previous;}
});
test('SDK payload drift after trusted routing lookup fails delivery instead of ACKing an unidentified payload',async()=>{
 const previous=globalThis.fetch,m=model({count:1,horizon:540});let calls=0,worker=0;
 globalThis.fetch=async(url,init)=>{
  if(init.method==='POST'&&++calls===1)return m.fetchImpl(url,init);
  if(init.method==='POST')return new Response(`--synthetic\r\nContent-Type: application/json\r\nVqs-Message-Id: msg_local\r\nVqs-Receipt-Handle: synthetic_receipt\r\nVqs-Delivery-Count: 2\r\nVqs-Timestamp: ${m.created}\r\nVqs-Expires-At: ${m.expires}\r\n\r\n${JSON.stringify({...message,invocation_id:randomUUID()})}\r\n--synthetic--\r\n`,{headers:{'content-type':'multipart/mixed; boundary=synthetic'}});
  assert.fail('unidentified payload must not DELETE or PATCH');
 };
 try{
  const client=new QueueClient({region:'iad1',deploymentId:bound.deployment.deployment_id,token:'synthetic-local-only',telemetry:{isEnabled:false}});
  const callback=client.handleCallback(async(payload,meta)=>{requireQueueEnvelopeMetadata(meta,payload);worker++;},{visibilityTimeoutSeconds:90,retry:queueRetry});
  const r=await handleQueueEnvelope(m.request(),callback,{bound,getToken:async()=>'synthetic-local-only',control:async()=>verdict('ELIGIBLE')});
  assert.equal(r.status,500);assert.equal(worker,0);assert.equal(calls,2);
 }finally{globalThis.fetch=previous;}
});
