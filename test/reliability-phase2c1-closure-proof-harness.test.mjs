// Proof layer: FAILURE_INJECTION / UNIT. No remote traffic or historical writes.
import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {readFileSync,existsSync,rmSync} from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const preload=path.join(root,'tools/reliability/phase2c1-closure-proof-isolation.cjs');
test('FAILURE_INJECTION remote Google and provider sockets are denied before connect',()=>{
 const child=spawnSync(process.execPath,['--require',preload,'-e',`const assert=require('node:assert/strict');for(const host of ['sheets.googleapis.com','oauth2.googleapis.com','www.googleapis.com','production.example.invalid'])for(const module of [require('node:net'),require('node:tls')])assert.throws(()=>module.connect({host,port:443}),/PHASE2_REMOTE_NETWORK_DENIED/);`],{encoding:'utf8'});
 assert.equal(child.status,0,child.stderr);
});
test('UNIT historical proof paths redirect writes without changing baseline evidence',()=>{
 const original=path.join(root,'docs/reliability/phase2c1/.closure-isolation-selftest');
 const mapped=path.join(root,'docs/reliability/phase2c1-closure/evidence/revalidation/phase2c1/.closure-isolation-selftest');
 assert.equal(existsSync(original),false);assert.equal(existsSync(mapped),false);
 try {const child=spawnSync(process.execPath,['--require',preload,'-e',`require('node:fs').writeFileSync(process.argv[1],'synthetic-proof-only')`,original],{encoding:'utf8'});assert.equal(child.status,0,child.stderr);assert.equal(existsSync(original),false);assert.equal(readFileSync(mapped,'utf8'),'synthetic-proof-only');}finally{rmSync(mapped,{force:true});}
});
