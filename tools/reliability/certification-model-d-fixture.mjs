// Fixed, one-shot owner package. No provider calls and no public SQL function.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import manifest from '../../config/certification-model-d-fixture.json' with {type:'json'};
import {validateModelDBinding} from './certification-model-d-binding.mjs';
import {certificationManifestDigest} from '../../lib/canonical-resource-registration.js';
import {readModelDImage} from './model-d-bootstrap.mjs';
import {fixtureTables,renderGuideMarkers} from './certification-part2a-fixture.mjs';
import {normalizeProductionGuideAuthoring} from '../../lib/production-guide-authoring-contract.js';
import {certificationPart2aGuide} from './certification-part2a-guide.mjs';
export const modelDFixtureContract='bootstrap-certification-part2c-tournament-v1';
export const modelDIdentities=Object.freeze([
 {player_id:'P01',role:'DIRECTOR',auth_user_id:'d2000000-0000-4000-8000-000000000001',email:'model-d-director@synthetic.bagger-certification.invalid'},
 {player_id:'P12',role:'PARTICIPANT',auth_user_id:'d2000000-0000-4000-8000-000000000012',email:'model-d-participant-a@synthetic.bagger-certification.invalid'},
 {player_id:'P13',role:'PARTICIPANT',auth_user_id:'d2000000-0000-4000-8000-000000000013',email:'model-d-participant-b@synthetic.bagger-certification.invalid'},
].map(Object.freeze));
export function validateModelDFixture(value){
 assert.deepEqual(value,manifest,'Only the committed fixed 24-match manifest is admitted');
 assert.equal(new Set(value.players.map(p=>p.player_id)).size,24);assert.equal(value.matches.length,24);
 for(const side of[1,2])assert.equal(value.players.filter(p=>p.team_side===side).length,12);
 for(const rd of value.rounds){const matches=value.matches.filter(m=>m.round===rd.round);assert.equal(matches.length,rd.count);
 const ids=matches.flatMap(m=>m.participants.map(p=>p.player_id));assert.equal(ids.length,24);assert.equal(new Set(ids).size,24);
 for(const m of matches){assert.equal(m.format,rd.format);assert.equal(m.holes.length,18);assert.equal(m.scoring_locked,false);
 for(const p of m.participants)assert.equal(value.players.find(v=>v.player_id===p.player_id).team_side,p.team_side);}}
 return value;
}
export function modelDGuide(){
 const content=structuredClone(certificationPart2aGuide().authoringContent);
 content.tournament['Tournament Name']='Synthetic Model D Dress Rehearsal';
 content.tournament['Tournament Edition']='Certification Model D';
 content.tournament['Tournament Dates']='September 24–26, 2026';content.tournament['End Date']='2026-09-26';
 content.schedule=manifest.rounds.map((r,i)=>({'Event ID':'model-d-round-'+r.round,'Tournament ID':'2026','Event Date':'2026-09-'+(24+i),'Day Label':['Thursday','Friday','Saturday'][i],'Start Time':'9:00 AM','End Time':'1:00 PM','Event Type':'Golf',Title:'Synthetic Round '+r.round,Location:'Synthetic Certification Course '+r.round,'Round ID':String(r.round),'Course ID':'C'+r.round,'Display Order':String(r.round),Status:'Published'}));
 content.tournamentRules=manifest.rounds.map(r=>({Year:'2026',Round:String(r.round),Format:r.format,'Team Size':r.format==='SI'?'1':'2','Points Available':r.format==='SI'?'3':'1','Front 9 Used':r.format==='SI'?'TRUE':'FALSE','Back 9 Used':r.format==='SI'?'TRUE':'FALSE','Overall Used':'TRUE','Front 9 Points':r.format==='SI'?'1':'0','Back 9 Points':r.format==='SI'?'1':'0','Overall Points':'1'}));
 content.rounds=manifest.rounds.map(r=>({'Format ID':r.format,Name:{BB:'Best Ball',SC:'Scramble',SI:'Singles'}[r.format],'Team Size':r.format==='SI'?'1':'2'}));
 content.courses=manifest.rounds.map(r=>({'Course ID':'C'+r.round,Year:'2026',Round:String(r.round),Format:r.format,Course:'Synthetic Certification Course '+r.round,Overview:'Fixed synthetic Model D course.'}));
 return normalizeProductionGuideAuthoring({content,targetTournamentId:'2026',targetTournamentYear:2026,
 canonicalCourseContext:manifest.rounds.map(r=>({course_id:'C'+r.round,round:r.round,format:r.format,tee:'Tournament',rating:72,slope:120,par:72,holes:manifest.course.holes})),
 canonicalRounds:manifest.rounds.map(r=>({roundNumber:r.round,format:r.format,courseId:'C'+r.round,teeId:'Tournament'}))});
}
const hash=v=>createHash('sha256').update(v).digest('hex'),literal=v=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
const snapshot=`jsonb_build_object(${fixtureTables.map(t=>`'${t}',(select coalesce(jsonb_agg(to_jsonb(v)order by to_jsonb(v)::text collate "C"),'[]'::jsonb)from ${t} v)`).join(',')})`;
export async function renderModelDFixture(input,{registrationManifest}={}){
 validateModelDBinding({resource:input.resource,deployment:input.deployment,purpose:'PART2C_DRESS_REHEARSAL',binding_id:input.expected?.binding_id,authority_epoch_id:input.expected?.authority_epoch_id},{registrationManifest});
 assert.equal(input.contract,modelDFixtureContract);assert.equal(input.operation_id,'certification-model-d-initial-fixture');
 const expectedKeys=['binding_id','authority_epoch_id','activation_revision','admission_revision','pointer_revision','generation_id','generation_revision'];
 assert.deepEqual(Object.keys(input.expected).sort(),expectedKeys.sort());
 for(const k of expectedKeys.filter(k=>k.endsWith('revision')&&k!=='admission_revision'))assert.equal(input.expected[k],1,'Initial resource checkpoint only');
 // D7 may perform exactly one enable/disable pair for NO_WORK Queue binding.
 assert.ok([1,3].includes(input.expected.admission_revision),'Fresh disabled checkpoint before or after bounded trust acceptance only');
 const image=await readModelDImage();
 const names=['certification-model-d-fixture.sql','certification-part2a-provisioning-guards.sql','certification-part2a-identity-contacts.sql','certification-part2a-guide.sql','certification-model-d-fixture.mjs'];
 const files=await Promise.all(names.map(n=>readFile(new URL('./'+n,import.meta.url),'utf8')));
 const cfg={contract_version:'production-calcutta-v1',point_structure:Array.from({length:24},(_,i)=>({place:i+1,round_1_award:String((24-i)*4),round_2_award:String(i<12?(12-i)*12-3:0),round_3_award:String((24-i)*5)})),
 payout_structure:Array.from({length:24},(_,i)=>({place:i+1,round_1_fraction:['0.0125','0.01','0.0075'][i]||'0',round_2_fraction:['0.025','0.015'][i]||'0',round_3_fraction:['0.0125','0.01','0.0075'][i]||'0',overall_fraction:i===23?'0.05':['0.225','0.2','0.15','0.12','0.09','0.065'][i]||'0'}))};
 const request={...input,fixture:validateModelDFixture(manifest),identities:modelDIdentities,calcutta_initial_configuration:cfg,
 registration_manifest_digest:certificationManifestDigest(registrationManifest),package_sha256:hash(JSON.stringify(files.map((f,i)=>({name:names[i],sha256:hash(f)})))+JSON.stringify(manifest)),
 installed_manifest_sha256:image.manifestDigest,installed_schema_sha256:image.manifest.artifacts.schema,installed_static_sha256:image.manifest.artifacts.staticData};
 let guide=files[3];const start=guide.indexOf(' if (select count(*) from scoring_authority.rounds)');const end=guide.indexOf(' guide_validation:=');
 guide=guide.slice(0,start)+" if not scoring_authority.guide_course_context_is_eligible(production_control.guide_canonical_course_context_v1('2026'))then raise exception 'MODEL_D_GUIDE_COURSE_INVALID';end if;\n"+guide.slice(end);
 guide=guide.replaceAll('CERTIFICATION_PART2A_SYNTHETIC_GUIDE_PUBLISHED','CERTIFICATION_MODEL_D_SYNTHETIC_GUIDE_PUBLISHED');
 let contacts=files[2].replace("1,'APPROVED',4,3,3,1","1,'APPROVED',24,3,3,21").replaceAll('CERTIFICATION_PART2A_SYNTHETIC_CONTACTS_PROVISIONED','CERTIFICATION_MODEL_D_SYNTHETIC_CONTACTS_PROVISIONED');
 let sql=files[0].replace('/*PROVISIONING_GUARDS*/',files[1]).replace('/*IDENTITY_CONTACTS*/',contacts).replace('/*SYNTHETIC_GUIDE*/',guide)
 .replace('/*OWNER_REQUEST*/',literal(request)).replace('/*APPROVED_CONTRACT*/',"'"+modelDFixtureContract+"'").replace('/*APPROVED_OPERATION*/',"'certification-model-d-initial-fixture'")
 .replace('/*APPROVED_REGISTRATION*/',literal(registrationManifest.registration)).replace('/*APPROVED_IDENTITIES*/',literal(modelDIdentities)).replace('/*FIXED_MANIFEST*/',literal(manifest))
 .replaceAll('/*FIXTURE_SNAPSHOT*/',snapshot).replace('/*LOCK_FIXTURE_TABLES*/',fixtureTables.join(',')).replace('/*EMPTY_FIXTURE*/',fixtureTables.map(t=>`exists(select 1 from ${t})`).join(' or '));
 sql=renderGuideMarkers(sql,modelDGuide(),false);assert.ok(!/\/\*[A-Z_]+\*\//.test(sql));return sql;
}
