import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setImmediate as yieldTurn} from 'node:timers/promises';
import {QueueClient,parseCallback} from '@vercel/queue';
import {QUEUE_TIMING as T,queuePublicationTiming,requireQueueAttemptLifetime,requireQueueCallbackLifetime,handleBoundedQueueDelivery} from '../lib/certification-queue-timing.js';
import {queueRetry,QUEUE_CONTRACT,QUEUE_TOPIC} from '../lib/certification-queue-supervision.js';
import {publishOwnerQueueBatch} from '../lib/certification-queue-publication.js';
import registration from '../config/certification-resource-registration.json' with {type:'json'};
const clock=Date.parse('2026-10-05T12:00:00Z');
const entry=(scheduled=clock+10_000)=>({message:{version:QUEUE_CONTRACT,invocation_id:randomUUID()},
 scheduled_at:new Date(scheduled).toISOString(),expires_at:new Date(scheduled+30_000).toISOString(),
 idempotency_key:'bagger-certification-'+randomUUID()+'-1'});
const metadata=(lifetime=480)=>({createdAt:new Date(clock),expiresAt:new Date(clock+lifetime*1000)});
const request=(lifetime=480,visibility=90)=>new Request('https://synthetic.vercel.app/api/internal/derived-worker/queue',{
 method:'POST',headers:{'ce-type':'com.vercel.queue.v2beta','ce-vqsqueuename':QUEUE_TOPIC,'ce-vqsconsumergroup':'synthetic_consumer',
  'ce-vqsmessageid':'msg_synthetic','ce-vqsreceipthandle':'synthetic_receipt','ce-vqsdeliverycount':'1','ce-vqsregion':'iad1',
  'ce-vqscreatedat':new Date(clock).toISOString(),'ce-vqsexpiresat':new Date(clock+lifetime*1000).toISOString(),
  'ce-vqsvisibilitydeadline':new Date(clock+visibility*1000).toISOString(),'content-type':'application/json'},body:JSON.stringify(entry().message)});
