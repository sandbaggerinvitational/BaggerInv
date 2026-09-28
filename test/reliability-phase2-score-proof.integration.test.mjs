// Proof layers: POSTGRESQL / INTEGRATION / CONCURRENCY / FAILURE_INJECTION.
// No Production target, synthetic HTTP, physical device or hosted-auth claim.
import assert from "node:assert/strict";
import test from "node:test";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { destroyIsolatedCluster, sql, sqlResult, openSqlSession, jsonLiteral,
  deterministicUuid, repositoryRoot, binaries, runResult } from "./support/reliability/postgres17.mjs";
import { createScoreProofFixture, cloneScoreProofDatabase, rpc, rpcSql, inputFor,
  canonicalState, exactReceipt, scoringOracle, proofMutationId } from "./support/reliability/phase2-score-fixture.mjs";

const score = (c,d,i) => rpc(c,d,"submit_production_hole_score",i);
const sqlScore = i => rpcSql("submit_production_hole_score",i);
const wait = ms => new Promise(resolve => setTimeout(resolve,ms));
const summary = values => {
  const s=[...values].sort((a,b)=>a-b),n=s.length;
  return {samples:n,p50:s[Math.ceil(n*.5)-1],p95:n>=20?s[Math.ceil(n*.95)-1]:null,
    p99:n>=1000?s[Math.ceil(n*.99)-1]:null,max:s.at(-1),
    p99Reason:n<1000?"INSUFFICIENT SAMPLE":null};
};
function assertCommitted(state,input,result) {
  assert.equal(state.holes.length,1);
  assert.equal(state.receipts.length,1);
  assert.equal(state.audit_count,1);
  assert.equal(state.history_count,1);
  assert.equal(state.outbox_count,1);
  assert.equal(state.match.match_revision,1);
  assert.equal(state.holes[0].mutation_key,input.mutation_key);
  assert.deepEqual(state.receipts[0].result,result);
}
async function waitForBlocked(leader, count) {
  const deadline=Date.now()+10000;
  while(Date.now()<deadline) {
    const n=Number(await leader.query(`select count(*) from pg_stat_activity
      where datname=current_database() and pid<>pg_backend_pid()
        and wait_event_type='Lock' and query like '%submit_production_hole_score%'`));
    if(n>=count)return n;
    await wait(10);
  }
  throw new Error(`Expected ${count} score sessions actually waiting on lock`);
}

// An explicit, safe local output path supports before/after evidence without
// silently overwriting Phase1 data. It is not a database connection option.
const outputArgument=process.env.BAGGER_PHASE2_PROOF_OUTPUT;
let outputPath;
if(outputArgument){
  outputPath=path.resolve(repositoryRoot,outputArgument);
  assert.ok(outputPath.startsWith(path.join(repositoryRoot,"docs/reliability/phase2")+path.sep));
  assert.match(outputPath,/\.json$/);
}

