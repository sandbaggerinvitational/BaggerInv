// Certification-only, passive evidence. Never supplies worker authority or
// changes SDK requests. Do not enable VQS debug logging (it prints credentials).
import {createHash} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
import {channel} from 'node:diagnostics_channel';
import {performance} from 'node:perf_hooks';
import {QUEUE_TIMING} from './certification-queue-timing.js';

export const TIMING_RECEIPT='certification-queue-timing-evidence-v1';
export const EVIDENCE_PROVENANCE=Object.freeze(['BAGGER_REQUEST','PROVIDER_RESPONSE','PROVIDER_DELIVERY','SERVER_CLOCK_OBSERVATION','DERIVED']);
const hash=value=>typeof value==='string'&&value.length<=512?createHash('sha256').update(value).digest('hex'):null;
const date=value=>{const n=value instanceof Date?value.getTime():typeof value==='string'?Date.parse(value):NaN;
 return Number.isFinite(n)?new Date(n).toISOString():null;};
const fact=(value,provenance)=>({value,provenance});
const contexts=new AsyncLocalStorage(),requests=new WeakMap();
const knownOutcome=new Set(['SUCCEEDED','FAILED','STOPPED','UNKNOWN','JOB_RETRY','TERMINAL','NOT_STARTED','NOT_COMMITTED','COMMITTED']);

