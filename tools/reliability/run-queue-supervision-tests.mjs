// Owned local SQL only. Never creates Vercel messages; all queue sends are injected.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {repositoryRoot} from '../../test/support/reliability/postgres17.mjs';
const mode=process.argv[2];if(!['core','recovery','crash','application','build'].includes(mode))throw new Error('MODE_DENIED');
const dir=path.join(repositoryRoot,'docs/reliability/phase2d-worker-supervision/queue-v2/evidence');await mkdir(dir,{recursive:true});
const sources=['lib/certification-queue-supervision.js','lib/certification-worker-supervision.js','lib/score-derived-worker.js','lib/score-derived-delivery.js',
 'tools/reliability/certification-queue-control.mjs','tools/reliability/certification-worker-demand.mjs','supabase/production_incremental/certification-worker-queue-supervision-v2.sql',
 'app/api/internal/derived-worker/run/route.js','app/api/internal/derived-worker/queue/route.js','vercel.certification-queue.json','package.json','package-lock.json'];
const hash=s=>createHash('sha256').update(s).digest('hex');const snapshot=async()=>Object.fromEntries(await Promise.all(sources.map(async f=>[f,hash(await readFile(path.join(repositoryRoot,f)))])));
const before=await snapshot(),env={...process.env};for(const k of Object.keys(env))if(/SUPABASE|VERCEL|GOOGLE|WORKBOOK|SERVICE_ACCOUNT|DATABASE|^PG|PRODUCTION_|PREVIEW_|TOKEN|SECRET|PASSWORD|API_KEY|CREDENTIAL|BAGGER_/i.test(k))delete env[k];
env.NODE_OPTIONS=`--require ${path.join(repositoryRoot,'tools/reliability/phase2-network-deny.cjs')}`;env.LC_ALL='C';env.NEXT_TELEMETRY_DISABLED='1';env.BAGGER_PHASE2C1_CANDIDATE='1';env.BAGGER_PHASE2C1_CLOSURE='1';
const files=mode==='application'?JSON.parse(await readFile(path.join(repositoryRoot,'docs/reliability/phase2/evidence/application-selection.json'),'utf8')):
 mode==='core'?['test/certification-queue-supervision.test.mjs','test/certification-queue-supervision.integration.test.mjs','test/competition-derived-supabase.test.mjs','test/intelligence-derived-supabase.test.mjs']:
 [`test/certification-queue-supervision-${mode}.integration.test.mjs`];
const args=mode==='build'?['node_modules/next/dist/bin/next','build']:['--conditions=react-server','--test','--test-reporter=tap',`--test-concurrency=${mode==='application'?1:2}`,...files];
const startedAt=new Date().toISOString(),r=spawnSync(process.execPath,args,{cwd:repositoryRoot,env,encoding:'utf8',timeout:1800000,maxBuffer:128*1024*1024});
const raw=(r.stdout||'')+(r.stderr||''),counts=mode==='build'?null:Object.fromEntries(['tests','pass','fail','skipped','cancelled'].map(k=>[k,Number(raw.match(new RegExp(`^# ${k} (\\d+)$`,'m'))?.[1]??NaN)]));
const failures=[...raw.matchAll(/^not ok \d+ - (.+)$/gm)].map(m=>m[1]);const after=await snapshot();
const evidence={mode,startedAt,completedAt:new Date().toISOString(),hosted:false,remoteSocketsDenied:true,realCredentialsRemoved:true,counts,failures,
 exitCode:r.status,error:r.error?.code||null,sourceStable:JSON.stringify(before)===JSON.stringify(after),sourceManifest:before,rawSha256:hash(raw),head:execFileSync('git',['rev-parse','HEAD'],{cwd:repositoryRoot,encoding:'utf8'}).trim()};
await writeFile(path.join(dir,mode+'.tap'),raw);await writeFile(path.join(dir,mode+'.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({mode,counts,failures,exitCode:r.status,sourceStable:evidence.sourceStable}));
process.exitCode=r.status||0;
