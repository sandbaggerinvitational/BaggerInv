// Proof layers: POSTGRESQL / SECURITY / INTEGRATION.
// New isolated admission and canonical actor verifier are real. The inherited
// score fixture substitutes two legacy hosted runtime gates, neither of which
// is called by this new context. This is not Production admission certification.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createPhase2CFixture} from './support/reliability/phase2c-fixture.mjs';
import {destroyIsolatedCluster,sql,sqlFile,jsonLiteral,repositoryRoot} from './support/reliability/postgres17.mjs';
import {syntheticDirector} from './support/reliability/synthetic-tournament.mjs';

test('P0-F isolated context preserves exact resource, current authority, active Director and private-core boundaries',async t=>{
 const fixture=await createPhase2CFixture();const {cluster,database}=fixture;
 t.after(()=>destroyIsolatedCluster(cluster));
 const query=value=>sql(cluster,database,value);
 const binding=randomUUID();
 const input={contract_version:'isolated-director-operations-v1',resource:{binding_id:binding,project_ref:'LOCAL_ISOLATED',project_url:'http://127.0.0.1:54321'},
  authorization:{tournament_id:'2026',role:'DIRECTOR',player_id:syntheticDirector.playerId,auth_user_id:syntheticDirector.authUserId}};
 const read=(value=input)=>JSON.parse(query(`select public.read_isolated_director_operation_context_v1(${jsonLiteral(value)})`));
 const before=query("select jsonb_build_object('resource',(select to_jsonb(r)from production_control.resource_scope r),'activation',(select to_jsonb(a)from production_control.cutover_activation_state a))::text");
 query('create role p0f_context_unexpected');
 query('alter default privileges in schema production_control grant execute on functions to p0f_context_unexpected');
 assert.throws(()=>sqlFile(cluster,database,path.join(repositoryRoot,'supabase/production_migrations/202609300128_isolated_director_context_v1.sql'),{role:''}),/CONTEXT_ACL_MISMATCH/);
 assert.equal(query("select to_regclass('production_control.isolated_director_context_v1') is null"),'t','failed default-ACL install rolls back inert binding table');
 query('alter default privileges in schema production_control revoke execute on functions from p0f_context_unexpected');
 sqlFile(cluster,database,path.join(repositoryRoot,'supabase/production_migrations/202609300128_isolated_director_context_v1.sql'),{role:''});
 assert.equal(query('select count(*) from production_control.isolated_director_context_v1'),'0');
 assert.throws(()=>read(),/ISOLATED_DIRECTOR_CONTEXT_REQUIRED/,'inert migration never admits an operation');
 query(`insert into production_control.isolated_director_context_v1(scope_key,binding_id,database_name,project_ref,project_url,tournament_id,governance_tournament_id,activation_revision,admission_revision,authority_epoch_id,release_commit)
  select 'ISOLATED_DIRECTOR_V1','${binding}',current_database(),'LOCAL_ISOLATED','http://127.0.0.1:54321','2026','2026',1,1,active_epoch_id,repeat('9',40)
  from scoring_authority.ingress_gates where tournament_id='2026'`);
 assert.throws(()=>read(),/ISOLATED_DIRECTOR_CONTEXT_REQUIRED/,'owner-created binding defaults disabled');
 query("update production_control.isolated_director_context_v1 set enabled=true,admission_state='OPEN'");
 const accepted=read();assert.equal(accepted.ok,true);assert.equal(accepted.context.bindingId,binding);assert.equal(accepted.context.tournamentId,'2026');assert.match(accepted.context.contextToken,/^[a-f0-9]{64}$/);
 for(const role of ['anon','authenticated']){
  assert.throws(()=>query(`set role ${role};select public.read_isolated_director_operation_context_v1(${jsonLiteral(input)})`),/permission denied/);
 }
 assert.equal(query("select has_table_privilege('service_role','production_control.isolated_director_context_v1','insert')"),'f');
 assert.equal(query("select has_table_privilege('service_role','production_control.isolated_director_context_v1','update')"),'f');
 assert.equal(query("select has_function_privilege('service_role','production_control.assert_isolated_director_operation_context_v1(jsonb,boolean)','execute')"),'f');
 assert.equal(query("select has_function_privilege('authenticated','public.execute_isolated_director_operation_v1(jsonb)','execute')"),'f');
 for(const resource of [{...input.resource,binding_id:randomUUID()},{...input.resource,project_ref:'ymqhhtxaywtqllynrmxe'},{...input.resource,project_url:'https://ymqhhtxaywtqllynrmxe.supabase.co'}])
  assert.throws(()=>read({...input,resource}),/ISOLATED_DIRECTOR_CONTEXT_REQUIRED/);
 assert.throws(()=>read({...input,authorization:{...input.authorization,tournament_id:'2098'}}),/ISOLATED_DIRECTOR_CONTEXT_REQUIRED/);
 assert.throws(()=>read({...input,authorization:{...input.authorization,role:'PLAYER'}}),/ISOLATED_DIRECTOR_CONTEXT_REQUIRED/);
 assert.throws(()=>read({...input,authorization:{...input.authorization,auth_user_id:'10000000-0000-4000-8000-000000000012',player_id:'P12'}}),/PRODUCTION_DIRECTOR_AUTHORIZATION_REQUIRED/);
 assert.throws(()=>read({...input,authorization:{...input.authorization,player_id:'P02'}}),/PRODUCTION_DIRECTOR_AUTHORIZATION_REQUIRED/);
 // Owner fixture changes model revocation, never a runtime shortcut.
 query("update production_control.director_entitlements set status='REVOKED',revoked_at=now() where player_id='P01'");
 assert.throws(()=>read(),/PRODUCTION_DIRECTOR_AUTHORIZATION_REQUIRED/);
 query("update production_control.director_entitlements set status='ACTIVE',revoked_at=null where player_id='P01'");
 query("update participant_identity.user_player_links set status='REVOKED',revoked_at=now() where player_id='P01'");
 assert.throws(()=>read(),/PRODUCTION_DIRECTOR_AUTHORIZATION_REQUIRED/);
 query("update participant_identity.user_player_links set status='ACTIVE',revoked_at=null where player_id='P01'");
 query("update production_control.isolated_director_context_v1 set database_name='another_database'");
 assert.throws(()=>read(),/ISOLATED_DIRECTOR_CONTEXT_REQUIRED/);
 query("update production_control.isolated_director_context_v1 set database_name=current_database(),activation_revision=2");
 assert.throws(()=>read({...input,expected_context_token:accepted.context.contextToken}),/ISOLATED_DIRECTOR_CONTEXT_STALE/);
 const current=read();assert.notEqual(current.context.contextToken,accepted.context.contextToken);
 query("update production_control.isolated_director_context_v1 set authority_epoch_id='30000000-0000-4000-8000-000000000099'");
 assert.throws(()=>read(),/ISOLATED_DIRECTOR_RUNTIME_NOT_SAFE/);
 query("update production_control.isolated_director_context_v1 set authority_epoch_id=(select active_epoch_id from scoring_authority.ingress_gates where tournament_id='2026')");
 const fresh=read();
 assert.throws(()=>query(`select public.execute_isolated_director_operation_v1(${jsonLiteral({...input,expected_context_token:fresh.context.contextToken,operation_request_id:randomUUID(),family:'UNREGISTERED',action:'anything',payload:{}})})`),/ISOLATED_DIRECTOR_OPERATION_INVALID/);
 assert.throws(()=>query(`select public.execute_isolated_director_operation_v1(${jsonLiteral({...input,expected_context_token:fresh.context.contextToken,operation_request_id:'bad',family:'NET_SKINS_ENTRIES',action:'save',payload:{}})})`),/ISOLATED_DIRECTOR_INPUT_INVALID/);
 const after=query("select jsonb_build_object('resource',(select to_jsonb(r)from production_control.resource_scope r),'activation',(select to_jsonb(a)from production_control.cutover_activation_state a))::text");
 assert.equal(after,before,'isolated admission never rewrites the Production resource or activation');
 assert.equal(query('select count(*) from production_control.net_skins_entry_revisions_v1'),'0','context proof performs no entry mutation');
});
