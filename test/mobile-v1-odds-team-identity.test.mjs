import assert from 'node:assert/strict';
import test from 'node:test';
import {mobileOddsWithCanonicalTeams,mobileOddsDataFromView,mobileOddsResult} from '../lib/mobile-v1-odds.js';
import {oddsView} from './fixtures/pn1-mobile.mjs';
const identity={tournamentId:'2026',playerId:'CB01',authUserId:'AUTH',context:{authUserId:'AUTH',playerId:'CB01',tournament:{id:'2026'},membership:{active:true}}};
const core=()=>({tournament:{tournament_id:'2026'},teams:[{team_id:'PICKLES',team_side:1},{team_id:'LIPPIT',team_side:2}]});
test('Canonical tournament team IDs fill only missing response identity; publication and all values unchanged',()=>{
 const source=oddsView(),original=structuredClone(source),canonical=core();
 const enriched=mobileOddsWithCanonicalTeams(source,canonical,identity);
 assert.deepEqual(source,original);assert.deepEqual(enriched.publication,original.publication);
 assert.deepEqual(enriched.snapshots[0].payload.teams.map(t=>t.teamId),['PICKLES','LIPPIT']);
 const stripped=structuredClone(enriched);for(const s of stripped.snapshots)for(const t of s.payload.teams)delete t.teamId;
 assert.deepEqual(stripped,source);assert.deepEqual(mobileOddsDataFromView(enriched).snapshots[0].teams.map(t=>t.teamId),['PICKLES','LIPPIT']);
});
for(const [name,change]of[
 ['wrong tournament',c=>c.tournament.tournament_id='2027'],['missing team',c=>c.teams.pop()],
 ['duplicate side',c=>c.teams[1].team_side=1],['duplicate ID',c=>c.teams[1].team_id='PICKLES'],
 ['missing ID',c=>c.teams[0].team_id=null],['invalid ID',c=>c.teams[0].team_id='unsafe / ID']
])test(name+' fails closed without deriving identities from names',()=>{const c=core();change(c);assert.throws(()=>mobileOddsWithCanonicalTeams(oddsView(),c,identity),{code:'MOBILE_API_UNAVAILABLE'});});
test('Existing canonical IDs stay unchanged; contradictory IDs denied',()=>{
 const v=oddsView();v.snapshots[0].payload.teams[0].teamId='PICKLES';assert.equal(mobileOddsWithCanonicalTeams(v,core(),identity).snapshots[0].payload.teams[0],v.snapshots[0].payload.teams[0]);
 v.snapshots[0].payload.teams[0].teamId='OTHER';assert.throws(()=>mobileOddsWithCanonicalTeams(v,core(),identity),{code:'MOBILE_API_UNAVAILABLE'});
});
function production(){const v=oddsView();return {tournament:{tournament_id:'2026'},publication:{authority:'SUPABASE',google_publication_fallback:false,state:'PUBLISHED',publication_pointer_revision:4,current_publication_revision:4,snapshot_id:'S',published_at:v.publication.published_at},snapshots:v.snapshots.map(s=>({...s,publication_state_revision:4,publication_lifecycle:'PUBLISHED'}))};}
test('Production performs authorized canonical reads and revalidates runtime after team identity lookup',async()=>{
 let checks=0,reads=0;const result=await mobileOddsResult(identity,{env:{VERCEL_ENV:'production'},dependencies:{readCurrentTournamentRuntime:async()=>{checks++;return {tournamentId:'2026',lifecycle:'ACTIVE',pointerRevision:1};},readPublishedOddsView:async()=>({payload:{ok:true,data:production()}}),readLeaderboardsCoreView:async(t)=>{assert.equal(checks,1);assert.equal(t,'2026');reads++;return {payload:{ok:true,data:core()}};}}});assert.equal(checks,2);assert.equal(reads,1);assert.equal(result.status,200);
});
test('Canonical team read failure and runtime change deny response',async()=>{
 for(const changed of [false,true]){let checks=0;await assert.rejects(mobileOddsResult(identity,{env:{VERCEL_ENV:'production'},dependencies:{readCurrentTournamentRuntime:async()=>({tournamentId:'2026',lifecycle:'ACTIVE',pointerRevision:++checks>1&&changed?2:1}),readPublishedOddsView:async()=>({payload:{ok:true,data:production()}}),readLeaderboardsCoreView:async()=>({payload:{ok:changed,data:core()}})}}),{code:'MOBILE_API_UNAVAILABLE'});}
});
