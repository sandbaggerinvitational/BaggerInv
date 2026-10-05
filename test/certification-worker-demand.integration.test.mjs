// Owned PostgreSQL17 only. No hosted access, real keys or provider queue sends.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createQueueFixture} from './support/reliability/certification-queue-fixture.mjs';
import {demandCheckpointSink} from './support/reliability/certification-demand-checkpoint.mjs';
import {destroyIsolatedCluster,jsonLiteral,sqlResult,restartIsolatedCluster} from './support/reliability/postgres17.mjs';
import {canonicalCatalog} from '../tools/reliability/canonical-bootstrap-artifacts.mjs';
import {planCertificationWorkerDemand,createCertificationWorkerDemand} from '../tools/reliability/certification-worker-demand.mjs';
import {certificationOperationRpc} from '../lib/certification-runtime-server.js';
import {buildTournamentSetupMutation} from '../lib/production-tournament-setup-contract.js';

test('one-step Certification demand, preserved empty auction and canonical outcome recovery',async t=>{
 let f;const evidence={hostedMutated:false,network:'REMOTE_DENIED',environment:'OWNED_SOCKET_ONLY_POSTGRESQL17',cases:[]};
 const check=async(name,fn)=>{let error;await t.test(name,async()=>{try{await fn();evidence.cases.push({name,result:'PASS'});}catch(e){error=e;throw e;}});if(error)throw error;};
 try{
  f=await createQueueFixture();const original=f.dependencies.fetchImpl;
  const recoveryNames=['mark_certification_ingress_unknown_v1','read_certification_ingress_status_v1','resolve_certification_ingress_v1'];
  f.dependencies.fetchImpl=async(url,init)=>{
   const u=new URL(url),name=u.pathname.split('/').at(-1);
   if(!recoveryNames.includes(name))return original(url,init);
   assert.equal(u.origin,f.resource.project_url);
   const input=JSON.parse(init.body).input;f.calls.push({name,operation:input.operation_id});
   const r=sqlResult(f.cluster,f.database,`\\set VERBOSITY verbose\nset role service_role;select public.${name}(${jsonLiteral(input)})`,{role:'service_role'});
   if(r.status!==0){const m=/ERROR:\s+([A-Z0-9]{5}):\s*([^\n]+)/.exec(r.stderr);assert.ok(m,r.stderr);return Response.json({code:m[1],message:m[2]},{status:400});}
   return Response.json(JSON.parse(r.stdout.trim()));
  };
  const fetchBase=f.dependencies.fetchImpl,sink=demandCheckpointSink(f.cluster);
  const options={env:f.env,dependencies:f.dependencies,onCheckpoint:sink};
  const plan=()=>planCertificationWorkerDemand(options);
  const run=checkpoint=>createCertificationWorkerDemand({...options,checkpoint});
  const jobs=()=>JSON.parse(f.q(`select jsonb_agg(jsonb_build_object('engine',engine_key,'cycle',delivery_cycle,'source',requested_source_revision,
   'status',status,'requestedAt',requested_at,'attempts',delivery_attempts,'claimed',claim_token is not null)order by engine_key)from scoring_authority.competition_recalculation_jobs where engine_key<>'TOURNAMENT_FINAL_RECAP'`));
  const financial=()=>f.q(`select jsonb_build_object('current',(select to_jsonb(c)from scoring_authority.calcutta_v1_current c),
   'auctions',(select jsonb_agg(to_jsonb(a)order by auction_revision)from scoring_authority.calcutta_v1_auction_fact_revisions a))`);
  const journal=async id=>JSON.parse(await readFile(path.join(f.cluster.directory,'demand-'+id+'.json'),'utf8'));
  const payload=p=>{const r=buildTournamentSetupMutation('upsert-match',{matchId:'2026-R3-11',roundNumber:3,matchNumber:11,courseId:'C3',tee:'Tournament',teeTime:p.tee_time,expectedRevision:p.expected_revision,operationRequestId:p.operation_request_id});delete r.operation_request_id;return {...r,action:'upsert-match'};};
  const mutate=p=>certificationOperationRpc('DIRECTOR.MUTATE_SETUP',payload(p),{env:f.env,authorization:f.authorization,operationRequestId:p.operation_request_id},f.dependencies);
  f.toggle(true);
  const beforeCatalog=await canonicalCatalog(f.cluster,f.database);
  let first;
  await check('no auction: clean one-step demand creates four truthful jobs, no scoring preparation/claim',async()=>{
   assert.equal(f.q('select count(*)from scoring_authority.calcutta_v1_auction_fact_revisions'),'0');first=await plan();
   const n=f.calls.length,r=await run(first);assert.equal(r.state,'DEMAND_READY');assert.equal(r.canonical_outcome,'COMMITTED');
   assert.equal((await journal(first.operation_request_id)).state,'DEMAND_READY');
   assert.equal(jobs().length,4);assert.ok(jobs().every(j=>j.status==='PENDING'&&j.attempts===0&&!j.claimed));
   assert.equal(f.q("select prepared_setup_revision from scoring_authority.tournament_setup_match_details_v1 where match_id='2026-R3-11'"),'');
   assert.equal(f.calls.slice(n).filter(c=>c.name==='execute_certification_operation_v1').length,1);
   assert.equal(f.calls.slice(n).filter(c=>c.operation?.startsWith('WORKERS.')).length,0);
  });
  await check('same committed request replay/duplicate remains exact; no new cycle or execution',async()=>{
   const before=jobs(),n=f.calls.filter(c=>c.name==='execute_certification_operation_v1').length;
   for(const checkpoint of [first,await journal(first.operation_request_id)])assert.equal((await run(checkpoint)).state,'DEMAND_READY');
   assert.deepEqual(jobs(),before);assert.equal(f.calls.filter(c=>c.name==='execute_certification_operation_v1').length,n);
  });
  await check('conflicting same-operation content is denied by canonical request hash without demand mutation',async()=>{
   const before=jobs();await assert.rejects(run({...first,tee_time:first.tee_time==='08:01'?'08:02':'08:01'}),{code:'CERTIFICATION_INGRESS_IDEMPOTENCY_CONFLICT'});
   assert.deepEqual(jobs(),before);
  });
  await check('concurrent duplicate producer invocations share one canonical mutation/receipt and one demand refresh',async()=>{
   const p=await plan(),before=jobs();const results=await Promise.all([run(p),run(p)]);
   assert.ok(results.every(r=>r.state==='DEMAND_READY'));
   assert.equal(f.q(`select count(*)from production_control.certification_ingress_leases_v1 where operation_request_id='${p.operation_request_id}'`),'1');
   assert.equal(Number(f.q('select revision from production_control.tournament_setup_context_v1')),p.expected_revision+1);
   for(const j of jobs()){const old=before.find(b=>b.engine===j.engine);assert.equal(j.cycle,old.cycle);assert.deepEqual(j.source,old.source);assert.notEqual(j.requestedAt,old.requestedAt);}
   const after=jobs();assert.equal((await run(await journal(p.operation_request_id))).state,'DEMAND_READY');assert.deepEqual(jobs(),after);
  });
  await check('required durable checkpoint write precedes dispatch; absent/failed storage cannot commit',async()=>{
   const p=await plan(),before=jobs();await assert.rejects(createCertificationWorkerDemand({...options,checkpoint:p,onCheckpoint:undefined}),/DURABLE_CHECKPOINT_REQUIRED/);
   await assert.rejects(createCertificationWorkerDemand({...options,checkpoint:p,onCheckpoint:async()=>{throw new Error('LOCAL_STORAGE_UNAVAILABLE');}}),/LOCAL_STORAGE_UNAVAILABLE/);
   assert.deepEqual(jobs(),before);assert.equal(f.q(`select count(*)from production_control.certification_ingress_leases_v1 where operation_request_id='${p.operation_request_id}'`),'0');
  });
  await check('configured without auction: unchanged preparation guard reports no Calcutta auction dependency',async()=>{
   assert.equal(f.q("select auction_revision from scoring_authority.calcutta_v1_current"),'0');
   assert.equal(f.q("select production_control.tournament_setup_dependency_codes_v1(null,null,3,'2026-R3-11','SCORING_CONTEXT')"),'[]');
  });
  const auction=async clear=>{
   const current=JSON.parse(f.q('select to_jsonb(c)from scoring_authority.calcutta_v1_current c'));
   const input={contract_version:'production-calcutta-v1',expected_configuration_revision:current.configuration_revision,
    expected_configuration_fingerprint:current.configuration_fingerprint,expected_auction_revision:current.auction_revision,
    expected_auction_fingerprint:current.auction_fingerprint,expected_publication_revision:current.publication_revision,
    ...(clear?{action:'clear-entry',player_id:'P01'}:{action:'replace-auction',purchases:[{player_id:'P01',purchase_price:'1'}],ownership:[{player_id:'P01',owner_player_id:'P12',ownership_fraction:'1'}]})};
   const r=await certificationOperationRpc(clear?'DIRECTOR.CLEAR_CALCUTTA_AUCTION':'DIRECTOR.REPLACE_CALCUTTA_AUCTION',input,
    {env:f.env,authorization:f.authorization,operationRequestId:randomUUID()},f.dependencies);assert.equal(r.payload.ok,true,JSON.stringify(r.payload));
  };
  await check('nonempty auction retains setup preparation dependency, immutable purchase and normal financial semantics',async()=>{
   await auction(false);assert.equal(f.q("select auction_revision from scoring_authority.calcutta_v1_current"),'1');
   assert.match(f.q("select production_control.tournament_setup_dependency_codes_v1(null,null,3,'2026-R3-11','SCORING_CONTEXT')"),/CALCUTTA_AUCTION_DEPENDENCY/);
  });
  await check('supported clear yields valid empty auction revision 2; preparation still fails closed',async()=>{
   await auction(true);assert.equal(f.q("select auction_revision from scoring_authority.calcutta_v1_current"),'2');
   assert.equal(f.q("select state||':'||publication_state from scoring_authority.calcutta_v1_current"),'AUCTION_COMPLETE:UNPUBLISHED');
   assert.equal(f.q("select jsonb_array_length(auction_manifest->'purchases')from scoring_authority.calcutta_v1_auction_fact_revisions where auction_revision=2"),'0');
   assert.match(f.q("select production_control.tournament_setup_dependency_codes_v1(null,null,3,'2026-R3-11','SCORING_CONTEXT')"),/CALCUTTA_AUCTION_DEPENDENCY/);
  });
  let partial;
  await check('legacy partial commit: upsert COMMITTED, prepare NOT_COMMITTED; producer resumes original first receipt only',async()=>{
   partial=await plan();await sink(partial);await sink({...partial,state:'UNKNOWN'});assert.equal((await mutate(partial)).payload.ok,true);
   const before=jobs(),facts=financial(),rev=Number(f.q('select revision from production_control.tournament_setup_context_v1'));
   const blocked=await f.mutation('prepare-scoring-context',{matchId:'2026-R3-11'});assert.equal(blocked.payload.code,'TOURNAMENT_SETUP_DEPENDENCY_BLOCKED');
   assert.deepEqual(blocked.payload.blockers,['CALCUTTA_AUCTION_DEPENDENCY']);assert.deepEqual(jobs(),before);assert.equal(financial(),facts);
   assert.equal(Number(f.q('select revision from production_control.tournament_setup_context_v1')),rev);
   const n=f.calls.length,r=await run(await journal(partial.operation_request_id));assert.equal(r.state,'DEMAND_READY');
   assert.equal(f.calls.slice(n).filter(c=>c.name==='execute_certification_operation_v1').length,0);assert.deepEqual(jobs(),before);
  });
  await check('empty-auction clean producer needs no preparation and creates no financial demand/facts',async()=>{
   const facts=financial(),p=await plan(),r=await run(p);assert.equal(r.state,'DEMAND_READY');assert.equal(financial(),facts);
   assert.equal(f.q('select count(*)from scoring_authority.calcutta_v1_recalculation_jobs'),'0');
   assert.equal(f.q("select count(*)from scoring_authority.score_derived_intents_v1 where family='CALCUTTA'"),'0');
   assert.equal(f.q('select count(*)from scoring_authority.hole_scores'),'0');
  });
  await check('lost commit acknowledgement plus unavailable recovery remains UNKNOWN; restart reads authoritative COMMITTED without reexecution',async()=>{
   const p=await plan();let committed=false;
   f.dependencies.fetchImpl=async(url,init)=>{
    const input=JSON.parse(init.body).input,name=new URL(url).pathname.split('/').at(-1);
    if(committed&&(name==='mark_certification_ingress_unknown_v1'||name==='admit_certification_operation_v1'&&input.replay_only))throw new Error('LOCAL_ACK_UNAVAILABLE');
    const r=await fetchBase(url,init);
    if(name==='execute_certification_operation_v1'&&input.operation_id==='DIRECTOR.MUTATE_SETUP'){assert.equal((await journal(p.operation_request_id)).state,'UNKNOWN');committed=true;throw new Error('LOCAL_LOST_COMMIT_ACK');}
    return r;
   };
   const r=await run(p);assert.equal(r.state,'UNKNOWN');assert.equal(r.ok,false);
   assert.equal(f.q(`select state from production_control.certification_ingress_leases_v1 where operation_request_id='${p.operation_request_id}'`),'COMMITTED');
   f.dependencies.fetchImpl=fetchBase;const before=jobs();restartIsolatedCluster(f.cluster);
   assert.equal((await run(await journal(p.operation_request_id))).state,'DEMAND_READY');assert.deepEqual(jobs(),before);
  });
  await check('UNKNOWN missing origin is not absence proof and never automatically creates replacement demand',async()=>{
   const p=await plan(),before=jobs(),n=f.calls.length;const r=await run({...p,state:'UNKNOWN'});
   assert.equal(r.state,'UNKNOWN');assert.deepEqual(jobs(),before);assert.equal(f.calls.slice(n).filter(c=>c.name==='execute_certification_operation_v1').length,0);
  });
  await check('changed setup source between planning/dispatch is NOT_COMMITTED, never silently rebased; retry preserves rejection',async()=>{
   const old=await plan();assert.equal((await run(await plan())).state,'DEMAND_READY');const before=jobs();
   const r=await run(old);assert.equal(r.state,'NOT_COMMITTED',JSON.stringify(r));assert.equal(r.ok,false);
   assert.equal((await run(r.checkpoint)).state,'NOT_COMMITTED');assert.deepEqual(jobs(),before);
  });
  await check('later lawful demand refresh remains current when old successful operation is replayed; no lost work or extra cycle',async()=>{
   const before=jobs();assert.equal((await run(first)).state,'DEMAND_READY');assert.deepEqual(jobs(),before);
   assert.ok(jobs().every(j=>j.attempts===0&&!j.claimed&&j.source.revision.matchId==='2026-R3-11'));
  });
  await check('checkpoint cannot select resource/project/release/deployment/match/queue/actor; no new authority surface',async()=>{
   const p=await plan();for(const [k,v]of [['resource_id','PRODUCTION'],['project_ref','foreign'],['deployment_id','dpl_wrong'],['release_commit','a'.repeat(40)]]){
    await assert.rejects(run({...p,binding:{...p.binding,[k]:v}}),/CHECKPOINT_DENIED/);
   }
   for(const extra of [{match_id:'2026-R3-12'},{resource:'PRODUCTION'},{queue:'arbitrary'},{actor:'P11'}])await assert.rejects(run({...p,...extra}),/CHECKPOINT_DENIED/);
   await assert.rejects(createCertificationWorkerDemand({...options,env:{...f.env,VERCEL_ENV:'production'},checkpoint:p}));
   for(const role of ['anon','authenticated','service_role'])assert.notEqual(sqlResult(f.cluster,f.database,`set role ${role};select production_control.tournament_setup_dependency_codes_v1(null,null,3,'2026-R3-11','SCORING_CONTEXT')`,{role}).status,0);
  });
  await check('STOP/disabled admission preserves committed demand and replay; no new mutation while disabled',async()=>{
   const p=await plan(),r=await run(p),before=jobs();f.start({budget:1});f.stop();f.toggle(false);
   assert.equal((await run(r.checkpoint)).state,'DEMAND_READY');assert.deepEqual(jobs(),before);
   assert.equal(f.status().counts.pending_work,4);assert.equal(f.status().remaining,0);assert.equal(f.status().counts.active_claims,0);
   const denied=await run({...p,operation_request_id:randomUUID(),state:'PLANNED'});assert.equal(denied.ok,false);assert.deepEqual(jobs(),before);
  });
  await check('unchanged private queue consumer -> existing bounded worker discovers/claims/processes unprepared empty-auction work',async()=>{
   const before=jobs(),facts=financial();assert.equal(f.q("select prepared_setup_revision from scoring_authority.tournament_setup_match_details_v1 where match_id='2026-R3-11'"),'');
   f.toggle(true);f.start({budget:1});const e=f.batch().messages[0];await f.due(e);const result=await f.consume(e);
   assert.equal(result.cycles,1);assert.equal(result.outcome,'SUCCEEDED');assert.equal(f.status().counts.pending_work,0);
   assert.equal(f.status().counts.active_claims,0);assert.equal(f.status().counts.dead_letters,0);
   assert.ok(jobs().every(j=>j.status==='SUCCEEDED'&&j.attempts===1&&!j.claimed));
   for(const j of jobs())assert.equal(j.cycle,before.find(b=>b.engine===j.engine).cycle);
   assert.ok(f.calls.some(c=>c.operation==='WORKERS.COMPETITION_CLAIM'));assert.ok(f.calls.some(c=>c.operation==='WORKERS.INTELLIGENCE_CLAIM'));
   const outputs=JSON.parse(f.q(`select jsonb_agg(jsonb_build_object('engine',engine_key,'count',n)order by engine_key)
    from(select engine_key,count(*)n from scoring_authority.competition_derived_snapshots where is_current group by engine_key)s`));
   assert.equal(outputs.length,4);assert.ok(outputs.every(o=>o.count===1));evidence.outputs=outputs;
   assert.equal(financial(),facts);evidence.workerPath='MODELED_PRIVATE_QUEUE -> UNCHANGED_BOUNDED_WORKER -> ACTUAL_CANONICAL_CLAIMS/PROCESSORS/OUTPUTS';
   evidence.jobs=jobs();f.stop();f.toggle(false);
  });
  await check('final domain/control/catalog security remains unchanged; no financial/Google/Odds/FinalRecap side effect',async()=>{
   assert.deepEqual(await canonicalCatalog(f.cluster,f.database),beforeCatalog);
   assert.equal(f.status().state,'OFF');assert.equal(f.q('select enabled from production_control.certification_admission_v1'),'f');
   assert.equal(f.q('select state from scoring_authority.ingress_gates'),'PAUSED');
   assert.equal(f.q('select count(*)from scoring_authority.scoring_permissions where can_score'),'0');
   assert.equal(f.q('select count(*)from scoring_authority.odds_published_snapshots'),'0');
   assert.equal(f.q("select production_control.derived_final_recap_ready_v1('2026')"),'f');
   assert.equal(f.q('select count(*)from scoring_authority.google_outbox_events'),'0');
   assert.equal(f.status().counts.active_leases,0);assert.equal(f.status().counts.dead_letters,0);
  });
 }finally{
  if(f)await destroyIsolatedCluster(f.cluster);
  const dir='docs/reliability/phase2d-worker-demand-remediation/evidence';await mkdir(dir,{recursive:true});
  await writeFile(dir+'/integration.json',JSON.stringify(evidence,null,2)+'\n');
 }
});
