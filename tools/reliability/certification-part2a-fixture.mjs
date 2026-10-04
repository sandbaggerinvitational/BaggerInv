// Owner provisioning package renderer only. No database/network execution API.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import registration from '../../config/certification-resource-registration.json' with {type:'json'};
import {certificationManifestDigest} from '../../lib/canonical-resource-registration.js';

export const fixtureContract='bootstrap-certification-part2a-fixture-v1';
export const fixtureIdentities=Object.freeze([
 {auth_user_id:'3003e93a-f0ec-422b-835e-5081fefb2e8e',player_id:'P01',role:'DIRECTOR',email:'part2a-director@synthetic.bagger-certification.invalid'},
 {auth_user_id:'3dcda7ec-1a08-4c93-93ec-3ec934a775bf',player_id:'P12',role:'PARTICIPANT',email:'part2a-participant-a@synthetic.bagger-certification.invalid'},
 {auth_user_id:'8172c31f-99fc-4798-9fd2-ecdfd3bda21a',player_id:'P11',role:'PARTICIPANT',email:'part2a-participant-b@synthetic.bagger-certification.invalid'},
].map(Object.freeze));
export const fixtureTables=Object.freeze([
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
const digest=value=>createHash('sha256').update(value).digest('hex');
const literal=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb";
const exactKeys=(value,keys)=>assert.ok(value&&typeof value==='object'&&!Array.isArray(value)&&
 Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key)),'Exact owner request shape required');
export function validateFixtureRequest(input){
 exactKeys(input,['contract','operation_id','resource','deployment','expected']);
 assert.equal(input.contract,fixtureContract);
 assert.equal(input.operation_id,'certification-part2a-initial-fixture');
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
 return input;
}
export async function renderCertificationFixture(input){
 validateFixtureRequest(input);
 const template=await readFile(new URL('./certification-part2a-fixture.sql',import.meta.url),'utf8');
 const manifest=JSON.parse(await readFile(new URL('../../supabase/canonical_bootstrap/manifest.json',import.meta.url),'utf8'));
 const tableSnapshot=`jsonb_build_object(${fixtureTables.map(table=>`'${table}',(select coalesce(jsonb_agg(to_jsonb(v) order by to_jsonb(v)::text collate "C"),'[]'::jsonb) from ${table} v)`).join(',')})`;
 const request={...structuredClone(input),registration_manifest_digest:certificationManifestDigest(registration),
  package_sha256:digest(template),identities:fixtureIdentities,
  installed_manifest_sha256:digest(await readFile(new URL('../../supabase/canonical_bootstrap/manifest.json',import.meta.url))),
  installed_schema_sha256:manifest.artifacts.schema.sha256,installed_static_sha256:manifest.artifacts.staticData.sha256};
 return template.replace('/*OWNER_REQUEST*/',literal(request))
  .replace('/*APPROVED_REGISTRATION*/',literal(registration.registration))
  .replace('/*APPROVED_IDENTITIES*/',literal(fixtureIdentities))
  .replaceAll('/*FIXTURE_SNAPSHOT*/',tableSnapshot)
  .replace('/*LOCK_FIXTURE_TABLES*/',fixtureTables.join(','))
  .replace('/*EMPTY_FIXTURE*/',fixtureTables.map(table=>`exists(select 1 from ${table})`).join(' or '));
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.equal(process.argv.length,4,'Usage: node tools/reliability/certification-part2a-fixture.mjs REQUEST.json OUTPUT.sql (renders only)');
 const input=JSON.parse(await readFile(process.argv[2],'utf8'));
 const output=await renderCertificationFixture(input);
 await writeFile(process.argv[3],output,{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({rendered:true,executed:false,contract:fixtureContract,sha256:digest(output)}));
}
