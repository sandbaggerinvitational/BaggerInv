import test from 'node:test';
import assert from 'node:assert/strict';
import {
 createCanonicalCompilerFixture,installLocalCanonicalPlatform,staticContractTables,
} from '../../test/support/reliability/phase2d-resource-bootstrap.mjs';
import {createDatabase,destroyIsolatedCluster,sql} from '../../test/support/reliability/postgres17.mjs';
import {certificationProvisionalProfile} from '../../test/support/reliability/certification-provisional-profile.mjs';
import {certificationPrivateCoreSecurityProof} from '../../test/support/reliability/certification-private-core-security-proof.mjs';
import {
 readCanonicalArtifacts,buildCanonicalArtifacts,validateCanonicalArtifacts,
 installCanonicalBaseline,canonicalTableCounts,serialize,
} from './canonical-bootstrap-artifacts.mjs';

test('R2 deterministic canonical bootstrap — owned local PostgreSQL17 only',async t=>{
 // Explicit local test mode permits independent infrastructure proof while the
 // final profile is blocked. It never writes schema/manifest release artifacts.
 const provisional=process.env.BAGGER_R2_PROVISIONAL_BOOTSTRAP_PROOF==='1';
 let recorded=provisional?null:await readCanonicalArtifacts();
 const forwardMigrations=recorded?.manifest.forwardMigrations||certificationProvisionalProfile;
 const fixture=await createCanonicalCompilerFixture({forwardMigrations});
 const {cluster}=fixture;
 try{
  const compiled=await buildCanonicalArtifacts(fixture);
  recorded??=compiled;
  await t.test(provisional?'provisional source profile deterministically reproduces its in-memory artifacts':'reviewed source profile reproduces schema, static data, catalog and manifest',async()=>{
   assert.equal(compiled.schema,recorded.schema);
   assert.equal(compiled.staticData,recorded.staticData);
   assert.equal(serialize(compiled.catalog),serialize(recorded.catalog));
   assert.equal(serialize(compiled.manifest),serialize(recorded.manifest));
   assert.deepEqual((await buildCanonicalArtifacts(fixture)).manifest,compiled.manifest);
  });
  await t.test('tampered schema/catalog/source manifest rejected before installation',async()=>{
   await assert.rejects(validateCanonicalArtifacts({...recorded,schema:recorded.schema+'\nselect 1;'}),/artifact hash mismatch/);
   await assert.rejects(validateCanonicalArtifacts({...recorded,catalog:{...recorded.catalog,functions:[]}}),/artifact hash mismatch/);
   const bad=structuredClone(recorded);bad.manifest.sourceFiles[0].sha256='0'.repeat(64);
   await assert.rejects(validateCanonicalArtifacts(bad),/source hash mismatch/);
  });
  await t.test('fresh database has convergent definitions and zero authority/history/job seeds',async()=>{
   createDatabase(cluster,'r2_clean_a');installLocalCanonicalPlatform(cluster,'r2_clean_a');
   const result=await installCanonicalBaseline(cluster,'r2_clean_a',recorded);
   assert.equal(result.replayed,false);
   const rows=canonicalTableCounts(cluster,'r2_clean_a');
   const allowed=new Set([...staticContractTables,'production_control.canonical_bootstrap_installation_v1']);
   assert.deepEqual(Object.entries(rows).filter(([table,count])=>count&&!allowed.has(table)),[]);
   assert.equal(rows['production_control.canonical_resource_v1'],0);
   assert.equal(rows['production_control.resource_scope'],0);
   assert.equal(rows['production_control.cutover_activation_state'],0);
   assert.equal(rows['production_control.current_tournament_pointer_v1'],0);
   assert.equal(rows['production_control.certification_admission_v1'],0);
   for(const staticTable of recorded.manifest.staticTables)assert.equal(rows[staticTable.table],staticTable.rowCount);
  });
  await t.test('exact replay verifies receipt and makes no new authority',async()=>{
   const before=canonicalTableCounts(cluster,'r2_clean_a');
   const result=await installCanonicalBaseline(cluster,'r2_clean_a',recorded);
   assert.equal(result.replayed,true);
   assert.deepEqual(canonicalTableCounts(cluster,'r2_clean_a'),before);
  });
  await t.test('new private cores retain owner-only execution and exact source-defined security attributes',async()=>{
   await certificationPrivateCoreSecurityProof({cluster,database:'r2_clean_a',forwardMigrations,expectedOwner:'postgres'});
  });
  for(const[index,boundary]of['after-schema','after-static','before-commit'].entries()){
   await t.test(`failure at ${boundary} rolls back all application schemas and retry succeeds`,async()=>{
    const database=`r2_fault_${index}`;createDatabase(cluster,database);installLocalCanonicalPlatform(cluster,database);
    await assert.rejects(installCanonicalBaseline(cluster,database,recorded,{injectFailureAt:boundary}),/BOOTSTRAP_INJECTED_FAILURE/);
    assert.equal(sql(cluster,database,`select count(*) from pg_namespace where nspname in('production_control','scoring_authority','participant_identity','production_rehearsal')`,{role:''}),'0');
    assert.equal((await installCanonicalBaseline(cluster,database,recorded)).replayed,false);
   });
  }
  await t.test('fresh independent database converges; no cloned resource or control authority',async()=>{
   createDatabase(cluster,'r2_clean_b');installLocalCanonicalPlatform(cluster,'r2_clean_b');
   await installCanonicalBaseline(cluster,'r2_clean_b',recorded);
   assert.deepEqual(canonicalTableCounts(cluster,'r2_clean_b'),canonicalTableCounts(cluster,'r2_clean_a'));
  });
  await t.test('replay detects changed RLS rather than accepting only a matching receipt',async()=>{
   sql(cluster,'r2_clean_b','alter table production_control.canonical_resource_v1 disable row level security',{role:''});
   await assert.rejects(installCanonicalBaseline(cluster,'r2_clean_b',recorded),/Catalog divergence/);
  });
  await t.test('unowned database handles rejected; no remote connection interface',async()=>{
   await assert.rejects(installCanonicalBaseline({socket:'https://untrusted.invalid'},'postgres',recorded),/isolated cluster object required/);
  });
  t.diagnostic(JSON.stringify({environment:'OWNED_LOCAL_POSTGRESQL17',provisional,
   finalBaselineArtifactsRead:!provisional,artifactsEmittedByTest:false,
   functions:compiled.catalog.functions.length,sourceFiles:compiled.manifest.sourceFiles.length,
   forwardMigrations,completeCandidateCertified:false,
   authorityRowsCopied:0,hostedAccess:false}));
 }finally{await destroyIsolatedCluster(cluster);}
});
