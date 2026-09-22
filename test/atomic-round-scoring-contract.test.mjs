import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { roundScoringInput } from '../lib/production-round-scoring-contract.js';
const source = p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const identity={authUserId:'00000000-0000-4000-8000-000000000001',playerId:'CB01'};
const valid={round:1,operation:'OPEN',operationId:'20000000-0000-4000-8000-000000000001',expectedFingerprint:'a'.repeat(64)};
test('Director server derives actor and permits only the three bounded intents',()=>{
 for(const operation of ['OPEN','LOCK','RESUME'])for(const round of [1,2,3]){
  const v=roundScoringInput({...valid,round,operation},identity,true);assert.equal(v.authorization.auth_user_id,identity.authUserId);assert.equal(v.authorization.role,'DIRECTOR');assert.equal(v.tournament_id,'2026');assert.equal(v.round,round);
 }
 for(const patch of [{round:4},{round:'1'},{round:0},{operation:'FINALIZE'},{operation:'REOPEN'},{operationId:''},{expectedFingerprint:'a'},{matchIds:['2026-R1-1']},{authorization:identity},{tournament_id:'2025'}])assert.throws(()=>roundScoringInput({...valid,...patch},identity,true),/Refresh/);
 assert.throws(()=>roundScoringInput(valid,{},true));assert.deepEqual(roundScoringInput({round:2},identity).round,2);
});
test('HTTP route requires current Production Director and same-origin write; no bootstrap authority',()=>{
 const s=source('app/api/director/round-scoring/route.js');assert.match(s,/VERCEL_ENV !== 'production'/);assert.match(s,/allowBootstrap: false/);assert.match(s,/production-director-entitlement/);assert.match(s,/requireOrigin: true/);assert.match(s,/SCORING_COMMIT/);assert.match(s,/private, no-store/);assert.match(s,/ROUND_OUTCOME_UNKNOWN/);
});
test('round transport stays within canonical scoring RPC capability/epoch envelope',()=>{
 const s=source('lib/production-scoring-operations-server.js');assert.match(s,/mutate_production_round_scoring_v1: "SCORING_COMMIT"/);assert.match(s,/read_production_round_scoring_v1: "CURRENT_READS"/);assert.match(s,/ROUND_TOURNAMENT_UNSUPPORTED/);
});
test('individual controls preserved; round controls have no finalize, reopen or score operation',()=>{
 const s=source('app/admin/director/ProductionDirectorOperations.js');for(const label of ['Mark Live','Activate Access','Revoke Access','Lock Scoring','Unlock Scoring','Finalize','Reopen'])assert.ok(s.includes(`label: "${label}"`));assert.match(s,/ProductionRoundScoringControls/);
 const sql=source('supabase/production_migrations/202609220108_atomic_round_scoring_v1.sql');assert.doesNotMatch(sql,/create or replace function public\.(mutate_production_match_control|submit_production_hole_score|finalize_production_match|reopen_production_match)/i);assert.doesNotMatch(sql,/(insert into|update|delete from) scoring_authority\.(hole_scores|scoring_snapshots)/i);
});

test('actual HTTP handler: participant and origin denial never dispatch; canonical Director sends one bounded RPC',async()=>{
 const {loadDirectorSource}=await import('./fixtures/director-behavior.mjs');const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='production';
 let authority={status:'denied'},origin=true,calls=[],result={ok:true,data:{round:1}};
 try{
 const route=await loadDirectorSource('app/api/director/round-scoring/route.js',{
 'next/server':{NextResponse:{json:(body,options)=>Response.json(body,options)}},
 '../../../../lib/preview-director-authorization.js':{authorizePreviewDirector:async()=>authority},
 '../../../../lib/production-cutover-activation-contract.js':{assertProductionCutoverActivation:()=>{},assertProductionCutoverRequest:()=>{if(!origin)throw Error('origin');}},
 '../../../../lib/production-scoring-operations-server.js':{productionScoringOperationsRpc:async(name,input)=>{calls.push({name,input});if(result instanceof Error)throw result;return {payload:result};}},
 '../../../../lib/production-round-scoring-contract.js':{roundScoringInput},
 '../../../../lib/data-authority-request.js':{withDataAuthorityRequestScope:async(_,fn)=>({result:await fn(),diagnostics:{}}),dataAuthorityResponseHeaders:()=>({})}
 });
 const request=body=>new Request('https://baggerinv.com/api/director/round-scoring?round=1',{method:'POST',headers:{origin:'https://baggerinv.com','content-type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await route.POST(request(valid))).status,403);assert.equal(calls.length,0);
 authority={status:'active',source:'production-director-entitlement',identity:{authUserId:identity.authUserId,actor:{id:identity.playerId}}};origin=false;assert.equal((await route.POST(request(valid))).status,403);assert.equal(calls.length,0);origin=true;
 assert.equal((await route.POST(request({...valid,matchIds:['2026-R1-1']}))).status,400);assert.equal(calls.length,0);
 assert.equal((await route.POST(request(valid))).status,200);assert.equal(calls.length,1);assert.equal(calls[0].name,'mutate_production_round_scoring_v1');assert.equal(calls[0].input.authorization.player_id,'CB01');
 result=new Error('secret backend detail');const unknown=await route.POST(request(valid));assert.equal(unknown.status,503);const text=await unknown.text();assert.match(text,/ROUND_OUTCOME_UNKNOWN/);assert.doesNotMatch(text,/secret backend/);
 result={ok:false,code:'ROUND_PREFLIGHT_FAILED',matchesChanged:0};assert.equal((await route.POST(request(valid))).status,409);
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
