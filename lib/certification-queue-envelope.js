import {isModelDRegistrationEnvelope} from './canonical-resource-registration.js';
// Private native callback envelope only. This is transport preflight, never
// worker/reservation authority. No publisher, arbitrary destination or proxy.
import {getVercelOidcToken} from '@vercel/oidc';
import {AsyncLocalStorage} from 'node:async_hooks';
import {QUEUE_TOPIC,parseQueueMessage} from './certification-queue-supervision.js';
import {QUEUE_TIMING,requireQueueAttemptLifetime,requireQueueCallbackLifetime} from './certification-queue-timing.js';
import {queueDeliveryRetry} from './certification-queue-errors.js';
const failed=code=>Object.assign(new Error(code),{code,status:503});
const visibleFailures=new Set(['SUPERVISOR_DELIVERY_LIMIT','SUPERVISOR_MESSAGE_HORIZON_EXHAUSTED',
 'SUPERVISOR_ACK_UNKNOWN','SUPERVISOR_TERMINAL_ACK_UNCONFIRMED','SUPERVISOR_TERMINAL_RECEIPT_UNAVAILABLE',
 'SUPERVISOR_RECONCILIATION_RETRY_UNCONFIRMED']);
const attempts=new AsyncLocalStorage();
export const QUEUE_CLOSURE_REASONS=Object.freeze(['STOPPED','CANCELLED','EXPIRED','STALE_EPOCH','STALE_CONTEXT','REPLAY','HALTED','ADMISSION_DENIED']);
const envelopeDenied=()=>{throw Object.assign(new Error('SUPERVISOR_DELIVERY_DENIED'),{code:'SUPERVISOR_DELIVERY_DENIED',status:403});};
export function queueCallbackEnvelope(request){
 const h=request.headers,group=h.get('ce-vqsconsumergroup'),id=h.get('ce-vqsmessageid');
 // Consumer group is provider routing metadata on the private trigger, not an
 // application/client selector. Region/topic/destination are fixed here.
 if(request.method!=='POST'||h.get('ce-type')!=='com.vercel.queue.v2beta'||
  h.get('ce-vqsqueuename')!==QUEUE_TOPIC||![null,'iad1'].includes(h.get('ce-vqsregion'))||
  !/^[A-Za-z0-9_-]{1,256}$/.test(group||'')||!id||id.length>512)envelopeDenied();
 return {group,id,prefetched:Boolean(h.get('ce-vqsreceipthandle'))};
}
async function boundedText(response){
 const reader=response.body?.getReader();if(!reader)throw failed('SUPERVISOR_MESSAGE_TIMING_UNAVAILABLE');
 let bytes=0;const chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;
  if(bytes>8192)throw failed('SUPERVISOR_MESSAGE_TIMING_UNAVAILABLE');chunks.push(Buffer.from(value));}}
 finally{await reader.cancel().catch(()=>{});}
 return Buffer.concat(chunks).toString('utf8');
}
async function dispositionReceipt(request,metadata,options){
 const envelope=queueCallbackEnvelope(request);
 if(envelope.prefetched)return metadata.receiptHandle;
 // A zero-second peek does not hold a live lease. Only after canonical
 // disposition is known may this fixed receive acquire a short transport
 // lease for ACK/reconciliation. It never admits a worker or renews visibility.
 const seconds=Math.min(5,Math.floor((Date.parse(metadata.expiresAt)-(options.now||Date.now)())/1000)-1);
 if(seconds<1)throw failed('SUPERVISOR_TERMINAL_RECEIPT_UNAVAILABLE');
 const response=await(options.fetchImpl||fetch)(`https://iad1.vercel-queue.com/api/v3/topic/${QUEUE_TOPIC}/consumer/${encodeURIComponent(envelope.group)}/id/${encodeURIComponent(envelope.id)}`,{
  method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(5000),headers:{
   authorization:`Bearer ${await(options.getToken||getVercelOidcToken)()}`,accept:'application/x-ndjson',
   'Vqs-Deployment-Id':options.bound.deployment.deployment_id,'Vqs-Visibility-Timeout-Seconds':String(seconds)}});
 if(!response.ok||!response.headers.get('content-type')?.startsWith('application/x-ndjson')){
  await response.body?.cancel();throw failed('SUPERVISOR_TERMINAL_RECEIPT_UNAVAILABLE');}
 let value;try{value=JSON.parse((await boundedText(response)).trim());}catch{throw failed('SUPERVISOR_MESSAGE_TIMING_UNAVAILABLE');}
 if(value?.messageId!==metadata.messageId||Date.parse(value.timestamp)!==Date.parse(metadata.createdAt)||
  Date.parse(value.expiresAt)!==Date.parse(metadata.expiresAt)||typeof value.body!=='string'||value.body.length>6000||
  parseQueueMessage(JSON.parse(Buffer.from(value.body,'base64').toString('utf8'))).invocation_id!==metadata.message.invocation_id)
  throw failed('SUPERVISOR_MESSAGE_TIMING_UNAVAILABLE');
 return value.receiptHandle;
}
function requireIdentificationTiming(metadata,now){
 const created=Date.parse(metadata.createdAt),expires=Date.parse(metadata.expiresAt);
 if(!Number.isFinite(created)||!Number.isFinite(expires)||expires<=created||
  created>now+QUEUE_TIMING.skewSeconds*1000||expires-created>QUEUE_TIMING.maximumRetentionSeconds*1000||
  !Number.isSafeInteger(metadata.deliveryCount)||metadata.deliveryCount<1)
  throw failed('SUPERVISOR_MESSAGE_TIMING_UNAVAILABLE');
 // Actual expiry is mandatory. Remaining lifetime is an execution guard,
 // not permission to close a canonically terminal message.
}
export async function preflightQueueCallback(request,{bound,now=Date.now,fetchImpl=fetch,getToken=getVercelOidcToken,evidence}={}){
 const envelope=queueCallbackEnvelope(request);
 // Routing-only notifications are a normal SDK retry path. The supported
 // ReceiveMessageById API accepts visibility=0 (peek, no lease/extension).
 // Learn actual immutable expiry before the SDK receives with visibility=90.
 if((!isModelDRegistrationEnvelope(bound)&&(bound?.resource?.resource_id!=='CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51'||
  bound.resource.project_ref!=='trmcwrljjxwhgtikfdgu'))||bound.deployment?.deployment_class!=='preview'||
  !/^dpl_[A-Za-z0-9_-]{8,128}$/.test(bound.deployment.deployment_id||''))envelopeDenied();
 if(envelope.prefetched){
  const metadata={messageId:envelope.id,createdAt:request.headers.get('ce-vqscreatedat'),
   expiresAt:request.headers.get('ce-vqsexpiresat'),deliveryCount:Number(request.headers.get('ce-vqsdeliverycount')),
   receiptHandle:request.headers.get('ce-vqsreceipthandle')};
  requireIdentificationTiming(metadata,now());
  const visibility=request.headers.get('ce-vqsvisibilitydeadline');
  if(visibility&&(!Number.isFinite(Date.parse(visibility))||Date.parse(visibility)>Date.parse(metadata.expiresAt)))
   throw failed('SUPERVISOR_MESSAGE_TIMING_UNAVAILABLE');
  metadata.message=parseQueueMessage(JSON.parse(await boundedText(new Response(request.clone().body))));
  return metadata;
 }
 const response=await fetchImpl(`https://iad1.vercel-queue.com/api/v3/topic/${QUEUE_TOPIC}/consumer/${encodeURIComponent(envelope.group)}/id/${encodeURIComponent(envelope.id)}`,{
  method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(5000),headers:{
   authorization:`Bearer ${await getToken()}`,accept:'application/x-ndjson',
   'Vqs-Deployment-Id':bound.deployment.deployment_id,'Vqs-Visibility-Timeout-Seconds':'0'}});
 // Same supported SDK skipped-notification semantics; no message ACK/delete
 // and no worker. A locked message still belongs to its existing consumer.
 if([404,409,410].includes(response.status)){await response.body?.cancel();
  return Response.json({status:'skipped',reason:response.status===409?'message_locked':'message_unavailable'});}
 if(!response.ok){await response.body?.cancel();throw failed('SUPERVISOR_QUEUE_LOOKUP_UNAVAILABLE');}
 if(!response.headers.get('content-type')?.startsWith('application/x-ndjson')){
  await response.body?.cancel();throw failed('SUPERVISOR_MESSAGE_TIMING_UNAVAILABLE');}
 let message;try{message=JSON.parse((await boundedText(response)).trim());}catch{throw failed('SUPERVISOR_MESSAGE_TIMING_UNAVAILABLE');}
 if(message?.messageId!==envelope.id||!Number.isSafeInteger(message.deliveryCount)||message.deliveryCount<1)
  throw failed('SUPERVISOR_MESSAGE_TIMING_UNAVAILABLE');
 const metadata={messageId:message.messageId,createdAt:message.timestamp,expiresAt:message.expiresAt,deliveryCount:message.deliveryCount,
  receiptHandle:message.receiptHandle};
 requireIdentificationTiming(metadata,now());
 if(typeof message.body!=='string'||message.body.length>6000||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(message.body))
  throw failed('SUPERVISOR_MESSAGE_TIMING_UNAVAILABLE');
 metadata.message=parseQueueMessage(JSON.parse(Buffer.from(message.body,'base64').toString('utf8')));
 evidence?.lookup(metadata);
 return metadata;
}
export function requireQueueEnvelopeMetadata(metadata,message){
 const expected=attempts.getStore();
 const timestamp=value=>value instanceof Date?value.getTime():Date.parse(value);
 if(!expected||metadata?.messageId!==expected.messageId||
  timestamp(metadata.createdAt)!==timestamp(expected.createdAt)||timestamp(metadata.expiresAt)!==timestamp(expected.expiresAt))
  throw failed('SUPERVISOR_MESSAGE_TIMING_UNAVAILABLE');
 if(message!==undefined){
  let parsed;try{parsed=parseQueueMessage(message);}catch{throw failed('SUPERVISOR_MESSAGE_TIMING_UNAVAILABLE');}
  if(parsed.invocation_id!==expected.message.invocation_id)throw failed('SUPERVISOR_MESSAGE_TIMING_UNAVAILABLE');
 }
 requireQueueAttemptLifetime(metadata);
}
export async function handleQueueEnvelope(request,consume,options){
 let metadata,disposition;
 try{
  metadata=await preflightQueueCallback(request,options);if(metadata instanceof Response)return metadata;
  // Read-only, server-bound canonical classification. Never trust a payload's
  // claimed STOP/expiry, and never BEGIN merely to learn terminal disposition.
  disposition=await options.control('DISPOSITION',{message:metadata.message,runtime:options.bound.deployment,
   provider_message_id:metadata.messageId});
  if(disposition?.ok!==true||disposition.identified!==true||disposition.execution_authorized!==false||
   disposition.invocation_id!==metadata.message.invocation_id||!['ACK','ELIGIBLE','RECONCILE'].includes(disposition.disposition))
   throw failed('SUPERVISOR_ROUTING_DISPOSITION_UNAVAILABLE');
  if(disposition.disposition==='ACK'&&!QUEUE_CLOSURE_REASONS.includes(disposition.reason))
   throw failed('SUPERVISOR_ROUTING_DISPOSITION_UNAVAILABLE');
  options.evidence?.disposition(metadata.message,metadata,disposition);
  if(disposition.disposition==='ACK'){
   // Documented AcknowledgeMessage API; no SDK receive/90-second renewal or
   // worker timer is started. A successful canonical denial is not execution.
   const envelope=queueCallbackEnvelope(request),receipt=await dispositionReceipt(request,metadata,options);
   if(typeof receipt!=='string'||receipt.length<1||receipt.length>16384)
    throw failed('SUPERVISOR_MESSAGE_TIMING_UNAVAILABLE');
   const response=await(options.fetchImpl||fetch)(`https://iad1.vercel-queue.com/api/v3/topic/${QUEUE_TOPIC}/consumer/${encodeURIComponent(envelope.group)}/lease/${encodeURIComponent(receipt)}`,{
    method:'DELETE',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(5000),headers:{
     authorization:`Bearer ${await(options.getToken||getVercelOidcToken)()}`,'Vqs-Deployment-Id':options.bound.deployment.deployment_id}});
   await response.body?.cancel();
   if(response.status!==204)throw failed('SUPERVISOR_TERMINAL_ACK_UNCONFIRMED');
   return Response.json({status:'closed',reason:disposition.reason,execution_authorized:false,
    worker_admitted:false,transport_acknowledged:true});
  }
  // The original delivery/lifetime budgets still protect eligible execution.
  // UNKNOWN may have committed; it must not be closed or start a second tick.
  if(disposition.disposition==='RECONCILE'){
   const retry=queueDeliveryRetry({code:'SUPERVISOR_ACK_UNKNOWN',queueDisposition:'RECONCILE'},metadata);
   if(!retry?.afterSeconds)throw failed('SUPERVISOR_ACK_UNKNOWN');
   const envelope=queueCallbackEnvelope(request),receipt=await dispositionReceipt(request,metadata,options);
   if(typeof receipt!=='string'||receipt.length<1||receipt.length>16384)throw failed('SUPERVISOR_MESSAGE_TIMING_UNAVAILABLE');
   const response=await(options.fetchImpl||fetch)(`https://iad1.vercel-queue.com/api/v3/topic/${QUEUE_TOPIC}/consumer/${encodeURIComponent(envelope.group)}/lease/${encodeURIComponent(receipt)}`,{
    method:'PATCH',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(5000),headers:{
     authorization:`Bearer ${await(options.getToken||getVercelOidcToken)()}`,'Vqs-Deployment-Id':options.bound.deployment.deployment_id,
     'content-type':'application/json'},body:JSON.stringify({visibilityTimeoutSeconds:retry.afterSeconds})});
   await response.body?.cancel();if(!response.ok)throw failed('SUPERVISOR_RECONCILIATION_RETRY_UNCONFIRMED');
   return Response.json({status:'retry',execution_authorized:false,worker_admitted:false,reconciliation_required:true});
  }
  if(metadata.deliveryCount>5)throw failed('SUPERVISOR_DELIVERY_LIMIT');
  if(queueCallbackEnvelope(request).prefetched)requireQueueCallbackLifetime(request,(options.now||Date.now)());
  else requireQueueAttemptLifetime(metadata,(options.now||Date.now)());
 }
 catch(error){return Response.json({ok:false,code:error?.status===403?'SUPERVISOR_DELIVERY_DENIED':
  visibleFailures.has(error?.code)?error.code:'SUPERVISOR_QUEUE_LOOKUP_UNAVAILABLE',
  worker_admitted:false,reconciliation_required:error?.status!==403},{status:error?.status===403?403:503});}
 return attempts.run(metadata,()=>consume(request));
}
