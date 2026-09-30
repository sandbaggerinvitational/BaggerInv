#!/usr/bin/env node
// Isolated evidence runner; remote sockets denied and provider secrets removed.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {spawnSync,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {capturePhase2CSourceProvenance,completePhase2CSourceProvenance} from './phase2c-source-provenance.mjs';
import {repositoryRoot} from '../../test/support/reliability/postgres17.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const suites={
 'director-odds-publication':['test/reliability-phase2c1-closure-odds.integration.test.mjs'],
 'boundaries':['test/reliability-phase2c1-closure-boundaries.test.mjs'],
 'annual-create':['test/reliability-phase2c1-closure-annual-create.integration.test.mjs'],
 'director':['test/reliability-phase2c1-closure-director.test.mjs'],
 'director-preview':['test/reliability-phase2c1-closure-preview.integration.test.mjs'],
 'director-odds':['test/reliability-phase2c1-closure-odds-inputs.test.mjs'],
 'director-capabilities':['test/step13e6-production-tournament-setup-postgres.integration.test.mjs','test/net-skins-entries-postgres.integration.test.mjs','test/calcutta-clear-postgres.integration.test.mjs','test/step13e3-production-director-private-operations-postgres.integration.test.mjs'],
 'annual-client':['test/reliability-phase2c1-closure-annual-hash.test.mjs','test/reliability-phase2c1-closure-annual-client.test.mjs','test/step13e7-production-future-year-administration-application.test.mjs','test/step13e7-production-future-year-administration-ui.test.mjs','test/step13e7a-production-future-runtime-application.test.mjs'],
 'annual-odds-contract':['test/step13e7b1-production-annual-odds.test.mjs'],
 'harness':['test/reliability-phase2c1-closure-proof-harness.test.mjs'],
 'routing-safety':['test/reliability-phase2c1-closure-routing.test.mjs'],
 'routing':['test/step10b-production-shadow-read-routing.test.mjs','test/step11-pwa-network-boundaries.test.mjs'],
 'retirement-release':['test/reliability-phase2c1-release-admission.integration.test.mjs'],
 'retirement-security':['test/reliability-phase2c1-identity-fail-closed.test.mjs','test/participant-identity-cutover.test.mjs','test/preview-impersonation-lease-security.test.mjs','test/participant-phone-otp-controlled-preview.test.mjs','test/preview-director-entitlement.test.mjs'],
 'retirement-sql':['test/reliability-phase2c1-closure-retirement-postgres.integration.test.mjs'],
 'boot':['test/reliability-phase2c1-boot.integration.test.mjs'],
 retirement:['test/reliability-phase2c1-closure-proof-harness.test.mjs','test/reliability-phase2c1-runtime.test.mjs','test/reliability-phase2c1-history.test.mjs','test/reliability-phase2c1-delivery-retirement.test.mjs'],
 canonical:['test/reliability-phase2-score-proof.integration.test.mjs'],
 derived:['test/reliability-phase2-derived-proof.integration.test.mjs'],
 index:['test/reliability-phase2-fence-history.test.mjs'],
 recovery:['test/reliability-phase2c-recovery.test.mjs','test/reliability-phase2c-recovery.integration.test.mjs','test/reliability-phase2c-recovery-upgrade.integration.test.mjs'],
 annual:['test/reliability-phase2c-annual-workers.integration.test.mjs'],
 'annual-admission':['test/reliability-phase2c-annual-admission.integration.test.mjs'],
 'phase2c-unit':['test/reliability-phase2c-performance-gate.test.mjs','test/reliability-phase2c-recovery.test.mjs'],
 deadlock:['test/reliability-phase2c-net-skins-deadlock.integration.test.mjs'],
 delivery:['test/reliability-phase2c-worker.test.mjs'],
 'worker-lock-order':['test/reliability-phase2c-worker-lock-order.test.mjs'],
 'worker-failure-lock-order':['test/reliability-phase2c-worker-failure-lock-order.test.mjs'],
 'net-owner-lock-order':['test/reliability-phase2c-net-owner-lock-order.test.mjs'],
 'calcutta-lock-order':['test/reliability-phase2c-calcutta-lock-order.test.mjs'],
 'worker-history':['test/reliability-phase2c-worker-history.test.mjs'],
 'delivery-index-review':['test/reliability-phase2c-delivery-index-review.test.mjs'],
 'full-sequence':['test/reliability-phase2c-full-sequence.integration.test.mjs'],
 'backlog-tail':['test/reliability-phase2c-backlog-tail.integration.test.mjs'],
 'backlog-pressure':['test/reliability-phase2c-backlog-pressure.integration.test.mjs'],
 finite:['test/reliability-phase2c-finite-timeout.integration.test.mjs'],
 foundation:['reliability-preservation','reliability-observability','reliability-observability-review',
 'reliability-observability-api','reliability-telemetry-protected-equivalence','reliability-diagnostic-policy',
 'reliability-diagnostic-cli','reliability-diagnostic-adapter','reliability-native','reliability-readback',
 'reliability-benchmark-harness','reliability-benchmark-safety','reliability-benchmark-results',
 'reliability-query-plan-evidence','reliability-phase2-performance-gate','reliability-phase2-application-comparison'].map(n=>`test/${n}.test.mjs`),
 'phase1-sql':['test/reliability-sql-never-again-postgres.integration.test.mjs','test/reliability-score-history-postgres.integration.test.mjs','test/reliability-correlation-postgres.integration.test.mjs'],
 application:[],build:[]};
