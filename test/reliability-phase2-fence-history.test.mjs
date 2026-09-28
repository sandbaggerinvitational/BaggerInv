// Proof layers: POSTGRESQL / PERFORMANCE / SECURITY.
// Actual installed guard/score, isolated partial-index experiment, no provider access.
import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {createScoreProofFixture,cloneScoreProofDatabase,inputFor,rpcSql,canonicalState}
 from './support/reliability/phase2-score-fixture.mjs';
import {sql,sqlResult,jsonLiteral,timedSqlSamples,destroyIsolatedCluster}
 from './support/reliability/postgres17.mjs';
import {seedSyntheticSideGameHistory} from './support/reliability/synthetic-history.mjs';
import {syntheticRuntime} from './support/reliability/synthetic-tournament.mjs';
import {validateBenchmarkResult} from './support/reliability/benchmark-result-validation.mjs';
const relation='google_writer_fence_rehearsals',indexName='google_writer_fence_rehearsals_unrestored_idx';
const candidate='supabase/production_migrations/202609280121_score_derived_intents_v1.sql';
const guardSql=`select jsonb_build_object('ok',true,'guardResult',production_control.assert_no_unrestored_google_writer_fence_rehearsal())`;
const validateGuard=output=>{const v=JSON.parse(output);assert.deepEqual(Object.keys(v).sort(),['guardResult','ok']);assert.equal(v.ok,true);assert.ok(v.guardResult===null||v.guardResult==='');};
const validateScore=output=>validateBenchmarkResult({id:'score-write',coverage:'ACTUAL_RPC_ROLLBACK'},output);
const hash=value=>createHash('sha256').update(value).digest('hex');

