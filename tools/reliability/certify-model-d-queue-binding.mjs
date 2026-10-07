// Local-only certificate. Credentials stripped; all remote sockets denied.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {repositoryRoot} from '../../test/support/reliability/postgres17.mjs';
const mode=process.argv[2];if(!['focused','application','build'].includes(mode))throw new Error('MODE_DENIED');
const dir=path.join(repositoryRoot,'docs/reliability/phase2d-model-d-queue-binding/evidence');await mkdir(dir,{recursive:true});
const sources=[
 "lib/certification-queue-publication.js",
 "lib/certification-queue-publisher.js",
 "test/certification-model-d-queue-binding.integration.test.mjs",
 "tools/reliability/certify-model-d-queue-binding.mjs",
  "lib/canonical-resource-registration.js",
  "lib/certification-worker-engines.js",
  "lib/certification-worker-supervision.js",
  "lib/certification-queue-envelope.js",
  "lib/certification-queue-timing-evidence.js",
  "supabase/production_incremental/certification-model-d-execution-v1.sql",
  "supabase/model_d_bootstrap/manifest.json",
  "supabase/model_d_bootstrap/schema.sql",
  "supabase/model_d_bootstrap/static-contracts.sql",
  "supabase/model_d_bootstrap/catalog-manifest.json",
  "config/certification-model-d-registration.json",
  "config/certification-model-d-binding-request.json",
  "config/certification-model-d-fixture.json",
  "tools/reliability/certification-model-d-binding.mjs",
  "tools/reliability/certification-model-d-fixture.mjs",
  "tools/reliability/certification-model-d-fixture.sql",
  "tools/reliability/model-d-bootstrap.mjs",
  "tools/reliability/certification-model-d-installation.mjs",
  "test/certification-model-d.integration.test.mjs",
  "test/certification-model-d-final-recap.integration.test.mjs",
  "test/certification-model-d-forward.integration.test.mjs",
  "test/support/reliability/certification-model-d-fixture.mjs",
  "tools/reliability/certify-model-d.mjs",
  "package.json",
  "package-lock.json"
];
const hash=s=>createHash('sha256').update(s).digest('hex');
const snapshot=async()=>Object.fromEntries(await Promise.all(sources.map(async f=>[f,hash(await readFile(path.join(repositoryRoot,f)))])));
const before=await snapshot(),env={...process.env};
for(const k of Object.keys(env))if(/SUPABASE|VERCEL|GOOGLE|WORKBOOK|SERVICE_ACCOUNT|DATABASE|^PG|PRODUCTION_|PREVIEW_|TOKEN|SECRET|PASSWORD|API_KEY|CREDENTIAL|BAGGER_/i.test(k))delete env[k];
env.NODE_OPTIONS=`--require ${path.join(repositoryRoot,'tools/reliability/phase2-network-deny.cjs')}`;
env.LC_ALL='C';env.NEXT_TELEMETRY_DISABLED='1';env.BAGGER_PHASE2C1_CANDIDATE='1';env.BAGGER_PHASE2C1_CLOSURE='1';
const files=mode==='application'?JSON.parse(await readFile(path.join(repositoryRoot,'docs/reliability/phase2/evidence/application-selection.json'),'utf8')):
 ["test/certification-model-d-queue-binding.integration.test.mjs","test/certification-queue-supervision.test.mjs","test/certification-queue-publisher.test.mjs","test/certification-queue-publisher.integration.test.mjs"];
const args=mode==='build'?['node_modules/next/dist/bin/next','build']:['--conditions=react-server','--test','--test-reporter=tap',`--test-concurrency=1`,...files];
const startedAt=new Date().toISOString(),r=spawnSync(process.execPath,args,{cwd:repositoryRoot,env,encoding:'utf8',timeout:1800000,maxBuffer:128*1024*1024});
const raw=(r.stdout||'')+(r.stderr||''),counts=mode==='build'?null:Object.fromEntries(['tests','pass','fail','skipped','cancelled'].map(k=>[k,Number(raw.match(new RegExp(`^# ${k} (\\d+)$`,'m'))?.[1]??NaN)]));
const failures=[...raw.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map(m=>m[1]);
const baseline=JSON.parse(await readFile(path.join(repositoryRoot,'docs/reliability/phase2d-worker-supervision/owner-publication/evidence/application.json'),'utf8'));
const newFailures=mode==='application'?failures.filter(f=>!baseline.failures.includes(f)):failures;
const after=await snapshot(),evidence={mode,startedAt,completedAt:new Date().toISOString(),hosted:false,remoteSocketsDenied:true,
 realCredentialsRemoved:true,counts,failures,newFailures,establishedFailures:mode==='application'?baseline.failures:[],
 exitCode:r.status,error:r.error?.code||null,sourceStable:JSON.stringify(before)===JSON.stringify(after),sourceManifest:before,
 rawSha256:hash(raw),head:execFileSync('git',['rev-parse','HEAD'],{cwd:repositoryRoot,encoding:'utf8'}).trim()};
await writeFile(path.join(dir,mode+'.tap'),raw);await writeFile(path.join(dir,mode+'.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({mode,counts,failures,newFailures,exitCode:r.status,sourceStable:evidence.sourceStable}));
process.exitCode=mode==='application'&&newFailures.length===0&&counts.fail===20&&counts.skipped===0?0:r.status||0;
