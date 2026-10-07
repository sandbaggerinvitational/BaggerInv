// Server-only publication handoff. The HTTP caller never supplies Queue identity.
import {QueueClient} from '@vercel/queue';
import {getVercelOidcToken} from '@vercel/oidc';
import {queueRuntimeIdentity,QUEUE_TOPIC,parseQueueMessage} from './certification-queue-supervision.js';
import {validateOwnerQueueBatch,publishOwnerQueueBatch} from './certification-queue-publication.js';
import {queueDatabaseFailure,queueTransportFailure} from './certification-queue-errors.js';
import {createQueueTimingEvidence} from './certification-queue-timing-evidence.js';

export const PUBLICATION_CONTRACT='certification-queue-publication-v3';
export const PUBLICATION_PATH='/api/internal/derived-worker/publication';
const fail=(code,status=403)=>{throw Object.assign(new Error(code),{code,status});};
export function providerPublicationIdentity(token,bound,now=Date.now()) {
 let claims;
 try{claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());}catch{fail('SUPERVISOR_PROVIDER_IDENTITY_DENIED');}
 const d=bound.deployment;
 // Scope filter only. Vercel Queues verifies JWT signature/audience itself.
 if(claims.project_id!==d.vercel_project_id||claims.owner_id!==d.vercel_team_id||claims.environment!=='preview'||
  !Number.isSafeInteger(claims.exp)||claims.exp*1000<=now)fail('SUPERVISOR_PROVIDER_IDENTITY_DENIED');
 return {environment:'preview',project_id:claims.project_id,owner_id:claims.owner_id};
}
export async function createPreviewQueuePublisher({env=process.env,dependencies={},clientFactory=x=>new QueueClient(x),
 getToken=getVercelOidcToken}={}) {
 const bound=queueRuntimeIdentity(env,dependencies);
 if(env.NODE_ENV==='development'||env.VERCEL_QUEUE_BASE_URL||env.VERCEL_QUEUE_TOKEN)fail('SUPERVISOR_UNPINNED_DEVELOPMENT_DENIED');
 // Called inside the Function request context, never from caller headers/body.
 const token=await getToken();providerPublicationIdentity(token,bound);
 const client=clientFactory({region:'iad1',deploymentId:bound.deployment.deployment_id,token});
 return (message,options)=>client.send(QUEUE_TOPIC,parseQueueMessage(message),options);
}
export function publicationTransport({env=process.env,dependencies={}}={}) {
 const bound=queueRuntimeIdentity(env,dependencies);
 return async(operation,payload={})=>{
  const key=env.SUPABASE_SCORING_MIRROR_SECRET_KEY,headers={apikey:key,'content-type':'application/json'};
  if(!key.startsWith('sb_secret_'))headers.authorization=`Bearer ${key}`;
  let response,value;
  try{response=await(dependencies.fetchImpl||fetch)(`${bound.resource.project_url}/rest/v1/rpc/execute_certification_queue_publication_v3`,
   {method:'POST',redirect:'error',cache:'no-store',headers,signal:AbortSignal.timeout(5000),
    body:JSON.stringify({input:{contract:PUBLICATION_CONTRACT,...bound,operation,...payload}})});value=await response.json();}
  catch(cause){throw queueTransportFailure('SUPERVISOR_PUBLICATION_UNAVAILABLE',operation,cause);}
  if(!response.ok||value?.ok!==true)throw queueDatabaseFailure(response,value,'SUPERVISOR_PUBLICATION_UNAVAILABLE',operation);
  return value;
 };
}
export async function handleOwnerQueuePublication(request,{env=process.env,dependencies={},control,
 createSend=createPreviewQueuePublisher,now=Date.now}={}) {
 const bound=queueRuntimeIdentity(env,dependencies),url=new URL(request.url);
 if(request.method!=='POST'||url.origin!==bound.deployment.deployment_origin||url.pathname!==PUBLICATION_PATH||url.search||
  request.headers.get('content-type')?.split(';')[0]!=='application/json'||Number(request.headers.get('content-length')||0)>160)
  fail('SUPERVISOR_PUBLICATION_REQUEST_DENIED');
 // Read a fixed small body without buffering unbounded client input.
 const reader=request.body?.getReader();if(!reader)fail('SUPERVISOR_PUBLICATION_REQUEST_DENIED');
 let bytes=0,text='';const decoder=new TextDecoder();
 for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;
  if(bytes>160){await reader.cancel();fail('SUPERVISOR_PUBLICATION_REQUEST_DENIED');}text+=decoder.decode(part.value,{stream:true});}
 text+=decoder.decode();let input;try{input=JSON.parse(text);}catch{fail('SUPERVISOR_PUBLICATION_REQUEST_DENIED');}
 if(!input||Array.isArray(input)||Object.keys(input).length!==1||! /^[0-9a-f]{64}$/.test(input.permit||''))
  fail('SUPERVISOR_PUBLICATION_REQUEST_DENIED');
 const transport=control||publicationTransport({env,dependencies});
 // Establish provider runtime scope before consuming the one-use owner handoff.
 const send=await createSend({env,dependencies});
 const admitted=await transport('BEGIN',{permit:input.permit});
 const auth={permit_id:admitted.permit_id,run_token:admitted.run_token};
 const owner=async(name,payload={})=>transport(name==='status'?'STATUS':payload.action,
  {...auth,...(payload.invocation_id?{invocation_id:payload.invocation_id}:{}),...(payload.message_id?{message_id:payload.message_id}:{})});
 // Re-read canonical batch on each session. No arbitrary message/delay input.
 validateOwnerQueueBatch(admitted.batch,bound);
 const timingEvidence=createQueueTimingEvidence({bound,now});
 const result=await publishOwnerQueueBatch({owner,send,bound,now,deadline:now()+40_000,timingEvidence});
 await transport('CLOSE',auth);
 // Never return permit, run token, provider token or raw batch.
 return {ok:true,intended:result.intended,schedule_installed:false,publication:result.status.publication};
}
