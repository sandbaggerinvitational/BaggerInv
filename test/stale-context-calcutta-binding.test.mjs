// Shipping source execution with test-only Auth, canonical transport and after()
// boundaries; no hosted calls, secrets, domain arithmetic or authority changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {certificationRuntimeFixture} from './support/reliability/certification-runtime-fixture.mjs';
import {certificationOperationRpc,resolveCertificationIngress} from '../lib/certification-runtime-server.js';
import {classifyDerivedFailure} from '../lib/score-derived-worker.js';
import {recalculateCalcuttaAfterCanonicalMutation} from '../lib/calcutta-post-commit.js';
import {shippingAuthorizationRoute} from './support/reliability/certification-match-authorization-route.mjs';
import {authorizeMatchAccess} from '../lib/match-authorization-supabase.js';

const strip=source=>source.replace(/^import[\s\S]*?;\s*/gm,'').replaceAll('export async function','async function').replaceAll('export function','function').replaceAll('export const','const');
const identity={authUserId:'55555555-5555-4555-8555-555555555555',actor:{id:'P01',name:'Synthetic Director'},tournamentId:'2026'};
async function lifecycleAdapter({denied=false}={}){
 const submitted=[],receipt={ok:true,match_id:'2026-R3-12',match_revision:26,code:'MATCH_FINAL'};
 const commit=async input=>{submitted.push(input);if(denied)throw Object.assign(Error('Denied'),{code:'CANONICAL_RESOURCE_CONTEXT_STALE',status:409});return{payload:receipt};};
 const deps={requireScoringAuthority:()=>({resolved:'supabase'}),readCanonicalScoringAuthority:async()=>({payload:{ok:true,
  data:{match_id:receipt.match_id,tournament_id:'2026',match_revision:25,permission_revision:3}}}),
  finalizeCanonicalMatch:commit,reopenCanonicalMatch:commit,mutateCanonicalMatchControl:commit};
 const source=strip(await readFile('lib/scoring-persistence-adapter.js','utf8'));
 const invoke=new Function(...Object.keys(deps),source+';return persistDirectorMatchLifecycle;')(...Object.values(deps));
 return{invoke,submitted,receipt};
}
async function hookFixture(){
 const f=certificationRuntimeFixture();let ticks=0;
 f.dependencies.fetchImpl=async(url,init)=>{
  const input=JSON.parse(init.body).input;
  if(url.endsWith('/read_certification_runtime_context_v1'))return Response.json({contract:'certification-runtime-v1',context:f.contextFor(input)});
  assert.equal(input.operation_id,'WORKERS.DELIVERY_TICK');ticks++;
  return Response.json({ok:true,scope:{tournamentId:'2026'},ready:{CALCUTTA:false},calcutta:{configurationRevision:1,auctionRevision:2}});
 };
 return{invoke:(target,options)=>recalculateCalcuttaAfterCanonicalMutation(target,options,{env:f.env,dependencies:{certificationDependencies:f.dependencies}}),ticks:()=>ticks};
}
async function lifecycleRoute(file,{denied=false,postFailure=false,transactionFailure=false}={}){
 const adapter=await lifecycleAdapter({denied:transactionFailure}),hook=await hookFixture(),callbacks=[],followups=[],logs=[];
 const deps={NextResponse:{json:Response.json},after:fn=>callbacks.push(fn),
  authorizePreviewDirector:async()=>({status:denied?'denied':'active',identity}),
  productionDirectorEntitlementEnvironment:()=>({enabled:false}),requireScoringAuthority:()=>({resolved:'supabase'}),
  persistDirectorMatchLifecycle:adapter.invoke,assertDirectorMutationAuthority:({action})=>({resolvedAuthority:'supabase',canonicalLifecycleAction:action}),
  assertScoringMutationAuthorityContractBeforeDispatch:async()=>{},directorTransactionError:error=>error.message,
  revalidatePath:()=>{},revalidateTag:()=>{},invalidateScorecardAnalyticsCache:()=>{},recordOperationalError:()=>{},
  withOperationalRoute:(_options,fn)=>fn,
  recalculateCompetitionDerivedTournament:async()=>({ok:true}),recalculateIntelligenceDerivedTournament:async()=>({ok:true}),
  recalculateCalcuttaAfterCanonicalMutation:async(target,options)=>{followups.push({target,options});if(postFailure)throw Object.assign(Error('Synthetic isolated postcommit failure'),{code:'CERTIFICATION_CALCUTTA_TARGET_MISMATCH'});return hook.invoke(target,options);},
  console:{info:()=>{},error:(message,details)=>logs.push({message,details})}};
 const source=strip(await readFile(file,'utf8'));
 const post=new Function(...Object.keys(deps),source+';return POST;')(...Object.values(deps));
 return{adapter,followups,logs,callbacks,request:async(action)=>{
  const response=await post(new Request('https://local-certification.invalid/api/director',{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({action,matchId:'2026-R3-12',tournamentId:'UNTRUSTED',resource:'PRODUCTION',operationRequestId:'synthetic:'+action})}));
  const body=await response.json();for(const fn of callbacks)await fn();return{response,body};}};
}
for(const file of ['app/api/director/route.js','app/api/live-matches/route.js']){
 for(const [label,action] of [['finalize','finalize'],['reopen','reopen'],['re-finalize','finalize']])test(`${file}: ${label} uses committed canonical match target, ignoring client target`,async()=>{
  const f=await lifecycleRoute(file),result=await f.request(action);
  assert.equal(result.response.status,200);assert.equal(f.adapter.submitted.length,1);
  assert.equal(f.adapter.submitted[0].authorization.tournament_id,'2026');
  assert.equal(f.followups.length,1);assert.equal(f.followups[0].target,'2026');assert.equal(f.followups[0].options.matchId,'2026-R3-12');
  assert.deepEqual(file.includes('live-matches')?result.body.data.match:result.body.receipt,f.adapter.receipt);
  assert.equal(f.logs.length,0);
 });
 test(`${file}: postcommit failure reports pending work without changing committed receipt or resubmitting`,async()=>{
  const f=await lifecycleRoute(file,{postFailure:true}),result=await f.request('finalize');
  assert.equal(result.response.status,200);assert.deepEqual(file.includes('live-matches')?result.body.data.match:result.body.receipt,f.adapter.receipt);
  assert.equal(f.adapter.submitted.length,1);assert.equal(f.logs.length,1);
  assert.equal(f.logs[0].details.code,'CERTIFICATION_CALCUTTA_TARGET_MISMATCH');
 });
 test(`${file}: participant/anon denial cannot reach lifecycle or postcommit authority`,async()=>{
  const f=await lifecycleRoute(file,{denied:true}),result=await f.request('finalize');
  assert.ok([401,403].includes(result.response.status));assert.equal(f.adapter.submitted.length,0);assert.equal(f.followups.length,0);assert.equal(f.callbacks.length,0);
 });
 test(`${file}: precommit stale rejection is typed 409 and never schedules a Calcutta hook`,async()=>{
  const f=await lifecycleRoute(file,{transactionFailure:true}),result=await f.request('reopen');
  assert.equal(result.response.status,409);assert.equal(result.body.code,'CANONICAL_RESOURCE_CONTEXT_STALE');assert.equal(f.followups.length,0);assert.equal(f.callbacks.length,0);
 });
}
for(const target of ['', 'WRONG'])test(`Calcutta target ${target||'empty'} remains denied before any tick`,async()=>{
 const f=await hookFixture();await assert.rejects(f.invoke(target,{}),{code:'CERTIFICATION_CALCUTTA_TARGET_MISMATCH',status:409});assert.equal(f.ticks(),0);
});
for(const operation of ['SCORING.READ_AUTHORITY','SCORING.SUBMIT_HOLE','SCORING.FINALIZE_MATCH','SCORING.REOPEN_MATCH'])test(`${operation}: PT409 stays typed, makes one execution attempt and preserves recovery`,async()=>{
 const f=certificationRuntimeFixture(),original=f.dependencies.fetchImpl;let executions=0;
 f.dependencies.fetchImpl=(url,init)=>{
  if(/\/(?:read|execute)_certification_operation_v1$/.test(url)){executions++;return Response.json({code:'PT409',message:'CANONICAL_RESOURCE_CONTEXT_STALE',details:'private data'},{status:409});}
  return original(url,init);
 };
 const operationRequestId='synthetic:stale-recovery',mutation=operation!=='SCORING.READ_AUTHORITY';
 let error;try{await certificationOperationRpc(operation,{match_id:'2026-R3-12'},{env:f.env,operationRequestId},f.dependencies);}catch(e){error=e;}
 assert.ok(error);assert.equal(error.code,'CANONICAL_RESOURCE_CONTEXT_STALE');assert.equal(error.status,409);assert.equal(error.databaseSqlstate,'PT409');
 assert.equal(classifyDerivedFailure(error).classification,'TERMINAL');assert.equal(executions,1);assert.equal(JSON.stringify(error).includes('private data'),false);
 if(mutation){assert.equal(error.outcome,'UNKNOWN');assert.equal(error.operationRequestId,operationRequestId);
  const resolved=await resolveCertificationIngress(operation,{match_id:'2026-R3-12'},{env:f.env,operationRequestId},f.dependencies);
  assert.equal(resolved.payload.state,'NOT_COMMITTED');assert.equal(executions,1);}
});
test('genuine serialization 40001 remains retryable and retains its existing unavailable envelope',async()=>{
 const f=certificationRuntimeFixture(),original=f.dependencies.fetchImpl;
 f.dependencies.fetchImpl=(url,init)=>url.endsWith('/execute_certification_operation_v1')?Response.json({code:'40001',message:'could not serialize access due to concurrent update'},{status:500}):original(url,init);
 await assert.rejects(certificationOperationRpc('WORKERS.INTELLIGENCE_WRITE',{}, {env:f.env,operationRequestId:'55555555-5555-4555-8555-555555555555'},f.dependencies),error=>{
  assert.equal(error.databaseSqlstate,'40001');assert.equal(classifyDerivedFailure(error).classification,'RETRYABLE');assert.equal(error.status,503);return true;
 });
});
test('Passport shipping authorization preserves PT409 and does not repeat the failed projection',async()=>{
 const f=certificationRuntimeFixture(),original=f.dependencies.fetchImpl;let attempts=0;
 f.dependencies.fetchImpl=(url,init)=>{if(url.endsWith('/read_certification_projection_v1')){attempts++;return Response.json({code:'PT409',message:'CANONICAL_RESOURCE_CONTEXT_STALE'},{status:409});}return original(url,init);};
 const route=await shippingAuthorizationRoute({authorize:value=>authorizeMatchAccess(value,{env:f.env,certificationDependencies:f.dependencies})});
 const result=await route.request();assert.equal(result.response.status,409);assert.equal(result.body.code,'CANONICAL_RESOURCE_CONTEXT_STALE');assert.equal(attempts,1);assert.equal(result.cookies.length,0);
});
