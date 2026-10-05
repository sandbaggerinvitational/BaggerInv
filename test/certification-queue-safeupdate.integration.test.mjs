import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createQueueFixture} from './support/reliability/certification-queue-fixture.mjs';
import {enableOwnedSafeupdate} from './support/reliability/pg-safeupdate.mjs';
import {sqlFile,sqlResult,jsonLiteral,repositoryRoot,destroyIsolatedCluster} from './support/reliability/postgres17.mjs';
import {queueControl,queueRetry,QUEUE_CONTRACT} from '../lib/certification-queue-supervision.js';
import {publicationTransport,handleOwnerQueuePublication,PUBLICATION_PATH} from '../lib/certification-queue-publisher.js';
import {createCertificationWorkerDemand} from '../tools/reliability/certification-worker-demand.mjs';
import {demandCheckpointSink} from './support/reliability/certification-demand-checkpoint.mjs';
const sqlRoot=repositoryRoot+'/supabase/production_incremental/';
const artifact=sqlRoot+'certification-queue-safeupdate-v4.sql';
const history=f=>f.q(`select jsonb_build_object('v1',(select to_jsonb(t)from production_control.worker_supervisor_installation_v1 t),
 'v2',(select to_jsonb(t)from production_control.worker_supervisor_queue_installation_v2 t),
 'v3',(select to_jsonb(t)from production_control.worker_supervisor_publisher_installation_v3 t))`);
const functions=f=>JSON.parse(f.q(`select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'source',p.prosrc,
 'owner',p.proowner,'acl',p.proacl,'security',p.prosecdef,'config',p.proconfig)order by p.oid::regprocedure::text)
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
 (n.nspname='production_control'and p.proname like 'worker_supervisor_%')or
 (n.nspname='public'and p.proname in('execute_certification_queue_supervisor_v2','execute_certification_queue_publication_v3','execute_certification_supervisor_v1'))`));
// Outer SQL predicate, not a WHERE buried in an EXISTS/value expression.
function outerWhere(text){
 let depth=0,quote=false;
 for(let i=0;i<text.length;i++){
  if(text[i]==="'"){if(quote&&text[i+1]==="'"){i++;continue;}quote=!quote;continue;}
  if(quote)continue;if(text[i]==='(')depth++;if(text[i]===')')depth--;
  if(depth===0&&/^where\b/i.test(text.slice(i))&&!/\w/.test(text[i-1]||''))return true;
 }
 return false;
}
function mutations(list){return list.flatMap(f=>[...f.source.matchAll(/\b(?:update\s+[\w.]+\s+set|delete\s+from\s+[\w.]+)[\s\S]*?;/gi)]
 .map(m=>({signature:f.signature,statement:m[0],predicateSafe:outerWhere(m[0])})));}
