// Owned local PostgreSQL only. Annual authority and certificates are produced
// by supported canonical operations, never inserted or marked ready by fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createCertificationFixture,certificationForwardMigrations} from './support/reliability/phase2d-certification-fixture.mjs';
import {destroyIsolatedCluster} from './support/reliability/postgres17.mjs';
import {certificationTransportRegistration} from './support/reliability/certification-ingress-js-proof.mjs';
import {provisionAnnualSyntheticAuthority,annualRuntime} from './support/reliability/certification-annual-transition-fixture.mjs';
import {completeCertificationAnnualChronology} from './support/reliability/certification-annual-chronology-proof.mjs';
import {calculateAndPublishCertificationFinalOdds} from './support/reliability/certification-odds-proof.mjs';
import {certificationAnnualObservations} from './support/reliability/certification-annual-observations.mjs';
import {provisionInitialSyntheticHistoryGuide,createCertificationHistoryServiceProof} from './support/reliability/certification-history-service-proof.mjs';
import {proveCertificationReleaseRebind} from './support/reliability/certification-release-proof.mjs';
import {jsonLiteral} from './support/reliability/postgres17.mjs';

const forwardMigrations=[...certificationForwardMigrations,
 'supabase/production_migrations/202609300134_certification_annual_administration_v1.sql',
 'supabase/production_migrations/202609300135_certification_read_contracts_v1.sql',
 'supabase/production_migrations/202609300136_certification_durable_ingress_v1.sql',
 'supabase/production_migrations/202609300137_certification_domain_resource_recovery_v1.sql',
 'supabase/production_migrations/202609300138_certification_annual_transition_v1.sql',
 'supabase/production_migrations/202609300139_certification_future_authoring_v1.sql',
 'supabase/production_migrations/202609300140_certification_future_scoring_v1.sql',
 'supabase/production_migrations/202609300141_certification_future_workers_v1.sql',
 'supabase/production_migrations/202609300142_certification_required_worker_reads_v1.sql',
 'supabase/production_migrations/202609300143_certification_odds_owner_publication_v1.sql',
 'supabase/production_migrations/202609300144_certification_release_rebind_v1.sql',
 'supabase/production_migrations/202609300145_certification_closed_tournament_read_v1.sql',
 'supabase/production_migrations/202609300146_certification_successor_current_reads_v1.sql',
 'supabase/production_migrations/202609300147_certification_closed_history_service_v1.sql',
 'supabase/production_migrations/202609300148_certification_odds_two_part_freshness_v1.sql',
 'supabase/production_migrations/202609300149_certification_odds_snapshot_guard_v1.sql',
 'supabase/production_migrations/202609300150_certification_odds_publication_source_identity_v1.sql',
 'supabase/production_migrations/202609300151_certification_annual_reopen_lineage_v1.sql',
 'supabase/production_migrations/202609300152_certification_closed_release_admission_v1.sql'];
const evidenceFiles=[...forwardMigrations,'test/reliability-phase2dr2-annual-transition.integration.test.mjs',
 'test/support/reliability/phase2d-certification-fixture.mjs','test/support/reliability/certification-annual-transition-fixture.mjs',
 'test/support/reliability/certification-future-authoring-proof.mjs','test/support/reliability/certification-worker-proof.mjs',
 'test/support/reliability/certification-annual-observations.mjs','test/support/reliability/certification-annual-chronology-proof.mjs',
 'test/support/reliability/certification-final-recap-failure-proof.mjs',
 'test/support/reliability/certification-successor-read-proof.mjs',
 'test/support/reliability/certification-history-service-proof.mjs',
 'test/support/reliability/certification-release-proof.mjs',
 'test/support/reliability/certification-odds-proof.mjs',
 'lib/certification-runtime-server.js','lib/certification-read-adapters.js','lib/certification-worker-adapter.js',
 'lib/certification-odds-server.js','lib/score-derived-worker.js','lib/score-derived-delivery.js',
 'lib/intelligence-derived-supabase.js','lib/competition-derived-supabase.js',
 'lib/canonical-director-odds.js','lib/canonical-director-odds-client.js',
 'lib/preview-director-authorization.js','lib/participant-identity-supabase.js',
 'lib/history-2026-service.js','lib/history-2026-supabase.js','lib/history-2026-adapter.js',
 'app/api/director/canonical-odds/route.js'];
