// Provider privilege model, not an extension implementation. The socket-only
// database never loads pg_net, dispatches HTTP or contains provider credentials.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes, randomUUID} from 'node:crypto';
import {mkdir, writeFile, readFile} from 'node:fs/promises';
import {createIsolatedCluster, createDatabase, destroyIsolatedCluster, sql, sqlResult, repositoryRoot} from './support/reliability/postgres17.mjs';
import {createSupervisorFixture} from './support/reliability/certification-supervisor-fixture.mjs';
import {sqlFile, jsonLiteral} from './support/reliability/postgres17.mjs';
import {supervisorEnvelope, createSupervisorTransport, signSupervisorInvocation, verifySupervisorRequest, handleSupervisorRequest, SUPERVISOR_PATH} from '../lib/certification-worker-supervision.js';

const evidence = {hosted:false, remoteEgress:false, credentialValuesRetained:false, cases:[]};
async function check(t, name, fn) {
  let error;
  await t.test(name, async()=>{try {await fn(); evidence.cases.push({name,result:'PASS'});} catch(e){error=e; throw e;}});
  if(error) throw error;
}
test('managed non-owner cannot close provider grants by issuing owner-style REVOKEs', async t=>{
  const cluster=await createIsolatedCluster(),database='provider_acl_model';
  try {
    createDatabase(cluster,database);
    const q=input=>sql(cluster,database,input,{role:''});
    q(`create role provider_admin superuser nologin;
      create role managed_owner nosuperuser nologin;
      create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      create schema vault authorization provider_admin; create schema net authorization provider_admin;
      set role provider_admin;
      create table vault.decrypted_secrets(id uuid primary key,decrypted_secret text);
      grant usage on schema vault to managed_owner,service_role;
      grant select on vault.decrypted_secrets to managed_owner with grant option;
      grant select on vault.decrypted_secrets to service_role;
      create table net.http_request_queue(id bigserial,url text,headers jsonb,body jsonb);
      create function net.http_post(url text,body jsonb,headers jsonb) returns bigint language plpgsql as $$
       declare n bigint;begin insert into net.http_request_queue(url,headers,body)values($1,$3,$2)returning id into n;return n;end;$$;
      grant usage on schema net to public;
      grant all on all tables in schema net to public;
      grant all on all sequences in schema net to public;
      reset role;
      create schema bagger_private authorization managed_owner;
      set role managed_owner;
      create function bagger_private.dispatch() returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
       begin return jsonb_build_object('fixed_path','/api/internal/derived-worker/run');end;$$;
      revoke all on function bagger_private.dispatch() from public,anon,authenticated,service_role;
      reset role;`);
    await check(t,'provider and managed installer are different roles; managed installer is not superuser',()=>{
      assert.equal(q("select rolsuper from pg_roles where rolname='managed_owner'"),'f');
      assert.equal(q("select pg_get_userbyid(relowner)from pg_class where oid='vault.decrypted_secrets'::regclass"),'provider_admin');
    });
    await check(t,'managed grant option cannot revoke provider-origin service_role SELECT',()=>{
      const result=sqlResult(cluster,database,'set role managed_owner;revoke select on vault.decrypted_secrets from service_role;reset role;select has_table_privilege(\'service_role\',\'vault.decrypted_secrets\',\'SELECT\');',{role:''});
      assert.equal(result.status,0);assert.equal(result.stdout.trim(),'t');
      assert.equal(q("select count(*)from pg_class c cross join lateral aclexplode(c.relacl)a where c.oid='vault.decrypted_secrets'::regclass and a.grantee='service_role'::regrole and a.grantor='provider_admin'::regrole"),'1');
    });
    await check(t,'managed installer cannot remove provider PUBLIC queue privilege',()=>{
      const result=sqlResult(cluster,database,'set role managed_owner;revoke all on net.http_request_queue from public;reset role;select has_table_privilege(\'anon\',\'net.http_request_queue\',\'SELECT,INSERT,UPDATE,DELETE\');',{role:''});
      assert.equal(result.status,0);assert.match(result.stderr,/no privileges could be revoked/);assert.equal(result.stdout.trim(),'t');
    });
    await check(t,'Bagger private definer wrapper is denied for anon, participant/ordinary authenticated and service_role',()=>{
      for(const role of ['anon','authenticated','service_role']) {
        const result=sqlResult(cluster,database,`set role ${role};select bagger_private.dispatch();`,{role:''});
        assert.notEqual(result.status,0);assert.match(result.stderr,/permission denied/);
      }
    });
    await check(t,'generic provider SQL HTTP capability controls URL, body and headers without using Bagger authority',()=>{
      for(const role of ['anon','authenticated','service_role']) {
        q(`begin;set local role ${role};select net.http_post('https://invalid.example/synthetic', '{}'::jsonb,'{"synthetic-header":"value"}'::jsonb);rollback;`);
      }
      assert.equal(q('select count(*)from net.http_request_queue'),'0');
    });
    await check(t,'Vault direct SQL access differs from private-wrapper and Data API access',()=>{
      // No value is retrieved. The boolean is the authority violation; Vault
      // encryption does not remove SELECT on its decrypted view.
      assert.equal(q("select has_schema_privilege('service_role','vault','USAGE')and has_table_privilege('service_role','vault.decrypted_secrets','SELECT')"),'t');
      for(const role of ['anon','authenticated']) {
        const result=sqlResult(cluster,database,`set role ${role};select count(*)from vault.decrypted_secrets;`,{role:''});
        assert.notEqual(result.status,0);assert.match(result.stderr,/permission denied/);
      }
    });
    await check(t,'a queue reader can recover an issued header: no safe long-lived bypass secret may be enqueued',()=>{
      q(`begin;set local role provider_admin;select net.http_post('https://invalid.example/fixed','{}'::jsonb,'{"x-bagger-worker-signature":"SYNTHETIC_HEADER","x-vercel-protection-bypass":"SYNTHETIC_BYPASS"}'::jsonb);
        set local role service_role;select 1;rollback;`);
      // Verify with one session; only a boolean escapes. Never record credentials.
      assert.equal(q(`begin;set local role provider_admin;select net.http_post('https://invalid.example/fixed','{}'::jsonb,'{"x-bagger-worker-signature":"SYNTHETIC_HEADER"}'::jsonb)>0;
        set local role anon;select bool_and(headers?'x-bagger-worker-signature')from net.http_request_queue;rollback;`),'t\nt');
    });
  } finally {await destroyIsolatedCluster(cluster);}
});

