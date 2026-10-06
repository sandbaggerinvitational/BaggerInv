import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {certificationOperationRpc} from '../lib/certification-runtime-server.js';
import {certificationRuntimeFixture} from './support/reliability/certification-runtime-fixture.mjs';
import {repositoryRoot} from './support/reliability/postgres17.mjs';
const base='2a0e47c7d107de96aa0ac77d4e1cb9ba0c4aa2ea';
for(const file of ['lib/production-net-skins-server.js','lib/production-full-net.js','lib/net-skins.js',
 'app/api/admin/production-net-skins-v1/route.js','app/api/leaderboards/net-skins/route.js',
 'lib/certification-net-skins-participant.js','lib/certification-worker-engines.js',
 'supabase/production_incremental/certification-net-skins-result-read-v1.sql',
 'supabase/production_incremental/certification-queue-calcutta-scope-v1.sql',
 'supabase/production_incremental/certification-calcutta-publication-v1.sql'])test('preserved base contract: '+file,async()=>{
 const prior=execFileSync('git',['show',`${base}:${file}`],{cwd:repositoryRoot,encoding:'utf8'});
 assert.equal(await readFile(repositoryRoot+'/'+file,'utf8'),prior);
});
test('fixed calculation operation uses current bound Certification Director envelope; no generic processor authority',async()=>{
 const f=certificationRuntimeFixture();
 await certificationOperationRpc('DIRECTOR.CALCULATE_NET_SKINS',{expected_configuration_revision:1,entry_revisions:{3:1},source_fingerprints:{3:'a'.repeat(64)}},
  {env:f.env,authorization:{role:'DIRECTOR'},operationRequestId:'8da1e4c2-7087-4bf2-8a9a-5a430f600691'},f.dependencies);
 const c=f.requests.at(-1).input;assert.equal(c.phase,'DIRECTOR');assert.equal(c.operation_id,'DIRECTOR.CALCULATE_NET_SKINS');assert.equal(c.resource.resource_class,'CERTIFICATION');assert.equal(c.deployment.deployment_id,f.env.VERCEL_DEPLOYMENT_ID);assert.ok(c.expected_context_token);
});
for(const [code,status]of [['PRODUCTION_NET_SKINS_CONFIGURATION_REQUIRED',409],['FULL_NET_ENTRY_REVISION_STALE_OR_UNAVAILABLE',409],
 ['PRODUCTION_NET_SKINS_SOURCE_REVISION_CONFLICT',409],['PRODUCTION_IDEMPOTENCY_CONFLICT',409],['DIRECTOR_REQUIRED',403]])test('typed canonical '+code+' is not an infrastructure 503',async()=>{
 const f=certificationRuntimeFixture(),original=f.dependencies.fetchImpl;f.dependencies.fetchImpl=async(url,init)=>url.endsWith('/execute_certification_operation_v1')?Response.json({code:'40001',message:code},{status:400}):original(url,init);
 await assert.rejects(certificationOperationRpc('DIRECTOR.CALCULATE_NET_SKINS',{},
  {env:f.env,operationRequestId:'8da1e4c2-7087-4bf2-8a9a-5a430f600691'},f.dependencies),e=>e.status===status&&e.domainCode===code);
});
test('unexpected SQLSTATE stays infrastructure; receipt absence is not manufactured COMMITTED',async()=>{
 const f=certificationRuntimeFixture(),original=f.dependencies.fetchImpl;f.dependencies.fetchImpl=async(url,init)=>url.endsWith('/execute_certification_operation_v1')?Response.json({code:'21000',message:'UPDATE requires a WHERE clause'},{status:400}):original(url,init);
 await assert.rejects(certificationOperationRpc('DIRECTOR.CALCULATE_NET_SKINS',{},
  {env:f.env,operationRequestId:'8da1e4c2-7087-4bf2-8a9a-5a430f600691'},f.dependencies),e=>e.status===503&&!e.domainCode&&e.outcome==='UNKNOWN');
});
