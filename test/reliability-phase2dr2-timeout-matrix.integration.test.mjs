// Real local PostgreSQL cancellation, never a synthetic success/result or
// altered authority. Fault triggers and locks exist only in the owned fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {createCertificationFixture} from './support/reliability/phase2d-certification-fixture.mjs';
import {certificationProvisionalProfile} from './support/reliability/certification-provisional-profile.mjs';
import {certificationTransportRegistration} from './support/reliability/certification-ingress-js-proof.mjs';
import {provisionAnnualSyntheticAuthority} from './support/reliability/certification-annual-transition-fixture.mjs';
import {drainCertificationAutomaticWorkers} from './support/reliability/certification-worker-proof.mjs';
import {destroyIsolatedCluster,jsonLiteral,sqlResult,openSqlSession} from './support/reliability/postgres17.mjs';
import {buildTournamentSetupMutation} from '../lib/production-tournament-setup-contract.js';
import {readCanonicalDirectorOdds,mutateCanonicalDirectorOdds} from '../lib/canonical-director-odds.js';
import {processCertificationOddsCalculationJob} from '../lib/certification-odds-server.js';
import {syntheticActor} from './support/reliability/synthetic-tournament.mjs';

const self='test/reliability-phase2dr2-timeout-matrix.integration.test.mjs';
const tree=directory=>readdirSync(directory,{withFileTypes:true}).flatMap(e=>e.isDirectory()?tree(directory+'/'+e.name):/\.(js|mjs|cjs)$/.test(e.name)?[directory+'/'+e.name]:[]);
const manifest=()=>Object.fromEntries([...new Set([self,...certificationProvisionalProfile,...tree('lib'),...tree('test/support/reliability'),
 'tools/reliability/phase2dr2-proof-isolation.cjs'])].sort().map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
const TIMEOUT_MS=150;

test('Certification finite statement-timeout matrix preserves durable unknown outcomes and atomic recovery',async t=>{
 const hashes=manifest(),evidence={startedAt:new Date().toISOString(),environment:'OWNED_LOCAL_POSTGRESQL17',statementTimeoutMs:TIMEOUT_MS,
  cases:[],cancellations:[],googleCalls:0,networkCalls:0};let f;
 const run=async(id,body)=>{let failed;await t.test(id,async()=>{try{const details=await body();evidence.cases.push({id,status:'PASS',details});}
  catch(error){failed=error;evidence.cases.push({id,status:'FAIL',error:error.message,code:error.code||null});throw error;}});if(failed)throw failed;};
 try{
  f=await createCertificationFixture({forwardMigrations:certificationProvisionalProfile,registrationFactory:certificationTransportRegistration});
  provisionAnnualSyntheticAuthority(f);
  const state=()=>f.q(`select jsonb_build_object(
   'tournaments',(select jsonb_agg(to_jsonb(x)order by tournament_id)from scoring_authority.tournaments x),
   'matches',(select jsonb_agg(to_jsonb(x)order by match_id)from scoring_authority.matches x),
   'holeScores',(select jsonb_agg(to_jsonb(x)order by match_id,hole_number)from scoring_authority.hole_scores x),
   'scoreReceipts',(select jsonb_agg(to_jsonb(x)order by match_id,mutation_key)from scoring_authority.score_mutations x),
   'leases',(select jsonb_agg(to_jsonb(x)order by lease_id)from production_control.certification_ingress_leases_v1 x),
   'setupReceipts',(select jsonb_agg(to_jsonb(x)order by operation_request_id)from production_control.tournament_setup_operation_receipts_v1 x),
   'audit',(select jsonb_agg(to_jsonb(x)order by event_id)from production_control.operation_audit_events x),
   'jobs',(select jsonb_agg(to_jsonb(x)order by job_id)from scoring_authority.odds_calculation_jobs x),
   'oddsReceipts',(select jsonb_agg(to_jsonb(x)order by operation_request_id)from production_control.certification_odds_receipts_v1 x),
   'snapshots',(select jsonb_agg(to_jsonb(x)order by id)from scoring_authority.odds_published_snapshots x),
   'publication',(select jsonb_agg(to_jsonb(x)order by tournament_id)from scoring_authority.odds_publication_current x))`);
  const invoke=(name,input,{timeout=false}={})=>{
   const before=timeout?state():null,started=performance.now();
   const result=sqlResult(f.cluster,f.database,`\\set VERBOSITY verbose\nset statement_timeout='${timeout?TIMEOUT_MS:5000}ms';
    set role service_role;select public.${name}(${jsonLiteral(input)});`,{role:'service_role'});
   if(result.status!==0){
    const match=/ERROR:\s+([0-9A-Z]{5}):\s*([^\n]+)/.exec(result.stderr);assert.ok(match,'Typed SQL error required');
    const error=Object.assign(new Error(match[2]),{code:match[1]});
    if(timeout){assert.equal(error.code,'57014',error.message);assert.equal(state(),before,'Cancelled RPC must roll back every observed canonical/audit/publication row');
     evidence.cancellations.push({rpc:name,operation:input.operation_id||null,sqlstate:error.code,durationMs:performance.now()-started,canonicalStateUnchanged:true});}
    throw error;
   }
   if(timeout)assert.fail('Faulted RPC unexpectedly succeeded without57014');
   return JSON.parse(result.stdout.trim());
  };
  const fault=(table,event,condition='true')=>{
   f.q(`create function public.r2_timeout_fault()returns trigger language plpgsql as $$begin if ${condition} then perform pg_sleep(1);end if;return new;end$$;
    create trigger r2_timeout_fault before ${event} on ${table} for each row execute function public.r2_timeout_fault()`);
   return()=>f.q(`drop trigger r2_timeout_fault on ${table};drop function public.r2_timeout_fault()`);
  };
  const setup=()=>{const id=randomUUID(),payload=buildTournamentSetupMutation('update-tournament',{operationRequestId:id,expectedRevision:f.model().revision,
   name:'Synthetic timeout '+id.slice(0,8),destination:'Synthetic course',startDate:'2026-09-20',endDate:'2026-09-22',timeZone:'America/Chicago',operationalStatus:'UPCOMING'});
   delete payload.operation_request_id;return f.command('DIRECTOR.MUTATE_SETUP',{...payload,action:'update-tournament'},{operation_request_id:id});};
  const admitted=input=>invoke('admit_certification_operation_v1',input);
  const execution=(input,lease)=>({...input,ingress:{lease_id:lease.lease_id,admission_generation_id:lease.admission_generation_id}});
  const status=input=>invoke('read_certification_ingress_status_v1',input);
  const execute=input=>{const lease=admitted(input);return invoke('execute_certification_operation_v1',execution(input,lease));};
  await run('admission timeout leaves no lease or audit; same operation admits once and commits',()=>{
   const input=setup(),clear=fault('production_control.operation_audit_events','insert',"new.event_type='CERTIFICATION_INGRESS_ADMITTED'");
   try{assert.throws(()=>invoke('admit_certification_operation_v1',input,{timeout:true}),e=>e.code==='57014');}finally{clear();}
   assert.equal(status(input).state,'UNKNOWN');assert.equal(status(input).lease_id,null);
   const lease=admitted(input);assert.deepEqual(admitted(input),lease);
   assert.equal(invoke('execute_certification_operation_v1',execution(input,lease)).ok,true);assert.equal(status(input).state,'COMMITTED');
   return{sameIdentity:true,noFalseNonCommit:true,terminal:'COMMITTED'};
  });
  for(const [label,table,event,condition]of[
   ['execution','production_control.tournament_setup_operation_receipts_v1','insert','true'],
   ['terminal audit','production_control.operation_audit_events','insert',"new.event_type='CERTIFICATION_INGRESS_TERMINAL'"]]){
   await run(label+' timeout rolls back domain mutation; same admitted identity retries safely',()=>{
    const input=setup(),lease=admitted(input),clear=fault(table,event,condition);
    try{assert.throws(()=>invoke('execute_certification_operation_v1',execution(input,lease),{timeout:true}),e=>e.code==='57014');}finally{clear();}
    assert.equal(status(input).state,'ADMITTED');invoke('mark_certification_ingress_unknown_v1',input);assert.equal(status(input).state,'UNKNOWN');
    const committed=invoke('execute_certification_operation_v1',execution(input,lease));assert.equal(committed.ok,true);
    assert.deepEqual(invoke('execute_certification_operation_v1',execution(input,lease)),committed);assert.equal(status(input).state,'COMMITTED');
    return{sameLease:true,noPartialReceiptOrAudit:true,terminal:'COMMITTED'};
   });
  }
  await run('explicit resolution timeout preserves UNKNOWN; retry fences delayed execution',()=>{
   const input=setup(),lease=admitted(input);invoke('mark_certification_ingress_unknown_v1',input);
   const clear=fault('production_control.operation_audit_events','insert',"new.event_type='CERTIFICATION_INGRESS_RESOLVED'");
   try{assert.throws(()=>invoke('resolve_certification_ingress_v1',input,{timeout:true}),e=>e.code==='57014');}finally{clear();}
   assert.equal(status(input).state,'UNKNOWN');const resolved=invoke('resolve_certification_ingress_v1',input);assert.equal(resolved.state,'NOT_COMMITTED');
   assert.deepEqual(invoke('execute_certification_operation_v1',execution(input,lease)),resolved.result);
   return{sameIdentity:true,explicitTerminal:'NOT_COMMITTED',delayedExecutionFenced:true};
  });
  let score;
  await run('canonical score execution timeout after terminal audit rolls back score receipt and match state; same lease retries',async()=>{
   const matchId='2026-R1-6',match=()=>JSON.parse(f.q(`select to_jsonb(m)from scoring_authority.matches m where match_id='${matchId}'`));
   const id=randomUUID(),payload=buildTournamentSetupMutation('prepare-scoring-context',{operationRequestId:id,expectedRevision:f.model().revision,matchId});delete payload.operation_request_id;
   assert.equal(execute(f.command('DIRECTOR.MUTATE_SETUP',{...payload,action:'prepare-scoring-context'},{operation_request_id:id})).ok,true);
   for(const action of['mark-live','access-activate'])assert.equal(execute(f.command('DIRECTOR.MATCH_CONTROL',{action,match_id:matchId,
    expected_match_revision:match().match_revision,expected_permission_revision:match().permission_revision})).ok,true);
   score=f.command('SCORING.SUBMIT_HOLE',{match_id:matchId,mutation_key:'r2:timeout.score',hole_number:1,
    expected_match_revision:match().match_revision,expected_hole_revision:0,team_1_gross_scores:[4,4],team_2_gross_scores:[5,5]},
    {operation_request_id:'r2:timeout.score',authorization:{tournament_id:'2026',role:'PLAYER',auth_user_id:syntheticActor.authUserId,
     player_id:syntheticActor.playerId,match_id:matchId,permission_revision:match().permission_revision}});
   const lease=admitted(score),intentsBefore=f.q('select jsonb_agg(to_jsonb(i)order by intent_id)from scoring_authority.score_derived_intents_v1 i');
   const clear=fault('production_control.operation_audit_events','insert',"new.event_type='CERTIFICATION_INGRESS_TERMINAL'");
   try{assert.throws(()=>invoke('execute_certification_operation_v1',execution(score,lease),{timeout:true}),e=>e.code==='57014');}finally{clear();}
   assert.equal(f.q('select jsonb_agg(to_jsonb(i)order by intent_id)from scoring_authority.score_derived_intents_v1 i'),intentsBefore);
   assert.equal(status(score).state,'ADMITTED');invoke('mark_certification_ingress_unknown_v1',score);assert.equal(status(score).state,'UNKNOWN');
   const result=invoke('execute_certification_operation_v1',execution(score,lease));assert.equal(result.ok,true);
   assert.deepEqual(invoke('execute_certification_operation_v1',execution(score,lease)),result);
   assert.equal(status(score).state,'COMMITTED');assert.equal(f.q('select count(*)from scoring_authority.hole_scores'),'1');
   return{operation:'SCORING.SUBMIT_HOLE',sameLease:true,scoreMatchReceiptAuditIntentsRollback:true,terminal:'COMMITTED'};
  });
  await run('required derived delivery timeout cannot roll back score; existing worker drains after lock release',async()=>{
   const before=f.q('select jsonb_agg(to_jsonb(i)order by intent_id)from scoring_authority.score_derived_intents_v1 i');
   const lock=openSqlSession(f.cluster,f.database);
   try{await lock.query('begin;lock table scoring_authority.score_derived_intents_v1 in access exclusive mode');
    assert.throws(()=>invoke('execute_certification_operation_v1',f.command('WORKERS.DELIVERY_TICK',{worker_id:'timeout-worker',materialization_family:'COMPETITION'}),{timeout:true}),e=>e.code==='57014');
   }finally{try{await lock.query('rollback');}catch{}await lock.close();}
   assert.equal(f.q('select jsonb_agg(to_jsonb(i)order by intent_id)from scoring_authority.score_derived_intents_v1 i'),before);
   assert.equal(status(score).state,'COMMITTED');const drained=await drainCertificationAutomaticWorkers(f);
   assert.equal(drained.requiredAutomaticWork,0);return{scoreCommitted:true,requiredAutomaticWork:0,googleCalls:0};
  });
  const identity=f.envelope.authorization,authorization={status:'active',source:'entitlement',identity:{authUserId:identity.auth_user_id,
   actor:{id:identity.player_id,role:'DIRECTOR'},tournamentId:'2026'}};
  const {env,registrationManifest}=f.transportFixture;let timedOperation=null;
  const dependencies={registrationManifest,fetchImpl:async(url,init)=>{
   const target=new URL(url),name=target.pathname.split('/').at(-1);assert.equal(target.origin,f.resource.project_url);
   assert.ok(['read_certification_runtime_context_v1','dispatch_certification_odds_v1','read_certification_odds_operation_v1'].includes(name));
   assert.equal(init.redirect,'error');const input=JSON.parse(init.body).input;
   try{return Response.json(invoke(name,input,{timeout:input.operation_id===timedOperation}));}
   catch(error){return Response.json({code:error.code,message:error.message},{status:400});}
  }};
  const read=()=>readCanonicalDirectorOdds({authorization,env},{certificationDependencies:dependencies});
  const mutate=input=>mutateCanonicalDirectorOdds({authorization,env,input},{certificationDependencies:dependencies});
  let publishJob;
  for(const[stage,operation,condition,iterations]of[
   ['claim','claim_production_odds_calculation_job',"new.status='RUNNING'and old.status<>'RUNNING'",10000],
   ['checkpoint','checkpoint_production_odds_calculation_job','new.completed_iterations>old.completed_iterations',25000],
   ['completion','complete_production_odds_calculation_job',"new.status='SUCCEEDED'and old.status<>'SUCCEEDED'",50000]]){
   await run('Odds '+stage+' timeout rolls back its transaction; same job resumes through real engine',async()=>{
    const view=await read(),request={action:'calculate',operationRequestId:randomUUID(),expectedContextToken:view.context.token,phase:'Pre-Tournament',iterations};
    const requested=await mutate(request),clear=fault('scoring_authority.odds_calculation_jobs','update',condition),count=evidence.cancellations.length;
    timedOperation='ODDS.'+operation;
    try{await assert.rejects(processCertificationOddsCalculationJob(requested.jobId,{env,dependencies}));}finally{clear();timedOperation=null;}
    assert.equal(evidence.cancellations.length,count+1);
    assert.equal(f.q('select count(*)from scoring_authority.odds_published_snapshots'),'0');
    const recovery=await mutate({action:'status',originalAction:'calculate',operationRequestId:request.operationRequestId});
    assert.equal(recovery.state,'COMMITTED');assert.equal(recovery.receipt.jobId,requested.jobId);
    const completed=await processCertificationOddsCalculationJob(requested.jobId,{env,dependencies});assert.equal(completed.completed,true);
    assert.equal(f.q(`select status from scoring_authority.odds_calculation_jobs where job_id='${requested.jobId}'`),'SUCCEEDED');
    publishJob=requested.jobId;return{sameJob:true,requestReceiptRecovered:true,realEngine:true,publicationCreated:false};
   });
  }
  await run('owner publication timeout rolls back snapshot pointer receipt and audit; same operation retries once',async()=>{
   const view=await read(),input={action:'publish',operationRequestId:randomUUID(),expectedContextToken:view.context.token,jobId:publishJob,
    confirmPublication:true,expectedPublicationRevision:view.publication.revision,expectedSnapshotId:view.publication.snapshotId};
   const clear=fault('production_control.operation_audit_events','insert',"new.event_type='CERTIFICATION_ODDS_OPERATION_COMMITTED'"),count=evidence.cancellations.length;
   timedOperation='ODDS.publish_production_championship_odds_v1';
   try{await assert.rejects(mutate(input));}finally{clear();timedOperation=null;}
   assert.equal(evidence.cancellations.length,count+1);assert.equal(f.q('select count(*)from scoring_authority.odds_published_snapshots'),'0');
   assert.equal((await mutate({action:'status',originalAction:'publish',operationRequestId:input.operationRequestId})).state,'UNKNOWN');
   const publication=await mutate(input);assert.equal(publication.publicationCreated,true);
   const replay=await mutate(input);assert.equal(replay.snapshotId,publication.snapshotId);assert.equal(replay.duplicate,true);
   assert.equal((await mutate({action:'status',originalAction:'publish',operationRequestId:input.operationRequestId})).state,'COMMITTED');
   assert.equal(f.q('select count(*)from scoring_authority.odds_published_snapshots'),'1');return{sameOperation:true,noPartialPublication:true,explicitOwnerOnly:true};
  });
 }finally{
  evidence.completedAt=new Date().toISOString();evidence.sourceManifest=hashes;evidence.sourceStable=JSON.stringify(hashes)===JSON.stringify(manifest());
  evidence.limitations=['Local PostgreSQL statement cancellation and in-process shipping server/engine; no hosted HTTP timeout proof',
   'Statement timeout does not bound JavaScript CPU calculation; calculation persistence checkpoint/completion is exercised',
   'No sleep/time manipulation of authority, lease expiry, retry readiness or canonical history; trigger sleeps inject transaction stalls only'];
  const directory='docs/reliability/phase2d-resource-model/implementation-evidence';mkdirSync(directory,{recursive:true});
  writeFileSync(directory+'/finite-timeout-matrix-'+evidence.startedAt.replaceAll(':','-')+'.json',JSON.stringify(evidence,null,2)+'\n');
  if(f)await destroyIsolatedCluster(f.cluster);
 }
 assert.equal(evidence.sourceStable,true);
});
