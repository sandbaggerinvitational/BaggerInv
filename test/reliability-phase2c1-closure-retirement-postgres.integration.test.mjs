// Proof layers: POSTGRESQL / INTEGRATION / FAILURE_INJECTION.
// Owned socket-only synthetic fixture; no credentials, provider URL or live data.
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createPhase2CFixture} from './support/reliability/phase2c-fixture.mjs';
import {inputFor,rpc,cloneScoreProofDatabase} from './support/reliability/phase2-score-fixture.mjs';
import {seedSyntheticSideGameHistory} from './support/reliability/synthetic-history.mjs';
import {sql,sqlFile,sqlResult,jsonLiteral,repositoryRoot,destroyIsolatedCluster} from './support/reliability/postgres17.mjs';
// Reuses preserved retirement assertions against an actual upgrade through closure127.
const migration='supabase/production_migrations/202609290125_google_runtime_retirement_v1.sql';
const jobState=(c,d)=>sql(c,d,`select jsonb_build_object(
 'outbox',(select jsonb_agg(to_jsonb(v)order by id)from scoring_authority.google_outbox_events v),
 'archive',(select jsonb_agg(to_jsonb(v)order by job_id)from scoring_authority.scorecard_archive_jobs v),
 'checkpoints',(select jsonb_agg(to_jsonb(v)order by match_id)from scoring_authority.scorecard_archive_checkpoints v),
 'snapshots',(select jsonb_agg(to_jsonb(v)order by snapshot_id)from scoring_authority.finalized_scorecard_snapshots v))::text`);
const counts=(c,d,match)=>JSON.parse(sql(c,d,`select jsonb_build_object(
 'holes',(select count(*)from scoring_authority.hole_scores where match_id=${jsonLiteral(match)}#>>'{}'),
 'receipts',(select count(*)from scoring_authority.score_mutations where match_id=${jsonLiteral(match)}#>>'{}'),
 'outbox',(select count(*)from scoring_authority.google_outbox_events where match_id=${jsonLiteral(match)}#>>'{}'),
 'archive',(select count(*)from scoring_authority.scorecard_archive_jobs where match_id=${jsonLiteral(match)}#>>'{}'),
 'snapshot',(select count(*)from scoring_authority.finalized_scorecard_snapshots where match_id=${jsonLiteral(match)}#>>'{}'),
 'audit',(select count(*)from scoring_authority.audit_events where match_id=${jsonLiteral(match)}#>>'{}'))`));
