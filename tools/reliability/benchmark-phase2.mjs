#!/usr/bin/env node
// PERFORMANCE / POSTGRESQL: owned socket-only fixture; accepts no network target.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createIsolatedCluster, destroyIsolatedCluster, createDatabase, repositoryRoot,
  sql, sqlFile, timedSqlSamples, sqlResult } from '../../test/support/reliability/postgres17.mjs';
import { installRelease139Schema, installRelease139FunctionCandidates } from '../../test/support/reliability/release139-schema.mjs';
import { seedSyntheticTournament } from '../../test/support/reliability/synthetic-tournament.mjs';
import { initializeBenchmarkScaleVariants } from '../../test/support/reliability/benchmark-fixtures.mjs';
import { benchmarkOperations } from '../../test/support/reliability/benchmark-operations.mjs';
import { validateBenchmarkResult } from '../../test/support/reliability/benchmark-result-validation.mjs';
import { measurementEnvironment, measurementResourceSnapshot } from '../../test/support/reliability/measurement-metadata.mjs';
import { capturePhase2Plan } from './phase2-plan-capture.mjs';

const options = new Map();
for (let i=2; i<process.argv.length; i+=2) {
  const key=process.argv[i], value=process.argv[i+1];
  assert.ok(['--mode','--samples','--scales'].includes(key) && value && !options.has(key), 'Only mode/samples/scales are accepted; no external database or URL');
  options.set(key,value);
}
const mode=options.get('--mode') || 'before';
assert.ok(['before','after'].includes(mode));
const count=Number(options.get('--samples') || 1000);
assert.ok(Number.isInteger(count) && count>=1 && count<=1000);
const scales=(options.get('--scales') || '1,2,5,10').split(',').map(Number);
assert.ok(scales.length && new Set(scales).size===scales.length && scales.every(v=>[1,2,5,10].includes(v)));
const migration=path.join(repositoryRoot,'supabase/production_migrations/202609280121_score_derived_intents_v1.sql');
const sha=value=>createHash('sha256').update(value).digest('hex');
const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*p/100)-1];
const stats=values=>({samples:values.length,successCount:values.length,failureCount:0,p50Ms:percentile(values,50),
  p95Ms:values.length>=20?percentile(values,95):null,p99Ms:values.length>=1000?percentile(values,99):null,
  p99Status:values.length>=1000?'LOCAL_EMPIRICAL_ESTIMATE_10_TAIL_SAMPLES':'NOT_PROVEN_INSUFFICIENT_SAMPLE',maxMs:Math.max(...values),minMs:Math.min(...values)});
const output=path.join(repositoryRoot,'docs/reliability/phase2');
await mkdir(path.join(output,'evidence'),{recursive:true});
const results={schemaVersion:1,mode,generatedAt:new Date().toISOString(),
  baseSha:'184b5c65a8e63784e1af8d38121fa2e16a015628',executionHead:execFileSync('git',['rev-parse','HEAD'],{cwd:repositoryRoot,encoding:'utf8'}).trim(),
  fixtureVersion:'bagger-r139-synthetic-history-v1',fixtureSeed:'2026-never-again-139',
  environment:'LOCAL_SOCKET_ONLY_POSTGRESQL_17',production:false,
  candidateMigrationSha256:mode==='after'?sha(await readFile(migration)):null,
  method:'Same actual score RPC, fixed fresh mutation, semantically validated each sample; BEGIN/setup + RPC + ROLLBACK. psql timing covers RPC only; transaction lock upper bound separately measured. First observation retained; later batches warm.',
  limitations:['Not HTTP/API/auth provider latency.','fsync disabled by inherited disposable Phase1 fixture; no power-loss durability proof.',
    'p99 requires 1000 samples and remains local empirical estimate, not confidence interval or Production SLO.',
    'No provider resource/capacity proof.','Nested plan counts are SQL executions, not network round-trips or unique rows.',
    'First observation is fresh session/plans, not guaranteed OS cold cache.'],scales:[]};
