import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spectatorTournamentProjection,spectatorHistoryProjection} from '../lib/spectator-projection.js';
import {mobileProductionOddsView,mobileOddsWithCanonicalTeams,mobileOddsDataFromView} from '../lib/mobile-v1-odds.js';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/spectator/current.json',import.meta.url)));
const env={SPECTATOR_PWA_ENABLED:'true',VERCEL_ENV:'production',VERCEL_DEPLOYMENT_ID:'isolated'};
function harness(){
 let now=0,fail=false,portraitFail=false,state='UNPUBLISHED',suppressed=false;
 const counts={core:0,guide:0,policy:0,odds:0,history:0};
 const modules={
  requireTournamentReadSource:()=>({resolved:'supabase',productionCutover:{handled:true}}),
  readLeaderboardsCoreView:async id=>{assert.equal(id,'2026');counts.core++;if(fail)throw Error('offline');return{payload:{ok:true,data:fixture.core}};},
  readGuideProjection:async()=>{counts.guide++;return{payload:{ok:true,data:fixture.guide}};},
  readPublishedOddsView:async()=>{counts.odds++;return{payload:{ok:true,data:{tournament:{tournament_id:'2026'},publication:{state,authority:'SUPABASE',google_publication_fallback:false,publication_pointer_revision:4},snapshots:[{secret:'must-not-escape'}]}}};},
  spectatorTournamentProjection,spectatorHistoryProjection,mobileProductionOddsView,mobileOddsWithCanonicalTeams,mobileOddsDataFromView,
 };
 const imports={
  './production-participant-auth-enrollment.js':{createProductionParticipantAuthAdminClient:()=>({rpc:async name=>{
   assert.equal(name,'read_player_portrait_policy_v1');counts.policy++;if(portraitFail)return{error:{}};
   const policy=structuredClone(fixture.portraits);if(suppressed){policy.revision=1;policy.players.forEach(p=>{p.policy='SUPPRESSED';p.revision=1;});}return{data:policy};
  }})},
  './completed-history-service.js':{loadCompletedHistoryYears:async()=>{counts.history++;return{views:[{year:2025,tournament:{lifecycle:'FINAL','Tournament Name':'2025 Invitational','Final Score':'10 - 8'}}]};}},
  './history-2026-service.js':{loadHistory2026View:async()=>({year:2026,tournament:{name:'2026 Invitational',lifecycle:'UPCOMING','Final Score':'must-not-escape',championTeam:{name:'must-not-escape'}}})},
 };
 const source=fs.readFileSync(new URL('../lib/spectator-read-server.js',import.meta.url),'utf8')
  .replace(/import 'server-only';/,'').replace(/import\s*\{([^}]+)\}\s*from\s*'[^']+';/g,(_,names)=>`const {${names}}=modules;`)
  .replace(/await import\(([^)]+)\)/g,'await importModule($1)').replace('export async function','async function');
 const read=new Function('modules','importModule','Date','process',source+';return readFollowingResource;')(
  modules,async path=>{assert(path in imports,'unexpected server dependency '+path);return imports[path];},{now:()=>now},{env});
 return{read,counts,tick:ms=>now+=ms,fail:()=>fail=true,portraitFail:()=>portraitFail=true,suppress:()=>suppressed=true,withdraw:()=>state='WITHDRAWN'};
}
test('concurrent public requests coalesce fixed reads; no identity/account API invoked',async()=>{
 const h=harness();const results=await Promise.all(Array.from({length:25},()=>h.read('tournament')));
 assert.equal(h.counts.core,1);assert.equal(h.counts.guide,1);assert.equal(h.counts.policy,25);
 assert(results.every(r=>r.players.length===24));assert.equal(h.counts.odds,0);assert.equal(h.counts.history,0);
});
test('fresh portrait policy overrides cached core; failed policy never returns portrait data',async()=>{
 const h=harness();assert((await h.read('tournament')).players.every(p=>p.portrait));h.suppress();
 assert((await h.read('tournament')).players.every(p=>p.portrait===null));assert.equal(h.counts.core,1);
 h.portraitFail();await assert.rejects(h.read('tournament'),/SPECTATOR_UNAVAILABLE/);
});
test('expired core cache fails closed, no stale-on-error publication',async()=>{
 const h=harness();await h.read('tournament');h.tick(15001);h.fail();await assert.rejects(h.read('tournament'),/offline/);
 assert.equal(h.counts.core,2);
});
test('Odds publication pointer is read every time; withdrawn snapshots cannot leak',async()=>{
 const h=harness();assert.deepEqual((await h.read('odds')).snapshots,[]);h.withdraw();
 const d=await h.read('odds');assert.deepEqual(d.snapshots,[]);assert(!JSON.stringify(d).includes('must-not-escape'));
 assert.equal(h.counts.odds,2);assert.equal(h.counts.core,1);
});
test('current and completed History use bounded safe projection; upcoming has no fabricated final',async()=>{
 const h=harness();const d=await h.read('history');assert.equal(d.tournaments.length,2);
 assert.equal(d.tournaments[0].name,'2026 Invitational');assert.equal(d.tournaments[0].status,'Upcoming');
 assert.equal(d.tournaments[0].finalScore,'');assert.equal(d.tournaments[0].champion,'');
 assert.equal(d.tournaments[1].finalScore,'10 - 8');assert(!JSON.stringify(d).includes('must-not-escape'));
 await h.read('history');assert.equal(h.counts.history,1);
});
test('feature and deployment gates reject before any read',async()=>{
 for(const options of [{env:{}},{env:{...env,VERCEL_ENV:'preview'}},{env:{...env,SPECTATOR_PWA_ENABLED:'false'}}]){
  const h=harness();await assert.rejects(h.read('tournament',options));assert.equal(h.counts.core,0);
 }
 const h=harness();for(const key of ['net-skins','calcutta','identity','tournament?playerId=CB01'])await assert.rejects(h.read(key));
 assert.equal(h.counts.core,0);
});
