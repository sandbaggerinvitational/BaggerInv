// Actual canonical operations/calculator/Queue SDK and owned PG17+pg-safeupdate.
// Synthetic provider transport only; no hosted credentials or real egress.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {QueueClient} from '@vercel/queue';
import {createCalcuttaQueueFixture,calcuttaScopeArtifact} from './support/reliability/certification-calcutta-queue-fixture.mjs';
import {destroyIsolatedCluster,sqlResult,jsonLiteral,restartIsolatedCluster} from './support/reliability/postgres17.mjs';
import {predecessor} from '../lib/calcutta-management-model.js';
import {QUEUE_TOPIC,queueRetry,consumeCertificationQueueMessage,queueRuntimeIdentity} from '../lib/certification-queue-supervision.js';
import {handleQueueEnvelope,requireQueueEnvelopeMetadata} from '../lib/certification-queue-envelope.js';
import {CERTIFICATION_WORKER_ENGINES} from '../lib/certification-worker-engines.js';
import {certificationOperationRpc} from '../lib/certification-runtime-server.js';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
test('Calcutta closed engine compatibility: genuine demand -> private Queue -> existing processor -> canonical result',async t=>{
 let f,stack;const originalFetch=globalThis.fetch,evidence={hosted:false,postgres:17,safeupdate:'on',cases:[],durationsMs:[]};
 const check=async(name,fn)=>{let failed;await t.test(name,async()=>{try{await fn();evidence.cases.push({name,result:'PASS'});}catch(e){failed=e;throw e;}});if(failed)throw failed;};
 try {
  f=await createCalcuttaQueueFixture({install:false});
  const q=text=>f.q(text),source=await readFile(calcuttaScopeArtifact,'utf8'),patches=JSON.parse(source.split('$manifest$')[1]);
  const metadata=()=>q(`select jsonb_agg(jsonb_build_object('id',oid,'owner',proowner,'acl',proacl,'security',prosecdef,'config',proconfig)order by oid)
   from pg_proc where oid=any(array[${patches.map(p=>"'"+p.signature+"'::regprocedure").join(',')}]::oid[])`);
  const domainImage=()=>q(`select jsonb_agg(jsonb_build_object('id',oid,'body',prosrc,'owner',proowner,'acl',proacl,'config',proconfig)order by oid)
   from pg_proc where proname like '%calcutta%'and proname not like 'worker_supervisor_%'`);
  const rls=()=>q("select jsonb_agg(jsonb_build_object('oid',oid,'rls',relrowsecurity,'acl',relacl)order by oid)from pg_class where relnamespace in('scoring_authority'::regnamespace,'participant_identity'::regnamespace)and relkind='r'");
  const history=()=>q(`select jsonb_build_object('v7',(select to_jsonb(t)from production_control.worker_supervisor_routing_closure_installation_v7 t),
   'attempt',(select to_jsonb(t)from production_control.derived_attempt_cycle_installation_v1 t))`);
  const oldMetadata=metadata(),oldDomain=domainImage(),oldRls=rls(),oldHistory=history();
  const auctions=()=>q("select jsonb_agg(to_jsonb(a)order by auction_revision)from scoring_authority.calcutta_v1_auction_fact_revisions a");
  let emptyRevision=q("select to_jsonb(a)from scoring_authority.calcutta_v1_auction_fact_revisions a where auction_revision=2");
  const publications=()=>q("select jsonb_agg(to_jsonb(a)order by publication_revision)from scoring_authority.calcutta_v1_publication_revisions a");
  const latest=()=>f.calcuttaJobs().at(-1);
  const newAuction=async price=>{const model=(await stack.transport.calcuttaRequest('management-read')).data;
   return stack.transport.calcuttaRequest('management-entry',{...predecessor(model),operationRequestId:randomUUID(),
    entry:{playerId:'P01',purchasePrice:String(price),owners:[{buyerId:'P12',percentage:'100'}]}});};
  const freshDemand=async()=>{
   await destroyIsolatedCluster(f.cluster);f=null;
   f=await createCalcuttaQueueFixture();f.toggle(true);stack=await f.director();
   emptyRevision=q("select to_jsonb(a)from scoring_authority.calcutta_v1_auction_fact_revisions a where auction_revision=2");
   await newAuction(1);await f.source(stack);
  };
  const native=async(e,overrides={})=>{
   const id=f.register(e);await f.due(e);const cycleStart=performance.now(),calls=[],now=Date.now();
   const fetchImpl=async(url,init)=>{assert.equal(new URL(url).origin,'https://iad1.vercel-queue.com');
    assert.equal(new Headers(init.headers).get('Vqs-Deployment-Id'),f.deployment.deployment_id);calls.push({method:init.method,body:init.body});
    if(init.method==='DELETE')return new Response(null,{status:204});return Response.json({success:true});};
   globalThis.fetch=fetchImpl;
   let value;
   const client=new QueueClient({region:'iad1',deploymentId:f.deployment.deployment_id,token:'synthetic-local-only',telemetry:{isEnabled:false}});
   const callback=client.handleCallback(async(message,meta)=>{requireQueueEnvelopeMetadata(meta,message);
    value=await consumeCertificationQueueMessage(message,meta,{env:f.env,dependencies:f.dependencies,...overrides});
   },{visibilityTimeoutSeconds:90,retry:queueRetry});
   const request=new Request(f.deployment.deployment_origin+'/api/internal/derived-worker/queue',{method:'POST',headers:{
    'content-type':'application/json','ce-type':'com.vercel.queue.v2beta','ce-vqsqueuename':QUEUE_TOPIC,'ce-vqsconsumergroup':'synthetic',
    'ce-vqsmessageid':id,'ce-vqsregion':'iad1','ce-vqsreceipthandle':'synthetic_receipt','ce-vqsdeliverycount':'1',
    'ce-vqscreatedat':new Date(now-1000).toISOString(),'ce-vqsexpiresat':new Date(now+540000).toISOString(),
    'ce-vqsvisibilitydeadline':new Date(now+300000).toISOString()},body:JSON.stringify(e.message)});
   const response=await handleQueueEnvelope(request,callback,{bound:f.bound,control:f.control(),getToken:async()=>'synthetic-local-only',fetchImpl});
   globalThis.fetch=originalFetch;assert.equal(response.status,200);return {value,calls,executionMs:performance.now()-cycleStart};
  };
  const invoke=async(overrides,startOptions={})=>{f.start(startOptions);const batch=f.batch(),e=batch.messages[0];const r=await native(e,overrides);
   evidence.durationsMs.push(r.executionMs);
   let duplicate;
   if(r.value.outcome==='TERMINAL'){
    assert.equal(f.status().state,'HALTED');const before=f.calls.length;
    if(batch.messages.length>1)await assert.rejects(f.consume(batch.messages.at(-1)),/SUPERVISOR_/);
    else {duplicate=await f.consume(e);assert.equal(duplicate.cycles,0);}
    assert.equal(f.calls.slice(before).filter(c=>c.operation?.startsWith('WORKERS.')).length,0);
   }else{duplicate=await f.consume(e);assert.equal(duplicate.cycles,0);}
   f.stop();return {...r,entry:e,duplicate};};
  await check('atomic predecessor/hash mismatch rolls back; metadata, RLS, canonical cores/history preserved; replay converges',()=>{
   const bad=sqlResult(f.cluster,f.database,source.replace(patches[0].new_hash,'0'.repeat(64)),{role:''});assert.notEqual(bad.status,0);assert.match(bad.stderr,/PATCH_HASH_DRIFT/);
   assert.equal(q("select to_regclass('production_control.worker_supervisor_calcutta_installation_v1')is null"),'t');
   assert.equal(metadata(),oldMetadata);f.installCalcutta();const receipt=q('select to_jsonb(t)from production_control.worker_supervisor_calcutta_installation_v1 t');
   f.installCalcutta();assert.equal(q('select to_jsonb(t)from production_control.worker_supervisor_calcutta_installation_v1 t'),receipt);
   assert.equal(metadata(),oldMetadata);assert.equal(domainImage(),oldDomain);assert.equal(rls(),oldRls);assert.equal(history(),oldHistory);
   assert.equal(q("select current_setting('safeupdate.enabled')"),'on');assert.deepEqual(f.status().engines,[...CERTIFICATION_WORKER_ENGINES]);
   assert.equal(f.status().state,'OFF');assert.equal(f.status().remaining,0);
  });
  await check('empty valid auction revision 2: Queue tick discovers no Calcutta work and never claims it',async()=>{
   f.toggle(true);stack=await f.director();assert.equal(f.current().auction_revision,2);assert.deepEqual(f.calcuttaJobs(),[]);
   const before=f.calls.filter(c=>c.operation==='WORKERS.CALCUTTA_CLAIM').length;
   assert.equal((await invoke()).value.outcome,'SUCCEEDED');assert.deepEqual(f.calcuttaJobs(),[]);
   assert.equal(f.calls.filter(c=>c.operation==='WORKERS.CALCUTTA_CLAIM').length,before);
   assert.equal(q("select to_jsonb(a)from scoring_authority.calcutta_v1_auction_fact_revisions a where auction_revision=2"),emptyRevision);
  });
  await check('shipping Director synthetic nonempty successor and lawful match control automatically create canonical demand',async()=>{
   const before=f.calls.filter(c=>c.operation?.startsWith('WORKERS.')).length;
   await newAuction(1);assert.equal(f.current().auction_revision,3);await f.source(stack);
   assert.equal(f.calls.filter(c=>c.operation?.startsWith('WORKERS.')).length,before);
   assert.ok(f.calcuttaJobs().some(j=>j.status==='PENDING')||Number(q("select count(*)from scoring_authority.score_derived_intents_v1 where family='CALCUTTA'and status='PENDING'"))>0);
   assert.equal(q('select count(*)from scoring_authority.hole_scores'),'0');assert.equal(f.current().publication_state,'UNPUBLISHED');
  });
  await check('native SDK delivery -> BEGIN -> fixed registry -> real claim/calculator/result/FINISH; no financial mutation or publication',async()=>{
   const facts=auctions(),pub=publications();const result=await invoke();assert.equal(result.value.outcome,'SUCCEEDED',JSON.stringify(result.value));
   assert.equal(result.value.cycles,1);assert.equal(latest().status,'SUCCEEDED');assert.equal(latest().delivery_attempts,1);
   assert.equal(latest().attempts,1);assert.ok(f.current().result_revision>0);assert.equal(f.current().auction_revision,3);
   assert.equal(auctions(),facts);assert.equal(publications(),pub);assert.equal(f.current().publication_state,'UNPUBLISHED');
   const output=JSON.parse(q('select to_jsonb(r)from scoring_authority.calcutta_v1_result_revisions r where is_current'));
   assert.equal(output.auction_revision,3);assert.equal(output.source_fingerprint,latest().source_fingerprint);
   const payload=output.engine_result_payload;assert.ok(payload&&Object.keys(payload).length);evidence.resultState=output.result_state;
   // Installed fixture payout: overall first place 0.4; one purchased asset and
   // one 100% owner. The existing engine supplies the provisional rank.
   assert.equal(payload.pot,1);assert.equal(payload.golfers.length,1);assert.equal(payload.golfers[0].playerId,'P01');
   assert.equal(payload.golfers[0].currentPayoutValue,0.4);assert.equal(payload.portfolios[0].ownerId,'P12');
   assert.equal(payload.portfolios[0].purchaseCost,1);assert.equal(payload.portfolios[0].currentPayoutValue,0.4);
   assert.equal(payload.tournamentComplete,false);evidence.result={pot:1,purchases:1,owners:1,provisionalValue:0.4,publication:'UNPUBLISHED'};
   assert.equal(q("select count(*)from production_control.operation_audit_events where event_type='PRODUCTION_CALCUTTA_V1_RECALCULATION_COMPLETED'"),'1');
   const ce=JSON.parse(q(`select claim_evidence from production_control.worker_supervisor_invocations_v1 where invocation_id='${result.entry.message.invocation_id}'`));
   assert.equal(ce.filter(v=>v.engine==='CALCUTTA').length,1);assert.ok(!/claim_token|purchase_price|ownership_fraction/.test(JSON.stringify(ce)));
   assert.equal(f.status().counts.pending_work,0);assert.equal(f.status().counts.active_claims,0);
   const before=q('select count(*)from scoring_authority.calcutta_v1_result_revisions');
   assert.equal(result.duplicate.cycles,0);assert.equal(q('select count(*)from scoring_authority.calcutta_v1_result_revisions'),before);
  });
  await check('transient completion transport failure uses existing Calcutta fail/backoff; duplicate delivery and restart preserve attempts',async()=>{
   await freshDemand();const base=f.dependencies.fetchImpl;let used=false;
   f.dependencies.fetchImpl=async(url,init)=>{const i=JSON.parse(init.body).input;
    if(i.operation_id==='WORKERS.CALCUTTA_COMPLETE'&&!used){used=true;throw Object.assign(new Error('fixed local connection fault'),{code:'ECONNRESET'});}return base(url,init);};
   const r=await invoke();f.dependencies.fetchImpl=base;assert.equal(r.value.outcome,'JOB_RETRY');assert.equal(latest().status,'PENDING');
   assert.equal(latest().delivery_attempts,1);assert.equal(latest().delivery_error_class,'RETRYABLE');assert.ok(Date.parse(latest().delivery_available_at)>Date.parse(latest().started_at));
   const before=latest().delivery_attempts;assert.equal(r.duplicate.cycles,0);assert.equal(latest().delivery_attempts,before);
   restartIsolatedCluster(f.cluster);assert.equal(latest().delivery_attempts,1);
   await wait(Math.max(0,Date.parse(latest().delivery_available_at)-Date.now()+100));
   assert.equal((await invoke()).value.outcome,'SUCCEEDED');assert.equal(latest().delivery_attempts,2);assert.equal(latest().status,'SUCCEEDED');
  });
  await check('terminal completion fault records truthful dead letter/HALT; only certified Director recovery grants new cycle',async()=>{
   await freshDemand();const base=f.dependencies.fetchImpl;let used=false;
   f.dependencies.fetchImpl=async(url,init)=>{const i=JSON.parse(init.body).input;
    if(i.operation_id==='WORKERS.CALCUTTA_COMPLETE'&&!used){used=true;return Response.json({code:'22023',message:'CALCUTTA_LOCAL_FIXED_TERMINAL'},{status:400});}return base(url,init);};
   const r=await invoke(undefined,{budget:2,duration_seconds:120});f.dependencies.fetchImpl=base;assert.equal(r.value.outcome,'TERMINAL');const job=latest();assert.equal(job.status,'FAILED');
   assert.equal(job.delivery_attempts,1);assert.ok(job.delivery_dead_letter_at);assert.equal(job.delivery_error_class,'TERMINAL');
   assert.ok(Number(q("select count(*)from production_control.score_derived_delivery_attempts_v1 where family='CALCUTTA'and transition='DEAD_LETTER'"))>0);
   const id=randomUUID();const recovery=await certificationOperationRpc('DIRECTOR.REQUEUE_DERIVED',{contract_version:'score-derived-delivery-v1',tournament_id:'2026',family:'CALCUTTA',
    work_identity:job.job_id,request_id:id,expected_cycle:job.delivery_cycle,expected_attempt:job.delivery_attempts,reason:'Fixed local synthetic transport cause corrected'},
    {env:f.env,authorization:f.authorization,operationRequestId:id},f.dependencies);
   assert.equal(recovery.payload.ok,true);assert.equal(latest().delivery_cycle,job.delivery_cycle+1);assert.equal(latest().delivery_attempts,0);
   f.start({action:'RESUME',reconciliation_reason:'Fixed local cause corrected; canonical terminal history retained'});const e=f.batch().messages[0];
   assert.equal((await native(e)).value.outcome,'SUCCEEDED');f.stop();assert.equal(latest().status,'SUCCEEDED');
   assert.ok(Number(q("select count(*)from production_control.score_derived_delivery_attempts_v1 where family='CALCUTTA'and transition='DEAD_LETTER'"))>0);
  });
  await check('source advance after real Calcutta claim rejects old completion; later Queue drains one authoritative result',async()=>{
   await freshDemand();const base=f.dependencies.fetchImpl;let used=false,oldCode;
   f.dependencies.fetchImpl=async(url,init)=>{const i=JSON.parse(init.body).input;
    if(i.operation_id==='WORKERS.CALCUTTA_COMPLETE'&&!used){used=true;assert.equal(f.status().counts.active_claims,1);await f.source(stack,'2026-R3-12');
     const response=await base(url,init);oldCode=(await response.clone().json()).message;assert.equal(response.ok,false);return response;}return base(url,init);};
   const before=Number(q('select count(*)from scoring_authority.calcutta_v1_result_revisions'));await invoke();f.dependencies.fetchImpl=base;
   assert.match(oldCode,/SOURCE_REVISION_CONFLICT|JOB_LEASE_REQUIRED/);assert.equal(Number(q('select count(*)from scoring_authority.calcutta_v1_result_revisions')),before);
   await wait(Math.max(0,...f.calcuttaJobs().map(j=>Date.parse(j.delivery_available_at)-Date.now()+100)));
   const resumeOptions=f.status().halt_latched?{action:'RESUME',reconciliation_reason:'Stale ownership rejected; new canonical source is authoritative'}:{};
   assert.equal((await invoke(undefined,resumeOptions)).value.outcome,'SUCCEEDED');assert.equal(latest().status,'SUCCEEDED');
   assert.equal(q('select count(*)from scoring_authority.calcutta_v1_result_revisions where is_current'),'1');
  });
  await check('Calcutta committed claim/result evidence reconciles UNKNOWN after the real durable horizon without repeating calculation',async()=>{
   await freshDemand();f.start({duration_seconds:180});const e=f.batch().messages[0];
   f.armGlobal('INVOCATION_LOST_ACK');await f.due(e);
   await assert.rejects(f.consume(e),{code:'SUPERVISOR_ACKNOWLEDGEMENT_UNKNOWN'});
   const invocation=()=>JSON.parse(q(`select to_jsonb(i)from production_control.worker_supervisor_invocations_v1 i where invocation_id='${e.message.invocation_id}'`));
   assert.equal(invocation().state,'UNKNOWN');assert.equal(latest().status,'SUCCEEDED');
   assert.equal(invocation().claim_evidence.filter(v=>v.engine==='CALCUTTA').length,1);
   const resultCount=q('select count(*)from scoring_authority.calcutta_v1_result_revisions');
   assert.equal((await f.consume(e)).cycles,0);assert.equal(q('select count(*)from scoring_authority.calcutta_v1_result_revisions'),resultCount);
   f.stop();assert.equal(invocation().state,'UNKNOWN');
   await wait(Math.max(0,Date.parse(invocation().reconcile_after)-Date.now()+100));f.ownerQueue('reconcile');
   assert.equal(invocation().state,'RECONCILED');
   const jobEvidence=invocation().evidence.canonical_jobs.find(v=>v.engine==='CALCUTTA');
   assert.equal(jobEvidence.status,'SUCCEEDED');assert.equal(jobEvidence.job_id,latest().job_id);
   assert.equal(q('select count(*)from scoring_authority.calcutta_v1_result_revisions'),resultCount);
   assert.doesNotMatch(JSON.stringify(invocation().evidence),/claim_token|purchase_price|ownership_fraction/);
  });
  await check('STOP/HALT and fabricated/foreign/client authority deny before worker; arbitrary engines/financial operations unavailable',async()=>{
   f.start();const e=f.batch().messages[0];f.stop();const before=f.calls.filter(c=>c.operation?.startsWith('WORKERS.')).length;
   await assert.rejects(f.consume(e));assert.equal(f.calls.filter(c=>c.operation?.startsWith('WORKERS.')).length,before);
   await assert.rejects(f.consume({message:{...e.message,invocation_id:randomUUID()},scheduled_at:e.scheduled_at}));
   for(const role of ['anon','authenticated','service_role']){
    for(const fn of ['worker_supervisor_control_v1','worker_supervisor_scope_v1'])assert.equal(q(`select has_function_privilege('${role}','production_control.${fn}(${fn.includes('control')?'jsonb':''})','EXECUTE')`),'f');
    assert.notEqual(sqlResult(f.cluster,f.database,`set role ${role};select production_control.worker_supervisor_control_v1(${jsonLiteral({...f.bound,action:'START'})})`,{role}).status,0);
   }
   for(const change of [{VERCEL_ENV:'production'},{VERCEL_ENV:'development'},{VERCEL_PROJECT_ID:'wrong'},
    {VERCEL_DEPLOYMENT_ID:'dpl_WrongDeploy'},{VERCEL_GIT_COMMIT_SHA:'bad'},{SUPABASE_SCORING_MIRROR_URL:'https://idgigvjjqkfbqjeredpb.supabase.co'},
    {BAGGER_CERTIFICATION_RESOURCE_ID:'PRODUCTION'},{BAGGER_CERTIFICATION_RESOURCE_ID:'CERTIFICATION:'+randomUUID()}]){
    if(change.VERCEL_DEPLOYMENT_ID)assert.throws(()=>f.ownerQueue('status',{deployment:{...f.deployment,deployment_id:change.VERCEL_DEPLOYMENT_ID}}));
    else assert.throws(()=>queueRuntimeIdentity({...f.env,...change},f.dependencies));
   }
   for(const engines of [['CALCUTTA'],[...CERTIFICATION_WORKER_ENGINES,'ODDS'],['ARBITRARY']])assert.throws(()=>f.start({engines}),/SUPERVISOR_/);
   for(const resource of [{...f.resource,project_ref:'idgigvjjqkfbqjeredpb'},
    {...f.resource,resource_class:'PRODUCTION',resource_id:'PRODUCTION'},
    {...f.resource,resource_id:'CERTIFICATION:'+randomUUID()}])assert.throws(()=>f.ownerQueue('status',{resource}));
   assert.throws(()=>f.ownerQueue('status',{deployment:{...f.deployment,release_commit:'f'.repeat(40)}}));
   assert.throws(()=>f.ownerQueue('control',f.startInput({expected_revision:f.status().revision-1})));
   const currentAuction=auctions(),oldAuthorization=stack.authorization;
   for(const authorization of [{status:'inactive'},...['P12','P11'].map(playerId=>({status:'active',source:'entitlement',identity:{
    authUserId:JSON.parse(q(`select to_jsonb(l)from participant_identity.user_player_links l where player_id='${playerId}'`)).auth_user_id,
    actor:{id:playerId,role:'PARTICIPANT'},tournamentId:'2026'}}))]){
    stack.setAuthorization(authorization);await assert.rejects(newAuction(2));
   }
   stack.setAuthorization(oldAuthorization);assert.equal(auctions(),currentAuction);
   for(const name of ['replace_production_calcutta_v1_auction_facts','clear_production_calcutta_v1_auction_entry','publish_production_calcutta_v1']){
    const {certificationWorkerRpc}=await import('../lib/certification-worker-adapter.js');
    await assert.rejects(certificationWorkerRpc(name,{}, {env:f.env,certificationDependencies:f.dependencies}),{code:'CERTIFICATION_OPERATION_FORBIDDEN'});
   }
   for(const role of ['anon','authenticated','service_role'])for(const fn of ['canonical_claim_calcutta_v1_recalculation_core_v2','canonical_complete_calcutta_v1_recalculation_core_v2','canonical_fail_calcutta_v1_recalculation_core_v2'])
    assert.equal(q(`select has_function_privilege('${role}','production_control.${fn}(jsonb,jsonb)','EXECUTE')`),'f');
   const status=f.status();assert.equal(status.state,'OFF');assert.equal(status.counts.pending_work,0);assert.equal(status.counts.active_claims,0);assert.equal(status.counts.dead_letters,0);
   f.toggle(false);assert.equal(q('select count(*)from scoring_authority.odds_published_snapshots'),'0');assert.equal(q("select production_control.derived_final_recap_ready_v1('2026')"),'f');
   assert.equal(q("select to_jsonb(a)from scoring_authority.calcutta_v1_auction_fact_revisions a where auction_revision=2"),emptyRevision);assert.equal(domainImage(),oldDomain);assert.equal(rls(),oldRls);
  });
  evidence.final={state:f.status().state,counts:f.status().counts,calcuttaPublication:f.current().publication_state};
 }finally {
  globalThis.fetch=originalFetch;if(f)await destroyIsolatedCluster(f.cluster);
  const dir='docs/reliability/phase2d-calcutta-engine-scope/evidence';await mkdir(dir,{recursive:true});await writeFile(dir+'/compatibility.json',JSON.stringify(evidence,null,2)+'\n');
 }
});
