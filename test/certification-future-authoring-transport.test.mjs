// Local transport proof only. PostgreSQL authoring/annual race proof is separate.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {certificationOperationRpc} from '../lib/certification-runtime-server.js';
import {certificationRuntimeFixture} from './support/reliability/certification-runtime-fixture.mjs';

const operationRequestId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const operationNames=['RUNTIME','GUIDE_CREATE','GUIDE_VALIDATE','GUIDE_PUBLISH','DRAFT_STAGE','DRAFT_VALIDATE','DRAFT_COMMIT','PREDICTION_STAGE','PREDICTION_VALIDATE','PREDICTION_COMMIT'];
for(const name of operationNames)test(`fixed future authoring transport: ${name}`,async()=>{
 const f=certificationRuntimeFixture();
 const authorization={passport_verified:true,auth_user_id:f.authorization.identity.authUserId,player_id:'SYNTHETIC-P01',role:'DIRECTOR',tournament_id:'2026'};
 const payload={target_tournament_id:'2091',...(name==='RUNTIME'?{action:'PROMOTE_RUNTIME_STRUCTURE',expected_revision:1}:{})};
 const result=await certificationOperationRpc(`ANNUAL.${name}`,payload,{env:f.env,operationRequestId,expectedContextToken:'b'.repeat(64),authorization},f.dependencies);
 assert.equal(result.payload.ok,true);assert.equal(f.requests.length,2);
 assert.match(f.requests[0].url,/read_certification_runtime_context_v1$/);
 const executed=f.requests[1];assert.match(executed.url,/mutate_certification_future_authoring_v1$/);
 assert.equal(executed.input.phase,'ANNUAL');assert.equal(executed.input.operation_id,`ANNUAL.${name}`);
 assert.equal(executed.input.operation_request_id,operationRequestId);assert.equal(executed.input.expected_context_token,'b'.repeat(64));
 assert.equal(executed.input.resource.resource_class,'CERTIFICATION');assert.deepEqual(executed.input.authorization,authorization);
 assert.deepEqual(executed.input.payload,payload);assert.equal(Object.hasOwn(executed.input,'ingress'),false);
});
test('future authoring rejects forged authority, unknown operation and stale context before mutation',async()=>{
 const f=certificationRuntimeFixture();
 await assert.rejects(certificationOperationRpc('ANNUAL.SYNCHRONIZE_GOOGLE',{}, {env:f.env,operationRequestId},f.dependencies),{code:'CERTIFICATION_OPERATION_FORBIDDEN'});
 await assert.rejects(certificationOperationRpc('ANNUAL.DRAFT_COMMIT',{target_tournament_id:'2091',authorization:{role:'OWNER'}}, {env:f.env,operationRequestId},f.dependencies),{code:'CERTIFICATION_INPUT_INVALID'});
 assert.equal(f.requests.length,0);
 await assert.rejects(certificationOperationRpc('ANNUAL.DRAFT_COMMIT',{target_tournament_id:'2091'}, {env:f.env,operationRequestId,expectedContextToken:'c'.repeat(64)},f.dependencies),{code:'CERTIFICATION_CONTEXT_STALE'});
 assert.equal(f.requests.length,1);
});
test('lost authoring response remains UNKNOWN with original identity and no fallback or automatic retry',async()=>{
 const f=certificationRuntimeFixture(),fetch=f.dependencies.fetchImpl;
 f.dependencies.fetchImpl=async(url,init)=>{
  if(url.endsWith('/mutate_certification_future_authoring_v1')){f.requests.push({url,input:JSON.parse(init.body).input});throw Error('synthetic lost acknowledgement');}
  return fetch(url,init);
 };
 await assert.rejects(certificationOperationRpc('ANNUAL.PREDICTION_COMMIT',{target_tournament_id:'2091'}, {env:f.env,operationRequestId},f.dependencies),
  {code:'CERTIFICATION_TRANSPORT_UNAVAILABLE',operationRequestId,outcome:'UNKNOWN',recovery:'CHECK_STATUS_RETRY_SAME_OPERATION'});
 assert.equal(f.requests.length,2);assert.equal(f.requests[1].input.operation_request_id,operationRequestId);
});
test('authoring source preserves readiness invalidation, future-only admission and private cores',()=>{
 const sql=readFileSync(new URL('../supabase/production_migrations/202609300139_certification_future_authoring_v1.sql',import.meta.url),'utf8');
 const gateway=sql.slice(sql.indexOf('create function public.mutate_certification_future_authoring_v1'));
 assert.match(gateway,/target_id::integer <= \(context->>'current_tournament_year'\)::integer/);
 assert.ok(gateway.indexOf('pg_advisory_xact_lock')<gateway.indexOf('push_certification_context_v1'));
 assert.match(gateway,/r\.project_ref=resource\.project_ref and r\.project_url=resource\.project_url/);
 assert.match(sql,/lifecycle=case when value\.lifecycle='READY_FOR_ACTIVATION'\s+then 'CONFIGURING'/);
 assert.match(sql,/lifecycle = case when value\.lifecycle = 'READY_FOR_ACTIVATION'\s+then 'CONFIGURING'/);
 assert.match(sql,/CANONICAL_AUTHORING_PRODUCTION_FUNCTION_ATTRIBUTES_CHANGED/);
 assert.match(sql,/CANONICAL_AUTHORING_PRIVATE_CORE_PRIVILEGE_INVALID/);
 assert.doesNotMatch(gateway,/when 'ANNUAL\.(?:SYNC|GOOGLE|ACTIVATE|CLOSE)'/);
});
