// This fixture is entirely local. Initial golf/identity owner facts are declared
// synthetic inputs. All future authority, readiness, transitions and score facts
// must be produced through actual installed canonical APIs, never seeded.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {repositoryRoot} from './postgres17.mjs';
import {syntheticActor,syntheticDirector} from './synthetic-tournament.mjs';
import {annualPlayers,provisionAnnualSyntheticAuthority} from './certification-annual-transition-fixture.mjs';
import {preparePromotedFutureScoring,prepareFutureCanonicalContent} from './certification-future-authoring-proof.mjs';
import {annualRuntimeRequestHash} from '../../../lib/annual-runtime-request-hash.js';
import {buildTournamentSetupMutation,normalizeProductionTournamentSetupPayload} from '../../../lib/production-tournament-setup-contract.js';
import {createScoreDerivedDeliveryAdapter} from '../../../lib/score-derived-delivery.js';

export async function runProductionAnnualGolden({cluster,database,psql,jsonSql,scope,stopAfterFuturePreparation=false}){
 assert.ok(cluster.socketDirectory||cluster.socket,'Owned local cluster only');
 const q=statement=>psql(cluster,database,statement),row=statement=>JSON.parse(q(statement));
 const rpc=(name,input)=>row(`set role service_role;select public.${name}(${jsonSql(input)})`);
 const resource=row("select to_jsonb(r)from production_control.resource_scope r where scope_key='BAGGER_INV_PRODUCTION'");
 const evidence={environment:'OWNED_SOCKET_ONLY_PRODUCTION_SHAPED_POSTGRESQL17',hostedAccess:false,productionAccess:false,googleCalls:0,
  runtimeGuardsSubstituted:false,readinessSubstituted:false,drainSubstituted:false,seededScores:0,seededFinals:0,operations:[],status:'RUNNING'};
 const checkpoint=()=>writeFile('/private/tmp/r2-production-annual-progress.json',JSON.stringify(evidence,null,2)+'\n');
 try{
  // Reuse the reviewed fixture's initial owner input SQL exactly; remove only
  // Certification registration marker calls (this DB has genuine local
  // Production-shaped authority). Historical provenance uses its registered
  // inert identifier. This is initial fixture construction, not a runtime API.
  const file=await readFile(repositoryRoot+'/test/support/reliability/phase2d-certification-fixture.mjs','utf8');
  const start=file.indexOf(' q(`begin;set local request.jwt.claim.role=');
  const end=file.indexOf('\n assert.equal(q("select count(*) from production_control.resource_scope")',start);
  assert.ok(start>0&&end>start);
  let block=file.slice(start,end);
  const push=" select production_control.push_certification_context_v1(${jsonLiteral(envelope)},'DIRECTOR',false);";
  assert.equal(block.split(push).length,2);block=block.replace(push,'');
  block=block.replace(' select production_control.pop_certification_context_v1();commit;',' commit;');
  assert.equal(block.includes('push_certification_context'),false);assert.equal(block.includes('pop_certification_context'),false);
  new Function('q','syntheticActor','syntheticDirector','resource',block)(sql=>q(sql.replaceAll('urn:bagger:synthetic:LOCAL_PRODUCTION_FIXTURE',resource.google_workbook_id)),syntheticActor,syntheticDirector,{installation_id:'LOCAL_PRODUCTION_FIXTURE'});
  const fixture={q:sql=>q(sql.replaceAll('urn:bagger:synthetic:LOCAL_PRODUCTION_FIXTURE',resource.google_workbook_id)),resource:{installation_id:'LOCAL_PRODUCTION_FIXTURE'}};
  const initialOdds=q("select jsonb_agg(to_jsonb(c)order by configuration_revision)from scoring_authority.odds_input_configurations c where tournament_id='2026'");
  evidence.initialInputs=provisionAnnualSyntheticAuthority(fixture,{initializeOddsConfiguration:false});
  assert.equal(q("select jsonb_agg(to_jsonb(c)order by configuration_revision)from scoring_authority.odds_input_configurations c where tournament_id='2026'"),initialOdds,
   'Initial annual identity setup must preserve the protected fixture configuration and its admitted capability fingerprints');
  delete evidence.initialInputs.source;
  evidence.initialInputs.provenanceClass='REGISTERED_LOCAL_PRODUCTION_PROVENANCE';
  evidence.initialInputs.provenanceSha256=createHash('sha256').update(resource.google_workbook_id).digest('hex');
  assert.equal(q('select count(*)from scoring_authority.hole_scores'),'0');
  assert.equal(q("select count(*)from scoring_authority.matches where status='FINAL'"),'0');
  const current=()=>row("select to_jsonb(p)from production_control.current_tournament_pointer_v1 p where scope_key='BAGGER_INV_PRODUCTION'");
  const auth=()=>({tournament_id:current().tournament_id,role:'DIRECTOR',player_id:syntheticDirector.playerId,auth_user_id:syntheticDirector.authUserId});
  const base=contract=>({...scope,contract_version:contract,project_ref:resource.project_ref,project_url:resource.project_url,
   source_workbook_id:resource.google_workbook_id,tournament_id:current().tournament_id,tournament_year:current().tournament_year,
   authorization:auth(),actor_player_id:syntheticDirector.playerId,actor_auth_user_id:syntheticDirector.authUserId});
  const call=(operation,payload,id=randomUUID())=>{
   const routes={
    'ANNUAL.RUNTIME':['mutate_production_future_runtime_v2','production-future-runtime-activation-v2'],
    'ANNUAL.GUIDE_CREATE':['create_production_guide_draft_v1','production-guide-authoring-v1'],
    'ANNUAL.GUIDE_VALIDATE':['validate_production_guide_draft_v1','production-guide-authoring-v1'],
    'ANNUAL.GUIDE_PUBLISH':['publish_production_guide_draft_v1','production-guide-authoring-v1'],
    'ANNUAL.DRAFT_STAGE':['stage_production_draft_revision_v1','production-draft-authoring-v1'],
    'ANNUAL.DRAFT_VALIDATE':['validate_production_draft_revision_v1','production-draft-authoring-v1'],
    'ANNUAL.DRAFT_COMMIT':['commit_production_draft_revision_v1','production-draft-authoring-v1'],
    'ANNUAL.PREDICTION_STAGE':['stage_production_prediction_settings_revision_v1','production-prediction-settings-authoring-v1'],
    'ANNUAL.PREDICTION_VALIDATE':['validate_production_prediction_settings_revision_v1','production-prediction-settings-authoring-v1'],
    'ANNUAL.PREDICTION_COMMIT':['commit_production_prediction_settings_revision_v1','production-prediction-settings-authoring-v1']};
   const [name,contract]=routes[operation];const input={...base(contract),...payload,operation_request_id:id};
   if(operation!=='ANNUAL.RUNTIME')input.operation=name.toUpperCase();
   delete input.request_payload_hash;
   input.request_payload_hash=annualRuntimeRequestHash(input);
   const result=rpc(name,input);assert.equal(result.ok,true,`${operation}: ${JSON.stringify(result)}`);
   evidence.operations.push({operation,action:payload.action,requestId:id,resultCode:result.code});return result;
  };
  const target='2027';
  const administration=(operation,values={},id=randomUUID())=>{
   const input={...base('production-future-year-administration-v1'),operation,action:operation,target_tournament_id:target,target_tournament_year:Number(target),
    operation_request_id:id,expected_revision:operation==='CREATE_TOURNAMENT'?0:Number(q(`select setup_revision from production_control.future_tournament_catalog_v1 where tournament_id='${target}'`)),
    reason:'Synthetic Production-shaped annual golden',...values};input.request_payload_hash=annualRuntimeRequestHash(input);
   const result=rpc('mutate_production_future_year_administration_v1',input);assert.equal(result.ok,true,`${operation}: ${JSON.stringify(result)}`);
   evidence.operations.push({operation,requestId:id,resultCode:result.code});return{input,result};
  };
  const created=administration('CREATE_TOURNAMENT',{tournament_name:'Synthetic annual '+target,destination:'Owned local fixture',start_date:target+'-09-24',end_date:target+'-09-26',time_zone:'UTC',creation_mode:'BLANK'});
  assert.equal(rpc('mutate_production_future_year_administration_v1',created.input).idempotent,true);
  administration('CONFIGURE_TEAM',{team_id:'A'+target,team_side:1,team_name:'Synthetic A'});
  administration('CONFIGURE_TEAM',{team_id:'B'+target,team_side:2,team_name:'Synthetic B'});
  administration('REPLACE_ROSTER',{roster:annualPlayers.map((p,i)=>({player_id:p.playerId,team_id:(i<12?'A':'B')+target,team_side:i<12?1:2,participation_status:'ACTIVE'}))});
  for(const [round,format,teamSize,count]of[[1,'BB',2,6],[2,'SC',2,6],[3,'SI',1,12]]){
   administration('CONFIGURE_ROUND',{round_number:round,round_name:'Synthetic '+format,format,team_size:teamSize,points_available:1,handicap_allowance:1});
   administration('GENERATE_MATCH_STRUCTURE',{round_number:round,match_count:count});
  }
  const run=(action,payload)=>call('ANNUAL.RUNTIME',{target_tournament_id:target,target_tournament_year:Number(target),action,reason:'Synthetic Production annual course',...payload});
  // Scoped equivalence uses supported distinct existing course references.
  // The same-course/tee multi-round base defect remains counterevidence in
  // PROTECTED-ANNUAL-COUNTEREVIDENCE.md; this does not claim to repair it.
  for(let round=1;round<=3;round++)administration('ASSIGN_COURSE',{round_number:round,
   course_id:'C'+round,tee:'Tournament',source_tournament_id:'2026',source_round_number:round});
  await preparePromotedFutureScoring({fixture,target,call,expectedResourceClass:'PRODUCTION'});
  run('GRANT_FUTURE_DIRECTOR',{expected_revision:0,target_player_id:syntheticDirector.playerId});
  await prepareFutureCanonicalContent({fixture,target,call});
  evidence.futurePreparation={matches:Number(q(`select count(*)from scoring_authority.matches where tournament_id='${target}'`)),readiness:row(`select production_control.annual_scoring_transition_readiness_v1('${target}')`)};
  await checkpoint();
  if(stopAfterFuturePreparation){
   const publication=row("select to_jsonb(p)from scoring_authority.odds_publication_current p where tournament_id='2026'");
   assert.equal(publication.publication_state,'UNPUBLISHED');assert.equal(publication.publication_revision,0);
   assert.equal(publication.current_snapshot_id,null);assert.equal(publication.adoption_kind,null);
   assert.equal(q("select count(*)from scoring_authority.odds_published_snapshots where tournament_id='2026'"),'0');
   evidence.futureSetup='PASS';evidence.status='PARTIAL';
   evidence.scope='SUPPORTED_DISTINCT_COURSE_FUTURE_SETUP_ONLY';
   evidence.completeProtectedAnnual='NOT_PROVEN';
   evidence.blocker='UNCHANGED_PRODUCTION_2026_HISTORICAL_PUBLICATION_ADOPTION_REQUIRED';
   evidence.historicalAdoptionFabricated=false;await checkpoint();return evidence;
  }
  // Finish the actual predecessor tournament. Initial input rows above were
  // all UPCOMING with zero score facts; no Final state is fabricated here.
  const scoringScope=()=>{
   const activation=row("select to_jsonb(a)from production_control.cutover_activation_state a where scope_key='BAGGER_INV_PRODUCTION'");
   return{...base('production-tournament-setup-v1'),expected_activation_revision:Number(activation.activation_revision),expected_epoch_id:activation.authority_generation_id};
  };
  const setupRead=()=>normalizeProductionTournamentSetupPayload(rpc('read_production_tournament_setup_v1',{
   ...scoringScope(),operation:'READ_PRODUCTION_TOURNAMENT_SETUP_V1'}));
  const matches=row("select jsonb_agg(to_jsonb(m)order by round_number,match_id)from scoring_authority.matches m where tournament_id='2026'");
  const counts={1:0,2:0,3:0};let finals=0;
  for(const initial of matches){
   const match=()=>row(`select to_jsonb(m)from scoring_authority.matches m where match_id='${initial.match_id}'`);
   const payload=buildTournamentSetupMutation('prepare-scoring-context',{expectedRevision:setupRead().revision,operationRequestId:randomUUID(),matchId:initial.match_id});
   const prepare={...scoringScope(),...payload};prepare.request_payload_hash=annualRuntimeRequestHash(prepare);
   assert.equal(rpc('mutate_production_tournament_setup_v1',prepare).ok,true);
   for(const operation of ['MARK_LIVE','ACCESS_ACTIVATE']){
    const m=match(),input={...scoringScope(),operation,match_id:m.match_id,mutation_key:randomUUID(),expected_match_revision:m.match_revision,
     expected_permission_revision:m.permission_revision,authorization:{...auth(),match_id:m.match_id,permission_revision:m.permission_revision}};
    const result=rpc('mutate_production_match_control',input);assert.equal(result.ok,true,JSON.stringify(result));
   }
   const playerId=q(`select player_id from scoring_authority.match_participants where match_id='${initial.match_id}'and team_side=1 order by player_slot limit 1`);
   const player=annualPlayers.find(p=>p.playerId===playerId);assert.ok(player);
   for(let hole=1;hole<=18;hole++){
    const m=match(),input={...scoringScope(),match_id:m.match_id,mutation_key:`production-annual:${m.match_id}:h${hole}`,hole_number:hole,
     expected_match_revision:m.match_revision,expected_hole_revision:0,team_1_gross_scores:m.format==='BB'?[4,4]:[4],team_2_gross_scores:m.format==='BB'?[5,5]:[5],
     authorization:{tournament_id:'2026',role:'PLAYER',player_id:player.playerId,auth_user_id:player.authUserId,match_id:m.match_id,permission_revision:m.permission_revision}};
    const result=rpc('submit_production_hole_score',input);assert.equal(result.ok,true,JSON.stringify(result));counts[initial.round_number]++;
   }
   const m=match(),result=rpc('finalize_production_match',{...scoringScope(),match_id:m.match_id,mutation_key:`production-annual:${m.match_id}:final`,
    expected_match_revision:m.match_revision,authorization:{...auth(),match_id:m.match_id,permission_revision:m.permission_revision}});
   assert.equal(result.ok,true,JSON.stringify(result));assert.equal(match().status,'FINAL');finals++;
   evidence.predecessorScoring={rounds:counts,holes:Object.values(counts).reduce((a,b)=>a+b,0),finals};await checkpoint();
  }
  assert.deepEqual(counts,{1:108,2:108,3:216});assert.equal(finals,24);
  const workerRpc=async(name,input)=>({payload:rpc(name,{...scoringScope(),...input})});
  const read=name=>async()=>({payload:row(`set role service_role;select public.${name}('2026'${name==='read_published_odds_view'?','+jsonSql(resource.google_workbook_id)+"#>>'{}'":''})`)});
  const workers=createScoreDerivedDeliveryAdapter({rpc:workerRpc,env:{VERCEL_ENV:'production'},resolveContext:async()=>({runtime:{tournamentId:'2026',runtimeGenerationId:null}}),
   financialOptions:{dependencies:{rpc:workerRpc,getActivation:()=>({})}},reads:{readLeaderboardsCoreView:read('read_leaderboards_core_view'),readNetSkinsResultView:read('read_net_skins_result_view'),readPublishedOddsView:read('read_published_odds_view')}});
  let remaining=-1;
  for(let cycle=0;cycle<30;cycle++){
   const args={workerId:'production-annual-local-proof',operationId:randomUUID()},tickResult=await workers.tick(args);
   for(const process of Object.values(workers.processors))await process({...args,tickResult});
   remaining=Number(q("select count(*)from scoring_authority.score_derived_intents_v1 where tournament_id='2026'and status<>'SUCCEEDED'"));
   evidence.workerDrain={cycles:cycle+1,remaining};if(remaining===0)break;
  }
  assert.equal(remaining,0,'No fabricated worker completion');
  evidence.finalReadiness=row(`select production_control.annual_scoring_transition_readiness_v1('${target}')`);
  await checkpoint();
  const platform=()=>row("select jsonb_build_object('expected_platform_activation_revision',a.activation_revision,'expected_platform_authority_generation_id',a.authority_generation_id,'expected_platform_admission_generation_id',g.admission_generation_id,'expected_platform_admission_revision',g.admission_revision)from production_control.cutover_activation_state a join scoring_authority.ingress_gates g on g.tournament_id='2026'where a.scope_key='BAGGER_INV_PRODUCTION'");
  const transition=(action,values={})=>{
   const input={...base('production-future-runtime-activation-v2'),tournament_id:'2026',tournament_year:2026,authorization:{...auth(),tournament_id:'2026'},
    action,operation_request_id:randomUUID(),reason:'Owned synthetic Production annual transition',target_tournament_id:target,
    expected_current_tournament_id:'2026',expected_pointer_revision:1,...values};input.request_payload_hash=annualRuntimeRequestHash(input);
   const result=rpc(action.toLowerCase()+'_production_annual_scoring_transition_v1',input);assert.equal(result.ok,true,JSON.stringify(result));
   evidence.operations.push({operation:action,requestId:input.operation_request_id,resultCode:result.code});return{input,result};
  };
  const prepared=transition('PREPARE',{expected_revision:Number(q(`select lifecycle_revision from production_control.future_tournament_catalog_v1 where tournament_id='${target}'`)),readiness_fingerprint:evidence.finalReadiness.fingerprint});
  const generation={transition_id:prepared.result.transitionId,expected_runtime_generation_id:prepared.result.runtimeGenerationId,
   expected_annual_authority_generation_id:prepared.result.authorityGenerationId,expected_annual_admission_generation_id:prepared.result.admissionGenerationId};
  const fingerprint=q("select production_control.future_runtime_hash_v2(jsonb_build_object('scores',(select jsonb_agg(to_jsonb(s)order by match_id,hole_number)from scoring_authority.hole_scores s),'results',(select jsonb_agg(to_jsonb(m)order by match_id)from scoring_authority.matches m where tournament_id='2026'))) ");
  const reconciliation={start_source_fingerprint:fingerprint,final_source_fingerprint:fingerprint,reconciliation_fingerprint:fingerprint};
  const closed=transition('CLOSE',{...generation,...platform(),...reconciliation});
  const drained=transition('DRAIN',{...generation,...reconciliation});assert.equal(drained.result.predecessorClosed,true);
  evidence.closedPredecessor={closed:closed.result,drained:drained.result,certificate:row("select production_control.annual_scoring_predecessor_certificate_v1('2026')")};await checkpoint();
  const certificate=evidence.closedPredecessor.certificate;assert.equal(certificate.certified,true);
  const active=transition('ACTIVATE',{...generation,...platform(),expected_predecessor_close_certificate_fingerprint:certificate.fingerprint,
   readiness_fingerprint:row(`select production_control.annual_scoring_transition_readiness_v1('${target}')`).fingerprint});
  assert.equal(current().tournament_id,target);assert.equal(rpc('activate_production_annual_scoring_transition_v1',active.input).idempotent,true);
  evidence.activation={result:active.result,pointer:current(),sameRequestReplay:true};
  evidence.googleJobs=Number(q('select count(*)from scoring_authority.google_outbox_events'));assert.equal(evidence.googleJobs,0);
  evidence.status='PASS';await checkpoint();
  return evidence;
 }catch(error){evidence.status='FAILED';evidence.error=String(error.stack||error).slice(0,10000);await checkpoint();throw error;}
}
