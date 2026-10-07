// Owned historical-equivalent database only; no provider connection.
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {createIsolatedCluster,createDatabase,destroyIsolatedCluster,sql,sqlFile,jsonLiteral,repositoryRoot} from './support/reliability/postgres17.mjs';
import {installLocalCanonicalPlatform} from './support/reliability/phase2d-resource-bootstrap.mjs';import {enableOwnedSafeupdate} from './support/reliability/pg-safeupdate.mjs';
import {readModelDImage} from '../tools/reliability/model-d-bootstrap.mjs';import {renderModelDBinding,renderModelDRegistration} from '../tools/reliability/certification-model-d-binding.mjs';
import {renderModelDFixture,modelDIdentities,modelDFixtureContract} from '../tools/reliability/certification-model-d-fixture.mjs';import {renderModelDLineageInstallation,renderModelDSessionLineageAttestation,originalModelDReceipt} from '../tools/reliability/certification-forward-lineage.mjs';
import {renderModelDDirectorScoreInstallation} from '../tools/reliability/model-d-director-score-installation.mjs';
import registration from '../config/certification-model-d-registration.json' with {type:'json'};import {certificationSha256,certificationManifestDigest} from '../lib/canonical-resource-registration.js';
const hash=v=>createHash('sha256').update(v).digest('hex');const old=name=>execFileSync('git',['show','df8ade31d819d4858a196385dfee77a69743f644:supabase/model_d_bootstrap/'+name],{cwd:repositoryRoot,maxBuffer:32*1024*1024,encoding:'utf8'});
test('Director-scoring owner install: exact historical lineage, atomic authoritative forward record and preserved D9',async()=>{
 const previous=await readFile(repositoryRoot+'/test/certification-forward-lineage.integration.test.mjs','utf8');
 const fixtureFunction=previous.slice(previous.indexOf('async function upgraded(){'),previous.indexOf('const runVerification='));
 const dependencies={assert,createIsolatedCluster,createDatabase,installLocalCanonicalPlatform,sql,old,hash,originalModelDReceipt,readModelDImage,registration,certificationSha256,certificationManifestDigest,renderModelDRegistration,renderModelDBinding,modelDIdentities,jsonLiteral,modelDFixtureContract,enableOwnedSafeupdate,destroyIsolatedCluster};
 const create=new Function(...Object.keys(dependencies),fixtureFunction+';return upgraded;')(...Object.values(dependencies));const f=await create();
 try{
 sqlFile(f.cluster,f.database,repositoryRoot+'/supabase/production_incremental/certification-session-link-status-v1.sql',{role:''});
 f.q(await renderModelDLineageInstallation(f.input,{registrationManifest:f.manifest}));f.q(await renderModelDSessionLineageAttestation(f.input,{registrationManifest:f.manifest}));
 f.q(await renderModelDFixture(f.input,{registrationManifest:f.manifest}));
 const receipt=f.q('select to_jsonb(t)from production_control.canonical_bootstrap_installation_v1 t'),attestation=f.q('select to_jsonb(t)from production_control.certification_forward_lineage_v1 t'),players=f.q('select jsonb_agg(to_jsonb(p)order by player_id)from scoring_authority.players p');
 const install=await renderModelDDirectorScoreInstallation(f.input,{registrationManifest:f.manifest});
 assert.throws(()=>f.q(install.replace("commit;\n", "do $$begin raise exception 'OWNED_ATOMIC_FAILURE';end$$;commit;\n")),/OWNED_ATOMIC_FAILURE/);
 assert.equal(f.q("select to_regprocedure('production_control.assert_model_d_director_score_v1(jsonb,boolean)')is null"),'t');assert.equal(f.q('select count(*)from production_control.certification_forward_lineage_v1'),'1');
 f.q(install);const record=f.q("select to_jsonb(t)from production_control.certification_forward_lineage_v1 t where attestation_id='MODEL_D_DIRECTOR_SCORE_V1'");assert.equal(JSON.parse(record).payload.retrospective,false);assert.equal(JSON.parse(record).revision,2);
 f.q(install);assert.equal(f.q("select to_jsonb(t)from production_control.certification_forward_lineage_v1 t where attestation_id='MODEL_D_DIRECTOR_SCORE_V1'"),record);
 assert.equal(f.q('select to_jsonb(t)from production_control.canonical_bootstrap_installation_v1 t'),receipt);assert.equal(f.q("select to_jsonb(t)from production_control.certification_forward_lineage_v1 t where attestation_id='MODEL_D_SESSION_LINK_V1'"),attestation);assert.equal(f.q('select jsonb_agg(to_jsonb(p)order by player_id)from scoring_authority.players p'),players);
 assert.equal(f.q("select count(*)from scoring_authority.matches where status='UPCOMING'"),'24');assert.equal(f.q('select count(*)from scoring_authority.hole_scores'),'0');
 for(const role of ['anon','authenticated','service_role'])assert.throws(()=>f.q('set role '+role+';'+install),/OWNER_REQUIRED|permission denied/);
 assert.throws(()=>f.q(install.replace(JSON.parse(record).payload.artifact_sha256,'0'.repeat(64))),/LINEAGE_CONFLICT/);
 assert.throws(()=>f.q('update production_control.certification_forward_lineage_v1 set revision=3 where true'),/IMMUTABLE/);
 }finally{await destroyIsolatedCluster(f.cluster);}
});
