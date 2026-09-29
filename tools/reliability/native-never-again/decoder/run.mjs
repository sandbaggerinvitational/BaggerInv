#!/usr/bin/env node
// NATIVE MODEL / INTEGRATION only. No app launch, network or shipping edits.
import assert from 'node:assert/strict';
import { readFile,writeFile,mkdir,mkdtemp,rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
const root=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(root,'../../../..');
assert.equal(process.argv.length,2,'No database, network target or source override accepted');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifestFile=path.join(root,'fixture-manifest.json');
const manifestBytes=await readFile(manifestFile),manifest=JSON.parse(manifestBytes);
const fixtureFile=path.join(repo,'docs/reliability/phase2c/evidence/recovery-proof.json');
const counterexampleFile=path.join(repo,'docs/reliability/phase2c/evidence/native-timezone-counterexample.json');
// Capture the exact bytes consumed by compilation/execution. A later receipt may
// not manufacture hashes for earlier runs or omit the assertions/runner itself.
const captured=new Map([[manifestFile,manifestBytes]]);
for(const file of [path.join(root,'run.mjs'),path.join(root,'main.swift'),fixtureFile,counterexampleFile])captured.set(file,await readFile(file));
assert.equal(manifest.files.length,12,'Exact retained model set');
for(const file of manifest.files){
 assert.match(file.path,/^Vendor\/[A-Za-z0-9]+\.swift$/);
 const source=path.join(root,file.path);assert.ok(!captured.has(source),'Unique input path');
 const bytes=await readFile(source);assert.equal(hash(bytes),file.sha256,file.path);captured.set(source,bytes);
}
const snapshot=inputs=>({capturedAt:new Date().toISOString(),files:[...inputs].map(([file,bytes])=>({path:path.relative(repo,file),sha256:hash(bytes)})).sort((a,b)=>a.path.localeCompare(b.path))});
const before=snapshot(captured);
const fixtureBytes=captured.get(fixtureFile),fixture=JSON.parse(fixtureBytes);
assert.equal(fixture.summary.failed,0,'Generate passing candidate SQL/API proof first');
assert.equal(fixture.production,false);
assert.equal(fixture.nativeResponses.length,3);
assert.deepEqual(fixture.nativeResponses.map(x=>x.format).sort(),['BB','SC','SI']);
const work=await mkdtemp(path.join(os.tmpdir(),'bagger-phase2c-native-decoder-'));
const env={PATH:process.env.PATH || '/usr/bin:/bin',HOME:process.env.HOME,
 TMPDIR:os.tmpdir(),LANG:'en_US.UTF-8',SWIFT_MODULECACHE_PATH:path.join(work,'cache')};
try {
 const source=[];
 for(const file of manifest.files){
  const bytes=captured.get(path.join(root,file.path));
  const target=path.join(work,path.basename(file.path));await writeFile(target,bytes);source.push(target);
 }
 await writeFile(path.join(work,'main.swift'),captured.get(path.join(root,'main.swift')));
 await writeFile(path.join(work,'fixture.json'),fixtureBytes);
 const swift=execFileSync('xcrun',['--find','swiftc'],{encoding:'utf8',env}).trim();
 const sdk=execFileSync('xcrun',['--sdk','macosx','--show-sdk-path'],{encoding:'utf8',env}).trim();
 const toolchain=execFileSync(swift,['--version'],{encoding:'utf8',env}).trim();
 execFileSync(swift,['-sdk',sdk,'-module-cache-path',path.join(work,'cache'),...source,path.join(work,'main.swift'),'-o',path.join(work,'decoder')],{env,timeout:120000,stdio:'pipe'});
 const stdout=execFileSync(path.join(work,'decoder'),[path.join(work,'fixture.json')],{encoding:'utf8',env,timeout:10000});
 const checks=JSON.parse(stdout);assert.equal(checks.length,24);assert.ok(checks.every(x=>x.result==='PASS'));
 const counterexampleBytes=captured.get(counterexampleFile);await writeFile(path.join(work,'counterexample.json'),counterexampleBytes);
 const rejected=spawnSync(path.join(work,'decoder'),[path.join(work,'counterexample.json')],{encoding:'utf8',env,timeout:10000});
 assert.equal(rejected.status,2);assert.match(rejected.stderr,/invalidTimestamp/);
 const knownLimitation={id:'P2C-NEW-TIMESTAMP-TIMEZONE',result:'EXPECTED_REJECTION_CONFIRMED',
  artifact:path.relative(repo,counterexampleFile),sha256:hash(counterexampleBytes),error:'invalidTimestamp',
  interpretation:'Non-UTC PostgreSQL timestamp offsets are unsupported by this unchanged native decoder; not a fixed defect'};
 const after=snapshot(new Map(await Promise.all([...captured.keys()].map(async file=>[file,await readFile(file)]))));
 const sourcesStable=JSON.stringify(before.files)===JSON.stringify(after.files);
 assert.equal(sourcesStable,true,'Decoder inputs changed during execution; no current PASS receipt');
 const sourceProvenance={contract:'phase2c-swift-decoder-inputs-v1',before,after,sourcesStable,result:'PASS'};
 const artifact={schemaVersion:1,sourceProvenance,sourcesStable,generatedAt:new Date().toISOString(),proofLayer:'INTEGRATION',executionRuntime:'SWIFT_MACOS_MODEL',production:false,
  shippingNativeChanged:false,physical:false,simulator:false,toolchain,sdk,native:manifest.pinnedNative,provenance:manifest.provenance,
  modelSources:manifest.files,fixture:{path:path.relative(repo,fixtureFile),sha256:hash(fixtureBytes),migrations:fixture.migrations},
  checks,knownLimitations:[knownLimitation],compatibilityCondition:'SQL session TimeZone=UTC',summary:{passed:checks.length,failed:0},limitations:[
   'Actual retained Swift JSONDecoder and request-compatibility guard, not MobileAPIClient HTTP/session/queue/UI execution',
   'No physical iPhone, simulator, hosted Auth, Production or end-to-end new recovery UX proof',
   'Compatibility proof is conditional on explicitly UTC database/session profile; nonUTC counterexample remains unresolved',
   'Shipping Build10 does not consume the new mutation-status route',
   'Build10 lineage is supported by retained contemporaneous provenance report; pinned native Git object unavailable'
  ]};
 const destination=path.join(repo,'docs/reliability/phase2c/evidence/native-decoder-proof.json');
 await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,JSON.stringify(artifact,null,2)+'\n');
 console.log(JSON.stringify({result:'PASS',checks:checks.length,artifact:path.relative(repo,destination),proofLayer:artifact.proofLayer}));
}finally{await rm(work,{recursive:true,force:true});}
