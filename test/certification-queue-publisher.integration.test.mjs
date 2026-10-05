import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createQueueFixture} from './support/reliability/certification-queue-fixture.mjs';
import {sqlFile,sqlResult,jsonLiteral,repositoryRoot,destroyIsolatedCluster} from './support/reliability/postgres17.mjs';
import {handleOwnerQueuePublication,publicationTransport,PUBLICATION_PATH} from '../lib/certification-queue-publisher.js';
const artifact=repositoryRoot+'/supabase/production_incremental/certification-queue-preview-publisher-v3.sql';
test('owner START → digest handoff → bound Preview publisher → ledger; finite reconciliation and security',async t=>{
 const f=await createQueueFixture();const oldImage=f.q('select image::text from production_control.worker_supervisor_queue_installation_v2');
 try{
  sqlFile(f.cluster,f.database,artifact,{role:''});
  const originalFetch=f.dependencies.fetchImpl;
  f.dependencies.fetchImpl=async(url,init)=>{
   if(!url.endsWith('/execute_certification_queue_publication_v3'))return originalFetch(url,init);
   const result=sqlResult(f.cluster,f.database,`\\set VERBOSITY verbose\nset role service_role;select public.execute_certification_queue_publication_v3(${jsonLiteral(JSON.parse(init.body).input)})`,{role:'service_role'});
   if(result.status!==0){const m=/ERROR:\s+([A-Z0-9]{5}):\s*([^\n]+)/.exec(result.stderr);if(!m)throw new Error(result.stderr);
    return Response.json({code:m[1],message:m[2]},{status:400});}
   return Response.json(JSON.parse(result.stdout.trim()));
  };
  const transport=publicationTransport({env:f.env,dependencies:f.dependencies});
  const permit=()=>f.owner('worker_supervisor_publisher_permit_v3',{...f.bound,expected_revision:f.status().revision});
  const request=p=>new Request(f.deployment.deployment_origin+PUBLICATION_PATH,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({permit:p})});
  const run=(p,send)=>handleOwnerQueuePublication(request(p),{env:f.env,dependencies:f.dependencies,createSend:async()=>send});
  await t.test('forward fresh/replay preserves v2 history, ACLs, consumer and disabled admission',async()=>{
   const before=f.q("select jsonb_build_object('admission',(select to_jsonb(a)from production_control.certification_admission_v1 a),'ingress',(select state from scoring_authority.ingress_gates),'consumer',pg_get_functiondef('public.execute_certification_queue_supervisor_v2(jsonb)'::regprocedure))");
   sqlFile(f.cluster,f.database,artifact,{role:''});assert.equal(f.q('select image::text from production_control.worker_supervisor_queue_installation_v2'),oldImage);
   assert.equal(f.q("select jsonb_build_object('admission',(select to_jsonb(a)from production_control.certification_admission_v1 a),'ingress',(select state from scoring_authority.ingress_gates),'consumer',pg_get_functiondef('public.execute_certification_queue_supervisor_v2(jsonb)'::regprocedure))"),before);
   assert.equal(f.status().state,'OFF');assert.throws(permit,/SUPERVISOR_DISABLED_OR_STALE/);
  });
  await t.test('participant/Director, anon, authenticated and service_role cannot mint/control/read owner permits',async()=>{
   for(const role of ['anon','authenticated','service_role']){
    for(const target of ["production_control.worker_supervisor_publisher_permit_v3('{}')","production_control.worker_supervisor_publication_account_v3('{}')",
     'production_control.worker_supervisor_publication_permits_v3']){
     const command=target.endsWith("('{}')")?'select '+target:'select * from '+target;
     const result=sqlResult(f.cluster,f.database,`set role ${role};${command}`,{role});assert.notEqual(result.status,0);assert.match(result.stderr,/permission denied/);
    }
   }
   await assert.rejects(transport('BEGIN',{permit:'0'.repeat(64)}),/SUPERVISOR_/);
  });
  await t.test('START commits first; partial/lost publisher ACK durable; session/permit single-use; restart completes same budget',async()=>{
   f.start();const count=f.q('select count(*)from production_control.worker_supervisor_invocations_v1');
   await assert.rejects(transport('BEGIN',{permit:'0'.repeat(64)}),/SUPERVISOR_OWNER_PUBLICATION_REQUIRED/);
   assert.throws(()=>f.owner('worker_supervisor_publisher_permit_v3',{...f.bound,expected_revision:f.status().revision-1}),/SUPERVISOR_DISABLED_OR_STALE/);
   const handoff=permit();const stored=f.q('select row_to_json(p)from production_control.worker_supervisor_publication_permits_v3 p');
   assert.ok(!stored.includes(handoff.permit));const seen=[];
   const result=await run(handoff.permit,async(message,options)=>{seen.push({message,options});if(seen.length===2)throw new Error('lost ACK');return{messageId:'msg_synthetic_first'};});
   assert.equal(result.publication.accepted,1);assert.equal(result.publication.unknown,1);assert.equal(result.publication.reserved,1);
   assert.ok(!JSON.stringify(result).includes(handoff.permit));assert.equal(result.schedule_installed,false);
   await assert.rejects(run(handoff.permit,()=>assert.fail()),/SUPERVISOR_OWNER_PUBLICATION_REQUIRED/);
   const next=permit();let retries=0;const completed=await run(next.permit,async(message,options)=>{
    if(retries++===0){assert.deepEqual(message,seen[1].message);assert.equal(options.idempotencyKey,seen[1].options.idempotencyKey);}
    return {messageId:'msg_synthetic_retry'};});
   assert.equal(completed.publication.accepted,3);assert.equal(completed.publication.unknown,0);
   const final=await run(permit().permit,()=>assert.fail('accepted reservations must not be published again'));assert.equal(final.publication.accepted,3);
   assert.equal(f.q('select count(*)from production_control.worker_supervisor_invocations_v1'),count);
   assert.equal(f.status().enabled,true);f.stop();
  });
  await t.test('publisher disappearance preserves UNKNOWN; owner retry waits for finite session expiry',async()=>{
   f.start();const handoff=permit();const begun=await transport('BEGIN',{permit:handoff.permit});
   const auth={permit_id:begun.permit_id,run_token:begun.run_token};
   await transport('TRY',{...auth,invocation_id:begun.batch.messages[0].message.invocation_id});
   assert.throws(permit,/SUPERVISOR_PUBLISHER_BUSY/);
   // Owned model of elapsed session lifetime. No outcome or attempt is relabeled.
   f.q("update production_control.worker_supervisor_publication_permits_v3 set started_at=clock_timestamp()-interval '46 seconds'where state='CONSUMED'");
   await assert.rejects(transport('ACK',{...auth,invocation_id:begun.batch.messages[0].message.invocation_id,message_id:'msg_late'}),/SUPERVISOR_PUBLISHER_SESSION_DENIED/);
   const retry=await run(permit().permit,async()=>({messageId:'msg_recovered'}));assert.equal(retry.publication.accepted,3);
   assert.equal(f.q("select max(publication_attempts)from production_control.worker_supervisor_invocations_v1 where epoch=(select epoch from production_control.worker_supervisor_v1)"),'2');
   f.stop();
  });
  await t.test('STOP during publication invalidates unfinished batch and a consumed publisher session',async()=>{
   f.start();const handoff=permit();let sends=0;
   await assert.rejects(run(handoff.permit,async()=>{sends++;f.stop();return{messageId:'msg_accepted_after_STOP'};}),/SUPERVISOR_DISABLED_OR_STALE/);
   assert.equal(sends,1);assert.equal(f.status().state,'OFF');
   assert.equal(f.q("select count(*)from production_control.worker_supervisor_invocations_v1 where state='RESERVED'"),'0');
  });
  await t.test('missing, expired, wrong binding, stale revision and STOP fail closed; publication has no worker effect',async()=>{
   f.start();const handoff=permit();
   for(const [section,field,value]of [['deployment','deployment_id','dpl_ForeignCertification'],['deployment','release_commit','f'.repeat(40)],
    ['deployment','deployment_class','production'],['deployment','git_branch','main'],['resource','project_ref','foreign'],
    ['resource','resource_id','PRODUCTION:foreign'],['resource','resource_class','PRODUCTION'],['resource','registration_revision',2]]){
    const wrong=publicationTransport({env:f.env,dependencies:{...f.dependencies,fetchImpl:(url,init)=>{
     const input=JSON.parse(init.body);input.input[section][field]=value;return f.dependencies.fetchImpl(url,{...init,body:JSON.stringify(input)});
    }}});
    await assert.rejects(wrong('BEGIN',{permit:handoff.permit}));
   }
   await assert.rejects(transport('BEGIN',{permit:'0'.repeat(64)}),/SUPERVISOR_OWNER_PUBLICATION_REQUIRED/);
   // Model elapsed wall time on the owned local database, never hosted expiry edits.
   f.q("update production_control.worker_supervisor_publication_permits_v3 set expires_at=clock_timestamp()-interval '1 second'where state='ISSUED'");
   await assert.rejects(run(handoff.permit,()=>assert.fail()),/SUPERVISOR_OWNER_PUBLICATION_REQUIRED/);
   const late=permit();f.stop();await assert.rejects(run(late.permit,()=>assert.fail()),/SUPERVISOR_DISABLED_OR_STALE/);
   f.start();await assert.rejects(run(late.permit,()=>assert.fail()),/SUPERVISOR_OWNER_PUBLICATION_REQUIRED/);f.stop();
   assert.equal(f.q("select count(*)from production_control.worker_supervisor_invocations_v1 where started_at is not null"),'0');
   assert.equal(f.q('select enabled from production_control.certification_admission_v1'),'f');
   assert.equal(f.q('select state from scoring_authority.ingress_gates'),'PAUSED');
  });
 }finally{await destroyIsolatedCluster(f.cluster);}
});
