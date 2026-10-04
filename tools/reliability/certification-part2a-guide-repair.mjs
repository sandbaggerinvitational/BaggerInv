// Renders the fixed preserved-fixture repair; never connects to any database.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import registration from '../../config/certification-resource-registration.json' with {type:'json'};
import {certificationManifestDigest} from '../../lib/canonical-resource-registration.js';
import {validateFixtureRequest,contactRepairContract,fixtureIdentities,fixtureTables,guideTables,renderGuideMarkers} from './certification-part2a-fixture.mjs';
import {certificationPart2aGuide} from './certification-part2a-guide.mjs';
export const guideRepairContract='repair-certification-part2a-guide-v1';
export const preservedGuideTables=Object.freeze([...fixtureTables.filter(t=>!guideTables.includes(t)),
 'scoring_authority.competition_recalculation_jobs','production_control.certification_ingress_leases_v1',
 'production_control.certification_ingress_execution_v1','production_control.net_skins_entry_revisions_v1',
 'scoring_authority.calcutta_v1_auction_fact_revisions','scoring_authority.calcutta_v1_publication_revisions']);
export const guideSnapshotSql=tables=>`jsonb_build_object(${tables.map(t=>`'${t}',(select coalesce(jsonb_agg(to_jsonb(v) order by to_jsonb(v)::text collate "C"),'[]'::jsonb) from ${t} v)`).join(',')})`;
const hash=v=>createHash('sha256').update(v).digest('hex');
const literal=v=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
export async function renderCertificationGuideRepair(input){
 assert.equal(input.contract,guideRepairContract);assert.equal(input.operation_id,'certification-part2a-guide-repair');
 assert.match(input.fixture_snapshot_sha256??'',/^[a-f0-9]{64}$/);
 const common=structuredClone(input);delete common.fixture_snapshot_sha256;
 common.contract=contactRepairContract;common.operation_id='certification-part2a-identity-contacts-repair';
 validateFixtureRequest(common,{repair:true});
 const names=['certification-part2a-guide-repair.sql','certification-part2a-provisioning-guards.sql',
  'certification-part2a-guide.sql','certification-part2a-guide.mjs','certification-part2a-guide-repair.mjs','certification-part2a-fixture.mjs'];
 const artifacts=await Promise.all(names.map(async name=>[name,await readFile(new URL('./'+name,import.meta.url),'utf8')]));
 let guards=artifacts[1][1];
 // This repair follows resolved Director operations. Preserve the fresh/contacts
 // package's empty-work predicates; specialize only this fixed repair boundary.
 guards=guards.replace('or exists(select 1 from production_control.certification_ingress_leases_v1)',
  `or exists(select 1 from production_control.certification_ingress_leases_v1 where state<>'COMMITTED'
    or resource_id<>r.resource_id or admission_generation_id<>gen.generation_id or authority_epoch_id<>a.authority_epoch_id
    or tournament_id<>'2026' or actor_role<>'DIRECTOR' or actor_player_id<>'P01'
    or actor_auth_user_id<>'3003e93a-f0ec-422b-835e-5081fefb2e8e'
    or operation_id not in('DIRECTOR.MUTATE_SETUP','DIRECTOR.MUTATE_PAIRINGS','DIRECTOR.SAVE_NET_SKINS_ENTRIES',
     'DIRECTOR.REPLACE_CALCUTTA_AUCTION','DIRECTOR.CLEAR_CALCUTTA_AUCTION'))`)
  .replace('or exists(select 1 from scoring_authority.competition_recalculation_jobs)',
   `or (select count(*) from scoring_authority.competition_recalculation_jobs)<>5
    or exists(select 1 from scoring_authority.competition_recalculation_jobs where tournament_id<>'2026' or round_number<>0
     or engine_key not in('TEAM_MOMENTUM','TOURNAMENT_STORYLINES','TOURNAMENT_INTELLIGENCE','PROJECTION_EDITORIAL','TOURNAMENT_FINAL_RECAP')
     or status<>'PENDING' or attempts<>0 or delivery_attempts<>0 or delivery_cycle<>1
     or delivery_dead_letter_at is not null or runtime_generation_id is not null or claimed_by is not null
     or claim_token is not null or lease_expires_at is not null or last_error_code is not null
     or requested_source_revision is distinct from '{"reason":"CANONICAL_MATCH_CHANGED","revision":{"status":"UPCOMING","matchId":"2026-R3-12","resultWinner":"","matchRevision":1,"scorecardComplete":false},"transactional":true}'::jsonb)`);
 const manifest=JSON.parse(await readFile(new URL('../../supabase/canonical_bootstrap/manifest.json',import.meta.url),'utf8'));
 const request={...input,identities:fixtureIdentities,registration_manifest_digest:certificationManifestDigest(registration),
  package_sha256:hash(JSON.stringify(artifacts.map(([name,content])=>({name,sha256:hash(content)})))),
  installed_manifest_sha256:hash(await readFile(new URL('../../supabase/canonical_bootstrap/manifest.json',import.meta.url))),
  installed_schema_sha256:manifest.artifacts.schema.sha256,installed_static_sha256:manifest.artifacts.staticData.sha256};
 let rendered=artifacts[0][1].replace('/*PROVISIONING_GUARDS*/',guards).replace('/*SYNTHETIC_GUIDE*/',artifacts[2][1])
  .replace('/*OWNER_REQUEST*/',literal(request)).replace('/*APPROVED_CONTRACT*/',"'"+guideRepairContract+"'")
  .replace('/*APPROVED_OPERATION*/',"'certification-part2a-guide-repair'")
  .replace('/*APPROVED_REGISTRATION*/',literal(registration.registration)).replace('/*APPROVED_IDENTITIES*/',literal(fixtureIdentities))
  .replace('/*LOCK_FIXTURE_TABLES*/',[...preservedGuideTables.filter(t=>!t.startsWith('production_control.certification_ingress_')),...guideTables].join(','))
  .replaceAll('/*PRESERVED_SNAPSHOT*/',guideSnapshotSql(preservedGuideTables))
  .replaceAll('/*GUIDE_SNAPSHOT*/',guideSnapshotSql(guideTables));
 rendered=renderGuideMarkers(rendered,certificationPart2aGuide(true),true);
 assert.ok(!/\/\*[A-Z_]+\*\//.test(rendered));return rendered;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.equal(process.argv.length,4,'Usage: node tools/reliability/certification-part2a-guide-repair.mjs REQUEST.json OUTPUT.sql (renders only)');
 const input=JSON.parse(await readFile(process.argv[2],'utf8'));
 const rendered=await renderCertificationGuideRepair(input);
 await writeFile(process.argv[3],rendered,{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({rendered:true,executed:false,contract:guideRepairContract,sha256:hash(rendered)}));
}
