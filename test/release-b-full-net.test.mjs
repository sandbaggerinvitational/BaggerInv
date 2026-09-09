import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {FULL_NET_POLICY,calculateProductionFullNetSkins,calculateProductionFullNetCalcutta,fullNetAuthority} from '../lib/production-full-net.js';
import {calculateCalcuttaFromCanonicalRoundResults} from '../lib/calcutta-supabase.js';

function fixture(format='BB',round=1) {
  const matchId=`test-R${round}-1`,team=format==='SC',ids=team?[['P1','P2'],['P3','P4']]:format==='BB'?[['P1'],['P2'],['P3'],['P4']]:[['P1'],['P2']];
  const entries=ids.map((players,i)=>({entityId:team?`${matchId}:S${i+1}`:players[0],playerIds:players,scope:team?'TEAM':'PLAYER',
    teamSide:team?i+1:Math.floor(i/(format==='BB'?2:1))+1,fullCourseHandicapStrokes:0,complete:true,totalGross:72,totalFullNet:72,
    holes:Array.from({length:18},(_,h)=>({hole:h+1,par:4,strokeIndex:h+1,gross:4,fullCourseHandicapStrokes:0,fullNet:4}))}));
  // These are deliberately authored projection facts, not live/QA tournament data.
  entries[0].holes[0]={hole:1,par:4,strokeIndex:1,gross:4,fullCourseHandicapStrokes:1,fullNet:3};
  entries[0].fullCourseHandicapStrokes=1;entries[0].totalFullNet=71;
  const match={policy:FULL_NET_POLICY,tournamentId:'test',matchId,roundNumber:round,format,entries,
    authorityAvailable:true,official:true,snapshotId:`${matchId}:S1`,snapshotHash:'a'.repeat(64),handicapRevisionId:'revision-test',handicapRevisionFingerprint:'b'.repeat(64)};
  const configured=ids.map((players,i)=>({entry_id:`E${i}`,round_number:round,match_number:matchId,format,player_id_1:players[0],
    player_id_2:players[1]||null,buy_in:team?50:25,eligible:true,team_handicap:999,individual_stroke_allocation:999,
    source_payload:{'Canonical Match ID':matchId,'Net Handicap Basis':FULL_NET_POLICY,
      'Entry Key':`E${i}`,'Entry Revision':1,'Entry Binding Fingerprint':`binding${i}`}}));
  return {tournament:{tournament_id:'test',tournament_year:2030,id:'test',year:2030},
    full_net_authority:{policy:FULL_NET_POLICY,tournamentId:'test',matches:[match]},configurations:[{entries:configured}],
    net_skins_entry_authority:{contract:'production-net-skins-entries-v1',tournamentId:'test',rounds:[{
      roundNumber:round,configured:true,state:'ENTRIES_SAVED',revision:1,
      entrants:ids.map((playerIds,i)=>({key:`E${i}`,playerIds,matchId,entered:true,bindingFingerprint:`binding${i}`}))}]},
    players:ids.flat().map(id=>({id,name:id})),rounds:[{number:round,status:'FINAL',matches:[{id:matchId,status:'FINAL'}]}],
    sourceRevision:{matches:[],holes:[]},matches:[{match:{match_id:matchId,round_number:round,format},
      participants:ids.flat().map(id=>({player_id:id,display_name:id}))}]};
}

