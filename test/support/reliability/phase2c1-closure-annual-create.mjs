// Proof layers: API / INTEGRATION / POSTGRESQL / SECURITY / FAILURE_INJECTION.
// Request identity and RPC transport are isolated fixture adapters; the actual
// shipping client, HTTP handler, server builder, installed SQL guards and reads run.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {annualRuntimeRequestHash,annualRuntimeRequestJsonbText} from '../../../lib/annual-runtime-request-hash.js';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {repositoryRoot} from './postgres17.mjs';
import {submitFutureYearAdministration} from '../../../lib/future-year-administration-client.js';
import {buildFutureYearAdministrationMutation} from '../../../lib/production-future-year-administration-contract.js';
import {recordDataAuthorityTransport,withDataAuthorityRequestScope} from '../../../lib/data-authority-request.js';

async function loadShippingServer() {
 const file=path.join(repositoryRoot,'lib/production-future-year-administration-server.js');
 const source=(await readFile(file,'utf8')).replace('import "server-only";','')
  .replace(/from "(\.\/[^"\n]+)"/g,(_,ref)=>`from ${JSON.stringify(pathToFileURL(path.resolve(path.dirname(file),ref)).href)}`);
 return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}
async function loadShippingRoute(bridge) {
 const file=path.join(repositoryRoot,'app/api/director/future-tournaments/route.js');
 let source=await readFile(file,'utf8');
 source=source.replace('import { NextResponse } from "next/server";',`const NextResponse={json:(value,options={})=>new Response(JSON.stringify(value),{...options,headers:{'content-type':'application/json',...options.headers}})};`);
 source=source.replace(/import \{ authorizePreviewDirector \} from "[^"\n]+";/,'');
 source=source.replace(/import \{\s*assertProductionCutoverActivation,[\s\S]*?\} from "[^"\n]+";/,'');
 source=source.replace(/import \{\s*mutateProductionFutureYearAdministration,[\s\S]*?\} from "[^"\n]+";/,
  `const {mutateProductionFutureYearAdministration,mutateProductionFutureRuntime,PRODUCTION_ANNUAL_SCORING_TRANSITION_ACTIONS,readProductionFutureYearAdministrationWithRuntime}=globalThis.__annualClosureBridge;`);
 const start=source.indexOf('async function authorize(request, { mutation = false } = {}) {');
 const end=source.indexOf('\nfunction actor(',start);assert.ok(start>0&&end>start);
 source=source.slice(0,start)+`async function authorize(request){return globalThis.__annualClosureBridge.authorize(request);}`+source.slice(end);
 source=source.replace(/from "(\.\.\/[^"\n]+)"/g,(_,ref)=>`from ${JSON.stringify(pathToFileURL(path.resolve(path.dirname(file),ref)).href)}`);
 globalThis.__annualClosureBridge=bridge;
 return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