const sourceManifest=()=>Object.fromEntries(evidenceFiles.map(file=>[file,createHash('sha256').update(readFileSync(file)).digest('hex')]));
const competitionJobSnapshot=`select coalesce(jsonb_agg(jsonb_build_object('tournament_id',tournament_id,'round_number',round_number,
 'engine_key',engine_key,'status',status,'attempts',attempts,'runtime_generation_id',runtime_generation_id,
 'last_error_code',last_error_code,'delivery_attempts',delivery_attempts,'delivery_dead_letter_at',delivery_dead_letter_at)
 order by tournament_id,round_number,engine_key),'[]')from scoring_authority.competition_recalculation_jobs`;

// Observation only: native future Prediction commit must supply immutable
// structure evidence. Genuine scoring changes live facts, never that authority.
function futureOddsFreshness(fixture,target){
 const t=jsonLiteral(String(target));
 const value=JSON.parse(fixture.q(`select jsonb_build_object('configuration',to_jsonb(c),
  'setupRevision',f.setup_revision,
  'structure',production_control.certification_odds_pairing_structure_fingerprint_v1(c.tournament_id),
  'legacyLivePairing',production_control.annual_odds_pairing_fingerprint_v1(c.tournament_id),
  'liveSource',public.read_leaderboards_core_view(c.tournament_id)#>'{data,source_revision}')
  from scoring_authority.odds_input_configurations c
  join production_control.future_tournament_catalog_v1 f using(tournament_id)
  where c.tournament_id=${t}#>>'{}' and c.is_current`));
 const d=value.configuration.validation_diagnostics;
 assert.equal(d.certificationStructuralContract,'certification-odds-pairing-structure-v1');
 assert.equal(d.certificationStructuralFingerprint,value.structure);
 assert.equal(d.certificationStructuralSetupRevision,value.setupRevision);
 assert.equal(d.annualSetupRevision,value.setupRevision);
 assert.match(value.structure,/^[0-9a-f]{64}$/);
 assert.ok(value.liveSource&&Object.keys(value.liveSource).length>0);
 return value;
}

function proveFutureStructuralDiagnostics(fixture,runtime,target){
 const before=futureOddsFreshness(fixture,target),d=before.configuration.validation_diagnostics;
 const missing={...d};for(const key of ['certificationStructuralContract','certificationStructuralFingerprint',
  'certificationStructuralSetupRevision'])delete missing[key];
 const cases=[['MISSING_EVIDENCE',missing],['WRONG_VERSION',{...d,certificationStructuralContract:'unsupported-v0'}],
  ['WRONG_STRUCTURE',{...d,certificationStructuralFingerprint:'0'.repeat(64)}],
  ['WRONG_SETUP_REVISION',{...d,certificationStructuralSetupRevision:Number(d.certificationStructuralSetupRevision)+1}]];
 const authorization=runtime.authorization();
 const input={...fixture.envelope,authorization,phase:'DIRECTOR',
  operation_id:'ODDS.read_production_odds_calculation_inputs',operation_request_id:randomUUID(),
  expected_context_token:fixture.context('DIRECTOR',{authorization}).context_token,
  payload:{odds_operation:'read_production_odds_calculation_inputs'}};
 assert.equal(fixture.rpc('dispatch_certification_odds_v1',input).ok,true);
 const results=[];
 for(const [name,diagnostics]of cases){
  // Owner-only rollback fault injection, never a repair or historical backfill.
  // An exception aborts this disposable connection's transaction automatically.
  assert.throws(()=>fixture.q(`begin;
   update scoring_authority.odds_input_configurations set validation_diagnostics=${jsonLiteral(diagnostics)}
    where id=(${jsonLiteral(before.configuration.id)}#>>'{}')::uuid;
   set role service_role;select public.dispatch_certification_odds_v1(${jsonLiteral(input)});rollback;`,'service_role'),
   /PRODUCTION_ANNUAL_PREDICTION_SETTINGS_NOT_CURRENT/);
  assert.deepEqual(futureOddsFreshness(fixture,target),before,'Fault state must roll back completely');
  results.push({name,result:'DENIED',persistedChange:false});
 }
 return{proofLayer:'POSTGRESQL_RPC_FAILURE_INJECTION',target,cases:results};
}

