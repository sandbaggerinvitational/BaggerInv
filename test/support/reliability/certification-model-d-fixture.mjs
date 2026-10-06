import {randomUUID}from'node:crypto';
import old from '../../../config/certification-resource-registration.json'with{type:'json'};
import {createIsolatedCluster,createDatabase,destroyIsolatedCluster,sql,sqlResult,jsonLiteral}from'./postgres17.mjs';
import {installLocalCanonicalPlatform}from'./phase2d-resource-bootstrap.mjs';
import {enableOwnedSafeupdate}from'./pg-safeupdate.mjs';
import {readModelDImage,installModelDImage}from'../../../tools/reliability/model-d-bootstrap.mjs';
import {renderModelDBinding,renderModelDRegistration}from'../../../tools/reliability/certification-model-d-binding.mjs';
import {renderModelDFixture,modelDIdentities,modelDFixtureContract}from'../../../tools/reliability/certification-model-d-fixture.mjs';
import {certificationSha256,certificationManifestDigest}from'../../../lib/canonical-resource-registration.js';
import {supervisorEnvelope}from'../../../lib/certification-worker-supervision.js';
import {MODEL_D_WORKER_ENGINES}from'../../../lib/certification-worker-engines.js';
import {QUEUE_CONTRACT,QUEUE_TOPIC,consumeCertificationQueueMessage,queueControl}from'../../../lib/certification-queue-supervision.js';
import {QUEUE_TIMING}from'../../../lib/certification-queue-timing.js';
import {buildTournamentSetupMutation}from'../../../lib/production-tournament-setup-contract.js';
import {certificationOperationRpc}from'../../../lib/certification-runtime-server.js';
export async function createModelDFixture({provision=true,trustAcceptanceBeforeFixture=false}={}){
 const cluster=await createIsolatedCluster(),database='model_d_certification';
 try{
 createDatabase(cluster,database);installLocalCanonicalPlatform(cluster,database);await installModelDImage(cluster,database);
 const q=text=>sql(cluster,database,text,{role:''});
 const image=await readModelDImage(),secret='synthetic-model-d-server',publicKey='synthetic-model-d-public';
 const r={...old.registration,resource_id:'CERTIFICATION:d1000000-0000-4000-8000-000000000001',installation_id:'d1000000-0000-4000-8000-000000000001',project_ref:'abcdefghijklmnopqrst',project_url:'https://abcdefghijklmnopqrst.supabase.co',
 vercel_project_id:'prj_LocalModelDCertification',git_branch:'codex/certification-model-d',schema_digest:image.manifest.artifacts.schema,server_key_sha256:certificationSha256(secret),public_key_sha256:certificationSha256(publicKey)};
 const registrationManifest={contract:old.contract,enabled:true,purpose:'PART2C_DRESS_REHEARSAL',registration:r};
 const deployment={vercel_team_id:r.vercel_team_id,vercel_project_id:r.vercel_project_id,git_branch:r.git_branch,deployment_class:'preview',release_commit:'d'.repeat(40),deployment_id:'dpl_LocalModelDCertification',deployment_origin:'https://local-model-d-certification.vercel.app'};
 const binding={purpose:'PART2C_DRESS_REHEARSAL',resource:r,deployment,binding_id:'d1000000-0000-4000-8000-000000000002',authority_epoch_id:'d1000000-0000-4000-8000-000000000003'};
 const registrationSql=await renderModelDRegistration({purpose:binding.purpose,resource:r},{registrationManifest});q(registrationSql);
 const registrationStage=JSON.parse(q("select jsonb_build_object('registrations',(select count(*)from production_control.canonical_resource_v1),'epochs',(select count(*)from scoring_authority.authority_epochs),'pointers',(select count(*)from production_control.current_tournament_pointer_v1),'admissionEnabled',(select count(*)from production_control.certification_admission_v1 where enabled))"));
 const bindingSql=await renderModelDBinding(binding,{registrationManifest});q(bindingSql);
 q(`alter table auth.users add column role text default 'authenticated';insert into auth.users(id,email,email_confirmed_at,role)select(value->>'auth_user_id')::uuid,value->>'email',clock_timestamp(),'authenticated'from jsonb_array_elements(${jsonLiteral(modelDIdentities)})`);
 const gen=JSON.parse(q('select to_jsonb(g)from production_control.certification_ingress_generations_v1 g'));
 const fixtureRequest={contract:modelDFixtureContract,operation_id:'certification-model-d-initial-fixture',resource:r,deployment,expected:{binding_id:binding.binding_id,authority_epoch_id:binding.authority_epoch_id,activation_revision:1,admission_revision:1,pointer_revision:1,generation_id:gen.generation_id,generation_revision:gen.revision}};
 let fixtureSql=await renderModelDFixture(fixtureRequest,{registrationManifest});
 const env={BAGGER_CERTIFICATION_RESOURCE_ID:r.resource_id,VERCEL_ENV:'preview',VERCEL:'1',VERCEL_TEAM_ID:r.vercel_team_id,VERCEL_PROJECT_ID:r.vercel_project_id,VERCEL_GIT_COMMIT_REF:r.git_branch,VERCEL_GIT_COMMIT_SHA:deployment.release_commit,VERCEL_DEPLOYMENT_ID:deployment.deployment_id,VERCEL_URL:new URL(deployment.deployment_origin).hostname,SUPABASE_SCORING_MIRROR_URL:r.project_url,SUPABASE_SCORING_MIRROR_SECRET_KEY:secret,NEXT_PUBLIC_SUPABASE_AUTH_URL:r.project_url,NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY:publicKey,BAGGER_CERTIFICATION_QUEUE_TRANSPORT:QUEUE_CONTRACT};
 const calls=[],allowed=new Set(['execute_certification_supervisor_v1','execute_certification_queue_supervisor_v2','read_certification_runtime_context_v1','execute_certification_operation_v1','read_certification_projection_v1','read_certification_operation_v1','admit_certification_operation_v1','read_certification_ingress_status_v1','read_participant_identity_context_for_auth','dispatch_certification_odds_v1','read_certification_odds_operation_v1']);
 const fetchImpl=async(url,init)=>{const u=new URL(url),name=u.pathname.split('/').at(-1);if(u.origin!==r.project_url||!allowed.has(name))throw Error('UNEXPECTED_EGRESS');
 const input=JSON.parse(init.body).input;calls.push({name,operation:input.operation_id||input.operation});
 const result=sqlResult(cluster,database,`\\set VERBOSITY verbose\nset role service_role;select public.${name}(${jsonLiteral(input)})`,{role:'service_role'});
 if(result.status!==0){const e=/ERROR:\s+([A-Z0-9]{5}):\s*([^\n]+)/.exec(result.stderr);if(!e)throw Error(result.stderr);calls.at(-1).error=e[2];return Response.json({code:e[1],message:e[2]},{status:400});}return Response.json(JSON.parse(result.stdout.trim()));};
 const dependencies={registrationManifest,fetchImpl},bound=supervisorEnvelope(env,dependencies),resource=bound.resource;
 const owner=(name,input)=>JSON.parse(q(`select production_control.${name}(${jsonLiteral(input)})`));
 const authorization={tournament_id:'2026',role:'DIRECTOR',player_id:'P01',auth_user_id:modelDIdentities[0].auth_user_id};
 const f={cluster,database,q,owner,env,dependencies,resource,deployment,bound,authorization,registrationManifest,binding,registrationSql,registrationStage,bindingSql,fixtureRequest,fixtureSql,calls,envelope:{...bound,authorization},transportFixture:{env,registrationManifest}};
 f.toggle=enabled=>owner('set_certification_admission_v1',{resource_id:resource.resource_id,expected_admission_revision:Number(q('select admission_revision from production_control.certification_admission_v1')),enabled,reason:'Owned local Model D proof'});
 f.ownerQueue=(name,input={})=>owner({status:'worker_supervisor_status_v1',control:'worker_supervisor_control_v1',publication:'worker_supervisor_queue_publication_v2',reconcile:'worker_supervisor_reconcile_v1'}[name],{...bound,...input});
 f.status=()=>f.ownerQueue('status');
 f.queueContext=()=>{const b=JSON.parse(q(`select production_control.worker_supervisor_queue_binding_v2(${jsonLiteral(bound)})`));delete b.resource;delete b.deployment;return b;};
 f.start=(changes={})=>f.ownerQueue('control',{action:'START',request_id:randomUUID(),expected_revision:f.status().revision,expected_context:f.queueContext(),duration_seconds:60,budget:1,cadence_seconds:60,slots:1,engines:[...MODEL_D_WORKER_ENGINES],...changes});
 f.stop=()=>f.ownerQueue('control',{action:'STOP',request_id:randomUUID(),expected_revision:f.status().revision});f.batch=()=>f.ownerQueue('publication',{action:'BATCH'});
 f.register=e=>{const id='msg_local_'+e.message.invocation_id;f.ownerQueue('publication',{action:'TRY',invocation_id:e.message.invocation_id});f.ownerQueue('publication',{action:'ACK',invocation_id:e.message.invocation_id,message_id:id});return id;};
 f.consume=e=>consumeCertificationQueueMessage(e.message,{topicName:QUEUE_TOPIC,messageId:'msg_local_'+e.message.invocation_id,deliveryCount:1,createdAt:new Date(Date.parse(e.scheduled_at)-10000),expiresAt:new Date(Date.parse(e.scheduled_at)+QUEUE_TIMING.retentionHorizonSeconds*1000)},{env,dependencies});
 f.control=()=>queueControl({env,dependencies});
 f.context=(phase='DIRECTOR',{authorization:auth=authorization}={})=>JSON.parse(sql(cluster,database,`set role service_role;select public.read_certification_runtime_context_v1(${jsonLiteral({contract_version:'certification-runtime-v1',...bound,authorization:auth,phase})})`,{role:'service_role'})).context;
 f.rpc=(name,input)=>JSON.parse(sql(cluster,database,`set role service_role;select public.${name}(${jsonLiteral(input)})`,{role:'service_role'}));
 f.mutation=async(action,values)=>{const rev=Number(q("select revision from production_control.tournament_setup_context_v1 where tournament_id='2026'"));const payload=buildTournamentSetupMutation(action,{...values,expectedRevision:rev,operationRequestId:randomUUID()});const id=payload.operation_request_id;delete payload.operation_request_id;return certificationOperationRpc('DIRECTOR.MUTATE_SETUP',{...payload,action},{env,authorization,operationRequestId:id},dependencies).catch(error=>{error.message+=' ['+(calls.findLast(c=>c.error)?.error||'no canonical error')+']';throw error;});};
 await enableOwnedSafeupdate(f);
 if(trustAcceptanceBeforeFixture){f.toggle(true);f.start();const entry=f.batch().messages[0];f.register(entry);await new Promise(r=>setTimeout(r,Math.max(0,Date.parse(entry.scheduled_at)-Date.now()+100)));f.trustAcceptance=await f.consume(entry);f.stop();f.toggle(false);fixtureRequest.expected.admission_revision=Number(q('select admission_revision from production_control.certification_admission_v1'));fixtureSql=await renderModelDFixture(fixtureRequest,{registrationManifest});f.fixtureSql=fixtureSql;}
 if(provision)q(fixtureSql);return f;
 }catch(error){await destroyIsolatedCluster(cluster);throw error;}
}
