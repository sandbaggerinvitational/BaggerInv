// Read-only Phase2C evidence provenance. Parses local source; never imports it.
// Dynamic fixture construction has explicit declared roots/data below. This is
// dependency freshness, not a claim that static analysis knows all runtime edges.
import assert from 'node:assert/strict';
import {readFile,readdir,realpath,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';
const own='tools/reliability/phase2c-source-provenance.mjs';
const version='phase2c-source-provenance-v1';
const code=/\.(?:[cm]?js|jsx|ts|tsx)$/;
const digest=b=>createHash('sha256').update(b).digest('hex');
const explicit={
 'test/step13e7b-production-annual-normal-release-rebind-postgres.integration.test.mjs':[
  'test/option2-production-maintenance-precommit-deployment-rebind-postgres.integration.test.mjs',
  'test/fixtures/step13e7b-production-annual-normal-release-rebind.sql'],
 'test/reliability-phase2c-annual-admission.integration.test.mjs':[
  'test/step13e7b-production-annual-normal-release-rebind-postgres.integration.test.mjs',
  'test/support/reliability/phase2c-future-score-fixture.mjs',
  'test/support/reliability/phase2c-annual-history.mjs',
  'test/support/reliability/phase2c-audit-index-plans.mjs',
  'test/support/reliability/phase2c-final-publication-plans.mjs'],
 'test/reliability-phase2c-net-owner-lock-order.test.mjs':['docs/reliability/phase2c/evidence/net-owner-control-before-definitions.json'],
 'test/reliability-phase2c-calcutta-lock-order.test.mjs':['docs/reliability/phase2c/evidence/calcutta-current-job-before-definitions.json'],
 'test/reliability-phase2c-annual-workers.integration.test.mjs':['docs/reliability/phase2c/evidence/annual-sql-before.json'],
 'test/support/reliability/release139-schema.mjs':[
  'candidates/scored-match-resume.sql',
  'supabase/production_incremental/net-skins-sql-expressions-v1.sql',
  'supabase/production_incremental/calcutta-exact-job-activation-recovery-v1.sql'],
};
export async function capturePhase2CSourceProvenance({repositoryRoot,entryPoints,through=124,scope='TEST',declaredFiles=[]}){
 assert.ok([121,124].includes(through));assert.ok(['TEST','BENCHMARK','LOCK_BENCHMARK','BUILD','APPLICATION'].includes(scope));
 const root=await realpath(repositoryRoot),paths=new Set(),edges=[],dynamicImports=[],externalImports=new Set();
 const safe=async file=>{assert.equal(typeof file,'string');assert.ok(file&&!path.isAbsolute(file)&&!file.split('/').includes('..'),'repository-relative input required');const resolved=await realpath(path.join(root,file));assert.ok(resolved.startsWith(root+path.sep),'dependency must remain in repository');return resolved;};
 const parserPath='node_modules/next/dist/compiled/babel/parser.js',bundlePath='node_modules/next/dist/compiled/babel/bundle.js';
 // Existing locked Next distribution supplies the parser; no dependency install.
 const require=createRequire(path.join(root,'package.json'));const parser=require(await safe(parserPath));
 const parserManifest=await Promise.all([parserPath,bundlePath].map(async file=>({path:file,sha256:digest(await readFile(await safe(file)))})));
 const roots=[...new Set(entryPoints)].sort();assert.ok(scope==='BUILD'||roots.length>0,'actual entry points required');
 const declarations=new Set([own,'package.json','package-lock.json','tools/reliability/phase2-network-deny.cjs',...declaredFiles]);
 for(const name of await readdir(path.join(root,'supabase/production_migrations'))){
  if(/^\d+_.*\.sql$/.test(name)&&name<=(through===121?'202609280121_\uffff':'202609280124_\uffff'))declarations.add('supabase/production_migrations/'+name);
 }
 const listTree=async relative=>{for(const name of await readdir(await safe(relative))){const file=relative+'/'+name;const kind=await stat(await safe(file));if(kind.isDirectory())await listTree(file);else if(code.test(name)||name.endsWith('.json'))declarations.add(file);}};
 if(['BUILD','APPLICATION'].includes(scope)){await listTree('app');await listTree('lib');for(const file of ['next.config.js','next.config.mjs','jsconfig.json']){try{await safe(file);declarations.add(file);}catch(e){if(e.code!=='ENOENT')throw e;}}}
 const sourceMap=new Map();
 const literal=n=>n?.type==='StringLiteral'?n.value:n?.type==='Literal'&&typeof n.value==='string'?n.value:null;
 const resolveImport=async(from,specifier)=>{
  if(!specifier.startsWith('.')&&!specifier.startsWith('@/')){externalImports.add(specifier);return null;}
  const relative=specifier.startsWith('@/')?specifier.slice(2):path.posix.normalize(path.posix.join(path.posix.dirname(from),specifier));
  assert.ok(!path.posix.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('../'),'relative import escapes repository');
  for(const file of [relative,...['.js','.mjs','.cjs','.jsx','.ts','.tsx','.json'].map(s=>relative+s),...['index.js','index.mjs','index.ts'].map(s=>relative+'/'+s)]){
   try{if((await stat(await safe(file))).isFile())return file;}catch(error){if(!['ENOENT','ENOTDIR'].includes(error.code))throw error;}
  }
  throw new Error('Unresolved static local import '+from+' -> '+specifier);
 };
 async function visit(file){
  if(paths.has(file))return;paths.add(file);const bytes=await readFile(await safe(file));sourceMap.set(file,digest(bytes));
  for(const declared of explicit[file]||[]){declarations.add(declared);edges.push({from:file,to:declared,kind:'DECLARED_DYNAMIC_OR_DATA'});await visit(declared);}
  if(!code.test(file))return;
  const tree=parser.parse(bytes.toString('utf8'),{sourceType:'unambiguous',plugins:['jsx','typescript','importAttributes'],allowReturnOutsideFunction:true});
  const imports=[];
  function walk(n){
   if(!n||typeof n!=='object')return;
   if(['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(n.type)&&literal(n.source)!==null)imports.push({value:literal(n.source),kind:'STATIC_MODULE'});
   if(n.type==='CallExpression'&&(n.callee?.type==='Import'||n.callee?.type==='Identifier'&&n.callee.name==='require')){
    const value=literal(n.arguments?.[0]);if(value!==null)imports.push({value,kind:'LITERAL_DYNAMIC_MODULE'});else dynamicImports.push({path:file,start:n.start,end:n.end,expressionSha256:digest(bytes.subarray(n.start,n.end))});
   }
   if(n.type==='ImportExpression'){const value=literal(n.source);if(value!==null)imports.push({value,kind:'LITERAL_DYNAMIC_MODULE'});else dynamicImports.push({path:file,start:n.start,end:n.end,expressionSha256:digest(bytes.subarray(n.start,n.end))});}
   if(n.type==='NewExpression'&&n.callee?.name==='URL'&&literal(n.arguments?.[0])!==null&&code.test(literal(n.arguments[0]))&&n.arguments?.[1]?.type==='MemberExpression'&&n.arguments[1].object?.type==='MetaProperty')imports.push({value:literal(n.arguments[0]),kind:'LOCAL_CHILD_URL'});
   for(const[key,v]of Object.entries(n))if(!['loc','tokens','comments'].includes(key)){if(Array.isArray(v))for(const child of v)walk(child);else if(v&&typeof v==='object')walk(v);}
  }
  walk(tree);
  for(const item of imports){const target=await resolveImport(file,item.value);if(target){edges.push({from:file,to:target,kind:item.kind});await visit(target);}}
 }
 for(const file of roots)await visit(file);for(const file of [...declarations].sort())await visit(file);
 const edgeKey=v=>`${v.from}:${v.to}:${v.kind}`;
 return{contract:version,capturedAt:new Date().toISOString(),scope,through,entryPoints:roots,declaredFiles:[...declarations].sort(),
 files:[...sourceMap].sort(([a],[b])=>a.localeCompare(b)).map(([file,sha256])=>({file,sha256})),
 edges:[...new Map(edges.map(v=>[edgeKey(v),v])).values()].sort((a,b)=>edgeKey(a).localeCompare(edgeKey(b))),
 dynamicImports:dynamicImports.sort((a,b)=>a.path.localeCompare(b.path)||a.start-b.start),externalImports:[...externalImports].sort(),parserManifest,
 limitations:['Static AST edges and explicit declared dynamic/data roots, not arbitrary runtime tracing. Computed imports are retained for engineering review.','External package versions are bound through package-lock and parser bytes; this does not hash every installed npm file.']};
}
export function completePhase2CSourceProvenance(before,after){
 const comparable=v=>{const{capturedAt,...rest}=v;return JSON.stringify(rest);};
 return{contract:version,before,after,stable:comparable(before)===comparable(after),result:comparable(before)===comparable(after)?'PASS':'SOURCE_CHANGED_DURING_EXECUTION'};
}
