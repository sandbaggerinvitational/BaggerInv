// Owned socket-only PostgreSQL fixture; no target URL is accepted.
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createPhase2CFixture} from './phase2c-fixture.mjs';
import {sql,sqlFile,jsonLiteral,repositoryRoot,destroyIsolatedCluster} from './postgres17.mjs';
import {syntheticDirector} from './synthetic-tournament.mjs';
import {buildTournamentSetupMutation,normalizeProductionTournamentSetupPayload} from '../../../lib/production-tournament-setup-contract.js';

export const setupCoreSignatures=[
 'public.mutate_production_match_control(jsonb)',
 'production_control.read_tournament_setup_before_round_workspace_v1(jsonb)',
 'production_control.mutate_setup_before_late_r3_v1(jsonb)',
 'production_control.mutate_round_pairings_before_late_r3_v1(jsonb)',
 'public.read_production_tournament_setup_v1(jsonb)',
 'production_control.mutate_late_r3_dispatch_v1(jsonb,boolean)',
 'public.mutate_production_round_pairings_v1(jsonb)',
 'public.mutate_production_tournament_setup_v1(jsonb)',
];
export function setupCatalog(query) {
 const names=[...new Set([...setupCoreSignatures.map(s=>s.split('.').at(-1).split('(')[0]),'canonical_tournament_setup_read_v1','canonical_match_control_v1','isolated_director_setup_operation_v1'])];
 const list=names.map(n=>`'${n}'`).join(',');
 return JSON.parse(query(`select jsonb_build_object('functions',(select jsonb_agg(jsonb_build_object(
  'oid',p.oid,'signature',n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
  'name',p.proname,'schema',n.nspname,'owner',pg_get_userbyid(p.proowner),'acl',p.proacl,
  'searchPath',p.proconfig,'volatility',p.provolatile,'definer',p.prosecdef,'language',l.lanname,
  'body',p.prosrc,'definition',pg_get_functiondef(p.oid),'anon',has_function_privilege('anon',p.oid,'EXECUTE'),
  'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),'serviceRole',has_function_privilege('service_role',p.oid,'EXECUTE')) order by p.oid)
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang where p.proname in(${list})),
 'dependencies',(select coalesce(jsonb_agg(jsonb_build_object('dependent',pg_describe_object(d.classid,d.objid,d.objsubid),
  'referenced',pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid),'type',d.deptype,'inbound',d.refclassid='pg_proc'::regclass and d.refobjid in(select oid from pg_proc where proname in(${list})))),'[]')
  from pg_depend d where (d.classid='pg_proc'::regclass and d.objid in(select oid from pg_proc where proname in(${list})))
    or (d.refclassid='pg_proc'::regclass and d.refobjid in(select oid from pg_proc where proname in(${list})))),
 'callers',(select coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'body',p.prosrc,
 'owner',pg_get_userbyid(p.proowner),'acl',p.proacl,'definer',p.prosecdef)),'[]')
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','production_control','scoring_authority')
 and exists(select 1 from unnest(array[${list}]) name where p.prosrc like '%'||name||'(%')))`));
}
async function restoreHostedRuntimeAssertions(cluster,database) {
 // Restore both inherited benchmark substitutions to actual source definitions.
 // They must continue denying isolated input; no hosted identity is forged.
 for(const [filename,name] of [
  ['202608300069_production_annual_scoring_authority_v1.sql','assert_production_scoring_runtime'],
  ['202608280052_production_maintenance_precommit_capability_guard.sql','assert_production_cutover_read_scope'],
 ]){
  const source=await readFile(path.join(repositoryRoot,'supabase/production_migrations',filename),'utf8');
  const marker=`create or replace function production_control.${name}(`;
  const start=source.indexOf(marker);assert.ok(start>=0,name);
  const end=source.indexOf('$$;',start);assert.ok(end>start,name);
  sql(cluster,database,source.slice(start,end+3),{role:''});
 }
}
export async function createP0FSetupFixture({install130=true,restoreProtectedAssertions=true}={}) {
 assert.equal(process.env.BAGGER_PHASE2C1_CANDIDATE,'1','P0F requires the retired Google candidate');
 assert.equal(process.env.BAGGER_PHASE2C1_CLOSURE,'1','P0F requires the annual closure candidate');
 assert.notEqual(process.env.BAGGER_P0F_CANDIDATE,'1','This fixture explicitly installs and compares128/130; do not preinstall them');
 const f=await createPhase2CFixture();const {cluster,database}=f;
 try {
  const query=value=>sql(cluster,database,value);
  if(restoreProtectedAssertions) await restoreHostedRuntimeAssertions(cluster,database);
  const before=setupCatalog(query);
  sqlFile(cluster,database,path.join(repositoryRoot,'supabase/production_migrations/202609300128_isolated_director_context_v1.sql'),{role:''});
  if(install130)sqlFile(cluster,database,path.join(repositoryRoot,'supabase/production_migrations/202609300130_isolated_setup_control_cores_v1.sql'),{role:''});
  const bindingId=randomUUID();
  query(`insert into production_control.isolated_director_context_v1(scope_key,binding_id,database_name,project_ref,project_url,tournament_id,governance_tournament_id,activation_revision,admission_revision,authority_epoch_id,release_commit,enabled,admission_state)
   select 'ISOLATED_DIRECTOR_V1','${bindingId}',current_database(),'LOCAL_ISOLATED','http://127.0.0.1:54321','2026','2026',1,1,active_epoch_id,repeat('9',40),true,'OPEN'
   from scoring_authority.ingress_gates where tournament_id='2026';
   update scoring_authority.matches set status='UPCOMING',scoring_locked=false where tournament_id='2026';
   update scoring_authority.scoring_permissions set can_score=false,revoked_at=now() where match_id in(select match_id from scoring_authority.matches where tournament_id='2026');`);
  const envelope={contract_version:'isolated-director-operations-v1',resource:{binding_id:bindingId,project_ref:'LOCAL_ISOLATED',project_url:'http://127.0.0.1:54321'},
   authorization:{tournament_id:'2026',role:'DIRECTOR',player_id:syntheticDirector.playerId,auth_user_id:syntheticDirector.authUserId}};
  const call=(name,input)=>JSON.parse(query(`set role service_role;select public.${name}(${jsonLiteral(input)})`));
  const read=(family='TOURNAMENT_SETUP',overrides={})=>call('read_isolated_director_operation_context_v1',{...envelope,family,...overrides});
  const model=()=>normalizeProductionTournamentSetupPayload(read().data);
  const command=(family,action,payload,operationRequestId=randomUUID(),contextToken=read().context.contextToken)=>({...envelope,family,action,payload,operation_request_id:operationRequestId,expected_context_token:contextToken});
  const execute=input=>call('execute_isolated_director_operation_v1',input);
  const setup=(action,value={},operationRequestId=randomUUID())=>{
   const payload=buildTournamentSetupMutation(action,{expectedRevision:model().revision,operationRequestId,...value});
   return execute(command(action==='replace-round-pairings'?'ROUND_PAIRINGS':'TOURNAMENT_SETUP',action,payload,operationRequestId));
  };
  const control=(action,matchId='2026-R1-1',operationRequestId=randomUUID())=>{
   const match=read('MATCH_CONTROL').data.data.matches.find(m=>m.matchId===matchId);assert.ok(match);
   return execute(command('MATCH_CONTROL',action,{match_id:matchId,expected_match_revision:match.matchRevision,expected_permission_revision:match.permissionRevision},operationRequestId));
  };
  return {...f,query,call,envelope,read,model,command,execute,setup,control,before,after:setupCatalog(query)};
 } catch(error){await destroyIsolatedCluster(cluster);throw error;}
}
