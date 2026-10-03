// Separate physical local databases; no hosted URL, credentials or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {writeFile,readFile} from 'node:fs/promises';
import {createCertificationFixture} from './support/reliability/phase2d-certification-fixture.mjs';
import {certificationProvisionalProfile} from './support/reliability/certification-provisional-profile.mjs';
import {destroyIsolatedCluster} from './support/reliability/postgres17.mjs';
import {buildTournamentSetupMutation} from '../lib/production-tournament-setup-contract.js';
const forwardMigrations=certificationProvisionalProfile;
const proofFiles=[...forwardMigrations,'test/support/reliability/certification-provisional-profile.mjs','test/reliability-phase2dr2-resource-isolation.integration.test.mjs',
 'test/support/reliability/phase2d-certification-fixture.mjs','test/support/reliability/phase2d-resource-bootstrap.mjs',
 'test/support/reliability/postgres17.mjs','lib/production-tournament-setup-contract.js','tools/reliability/phase2-network-deny.cjs'];
const sourceManifest=async()=>Object.fromEntries(await Promise.all(proofFiles.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));
test('R2 two-database resource, receipt, ingress, read and worker isolation',async t=>{
 const sourceBefore=await sourceManifest();
 const f=await createCertificationFixture({forwardMigrations,databases:2}),[a,b]=f.resources,id=randomUUID(),requests=[],admissions=[];
 const evidence={environment:'TWO_OWNED_LOCAL_POSTGRESQL17_DATABASES',productionAccess:false,hostedAccess:false,googleCalls:0,cases:[],profile:{migrations:forwardMigrations,excluded:[]},sourceBefore};
 const setup=(r,action,values,operationId=randomUUID())=>{const payload=buildTournamentSetupMutation(action,{expectedRevision:r.model().revision,operationRequestId:operationId,...values});delete payload.operation_request_id;
  return r.command('DIRECTOR.MUTATE_SETUP',{...payload,action},{operation_request_id:operationId});};
 const count=r=>r.q('select count(*)from production_control.certification_ingress_leases_v1');
 try{
  await t.test('same operation ID in distinct registered databases has independent canonical outcome',()=>{
   for(const [index,r]of f.resources.entries()){
    const input=setup(r,'update-tournament',{name:'Only database '+index,destination:'Synthetic course',startDate:'2026-09-20',endDate:'2026-09-22',timeZone:'America/Chicago',operationalStatus:'UPCOMING'},id);
    const lease=r.rpc('admit_certification_operation_v1',input);requests.push(input);admissions.push(lease);
    assert.equal(r.rpc('execute_certification_operation_v1',{...input,ingress:{lease_id:lease.lease_id,admission_generation_id:lease.admission_generation_id}}).ok,true);
    assert.equal(r.q("select name from scoring_authority.tournaments where tournament_id='2026'"),'Only database '+index);
    assert.equal(count(r),'1');
   }
   assert.notEqual(admissions[0].lease_id,admissions[1].lease_id);assert.notEqual(admissions[0].request_hash,admissions[1].request_hash);
   evidence.cases.push({id:'SAME_ID_DISTINCT_RESOURCE',canonicalReceiptsPerDatabase:1});
  });
  await t.test('foreign resource, deployment and lease never rebind to local authority',()=>{
   for(const [local,foreign,input,lease]of [[a,b,requests[1],admissions[1]],[b,a,requests[0],admissions[0]]]){
    const before=count(local);
    for(const name of ['read_certification_runtime_context_v1','admit_certification_operation_v1','read_certification_ingress_status_v1','resolve_certification_ingress_v1'])
     assert.throws(()=>local.rpc(name,input),/RESOURCE_BINDING_DENIED|RESOURCE_CONTEXT|INGRESS_RESOURCE_DENIED/);
    const localInput=requests[local===a?0:1];
    assert.throws(()=>local.rpc('execute_certification_operation_v1',{...localInput,ingress:{lease_id:lease.lease_id,admission_generation_id:lease.admission_generation_id}}),/INGRESS_BINDING_DENIED/);
    assert.throws(()=>local.rpc('read_certification_runtime_context_v1',{...local.envelope,deployment:foreign.deployment}),/RESOURCE_BINDING_DENIED|DEPLOYMENT|CONTEXT/);
    assert.equal(count(local),before);
   }
   evidence.cases.push({id:'FOREIGN_ENVELOPE_AND_LEASE',denied:true});
  });
  await t.test('same-ID recovery returns only locally bound receipt and full hash conflict',()=>{
   for(const [index,r]of f.resources.entries()){
    const status=r.rpc('read_certification_ingress_status_v1',{...requests[index],payload:{}});assert.equal(status.state,'COMMITTED');assert.equal(status.lease_id,admissions[index].lease_id);
    assert.throws(()=>r.rpc('admit_certification_operation_v1',{...requests[index],payload:requests[1-index].payload,replay_only:true}),/IDEMPOTENCY_CONFLICT/);
   }
   evidence.cases.push({id:'RECOVERY_RESOURCE_HASH',independent:true});
  });
  await t.test('canonical current reads and financial projections reject the other resource',()=>{
   for(const r of f.resources){
    assert.equal(r.read('DIRECTOR.READ_SETUP').ok,true);
    const calcutta=r.read('DIRECTOR.READ_CALCUTTA');assert.equal(calcutta.tournament_id,'2026');assert.equal(calcutta.players.length,24);assert.equal(calcutta.publication_state,'UNPUBLISHED');
    const skins=r.read('DIRECTOR.READ_NET_SKINS');assert.equal(skins.contract,'production-net-skins-entries-v1');assert.equal(skins.tournamentId,'2026');assert.equal(skins.rounds.length,3);
   }
   for(const [local,foreign]of [[a,b],[b,a]])for(const op of ['DIRECTOR.READ_SETUP','DIRECTOR.READ_CALCUTTA','DIRECTOR.READ_NET_SKINS']){
    assert.throws(()=>local.rpc('read_certification_operation_v1',{...foreign.envelope,operation_id:op,payload:{}}),/RESOURCE_BINDING_DENIED|RESOURCE_CONTEXT|INGRESS_RESOURCE_DENIED/);
   }
   assert.equal(a.q("select name from scoring_authority.tournaments where tournament_id='2026'"),'Only database 0');
   assert.equal(b.q("select name from scoring_authority.tournaments where tournament_id='2026'"),'Only database 1');
   evidence.cases.push({id:'CURRENT_FINANCIAL_READ_BOUNDARY',foreignDenied:true});
  });
  await t.test('worker command cannot claim or materialize against a different registered database',()=>{
   for(const [local,foreign]of [[a,b],[b,a]]){
    const foreignWorker=foreign.command('WORKERS.DELIVERY_TICK',{worker_id:'r2-resource-isolation',materialization_family:'COMPETITION'});
    const before=local.q('select count(*)from scoring_authority.score_derived_intents_v1');
    assert.throws(()=>local.rpc('execute_certification_operation_v1',foreignWorker),/RESOURCE_BINDING_DENIED|RESOURCE_CONTEXT|INGRESS_RESOURCE_DENIED/);
    assert.equal(local.q('select count(*)from scoring_authority.score_derived_intents_v1'),before);
    const localWorker=local.command('WORKERS.DELIVERY_TICK',{worker_id:'r2-resource-isolation',materialization_family:'COMPETITION'});
    assert.equal(local.rpc('execute_certification_operation_v1',localWorker).ok,true);
   }
   evidence.cases.push({id:'WORKER_RESOURCE_DENIAL',foreignDenied:true,localTick:true,limitation:'Idle local tick; nonempty autonomous-family proof is separate'});
  });
  await t.test('private relations remain unavailable and neither database acquires Production or Google authority',()=>{
   for(const r of f.resources){
    for(const role of ['anon','authenticated','service_role'])assert.throws(()=>r.q(`set role ${role};select *from production_control.certification_ingress_leases_v1`),/permission denied/);
    assert.equal(r.q('select count(*)from production_control.resource_scope'),'0');assert.equal(r.q('select count(*)from production_control.cutover_activation_state'),'0');
    assert.equal(r.q('select count(*)from scoring_authority.google_outbox_events'),'0');
   }
   evidence.cases.push({id:'PRIVATE_AND_RETIRED_AUTHORITY',privateDenied:true,productionRows:0,googleJobs:0});
  });
 }finally{evidence.sourceAfter=await sourceManifest();evidence.sourceStable=JSON.stringify(evidence.sourceBefore)===JSON.stringify(evidence.sourceAfter);evidence.status=evidence.cases.length===6&&evidence.sourceStable?'PASS':'PARTIAL';await writeFile('/private/tmp/r2-resource-isolation-evidence.json',JSON.stringify(evidence,null,2)+'\n');await destroyIsolatedCluster(f.cluster);assert.equal(evidence.sourceStable,true);}
});