test('existing Bagger guard and endpoint stay fail-closed under provider-shaped privileges',async t=>{
  let f;
  try {
    f=await createSupervisorFixture();
    sqlFile(f.cluster,f.database,repositoryRoot+'/supabase/production_incremental/certification-worker-supervision-v1.sql',{role:''});
    const bound=supervisorEnvelope(f.env,f.dependencies),control=createSupervisorTransport({env:f.env,dependencies:f.dependencies});
    const owner=(name,input={})=>f.owner('worker_supervisor_'+name+'_v1',{...bound,...input});
    owner('configure',{signing_secret_id:f.keyId});
    f.toggle(true);
    const context=JSON.parse(f.q(`select production_control.worker_supervisor_binding_v1(${jsonLiteral(bound)})`));delete context.resource;delete context.deployment;
    owner('control',{action:'START',request_id:randomUUID(),expected_revision:owner('status').revision,expected_context:context,
      expires_at:new Date(Date.now()+600000).toISOString(),budget:2,slots:1});
    await check(t,'current provider ACL guard rejects PUBLIC queue access and rolls back both reservation and HTTP enqueue',()=>{
      f.q('grant usage on schema net to public;grant select,insert,update,delete on net.local_requests to public');
      assert.throws(()=>f.q('select production_control.worker_supervisor_dispatch_v1()'),/SUPERVISOR_PROVIDER_SECRET_ACL_REQUIRED/);
      assert.equal(f.q('select count(*)from net.local_requests'),'0');assert.equal(owner('status').dispatched,0);
      f.q('revoke all on net.local_requests from public');
    });
    await check(t,'current provider ACL guard independently rejects service_role decrypted-Vault read',()=>{
      f.q('grant usage on schema vault to service_role;grant select on vault.decrypted_secrets to service_role');
      assert.throws(()=>f.q('select production_control.worker_supervisor_dispatch_v1()'),/SUPERVISOR_PROVIDER_SECRET_ACL_REQUIRED/);
      assert.equal(f.q('select count(*)from net.local_requests'),'0');assert.equal(owner('status').dispatched,0);
      f.q('revoke all on vault.decrypted_secrets from service_role;revoke usage on schema vault from service_role');
    });
    const ticket=JSON.parse(f.q('select production_control.worker_supervisor_reserve_v1()'));
    const url=bound.deployment.deployment_origin+SUPERVISOR_PATH;
    const request=(signature=ticket.signature,body=ticket.body,target=url)=>new Request(target,{method:'POST',headers:{'content-type':'application/json',...(signature?{'x-bagger-worker-signature':signature}:{})},body});
    await check(t,'unsigned generic HTTP and wrong signatures never reach BEGIN or the worker',async()=>{
      let calls=0;const options={env:f.env,dependencies:f.dependencies,control:async()=>{calls++;throw new Error('MUST_NOT_EXECUTE');}};
      for(const signature of [null,randomBytes(32).toString('hex')]) {
        const response=await handleSupervisorRequest(request(signature),options);
        assert.equal(response.status,403);assert.equal(calls,0);assert.match((await response.json()).code,/SUPERVISOR_(REQUEST|SIGNATURE)_DENIED/);
      }
    });
    await check(t,'a captured still-valid ticket is a bounded bearer permit, not a secret or permission to mint new requests',()=>{
      // Deliberately document the queue preplay limitation instead of treating
      // short expiry/replay protection as protection against first-use theft.
      assert.equal(verifySupervisorRequest(request(),ticket.body,{env:f.env,dependencies:f.dependencies}).ticket.invocation_id,ticket.invocation_id);
      const changed=JSON.stringify({...JSON.parse(ticket.body),nonce:randomUUID()});
      assert.throws(()=>verifySupervisorRequest(request(ticket.signature,changed),changed,{env:f.env,dependencies:f.dependencies}),/SUPERVISOR_SIGNATURE_DENIED/);
    });
    await check(t,'endpoint refuses arbitrary URL/path/method/resource and Production environment',()=>{
      for(const target of ['https://baggerinv.com'+SUPERVISOR_PATH,url+'?resource=arbitrary',bound.deployment.deployment_origin+'/arbitrary'])
        assert.throws(()=>verifySupervisorRequest(request(ticket.signature,ticket.body,target),ticket.body,{env:f.env,dependencies:f.dependencies}));
      assert.throws(()=>verifySupervisorRequest(new Request(url,{method:'GET'}),ticket.body,{env:f.env,dependencies:f.dependencies}));
      const body=JSON.stringify({...JSON.parse(ticket.body),resource_id:'arbitrary'});
      const signature=signSupervisorInvocation(body,bound.deployment.deployment_origin,f.env.CERTIFICATION_WORKER_SIGNING_KEY);
      assert.throws(()=>verifySupervisorRequest(request(signature,body),body,{env:f.env,dependencies:f.dependencies}),/SUPERVISOR_TICKET_EXPIRED_OR_INVALID/);
      assert.throws(()=>verifySupervisorRequest(request(),ticket.body,{env:{...f.env,VERCEL_ENV:'production'},dependencies:f.dependencies}));
    });
    await check(t,'expired scheduler ticket and valid HMAC without a real reservation are denied',async()=>{
      assert.throws(()=>verifySupervisorRequest(request(),ticket.body,{env:f.env,dependencies:f.dependencies,now:JSON.parse(ticket.body).expires_at}),/SUPERVISOR_TICKET_EXPIRED_OR_INVALID/);
      const body=JSON.stringify({...JSON.parse(ticket.body),invocation_id:randomUUID()});
      const signature=signSupervisorInvocation(body,bound.deployment.deployment_origin,f.env.CERTIFICATION_WORKER_SIGNING_KEY);
      await assert.rejects(control('BEGIN',{body,signature}));
    });
    await check(t,'single-use canonical reservation rejects second BEGIN even with identical valid HMAC',async()=>{
      const begin=await control('BEGIN',{body:ticket.body,signature:ticket.signature});
      await assert.rejects(control('BEGIN',{body:ticket.body,signature:ticket.signature}),/SUPERVISOR_REPLAY_DENIED/);
      await control('FINISH',{invocation_id:begin.invocation_id,run_token:begin.run_token,outcome:'STOPPED'});
    });
    await check(t,'private dispatcher and secret getter remain inaccessible to application roles',()=>{
      for(const role of ['anon','authenticated','service_role']) {
        assert.equal(f.q(`select has_function_privilege('${role}','production_control.worker_supervisor_dispatch_v1()','EXECUTE')`),'f');
        assert.equal(f.q(`select has_function_privilege('${role}','production_control.worker_supervisor_key_v1(uuid)','EXECUTE')`),'f');
      }
      assert.equal(f.q('select count(*)from net.local_requests'),'0');
    });
    owner('control',{action:'STOP',request_id:randomUUID(),expected_revision:owner('status').revision});f.toggle(false);
    await check(t,'local model finishes OFF, admission disabled and ingress paused without worker execution',()=>{
      assert.equal(owner('status').state,'OFF');
      assert.equal(f.q('select enabled from production_control.certification_admission_v1'),'f');
      assert.equal(f.q('select state from scoring_authority.ingress_gates'),'PAUSED');
      assert.equal(f.q('select count(*)from net.local_requests'),'0');
    });
    const artifact=await readFile(repositoryRoot+'/supabase/production_incremental/certification-worker-supervision-v1.sql','utf8');
    assert.match(artifact,/SUPERVISOR_PROVIDER_SECRET_ACL_REQUIRED/);
  } finally {
    if(f)await destroyIsolatedCluster(f.cluster);
    await mkdir('docs/reliability/phase2d-worker-supervision/provider-portability/evidence',{recursive:true});
    await writeFile('docs/reliability/phase2d-worker-supervision/provider-portability/evidence/LOCAL-MODEL.json',JSON.stringify(evidence,null,2)+'\n');
  }
});
