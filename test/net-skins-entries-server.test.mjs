import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {productionNetSkinsEntries} from '../lib/production-tournament-setup-server.js';
const actor={actorPlayerId:'CB01',actorAuthUserId:'00000000-0000-4000-8000-000000000001'};
test('entry transport pins Production scope and authenticated actor; caller resources and financial fields never flow',async()=>{
  let captured;const rpc=async(name,input)=>{captured={name,input};return{payload:{ok:true,revision:1}};};
  const values={roundNumber:2,expectedRevision:0,configured:true,fieldFingerprint:'a'.repeat(64),operationRequestId:actor.actorAuthUserId,entries:[],
    tournament_id:'OTHER',authorization:{role:'OWNER'},actor_player_id:'ATTACKER',buyIn:999,winner:'ATTACKER'};
  await productionNetSkinsEntries(actor,values,{rpc});assert.equal(captured.name,'save_production_net_skins_entries_v1');
  assert.equal(captured.input.tournament_id,'2026');assert.equal(captured.input.project_ref,'ymqhhtxaywtqllynrmxe');
  assert.equal(captured.input.authorization.player_id,'CB01');assert.equal(captured.input.authorization.role,'DIRECTOR');
  assert.equal(captured.input.actor_auth_user_id,actor.actorAuthUserId);assert.ok(!('winner' in captured.input));assert.ok(!('buyIn' in captured.input));
  await assert.rejects(()=>productionNetSkinsEntries({...actor,actorAuthUserId:'invalid'},values,{rpc}),/Director/);
});
test('entry read is allowlisted, participant-safe and rejects malformed/foreign responses',async()=>{
  let name;const rpc=async(n)=>{name=n;return {payload:{ok:true,data:{contract:'production-net-skins-entries-v1',tournamentId:'2026',rounds:[],actorSecret:'not exposed'}}};};
  const result=await productionNetSkinsEntries(actor,null,{rpc});assert.equal(name,'read_production_net_skins_entries_v1');assert.ok(!('actorSecret' in result));
  await assert.rejects(()=>productionNetSkinsEntries(actor,null,{rpc:async()=>({payload:{ok:true,data:{tournamentId:'2027'}}})}),/authority/);
});
async function route(deps){let source=await readFile(new URL('../app/api/director/net-skins-entries/route.js',import.meta.url),'utf8');
  source=source.replace(/^import .*;$/gm,'').replace(/export /g,'');
  return new Function(...Object.keys(deps),`${source};return{GET,POST};`)(...Object.values(deps));
}
test('real entry route rejects non-Production, unauthorized and cross-origin writes before transport',async()=>{
  const saved=process.env.VERCEL_ENV;let calls=0,access={status:'active',source:'production-director-entitlement',identity:{authUserId:actor.actorAuthUserId,actor:{id:'CB01'}}};
  const api=await route({NextResponse:{json:(value,options)=>Response.json(value,options)},
    assertProductionCutoverActivation:()=>{},assertProductionCutoverRequest:(req,_env,opts)=>{assert.equal(opts.requireOrigin,true);if(req.headers.get('origin')!=='https://baggerinv.com')throw Error('origin');},
    authorizePreviewDirector:async opts=>{assert.equal(opts.allowBootstrap,false);return access;},
    productionNetSkinsEntries:async()=>{calls++;return{revision:1};}});
  const req=(origin='https://baggerinv.com')=>new Request('https://baggerinv.com/api/director/net-skins-entries',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{"roundNumber":2}'});
  try {
    process.env.VERCEL_ENV='preview';assert.equal((await api.POST(req())).status,404);
    process.env.VERCEL_ENV='production';assert.equal((await api.POST(req('https://other.invalid'))).status,404);
    access={status:'inactive'};assert.equal((await api.POST(req())).status,403);
    access={status:'active',source:'bootstrap'};assert.equal((await api.POST(req())).status,403);assert.equal(calls,0);
    access={status:'active',source:'production-director-entitlement',identity:{authUserId:actor.actorAuthUserId,actor:{id:'CB01'}}};
    const response=await api.POST(req());assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(calls,1);
  } finally {if(saved===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=saved;}
});
