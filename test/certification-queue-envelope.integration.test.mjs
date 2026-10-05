import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {QueueClient} from '@vercel/queue';
import {createGlobalFaultFixture} from './support/reliability/certification-global-fault-fixture.mjs';
import {sqlFile,sqlResult,jsonLiteral,repositoryRoot,destroyIsolatedCluster} from './support/reliability/postgres17.mjs';
import {createCertificationWorkerDemand} from '../tools/reliability/certification-worker-demand.mjs';
import {demandCheckpointSink} from './support/reliability/certification-demand-checkpoint.mjs';
import {handleQueueEnvelope,requireQueueEnvelopeMetadata} from '../lib/certification-queue-envelope.js';
import {QUEUE_TOPIC,consumeCertificationQueueMessage,queueRetry} from '../lib/certification-queue-supervision.js';
const artifact=repositoryRoot+'/supabase/production_incremental/certification-queue-retry-envelope-v6.sql';
test('retry v6: actual PG17/safeupdate preserves authority and uses canonical not-before; real SDK completes four-family demand',async t=>{
 let f;const originalFetch=globalThis.fetch;
 try{
  f=await createGlobalFaultFixture({emptyAuction:true});
  const auction=f.q('select to_jsonb(c)from scoring_authority.calcutta_v1_current c');
  const prior=f.q('select to_jsonb(t)from production_control.worker_supervisor_global_fault_installation_v5 t');
  const source=await readFile(artifact,'utf8'),manifest=JSON.parse(source.split('$manifest$')[1]);
  await t.test('predecessor/hash guarded atomic correction, replay, history, metadata and safeupdate preserved',()=>{
   const damaged=source.replace(manifest[0].new_hash,'0'.repeat(64));
   const failed=sqlResult(f.cluster,f.database,damaged,{role:''});assert.notEqual(failed.status,0);assert.match(failed.stderr,/PATCH_HASH_DRIFT/);
   assert.equal(f.q("select to_regclass('production_control.worker_supervisor_retry_envelope_installation_v6')is null"),'t');
   sqlFile(f.cluster,f.database,artifact,{role:''});const receipt=f.q('select to_jsonb(t)from production_control.worker_supervisor_retry_envelope_installation_v6 t');
   sqlFile(f.cluster,f.database,artifact,{role:''});assert.equal(f.q('select to_jsonb(t)from production_control.worker_supervisor_retry_envelope_installation_v6 t'),receipt);
   assert.equal(f.q('select to_jsonb(t)from production_control.worker_supervisor_global_fault_installation_v5 t'),prior);
   assert.equal(f.q("select current_setting('safeupdate.enabled')"),'on');
   assert.equal(f.q(`select encode(extensions.digest(prosrc,'sha256'),'hex')from pg_proc where oid='${manifest[0].signature}'::regprocedure`),manifest[0].new_hash);
   assert.deepEqual(JSON.parse(receipt).history.v5,JSON.parse(prior));
  });
  await t.test('private installation evidence and owner controls remain denied to all client/service roles',()=>{
   for(const role of ['anon','authenticated','service_role']){
    assert.equal(f.q(`select has_table_privilege('${role}','production_control.worker_supervisor_retry_envelope_installation_v6','SELECT')`),'f');
    assert.equal(f.q(`select has_function_privilege('${role}','production_control.worker_supervisor_control_v1(jsonb)','EXECUTE')`),'f');
   }
  });
  await t.test('real early BEGIN: sanitized canonical retry time; reservation/job attempts unchanged; no worker',async()=>{
   f.toggle(true);f.start({budget:1,duration_seconds:60});const e=f.batch().messages[0];
   await assert.rejects(f.consume(e),error=>{
    assert.equal(error.code,'SUPERVISOR_NOT_DUE_OR_BUSY');assert.equal(error.failureClass,'BUSY');
    assert.ok(error.retryAfterSeconds>=1);
    assert.ok(queueRetry(error,{deliveryCount:1,expiresAt:new Date(Date.now()+540000)}).afterSeconds>=5);return true;
   });
   assert.equal(f.status().consumed,0);assert.equal(f.status().counts.active_claims,0);f.stop();f.toggle(false);
  });
  await t.test('existing synthetic upsert creates four truthful pending jobs without scoring preparation or after-hook claims',async()=>{
   f.toggle(true);const result=await createCertificationWorkerDemand({env:f.env,dependencies:f.dependencies,onCheckpoint:demandCheckpointSink(f.cluster)});
   assert.equal(result.canonical_outcome,'COMMITTED');assert.equal(result.preparation,'NOT_REQUIRED_FOR_DERIVED_WORK');
   assert.equal(f.status().counts.pending_work,4);
   assert.equal(f.calls.some(c=>c.operation?.startsWith('WORKERS.')),false);
   for(const engine of f.startInput().engines)assert.equal(f.job(engine).delivery_attempts,0);
  });
  await t.test('native SDK + corrected envelope + BEGIN CAS + existing worker/claim/output/FINISH + duplicate + STOP',async()=>{
   f.start({budget:1,duration_seconds:60});const e=f.batch().messages[0];await f.due(e);let acks=0;
   globalThis.fetch=async(url,init)=>{
    assert.equal(new URL(url).origin,'https://iad1.vercel-queue.com');assert.equal(init.method,'DELETE');acks++;return new Response(null,{status:204});
   };
   const client=new QueueClient({region:'iad1',deploymentId:f.bound.deployment.deployment_id,token:'synthetic-local-only',telemetry:{isEnabled:false}});
   const callback=client.handleCallback(async(message,meta)=>{requireQueueEnvelopeMetadata(meta);
    const result=await consumeCertificationQueueMessage(message,meta,{env:f.env,dependencies:f.dependencies});
    if(result.uncertain)throw Object.assign(new Error('SUPERVISOR_ACK_UNKNOWN'),{queueDisposition:'RECONCILE'});
   },{visibilityTimeoutSeconds:90,retry:queueRetry});
   const created=new Date(),expires=new Date(Date.now()+540000);
   const request=()=>new Request(f.bound.deployment.deployment_origin+'/api/internal/derived-worker/queue',{method:'POST',headers:{
    'content-type':'application/json','ce-type':'com.vercel.queue.v2beta','ce-vqsqueuename':QUEUE_TOPIC,'ce-vqsconsumergroup':'synthetic',
    'ce-vqsmessageid':'msg_synthetic','ce-vqsreceipthandle':'local_synthetic','ce-vqsdeliverycount':'1','ce-vqsregion':'iad1',
    'ce-vqscreatedat':created.toISOString(),'ce-vqsexpiresat':expires.toISOString(),'ce-vqsvisibilitydeadline':new Date(Date.now()+300000).toISOString()},body:JSON.stringify(e.message)});
   const run=()=>handleQueueEnvelope(request(),callback,{bound:f.bound});
   assert.equal((await run()).status,200);assert.equal(f.status().consumed,1);
   const ticks=f.calls.filter(c=>c.operation==='WORKERS.DELIVERY_TICK').length;
   assert.equal((await run()).status,200);assert.equal(f.calls.filter(c=>c.operation==='WORKERS.DELIVERY_TICK').length,ticks);
   for(const engine of f.startInput().engines)assert.equal(f.job(engine).status,'SUCCEEDED');
   assert.equal(f.status().counts.pending_work,0);assert.equal(f.status().counts.active_claims,0);
   f.stop();f.toggle(false);assert.equal((await run()).status,200);assert.equal(f.status().state,'OFF');assert.equal(acks,3);
   assert.equal(f.q('select auction_revision from scoring_authority.calcutta_v1_current'),'2');
   assert.equal(f.q('select to_jsonb(c)from scoring_authority.calcutta_v1_current c'),auction);
   assert.equal(f.q(`select jsonb_array_length(a.auction_manifest->'purchases')from scoring_authority.calcutta_v1_auction_fact_revisions a
    join scoring_authority.calcutta_v1_current c on c.auction_revision_id=a.auction_revision_id`),'0');
  });
 }finally{globalThis.fetch=originalFetch;if(f)await destroyIsolatedCluster(f.cluster);}
});
