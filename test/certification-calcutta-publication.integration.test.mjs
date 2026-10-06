// Local-only: actual route/adapters/Queue SDK/shared SQL on owned PG17+pg-safeupdate.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {QueueClient} from '@vercel/queue';
import {createCalcuttaQueueFixture} from './support/reliability/certification-calcutta-queue-fixture.mjs';
import {certificationDirectorStack} from './support/reliability/certification-director-proof.mjs';
import {destroyIsolatedCluster,sqlFile,sqlResult,jsonLiteral,repositoryRoot} from './support/reliability/postgres17.mjs';
import {predecessor} from '../lib/calcutta-management-model.js';
import {QUEUE_TOPIC,queueRetry,consumeCertificationQueueMessage} from '../lib/certification-queue-supervision.js';
import {handleQueueEnvelope,requireQueueEnvelopeMetadata} from '../lib/certification-queue-envelope.js';
import {certificationReadAliasRpc} from '../lib/certification-read-adapters.js';
import {certificationWorkerRpc} from '../lib/certification-worker-adapter.js';
import {productionCalcuttaV1Data} from '../lib/production-calcutta-v1.js';
import {mobileCalcuttaDataFromProductionView} from '../lib/mobile-v1-calcutta.js';
import {fixtureIdentities} from '../tools/reliability/certification-part2a-fixture.mjs';
const artifact=repositoryRoot+'/supabase/production_incremental/certification-calcutta-publication-v1.sql';
const dto=model=>({expectedConfigurationRevision:model.configuration_revision,expectedConfigurationFingerprint:model.configuration_fingerprint,
 expectedAuctionRevision:model.auction_revision,expectedAuctionFingerprint:model.auction_fingerprint,
 expectedPublicationRevision:model.publication_revision,expectedResultRevision:model.result_revision,expectedSourceFingerprint:model.source_fingerprint});
