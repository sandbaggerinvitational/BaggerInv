// Deterministic compiler of committed artifacts. Never accepts a database URL.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createCalcuttaQueueFixture} from '../../test/support/reliability/certification-calcutta-queue-fixture.mjs';
import {sqlFile,repositoryRoot,destroyIsolatedCluster,sql} from '../../test/support/reliability/postgres17.mjs';
import {canonicalCatalog,dumpCanonicalSchema,dumpStaticContracts,assertCatalogConvergence,serialize} from './canonical-bootstrap-artifacts.mjs';
export const modelDDirectory=repositoryRoot+'/supabase/model_d_bootstrap';
export const modelDForwardArtifacts=Object.freeze([
 'calcutta-empty-auction-demand-v1.sql','certification-stale-context-error-v1.sql',
 'certification-worker-supervision-v1.sql','certification-worker-queue-supervision-v2.sql',
 'certification-queue-preview-publisher-v3.sql','certification-queue-safeupdate-v4.sql','certification-queue-global-fault-v5.sql',
 'certification-queue-retry-envelope-v6.sql','certification-queue-routing-closure-v7.sql',
 'certification-derived-attempt-cycle-v1.sql','certification-net-skins-configuration-v1.sql','certification-queue-calcutta-scope-v1.sql',
 'certification-calcutta-publication-v1.sql','certification-net-skins-result-read-v1.sql','certification-net-skins-calculation-v1.sql',
 'certification-odds-input-configuration-v1.sql','certification-model-d-execution-v1.sql',
].map(n=>'supabase/production_incremental/'+n));
const digest=value=>createHash('sha256').update(value).digest('hex');
export async function compileModelDImage(){
 const f=await createCalcuttaQueueFixture({emptyAuction:false});
 try{
 for(const file of modelDForwardArtifacts.slice(12))sqlFile(f.cluster,f.database,repositoryRoot+'/'+file,{role:''});
 const catalog=await canonicalCatalog(f.cluster,f.database),schema=await dumpCanonicalSchema(f.cluster,f.database,catalog),staticData=dumpStaticContracts(f.cluster,f.database).sql;
 const base=JSON.parse(await readFile(repositoryRoot+'/supabase/canonical_bootstrap/manifest.json'));
 const sources=await Promise.all(['supabase/canonical_bootstrap/manifest.json','supabase/canonical_bootstrap/schema.sql',
 'supabase/canonical_bootstrap/static-contracts.sql',...modelDForwardArtifacts].map(async path=>({path,sha256:digest(await readFile(repositoryRoot+'/'+path))})));
 const manifest={contract:'bagger-model-d-bootstrap-v1',baseSha:'4d263b3a284ec2feab9f242777d42f3bf01d6ede',
 baseManifest:base,sourceFiles:sources,authorityRowsCopied:0,registrationPerformed:false,
 historicalInstallationRowsCopied:0,forwardHistory:modelDForwardArtifacts,
 artifacts:{schema:digest(schema),staticData:digest(staticData),catalog:digest(serialize(catalog))},
 platformPrerequisites:['PostgreSQL17','managed Auth tables and roles','pgcrypto 1.3 in extensions'],
 compiler:'committed base image + reviewed forward history; owned socket-only reference; no hosted export'};
 await mkdir(modelDDirectory,{recursive:true});
 for(const [name,text]of[['schema.sql',schema],['static-contracts.sql',staticData],['catalog-manifest.json',serialize(catalog)],['manifest.json',serialize(manifest)]])await writeFile(modelDDirectory+'/'+name,text);
 return{functions:catalog.functions.length,catalogSections:Object.keys(catalog),manifest:digest(serialize(manifest))};
 }finally{await destroyIsolatedCluster(f.cluster);}
}
export async function readModelDImage(){
 const [schema,staticData,catalogText,manifestText]=await Promise.all(['schema.sql','static-contracts.sql','catalog-manifest.json','manifest.json'].map(n=>readFile(modelDDirectory+'/'+n,'utf8')));
 const manifest=JSON.parse(manifestText),catalog=JSON.parse(catalogText);
 assert.equal(manifest.contract,'bagger-model-d-bootstrap-v1');assert.equal(manifest.authorityRowsCopied,0);
 for(const [name,text]of Object.entries({schema,staticData,catalog:catalogText}))assert.equal(digest(text),manifest.artifacts[name]);
 for(const source of manifest.sourceFiles)assert.equal(digest(await readFile(repositoryRoot+'/'+source.path)),source.sha256,source.path);
 return{schema,staticData,catalog,manifest,manifestDigest:digest(manifestText)};
}
export async function installModelDImage(cluster,database,{failure=null}={}){
 const b=await readModelDImage(),q=text=>sql(cluster,database,text,{role:''});
 assert.ok([null,'after-schema','after-static'].includes(failure));
 if(q("select to_regclass('production_control.canonical_bootstrap_installation_v1')is not null")==='t'){
 assert.equal(q('select manifest_sha256 from production_control.canonical_bootstrap_installation_v1'),b.manifestDigest);
 assert.equal(q('select schema_sha256 from production_control.canonical_bootstrap_installation_v1'),b.manifest.artifacts.schema);
 assert.equal(q('select static_data_sha256 from production_control.canonical_bootstrap_installation_v1'),b.manifest.artifacts.staticData);
 assertCatalogConvergence(await canonicalCatalog(cluster,database),b.catalog);return{replayed:true};}
 assert.equal(q("select count(*)from pg_namespace where nspname in('participant_identity','production_control','scoring_authority','production_rehearsal')"),'0');
 const fault=where=>failure===where?"do $$begin raise exception 'MODEL_D_INSTALL_INJECTED_FAILURE';end$$;":'';
 q(`begin;${b.schema}${fault('after-schema')}${b.staticData}${fault('after-static')}
 insert into production_control.canonical_bootstrap_installation_v1(contract_version,manifest_sha256,schema_sha256,static_data_sha256)
 values('bagger-canonical-bootstrap-v1','${b.manifestDigest}','${b.manifest.artifacts.schema}','${b.manifest.artifacts.staticData}');commit;`);
 assertCatalogConvergence(await canonicalCatalog(cluster,database),b.catalog);return{replayed:false};
}