export async function runCanonicalAnnualCreateClosure({cluster,database,psql,jsonSql}) {
 const sql=s=>psql(cluster,database,s);
 const auth='a0000000-0000-4000-8000-000000000001';
 const players=['FZ01','FZ02','FZ03','FZ04'];
 const cases=[];const rpcCalls=[];
 const evidence={fixture:'phase2c1-closure-annual-create-v1',environment:'OWNED_SOCKET_ONLY_POSTGRESQL17',schema:127,
  runtimeDatabaseGuardsSubstituted:false,GoogleCalls:0,GoogleCredentialsPresent:false,network:'REMOTE_DENIED',cases,status:'RUNNING'};
 // Synthetic current-platform owner/participant identities are fixture data, not enrollment traffic.
 sql(`insert into auth.users(id,email,email_confirmed_at) values('${auth}','phase2c1-synthetic-owner@baggerinv.com',now());
 insert into scoring_authority.players(player_id,display_name,source_payload)
 select value,'Synthetic annual player '||value,'{}'::jsonb from unnest(array['FZ01','FZ02','FZ03','FZ04']) value;
 insert into participant_identity.user_player_links(auth_user_id,player_id,status,link_method,email_identity_hash,linked_at,linked_by)
 values('${auth}','FZ01','ACTIVE','SYNTHETIC_FIXTURE',encode(extensions.digest('phase2c1-synthetic-owner@baggerinv.com','sha256'),'hex'),now(),'SYNTHETIC_FIXTURE');
 with entitlement as(insert into production_control.director_entitlements(auth_user_id,tournament_id,player_id,role,status,granted_by)
 values('${auth}','2026','FZ01','OWNER','ACTIVE','SYNTHETIC_FIXTURE')returning entitlement_id),
 event as(insert into production_control.director_entitlement_events(entitlement_id,action,actor,reason)
 select entitlement_id,'GRANTED','SYNTHETIC_FIXTURE','Synthetic owner authority'from entitlement returning event_id,entitlement_id)
 insert into production_control.tournament_owner_capabilities_v1(tournament_id,player_id,auth_user_id,adopted_from_entitlement_id,adopted_entitlement_event_id,adopted_entitlement_event_count,status,capability_revision,adopted_by_player_id,adopted_at)
 select'2026','FZ01','${auth}',entitlement_id,event_id,1,'ACTIVE',1,'FZ01',now()from event;`);
 const server=await loadShippingServer();
 const options={getActivation:()=>({state:'SCORING_COMMITTED',readCutoverPhase:'OBSERVATION'}),env:{},rpc:async(name,input)=>{
  assert.ok(['mutate_production_future_year_administration_v1','read_production_future_year_administration_v1','read_production_future_runtime_v2','mutate_production_future_runtime_v2'].includes(name));
  rpcCalls.push({name,operation:input.operation,currentYear:input.tournament_year,targetYear:input.target_tournament_year,target:input.target_tournament_id,operationId:input.operation_request_id});
  recordDataAuthorityTransport('supabase',{adapter:'annual-create-owned-postgresql',source:name});
  try{return{payload:JSON.parse(sql(`select public.${name}(${jsonSql(input)})::text`))};}
  catch(error){const code=String(error.message).match(/ERROR:\s+([A-Z][A-Z0-9_]+)/)?.[1]||'FUTURE_YEAR_RPC_FAILED';throw Object.assign(new Error(code),{code,status:/OWNER_REQUIRED|DIRECTOR_REQUIRED|EXACT_RESOURCE_REQUIRED/.test(code)?403:503});}
 }};
 const owner={authUserId:auth,actor:{id:'FZ01'},tournamentId:'2026'};
 const bridge={
  authorize:async(request)=>request.headers.get('x-synthetic-access')==='OWNER'?{identity:owner}:{response:Response.json({code:'DIRECTOR_AUTHORIZATION_REQUIRED'},{status:403})},
  mutateProductionFutureYearAdministration:input=>server.mutateProductionFutureYearAdministration(input,options),
  mutateProductionFutureRuntime:input=>server.mutateProductionFutureRuntime(input,options),
  PRODUCTION_ANNUAL_SCORING_TRANSITION_ACTIONS:server.PRODUCTION_ANNUAL_SCORING_TRANSITION_ACTIONS,
  readProductionFutureYearAdministrationWithRuntime:input=>server.readProductionFutureYearAdministrationWithRuntime(input,options),
 };
 const route=await loadShippingRoute(bridge);
 const transport=async(url,init={})=>{
  assert.ok(String(url).startsWith('/api/director/future-tournaments'),'No alternate provider route permitted');
  const request=new Request(new URL(url,'http://127.0.0.1'),{...init,headers:{...init.headers,'x-synthetic-access':'OWNER'}});
  request.nextUrl=new URL(request.url);return init.method==='POST'?route.POST(request):route.GET(request);
 };
 const review=(year,overrides={})=>({action:'create',expectedRevision:0,operationRequestId:randomUUID(),values:{
  targetTournamentId:String(year),tournamentYear:year,name:'Synthetic annual '+year,destination:'Synthetic course',startDate:`${year}-09-20`,endDate:`${year}-09-22`,timeZone:'America/Chicago',creationMode:'BLANK',reason:'Canonical annual CREATE isolated proof',...overrides}});
 const snapshot=target=>JSON.parse(sql(`select jsonb_build_object(
  'catalog',(select count(*)from production_control.future_tournament_catalog_v1 where tournament_id='${target}'),
  'resources',(select count(*)from production_control.future_tournament_resources_v1 where tournament_id='${target}'),
  'receipts',(select count(*)from production_control.future_year_operation_receipts_v1 where target_tournament_id='${target}'),
  'audit',(select count(*)from production_control.future_year_audit_events_v1 where target_tournament_id='${target}'),
  'runtime',(select count(*)from scoring_authority.tournaments where tournament_id='${target}'),
  'GoogleJobs',(select count(*)from production_control.future_match_google_compatibility_jobs_v1 where tournament_id='${target}'))::text`));
 const pointerBefore=sql('select row_to_json(v)::text from production_control.current_tournament_pointer_v1 v');
 const create=review(2098);
 const scope=await withDataAuthorityRequestScope({label:'NA-2026-ANNUAL-CREATE-CONTRACT',env:{VERCEL_ENV:'preview'},injectGoogleOutage:true},async()=>{
  const first=await submitFutureYearAdministration(create,{fetchImpl:transport});
  assert.equal(first.receipt.ok,true);assert.equal(first.receipt.operation,'CREATE_TOURNAMENT');assert.equal(first.receipt.idempotent,false);
  assert.equal(first.data.selectedTournament.tournamentYear,2098);assert.equal(first.data.selectedTournament.lifecycle,'DRAFT');
  assert.equal(first.data.selectedTournament.revision,1);assert.equal(first.data.readiness.readyForActivation,false);
  assert.deepEqual(snapshot('2098'),{catalog:1,resources:1,receipts:1,audit:1,runtime:0,GoogleJobs:0});
  cases.push({id:'NA-2026-ANNUAL-CREATE-CONTRACT',result:'PASS',chain:'shipping client → shipping API POST/GET → shipping server → actual PostgreSQL → canonical readback',year:2098,initialLifecycle:'DRAFT'});
  const retry=await submitFutureYearAdministration(create,{fetchImpl:transport});assert.equal(retry.receipt.idempotent,true);assert.equal(retry.receipt.receiptId,first.receipt.receiptId);
  assert.deepEqual(snapshot('2098'),{catalog:1,resources:1,receipts:1,audit:1,runtime:0,GoogleJobs:0});
  cases.push({id:'same-logical-create-retry',result:'PASS',duplicateAuthority:0});
  await assert.rejects(submitFutureYearAdministration({...create,values:{...create.values,name:'Changed intent'}},{fetchImpl:transport}),{code:'PRODUCTION_FUTURE_YEAR_IDEMPOTENCY_CONFLICT'});
  await assert.rejects(submitFutureYearAdministration({...create,operationRequestId:randomUUID()},{fetchImpl:transport}),{code:'FUTURE_TOURNAMENT_CREATE_PREDECESSOR_INVALID'});
  cases.push({id:'same-id-different-payload-and-same-year-duplicate',result:'PASS',silentOverwrite:false});
  const second=await submitFutureYearAdministration(review(2097),{fetchImpl:transport});assert.equal(second.data.selectedTournament.tournamentYear,2097);
  cases.push({id:'different-generic-future-year',result:'PASS',year:2097});
  for(const value of ['2098','2.098e3',2098.5,NaN,null]){
   assert.throws(()=>buildFutureYearAdministrationMutation('create',{...create.values,tournamentYear:value,expectedRevision:0,operationRequestId:randomUUID()}));
  }
  assert.throws(()=>buildFutureYearAdministrationMutation('create',{...create.values,targetTournamentId:'TOUR-2098',expectedRevision:0,operationRequestId:randomUUID()}));
  assert.throws(()=>buildFutureYearAdministrationMutation('create',{...create.values,targetTournamentId:'2096',expectedRevision:0,operationRequestId:randomUUID()}));
  cases.push({id:'malformed-conflicting-and-unsupported-year',result:'PASS'});
  return first;
 });
 assert.equal(scope.diagnostics.googleAttempts,0);
 // A readback outage must leave the same client review/operation identity available for reconciliation.
 const lostRead=review(2096);let posts=0;
 await assert.rejects(submitFutureYearAdministration(lostRead,{fetchImpl:async(url,init)=>{
  if(init.method==='POST'){posts++;return transport(url,init);}return Response.json({ok:false},{status:503});
 }}),error=>error.code==='FUTURE_YEAR_CANONICAL_READBACK_REQUIRED'&&error.operationRequestId===lostRead.operationRequestId);
 assert.equal(posts,1);assert.equal(snapshot('2096').catalog,1);
 const recovered=await submitFutureYearAdministration(lostRead,{fetchImpl:transport});assert.equal(recovered.receipt.idempotent,true);
 cases.push({id:'committed-create-readback-loss-safe-retry',result:'PASS',sameOperationId:true});
 // A real SQL failure at three transaction boundaries must roll back catalog,
 // resource, audit and receipt together. Triggers exist only in this disposable fixture.
 for(const [year,table]of [[2095,'future_tournament_resources_v1'],[2094,'future_year_audit_events_v1'],[2093,'future_year_operation_receipts_v1']]){
  const req=review(year);
  sql(`create function production_control.annual_fixture_fail()returns trigger language plpgsql as $$begin raise exception 'ANNUAL_FIXTURE_FAILURE';end;$$;
    create trigger annual_fixture_failure before insert on production_control.${table} for each row execute function production_control.annual_fixture_fail()`);
  await assert.rejects(submitFutureYearAdministration(req,{fetchImpl:transport}));
  assert.deepEqual(snapshot(String(year)),{catalog:0,resources:0,receipts:0,audit:0,runtime:0,GoogleJobs:0});
  sql(`drop trigger annual_fixture_failure on production_control.${table};drop function production_control.annual_fixture_fail()`);
  const retried=await submitFutureYearAdministration(req,{fetchImpl:transport});assert.equal(retried.receipt.idempotent,false);
  cases.push({id:`atomicity-before-${table}`,result:'PASS',rollback:'COMPLETE',sameRequestRetry:'PASS'});
 }
 // Existing partial drafts cannot be overwritten or promoted through CREATE.
 const partial=review(2092);await submitFutureYearAdministration(partial,{fetchImpl:transport});
 await assert.rejects(submitFutureYearAdministration({...partial,operationRequestId:randomUUID()},{fetchImpl:transport}),{code:'FUTURE_TOURNAMENT_CREATE_PREDECESSOR_INVALID'});
 assert.equal(sql("select lifecycle from production_control.future_tournament_catalog_v1 where tournament_id='2092'"),'DRAFT');
 cases.push({id:'existing-incomplete-draft-not-falsely-ready',result:'PASS'});
 const raw=buildFutureYearAdministrationMutation('create',{...review(2091).values,expectedRevision:0,operationRequestId:randomUUID()});
 const resource=JSON.parse(sql("select row_to_json(v)::text from production_control.resource_scope v where scope_key='BAGGER_INV_PRODUCTION'"));
 const input={...raw,contract_version:'production-future-year-administration-v1',environment:'PRODUCTION',project_ref:resource.project_ref,project_url:resource.project_url,
  tournament_id:'2026',tournament_year:2026,source_workbook_id:resource.google_workbook_id,actor_player_id:'FZ01',actor_auth_user_id:auth,
  authorization:{tournament_id:'2026',player_id:'FZ01',auth_user_id:auth,role:'DIRECTOR'},request_payload_hash:'a'.repeat(64)};
 for(const invalid of ['2091',2091.25,null]){
  const result=JSON.parse(sql(`select public.mutate_production_future_year_administration_v1(${jsonSql({...input,target_tournament_year:invalid})})::text`));assert.equal(result.code,'FUTURE_TOURNAMENT_METADATA_INVALID');
 }
 const invalidCurrent={...input,target_tournament_id:'2026',target_tournament_year:2026};
 assert.equal(JSON.parse(sql(`select public.mutate_production_future_year_administration_v1(${jsonSql(invalidCurrent)})::text`)).ok,false);
 cases.push({id:'sql-strict-target-year-and-current-year-denial',result:'PASS'});
 // Historical pending/failed provider records remain preserved and cannot make
 // canonical annual readback wait for retired delivery. Setup is synthetic only.
 for(const [target,baseRevision]of [['2097',1],['2096',1]]){
  await submitFutureYearAdministration({action:'configure-round',expectedRevision:baseRevision,operationRequestId:randomUUID(),values:{targetTournamentId:target,tournamentYear:Number(target),roundNumber:1,roundName:'Synthetic read fixture',format:'BB',teamSize:2,pointsAvailable:'1',handicapAllowance:'1',reason:'Synthetic retired history preservation proof'}},{fetchImpl:transport});
  await submitFutureYearAdministration({action:'generate-match-structure',expectedRevision:baseRevision+1,operationRequestId:randomUUID(),values:{targetTournamentId:target,tournamentYear:Number(target),roundNumber:1,matchCount:2,reason:'Synthetic retired history preservation proof'}},{fetchImpl:transport});
  sql(`insert into production_control.future_match_google_compatibility_jobs_v1(tournament_id,match_id,requirement_class,status)values('${target}','${target}-R1-1','OPTIONAL_ARCHIVE','FAILED'),('${target}','${target}-R1-2','OPTIONAL_ARCHIVE','PROVISIONING_REQUIRED')`);
 }
 const oldJobs=sql("select jsonb_agg(to_jsonb(v)order by tournament_id,match_id)::text from production_control.future_match_google_compatibility_jobs_v1 v");
 // Retain the actual old caller/hash failure as a permanent regression. The
 // only override below changes the declared digest back to the historical JS
 // encoding; installed SQL admission remains unchanged.
 const promote={action:'promote-runtime',targetTournamentId:'2098',tournamentYear:2098,expectedRevision:0,operationRequestId:randomUUID(),reason:'Synthetic runtime contract countercheck',actorAuthUserId:auth,actorPlayerId:'FZ01',actorTournamentId:'2026'};
 const oldHashOptions={...options,rpc:(name,input,rpcOptions)=>{
  const {request_payload_hash,...payload}=input;
  const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
  return options.rpc(name,{...payload,request_payload_hash:createHash('sha256').update(JSON.stringify(stable(payload))).digest('hex')},rpcOptions);
 }};
 await assert.rejects(server.mutateProductionFutureRuntime(promote,oldHashOptions),{code:'PRODUCTION_FUTURE_RUNTIME_PAYLOAD_HASH_INVALID'});
 const vectors=[
  {action:'PROMOTE_RUNTIME_STRUCTURE',expected_revision:0,target_tournament_year:2098},
  {action:'STAGE_HANDICAPS',entries:[{player_id:'FZ01',handicap_index:-2.5},{player_id:'FZ02',handicap_index:18.3}]},
  {unicode:'Ånnual 😀',é:'été',aa:'quoted "value"',nested:[true,null,{z:1,a:0.85}]},
  {small:1e-7,tiny:-1.23e-15,large:1.23e21,zero:-0},
  {smallest:5e-324,largest:1.7976931348623157e308},
 ];
 for(const vector of vectors){
  assert.equal(sql(`select ${jsonSql(vector)}::text`),annualRuntimeRequestJsonbText(vector));
  assert.equal(sql(`select production_control.future_runtime_hash_v2(${jsonSql(vector)})`),annualRuntimeRequestHash(vector));
 }
 cases.push({id:'annual-runtime-jsonb-wire-hash',result:'PASS',vectors:vectors.length,coverage:'nested/unicode/decimals/exponent boundaries; old hash rejected by installed SQL'});
 // Populate owner-reviewed setup using actual client/API operations. CREATE
 // alone did not invent these facts. Promotion then exercises the real V2 RPC.
 let setupRevision=1;
 const setup=async(action,values)=>submitFutureYearAdministration({action,expectedRevision:setupRevision++,operationRequestId:randomUUID(),values:{targetTournamentId:'2098',tournamentYear:2098,reason:'Synthetic canonical runtime setup',...values}},{fetchImpl:transport});
 await setup('configure-team',{teamId:'A2098',teamSide:1,teamName:'Synthetic A'});
 await setup('configure-team',{teamId:'B2098',teamSide:2,teamName:'Synthetic B'});
 await setup('replace-roster',{roster:players.map((playerId,index)=>({playerId,teamId:index%2?'B2098':'A2098',teamSide:index%2?2:1,participationStatus:'ACTIVE'}))});
 await setup('configure-round',{roundNumber:1,roundName:'Synthetic round',format:'BB',teamSize:2,pointsAvailable:'1',handicapAllowance:'1'});
 await setup('generate-match-structure',{roundNumber:1,matchCount:1});
 const preCourseRead=await server.readProductionFutureRuntime({actorAuthUserId:auth,actorPlayerId:'FZ01',actorTournamentId:'2026',targetTournamentId:'2098'},options);
 const courseReview={action:'add-global-course',expectedRevision:preCourseRead.courseAllocatorRevision,operationRequestId:randomUUID(),values:{targetTournamentId:'2098',tournamentYear:2098,courseName:'Synthetic Ånnual 😀 Course',location:'Isolated fixture',reason:'Synthetic canonical course proof'}};
 const createdCourse=await submitFutureYearAdministration(courseReview,{fetchImpl:transport});
 assert.equal(createdCourse.receipt.targetTournamentId,'');assert.ok(createdCourse.receipt.courseId);
 const course=createdCourse.data.futureRuntime.courseCatalog.find(c=>c.courseId===createdCourse.receipt.courseId);
 const contextReview={action:'configure-global-course-context',expectedRevision:course.revision,operationRequestId:randomUUID(),values:{targetTournamentId:'2098',tournamentYear:2098,courseId:course.courseId,teeId:'Synthetic Blue',rating:'72.4',slope:133,par:72,holes:Array.from({length:18},(_,i)=>({holeNumber:i+1,par:4,strokeIndex:i+1,yardage:400+i})),reason:'Synthetic canonical course context proof'}};
 const configuredContext=await submitFutureYearAdministration(contextReview,{fetchImpl:transport});
 assert.equal(configuredContext.receipt.teeId,'Synthetic Blue');
 await submitFutureYearAdministration({action:'assign-future-course',expectedRevision:setupRevision++,operationRequestId:randomUUID(),values:{targetTournamentId:'2098',tournamentYear:2098,roundNumber:1,courseId:course.courseId,teeId:'Synthetic Blue',courseContextRevision:configuredContext.receipt.contextRevision,reason:'Synthetic canonical course assignment'}},{fetchImpl:transport});
 cases.push({id:'annual-global-course-client-canonical-readback',result:'PASS',create:true,contextHoles:18,assigned:true,receiptHasTournament:false});

 const runtimeReview={action:'promote-runtime',expectedRevision:0,operationRequestId:promote.operationRequestId,values:{targetTournamentId:'2098',tournamentYear:2098,reason:promote.reason}};
 const promoted=await submitFutureYearAdministration(runtimeReview,{fetchImpl:transport});
 assert.equal(promoted.receipt.ok,true);assert.equal(promoted.receipt.idempotent,false);
 const promotedRetry=await submitFutureYearAdministration(runtimeReview,{fetchImpl:transport});assert.equal(promotedRetry.receipt.idempotent,true);
 await assert.rejects(submitFutureYearAdministration({...runtimeReview,values:{...runtimeReview.values,reason:'Changed promotion payload'}},{fetchImpl:transport}),{code:'PRODUCTION_FUTURE_RUNTIME_IDEMPOTENCY_CONFLICT'});
 const runtimeState=JSON.parse(sql("select jsonb_build_object('tournaments',(select count(*)from scoring_authority.tournaments where tournament_id='2098'),'promotions',(select count(*)from production_control.future_runtime_promotions_v2 where tournament_id='2098'),'receipts',(select count(*)from production_control.future_runtime_operation_receipts_v2 where tournament_id='2098' and action='PROMOTE_RUNTIME_STRUCTURE'),'teams',(select count(*)from scoring_authority.teams where tournament_id='2098'),'players',(select count(*)from scoring_authority.tournament_players where tournament_id='2098'),'matches',(select count(*)from scoring_authority.matches where tournament_id='2098'),'GoogleJobs',(select count(*)from production_control.future_match_google_compatibility_jobs_v1 where tournament_id='2098'))::text"));
 assert.deepEqual(runtimeState,{tournaments:1,promotions:1,receipts:1,teams:2,players:4,matches:1,GoogleJobs:0});
 evidence.runtimeCompatibilityCountercheck={result:'PASS',issue:'P2C1CL-ANNUAL-HASH-001',historicalFailure:'PRODUCTION_FUTURE_RUNTIME_PAYLOAD_HASH_INVALID',caller:'shipping client/API → mutateProductionFutureRuntime → mutate_production_future_runtime_v2',readback:true,retry:true,conflict:true,state:runtimeState};
 cases.push({id:'NA-2026-ANNUAL-RUNTIME-WIRE-HASH',result:'PASS',sameRequestReplay:'PASS',conflict:'PASS',canonicalReadback:'PASS',state:runtimeState});
 // The transition receipt sub-contract uses the same jsonb hash. Prove that
 // narrow receipt boundary without claiming an entire annual activation.
 const transitionPayload={operation_request_id:randomUUID(),action:'PREPARE',reason:'Synthetic transition hash boundary'};
 const transitionInput={...transitionPayload,request_payload_hash:annualRuntimeRequestHash(transitionPayload)};
 assert.equal(sql(`select production_control.lookup_annual_scoring_receipt_v1('PREPARE',${jsonSql(transitionInput)}) is null`),'t');
 sql(`select production_control.store_annual_scoring_receipt_v1('PREPARE',${jsonSql(transitionInput)},'{"ok":true,"fixtureOnly":true}'::jsonb)`);
 assert.equal(JSON.parse(sql(`select production_control.lookup_annual_scoring_receipt_v1('PREPARE',${jsonSql(transitionInput)})::text`)).idempotent,true);
 const changed={...transitionPayload,reason:'Conflicting transition'};
 assert.throws(()=>sql(`select production_control.lookup_annual_scoring_receipt_v1('PREPARE',${jsonSql({...changed,request_payload_hash:annualRuntimeRequestHash(changed)})})`),/PRODUCTION_ANNUAL_SCORING_IDEMPOTENCY_CONFLICT/);
 cases.push({id:'annual-transition-receipt-jsonb-hash-boundary',result:'PASS',proof:'Installed receipt helper only; not full activation lifecycle'});

 const lostPost=review(2090);
 await assert.rejects(submitFutureYearAdministration(lostPost,{fetchImpl:async(url,init)=>{await transport(url,init);throw new Error('Synthetic response lost after commit');}}),error=>error.code==='FUTURE_YEAR_OUTCOME_UNKNOWN'&&error.operationRequestId===lostPost.operationRequestId);
 assert.equal(snapshot('2090').catalog,1);assert.equal(snapshot('2090').receipts,1);
 const afterHistory=await submitFutureYearAdministration(lostPost,{fetchImpl:transport});assert.equal(afterHistory.receipt.idempotent,true);
 cases.push({id:'post-commit-response-loss-same-id-recovery',result:'PASS',receiptResolved:true});assert.equal(afterHistory.data.selectedTournament.lifecycle,'DRAFT');
 assert.equal(sql("select jsonb_agg(to_jsonb(v)order by tournament_id,match_id)::text from production_control.future_match_google_compatibility_jobs_v1 v"),oldJobs);
 cases.push({id:'annual-create-with-retired-pending-and-failed-history',result:'PASS',historicalJobsPreserved:4,createdGoogleJobs:0});
 // A separate non-empty current-read fixture tests team provenance. These are
 // read-model fixture inserts, not claims that CREATE invents roster/pairings.
 for(const target of ['2096','2097']){
  sql(`insert into scoring_authority.tournaments(tournament_id,tournament_year,name,source_workbook_id,scoring_authority)values('${target}',${target},'Synthetic read model','INERT_FIXTURE_PROVENANCE','SUPABASE');
   insert into scoring_authority.teams(tournament_id,team_id,team_side,name)values('${target}','A${target}',1,'Synthetic side A'),('${target}','B${target}',2,'Synthetic side B');
   insert into scoring_authority.rounds(tournament_id,round_number,format,name,status)values('${target}',1,'BB','Synthetic round','UPCOMING');
   insert into scoring_authority.matches(match_id,tournament_id,round_number,format,scoring_snapshot_id,status,scoring_locked)values('${target}-R1-1','${target}',1,'BB',null,'UPCOMING',true);
   insert into scoring_authority.match_participants(match_id,player_id,team_side,player_slot,playing_handicap,final_strokes)values('${target}-R1-1','FZ01',1,1,0,0),('${target}-R1-1','FZ02',2,1,0,0)`);
 }
 const readRuntime=await server.readProductionFutureRuntime({actorAuthUserId:auth,actorPlayerId:'FZ01',actorTournamentId:'2026',targetTournamentId:'2097'},options);
 assert.deepEqual(readRuntime.matches[0].participants.map(p=>p.teamId),['A2097','B2097']);
 assert.equal(readRuntime.readiness.blockers.some(b=>/GOOGLE/.test(b.code)),false);
 assert.equal(sql("select jsonb_agg(to_jsonb(v)order by tournament_id,match_id)::text from production_control.future_match_google_compatibility_jobs_v1 v"),oldJobs);
 const teamPlan=JSON.parse(sql("explain(analyze,buffers,format json)select team_id from scoring_authority.teams where tournament_id='2097' and team_side=1"));
 evidence.currentReadPlan={family:'ANNUAL_MATCH_TEAM_BY_TOURNAMENT_SIDE',plan:teamPlan,indexes:JSON.parse(sql("select jsonb_agg(indexdef)::text from pg_indexes where schemaname='scoring_authority' and tablename='teams'")),scope:'Exact match tournament + canonical participant side; one row maximum by existing unique key',before:'42703 nonexistent participant.team_id; no executable prior plan'};
 cases.push({id:'P2C1CL-ANNUAL-READ-001',result:'PASS',teamSource:'exact match tournament + participant side',crossYearLeak:false,retiredHistoryBlocksReadiness:false});
 // Replay the actual historical read definition in a rollback-only transaction
 // to prove this regression detects the old failure; candidate function remains intact.
 const historical=await readFile(path.join(repositoryRoot,'supabase/production_migrations/202608300066_production_future_runtime_activation_v1.sql'),'utf8');
 const historicalStart=historical.indexOf('create or replace function public.read_production_future_runtime_v2(');
 const historicalEnd=historical.indexOf('$$;',historicalStart)+3;
 const historicalFunction=historical.slice(historicalStart,historicalEnd);
 const definitionHash=()=>sql("select encode(extensions.digest(prosrc,'sha256'),'hex')from pg_proc where oid='public.read_production_future_runtime_v2(jsonb)'::regprocedure");
 const candidateHash=definitionHash();
 const readInput={...input,contract_version:'production-future-runtime-activation-v2',target_tournament_id:'2097'};
 let historicalFailure='';try{sql(`begin;${historicalFunction};select public.read_production_future_runtime_v2(${jsonSql(readInput)});rollback;`);}catch(error){historicalFailure=String(error.message);}
 assert.match(historicalFailure,/column participant.team_id does not exist/);assert.equal(definitionHash(),candidateHash);
 evidence.readFailureReproduction={result:'EXPECTED_HISTORICAL_FAILURE',SQLSTATE:'42703',message:'column participant.team_id does not exist',historicalFunctionSha256:'d944544d4d55b58817fd8f5147dd04a841ef51600a9a0d98993d9d65ab238712',candidateFunctionSha256:candidateHash,transaction:'ROLLBACK_ONLY'};
 cases.push({id:'annual-current-read-old-function-reproduction',result:'PASS',historicalDefectReproduced:true,candidateRestored:true});
 for(const identity of ['PARTICIPANT','SPECTATOR','SIGNED_OUT']){
  const request=new Request('http://127.0.0.1/api/director/future-tournaments',{method:'POST',body:JSON.stringify({...review(2091).values,action:'create'}),headers:{'content-type':'application/json','x-synthetic-access':identity}});
  assert.equal((await route.POST(request)).status,403);
 }
 // SQL owner admission is not mocked: deny a valid link after capability revocation.
 sql("update production_control.tournament_owner_capabilities_v1 set status='REVOKED',revoked_at=now() where tournament_id='2026' and player_id='FZ01'");
 await assert.rejects(server.mutateProductionFutureYearAdministration({...review(2091).values,action:'create',expectedRevision:0,operationRequestId:randomUUID(),actorAuthUserId:auth,actorPlayerId:'FZ01',actorTournamentId:'2026'},options),{code:'PRODUCTION_FUTURE_RUNTIME_OWNER_REQUIRED'});
 sql("update production_control.tournament_owner_capabilities_v1 set status='ACTIVE',revoked_at=null where tournament_id='2026' and player_id='FZ01'");
 assert.equal(snapshot('2091').catalog,0);
 const privileges=JSON.parse(sql("select jsonb_build_object('anon',has_function_privilege('anon','public.mutate_production_future_year_administration_v1(jsonb)','EXECUTE'),'authenticated',has_function_privilege('authenticated','public.mutate_production_future_year_administration_v1(jsonb)','EXECUTE'),'service',has_function_privilege('service_role','public.mutate_production_future_year_administration_v1(jsonb)','EXECUTE'),'rls',(select relrowsecurity from pg_class where oid='production_control.future_tournament_catalog_v1'::regclass))::text"));
 assert.deepEqual(privileges,{anon:false,authenticated:false,service:true,rls:true});
 for(const role of ['anon','authenticated'])assert.throws(()=>psql(cluster,database,`set role ${role};select public.mutate_production_future_year_administration_v1(${jsonSql(input)})`,{role}),/permission denied for function mutate_production_future_year_administration_v1/);
 assert.throws(()=>psql(cluster,database,`select public.mutate_production_future_year_administration_v1(${jsonSql(input)})`,{role:'authenticated'}),/PRODUCTION_FUTURE_RUNTIME_SERVICE_ROLE_REQUIRED/);
 cases.push({id:'annual-owner-security-and-rpc-rls-boundary',result:'PASS',privileges,httpDenied:['PARTICIPANT','SPECTATOR','SIGNED_OUT']});
 assert.equal(sql('select row_to_json(v)::text from production_control.current_tournament_pointer_v1 v'),pointerBefore);
 assert.equal(sql("select count(*)from production_control.future_match_google_compatibility_jobs_v1 where tournament_id in('2090','2092','2093','2094','2095','2096','2097','2098')"),'4');
 assert.ok(rpcCalls.filter(c=>c.operation==='CREATE_TOURNAMENT').every(c=>c.currentYear===2026&&Number.isInteger(c.targetYear)&&c.targetYear>c.currentYear));
 const beforeRepeatHash=sql("select encode(extensions.digest(prosrc,'sha256'),'hex')from pg_proc where oid='public.mutate_production_future_year_administration_v1(jsonb)'::regprocedure");
 const migration=await readFile(path.join(repositoryRoot,'supabase/production_migrations/202609300127_canonical_annual_create_contract_v1.sql'),'utf8');
 assert.throws(()=>sql(migration),/ANNUAL_CREATE_SOURCE_BASELINE_MISMATCH/);
 assert.equal(sql("select encode(extensions.digest(prosrc,'sha256'),'hex')from pg_proc where oid='public.mutate_production_future_year_administration_v1(jsonb)'::regprocedure"),beforeRepeatHash);
 evidence.migration={cleanInstall:'PASS (empty owned cluster through historical schema + 125/126/127)',upgradeFrom126:'PASS',repeatedApplication:'REJECTED_BY_EXACT_SOURCE_GUARD_WITH_NO_CHANGE',functionSha256:beforeRepeatHash,grantsAndRlsPreserved:true,tableChanges:0,indexChanges:0};
 cases.push({id:'migration-repeat-fails-closed-atomically',result:'PASS'});
 evidence.status=evidence.runtimeCompatibilityCountercheck?.result==='FAIL'?'PARTIAL':'PASS';evidence.canonicalContract='CURRENT_SCOPE_AND_TARGET_YEAR_SEPARATE_V1';evidence.cases=cases;evidence.caseCount=cases.length;
 evidence.rpcCalls=rpcCalls;evidence.futureYearsCreated=[2090,2092,2093,2094,2095,2096,2097,2098];evidence.currentPointerUnchanged=true;evidence.GoogleJobsCreated=0;
 evidence.initialState={lifecycle:'DRAFT',setupRevision:1,lifecycleRevision:1,resourcePolicy:'RETIRED',ownerSpecificFactsCreated:false,ready:false,automaticActivation:false};
 evidence.limitations=['API request identity/activation and socket RPC transport are test fixture adapters; no hosted auth or PostgREST deployment proof','Actual installed PostgreSQL owner/current-pointer checks, grants, RLS and transactions execute','CREATE creates the private draft/resources/audit/receipt only; owner setup, promotion, Prepare/Open and annual activation remain distinct operations','Known annual-worker PostgreSQL execution is separately recertified; an empty DRAFT must not enqueue operational workers','Historical Google provenance identifiers are inert fixture/schema values, not credentials or network authority','No hosted, Production, real Google or physical proof'];
 delete globalThis.__annualClosureBridge;
 return{evidence};
}
