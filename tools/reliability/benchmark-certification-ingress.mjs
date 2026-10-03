#!/usr/bin/env node
// Owned PostgreSQL17 only; no connection string/resource arguments. Rollback
// samples measure real new-admission/new-score execution, never idempotent no-op.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createCertificationFixture} from '../../test/support/reliability/phase2d-certification-fixture.mjs';
import {destroyIsolatedCluster,jsonLiteral,timedSqlSamples,repositoryRoot} from '../../test/support/reliability/postgres17.mjs';
import {buildTournamentSetupMutation} from '../../lib/production-tournament-setup-contract.js';
import {syntheticActor} from '../../test/support/reliability/synthetic-tournament.mjs';
import {certificationProvisionalProfile} from '../../test/support/reliability/certification-provisional-profile.mjs';

assert.equal(process.argv.length,2,'This benchmark accepts no remote target or arbitrary arguments');
const forwardMigrations=certificationProvisionalProfile;
const hash=value=>createHash('sha256').update(value).digest('hex');
const measuredSource=[...forwardMigrations,'tools/reliability/benchmark-certification-ingress.mjs',
 'test/support/reliability/postgres17.mjs','test/support/reliability/phase2d-certification-fixture.mjs',
 'test/support/reliability/phase2d-resource-bootstrap.mjs','tools/reliability/canonical-bootstrap-artifacts.mjs',
 'test/support/reliability/certification-provisional-profile.mjs'];
const sourceBefore=await Promise.all(measuredSource.map(async file=>({file,sha256:hash(await readFile(path.join(repositoryRoot,file)))})));
const count=100,batches=3,baseHistory=432,scales=[1,2,5,10];
const quantiles=values=>{
 const sorted=[...values].sort((a,b)=>a-b),pick=p=>sorted[Math.ceil(p*sorted.length)-1];
 const mean=values.reduce((a,b)=>a+b,0)/values.length;
 return{count:values.length,success:values.length,failures:0,p50:pick(.5),p95:pick(.95),p99:values.length>=1000?pick(.99):null,
  p99Status:values.length>=1000?'EMPIRICAL_ONLY':'NOT_PROVEN',max:sorted.at(-1),mean,
  standardDeviation:Math.sqrt(values.reduce((s,n)=>s+(n-mean)**2,0)/values.length)};
};
const f=await createCertificationFixture({forwardMigrations});
const evidence={fixture:'CERTIFICATION_INGRESS_HISTORY_V1',environment:'OWNED_LOCAL_POSTGRESQL17',
 provisionalProfile:true,completeCandidateCertified:false,forwardMigrations,
 nodeVersion:process.version,postgresVersion:f.q('select version()'),workerActivity:'NO_CONCURRENT_WORKERS',
 finiteStatementTimeoutMs:5000,
 method:'psql timing of one real RPC inside a rollback-only sample; persistent socket within each batch',
 historyConstruction:'Actual admission then separate committed authoritative resolution; old generations closed and successor opened by owned fixture helper',
 baseHistory,scales,batches,samplesPerBatch:count,seed:'deterministic history cardinalities; random UUID operation identities',
 limitations:['Local warm-cache query-path evidence, not hosted/Production capacity.',
  'Sample execution rolls back; durable commit/restart semantics are proven by separate behavioral suites.',
  'Terminal outcome/receipt/audit are atomic inside canonical execution; no independent terminal transaction exists.',
  'p99 is NOT PROVEN with300 samples per operation/scale.',
  'Internal statement count and separately instrumented lock-hold duration are not measured here.',
  'Only the explicitly listed forward migration profile is measured; performance alone does not certify the complete candidate.'],results:[],plans:[],sourceBefore};
