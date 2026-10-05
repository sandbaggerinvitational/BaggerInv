import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createSupervisorFixture} from './support/reliability/certification-supervisor-fixture.mjs';
import {destroyIsolatedCluster,sqlFile,sqlResult,jsonLiteral,repositoryRoot} from './support/reliability/postgres17.mjs';
import {canonicalCatalog} from '../tools/reliability/canonical-bootstrap-artifacts.mjs';
import {supervisorEnvelope,handleSupervisorRequest,verifySupervisorRequest,signSupervisorInvocation,SUPERVISOR_PATH,createSupervisorTransport} from '../lib/certification-worker-supervision.js';

test('Certification private durable supervision -> signed endpoint -> existing canonical worker',async t=>{
 let f;const evidence={environment:'OWNED_SOCKET_ONLY_POSTGRESQL17',hostedMutated:false,cases:[],outboundNetwork:0};
 const check=async(name,fn)=>{let error;await t.test(name,async()=>{try{await fn();evidence.cases.push({name,result:'PASS'});}catch(e){error=e;throw e;}});if(error)throw error;};
 try {
  f=await createSupervisorFixture();const options={env:f.env,dependencies:f.dependencies};
  const bound=supervisorEnvelope(f.env,f.dependencies),owner=(fn,input={})=>fn==='reserve'
   ?JSON.parse(f.q('select production_control.worker_supervisor_reserve_v1()')):f.owner('worker_supervisor_'+fn+'_v1',{...bound,...input});
  const status=()=>owner('status');const safeControls=()=>f.q(`select jsonb_build_object('a',(select to_jsonb(a)from production_control.certification_admission_v1 a),
   'g',(select to_jsonb(g)from scoring_authority.ingress_gates g))`);
  const artifact=repositoryRoot+'/supabase/production_incremental/certification-worker-supervision-v1.sql';
  const before=await canonicalCatalog(f.cluster,f.database),controls=safeControls();
  await check('forward fresh add-on and replay preserve all existing function definitions/ACL/RLS/owners/security/receipt',async()=>{
   sqlFile(f.cluster,f.database,artifact,{role:''});const after=await canonicalCatalog(f.cluster,f.database);
   for(const fn of before.functions)assert.deepEqual(after.functions.find(x=>x.identity===fn.identity),fn);
   for(const section of Object.keys(before).filter(k=>k!=='functions')){
    if(!Array.isArray(before[section]))continue;
    const rows=new Set(after[section].map(x=>JSON.stringify(x)));
    for(const row of before[section])assert.ok(rows.has(JSON.stringify(row)),section+' existing object changed');
   }
   assert.equal(safeControls(),controls);sqlFile(f.cluster,f.database,artifact,{role:''});assert.deepEqual(await canonicalCatalog(f.cluster,f.database),after);
  });
  await check('default OFF: scheduler does not enqueue an HTTP request or poll work',async()=>{
   assert.equal(status().state,'OFF');assert.equal(f.q('select production_control.worker_supervisor_dispatch_v1()'),'{"ok": true, "dispatched": false}');
   assert.equal(f.q('select count(*)from net.local_requests'),'0');assert.equal(f.calls.length,0);
  });
  owner('configure',{signing_secret_id:f.keyId});
  let startInput;const start=()=>{
   const expected=JSON.parse(f.q(`select production_control.worker_supervisor_binding_v1(${jsonLiteral(bound)})`));delete expected.resource;delete expected.deployment;
   startInput={action:'START',request_id:randomUUID(),expected_revision:status().revision,expected_context:expected,
    expires_at:new Date(Date.now()+600000).toISOString(),budget:10,slots:1};return owner('control',startInput);
  };
  await check('START is owner-only and does not enable scoring/Director/ingress',async()=>{
   const before=safeControls();assert.equal(start().state,'ENABLED');assert.equal(safeControls(),before);
   assert.equal(owner('control',startInput).idempotent,true);
   assert.throws(()=>owner('control',{...startInput,budget:11}),/SUPERVISOR_REQUEST_CONFLICT/);
   assert.throws(()=>owner('control',{...startInput,request_id:randomUUID()}),/SUPERVISOR_REVISION_STALE/);
   assert.equal(owner('reserve').dispatched,false);assert.equal(f.q('select count(*)from net.local_requests'),'0');
  });
  owner('control',{action:'STOP',request_id:randomUUID(),expected_revision:status().revision});
  f.toggle(true);
  await check('truthful minimal canonical prepare creates required four jobs without a shipping after-hook',async()=>{
   const result=await f.mutation('prepare-scoring-context',{matchId:'2026-R3-11'});assert.equal(result.payload.ok,true);
   assert.equal(f.q("select count(*)from scoring_authority.competition_recalculation_jobs where engine_key<>'TOURNAMENT_FINAL_RECAP'and status='PENDING'"),'4');
   assert.equal(f.q('select count(*)from scoring_authority.hole_scores'),'0');
   assert.equal(f.q("select status from scoring_authority.matches where match_id='2026-R3-11'"),'UPCOMING');
   assert.equal(f.q('select count(*)from scoring_authority.scoring_permissions where can_score'),'0');
   assert.equal(f.calls.filter(c=>c.operation?.startsWith('WORKERS.')).length,0);
  });
  start();
  const reserve=()=>owner('reserve');
  const request=ticket=>new Request(f.deployment.deployment_origin+SUPERVISOR_PATH,{method:'POST',headers:{'content-type':'application/json','x-bagger-worker-signature':ticket.signature},body:ticket.body});
  let ticket;
  await check('private scheduler reserves a single signed immutable target, one normal slot',async()=>{
   const dispatch=JSON.parse(f.q('select production_control.worker_supervisor_dispatch_v1()'));assert.equal(dispatch.dispatched,true);
   const queued=JSON.parse(f.q('select to_jsonb(r)from net.local_requests r order by id desc limit 1'));
   assert.equal(queued.url,f.deployment.deployment_origin+SUPERVISOR_PATH);assert.equal(queued.timeout,70000);
   ticket={origin:f.deployment.deployment_origin,body:f.q('select body::text from net.local_requests order by id desc limit 1'),signature:queued.headers['x-bagger-worker-signature']};
   assert.equal(reserve().dispatched,false);
   assert.equal(signSupervisorInvocation(ticket.body,f.deployment.deployment_origin,f.env.CERTIFICATION_WORKER_SIGNING_KEY),ticket.signature);
  });
  await check('signed endpoint autonomously discovers/claims/processes/acknowledges all four engines using existing worker',async()=>{
   const response=await handleSupervisorRequest(request(ticket),options);const value=await response.json();assert.equal(response.status,200,JSON.stringify(value));
   assert.equal(value.outcome,'SUCCEEDED');assert.equal(value.cycles,1);
   assert.equal(f.q("select count(*)from scoring_authority.competition_recalculation_jobs where status='SUCCEEDED'and engine_key<>'TOURNAMENT_FINAL_RECAP'"),'4');
   assert.equal(status().counts.pending_work,0);assert.equal(status().counts.active_claims,0);assert.equal(status().counts.dead_letters,0);
   assert.ok(f.calls.some(c=>c.operation==='WORKERS.COMPETITION_CLAIM'));assert.ok(f.calls.some(c=>c.operation==='WORKERS.INTELLIGENCE_CLAIM'));
   assert.ok(status().last_successful_tick);evidence.autonomousPath='SIGNED_ENDPOINT -> EXISTING_NODE_WORKER -> ACTUAL_CANONICAL_RPC';
  });
  await check('ticket replay, wrong signature, arbitrary fields, signed-out/ordinary clients deny before executing',async()=>{
   const calls=f.calls.filter(c=>c.operation?.startsWith('WORKERS.')).length;
   assert.equal((await handleSupervisorRequest(request(ticket),options)).status,403);
   assert.equal((await handleSupervisorRequest(request({...ticket,signature:'0'.repeat(64)}),options)).status,403);
   const body=JSON.stringify({...JSON.parse(ticket.body),resource_id:'BAGGER_INV_PRODUCTION'});
   assert.equal((await handleSupervisorRequest(request({...ticket,body,signature:signSupervisorInvocation(body,f.deployment.deployment_origin,f.env.CERTIFICATION_WORKER_SIGNING_KEY)}),options)).status,403);
   for(const cookie of ['', 'session=synthetic-participant','session=synthetic-director']){
    const req=new Request(f.deployment.deployment_origin+SUPERVISOR_PATH,{method:'POST',headers:{'content-type':'application/json',cookie},body:ticket.body});
    assert.equal((await handleSupervisorRequest(req,options)).status,403);
   }
   assert.equal(f.calls.filter(c=>c.operation?.startsWith('WORKERS.')).length,calls);
   assert.throws(()=>verifySupervisorRequest(request(ticket),ticket.body,{...options,now:JSON.parse(ticket.body).expires_at+1}),/SUPERVISOR_TICKET_EXPIRED/);
   for(const role of ['anon','authenticated','service_role']){
    const result=sqlResult(f.cluster,f.database,`set role ${role};select headers from net.local_requests`,{role});
    assert.notEqual(result.status,0);assert.match(result.stderr,/permission denied/);
   }
  });
  await check('owner-only controls and private cores deny anon/authenticated/service_role; narrow wrapper cannot START',async()=>{
   for(const role of ['anon','authenticated','service_role'])for(const fn of ['status','control','reserve','fault_control']){
    const args=fn==='reserve'?'':jsonLiteral(bound);const result=sqlResult(f.cluster,f.database,`set role ${role};select production_control.worker_supervisor_${fn}_v1(${args})`,{role});
    assert.notEqual(result.status,0);assert.match(result.stderr,/permission denied/);
   }
   const control=createSupervisorTransport(options);await assert.rejects(control('START',{}),/SUPERVISOR_/);
  });
  await check('wrong resource/project/deployment/release and Production-shaped environment deny before worker selection',async()=>{
   for(const change of [b=>b.resource.resource_id='BAGGER_INV_PRODUCTION',b=>b.resource.project_ref='idgigvjjqkfbqjeredpb',b=>b.deployment.deployment_id='dpl_wrong',b=>b.deployment.release_commit='a'.repeat(40)]){
    const bad=structuredClone(bound);change(bad);const result=sqlResult(f.cluster,f.database,`select production_control.worker_supervisor_status_v1(${jsonLiteral(bad)})`,{role:''});assert.notEqual(result.status,0);
   }
   assert.throws(()=>supervisorEnvelope({...f.env,BAGGER_CERTIFICATION_RESOURCE_ID:''},f.dependencies));
   assert.throws(()=>supervisorEnvelope({...f.env,VERCEL_ENV:'production'},f.dependencies));
  });
  await check('STOP prevents future reservations; reads/status remain sanitized and no domain side effects',async()=>{
   const before=safeControls();owner('control',{action:'STOP',request_id:randomUUID(),expected_revision:status().revision});
   assert.equal(reserve().dispatched,false);assert.equal(safeControls(),before);
   const safe=JSON.stringify(status());assert.ok(!safe.includes(f.env.CERTIFICATION_WORKER_SIGNING_KEY));assert.ok(!/run_token|claim_token|decrypted_secret/.test(safe));
   f.toggle(false);assert.equal(status().state,'OFF');assert.equal(f.q("select state from scoring_authority.ingress_gates"),'PAUSED');
   assert.equal(f.q("select production_control.derived_final_recap_ready_v1('2026')"),'f');
   assert.equal(f.q('select count(*)from scoring_authority.odds_published_snapshots'),'0');
  });
 } finally {
  if(f)await destroyIsolatedCluster(f.cluster);
  await mkdir('docs/reliability/phase2d-worker-supervision/evidence',{recursive:true});
  await writeFile('docs/reliability/phase2d-worker-supervision/evidence/control-path.json',JSON.stringify(evidence,null,2)+'\n');
 }
});
