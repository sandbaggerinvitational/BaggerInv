import test from 'node:test';
import assert from 'node:assert/strict';
import {certificationSha256} from '../lib/canonical-resource-registration.js';
import {directorDerivedDeliveryPolicy} from '../lib/director-derived-delivery-policy.js';
function fixture() {
  const server = 'synthetic-unit-secret-not-a-provider-key', publicKey = 'synthetic-unit-publishable-not-a-provider-key';
  const registration = {resource_id:'CERTIFICATION:11111111-1111-4111-8111-111111111111',resource_class:'CERTIFICATION',
    installation_id:'11111111-1111-4111-8111-111111111111',project_ref:'cccccccccccccccccccc',project_url:'https://cccccccccccccccccccc.supabase.co',
    vercel_team_id:'team_synthetic',vercel_project_id:'prj_synthetic',git_branch:'codex/certification-synthetic',deployment_class:'preview',
    registration_revision:1,schema_contract:'canonical-resource-v1',schema_digest:'1'.repeat(64),public_key_sha256:certificationSha256(publicKey),server_key_sha256:certificationSha256(server)};
  const registrationManifest = {contract:'canonical-certification-registration-v1',enabled:true,registration};
  const env={BAGGER_CERTIFICATION_RESOURCE_ID:registration.resource_id,VERCEL_ENV:'preview',VERCEL_TEAM_ID:registration.vercel_team_id,
    VERCEL_PROJECT_ID:registration.vercel_project_id,VERCEL_GIT_COMMIT_REF:registration.git_branch,VERCEL_GIT_COMMIT_SHA:'a'.repeat(40),
    VERCEL_DEPLOYMENT_ID:'dpl_synthetic0001',VERCEL_URL:'certification-synthetic.vercel.app',SUPABASE_SCORING_MIRROR_URL:registration.project_url,
    SUPABASE_SCORING_MIRROR_SECRET_KEY:server,NEXT_PUBLIC_SUPABASE_AUTH_URL:registration.project_url,NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY:publicKey};
  return {env,registration,registrationManifest};
}

test('Production retains post-commit callback policy',()=>assert.equal(directorDerivedDeliveryPolicy({}),'POST_COMMIT_CALLBACK'));
test('Original Certification retains its registered callback policy',()=>{const f=fixture();assert.equal(directorDerivedDeliveryPolicy(f.env,{registrationManifest:f.registrationManifest}),'POST_COMMIT_CALLBACK');});
test('Only validated Model D registration selects private Queue delivery',()=>{const f=fixture();f.registrationManifest.purpose='PART2C_DRESS_REHEARSAL';assert.equal(directorDerivedDeliveryPolicy(f.env,{registrationManifest:f.registrationManifest}),'PRIVATE_QUEUE_ONLY');});
for(const field of ['BAGGER_CERTIFICATION_RESOURCE_ID','VERCEL_PROJECT_ID','VERCEL_GIT_COMMIT_REF','VERCEL_ENV','VERCEL_DEPLOYMENT_ID','SUPABASE_SCORING_MIRROR_SECRET_KEY'])test('Invalid registered context denied: '+field,()=>{const f=fixture();f.registrationManifest.purpose='PART2C_DRESS_REHEARSAL';f.env[field]='unregistered';assert.throws(()=>directorDerivedDeliveryPolicy(f.env,{registrationManifest:f.registrationManifest}),{code:'CANONICAL_RESOURCE_UNAVAILABLE'});});
test('Client-like environment profile cannot mint Model D registration',()=>{const f=fixture();f.env.PART2C_DRESS_REHEARSAL='true';assert.equal(directorDerivedDeliveryPolicy(f.env,{registrationManifest:f.registrationManifest}),'POST_COMMIT_CALLBACK');assert.throws(()=>directorDerivedDeliveryPolicy(f.env),{code:'CANONICAL_RESOURCE_UNAVAILABLE'});});