function publicationAdapter(f){
 const original=f.dependencies.fetchImpl;
 f.dependencies.fetchImpl=async(url,init)=>{
  if(!url.endsWith('/execute_certification_queue_publication_v3'))return original(url,init);
  const r=sqlResult(f.cluster,f.database,`\\set VERBOSITY verbose\nset role service_role;select public.execute_certification_queue_publication_v3(${jsonLiteral(JSON.parse(init.body).input)})`,{role:'service_role'});
  if(r.status){const m=/ERROR:\s+([A-Z0-9]{5}):\s*([^\n]+)/.exec(r.stderr);assert.ok(m,r.stderr);return Response.json({code:m[1],message:m[2]},{status:400});}
  return Response.json(JSON.parse(r.stdout.trim()));
 };
}
test('real PostgreSQL17 safeupdate reproduces the hosted BEGIN rollback before any worker admission',async()=>{
 const f=await createQueueFixture();
 try{
  f.toggle(true);f.start({budget:1});const e=f.batch().messages[0];
  await enableOwnedSafeupdate(f);await f.due(e);
  const before=f.q('select to_jsonb(s)from production_control.worker_supervisor_v1 s');
  await assert.rejects(f.consume(e),error=>{
   assert.equal(error.sqlstate,'21000');assert.equal(error.queueDisposition,'FAIL');assert.equal(error.status,503);
   assert.equal(queueRetry(error,{deliveryCount:1}),undefined);return true;
  });
  assert.equal(f.q('select to_jsonb(s)from production_control.worker_supervisor_v1 s'),before);
  assert.equal(f.q('select state from production_control.worker_supervisor_invocations_v1'),'RESERVED');
  assert.equal(f.status().consumed,0);assert.equal(f.status().counts.active_claims,0);
  assert.equal(f.status().consecutive_global_failures,0);assert.equal(f.status().consecutive_invocation_failures,0);
  assert.equal(f.calls.some(c=>c.operation?.startsWith('WORKERS.')),false);
 }finally{await destroyIsolatedCluster(f.cluster);}
});
test('Queue v4: predicate inventory, actual safeupdate, canonical worker/claim/output, replay/recovery/control',async t=>{
 const f=await createQueueFixture();
 const check=async(name,fn)=>{let error;await t.test(name,async()=>{try{await fn();}catch(e){error=e;throw e;}});if(error)throw error;};
 try{
  sqlFile(f.cluster,f.database,sqlRoot+'certification-queue-preview-publisher-v3.sql',{role:''});publicationAdapter(f);
  const beforeFunctions=functions(f),before=mutations(beforeFunctions),priorHistory=history(f);
  const metadata=f=>functions(f).map(({source,...rest})=>rest);
  const priorMetadata=metadata(f);
  await enableOwnedSafeupdate(f);
  await check('full effective mutation inventory: seven unsafe singleton updates; all other statements already qualified',async()=>{
   assert.equal(before.filter(x=>!x.predicateSafe).length,7);
   assert.ok(before.filter(x=>!x.predicateSafe).every(x=>x.statement.startsWith('update production_control.worker_supervisor_v1')));
   assert.equal(before.some(x=>/^delete/i.test(x.statement)),false);
   // Corrupt only the local candidate's second postimage expectation. The
   // first replacement then fails later in the same install transaction.
   const candidate=await readFile(artifact,'utf8');
   const manifest=JSON.parse(candidate.split('$manifest$')[1]);
   const damaged=candidate.replace(manifest[1].new_hash,'0'.repeat(64));
   const rejected=sqlResult(f.cluster,f.database,damaged,{role:''});
   assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/SUPERVISOR_PATCH_HASH_DRIFT/);
   assert.deepEqual(functions(f),beforeFunctions);assert.equal(history(f),priorHistory);
   assert.equal(f.q("select to_regclass('production_control.worker_supervisor_safeupdate_installation_v4')is null"),'t');
   sqlFile(f.cluster,f.database,artifact,{role:''});
   const after=mutations(functions(f));assert.equal(after.filter(x=>!x.predicateSafe).length,0);
   assert.ok(after.filter(x=>x.statement.startsWith('update production_control.worker_supervisor_v1')).every(x=>/where singleton and epoch=s\.epoch and revision=s\.revision/.test(x.statement)));
   assert.equal(history(f),priorHistory);assert.deepEqual(metadata(f),priorMetadata);
   const dir=repositoryRoot+'/docs/reliability/phase2d-worker-supervision/safeupdate-v4/evidence';await mkdir(dir,{recursive:true});
   await writeFile(dir+'/mutation-inventory.json',JSON.stringify({scope:'installed effective v1+v2+v3',before,after},null,2)+'\n');
  });
  await check('atomic guarded forward replay, historical receipts and all function metadata preserved',async()=>{
   const receipt=f.q('select to_jsonb(t)from production_control.worker_supervisor_safeupdate_installation_v4 t');
   sqlFile(f.cluster,f.database,artifact,{role:''});assert.equal(f.q('select to_jsonb(t)from production_control.worker_supervisor_safeupdate_installation_v4 t'),receipt);
   assert.equal(history(f),priorHistory);assert.equal(f.status().state,'OFF');
   // Owned rollback-only catalog drift. Reject the artifact before changing any function.
   const text=await readFile(artifact,'utf8');
   const result=sqlResult(f.cluster,f.database,"begin;alter function public.execute_certification_queue_supervisor_v2(jsonb) set search_path=public;\n"+text.replace(/^\\set ON_ERROR_STOP on\n/,'').replace(/^begin;$/m,''),{role:''});
   assert.notEqual(result.status,0);assert.match(result.stderr,/SUPERVISOR_SAFEUPDATE_ARTIFACT_DRIFT/);
   assert.deepEqual(metadata(f),priorMetadata);assert.equal(history(f),priorHistory);
  });
  await check('singleton primary key/check prevents duplicate,false,NULL; real extension rejects unqualified UPDATE and DELETE',async()=>{
   assert.equal(f.q('select count(*)from production_control.worker_supervisor_v1'),'1');
   for(const command of ["insert into production_control.worker_supervisor_v1(singleton)values(true)",
    "insert into production_control.worker_supervisor_v1(singleton)values(false)","insert into production_control.worker_supervisor_v1(singleton)values(null)"]){
    assert.notEqual(sqlResult(f.cluster,f.database,command,{role:''}).status,0);
   }
   for(const verb of ["update production_control.worker_supervisor_v1 set reason='invalid'",'delete from production_control.worker_supervisor_v1']){
    const r=sqlResult(f.cluster,f.database,'\\set VERBOSITY verbose\n'+verb,{role:''});assert.notEqual(r.status,0);assert.match(r.stderr,/21000:.*requires a WHERE clause/);
   }
   assert.equal(f.q("select current_setting('safeupdate.enabled')"),'on');
  });
  await check('missing singleton is detected as drift, not invalid reservation; zero-row UPDATE also aborts the whole BEGIN',async()=>{
   const input={contract:QUEUE_CONTRACT,...f.bound,operation:'BEGIN',runtime:f.bound.deployment,
    message:{version:QUEUE_CONTRACT,invocation_id:randomUUID()}};
   const r=sqlResult(f.cluster,f.database,`\\set VERBOSITY verbose\nbegin;delete from production_control.worker_supervisor_v1 where singleton;set role service_role;select public.execute_certification_queue_supervisor_v2(${jsonLiteral(input)});`,{role:'service_role'});
   assert.notEqual(r.status,0);assert.match(r.stderr,/P0001: SUPERVISOR_SINGLETON_DRIFT/);assert.equal(f.q('select count(*)from production_control.worker_supervisor_v1'),'1');
   // A local BEFORE trigger models a zero-row update. No runtime fault API or provider mutation.
   f.toggle(true);f.start({budget:1});const e=f.batch().messages[0];await f.due(e);
   f.q(`create function public.local_suppress_supervisor_update()returns trigger language plpgsql as $$begin return null;end;$$;
    create trigger local_zero_update before update on production_control.worker_supervisor_v1 for each row execute function public.local_suppress_supervisor_update();`);
   await assert.rejects(f.consume(e),error=>error.sqlstate==='P0001'&&error.queueDisposition==='FAIL');
   assert.equal(f.q(`select state from production_control.worker_supervisor_invocations_v1 where invocation_id='${e.message.invocation_id}'`),'RESERVED');
   f.q('drop trigger local_zero_update on production_control.worker_supervisor_v1;drop function public.local_suppress_supervisor_update();');f.stop();f.toggle(false);
  });
  await check('private owner/role/resource boundaries unchanged; START is atomic and STOP late delivery cannot claim',async()=>{
   for(const role of ['anon','authenticated','service_role'])for(const fn of ['worker_supervisor_control_v1','worker_supervisor_status_v1','worker_supervisor_queue_publication_v2','worker_supervisor_fault_control_v1']){
    const r=sqlResult(f.cluster,f.database,`set role ${role};select production_control.${fn}(${jsonLiteral(f.bound)})`,{role});assert.notEqual(r.status,0);
   }
   for(const [section,key,value]of [['resource','resource_id','PRODUCTION:foreign'],['resource','project_ref','foreign'],['deployment','deployment_id','dpl_WrongCertification'],['deployment','release_commit','f'.repeat(40)]]){
    const b=structuredClone(f.bound);b[section][key]=value;assert.throws(()=>f.owner('worker_supervisor_status_v1',b),/SUPERVISOR_/);
   }
   const input=f.startInput(),r=sqlResult(f.cluster,f.database,`begin;select production_control.worker_supervisor_control_v1(${jsonLiteral({...f.bound,...input})});select 1/0;`,{role:''});
   assert.notEqual(r.status,0);assert.equal(f.status().state,'OFF');
   assert.throws(()=>f.start({expected_revision:f.status().revision-1}),/SUPERVISOR_REVISION_STALE/);
   assert.throws(()=>f.start({expected_context:{...f.context(),generation_id:randomUUID()}}),/SUPERVISOR_AUTHORITY_CONTEXT_STALE/);
   f.start({budget:1});const e=f.batch().messages[0];f.stop();await assert.rejects(f.consume(e));assert.equal(f.status().consumed,0);
  });
  await check('v3 partial/lost publication ACK, replay/restart, and STOP during publication are safe with safeupdate ON',async()=>{
   const permit=()=>f.owner('worker_supervisor_publisher_permit_v3',{...f.bound,expected_revision:f.status().revision});
   const run=(p,send)=>handleOwnerQueuePublication(new Request(f.deployment.deployment_origin+PUBLICATION_PATH,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({permit:p})}),
    {env:f.env,dependencies:f.dependencies,createSend:async()=>send});
   f.start();const p=permit();let sends=0;
   const partial=await run(p.permit,async()=>{if(++sends===2)throw new Error('synthetic lost publish ACK');return{messageId:'msg_synthetic'};});
   assert.equal(partial.publication.accepted,1);assert.equal(partial.publication.unknown,1);assert.equal(partial.publication.reserved,1);
   await assert.rejects(run(p.permit,()=>assert.fail()),/SUPERVISOR_OWNER_PUBLICATION_REQUIRED/);
   const completed=await run(permit().permit,async()=>({messageId:'msg_synthetic_retry'}));assert.equal(completed.publication.accepted,3);f.stop();
   f.start();await assert.rejects(run(permit().permit,async()=>{f.stop();return{messageId:'msg_stopped'};}),/SUPERVISOR_DISABLED_OR_STALE/);assert.equal(f.status().state,'OFF');
  });
  await check('modeled cycle-29 four-family pending shape: supported upsert creates genuine demand, no preparation or hook claim',async()=>{
   f.toggle(true);const result=await createCertificationWorkerDemand({env:f.env,dependencies:f.dependencies,onCheckpoint:demandCheckpointSink(f.cluster)});
   assert.equal(result.canonical_outcome,'COMMITTED');assert.equal(result.preparation,'NOT_REQUIRED_FOR_DERIVED_WORK');
   for(const engine of f.startInput().engines){assert.equal(f.job(engine).status,'PENDING');assert.equal(f.job(engine).delivery_attempts,0);}
   assert.equal(f.status().counts.pending_work,4);assert.equal(f.calls.some(c=>c.operation?.startsWith('WORKERS.')),false);f.toggle(false);
  });
  await check('former BEGIN now succeeds under real safeupdate: two slots/duplicate reservation -> existing worker -> claim/output -> FINISH',async()=>{
   f.arm('CONTENTION');f.toggle(true);f.start({budget:2,duration_seconds:120,slots:2});const [a,b]=f.batch().messages;await f.due(a);
   const results=await Promise.all([f.consume(a),f.consume(a),f.consume(b)]);
   assert.equal(results.filter(x=>x.cycles===1).length,2);assert.equal(results.filter(x=>x.cycles===0).length,1);
   assert.equal(f.status().consumed,2);assert.equal(f.status().counts.pending_work,0);
   for(const engine of f.startInput().engines){assert.equal(f.job(engine).status,'SUCCEEDED');assert.equal(f.job(engine).delivery_attempts,1);}
   assert.equal(f.status().counts.active_claims,0);assert.equal(f.status().counts.active_leases,0);f.stop();
  });
  await check('lost FINISH acknowledgement reconciles the committed invocation, no second tick/output/attempt',async()=>{
   f.start({budget:1});const e=f.batch().messages[0];await f.due(e);const base=f.control();
   await assert.rejects(f.consume(e,{control:async(op,payload)=>{const v=await base(op,payload);if(op==='FINISH')throw new Error('synthetic lost acknowledgement');return v;}}));
   const duplicate=await f.consume(e);assert.equal(duplicate.cycles,0);assert.equal(duplicate.outcome,'SUCCEEDED');
   assert.equal(f.status().consumed,1);for(const engine of f.startInput().engines)assert.equal(f.job(engine).delivery_attempts,1);f.stop();
  });
  await check('TICK_RESULT failure/HALT, FINISH failure, HALTED denial and owner RESUME all execute with safeupdate ON',async()=>{
   f.start({budget:2});const [e,late]=f.batch().messages;await f.due(e);
   const factory=async()=>({tick:async()=>{throw Object.assign(new Error('fixed local programming failure'),{code:'SYNTHETIC_TERMINAL_TICK'});},
    processors:{CALCUTTA:async()=>({ok:true}),COMPETITION:async()=>({ok:true}),INTELLIGENCE:async()=>({ok:true})}});
   assert.equal((await f.consume(e,{adapterFactory:factory})).outcome,'FAILED');assert.equal(f.status().state,'HALTED');
   await assert.rejects(f.consume(late),/SUPERVISOR_DISABLED_OR_STALE/);f.stop();
   f.start({budget:1,action:'RESUME',reconciliation_reason:'Fixed local terminal tick cause removed; all outcomes reconciled'});const next=f.batch().messages[0];await f.due(next);
   assert.equal((await f.consume(next)).outcome,'SUCCEEDED');f.stop();
  });
  await check('uncertain BEGIN never executes again; owner reconciliation accounts UNKNOWN and returns STOPPING to OFF',async()=>{
   f.start({budget:1});const e=f.batch().messages[0];await f.due(e);const base=f.control();let factories=0;
   await assert.rejects(f.consume(e,{control:async(op,payload)=>{const v=await base(op,payload);if(op==='BEGIN')throw new Error('BEGIN committed, ACK lost');return v;},adapterFactory:async()=>{factories++;assert.fail();}}));
   const duplicate=await f.consume(e);assert.equal(duplicate.cycles,0);assert.equal(duplicate.uncertain,true);assert.equal(factories,0);
   f.stop();assert.equal(f.status().state,'STOPPING');
   // Only this owned local clock model advances reconciliation eligibility;
   // no job lease/attempt/output is changed and no hosted claim is expired.
   f.q(`update production_control.worker_supervisor_invocations_v1 set reconcile_after=clock_timestamp()-interval '1 second' where invocation_id='${e.message.invocation_id}'`);
   f.ownerQueue('reconcile');assert.equal(f.status().state,'OFF');assert.equal(f.status().consecutive_invocation_failures,1);
   assert.equal(f.q(`select state from production_control.worker_supervisor_invocations_v1 where invocation_id='${e.message.invocation_id}'`),'RECONCILED');
   assert.equal((await f.consume(e)).cycles,0);
  });
  await check('final state: extension ON, OFF supervisor, disabled/paused authority, no work/claims/leases/dead letters or publication',async()=>{
   f.toggle(false);const status=f.status();assert.equal(status.state,'OFF');assert.equal(status.counts.pending_work,0);assert.equal(status.counts.active_claims,0);assert.equal(status.counts.active_leases,0);assert.equal(status.counts.dead_letters,0);
   assert.equal(f.q("select current_setting('safeupdate.enabled')"),'on');assert.equal(f.q('select enabled from production_control.certification_admission_v1'),'f');
   assert.equal(f.q('select state from scoring_authority.ingress_gates'),'PAUSED');assert.equal(f.q('select count(*)from scoring_authority.hole_scores'),'0');
   assert.equal(f.q("select production_control.derived_final_recap_ready_v1('2026')"),'f');assert.equal(f.q('select count(*)from scoring_authority.odds_published_snapshots'),'0');
   assert.equal(f.q('select count(*)from scoring_authority.calcutta_v1_recalculation_jobs'),'0');assert.equal(f.q('select count(*)from net.local_requests'),'0');
   assert.equal(history(f),priorHistory);
  });
 }finally{await destroyIsolatedCluster(f.cluster);}
});
