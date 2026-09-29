// Proof layers: POSTGRESQL / PERFORMANCE / INTEGRATION.
// Adds terminal prior-year fixture history only; actual annual admission remains installed.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
const literal=value=>`'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`;
const uuid=value=>{const h=createHash('sha256').update(value).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;};
const describe=values=>{const sorted=[...values].sort((a,b)=>a-b);return{sampleCount:values.length,p50Ms:(sorted[9]+sorted[10])/2,maxMs:sorted.at(-1),p95:null,p99:null,tailStatus:'INSUFFICIENT_SAMPLE',samplesMs:values};};
export function runProtectedAnnualHistoryProof({query,baselineDatabase,annualInput,recoveryInput,directorAuthorization}){
 assert.match(baselineDatabase,/^[a-z][a-z0-9_]{0,62}$/);
 const rows=[];
 for(const scale of[1,2,5,10]){
  const database=`phase2c_annual_history_${scale}`,years=4*scale;
  query('postgres',`create database ${database} template ${baselineDatabase}`,{role:''});
  query(database,`alter database ${database} set statement_timeout='5000ms';alter database ${database} set timezone='UTC'`,{role:''});
  // A four-year base is a documented stress profile, not a claim that four full
  // annual archives exist today. Each retained year has the actual24×18=432
  // tournament hole shape, three derived-family intents/hole and five current
  // competition keys. Terminal histories cannot become eligible current work.
  query(database,`begin;set local statement_timeout='30s';set local session_replication_role=replica;
   insert into scoring_authority.tournaments
    select populated.* from scoring_authority.tournaments source cross join generate_series(2050,${2049+years}) y
    cross join lateral jsonb_populate_record(null::scoring_authority.tournaments,
     to_jsonb(source)||jsonb_build_object('tournament_id',y::text,'tournament_year',y))populated
    where source.tournament_id='2099';
   insert into scoring_authority.competition_recalculation_jobs
    select populated.* from scoring_authority.competition_recalculation_jobs source cross join generate_series(2050,${2049+years}) y
    cross join lateral jsonb_populate_record(null::scoring_authority.competition_recalculation_jobs,
     to_jsonb(source)||jsonb_build_object('tournament_id',y::text,'status','SUCCEEDED','runtime_generation_id',null,
      'requested_source_revision',jsonb_build_object('syntheticArchiveYear',y),'requested_at','2020-01-01T00:00:00Z','updated_at','2020-01-01T00:00:01Z','claimed_by',null,'claim_token',null,
      'lease_expires_at',null,'delivery_attempts',1,'delivery_dead_letter_at',null,'delivery_error_class',null,
      'started_at','2020-01-01T00:00:00Z','completed_at','2020-01-01T00:00:01Z'))populated
    where source.tournament_id='2099'and source.round_number=0;
   insert into scoring_authority.score_derived_intents_v1
    select populated.* from(select *from scoring_authority.score_derived_intents_v1 where tournament_id='2099'limit 1)source
    cross join generate_series(2050,${2049+years}) y cross join generate_series(1,432)n
    cross join(values('CALCUTTA'),('NET_SKINS'),('COMPETITION'))family(name)
    cross join lateral jsonb_populate_record(null::scoring_authority.score_derived_intents_v1,
     to_jsonb(source)||jsonb_build_object('intent_id',md5('annual-history:'||y||':'||n||':'||family.name)::uuid,
      'tournament_id',y::text,'match_id',y||'-R'||(case when n<=108 then 1 when n<=216 then 2 else 3 end)||'-'||
       (case when n<=108 then 1+(n-1)/18 when n<=216 then 1+(n-109)/18 else 1+(n-217)/18 end),
      'round_number',case when n<=108 then 1 when n<=216 then 2 else 3 end,'source_transaction',n,
      'family',family.name,'canonical_revision',jsonb_build_object('syntheticArchiveYear',y,'hole',1+(n-1)%18),
      'runtime_generation_id',null,'status','SUCCEEDED','attempts',1,'last_sqlstate',null,
      'created_at','2020-01-01T00:00:00Z','available_at','2020-01-01T00:00:00Z',
      'completed_at','2020-01-01T00:00:01Z','updated_at','2020-01-01T00:00:01Z'))populated;
   insert into production_control.score_derived_delivery_attempts_v1(tournament_id,family,work_identity,cycle,attempt,transition,
      safe_code,worker_id,runtime_generation_id,originating_activation_revision,processor_contract,recorded_at)
    select tournament_id,'INTENT',intent_id::text,1,1,'SUCCEEDED',null,'synthetic-retained-history',null,null,
     'score-derived-delivery-v1','2020-01-01T00:00:01Z' from scoring_authority.score_derived_intents_v1 where tournament_id between'2050'and'2089';
   commit;
   analyze scoring_authority.tournaments;analyze scoring_authority.competition_recalculation_jobs;
   analyze scoring_authority.score_derived_intents_v1;analyze production_control.score_derived_delivery_attempts_v1;`,{role:''});
  const counts=JSON.parse(query(database,`select jsonb_build_object(
   'years',(select count(*)from scoring_authority.tournaments where tournament_id between'2050'and'2089'),
   'competitionJobs',(select count(*)from scoring_authority.competition_recalculation_jobs where tournament_id between'2050'and'2089'),
   'intents',(select count(*)from scoring_authority.score_derived_intents_v1 where tournament_id between'2050'and'2089'),
   'deliveryAttempts',(select count(*)from production_control.score_derived_delivery_attempts_v1 where tournament_id between'2050'and'2089'))`));
  assert.equal(counts.years,years);assert.equal(counts.competitionJobs,years*5);
  assert.equal(counts.intents,years*432*3);assert.equal(counts.deliveryAttempts,counts.intents);
  const claim={...annualInput,annual_scoring_operation:'claim_competition_derived_jobs',worker_id:'phase2c-annual-history',engine_keys:['TEAM_MOMENTUM'],lease_seconds:60};
  const tick={...annualInput,annual_scoring_operation:'score_derived_delivery_tick_v1',contract_version:'score-derived-delivery-v1',materialization_family:'COMPETITION',worker_id:'phase2c-annual-history',operation_id:uuid(`annual-history:${scale}:tick`)};
  const marker=JSON.parse(query(database,"select to_jsonb(v)from scoring_authority.competition_recalculation_jobs v where tournament_id='2099'and round_number=0 and engine_key='TEAM_MOMENTUM'"));
  assert.ok(marker);const requeue={...annualInput,annual_scoring_operation:'requeue_score_derived_delivery_v1',contract_version:'score-derived-delivery-v1',
   family:'COMPETITION',work_identity:'2099:0:TEAM_MOMENTUM',request_id:uuid(`annual-history:${scale}:requeue`),
   expected_cycle:marker.delivery_cycle,expected_attempt:5,reason:'Synthetic isolated cause corrected',authorization:directorAuthorization};
  const statements={
   CURRENT_TICK:`begin;set local statement_timeout='5s';select public.dispatch_production_annual_scoring_v1(${literal(tick)});rollback;`,
   NONEMPTY_COMPETITION_CLAIM:`begin;set local statement_timeout='5s';select public.dispatch_production_annual_scoring_v1(${literal(claim)});rollback;`,
   OWNED_RECOVERY:`begin;set local statement_timeout='1s';select public.dispatch_production_annual_scoring_v1(${literal(recoveryInput)});rollback;`,
   OWNER_REQUEUE:`begin;set local statement_timeout='5s';set local session_replication_role=replica;
    update scoring_authority.competition_recalculation_jobs set status='FAILED',attempts=5,delivery_attempts=5,
     delivery_dead_letter_at=clock_timestamp(),delivery_error_class='TERMINAL',completed_at=clock_timestamp(),
     claimed_by=null,claim_token=null,lease_expires_at=null where tournament_id='2099'and round_number=0 and engine_key='TEAM_MOMENTUM';
    set local session_replication_role=origin;set local "request.jwt.claim.role"='service_role';select public.dispatch_production_annual_scoring_v1(${literal(requeue)});rollback;`
  };
  const operations={};
  for(const [operation,statement]of Object.entries(statements)){
   const times=[];
   for(let sample=0;sample<20;sample++){
    const start=performance.now(),result=JSON.parse(query(database,statement,{role:operation==='OWNER_REQUEUE'?'':'service_role'}));times.push(performance.now()-start);
    assert.equal(result.ok,true,operation);
    if(operation==='CURRENT_TICK')assert.equal(result.scope.tournamentId,'2099');
    if(operation==='NONEMPTY_COMPETITION_CLAIM')assert.equal(result.claims.length,1);
    if(operation==='OWNED_RECOVERY')assert.equal(result.status,'COMMITTED');
    if(operation==='OWNER_REQUEUE'){assert.equal(result.idempotent,false);assert.equal(result.cycle,marker.delivery_cycle+1);}
   }
   operations[operation]={...describe(times),successCount:20,failureCount:0,
    statementTimeoutMs:operation==='OWNED_RECOVERY'?1000:5000};
  }
  const plans={};
  for(const [name,statement]of Object.entries({
   currentIntent:`select intent_id from scoring_authority.score_derived_intents_v1 where tournament_id='2099'and family='COMPETITION'and status in('PENDING','RETRYABLE')order by available_at,created_at,intent_id limit 8`,
   currentCompetition:`select *from scoring_authority.competition_recalculation_jobs where tournament_id='2099'and round_number=0 and engine_key='TEAM_MOMENTUM'`,
   exactRecovery:`select *from scoring_authority.score_mutations where match_id='2099-R3-1'and mutation_key=${literal(recoveryInput.mutation_key)}#>>'{}'`
  }))plans[name]=JSON.parse(query(database,`explain(analyze,buffers,format json)${statement}`,{role:''}));
  assert.equal(query(database,"select count(*)from scoring_authority.hole_scores where match_id='2099-R3-1'"),'1');
  rows.push({scale,counts,operations,plans});
 }
 return{fixtureVersion:'protected2099-retained-worker-history-v1',seed:'phase2c-annual-history-20260928',environment:'ISOLATED_LOCAL_POSTGRESQL17',
  runtimeGuardsSubstituted:false,historyScales:[1,2,5,10],baselineYears:4,model:'Four retained years per scale,432 tournament holes/year×3 terminal derived intents,5 competition current keys/year; matching delivery-attempt audit rows',
  measurement:'Client process+connection+SQL wall time,20 repeated rollback-only operations per cell; query plans are separate exact current selectors, not full nested PL/pgSQL plans',
  results:rows,limitations:['Synthetic terminal prior-year histories; financial job/result history growth is a separate fixture',
   'No annual full-format chronology, financial calculation/publication, hosted capacity or Production latency claim',
   'P95/P99 not asserted from20samples; scale medians and maximums are descriptive, not universal capacity guarantees']};
}