for(const [format,round] of [['BB',1],['SC',2],['SI',3]]) test(`Release B ${format}: explicit Full Net, opt-in, ties, payouts and unavailable states`,()=>{
  const view=fixture(format,round),initial=calculateProductionFullNetSkins(view).netSkins.rounds[0];
  assert.equal(initial.skinsAwarded,1);assert.equal(initial.skins[0].winnerPlayerId,'P1');
  assert.equal(initial.pot,format==='SI'?50:100);assert.equal(initial.skinValue,initial.pot);
  assert.equal(initial.finalized,true);assert.equal(initial.fullNetDetail.length,format==='BB'?4:2);
  // Configured Matchup/Playing-HCP values do not override the supplied Full Net.
  const changed=structuredClone(view);changed.configurations[0].entries.push({...changed.configurations[0].entries[0],entry_id:'ineligible-duplicate',eligible:false,individual_stroke_allocation:-999});
  assert.deepEqual(calculateProductionFullNetSkins(changed),calculateProductionFullNetSkins(view));
  changed.configurations[0].entries[0].eligible=false;
  const excluded=calculateProductionFullNetSkins(changed).netSkins.rounds[0];
  assert.equal(excluded.skinsAwarded,format==='BB'?0:18);assert.ok(excluded.fullNetDetail.every(e=>!e.playerIds.includes('P1')));
  assert.equal(excluded.pot,initial.pot-(format==='SC'?50:25));
  const duplicate=structuredClone(view);duplicate.configurations[0].entries.push({...duplicate.configurations[0].entries[0],entry_id:'dup'});
  assert.throws(()=>calculateProductionFullNetSkins(duplicate),/Duplicate opted-in/);
  const missing=structuredClone(view);missing.full_net_authority.matches[0].authorityAvailable=false;
  assert.equal(calculateProductionFullNetSkins(missing).netSkins.rounds[0].finalized,false);
  const reopened=structuredClone(view);reopened.full_net_authority.matches[0].official=false;
  assert.equal(calculateProductionFullNetSkins(reopened).netSkins.rounds[0].resultState,'PROVISIONAL');
  const tie=structuredClone(view);tie.full_net_authority.matches[0].entries[1].holes[0].fullNet=3;
  assert.equal(calculateProductionFullNetSkins(tie).netSkins.rounds[0].skinsAwarded,0);
  const plus=structuredClone(view);plus.full_net_authority.matches[0].entries[0].holes[17].fullCourseHandicapStrokes=-1;
  plus.full_net_authority.matches[0].entries[0].holes[17].fullNet=5;
  assert.equal(calculateProductionFullNetSkins(plus).scoreRows[0].scorecard[17].strokes,-1);
  const legacy=structuredClone(view);delete legacy.configurations[0].entries[0].source_payload['Net Handicap Basis'];
  assert.throws(()=>calculateProductionFullNetSkins(legacy),/Legacy implicit eligibility/);
  const mismatch=structuredClone(view);mismatch.full_net_authority.tournamentId='other';
  assert.throws(()=>calculateProductionFullNetSkins(mismatch),/Bound Full-Net/);
  const stale=structuredClone(view);stale.net_skins_entry_authority.rounds[0].entrants[0].entered=false;
  assert.throws(()=>calculateProductionFullNetSkins(stale),/consent is stale/);
  const revision=structuredClone(view);revision.net_skins_entry_authority.rounds[0].revision=2;
  assert.throws(()=>calculateProductionFullNetSkins(revision),/consent is stale/);
});

