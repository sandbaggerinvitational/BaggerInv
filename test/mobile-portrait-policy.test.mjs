import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validatePortraitPolicy,mobilePortraitPolicyResult} from '../lib/mobile-portrait-policy.js';
import {canonicalReviewerContext,requireReviewerRead} from '../lib/mobile-reviewer-identity.js';
const policy={contractVersion:'player-portrait-policy-v1',revision:2,players:[{playerId:'CB01',policy:'ACTIVE',revision:0},{playerId:'AM01',policy:'SUPPRESSED',revision:2}]};
const authUserId='81000000-0000-4000-8000-000000000001';
const identity={authUserId,playerId:'CB01',tournamentId:'2026',context:{authUserId,playerId:'CB01',tournament:{id:'2026'},membership:{active:true}}};
const runtime={lifecycle:'ACTIVE',tournamentId:'2026',pointerRevision:1,runtimeGenerationId:'r',authorityGenerationId:'a',admissionGenerationId:'i'};
test('exact policy preserves stable identities, default and versioned suppression',()=>assert.deepEqual(validatePortraitPolicy(policy),policy));
test('ambiguous or overexposing policy fails closed',()=>{
 for (const p of [ {...policy,revision:-1}, {...policy,email:'private'}, {...policy,players:[...policy.players,policy.players[0]]},
   {...policy,players:[{playerId:'CB01',policy:'ACTIVE',revision:1}]}, {...policy,players:[{playerId:'CB01',policy:'SUPPRESSED',revision:0}]},
   {...policy,players:[{playerId:'CB01',policy:'SUPPRESSED',revision:3}]}, {...policy,players:[{playerId:'CB01',policy:'SUPPRESSED',revision:2,authUserId}]}])
   assert.throws(()=>validatePortraitPolicy(p));
});
test('read invokes only policy RPC and rechecks current tournament',async()=>{
 const calls=[];let reads=0;
 const result=await mobilePortraitPolicyResult(identity,{env:{VERCEL_ENV:'production'},dependencies:{
   readCurrentTournamentRuntime:async()=>{reads++;return runtime;},client:{rpc:async(...args)=>{calls.push(args);return {data:policy};}}
 }});
 assert.deepEqual(result,{status:200,body:policy});assert.deepEqual(calls,[['read_player_portrait_policy_v1']]);assert.equal(reads,2);
});
test('invalid membership, provider failure, and runtime drift fail closed',async()=>{
 const dependencies={readCurrentTournamentRuntime:async()=>runtime,client:{rpc:async()=>({data:policy})}};
 await assert.rejects(mobilePortraitPolicyResult({...identity,playerId:'OTHER'},{env:{VERCEL_ENV:'production'},dependencies}));
 await assert.rejects(mobilePortraitPolicyResult(identity,{env:{VERCEL_ENV:'production'},dependencies:{...dependencies,client:{rpc:async()=>({error:{}})}}}));
 let reads=0;
 await assert.rejects(mobilePortraitPolicyResult(identity,{env:{VERCEL_ENV:'production'},dependencies:{...dependencies,readCurrentTournamentRuntime:async()=>({...runtime,pointerRevision:++reads})}}));
});
test('reviewer gets only authenticated read of policy; protections remain',()=>{
 const context=canonicalReviewerContext({kind:'observer',authUserId,tournament:{id:'2026'},active:true,contextRevision:1,expiresAt:'2099-01-01T00:00:00Z',admin:false,scoring:false},{authUserId,tournamentId:'2026'});
 assert.doesNotThrow(()=>requireReviewerRead(context,{surface:'portrait-policy'}));
 assert.throws(()=>requireReviewerRead(context,{surface:'portrait-policy',method:'POST'}));
 assert.throws(()=>requireReviewerRead({}, {surface:'portrait-policy'}));
});
test('route uses existing bearer/certification gate and no-store, no mutation export',()=>{
 const route=readFileSync(new URL('../app/api/mobile/v1/portrait-policy/route.js',import.meta.url),'utf8');
 assert.match(route,/mobileV1ReadResponse/);assert.match(route,/private, no-store/);assert.doesNotMatch(route,/export.*(POST|PUT|DELETE|PATCH)/);
});
