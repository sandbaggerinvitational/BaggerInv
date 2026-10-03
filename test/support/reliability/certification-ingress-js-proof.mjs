// Real shipping JavaScript -> local service-role PostgreSQL RPC proof.
// HTTP alone is substituted. No outbound resource/actor/envelope rewriting,
// no domain stubs, no hosted sockets and no actual provider credentials.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {certificationManifestDigest,certificationSha256} from '../../../lib/canonical-resource-registration.js';
import {certificationOperationRpc,readCertificationIngressStatus,resolveCertificationIngress,replayCertificationIngress} from '../../../lib/certification-runtime-server.js';
import {jsonLiteral,sqlResult} from './postgres17.mjs';

export function certificationTransportRegistration({resource,deployment,index}){
 const serverKey='synthetic-local-rpc-credential-not-a-provider-key';
 const publicKey='synthetic-local-public-credential-not-a-provider-key';
 const identity={vercel_team_id:'team_syntheticcertification',vercel_project_id:'prj_syntheticcertification'};
 const registration={resource_id:resource.resource_id,resource_class:'CERTIFICATION',installation_id:resource.installation_id,
  project_ref:resource.project_ref,project_url:resource.project_url,...identity,
  git_branch:deployment.git_branch,deployment_class:'preview',registration_revision:resource.registration_revision,
  schema_contract:resource.schema_contract,schema_digest:resource.schema_digest,
  public_key_sha256:certificationSha256(publicKey),server_key_sha256:certificationSha256(serverKey)};
 const registrationManifest={contract:'canonical-certification-registration-v1',enabled:true,registration};
 const configuredDeployment={...deployment,...identity,deployment_origin:`https://synthetic-certification-${index}.vercel.app`};
 const configuredResource={...resource,...identity,manifest_digest:certificationManifestDigest(registrationManifest)};
 const env={BAGGER_CERTIFICATION_RESOURCE_ID:resource.resource_id,VERCEL_ENV:'preview',VERCEL_TEAM_ID:identity.vercel_team_id,
  VERCEL_PROJECT_ID:identity.vercel_project_id,VERCEL_GIT_COMMIT_REF:deployment.git_branch,
  VERCEL_GIT_COMMIT_SHA:deployment.release_commit,VERCEL_DEPLOYMENT_ID:deployment.deployment_id,
  VERCEL_URL:new URL(configuredDeployment.deployment_origin).host,SUPABASE_SCORING_MIRROR_URL:resource.project_url,
  SUPABASE_SCORING_MIRROR_SECRET_KEY:serverKey,NEXT_PUBLIC_SUPABASE_AUTH_URL:resource.project_url,
  NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY:publicKey};
 return{resource:configuredResource,deployment:configuredDeployment,transportFixture:{env,registrationManifest}};
}

