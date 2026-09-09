import { scrambleView } from './match-center-handicaps.mjs';
import { courseHandicap } from '../../lib/prediction-engine.js';

// Transaction-enforced read-only Production audit, 2026-09-09, revision 7.
// ID, approved H, persisted integer PH, persisted final_strokes, display label.
export const bestBallRows = [
  [['JP01',2.8,3,2,'3.3'],['MH01',6.1,7,6,'7.2'],['MS01',.7,1,0,'0.7'],['JS01',7.5,9,7,'8.9']],
  [['DT01',5.7,7,0,'6.8'],['AM01',10.8,13,6,'12.9'],['CP01',8.5,10,3,'10.1'],['JK01',9.8,12,4,'11.7']],
  [['HM01',1.5,2,1,'1.7'],['BA01',7.9,9,7,'9.4'],['MM01',1,1,0,'1.1'],['NJ01',7.8,9,7,'9.3']],
  [['MB01',-.8,-1,0,'(1.1)'],['CB01',12.2,15,14,'14.6'],['WO01',.4,0,1,'0.4'],['PN01',4.2,5,5,'5.0']],
  [['MS02',1.6,2,2,'1.8'],['JK02',13,16,15,'15.5'],['RM01',-.7,-1,0,'(0.9)'],['TL01',12.4,15,14,'14.8']],
  [['CL01',7.9,9,0,'9.4'],['BC01',8,10,0,'9.5'],['CM01',11.6,14,4,'13.9'],['CS01',13.8,17,6,'16.5']],
];
const names = {JP01:'Jason Powell',MH01:'Michael Hunnicutt',MS01:'Memo Saldana',JS01:'Jack Samis',
  DT01:'David Tatum',AM01:'Alex Monteleone',CP01:'Chase Patterson',JK01:'Jupjee Kochar',
  HM01:'Holman Moores',BA01:'Brian Atkinson',MM01:'Max Markley',NJ01:'Nick Julian',
  MB01:'Miles Berger',CB01:'Clay Beltran',WO01:'Will Oliver',PN01:'Patrick Noonan',
  MS02:'Matthew Smith',JK02:'Jack Keffler',RM01:'Robert Murphy',TL01:'Taylor Lippincott',
  CL01:'Caleb Lewis',BC01:'Brenan Cavanaugh',CM01:'Chris Micheal',CS01:'Chris Seekely'};
export function bestBallView() {
  const view = scrambleView(bestBallRows);
  view.rounds = [{round_number:1,format:'BB'}];
  view.tournament_presentation.presentation.tournamentMatchDisplay = {};
  for (const [i,e] of view.matches.entries()) {
    const id = `2026-R1-${i+1}`;
    Object.assign(e.match,{match_id:id,round_number:1,format:'BB',scoring_snapshot_id:`${id}:S1`});
    Object.assign(e.snapshot,{snapshot_id:`${id}:S1`,format:'BB',course_id:'TPGC01',tee:'Gold',rating:71.9,slope:136,par:72});
    const par=[4,5,4,3,5,4,3,4,4,5,4,4,5,3,4,3,4,4];
    const si=[9,5,15,13,7,11,17,1,3,12,6,4,10,16,8,14,18,2];
    const yards=[372,501,369,189,510,375,158,444,376,512,362,422,503,160,342,164,348,403];
    e.snapshot.hole_definitions=par.map((p,k)=>({hole_number:k+1,par:p,stroke_index:si[k],yardage:yards[k]}));
    e.snapshot.handicap_revision_id=null;
    e.holes=[0,3,5].includes(i)?[]:structuredClone(e.snapshot.hole_definitions);
    if(i===0)e.snapshot.participant_configuration={all_ids:['CB01'],team_1:[{id:'CB01',team:1,slot:1,
      handicap_index:null,course_handicap:null,playing_handicap:13,final_strokes:0}],team_2:[]};
    for (const [j,p] of e.participants.entries()) Object.assign(p,{
      display_name:names[p.player_id],
      course_handicap:courseHandicap(p.handicap_index,71.9,136,72),
      playing_handicap:bestBallRows[i][j][2], final_strokes:bestBallRows[i][j][3],
    });
  }
  return view;
}
