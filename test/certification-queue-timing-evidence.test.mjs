import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {channel} from 'node:diagnostics_channel';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {setImmediate as yieldTurn} from 'node:timers/promises';
import {execFileSync} from 'node:child_process';
import {QueueClient} from '@vercel/queue';
import {createQueueTimingEvidence,observeQueueTransport,validateQueueTimingReceipt,verifyQueueRetentionEvidence,verifyQueueVisibilityEvidence,EVIDENCE_PROVENANCE} from '../lib/certification-queue-timing-evidence.js';
import {queuePublicationTiming,requireQueueCallbackLifetime,QUEUE_TIMING as T} from '../lib/certification-queue-timing.js';
import {publishOwnerQueueBatch} from '../lib/certification-queue-publication.js';
import {QUEUE_TOPIC,QUEUE_CONTRACT} from '../lib/certification-queue-supervision.js';
import registration from '../config/certification-resource-registration.json' with {type:'json'};
const clock=Date.parse('2026-10-05T12:00:00Z');
const bound={resource:registration.registration,deployment:{...registration.registration,deployment_class:'preview',deployment_id:'dpl_SyntheticTimingEvidence',release_commit:'c'.repeat(40),deployment_origin:'https://synthetic.vercel.app'}};
const entry=(seconds=10)=>({message:{version:QUEUE_CONTRACT,invocation_id:randomUUID()},scheduled_at:new Date(clock+seconds*1000).toISOString(),
 expires_at:new Date(clock+(seconds+30)*1000).toISOString(),idempotency_key:'bagger-certification-'+randomUUID()+'-1'});
function fixture(){let time=clock,mono=0;const records=[];
 return {records,advance:ms=>{time+=ms;mono+=ms;},e:createQueueTimingEvidence({bound,now:()=>time,monotonic:()=>mono,emit:r=>records.push(r)})};}
function request(e,{created=clock,expires=clock+550_000,messageId='msg_synthetic_timing'}={}){
 return new Request(bound.deployment.deployment_origin+'/api/internal/derived-worker/queue',{method:'POST',headers:{
  'ce-type':'com.vercel.queue.v2beta','ce-vqsqueuename':QUEUE_TOPIC,'ce-vqsconsumergroup':'synthetic_consumer',
  'ce-vqsmessageid':messageId,'ce-vqsreceipthandle':'DO_NOT_LOG_RECEIPT_TOKEN','ce-vqsdeliverycount':'1','ce-vqsregion':'iad1',
  'ce-vqscreatedat':new Date(created).toISOString(),'ce-vqsexpiresat':new Date(expires).toISOString(),
  'ce-vqsvisibilitydeadline':new Date(created+300_000).toISOString(),'content-type':'application/json','authorization':'DO_NOT_LOG_CREDENTIAL'},body:JSON.stringify(e.message)});
}
function observed(f,e,expires=clock+550_000){f.e.publicationRequest(e,queuePublicationTiming(e,clock),clock);f.e.publicationResponse({messageId:'msg_synthetic_timing'});
 f.e.callback(request(e,{expires}));f.e.delivery(e.message,{messageId:'msg_synthetic_timing',createdAt:new Date(clock),expiresAt:new Date(expires)});
 return [f.records.find(r=>r.event==='PUBLICATION_REQUEST'),f.records.find(r=>r.event==='HANDLER_ENTERED'),f.records.find(r=>r.event==='PUBLICATION_RESPONSE')];}

