// Local remediation runner: fixed suites, remote sockets denied, no credentials.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {repositoryRoot} from '../../test/support/reliability/postgres17.mjs';
const mode=process.argv[2];assert.ok(['focused','application','build'].includes(mode)&&process.argv.length===3);
const directory=path.join(repositoryRoot,'docs/reliability/phase2d-identity-contact-remediation/evidence');
await mkdir(directory,{recursive:true});
const hash=value=>createHash('sha256').update(value).digest('hex');
const sourceFiles=['tools/reliability/certification-part2a-fixture.mjs','tools/reliability/certification-part2a-fixture.sql',
 'tools/reliability/certification-part2a-provisioning-guards.sql','tools/reliability/certification-part2a-identity-contacts.sql',
 'tools/reliability/certification-part2a-identity-contacts-repair.sql',
 'tools/reliability/run-certification-fixture-tests.mjs','test/certification-part2a-fixture.integration.test.mjs',
 'test/certification-part2a-contact-repair.integration.test.mjs','test/support/reliability/certification-contact-identity-proof.mjs',
 'test/support/reliability/fixtures/certification-part2a-omitted-contacts.sql',
 'config/certification-resource-registration.json',...['schema.sql','static-contracts.sql','manifest.json','catalog.sql','catalog-manifest.json']
 .map(name=>'supabase/canonical_bootstrap/'+name)];
const snapshot=async()=>Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,hash(await readFile(path.join(repositoryRoot,file)))])));
const before=await snapshot();
const env={...process.env};
for(const key of Object.keys(env))if(/SUPABASE|VERCEL|GOOGLE|WORKBOOK|SERVICE_ACCOUNT|DATABASE|^PG|PRODUCTION_|PREVIEW_|TOKEN|SECRET|PASSWORD|API_KEY|CREDENTIAL|BAGGER_/i.test(key))delete env[key];
env.NODE_OPTIONS=`--require ${path.join(repositoryRoot,'tools/reliability/phase2-network-deny.cjs')}`;
env.NEXT_TELEMETRY_DISABLED='1';env.BAGGER_PHASE2C1_CANDIDATE='1';env.BAGGER_PHASE2C1_CLOSURE='1';
const files=mode==='application'?JSON.parse(await readFile(path.join(repositoryRoot,'docs/reliability/phase2/evidence/application-selection.json'),'utf8'))
 :['test/certification-part2a-fixture.integration.test.mjs','test/certification-part2a-contact-repair.integration.test.mjs',
 'test/participant-context-error-contract.test.mjs','test/certification-resource-registration.test.mjs',
 'test/certification-runtime-server.test.mjs','test/certification-ingress-transport.test.mjs','test/certification-adapter-routing.test.mjs'];
if(mode==='application')assert.equal(files.length,493);
const args=mode==='build'?['node_modules/next/dist/bin/next','build']
 :['--conditions=react-server','--test','--test-reporter=tap','--test-concurrency=1',...files];
const startedAt=new Date().toISOString();
const result=spawnSync(process.execPath,args,{cwd:repositoryRoot,env,encoding:'utf8',maxBuffer:128*1024*1024,timeout:1800000});
const raw=(result.stdout||'')+(result.stderr||'');
const counts=mode==='build'?null:Object.fromEntries(['tests','pass','fail','skipped','cancelled'].map(key=>
 [key,Number(raw.match(new RegExp(`^# ${key} (\\d+)$`,'m'))?.[1]??NaN)]));
const failures=[...raw.matchAll(/^not ok \d+ - (.+)$/gm)].map(match=>match[1]);
const after=await snapshot();assert.deepEqual(after,before,'Proof sources changed while executing');
const receipt={mode,startedAt,completedAt:new Date().toISOString(),environment:'OWNED_LOCAL_ONLY',
 hosted:false,credentialsRemoved:true,remoteSocketsDenied:true,executionHead:execFileSync('git',['rev-parse','HEAD'],{cwd:repositoryRoot,encoding:'utf8'}).trim(),
 counts,failures,exitCode:result.status,error:result.error?.code??null,sourcesStable:true,sourceManifest:before,
 rawSha256:hash(raw),result:result.status===0?'PASS':'FAIL_REQUIRES_ACCOUNTING'};
await writeFile(path.join(directory,mode+'.tap'),raw);
await writeFile(path.join(directory,mode+'.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({mode,counts,failures,exitCode:result.status,error:receipt.error}));
process.exitCode=result.status===0?0:1;
