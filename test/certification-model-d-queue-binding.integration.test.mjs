// Owned PG17/provider model only. No hosted identity, demand or fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createModelDFixture} from './support/reliability/certification-model-d-fixture.mjs';
import {destroyIsolatedCluster,sqlResult,jsonLiteral} from './support/reliability/postgres17.mjs';
import {validateOwnerQueueBatch} from '../lib/certification-queue-publication.js';
import {handleOwnerQueuePublication,createPreviewQueuePublisher,PUBLICATION_PATH} from '../lib/certification-queue-publisher.js';
import {supervisorEnvelope} from '../lib/certification-worker-supervision.js';
import {certificationResourceEnvironment} from '../lib/canonical-resource-registration.js';
import original from '../config/certification-resource-registration.json' with {type:'json'};
import {QueueClient} from '@vercel/queue';
import {handleQueueEnvelope,requireQueueEnvelopeMetadata} from '../lib/certification-queue-envelope.js';
import {consumeCertificationQueueMessage,queueRetry,QUEUE_TOPIC} from '../lib/certification-queue-supervision.js';
import {MODEL_D_WORKER_ENGINES} from '../lib/certification-worker-engines.js';

test('Model D exact publication registration → owner permit → Preview provider → private NO_WORK → single use → STOP',async t=>{
 const f=await createModelDFixture({provision:false});
 try {
 const before=f.dependencies.fetchImpl;
 f.dependencies.fetchImpl=async(url,init)=>{
  if(!url.endsWith('/execute_certification_queue_publication_v3'))return before(url,init);
  const r=sqlResult(f.cluster,f.database,`\\set VERBOSITY verbose\nset role service_role;select public.execute_certification_queue_publication_v3(${jsonLiteral(JSON.parse(init.body).input)})`,{role:'service_role'});
  if(r.status!==0){const m=/ERROR:\s+([A-Z0-9]{5}):\s*([^\n]+)/.exec(r.stderr);assert.ok(m);return Response.json({code:m[1],message:m[2]},{status:400});}
  return Response.json(JSON.parse(r.stdout.trim()));
 };
 const permit=()=>f.owner('worker_supervisor_publisher_permit_v3',{...f.bound,expected_revision:f.status().revision});
 const request=p=>new Request(f.deployment.deployment_origin+PUBLICATION_PATH,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({permit:p})});
 await t.test('disabled placeholders and forged context cannot authorize Model D',()=>{
  assert.equal(certificationResourceEnvironment(f.env).eligible,false);
  assert.throws(()=>validateOwnerQueueBatch({binding:f.bound,messages:[]}),/BINDING_DENIED/);
  assert.throws(()=>validateOwnerQueueBatch({binding:f.bound,messages:[]},structuredClone(f.bound)),/BINDING_DENIED/);
  for(const purpose of ['other',undefined])assert.throws(()=>supervisorEnvelope(f.env,{registrationManifest:{...f.registrationManifest,purpose}}));
 });
 await t.test('all registered resource and deployment fields match trusted runtime exactly',()=>{
  const batch={binding:f.bound,messages:[]};assert.equal(validateOwnerQueueBatch(batch,f.bound),batch);
  for(const section of ['resource','deployment'])for(const key of Object.keys(f.bound[section])){
   const b=structuredClone(batch);b.binding[section][key]=typeof b.binding[section][key]==='number'?2:'foreign';
   assert.throws(()=>validateOwnerQueueBatch(b,f.bound),/BINDING_DENIED/,section+'.'+key);
  }
  const old={resource:original.registration,deployment:{...f.deployment,vercel_project_id:original.registration.vercel_project_id,git_branch:original.registration.git_branch}};
  assert.throws(()=>validateOwnerQueueBatch({binding:old,messages:[]},f.bound),/BINDING_DENIED/);
  assert.throws(()=>validateOwnerQueueBatch(batch),/BINDING_DENIED/);
  for(const section of ['resource','deployment'])assert.throws(()=>validateOwnerQueueBatch({binding:{...f.bound,[section]:old[section]},messages:[]},f.bound),/BINDING_DENIED/);
 });
 await t.test('provider Preview identity/topic/deployment pin and client target denial',async()=>{
  const jwt=d=>['synthetic',Buffer.from(JSON.stringify({owner_id:d.vercel_team_id,project_id:d.vercel_project_id,environment:'preview',exp:Math.floor(Date.now()/1000)+120})).toString('base64url'),'synthetic'].join('.');
  let options;const send=await createPreviewQueuePublisher({env:f.env,dependencies:f.dependencies,getToken:async()=>jwt(f.deployment),clientFactory:o=>{options=o;return{send:async(topic,message)=>{assert.equal(topic,'bagger-certification-derived-wake-v2');assert.deepEqual(Object.keys(message).sort(),['invocation_id','version']);return{messageId:'msg_model_d'};}};}});
  await send({version:'certification-queue-supervision-v2',invocation_id:randomUUID()},{});assert.equal(options.deploymentId,f.deployment.deployment_id);
  await assert.rejects(createPreviewQueuePublisher({env:f.env,dependencies:f.dependencies,getToken:async()=>jwt({...f.deployment,vercel_project_id:original.registration.vercel_project_id}),clientFactory:()=>assert.fail()}),/IDENTITY_DENIED/);
  for(const field of ['VERCEL_ENV','VERCEL_PROJECT_ID','VERCEL_DEPLOYMENT_ID','VERCEL_GIT_COMMIT_SHA','VERCEL_GIT_COMMIT_REF','BAGGER_CERTIFICATION_RESOURCE_ID','SUPABASE_SCORING_MIRROR_URL'])await assert.rejects(createPreviewQueuePublisher({env:{...f.env,[field]:'foreign'},dependencies:f.dependencies,getToken:()=>assert.fail()}));
  await assert.rejects(handleOwnerQueuePublication(new Request(f.deployment.deployment_origin+PUBLICATION_PATH,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({permit:'0'.repeat(64),resource:f.resource})}),{env:f.env,dependencies:f.dependencies,createSend:()=>assert.fail()}),/REQUEST_DENIED/);
 });
 await t.test('roles cannot mint permit and fabricated reservation cannot consume',async()=>{
  for(const role of ['anon','authenticated','service_role'])assert.notEqual(sqlResult(f.cluster,f.database,`set role ${role};select production_control.worker_supervisor_publisher_permit_v3('{}')`,{role}).status,0);
  assert.throws(()=>f.rpc('execute_certification_queue_supervisor_v2',{contract:'certification-queue-supervision-v2',...f.bound,operation:'BEGIN',invocation_id:randomUUID()}));
 });
 await t.test('canonical epoch/release/supervisor/engine guards remain closed',()=>{
  f.toggle(true);
  for(const engines of [['ARBITRARY'],['TOURNAMENT_FINAL_RECAP']])assert.throws(()=>f.start({engines}));
  assert.throws(()=>f.start({expected_revision:f.status().revision-1}));
  for(const [field,value] of [['authority_epoch_id',randomUUID()],['binding_id',randomUUID()],['activation_revision',0],['admission_revision',0],['generation_revision',0]]){
   const context=f.queueContext();assert.ok(field in context,field);context[field]=value;
   assert.throws(()=>f.owner('worker_supervisor_control_v1',{...f.bound,action:'START',request_id:randomUUID(),expected_revision:f.status().revision,expected_context:context,duration_seconds:60,budget:1,cadence_seconds:60,slots:1,engines:[...MODEL_D_WORKER_ENGINES]}));
  }
  f.start();const batch=f.batch();assert.equal(validateOwnerQueueBatch(batch,f.bound),batch);assert.deepEqual(f.status().engines,[...MODEL_D_WORKER_ENGINES]);
 });
 let entry;
 await t.test('actual application publisher uses canonical permit/batch, replay has no second send',async()=>{
  const sent=[];const run=p=>handleOwnerQueuePublication(request(p),{env:f.env,dependencies:f.dependencies,createSend:async()=>async(message,options)=>{sent.push({message,options});return{messageId:'msg_local_'+message.invocation_id};}});
  entry=f.batch().messages[0];const p=permit();const result=await run(p.permit);assert.equal(result.ok,true);assert.equal(sent.length,1);
  await assert.rejects(run(p.permit));await run(permit().permit);assert.equal(sent.length,1);
 });
 await t.test('private canonical consumer NO_WORK single-use then STOP closes',async()=>{
  await new Promise(r=>setTimeout(r,Math.max(0,Date.parse(entry.scheduled_at)-Date.now()+100)));
  let result;const previous=globalThis.fetch,providerCalls=[];
  const provider=async(url,init)=>{assert.equal(new URL(url).origin,'https://iad1.vercel-queue.com');assert.equal(new Headers(init.headers).get('Vqs-Deployment-Id'),f.deployment.deployment_id);providerCalls.push(init.method);return init.method==='DELETE'?new Response(null,{status:204}):Response.json({success:true});};
  const client=new QueueClient({region:'iad1',deploymentId:f.deployment.deployment_id,token:'synthetic-local-only',telemetry:{isEnabled:false}});
  const callback=client.handleCallback(async(message,metadata)=>{requireQueueEnvelopeMetadata(metadata,message);result=await consumeCertificationQueueMessage(message,metadata,{env:f.env,dependencies:f.dependencies});},{visibilityTimeoutSeconds:90,retry:queueRetry});
  const now=Date.now(),req=new Request(f.deployment.deployment_origin+'/api/internal/derived-worker/queue',{method:'POST',headers:{'content-type':'application/json','ce-type':'com.vercel.queue.v2beta','ce-vqsqueuename':QUEUE_TOPIC,'ce-vqsconsumergroup':'synthetic','ce-vqsmessageid':'msg_local_'+entry.message.invocation_id,'ce-vqsregion':'iad1','ce-vqsreceipthandle':'synthetic_receipt','ce-vqsdeliverycount':'1','ce-vqscreatedat':new Date(now-1000).toISOString(),'ce-vqsexpiresat':new Date(now+540000).toISOString()},body:JSON.stringify(entry.message)});
  try {globalThis.fetch=provider;const response=await handleQueueEnvelope(req,callback,{bound:f.bound,control:f.control(),getToken:async()=> 'synthetic-local-only',fetchImpl:provider});assert.equal(response.status,200);}finally{globalThis.fetch=previous;}
  assert.ok(providerCalls.includes('DELETE'));assert.equal(result.outcome,'SUCCEEDED');assert.equal(result.cycles,1);
  const duplicate=await f.consume(entry);assert.equal(duplicate.admitted,false);
  f.stop();
  // Bounded owned control-state model: no injected jobs or competitive facts.
  f.start();const haltedEntry=f.batch().messages[0];f.register(haltedEntry);
  f.q("update production_control.worker_supervisor_v1 set state='HALTED',halt_latched=true where singleton");
  await assert.rejects(f.consume(haltedEntry));
  assert.throws(()=>permit());f.stop();
  await assert.rejects(f.consume(haltedEntry));
  f.toggle(false);assert.equal(f.status().state,'OFF');
  for(const table of ['players','matches','match_holes','hole_scores'])assert.equal(f.q('select count(*)from scoring_authority.'+table),'0');
  assert.equal(f.status().counts.pending_work,0);assert.equal(f.status().counts.active_claims,0);
 });
 } finally {await destroyIsolatedCluster(f.cluster);}
});