function seedRestoredHistory(c,d,count){
 assert.ok([0,100,1000].includes(count));
 assert.equal(sql(c,d,`select count(*) from production_control.${relation}`),'0');
 // Replica mode omits only provider-quiesce FK prerequisites on this INSERT:
 // no application triggers exist here, and CHECK/NOT NULL/UNIQUE remain active.
 assert.equal(sql(c,d,`select count(*) from pg_trigger where tgrelid='production_control.${relation}'::regclass and not tgisinternal`),'0');
 const base={status:'RESTORED',quiesce_evidence_id:'92000000-0000-4000-8000-000000000001',
  begin_payload_hash:'a'.repeat(64),vercel_project_id:'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU',
  project_ref:syntheticRuntime.projectRef,source_workbook_id:syntheticRuntime.sourceWorkbookId,tournament_id:'2026',
  dedicated_google_service_account:'sbi-production-workbook@sandbagger-invitational.iam.gserviceaccount.com',
  activation_revision:139,authority_generation_id:'30000000-0000-4000-8000-000000000001',admission_revision:139,
  baseline_provider_fingerprint:'1'.repeat(64),baseline_protected_ranges_fingerprint:'2'.repeat(64),
  baseline_canonical_value_fingerprint:'3'.repeat(64),writer_scope_fingerprint:'4'.repeat(64),
  edge_quiesce_fingerprint:'5'.repeat(64),origin_matrix_fingerprint:'6'.repeat(64),owner_principal_fingerprint:'7'.repeat(64),
  canonical_sheet_union_fingerprint:'8'.repeat(64),owner_override_operationally_frozen:true,
  owner_acknowledged_at:'2026-01-01T00:00:00Z',owner_freeze_expires_at:'2026-01-01T00:15:00Z',
  finish_payload_hash:'a'.repeat(64),provider_evidence_fingerprint:'9'.repeat(64),fenced_provider_fingerprint:'a'.repeat(64),
  restored_provider_fingerprint:'1'.repeat(64),restored_protected_ranges_fingerprint:'2'.repeat(64),
  restored_canonical_value_fingerprint:'3'.repeat(64),restoration_evidence_fingerprint:'b'.repeat(64),
  run_owned_protection_ids:[],active_run_owned_protection_count:0,dedicated_identity_can_edit:true,legacy_identity_denied:true,
  google_value_writes_performed:false,preview_resources_accessed:false,restoration_confirmed:true,certification_passed:true,
  failure_code:null,actor_id:'phase2-synthetic-fence-history',started_at:'2026-01-01T00:01:00Z',
  finished_at:'2026-01-01T00:02:00Z',updated_at:'2026-01-01T00:02:00Z'};
 sql(c,d,`begin;set local session_replication_role=replica;
  insert into production_control.${relation}
  select (jsonb_populate_record(null::production_control.${relation},${jsonLiteral(base)}||jsonb_build_object(
   'run_id','90000000-0000-4000-8000-'||lpad(n::text,12,'0'),
   'rehearsal_request_id','91000000-0000-4000-8000-'||lpad(n::text,12,'0'),
   'begin_request_fingerprint',encode(extensions.digest('phase2-fence-begin:'||n,'sha256'),'hex'),
   'finish_request_fingerprint',encode(extensions.digest('phase2-fence-finish:'||n,'sha256'),'hex'),
   'candidate_deployment_id','dpl_SyntheticFence'||lpad(n::text,8,'0'),
   'candidate_deployment_commit',encode(extensions.digest('phase2-fence-commit:'||n,'sha1'),'hex'),
   'admission_generation_id',(select admission_generation_id from scoring_authority.ingress_gates where tournament_id='2026'),
   'protection_description_prefix','STEP11_6_WRITER_FENCE_REHEARSAL:90000000-0000-4000-8000-'||lpad(n::text,12,'0')))).*
  from generate_series(1,${count})n;commit;analyze production_control.${relation};`,{role:''});
 assert.equal(Number(sql(c,d,`select count(*) from production_control.${relation} where status='RESTORED' and restoration_confirmed and certification_passed`)),count);
}
function balancedObject(v,start){let depth=0,quoted=false,escaped=false;for(let i=start;i<v.length;i++){
 const c=v[i];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}
 else if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0)return v.slice(start,i+1);
}throw new Error('Truncated nested plan JSON');}
function capture(c,d,statement,validate){
 const r=sqlResult(c,d,`begin;load 'auto_explain';set local client_min_messages=log;
  set local auto_explain.log_min_duration=0;set local auto_explain.log_analyze=on;
  set local auto_explain.log_buffers=on;set local auto_explain.log_timing=off;
  set local auto_explain.log_nested_statements=on;set local auto_explain.log_format=json;
  ${statement};set local auto_explain.log_min_duration=-1;rollback;`);
 assert.equal(r.status,0,'Instrumented actual function must succeed');validate(r.stdout.trim());
 const scans=[];let statements=0;
 for(const m of r.stderr.matchAll(/duration:\s+([0-9.]+)\s+ms\s+plan:\s*/g)){
  const start=m.index+m[0].length;assert.equal(r.stderr[start],'{');
  const e=JSON.parse(balancedObject(r.stderr,start));statements++;
  const visit=n=>{if(n['Relation Name']===relation)scans.push({querySha256:hash(e['Query Text']||''),
   nodeType:n['Node Type'],index:n['Index Name']||null,actualRows:n['Actual Rows'],actualLoops:n['Actual Loops'],
   rowsRemovedByFilter:n['Rows Removed by Filter']||0,sharedHitBlocks:n['Shared Hit Blocks']||0,
   sharedReadBlocks:n['Shared Read Blocks']||0,heapFetches:n['Heap Fetches']??null,instrumentedStatementMs:Number(m[1])});
   for(const child of n.Plans||[])visit(child);};visit(e.Plan);
 }
 assert.ok(statements>0&&scans.length>0,'Actual nested rehearsal scan required');return {statements,scans};
}
function timings(c,d,statement,validateResult){
 timedSqlSamples(c,d,statement,2,{validateResult});const values=timedSqlSamples(c,d,statement,30,{validateResult});
 const sorted=[...values].sort((a,b)=>a-b);return {samples:values.length,p50Ms:sorted[14],p95Ms:sorted[28],maxMs:sorted.at(-1),values};
}
function truthTable(c,d,scoreSql){
 const before=canonicalState(c,d),cases=[{status:'RUNNING',restored:false,blocked:true},
  {status:'RUNNING',restored:true,blocked:true},{status:'FAILED',restored:false,blocked:true},
  {status:'FAILED',restored:true,blocked:false},{status:'RESTORED',restored:true,blocked:false}];
 for(const row of cases){
  const patch=row.status==='RUNNING'?'finished_at=null,finish_request_fingerprint=null,finish_payload_hash=null,certification_passed=null,failure_code=null'
   :`certification_passed=${row.status==='RESTORED'},failure_code=${row.status==='FAILED'?"'SYNTHETIC_FAILURE'":'null'}`;
  const setup=`update production_control.${relation} set status='${row.status}',restoration_confirmed=${row.restored},${patch}
   where run_id='90000000-0000-4000-8000-000000000001'::uuid;`;
  for(const [label,statement,validate] of [['guard',guardSql,validateGuard],['score',scoreSql,validateScore]]){
   const r=sqlResult(c,d,`begin;${setup}${statement};rollback;`);
   if(row.blocked){assert.notEqual(r.status,0,`${label} denies ${row.status}/${row.restored}`);assert.match(r.stderr,/PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_UNRESTORED/);}
   else{assert.equal(r.status,0);validate(r.stdout.trim());}
  }
  assert.deepEqual(canonicalState(c,d),before,'guard experiments leave canonical state unchanged');
 }return cases;
}
test('Phase2 actual rehearsal guard excludes restored history with candidate partial index',{timeout:360000},async t=>{
 const f=await createScoreProofFixture({candidateSql:candidate}),c=f.cluster,rows=[];
 const evidence={schemaVersion:1,fixture:'phase2-fence-history-v2',environment:'OWNED_LOCAL_POSTGRESQL17',
  candidate:f.candidate,production:false,shippingMigrationChanged:false,
  method:'Actual installed guard and accepted score RPC; default planner;30 rollback timing samples; nested auto_explain separate from timing',
  fixtureBoundary:'CHECK/NOT NULL/UNIQUE-valid RESTORED records; only provider quiesce FK prerequisite omitted with replica mode during fixture INSERT',
  limitations:['Synthetic local records, not provider/restoration certification','Nested plan work overlaps, do not sum into request time/unique rows',
   'P99 not proven by30 samples;host scheduling can affect latency','Before plan drops only the candidate index in a disposable database; after reinstalls the exact installed definition'],rows};
 try{
  seedSyntheticSideGameHistory(c,f.database,1);
  const installedIndex=sql(c,f.database,`select pg_get_indexdef('production_control.${indexName}'::regclass)`);
  evidence.indexDefinition=installedIndex;
  const original=sql(c,f.database,"select prosrc from pg_proc where oid='production_control.assert_no_unrestored_google_writer_fence_rehearsal()'::regprocedure");
  evidence.guardSourceSha256=hash(original);
  for(const count of [0,100,1000])await t.test(`${count} restored rehearsal records`,()=>{
   const d=cloneScoreProofDatabase(f,`fence_${count}`);seedRestoredHistory(c,d,count);
   sql(c,d,`drop index production_control.${indexName};`);
   const scoreSql=rpcSql('submit_production_hole_score',inputFor(c,d)),entry={restoredRows:count,before:{},after:{}};
   for(const phase of ['before','after']){
    if(phase==='after'){
     const start=performance.now(),r=sqlResult(c,d,`\\timing on
      ${installedIndex};
      \\timing off`);
     assert.equal(r.status,0);const measured=[...(r.stdout+'\n'+r.stderr).matchAll(/Time:\s+([0-9.]+)\s+ms/g)];assert.equal(measured.length,1);
     entry.indexBuild={databaseMs:Number(measured[0][1]),clientWallMs:performance.now()-start,
      definition:sql(c,d,`select pg_get_indexdef('production_control.${indexName}'::regclass)`)};sql(c,d,`analyze production_control.${relation}`);
    }
    entry[phase].guardPlan=capture(c,d,guardSql,validateGuard);entry[phase].scorePlan=capture(c,d,scoreSql,validateScore);
    for(const plans of [entry[phase].guardPlan,entry[phase].scorePlan]){
     assert.ok(plans.scans.every(s=>s.actualRows===0));
     if(phase==='before')assert.ok(plans.scans.some(s=>s.nodeType==='Seq Scan'&&s.rowsRemovedByFilter===count));
     else if(count>0)assert.ok(plans.scans.every(s=>s.index===indexName&&s.rowsRemovedByFilter===0),'default planner excludes irrelevant restored rows');
    }
    entry[phase].guard=timings(c,d,guardSql,validateGuard);entry[phase].score=timings(c,d,scoreSql,validateScore);
    if(count===1000)entry[phase].truthTable=truthTable(c,d,scoreSql);
   }
   assert.equal(sql(c,d,"select prosrc from pg_proc where oid='production_control.assert_no_unrestored_google_writer_fence_rehearsal()'::regprocedure"),original);
   rows.push(entry);
  });t.diagnostic(JSON.stringify(evidence));
 }finally{await destroyIsolatedCluster(c);}
});
