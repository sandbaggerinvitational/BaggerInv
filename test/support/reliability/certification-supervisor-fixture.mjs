// Owned socket-only counterpart of the preserved four-player fixture. Provider
// credentials are replaced by an explicitly synthetic registration dependency.
import {randomUUID} from 'node:crypto';
import registration from '../../../config/certification-resource-registration.json' with {type:'json'};
import {certificationManifestDigest,certificationSha256} from '../../../lib/canonical-resource-registration.js';
import {fixtureContract,fixtureIdentities,renderCertificationFixture} from '../../../tools/reliability/certification-part2a-fixture.mjs';
import {createIsolatedCluster,destroyIsolatedCluster,createDatabase,sql,sqlResult,jsonLiteral,sqlFile,repositoryRoot} from './postgres17.mjs';
import {installLocalCanonicalPlatform} from './phase2d-resource-bootstrap.mjs';
import {readCanonicalArtifacts,installCanonicalBaseline} from '../../../tools/reliability/canonical-bootstrap-artifacts.mjs';
import {buildTournamentSetupMutation} from '../../../lib/production-tournament-setup-contract.js';

export async function createSupervisorFixture() {
 const cluster=await createIsolatedCluster(),database='supervisor_certification';
 try{createDatabase(cluster,database);
 installLocalCanonicalPlatform(cluster,database);
 const q=text=>sql(cluster,database,text,{role:''});
 q(`alter table auth.users add column role text default 'authenticated';
 insert into auth.users(id,email,email_confirmed_at,role)select(value->>'auth_user_id')::uuid,value->>'email',clock_timestamp(),'authenticated'
 from jsonb_array_elements(${jsonLiteral(fixtureIdentities)});`);
 const bundle=await readCanonicalArtifacts();await installCanonicalBaseline(cluster,database,bundle);
 const secret='synthetic-supervisor-server-key',publicKey='synthetic-supervisor-public-key';
 const registered={...registration.registration,server_key_sha256:certificationSha256(secret),public_key_sha256:certificationSha256(publicKey)};
 const registrationManifest={...registration,registration:registered};
 const resource={...registration.registration,manifest_digest:certificationManifestDigest(registrationManifest)};
 const deployment={vercel_team_id:resource.vercel_team_id,vercel_project_id:resource.vercel_project_id,git_branch:resource.git_branch,
  deployment_class:'preview',release_commit:'c'.repeat(40),deployment_id:'dpl_LocalSupervisorCertification',deployment_origin:'https://local-supervisor-certification.vercel.app'};
 const owner=(name,input)=>JSON.parse(q(`select production_control.${name}(${jsonLiteral(input)})`));
 owner('register_certification_resource_v1',resource);
 owner('initialize_certification_resource_v1',{...deployment,resource_id:resource.resource_id,initial_tournament_id:'2026',
  governance_tournament_id:'2026',binding_id:randomUUID(),authority_epoch_id:randomUUID(),capabilities:['READS','SCORING','DIRECTOR','WORKERS','ANNUAL']});
 const a=JSON.parse(q('select to_jsonb(a)from production_control.certification_admission_v1 a'));
 const gen=JSON.parse(q('select to_jsonb(g)from production_control.certification_ingress_generations_v1 g'));
 const rendered=await renderCertificationFixture({contract:fixtureContract,operation_id:'certification-part2a-initial-fixture',resource:registration.registration,
  deployment,expected:{binding_id:a.binding_id,authority_epoch_id:a.authority_epoch_id,activation_revision:a.activation_revision,
  admission_revision:a.admission_revision,pointer_revision:1,generation_id:gen.generation_id,generation_revision:gen.revision}});
 // Provision this owned counterpart with its synthetic credential registration
 // from the beginning. No installed authority guard is disabled or modified.
 q(rendered.replaceAll(certificationManifestDigest(registration),resource.manifest_digest));
 for(const file of ['calcutta-empty-auction-demand-v1.sql','certification-stale-context-error-v1.sql'])
  sqlFile(cluster,database,repositoryRoot+'/supabase/production_incremental/'+file,{role:''});
 // Owned local platform models Vault and pg_net queues, never outbound egress.
 q(`create schema vault;create table vault.decrypted_secrets(id uuid primary key,decrypted_secret text not null);
 create schema net;create table net.local_requests(id bigint generated always as identity,url text,body jsonb,headers jsonb,timeout integer);
 create function net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds integer)returns bigint language plpgsql as $$declare n bigint;begin
 insert into net.local_requests(url,body,headers,timeout)values($1,$2,$3,$4)returning id into n;return n;end;$$;
 revoke all on schema vault,net from public,anon,authenticated,service_role;
 revoke all on all tables in schema vault,net from public,anon,authenticated,service_role;
 revoke all on function net.http_post(text,jsonb,jsonb,integer)from public,anon,authenticated,service_role;`);
 const signingKey='e'.repeat(64),keyId=randomUUID();q(`insert into vault.decrypted_secrets values('${keyId}','${signingKey}')`);
 const env={BAGGER_CERTIFICATION_RESOURCE_ID:resource.resource_id,VERCEL_ENV:'preview',VERCEL_TEAM_ID:deployment.vercel_team_id,
  VERCEL_PROJECT_ID:deployment.vercel_project_id,VERCEL_GIT_COMMIT_REF:deployment.git_branch,VERCEL_GIT_COMMIT_SHA:deployment.release_commit,
  VERCEL_DEPLOYMENT_ID:deployment.deployment_id,VERCEL_URL:new URL(deployment.deployment_origin).hostname,
  SUPABASE_SCORING_MIRROR_URL:resource.project_url,SUPABASE_SCORING_MIRROR_SECRET_KEY:secret,
  NEXT_PUBLIC_SUPABASE_AUTH_URL:resource.project_url,NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY:publicKey,CERTIFICATION_WORKER_SIGNING_KEY:signingKey};
 const calls=[];
 const fetchImpl=async(url,init)=>{
  const target=new URL(url),name=target.pathname.split('/').at(-1);if(target.origin!==resource.project_url)throw new Error('UNEXPECTED_EGRESS');
  if(!['execute_certification_supervisor_v1','execute_certification_queue_supervisor_v2','read_certification_runtime_context_v1','execute_certification_operation_v1',
   'read_certification_projection_v1','read_certification_operation_v1','admit_certification_operation_v1'].includes(name))throw new Error('UNEXPECTED_RPC');
  const input=JSON.parse(init.body).input;calls.push({name,operation:input.operation_id||input.operation});
  const result=sqlResult(cluster,database,`\\set VERBOSITY verbose\nset role service_role;select public.${name}(${jsonLiteral(input)})`,{role:'service_role'});
  if(result.status!==0){const match=/ERROR:\s+([A-Z0-9]{5}):\s*([^\n]+)/.exec(result.stderr);if(!match)throw new Error(result.stderr);
   return Response.json({code:match[1],message:match[2]},{status:400});}
  return Response.json(JSON.parse(result.stdout.trim()));
 };
 const dependencies={registrationManifest,fetchImpl},bound={resource,deployment};
 const toggle=enabled=>owner('set_certification_admission_v1',{resource_id:resource.resource_id,
  expected_admission_revision:Number(q('select admission_revision from production_control.certification_admission_v1')),enabled,reason:'OWNED LOCAL supervisor proof'});
 const authorization={tournament_id:'2026',role:'DIRECTOR',player_id:'P01',auth_user_id:fixtureIdentities[0].auth_user_id};
 return {cluster,database,q,owner,env,dependencies,resource,deployment,bound,toggle,keyId,calls,authorization,
  mutation:async(action,values)=>{
   const {certificationOperationRpc}=await import('../../../lib/certification-runtime-server.js');
   const rev=Number(q("select revision from production_control.tournament_setup_context_v1 where tournament_id='2026'"));
   const payload=buildTournamentSetupMutation(action,{...values,expectedRevision:rev,operationRequestId:randomUUID()});
   const id=payload.operation_request_id;delete payload.operation_request_id;
   return certificationOperationRpc('DIRECTOR.MUTATE_SETUP',{...payload,action},{env,authorization,operationRequestId:id},dependencies);
  }};
 }catch(error){await destroyIsolatedCluster(cluster);throw error;}
}
