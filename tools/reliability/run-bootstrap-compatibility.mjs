// Bounded local recertification. No hosted target or credential arguments.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {repositoryRoot} from '../../test/support/reliability/postgres17.mjs';

const suite=process.argv[2];
const privilege=process.argv[3]==='--privilege-portability';
assert.ok(['bootstrap','application','build','check'].includes(suite)&&(process.argv.length===3||privilege&&process.argv.length===4));
const packageName=privilege?'phase2d-bootstrap-privilege-portability':'phase2d-bootstrap-compatibility';
const directory=path.join(repositoryRoot,'docs/reliability',packageName,'evidence');
await mkdir(directory,{recursive:true});
const env={...process.env};
for(const key of Object.keys(env))if(/SUPABASE|VERCEL|GOOGLE|SHEETS|DRIVE|WORKBOOK|SERVICE_ACCOUNT|DATABASE_URL|DIRECT_URL|^PG|PRODUCTION_|PREVIEW_|TOKEN|SECRET|PASSWORD|API_KEY|CREDENTIAL|BAGGER_PHASE|BAGGER_P0F|BAGGER_CLOSURE/i.test(key))delete env[key];
delete env.BAGGER_R2_PROVISIONAL_BOOTSTRAP_PROOF;
delete env.BAGGER_BOOTSTRAP_PRIVILEGE_PORTABILITY_PROOF;
if(privilege)env.BAGGER_BOOTSTRAP_PRIVILEGE_PORTABILITY_PROOF='1';
env.NODE_OPTIONS=`--require ${path.join(repositoryRoot,'tools/reliability/bootstrap-compatibility-isolation.cjs')}`;
env.NEXT_TELEMETRY_DISABLED='1';env.BAGGER_PHASE2C1_CANDIDATE='1';env.BAGGER_PHASE2C1_CLOSURE='1';
const files=suite==='application'?JSON.parse(await readFile(path.join(repositoryRoot,'docs/reliability/phase2/evidence/application-selection.json'),'utf8'))
 :suite==='bootstrap'?['tools/reliability/canonical-bootstrap.integration.test.mjs']:[];
if(suite==='application')assert.equal(files.length,493);
const hash=value=>createHash('sha256').update(value).digest('hex');
const watched=[...new Set([...files,'tools/reliability/canonical-bootstrap-artifacts.mjs',
 'tools/reliability/bootstrap-compatibility-isolation.cjs','tools/reliability/run-bootstrap-compatibility.mjs',
 'supabase/canonical_bootstrap/schema.sql','supabase/canonical_bootstrap/manifest.json',
 'supabase/canonical_bootstrap/static-contracts.sql','supabase/canonical_bootstrap/catalog-manifest.json'])].sort();
const snapshot=()=>Promise.all(watched.map(async file=>({file,sha256:hash(await readFile(path.join(repositoryRoot,file)))})));
const before=await snapshot(),startedAt=new Date().toISOString();
const args=suite==='build'?['node_modules/next/dist/bin/next','build']
 :suite==='check'?['tools/reliability/generate-canonical-bootstrap.mjs','--check']
 :['--conditions=react-server','--test','--test-reporter=tap','--test-concurrency=1',...files];
const run=spawnSync(process.execPath,args,{cwd:repositoryRoot,env,encoding:'utf8',maxBuffer:128*1024*1024,timeout:1800000});
const raw=(run.stdout||'')+(run.stderr||'');
const counts=['bootstrap','application'].includes(suite)?Object.fromEntries(['tests','pass','fail','skipped','cancelled']
 .map(key=>[key,Number(raw.match(new RegExp(`^# ${key} (\\d+)$`,'m'))?.[1]??NaN)])):null;
const failures=[...raw.matchAll(/^not ok \d+ - (.+)\n([\s\S]*?)(?=^(?:ok|not ok|# Subtest:|1\.\.|# tests )|$(?![\s\S]))/gm)]
 .map(match=>({name:match[1],diagnostic:match[2].replaceAll(repositoryRoot,'<CHECKOUT>').replace(/duration_ms: [\d.]+/g,'duration_ms: <TIME>').slice(0,6000)}));
const stable=JSON.stringify(before)===JSON.stringify(await snapshot());
const receipt={suite,baseSha:privilege?'b992bc6501423e038fb5db5e424ae91f880bd9b6':'9f09f6f15afe1f1a0b326edd078cd54ab4001f71',
 executionHead:execFileSync('git',['rev-parse','HEAD'],{cwd:repositoryRoot,encoding:'utf8'}).trim(),
 startedAt,completedAt:new Date().toISOString(),environment:'OWNED_LOCAL_POSTGRESQL17_NON_PRODUCTION',
 network:'OUTBOUND_NET_TLS_SOCKET_DENIED',credentials:'REMOVED_FROM_CHILD_ENV',sourceManifest:before,sourcesStable:stable,
 counts,failures,exitCode:run.status,error:run.error?.code||null,
 result:!stable?'NOT_PROVEN_SOURCE_CHANGED':run.status===0?'PASS':'FAIL',rawArtifact:suite+'.log',rawSha256:hash(raw),
 hosted:false,production:false,limitations:['Supabase-shaped local fixture is not hosted provider certification.',
 'Broad raw failures require exact identity/diagnostic accounting; no baseline exclusion.']};
await writeFile(path.join(directory,suite+'.log'),raw);
await writeFile(path.join(directory,suite+'.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({suite,result:receipt.result,counts,failures:failures.map(f=>f.name),error:receipt.error},null,2));
process.exitCode=run.status===0&&stable?0:1;
