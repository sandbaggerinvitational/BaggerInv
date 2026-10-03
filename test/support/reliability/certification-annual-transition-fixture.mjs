// Owner-provisioned synthetic baseline identity/input facts are distinct from
// the runtime proof below. No scores, Finals, readiness, promotions, bindings,
// certificates, receipts or worker results are seeded here.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {jsonLiteral} from './postgres17.mjs';
import {syntheticActor,syntheticDirector} from './synthetic-tournament.mjs';
import {buildTournamentSetupMutation} from '../../../lib/production-tournament-setup-contract.js';
import {PRODUCTION_PREDICTION_SETTING_SPECS,normalizeProductionPredictionSettingsAuthoring} from '../../../lib/production-prediction-settings-contract.js';
import {certificationFutureAuthoringCaller,preparePromotedFutureScoring,prepareFutureCanonicalContent} from './certification-future-authoring-proof.mjs';

export const annualPlayers=Array.from({length:24},(_,index)=>{
 const playerId='P'+String(index+1).padStart(2,'0');
 return{playerId,email:playerId.toLowerCase()+'@bagger.synthetic.example',authUserId:playerId===syntheticDirector.playerId?syntheticDirector.authUserId:
  playerId===syntheticActor.playerId?syntheticActor.authUserId:`b3000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`};
});
export function provisionAnnualSyntheticAuthority(f,{initializeOddsConfiguration=true}={}){
 const fingerprint=createHash('sha256').update(JSON.stringify(annualPlayers)).digest('hex');
 const source='urn:bagger:synthetic:'+f.resource.installation_id;
 const rows=annualPlayers.map(p=>`('${p.playerId}','${p.authUserId}'::uuid,'${p.email}')`).join(',');
 f.q(`begin;set local request.jwt.claim.role='service_role';
  create temporary table annual_synthetic_contacts(player_id text,auth_user_id uuid,email text)on commit drop;
  insert into annual_synthetic_contacts values${rows};
  insert into auth.users(id,email,email_confirmed_at)select auth_user_id,email,now()from annual_synthetic_contacts
   on conflict(id)do update set email=excluded.email,email_confirmed_at=excluded.email_confirmed_at;
  insert into participant_identity.user_player_links(auth_user_id,player_id,status,link_method,email_identity_hash)
   select auth_user_id,player_id,'ACTIVE','SYNTHETIC_FIXTURE',encode(extensions.digest(email,'sha256'),'hex')from annual_synthetic_contacts
   on conflict(auth_user_id)do update set email_identity_hash=excluded.email_identity_hash;
  update participant_identity.participant_auth_identifiers a set normalized_value_private=c.email
   from annual_synthetic_contacts c where a.auth_user_id=c.auth_user_id and a.player_id=c.player_id and a.identifier_type='EMAIL';
  insert into participant_identity.participant_auth_identifiers(player_id,auth_user_id,identifier_type,normalized_value_private,status,
   verified_at,verification_source,source_system,created_by,updated_by)
   select player_id,auth_user_id,'EMAIL',email,'VERIFIED',now(),'SYNTHETIC_FIXTURE','SYNTHETIC_FIXTURE','fixture','fixture'
    from annual_synthetic_contacts c where not exists(select 1 from participant_identity.participant_auth_identifiers a
     where a.auth_user_id=c.auth_user_id and a.player_id=c.player_id and a.identifier_type='EMAIL');
  insert into participant_identity.tournament_roles(tournament_id,auth_user_id,role,granted_by)
   select '2026',auth_user_id,'PARTICIPANT','SYNTHETIC_FIXTURE'from annual_synthetic_contacts
   on conflict(tournament_id,auth_user_id,role)do nothing;
  insert into participant_identity.identity_context_revisions(tournament_id,context_revision,configuration_fingerprint,updated_by)
   values('2026',1,'${fingerprint}','SYNTHETIC_FIXTURE');
  insert into participant_identity.identity_config_import_runs(tournament_id,source_system,source_workbook_id,source_fingerprint,
   configuration_revision,status,roster_count,received_count,valid_count,validation_report,requested_by,approved_by,approved_at)
   values('2026','SYNTHETIC_FIXTURE','${source}','${fingerprint}',1,'APPROVED',24,24,24,
    '{"synthetic":true,"realMessagesSent":0,"authorityKind":"INITIAL_FIXTURE"}','fixture','P01',now());
  insert into participant_identity.participant_identity_contacts(tournament_id,player_id,email,email_normalized,identity_active,
   configuration_revision,verified_by,verified_at,source_system,source_workbook_id,source_updated_at)
   select '2026',player_id,email,email,true,1,'SYNTHETIC_FIXTURE',now(),'SYNTHETIC_FIXTURE','${source}',now()
    from annual_synthetic_contacts;
  with entitlement as(update production_control.director_entitlements set role='OWNER',status='ACTIVE',granted_by='SYNTHETIC_FIXTURE'
    where auth_user_id='${syntheticDirector.authUserId}'and tournament_id='2026'and player_id='${syntheticDirector.playerId}'returning entitlement_id),
   event as(insert into production_control.director_entitlement_events(entitlement_id,action,actor,reason)
    select entitlement_id,'GRANTED','SYNTHETIC_FIXTURE','Synthetic annual owner authority'from entitlement returning event_id,entitlement_id)
   insert into production_control.tournament_owner_capabilities_v1(tournament_id,player_id,auth_user_id,adopted_from_entitlement_id,
    adopted_entitlement_event_id,adopted_entitlement_event_count,status,capability_revision,adopted_by_player_id,adopted_at)
   select '2026','${syntheticDirector.playerId}','${syntheticDirector.authUserId}',entitlement_id,event_id,1,'ACTIVE',1,'P01',now()from event;
  commit;`);
 if(initializeOddsConfiguration){
 const prediction=normalizeProductionPredictionSettingsAuthoring(Object.fromEntries(PRODUCTION_PREDICTION_SETTING_SPECS.map(s=>[s.canonicalKey,s.defaultValue])));
 const settings=prediction.canonicalSettings,effective=prediction.effectiveSettings;
 assert.ok(settings&&effective,'Use canonical normalized input settings');
 const ratings={};
 const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
 f.q(`insert into scoring_authority.odds_input_configurations(id,tournament_id,configuration_revision,source_workbook_id,settings,
  historical_ratings,settings_fingerprint,ratings_fingerprint,pairing_fingerprint,bundle_fingerprint,is_current,imported_by,
  source_tab,source_fingerprint,canonical_settings,effective_settings,effective_settings_fingerprint,settings_contract_version,
  validation_status,validation_diagnostics,synchronized_at)
  values('${randomUUID()}','2026',1,'${source}','[]',${jsonLiteral(ratings)},'${hash(settings)}','${hash(ratings)}','${hash([])}',
   '${hash({settings,ratings})}',true,'SYNTHETIC_FIXTURE','Synthetic canonical initial input','${hash({source,settings,ratings})}',
   ${jsonLiteral(settings)},${jsonLiteral(effective)},'${prediction.effectiveSettingsFingerprint}','prediction-settings-v1',
   'VALID',${jsonLiteral({synthetic:true,normalizer:'normalizeProductionPredictionSettingsAuthoring',initialAuthority:true})},now())`);
 }else{
  assert.equal(f.q("select count(*)from scoring_authority.odds_input_configurations where tournament_id='2026'and is_current and validation_status='VALID'"),'1','Protected fixture must already have one valid canonical current Odds configuration');
 }
 return{players:annualPlayers.length,emailsSent:0,source,configurationFingerprint:fingerprint};
}
export function annualRuntime(f){
 const receipts=[],timings=[],ingressScenarios={};
 const current=()=>JSON.parse(f.q('select to_jsonb(p)from production_control.current_tournament_pointer_v1 p'));
 const authorization=()=>({...f.envelope.authorization,tournament_id:current().tournament_id});
 const execute=(input,{loseAcknowledgement=false}={})=>{
  const started=performance.now();
  const lease=f.rpc('admit_certification_operation_v1',input);
  const admitted=performance.now();
  const result=f.rpc('execute_certification_operation_v1',{...input,ingress:{lease_id:lease.lease_id,admission_generation_id:lease.admission_generation_id}});
  const completed=performance.now();
  timings.push({operation:input.operation_id,tournament:input.authorization.tournament_id,
   admitMs:admitted-started,executeMs:completed-admitted,totalMs:completed-started});
  assert.equal(result.ok,true,JSON.stringify(result));receipts.push({input,lease,result});
  if(loseAcknowledgement){
   // The committed execution result is deliberately discarded at the transport
   // seam. Only exact-origin durable status establishes the caller's outcome.
   const recovered=f.rpc('read_certification_ingress_status_v1',{...input,payload:{match_id:input.payload.match_id}});
   assert.equal(recovered.state,'COMMITTED');assert.equal(recovered.lease_id,lease.lease_id);
   ingressScenarios.lostAcknowledgement={operationId:input.operation_request_id,leaseId:lease.lease_id,state:recovered.state,
    method:'Discard committed RPC response before caller recovery'};
   return recovered.result;
  }
  return result;
 };
 const request=(operation,payload,auth=authorization(),id=payload.mutation_key||randomUUID())=>{
  const phase=operation.startsWith('WORKERS.')?'WORKERS':operation.startsWith('SCORING.')&&operation!=='SCORING.REOPEN_MATCH'?'SCORING':'DIRECTOR';
  return{...f.envelope,phase,operation_id:operation,payload,authorization:auth,operation_request_id:id,
   expected_context_token:f.context(phase,{authorization:auth}).context_token};
 };
 const base=(phase='ANNUAL')=>({...f.envelope,phase,authorization:authorization(),expected_context_token:f.context(phase,{authorization:authorization()}).context_token});
 const administration=(target,operation,values={},id=randomUUID())=>{
  const revision=operation==='CREATE_TOURNAMENT'?0:Number(f.q(`select setup_revision from production_control.future_tournament_catalog_v1 where tournament_id='${target}'`));
  const input={...base(),operation_request_id:id,payload:{operation,target_tournament_id:String(target),target_tournament_year:Number(target),
   expected_revision:revision,reason:'Synthetic annual transition proof',request_payload_hash:'a'.repeat(64),...values}};
  const result=f.rpc('mutate_certification_future_year_administration_v1',input);assert.equal(result.ok,true,JSON.stringify(result));return result;
 };
 const authoring=certificationFutureAuthoringCaller(f);
 const call=(operation,payload,options={})=>authoring.call(operation,payload,{authorization:authorization(),...options});
 const transitionRequest=(action,payload,id=randomUUID())=>({...base(),operation_id:'ANNUAL.'+action,operation_request_id:id,payload});
 const transition=(action,payload,id=randomUUID())=>{
  const input=transitionRequest(action,payload,id);
  const result=f.rpc('mutate_certification_annual_transition_v1',input);assert.equal(result.ok,true,JSON.stringify(result));return{input,result};
 };
 const transitionStatus=input=>f.rpc('read_certification_annual_transition_v1',{
  ...input,...base(),operation_id:'ANNUAL.STATUS',status_operation:input.operation_id.slice('ANNUAL.'.length),
  operation_request_id:input.operation_request_id,payload:input.payload});
 const readiness=target=>f.rpc('read_certification_annual_transition_v1',{...base(),operation_id:'ANNUAL.READINESS',payload:{
  expected_current_tournament_id:current().tournament_id,target_tournament_id:String(target)}});
 async function prepareFuture(target){
  administration(target,'CREATE_TOURNAMENT',{tournament_name:'Synthetic annual '+target,destination:'Owned fixture',start_date:`${target}-09-24`,
   end_date:`${target}-09-26`,timezone:'UTC',creation_mode:'BLANK'});
  administration(target,'CONFIGURE_TEAM',{team_id:'A'+target,team_side:1,team_name:'Synthetic A'});
  administration(target,'CONFIGURE_TEAM',{team_id:'B'+target,team_side:2,team_name:'Synthetic B'});
  administration(target,'REPLACE_ROSTER',{roster:annualPlayers.map((p,i)=>({player_id:p.playerId,team_id:(i<12?'A':'B')+target,
   team_side:i<12?1:2,participation_status:'ACTIVE'}))});
  for(const [round,format,teamSize,count]of[[1,'BB',2,6],[2,'SC',2,6],[3,'SI',1,12]]){
   administration(target,'CONFIGURE_ROUND',{round_number:round,round_name:'Synthetic '+format,format,team_size:teamSize,points_available:1,handicap_allowance:1});
   administration(target,'GENERATE_MATCH_STRUCTURE',{round_number:round,match_count:count});
  }
  const run=(action,payload)=>call('ANNUAL.RUNTIME',{target_tournament_id:String(target),target_tournament_year:Number(target),action,
   reason:'Synthetic canonical annual course',...payload});
  // Supported annual setup can refer to immutable canonical course facts from
  // the existing synthetic predecessor. It does not need a new global-course
  // capability or a directly seeded promotion/readiness object.
  for(let round=1;round<=3;round++)administration(target,'ASSIGN_COURSE',{round_number:round,
   course_id:'C'+round,tee:'Tournament',source_tournament_id:'2026',source_round_number:round});
  await preparePromotedFutureScoring({fixture:f,target,call});
  await run('GRANT_FUTURE_DIRECTOR',{expected_revision:0,target_player_id:syntheticDirector.playerId});
  await prepareFutureCanonicalContent({fixture:f,target,call});
  return readiness(target);
 }
 async function scoreTournament(target,onProgress=()=>{}){
  const matches=JSON.parse(f.q(`select jsonb_agg(to_jsonb(m)order by round_number,match_id)from scoring_authority.matches m where tournament_id='${target}'`));
  assert.equal(matches.length,24);const counts={1:0,2:0,3:0};
  for(const initial of matches){
   const match=()=>JSON.parse(f.q(`select to_jsonb(m)from scoring_authority.matches m where match_id='${initial.match_id}'`));
   if(target==='2026'){
    const id=randomUUID(),payload=buildTournamentSetupMutation('prepare-scoring-context',{expectedRevision:f.model().revision,operationRequestId:id,matchId:initial.match_id});
    delete payload.operation_request_id;execute(request('DIRECTOR.MUTATE_SETUP',{...payload,action:'prepare-scoring-context'},authorization(),id));
   }
   const control=action=>{const m=match();return execute(request('DIRECTOR.MATCH_CONTROL',{action,match_id:m.match_id,
    expected_match_revision:m.match_revision,expected_permission_revision:m.permission_revision}));};
   control('mark-live');
   // Future promotion intentionally leaves scoring locked. The synthetic
   // Director must perform the existing audited unlock, never patch that fact.
   if(match().scoring_locked)control('scoring-unlock');
   control('access-activate');
   const playerId=f.q(`select player_id from scoring_authority.match_participants where match_id='${initial.match_id}'and team_side=1 order by player_slot limit 1`);
   const player=annualPlayers.find(p=>p.playerId===playerId);assert.ok(player);
   for(let hole=1;hole<=18;hole++){
    const m=match(),key=`annual:${target}:${m.match_id}:h${hole}`;
    const payload={match_id:m.match_id,mutation_key:key,hole_number:hole,
     expected_match_revision:m.match_revision,expected_hole_revision:0,team_1_gross_scores:m.format==='BB'?[4,4]:[4],team_2_gross_scores:m.format==='BB'?[5,5]:[5]},
     actor={tournament_id:target,role:'PLAYER',auth_user_id:player.authUserId,player_id:player.playerId,match_id:m.match_id,permission_revision:m.permission_revision};
    if(target!=='2026'&&initial===matches[0]&&hole===1){
     const unleased=request('SCORING.SUBMIT_HOLE',payload,actor,key);
     assert.equal(m.status,'LIVE');
     assert.throws(()=>f.rpc('execute_certification_operation_v1',unleased),/CERTIFICATION_INGRESS_LEASE_REQUIRED/);
     assert.equal(f.q(`select count(*)from scoring_authority.hole_scores where match_id='${m.match_id}'and hole_number=1`),'0');
     ingressScenarios.successorLeaseRequired={tournamentId:target,matchId:m.match_id,
      state:'DENIED_WITHOUT_LEASE',authorizedLivePlayer:true,canonicalWriteCount:0};
    }
    if(target==='2026'&&initial===matches[0]&&hole===1){
     const rejected=request('SCORING.SUBMIT_HOLE',{...payload,mutation_key:key+':rejected',team_1_gross_scores:[0,0]},actor,key+':rejected');
     const lease=f.rpc('admit_certification_operation_v1',rejected);
     const result=f.rpc('execute_certification_operation_v1',{...rejected,ingress:{lease_id:lease.lease_id,admission_generation_id:lease.admission_generation_id}});
     assert.equal(result.ok,false);const terminal=f.rpc('read_certification_ingress_status_v1',{...rejected,payload:{match_id:m.match_id}});
     assert.equal(terminal.state,'NOT_COMMITTED');
     ingressScenarios.deterministicRejected={operationId:rejected.operation_request_id,leaseId:lease.lease_id,code:result.code,state:terminal.state};
     const unresolved=request('SCORING.SUBMIT_HOLE',{...payload,mutation_key:key+':unresolved'},actor,key+':unresolved');
     const pending=f.rpc('admit_certification_operation_v1',unresolved);
     assert.equal(f.rpc('mark_certification_ingress_unknown_v1',unresolved).state,'UNKNOWN');
     ingressScenarios.unresolved={input:unresolved,leaseId:pending.lease_id,admissionGenerationId:pending.admission_generation_id,state:'UNKNOWN'};
    }
    execute(request('SCORING.SUBMIT_HOLE',payload,actor,key),{loseAcknowledgement:target==='2026'&&initial===matches[0]&&hole===1});
    counts[initial.round_number]++;
   }
   const m=match(),key=`annual:${target}:${m.match_id}:final`;
   execute(request('SCORING.FINALIZE_MATCH',{match_id:m.match_id,mutation_key:key,expected_match_revision:m.match_revision},
    {...authorization(),match_id:m.match_id,permission_revision:m.permission_revision},key));
   assert.equal(match().status,'FINAL');onProgress({target,match:m.match_id,holes:Object.values(counts).reduce((a,b)=>a+b,0)});
  }
  assert.deepEqual(counts,{1:108,2:108,3:216});
  return{rounds:counts,holes:432,finals:24};
 }
 return{current,authorization,base,execute,request,administration,call,transition,transitionRequest,transitionStatus,readiness,prepareFuture,scoreTournament,receipts,timings,ingressScenarios};
}
