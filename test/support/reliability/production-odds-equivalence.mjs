// Owned-socket Production-shaped compatibility proof. This does not connect to
// Production. All resource labels are inert fixture assertions; the transport
// is the already-created local PostgreSQL fixture and outbound access is denied.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {repositoryRoot} from './postgres17.mjs';
import {syntheticDirector} from './synthetic-tournament.mjs';
import {assertOddsDomainEquivalence,assertPublicOddsHasNoPrivateProvenance} from './odds-domain-equivalence.mjs';
import {loadProductionOddsCalculationInputs,requestProductionOddsCalculation,processProductionOddsCalculationJob} from '../../../lib/production-odds-calculation-server.js';
import {productionOddsCalculationScope} from '../../../lib/production-odds-calculation-contract.js';
import {normalizeProductionCurrentTournamentRuntime} from '../../../lib/production-current-tournament-runtime.js';
import {productionOddsPublicationRequestFingerprint,publishProductionOddsCalculation} from '../../../lib/production-odds-publication-server.js';

export async function runAdmittedProductionOdds({q,row,rpc,resource,scope}){
 const durations={},measure=async(name,fn)=>{const began=performance.now();try{return await fn();}finally{durations[name]={samples:1,milliseconds:performance.now()-began,p95:'NOT_PROVEN',p99:'NOT_PROVEN'};}};
 const activation=row("select to_jsonb(a)from production_control.cutover_activation_state a where scope_key='BAGGER_INV_PRODUCTION'");
 const vercelProjectId=activation.expected_vercel_project_id;
 assert.equal(vercelProjectId,'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU','Read exact project identity from admitted local fixture');
 const runtime=normalizeProductionCurrentTournamentRuntime(rpc('read_production_current_tournament_runtime_v1',{
  ...scope,contract_version:'production-current-tournament-runtime-v1',environment:'PRODUCTION',
  project_ref:resource.project_ref,project_url:resource.project_url,source_workbook_id:resource.google_workbook_id}));
 assert.equal(runtime.tournamentId,'2026');
 const runtimeContext={frozen2026:true,runtime,googleDestination:null};
 const env={VERCEL_ENV:'production',PRODUCTION_FOUNDATION_ENABLED:'true',PRODUCTION_CUTOVER_ACTIVATION_ENABLED:'true',
  PRODUCTION_SUPABASE_PROJECT_REF:resource.project_ref,PRODUCTION_SUPABASE_URL:resource.project_url,
  PRODUCTION_SUPABASE_SECRET_KEY:'LOCAL_ONLY_SYNTHETIC_CREDENTIAL_NEVER_SENT',
  PRODUCTION_CANONICAL_DOMAIN:'https://baggerinv.com',PRODUCTION_CUTOVER_TOURNAMENT_ID:'2026',PRODUCTION_CUTOVER_TOURNAMENT_YEAR:'2026',
  PRODUCTION_CUTOVER_EXPECTED_COMMIT_SHA:scope.deployment_commit,VERCEL_GIT_COMMIT_SHA:scope.deployment_commit,
  VERCEL_DEPLOYMENT_ID:scope.deployment_id,VERCEL_PROJECT_ID:vercelProjectId,VERCEL_PROJECT_NAME:'bagger-inv',
  PRODUCTION_CUTOVER_EXPECTED_VERCEL_PROJECT_ID:vercelProjectId,PRODUCTION_CUTOVER_PHASE:'SCORING_COMMIT',
  PRODUCTION_MAINTENANCE_DEPLOYMENT_CAPABILITY_CONTRACT:scope.deployment_capability_contract,
  PRODUCTION_MAINTENANCE_DEPLOYMENT_CAPABILITY_CEILING:scope.deployment_capability_ceiling,
  PRODUCTION_SUPABASE_DIRECTOR_AUTH_ENABLED:'true',PRODUCTION_SUPABASE_ADMIN_SESSION_REVALIDATION_ENABLED:'true',
  PRODUCTION_SUPABASE_ODDS_CALCULATION_ENABLED:'true',PRODUCTION_SUPABASE_WORKERS_ENABLED:'true',
  ODDS_PUBLICATION_AUTHORITY:'supabase',PRODUCTION_SUPABASE_ODDS_PUBLICATION_ENABLED:'true',
  PRODUCTION_SCORING_EXPECTED_AUTHORITY_EPOCH:activation.authority_generation_id};
 const calls=[];
 const transport=async(name,input)=>{
  assert.ok(/^(?:read|request|claim|checkpoint|complete|fail|publish|supersede)_production_/.test(name));
  const body=productionOddsCalculationScope(env,input,runtimeContext);calls.push(name);
  return{payload:rpc(name,body),durationMs:0};
 };
 const loadInputs=(target,options)=>loadProductionOddsCalculationInputs(target,{...options,
  runtimeContext,readInputs:()=>transport('read_production_odds_calculation_inputs',{})});
 const requestOptions={phase:'Pre-Tournament',iterations:10000,requestedBy:'Synthetic local Director',
  outputTimestamp:'2026-01-01T00:00:00.000Z',env,dependencies:{resolveRuntime:async()=>runtimeContext,loadInputs,
   requestJob:input=>transport('request_production_odds_calculation_job',input)}};
 const before=Number(q("select count(*)from scoring_authority.odds_calculation_jobs where tournament_id='2026'"));
 const requested=await measure('request',()=>requestProductionOddsCalculation(requestOptions)),jobId=requested.invocation.job_id;
 const replay=await measure('requestReplay',()=>requestProductionOddsCalculation(requestOptions));assert.equal(replay.invocation.job_id,jobId);
 assert.equal(Number(q("select count(*)from scoring_authority.odds_calculation_jobs where tournament_id='2026'")),before+1);
 const completed=await measure('worker10000',()=>processProductionOddsCalculationJob(jobId,{env,rpc:transport,runtimeContext,chunkIterations:1000}));
 assert.equal(completed.completed,true);
 const duplicate=await processProductionOddsCalculationJob(jobId,{env,rpc:transport,runtimeContext});
 assert.equal(duplicate.completed,true);assert.equal(duplicate.processed,false);
 const readJobs=()=>transport('read_production_odds_calculation_jobs',{job_id:jobId});
 const retained=(await readJobs()).payload.jobs[0];
 assert.equal(retained.status,'SUCCEEDED');assert.equal(retained.publication_status,'READY');
 assert.equal(retained.production_operation_mode,'PRODUCTION_CUTOVER');
 assert.equal(retained.source_revision.resource_class,undefined);
 const domain=await assertOddsDomainEquivalence({tournamentId:'2026',jobId,readJobs});
 assertPublicOddsHasNoPrivateProvenance(retained.result_payload);
 // The legacy Production 2026 contract requires an already-adopted publication.
 // This clean fixture does not pretend that historical adoption happened. The
 // unchanged first-publication rejection is a compatibility proof, not a
 // claimed positive Production publication/annual-transition certification.
 const unpublished=row("select to_jsonb(p)from scoring_authority.odds_publication_current p where tournament_id='2026'");
 assert.equal(unpublished.publication_state,'UNPUBLISHED');assert.equal(unpublished.publication_revision,0);
 assert.equal(unpublished.current_snapshot_id,null);assert.equal(unpublished.adoption_kind,null);
 assert.equal(q("select count(*)from scoring_authority.odds_published_snapshots where tournament_id='2026'"),'0');
 const publicationRequest={jobId,expectedPublicationRevision:0,expectedSnapshotId:null,
  expectedActivationRevision:Number(activation.activation_revision),expectedAuthorityEpochId:activation.authority_generation_id,
  actorAuthUserId:syntheticDirector.authUserId,actorPlayerId:syntheticDirector.playerId};
 publicationRequest.requestFingerprint=productionOddsPublicationRequestFingerprint({...publicationRequest,tournamentId:'2026'});
 let rejection;
 try{await measure('firstPublicationDenied',()=>publishProductionOddsCalculation({...publicationRequest,env,rpc:transport,runtimeContext}));}
 catch(error){rejection=String(error.message||error);}
 assert.match(rejection||'',/PRODUCTION_ODDS_PUBLICATION_INPUT_INVALID/);
 assert.deepEqual(row("select to_jsonb(p)from scoring_authority.odds_publication_current p where tournament_id='2026'"),unpublished);
 assert.equal(q("select count(*)from scoring_authority.odds_published_snapshots where tournament_id='2026'"),'0');
 assert.equal(q("select count(*)from scoring_authority.odds_google_mirror_jobs"),'0');
 assert.equal(q("select count(*)from production_control.certification_odds_receipts_v1"),'0');
 return{status:'PASS',scope:'LOCAL_PRODUCTION_CALCULATION_AND_UNCHANGED_FIRST_PUBLICATION_REJECTION',
  jobId,phase:retained.phase,iterations:retained.total_iterations,checkpointCount:retained.checkpoint_count,
  deterministicRequestReplay:true,duplicateWorkerDelivery:true,domain,
  publication:{positive:'NOT_PROVEN',firstPublicationWithoutHistoricalAdoption:'DENIED',
   code:'PRODUCTION_ODDS_PUBLICATION_INPUT_INVALID',historicalAdoptionFabricated:false},
  rpcCalls:calls.length,googleCalls:0,googleJobs:0,productionAccess:false,guardsReplaced:false,
  timings:{environment:'LOCAL_NON_PRODUCTION',method:'performance.now including owned psql transport and canonical engine',durations},
  limitation:'Protected Production2026 positive publication and successor annual activation need legitimate retained historical adoption; none is manufactured.'};
}