const cluster=await createIsolatedCluster();
try {
  createDatabase(cluster,'rel139_template');
  await installRelease139Schema(cluster,'rel139_template');
  installRelease139FunctionCandidates(cluster,'rel139_template');
  seedSyntheticTournament(cluster,'rel139_template');
  results.environmentDetails=measurementEnvironment(cluster,'rel139_template');
  for (const scale of scales) {
    const {primaryDatabase:database,counts,archivedCounts}=initializeBenchmarkScaleVariants(cluster,scale);
    // Freeze the installed local catalog before candidate migration, rather than infer installed triggers from filenames.
    if (scale===scales[0]) {
      const catalog=JSON.parse(sql(cluster,database,`select jsonb_build_object(
        'functions',(select jsonb_agg(jsonb_build_object('identity',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'acl',p.proacl,'config',p.proconfig) order by p.oid::regprocedure::text)
          from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('scoring_authority','production_control','public') and
          (p.proname in ('submit_production_hole_score','finalize_production_match','mutate_production_match_control','match_progress','enqueue_production_calcutta_v1_change','enqueue_production_net_skins_v1_change','enqueue_annual_derived_v1_change','late_r3_result_compatible_v1','close_annual_scoring_predecessor_v1') or p.proname like '%score_derived_intent%')),
        'triggers',(select jsonb_agg(jsonb_build_object('table',t.tgrelid::regclass::text,'name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid)) order by t.tgname)
          from pg_trigger t where not t.tgisinternal and t.tgrelid in ('scoring_authority.matches'::regclass,'scoring_authority.hole_scores'::regclass)),
        'indexes',(select jsonb_agg(jsonb_build_object('table',tablename,'index',indexname,'definition',indexdef) order by indexname) from pg_indexes where schemaname='scoring_authority' and tablename in ('matches','hole_scores','score_mutations','score_revision_history','scoring_permissions','scoring_snapshots','competition_recalculation_jobs','calcutta_v1_recalculation_jobs','net_skins_v1_recalculation_jobs'))
      )`,{role:''}));
      if(mode==='before') await writeFile(path.join(output,'evidence/before-catalog.json'),JSON.stringify(catalog,null,2)+'\n');
    }
    if(mode==='after') sqlFile(cluster,database,migration,{role:''});
    const operation=benchmarkOperations.find(v=>v.id==='score-write');
    const initial=JSON.parse(sql(cluster,database,`select jsonb_build_object('holes',(select count(*) from scoring_authority.hole_scores),'mutations',(select count(*) from scoring_authority.score_mutations),'revisions',(select count(*) from scoring_authority.score_revision_history))`));
    const batchSize=Math.min(200,count), batches=[], all=[];
    const first=timedSqlSamples(cluster,database,operation.sql,1,{validateResult:v=>validateBenchmarkResult(operation,v)});
    const resourcesBefore=measurementResourceSnapshot(cluster,database);
    for(let done=0;done<count;) {
      const n=Math.min(batchSize,count-done);
      const values=timedSqlSamples(cluster,database,operation.sql,n,{validateResult:v=>validateBenchmarkResult(operation,v)});
      all.push(...values); batches.push({...stats(values),valuesMs:values}); done+=n;
    }
    const final=JSON.parse(sql(cluster,database,`select jsonb_build_object('holes',(select count(*) from scoring_authority.hole_scores),'mutations',(select count(*) from scoring_authority.score_mutations),'revisions',(select count(*) from scoring_authority.score_revision_history))`));
    assert.deepEqual(final,initial,'rollback must leave fixture cardinalities unchanged');
    const plans=capturePhase2Plan(cluster,database,operation);
    const row={scale,counts,archivedCounts,firstSessionObservationMs:first[0],...stats(all),batches,
      rollbackVerified:true,resourcesBefore,resourcesAfter:measurementResourceSnapshot(cluster,database),
      oneRpcPerMutation:true,nestedSqlExecutions:plans.loggedStatements,derivedRelationsOnScorePath:plans.derivedRelations,
      transactionDurationMs:null,lockDurationMs:null,rowsExamined:null,
      unavailableMetrics:['exact lock acquisition/hold timing','distinct rows examined (nested plans overlap)','database-only time excluding local socket'],
      queryPlanArtifact:`evidence/plans-${mode}-${scale}x.json`};
    await writeFile(path.join(output,row.queryPlanArtifact),JSON.stringify(plans,null,2)+'\n');
    results.scales.push(row);
    await writeFile(path.join(output,`benchmark-${mode}.json`),JSON.stringify(results,null,2)+'\n');
    process.stdout.write(`${mode} ${scale}x: ${all.length} accepted, p50=${row.p50Ms.toFixed(3)} p95=${row.p95Ms?.toFixed(3)} nested=${plans.loggedStatements}\n`);
  }
} finally {await destroyIsolatedCluster(cluster);}
