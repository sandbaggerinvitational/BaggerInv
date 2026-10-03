// Local schema compiler only. No supplied DSN, environment project, hosted
// client, migration deployment or application deployment is supported.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createCanonicalCompilerFixture} from '../../test/support/reliability/phase2d-resource-bootstrap.mjs';
import {destroyIsolatedCluster} from '../../test/support/reliability/postgres17.mjs';
import {artifactDirectory,buildCanonicalArtifacts,serialize} from './canonical-bootstrap-artifacts.mjs';

const args=process.argv.slice(2);const forwardMigrations=[];let mode='inspect';
for(let index=0;index<args.length;index++){
 const arg=args[index];
 if(arg==='--forward'){assert.ok(args[index+1],'--forward requires a repository SQL path');forwardMigrations.push(args[++index]);}
 else if(arg==='--write'||arg==='--check'){assert.equal(mode,'inspect','Choose one mode');mode=arg.slice(2);}
 else throw new Error(`Unsupported argument: ${arg}`);
}
if(mode==='check'&&forwardMigrations.length===0){
 const recorded=JSON.parse(await readFile(path.join(artifactDirectory,'manifest.json'),'utf8'));
 forwardMigrations.push(...recorded.forwardMigrations);
}
assert.ok(forwardMigrations.length,'Explicit reviewed forward migration list is required');
let fixture;
try{
 fixture=await createCanonicalCompilerFixture({forwardMigrations});
 const bundle=await buildCanonicalArtifacts(fixture,{write:mode==='write'});
 if(mode==='check')for(const[file,actual]of[['schema.sql',bundle.schema],['static-contracts.sql',bundle.staticData],
  ['catalog-manifest.json',serialize(bundle.catalog)],['manifest.json',serialize(bundle.manifest)]]){
  assert.equal(actual,await readFile(path.join(artifactDirectory,file),'utf8'),`${file} is not reproducible`);
 }
 console.log(JSON.stringify({mode,environment:'OWNED_LOCAL_POSTGRESQL17',sourceFiles:bundle.manifest.sourceFiles.length,
  functions:bundle.catalog.functions.length,artifacts:bundle.manifest.artifacts,authorityRowsCopied:0,hostedAccess:false}));
}finally{if(fixture)await destroyIsolatedCluster(fixture.cluster);}
