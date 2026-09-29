// Synthetic fixture construction is limited to pre-existing platform identities.
// The future tournament itself is created/configured only through installed RPCs.
// No runtime function/manifest/guard is replaced by this helper.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export function runZeroGoogleAnnualInitialization({cluster,database,psql,jsonSql}){
 const sql=s=>psql(cluster,database,s);
 const target='2098',auth='a0000000-0000-4000-8000-000000000001';
 const players=['FZ01','FZ02','FZ03','FZ04'];
 const evidence={fixture:'phase2c1-annual-initialization-v1',targetYear:2098,environment:'OWNED_SOCKET_ONLY_POSTGRESQL17',runtimeGuardsSubstituted:false,operations:[],status:'RUNNING'};
 const resource=JSON.parse(sql("select to_jsonb(v) from production_control.resource_scope v where scope_key='BAGGER_INV_PRODUCTION'"));
 const scope={environment:'PRODUCTION',project_ref:resource.project_ref,project_url:resource.project_url,source_workbook_id:resource.google_workbook_id,tournament_id:'2026',tournament_year:2026,
  authorization:{tournament_id:'2026',player_id:players[0],auth_user_id:auth,role:'DIRECTOR'},actor_player_id:players[0],actor_auth_user_id:auth};
 const hash=input=>JSON.parse(sql(`select (${jsonSql(input)}||jsonb_build_object('request_payload_hash',production_control.future_runtime_hash_v2(${jsonSql(input)})))::text`));
 // Synthetic current-platform owner/participant identities are fixture data, not enrollment traffic.
 sql(`insert into auth.users(id,email,email_confirmed_at) values('${auth}','phase2c1-synthetic-owner@baggerinv.com',now());
 insert into scoring_authority.players(player_id,display_name,source_payload)
 select value,'Synthetic annual player '||value,'{}'::jsonb from unnest(array['FZ01','FZ02','FZ03','FZ04']) value;
 insert into participant_identity.user_player_links(auth_user_id,player_id,status,link_method,email_identity_hash,linked_at,linked_by)
 values('${auth}','FZ01','ACTIVE','SYNTHETIC_FIXTURE',encode(extensions.digest('phase2c1-synthetic-owner@baggerinv.com','sha256'),'hex'),now(),'SYNTHETIC_FIXTURE');
 with entitlement as(insert into production_control.director_entitlements(auth_user_id,tournament_id,player_id,role,status,granted_by)
 values('${auth}','2026','FZ01','OWNER','ACTIVE','SYNTHETIC_FIXTURE')returning entitlement_id),
 event as(insert into production_control.director_entitlement_events(entitlement_id,action,actor,reason)
 select entitlement_id,'GRANTED','SYNTHETIC_FIXTURE','Synthetic owner authority'from entitlement returning event_id,entitlement_id)
 insert into production_control.tournament_owner_capabilities_v1(tournament_id,player_id,auth_user_id,adopted_from_entitlement_id,adopted_entitlement_event_id,adopted_entitlement_event_count,status,capability_revision,adopted_by_player_id,adopted_at)
 select'2026','FZ01','${auth}',entitlement_id,event_id,1,'ACTIVE',1,'FZ01',now()from event;`);
 // EXPECTED RED: installed annual scope and creation parser disagree about
 // tournament_year. This behavioral reproduction must not be counted as annual PASS.
 const createValues={tournament_name:'Zero Google synthetic annual',destination:'Synthetic course',start_date:'2098-09-20',end_date:'2098-09-22',time_zone:'America/Chicago',creation_mode:'BLANK'};
 const attempt=(year)=>{
  const input=hash({...scope,contract_version:'production-future-year-administration-v1',action:'CREATE_TOURNAMENT',operation:'CREATE_TOURNAMENT',target_tournament_id:target,target_tournament_year:2098,tournament_year:year,operation_request_id:randomUUID(),expected_revision:0,reason:'Synthetic annual protocol reproduction',...createValues});
  try{return{year,response:JSON.parse(sql(`select public.mutate_production_future_year_administration_v1(${jsonSql(input)})::text`))};}
  catch(error){return{year,error:String(error.message).split('\n').filter(line=>/ERROR:|CONTEXT:|PL\/pgSQL function/.test(line)).join('\n')};}
 };
 const targetYear=attempt(2098);
 assert.match(targetYear.error||'',/PRODUCTION_FUTURE_RUNTIME_EXACT_RESOURCE_REQUIRED/);
 const currentYear=attempt(2026);
 assert.equal(currentYear.response?.ok,false);
 assert.equal(currentYear.response?.code,'FUTURE_TOURNAMENT_METADATA_INVALID');
 assert.equal(sql(`select count(*)from production_control.future_tournament_catalog_v1 where tournament_id='${target}'`),'0');
 evidence.status='EXPECTED_RED';evidence.gate='ANNUAL_INITIALIZATION_NOT_PROVEN';
 evidence.issue='P2C1-ANNUAL-001';evidence.cases=[targetYear,currentYear];
 evidence.GoogleCalls=0;evidence.GoogleCredentialsPresent=false;
 evidence.futureTournamentCreated=false;evidence.runtimeGuardsSubstituted=false;
 evidence.limitations=['Existing installed annual CREATE protocol is contradictory: current authorization scope and target metadata share tournament_year','No future tournament or readiness/generation certificate was inserted to evade the failing operation','Downstream setup, authoring, annual PREPARE/CLOSE/ACTIVATE remain NOT PROVEN by this fixture','Historical platform bootstrap and pre-existing owner identity are synthetic fixture preconditions','No hosted, Production, Google or physical proof'];
 return{evidence};
}
