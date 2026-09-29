// TEMPORARY TEST PROPOSAL / POSTGRESQL QUERY PLAN. No external database input.
// The root must grant the exclusive owned-PG window before execution.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {createPhase2CFixture} from '/Users/claybeltran/.codex/worktrees/reliability-phase2-score-path/BaggerInv/test/support/reliability/phase2c-fixture.mjs';
import {createDatabase,sql,destroyIsolatedCluster} from '/Users/claybeltran/.codex/worktrees/reliability-phase2-score-path/BaggerInv/test/support/reliability/postgres17.mjs';
import {seedSyntheticSideGameHistory} from '/Users/claybeltran/.codex/worktrees/reliability-phase2-score-path/BaggerInv/test/support/reliability/synthetic-history.mjs';
import {prepareLocalScoreDerivedWorkerFixture} from '/Users/claybeltran/.codex/worktrees/reliability-phase2-score-path/BaggerInv/test/support/reliability/phase2c-worker.mjs';
import {runtimeScope} from '/Users/claybeltran/.codex/worktrees/reliability-phase2-score-path/BaggerInv/test/support/reliability/synthetic-tournament.mjs';
const q=v=>`'${String(v).replaceAll("'","''")}'`;
const hash=v=>createHash('sha256').update(v).digest('hex');
const flatten=p=>[p,...(p.Plans||[]).flatMap(flatten)];
const output='/private/tmp/phase2c-optional-index-review-results.json';
const result={schemaVersion:1,environment:'OWNED_LOCAL_SOCKET_POSTGRESQL17',production:false,startedAt:new Date().toISOString(),scales:[],limitations:[
 'Actual installed claim-selector SQL is extracted and bound to current fixture values; this is query-plan execution, not full claim RPC certification.',
 'Synthetic delayed/terminal/current backlog states use explicit fixture DML with trigger/FK omission inside rollback; CHECK and unique constraints remain active.',
 'Default planner; one execution per variant; not latency percentiles, capacity or isolated write-amplification measurement.',
 'Current financial cardinalities preserve one-active-Calcutta and one-active-Net-per-round constraints; no invented thousands of active current jobs.',
 'Current intent backlog models432 first-entry canonical hole transactions with two universally automatic families =864 intents, not speculative extra golfers/rounds.',
 'Index removal is transaction-local and its definition is verified restored. No shipping source or persistent competitive state changes.']};
