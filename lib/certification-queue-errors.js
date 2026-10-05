// Queue control/publication transport only. HTTP status is not an authority
// discriminator: PostgREST can return 400 for a database programming failure.
const authorityCodes=new Set([
 'SUPERVISOR_ADMISSION_DENIED','SUPERVISOR_RESERVATION_DENIED','SUPERVISOR_DISABLED_OR_STALE',
 'SUPERVISOR_RESOURCE_DENIED','SUPERVISOR_DEPLOYMENT_DENIED','SUPERVISOR_MESSAGE_DENIED',
 'SUPERVISOR_REQUEST_DENIED','SUPERVISOR_OPERATION_DENIED','SUPERVISOR_RUN_TOKEN_DENIED',
 'SUPERVISOR_STEP_DENIED','SUPERVISOR_ENGINE_SCOPE_DENIED','SUPERVISOR_FAULT_DENIED',
 'SUPERVISOR_OWNER_PUBLICATION_REQUIRED','SUPERVISOR_PUBLICATION_REQUEST_DENIED',
 'SUPERVISOR_PUBLICATION_DENIED','SUPERVISOR_PUBLISHER_SESSION_DENIED',
]);
const conflictCodes=new Set(['SUPERVISOR_AUTHORITY_CONTEXT_STALE','SUPERVISOR_REVISION_STALE',
 'SUPERVISOR_REQUEST_CONFLICT','CANONICAL_RESOURCE_CONTEXT_STALE']);
const localDenials=new Set(['SUPERVISOR_RUNTIME_UNSUPPORTED','SUPERVISOR_PRIVATE_QUEUE_DISABLED',
 'SUPERVISOR_MESSAGE_DENIED','SUPERVISOR_DELIVERY_DENIED','SUPERVISOR_PROVIDER_IDENTITY_DENIED',
 'SUPERVISOR_UNPINNED_DEVELOPMENT_DENIED']);
export function queueTransportFailure(fallback,operation,cause) {
 const timeout=cause?.name==='TimeoutError'||cause?.name==='AbortError';
 return Object.assign(new Error(fallback),{code:fallback,status:503,
  failureClass:timeout?'TIMEOUT':'CONNECTION',queueDisposition:'RECONCILE',operation});
}
export function queueDatabaseFailure(response,value,fallback,operation) {
 const sqlstate=typeof value?.code==='string'?value.code:null;
 // Match the complete canonical message, never a substring in an internal log.
 const code=typeof value?.message==='string'?value.message.trim():'';
 let status=503,queueDisposition='FAIL',failureClass='DATABASE';
 if(sqlstate==='42501'&&authorityCodes.has(code)) {
  status=403;queueDisposition='ACK';failureClass='AUTHORITY';
 } else if(sqlstate==='PT409'&&conflictCodes.has(code)) {
  status=409;queueDisposition='ACK';failureClass='AUTHORITY';
 } else if(sqlstate==='PT409'&&['SUPERVISOR_NOT_DUE_OR_BUSY','SUPERVISOR_PUBLISHER_BUSY'].includes(code)) {
  status=409;queueDisposition='RETRY';failureClass='BUSY';
 } else if(sqlstate==='40001'||sqlstate==='40P01') {
  queueDisposition='RETRY';failureClass='TRANSACTION_ROLLED_BACK';
 } else if(sqlstate==='57014'||sqlstate?.startsWith('08')||[502,503,504].includes(response.status)) {
  queueDisposition='RECONCILE';failureClass=sqlstate==='57014'?'TIMEOUT':'CONNECTION';
 }
 // Do not return raw database messages/details, tokens, or private payloads.
 const typed=authorityCodes.has(code)||conflictCodes.has(code)||failureClass==='BUSY';
 return Object.assign(new Error(typed?code:fallback),{code:typed?code:fallback,status,
  sqlstate,failureClass,queueDisposition,operation});
}
export function queueDeliveryRetry(error,metadata) {
 if(error?.queueDisposition==='ACK'||(!error?.queueDisposition&&localDenials.has(error?.code)))
  return {acknowledge:true};
 // Unexpected/programming failures fail the delivery, not a successful ACK.
 // The configured provider maxDeliveries=5 bounds delivery retries. At its
 // ceiling we still leave failure visible; owner reconciliation is required.
 if(metadata?.deliveryCount>=5)return undefined;
 if(['RETRY','RECONCILE'].includes(error?.queueDisposition)||error?.code==='SUPERVISOR_ACKNOWLEDGEMENT_UNKNOWN')
  return {afterSeconds:Math.min(60,2**(metadata?.deliveryCount||1))};
 return undefined;
}
