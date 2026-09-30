// Protected public-wrapper equivalence inside the existing owned release fixture.
// No hosted connection and no runtime assertion/manifest substitution is used.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {buildTournamentSetupMutation,normalizeProductionTournamentSetupPayload} from '../../../lib/production-tournament-setup-contract.js';
import {setupCoreSignatures} from './p0f-setup-fixture.mjs';
import {runProtectedFinancialEquivalence} from './p0f-protected-financial.mjs';

export function runP0FProductionEquivalence({cluster,database,psql,jsonSql,scope,beforeDefinitions}) {
 assert.ok(cluster.socketDirectory||cluster.socket,'owned socket-only fixture required');
 assert.equal(scope.environment,'PRODUCTION','protected profile is local fixture data, not a remote target');
 const query=q=>psql(cluster,database,q);
 const old=setupCoreSignatures.map(signature=>{const item=beforeDefinitions.find(d=>d.signature===signature);assert.ok(item?.definition,signature);return item.definition+';';}).join('\n');
 const actor='PX01',auth='b0000000-0000-4000-8000-000000000001',email='p0f-local-director@baggerinv.com';
 // The platform release fixture has no competitive rows. Only fixture data is
 // constructed here; authority gates and their real local release are retained.
 assert.equal(query("select count(*)from scoring_authority.tournament_players where tournament_id='2026'"),'0');
 query(`insert into auth.users(id,email,email_confirmed_at)values('${auth}','${email}',now());
 insert into scoring_authority.players(player_id,display_name)
 select 'PX'||lpad(n::text,2,'0'),'P0F synthetic golfer '||n from generate_series(1,24)n;
 insert into scoring_authority.teams(tournament_id,team_id,team_side,name)values('2026','PXT1',1,'Synthetic One'),('2026','PXT2',2,'Synthetic Two');
 insert into scoring_authority.tournament_players(tournament_id,player_id,team_id,team_side,participation_status,source_roster_key)
 select '2026','PX'||lpad(n::text,2,'0'),case when n<=12 then 'PXT1' else 'PXT2' end,case when n<=12 then 1 else 2 end,'ACTIVE','P0F_SYNTHETIC'from generate_series(1,24)n;
 insert into scoring_authority.rounds(tournament_id,round_number,format,name,handicap_allowance)
 values('2026',1,'BB','Synthetic Best Ball',0.9),('2026',2,'SC','Synthetic Scramble',1),('2026',3,'SI','Synthetic Singles',1);
 insert into participant_identity.user_player_links(auth_user_id,player_id,status,link_method,email_identity_hash)
 values('${auth}','${actor}','ACTIVE','SYNTHETIC_FIXTURE',repeat('a',64));
 insert into participant_identity.participant_auth_identifiers(player_id,auth_user_id,identifier_type,normalized_value_private,status,verified_at,verification_source,source_system,created_by,updated_by)
 values('${actor}','${auth}','EMAIL','${email}','VERIFIED',now(),'SYNTHETIC_FIXTURE','SYNTHETIC_FIXTURE','P0F','P0F');
 insert into participant_identity.tournament_roles(tournament_id,auth_user_id,role,granted_by)values('2026','${auth}','DIRECTOR','P0F');
 insert into production_control.director_entitlements(auth_user_id,tournament_id,player_id,role,granted_by)values('${auth}','2026','${actor}','DIRECTOR','P0F');
 insert into scoring_authority.scoring_snapshots(snapshot_id,tournament_id,match_id,snapshot_revision,scoring_rules_version,format,handicap_allowance,course_id,tee,rating,slope,par,match_netting_baseline,hole_definitions,participant_configuration,team_configuration,canonical_hash)
 values('2026-R1-1:S1','2026','2026-R1-1',1,'synthetic-v1','BB',0.9,'P0FC','Synthetic',72,120,72,'synthetic',(select jsonb_agg(jsonb_build_object('hole_number',h,'par',4,'stroke_index',h,'yardage',400)order by h)from generate_series(1,18)h),'{}','{}',repeat('e',64));
 insert into scoring_authority.matches(match_id,tournament_id,round_number,format,scoring_snapshot_id,status)values('2026-R1-1','2026',1,'BB','2026-R1-1:S1','UPCOMING');
 insert into scoring_authority.match_participants(match_id,player_id,team_side,player_slot,tournament_handicap,handicap_index,course_handicap,playing_handicap,final_strokes)
 values('2026-R1-1','PX01',1,1,0,0,0,0,0),('2026-R1-1','PX02',1,2,0,0,0,0,0),('2026-R1-1','PX13',2,1,0,0,0,0,0),('2026-R1-1','PX14',2,2,0,0,0,0,0);
 insert into scoring_authority.scoring_permissions(match_id,player_id,can_score,permission_revision,revoked_at)
 select match_id,player_id,false,1,now()from scoring_authority.match_participants where match_id='2026-R1-1';`);
 const activation=JSON.parse(query("select jsonb_build_object('revision',activation_revision,'epoch',authority_generation_id)from production_control.cutover_activation_state where scope_key='BAGGER_INV_PRODUCTION'"));
 const authorization={tournament_id:'2026',role:'DIRECTOR',player_id:actor,auth_user_id:auth};
 const common={...scope,expected_activation_revision:Number(activation.revision),expected_epoch_id:activation.epoch,authorization,actor_player_id:actor,actor_auth_user_id:auth};
 const readInput={...common,contract_version:'production-tournament-setup-v1',operation:'READ_PRODUCTION_TOURNAMENT_SETUP_V1'};
 const read=(restore=false)=>JSON.parse(query(`begin;${restore?old:''}set local role service_role;select public.read_production_tournament_setup_v1(${jsonSql(readInput)})::text;rollback;`));
 const beforeRead=read(true),afterRead=read();assert.equal(beforeRead.ok,true);assert.deepEqual(afterRead,beforeRead);
 const model=normalizeProductionTournamentSetupPayload(afterRead);
 const command={...common,contract_version:'production-tournament-setup-v1',...buildTournamentSetupMutation('update-tournament',{
  expectedRevision:model.revision,operationRequestId:randomUUID(),name:'P0F Protected Canonical Tournament',destination:'Synthetic fixture',startDate:'2026-10-01',endDate:'2026-10-03',timeZone:'America/Chicago',operationalStatus:'UPCOMING'})};
 const setupInput={...command,request_payload_hash:createHash('sha256').update(JSON.stringify(command)).digest('hex')};
 const controlInput={...common,authorization:{...authorization,permission_revision:1},operation:'SCORING_LOCK',match_id:'2026-R1-1',mutation_key:randomUUID(),expected_match_revision:0};
 const semantic=value=>Array.isArray(value)?value.map(semantic):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([key])=>!['timestamp','authority_updated_at','updated_at','revoked_at','generatedAt','eventId','occurredAt'].includes(key)).map(([key,item])=>[key,semantic(item)])):value;
 const cases=[{function:'read_production_tournament_setup_v1',result:'PASS',exactCurrentRead:true,realRuntimeGuards:true}];
 for(const [name,input]of[['mutate_production_tournament_setup_v1',setupInput],['mutate_production_match_control',controlInput]]){
  const run=restore=>{
   const result=query(`begin;${restore?old:''}set local role service_role;
    create temporary table p0f_equivalence_receipt as select public.${name}(${jsonSql(input)})as receipt;
    create temporary table p0f_equivalence_readback as select public.${name}(${jsonSql(input)})as replay,public.read_production_tournament_setup_v1(${jsonSql(readInput)})as current;
    reset role;
    select jsonb_build_object('receipt',(select receipt from p0f_equivalence_receipt),'replay',(select replay from p0f_equivalence_readback),'current',(select current from p0f_equivalence_readback),'match',(select to_jsonb(m)-'created_at'-'updated_at'-'authority_updated_at'from scoring_authority.matches m where match_id='2026-R1-1'),'permissions',(select jsonb_agg(to_jsonb(p)-'updated_at'-'revoked_at'order by player_id)from scoring_authority.scoring_permissions p where match_id='2026-R1-1'),'googleJobs',(select count(*)from scoring_authority.google_outbox_events))::text;
    rollback;`);
   return JSON.parse(result);
  };
  const before=run(true),after=run(false);assert.equal(before.receipt.ok,true,`${name} original admission must succeed: ${JSON.stringify(before.receipt)}`);assert.equal(after.receipt.ok,true);assert.equal(before.replay.idempotent,true);assert.equal(after.replay.idempotent,true);assert.equal(after.googleJobs,0);assert.deepEqual(semantic(after),semantic(before),`${name} original and candidate canonical effects must agree`);
  cases.push({function:name,result:'PASS',realRuntimeGuards:true,originalDefinitionsRestoredWithinRollback:true,receiptReplayAndCanonicalEffectsEquivalent:true,excludedComparisonFields:['timestamps','new audit event UUIDs'],googleJobs:0});
 }
 // ACCESS_ACTIVATE rechecks the original protected authority after locks.
 // The deliberately unprepared match must then return the same domain denial;
 // no readiness evidence is fabricated just to obtain a successful grant.
 const grantInput={...controlInput,operation:'ACCESS_ACTIVATE',mutation_key:randomUUID()};
 const grantAttempt=restore=>JSON.parse(query(`begin;${restore?old:''}set local role service_role;
  select public.mutate_production_match_control(${jsonSql(grantInput)})::text;rollback;`));
 const originalGrant=grantAttempt(true),candidateGrant=grantAttempt(false);
 assert.equal(originalGrant.ok,false);assert.equal(originalGrant.code,'PRODUCTION_MATCH_NOT_SCORING_READY');
 assert.deepEqual(candidateGrant,originalGrant);
 assert.equal(query("select count(*)from scoring_authority.score_mutations where match_id='2026-R1-1'"),'0');
 cases.push({function:'mutate_production_match_control',operation:'ACCESS_ACTIVATE',result:'PASS',realRuntimeGuards:true,
  protectedPostLockRevalidation:true,unchangedReadinessDenial:true,canonicalMutations:0});
 const financial=runProtectedFinancialEquivalence({cluster,database,psql,jsonSql,scope:common,authorization,beforeDefinitions});
 return {environment:'OWNED_SOCKET_ONLY_PROTECTED_PLATFORM_FIXTURE',productionQueried:false,runtimeGuardsSubstituted:false,setupControl:cases,financial,limitations:['Synthetic protected authority admitted by unchanged runtime guards; no hosted or Production observation','Positive control equivalence covers Lock; all five lifecycle operations are additionally proven through the isolated gateway']};
}
