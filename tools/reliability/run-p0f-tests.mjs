#!/usr/bin/env node
// Local proof only: no target arguments, remote sockets denied, credentials scrubbed.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {spawnSync,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {capturePhase2CSourceProvenance,completePhase2CSourceProvenance} from './phase2c-source-provenance.mjs';
import {repositoryRoot} from '../../test/support/reliability/postgres17.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const baseSha='7b6ca99510dc2f44cc411bfe7769e7f0c05ed962';
const suites={
 routing:['test/reliability-phase2c1-closure-routing.test.mjs','test/step10b-production-shadow-read-routing.test.mjs','test/step11-pwa-network-boundaries.test.mjs','test/step10b-production-shadow-auth-boundary.test.mjs','test/step10b-production-shadow-scoring-read-only.test.mjs'],
 api:['test/reliability-p0f-operations-api.test.mjs'],
 workspace:['test/reliability-p0f-director-workspace.test.mjs'],
 context:['test/reliability-p0f-isolated-context.integration.test.mjs'],
 setup:['test/reliability-p0f-setup-control.integration.test.mjs'],
 financial:['test/reliability-p0f-financial.integration.test.mjs'],
 capabilities:['test/reliability-p0f-operations.integration.test.mjs'],
 retirement:['test/reliability-phase2c1-runtime.test.mjs','test/reliability-phase2c1-history.test.mjs','test/reliability-phase2c1-delivery-retirement.test.mjs'],
 security:['test/reliability-phase2c1-identity-fail-closed.test.mjs','test/participant-identity-cutover.test.mjs','test/preview-impersonation-lease-security.test.mjs','test/participant-phone-otp-controlled-preview.test.mjs','test/preview-director-entitlement.test.mjs'],
 release:['test/reliability-phase2c1-release-admission.integration.test.mjs'],
 'annual-create':['test/reliability-phase2c1-closure-annual-create.integration.test.mjs'],
 'full-sequence':['test/reliability-phase2c-full-sequence.integration.test.mjs'],
 finite:['test/reliability-phase2c-finite-timeout.integration.test.mjs'],
 recovery:['test/reliability-phase2c-recovery.test.mjs','test/reliability-phase2c-recovery.integration.test.mjs','test/reliability-phase2c-recovery-upgrade.integration.test.mjs'],
 delivery:['test/reliability-phase2c-worker.test.mjs'],
 deadlock:['test/reliability-phase2c-net-skins-deadlock.integration.test.mjs'],
 annual:['test/reliability-phase2c-annual-workers.integration.test.mjs'],
 harness:['test/reliability-p0f-proof-harness.test.mjs'],
 application:[],build:[]
};
const suite=process.argv[2];
assert.ok(Object.hasOwn(suites,suite)&&process.argv.length===3,'Known local suite only; no database/network targets');
const files=suite==='application'?JSON.parse(await readFile(path.join(repositoryRoot,'docs/reliability/phase2/evidence/application-selection.json'),'utf8')):suites[suite];
if(suite==='application')assert.equal(files.length,493,'Frozen broad selection');
const env={...process.env};
for(const key of Object.keys(env))if(/SUPABASE|VERCEL|GOOGLE|SHEETS|DRIVE|WORKBOOK|SERVICE_ACCOUNT|DATABASE_URL|DIRECT_URL|^PG|PRODUCTION_|PREVIEW_|TOKEN|SECRET|PASSWORD|API_KEY|CREDENTIAL|BAGGER_PHASE|BAGGER_P0F|BAGGER_CLOSURE/i.test(key))delete env[key];
env.NODE_OPTIONS=`--require ${path.join(repositoryRoot,'tools/reliability/p0f-proof-isolation.cjs')}`;
env.NEXT_TELEMETRY_DISABLED='1';
env.BAGGER_PHASE2C1_CANDIDATE='1';env.BAGGER_PHASE2C1_CLOSURE='1';
// Dedicated P0F suites install each migration explicitly for before/after proof.
if(['full-sequence','finite','recovery','delivery','deadlock','annual','annual-create','release'].includes(suite))env.BAGGER_P0F_CANDIDATE='1';
if(suite==='annual-create')env.BAGGER_P0F_ANNUAL_CONTRACT='1';
if(suite==='recovery')env.BAGGER_PHASE2C_CANDIDATE='1';
if(['deadlock','annual'].includes(suite))env.BAGGER_PHASE2C_FULL='1';
if(suite==='delivery')env.BAGGER_PHASE2C_WORKER_EVIDENCE='docs/reliability/phase2c/evidence/worker-delivery-results.json';
const directory=path.join(repositoryRoot,'docs/reliability/phase2c1-closure/evidence/p0f-approved');
await mkdir(directory,{recursive:true});
const changedPaths=()=>[...execFileSync('git',['diff','--name-only',baseSha],{cwd:repositoryRoot,encoding:'utf8'}).split('\n'),...execFileSync('git',['ls-files','--others','--exclude-standard'],{cwd:repositoryRoot,encoding:'utf8'}).split('\n')].filter(f=>/^(?:app|lib|supabase|test|tools)\//.test(f));
const snapshot=async()=>Promise.all([...new Set(changedPaths())].sort().map(async file=>({file,sha256:await readFile(path.join(repositoryRoot,file)).then(hash).catch(e=>{if(e.code==='ENOENT')return 'DELETED';throw e;})})));
const migrations=(await readdir(path.join(repositoryRoot,'supabase/production_migrations'))).filter(n=>/^\d{8}01(?:2[5-9]|30)_/.test(n)).map(n=>'supabase/production_migrations/'+n);
const declaredFiles=['tools/reliability/run-p0f-tests.mjs','tools/reliability/p0f-proof-isolation.cjs',...migrations,
 ...['director-calcutta-management-read-v1.sql','director-calcutta-clear-entry-v1.sql'].map(n=>'supabase/production_incremental/'+n)];
if(['release','annual-create'].includes(suite))declaredFiles.push(
 'test/support/reliability/p0f-production-equivalence.mjs','test/support/reliability/p0f-protected-financial.mjs',
 'test/support/reliability/phase2c1-annual-initialization.mjs','test/support/reliability/phase2c1-closure-annual-create.mjs',
 'test/reliability-phase2c1-release-admission.integration.test.mjs',
 'test/step13e7b-production-annual-normal-release-rebind-postgres.integration.test.mjs',
 'test/fixtures/reliability-phase2c1-annual-release.sql');
const options={repositoryRoot,entryPoints:files,through:124,declaredFiles,scope:suite==='build'?'BUILD':suite==='application'?'APPLICATION':'TEST'};
const before=await snapshot(),provenanceBefore=await capturePhase2CSourceProvenance(options);
const startedAt=new Date().toISOString();
const args=suite==='build'?['node_modules/next/dist/bin/next','build']:['--conditions=react-server','--test','--test-reporter=tap','--test-concurrency=1',...files];
const run=spawnSync(process.execPath,args,{cwd:repositoryRoot,env,encoding:'utf8',maxBuffer:128*1024*1024,timeout:1800000});
const raw=(run.stdout||'')+(run.stderr||'');
const counts=suite==='build'?null:Object.fromEntries(['tests','pass','fail','skipped','cancelled'].map(k=>[k,Number(raw.match(new RegExp(`^# ${k} (\\d+)$`,'m'))?.[1]??NaN)]));
const failures=[...raw.matchAll(/^not ok \d+ - (.+)\n([\s\S]*?)(?=^(?:ok|not ok|# Subtest:|1\.\.|# tests )|$(?![\s\S]))/gm)].map(m=>({name:m[1],diagnostic:m[2].replaceAll(repositoryRoot,'<CHECKOUT>').replace(/duration_ms: [\d.]+/g,'duration_ms: <TIME>').slice(0,6000)}));
const after=await snapshot(),sourceProvenance=completePhase2CSourceProvenance(provenanceBefore,await capturePhase2CSourceProvenance(options));
const sourcesStable=JSON.stringify(before)===JSON.stringify(after)&&sourceProvenance.stable;
const receipt={schemaVersion:1,suite,startedAt,completedAt:new Date().toISOString(),baseSha,executionHead:execFileSync('git',['rev-parse','HEAD'],{cwd:repositoryRoot,encoding:'utf8'}).trim(),environment:'LOCAL_NON_PRODUCTION',remoteNetwork:'DENIED_AT_NET_TLS_SOCKET',credentials:'REMOVED_FROM_CHILD_ENV',production:false,staging:false,sourceProvenance,implementationSourceManifest:before,sourcesStable,candidateMigrationsOptIn:env.BAGGER_P0F_CANDIDATE==='1',counts,exitCode:run.status,error:run.error?.code||null,failures,result:!sourcesStable?'NOT_PROVEN_SOURCE_CHANGED':run.status===0?'PASS':'FAIL',rawArtifact:`${suite}.tap`,rawSha256:hash(raw),limitations:['Proof layers and explicit substitutions are defined by each test; no hosted or physical proof.',...(suite==='application'?['Frozen493-file application comparison; new P0F suites are separate, not counted twice.']:[])]};
await writeFile(path.join(directory,`${suite}.tap`),raw);
await writeFile(path.join(directory,`${suite}.json`),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({suite,result:receipt.result,counts,error:receipt.error,failures:failures.map(v=>v.name)},null,2));
process.exitCode=run.status===0&&sourcesStable?0:1;