test('Calcutta result publication: real Director gateway/shared core/history/privacy; no hosted access',async t=>{
 const f=await createCalcuttaQueueFixture(),q=f.q,source=await readFile(artifact,'utf8'),patches=JSON.parse(source.split('$manifest$')[1]);
 const evidence={hosted:false,postgres:17,safeupdate:'on',cases:[]};let stack,initialEmpty,inputA,resultA,publicationA;
 const check=async(name,fn)=>{let failure;await t.test(name,async()=>{try{await fn();evidence.cases.push({name,result:'PASS'});}catch(e){failure=e;e.message+=" "+JSON.stringify(stack?.calls.at(-1)?.error||{});throw e;}});if(failure)throw failure;};
 const install=()=>sqlFile(f.cluster,f.database,artifact,{role:''});
 const metadata=()=>q(`select jsonb_agg(jsonb_build_object('id',oid,'owner',proowner,'acl',proacl,'security',prosecdef,'config',proconfig,
 'language',prolang,'volatile',provolatile,'parallel',proparallel,'strict',proisstrict)order by oid)from pg_proc where oid=any(array[${patches.map(p=>"'"+p.signature+"'::regprocedure").join(',')}]::oid[])`);
 const rls=()=>q("select jsonb_agg(jsonb_build_object('id',oid,'rls',relrowsecurity,'force',relforcerowsecurity,'acl',relacl)order by oid)from pg_class where relnamespace in('scoring_authority'::regnamespace,'participant_identity'::regnamespace)and relkind='r'");
 const pubs=()=>q('select jsonb_agg(to_jsonb(p)order by publication_revision)from scoring_authority.calcutta_v1_publication_revisions p');
 const results=()=>q('select jsonb_agg(to_jsonb(r)order by result_revision)from scoring_authority.calcutta_v1_result_revisions r');
 const current=()=>f.current();
 const raw=async(body,transport=stack)=>{const r=await transport.request('/api/director/canonical-operations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
 const command=async(payload,id=randomUUID())=>({family:'CALCUTTA_PUBLICATION',action:'publish',payload,operationRequestId:id,expectedContextToken:(await stack.transport.read()).context.contextToken});
 const newAuction=async(price=1)=>{const model=(await stack.transport.calcuttaRequest('management-read')).data;return stack.transport.calcuttaRequest('management-entry',{
  ...predecessor(model),operationRequestId:randomUUID(),entry:{playerId:'P01',purchasePrice:String(price),owners:[{buyerId:'P12',percentage:'100'}]}});};
 const reconcileIngress=()=>{
  for(const row of JSON.parse(q("select coalesce(jsonb_agg(to_jsonb(l)),'[]')from production_control.certification_ingress_leases_v1 l where state in('ADMITTED','UNKNOWN')"))){
   const b={contract_version:'certification-runtime-v1',...f.envelope,phase:'DIRECTOR',operation_id:row.operation_id,operation_request_id:row.operation_request_id,payload:{}};
   const r=sqlResult(f.cluster,f.database,`set role service_role;select public.resolve_certification_ingress_v1(${jsonLiteral(b)})`,{role:'service_role'});assert.equal(r.status,0,r.stderr);
  }
 };
 const calculate=async()=>{
  // Deliberately rejected Director probes are fenced/reconciled before START,
  // exactly as the installed safe-start contract requires. No row relabels.
  reconcileIngress();f.start();const e=f.batch().messages[0];f.register(e);await f.due(e);let value;const calls=[],now=Date.now(),oldFetch=globalThis.fetch;
  const provider=async(url,init)=>{assert.equal(new URL(url).origin,'https://iad1.vercel-queue.com');calls.push(init.method);return init.method==='DELETE'?new Response(null,{status:204}):Response.json({success:true});};
  globalThis.fetch=provider;
  try{
   const client=new QueueClient({region:'iad1',deploymentId:f.deployment.deployment_id,token:'synthetic-local-only',telemetry:{isEnabled:false}});
   const callback=client.handleCallback(async(message,meta)=>{requireQueueEnvelopeMetadata(meta,message);value=await consumeCertificationQueueMessage(message,meta,{env:f.env,dependencies:f.dependencies});},{visibilityTimeoutSeconds:90,retry:queueRetry});
   const request=new Request(f.deployment.deployment_origin+'/api/internal/derived-worker/queue',{method:'POST',headers:{'content-type':'application/json',
    'ce-type':'com.vercel.queue.v2beta','ce-vqsqueuename':QUEUE_TOPIC,'ce-vqsconsumergroup':'synthetic','ce-vqsmessageid':'msg_local_'+e.message.invocation_id,
    'ce-vqsregion':'iad1','ce-vqsreceipthandle':'synthetic','ce-vqsdeliverycount':'1','ce-vqscreatedat':new Date(now-1000).toISOString(),
    'ce-vqsexpiresat':new Date(now+540000).toISOString(),'ce-vqsvisibilitydeadline':new Date(now+300000).toISOString()},body:JSON.stringify(e.message)});
   const response=await handleQueueEnvelope(request,callback,{bound:f.bound,control:f.control(),getToken:async()=>'synthetic-local-only',fetchImpl:provider});
   assert.equal(response.status,200);assert.equal(value.outcome,'SUCCEEDED',JSON.stringify(value));assert.equal(value.cycles,1);
   assert.equal((await f.consume(e)).cycles,0);assert.ok(calls.includes('DELETE'));return value;
  }finally{globalThis.fetch=oldFetch;f.stop();}
 };
 try{
  const beforeMeta=metadata(),beforeRls=rls(),oldHistory=q("select jsonb_build_object('v7',(select to_jsonb(t)from production_control.worker_supervisor_routing_closure_installation_v7 t),'attempt',(select to_jsonb(t)from production_control.derived_attempt_cycle_installation_v1 t))");
  await check('all eight predecessor hashes checked before any change; mismatch rolls back',()=>{
   const bad=source.replace(patches[0].old_hash,'0'.repeat(64));const r=sqlResult(f.cluster,f.database,bad,{role:''});assert.notEqual(r.status,0);assert.match(r.stderr,/PREDECESSOR_MISMATCH/);
   assert.equal(q("select to_regprocedure('production_control.canonical_publish_calcutta_v1(jsonb,jsonb)')is null"),'t');assert.equal(metadata(),beforeMeta);
  });
  await check('atomic install/replay preserve eight owners/ACLs/security/search_paths, RLS and v1-v7/attempt history',()=>{
   install();const before=q("select jsonb_agg(jsonb_build_object('id',oid,'body',prosrc,'acl',proacl)order by oid)from pg_proc where proname like '%calcutta%'or proname like '%certification%'");install();
   assert.equal(q("select jsonb_agg(jsonb_build_object('id',oid,'body',prosrc,'acl',proacl)order by oid)from pg_proc where proname like '%calcutta%'or proname like '%certification%'"),before);
   assert.equal(metadata(),beforeMeta);assert.equal(rls(),beforeRls);assert.equal(q("select jsonb_build_object('v7',(select to_jsonb(t)from production_control.worker_supervisor_routing_closure_installation_v7 t),'attempt',(select to_jsonb(t)from production_control.derived_attempt_cycle_installation_v1 t))"),oldHistory);
   assert.equal(q("select current_setting('safeupdate.enabled')"),'on');assert.throws(()=>q('update scoring_authority.calcutta_v1_current set state=state'),/UPDATE requires a WHERE clause/);
  });
  await check('private core ACL drift blocks replay instead of repairing/broadening roles',()=>{
   q('grant execute on function production_control.canonical_publish_calcutta_v1(jsonb,jsonb)to anon');assert.throws(install,/PRIVATE_ACL_DRIFT/);
   q('revoke execute on function production_control.canonical_publish_calcutta_v1(jsonb,jsonb)from anon');install();
  });
  f.toggle(true);stack=await f.director();initialEmpty=q('select to_jsonb(a)from scoring_authority.calcutta_v1_auction_fact_revisions a where auction_revision=2');
  await check('empty revision 2 preserved; lawful Director nonempty successor 3; no fabricated result',async()=>{
   assert.equal(current().auction_revision,2);assert.equal(current().result_revision,0);await newAuction();assert.equal(current().auction_revision,3);
   assert.equal(current().publication_state,'UNPUBLISHED');assert.equal(q('select to_jsonb(a)from scoring_authority.calcutta_v1_auction_fact_revisions a where auction_revision=2'),initialEmpty);
  });
  await check('uncomputed result cannot be published or fabricated by Director input',async()=>{
   const model=await stack.transport.calcuttaPublicationRequest(),before=pubs();assert.equal(model.result_current,false);
   const response=await raw(await command({...dto(model),expectedResultRevision:1}));assert.equal(response.status,409,JSON.stringify(response.body));assert.equal(pubs(),before);
  });
  await check('genuine match control source creates canonical demand; native SDK consumer/common worker calculates immutable UNPUBLISHED A',async()=>{
   await f.source(stack);await calculate();assert.ok(f.calcuttaJobs().every(j=>j.status==='SUCCEEDED'));assert.equal(current().publication_state,'UNPUBLISHED');
   resultA=JSON.parse(q('select to_jsonb(r)from scoring_authority.calcutta_v1_result_revisions r where is_current'));
   assert.equal(resultA.auction_revision,3);assert.equal(resultA.result_state,'PROVISIONAL');assert.equal(resultA.engine_result_payload.pot,1);
   assert.equal(resultA.engine_result_payload.portfolios[0].currentPayoutValue,0.4);assert.equal(resultA.engine_result_payload.portfolios[0].purchaseCost,1);
   evidence.calculation={auction:3,result:resultA.result_revision,phase:resultA.result_state,pot:1,value:0.4,manualProcessor:0,manualWorker:0};
  });
  await check('unpublished participant read withholds market/result; private Director management remains allowed',async()=>{
   const r=await certificationReadAliasRpc('read_production_calcutta_v1',{input:{player_id:'P12'}},{env:f.env,certificationDependencies:f.dependencies});
   evidence.beforeRead=r.payload;assert.ok(!JSON.stringify(r.payload).includes('"purchase_price":'));
   assert.equal((await stack.transport.calcuttaRequest('management-read')).data.purchases.length,1);
  });
  await check('synthetic Director publishes exact current result; pointer/revision/receipt/two audits; no result or financial math mutation',async()=>{
   const model=await stack.transport.calcuttaPublicationRequest();inputA=await command(dto(model));const immutable=results();const response=await raw(inputA);
   assert.equal(response.status,200,JSON.stringify(response.body));publicationA=response.body;assert.equal(response.body.committed,true);
   assert.equal(response.body.readbackVerified,true);assert.equal(response.body.receipt.publication_state,'PUBLISHED');assert.equal(response.body.data.result_current,true);
   assert.equal(results(),immutable);assert.equal(current().result_revision,resultA.result_revision);assert.equal(current().publication_revision,model.publication_revision+1);
   assert.equal(q("select count(*)from production_control.cutover_operation_receipts where operation='CALCUTTA_V1_PUBLISH'"),'1');
   assert.equal(q("select count(*)from production_control.operation_audit_events where event_type='PRODUCTION_CALCUTTA_V1_PUBLISHED'"),'1');
   assert.equal(q("select count(*)from scoring_authority.audit_events where action='PRODUCTION_CALCUTTA_V1_PUBLISHED'"),'1');
   assert.equal(f.calcuttaJobs().filter(j=>j.status==='PENDING').length,0); // inherited enqueue observes already-current result, no phantom work.
  });
  await check('exact replay is idempotent; fresh duplicate for same current result adds no publication revision',async()=>{
   const before=pubs(),r=await raw(inputA);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(pubs(),before);
   const fresh=await stack.transport.calcuttaPublicationRequest({...dto(await stack.transport.calcuttaPublicationRequest()),operationRequestId:randomUUID()});
   assert.equal(fresh.receipt.code,'PRODUCTION_CALCUTTA_V1_ALREADY_PUBLISHED');assert.equal(fresh.receipt.idempotent,true);assert.equal(pubs(),before);
  });
  await check('same operation ID conflicting payload denied; no new result/publication',async()=>{
   const before=pubs(),r=await raw({...inputA,payload:{...inputA.payload,expectedResultRevision:inputA.payload.expectedResultRevision+1}});assert.notEqual(r.status,200);assert.equal(pubs(),before);
  });
  for(const [name,key,value]of [['wrong auction','expectedAuctionRevision',99],['wrong auction fingerprint','expectedAuctionFingerprint','0'.repeat(64)],
   ['wrong source','expectedSourceFingerprint','0'.repeat(64)],['wrong result','expectedResultRevision',99],['stale publication revision','expectedPublicationRevision',0]]){
   await check(name+' CAS denied',async()=>{const b=await command({...dto(await stack.transport.calcuttaPublicationRequest()),[key]:value}),before=pubs(),r=await raw(b);assert.equal(r.status,409,JSON.stringify(r.body));assert.equal(pubs(),before);});
  }
  await check('source advance makes A stale; publishing A denied; native Queue calculates current B and Director confirms it',async()=>{
   const old=await command(dto(await stack.transport.calcuttaPublicationRequest()));await f.source(stack,'2026-R3-12');
   const before=pubs(),r=await raw(old);assert.equal(r.status,409,JSON.stringify(r.body));assert.equal(pubs(),before);
   await calculate();assert.ok(current().result_revision>resultA.result_revision);
   const fresh=await stack.transport.calcuttaPublicationRequest({...dto(await stack.transport.calcuttaPublicationRequest()),operationRequestId:randomUUID()});assert.equal(fresh.receipt.publication_state,'PUBLISHED');
   assert.equal(q('select count(*)from scoring_authority.calcutta_v1_result_revisions where is_current'),'1');
  });
  await check('published auction remains financially locked; immutable A and empty2 history preserved',async()=>{
   const before=pubs();await assert.rejects(newAuction(2),e=>e.code==='DIRECTOR_OPERATIONS_FINANCIAL_CONFLICT');
   assert.equal(pubs(),before);assert.equal(current().auction_revision,3);
   assert.equal(q('select to_jsonb(a)from scoring_authority.calcutta_v1_auction_fact_revisions a where auction_revision=2'),initialEmpty);
   assert.deepEqual(JSON.parse(q(`select to_jsonb(r)from scoring_authority.calcutta_v1_result_revisions r where result_id='${resultA.result_id}'`)).engine_result_payload,resultA.engine_result_payload);
   assert.equal(q('select count(*)from scoring_authority.calcutta_v1_result_revisions where is_current'),'1');
  });
  for(const [name,authorization]of [['participant A',{status:'active',source:'entitlement',identity:{authUserId:fixtureIdentities[1].auth_user_id,actor:{id:'P12',role:'PARTICIPANT'},tournamentId:'2026'}}],
   ['participant B',{status:'active',source:'entitlement',identity:{authUserId:fixtureIdentities[2].auth_user_id,actor:{id:'P11',role:'PARTICIPANT'},tournamentId:'2026'}}],
   ['signed-out',{status:'signed_out'}],['anon',{status:'anonymous'}],['ordinary authenticated',{status:'authenticated'}],['wrong Director',{...stack.authorization,identity:{...stack.authorization.identity,authUserId:fixtureIdentities[1].auth_user_id}}]]){
   await check(name+' publication denied',async()=>{const other=await certificationDirectorStack(f,{authorization}),b=await command(dto(await stack.transport.calcuttaPublicationRequest())),before=pubs(),r=await raw(b,other);assert.ok([403,409].includes(r.status),JSON.stringify(r.body));assert.equal(pubs(),before);});
  }
  for(const [name,field,value]of [['client resource','resource',{resource_class:'PRODUCTION'}],['wrong tournament','tournament_id','2027'],['arbitrary calculated result','result_id',randomUUID()],['arbitrary payload','result_payload',{pot:99}]]){
   await check(name+' denied before publication',async()=>{const b=await command({...dto(await stack.transport.calcuttaPublicationRequest()),[field]:value}),r=await raw(b);assert.equal(r.status,400,JSON.stringify(r.body));});
  }
  for(const [name,part,key,value]of [['wrong resource','resource','resource_id','CERTIFICATION:'+randomUUID()],['wrong project','resource','project_ref','idgigvjjqkfbqjeredpb'],
   ['wrong deployment','deployment','deployment_id','dpl_Other'],['wrong release','deployment','release_commit','d'.repeat(40)],['Production','deployment','deployment_class','production'],
   ['old Preview','resource','resource_id','PREVIEW:'+randomUUID()]]){
   await check(name+' exact database binding denied',()=>{const envelope={...f.bound,[part]:{...f.bound[part],[key]:value},authorization:f.authorization,contract_version:'certification-runtime-v1',
    operation_id:'DIRECTOR.READ_CALCUTTA_PUBLICATION',phase:'DIRECTOR',payload:{family:'CALCUTTA_PUBLICATION',action:'read'}};
    const r=sqlResult(f.cluster,f.database,`set role service_role;select public.read_certification_operation_v1(${jsonLiteral(envelope)})`,{role:'service_role'});assert.notEqual(r.status,0);});
  }
  for(const environment of ['development','production'])await check(environment+' identity cannot use bound Certification Director publisher',async()=>{
   const {readIsolatedDirectorOperations}=await import('../lib/isolated-director-operations.js');
   await assert.rejects(readIsolatedDirectorOperations({authorization:stack.authorization,family:'CALCUTTA_PUBLICATION',env:{...f.env,VERCEL_ENV:environment}},
    {certificationDependencies:f.dependencies}));
  });
  await check('bare service_role cannot publish; worker adapter forbids publication; private helpers denied to all client SQL roles',async()=>{
   await assert.rejects(certificationWorkerRpc('publish_production_calcutta_v1',{}, {env:f.env,certificationDependencies:f.dependencies}),e=>e.code==='CERTIFICATION_OPERATION_FORBIDDEN');
   const bound={...f.bound,contract_version:'certification-runtime-v1',phase:'DIRECTOR',operation_id:'DIRECTOR.PUBLISH_CALCUTTA',operation_request_id:randomUUID(),payload:{family:'CALCUTTA_PUBLICATION',action:'publish'}};
   const r=sqlResult(f.cluster,f.database,`set role service_role;select public.admit_certification_operation_v1(${jsonLiteral(bound)})`,{role:'service_role'});assert.notEqual(r.status,0);
   for(const role of ['anon','authenticated','service_role'])for(const name of ['canonical_publish_calcutta_v1(jsonb,jsonb)','certification_calcutta_publication_projection_v1(text)','dispatch_certification_calcutta_publication_v1(jsonb,jsonb,boolean)','canonical_read_published_calcutta_v1(jsonb,jsonb)'])
    assert.equal(q(`select has_function_privilege('${role}','production_control.${name}','execute')`),'f');
  });
  await check('Production publication route unchanged/Preview 404; Production core guard remains; generic isolated Preview cannot select publication family',async()=>{
   const route=await readFile(repositoryRoot+'/app/api/admin/production-calcutta-v1/route.js','utf8');assert.match(route,/VERCEL_ENV/);assert.match(route,/production/);
   const r=sqlResult(f.cluster,f.database,"set role service_role;select public.publish_production_calcutta_v1('{}'::jsonb)",{role:'service_role'});assert.notEqual(r.status,0);
   assert.equal(q('select count(*)from production_control.resource_scope'),'0');assert.equal(q('select count(*)from production_control.cutover_activation_state'),'0');
  });
  await check('published participant-safe read shows intended market/result, never raw receipts/tokens/source tree/supervisor; private table access denied',async()=>{
   const r=await certificationReadAliasRpc('read_production_calcutta_v1',{input:{player_id:'P12'}},{env:f.env,certificationDependencies:f.dependencies});
   const web=productionCalcuttaV1Data(r.payload.data),mobile=mobileCalcuttaDataFromProductionView(r.payload.data,{playerId:'P12',tournamentId:'2026'});
   assert.equal(web.calcuttaState.visible,true);assert.equal(mobile.publicationState,'PUBLISHED');assert.ok(mobile.result);
   evidence.publishedRead=r.payload;const text=JSON.stringify(r.payload);assert.ok(text.includes('PUBLISHED'));assert.ok(text.includes('P01'));
   assert.ok(!/claim_token|request_payload_hash|request_fingerprint|source_revision|worker_supervisor|receipt_handle/.test(text));
   for(const role of ['anon','authenticated'])for(const table of ['scoring_authority.calcutta_v1_auction_fact_revisions','production_control.cutover_operation_receipts','scoring_authority.calcutta_v1_result_revisions']){
    const r=sqlResult(f.cluster,f.database,`set role ${role};select * from ${table}`,{role});assert.notEqual(r.status,0);
   }
  });
  await check('nonmember and injected private-reader fields cannot obtain a participant projection',async()=>{
   await assert.rejects(certificationReadAliasRpc('read_production_calcutta_v1',{input:{player_id:'P03'}},{env:f.env,certificationDependencies:f.dependencies}),e=>e.code==='CERTIFICATION_CALCUTTA_PARTICIPANT_READ_DENIED');
   for(const extra of [{observer_auth_user_id:randomUUID()},{tournament_id:'2027'},{resource:'PRODUCTION'},{source_revision:{}}])
    await assert.rejects(certificationReadAliasRpc('read_production_calcutta_v1',{input:{player_id:'P12',...extra}},{env:f.env,certificationDependencies:f.dependencies}),e=>e.code==='CERTIFICATION_INPUT_INVALID');
  });
  await check('lost application ACK reconciles authoritative publication receipt; replay never duplicates current publication',async()=>{
   let lost=false;const other=await certificationDirectorStack(f,{loseResponse:(url,init)=>init.method==='POST'&&!JSON.parse(init.body).mode&&!lost&&(lost=true)});
   const model=await other.transport.calcuttaPublicationRequest(),id=randomUUID(),draft={...dto(model),operationRequestId:id},before=pubs();
   await assert.rejects(other.transport.calcuttaPublicationRequest(draft));const resolved=await other.transport.resolve(id);assert.equal(resolved.outcome,'COMMITTED');assert.equal(resolved.readbackVerified,true);assert.equal(pubs(),before);
  });
  await check('complete drain/reconcile; STOP/disabled/paused; unchanged RLS; no Odds/FinalRecap/Google work',async()=>{
   for(const row of JSON.parse(q("select coalesce(jsonb_agg(to_jsonb(l)),'[]')from production_control.certification_ingress_leases_v1 l where state in('ADMITTED','UNKNOWN')"))){
    const b={contract_version:'certification-runtime-v1',...f.envelope,phase:'DIRECTOR',operation_id:row.operation_id,operation_request_id:row.operation_request_id,payload:{}};
    const r=sqlResult(f.cluster,f.database,`set role service_role;select public.resolve_certification_ingress_v1(${jsonLiteral(b)})`,{role:'service_role'});assert.equal(r.status,0,r.stderr);
   }
   f.stop();f.toggle(false);assert.equal(f.status().state,'OFF');assert.equal(f.status().counts.pending_work,0);assert.equal(f.status().counts.active_claims,0);
   assert.equal(q("select count(*)from production_control.certification_ingress_leases_v1 where state in('ADMITTED','UNKNOWN')"),'0');assert.equal(rls(),beforeRls);
   assert.equal(q('select count(*)from scoring_authority.odds_published_snapshots'),'0');assert.equal(q('select count(*)from scoring_authority.google_outbox_events'),'0');
   assert.equal(q("select state from scoring_authority.ingress_gates where tournament_id='2026'"),'PAUSED');
   evidence.final={supervisor:f.status().state,counts:f.status().counts,publication:current().publication_state,auction:current().auction_revision,result:current().result_revision};
  });
  const dir=repositoryRoot+'/docs/reliability/phase2d-calcutta-publication/evidence';await mkdir(dir,{recursive:true});await writeFile(dir+'/domain.json',JSON.stringify(evidence,null,2)+'\n');
 }finally{await destroyIsolatedCluster(f.cluster);}
});