function proveFutureStructuralInvalidators(fixture,runtime,target){
 const before=futureOddsFreshness(fixture,target),t=`${jsonLiteral(target)}#>>'{}'`;
 const authorization=runtime.authorization(),input={...fixture.envelope,authorization,phase:'DIRECTOR',
  operation_id:'ODDS.read_production_odds_calculation_inputs',operation_request_id:randomUUID(),
  expected_context_token:fixture.context('DIRECTOR',{authorization}).context_token,
  payload:{odds_operation:'read_production_odds_calculation_inputs'}};
 const firstMatch=`(select match_id from scoring_authority.matches where tournament_id=${t} order by match_id limit 1)`;
 const firstParticipant=`(select p.match_id,p.player_id from scoring_authority.match_participants p
  join scoring_authority.matches m using(match_id) where m.tournament_id=${t} order by p.match_id,p.team_side,p.player_slot limit 1)`;
 const cases=[
  ['SETUP_REVISION',`update production_control.future_tournament_catalog_v1 set setup_revision=setup_revision+1 where tournament_id=${t}`],
  ['PROMOTION_REVISION',`update production_control.future_runtime_promotions_v2 set promotion_revision=promotion_revision+1 where tournament_id=${t}`],
  ['PROMOTION_FINGERPRINT',`update production_control.future_runtime_promotions_v2 set promoted_manifest_fingerprint=repeat('f',64) where tournament_id=${t}`],
  ['SNAPSHOT_HASH',`update scoring_authority.scoring_snapshots set canonical_hash=repeat('f',64) where snapshot_id=(select scoring_snapshot_id from scoring_authority.matches where match_id=${firstMatch})`],
  ['PREPARED_SETUP_REVISION',`update scoring_authority.tournament_setup_match_details_v1 set prepared_setup_revision=prepared_setup_revision+1 where match_id=${firstMatch}`],
  ['PREPARED_CONFIGURATION',`update scoring_authority.tournament_setup_match_details_v1 set prepared_configuration_fingerprint=repeat('f',64) where match_id=${firstMatch}`],
  ['PARTICIPANT_IDENTITY',`update scoring_authority.match_participants p set player_id=(select r.player_id from scoring_authority.tournament_players r
   where r.tournament_id=${t} and not exists(select 1 from scoring_authority.match_participants e where e.match_id=p.match_id and e.player_id=r.player_id)
   order by r.player_id limit 1) where(p.match_id,p.player_id)=${firstParticipant}`],
  ['ROSTER_TEAM',`update scoring_authority.tournament_players p set team_id=(select team_id from scoring_authority.teams x
   where x.tournament_id=p.tournament_id and x.team_id<>p.team_id order by x.team_id limit 1)
   where p.tournament_id=${t} and p.player_id=(select player_id from scoring_authority.match_participants where match_id=${firstMatch} order by player_id limit 1)`],
  ['PARTICIPANT_SIDE',`update scoring_authority.match_participants p set team_side=3-team_side where(p.match_id,p.player_id)=${firstParticipant}`],
  ['PARTICIPANT_SLOT',`update scoring_authority.match_participants p set player_slot=2 where(p.match_id,p.player_id)=
   (select p.match_id,p.player_id from scoring_authority.match_participants p join scoring_authority.matches m using(match_id)
    where m.tournament_id=${t} and m.format='SI' order by p.match_id,p.team_side limit 1)`],
  ['HANDICAP_REVISION',`update scoring_authority.match_participants p set handicap_revision_id=null where(p.match_id,p.player_id)=${firstParticipant}`]
 ];
 const results=[];
 for(const[name,mutation]of cases){
  // Disposable owner fault injection, with every installed trigger/constraint
  // active. Never persistence, supported authoring, or a settings refresh.
  const observation=JSON.parse(fixture.q(`begin;create temporary table structural_observation(value jsonb);
   do $fault$ declare code text;message text;changed integer;fingerprint text;response jsonb;begin
    begin ${mutation};get diagnostics changed=row_count;
     if changed<>1 then raise exception 'STRUCTURAL_FAULT_TARGET_COUNT:%',changed;end if;
    exception when others then get stacked diagnostics code=returned_sqlstate,message=message_text;
     insert into structural_observation values(jsonb_build_object('stage','MUTATION_DENIED','sqlstate',code,'message',message));return;end;
    fingerprint:=production_control.certification_odds_pairing_structure_fingerprint_v1(${t});
    if fingerprint=${jsonLiteral(before.structure)}#>>'{}' then raise exception 'STRUCTURAL_FAULT_DID_NOT_CHANGE_MANIFEST';end if;
    begin response:=public.dispatch_certification_odds_v1(${jsonLiteral(input)});
     insert into structural_observation values(jsonb_build_object('stage','READ_ADMITTED','response',response));
    exception when others then get stacked diagnostics code=returned_sqlstate,message=message_text;
     insert into structural_observation values(jsonb_build_object('stage','READ_DENIED','sqlstate',code,'message',message,
      'fingerprintChanged',true));end;
   end;$fault$;select value from structural_observation;rollback;`,'service_role'));
  if(observation.stage==='MUTATION_DENIED'){
   assert.ok(['23503','23505','23514','42501','55000'].includes(observation.sqlstate),JSON.stringify(observation));
   observation.coverage='INSTALLED_CONSTRAINT_OR_GUARD_DENIAL; FINGERPRINT_READ_NOT_REACHED';
  }else{
   assert.equal(observation.stage,'READ_DENIED',name);
   assert.ok(['55000','40001'].includes(observation.sqlstate),JSON.stringify(observation));
   assert.match(observation.message,/PRODUCTION_ANNUAL_PREDICTION_SETTINGS_NOT_CURRENT|CERTIFICATION_CONTEXT_STALE/);
   assert.equal(observation.fingerprintChanged,true);
   observation.coverage='STRUCTURAL_SOURCE_CHANGE_REJECTED_BY_CANONICAL_READ';
  }
  assert.deepEqual(futureOddsFreshness(fixture,target),before,'All structural fault state must roll back');
  results.push({name,...observation,persistedChange:false});
 }
 return{proofLayer:'POSTGRESQL_RPC_ROLLBACK_FAULT_INJECTION',target,triggersDisabled:false,cases:results};
}

