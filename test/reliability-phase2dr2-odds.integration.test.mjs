// Owned PostgreSQL + actual shipping deterministic Odds engine. No providers.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readdir,readFile,mkdir,writeFile} from 'node:fs/promises';
import {createCertificationFixture} from './support/reliability/phase2d-certification-fixture.mjs';
import {destroyIsolatedCluster,jsonLiteral,openSqlSession,restartIsolatedCluster} from './support/reliability/postgres17.mjs';
import {certificationTransportRegistration} from './support/reliability/certification-ingress-js-proof.mjs';
import {provisionAnnualSyntheticAuthority} from './support/reliability/certification-annual-transition-fixture.mjs';
import {certificationOddsStack} from './support/reliability/certification-odds-proof.mjs';
import {syntheticActor} from './support/reliability/synthetic-tournament.mjs';
import {assertOddsDomainEquivalence,assertPublicOddsHasNoPrivateProvenance} from './support/reliability/odds-domain-equivalence.mjs';
import {publishedOddsSnapshotsFromView,publishedOddsFreshness} from '../lib/published-odds-supabase.js';
import {mobileProductionOddsView,mobileOddsDataFromView} from '../lib/mobile-v1-odds.js';
import {certificationProvisionalProfile as forward} from './support/reliability/certification-provisional-profile.mjs';
test('Certification Odds real calculation, durable owner publication and isolation',async t=>{
 const f=await createCertificationFixture({forwardMigrations:forward,databases:2,registrationFactory:certificationTransportRegistration});
 try{
  provisionAnnualSyntheticAuthority(f);
  const stack=await certificationOddsStack(f), calls=stack.calls;
  const durations={},measure=async(name,fn)=>{const began=performance.now();try{return await fn();}finally{(durations[name]??=[]).push(performance.now()-began);}};
  const authorization=stack.authorization,invoke=input=>stack.client(input);
  const rpc=input=>f.rpc('dispatch_certification_odds_v1',input);
  const clone=value=>structuredClone(value);
  const fault=()=>f.q(`create function public.synthetic_odds_receipt_failure()returns trigger language plpgsql as $$begin raise exception 'SYNTHETIC_ODDS_ATOMIC_FAULT';end;$$;
   create trigger synthetic_odds_receipt_failure before insert on production_control.certification_odds_receipts_v1
   for each row execute function public.synthetic_odds_receipt_failure();`);
  const clearFault=()=>f.q('drop trigger synthetic_odds_receipt_failure on production_control.certification_odds_receipts_v1;drop function public.synthetic_odds_receipt_failure();');
  let current,requested,request;
  await t.test('fresh state has no historical publication; real canonical read works',async()=>{
   current=await stack.client();assert.equal(current.publication.state,'NEVER_PUBLISHED');
   assert.equal(current.publication.revision,0);assert.equal(current.publication.snapshotId,null);assert.equal(current.jobs.length,0);
   assert.equal(f.q('select count(*)from scoring_authority.odds_published_snapshots'),'0');
  });
  await t.test('client and database deny absent, participant, spectator, wrong target and impersonated Director authority',async()=>{
   for(const denied of[null,{...authorization,status:'denied'},
    {...authorization,identity:{...authorization.identity,actor:{id:'P12',role:'PARTICIPANT'}}},
    {...authorization,identity:{...authorization.identity,actor:{id:'P01',role:'SPECTATOR'}}},
    {...authorization,identity:{...authorization.identity,tournamentId:'2097'}},
    {...authorization,identity:{...authorization.identity,impersonating:true}}]){
     stack.setAuthorization(denied);await assert.rejects(stack.client());
   }stack.setAuthorization(authorization);
   const read=calls.find(c=>c.name==='dispatch_certification_odds_v1').input;
   for(const patch of[{role:'PARTICIPANT',player_id:syntheticActor.playerId,auth_user_id:syntheticActor.authUserId},
    {role:'SPECTATOR'},{auth_user_id:'10000000-0000-4000-8000-000000000099'},
    {player_id:'P24'},{tournament_id:'2097'},{impersonated:true}]){
     assert.throws(()=>rpc({...read,authorization:{...read.authorization,...patch}}));
   }
   assert.throws(()=>rpc({...read,authorization:null}));
  });
  await t.test('two independently installed resources reject cross read, target and wrong release',()=>{
   const read=calls.find(c=>c.name==='dispatch_certification_odds_v1').input;
   assert.throws(()=>f.resources[1].rpc('dispatch_certification_odds_v1',read));
   assert.throws(()=>rpc({...read,payload:{...read.payload,target_tournament_id:'2097'}}));
   assert.throws(()=>rpc({...read,deployment:{...read.deployment,release_commit:'d'.repeat(40)}}));
   assert.equal(f.resources[1].q('select count(*)from scoring_authority.odds_calculation_jobs'),'0');
  });
  await t.test('Director calculation request creates truthful durable job and no publication',async()=>{
   request={action:'calculate',operationRequestId:randomUUID(),expectedContextToken:current.context.token,phase:'Pre-Tournament',iterations:10000};
   requested=await measure('calculationRequestApi',()=>invoke(request));assert.equal(requested.accepted,true);assert.equal(requested.publicationCreated,false);
   const job=JSON.parse(f.q(`select to_jsonb(j)from scoring_authority.odds_calculation_jobs j where job_id='${requested.jobId}'`));
   assert.equal(job.production_operation_mode,'CERTIFICATION');assert.equal(job.status,'PENDING');assert.equal(job.source_revision.resource_id,f.resource.resource_id);
   assert.equal(job.production_deployment_commit,f.deployment.release_commit);assert.equal(job.runtime_generation_id,null);
   assert.equal(f.q('select count(*)from scoring_authority.odds_publication_current'),'0');
  });
  await t.test('unfinished calculation cannot be published and absent operation remains UNKNOWN',async()=>{
   await assert.rejects(invoke({action:'publish',operationRequestId:randomUUID(),expectedContextToken:current.context.token,
    jobId:requested.jobId,confirmPublication:true,expectedPublicationRevision:0,expectedSnapshotId:null}),e=>e.code==='ODDS_CALCULATION_NOT_READY');
   const missing=await invoke({action:'status',originalAction:'publish',operationRequestId:randomUUID()});assert.equal(missing.state,'UNKNOWN');
   assert.equal(f.q('select count(*)from scoring_authority.odds_published_snapshots'),'0');
  });
  await t.test('job request and required audit roll back together at receipt failure',async()=>{
   const before=f.q('select count(*)from production_control.operation_audit_events');fault();
   try{await assert.rejects(invoke({...request,operationRequestId:randomUUID(),iterations:25000}));}finally{clearFault();}
   assert.equal(f.q('select count(*)from scoring_authority.odds_calculation_jobs'),'1');
   assert.equal(f.q('select count(*)from production_control.operation_audit_events'),before);
   assert.equal(f.q('select count(*)from production_control.certification_odds_receipts_v1'),'1');
  });
  await t.test('forged provenance, stale context, worker owner-operation and cross-resource write fail closed',()=>{
   const command=calls.find(c=>c.input.payload?.odds_operation==='request_production_odds_calculation_job').input;
   const fresh=()=>({...clone(command),operation_request_id:randomUUID()});
   for(const change of[
    x=>{x.expected_context_token='f'.repeat(64);},x=>{x.phase='WORKERS';},
    x=>{x.payload.source_revision.resource_id='CERTIFICATION:'+randomUUID();},
    x=>{x.payload.source_revision.installation_id=randomUUID();},x=>{x.payload.source_revision.configuration_revision=0;},x=>{x.payload.source_revision.source_fingerprint='f'.repeat(64);},
    x=>{x.payload.expected_pointer_revision=999;},
    x=>{x.payload.source_revision.certification_ingress_generation_id=randomUUID();},
    x=>{x.payload.deployment_commit='d'.repeat(40);},x=>{x.payload.environment='PRODUCTION';},
    x=>{x.payload.google_publication_reference='forbidden';}]){const input=fresh();change(input);assert.throws(()=>rpc(input));}
   assert.throws(()=>f.resources[1].rpc('dispatch_certification_odds_v1',fresh()));
   assert.equal(f.q('select count(*)from scoring_authority.odds_calculation_jobs'),'1');
  });
  await t.test('same logical calculation retry ignores timing telemetry; conflict remains denied',async()=>{
   const replay=await invoke(request);assert.equal(replay.jobId,requested.jobId);
   await assert.rejects(invoke({...request,iterations:25000}),e=>e.code==='CERTIFICATION_ODDS_OPERATION_CONFLICT');
   assert.equal(f.q('select count(*)from scoring_authority.odds_calculation_jobs'),'1');
   const status=await invoke({action:'status',originalAction:'calculate',operationRequestId:request.operationRequestId});assert.equal(status.state,'COMMITTED');
  });
  const workerCommand=(operation,payload)=>({...f.envelope,phase:'WORKERS',operation_id:'ODDS.'+operation,
   operation_request_id:randomUUID(),expected_context_token:f.context('WORKERS').context_token,payload:{odds_operation:operation,...payload}});
  await t.test('claim race admits one lease; expired lease recovers and old token is rejected',async()=>{
   const command=workerCommand('claim_production_odds_calculation_job',{job_id:requested.jobId,worker_id:'race'});
   const sessions=Array.from({length:8},()=>openSqlSession(f.cluster,f.database));let winner;
   try{const results=await Promise.all(sessions.map(s=>s.query(`set role service_role;select public.dispatch_certification_odds_v1(${jsonLiteral(command)})`)));
    const claims=results.map(JSON.parse);assert.equal(claims.filter(r=>r.deliver).length,1);winner=claims.find(r=>r.deliver);
   }finally{await Promise.all(sessions.map(s=>s.close()));}
   // Fault injection changes only a lease clock in this owned fixture; no result,
   // score, publication or readiness is manufactured.
   f.q(`begin;set local request.jwt.claim.role='service_role';select production_control.push_certification_context_v1(${jsonLiteral({...f.envelope,phase:'WORKERS'})},'WORKERS',false);
    update scoring_authority.odds_calculation_jobs set lease_expires_at=clock_timestamp()-interval '1 second'where job_id='${requested.jobId}';
    select production_control.pop_certification_context_v1();commit;`);
   const recovered=rpc(workerCommand('claim_production_odds_calculation_job',{job_id:requested.jobId,worker_id:'recovery'}));
   assert.equal(recovered.deliver,true);assert.notEqual(recovered.job.claim_token,winner.job.claim_token);
   const stale=rpc(workerCommand('fail_production_odds_calculation_job',{job_id:requested.jobId,claim_token:winner.job.claim_token,retryable:true}));assert.equal(stale.ok,true);assert.equal(stale.marked,false);assert.equal(stale.stale_claim,true);
   assert.equal(rpc(workerCommand('fail_production_odds_calculation_job',{job_id:requested.jobId,claim_token:recovered.job.claim_token,
    retryable:true,error_code:'SYNTHETIC_WORKER_RECOVERY',error_safe:'Isolated recovery proof.'})).ok,true);
  });
  await t.test('calculator interruption preserves real checkpoint and resumes without publication',async()=>{
   await assert.rejects(stack.worker(requested.jobId,{workerId:'synthetic-interruption',chunkIterations:1000,failureAt:'AFTER_CHECKPOINT'}),
    e=>e.code==='ODDS_REHEARSAL_AFTER_CHECKPOINT');
   const state=JSON.parse(f.q(`select jsonb_build_object('status',status,'progress',completed_iterations,'attempts',attempt_count)from scoring_authority.odds_calculation_jobs where job_id='${requested.jobId}'`));
   assert.equal(state.status,'RETRYABLE');assert.equal(state.progress,1000);assert.equal(state.attempts,3);
   assert.equal(f.q('select count(*)from scoring_authority.odds_published_snapshots'),'0');
  });
  await t.test('existing canonical calculator checkpoints and completes; never publishes',async()=>{
   const out=await measure('calculationResumeWorker',()=>stack.worker(requested.jobId,{workerId:'synthetic-odds',chunkIterations:1000}));assert.equal(out.attempts,4);
   assert.equal(f.q(`select status from scoring_authority.odds_calculation_jobs where job_id='${requested.jobId}'`),'SUCCEEDED',JSON.stringify(out));
   assert.equal(f.q(`select publication_status from scoring_authority.odds_calculation_jobs where job_id='${requested.jobId}'`),'READY');
   assert.equal(f.q('select count(*)from scoring_authority.odds_published_snapshots'),'0');
  });
  await t.test('completed calculator duplicate delivery does not recalculate or publish',async()=>{
   const again=await stack.worker(requested.jobId);assert.equal(again.completed,true);assert.equal(again.processed,false);
   assert.equal(f.q(`select attempt_count from scoring_authority.odds_calculation_jobs where job_id='${requested.jobId}'`),'4');
   assert.equal(f.q('select count(*)from scoring_authority.odds_published_snapshots'),'0');
  });
  await t.test('durable calculator exactly matches unchanged canonical domain engine and exposes no private provenance',async()=>{
   const evidence=await assertOddsDomainEquivalence({tournamentId:'2026',jobId:requested.jobId,
    readJobs:async()=>({payload:{ok:true,jobs:[JSON.parse(f.q(`select to_jsonb(j)from scoring_authority.odds_calculation_jobs j where job_id='${requested.jobId}'`))]}})});
   const view=await stack.client(null,{jobId:requested.jobId});
   assert.equal(view.jobs.length,1);assert.ok(view.jobs[0].result);assertPublicOddsHasNoPrivateProvenance(view.jobs[0].result);
   t.diagnostic(JSON.stringify({domainEquivalence:evidence}));
  });
  await t.test('concurrent duplicate committed calculation operations resolve one durable outcome',async()=>{
   const command=calls.find(c=>c.input.payload?.odds_operation==='request_production_odds_calculation_job').input;
   const sessions=Array.from({length:8},()=>openSqlSession(f.cluster,f.database));
   try{const results=await Promise.all(sessions.map(s=>s.query(`set role service_role;select public.dispatch_certification_odds_v1(${jsonLiteral(command)})`)));
    assert.ok(results.every(r=>JSON.parse(r).job.job_id===requested.jobId));
   }finally{await Promise.all(sessions.map(s=>s.close()));}
   assert.equal(f.q('select count(*)from scoring_authority.odds_calculation_jobs'),'1');
   assert.equal(f.q('select count(*)from production_control.certification_odds_receipts_v1'),'1');
  });
  let publish,published;
  await t.test('first publication validates result/source/milestone/generation and never adopts historical provider data',()=>{
   const job=JSON.parse(f.q(`select to_jsonb(j)from scoring_authority.odds_calculation_jobs j where job_id='${requested.jobId}'`));
   const base={...f.envelope,phase:'DIRECTOR',operation_id:'ODDS.publish_production_championship_odds_v1',
    expected_context_token:current.context.token,payload:{odds_operation:'publish_production_championship_odds_v1',job_id:job.job_id,
     expected_publication_revision:0,expected_snapshot_id:null,milestone:job.phase,
     expected_source_fingerprint:job.source_revision.source_fingerprint,expected_result_fingerprint:job.result_fingerprint}};
   for(const patch of[{job_id:'f'.repeat(64)},{expected_source_fingerprint:'f'.repeat(64)},{expected_result_fingerprint:'f'.repeat(64)},
    {milestone:'Final Results'},{expected_runtime_generation_id:randomUUID()},{expected_publication_revision:1},
    {expected_snapshot_id:randomUUID()},{adoption_kind:'GOOGLE'},{google_publication_reference:'legacy'},{target_tournament_id:'2097'}]){
    let result;try{result=rpc({...base,operation_request_id:randomUUID(),payload:{...base.payload,...patch}});}catch{continue;}
    assert.equal(result.ok,false,JSON.stringify(patch));assert.ok(result.code);
   }
   assert.equal(f.q('select count(*)from scoring_authority.odds_published_snapshots'),'0');
  });
  await t.test('snapshot, pointer, job publication and audit roll back together at receipt fault',async()=>{
   const before=f.q('select count(*)from production_control.operation_audit_events');fault();
   try{await assert.rejects(invoke({action:'publish',operationRequestId:randomUUID(),expectedContextToken:current.context.token,
    jobId:requested.jobId,confirmPublication:true,expectedPublicationRevision:0,expectedSnapshotId:null}));}finally{clearFault();}
   assert.equal(f.q('select count(*)from scoring_authority.odds_published_snapshots'),'0');
   assert.equal(f.q('select count(*)from scoring_authority.odds_publication_current'),'0');
   assert.equal(f.q(`select publication_status from scoring_authority.odds_calculation_jobs where job_id='${requested.jobId}'`),'READY');
   assert.equal(f.q('select count(*)from production_control.operation_audit_events'),before);
  });

  await t.test('explicit Director first publication commits genuine result and immutable provenance',async()=>{
   publish={action:'publish',operationRequestId:randomUUID(),expectedContextToken:current.context.token,jobId:requested.jobId,
    confirmPublication:true,expectedPublicationRevision:0,expectedSnapshotId:null};
   published=await measure('firstPublicationApi',()=>invoke(publish));assert.equal(published.publicationCreated,true);assert.equal(published.publication.revision,1);
   const row=JSON.parse(f.q('select to_jsonb(s)from scoring_authority.odds_published_snapshots s'));
   assert.equal(row.resource_binding.resource_class,'CERTIFICATION');assert.equal(row.resource_binding.resource_id,f.resource.resource_id);
   assert.equal(row.resource_binding.previous_publication_state,'NEVER_PUBLISHED');assert.equal(row.google_publication_reference,null);
   assert.equal(row.imported_by,'certification-odds-publication-v1');assert.deepEqual(row.published_payload,published.snapshot);
   assertPublicOddsHasNoPrivateProvenance(published.snapshot);
  });
  await t.test('actual public published snapshots and unchanged mobile DTOs omit private Certification provenance',async()=>{
   const read=await stack.published();assert.equal(read.payload.ok,true);const view=read.payload.data;
   const snapshots=publishedOddsSnapshotsFromView(view);assert.equal(snapshots.length,1);
   assert.deepEqual(snapshots[0],published.snapshot);assertPublicOddsHasNoPrivateProvenance(snapshots);
   const mobile=mobileOddsDataFromView(mobileProductionOddsView(view,{tournamentId:'2026'}));
   assert.equal(mobile.publication.state,'PUBLISHED');assert.equal(mobile.snapshots.length,1);
   assertPublicOddsHasNoPrivateProvenance(mobile);
   const freshness=publishedOddsFreshness(view);assert.equal(freshness.current,true);
   // These two fields predate Certification in the existing participant
   // freshness contract; retaining them is compatibility, not a new metadata
   // leak. The mapper's unchanged source is checked against the base above.
   assert.equal(freshness.authorityEpochId,view.publication.authority_epoch_id);
   assert.equal(freshness.resourceBindingFingerprint,view.publication.resource_binding_fingerprint);
   const {authorityEpochId:_oldEpoch,resourceBindingFingerprint:_oldBinding,...safeFreshness}=freshness;
   assertPublicOddsHasNoPrivateProvenance(safeFreshness);
  });
  await t.test('lost publication acknowledgement recovers same receipt; stale first CAS conflicts',async()=>{
   assert.equal((await invoke(publish)).snapshotId,published.snapshotId);
   const status=await measure('committedRecoveryApi',()=>invoke({action:'status',originalAction:'publish',operationRequestId:publish.operationRequestId}));assert.equal(status.state,'COMMITTED');
   await assert.rejects(invoke({...publish,expectedPublicationRevision:1,expectedSnapshotId:published.snapshotId}),e=>e.code==='CERTIFICATION_ODDS_OPERATION_CONFLICT');
   await assert.rejects(invoke({...publish,operationRequestId:randomUUID()}));
   assert.equal(f.q('select count(*)from scoring_authority.odds_published_snapshots'),'1');
  });
  await t.test('owned PostgreSQL restart retains publication and exact operation recovery',async()=>{
   restartIsolatedCluster(f.cluster);
   const status=await invoke({action:'status',originalAction:'publish',operationRequestId:publish.operationRequestId});
   assert.equal(status.state,'COMMITTED');assert.equal(status.receipt.snapshotId,published.snapshotId);
   const same=await invoke(publish);assert.equal(same.snapshotId,published.snapshotId);assert.equal(same.duplicate,true);
   assert.equal(f.q('select count(*)from scoring_authority.odds_published_snapshots'),'1');
  });
  await t.test('committed replay and status reject explicit impersonation without widening recovery authority',async()=>{
   stack.setAuthorization({...authorization,identity:{...authorization.identity,impersonating:true}});
   try{await assert.rejects(invoke(publish));await assert.rejects(invoke({action:'status',originalAction:'publish',operationRequestId:publish.operationRequestId}));}
   finally{stack.setAuthorization(authorization);}
   const replay=calls.find(c=>c.input.payload?.odds_operation==='publish_production_championship_odds_v1'&&c.input.operation_request_id===publish.operationRequestId).input;
   const status=calls.find(c=>c.name==='read_certification_odds_operation_v1'&&c.input.operation_request_id===publish.operationRequestId).input;
   const observed=[];
   for(const [name,input]of [['dispatch_certification_odds_v1',replay],['read_certification_odds_operation_v1',status]]){
    const changed={...clone(input),authorization:{...input.authorization,impersonating_player_id:'P02'}};
    try{const result=f.rpc(name,changed);observed.push({name,denied:false,resultState:result.state||result.operation_state,idempotent:result.idempotent===true});}
    catch(error){observed.push({name,denied:true,error:String(error.message||error).slice(0,1000)});}
   }
   const sourceHash=createHash('sha256').update(await readFile('supabase/production_migrations/202609300143_certification_odds_owner_publication_v1.sql')).digest('hex');
   const directory='docs/reliability/phase2d-resource-model/implementation-evidence';await mkdir(directory,{recursive:true});
   await writeFile(`${directory}/odds-recovery-impersonation-${sourceHash.slice(0,12)}.json`,JSON.stringify({environment:'OWNED_SOCKET_ONLY_POSTGRESQL17_NON_PRODUCTION',
    migration143:sourceHash,apiBooleanImpersonationDenied:true,observed,canonicalSnapshots:Number(f.q('select count(*)from scoring_authority.odds_published_snapshots'))},null,2)+'\n');
   assert.ok(observed.every(result=>result.denied),'Explicit SQL impersonating_player_id must not recover or replay an admitted Director operation');
  });
  await t.test('worker cannot publish, historical publication is immutable and audit provenance is truthful',()=>{
   const command=calls.find(c=>c.input.payload?.odds_operation==='publish_production_championship_odds_v1').input;
   assert.throws(()=>rpc({...command,operation_request_id:randomUUID(),phase:'WORKERS',authorization:null}));
   assert.throws(()=>f.q("update scoring_authority.odds_published_snapshots set published_payload='{}'"));
   assert.throws(()=>f.q("delete from production_control.certification_odds_receipts_v1"));
   const events=JSON.parse(f.q("select jsonb_agg(to_jsonb(e))from production_control.operation_audit_events e where event_type like 'CERTIFICATION%ODDS%';"));
   assert.ok(events.some(e=>e.event_type==='CERTIFICATION_ODDS_CALCULATION_SUCCEEDED'));
   assert.ok(events.some(e=>e.event_type==='CERTIFICATION_CHAMPIONSHIP_ODDS_PUBLISHED'));
   for(const event of events){const provenance=event.details.resource_binding||event.details;assert.equal(provenance.resource_id,f.resource.resource_id);}
   assert.equal(f.q("select count(*)from production_control.operation_audit_events where event_type like 'PRODUCTION%ODDS%'"),'0');
  });
  await t.test('private cores inaccessible and Production legacy publication remains denied',async()=>{
   assert.equal(f.q(`select count(*)from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='production_control'
    and p.proname in('canonical_odds_dispatch_v2','canonical_publish_odds_v2')and(has_function_privilege('service_role',p.oid,'EXECUTE')or has_function_privilege('anon',p.oid,'EXECUTE')or has_function_privilege('authenticated',p.oid,'EXECUTE'))`),'0');
   assert.throws(()=>f.rpc('publish_production_championship_odds_v1',{}));
   for(const role of['anon','authenticated'])assert.throws(()=>f.rpc('dispatch_certification_odds_v1',{},role),/permission denied/);
   const privateFunctions=JSON.parse(f.q(`select jsonb_agg(jsonb_build_object('name',p.proname,'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'config',p.proconfig,
    'service',has_function_privilege('service_role',p.oid,'EXECUTE'),'anon',has_function_privilege('anon',p.oid,'EXECUTE'),
    'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE')))from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='production_control'and(p.proname like '%certification_odds%'or p.proname in('canonical_odds_dispatch_v2','canonical_publish_odds_v2','canonical_odds_inputs_v2','current_canonical_odds_inputs_v2','assert_canonical_odds_job_v1'))`));
   for(const fn of privateFunctions){assert.equal(fn.owner,'postgres');assert.equal(fn.service,false);assert.equal(fn.anon,false);assert.equal(fn.authenticated,false);assert.deepEqual(fn.config,['search_path=pg_catalog']);}
   assert.equal(f.q(`select relrowsecurity from pg_class where oid='production_control.certification_odds_receipts_v1'::regclass`),'t');
   assert.equal(f.q(`select count(*)from pg_policy where polrelid='production_control.certification_odds_receipts_v1'::regclass`),'0');
   assert.ok(Number(f.q(`select count(*)from pg_depend where objid='production_control.canonical_odds_dispatch_v2(jsonb,jsonb)'::regprocedure`))>0);
   const graph=JSON.parse(f.q(`with touched as(select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where(n.nspname='production_control'and p.proname in('certification_odds_runtime_v1','assert_certification_odds_actor_v1',
     'assert_canonical_odds_job_v1','guard_certification_odds_job_v1','canonical_odds_inputs_v2','current_canonical_odds_inputs_v2',
     'canonical_odds_dispatch_v2','canonical_publish_odds_v2','certification_odds_publication_state_v1','certification_odds_request_hash_v1','publish_annual_odds_v1'))
    or(n.nspname='public'and p.proname in('dispatch_certification_odds_v1','read_certification_odds_operation_v1','future_production_dispatch_odds_pre_withdrawal_v1'))),
    edges as(select d.deptype,(pg_identify_object(d.classid,d.objid,d.objsubid)).type object_type,
     (pg_identify_object(d.classid,d.objid,d.objsubid)).identity object_identity,
     (pg_identify_object(d.refclassid,d.refobjid,d.refobjsubid)).type referenced_type,
     (pg_identify_object(d.refclassid,d.refobjid,d.refobjsubid)).identity referenced_identity
     from pg_depend d where(d.classid='pg_proc'::regclass and d.objid in(select oid from touched))
      or(d.refclassid='pg_proc'::regclass and d.refobjid in(select oid from touched)))
    select jsonb_build_object('functions',(select jsonb_agg(jsonb_build_object(
     'identity',(pg_identify_object('pg_proc'::regclass,p.oid,0)).identity,'owner',pg_get_userbyid(p.proowner),
     'securityDefiner',p.prosecdef,'searchPath',p.proconfig,'language',l.lanname,
     'definitionSha256',encode(extensions.digest(pg_get_functiondef(p.oid),'sha256'),'hex'),
     'acl',p.proacl::text,'serviceRoleExecute',has_function_privilege('service_role',p.oid,'EXECUTE'),
     'anonExecute',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticatedExecute',has_function_privilege('authenticated',p.oid,'EXECUTE'))
     order by p.oid::regprocedure::text)from pg_proc p join pg_language l on l.oid=p.prolang where p.oid in(select oid from touched)),
     'edges',(select coalesce(jsonb_agg(to_jsonb(e)order by object_identity,referenced_identity,deptype),'[]')from edges e))`));
   assert.equal(graph.functions.length,14);
   assert.ok(graph.edges.some(edge=>edge.object_type==='trigger'&&edge.object_identity.includes('zz_guard_certification_odds_job_v1')
    &&edge.referenced_identity.includes('guard_certification_odds_job_v1')),'Stored trigger dependency must bind the installed guard');
   const graphDirectory='docs/reliability/phase2d-resource-model/implementation-evidence';await mkdir(graphDirectory,{recursive:true});
   await writeFile(graphDirectory+'/odds-pg-depend-graph.json',JSON.stringify({environment:'OWNED_SOCKET_ONLY_POSTGRESQL17_NON_PRODUCTION',
    migration143:createHash('sha256').update(await readFile('supabase/production_migrations/202609300143_certification_odds_owner_publication_v1.sql')).digest('hex'),
    testSource:createHash('sha256').update(await readFile('test/reliability-phase2dr2-odds.integration.test.mjs')).digest('hex'),graph,
    limits:['Semantic catalog identities are recorded rather than installation-specific numeric OIDs',
     'pg_depend does not record every PL/pgSQL textual body call; actual nested RPC execution is separate integration evidence',
     'Migration143 checks predecessor wrapper OID/owner/ACL/security/search_path/volatility before and after replacement; this graph is the post-install catalog']} ,null,2)+'\n');
   assert.equal(f.q('select count(*)from production_control.resource_scope'),'0');assert.equal(f.q('select count(*)from scoring_authority.odds_google_mirror_jobs'),'0');
  });
  let successorCalculation;
  await t.test('real request supersedes stale unpublished work after preserved synthetic canonical input advances',async()=>{
   const reviewed=await stack.client(),older=await stack.client({action:'calculate',operationRequestId:randomUUID(),
    expectedContextToken:reviewed.context.token,phase:'Pre-Tournament',iterations:25000});
   assert.equal((await measure('calculationFreshWorker25000',()=>stack.worker(older.jobId))).completed,true);
   const retained=JSON.parse(f.q(`select to_jsonb(j)from scoring_authority.odds_calculation_jobs j where job_id='${older.jobId}'`));
   const oldConfig=JSON.parse(f.q("select to_jsonb(c)from scoring_authority.odds_input_configurations c where tournament_id='2026'and is_current"));
   // Input invalidation fixture only: append a new valid canonical rating
   // revision and preserve the previous source/configuration/result. This does
   // not claim current-year authoring UI proof and creates no job or result.
   const ratings={P01:{sandbaggerRatings:{2025:12}}},hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
   const next={...oldConfig,id:randomUUID(),configuration_revision:oldConfig.configuration_revision+1,
    historical_ratings:ratings,ratings_fingerprint:hash(ratings),bundle_fingerprint:hash({settings:oldConfig.canonical_settings,ratings}),
    source_fingerprint:hash({source:oldConfig.source_workbook_id,settings:oldConfig.canonical_settings,ratings}),
    imported_by:'SYNTHETIC_SOURCE_INVALIDATION_FIXTURE',validation_diagnostics:{synthetic:true,purpose:'PRESERVED_SOURCE_ADVANCE'},is_current:true};
   f.q(`begin;update scoring_authority.odds_input_configurations set is_current=false where id='${oldConfig.id}';
    insert into scoring_authority.odds_input_configurations select (jsonb_populate_record(null::scoring_authority.odds_input_configurations,${jsonLiteral(next)})).*;commit;`);
   // Published work is immutable history even after an independent canonical
   // configuration advances. The fixture changes only inputs, never results.
   const publishedJobBefore=f.q(`select to_jsonb(j)from scoring_authority.odds_calculation_jobs j where job_id='${requested.jobId}'`);
   const publishedClaim=rpc(workerCommand('claim_production_odds_calculation_job',{job_id:requested.jobId,worker_id:'published-config-advance'}));
   assert.equal(publishedClaim.completed,true);assert.equal(publishedClaim.deliver,false);
   const oldComplete=clone(calls.findLast(c=>c.input.payload?.odds_operation==='complete_production_odds_calculation_job'&&c.input.payload.job_id===requested.jobId).input);
   const terminal=rpc({...oldComplete,operation_request_id:randomUUID()});
   assert.equal(terminal.code,'ODDS_CALCULATION_RESULT_CONFLICT');
   assert.equal(f.q(`select to_jsonb(j)from scoring_authority.odds_calculation_jobs j where job_id='${requested.jobId}'`),publishedJobBefore);
   const retainedPublication=await invoke(publish);assert.equal(retainedPublication.snapshotId,published.snapshotId);
   const newestView=await stack.client(),newer=await stack.client({action:'calculate',operationRequestId:randomUUID(),
    expectedContextToken:newestView.context.token,phase:'Pre-Tournament',iterations:10000});
   assert.notEqual(newer.jobId,older.jobId);
   const stale=JSON.parse(f.q(`select to_jsonb(j)from scoring_authority.odds_calculation_jobs j where job_id='${older.jobId}'`));
   assert.equal(stale.status,'SUPERSEDED');assert.equal(stale.publication_status,'STALE');assert.equal(stale.superseded_by,newer.jobId);
   for(const key of ['input_snapshot','source_revision','result_payload','result_fingerprint'])assert.deepEqual(stale[key],retained[key]);
   const historicalConfig=JSON.parse(f.q(`select to_jsonb(c)from scoring_authority.odds_input_configurations c where id='${oldConfig.id}'`));
   for(const key of ['configuration_revision','canonical_settings','effective_settings','historical_ratings','source_fingerprint','bundle_fingerprint'])assert.deepEqual(historicalConfig[key],oldConfig[key]);
   await assert.rejects(stack.client({action:'publish',operationRequestId:randomUUID(),expectedContextToken:newestView.context.token,
    jobId:older.jobId,confirmPublication:true,expectedPublicationRevision:1,expectedSnapshotId:published.snapshotId}));
   assert.equal(f.q('select current_snapshot_id from scoring_authority.odds_publication_current'),published.snapshotId);
   assert.equal((await measure('calculationFreshWorker10000',()=>stack.worker(newer.jobId))).completed,true);
   successorCalculation=newer;
   assert.equal(f.q('select count(*)from scoring_authority.odds_published_snapshots'),'1');
  });
  await t.test('second explicit owner publication preserves old snapshot facts and commits pointer changes atomically',async()=>{
   const before=JSON.parse(f.q('select to_jsonb(s)from scoring_authority.odds_published_snapshots s'));
   const view=await stack.client(),next={action:'publish',operationRequestId:randomUUID(),expectedContextToken:view.context.token,
    jobId:successorCalculation.jobId,confirmPublication:true,expectedPublicationRevision:view.publication.revision,
    expectedSnapshotId:view.publication.snapshotId};
   assert.equal(next.expectedPublicationRevision,1);assert.equal(next.expectedSnapshotId,published.snapshotId);
   fault();try{await assert.rejects(invoke(next));}finally{clearFault();}
   assert.deepEqual(JSON.parse(f.q('select to_jsonb(s)from scoring_authority.odds_published_snapshots s')),before);
   const second=await measure('secondPublicationApi',()=>invoke(next));assert.equal(second.publication.revision,2);
   assert.notEqual(second.snapshotId,before.id);assert.equal(f.q('select count(*)from scoring_authority.odds_published_snapshots'),'2');
   assert.deepEqual(JSON.parse(f.q(`select to_jsonb(s)from scoring_authority.odds_published_snapshots s where id='${before.id}'`)),
    {...before,is_current_for_milestone:false,is_current_official:false});
   const retained=f.q('select jsonb_agg(to_jsonb(s)order by id)from scoring_authority.odds_published_snapshots s');
   const mutation={...f.envelope,phase:'DIRECTOR',operation_request_id:randomUUID(),expected_context_token:f.context('DIRECTOR').context_token};
   const attempt=(assignment,{phase='DIRECTOR'}={})=>f.q(`begin;select production_control.push_certification_context_v1(
    ${jsonLiteral({...mutation,phase,expected_context_token:f.context(phase).context_token})},'${phase}',true);
    update scoring_authority.odds_published_snapshots set ${assignment} where id='${before.id}';rollback;`,'service_role');
   for(const assignment of["published_payload='{}'","source_fingerprint=repeat('f',64)","publication_revision=publication_revision+1",
    "resource_binding=jsonb_set(resource_binding,'{resource_id}','\"CERTIFICATION:wrong\"')",
    "resource_binding=jsonb_set(resource_binding,'{resource_class}','\"PRODUCTION\"')"])
    assert.throws(()=>attempt(assignment),/PRODUCTION_ODDS_PUBLISHED_SNAPSHOT_IMMUTABLE/);
   for(const assignment of["google_publication_fingerprint=repeat('a',64)","google_publication_reference='{}'",
    "publication_verified=false","imported_by='wrong'","imported_at=imported_at+interval '1 second'","mirror_status='FAILED'"])
    assert.throws(()=>attempt(assignment),/PRODUCTION_ODDS_GOOGLE_PUBLICATION_RETIRED/);
   assert.throws(()=>attempt('is_current_official=true',{phase:'WORKERS'}),/CERTIFICATION_ODDS_SNAPSHOT_RESOURCE_DENIED/);
   assert.throws(()=>f.q(`update scoring_authority.odds_published_snapshots set is_current_official=true where id='${before.id}'`),/CANONICAL_RESOURCE_CONTEXT_REQUIRED/);
   assert.throws(()=>f.q(`begin;select set_config('app.certification_context',(${jsonLiteral(mutation)})::text,true);
    update scoring_authority.odds_published_snapshots set is_current_official=true where id='${before.id}';rollback;`),/CANONICAL_RESOURCE_CONTEXT_REQUIRED/);
   for(const role of['anon','authenticated','service_role'])assert.throws(()=>f.q(`set role ${role};update scoring_authority.odds_published_snapshots set is_current_official=true where id='${before.id}'`,role),/permission denied/);
   assert.equal(f.q('select jsonb_agg(to_jsonb(s)order by id)from scoring_authority.odds_published_snapshots s'),retained);
   assert.equal((await invoke(next)).snapshotId,second.snapshotId);
   assert.equal(f.q('select count(*)from production_control.resource_scope'),'0');
  });
  await t.test('exact current job, publication and recovery reads retain bounded indexed authority',async()=>{
   const queries={
    job:`select *from scoring_authority.odds_calculation_jobs where job_id='${requested.jobId}'`,
    publication:"select *from scoring_authority.odds_publication_current where tournament_id='2026'",
    receipt:`select *from production_control.certification_odds_receipts_v1 where resource_id='${f.resource.resource_id}'and tournament_id='2026'and operation_request_id='${publish.operationRequestId}'`};
   const plans={};
   for(const [name,sql]of Object.entries(queries))plans[name]=JSON.parse(f.q('explain(analyze,buffers,format json) '+sql));
   const indexes=JSON.parse(f.q("select jsonb_agg(jsonb_build_object('table',tablename,'name',indexname,'definition',indexdef)order by tablename,indexname)from pg_indexes where(schemaname='scoring_authority'and tablename in('odds_calculation_jobs','odds_publication_current'))or(schemaname='production_control'and tablename='certification_odds_receipts_v1')"));
   for(const key of ['job_id','tournament_id','resource_id, tournament_id, operation_request_id'])assert.ok(indexes.some(index=>index.definition.includes(key)),key);
   const measured={};for(const [name,samples]of Object.entries(durations))measured[name]={sampleCount:samples.length,samplesMs:samples,maxMs:Math.max(...samples),p95:'NOT_PROVEN',p99:'NOT_PROVEN'};
   const source={};for(const file of ['supabase/production_migrations/202609300143_certification_odds_owner_publication_v1.sql','lib/certification-odds-server.js','lib/certification-runtime-server.js',
    'test/reliability-phase2dr2-odds.integration.test.mjs'])source[file]=createHash('sha256').update(await readFile(file)).digest('hex');
   const directory='docs/reliability/phase2d-resource-model/implementation-evidence';await mkdir(directory,{recursive:true});
   await writeFile(directory+'/odds-performance-query-plans.json',JSON.stringify({environment:'OWNED_SOCKET_ONLY_POSTGRESQL17_NON_PRODUCTION',
    fixture:'Certification initial2026 normalized synthetic inputs; two independently installed resources; 10000-iteration canonical engine',
    migrations:forward,releaseBoundaryProof:'Migration144 is installed; complete release behavior is certified separately',source,
    measurement:'performance.now around actual in-process Director API and owned psql RPC transport; worker timing resumes after1000 retained iterations',
    limitations:['Samples characterize individual operations, not latency distributions','Includes local process scheduling and psql spawn overhead',
     'Plan fixture has one tournament/current publication and low history; history-scale benchmark is separate','No hosted or Production proof'],
    measured,queries,plans,indexes},null,2)+'\n');
  });
  t.diagnostic(JSON.stringify({layer:'LOCAL_POSTGRESQL_RPC_ACTUAL_CALCULATOR',rpcCalls:calls.length,actualDirectorApi:true,independentResources:2,concurrentReplay:8,googleCalls:0,googleJobs:0,autoPublication:0}));
 }finally{await destroyIsolatedCluster(f.cluster);}
});
