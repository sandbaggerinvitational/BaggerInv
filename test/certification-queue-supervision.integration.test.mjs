import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createQueueFixture} from './support/reliability/certification-queue-fixture.mjs';
import {destroyIsolatedCluster,jsonLiteral,sqlResult} from './support/reliability/postgres17.mjs';
import {canonicalCatalog} from '../tools/reliability/canonical-bootstrap-artifacts.mjs';
import {QUEUE_CONTRACT,parseQueueMessage,queueRuntimeIdentity} from '../lib/certification-queue-supervision.js';
import {publishOwnerQueueBatch} from '../tools/reliability/certification-queue-control.mjs';
import {createCertificationWorkerDemand} from '../tools/reliability/certification-worker-demand.mjs';
import {POST as retiredHTTP} from '../app/api/internal/derived-worker/run/route.js';

test('private native queue protocol, real owned canonical claims and finite publication',async t=>{
 let f;try{f=await createQueueFixture();
 const check=(name,fn)=>t.test(name,fn);
 const domain=()=>f.q(`select jsonb_build_object('a',(select to_jsonb(a)from production_control.certification_admission_v1 a),
  'g',(select to_jsonb(g)from scoring_authority.ingress_gates g),'scores',(select count(*)from scoring_authority.hole_scores),
  'matches',(select jsonb_agg(to_jsonb(m)order by match_id)from scoring_authority.matches m))`);
 await check('forward install replay converges; predecessor receipt remains immutable; fresh default OFF',async()=>{
  const before=await canonicalCatalog(f.cluster,f.database);f.install();assert.deepEqual(await canonicalCatalog(f.cluster,f.database),before);
  assert.equal(f.q('select image::text from production_control.worker_supervisor_installation_v1'),f.predecessor);assert.equal(f.status().state,'OFF');
 });
 await check('old HTTP/HMAC/pg_net/Vault worker path is inert even for owner/signed caller',async()=>{
  assert.equal((await retiredHTTP(new Request('https://synthetic.invalid',{method:'POST'}))).status,403);
  for(const fn of ['dispatch_v1()','reserve_v1()','key_v1(null)','configure_v1(null)','schedule_v1(null)'])
   assert.throws(()=>f.q('select production_control.worker_supervisor_'+fn),/SUPERVISOR_TRANSPORT_RETIRED/);
  const x=sqlResult(f.cluster,f.database,`set role service_role;select public.execute_certification_supervisor_v1('{}')`,{role:'service_role'});assert.notEqual(x.status,0);
  assert.equal(f.q('select count(*)from net.local_requests'),'0');
 });
 await check('provider-shaped Vault/pg_net reads cannot supply queue or supervisor authority',async()=>{
  f.q('grant usage on schema vault,net to service_role;grant select on vault.decrypted_secrets,net.local_requests to service_role;');
  const result=sqlResult(f.cluster,f.database,'set role service_role;select count(*)from vault.decrypted_secrets',{role:'service_role'});assert.equal(result.status,0);
  assert.equal(f.q('select count(*)from net.local_requests'),'0');
  assert.throws(()=>f.q('select production_control.worker_supervisor_key_v1(null)'),/SUPERVISOR_TRANSPORT_RETIRED/);
  await assert.rejects(f.control()('START',{}),/SUPERVISOR_/);
 });
 await check('participant/anon/authenticated/service_role cannot mint/control/read private state; new wrapper cannot START',async()=>{
  for(const role of ['anon','authenticated','service_role']){
   for(const fn of ['worker_supervisor_control_v1','worker_supervisor_status_v1','worker_supervisor_queue_publication_v2','worker_supervisor_fault_control_v1']){
    const result=sqlResult(f.cluster,f.database,`set role ${role};select production_control.${fn}(${jsonLiteral(f.bound)})`,{role});assert.notEqual(result.status,0);assert.match(result.stderr,/permission denied/);
   }
   for(const table of ['worker_supervisor_invocations_v1','worker_supervisor_v1','worker_supervisor_faults_v1']){
    const result=sqlResult(f.cluster,f.database,`set role ${role};select * from production_control.${table}`,{role});assert.notEqual(result.status,0);
   }
  }
  await assert.rejects(f.control()('START',{}),/SUPERVISOR_/);
 });
 await check('wrong resource/project/release/deployment/Production deny; provider values cannot come from payload',async()=>{
  for(const [where,key,value]of [['resource','resource_id','PRODUCTION'],['resource','project_ref','arbitrary'],['deployment','deployment_id','dpl_wrong000'],['deployment','release_commit','a'.repeat(40)]]){
   const b=structuredClone(f.bound);b[where][key]=value;assert.throws(()=>f.owner('worker_supervisor_status_v1',b),/SUPERVISOR_/);
  }
  for(const change of [{VERCEL_ENV:'production'},{VERCEL_DEPLOYMENT_ID:''},{VERCEL_PROJECT_ID:'wrong'},{VERCEL:'0'},{BAGGER_CERTIFICATION_QUEUE_TRANSPORT:''}])
   assert.throws(()=>queueRuntimeIdentity({...f.env,...change},f.dependencies));
  for(const extra of [{url:'https://production.invalid'},{resource:'PRODUCTION'},{worker:'CALCUTTA'}])assert.throws(()=>parseQueueMessage({version:QUEUE_CONTRACT,invocation_id:randomUUID(),...extra}));
 });
 await check('owner START atomically creates exact finite digest reservations; disabled admissions/ingress unchanged; replay/conflict',async()=>{
  const before=domain(),input=f.startInput();f.ownerQueue('control',input);assert.equal(domain(),before);
  assert.equal(f.q("select count(*)from production_control.worker_supervisor_invocations_v1 where transport='QUEUE_V2'"),'3');
  assert.equal(f.q("select count(*)from production_control.worker_supervisor_invocations_v1 where reservation_digest~'^[0-9a-f]{64}$'and ticket_body=''"),'3');
  assert.equal(f.ownerQueue('control',input).idempotent,true);assert.throws(()=>f.ownerQueue('control',{...input,budget:2}),/SUPERVISOR_REQUEST_CONFLICT/);
  assert.equal(f.status().publication.reserved,3);f.stop();assert.equal(f.status().publication.cancelled,3);
 });
 await check('START stale authority/revision/engine/budget reject without phantom rows; transaction failure rolls back full START',async()=>{
  const count=f.q('select count(*)from production_control.worker_supervisor_invocations_v1'),rev=f.status().revision;
  for(const changes of [{budget:121},{duration_seconds:7201},{cadence_seconds:1},{engines:['CALCUTTA']},{expected_revision:rev-1},{expected_context:{...f.context(),generation_id:randomUUID()}}])
   assert.throws(()=>f.start(changes),/SUPERVISOR_/);
  const input=f.startInput(),result=sqlResult(f.cluster,f.database,`begin;select production_control.worker_supervisor_control_v1(${jsonLiteral({...f.bound,...input})});select 1/0;commit;`,{role:''});
  assert.notEqual(result.status,0);assert.equal(f.status().state,'OFF');assert.equal(f.q('select count(*)from production_control.worker_supervisor_invocations_v1'),count);
 });
 await check('partial publish and lost ACK remain UNKNOWN; retry uses identical identities; STOP during publication invalidates rest',async()=>{
  f.start();const sends=[];let n=0;
  const send=async(msg,options)=>{sends.push({msg,options});if(++n===2)throw new Error('lost provider ACK after acceptance');return{messageId:'msg_first'};};
  let result=await publishOwnerQueueBatch({owner:f.ownerQueue,send});assert.equal(result.status.publication.accepted,1);assert.equal(result.status.publication.unknown,1);assert.equal(result.status.publication.reserved,1);
  const retried=[];result=await publishOwnerQueueBatch({owner:f.ownerQueue,send:async(msg,options)=>{retried.push({msg,options});return{messageId:'msg_retry_'+retried.length};}});
  assert.equal(retried.length,2);assert.deepEqual(retried[0],sends[1]);assert.equal(result.status.publication.accepted,3);assert.equal(result.schedule_installed,false);
  assert.equal((await publishOwnerQueueBatch({owner:f.ownerQueue,send:async()=>assert.fail('duplicate batch')})).intended,0);
  f.stop();f.start();await publishOwnerQueueBatch({owner:f.ownerQueue,send:async()=>{f.stop();return{messageId:'msg_race'};}});
  assert.equal(f.status().state,'OFF');assert.equal(f.status().publication.cancelled,3);
 });
 await check('missing/fabricated reservation and disabled admission cannot execute a worker',async()=>{
  await assert.rejects(f.consume({message:{version:QUEUE_CONTRACT,invocation_id:randomUUID()}}),/SUPERVISOR_/);
  f.start();const e=f.batch().messages[0];await f.due(e);await assert.rejects(f.consume(e),/SUPERVISOR_ADMISSION_DENIED/);f.stop();
 });
 await check('supported synthetic preparation produces four real jobs; request path claims none',async()=>{
  f.toggle(true);const count=f.calls.filter(c=>c.operation?.startsWith('WORKERS.')).length;
  await createCertificationWorkerDemand({env:f.env,dependencies:f.dependencies});assert.equal(f.status().counts.pending_work,4);
  assert.equal(f.calls.filter(c=>c.operation?.startsWith('WORKERS.')).length,count);
  assert.equal(f.q('select count(*)from scoring_authority.hole_scores'),'0');assert.equal(f.q("select status from scoring_authority.matches where match_id='2026-R3-11'"),'UPCOMING');
 });
 await check('private consumer -> existing worker -> actual canonical claim/output/receipt; lost finish ACK recovers without duplicate work',async()=>{
  f.start();const e=f.batch().messages[0];await f.due(e);const base=f.control();let dropped=false;
  const result=await f.consume(e,{control:async(op,payload)=>{const v=await base(op,payload);if(op==='FINISH'&&!dropped){dropped=true;throw new Error('lost consumer ACK');}return v;}}).catch(()=>null);
  assert.equal(result,null);assert.equal(f.q(`select state from production_control.worker_supervisor_invocations_v1 where invocation_id='${e.message.invocation_id}'`),'SUCCEEDED');
  assert.equal(f.status().counts.pending_work,0);assert.equal(f.status().counts.active_claims,0);
  assert.equal((await f.consume(e)).cycles,0);assert.equal((await f.consume(e)).outcome,'SUCCEEDED');
  for(const engine of ['TEAM_MOMENTUM','TOURNAMENT_STORYLINES','TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL'])assert.equal(f.job(engine).delivery_attempts,1);
  assert.equal(f.q("select count(*)from production_control.operation_audit_events where event_type='CERTIFICATION_QUEUE_INVOCATION_FINISHED'"),'1');
  f.stop();
 });
 await check('same-reservation concurrent delivery admits exactly one existing worker cycle',async()=>{
  f.start({budget:1});const e=f.batch().messages[0];await f.due(e);
  const results=await Promise.all([f.consume(e),f.consume(e)]);
  assert.deepEqual(results.map(r=>r.cycles).sort(),[0,1]);
  assert.equal(results.filter(r=>r.admitted===false).length,1);
  assert.equal(f.status().consumed,1);f.stop();
 });
 await check('actual short-lived reservation expires without executing or fabricating an outcome',async()=>{
  f.start({budget:1});const e=f.batch().messages[0];
  await new Promise(r=>setTimeout(r,Math.max(0,Date.parse(e.expires_at)-Date.now()+150)));
  await assert.rejects(f.consume(e),/SUPERVISOR_RESERVATION_DENIED/);
  assert.equal(f.status().consumed,0);assert.equal(f.status().remaining,0);
  f.stop();assert.equal(f.status().publication.cancelled,1);
 });
 await check('STOP late delivery and replayed authority deny; safe final domain boundaries',async()=>{
  f.start();const e=f.batch().messages[0];f.stop();await assert.rejects(f.consume(e),/SUPERVISOR_/);
  assert.equal(f.status().counts.active_leases,0);assert.equal(f.status().counts.dead_letters,0);
  f.toggle(false);assert.equal(f.status().state,'OFF');assert.equal(f.q('select count(*)from scoring_authority.odds_published_snapshots'),'0');
  assert.equal(f.q("select production_control.derived_final_recap_ready_v1('2026')"),'f');assert.equal(f.q('select count(*)from net.local_requests'),'0');
  assert.ok(!/run_token|claim_token|secret|ticket_body/.test(JSON.stringify(f.status())));
 });
 }finally{if(f)await destroyIsolatedCluster(f.cluster);}
});
