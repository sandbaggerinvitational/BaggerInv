// Owner provisioning package renderer only. No database/network execution API.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import registration from '../../config/certification-resource-registration.json' with {type:'json'};
import {certificationManifestDigest} from '../../lib/canonical-resource-registration.js';
import {certificationPart2aGuide} from './certification-part2a-guide.mjs';

export const fixtureContract='bootstrap-certification-part2a-fixture-v1';
export const contactRepairContract='repair-certification-part2a-identity-contacts-v1';
export const legacyFixturePackageSha256='fd4dcf5aef0bc06e3977340d894d751834ae82a785c63681e73e09ec093296e2';
export const fixtureIdentities=Object.freeze([
 {auth_user_id:'3003e93a-f0ec-422b-835e-5081fefb2e8e',player_id:'P01',role:'DIRECTOR',email:'part2a-director@synthetic.bagger-certification.invalid'},
 {auth_user_id:'3dcda7ec-1a08-4c93-93ec-3ec934a775bf',player_id:'P12',role:'PARTICIPANT',email:'part2a-participant-a@synthetic.bagger-certification.invalid'},
 {auth_user_id:'8172c31f-99fc-4798-9fd2-ecdfd3bda21a',player_id:'P11',role:'PARTICIPANT',email:'part2a-participant-b@synthetic.bagger-certification.invalid'},
].map(Object.freeze));
export const legacyFixtureTables=Object.freeze([
 'scoring_authority.players','scoring_authority.teams','scoring_authority.rounds',
 'scoring_authority.handicap_revisions','scoring_authority.tournament_players',
 'scoring_authority.handicap_revision_entries','scoring_authority.handicap_revision_current',
 'scoring_authority.scoring_snapshots','scoring_authority.matches','scoring_authority.match_participants',
 'scoring_authority.tournament_setup_course_tees_v1','scoring_authority.tournament_setup_course_holes_v1',
 'scoring_authority.tournament_setup_round_courses_v1','scoring_authority.tournament_setup_match_details_v1',
 'production_control.tournament_setup_context_v1','scoring_authority.match_holes',
 'scoring_authority.scoring_permissions','scoring_authority.game_center_presentations',
 'participant_identity.user_player_links','participant_identity.participant_auth_identifiers',
 'participant_identity.tournament_roles','production_control.director_entitlements',
 'scoring_authority.calcutta_v1_configuration_revisions','scoring_authority.calcutta_v1_current',
]);
export const contactTables=Object.freeze([
 'participant_identity.participant_identity_contacts','participant_identity.identity_context_revisions',
 'participant_identity.identity_config_import_runs','participant_identity.identity_audit_events',
]);
export const guideTables=Object.freeze(['production_control.projection_revisions','production_control.projection_current',
 'scoring_authority.guide_content_revisions','scoring_authority.guide_projection_current']);
export const fixtureTables=Object.freeze([...legacyFixtureTables,...contactTables,...guideTables]);
const digest=value=>createHash('sha256').update(value).digest('hex');
const literal=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb";
const exactKeys=(value,keys)=>assert.ok(value&&typeof value==='object'&&!Array.isArray(value)&&
 Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key)),'Exact owner request shape required');
