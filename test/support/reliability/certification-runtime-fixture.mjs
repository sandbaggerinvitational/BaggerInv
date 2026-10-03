// Deterministic synthetic dependency fixture only. Not loaded by shipping code.
import {certificationSha256} from '../../../lib/canonical-resource-registration.js';
export function certificationRuntimeFixture() {
  const secret='synthetic-not-a-provider-secret', publicKey='synthetic-not-a-provider-public-key';
  const registration={resource_id:'CERTIFICATION:11111111-1111-4111-8111-111111111111',resource_class:'CERTIFICATION',
    installation_id:'11111111-1111-4111-8111-111111111111',project_ref:'cccccccccccccccccccc',project_url:'https://cccccccccccccccccccc.supabase.co',
    vercel_team_id:'team_synthetic',vercel_project_id:'prj_synthetic',git_branch:'codex/certification-unit',deployment_class:'preview',
    registration_revision:1,schema_contract:'canonical-resource-v1',schema_digest:'1'.repeat(64),public_key_sha256:certificationSha256(publicKey),server_key_sha256:certificationSha256(secret)};
  const env={BAGGER_CERTIFICATION_RESOURCE_ID:registration.resource_id,VERCEL_ENV:'preview',VERCEL_TEAM_ID:registration.vercel_team_id,
    VERCEL_PROJECT_ID:registration.vercel_project_id,VERCEL_GIT_COMMIT_REF:registration.git_branch,VERCEL_GIT_COMMIT_SHA:'a'.repeat(40),
    VERCEL_DEPLOYMENT_ID:'dpl_synthetic0001',VERCEL_URL:'certification-unit.vercel.app',SUPABASE_SCORING_MIRROR_URL:registration.project_url,
    SUPABASE_SCORING_MIRROR_SECRET_KEY:secret,NEXT_PUBLIC_SUPABASE_AUTH_URL:registration.project_url,NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY:publicKey};
  const requests=[];
  const contextFor=input=>({...input.resource,...input.deployment,binding_id:'33333333-3333-4333-8333-333333333333',context_token:'b'.repeat(64),
    current_tournament_id:'2026',tournament_id:'2026',current_tournament_year:2026,pointer_revision:1,governance_tournament_id:'2026',
    authority_epoch_id:'44444444-4444-4444-8444-444444444444',activation_revision:1,admission_revision:1});
  const admissionFor=(input,state='ADMITTED',result)=>({ok:true,contract:'certification-ingress-v1',
    lease_id:'77777777-7777-4777-8777-777777777777',admission_generation_id:'88888888-8888-4888-8888-888888888888',
    admission_sequence:1,operation_request_id:input.operation_request_id,state,request_hash:'c'.repeat(64),...(result?{result}:{})});
  const dependencies={registrationManifest:{contract:'canonical-certification-registration-v1',enabled:true,registration},
    fetchImpl:async(url,init)=>{const input=JSON.parse(init.body).input;requests.push({url,init,input});
      if(url.endsWith('/read_certification_runtime_context_v1'))return Response.json({contract:'certification-runtime-v1',context:contextFor(input)});
      if(url.endsWith('/admit_certification_operation_v1'))return Response.json(admissionFor(input));
      if(url.endsWith('/mark_certification_ingress_unknown_v1')||url.endsWith('/read_certification_ingress_status_v1'))return Response.json(admissionFor(input,'UNKNOWN'));
      if(url.endsWith('/resolve_certification_ingress_v1'))return Response.json(admissionFor(input,'NOT_COMMITTED',{ok:false,code:'CERTIFICATION_INGRESS_NOT_COMMITTED'}));
      return Response.json({ok:true,code:'ACCEPTED'});}};
  const authorization={status:'active',source:'entitlement',identity:{authUserId:'55555555-5555-4555-8555-555555555555',actor:{id:'SYNTHETIC-P01',role:'DIRECTOR'},tournamentId:'2026'}};
  return {env,dependencies,requests,contextFor,admissionFor,authorization};
}
