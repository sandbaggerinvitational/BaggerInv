import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const bin = '/opt/homebrew/opt/postgresql@17/bin/';
function run(command, args, input, env) {
  const result = spawnSync(command, args, { input, env, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(result.stderr || String(result.error));
  return result.stdout.trim();
}
test('original deletion request resumes after handoff in disposable PostgreSQL', () => {
  const root = mkdtempSync('/private/tmp/bagger-completion-pg-');
  mkdirSync(`${root}/socket`);
  run(`${bin}initdb`, ['-D', `${root}/data`, '-U', 'postgres', '-A', 'trust', '--no-locale', '--set=shared_memory_type=mmap', '--set=dynamic_shared_memory_type=mmap']);
  run(`${bin}pg_ctl`, ['-D', `${root}/data`, '-l', `${root}/postgres.log`, '-o', `-F -k ${root}/socket -h '' -p 5432`, '-w', 'start']);
  const env = { ...process.env, PGHOST: `${root}/socket`, PGPORT: '5432', PGUSER: 'postgres', PGDATABASE: 'postgres' };
  const sql = input => run(`${bin}psql`, ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], input, env);
  const user = '81000000-0000-4000-8000-000000000001';
  const request = '82000000-0000-4000-8000-000000000001';
  try {
    sql(`create role anon; create role authenticated; create role service_role;
      create schema auth; create schema participant_identity; create schema production_control;
      create schema scoring_authority;
      create table auth.users(id uuid primary key,email_confirmed_at timestamptz,phone_confirmed_at timestamptz);
      create table auth.sessions(user_id uuid references auth.users on delete cascade);
      create table scoring_authority.tournaments(tournament_id text primary key);
      create table scoring_authority.matches(match_id text primary key,tournament_id text,status text);
      create table scoring_authority.tournament_players(tournament_id text,player_id text,participation_status text);
      create table scoring_authority.hole_scores(player_id text,strokes integer);
      create table production_control.tournament_owner_capabilities_v1(auth_user_id uuid references auth.users,status text);
      create table production_control.director_entitlements(auth_user_id uuid references auth.users,tournament_id text,player_id text,status text,role text,revoked_at timestamptz);
      create table participant_identity.user_player_links(auth_user_id uuid references auth.users,player_id text,status text,revoked_at timestamptz);
      create table participant_identity.tournament_roles(auth_user_id uuid references auth.users,tournament_id text,role text,role_active boolean,revoked_at timestamptz);
      create table participant_identity.participant_identity_contacts(player_id text,email text);
      create table production_control.player_external_identities_v1(
        identity_id uuid primary key, player_id text not null, provider text not null check(provider='GHIN'),
        external_identifier text not null check(external_identifier ~ '^[0-9]{5,12}$'),
        status text not null check(status in ('VERIFIED','RETIRED')),
        verified_at timestamptz not null, verified_by_player_id text not null,
        verified_by_auth_user_id uuid not null, verification_source text not null check(verification_source='DIRECTOR_CONFIRMED'),
        created_at timestamptz not null, retired_at timestamptz, retired_by_player_id text, retired_by_auth_user_id uuid,
        check((status='VERIFIED' and retired_at is null and retired_by_player_id is null and retired_by_auth_user_id is null)
          or (status='RETIRED' and retired_at is not null and retired_by_player_id is not null and retired_by_auth_user_id is not null)));
      create table production_control.synthetic_required_handicap_evidence(
        identity_id uuid references production_control.player_external_identities_v1 on delete restrict,
        handicap numeric not null);
      create function production_control.assert_production_service_role() returns void language plpgsql as $$ begin
        if current_setting('request.jwt.claim.role',true) is distinct from 'service_role' then raise exception 'SERVICE_REQUIRED';end if;end;$$;`);
    sql(readFileSync(new URL('../supabase/production_migrations/202609110101_account_deletion_review_access_v1.sql', import.meta.url), 'utf8'));
    sql(readFileSync(new URL('../supabase/production_incremental/account-deletion-completion-work-item.sql', import.meta.url), 'utf8'));
    sql(readFileSync(new URL('../supabase/production_incremental/account-deletion-completion-queue.sql', import.meta.url), 'utf8'));
    assert.equal(sql('select count(*) from participant_identity.account_deletion_requests_v1'), '0');
    for (const role of ['anon', 'authenticated']) {
      assert.equal(sql(`select has_function_privilege('${role}','public.read_account_deletion_work_item_v1(uuid)','EXECUTE')`), 'f');
    }
    sql(`insert into auth.users values('${user}',now(),null);
      insert into auth.sessions values('${user}');
      insert into participant_identity.user_player_links values('${user}','P1','ACTIVE',null);
      insert into participant_identity.participant_identity_contacts values('P1','synthetic@example.invalid');
      insert into production_control.tournament_owner_capabilities_v1 values('${user}','ACTIVE');
      insert into scoring_authority.hole_scores values('P1',4);
      insert into production_control.player_external_identities_v1 values
       ('84000000-0000-4000-8000-000000000001','P1','GHIN','123456','VERIFIED','2026-01-01Z','P2','${user}','DIRECTOR_CONFIRMED','2026-01-01Z',null,null,null),
       ('84000000-0000-4000-8000-000000000002','P1','GHIN','654321','RETIRED','2025-01-01Z','P2','${user}','DIRECTOR_CONFIRMED','2025-01-01Z','2026-01-01Z','P2','${user}'),
       ('84000000-0000-4000-8000-000000000003','P3','GHIN','789012','VERIFIED','2026-01-01Z','P2','${user}','DIRECTOR_CONFIRMED','2026-01-01Z',null,null,null);
      insert into production_control.synthetic_required_handicap_evidence values('84000000-0000-4000-8000-000000000001',8.2);`);
    const identities = () => sql('select jsonb_agg(to_jsonb(r) order by identity_id) from production_control.player_external_identities_v1 r');
    const before = identities();
    const facts = sql("select jsonb_agg(to_jsonb(r)-'external_identifier'-'status' order by identity_id) from production_control.player_external_identities_v1 r");
    sql(readFileSync(new URL('../supabase/production_incremental/account-deletion-external-identifier-redaction.sql', import.meta.url), 'utf8'));
    assert.equal(identities(), before, 'external identifier installation is inert');
    const initial = JSON.parse(sql(`set request.jwt.claim.role='service_role';select public.initiate_account_deletion_v1('${user}','${request}')`));
    assert.equal(initial.status, 'PENDING_ADMINISTRATIVE_HANDOFF');
    const claim = () => JSON.parse(sql("set request.jwt.claim.role='service_role';select public.claim_account_deletion_batch_v1()"));
    const first = claim().items[0];
    assert.equal(first.requestId, request);
    assert.deepEqual(claim(), {items:[]}, 'leased original request cannot be claimed twice');
    const finish = token => JSON.parse(sql(`set request.jwt.claim.role='service_role';select public.finish_account_deletion_attempt_v1('${request}','${token}')`));
    assert.throws(() => finish('85000000-0000-4000-8000-000000000001'), /ATTEMPT_CONFLICT/);
    const work = () => JSON.parse(sql(`set request.jwt.claim.role='service_role';select public.read_account_deletion_work_item_v1('${request}')`));
    assert.equal(work().status, initial.status);
    assert.throws(() => sql(`delete from auth.users where id='${user}'`), /ACCOUNT_DELETION_PROTECTED/);
    assert.equal(identities(), before, 'protected deletion cannot erase identifiers');
    assert.equal(finish(first.leaseToken).completed, false);
    assert.deepEqual(claim(), {items:[]}, 'pending requests are polled with bounded delay, not a busy loop');
    assert.throws(() => sql(`select public.read_account_deletion_work_item_v1('${request}')`), /SERVICE_REQUIRED/);
    assert.throws(() => sql(`set request.jwt.claim.role='service_role';select public.read_account_deletion_work_item_v1('83000000-0000-4000-8000-000000000001')`), /no rows/);
    sql(`delete from production_control.tournament_owner_capabilities_v1 where auth_user_id='${user}'`);
    // Simulated clock advancement affects only the synthetic worker queue.
    sql(`update participant_identity.account_deletion_retry_state_v1 set next_attempt_at=now()-interval '1 second' where request_id='${request}'`);
    const continued = claim().items[0];
    assert.equal(continued.requestId, request, 'worker resumes the same request after protection clears');
    assert.notEqual(continued.leaseToken, first.leaseToken);
    assert.deepEqual(work(), {requestId: request, authUserId: user, status: 'READY', completed: false});
    assert.equal(sql('select count(*) from participant_identity.account_deletion_requests_v1'), '1');
    assert.equal(sql('select count(*) from auth.users'), '1', 'work-item lookup never deletes Auth');
    // Simulates the provider transaction only inside this synthetic database.
    sql(`delete from auth.users where id='${user}'`);
    assert.deepEqual(work(), {requestId: request, authUserId: null, status: 'COMPLETED', completed: true});
    assert.equal(finish(continued.leaseToken).completed, true);
    assert.deepEqual(finish(continued.leaseToken), {completed:true,idempotent:true});
    assert.deepEqual(claim(), {items:[]}, 'completed request cannot be requeued');
    assert.equal(sql('select count(*) from participant_identity.account_deletion_retry_state_v1'), '0', 'no residual retry identity retained');
    assert.deepEqual(work(), {requestId: request, authUserId: null, status: 'COMPLETED', completed: true});
    assert.equal(sql('select count(*) from auth.sessions'), '0');
    assert.equal(sql('select count(*) from participant_identity.user_player_links'), '0');
    assert.equal(sql('select count(*) from participant_identity.participant_identity_contacts'), '0');
    assert.equal(sql('select strokes from scoring_authority.hole_scores'), '4');
    assert.equal(sql("select count(*) from production_control.player_external_identities_v1 where player_id='P1' and status='REDACTED' and external_identifier is null"), '2');
    assert.equal(sql("select external_identifier from production_control.player_external_identities_v1 where player_id='P3'"), '789012');
    assert.equal(sql("select jsonb_agg(to_jsonb(r)-'external_identifier'-'status' order by identity_id) from production_control.player_external_identities_v1 r"), facts, 'identity/evidence reference, timestamps and all other fields preserved');
    assert.equal(sql('select handicap from production_control.synthetic_required_handicap_evidence'), '8.2');
  } finally {
    run(`${bin}pg_ctl`, ['-D', `${root}/data`, '-m', 'immediate', '-w', 'stop']);
  }
});
