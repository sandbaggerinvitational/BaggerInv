// Offline owner evidence check. No provider client, credential or worker calls.
import {readFile} from 'node:fs/promises';
import {validateQueueTimingReceipt,verifyQueueRetentionEvidence} from '../../lib/certification-queue-timing-evidence.js';
if(process.argv.length!==3)throw new Error('TIMING_EVIDENCE_FILE_REQUIRED');
const raw=await readFile(process.argv[2],'utf8');
let receipts;try{receipts=JSON.parse(raw);}catch{receipts=raw.trim().split('\n').map(line=>JSON.parse(line));}
if(!Array.isArray(receipts)||receipts.length>10000)throw new Error('TIMING_EVIDENCE_BUDGET_DENIED');
for(const receipt of receipts)validateQueueTimingReceipt(receipt);
const deliveries=receipts.filter(r=>r.event==='HANDLER_ENTERED');
const proofs=deliveries.map(delivery=>{
 const request=receipts.find(r=>r.event==='PUBLICATION_REQUEST'&&r.invocation_digest.value===delivery.invocation_digest.value&&r.deployment_id.value===delivery.deployment_id.value);
 const response=receipts.find(r=>r.event==='PUBLICATION_RESPONSE'&&r.provider_message_digest.value===delivery.provider_message_digest.value&&r.invocation_digest.value===delivery.invocation_digest.value);
 return {invocation_digest:delivery.invocation_digest.value,...verifyQueueRetentionEvidence(request,delivery,response)};
});
const status=proofs.length&&proofs.every(p=>p.status==='RETENTION_CONFIRMED')?'PASS':'INCOMPLETE';
console.log(JSON.stringify({status,receipts:receipts.length,proofs},null,2));process.exitCode=status==='PASS'?0:1;
