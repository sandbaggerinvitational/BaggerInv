// Owner-only local release control; no hosted deployment or direct admission-row edits.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {createCertificationFixture} from './support/reliability/phase2d-certification-fixture.mjs';
import {certificationProvisionalProfile} from './support/reliability/certification-provisional-profile.mjs';
import {destroyIsolatedCluster,jsonLiteral,openSqlSession} from './support/reliability/postgres17.mjs';
import {certificationTransportRegistration} from './support/reliability/certification-ingress-js-proof.mjs';
import {certificationDirectorStack} from './support/reliability/certification-director-proof.mjs';
import {buildTournamentSetupMutation} from '../lib/production-tournament-setup-contract.js';
import {syntheticActor} from './support/reliability/synthetic-tournament.mjs';
import {provisionAnnualSyntheticAuthority} from './support/reliability/certification-annual-transition-fixture.mjs';
import {adoptCertificationReleaseReceipt,certificationReleaseInput} from './support/reliability/certification-release-proof.mjs';
import {proveCertificationReleaseOddsDrain,proveCertificationOddsAfterRelease} from './support/reliability/certification-release-odds-proof.mjs';
import {drainCertificationAutomaticWorkers} from './support/reliability/certification-worker-proof.mjs';

const forwardMigrations=certificationProvisionalProfile;
const sourceFiles=[...forwardMigrations,'test/reliability-phase2dr2-release.integration.test.mjs',
 'test/support/reliability/certification-release-proof.mjs','test/support/reliability/certification-release-odds-proof.mjs',
 'test/support/reliability/certification-annual-transition-fixture.mjs','test/support/reliability/certification-odds-proof.mjs',
 'test/support/reliability/certification-provisional-profile.mjs','test/support/reliability/phase2d-certification-fixture.mjs',
 'test/support/reliability/certification-worker-proof.mjs','lib/score-derived-delivery.js','lib/score-derived-worker.js',
 'lib/certification-odds-server.js','lib/certification-runtime-server.js','lib/canonical-director-odds.js',
 'lib/canonical-director-odds-client.js','lib/championship-odds-supabase.js'];
const treeFiles=directory=>readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()
 ?treeFiles(directory+'/'+entry.name):/\.(?:js|mjs|cjs)$/.test(entry.name)?[directory+'/'+entry.name]:[]);
const manifest=()=>Object.fromEntries([...new Set([...sourceFiles,...treeFiles('lib'),...treeFiles('test/support/reliability'),
 'app/api/director/canonical-odds/route.js','tools/reliability/phase2dr2-proof-isolation.cjs'])].sort()
 .map(file=>[file,createHash('sha256').update(readFileSync(file)).digest('hex')]));

