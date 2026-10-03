// Real process/retry/expiry proof in an owned disposable local PostgreSQL17.
// Expiry uses the actual five-minute admission lifetime. No clock override,
// disabled guard, shortened production duration or fabricated terminal row.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {writeFile,readFile} from 'node:fs/promises';
import {createCertificationFixture,certificationForwardMigrations} from './support/reliability/phase2d-certification-fixture.mjs';
import {destroyIsolatedCluster,restartIsolatedCluster,jsonLiteral,openSqlSession} from './support/reliability/postgres17.mjs';
import {buildTournamentSetupMutation} from '../lib/production-tournament-setup-contract.js';

const migrations=[...certificationForwardMigrations,...['134_certification_annual_administration', '135_certification_read_contracts', '136_certification_durable_ingress', '137_certification_domain_resource_recovery', '138_certification_annual_transition', '139_certification_future_authoring', '140_certification_future_scoring', '141_certification_future_workers', '142_certification_required_worker_reads', '143_certification_odds_owner_publication', '145_certification_closed_tournament_read', '146_certification_successor_current_reads'].map(name=>'supabase/production_migrations/202609300'+name+'_v1.sql')];
const proofFiles=[...migrations,'test/reliability-phase2dr2-ingress-stress.integration.test.mjs',
 'test/support/reliability/phase2d-certification-fixture.mjs','test/support/reliability/phase2d-resource-bootstrap.mjs',
 'test/support/reliability/postgres17.mjs','lib/production-tournament-setup-contract.js','tools/reliability/phase2-network-deny.cjs'];