test('provider expiration is actual delivery metadata; publication returns only an ID; every emitted field has explicit provenance',()=>{
 const f=fixture(),e=entry();const receipts=observed(f,e);
 assert.equal(verifyQueueRetentionEvidence(...receipts).status,'RETENTION_CONFIRMED');
 for(const r of f.records){validateQueueTimingReceipt(r);for(const [k,v]of Object.entries(r))if(!['contract','event','sequence'].includes(k))assert.ok(EVIDENCE_PROVENANCE.includes(v.provenance));}
 assert.equal(receipts[0].requested_expiration.provenance,'DERIVED');assert.equal(receipts[1].provider_expires_at.provenance,'PROVIDER_DELIVERY');
 assert.equal(receipts[2].expiration_returned.value,false);
});
test('sanitizer never emits payload, headers, claim/run tokens, provider IDs or arbitrary error text; schema rejects extra fields',()=>{
 const f=fixture(),e=entry();e.message.private_finance='DO_NOT_LOG_FINANCIAL';observed(f,e);
 f.e.control('FINISH',{run_token:'DO_NOT_LOG_RUN'}, {outcome:'DO_NOT_LOG_ERROR',secret:'DO_NOT_LOG_SECRET'});
 f.e.failed();const raw=JSON.stringify(f.records);assert.doesNotMatch(raw,/DO_NOT_LOG|private_finance|receiptHandle|msg_synthetic_timing|authorization/);
 assert.equal(f.e.write,undefined);
 assert.throws(()=>validateQueueTimingReceipt({...f.records[0],payload:{value:'secret',provenance:'BAGGER_REQUEST'}}),/SCHEMA_DENIED/);
 assert.throws(()=>validateQueueTimingReceipt({...f.records[0],requested_expiration:{value:f.records[0].requested_expiration.value,provenance:'PROVIDER_RESPONSE'}}),/SCHEMA_DENIED/);
});
test('tick 1, tick 60 and tick 120 record the unchanged finite delay+540 formula',()=>{
 for(const [tick,delay,ttl]of [[1,10,550],[60,3550,4090],[120,7150,7690]]){
  const f=fixture(),e=entry(delay);f.e.publicationRequest(e,queuePublicationTiming(e,clock),clock);
  const r=f.records[0];assert.equal(r.requested_delay_seconds.value,delay);assert.equal(r.requested_ttl_seconds.value,ttl);
  assert.equal(Date.parse(r.requested_expiration.value),Date.parse(e.scheduled_at)+540_000);validateQueueTimingReceipt(r);
 }
});
test('old retention necessarily fails a lawful 90-second renewal before 60-second termination; new survives it',()=>{
 // Exact 44784e8b formula: max(60, authorityExpiry-publication)=100.
 // S=publication+70, old expiry S+30 precedes the provider-driven first renewal near S+60.
 const old=fixture(),e=entry(70),oldTtl=Math.max(60,Math.ceil((Date.parse(e.expires_at)-clock)/1000)),oldExpiry=clock+oldTtl*1000;
 assert.equal(oldTtl,100);const oldProof=observed(old,e,oldExpiry);
 assert.equal(verifyQueueRetentionEvidence(...oldProof).status,'TTL_MISMATCH');
 assert.ok(clock+70_000+60_000+90_000>oldExpiry);
 const fresh=fixture();const newProof=observed(fresh,e,clock+610_000);
 assert.equal(verifyQueueRetentionEvidence(...newProof).status,'RETENTION_CONFIRMED');
 assert.ok(clock+70_000+60_000+90_000<clock+610_000);
});
test('absent provider expiry is unavailable; SDK 24h fallback never becomes provider evidence',()=>{
 const f=fixture(),e=entry(),req=request(e);req.headers.delete('ce-vqsexpiresat');
 f.e.publicationRequest(e,queuePublicationTiming(e,clock),clock);f.e.publicationResponse({messageId:'msg_synthetic_timing'});
 f.e.callback(req);f.e.delivery(e.message,{messageId:'msg_synthetic_timing',expiresAt:new Date(clock+86400_000)});
 assert.equal(f.records.at(-1).provider_expires_at.value,null);assert.equal(f.records.at(-1).sdk_expiry_matches_provider.value,false);
 assert.equal(verifyQueueRetentionEvidence(f.records[0],f.records.at(-1),f.records[1]).status,'EVIDENCE_UNAVAILABLE');
 assert.throws(()=>requireQueueCallbackLifetime(req,clock),/TIMING_UNAVAILABLE/);
});
test('provider clock duration is skew-independent; schedule comparison does not silently excuse short horizons',()=>{
 const f=fixture(),e=entry(),proof=observed(f,e);f.advance(30_000);
 assert.equal(verifyQueueRetentionEvidence(...proof).actualTtlSeconds,550);
 const delivery=structuredClone(proof[1]);for(const k of ['provider_created_at','provider_expires_at'])delivery[k].value=new Date(Date.parse(delivery[k].value)-25_000).toISOString();
 assert.equal(verifyQueueRetentionEvidence(proof[0],delivery,proof[2]).status,'CLOCK_REVIEW_REQUIRED');
 for(const k of ['provider_created_at','provider_expires_at'])delivery[k].value=new Date(Date.parse(delivery[k].value)-40_000).toISOString();
 assert.equal(verifyQueueRetentionEvidence(proof[0],delivery,proof[2]).status,'HORIZON_SHORT');
 const rounded=structuredClone(proof[1]);rounded.provider_expires_at.value=new Date(clock+549_000).toISOString();
 assert.equal(verifyQueueRetentionEvidence(proof[0],rounded,proof[2]).status,'RETENTION_CONFIRMED');
});
test('missing acceptance, wrong invocation/deployment/message cannot certify retention',()=>{
 const f=fixture(),proof=observed(f,entry());assert.equal(verifyQueueRetentionEvidence(proof[0],proof[1]).status,'PUBLICATION_ACK_UNAVAILABLE');
 for(const k of ['invocation_digest','deployment_id']){const bad=structuredClone(proof[1]);bad[k].value=k==='deployment_id'?'dpl_ForeignTiming':'f'.repeat(64);
  assert.equal(verifyQueueRetentionEvidence(proof[0],bad,proof[2]).status,'EVIDENCE_BINDING_DENIED');}
 const response=structuredClone(proof[2]);response.provider_message_digest.value='e'.repeat(64);
 assert.equal(verifyQueueRetentionEvidence(proof[0],proof[1],response).status,'PUBLICATION_ACK_UNAVAILABLE');
});
test('publication logging preserves partial/lost ACK uncertainty and cannot manufacture distributed atomicity',async()=>{
 const f=fixture(),e=entry();const calls=[];const owner=async(op,p)=>{calls.push([op,p]);return p?.action==='BATCH'?{binding:bound,messages:[e]}:{ok:true};};
 const result=await publishOwnerQueueBatch({owner,now:()=>clock,timingEvidence:f.e,send:async()=>{throw new Error('DO_NOT_LOG_PROVIDER_ERROR');}});
 assert.equal(result.results[0].outcome,'UNKNOWN');assert.deepEqual(f.records.map(r=>r.event),['PUBLICATION_REQUEST','PUBLICATION_UNKNOWN']);
 assert.equal(calls.some(([,p])=>p?.action==='ACK'),false);assert.doesNotMatch(JSON.stringify(f.records),/DO_NOT_LOG/);
});
test('fixed lease diagnostics record visibility request/response and ACK without logging URLs/handles/body/headers',async()=>{
 const f=fixture();observed(f,entry());
 await observeQueueTransport(f.e,async()=>{
  const r={origin:'https://iad1.vercel-queue.com',method:'PATCH',path:'/api/v3/topic/'+QUEUE_TOPIC+'/consumer/synthetic/lease/DO_NOT_LOG_HANDLE'};
  channel('undici:request:create').publish({request:r});
  channel('undici:request:bodyChunkSent').publish({request:r,chunk:Buffer.from('{"visibilityTimeoutSeconds":90}')});
  channel('undici:request:bodySent').publish({request:r});f.advance(100);
  channel('undici:request:headers').publish({request:r,response:{statusCode:200,headers:['authorization','DO_NOT_LOG']}});
  channel('undici:request:trailers').publish({request:r});
  const ack={...r,method:'DELETE'};channel('undici:request:create').publish({request:ack});f.advance(50);
  channel('undici:request:headers').publish({request:ack,response:{statusCode:204}});channel('undici:request:trailers').publish({request:ack});
 });
 const visibility=f.records.find(r=>r.event==='VISIBILITY_RESPONSE'),ack=f.records.find(r=>r.event==='ACK_RESPONSE');
 assert.equal(visibility.requested_visibility_seconds.value,90);assert.equal(visibility.provider_accepted.value,true);
 assert.equal(visibility.derived_deadline_upper_bound.provenance,'DERIVED');assert.equal(visibility.request_duration_ms.value,100);
 assert.equal(ack.provider_http_status.value,204);assert.equal(ack.provider_accepted.value,true);
 assert.doesNotMatch(JSON.stringify(f.records),/DO_NOT_LOG|visibilityTimeoutSeconds|https:/);f.records.forEach(validateQueueTimingReceipt);
});
test('network failure/rejected renewal are never successful ACKs; unsupported body diagnostics remain explicitly absent',async()=>{
 const f=fixture();await observeQueueTransport(f.e,async()=>{
  const r={origin:'https://iad1.vercel-queue.com',method:'PATCH',path:'/api/v3/topic/'+QUEUE_TOPIC+'/consumer/synthetic/lease/opaque'};
  channel('undici:request:create').publish({request:r});channel('undici:request:headers').publish({request:r,response:{statusCode:400}});
  channel('undici:request:trailers').publish({request:r});const ack={...r,method:'DELETE'};
  channel('undici:request:create').publish({request:ack});channel('undici:request:error').publish({request:ack,error:new Error('DO_NOT_LOG')});
 });
 assert.equal(f.records[0].requested_visibility_seconds.value,null);assert.equal(f.records[0].provider_accepted.value,false);
 assert.equal(f.records[1].response_completed.value,false);assert.equal(f.records[1].provider_accepted.value,false);
});
test('diagnostics are context-isolated, fixed-destination only, and passive if logging fails',async()=>{
 const a=fixture(),b=fixture();const r={origin:'https://iad1.vercel-queue.com',method:'DELETE',path:'/api/v3/topic/'+QUEUE_TOPIC+'/consumer/synthetic/lease/opaque'};
 await Promise.all([a,b].map(async f=>observeQueueTransport(f.e,async()=>{
  const req={...r};channel('undici:request:create').publish({request:req});await new Promise(setImmediate);
  channel('undici:request:headers').publish({request:req,response:{statusCode:204}});channel('undici:request:trailers').publish({request:req});
 })));
 assert.equal(a.records.length,1);assert.equal(b.records.length,1);
 await observeQueueTransport(a.e,async()=>{for(const req of [{...r,origin:'https://foreign.invalid'},{...r,path:'/rest/v1/rpc/private'},{...r,method:'POST'}])channel('undici:request:create').publish({request:req});});
 assert.equal(a.records.length,1);
 const silent=createQueueTimingEvidence({bound,emit:()=>{throw new Error('logger unavailable');}});assert.doesNotThrow(()=>silent.failed());
 for(const change of [{resource:{...bound.resource,resource_id:'PRODUCTION:foreign'}},{resource:{...bound.resource,project_ref:'foreign'}},{deployment:{...bound.deployment,deployment_class:'production'}}])
  assert.throws(()=>createQueueTimingEvidence({bound:{...bound,...change}}),/CONTEXT_DENIED/);
});
test('timelines bridge provider timestamps to retained natural lease/reclaim proof without exposing claims',async()=>{
 const retained=JSON.parse(await readFile('docs/reliability/phase2d-worker-supervision/retention/evidence/recovery-cases.json','utf8'));
 assert.equal(retained.claim.leaseSeconds,90);assert.equal(retained.termination.ceilingSeconds,60);
 assert.equal(retained.reclaim.naturalLeaseExpiry,true);assert.deepEqual(retained.reclaim.attempts,[1,2]);
 const f=fixture();observed(f,entry());f.e.control('BEGIN',{}, {admitted:true,run_token:'DO_NOT_LOG'});
 f.e.control('FAULT',{fault_operation:'WORKERS.COMPETITION_CLAIM'},{});f.advance(60_000);
 f.e.failed();f.advance(30_000);f.e.control('FINISH',{}, {outcome:'SUCCEEDED'});
 assert.equal(f.records.find(r=>r.event==='CANONICAL_FINISH_RESPONSE').elapsed_ms.value,90_000);
 assert.doesNotMatch(JSON.stringify(f.records),/DO_NOT_LOG/);
});
test('worker/claims/historical SQL/provider configuration remain byte-identical; timing constants and SDK remain pinned',async()=>{
 for(const file of ['lib/score-derived-worker.js','lib/score-derived-delivery.js','lib/certification-worker-supervision.js',
 'supabase/production_incremental/certification-queue-global-fault-v5.sql','vercel.certification-queue.json','vercel.json'])
  assert.equal(await readFile(file,'utf8'),execFileSync('git',['show','720857e17a39f088b86583a22f6722812a695147:'+file],{encoding:'utf8'}));
 assert.equal((await readFile('lib/certification-queue-timing.js','utf8')).split('const failure=')[0],
  execFileSync('git',['show','720857e17a39f088b86583a22f6722812a695147:lib/certification-queue-timing.js'],{encoding:'utf8'}).split('const failure=')[0]);
 assert.equal(JSON.parse(await readFile('package.json','utf8')).dependencies['@vercel/queue'],'0.7.0');
 const sdk=await readFile('node_modules/@vercel/queue/dist/index.d.ts','utf8');assert.match(sdk,/interface SendResult \{\s+messageId: string \| null;\s+\}/);
 assert.match(sdk,/interface MessageMetadata \{[^}]+createdAt: Date;[^}]+expiresAt: Date;/);
});

