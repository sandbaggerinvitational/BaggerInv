// Owned socket-only PostgreSQL17. Reuse the retained R2 fixture, exercising
// four prepared matches only; no tournament chronology or hosted connection.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createCertificationFixture} from './support/reliability/phase2d-certification-fixture.mjs';
import {certificationProvisionalProfile as forwardMigrations} from './support/reliability/certification-provisional-profile.mjs';
import {certificationTransportRegistration} from './support/reliability/certification-ingress-js-proof.mjs';
import {certificationDirectorStack,provisionCertificationFinancialFixture} from './support/reliability/certification-director-proof.mjs';
import {annualRuntime} from './support/reliability/certification-annual-transition-fixture.mjs';
import {certificationWorkerTransport} from './support/reliability/certification-worker-proof.mjs';
import {destroyIsolatedCluster,createDatabase,jsonLiteral,sqlResult,sqlFile,repositoryRoot,sql} from './support/reliability/postgres17.mjs';
import {installLocalCanonicalPlatform} from './support/reliability/phase2d-resource-bootstrap.mjs';
import {canonicalCatalog,canonicalTableCounts,readCanonicalArtifacts,installCanonicalBaseline} from '../tools/reliability/canonical-bootstrap-artifacts.mjs';
import {predecessor} from '../lib/calcutta-management-model.js';
import {recalculateCalcuttaAfterCanonicalMutation} from '../lib/calcutta-post-commit.js';
import path from 'node:path';

