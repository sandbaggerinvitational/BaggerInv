#!/usr/bin/env node
// PERFORMANCE / POSTGRESQL. Fixed owned Unix-socket databases; no remote target option.
import assert from 'node:assert/strict';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import {capturePhase2CSourceProvenance,completePhase2CSourceProvenance} from './phase2c-source-provenance.mjs';
import { createIsolatedCluster,destroyIsolatedCluster,createDatabase,repositoryRoot,
  sql,sqlFile,timedSqlSamples } from '../../test/support/reliability/postgres17.mjs';
import { installRelease139Schema,installRelease139FunctionCandidates } from '../../test/support/reliability/release139-schema.mjs';
import { inputFor,rpc } from '../../test/support/reliability/phase2-score-fixture.mjs';
import { seedSyntheticTournament } from '../../test/support/reliability/synthetic-tournament.mjs';
import { initializeBenchmarkScaleVariants } from '../../test/support/reliability/benchmark-fixtures.mjs';
import { benchmarkOperations } from '../../test/support/reliability/benchmark-operations.mjs';
import { validateBenchmarkResult } from '../../test/support/reliability/benchmark-result-validation.mjs';
import { seedCompatibilityVariant,compatibilityVariants,eligibleHistoryFixtureVersion } from '../../test/support/reliability/phase2-eligible-history.mjs';
import { installPhase2C,configureFiniteTimeout,phase2cBaseSha,normalScoreTimeoutMs } from '../../test/support/reliability/phase2c-install.mjs';
import { measurementEnvironment,measurementResourceSnapshot } from '../../test/support/reliability/measurement-metadata.mjs';
import { capturePhase2Plan } from './phase2-plan-capture.mjs';
const options=new Map();
for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i],value=process.argv[i+1];assert.ok(['--mode','--samples','--scales','--kind'].includes(key)&&value&&!options.has(key),'Only mode/samples/scales/kind; external targets rejected');options.set(key,value);}
const mode=options.get('--mode')||'candidate',kind=options.get('--kind')||'common';
assert.ok(['baseline','candidate'].includes(mode));assert.ok(['common','eligible','recovery'].includes(kind));assert.ok(kind!=='recovery'||mode==='candidate','Recovery has no historical API baseline');
const count=Number(options.get('--samples')||(kind!=='eligible'?1000:30));
assert.ok(Number.isInteger(count)&&count>=1&&count<=1000);
const scales=(options.get('--scales')||'5,1,10,2').split(',').map(Number);
assert.ok(scales.length&&new Set(scales).size===scales.length&&scales.every(n=>[1,2,5,10].includes(n)));
const summary=values=>{const sorted=[...values].sort((a,b)=>a-b),n=values.length,p=q=>sorted[Math.ceil(n*q)-1];return {samples:n,successCount:n,failureCount:0,p50Ms:p(.5),p95Ms:n>=20?p(.95):null,p99Ms:n>=1000?p(.99):null,maxMs:sorted.at(-1),minMs:sorted[0],p99Status:n>=1000?'LOCAL_EMPIRICAL_10_TAIL_SAMPLES':'NOT_PROVEN_INSUFFICIENT_SAMPLE'};};
const output=path.join(repositoryRoot,'docs/reliability/phase2c');await mkdir(path.join(output,'evidence'),{recursive:true});
const m121='supabase/production_migrations/202609280121_score_derived_intents_v1.sql';
const artifact={schemaVersion:1,mode,kind,baseSha:phase2cBaseSha,executionHead:execFileSync('git',['rev-parse','HEAD'],{cwd:repositoryRoot,encoding:'utf8'}).trim(),
 generatedAt:new Date().toISOString(),environment:'LOCAL_SOCKET_ONLY_POSTGRESQL17',production:false,fixtureVersion:`bagger-r139-synthetic-history-v1+${eligibleHistoryFixtureVersion}`,seed:'2026-never-again-139',
 phase2MigrationSha256:createHash('sha256').update(await readFile(path.join(repositoryRoot,m121))).digest('hex'),
 statementTimeoutMs:normalScoreTimeoutMs,timeZone:'UTC',scaleOrder:scales,
 method:kind==='recovery'?'Owned accepted receipt; supported SCORING_LOCK revokes match permissions before every timed read. Every COMMITTED response validated. Read-only status RPC repeats inside rolled-back transactions; no score writes during measurement.': 'Actual canonical RPC; every ACCEPTED response validated; fresh mutation inside independently rolled-back transaction. Fixed finite statement timeout on every database. Measured RPC only. First fresh-session observation retained separately; not a cold-OS-cache claim.',
 limitations:['Local, fsync disabled; not HTTP, hosted authentication, provider capacity or durable COMMIT latency.','Nested statement counts include loops and are not network calls or distinct rows.','P99 at n1000 is a local empirical estimate, not a confidence interval.','CPU/I/O host activity outside this task is not controlled.','Intent claim/financial worker/recovery benchmark results are separate.'],scales:[]};
