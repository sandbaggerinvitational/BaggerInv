// Actual owner completion/control schedules in an owned synthetic PostgreSQL fixture.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {readFile,writeFile} from 'node:fs/promises';
import {createPhase2CFixture} from './support/reliability/phase2c-fixture.mjs';
import {sql,sqlResult,openSqlSession,destroyIsolatedCluster,createDatabase,jsonLiteral} from './support/reliability/postgres17.mjs';
import {configureFiniteTimeout} from './support/reliability/phase2c-install.mjs';
import {seedSyntheticSideGameHistory} from './support/reliability/synthetic-history.mjs';
import {seedThreeRoundNetSkinsConfiguration,seedAnnualWorkerBoundary,annualWorkerInput,annualWorkerGeneration} from './support/reliability/phase2c-annual-workers.mjs';
import {prepareLocalScoreDerivedWorkerFixture} from './support/reliability/phase2c-worker.mjs';
import {inputFor,rpcSql} from './support/reliability/phase2-score-fixture.mjs';
import {runtimeScope,syntheticDirector,syntheticRuntime} from './support/reliability/synthetic-tournament.mjs';
import {calculateProductionFullNetSkins,FULL_NET_SKINS_ENGINE} from '../lib/production-full-net.js';
const before=JSON.parse(await readFile(new URL('../docs/reliability/phase2c/evidence/net-owner-control-before-definitions.json',import.meta.url),'utf8'));
const name='complete_production_net_skins_v1_recalculation';
const oldDefinition=before.find(v=>v.signature===name+'(jsonb)').definition;
const evidence={issue:'P2C-NEW-NETSKINS-OWNER-CONTROL-LOCK',production:false,tests:[]};
const json=(c,d,s)=>JSON.parse(sql(c,d,s));
const rpc=(c,d,n,input)=>json(c,d,rpcSql(n,runtimeScope(input)));
const result=p=>p.then(v=>({ok:true,value:JSON.parse(v)}),e=>({ok:false,error:e.message}));
async function graph(c,d,pids,predicate){for(let i=0;i<60;i++){const v=json(c,d,`select jsonb_agg(jsonb_build_object('pid',pid,'blockedBy',pg_blocking_pids(pid),'wait',wait_event,'query',left(query,160))) from pg_stat_activity where pid in(${pids.join(',')})`);if(predicate(v))return v;await new Promise(r=>setTimeout(r,10));}throw Error('Expected owner/control wait graph not observed');}
async function cleanup(sessions,pending){if(sessions[0])await Promise.resolve().then(()=>sessions[0].query('rollback')).catch(()=>{});await Promise.allSettled(pending);await Promise.allSettled(sessions.map(async s=>s.query('rollback')));await Promise.allSettled(sessions.map(async s=>s.close()));}
function clone(c,base,d){createDatabase(c,d,{template:base});configureFiniteTimeout(c,d,1000);}
function claim(c,d,letter='a'){
 const revision=Number(sql(c,d,"select configuration_revision from scoring_authority.net_skins_v1_configuration_current where tournament_id='2026'"));
 const claimed=rpc(c,d,'claim_production_net_skins_v1_recalculation',{worker_id:'owner-net-control',lease_seconds:60,expected_configuration_revision:revision,request_fingerprint:letter.repeat(64)});
 assert.ok(claimed.job?.claim_token);const job=claimed.job,calc=calculateProductionFullNetSkins(claimed.calculation_input),payload=calc.netSkins.rounds.find(v=>Number(v.round)===job.round_number);assert.ok(payload);
 return runtimeScope({worker_id:'owner-net-control',expected_configuration_revision:revision,job_id:job.job_id,claim_token:job.claim_token,expected_result_revision:job.expected_result_revision,source_fingerprint:job.source_fingerprint,engine_version:FULL_NET_SKINS_ENGINE,result_state:'PROVISIONAL',result_payload:payload,request_fingerprint:(letter==='a'?'b':'d').repeat(64)});
}
const clearMarker=(c,d)=>sql(c,d,"delete from scoring_authority.competition_recalculation_jobs where tournament_id='2026' and round_number=0 and engine_key='TOURNAMENT_STORYLINES'",{role:''});
function semantic(c,d){return json(c,d,`select jsonb_build_object('results',(select jsonb_agg(jsonb_build_object('round',round_number,'configuration',configuration_revision,'revision',result_revision,'engine',engine_version,'configurationFingerprint',configuration_fingerprint,'source',source_fingerprint,'state',result_state,'enginePayload',engine_result_payload,'publicPayload',public_result_payload,'hash',payload_hash,'current',is_current) order by round_number,result_revision) from scoring_authority.net_skins_v1_result_revisions where tournament_id='2026'),'storylines',(select to_jsonb(j)-array['requested_at','started_at','completed_at','updated_at','delivery_available_at'] from scoring_authority.competition_recalculation_jobs j where tournament_id='2026' and round_number=0 and engine_key='TOURNAMENT_STORYLINES'),'canonical',(select jsonb_build_object('status',status,'winner',result_winner,'revision',match_revision,'complete',scorecard_complete) from scoring_authority.matches where match_id='2026-R1-1'),'holes',(select count(*) from scoring_authority.hole_scores where match_id='2026-R1-1'))`);}
// Whole-history forensic oracle; independent of the1s control/5s completion measurements.
const fingerprint=(c,d)=>sql(c,d,`set statement_timeout='5s';select md5(jsonb_build_object('jobs',(select jsonb_agg(to_jsonb(v) order by job_id) from scoring_authority.net_skins_v1_recalculation_jobs v),'results',(select jsonb_agg(to_jsonb(v) order by result_id) from scoring_authority.net_skins_v1_result_revisions v),'story',(select to_jsonb(v) from scoring_authority.competition_recalculation_jobs v where tournament_id='2026' and round_number=0 and engine_key='TOURNAMENT_STORYLINES'),'audit',(select count(*) from scoring_authority.audit_events),'attempts',(select count(*) from production_control.score_derived_delivery_attempts_v1),'receipts',(select count(*) from production_control.cutover_operation_receipts))::text)`);
function seedFutureNetConfiguration(cluster, database) {
  sql(cluster, database, `begin; set local session_replication_role=replica;
    insert into production_control.net_skins_entry_revisions_v1(tournament_id,round_number,revision,
      request_id,request_hash,field_fingerprint,configured,entries,actor_player_id,actor_auth_user_id,created_at,response)
    select '2099',rn,1,md5('processor-entry:'||rn)::uuid,repeat('d',64),
      production_control.tournament_setup_hash_v1(production_control.net_skins_entry_field_v1('2099',rn)),true,
      (select jsonb_agg(item||'{"entered":true}'::jsonb) from jsonb_array_elements(production_control.net_skins_entry_field_v1('2099',rn)) item),
      '${syntheticDirector.playerId}','${syntheticDirector.authUserId}','2099-08-01T00:00:00Z','{}'
    from generate_series(1,3) rn;
    update scoring_authority.net_skins_v1_configuration_revisions set
      configuration_manifest=production_control.full_net_skins_manifest_v2('2099',array[1,2,3],'{"1":1,"2":1,"3":1}')
    where configuration_revision_id=(select configuration_revision_id from scoring_authority.net_skins_v1_configuration_current where tournament_id='2099');
    update scoring_authority.net_skins_v1_configuration_revisions set
      configuration_fingerprint=production_control.net_skins_v1_hash(configuration_manifest)
    where configuration_revision_id=(select configuration_revision_id from scoring_authority.net_skins_v1_configuration_current where tournament_id='2099');
    delete from scoring_authority.net_skins_configuration_entries
    where tournament_id='2099';
    delete from scoring_authority.net_skins_configurations
    where tournament_id='2099';
    with manifest as (
      select configuration_revision,configuration_manifest
      from scoring_authority.net_skins_v1_configuration_revisions
      where configuration_revision_id=(select configuration_revision_id
        from scoring_authority.net_skins_v1_configuration_current
        where tournament_id='2099')
    ), rounds as (
      select manifest.configuration_revision,item.round_value
      from manifest cross join lateral
        jsonb_array_elements(manifest.configuration_manifest->'rounds')
          as item(round_value)
    )
    insert into scoring_authority.net_skins_configurations(
      tournament_id,round_number,format,enabled,entry_type,buy_in_per_entry,
      expected_pot,completion_rule,payout_rounding,tie_rule,
      configuration_revision,configuration_fingerprint,source_workbook_id,
      imported_by,imported_at,approved_at,updated_at)
    select '2099',(round_value->>'round_number')::integer,
      round_value->>'format',true,round_value->>'entry_type',
      (round_value->>'buy_in_per_entry')::numeric,
      (round_value->>'expected_pot')::numeric,round_value->>'completion_rule',
      round_value->>'payout_rounding',round_value->>'tie_rule',
      configuration_revision,round_value->>'configuration_fingerprint',
      '${syntheticRuntime.sourceWorkbookId}','reliability-fixture',
      clock_timestamp(),clock_timestamp(),clock_timestamp()
    from rounds;
    with manifest as (
      select configuration_manifest
      from scoring_authority.net_skins_v1_configuration_revisions
      where configuration_revision_id=(select configuration_revision_id
        from scoring_authority.net_skins_v1_configuration_current
        where tournament_id='2099')
    ), entries as (
      select round_item.round_value,entry_item.entry_value
      from manifest
      cross join lateral jsonb_array_elements(configuration_manifest->'rounds')
        as round_item(round_value)
      cross join lateral jsonb_array_elements(round_item.round_value->'entries')
        as entry_item(entry_value)
    )
    insert into scoring_authority.net_skins_configuration_entries(
      tournament_id,round_number,entry_id,match_number,format,
      player_id_1,player_id_2,team_handicap,buy_in,eligible,source_payload)
    select '2099',(round_value->>'round_number')::integer,
      entry_value->>'entry_id',entry_value->>'match_number',
      round_value->>'format',entry_value->>'player_id_1',
      nullif(entry_value->>'player_id_2',''),
      nullif(entry_value->>'team_handicap','')::numeric,
      (entry_value->>'buy_in')::numeric,
      coalesce((entry_value->>'eligible')::boolean,false),
      jsonb_build_object(
        'Entry Revision',entry_value->'entry_revision',
        'Entry Key',entry_value->>'entry_key',
        'Entry Binding Fingerprint',entry_value->>'binding_fingerprint',
        'Canonical Match ID',entry_value->>'match_id',
        'Net Handicap Basis','production-full-course-handicap-v1',
        'Individual Stroke Allocation',
          entry_value->>'individual_stroke_allocation')
    from entries;

    delete from scoring_authority.finalized_scorecard_snapshots where match_id='2099-R1-1';
    update scoring_authority.matches set status='LIVE',scoring_locked=false,
      scorecard_complete=false,finalized_at=null where match_id='2099-R1-1';
    update scoring_authority.scoring_permissions set can_score=true,revoked_at=null
      where match_id='2099-R1-1';
    commit;`, { role: "" });
}



