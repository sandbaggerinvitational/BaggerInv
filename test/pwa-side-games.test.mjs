import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sideGamesFixtures, skinsView, calcuttaView, identity } from './fixtures/pwa-side-games.mjs';
import { mobileNetSkinsDataFromProductionView } from '../lib/mobile-v1-net-skins.js';
import { mobileCalcuttaDataFromProductionView } from '../lib/mobile-v1-calcutta.js';
const src = p => readFile(new URL('../'+p,import.meta.url),'utf8');
test('web fixture data uses shipping Build 4 canonical projections for all formats',()=>{
 const f=sideGamesFixtures(); assert.deepEqual(f.skins.presentation.rounds.map(r=>r.format),['BB','SC','SI']);
 for(const r of f.skins.presentation.rounds){assert.equal(r.holes.length,18);assert.equal(r.holes[0].state,'won');assert.equal(r.holes[1].state,'tied');}
 assert.equal(f.calcutta.viewer.playerId,identity.playerId);assert.equal(f.calcutta.result.portfolios[0].owner.playerId,identity.playerId);
});
test('unpublished/withdrawn data exposes no participant results or money',()=>{
 const f=sideGamesFixtures();assert.equal(f.skinsUnavailable.presentation,null);assert.equal(f.calcuttaUnavailable.market,null);assert.equal(f.calcuttaUnavailable.result,null);
 for(const r of f.skinsUnavailable.rounds) assert.equal(r.officialResults,null);
});
test('published market without results never fabricates financial performance',()=>{
 const d=sideGamesFixtures().calcuttaAuction;assert.ok(d.market.purchases.length);assert.equal(d.result,null);assert.equal(d.presentation,null);
});
test('wrong tournament and mismatched result facts fail closed',()=>{
 assert.throws(()=>mobileNetSkinsDataFromProductionView(skinsView(),{...identity,tournamentId:'2025'}));
 assert.throws(()=>mobileCalcuttaDataFromProductionView(calcuttaView(),{...identity,tournamentId:'2025'}));
 const raw=skinsView();raw.rounds[0].result_payload.fullNetDetail[0].holes[0].fullNet=999;assert.throws(()=>mobileNetSkinsDataFromProductionView(raw,identity));
});
// Execute the actual route body with injected authority/transport boundaries.
// No network, secrets, provider request or Production configuration is used.
async function route(product,{authorized=true,production=true,ok=true}={}) {
 let code=await src(`app/api/leaderboards/${product}/route.js`);
 code=code.replace(/^import[\s\S]*?from [^;]+;\n/gm,'').replace(/export const dynamic =[^;]+;/,'').replace('export async function GET','async function GET');
 const isSkins=product==='net-skins';const calls=[];
 const dependency={cookies:async()=>({}),after:()=>assert.fail('No worker allowed'),NextResponse:{json:(value,init={})=>Response.json(value,init)},performance,
 applicationRequestEnvironment:()=>({}),requireParticipantIdentityAuthority:()=>({resolved:'supabase'}),
 resolveSupabaseParticipantIdentity:async()=>{calls.push('identity');if(!authorized)throw Object.assign(new Error('Denied'),{status:401});return identity;},
 participantIdentityPublicError:e=>({status:e.status||503,code:'UNAVAILABLE',message:'Sign in'}),
 [isSkins?'requireNetSkinsReadSource':'requireCalcuttaReadSource']:()=>({resolved:'supabase',productionCutover:{handled:production}}),
 [isSkins?'readProductionNetSkinsV1':'readProductionCalcuttaV1']:async args=>{assert.equal(args.playerId,identity.playerId);assert.equal(args.tournamentId,identity.tournamentId);calls.push('read');return {payload:{ok,data:isSkins?skinsView():calcuttaView()}};},
 [isSkins?'mobileNetSkinsDataFromProductionView':'mobileCalcuttaDataFromProductionView']:isSkins?mobileNetSkinsDataFromProductionView:mobileCalcuttaDataFromProductionView};
 const get=new Function(...Object.keys(dependency),`${code}; return GET;`)(...Object.values(dependency));
 return {get,calls};
}
for(const product of ['net-skins','calcutta']) {
 test(`${product}: web identity precedes read; client identity cannot override`,async()=>{
  const {get,calls}=await route(product);const response=await get(new Request(`https://example.invalid/api/leaderboards/${product}?presentation=participant&playerId=attacker&tournamentId=2025`));assert.equal(response.status,200);assert.deepEqual(calls,['identity','read']);assert.equal(response.headers.get('cache-control'),'private, no-store');
 });
 test(`${product}: unauthorized direct request never reaches privileged read`,async()=>{const {get,calls}=await route(product,{authorized:false});assert.equal((await get(new Request(`https://example.invalid/?presentation=participant`))).status,401);assert.deepEqual(calls,['identity']);});
 test(`${product}: noncanonical source cannot enter legacy worker fallback`,async()=>{const {get,calls}=await route(product,{production:false});assert.equal((await get(new Request(`https://example.invalid/?presentation=participant`))).status,503);assert.deepEqual(calls,['identity']);});
 test(`${product}: failed canonical read fails closed`,async()=>{const {get}=await route(product,{ok:false});assert.equal((await get(new Request(`https://example.invalid/?presentation=participant`))).status,503);});
}
test('participant presentation has no Director actions, calculations, external navigation, or persistence',async()=>{
 const source=await src('app/live/ParticipantSideGames.js');assert.doesNotMatch(source,/\/api\/(admin|director)|localStorage|sessionStorage|window\.open|target=|calculate|POST|PUT|PATCH|DELETE|signOut/);assert.match(source,/credentials: "same-origin"/);assert.match(source,/cache: "no-store"/);assert.match(source,/controller.abort\(\)/);assert.match(source,/visibilitychange/);
 for(const product of ['net-skins','calcutta'])assert.doesNotMatch(await src(`app/api/leaderboards/${product}/route.js`),/export (?:async )?function (POST|PUT|PATCH|DELETE)/);
});
