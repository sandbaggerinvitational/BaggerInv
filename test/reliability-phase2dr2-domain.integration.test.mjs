// Actual local canonical setup/control/score cores; no admission substitutions.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createCertificationFixture,certificationForwardMigrations} from './support/reliability/phase2d-certification-fixture.mjs';
import {destroyIsolatedCluster,jsonLiteral} from './support/reliability/postgres17.mjs';
import {buildTournamentSetupMutation} from '../lib/production-tournament-setup-contract.js';
import {syntheticActor} from './support/reliability/synthetic-tournament.mjs';
import {certificationTransportRegistration} from './support/reliability/certification-ingress-js-proof.mjs';
import {prepareDomainRecoveryTransportProof,runDomainRecoveryTransportProof} from './support/reliability/certification-recovery-js-proof.mjs';

const forwardMigrations=[...certificationForwardMigrations,
 'supabase/production_migrations/202609300134_certification_annual_administration_v1.sql',
 'supabase/production_migrations/202609300135_certification_read_contracts_v1.sql',
 'supabase/production_migrations/202609300136_certification_durable_ingress_v1.sql',
 'supabase/production_migrations/202609300137_certification_domain_resource_recovery_v1.sql'];

test('Certification canonical domain corrections preserve truthful resource, receipts and recovery',async t=>{
 const f=await createCertificationFixture({forwardMigrations,registrationFactory:certificationTransportRegistration});
 const {q,rpc,read,command,model,context,envelope}=f;
 const admitted=[];
 const execute=input=>{
  const lease=rpc('admit_certification_operation_v1',input);admitted.push({input,lease});
  return rpc('execute_certification_operation_v1',{...input,ingress:{lease_id:lease.lease_id,admission_generation_id:lease.admission_generation_id}});
 };
 const setup=(action,values={})=>{
  const id=randomUUID(),payload=buildTournamentSetupMutation(action,{expectedRevision:model().revision,operationRequestId:id,...values});
  delete payload.operation_request_id;
  return execute(command(action==='replace-round-pairings'?'DIRECTOR.MUTATE_PAIRINGS':'DIRECTOR.MUTATE_SETUP',{...payload,action},{operation_request_id:id}));
 };
 const matchId='2026-R1-6';
 const match=()=>JSON.parse(q(`select to_jsonb(m)from scoring_authority.matches m where match_id='${matchId}'`));
 const control=action=>{const m=match();return execute(command('DIRECTOR.MATCH_CONTROL',{
  action,match_id:matchId,expected_match_revision:m.match_revision,expected_permission_revision:m.permission_revision}));};
 const actor=()=>({tournament_id:'2026',role:'PLAYER',auth_user_id:syntheticActor.authUserId,player_id:syntheticActor.playerId,
  match_id:matchId,permission_revision:match().permission_revision});
 const director=()=>({...envelope.authorization,match_id:matchId,permission_revision:match().permission_revision});
 const score=(hole,key='r2:hole.'+hole)=>execute(command('SCORING.SUBMIT_HOLE',{
  match_id:matchId,mutation_key:key,hole_number:hole,expected_match_revision:match().match_revision,
  expected_hole_revision:0,team_1_gross_scores:[4,4],team_2_gross_scores:[5,5]},
  {authorization:actor(),operation_request_id:key}));
 const scoreStatus=(key,authorization=actor())=>rpc('read_certification_operation_v1',{
  ...envelope,phase:'READS',operation_id:'SCORING.READ_MUTATION_STATUS',operation_request_id:key,authorization,
  payload:{match_id:matchId,mutation_key:key}});
 let first,finalizeRequest,reopenRequest,prepared;
 try{
  await t.test('shipping Director adapter commits canonical setup with exact registered transport',async()=>{
   prepared=await prepareDomainRecoveryTransportProof({fixture:f});
  });
  await t.test('Prepare reaches current Certification pointer with complete context and immutable handicap',()=>{
   const before=model();const result=setup('prepare-scoring-context',{matchId});
   assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.snapshotPrepared,true);
   const after=model(),prepared=after.matches.find(m=>m.matchId===matchId);
   assert.equal(prepared.snapshot.handicapRevisionId,before.approvedHandicapRevisionId);
   assert.equal(q('select count(*)from production_control.resource_scope'),'0');
   assert.equal(q('select count(*)from production_control.cutover_activation_state'),'0');
  });
  await t.test('canonical lifecycle still separates Mark Live from scoring access and binds real control receipts',()=>{
   assert.equal(control('mark-live').ok,true);
   assert.equal(q(`select count(*)from scoring_authority.scoring_permissions where match_id='${matchId}'and can_score`),'0');
   assert.equal(control('access-activate').ok,true);
   assert.equal(q(`select count(*)from scoring_authority.scoring_permissions where match_id='${matchId}'and can_score`),'4');
   assert.equal(q(`select count(*)from scoring_authority.score_mutations where match_id='${matchId}'and mutation_type in('MARK_LIVE','ACCESS_ACTIVATE')`),'2');
  });
  await t.test('first and subsequent canonical scores commit with real executable ingress and atomic receipt/audit',()=>{
   first=score(1);assert.equal(first.ok,true,JSON.stringify(first));assert.equal(first.code,'ACCEPTED');
   assert.equal(score(2).ok,true);
   assert.equal(q(`select count(*)from scoring_authority.hole_scores where match_id='${matchId}'`),'2');
   assert.equal(q(`select count(*)from scoring_authority.score_mutations where match_id='${matchId}'and mutation_type='HOLE_SCORE'`),'2');
   assert.equal(scoreStatus('r2:hole.1').status,'COMMITTED');
   assert.equal(q("select count(*)from production_control.operation_audit_events where event_type='FIRST_SUPABASE_CANONICAL_WRITE_OBSERVED'"),'0');
   assert.equal(q('select count(*)from production_control.certification_ingress_execution_v1'),'0');
  });
  await t.test('direct receipt insertion cannot borrow a context without entry-transaction lease',()=>{
   const input={...envelope,phase:'DIRECTOR'};
   assert.throws(()=>q(`begin;set local request.jwt.claim.role='service_role';select production_control.push_certification_context_v1(${jsonLiteral(input)},'DIRECTOR',false);
    insert into scoring_authority.score_mutations(match_id,mutation_key,mutation_type,payload_hash,previous_match_revision,next_match_revision,result,actor_id)
    values('${matchId}','r2:forged','HOLE_SCORE',repeat('0',64),1,2,'{"ok":true,"match_id":"${matchId}"}','${syntheticActor.playerId}');commit`),/INGRESS_EXECUTION_REQUIRED/);
   assert.equal(q("select count(*)from scoring_authority.score_mutations where mutation_key='r2:forged'"),'0');
  });
  await t.test('score recovery survives permission revocation and masks other actor existence',()=>{
   const original=actor();assert.equal(control('access-revoke').ok,true);
   assert.equal(scoreStatus('r2:hole.1',original).status,'COMMITTED');
   assert.equal(scoreStatus('r2:hole.1',director()).status,'UNKNOWN');
   assert.equal(scoreStatus('r2:absent',director()).status,'UNKNOWN');
   assert.equal(control('access-activate').ok,true);
  });
  await t.test('eighteen canonical holes finalize; Reopen preserves text mutation identity',()=>{
   for(let hole=3;hole<=18;hole++)assert.equal(score(hole).ok,true,'hole '+hole);
   const finalKey='r2:director.finalize';
   finalizeRequest=command('SCORING.FINALIZE_MATCH',{match_id:matchId,mutation_key:finalKey,expected_match_revision:match().match_revision},
    {authorization:director(),operation_request_id:finalKey});
   assert.equal(execute(finalizeRequest).ok,true);assert.equal(match().status,'FINAL');
   const reopenKey='r2:director.reopen';
   reopenRequest=command('SCORING.REOPEN_MATCH',{match_id:matchId,mutation_key:reopenKey,expected_match_revision:match().match_revision},
    {authorization:director(),operation_request_id:reopenKey});
   assert.equal(execute(reopenRequest).ok,true);assert.equal(match().status,'LIVE');
   assert.equal(q(`select mutation_key from scoring_authority.score_mutations where match_id='${matchId}'and mutation_type='REOPEN'`),reopenKey);
  });
  await t.test('after admission closes all three receipt read cases remain origin-bound and read-only',()=>{
   const generation=JSON.parse(q("select to_jsonb(g)from production_control.certification_ingress_generations_v1 g where state='OPEN'"));
   const closed=JSON.parse(q(`select production_control.close_certification_ingress_generation_v1('${f.resource.resource_id}','${generation.generation_id}',${generation.revision})`));
   assert.equal(closed.state,'CLOSED');assert.equal(closed.drained,true);
   q(`select production_control.set_certification_admission_v1(${jsonLiteral({resource_id:f.resource.resource_id,
    expected_admission_revision:context('READS').admission_revision,enabled:false,reason:'Synthetic recovery after admission closure'})})`);
   assert.equal(scoreStatus('r2:hole.1').status,'COMMITTED');
   for(const [action,input]of[['finalize',finalizeRequest],['reopen',reopenRequest]]){
    const result=rpc('read_certification_operation_v1',{...input,phase:'DIRECTOR',operation_id:'SCORING.READ_DIRECTOR_OPERATION_STATUS',
     payload:{match_id:matchId,mutation_key:input.operation_request_id,action}});
    assert.equal(result.committed,true);assert.equal(result.receipt.ok,true);
   }
   assert.equal(q('select count(*)from production_control.canonical_operation_context_v1'),'0');
   assert.equal(q('select count(*)from production_control.certification_ingress_execution_v1'),'0');
  });
  await runDomainRecoveryTransportProof({t,fixture:f,prepared,
   scoreRequest:admitted.find(value=>value.input.operation_id==='SCORING.SUBMIT_HOLE')?.input,
   finalizeRequest,reopenRequest});
  await t.test('private helpers and Production wrappers remain unavailable to uncertified authority',()=>{
   for(const role of ['anon','authenticated','service_role']){
    assert.throws(()=>q(`set role ${role};select production_control.current_canonical_resource_context_v1()`),/permission denied/);
    assert.throws(()=>q(`set role ${role};select production_control.read_certification_score_recovery_v1('{}')`),/permission denied/);
   }
   for(const role of ['anon','authenticated'])assert.throws(()=>rpc('read_certification_director_recovery_material_v1',{},role),/permission denied/);
   assert.throws(()=>rpc('submit_production_hole_score',{match_id:matchId}),/assert_production_scoring_runtime/);
   assert.equal(q('select count(*)from scoring_authority.google_outbox_events'),'0');
  });
  t.diagnostic(JSON.stringify({environment:'OWNED_LOCAL_POSTGRESQL17',forwardMigrations,holes:Number(q("select count(*)from scoring_authority.hole_scores")),
   finalizedReceipts:Number(q("select count(*)from scoring_authority.score_mutations where mutation_type='FINALIZE'")),
   reopenedReceipts:Number(q("select count(*)from scoring_authority.score_mutations where mutation_type='REOPEN'")),
   googleCalls:0,googleJobs:0,hostedAccess:false,productionAccess:false,fullTournament:'NOT_RUN_HERE'}));
 }finally{await destroyIsolatedCluster(f.cluster);}
});
