import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const bin='/opt/homebrew/opt/postgresql@17/bin/';
const migration=readFileSync(new URL('../supabase/production_migrations/202609110101_account_deletion_review_access_v1.sql',import.meta.url),'utf8');
function run(cmd,args,input,env){const r=spawnSync(cmd,args,{input,env,encoding:'utf8',maxBuffer:4*1024*1024});if(r.error||r.status!==0)throw Error(r.stderr||String(r.error));return r.stdout.trim();}
test('durable account deletion in an isolated Unix-socket PostgreSQL fixture',async t=>{
 const root=mkdtempSync('/private/tmp/bagger-delete-pg-');mkdirSync(root+'/socket');
 run(bin+'initdb',['-D',root+'/data','-U','postgres','-A','trust','--no-locale']);
 run(bin+'pg_ctl',['-D',root+'/data','-l',root+'/postgres.log','-o',`-F -k ${root}/socket -h '' -p 5432`,'-w','start']);
 const env={...process.env,PGHOST:root+'/socket',PGPORT:'5432',PGUSER:'postgres',PGDATABASE:'postgres'};
 const sql=s=>run(bin+'psql',['-X','-qAt','-v','ON_ERROR_STOP=1'],s,env);
 const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const requestId=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const initiate=n=>JSON.parse(sql(`set request.jwt.claim.role='service_role'; select public.initiate_account_deletion_v1('${id(n)}','${requestId(n)}');`));
 try {
 sql(`create role anon;create role authenticated;create role service_role;
 create schema auth;create schema production_control;create schema scoring_authority;create schema participant_identity;
 create table auth.users(id uuid primary key,email_confirmed_at timestamptz,phone_confirmed_at timestamptz);
 create table auth.sessions(user_id uuid references auth.users on delete cascade);
 create table scoring_authority.tournaments(tournament_id text primary key);
 create table scoring_authority.matches(match_id text primary key,tournament_id text references scoring_authority.tournaments,status text);
 create table scoring_authority.tournament_players(tournament_id text,player_id text,participation_status text);
 create table scoring_authority.hole_scores(match_id text,player_id text,strokes integer);
 create table production_control.tournament_owner_capabilities_v1(auth_user_id uuid references auth.users,status text);
 create table production_control.director_entitlements(auth_user_id uuid references auth.users,tournament_id text,player_id text,status text,role text,revoked_at timestamptz);
 create table participant_identity.user_player_links(auth_user_id uuid references auth.users,player_id text,status text,revoked_at timestamptz);
 create table participant_identity.tournament_roles(auth_user_id uuid references auth.users,tournament_id text,role text,role_active boolean,revoked_at timestamptz);
 create table participant_identity.participant_identity_contacts(player_id text,email text);
 create function production_control.assert_production_service_role() returns void language plpgsql as $$ begin
 if current_setting('request.jwt.claim.role',true) is distinct from 'service_role' then raise exception 'service role required';end if;end;$$;
 insert into scoring_authority.tournaments values ('2026');
 insert into scoring_authority.matches values ('final','2026','FINAL');
 `);
 sql(migration);
 sql(`create table scoring_authority.handicap_operation_receipts(actor_auth_user_id uuid not null references auth.users(id) on delete restrict, payload text);
 create function scoring_authority.reject_history_change() returns trigger language plpgsql as $$ begin raise exception 'IMMUTABLE_RECORD';end;$$;
 create trigger immutable_receipt before update or delete on scoring_authority.handicap_operation_receipts for each row execute function scoring_authority.reject_history_change();`);
 sql(readFileSync(new URL('../supabase/production_migrations/202609110102_account_deletion_audit_attribution_v1.sql',import.meta.url),'utf8'));
 for(let n=1;n<=8;n++)sql(`insert into auth.users values('${id(n)}',now(),null);insert into auth.sessions values('${id(n)}');`);
 for(let n=1;n<=3;n++)sql(`insert into participant_identity.user_player_links values('${id(n)}','P${n}','ACTIVE',null);insert into participant_identity.participant_identity_contacts values('P${n}','p${n}@example.invalid');insert into scoring_authority.tournament_players values('2026','P${n}','ACTIVE');insert into scoring_authority.hole_scores values('final','P${n}',4);`);
 const history=sql('select json_agg(s) from scoring_authority.hole_scores s;');
 await t.test('unauthenticated database caller cannot initiate',()=>assert.throws(()=>sql(`select public.initiate_account_deletion_v1('${id(1)}','${requestId(1)}');`),/service role required/));
 await t.test('normal participant request persists and deletion clears auth/session/link but keeps competition',()=>{
   assert.equal(initiate(1).status,'READY');assert.equal(initiate(1).requestId,requestId(1));
   sql(`delete from auth.users where id='${id(1)}';`);
   assert.equal(sql(`select count(*) from auth.sessions where user_id='${id(1)}';`),'0');
   assert.equal(sql(`select count(*) from participant_identity.user_player_links where auth_user_id='${id(1)}';`),'0');
   assert.equal(sql(`select status from participant_identity.account_deletion_requests_v1 where request_id='${requestId(1)}';`),'COMPLETED');
   assert.equal(sql('select json_agg(s) from scoring_authority.hole_scores s;'),history);
   assert.equal(sql("select count(*) from scoring_authority.tournament_players where player_id='P1';"),'1');
 });
 await t.test('active owner remains intact pending handoff',()=>{
   sql(`insert into production_control.tournament_owner_capabilities_v1 values('${id(2)}','ACTIVE');`);
   assert.equal(initiate(2).status,'PENDING_ADMINISTRATIVE_HANDOFF');
   assert.throws(()=>sql(`delete from auth.users where id='${id(2)}';`),/ACCOUNT_DELETION_PROTECTED/);
   assert.equal(sql(`select count(*) from auth.users where id='${id(2)}';`),'1');
 });
 await t.test('final director stays pending without automatic handoff',()=>{
   sql(`insert into production_control.director_entitlements values('${id(3)}','2026','P3','ACTIVE','DIRECTOR',null);`);
   assert.equal(initiate(3).status,'PENDING_ADMINISTRATIVE_HANDOFF');
   assert.throws(()=>sql(`delete from auth.users where id='${id(3)}';`),/ACCOUNT_DELETION_PROTECTED/);
 });
 sql(`insert into participant_identity.review_access_v1 values('${id(4)}','2026','final',true,true,now()+interval '1 day',1);`);
 await t.test('sole reviewer request persists while auth and entitlement survive',()=>{
   assert.equal(initiate(4).status,'PENDING_REVIEW_ACCESS_HANDOFF');
   assert.throws(()=>sql(`delete from auth.users where id='${id(4)}';`),/ACCOUNT_DELETION_PROTECTED/);
   assert.equal(sql(`select count(*) from auth.users where id='${id(4)}';`),'1');
   assert.equal(sql(`select count(*) from participant_identity.review_access_v1 where auth_user_id='${id(4)}';`),'1');
   assert.equal(sql(`select count(*) from participant_identity.user_player_links where auth_user_id='${id(4)}';`),'0');
   assert.equal(sql(`select count(*) from production_control.director_entitlements where auth_user_id='${id(4)}';`),'0');
 });
 await t.test('explicitly released reviewer can complete using existing request',()=>{
   sql(`update participant_identity.review_access_v1 set protected=false where auth_user_id='${id(4)}';`);
   assert.equal(initiate(4).status,'READY');sql(`delete from auth.users where id='${id(4)}';`);
   assert.equal(sql(`select status from participant_identity.account_deletion_requests_v1 where request_id='${requestId(4)}';`),'COMPLETED');
 });
 await t.test('another valid reviewer permits deletion but the last remaining one stays protected',()=>{
   for(const n of [5,6])sql(`insert into participant_identity.review_access_v1 values('${id(n)}','2026','final',true,true,now()+interval '1 day',1);`);
   assert.equal(initiate(5).status,'READY');sql(`delete from auth.users where id='${id(5)}';`);
   assert.equal(initiate(6).status,'PENDING_REVIEW_ACCESS_HANDOFF');
 });
 await t.test('protection added after initiation blocks provider deletion atomically',()=>{
   sql(`insert into participant_identity.review_access_v1 values('${id(7)}','2026','final',true,false,now()+interval '1 day',1);`);
   assert.equal(initiate(7).status,'READY');
   sql(`update participant_identity.review_access_v1 set protected=true where auth_user_id='${id(7)}';update participant_identity.review_access_v1 set active=false where auth_user_id='${id(6)}';`);
   assert.throws(()=>sql(`delete from auth.users where id='${id(7)}';`),/ACCOUNT_DELETION_PROTECTED/);
   assert.equal(initiate(7).status,'PENDING_REVIEW_ACCESS_HANDOFF');
 });
 await t.test('immutable attribution survives actual Auth deletion but cannot authorize new writes',()=>{
   sql(`insert into participant_identity.user_player_links values('${id(8)}','P8','ACTIVE',null);insert into scoring_authority.handicap_operation_receipts values('${id(8)}','unchanged');`);
   const before=sql('select json_agg(r) from scoring_authority.handicap_operation_receipts r;');
   assert.equal(initiate(8).status,'READY');sql(`delete from auth.users where id='${id(8)}';`);
   assert.equal(sql('select json_agg(r) from scoring_authority.handicap_operation_receipts r;'),before);
   assert.throws(()=>sql(`insert into scoring_authority.handicap_operation_receipts values('${id(8)}','new');`),/LIVE_AUTHOR_AUTH_REQUIRED/);
   assert.throws(()=>sql(`update scoring_authority.handicap_operation_receipts set payload='changed';`),/IMMUTABLE_RECORD/);
 });
 await t.test('released owner can complete without deleting governance history',()=>{
   sql(`update production_control.tournament_owner_capabilities_v1 set status='REVOKED' where auth_user_id='${id(2)}';`);
   assert.equal(initiate(2).status,'READY');sql(`delete from auth.users where id='${id(2)}';`);
   assert.equal(sql("select count(*) from production_control.tournament_owner_capabilities_v1 where auth_user_id is null and status='REVOKED';"),'1');
 });
 await t.test('request ownership collision cannot delete another account',()=>{
   assert.throws(()=>sql(`set request.jwt.claim.role='service_role';select public.initiate_account_deletion_v1('${id(7)}','${requestId(3)}');`),/OWNER_MISMATCH/);
 });
 }finally{run(bin+'pg_ctl',['-D',root+'/data','-m','fast','-w','stop']);}
});
