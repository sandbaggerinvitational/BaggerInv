// Owner control-plane tool. No browser API. No credentials/messages printed.
import {QueueClient} from '@vercel/queue';
import {readFile,stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {QUEUE_CONTRACT,QUEUE_TOPIC,parseQueueMessage} from '../../lib/certification-queue-supervision.js';
import registration from '../../config/certification-resource-registration.json' with {type:'json'};
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
// Provider validates the OIDC signature/audience. Locally check scope/expiry too;
// decoding alone is not authorization. Token is only the SDK auth, never payload.
export function createOwnerQueuePublisher(batch,token,{clientFactory=options=>new QueueClient(options)}={}) {
 validateOwnerQueueBatch(batch);
 if(process.env.NODE_ENV==='development')fail('SUPERVISOR_UNPINNED_DEVELOPMENT_DENIED');
 let claims;try{claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());}catch{fail('SUPERVISOR_PROVIDER_IDENTITY_DENIED');}
 const d=batch.binding.deployment;
 if(claims.project_id!==d.vercel_project_id||claims.owner_id!==d.vercel_team_id||claims.environment!=='preview'||
  !Number.isSafeInteger(claims.exp)||claims.exp*1000<=Date.now())fail('SUPERVISOR_PROVIDER_IDENTITY_DENIED');
 const client=clientFactory({region:'iad1',deploymentId:d.deployment_id,token});
 return (message,options)=>client.send(QUEUE_TOPIC,parseQueueMessage(message),options);
}
export async function publishOwnerQueueBatch({owner,send,now=Date.now}) {
 // Every owner() call commits independently. SQL TRY precedes any remote send.
 const batch=validateOwnerQueueBatch(await owner('publication',{action:'BATCH'}));
 const results=[];
 for(const entry of batch.messages){
  const id=entry.message.invocation_id;
  if(Date.parse(entry.expires_at)<=now()){results.push({invocation_id:id,outcome:'EXPIRED_REQUIRES_RECONCILIATION'});continue;}
  try{
   const attempt=await owner('publication',{action:'TRY',invocation_id:id});
   if(attempt.already_accepted){results.push({invocation_id:id,outcome:'ACCEPTED'});continue;}
   const delaySeconds=Math.max(0,Math.ceil((Date.parse(entry.scheduled_at)-now())/1000));
   const result=await send(entry.message,{delaySeconds,retentionSeconds:Math.max(60,Math.ceil((Date.parse(entry.expires_at)-now())/1000)),idempotencyKey:entry.idempotency_key});
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
export async function startAndPublishOwnerQueue({owner,input,createSend}) {
 const committed=await owner('control',input);
 const batch=validateOwnerQueueBatch(await owner('publication',{action:'BATCH'}));
 const send=await createSend(batch);
 const publication=await publishOwnerQueueBatch({owner,send});
 return {ok:true,start_committed:true,start:committed,publication};
}
// Later hosted provisioning uses a managed postgres owner connection with verified
// TLS. Fixed project/role; no SQL or physical target supplied by runtime clients.
async function main(){
 const [action,directory,execute]=process.argv.slice(2);
 if(!['start','publish','stop','status','reconcile'].includes(action)||!directory||execute!=='--execute'){
  console.log(JSON.stringify({executed:false,usage:'<start|publish|stop|status|reconcile> <owner-directory> --execute',hostedAuthorizationRequired:true}));return;
 }
 const dir=path.resolve(directory),bound=JSON.parse(await readFile(path.join(dir,'binding.json'),'utf8'));
 validateOwnerQueueBatch({binding:bound,messages:[]});
 const passwordFile=path.join(dir,'db-password.txt'),tokenFile=path.join(dir,'vercel-oidc-token.txt');
 const privateRead=async file=>{const s=await stat(file);if(s.mode&0o077||s.uid!==process.getuid())fail('SUPERVISOR_LOCAL_CREDENTIAL_CUSTODY_DENIED');return(await readFile(file,'utf8')).trim();};
 const password=await privateRead(passwordFile);
 const owner=async(name,input={})=>{
  const fn={control:'worker_supervisor_control_v1',publication:'worker_supervisor_queue_publication_v2',status:'worker_supervisor_status_v1',reconcile:'worker_supervisor_reconcile_v1'}[name];
  if(!fn)fail('SUPERVISOR_OWNER_OPERATION_DENIED');
  const json=JSON.stringify({...bound,...input}).replaceAll("'","''");
  const run=spawnSync('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-h','db.trmcwrljjxwhgtikfdgu.supabase.co','-U','postgres','-d','postgres'],
   {env:{PATH:process.env.PATH,PGPASSWORD:password,PGSSLMODE:'verify-full',PGSSLROOTCERT:path.join(dir,'supabase-ca.crt')},
    input:`select production_control.${fn}('${json}'::jsonb);`,encoding:'utf8',timeout:10000,maxBuffer:1024*1024});
  if(run.status!==0)fail('SUPERVISOR_OWNER_CONTROL_UNAVAILABLE');
  return JSON.parse(run.stdout.trim());
 };
 if(action==='status'||action==='reconcile'){console.log(JSON.stringify(await owner(action)));return;}
 if(action==='stop'){const input=JSON.parse(await readFile(path.join(dir,'control.json'),'utf8'));if(input.action!=='STOP')fail('SUPERVISOR_CONTROL_FILE_DENIED');console.log(JSON.stringify(await owner('control',input)));return;}
 const token=await privateRead(tokenFile),createSend=batch=>createOwnerQueuePublisher(batch,token);
 let result;
 if(action==='start'){const input=JSON.parse(await readFile(path.join(dir,'control.json'),'utf8'));if(!['START','RESUME'].includes(input.action))fail('SUPERVISOR_CONTROL_FILE_DENIED');result=await startAndPublishOwnerQueue({owner,input,createSend});}
 else{const batch=await owner('publication',{action:'BATCH'});result=await publishOwnerQueueBatch({owner,send:createSend(batch)});}
 console.log(JSON.stringify(result));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(JSON.stringify({ok:false,code:error?.code||'SUPERVISOR_OWNER_UNAVAILABLE'}));process.exitCode=1;});