export function createQueueTimingEvidence({bound,emit=value=>console.info(JSON.stringify(value)),now=Date.now,monotonic=()=>performance.now()}={}) {
 if(bound?.resource?.resource_id!=='CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51'||
  bound.resource.project_ref!=='trmcwrljjxwhgtikfdgu'||bound.deployment?.deployment_class!=='preview'||
  !/^dpl_[A-Za-z0-9_-]{8,128}$/.test(bound.deployment.deployment_id||''))throw new Error('SUPERVISOR_TIMING_EVIDENCE_CONTEXT_DENIED');
 let sequence=0,invocationDigest=null,messageDigest=null,created=null,expiry=null,timingProvenance='PROVIDER_DELIVERY';
 const started=monotonic();
 const write=(event,fields={})=>{
  // Builders below have fixed fields. No spread of caller/provider payloads,
  // headers, errors or control results. Observability failure cannot affect ACK.
  if(sequence>=512)return;
  const receipt={contract:TIMING_RECEIPT,event,sequence:++sequence,
   deployment_id:fact(bound.deployment.deployment_id,'DERIVED'),
   invocation_digest:fact(invocationDigest,'DERIVED'),provider_message_digest:fact(messageDigest,'DERIVED'),
   observed_at:fact(new Date(now()).toISOString(),'SERVER_CLOCK_OBSERVATION'),
   elapsed_ms:fact(Math.max(0,Math.round(monotonic()-started)),'SERVER_CLOCK_OBSERVATION'),...fields};
  try{emit(receipt);}catch{/* Passive evidence only. */}
  return receipt;
 };
 return {
  now,monotonic,
  publicationRequest(entry,timing,calculatedAt){
   invocationDigest=hash(entry.message.invocation_id);messageDigest=null;
   return write('PUBLICATION_REQUEST',{
    scheduled_at:fact(date(entry.scheduled_at),'DERIVED'),authority_expires_at:fact(date(entry.expires_at),'DERIVED'),
    timing_calculated_at:fact(new Date(calculatedAt).toISOString(),'SERVER_CLOCK_OBSERVATION'),
    requested_delay_seconds:fact(timing.delaySeconds,'BAGGER_REQUEST'),requested_ttl_seconds:fact(timing.retentionSeconds,'BAGGER_REQUEST'),
    requested_expiration:fact(new Date(now()+timing.retentionSeconds*1000).toISOString(),'DERIVED')});
  },
  publicationResponse(result){messageDigest=hash(result?.messageId);return write('PUBLICATION_RESPONSE',{
   message_id_returned:fact(messageDigest!==null,'PROVIDER_RESPONSE'),
   expiration_returned:fact(false,'PROVIDER_RESPONSE')});},
  publicationUnknown(){return write('PUBLICATION_UNKNOWN');},
  callback(request){
   timingProvenance='PROVIDER_DELIVERY';
   const h=request.headers;messageDigest=hash(h.get('ce-vqsmessageid'));expiry=date(h.get('ce-vqsexpiresat'));
   created=date(h.get('ce-vqscreatedat'));const visibility=date(h.get('ce-vqsvisibilitydeadline'));
   return write('PROVIDER_CALLBACK',{
    provider_created_at:fact(created,'PROVIDER_DELIVERY'),provider_expires_at:fact(expiry,'PROVIDER_DELIVERY'),
    provider_visibility_deadline:fact(visibility,'PROVIDER_DELIVERY'),
    provider_delivery_count:fact(/^\d{1,3}$/.test(h.get('ce-vqsdeliverycount')||'')?Number(h.get('ce-vqsdeliverycount')):null,'PROVIDER_DELIVERY'),
    actual_timing_available:fact(Boolean(created&&expiry),'DERIVED'),
    remaining_transport_seconds:fact(expiry?Math.floor((Date.parse(expiry)-now())/1000):null,'DERIVED'),
    configured_visibility_seconds:fact(QUEUE_TIMING.visibilitySeconds,'BAGGER_REQUEST')});
  },
  lookup(metadata){
   messageDigest=hash(metadata?.messageId);created=date(metadata?.createdAt);expiry=date(metadata?.expiresAt);
   timingProvenance='PROVIDER_RESPONSE';
   return write('PROVIDER_LOOKUP',{
    provider_created_at:fact(created,timingProvenance),provider_expires_at:fact(expiry,timingProvenance),
    actual_timing_available:fact(Boolean(created&&expiry),'DERIVED')});
  },
  delivery(message,metadata){
   invocationDigest=hash(message?.invocation_id);messageDigest=hash(metadata?.messageId);
   // SDK 0.7.0 can synthesize expiresAt = createdAt+24h. Raw callback expiry
   // above is the evidence source; never relabel that fallback as provider data.
   return write('HANDLER_ENTERED',{
    provider_created_at:fact(created,timingProvenance),provider_expires_at:fact(expiry,timingProvenance),
    sdk_expiry_matches_provider:fact(Boolean(expiry&&date(metadata?.expiresAt)===expiry),'DERIVED')});
  },
  control(operation,payload,value){
   if(operation==='BEGIN')write('CANONICAL_BEGIN_RESPONSE',{
    admitted:fact(typeof value?.admitted==='boolean'?value.admitted:null,'DERIVED'),outcome:fact(knownOutcome.has(value?.outcome)?value.outcome:null,'DERIVED')});
   if(operation==='FAULT'&&/CLAIM$/.test(payload?.fault_operation||''))write('CLAIM_ACCOUNTING_RESPONSE');
   if(operation==='FINISH')write('CANONICAL_FINISH_RESPONSE',{outcome:fact(knownOutcome.has(value?.outcome)?value.outcome:null,'DERIVED')});
  },
  failed(){write('HANDLER_REJECTED');},
  visibility(seconds,start,status,completed,elapsed){
   const requested=Number.isSafeInteger(seconds)&&seconds>=0&&seconds<=3600?seconds:null;
   write('VISIBILITY_RESPONSE',{
    requested_visibility_seconds:fact(requested,'BAGGER_REQUEST'),request_observed_at:fact(new Date(start).toISOString(),'SERVER_CLOCK_OBSERVATION'),
    derived_requested_deadline:fact(requested===null?null:new Date(start+requested*1000).toISOString(),'DERIVED'),
    derived_deadline_upper_bound:fact(requested===null||!completed?null:new Date(now()+requested*1000).toISOString(),'DERIVED'),
    provider_http_status:fact(status,'PROVIDER_RESPONSE'),response_completed:fact(completed,'SERVER_CLOCK_OBSERVATION'),
    provider_accepted:fact(completed&&status>=200&&status<300,'DERIVED'),request_duration_ms:fact(Math.round(elapsed),'SERVER_CLOCK_OBSERVATION'),
    expiry_margin_seconds:fact(expiry&&requested!==null?Math.floor((Date.parse(expiry)-now())/1000)-requested:null,'DERIVED')});
  },
  ack(start,status,completed,elapsed){write('ACK_RESPONSE',{
   request_observed_at:fact(new Date(start).toISOString(),'SERVER_CLOCK_OBSERVATION'),provider_http_status:fact(status,'PROVIDER_RESPONSE'),
   response_completed:fact(completed,'SERVER_CLOCK_OBSERVATION'),provider_accepted:fact(completed&&status>=200&&status<300,'DERIVED'),
   request_duration_ms:fact(Math.round(elapsed),'SERVER_CLOCK_OBSERVATION')});}
 };
}

