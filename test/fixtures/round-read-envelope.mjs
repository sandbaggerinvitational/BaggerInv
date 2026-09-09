import assert from 'node:assert/strict';
import {normalizeProductionTournamentSetupPayload} from '../../lib/production-tournament-setup-contract.js';

export const handicapRevision='a19f4f10-28f7-46a9-8434-159cd07cc4b6';
export const roundPairs=[['JP01','MH01','MS01','JS01'],['DT01','AM01','CP01','JK01'],
  ['HM01','BA01','MM01','NJ01'],['CL01','BC01','CM01','CS01'],
  ['CB01','JK02','PN01','RM01'],['MS02','MB01','TL01','WO01']];
export const participants=ids=>ids.map((playerId,i)=>({playerId,teamSide:i<2?1:2,playerSlot:i%2+1}));

// Synthetic release-70 shape, not a new Production pairing proposal.
export function productionEnvelope() {
  const rounds=[{number:1,format:'BB'},{number:2,format:'SC'},{number:3,format:'SI'}];
  return {ok:true,data:{contractVersion:'production-tournament-setup-v1',revision:12,
    approvedHandicapRevisionId:handicapRevision,approvedHandicapRevisionNumber:7,
    teams:[],courses:[],rounds,
    roster:roundPairs.flatMap(ids=>participants(ids)).map(p=>({...p,displayName:p.playerId,
      membershipStatus:'ACTIVE',handicapRevisionId:handicapRevision,tournamentHandicap:5})),
    matches:rounds.flatMap(r=>Array.from({length:r.number===3?12:6},(_,i)=>({
      matchId:`2026-R${r.number}-${i+1}`,roundNumber:r.number,matchNumber:i+1,format:r.format,
      courseId:'TPGC01',tee:'Gold',teeTime:'07:30:00',detailsManaged:true,contextFingerprint:'a'.repeat(64),
      status:'UPCOMING',strictlyUnstarted:true,scoredHoles:0,accessActive:false,scoringReady:false,
      participants:r.number===1&&i<4?participants(roundPairs[i]):[],participantCount:r.number===1&&i<4?4:0,
      // Retained imported evidence is not current prepared scoring authority.
      snapshot:{id:`2026-R${r.number}-${i+1}:S1`,revision:1,prepared:true,current:false,preparedSetupRevision:0},
    }))),
  }};
}

export function assertCanonicalRoundReader(raw) {
  assert.equal(raw.ok,true);
  assert.ok(raw.data && typeof raw.data==='object');
  for(const field of ['matches','approvedHandicapRevisionId','approvedHandicapRevisionNumber'])
    assert.equal(Object.hasOwn(raw,field),false,`${field} must not be enriched outside data`);
  const model=normalizeProductionTournamentSetupPayload(raw);
  const r1=model.matches.filter(m=>m.roundNumber===1);
  assert.equal(r1.length,6,'must inspect six actual R1 matches, never an empty every()');
  assert.deepEqual(r1.map(m=>m.matchId),Array.from({length:6},(_,i)=>`2026-R1-${i+1}`));
  assert.ok(model.approvedHandicapRevisionId);
  assert.equal(model.approvedHandicapRevisionNumber,7);
  for(const match of r1) {
    assert.equal(match.detailsManaged,true,match.matchId);
    assert.match(match.contextFingerprint,/^[a-f0-9]{64}$/);
  }
  return model;
}
