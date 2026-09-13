import assert from 'node:assert/strict';
import test from 'node:test';
import {fullNetFixture} from './fixtures/native-full-net-source.mjs';
import {calculateProductionFullNetSkins} from '../lib/production-full-net.js';
import {productionNetSkinsPresentation} from '../lib/mobile-v1-net-skins-presentation.js';
function published() {
 const input=fullNetFixture('SI',3), raw=calculateProductionFullNetSkins(input).netSkins.rounds[0];
 const entries=raw.fullNetDetail.map(d=>({entryId:d.entryId,matchId:d.matchId,playerIds:d.playerIds}));
 raw.participantLabels={tournamentName:'Fixture tournament',entries:entries.map(e=>({...e,players:e.playerIds.map(playerId=>({playerId,name:playerId})),team:{teamId:'team',name:'Team'},course:{courseId:'course',name:'Course',tee:'Tee'},privateData:'must not escape'}))};
 const find=ids=>entries.find(e=>[...e.playerIds].sort().join() === [...ids].sort().join());
 const round={roundId:'test:R3',roundNumber:3,format:'SI',state:'OFFICIAL',eligibleEntryCount:entries.length,entries,officialResults:{pot:raw.pot,skinsAwarded:raw.skinsAwarded,skinValue:raw.skinValue,skins:raw.skins.map(s=>({holeNumber:s.hole,winnerEntryId:find([s.winnerPlayerId]).entryId,winningNetScore:s.winningNetScore,skinValue:s.skinValue})),leaderboard:raw.leaderboard.map(l=>({entryId:find(l.playerIds).entryId,skinsWon:l.skinsWon,totalWinnings:l.totalWinnings,winningHoleNumbers:l.winningHoles.map(h=>h.hole)}))}};
 return {raw,view:{rounds:[{round_id:'test:R3',result_payload:raw}]},contract:{tournamentId:'test',configurationFingerprint:'a'.repeat(64),revision:'net-skins-v1:1:1:OFFICIAL',rounds:[round]}};
}
test('published Net Skins projects stored scores/outcomes/payouts without private payload',()=>{
 const {raw,view,contract}=published(), before=JSON.stringify(view);
 const p=productionNetSkinsPresentation(view,contract,'viewer');
 assert.equal(JSON.stringify(view),before);assert.equal(p.published,true);assert.equal(p.rounds[0].pot,raw.pot);
 assert.equal(p.rounds[0].holes[0].participants[0].fullNet,raw.fullNetDetail[0].holes[0].fullNet);
 assert.equal(p.rounds[0].holes[0].participants[0].fullCourseHandicapStrokes,raw.fullNetDetail[0].holes[0].fullCourseHandicapStrokes);
 assert.equal(JSON.stringify(p).includes('privateData'),false);assert.equal(p.rounds[0].publicationState,'PUBLISHED');
});
test('unpublished/withdrawn/legacy source cannot produce saved official detail',()=>{
 let {view,contract}=published();contract.rounds[0].state='CONFIGURED';assert.equal(productionNetSkinsPresentation(view,contract,'viewer'),null);
 ({view,contract}=published());delete view.rounds[0].result_payload.participantLabels;assert.equal(productionNetSkinsPresentation(view,contract,'viewer'),null);
});
test('mismatched stored hole outcome is rejected rather than recalculated',()=>{
 const {view,contract}=published();view.rounds[0].result_payload.leaderboard[0].holeResults[0].net=999;
 assert.throws(()=>productionNetSkinsPresentation(view,contract,'viewer'));
});
