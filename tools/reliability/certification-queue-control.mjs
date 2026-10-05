// Owner control-plane tool. No browser API. No credentials/messages printed.
import {readFile,stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {validateOwnerQueueBatch,publishOwnerQueueBatch} from '../../lib/certification-queue-publication.js';
import {PUBLICATION_PATH} from '../../lib/certification-queue-publisher.js';
const fail=code=>{throw Object.assign(new Error(code),{code});};
export {validateOwnerQueueBatch,publishOwnerQueueBatch} from '../../lib/certification-queue-publication.js';
// Retired as hosted execution authority. Pure injected protocol tests remain.
export function createOwnerQueuePublisher(){fail('SUPERVISOR_LOCAL_PUBLICATION_RETIRED');}
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
 if(!['start','start-only','arm-global','correct-global','publish','stop','status','reconcile'].includes(action)||!directory||execute!=='--execute'){
  console.log(JSON.stringify({executed:false,usage:'<start|start-only|arm-global|correct-global|publish|stop|status|reconcile> <owner-directory> --execute',hostedAuthorizationRequired:true}));return;
 }
 const dir=path.resolve(directory),bound=JSON.parse(await readFile(path.join(dir,'binding.json'),'utf8'));
 validateOwnerQueueBatch({binding:bound,messages:[]});
 const passwordFile=path.join(dir,'db-password.txt'),tokenFile=path.join(dir,'vercel-oidc-token.txt');
 const privateRead=async file=>{const s=await stat(file);if(s.mode&0o077||s.uid!==process.getuid())fail('SUPERVISOR_LOCAL_CREDENTIAL_CUSTODY_DENIED');return(await readFile(file,'utf8')).trim();};
 const password=await privateRead(passwordFile);
 const owner=async(name,input={})=>{
  const fn={control:'worker_supervisor_control_v1',publication:'worker_supervisor_queue_publication_v2',status:'worker_supervisor_status_v1',reconcile:'worker_supervisor_reconcile_v1',permit:'worker_supervisor_publisher_permit_v3',global_fault:'worker_supervisor_global_fault_control_v5'}[name];
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
 if(action==='arm-global'||action==='correct-global'){
  const input=JSON.parse(await readFile(path.join(dir,'global-fault.json'),'utf8'));
  if(input.action!==(action==='arm-global'?'ARM':'CORRECT'))fail('SUPERVISOR_CONTROL_FILE_DENIED');
  // SQL rejects all extra fields and derives target reservations itself.
  console.log(JSON.stringify(await owner('global_fault',input)));return;
 }
 if(action==='start-only'){
  const input=JSON.parse(await readFile(path.join(dir,'control.json'),'utf8'));
  if(!['START','RESUME'].includes(input.action))fail('SUPERVISOR_CONTROL_FILE_DENIED');
  console.log(JSON.stringify({start_committed:true,publication_requested:false,start:await owner('control',input)}));return;
 }
 // This development token is ONLY Deployment Protection self-access. It is
 // never given to QueueClient; the Preview Function obtains its own OIDC token.
 const token=await privateRead(tokenFile);let committed=null;
 if(action==='start'){
  const input=JSON.parse(await readFile(path.join(dir,'control.json'),'utf8'));
  if(!['START','RESUME'].includes(input.action))fail('SUPERVISOR_CONTROL_FILE_DENIED');
  committed=await owner('control',input);
 }
 const state=await owner('status');
 const handoff=await owner('permit',{expected_revision:state.revision});
 let result;
 try{
  const response=await fetch(bound.deployment.deployment_origin+PUBLICATION_PATH,{method:'POST',redirect:'error',cache:'no-store',
   headers:{'content-type':'application/json','x-vercel-trusted-oidc-idp-token':token},
   body:JSON.stringify({permit:handoff.permit}),signal:AbortSignal.timeout(55000)});
  if(!response.ok)fail('SUPERVISOR_PUBLICATION_REQUIRES_RECONCILIATION');
  const value=await response.json();
  if(value?.ok!==true)fail('SUPERVISOR_PUBLICATION_REQUIRES_RECONCILIATION');
  // Canonical status, not the HTTP publisher response, is authoritative.
  result={ok:true,start_committed:committed!==null,schedule_installed:false,status:await owner('status')};
 }catch{fail('SUPERVISOR_PUBLICATION_REQUIRES_RECONCILIATION');}

 console.log(JSON.stringify(result));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(JSON.stringify({ok:false,code:error?.code||'SUPERVISOR_OWNER_UNAVAILABLE'}));process.exitCode=1;});
