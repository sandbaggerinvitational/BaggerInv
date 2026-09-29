// UNIT / PERFORMANCE artifact validation only. No database or network access.
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const scales=[1,2,5,10];
// Phase2 retained exact current-pointer/PK reads solely to decide durable-intent
// eligibility. These are not historical derivation. Raw indexed row bounds are
// reviewed separately; any other derived relation is rejected here.
const BOUNDED_INTENT_READS=new Set(['calcutta_v1_current','net_skins_v1_configuration_current','net_skins_v1_configuration_revisions']);
const variants=['none','current_compatible','current_incompatible_consumed','current_incompatible_financial','stale_source','stale_result_binding','superseded_result','multiple_receipts'];
const percentile=(v,p)=>[...v].sort((a,b)=>a-b)[Math.ceil(v.length*p)-1];
const finite=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
const canonical=v=>JSON.stringify(v);
export function evaluatePhase2CPerformance(before,after,eligibleBefore,eligibleAfter){
 const missing=[],failures=[],comparisons=[];
 const check=(condition,key,target=failures)=>{if(!condition)target.push(key);return condition;};
 const parse=(artifact,mode,kind)=>{
  const map=new Map(),label=`${mode}:${kind}`;
  if(!check(artifact&&typeof artifact==='object',`${label}:artifact`,missing))return map;
  check(artifact.production===false&&artifact.environment==='LOCAL_SOCKET_ONLY_POSTGRESQL17',`${label}:isolation`);
  check(artifact.mode===mode&&artifact.kind===kind,`${label}:identity`);
  check(artifact.timeZone==='UTC',`${label}:UTC-profile`,missing);
  check(artifact.statementTimeoutMs===1000,`${label}:finite-timeout`);
  check(/^[a-f0-9]{40}$/.test(artifact.executionHead||'')&&/^[a-f0-9]{40}$/.test(artifact.baseSha||''),`${label}:source`,missing);
  if(mode==='candidate')check(artifact.candidate?.migrations?.length===3&&artifact.candidate.migrations.every(m=>/^[a-f0-9]{64}$/.test(m.sha256)),`${label}:candidate-migration-manifest`,missing);
  for(const scale of artifact.scales||[]){
   check(scales.includes(scale.scale),`${label}:scale-invalid`);
   for(const row of scale.branches||[]){
    const key=`${scale.scale}:${row.variant}`;check(!map.has(key),`${label}:${key}:duplicate`);
    const values=(row.batches||[]).flatMap(b=>b.valuesMs||[]),medians=(row.batches||[]).map(b=>percentile(b.valuesMs||[],.5));
    const min=kind==='common'?1000:30;
    check(values.length>=min&&row.batches?.length>=3,`${label}:${key}:samples`,missing);
    if(!check(values.length===row.samples&&values.every(finite)&&values.length>0,`${label}:${key}:raw-values`))continue;
    check(row.successCount===row.samples&&row.failureCount===0,`${label}:${key}:semantic-outcomes`);
    for(const [name,p]of [['p50Ms',.5],['p95Ms',.95]])check(finite(row[name])&&Math.abs(row[name]-percentile(values,p))<1e-9,`${label}:${key}:${name}`);
    check(row.maxMs===Math.max(...values),`${label}:${key}:maximum`);
    check(row.samples>=1000?row.p99Ms===percentile(values,.99):row.p99Ms===null,`${label}:${key}:p99`);
    check(row.rollbackVerified===true&&row.statementTimeoutMs===1000,`${label}:${key}:rollback-timeout`,missing);
    check(row.maxMs<1000,`${label}:${key}:timeout-headroom`);
    if(kind==='common'||[1,10].includes(scale.scale)){
     check(/^evidence\/[A-Za-z0-9_.-]+\.json$/.test(row.queryPlanArtifact||'')&&row.nestedSqlExecutions>0&&Array.isArray(row.derivedRelationsOnScorePath),`${label}:${key}:plan`,missing);
     if(mode==='candidate')check(row.derivedRelationsOnScorePath?.every(name=>BOUNDED_INTENT_READS.has(name)),`${label}:${key}:derived-history`);
    }
    map.set(key,{...row,spread:Math.max(...medians)-Math.min(...medians),counts:scale.counts,archivedCounts:scale.archivedCounts});
   }
  }
  for(const scale of scales)for(const v of kind==='common'?['none']:variants)check(map.has(`${scale}:${v}`),`${label}:${scale}:${v}:missing`,missing);
  return map;
 };
 for(const [kind,b,a]of [['common',before,after],['eligible',eligibleBefore,eligibleAfter]]){
  const bm=parse(b,'baseline',kind),am=parse(a,'candidate',kind);
  if(b&&a)for(const field of ['fixtureVersion','seed','baseSha','phase2MigrationSha256','environment'])check(b[field]===a[field],`${kind}:${field}:mismatch`);
  for(const [key,next]of am){const prior=bm.get(key);if(!prior)continue;
   check(canonical(prior.counts)===canonical(next.counts)&&canonical(prior.archivedCounts)===canonical(next.archivedCounts),`${kind}:${key}:fixture-counts`);
   check(canonical(prior.binding)===canonical(next.binding),`${kind}:${key}:eligible-binding`);
   const noise=Math.max(1,prior.p95Ms*.25,prior.spread*3,next.spread*3);
   check(next.p95Ms<=prior.p95Ms+noise,`${kind}:${key}:tail-regression`);
   check(next.spread<=Math.max(1,next.p50Ms*.5),`${kind}:${key}:repeat-variance`,missing);
   const first=am.get(`1:${next.variant}`),growthAllowance=first?Math.max(1,first.p50Ms*.5,...[...am.values()].filter(v=>v.variant===next.variant).map(v=>3*v.spread)):null;
   if(first)check(next.p50Ms<=first.p50Ms+growthAllowance,`${kind}:${key}:history-growth`);
   comparisons.push({kind,key,beforeP50Ms:prior.p50Ms,afterP50Ms:next.p50Ms,beforeP95Ms:prior.p95Ms,afterP95Ms:next.p95Ms,noiseAllowanceMs:noise,growthAllowanceMs:growthAllowance,headroomRatio:1000/next.maxMs});
  }
 }
 return {schemaVersion:1,status:failures.length?'FAIL':missing.length?'PARTIAL':'PASS',confidence:failures.length||missing.length?'UNKNOWN':'PROVEN',scope:'LOCAL_FINITE_SCORE_HISTORY_ARTIFACT_GATE',failures,missing,comparisons,
 thresholdStatus:'PROPOSED_ENGINEERING_NOT_PRODUCTION_SLO',rationale:'Require all4scales/8eligiblebranches, raw-sample summaries, complete migrationidentity, finite1s and plan families; allow only three existing exact current-pointer/PK intent-eligibility relations. Tail/growth tolerances use 1ms scheduler floor or observed batchspread/relative baseline, avoiding microsecond noise claims.',
 limitations:['Artifact gate does not execute the referenced plans or validate hosted resources.','Recovery, workers, committed sequence and client contracts have separate gates.','P99 only empirical at1000 samples; eligible p99 notproven.','No approved replacement baseline or Production capacity claim.']};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==6)throw Error('Four local JSON artifact paths required');
 const inputs=[];for(const name of process.argv.slice(2)){if(!/\.json$/.test(name)||/^[a-z]+:\/\//i.test(name))throw Error('Local JSON only');inputs.push(JSON.parse(await readFile(name,'utf8')));}
 const result=evaluatePhase2CPerformance(...inputs);console.log(JSON.stringify(result,null,2));if(result.status!=='PASS')process.exitCode=1;
}
