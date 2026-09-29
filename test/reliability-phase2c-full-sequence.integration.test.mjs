// Proof layers: POSTGRESQL / INTEGRATION / FAILURE_INJECTION. Synthetic golf only.
import assert from 'node:assert/strict';
import test from 'node:test';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {withDataAuthorityRequestScope} from '../lib/data-authority-request.js';
import {persistParticipantScore} from '../lib/scoring-persistence-adapter.js';
import {withOperationalRoute} from '../lib/operational-telemetry.js';
import {runtimeScope} from './support/reliability/synthetic-tournament.mjs';
import {createPhase2CFixture} from './support/reliability/phase2c-fixture.mjs';
import {cloneScoreProofDatabase,inputFor,rpc,rpcSql,canonicalState,scoringOracle} from './support/reliability/phase2-score-fixture.mjs';
import {sql,sqlResult,openSqlSession,destroyIsolatedCluster,repositoryRoot} from './support/reliability/postgres17.mjs';
import {seedSyntheticSideGameHistory} from './support/reliability/synthetic-history.mjs';
import {prepareLocalScoreDerivedWorkerFixture,startLocalScoreDerivedWorker,assertLocalDerivedCurrent} from './support/reliability/phase2c-worker.mjs';
async function observedScore(session,i,events,{loseAcknowledgement=false}={}){
 let canonical;
 const handler=withOperationalRoute({route:'/api/scoring/phase2c-isolated',domain:'SCORING'},async()=>{
  const result=await persistParticipantScore({matchId:i.match_id,
   current:{scope:'match',tournamentId:'2026',playerId:i.authorization.player_id,authUserId:i.authorization.auth_user_id,
    matchId:i.match_id,accessVersion:i.authorization.permission_revision,identityAuthority:'supabase'},
   input:{holeNumber:i.hole_number,team1GrossScores:i.team_1_gross_scores,team2GrossScores:i.team_2_gross_scores,
    clientMutationId:i.mutation_key,expectedMatchRevision:i.expected_match_revision,expectedRevision:i.expected_hole_revision},
   canonicalContext:{tournamentId:'2026',matchRevision:i.expected_match_revision,permissionRevision:i.authorization.permission_revision},
   authorizationContext:{identity:{authUserId:i.authorization.auth_user_id,playerId:i.authorization.player_id,tournamentId:'2026'}},
   includeCanonicalAcknowledgement:true,env:{},dependencies:{
    requireScoringAuthority:()=>({resolved:'supabase',productionDeployment:false,previewDeployment:false}),
    submitCanonicalHoleScore:async input=>{const begin=performance.now();canonical=JSON.parse(await session.query(rpcSql('submit_production_hole_score',runtimeScope(input))));return{payload:canonical,durationMs:performance.now()-begin};}}});
  assert.equal(result.authority,'supabase');return Response.json({ok:true});
 },{env:{},enabled:true,sink:event=>events.push(event)});
 const attempt=await withDataAuthorityRequestScope({env:{VERCEL_ENV:'preview'},injectGoogleOutage:true},()=>handler(new Request('https://isolated.invalid/api/scoring/phase2c-isolated',{method:'POST'})));
 assert.equal(attempt.diagnostics.googleAttempts,0,'score must not even attempt retired Google transport');
 const response=attempt.result;
 assert.equal(response.status,200);assert.ok(response.headers.get('x-request-id'));
 // Drop the completed transport acknowledgement before returning it to the
 // simulated caller. Recovery must read the durable receipt, not this value.
 if(loseAcknowledgement)throw Object.assign(new Error('Injected response loss after actual canonical COMMIT'),{code:'P2C_LOST_SCORE_ACK'});
 return canonical;
}
const stats=v=>{const s=[...v].sort((a,b)=>a-b),p=q=>s[Math.ceil(s.length*q)-1];return {samples:s.length,p50Ms:p(.5),p95Ms:s.length>=20?p(.95):null,p99Ms:null,p99Status:'NOT_PROVEN_INSUFFICIENT_SAMPLE',maxMs:s.at(-1)};};
const pending=(c,d)=>Number(sql(c,d,"select count(*) from scoring_authority.score_derived_intents_v1 where status<>'SUCCEEDED'"));
const current=(c,d)=>JSON.parse(sql(c,d,`select jsonb_build_object('holes',(select count(*) from scoring_authority.hole_scores where match_id like '2026-%'),
 'final',(select count(*) from scoring_authority.matches where tournament_id='2026' and status='FINAL'),
 'canonicalResults',(select count(*) from scoring_authority.matches where tournament_id='2026' and status='FINAL' and scorecard_complete and result_winner in('Team 1','Team 2','Halved')),
 'scoreReceipts',(select count(*) from scoring_authority.score_mutations where match_id like '2026-%' and mutation_type='HOLE_SCORE'),
 'unresolvedMutations',(select coalesce(sum(unresolved_mutations),0) from scoring_authority.matches where tournament_id='2026'),
 'activeAccess',(select count(*) from scoring_authority.scoring_permissions p join scoring_authority.matches m using(match_id) where m.tournament_id='2026' and p.can_score and p.revoked_at is null),
 'intents',(select count(*) from scoring_authority.score_derived_intents_v1 where status<>'SUCCEEDED'),
 'currentCalcutta',(select result_revision from scoring_authority.calcutta_v1_current where tournament_id='2026'))`));