export async function runTransportProof({t,fixture,setup}){
 const {env,registrationManifest}=fixture.transportFixture;
 const calls=[];
 let loseAcknowledgement=null;
 const names=new Set(['read_certification_runtime_context_v1','admit_certification_operation_v1',
  'execute_certification_operation_v1','read_certification_ingress_status_v1',
  'mark_certification_ingress_unknown_v1','resolve_certification_ingress_v1']);
 const fetchImpl=async(url,init)=>{
  const target=new URL(url),name=target.pathname.split('/').at(-1);
  assert.equal(target.origin,fixture.resource.project_url);assert.ok(names.has(name));
  assert.equal(target.pathname,'/rest/v1/rpc/'+name);assert.equal(init.redirect,'error');
  assert.equal(init.headers.apikey,env.SUPABASE_SCORING_MIRROR_SECRET_KEY);
  const input=JSON.parse(init.body).input;
  calls.push({name,input});
  const result=sqlResult(fixture.cluster,fixture.database,
   `\\set VERBOSITY verbose\nset role service_role;select public.${name}(${jsonLiteral(input)});`,{role:'service_role'});
  if(result.status!==0){
   const error=/ERROR:\s+([0-9A-Z]{5}):\s*([^\n]+)/.exec(result.stderr);
   assert.ok(error,`Local SQL must return a typed error: ${result.stderr}`);
   return Response.json({code:error[1],message:error[2]},{status:400});
  }
  const value=JSON.parse(result.stdout.trim());
  if(loseAcknowledgement===name){loseAcknowledgement=null;throw new Error('SYNTHETIC_ACKNOWLEDGEMENT_LOSS');}
  return Response.json(value);
 };
 const dependencies={registrationManifest,fetchImpl};
 const invoke=(input,overrides={})=>certificationOperationRpc(input.operation_id,input.payload,
  {env,authorization:input.authorization,operationRequestId:input.operation_request_id,...overrides},dependencies);
 const status=input=>readCertificationIngressStatus(input.operation_id,{},
  {env,authorization:input.authorization,operationRequestId:input.operation_request_id},dependencies);
 const resolve=input=>resolveCertificationIngress(input.operation_id,{},
  {env,authorization:input.authorization,operationRequestId:input.operation_request_id},dependencies);
 const count=()=>Number(fixture.q('select count(*)from production_control.certification_ingress_leases_v1'));
 const receiptCount=input=>Number(fixture.q(`select count(*)from production_control.tournament_setup_operation_receipts_v1 where operation_request_id='${input.operation_request_id}'`));

 await t.test('JS transport uses the exact initially registered resource and real canonical update',async()=>{
  const input=setup('Transport-owned canonical update'),offset=calls.length;
  const result=await invoke(input);assert.equal(result.payload.ok,true);
  assert.deepEqual(calls.slice(offset).map(call=>call.name),['read_certification_runtime_context_v1','admit_certification_operation_v1','execute_certification_operation_v1']);
  const sent=calls.at(-1).input;
  for(const [key,value]of Object.entries(sent.resource))assert.equal(value,fixture.resource[key],key);
  assert.deepEqual(sent.deployment,fixture.deployment);
  assert.deepEqual(sent.authorization,input.authorization);
  assert.equal(sent.payload.tournament_name,input.payload.tournament_name);
  assert.equal(fixture.q("select name from scoring_authority.tournaments where tournament_id='2026'"),input.payload.tournament_name);
  assert.equal(receiptCount(input),1);
  assert.equal((await status(input)).payload.state,'COMMITTED');
  assert.equal(fixture.q(`select count(*)from production_control.operation_audit_events where event_type='CERTIFICATION_INGRESS_TERMINAL'and details->>'operation_request_id'='${input.operation_request_id}'`),'1');
 });
 await t.test('JS lost admission acknowledgement never executes; exact recovery and fencing persist',async()=>{
  const input=setup('Admission acknowledgement loss'),offset=calls.length;
  loseAcknowledgement='admit_certification_operation_v1';
  await assert.rejects(invoke(input),error=>error.code==='CERTIFICATION_TRANSPORT_UNAVAILABLE'&&error.operationRequestId===input.operation_request_id&&error.outcome==='UNKNOWN');
  assert.equal(calls.slice(offset).filter(call=>call.name==='execute_certification_operation_v1').length,0);
  assert.equal((await status(input)).payload.state,'ADMITTED');assert.equal(receiptCount(input),0);
  assert.equal((await resolve(input)).payload.state,'NOT_COMMITTED');
  assert.equal((await status(input)).payload.state,'NOT_COMMITTED');
  assert.equal(receiptCount(input),0);
 });
 await t.test('JS lost execution acknowledgement resolves the committed canonical result without resubmission',async()=>{
  const input=setup('Execution acknowledgement loss'),offset=calls.length;
  loseAcknowledgement='execute_certification_operation_v1';
  const result=await invoke(input);assert.equal(result.payload.ok,true);
  assert.equal(calls.slice(offset).filter(call=>call.name==='execute_certification_operation_v1').length,1);
  assert.equal(calls.at(-1).name,'mark_certification_ingress_unknown_v1');
  const recovered=await status(input);assert.equal(recovered.payload.state,'COMMITTED');assert.deepEqual(recovered.payload.result,result.payload);
  assert.equal(receiptCount(input),1);
  const retry=await replayCertificationIngress(input.operation_id,input.payload,
   {env,authorization:input.authorization,operationRequestId:input.operation_request_id},dependencies);
  assert.deepEqual(retry.payload.result,result.payload);assert.equal(calls.at(-1).input.replay_only,true);
  await assert.rejects(invoke({...input,payload:{...input.payload,tournament_name:'Conflicting same operation'}}),
   {code:'CERTIFICATION_INGRESS_IDEMPOTENCY_CONFLICT',status:409});
  assert.equal(receiptCount(input),1);
 });
 await t.test('JS and PostgreSQL reject wrong registered resource and actor without an admitted write',async()=>{
  const input=setup('Rejected authority'),before=count(),offset=calls.length;
  await assert.rejects(invoke(input,{env:{...env,BAGGER_CERTIFICATION_RESOURCE_ID:'CERTIFICATION:'+randomUUID()}}),{code:'CANONICAL_RESOURCE_UNAVAILABLE'});
  assert.equal(calls.length,offset);
  const foreignInstallation=randomUUID(),foreignResource='CERTIFICATION:'+foreignInstallation;
  const foreignManifest={...registrationManifest,registration:{...registrationManifest.registration,
   resource_id:foreignResource,installation_id:foreignInstallation}};
  await assert.rejects(certificationOperationRpc(input.operation_id,input.payload,
   {env:{...env,BAGGER_CERTIFICATION_RESOURCE_ID:foreignResource},authorization:input.authorization,operationRequestId:input.operation_request_id},
   {...dependencies,registrationManifest:foreignManifest}),{code:'CANONICAL_RESOURCE_BINDING_DENIED',status:403});
  assert.equal(calls.at(-1).name,'read_certification_runtime_context_v1');
  await assert.rejects(invoke(input,{authorization:{...input.authorization,auth_user_id:randomUUID()}}),error=>error.status===403);
  assert.equal(count(),before);assert.equal(receiptCount(input),0);
  assert.equal(fixture.q('select count(*)from production_control.resource_scope'),'0');
  assert.equal(fixture.q('select count(*)from production_control.cutover_activation_state'),'0');
 });
 return{environment:'OWNED_LOCAL_POSTGRESQL17',proof:'REAL_JAVASCRIPT_TO_SERVICE_ROLE_SQL',cases:4,
  outboundEnvelopeRewritten:false,externalNetworkCalls:0,googleCalls:0};
}
