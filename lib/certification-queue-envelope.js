// Private native callback envelope only. This is transport preflight, never
// worker/reservation authority. No publisher, arbitrary destination or proxy.
import {getVercelOidcToken} from '@vercel/oidc';
import {AsyncLocalStorage} from 'node:async_hooks';
import {QUEUE_TOPIC} from './certification-queue-supervision.js';
import {requireQueueAttemptLifetime,requireQueueCallbackLifetime} from './certification-queue-timing.js';
const failed=code=>Object.assign(new Error(code),{code,status:503});
const attempts=new AsyncLocalStorage();
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
export async function preflightQueueCallback(request,{bound,now=Date.now,fetchImpl=fetch,getToken=getVercelOidcToken,evidence}={}){
 const envelope=queueCallbackEnvelope(request);
 if(envelope.prefetched){requireQueueCallbackLifetime(request,now());return {messageId:envelope.id,
  createdAt:request.headers.get('ce-vqscreatedat'),expiresAt:request.headers.get('ce-vqsexpiresat')};}
 // Routing-only notifications are a normal SDK retry path. The supported
 // ReceiveMessageById API accepts visibility=0 (peek, no lease/extension).
 // Learn actual immutable expiry before the SDK receives with visibility=90.
 if(bound?.resource?.resource_id!=='CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51'||
  bound.resource.project_ref!=='trmcwrljjxwhgtikfdgu'||bound.deployment?.deployment_class!=='preview'||
  !/^dpl_[A-Za-z0-9_-]{8,128}$/.test(bound.deployment.deployment_id||''))envelopeDenied();
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
 const metadata={messageId:message.messageId,createdAt:message.timestamp,expiresAt:message.expiresAt,deliveryCount:message.deliveryCount};
 requireQueueAttemptLifetime(metadata,now());evidence?.lookup(metadata);
 return metadata;
}
export function requireQueueEnvelopeMetadata(metadata){
 const expected=attempts.getStore();
 const timestamp=value=>value instanceof Date?value.getTime():Date.parse(value);
 if(!expected||metadata?.messageId!==expected.messageId||
  timestamp(metadata.createdAt)!==timestamp(expected.createdAt)||timestamp(metadata.expiresAt)!==timestamp(expected.expiresAt))
  throw failed('SUPERVISOR_MESSAGE_TIMING_UNAVAILABLE');
 requireQueueAttemptLifetime(metadata);
}
export async function handleQueueEnvelope(request,consume,options){
 let metadata;
 try{metadata=await preflightQueueCallback(request,options);if(metadata instanceof Response)return metadata;}
 catch(error){return Response.json({ok:false,code:error?.status===403?'SUPERVISOR_DELIVERY_DENIED':
  'SUPERVISOR_QUEUE_LOOKUP_UNAVAILABLE',worker_admitted:false,reconciliation_required:error?.status!==403},{status:error?.status===403?403:503});}
 return attempts.run(metadata,()=>consume(request));
}
