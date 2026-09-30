// Owned socket-only canonical PostgreSQL profile. No hosted target accepted.
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createP0FSetupFixture} from './p0f-setup-fixture.mjs';
import {sqlFile,jsonLiteral,repositoryRoot,destroyIsolatedCluster} from './postgres17.mjs';
export const financialNames=['save_production_net_skins_entries_v1','replace_production_calcutta_v1_auction_facts','clear_production_calcutta_v1_auction_entry','configure_production_calcutta_v1','canonical_net_skins_entries_core_v1','canonical_calcutta_auction_core_v1','canonical_calcutta_clear_core_v1','capture_derived_delivery_provenance_v1','capture_derived_delivery_transition_v1','isolated_director_financial_operation_v1'];
export function financialCatalog(query){
 const list=financialNames.map(n=>`'${n}'`).join(',');
 return JSON.parse(query(`select jsonb_build_object('functions',(select jsonb_agg(jsonb_build_object('oid',p.oid,'schema',n.nspname,'name',p.proname,'owner',pg_get_userbyid(p.proowner),'acl',p.proacl,'config',p.proconfig,'volatile',p.provolatile,'definer',p.prosecdef,'body',p.prosrc,'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service',has_function_privilege('service_role',p.oid,'EXECUTE')) order by p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in(${list})), 'dependencies',(select coalesce(jsonb_agg(jsonb_build_object('from',pg_describe_object(d.classid,d.objid,d.objsubid),'to',pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid),'type',d.deptype)),'[]') from pg_depend d where(d.classid='pg_proc'::regclass and d.objid in(select oid from pg_proc where proname in(${list})))or(d.refclassid='pg_proc'::regclass and d.refobjid in(select oid from pg_proc where proname in(${list})))), 'callers',(select coalesce(jsonb_agg(jsonb_build_object('function',p.oid::regprocedure::text,'body',p.prosrc)),'[]') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','production_control','scoring_authority') and exists(select 1 from unnest(array[${list}])n where p.prosrc like '%'||n||'(%')))`));
}
export async function createP0FFinancialFixture({beforeInstall}={}){
 const f=await createP0FSetupFixture({install130:false});
 try{
  const {cluster,database,query,call,envelope}=f;
  for(const file of ['director-calcutta-management-read-v1.sql','director-calcutta-clear-entry-v1.sql'])
    sqlFile(cluster,database,path.join(repositoryRoot,'supabase/production_incremental',file),{role:''});
  const beforeFinancial=financialCatalog(query);
  if(beforeInstall)await beforeInstall(f);
  sqlFile(cluster,database,path.join(repositoryRoot,'supabase/production_migrations/202609300129_isolated_financial_cores_v1.sql'),{role:''});
  const read=(family='CALCUTTA_MANAGEMENT',overrides={})=>call('read_isolated_director_operation_context_v1',{...envelope,family,...overrides});
  const command=(family,action,payload,operationRequestId=randomUUID(),token=read(family).context.contextToken)=>({...envelope,family,action,payload,operation_request_id:operationRequestId,expected_context_token:token});
  const execute=input=>call('execute_isolated_director_operation_v1',input);
  const status=input=>call('read_isolated_director_operation_context_v1',{...input,mode:'status'}).data;
  const round=rn=>read('NET_SKINS_ENTRIES').data.rounds.find(r=>r.roundNumber===rn);
  const entryCommand=(rn,entered=true)=>{const r=round(rn);return command('NET_SKINS_ENTRIES','save',{round_number:rn,expected_revision:r.revision,field_fingerprint:r.fieldFingerprint,configured:true,entries:r.entrants.map((e,i)=>({key:e.key,bindingFingerprint:e.bindingFingerprint,entered:entered&&i===0}))});};
  // Explicit synthetic owner-approved configuration construction. The candidate
  // does not expose configuration mutation or change its rules.
  const cfg={contract_version:'production-calcutta-v1',point_structure:Array.from({length:24},(_,i)=>({place:i+1,round_1_award:String((24-i)*4),round_2_award:String(i<12?(12-i)*12-3:0),round_3_award:String((24-i)*5)})),payout_structure:Array.from({length:24},(_,i)=>({place:i+1,round_1_fraction:['0.0125','0.01','0.0075'][i]||'0',round_2_fraction:['0.025','0.015'][i]||'0',round_3_fraction:['0.0125','0.01','0.0075'][i]||'0',overall_fraction:i===23?'0.05':['0.225','0.2','0.15','0.12','0.09','0.065'][i]||'0'}))};
  query(`insert into scoring_authority.calcutta_v1_configuration_revisions(tournament_id,configuration_revision,contract_version,state,configuration_manifest,configuration_fingerprint,resource_fingerprint,activation_revision,configured_by_player_id,configured_by_auth_user_id,request_fingerprint,request_payload_hash,configured_at) values('2026',2,'production-calcutta-v1','CONFIGURED',production_control.build_production_calcutta_v1_configuration(${jsonLiteral(cfg)}),repeat('a',64),repeat('b',64),1,'P01','10000000-0000-4000-8000-000000000001',repeat('c',64),repeat('d',64),now()); update scoring_authority.calcutta_v1_current set configuration_revision=2,configuration_revision_id=(select configuration_revision_id from scoring_authority.calcutta_v1_configuration_revisions where configuration_revision=2 and tournament_id='2026'),configuration_fingerprint=repeat('a',64),state='CONFIGURED' where tournament_id='2026';`);
  const auctionCommand=(action='replace-auction',values={})=>{const c=read().data;return command('CALCUTTA_MANAGEMENT',action,{expected_configuration_revision:c.configuration_revision,expected_configuration_fingerprint:c.configuration_fingerprint,expected_auction_revision:c.auction_revision,expected_auction_fingerprint:c.auction_fingerprint,expected_publication_revision:c.publication_revision,...values});};
  return {...f,beforeFinancial,afterFinancial:financialCatalog(query),read,command,execute,status,round,entryCommand,auctionCommand};
 }catch(error){await destroyIsolatedCluster(f.cluster);throw error;}
}
