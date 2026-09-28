#!/usr/bin/env node
// PERFORMANCE / POSTGRESQL; current and historical compatibility branches, no target URL accepted.
import assert from 'node:assert/strict';
import {writeFile,readFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {createIsolatedCluster,destroyIsolatedCluster,createDatabase,repositoryRoot,sqlFile,sql,timedSqlSamples} from '../../test/support/reliability/postgres17.mjs';
import {installRelease139Schema,installRelease139FunctionCandidates} from '../../test/support/reliability/release139-schema.mjs';
import {seedSyntheticTournament} from '../../test/support/reliability/synthetic-tournament.mjs';
import {initializeBenchmarkScaleVariants} from '../../test/support/reliability/benchmark-fixtures.mjs';
import {benchmarkOperations} from '../../test/support/reliability/benchmark-operations.mjs';
import {validateBenchmarkResult} from '../../test/support/reliability/benchmark-result-validation.mjs';
import {seedCompatibilityVariant,compatibilityVariants,eligibleHistoryFixtureVersion} from '../../test/support/reliability/phase2-eligible-history.mjs';
import {measurementEnvironment} from '../../test/support/reliability/measurement-metadata.mjs';
import {capturePhase2Plan} from './phase2-plan-capture.mjs';
const mode=process.argv[2];assert.ok(['before','after'].includes(mode)&&process.argv.length===3,'Only before/after accepted, no database target');
const output=path.join(repositoryRoot,'docs/reliability/phase2');await mkdir(path.join(output,'evidence'),{recursive:true});
const migration=path.join(repositoryRoot,'supabase/production_migrations/202609280121_score_derived_intents_v1.sql');
const cluster=await createIsolatedCluster();
const results={schemaVersion:1,mode,generatedAt:new Date().toISOString(),baseSha:'184b5c65a8e63784e1af8d38121fa2e16a015628',
 fixtureVersion:`bagger-r139-synthetic-history-v1+${eligibleHistoryFixtureVersion}`,seed:'2026-never-again-139',
 candidateMigrationSha256:mode==='after'?createHash('sha256').update(await readFile(migration)).digest('hex'):null,
 environment:'LOCAL_SOCKET_ONLY_POSTGRESQL_17',production:false,scales:[],
 method:'30 independently rolled-back ACCEPTED RPC samples in three batches of10, two warmups; fixture compatibility verified before timing. Every response validated.',
 limitations:['Synthetic receipt state exercises genuine installed branch, not proof protected late-R3 issuer would create every adversarial state.',
 'P99 NOT PROVEN:30 samples perbranch.','No HTTP/hosted admission/durable COMMIT/physical client/capacity claim.',
 'Scale order5,1,10,2 avoids monotonically increasing cache/order bias; deterministic branch order alternates by scale.','Host not exclusively reserved from unrelated owner processes.']};
try{
 createDatabase(cluster,'rel139_template');await installRelease139Schema(cluster,'rel139_template');
 installRelease139FunctionCandidates(cluster,'rel139_template');seedSyntheticTournament(cluster,'rel139_template');
 results.environmentDetails=measurementEnvironment(cluster,'rel139_template');
 const op=benchmarkOperations.find(v=>v.id==='score-write');
 for(const scale of [5,1,10,2]){
  const {primaryDatabase,counts,archivedCounts}=initializeBenchmarkScaleVariants(cluster,scale);
  if(mode==='after')sqlFile(cluster,primaryDatabase,migration,{role:''});
  const rows=[];let index=0;
  const variants=scale%2===0?[...compatibilityVariants].reverse():compatibilityVariants;
  for(const variant of variants){
   const database=`eligible_${scale}_${index++}`;createDatabase(cluster,database,{template:primaryDatabase});
   const binding=seedCompatibilityVariant(cluster,database,variant.name);
   const validate=v=>validateBenchmarkResult(op,v);
   timedSqlSamples(cluster,database,op.sql,2,{validateResult:validate});
   const batches=[];let values=[];
   for(let b=0;b<3;b++){const sample=timedSqlSamples(cluster,database,op.sql,10,{validateResult:validate});values.push(...sample);batches.push(sample);}
   const sorted=[...values].sort((a,b)=>a-b);
   const row={variant:variant.name,eligible:binding.eligible,compatibleBefore:binding.compatible,
    samples:values.length,successCount:values.length,failureCount:0,p50Ms:sorted[14],p95Ms:sorted[28],p99Ms:null,p99Status:'NOT_PROVEN_INSUFFICIENT_SAMPLE',maxMs:sorted.at(-1),batches,
    databaseTimeMs:null,queryCount:null,rowsExamined:null,lockDurationMs:null};
   if(scale===1||scale===10){
    const plans=capturePhase2Plan(cluster,database,op);row.nestedSqlExecutions=plans.loggedStatements;row.derivedRelationsOnScorePath=plans.derivedRelations;
    row.planArtifact=`evidence/eligible-plan-${mode}-${scale}x-${variant.name}.json`;
    await writeFile(path.join(output,row.planArtifact),JSON.stringify(plans,null,2)+'\n');
   }
   rows.push(row);process.stdout.write(`${mode} ${scale}x ${variant.name} p50=${row.p50Ms.toFixed(3)} p95=${row.p95Ms.toFixed(3)}\n`);
  }
  results.scales.push({scale,counts,archivedCounts,branches:rows});
  await writeFile(path.join(output,`eligible-history-${mode}.json`),JSON.stringify(results,null,2)+'\n');
 }
}finally{await destroyIsolatedCluster(cluster);}
