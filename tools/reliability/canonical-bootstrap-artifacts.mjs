// Owned local PostgreSQL17 compiler/artifact helpers. No hosted connection API.
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {
 postgresBin,repositoryRoot,sql,
} from '../../test/support/reliability/postgres17.mjs';
import {
 canonicalSchemas,staticContractTables,canonicalBootstrapBaseSha,canonicalBootstrapContract,
 canonicalBootstrapProfile,excludedOptionalArtifacts,digest,
} from '../../test/support/reliability/phase2d-resource-bootstrap.mjs';

export const artifactDirectory=path.join(repositoryRoot,'supabase/canonical_bootstrap');
export function stableJson(value){
 if(Array.isArray(value))return value.map(stableJson);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stableJson(value[key])]));
 return value;
}
export const serialize=value=>JSON.stringify(stableJson(value),null,2)+'\n';
export function assertCatalogConvergence(actual,expected){
 const differences=[];
 for(const section of new Set([...Object.keys(actual),...Object.keys(expected)])){
  if(serialize(actual[section])===serialize(expected[section]))continue;
  const a=actual[section],e=expected[section];
  const first=Array.isArray(a)&&Array.isArray(e)?a.findIndex((row,index)=>serialize(row)!==serialize(e[index])):null;
  differences.push({section,actualCount:a?.length,expectedCount:e?.length,firstDifference:first,
   actual:first===null?a:a[first],expected:first===null?e:e[first]});
 }
 assert.equal(differences.length,0,`Catalog divergence: ${JSON.stringify(differences).slice(0,14000)}`);
}
const safeLiteral=value=>"'"+String(value).replaceAll("'","''")+"'";
const safeIdentifier=value=>'"'+String(value).replaceAll('"','""')+'"';
function ownedTool(cluster,database,name,args,{input}={}){
 // The existing helper verifies its private ownership marker before any child.
 assert.equal(sql(cluster,database,'select current_database()',{role:''}),database);
 assert.ok(['pg_dump','pg_restore'].includes(name));
 const env={PATH:process.env.PATH||'',PGHOST:cluster.socket,PGPORT:String(cluster.port),PGUSER:'postgres',PGDATABASE:database,PGOPTIONS:''};
 const result=spawnSync(path.join(postgresBin,name),args,{cwd:repositoryRoot,env,encoding:'utf8',input,maxBuffer:128*1024*1024});
 if(result.error||result.status!==0)throw new Error(`${name} failed (${result.status}): ${result.stderr||result.error}`);
 return result.stdout;
}
export async function canonicalCatalog(cluster,database){
 const query=await readFile(path.join(artifactDirectory,'catalog.sql'),'utf8');
 const catalog=JSON.parse(sql(cluster,database,query,{role:''}));
 // Keep exact body equivalence in a hash; artifacts don't need a duplicate SQL dump.
 for(const fn of catalog.functions){fn.definitionSha256=digest(fn.definition);delete fn.definition;}
 return stableJson(catalog);
}
export async function dumpCanonicalSchema(cluster,database){
 const archive=path.join(cluster.directory,'canonical.dump');
 const tocFile=path.join(cluster.directory,'canonical.list');
 try{
  ownedTool(cluster,database,'pg_dump',['--format=custom','--schema-only','--extension=pgcrypto','--file',archive,
   ...[...canonicalSchemas,'public','extensions'].map(schema=>'--schema='+schema)]);
  const toc=ownedTool(cluster,database,'pg_restore',['--list',archive]);
  // Supabase owns its public RLS automation function. It is a local platform shim,
  // never an application definition; preserve the target platform implementation.
  const filtered=toc.split('\n').filter(line=>
   !/\b(?:FUNCTION|ACL) public (?:FUNCTION )?rls_auto_enable\(/.test(line)
   && !/\bSCHEMA - public /.test(line));
  await writeFile(tocFile,filtered.join('\n'));
  let schema=ownedTool(cluster,database,'pg_restore',['--schema-only','--no-comments','--use-list',tocFile,'--file','-',archive]);
  schema=schema.replace(/^\\(?:un)?restrict .+\n/gm,'')
   .replace(/^-- Dumped (?:from|by).+\n/gm,'').replace(/^-- Started on .+\n/gm,'').replace(/^-- Completed on .+\n/gm,'');
  assert.ok(!schema.includes('CREATE FUNCTION public.rls_auto_enable('),'Platform shim leaked into baseline');
  assert.ok(!/^\\connect\b/m.test(schema),'No target-changing psql command');
  // Auth is platform-owned and excluded from dump. Only application-owned
  // triggers on its tables are appended, preserving their exact functions/state.
  const triggers=JSON.parse(sql(cluster,database,`select coalesce(jsonb_agg(jsonb_build_object(
   'definition',pg_get_triggerdef(t.oid,false),'table',n.nspname||'.'||c.relname,'name',t.tgname,'enabled',t.tgenabled)
   order by c.relname,t.tgname),'[]') from pg_trigger t join pg_class c on c.oid=t.tgrelid
   join pg_namespace n on n.oid=c.relnamespace join pg_proc p on p.oid=t.tgfoid join pg_namespace fn on fn.oid=p.pronamespace
   where not t.tgisinternal and n.nspname='auth' and fn.nspname in('participant_identity','production_control','scoring_authority')`,{role:''}));
  schema+='\n-- Application-owned Auth triggers; managed Auth schema is a prerequisite.\n';
  for(const trigger of triggers){
   schema+=trigger.definition+';\n';
   if(trigger.enabled!=='O'){
    const mode={D:'DISABLE',A:'ENABLE ALWAYS',R:'ENABLE REPLICA'}[trigger.enabled];assert.ok(mode);
    schema+=`ALTER TABLE ${trigger.table} ${mode} TRIGGER ${safeIdentifier(trigger.name)};\n`;
   }
  }
  return '-- Generated final canonical definitions. No resource, tournament, activation or job data.\n'+schema.trim()+'\n';
 }finally{await Promise.all([rm(archive,{force:true}),rm(tocFile,{force:true})]);}
}
export function dumpStaticContracts(cluster,database){
 let result='-- Explicit immutable contract data only. No authority or tournament seeds.\n';const records=[];
 for(const table of staticContractTables){
  assert.match(table,/^[a-z_]+\.[a-z0-9_]+$/);
  const columns=JSON.parse(sql(cluster,database,`select jsonb_agg(a.attname order by a.attnum)
   from pg_attribute a where a.attrelid=${safeLiteral(table)}::regclass and a.attnum>0 and not a.attisdropped
   and a.attname not in('installed_at','created_at','updated_at','certified_at','captured_at')`,{role:''}));
  assert.ok(columns.length>0);const list=columns.map(safeIdentifier).join(',');
  const data=JSON.parse(sql(cluster,database,`select coalesce(jsonb_agg(value order by value::text),'[]') from(
   select to_jsonb(selected) value from(select ${list} from ${table})selected)ordered`,{role:''}));
  const json=JSON.stringify(data);
  result+=`\nINSERT INTO ${table} (${list})\nSELECT ${list} FROM jsonb_populate_recordset(NULL::${table},${safeLiteral(json)}::jsonb);\n`;
  records.push({table,columns,rowCount:data.length,rowsSha256:digest(json)});
 }
 return{sql:result,records};
}
export async function buildCanonicalArtifacts(fixture,{write=false}={}){
 const {cluster,database}=fixture;
 const schema=await dumpCanonicalSchema(cluster,database);const contracts=dumpStaticContracts(cluster,database);
 const catalog=await canonicalCatalog(cluster,database);const catalogText=serialize(catalog);
 const toolSources=await Promise.all(['tools/reliability/canonical-bootstrap-artifacts.mjs',
  'tools/reliability/generate-canonical-bootstrap.mjs','test/support/reliability/phase2d-resource-bootstrap.mjs',
  'test/support/reliability/release139-schema.mjs','test/support/reliability/postgres17.mjs',
  'supabase/canonical_bootstrap/catalog.sql','supabase/canonical_bootstrap/source-profile.json']
  .map(async file=>({path:file,sha256:digest(await readFile(path.join(repositoryRoot,file)))})));
 const manifest={contract:canonicalBootstrapContract,profile:canonicalBootstrapProfile,baseSha:canonicalBootstrapBaseSha,
  compiler:{purpose:'OWNED_LOCAL_SCHEMA_REFERENCE_ONLY',platform:'POSTGRESQL17',serverVersion:sql(cluster,database,'show server_version',{role:''}),
   includesHistoricalSyntheticProductionSeeds:true,copiesAuthorityData:false},
  sourceFiles:fixture.sourceManifest,toolSources,excludedOptionalArtifacts,
  artifacts:{schema:{path:'supabase/canonical_bootstrap/schema.sql',sha256:digest(schema)},
   staticData:{path:'supabase/canonical_bootstrap/static-contracts.sql',sha256:digest(contracts.sql)},
   catalog:{path:'supabase/canonical_bootstrap/catalog-manifest.json',sha256:digest(catalogText)}},
  staticTables:contracts.records,forwardMigrations:fixture.forwardMigrations,
  platformPrerequisites:['PostgreSQL17','Supabase-managed auth.users/auth.identities/auth.role()','anon/authenticated/service_role roles','postgres application owner','pgcrypto extension'],
  authorityRowsCopied:0,registrationPerformed:false,productionAccess:false,hostedAccess:false};
 if(write){
  const profile=JSON.parse(await readFile(path.join(artifactDirectory,'source-profile.json'),'utf8'));
  assert.equal(profile.status,'REVIEWED_COMPLETE','Complete reviewed resource-model profile required before emitting baseline');
  assert.equal(profile.profile,canonicalBootstrapProfile);
  assert.deepEqual(fixture.forwardMigrations,profile.forwardMigrations,'Partial or different forward migration profile');
  await mkdir(artifactDirectory,{recursive:true});
  await writeFile(path.join(artifactDirectory,'schema.sql'),schema);
  await writeFile(path.join(artifactDirectory,'static-contracts.sql'),contracts.sql);
  await writeFile(path.join(artifactDirectory,'catalog-manifest.json'),catalogText);
  await writeFile(path.join(artifactDirectory,'manifest.json'),serialize(manifest));
 }
 return{schema,staticData:contracts.sql,catalog,manifest};
}

export async function readCanonicalArtifacts(){
 const manifest=JSON.parse(await readFile(path.join(artifactDirectory,'manifest.json'),'utf8'));
 const [schema,staticData,catalogText]=await Promise.all(['schema.sql','static-contracts.sql','catalog-manifest.json']
  .map(file=>readFile(path.join(artifactDirectory,file),'utf8')));
 return{manifest,schema,staticData,catalog:JSON.parse(catalogText)};
}

export async function validateCanonicalArtifacts(bundle){
 const {manifest,schema,staticData,catalog}=bundle;
 assert.equal(manifest.contract,canonicalBootstrapContract);
 assert.equal(manifest.profile,canonicalBootstrapProfile);
 assert.equal(manifest.baseSha,canonicalBootstrapBaseSha);
 assert.equal(manifest.authorityRowsCopied,0);
 assert.equal(manifest.registrationPerformed,false);
 assert.ok(manifest.forwardMigrations.length>=1,'A historical-only schema is not a canonical resource bootstrap');
 for(const [name,text] of [['schema',schema],['staticData',staticData],['catalog',serialize(catalog)]])
  assert.equal(digest(text),manifest.artifacts[name].sha256,`${name} artifact hash mismatch`);
 for(const entry of [...manifest.sourceFiles,...manifest.toolSources]){
  assert.ok(!path.isAbsolute(entry.path)&&!entry.path.split('/').includes('..'));
  assert.equal(digest(await readFile(path.join(repositoryRoot,entry.path))),entry.sha256,`${entry.path} source hash mismatch`);
 }
 assert.deepEqual(manifest.staticTables.map(row=>row.table),staticContractTables);
 assert.ok(!/^\\(?:connect|include|i|ir)\b/m.test(schema),'Baseline cannot change target or include external SQL');
 assert.ok(!schema.includes('CREATE FUNCTION public.rls_auto_enable('),'Baseline cannot replace managed platform function');
 return{manifestSha256:digest(serialize(manifest)),schemaSha256:digest(schema),staticDataSha256:digest(staticData)};
}

export function canonicalTableCounts(cluster,database){
 const tables=JSON.parse(sql(cluster,database,`select coalesce(jsonb_agg(n.nspname||'.'||c.relname order by n.nspname,c.relname),'[]')
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in('r','p')
  and n.nspname in('participant_identity','production_control','production_rehearsal','scoring_authority')`,{role:''}));
 return Object.fromEntries(tables.map(table=>[table,Number(sql(cluster,database,`select count(*) from ${table}`,{role:''}))]));
}

// Deliberately accepts only an owned disposable cluster object, never a URL or
// credentials. Hosted installation requires the separately reviewed runbook.
export async function installCanonicalBaseline(cluster,database,bundle,{injectFailureAt=null}={}){
 const hashes=await validateCanonicalArtifacts(bundle);
 const ledger='production_control.canonical_bootstrap_installation_v1';
 assert.ok([null,'after-schema','after-static','before-commit'].includes(injectFailureAt));
 const ledgerExists=sql(cluster,database,`select to_regclass('${ledger}') is not null`,{role:''})==='t';
 if(ledgerExists){
  const row=JSON.parse(sql(cluster,database,`select coalesce((select to_jsonb(i) from ${ledger} i
   where contract_version=${safeLiteral(canonicalBootstrapContract)}),'null')`,{role:''}));
  assert.ok(row,'Existing application schema has no matching bootstrap receipt');
  assert.equal(row.manifest_sha256,hashes.manifestSha256,'Installed manifest differs');
  assert.equal(row.schema_sha256,hashes.schemaSha256,'Installed schema artifact differs');
  assert.equal(row.static_data_sha256,hashes.staticDataSha256,'Installed static artifact differs');
  assertCatalogConvergence(await canonicalCatalog(cluster,database),bundle.catalog);
  return{replayed:true,...hashes};
 }
 assert.equal(sql(cluster,database,`select count(*) from pg_namespace where nspname in(
  'participant_identity','production_control','production_rehearsal','scoring_authority')`,{role:''}),'0','Fresh target application schemas must be absent');
 assert.equal(sql(cluster,database,`select to_regclass('auth.users') is not null and to_regclass('auth.identities') is not null
  and to_regprocedure('auth.role()') is not null and (select count(*) from pg_roles where rolname in('anon','authenticated','service_role'))=3`,{role:''}),'t','Managed platform prerequisites required');
 const fault=boundary=>injectFailureAt===boundary?`do $$begin raise exception 'BOOTSTRAP_INJECTED_FAILURE:${boundary}';end$$;`:'';
 const ledgerInsert=`insert into ${ledger}(contract_version,manifest_sha256,schema_sha256,static_data_sha256)
  values(${safeLiteral(canonicalBootstrapContract)},${safeLiteral(hashes.manifestSha256)},${safeLiteral(hashes.schemaSha256)},${safeLiteral(hashes.staticDataSha256)});`;
 sql(cluster,database,`begin;\n${bundle.schema}\n${fault('after-schema')}\n${bundle.staticData}\n${fault('after-static')}\n${ledgerInsert}\n${fault('before-commit')}\ncommit;`,{role:''});
 assertCatalogConvergence(await canonicalCatalog(cluster,database),bundle.catalog);
 const allowed=new Set([...staticContractTables,ledger]);
 const nonemptyAuthority=Object.entries(canonicalTableCounts(cluster,database)).filter(([table,count])=>count>0&&!allowed.has(table));
 assert.deepEqual(nonemptyAuthority,[],'Fresh bootstrap must never copy application authority or history rows');
 return{replayed:false,...hashes};
}
