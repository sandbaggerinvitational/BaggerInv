// Synthetic preparation through real canonical operations only. This helper
// reads existing setup facts; it never inserts promotion/readiness/bindings.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {normalizeProductionGuideAuthoring} from '../../../lib/production-guide-authoring-contract.js';
import {normalizeProductionDraftAuthoring} from '../../../lib/production-draft-authoring-contract.js';
import {PRODUCTION_PREDICTION_SETTING_SPECS,normalizeProductionPredictionSettingsAuthoring} from '../../../lib/production-prediction-settings-contract.js';
import {jsonLiteral} from './postgres17.mjs';

export function syntheticAnnualContent({target,rounds,courseContext,teams,rosterCount}) {
 const year=Number(target);
 assert.match(String(target),/^20\d{2}$/);assert.ok(rounds.length>0);assert.equal(teams.length,2);
 // Same minimum publication intent as the existing Guide PostgreSQL fixture:
 // complete tournament, published itinerary, canonical courses/rules/formats.
 const content={tournament:{'Tournament ID':String(target),Year:String(target),
  'Tournament Name':'Synthetic certification tournament','Tournament Edition':`${year} synthetic edition`,
  'Tournament Dates':'September 24–27','Start Date':`${year}-09-24`,'End Date':`${year}-09-27`,
  Destination:'Owned local fixture','Time Zone':'UTC'},overview:[],timelineRows:[],ruleBook:[],dining:[],localGuide:[],importantContacts:[],
  schedule:rounds.map((r,i)=>({'Event ID':`round-${r.roundNumber}`,'Tournament ID':String(target),
   'Event Date':`${year}-09-${24+i}`,'Day Label':`Day ${i+1}`,'Start Time':'8:00 AM',
   'Event Type':'Golf',Title:`Synthetic Round ${r.roundNumber}`,'Round ID':String(r.roundNumber),
   'Course ID':r.courseId,'Display Order':String(i+1),Status:'Published'})),
  courses:rounds.map(r=>({'Course ID':r.courseId,Year:String(target),Round:String(r.roundNumber),
   Format:r.format,Course:`Synthetic ${r.courseId}`})),
  tournamentRules:rounds.map(r=>({Year:String(target),Round:String(r.roundNumber),Format:r.format,
   'Team Size':String(r.teamSize),'Points Available':String(r.pointsAvailable)})),
  rounds:[...new Map(rounds.map(r=>[r.format,{'Format ID':r.format,Name:r.name,'Team Size':String(r.teamSize)}])).values()]};
 const guide=normalizeProductionGuideAuthoring({content,targetTournamentId:String(target),targetTournamentYear:year,
  canonicalCourseContext:courseContext,canonicalRounds:rounds});
 const draft=normalizeProductionDraftAuthoring({configuration:{year,name:'Synthetic annual Draft',date:'',time:'',
  time_zone:'UTC',location:'Owned local fixture',status_mode:'Unscheduled',format:'Snake',total_picks:rosterCount,
  team_1_id:teams[0].team_id,team_2_id:teams[1].team_id,team_1_captain_player_id:'',team_2_captain_player_id:'',
  first_pick_team_id:teams[0].team_id,notes:'Synthetic fixture; no selections or publication invented'},
  picks:Array.from({length:rosterCount},(_,i)=>({pick_number:i+1,team_id:'',player_id:'',selected_at:'',selected_by:'',notes:''}))});
 const prediction=normalizeProductionPredictionSettingsAuthoring(Object.fromEntries(
  PRODUCTION_PREDICTION_SETTING_SPECS.map(s=>[s.canonicalKey,s.defaultValue])));
 return{guide,draft,prediction};
}

export function certificationFutureAuthoringCaller(fixture) {
 const calls=[];
 const call=async(operation,payload,{operationRequestId=randomUUID(),authorization=fixture.envelope.authorization}={})=>{
  const context=fixture.context('ANNUAL',{authorization});
  const input={...fixture.envelope,authorization,phase:'ANNUAL',operation_id:operation,
   operation_request_id:operationRequestId,expected_context_token:context.context_token,payload};
  const result=fixture.rpc('mutate_certification_future_authoring_v1',input);
  calls.push({input,result});assert.equal(result.ok,true,JSON.stringify(result));return result;
 };
 return{call,calls};
}

