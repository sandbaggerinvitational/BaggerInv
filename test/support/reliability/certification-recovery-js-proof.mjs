// Existing Director and scoring adapters against the owned local PostgreSQL
// fixture. Only HTTP is replaced; emitted envelopes and domain payloads survive
// unchanged into the service-role RPC. No hosted connection or provider key.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {jsonLiteral,sqlResult} from './postgres17.mjs';
import {mutateIsolatedDirectorOperations,resolveIsolatedDirectorOperation} from '../../../lib/isolated-director-operations.js';
import {canonicalDirectorOperationsRequest} from '../../../lib/canonical-director-operations-client.js';
import {mutateIsolatedCanonicalDirectorMatch} from '../../../lib/canonical-director-overview.js';
import {readCanonicalScoreMutationStatus} from '../../../lib/scoring-authority-supabase.js';
import {recoverCanonicalScoreMutation} from '../../../lib/scoring-mutation-recovery.js';

function transport(fixture){
 const {env,registrationManifest}=fixture.transportFixture,calls=[];
 const allowed=new Set(['read_certification_runtime_context_v1','read_certification_operation_v1',
  'execute_certification_operation_v1','admit_certification_operation_v1',
  'mark_certification_ingress_unknown_v1','read_certification_director_recovery_material_v1']);
 const dependencies={registrationManifest,fetchImpl:async(url,init)=>{
  const target=new URL(url),name=target.pathname.split('/').at(-1);
  assert.equal(target.origin,fixture.resource.project_url);assert.ok(allowed.has(name));
  assert.equal(target.pathname,'/rest/v1/rpc/'+name);assert.equal(init.headers.apikey,env.SUPABASE_SCORING_MIRROR_SECRET_KEY);
  const input=JSON.parse(init.body).input;calls.push({name,input});
  const result=sqlResult(fixture.cluster,fixture.database,
   `\\set VERBOSITY verbose\nset role service_role;select public.${name}(${jsonLiteral(input)});`,{role:'service_role'});
  if(result.status!==0){
   const error=/ERROR:\s+([0-9A-Z]{5}):\s*([^\n]+)/.exec(result.stderr);assert.ok(error,result.stderr);
   return Response.json({code:error[1],message:error[2]},{status:400});
  }
  return Response.json(JSON.parse(result.stdout.trim()));
 }};
 const identity=fixture.envelope.authorization;
 const authorization={status:'active',source:'entitlement',identity:{authUserId:identity.auth_user_id,
  actor:{id:identity.player_id,role:'DIRECTOR'},tournamentId:identity.tournament_id}};
 return{env,dependencies,calls,authorization};
}

export async function prepareDomainRecoveryTransportProof({fixture}){
 const prepared=transport(fixture),{env,dependencies,authorization}=prepared;
 const original=fixture.model();
 const operationInput={family:'TOURNAMENT_SETUP',action:'update-tournament',operationRequestId:randomUUID(),
  expectedContextToken:fixture.context().context_token,payload:{expectedRevision:original.revision,
   name:'Synthetic adapter recovery tournament',destination:'Synthetic course',startDate:'2026-09-20',endDate:'2026-09-22',
   timeZone:'America/Chicago',operationalStatus:'UPCOMING'}};
 const result=await mutateIsolatedDirectorOperations({authorization,input:operationInput,env},{certificationDependencies:dependencies});
 assert.equal(result.committed,true);assert.equal(result.readbackVerified,true);
 assert.equal(result.context.contextToken,operationInput.expectedContextToken);
 return{...prepared,operationInput,result};
}

export async function runDomainRecoveryTransportProof({t,fixture,prepared,scoreRequest,finalizeRequest,reopenRequest}){
 const {env,dependencies,authorization,calls,operationInput}=prepared;
 await t.test('shipping Director client recovers exact original committed setup after admission closes',async()=>{
  const offset=calls.length;
  const input={...operationInput,mode:'status'};
  const result=await canonicalDirectorOperationsRequest(input,{fetchImpl:async(_url,init)=>Response.json(
   await resolveIsolatedDirectorOperation({authorization,input:JSON.parse(init.body),env},{certificationDependencies:dependencies}))});
  assert.equal(result.committed,true);assert.equal(result.outcome,'COMMITTED');assert.equal(result.readbackVerified,false);
  assert.equal(result.operationRequestId,operationInput.operationRequestId);assert.deepEqual(result.context,prepared.result.context);
  assert.equal(calls[offset].name,'read_certification_director_recovery_material_v1');
  assert.equal(calls[offset+1].name,'admit_certification_operation_v1');assert.equal(calls[offset+1].input.replay_only,true);
  assert.equal(calls.slice(offset).some(call=>call.name==='execute_certification_operation_v1'),false);
  assert.equal(fixture.q(`select count(*)from production_control.tournament_setup_operation_receipts_v1 where operation_request_id='${operationInput.operationRequestId}'`),'1');
  await assert.rejects(resolveIsolatedDirectorOperation({authorization,input:{...input,payload:{...input.payload,name:'Different request'}},env},
   {certificationDependencies:dependencies}),{code:'DIRECTOR_OPERATIONS_CONTEXT_STALE',status:409,outcome:'UNKNOWN'});
 });
 await t.test('shipping score recovery adapter returns public COMMITTED DTO after admission closes',async()=>{
  const offset=calls.length,actor=scoreRequest.authorization;
  const request={matchId:scoreRequest.payload.match_id,mutationId:scoreRequest.operation_request_id};
  const result=await recoverCanonicalScoreMutation({authUserId:actor.auth_user_id,playerId:actor.player_id,tournamentId:actor.tournament_id},request,
   {env,readStatus:(input,options)=>readCanonicalScoreMutationStatus(input,{...options,certificationDependencies:dependencies})});
  assert.equal(result.status,'COMMITTED');assert.equal(result.retry,'DO_NOT_RESUBMIT');assert.equal(result.canonical.holeNumber,1);
  assert.equal(calls.length-offset,1);assert.equal(calls[offset].name,'read_certification_operation_v1');
  assert.equal(calls[offset].input.expected_context_token,undefined);
  assert.doesNotMatch(JSON.stringify(result),/lease_id|resource_id|request_hash|ADMITTED|NOT_COMMITTED/);
 });
 for(const[action,original]of[['finalize',finalizeRequest],['reopen',reopenRequest]])await t.test(`shipping ${action} retry recovers commit before fresh capability gate`,async()=>{
  const offset=calls.length,input={action,matchId:original.payload.match_id,operationRequestId:original.operation_request_id,
   expectedMatchRevision:original.payload.expected_match_revision,expectedPermissionRevision:original.authorization.permission_revision};
  // Current readback is intentionally unavailable once admission is disabled;
  // the existing error shape must retain the verified committed outcome.
  await assert.rejects(mutateIsolatedCanonicalDirectorMatch({authorization,input,env},{certificationDependencies:dependencies}),
   {code:'DIRECTOR_CANONICAL_READBACK_UNCONFIRMED',committed:true,operationRequestId:input.operationRequestId});
  assert.equal(calls[offset].name,'read_certification_operation_v1');
  assert.equal(calls[offset].input.operation_id,'SCORING.READ_DIRECTOR_OPERATION_STATUS');
  assert.equal(calls.slice(offset).some(call=>call.name==='execute_certification_operation_v1'),false);
 });
 return{environment:'OWNED_LOCAL_POSTGRESQL17',cases:4,proof:'EXISTING_CLIENT_ADAPTERS_TO_SERVICE_ROLE_SQL',
  externalNetworkCalls:0,googleCalls:0,outboundEnvelopeRewritten:false};
}
