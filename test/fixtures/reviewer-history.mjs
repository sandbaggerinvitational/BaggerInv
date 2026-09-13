// Canonical participant-safe 2025-R3-10 facts inspected read-only in Production.
// Used only by local tests. Runtime authorization never imports this fixture.
import {buildCompletedHistoryPresentation} from '../../lib/completed-history-presentation-adapter.js';
export const historicalFixture={tournamentId:'2025',year:2025,revisionId:'1143cada-a6de-495d-ba49-e3c83ea944fe',matchId:'2025-R3-10',bindingRevision:1};
const pars=[4,4,5,4,3,4,4,4,4,3,3,5,4,3,5,4,3,5];
const yards=[370,368,499,463,199,316,464,400,406,206,148,529,444,145,539,338,208,591];
const indexes=[9,11,7,3,17,13,1,5,15,14,18,6,2,16,10,12,8,4];
export function historicalCanonicalData() {
 const revision_id=historicalFixture.revisionId,match_id=historicalFixture.matchId,tournament_id='2025';
 return {revision:{revision_id,tournament_year:2025},tournament:{tournament_id,tournament_year:2025,lifecycle:'FINAL',timezone:null,destination:'Bandon Dunes',score_availability:'RECORDED',source_payload:{}},
 teams:[{team_id:'BANDONBROS',team_side:1,name:'Bandon Brothers'},{team_id:'CRISPYBOYS',team_side:2,name:'Crispy Boys'}],
 roster:[{player_id:'MB01',display_name:'Miles Berger',team_id:'BANDONBROS',team_side:1},{player_id:'DR01',display_name:'David Rees-Jones',team_id:'CRISPYBOYS',team_side:2}],
 rounds:[{round_number:3,format:'SI',course_appearance_id:'2025-R3',name:'Round 3',team_size:1}],
 course_appearances:[{revision_id,tournament_id,appearance_id:'2025-R3',round_number:3,course_id:'PDGC03',display_name:'Pacific Dunes Golf Course',tee:'Black',rating:73.2,slope:143,yardage:6633,par:71,hole_definitions:pars.map((par,i)=>({hole_number:i+1,par,yardage:yards[i],stroke_index:indexes[i]}))}],
 matches:[{revision_id,tournament_id,match_id,round_number:3,format:'SI',course_appearance_id:'2025-R3',lifecycle:'FINAL',completion_state:'LEGACY_FINAL',scorecard_coverage:'COMPLETE',result:'Team 2',result_winner:'TEAM_2',team_1_points:0,team_2_points:3,points_available:3,points_availability:'RECORDED',source_payload:{match_number:10,segments:{front:null,back:null,overall:'TEAM_2'}}}],
 match_participants:[{revision_id,match_id,player_id:'MB01',team_side:1,player_slot:1,applied_handicap:2,applied_strokes:0},{revision_id,match_id,player_id:'DR01',team_side:2,player_slot:1,applied_handicap:9,applied_strokes:7}],
 scorecards:[['MB01',1,[4,3,5,5,3,3,5,5,4,4,6,5,4,3,4,4,3,6]],['DR01',2,[5,5,5,6,3,3,5,5,4,4,3,7,3,3,5,3,4,4]]].map(([player_id,team_side,hole_values])=>({revision_id,match_id,scorecard_id:`${match_id}:${player_id}`,entity_kind:'PLAYER',player_id,team_side,player_slot:1,coverage_status:'COMPLETE',recorded_holes:18,hole_values,score_semantics:{course_id:'PDGC03',score_type:'INDIVIDUAL',course_appearance_id:'2025-R3'},source_payload:{}})),awards:[],record_eligibility:[]};
}
export const historicalView=()=>buildCompletedHistoryPresentation(historicalCanonicalData());
