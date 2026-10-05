import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createGlobalFaultFixture,globalArtifact} from './support/reliability/certification-global-fault-fixture.mjs';
import {destroyIsolatedCluster,sqlResult,jsonLiteral} from './support/reliability/postgres17.mjs';
test('global fault v5 exact installation, default NONE, safeupdate and private authority',async t=>{
 let f;
 try{
  f=await createGlobalFaultFixture();
  await t.test('OFF/no fault; replay preserves history, installed bodies and metadata',async()=>{
   assert.equal(f.status().state,'OFF');assert.equal(f.status().global_faults.plans,0);
   assert.equal(f.q("select current_setting('safeupdate.enabled')"),'on');
   const receipt=f.q('select to_jsonb(t)from production_control.worker_supervisor_global_fault_installation_v5 t');
   f.installGlobal();assert.equal(f.q('select to_jsonb(t)from production_control.worker_supervisor_global_fault_installation_v5 t'),receipt);
   const manifest=JSON.parse((await readFile(globalArtifact,'utf8')).match(/\$manifest\$([\s\S]*?)\$manifest\$/)[1]);
   for(const p of manifest)assert.equal(f.q(`select encode(extensions.digest(prosrc,'sha256'),'hex')from pg_proc where oid='${p.signature}'::regprocedure`),p.new_hash);
   assert.equal(f.q("select (history->'v4')=(select to_jsonb(t)from production_control.worker_supervisor_safeupdate_installation_v4 t)from production_control.worker_supervisor_global_fault_installation_v5"),'t');
   const unsafe=sqlResult(f.cluster,f.database,'update production_control.worker_supervisor_v1 set reason=reason',{role:''});
   assert.notEqual(unsafe.status,0);assert.match(unsafe.stderr,/UPDATE requires a WHERE clause/);
  });
  await t.test('client/service roles cannot ARM, read private fault state or invoke private TAKE',()=>{
   for(const role of ['anon','authenticated','service_role']){
    for(const name of ['worker_supervisor_global_fault_control_v5','worker_supervisor_global_fault_take_v5']){
     assert.equal(f.q(`select has_function_privilege('${role}','production_control.${name}(jsonb)','EXECUTE')`),'f');
     const result=sqlResult(f.cluster,f.database,`set role ${role};select production_control.${name}(${jsonLiteral(f.globalInput('ARM',{fault:'GLOBAL_TRANSIENT',uses:1,expires_at:new Date(Date.now()+60000).toISOString()}))})`,{role});
     assert.notEqual(result.status,0);assert.match(result.stderr,/permission denied/);
    }
    assert.equal(f.q(`select has_table_privilege('${role}','production_control.worker_supervisor_global_faults_v5','SELECT')`),'f');
   }
  });
  await t.test('owner ARM requires committed current reservations; arbitrary fault/input and foreign binding denied',()=>{
   assert.throws(()=>f.armGlobal('GLOBAL_TRANSIENT'),/SUPERVISOR_GLOBAL_FAULT_DENIED/);
   f.toggle(true);f.start({budget:1,duration_seconds:60});
   for(const changes of [{fault:'SQL_INJECTION'},{uses:4},{sleep:1},{sql:'select 1'},{url:'https://example.com'},
    {resource:{...f.bound.resource,resource_class:'PRODUCTION'}},{deployment:{...f.bound.deployment,deployment_class:'production'}},
    {deployment:{...f.bound.deployment,deployment_id:'dpl_Foreign'}},{deployment:{...f.bound.deployment,release_commit:'d'.repeat(40)}},
    {resource:{...f.bound.resource,project_ref:'foreign'}},{expected_revision:f.status().revision-1},
    {expires_at:new Date(Date.now()-1000).toISOString()},{epoch:'client-selected'},{job_id:'client-selected'},{error:'arbitrary'}]){
    assert.throws(()=>f.globalControl(f.globalInput('ARM',{fault:'GLOBAL_TRANSIENT',uses:1,expires_at:f.status().expiry,...changes})));
   }
   assert.equal(f.q('select count(*)from production_control.worker_supervisor_global_faults_v5'),'0');f.stop();f.toggle(false);
  });
  await t.test('valid no-fault consumer reuses the real bounded worker and late STOP fails closed',async()=>{
   f.toggle(true);f.start({budget:1,duration_seconds:60});const e=f.batch().messages[0];await f.due(e);
   const result=await f.consume(e);assert.equal(result.outcome,'SUCCEEDED');assert.equal(f.status().consumed,1);
   assert.equal(f.q('select count(*)from production_control.worker_supervisor_global_fault_consumptions_v5'),'0');
   assert.equal((await f.consume(e)).cycles,0);f.stop();f.toggle(false);
   assert.equal(f.status().counts.pending_work,0);
  });
  await t.test('fixed plan derives reservation IDs, receipts replay/conflict and STOP cancels unused authority truthfully',async()=>{
   f.toggle(true);f.start({budget:1,duration_seconds:60});
   const input=f.globalInput('ARM',{fault:'GLOBAL_TRANSIENT',uses:1,expires_at:f.status().expiry});
   const plan=f.globalControl(input);assert.equal(f.globalControl(input).idempotent,true);
   assert.throws(()=>f.globalControl({...input,fault:'GLOBAL_DETERMINISTIC'}),/SUPERVISOR_REQUEST_CONFLICT/);
   const e=f.batch().messages[0];
   for(const env of [{VERCEL_ENV:'development'},{VERCEL_ENV:'production'},{VERCEL_PROJECT_ID:'foreign'},
    {VERCEL_DEPLOYMENT_ID:'dpl_Foreign'},{VERCEL_GIT_COMMIT_SHA:'d'.repeat(40)},{BAGGER_CERTIFICATION_RESOURCE_ID:'PRODUCTION'},
    {SUPABASE_SCORING_MIRROR_URL:'https://foreign.supabase.co'}])await assert.rejects(f.consume(e,{env:{...f.env,...env}}));
   for(const payload of [{...e.message,fault:'GLOBAL_TRANSIENT'},{...e.message,resource:'PRODUCTION'}])await assert.rejects(f.consume({...e,message:payload}));
   assert.equal(f.q('select count(*)from production_control.worker_supervisor_global_fault_consumptions_v5'),'0');
   f.stop();await assert.rejects(f.consume(e));assert.equal(f.correctGlobal().corrected,true);
   const s=f.status();assert.equal(s.global_faults.cancelled_uses,1);assert.equal(s.global_faults.consumed_uses,0);
   assert.equal(f.q(`select remaining_uses from production_control.worker_supervisor_global_faults_v5 where plan_id='${plan.plan_id}'`),'0');
   f.toggle(false);
  });
 }finally{if(f)await destroyIsolatedCluster(f.cluster);}
});
