import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const bin = '/opt/homebrew/opt/postgresql@17/bin/';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const candidate = read('../supabase/production_incremental/account-deletion-attribution-minimization.sql');
const handicapDDL = read('../supabase/production_migrations/202608290058_production_handicap_revisions_v1.sql');
const oddsDDL = read('../supabase/production_migrations/202608290057_production_odds_publication_authority_v1.sql');
const skinsDDL = read('../supabase/production_migrations/202609090098_production_net_skins_entries_v1.sql');
const sourceDDL = read('../supabase/production_migrations/202609050091_production_ghin_hybrid_foundation_v1.sql');
const definition = (source, pattern) => {
  const match = source.match(pattern);
  assert.ok(match, 'certified DDL extraction must resolve');
  return match[0];
};
const tableDDL = name => {
  const match = handicapDDL.match(new RegExp(`create table scoring_authority\\.${name} \\([\\s\\S]*?\\n\\);`));
  assert.ok(match, `actual ${name} DDL exists`);
  return match[0];
};
function run(cmd, args, input, env) {
  const r = spawnSync(cmd, args, { input, env, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  if (r.error || r.status !== 0) throw Error(r.stderr || String(r.error));
  return r.stdout.trim();
}
test('local attribution minimization preserves revision8 competition facts and immutable safety', async t => {
  const root = mkdtempSync('/private/tmp/bagger-delete-min-pg-');
  mkdirSync(root + '/socket');
  run(bin + 'initdb', ['-D', root + '/data', '-U', 'postgres', '-A', 'trust', '--no-locale', '-c', 'shared_memory_type=mmap', '-c', 'dynamic_shared_memory_type=mmap']);
  run(bin + 'pg_ctl', ['-D', root + '/data', '-l', root + '/postgres.log', '-o', `-F -k ${root}/socket -h '' -p 5432 -c shared_memory_type=mmap -c dynamic_shared_memory_type=mmap -c max_connections=10 -c shared_buffers=16MB`, '-w', 'start']);
  const env = { ...process.env, PGHOST: root + '/socket', PGPORT: '5432', PGUSER: 'postgres', PGDATABASE: 'postgres' };
  const sql = s => run(bin + 'psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], s, env);
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const request = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const initiate = n => sql(`set request.jwt.claim.role='service_role';select public.initiate_account_deletion_v1('${id(n)}','${request(n)}');`);
  const immutable = `create function production_control.reject_handicap_immutable_change() returns trigger language plpgsql as $$begin raise exception 'IMMUTABLE_RECORD';end;$$;
   create trigger immutable_receipt before update or delete on scoring_authority.handicap_operation_receipts for each row execute function production_control.reject_handicap_immutable_change();`;
  try {
    sql(`create role anon;create role authenticated;create role service_role;
    create schema auth;create schema production_control;create schema scoring_authority;create schema participant_identity;
    create schema extensions;create function extensions.gen_random_uuid() returns uuid language sql as 'select pg_catalog.gen_random_uuid()';
    create table auth.users(id uuid primary key,email_confirmed_at timestamptz,phone_confirmed_at timestamptz);
    create table auth.sessions(user_id uuid references auth.users on delete cascade);
    create table scoring_authority.tournaments(tournament_id text primary key);
    create table scoring_authority.matches(match_id text primary key,tournament_id text,status text);
    create table scoring_authority.players(player_id text primary key);
    create table scoring_authority.rounds(tournament_id text,round_number integer,primary key(tournament_id,round_number));
    create table scoring_authority.odds_calculation_jobs(job_id text primary key);
    create table scoring_authority.authority_epochs(epoch_id uuid primary key);
    create table production_control.resource_scope(scope_key text primary key,odds_publication_authority text);
    insert into production_control.resource_scope values('BAGGER_INV_PRODUCTION','SUPABASE');
    create table scoring_authority.tournament_players(tournament_id text,player_id text,participation_status text,primary key(tournament_id,player_id));
    create table scoring_authority.hole_scores(match_id text,player_id text,strokes integer);
    create table production_control.tournament_owner_capabilities_v1(auth_user_id uuid references auth.users,status text);
    create table production_control.director_entitlements(auth_user_id uuid references auth.users,tournament_id text,player_id text,status text,role text,revoked_at timestamptz);
    create table participant_identity.user_player_links(auth_user_id uuid references auth.users,player_id text,status text,revoked_at timestamptz);
    create table participant_identity.tournament_roles(auth_user_id uuid references auth.users,tournament_id text,role text,role_active boolean,revoked_at timestamptz);
    create table participant_identity.participant_identity_contacts(player_id text,email text);
    create function production_control.assert_production_service_role() returns void language plpgsql as $$begin
    if current_setting('request.jwt.claim.role',true) is distinct from 'service_role' then raise exception 'service role required';end if;end;$$;
    insert into scoring_authority.tournaments values('2026');insert into scoring_authority.matches values('final','2026','FINAL');
    create table scoring_authority.handicap_operation_receipts(id integer primary key,actor_auth_user_id uuid not null references auth.users(id),revision integer,player_id text,payload jsonb,request_payload_hash text,created_at timestamptz,updated_at timestamptz);
    ${immutable}
    ${tableDDL('handicap_revisions')}
    ${tableDDL('handicap_revision_entries')}
    ${tableDDL('handicap_revision_current')}
    create trigger fixture_revision_immutable before update or delete on scoring_authority.handicap_revisions for each row execute function production_control.reject_handicap_immutable_change();
    create trigger handicap_revision_entries_immutable before update or delete on scoring_authority.handicap_revision_entries for each row execute function production_control.reject_handicap_immutable_change();`);
    sql(definition(read('../supabase/production_migrations/202608230002_production_final_domain_schema.sql'), /create table "scoring_authority"\."odds_published_snapshots" \([\s\S]*?\n\);/));
    sql('alter table scoring_authority.odds_published_snapshots add primary key(id)');
    sql(definition(oddsDDL,/alter table scoring_authority\.odds_published_snapshots\n  alter column[\s\S]*?;/));
    sql(definition(oddsDDL,/create or replace function production_control\.guard_odds_snapshot_immutability\(\)[\s\S]*?\$\$;/));
    sql(`create trigger guard_production_odds_snapshot_immutability before update on scoring_authority.odds_published_snapshots for each row execute function production_control.guard_odds_snapshot_immutability();
      create table scoring_authority.fixture_side_effects(kind text);
      create function scoring_authority.fixture_odds_job() returns trigger language plpgsql as $$begin insert into scoring_authority.fixture_side_effects values('changed');return new;end;$$;
      create trigger fixture_odds_side_effect after update of is_current_official,publication_revision,payload_hash on scoring_authority.odds_published_snapshots for each row execute function scoring_authority.fixture_odds_job();`);
    sql(definition(skinsDDL,/create table production_control\.net_skins_entry_revisions_v1 \([\s\S]*?\n\);/));
    sql(definition(skinsDDL,/create function production_control\.net_skins_entry_history_immutable_v1\(\)[\s\S]*?\$\$;/));
    sql('create trigger skins_immutable before update or delete on production_control.net_skins_entry_revisions_v1 for each row execute function production_control.net_skins_entry_history_immutable_v1()');
    sql(definition(sourceDDL,/create table production_control\.handicap_source_operation_receipts_v1 \([\s\S]*?\n\);/));
    sql(definition(sourceDDL,/create function production_control\.reject_handicap_source_immutable_v1\(\)[\s\S]*?\$\$;/));
    sql('create trigger source_receipts_immutable before update or delete on production_control.handicap_source_operation_receipts_v1 for each row execute function production_control.reject_handicap_source_immutable_v1()');
    sql(read('../supabase/production_migrations/202609110101_account_deletion_review_access_v1.sql'));
    sql(read('../supabase/production_migrations/202609110102_account_deletion_audit_attribution_v1.sql'));
    for (let n = 1; n <= 4; n++) {
      sql(`insert into auth.users values('${id(n)}',now(),null);insert into auth.sessions values('${id(n)}');
      insert into scoring_authority.players values('P${n}');
      insert into scoring_authority.tournament_players values('2026','P${n}','ACTIVE');
      insert into participant_identity.user_player_links values('${id(n)}','P${n}','ACTIVE',null);
      insert into participant_identity.participant_identity_contacts values('P${n}','p${n}@example.invalid');
      insert into scoring_authority.handicap_operation_receipts values(${n},'${id(n)}',8,'P${n}','{"score":4,"points":2}','original-request-commitment','2026-09-14Z','2026-09-14Z');
      insert into scoring_authority.hole_scores values('final','P${n}',4);`);
    }
    const revisionId = '88888888-8888-4888-8888-888888888888';
    sql(`insert into scoring_authority.rounds values('2026',1);
    insert into production_control.net_skins_entry_revisions_v1(tournament_id,round_number,revision,request_id,request_hash,field_fingerprint,configured,entries,actor_player_id,actor_auth_user_id,response)
    values('2026',1,1,'${request(10)}','immutable-hash','immutable-field',true,'[{"playerId":"P1","gross":4,"net":3,"points":2}]','P1','${id(1)}','{"result":"unchanged"}');
    insert into scoring_authority.odds_published_snapshots(tournament_id,milestone,phase_order,publication_revision,published_at,published_payload,payload_hash,google_publication_fingerprint,imported_by,published_by_auth_user_id,published_by_player_id)
    values('2026','Pre-Tournament',1,1,'2026-09-14Z','{"probability":0.54321,"expectedPoints":18.3,"playerId":"P1"}','immutable-payload-hash','immutable-google-hash','fixture','${id(1)}','P1');
    insert into production_control.handicap_source_operation_receipts_v1(tournament_id,operation,operation_request_id,declared_request_payload_hash,database_request_payload_hash,actor_player_id,actor_auth_user_id,response)
    values('2026','SET_IDENTITY','${request(11)}',repeat('a',64),repeat('b',64),'P2','${id(2)}','{"playerId":"P1","maskedGhinNumber":"••••3456","ok":true,"handicap":8.2}'),
          ('2026','SET_IDENTITY','${request(12)}',repeat('a',64),repeat('b',64),'P1','${id(1)}','{"playerId":"P2","maskedGhinNumber":"••••9999","ok":true}');`);
    sql(`insert into scoring_authority.handicap_revisions(revision_id,tournament_id,revision_number,status,effective_date,method,source_metadata,canonical_fingerprint,roster_fingerprint,predecessor_revision,context_contract_version,created_by,created_by_auth_user_id,approved_by,approved_by_auth_user_id,created_at,approved_at)
    values('${revisionId}','2026',8,'APPROVED','2026-09-14','synthetic certified fixture','{"evidence":"unchanged"}',repeat('a',64),repeat('b',64),0,'production-handicap-context-v1','Fixture Director','${id(1)}','Fixture Director','${id(1)}','2026-09-14Z','2026-09-14Z');
    insert into scoring_authority.handicap_revision_current values('2026','${revisionId}',8,'2026-09-14Z');
    insert into scoring_authority.handicap_revision_entries(revision_id,tournament_id,player_id,tournament_handicap,source_index,low_index,source_metadata,created_at)
    values('${revisionId}','2026','P1',7.4,8.0,6.8,'{"basis":"retained"}','2026-09-14Z');`);
    const rows = () => sql(`select jsonb_agg(to_jsonb(r) order by id) from scoring_authority.handicap_operation_receipts r;`);
    const before = rows();
    const history = sql('select jsonb_agg(to_jsonb(r)) from scoring_authority.hole_scores r');
    const oddsFacts = () => sql("select jsonb_agg(to_jsonb(r)-'published_by_auth_user_id') from scoring_authority.odds_published_snapshots r");
    const skinsFacts = () => sql("select jsonb_agg(to_jsonb(r)-'actor_auth_user_id') from production_control.net_skins_entry_revisions_v1 r");
    const oddsBefore = oddsFacts(), skinsBefore = skinsFacts();
    const receiptFacts = () => sql(`select jsonb_agg((to_jsonb(r)-'actor_auth_user_id') || jsonb_build_object('response',case when response->>'playerId'='P1' then response-'maskedGhinNumber' else response end) order by operation_request_id) from production_control.handicap_source_operation_receipts_v1 r`);
    const sourceReceiptBefore = receiptFacts();
    sql(candidate);
    await t.test('installation is inert', () => assert.equal(rows(), before));
    await t.test('private capability cannot be forged by service role or session GUC', () => {
      assert.throws(() => sql(`set role service_role;insert into participant_identity.deletion_attribution_capability_v1 values(txid_current(),pg_backend_pid(),'${id(1)}','${id(2)}');`), /permission denied/);
      assert.throws(() => sql(`set request.deletion_authorized='true';update scoring_authority.handicap_operation_receipts set actor_auth_user_id='${id(2)}' where id=1;`), /IMMUTABLE_RECORD/);
      assert.throws(() => sql(`update scoring_authority.handicap_operation_receipts set payload='{}' where id=1;`), /IMMUTABLE_RECORD/);
      assert.throws(() => sql(`delete from scoring_authority.handicap_operation_receipts where id=1;`), /IMMUTABLE_RECORD/);
    });
    await t.test('Odds, Skins and masked-GHIN ordinary edits remain immutable', () => {
      assert.throws(() => sql(`update scoring_authority.odds_published_snapshots set published_by_auth_user_id='${id(2)}'`), /SNAPSHOT_IMMUTABLE/);
      assert.throws(() => sql(`update production_control.net_skins_entry_revisions_v1 set actor_auth_user_id='${id(2)}'`), /HISTORY_IMMUTABLE/);
      assert.throws(() => sql("update production_control.handicap_source_operation_receipts_v1 set response=response-'maskedGhinNumber'"), /SOURCE_IMMUTABLE/);
    });
    await t.test('deletion disassociates only actor column, preserves every nonactor value and closes account', () => {
      const facts = sql(`select to_jsonb(r)-'actor_auth_user_id' from scoring_authority.handicap_operation_receipts r where id=1;`);
      const revisionFacts = sql(`select to_jsonb(r)-array['created_by_auth_user_id','approved_by_auth_user_id'] from scoring_authority.handicap_revisions r where revision_id='${revisionId}';`);
      const entries = sql('select jsonb_agg(to_jsonb(r)) from scoring_authority.handicap_revision_entries r');
      const pointer = sql('select jsonb_agg(to_jsonb(r)) from scoring_authority.handicap_revision_current r');
      initiate(1);sql(`delete from auth.users where id='${id(1)}'`);
      assert.equal(oddsFacts(), oddsBefore, 'Odds values, publication identity and timestamps unchanged');
      assert.equal(skinsFacts(), skinsBefore, 'Skins results, points and timestamps unchanged');
      assert.equal(receiptFacts(), sourceReceiptBefore, 'all other receipt fields including original hashes and timestamps remain unchanged');
      assert.equal(sql(`select published_by_auth_user_id<>'${id(1)}' from scoring_authority.odds_published_snapshots`),'t');
      assert.equal(sql(`select actor_auth_user_id<>'${id(1)}' from production_control.net_skins_entry_revisions_v1`),'t');
      assert.equal(sql('select count(*) from scoring_authority.fixture_side_effects'),'0','attribution does not enqueue competitive recalculation');
      assert.deepEqual(JSON.parse(sql(`select response from production_control.handicap_source_operation_receipts_v1 where operation_request_id='${request(11)}'`)),{ok:true,playerId:'P1',handicap:8.2});
      assert.equal(sql(`select actor_auth_user_id from production_control.handicap_source_operation_receipts_v1 where operation_request_id='${request(11)}'`),id(2),'subject cleanup does not redact another Director');
      assert.equal(sql(`select response->>'maskedGhinNumber' from production_control.handicap_source_operation_receipts_v1 where operation_request_id='${request(12)}'`),'••••9999','actor cleanup does not erase a different Player identity');
      assert.throws(() => sql("update scoring_authority.odds_published_snapshots set published_payload='{}'"), /SNAPSHOT_IMMUTABLE/);
      assert.throws(() => sql("update production_control.net_skins_entry_revisions_v1 set entries='[]'"), /HISTORY_IMMUTABLE/);
      assert.equal(sql(`select to_jsonb(r)-'actor_auth_user_id' from scoring_authority.handicap_operation_receipts r where id=1;`), facts);
      const replacement = sql('select actor_auth_user_id from scoring_authority.handicap_operation_receipts where id=1');
      assert.notEqual(replacement, id(1));
      assert.equal(sql(`select created_by_auth_user_id=approved_by_auth_user_id and created_by_auth_user_id='${replacement}' from scoring_authority.handicap_revisions where revision_id='${revisionId}'`), 't');
      assert.equal(sql(`select to_jsonb(r)-array['created_by_auth_user_id','approved_by_auth_user_id'] from scoring_authority.handicap_revisions r where revision_id='${revisionId}';`), revisionFacts);
      assert.equal(sql('select jsonb_agg(to_jsonb(r)) from scoring_authority.handicap_revision_entries r'), entries);
      assert.equal(sql('select jsonb_agg(to_jsonb(r)) from scoring_authority.handicap_revision_current r'), pointer);
      assert.throws(() => sql(`update scoring_authority.handicap_revision_entries set tournament_handicap=99 where revision_id='${revisionId}'`), /IMMUTABLE_RECORD/);
      assert.equal(sql(`select count(*) from auth.users where id='${replacement}'`), '0');
      assert.equal(sql(`select count(*) from participant_identity.historical_authorship_v1 where subject_id='${id(1)}'`), '0');
      assert.equal(sql('select count(*) from participant_identity.deletion_attribution_capability_v1'), '0');
      assert.equal(sql(`select status from participant_identity.account_deletion_requests_v1 where request_id='${request(1)}'`), 'COMPLETED');
      assert.equal(sql(`select count(*) from auth.sessions where user_id='${id(1)}'`), '0');
      assert.equal(sql('select jsonb_agg(to_jsonb(r)) from scoring_authority.hole_scores r'), history);
      assert.throws(() => sql(`insert into scoring_authority.handicap_operation_receipts(id,actor_auth_user_id) values(9,'${replacement}')`), /LIVE_AUTHOR_AUTH_REQUIRED/);
      assert.throws(() => sql(`update scoring_authority.handicap_operation_receipts set actor_auth_user_id='${id(2)}' where id=1`), /IMMUTABLE_RECORD/);
    });
    await t.test('a trigger cannot piggyback Odds value changes on an authorized privacy deletion', () => {
      sql(`insert into scoring_authority.odds_published_snapshots(tournament_id,milestone,phase_order,publication_revision,published_at,published_payload,payload_hash,google_publication_fingerprint,imported_by,published_by_auth_user_id,published_by_player_id)
      values('2026','Pre-Tournament',1,2,'2026-09-14Z','{"probability":0.54321}','immutable-2','google-2','fixture','${id(3)}','P3');
      create function scoring_authority.tamper_odds() returns trigger language plpgsql as $$begin new.published_payload:='{"probability":1}';return new;end;$$;
      create trigger zzz_tamper_odds before update on scoring_authority.odds_published_snapshots for each row execute function scoring_authority.tamper_odds();`);
      const prior = oddsFacts();
      initiate(3);
      assert.throws(() => sql(`delete from auth.users where id='${id(3)}'`), /ACCOUNT_DELETION_NONATTRIBUTION_CHANGE/);
      assert.equal(oddsFacts(), prior);
      assert.equal(sql(`select count(*) from auth.users where id='${id(3)}'`), '1');
      sql('drop trigger zzz_tamper_odds on scoring_authority.odds_published_snapshots');
    });
    await t.test('protected account rolls back attribution and retains account', () => {
      sql(`insert into production_control.tournament_owner_capabilities_v1 values('${id(2)}','ACTIVE')`);
      initiate(2);const prior = rows();
      assert.throws(() => sql(`delete from auth.users where id='${id(2)}'`), /ACCOUNT_DELETION_PROTECTED/);
      assert.equal(rows(), prior);
      assert.equal(sql(`select count(*) from auth.users where id='${id(2)}'`), '1');
    });
    await t.test('a later BEFORE trigger changing timestamps fails final guard and rolls everything back', () => {
      sql(`create function scoring_authority.touch_receipt() returns trigger language plpgsql as $$begin new.updated_at:=clock_timestamp();return new;end;$$;
      create trigger zzz_touch before update on scoring_authority.handicap_operation_receipts for each row execute function scoring_authority.touch_receipt();`);
      initiate(3);const prior = rows();
      assert.throws(() => sql(`delete from auth.users where id='${id(3)}'`), /ACCOUNT_DELETION_NONATTRIBUTION_CHANGE/);
      assert.equal(rows(), prior);
      assert.equal(sql(`select count(*) from auth.users where id='${id(3)}'`), '1');
      assert.equal(sql(`select status from participant_identity.account_deletion_requests_v1 where request_id='${request(3)}'`), 'READY');
      assert.equal(sql('select count(*) from participant_identity.deletion_attribution_capability_v1'), '0');
      sql('drop trigger zzz_touch on scoring_authority.handicap_operation_receipts;');
    });
    await t.test('unexpected newly added registry binding blocks deletion instead of expanding scope', () => {
      sql(`create table scoring_authority.future_actor(actor_auth_user_id uuid references participant_identity.historical_authorship_v1);insert into scoring_authority.future_actor values('${id(4)}');`);
      initiate(4);const prior = rows();
      assert.throws(() => sql(`delete from auth.users where id='${id(4)}'`), /foreign key constraint/);
      assert.equal(rows(), prior);
      assert.equal(sql(`select count(*) from auth.users where id='${id(4)}'`), '1');
    });
  } finally {
    run(bin + 'pg_ctl', ['-D', root + '/data', '-m', 'fast', '-w', 'stop']);
  }
});