const artifact='supabase/production_incremental/calcutta-empty-auction-demand-v1.sql';
const directory='docs/reliability/phase2d-calcutta-empty-auction-remediation/evidence';
const manifest=JSON.parse(await readFile('docs/reliability/phase2d-calcutta-empty-auction-remediation/manifest.json','utf8'));
const hash=value=>createHash('sha256').update(value).digest('hex');
test('empty Calcutta demand preserves the certified match/financial contracts',async t=>{
 let f;
 const evidence={environment:'OWNED_SOCKET_ONLY_POSTGRESQL17',hosted:false,externalCalls:0,
  fixture:'RETAINED_LOCAL_R2_ROSTER_ONLY_FOUR_MATCHES_EXERCISED',cases:[]};
 const check=async(name,fn)=>{
  let failure;await t.test(name,async()=>{try{await fn();evidence.cases.push({name,result:'PASS'});}
   catch(error){failure=error;evidence.cases.push({name,result:'FAIL',error:error.message});throw error;}});
  if(failure)throw failure;
 };
 try{
  f=await createCertificationFixture({forwardMigrations,registrationFactory:certificationTransportRegistration});
  const s=await certificationDirectorStack(f),client=s.transport,runtime=annualRuntime(f);
  const current=()=>JSON.parse(f.q("select to_jsonb(c)from scoring_authority.calcutta_v1_current c where tournament_id='2026'"));
  const model=async()=>(await client.calcuttaRequest('management-read')).data;
  const match=id=>JSON.parse(f.q(`select to_jsonb(m)from scoring_authority.matches m where match_id='${id}'`));
  const controlInput=(id,operationRequestId=randomUUID())=>({matchId:id,operationRequestId,
   expectedMatchRevision:match(id).match_revision,expectedPermissionRevision:match(id).permission_revision});
  const count=table=>Number(f.q('select count(*)from '+table));
  const calcuttaWork=()=>({jobs:count('scoring_authority.calcutta_v1_recalculation_jobs'),
   intents:Number(f.q("select count(*)from scoring_authority.score_derived_intents_v1 where family='CALCUTTA'"))});
  const financial=()=>f.q(`select jsonb_build_object('current',(select to_jsonb(c)from scoring_authority.calcutta_v1_current c),
   'auctions',(select jsonb_agg(to_jsonb(a)order by auction_revision)from scoring_authority.calcutta_v1_auction_fact_revisions a),
   'publications',(select jsonb_agg(to_jsonb(p)order by publication_revision)from scoring_authority.calcutta_v1_publication_revisions p))`);
  const apply=()=>sqlFile(f.cluster,f.database,path.join(repositoryRoot,artifact),{role:''});
  const toggle=enabled=>f.owner('set_certification_admission_v1',{resource_id:f.resource.resource_id,
   expected_admission_revision:Number(f.q('select admission_revision from production_control.certification_admission_v1')),
   enabled,reason:'OWNED LOCAL empty-auction regression'});
  for(const id of ['2026-R1-1','2026-R1-2','2026-R1-3','2026-R1-4']){
   const m=(await client.setupRequest()).data;
   await client.setupRequest({action:'prepare-scoring-context',operationRequestId:randomUUID(),expectedRevision:m.revision,matchId:id});
  }
  await check('no configuration permits Mark Live and creates no Calcutta demand',async()=>{
   assert.equal(count('scoring_authority.calcutta_v1_current'),0);
   await client.controlRequest('mark-live',controlInput('2026-R1-1'));
   assert.equal(match('2026-R1-1').status,'LIVE');assert.deepEqual(calcuttaWork(),{jobs:0,intents:0});
  });
  provisionCertificationFinancialFixture(f);
  await check('configured but no entered auction permits Mark Live without Calcutta demand',async()=>{
   assert.equal(current().auction_revision,0);assert.equal(current().state,'CONFIGURED');
   await client.controlRequest('mark-live',controlInput('2026-R1-2'));
   assert.equal(match('2026-R1-2').status,'LIVE');assert.deepEqual(calcuttaWork(),{jobs:0,intents:0});
  });
  let purchaseId,clearId,clearInput,failedInput,failedAdmission;
  await check('supported Director purchase followed by last-entry clear creates immutable valid empty revision',async()=>{
   purchaseId=randomUUID();
   await client.calcuttaRequest('management-entry',{...predecessor(await model()),operationRequestId:purchaseId,
    entry:{playerId:'P01',purchasePrice:'1',owners:[{buyerId:'P12',percentage:'100'}]}});
   assert.equal(current().auction_revision,1);
   clearId=randomUUID();clearInput={...predecessor(await model()),operationRequestId:clearId,playerId:'P01'};
   await client.calcuttaRequest('management-clear-entry',clearInput);
   const cleared=financial();await client.calcuttaRequest('management-clear-entry',clearInput);assert.equal(financial(),cleared);
   const m=await model();assert.equal(m.auction_revision,2);assert.equal(m.state,'AUCTION_COMPLETE');
   assert.equal(m.publication_state,'UNPUBLISHED');assert.deepEqual(m.purchases,[]);assert.deepEqual(m.ownership,[]);
   assert.equal(f.q("select jsonb_array_length(auction_manifest->'purchases')from scoring_authority.calcutta_v1_auction_fact_revisions where auction_revision=1"),'1');
   evidence.empty={auctionRevision:m.auction_revision,publication:m.publication_state,purchaseCount:0};
  });
  await check('original Mark Live failure rolls back all match/permission/financial/job/receipt changes',async()=>{
   const before={match:match('2026-R1-3'),financial:financial(),work:calcuttaWork(),mutations:count('scoring_authority.score_mutations')};
   failedInput=controlInput('2026-R1-3');const offset=s.calls.length;
   await assert.rejects(client.controlRequest('mark-live',failedInput),error=>error.outcome==='UNKNOWN');
   const failedCall=s.calls.slice(offset).find(c=>c.name==='execute_certification_operation_v1');
   assert.equal(failedCall.error.message,'PRODUCTION_CALCUTTA_AUCTION_FACTS_REQUIRED');
   failedAdmission=s.calls.slice(offset).find(c=>c.name==='admit_certification_operation_v1').input;
   assert.deepEqual({match:match('2026-R1-3'),financial:financial(),work:calcuttaWork(),mutations:count('scoring_authority.score_mutations')},before);
   assert.equal(f.q(`select count(*)from production_control.operation_audit_events where details->>'operation_request_id'='${failedInput.operationRequestId}'and event_type='CERTIFICATION_DIRECTOR_MATCH_CONTROL'`),'0');
   evidence.originalFailure=failedCall.error;
  });
  await check('UNKNOWN is authoritatively fenced NOT_COMMITTED; same recovery replay is safe',async()=>{
   assert.equal(f.q(`select state from production_control.certification_ingress_leases_v1 where operation_request_id='${failedInput.operationRequestId}'`),'UNKNOWN');
   const resolved=f.rpc('resolve_certification_ingress_v1',failedAdmission);
   assert.equal(resolved.state,'NOT_COMMITTED');assert.equal(f.rpc('resolve_certification_ingress_v1',failedAdmission).state,'NOT_COMMITTED');
   assert.equal(match('2026-R1-3').status,'UPCOMING');
   evidence.recovery={operationId:failedInput.operationRequestId,state:resolved.state};
  });
  await check('forward correction rejects runtime roles and rolls back a failed postflight',async()=>{
   const text=await readFile(artifact,'utf8'),before=await canonicalCatalog(f.cluster,f.database);
   for(const role of ['anon','authenticated','service_role']){
    const result=sqlResult(f.cluster,f.database,`set role ${role};\n${text}`,{role:''});
    assert.notEqual(result.status,0);assert.match(result.stderr,/OWNER_CATALOG_REQUIRED|permission denied/);
   }
   const failed=text.replace('do $postflight$','do $postflight$').replace("begin\n  if (select encode", "begin\n  raise exception 'LOCAL_TEST_POSTFLIGHT_FAILURE';\n  if (select encode");
   assert.notEqual(failed,text);
   const result=sqlResult(f.cluster,f.database,failed,{role:''});
   assert.notEqual(result.status,0);assert.match(result.stderr,/LOCAL_TEST_POSTFLIGHT_FAILURE/);
   assert.deepEqual(await canonicalCatalog(f.cluster,f.database),before);
  });
  await check('forward artifact changes exactly one function body and no rows/ACL/RLS/owners/security/search_path',async()=>{
   toggle(false);const before=await canonicalCatalog(f.cluster,f.database),rows=canonicalTableCounts(f.cluster,f.database),facts=financial();
   assert.equal(hash(await readFile(artifact)),manifest.artifact.sha256);apply();
   const after=await canonicalCatalog(f.cluster,f.database);
   const changed=after.functions.filter((fn,i)=>JSON.stringify(fn)!==JSON.stringify(before.functions[i]));
   assert.equal(changed.length,1);assert.equal(changed[0].identity,manifest.changedFunction);
   const prior=before.functions.find(fn=>fn.identity===manifest.changedFunction);
   assert.deepEqual({...changed[0],definitionSha256:prior.definitionSha256},prior);
   assert.deepEqual({...after,functions:before.functions},before);
   assert.deepEqual(canonicalTableCounts(f.cluster,f.database),rows);assert.equal(financial(),facts);
   evidence.catalogDelta={...manifest,predecessorDefinitionSha256:prior.definitionSha256,successorDefinitionSha256:changed[0].definitionSha256,
    functionCount:after.functions.length,onlyFunctionBodyChanged:true};
   assert.equal(f.q('select enabled from production_control.certification_admission_v1'),'f');
   assert.equal(f.q('select state from scoring_authority.ingress_gates'),'PAUSED');
   apply();assert.deepEqual(await canonicalCatalog(f.cluster,f.database),after);toggle(true);await client.controlRead();
  });
  await check('fresh immutable baseline plus the forward artifact converges without receipt or authority fabrication',async()=>{
   const database='empty_auction_fresh';createDatabase(f.cluster,database);installLocalCanonicalPlatform(f.cluster,database);
   const bundle=await readCanonicalArtifacts();await installCanonicalBaseline(f.cluster,database,bundle);
   const q=text=>sql(f.cluster,database,text,{role:''});
   const receipt=q('select to_jsonb(v)from production_control.canonical_bootstrap_installation_v1 v');
   sqlFile(f.cluster,database,path.join(repositoryRoot,artifact),{role:''});
   assert.deepEqual(await canonicalCatalog(f.cluster,database),await canonicalCatalog(f.cluster,f.database));
   assert.equal(q('select to_jsonb(v)from production_control.canonical_bootstrap_installation_v1 v'),receipt);
   assert.equal(q('select count(*)from production_control.canonical_resource_v1'),'0');
   assert.equal(q('select count(*)from production_control.certification_admission_v1'),'0');
   evidence.freshForwardConvergence=true;
  });
  await check('purchase/clear receipts, actor-bound audit and exact duplicate survive the correction',async()=>{
   const facts=financial();assert.equal((await client.resolve(clearId)).outcome,'COMMITTED');assert.equal(financial(),facts);
   for(const id of [purchaseId,clearId]){
    const audit=JSON.parse(f.q(`select details from production_control.operation_audit_events where event_type='CERTIFICATION_DIRECTOR_FINANCIAL_OPERATION'and details->>'operation_request_id'='${id}'`));
    assert.equal(audit.resource_id,f.resource.resource_id);assert.equal(audit.actor_auth_user_id,f.envelope.authorization.auth_user_id);
    assert.equal(f.q(`select state from production_control.certification_ingress_leases_v1 where operation_request_id='${id}'`),'COMMITTED');
   }
  });
  const triggerNegative=(setup,pattern)=>{
   const before=match('2026-R1-3'),facts=financial(),work=calcuttaWork();
   const result=sqlResult(f.cluster,f.database,`\\set VERBOSITY verbose\nbegin;
    set local request.jwt.claim.role='service_role';
    select production_control.push_certification_context_v1(${jsonLiteral(f.envelope)},'DIRECTOR',false);
    ${setup};update scoring_authority.matches set match_revision=match_revision+1 where match_id='2026-R1-3';rollback;`,{role:''});
   assert.notEqual(result.status,0);assert.match(result.stderr,pattern);
   assert.deepEqual(match('2026-R1-3'),before);assert.equal(financial(),facts);assert.deepEqual(calcuttaWork(),work);
  };
  for(const [name,setup,error] of [
   ['stale current auction revision',"update scoring_authority.calcutta_v1_current set auction_revision=1",/AUCTION_REVISION_CONFLICT/],
   ['wrong current auction fingerprint',"update scoring_authority.calcutta_v1_current set auction_fingerprint=repeat('f',64)",/AUCTION_REVISION_CONFLICT/],
   ['malformed empty manifest with orphan ownership',"update scoring_authority.calcutta_v1_auction_fact_revisions set auction_manifest=jsonb_set(auction_manifest,'{ownership}','[{}]'),auction_fingerprint=production_control.calcutta_v1_hash(jsonb_set(auction_manifest,'{ownership}','[{}]'))where auction_revision=2;update scoring_authority.calcutta_v1_current set auction_fingerprint=(select auction_fingerprint from scoring_authority.calcutta_v1_auction_fact_revisions where auction_revision=2)",/AUCTION_INPUT_INVALID/],
   ['stale configuration identity',"update scoring_authority.calcutta_v1_current set configuration_revision=configuration_revision+1",/AUCTION_INPUT_INVALID/],
  ])await check(name+' denies lifecycle atomically rather than silently skipping',async()=>triggerNegative(setup,error));
  await check('explicit Publish and Recalculate remain denied for the valid empty auction',async()=>{
   // Certification has no client Publish/explicit-enqueue operation. Exercise
   // the unchanged database guards here; retained clear tests cover the legacy
   // wrappers separately. No fabricated Production activation or gate stub.
   for(const statement of [
    "select production_control.enqueue_production_calcutta_v1('LOCAL_EMPTY_NEGATIVE','local-proof',false,null,null)",
    `insert into scoring_authority.calcutta_v1_publication_revisions(tournament_id,publication_revision,
     configuration_revision,auction_revision,configuration_fingerprint,auction_fingerprint,publication_state,
     action,actor_player_id,actor_auth_user_id,request_fingerprint,request_payload_hash,published_at)
     select tournament_id,publication_revision+1,configuration_revision,auction_revision,configuration_fingerprint,
     auction_fingerprint,'PUBLISHED','DIRECTOR_PUBLISHED','P01','${f.envelope.authorization.auth_user_id}',
     '${hash(randomUUID())}','${hash(randomUUID())}',clock_timestamp()from scoring_authority.calcutta_v1_current`,
   ]){
    const result=sqlResult(f.cluster,f.database,`begin;set local request.jwt.claim.role='service_role';
     select production_control.push_certification_context_v1(${jsonLiteral(f.envelope)},'DIRECTOR',false);
     ${statement};rollback;`,{role:''});
    assert.notEqual(result.status,0);assert.match(result.stderr,/AUCTION_FACTS_REQUIRED/);
   }
   assert.deepEqual(calcuttaWork(),{jobs:0,intents:0});
  });
  await check('valid empty auction permits shipping Mark Live, exact replay and actor-bound receipt/audit',async()=>{
   const facts=financial(),input=controlInput('2026-R1-3');
   const first=await client.controlRequest('mark-live',input),again=await client.controlRequest('mark-live',input);
   assert.deepEqual(again.receipt,first.receipt);assert.equal(match(input.matchId).status,'LIVE');
   assert.equal(match(input.matchId).match_revision,input.expectedMatchRevision+1);
   assert.equal(financial(),facts);assert.deepEqual(calcuttaWork(),{jobs:0,intents:0});
   assert.equal(f.q(`select count(*)from scoring_authority.score_mutations where mutation_key='${input.operationRequestId}'`),'1');
   assert.equal(f.q(`select state from production_control.certification_ingress_leases_v1 where operation_request_id='${input.operationRequestId}'`),'COMMITTED');
   const lease=JSON.parse(f.q(`select to_jsonb(v)from production_control.certification_ingress_leases_v1 v where operation_request_id='${input.operationRequestId}'`));
   assert.equal(lease.resource_id,f.resource.resource_id);assert.equal(lease.actor_auth_user_id,f.envelope.authorization.auth_user_id);
   evidence.correctedMarkLive={operationId:input.operationRequestId,revision:match(input.matchId).match_revision,resource:lease.resource_id};
  });
  await check('empty auction creates neither direct jobs nor score-derived intents across access/score/lock',async()=>{
   const id='2026-R1-3';await client.controlRequest('access-activate',controlInput(id));
   const m=match(id),mutation=randomUUID();
   runtime.execute(runtime.request('SCORING.SUBMIT_HOLE',{match_id:id,mutation_key:mutation,hole_number:1,
    expected_match_revision:m.match_revision,expected_hole_revision:0,team_1_gross_scores:[4,4],team_2_gross_scores:[5,5]},
    {...runtime.authorization(),match_id:id,permission_revision:m.permission_revision},mutation));
   await client.controlRequest('scoring-lock',controlInput(id));assert.deepEqual(calcuttaWork(),{jobs:0,intents:0});
   assert.equal(count('scoring_authority.hole_scores'),1);
  });
  await check('participant, spectator and signed-out Director requests expose no financial data and create no lease',async()=>{
   const before=count('production_control.certification_ingress_leases_v1'),original=s.authorization;
   try{for(const auth of [{status:'signed-out'},...['PLAYER','SPECTATOR'].map(role=>({...original,identity:{...original.identity,actor:{...original.identity.actor,role}}}))]){
    s.setAuthorization(auth);
    for(const family of ['CALCUTTA_MANAGEMENT','MATCH_CONTROL']){
     const response=await s.request('/api/director/canonical-operations?family='+family);
     assert.equal(response.status,403);const body=await response.json();assert.equal(body.data,undefined);assert.equal(body.receipt,undefined);
    }
   }}finally{s.setAuthorization(original);}
   assert.equal(count('production_control.certification_ingress_leases_v1'),before);
  });
  await check('wrong resource/context/revision and private cores remain denied',async()=>{
   const payload={action:'mark-live',match_id:'2026-R1-4',expected_match_revision:match('2026-R1-4').match_revision,
    expected_permission_revision:match('2026-R1-4').permission_revision};
   for(const alter of [i=>i.resource.resource_id='BAGGER_INV_PRODUCTION',i=>i.resource.project_ref='idgigvjjqkfbqjeredpb',
    i=>i.resource.resource_id='CERTIFICATION:'+randomUUID(),i=>i.expected_context_token='f'.repeat(64),
    i=>i.deployment.deployment_id='dpl_WrongLocalDeployment']){
    const input=structuredClone(runtime.request('DIRECTOR.MATCH_CONTROL',payload));alter(input);
    assert.throws(()=>f.rpc('admit_certification_operation_v1',input));
   }
   await assert.rejects(client.controlRequest('mark-live',{...controlInput('2026-R1-4'),expectedMatchRevision:99}));
   for(const role of ['anon','authenticated','service_role'])
    assert.throws(()=>f.q(`set role ${role};select scoring_authority.enqueue_production_calcutta_v1_change()`),/permission denied/);
   assert.equal(match('2026-R1-4').status,'UPCOMING');
  });
  await check('nonempty auction still creates required work and normal worker calculates an unpublished result',async()=>{
   await client.calcuttaRequest('management-entry',{...predecessor(await model()),operationRequestId:randomUUID(),
    entry:{playerId:'P01',purchasePrice:'1',owners:[{buyerId:'P12',percentage:'100'}]}});
   const facts=financial();await client.controlRequest('mark-live',controlInput('2026-R1-4'));
   assert.ok(calcuttaWork().jobs>0);assert.equal(match('2026-R1-4').status,'LIVE');
   const transport=certificationWorkerTransport(f);
   const result=await recalculateCalcuttaAfterCanonicalMutation('2026',{matchId:'2026-R1-4'},
    {env:transport.env,dependencies:{certificationDependencies:transport.dependencies}});
   assert.equal(result.ok,true,JSON.stringify(result));assert.ok(count('scoring_authority.calcutta_v1_result_revisions')>0);
   assert.equal(current().publication_state,'UNPUBLISHED');
   // Result/current state advances; immutable financial input revisions do not.
   const before=JSON.parse(facts),after=JSON.parse(financial());
   assert.deepEqual(after.auctions,before.auctions);assert.deepEqual(after.publications,before.publications);
   assert.equal(f.q("select count(*)from scoring_authority.calcutta_v1_recalculation_jobs where status in('PENDING','RUNNING')"),'0');
   evidence.nonempty={result:result.ok,jobs:calcuttaWork().jobs,results:count('scoring_authority.calcutta_v1_result_revisions')};
  });
  await check('final local fixture has no unknown lease, Google/publication or authority broadening',async()=>{
   // Fence the deliberately stale revision operation's noncommitted lease.
   for(const c of s.calls.filter(c=>c.name==='admit_certification_operation_v1')){
    const id=c.input.operation_request_id;
    if(/ADMITTED|UNKNOWN/.test(f.q(`select state from production_control.certification_ingress_leases_v1 where operation_request_id='${id}'`)))
     assert.equal(f.rpc('resolve_certification_ingress_v1',c.input).state,'NOT_COMMITTED');
   }
   assert.equal(f.q("select count(*)from production_control.certification_ingress_leases_v1 where state in('ADMITTED','UNKNOWN')"),'0');
   for(const table of ['production_control.resource_scope','production_control.cutover_activation_state','scoring_authority.google_outbox_events',
    'scoring_authority.odds_published_snapshots'])assert.equal(count(table),0,table);
   toggle(false);assert.equal(f.q('select enabled from production_control.certification_admission_v1'),'f');
   assert.equal(f.q('select state from scoring_authority.ingress_gates'),'PAUSED');
  });
  evidence.result='PASS';
 }catch(error){evidence.result='FAIL';evidence.failure=error.message;throw error;}
 finally{
  await mkdir(directory,{recursive:true});await writeFile(directory+'/focused-integration.json',JSON.stringify(evidence,null,2)+'\n');
  if(f)await destroyIsolatedCluster(f.cluster);
 }
});
