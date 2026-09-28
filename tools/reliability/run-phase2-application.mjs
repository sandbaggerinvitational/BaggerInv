#!/usr/bin/env node
// Runs the identical retained application selection in exact Phase1 and candidate checkouts.
import assert from 'node:assert/strict';
import {compareApplicationEvidence} from './phase2-application-comparison.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {repositoryRoot} from '../../test/support/reliability/postgres17.mjs';
const mode=process.argv[2];assert.ok(['baseline','candidate'].includes(mode)&&process.argv.length===3);
const root=mode==='baseline'?path.resolve(process.env.BAGGER_PHASE1_BASELINE_ROOT||'/Users/claybeltran/.codex/worktrees/reliability-phase1/BaggerInv'):repositoryRoot;
const head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
if(mode==='baseline')assert.equal(head,'184b5c65a8e63784e1af8d38121fa2e16a015628');
const manifest=await readFile(path.join(repositoryRoot,'docs/reliability/phase2/evidence/application-selection.json'),'utf8');
const files=JSON.parse(manifest);assert.equal(files.length,493);
const env={...process.env};
for(const key of Object.keys(env))if(/SUPABASE|VERCEL|GOOGLE|DATABASE_URL|DIRECT_URL|PGHOST|PGPASSWORD|PGSERVICE|PRODUCTION_|PREVIEW_|TOKEN|SECRET|PASSWORD|API_KEY|CREDENTIAL/i.test(key))delete env[key];
env.NODE_OPTIONS=`--require ${path.join(repositoryRoot,'tools/reliability/phase2-network-deny.cjs')}`;
env.NEXT_TELEMETRY_DISABLED='1';
const result=spawnSync(process.execPath,['--conditions=react-server','--test','--test-reporter=tap','--test-concurrency=1',...files],{cwd:root,env,encoding:'utf8',maxBuffer:128*1024*1024,timeout:600000});
const text=(result.stdout||'')+(result.stderr||'');
const rawPath=`/private/tmp/bagger-phase2-application-${mode}.tap`;
await writeFile(rawPath,text);
const counts=Object.fromEntries(['tests','pass','fail','cancelled','skipped','todo','duration_ms'].map(key=>[key,Number(text.match(new RegExp(`^# ${key} ([0-9.]+)$`,'m'))?.[1]??NaN)]));
const failureBlocks=[...text.matchAll(/^not ok \d+ - (.+)\n([\s\S]*?)(?=^(?:ok|not ok|# Subtest:|1\.\.|# tests )|$(?![\s\S]))/gm)].map(m=>({name:m[1],diagnostic:m[2].replaceAll(root,'<CHECKOUT>').replace(/duration_ms: [\d.]+/g,'duration_ms: <TIME>').slice(0,5000)}));
const evidence={schemaVersion:1,mode,head,generatedAt:new Date().toISOString(),selectionCount:files.length,manifestSha256:createHash('sha256').update(manifest).digest('hex'),counts,exitCode:result.status,error:result.error?.code||null,
 remoteNetwork:'DENIED_AT_NET_TLS_SOCKET',credentials:'REMOVED_FROM_CHILD_ENV',rawPath,rawSha256:createHash('sha256').update(text).digest('hex'),failures:failureBlocks};
await writeFile(path.join(repositoryRoot,`docs/reliability/phase2/evidence/application-${mode}.json`),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({mode,counts,failures:failureBlocks.map(f=>f.name),exitCode:result.status},null,2));
if(result.error || !Number.isFinite(counts.tests))process.exitCode=1;

if (mode==='candidate') {
 const baseline=JSON.parse(await readFile(path.join(repositoryRoot,'docs/reliability/phase2/evidence/application-baseline.json'),'utf8'));
 const comparison=compareApplicationEvidence(baseline,evidence);
 await writeFile(path.join(repositoryRoot,'docs/reliability/phase2/evidence/application-comparison.json'),JSON.stringify(comparison,null,2)+'\n');
 if(comparison.result==='FAIL') process.exitCode=1;
 console.log(JSON.stringify({comparison:comparison.result,newFailures:comparison.newFailureNames,review:comparison.changedDiagnostics}));
}