test('bounded recovery graph rounds 510 seconds to the minimum whole-cadence 540-second horizon',()=>{
 const nextCadence=seconds=>Math.ceil(seconds/T.cadenceSeconds)*T.cadenceSeconds;
 const claimSettles=Math.max(T.reservationSeconds+T.functionSeconds+T.jobLeaseSeconds,T.reconcileSeconds);
 const sweepAvailable=nextCadence(claimSettles)+T.skewSeconds+T.functionSeconds+T.expiryBackoffSeconds;
 const horizon=nextCadence(sweepAvailable)+T.skewSeconds+T.functionSeconds+T.visibilitySeconds+T.skewSeconds;
 assert.equal(claimSettles,180);assert.equal(sweepAvailable,275);assert.equal(horizon,510);
 assert.equal(Math.ceil(horizon/T.cadenceSeconds)*T.cadenceSeconds,T.retentionHorizonSeconds);
 assert.equal(T.minimumAttemptLifetimeSeconds,T.functionSeconds+T.visibilitySeconds+T.skewSeconds);
});
test('120 delayed ticks fit a two-hour batch; TTL starts at publication and includes the full delivery delay',()=>{
 for(let sequence=0;sequence<120;sequence++){
  const scheduled=clock+10_000+sequence*60_000,e=entry(scheduled),p=queuePublicationTiming(e,clock);
  assert.equal(p.delaySeconds,10+sequence*60);assert.equal(p.retentionSeconds,p.delaySeconds+540);
  assert.equal(clock+p.retentionSeconds*1000,scheduled+540_000);
  assert.ok(p.retentionSeconds<=T.maximumRetentionSeconds);assert.ok(Date.parse(e.expires_at)<=clock+7200_000);
 }
 const last=queuePublicationTiming(entry(clock+7150_000),clock);assert.equal(last.retentionSeconds,7690);
});
test('too-short retention, excessive delay, malformed dates and authority expansion fail before send',()=>{
 const e=entry();for(const seconds of [60,89,90,479,489,549])assert.throws(()=>queuePublicationTiming(e,clock,seconds),/RETENTION_DENIED/);
 assert.throws(()=>queuePublicationTiming(entry(clock+7200_000),clock),/RETENTION_DENIED/);
 for(const value of [{...e,scheduled_at:'invalid'},{...e,expires_at:e.scheduled_at},
  {...e,expires_at:new Date(clock+40_001).toISOString()}])assert.throws(()=>queuePublicationTiming(value,clock),/TIMING_DENIED/);
 assert.equal(queuePublicationTiming(e,clock,550).retentionSeconds,550);
});
test('publication derives timing without extending SQL authority or changing finite/lost-ACK accounting',async()=>{
 const r=registration.registration,e=entry(),batch={binding:{resource:r,deployment:{vercel_team_id:r.vercel_team_id,vercel_project_id:r.vercel_project_id,
  git_branch:r.git_branch,deployment_class:'preview',deployment_id:'dpl_SyntheticTiming',release_commit:'c'.repeat(40),deployment_origin:'https://synthetic.vercel.app'}},messages:[e]};
 const calls=[];let sent=0;const owner=async(op,input)=>{calls.push([op,input]);return input?.action==='BATCH'?batch:{ok:true};};
 const result=await publishOwnerQueueBatch({owner,now:()=>clock,send:async(message,options)=>{
  sent++;assert.deepEqual(message,e.message);assert.equal(options.retentionSeconds,550);assert.equal(options.delaySeconds,10);
  assert.deepEqual(Object.keys(message).sort(),['invocation_id','version']);throw new Error('synthetic accepted, ACK lost');}});
 assert.equal(sent,1);assert.equal(result.results[0].outcome,'UNKNOWN');assert.equal(result.schedule_installed,false);
 assert.equal(calls.some(x=>x[1]?.action==='ACK'),false);assert.equal(Date.parse(e.expires_at),clock+40_000);
});
test('actual expiry is mandatory before SDK lease timers; near expiry admits no worker and no visibility request',async()=>{
 for(const seconds of [0,90,150,180])assert.throws(()=>requireQueueCallbackLifetime(request(seconds),clock),/HORIZON_EXHAUSTED|TIMING_UNAVAILABLE/);
 for(const missing of ['ce-vqsexpiresat','ce-vqscreatedat','ce-vqsreceipthandle']){
  const req=request();req.headers.delete(missing);assert.throws(()=>requireQueueCallbackLifetime(req,clock),/TIMING_UNAVAILABLE/);
 }
 assert.throws(()=>requireQueueCallbackLifetime(request(480,481),clock),/TIMING_UNAVAILABLE/);
 let calls=0;const req=request(179);
 const response=handleBoundedQueueDelivery(req,()=>{calls++;assert.fail('unsafe callback must not enter SDK');},clock);
 assert.equal(response.status,503);assert.equal((await response.json()).worker_admitted,false);
 assert.equal(calls,0);assert.equal(requireQueueAttemptLifetime(metadata(181),clock).maximumVisibilityDeadline,clock+150_000);
});
test('every lawful renewal inside the 60-second ceiling is below actual expiry, including the minimum lifetime boundary',()=>{
 for(const remaining of [181,240,480])for(let elapsed=0;elapsed<=60;elapsed++){
  const p=requireQueueAttemptLifetime(metadata(remaining),clock);
  const requested=clock+(elapsed+90)*1000;
  assert.ok(requested<p.expiresAt-30_000);assert.ok(requested<=p.maximumVisibilityDeadline);
 }
});
test('retry/backoff never requests visibility past actual expiry; deterministic denials remain ACKs',()=>{
 const error={queueDisposition:'RETRY'};
 // Use the actual clock for SDK retry decisions, independent of the fixed timing fixture.
 const live={expiresAt:new Date(Date.now()+480_000),deliveryCount:1};assert.deepEqual(queueRetry(error,live),{afterSeconds:2});
 for(let attempt=1;attempt<5;attempt++)assert.deepEqual(queueRetry(error,{...live,deliveryCount:attempt}),{afterSeconds:2**attempt});
 assert.equal(queueRetry(error,{expiresAt:new Date(Date.now()+31_000),deliveryCount:1}),undefined);
 assert.deepEqual(queueRetry({code:'SUPERVISOR_RESERVATION_DENIED',queueDisposition:'ACK'},live),{acknowledge:true});
 assert.equal(queueRetry(error,{...live,deliveryCount:5}),undefined);
});
test('pinned SDK 0.7.0 performs real parser/renewal/ACK lifecycle against a synthetic provider with no expiry violation',async t=>{
 // Only transport time is modeled. The separate owned-PG recovery case waits
 // the real 90-second job lease and real 60-second process ceiling.
 const priorFetch=globalThis.fetch,events=[];t.mock.timers.enable({apis:['Date','setTimeout'],now:clock});
 let release,entered;const reached=new Promise(r=>entered=r),hold=new Promise(r=>release=r);
 globalThis.fetch=async(url,init)=>{
  assert.equal(new URL(url).hostname,'iad1.vercel-queue.com');
  if(init.method==='PATCH'){
   const seconds=JSON.parse(init.body).visibilityTimeoutSeconds;const deadline=Date.now()+seconds*1000;
   assert.ok(deadline<clock+540_000,'provider expiration bounds every actual SDK renewal');events.push({kind:'renew',at:Date.now(),seconds,deadline});
  }else{assert.equal(init.method,'DELETE');events.push({kind:'ack',at:Date.now()});}
  return Response.json({success:true});
 };
 try{
  const client=new QueueClient({region:'iad1',deploymentId:'dpl_SyntheticTiming',token:'LOCAL_SYNTHETIC_NO_PROVIDER_AUTHORITY',telemetry:{isEnabled:false}});
  const callback=client.handleCallback(async(message,meta)=>{requireQueueAttemptLifetime(meta);entered();await hold;},
   {visibilityTimeoutSeconds:T.visibilitySeconds,retry:queueRetry});
  const req=request(540,300);const parsed=await parseCallback(req.clone());
  assert.equal(parsed.expiresAt,new Date(clock+540_000).toISOString());
  const response=handleBoundedQueueDelivery(req,callback);await reached;
  t.mock.timers.tick(59_000);await yieldTurn();assert.equal(events.length,0);
  t.mock.timers.tick(1_000);await yieldTurn();release();assert.equal((await response).status,200);
  assert.deepEqual(events.filter(x=>x.kind==='renew').map(x=>x.at-clock),[60_000]);
  assert.equal(events.at(-1).kind,'ack');assert.equal(events.at(-1).at-clock,60_000);
 }finally{globalThis.fetch=priorFetch;t.mock.timers.reset();release?.();}
});