test('Certification release rebind preserves durable operations and private owner authority',async t=>{
 const hashes=manifest(),evidence={environment:'OWNED_LOCAL_POSTGRESQL17',cases:[],googleCalls:0,hostedAccess:false,productionAccess:false};
 let f;
 const run=async(id,body)=>{let failure;await t.test(id,async()=>{try{const details=await body();evidence.cases.push({id,result:'PASS',details});}
  catch(error){failure=error;evidence.cases.push({id,result:'FAIL',error:error.message,code:error.code||null,
   releaseOddsEvidence:error.releaseOddsEvidence||null});throw error;}});if(failure)throw failure;};
 try{
  f=await createCertificationFixture({forwardMigrations,registrationFactory:certificationTransportRegistration});
  provisionAnnualSyntheticAuthority(f);
  const {q,rpc,owner,command,context}=f,oldDeployment=structuredClone(f.deployment),oldEnvelope=structuredClone(f.envelope);
  const execute=input=>{const lease=rpc('admit_certification_operation_v1',input);
   return rpc('execute_certification_operation_v1',{...input,ingress:{lease_id:lease.lease_id,admission_generation_id:lease.admission_generation_id}});};
  const setup=(action,values={})=>{const id=randomUUID(),payload=buildTournamentSetupMutation(action,{expectedRevision:f.model().revision,operationRequestId:id,...values});
   delete payload.operation_request_id;return command('DIRECTOR.MUTATE_SETUP',{...payload,action},{operation_request_id:id});};
  const team=f.model().teams[0],teamValues={teamId:team.teamId,captainPlayerId:'P01'};
  const committedSetup=setup('update-team',{...teamValues,teamName:'Release proof team'});
  const initialSetup=execute(committedSetup);assert.equal(initialSetup.ok,true,JSON.stringify(initialSetup));
  const matchId='2026-R1-6',match=()=>JSON.parse(q(`select to_jsonb(m)from scoring_authority.matches m where match_id='${matchId}'`));
  const control=action=>execute(command('DIRECTOR.MATCH_CONTROL',{action,match_id:matchId,expected_match_revision:match().match_revision,expected_permission_revision:match().permission_revision}));
  execute(setup('prepare-scoring-context',{matchId}));control('mark-live');control('access-activate');
  const actor={tournament_id:'2026',role:'PLAYER',auth_user_id:syntheticActor.authUserId,player_id:syntheticActor.playerId,match_id:matchId,permission_revision:match().permission_revision};
  const score=command('SCORING.SUBMIT_HOLE',{match_id:matchId,mutation_key:'r2:release.score',hole_number:1,expected_match_revision:match().match_revision,expected_hole_revision:0,team_1_gross_scores:[4,4],team_2_gross_scores:[5,5]},
   {authorization:actor,operation_request_id:'r2:release.score'});
  assert.equal(execute(score).ok,true);
  const oddsProof=await proveCertificationReleaseOddsDrain(f,{run,advanceCanonicalSource:()=>execute(command('SCORING.SUBMIT_HOLE',{
   match_id:matchId,mutation_key:'r2:release.source-advance',hole_number:2,expected_match_revision:match().match_revision,
   expected_hole_revision:0,team_1_gross_scores:[4,4],team_2_gross_scores:[5,5]},
   {authorization:{...actor,permission_revision:match().permission_revision},operation_request_id:'r2:release.source-advance'}))});
  const unresolved=setup('update-team',{...teamValues,teamName:'Must never execute under stale admission'}),unresolvedLease=rpc('admit_certification_operation_v1',unresolved);
  rpc('mark_certification_ingress_unknown_v1',unresolved);
  const g=JSON.parse(q("select to_jsonb(g)from production_control.certification_ingress_generations_v1 g where state='OPEN'"));
  const pointer=JSON.parse(q('select to_jsonb(p)from production_control.current_tournament_pointer_v1 p'));
  const preserved=()=>q(`select jsonb_build_object('resource',(select to_jsonb(r)from production_control.canonical_resource_v1 r),
   'pointer',(select to_jsonb(p)from production_control.current_tournament_pointer_v1 p),
   'generations',(select jsonb_agg(to_jsonb(g)order by generation_id)from production_control.certification_ingress_generations_v1 g),
   'scores',(select jsonb_agg(to_jsonb(s)order by match_id,mutation_key)from scoring_authority.score_mutations s),
   'intents',(select jsonb_agg(to_jsonb(i)order by intent_id)from scoring_authority.score_derived_intents_v1 i),
   'oddsJobs',(select jsonb_agg(to_jsonb(j)order by job_id)from scoring_authority.odds_calculation_jobs j),
   'oddsSnapshots',(select jsonb_agg(to_jsonb(o)order by id)from scoring_authority.odds_published_snapshots o))`);
  const rebindInput=()=>({contract_version:'certification-release-rebind-v1',operation_request_id:randomUUID(),resource:f.resource,
   expected_admission_revision:Number(q('select admission_revision from production_control.certification_admission_v1')),expected_release_commit:oldDeployment.release_commit,
   expected_deployment_id:oldDeployment.deployment_id,expected_deployment_origin:oldDeployment.deployment_origin,
   expected_current_tournament_id:pointer.tournament_id,expected_pointer_revision:pointer.pointer_revision,
   expected_authority_epoch_id:g.authority_epoch_id,expected_ingress_generation_id:g.generation_id,deployment_class:'preview',
   new_release_commit:'d'.repeat(40),new_deployment_id:'dpl_SyntheticCertificationSecond',
   new_deployment_origin:'https://synthetic-certification-second.vercel.app',reason:'Synthetic compatible release proof'});
  await run('active admission and every runtime role are denied',()=>{
   assert.throws(()=>owner('rebind_certification_release_v1',rebindInput()),/ADMISSION_MUST_BE_DISABLED/);
   for(const role of['anon','authenticated','service_role'])assert.throws(()=>q(`set role ${role};select production_control.rebind_certification_release_v1(${jsonLiteral(rebindInput())})`),/permission denied/);
  });
  owner('set_certification_admission_v1',{resource_id:f.resource.resource_id,expected_admission_revision:context('READS').admission_revision,enabled:false,reason:'Owner release maintenance'});
  const input=rebindInput(),before=preserved();
  evidence.beforeReleaseAuthority=JSON.parse(q(`select jsonb_build_object(
   'admission',(select to_jsonb(a)from production_control.certification_admission_v1 a),
   'pointer',(select to_jsonb(p)from production_control.current_tournament_pointer_v1 p),
   'gate',(select to_jsonb(g)from scoring_authority.ingress_gates g),
   'origin',(select to_jsonb(o)from production_control.certification_initialization_origins_v1 o),
   'generations',(select jsonb_agg(to_jsonb(g))from production_control.certification_ingress_generations_v1 g),'input',${jsonLiteral(input)})`));
  await run('resource and CAS negatives leave all authority unchanged',()=>{
   for(const patch of[{resource:{...input.resource,resource_id:'CERTIFICATION:'+randomUUID()}},{expected_admission_revision:0},
    {resource:{...input.resource,installation_id:randomUUID()}},{resource:{...input.resource,resource_class:'PRODUCTION'}},
    {resource:{...input.resource,registration_revision:999}},{resource:{...input.resource,schema_digest:'f'.repeat(64)}},
    {resource:{...input.resource,project_ref:'z'.repeat(20)}},
    {expected_release_commit:'e'.repeat(40)},{expected_pointer_revision:0},{expected_authority_epoch_id:randomUUID()},
    {expected_ingress_generation_id:randomUUID()},{deployment_class:'production'}]){
    assert.throws(()=>owner('rebind_certification_release_v1',{...input,...patch}));assert.equal(preserved(),before);
   }
  });
  await run('initial fallback rejects altered legacy gate shape; immutable origin cannot be rewritten',()=>{
   const oldGate=q('select to_jsonb(g)from scoring_authority.ingress_gates g');
   // Negative fault injection is rollback-contained. Do not persist a gate
   // rewrite or relax immutable origin/generation/closure constraints.
   assert.throws(()=>q(`begin;update scoring_authority.ingress_gates set admission_revision=admission_revision+1;
    select production_control.rebind_certification_release_v1(${jsonLiteral(input)});rollback;`),/CERTIFICATION_RELEASE_CONTEXT_STALE/);
   assert.equal(q('select to_jsonb(g)from scoring_authority.ingress_gates g'),oldGate);
   assert.throws(()=>q('update production_control.certification_initialization_origins_v1 set registration_revision=registration_revision+1'),/INITIALIZATION_EVIDENCE_IMMUTABLE/);
   assert.equal(preserved(),before);
  });
  await run('required atomic release audit failure rolls back admission update',()=>{
   const old=q('select to_jsonb(a)from production_control.certification_admission_v1 a');
   q("create function public.test_release_audit_failure()returns trigger language plpgsql as $$begin if new.event_type='CERTIFICATION_RELEASE_REBOUND'then raise exception 'TEST_RELEASE_AUDIT_FAILURE';end if;return new;end$$;create trigger test_release_audit_failure before insert on production_control.operation_audit_events for each row execute function public.test_release_audit_failure()");
   try{assert.throws(()=>owner('rebind_certification_release_v1',input),/TEST_RELEASE_AUDIT_FAILURE/);}finally{q('drop trigger test_release_audit_failure on production_control.operation_audit_events;drop function public.test_release_audit_failure()');}
   assert.equal(q('select to_jsonb(a)from production_control.certification_admission_v1 a'),old);
  });
  let receipt;
  await run('exclusive release fence waits for existing operation, then commits one receipt',async()=>{
   const held=openSqlSession(f.cluster,f.database),release=openSqlSession(f.cluster,f.database);
   try{
    await held.query('begin;select pg_advisory_xact_lock_shared(production_control.scoring_admission_lock_key())');
    const pid=Number(await release.query('select pg_backend_pid()'));let complete=false;
    const pending=release.query(`select production_control.rebind_certification_release_v1(${jsonLiteral(input)})`).then(value=>{complete=true;return value;});
    for(let i=0;i<50;i++){if(Number(q(`select cardinality(pg_blocking_pids(${pid}))`)))break;await new Promise(r=>setTimeout(r,10));}
    assert.equal(complete,false);assert.equal(Number(q(`select cardinality(pg_blocking_pids(${pid}))`)),1);
    await held.query('commit');receipt=JSON.parse(await pending);assert.equal(receipt.ok,true);assert.equal(receipt.enabled,false);
   }finally{try{await held.query('rollback');}catch{}await Promise.all([held.close(),release.close()]);}
   assert.equal(preserved(),before);assert.equal(q("select count(*)from production_control.operation_audit_events where event_type='CERTIFICATION_RELEASE_REBOUND'"),'1');
   assert.deepEqual(owner('rebind_certification_release_v1',input),receipt);
   assert.throws(()=>owner('rebind_certification_release_v1',{...input,reason:'Conflicting same operation'}),/IDEMPOTENCY_CONFLICT/);
   const replaySessions=Array.from({length:4},()=>openSqlSession(f.cluster,f.database));
   try{
    const repeated=await Promise.all(replaySessions.map(session=>session.query(
     `select production_control.rebind_certification_release_v1(${jsonLiteral(input)})`)));
    for(const value of repeated)assert.deepEqual(JSON.parse(value),receipt);
    assert.equal(q("select count(*)from production_control.operation_audit_events where event_type='CERTIFICATION_RELEASE_REBOUND'"),'1');
   }finally{await Promise.all(replaySessions.map(session=>session.close()));}
  });
  adoptCertificationReleaseReceipt(f,receipt);
  const rebound=old=>({...old,deployment:{...f.deployment}});
  await run('old deployment denied; committed receipts and UNKNOWN recover while disabled',()=>{
   assert.throws(()=>rpc('read_certification_runtime_context_v1',{...oldEnvelope,phase:'READS'}),/DENIED|MISMATCH/);
   assert.throws(()=>rpc('read_certification_runtime_context_v1',{...f.envelope,phase:'READS'}),/DEPLOYMENT_DENIED/);
   for(const original of[score,committedSetup])assert.equal(rpc('read_certification_ingress_status_v1',rebound(original)).state,'COMMITTED');
   assert.equal(rpc('read_certification_ingress_status_v1',rebound(unresolved)).state,'UNKNOWN');
   assert.throws(()=>rpc('execute_certification_operation_v1',{...rebound(unresolved),ingress:{lease_id:unresolvedLease.lease_id,admission_generation_id:unresolvedLease.admission_generation_id}}),/CLOSED|STALE|DENIED|DISABLED/);
  });
  owner('set_certification_admission_v1',{resource_id:f.resource.resource_id,expected_admission_revision:receipt.admission_revision,enabled:true,reason:'Owner confirms synthetic release'});
  await run('new client context works; stale token never silently rebinds; explicit no-write fence resolves',async()=>{
   assert.throws(()=>rpc('execute_certification_operation_v1',{...rebound(unresolved),ingress:{lease_id:unresolvedLease.lease_id,admission_generation_id:unresolvedLease.admission_generation_id}}),/STALE|CONFLICT/);
   assert.equal(rpc('resolve_certification_ingress_v1',rebound(unresolved)).state,'NOT_COMMITTED');
   const stack=await certificationDirectorStack(f),model=(await stack.transport.setupRequest()).data;
   const updated=await stack.transport.setupRequest({action:'update-tournament',operationRequestId:randomUUID(),expectedRevision:model.revision,
    name:'New release canonical result',destination:'Synthetic course',startDate:'2026-09-20',endDate:'2026-09-22',
    timeZone:'America/Chicago',operationalStatus:'UPCOMING'});
   assert.equal(updated.receipt?.ok??updated.data?.ok,true);
   assert.equal(q("select name from scoring_authority.tournaments where tournament_id='2026'"),'New release canonical result');
   assert.equal(q("select count(*)from scoring_authority.hole_scores"),'2');
  });
  await run('owner ACL, private schema, search path and exact receipt provenance',()=>{
   const metadata=JSON.parse(q("select jsonb_build_object('owner',pg_get_userbyid(proowner),'definer',prosecdef,'path',proconfig,'acl',proacl::text)from pg_proc where oid='production_control.rebind_certification_release_v1(jsonb)'::regprocedure"));
   assert.equal(metadata.owner,'postgres');assert.equal(metadata.definer,false);assert.deepEqual(metadata.path,['search_path=pg_catalog']);
   for(const role of['anon','authenticated','service_role'])assert.equal(q(`select has_function_privilege('${role}','production_control.rebind_certification_release_v1(jsonb)','execute')`),'f');
   const audit=JSON.parse(q("select details from production_control.operation_audit_events where event_type='CERTIFICATION_RELEASE_REBOUND'"));
   assert.equal(audit.resource_id,f.resource.resource_id);assert.equal(audit.admission_generation_id,g.generation_id);
   assert.equal(audit.before_release_commit,oldDeployment.release_commit);assert.deepEqual(audit.receipt,receipt);
   metadata.dependencies=JSON.parse(q(`select coalesce(jsonb_agg(jsonb_build_object(
    'type',d.deptype,'from',pg_describe_object(d.classid,d.objid,d.objsubid),'to',pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid))
    order by d.deptype,pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid)),'[]')from pg_depend d
    where d.classid='pg_proc'::regclass and d.objid='production_control.rebind_certification_release_v1(jsonb)'::regprocedure`));
   return metadata;
  });
  await proveCertificationOddsAfterRelease(f,oddsProof,{run});
  await run('preserved required automatic intents drain through the actual worker under new release',async()=>{
   const identities="select jsonb_agg(jsonb_build_object('intent_id',intent_id,'source_transaction',source_transaction,'canonical_revision',canonical_revision,'runtime_generation_id',runtime_generation_id)order by intent_id)from scoring_authority.score_derived_intents_v1";
   const rows=q(identities);
   const result=await drainCertificationAutomaticWorkers(f);
   assert.equal(result.requiredAutomaticWork,0);assert.equal(result.googleCalls,0);
   assert.equal(q(identities),rows);
   return{requiredAutomaticWork:result.requiredAutomaticWork,googleCalls:result.googleCalls,
    cycles:result.cycles,automaticFamilies:result.automaticFamilies,originalIntentIdentitiesPreserved:true};
  });
  await run('closed durable generation without genuine annual closure evidence cannot rebind',()=>{
   owner('set_certification_admission_v1',{resource_id:f.resource.resource_id,
    expected_admission_revision:Number(q('select admission_revision from production_control.certification_admission_v1')),
    enabled:false,reason:'Terminal negative closure proof'});
   const selected=certificationReleaseInput(f,'terminal-missing-annual-closure');
   const drained=JSON.parse(q(`select production_control.close_certification_ingress_generation_v1('${f.resource.resource_id}',
    '${selected.state.generation.generation_id}',${selected.state.generation.revision})`));
   assert.equal(drained.state,'CLOSED');assert.equal(drained.drained,true);
   assert.equal(q('select count(*)from production_control.scoring_admission_closures'),'0');
   const input=certificationReleaseInput(f,'terminal-missing-annual-closure').input,before=preserved();
   assert.throws(()=>owner('rebind_certification_release_v1',input),/CERTIFICATION_RELEASE_CLOSED_EVIDENCE_REQUIRED/);
   assert.equal(preserved(),before);
   const admissionBefore=q('select to_jsonb(a)from production_control.certification_admission_v1 a');
   assert.throws(()=>owner('set_certification_admission_v1',{resource_id:f.resource.resource_id,
    expected_admission_revision:Number(q('select admission_revision from production_control.certification_admission_v1')),
    enabled:true,reason:'Must not reopen a generation without annual closure evidence'}),/CERTIFICATION_ADMISSION_CLOSED_EVIDENCE_REQUIRED/);
   assert.equal(q('select to_jsonb(a)from production_control.certification_admission_v1 a'),admissionBefore);
   assert.equal(q("select state from scoring_authority.ingress_gates where tournament_id='2026'"),'PAUSED');
   assert.equal(preserved(),before);return{generationClosedByCanonicalCore:true,annualClosureAbsent:true,releaseDenied:true,enableDenied:true};
  });
 }finally{
  evidence.sourceManifest=hashes;evidence.sourceStable=JSON.stringify(hashes)===JSON.stringify(manifest());
  evidence.limitations=['Local synthetic release identity; no Vercel deployment proof','Genuine annual CLOSED/reopened/activated generation chronology is recorded separately','Admitted database owner only; runtime callers denied'];
  const directory='docs/reliability/phase2d-resource-model/implementation-evidence';mkdirSync(directory,{recursive:true});
  writeFileSync(directory+'/release-transition-'+new Date().toISOString().replaceAll(':','-')+'.json',JSON.stringify(evidence,null,2)+'\n');
  if(f)await destroyIsolatedCluster(f.cluster);
 }
 assert.equal(evidence.sourceStable,true,'Source changed during proof');
});