test('real Node fetch diagnostics expose the fixed SDK visibility JSON and completed HTTP ACK on loopback',async()=>{
 const f=fixture();observed(f,entry());
 const server=createServer((req,res)=>{req.resume();req.on('end',()=>{res.writeHead(req.method==='PATCH'?200:204);res.end();});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port,translated=new WeakMap(),subscriptions=[];
 // The test provider is loopback only. Translate solely origin for the passive
 // observer; all method/path/body/status/events come from native Node fetch.
 for(const name of ['create','bodyChunkSent','bodySent','headers','trailers','error']){
  const c=channel('undici:request:'+name),listener=event=>{
   if(String(event.request.origin)!==origin)return;
   if(name==='create')translated.set(event.request,{origin:'https://iad1.vercel-queue.com',path:event.request.path,method:event.request.method});
   const request=translated.get(event.request);if(request)c.publish({...event,request});
  };c.subscribe(listener);subscriptions.push([c,listener]);
 }
 try{await observeQueueTransport(f.e,async()=>{
  const url=origin+'/api/v3/topic/'+QUEUE_TOPIC+'/consumer/synthetic/lease/opaque';
  const response=await fetch(url,{method:'PATCH',body:JSON.stringify({visibilityTimeoutSeconds:90})});await response.text();
  const ack=await fetch(url,{method:'DELETE'});await ack.text();await yieldTurn();
 });
 assert.equal(f.records.find(r=>r.event==='VISIBILITY_RESPONSE').requested_visibility_seconds.value,90);
 assert.equal(f.records.find(r=>r.event==='ACK_RESPONSE').provider_http_status.value,204);
 assert.equal(f.records.find(r=>r.event==='ACK_RESPONSE').response_completed.value,true);
 }finally{for(const [c,l]of subscriptions)c.unsubscribe(l);await new Promise(r=>server.close(r));}
});

test('installed Queue SDK parser, automatic renewals and ACK produce sanitized evidence through the unmodified lifecycle',async t=>{
 const prior=globalThis.fetch,records=[],e=entry();t.mock.timers.enable({apis:['Date','setTimeout'],now:clock});
 const evidence=createQueueTimingEvidence({bound,now:Date.now,emit:r=>records.push(r)});
 let entered,release;const reached=new Promise(r=>entered=r),hold=new Promise(r=>release=r);
 globalThis.fetch=async(url,init)=>{
  const r={origin:new URL(url).origin,path:new URL(url).pathname,method:init.method};
  channel('undici:request:create').publish({request:r});
  if(init.body){channel('undici:request:bodyChunkSent').publish({request:r,chunk:Buffer.from(init.body)});channel('undici:request:bodySent').publish({request:r});}
  const status=init.method==='DELETE'?204:200;
  channel('undici:request:headers').publish({request:r,response:{statusCode:status}});channel('undici:request:trailers').publish({request:r});
  return status===204?new Response(null,{status}):Response.json({success:true});
 };
 try{
  const client=new QueueClient({region:'iad1',deploymentId:bound.deployment.deployment_id,token:'synthetic-only',telemetry:{isEnabled:false}});
  const consume=client.handleCallback(async(message,metadata)=>{evidence.delivery(message,metadata);entered();await hold;},{visibilityTimeoutSeconds:90});
  const req=request(e);evidence.callback(req);
  const pending=observeQueueTransport(evidence,()=>consume(req));await reached;
  await observeQueueTransport(evidence,async()=>{t.mock.timers.tick(59000);await yieldTurn();assert.equal(records.filter(r=>r.event==='VISIBILITY_RESPONSE').length,0);t.mock.timers.tick(1000);await yieldTurn();release();});
  const response=await pending;assert.equal(response.status,200);
  const renewals=records.filter(r=>r.event==='VISIBILITY_RESPONSE');assert.equal(renewals.length,1);
  assert.deepEqual(renewals.map(r=>r.requested_visibility_seconds.value),[90]);
  assert.ok(renewals.every(r=>r.provider_accepted.value&&r.expiry_margin_seconds.value>30));
  assert.equal(verifyQueueVisibilityEvidence(records,{requireRenewal:true}).status,'VISIBILITY_CONFIRMED');
  assert.equal(records.filter(r=>r.event==='ACK_RESPONSE').length,1);assert.ok(records.at(-1).provider_accepted.value);
  records.forEach(validateQueueTimingReceipt);assert.doesNotMatch(JSON.stringify(records),/synthetic-only|DO_NOT_LOG/);
 }finally{release?.();globalThis.fetch=prior;t.mock.timers.reset();}
});
