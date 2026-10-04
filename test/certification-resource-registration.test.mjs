// UNIT / no network. Injected fixtures stay synthetic. The shipping manifest
// binds the owner-approved, physically registered Certification resource.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {certificationRequested, certificationResourceEnvironment, requireCertificationResourceEnvironment,
  certificationRegistrationEnvelope, certificationSha256, certificationManifestDigest} from '../lib/canonical-resource-registration.js';
import {PRODUCTION_SUPABASE_PROJECT_REF} from '../lib/production-foundation-resource-contract.js';

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
const resolve=({env,registrationManifest})=>certificationResourceEnvironment(env,{registrationManifest});

test('shipping registry binds the approved physical resource and cannot be replaced by client/environment JSON',async()=>{
  const m=JSON.parse(await readFile(new URL('../config/certification-resource-registration.json',import.meta.url),'utf8'));
  assert.equal(m.contract,'canonical-certification-registration-v1');assert.equal(m.enabled,true);
  assert.equal(m.registration.resource_id,'CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51');
  assert.equal(m.registration.project_ref,'trmcwrljjxwhgtikfdgu');assert.equal(m.registration.registration_revision,1);
  assert.equal(certificationManifestDigest(m),'88e852b98dacc9502ef331c68cbe23202ab3b33de07c4b489047801839f982ff');
  const {env,registrationManifest}=fixture();
  const state=certificationResourceEnvironment({...env,BAGGER_CERTIFICATION_ENABLED:'true',BAGGER_CERTIFICATION_REGISTRATION_JSON:JSON.stringify(registrationManifest)});
  assert.equal(state.requested,true);assert.equal(state.eligible,false);assert.equal(state.reason,'certification-resource-mismatch');
  assert.throws(()=>requireCertificationResourceEnvironment(env),{code:'CANONICAL_RESOURCE_UNAVAILABLE',status:503});
});
test('no explicit selector does not request Certification',()=>{
  assert.equal(certificationRequested({}),false);
  const f=fixture(); delete f.env.BAGGER_CERTIFICATION_RESOURCE_ID; assert.equal(resolve(f).requested,false);assert.equal(resolve(f).eligible,false);
});
test('exact injected registration validates configuration and creates only redacted bound envelope',()=>{
  const f=fixture(),state=resolve(f);assert.equal(state.eligible,true);assert.equal(state.resourceClass,'CERTIFICATION');
  const envelope=certificationRegistrationEnvelope(state);
  assert.equal(envelope.resource.resource_id,f.registration.resource_id);assert.equal(envelope.resource.manifest_digest,certificationManifestDigest(f.registrationManifest));
  assert.equal(envelope.deployment.release_commit,f.env.VERCEL_GIT_COMMIT_SHA);
  assert.equal(envelope.deployment.deployment_origin,'https://certification-synthetic.vercel.app');
  for(const secret of [f.env.SUPABASE_SCORING_MIRROR_SECRET_KEY,f.env.NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY])assert.equal(JSON.stringify({state,envelope}).includes(secret),false);
  assert.equal(Object.isFrozen(state),true);
  assert.throws(()=>certificationRegistrationEnvelope({...state}),{code:'CANONICAL_RESOURCE_CONTEXT_REQUIRED'});
  envelope.resource.project_ref='tampered';assert.equal(certificationRegistrationEnvelope(state).resource.project_ref,f.registration.project_ref);
});
test('manifest digest is stable over object key order and changes on provenance revision',()=>{
  const f=fixture();assert.equal(certificationManifestDigest(f.registrationManifest),certificationManifestDigest(Object.fromEntries(Object.entries(f.registrationManifest).reverse())));
  const old=certificationManifestDigest(f.registrationManifest);f.registration.registration_revision++;assert.notEqual(certificationManifestDigest(f.registrationManifest),old);
});
for(const [label,change] of [
  ['wrong resource',f=>f.env.BAGGER_CERTIFICATION_RESOURCE_ID='CERTIFICATION:33333333-3333-4333-8333-333333333333'],
  ['wrong team',f=>f.env.VERCEL_TEAM_ID='team_wrong'],
  ['conflicting team alias',f=>f.env.VERCEL_ORG_ID='team_wrong'],
  ['wrong project',f=>f.env.VERCEL_PROJECT_ID='prj_wrong'],
  ['wrong branch',f=>f.env.VERCEL_GIT_COMMIT_REF='codex/not-approved'],
  ['wrong deployment class',f=>f.env.VERCEL_ENV='production'],
  ['missing SHA',f=>delete f.env.VERCEL_GIT_COMMIT_SHA],
  ['malformed SHA',f=>f.env.VERCEL_GIT_COMMIT_SHA='latest'],
  ['missing deployment ID',f=>delete f.env.VERCEL_DEPLOYMENT_ID],
  ['wrong deployment origin',f=>f.env.VERCEL_URL='baggerinv.com'],
  ['origin suffix spoof',f=>f.env.VERCEL_URL='certification.vercel.app.evil.invalid'],
  ['wrong server project',f=>f.env.SUPABASE_SCORING_MIRROR_URL='https://dddddddddddddddddddd.supabase.co'],
  ['wrong Auth project',f=>f.env.NEXT_PUBLIC_SUPABASE_AUTH_URL='https://dddddddddddddddddddd.supabase.co'],
  ['wrong server credential',f=>f.env.SUPABASE_SCORING_MIRROR_SECRET_KEY='wrong'],
  ['wrong public credential',f=>f.env.NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY='wrong'],
  ['missing server credential',f=>delete f.env.SUPABASE_SCORING_MIRROR_SECRET_KEY],
  ['missing public credential',f=>delete f.env.NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY],
  ['Production overlay',f=>f.env.PRODUCTION_SHADOW_CANDIDATE_ENABLED='true'],
  ['Production key inheritance',f=>f.env.PRODUCTION_SUPABASE_SECRET_KEY='not-used-but-forbidden'],
  ['Google key inheritance',f=>f.env.GOOGLE_SERVICE_ACCOUNT_KEY='not-used-but-forbidden'],
  ['Google mirror overlay',f=>f.env.SUPABASE_GOOGLE_MIRROR_ENABLED='true'],
])test(`exact registration fails closed: ${label}`,()=>{const f=fixture();change(f);const state=resolve(f);assert.equal(state.requested,true);assert.equal(state.eligible,false);assert.equal(state.projectRef,'');});