// Native Undici diagnostics, not a global fetch patch or SDK-private override.
// Scope by AsyncLocalStorage AND the fixed Queue lease API. Never read headers,
// response bodies, lease handles or worker/database request bodies.
export function observeQueueTransport(observer,fn){return contexts.run({observer},fn);}
export function currentQueueTimingEvidence(){return contexts.getStore()?.observer;}
const subscribe=(name,fn)=>channel(name).subscribe(value=>{try{fn(value);}catch{/* never throw into Undici */}});
subscribe('undici:request:create',({request})=>{
 const observer=contexts.getStore()?.observer;
 if(!observer||String(request.origin)!=='https://iad1.vercel-queue.com'||
  !/^\/api\/v3\/topic\/bagger-certification-derived-wake-v2\/consumer\/[^/?]+\/lease\/[^/?]+$/.test(request.path)||
  !['PATCH','DELETE'].includes(request.method))return;
 requests.set(request,{observer,method:request.method,start:observer.now(),mono:observer.monotonic(),chunks:[],bytes:0,status:null});
});
subscribe('undici:request:bodyChunkSent',({request,chunk})=>{
 const r=requests.get(request);if(!r||r.method!=='PATCH'||r.bytes>128)return;
 const b=Buffer.from(chunk);r.bytes+=b.length;if(r.bytes<=128)r.chunks.push(b);
});
subscribe('undici:request:bodySent',({request})=>{
 const r=requests.get(request);if(!r||r.method!=='PATCH')return;
 try{const body=JSON.parse(Buffer.concat(r.chunks).toString());
  if(Object.keys(body).length===1&&Number.isSafeInteger(body.visibilityTimeoutSeconds))r.seconds=body.visibilityTimeoutSeconds;
 }catch{/* Runtime did not expose body chunks: explicitly unavailable. */}
 r.chunks=[];
});
subscribe('undici:request:headers',({request,response})=>{const r=requests.get(request);if(r)r.status=response.statusCode;});
const complete=(request,completed)=>{
 const r=requests.get(request);if(!r)return;requests.delete(request);
 const elapsed=r.observer.monotonic()-r.mono;
 if(r.method==='PATCH')r.observer.visibility(r.seconds,r.start,r.status,completed,elapsed);
 else r.observer.ack(r.start,r.status,completed,elapsed);
};
subscribe('undici:request:trailers',({request})=>complete(request,true));
subscribe('undici:request:error',({request})=>complete(request,false));

