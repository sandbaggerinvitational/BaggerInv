// Test harness assurance, not application certification.
import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {existsSync,readFileSync,rmSync} from 'node:fs';
import path from 'node:path';
const root=process.cwd(),preload=path.join(root,'tools/reliability/p0f-proof-isolation.cjs');
test('P0F proof harness blocks Google/provider remote sockets before connection',()=>{
 const child=spawnSync(process.execPath,['--require',preload,'-e',`const assert=require('node:assert/strict');for(const host of ['sheets.googleapis.com','oauth2.googleapis.com','production.invalid'])for(const m of [require('node:net'),require('node:tls')])assert.throws(()=>m.connect({host,port:443}),/PHASE2_REMOTE_NETWORK_DENIED/);`],{encoding:'utf8'});
 assert.equal(child.status,0,child.stderr);
});
test('P0F proof outputs preserve all earlier reliability evidence',()=>{
 for(const phase of ['phase2','phase2c','phase2c1','phase2c1-closure']){
  const original=path.join(root,'docs/reliability',phase,'.p0f-output-selftest');
  const mapped=path.join(root,'docs/reliability/phase2c1-closure/evidence/p0f-approved/revalidation',phase,'.p0f-output-selftest');
  assert.equal(existsSync(original),false);assert.equal(existsSync(mapped),false);
  try{const child=spawnSync(process.execPath,['--require',preload,'-e',`require('node:fs').writeFileSync(process.argv[1],'synthetic-proof-only')`,original],{encoding:'utf8'});assert.equal(child.status,0,child.stderr);assert.equal(existsSync(original),false);assert.equal(readFileSync(mapped,'utf8'),'synthetic-proof-only');}finally{rmSync(mapped,{force:true});}
 }
});
test('P0F candidate proof includes opt-in migrations and prerequisite source hashes',()=>{
 const installer=readFileSync(path.join(root,'test/support/reliability/phase2c-install.mjs'),'utf8');
 assert.match(installer,/BAGGER_P0F_CANDIDATE==='1'&&through===124/);
 assert.match(installer,/\[128,129,130\]/);
 for(const file of ['director-calcutta-management-read-v1.sql','director-calcutta-clear-entry-v1.sql'])assert.ok(installer.includes(file));
 assert.match(installer,/P0F requires retirement/);assert.match(installer,/P0F requires annual closure/);
});