export async function preparePromotedFutureScoring({fixture,target,call,expectedResourceClass='CERTIFICATION'}) {
 const q=fixture.q, targetSql=jsonLiteral(String(target));
 const rows=statement=>JSON.parse(q(statement));
 const roster=rows(`select jsonb_agg(to_jsonb(r) order by team_side,player_id) from production_control.future_tournament_roster_v1 r where tournament_id=${targetSql}#>>'{}' and participation_status='ACTIVE'`);
 assert.ok(roster.length>0);
 const base={target_tournament_id:String(target),target_tournament_year:Number(target),reason:'Synthetic future annual canonical preparation'};
 const run=(action,payload)=>call('ANNUAL.RUNTIME',{...base,action,...payload});
 const promoted=await run('PROMOTE_RUNTIME_STRUCTURE',{expected_revision:0});
 const presentation=rows(`select jsonb_build_object('matches',(select count(*) from scoring_authority.matches where tournament_id=${targetSql}#>>'{}'),
  'consistent',(select count(*) from scoring_authority.game_center_presentations p
    join production_control.future_match_definitions_v1 m using(match_id,tournament_id)
    join production_control.future_tournament_catalog_v1 c using(tournament_id)
    join production_control.canonical_resource_v1 r on r.singleton
    where p.tournament_id=${targetSql}#>>'{}' and p.display_match_number=m.match_number::text
     and p.tournament_time_zone=c.timezone and p.source_workbook_id=r.provenance_id
     and p.imported_by='certification-canonical-promotion-v1'))`);
 assert.equal(q('select resource_class from production_control.canonical_resource_v1 where singleton'),expectedResourceClass);
 if(expectedResourceClass==='CERTIFICATION'){
  assert.equal(presentation.consistent,presentation.matches,'Promotion derives every Certification presentation identity from canonical setup');
 }else{
  assert.equal(expectedResourceClass,'PRODUCTION');
  assert.equal(presentation.consistent,0,'Protected Production promotion must not claim Certification provenance');
  assert.equal(Number(q(`select count(*)from scoring_authority.game_center_presentations where tournament_id=${targetSql}#>>'{}' and imported_by='certification-canonical-promotion-v1'`)),0);
  presentation.scope='UNCHANGED_PRODUCTION_PROMOTION; CERTIFICATION_PRESENTATION_NOT_APPLICABLE';
 }
 const staged=await run('STAGE_HANDICAPS',{expected_revision:0,method:'DIRECTOR_REVIEW',
  entries:roster.map((p,i)=>({player_id:p.player_id,tournament_handicap:i%12,source_index:i%12,low_index:i%12}))});
 await run('APPROVE_HANDICAPS',{expected_revision:0,handicap_revision_id:staged.revisionId});
 const matches=rows(`select jsonb_agg(to_jsonb(m) order by round_number,match_id) from scoring_authority.matches m where tournament_id=${targetSql}#>>'{}'`);
 const teams=[roster.filter(p=>p.team_side===1),roster.filter(p=>p.team_side===2)];
 for(const m of matches){
  const assignment=rows(`select to_jsonb(a) from scoring_authority.tournament_setup_round_courses_v1 a where tournament_id=${targetSql}#>>'{}' and round_number=${Number(m.round_number)}`);
  const rev=()=>Number(q(`select runtime_revision from production_control.future_runtime_match_bindings_v2 where match_id=${jsonLiteral(m.match_id)}#>>'{}'`));
  const matchNumber=Number(m.match_id.split('-').at(-1));const slots=m.format==='SI'?1:2;
  await run('CONFIGURE_MATCH',{expected_revision:rev(),match_id:m.match_id,match_number:matchNumber,
   course_id:assignment.course_id,tee_id:assignment.tee_id,starting_hole:1});
  const participants=teams.flatMap((team,side)=>Array.from({length:slots},(_,slot)=>{
   const player=team[(matchNumber-1)*slots+slot];assert.ok(player,'Each round needs distinct complete pairings');
   return{player_id:player.player_id,team_side:side+1,player_slot:slot+1};}));
  await run('REPLACE_PAIRINGS',{expected_revision:rev(),match_id:m.match_id,participants});
  await run('PREPARE_SCORING_CONTEXT',{expected_revision:rev(),match_id:m.match_id});
 }
 const state=rows(`select jsonb_build_object('matches',(select count(*)from scoring_authority.matches where tournament_id=${targetSql}#>>'{}'),
  'prepared',(select count(*)from production_control.future_runtime_match_bindings_v2 where tournament_id=${targetSql}#>>'{}' and runtime_state='PREPARED'),
  'scoreFacts',(select count(*)from scoring_authority.hole_scores h join scoring_authority.matches m using(match_id) where m.tournament_id=${targetSql}#>>'{}'))`);
 assert.equal(state.matches,state.prepared);assert.equal(state.scoreFacts,0);
 return{promoted,state,presentation};
}

