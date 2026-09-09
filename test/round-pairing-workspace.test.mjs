import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createPairingDraft,mergePairingDrafts,pairingDirty,detailsDirty,validatePairingWorkspace} from '../lib/round-pairing-workspace.js';
import {buildTournamentSetupMutation} from '../lib/production-tournament-setup-contract.js';

const revision='a19f4f10-28f7-46a9-8434-159cd07cc4b6';
const ids=['JP01','MH01','DT01','AM01','BA01','CL01','CB01','HM01','JK02','MS02','MB01','BC01','MS01','JS01','CP01','JK01','CM01','CS01','MM01','NJ01','PN01','RM01','TL01','WO01'];
function fixture() {
  const roster=ids.map((playerId,i)=>({playerId,displayName:playerId,teamSide:i<12?1:2,membershipStatus:'ACTIVE',handicapRevisionId:revision,tournamentHandicap:'5'}));
  const matches=Array.from({length:6},(_,i)=>({matchId:`2026-R1-${i+1}`,roundNumber:1,matchNumber:i+1,format:'BB',participants:[],participantCount:0,courseId:'TPGC01',tee:'Gold',teeTime:'07:30:00',contextFingerprint:'baseline',detailsManaged:true,status:'UPCOMING',scoredHoles:0}));
  const drafts=Object.fromEntries(matches.map((m,i)=>[m.matchId,{...createPairingDraft(m),participants:[
    {playerId:ids[i*2],teamSide:1,playerSlot:1},{playerId:ids[i*2+1],teamSide:1,playerSlot:2},
    {playerId:ids[12+i*2],teamSide:2,playerSlot:1},{playerId:ids[13+i*2],teamSide:2,playerSlot:2}]}]));
  return {data:{revision:10,approvedHandicapRevisionId:revision,roster,matches},drafts};
}
test('all six drafts survive sequential single saves and tab-independent authority merges',()=>{
  const {data,drafts}=fixture(); let state=drafts;
  for(let i=0;i<2;i++) {
    data.matches[i]={...data.matches[i],participants:state[data.matches[i].matchId].participants,participantCount:4,contextFingerprint:`saved${i}`};
    state=mergePairingDrafts(state,data.matches);
    assert.equal(pairingDirty(state[data.matches[i].matchId]),false);
    for(let j=i+1;j<6;j++) assert.deepEqual(state[data.matches[j].matchId].participants,drafts[data.matches[j].matchId].participants);
  }
  const result=validatePairingWorkspace(data,state,1);
  assert.deepEqual(result.errors,[]);assert.equal(result.changed,4);assert.equal(result.coverage,24);
  const r2={...data.matches[0],matchId:'2026-R2-1',roundNumber:2};
  state=mergePairingDrafts(state,[...data.matches,r2]);
  state=mergePairingDrafts(state,[...data.matches,r2]);
  assert.deepEqual(state['2026-R1-6'].participants,drafts['2026-R1-6'].participants);
});
test('same-match tee time save preserves Players, clears details dirtiness and requires review',()=>{
  const {data,drafts}=fixture(),id='2026-R1-3';
  drafts[id].metadata.teeTime='08:00';
  assert.ok(detailsDirty(drafts[id]));
  assert.match(validatePairingWorkspace(data,drafts,1).errors.join(' '),/Save Match Details/);
  data.matches[2]={...data.matches[2],teeTime:'08:00:00',contextFingerprint:'updated'};
  const state=mergePairingDrafts(drafts,data.matches,{ownDetailsId:id});
  assert.deepEqual(state[id].participants,drafts[id].participants);
  assert.equal(detailsDirty(state[id]),false);assert.equal(state[id].needsReview,true);assert.equal(state[id].conflict,false);
});
test('revision-10 baseline retains the exact saved R1-1/R1-2 pairs in a four-change round review',()=>{
  const {data,drafts}=fixture();
  for(let i=0;i<2;i++) data.matches[i]={...data.matches[i],participants:drafts[data.matches[i].matchId].participants,participantCount:4};
  const canonical=structuredClone(data.matches.slice(0,2));
  const state=mergePairingDrafts(drafts,data.matches);
  const review=validatePairingWorkspace(data,state,1);
  assert.deepEqual(review.errors,[]);assert.equal(review.changed,4);assert.equal(review.changedAssignments,16);
  assert.deepEqual(review.assignments[0].participants.map(p=>p.playerId),['JP01','MH01','MS01','JS01']);
  assert.deepEqual(review.assignments[1].participants.map(p=>p.playerId),['DT01','AM01','CP01','JK01']);
  assert.deepEqual(data.matches.slice(0,2),canonical);
});
test('concurrent pairing/course changes retain drafts and fail closed until explicit resolution',()=>{
  const {data,drafts}=fixture();data.matches[2]={...data.matches[2],contextFingerprint:'other-actor'};
  const state=mergePairingDrafts(drafts,data.matches);
  assert.equal(state['2026-R1-3'].conflict,true);
  assert.deepEqual(state['2026-R1-3'].participants,drafts['2026-R1-3'].participants);
  assert.match(validatePairingWorkspace(data,state,1).errors.join(' '),/concurrently/);
});
test('full coverage, duplicates, missing identities, team and handicap validation',()=>{
  for(const kind of ['duplicate','missing','team','handicap','frozen','details']) {
    const {data,drafts}=fixture();
    if(kind==='duplicate')drafts['2026-R1-2'].participants[0].playerId='JP01';
    if(kind==='missing')drafts['2026-R1-2'].participants[0].playerId='';
    if(kind==='team')drafts['2026-R1-2'].participants[0].playerId='WO01';
    if(kind==='handicap')data.roster[0].handicapRevisionId='old';
    if(kind==='frozen')data.matches[0].locked=true;
    if(kind==='details')data.matches[0].detailsManaged=false;
    assert.ok(validatePairingWorkspace(data,drafts,1).errors.length,kind);
  }
});
test('concurrent metadata changes also block a details-only draft without overwriting it',()=>{
  const {data}=fixture(),match=data.matches[0];
  const old=createPairingDraft(match);old.metadata.teeTime='08:15';
  const state=mergePairingDrafts({[match.matchId]:old},[{...match,teeTime:'09:00',contextFingerprint:'concurrent-details'}]);
  assert.equal(state[match.matchId].metadata.teeTime,'08:15');
  assert.equal(state[match.matchId].savedMetadata.teeTime,'09:00');
  assert.equal(state[match.matchId].conflict,true);
});
test('individual save does not require a full round; exchanges require round review',()=>{
  const {data,drafts}=fixture(); delete drafts['2026-R1-6'];
  assert.deepEqual(validatePairingWorkspace(data,drafts,1,{fullRound:false,matchId:'2026-R1-1'}).errors,[]);
  data.matches[2].participants=[{playerId:'JP01',teamSide:1,playerSlot:1}];
  assert.match(validatePairingWorkspace(data,drafts,1,{fullRound:false,matchId:'2026-R1-1'}).errors.join(' '),/already saved/);
});
test('round request uses one normalized bounded operation and preserves unchanged matches',()=>{
  const {data,drafts}=fixture();const review=validatePairingWorkspace(data,drafts,1);
  const request=buildTournamentSetupMutation('replace-round-pairings',{roundNumber:1,matches:review.assignments,expectedHandicapRevisionId:revision,expectedRevision:10,operationRequestId:'20000000-0000-4000-8000-000000000001'});
  assert.equal(request.operation,'REPLACE_ROUND_PAIRINGS');assert.equal(request.matches.length,6);
  assert.deepEqual(Object.keys(request.matches[0].participants[0]).sort(),['player_id','player_slot','team_side']);
  assert.throws(()=>buildTournamentSetupMutation('replace-round-pairings',{roundNumber:1,matches:[],expectedRevision:10,operationRequestId:'20000000-0000-4000-8000-000000000001'}));
});
test('UI architecture: accessible round tabs, scoped reviews, no browser persistence or independent round calls',async()=>{
  const ui=await readFile(new URL('../app/admin/director/RoundPairingWorkspace.js',import.meta.url),'utf8');
  const panel=await readFile(new URL('../app/admin/director/ProductionTournamentSetupPanel.js',import.meta.url),'utf8');
  assert.match(ui,/role="tablist"/);assert.match(ui,/ArrowLeft/);assert.match(ui,/role="tabpanel"/);
  assert.match(ui,/filter\(m=>m.roundNumber===round\)/);assert.match(ui,/Review All Round/);assert.match(ui,/Review Match \{match.matchNumber\} Pairings/);
  assert.doesNotMatch(ui,/fetch\(|localStorage|sessionStorage/);
  assert.match(panel,/beforeunload/);assert.match(panel,/mergePairingDrafts/);assert.match(panel,/Confirm Round Pairings/);
});
