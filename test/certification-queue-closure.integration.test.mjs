import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {QueueClient} from '@vercel/queue';
import {createGlobalFaultFixture} from './support/reliability/certification-global-fault-fixture.mjs';
import {sqlFile,sqlResult,jsonLiteral,repositoryRoot,destroyIsolatedCluster} from './support/reliability/postgres17.mjs';
import {createCertificationWorkerDemand} from '../tools/reliability/certification-worker-demand.mjs';
import {demandCheckpointSink} from './support/reliability/certification-demand-checkpoint.mjs';
import {handleQueueEnvelope,requireQueueEnvelopeMetadata} from '../lib/certification-queue-envelope.js';
import {QUEUE_CONTRACT,QUEUE_TOPIC,consumeCertificationQueueMessage,queueRetry,queueRuntimeIdentity} from '../lib/certification-queue-supervision.js';
import {queueDatabaseFailure} from '../lib/certification-queue-errors.js';
const artifact=repositoryRoot+'/supabase/production_incremental/certification-queue-routing-closure-v7.sql';
test('routing closure v7: actual PostgreSQL 17/safeupdate, canonical state, native SDK and unchanged worker',async t=>{
 let f;const previous=globalThis.fetch;
 try{
  f=await createGlobalFaultFixture();
  sqlFile(f.cluster,f.database,repositoryRoot+'/supabase/production_incremental/certification-queue-retry-envelope-v6.sql',{role:''});
  const source=await readFile(artifact,'utf8'),patch=JSON.parse(source.split('$manifest$')[1])[0];
  const history=f.q('select to_jsonb(t)from production_control.worker_supervisor_retry_envelope_installation_v6 t');
  const snapshot=()=>f.q(`select jsonb_build_object('supervisor',(select to_jsonb(s)from production_control.worker_supervisor_v1 s),
   'invocations',(select jsonb_agg(to_jsonb(i)order by invocation_id)from production_control.worker_supervisor_invocations_v1 i),
   'jobs',(select jsonb_agg(to_jsonb(j)order by engine_key)from scoring_authority.competition_recalculation_jobs j),
   'audit',(select count(*)from production_control.operation_audit_events))`);
  const register=e=>{
   const id='msg_local_'+e.message.invocation_id;
   f.ownerQueue('publication',{action:'TRY',invocation_id:e.message.invocation_id});
   f.ownerQueue('publication',{action:'ACK',invocation_id:e.message.invocation_id,message_id:id});return id;
  };
  const disposition=(e,id)=>f.control()('DISPOSITION',{message:e.message,runtime:f.bound.deployment,provider_message_id:id});
  function transport(e,id,{horizon=5,count=9,prefetched=false}={}){
   const now=Date.now(),created=new Date(now-600000).toISOString(),expires=new Date(now+horizon*1000).toISOString();
   let closed=false;const calls=[];
   const request=()=>new Request(f.bound.deployment.deployment_origin+'/api/internal/derived-worker/queue',{method:'POST',headers:{
    'content-type':'application/json','ce-type':'com.vercel.queue.v2beta','ce-vqsqueuename':QUEUE_TOPIC,'ce-vqsconsumergroup':'synthetic',
    'ce-vqsmessageid':id,'ce-vqsregion':'iad1',...(prefetched?{'ce-vqsreceipthandle':'synthetic_receipt','ce-vqsdeliverycount':String(count),
     'ce-vqscreatedat':created,'ce-vqsexpiresat':expires,'ce-vqsvisibilitydeadline':new Date(now+Math.min(horizon-1,300)*1000).toISOString()}:{} )},
    body:prefetched?JSON.stringify(e.message):undefined});
   const fetchImpl=async(url,init)=>{
    assert.equal(new URL(url).origin,'https://iad1.vercel-queue.com');
    assert.equal(new Headers(init.headers).get('Vqs-Deployment-Id'),f.bound.deployment.deployment_id);
    calls.push({method:init.method,body:init.body,visibility:new Headers(init.headers).get('Vqs-Visibility-Timeout-Seconds')});
    if(init.method==='POST')return closed?new Response(null,{status:410}):new Response(JSON.stringify({messageId:id,
     receiptHandle:'synthetic_receipt',deliveryCount:count,timestamp:created,expiresAt:expires,
     body:Buffer.from(JSON.stringify(e.message)).toString('base64')})+'\n',{headers:{'content-type':'application/x-ndjson'}});
    if(init.method==='DELETE'){closed=true;return new Response(null,{status:204});}return Response.json({success:true});
   };
   return {request,fetchImpl,calls};
  }
  const terminal=async(e,id,reason)=>{
   const before=snapshot(),begin=f.calls.filter(c=>c.operation==='BEGIN').length;
   const m=transport(e,id);const response=await handleQueueEnvelope(m.request(),()=>assert.fail('no SDK/worker BEGIN'),{
    bound:f.bound,control:f.control(),getToken:async()=>'synthetic-local-only',fetchImpl:m.fetchImpl});
   assert.equal(response.status,200);const value=await response.json();assert.equal(value.reason,reason);
   assert.equal(value.execution_authorized,false);assert.equal(value.transport_acknowledged,true);
   assert.equal(snapshot(),before);assert.equal(f.calls.filter(c=>c.operation==='BEGIN').length,begin);
   assert.deepEqual(m.calls.map(c=>c.method),['POST','POST','DELETE']);assert.equal(m.calls[0].visibility,'0');
   assert.equal((await handleQueueEnvelope(m.request(),()=>assert.fail(),{bound:f.bound,control:f.control(),getToken:async()=>'synthetic',fetchImpl:m.fetchImpl})).status,200);
   assert.equal(m.calls.filter(c=>c.method==='DELETE').length,1);
  };
  await t.test('forward install is atomic, exact predecessor/hash guarded, replayable and metadata/history preserving',()=>{
   const bad=source.replace(patch.new_hash,'0'.repeat(64));const rejected=sqlResult(f.cluster,f.database,bad,{role:''});
   assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/PATCH_HASH_DRIFT/);
   assert.equal(f.q("select to_regclass('production_control.worker_supervisor_routing_closure_installation_v7')is null"),'t');
   sqlFile(f.cluster,f.database,artifact,{role:''});const receipt=f.q('select to_jsonb(t)from production_control.worker_supervisor_routing_closure_installation_v7 t');
   sqlFile(f.cluster,f.database,artifact,{role:''});assert.equal(f.q('select to_jsonb(t)from production_control.worker_supervisor_routing_closure_installation_v7 t'),receipt);
   assert.equal(f.q('select to_jsonb(t)from production_control.worker_supervisor_retry_envelope_installation_v6 t'),history);
   assert.equal(f.q("select current_setting('safeupdate.enabled')"),'on');
   assert.equal(f.q(`select encode(extensions.digest(prosrc,'sha256'),'hex')from pg_proc where oid='${patch.signature}'::regprocedure`),patch.new_hash);
   const unsafe=sqlResult(f.cluster,f.database,'update production_control.worker_supervisor_v1 set reason=reason',{role:''});
   assert.notEqual(unsafe.status,0);assert.match(unsafe.stderr,/UPDATE requires a WHERE clause/);
  });
  await t.test('private cores/owner mint/receipt protected; client and foreign authority cannot obtain terminal ACK',async()=>{
   for(const role of ['anon','authenticated','service_role']){
    for(const name of ['worker_supervisor_control_v1','worker_supervisor_queue_publication_v2']){
     assert.equal(f.q(`select has_function_privilege('${role}','production_control.${name}(jsonb)','EXECUTE')`),'f');
     assert.notEqual(sqlResult(f.cluster,f.database,`set role ${role};select production_control.${name}(${jsonLiteral({...f.bound,action:'START'})})`,{role}).status,0);
    }
    assert.equal(f.q(`select has_table_privilege('${role}','production_control.worker_supervisor_routing_closure_installation_v7','SELECT')`),'f');
   }
   for(const role of ['anon','authenticated'])assert.notEqual(sqlResult(f.cluster,f.database,`set role ${role};select public.execute_certification_queue_supervisor_v2('{}')`,{role}).status,0);
   for(const env of [{VERCEL_ENV:'development'},{VERCEL_ENV:'production'},{VERCEL_PROJECT_ID:'foreign'},
    {BAGGER_CERTIFICATION_RESOURCE_ID:'PRODUCTION'},
    {SUPABASE_SCORING_MIRROR_URL:'https://foreign.supabase.co'}])assert.throws(()=>queueRuntimeIdentity({...f.env,...env},f.dependencies));
  });
  f.toggle(true);f.start({budget:1,duration_seconds:60});const stopped=f.batch().messages[0],stoppedId=register(stopped);f.stop();f.toggle(false);
  await t.test('STOPPED reads canonical OFF/cancellation and ACKs retained over-budget/short-lifetime delivery without mutation',()=>terminal(stopped,stoppedId,'STOPPED'));
  await t.test('wrong resource/project/release/deployment/message and arbitrary terminal claim remain denied without ACK',async()=>{
   const original={contract:QUEUE_CONTRACT,...f.bound,operation:'DISPOSITION',message:stopped.message,runtime:f.bound.deployment,provider_message_id:stoppedId};
   for(const change of [{resource:{...f.bound.resource,resource_id:'PRODUCTION'}},{resource:{...f.bound.resource,project_ref:'wrong'}},
    {deployment:{...f.bound.deployment,deployment_id:'dpl_Foreign'}},{deployment:{...f.bound.deployment,release_commit:'d'.repeat(40)}},
    {runtime:{...f.bound.deployment,deployment_class:'production'}},{provider_message_id:'foreign'},{message:{...stopped.message,state:'STOPPED'}},{terminal:'STOPPED'}]){
    const r=await f.dependencies.fetchImpl(f.resource.project_url+'/rest/v1/rpc/execute_certification_queue_supervisor_v2',
     {body:JSON.stringify({input:{...original,...change}})});assert.equal(r.ok,false);assert.equal((await r.json()).code,'42501');
   }
  });
  f.toggle(true);f.start({budget:1,duration_seconds:60});const expired=f.batch().messages[0];
  await t.test('unconfirmed publication is RECONCILE, never terminal ACK from an arbitrary message identity',async()=>{
   const before=snapshot(),r=await disposition(expired,'msg_unconfirmed');assert.equal(r.disposition,'RECONCILE');
   assert.equal(r.reason,'PUBLICATION_UNKNOWN');assert.equal(snapshot(),before);
  });
  const expiredId=register(expired);
  await t.test('old cancelled reservation safely closes even after a newer supervisor epoch',()=>terminal(stopped,stoppedId,'CANCELLED'));
  await t.test('eligible delivery limit remains active and does not consume reservation/failure/job budgets',async()=>{
   const m=transport(expired,expiredId,{count:6,horizon:540}),before=snapshot();
   const r=await handleQueueEnvelope(m.request(),()=>assert.fail(),{bound:f.bound,control:f.control(),getToken:async()=>'synthetic',fetchImpl:m.fetchImpl});
   assert.equal(r.status,503);assert.equal(snapshot(),before);assert.equal(m.calls.filter(c=>c.method==='DELETE').length,0);
  });
  await t.test('registered invocation cannot acknowledge a foreign provider message',async()=>{
   // A separate valid owner-issued reservation without publication ACK.
   // Current one is already registered; foreign provider identity is rejected.
   await assert.rejects(disposition(expired,'msg_foreign'));
  });
  await t.test('real SDK NOT_DUE retries >=5 seconds; uncertain committed BEGIN remains reconcilable without budget changes',async()=>{
   const m=transport(expired,expiredId,{count:1,horizon:540,prefetched:true});globalThis.fetch=m.fetchImpl;
   const client=new QueueClient({region:'iad1',deploymentId:f.bound.deployment.deployment_id,token:'synthetic-local-only',telemetry:{isEnabled:false}});
   const callback=client.handleCallback(async(message,meta)=>{requireQueueEnvelopeMetadata(meta,message);
    await consumeCertificationQueueMessage(message,meta,{env:f.env,dependencies:f.dependencies});
   },{visibilityTimeoutSeconds:90,retry:queueRetry});
   let before=snapshot();assert.equal((await handleQueueEnvelope(m.request(),callback,{bound:f.bound,control:f.control(),getToken:async()=>'synthetic',fetchImpl:m.fetchImpl})).status,200);
   assert.equal(snapshot(),before);assert.ok(JSON.parse(m.calls.at(-1).body).visibilityTimeoutSeconds>=5);
   // Owned rollback-only canonical slot contention. No manual job/claim rows.
   await f.due(expired);
   const input={contract:QUEUE_CONTRACT,...f.bound,operation:'BEGIN',message:expired.message,runtime:f.bound.deployment};
   const probe={...input,operation:'DISPOSITION',provider_message_id:expiredId};
   const unknown=f.q(`begin;set local role service_role;set local "request.jwt.claim.role"='service_role';
    with admitted as materialized(select public.execute_certification_queue_supervisor_v2(${jsonLiteral(input)}) a),
    tick as materialized(select public.execute_certification_queue_supervisor_v2(${jsonLiteral({...input,operation:'TICK_RESULT',message:undefined,runtime:undefined,
      invocation_id:expired.message.invocation_id,success:false,classification:'RETRYABLE',code:'SYNTHETIC_LOCAL_ROLLBACK'})}||jsonb_build_object('run_token',a->>'run_token')) t from admitted),
    finished as materialized(select public.execute_certification_queue_supervisor_v2(${jsonLiteral({...input,operation:'FINISH',message:undefined,runtime:undefined,
      invocation_id:expired.message.invocation_id,outcome:'UNKNOWN'})}||jsonb_build_object('run_token',a->>'run_token')) r from admitted,tick)
    select public.execute_certification_queue_supervisor_v2(${jsonLiteral(probe)})from finished;rollback;`);
   assert.equal(JSON.parse(unknown).disposition,'RECONCILE');assert.equal(JSON.parse(unknown).reason,'UNKNOWN');assert.equal(snapshot(),before);
   // BUSY relative delay is independently certified through the real SDK in
   // closure.test; this read-only layer cannot increment either failure budget.
  });
  await t.test('reservation expires naturally; terminal expiry bypasses lifetime/delivery guards without BEGIN',async()=>{
   const wait=Date.parse(expired.expires_at)-Date.now()+100;if(wait>0)await new Promise(r=>setTimeout(r,wait));
   await terminal(expired,expiredId,'EXPIRED');f.stop();f.toggle(false);
  });
  await t.test('real canonical BUSY capacity produces a 15-second native retry and no attempt/failure changes',async()=>{
   f.toggle(true);f.start({budget:2,duration_seconds:120});const [a,b]=f.batch().messages;register(a);const id=register(b);await f.due(a);
   const before=snapshot(),base={contract:QUEUE_CONTRACT,...f.bound,operation:'BEGIN',runtime:f.bound.deployment};
   // One rollback-only owned transaction holds the existing supervisor slot
   // until the second lawful reservation is due. No job/claim rows inserted,
   // no timer/lease shortened and no counter change survives the failed BEGIN.
   const r=sqlResult(f.cluster,f.database,`\\set VERBOSITY verbose
    begin;set local role service_role;set local "request.jwt.claim.role"='service_role';
    select public.execute_certification_queue_supervisor_v2(${jsonLiteral({...base,message:a.message})});
    select pg_sleep(greatest(0,extract(epoch from('${b.scheduled_at}'::timestamptz-clock_timestamp())))+0.1);
    select public.execute_certification_queue_supervisor_v2(${jsonLiteral({...base,message:b.message})});rollback;`,{role:'service_role'});
   assert.notEqual(r.status,0);assert.match(r.stderr,/SUPERVISOR_NOT_DUE_OR_BUSY/);
   const details=/DETAIL:\s*([^\n]+)/.exec(r.stderr)?.[1];assert.deepEqual(JSON.parse(details),{reason:'BUSY',retry_after_seconds:15});
   assert.equal(snapshot(),before);
   const m=transport(b,id,{count:1,horizon:540,prefetched:true});globalThis.fetch=m.fetchImpl;
   const client=new QueueClient({region:'iad1',deploymentId:f.bound.deployment.deployment_id,token:'synthetic-local-only',telemetry:{isEnabled:false}});
   const callback=client.handleCallback(async(message,meta)=>{requireQueueEnvelopeMetadata(meta,message);
    throw queueDatabaseFailure({status:400},{code:'PT409',message:'SUPERVISOR_NOT_DUE_OR_BUSY',details},'CONTROL_FAILURE','BEGIN');
   },{visibilityTimeoutSeconds:90,retry:queueRetry});
   assert.equal((await handleQueueEnvelope(m.request(),callback,{bound:f.bound,control:f.control(),getToken:async()=>'synthetic',fetchImpl:m.fetchImpl})).status,200);
   assert.equal(JSON.parse(m.calls.at(-1).body).visibilityTimeoutSeconds,15);assert.equal(snapshot(),before);f.stop();f.toggle(false);
  });
  await t.test('genuine four-family demand goes through native SDK, BEGIN CAS, existing worker, claim/output/FINISH',async()=>{
   f.toggle(true);const d=await createCertificationWorkerDemand({env:f.env,dependencies:f.dependencies,onCheckpoint:demandCheckpointSink(f.cluster)});
   assert.equal(d.canonical_outcome,'COMMITTED');assert.equal(d.preparation,'NOT_REQUIRED_FOR_DERIVED_WORK');assert.equal(f.status().counts.pending_work,4);
   f.start({budget:1,duration_seconds:60});const e=f.batch().messages[0],id=register(e);await f.due(e);
   const m=transport(e,id,{count:1,horizon:540,prefetched:true});globalThis.fetch=m.fetchImpl;
   const client=new QueueClient({region:'iad1',deploymentId:f.bound.deployment.deployment_id,token:'synthetic-local-only',telemetry:{isEnabled:false}});
   const callback=client.handleCallback(async(message,meta)=>{requireQueueEnvelopeMetadata(meta,message);
    const result=await consumeCertificationQueueMessage(message,meta,{env:f.env,dependencies:f.dependencies});assert.equal(result.outcome,'SUCCEEDED');
   },{visibilityTimeoutSeconds:90,retry:queueRetry});
   const r=await handleQueueEnvelope(m.request(),callback,{bound:f.bound,control:f.control(),getToken:async()=>'synthetic',fetchImpl:m.fetchImpl});
   assert.equal(r.status,200);assert.equal(f.status().consumed,1);
   for(const engine of f.startInput().engines)assert.equal(f.job(engine).status,'SUCCEEDED');
   assert.equal(f.status().counts.pending_work,0);assert.equal(f.status().counts.active_claims,0);
   await terminal(e,id,'REPLAY');f.stop();f.toggle(false);
   f.toggle(true);f.start({budget:1,duration_seconds:60});await terminal(e,id,'STALE_EPOCH');f.stop();f.toggle(false);
  });
  await t.test('HALTED unused reservation closes; RESUME requires owner/new reservation; no ordinary delivery clears latch',async()=>{
   f.toggle(true);f.start({budget:2,duration_seconds:120});const [a,b]=f.batch().messages;f.armGlobal('GLOBAL_DETERMINISTIC');register(a);const id=register(b);
   await f.due(a);await f.consume(a);assert.equal(f.status().state,'HALTED');
   await terminal(b,id,'HALTED');assert.equal(f.status().state,'HALTED');f.stop();f.correctGlobal();
   f.start({action:'RESUME',budget:1,duration_seconds:60,reconciliation_reason:'Owned local synthetic cause corrected and outcomes known'});f.stop();f.toggle(false);
   assert.equal(f.status().state,'OFF');assert.equal(f.status().counts.pending_work,0);assert.equal(f.status().counts.active_claims,0);
  });
 }finally{globalThis.fetch=previous;if(f)await destroyIsolatedCluster(f.cluster);}
});
