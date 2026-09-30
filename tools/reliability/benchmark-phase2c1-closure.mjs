#!/usr/bin/env node
// PERFORMANCE: owned disposable PostgreSQL only; no target or network override.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync, execFileSync } from 'node:child_process';
import path from 'node:path';
import { repositoryRoot } from '../../test/support/reliability/postgres17.mjs';
import {capturePhase2CSourceProvenance,completePhase2CSourceProvenance} from './phase2c-source-provenance.mjs';
assert.equal(process.argv.length,2,'No target or override accepted');
const dir=path.join(repositoryRoot,'docs/reliability/phase2c1-closure/evidence');await mkdir(dir,{recursive:true});
const env={...process.env};for(const key of Object.keys(env))if(/SUPABASE|VERCEL|GOOGLE|DATABASE_URL|DIRECT_URL|PGHOST|PGPASSWORD|PGSERVICE|PRODUCTION_|PREVIEW_|TOKEN|SECRET|PASSWORD|API_KEY|CREDENTIAL/i.test(key))delete env[key];
env.NODE_OPTIONS=`--require ${path.join(repositoryRoot,'tools/reliability/phase2c1-closure-proof-isolation.cjs')}`;
env.NEXT_TELEMETRY_DISABLED='1';env.BAGGER_PHASE2C1_CANDIDATE='1';env.BAGGER_PHASE2C1_CLOSURE='1';
const provenanceOptions={repositoryRoot,entryPoints:['tools/reliability/benchmark-phase2c.mjs'],through:124,scope:'BENCHMARK',declaredFiles:['tools/reliability/benchmark-phase2c1-closure.mjs','tools/reliability/phase2c1-closure-proof-isolation.cjs','supabase/production_migrations/202609300127_canonical_annual_create_contract_v1.sql']};
const before=await capturePhase2CSourceProvenance(provenanceOptions);
const startedAt=new Date().toISOString(),batches=[];
// Fixed counterbalanced orders; no cache flush is claimed. Seed remains inherited deterministic fixture seed.
for(const [index,order]of ['5,1,10,2','2,10,1,5','10,5,2,1'].entries()){
 const number=index+1;const batchEnv={...env,BAGGER_CLOSURE_BENCHMARK_BATCH:String(number)};
 const result=spawnSync(process.execPath,['tools/reliability/benchmark-phase2c.mjs','--mode','candidate','--kind','common','--samples','1000','--scales',order],{cwd:repositoryRoot,env:batchEnv,encoding:'utf8',timeout:900000,maxBuffer:32*1024*1024});
 await writeFile(path.join(dir,`benchmark-batch-${number}.log`),(result.stdout||'')+(result.stderr||''));
 assert.equal(result.status,0,result.stderr);
 const file=`benchmark-batch-${number}/revalidation/phase2c/benchmark-candidate-common.json`;
 const artifact=JSON.parse(await readFile(path.join(dir,file),'utf8'));
 assert.equal(artifact.result,'PASS');assert.ok(artifact.candidate.migrations.some(m=>m.path.includes('0127_')),'Closure127 must be installed');
 batches.push({batch:number,order,artifact:file,scales:artifact.scales,environment:artifact.environment,fixture:artifact.fixture,candidate:artifact.candidate,limitations:artifact.limitations});
 console.log(JSON.stringify({batch:number,result:'PASS',samples:4000,scales:artifact.scales.map(s=>({scale:s.scale,...s.branches[0]}))}));
}
const provenance=completePhase2CSourceProvenance(before,await capturePhase2CSourceProvenance(provenanceOptions));
assert.equal(provenance.stable,true,'Benchmark source changed');
const baseline=JSON.parse(await readFile(path.join(repositoryRoot,'docs/reliability/phase2c1/benchmark-results.json'),'utf8'));
await writeFile(path.join(dir,'benchmark-results.json'),JSON.stringify({schemaVersion:1,environment:'LOCAL_NON_PRODUCTION',production:false,startedAt,completedAt:new Date().toISOString(),executionHead:execFileSync('git',['rev-parse','HEAD'],{cwd:repositoryRoot,encoding:'utf8'}).trim(),sourceProvenance:provenance,result:'PASS',batchCount:3,samples:12000,batches,baseline:baseline.comparison,method:'Inherited rolled-back SQL RPC, 1000 accepted samples per scale per batch. Orders counterbalanced. No Production traffic.',limitations:['Local cache and operating-system scheduling are not controlled. No Production capacity claim.','Durable COMMIT and HTTP latency not measured by this benchmark.','Lock duration is not separately measured; no fabricated lock percentile.']},null,2)+'\n');
