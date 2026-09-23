import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {publicMatchesGolf,publicGolfAllowlist,publicMatchGolf,publicLeadersGolf,publicPlayerGolf,publicHistoryGolf} from '../lib/spectator-golf-projection.js';
import {createPublicGolfReader,publicGolfRequest,PublicGolfNotFound} from '../lib/spectator-golf-service.js';
import {rawFixture} from './fixtures/pn1-mobile.mjs';
import {historicalView} from './fixtures/reviewer-history.mjs';
import {passportInput,passportData} from './fixtures/expanded-spectator/passport.mjs';
import {mobilePublicMatchGolfData,mobileMatchDetailDataFromPreviewView} from '../lib/mobile-v1-match-detail.js';
import {mobileLeadersGolfData,mobileLeadersResult} from '../lib/mobile-v1-tournament-reads.js';
import {mobileHistoryDetailData} from '../lib/mobile-v1-history.js';
import fixture from './fixtures/spectator/current.json' with {type:'json'};
const policy={contractVersion:'player-portrait-policy-v1',revision:0,players:[{playerId:'P1',policy:'ACTIVE',revision:0}]};
const forbidden=['netSkins','net_skins','calcutta','ownership','purchasePrice','holdings','portfolio','email','phone','authUserId','session','certification','approvedIdentity','participantAccess','deletionState','director','writeToken','leaseToken','authenticatedPlayer','isAuthenticatedPlayer','myMatchId','isMyMatch','revisionId','bindingRevision'];
const canary='FORBIDDEN_SECRET_CANARY';
function poison(value,key){if(Array.isArray(value))return value.map(v=>poison(v,key));if(value&&typeof value==='object')return {...Object.fromEntries(Object.entries(value).map(([k,v])=>[k,poison(v,key)])),[key]:{nested:canary}};return value;}
function check(value){if(Array.isArray(value))value.forEach(check);else if(value&&typeof value==='object')for(const [k,v]of Object.entries(value)){assert(!forbidden.includes(k),'excluded field '+k);check(v);}assert(!JSON.stringify(value).includes(canary));}
const canonical={matches:publicMatchesGolf(fixture.core,{payload:{ok:true,data:fixture.guide}}),match:mobilePublicMatchGolfData(rawFixture({owned:false})),leaders:mobileLeadersGolfData(fixture.core),player:passportData(),history:mobileHistoryDetailData(historicalView())};
for(const [resource,data]of Object.entries(canonical))for(const key of forbidden)test(`security ${resource}: recursive ${key} exclusion`,()=>{
 const clean=publicGolfAllowlist(resource,data),dirty=publicGolfAllowlist(resource,poison(data,key));
 assert.deepEqual(dirty,clean);check(dirty);
});
for(const format of ['BB','SC','SI'])for(const status of ['LIVE','FINAL'])test(`${format} ${status}: exact canonical detailed golf facts`,()=>{
 const raw=rawFixture({format,status,owned:false,winners:Array.from({length:status==='FINAL'?18:4},(_,i)=>i%2?'Halved':'Team 1')});
 raw.participants.forEach((p,i)=>p.course_handicap=10.6+i);
 const d=publicMatchGolf(raw),canonical=mobilePublicMatchGolfData(raw);check(d);
 assert.equal(d.match.scorecard.holes.length,18);assert.deepEqual(d.match.scorecard,canonical.match.scorecard);assert.deepEqual(d.match.flow,canonical.match.flow);assert.deepEqual(d.match.stats,canonical.match.stats);
 assert.equal(d.match.teams[0].participants[0].courseHandicap,format==='SC'?null:10.6);
 assert.equal(d.match.status,status==='FINAL'?'completed':'inProgress');assert(!('authenticatedPlayer'in d.match));
});
test('participant presenter stays byte-equivalent with original identity and public derivation strips it',()=>{
 const raw=rawFixture();const d=mobileMatchDetailDataFromPreviewView(raw,{playerId:'P1',tournamentId:'2026',matchId:raw.match.match_id});
 assert.equal(d.match.authenticatedPlayer.involved,true);assert.equal(publicMatchGolf(raw).match.authenticatedPlayer,undefined);
});
test('all rich Players sections preserved, ranks/metrics/R2 pairs server-owned',async()=>{
 const publicData=publicLeadersGolf(fixture.core);const response=await mobileLeadersResult({tournamentId:'2026'},{dependencies:{requireLeaderboardsCoreReadSource:()=>({resolved:'supabase'}),readLeaderboardsCoreView:async()=>({payload:{ok:true,data:fixture.core}})}});
 assert.deepEqual(publicData,response.body.data);assert(publicData.playerIntelligence);assert(publicData.r1RoundCompetition);assert.equal(publicData.r2PairCompetition,null);assert.equal(publicData.r3RoundCompetition.rows.length,0);check(publicData);
});
test('Passport retains canonical career golf sections while removing account/admin state',()=>{
 const d=publicPlayerGolf(passportInput(),policy);assert(d.career.holePerformance);assert(d.career.formatPerformance);assert(d.career.topPartners);assert(d.career.tournamentHistory);assert(!('active'in d.player));assert(!('boardOfGovernors'in d.career.honors));assert(d.player.portraitAssetKey);check(d);
});
test('fresh suppression overrides canonical portrait and missing policy fails closed',()=>{
 for(const p of [{contractVersion:'player-portrait-policy-v1',revision:1,players:[{playerId:'P1',policy:'SUPPRESSED',revision:1}]},{...policy,players:[]}])assert.equal(publicPlayerGolf(passportInput(),p).player.portraitAssetKey,null);
 assert.throws(()=>publicPlayerGolf(passportInput(),{}));
});
test('historical course, strokes and final hole scores come from canonical archive',()=>{
 const d=publicHistoryGolf(historicalView());assert.equal(d.tournament.year,2025);assert(d.matches.length);assert.equal(d.scorecards.length,2);assert.equal(d.scorecards[0].holes.length,18);assert(!('revision'in d.tournament));check(d);
});
function harness(){let tick=0,matchReads=0,historyReads=0;const core=structuredClone(fixture.core);core.players.push({player_id:'P1'});core.matches.push({match:{match_id:'2026-R1-2'}});const reads={guard:()=>{},core:async()=>core,match:async id=>{matchReads++;return rawFixture({matchId:id,owned:false});},history:async()=>{historyReads++;return historicalView();},player:async()=>passportInput(),portraits:async()=>policy};return {reads,read:createPublicGolfReader(reads,{now:()=>tick}),tick:ms=>tick+=ms,counts:()=>({matchReads,historyReads})};}
for(const parts of [['net-skins'],['calcutta'],['identity'],['director'],['match','unknown'],['player','unknown'],['history','2016'],['history','2027'],['leaders','CB01'],['match','../../admin'],['my-match']])test('bounded resource denial '+parts.join('/'),async()=>{
 const h=harness();await assert.rejects(h.read(parts),PublicGolfNotFound);assert.deepEqual(h.counts(),{matchReads:0,historyReads:0});
});
test('scorecard reads coalesce; expired failures never return stale authority',async()=>{
 const h=harness();await Promise.all(Array.from({length:24},()=>h.read(['match','2026-R1-2'])));assert.equal(h.counts().matchReads,1);h.tick(15001);h.reads.match=async()=>{throw Error('offline')};await assert.rejects(h.read(['match','2026-R1-2']),/offline/);
});
test('scope mismatch rejects canonical loader before public projection',async()=>{
 const h=harness();h.reads.match=async()=>rawFixture({matchId:'wrong'});await assert.rejects(h.read(['match','2026-R1-2']));h.reads.history=async()=>({...historicalView(),year:2024});await assert.rejects(h.read(['history','2025']));
});
test('primitive allowlist leaves cannot smuggle nested private objects',()=>{const d=structuredClone(canonical.player);d.player.displayName={email:canary};assert.throws(()=>publicGolfAllowlist('player',d));});
test('public route is GET-only and never grants participant credentials',()=>{
 const s=fs.readFileSync(new URL('../app/api/spectator/golf/[...path]/route.js',import.meta.url),'utf8');assert(s.includes('export async function GET'));assert(!/export (?:async )?function (?:POST|PUT|PATCH|DELETE)/.test(s));assert(s.includes("'Cache-Control':'no-store'"));
});

