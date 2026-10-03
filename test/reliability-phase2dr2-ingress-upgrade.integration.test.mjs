// Owned local upgrade proof. Historical definitions remain immutable.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createCertificationFixture,certificationForwardMigrations} from './support/reliability/phase2d-certification-fixture.mjs';
import {destroyIsolatedCluster,jsonLiteral,openSqlSession,sqlFile} from './support/reliability/postgres17.mjs';
import {buildTournamentSetupMutation} from '../lib/production-tournament-setup-contract.js';

const migration='supabase/production_migrations/202609300136_certification_durable_ingress_v1.sql';
const predecessor=[...certificationForwardMigrations,
 'supabase/production_migrations/202609300134_certification_annual_administration_v1.sql',
 'supabase/production_migrations/202609300135_certification_read_contracts_v1.sql'];
function setup(f,name){const id=randomUUID(),payload=buildTournamentSetupMutation('update-tournament',{
 expectedRevision:f.model().revision,operationRequestId:id,name,destination:'Synthetic upgrade course',
 startDate:'2026-09-20',endDate:'2026-09-22',timeZone:'America/Chicago',operationalStatus:'UPCOMING'});
 delete payload.operation_request_id;
 return f.command('DIRECTOR.MUTATE_SETUP',{...payload,action:'update-tournament'},{operation_request_id:id});}

test('R2 ingress forward upgrade fences old executions, preserves public OID and rejects unexpected ACLs',async t=>{
 const f=await createCertificationFixture({forwardMigrations:predecessor,databases:3});
 const source=await readFile(migration,'utf8'),evidence={environment:'OWNED_LOCAL_POSTGRESQL17',cases:[]};
 try{
  await t.test('upgrade waits for a genuinely executing predecessor mutation before creating the ingress generation',async()=>{
   const r=f.resources[0],request=setup(r,'In-flight predecessor'),writer=openSqlSession(f.cluster,r.database),installer=openSqlSession(f.cluster,r.database);
   let installed=false,pending;
   try{
    const result=JSON.parse(await writer.query(`begin;set local role service_role;select public.execute_certification_operation_v1(${jsonLiteral(request)})`));assert.equal(result.ok,true);
    pending=installer.query(source).then(v=>{installed=true;return v;});
    await new Promise(resolve=>setTimeout(resolve,150));
    evidence.cases.push({id:'INFLIGHT_UPGRADE_FENCE',migrationCompletedWhilePredecessorTransactionActive:installed});
    assert.equal(installed,false,'Migration must wait for the active canonical predecessor transaction');
   }finally{await writer.query('commit');if(pending)await pending;await writer.close();await installer.close();}
   assert.equal(r.q('select count(*)from production_control.certification_ingress_generations_v1'),'1');
   assert.throws(()=>r.rpc('admit_certification_operation_v1',{...request,expected_context_token:r.context().context_token}),/EXISTING_RECEIPT_REQUIRES_RECOVERY/);
   assert.equal(r.q('select count(*)from production_control.certification_ingress_leases_v1'),'0');
  });
  await t.test('already-invoked cached predecessor execution cannot resume with its old context after upgrade',async()=>{
   const r=f.resources[1],request=setup(r,'Blocked predecessor'),holder=openSqlSession(f.cluster,r.database),caller=openSqlSession(f.cluster,r.database);
   let pending;
   try{
    await holder.query('begin;select pg_advisory_xact_lock(production_control.scoring_admission_lock_key())');
    pending=caller.query(`set role service_role;select public.execute_certification_operation_v1(${jsonLiteral(request)})`).then(v=>({value:v}),error=>({error:error.message}));
    await new Promise(resolve=>setTimeout(resolve,100));
    assert.equal(r.q("select count(*)from pg_stat_activity where datname=current_database()and wait_event='advisory'and query like'%execute_certification_operation_v1%'"),'1');
    await holder.query(source);
    const result=await pending;
    evidence.cases.push({id:'BLOCKED_OLD_EXECUTE',result});
    assert.match(result.error||'',/CONTEXT_STALE|INGRESS_LEASE_REQUIRED/);
    assert.equal(r.q(`select count(*)from production_control.tournament_setup_operation_receipts_v1 where operation_request_id='${request.operation_request_id}'`),'0');
   }finally{await holder.close();await caller.close();}
  });
  await t.test('unknown default EXECUTE grantee aborts entire migration; prepared public entry retains OID and denies no-lease call',async()=>{
   const r=f.resources[2],session=openSqlSession(f.cluster,r.database),request=setup(r,'Cached public call');
   const catalog=()=>r.q(`select jsonb_agg(jsonb_build_object('oid',p.oid,'schema',n.nspname,'name',p.proname,'args',pg_get_function_identity_arguments(p.oid),
    'src',p.prosrc,'owner',p.proowner,'acl',p.proacl,'secdef',p.prosecdef,'config',p.proconfig)order by p.oid)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('production_control','public','scoring_authority','participant_identity')
    and p.prokind='f'and p.proname not like'%certification%'`);
   const before=catalog(),oid=r.q("select 'public.execute_certification_operation_v1(jsonb)'::regprocedure::oid");
   try{
    r.q('create role r2_unreviewed_ingress nologin;alter default privileges in schema production_control grant execute on functions to r2_unreviewed_ingress');
    assert.throws(()=>sqlFile(f.cluster,r.database,migration,{role:''}),/PRIVATE_PRIVILEGE_EXPANSION/);
    assert.equal(r.q("select to_regclass('production_control.certification_ingress_leases_v1')is null"),'t');
    r.q('alter default privileges in schema production_control revoke execute on functions from r2_unreviewed_ingress');
    r.q('alter default privileges in schema public grant execute on functions to r2_unreviewed_ingress');
    assert.throws(()=>sqlFile(f.cluster,r.database,migration,{role:''}),/PUBLIC_PRIVILEGE_EXPANSION/);
    assert.equal(r.q("select to_regclass('production_control.certification_ingress_leases_v1')is null"),'t');
    r.q('alter default privileges in schema public revoke execute on functions from r2_unreviewed_ingress');
    r.q('alter default privileges in schema production_control grant select on tables to r2_unreviewed_ingress');
    assert.throws(()=>sqlFile(f.cluster,r.database,migration,{role:''}),/PRIVATE_RELATION_PRIVILEGE_EXPANSION/);
    assert.equal(r.q("select to_regclass('production_control.certification_ingress_leases_v1')is null"),'t');
    r.q('alter default privileges in schema production_control revoke select on tables from r2_unreviewed_ingress');
    await session.query('set role service_role;prepare r2_cached_certification(jsonb)as select public.execute_certification_operation_v1($1)');
    sqlFile(f.cluster,r.database,migration,{role:''});
    assert.equal(r.q("select 'public.execute_certification_operation_v1(jsonb)'::regprocedure::oid"),oid);
    assert.equal(catalog(),before);
    await assert.rejects(session.query(`execute r2_cached_certification(${jsonLiteral(request)})`),/INGRESS_LEASE_REQUIRED/);
    assert.equal(r.q('select count(*)from production_control.certification_ingress_leases_v1'),'0');
   }finally{await session.close();}
  });
 }finally{
  await writeFile('/private/tmp/r2-ingress-upgrade-evidence.json',JSON.stringify(evidence,null,2)+'\n');
  await destroyIsolatedCluster(f.cluster);
 }
});