test("Phase2 actual canonical score proof matrix",{timeout:600000},async t=>{
  const startedAt=new Date().toISOString();
  const selection=process.env.BAGGER_PHASE2_CANDIDATE_SQL;
  const candidateSql=selection==="BASELINE"?undefined:selection||"supabase/production_migrations/202609280121_score_derived_intents_v1.sql";
  const fixture=await createScoreProofFixture({candidateSql});
  const c=fixture.cluster;
  const evidence={schemaVersion:1,startedAt,...fixture.metadata,candidate:fixture.candidate,mode:candidateSql?"CANDIDATE":"BASELINE_COUNTEREXAMPLES",
    tests:[], fullRounds:null, limitations:[...fixture.metadata.limitations,
      "No provider admission, real client transport, native persistence or full tournament lifecycle proof",
      "Score corrections remain existing revision-aware canonical upserts; no rules changed",
      "Connection kill tests model PostgreSQL backend loss, not a provider restart or physical power loss"]};
  const run=async(id,name,fn)=>{
    await t.test(`${id}: ${name}`,async()=>{
      const start=performance.now();
      const row={id,name,proofLayer:["POSTGRESQL","INTEGRATION"],result:"FAIL"};
      try {row.details=await fn();row.result="PASS";}
      catch(error){row.error=error.message;throw error;}
      finally {row.elapsedMs=performance.now()-start;evidence.tests.push(row);}
    });
  };
  try {
    await run("P2-FIXTURE-IDS","full input seed and hole key produce 432 distinct mutation identities",()=>{
      const ids=[];
      for(const round of [1,2,3])for(let match=1;match<=(round===3?12:6);match++)for(let hole=1;hole<=18;hole++)
        ids.push(proofMutationId(`2026-R${round}-${match}:${hole}`));
      assert.equal(ids.length,432);assert.equal(new Set(ids).size,432);
      assert.equal(proofMutationId("same-key"),proofMutationId("same-key"));
      return {identities:432,distinct:432,algorithm:"SHA256_ALL_SEED_AND_KEY_BYTES"};
    });
    await run("P2-IDEM-001","sequential identical mutation and changed payload",()=>{
      const d=cloneScoreProofDatabase(fixture,"idem");const i=inputFor(c,d);
      const first=score(c,d,i);assert.equal(first.code,"ACCEPTED");
      const retry=score(c,d,i);assert.equal(retry.idempotent,true);
      const {idempotent,...original}=retry;assert.deepEqual(original,first);
      assert.equal(score(c,d,{...i,team_1_gross_scores:[7]}).code,"IDEMPOTENCY_CONFLICT");
      assertCommitted(canonicalState(c,d),i,first);
      return {first:first.code,retry:retry.code,replay:true,changedPayload:"IDEMPOTENCY_CONFLICT",receiptCount:1};
    });
    await run("P2-IDEM-002","new mutation same Official score vs intentional revision-aware correction",()=>{
      const d=cloneScoreProofDatabase(fixture,"correction");const i=inputFor(c,d);score(c,d,i);
      assert.equal(score(c,d,{...i,mutation_key:deterministicUuid("p2","stale")} ).code,"MATCH_REVISION_CONFLICT");
      const same=inputFor(c,d,undefined,1,{key:"new-same"});
      const noop=score(c,d,same);assert.equal(noop.code,"NO_CHANGE");
      assert.equal(exactReceipt(c,d,same),null,"NO_CHANGE currently does not create a receipt");
      const correction=inputFor(c,d,undefined,1,{key:"intentional-correction",team_1_gross_scores:[7]});
      const corrected=score(c,d,correction);assert.equal(corrected.code,"ACCEPTED");
      const state=canonicalState(c,d);assert.equal(state.holes.length,1);
      assert.equal(state.holes[0].hole_revision,2);assert.equal(state.receipts.length,2);
      assert.equal(state.history_count,2);assert.deepEqual(state.holes[0].team_1_gross_scores,[7]);
      return {newIdSameScore:"NO_CHANGE_WITHOUT_NEW_RECEIPT",stale:"MATCH_REVISION_CONFLICT",
        deliberateCurrentRevisionCorrection:"ACCEPTED_WITH_HISTORY",contractChange:false};
    });
    await run("P2-CONC-001","20 concurrent identical requests resolve one canonical outcome",async()=>{
      const d=cloneScoreProofDatabase(fixture,"twenty");const i=inputFor(c,d);
      const sessions=Array.from({length:20},()=>openSqlSession(c,d));
      const lead=sessions[0];let waiting=[];
      try {
        await lead.query("begin");
        const first=JSON.parse(await lead.query(sqlScore(i)));assert.equal(first.code,"ACCEPTED");
        waiting=sessions.slice(1).map(s=>s.query(sqlScore(i)).then(JSON.parse));
        await waitForBlocked(lead,19);
        await lead.query("commit");
        const rest=await Promise.all(waiting);assert.equal(rest.length,19);
        for(const r of rest){assert.equal(r.idempotent,true);const {idempotent,...original}=r;assert.deepEqual(original,first);}
        await Promise.all(sessions.map(s=>s.close()));
        assertCommitted(canonicalState(c,d),i,first);
        return {requests:20,actualLockWaiters:19,accepted:1,replayed:19,canonicalHoles:1,receipts:1,deadlocks:0};
      } finally {await Promise.resolve().then(()=>lead.query("rollback")).catch(()=>{});await Promise.allSettled(waiting);await Promise.allSettled(sessions.map(s=>s.close()));}
    });
    for(const different of [false,true])await run(different?"P2-CONC-003":"P2-CONC-002",
      `concurrent new mutation IDs / ${different?"different":"same"} gross cannot overwrite stale authority`,async()=>{
        const d=cloneScoreProofDatabase(fixture,different?"different":"same");const i=inputFor(c,d);
        const j={...i,mutation_key:deterministicUuid("p2","contender"),...(different?{team_1_gross_scores:[9]}:{})};
        const a=openSqlSession(c,d),b=openSqlSession(c,d);let pending;
        try {
          await a.query("begin");const result=JSON.parse(await a.query(sqlScore(i)));
          pending=b.query(sqlScore(j));await waitForBlocked(a,1);await a.query("commit");
          const loser=JSON.parse(await pending);assert.equal(loser.code,"MATCH_REVISION_CONFLICT");
          assertCommitted(canonicalState(c,d),i,result);
          return {winner:"ACCEPTED",loser:loser.code,silentOverwrite:false};
        }finally{await Promise.resolve().then(()=>a.query("rollback")).catch(()=>{});await Promise.allSettled([pending]);await Promise.allSettled([a.close(),b.close()]);}
      });
    await run("P2-CONC-004","adjacent holes serialize with revision conflict then same-mutation retry",async()=>{
      const d=cloneScoreProofDatabase(fixture,"adjacent");const first=inputFor(c,d);
      const second=inputFor(c,d,undefined,2,{key:"adjacent-hole"});
      const a=openSqlSession(c,d),b=openSqlSession(c,d);let pending;
      try{
        await a.query("begin");await a.query(sqlScore(first));pending=b.query(sqlScore(second));
        await waitForBlocked(a,1);await a.query("commit");
        assert.equal(JSON.parse(await pending).code,"MATCH_REVISION_CONFLICT");
        second.expected_match_revision=1;assert.equal(score(c,d,second).code,"ACCEPTED");
        const state=canonicalState(c,d);assert.equal(state.holes.length,2);assert.equal(state.match.match_revision,2);
        return {staleAdjacent:"MATCH_REVISION_CONFLICT",sameMutationRefreshedRevision:"ACCEPTED",canonicalHoles:2};
      }finally{await Promise.resolve().then(()=>a.query("rollback")).catch(()=>{});await Promise.allSettled([pending]);await Promise.allSettled([a.close(),b.close()]);}
    });
    await run("P2-CONC-005","independent match score completes while another match transaction remains open",async()=>{
      const d=cloneScoreProofDatabase(fixture,"independent");
      const i=inputFor(c,d),j=inputFor(c,d,"2026-R3-11",1);
      const a=openSqlSession(c,d),b=openSqlSession(c,d);
      try{
        await a.query("begin");await a.query(sqlScore(i));
        const next=JSON.parse(await b.query(`set statement_timeout='2s';${sqlScore(j)}`));
        assert.equal(next.code,"ACCEPTED");assert.equal(exactReceipt(c,d,i),null,"first score uncommitted");
        assert.ok(exactReceipt(c,d,j));await a.query("commit");
        return {differentMatch:"ACCEPTED_BEFORE_FIRST_COMMIT",timeoutMs:2000,fixture:"NO_CALCUTTA_PUBLICATION"};
      }finally{await Promise.resolve().then(()=>a.query("rollback")).catch(()=>{});await Promise.allSettled([a.close(),b.close()]);}
    });
    for(const first of ["SCORE","LOCK"])await run(`P2-CONC-LOCK-${first}`,`${first} wins Lock/score race safely`,async()=>{
      const d=cloneScoreProofDatabase(fixture,`lock_${first.toLowerCase()}`);
      const i=inputFor(c,d),control=inputFor(c,d,undefined,1,{key:"lock",director:true,operation:"SCORING_LOCK"});
      const a=openSqlSession(c,d),b=openSqlSession(c,d);let pending;
      try{
        await a.query("begin");
        const winner=JSON.parse(await a.query(first==="SCORE"?sqlScore(i):rpcSql("mutate_production_match_control",control)));
        assert.equal(winner.ok,true,JSON.stringify(winner));
        pending=b.query(first==="SCORE"?rpcSql("mutate_production_match_control",control):sqlScore(i));
        await wait(30);await a.query("commit");const loser=JSON.parse(await pending);
        assert.equal(loser.ok,false);assert.ok(["MATCH_REVISION_CONFLICT","PERMISSION_STALE","UNAUTHORIZED"].includes(loser.code),JSON.stringify(loser));
        const state=canonicalState(c,d);assert.equal(state.holes.length,first==="SCORE"?1:0);
        assert.equal(state.match.scoring_locked,first==="LOCK");
        return {winner:first,loser:loser.code,holes:state.holes.length,locked:state.match.scoring_locked};
      }finally{await Promise.resolve().then(()=>a.query("rollback")).catch(()=>{});await Promise.allSettled([pending]);await Promise.allSettled([a.close(),b.close()]);}
    });
    for(const point of ["BEFORE_HOLE","AFTER_HOLE","AFTER_MATCH","BEFORE_RECEIPT","AFTER_RECEIPT","AFTER_HISTORY","AFTER_AUDIT","AFTER_OUTBOX"])
      await run(`P2-ATOMIC-${point}`,`failure at ${point} rolls back hole, match, receipt and audit`,()=>{
        const d=cloneScoreProofDatabase(fixture,point.toLowerCase());const i=inputFor(c,d);
        const before=canonicalState(c,d);
        const [when,table,operation]=({BEFORE_HOLE:["before","hole_scores","insert"],AFTER_HOLE:["after","hole_scores","insert"],
          AFTER_MATCH:["after","matches","update"],BEFORE_RECEIPT:["before","score_mutations","insert"],
          AFTER_RECEIPT:["after","score_mutations","insert"],AFTER_HISTORY:["after","score_revision_history","insert"],
          AFTER_AUDIT:["after","audit_events","insert"],AFTER_OUTBOX:["after","google_outbox_events","insert"]})[point];
        sql(c,d,`create function public.phase2_fault() returns trigger language plpgsql as $$begin
          raise exception using errcode='P0001',message='PHASE2_INJECTED_${point}';end$$;
          create trigger phase2_fault ${when} ${operation} on scoring_authority.${table}
          for each row execute function public.phase2_fault();`,{role:""});
        const result=sqlResult(c,d,`\\set VERBOSITY verbose\n${sqlScore(i)};`);
        assert.notEqual(result.status,0);assert.match(result.stderr,new RegExp(`PHASE2_INJECTED_${point}`));
        assert.deepEqual(canonicalState(c,d),before);assert.equal(exactReceipt(c,d,i),null);
        sql(c,d,`drop trigger phase2_fault on scoring_authority.${table};drop function public.phase2_fault();`,{role:""});
        const retry=score(c,d,i);assert.equal(retry.code,"ACCEPTED");
        return {failurePoint:point,canonicalCommit:false,receipt:false,statusAfterTransactionEnded:"NOT_COMMITTED",
          safeRetry:"SAME_MUTATION_ACCEPTED",noPartialState:true};
      });
    await run("P2-FAIL-57014","statement timeout after hole work rolls back and preserves SQLSTATE57014",()=>{
      const d=cloneScoreProofDatabase(fixture,"timeout");const i=inputFor(c,d);const before=canonicalState(c,d);
      sql(c,d,`create function public.phase2_slow_receipt() returns trigger language plpgsql as $$begin
        perform pg_sleep(1);return new;end$$;
        create trigger phase2_slow_receipt before insert on scoring_authority.score_mutations
        for each row execute function public.phase2_slow_receipt();`,{role:""});
      const timed=sqlResult(c,d,`\\set VERBOSITY verbose\nset statement_timeout='100ms';${sqlScore(i)};`);
      assert.notEqual(timed.status,0);assert.match(timed.stderr,/57014/);
      assert.deepEqual(canonicalState(c,d),before);
      sql(c,d,"drop trigger phase2_slow_receipt on scoring_authority.score_mutations;drop function public.phase2_slow_receipt();",{role:""});
      assert.equal(score(c,d,i).code,"ACCEPTED");return {sqlstate:"57014",canonicalCommit:false,receipt:false,sameMutationRetry:"ACCEPTED"};
    });
    for(const committed of [false,true])await run(committed?"P2-FAIL-AFTER-COMMIT":"P2-FAIL-BEFORE-COMMIT",
      `backend connection termination ${committed?"after":"before"} COMMIT is exactly recoverable`,async()=>{
        const d=cloneScoreProofDatabase(fixture,committed?"postcommit":"precommit");const i=inputFor(c,d);
        const session=openSqlSession(c,d);
        try{
          const pid=Number(await session.query("select pg_backend_pid()"));await session.query("begin");
          const first=JSON.parse(await session.query(sqlScore(i)));assert.equal(first.code,"ACCEPTED");
          // A different connection cannot see a not-yet-committed receipt.
          assert.equal(exactReceipt(c,d,i),null);
          if(committed)await session.query("commit");
          assert.equal(sql(c,d,`select pg_terminate_backend(${pid})`),"t");await session.close();
          const receipt=exactReceipt(c,d,i);assert.equal(Boolean(receipt),committed);
          const retried=score(c,d,i);assert.equal(retried.code,"ACCEPTED");
          assert.equal(retried.idempotent===true,committed);
          const state=canonicalState(c,d);assert.equal(state.holes.length,1);assert.equal(state.receipts.length,1);
          return {connectionLost:committed?"AFTER_COMMIT_BEFORE_DELIVERY":"BEFORE_COMMIT",
            receiptAtResolution:committed,canonicalOutcome:committed?"COMMITTED":"NOT_COMMITTED",
            sameMutationRetry:committed?"STORED_RECEIPT":"ACCEPTED",canonicalHoles:1};
        }finally{await session.close();}
      });
    await run("P2-UNKNOWN-INFLIGHT","absent receipt while transaction still active must remain UNKNOWN",async()=>{
      const d=cloneScoreProofDatabase(fixture,"inflight");const i=inputFor(c,d);const a=openSqlSession(c,d);
      try{
        await a.query("begin");await a.query(sqlScore(i));assert.equal(exactReceipt(c,d,i),null);
        const before=canonicalState(c,d);assert.equal(before.holes.length,0);
        await a.query("commit");assert.ok(exactReceipt(c,d,i));
        return {inflightReadback:"NO_RECEIPT_VISIBLE_IS_NOT_NONCOMMIT_PROOF",stateWhileActive:"UNKNOWN",afterCommit:"COMMITTED"};
      }finally{await Promise.resolve().then(()=>a.query("rollback")).catch(()=>{});await a.close();}
    });
    await run("P2-AUTH-001","real actor, match permission and private RPC privileges deny unauthorized identities",()=>{
      const d=cloneScoreProofDatabase(fixture,"authorization");const i=inputFor(c,d);
      const rejected=[];
      for(const [name,authorization]of [
        ["spectator",{...i.authorization,role:"SPECTATOR"}],
        ["signed-out",{...i.authorization,auth_user_id:null}],
        ["another-match",{...i.authorization,player_id:"P11",auth_user_id:"10000000-0000-4000-8000-000000000011"}],
        ["mismatched-match",{...i.authorization,match_id:"2026-R3-11"}],
      ]){
        const r=sqlResult(c,d,sqlScore({...i,authorization}));
        if(r.status===0)assert.equal(JSON.parse(r.stdout).ok,false,name);
        else assert.match(r.stderr,/AUTHORIZATION_REQUIRED/,name);
        rejected.push(name);
      }
      sql(c,d,"update participant_identity.user_player_links set status='REVOKED' where player_id='P12'",{role:""});
      assert.notEqual(sqlResult(c,d,sqlScore(i)).status,0);rejected.push("revoked-link");
      assert.equal(sql(c,d,"select has_function_privilege('anon','public.submit_production_hole_score(jsonb)','execute') or has_function_privilege('authenticated','public.submit_production_hole_score(jsonb)','execute')"),"f");
      assert.equal(canonicalState(c,d).holes.length,0);
      return {rejected,publicRpcGrant:"SERVICE_ROLE_ONLY",hostedAuth:"NOT_PROVEN",RLS:"CATALOG_AND_EXISTING_GRANTS_ONLY"};
    });
    await run("P2-IDEM-LOCKED-READBACK","committed receipt survives Lock even when participant replay loses permission",()=>{
      const d=cloneScoreProofDatabase(fixture,"locked_replay");const i=inputFor(c,d);
      const accepted=score(c,d,i);assert.equal(accepted.code,"ACCEPTED");
      const control=inputFor(c,d,undefined,1,{key:"later-lock",director:true,operation:"SCORING_LOCK"});
      assert.equal(rpc(c,d,"mutate_production_match_control",control).ok,true);
      const replay=score(c,d,i);assert.equal(replay.ok,false);
      assert.ok(["UNAUTHORIZED","PERMISSION_STALE"].includes(replay.code));
      assert.deepEqual(exactReceipt(c,d,i).result,accepted);
      return {original:"COMMITTED",participantReplay:replay.code,
        trustedExactReceipt:"COMMITTED",clientStatusResolution:"NOT_PROVEN",
        discoveredGap:"Permission revocation can deny replay of already committed score"};
    });
    await run("P2-GOLF-432","all R1/R2/R3 holes and Finalize retain canonical golf and receipts",async()=>{
      const d=cloneScoreProofDatabase(fixture,"full_tournament");const rounds=[];let total=0;
      for(const round of [1,2,3]){
        const latencies=[];const matchCount=round===3?12:6;const finals=[];
        for(let n=1;n<=matchCount;n++){
          const matchId=`2026-R${round}-${n}`,oracle=scoringOracle(c,d,matchId),session=openSqlSession(c,d);
          const opening=inputFor(c,d,matchId,1);const winning=[];
          try{
            for(let hole=1;hole<=18;hole++){
              const team1=oracle.context.format==="BB"?[4+(hole%3),5+(n%2)]:[4+(hole%3)];
              const team2=oracle.context.format==="BB"?[4+((hole+1)%3),5+((n+1)%2)]:[4+((hole+1)%3)];
              const i={...opening,hole_number:hole,mutation_key:deterministicUuid("full-round",`${matchId}:${hole}`),
                expected_match_revision:hole-1,expected_hole_revision:0,team_1_gross_scores:team1,team_2_gross_scores:team2};
              const started=performance.now();const r=JSON.parse(await session.query(sqlScore(i)));latencies.push(performance.now()-started);
              assert.equal(r.code,"ACCEPTED",JSON.stringify(r));const expected=oracle.hole(hole,team1,team2);
              assert.deepEqual(r.gross,{team_1:team1,team_2:team2});assert.deepEqual(r.strokes,expected.strokes);
              assert.deepEqual(r.net,expected.net);assert.equal(r.hole_winner,expected.winner);
              assert.equal(r.match.scored_holes,hole);assert.equal(r.match_revision,hole);winning.push(expected.winner);total++;
            }
            const finalInput={...opening,mutation_key:deterministicUuid("finalize",matchId),expected_match_revision:18};
            const final=JSON.parse(await session.query(rpcSql("finalize_production_match",finalInput)));
            assert.equal(final.code,"FINALIZED",JSON.stringify(final));assert.equal(final.team_1_points+final.team_2_points,3);
            const counts=range=>{const values=winning.slice(...range);return values.filter(x=>x==="Team 1").length-values.filter(x=>x==="Team 2").length;};
            let points;
            if(round<3)points=[[0,9],[9,18],[0,18]].reduce((sum,range)=>sum+(counts(range)>0?1:counts(range)<0?0:.5),0);
            else{
              const lead=winning.reduce((acc,w,h)=>{const next=(acc.at(-1)?.lead||0)+(w==="Team 1"?1:w==="Team 2"?-1:0);acc.push({hole:h+1,lead:next});return acc;},[]);
              const decided=lead.find(v=>Math.abs(v.lead)>18-v.hole)||lead.at(-1);points=decided.lead>0?3:decided.lead<0?0:1.5;
            }
            assert.equal(final.team_1_points,points);assert.equal(final.team_2_points,3-points);
            const state=canonicalState(c,d,matchId);assert.equal(state.holes.length,18);assert.equal(state.receipts.length,19);
            assert.equal(state.match.status,"FINAL");assert.equal(state.match.scoring_locked,true);
            assert.ok(state.permissions.every(p=>p.can_score===false&&p.revoked_at!==null));
            const afterOracle=scoringOracle(c,d,matchId);assert.deepEqual(afterOracle.context,oracle.context,"score cannot mutate frozen course/handicap/participants");
            finals.push({matchId,holes:18,team1Points:points,team2Points:3-points,finalized:true});
          }finally{await session.close();}
        }
        rounds.push({round,matches:matchCount,holes:matchCount*18,failures:0,latency:summary(latencies),finals});
      }
      assert.equal(total,432);evidence.fullRounds={totalCanonicalHoles:total,rounds,historyResetBetweenRounds:false,
        actualRpc:true,commitPerHole:true,derivedProcessorsRun:false};return evidence.fullRounds;
    });
    await run("P2-GOLF-HALVES","all three formats preserve an 18-hole halved result and 1.5/1.5 points",async()=>{
      const d=cloneScoreProofDatabase(fixture,"all_halves");const formats=[];
      for(const round of [1,2,3]){
        const matchId=`2026-R${round}-1`,oracle=scoringOracle(c,d,matchId),opening=inputFor(c,d,matchId,1),session=openSqlSession(c,d);
        try{
          for(let hole=1;hole<=18;hole++){
            const cardinality=round===1?2:1;
            const zero=Array(cardinality).fill(5),allocation=oracle.hole(hole,zero,zero).strokes;
            const first=allocation.team_1.map(s=>5+s),second=allocation.team_2.map(s=>5+s);
            const result=JSON.parse(await session.query(sqlScore({...opening,hole_number:hole,
              mutation_key:proofMutationId(`halves:${matchId}:${hole}`),expected_match_revision:hole-1,
              team_1_gross_scores:first,team_2_gross_scores:second})));
            assert.equal(result.code,"ACCEPTED");assert.equal(result.hole_winner,"Halved");
            assert.deepEqual(result.net,{team_1:5,team_2:5});
          }
          const final=JSON.parse(await session.query(rpcSql("finalize_production_match",{
            ...opening,mutation_key:proofMutationId(`halves-final:${matchId}`),expected_match_revision:18})));
          assert.equal(final.code,"FINALIZED");assert.equal(final.result_winner,"Halved");
          assert.equal(final.team_1_points,1.5);assert.equal(final.team_2_points,1.5);formats.push(oracle.context.format);
        }finally{await session.close();}
      }
      return {formats,holes:54,allHoleResults:"Halved",points:[1.5,1.5]};
    });
    await run("P2-GOLF-EARLY","Singles clinch at10 preserves remaining18-hole gross and final three points",async()=>{
      const d=cloneScoreProofDatabase(fixture,"early_clinch"),matchId="2026-R3-12",
        oracle=scoringOracle(c,d,matchId),opening=inputFor(c,d,matchId,1),session=openSqlSession(c,d);let tenth;
      try{
        for(let hole=1;hole<=18;hole++){
          const allocation=oracle.hole(hole,[5],[5]).strokes;
          const result=JSON.parse(await session.query(sqlScore({...opening,hole_number:hole,
            mutation_key:proofMutationId(`clinch:${hole}`),expected_match_revision:hole-1,
            team_1_gross_scores:allocation.team_1.map(s=>4+s),team_2_gross_scores:allocation.team_2.map(s=>5+s)})));
          assert.equal(result.code,"ACCEPTED");if(hole===9)assert.equal(result.match.clinched,false);
          if(hole===10){assert.equal(result.match.clinched,true);assert.equal(result.match.running_result,"Team 1 wins 10 & 8");tenth=result.match;}
        }
        const final=JSON.parse(await session.query(rpcSql("finalize_production_match",{
          ...opening,mutation_key:proofMutationId("clinch-final"),expected_match_revision:18})));
        assert.equal(final.code,"FINALIZED");assert.equal(final.team_1_points,3);assert.equal(final.team_2_points,0);
        return {clinchAt:10,clinch:tenth.running_result,canonicalHoles:18,points:[3,0]};
      }finally{await session.close();}
    });
    await run("P2-CONC-FINALIZE","final-hole vs Finalize race is never Final with missing hole",async()=>{
      const d=cloneScoreProofDatabase(fixture,"finalize_race");
      for(let h=1;h<=17;h++)assert.equal(score(c,d,inputFor(c,d,undefined,h,{key:`pre-final-${h}`})).code,"ACCEPTED");
      const i=inputFor(c,d,undefined,18),f=inputFor(c,d,undefined,18,{key:"finalize-race"});
      const incomplete=rpc(c,d,"finalize_production_match",f);assert.equal(incomplete.code,"SCORECARD_INCOMPLETE");
      const a=openSqlSession(c,d),b=openSqlSession(c,d);let pending;
      try{
        await a.query("begin");await a.query(sqlScore(i));pending=b.query(rpcSql("finalize_production_match",f));
        await wait(30);await a.query("commit");const stale=JSON.parse(await pending);assert.equal(stale.code,"MATCH_REVISION_CONFLICT");
        f.expected_match_revision=18;const final=rpc(c,d,"finalize_production_match",f);assert.equal(final.code,"FINALIZED");
        const state=canonicalState(c,d);assert.equal(state.holes.length,18);assert.equal(state.match.status,"FINAL");
        return {preFinalHole:"SCORECARD_INCOMPLETE",staleRace:"MATCH_REVISION_CONFLICT",sameMutationRetry:"FINALIZED",holes:18};
      }finally{await Promise.resolve().then(()=>a.query("rollback")).catch(()=>{});await Promise.allSettled([pending]);await Promise.allSettled([a.close(),b.close()]);}
    });
    for(const committed of [false,true])await run(committed?"P2-RESTART-AFTER-COMMIT":"P2-RESTART-IN-TRANSACTION",
      `owned disposable PostgreSQL crash restart ${committed?"after commit":"during open score transaction"}`,async()=>{
        const d=cloneScoreProofDatabase(fixture,committed?"restart_after":"restart_during");const i=inputFor(c,d);
        const session=openSqlSession(c,d);
        try{
          await session.query("begin");assert.equal(JSON.parse(await session.query(sqlScore(i))).code,"ACCEPTED");
          if(committed)await session.query("commit");
          const stopped=runResult(binaries.pg_ctl,["-D",c.data,"-m","immediate","-w","stop"],{env:{PATH:process.env.PATH||"",LC_ALL:"C"}});
          assert.equal(stopped.status,0,stopped.stderr);c.started=false;await session.close();
          const restarted=runResult(binaries.pg_ctl,["-D",c.data,"-l",c.log,"-o",
            `-F -k ${c.socket} -h '' -p ${c.port} -c shared_buffers=32MB -c max_connections=20`,"-w","start"],
            {env:{PATH:process.env.PATH||"",LC_ALL:"C"}});
          assert.equal(restarted.status,0,restarted.stderr+"\n"+(await readFile(c.log,"utf8")).slice(-16000));c.started=true;
          assert.equal(Boolean(exactReceipt(c,d,i)),committed);
          const retry=score(c,d,i);assert.equal(retry.code,"ACCEPTED");assert.equal(retry.idempotent===true,committed);
          const state=canonicalState(c,d);assert.equal(state.holes.length,1);assert.equal(state.receipts.length,1);
          return {restart:"OWNED_CLUSTER_IMMEDIATE_STOP_WAL_RECOVERY",commitBeforeRestart:committed,
            resolved:committed?"COMMITTED":"NOT_COMMITTED",safeRetry:"SAME_MUTATION",powerLossDurability:"NOT_PROVEN_FSYNC_OFF"};
        }finally{await session.close();}
      });
  }finally{
    evidence.completedAt=new Date().toISOString();evidence.counts={pass:evidence.tests.filter(v=>v.result==="PASS").length,fail:evidence.tests.filter(v=>v.result!=="PASS").length};
    if(outputPath){await mkdir(path.dirname(outputPath),{recursive:true});await writeFile(outputPath,JSON.stringify(evidence,null,2)+"\n");}
    await destroyIsolatedCluster(c);
  }
});
