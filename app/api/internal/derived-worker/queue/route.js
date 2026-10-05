// PRIVATE queue/v2beta consumer. Register only with the Certification manifest.
// Default OFF even if an unregistered route exists in a local/other deployment.
import {QueueClient} from '@vercel/queue';
import {consumeCertificationQueueMessage,queueRuntimeIdentity,queueRetry} from '../../../../../lib/certification-queue-supervision.js';
import {QUEUE_TIMING,handleBoundedQueueDelivery} from '../../../../../lib/certification-queue-timing.js';
export const runtime='nodejs';
export const maxDuration=60;
export const dynamic='force-dynamic';
const queue=new QueueClient({region:'iad1'});
const consume=queue.handleCallback(async(message,metadata)=>{
 const result=await consumeCertificationQueueMessage(message,metadata);
 if(result.uncertain)throw Object.assign(new Error('SUPERVISOR_ACK_UNKNOWN'),{code:'SUPERVISOR_ACK_UNKNOWN',status:503});
},{visibilityTimeoutSeconds:QUEUE_TIMING.visibilitySeconds,retry:queueRetry});
export function POST(request){
 try{queueRuntimeIdentity();}catch{return Response.json({ok:false,code:'SUPERVISOR_PRIVATE_QUEUE_DISABLED'},{status:403});}
 // Before the SDK starts its renewal timer or receives a message, establish
 // actual provider expiry. A short-lived delivery never starts another tick.
 return handleBoundedQueueDelivery(request,consume);
}
