// PRIVATE queue/v2beta consumer. Register only with the Certification manifest.
// Default OFF even if an unregistered route exists in a local/other deployment.
import {QueueClient} from '@vercel/queue';
import {consumeCertificationQueueMessage,queueRuntimeIdentity,queueRetry} from '../../../../../lib/certification-queue-supervision.js';
import {QUEUE_TIMING} from '../../../../../lib/certification-queue-timing.js';
import {handleQueueEnvelope,requireQueueEnvelopeMetadata} from '../../../../../lib/certification-queue-envelope.js';
import {createQueueTimingEvidence,observeQueueTransport,currentQueueTimingEvidence} from '../../../../../lib/certification-queue-timing-evidence.js';
export const runtime='nodejs';
export const maxDuration=60;
export const dynamic='force-dynamic';
const queue=new QueueClient({region:'iad1'});
const consume=queue.handleCallback(async(message,metadata)=>{
 const timingEvidence=currentQueueTimingEvidence();
 requireQueueEnvelopeMetadata(metadata);
 let result;
 try{result=await consumeCertificationQueueMessage(message,metadata,{timingEvidence});}
 catch(error){timingEvidence?.failed();throw error;}
 if(result.uncertain)throw Object.assign(new Error('SUPERVISOR_ACK_UNKNOWN'),{
  code:'SUPERVISOR_ACK_UNKNOWN',status:503,queueDisposition:'RECONCILE',failureClass:'UNKNOWN_COMMIT'});
},{visibilityTimeoutSeconds:QUEUE_TIMING.visibilitySeconds,retry:queueRetry});
export function POST(request){
 let bound;
 try{bound=queueRuntimeIdentity();}catch{return Response.json({ok:false,code:'SUPERVISOR_PRIVATE_QUEUE_DISABLED'},{status:403});}
 const timingEvidence=createQueueTimingEvidence({bound});timingEvidence.callback(request);
 // Routing-only retries use zero-visibility provider lookup; prefetched
 // deliveries retain their raw metadata guard. No inferred/default expiry.
 return observeQueueTransport(timingEvidence,()=>handleQueueEnvelope(request,consume,{bound,evidence:timingEvidence}));
}
