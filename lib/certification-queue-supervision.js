// Server/private-queue only. No client target, resource selector, or public wake API.
import {supervisorEnvelope, executeBoundedSupervisor} from './certification-worker-supervision.js';
import {queueDatabaseFailure,queueTransportFailure,queueDeliveryRetry} from './certification-queue-errors.js';
import {requireQueueAttemptLifetime} from './certification-queue-timing.js';
export const QUEUE_CONTRACT='certification-queue-supervision-v2';
export const QUEUE_TOPIC='bagger-certification-derived-wake-v2';
export const QUEUE_RPC='execute_certification_queue_supervisor_v2';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const deny=(code,status=403)=>Object.assign(new Error(code),{code,status});
export function queueRuntimeIdentity(env=process.env,dependencies={}) {
 // No request header or queue payload supplies identity. Provider system values
 // plus the reviewed server registration must all agree before adapter creation.
 if(Number(process.versions.node.split('.')[0])<22)throw deny('SUPERVISOR_RUNTIME_UNSUPPORTED');
 if(env.VERCEL!=='1'||env.BAGGER_CERTIFICATION_QUEUE_TRANSPORT!==QUEUE_CONTRACT)
  throw deny('SUPERVISOR_PRIVATE_QUEUE_DISABLED');
 return supervisorEnvelope(env,dependencies);
}
export function parseQueueMessage(message) {
 if(!message||typeof message!=='object'||Array.isArray(message)||Object.keys(message).length!==2||
  message.version!==QUEUE_CONTRACT||!uuid.test(message.invocation_id||''))throw deny('SUPERVISOR_MESSAGE_DENIED');
 return {version:QUEUE_CONTRACT,invocation_id:message.invocation_id};
}
export function queueControl({env=process.env,dependencies={}}={}) {
 const bound=queueRuntimeIdentity(env,dependencies);
 return async(operation,payload)=>{
  const key=env.SUPABASE_SCORING_MIRROR_SECRET_KEY,headers={apikey:key,'content-type':'application/json'};
  if(!key.startsWith('sb_secret_'))headers.authorization=`Bearer ${key}`;
  let response,value;
  try{response=await(dependencies.fetchImpl||fetch)(`${bound.resource.project_url}/rest/v1/rpc/${QUEUE_RPC}`,
   {method:'POST',redirect:'error',cache:'no-store',headers,signal:AbortSignal.timeout(5000),
    body:JSON.stringify({input:{contract:QUEUE_CONTRACT,...bound,operation,...payload}})});value=await response.json();}
  catch(cause){throw queueTransportFailure('SUPERVISOR_CONTROL_UNAVAILABLE',operation,cause);}
  if(!response.ok||value?.ok!==true)throw queueDatabaseFailure(response,value,'SUPERVISOR_CONTROL_UNAVAILABLE',operation);
  return value;
 };
}
export async function consumeCertificationQueueMessage(message,metadata,{env=process.env,dependencies={},control,adapterFactory,...rest}={}) {
 const bound=queueRuntimeIdentity(env,dependencies),parsed=parseQueueMessage(message);
 if(metadata?.topicName!==QUEUE_TOPIC||typeof metadata.messageId!=='string'||!metadata.messageId||metadata.messageId.length>512||
  !Number.isSafeInteger(metadata.deliveryCount)||metadata.deliveryCount<1)throw deny('SUPERVISOR_DELIVERY_DENIED');
 if(metadata.deliveryCount>5)throw Object.assign(new Error('SUPERVISOR_DELIVERY_LIMIT'),{code:'SUPERVISOR_DELIVERY_LIMIT',queueDisposition:'FAIL',status:503});
 requireQueueAttemptLifetime(metadata);
 const transport=control||queueControl({env,dependencies});
 const wrapped=(operation,payload)=>transport(operation,operation==='BEGIN'?{message:parsed,runtime:bound.deployment}:payload);
 return executeBoundedSupervisor({env,dependencies,control:wrapped,...(adapterFactory?{adapterFactory}:{}),...rest});
}
// Queue retries cannot re-run a consumed reservation or reset canonical job attempts.
// UNKNOWN is kept visible for authoritative owner reconciliation, not relabeled.
export const queueRetry=queueDeliveryRetry;
