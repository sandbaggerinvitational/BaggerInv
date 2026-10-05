// Shared finite publication protocol. No owner minting or client-selected queue.
import {QUEUE_CONTRACT,parseQueueMessage} from './certification-queue-supervision.js';
import registration from '../config/certification-resource-registration.json' with {type:'json'};
const fail=code=>{throw Object.assign(new Error(code),{code});};
export function validateOwnerQueueBatch(batch) {
 const r=registration.registration,b=batch?.binding,d=b?.deployment;
 if(!b||b.resource?.resource_class!=='CERTIFICATION'||b.resource.resource_id!==r.resource_id||b.resource.project_ref!==r.project_ref||
  b.resource.registration_revision!==r.registration_revision||d?.vercel_team_id!==r.vercel_team_id||d.vercel_project_id!==r.vercel_project_id||
  d.git_branch!==r.git_branch||d.deployment_class!=='preview'||!/^dpl_[A-Za-z0-9_-]{8,128}$/.test(d.deployment_id||'')||
  !/^[0-9a-f]{40}$/.test(d.release_commit||'')||!/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(d.deployment_origin||'')||
  !Array.isArray(batch.messages)||batch.messages.length>120)fail('SUPERVISOR_PUBLICATION_BINDING_DENIED');
 const ids=new Set();
 for(const entry of batch.messages){parseQueueMessage(entry.message);
  if(ids.has(entry.message.invocation_id)||!Number.isFinite(Date.parse(entry.scheduled_at))||!Number.isFinite(Date.parse(entry.expires_at))||
   !/^bagger-certification-[0-9a-f-]{36}-\d{1,3}$/.test(entry.idempotency_key||''))fail('SUPERVISOR_PUBLICATION_SCHEMA_DENIED');
  ids.add(entry.message.invocation_id);
 }
 return batch;
}
export async function publishOwnerQueueBatch({owner,send,now=Date.now,deadline=Infinity}) {
 // Every owner() call commits independently. SQL TRY precedes any remote send.
 const batch=validateOwnerQueueBatch(await owner('publication',{action:'BATCH'}));
 const results=[];
 for(const entry of batch.messages){
  if(now()+10_000>=deadline)break; // leave unfinished reservations durable
  const id=entry.message.invocation_id;
  if(Date.parse(entry.expires_at)<=now()){results.push({invocation_id:id,outcome:'EXPIRED_REQUIRES_RECONCILIATION'});continue;}
  try{
   const attempt=await owner('publication',{action:'TRY',invocation_id:id});
   if(attempt.already_accepted){results.push({invocation_id:id,outcome:'ACCEPTED'});continue;}
   const delaySeconds=Math.max(0,Math.ceil((Date.parse(entry.scheduled_at)-now())/1000));
   let timer;
   const publication=send(entry.message,{delaySeconds,retentionSeconds:Math.max(60,Math.ceil((Date.parse(entry.expires_at)-now())/1000)),idempotencyKey:entry.idempotency_key});
   const result=Number.isFinite(deadline)?await Promise.race([publication,new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(new Error('UNACKNOWLEDGED')),Math.min(5000,Math.max(1,deadline-now())));
   })]).finally(()=>clearTimeout(timer)):await publication;
   if(typeof result?.messageId!=='string'||!result.messageId||result.messageId.length>512)throw new Error('UNACKNOWLEDGED');
   await owner('publication',{action:'ACK',invocation_id:id,message_id:result.messageId});
   results.push({invocation_id:id,outcome:'ACCEPTED'});
  }catch{
   // Includes failed ACK accounting and caller timeouts after remote acceptance.
   // Never claim NOT_PUBLISHED from absence of a response. STOP also wins here.
   results.push({invocation_id:id,outcome:'UNKNOWN'});break;
  }
 }
 return {ok:true,intended:batch.messages.length,results,schedule_installed:false,
  status:await owner('status')};
}
