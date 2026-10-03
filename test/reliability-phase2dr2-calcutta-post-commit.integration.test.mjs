// NA-CERTIFICATION-CALCUTTA-POSTCOMMIT: shipping hook -> bound worker -> actual
// canonical calculator/PostgreSQL. Only transport and initial synthetic facts.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createCertificationFixture} from './support/reliability/phase2d-certification-fixture.mjs';
import {certificationProvisionalProfile as forwardMigrations} from './support/reliability/certification-provisional-profile.mjs';
import {certificationTransportRegistration} from './support/reliability/certification-ingress-js-proof.mjs';
import {provisionAnnualSyntheticAuthority,annualRuntime} from './support/reliability/certification-annual-transition-fixture.mjs';
import {certificationDirectorStack,provisionCertificationFinancialFixture} from './support/reliability/certification-director-proof.mjs';
import {certificationWorkerTransport} from './support/reliability/certification-worker-proof.mjs';
import {destroyIsolatedCluster,jsonLiteral} from './support/reliability/postgres17.mjs';
import {buildTournamentSetupMutation} from '../lib/production-tournament-setup-contract.js';
import {predecessor} from '../lib/calcutta-management-model.js';
import {recalculateCalcuttaAfterCanonicalMutation} from '../lib/calcutta-post-commit.js';

const file='test/reliability-phase2dr2-calcutta-post-commit.integration.test.mjs';
const files=[...forwardMigrations,file,'lib/calcutta-post-commit.js','lib/score-derived-delivery.js','lib/certification-worker-adapter.js',
 'lib/production-calcutta-server.js','lib/certification-runtime-server.js'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async path=>[path,createHash('sha256').update(await readFile(path)).digest('hex')])));
