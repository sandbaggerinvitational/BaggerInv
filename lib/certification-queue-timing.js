// Transport lifetime is not execution authority. SQL reservation/STOP predicates
// and canonical job leases remain unchanged. See retention/CONTRACT.md.
export const QUEUE_TIMING=Object.freeze({
 functionSeconds:60,softSeconds:45,jobLeaseSeconds:90,reservationSeconds:30,
 reconcileSeconds:150,cadenceSeconds:60,expiryBackoffSeconds:5,
 visibilitySeconds:90,skewSeconds:30,retentionHorizonSeconds:540,
 maximumDelaySeconds:7150,maximumRetentionSeconds:604800,
 minimumAttemptLifetimeSeconds:180,
});
const failure=code=>Object.assign(new Error(code),{code,status:503,queueDisposition:'RECONCILE',failureClass:'TRANSPORT_HORIZON'});
export function queuePublicationTiming(entry,now=Date.now(),retentionSeconds) {
 const scheduled=Date.parse(entry?.scheduled_at),authorityExpiry=Date.parse(entry?.expires_at);
 if(!Number.isFinite(now)||!Number.isFinite(scheduled)||!Number.isFinite(authorityExpiry)||
  authorityExpiry<=scheduled||authorityExpiry>scheduled+QUEUE_TIMING.reservationSeconds*1000)
  throw failure('SUPERVISOR_PUBLICATION_TIMING_DENIED');
 const delaySeconds=Math.max(0,Math.ceil((scheduled-now)/1000));
 const minimum=delaySeconds+QUEUE_TIMING.retentionHorizonSeconds;
 const retention=retentionSeconds??minimum;
 if(delaySeconds>QUEUE_TIMING.maximumDelaySeconds||!Number.isSafeInteger(retention)||
  retention<minimum||retention>QUEUE_TIMING.maximumRetentionSeconds)
  throw failure('SUPERVISOR_PUBLICATION_RETENTION_DENIED');
 return {delaySeconds,retentionSeconds:retention};
}
export function requireQueueAttemptLifetime(metadata,now=Date.now()) {
 const created=metadata?.createdAt instanceof Date?metadata.createdAt.getTime():Date.parse(metadata?.createdAt);
 const expires=metadata?.expiresAt instanceof Date?metadata.expiresAt.getTime():Date.parse(metadata?.expiresAt);
 if(!Number.isFinite(now)||!Number.isFinite(created)||!Number.isFinite(expires)||expires<=created||
  created>now+QUEUE_TIMING.skewSeconds*1000||expires-created>QUEUE_TIMING.maximumRetentionSeconds*1000)
  throw failure('SUPERVISOR_MESSAGE_TIMING_UNAVAILABLE');
 // The pinned SDK renews by a fixed 90 seconds. At most 60 seconds of runtime
 // plus 30 seconds of network/clock margin must fit BEFORE its timer starts.
 // Missing actual expiry must never fall back to the SDK's assumed 24h TTL.
 if(expires-now<=QUEUE_TIMING.minimumAttemptLifetimeSeconds*1000)
  throw failure('SUPERVISOR_MESSAGE_HORIZON_EXHAUSTED');
 return {expiresAt:expires,maximumVisibilityDeadline:now+(QUEUE_TIMING.functionSeconds+QUEUE_TIMING.visibilitySeconds)*1000};
}
export function requireQueueCallbackLifetime(request,now=Date.now()) {
 const h=request.headers;
 // Our two-field, sub-4KiB payload uses native v2 small-body callbacks. A
 // routing-only callback cannot establish expiry before SDK lease acquisition.
 if(h.get('ce-type')!=='com.vercel.queue.v2beta'||!h.get('ce-vqsreceipthandle'))
  throw failure('SUPERVISOR_MESSAGE_TIMING_UNAVAILABLE');
 const plan=requireQueueAttemptLifetime({createdAt:h.get('ce-vqscreatedat'),expiresAt:h.get('ce-vqsexpiresat')},now);
 const visibility=h.get('ce-vqsvisibilitydeadline');
 if(visibility&&(!Number.isFinite(Date.parse(visibility))||Date.parse(visibility)>plan.expiresAt))
  throw failure('SUPERVISOR_MESSAGE_TIMING_UNAVAILABLE');
 return plan;
}
export function handleBoundedQueueDelivery(request,consume,now=Date.now()) {
 // This runs before handleCallback starts any SDK lease/renewal lifecycle.
 try{requireQueueCallbackLifetime(request,now);}catch(error){
  return Response.json({ok:false,code:error.code,worker_admitted:false,reconciliation_required:true},{status:503});
 }
 return consume(request);
}
export function queueRetryFitsExpiry(metadata,afterSeconds,now=Date.now()) {
 const expires=metadata?.expiresAt instanceof Date?metadata.expiresAt.getTime():Date.parse(metadata?.expiresAt);
 // The SDK supplies real expiry on the native callback. Missing expiry in an
 // isolated error-classification test does not change its established matrix.
 return !Number.isFinite(expires)||now+(afterSeconds+QUEUE_TIMING.skewSeconds)*1000<expires;
}
