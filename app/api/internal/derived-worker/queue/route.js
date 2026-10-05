// PRIVATE queue/v2beta consumer. Register only with the Certification manifest.
// Default OFF even if an unregistered route exists in a local/other deployment.
import {QueueClient} from '@vercel/queue';
import {consumeCertificationQueueMessage,queueRuntimeIdentity,queueRetry} from '../../../../../lib/certification-queue-supervision.js';
import {QUEUE_TIMING,handleBoundedQueueDelivery} from '../../../../../lib/certification-queue-timing.js';
import {createQueueTimingEvidence,observeQueueTransport,currentQueueTimingEvidence} from '../../../../../lib/certification-queue-timing-evidence.js';
export const runtime='nodejs';
export const maxDuration=60;
export const dynamic='force-dynamic';
const queue=new QueueClient({region:'iad1'});
const consume=queue.handleCallback(async(message,metadata)=>{
 const timingEvidence=currentQueueTimingEvidence();
 let result;
 try{result=await consumeCertificationQueueMessage(message,metadata,{timingEvidence});}
 catch(error){timingEvidence?.failed();throw error;}
 if(result.uncertain)throw Object.assign(new Error('SUPERVISOR_ACK_UNKNOWN'),{code:'SUPERVISOR_ACK_UNKNOWN',status:503});
},{visibilityTimeoutSeconds:QUEUE_TIMING.visibilitySeconds,retry:queueRetry});
export function POST(request){
 let bound;
 try{bound=queueRuntimeIdentity();}catch{return Response.json({ok:false,code:'SUPERVISOR_PRIVATE_QUEUE_DISABLED'},{status:403});}
 const timingEvidence=createQueueTimingEvidence({bound});timingEvidence.callback(request);
 // Before the SDK starts its renewal timer or receives a message, establish
 // actual provider expiry. A short-lived delivery never starts another tick.
 return observeQueueTransport(timingEvidence,()=>handleBoundedQueueDelivery(request,consume));
}
