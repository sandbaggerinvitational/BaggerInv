import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import os from 'node:os';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {canonicalDependencyRecords,assertPortableCatalogConvergence,assertPortableInstallationReceipt} from './portable-canonical-catalog.mjs';
import {assertCatalogConvergence,readCanonicalArtifacts,validateCanonicalArtifacts} from './canonical-bootstrap-artifacts.mjs';
import {createIsolatedCluster,createDatabase,destroyIsolatedCluster,sql,repositoryRoot} from '../../test/support/reliability/postgres17.mjs';

const edge=(dependent,referenced,type='n')=>({dependent,referenced,type});
const model={extensions:[{name:'pgcrypto',version:'1.3',schema:'extensions',owner:'postgres'}],
 functions:[{identity:'public.example()',owner:'postgres',definer:true,searchPath:['search_path=pg_catalog'],acl:['postgres=X/postgres']}],
 dependencies:[edge('constraint alpha_v1_check','column alpha of table example','a'),edge('function example()','schema public')]};
const evidence=path.join(repositoryRoot,'docs/reliability/phase2d-catalog-validation-portability/evidence');
const clone=value=>structuredClone(value);

test('NA-CATALOG-COLLATION: dependency order is not topological; old comparator reproduces false failure',()=>{
 const actual=clone(model);actual.dependencies.reverse();
 assert.throws(()=>assertCatalogConvergence(actual,model),/Catalog divergence/);
 assert.doesNotThrow(()=>assertPortableCatalogConvergence(actual,model));
});
test('canonicalization preserves complete records, multiplicity and inputs',()=>{
 const records=[{...model.dependencies[1],extra:{value:['z','a']}},model.dependencies[0],model.dependencies[0]];
 const before=clone(records),sorted=canonicalDependencyRecords(records);
 assert.deepEqual(records,before);assert.equal(sorted.length,3);
 assert.equal(sorted.filter(row=>row===model.dependencies[0]).length,2);
 assert.deepEqual(sorted.find(row=>row.extra).extra,{value:['z','a']});
});
test('JSON object field insertion order cannot alter identity',()=>{
 const actual=clone(model);actual.dependencies=actual.dependencies.map(({dependent,referenced,type})=>({type,referenced,dependent}));
 assert.doesNotThrow(()=>assertPortableCatalogConvergence(actual,model));
});
for(const [name,change]of [
 ['removed dependency',c=>c.dependencies.pop()],
 ['unexpected dependency',c=>c.dependencies.push(edge('function new()','schema public'))],
 ['changed dependency field',c=>c.dependencies[0].type='i'],
 ['duplicate/multiplicity added',c=>c.dependencies.push(clone(c.dependencies[0]))],
 ['wrong dependent object',c=>c.dependencies[0].dependent='constraint wrong_check'],
 ['wrong referenced object',c=>c.dependencies[0].referenced='column wrong of table example'],
 ['additional dependency field',c=>c.dependencies[0].unexpected='must not be discarded'],
])test('negative catalog proof detects '+name,()=>{
 const actual=clone(model);change(actual);
 assert.throws(()=>assertPortableCatalogConvergence(actual,model),/Catalog divergence/);
});
test('duplicate/multiplicity removed is detected even when distinct-record set is unchanged',()=>{
 const expected=clone(model);expected.dependencies.push(clone(expected.dependencies[0]));
 assert.throws(()=>assertPortableCatalogConvergence(model,expected),/Catalog divergence/);
});
test('malformed dependency inventories fail closed',()=>{
 for(const dependencies of [null,{},[null],['not an edge']]){
  assert.throws(()=>assertPortableCatalogConvergence({...model,dependencies},model),/Dependency/);
 }
});
test('all nondependency authority/security fields remain strict',()=>{
 for(const [field,value]of [['owner','service_role'],['definer',false],['searchPath',['search_path=public']],['acl',['=X/postgres']]]){
  const actual=clone(model);actual.functions[0][field]=value;
  assert.throws(()=>assertPortableCatalogConvergence(actual,model),/Catalog divergence/);
 }
 const actual=clone(model);actual.extraSection=[];
 assert.throws(()=>assertPortableCatalogConvergence(actual,model),/Catalog divergence/);
});
test('existing pgcrypto platform allowance stays narrowly bounded',()=>{
 const allowed=clone(model);allowed.extensions[0].owner='supabase_admin';
 assert.doesNotThrow(()=>assertPortableCatalogConvergence(allowed,model));
 for(const change of [{owner:'service_role'},{version:'999'},{schema:'public'}]){
  const actual=clone(model);Object.assign(actual.extensions[0],change);
  assert.throws(()=>assertPortableCatalogConvergence(actual,model),/Unsupported pgcrypto|Catalog divergence/);
 }
});
test('preserved hosted ICU catalog matches all 12994 records; old ordered comparator rejects it',async()=>{
 const provenance=JSON.parse(await readFile(path.join(evidence,'input-provenance.json'),'utf8'));
 const compressed=await readFile(path.join(evidence,'hosted-catalog-readback.json.gz'));
 assert.equal(createHash('sha256').update(compressed).digest('hex'),provenance.compressedCatalogSha256);
 const raw=gunzipSync(compressed);
 assert.equal(createHash('sha256').update(raw).digest('hex'),provenance.rawCatalogSha256);
 const actual=JSON.parse(raw),bundle=await readCanonicalArtifacts();
 assert.equal(actual.dependencies.length,12994);
 assert.throws(()=>assertCatalogConvergence(actual,bundle.catalog),/Catalog divergence/);
 assert.doesNotThrow(()=>assertPortableCatalogConvergence(actual,bundle.catalog));
 const hashes=await validateCanonicalArtifacts(bundle);
 const receipts=JSON.parse(await readFile(path.join(evidence,'installed-receipt.json'),'utf8'));
 assertPortableInstallationReceipt(receipts,hashes,bundle.manifest.contract);
});
test('receipt checks remain exact; no rewrite or artifact-hash relaxation',async()=>{
 const bundle=await readCanonicalArtifacts(),hashes=await validateCanonicalArtifacts(bundle);
 const receipts=JSON.parse(await readFile(path.join(evidence,'installed-receipt.json'),'utf8'));
 assertPortableInstallationReceipt(receipts,hashes,bundle.manifest.contract);
 for(const field of ['contract_version','manifest_sha256','schema_sha256','static_data_sha256']){
  const wrong=clone(receipts);wrong[0][field]='wrong';
  assert.throws(()=>assertPortableInstallationReceipt(wrong,hashes,bundle.manifest.contract),/differs/);
 }
 assert.throws(()=>assertPortableInstallationReceipt([...receipts,...receipts],hashes,bundle.manifest.contract),/Exactly one/);
});
test('logical order normalization never relaxes the expected artifact byte identity',async()=>{
 const bundle=await readCanonicalArtifacts();bundle.catalog.dependencies.reverse();
 await assert.rejects(validateCanonicalArtifacts(bundle),/catalog artifact hash mismatch/);
});
test('actual PostgreSQL17 C and ICU en-US ordering compare identically; genuine defects still fail',async t=>{
 const cluster=await createIsolatedCluster();
 try{
  createDatabase(cluster,'catalog_no_locale');
  sql(cluster,'postgres',"create database catalog_icu template template0 locale_provider icu icu_locale 'en-US'",{role:''});
  const bundle=await readCanonicalArtifacts(),reference=bundle.catalog;
  const literal="'"+JSON.stringify(reference.dependencies).replaceAll("'","''")+"'";
  const query=`select jsonb_agg(value order by value::text) from jsonb_array_elements(${literal}::jsonb)value;`;
  const c=JSON.parse(sql(cluster,'catalog_no_locale',query,{role:''}));
  const icu=JSON.parse(sql(cluster,'catalog_icu',query,{role:''}));
  assert.notDeepEqual(c,icu,'Fixture must exercise a real ordering difference');
  const shapes={};
  for(const [database,dependencies]of [['catalog_no_locale',c],['catalog_icu',icu]]){
   shapes[database]=JSON.parse(sql(cluster,database,"select jsonb_build_object('collation',datcollate,'provider',datlocprovider,'locale',datlocale)from pg_database where datname=current_database()",{role:''}));
   assert.doesNotThrow(()=>assertPortableCatalogConvergence({...reference,dependencies},reference));
   for(const change of [d=>d.pop(),d=>d.push(edge('wrong object','wrong reference')),d=>d[0].type='changed',d=>d.push(clone(d[0])),d=>d[0].dependent='wrong object',d=>d[0].referenced='wrong reference']){
    const bad=clone(dependencies);change(bad);
    assert.throws(()=>assertPortableCatalogConvergence({...reference,dependencies:bad},reference),/Catalog divergence/);
   }
  }
  assert.equal(shapes.catalog_no_locale.provider,'c');assert.equal(shapes.catalog_no_locale.collation,'C');
  assert.equal(shapes.catalog_icu.provider,'i');assert.equal(shapes.catalog_icu.locale,'en-US');
  t.diagnostic(JSON.stringify({postgresql:sql(cluster,'postgres','show server_version',{role:''}),shapes,records:reference.dependencies.length,identicalRecords:'PASS',negativeCasesPerCollation:6,hostedAccess:false}));
 }finally{await destroyIsolatedCluster(cluster);}
});
test('offline CLI validates catalog/receipt and fails changed catalog without any remote operation',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'bagger-catalog-validator-'));
 try{
  const actual=JSON.parse(gunzipSync(await readFile(path.join(evidence,'hosted-catalog-readback.json.gz'))));
  const actualFile=path.join(directory,'catalog.json'),receiptFile=path.join(evidence,'installed-receipt.json');
  await writeFile(actualFile,JSON.stringify(actual));
  const args=['tools/reliability/validate-canonical-catalog.mjs','--actual',actualFile,'--receipt',receiptFile];
  const run=()=>spawnSync(process.execPath,args,{cwd:repositoryRoot,encoding:'utf8',env:{PATH:process.env.PATH||'',NODE_OPTIONS:process.env.NODE_OPTIONS||''}});
  const pass=run();assert.equal(pass.status,0,pass.stderr);
  const report=JSON.parse(pass.stdout);assert.equal(report.status,'PASS');assert.equal(report.remoteAccess,false);
  actual.dependencies[0].referenced='wrong object';await writeFile(actualFile,JSON.stringify(actual));
  const fail=run();assert.equal(fail.status,1);assert.match(JSON.parse(fail.stderr).error,/Catalog divergence/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
