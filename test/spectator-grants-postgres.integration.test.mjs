import test from 'node:test';
import assert from 'node:assert/strict';
import {available,createCluster,destroyCluster,run,bin,environment,sql,sqlFile,installSupabaseCompatibility,installAnnualPlatformFixture,migrationNames} from './step13e7b1-production-annual-calcutta-postgres.integration.test.mjs';
test('spectator leaves complete local Production schema closed to anonymous database access',async t=>{
 assert(await available());const c=await createCluster();t.after(()=>destroyCluster(c));const db='spectator_grants';
 run(bin.createdb,[db],{env:environment(c)});installSupabaseCompatibility(c,db);const q=s=>sql(c,db,s);
 q('alter table auth.users add column banned_until timestamptz, add column deleted_at timestamptz;');
 for(const name of await migrationNames()){
  sqlFile(c,db,new URL('../supabase/production_migrations/'+name,import.meta.url).pathname);
  if(name.startsWith('202608260038'))q("insert into scoring_authority.tournaments(tournament_id,tournament_year,name,source_workbook_id,scoring_authority)values('2026',2026,'Isolated spectator grant audit','1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4','GOOGLE');insert into scoring_authority.ingress_gates(tournament_id,state,authority,unresolved_client_queues,updated_by)values('2026','PAUSED','GOOGLE',0,'local');");
  if(name.startsWith('202608300068'))installAnnualPlatformFixture(c,db);
 }
 for(const role of ['anon','authenticated']){
  const exposed=JSON.parse(q(`select coalesce(jsonb_agg(n.nspname||'.'||c.relname),'[]') from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname in ('scoring_authority','participant_identity','production_control') and (has_table_privilege('${role}',c.oid,'SELECT') or has_table_privilege('${role}',c.oid,'INSERT') or has_table_privilege('${role}',c.oid,'UPDATE') or has_table_privilege('${role}',c.oid,'DELETE'));`));
  assert.deepEqual(exposed,[],role+' cannot directly read private/scoring/money tables or write');
  const callable=JSON.parse(q(`select coalesce(jsonb_agg(p.oid::regprocedure::text),'[]') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '(net_skins|calcutta|round_scoring)' and has_function_privilege('${role}',p.oid,'EXECUTE');`));
  assert.deepEqual(callable,[],role+' cannot invoke money-game or Director round RPCs');
 }
 for(const table of ['scoring_authority.hole_scores','scoring_authority.matches','participant_identity.user_player_links']){
  assert.throws(()=>q(`set role anon;select * from ${table} limit 1;`),/permission denied/);
 }
});
