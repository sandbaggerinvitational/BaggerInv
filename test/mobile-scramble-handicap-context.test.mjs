import test from 'node:test';
import assert from 'node:assert/strict';
import { mobileScrambleHandicapContext } from '../lib/mobile-scramble-handicap-context.js';
import { tournamentLiveDataFromSupabaseView } from '../lib/tournament-live-supabase.js';
import { scrambleView } from './fixtures/match-center-handicaps.mjs';
const values = snapshot => Object.values(mobileScrambleHandicapContext(snapshot));
const context = (a,b,sa,sb) => ({team_configuration:{team_1_playing_handicap:a,team_2_playing_handicap:b,team_1_strokes:sa,team_2_strokes:sb}});
test('missing or incomplete frozen context is unavailable, including legacy zero strokes',()=>{
 for(const snapshot of [undefined,{}, {team_configuration:{team_1_strokes:0,team_2_strokes:0}}, context(null,0,0,0),context('',0,0,0),context(false,0,0,0),context(0,0,null,0),context(1,0,-1,0)]) assert.deepEqual(values(snapshot),[null,null,null,null]);
});
test('explicit frozen zero and nonzero values survive without recomputation',()=>{
 assert.deepEqual(values(context(0,0,0,0)),[0,0,0,0]);
 assert.deepEqual(values(context('3.25',1,2,0)),[3.25,1,2,0]);
 assert.deepEqual(values(context(-2,1,0,3)),[-2,1,0,3]);
});
test('mobile ignores stale display zeros and uses frozen snapshot, without changing web or inputs',()=>{
 const view=scrambleView(); const before=structuredClone(view);
 const first = options => tournamentLiveDataFromSupabaseView(view,options).rounds[0].matches[0];
 assert.equal(first({mobileContract:true}).team1PlayingHcp,null);
 assert.equal(first({mobileContract:true}).team1Stroke,null);
 assert.deepEqual(view,before);
 Object.assign(view.matches[0].snapshot,context(3,2,1,0));
 const frozen=first({mobileContract:true});
 assert.deepEqual([frozen.team1PlayingHcp,frozen.team2PlayingHcp,frozen.team1Stroke,frozen.team2Stroke],[3,2,1,0]);
 assert.equal(first({}).team1PlayingHcp,0,'legacy non-mobile projection unchanged');
 Object.assign(view.matches[0].snapshot,context(0,0,0,0));
 assert.equal(first({mobileContract:true}).team1PlayingHcp,0);
});
