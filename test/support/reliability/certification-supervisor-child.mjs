// Child process transport for owned socket-only crash/concurrency proof. Never
// reads provider credentials. Synthetic fixture inputs arrive over private IPC.
import {spawnSync} from 'node:child_process';
import {binaries,jsonLiteral} from './postgres17.mjs';
import {consumeCertificationQueueMessage,QUEUE_TOPIC} from '../../../lib/certification-queue-supervision.js';
import {handleSupervisorRequest,SUPERVISOR_PATH} from '../../../lib/certification-worker-supervision.js';
process.once('message',async data=>{
 if(!data.socket.includes('/bagger-reliability-pg17-')||!data.socket.endsWith('/socket')||data.database!=='supervisor_certification')process.exit(2);
 const fetchImpl=async(url,init)=>{
  if(new URL(url).origin!==data.registrationManifest.registration.project_url)throw new Error('UNEXPECTED_EGRESS');
  const name=new URL(url).pathname.split('/').at(-1);
  if(!['execute_certification_supervisor_v1','execute_certification_queue_supervisor_v2','read_certification_runtime_context_v1','execute_certification_operation_v1','read_certification_projection_v1'].includes(name))throw new Error('UNEXPECTED_RPC');
  const clean={PATH:process.env.PATH,PGHOST:data.socket,PGPORT:String(data.port),PGUSER:'postgres',PGOPTIONS:'-c request.jwt.claim.role=service_role'};
  const result=spawnSync(binaries.psql,['-X','-qAt','-v','ON_ERROR_STOP=1','-d',data.database],{env:clean,encoding:'utf8',
   input:`\\set VERBOSITY verbose\nset role service_role;select public.${name}(${jsonLiteral(JSON.parse(init.body).input)})`});
  if(result.status!==0){const match=/ERROR:\s+([A-Z0-9]{5}):\s*([^\n]+)/.exec(result.stderr);if(!match)throw new Error('LOCAL_SQL_FAILED');
   return Response.json({code:match[1],message:match[2]},{status:400});}
  return Response.json(JSON.parse(result.stdout.trim()));
 };
 if(data.queueEntry){
  try{const result=await consumeCertificationQueueMessage(data.queueEntry.message,{topicName:QUEUE_TOPIC,messageId:'msg_local_child',deliveryCount:1},
   {env:data.env,dependencies:{registrationManifest:data.registrationManifest,fetchImpl}});process.send({status:200,result});}
  catch(error){process.send({status:error.status||503,result:{code:error.code||'LOCAL_CHILD_UNAVAILABLE'}});}
  process.disconnect();return;
 }
 const response=await handleSupervisorRequest(new Request(data.ticket.origin+SUPERVISOR_PATH,{method:'POST',
  headers:{'content-type':'application/json','x-bagger-worker-signature':data.ticket.signature},body:data.ticket.body}),
  {env:data.env,dependencies:{registrationManifest:data.registrationManifest,fetchImpl}});
 process.send({status:response.status,result:await response.json()});process.disconnect();
});
