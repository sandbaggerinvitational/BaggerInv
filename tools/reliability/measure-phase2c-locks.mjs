#!/usr/bin/env node
// PERFORMANCE: local-only diagnostic instrumentation, never a shipping SQL change.
import assert from 'node:assert/strict';
import {writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {measurementEnvironment} from '../../test/support/reliability/measurement-metadata.mjs';
import path from 'node:path';
import {capturePhase2CSourceProvenance,completePhase2CSourceProvenance} from './phase2c-source-provenance.mjs';
import {performance} from 'node:perf_hooks';
import {installPhase2C,configureFiniteTimeout} from '../../test/support/reliability/phase2c-install.mjs';
import {createIsolatedCluster,destroyIsolatedCluster,createDatabase,repositoryRoot,sql,sqlFile,openSqlSession} from '../../test/support/reliability/postgres17.mjs';
import {installRelease139Schema,installRelease139FunctionCandidates} from '../../test/support/reliability/release139-schema.mjs';
import {seedSyntheticTournament,scoreInput} from '../../test/support/reliability/synthetic-tournament.mjs';
import {initializeBenchmarkScaleVariants} from '../../test/support/reliability/benchmark-fixtures.mjs';
import {seedCompatibilityVariant,eligibleHistoryFixtureVersion} from '../../test/support/reliability/phase2-eligible-history.mjs';
const mode=process.argv[2];assert.ok(['baseline','candidate'].includes(mode)&&process.argv.length===3);
const literal=v=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
const summary=v=>{const s=[...v].sort((a,b)=>a-b);return {samples:s.length,p50Ms:s[49],p95Ms:s[94],p99Ms:null,p99Status:'INSUFFICIENT_SAMPLE',maxMs:s.at(-1),minMs:s[0]};};
const provenanceOptions={repositoryRoot,entryPoints:['tools/reliability/measure-phase2c-locks.mjs'],through:mode==='baseline'?121:124,scope:'LOCK_BENCHMARK'};
const provenanceBefore=await capturePhase2CSourceProvenance(provenanceOptions);let completed=false;
const cluster=await createIsolatedCluster();const result={schemaVersion:1,mode,generatedAt:new Date().toISOString(),fixtureVersion:`bagger-r139-synthetic-history-v1+${eligibleHistoryFixtureVersion}`,seed:'2026-never-again-139',baseSha:'b1ceaa89f2d7cd0cdf2835aba04a24aca442ca18',executionHead:execFileSync('git',['rev-parse','HEAD'],{cwd:repositoryRoot,encoding:'utf8'}).trim(),phase2MigrationSha256:createHash('sha256').update(await readFile(path.join(repositoryRoot,'supabase/production_migrations/202609280121_score_derived_intents_v1.sql'))).digest('hex'),statementTimeoutMs:1000,environment:'LOCAL_SOCKET_ONLY_POSTGRESQL17',samplesPerBranch:100,production:false,method:'Test-only timestamp after actual match FOR UPDATE and successful FOUND check; database clock at RPC return gives lock-hold lower bound. Persistent local session BEGIN/RPC/ROLLBACK wall time gives whole-transaction upper bound. No other source replacement.',limitations:['Additional clock/set_config instrumentation has nonzero overhead; not directly comparable to uninstrumented benchmark.','No COMMIT fsync/durable storage; rollback transaction.','Lock released after result and rollback, so measured database lock portion is a lower bound; transaction wall includes socket and client work.','p99 not proven at n100 per branch; no hosted authority or provider-capacity inference.'],rows:[]};
result.sourceProvenance={contract:'phase2c-source-provenance-v1',before:provenanceBefore,after:null,stable:false,result:'RUNNING'};result.result='RUNNING';
try{
 createDatabase(cluster,'rel139_template');await installRelease139Schema(cluster,'rel139_template');installRelease139FunctionCandidates(cluster,'rel139_template');seedSyntheticTournament(cluster,'rel139_template');result.environmentDetails=measurementEnvironment(cluster,'rel139_template');result.environmentDetails.statementTimeout=sql(cluster,'rel139_template','show statement_timeout');result.environmentDetails.lockTimeout=sql(cluster,'rel139_template','show lock_timeout');
 for(const scale of [1,2,5,10]){
  const {primaryDatabase}=initializeBenchmarkScaleVariants(cluster,scale);
  sqlFile(cluster,primaryDatabase,path.join(repositoryRoot,'supabase/production_migrations/202609280121_score_derived_intents_v1.sql'),{role:''});
  if(mode==='candidate')result.candidate=await installPhase2C(cluster,primaryDatabase);
  for(const variant of ['none','multiple_receipts']){
   const db=`lock_${scale}_${variant==='none'?'none':'eligible'}`;createDatabase(cluster,db,{template:primaryDatabase});seedCompatibilityVariant(cluster,db,variant);configureFiniteTimeout(cluster,db);
   const before=sql(cluster,db,"select pg_get_functiondef('public.submit_production_hole_score(jsonb)'::regprocedure)",{role:''});
   const anchor="if not found then return jsonb_build_object('ok', false, 'code', 'MATCH_NOT_FOUND'); end if;";
   assert.equal(before.split(anchor).length,2);
   sql(cluster,db,before.replace(anchor,anchor+"\nperform set_config('bagger.test_lock_acquired',clock_timestamp()::text,true);"),{role:''});
   sql(cluster,db,`create function public.phase2_test_clock(input jsonb) returns jsonb language plpgsql security definer as $$declare r jsonb; started timestamptz:=clock_timestamp(); finished timestamptz; begin r:=public.submit_production_hole_score(input); finished:=clock_timestamp(); return jsonb_build_object('response',r,'databaseMs',extract(epoch from(finished-started))*1000,'lockHeldThroughRpcMs',extract(epoch from(finished-current_setting('bagger.test_lock_acquired')::timestamptz))*1000); end; $$;`,{role:''});
   const stateSql="select md5(jsonb_build_object('matches',(select jsonb_agg(to_jsonb(v) order by match_id) from scoring_authority.matches v),'holes',(select jsonb_agg(to_jsonb(v) order by match_id,hole_number) from scoring_authority.hole_scores v),'receipts',(select jsonb_agg(to_jsonb(v) order by match_id,mutation_key) from scoring_authority.score_mutations v),'auditCount',(select count(*) from scoring_authority.audit_events),'outboxCount',(select count(*) from scoring_authority.google_outbox_events))::text)";
   const stateBefore=sql(cluster,db,stateSql,{role:''});
   const session=openSqlSession(cluster,db);const times=[],dbTimes=[],lockTimes=[];
   try{for(let i=0;i<102;i++){
    const input=scoreInput({mutation_key:'90000000-0000-4000-8000-000000000001'});
    const start=performance.now();const output=await session.query(`begin;select public.phase2_test_clock(${literal(input)});rollback;`);const total=performance.now()-start;
    const value=JSON.parse(output);assert.equal(value.response.code,'ACCEPTED');assert.notEqual(value.response.idempotent,true);
    assert.ok(value.databaseMs>=value.lockHeldThroughRpcMs&&value.lockHeldThroughRpcMs>0);
    if(i>=2){times.push(total);dbTimes.push(Number(value.databaseMs));lockTimes.push(Number(value.lockHeldThroughRpcMs));}
   }}finally{await session.close();}
   assert.equal(sql(cluster,db,stateSql,{role:''}),stateBefore,'canonical match/hole/receipt/audit/outbox reset');
   result.rows.push({scale,variant,canonicalRollbackDigestVerified:true,successCount:100,failureCount:0,transactionWallUpperBound:summary(times),databaseRpc:summary(dbTimes),lockHeldThroughRpcLowerBound:summary(lockTimes)});
   console.log(`${mode} ${scale}x ${variant}: db p50 ${summary(dbTimes).p50Ms.toFixed(3)}, lock lower ${summary(lockTimes).p50Ms.toFixed(3)}, transaction upper ${summary(times).p50Ms.toFixed(3)}`);
  }
 }
 await writeFile(path.join(repositoryRoot,`docs/reliability/phase2c/lock-duration-${mode}.json`),JSON.stringify(result,null,2)+'\n');
 completed=true;
}finally{
 let cleaned=false;
 try{await destroyIsolatedCluster(cluster);cleaned=true;}
 finally{
  result.sourceProvenance=completePhase2CSourceProvenance(provenanceBefore,await capturePhase2CSourceProvenance(provenanceOptions));
  result.result=completed&&cleaned&&result.sourceProvenance.stable?'PASS':'FAIL';result.clusterDestroyed=cleaned;
  await writeFile(path.join(repositoryRoot,`docs/reliability/phase2c/lock-duration-${mode}.json`),JSON.stringify(result,null,2)+'\n');
  assert.ok(result.sourceProvenance.stable,'lock benchmark source dependencies changed during execution');
 }
}
