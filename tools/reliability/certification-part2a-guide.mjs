// Fixed synthetic presentation only. Uses unchanged publication normalization.
import {normalizeProductionGuideAuthoring} from '../../lib/production-guide-authoring-contract.js';
export function certificationPart2aGuide(repair=false){
 const course=repair?'Synthetic Certification Course Part2A':'Synthetic Certification Course';
 const content={tournament:{'Tournament ID':'2026',Year:'2026','Tournament Name':'Synthetic Certification Tournament',
  'Tournament Edition':'Synthetic Certification Fixture','Tournament Dates':'September 24, 2026','Start Date':'2026-09-24','End Date':'2026-09-24',
  Destination:'Synthetic Certification Fixture','Time Zone':'America/Chicago'},
  overview:[{'Section ID':'synthetic-overview','Tournament ID':'2026','Section Name':'Synthetic fixture',
   'Section Slug':'overview',Description:'Synthetic Certification fixture; no real tournament or participant facts.',
   'Display Order':'1',Status:'Published'}],
  schedule:[{'Event ID':'synthetic-round-3','Tournament ID':'2026','Event Date':'2026-09-24','Day Label':'Thursday',
   'Start Time':'9:00 AM','End Time':'1:00 PM','Event Type':'Golf',Title:'Synthetic Singles Smoke',
   Location:course,'Round ID':'3','Course ID':'C3','Display Order':'1',Status:'Published'}],
  timelineRows:[],ruleBook:[{'Rule ID':'synthetic-notice','Tournament ID':'2026',Category:'Certification',
   Title:'Synthetic fixture',Body:'Canonical scoring rules remain authoritative. This Guide is synthetic presentation only.',
   'Display Order':'1',Status:'Published','Effective Year':'2026'}],
  tournamentRules:[{Year:'2026',Round:'3',Format:'SI','Team Size':'1','Points Available':'3',
   'Front 9 Used':'TRUE','Back 9 Used':'TRUE','Overall Used':'TRUE','Front 9 Points':'1','Back 9 Points':'1','Overall Points':'1'}],
  rounds:[{'Format ID':'SI',Name:'Singles','Team Size':'1'}],dining:[],localGuide:[],importantContacts:[],
  courses:[{'Course ID':'C3',Year:'2026',Round:'3',Format:'SI',Course:course,Overview:'Synthetic Certification course.'}]};
 return normalizeProductionGuideAuthoring({content,targetTournamentId:'2026',targetTournamentYear:2026,
  canonicalCourseContext:[{course_id:'C3',round:3,format:'SI',tee:'Tournament',rating:72,slope:120,par:72,
   holes:Array.from({length:18},(_,i)=>({hole_number:i+1,stroke_index:i+1,par:4,yardage:400}))}],
  canonicalRounds:[{roundNumber:3,format:'SI',courseId:'C3',teeId:'Tournament'}]});
}