export async function prepareFutureCanonicalContent({fixture,target,call}) {
 const targetSql=jsonLiteral(String(target));const q=fixture.q;
 const rows=statement=>JSON.parse(q(statement));
 const data=rows(`select jsonb_build_object('rounds',production_control.guide_canonical_rounds_v1(${targetSql}#>>'{}'),
  'courseContext',production_control.guide_canonical_course_context_v1(${targetSql}#>>'{}'),
  'teams',(select jsonb_agg(to_jsonb(t) order by team_side)from scoring_authority.teams t where tournament_id=${targetSql}#>>'{}'),
  'rosterCount',(select count(*)from scoring_authority.tournament_players where tournament_id=${targetSql}#>>'{}' and participation_status='ACTIVE'))`);
 const {guide,draft,prediction}=syntheticAnnualContent({target,...data});
 const base={target_tournament_id:String(target),target_tournament_year:Number(target),reason:'Synthetic canonical annual content review'};
 const run=(op,payload)=>call(op,{...base,...payload,request_payload_hash:createHash('sha256').update(JSON.stringify({op,target,payload})).digest('hex')});
 const guideData={authoring_content:guide.authoringContent,projection_payload:guide.projectionPayload,
  authoring_content_fingerprint:guide.authoringContentFingerprint,content_fingerprint:guide.contentFingerprint,
  projection_payload_hash:guide.projectionPayloadHash,
  canonical_reference_fingerprint:q(`select production_control.guide_canonical_reference_fingerprint_v1(${targetSql}#>>'{}')`),
  expected_published_revision:0,expected_published_revision_id:''};
 const gc=await run('ANNUAL.GUIDE_CREATE',guideData);
 const gv=await run('ANNUAL.GUIDE_VALIDATE',{...guideData,draft_id:gc.draftId,expected_draft_version:gc.draftVersion});
 const gp=await run('ANNUAL.GUIDE_PUBLISH',{...guideData,draft_id:gc.draftId,expected_draft_version:gv.draftVersion,
  confirmation:'PUBLISH TOURNAMENT GUIDE',expected_content_fingerprint:guide.contentFingerprint});
 const ds=await run('ANNUAL.DRAFT_STAGE',{configuration:draft.configuration,picks:draft.picks,expected_revision:0});
 await run('ANNUAL.DRAFT_VALIDATE',{draft_id:ds.draftId,expected_revision:0});
 const dc=await run('ANNUAL.DRAFT_COMMIT',{draft_id:ds.draftId,expected_revision:0,confirmation:'SAVE DRAFT REVISION'});
 // The predecessor fixture must provide a truthful canonical synthetic ratings
 // seed. Creating that authority is outside this content helper; fail if absent.
 assert.equal(Number(q(`select count(*)from scoring_authority.odds_input_configurations c
  join production_control.current_tournament_pointer_v1 p on c.tournament_id=p.tournament_id
  where c.is_current and c.validation_status='VALID'`)),1,'Canonical current-year Odds seed required');
 const ps=await run('ANNUAL.PREDICTION_STAGE',{canonical_settings:prediction.canonicalSettings,expected_configuration_revision:0});
 await run('ANNUAL.PREDICTION_VALIDATE',{draft_id:ps.draftId,expected_configuration_revision:0});
 const pc=await run('ANNUAL.PREDICTION_COMMIT',{draft_id:ps.draftId,expected_configuration_revision:0,
  confirmation:'SAVE PREDICTION SETTINGS REVISION'});
 const bindings=rows(`select jsonb_agg(jsonb_build_object('domain',domain,'status',certification_status,'authority',authoring_authority)order by domain)
  from production_control.future_annual_projection_bindings_v1 where tournament_id=${targetSql}#>>'{}'`);
 assert.deepEqual(bindings.map(x=>x.domain),['DRAFT','GUIDE','PREDICTION_SETTINGS']);
 assert.ok(bindings.every(x=>x.status==='CERTIFIED'&&x.authority==='SUPABASE_DIRECTOR'));
 return{guide:gp,draft:dc,prediction:pc,bindings};
}