test('Phase2C full432hole chronological score sequence with autonomous derived delivery',{timeout:900000},async()=>{
 const f=await createPhase2CFixture(),c=f.cluster,d=cloneScoreProofDatabase(f,'autonomous_sequence');let worker;
 const evidence={schemaVersion:1,environment:'LOCAL_NON_PRODUCTION',fixture:f.phase2c,production:false,rounds:[],controls:[],interruptionAcknowledgements:[],workerRestarts:0,failures:[],result:'FAIL',limitations:[...f.metadata.limitations,'Not a complete Open/Prepare tournament rehearsal','No owner publication automated','NetSkins financial processing remains WAITING_OWNER','Local process-lifetime worker, hosted scheduling NOT_PROVEN']};
 try{
  // Fixture construction is maintenance work, excluded from every latency claim.
  sql(c,d,"alter database "+d+" set statement_timeout='30s'",{role:''});
  seedSyntheticSideGameHistory(c,d,1);await prepareLocalScoreDerivedWorkerFixture(c,d);
  sql(c,d,"alter database "+d+" set statement_timeout='1s'",{role:''});
  assert.equal(sql(c,d,'show statement_timeout'),'1s');
  evidence.fixtureSetupTimeoutMs=30000;evidence.scoreTimeoutMs=1000;
  // Resume requires a genuine access-grant receipt anchoring the unchanged
  // scoring context; a fixture initialized directly as Live has none.
  const activation=rpc(c,d,'mutate_production_match_control',inputFor(c,d,'2026-R1-1',1,{director:true,operation:'ACCESS_ACTIVATE',key:'sequence-initial-access'}));
  assert.equal(activation.ok,true,JSON.stringify(activation));assert.ok(activation.scoring_context_hash);
  evidence.initialAccess={operation:'ACCESS_ACTIVATE',canonicalReceipt:true,contextBinding:activation.scoring_context_hash};
  const start=()=>startLocalScoreDerivedWorker({cluster:c,database:d,intervalMs:100,workerId:'phase2c-full-sequence'});
  worker=await start();await worker.waitFor(e=>e.type==='tick',{timeoutMs:30000});
  const allTimes=[],telemetry=[];let total=0,lastCanonicalCommitAt=0;
  for(const round of [1,2,3]){
   const times=[],finals=[];for(let n=1;n<=(round===3?12:6);n++){
    const matchId=`2026-R${round}-${n}`,oracle=scoringOracle(c,d,matchId),session=openSqlSession(c,d),winning=[];let last,finalizedAfterLostAck;
    try{
     assert.equal(await session.query('show statement_timeout'),'1s');
     for(let hole=1;hole<=18;hole++){
      if(round===2&&n===1&&hole===1){
       await worker.stop();evidence.workerEventsBeforeRestart=worker.events;worker=null;
       // Controlled SQLSTATE injection; the real historical lock cycle is proved
       // separately by the deadlock suite. Sequence consumption survives rollback.
       sql(c,d,`create sequence public.p2c_worker_fault;
        create function public.p2c_once_40p01() returns trigger language plpgsql as $$begin
         if nextval('public.p2c_worker_fault')=1 then raise exception using errcode='40P01',message='P2C_CONTROLLED_TRANSIENT_WORKER_FAULT';end if;return new;end$$;
        create trigger p2c_once_40p01 before update on scoring_authority.calcutta_v1_recalculation_jobs
         for each row when(new.status='RUNNING') execute function public.p2c_once_40p01();`,{role:''});
      }
      const team1=oracle.context.format==='BB'?[4+(hole%3),5+(n%2)]:[4+(hole%3)],team2=oracle.context.format==='BB'?[4+((hole+1)%3),5+((n+1)%2)]:[4+((hole+1)%3)];
      const input=inputFor(c,d,matchId,hole,{key:`p2c-sequence:${matchId}:${hole}`,team_1_gross_scores:team1,team_2_gross_scores:team2});
      if(round===2&&n===1&&hole===2){
       const beforeTimeout=canonicalState(c,d,matchId);
       sql(c,d,`create function public.p2c_score_timeout() returns trigger language plpgsql as $$begin perform pg_sleep(.1);return new;end$$;
        create trigger p2c_score_timeout before insert on scoring_authority.hole_scores for each row execute function public.p2c_score_timeout();`,{role:''});
       const failed=sqlResult(c,d,`\\set VERBOSITY verbose\nset statement_timeout='25ms';${rpcSql('submit_production_hole_score',input)}`);
       assert.notEqual(failed.status,0);assert.match(failed.stderr,/57014/);
       assert.deepEqual(canonicalState(c,d,matchId),beforeTimeout);
       assert.equal(rpc(c,d,'read_production_score_mutation_status_v1',input).status,'UNKNOWN');
       sql(c,d,'drop trigger p2c_score_timeout on scoring_authority.hole_scores;drop function public.p2c_score_timeout();',{role:''});
       evidence.controls.push({operation:'FORCED_SCORE_TIMEOUT',sqlstate:'57014',timeoutMs:25,delayMs:100,rollback:'COMPLETE',retry:'SAME_MUTATION'});
      }
      const loseAcknowledgement=round===1&&n===1&&(hole===2||hole===18);
      const began=performance.now();let r,elapsed;
      if(loseAcknowledgement){
       await assert.rejects(observedScore(session,input,telemetry,{loseAcknowledgement:true}),{code:'P2C_LOST_SCORE_ACK'});
       elapsed=performance.now()-began;
       // The Director reads current authority independently of the participant's
       // lost acknowledgement. Recovery happens only after revocation commits.
       const nextControl=hole===2?'SCORING_LOCK':'FINALIZE';
       if(nextControl==='SCORING_LOCK'){
        const lock=inputFor(c,d,matchId,hole,{director:true,operation:'SCORING_LOCK',key:'sequence-lock'});
        assert.equal(rpc(c,d,'mutate_production_match_control',lock).ok,true);
       }else{
        const finalInput=inputFor(c,d,matchId,18,{key:`p2c-final:${matchId}`});
        finalizedAfterLostAck=JSON.parse(await session.query(rpcSql('finalize_production_match',finalInput)));
        assert.equal(finalizedAfterLostAck.code,'FINALIZED',JSON.stringify(finalizedAfterLostAck));
       }
       const revoked=canonicalState(c,d,matchId);
       assert.equal(revoked.match.scoring_locked,true);
       const activePermissions=revoked.permissions.filter(permission=>permission.can_score&&!permission.revoked_at).length;
       assert.equal(activePermissions,0);
       const recovered=rpc(c,d,'read_production_score_mutation_status_v1',input);
       assert.equal(recovered.status,'COMMITTED');r=recovered.result;
       const canonicalReceiptCount=revoked.receipts.filter(receipt=>receipt.mutation_key===input.mutation_key).length;
       assert.equal(canonicalReceiptCount,1);
       evidence.interruptionAcknowledgements.push({matchId,hole,mutationId:input.mutation_key,
        clientOutcome:'LOST_ACK_AFTER_COMMIT',statusResolution:recovered.status,
        nextControl,controlCommittedBeforeRecovery:true,scoringLocked:true,activePermissions,
        canonicalReceiptCount,scoreRequestMs:elapsed,latencyExcludesControlAndRecovery:true});
      }else{r=await observedScore(session,input,telemetry);elapsed=performance.now()-began;}
      times.push(elapsed);allTimes.push(elapsed);
      assert.equal(r.code,'ACCEPTED',JSON.stringify(r));const expected=oracle.hole(hole,team1,team2);
      assert.deepEqual(r.gross,{team_1:team1,team_2:team2});assert.deepEqual(r.strokes,expected.strokes);assert.deepEqual(r.net,expected.net);assert.equal(r.hole_winner,expected.winner);assert.equal(r.match.scored_holes,hole);winning.push(expected.winner);last=input;total++;
      if(round===1&&n===1&&hole===2){
       assert.equal(rpc(c,d,'read_production_score_mutation_status_v1',input).status,'COMMITTED');assert.equal(rpc(c,d,'submit_production_hole_score',input).ok,false);
       const resume=inputFor(c,d,matchId,hole,{director:true,operation:'SCORING_UNLOCK',key:'sequence-resume'});const resumed=rpc(c,d,'mutate_production_match_control',resume);assert.equal(resumed.ok,true,JSON.stringify(resumed));assert.equal(rpc(c,d,'read_production_score_mutation_status_v1',input).status,'COMMITTED');
       evidence.controls.push({operation:'LOCK_RECOVER_RESUME',result:'PASS',newWritesWhileLocked:'DENIED'});
      }
      if(round===2&&n===1&&hole===3){evidence.backlogWhileStopped=pending(c,d);assert.ok(evidence.backlogWhileStopped>=9);worker=await start();evidence.workerRestarts++;await worker.waitFor(e=>e.type==='tick',{timeoutMs:30000});}
     }
     const finalInput=inputFor(c,d,matchId,18,{key:`p2c-final:${matchId}`});const final=finalizedAfterLostAck||JSON.parse(await session.query(rpcSql('finalize_production_match',finalInput)));assert.equal(final.code,'FINALIZED',JSON.stringify(final));lastCanonicalCommitAt=Date.now();
     const lead=range=>winning.slice(...range).reduce((sum,w)=>sum+(w==='Team 1'?1:w==='Team 2'?-1:0),0);let points;
     if(round<3)points=[[0,9],[9,18],[0,18]].reduce((sum,range)=>sum+(lead(range)>0?1:lead(range)<0?0:.5),0);
     else{const decided=Array.from({length:18},(_,i)=>({hole:i+1,lead:lead([0,i+1])})).find(v=>Math.abs(v.lead)>18-v.hole)||{lead:lead([0,18])};points=decided.lead>0?3:decided.lead<0?0:1.5;}
     const decisive=round===3?(Array.from({length:18},(_,i)=>({hole:i+1,lead:lead([0,i+1])})).find(v=>Math.abs(v.lead)>18-v.hole)?.lead??lead([0,18])):lead([0,18]);
     const expectedWinner=decisive>0?'Team 1':decisive<0?'Team 2':'Halved';assert.equal(final.result_winner,expectedWinner);
     assert.equal(final.team_1_points,points);assert.equal(final.team_2_points,3-points);
     const recovered=rpc(c,d,'read_production_score_mutation_status_v1',last);assert.equal(recovered.status,'COMMITTED');assert.equal(rpc(c,d,'submit_production_hole_score',last).ok,false);
     const state=canonicalState(c,d,matchId);assert.equal(state.holes.length,18);assert.equal(state.match.status,'FINAL');assert.ok(state.permissions.every(p=>!p.can_score&&p.revoked_at));assert.deepEqual(scoringOracle(c,d,matchId).context,oracle.context);
     finals.push({matchId,holes:18,expectedWinner,actualWinner:final.result_winner,team1Points:points,team2Points:3-points,recoveryAfterFinalize:'COMMITTED',access:'REVOKED'});
    }finally{await session.close();}
   }
   evidence.rounds.push({round,holes:finals.length*18,matches:finals.length,finals,latency:stats(times),failures:0});
  }
  assert.equal(total,432);const deadline=Date.now()+120000;
  assert.deepEqual(evidence.interruptionAcknowledgements.map(value=>[value.hole,value.nextControl]),[[2,'SCORING_LOCK'],[18,'FINALIZE']]);
  while(pending(c,d)>0&&Date.now()<deadline){await new Promise(r=>setTimeout(r,200));assert.notEqual(worker.child.exitCode,1,'worker halted');}
  assert.equal(pending(c,d),0,'automatic durable materialization must catch up');
  // A quiescent tick must report no automatic calculation left ready. This is
  // separate from intents SUCCEEDED, which only means materialized demand.
  const drainWatermark=worker.events.length;
  const quiescent=await worker.waitFor(e=>e.type==='tick'&&e.tickStartedAt>lastCanonicalCommitAt&&e.materialized===0&&e.terminal===0&&e.statusIncomplete===false&&e.blockedAutomatic===0&&e.pendingAutomatic===0&&e.activeLeases===0&&e.ready&&Object.values(e.ready).every(v=>v===false),{timeoutMs:120000,fromIndex:drainWatermark});
  evidence.finalFreshWorkerState=quiescent;
  evidence.derivedCurrent=await assertLocalDerivedCurrent(c,d);
  const transientAttempts=Number(sql(c,d,"select count(*) from production_control.score_derived_delivery_attempts_v1 where safe_code='40P01' and transition='RETRYABLE'"));
  assert.ok(transientAttempts>=1,'injected worker deadlock must become a durable retry and recover autonomously');
  evidence.controls.push({operation:'WORKER_TRANSIENT_40P01',injection:'SQLSTATE_AT_CLAIM_NOT_REAL_LOCK_CYCLE',durableRetryEvents:transientAttempts,recoveredWithoutManualProcessing:true});
  evidence.workerEventsAfterRestart=worker.events;evidence.final=current(c,d);assert.equal(evidence.final.holes,432);assert.equal(evidence.final.final,24);assert.equal(evidence.final.activeAccess,0);assert.equal(evidence.final.canonicalResults,24);assert.equal(evidence.final.scoreReceipts,432);assert.equal(evidence.final.unresolvedMutations,0);
  assert.equal(telemetry.filter(e=>e.event==='OUTCOME'&&e.phase==='score_acknowledgement'&&e.outcome==='COMMITTED').length,432);
  evidence.telemetry={enabled:true,adapter:'SHIPPING_PWA_PERSISTENCE',transport:'INJECTED_LOCAL_SQL',requestEvents:telemetry.filter(e=>e.event==='REQUEST').length,committedScoreOutcomes:432,sample:telemetry.slice(0,6)};
  if(process.env.BAGGER_PHASE2C1_CANDIDATE==='1'){
    const retired=JSON.parse(sql(c,d,`select jsonb_build_object(
      'scoreMirrorJobs',(select count(*)from scoring_authority.google_outbox_events),
      'archiveJobs',(select count(*)from scoring_authority.scorecard_archive_jobs),
      'finalizedSnapshots',(select count(*)from scoring_authority.finalized_scorecard_snapshots),
      'auditReceipts',(select count(*)from scoring_authority.audit_events),
      'retiredWorkerAllowlist',(select count(*)from production_control.annual_scoring_rpc_allowlist_v1 where enabled and required_worker in('SCORING_GOOGLE_OUTBOX','ROUND_SCORECARDS_ARCHIVE')))`));
    assert.equal(retired.scoreMirrorJobs,0);assert.equal(retired.archiveJobs,0);assert.equal(retired.finalizedSnapshots,24);assert.equal(retired.retiredWorkerAllowlist,0);assert.ok(retired.auditReceipts>=432);
    evidence.googleRetirement={...retired,googleCalls:0,requiredGoogleIntents:0,credentialVariables:Object.keys(process.env).filter(k=>/GOOGLE|SHEET_ID|DRIVE_ID/.test(k)),networkGuard:'ALL_REMOTE_SOCKETS_DENIED',scoreTransportAttempts:0,requiredIntentsRemaining:pending(c,d)};
    assert.deepEqual(evidence.googleRetirement.credentialVariables,[]);
  }
  evidence.totalCanonicalHoles=total;evidence.totalLatency=stats(allTimes);evidence.historyResetBetweenRounds=false;evidence.result='PASS';
 }catch(error){evidence.failures.push(error.message);evidence.workerEventsAtFailure=worker?.events||[];throw error;}finally{
  if(worker)await worker.stop();await writeFile(path.join(repositoryRoot,'docs/reliability/phase2c/full-sequence-results.json'),JSON.stringify(evidence,null,2)+'\n');await destroyIsolatedCluster(c);
 }
});
