// Proof layers: POSTGRESQL / INTEGRATION / PERFORMANCE / CONCURRENCY.
// Owned socket-only fixture. Local architecture/observations, NOT provider capacity.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir,writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { createPhase2CFixture } from './support/reliability/phase2c-fixture.mjs';
import { cloneScoreProofDatabase,inputFor,rpc,scoringOracle } from './support/reliability/phase2-score-fixture.mjs';
import { sql,jsonLiteral,openSqlSession,destroyIsolatedCluster,repositoryRoot } from './support/reliability/postgres17.mjs';
import { configureFiniteTimeout } from './support/reliability/phase2c-install.mjs';
import { seedSyntheticSideGameHistory } from './support/reliability/synthetic-history.mjs';
import { prepareLocalScoreDerivedWorkerFixture,startLocalScoreDerivedWorker,assertLocalDerivedCurrent } from './support/reliability/phase2c-worker.mjs';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const artifact=path.join(repositoryRoot,'docs/reliability/phase2c/evidence/backlog-tail-results.json');
const summarize=values=>{const v=[...values].sort((a,b)=>a-b);return{samples:v.length,
 p50Ms:v.length?v[Math.ceil(v.length*.5)-1]:null,p95Ms:v.length>=100?v[Math.ceil(v.length*.95)-1]:null,
 p99Ms:v.length>=1000?v[Math.ceil(v.length*.99)-1]:null,maxMs:v.at(-1)??null,
 tailStatus:v.length>=1000?'EMPIRICAL_1000_PLUS':'INSUFFICIENT_SAMPLE',valuesMs:values};};
const snapshot=(c,d)=>JSON.parse(sql(c,d,`select jsonb_build_object(
 'pendingIntents',(select count(*)from scoring_authority.score_derived_intents_v1 where tournament_id='2026'and status<>'SUCCEEDED'),
 'intents',(select count(*)from scoring_authority.score_derived_intents_v1 where tournament_id='2026'),
 'holes',(select count(*)from scoring_authority.hole_scores where match_id like '2026-R1-%'),
 'receipts',(select count(*)from scoring_authority.score_mutations where match_id like '2026-R1-%'and mutation_type='HOLE_SCORE'))`));
const financialSnapshot=(c,d)=>sql(c,d,`select encode(extensions.digest(jsonb_build_object(
 'calcuttaConfiguration',(select to_jsonb(c)-'updated_at'-'state'-'result_revision'-'last_error_code'-'last_error_safe'from scoring_authority.calcutta_v1_current c where tournament_id='2026'),
 'auctionFacts',(select coalesce(jsonb_agg(to_jsonb(a)order by auction_revision),'[]')from scoring_authority.calcutta_v1_auction_fact_revisions a where tournament_id='2026'),
 'calcuttaPublications',(select count(*)from scoring_authority.calcutta_v1_publication_revisions where tournament_id='2026'),
 'netSkinsConfiguration',(select to_jsonb(c)from scoring_authority.net_skins_v1_configuration_current c where tournament_id='2026'),
 'netSkinsResults',(select count(*)from scoring_authority.net_skins_v1_result_revisions where tournament_id='2026'),
 'oddsPublications',(select count(*)from scoring_authority.odds_published_snapshots where tournament_id='2026'))::text,'sha256'),'hex')`);
const sampleSql=`select jsonb_build_object('observedAt',clock_timestamp(),'connections',count(*),
 'active',count(*)filter(where state='active'),'idleInTransaction',count(*)filter(where state='idle in transaction'),
 'lockWaitingSessions',count(*)filter(where wait_event_type='Lock'),
 'workerConnections',count(*)filter(where application_name='phase2c-owned-delivery-child'),
 'scoreConnections',count(*)filter(where application_name like 'p2c-pressure-score-%'),
 'ungrantedLocks',(select count(*)from pg_locks l where not l.granted and l.pid in(
  select pid from pg_stat_activity where datname=current_database()and pid<>pg_backend_pid())),
 'blockedSessions',count(*)filter(where cardinality(pg_blocking_pids(pid))>0))
 from pg_stat_activity where datname=current_database()and pid<>pg_backend_pid()`;