test('Release B Calcutta reuses exact financial engine, pair/player allocation and tieSize',()=>{
  const core=fixture('SC',2),ids=core.players.map(p=>p.id);
  const config={tournament:core.tournament,configuration:{tournament_year:2030,
    purchases:ids.map(id=>({player_id:id,purchase_price:100})),
    ownership:ids.flatMap(id=>[{player_id:id,owner_player_id:'P1',ownership_fraction:.25},{player_id:id,owner_player_id:'P2',ownership_fraction:.75}]),
    point_structure:[{place:1,round_1_award:10,round_2_award:20,round_3_award:30},{place:2,round_1_award:5,round_2_award:10,round_3_award:15}],
    payout_structure:[{place:1,round_1_fraction:.1,round_2_fraction:.1,round_3_fraction:.1,overall_fraction:.5},{place:2,round_1_fraction:.05,round_2_fraction:.05,round_3_fraction:.05,overall_fraction:.05}]}};
  const actual=calculateProductionFullNetCalcutta(config,core);
  const rows=core.full_net_authority.matches[0].entries.map(e=>({Year:2030,Round:2,Format:'SC','Player IDs':e.playerIds.join(','),
    'Gross Score':e.totalGross,'Net Score':e.totalFullNet,'Full Course Handicap':e.fullCourseHandicapStrokes,'Calcutta Handicap Policy':FULL_NET_POLICY}));
  const direct=calculateCalcuttaFromCanonicalRoundResults(config,core,rows,{engineVersion:'calcutta-full-net-v3',policy:FULL_NET_POLICY});
  assert.deepEqual(actual.calcutta,direct.calcutta);
  const omitTimestamp=p=>JSON.parse(JSON.stringify(p,(key,value)=>key==='Updated At'?undefined:value));
  assert.deepEqual(omitTimestamp(actual.publication),omitTimestamp(direct.publication));
  assert.equal(actual.canonicalRoundResults.length,2);assert.equal(actual.canonicalInputVerification.matchupNetUsed,false);
  const tie=structuredClone(core);tie.full_net_authority.matches[0].entries[1].totalFullNet=71;
  const tied=calculateProductionFullNetCalcutta(config,tie);assert.ok(tied.calcutta);
  assert.equal(tied.calcutta.golfers[0].rounds[2].points,7.5,'pair award averages 20/10 then splits equally');
  assert.equal(tied.calcutta.golfers[0].rounds[2].place,1);
  assert.equal(tied.calcutta.golfers[0].rounds[2].tieSize,2,'two tied pairs, not four tied individual assets');
  assert.equal(actual.calcutta.pot,400);
  const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
  close(actual.calcutta.golfers.reduce((s,g)=>s+g.currentPayoutValue,0),actual.calcutta.distributedPrizePool);
  close(actual.calcutta.portfolios.reduce((s,p)=>s+p.currentPayoutValue,0),actual.calcutta.distributedPrizePool);
  close(actual.calcutta.portfolios.reduce((s,p)=>s+p.purchaseCost,0),400);
  close(actual.calcutta.portfolios.reduce((s,p)=>s+p.guaranteedWinnings,0),actual.calcutta.guaranteedDistributed);
  const noSkins=structuredClone(core);noSkins.net_skins_entry_authority.rounds=[];noSkins.configurations=[];
  assert.deepEqual(calculateProductionFullNetCalcutta(config,noSkins).calcutta,actual.calcutta,'Skins consent has no Calcutta effect');
  const unavailable=structuredClone(core);unavailable.full_net_authority.matches[0].entries[0].complete=false;
  assert.throws(()=>calculateProductionFullNetCalcutta(config,unavailable),/unavailable/);
  const upcoming=structuredClone(unavailable);upcoming.rounds[0].status='UPCOMING';upcoming.rounds[0].matches[0].status='UPCOMING';
  assert.equal(calculateProductionFullNetCalcutta(config,upcoming).canonicalRoundResults.length,0);
});

for(const [format,round] of [['BB',1],['SI',3]])test(`Calcutta ${format} consumes full player totals, not generic ranking Net`,()=>{
  const core=fixture(format,round),ids=core.players.map(p=>p.id);
  const config={tournament:core.tournament,configuration:{tournament_year:2030,purchases:ids.map(id=>({player_id:id,purchase_price:100})),
    ownership:ids.map(id=>({player_id:id,owner_player_id:'P1',ownership_fraction:1})),
    point_structure:ids.map((id,i)=>({place:i+1,round_1_award:100-i*10,round_2_award:100-i*10,round_3_award:100-i*10})),
    payout_structure:ids.map((id,i)=>({place:i+1,round_1_fraction:i===0?.1:0,round_2_fraction:0,round_3_fraction:i===0?.1:0,overall_fraction:i===0?.9:0}))}};
  const result=calculateProductionFullNetCalcutta(config,core);
  assert.equal(result.canonicalRoundResults[0]['Net Score'],71);
  assert.equal(result.canonicalRoundResults[0]['Gross Score'],72);
  assert.equal(result.calcutta.golfers.find(g=>g.playerId==='P1').rounds[round].place,1);
  assert.equal(result.calcutta.pot,ids.length*100);
  const other=structuredClone(core);other.net_skins_entry_authority=null;
  assert.deepEqual(calculateProductionFullNetCalcutta(config,other).calcutta,result.calcutta);
});

test('Release B migration retains numeric final boundaries, explicit policy and inert history',async()=>{
  const sql=await readFile(new URL('../supabase/production_migrations/202609090099_production_full_net_consumers_v3.sql',import.meta.url),'utf8');
  assert.match(sql,/round\(min\(course_handicap\)\*0\.35\+max\(course_handicap\)\*0\.15,0\)/);
  assert.match(sql,/s\.handicap_revision_id/);assert.match(sql,/APPROVED','SUPERSEDED/);
  assert.match(sql,/abs\(allocation\)\/18/);assert.match(sql,/18-abs\(allocation\)%18/);
  assert.doesNotMatch(sql,/create or replace function.*(?:mutate_production_round_pairings|handicap_v1_match_context|odds_publication)/);
  assert.doesNotMatch(sql,/insert into scoring_authority\.(?:handicap|calcutta|net_skins|matches|hole_scores)/i);
});