export async function runProductionOddsGolden(options){
 // Reuse only the existing reviewed initial owner-input fixture block. Stop
 // before annual creation/scoring so this focused proof cannot create fake
 // predecessor closure, FinalRecap, or successor authority.
 let source=await readFile(repositoryRoot+'/test/support/reliability/production-annual-golden.mjs','utf8');
 source=source.replace(/from '([^']+)'/g,(_all,relative)=>'from '+JSON.stringify(new URL(relative,pathToFileURL(repositoryRoot+'/test/support/reliability/production-annual-golden.mjs')).href));
 // The protected predecessor fixture already retains a synthetic revision1.
 // Append normalized initial input for this proof; preserve that predecessor
 // row instead of deleting history or weakening its unique revision contract.
 const fixtureStart="  const fixture={q:sql=>q(sql.replaceAll(";
 assert.equal(source.split(fixtureStart).length,2);
 source=source.replace(fixtureStart,`  const appendSyntheticInput=sql=>{
   if(!sql.startsWith('insert into scoring_authority.odds_input_configurations'))return q(sql);
   const revision=Number(q("select coalesce(max(configuration_revision),0)+1 from scoring_authority.odds_input_configurations where tournament_id='2026'"));
   assert.equal(sql.split("'2026',1,").length,2);
   return q("begin;update scoring_authority.odds_input_configurations set is_current=false where tournament_id='2026'and is_current;"+
    sql.replace("'2026',1,","'2026',"+revision+",")+";commit;");
  };
  const fixture={q:sql=>appendSyntheticInput(sql.replaceAll(`);
 // This focused initial-input fixture intentionally appends normalized Odds
 // input. Annual setup itself preserves the pre-existing admitted configuration.
 // Keep every predecessor field except its explicit current-pointer disposition,
 // and verify resource/capability bindings are untouched.
 const inputStart='  const initialOdds=q(';
 const inputEnd='  delete evidence.initialInputs.source;';
 const inputOffset=source.indexOf(inputStart),inputEndOffset=source.indexOf(inputEnd,inputOffset);
 assert.ok(inputOffset>0&&inputEndOffset>inputOffset);
 source=source.slice(0,inputOffset)+`
  const priorOdds=row("select jsonb_agg(to_jsonb(c)order by configuration_revision)from scoring_authority.odds_input_configurations c where tournament_id='2026'");
  const capabilityBefore=q("select coalesce(jsonb_agg(to_jsonb(b)order by capability_binding_id),'[]'::jsonb)from production_control.maintenance_deployment_capability_bindings b");
  evidence.initialInputs=provisionAnnualSyntheticAuthority(fixture,{initializeOddsConfiguration:true});
  const afterOdds=row("select jsonb_agg(to_jsonb(c)order by configuration_revision)from scoring_authority.odds_input_configurations c where tournament_id='2026'");
  const priorIds=new Set(priorOdds.map(value=>value.id));
  assert.deepEqual(afterOdds.filter(value=>priorIds.has(value.id)),priorOdds.map(value=>({...value,is_current:false})),
   'Preserve every predecessor configuration fact while the declared synthetic input becomes current');
  assert.equal(afterOdds.length,priorOdds.length+1);assert.equal(afterOdds.filter(value=>value.is_current).length,1);
  assert.equal(afterOdds.at(-1).configuration_revision,Math.max(...priorOdds.map(value=>value.configuration_revision))+1);
  assert.deepEqual(row("select to_jsonb(r)from production_control.resource_scope r where scope_key='BAGGER_INV_PRODUCTION'"),resource);
  assert.equal(q("select coalesce(jsonb_agg(to_jsonb(b)order by capability_binding_id),'[]'::jsonb)from production_control.maintenance_deployment_capability_bindings b"),capabilityBefore);
  evidence.initialInputDisposition={normalizedSyntheticAppend:true,predecessorsPreserved:priorOdds.length,resourceAndCapabilityPreserved:true};
`+source.slice(inputEndOffset);
 const cut='  const current=()=>row(';
 const start=source.indexOf(cut),catchStart=source.indexOf(' }catch(error){',start);
 assert.ok(start>0&&catchStart>start);
 source=source.slice(0,start)+`  evidence.odds=await runAdmittedProductionOdds({q,row,rpc,resource,scope});
  evidence.status='PASS';await checkpoint();return evidence;\n`+source.slice(catchStart);
 source=`import {runAdmittedProductionOdds} from ${JSON.stringify(import.meta.url)};\n`+source;
 source=source.replaceAll('/private/tmp/r2-production-annual-progress.json','/private/tmp/r2-production-odds-progress.json');
 const {runProductionAnnualGolden}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 return runProductionAnnualGolden(options);
}
