import test from 'node:test';
import assert from 'node:assert/strict';
import {publicMatchNavigationScope,publicRoundMatchNavigation} from '../lib/spectator-match-navigation.js';
import {createPublicGolfReader} from '../lib/spectator-golf-service.js';
import {rawFixture} from './fixtures/pn1-mobile.mjs';
import {publicMatchGolf} from '../lib/spectator-golf-projection.js';

function roundRows(round,count,{paired=true}={}) {
  return Array.from({length:count},(_,i)=>({
    match:{match_id:`opaque-${round}-${i+1}`,round_number:round,format:round===3?'SI':round===2?'SC':'BB',status:['UPCOMING','LIVE','FINAL'][i%3],scoring_locked:i%2===1},
    presentation:{match_sort_order:(i+1)*10},
    participants:paired?Array.from({length:round===3?2:4},(_,p)=>({player_id:`P${p+1}`})):[],
  }));
}
for(const [round,count]of [[1,6],[2,6],[3,12]])for(let position=1;position<=count;position++)test(`round ${round} match ${position}/${count} keeps exact canonical neighbors`,()=>{
  const rows=[...roundRows(1,6),...roundRows(2,6),...roundRows(3,12)].reverse();
  const scope=publicMatchNavigationScope(rows),raw={match:{match_id:`opaque-${round}-${position}`,round_number:round},navigation:{previous_match_id:'foreign',next_match_id:'foreign'}};
  assert.deepEqual(publicRoundMatchNavigation(raw,scope),{round_match_index:position,round_match_count:count,previous_match_id:position===1?null:`opaque-${round}-${position-1}`,next_match_id:position===count?null:`opaque-${round}-${position+1}`});
});
test('single-match round has neither previous nor next',()=>{
  const rows=roundRows(8,1);assert.deepEqual(publicRoundMatchNavigation(rows[0],publicMatchNavigationScope(rows)),{round_match_index:1,round_match_count:1,previous_match_id:null,next_match_id:null});
});
test('unpaired R3 cannot fabricate a scorecard chain or extend R2',()=>{
  const rows=[...roundRows(2,6),...roundRows(3,12,{paired:false})],scope=publicMatchNavigationScope(rows);
  assert.equal(publicRoundMatchNavigation(rows[5],scope).next_match_id,null);
  for(const raw of rows.slice(6))assert.throws(()=>publicRoundMatchNavigation(raw,scope),/SPECTATOR_UNAVAILABLE/);
  rows[6].participants=[{player_id:'P1'},{player_id:'P2'}];assert.throws(()=>publicRoundMatchNavigation(rows[6],publicMatchNavigationScope(rows)),/SPECTATOR_UNAVAILABLE/);
});
test('canonical assignment/order, not opaque ID spelling or lifecycle, determines navigation',()=>{
  const rows=roundRows(1,3);rows[0].match.match_id='R2-looking-id';rows[1].match.match_id='Z';rows[2].match.match_id='A';
  for(const status of ['UPCOMING','LIVE','LOCKED','FINAL']){rows.forEach(r=>r.match.status=status);assert.deepEqual(publicRoundMatchNavigation(rows[1],publicMatchNavigationScope(rows)),{round_match_index:2,round_match_count:3,previous_match_id:'R2-looking-id',next_match_id:'A'});}
});
test('missing/duplicate canonical navigation fails closed',()=>{
  const rows=roundRows(1,2);assert.throws(()=>publicMatchNavigationScope([rows[0],rows[0]]));
  assert.throws(()=>publicMatchNavigationScope([{...rows[0],presentation:{}}]));
  assert.throws(()=>publicRoundMatchNavigation({match:{match_id:'absent',round_number:1}},publicMatchNavigationScope(rows)));
});
test('public service overrides only navigation, preserves input and leaks no authority',async()=>{
  const rows=roundRows(1,6),raw=rawFixture({matchId:'opaque-1-6',owned:false});raw.navigation.next_match_id='opaque-2-1';
  const before=structuredClone(raw),read=createPublicGolfReader({guard:()=>{},core:async()=>({tournament:{tournament_id:'2026'},players:[],matches:rows}),match:async()=>raw});
  const actual=(await read(['match','opaque-1-6'])).data,expected=publicMatchGolf(raw);
  assert.deepEqual(actual.match.navigation,{roundMatchIndex:6,roundMatchCount:6,previousMatchId:'opaque-1-5',nextMatchId:null});
  delete actual.match.navigation;delete expected.match.navigation;assert.deepEqual(actual,expected);assert.deepEqual(raw,before);
  assert(!/netSkins|calcutta|authenticatedPlayer|myMatch|leaseToken|writeToken/.test(JSON.stringify(actual)));
});
