import { FULL_NET_POLICY } from '../../lib/production-full-net.js';
export function fullNetFixture(format='BB',round=1) {
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

