#!/usr/bin/env node
// Owned local proof only. This runner accepts suite names, never remote targets.
// Historical Phase2/P0F artifacts are redirected, not overwritten.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {spawnSync,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {capturePhase2CSourceProvenance,completePhase2CSourceProvenance} from './phase2c-source-provenance.mjs';
import {repositoryRoot} from '../../test/support/reliability/postgres17.mjs';

const baseSha='7cec5128409286f5b4a5f3524d4c5488124a7be7';
const hash=value=>createHash('sha256').update(value).digest('hex');
const suites={
  unit:['test/certification-resource-registration.test.mjs','test/certification-runtime-server.test.mjs',
    'test/certification-adapter-routing.test.mjs','test/certification-ingress-transport.test.mjs',
    'test/certification-future-context.test.mjs','test/certification-future-authoring-fixtures.test.mjs',
    'test/certification-future-authoring-transport.test.mjs','test/certification-recovery-adapters.test.mjs',
    'test/certification-odds-adapter.test.mjs','test/certification-calcutta-post-commit.test.mjs','test/preview-director-entitlement.test.mjs',
    'test/reliability-phase2c-recovery.test.mjs','test/mobile-scoring-authority-recovery.test.mjs',
    'test/mobile-v1-scoring-contracts.test.mjs'],
  'annual-create':['test/reliability-phase2dr2-annual.integration.test.mjs'],
  bootstrap:['tools/reliability/canonical-bootstrap.integration.test.mjs'],
  application:[],build:[],
};
const suite=process.argv[2];
assert.ok(Object.hasOwn(suites,suite)&&process.argv.length===3,'Known local suite only; no database/network targets');
const files=suite==='application'
  ?JSON.parse(await readFile(path.join(repositoryRoot,'docs/reliability/phase2/evidence/application-selection.json'),'utf8'))
  :suites[suite];
if(suite==='application')assert.equal(files.length,493,'Preserved broad comparison selection');
for(const file of files)await readFile(path.join(repositoryRoot,file));

const env={...process.env};
for(const key of Object.keys(env))if(/SUPABASE|VERCEL|GOOGLE|SHEETS|DRIVE|WORKBOOK|SERVICE_ACCOUNT|DATABASE_URL|DIRECT_URL|^PG|PRODUCTION_|PREVIEW_|TOKEN|SECRET|PASSWORD|API_KEY|CREDENTIAL|BAGGER_PHASE|BAGGER_P0F|BAGGER_CLOSURE/i.test(key))delete env[key];
env.NODE_OPTIONS=`--require ${path.join(repositoryRoot,'tools/reliability/phase2dr2-proof-isolation.cjs')}`;
env.NEXT_TELEMETRY_DISABLED='1';
// Existing broad tests explicitly select the already-approved retirement contract.
// These do not install the R2 SQL profile; SQL suites declare their real profile.
env.BAGGER_PHASE2C1_CANDIDATE='1';env.BAGGER_PHASE2C1_CLOSURE='1';
const directory=path.join(repositoryRoot,'docs/reliability/phase2d-resource-model/evidence');
await mkdir(directory,{recursive:true});

const changedPaths=()=>[...execFileSync('git',['diff','--name-only',baseSha],{cwd:repositoryRoot,encoding:'utf8'}).split('\n'),
  ...execFileSync('git',['ls-files','--others','--exclude-standard'],{cwd:repositoryRoot,encoding:'utf8'}).split('\n')]
  .filter(file=>/^(?:app|lib|supabase|test|tools|config)\//.test(file)||['next.config.mjs','vercel.json'].includes(file));
const snapshot=async()=>Promise.all([...new Set(changedPaths())].sort().map(async file=>({file,
  sha256:await readFile(path.join(repositoryRoot,file)).then(hash).catch(error=>{if(error.code==='ENOENT')return 'DELETED';throw error;})})));
const migrations=(await readdir(path.join(repositoryRoot,'supabase/production_migrations')))
  .filter(name=>/^\d+_.*\.sql$/.test(name)&&name>'202609280124_\uffff')
  .map(name=>'supabase/production_migrations/'+name);
const options={repositoryRoot,entryPoints:files,through:124,scope:suite==='build'?'BUILD':suite==='application'?'APPLICATION':'TEST',
  declaredFiles:['tools/reliability/run-phase2dr2-tests.mjs','tools/reliability/phase2dr2-proof-isolation.cjs',
    'config/certification-resource-registration.json','vercel.json','supabase/canonical_bootstrap/source-profile.json',...migrations,
    ...['director-calcutta-management-read-v1.sql','director-calcutta-clear-entry-v1.sql'].map(name=>'supabase/production_incremental/'+name)]};
const before=await snapshot(),provenanceBefore=await capturePhase2CSourceProvenance(options);
const startedAt=new Date().toISOString();
const args=suite==='build'?['node_modules/next/dist/bin/next','build']
  :['--conditions=react-server','--test','--test-reporter=tap','--test-concurrency=1',...files];
const run=spawnSync(process.execPath,args,{cwd:repositoryRoot,env,encoding:'utf8',maxBuffer:128*1024*1024,timeout:1800000});
const raw=(run.stdout||'')+(run.stderr||'');
const counts=suite==='build'?null:Object.fromEntries(['tests','pass','fail','skipped','cancelled']
  .map(key=>[key,Number(raw.match(new RegExp(`^# ${key} (\\d+)$`,'m'))?.[1]??NaN)]));
const failures=[...raw.matchAll(/^not ok \d+ - (.+)\n([\s\S]*?)(?=^(?:ok|not ok|# Subtest:|1\.\.|# tests )|$(?![\s\S]))/gm)]
  .map(match=>({name:match[1],diagnostic:match[2].replaceAll(repositoryRoot,'<CHECKOUT>').replace(/duration_ms: [\d.]+/g,'duration_ms: <TIME>').slice(0,6000)}));
const after=await snapshot(),sourceProvenance=completePhase2CSourceProvenance(provenanceBefore,await capturePhase2CSourceProvenance(options));
const sourcesStable=JSON.stringify(before)===JSON.stringify(after)&&sourceProvenance.stable;
const receipt={schemaVersion:1,suite,startedAt,completedAt:new Date().toISOString(),baseSha,
  executionHead:execFileSync('git',['rev-parse','HEAD'],{cwd:repositoryRoot,encoding:'utf8'}).trim(),
  environment:'OWNED_LOCAL_NON_PRODUCTION',remoteNetwork:'DENIED_AT_NET_TLS_SOCKET',credentials:'REMOVED_FROM_CHILD_ENV',
  production:false,hosted:false,sourceProvenance,implementationSourceManifest:before,sourcesStable,counts,
  exitCode:run.status,error:run.error?.code||null,failures,
  result:!sourcesStable?'NOT_PROVEN_SOURCE_CHANGED':run.status===0?'PASS':'FAIL',
  rawArtifact:`${suite}.tap`,rawSha256:hash(raw),
  limitations:['Each test defines its proof layer; no hosted, Production or physical proof.',
    ...(suite==='application'?['Preserved493-file comparison. New R2 tests are counted separately; failure identities require explicit baseline accounting.']:[]),
    ...(suite==='build'?['Unconfigured local build proves compilation only. Configured Certification boot requires separate local integration proof.']:[])]};
await writeFile(path.join(directory,`${suite}.tap`),raw);
await writeFile(path.join(directory,`${suite}.json`),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({suite,result:receipt.result,counts,error:receipt.error,failures:failures.map(value=>value.name)},null,2));
process.exitCode=run.status===0&&sourcesStable?0:1;