test('NA-2026-GOOGLE-RUNTIME-DEPENDENCY: SQL retirement preserves canonical authority and historical delivery evidence',{timeout:180000},async t=>{
 // Upgrade test must start at genuine124. The later opt-in installer is not allowed
 // to pre-apply125 and make preservation/upgrade assertions tautological.
 const optIn=process.env.BAGGER_PHASE2C1_CANDIDATE,closure=process.env.BAGGER_PHASE2C1_CLOSURE;delete process.env.BAGGER_PHASE2C1_CANDIDATE;delete process.env.BAGGER_PHASE2C1_CLOSURE;
 let f;try{f=await createPhase2CFixture();}finally{if(optIn!==undefined)process.env.BAGGER_PHASE2C1_CANDIDATE=optIn;if(closure!==undefined)process.env.BAGGER_PHASE2C1_CLOSURE=closure;}
 const c=f.cluster,d=f.database;const evidence={fixture:'phase2c1-closure-retirement-sql-v1',closureMigrations:[126,127],environment:'OWNED_SOCKET_ONLY_POSTGRESQL17',proofLayers:['POSTGRESQL','INTEGRATION'],production:false,
  migration,sha256:createHash('sha256').update(await readFile(path.join(repositoryRoot,migration))).digest('hex'),tests:[],limitations:[...f.metadata.limitations,'Annual full activation/release tested separately','No Google account or Production proof']};
 const noExternalDelivery=result=>{assert.equal(result.google_outbox_created,false,JSON.stringify(result));return result;};
 const record=(name,result={})=>evidence.tests.push({name,status:'PASS',...result});
 try{
  const historical='2026-R3-12';
  for(let h=1;h<=18;h++)assert.equal(rpc(c,d,'submit_production_hole_score',inputFor(c,d,historical,h,{key:`legacy:${h}`})).code,'ACCEPTED');
  assert.equal(rpc(c,d,'finalize_production_match',inputFor(c,d,historical,18,{key:'legacy-final'})).code,'FINALIZED');
  sql(c,d,`update scoring_authority.google_outbox_events set status=case match_revision%4 when 0 then 'DELIVERED' when 1 then 'PENDING' when 2 then 'RETRYABLE' else 'BLOCKED'end;
   update scoring_authority.scorecard_archive_jobs set status='BLOCKED';`,{role:''});
  const before=jobState(c,d),canonicalBefore=counts(c,d,historical);
  assert.equal(canonicalBefore.holes,18);assert.equal(canonicalBefore.snapshot,1);assert.ok(canonicalBefore.outbox>=19);assert.equal(canonicalBefore.archive,1);
  sqlFile(c,d,path.join(repositoryRoot,migration),{role:''});
  for(const file of ['202609290126_google_retired_release_admission_v1.sql','202609300127_canonical_annual_create_contract_v1.sql'])sqlFile(c,d,path.join(repositoryRoot,'supabase/production_migrations',file),{role:''});
  await t.test('Upgrade preserves all old pending/failed/delivered/blocked records and canonical snapshots',()=>{
   assert.equal(jobState(c,d),before);assert.deepEqual(counts(c,d,historical),canonicalBefore);
   assert.equal(sql(c,d,`select count(*)from scoring_authority.score_mutations where match_id='${historical}' and result->>'google_outbox_created'='true'`),'19','Historical pre-retirement receipt facts remain unchanged');record('HISTORICAL_EVIDENCE_BYTE_PRESERVED',canonicalBefore);
  });
  await t.test('Real canonical score, lock, recovery, resume, Finalize and Reopen create no Google delivery rows',()=>{
   const match='2026-R3-11';let first;
   const grant=rpc(c,d,'mutate_production_match_control',inputFor(c,d,match,1,{director:true,operation:'ACCESS_ACTIVATE',key:'retirement-grant'}));assert.equal(noExternalDelivery(grant).ok,true);
   for(let h=1;h<=18;h++){
    const input=inputFor(c,d,match,h,{key:`retired:${h}`});if(h===1)first=input;
    assert.equal(noExternalDelivery(rpc(c,d,'submit_production_hole_score',input)).code,'ACCEPTED');
    if(h===1){
     assert.equal(noExternalDelivery(rpc(c,d,'mutate_production_match_control',inputFor(c,d,match,h,{director:true,operation:'SCORING_LOCK',key:'retirement-lock'}))).ok,true);
     assert.equal(rpc(c,d,'read_production_score_mutation_status_v1',first).status,'COMMITTED');
     assert.equal(noExternalDelivery(rpc(c,d,'mutate_production_match_control',inputFor(c,d,match,h,{director:true,operation:'SCORING_UNLOCK',key:'retirement-unlock'}))).ok,true);
    }
   }
   assert.equal(noExternalDelivery(rpc(c,d,'finalize_production_match',inputFor(c,d,match,18,{key:'retired-final'}))).code,'FINALIZED');
   const finalized=counts(c,d,match);assert.equal(finalized.holes,18);assert.equal(finalized.snapshot,1);assert.equal(finalized.outbox,0);assert.equal(finalized.archive,0);assert.ok(finalized.audit>18);
   assert.equal(sql(c,d,`select status from scoring_authority.matches where match_id='${match}'`),'FINAL');
   assert.equal(noExternalDelivery(rpc(c,d,'reopen_production_match',inputFor(c,d,match,18,{director:true,key:'retired-reopen'}))).ok,true);
   assert.equal(sql(c,d,`select state from scoring_authority.finalized_scorecard_snapshots where match_id='${match}'`),'INVALIDATED');
   assert.equal(sql(c,d,`select count(*) from scoring_authority.audit_events where match_id='${match}' and action='FINALIZED_SCORECARD_SNAPSHOT_INVALIDATED'`),'1');
   assert.equal(counts(c,d,match).outbox,0);assert.equal(counts(c,d,match).archive,0);
   assert.equal(sql(c,d,`select count(*)from scoring_authority.score_mutations where match_id='${match}' and result->>'google_outbox_created' is distinct from 'false'`),'0','All new persisted receipts accurately report zero Google enqueue');
   record('CANONICAL_SCORE_CONTROL_SNAPSHOT_INDEPENDENT',{...finalized,allNewResponseAndReceiptGoogleFlagsFalse:true,historicalFlagsPreserved:true});
  });
  await t.test('Retired service worker grants are revoked and immutable dispatch guard is restored',()=>{
   assert.equal(sql(c,d,`select count(*)from production_control.annual_scoring_rpc_allowlist_v1 where enabled and required_worker in('SCORING_GOOGLE_OUTBOX','ROUND_SCORECARDS_ARCHIVE')`),'0');
   assert.equal(sql(c,d,`select has_function_privilege('service_role','public.claim_production_google_outbox(jsonb)','EXECUTE')`),'f');
   assert.equal(sql(c,d,`select has_function_privilege('service_role','public.claim_production_scorecard_archive_job(jsonb)','EXECUTE')`),'f');
   assert.equal(sql(c,d,`select tgenabled from pg_trigger where tgname='production_annual_scoring_rpc_allowlist_immutable_v1'`),'O');
   const denied=sqlResult(c,d,`update production_control.annual_scoring_rpc_allowlist_v1 set enabled=true where operation_name='claim_production_google_outbox'`,{role:''});assert.notEqual(denied.status,0);assert.match(denied.stderr,/PRODUCTION_FUTURE_RUNTIME_IMMUTABLE_RECORD/);
   record('RETIRED_WORKERS_AND_IMMUTABLE_GUARD');
  });
  await t.test('No automatic provider binding triggers survive; internal worker generation binding remains',()=>{
   assert.equal(sql(c,d,`select count(*)from pg_trigger where not tgisinternal and tgname in('google_outbox_annual_generation_v1','scorecard_archive_annual_generation_v1','odds_google_mirror_annual_generation_v1','sync_future_google_writer_binding_v2')`),'0');
   assert.equal(sql(c,d,`select count(*)from pg_trigger where not tgisinternal and tgname in('competition_recalculation_annual_generation_v1','net_skins_recalculation_annual_generation_v1','calcutta_recalculation_annual_generation_v1','odds_calculation_annual_generation_v1') and tgenabled='O'`),'4');record('AUTOMATIC_BINDING_SCOPE');
  });
  await t.test('Security/RLS remains closed; annual destination fields can be absent without invented writer identity',()=>{
   assert.equal(sql(c,d,`select count(*)from pg_attribute where attrelid='production_control.annual_scoring_runtime_authorities_v1'::regclass and attname in('google_writer_generation_id','destination_workbook_id','google_target_contract_fingerprint') and not attnotnull`),'3');
   assert.equal(sql(c,d,`select count(*)from pg_class where oid in('scoring_authority.hole_scores'::regclass,'scoring_authority.score_mutations'::regclass,'scoring_authority.finalized_scorecard_snapshots'::regclass) and relrowsecurity and not has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE') and not has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE')`),'3');record('PRIVATE_CANONICAL_AUTHORITY_PRESERVED');
  });
  await t.test('Unavailable retired Google services cannot write back financial authority or create required jobs',()=>{
   const db=cloneScoreProofDatabase(f,'financial_retirement');
   // Bulk synthetic fixture construction has its own finite setup budget. Restore the
   // unchanged1s score-path timeout before any behavior under test.
   sql(c,db,`alter database ${db} set statement_timeout='30000ms'`,{role:''});
   try {seedSyntheticSideGameHistory(c,db,1);} finally {sql(c,db,`alter database ${db} set statement_timeout='1000ms'`,{role:''});}
   const financial=()=>sql(c,db,`select jsonb_build_object(
    'auction',(select jsonb_agg(to_jsonb(v)order by auction_revision)from scoring_authority.calcutta_v1_auction_fact_revisions v),
    'publication',(select jsonb_agg(to_jsonb(v)order by publication_revision)from scoring_authority.calcutta_v1_publication_revisions v),
    'calcuttaResult',(select jsonb_agg(to_jsonb(v)order by result_revision)from scoring_authority.calcutta_v1_result_revisions v),
    'netResult',(select jsonb_agg(to_jsonb(v)order by round_number,result_revision)from scoring_authority.net_skins_v1_result_revisions v),
    'netConfig',(select jsonb_agg(to_jsonb(v)order by configuration_revision)from scoring_authority.net_skins_v1_configuration_revisions v))::text`);
   const beforeFinancial=financial(), parsed=JSON.parse(beforeFinancial);
   assert.equal(parsed.auction.length,37);assert.equal(parsed.auction.at(-1).auction_manifest.purchases.length,24);
   assert.equal(parsed.auction.at(-1).auction_manifest.ownership.length,24);assert.equal(parsed.calcuttaResult.length,407);assert.equal(parsed.netResult.length,2);
   for(const name of ['claim_production_google_outbox','complete_production_google_outbox','claim_production_scorecard_archive_job','complete_production_scorecard_archive_job']){
    const denied=sqlResult(c,db,`set role service_role;select public.${name}('{}')`,{role:''});assert.notEqual(denied.status,0);assert.match(denied.stderr,/permission denied/);
   }
   const match='2026-R3-10', initial=counts(c,db,match);
   assert.equal(rpc(c,db,'mutate_production_match_control',inputFor(c,db,match,1,{director:true,operation:'ACCESS_ACTIVATE',key:'financial-activate'})).ok,true);
   assert.equal(rpc(c,db,'submit_production_hole_score',inputFor(c,db,match,1,{key:'financial-score'})).code,'ACCEPTED');
   assert.equal(financial(),beforeFinancial);assert.equal(counts(c,db,match).outbox,initial.outbox);assert.equal(counts(c,db,match).archive,initial.archive);
   assert.equal(sql(c,db,`select count(*)from scoring_authority.score_derived_intents_v1 where family not in('CALCUTTA','NET_SKINS','COMPETITION')`),'0');
   record('FINANCIAL_WRITEBACK_UNAVAILABLE',{auctionRevisions:37,purchases:24,ownershipEntries:24,calcuttaResults:407,netResults:2,financialStateBytePreserved:true,newGoogleJobs:0,scope:'Retired delivery cannot mutate financial authority; calculator/payout correctness covered separately'});
  });
  await t.test('Preview History derives real stored provenance with no Sheet configuration and preserves service-only/public-safe fences',()=>{
   const db=cloneScoreProofDatabase(f,'preview_history');
   sqlFile(c,db,path.join(repositoryRoot,'supabase/migrations/202608130010_preview_2026_historical_reads.sql'),{role:''});
   sqlFile(c,db,path.join(repositoryRoot,'supabase/migrations/202609290001_canonical_history_provenance_v1.sql'),{role:''});
   const history=year=>JSON.parse(sql(c,db,`select public.read_canonical_2026_historical_view('${year}')`));
   assert.equal(history('2099').code,'APPROVED_2026_HISTORY_CONTEXT_REQUIRED');
   assert.equal(history('2026').code,'APPROVED_2026_HISTORY_CONTEXT_REQUIRED'); // Original Production provenance is not admitted by a Preview function.
   sql(c,db,`set session_replication_role=replica;
    update scoring_authority.tournaments set source_workbook_id='phase2c1-synthetic-preview-provenance' where tournament_id='2026';
    update scoring_authority.game_center_presentations set source_workbook_id='phase2c1-synthetic-preview-provenance' where tournament_id='2026';
    insert into scoring_authority.participant_home_presentations(tournament_id,presentation,source_workbook_id,source_fingerprint,imported_by)
    values('2026','{"timeline":{"events":[]}}','phase2c1-synthetic-preview-provenance',repeat('e',64),'SYNTHETIC_ONLY');
    set session_replication_role=origin;`,{role:''});
   const projected=history('2026');assert.equal(projected.ok,true,JSON.stringify(projected));assert.equal(projected.data.counts.players,24);assert.equal(projected.data.counts.matches,24);
   assert.equal(projected.data.counts.current_finalized_snapshots,1);
   const raw=JSON.stringify(projected);for(const forbidden of ['google_outbox_events','scorecard_archive_jobs','audit_events','scoring_permissions','score_mutations'])assert.equal(raw.includes(forbidden),false);
   for(const role of ['anon','authenticated']){const denied=sqlResult(c,db,`set role ${role};select public.read_canonical_2026_historical_view('2026')`,{role:''});assert.notEqual(denied.status,0);assert.match(denied.stderr,/permission denied/);}
   record('PREVIEW_CANONICAL_HISTORY_PROVENANCE',{players:24,matches:24,finalizedSnapshots:1,googleConfigurationRequired:false,canonicalProvenance:'SQL tournament row',publicSafe:true,productionContextDenied:true});
  });
  assert.equal(evidence.tests.length,7,'Every owned SQL retirement subtest must pass before evidence can certify PASS');
  evidence.result='PASS';
 }catch(error){evidence.result='FAIL';evidence.error=error.message;throw error;}finally{
  try { if(process.env.BAGGER_PHASE2C1_SQL_EVIDENCE){const file=path.resolve(process.env.BAGGER_PHASE2C1_SQL_EVIDENCE);assert.ok(file.startsWith(path.join(repositoryRoot,'docs/reliability/phase2c1-closure/')));await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(evidence,null,2)+'\n');}
  } finally { await destroyIsolatedCluster(c); }
 }
});
