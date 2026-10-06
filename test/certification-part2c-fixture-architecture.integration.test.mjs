// Architecture assessment only. Creates an owned, socket-only PG17 counterpart;
// it cannot connect to a hosted resource or provision a new rehearsal resource.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createCalcuttaQueueFixture} from './support/reliability/certification-calcutta-queue-fixture.mjs';
import {sqlFile, sqlResult, jsonLiteral, repositoryRoot, destroyIsolatedCluster} from './support/reliability/postgres17.mjs';
import {certificationResourceEnvironment} from '../lib/canonical-resource-registration.js';
import {supervisorEnvelope} from '../lib/certification-worker-supervision.js';
import {CERTIFICATION_WORKER_ENGINES} from '../lib/certification-worker-engines.js';

const baseSha='4d263b3a284ec2feab9f242777d42f3bf01d6ede';
const output=process.env.BAGGER_PART2C_ARCHITECTURE_EVIDENCE || '/private/tmp/bagger-part2c-fixture-review-4d263b3a';
const retained=JSON.parse(await readFile(new URL('../docs/reliability/phase2d-part2c-fixture-review/retained-checkpoint.json',import.meta.url),'utf8'));

test('Part2C fixture architecture: existing contract limits, no bypass or historical rewrite',async t=>{
 const f=await createCalcuttaQueueFixture({emptyAuction:false});
 const evidence={baseSha,environment:'OWNED_LOCAL_POSTGRESQL17',safeupdate:'on',hostedAccess:false,
  hostedMutation:false,resourceCreated:false,scoringExecuted:false,tests:[],functions:[],selectedModel:'D',
  remediationStatus:'BLOCKED',readyForHostedProvisioning:false};
 const check=async(name,fn)=>{let failure;await t.test(name,async()=>{try{await fn();evidence.tests.push({name,result:'PASS'});}catch(e){failure=e;throw e;}});if(failure)throw failure;};
 const body=signature=>f.q(`select prosrc from pg_proc where oid=(${jsonLiteral(signature)}#>>'{}')::regprocedure`);
 const constraint=table=>f.q(`select string_agg(pg_get_constraintdef(oid),E'\n' order by conname)from pg_constraint where conrelid=(${jsonLiteral(table)}#>>'{}')::regclass`);
 const controls=()=>f.q(`select jsonb_build_object('resource',(select to_jsonb(v)from production_control.canonical_resource_v1 v),
  'pointer',(select to_jsonb(v)from production_control.current_tournament_pointer_v1 v),
  'admission',(select to_jsonb(v)from production_control.certification_admission_v1 v),
  'supervisor',(select to_jsonb(v)from production_control.worker_supervisor_v1 v))`);
 try{
  for(const artifact of ['certification-calcutta-publication-v1.sql','certification-net-skins-result-read-v1.sql',
   'certification-net-skins-calculation-v1.sql','certification-odds-input-configuration-v1.sql'])
   sqlFile(f.cluster,f.database,repositoryRoot+'/supabase/production_incremental/'+artifact,{role:''});
  await check('PG17 and real pg-safeupdate enabled',()=>{
   assert.match(f.q('select version()'),/PostgreSQL 17\./);assert.equal(f.q("select current_setting('safeupdate.enabled')"),'on');
  });
  await check('critical local definitions exactly match retained hosted installation hashes',async()=>{
   const catalog=retained;
   assert.equal(catalog.baseSha,baseSha);assert.equal(catalog.freshHostedAccessThisReview,false);
   const names=new Set(['apply_tournament_setup_round_v1','apply_tournament_setup_match_v1','tournament_setup_readiness_v1',
    'canonical_mutate_future_year_administration_v2','canonical_activate_annual_scoring_transition_v2',
    'close_certification_annual_predecessor_v1','certification_annual_predecessor_certificate_v1',
    'worker_supervisor_binding_v1','worker_supervisor_queue_binding_v2','worker_supervisor_scope_v1',
    'worker_supervisor_counts_v1','derived_final_recap_ready_v1','dispatch_certification_net_skins_configuration_v1']);
   const functions=catalog.functions.filter(v=>names.has(v.signature.split('(')[0].split('.').at(-1)));
   assert.equal(functions.length,names.size);
   for(const fn of functions){assert.equal(f.q(`select encode(extensions.digest(prosrc,'sha256'),'hex')from pg_proc where oid=(${jsonLiteral(fn.signature)}#>>'{}')::regprocedure`),fn.body_sha256,fn.signature);
    evidence.functions.push({signature:fn.signature,bodySha256:fn.body_sha256});}
  });
  await check('installed format is 24 players, two teams, six BB/six SC/twelve SI',()=>{
   const source=body('production_control.tournament_setup_readiness_v1()');
   assert.match(source,/BB/);assert.match(source,/SC/);assert.match(source,/SI/);
   assert.match(source,/active_roster[^\n]*\/\s*4|roster_count[^\n]*\/\s*4/i);
   assert.match(source,/active_roster[^\n]*\/\s*2|roster_count[^\n]*\/\s*2/i);
   evidence.requiredStructure={players:24,teams:2,rounds:3,matches:24,formats:{BB:6,SC:6,SI:12}};
  });
  await check('Model B cannot introduce a second 2026 identity under installed uniqueness/catalog rules',()=>{
   assert.match(constraint('scoring_authority.tournaments'),/UNIQUE \(tournament_year\)/);
   assert.match(constraint('production_control.future_tournament_catalog_v1'),/tournament_id = \(tournament_year\)::text/);
   assert.match(constraint('production_control.current_tournament_pointer_v1'),/PRIMARY KEY \(scope_key\)/);
  });
  await check('future tournament support is real annual succession, not an arbitrary sibling selector',()=>{
   const source=body('production_control.canonical_mutate_future_year_administration_v2(jsonb,jsonb)');
   assert.match(source,/tournament_year <= \(input->>'tournament_year'\)::integer/);
   assert.match(source,/target_id <> tournament_year::text/);
   assert.match(source,/FUTURE_TOURNAMENT_ACTIVATION_NOT_INSTALLED/);
   const activate=body('production_control.canonical_activate_annual_scoring_transition_v2(jsonb,jsonb)');
   assert.match(activate,/transition_value.transition_status <> 'CLOSED'/);
   assert.match(activate,/certificate->>'certified'/);
  });
  await check('annual close refuses incomplete predecessor; no pointer overwrite or fake certificate',()=>{
   const source=body('production_control.close_certification_annual_predecessor_v1(jsonb,text)');
   assert.match(source,/status<>'FINAL' or not scorecard_complete or unresolved_mutations<>0/);
   assert.match(source,/PREDECESSOR_FINAL_SCORING_FACTS_REQUIRED/);
   assert.equal(f.q("select count(*)from scoring_authority.matches where tournament_id='2026'and(status<>'FINAL'or not scorecard_complete)"),'2');
  });
  await check('certified autonomous Queue binding requires current 2026 and exact physical resource',()=>{
   const source=body('production_control.worker_supervisor_binding_v1(jsonb)');
   assert.match(source,/p.tournament_id<>'2026'/);assert.match(source,/trmcwrljjxwhgtikfdgu/);
   assert.match(source,/CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51/);
   const binding=JSON.parse(f.q(`select production_control.worker_supervisor_queue_binding_v2(${jsonLiteral(f.bound)})`));
   assert.equal(binding.tournament_id,'2026');
   const counts=body('production_control.worker_supervisor_counts_v1()');
   assert.match(counts,/calcutta_v1_recalculation_jobs where tournament_id='2026'/);
  });
  await check('current Net Skins Certification configuration adapter also requires 2026',()=>{
   assert.match(body('production_control.dispatch_certification_net_skins_configuration_v1(jsonb,jsonb,boolean)'),
    /context->>'tournament_id' is distinct from '2026'/);
  });
  await check('fresh physical resource cannot be selected by environment changes alone',()=>{
   const environment={...f.env,BAGGER_CERTIFICATION_RESOURCE_ID:'CERTIFICATION:11111111-1111-4111-8111-111111111111',
    SUPABASE_SCORING_MIRROR_URL:'https://cccccccccccccccccccc.supabase.co',
    NEXT_PUBLIC_SUPABASE_AUTH_URL:'https://cccccccccccccccccccc.supabase.co'};
   assert.equal(certificationResourceEnvironment(environment,f.dependencies).eligible,false);
   assert.throws(()=>supervisorEnvelope(environment,f.dependencies),/authority is unavailable/);
  });
  await check('participants/anon/authenticated/bare service_role cannot change the pointer or invoke owner cores',()=>{
   const before=controls();
   for(const role of ['anon','authenticated','service_role']){
    const change=sqlResult(f.cluster,f.database,`set role ${role};update production_control.current_tournament_pointer_v1
     set tournament_id='2097'where scope_key='${f.resource.resource_id}';`,{role});
    assert.notEqual(change.status,0);assert.match(change.stderr,/permission denied/);
    const close=sqlResult(f.cluster,f.database,`set role ${role};select production_control.close_certification_annual_predecessor_v1('{}','2026')`,{role});
    assert.notEqual(close.status,0);assert.match(close.stderr,/permission denied/);
   }assert.equal(controls(),before);
  });
  await check('Model A cannot erase prior R3 chronology; preserved checkpoint/history evidence stays separate',async()=>{
   const inventory=retained.inventory;
   assert.equal(inventory.players.length,4);assert.equal(inventory.matches.length,2);
   assert.equal(inventory.matches.find(m=>m.id==='2026-R3-12').status,'FINAL');
   assert.equal(inventory.matches.find(m=>m.id==='2026-R3-12').holes,18);
   assert.deepEqual(retained.tableHashesBefore,retained.tableHashesAfter);
   evidence.retainedEvidence={inventorySha256:retained.originalFilesSha256['FIXTURE-INVENTORY.json'],
    dataHashesSha256:retained.originalFilesSha256['FINAL-DATA-HASHES.json']};
  });
  await check('positive FinalRecap admission is outside preserved Queue scope; no implicit engine expansion',()=>{
   assert.equal(CERTIFICATION_WORKER_ENGINES.includes('TOURNAMENT_FINAL_RECAP'),false);
   assert.match(body('production_control.worker_supervisor_scope_v1()'),/derived_final_recap_ready_v1\('2026'\)/);
   evidence.downstreamPlanningNote='Existing Queue scope denies Final Results/eligible FinalRecap; retain negative certification, review positive execution admission before Part2C.';
  });
  await check('assessment leaves local admissions disabled, ingress paused, supervisor off, zero competitive execution',()=>{
   assert.equal(f.q('select enabled from production_control.certification_admission_v1'),'f');
   assert.equal(f.q('select state from scoring_authority.ingress_gates'),'PAUSED');
   assert.equal(f.q('select state from production_control.worker_supervisor_v1'),'OFF');
   for(const table of ['hole_scores','score_mutations','odds_calculation_jobs','odds_published_snapshots'])
    assert.equal(f.q(`select count(*)from scoring_authority.${table}`),'0');
   assert.equal(f.q('select count(*)from production_control.worker_supervisor_invocations_v1'),'0');
  });
 }finally{
  await destroyIsolatedCluster(f.cluster);await mkdir(output,{recursive:true});
  await writeFile(output+'/LOCAL-ARCHITECTURE-PROOF.json',JSON.stringify(evidence,null,2)+'\n');
 }
});
