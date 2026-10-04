// Validator-only recertification; no hosted URL/credential or install arguments.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import path from 'node:path';
import {repositoryRoot} from '../../test/support/reliability/postgres17.mjs';

const suite=process.argv[2];
assert.ok(['validator','application'].includes(suite)&&process.argv.length===3);
const directory=path.join(repositoryRoot,'docs/reliability/phase2d-catalog-validation-portability/evidence');
await mkdir(directory,{recursive:true});
const env={...process.env};
for(const key of Object.keys(env))if(/SUPABASE|VERCEL|GOOGLE|SHEETS|DRIVE|WORKBOOK|SERVICE_ACCOUNT|DATABASE_URL|DIRECT_URL|^PG|PRODUCTION_|PREVIEW_|TOKEN|SECRET|PASSWORD|API_KEY|CREDENTIAL|BAGGER_PHASE|BAGGER_P0F|BAGGER_CLOSURE|BAGGER_R2_PROVISIONAL|BAGGER_BOOTSTRAP_PRIVILEGE/i.test(key))delete env[key];
env.NODE_OPTIONS=`--require ${path.join(repositoryRoot,'tools/reliability/catalog-portability-isolation.cjs')}`;
env.NEXT_TELEMETRY_DISABLED='1';env.BAGGER_PHASE2C1_CANDIDATE='1';env.BAGGER_PHASE2C1_CLOSURE='1';
const files=suite==='validator'?['tools/reliability/canonical-catalog-portability.test.mjs']:
 JSON.parse(await readFile(path.join(repositoryRoot,'docs/reliability/phase2/evidence/application-selection.json'),'utf8'));
if(suite==='application')assert.equal(files.length,493,'Retain exact accepted broad selection');
const hash=value=>createHash('sha256').update(value).digest('hex');
const watched=[...new Set([...files,
 'tools/reliability/portable-canonical-catalog.mjs','tools/reliability/validate-canonical-catalog.mjs',
 'tools/reliability/run-catalog-portability.mjs','tools/reliability/catalog-portability-isolation.cjs',
 'tools/reliability/canonical-bootstrap-artifacts.mjs','supabase/canonical_bootstrap/catalog.sql',
 'supabase/canonical_bootstrap/schema.sql','supabase/canonical_bootstrap/static-contracts.sql',
 'supabase/canonical_bootstrap/catalog-manifest.json','supabase/canonical_bootstrap/manifest.json'])].sort();
const snapshot=()=>Promise.all(watched.map(async file=>({file,sha256:hash(await readFile(path.join(repositoryRoot,file)))})));
const before=await snapshot(),startedAt=new Date().toISOString();
const args=['--conditions=react-server','--test','--test-reporter=tap','--test-concurrency=1',...files];
const run=spawnSync(process.execPath,args,{cwd:repositoryRoot,env,encoding:'utf8',maxBuffer:128*1024*1024,timeout:900000});
const raw=(run.stdout||'')+(run.stderr||'');
const counts=Object.fromEntries(['tests','pass','fail','skipped','cancelled']
 .map(key=>[key,Number(raw.match(new RegExp(`^# ${key} (\\d+)$`,'m'))?.[1]??NaN)]));
const failures=[...raw.matchAll(/^not ok \d+ - (.+)\n([\s\S]*?)(?=^(?:ok|not ok|# Subtest:|1\.\.|# tests )|$(?![\s\S]))/gm)]
 .map(match=>({name:match[1],diagnostic:match[2].replaceAll(repositoryRoot,'<CHECKOUT>').replace(/duration_ms: [\d.]+/g,'duration_ms: <TIME>').slice(0,6000)}));
const stable=JSON.stringify(before)===JSON.stringify(await snapshot());
const receipt={suite,baseSha:'b46ea9465a3a6d0ad89e8d447d08546b84bd262b',
 executionHead:execFileSync('git',['rev-parse','HEAD'],{cwd:repositoryRoot,encoding:'utf8'}).trim(),
 startedAt,completedAt:new Date().toISOString(),environment:'OWNED_LOCAL_POSTGRESQL17_NON_PRODUCTION',
 network:'OUTBOUND_NET_TLS_SOCKET_DENIED',credentials:'REMOVED_FROM_CHILD_ENV',selectionFiles:files.length,
 sourceManifest:before,sourcesStable:stable,counts,failures,exitCode:run.status,error:run.error?.code||null,
 result:!stable?'NOT_PROVEN_SOURCE_CHANGED':run.status===0?'PASS':'FAIL',rawArtifact:suite+'.log.gz',rawSha256:hash(raw),
 hostedAccess:false,productionAccess:false,installationPerformed:false,
 limitations:['Preserved hosted snapshot is not fresh hosted validation or resource registration.',
 'Broad raw failures require unchanged identity/diagnostic accounting.']};
await writeFile(path.join(directory,suite+'.log.gz'),gzipSync(raw));
await writeFile(path.join(directory,suite+'.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({suite,result:receipt.result,counts,failures:failures.map(f=>f.name),error:receipt.error},null,2));
process.exitCode=run.status===0&&stable?0:1;
