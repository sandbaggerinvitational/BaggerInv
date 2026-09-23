import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spectatorTournamentProjection,spectatorHistoryProjection} from '../lib/spectator-projection.js';
import {entryDestination,followingRoute,hasParticipantCookies} from '../lib/spectator-navigation.js';
import {tournamentDayKey,tournamentDateTime} from '../lib/tournament-timeline.js';
import {todaysSchedule,homeSchedulePreview} from '../lib/home-dashboard.js';
import {mobileOddsDataFromView,mobileProductionOddsView} from '../lib/mobile-v1-odds.js';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/spectator/current.json',import.meta.url)));
const copy=()=>structuredClone(fixture);
const project=f=>spectatorTournamentProjection(f||copy());
test('24 stable players, 24 canonical portraits, no financial or identity fields',()=>{
  const p=project(),body=JSON.stringify(p);assert.equal(p.players.length,24);assert.equal(p.players.filter(p=>p.portrait).length,24);
  assert.equal(p.matches.length,24);assert.equal(p.rounds[2].paired,false);
  assert(!/auth_user|authUuid|email|phone|permission|accessActive|scoringEnabled|calcutta|net.?skins|ownership|auction|holdings|source_payload|workbook|secret|token/i.test(body));
  assert.equal(p.tournament.timeZone,'America/New_York');
});
test('allowlist rejects injected private and unpublished fields recursively',()=>{
  const f=copy();for(const p of f.core.players){p.auth_uuid='private-canary';p.email='private-canary';p.source_payload.phone='private-canary';}
  f.core.calcutta={owners:'private-canary'};f.core.netSkins={entries:'private-canary'};
  f.guide.content.importantContacts=[{Phone:'private-canary'}];f.guide.content.unpublishedOdds='private-canary';
  const d=project(f);assert(!JSON.stringify(d).includes('private-canary'));
  assert.deepEqual(d,project());
});
test('suppression overrides existing assets, unknown policy fails closed, new ACTIVE asset resolves',()=>{
  const f=copy();const target=f.portraits.players[0];f.portraits.revision=1;target.policy='SUPPRESSED';target.revision=1;
  assert.equal(project(f).players.find(p=>p.id===target.playerId).portrait,null);
  f.portraits.players=f.portraits.players.filter(p=>p.playerId!==target.playerId);assert.equal(project(f).players[0].portrait,null);
  assert(project().players[0].portrait);
  f.portraits=null;assert.throws(()=>project(f));
});
test('no arbitrary remote portrait or path traversal',()=>{
  const f=copy();for(const p of f.core.players){p.presentation={Photo:'https://private.invalid/secret'};p.source_payload={Photo:'../../private'};}
  assert(project(f).players.every(p=>p.portrait===null));
});
test('canonical input untouched and no inferred lifecycle after scheduled time',()=>{
  const f=copy(),before=JSON.stringify(f),p=project(f);assert.equal(JSON.stringify(f),before);
  assert(p.matches.every(m=>m.status==='Upcoming'));assert(p.matches.every(m=>m.holes.every(h=>h.team1Gross===null)));
  assert.equal(homeSchedulePreview(p.schedule,{now:new Date('2026-09-25T13:00:00Z'),timeZone:p.tournament.timeZone}).event.title,'Round 1 - Best Ball');
});
test('scope mismatch or excessive response authority fails closed',()=>{
  const f=copy();f.core.tournament.tournament_id='2027';assert.throws(()=>project(f));
  const g=copy();g.guide.content.tournamentIdentity.timeZone='America/Chicago';assert.throws(()=>project(g));
  const h=copy();h.core.matches=Array(100).fill(h.core.matches[0]);assert.throws(()=>project(h));
});
for(const [session,pref,expected] of [['participant','yes','/home'],['participant','','/home'],['none','yes','/follow/today'],['none','','chooser'],['recovery','yes','recovery'],['invalid','yes','recovery'],['timeout','','recovery']]) {
  test(`entry precedence ${session}/${pref}`,()=>assert.equal(entryDestination(session,pref),expected));
}
test('old and chunked participant cookies cannot be silently hidden by preference',()=>{
  for(const name of ['sb-ymqhhtxaywtqllynrmxe-auth-token','sb-ymqhhtxaywtqllynrmxe-auth-token.0','sbi-player-passport','sbi-scoring-session'])assert(hasParticipantCookies([{name,value:'not-read'}]));
  assert(!hasParticipantCookies([{name:'bagger.following.v1',value:'yes'}]));assert(!hasParticipantCookies([]));
});
for(const path of [['net-skins'],['calcutta'],['calcutta','holdings'],['account'],['settings'],['me','verify-mobile'],['director'],['my-match'],['score'],['matches','../admin'],['players','CB01','private']]) {
  test('following route denies '+path.join('/'),()=>assert.equal(followingRoute(path),null));
}
test('allowed IDs are read selectors only',()=>{
  assert.deepEqual(followingRoute(['players','CB01']),{page:'players',id:'CB01'});
  assert.deepEqual(followingRoute(['matches','2026-R1-1']),{page:'matches',id:'2026-R1-1'});
});
for(const zone of ['America/New_York','America/Chicago','UTC']) {
  test('midnight and exact tee times independent of '+zone,()=>{
    const old=process.env.TZ;process.env.TZ=zone;
    try{const p=project();for(const day of [24,25,26]){
      const before=new Date(`2026-09-${day+1}T03:59:59Z`),after=new Date(`2026-09-${day+1}T04:00:00Z`);
      assert.equal(tournamentDayKey(before,p.tournament.timeZone),`2026-09-${day}`);
      assert.equal(tournamentDayKey(after,p.tournament.timeZone),`2026-09-${day+1}`);
      assert(todaysSchedule(p.schedule,{now:after,timeZone:p.tournament.timeZone}).every(e=>e.date===`2026-09-${day+1}`));
    }
    for(const [clock,title]of [['07:29','Round 1'],['07:30','Round 1'],['08:20','Round 1'],['13:59','Round 1'],['14:00','Round 1'],['14:50','Round 1']]){
      const now=tournamentDateTime('2026-09-25',clock,p.tournament.timeZone);assert(now);
      assert(homeSchedulePreview(p.schedule,{now,timeZone:p.tournament.timeZone}).event.title.includes(title));
      if(clock==='07:29')assert.equal(homeSchedulePreview(p.schedule,{now,timeZone:p.tournament.timeZone}).event.minutesUntil,1);
    }}finally{if(old===undefined)delete process.env.TZ;else process.env.TZ=old;}
  });
}
test('IANA winter and summer conversion, no fixed offset',()=>{
  assert.equal(tournamentDateTime('2026-01-20','07:30','America/New_York').toISOString(),'2026-01-20T12:30:00.000Z');
  assert.equal(tournamentDateTime('2026-09-25','07:30','America/New_York').toISOString(),'2026-09-25T11:30:00.000Z');
});
test('unpublished/withdrawn Odds never returns a snapshot',()=>{
  for(const state of ['UNPUBLISHED','WITHDRAWN']){
    const p=mobileProductionOddsView({tournament:{tournament_id:'2026'},publication:{state,authority:'SUPABASE',google_publication_fallback:false,publication_pointer_revision:4},snapshots:[{secret:'private-canary'}]},{tournamentId:'2026'});
    assert.deepEqual(mobileOddsDataFromView(p).snapshots,[]);
  }
});
test('History explicit projection drops private fields',()=>{
  const p=spectatorHistoryProjection({views:[{year:2025,tournament:{'Tournament Name':'Invitational',championTeam:{name:'Champions'},auth:'private-canary'},leaderboardRows:[{id:'CB01',player:{'Display Name':'Clay',email:'private-canary'},points:1}],calcutta:'private-canary'}]});
  assert(!JSON.stringify(p).includes('private-canary'));assert.equal(p.tournaments[0].players[0].name,'Clay');
});
test('bounded public payload/performance sanity, no per-hole fetches',()=>{
  const start=performance.now();for(let i=0;i<50;i++)assert(Buffer.byteLength(JSON.stringify(project()))<120000);
  assert(performance.now()-start<10000);
});