export function validateFixtureRequest(input,{repair=false}={}){
 exactKeys(input,['contract','operation_id','resource','deployment','expected',...(repair?['fixture_receipt']:[])]);
 assert.equal(input.contract,repair?contactRepairContract:fixtureContract);
 assert.equal(input.operation_id,repair?'certification-part2a-identity-contacts-repair':'certification-part2a-initial-fixture');
 assert.deepEqual(input.resource,registration.registration,'Only the checked-in Certification registration is supported');
 exactKeys(input.deployment,['vercel_team_id','vercel_project_id','git_branch','deployment_class','release_commit','deployment_id','deployment_origin']);
 for(const key of ['vercel_team_id','vercel_project_id','git_branch','deployment_class'])
  assert.equal(input.deployment[key],input.resource[key]);
 assert.match(input.deployment.release_commit,/^[a-f0-9]{40}$/);
 assert.match(input.deployment.deployment_id,/^dpl_[A-Za-z0-9_-]{8,128}$/);
 assert.match(input.deployment.deployment_origin,/^https:\/\/[a-z0-9][a-z0-9-]*\.vercel\.app$/);
 exactKeys(input.expected,['binding_id','authority_epoch_id','activation_revision','admission_revision','pointer_revision','generation_id','generation_revision']);
 for(const key of ['binding_id','authority_epoch_id','generation_id'])assert.match(input.expected[key],/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
 for(const key of ['activation_revision','admission_revision','pointer_revision','generation_revision'])
  assert.ok(Number.isSafeInteger(input.expected[key])&&input.expected[key]>0,'Positive exact revision required');
 if(repair){
  exactKeys(input.fixture_receipt,['event_id','request_fingerprint','package_sha256','fixture_state_sha256']);
  assert.ok(Number.isSafeInteger(input.fixture_receipt.event_id)&&input.fixture_receipt.event_id>0);
  assert.equal(input.fixture_receipt.package_sha256,legacyFixturePackageSha256,'Only the certified omitted-contact package is repairable');
  for(const key of ['request_fingerprint','fixture_state_sha256'])assert.match(input.fixture_receipt[key],/^[a-f0-9]{64}$/);
 }
 return input;
}
const tableSnapshot=tables=>`jsonb_build_object(${tables.map(table=>`'${table}',(select coalesce(jsonb_agg(to_jsonb(v) order by to_jsonb(v)::text collate "C"),'[]'::jsonb) from ${table} v)`).join(',')})`;
async function renderPackage(input,repair){
 validateFixtureRequest(input,{repair});
 const file=repair?'certification-part2a-identity-contacts-repair.sql':'certification-part2a-fixture.sql';
 const tables=repair?[...legacyFixtureTables,...contactTables]:fixtureTables;
 const artifactNames=[file,'certification-part2a-provisioning-guards.sql','certification-part2a-identity-contacts.sql',
  ...(!repair?['certification-part2a-guide.sql','certification-part2a-guide.mjs','certification-part2a-fixture.mjs']:[])];
 const artifacts=await Promise.all(artifactNames.map(async name=>[name,await readFile(new URL('./'+name,import.meta.url),'utf8')]));
 const [template,guards,contacts]=artifacts.map(([,text])=>text);
 const manifest=JSON.parse(await readFile(new URL('../../supabase/canonical_bootstrap/manifest.json',import.meta.url),'utf8'));
 const request={...structuredClone(input),registration_manifest_digest:certificationManifestDigest(registration),
  package_sha256:digest(JSON.stringify(artifacts.map(([name,text])=>({name,sha256:digest(text)})))),identities:fixtureIdentities,
  installed_manifest_sha256:digest(await readFile(new URL('../../supabase/canonical_bootstrap/manifest.json',import.meta.url))),
  installed_schema_sha256:manifest.artifacts.schema.sha256,installed_static_sha256:manifest.artifacts.staticData.sha256};
 const guide=certificationPart2aGuide();
 const rendered=template.replace('/*PROVISIONING_GUARDS*/',guards).replace('/*IDENTITY_CONTACTS*/',contacts)
  .replace('/*SYNTHETIC_GUIDE*/',repair?'':artifacts[3][1])
  .replace('/*OWNER_REQUEST*/',literal(request))
  .replace('/*APPROVED_CONTRACT*/',"'"+(repair?contactRepairContract:fixtureContract)+"'")
  .replace('/*APPROVED_OPERATION*/',"'"+(repair?'certification-part2a-identity-contacts-repair':'certification-part2a-initial-fixture')+"'")
  .replace('/*APPROVED_REGISTRATION*/',literal(registration.registration))
  .replace('/*APPROVED_IDENTITIES*/',literal(fixtureIdentities))
  .replaceAll('/*FIXTURE_SNAPSHOT*/',tableSnapshot(fixtureTables))
  .replaceAll('/*LEGACY_FIXTURE_SNAPSHOT*/',tableSnapshot(legacyFixtureTables))
  .replaceAll('/*CONTACT_STATE_SNAPSHOT*/',tableSnapshot(contactTables))
  .replace('/*LEGACY_PACKAGE_SHA256*/',"'"+legacyFixturePackageSha256+"'")
  .replace('/*CONTACT_STATE_PRESENT*/',contactTables.map(table=>`exists(select 1 from ${table})`).join(' or '))
  .replace('/*LOCK_FIXTURE_TABLES*/',tables.join(','))
  .replace('/*EMPTY_FIXTURE*/',fixtureTables.map(table=>`exists(select 1 from ${table})`).join(' or '));
 const complete=renderGuideMarkers(rendered,guide,false);
 assert.ok(!/\/\*[A-Z_]+\*\//.test(complete),'Unexpanded provisioning marker');
 return complete;
}
export function renderGuideMarkers(template,guide,repair){
 return template.replaceAll('/*GUIDE_PRESENT*/',guideTables.map(table=>`exists(select 1 from ${table})`).join(' or '))
  .replaceAll('/*GUIDE_COURSE_NAME*/',"'"+(repair?'Synthetic Certification Course Part2A':'Synthetic Certification Course')+"'")
  .replaceAll('/*GUIDE_AUTHORING*/',literal(guide.authoringContent)).replaceAll('/*GUIDE_PROJECTION*/',literal(guide.projectionPayload))
  .replaceAll('/*GUIDE_AUTHORING_HASH*/',"'"+guide.authoringContentFingerprint+"'")
  .replaceAll('/*GUIDE_CONTENT_HASH*/',"'"+guide.contentFingerprint+"'")
  .replaceAll('/*GUIDE_PAYLOAD_HASH*/',"'"+guide.projectionPayloadHash+"'");
}
export const renderCertificationFixture=input=>renderPackage(input,false);
export const renderCertificationIdentityContactRepair=input=>renderPackage(input,true);

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const repair=process.argv[2]==='--repair',offset=repair?1:0;
 assert.equal(process.argv.length,4+offset,'Usage: node tools/reliability/certification-part2a-fixture.mjs [--repair] REQUEST.json OUTPUT.sql (renders only)');
 const input=JSON.parse(await readFile(process.argv[2+offset],'utf8'));
 const output=await renderPackage(input,repair);
 await writeFile(process.argv[3+offset],output,{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({rendered:true,executed:false,contract:input.contract,sha256:digest(output)}));
}