export function verifyQueueRetentionEvidence(publication,delivery,providerResponse){
 // Both provider timestamps share one provider clock. Their difference proves
 // accepted TTL without assuming publisher/consumer clocks agree.
 const value=(r,k)=>r?.[k]?.value;
 if(publication?.contract!==TIMING_RECEIPT||delivery?.contract!==TIMING_RECEIPT||
  publication.event!=='PUBLICATION_REQUEST'||delivery.event!=='HANDLER_ENTERED'||
  !/^[0-9a-f]{64}$/.test(value(publication,'invocation_digest')||'')||
  value(publication,'invocation_digest')!==value(delivery,'invocation_digest')||
  value(publication,'deployment_id')!==value(delivery,'deployment_id')||
  !['PROVIDER_DELIVERY','PROVIDER_RESPONSE'].includes(delivery.provider_created_at?.provenance)||
  delivery.provider_expires_at?.provenance!==delivery.provider_created_at?.provenance)
  return {status:'EVIDENCE_BINDING_DENIED'};
 if(providerResponse?.event!=='PUBLICATION_RESPONSE'||providerResponse.contract!==TIMING_RECEIPT||
  value(providerResponse,'invocation_digest')!==value(publication,'invocation_digest')||
  value(providerResponse,'deployment_id')!==value(delivery,'deployment_id')||
  !/^[0-9a-f]{64}$/.test(value(delivery,'provider_message_digest')||'')||
  value(providerResponse,'provider_message_digest')!==value(delivery,'provider_message_digest'))
  return {status:'PUBLICATION_ACK_UNAVAILABLE'};
 const scheduled=Date.parse(value(publication,'scheduled_at')),created=Date.parse(value(delivery,'provider_created_at')),
  expires=Date.parse(value(delivery,'provider_expires_at')),ttl=value(publication,'requested_ttl_seconds');
 if(![scheduled,created,expires,ttl].every(Number.isFinite)||expires<=created)return {status:'EVIDENCE_UNAVAILABLE'};
 if(value(publication,'requested_ttl_seconds')!==value(publication,'requested_delay_seconds')+QUEUE_TIMING.retentionHorizonSeconds||
  publication.requested_ttl_seconds?.provenance!=='BAGGER_REQUEST'||publication.scheduled_at?.provenance!=='DERIVED'||
  value(delivery,'sdk_expiry_matches_provider')!==true)return {status:'EVIDENCE_CONTRACT_DENIED'};
 const actualTtl=(expires-created)/1000,postSchedule=(expires-scheduled)/1000,
  difference=actualTtl-ttl;
 if(Math.abs(difference)>2)return {status:'TTL_MISMATCH',actualTtlSeconds:actualTtl,requestedTtlSeconds:ttl};
 if(postSchedule<QUEUE_TIMING.retentionHorizonSeconds-2)return {status:
  postSchedule>=QUEUE_TIMING.retentionHorizonSeconds-QUEUE_TIMING.skewSeconds-2?'CLOCK_REVIEW_REQUIRED':'HORIZON_SHORT',
  actualTtlSeconds:actualTtl,postScheduleSeconds:postSchedule};
 return {status:'RETENTION_CONFIRMED',actualTtlSeconds:actualTtl,postScheduleSeconds:postSchedule,
  timestampToleranceSeconds:2,clockSkewReviewSeconds:QUEUE_TIMING.skewSeconds};
}

const receiptFields=Object.freeze({
 DERIVED:['deployment_id','invocation_digest','provider_message_digest','scheduled_at','authority_expires_at','requested_expiration',
  'actual_timing_available','remaining_transport_seconds','sdk_expiry_matches_provider','admitted','outcome','derived_requested_deadline',
  'derived_deadline_upper_bound','provider_accepted','expiry_margin_seconds'],
 BAGGER_REQUEST:['requested_delay_seconds','requested_ttl_seconds','configured_visibility_seconds','requested_visibility_seconds'],
 PROVIDER_RESPONSE:['message_id_returned','expiration_returned','provider_http_status','provider_created_at','provider_expires_at'],
 PROVIDER_DELIVERY:['provider_created_at','provider_expires_at','provider_visibility_deadline','provider_delivery_count'],
 SERVER_CLOCK_OBSERVATION:['observed_at','elapsed_ms','timing_calculated_at','request_observed_at','response_completed','request_duration_ms'],
});
const events=new Set(['PUBLICATION_REQUEST','PUBLICATION_RESPONSE','PUBLICATION_UNKNOWN','PROVIDER_CALLBACK','PROVIDER_LOOKUP','HANDLER_ENTERED',
 'CANONICAL_BEGIN_RESPONSE','CLAIM_ACCOUNTING_RESPONSE','CANONICAL_FINISH_RESPONSE','HANDLER_REJECTED','VISIBILITY_RESPONSE','ACK_RESPONSE']);
