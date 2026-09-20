import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createCluster,destroyCluster,available,fixture,sql,sqlFile,rpc,json,run,environment,bin,actor}
 from './step13e6-production-tournament-setup-postgres.integration.test.mjs';
const root=new URL('../',import.meta.url).pathname;
const mig=root+'supabase/production_migrations/';
function extract(file,signature){const source=readFileSync(file,'utf8');const start=source.indexOf(signature);assert.ok(start>=0,signature);const body=source.slice(start);const d=body.match(/\bas (\$[a-zA-Z0-9_]*\$)/i)[1];return body.slice(0,body.indexOf(d+';',body.indexOf(d)+d.length)+d.length+1);}
const domain=mig+'202608230002_production_final_domain_schema.sql';
function ddl(table){const text=readFileSync(domain,'utf8');const start=text.indexOf(`create table "scoring_authority"."${table}" (`);assert.ok(start>=0,table);return text.slice(start,text.indexOf('\n);',start)+3);}

test('scored resume: real SQL lifecycle, preserved context/history and transactional denials',async t=>{
 assert.ok(await available(),'PostgreSQL 17 required, no skip');
 const c=await createCluster();t.after(()=>destroyCluster(c));const db='scored_resume';
 run(bin.createdb,[db],{env:environment(c)});fixture(c,db);
 for(const n of ['202608300063_production_tournament_setup_v1.sql','202609030083_production_empty_pairings_v1.sql','202609040084_production_starting_hole_retirement_v1.sql'])sqlFile(c,db,mig+n);
 // Replace reduced fixture score/history/archive relations with real Production DDL.
 for(const table of ['hole_scores','score_mutations','score_revision_history','audit_events','google_outbox_events','finalized_scorecard_snapshots']){
  sql(c,db,`drop table scoring_authority.${table}; ${ddl(table)}`);
 }
 for(const table of ['scorecard_archive_jobs','scorecard_archive_checkpoints'])sql(c,db,ddl(table));
 sql(c,db,`alter table scoring_authority.hole_scores add primary key(match_id,hole_number);
 alter table scoring_authority.score_mutations add unique(match_id,mutation_key);
 alter table scoring_authority.scorecard_archive_jobs add unique(match_id,event_type,match_revision);
 alter table scoring_authority.scorecard_archive_checkpoints add unique(match_id);
 drop function production_control.handicap_v1_match_context(text,uuid);`);
 sql(c,db,extract(mig+'202608290058_production_handicap_revisions_v1.sql','create or replace function production_control.handicap_v1_match_context('));
 for(const f of ['segment_winner','match_progress','strokes_on_hole','valid_gross_scores','capture_finalized_scorecard_snapshot','invalidate_finalized_scorecard_snapshot'])sql(c,db,extract(domain,`CREATE OR REPLACE FUNCTION scoring_authority.${f}(`));
 for(const f of ['public.submit_production_hole_score.sql','public.finalize_production_match.sql','public.reopen_production_match.sql'])sqlFile(c,db,root+'test/fixtures/scored-resume-baseline/'+f);
 sqlFile(c,db,root+'candidates/access-readiness.sql');
 const installationBefore=sql(c,db,`select jsonb_build_object('matches',(select jsonb_agg(to_jsonb(x) order by match_id) from scoring_authority.matches x),'participants',(select jsonb_agg(to_jsonb(x) order by match_id,player_id) from scoring_authority.match_participants x),'snapshots',(select jsonb_agg(to_jsonb(x) order by snapshot_id) from scoring_authority.scoring_snapshots x));`);
 sqlFile(c,db,root+'candidates/scored-match-resume.sql');
 assert.equal(sql(c,db,`select jsonb_build_object('matches',(select jsonb_agg(to_jsonb(x) order by match_id) from scoring_authority.matches x),'participants',(select jsonb_agg(to_jsonb(x) order by match_id,player_id) from scoring_authority.match_participants x),'snapshots',(select jsonb_agg(to_jsonb(x) order by snapshot_id) from scoring_authority.scoring_snapshots x));`),installationBefore,'function installation is inert');
 // Actual deployed actor guard, with synthetic confirmed identity/link/roles.
 sql(c,db,`alter table auth.users add column email_confirmed_at timestamptz default now();
 create table participant_identity.user_player_links(auth_user_id uuid,player_id text,status text,revoked_at timestamptz);
 create table participant_identity.participant_auth_identifiers(auth_user_id uuid,player_id text,identifier_type text,status text);
 create table participant_identity.tournament_roles(tournament_id text,auth_user_id uuid,role text,role_active boolean,revoked_at timestamptz);
 create table production_control.director_entitlements(auth_user_id uuid,tournament_id text,player_id text,role text,status text,revoked_at timestamptz);
 insert into participant_identity.user_player_links values('${actor.authUserId}','CB01','ACTIVE',null);
 insert into participant_identity.participant_auth_identifiers values('${actor.authUserId}','CB01','EMAIL','VERIFIED');
 insert into participant_identity.tournament_roles values('2026','${actor.authUserId}','DIRECTOR',true,null),('2026','${actor.authUserId}','PARTICIPANT',true,null);
 insert into production_control.director_entitlements values('${actor.authUserId}','2026','CB01','DIRECTOR','ACTIVE',null);`);
 sqlFile(c,db,root+'test/fixtures/scored-resume-baseline/production_control.assert_production_scoring_actor.sql');
 // Only local synthetic opponents. No actual R3 pairing recommendation/data.
 sql(c,db,`delete from scoring_authority.match_participants; delete from scoring_authority.scoring_permissions;
 delete from scoring_authority.match_holes; delete from scoring_authority.game_center_presentations;
 delete from scoring_authority.matches where match_id<>'2026-R1-1';
 delete from scoring_authority.scoring_snapshots where snapshot_id<>'2026-R1-1:S1';
 insert into scoring_authority.scoring_snapshots select '2026-R'||r||'-1:S1',tournament_id,'2026-R'||r||'-1',snapshot_revision,scoring_rules_version,
 case r when 2 then 'SC' else 'SI' end,1,course_id,tee,rating,slope,par,match_netting_baseline,hole_definitions,
 '{"team_1":[],"team_2":[]}','{}',effective_at,imported_at,canonical_hash,handicap_revision_id
 from scoring_authority.scoring_snapshots cross join generate_series(2,3)r;
 insert into scoring_authority.matches(match_id,tournament_id,round_number,format,scoring_snapshot_id,status)
 select '2026-R'||r||'-1','2026',r,case r when 2 then 'SC' else 'SI' end,'2026-R'||r||'-1:S1','UPCOMING' from generate_series(2,3)r;
 insert into scoring_authority.match_participants(match_id,player_id,team_side,player_slot,tournament_handicap,handicap_index,course_handicap,playing_handicap,final_strokes,handicap_revision_id)
 select m.match_id,case s when 1 then 'CB0' else 'WD0' end||p,s,p,5,5,5,0,0,'10000000-0000-4000-8000-000000000001'
 from scoring_authority.matches m cross join generate_series(1,2)s cross join generate_series(1,2)p where m.format<>'SI' or p=1;
 update scoring_authority.handicap_revision_entries set tournament_handicap=case player_id when 'CB01' then -1.2 when 'CB02' then 17.8 when 'WD01' then 8.3 else 26.4 end;
 do $$declare m text;ctx jsonb;begin for m in select match_id from scoring_authority.matches loop
 ctx:=production_control.handicap_v1_match_context(m,'10000000-0000-4000-8000-000000000001');
 update scoring_authority.match_participants p set tournament_handicap=(v->>'tournament_handicap')::numeric,handicap_index=(v->>'handicap_index')::numeric,
 course_handicap=(v->>'course_handicap')::numeric,playing_handicap=(v->>'playing_handicap')::numeric,final_strokes=(v->>'final_strokes')::integer
 from jsonb_array_elements(ctx->'participants')v where p.match_id=m and p.player_id=v->>'player_id';
 update scoring_authority.scoring_snapshots set participant_configuration=ctx->'participant_configuration',team_configuration=ctx->'team_configuration' where match_id=m;
 end loop;end$$;
 insert into scoring_authority.scoring_permissions select match_id,player_id,false,1,now(),now() from scoring_authority.match_participants;
 insert into scoring_authority.match_holes select match_id,n,snapshot_id,n,4,400 from scoring_authority.scoring_snapshots cross join generate_series(1,18)n;
 insert into scoring_authority.game_center_presentations(match_id,tournament_id,match_sort_order,display_match_number,source_workbook_id,source_payload_hash,imported_by)
 select match_id,'2026',round_number,match_id,'workbook-production',repeat('a',64),'local-test' from scoring_authority.matches;`);
 let key=0;
 const inp=(match,operation)=>{const r=JSON.parse(sql(c,db,`select to_jsonb(m) from scoring_authority.matches m where match_id='${match}';`));return {environment:'PRODUCTION',project_ref:'ymqhhtxaywtqllynrmxe',project_url:'https://ymqhhtxaywtqllynrmxe.supabase.co',source_workbook_id:'workbook-production',tournament_id:'2026',operation,match_id:match,mutation_key:'resume-test-'+(++key),expected_match_revision:r.match_revision,authorization:{tournament_id:'2026',match_id:match,player_id:actor.playerId,auth_user_id:actor.authUserId,permission_revision:r.permission_revision,role:'DIRECTOR'}};};
 const control=(m,op)=>rpc(c,db,'mutate_production_match_control',inp(m,op));
 const score=(m,h)=>{const i=inp(m);i.authorization.role='PLAYER';return rpc(c,db,'submit_production_hole_score',{...i,hole_number:h,expected_hole_revision:0,team_1_gross_scores:m.includes('R1')?[4,5]:[4],team_2_gross_scores:m.includes('R1')?[5,6]:[5]});};
 const ready=m=>JSON.parse(sql(c,db,`select production_control.assert_production_match_scoring_ready_v1('${m}');`));
 const preserve=m=>sql(c,db,`select jsonb_build_object('context',production_control.match_resume_context_hash_v1('${m}'),'scores',(select jsonb_agg(to_jsonb(s) order by hole_number) from scoring_authority.hole_scores s where match_id='${m}'),'history',(select jsonb_agg(to_jsonb(s) order by next_match_revision) from scoring_authority.score_mutations s where match_id='${m}' and mutation_type='HOLE_SCORE'));`);
 const attemptSQL=i=>`select public.mutate_production_match_control(${json(i)});`;
 await t.test('initial activation stays strict for stale or incomplete context',()=>{
  for(const setup of ["update scoring_authority.scoring_snapshots set handicap_revision_id=null where match_id='2026-R1-1';",
   "delete from scoring_authority.match_holes where match_id='2026-R1-1' and hole_number=1;",
   "update scoring_authority.match_participants set final_strokes=99 where match_id='2026-R1-1';"]){
   for(const op of ['ACCESS_ACTIVATE','SCORING_UNLOCK']){
    const r=JSON.parse(sql(c,db,`begin;${setup}${attemptSQL(inp('2026-R1-1',op))}rollback;`));
    assert.equal(r.code,'PRODUCTION_MATCH_NOT_SCORING_READY');assert.equal(r.ok,false);
   }
  }
 });
 for(const round of [1,2,3])await t.test(`R${round} canonical READY → Live → Activate → score → Lock → Unlock → continue → Finalize`,()=>{
  const m=`2026-R${round}-1`;
  assert.equal(ready(m).ready,true,JSON.stringify(ready(m)));
  // Either permitted opening order remains resumable; no score is written in this rollback.
  const first=inp(m,'ACCESS_ACTIVATE');
  const second={...first,operation:'MARK_LIVE',mutation_key:'order-live-'+round,expected_match_revision:first.expected_match_revision+1,authorization:{...first.authorization,permission_revision:first.authorization.permission_revision+1}};
  const lockFirst={...second,operation:'SCORING_LOCK',mutation_key:'order-lock-'+round,expected_match_revision:second.expected_match_revision+1};
  const unlockFirst={...lockFirst,operation:'SCORING_UNLOCK',mutation_key:'order-unlock-'+round,expected_match_revision:lockFirst.expected_match_revision+1,authorization:{...lockFirst.authorization,permission_revision:lockFirst.authorization.permission_revision+1}};
  const order=sql(c,db,`begin;${attemptSQL(first)}${attemptSQL(second)}${attemptSQL(lockFirst)}${attemptSQL(unlockFirst)}rollback;`).split('\n').map(JSON.parse);
  assert.ok(order.every(x=>x.ok),JSON.stringify(order));
  assert.equal(control(m,'MARK_LIVE').ok,true);
  const activate=control(m,'ACCESS_ACTIVATE');assert.equal(activate.ok,true,JSON.stringify(activate));assert.match(activate.scoring_context_hash,/^[a-f0-9]{64}$/);
  const authority=activate.scoring_context_hash;
  assert.equal(score(m,1).ok,true);
  const pre=preserve(m);assert.equal(control(m,'SCORING_LOCK').ok,true);assert.equal(preserve(m),pre);
  assert.equal(score(m,2).ok,false,'assigned participant cannot score while locked/revoked');
  assert.equal(ready(m).ready,false,'strict initial readiness remains false for scored match');
  const staleScore={...inp(m),hole_number:2,expected_hole_revision:0,team_1_gross_scores:m.includes('R1')?[4,5]:[4],team_2_gross_scores:m.includes('R1')?[5,6]:[5]};staleScore.authorization.role='PLAYER';
  const resume=control(m,'SCORING_UNLOCK');assert.equal(resume.ok,true,JSON.stringify(resume));assert.equal(resume.scoring_context_hash,authority);assert.equal(preserve(m),pre);
  assert.equal(rpc(c,db,'submit_production_hole_score',staleScore).code,'PERMISSION_STALE','old queued participant request cannot cross pause/resume');
  assert.equal(score(m,2).ok,true);
  assert.equal(control(m,'ACCESS_REVOKE').ok,true);assert.equal(score(m,3).ok,false,'revoked participant cannot score');
  const post=preserve(m);assert.equal(control(m,'ACCESS_ACTIVATE').ok,true);assert.equal(preserve(m),post);
  for(let h=3;h<=18;h++)assert.equal(score(m,h).ok,true);
  // Completed-but-not-final can also pause/resume before finalization.
  assert.equal(control(m,'SCORING_LOCK').ok,true);assert.equal(control(m,'SCORING_UNLOCK').ok,true);
  const finalizeInput=inp(m);finalizeInput.authorization.role='PLAYER';const final=rpc(c,db,'finalize_production_match',finalizeInput);assert.equal(final.ok,true,JSON.stringify(final));
  assert.equal(control(m,'SCORING_UNLOCK').code,'MATCH_FINAL');assert.equal(control(m,'ACCESS_ACTIVATE').code,'MATCH_FINAL');
  const reopen=JSON.parse(sql(c,db,`begin;select public.reopen_production_match(${json(inp(m))});rollback;`));
  assert.equal(reopen.ok,true,JSON.stringify(reopen));
  assert.equal(sql(c,db,`select count(*) from scoring_authority.hole_scores where match_id='${m}';`),'18');
  assert.equal(sql(c,db,`select production_control.match_resume_context_hash_v1('${m}');`),authority);
 });
 // Restore R1 to a captured local paused prefix without touching other rehearsal formats.
 // Each negative runs in its own rollback; this is fixture preparation, not a resume implementation.
 sql(c,db,`delete from scoring_authority.scorecard_archive_jobs; delete from scoring_authority.scorecard_archive_checkpoints;delete from scoring_authority.finalized_scorecard_snapshots where match_id='2026-R1-1';
 update scoring_authority.matches set status='LIVE',finalized_at=null where match_id='2026-R1-1';`);
 // Build a fresh branch by restoring the actual first lock before-state and retaining its history prefix.
 sql(c,db,`do $$declare state jsonb;rev bigint;begin
 select after_state->'match',next_match_revision into state,rev from scoring_authority.score_revision_history where match_id='2026-R1-1' and action='SCORING_LOCKED' order by next_match_revision limit 1;
 delete from scoring_authority.hole_scores where match_id='2026-R1-1' and hole_number>1;
 delete from scoring_authority.score_mutations where match_id='2026-R1-1' and next_match_revision>rev;
 delete from scoring_authority.score_revision_history where match_id='2026-R1-1' and next_match_revision>rev;
 delete from scoring_authority.matches where match_id='2026-R1-1';insert into scoring_authority.matches select * from jsonb_populate_record(null::scoring_authority.matches,state);
 update scoring_authority.scoring_permissions set can_score=false,revoked_at=now(),permission_revision=(state->>'permission_revision')::bigint where match_id='2026-R1-1';end$$;`);
 const m='2026-R1-1';
 const negative=(setup,i=inp(m,'SCORING_UNLOCK'))=>JSON.parse(sql(c,db,`begin; ${setup} ${attemptSQL(i)} rollback;`));
 await t.test('paused local prefix valid; initial strict guard still rejects',()=>{const r=negative('');assert.equal(r.ok,true,JSON.stringify(r));assert.equal(ready(m).ready,false);});
 const cases={
 'stale handicap pointer':"update scoring_authority.handicap_revision_current set revision_id='99999999-9999-4999-8999-999999999999';",
 'changed assignments':"update scoring_authority.match_participants set player_id='CB03' where match_id='2026-R1-1' and player_id='CB01';",
 'changed strokes':"update scoring_authority.match_participants set final_strokes=final_strokes+1 where match_id='2026-R1-1';",
 'changed course':"update scoring_authority.scoring_snapshots set course_id='COURSE-2' where match_id='2026-R1-1';",
 'changed tee':"update scoring_authority.scoring_snapshots set tee='Other' where match_id='2026-R1-1';",
 'changed hole allocation':"update scoring_authority.match_holes set stroke_index=19-stroke_index where match_id='2026-R1-1';",
 'changed approved numeric value':"update scoring_authority.handicap_revision_entries set tournament_handicap=3 where player_id='CB01';",
 'conflicting correction':"update scoring_authority.matches set unresolved_mutations=1 where match_id='2026-R1-1';",
 'conflicting lease':"insert into scoring_authority.scoring_ingress_leases(tournament_id,match_id,expires_at)values('2026','2026-R1-1',now()+interval '1 minute');",
 'missing receipt':"delete from scoring_authority.score_mutations where match_id='2026-R1-1' and mutation_type='ACCESS_ACTIVATE';",
 'missing history':"delete from scoring_authority.score_revision_history where match_id='2026-R1-1' and action='HOLE_SCORE_UPSERTED';",
 'missing score':"delete from scoring_authority.hole_scores where match_id='2026-R1-1';",
 'altered score':"update scoring_authority.hole_scores set team_1_gross_scores='[8,9]' where match_id='2026-R1-1';",
 'altered score revision':"update scoring_authority.hole_scores set hole_revision=3 where match_id='2026-R1-1';",
 'altered match progress':"update scoring_authority.matches set scored_holes=2 where match_id='2026-R1-1';",
 'reopened correction':"update scoring_authority.score_mutations set mutation_type='REOPEN' where match_id='2026-R1-1' and mutation_type='SCORING_LOCK';",
 'no pre-score authority binding':"update scoring_authority.score_mutations set result=result-'scoring_context_hash' where match_id='2026-R1-1';"
 };
 for(const [name,setup] of Object.entries(cases))await t.test(`${name} denies resume, lock/revoke still work`,()=>{
   const r=negative(setup);assert.equal(r.ok,false,JSON.stringify(r));assert.equal(r.code,'PRODUCTION_MATCH_NOT_RESUME_READY');
   for(const op of ['SCORING_LOCK','ACCESS_REVOKE'])assert.equal(negative(setup,inp(m,op)).ok,true,op);
 });
 for(const [name,setup] of Object.entries({
 'revoked Director entitlement':"update production_control.director_entitlements set status='REVOKED';",
 'revoked identity link':"update participant_identity.user_player_links set status='REVOKED';",
 'removed participant membership':"update scoring_authority.tournament_players set participation_status='INACTIVE' where player_id='CB01';",
 'unconfirmed identity':"update auth.users set email_confirmed_at=null;"
 }))await t.test(name,()=>assert.throws(()=>negative(setup),/AUTHORIZATION_REQUIRED/));
 for(const field of ['expected_match_revision','permission_revision'])await t.test(`stale ${field}`,()=>{const i=inp(m,'SCORING_UNLOCK');if(field==='permission_revision')i.authorization[field]--;else i[field]--;assert.equal(negative('',i).ok,false);});
 await t.test('wrong Director/tournament fails closed',()=>{for(const f of ['director','tournament']){const i=inp(m,'SCORING_UNLOCK');if(f==='director')i.authorization.role='PLAYER';else i.tournament_id='2025';assert.throws(()=>negative('',i),/DIRECTOR|SCOPE/);}});
 await t.test('replay cannot regrant after later lock',()=>{const i=inp(m,'SCORING_UNLOCK');const lock={...i,operation:'SCORING_LOCK',mutation_key:'later-lock',expected_match_revision:i.expected_match_revision+1,authorization:{...i.authorization,permission_revision:i.authorization.permission_revision+1}};const out=sql(c,db,`begin;${attemptSQL(i)}${attemptSQL(lock)}${attemptSQL(i)}rollback;`).split('\n').map(JSON.parse);assert.equal(out[0].ok,true);assert.equal(out[1].ok,true);assert.equal(out[2].ok,false);});
 await t.test('failure after readiness rolls back entire access mutation',()=>{sql(c,db,`create function public.test_resume_failure()returns trigger language plpgsql as $$begin raise exception 'INJECTED';end$$;create trigger test_resume_failure before insert on scoring_authority.score_mutations for each row execute function public.test_resume_failure();`);const pre=sql(c,db,`select to_jsonb(m) from scoring_authority.matches m where match_id='${m}';`);assert.throws(()=>control(m,'SCORING_UNLOCK'),/INJECTED/);assert.equal(sql(c,db,`select to_jsonb(m) from scoring_authority.matches m where match_id='${m}';`),pre);sql(c,db,'drop trigger test_resume_failure on scoring_authority.score_mutations;drop function public.test_resume_failure();');});
 await t.test('helper cannot be executed by application/participant roles',()=>{assert.equal(sql(c,db,`select has_function_privilege('anon','production_control.assert_production_match_resume_ready_v1(text)','execute') or has_function_privilege('authenticated','production_control.match_scoring_context_readiness_v1(text,boolean)','execute') or has_function_privilege('service_role','production_control.match_resume_context_hash_v1(text)','execute');`),'f');});
 await t.test('resume holds row lock through commit; concurrent scoring cannot cross it',async()=>{
  const i=inp(m,'SCORING_UNLOCK');
  let release;const started=new Promise(resolve=>release=resolve);
  const p=spawn(bin.psql,['-X','-qAt','-v','ON_ERROR_STOP=1','-d',db],{env:environment(c),stdio:['pipe','pipe','pipe']});let err='';p.stderr.on('data',b=>err+=b);p.stdout.on('data',b=>{if(b.toString().includes('RESUME_LOCK'))release();});const done=new Promise((resolve,reject)=>p.on('close',code=>code?reject(new Error(err)):resolve()));
  p.stdin.end(`begin;${attemptSQL(i)}select 'RESUME_LOCK';select pg_sleep(1);rollback;`);await started;
  const input={...inp(m),hole_number:2,expected_hole_revision:0,team_1_gross_scores:[4,5],team_2_gross_scores:[5,6]};
  assert.throws(()=>sql(c,db,`begin;set local lock_timeout='100ms';select public.submit_production_hole_score(${json(input)});rollback;`),/lock timeout/);await done;
 });
 await t.test('concurrent Director score commits first; stale activation cannot grant access',async()=>{
  assert.equal(control(m,'SCORING_UNLOCK').ok,true);assert.equal(control(m,'ACCESS_REVOKE').ok,true);
  const activation=inp(m,'ACCESS_ACTIVATE');
  const scoreInput={...inp(m),hole_number:2,expected_hole_revision:0,team_1_gross_scores:[4,5],team_2_gross_scores:[5,6]};
  const p=spawn(bin.psql,['-X','-qAt','-v','ON_ERROR_STOP=1','-d',db],{env:environment(c),stdio:['pipe','pipe','pipe']});
  let signal;const start=new Promise(r=>signal=r);let output='';p.stdout.on('data',b=>{output+=b;if(b.toString().includes('SCORE_HELD'))signal();});
  const done=new Promise((r,j)=>p.on('close',code=>code?j(new Error('score writer failed')):r()));
  p.stdin.end(`begin;select public.submit_production_hole_score(${json(scoreInput)});select 'SCORE_HELD';select pg_sleep(1);commit;`);await start;
  const result=rpc(c,db,'mutate_production_match_control',activation);await done;
  assert.equal(JSON.parse(output.split('\n')[0]).ok,true);assert.equal(result.code,'MATCH_REVISION_CONFLICT');
  assert.equal(sql(c,db,`select count(*) from scoring_authority.scoring_permissions where match_id='${m}' and can_score;`),'0');
 });
 await t.test('concurrent authority writer commits first; waiting resume denies',async()=>{
  const p=spawn(bin.psql,['-X','-qAt','-v','ON_ERROR_STOP=1','-d',db],{env:environment(c),stdio:['pipe','pipe','pipe']});let signal;const start=new Promise(r=>signal=r);p.stdout.on('data',b=>{if(b.toString().includes('AUTHORITY_LOCK'))signal();});const done=new Promise((r,j)=>p.on('close',code=>code?j(new Error('writer failed')):r()));
  p.stdin.end(`begin;select match_id from scoring_authority.matches where match_id='${m}' for update;select 'AUTHORITY_LOCK';select pg_sleep(1);update scoring_authority.match_participants set final_strokes=final_strokes+1 where match_id='${m}';commit;`);await start;
  const r=control(m,'SCORING_UNLOCK');await done;assert.equal(r.ok,false);assert.equal(r.code,'PRODUCTION_MATCH_NOT_RESUME_READY');
 });
});
