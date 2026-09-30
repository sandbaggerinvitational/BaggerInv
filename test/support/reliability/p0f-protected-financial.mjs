// Positive wrapper equivalence in the existing protected local platform fixture.
// Call only with that fixture's owned socket cluster and admitted synthetic tuple.
// No runtime assertion is replaced. Every comparison transaction rolls back.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {repositoryRoot} from './postgres17.mjs';
const definitions=[
 ['save_production_net_skins_entries_v1','supabase/production_migrations/202609090098_production_net_skins_entries_v1.sql'],
 ['replace_production_calcutta_v1_auction_facts','supabase/production_migrations/202608290056_production_calcutta_v1.sql'],
 ['clear_production_calcutta_v1_auction_entry','supabase/production_incremental/director-calcutta-clear-entry-v1.sql'],
];
function originalDefinition(name,file){const source=readFileSync(path.join(repositoryRoot,file),'utf8');const match=new RegExp(`create (?:or replace )?function public\\.${name}\\(`).exec(source);assert.ok(match,name);const end=source.indexOf('$$;',match.index);return source.slice(match.index,end+3).replace(/^create function /,'create or replace function ');}
export function runProtectedFinancialEquivalence({cluster,database,psql,jsonSql,scope,authorization,beforeDefinitions}){
 assert.ok(cluster.socketDirectory||cluster.socket,'owned local socket fixture is required');
 assert.equal(authorization.role,'DIRECTOR');assert.equal(authorization.tournament_id,'2026');
 const query=q=>psql(cluster,database,q);const results=[];
 const activation=JSON.parse(query("select to_jsonb(a)from production_control.cutover_activation_state a where scope_key='BAGGER_INV_PRODUCTION'"));
 const common={...scope,read_contract:'ACTIVE_CUTOVER',cutover_phase:activation.read_cutover_phase,expected_activation_revision:activation.activation_revision,expected_epoch_id:activation.authority_generation_id,
  vercel_project_id:activation.expected_vercel_project_id,vercel_team_id:'team_kPw5zaib8uaQJALAwj4fWI6R',vercel_environment:'production',
  authorization,actor_player_id:authorization.player_id,actor_auth_user_id:authorization.auth_user_id,actor_id:authorization.player_id};
 const cfg={contract_version:'production-calcutta-v1',point_structure:Array.from({length:24},(_,i)=>({place:i+1,round_1_award:String((24-i)*4),round_2_award:String(i<12?(12-i)*12-3:0),round_3_award:String((24-i)*5)})),payout_structure:Array.from({length:24},(_,i)=>({place:i+1,round_1_fraction:['0.0125','0.01','0.0075'][i]||'0',round_2_fraction:['0.025','0.015'][i]||'0',round_3_fraction:['0.0125','0.01','0.0075'][i]||'0',overall_fraction:i===23?'0.05':['0.225','0.2','0.15','0.12','0.09','0.065'][i]||'0'}))};
 const seedConfiguration=`insert into scoring_authority.calcutta_v1_configuration_revisions(tournament_id,configuration_revision,contract_version,state,configuration_manifest,configuration_fingerprint,resource_fingerprint,activation_revision,configured_by_player_id,configured_by_auth_user_id,request_fingerprint,request_payload_hash,configured_at)
 select '2026',configuration_revision+1,'production-calcutta-v1','CONFIGURED',production_control.build_production_calcutta_v1_configuration(${jsonSql(cfg)}),repeat('a',64),repeat('b',64),1,${jsonSql(authorization.player_id)}#>>'{}',(${jsonSql(authorization.auth_user_id)}#>>'{}')::uuid,repeat('c',64),repeat('d',64),now()from scoring_authority.calcutta_v1_current where tournament_id='2026';
 update scoring_authority.calcutta_v1_current c set configuration_revision=a.configuration_revision,configuration_revision_id=a.configuration_revision_id,configuration_fingerprint=a.configuration_fingerprint,state='CONFIGURED'from scoring_authority.calcutta_v1_configuration_revisions a where c.tournament_id='2026'and a.tournament_id='2026'and a.configuration_revision=c.configuration_revision+1;`;
 const financialInput=requestId=>`(${jsonSql({...common,contract_version:'production-calcutta-v1',expected_tournament_id:'2026',request_fingerprint:createHash('sha256').update(requestId).digest('hex'),purchases:[{player_id:authorization.player_id,purchase_price:'123.45'}],ownership:[{player_id:authorization.player_id,owner_player_id:authorization.player_id,ownership_fraction:'1'}],player_id:authorization.player_id})}||jsonb_build_object('expected_configuration_revision',c.configuration_revision,'expected_configuration_fingerprint',c.configuration_fingerprint,'expected_auction_revision',c.auction_revision,'expected_auction_fingerprint',c.auction_fingerprint,'expected_publication_revision',c.publication_revision))`;
 for(const [name,file] of definitions){
  const requestId=randomUUID(),seedId=randomUUID();const captured=beforeDefinitions?.find(value=>value.signature===`public.${name}(jsonb)`);assert.ok(captured?.definition,`actual pre-migration definition required: ${name}`);const original=captured.definition.replace(/;\s*$/, '')+';';let prepare='',inputSql;
  if(name.startsWith('save_')){
   inputSql=`select ${jsonSql({...common,contract_version:'production-tournament-setup-v1',operation_request_id:requestId,configured:false})}||jsonb_build_object('round_number',r.round_number,'expected_revision',coalesce((select max(revision)from production_control.net_skins_entry_revisions_v1 where tournament_id='2026'and round_number=r.round_number),0),'field_fingerprint',production_control.tournament_setup_hash_v1(production_control.net_skins_entry_field_v1('2026',r.round_number)),'entries',(select coalesce(jsonb_agg(jsonb_build_object('key',e->>'key','bindingFingerprint',e->>'bindingFingerprint','entered',false)),'[]')from jsonb_array_elements(production_control.net_skins_entry_field_v1('2026',r.round_number)) e))from scoring_authority.rounds r where r.tournament_id='2026'and not exists(select 1 from scoring_authority.matches m where m.tournament_id='2026'and m.round_number=r.round_number)order by r.round_number limit 1`;
  }else{
   prepare=seedConfiguration;
   if(name.startsWith('clear_'))prepare+=`select public.replace_production_calcutta_v1_auction_facts(${financialInput(seedId)})from scoring_authority.calcutta_v1_current c where tournament_id='2026';`;
   inputSql=`select ${financialInput(requestId)}from scoring_authority.calcutta_v1_current c where tournament_id='2026'`;
  }
  const run=old=>{
   const output=query(`begin;${old?original:''}${prepare}
    create temporary table p0f_equivalence_request(input) as ${inputSql};
    do $$begin if(select count(*)from p0f_equivalence_request)<>1 then raise exception 'P0F_PROTECTED_FINANCIAL_PRECONDITION_MISSING';end if;end$$;
    create temporary table p0f_equivalence_receipt as select public.${name}(q.input)as receipt from p0f_equivalence_request q;
    select jsonb_build_object('receipt',(select receipt from p0f_equivalence_receipt),'replay',(select public.${name}(q.input)from p0f_equivalence_request q),'entries',(select jsonb_agg(e-'savedAt'order by(e->>'roundNumber')::int)from jsonb_array_elements(production_control.net_skins_entries_projection_v1('2026')->'rounds')e),'auction',(select auction_manifest from scoring_authority.calcutta_v1_auction_fact_revisions where auction_revision_id=(select auction_revision_id from scoring_authority.calcutta_v1_current where tournament_id='2026')),'current',(select to_jsonb(c)-'auction_revision_id'-'configuration_revision_id'-'publication_revision_id'-'updated_at'from scoring_authority.calcutta_v1_current c where tournament_id='2026'),'isolated_audit',(select count(*)from production_control.operation_audit_events where event_type like 'ISOLATED_DIRECTOR%'))::text;
    rollback;`);
   const lines=output.split('\n').filter(x=>x.startsWith('{'));return JSON.parse(lines.at(-1));
  };
  const before=run(true),after=run(false);assert.equal(before.receipt?.ok,true,`${name} original guard must admit`);assert.equal(after.receipt?.ok,true,`${name} candidate guard must admit`);assert.equal(before.replay?.idempotent,true);assert.deepEqual(after,before,`${name} exact receipt and canonical effects unchanged`);assert.equal(after.isolated_audit,0,'Production operation must not install isolated provenance');
  results.push({function:name,result:'PASS',originalBodyRestoredInsideRolledBackTransaction:true,originalDefinitionSha256:createHash('sha256').update(original).digest('hex'),realRuntimeGuards:true,exactReceiptAndCanonicalEffects:true,replay:true});
 }
 return{environment:'OWNED_SOCKET_ONLY_PROTECTED_PLATFORM_FIXTURE',productionQueried:false,runtimeGuardsSubstituted:false,cases:results};
}