const sourceManifest=async()=>Object.fromEntries(await Promise.all(proofFiles.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));
test('R2 ingress full lifecycle stress:20 callers, connection death, restart, actual expiry and close race',{timeout:420000},async t=>{
 const sourceBefore=await sourceManifest();
 const f=await createCertificationFixture({forwardMigrations:migrations});const {q,rpc,resource}=f;
 const make=(name='Stress canonical update')=>{const id=randomUUID(),payload=buildTournamentSetupMutation('update-tournament',{
  expectedRevision:f.model().revision,operationRequestId:id,name,destination:'Synthetic course',startDate:'2026-09-20',
  endDate:'2026-09-22',timeZone:'America/Chicago',operationalStatus:'UPCOMING'});delete payload.operation_request_id;
  return f.command('DIRECTOR.MUTATE_SETUP',{...payload,action:'update-tournament'},{operation_request_id:id});};
 const admit=input=>rpc('admit_certification_operation_v1',input);
 const bound=(input,lease)=>({...input,ingress:{lease_id:lease.lease_id,admission_generation_id:lease.admission_generation_id}});
 const execute=(input,lease)=>rpc('execute_certification_operation_v1',bound(input,lease));
 const status=input=>rpc('read_certification_ingress_status_v1',{...input,payload:{}});
 const resolve=input=>rpc('resolve_certification_ingress_v1',input);
 const generation=()=>JSON.parse(q("select to_jsonb(g)from production_control.certification_ingress_generations_v1 g where state in('OPEN','CLOSING')"));
 const close=g=>JSON.parse(q(`select production_control.close_certification_ingress_generation_v1('${resource.resource_id}','${g.generation_id}',${g.revision})`));
 const reopen=g=>JSON.parse(q(`select production_control.reopen_certification_ingress_generation_v1('${resource.resource_id}','${g.generation_id}',${g.generation_revision})`));
 const records=[];
 try{
  // Start real expiry early while independent stress cases exercise the same
  // admitted generation. Do not execute this request; setup revisions may move.
  const expiring=make('Actual-expiry operation'),expiredLease=admit(expiring);
  const expiry=Number(q(`select extract(epoch from expires_at)*1000 from production_control.certification_ingress_leases_v1 where lease_id='${expiredLease.lease_id}'`));
  await t.test('twenty concurrent admission and execution attempts create one canonical receipt',async()=>{
   const input=make('20-way identical operation'),before=Number(q('select count(*)from production_control.certification_ingress_leases_v1'));
   const concurrent=async statement=>{const sessions=Array.from({length:20},()=>openSqlSession(f.cluster,f.database));
    try{return await Promise.all(sessions.map(s=>s.query('set role service_role;'+statement).then(JSON.parse)));}
    finally{await Promise.all(sessions.map(s=>s.close()));}};
   const admitted=await concurrent(`select public.admit_certification_operation_v1(${jsonLiteral(input)})`);
   assert.equal(new Set(admitted.map(v=>v.lease_id)).size,1);assert.equal(Number(q('select count(*)from production_control.certification_ingress_leases_v1')),before+1);
   const results=await concurrent(`select public.execute_certification_operation_v1(${jsonLiteral(bound(input,admitted[0]))})`);
   assert.ok(results.every(result=>JSON.stringify(result)===JSON.stringify(results[0])));assert.equal(results[0].ok,true);
   assert.equal(q(`select count(*)from production_control.tournament_setup_operation_receipts_v1 where operation_request_id='${input.operation_request_id}'`),'1');
   assert.equal(status(input).state,'COMMITTED');records.push({id:'20_IDENTICAL',admissionAttempts:20,executionAttempts:20,canonicalReceipts:1});
  });
  await t.test('twenty conflicting payloads cannot share admitted identity',async()=>{
   const input=make('Original conflict identity'),lease=admit(input);
   const sessions=Array.from({length:20},()=>openSqlSession(f.cluster,f.database));
   try{const outcomes=await Promise.all(sessions.map((s,index)=>s.query(`set role service_role;select public.admit_certification_operation_v1(${jsonLiteral({...input,payload:{...input.payload,tournament_name:'Conflict '+index}})})`).then(()=>false,error=>/IDEMPOTENCY_CONFLICT/.test(error.message))));
    assert.ok(outcomes.every(Boolean));}finally{await Promise.all(sessions.map(s=>s.close()));}
   assert.equal(status(input).lease_id,lease.lease_id);assert.equal(resolve(input).state,'NOT_COMMITTED');records.push({id:'20_CONFLICTING',conflicts:20});
  });
  await t.test('deterministic canonical rejection records NOT_COMMITTED with the established domain result',()=>{
   const input=make('Stale setup revision');input.payload.expected_revision--;
   const lease=admit(input),result=execute(input,lease);
   assert.equal(result.ok,false);assert.match(result.code,/CONFLICT|REVISION/);
   const outcome=status(input);assert.equal(outcome.state,'NOT_COMMITTED');assert.deepEqual(outcome.result,result);
   assert.equal(q(`select count(*)from production_control.tournament_setup_operation_receipts_v1 where operation_request_id='${input.operation_request_id}'`),'0');
   records.push({id:'DOMAIN_REJECTION',code:result.code,state:outcome.state});
  });
  await t.test('actual connection death before commit rolls back canonical work but retains admission',async()=>{
   const input=make('Terminated executor'),lease=admit(input),writer=openSqlSession(f.cluster,f.database);
   try{const pid=Number(await writer.query('select pg_backend_pid()'));
    const result=JSON.parse(await writer.query(`begin;set local role service_role;select public.execute_certification_operation_v1(${jsonLiteral(bound(input,lease))})`));assert.equal(result.ok,true);
    assert.equal(q(`select pg_terminate_backend(${pid})`),'t');await writer.close();
   }finally{await writer.close();}
   assert.equal(status(input).state,'ADMITTED');assert.equal(q(`select count(*)from production_control.tournament_setup_operation_receipts_v1 where operation_request_id='${input.operation_request_id}'`),'0');
   assert.equal(execute(input,lease).ok,true);assert.equal(status(input).state,'COMMITTED');records.push({id:'CONNECTION_DEATH',sameLeaseRetry:'COMMITTED'});
  });
  await t.test('terminal-audit failure atomically rolls back domain receipt and terminal outcome',()=>{
   const input=make('Terminal audit failure'),lease=admit(input),before=q("select row_to_json(t)from scoring_authority.tournaments t where tournament_id='2026'");
   q(`create function production_control.r2_terminal_fault()returns trigger language plpgsql as $$begin if new.event_type='CERTIFICATION_INGRESS_TERMINAL'then raise exception 'R2_TERMINAL_AUDIT_FAULT';end if;return new;end$$;
    create trigger r2_terminal_fault before insert on production_control.operation_audit_events for each row execute function production_control.r2_terminal_fault()`);
   try{assert.throws(()=>execute(input,lease),/R2_TERMINAL_AUDIT_FAULT/);}finally{q('drop trigger r2_terminal_fault on production_control.operation_audit_events;drop function production_control.r2_terminal_fault()');}
   assert.equal(q("select row_to_json(t)from scoring_authority.tournaments t where tournament_id='2026'"),before);
   assert.equal(status(input).state,'ADMITTED');assert.equal(q(`select count(*)from production_control.tournament_setup_operation_receipts_v1 where operation_request_id='${input.operation_request_id}'`),'0');
   assert.equal(execute(input,lease).ok,true);records.push({id:'ATOMIC_TERMINAL_AUDIT',retry:'COMMITTED'});
  });
  await t.test('physical PostgreSQL process restart retains admitted and committed evidence',()=>{
   const input=make('Restart survives'),lease=admit(input),before=q('select jsonb_agg(to_jsonb(l)order by admission_sequence)from production_control.certification_ingress_leases_v1 l');
   restartIsolatedCluster(f.cluster);
   assert.equal(q('select jsonb_agg(to_jsonb(l)order by admission_sequence)from production_control.certification_ingress_leases_v1 l'),before);
   assert.equal(status(input).state,'ADMITTED');assert.equal(execute(input,lease).ok,true);records.push({id:'PHYSICAL_PROCESS_RESTART',powerLossProof:false});
  });
  await t.test('real lease expiry remains unresolved and blocks drain until authoritative resolution',async()=>{
   const remaining=Math.max(0,expiry-Date.now()+150);assert.ok(remaining<=301000);
   t.diagnostic(`Waiting ${Math.ceil(remaining/1000)} seconds for the actual five-minute lease lifetime; no clock or lease mutation.`);
   let waitUntil=Date.now()+remaining;while(Date.now()<waitUntil){await new Promise(resolve=>setTimeout(resolve,Math.min(30000,waitUntil-Date.now())));t.diagnostic('Actual lease expiry wait: '+Math.max(0,Math.ceil((waitUntil-Date.now())/1000))+'seconds remaining');}
   assert.equal(q(`select expires_at<clock_timestamp()from production_control.certification_ingress_leases_v1 where lease_id='${expiredLease.lease_id}'`),'t');
   assert.equal(status(expiring).state,'ADMITTED');assert.throws(()=>execute(expiring,expiredLease),/EXECUTION_FENCED/);
   const closing=close(generation());assert.equal(closing.state,'CLOSING');assert.equal(closing.drained,false);assert.equal(closing.active_count,1);
   assert.equal(resolve(expiring).state,'NOT_COMMITTED');
   const closed=close(generation());assert.equal(closed.state,'CLOSED');assert.equal(closed.drained,true);assert.equal(closed.post_close_writes,0);
   reopen(closed);records.push({id:'REAL_EXPIRY',durationSeconds:300,automaticNonCommit:false,drainBlockedUntilResolution:true});
  });
  await t.test('close waits for active canonical execution; no old-generation write can land afterward',async()=>{
   const input=make('Close races executor'),lease=admit(input),g=generation(),writer=openSqlSession(f.cluster,f.database),closer=openSqlSession(f.cluster,f.database);
   try{
    assert.equal(JSON.parse(await writer.query(`begin;set local role service_role;select public.execute_certification_operation_v1(${jsonLiteral(bound(input,lease))})`)).ok,true);
    let completed=false;const pending=closer.query(`select production_control.close_certification_ingress_generation_v1('${resource.resource_id}','${g.generation_id}',${g.revision})`).then(v=>{completed=true;return JSON.parse(v);});
    await new Promise(resolve=>setTimeout(resolve,100));assert.equal(completed,false);
    await writer.query('commit');const closed=await pending;assert.equal(closed.state,'CLOSED');assert.equal(closed.committed_count,1);
    assert.equal(closed.high_watermark,lease.admission_sequence);assert.equal(closed.post_close_admissions,0);assert.equal(closed.post_close_writes,0);
    assert.equal(status(input).state,'COMMITTED');records.push({id:'EXECUTE_CLOSE_RACE',closeWaited:true});
   }finally{await writer.close();await closer.close();}
  });
 }finally{
  const sourceAfter=await sourceManifest(),sourceStable=JSON.stringify(sourceBefore)===JSON.stringify(sourceAfter);
  await writeFile('/private/tmp/r2-ingress-stress-evidence.json',JSON.stringify({sourceBefore,sourceAfter,sourceStable,status:records.length===8&&sourceStable?'PASS':'PARTIAL',profile:{through:146,excluded:[144]},scope:'Durable ingress core close/reopen, not annual abort/reopen authority',environment:'OWNED_LOCAL_POSTGRESQL17',records,hostedAccess:false,googleCalls:0,powerLossDurability:'NOT_PROVEN'},null,2)+'\n');
  await destroyIsolatedCluster(f.cluster);assert.equal(sourceStable,true);
 }
});