const admittedExecute=input=>{
 const lease=f.rpc('admit_certification_operation_v1',input);
 const result=f.rpc('execute_certification_operation_v1',{...input,ingress:{lease_id:lease.lease_id,admission_generation_id:lease.admission_generation_id}});
 assert.equal(result.ok,true);return result;
};
const matchId='2026-R1-6';
const match=()=>JSON.parse(f.q(`select to_jsonb(m)from scoring_authority.matches m where match_id='${matchId}'`));
const generation=()=>JSON.parse(f.q("select to_jsonb(g)from production_control.certification_ingress_generations_v1 g where state='OPEN'"));
const closeReopen=()=>{
 const gen=generation();
 const closed=JSON.parse(f.q(`select production_control.close_certification_ingress_generation_v1('${f.resource.resource_id}','${gen.generation_id}',${gen.revision})`));
 assert.equal(closed.drained,true);
 return JSON.parse(f.q(`select production_control.reopen_certification_ingress_generation_v1('${f.resource.resource_id}','${gen.generation_id}',${closed.generation_revision})`));
};
try{
 const id=randomUUID(),payload=buildTournamentSetupMutation('prepare-scoring-context',{
  expectedRevision:f.model().revision,operationRequestId:id,matchId});delete payload.operation_request_id;
 admittedExecute(f.command('DIRECTOR.MUTATE_SETUP',{...payload,action:'prepare-scoring-context'},{operation_request_id:id}));
 for(const action of ['mark-live','access-activate']){
  const m=match();admittedExecute(f.command('DIRECTOR.MATCH_CONTROL',{action,match_id:matchId,
   expected_match_revision:m.match_revision,expected_permission_revision:m.permission_revision}));
 }
 let histories=0;
 for(const scale of scales){
  const add=baseHistory*scale-histories;
  const template=f.command('DIRECTOR.MUTATE_SETUP',{action:'update-tournament',tournament_name:'Synthetic history, never executed'});
  const keys=Array.from({length:add},()=>randomUUID());
  const inputs=keys.map(operation_request_id=>({...template,operation_request_id}));
  // These are fixture history admissions, not claims about concurrent user load.
  // Each batch is committed before the separate resolution transaction.
  for(let offset=0;offset<inputs.length;offset+=100){
   const selected=inputs.slice(offset,offset+100);
   const admit=selected.map(input=>`select public.admit_certification_operation_v1(${jsonLiteral(input)});`).join('\n');
   f.q('begin;set local role service_role;'+admit+'commit;','service_role');
   const resolve=selected.map(input=>`select public.resolve_certification_ingress_v1(${jsonLiteral(input)});`).join('\n');
   const result=f.q('begin;set local role service_role;'+resolve+'commit;','service_role').split('\n').filter(Boolean).map(JSON.parse);
   assert.equal(result.length,selected.length);assert.ok(result.every(value=>value.state==='NOT_COMMITTED'));
  }
  histories+=add;
  closeReopen();
  f.q('analyze production_control.certification_ingress_leases_v1;analyze production_control.certification_ingress_generations_v1;');
  const m=match(),key='ingress-benchmark:'+scale+':'+randomUUID();
  const score=f.command('SCORING.SUBMIT_HOLE',{match_id:matchId,mutation_key:key,hole_number:1,
   expected_match_revision:m.match_revision,expected_hole_revision:0,team_1_gross_scores:[4,4],team_2_gross_scores:[5,5]},
   {operation_request_id:key,authorization:{tournament_id:'2026',role:'PLAYER',auth_user_id:syntheticActor.authUserId,
    player_id:syntheticActor.playerId,match_id:matchId,permission_revision:m.permission_revision}});
  const lease=f.rpc('admit_certification_operation_v1',score);
  const execution={...score,ingress:{lease_id:lease.lease_id,admission_generation_id:lease.admission_generation_id}};
  const newKey=key+':admit',newAdmission={...score,operation_request_id:newKey,payload:{...score.payload,mutation_key:newKey}};
  const status={...score,payload:{match_id:matchId}};
  const readContext=f.context('READS');
  const currentRead={contract_version:'certification-runtime-v1',resource:f.resource,deployment:f.deployment,
   phase:'READS',expected_context_token:readContext.context_token,operation:'READS.CURRENT_VIEW',
   payload:{surface:'LEADERBOARDS',target_tournament_id:'2026'}};
  const handshake={contract_version:'certification-runtime-v1',resource:f.resource,deployment:f.deployment,phase:'READS'};
  const operations=[
   ['admission','admit_certification_operation_v1',newAdmission,v=>assert.equal(v.state,'ADMITTED')],
   ['canonicalExecutionIncludingTerminal','execute_certification_operation_v1',execution,v=>{
    assert.equal(v.ok,true);assert.equal(v.code,'ACCEPTED');assert.notEqual(v.idempotent,true);assert.notEqual(v.semantic_noop,true);}],
   ['recovery','read_certification_ingress_status_v1',status,v=>assert.equal(v.state,'ADMITTED')],
   ['contextHandshake','read_certification_runtime_context_v1',handshake,v=>{
    assert.equal(v.context.resource_id,f.resource.resource_id);assert.equal(v.context.current_tournament_id,'2026');}],
   ['currentRead','read_certification_projection_v1',currentRead,v=>{
    // READS.CURRENT_VIEW preserves read_leaderboards_core_view's canonical
    // tournament row DTO; its key is tournament_id, not the UI alias id.
    assert.equal(v.ok,true);assert.equal(v.data.tournament.tournament_id,'2026');
    assert.equal(v.data.tournament.tournament_year,2026);}],
  ];
  const record={scale,irrelevantTerminalHistory:histories,operations:{},batches:[]};
  for(const [name,rpc,input,validate]of operations){
   const statement=`select public.${rpc}(${jsonLiteral(input)})`,setup="set local role service_role;set local statement_timeout='5s';";
   const validateResult=text=>{
    const value=JSON.parse(text);
    try{validate(value);}catch(error){
     // Shape and bounded contract discriminators only. Never emit response
     // bodies, arbitrary values, identities or database error details.
     const safeCode=value=>typeof value==='string'&&/^[A-Z][A-Z0-9_]{0,127}$/.test(value)?value:null;
     process.stdout.write(JSON.stringify({event:'BENCHMARK_SEMANTIC_REJECTION',scale,operation:name,rpc,
      keys:Object.keys(value||{}),ok:typeof value?.ok==='boolean'?value.ok:null,
      code:safeCode(value?.code),state:safeCode(value?.state),
      dataKeys:value?.data&&typeof value.data==='object'?Object.keys(value.data):[],
      tournamentKeys:value?.data?.tournament&&typeof value.data.tournament==='object'?Object.keys(value.data.tournament):[]})+'\n');
     throw error;
    }
   };
   process.stdout.write(JSON.stringify({event:'BENCHMARK_OPERATION',scale,operation:name,stage:'warmup'})+'\n');
   timedSqlSamples(f.cluster,f.database,statement,5,{setup,validateResult});
   const values=[];
   for(let batch=1;batch<=batches;batch++){
    const timings=timedSqlSamples(f.cluster,f.database,statement,count,{setup,validateResult});
    values.push(...timings);record.batches.push({operation:name,batch,...quantiles(timings)});
   }
   record.operations[name]={...quantiles(values),topLevelRpcStatementsPerSample:1,samplesMs:values};
  }
  const plans=[
   ['exactActorOperation',`select * from production_control.certification_ingress_leases_v1 where resource_id='${f.resource.resource_id}'and operation_id='SCORING.SUBMIT_HOLE'and operation_request_id='${key}'`],
   ['currentGeneration',`select * from production_control.certification_ingress_leases_v1 where resource_id='${f.resource.resource_id}'and admission_generation_id='${lease.admission_generation_id}'order by admission_sequence`],
   ['resourceSingleton',`select * from production_control.canonical_resource_v1 where singleton`],
   ['currentPointer',`select * from production_control.current_tournament_pointer_v1 where scope_key='${f.resource.resource_id}'`],
  ];
  for(const [query,sql]of plans)evidence.plans.push({scale,query,plan:JSON.parse(f.q('explain(analyze,buffers,format json)'+sql))});
  assert.equal(f.rpc('resolve_certification_ingress_v1',score).state,'NOT_COMMITTED');
  const gen=generation();
  for(const [name,statement]of [
   ['fingerprint',`select production_control.certification_ingress_evidence_v1('${f.resource.resource_id}','${gen.generation_id}')`],
   ['closeDrain',`select production_control.close_certification_ingress_generation_v1('${f.resource.resource_id}','${gen.generation_id}',${gen.revision})`],
  ]){
   const values=timedSqlSamples(f.cluster,f.database,statement,count,{setup:"set local statement_timeout='5s';",
    validateResult:text=>{const v=JSON.parse(text);assert.equal(v.active_count,0);assert.equal(v.unknown_count,0);if(name==='closeDrain')assert.equal(v.drained,true);}});
   record.operations[name]={...quantiles(values),samplesMs:values};
  }
  assert.equal(f.q(`select count(*)from scoring_authority.hole_scores where match_id='${matchId}'`),'0','Timed scores fully rollback');
  evidence.results.push(record);
  process.stdout.write(JSON.stringify({environment:evidence.environment,scale,history:histories,operations:Object.fromEntries(Object.entries(record.operations).map(([k,v])=>[k,{p50:v.p50,p95:v.p95,max:v.max}]))})+'\n');
 }
 evidence.sourceAfter=await Promise.all(measuredSource.map(async file=>({file,sha256:hash(await readFile(path.join(repositoryRoot,file)))})));
 assert.deepEqual(evidence.sourceBefore,evidence.sourceAfter,'Source must remain stable during benchmark');
 evidence.googleJobs=Number(f.q('select count(*)from scoring_authority.google_outbox_events'));
 assert.equal(evidence.googleJobs,0);evidence.status='MEASURED_NOT_PRODUCTION';
 const directory=path.join(repositoryRoot,'docs/reliability/phase2d-resource-model/implementation-evidence');
 await mkdir(directory,{recursive:true});await writeFile(path.join(directory,'ingress-performance.json'),JSON.stringify(evidence,null,2)+'\n');
}finally{await destroyIsolatedCluster(f.cluster);}