test('general Matches carries canonical golf context without personal assignment',()=>{const d=canonical.matches;assert.equal(d.matches.length,24);assert.equal(d.tournament.timeZone,'America/New_York');assert(d.matches[0].teams[0].participants[0].courseHandicap!==undefined);check(d);});

test('unknown IDs share a bounded public scope read and never invoke detail reads',async()=>{
 const h=harness();const core=h.reads.core;let reads=0;h.reads.core=async()=>{reads++;return core();};
 await Promise.all(Array.from({length:24},(_,i)=>assert.rejects(h.read(['match','unknown-'+i]),PublicGolfNotFound)));
 assert.equal(reads,1);assert.equal(h.counts().matchReads,0);
 h.tick(15001);await assert.rejects(h.read(['match','unknown-25']),PublicGolfNotFound);assert.equal(reads,2);
});
test('public resource cannot rebind itself to another tournament or Passport subject',async()=>{
 const h=harness();h.reads.core=async()=>({...fixture.core,tournament:{...fixture.core.tournament,tournament_id:'2025'}});
 await assert.rejects(h.read(['leaders']));await assert.rejects(h.read(['match','2026-R1-2']));
 assert.throws(()=>publicMatchesGolf({...fixture.core,tournament:{tournament_id:'2025'}},{}));
 const p=harness();p.reads.player=async()=>({...passportInput(),identity:{playerId:'wrong',tournamentId:'2026'}});
 await assert.rejects(p.read(['player','P1']));
});
test('capability guard is re-evaluated even for a warm public cache',async()=>{
 const h=harness();await h.read(['match','2026-R1-2']);h.reads.guard=()=>{throw Error('disabled');};
 await assert.rejects(h.read(['match','2026-R1-2']),/disabled/);assert.equal(h.counts().matchReads,1);
});
