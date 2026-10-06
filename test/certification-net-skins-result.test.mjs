import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {certificationRuntimeFixture} from './support/reliability/certification-runtime-fixture.mjs';
import {certificationReadAliasRpc} from '../lib/certification-read-adapters.js';
import {certificationParticipantNetSkinsData} from '../lib/certification-net-skins-participant.js';
test('fixed Net Skins V1 projection accepts only a server-resolved reader and injects exact registered context',async()=>{
 const f=certificationRuntimeFixture();await certificationReadAliasRpc('read_production_net_skins_v1',{input:{player_id:'P12'}},{env:f.env,certificationDependencies:f.dependencies});
 const sent=f.requests.at(-1).input;assert.equal(sent.operation,'READS.NET_SKINS_V1');assert.equal(sent.phase,'READS');assert.deepEqual(sent.payload,{player_id:'P12'});
 assert.equal(sent.resource.resource_class,'CERTIFICATION');assert.equal(sent.deployment.deployment_id,f.env.VERCEL_DEPLOYMENT_ID);assert.ok(sent.expected_context_token);
});
for(const [name,body]of Object.entries({missing:{input:{}},otherPlayerField:{input:{player_id:'P12',target_player_id:'P11'}},resource:{input:{player_id:'P12',resource:'PRODUCTION'}},environment:{input:{player_id:'P12',environment:'PREVIEW'}},revision:{input:{player_id:'P12',configuration_revision:99}},tournament:{input:{player_id:'P12',tournament_id:'2027'}},body:{input:{player_id:'P12'},arbitrary:'value'}}))test('read alias rejects '+name+' before provider access',async()=>{
 const f=certificationRuntimeFixture();await assert.rejects(certificationReadAliasRpc('read_production_net_skins_v1',body,{env:f.env,certificationDependencies:f.dependencies}),e=>e.code==='CERTIFICATION_INPUT_INVALID');assert.equal(f.requests.length,0);
});
test('participant projection retains published holes/winners and omits internal fingerprints/raw source detail',()=>{
 const value={rounds:[{skins:[{hole:1,skinValue:25}],leaderboard:[{playerIds:['P12'],skinsWon:1,holeResults:[{hole:1,net:4}]}],
  configurationFingerprint:'private',sourceFingerprint:'private',participantLabels:{private:'value'},fullNetDetail:[{snapshotId:'private'}]}],
  presentation:{authorityFingerprint:'private',rounds:[{holes:[{hole:1,participants:[{entryId:'P12',gross:4,fullNet:4}]}],winners:[{entryId:'P12',qaPayout:25}]}]}};
 const r=certificationParticipantNetSkinsData(value);assert.equal(r.rounds[0].skins[0].skinValue,25);assert.equal(r.presentation.rounds[0].holes.length,1);
 assert.doesNotMatch(JSON.stringify(r),/private|Fingerprint|snapshotId|fullNetDetail/);assert.equal(value.rounds[0].sourceFingerprint,'private');
});
test('source scope retains Production-only administration, legacy Preview selection, no worker engine or math changes',async()=>{
 const route=await readFile(new URL('../app/api/leaderboards/net-skins/route.js',import.meta.url),'utf8');assert.match(route,/source\.certificationResource === true/);
 assert.match(route,/source\.productionCutover\?\.handled === true/);assert.match(route,/currentNetSkinsOperationalResult/);
 const admin=await readFile(new URL('../app/api/admin/production-net-skins-v1/route.js',import.meta.url),'utf8');assert.match(admin,/assertProductionCutoverActivation/);assert.match(admin,/status: 404/);
 const sql=await readFile(new URL('../supabase/production_incremental/certification-net-skins-result-read-v1.sql',import.meta.url),'utf8');
 assert.match(sql,/READS.NET_SKINS_V1/);assert.match(sql,/PREDECESSOR_MISMATCH/);assert.match(sql,/PRIVATE_ACL_DRIFT/);assert.doesNotMatch(sql,/grant.*to (?:anon|authenticated|service_role)|disable row level security|update scoring_authority|insert into scoring_authority/i);
});
