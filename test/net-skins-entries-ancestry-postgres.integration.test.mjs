import test from 'node:test';
import assert from 'node:assert/strict';
import {available,createCluster,destroyCluster,run,bin,environment,sql,sqlFile,installSupabaseCompatibility,installAnnualPlatformFixture,migrationNames}
  from './step13e7b1-production-annual-calcutta-postgres.integration.test.mjs';
const file=name=>new URL('../supabase/production_migrations/'+name,import.meta.url).pathname;
test('entry prerequisite compiles after actual 001–097 without redefining installed authorities',async t=>{
  assert.ok(await available());const c=await createCluster();t.after(()=>destroyCluster(c));const db='entries_ancestry';
  run(bin.createdb,[db],{env:environment(c)});installSupabaseCompatibility(c,db);
  for(const name of (await migrationNames()).filter(n=>n<'202609090098')){
    sqlFile(c,db,file(name));
    if(name.startsWith('202608260038'))sql(c,db,`insert into scoring_authority.tournaments(tournament_id,tournament_year,name,source_workbook_id,scoring_authority)
      values('2026',2026,'Entry test','1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4','GOOGLE');
      insert into scoring_authority.ingress_gates(tournament_id,state,authority,unresolved_client_queues,updated_by)values('2026','PAUSED','GOOGLE',0,'test');`);
    if(name.startsWith('202608300068'))installAnnualPlatformFixture(c,db);
  }
  const signature=()=>sql(c,db,`select md5(string_agg(oid::text||prosrc,'' order by oid)) from pg_proc
    where pronamespace in ('production_control'::regnamespace,'scoring_authority'::regnamespace,'public'::regnamespace)
    and proname not in('net_skins_entry_history_immutable_v1','net_skins_entry_field_v1','net_skins_entries_projection_v1',
      'read_production_net_skins_entries_v1','save_production_net_skins_entries_v1')`);
  const before=signature();sqlFile(c,db,file('202609090098_production_net_skins_entries_v1.sql'));assert.equal(signature(),before);
  assert.equal(sql(c,db,'select count(*) from production_control.net_skins_entry_revisions_v1'),'0');
  assert.equal(JSON.parse(sql(c,db,"select production_control.net_skins_entries_projection_v1('2026')")).contract,'production-net-skins-entries-v1');
});