// Future completion proof boundary: transplanted synthetic canonical fixture,
// synthetic annual authority/resource rows and one outer certification seam.
// Real annual Net guard, source projection, enqueue, claim, calculator, complete,
// private lock helper, result trigger, SQL constraints and rollback all execute.
function prepareFutureNet(c,d){
 seedAnnualWorkerBoundary(c,d);
 sql(c,d,`begin;set local session_replication_role=replica;
  do $retarget$ declare relation_name text; begin
   foreach relation_name in array array['rounds','teams','tournament_players','matches','scoring_snapshots',
    'handicap_revisions','handicap_revision_entries','tournament_setup_match_details_v1','game_center_presentations',
    'net_skins_v1_configuration_revisions','net_skins_v1_configuration_current'] loop
    execute format('update scoring_authority.%I set tournament_id=''2099'' where tournament_id=''2026''',relation_name);
   end loop;
   foreach relation_name in array array['matches','scoring_snapshots','match_participants','match_holes','hole_scores',
    'tournament_setup_match_details_v1','game_center_presentations'] loop
    execute format('update scoring_authority.%I set match_id=regexp_replace(match_id,''^2026-'',''2099-'') where match_id like ''2026-%%''',relation_name);
   end loop;
  end $retarget$;
  insert into production_control.future_tournament_resources_v1(tournament_id,project_ref,project_url,source_workbook_id,
   resource_status,resource_revision,google_compatibility_policy)
  values('2099','synthetic-owned-local','https://synthetic.invalid','synthetic-annual-worker-2099','CURRENT_RESOURCE_BOUND',1,'CURRENT_CERTIFIED');
  commit;
  create or replace function production_control.assert_annual_scoring_runtime_v1(input jsonb,expected_operation text,required_worker text default null)
  returns text language plpgsql security definer set search_path=pg_catalog as $boundary$ begin
   if input->>'expected_current_tournament_id' is distinct from '2099'
    or input->>'expected_runtime_generation_id' is distinct from '${annualWorkerGeneration}'
    or expected_operation not in('claim_production_net_skins_v1_recalculation','complete_production_net_skins_v1_recalculation')
   then raise exception using errcode='42501',message='ISOLATED_FUTURE_NET_CERTIFICATION_BOUNDARY';end if;
   return '2099';end $boundary$;`,{role:''});
 seedFutureNetConfiguration(c,d);
 const enqueued=json(c,d,`set statement_timeout='5s';select to_jsonb(production_control.enqueue_annual_net_skins_v1_round('2099','${annualWorkerGeneration}',1,'SYNTHETIC_OWNER_PROCESS','synthetic-annual-worker'))`);
 assert.equal(enqueued.tournament_id,'2099');assert.equal(enqueued.runtime_generation_id,annualWorkerGeneration);assert.equal(enqueued.status,'PENDING');
 const revision=Number(sql(c,d,"select configuration_revision from scoring_authority.net_skins_v1_configuration_current where tournament_id='2099'"));
 const claimed=futureRpc(c,d,'future_production_claim_net_skins_recalculation_v1',{...annualWorkerInput,
  annual_destination_workbook_id:'synthetic-annual-worker-2099',expected_configuration_revision:revision,lease_seconds:60,request_fingerprint:'9'.repeat(64)});
 assert.equal(claimed.ok,true);assert.equal(claimed.job.tournament_id,'2099');assert.equal(claimed.job.runtime_generation_id,annualWorkerGeneration);
 assert.equal(claimed.calculation_input.tournament.tournament_id,'2099');assert.equal(claimed.calculation_input.source_revision.tournamentId,'2099');
 const calculated=calculateProductionFullNetSkins(claimed.calculation_input),payload=calculated.netSkins.rounds.find(v=>v.round===1);assert.ok(payload);
 assert.ok(payload.fullNetDetail.length>0);assert.ok(payload.fullNetDetail.some(v=>v.authorityAvailable&&v.holes.some(h=>h.gross!==null)));
 return runtimeScope({...annualWorkerInput,annual_destination_workbook_id:'synthetic-annual-worker-2099',expected_configuration_revision:revision,
  job_id:claimed.job.job_id,claim_token:claimed.job.claim_token,expected_result_revision:claimed.job.expected_result_revision,
  source_fingerprint:claimed.job.source_fingerprint,engine_version:FULL_NET_SKINS_ENGINE,result_state:'PROVISIONAL',result_payload:payload,request_fingerprint:'8'.repeat(64)});
}
const futureName='future_production_complete_net_skins_recalculation_v1';
const futureRpc=(c,d,n,input)=>json(c,d,"set statement_timeout='5s';"+rpcSql(n,runtimeScope(input)));
const oldFutureDefinition=before.find(v=>v.signature===futureName+'(jsonb)').definition;
function futureSemantic(c,d){return json(c,d,`select jsonb_build_object('results',
 (select jsonb_agg(jsonb_build_object('round',round_number,'revision',result_revision,'configuration',configuration_revision,
  'source',source_fingerprint,'engine',engine_version,'state',result_state,'payload',engine_result_payload,
  'publicPayload',public_result_payload,'hash',payload_hash,'current',is_current,'generation',(select j.runtime_generation_id from scoring_authority.net_skins_v1_recalculation_jobs j where j.job_id=r.job_id))order by result_revision)
  from scoring_authority.net_skins_v1_result_revisions r where tournament_id='2099'),
 'storylines',(select to_jsonb(j)-array['requested_at','started_at','completed_at','updated_at','delivery_available_at']
  from scoring_authority.competition_recalculation_jobs j where tournament_id='2099' and round_number=0 and engine_key='TOURNAMENT_STORYLINES'),
 'job',(select jsonb_build_object('status',status,'source',source_fingerprint,'cycle',delivery_cycle,'attempt',delivery_attempts,
  'generation',runtime_generation_id) from scoring_authority.net_skins_v1_recalculation_jobs where tournament_id='2099'))`);}
