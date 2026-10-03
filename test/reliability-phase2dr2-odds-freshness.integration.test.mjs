// Approved two-part Odds freshness: real canonical mutations and calculator,
// owned local PostgreSQL only. No synthetic score/result/publication rows.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readdir,readFile,mkdir,writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {createCertificationFixture} from './support/reliability/phase2d-certification-fixture.mjs';
import {destroyIsolatedCluster,jsonLiteral,openSqlSession} from './support/reliability/postgres17.mjs';
import {certificationTransportRegistration} from './support/reliability/certification-ingress-js-proof.mjs';
import {provisionAnnualSyntheticAuthority,annualRuntime} from './support/reliability/certification-annual-transition-fixture.mjs';
import {certificationOddsStack} from './support/reliability/certification-odds-proof.mjs';
import {buildTournamentSetupMutation} from '../lib/production-tournament-setup-contract.js';
import {certificationProvisionalProfile as forward} from './support/reliability/certification-provisional-profile.mjs';
test('Certification two-part Odds freshness preserves actual live-source authority',async t=>{
 const paths=[...forward,'test/reliability-phase2dr2-odds-freshness.integration.test.mjs','lib/certification-odds-server.js'];
 const hashes=async()=>Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(await readFile(p)).digest('hex')])));
 const evidence={environment:'OWNED_SOCKET_ONLY_POSTGRESQL17',proofLayers:['POSTGRESQL','API','INTEGRATION','CONCURRENCY','SECURITY'],
  production:false,hosted:false,googleCalls:0,sourceBefore:await hashes(),cases:[]};
 const f=await createCertificationFixture({forwardMigrations:forward,registrationFactory:certificationTransportRegistration});
 try{
  provisionAnnualSyntheticAuthority(f);const runtime=annualRuntime(f),stack=await certificationOddsStack(f);
  const matchId='2026-R1-1',match=()=>JSON.parse(f.q(`select to_jsonb(m)from scoring_authority.matches m where match_id='${matchId}'`));
  const setupId=randomUUID(),setup=buildTournamentSetupMutation('prepare-scoring-context',{expectedRevision:f.model().revision,operationRequestId:setupId,matchId});
  delete setup.operation_request_id;
  runtime.execute(runtime.request('DIRECTOR.MUTATE_SETUP',{...setup,action:'prepare-scoring-context'},runtime.authorization(),setupId));
  const control=action=>{const m=match();return runtime.execute(runtime.request('DIRECTOR.MATCH_CONTROL',{action,match_id:matchId,
   expected_match_revision:m.match_revision,expected_permission_revision:m.permission_revision}));};
  control('mark-live');if(match().scoring_locked)control('scoring-unlock');control('access-activate');
  let nextHole=1;
  const scoreRequest=()=>{const m=match(),id=randomUUID();return runtime.request('SCORING.SUBMIT_HOLE',{
   match_id:matchId,mutation_key:id,hole_number:nextHole++,expected_match_revision:m.match_revision,expected_hole_revision:0,
   team_1_gross_scores:[4,4],team_2_gross_scores:[5,5]},
   {...runtime.authorization(),match_id:matchId,permission_revision:m.permission_revision},id);};
  const score=()=>runtime.execute(scoreRequest());
  const request=async()=>{const view=await stack.client(),command={action:'calculate',operationRequestId:randomUUID(),
   expectedContextToken:view.context.token,phase:'Pre-Tournament',iterations:10000};return{command,...await stack.client(command)};};
  const job=id=>JSON.parse(f.q(`select to_jsonb(j)from scoring_authority.odds_calculation_jobs j where job_id='${id}'`));
  const workerCommand=(operation,payload)=>({...f.envelope,phase:'WORKERS',operation_id:'ODDS.'+operation,
   operation_request_id:randomUUID(),expected_context_token:f.context('WORKERS').context_token,payload:{odds_operation:operation,...payload}});
  const publishCommand=async id=>{const view=await stack.client();return{action:'publish',operationRequestId:randomUUID(),
   expectedContextToken:view.context.token,jobId:id,confirmPublication:true,expectedPublicationRevision:view.publication.revision,
   expectedSnapshotId:view.publication.snapshotId};};
  const rpcPublish=(command)=>{const retained=job(command.jobId);return{...f.envelope,phase:'DIRECTOR',
   operation_id:'ODDS.publish_production_championship_odds_v1',operation_request_id:command.operationRequestId,
   expected_context_token:command.expectedContextToken,payload:{odds_operation:'publish_production_championship_odds_v1',job_id:command.jobId,
    expected_publication_revision:command.expectedPublicationRevision,expected_snapshot_id:command.expectedSnapshotId,
    milestone:retained.phase,expected_source_fingerprint:retained.source_revision.source_fingerprint,expected_result_fingerprint:retained.result_fingerprint}};};
  const check=async(name,fn)=>t.test(name,async()=>{await fn();evidence.cases.push({name,status:'PASS'});});
  await check('all three new helpers deny direct runtime roles and retain safe owner attributes',async()=>{
   const names=['certification_odds_pairing_structure_fingerprint_v1','lock_certification_odds_source_v1','assert_certification_odds_live_source_v1'];
   const functions=JSON.parse(f.q(`select jsonb_agg(jsonb_build_object('name',proname,'owner',pg_get_userbyid(proowner),
    'definer',prosecdef,'path',proconfig,'acl',proacl::text,'service',has_function_privilege('service_role',oid,'EXECUTE'),
    'anon',has_function_privilege('anon',oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',oid,'EXECUTE')))
    from pg_proc where pronamespace='production_control'::regnamespace and proname in(${names.map(n=>"'"+n+"'").join(',')})`));
   assert.equal(functions.length,3);for(const fn of functions){assert.equal(fn.owner,'postgres');assert.equal(fn.definer,true);
    assert.deepEqual(fn.path,['search_path=pg_catalog']);for(const role of['service','anon','authenticated'])assert.equal(fn[role],false);}
   for(const role of['anon','authenticated','service_role'])for(const call of[
    "certification_odds_pairing_structure_fingerprint_v1('2026')","lock_certification_odds_source_v1('2026','{}')",
    "assert_certification_odds_live_source_v1('2026','{}','{}')"]){assert.throws(()=>f.q(`set role ${role};select production_control.${call}`,role),/permission denied/);}
   evidence.privateFunctions=functions;
   evidence.installationEquivalence={fourBodyReversals:'ASSERTED_DURING_MIGRATION',legacyFingerprint:JSON.parse(f.q(`select
    jsonb_build_object('identity',oid::regprocedure::text,'owner',pg_get_userbyid(proowner),'acl',proacl::text,
     'path',proconfig,'definer',prosecdef,'volatility',provolatile,'bodyHash',encode(extensions.digest(prosrc,'sha256'),'hex'))
    from pg_proc where oid='production_control.annual_odds_pairing_fingerprint_v1(text)'::regprocedure`)),
    unchangedLegacyBodyAndAttributes:'ASSERTED_DURING_MIGRATION'};
  });
  let old;
  await check('actual score makes an old request fail while same committed operation remains recoverable',async()=>{
   old=await request();const captured=structuredClone(stack.calls.find(c=>c.input.operation_request_id===old.command.operationRequestId&&
    c.input.payload?.odds_operation==='request_production_odds_calculation_job').input);
   const before=job(old.jobId);score();
   assert.throws(()=>f.rpc('dispatch_certification_odds_v1',{...captured,operation_request_id:randomUUID()}),/ODDS_CALCULATION_SOURCE_ADVANCED/);
   const status=await stack.client({action:'status',originalAction:'calculate',operationRequestId:old.command.operationRequestId});
   assert.equal(status.state,'COMMITTED');assert.equal(status.receipt.jobId,old.jobId);
   assert.deepEqual(job(old.jobId).input_snapshot,before.input_snapshot);
  });
  await check('claim supersedes actual stale live input without publishing or losing receipt history',async()=>{
   const result=f.rpc('dispatch_certification_odds_v1',workerCommand('claim_production_odds_calculation_job',{job_id:old.jobId,worker_id:'freshness'}));
   assert.equal(result.code,'ODDS_CALCULATION_JOB_SUPERSEDED');assert.equal(job(old.jobId).status,'SUPERSEDED');
   assert.equal(f.q('select count(*)from scoring_authority.odds_published_snapshots'),'0');
  });
  await check('checkpoint rejects a source advance during real calculation execution',async()=>{
   const value=await request();await assert.rejects(stack.worker(value.jobId,{chunkIterations:1000,failureAt:'AFTER_CHECKPOINT'}),/./);
   const checkpoint=structuredClone(stack.calls.findLast(c=>c.input.payload?.odds_operation==='checkpoint_production_odds_calculation_job'&&c.input.payload.job_id===value.jobId).input);
   const before=job(value.jobId);score();
   assert.throws(()=>f.rpc('dispatch_certification_odds_v1',{...checkpoint,operation_request_id:randomUUID()}),/ODDS_CALCULATION_SOURCE_ADVANCED/);
   assert.equal(job(value.jobId).completed_iterations,before.completed_iterations);
  });
  await check('completed real result is superseded after live source advancement; calculation data stays immutable',async()=>{
   const value=await request();assert.equal((await stack.worker(value.jobId)).completed,true);
   const complete=structuredClone(stack.calls.findLast(c=>c.input.payload?.odds_operation==='complete_production_odds_calculation_job'&&c.input.payload.job_id===value.jobId).input);
   const before=job(value.jobId);score();
   const result=f.rpc('dispatch_certification_odds_v1',{...complete,operation_request_id:randomUUID()});
   assert.equal(result.code,'ODDS_CALCULATION_JOB_SUPERSEDED');const after=job(value.jobId);assert.equal(after.status,'SUPERSEDED');
   for(const key of['input_snapshot','result_payload','result_fingerprint','source_revision'])assert.deepEqual(after[key],before[key]);
  });
  await check('explicit publication rejects source advancement and commits no publication/audit receipt',async()=>{
   const value=await request();assert.equal((await stack.worker(value.jobId)).completed,true);const command=await publishCommand(value.jobId);
   score();await assert.rejects(stack.client(command));
   assert.ok(stack.calls.some(c=>c.input.operation_request_id===command.operationRequestId&&c.error?.message==='ODDS_CALCULATION_SOURCE_ADVANCED'));
   assert.equal(f.q(`select count(*)from production_control.certification_odds_receipts_v1 where operation_request_id='${command.operationRequestId}'`),'0');
   assert.equal(f.q('select count(*)from scoring_authority.odds_published_snapshots'),'0');
  });
  const waitBlocked=async pid=>{for(let i=0;i<80;i++){if(f.q(`select wait_event_type='Lock'from pg_stat_activity where pid=${pid}`)==='t')return;
   await delay(25);}assert.fail('Expected actual PostgreSQL lock wait');};
  await check('source writer first: publication waits then rejects the newly committed source',async()=>{
   const value=await request();assert.equal((await stack.worker(value.jobId)).completed,true);
   const command=rpcPublish(await publishCommand(value.jobId)),scoring=scoreRequest(),lease=f.rpc('admit_certification_operation_v1',scoring);
   const a=openSqlSession(f.cluster,f.database),b=openSqlSession(f.cluster,f.database);
   try{
    await a.query(`begin;set local role service_role;select public.execute_certification_operation_v1(${jsonLiteral({...scoring,ingress:{lease_id:lease.lease_id,admission_generation_id:lease.admission_generation_id}})});`);
    const pid=Number(await b.query('select pg_backend_pid()'));
    const publication=b.query(`set role service_role;select public.dispatch_certification_odds_v1(${jsonLiteral(command)})`);
    const rejected=assert.rejects(publication,/ODDS_CALCULATION_SOURCE_ADVANCED/);
    await waitBlocked(pid);await a.query('commit');await rejected;
    assert.equal(f.q('select count(*)from scoring_authority.odds_published_snapshots'),'0');
   }finally{await Promise.all([a.close(),b.close()]);}
  });
  await check('publication first: actual score cannot commit between source validation and publication commit',async()=>{
   const value=await request();assert.equal((await stack.worker(value.jobId)).completed,true);
   const command=rpcPublish(await publishCommand(value.jobId)),scoring=scoreRequest(),lease=f.rpc('admit_certification_operation_v1',scoring);
   const team=JSON.parse(f.q("select to_jsonb(t)from scoring_authority.teams t where tournament_id='2026'and team_side=1"));
   const captain=f.q(`select player_id from scoring_authority.tournament_players where tournament_id='2026'and team_id='${team.team_id}'and participation_status='ACTIVE'order by player_id limit 1`);
   const setupId=randomUUID(),setupPayload=buildTournamentSetupMutation('update-team',{expectedRevision:f.model().revision,
    operationRequestId:setupId,teamId:team.team_id,teamName:team.name+' changed',captainPlayerId:captain});
   delete setupPayload.operation_request_id;
   const structural=runtime.request('DIRECTOR.MUTATE_SETUP',{...setupPayload,action:'update-team'},runtime.authorization(),setupId);
   const structuralLease=f.rpc('admit_certification_operation_v1',structural);
   const a=openSqlSession(f.cluster,f.database),b=openSqlSession(f.cluster,f.database),c=openSqlSession(f.cluster,f.database);
   try{
    const published=JSON.parse(await a.query(`begin;set local role service_role;select public.dispatch_certification_odds_v1(${jsonLiteral(command)})`));
    assert.equal(published.ok,true);const pid=Number(await b.query('select pg_backend_pid()'));
    const written=b.query(`set role service_role;select public.execute_certification_operation_v1(${jsonLiteral({...scoring,ingress:{lease_id:lease.lease_id,admission_generation_id:lease.admission_generation_id}})})`);
    const structuralPid=Number(await c.query('select pg_backend_pid()'));
    const structuralWrite=c.query(`set role service_role;select public.execute_certification_operation_v1(${jsonLiteral({...structural,
     ingress:{lease_id:structuralLease.lease_id,admission_generation_id:structuralLease.admission_generation_id}})})`).then(JSON.parse,error=>({error:String(error)}));
    await waitBlocked(pid);await waitBlocked(structuralPid);assert.equal(f.q('select count(*)from scoring_authority.odds_published_snapshots'),'0');
    await a.query('commit');assert.equal(JSON.parse(await written).ok,true);
    const structuralResult=await structuralWrite;
    assert.match(JSON.stringify(structuralResult),/TOURNAMENT_SETUP_DEPENDENCY_BLOCKED/);
    assert.deepEqual(JSON.parse(f.q(`select to_jsonb(t)from scoring_authority.teams t where tournament_id='2026'and team_id='${team.team_id}'`)),team);
    evidence.structuralRace={operation:'UPDATE_TEAM',lockWaitObserved:true,outcome:'EXISTING_DEPENDENCY_DENIAL',canonicalTeamUnchanged:true,
     limitation:'READY/PUBLISHED Odds already prevents a legal structural mutation; no forbidden mutation was fabricated.'};
    const replay=f.rpc('dispatch_certification_odds_v1',command);assert.equal(replay.snapshot_id,published.snapshot_id);assert.equal(replay.idempotent,true);
    assert.equal(f.q('select count(*)from scoring_authority.odds_published_snapshots'),'1');
   }finally{await Promise.all([a.close(),b.close(),c.close()]);}
   const retained=job(value.jobId),snapshots=f.q('select jsonb_agg(to_jsonb(s)order by id)from scoring_authority.odds_published_snapshots s');
   const claim=f.rpc('dispatch_certification_odds_v1',workerCommand('claim_production_odds_calculation_job',{job_id:value.jobId,worker_id:'published-history'}));
   assert.equal(claim.completed,true);assert.equal(claim.deliver,false);
   const completed=structuredClone(stack.calls.findLast(c=>c.input.payload?.odds_operation==='complete_production_odds_calculation_job'&&c.input.payload.job_id===value.jobId).input);
   const repeated=f.rpc('dispatch_certification_odds_v1',{...completed,operation_request_id:randomUUID()});
   assert.equal(repeated.code,'ODDS_CALCULATION_RESULT_CONFLICT');
   const checkpoint=structuredClone(stack.calls.findLast(c=>c.input.payload?.odds_operation==='checkpoint_production_odds_calculation_job'&&c.input.payload.job_id===value.jobId).input);
   assert.throws(()=>f.rpc('dispatch_certification_odds_v1',{...checkpoint,operation_request_id:randomUUID()}),/ODDS_CALCULATION_SOURCE_ADVANCED/);
   assert.deepEqual(job(value.jobId),retained);
   assert.equal(f.q('select jsonb_agg(to_jsonb(s)order by id)from scoring_authority.odds_published_snapshots s'),snapshots);
   evidence.publishedHistory={claim:'COMPLETED_NO_DELIVERY',complete:'RESULT_CONFLICT',checkpoint:'SOURCE_ADVANCED',unchanged:true};
  });
  evidence.sourceAfter=await hashes();evidence.sourceStable=JSON.stringify(evidence.sourceAfter)===JSON.stringify(evidence.sourceBefore);
  assert.equal(evidence.sourceStable,true);evidence.result='PASS';
 }catch(error){evidence.result='FAIL';evidence.error=String(error.stack||error);throw error;}
 finally{destroyIsolatedCluster(f.cluster);await mkdir('docs/reliability/phase2d-resource-model/implementation-evidence',{recursive:true});
  await writeFile('docs/reliability/phase2d-resource-model/implementation-evidence/odds-two-part-freshness.json',JSON.stringify(evidence,null,2)+'\n');}
});
