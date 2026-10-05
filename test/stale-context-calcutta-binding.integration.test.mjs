// Owned socket-only PostgreSQL. The HTTP boundary alone is substituted.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createCertificationFixture} from './support/reliability/phase2d-certification-fixture.mjs';
import {certificationProvisionalProfile as forwardMigrations} from './support/reliability/certification-provisional-profile.mjs';
import {certificationTransportRegistration} from './support/reliability/certification-ingress-js-proof.mjs';
import {destroyIsolatedCluster,jsonLiteral,sqlResult,sqlFile,repositoryRoot,openSqlSession} from './support/reliability/postgres17.mjs';
import {canonicalCatalog,canonicalTableCounts} from '../tools/reliability/canonical-bootstrap-artifacts.mjs';
import {authorizeMatchAccess} from '../lib/match-authorization-supabase.js';
import {shippingAuthorizationRoute} from './support/reliability/certification-match-authorization-route.mjs';

const directory='docs/reliability/phase2d-stale-context-calcutta-binding-remediation/evidence';
const artifact='supabase/production_incremental/certification-stale-context-error-v1.sql';
const manifest=JSON.parse(await readFile(directory+'/../manifest.json','utf8'));
test('forward stale-context correction preserves the complete local catalog and denial predicates',async t=>{
 let f;const evidence={environment:'OWNED_SOCKET_ONLY_POSTGRESQL17',hosted:false,cases:[]};
 const check=async(name,fn)=>{let failure;await t.test(name,async()=>{try{await fn();evidence.cases.push({name,result:'PASS'});}catch(e){failure=e;throw e;}});if(failure)throw failure;};
 try{
  f=await createCertificationFixture({forwardMigrations,registrationFactory:certificationTransportRegistration});
  const toggle=enabled=>f.owner('set_certification_admission_v1',{resource_id:f.resource.resource_id,
   expected_admission_revision:Number(f.q('select admission_revision from production_control.certification_admission_v1')),
   enabled,reason:'Owned local error-contract proof'});
  const apply=()=>sqlFile(f.cluster,f.database,path.join(repositoryRoot,artifact),{role:''});
  toggle(false);
  // Reproduce the separately reviewed forward correction already installed at
  // the owner's hosted baseline; the new artifact must coexist unchanged.
  sqlFile(f.cluster,f.database,path.join(repositoryRoot,'supabase/production_incremental/calcutta-empty-auction-demand-v1.sql'),{role:''});
  const before=await canonicalCatalog(f.cluster,f.database),counts=canonicalTableCounts(f.cluster,f.database);
  await check('installation changes only four exact function bodies, preserves ACL/RLS/owner/security/data/receipt',async()=>{
   apply();const after=await canonicalCatalog(f.cluster,f.database);
   const changed=[];
   for(let i=0;i<before.functions.length;i++){
    const a=after.functions[i],b=before.functions[i];assert.equal(a.identity,b.identity);
    if(a.definitionSha256!==b.definitionSha256){changed.push(a.identity);a.definitionSha256=b.definitionSha256;}
   }
   assert.equal(changed.length,4);assert.deepEqual(changed.map(x=>x.split('(')[0]).sort(),manifest.functions.map(x=>x.signature.split('(')[0]).sort());
   assert.deepEqual(after,before);assert.deepEqual(canonicalTableCounts(f.cluster,f.database),counts);
   for(const row of manifest.functions)assert.equal(f.q(`select encode(extensions.digest(prosrc,'sha256'),'hex') from pg_proc where oid='${row.signature}'::regprocedure`),row.new_body_sha256);
   evidence.changedFunctions=changed;evidence.catalogSections=Object.keys(before);evidence.dataUnchanged=true;
  });
  await check('same artifact replay is idempotent and private execution remains denied',async()=>{
   const before=await canonicalCatalog(f.cluster,f.database);apply();assert.deepEqual(await canonicalCatalog(f.cluster,f.database),before);
   for(const role of ['anon','authenticated','service_role']){
    const result=sqlResult(f.cluster,f.database,`set role ${role};select production_control.current_certification_context_v1()`,{role});
    assert.notEqual(result.status,0);assert.match(result.stderr,/permission denied/);
   }
  });
  await check('unexpected predecessor denies atomically before any correction',async()=>{
   const text=(await readFile(artifact,'utf8')).replace(/^\\set.*\n/m,'').replace(/^begin;\n/m,'').replace(/commit;\s*$/,'');
   const before=await canonicalCatalog(f.cluster,f.database);
   // Local rollback fault: restore one predecessor, corrupt a later one, then
   // execute the reviewed preflight. The entire owner transaction must abort.
   const first=manifest.functions[0],last=manifest.functions.at(-1);
   const result=sqlResult(f.cluster,f.database,`begin;do $fault$ declare d text;begin
    d:=pg_get_functiondef('${first.signature}'::regprocedure);execute replace(d,'errcode=''PT409'',message=''CANONICAL_RESOURCE_CONTEXT_STALE''','errcode=''40001'',message=''CANONICAL_RESOURCE_CONTEXT_STALE''');
    d:=pg_get_functiondef('${last.signature}'::regprocedure);execute replace(d,'CANONICAL_RESOURCE_CONTEXT_STALE','SYNTHETIC_UNREVIEWED_BODY');end;$fault$;
    ${text}\nrollback;`,{role:''});
   assert.notEqual(result.status,0);assert.match(result.stderr,/CERTIFICATION_STALE_CONTEXT_CORRECTION_PREDECESSOR_MISMATCH/);
   assert.deepEqual(await canonicalCatalog(f.cluster,f.database),before);
  });
  toggle(true);
  const readContext=f.context('READS');
  const input={...f.envelope,phase:'READS',expected_context_token:readContext.context_token};
  const denied=(statement)=>{
   const started=performance.now(),result=sqlResult(f.cluster,f.database,'\\set VERBOSITY verbose\n'+statement,{role:'service_role'});
   assert.notEqual(result.status,0);const m=/ERROR:\s+([0-9A-Z]{5}):\s*([^\n]+)/.exec(result.stderr);assert.ok(m,result.stderr);
   return{sqlstate:m[1],message:m[2],milliseconds:performance.now()-started};
  };
  await check('current context succeeds; stale token returns PT409 promptly through the public projection',async()=>{
   assert.equal(f.rpc('read_certification_runtime_context_v1',input).context.context_token,readContext.context_token);
   const stale={...input,expected_context_token:'0'.repeat(64),operation:'READS.CURRENT_VIEW',payload:{surface:'MATCH_AUTHORIZATION',target_tournament_id:'2026'}};
   const result=denied(`set role service_role;select public.read_certification_projection_v1(${jsonLiteral(stale)});`);
   assert.equal(result.sqlstate,'PT409');assert.equal(result.message,'CANONICAL_RESOURCE_CONTEXT_STALE');assert.ok(result.milliseconds<5000);evidence.staleProjection=result;
  });
  await check('cached generation/revision changes remain denied by the unchanged current-context guard',async()=>{
   // Rollback-only marker fault models a cached, once-valid generation/context;
   // the production predicate remains the exact same jsonb comparison.
   for(const field of ['authority_epoch_id','admission_revision','pointer_revision']){
    const result=denied(`begin;select production_control.push_certification_context_v1(${jsonLiteral(input)},'READS',false);
     update production_control.canonical_operation_context_v1 set context=jsonb_set(context,'{${field}}',to_jsonb('stale'::text));
     select production_control.current_certification_context_v1();rollback;`);
    assert.equal(result.sqlstate,'PT409');assert.equal(result.message,'CANONICAL_RESOURCE_CONTEXT_STALE');
   }
  });
  await check('wrong resource/release/deployment remains denied without changing authority',async()=>{
   for(const field of ['resource_id','project_ref','registration_revision']){
    const wrong=structuredClone(input);wrong.resource[field]=field==='registration_revision'?999:'wrong';
    const result=denied(`set role service_role;select public.read_certification_runtime_context_v1(${jsonLiteral(wrong)})`);
    assert.match(result.message,/DENIED|STALE/);
   }
   for(const field of ['release_commit','deployment_id']){
    const wrong=structuredClone(input);wrong.deployment[field]='wrong';
    const result=denied(`set role service_role;select public.read_certification_runtime_context_v1(${jsonLiteral(wrong)})`);
    assert.match(result.message,/DENIED/);
   }
  });
  await check('actual SQL denial maps through the shipping authorization route to sanitized 409 with one attempt',async()=>{
   const {env,registrationManifest}=f.transportFixture;let projectionAttempts=0;
   const dependencies={registrationManifest,fetchImpl:async(url,init)=>{
    const name=new URL(url).pathname.split('/').at(-1),value=JSON.parse(init.body).input;
    assert.equal(new URL(url).origin,f.resource.project_url);
    assert.ok(['read_certification_runtime_context_v1','read_certification_projection_v1'].includes(name));
    if(name==='read_certification_projection_v1'){projectionAttempts++;toggle(true);}
    const result=sqlResult(f.cluster,f.database,`\\set VERBOSITY verbose\nset role service_role;select public.${name}(${jsonLiteral(value)});`,{role:'service_role'});
    if(result.status!==0){const m=/ERROR:\s+([0-9A-Z]{5}):\s*([^\n]+)/.exec(result.stderr);assert.ok(m);assert.equal(m[1],'PT409');return Response.json({code:m[1],message:m[2]},{status:409});}
    return Response.json(JSON.parse(result.stdout.trim()));
   }};
   const route=await shippingAuthorizationRoute({authorize:value=>authorizeMatchAccess(value,{env,certificationDependencies:dependencies})});
   const started=performance.now(),result=await route.request();
   assert.equal(result.response.status,409);assert.equal(result.body.code,'CANONICAL_RESOURCE_CONTEXT_STALE');
   assert.deepEqual(Object.keys(result.body).sort(),['code','error']);assert.equal(result.cookies.length,0);assert.equal(projectionAttempts,1);
   evidence.shipping={status:result.response.status,code:result.body.code,attempts:projectionAttempts,milliseconds:performance.now()-started};
  });
  await check('genuine PostgreSQL serializable concurrent update still emits 40001',async()=>{
   f.q('create table public.synthetic_serialization_proof(id integer primary key,value integer);insert into public.synthetic_serialization_proof values(1,0)');
   const first=openSqlSession(f.cluster,f.database),second=openSqlSession(f.cluster,f.database);
   try{
    await first.query('begin isolation level serializable;select value from public.synthetic_serialization_proof where id=1');
    await second.query('\\set VERBOSITY verbose\nbegin isolation level serializable;select value from public.synthetic_serialization_proof where id=1');
    await first.query('update public.synthetic_serialization_proof set value=1 where id=1;commit');
    await assert.rejects(second.query('update public.synthetic_serialization_proof set value=2 where id=1'),/40001:.*could not serialize/);
    assert.equal(f.q('select value from public.synthetic_serialization_proof where id=1'),'1');evidence.genuineSerializationSqlstate='40001';
   }finally{await first.close();await second.close();f.q('drop table public.synthetic_serialization_proof');}
  });
  toggle(false);evidence.result='PASS';
 }catch(error){evidence.result='FAIL';evidence.error=error.message;throw error;}
 finally{await mkdir(directory,{recursive:true});await writeFile(directory+'/canonical-proof.json',JSON.stringify(evidence,null,2)+'\n');if(f)await destroyIsolatedCluster(f.cluster);}
});
