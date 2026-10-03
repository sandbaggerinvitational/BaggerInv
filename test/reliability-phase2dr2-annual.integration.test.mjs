// Owned local PostgreSQL only. Real new wrappers, private cores and actor checks;
// fixture provisioning creates synthetic identities without provider traffic.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createCertificationFixture,certificationForwardMigrations} from './support/reliability/phase2d-certification-fixture.mjs';
import {destroyIsolatedCluster} from './support/reliability/postgres17.mjs';

const annual='supabase/production_migrations/202609300134_certification_annual_administration_v1.sql';
const reads='supabase/production_migrations/202609300135_certification_read_contracts_v1.sql';

test('R2 annual CREATE/read shared core with truthful Certification authority',async t=>{
 const fixture=await createCertificationFixture({forwardMigrations:[...certificationForwardMigrations,annual,reads]});
 const resource=fixture.resources[0],auth='a2000000-0000-4000-8000-000000000001',player='AR01';
 const {q,rpc,envelope,context}=resource;
 try{
  q(`insert into auth.users(id,email,email_confirmed_at) values('${auth}','annual-owner@synthetic.invalid',now());
   insert into scoring_authority.players(player_id,display_name)values('${player}','Synthetic annual owner');
   insert into participant_identity.user_player_links(auth_user_id,player_id,status,link_method,email_identity_hash)
   values('${auth}','${player}','ACTIVE','SYNTHETIC_FIXTURE',repeat('9',64));
   with e as(insert into production_control.director_entitlements(auth_user_id,tournament_id,player_id,role,status,granted_by)
     values('${auth}','2026','${player}','OWNER','ACTIVE','SYNTHETIC_FIXTURE')returning entitlement_id),
   event as(insert into production_control.director_entitlement_events(entitlement_id,action,actor,reason)
     select entitlement_id,'GRANTED','SYNTHETIC_FIXTURE','Synthetic owner authority'from e returning event_id,entitlement_id)
   insert into production_control.tournament_owner_capabilities_v1(tournament_id,player_id,auth_user_id,adopted_from_entitlement_id,
     adopted_entitlement_event_id,adopted_entitlement_event_count,status,capability_revision,adopted_by_player_id,adopted_at)
   select '2026','${player}','${auth}',entitlement_id,event_id,1,'ACTIVE',1,'${player}',now()from event;`);
  const authorization={tournament_id:'2026',role:'DIRECTOR',player_id:player,auth_user_id:auth};
  const base=()=>({...envelope,phase:'ANNUAL',authorization,expected_context_token:context('ANNUAL').context_token});
  const create=(year,changes={})=>({...base(),operation_request_id:randomUUID(),payload:{operation:'CREATE_TOURNAMENT',
   target_tournament_id:String(year),target_tournament_year:year,tournament_name:'Synthetic annual '+year,destination:'Synthetic course',
   start_date:`${year}-09-20`,end_date:`${year}-09-22`,timezone:'America/Chicago',creation_mode:'BLANK',
   expected_revision:0,request_payload_hash:'a'.repeat(64),reason:'Synthetic canonical annual proof',...changes}});
  const mutate=request=>rpc('mutate_certification_future_year_administration_v1',request);
  const read=target=>rpc('read_certification_future_year_administration_v1',{...base(),payload:{target_tournament_id:String(target)}});
  const snapshot=target=>JSON.parse(q(`select jsonb_build_object(
   'catalog',(select count(*)from production_control.future_tournament_catalog_v1 where tournament_id='${target}'),
   'resources',(select count(*)from production_control.future_tournament_resources_v1 where tournament_id='${target}'),
   'receipts',(select count(*)from production_control.future_year_operation_receipts_v1 where target_tournament_id='${target}'),
   'audit',(select count(*)from production_control.future_year_audit_events_v1 where target_tournament_id='${target}'),
   'runtime',(select count(*)from scoring_authority.tournaments where tournament_id='${target}'),
   'googleJobs',(select count(*)from production_control.future_match_google_compatibility_jobs_v1 where tournament_id='${target}'))`));
  const originalPointer=q('select row_to_json(v)from production_control.current_tournament_pointer_v1 v');
  let firstRequest,firstResult;
  await t.test('authorized owner creates future Draft with current/target distinction and truthful resource readback',()=>{
   firstRequest=create(2098);firstResult=mutate(firstRequest);
   assert.equal(firstResult.ok,true,JSON.stringify(firstResult));assert.equal(firstResult.idempotent,false);
   assert.equal(read(2098).data.selectedTournament.tournamentYear,2098);
   assert.equal(read(2098).data.selectedTournament.lifecycle,'DRAFT');
   assert.deepEqual(snapshot(2098),{catalog:1,resources:1,receipts:1,audit:1,runtime:0,googleJobs:0});
   const target=JSON.parse(q("select to_jsonb(v)from production_control.future_tournament_resources_v1 v where tournament_id='2098'"));
   assert.equal(target.project_ref,resource.resource.project_ref);
   assert.equal(target.source_workbook_id,'urn:bagger:synthetic:'+resource.resource.installation_id);
   assert.equal(q('select count(*)from production_control.resource_scope'),'0');
   assert.equal(q('select count(*)from production_control.cutover_activation_state'),'0');
   assert.equal(q('select row_to_json(v)from production_control.current_tournament_pointer_v1 v'),originalPointer);
  });
  await t.test('same operation replay and conflict preserve one canonical receipt',()=>{
   const replay=mutate(firstRequest);assert.equal(replay.idempotent,true);assert.equal(replay.receipt_id,firstResult.receipt_id);
   assert.equal(mutate({...firstRequest,payload:{...firstRequest.payload,tournament_name:'Changed'}}).code,'PRODUCTION_FUTURE_YEAR_IDEMPOTENCY_CONFLICT');
   assert.equal(mutate({...firstRequest,operation_request_id:randomUUID()}).code,'FUTURE_TOURNAMENT_CREATE_PREDECESSOR_INVALID');
   assert.deepEqual(snapshot(2098),{catalog:1,resources:1,receipts:1,audit:1,runtime:0,googleJobs:0});
  });
  await t.test('canonical numeric target year contract remains strict',()=>{
   for(const year of ['2097',2097.5,null])assert.equal(mutate(create(2097,{target_tournament_year:year})).code,'FUTURE_TOURNAMENT_METADATA_INVALID');
   assert.equal(mutate(create(2097,{target_tournament_year:2096})).code,'FUTURE_TOURNAMENT_METADATA_INVALID');
   assert.equal(mutate(create(2026)).code,'FUTURE_TOURNAMENT_CREATE_PREDECESSOR_INVALID');
   assert.equal(mutate(create(2097)).ok,true);
  });
  await t.test('wrong actor/role/context/authority fields fail closed before any create',()=>{
   for(const a of [{...authorization,role:'PARTICIPANT'},{...authorization,role:'SPECTATOR'},
    {...authorization,auth_user_id:randomUUID()},{...authorization,tournament_id:'2098'},{}]){
    assert.throws(()=>mutate({...create(2096),authorization:a}),/DIRECTOR_REQUIRED|OWNER_REQUIRED|INPUT_INVALID/);
   }
   assert.throws(()=>mutate({...create(2096),expected_context_token:'0'.repeat(64)}),/CONTEXT_STALE/);
   assert.throws(()=>mutate(create(2096,{resource_id:resource.resource.resource_id})),/AUTHORITY_FIELD_REJECTED/);
   for(const role of ['anon','authenticated'])assert.throws(()=>rpc('mutate_certification_future_year_administration_v1',create(2096),role),/permission denied/);
   assert.deepEqual(snapshot(2096),{catalog:0,resources:0,receipts:0,audit:0,runtime:0,googleJobs:0});
  });
  for(const[year,table]of[[2095,'future_tournament_resources_v1'],[2094,'future_year_audit_events_v1'],[2093,'future_year_operation_receipts_v1']]){
   await t.test(`failure before ${table} rolls back and same request retries`,()=>{
    const request=create(year);
    q(`create function production_control.r2_annual_fault()returns trigger language plpgsql as $$begin raise exception 'R2_ANNUAL_INJECTED_FAILURE';end$$;
     create trigger r2_annual_fault before insert on production_control.${table} for each row execute function production_control.r2_annual_fault()`);
    try{
     assert.throws(()=>mutate(request),/R2_ANNUAL_INJECTED_FAILURE/);
     assert.deepEqual(snapshot(year),{catalog:0,resources:0,receipts:0,audit:0,runtime:0,googleJobs:0});
    }finally{q(`drop trigger r2_annual_fault on production_control.${table};drop function production_control.r2_annual_fault()`);}
    assert.equal(mutate(request).ok,true);
   });
  }
  await t.test('audit records resource, actor, operation and release atomically; cores are private',()=>{
   const audit=JSON.parse(q(`select details from production_control.operation_audit_events
    where event_type='CERTIFICATION_ANNUAL_OPERATION'and details->>'operation_request_id'='${firstRequest.operation_request_id}'`));
   assert.equal(audit.resource_class,'CERTIFICATION');assert.equal(audit.resource_id,resource.resource.resource_id);
   assert.equal(audit.actor_auth_user_id,auth);assert.equal(audit.receipt.receipt_id,firstResult.receipt_id);
   assert.equal(audit.release_commit,resource.deployment.release_commit);
   assert.equal(q(`select count(*)from production_control.canonical_operation_context_v1`),'0');
   assert.equal(q(`select count(*)from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='production_control'
    and p.proname in('assert_canonical_annual_actor_v2','production_annual_context_v2','assert_canonical_annual_context_v2',
     'canonical_mutate_future_year_administration_v2','canonical_read_future_year_administration_v2','dispatch_certification_annual_v1')
    and(has_function_privilege('anon',p.oid,'EXECUTE')or has_function_privilege('authenticated',p.oid,'EXECUTE')or has_function_privilege('service_role',p.oid,'EXECUTE'))`),'0');
  });
  t.diagnostic(JSON.stringify({environment:'OWNED_LOCAL_POSTGRESQL17',forwardMigrations:fixture.forwardMigrations,
   convergentFunctions:fixture.bundle.catalog.functions.length,authorityRowsCopied:0,googleCalls:0,hostedAccess:false,
   finalBaselineEmitted:false,annualTransition:'NOT_IMPLEMENTED_OWNER_REVIEW_REQUIRED'}));
 }finally{await destroyIsolatedCluster(fixture.cluster);}
});
