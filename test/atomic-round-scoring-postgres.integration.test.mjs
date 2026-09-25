import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createCluster,destroyCluster,available,fixture,sql,sqlFile,rpc,json,run,environment,bin,actor}
 from './step13e6-production-tournament-setup-postgres.integration.test.mjs';
const root=new URL('../',import.meta.url).pathname;
const mig=root+'supabase/production_migrations/';
function extract(file,signature){const source=readFileSync(file,'utf8');const start=source.indexOf(signature);assert.ok(start>=0,signature);const body=source.slice(start);const d=body.match(/\bas (\$[a-zA-Z0-9_]*\$)/i)[1];return body.slice(0,body.indexOf(d+';',body.indexOf(d)+d.length)+d.length+1);}
const domain=mig+'202608230002_production_final_domain_schema.sql';
function ddl(table){const text=readFileSync(domain,'utf8');const start=text.indexOf(`create table "scoring_authority"."${table}" (`);assert.ok(start>=0,table);return text.slice(start,text.indexOf('\n);',start)+3);}

test('atomic round scoring: installed lifecycle contracts and isolated transaction acceptance',async t=>{
 assert.ok(await available(),'PostgreSQL 17 required, no skip');
 const c=await createCluster();t.after(()=>destroyCluster(c));let db='round_scoring';
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
 sql(c,db,`delete from scoring_authority.match_participants;delete from scoring_authority.scoring_permissions;delete from scoring_authority.match_holes;delete from scoring_authority.game_center_presentations;
 delete from scoring_authority.matches;delete from scoring_authority.scoring_snapshots where snapshot_id<>'2026-R1-1:S1';
 delete from scoring_authority.tournament_players;delete from scoring_authority.handicap_revision_entries;
 insert into scoring_authority.players select side||lpad(n::text,2,'0'),'Synthetic '||side||n,'{}' from unnest(array['CB','WD'])side cross join generate_series(1,12)n on conflict do nothing;
 insert into scoring_authority.tournament_players(tournament_id,player_id,team_id,team_side,participation_status,source_roster_key)
 select '2026',side||lpad(n::text,2,'0'),case side when 'CB' then 'TEAM1' else 'TEAM2' end,case side when 'CB' then 1 else 2 end,'ACTIVE',side||n from unnest(array['CB','WD'])side cross join generate_series(1,12)n;
 update scoring_authority.tournament_players t set team_id=(select team_id from scoring_authority.teams where team_side=t.team_side limit 1);
 insert into scoring_authority.handicap_revision_entries select '10000000-0000-4000-8000-000000000001','2026',player_id,(row_number() over(order by player_id)*1.1)-2 from scoring_authority.tournament_players;
 create table scoring_authority.handicap_revisions(revision_id uuid primary key,revision_number integer);
 insert into scoring_authority.handicap_revisions values('10000000-0000-4000-8000-000000000001',13);
 create temp table template_snapshot as select * from scoring_authority.scoring_snapshots;
 delete from scoring_authority.scoring_snapshots;
 insert into scoring_authority.scoring_snapshots select '2026-R'||r||'-'||n||':S1',tournament_id,'2026-R'||r||'-'||n,snapshot_revision,scoring_rules_version,
 case r when 1 then 'BB' when 2 then 'SC' else 'SI' end,case r when 1 then 0.9 else 1 end,course_id,tee,rating,slope,par,match_netting_baseline,hole_definitions,
 '{"team_1":[],"team_2":[]}','{}',effective_at,imported_at,canonical_hash,handicap_revision_id
 from template_snapshot cross join generate_series(1,3)r cross join lateral generate_series(1,case r when 3 then 12 else 6 end)n;
 insert into scoring_authority.matches(match_id,tournament_id,round_number,format,scoring_snapshot_id,status)
 select match_id,'2026',substring(split_part(match_id,'-',2) from 2)::integer,format,snapshot_id,'UPCOMING' from scoring_authority.scoring_snapshots;
 `);
 sql(c,db,`insert into scoring_authority.match_participants(match_id,player_id,team_side,player_slot,tournament_handicap,handicap_index,course_handicap,playing_handicap,final_strokes,handicap_revision_id)
 select m.match_id,case s when 1 then 'CB' else 'WD' end||lpad((case when m.format='SI' then split_part(m.match_id,'-',3)::integer else 2*(split_part(m.match_id,'-',3)::integer-1)+p end)::text,2,'0'),s,p,5,5,5,0,0,'10000000-0000-4000-8000-000000000001'
 from scoring_authority.matches m cross join generate_series(1,2)s cross join generate_series(1,2)p where m.format<>'SI' or p=1;
 do $$declare m text;ctx jsonb;begin for m in select match_id from scoring_authority.matches loop
 ctx:=production_control.handicap_v1_match_context(m,'10000000-0000-4000-8000-000000000001');
 update scoring_authority.match_participants p set tournament_handicap=(v->>'tournament_handicap')::numeric,handicap_index=(v->>'handicap_index')::numeric,course_handicap=(v->>'course_handicap')::numeric,playing_handicap=(v->>'playing_handicap')::numeric,final_strokes=(v->>'final_strokes')::integer from jsonb_array_elements(ctx->'participants')v where p.match_id=m and p.player_id=v->>'player_id';
 update scoring_authority.scoring_snapshots set participant_configuration=ctx->'participant_configuration',team_configuration=ctx->'team_configuration' where match_id=m;end loop;end$$;
 insert into scoring_authority.scoring_permissions select match_id,player_id,false,1,now(),now() from scoring_authority.match_participants;
 insert into scoring_authority.match_holes select match_id,n,snapshot_id,n,4,400 from scoring_authority.scoring_snapshots cross join generate_series(1,18)n;
 insert into scoring_authority.game_center_presentations(match_id,tournament_id,match_sort_order,display_match_number,source_workbook_id,source_payload_hash,imported_by) select match_id,'2026',round_number,match_id,'workbook-production',repeat('a',64),'local-test' from scoring_authority.matches;`);
 sql(c,db,`insert into scoring_authority.tournament_setup_course_tees_v1(tournament_id,course_id,tee_id,display_name,rating,slope,par,setup_revision,updated_by_player_id)values('2026','COURSE-1','Tournament','Course One',72,120,72,1,'CB01');
 insert into scoring_authority.tournament_setup_course_holes_v1 select '2026','COURSE-1','Tournament',n,4,n,400,1 from generate_series(1,18)n;
 insert into scoring_authority.tournament_setup_round_courses_v1(tournament_id,round_number,course_id,tee_id,setup_revision,updated_by_player_id)select '2026',r,'COURSE-1','Tournament',1,'CB01' from generate_series(1,3)r;`);
 // Use fresh hosted definitions verbatim, not a replacement round-specific match implementation.
 for(const f of ['production_control.match_scoring_context_readiness_v1','production_control.match_resume_context_hash_v1','production_control.assert_production_match_scoring_ready_v1','production_control.assert_production_match_resume_ready_v1','public.mutate_production_match_control'])sqlFile(c,db,root+'test/fixtures/round-scoring-installed/'+f+'.sql');
 // Retain the installed first-write audit trigger in lifecycle tests. The
 // earlier reduced fixture omitted it and could not detect self-invalidating
 // activation bookkeeping. The exact full runtime guard is also exercised by
 // the incident's isolated capture/replay (no real match operations).
 sql(c,db,`create table production_control.cutover_activation_state(
 scope_key text primary key,state text,current_authority text,scoring_ingress_enabled boolean,
 authority_generation_id uuid,activation_revision bigint,first_supabase_write_observed_at timestamptz,
 first_supabase_mutation_key text,first_supabase_match_id text,first_supabase_match_revision bigint,updated_at timestamptz);
 insert into production_control.cutover_activation_state values('BAGGER_INV_PRODUCTION','SCORING_COMMITTED','SUPABASE',true,'30000000-0000-4000-8000-000000000001',234,null,null,null,null,now());
 create table scoring_authority.ingress_gates(tournament_id text,state text,authority text,active_epoch_id uuid);
 insert into scoring_authority.ingress_gates values('2026','OPEN','SUPABASE','30000000-0000-4000-8000-000000000001');
 create table production_control.operation_audit_events(event_type text,domain text,tournament_id text,actor text,request_fingerprint text,result text,details jsonb);
 alter function production_control.assert_production_scoring_runtime(jsonb,text) rename to fixture_scoring_scope_before_first_write;
 create function production_control.assert_production_scoring_runtime(input jsonb,required_worker text default null) returns void language plpgsql as $$begin
 perform production_control.fixture_scoring_scope_before_first_write(input,required_worker);
 if (select activation_revision from production_control.cutover_activation_state where scope_key='BAGGER_INV_PRODUCTION')<>234 then
 raise exception using errcode='55000',message='PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_REQUIRED';end if;end$$;`);
 sqlFile(c,db,mig+'202609250118_production_first_write_audit_revision_v1.sql');
 sql(c,db,`create trigger capture_first_production_canonical_write after insert on scoring_authority.score_mutations for each row execute function production_control.capture_first_production_canonical_write();`);
 const tables=['matches','scoring_permissions','hole_scores','score_mutations','score_revision_history','audit_events','google_outbox_events'];
 const digest=()=>sql(c,db,`select jsonb_build_array(${tables.map(n=>`(select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),'[]') from scoring_authority.${n} x)`).join(',')});`);
 const beforeInstall=digest();sqlFile(c,db,mig+'202609220108_atomic_round_scoring_v1.sql');assert.equal(digest(),beforeInstall);
 const scope={environment:'PRODUCTION',project_ref:'ymqhhtxaywtqllynrmxe',project_url:'https://ymqhhtxaywtqllynrmxe.supabase.co',source_workbook_id:'workbook-production',tournament_id:'2026',authorization:{tournament_id:'2026',player_id:actor.playerId,auth_user_id:actor.authUserId,role:'DIRECTOR'}};
 let seq=0;const uid=()=>`20000000-0000-4000-8000-${String(++seq).padStart(12,'0')}`;
 const state=r=>rpc(c,db,'read_production_round_scoring_v1',{...scope,round:r}).data;
 const input=(r,op)=>({...scope,round:r,operation:op,operation_id:uid(),expected_fingerprint:state(r).fingerprint});
 const statement=i=>`select public.mutate_production_round_scoring_v1(${json(i)});`;
 const call=i=>rpc(c,db,'mutate_production_round_scoring_v1',i);
 const negative=(setup,r=1,op='OPEN')=>{
   const old=digest();const i=input(r,op);
   const check=`select md5(jsonb_build_array(${tables.map(n=>`(select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),'[]') from scoring_authority.${n} x)`).join(',')})::text);`;
   const lines=sql(c,db,`begin;${setup}${check}select public.mutate_production_round_scoring_v1(${json(i)}||jsonb_build_object('expected_fingerprint',production_control.round_scoring_state_v1(${r})->>'fingerprint'));${check}rollback;`).split('\n');assert.equal(lines[0],lines.at(-1),'denial changed zero records before rollback');const result=JSON.parse(lines[1]);
   assert.equal(result.ok,false,JSON.stringify(result));assert.equal(digest(),old);return result;
 };
 const individual=(m,op)=>{const row=JSON.parse(sql(c,db,`select to_jsonb(m) from scoring_authority.matches m where match_id='${m}'`));return {...scope,match_id:m,operation:op,mutation_key:'individual-'+uid(),expected_match_revision:row.match_revision,authorization:{...scope.authorization,match_id:m,permission_revision:row.permission_revision}};};
 const ctrl=(m,op)=>rpc(c,db,'mutate_production_match_control',individual(m,op));
 const score=(m,h)=>{const i=individual(m);return rpc(c,db,'submit_production_hole_score',{...i,authorization:{...i.authorization,role:'PLAYER'},hole_number:h,expected_hole_revision:0,team_1_gross_scores:m.includes('R1')?[4,5]:[4],team_2_gross_scores:m.includes('R1')?[5,6]:[5]});};
 const preserve=()=>sql(c,db,`select jsonb_build_object('scores',(select jsonb_agg(to_jsonb(s) order by match_id,hole_number) from scoring_authority.hole_scores s),'context',(select jsonb_agg(to_jsonb(s) order by snapshot_id) from scoring_authority.scoring_snapshots s),'results',(select jsonb_agg(jsonb_build_array(match_id,running_result,result_winner,scored_holes) order by match_id)from scoring_authority.matches));`);
 const visuals={pristine:state(1),r3:state(3)};
 const pristine=digest();run(bin.createdb,['-T',db,'round_pristine'],{env:environment(c)});
 await t.test('historical first-write trigger reproduces atomic abort without partial state',()=>{
 const old=extract(mig+'202608240019_production_cutover_activation.sql','create or replace function production_control.capture_first_production_canonical_write()');
 const i=input(1,'OPEN');const rows=sql(c,db,`begin;${old}${statement(i)}select activation_revision from production_control.cutover_activation_state;select count(*) from production_control.operation_audit_events;select count(*) from scoring_authority.score_mutations;rollback;`).split('\n');
 assert.equal(JSON.parse(rows[0]).code,'ROUND_TRANSACTION_ABORTED');assert.equal(JSON.parse(rows[0]).failures[0].matchId,'2026-R1-1');assert.deepEqual(rows.slice(1),['234','0','0']);assert.equal(digest(),pristine);
 });
 await t.test('activation mismatch remains denied; repair does not weaken release guard',()=>{
 assert.throws(()=>sql(c,db,`begin;update production_control.cutover_activation_state set activation_revision=235;${statement(input(1,'OPEN'))}rollback;`),/PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_REQUIRED/);assert.equal(digest(),pristine);
 });
 for(const r of [1,2,3])await t.test(`R${r} complete canonical round is READY`,()=>assert.equal(state(r).actions.OPEN.allowed,true,JSON.stringify(state(r).actions.OPEN)));
 for(const [name,setup,r=1] of [
 ['one not ready',"delete from scoring_authority.match_holes where match_id='2026-R1-6' and hole_number=18;"],
 ['already Live',"update scoring_authority.matches set status='LIVE' where match_id='2026-R1-6';"],
 ['existing score row',"insert into scoring_authority.hole_scores(match_id,hole_number,hole_revision,team_1_gross_scores,team_2_gross_scores,team_1_strokes,team_2_strokes,team_1_net_score,team_2_net_score,hole_winner,mutation_key,actor_id)values('2026-R1-6',1,1,'[4,5]','[5,6]','[0,0]','[0,0]',4,5,'TEAM_1','fixture-existing','CB01');"],
 ['score activity',"update scoring_authority.matches set scored_holes=1 where match_id='2026-R1-6';"],
 ['result exists',"update scoring_authority.matches set result_winner='TEAM_1',finalized_at=now() where match_id='2026-R1-6';"],
 ['active lease',"insert into scoring_authority.scoring_ingress_leases(tournament_id,match_id,expires_at)values('2026','2026-R1-6',now()+interval '1 minute');"],
 ['stale handicap',"update scoring_authority.scoring_snapshots set handicap_revision_id=null where match_id='2026-R1-6';"],
 ['stale setup',"insert into scoring_authority.tournament_setup_match_details_v1(match_id,tournament_id,round_number,match_number,course_id,tee_id,tee_time,setup_revision,updated_by_player_id) values('2026-R1-6','2026',1,6,'COURSE-1','Tournament','09:00',2,'CB01');"],
 ['stale strokes',"update scoring_authority.match_participants set final_strokes=99 where match_id='2026-R1-6';"],
 ['wrong team',"update scoring_authority.tournament_players set team_side=2 where player_id='CB12';"],
 ['R3 23/24',"delete from scoring_authority.match_participants where match_id='2026-R3-12' and player_id='WD12';",3],
 ['R3 duplicate',"update scoring_authority.match_participants set player_id='WD11' where match_id='2026-R3-12' and player_id='WD12';",3],
 ['R3 missing match',"delete from scoring_authority.matches where match_id='2026-R3-12';",3],
 ])await t.test(`OPEN fails atomically: ${name}`,()=>negative(setup,r));
 await t.test('late SQL failure rolls back lifecycle, permissions, history, outbox and receipt',()=>{
 const i=input(1,'OPEN');const lines=sql(c,db,`begin;create function scoring_authority.inject_round_failure()returns trigger language plpgsql as $$begin if new.match_id='2026-R1-6' then raise exception 'injected';end if;return new;end$$;create trigger injected before update on scoring_authority.matches for each row execute function scoring_authority.inject_round_failure();${statement(i)}select count(*) from scoring_authority.score_revision_history;select count(*) from production_control.round_scoring_receipts_v1;select sum(match_revision) from scoring_authority.matches;rollback;`).split('\n');const r=JSON.parse(lines[0]);assert.deepEqual(lines.slice(1),['0','0','0'],'failed last target rolled back before transaction end');assert.equal(r.code,'ROUND_TRANSACTION_ABORTED');assert.equal(digest(),pristine);assert.equal(state(1).history.length,0);
 });
 await t.test('stale full-state fingerprint denies before transition',()=>{const i=input(1,'OPEN');i.expected_fingerprint='0'.repeat(64);assert.equal(call(i).code,'ROUND_STATE_CHANGED');assert.equal(digest(),pristine);});
 for(const [name,patch]of [['participant',{authorization:{...scope.authorization,role:'PLAYER'}}],['wrong Director',{authorization:{...scope.authorization,auth_user_id:'00000000-0000-4000-8000-000000000099'}}],['wrong tournament',{tournament_id:'2025'}],['wrong round',{round:4}],['forged match list',{match_ids:['2026-R1-1']}],['unsupported bulk finalize',{operation:'FINALIZE'}]])await t.test(`${name} denied`,()=>assert.throws(()=>call({...input(1,'OPEN'),...patch}),/AUTHORIZATION|SCOPE|ROUND_INPUT/));
 for(const [name,setup] of Object.entries({'revoked entitlement':"update production_control.director_entitlements set status='REVOKED';",'revoked identity':"update participant_identity.user_player_links set status='REVOKED';",'deleted auth user':"delete from auth.users;"}))await t.test(`${name} denies round authority`,()=>assert.throws(()=>negative(setup),/AUTHORIZATION/));
 await t.test('participant database execute and receipt mutation privileges denied',()=>{
 assert.equal(sql(c,db,"select has_function_privilege('authenticated','public.mutate_production_round_scoring_v1(jsonb)','execute');"),'f');
 assert.equal(sql(c,db,"select has_table_privilege('service_role','production_control.round_scoring_receipts_v1','insert');"),'f');
 });
 for(const r of [1,2,3])await t.test(`R${r} atomic Open; timeout retry; Lock; Resume`,()=>{
 const i=input(r,'OPEN');const opened=call(i);assert.equal(opened.ok,true,JSON.stringify(opened));assert.equal(opened.data.summary.live,r===3?12:6);assert.equal(opened.data.summary.accessActive,r===3?12:6);
 assert.equal(sql(c,db,'select activation_revision from production_control.cutover_activation_state;'),'234');
 assert.equal(sql(c,db,'select count(*) from production_control.operation_audit_events;'),'1','first-write evidence recorded once');
 assert.equal(sql(c,db,"select first_supabase_write_observed_at is not null and first_supabase_mutation_key is not null from production_control.cutover_activation_state;"),'t');
 if(r===1)visuals.open=state(1);
 const committed=digest();assert.equal(call(i).idempotent,true);assert.equal(digest(),committed);assert.equal(state(r).history.length,1);
 assert.equal(call({...i,operation:'LOCK'}).code,'ROUND_IDEMPOTENCY_CONFLICT');
 assert.equal(score(`2026-R${r}-1`,1).ok,true);const values=preserve();
 const lock=input(r,'LOCK');assert.equal(call(lock).ok,true);assert.equal(preserve(),values);if(r===1)visuals.locked=state(1);const locked=digest();assert.equal(call(lock).idempotent,true);assert.equal(digest(),locked);
 negative(`update scoring_authority.scoring_snapshots set tee='Different' where match_id='2026-R${r}-1';`,r,'RESUME');
 const resume=input(r,'RESUME');const resumed=call(resume);assert.equal(resumed.ok,true,JSON.stringify(resumed));assert.equal(preserve(),values);if(r===1)visuals.resumed=state(1);const after=digest();assert.equal(call(resume).idempotent,true);assert.equal(digest(),after);
 assert.equal(call(i).code,'ROUND_RECEIPT_STATE_CHANGED');
 const alteredReplay=JSON.parse(sql(c,db,`begin;delete from scoring_authority.score_revision_history where match_id='2026-R${r}-1' and action='HOLE_SCORE_UPSERTED';${statement(resume)}rollback;`));assert.equal(alteredReplay.code,'ROUND_RECEIPT_STATE_CHANGED','receipt cannot hide changed score history');assert.equal(call(lock).code,'ROUND_RECEIPT_STATE_CHANGED');
 assert.ok(state(r).history.every(h=>h.director==='CB01'&&!JSON.stringify(h).includes(actor.authUserId)));assert.equal(state(r).history.length,3);
 });
 await t.test('receipt immutable even for table owner',()=>assert.throws(()=>sql(c,db,'update production_control.round_scoring_receipts_v1 set actor_player_id=actor_player_id;'),/IMMUTABLE/));
 await t.test('mixed Lock leaves Final and Upcoming untouched',()=>{
 const i=input(1,'LOCK');const values=preserve();const r=JSON.parse(sql(c,db,`begin;update scoring_authority.matches set status='FINAL' where match_id='2026-R1-5';update scoring_authority.matches set status='UPCOMING' where match_id='2026-R1-6';select public.mutate_production_round_scoring_v1(${json(i)}||jsonb_build_object('expected_fingerprint',production_control.round_scoring_state_v1(1)->>'fingerprint'));rollback;`));assert.equal(r.ok,true);assert.equal(r.receipt.affectedMatches.length,4);assert.equal(r.data.matches.find(x=>x.matchId==='2026-R1-5').status,'FINAL');assert.equal(r.data.matches.find(x=>x.matchId==='2026-R1-6').status,'UPCOMING');assert.equal(preserve(),values);
 });


 // Build the visual mixed case through real lifecycle APIs: one Final, four
 // Live, one untouched Upcoming, with exactly four matches granting access.
 const priorDb=db;db='round_mixed_visual';run(bin.createdb,['-T','round_pristine',db],{env:environment(c)});
 for(let n=1;n<=5;n++){assert.equal(ctrl(`2026-R1-${n}`,'MARK_LIVE').ok,true);assert.equal(ctrl(`2026-R1-${n}`,'ACCESS_ACTIVATE').ok,true);}
 for(let h=1;h<=18;h++)assert.equal(score('2026-R1-1',h).ok,true);
 const finalized=rpc(c,db,'finalize_production_match',individual('2026-R1-1'));assert.equal(finalized.ok,true,JSON.stringify(finalized));
 visuals.mixed=state(1);assert.equal(visuals.mixed.summary.accessActive,4);assert.equal(visuals.mixed.summary.final,1);assert.equal(visuals.mixed.summary.upcoming,1);
 await t.test('canonical mixed Lock preserves real finalized scorecard and untouched Upcoming',()=>{const before=preserve(),r=call(input(1,'LOCK'));assert.equal(r.ok,true);assert.equal(r.receipt.affectedMatches.length,4);assert.equal(preserve(),before);assert.equal(state(1).summary.accessActive,0);});
 db=priorDb;
 visuals.failed=JSON.parse(sql(c,'round_pristine',`begin;delete from scoring_authority.match_holes where match_id='2026-R1-4' and hole_number=18;select production_control.round_scoring_state_v1(1);rollback;`));
 if(process.env.BAGGER_ROUND_UI_FIXTURE)writeFileSync(process.env.BAGGER_ROUND_UI_FIXTURE,JSON.stringify(visuals,null,2));
 const asyncSQL=(text)=>{const child=spawn(bin.psql,['-X','-qAt','-v','ON_ERROR_STOP=1','-d',db],{env:environment(c)});let output='',errors='';let readyResolve;const ready=new Promise(r=>readyResolve=r);child.stdout.on('data',d=>{output+=d;if(output.includes('ROUND_HELD'))readyResolve();});child.stderr.on('data',d=>errors+=d);const done=new Promise((resolve,reject)=>child.on('close',code=>{if(code===0)resolve(output);else reject(new Error(errors));}));child.stdin.end(text);return {ready,done};};
 const fresh=()=>{db='round_race_'+(++seq);run(bin.createdb,['-T','round_pristine',db],{env:environment(c)});};
 for(const op of ['MARK_LIVE','ACCESS_ACTIVATE','SCORING_LOCK'])await t.test(`Open vs individual ${op}: serializes, stale individual denied`,async()=>{
   fresh();const i=input(1,'OPEN'),other=individual('2026-R1-6',op);
   const first=asyncSQL(`begin;${statement(i)}select 'ROUND_HELD';select pg_sleep(0.3);commit;`);await first.ready;
   const second=asyncSQL(`select public.mutate_production_match_control(${json(other)});`);const [a,b]=await Promise.all([first.done,second.done]);assert.equal(JSON.parse(a.split('\n')[0]).ok,true);assert.equal(JSON.parse(b.trim()).ok,false);assert.equal(state(1).summary.accessActive,6);assert.equal(state(1).history.length,1);
 });
 for(const same of [false,true])await t.test(`two simultaneous Open requests (${same?'same key':'different keys'})`,async()=>{
 fresh();const i=input(1,'OPEN'),other=same?i:input(1,'OPEN');const first=asyncSQL(`begin;${statement(i)}select 'ROUND_HELD';select pg_sleep(0.3);commit;`);await first.ready;const second=asyncSQL(statement(other));await first.done;const b=JSON.parse((await second.done).trim());assert.equal(b.ok,same);if(same)assert.equal(b.idempotent,true);else assert.equal(b.code,'ROUND_STATE_CHANGED');assert.equal(state(1).history.length,1);assert.equal(sql(c,db,'select count(*) from scoring_authority.score_revision_history;'),'12');
 });
 await t.test('setup holds shared lock before Open; stale round denied',async()=>{
 fresh();const i=input(1,'OPEN');const setup={...scope,contract_version:'production-tournament-setup-v1',actor_player_id:actor.playerId,actor_auth_user_id:actor.authUserId,operation:'UPSERT_MATCH',expected_revision:0,operation_request_id:uid(),request_payload_hash:'a'.repeat(64),match_id:'2026-R1-6',round_number:1,match_number:6,course_id:'COURSE-1',tee:'Tournament',tee_time:'09:10'};
 // Real canonical setup mutation installs changed schedule/details and invalidates preparation.
 const first=asyncSQL(`begin;select public.mutate_production_tournament_setup_v1(${json(setup)});select 'ROUND_HELD';select pg_sleep(0.3);commit;`);
 await Promise.race([first.ready,first.done.then(()=>{})]);const second=asyncSQL(statement(i));const a=await first.done;assert.equal(JSON.parse(a.split('\n')[0]).ok,true,a);const b=JSON.parse((await second.done).trim());assert.equal(b.ok,false);assert.equal(state(1).summary.live,0);assert.equal(state(1).history.length,0);
 });
 await t.test('lease admission concurrent with Open is serialized before preflight',async()=>{
 fresh();const i=input(1,'OPEN');const first=asyncSQL(`begin;insert into scoring_authority.scoring_ingress_leases(tournament_id,match_id,expires_at)values('2026','2026-R1-6',now()+interval '1 minute');select 'ROUND_HELD';select pg_sleep(0.3);commit;`);await first.ready;const second=asyncSQL(statement(i));await first.done;assert.equal(JSON.parse((await second.done).trim()).ok,false);assert.equal(state(1).summary.live,0);
 });
 await t.test('Resume vs revoked access safely serializes',async()=>{
 fresh();assert.equal(call(input(1,'OPEN')).ok,true);assert.equal(score('2026-R1-1',1).ok,true);assert.equal(call(input(1,'LOCK')).ok,true);const i=input(1,'RESUME'),other=individual('2026-R1-1','ACCESS_REVOKE'),value=preserve();const first=asyncSQL(`begin;${statement(i)}select 'ROUND_HELD';select pg_sleep(0.3);commit;`);await first.ready;const second=asyncSQL(`select public.mutate_production_match_control(${json(other)});`);await first.done;assert.equal(JSON.parse((await second.done).trim()).ok,false);assert.equal(preserve(),value);assert.equal(state(1).summary.accessActive,6);
 });
});