const suite=process.argv[2];assert.ok(Object.hasOwn(suites,suite)&&process.argv.length===3,'Known suite only; no database or network targets');
const files=suite==='application'?JSON.parse(await readFile(path.join(repositoryRoot,'docs/reliability/phase2/evidence/application-selection.json'),'utf8')):suites[suite];
if(suite==='application')assert.equal(files.length,493);
const env={...process.env};
delete env.BAGGER_CLOSURE_BENCHMARK_BATCH;
for(const key of Object.keys(env))if(/SUPABASE|VERCEL|GOOGLE|DATABASE_URL|DIRECT_URL|PGHOST|PGPASSWORD|PGSERVICE|PRODUCTION_|PREVIEW_|TOKEN|SECRET|PASSWORD|API_KEY|CREDENTIAL/i.test(key))delete env[key];
env.NODE_OPTIONS=`--require ${path.join(repositoryRoot,'tools/reliability/phase2c1-closure-proof-isolation.cjs')}`;env.NEXT_TELEMETRY_DISABLED='1';
if(['canonical','derived','index','recovery'].includes(suite))env.BAGGER_PHASE2C_CANDIDATE='1';
else delete env.BAGGER_PHASE2C_CANDIDATE;
if(['annual','deadlock'].includes(suite))env.BAGGER_PHASE2C_FULL='1';
else delete env.BAGGER_PHASE2C_FULL;
if(suite==='phase1-sql')env.BAGGER_RELIABILITY_EXTENDED_SETUP='1';else delete env.BAGGER_RELIABILITY_EXTENDED_SETUP;
if(suite==='canonical')env.BAGGER_PHASE2_PROOF_OUTPUT='docs/reliability/phase2c/evidence/canonical-detail.json';
if(suite==='worker-history')env.BAGGER_PHASE2C_WORKER_HISTORY_EVIDENCE=path.join(repositoryRoot,'docs/reliability/phase2c/evidence/worker-history-detail.json');
if(suite==='delivery')env.BAGGER_PHASE2C_WORKER_EVIDENCE='docs/reliability/phase2c/evidence/worker-delivery-results.json';
if(suite==='derived')env.BAGGER_PHASE2_DERIVED_OUTPUT='docs/reliability/phase2c/evidence/derived-detail.json';
env.BAGGER_PHASE2C1_CANDIDATE='1';env.BAGGER_PHASE2C1_CLOSURE='1';
if(suite==='retirement-sql')env.BAGGER_PHASE2C1_SQL_EVIDENCE=path.join(repositoryRoot,'docs/reliability/phase2c1-closure/evidence/google-retirement-sql.json');
const directory=path.join(repositoryRoot,'docs/reliability/phase2c1-closure/evidence');await mkdir(directory,{recursive:true});
const changedPaths=()=>[...execFileSync('git',['diff','--name-only','4f5be5928a362f77edca375919df55be23695177'],{cwd:repositoryRoot,encoding:'utf8'}).split('\n'),
 ...execFileSync('git',['ls-files','--others','--exclude-standard'],{cwd:repositoryRoot,encoding:'utf8'}).split('\n')]
 .filter(file=>file&&/^(?:app|lib|supabase|test|tools)\//.test(file));
const sourceSnapshot=async()=>Promise.all([...new Set(changedPaths())].sort().map(async file=>({file,sha256:await readFile(path.join(repositoryRoot,file)).then(hash).catch(error=>{if(error.code==='ENOENT')return 'DELETED';throw error;})})));
const sourceBefore=await sourceSnapshot();
const provenanceOptions={repositoryRoot,entryPoints:files,through:124,declaredFiles:['tools/reliability/run-phase2c1-closure-tests.mjs','tools/reliability/phase2c1-closure-proof-isolation.cjs',...(suite==='worker-failure-lock-order'?['docs/reliability/phase2c/evidence/worker-failure-lock-before-9bd77498/phase2c-worker-failure-before-definitions.json']:[]),...(['worker-history','delivery-index-review'].includes(suite)?['test/support/reliability/phase2c-delivery-indexes.json']:[])],scope:suite==='build'?'BUILD':suite==='application'?'APPLICATION':'TEST'};
const provenanceBefore=await capturePhase2CSourceProvenance(provenanceOptions);
const receiptName=suite==='annual-admission'?'annual-admission-run':suite;
const startedAt=new Date().toISOString();
const args=suite==='build'?['node_modules/next/dist/bin/next','build']:['--conditions=react-server','--test','--test-reporter=tap','--test-concurrency=1',...files];
const run=spawnSync(process.execPath,args,{cwd:repositoryRoot,env,encoding:'utf8',maxBuffer:128*1024*1024,timeout:1800000});
const output=(run.stdout||'')+(run.stderr||'');
const counts=suite==='build'?null:Object.fromEntries(['tests','pass','fail','skipped','cancelled'].map(k=>[k,Number(output.match(new RegExp(`^# ${k} (\\d+)$`,'m'))?.[1]??NaN)]));
const failures=[...output.matchAll(/^not ok \d+ - (.+)\n([\s\S]*?)(?=^(?:ok|not ok|# Subtest:|1\.\.|# tests )|$(?![\s\S]))/gm)].map(m=>({name:m[1],diagnostic:m[2].replaceAll(repositoryRoot,'<CHECKOUT>').replace(/duration_ms: [\d.]+/g,'duration_ms: <TIME>').slice(0,5000)}));
const migrations=(await readdir(path.join(repositoryRoot,'supabase/production_migrations'))).filter(n=>/^\d{8}012[1-9]_/.test(n));
const sources=await Promise.all([...files,...migrations.map(n=>`supabase/production_migrations/${n}`)].map(async file=>({file,sha256:hash(await readFile(path.join(repositoryRoot,file)))})));
const sourceAfter=await sourceSnapshot();const sourceProvenance=completePhase2CSourceProvenance(provenanceBefore,await capturePhase2CSourceProvenance(provenanceOptions));const sourcesStable=JSON.stringify(sourceBefore)===JSON.stringify(sourceAfter)&&sourceProvenance.stable;
const receipt={schemaVersion:2,suite,sourceProvenance,sourcesStable,implementationSourceManifest:sourceBefore,startedAt,completedAt:new Date().toISOString(),executionHead:execFileSync('git',['rev-parse','HEAD'],{cwd:repositoryRoot,encoding:'utf8'}).trim(),baseSha:'4f5be5928a362f77edca375919df55be23695177',environment:'LOCAL_NON_PRODUCTION',remoteNetwork:'DENIED_AT_NET_TLS_SOCKET',credentials:'REMOVED_FROM_CHILD_ENV',production:false,sources,counts,exitCode:run.status,error:run.error?.code||null,result:!sourcesStable?'NOT_PROVEN_SOURCE_CHANGED':run.status===0?'PASS':'FAIL',failures,rawArtifact:`${receiptName}.tap`,rawSha256:hash(output),limitations:suite==='build'?['Compilation only']:suite==='application'?['Identical493-file selection; compare known failure identities before adjudication']:['Explicit runtime substitutions remain labelled by individual test; no hosted/physical proof']};
await writeFile(path.join(directory,`${receiptName}.tap`),output);await writeFile(path.join(directory,`${receiptName}.json`),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({suite,result:receipt.result,counts,error:receipt.error,failures:failures.map(v=>v.name)},null,2));
process.exitCode=run.status===0&&sourcesStable?0:1;
