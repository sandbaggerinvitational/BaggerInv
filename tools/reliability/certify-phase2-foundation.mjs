#!/usr/bin/env node
// Retest unchanged Phase1 safeguards without rewriting its historical ledger.
import {spawnSync,execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {repositoryRoot} from '../../test/support/reliability/postgres17.mjs';
const mode=process.argv[2]||'unit';
if(!['unit','sql','build'].includes(mode)||process.argv.length>3)throw Error('unit, sql, or build only; no remote target accepted');
const files= mode==='unit' ? [
 'reliability-preservation','reliability-observability','reliability-observability-review',
 'reliability-observability-api','reliability-telemetry-protected-equivalence',
 'reliability-diagnostic-policy','reliability-diagnostic-cli','reliability-diagnostic-adapter',
 'reliability-native','reliability-readback','reliability-benchmark-harness',
 'reliability-benchmark-safety','reliability-benchmark-results','reliability-query-plan-evidence',
 'reliability-phase2-performance-gate','reliability-phase2-application-comparison'
].map(v=>`test/${v}.test.mjs`) : mode==='sql' ? [
 'test/reliability-sql-never-again-postgres.integration.test.mjs',
 'test/reliability-score-history-postgres.integration.test.mjs',
 'test/reliability-correlation-postgres.integration.test.mjs'
] : [];
const env={...process.env};
for(const k of Object.keys(env))if(/SUPABASE|VERCEL|GOOGLE|DATABASE_URL|DIRECT_URL|PGHOST|PGPASSWORD|PGSERVICE|PRODUCTION_|PREVIEW_|TOKEN|SECRET|PASSWORD|API_KEY|CREDENTIAL/i.test(k))delete env[k];
env.NEXT_TELEMETRY_DISABLED='1';env.NODE_OPTIONS=`--require ${path.join(repositoryRoot,'tools/reliability/phase2-network-deny.cjs')}`;
const startedAt=new Date().toISOString();
const args=mode==='build'?['node_modules/next/dist/bin/next','build']:['--test','--test-reporter=tap','--test-concurrency=1',...files];
const run=spawnSync(process.execPath,args,{cwd:repositoryRoot,env,encoding:'utf8',maxBuffer:64*1024*1024,timeout:1200000});
const output=(run.stdout||'')+(run.stderr||'');
const rawPath=`/private/tmp/bagger-phase2-${mode}.log`;await writeFile(rawPath,output);
const counts=mode==='build'?null:Object.fromEntries(['tests','pass','fail','skipped','cancelled'].map(k=>[k,Number(output.match(new RegExp(`^# ${k} (\\d+)$`,'m'))?.[1]??NaN)]));
const evidence={schemaVersion:1,mode,startedAt,endedAt:new Date().toISOString(),baseSha:execFileSync('git',['rev-parse','HEAD'],{cwd:repositoryRoot,encoding:'utf8'}).trim(),environment:'LOCAL_ONLY',remoteNetwork:'DENIED_AT_NET_TLS_SOCKET',production:false,files:await Promise.all(files.map(async file=>({file,sha256:createHash('sha256').update(await readFile(path.join(repositoryRoot,file))).digest('hex')}))),exitCode:run.status,error:run.error?.code||null,counts,result:run.status===0?'PASS':'FAIL',rawPath,rawSha256:createHash('sha256').update(output).digest('hex'),limitations:mode==='sql'?['Unchanged Phase1 SQL fixtures install baseline schema; Phase2 candidate proofs are separate.']:mode==='build'?['Compilation only, not hosted deployment.']:['Mock API/transport plus local unit/integration tests, not hosted or physical.','Native expected-red remediations remain; skips are not physical proof.']};
await writeFile(path.join(repositoryRoot,`docs/reliability/phase2/evidence/foundation-${mode}.json`),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({mode,result:evidence.result,counts,rawPath},null,2));
process.exitCode=run.status===0?0:1;