let f;
try {
 f=await createPhase2CFixture();const c=f.cluster;result.installed=f.phase2c;
 const query=(db,s)=>sql(c,db,s,{role:''});
 const captureFunction=`create function pg_temp.capture_optional_plan_v1(statement text) returns jsonb language plpgsql as $capture$ declare p json;answer jsonb;begin
 execute 'explain(analyze,buffers,settings,format json) '||statement into p;
 execute 'select coalesce(jsonb_agg(to_jsonb(v)),''[]''::jsonb) from ('||statement||')v' into answer;
 return jsonb_build_object('plan',p->0,'rows',jsonb_array_length(answer),'ids',(select coalesce(jsonb_agg(coalesce(x->>'job_id',x->>'engine_key',x->>'intent_id',x->>'one')),'[]'::jsonb)from jsonb_array_elements(answer)x));end;$capture$;`;
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
  const row={scale,identity,currentActiveLimits:{calcutta:1,netSkinsRounds:netIds.length,competitionMarkers:5},sourceHashes:{calcutta:hash(calSource),netSkins:hash(netSource)},cases:[]};result.scales.push(row);
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
  const competitionDue=`select engine_key from scoring_authority.competition_recalculation_jobs where tournament_id='2026'and round_number=0 and runtime_generation_id is not distinct from null::uuid and engine_key in('TEAM_MOMENTUM','TOURNAMENT_STORYLINES')and status in('PENDING','FAILED')and delivery_dead_letter_at is null and delivery_available_at<=clock_timestamp()`;
  const competitionTerminal="select 1 as one from scoring_authority.competition_recalculation_jobs where tournament_id='2026'and round_number=0 and delivery_dead_letter_at is not null limit 5";
  const intentSetup=dead=>`delete from scoring_authority.score_derived_intents_v1 where tournament_id='2026';
   insert into scoring_authority.score_derived_intents_v1(intent_id,tournament_id,match_id,round_number,source_transaction,family,reason,canonical_revision,status,attempts,last_sqlstate)
   select md5('optional-index:'||source_tx||':'||family)::uuid,'2026',match_id,round_number,source_tx,family,'ISOLATED_CANONICAL_HOLE_BACKLOG',jsonb_build_object('holeNumber',hole),
    case when ordinal>${864-dead} then 'DEAD_LETTER' else 'PENDING'end,case when ordinal>${864-dead} then5else0end,case when ordinal>${864-dead} then'57014'else null end
   from(select r.*,family,row_number()over(order by source_tx,family)ordinal from(select m.match_id,m.round_number,hole,900000000+row_number()over(order by m.match_id,hole)source_tx from scoring_authority.matches m cross join generate_series(1,18)hole where m.tournament_id='2026')r cross join unnest(array['CALCUTTA','COMPETITION'])family)v;
   do $count$begin if(select count(*)from scoring_authority.score_derived_intents_v1 where tournament_id='2026')<>864 then raise exception 'EXPECTED_24_MATCH_432_HOLE_AUTOMATIC_BACKLOG';end if;end;$count$;`;
  const specs=[];
  for(const family of ['CALCUTTA','NET_SKINS'])for(const delayed of [false,true])specs.push({name:`${family}_${delayed?'DELAYED':'DUE'}`,index:`scoring_authority.${family==='CALCUTTA'?'calcutta':'net_skins'}_v1_recalculation_jobs_delivery_due`,table:`scoring_authority.${family==='CALCUTTA'?'calcutta':'net_skins'}_v1_recalculation_jobs`,setup:financeSetup(family,delayed),query:family==='CALCUTTA'?calQuery:netQuery,expected:delayed?0:1});
  for(const mode of ['DUE','DELAYED'])specs.push({name:`COMPETITION_${mode}`,index:'scoring_authority.competition_recalculation_jobs_delivery_due',table:'scoring_authority.competition_recalculation_jobs',setup:competitionSetup(mode),query:competitionDue,expected:mode==='DUE'?2:0});
  for(const mode of ['DUE','TERMINAL'])specs.push({name:`COMPETITION_TERMINAL_COUNT_${mode}`,index:'scoring_authority.competition_recalculation_jobs_delivery_terminal',table:'scoring_authority.competition_recalculation_jobs',setup:competitionSetup(mode),query:competitionTerminal,expected:mode==='TERMINAL'?5:0});
  for(const dead of [0,1,101])specs.push({name:`INTENT_BACKLOG_864_DEAD_${dead}`,index:'scoring_authority.score_derived_intents_terminal_v1',table:'scoring_authority.score_derived_intents_v1',setup:intentSetup(dead).replaceAll('then5else0end','then 5 else 0 end'),query:"select 1 as one from scoring_authority.score_derived_intents_v1 where tournament_id='2026'and status='DEAD_LETTER' limit 101",expected:dead});
  for(const spec of specs){
   const definition=query(db,`select pg_get_indexdef(${q(spec.index)}::regclass)`);const observed={name:spec.name,index:spec.index,query:spec.query,expected:spec.expected,indexDefinition:definition};
   for(const absent of [false,true]){
    const r=JSON.parse(query(db,`begin;set local statement_timeout='5s';set local lock_timeout='1s';set local session_replication_role=replica;${spec.setup}set local session_replication_role=origin;analyze ${spec.table};${absent?'drop index '+spec.index+';':''}${captureFunction}select pg_temp.capture_optional_plan_v1(${q(spec.query)});rollback;`));assert.equal(r.rows,spec.expected,spec.name);
    const ns=flatten(r.plan.Plan);r.summary={indexes:ns.map(x=>x['Index Name']).filter(Boolean),nodes:ns.map(x=>x['Node Type']),rowsRemoved:ns.reduce((a,x)=>a+(x['Rows Removed by Filter']||0)*(x['Actual Loops']||1),0),rootHits:r.plan.Plan['Shared Hit Blocks'],rootReads:r.plan.Plan['Shared Read Blocks'],executionMs:r.plan['Execution Time']};observed[absent?'withoutIndex':'withIndex']=r;
    assert.equal(query(db,`select pg_get_indexdef(${q(spec.index)}::regclass)`),definition);
   }
   assert.deepEqual([...observed.withIndex.ids].sort(),[...observed.withoutIndex.ids].sort());observed.result='PASS';observed.rollbackVerified=true;row.cases.push(observed);console.log(scale,spec.name,JSON.stringify({with:observed.withIndex.summary,without:observed.withoutIndex.summary}));
  }
 }
 result.result='PASS';
}finally{if(f){await destroyIsolatedCluster(f.cluster);result.clusterDestroyed=true;}result.completedAt=new Date().toISOString();await writeFile(output,JSON.stringify(result,null,2)+'\n');}