for(const [label,change] of [
  ['class impersonation',r=>r.resource_class='PRODUCTION'],['invalid installation',r=>r.installation_id='arbitrary'],
  ['different installation identity',r=>r.installation_id='22222222-2222-4222-8222-222222222222'],
  ['Production resource',r=>{r.project_ref=PRODUCTION_SUPABASE_PROJECT_REF;r.project_url=`https://${r.project_ref}.supabase.co`;}],
  ['legacy Preview resource',r=>{r.project_ref='idgigvjjqkfbqjeredpb';r.project_url=`https://${r.project_ref}.supabase.co`;}],
  ['URL userinfo',r=>r.project_url=`https://name:secret@${r.project_ref}.supabase.co`],
  ['URL suffix',r=>r.project_url=`https://${r.project_ref}.supabase.co.evil.invalid`],
  ['URL query',r=>r.project_url+='?target=other'],['URL path',r=>r.project_url+='/other'],['URL fragment',r=>r.project_url+='#other'],
  ['URL port',r=>r.project_url=`https://${r.project_ref}.supabase.co:5432`],
  ['invalid revision',r=>r.registration_revision=0],['schema digest missing',r=>delete r.schema_digest],
  ['unknown privileged registration field',r=>r.allow_production=true],
])test(`malformed owner registration rejected: ${label}`,()=>{const f=fixture();change(f.registration);assert.equal(resolve(f).eligible,false);});
test('disabled optional flags confer no authority and do not interfere with exact registration',()=>{
  const f=fixture();Object.assign(f.env,{PRODUCTION_SHADOW_CANDIDATE_ENABLED:'false',PRODUCTION_CUTOVER_ACTIVATION_ENABLED:'0',GOOGLE_MIRROR_ENABLED:'disabled'});
  assert.equal(resolve(f).eligible,true);
});
test('state is a snapshot; changing injected manifest after validation cannot rewrite bound resource',()=>{
  const f=fixture(),state=resolve(f);f.registration.project_ref='dddddddddddddddddddd';
  assert.equal(certificationRegistrationEnvelope(state).resource.project_ref,'cccccccccccccccccccc');
});
