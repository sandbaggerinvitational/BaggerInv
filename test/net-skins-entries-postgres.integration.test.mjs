import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createCluster,destroyCluster,available,fixture,sql,sqlFile,rpc,scope,json,run,environment,bin,actor}
  from './step13e6-production-tournament-setup-postgres.integration.test.mjs';
const file=name=>new URL('../supabase/production_migrations/'+name,import.meta.url).pathname;
test('entry authority: BB/SC/SI, explicit exclusion, history, stale binding, idempotency, security and no side effects',async t=>{
  assert.ok(await available());const c=await createCluster();t.after(()=>destroyCluster(c));const db='skins_entries';
  run(bin.createdb,[db],{env:environment(c)});fixture(c,db);
  for(const name of ['202608300063_production_tournament_setup_v1.sql','202609030083_production_empty_pairings_v1.sql',
    '202609040084_production_starting_hole_retirement_v1.sql','202609090095_production_round_pairings_v1.sql',
    '202609090096_production_round_pairing_read_envelope_v1.sql'])sqlFile(c,db,file(name));
  sql(c,db,'create table scoring_authority.net_skins_configuration_entries(tournament_id text,round_number integer)');
  sql(c,db,`insert into scoring_authority.scoring_snapshots select (jsonb_populate_record(null::scoring_authority.scoring_snapshots,
    to_jsonb(s)||jsonb_build_object('snapshot_id','2026-R2-1:S1','match_id','2026-R2-1','format','SC'))).* from scoring_authority.scoring_snapshots s where snapshot_id='2026-R1-1:S1';
    insert into scoring_authority.matches(match_id,tournament_id,round_number,format,scoring_snapshot_id,status)
      values('2026-R2-1','2026',2,'SC','2026-R2-1:S1','UPCOMING');
    insert into scoring_authority.match_participants select (jsonb_populate_record(null::scoring_authority.match_participants,
      to_jsonb(p)||jsonb_build_object('match_id','2026-R2-1'))).* from scoring_authority.match_participants p where match_id='2026-R1-1';
    insert into scoring_authority.match_participants select (jsonb_populate_record(null::scoring_authority.match_participants,
      to_jsonb(p)||jsonb_build_object('match_id','2026-R3-1'))).* from scoring_authority.match_participants p where match_id='2026-R1-1' and player_slot=1;`);
  const protectedFacts=()=>sql(c,db,`select md5(jsonb_build_object(
    'matches',(select jsonb_agg(to_jsonb(x) order by match_id) from scoring_authority.matches x),
    'participants',(select jsonb_agg(to_jsonb(x) order by match_id,player_id) from scoring_authority.match_participants x),
    'snapshots',(select jsonb_agg(to_jsonb(x) order by snapshot_id) from scoring_authority.scoring_snapshots x),
    'skinConfig',(select jsonb_agg(to_jsonb(x)) from scoring_authority.net_skins_v1_configuration_current x),
    'skinJobs',(select jsonb_agg(to_jsonb(x)) from scoring_authority.net_skins_v1_recalculation_jobs x),
    'calcutta',(select jsonb_agg(to_jsonb(x)) from scoring_authority.calcutta_v1_current x),
    'odds',(select jsonb_agg(to_jsonb(x)) from scoring_authority.odds_publication_current x))::text)`);
  const before=protectedFacts();sqlFile(c,db,file('202609090098_production_net_skins_entries_v1.sql'));assert.equal(protectedFacts(),before);
  const read=()=>rpc(c,db,'read_production_net_skins_entries_v1',scope('READ')).data;
  const round=rn=>read().rounds.find(r=>r.roundNumber===rn);
  const request=(rn,entered=true)=>{const r=round(rn);return scope('SAVE',{round_number:rn,expected_revision:r.revision,
    field_fingerprint:r.fieldFingerprint,operation_request_id:randomUUID(),configured:true,
    entries:r.entrants.map((e,i)=>({key:e.key,bindingFingerprint:e.bindingFingerprint,entered:entered&&i===0}))});};
  const save=x=>rpc(c,db,'save_production_net_skins_entries_v1',x);
  assert.ok(read().rounds.every(r=>r.enteredCount===0&&!r.configured&&r.entrants.every(e=>!e.entered)));
  for(const rn of [1,2,3]){
    const r=round(rn);assert.ok(r.entrants.length>0);assert.equal(r.scope,rn===2?'PAIR':'PLAYER');
    assert.ok(r.entrants.every(e=>e.playerIds.length===(rn===2?2:1)));
    const input=request(rn);assert.equal(save(input).revision,1);assert.equal(save(input).idempotent,true);
    assert.equal(round(rn).enteredCount,1);assert.equal(round(rn).entrants.filter(e=>e.entered).length,1);
    assert.throws(()=>save({...input,entries:input.entries.map(e=>({...e,entered:false}))}),/IDEMPOTENCY_CONFLICT/);
    assert.throws(()=>save({...input,operation_request_id:randomUUID()}),/REVISION_STALE/);
    assert.equal(save(request(rn,false)).revision,2);assert.equal(round(rn).enteredCount,0);
  }
  assert.equal(protectedFacts(),before,'entry registration changes no scoring, pairing, financial or publication facts');
  const dup=request(2);dup.entries=[dup.entries[0],dup.entries[0]];assert.throws(()=>save(dup),/ENTRY_SET_INVALID/);
  const wrong=request(2);wrong.entries[0].bindingFingerprint='0'.repeat(64);assert.throws(()=>save(wrong),/ENTRY_BINDING_INVALID/);
  assert.throws(()=>save({...request(1),tournament_id:'2027'}),/SCOPE|fixture|DIRECTOR|scope/i);
  assert.throws(()=>rpc(c,db,'read_production_net_skins_entries_v1',scope('READ'),{role:'anon'}),/role|AUTH|SERVICE|fixture/i);
  assert.throws(()=>save({...request(1),actor_player_id:'WD01'}),/INVALID|AUTH|DIRECTOR/i);
  assert.equal(sql(c,db,"select has_function_privilege('authenticated','public.save_production_net_skins_entries_v1(jsonb)','execute')"),'f');
  assert.equal(sql(c,db,"select has_table_privilege('service_role','production_control.net_skins_entry_revisions_v1','insert')"),'f');
  assert.throws(()=>sql(c,db,'delete from production_control.net_skins_entry_revisions_v1'),/HISTORY_IMMUTABLE/);
  const r2=round(2);save(request(2));const pending=request(2);const first=r2.entrants[0];
  // Exact canonical pairing history is the invalidator, not a temporary empty table.
  sql(c,db,`insert into production_control.tournament_setup_audit_events_v1(tournament_id,action,target_kind,target_id,
    actor_player_id,actor_auth_user_id,operation_request_id,prior_revision,next_revision,result,safe_metadata)
    values('2026','REPLACE_ROUND_PAIRINGS','ROUND','2026-R2','CB01','${actor.authUserId}','${randomUUID()}',0,1,'CHANGED',
      jsonb_build_object('changedMatches',jsonb_build_array('${first.matchId}')))`);
  assert.equal(round(2).enteredCount,0);assert.equal(round(2).state,'REVIEW_REQUIRED');assert.equal(round(2).staleEntries.length,1);
  assert.throws(()=>save(pending),/PAIRING_STALE/);save(request(2));assert.equal(round(2).state,'ENTRIES_SAVED');
  // Financial/scoring dependencies reject changes without creating a revision.
  const revisionBefore=round(2).revision;
  for(const status of ['PENDING','RUNNING']){
    sql(c,db,`insert into scoring_authority.net_skins_v1_recalculation_jobs values('2026',2,'${status}')`);
    assert.throws(()=>save(request(2)),/DEPENDENCY_BLOCKED/);sql(c,db,'delete from scoring_authority.net_skins_v1_recalculation_jobs');
  }
  sql(c,db,"insert into scoring_authority.net_skins_configuration_entries values('2026',2)");
  assert.throws(()=>save(request(2)),/DEPENDENCY_BLOCKED/);sql(c,db,'delete from scoring_authority.net_skins_configuration_entries');
  sql(c,db,"insert into scoring_authority.net_skins_v1_result_revisions values('2026',2,true)");
  assert.throws(()=>save(request(2)),/DEPENDENCY_BLOCKED/);sql(c,db,'delete from scoring_authority.net_skins_v1_result_revisions');
  assert.equal(round(2).revision,revisionBefore);
  const holder=spawn(bin.psql,['-X','-qAt','-v','ON_ERROR_STOP=1','-d',db],{env:environment(c),stdio:['pipe','pipe','pipe']});
  const held=new Promise((resolve,reject)=>{holder.stdout.on('data',data=>{if(data.toString().includes('LOCKED'))resolve();});holder.on('error',reject);holder.on('exit',code=>{if(code)reject(Error('lock holder failed'));});});
  const exited=new Promise(resolve=>holder.on('exit',resolve));
  holder.stdin.end("begin;select pg_advisory_xact_lock(hashtextextended('production-tournament-setup-v1:2026',0));select 'LOCKED';select pg_sleep(2);commit;");
  await held;const blocked=request(2);
  assert.throws(()=>sql(c,db,`set lock_timeout='100ms';select public.save_production_net_skins_entries_v1(${json(blocked)})`),/lock timeout/);
  assert.equal(round(2).revision,revisionBefore);assert.equal(await exited,0);
  // A genuinely new pair inherits no previous entry.
  sql(c,db,`update scoring_authority.match_participants set player_id='CB03' where match_id='${first.matchId}' and player_id='CB01'`);
  assert.equal(round(2).enteredCount,0);assert.equal(round(2).state,'REVIEW_REQUIRED');
  sql(c,db,`update scoring_authority.match_participants set player_id='CB01' where match_id='${first.matchId}' and player_id='CB03'`);
  const r1before=JSON.stringify(round(1));sql(c,db,"delete from scoring_authority.match_participants where match_id like '2026-R3-%'");
  assert.equal(round(3).entrants.length,0);assert.equal(JSON.stringify(round(1)),r1before);
  assert.throws(()=>save(request(3)),/PAIRINGS_REQUIRED/);
  sql(c,db,"update scoring_authority.matches set status='LIVE' where round_number=1");
  assert.throws(()=>save(request(1)),/DEPENDENCY_BLOCKED/);
  sql(c,db,`insert into scoring_authority.match_participants select (jsonb_populate_record(null::scoring_authority.match_participants,
    to_jsonb(p)||jsonb_build_object('match_id','2026-R3-1'))).* from scoring_authority.match_participants p where match_id='2026-R1-1' and player_slot=1`);
  save(request(3));assert.equal(round(3).enteredCount,1,'R3 entries remain possible after R1 starts');
  assert.equal(sql(c,db,"select count(*) from production_control.net_skins_entry_revisions_v1 where source='DIRECTOR_EXPLICIT_ROUND_ENTRY_V1' and actor_player_id='CB01' and created_at is not null"),'9');
});
