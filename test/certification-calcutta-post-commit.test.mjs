// NA-CERTIFICATION-CALCUTTA-POSTCOMMIT: the real adapter is selected explicitly;
// only HTTP responses are modeled here. PostgreSQL behavior is tested separately.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {certificationRuntimeFixture} from './support/reliability/certification-runtime-fixture.mjs';
import {recalculateCalcuttaAfterCanonicalMutation} from '../lib/calcutta-post-commit.js';

function fixture({target='2026',denyRead=false,staleTick=false}={}){
 const f=certificationRuntimeFixture(),calls=[];
 f.dependencies.fetchImpl=async(url,init)=>{
  const input=JSON.parse(init.body).input;calls.push({url,input});
  assert.equal(new URL(url).origin,'https://cccccccccccccccccccc.supabase.co');
  assert.equal(init.redirect,'error');assert.equal(input.phase,'WORKERS');
  if(url.endsWith('/read_certification_runtime_context_v1')){
   if(denyRead)return Response.json({code:'42501',message:'CERTIFICATION_PHASE_FORBIDDEN'},{status:403});
   return Response.json({contract:'certification-runtime-v1',context:{...f.contextFor(input),
    current_tournament_id:target,tournament_id:target,current_tournament_year:Number(target),governance_tournament_id:target}});
  }
  assert.equal(input.operation_id,'WORKERS.DELIVERY_TICK');
  assert.equal(input.expected_context_token,'b'.repeat(64));
  if(staleTick)return Response.json({code:'40001',message:'CERTIFICATION_CONTEXT_STALE'},{status:409});
  return Response.json({ok:true,scope:{tournamentId:target},ready:{CALCUTTA:false},calcutta:{configurationRevision:0,auctionRevision:0}});
 };
 let fallback=0;
 const dependencies={certificationDependencies:f.dependencies,
  recalculatePreviewCalcuttaTournament:async()=>{fallback++;throw Error('legacy fallback');},
  resolveProductionCalcuttaPostCommitMatch:async()=>{fallback++;throw Error('Production fallback');}};
 return {...f,calls,dependencies,options:{env:f.env,dependencies},fallback:()=>fallback};
}
for(const target of ['2026','2097'])test(`registered ${target} postcommit uses only bound canonical worker with no Google or legacy authority`,async()=>{
 const f=fixture({target});const result=await recalculateCalcuttaAfterCanonicalMutation(target,{matchId:target+'-R1-1'},f.options);
 assert.deepEqual(result,{ok:true,skipped:true,reason:'NO_READY_CANONICAL_CALCUTTA_JOB'});
 assert.equal(f.calls.length,4);assert.equal(f.calls.filter(c=>c.url.endsWith('/read_certification_runtime_context_v1')).length,1);
 assert.deepEqual(f.calls.slice(1).map(c=>c.input.payload.materialization_family),['CALCUTTA','NET_SKINS','COMPETITION']);
 assert.equal(f.fallback(),0);
});
for(const target of ['', '2097'])test(`wrong or absent postcommit tournament fails before worker side effects (${target||'missing'})`,async()=>{
 const f=fixture();await assert.rejects(recalculateCalcuttaAfterCanonicalMutation(target,{},f.options),{code:'CERTIFICATION_CALCUTTA_TARGET_MISMATCH',status:409});
 assert.equal(f.calls.length,1);assert.equal(f.fallback(),0);
});
test('denied worker admission never falls through to legacy Preview or Production',async()=>{
 const f=fixture({denyRead:true});await assert.rejects(recalculateCalcuttaAfterCanonicalMutation('2026',{},f.options),{code:'CERTIFICATION_PHASE_FORBIDDEN'});
 assert.equal(f.calls.length,1);assert.equal(f.fallback(),0);
});
test('stale context conflicts at first tick instead of resolving a fresh target',async()=>{
 const f=fixture({staleTick:true});await assert.rejects(recalculateCalcuttaAfterCanonicalMutation('2026',{},f.options),{code:'CERTIFICATION_CONTEXT_STALE',status:409});
 assert.equal(f.calls.length,2);assert.equal(f.calls.filter(c=>c.url.endsWith('/read_certification_runtime_context_v1')).length,1);assert.equal(f.fallback(),0);
});
test('invalid registered resource is denied before transport and fallback',async()=>{
 const f=fixture();await assert.rejects(recalculateCalcuttaAfterCanonicalMutation('2026',{},
  {...f.options,env:{...f.env,SUPABASE_SCORING_MIRROR_URL:'https://idgigvjjqkfbqjeredpb.supabase.co'}}),{code:'CANONICAL_RESOURCE_UNAVAILABLE'});
 assert.equal(f.calls.length,0);assert.equal(f.fallback(),0);
});
test('existing Production and ordinary Preview selection/logic remain byte-identical',async()=>{
 const file='lib/calcutta-post-commit.js',before=execFileSync('git',['show','7cec5128409286f5b4a5f3524d4c5488124a7be7:'+file],{encoding:'utf8'}),after=await readFile(file,'utf8');
 const marker='  if (clean(env.VERCEL_ENV).toLowerCase() === "production") {';
 assert.equal(after.slice(after.indexOf(marker)),before.slice(before.indexOf(marker)));
});

