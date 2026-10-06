import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CERTIFICATION_OPERATIONS} from '../lib/certification-runtime-server.js';
import {readIsolatedDirectorOperations,mutateIsolatedDirectorOperations} from '../lib/isolated-director-operations.js';
import {certificationWorkerRpc} from '../lib/certification-worker-adapter.js';
import {createCanonicalDirectorOperationsTransport} from '../lib/canonical-director-operations-client.js';
import {randomUUID} from 'node:crypto';
const active={status:'active',source:'entitlement',identity:{authUserId:randomUUID(),actor:{id:'P01',role:'DIRECTOR'},tournamentId:'2026'}};
test('publication is a fixed Director mutation/read; no new worker engine or RPC authority',async()=>{
 assert.deepEqual(CERTIFICATION_OPERATIONS['DIRECTOR.PUBLISH_CALCUTTA'],{phase:'DIRECTOR',mutation:true});
 assert.deepEqual(CERTIFICATION_OPERATIONS['DIRECTOR.READ_CALCUTTA_PUBLICATION'],{phase:'DIRECTOR',mutation:false});
 assert.equal(CERTIFICATION_OPERATIONS['WORKERS.PUBLISH_CALCUTTA'],undefined);
 await assert.rejects(certificationWorkerRpc('publish_production_calcutta_v1',{}, {env:{BAGGER_CERTIFICATION_RESOURCE_ID:'CERTIFICATION:any'}}),e=>e.code==='CERTIFICATION_OPERATION_FORBIDDEN');
});
for(const environment of ['production','preview','development'])test('generic '+environment+' cannot use Certification publication family',async()=>{
 const env={VERCEL_ENV:environment};
 await assert.rejects(readIsolatedDirectorOperations({authorization:active,family:'CALCUTTA_PUBLICATION',env}),e=>e.code==='DIRECTOR_OPERATIONS_CONTEXT_REQUIRED');
 await assert.rejects(mutateIsolatedDirectorOperations({authorization:active,input:{family:'CALCUTTA_PUBLICATION'},env}),e=>e.code==='DIRECTOR_OPERATIONS_CONTEXT_REQUIRED');
});
test('browser command carries CAS expectations only; fixed family/action/transport',async()=>{
 const calls=[],context={contract:'isolated-director-operations-v1',bindingId:randomUUID(),contextToken:'a'.repeat(64),tournamentId:'2026',governanceTournamentId:'2026'};
 const transport=createCanonicalDirectorOperationsTransport({fetchImpl:async(url,init)=>{calls.push({url,init});return Response.json({ok:true,contract:'isolated-director-operations-v1',authority:'supabase',fallbackUsed:false,googleRequests:0,context,family:null});}});
 await transport.read();await assert.rejects(transport.calcuttaPublicationRequest({operationRequestId:randomUUID(),expectedResultRevision:1}));
 const input=JSON.parse(calls[1].init.body);assert.equal(input.family,'CALCUTTA_PUBLICATION');assert.equal(input.action,'publish');
 assert.deepEqual(Object.keys(input.payload),['expectedResultRevision']);assert.equal(calls[1].url,'/api/director/canonical-operations');
});
test('actual Production admin handler stays 404 in Preview before authentication or database access',async()=>{
 const key='production-calcutta-guard-'+randomUUID(),old=process.env.VERCEL_ENV;let calls=0;
 globalThis[key]={NextResponse:Response,withOperationalRoute:(_config,handler)=>handler,
  authorizePreviewDirector:async()=>{calls++;throw new Error('AUTH_MUST_NOT_RUN');}};
 const source=(await readFile(new URL('../app/api/admin/production-calcutta-v1/route.js',import.meta.url),'utf8'))
  .replace(/^import\s+\{([\s\S]*?)\}\s+from\s+["'][^"']+["'];\n/gm,
   (_match,names)=>`const {${names.replace(/\bas\b/g,':')}}=globalThis[${JSON.stringify(key)}];\n`);
 try{
  process.env.VERCEL_ENV='preview';
  const route=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')+'#'+key);
  const response=await route.POST(new Request('https://synthetic.vercel.app/api/admin/production-calcutta-v1',{method:'POST',body:JSON.stringify({action:'publish'})}));
  assert.equal(response.status,404);assert.equal(calls,0);
 }finally{delete globalThis[key];if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
test('forward correction has eight exact guarded bodies and four private helpers; no domain/claims/RLS/Production-route mutation',async()=>{
 const sql=await readFile(new URL('../supabase/production_incremental/certification-calcutta-publication-v1.sql',import.meta.url),'utf8');
 const manifest=JSON.parse(sql.split('$manifest$')[1]);assert.equal(manifest.length,8);
 assert.ok(manifest.every(p=>/^[a-f0-9]{64}$/.test(p.old_hash)&&/^[a-f0-9]{64}$/.test(p.new_hash)));
 assert.ok(manifest.some(p=>p.signature==='public.publish_production_calcutta_v1(jsonb)'&&p.new.includes('canonical_publish_calcutta_v1(input,null)')));
 assert.ok(!/create policy|alter.*row level|grant execute|disable.*safeupdate/i.test(sql));
 assert.match(sql,/result_value.source_fingerprint is distinct from source_fingerprint/);assert.match(sql,/revoke all on function production_control.canonical_publish_calcutta_v1/);
});
