import test from 'node:test';import assert from 'node:assert/strict';
import {createCluster,destroyCluster,run,bin,environment,sql,sqlFile,installSupabaseCompatibility,installAnnualPlatformFixture,migrationNames} from './step13e7b1-production-annual-calcutta-postgres.integration.test.mjs';
test('expired recovery compiles on full predecessor schema without changing existing contracts',async t=>{
 const c=await createCluster();t.after(()=>destroyCluster(c));const db='expired_full';run(bin.createdb,[db],{env:environment(c)});installSupabaseCompatibility(c,db);const q=s=>sql(c,db,s);
 q('alter table auth.users add column banned_until timestamptz, add column deleted_at timestamptz;');
 const migration='202609220107_expired_identity_recovery_v1.sql';
 for(const name of (await migrationNames()).filter(x=>x!==migration)){
  sqlFile(c,db,new URL('../supabase/production_migrations/'+name,import.meta.url).pathname);
  if(name.startsWith('202608260038'))q("insert into scoring_authority.tournaments(tournament_id,tournament_year,name,source_workbook_id,scoring_authority)values('2026',2026,'Synthetic recovery fixture','1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4','GOOGLE');insert into scoring_authority.ingress_gates(tournament_id,state,authority,unresolved_client_queues,updated_by)values('2026','PAUSED','GOOGLE',0,'local');");
  if(name.startsWith('202608300068'))installAnnualPlatformFixture(c,db);
 }
 const functions=()=>JSON.parse(q("select jsonb_object_agg(p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid))) from pg_proc p where p.prokind='f' and p.pronamespace in ('public'::regnamespace,'production_control'::regnamespace,'participant_identity'::regnamespace,'scoring_authority'::regnamespace)"));
 const before=functions();sqlFile(c,db,new URL('../supabase/production_migrations/'+migration,import.meta.url).pathname);const after=functions();
 for(const [key,value] of Object.entries(before))assert.equal(after[key],value,key+' unchanged');
 assert.equal(Object.keys(after).length-Object.keys(before).length,6);assert.equal(q('select count(*) from production_control.expired_identity_recovery_approvals_v1'),'0');assert.equal(q('select count(*) from production_control.expired_identity_recovery_receipts_v1'),'0');
});
