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
const artifact=path.join(repositoryRoot,'docs/reliability/phase2c/evidence/backlog-pressure-results.json');
const summarize=values=>{const v=[...values].sort((a,b)=>a-b);return{samples:v.length,
 p50Ms:v.length?v[Math.ceil(v.length*.5)-1]:null,p95Ms:null,p99Ms:null,maxMs:v.at(-1)??null,
 tailStatus:'INSUFFICIENT_SAMPLE',valuesMs:values};};
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
 select exists(select 1 from scoring_authority.score_derived_intents_v1 where tournament_id='2026'and status<>'SUCCEEDED' limit 1) into pending_before;
 began:=clock_timestamp();answer:=public.submit_production_hole_score(input);
 return jsonb_build_object('result',answer,'pendingImmediatelyBeforeScore',pending_before,'dbFunctionWallMs',extract(epoch from(clock_timestamp()-began))*1000);
 end $measure$;`;

test('P2C-B-BACKLOG: bounded normal and larger backlog drain while independent groups keep scoring',
 {timeout:600000,concurrency:false},async t=>{
  let f;
  const evidence={schemaVersion:1,id:'P2C-B-BACKLOG',requirements:['P2C-026','P2C-027','P2C-075','P2C-113','P2C-114'],
   environment:'OWNED_SOCKET_ONLY_POSTGRESQL17',production:false,startedAt:new Date().toISOString(),scenarios:[],
   measurement:{score:'Persistent local RPC round-trip wall time plus connection-local clock_timestamp wrapper around actual submit body',
    resources:'One persistent sampler, target-owned database only, target25ms pause between samples; observed gaps retained; excludes sampler session',
    worker:'Existing events observedAt minus tickStartedAt; completed-family counts and observed elapsed cycle/processing intervals',
    scoreStatementTimeoutMs:1000,workerStatementTimeoutMs:5000},
   limitations:['Synthetic Live/prepared runtime boundary and approved financial fixture; not Open/Prepare or hosted Auth proof',
    'Sampled pg_stat_activity/pg_locks are observations, not continuous maxima or exact lock duration; synchronous fixture authority reads can delay sampler callbacks',
    'Bounded EXISTS immediately before the actual submit body records pending backlog; it does not prove a worker statement ran simultaneously with every score instruction',
    'DB function elapsed includes waiting but excludes outer commit acknowledgement; no CPU, memory, IOPS or provider capacity claim',
    'Sampler and six persistent scoring sessions add bounded diagnostic load; no comparison to an uninstrumented run is asserted',
    '12 measured score requests/scenario; p95/p99 NOT PROVEN; preload writes are not in measured distributions',
    'NetSkins financial processing/publication stays owner-controlled; worker materialization alone is not financial completion']};
  try{
   f=await createPhase2CFixture();const c=f.cluster;
   sql(c,f.database,`alter database ${f.database} set statement_timeout='30000ms'`,{role:''});
   seedSyntheticSideGameHistory(c,f.database,1);prepareLocalScoreDerivedWorkerFixture(c,f.database);
   configureFiniteTimeout(c,f.database,1000);evidence.fixture=f.phase2c;
   for(const scenario of [{name:'normal_round_burst',preloadHoles:1,expectedDemand:18},
    {name:'six_hole_larger_backlog',preloadHoles:6,expectedDemand:108}]){
    await t.test(scenario.name,async()=>{
     const d=cloneScoreProofDatabase(f,'pressure_'+scenario.preloadHoles),sessions=[],samples=[],measurements=[];
     let worker,monitor,sampler,stopSampler=false,samplerError,lastCommitAt=0;
     const row={...scenario,result:'FAIL',groups:6,format:'BB',measurementPhaseHolesPerMatch:2,
      preloadSource:'Actual canonical RPC commits while no worker is running',scoreErrors:[],samples,measurements};
     evidence.scenarios.push(row);
     try{
      row.initial=snapshot(c,d);assert.equal(row.initial.holes,0);assert.equal(row.initial.pendingIntents,0);
      const immutableFinancial=financialSnapshot(c,d);
      for(let hole=1;hole<=scenario.preloadHoles;hole++)for(let match=1;match<=6;match++){
       const input=inputFor(c,d,`2026-R1-${match}`,hole,{key:`pressure:${scenario.name}:${match}:${hole}`});
       assert.equal(rpc(c,d,'submit_production_hole_score',input).code,'ACCEPTED');
      }
      row.backlogBeforeStart=snapshot(c,d);
      assert.equal(row.backlogBeforeStart.holes,6*scenario.preloadHoles);
      assert.equal(row.backlogBeforeStart.pendingIntents-row.initial.pendingIntents,scenario.expectedDemand);
      for(let match=1;match<=6;match++){
       const session=openSqlSession(c,d);sessions.push(session);
       await session.query(`set application_name='p2c-pressure-score-${match}'`);
       assert.equal(await session.query('show statement_timeout'),'1s');
       await session.query(measureWrapper);
      }
      monitor=openSqlSession(c,d);await monitor.query("set application_name='p2c-pressure-sampler'");
      assert.equal(await monitor.query('show statement_timeout'),'1s');
      const sample=async()=>{const began=performance.now();const value=JSON.parse(await monitor.query(sampleSql));
       samples.push({...value,sampleRoundTripMs:performance.now()-began,clientObservedAt:Date.now()});};
      await sample();
      sampler=(async()=>{while(!stopSampler){await sample();await sleep(25);}})().catch(error=>{samplerError=error;});
      const startedAt=performance.now();row.workerStartedAt=Date.now();
      worker=await startLocalScoreDerivedWorker({cluster:c,database:d,workerId:'phase2c-backlog-'+scenario.preloadHoles,intervalMs:100});
      row.backlogAtContinuedScoring=snapshot(c,d);
      for(let hole=scenario.preloadHoles+1;hole<=scenario.preloadHoles+2;hole++){
       const pendingBefore=snapshot(c,d).pendingIntents;
       const inputs=Array.from({length:6},(_,index)=>inputFor(c,d,`2026-R1-${index+1}`,hole,
        {key:`pressure:${scenario.name}:${index+1}:${hole}`}));
       const oracles=inputs.map(i=>scoringOracle(c,d,i.match_id));
       const results=await Promise.allSettled(inputs.map(async(input,index)=>{
        const began=performance.now(),submittedAt=Date.now();
        const timed=JSON.parse(await sessions[index].query(`select pg_temp.measure_actual_score_v1(${jsonLiteral(input)})`));
        const roundTripMs=performance.now()-began;
        assert.equal(timed.result.code,'ACCEPTED',JSON.stringify(timed.result));
        assert.ok(Number.isFinite(timed.dbFunctionWallMs)&&timed.dbFunctionWallMs>=0);
        const expected=oracles[index].hole(hole,input.team_1_gross_scores,input.team_2_gross_scores);
        assert.deepEqual(timed.result.gross,{team_1:input.team_1_gross_scores,team_2:input.team_2_gross_scores});
        assert.deepEqual(timed.result.strokes,expected.strokes);assert.deepEqual(timed.result.net,expected.net);
        assert.equal(timed.result.hole_winner,expected.winner);
        lastCommitAt=Math.max(lastCommitAt,Date.now());
        measurements.push({match:input.match_id,hole,submittedAt,completedAt:lastCommitAt,
         pendingBeforeBatch:pendingBefore,rpcRoundTripMs:roundTripMs,dbFunctionWallMs:timed.dbFunctionWallMs,pendingImmediatelyBeforeScore:timed.pendingImmediatelyBeforeScore,result:'ACCEPTED'});
       }));
       for(const result of results)if(result.status==='rejected')row.scoreErrors.push(result.reason?.message||String(result.reason));
       assert.equal(row.scoreErrors.length,0,JSON.stringify(row.scoreErrors));
      }
      row.afterContinuedScores=snapshot(c,d);row.lastCanonicalCommitAt=lastCommitAt;
      assert.equal(measurements.length,12);
      // Actual connection-local bounded lookup immediately before submit; lookup cost
      // belongs to RPC wall time, outside the separately timed score function.
      assert.ok(measurements.some(v=>v.pendingImmediatelyBeforeScore===true),'No pre-existing backlog observed immediately before a measured canonical score');
      const fromIndex=worker.events.length;
      row.freshIdle=await worker.waitFor(e=>e.type==='tick'&&e.tickStartedAt>lastCommitAt&&
       e.materialized===0&&e.terminal===0&&e.statusIncomplete===false&&e.blockedAutomatic===0&&
       e.pendingAutomatic===0&&e.activeLeases===0&&Object.values(e.ready).every(v=>v===false),
       {timeoutMs:120000,fromIndex});
      row.drainElapsedMs=performance.now()-startedAt;
      row.canonicalCurrent=await assertLocalDerivedCurrent(c,d);
      row.final=snapshot(c,d);assert.equal(row.final.pendingIntents,0);
      assert.equal(row.final.holes,6*(scenario.preloadHoles+2));assert.equal(row.final.receipts,row.final.holes);
      assert.equal(financialSnapshot(c,d),immutableFinancial);
      row.noFinancialPublicationOrOwnershipChange=true;
      stopSampler=true;await sampler;if(samplerError)throw samplerError;await sample();
      assert.ok(samples.length>=2);assert.ok(samples.some(v=>v.workerConnections>0),'Sampler did not observe actual worker database activity');
      const events=worker.events;
      assert.equal(events.filter(e=>e.type==='halted'||e.type==='startup-failed').length,0);
      const ticks=events.filter(e=>e.type==='tick'),processed=events.filter(e=>e.type==='processed');
      const tickTimes=ticks.map(e=>e.observedAt-e.tickStartedAt);
      assert.ok(tickTimes.every(v=>Number.isFinite(v)&&v>=0));
      const cycles=ticks.slice(1).map((e,index)=>e.tickStartedAt-ticks[index].tickStartedAt);
      const sampleGaps=samples.slice(1).map((e,index)=>e.clientObservedAt-samples[index].clientObservedAt);
      assert.ok(ticks.every(e=>Number.isInteger(e.materialized)&&e.materialized>=0&&e.materialized<=24),'Three separate bounded8-intent materialization families per tick');
      row.scoreRpc=summarize(measurements.map(v=>v.rpcRoundTripMs));
      row.scoreDbFunction=summarize(measurements.map(v=>v.dbFunctionWallMs));
      row.sampledResources={samples:samples.length,maxObservedConnections:Math.max(...samples.map(v=>v.connections)),
       maxObservedActive:Math.max(...samples.map(v=>v.active)),maxObservedWaitingSessions:Math.max(...samples.map(v=>v.lockWaitingSessions)),
       maxObservedUngrantedLocks:Math.max(...samples.map(v=>v.ungrantedLocks)),maxObservedBlockedSessions:Math.max(...samples.map(v=>v.blockedSessions)),
       maxSampleRoundTripMs:Math.max(...samples.map(v=>v.sampleRoundTripMs)),maxObservedSampleGapMs:Math.max(0,...sampleGaps),exactLockDuration:'NOT_MEASURED',cpuMemoryIo:'UNAVAILABLE'};
      row.worker={ticks:ticks.length,maxMaterializedPerTick:Math.max(0,...ticks.map(e=>e.materialized)),boundedMaterializationPerTick:24,tickLatency:summarize(tickTimes),cycleInterval:summarize(cycles),
       processedByFamily:Object.fromEntries(['CALCUTTA','COMPETITION','INTELLIGENCE'].map(family=>[family,processed.filter(e=>e.family===family&&!e.empty).length])),
       firstProcessingObservedMs:processed.length?processed[0].observedAt-row.workerStartedAt:null,
       lastProcessingObservedMs:processed.length?processed.at(-1).observedAt-row.workerStartedAt:null,
       failureEvents:events.filter(e=>e.type==='failed'||e.type==='tick-failed'),events};
      assert.ok(row.worker.processedByFamily.CALCUTTA>0);
      assert.ok(row.worker.processedByFamily.COMPETITION>0);
      assert.ok(row.worker.processedByFamily.INTELLIGENCE>0);
      row.scoreTimeouts=0;row.result='PASS';
     }catch(error){row.error=error.message;if(worker)row.workerEventsAtFailure=worker.events;throw error;}
     finally{
      stopSampler=true;if(sampler)await sampler;
      if(worker)row.workerExit=await worker.stop();
      if(monitor)await monitor.close();
      await Promise.allSettled(sessions.map(s=>s.close()));
     }
    });
   }
  }finally{
   if(f){await destroyIsolatedCluster(f.cluster);evidence.clusterDestroyed=true;}
   evidence.completedAt=new Date().toISOString();evidence.result=evidence.scenarios.length===2&&evidence.scenarios.every(v=>v.result==='PASS')?'PASS':'FAIL';
   await mkdir(path.dirname(artifact),{recursive:true});await writeFile(artifact,JSON.stringify(evidence,null,2)+'\n');
  }
 });