test('Certification annual transition uses real canonical preparation, ingress and closure',async t=>{
 const startedAt=new Date().toISOString(),startSource=sourceManifest();
 const terminalClosed=process.env.BAGGER_R2_ANNUAL_TERMINAL_CLOSED==='1';
 let fixture,runtime,historyProof;const evidence={environment:'OWNED_LOCAL_POSTGRESQL17',googleCalls:0,hostedAccess:false,
  scoresSeeded:0,finalsSeeded:0,certificatesSeeded:0,readinessSeeded:0,completedGates:[],
  proofMode:terminalClosed?'SEPARATE_TERMINAL_CLOSED_RELEASE':'TWO_ACTUAL_ANNUAL_TRANSITIONS'};
 const check=async(name,body)=>{let failure;await t.test(name,async()=>{try{await body();evidence.completedGates.push(name);}catch(error){failure=error;throw error;}});if(failure)throw failure;};
 try{
  fixture=await createCertificationFixture({forwardMigrations,registrationFactory:certificationTransportRegistration});
  runtime=annualRuntime(fixture);
  evidence.initialAuthority=provisionAnnualSyntheticAuthority(fixture);
  evidence.initialGuideInput=provisionInitialSyntheticHistoryGuide(fixture);
  historyProof=await createCertificationHistoryServiceProof(fixture);
  await check('synthetic initial identities preserve existing verified contact and owner authority predicates',()=>{
   assert.equal(evidence.initialAuthority.players,24);assert.equal(evidence.initialAuthority.emailsSent,0);
   assert.equal(fixture.q("select count(*)from participant_identity.participant_identity_contacts where tournament_id='2026'and identity_active"),'24');
   assert.equal(fixture.q('select count(*)from production_control.resource_scope'),'0');
   assert.equal(fixture.q('select count(*)from production_control.cutover_activation_state'),'0');
   assert.equal(fixture.q('select count(*)from scoring_authority.hole_scores'),'0');
   assert.equal(fixture.q(`select count(*)from scoring_authority.game_center_presentations p
    join scoring_authority.tournament_setup_match_details_v1 d using(match_id)
    where p.tournament_id='2026'and p.display_match_number=d.match_number::text`),'24',
    'Initial synthetic display identity must match the existing canonical per-round match number');
   assert.equal(fixture.q('select count(*)from production_control.scoring_admission_closures'),'0');
   assert.equal(runtime.current().tournament_id,'2026');
  });
  await check('published-only current Odds read is empty without publication and rejects foreign target or private core access',()=>{
   const read=payload=>fixture.rpc('read_certification_projection_v1',{...fixture.envelope,phase:'READS',operation:'READS.CURRENT_VIEW',payload});
   const result=read({surface:'PUBLISHED_ODDS',target_tournament_id:'2026'});
   assert.equal(result.ok,true);assert.equal(result.data.publication.state,'UNPUBLISHED');
   assert.deepEqual(result.data.snapshots,[]);assert.equal(result.data.publication.google_publication_fallback,false);
   assert.equal(result.authoritative,true);assert.equal(result.fallback_used,false);
   assert.throws(()=>read({surface:'PUBLISHED_ODDS',target_tournament_id:'2097'}),/CONTEXT_DENIED|TARGET_DENIED/);
   assert.throws(()=>fixture.rpc('read_certification_projection_v1',{...fixture.envelope,phase:'READS',operation:'READS.CURRENT_VIEW',
    expected_context_token:'0'.repeat(64),payload:{surface:'PUBLISHED_ODDS',target_tournament_id:'2026'}}),/CONTEXT_STALE/);
   assert.throws(()=>fixture.rpc('read_certification_projection_v1',{...fixture.envelope,phase:'READS',operation:'READS.CURRENT_VIEW',
    resource:{...fixture.envelope.resource,resource_id:'BAGGER_INV_PRODUCTION'},payload:{surface:'PUBLISHED_ODDS',target_tournament_id:'2026'}}),/RESOURCE|BINDING/);
   const production=JSON.parse(fixture.q(`set role service_role;select public.read_published_odds_view('2026','urn:bagger:synthetic:${fixture.resource.installation_id}')`,'service_role'));
   assert.equal(production.ok,false);assert.equal(production.code,'PRODUCTION_ODDS_EXACT_RESOURCE_REQUIRED');
   assert.equal(fixture.q(`select count(*)from pg_proc p where p.pronamespace='production_control'::regnamespace
    and p.proname in('assert_certification_current_projection_v1','canonical_published_odds_projection_v2',
     'certification_published_odds_read_v1','certification_worker_current_projection_v1')
    and(has_function_privilege('anon',p.oid,'EXECUTE')or has_function_privilege('authenticated',p.oid,'EXECUTE')
     or has_function_privilege('service_role',p.oid,'EXECUTE'))`),'0');
  });
  await check('closed History read fails closed without completed same-resource annual lineage and private cores stay private',()=>{
   const read=payload=>fixture.rpc('read_certification_projection_v1',{
    ...fixture.envelope,phase:'READS',operation:'READS.CLOSED_TOURNAMENT',payload});
   assert.throws(()=>read({target_tournament_id:'2026'}),/HISTORY_TARGET_DENIED/);
   assert.throws(()=>read({target_tournament_id:'2097'}),/HISTORY_CLOSED_AUTHORITY_REQUIRED/);
   assert.throws(()=>read({target_tournament_id:'2097',resource_id:'BAGGER_INV_PRODUCTION'}),/HISTORY_TARGET_DENIED/);
   assert.throws(()=>fixture.rpc('read_certification_projection_v1',{
    ...fixture.envelope,phase:'READS',operation:'READS.CLOSED_TOURNAMENT',expected_context_token:'0'.repeat(64),
    payload:{target_tournament_id:'2097'}}),/CONTEXT_STALE/);
   for(const role of ['anon','authenticated'])assert.throws(()=>fixture.rpc('read_certification_projection_v1',{
    ...fixture.envelope,phase:'READS',operation:'READS.CLOSED_TOURNAMENT',payload:{target_tournament_id:'2097'}},role),
    /permission denied/);
   assert.equal(fixture.q(`select count(*)from pg_proc p where p.pronamespace='production_control'::regnamespace
    and p.proname in('canonical_finalized_tournament_projection_v1','certification_closed_tournament_read_v1')
    and(has_function_privilege('anon',p.oid,'EXECUTE')or has_function_privilege('authenticated',p.oid,'EXECUTE')
     or has_function_privilege('service_role',p.oid,'EXECUTE'))`),'0');
  });
  // Fail the parent at the first incomplete prerequisite. Continuing later
  // annual actions would create misleading secondary errors or false coverage.
  await check('actual initial OPEN release rebind preserves canonical authority',async()=>{
   evidence.initialRelease=await proveCertificationReleaseRebind(fixture,{label:'INITIAL_OPEN',expectedGenerationState:'OPEN'});
  });
  evidence.futurePreparation=await runtime.prepareFuture('2097');
  evidence.futureOddsAtNativeCommit=futureOddsFreshness(fixture,'2097');
  evidence.preActivationWorkerBindings=certificationAnnualObservations(fixture,'2097').workerBindings();
  assert.equal(evidence.preActivationWorkerBindings.expectedRuntimeGeneration,null);
  for(const value of Object.values(evidence.preActivationWorkerBindings.families))assert.equal(value.rows,value.unbound);
  await check('future CREATE, roster, courses, promotion, handicap, pairings, contexts and content use supported operations',()=>{
   assert.equal(fixture.q("select count(*)from scoring_authority.matches where tournament_id='2097'"),'24');
   assert.equal(fixture.q("select count(*)from production_control.future_runtime_match_bindings_v2 where tournament_id='2097'and runtime_state='PREPARED'"),'24');
   assert.equal(fixture.q("select count(*)from scoring_authority.hole_scores h join scoring_authority.matches m using(match_id)where m.tournament_id='2097'"),'0');
   assert.equal(fixture.q("select count(*)from production_control.future_match_google_compatibility_jobs_v1"),'0');
   assert.equal(runtime.current().tournament_id,'2026');
  });
  evidence.predecessorSequence=await runtime.scoreTournament('2026',value=>{
   if(value.holes%108===0)t.diagnostic(JSON.stringify({canonicalSequence:value}));
  });
  await check('predecessor has 432 canonical holes and 24 actual Finals plus explicit rejected and unresolved ingress histories',()=>{
   assert.deepEqual(evidence.predecessorSequence,{rounds:{1:108,2:108,3:216},holes:432,finals:24});
   assert.equal(fixture.q("select count(*)from scoring_authority.matches where tournament_id='2026'and status='FINAL'and scorecard_complete"),'24');
   assert.equal(fixture.q("select count(*)from production_control.certification_ingress_leases_v1 where state='UNKNOWN'"),'1');
   assert.equal(fixture.q("select count(*)from production_control.certification_ingress_leases_v1 where state='NOT_COMMITTED'"),'1');
   assert.equal(fixture.q("select count(*)from production_control.certification_ingress_leases_v1 where state='ADMITTED'"),'0');
  });
  const beforeAnnualHistory=await historyProof.capture();
  evidence.shippingHistoryBefore={operations:beforeAnnualHistory.operations,actualShippingService:true};
  evidence.firstChronology={};
  await check('real calculation, explicit publication, FinalRecap, UNKNOWN resolution and first annual transition',async()=>{
   await completeCertificationAnnualChronology({fixture,runtime,successor:'2097',
    calculateAndPublish:calculateAndPublishCertificationFinalOdds,proveRelease:proveCertificationReleaseRebind,
    evidence:evidence.firstChronology,exerciseAbort:true,terminalClosed});
   if(terminalClosed){assert.equal(evidence.firstChronology.terminalClosed,true);return;}
   assert.equal(runtime.current().tournament_id,'2097');
   assert.equal(fixture.q('select count(*)from production_control.resource_scope'),'0');
   assert.equal(fixture.q('select count(*)from production_control.cutover_activation_state'),'0');
  });
  if(terminalClosed){
   evidence.annualTransition='TERMINAL_CLOSED_RELEASE_COMMITTED_NO_ACTIVATION_CLAIM';
   return;
  }
  await check('actual shipping History and Team History preserve predecessor DTOs without fallback after activation',async()=>{
   evidence.shippingHistoryAfterFirst=await historyProof.verifyAfter(beforeAnnualHistory);
  });
  await check('successor read rejects absent or mismatched structural evidence without backfill',()=>{
   evidence.futureStructuralDenials=proveFutureStructuralDiagnostics(fixture,runtime,'2097');
   evidence.futureStructuralInvalidators=proveFutureStructuralInvalidators(fixture,runtime,'2097');
  });
  evidence.laterFuturePreparation=await runtime.prepareFuture('2098');
  evidence.laterFutureOddsInitial=futureOddsFreshness(fixture,'2098');
  evidence.futureOddsBeforeScoring=futureOddsFreshness(fixture,'2097');
  assert.deepEqual(evidence.futureOddsBeforeScoring.configuration,evidence.futureOddsAtNativeCommit.configuration);
  assert.equal(evidence.futureOddsBeforeScoring.structure,evidence.futureOddsAtNativeCommit.structure);
  evidence.successorSequence=await runtime.scoreTournament('2097',value=>{
   if(value.holes%108===0)t.diagnostic(JSON.stringify({canonicalSequence:value}));
  });
  await check('future Prediction structure remains immutable while actual scoring advances live authority',()=>{
   evidence.futureOddsAfterScoring=futureOddsFreshness(fixture,'2097');
   assert.deepEqual(evidence.futureOddsAfterScoring.configuration,evidence.futureOddsBeforeScoring.configuration);
   assert.equal(evidence.futureOddsAfterScoring.structure,evidence.futureOddsBeforeScoring.structure);
   assert.notEqual(evidence.futureOddsAfterScoring.legacyLivePairing,evidence.futureOddsBeforeScoring.legacyLivePairing);
   assert.notDeepEqual(evidence.futureOddsAfterScoring.liveSource,evidence.futureOddsBeforeScoring.liveSource);
  });
  evidence.laterChronology={};
  await check('later Certification year repeats genuine Odds and annual lineage with concurrent activation recovery',async()=>{
   await completeCertificationAnnualChronology({fixture,runtime,successor:'2098',
    calculateAndPublish:calculateAndPublishCertificationFinalOdds,proveRelease:proveCertificationReleaseRebind,evidence:evidence.laterChronology,
    exerciseAbort:true,concurrentActivation:true});
   assert.equal(runtime.current().tournament_id,'2098');
   assert.equal(fixture.q("select count(*)from production_control.certification_ingress_leases_v1 where state in('UNKNOWN','ADMITTED')"),'0');
   assert.equal(fixture.q("select count(*)from production_control.scoring_admission_closures where resource_class='CERTIFICATION'and status='CLOSED'"),'2');
   assert.equal(fixture.q('select count(*)from scoring_authority.google_outbox_events'),'0');
   assert.equal(fixture.q('select count(*)from scoring_authority.odds_google_mirror_jobs'),'0');
  });
  await check('shipping closed 2026 History remains available after a second genuine annual transition',async()=>{
   evidence.shippingHistoryAfterLater=await historyProof.verifyAfter(beforeAnnualHistory);
  });
  evidence.annualTransition='FIRST_AND_LATER_TRANSITIONS_EXECUTED';
  evidence.scoreTimings=runtime.timings.filter(x=>x.operation==='SCORING.SUBMIT_HOLE');
 }catch(error){
  evidence.firstFailure={name:error.name,code:error.code||null,message:error.message};
  if(error.certificationOddsEvidence)evidence.failedOdds=error.certificationOddsEvidence;
  // Preserve bounded, non-sensitive synthetic state before destroying the owned
  // database. These are observations, never fixture repairs or readiness input.
  if(fixture){
   evidence.failureSnapshot={};
   const snapshots={
    competitionJobs:competitionJobSnapshot,
    derivedIntents:`select coalesce(jsonb_agg(v order by tournament_id,family,status),'[]')from(
     select tournament_id,family,status,count(*)as count from scoring_authority.score_derived_intents_v1
     group by tournament_id,family,status)v`,
    ingress:`select coalesce(jsonb_agg(v order by tournament_id,state),'[]')from(
     select tournament_id,state,count(*)as count from production_control.certification_ingress_leases_v1 group by tournament_id,state)v`,
    generations:`select coalesce(jsonb_agg(jsonb_build_object('generation_id',generation_id,'tournament_id',tournament_id,
     'state',state,'revision',revision)order by tournament_id,generation_id),'[]')from production_control.certification_ingress_generations_v1`,
    pointer:`select to_jsonb(v)from production_control.current_tournament_pointer_v1 v`
   };
   for(const [key,query]of Object.entries(snapshots)){
    try{evidence.failureSnapshot[key]=JSON.parse(fixture.q(query));}
    catch(snapshotError){evidence.failureSnapshot[key]={captureError:snapshotError.message};}
   }
  }
  throw error;
 }finally{
  evidence.startedAt=startedAt;evidence.finishedAt=new Date().toISOString();
  evidence.startSource=startSource;evidence.endSource=sourceManifest();
  evidence.sourceStable=JSON.stringify(evidence.startSource)===JSON.stringify(evidence.endSource);
  evidence.timings=runtime?.timings||[];evidence.completedOperations=runtime?.receipts.length||0;
  evidence.ingressScenarios=runtime?.ingressScenarios||{};
  const directory='docs/reliability/phase2d-resource-model/implementation-evidence';mkdirSync(directory,{recursive:true});
  const path=directory+'/annual-transition-'+startedAt.replaceAll(/[:.]/g,'-')+'.json';
  writeFileSync(path,JSON.stringify(evidence,null,2)+'\n');
  t.diagnostic(JSON.stringify({evidence:path,sourceStable:evidence.sourceStable,completedOperations:evidence.completedOperations,
   predecessorSequence:evidence.predecessorSequence,annualTransition:evidence.annualTransition||'NOT_COMPLETED',firstFailure:evidence.firstFailure}));
  try{if(historyProof)await historyProof.destroy();}
  finally{if(fixture)await destroyIsolatedCluster(fixture.cluster);}
 }
});
