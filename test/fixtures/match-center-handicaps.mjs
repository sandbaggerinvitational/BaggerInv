// Read-only Production-shaped certification fixture (2026-09-09, revision 7).
// No GHIN/source evidence or credentials; never submitted to a mutation API.
import { courseHandicap } from "../../lib/prediction-engine.js";
export const scramblePairs = [
  [["CL01",7.9],["AM01",10.8],["WO01",.4],["CM01",11.6]],
  [["MS02",1.6],["MH01",6.1],["PN01",4.2],["JS01",7.5]],
  [["HM01",1.5],["CB01",12.2],["RM01",-.7],["CS01",13.8]],
  [["JP01",2.8],["DT01",5.7],["MS01",.7],["NJ01",7.8]],
  [["MB01",-.8],["BA01",7.9],["MM01",1],["JK01",9.8]],
  [["BC01",8],["JK02",13],["CP01",8.5],["TL01",12.4]],
];
export const expectedScramble = [[6,3,3,0],[2,4,0,2],[3,3,0,0],[3,2,1,0],[1,3,0,2],[6,6,0,0]];
const par = [4,3,5,4,4,3,4,4,5,4,5,3,4,3,5,4,4,4];
const si = [13,11,17,1,5,9,7,15,3,4,18,8,10,16,14,6,12,2];
const yards = [345,162,521,446,385,176,343,348,548,423,481,215,400,163,525,390,356,393];
export function scrambleView(pairs = scramblePairs) {
  const view = {
    tournament: { tournament_id: "2026", tournament_year: 2026 },
    teams: [{team_id:"PICKLES",team_side:1,name:"The Pickles"},{team_id:"LIPPIT",team_side:2,name:"Lipp it and Rip it"}],
    rounds: [{ round_number: 2, format: "SC" }],
    players: [], matches: [], tournament_presentation: { presentation: { tournamentMatchDisplay: {} } },
  };
  pairs.forEach((pair, index) => {
    const id = `2026-R2-${index+1}`;
    const participants = pair.map(([player_id, h], i) => ({ player_id, display_name: player_id,
      team_side: Math.floor(i/2)+1, player_slot: i%2+1, handicap_index: h,
      course_handicap: courseHandicap(h,72.7,138,72), playing_handicap:0, final_strokes:0 }));
    view.players.push(...participants.map(p => ({ player_id:p.player_id, display_name:p.display_name,
      team_side:p.team_side, team_id:p.team_side===1?"PICKLES":"LIPPIT", participation_status:"ACTIVE",
      tournament_source_payload:{"Tournament Handicap":p.handicap_index} })));
    view.matches.push({ match: { match_id:id,tournament_id:"2026",round_number:2,format:"SC",status:"UPCOMING",
      scoring_snapshot_id:`${id}:S1`,
      scoring_locked:false,scored_holes:0,current_hole:0,unresolved_mutations:0,scorecard_complete:false,
      clinched:false,result_winner:"",finalized_at:null, team_1_points:0,team_2_points:0 },
    snapshot:{ snapshot_id:`${id}:S1`,course_id:"CPGC01",tee:"Black",rating:72.7,slope:138,par:72,format:"SC",
      participant_configuration:{all_ids:[],team_1:[],team_2:[]},team_configuration:{team_1_strokes:0,team_2_strokes:0} },
    participants,scores:[],holes:par.map((p,i)=>({hole_number:i+1,par:p,stroke_index:si[i],yardage:yards[i]})) });
    view.tournament_presentation.presentation.tournamentMatchDisplay[id] = {
      team1PlayingHcp:0,team2PlayingHcp:0,team1Stroke:null,team2Stroke:null,
    };
  });
  return view;
}
