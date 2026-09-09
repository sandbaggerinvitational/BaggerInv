import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {normalizeProductionTournamentSetupPayload} from '../lib/production-tournament-setup-contract.js';
import {createPairingDraft,validatePairingWorkspace} from '../lib/round-pairing-workspace.js';
import {createCluster,destroyCluster,available,fixture,sql,sqlFile,rpc,scope,json,run,environment,bin,actor}
  from './step13e6-production-tournament-setup-postgres.integration.test.mjs';

const directory=new URL('../supabase/production_migrations/',import.meta.url);
const file=name=>new URL(name,directory).pathname;
async function functionSQL(name,signature) {
  const source=await readFile(file(name),'utf8');
  const start=source.indexOf(signature);
  assert.ok(start>=0,signature);
  const body=source.slice(start);
  const delimiter=body.match(/\bas (\$[a-zA-Z0-9_]*\$)/i)[1];
  const end=body.indexOf(delimiter+';',body.indexOf(delimiter)+delimiter.length);
  assert.ok(end>0,signature);
  return body.slice(0,end+delimiter.length+1);
}

test('Release A: real finalized pairing/prepare bodies and Calcutta source/trigger/read compatibility',async t=>{
  assert.ok(await available(),'PostgreSQL 17 required');
  const c=await createCluster();t.after(()=>destroyCluster(c));
  const db='release_a'; run(bin.createdb,[db],{env:environment(c)});
  fixture(c,db);
  for(const name of ['202608300063_production_tournament_setup_v1.sql','202609030083_production_empty_pairings_v1.sql',
    '202609040084_production_starting_hole_retirement_v1.sql','202609090095_production_round_pairings_v1.sql',
    '202609090096_production_round_pairing_read_envelope_v1.sql']) sqlFile(c,db,file(name));
  // Replace reduced financial fixture relations with the actual installed DDL.
  // All writes in this test target a disposable socket-only local database.
  sql(c,db,`drop table scoring_authority.calcutta_v1_current,scoring_authority.calcutta_v1_auction_fact_revisions,
    scoring_authority.calcutta_v1_result_revisions,scoring_authority.calcutta_v1_recalculation_jobs;
    alter table scoring_authority.handicap_revision_current add column revision_number integer default 7;
    alter table scoring_authority.hole_scores add column hole_number integer,add column hole_revision integer,
      add column team_1_gross_scores jsonb,add column team_2_gross_scores jsonb,add column team_1_strokes jsonb,
      add column team_2_strokes jsonb,add column team_1_net_score numeric,add column team_2_net_score numeric,add column hole_winner text;
    create table production_control.current_tournament_pointer_v1(scope_key text,tournament_id text,pointer_revision bigint);
    create table production_control.future_annual_runtime_generations_v1(tournament_id text,generation_status text,pointer_revision bigint,runtime_generation_id uuid);
    create table production_control.cutover_activation_state(scope_key text,state text,current_authority text,read_cutover_phase text,activation_revision bigint);
    create table production_control.resource_scope(scope_key text,scoring_authority text,current_tournament_read_authority text,current_tournament_id text);
    create table scoring_authority.odds_publication_public_pointer_v1(tournament_id text,publication_state text,current_snapshot_id uuid);
    insert into production_control.current_tournament_pointer_v1 values('BAGGER_INV_PRODUCTION','2026',1);
    insert into production_control.cutover_activation_state values('BAGGER_INV_PRODUCTION','SCORING_COMMITTED','SUPABASE','OBSERVATION',170);
    insert into production_control.resource_scope values('BAGGER_INV_PRODUCTION','SUPABASE','SUPABASE','2026');
    create function production_control.assert_production_service_role() returns void language plpgsql as $$begin
      if current_setting('request.jwt.claim.role',true)<>'service_role' then raise exception 'TEST_SERVICE_ROLE_REQUIRED'; end if; end$$;
    create function production_control.assert_production_cutover_read_scope(jsonb,text) returns void language sql as $$select$$;
  `);
  const handicapFile='202608290058_production_handicap_revisions_v1.sql';
  const handicapSQL=await readFile(file(handicapFile),'utf8');
  sql(c,db,handicapSQL.slice(handicapSQL.indexOf('create table scoring_authority.handicap_revisions'),handicapSQL.indexOf('create table scoring_authority.handicap_revision_entries')));
  sql(c,db,handicapSQL.slice(handicapSQL.indexOf('create table scoring_authority.handicap_operation_receipts'),handicapSQL.indexOf('alter table scoring_authority.tournament_players\n  add constraint')));
  sql(c,db,`alter table scoring_authority.handicap_revision_current add column updated_at timestamptz default now();
    alter table scoring_authority.handicap_revision_entries add column source_index numeric,add column low_index numeric,add column source_metadata jsonb default '{}';
    alter table scoring_authority.audit_events alter column match_id drop not null,alter column mutation_key drop not null;
    create table production_control.operation_audit_events(event_type text,domain text,tournament_id text,actor text,request_fingerprint text,result text,details jsonb);
    create function production_control.assert_exact_cutover_resource_scope(jsonb,boolean) returns void language sql as $$select$$;
    create function production_control.assert_production_handicap_runtime() returns void language sql as $$select$$;
    insert into scoring_authority.handicap_revisions(revision_id,tournament_id,revision_number,status,effective_date,method,canonical_fingerprint,roster_fingerprint,predecessor_revision,context_contract_version,created_by,approved_by,approved_at)
      values('10000000-0000-4000-8000-000000000001','2026',7,'APPROVED','2026-09-23','isolated test fixture',repeat('a',64),repeat('b',64),0,'production-handicap-context-v1','test','CB01',now());`);
  for(const name of ['handicap_v1_hash','handicap_v1_roster_fingerprint','handicap_v1_stored_entries',
    'handicap_v1_revision_fingerprint','handicap_v1_match_is_unstarted','handicap_v1_match_context','validate_handicap_revision_v1']) {
    if(name==='handicap_v1_match_context')sql(c,db,'drop function production_control.handicap_v1_match_context(text,uuid)');
    sql(c,db,await functionSQL(handicapFile,`create or replace function production_control.${name}(`));
  }
  sql(c,db,await functionSQL(handicapFile,'create or replace function public.approve_production_handicap_revision_v1('));
  sql(c,db,await functionSQL('202609040087_production_odds_publication_withdrawal_v1.sql','create function production_control.odds_publication_blocks_setup_v1('));
  const oddsMigration=await readFile(file('202609040087_production_odds_publication_withdrawal_v1.sql'),'utf8');
  sql(c,db,oddsMigration.slice(oddsMigration.indexOf('do $patch_setup_dependency$'),oddsMigration.indexOf('$patch_setup_dependency$;')+'$patch_setup_dependency$;'.length));
  const calcuttaFile='202608290056_production_calcutta_v1.sql';
  const full=await readFile(file(calcuttaFile),'utf8');
  sql(c,db,full.slice(full.indexOf('create table scoring_authority.calcutta_v1_configuration_revisions'),full.indexOf('create or replace function production_control.calcutta_v1_hash')));
  for(const name of ['calcutta_v1_hash','calcutta_v1_completed_rounds','enqueue_production_calcutta_v1','project_production_calcutta_v1_result']) {
    sql(c,db,await functionSQL(calcuttaFile,`create or replace function production_control.${name}(`));
  }
  sql(c,db,await functionSQL('202609040085_production_calcutta_full_course_handicap_v2.sql','create or replace function production_control.calcutta_v1_source_revision('));
  sql(c,db,await functionSQL('202608300075_production_annual_calcutta_v1.sql','create or replace function scoring_authority.enqueue_production_calcutta_v1_change()'));
  sql(c,db,(await functionSQL(calcuttaFile,'create or replace function public.read_production_calcutta_v1('))
    .replace('public.read_production_calcutta_v1(','public.read_production_calcutta_frozen_2026_v1('));
  // Full canonical 12 Singles Matches, with exact 24-player desired field.
  sql(c,db,`update scoring_authority.tournament_players set participation_status='WITHDRAWN' where player_id='CB05';
    insert into scoring_authority.players select prefix||lpad(n::text,2,'0'),prefix||n,'{}'::jsonb from unnest(array['P','Q']) prefix cross join generate_series(1,8)n;
    insert into scoring_authority.tournament_players(tournament_id,player_id,team_id,team_side,participation_status,source_roster_key,tournament_handicap,handicap_revision_id)
      select '2026',player_id,case when player_id like 'P%' then 'CB' else 'WD' end,case when player_id like 'P%' then 1 else 2 end,'ACTIVE','2026:'||player_id,5,'10000000-0000-4000-8000-000000000001' from scoring_authority.players where player_id ~ '^[PQ]';
    insert into scoring_authority.handicap_revision_entries select '10000000-0000-4000-8000-000000000001','2026',player_id,5 from scoring_authority.players where player_id ~ '^[PQ]';
    insert into scoring_authority.scoring_snapshots select '2026-R3-'||n||':S1',tournament_id,'2026-R3-'||n,snapshot_revision,scoring_rules_version,format,handicap_allowance,course_id,tee,rating,slope,par,match_netting_baseline,hole_definitions,participant_configuration,team_configuration,effective_at,imported_at,canonical_hash,handicap_revision_id from scoring_authority.scoring_snapshots cross join generate_series(2,12)n where snapshot_id='2026-R3-1:S1';
    insert into scoring_authority.matches(match_id,tournament_id,round_number,format,scoring_snapshot_id,status) select '2026-R3-'||n,'2026',3,'SI','2026-R3-'||n||':S1','UPCOMING' from generate_series(2,12)n;
    insert into scoring_authority.tournament_setup_course_tees_v1(tournament_id,course_id,tee_id,display_name,rating,slope,par,setup_revision,updated_by_player_id) values('2026','COURSE-1','Tournament','Course One',72,120,72,10,'CB01');
    insert into scoring_authority.tournament_setup_course_holes_v1 select '2026','COURSE-1','Tournament',n,4,n,400,10 from generate_series(1,18)n;
    insert into scoring_authority.tournament_setup_round_courses_v1(tournament_id,round_number,course_id,tee_id,setup_revision,updated_by_player_id) values('2026',3,'COURSE-1','Tournament',10,'CB01');
    insert into scoring_authority.tournament_setup_match_details_v1(match_id,tournament_id,round_number,match_number,course_id,tee_id,tee_time,setup_revision,updated_by_player_id)
      select match_id,'2026',3,split_part(match_id,'-',3)::integer,'COURSE-1','Tournament','07:30',10,'CB01' from scoring_authority.matches where round_number=3;
    insert into production_control.tournament_setup_context_v1(tournament_id,contract_version,revision,updated_by_player_id,updated_by_auth_user_id) values('2026','production-tournament-setup-v1',10,'CB01','${actor.authUserId}');
    update scoring_authority.matches set status='LIVE',scoring_locked=true where round_number=1;
    insert into scoring_authority.calcutta_v1_configuration_revisions(configuration_revision_id,tournament_id,configuration_revision,contract_version,state,configuration_manifest,configuration_fingerprint,resource_fingerprint,activation_revision)
      values('20000000-0000-4000-8000-000000000001','2026',1,'production-calcutta-v1','NOT_CONFIGURED','{}',repeat('a',64),repeat('a',64),170);
    insert into scoring_authority.calcutta_v1_auction_fact_revisions(auction_revision_id,tournament_id,auction_revision,state,auction_manifest,auction_fingerprint,resource_fingerprint,activation_revision,recorded_by_player_id,recorded_by_auth_user_id,request_fingerprint,request_payload_hash,recorded_at)
      values('20000000-0000-4000-8000-000000000002','2026',1,'AUCTION_COMPLETE',jsonb_build_object('pot',16800,'purchases',(select jsonb_agg(jsonb_build_object('player_id',player_id,'purchase_price',700) order by player_id) from scoring_authority.tournament_players where participation_status='ACTIVE'),'ownership',(select jsonb_agg(jsonb_build_object('player_id',player_id,'owner_player_id','CB01','ownership_fraction',1) order by player_id) from scoring_authority.tournament_players where participation_status='ACTIVE')),repeat('b',64),repeat('b',64),170,'CB01','${actor.authUserId}',repeat('c',64),repeat('c',64),now());
    insert into scoring_authority.calcutta_v1_current(tournament_id,configuration_revision_id,configuration_revision,configuration_fingerprint,auction_revision_id,auction_revision,auction_fingerprint,state)
      values('2026','20000000-0000-4000-8000-000000000001',1,repeat('a',64),'20000000-0000-4000-8000-000000000002',1,repeat('b',64),'AUCTION_COMPLETE');
    create trigger lifecycle_test_calcutta after update of status,result_winner,scorecard_complete,finalized_at,match_revision on scoring_authority.matches for each row execute function scoring_authority.enqueue_production_calcutta_v1_change();
  `);
  const side1=['CB01','CB02','CB03','CB04',...Array.from({length:8},(_,i)=>`P0${i+1}`)];
  const side2=['WD01','WD02','WD03','WD04',...Array.from({length:8},(_,i)=>`Q0${i+1}`)];
  const rows=Array.from({length:12},(_,i)=>({match_id:`2026-R3-${i+1}`,format:'SI',participants:[1,2].map(side=>({player_id:(side===1?side1:side2)[i],team_side:side,player_slot:1}))}));
  // Full, prepared/started R1 and R2. Use existing SQL handicap authority to
  // seed realistic frozen contexts; never connect this fixture to Production.
  for(const [round,format] of [[1,'BB'],[2,'SC']]) {
    const roundRows=Array.from({length:6},(_,i)=>({match_id:`2026-R${round}-${i+1}`,participants:[1,2].flatMap(side=>[1,2].map(slot=>({player_id:(side===1?side1:side2)[i*2+slot-1],team_side:side,player_slot:slot})))}));
    sql(c,db,`insert into scoring_authority.scoring_snapshots select '2026-R${round}-'||n||':S1',tournament_id,'2026-R${round}-'||n,snapshot_revision,scoring_rules_version,'${format}',1,course_id,tee,rating,slope,par,match_netting_baseline,hole_definitions,participant_configuration,team_configuration,effective_at,imported_at,canonical_hash,handicap_revision_id from scoring_authority.scoring_snapshots cross join generate_series(1,6)n where snapshot_id='2026-R3-1:S1' on conflict(snapshot_id) do nothing;
      insert into scoring_authority.matches(match_id,tournament_id,round_number,format,scoring_snapshot_id,status,scoring_locked) select '2026-R${round}-'||n,'2026',${round},'${format}','2026-R${round}-'||n||':S1','LIVE',true from generate_series(1,6)n on conflict(match_id) do nothing;
      delete from scoring_authority.match_participants where match_id in(select match_id from scoring_authority.matches where round_number=${round});
      delete from scoring_authority.scoring_permissions where match_id in(select match_id from scoring_authority.matches where round_number=${round});
      insert into scoring_authority.match_participants(match_id,player_id,team_side,player_slot,tournament_handicap,handicap_index,course_handicap,playing_handicap,final_strokes,handicap_revision_id)
        select r->>'match_id',p->>'player_id',(p->>'team_side')::integer,(p->>'player_slot')::integer,5,5,5,0,0,'10000000-0000-4000-8000-000000000001' from jsonb_array_elements(${json(roundRows)}) r cross join lateral jsonb_array_elements(r->'participants') p;
      insert into scoring_authority.tournament_setup_round_courses_v1(tournament_id,round_number,course_id,tee_id,setup_revision,updated_by_player_id) values('2026',${round},'COURSE-1','Tournament',10,'CB01');
      insert into scoring_authority.tournament_setup_match_details_v1(match_id,tournament_id,round_number,match_number,course_id,tee_id,tee_time,setup_revision,prepared_setup_revision,prepared_configuration_fingerprint,updated_by_player_id)
        select match_id,'2026',${round},split_part(match_id,'-',3)::integer,'COURSE-1','Tournament','07:30',10,10,repeat('b',64),'CB01' from scoring_authority.matches where round_number=${round};
      do $$declare target text;ctx jsonb;p jsonb;begin
        for target in select match_id from scoring_authority.matches where round_number=${round} loop
          ctx:=production_control.handicap_v1_match_context(target,'10000000-0000-4000-8000-000000000001');
          update scoring_authority.scoring_snapshots set participant_configuration=ctx->'participant_configuration',team_configuration=ctx->'team_configuration' where match_id=target;
          for p in select value from jsonb_array_elements(ctx->'participants') loop
            update scoring_authority.match_participants set course_handicap=(p->>'course_handicap')::numeric,playing_handicap=(p->>'playing_handicap')::numeric,final_strokes=(p->>'final_strokes')::integer where match_id=target and player_id=p->>'player_id';
          end loop;
        end loop;
      end$$;`);
  }
  const revision=()=>Number(sql(c,db,`select production_control.tournament_setup_revision_v1('2026')`));
  const input=(row)=>scope('REPLACE_PAIRINGS',{operation_request_id:randomUUID(),request_payload_hash:'c'.repeat(64),expected_revision:revision(),pairings:row});
  const save=(row)=>rpc(c,db,'mutate_production_tournament_setup_v1',input(row));
  assert.equal(save(rows[0]).ok,false,'baseline auction guard rejects first R3 setup');
  const before095=sql(c,db,`select md5(prosrc) from pg_proc where oid='public.mutate_production_round_pairings_v1(jsonb)'::regprocedure`);
  sqlFile(c,db,file('202609090097_production_late_r3_initialization_v1.sql'));
  run(bin.createdb,['-T',db,'release_a_template'],{env:environment(c)});
  assert.equal(sql(c,db,`select md5(prosrc) from pg_proc where oid='production_control.mutate_round_pairings_before_late_r3_v1(jsonb)'::regprocedure`),before095,'095 body preserved byte-for-byte');
  assert.equal(sql(c,db,'select count(*) from production_control.late_r3_initialization_receipts_v1'),'0','installation creates no receipts');
  const preserved=sql(c,db,'select production_control.late_r3_consumed_fingerprint_v1()');
  const first=input(rows[0]);
  assert.equal(rpc(c,db,'mutate_production_tournament_setup_v1',first).ok,true,'first R3 after auction');
  assert.equal(rpc(c,db,'mutate_production_tournament_setup_v1',first).idempotent,true,'exact retry');
  assert.equal(rpc(c,db,'mutate_production_tournament_setup_v1',{...first,pairings:rows[1]}).code,'TOURNAMENT_SETUP_IDEMPOTENCY_CONFLICT');
  assert.equal(sql(c,db,'select count(*) from production_control.late_r3_initialization_receipts_v1'),'1');
  assert.equal(sql(c,db,'select count(*) from scoring_authority.calcutta_v1_recalculation_jobs'),'0','no needless job');
  assert.equal(sql(c,db,'select production_control.late_r3_consumed_fingerprint_v1()'),preserved);
  for(const row of rows.slice(1)) assert.equal(save(row).ok,true,`incremental ${row.match_id}`);
  assert.equal(sql(c,db,'select count(*) from production_control.late_r3_initialization_receipts_v1'),'12');
  assert.equal(sql(c,db,"select count(distinct player_id) from scoring_authority.match_participants where match_id like '2026-R3-%'"),'24');
  const prepare=scope('PREPARE_SCORING_CONTEXT',{operation_request_id:randomUUID(),request_payload_hash:'d'.repeat(64),expected_revision:revision(),scoring_context:{match_id:rows[0].match_id}});
  assert.equal(rpc(c,db,'mutate_production_tournament_setup_v1',prepare).ok,true,'receipt-bound preparation');
  assert.equal(sql(c,db,'select production_control.late_r3_consumed_fingerprint_v1()'),preserved);
  assert.equal(save({...rows[0],participants:[]}).ok,false,'clear cannot bypass auction');
  assert.equal(save({...rows[0],participants:rows[1].participants}).ok,false,'different pairing is an edit');
  assert.equal(sql(c,db,'select count(*) from production_control.late_r3_transactions_v1'),'0','capabilities cleared');

  let scenarioSequence=0;
  const scenario=()=>{
    const database=`release_a_case_${++scenarioSequence}`;
    run(bin.createdb,['-T','release_a_template',database],{env:environment(c)});
    const s=query=>sql(c,database,query);
    const rev=()=>Number(s("select production_control.tournament_setup_revision_v1('2026')"));
    const request=(operation,extra={})=>scope(operation,{operation_request_id:randomUUID(),request_payload_hash:'a'.repeat(64),expected_revision:rev(),...extra});
    const call=(operation,extra={})=>rpc(c,database,operation==='REPLACE_ROUND_PAIRINGS'?'mutate_production_round_pairings_v1':'mutate_production_tournament_setup_v1',request(operation,extra));
    const pair=row=>call('REPLACE_PAIRINGS',{pairings:row});
    const all=(matches=rows)=>call('REPLACE_ROUND_PAIRINGS',{round_number:3,matches,expected_handicap_revision_id:'10000000-0000-4000-8000-000000000001'});
    const fingerprint=()=>s(`select md5(jsonb_build_object(
      'matches',(select jsonb_agg(to_jsonb(m) order by match_id) from scoring_authority.matches m),
      'participants',(select jsonb_agg(to_jsonb(p) order by match_id,player_id) from scoring_authority.match_participants p),
      'snapshots',(select jsonb_agg(to_jsonb(s) order by snapshot_id) from scoring_authority.scoring_snapshots s),
      'context',(select jsonb_agg(to_jsonb(x)) from production_control.tournament_setup_context_v1 x),
      'receipts',(select jsonb_agg(to_jsonb(x) order by match_id) from production_control.late_r3_initialization_receipts_v1 x),
      'operations',(select count(*) from production_control.tournament_setup_operation_receipts_v1),
      'audit',(select count(*) from production_control.tournament_setup_audit_events_v1),
      'financial',production_control.late_r3_financial_fingerprint_v1(),
      'jobs',(select jsonb_agg(to_jsonb(j) order by job_id) from scoring_authority.calcutta_v1_recalculation_jobs j))::text)`);
    const rejected=operation=>{const before=fingerprint();const result=operation();assert.equal(result.ok,false,JSON.stringify(result));assert.equal(fingerprint(),before,'failure is atomic');return result;};
    return {database,s,request,call,pair,all,fingerprint,rejected};
  };
  const seedResult=(x,completed=[1,2])=>x.s(`
    select production_control.enqueue_production_calcutta_v1('TEST_ONLY','isolated-test');
    update scoring_authority.calcutta_v1_recalculation_jobs set status='SUCCEEDED',completed_at=now();
    insert into scoring_authority.calcutta_v1_result_revisions(tournament_id,configuration_revision_id,configuration_revision,configuration_fingerprint,auction_revision_id,auction_revision,auction_fingerprint,result_revision,job_id,engine_version,source_fingerprint,result_state,engine_result_payload,payload_hash,calculated_by,calculated_at)
      select '2026',configuration_revision_id,configuration_revision,configuration_fingerprint,auction_revision_id,auction_revision,auction_fingerprint,1,job_id,'calcutta-js-v1',source_fingerprint,'PROVISIONAL',${json({available:true,pot:16800,completedRounds:completed,golfers:[],portfolios:[],distributedPrizePool:16296,guaranteedDistributed:1176})},repeat('f',64),'isolated-test',now() from scoring_authority.calcutta_v1_recalculation_jobs limit 1;
    insert into scoring_authority.calcutta_v1_publication_revisions(publication_revision_id,tournament_id,publication_revision,configuration_revision,auction_revision,configuration_fingerprint,auction_fingerprint,publication_state,action,actor_player_id,actor_auth_user_id,request_fingerprint,request_payload_hash,published_at)
      values('20000000-0000-4000-8000-000000000003','2026',1,1,1,repeat('a',64),repeat('b',64),'PUBLISHED','DIRECTOR_PUBLISHED','CB01','${actor.authUserId}',repeat('d',64),repeat('d',64),now());
    update scoring_authority.calcutta_v1_current set result_revision=1,state='IN_PROGRESS',publication_state='PUBLISHED',publication_revision=1,publication_revision_id='20000000-0000-4000-8000-000000000003';
  `);

  await t.test('unchanged 096 read envelope reaches Director R3 review and receipt-bound preparation with an auction',()=>{
    const x=scenario();
    const read=()=>normalizeProductionTournamentSetupPayload(rpc(c,x.database,'read_production_tournament_setup_v1',scope('READ_PRODUCTION_TOURNAMENT_SETUP_V1')));
    const data=read();assert.equal(data.capabilities['replace-pairings'].allowed,true);
    assert.equal(data.capabilities['prepare-scoring-context'].allowed,true);
    assert.equal(data.matches.filter(m=>m.roundNumber===3).length,12);
    const drafts=Object.fromEntries(data.matches.map(m=>[m.matchId,createPairingDraft(m)]));
    for(const row of rows)drafts[row.match_id].participants=row.participants.map(p=>({playerId:p.player_id,teamSide:p.team_side,playerSlot:p.player_slot}));
    assert.deepEqual(validatePairingWorkspace(data,drafts,3,{fullRound:false,matchId:rows[0].match_id}).errors,[]);
    assert.deepEqual(validatePairingWorkspace(data,drafts,3).errors,[]);
    assert.equal(x.pair(rows[0]).ok,true);
    const saved=read().matches.find(m=>m.matchId===rows[0].match_id);
    assert.equal(saved.locked,false);assert.equal(saved.detailsManaged,true);assert.equal(saved.participantCount,2);
    assert.equal(x.call('PREPARE_SCORING_CONTEXT',{scoring_context:{match_id:rows[0].match_id}}).ok,true);
  });

  await t.test('095 mixed existing/new Round Save-All, pre-delete evidence and atomic changed retry',()=>{
    const x=scenario();assert.equal(x.pair(rows[0]).ok,true);
    const before=x.s("select to_jsonb(p)::text from production_control.late_r3_initialization_receipts_v1 p where match_id='2026-R3-1'");
    const swap=structuredClone(rows);[swap[0].participants[0],swap[1].participants[0]]=[swap[1].participants[0],swap[0].participants[0]];
    x.rejected(()=>x.all(swap)); // Established Match must never become 'new' after DELETE.
    const result=x.all();assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.changedMatches.length,11);
    assert.equal(x.s('select count(*) from production_control.late_r3_initialization_receipts_v1'),'12');
    assert.equal(x.s("select to_jsonb(p)::text from production_control.late_r3_initialization_receipts_v1 p where match_id='2026-R3-1'"),before);
    assert.equal(x.s("select bool_and(pre_mutation_evidence->'pairing'='[]'::jsonb) from production_control.late_r3_initialization_receipts_v1"),'t');
    assert.equal(x.all().changed,false,'unchanged full round is no-op');
  });
  await t.test('late failure rolls back earlier pairing writes and all lifecycle receipts',()=>{
    const x=scenario();x.s(`create function scoring_authority.fail_late_r3() returns trigger language plpgsql as $$begin if new.match_id='2026-R3-9' then raise exception 'TOURNAMENT_SETUP_TEST_LATE_FAILURE';end if;return new;end$$;
      create trigger fail_late_r3 before insert on scoring_authority.match_participants for each row execute function scoring_authority.fail_late_r3();`);
    x.rejected(()=>x.all());assert.equal(x.s('select count(*) from production_control.late_r3_transactions_v1'),'0');
  });
  await t.test('clear and repopulate cannot erase trusted initialization history',()=>{
    const x=scenario();
    x.s("update scoring_authority.calcutta_v1_current set auction_revision=0,auction_revision_id=null,auction_fingerprint=null,state='CONFIGURED'");
    assert.equal(x.pair(rows[0]).ok,true);
    assert.equal(x.pair({...rows[0],participants:[]}).ok,true,'ordinary pre-auction clear remains available');
    x.s("update scoring_authority.calcutta_v1_current set auction_revision=1,auction_revision_id='20000000-0000-4000-8000-000000000002',auction_fingerprint=repeat('b',64),state='AUCTION_COMPLETE'");
    x.rejected(()=>x.pair(rows[0]));assert.equal(x.s('select count(*) from production_control.late_r3_initialization_receipts_v1'),'1');
  });
  await t.test('duplicates, team membership, handicap coverage, stale CAS and security',()=>{
    const x=scenario();assert.equal(x.pair(rows[0]).ok,true);
    x.rejected(()=>x.pair({...rows[1],participants:rows[0].participants}));
    const wrong=structuredClone(rows[1]);wrong.participants[0].player_id='WD02';x.rejected(()=>x.pair(wrong));
    x.s("delete from scoring_authority.handicap_revision_entries where player_id='WD02'");x.rejected(()=>x.pair(rows[1]));
    const stale=x.request('REPLACE_PAIRINGS',{pairings:rows[2],expected_revision:0});
    x.rejected(()=>rpc(c,x.database,'mutate_production_tournament_setup_v1',stale));
    assert.throws(()=>rpc(c,x.database,'mutate_production_tournament_setup_v1',{...stale,tournament_id:'2025'}),/SCOPE/);
    assert.equal(x.s("select has_function_privilege('service_role','production_control.mutate_late_r3_dispatch_v1(jsonb,boolean)','execute')"),'f');
    assert.equal(x.s("select has_table_privilege('service_role','production_control.late_r3_transactions_v1','insert')"),'f');
    assert.equal(x.s("select has_function_privilege('anon','public.mutate_production_round_pairings_v1(jsonb)','execute')"),'f');
  });
  for(const status of ['PENDING','RUNNING']) await t.test(`${status} Calcutta job blocks; no cancellation or lease bypass`,()=>{
    const x=scenario();x.s("select production_control.enqueue_production_calcutta_v1('TEST_ONLY','isolated-test')");
    if(status==='RUNNING')x.s("update scoring_authority.calcutta_v1_recalculation_jobs set status='RUNNING',claimed_by='test-worker',claim_token=extensions.gen_random_uuid(),lease_expires_at=now()+interval '1 hour',started_at=now()");
    x.rejected(()=>x.pair(rows[0]));assert.equal(x.s('select status from scoring_authority.calcutta_v1_recalculation_jobs'),status);
  });
  for(const state of ['PUBLISHED','PENDING','RUNNING','RETRYABLE','SUCCEEDED']) await t.test(`Odds ${state} remains a blocker`,()=>{
    const x=scenario();
    if(state==='PUBLISHED')x.s("insert into scoring_authority.odds_publication_public_pointer_v1 values('2026','PUBLISHED',extensions.gen_random_uuid())");
    else x.s(`insert into scoring_authority.odds_calculation_jobs values('2026','${state}','READY')`);
    const result=x.rejected(()=>x.pair(rows[0]));assert.ok(result.blockers?.includes('ODDS_PUBLICATION_DEPENDENCY'));
  });
  await t.test('Net Skins result/job dependencies remain enforced',()=>{
    const x=scenario();x.s("insert into scoring_authority.net_skins_v1_recalculation_jobs values('2026',3,'PENDING')");x.rejected(()=>x.pair(rows[0]));
    x.s("delete from scoring_authority.net_skins_v1_recalculation_jobs;insert into scoring_authority.net_skins_v1_result_revisions values('2026',3,true)");x.rejected(()=>x.pair(rows[0]));
    x.s("update scoring_authority.net_skins_v1_result_revisions set is_current=false");
    x.rejected(()=>x.pair(rows[0])); // Historical R3 evidence cannot qualify for a future-Round exception.
  });
  await t.test('explicit R3 Net Skins configuration remains blocking',()=>{
    const x=scenario();x.s(`insert into scoring_authority.net_skins_v1_configuration_revisions values('30000000-0000-4000-8000-000000000001','{"rounds":[{"round_number":3,"match_ids":["2026-R3-1"]}]}');
      insert into scoring_authority.net_skins_v1_configuration_current values('2026','30000000-0000-4000-8000-000000000001','CONFIGURED');`);
    const result=x.rejected(()=>x.pair(rows[0]));assert.ok(result.blockers.includes('NET_SKINS_CONFIGURATION_DEPENDENCY'));
  });
  await t.test('pre-existing snapshot binding and receipt-less preparation cannot claim initialization',()=>{
    const x=scenario();x.s(`update scoring_authority.scoring_snapshots set participant_configuration='{"all_ids":["CB01","WD01"]}' where match_id='2026-R3-1'`);
    x.rejected(()=>x.pair(rows[0]));
    x.rejected(()=>x.call('PREPARE_SCORING_CONTEXT',{match_id:'2026-R3-1'}));
  });
  await t.test('established roster/course guards are unchanged through successor dispatch',()=>{
    const x=scenario();const before=x.fingerprint();
    const roster=x.call('ASSIGN_ROSTER_TEAM',{player_id:'CB01',team_id:'WD'});
    assert.equal(roster.ok,false);assert.equal(x.fingerprint(),before);
    const course=x.call('UPSERT_COURSE',{round_number:1,course_id:'COURSE-1',course_name:'Course One',city:'Kiawah',state:'SC',tee:'Tournament',rating:'73',slope:120,par:72,
      holes:Array.from({length:18},(_,i)=>({hole_number:i+1,par:4,stroke_index:i+1,yardage:400}))});
    assert.equal(course.ok,false);assert.equal(x.fingerprint(),before);
  });
  await t.test('R3 Round Save-All retains finalized stale-handicap, stale-revision and security envelopes',()=>{
    const x=scenario();
    const base=x.request('REPLACE_ROUND_PAIRINGS',{round_number:3,matches:rows,expected_handicap_revision_id:'10000000-0000-4000-8000-000000000001'});
    for(const change of [{expected_revision:0},{expected_handicap_revision_id:'10000000-0000-4000-8000-000000000099'},
      {tournament_id:'2025'},{authorization:{...base.authorization,role:'PLAYER'}}]) {
      x.rejected(()=>rpc(c,x.database,'mutate_production_round_pairings_v1',{...base,...change}));
    }
  });
  await t.test('started/frozen Match, active scoring access and leases remain blocked',()=>{
    const x=scenario();const prior=x.fingerprint();
    assert.throws(()=>x.pair({match_id:'2026-R1-1',format:'BB',participants:[
      {player_id:'CB02',team_side:1,player_slot:1},{player_id:'CB01',team_side:1,player_slot:2},
      {player_id:'WD01',team_side:2,player_slot:1},{player_id:'WD02',team_side:2,player_slot:2}]}),/MATCH_FROZEN/);
    assert.equal(x.fingerprint(),prior);
    x.s("insert into scoring_authority.scoring_permissions values('2026-R3-1','CB01',true,1,null,now())");x.rejected(()=>x.pair(rows[0]));
    x.s("delete from scoring_authority.scoring_permissions where match_id='2026-R3-1';insert into scoring_authority.scoring_ingress_leases(tournament_id,match_id,expires_at) values('2026','2026-R3-1',now()+interval '1 hour')");x.rejected(()=>x.pair(rows[0]));
  });
  await t.test('published R1/R2 payload identity survives, original fingerprint immutable; source change invalidates',()=>{
    const x=scenario();seedResult(x);
    const read=()=>rpc(c,x.database,'read_production_calcutta_frozen_2026_v1',{environment:'PRODUCTION',tournament_id:'2026',player_id:'CB01'}).data;
    const before=read();assert.equal(before.state,'IN_PROGRESS');assert.ok(before.result);
    const facts=x.s('select production_control.late_r3_financial_fingerprint_v1()');
    assert.equal(x.pair(rows[0]).ok,true);const after=read();
    assert.equal(after.freshness.lifecycle_compatible,true);assert.equal(after.freshness.stale,false);
    assert.deepEqual(after.result,before.result);assert.equal(after.publication_revision,before.publication_revision);
    assert.equal(x.s('select production_control.late_r3_financial_fingerprint_v1()'),facts);
    assert.equal(x.s("select count(*) from scoring_authority.calcutta_v1_recalculation_jobs where status in('PENDING','RUNNING')"),'0');
    const polled=JSON.parse(x.s("select production_control.enqueue_production_calcutta_v1('POLL','isolated-test')"));
    assert.equal(polled.status,'CURRENT','normal worker polling honors explicit compatibility');
    assert.equal(x.s('select production_control.late_r3_financial_fingerprint_v1()'),facts);
    x.s("update scoring_authority.matches set match_revision=match_revision+1 where match_id='2026-R1-1'");
    assert.equal(read().freshness.lifecycle_compatible,false);assert.equal(read().freshness.stale,true);
    assert.equal(x.s("select count(*) from scoring_authority.calcutta_v1_recalculation_jobs where status='PENDING'"),'1','genuine source still enqueues');
  });
  await t.test('R3 result is a blocker even when no R3 pairing exists',()=>{
    const x=scenario();seedResult(x,[1,2,3]);x.rejected(()=>x.pair(rows[0]));
  });
  await t.test('216 existing R1/R2 scored holes and Skins results survive R3 save and preparation',()=>{
    const x=scenario();
    x.s(`insert into scoring_authority.hole_scores(match_id,hole_number,hole_revision,team_1_gross_scores,team_2_gross_scores,team_1_strokes,team_2_strokes,team_1_net_score,team_2_net_score,hole_winner)
      select match_id,n,1,case when format='BB' then '[4,5]'::jsonb else '[4]'::jsonb end,
        case when format='BB' then '[5,6]'::jsonb else '[5]'::jsonb end,
        case when format='BB' then '[0,1]'::jsonb else '[0]'::jsonb end,
        case when format='BB' then '[1,2]'::jsonb else '[1]'::jsonb end,4,4,'TIE'
      from scoring_authority.matches cross join generate_series(1,18)n where round_number in(1,2);
      update scoring_authority.matches set status='FINAL',scorecard_complete=true,finalized_at=now(),scored_holes=18,holes_remaining=0,current_hole=18 where round_number in(1,2);
      delete from scoring_authority.calcutta_v1_recalculation_jobs;
      insert into scoring_authority.net_skins_v1_result_revisions values('2026',1,true),('2026',2,true);`);
    seedResult(x);assert.equal(x.s('select count(*) from scoring_authority.hole_scores'),'216');
    assert.equal(x.s('select production_control.calcutta_v1_completed_rounds()'),'{1,2}');
    const before=x.s('select production_control.late_r3_consumed_fingerprint_v1()');
    const original=rpc(c,x.database,'read_production_calcutta_frozen_2026_v1',{environment:'PRODUCTION',tournament_id:'2026',player_id:'CB01'}).data;
    assert.equal(x.all().ok,true);
    assert.equal(x.call('PREPARE_SCORING_CONTEXT',{scoring_context:{match_id:rows[0].match_id}}).ok,true);
    assert.equal(x.s('select production_control.late_r3_consumed_fingerprint_v1()'),before);
    const after=rpc(c,x.database,'read_production_calcutta_frozen_2026_v1',{environment:'PRODUCTION',tournament_id:'2026',player_id:'CB01'}).data;
    assert.deepEqual(after.result,original.result);assert.equal(after.freshness.lifecycle_compatible,true);
    assert.equal(x.s("select count(*) from scoring_authority.calcutta_v1_recalculation_jobs where status in('PENDING','RUNNING')"),'0');
  });
  await t.test('financial tampering during canonical writes rolls the whole Round back',()=>{
    const x=scenario();x.s(`create function scoring_authority.test_bad_side_effect() returns trigger language plpgsql as $$begin
      if new.match_id='2026-R3-9' then update scoring_authority.calcutta_v1_auction_fact_revisions set auction_manifest=jsonb_set(auction_manifest,'{pot}','1');end if;return new;end$$;
      create trigger test_bad_side_effect after insert on scoring_authority.match_participants for each row execute function scoring_authority.test_bad_side_effect();`);
    const response=x.rejected(()=>x.all());assert.equal(response.code,'TOURNAMENT_SETUP_LIFECYCLE_PRESERVATION_FAILED');
  });
  await t.test('unfingerprinted frozen-course change invalidates the explicit consumed-input proof',()=>{
    const x=scenario();seedResult(x);assert.equal(x.pair(rows[0]).ok,true);
    const original=x.s("select production_control.calcutta_v1_hash(production_control.calcutta_v1_source_revision('2026'))");
    x.s("update scoring_authority.scoring_snapshots set rating=rating+1 where match_id='2026-R1-1'");
    assert.equal(x.s("select production_control.calcutta_v1_hash(production_control.calcutta_v1_source_revision('2026'))"),original,'legacy global hash omits this frozen input');
    assert.equal(x.s("select production_control.late_r3_result_compatible_v1(result_id,production_control.calcutta_v1_hash(production_control.calcutta_v1_source_revision('2026'))) from scoring_authority.calcutta_v1_result_revisions where is_current"),'f');
  });
  await t.test('real approval 7 → 8 → 9 preserves started R1/R2, refresh history proves R3 neutrality, prepare uses current revision',()=>{
    const x=scenario();seedResult(x);assert.equal(x.pair(rows[0]).ok,true);
    const read=()=>rpc(c,x.database,'read_production_calcutta_frozen_2026_v1',{environment:'PRODUCTION',tournament_id:'2026',player_id:'CB01'}).data;
    const consumed=x.s('select production_control.late_r3_consumed_fingerprint_v1()');
    const financial=x.s('select production_control.late_r3_financial_fingerprint_v1()');
    for(const version of [8,9]) {
      const id=`10000000-0000-4000-8000-00000000000${version}`;
      x.s(`insert into scoring_authority.handicap_revisions(revision_id,tournament_id,revision_number,status,effective_date,method,canonical_fingerprint,roster_fingerprint,predecessor_revision,predecessor_revision_id,context_contract_version,created_by)
        values('${id}','2026',${version},'DRAFT','2026-09-25','isolated test fixture',repeat('a',64),production_control.handicap_v1_roster_fingerprint('2026'),${version-1},(select revision_id from scoring_authority.handicap_revision_current where tournament_id='2026'),'production-handicap-context-v1','test');
        insert into scoring_authority.handicap_revision_entries(revision_id,tournament_id,player_id,tournament_handicap)
          select '${id}','2026',player_id,case when player_id='CB01' then ${version}.46 else tournament_handicap end from scoring_authority.tournament_players where participation_status='ACTIVE';
        update scoring_authority.handicap_revisions set canonical_fingerprint=production_control.handicap_v1_revision_fingerprint('${id}') where revision_id='${id}';`);
      const validation=JSON.parse(x.s(`select production_control.validate_handicap_revision_v1('${id}',${version-1})`));
      assert.equal(validation.valid,true,JSON.stringify(validation));
      const summary=validation.summary;
      const approval=rpc(c,x.database,'approve_production_handicap_revision_v1',scope('APPROVE_PRODUCTION_HANDICAP_REVISION_V1',{
        contract_version:'production-handicap-revision-v1',operation_request_id:randomUUID(),request_payload_hash:'b'.repeat(64),
        revision_id:id,expected_predecessor_revision:version-1,confirmation:{effective_date:'2026-09-25',changed_player_count:summary.changed_player_count,
          affected_match_count:summary.unstarted_refresh_count+summary.started_preserved_count,unstarted_refresh_count:summary.unstarted_refresh_count,started_preserved_count:summary.started_preserved_count}}));
      assert.equal(approval.ok,true,JSON.stringify(approval));assert.deepEqual(approval.refreshed_match_ids,['2026-R3-1']);
      assert.equal(x.s('select production_control.late_r3_consumed_fingerprint_v1()'),consumed);
      assert.equal(x.s('select production_control.late_r3_financial_fingerprint_v1()'),financial);
      assert.equal(read().freshness.lifecycle_compatible,true,'immutable approved refresh chain remains compatible');
      assert.equal(read().freshness.stale,false);
    }
    const prepared=x.call('PREPARE_SCORING_CONTEXT',{scoring_context:{match_id:'2026-R3-1'}});assert.equal(prepared.ok,true,JSON.stringify(prepared));
    assert.equal(x.s("select count(*) from scoring_authority.match_participants where match_id='2026-R3-1' and handicap_revision_id='10000000-0000-4000-8000-000000000009'"),'2');
    assert.equal(x.s("select count(*) from scoring_authority.scoring_snapshots where match_id='2026-R3-1'"),'2','previous snapshot retained');
    assert.equal(x.s('select production_control.late_r3_consumed_fingerprint_v1()'),consumed);
    assert.equal(read().freshness.lifecycle_compatible,true);
    x.s("update scoring_authority.match_participants set course_handicap=course_handicap+1 where match_id='2026-R3-1' and player_id='CB01'");
    assert.equal(read().freshness.lifecycle_compatible,false,'unaudited handicap change is not an approved refresh');
    assert.equal(x.call('PREPARE_SCORING_CONTEXT',{scoring_context:{match_id:'2026-R3-1'}}).changed,false,'canonical no-op remains a no-op');
    assert.equal(read().freshness.lifecycle_compatible,false,'no-op cannot manufacture compatibility');
    assert.equal(x.s("select count(*) from production_control.late_r3_calcutta_compatibility_v1"),'2');
  });
  await t.test('concurrent auction/worker/scoring locks fail closed, no partial setup',async()=>{
    for(const table of ['calcutta_v1_current','calcutta_v1_recalculation_jobs','matches','handicap_revision_current','odds_publication_public_pointer_v1']) {
      const x=scenario();const child=spawn(bin.psql,['-X','-qAt','-d',x.database],{env:environment(c),stdio:['pipe','pipe','pipe']});
      let output='';child.stdout.on('data',d=>{output+=d;});
      child.stdin.write(`begin;lock table scoring_authority.${table} in row exclusive mode;select 'LOCKED';\n`);
      await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('lock handshake timeout')),3000);const check=()=>{if(output.includes('LOCKED')){clearTimeout(timer);resolve();}else setTimeout(check,10);};check();});
      try{x.rejected(()=>x.pair(rows[0]));}finally{child.stdin.end('rollback;\n');await new Promise(resolve=>child.on('exit',resolve));}
    }
  });
  await t.test('competing pairing saves serialize: stale second save fails; exact concurrent retry is idempotent',async()=>{
    for(const exactRetry of [false,true]) {
      const x=scenario();
      const first=x.request('REPLACE_PAIRINGS',{pairings:rows[0]});
      const second=exactRetry?first:x.request('REPLACE_PAIRINGS',{pairings:rows[1]});
      const command=request=>`select public.mutate_production_tournament_setup_v1(${json(request)})::text;`;
      const start=()=>{
        const child=spawn(bin.psql,['-X','-qAt','-v','ON_ERROR_STOP=1','-d',x.database],{env:environment(c),stdio:['pipe','pipe','pipe']});
        let output='',error='';child.stdout.on('data',d=>{output+=d;});child.stderr.on('data',d=>{error+=d;});
        const ended=new Promise(resolve=>child.once('exit',code=>resolve({code,output,error})));
        return {child,ended,output:()=>output};
      };
      const waitFor=async predicate=>{
        const deadline=Date.now()+4000;
        while(!predicate()) {assert.ok(Date.now()<deadline,'concurrent handshake timeout');await new Promise(resolve=>setTimeout(resolve,10));}
      };
      const a=start();let b;
      try {
        a.child.stdin.write(`begin;${command(first)} select 'FIRST_WRITTEN';\n`);
        await waitFor(()=>a.output().includes('FIRST_WRITTEN'));
        assert.equal(JSON.parse(a.output().split('\n')[0]).ok,true);
        b=start();b.child.stdin.end(`set application_name='release-a-competing-save';${command(second)}\n`);
        await waitFor(()=>x.s("select count(*) from pg_stat_activity where application_name='release-a-competing-save' and wait_event='advisory'")==='1');
        a.child.stdin.end('commit;\n');assert.equal((await a.ended).code,0);
        const response=await b.ended;assert.equal(response.code,0,response.error);
        const value=JSON.parse(response.output.trim());
        if(exactRetry)assert.equal(value.idempotent,true);
        else {assert.equal(value.ok,false);assert.match(value.code,/STALE/);}
        assert.equal(x.s('select count(*) from production_control.late_r3_initialization_receipts_v1'),'1');
        assert.equal(x.s("select count(*) from scoring_authority.match_participants where match_id like '2026-R3-%'"),'2');
        assert.equal(x.s('select count(*) from scoring_authority.calcutta_v1_recalculation_jobs'),'0');
      } finally {
        if(a.child.exitCode===null){a.child.stdin.end('rollback;\n');await a.ended;}
        if(b?.child.exitCode===null){b.child.kill('SIGTERM');await b.ended;}
      }
    }
  });
});
