import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync} from 'node:fs';
import {spawnSync,spawn} from 'node:child_process';
const bin='/opt/homebrew/opt/postgresql@17/bin/';
const file='supabase/production_migrations/202609220107_expired_identity_recovery_v1.sql';
const original=readFileSync('supabase/production_migrations/202608240020_production_participant_identity_cutover.sql','utf8');
const HM='a0000000-0000-4000-8000-000000000001',NJ='a0000000-0000-4000-8000-000000000002',OWNER='a0000000-0000-4000-8000-000000000003';
const REQ='b0000000-0000-4000-8000-000000000001',NREQ='b0000000-0000-4000-8000-000000000002',APP='c0000000-0000-4000-8000-000000000001';
const quote=x=>"'"+String(x).replaceAll("'","''")+"'";
function run(cmd,args,input,env){const r=spawnSync(cmd,args,{input,env,encoding:'utf8',maxBuffer:8e6});if(r.error||r.status!==0)throw new Error(r.stderr||String(r.error));return r.stdout.trim();}
function definition(name){const start=original.indexOf('create or replace function '+name+'(');assert(start>=0);return original.slice(start,original.indexOf('$$;',start)+3);}
test('expired identity recovery — disposable PostgreSQL security and concurrency',async t=>{
 const root=mkdtempSync('/private/tmp/bagger-expired-recovery-pg-');mkdirSync(root+'/socket');
 run(bin+'initdb',['-D',root+'/data','-U','postgres','-A','trust','--no-locale','--set=shared_memory_type=mmap','--set=dynamic_shared_memory_type=mmap']);
 run(bin+'pg_ctl',['-D',root+'/data','-l',root+'/postgres.log','-o',`-F -k ${root}/socket -h '' -p 5432`,'-w','start']);
 const env={...process.env,PGHOST:root+'/socket',PGPORT:'5432',PGUSER:'postgres',PGDATABASE:'postgres',PGOPTIONS:'-c request.jwt.claim.role=service_role'};
 const sql=(s,db='postgres')=>run(bin+'psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-d',db],s,env);
 const asyncSql=(s,db)=>new Promise((resolve,reject)=>{const p=spawn(bin+'psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-d',db],{env});let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('close',c=>c?reject(new Error(err)):resolve(out.trim()));p.stdin.end(s);});
 let count=0;
 const fresh=()=>{const db='case_'+(++count);sql(`create database ${db} template fixture;`);return db;};
 const inspect=(db,player='HM01',auth=HM,req=REQ)=>JSON.parse(sql(`select production_control.inspect_expired_identity_recovery_v1('${player}','${auth}','${req}');`,db));
 const makePlan=(db,player='HM01',auth=HM,req=REQ)=>({contract:'expired-provider-confirmed-identity-recovery-v1',approvalId:APP,playerId:player,authUserId:auth,historicalRequestId:req,actorPlayerId:'CB01',actorAuthUserId:OWNER,reasonCode:'OWNER_REVIEWED_INCOMPLETE_EMAIL_CERTIFICATION',expectedState:inspect(db,player,auth,req),expiresAt:new Date(Date.now()+600000).toISOString()});
 const register=(db,p=makePlan(db))=>JSON.parse(sql(`select production_control.register_expired_identity_recovery_v1(${quote(JSON.stringify(p))}::jsonb);`,db));
 const applySQL=h=>`select production_control.apply_expired_identity_recovery_v1('${APP}','${h}');`;
 const apply=(db,h)=>JSON.parse(sql(applySQL(h),db));
 const normalSQL=`select public.record_production_participant_otp_verification('{"request_id":"${REQ}","auth_user_id":"${HM}","succeeded":true,"duration_ms":1}');`;
 const fingerprint=(db,tables)=>sql(`select md5(jsonb_build_array(${tables.map(x=>`(select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) from ${x} t)`).join(',')})::text);`,db);
 try{
 sql('create database fixture;');sql(readFileSync('test/fixtures/expired-identity-recovery.sql','utf8'),'fixture');
 for(const n of ['production_control.certify_production_participant_otp','public.record_production_participant_otp_verification','public.recover_production_participant_otp_verification','public.authorize_production_participant_otp_request'])sql(definition(n),'fixture');
 sql(readFileSync(file,'utf8'),'fixture');
 const legacyHash=sql("select md5(pg_get_functiondef('public.recover_production_participant_otp_verification(uuid,uuid)'::regprocedure));",'fixture');
 for(const [player,auth,req] of [['HM01',HM,REQ],['NJ01',NJ,NREQ]])await t.test(player+' shaped recovery, fresh Email eligible, no provider/session/phone/history mutation',()=>{
  const db=fresh();const protectedTables=['auth.users','participant_identity.player_approved_phones_v1','participant_identity.participant_identity_contacts','scoring_authority.tournament_players','participant_identity.participant_auth_otp_attempts'];const before=fingerprint(db,protectedTables);const other=sql(`select md5(to_jsonb(l)::text) from participant_identity.user_player_links l where player_id<>'${player}'`,db);const h=register(db,makePlan(db,player,auth,req)).planHash;
  assert.equal(apply(db,h).status,'RECOVERED');assert.equal(inspect(db,player,auth,req).state,'COMPLETE');assert.equal(fingerprint(db,protectedTables),before);assert.equal(sql(`select md5(to_jsonb(l)::text) from participant_identity.user_player_links l where player_id<>'${player}'`,db),other);
  assert.equal(sql('select count(*) from auth.users',db),'3');assert.equal(sql('select count(*) from production_control.expired_identity_recovery_receipts_v1',db),'1');
  const email=player==='HM01'?'hm@fixture.local':'nj@fixture.local';const decision=JSON.parse(sql(`select public.authorize_production_participant_otp_request(jsonb_build_object('email','${email}','client_request_hash',repeat('c',64)));`,db));assert.equal(decision.allowed,true);assert.equal(decision.verificationType,'email');assert.equal(decision.authUserId,auth);
 });
 const denied=[
 ['unconfirmed provider',`update auth.users set email_confirmed_at=null where id='${HM}'`],
 ['provider Email mismatch',`update auth.users set email='wrong@fixture.local' where id='${HM}'`],
 ['wrong Player metadata',`update auth.users set raw_app_meta_data=jsonb_set(raw_app_meta_data,'{player_id}','"NJ01"') where id='${HM}'`],
 ['duplicate Auth email',`insert into auth.users(id,email) values('d0000000-0000-4000-8000-000000000001','hm@fixture.local')`],
 ['UUID linked elsewhere',`update participant_identity.user_player_links set player_id='NJ01' where auth_user_id='${HM}'`],
 ['Player owned by another UUID',`insert into auth.users(id,email) values('d0000000-0000-4000-8000-000000000001','third@fixture.local');insert into participant_identity.user_player_links(auth_user_id,player_id,status) values('d0000000-0000-4000-8000-000000000001','HM01','ACTIVE')`],
 ['membership revoked',"update scoring_authority.tournament_players set participation_status='INACTIVE' where player_id='HM01'"],
 ['player inactive',"update production_control.player_governance_profiles_v1 set global_status='ALUMNI' where player_id='HM01'"],
 ['deletion pending',`insert into participant_identity.account_deletion_requests_v1 values('${HM}','REQUESTED')`],
 ['provider deleted',`update auth.users set deleted_at=now() where id='${HM}'`],
 ['provider banned',`update auth.users set banned_until=now()+interval '1 day' where id='${HM}'`],
 ['revoked link',"update participant_identity.user_player_links set status='REVOKED',revoked_at=now() where player_id='HM01'"],
 ['revoked identifier',"update participant_identity.participant_auth_identifiers set status='REVOKED',revoked_at=now() where player_id='HM01'"],
 ['revoked participant role',`insert into participant_identity.tournament_roles(tournament_id,auth_user_id,role,role_active,revoked_at) values('2026','${HM}','PARTICIPANT',false,now())`],
 ['changed Director approval',"update participant_identity.participant_identity_contacts set configuration_revision=26 where player_id='HM01'"],
 ['changed approved Email',"update participant_identity.participant_identity_contacts set email_normalized='new@fixture.local' where player_id='HM01'"],
 ['missing approved import',"delete from participant_identity.identity_config_import_runs"],
 ['expired attempt alone',"update participant_identity.participant_identity_contacts set identity_active=false where player_id='HM01'"],
 ['phone collision',"update participant_identity.player_approved_phones_v1 set phone_e164='+12025550101' where player_id='NJ01'"],
 ['provider pending phone collision',`update auth.users set phone_change='12025550101' where id='${NJ}'`],
 ['target phone ambiguity',`update auth.users set phone_change='12025550199' where id='${HM}'`],
 ['active release lock',"insert into production_control.release_attempts_v1 values('ACTIVE')"],
 ];
 for(const [name,change] of denied)await t.test(name+' denies without mutation',()=>{const db=fresh();sql(change,db);const before=fingerprint(db,['participant_identity.user_player_links','participant_identity.participant_auth_identifiers']);assert.throws(()=>inspect(db),/EXPIRED_IDENTITY/);assert.equal(fingerprint(db,['participant_identity.user_player_links','participant_identity.participant_auth_identifiers']),before);});
 for(const [name,change] of [
 ['Email fingerprint',p=>p.expectedState.authority.emailHash='0'.repeat(64)],
 ['wrong UUID',p=>p.authUserId=NJ],['wrong Player',p=>p.playerId='NJ01'],
 ['wrong history',p=>p.historicalRequestId=NREQ],['unexpected target',p=>p.playerId='CB01'],
 ['owner absent',p=>p.actorAuthUserId=HM],['wrong reason',p=>p.reasonCode='FORCE'],
 ['approval expired',p=>p.expiresAt=new Date(0).toISOString()],
 ])await t.test('review '+name+' denies',()=>{const db=fresh(),p=makePlan(db);change(p);assert.throws(()=>register(db,p),/EXPIRED_IDENTITY|ACTIVE_OWNER/);});
 await t.test('same reviewed approval idempotent; changed plan denied',()=>{const db=fresh(),p=makePlan(db);const a=register(db,p);assert.equal(register(db,p).duplicate,true);p.expiresAt=new Date(Date.now()+500000).toISOString();assert.throws(()=>register(db,p),/APPROVAL_CONFLICT/);assert.equal(apply(db,a.planHash).status,'RECOVERED');const before=fingerprint(db,['participant_identity.user_player_links','participant_identity.participant_auth_identifiers','participant_identity.tournament_roles','production_control.expired_identity_recovery_receipts_v1']);assert.equal(apply(db,a.planHash).status,'ALREADY_COMPLETE');assert.equal(fingerprint(db,['participant_identity.user_player_links','participant_identity.participant_auth_identifiers','participant_identity.tournament_roles','production_control.expired_identity_recovery_receipts_v1']),before);});
 for(const [name,change] of [
 ['contact revision',"update participant_identity.participant_identity_contacts set configuration_revision=26 where player_id='HM01'"],
 ['context revision',"update participant_identity.identity_context_revisions set context_revision=26"],
 ['phone revision',"update participant_identity.player_approved_phones_v1 set phone_revision=2 where player_id='HM01'"],
 ['deletion',`insert into participant_identity.account_deletion_requests_v1 values('${HM}','REQUESTED')`],
 ['Owner revoked',"update production_control.tournament_owner_capabilities_v1 set status='REVOKED'"],
 ])await t.test('approval then '+name+' denies',()=>{const db=fresh(),h=register(db).planHash;sql(change,db);assert.throws(()=>apply(db,h),/EXPIRED_IDENTITY|ACTIVE_OWNER/);});
 await t.test('anonymous/authenticated/service cannot inspect/register/apply or read approvals',()=>{const db=fresh();for(const role of ['anon','authenticated','service_role']){assert.throws(()=>sql(`set session authorization ${role};select production_control.inspect_expired_identity_recovery_v1('HM01','${HM}','${REQ}');`,db),/permission denied/);assert.throws(()=>sql(`set session authorization ${role};select * from production_control.expired_identity_recovery_approvals_v1;`,db),/permission denied/);assert.equal(sql(`select bool_and(not has_function_privilege('${role}',p.oid,'EXECUTE')) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='production_control' and p.proname like '%expired_identity%';`,db),'t');}});
 await t.test('receipt immutable and contains no Email/Auth UUID; privacy deletion removes private approval, cannot resurrect',()=>{const db=fresh(),h=register(db).planHash;apply(db,h);const receipt=sql('select to_jsonb(r) from production_control.expired_identity_recovery_receipts_v1 r',db);assert(!receipt.includes(HM));assert(!receipt.includes('hm@'));assert.throws(()=>sql('delete from production_control.expired_identity_recovery_receipts_v1',db),/IMMUTABLE/);assert.throws(()=>sql('truncate production_control.expired_identity_recovery_receipts_v1',db),/IMMUTABLE/);sql(`delete from auth.users where id='${HM}'`,db);assert.equal(sql('select count(*) from production_control.expired_identity_recovery_approvals_v1',db),'0');assert.equal(sql('select count(*) from production_control.expired_identity_recovery_receipts_v1',db),'1');assert.throws(()=>apply(db,h),/APPROVAL_REQUIRED/);});
 await t.test('replay after revocation denies, cannot reactivate',()=>{const db=fresh(),h=register(db).planHash;apply(db,h);sql("update participant_identity.user_player_links set status='REVOKED',revoked_at=now() where player_id='HM01'",db);assert.throws(()=>apply(db,h),/CURRENT_AUTHORITY_DENIED/);});
 for(const [name,change] of [
 ['identifier revision',"update participant_identity.participant_auth_identifiers set revision=revision+1 where player_id='HM01'"],
 ['pending deletion',`insert into participant_identity.account_deletion_requests_v1 values('${HM}','REQUESTED')`]
 ])await t.test('completed recovery replay with '+name+' denied',()=>{const db=fresh(),h=register(db).planHash;apply(db,h);sql(change,db);assert.throws(()=>apply(db,h),/RECEIPT_DRIFT|REVOKED_OR_STALE/);});
 await t.test('recovery completes first; normal certification retains identity and receipt replay',()=>{const db=fresh(),h=register(db).planHash;apply(db,h);sql(normalSQL,db);assert.equal(inspect(db).state,'COMPLETE');assert.equal(apply(db,h).status,'ALREADY_COMPLETE');assert.equal(sql(`select count(*) from participant_identity.tournament_roles where auth_user_id='${HM}'`,db),'1');});
 await t.test('two concurrent recoveries produce one receipt',async()=>{const db=fresh(),h=register(db).planHash;const result=await Promise.all([asyncSql(applySQL(h),db),asyncSql(applySQL(h),db)]);assert.deepEqual(result.map(x=>JSON.parse(x).status).sort(),['ALREADY_COMPLETE','RECOVERED']);assert.equal(sql('select count(*) from production_control.expired_identity_recovery_receipts_v1',db),'1');});
 await t.test('normal certification completes first; recovery becomes truthful no-op',()=>{const db=fresh(),h=register(db).planHash;sql(normalSQL,db);const before=fingerprint(db,['participant_identity.user_player_links','participant_identity.participant_auth_identifiers','participant_identity.tournament_roles']);assert.equal(apply(db,h).status,'ALREADY_COMPLETED_BY_NORMAL_LOGIN');assert.equal(fingerprint(db,['participant_identity.user_player_links','participant_identity.participant_auth_identifiers','participant_identity.tournament_roles']),before);});
 await t.test('normal certification races recovery: canonical identity converges',async()=>{const db=fresh(),h=register(db).planHash;await Promise.all([asyncSql(applySQL(h),db),asyncSql(normalSQL,db)]);assert.equal(inspect(db).state,'COMPLETE');assert.equal(sql(`select count(*) from participant_identity.user_player_links where auth_user_id='${HM}'`,db),'1');assert.equal(sql(`select count(*) from participant_identity.tournament_roles where auth_user_id='${HM}'`,db),'1');});
 await t.test('existing 30-minute recovery unchanged: expired denied, eligible immediate allowed',()=>{const db=fresh();const call=()=>JSON.parse(sql(`select public.recover_production_participant_otp_verification('${REQ}','${HM}');`,db));assert.equal(call().code,'PRODUCTION_PARTICIPANT_AUTH_RECOVERY_NOT_ELIGIBLE');sql(`update participant_identity.participant_auth_otp_attempts set requested_at=now()-interval '10 minutes' where request_id='${REQ}'`,db);assert.equal(call().status,'VERIFIED');assert.equal(sql("select md5(pg_get_functiondef('public.recover_production_participant_otp_verification(uuid,uuid)'::regprocedure));",db),legacyHash);});
 await t.test('unknown Email remains denied, signup stays closed',()=>{const db=fresh();const x=JSON.parse(sql(`select public.authorize_production_participant_otp_request(jsonb_build_object('email','unknown@fixture.local','client_request_hash',repeat('a',64)));`,db));assert.equal(x.allowed,false);assert.equal(x.provisioningRequired,false);assert.equal(sql('select count(*) from auth.users',db),'3');});
 }finally{run(bin+'pg_ctl',['-D',root+'/data','-m','immediate','-w','stop']);}
});