const provenanceOptions={repositoryRoot,entryPoints:['tools/reliability/benchmark-phase2c.mjs'],through:mode==='baseline'?121:124,scope:'BENCHMARK'};
const provenanceBefore=await capturePhase2CSourceProvenance(provenanceOptions);
artifact.sourceProvenance={contract:'phase2c-source-provenance-v1',before:provenanceBefore,after:null,stable:false,result:'RUNNING'};artifact.result='RUNNING';let completed=false;
const cluster=await createIsolatedCluster();
try{
 createDatabase(cluster,'rel139_template');await installRelease139Schema(cluster,'rel139_template');installRelease139FunctionCandidates(cluster,'rel139_template');seedSyntheticTournament(cluster,'rel139_template');
 artifact.resources=measurementEnvironment(cluster,'rel139_template');
 const operation=benchmarkOperations.find(v=>v.id==='score-write');
 for(const scale of scales){
  const {primaryDatabase,counts,archivedCounts}=initializeBenchmarkScaleVariants(cluster,scale);
  sqlFile(cluster,primaryDatabase,path.join(repositoryRoot,m121),{role:''});
  if(mode==='candidate')artifact.candidate=await installPhase2C(cluster,primaryDatabase);else configureFiniteTimeout(cluster,primaryDatabase);
  const cases=kind!=='eligible'?[{name:'none'}]:(scale%2?[...compatibilityVariants]:[...compatibilityVariants].reverse());
  const rows=[];let index=0;
  for(const variant of cases){
   const database=`p2c_bench_${scale}_${index++}`;createDatabase(cluster,database,{template:primaryDatabase});configureFiniteTimeout(cluster,database);
   const binding=kind==='eligible'?seedCompatibilityVariant(cluster,database,variant.name):null;
   const state=()=>sql(cluster,database,`select md5(jsonb_build_object('holes',(select count(*) from scoring_authority.hole_scores),'receipts',(select count(*) from scoring_authority.score_mutations),'history',(select count(*) from scoring_authority.score_revision_history),'audit',(select count(*) from scoring_authority.audit_events),'intents',(select count(*) from scoring_authority.score_derived_intents_v1))::text)`,{role:''});
   let measuredOperation=operation,recoveryState=null;
   const recoveryAuthority=()=>JSON.parse(sql(cluster,database,`select jsonb_build_object(
    'matchStatus',m.status,'scoringLocked',m.scoring_locked,
    'activePermissions',(select count(*) from scoring_authority.scoring_permissions p where p.match_id=m.match_id and(p.can_score or p.revoked_at is null)))
    from scoring_authority.matches m where m.match_id='2026-R3-12'`));
   if(kind==='recovery'){
    validateBenchmarkResult(operation,sql(cluster,database,operation.sql));
    const locked=rpc(cluster,database,'mutate_production_match_control',inputFor(cluster,database,'2026-R3-12',1,{director:true,operation:'SCORING_LOCK',key:'recovery-benchmark-lock'}));
    assert.equal(locked.ok,true,JSON.stringify(locked));
    const authority=recoveryAuthority();assert.deepEqual(authority,{matchStatus:'LIVE',scoringLocked:true,activePermissions:0});
    recoveryState={operation:'SCORING_LOCK',supportedControlSucceeded:true,beforeTiming:true,...authority,expectedStatus:'COMMITTED',verifiedTimedSamples:count};
    measuredOperation={id:'score-recovery',sql:operation.sql.replace('submit_production_hole_score','read_production_score_mutation_status_v1'),validateResult:raw=>{const value=typeof raw==='string'?JSON.parse(raw):raw;assert.equal(value.status,'COMMITTED');assert.equal(value.result.code,'ACCEPTED');assert.equal(value.mutation_key,'90000000-0000-4000-8000-000000000001');}};
   }
   const before=state(),validateResult=v=>measuredOperation.validateResult?measuredOperation.validateResult(v):validateBenchmarkResult(operation,v);
   const first=timedSqlSamples(cluster,database,measuredOperation.sql,1,{validateResult})[0];
   const resourcesBefore=measurementResourceSnapshot(cluster,database);const batches=[],values=[];
   for(let done=0;done<count;){const n=Math.min(kind!=='eligible'?200:10,count-done);const sample=timedSqlSamples(cluster,database,measuredOperation.sql,n,{validateResult});values.push(...sample);batches.push({...summary(sample),valuesMs:sample});done+=n;}
   if(kind==='recovery')assert.deepEqual(recoveryAuthority(),{matchStatus:'LIVE',scoringLocked:true,activePermissions:0});
   assert.equal(state(),before,'rollback leaves score/receipt/history/audit/intent cardinalities unchanged');
   const row={variant:variant.name,binding,...(recoveryState?{recoveryState}:{}),firstSessionObservationMs:first,...summary(values),batches,rollbackVerified:true,statementTimeoutMs:1000,headroomToMaxRatio:1000/Math.max(...values),resourcesBefore,resourcesAfter:measurementResourceSnapshot(cluster,database)};
   if(kind!=='eligible'||[1,10].includes(scale)){
    const plan=capturePhase2Plan(cluster,database,measuredOperation);row.nestedSqlExecutions=plan.loggedStatements;row.derivedRelationsOnScorePath=plan.derivedRelations;
    row.queryPlanArtifact=`evidence/${mode}-${kind}-${scale}x-${variant.name}-plan.json`;
    await writeFile(path.join(output,row.queryPlanArtifact),JSON.stringify(plan,null,2)+'\n');
   }
   rows.push(row);console.log(`${mode} ${kind} ${scale}x ${variant.name}: ${values.length} accepted, p50 ${row.p50Ms.toFixed(3)}, p95 ${row.p95Ms?.toFixed(3)}, max ${row.maxMs.toFixed(3)} ms`);
  }
  artifact.scales.push({scale,counts,archivedCounts,branches:rows});
  await writeFile(path.join(output,`benchmark-${mode}-${kind}.json`),JSON.stringify(artifact,null,2)+'\n');
 }
 completed=true;
}finally{
 let cleaned=false;
 try{await destroyIsolatedCluster(cluster);cleaned=true;}
 finally{
  artifact.sourceProvenance=completePhase2CSourceProvenance(provenanceBefore,await capturePhase2CSourceProvenance(provenanceOptions));
  artifact.result=completed&&cleaned&&artifact.sourceProvenance.stable?'PASS':'FAIL';artifact.clusterDestroyed=cleaned;
  await writeFile(path.join(output,`benchmark-${mode}-${kind}.json`),JSON.stringify(artifact,null,2)+'\n');
  assert.ok(artifact.sourceProvenance.stable,'benchmark source dependencies changed during execution');
 }
}
