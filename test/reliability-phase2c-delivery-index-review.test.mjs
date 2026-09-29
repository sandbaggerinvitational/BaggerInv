// POSTGRESQL / PERFORMANCE: actual query shapes and default-planner counterfactuals.
// Uses only owned socket-only fixtures; no external database parameters are accepted.
import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createPhase2CFixture} from './support/reliability/phase2c-fixture.mjs';
import {createDatabase,sql,destroyIsolatedCluster} from './support/reliability/postgres17.mjs';
import {seedSyntheticSideGameHistory} from './support/reliability/synthetic-history.mjs';
import {prepareLocalScoreDerivedWorkerFixture} from './support/reliability/phase2c-worker.mjs';
import {runtimeScope} from './support/reliability/synthetic-tournament.mjs';
const q=v=>`'${String(v).replaceAll("'","''")}'`;
const hash=v=>createHash('sha256').update(v).digest('hex');
const flatten=p=>[p,...(p.Plans||[]).flatMap(flatten)];
const output=fileURLToPath(new URL('../docs/reliability/phase2c/evidence/delivery-index-review-detail.json',import.meta.url));
const indexManifest=JSON.parse(await readFile(new URL('./support/reliability/phase2c-delivery-indexes.json',import.meta.url),'utf8'));
test('NA-P2C-B current delivery indexes have measured query purposes', {timeout:300000}, async t=>{
const result={schemaVersion:1,environment:'OWNED_LOCAL_SOCKET_POSTGRESQL17',production:false,result:'FAIL',startedAt:new Date().toISOString(),indexManifest,scales:[],limitations:[
 'Competition readiness uses the actual EXISTS semantics; actual installed claim-selector SQL is extracted and bound to current fixture values; this is query-plan execution, not full claim RPC certification.',
 'Synthetic delayed/terminal/current backlog states use explicit fixture DML with trigger/FK omission inside rollback; CHECK and unique constraints remain active.',
 'Default planner; one execution per variant; not latency percentiles, capacity or isolated write-amplification measurement.',
 'Current financial cardinalities preserve one-active-Calcutta and one-active-Net-per-round constraints; no invented thousands of active current jobs.',
 'Current intent backlog models432 first-entry canonical hole transactions with two universally automatic families =864 intents, not speculative extra golfers/rounds.',
 'Index removal is transaction-local and its definition is verified restored. No shipping source or persistent competitive state changes.']};
let f;
try {
 f=await createPhase2CFixture();const c=f.cluster;result.installed=f.phase2c;
 for(const name of indexManifest.retainedNonuniqueIndexes)assert.equal(sql(c,f.database,`select to_regclass(${q(name)}) is not null`,{role:''}),'t',name);
 for(const name of indexManifest.removedOptionalIndexes)assert.equal(sql(c,f.database,`select to_regclass(${q(name)}) is null`,{role:''}),'t',name);
 const query=(db,s)=>sql(c,db,s,{role:''});
 const captureFunction=`create function pg_temp.capture_optional_plan_v1(statement text) returns jsonb language plpgsql as $capture$ declare p json;answer jsonb;begin
 execute 'explain(analyze,buffers,settings,format json) '||statement into p;
 execute 'select coalesce(jsonb_agg(to_jsonb(v)),''[]''::jsonb) from ('||statement||')v' into answer;
 return jsonb_build_object('plan',p->0,'rows',jsonb_array_length(answer),'ids',(select coalesce(jsonb_agg(coalesce(x->>'job_id',x->>'engine_key',x->>'intent_id',x->>'one',x->>'ready')),'[]'::jsonb)from jsonb_array_elements(answer)x));end;$capture$;`;
 for(const scale of [1,10]){
  const db=`p2c_optional_index_${scale}`;createDatabase(c,db,{template:f.database});
  query(db,`alter database ${db} set statement_timeout='180s';alter database ${db} set timezone='UTC'`);
  seedSyntheticSideGameHistory(c,db,scale);prepareLocalScoreDerivedWorkerFixture(c,db);query(db,'analyze');
  const identity=JSON.parse(query(db,"select jsonb_build_object('database',current_database(),'socketOnly',inet_server_addr()is null,'version',current_setting('server_version'),'seqscan',current_setting('enable_seqscan'))"));assert.equal(identity.socketOnly,true);assert.equal(identity.seqscan,'on');
  const currentCal=JSON.parse(query(db,"select to_jsonb(c)from scoring_authority.calcutta_v1_current c where tournament_id='2026'"));
  const currentNet=JSON.parse(query(db,"select to_jsonb(c)||jsonb_build_object('configuration_fingerprint',r.configuration_fingerprint)from scoring_authority.net_skins_v1_configuration_current c join scoring_authority.net_skins_v1_configuration_revisions r using(configuration_revision_id)where c.tournament_id='2026'"));
  const calSource=query(db,"select prosrc from pg_proc where oid='public.claim_production_calcutta_v1_recalculation(jsonb)'::regprocedure");
  const netSource=query(db,"select prosrc from pg_proc where oid='public.claim_production_net_skins_v1_recalculation(jsonb)'::regprocedure");
  const claimSelector=(source,table,current)=>{
   const re=new RegExp('select value\\.\\* into job_value\\s+from scoring_authority\\.'+table+' value[\\s\\S]*?limit 1;');const match=source.match(re);assert.ok(match,table);
   let query=match[0].replace(' into job_value','').replace(/;$/,'');
   query=query.replace(/current_value\.([a-z_]+)/g,(_,key)=>{assert.ok(Object.hasOwn(current,key),key);return typeof current[key]==='number'?String(current[key]):q(current[key]);});
   query=query.replace("(input->>'expected_activation_revision')::bigint",String(runtimeScope().expected_activation_revision));
   assert.ok(!query.includes('current_value')&&!query.includes('input->'));
   assert.match(query,/delivery_available_at/);return query;
  };
  const calQuery=claimSelector(calSource,'calcutta_v1_recalculation_jobs',currentCal),netQuery=claimSelector(netSource,'net_skins_v1_recalculation_jobs',currentNet);
  const calId=query(db,"select job_id from scoring_authority.calcutta_v1_recalculation_jobs where tournament_id='2026' order by requested_at desc,job_id limit1".replace('limit1','limit 1'));assert.match(calId,/^[0-9a-f-]{36}$/);
  const netIds=JSON.parse(query(db,"select jsonb_agg(job_id)from(select distinct on(round_number)job_id from scoring_authority.net_skins_v1_recalculation_jobs where tournament_id='2026'and round_number between1and3 order by round_number,requested_at desc,job_id)x".replace('between1and3','between 1 and 3')));assert.ok(netIds.length>0&&netIds.length<=3);
  const tickSource=query(db,"select prosrc from pg_proc where oid='public.score_derived_delivery_tick_v1(jsonb)'::regprocedure");
  const bindCurrent=statement=>statement.replaceAll('tournament_id=target',"tournament_id='2026'").replaceAll('is not distinct from generation','is not distinct from null::uuid');
  const competitionReadiness=tickSource.match(/'COMPETITION',exists\((select 1 from scoring_authority\.competition_recalculation_jobs[\s\S]*?)\),\s*'INTELLIGENCE'/);
  assert.ok(competitionReadiness,'Actual Competition readiness source is recognized');
  const competitionTerminalSource=tickSource.match(/\((select 1 from scoring_authority\.competition_recalculation_jobs where tournament_id=target and round_number=0 and delivery_dead_letter_at is not null limit 5)\)/);
  const intentTerminalSource=tickSource.match(/\((select 1 from scoring_authority\.score_derived_intents_v1 where tournament_id=target and status='DEAD_LETTER' limit 101)\)/);
  assert.ok(competitionTerminalSource&&intentTerminalSource,'Actual bounded terminal selectors are recognized');
  const row={scale,identity,currentActiveLimits:{calcutta:1,netSkinsRounds:netIds.length,competitionMarkers:5},sourceHashes:{calcutta:hash(calSource),netSkins:hash(netSource),deliveryTick:hash(tickSource)},cases:[]};result.scales.push(row);
  const retire=(table)=>`update scoring_authority.${table} set status='SUPERSEDED',completed_at=clock_timestamp(),claimed_by=null,claim_token=null,lease_expires_at=null where tournament_id='2026'and status in('PENDING','RUNNING');`;
  const financeSetup=(family,delayed)=>{
   const table=family==='CALCUTTA'?'calcutta_v1_recalculation_jobs':'net_skins_v1_recalculation_jobs';
   const assignments=family==='CALCUTTA'?`configuration_revision_id=${q(currentCal.configuration_revision_id)}::uuid,configuration_revision=${currentCal.configuration_revision},configuration_fingerprint=${q(currentCal.configuration_fingerprint)},auction_revision_id=${q(currentCal.auction_revision_id)}::uuid,auction_revision=${currentCal.auction_revision},auction_fingerprint=${q(currentCal.auction_fingerprint)},activation_revision=${runtimeScope().expected_activation_revision}`:`configuration_revision_id=${q(currentNet.configuration_revision_id)}::uuid,configuration_revision=${currentNet.configuration_revision},configuration_fingerprint=${q(currentNet.configuration_fingerprint)}`;
   return retire(table)+`update scoring_authority.${table} set ${assignments},status='PENDING',attempts=1,completed_at=null,claimed_by=null,claim_token=null,lease_expires_at=null,delivery_attempts=1,delivery_dead_letter_at=null,delivery_error_class=null,delivery_available_at=${q(delayed?'2100-01-01':'2000-01-01')}::timestamptz where job_id in(${(family==='CALCUTTA'?[calId]:netIds).map(v=>q(v)+'::uuid').join(',')});`;
  };
  const competitionSetup=mode=>`insert into scoring_authority.competition_recalculation_jobs(tournament_id,round_number,engine_key,status,requested_source_revision)
   select (2026-n)::text,0,e,'SUCCEEDED','{}'::jsonb from generate_series(1,${4*scale})n cross join unnest(array['TEAM_MOMENTUM','TOURNAMENT_STORYLINES','TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL','TOURNAMENT_FINAL_RECAP'])e on conflict do nothing;
   insert into scoring_authority.competition_recalculation_jobs(tournament_id,round_number,engine_key,status,requested_source_revision,delivery_available_at,delivery_dead_letter_at)
   select '2026',0,e,'${mode==='TERMINAL'?'FAILED':'PENDING'}','{}'::jsonb,${q(mode==='DELAYED'?'2100-01-01':'2000-01-01')}::timestamptz,${mode==='TERMINAL'?"timestamptz'2000-01-01'":'null'} from unnest(array['TEAM_MOMENTUM','TOURNAMENT_STORYLINES','TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL','TOURNAMENT_FINAL_RECAP'])e
   on conflict(tournament_id,round_number,engine_key)do update set status=excluded.status,delivery_available_at=excluded.delivery_available_at,delivery_dead_letter_at=excluded.delivery_dead_letter_at;`;
  const competitionDue=`select exists(${bindCurrent(competitionReadiness[1])}) as ready`;
  const competitionTerminal=bindCurrent(competitionTerminalSource[1]).replace('select 1 from','select 1 as one from');
  const intentTerminal=bindCurrent(intentTerminalSource[1]).replace('select 1 from','select 1 as one from');
  const intentSetup=dead=>`delete from scoring_authority.score_derived_intents_v1 where tournament_id='2026';
   insert into scoring_authority.score_derived_intents_v1(intent_id,tournament_id,match_id,round_number,source_transaction,family,reason,canonical_revision,status,attempts,last_sqlstate)
   select md5('optional-index:'||source_tx||':'||family)::uuid,'2026',match_id,round_number,source_tx,family,'ISOLATED_CANONICAL_HOLE_BACKLOG',jsonb_build_object('holeNumber',hole),
    case when ordinal>${864-dead} then 'DEAD_LETTER' else 'PENDING'end,case when ordinal>${864-dead} then5else0end,case when ordinal>${864-dead} then'57014'else null end
   from(select r.*,family,row_number()over(order by source_tx,family)ordinal from(select m.match_id,m.round_number,hole,900000000+row_number()over(order by m.match_id,hole)source_tx from scoring_authority.matches m cross join generate_series(1,18)hole where m.tournament_id='2026')r cross join unnest(array['CALCUTTA','COMPETITION'])family)v;
   do $count$begin if(select count(*)from scoring_authority.score_derived_intents_v1 where tournament_id='2026')<>864 then raise exception 'EXPECTED_24_MATCH_432_HOLE_AUTOMATIC_BACKLOG';end if;end;$count$;`;
  const specs=[];
  for(const family of ['CALCUTTA','NET_SKINS'])for(const delayed of [false,true])specs.push({name:`${family}_${delayed?'DELAYED':'DUE'}`,index:`scoring_authority.${family==='CALCUTTA'?'calcutta':'net_skins'}_v1_recalculation_jobs_delivery_due`,table:`scoring_authority.${family==='CALCUTTA'?'calcutta':'net_skins'}_v1_recalculation_jobs`,setup:financeSetup(family,delayed),query:family==='CALCUTTA'?calQuery:netQuery,expected:delayed?0:1});
  for(const mode of ['DUE','DELAYED'])specs.push({name:`COMPETITION_${mode}`,index:'scoring_authority.competition_recalculation_jobs_delivery_due',table:'scoring_authority.competition_recalculation_jobs',setup:competitionSetup(mode),query:competitionDue,expected:1,expectedIds:[mode==='DUE'?'true':'false']});
  for(const mode of ['DUE','TERMINAL'])specs.push({name:`COMPETITION_TERMINAL_COUNT_${mode}`,index:'scoring_authority.competition_recalculation_jobs_delivery_terminal',table:'scoring_authority.competition_recalculation_jobs',setup:competitionSetup(mode),query:competitionTerminal,expected:mode==='TERMINAL'?5:0});
  for(const dead of [0,1,101])specs.push({name:`INTENT_BACKLOG_864_DEAD_${dead}`,index:'scoring_authority.score_derived_intents_terminal_v1',table:'scoring_authority.score_derived_intents_v1',setup:intentSetup(dead).replaceAll('then5else0end','then 5 else 0 end'),query:intentTerminal,expected:dead});
  for(const spec of specs)await t.test(`${scale}x ${spec.name}`,async()=>{
   const installed=query(db,`select coalesce(to_regclass(${q(spec.index)})::text,'')`)!=='';
   const definition=installed?query(db,`select pg_get_indexdef(${q(spec.index)}::regclass)`):indexManifest.historicalReferenceDefinitions[spec.index];
   assert.ok(definition,'Known candidate or historical reference index only');
   const observed={name:spec.name,index:spec.index,candidateInstalled:installed,query:spec.query,expected:spec.expected,indexDefinition:definition};
   row.cases.push(observed);
   for(const absent of [false,true]){
    const indexSetup=absent?(installed?'drop index '+spec.index+';':''):(installed?'':definition+';');
    const r=JSON.parse(query(db,`begin;set local statement_timeout='5s';set local lock_timeout='1s';set local session_replication_role=replica;${spec.setup}set local session_replication_role=origin;analyze ${spec.table};${indexSetup}${captureFunction}select pg_temp.capture_optional_plan_v1(${q(spec.query)});rollback;`));
    assert.equal(r.rows,spec.expected,spec.name);
    if(spec.expectedIds)assert.deepEqual(r.ids,spec.expectedIds,spec.name);
    const ns=flatten(r.plan.Plan);
    r.summary={indexes:ns.map(x=>x['Index Name']).filter(Boolean),nodes:ns.map(x=>x['Node Type']),rowsRemoved:ns.reduce((a,x)=>a+(x['Rows Removed by Filter']||0)*(x['Actual Loops']||1),0),rootHits:r.plan.Plan['Shared Hit Blocks'],rootReads:r.plan.Plan['Shared Read Blocks'],executionMs:r.plan['Execution Time']};
    observed[absent?'withoutIndex':'withIndex']=r;
    assert.equal(query(db,`select coalesce(to_regclass(${q(spec.index)})::text,'')`)!=='',installed,'Rollback restores index presence');
    if(installed)assert.equal(query(db,`select pg_get_indexdef(${q(spec.index)}::regclass)`),definition);
   }
   assert.deepEqual([...observed.withIndex.ids].sort(),[...observed.withoutIndex.ids].sort());
   if(spec.name.startsWith('INTENT_BACKLOG_864_')){
    assert.ok(observed.withIndex.summary.indexes.includes('score_derived_intents_terminal_v1'));
    assert.equal(observed.withIndex.summary.rowsRemoved,0);
    assert.ok(observed.withoutIndex.summary.rowsRemoved>=763,'Dense current backlog exercises the actual terminal predicate');
    assert.ok(observed.withIndex.summary.rootHits<observed.withoutIndex.summary.rootHits);
   }
   observed.result='PASS';observed.rollbackVerified=true;
  });
 }
 result.result=result.scales.length===2&&result.scales.every(v=>v.cases.length===11&&v.cases.every(c=>c.result==='PASS'))?'PASS':'FAIL';
 assert.equal(result.result,'PASS');
}finally{if(f){await destroyIsolatedCluster(f.cluster);result.clusterDestroyed=true;}result.completedAt=new Date().toISOString();await writeFile(output,JSON.stringify(result,null,2)+'\n');}
});
