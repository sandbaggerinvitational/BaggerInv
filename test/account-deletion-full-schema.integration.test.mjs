import test from 'node:test';
import assert from 'node:assert/strict';
import { accountDeletionMinimizationSql } from '../scripts/package-account-deletion-minimization.mjs';
import { createCluster, destroyCluster, run, bin, environment, sql, sqlFile,
  installSupabaseCompatibility, installAnnualPlatformFixture, migrationNames }
  from './step13e7b1-production-annual-calcutta-postgres.integration.test.mjs';

test('complete deployed-source attribution topology accepts the inert deletion candidate', async t => {
  const c = await createCluster();
  t.after(() => destroyCluster(c));
  const db = 'deletion_minimization';
  run(bin.createdb, [db], { env: environment(c) });
  installSupabaseCompatibility(c, db);
  const q = text => sql(c, db, text);
  for (const name of (await migrationNames()).filter(n => n <= '202609140112_production_scramble_read_snapshot_authority.sql')) {
    sqlFile(c, db, new URL(`../supabase/production_migrations/${name}`, import.meta.url).pathname);
    if (name.startsWith('202608260038')) q(`insert into scoring_authority.tournaments(tournament_id,tournament_year,name,source_workbook_id,scoring_authority) values('2026',2026,'Local fixture','1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4','GOOGLE');insert into scoring_authority.ingress_gates(tournament_id,state,authority,unresolved_client_queues,updated_by)values('2026','PAUSED','GOOGLE',0,'local');`);
    if (name.startsWith('202608300068')) installAnnualPlatformFixture(c, db);
  }
  const functions = () => JSON.parse(q(`select coalesce(jsonb_object_agg(p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid))),'{}') from pg_proc p where p.prokind='f' and p.pronamespace in ('public'::regnamespace,'production_control'::regnamespace,'scoring_authority'::regnamespace,'participant_identity'::regnamespace)`));
  const before = functions();
  const requestCount = q('select count(*) from participant_identity.account_deletion_requests_v1');
  const packageSql = accountDeletionMinimizationSql();
  assert.throws(() => q(packageSql.replace(/commit;\s*$/i,'select 1/0;commit;')), /division by zero/);
  assert.equal(q("select to_regclass('participant_identity.deletion_attribution_columns_v1') is null"),'t','failed installation rolls the entire package back');
  assert.deepEqual(functions(),before,'failed installation leaves all original guards intact');
  q(packageSql);
  const portraitSql = (await import('node:fs')).readFileSync(new URL('../supabase/production_incremental/player-portrait-policy-v1.sql',import.meta.url),'utf8');
  const installedDeletionFunctions=functions();
  assert.throws(()=>q(portraitSql.replace(/commit;\s*$/i,'select 1/0;commit;')),/division by zero/);
  assert.equal(q("select to_regclass('participant_identity.player_portrait_policy_v1') is null"),'t');
  assert.deepEqual(functions(),installedDeletionFunctions);
  q(portraitSql);
  const installedPortraitFunctions=functions();
  for (const [name,hash] of Object.entries(installedDeletionFunctions)) assert.equal(installedPortraitFunctions[name],hash,`existing deletion/authority function unchanged: ${name}`);
  assert.equal(q('select count(*) from participant_identity.player_portrait_policy_v1'),'0');
  assert.equal(q('select revision from participant_identity.player_portrait_policy_clock_v1'),'0');
  const after = functions();
  for (const [name, hash] of Object.entries(before)) {
    if (/require_live_authorship_v1|reject.*immutable|guard_odds_snapshot_immutability|net_skins_entry_history_immutable_v1/.test(name)) continue;
    assert.equal(after[name], hash, `unrelated function preserved: ${name}`);
  }
  assert.equal(q('select count(*) from participant_identity.account_deletion_requests_v1'), requestCount);
  assert.equal(q('select count(*) from participant_identity.account_deletion_retry_state_v1'),'0');
  assert.equal(q('select count(*) from participant_identity.deletion_attribution_capability_v1'),'0');
  assert.equal(q('select count(*) from participant_identity.deletion_attribution_columns_v1'),'63');
  for (const role of ['anon','authenticated','service_role']) {
    assert.equal(q(`select has_table_privilege('${role}','participant_identity.deletion_attribution_capability_v1','INSERT')`),'f');
  }
  for (const role of ['anon','authenticated']) {
    assert.equal(q(`select has_function_privilege('${role}','public.claim_account_deletion_batch_v1()','EXECUTE')`),'f');
  }
  assert.deepEqual(JSON.parse(q('select public.claim_account_deletion_batch_v1()')), {items:[]});
});
