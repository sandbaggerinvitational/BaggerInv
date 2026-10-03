import assert from 'node:assert/strict';
import test from 'node:test';
import {syntheticAnnualContent} from './support/reliability/certification-future-authoring-proof.mjs';

test('synthetic future authoring uses canonical validators and preserves all three formats',()=>{
 const rounds=['BB','SC','SI'].map((format,i)=>({roundNumber:i+1,roundId:String(i+1),format,
  name:['Best Ball','Scramble','Singles'][i],teamSize:i===2?1:2,pointsAvailable:3,
  courseId:`C${i+1}`,teeId:'Synthetic'}));
 const courseContext=rounds.map(r=>({course_id:r.courseId,tee:r.teeId,rating:72,slope:120,par:72,
  configuration_consistent:true,rounds:[{round_number:r.roundNumber,format:r.format,name:r.name,status:'UPCOMING'}],
  holes:Array.from({length:18},(_,i)=>({hole_number:i+1,par:4,stroke_index:i+1,yardage:400}))}));
 const content=syntheticAnnualContent({target:'2091',rounds,courseContext,teams:[{team_id:'T1'},{team_id:'T2'}],rosterCount:24});
 assert.equal(content.guide.tournamentId,'2091');
 assert.deepEqual(content.guide.authoringContent.tournamentRules.map(r=>r.Format),['BB','SC','SI']);
 assert.equal(content.guide.projectionPayload.content.schedule.length,3);
 assert.equal(content.draft.configuration.year,2091);assert.equal(content.draft.picks.length,24);
 assert.ok(content.draft.picks.every(p=>!p.player_id&&!p.selected_by&&!p.selected_at));
 assert.equal(Object.keys(content.prediction.canonicalSettings).length,30);
 assert.equal(Object.keys(content.prediction.effectiveSettings).length,30);
 assert.equal(JSON.stringify(content).includes('service_role'),false);
});
