// Synthetic published facts only. Never loaded by a shipping route.
import { fullNetFixture } from './native-full-net-source.mjs';
import { calculateProductionFullNetSkins } from '../../lib/production-full-net.js';
import { mobileNetSkinsDataFromProductionView } from '../../lib/mobile-v1-net-skins.js';
import { mobileCalcuttaDataFromProductionView } from '../../lib/mobile-v1-calcutta.js';
export const identity = { tournamentId: '2026', playerId: 'P1' };
const fp = 'a'.repeat(64);
const freshness = { stale:false,updating:false,configured_at:'2026-09-01T12:00:00Z',calculated_at:'2026-09-02T12:00:00Z',published_at:'2026-09-02T13:00:00Z',source_fingerprint:fp };
const names = ['Alexandra Montgomery-Wellington','Christopher Alexander MacAllister','Taylor Kim','Morgan Lee'];
export function skinsView() {
 const rounds = ['BB','SC','SI'].map((format,i)=>{
  const input=fullNetFixture(format,i+1), raw=calculateProductionFullNetSkins(input).netSkins.rounds[0];
  const entries=raw.fullNetDetail.map(d=>({entry_id:d.entryId,entry_type:format==='SC'?'PAIRING':'INDIVIDUAL',match_id:d.matchId,player_ids:d.playerIds}));
  raw.participantLabels={tournamentName:'Local fixture invitational',entries:entries.map(e=>({entryId:e.entry_id,matchId:e.match_id,players:e.player_ids.map(id=>({playerId:id,name:names[Number(id.slice(1))-1]})),team:{teamId:'T1',name:'The Long-Named Championship Team'},course:{courseId:'C1',name:'Fixture Championship Course',tee:'Gold'}}))};
  const find=ids=>entries.find(e=>[...e.player_ids].sort().join() === [...ids].sort().join());
  return {round_id:`2026:R${i+1}`,round_number:i+1,format,entry_type:entries[0].entry_type,match_ids:[...new Set(entries.map(e=>e.match_id))],buy_in_per_entry:25,eligible_entry_count:entries.length,eligible_player_ids:entries.flatMap(e=>e.player_ids),state:'OFFICIAL',configuration_revision:1,result_revision:1,configuration_fingerprint:fp,freshness,entries,result_payload:raw,
  official_results:{pot:raw.pot,eligible_count:entries.length,completed_holes:18,skins_awarded:raw.skinsAwarded,skin_value:raw.skinValue,complete:true,finalized:true,
    skins:raw.skins.map(s=>{const ids=[s.winnerPlayerId,s.winnerPlayerId2].filter(Boolean),entry=find(ids);return {skin_id:`2026:R${i+1}:H${s.hole}`,hole_number:s.hole,match_id:entry.match_id,winner_entry_id:entry.entry_id,winner_player_ids:ids,winning_net_score:s.winningNetScore,skin_value:s.skinValue};}),
    leaderboard:raw.leaderboard.map((l,j)=>({entry_id:find(l.playerIds).entry_id,player_ids:l.playerIds,rank:j+1,display_rank:String(j+1),skins_won:l.skinsWon,total_winnings:l.totalWinnings,winning_hole_numbers:l.winningHoles.map(h=>h.hole)}))}};
 });
 return {contract_version:'production-net-skins-v1',tournament_id:'2026',state:'OFFICIAL',publication_policy:'OFFICIAL_ONLY',configuration_revision:1,result_revision:1,configuration_fingerprint:fp,revision:'net-skins-v1:1:1:OFFICIAL',freshness,rounds};
}
export function calcuttaView({ published=true, results=true }={}) {
 const player=id=>({id,name:names[Number(id.slice(1))-1]});
 const state=results?'IN_PROGRESS':'AUCTION_COMPLETE';
 return {contract_version:'production-calcutta-v1',tournament_id:'2026',state,publication_state:published?'PUBLISHED':'UNPUBLISHED',published,currency_code:'USD',configuration_revision:1,auction_revision:1,publication_revision:1,result_revision:results?1:null,configuration_fingerprint:fp,auction_fingerprint:fp,revision:`calcutta-v1:1:1:1:${results?1:0}:${state}:${published?'PUBLISHED':'UNPUBLISHED'}`,freshness,
 market:published?{pot:'300',purchases:['P1','P2'].map((id,i)=>({player:player(id),purchase_price:i?100:200,owners:[{player:player('P1'),ownership_fraction:'1'}]}))}:null,
 result:published&&results?{tournamentComplete:false,completedRounds:[1],distributedPrizePool:60,guaranteedDistributed:60,golfers:['P1','P2'].map((id,i)=>({player:player(id),rank:i+1,tieSize:1,rounds:[{round:1,format:'BB',gross:75+i,net:68+i,place:i+1,points:30-i*10,guaranteedWinnings:i?20:40}],totalPoints:30-i*10,currentPayoutValue:i?20:40,guaranteedWinnings:i?20:40,netProfit:i?-80:-160,roi:-0.8})),portfolios:[{owner:player('P1'),rank:1,purchaseCost:300,guaranteedWinnings:60,currentPayoutValue:60,netProfit:-240,roi:-0.8,investments:['P1','P2'].map((id,i)=>({player:player(id),ownership:1,purchasePrice:i?100:200,guaranteedWinnings:i?20:40,currentPayoutValue:i?20:40,netProfit:i?-80:-160,roi:-0.8}))}]}:null};
}
export function sideGamesFixtures() {
 const raw=skinsView();
 const hidden={...raw,state:'CONFIGURED',revision:'net-skins-v1:1:0:CONFIGURED',result_revision:null,rounds:raw.rounds.map(r=>({...r,state:'CONFIGURED',result_revision:null,official_results:null,result_payload:null}))};
 return { skins:mobileNetSkinsDataFromProductionView(raw,identity), skinsUnavailable:mobileNetSkinsDataFromProductionView(hidden,identity), calcutta:mobileCalcuttaDataFromProductionView(calcuttaView(),identity), calcuttaAuction:mobileCalcuttaDataFromProductionView(calcuttaView({results:false}),identity),calcuttaUnavailable:mobileCalcuttaDataFromProductionView(calcuttaView({published:false}),identity) };
}