export function validateQueueTimingReceipt(receipt){
 const denied=()=>{throw new Error('TIMING_RECEIPT_SCHEMA_DENIED');};
 if(!receipt||receipt.contract!==TIMING_RECEIPT||!events.has(receipt.event)||!Number.isSafeInteger(receipt.sequence)||receipt.sequence<1||receipt.sequence>512)denied();
 for(const [key,f]of Object.entries(receipt)){
  if(['contract','event','sequence'].includes(key))continue;
  if(!f||Object.keys(f).length!==2||!Object.hasOwn(f,'value')||!receiptFields[f.provenance]?.includes(key))denied();
  const v=f.value;if(v===null)continue;
  if(key.endsWith('_digest')){if(!/^[0-9a-f]{64}$/.test(v))denied();}
  else if(key==='deployment_id'){if(!/^dpl_[A-Za-z0-9_-]{8,128}$/.test(v))denied();}
  else if(key==='outcome'){if(!knownOutcome.has(v))denied();}
  else if(key.endsWith('_at')||key.includes('deadline')||key==='requested_expiration'){if(typeof v!=='string'||date(v)!==v)denied();}
  else if(['message_id_returned','expiration_returned','actual_timing_available','sdk_expiry_matches_provider','admitted','provider_accepted','response_completed'].includes(key)){
   if(typeof v!=='boolean')denied();
  }else if(typeof v!=='number'||!Number.isSafeInteger(v)||Math.abs(v)>1e9)denied();
 }
 if(!receipt.deployment_id||!receipt.observed_at||!receipt.elapsed_ms||!receipt.invocation_digest||!receipt.provider_message_digest)denied();
 return receipt;
}

// Offline acceptance, not a fixed renewal count/schedule. Short successful ticks
// need no renewal. A retained termination proof requires >=1 accepted request.
export function verifyQueueVisibilityEvidence(receipts,{requireRenewal=false}={}){
 const value=(r,k)=>r?.[k]?.value,errors=[];let accepted=0,retries=0,requests=0,initial=0;
 for(const r of receipts)validateQueueTimingReceipt(r);
 for(const r of receipts){
  if(r.event==='PROVIDER_CALLBACK'&&value(r,'provider_visibility_deadline')){
   const deadline=Date.parse(value(r,'provider_visibility_deadline')),expiry=Date.parse(value(r,'provider_expires_at'));
   initial++;if(!Number.isFinite(expiry)||deadline>=expiry)errors.push('INITIAL_VISIBILITY_OUTSIDE_EXPIRY');
  }
  if(r.event!=='VISIBILITY_RESPONSE')continue;requests++;
  const source=receipts.find(p=>['PROVIDER_CALLBACK','PROVIDER_LOOKUP'].includes(p.event)&&
   value(p,'provider_message_digest')===value(r,'provider_message_digest')&&value(p,'deployment_id')===value(r,'deployment_id')&&
   value(p,'provider_expires_at'));
  const expiry=Date.parse(value(source,'provider_expires_at')),requested=Date.parse(value(r,'derived_requested_deadline')),
   upper=Date.parse(value(r,'derived_deadline_upper_bound'));
  if(!Number.isFinite(expiry)||!Number.isFinite(requested)||requested>=expiry)errors.push('VISIBILITY_REQUEST_OUTSIDE_EXPIRY');
  if(value(r,'provider_accepted')===true){
   if(!Number.isFinite(upper)||upper>=expiry||value(r,'response_completed')!==true)errors.push('ACCEPTED_VISIBILITY_UNPROVEN');
   else if(value(r,'requested_visibility_seconds')===QUEUE_TIMING.visibilitySeconds)accepted++;
   else retries++;
  }else errors.push('VISIBILITY_NOT_ACCEPTED');
 }
 if(requireRenewal&&accepted===0)errors.push('ACCEPTED_RENEWAL_REQUIRED');
 return {status:errors.length?'VISIBILITY_INCOMPLETE':'VISIBILITY_CONFIRMED',initialDeadlines:initial,
  requests,acceptedRenewals:accepted,acceptedRetryDirectives:retries,errors:[...new Set(errors)],fixedRenewalScheduleRequired:false};
}
