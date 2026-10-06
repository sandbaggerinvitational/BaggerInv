// Local-only certificate. Credentials stripped; all remote sockets denied.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {repositoryRoot} from '../../test/support/reliability/postgres17.mjs';
const mode=process.argv[2];if(!['focused','application','build'].includes(mode))throw new Error('MODE_DENIED');
const dir=path.join(repositoryRoot,'docs/reliability/phase2d-net-skins-configuration/evidence');await mkdir(dir,{recursive:true});
const sources=['supabase/production_incremental/certification-net-skins-configuration-v1.sql',
 'lib/certification-runtime-server.js','lib/isolated-director-operations.js','lib/canonical-director-operations-client.js',
 'app/api/director/canonical-operations/route.js','app/api/admin/production-net-skins-v1/route.js','lib/production-net-skins-server.js',
 'test/certification-net-skins-configuration.integration.test.mjs','test/certification-net-skins-configuration.test.mjs',
 'tools/reliability/certify-net-skins-configuration.mjs','package.json','package-lock.json'];
const hash=s=>createHash('sha256').update(s).digest('hex');
const snapshot=async()=>Object.fromEntries(await Promise.all(sources.map(async f=>[f,hash(await readFile(path.join(repositoryRoot,f)))])));
const before=await snapshot(),env={...process.env};
for(const k of Object.keys(env))if(/SUPABASE|VERCEL|GOOGLE|WORKBOOK|SERVICE_ACCOUNT|DATABASE|^PG|PRODUCTION_|PREVIEW_|TOKEN|SECRET|PASSWORD|API_KEY|CREDENTIAL|BAGGER_/i.test(k))delete env[k];
env.NODE_OPTIONS=`--require ${path.join(repositoryRoot,'tools/reliability/phase2-network-deny.cjs')}`;
env.LC_ALL='C';env.NEXT_TELEMETRY_DISABLED='1';env.BAGGER_PHASE2C1_CANDIDATE='1';env.BAGGER_PHASE2C1_CLOSURE='1';
const files=mode==='application'?JSON.parse(await readFile(path.join(repositoryRoot,'docs/reliability/phase2/evidence/application-selection.json'),'utf8')):
 ['test/certification-net-skins-configuration.integration.test.mjs','test/certification-net-skins-configuration.test.mjs','test/production-net-skins-v1-server.test.mjs','test/certification-adapter-routing.test.mjs','test/isolated-director-operations.test.mjs'];
const args=mode==='build'?['node_modules/next/dist/bin/next','build']:['--conditions=react-server','--test','--test-reporter=tap',`--test-concurrency=${mode==='application'?1:2}`,...files];
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