// This connection-local timing wrapper calls the UNCHANGED actual public RPC.
// dbFunctionWallMs excludes the outer COMMIT acknowledgement; it is not CPU time,
// exact transaction duration, or a sum of nested plan instrumentation durations.
const measureWrapper=`create function pg_temp.measure_actual_score_v1(input jsonb)returns jsonb
 language plpgsql as $measure$ declare began timestamptz;answer jsonb;pending_before boolean;begin
 select exists(select 1 from scoring_authority.score_derived_intents_v1 where tournament_id='2026'and family in ('CALCUTTA','COMPETITION')and status<>'SUCCEEDED' limit 1) into pending_before;
 began:=clock_timestamp();answer:=public.submit_production_hole_score(input);
 return jsonb_build_object('result',answer,'pendingImmediatelyBeforeScore',pending_before,'dbFunctionWallMs',extract(epoch from(clock_timestamp()-began))*1000,'lockHeldThroughRpcMs',extract(epoch from(clock_timestamp()-current_setting('bagger.test_lock_acquired')::timestamptz))*1000);
 end $measure$;`;

// Repeated fresh six-group bursts. No synthetic delay/barrier holds worker work.
// Only actual ACCEPTED ordinary writes with pending AUTOMATIC demand immediately
// before submit enter the backlog distribution; every other sample is retained.
test('P2C-B-BACKLOG-TAIL: empirical score and lock bounds during repeated autonomous drain',
 {timeout:1800000,concurrency:false},async t=>{
 let f;const evidence={schemaVersion:1,id:'P2C-B-BACKLOG-TAIL',requirements:['P2C-027'],
 environment:'OWNED_SOCKET_ONLY_POSTGRESQL17',production:false,startedAt:new Date().toISOString(),profiles:[],
 method:{targetQualifiedSamplesPerProfile:1000,maximumBurstsPerProfile:100,groups:6,measuredHolesPerGroup:6,
 workerIntervalMs:250,scoreStatementTimeoutMs:1000,workerStatementTimeoutMs:5000,
 qualification:'EXISTS pending CALCUTTA or COMPETITION intent immediately before unchanged actual submit body',
 lockLower:'clock after actual match FOR UPDATE through RPC return; includes bounded instrumentation',
 lockUpper:'persistent-session autocommit RPC wall time through response after COMMIT; includes socket/client scheduling'},
 limitations:['Repeated independent tournament bursts, pooled only within identical preload/profile; not a continuously occupied tournament or Production capacity',
 'Empirical p99 has roughly ten or more tail observations, no confidence interval or provider SLO',
 'Lock duration is bracketed, not an exact durable COMMIT timestamp; fsync disabled',
 'Rejected and NO_CHANGE requests cannot enter samples; nonqualifying accepted samples are retained and excluded from backlog percentiles',
 'No sleep/barrier slows worker to manufacture backlog; configured250ms is the supported runner default',
 'Separate sampler/clock instrumentation adds overhead. CPU/IOPS and continuous wait maxima are unavailable']};
 try{
  f=await createPhase2CFixture();const c=f.cluster;
  sql(c,f.database,`alter database ${f.database} set statement_timeout='30000ms'`,{role:''});
  seedSyntheticSideGameHistory(c,f.database,1);prepareLocalScoreDerivedWorkerFixture(c,f.database);
  configureFiniteTimeout(c,f.database,1000);evidence.fixture=f.phase2c;
  const original=sql(c,f.database,"select pg_get_functiondef('public.submit_production_hole_score(jsonb)'::regprocedure)",{role:''});
  const anchor="if not found then return jsonb_build_object('ok', false, 'code', 'MATCH_NOT_FOUND'); end if;";
  assert.equal(original.split(anchor).length,2);
  sql(c,f.database,original.replace(anchor,anchor+"\nperform set_config('bagger.test_lock_acquired',clock_timestamp()::text,true);"),{role:''});
  evidence.instrumentation='Test-only clock immediately after existing match lock/FOUND check; no control/calculation/authorization replacement';
  for(const profile of [{name:'normal_preload_one_hole',preloadHoles:1,expectedDemand:18},
   {name:'larger_preload_six_holes',preloadHoles:6,expectedDemand:108}]){
   await t.test(profile.name,async()=>{
    const row={...profile,result:'FAIL',bursts:[],qualified:[],nonqualifying:[]};evidence.profiles.push(row);
    for(let repetition=0;row.qualified.length<1000&&repetition<100;repetition++){
     const d=cloneScoreProofDatabase(f,'tails_'+profile.preloadHoles+'_'+repetition),sessions=[];
     const burst={repetition,database:d,result:'FAIL',measurements:[]};row.bursts.push(burst);
     let worker,monitor,sampler,stopSampler=false,samplerError,lastCommitAt=0;const samples=[];
     try{
      const initial=snapshot(c,d);assert.equal(initial.holes,0);assert.equal(initial.pendingIntents,0);
      const financial=financialSnapshot(c,d);
      for(let h=1;h<=profile.preloadHoles;h++)for(let m=1;m<=6;m++){
       assert.equal(rpc(c,d,'submit_production_hole_score',inputFor(c,d,`2026-R1-${m}`,h,
        {key:`tails:${profile.name}:${repetition}:${m}:${h}`})).code,'ACCEPTED');
      }
      burst.initialBacklog=snapshot(c,d);assert.equal(burst.initialBacklog.pendingIntents,profile.expectedDemand);
      const oracles=Array.from({length:6},(_,m)=>scoringOracle(c,d,`2026-R1-${m+1}`));
      for(let m=1;m<=6;m++){
       const session=openSqlSession(c,d);sessions.push(session);
       await session.query(`set application_name='p2c-pressure-score-${m}'`);
       assert.equal(await session.query('show statement_timeout'),'1s');await session.query(measureWrapper);
      }
      monitor=openSqlSession(c,d);await monitor.query("set application_name='p2c-pressure-sampler'");
      const sample=async()=>samples.push({...JSON.parse(await monitor.query(sampleSql)),clientObservedAt:Date.now()});
      await sample();sampler=(async()=>{while(!stopSampler){await sample();await sleep(25);}})().catch(e=>{samplerError=e;});
      worker=await startLocalScoreDerivedWorker({cluster:c,database:d,workerId:'phase2c-tail-'+repetition,intervalMs:250});
      for(let hole=profile.preloadHoles+1;hole<=profile.preloadHoles+6;hole++){
       const inputs=Array.from({length:6},(_,m)=>inputFor(c,d,`2026-R1-${m+1}`,hole,
        {key:`tails:${profile.name}:${repetition}:${m+1}:${hole}`}));
       await Promise.all(inputs.map(async(input,index)=>{
        const start=performance.now();const timed=JSON.parse(await sessions[index].query(`select pg_temp.measure_actual_score_v1(${jsonLiteral(input)})`));
        const wall=performance.now()-start;assert.equal(timed.result.code,'ACCEPTED');assert.notEqual(timed.result.idempotent,true);
        assert.equal(timed.result.match_id,input.match_id);assert.equal(timed.result.hole_number,hole);
        assert.equal(timed.result.match_revision,input.expected_match_revision+1);assert.equal(timed.result.hole_revision,input.expected_hole_revision+1);
        const expected=oracles[index].hole(hole,input.team_1_gross_scores,input.team_2_gross_scores);
        assert.deepEqual(timed.result.gross,{team_1:input.team_1_gross_scores,team_2:input.team_2_gross_scores});
        assert.deepEqual(timed.result.strokes,expected.strokes);assert.deepEqual(timed.result.net,expected.net);assert.equal(timed.result.hole_winner,expected.winner);
        assert.ok(timed.lockHeldThroughRpcMs>0&&timed.lockHeldThroughRpcMs<=timed.dbFunctionWallMs+.1&&timed.dbFunctionWallMs<=wall+.1);
        lastCommitAt=Math.max(lastCommitAt,Date.now());
        const measured={repetition,match:input.match_id,hole,mutation:input.mutation_key,result:'ACCEPTED',
         pendingAutomaticBeforeScore:timed.pendingImmediatelyBeforeScore,lockHeldThroughRpcMs:timed.lockHeldThroughRpcMs,
         dbFunctionWallMs:timed.dbFunctionWallMs,transactionWallUpperMs:wall};
        burst.measurements.push(measured);(timed.pendingImmediatelyBeforeScore?row.qualified:row.nonqualifying).push(measured);
       }));
      }
      const receipts=JSON.parse(sql(c,d,`select jsonb_agg(jsonb_build_object('mutation',mutation_key,'match',match_id,'hole',hole_number))
       from scoring_authority.score_mutations where match_id like '2026-R1-%'and mutation_type='HOLE_SCORE'`));
      for(const measured of burst.measurements)assert.equal(receipts.filter(v=>v.mutation===measured.mutation&&v.match===measured.match&&v.hole===measured.hole).length,1);
      burst.exactMeasuredReceiptIdentities=true;
      const fromIndex=worker.events.length;
      burst.freshIdle=await worker.waitFor(e=>e.type==='tick'&&e.tickStartedAt>lastCommitAt&&e.materialized===0&&e.terminal===0&&
       e.statusIncomplete===false&&e.blockedAutomatic===0&&e.pendingAutomatic===0&&e.activeLeases===0&&Object.values(e.ready).every(v=>v===false),
       {timeoutMs:120000,fromIndex});
      burst.current=await assertLocalDerivedCurrent(c,d);burst.final=snapshot(c,d);
      assert.equal(burst.final.pendingIntents,0);assert.equal(burst.final.holes,6*(profile.preloadHoles+6));assert.equal(burst.final.receipts,burst.final.holes);
      assert.equal(financialSnapshot(c,d),financial);burst.financialUnchanged=true;
      stopSampler=true;await sampler;if(samplerError)throw samplerError;
      assert.ok(samples.some(x=>x.workerConnections>0));burst.resourceSamples=samples;
      burst.workerEvents=worker.events;
      burst.workerFailureEvents=worker.events.filter(e=>['failed','tick-failed','halted','startup-failed'].includes(e.type));
      burst.workerErrorCounts={deadlock40P01:burst.workerFailureEvents.filter(e=>e.sqlstate==='40P01'||e.code==='40P01').length,
       statementTimeout57014:burst.workerFailureEvents.filter(e=>e.sqlstate==='57014'||e.code==='57014').length,
       failedInvocations:burst.workerFailureEvents.filter(e=>e.type==='failed'||e.type==='tick-failed').length};
      assert.equal(worker.events.filter(e=>e.type==='halted'||e.type==='startup-failed').length,0);
      burst.result='PASS';
     }finally{
      stopSampler=true;if(sampler)await sampler;if(worker)await worker.stop();if(monitor)await monitor.close();
      await Promise.allSettled(sessions.map(s=>s.close()));
      // Name was allocated by this fixture and checked by cloneScoreProofDatabase;
      // all its clients closed first. No external DB identifier is accepted.
      assert.match(d,/^p2_[0-9]+_tails_[16]_[0-9]+$/);sql(c,'postgres',`drop database ${d}`,{role:''});burst.cloneRemoved=true;
     }
     console.log(`P2C backlog tail ${profile.name}: burst${repetition+1}, qualified${row.qualified.length}, nonqualifying${row.nonqualifying.length}`);
    }
    assert.ok(row.qualified.length>=1000,'Required backlog-tail sample count not reached within bounded run; no p99 certification');
    for(const key of ['lockHeldThroughRpcMs','dbFunctionWallMs','transactionWallUpperMs'])row[key]=summarize(row.qualified.map(v=>v[key]));
    row.totalAccepted=row.qualified.length+row.nonqualifying.length;row.scoreFailures=0;
    row.workerErrorCounts=Object.fromEntries(['deadlock40P01','statementTimeout57014','failedInvocations'].map(k=>[k,row.bursts.reduce((n,b)=>n+b.workerErrorCounts[k],0)]));
    row.result='PASS';
   });
  }
 }finally{
  if(f){await destroyIsolatedCluster(f.cluster);evidence.clusterDestroyed=true;}
  evidence.completedAt=new Date().toISOString();evidence.result=evidence.profiles.length===2&&evidence.profiles.every(r=>r.result==='PASS')?'PASS':'FAIL';
  await mkdir(path.dirname(artifact),{recursive:true});await writeFile(artifact,JSON.stringify(evidence,null,2)+'\n');
 }
});