// Exercise the shipping claim adapter. Valid binding reaches the unchanged
// strict calculator, whose intentionally absent Full-Net input fails separately.
// Actual valid calculation/completion is the PostgreSQL integration test.
const {processProductionCalcuttaV1Job}=await import('../lib/production-calcutta-server.js');
async function claimCase({target='2026',change=()=>{}}={}){
 const f=certificationRuntimeFixture(),calls=[],generation='66666666-6666-4666-8666-666666666666';
 const tournament={tournament_id:target,tournament_year:Number(target)};
 const claimed={ok:true,job:{job_id:'77777777-7777-4777-8777-777777777777',claim_token:'88888888-8888-4888-8888-888888888888',
  activation_revision:1,configuration_revision:1,configuration_fingerprint:'a'.repeat(64),auction_revision:1,auction_fingerprint:'b'.repeat(64),source_fingerprint:'c'.repeat(64),expected_result_revision:0},
  calculation_input:{tournament:{...tournament},configuration:{tournament_id:target},core_view:{tournament:{...tournament}}}};
 if(target!=='2026'){Object.assign(claimed,{tournament_id:target,runtime_generation_id:generation});Object.assign(claimed.job,{tournament_id:target,runtime_generation_id:generation});}
 change(claimed);
 f.dependencies.fetchImpl=async(url,init)=>{
  const input=JSON.parse(init.body).input;calls.push(input.operation_id||'CONTEXT');
  if(url.endsWith('/read_certification_runtime_context_v1'))return Response.json({contract:'certification-runtime-v1',context:{...f.contextFor(input),
   current_tournament_id:target,tournament_id:target,current_tournament_year:Number(target),governance_tournament_id:target}});
  assert.equal(input.phase,'WORKERS');assert.equal(input.expected_context_token,'b'.repeat(64));
  if(input.operation_id==='WORKERS.CALCUTTA_CLAIM')return Response.json(claimed);
  assert.equal(input.operation_id,'WORKERS.CALCUTTA_FAIL');return Response.json({ok:true});
 };
 let error;try{await processProductionCalcuttaV1Job({expectedConfigurationRevision:1,expectedConfigurationFingerprint:'a'.repeat(64),
  expectedAuctionRevision:1,expectedAuctionFingerprint:'b'.repeat(64),workerId:'synthetic-binding-check',requestFingerprint:'d'.repeat(64)},
  {env:f.env,certificationDependencies:f.dependencies});}catch(e){error=e;}
 assert.ok(error);assert.equal(calls.filter(x=>x==='CONTEXT').length,1);assert.equal(calls.includes('WORKERS.CALCUTTA_COMPLETE'),false);
 return error;
}
for(const target of ['2026','2097'])test(`canonical ${target} claim DTO passes exact target binding and reaches strict calculator validation`,async()=>{
 assert.equal((await claimCase({target})).code,'PRODUCTION_FULL_NET_AUTHORITY_REQUIRED');
});
for(const [name,change] of [
 ['missing input tournament',v=>{delete v.calculation_input.tournament;}],
 ['wrong input tournament',v=>{v.calculation_input.tournament.tournament_id='2098';}],
 ['wrong configuration target',v=>{v.calculation_input.configuration.tournament_id='2098';}],
 ['wrong core target',v=>{v.calculation_input.core_view.tournament.tournament_id='2098';}],
 ['stale activation',v=>{v.job.activation_revision=2;}],
 ['contradictory optional job target',v=>{v.job.tournament_id='2098';}],
 ['contradictory optional response target',v=>{v.tournament_id='2098';}],
 ['unexpected initial generation',v=>{v.job.runtime_generation_id='66666666-6666-4666-8666-666666666666';}],
])test(`initial canonical claim fails closed: ${name}`,async()=>{
 assert.equal((await claimCase({change})).code,'PRODUCTION_CALCUTTA_JOB_RUNTIME_MISMATCH');
});
for(const [name,change] of [
 ['missing job target',v=>{delete v.job.tournament_id;}],
 ['missing response target',v=>{delete v.tournament_id;}],
 ['wrong configuration target',v=>{v.calculation_input.configuration.tournament_id='2026';}],
 ['wrong core target',v=>{v.calculation_input.core_view.tournament.tournament_id='2026';}],
 ['stale activation',v=>{v.job.activation_revision=2;}],
 ['missing generation',v=>{delete v.job.runtime_generation_id;}],
 ['malformed generation',v=>{v.runtime_generation_id=v.job.runtime_generation_id='not-a-uuid';}],
 ['contradictory generations',v=>{v.job.runtime_generation_id='99999999-9999-4999-8999-999999999999';}],
])test(`future canonical claim fails closed: ${name}`,async()=>{
 assert.equal((await claimCase({target:'2097',change})).code,'PRODUCTION_CALCUTTA_JOB_RUNTIME_MISMATCH');
});