test('actual Certification Calcutta postcommit hook uses durable canonical workers',async t=>{
 const evidence={environment:'OWNED_SOCKET_ONLY_POSTGRESQL17',hosted:false,production:false,googleCalls:0,sourceBefore:await hashes(),cases:[]};
 let f;
 const check=async(name,fn)=>{let failure;await t.test(name,async()=>{try{await fn();evidence.cases.push({name,status:'PASS'});}catch(error){failure=error;throw error;}});if(failure)throw failure;};
 try{
  f=await createCertificationFixture({forwardMigrations,registrationFactory:certificationTransportRegistration});
  provisionAnnualSyntheticAuthority(f);const runtime=annualRuntime(f),matchId='2026-R1-1';
  const match=()=>JSON.parse(f.q(`select to_jsonb(m)from scoring_authority.matches m where match_id='${matchId}'`));
  const id=randomUUID(),setup=buildTournamentSetupMutation('prepare-scoring-context',{expectedRevision:f.model().revision,operationRequestId:id,matchId});delete setup.operation_request_id;
  runtime.execute(runtime.request('DIRECTOR.MUTATE_SETUP',{...setup,action:'prepare-scoring-context'},runtime.authorization(),id));
  for(const action of ['mark-live','access-activate']){const m=match();runtime.execute(runtime.request('DIRECTOR.MATCH_CONTROL',{action,match_id:matchId,expected_match_revision:m.match_revision,expected_permission_revision:m.permission_revision}));}
  provisionCertificationFinancialFixture(f);const director=await certificationDirectorStack(f),model=(await director.transport.calcuttaRequest('management-read')).data;
  await director.transport.calcuttaRequest('management-entry',{...predecessor(model),operationRequestId:randomUUID(),
   entry:{playerId:model.players[0].player_id,purchasePrice:'123.45',owners:[{buyerId:model.players[1].player_id,percentage:'100'}]}});
  const scoreId=randomUUID(),m=match();runtime.execute(runtime.request('SCORING.SUBMIT_HOLE',{match_id:matchId,mutation_key:scoreId,
   hole_number:1,expected_match_revision:m.match_revision,expected_hole_revision:0,team_1_gross_scores:[4,4],team_2_gross_scores:[5,5]},
   {...runtime.authorization(),match_id:matchId,permission_revision:m.permission_revision},scoreId));
  const facts=()=>f.q(`select jsonb_build_object('configuration',(select jsonb_agg(to_jsonb(x)order by configuration_revision)from scoring_authority.calcutta_v1_configuration_revisions x),
   'auction',(select jsonb_agg(to_jsonb(x)order by auction_revision)from scoring_authority.calcutta_v1_auction_fact_revisions x),
   'publication',(select jsonb_build_object('state',publication_state,'revision',publication_revision)from scoring_authority.calcutta_v1_current where tournament_id='2026'))`);
  const financialBefore=facts();
  const counts=()=>f.q(`select jsonb_build_object('jobs',(select count(*)from scoring_authority.calcutta_v1_recalculation_jobs),
   'results',(select count(*)from scoring_authority.calcutta_v1_result_revisions),'receipts',(select count(*)from production_control.operation_audit_events))`);
  const transport=certificationWorkerTransport(f),options={env:transport.env,dependencies:{certificationDependencies:transport.dependencies}};
  await check('wrong target and missing target stop after canonical context read without worker writes',async()=>{
   const before=counts();for(const target of ['2097',''])await assert.rejects(recalculateCalcuttaAfterCanonicalMutation(target,{matchId},options),{code:'CERTIFICATION_CALCUTTA_TARGET_MISMATCH'});
   assert.equal(counts(),before);assert.equal(transport.calls.some(c=>c.name==='execute_certification_operation_v1'),false);
  });
  await check('actual scored tournament completes Calcutta calculation through existing durable processor without publication',async()=>{
   const result=await recalculateCalcuttaAfterCanonicalMutation('2026',{matchId,mutationKey:scoreId},options);
   evidence.firstHook={result,calls:transport.calls,queues:JSON.parse(f.q(`select jsonb_build_object(
    'intents',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)from scoring_authority.score_derived_intents_v1 x where family='CALCUTTA'),
    'jobs',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)from scoring_authority.calcutta_v1_recalculation_jobs x))`))};
   assert.equal(result.ok,true,JSON.stringify(result));
   assert.ok(transport.calls.some(c=>c.operation==='WORKERS.CALCUTTA_CLAIM'));
   assert.ok(transport.calls.some(c=>c.operation==='WORKERS.CALCUTTA_COMPLETE'));
   assert.equal(transport.calls.some(c=>/COMPETITION_(?:CLAIM|WRITE)|INTELLIGENCE_|PUBLISH/.test(c.operation||'')),false);
   assert.ok(Number(f.q("select count(*)from scoring_authority.calcutta_v1_result_revisions where tournament_id='2026'"))>0);
   assert.equal(facts(),financialBefore);assert.equal(f.q('select count(*)from scoring_authority.hole_scores'),'1');
   evidence.canonicalResult=JSON.parse(f.q("select jsonb_build_object('result_revision',result_revision,'result_state',state,'publication_state',publication_state)from scoring_authority.calcutta_v1_current where tournament_id='2026'"));
  });
  await check('repeat wakeup is idempotent and preserves canonical financial facts',async()=>{
   const before=f.q('select count(*)from scoring_authority.calcutta_v1_result_revisions');
   const result=await recalculateCalcuttaAfterCanonicalMutation('2026',{matchId,mutationKey:scoreId},options);
   assert.equal(result.ok,true);assert.equal(f.q('select count(*)from scoring_authority.calcutta_v1_result_revisions'),before);assert.equal(facts(),financialBefore);
  });
  await check('real admission revision change after context read conflicts before materialization',async()=>{
   const original=transport.dependencies.fetchImpl;let changed=false;
   transport.dependencies.fetchImpl=async(url,init)=>{
    if(!changed&&url.endsWith('/execute_certification_operation_v1')){changed=true;
     f.q(`select production_control.set_certification_admission_v1(${jsonLiteral({resource_id:f.resource.resource_id,expected_admission_revision:f.context('WORKERS').admission_revision,enabled:true,reason:'Synthetic current-context revision race'})})`);}
    return original(url,init);
   };
   const before=f.q('select count(*)from scoring_authority.calcutta_v1_result_revisions');
   try{await assert.rejects(recalculateCalcuttaAfterCanonicalMutation('2026',{matchId},options),{code:'CANONICAL_RESOURCE_CONTEXT_STALE',status:409,databaseSqlstate:'40001'});}finally{transport.dependencies.fetchImpl=original;}
   assert.equal(changed,true);assert.equal(f.q('select count(*)from scoring_authority.calcutta_v1_result_revisions'),before);assert.equal(facts(),financialBefore);
  });
  await check('disabled admission and unprivileged database roles cannot enter worker authority',async()=>{
   const context=f.context('WORKERS');f.q(`select production_control.set_certification_admission_v1(${jsonLiteral({resource_id:f.resource.resource_id,expected_admission_revision:context.admission_revision,enabled:false,reason:'Synthetic negative hook admission'})})`);
   await assert.rejects(recalculateCalcuttaAfterCanonicalMutation('2026',{matchId},options));
   for(const role of ['anon','authenticated'])assert.throws(()=>f.rpc('read_certification_runtime_context_v1',{...f.envelope,phase:'WORKERS'},role),/permission denied/);
   assert.equal(facts(),financialBefore);assert.equal(f.q('select count(*)from scoring_authority.google_outbox_events'),'0');
   assert.equal(f.q('select count(*)from production_control.resource_scope'),'0');
  });
  evidence.calls=transport.calls;evidence.result='PASS';
 }catch(error){evidence.result='FAIL';evidence.failure={code:error.code||null,message:error.message};throw error;}
 finally{
  evidence.sourceAfter=await hashes();evidence.sourceStable=JSON.stringify(evidence.sourceBefore)===JSON.stringify(evidence.sourceAfter);
  await mkdir('docs/reliability/phase2d-resource-model/implementation-evidence',{recursive:true});
  await writeFile('docs/reliability/phase2d-resource-model/implementation-evidence/calcutta-postcommit-'+new Date().toISOString().replaceAll(/[:.]/g,'-')+'.json',JSON.stringify(evidence,null,2)+'\n');
  if(f)await destroyIsolatedCluster(f.cluster);
 }
 assert.equal(evidence.sourceStable,true);
});
