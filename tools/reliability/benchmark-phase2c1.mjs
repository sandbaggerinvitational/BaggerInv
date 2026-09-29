#!/usr/bin/env node
// PERFORMANCE: exact inherited methodology; output isolated, provider access denied.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {spawnSync,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {repositoryRoot} from '../../test/support/reliability/postgres17.mjs';
assert.equal(process.argv.length,2,'No remote target or override is accepted');
const directory=path.join(repositoryRoot,'docs/reliability/phase2c1/evidence');await mkdir(directory,{recursive:true});
const migrations=(await readdir(path.join(repositoryRoot,'supabase/production_migrations'))).filter(n=>/^20260929012[56]_/.test(n));assert.equal(migrations.length,2);
const snapshot=async()=>Promise.all(migrations.map(async file=>({file,sha256:createHash('sha256').update(await readFile(path.join(repositoryRoot,'supabase/production_migrations',file))).digest('hex')})));
const before=await snapshot(),env={...process.env};for(const key of Object.keys(env))if(/SUPABASE|VERCEL|GOOGLE|DATABASE_URL|DIRECT_URL|PGHOST|PGPASSWORD|PGSERVICE|PRODUCTION_|PREVIEW_|TOKEN|SECRET|PASSWORD|API_KEY|CREDENTIAL/i.test(key))delete env[key];
env.NODE_OPTIONS=`--require ${path.join(repositoryRoot,'tools/reliability/phase2c1-proof-isolation.cjs')}`;env.NEXT_TELEMETRY_DISABLED='1';env.BAGGER_PHASE2C1_CANDIDATE='1';
const startedAt=new Date().toISOString();
const result=spawnSync(process.execPath,['tools/reliability/benchmark-phase2c.mjs','--mode','candidate','--kind','common','--samples','1000','--scales','5,1,10,2'],{cwd:repositoryRoot,env,encoding:'utf8',timeout:900000,maxBuffer:32*1024*1024});
await writeFile(path.join(directory,'benchmark-common.log'),(result.stdout||'')+(result.stderr||''));
const artifact=JSON.parse(await readFile(path.join(directory,'revalidation/phase2c/benchmark-candidate-common.json'),'utf8'));
const after=await snapshot();assert.deepEqual(after,before,'Retirement migrations changed during measurement');
assert.equal(result.status,0,result.stderr);assert.equal(artifact.result,'PASS');
assert.ok(artifact.candidate.migrations.some(m=>m.path.includes('0126_')),'Candidate must actually install retirement126');
const historical=JSON.parse(await readFile(path.join(repositoryRoot,'docs/reliability/phase2c/benchmark-candidate-common.json'),'utf8'));
const comparison=artifact.scales.map(s=>{const prior=historical.scales.find(b=>b.scale===s.scale).branches[0],now=s.branches[0];return {scale:s.scale,before:prior,after:now,medianRatio:now.p50Ms/prior.p50Ms,interpretation:'Different local run/time; empirical comparison, not causal improvement or Production capacity'};});
await writeFile(path.join(repositoryRoot,'docs/reliability/phase2c1/benchmark-results.json'),JSON.stringify({schemaVersion:1,environment:'LOCAL_NON_PRODUCTION_POSTGRESQL17',startedAt,completedAt:new Date().toISOString(),executionHead:execFileSync('git',['rev-parse','HEAD'],{cwd:repositoryRoot,encoding:'utf8'}).trim(),migrations:before,samples:4000,result:'PASS',methodologyArtifact:'evidence/revalidation/phase2c/benchmark-candidate-common.json',comparison,limitations:artifact.limitations,lockDuration:'NOT_MEASURED_SEPARATELY',transactionDuration:'RPC_MEASURED; DURABLE_COMMIT_NOT_PROVEN',production:false},null,2)+'\n');
console.log(JSON.stringify({result:'PASS',samples:4000,scales:comparison.map(s=>({scale:s.scale,p50:s.after.p50Ms,p95:s.after.p95Ms,p99:s.after.p99Ms,max:s.after.maxMs,ratio:s.medianRatio}))},null,2));
