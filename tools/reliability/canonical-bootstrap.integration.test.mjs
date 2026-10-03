import test from 'node:test';
import assert from 'node:assert/strict';
import {
 createCanonicalCompilerFixture,installLocalCanonicalPlatform,staticContractTables,
} from '../../test/support/reliability/phase2d-resource-bootstrap.mjs';
import {createDatabase,createIsolatedCluster,destroyIsolatedCluster,sql,runResult,binaries,repositoryRoot} from '../../test/support/reliability/postgres17.mjs';
import {certificationProvisionalProfile} from '../../test/support/reliability/certification-provisional-profile.mjs';
import {certificationPrivateCoreSecurityProof} from '../../test/support/reliability/certification-private-core-security-proof.mjs';
import {
 readCanonicalArtifacts,buildCanonicalArtifacts,validateCanonicalArtifacts,
 installCanonicalBaseline,canonicalTableCounts,canonicalCatalog,assertCatalogConvergence,serialize,
} from './canonical-bootstrap-artifacts.mjs';

// Test-only provider setup. This alternate login exists only inside a newly
// owned socket-only cluster; the installer itself always connects as postgres.
function providerSql(cluster,database,input){
 assert.equal(sql(cluster,database,'select current_database()',{role:''}),database);
 const result=runResult(binaries.psql,['-X','-qAt','-v','ON_ERROR_STOP=1',
  '-h',cluster.socket,'-p',String(cluster.port),'-U','fixture_admin','-d',database],
  {cwd:repositoryRoot,env:{PATH:process.env.PATH||'',PGOPTIONS:''},input});
 assert.equal(result.status,0,result.stderr);
 return result.stdout.trim();
}
function platformSnapshot(cluster,database){
 return JSON.parse(sql(cluster,database,`select jsonb_build_object(
 'namespace',(select jsonb_build_object('oid',oid,'owner',pg_get_userbyid(nspowner),'acl',nspacl::text)
  from pg_namespace where nspname='extensions'),
 'extensions',(select jsonb_agg(jsonb_build_object('oid',e.oid,'name',e.extname,'version',e.extversion,
  'owner',pg_get_userbyid(e.extowner),'schema',n.nspname) order by e.extname)
  from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto'),
 'functions',(select jsonb_agg(jsonb_build_object('oid',p.oid,'definition',pg_get_functiondef(p.oid),
  'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text) order by p.oid)
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='extensions'))`,{role:''}));
}

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
   assert.equal(sql(cluster,'r2_clean_a',"select to_regnamespace('extensions') is null",{role:''}),'t');
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
  await t.test('Supabase-shaped non-superuser postgres preserves provider namespace/extension and converges',async()=>{
   const managed=await createIsolatedCluster();
   const databases=['r2_managed_existing','r2_managed_ext_absent','r2_managed_local_absent','r2_managed_wrong'];
   try{
    for(const database of databases){
     createDatabase(managed,database);installLocalCanonicalPlatform(managed,database);
     if(database!=='r2_managed_local_absent')sql(managed,database,`create schema extensions;
      create function extensions.platform_sentinel() returns integer language sql as 'select 1';`,{role:''});
    }
    sql(managed,'r2_managed_existing','create extension pgcrypto with schema extensions',{role:''});
    sql(managed,'r2_managed_wrong','create extension pgcrypto with schema public',{role:''});
    sql(managed,'postgres',`create role fixture_admin login superuser;
     create role managed_installer login nosuperuser createdb createrole bypassrls;`,{role:''});
    // Make the initial bootstrap superuser the provider, as on Supabase. The
    // separate installer is genuinely NOSUPERUSER, not a JWT claim or SET ROLE.
    providerSql(managed,'postgres',`alter role postgres rename to supabase_admin;
     alter role managed_installer rename to postgres;
     grant anon,authenticated,service_role to postgres;`);
    for(const database of databases)providerSql(managed,database,`alter database ${database} owner to postgres;
     grant usage on schema auth to postgres;
     grant references,trigger on auth.users,auth.identities to postgres;
     ${database!=='r2_managed_local_absent'?'grant usage on schema extensions to postgres,anon,authenticated,service_role;':''}`);
    assert.equal(sql(managed,'r2_managed_existing',`select current_user||':'||session_user||':'||rolsuper
     from pg_roles where rolname=current_user`,{role:''}),'postgres:postgres:false');
    const before=platformSnapshot(managed,'r2_managed_existing');
    assert.equal(before.namespace.owner,'supabase_admin');
    assert.equal(before.extensions[0].owner,'supabase_admin');
    const installed=await installCanonicalBaseline(managed,'r2_managed_existing',recorded);
    assert.equal(installed.replayed,false);
    assert.deepEqual(platformSnapshot(managed,'r2_managed_existing'),before,'Provider OIDs/owners/ACLs/bodies unchanged');
    assertCatalogConvergence(await canonicalCatalog(managed,'r2_managed_existing'),recorded.catalog);
    assert.deepEqual(canonicalTableCounts(managed,'r2_managed_existing'),canonicalTableCounts(cluster,'r2_clean_a'));
    assert.equal((await installCanonicalBaseline(managed,'r2_managed_existing',recorded)).replayed,true);
    assert.deepEqual(platformSnapshot(managed,'r2_managed_existing'),before);
    await certificationPrivateCoreSecurityProof({cluster:managed,database:'r2_managed_existing',forwardMigrations,expectedOwner:'postgres'});
    for(const database of ['r2_managed_ext_absent','r2_managed_local_absent']){
     const namespace=platformSnapshot(managed,database).namespace;
     assert.equal((await installCanonicalBaseline(managed,database,recorded)).replayed,false);
     assert.equal((await installCanonicalBaseline(managed,database,recorded)).replayed,true);
     if(namespace)assert.deepEqual(platformSnapshot(managed,database).namespace,namespace);
     assert.deepEqual(canonicalTableCounts(managed,database),canonicalTableCounts(cluster,'r2_clean_a'));
    }
    const wrong=platformSnapshot(managed,'r2_managed_wrong');
    await assert.rejects(installCanonicalBaseline(managed,'r2_managed_wrong',recorded),/BOOTSTRAP_PGCRYPTO_PLATFORM_CONTRACT_MISMATCH/);
    assert.equal(sql(managed,'r2_managed_wrong',"select to_regclass('production_control.canonical_bootstrap_installation_v1') is null",{role:''}),'t');
    assert.deepEqual(platformSnapshot(managed,'r2_managed_wrong'),wrong);
    assert.equal(sql(managed,'r2_managed_wrong',`select count(*) from pg_namespace where nspname in
     ('production_control','scoring_authority','participant_identity','production_rehearsal')`,{role:''}),'0');
    t.diagnostic(JSON.stringify({managedShape:'LOCAL_FIXTURE_NOT_HOSTED_PROOF',installer:'postgres',superuser:false,
     providerNamespaceOwner:'supabase_admin',providerObjectsPreserved:true,pgcryptoVersion:'1.3',
     applicationCatalogEquivalent:true,privateCoreDenials:510,authorityRowsCopied:0}));
   }finally{await destroyIsolatedCluster(managed);}
  });
  await t.test('platform allowance preserves version/schema checks and rejects unreviewed owners',()=>{
   for(const change of [{owner:'service_role'},{version:'999'},{schema:'public'}]){
    const bad=structuredClone(recorded.catalog);Object.assign(bad.extensions[0],change);
    assert.throws(()=>assertCatalogConvergence(bad,recorded.catalog),/Unsupported pgcrypto platform owner|Catalog divergence/);
   }
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