function futureFootprint(c,d){return sql(c,d,`set statement_timeout='5s';select md5(jsonb_build_object(
 'job',(select to_jsonb(j) from scoring_authority.net_skins_v1_recalculation_jobs j where tournament_id='2099'),
 'result',(select jsonb_agg(to_jsonb(r) order by result_id) from scoring_authority.net_skins_v1_result_revisions r where tournament_id='2099'),
 'story',(select to_jsonb(j) from scoring_authority.competition_recalculation_jobs j where tournament_id='2099' and round_number=0 and engine_key='TOURNAMENT_STORYLINES'),
 'receipts',(select count(*) from production_control.cutover_operation_receipts),
 'audit',(select count(*) from scoring_authority.audit_events),'attempts',(select count(*) from production_control.score_derived_delivery_attempts_v1))::text)`);}

test('Net Skins owner completion locks exact Storylines before supported controls',{timeout:180000},async t=>{
 let f;
 try{
  f=await createPhase2CFixture();const c=f.cluster;evidence.installed=f.phase2c;
  sql(c,f.database,`alter database ${f.database} set statement_timeout='30000ms'`,{role:''});
  seedSyntheticSideGameHistory(c,f.database,1);seedThreeRoundNetSkinsConfiguration(c,f.database);prepareLocalScoreDerivedWorkerFixture(c,f.database);
  for(let h=1;h<=18;h++)assert.equal(rpc(c,f.database,'submit_production_hole_score',inputFor(c,f.database,'2026-R1-1',h,{key:'net-control:'+h})).code,'ACCEPTED');
  sql(c,f.database,"set statement_timeout='5s';select production_control.flush_score_derived_intents_v1('2026','NET_SKINS',8);select production_control.flush_score_derived_intents_v1('2026','NET_SKINS',8);select production_control.flush_score_derived_intents_v1('2026','NET_SKINS',8)");
  for(const marker of ['present','absent'])for(const controlKind of ['FINALIZE','SCORING_LOCK'])for(const order of ['before','after'])await t.test(`${marker} ${controlKind} ${order}`,async()=>{
   const d=`net_${marker}_${controlKind.toLowerCase()}_${order}`;clone(c,f.database,d);const complete=claim(c,d);assert.equal(complete.result_payload.round,1);if(marker==='absent')clearMarker(c,d);
   const controlInput=inputFor(c,d,'2026-R1-1',18,{director:controlKind!=='FINALIZE',operation:controlKind,key:'net-owner-control-'+controlKind});const controlName=controlKind==='FINALIZE'?'finalize_production_match':'mutate_production_match_control';
   // Compare new concurrent completion against unchanged serial completion and control.
   const serial=d+'_serial';clone(c,d,serial);sql(c,serial,oldDefinition,{role:''});assert.equal(rpc(c,serial,name,complete).ok,true);assert.equal(rpc(c,serial,controlName,controlInput).ok,true);const expected=semantic(c,serial);
   let definition=order==='before'?oldDefinition:sql(c,d,`select pg_get_functiondef('public.${name}(jsonb)'::regprocedure)`,{role:''});
   if(order==='after')assert.match(definition,/lock_net_skins_storylines_v1\('2026',input\)/);
   const anchor='  update scoring_authority.net_skins_v1_result_revisions\n  set is_current = false';assert.equal(definition.split(anchor).length,2);definition=definition.replace(anchor,'  perform pg_catalog.pg_advisory_xact_lock(284124201);\n'+anchor);sql(c,d,definition,{role:''});
   const sessions=[],pending=[];let stage='start';
   try{
    const barrier=openSqlSession(c,d),owner=openSqlSession(c,d),control=openSqlSession(c,d);sessions.push(barrier,owner,control);const pids=[];for(const s of sessions)pids.push(Number(await s.query('select pg_backend_pid()')));
    await barrier.query('begin;select pg_advisory_xact_lock(284124201)');await owner.query("set statement_timeout='5s';set deadlock_timeout='5s'");await control.query("set statement_timeout='1s';set deadlock_timeout='5s'");
    const completion=result(owner.query(rpcSql(name,complete)));pending.push(completion);stage='owner-holds-job';const held=await graph(c,d,pids,g=>g.some(v=>v.pid===pids[1]&&v.blockedBy.includes(pids[0])));
    const controlled=result(control.query(rpcSql(controlName,controlInput)));pending.push(controlled);stage='control-waits';const oneWay=await graph(c,d,pids,g=>g.some(v=>v.pid===pids[2]&&v.blockedBy.includes(pids[1])));await barrier.query('commit');
    let reciprocal=null;
    if(order==='before'){
     stage='reciprocal';reciprocal=await graph(c,d,pids,g=>g.some(v=>v.pid===pids[1]&&v.blockedBy.includes(pids[2]))&&g.some(v=>v.pid===pids[2]&&v.blockedBy.includes(pids[1])));
     const ctl=await controlled;assert.equal(ctl.ok,false);assert.match(ctl.error,/statement timeout/);const done=await completion;assert.equal(done.ok,true,JSON.stringify(done));assert.equal(done.value.ok,true);assert.equal(sql(c,d,"select status from scoring_authority.matches where match_id='2026-R1-1'"),'LIVE');assert.equal(rpc(c,d,controlName,controlInput).ok,true);
    }else{const [done,ctl]=await Promise.all([completion,controlled]);assert.equal(done.ok,true,JSON.stringify(done));assert.equal(done.value.ok,true);assert.equal(ctl.ok,true,JSON.stringify(ctl));assert.equal(ctl.value.ok,true);}
    assert.deepEqual(semantic(c,d),expected);evidence.tests.push({marker,controlKind,order,pass:true,expectedCounterexample:order==='before',held,oneWay,reciprocal,semanticParityWithUnchangedSerial:true,controlBudgetMs:1000,ownerBudgetMs:5000});
   }catch(error){evidence.tests.push({marker,controlKind,order,stage,pass:false,error:error.message});throw error;}finally{await cleanup(sessions,pending);}
  });
  for(const failure of ['lease','source'])await t.test(`absent marker rolls back on rejected ${failure}`,()=>{
   const d='net_reject_'+failure;clone(c,f.database,d);const input=claim(c,d);clearMarker(c,d);if(failure==='lease')input.claim_token='00000000-0000-4000-8000-000000000001';else input.source_fingerprint='f'.repeat(64);const prior=fingerprint(c,d);
   const rejected=sqlResult(c,d,'\\set VERBOSITY verbose\n'+rpcSql(name,input));assert.notEqual(rejected.status,0);assert.match(rejected.stderr,failure==='lease'?/42501.*JOB_LEASE_REQUIRED/:/40001.*SOURCE_REVISION_CONFLICT/);assert.equal(fingerprint(c,d),prior);evidence.tests.push({case:'absent-marker-rejected-'+failure,pass:true,allRowsReceiptsAuditUnchanged:true});
  });
  await t.test('two simultaneous rounds create only unchanged canonical Storylines demand',async()=>{
   const d='net_two_completions';clone(c,f.database,d);assert.equal(rpc(c,d,'submit_production_hole_score',inputFor(c,d,'2026-R2-1',1,{key:'net-round-two'})).code,'ACCEPTED');const one=claim(c,d),two=claim(c,d,'c');assert.notEqual(one.result_payload.round,two.result_payload.round);clearMarker(c,d);
   const serial=d+'_serial';clone(c,d,serial);sql(c,serial,oldDefinition,{role:''});assert.equal(rpc(c,serial,name,one).ok,true);assert.equal(rpc(c,serial,name,two).ok,true);const expected=semantic(c,serial);
   let definition=sql(c,d,`select pg_get_functiondef('public.${name}(jsonb)'::regprocedure)`,{role:''});const anchor='  update scoring_authority.net_skins_v1_result_revisions\n  set is_current = false';definition=definition.replace(anchor,'  perform pg_catalog.pg_advisory_xact_lock(284124202);\n'+anchor);sql(c,d,definition,{role:''});
   const sessions=[],pending=[];try{const barrier=openSqlSession(c,d),first=openSqlSession(c,d),second=openSqlSession(c,d);sessions.push(barrier,first,second);const pids=[];for(const s of sessions)pids.push(Number(await s.query('select pg_backend_pid()')));await barrier.query('begin;select pg_advisory_xact_lock(284124202)');for(const s of [first,second])await s.query("set statement_timeout='5s'");const a=result(first.query(rpcSql(name,one)));pending.push(a);await graph(c,d,pids,g=>g.some(v=>v.pid===pids[1]&&v.blockedBy.includes(pids[0])));const b=result(second.query(rpcSql(name,two)));pending.push(b);const wait=await graph(c,d,pids,g=>g.some(v=>v.pid===pids[2]&&v.blockedBy.includes(pids[1])));await barrier.query('commit');for(const v of await Promise.all([a,b])){assert.equal(v.ok,true,JSON.stringify(v));assert.equal(v.value.ok,true);}assert.deepEqual(semantic(c,d),expected);evidence.tests.push({case:'two-rounds-absent-marker',pass:true,wait,serialFinancialAndDemandParity:true});}finally{await cleanup(sessions,pending);}
  });

  for(const marker of ['present','absent'])await t.test(`future2099 ${marker} marker actual claim/calculator/completion matches unchanged serial body`,()=>{
   const d='net_future_'+marker;clone(c,f.database,d);const input=prepareFutureNet(c,d);
   if(marker==='present')sql(c,d,`insert into scoring_authority.competition_recalculation_jobs(tournament_id,round_number,engine_key,status,runtime_generation_id)
    values('2099',0,'TOURNAMENT_STORYLINES','PENDING','${annualWorkerGeneration}')`,{role:''});
   const serial=d+'_serial';clone(c,d,serial);sql(c,serial,oldFutureDefinition,{role:''});
   assert.equal(futureRpc(c,serial,futureName,input).ok,true);const expected=futureSemantic(c,serial);
   const done=futureRpc(c,d,futureName,input);assert.equal(done.ok,true);assert.deepEqual(futureSemantic(c,d),expected);
   const state=futureSemantic(c,d);assert.equal(state.job.status,'SUCCEEDED');assert.equal(state.results.length,1);assert.equal(state.results[0].generation,annualWorkerGeneration);
   assert.equal(state.storylines.runtime_generation_id,annualWorkerGeneration);assert.equal(state.storylines.requested_source_revision.reason,'NET_SKINS_CURRENT_RESULT_CHANGED');
   assert.equal(state.storylines.requested_source_revision.revision.payloadHash,state.results[0].hash);assert.deepEqual(state.results[0].payload,input.result_payload);
   const retained=futureFootprint(c,d);assert.equal(futureRpc(c,d,futureName,input).ok,true);assert.equal(futureFootprint(c,d),retained);
   evidence.tests.push({case:'future2099-'+marker,pass:true,actualFutureClaimAndComplete:true,actualSharedHelper:true,unchangedFullNetCalculator:true,
    financialAndDemandCycleParity:true,receiptReplayWithoutFootprint:true,generation:annualWorkerGeneration,
    boundary:'Synthetic canonical retarget and authority/resource rows; outer annual certification substituted, original Net resource/generation guards retained'});
  });
  for(const failure of ['lease','source','job-generation'])await t.test(`future2099 absent marker rejects ${failure} without provisional footprint`,()=>{
   const d='net_future_reject_'+failure.replaceAll('-','_');clone(c,f.database,d);const input=prepareFutureNet(c,d);
   if(failure==='lease')input.claim_token='00000000-0000-4000-8000-000000000001';
   if(failure==='source')input.source_fingerprint='f'.repeat(64);
   if(failure==='job-generation')sql(c,d,`begin;set local session_replication_role=replica;
    update scoring_authority.net_skins_v1_recalculation_jobs set runtime_generation_id='00000000-0000-4000-8000-000000000002' where job_id='${input.job_id}';commit;`,{role:''});
   const prior=futureFootprint(c,d),rejected=sqlResult(c,d,'\\set VERBOSITY verbose\n'+"set statement_timeout='5s';"+rpcSql(futureName,input));assert.notEqual(rejected.status,0);
   assert.match(rejected.stderr,failure==='source'?/40001.*SOURCE_REVISION_CONFLICT/:/42501.*JOB_LEASE_REQUIRED/);assert.equal(futureFootprint(c,d),prior);
   assert.equal(sql(c,d,"select count(*) from scoring_authority.competition_recalculation_jobs where tournament_id='2099' and engine_key='TOURNAMENT_STORYLINES'"),'0');
   evidence.tests.push({case:'future2099-rejected-'+failure,pass:true,absentMarkerAndAllRowsUnchanged:true,
    generationNegativeFixtureFkBypass:failure==='job-generation',actualFutureCompletionGuard:true});
  });
  await t.test('future2099 completion waits for Storylines before taking configuration or job lock',async()=>{
   const d='net_future_prefix';clone(c,f.database,d);const input=prepareFutureNet(c,d);
   sql(c,d,`insert into scoring_authority.competition_recalculation_jobs(tournament_id,round_number,engine_key,status,runtime_generation_id)
    values('2099',0,'TOURNAMENT_STORYLINES','PENDING','${annualWorkerGeneration}')`,{role:''});
   const sessions=[],pending=[];try{
    const holder=openSqlSession(c,d),completion=openSqlSession(c,d),probe=openSqlSession(c,d);sessions.push(holder,completion,probe);const pids=[];
    for(const s of sessions)pids.push(Number(await s.query('select pg_backend_pid()')));
    await holder.query("begin;select 1 from scoring_authority.competition_recalculation_jobs where tournament_id='2099' and round_number=0 and engine_key='TOURNAMENT_STORYLINES' for update");
    await completion.query("set statement_timeout='5s'");const work=result(completion.query(rpcSql(futureName,input)));pending.push(work);
    const waiting=await graph(c,d,pids,g=>g.some(v=>v.pid===pids[1]&&v.blockedBy.includes(pids[0])));
    await probe.query(`begin;select 1 from scoring_authority.net_skins_v1_configuration_current where tournament_id='2099' for update nowait;
     select 1 from scoring_authority.net_skins_v1_recalculation_jobs where job_id='${input.job_id}' for update nowait;rollback`);
    await holder.query('commit');const done=await work;assert.equal(done.ok,true,JSON.stringify(done));assert.equal(done.value.ok,true);
    evidence.tests.push({case:'future2099-prefix-before-config-job',pass:true,waiting,configAndJobNowaitSucceededWhileCompletionBlocked:true});
   }finally{await cleanup(sessions,pending);}
  });

  await t.test('actual absent-marker max lookup remains indexed with irrelevant result history',()=>{
   const observations=[];
   for(const historyCount of [1000,10000]){
    const d='net_max_plan_'+historyCount;clone(c,f.database,d);
    const retainedCurrent=sql(c,d,"select md5(jsonb_agg(to_jsonb(r) order by round_number)::text) from scoring_authority.net_skins_v1_result_revisions r where tournament_id='2026' and is_current");
    // All CHECKs, unique keys, FKs and triggers stay active. Each noncurrent R2
    // result references a distinct cloned terminal job. Current financial rows,
    // source, configuration and the measured R1 revision remain unchanged.
    sql(c,d,`begin;set local statement_timeout='30s';
     insert into scoring_authority.net_skins_v1_recalculation_jobs
      select v.* from scoring_authority.net_skins_v1_result_revisions r
      join scoring_authority.net_skins_v1_recalculation_jobs j on j.job_id=r.job_id
      cross join generate_series(1,${historyCount}) n
      cross join lateral jsonb_populate_record(null::scoring_authority.net_skins_v1_recalculation_jobs,
       to_jsonb(j)||jsonb_build_object('job_id',md5('net-max-history-job:'||n)::uuid,
        'source_revision',jsonb_build_object('syntheticHistoryPlan',true,'ordinal',n),
        'source_fingerprint',production_control.net_skins_v1_hash(jsonb_build_object('syntheticHistoryPlan',true,'ordinal',n))))v
      where r.tournament_id='2026' and r.round_number=2 and r.is_current;
     insert into scoring_authority.net_skins_v1_result_revisions
      select v.* from scoring_authority.net_skins_v1_result_revisions r
      cross join generate_series(1,${historyCount}) n
      cross join lateral jsonb_populate_record(null::scoring_authority.net_skins_v1_result_revisions,
       to_jsonb(r)||jsonb_build_object('result_id',md5('net-max-history-result:'||n)::uuid,
        'job_id',md5('net-max-history-job:'||n)::uuid,'result_revision',r.result_revision+n,
        'source_fingerprint',production_control.net_skins_v1_hash(jsonb_build_object('syntheticHistoryPlan',true,'ordinal',n)),
        'is_current',false,'superseded_at',timestamptz '2026-08-01 00:00:00+00'))v
      where r.tournament_id='2026' and r.round_number=2 and r.is_current;
     analyze scoring_authority.net_skins_v1_result_revisions;commit;`,{role:''});
    assert.equal(sql(c,d,"select md5(jsonb_agg(to_jsonb(r) order by round_number)::text) from scoring_authority.net_skins_v1_result_revisions r where tournament_id='2026' and is_current"),retainedCurrent);
    assert.equal(Number(sql(c,d,"select count(*) from scoring_authority.net_skins_v1_result_revisions where tournament_id='2026' and round_number=2 and not is_current")),historyCount);
    const input=claim(c,d);assert.equal(input.result_payload.round,1);clearMarker(c,d);
    // Exact state the completion can modify, plus retained-history cardinality.
    // Avoid serializing every unrelated historical job's calculation payload.
    const measuredFootprint=()=>sql(c,d,`set statement_timeout='5s';select md5(jsonb_build_object(
     'job',(select to_jsonb(j) from scoring_authority.net_skins_v1_recalculation_jobs j where job_id='${input.job_id}'),
     'currentRound',(select jsonb_agg(to_jsonb(r) order by result_revision) from scoring_authority.net_skins_v1_result_revisions r where tournament_id='2026' and round_number=1),
     'story',(select to_jsonb(j) from scoring_authority.competition_recalculation_jobs j where tournament_id='2026' and round_number=0 and engine_key='TOURNAMENT_STORYLINES'),
     'retainedResults',(select count(*) from scoring_authority.net_skins_v1_result_revisions where tournament_id='2026' and round_number=2),
     'retainedJobs',(select count(*) from scoring_authority.net_skins_v1_recalculation_jobs where tournament_id='2026' and round_number=2),
     'receipts',(select count(*) from production_control.cutover_operation_receipts),
     'audit',(select count(*) from scoring_authority.audit_events),
     'attempts',(select count(*) from production_control.score_derived_delivery_attempts_v1))::text)`);
    const prior=measuredFootprint();
    const captured=sqlResult(c,d,`begin;set local statement_timeout='5s';load 'auto_explain';
     set local client_min_messages=log;set local auto_explain.log_min_duration=0;
     set local auto_explain.log_analyze=on;set local auto_explain.log_buffers=on;
     set local auto_explain.log_timing=off;set local auto_explain.log_nested_statements=on;
     set local auto_explain.log_format=json;${rpcSql(name,input)};
     set local auto_explain.log_min_duration=-1;rollback;`);
    assert.equal(captured.status,0,captured.stderr?.slice(-2000));assert.equal(JSON.parse(captured.stdout).ok,true);
    const maxPlans=[];
    for(const match of captured.stderr.matchAll(/duration:\s+([0-9.]+)\s+ms\s+plan:\s*/g)){
     const start=match.index+match[0].length;let depth=0,quoted=false,escaped=false,end=start;
     for(;end<captured.stderr.length;end++){const ch=captured.stderr[end];if(quoted){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')quoted=false;}else if(ch==='"')quoted=true;else if(ch==='{')depth++;else if(ch==='}'&&--depth===0){end++;break;}}
     const parsed=JSON.parse(captured.stderr.slice(start,end));
     if(/max\(result_revision\)/.test(parsed['Query Text']||''))maxPlans.push({querySha256:createHash('sha256').update(parsed['Query Text']).digest('hex'),instrumentedDurationMs:Number(match[1]),plan:parsed.Plan});
    }
    assert.equal(maxPlans.length,1,'Exact new helper max query must actually execute once');
    const flatten=n=>[n,...(n.Plans||[]).flatMap(flatten)];
    const scans=flatten(maxPlans[0].plan).filter(n=>n['Relation Name']==='net_skins_v1_result_revisions');
    assert.equal(scans.length,1);assert.match(scans[0]['Node Type'],/^Index/);
    assert.ok(scans[0]['Index Name']);assert.ok((scans[0]['Actual Rows']||0)+(scans[0]['Rows Removed by Filter']||0)<=1);
    assert.equal(sql(c,d,'show enable_seqscan'),'on');assert.equal(measuredFootprint(),prior);
    observations.push({historyCount,currentRoundResultRows:1,otherRoundNoncurrentRows:historyCount,
     planner:'DEFAULT_NO_PLANNER_OVERRIDE',actualCompletionOk:true,actualHelperMaxPlans:maxPlans,
     currentFinancialRowsUnchanged:true,allCheckUniqueFkConstraintsActive:true,rollbackVerified:true});
   }
   evidence.tests.push({case:'absent-marker-current-round-max-history-plan',pass:true,observations,
    limitations:['Synthetic terminal jobs and noncurrent other-round results are directly constructed; no historical receipt issuance is claimed.',
     'Current-round revision growth is not measured; this tests irrelevant other-round result history.',
     'Minimal linked historical source payloads prove row/index traversal, not realistic historical payload byte volume or issuance.',
     'Nested instrumented plans are not latency percentiles or write-amplification measurements.']});
  });

  await t.test('both completion bodies and private helper are manifest bound without changed authority attributes',()=>{
   const rows=json(c,f.database,`select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'hash',encode(extensions.digest(p.prosrc,'sha256'),'hex'),'source',p.prosrc,'acl',p.proacl,'owner',p.proowner,'definer',p.prosecdef,'configuration',p.proconfig)) from pg_proc p where p.oid in('public.complete_production_net_skins_v1_recalculation(jsonb)'::regprocedure,'public.future_production_complete_net_skins_recalculation_v1(jsonb)'::regprocedure)`);assert.equal(rows.length,2);for(const row of rows){assert.ok(row.source.indexOf('lock_net_skins_storylines_v1')<row.source.indexOf('into strict current_value'));assert.equal(row.definer,true);}
   const manifest=json(c,f.database,'select production_control.annual_side_game_implementation_manifest_v1()');assert.equal(manifest.scoreDerivedNetSkinsCompletionLocks.length,2);for(const row of rows)assert.equal(manifest.scoreDerivedNetSkinsCompletionLocks.find(v=>v.signature==='public.'+row.signature).source,row.source);
   assert.equal(sql(c,f.database,"select not has_function_privilege('service_role','production_control.lock_net_skins_storylines_v1(text,jsonb)','execute') and not has_function_privilege('anon','production_control.lock_net_skins_storylines_v1(text,jsonb)','execute') and not has_function_privilege('authenticated','production_control.lock_net_skins_storylines_v1(text,jsonb)','execute')"),'t');evidence.sources=rows.map(({source,...row})=>row);evidence.tests.push({case:'manifest-security',pass:true,futureCoverage:'ACTUAL_COMPLETION_WITH_EXPLICIT_OUTER_CERTIFICATION_SEAM'});
  });
 }finally{if(f)await destroyIsolatedCluster(f.cluster);await writeFile(new URL('../docs/reliability/phase2c/evidence/net-owner-control-lock-after.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');}
});
