// Proof layers: POSTGRESQL / API handler / INTEGRATION / FAILURE_INJECTION.
// Real score/recovery SQL and shipping adapters. Auth/provider transport is local
// injected authority, NOT hosted Supabase Auth, Production or a physical phone.
import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFile,mkdir,readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { createPhase2CFixture } from './support/reliability/phase2c-fixture.mjs';
import { cloneScoreProofDatabase,inputFor,rpc,rpcSql,canonicalState,proofMutationId,scoringOracle } from './support/reliability/phase2-score-fixture.mjs';
import { sql,sqlResult,jsonLiteral,openSqlSession,destroyIsolatedCluster,repositoryRoot } from './support/reliability/postgres17.mjs';
import { runtimeScope,syntheticDirector } from './support/reliability/synthetic-tournament.mjs';
import { persistParticipantScore } from '../lib/scoring-persistence-adapter.js';
import { mobileApiErrorResult } from '../lib/mobile-api-v1.js';
import { mobileScoringHoleResult } from '../lib/mobile-v1-scoring.js';
import { createScoreMutationRecoveryHandler } from '../lib/scoring-mutation-recovery-route.js';
const recoveryName='read_production_score_mutation_status_v1';
const score=(c,d,i)=>rpc(c,d,'submit_production_hole_score',i);
const recover=(c,d,i)=>rpc(c,d,recoveryName,i);
const identityFor=i=>({authUserId:i.authorization.auth_user_id,playerId:i.authorization.player_id,tournamentId:i.authorization.tournament_id});
const requestFor=i=>new Request('https://isolated.invalid/api/scoring/mutation-status',{method:'POST',headers:{'content-type':'application/json'},
 body:JSON.stringify({matchId:i.match_id,mutationId:i.mutation_key})});
function statusHandler(c,d,i,extra={}) {
 return createScoreMutationRecoveryHandler({env:{},resolveIdentity:async()=>identityFor(i),rateLimit:()=>({allowed:true}),
 readStatus:async input=>({payload:recover(c,d,runtimeScope(input))}),...extra});
}
function control(c,d,match,operation,key) {
 const input=inputFor(c,d,match,1,{director:true,key,operation});
 const result=rpc(c,d,'mutate_production_match_control',input);assert.equal(result.ok,true,JSON.stringify(result));return result;
}
function adapter(c,d,i,{lost=false,includeCanonicalAcknowledgement=true}={}) {
 return persistParticipantScore({matchId:i.match_id,current:{scope:'match',tournamentId:'2026',playerId:i.authorization.player_id,
 authUserId:i.authorization.auth_user_id,matchId:i.match_id,accessVersion:i.authorization.permission_revision,identityAuthority:'supabase'},
 input:{holeNumber:i.hole_number,team1GrossScores:i.team_1_gross_scores,team2GrossScores:i.team_2_gross_scores,
 clientMutationId:i.mutation_key,expectedMatchRevision:i.expected_match_revision,expectedRevision:i.expected_hole_revision},
 canonicalContext:{tournamentId:'2026',matchRevision:i.expected_match_revision,permissionRevision:i.authorization.permission_revision},
 authorizationContext:{identity:identityFor(i)},includeCanonicalAcknowledgement,env:{},dependencies:{
 requireScoringAuthority:()=>({resolved:'supabase',productionDeployment:false,previewDeployment:false}),
 submitCanonicalHoleScore:async input=>{const payload=score(c,d,runtimeScope(input));
 if(lost)throw Object.assign(new Error('Injected response loss after actual COMMIT'),{name:'TimeoutError'});return{payload,durationMs:0};}
 }});
}
async function recoveryProcess(c,d,input,mode) {
 // Only the unforgeable parent-owned cluster helper may authorize the IPC handoff.
 assert.equal(sql(c,d,'select 1'),'1');
 const child=fork(fileURLToPath(new URL('./support/reliability/phase2c-recovery-child.mjs',import.meta.url)),[],{
  execArgv:['--conditions=react-server','--require',path.join(repositoryRoot,'tools/reliability/phase2-network-deny.cjs')],
  env:{PATH:process.env.PATH||'',TMPDIR:os.tmpdir(),
   ...(process.env.BAGGER_RELIABILITY_PG_BIN?{BAGGER_RELIABILITY_PG_BIN:process.env.BAGGER_RELIABILITY_PG_BIN}:{})},
  stdio:['ignore','pipe','pipe','ipc']});
 const messages=[];let diagnostics='';
 child.on('message',value=>messages.push(value));
 for(const stream of [child.stdout,child.stderr]){stream.setEncoding('utf8');stream.on('data',value=>{diagnostics=(diagnostics+value).slice(-4000);});}
 const outcome=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal,pid:child.pid,messages,diagnostics}));});
 const timer=setTimeout(()=>child.kill('SIGKILL'),15000);
 try{child.send({type:'start',mode,directory:c.directory,socket:c.socket,port:c.port,database:d,input});return await outcome;}
 finally{clearTimeout(timer);if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');}
}
const outcomePath=path.join(repositoryRoot,'docs/reliability/phase2c/evidence/recovery-proof.json');
test('Phase2C narrowly authorized receipt recovery with actual canonical SQL',{timeout:600000},async t=>{
 const fixture=await createPhase2CFixture({through:122});const c=fixture.cluster;
 const childSource='test/support/reliability/phase2c-recovery-child.mjs';
 const evidence={schemaVersion:1,startedAt:new Date().toISOString(),...fixture.phase2c,
  childProofSource:{path:childSource,sha256:createHash('sha256').update(await readFile(path.join(repositoryRoot,childSource))).digest('hex')},
  tests:[],nativeResponses:[],limitations:[
  'Provider identity/admission boundaries are explicit synthetic substitutions; no hosted Auth or release proof',
  'Shipping PWA adapter and mobile backend DTO execute; shipping clients do not call the new recovery API automatically',
  'Legacy unbound and absent receipts remain UNKNOWN; no NOT_COMMITTED terminal-attempt protocol exists',
  'No physical device; Build10 decoder must be verified separately against these retained JSON responses']};
 const run=async(id,name,fn)=>t.test(`${id}: ${name}`,async()=>{const entry={id,name,result:'FAIL',proofLayer:['POSTGRESQL','INTEGRATION']};const start=performance.now();
 try{entry.details=await fn();entry.result='PASS';}catch(error){entry.error=error.message;throw error;}finally{entry.elapsedMs=performance.now()-start;evidence.tests.push(entry);}});
 try{
 await run('P2C-A-ORIGIN','new receipts retain exact authenticated origin without changing response',()=>{
  const d=cloneScoreProofDatabase(fixture,'origin');const i=inputFor(c,d);const r=score(c,d,i);assert.equal(r.code,'ACCEPTED');
  const state=canonicalState(c,d);assert.equal(state.receipts[0].originating_auth_user_id,i.authorization.auth_user_id);
  assert.equal(r.originating_auth_user_id,undefined);assert.deepEqual(recover(c,d,i).result,r);
  return {receiptBound:true,responseChanged:false,receiptCount:state.receipts.length};
 });
 for(const [format,match] of [['BB','2026-R1-1'],['SC','2026-R2-1'],['SI','2026-R3-12']]){
  await run(`P2C-A-LOCK-${format}`,`committed ${format} score survives lost acknowledgement and Lock;100reads do not write`,async()=>{
   const d=cloneScoreProofDatabase(fixture,`lock_${format.toLowerCase()}`);const i=inputFor(c,d,match,1);const first=score(c,d,i);
   control(c,d,match,'SCORING_LOCK','lock');const before=canonicalState(c,d,match);
   const replay=score(c,d,i);assert.equal(replay.ok,false);assert.ok(['UNAUTHORIZED','PERMISSION_STALE','SCORING_LOCKED'].includes(replay.code));
   const next=inputFor(c,d,match,2,{key:'after-lock-new'});assert.equal(score(c,d,next).ok,false);
   for(let n=0;n<100;n++){const status=recover(c,d,i);assert.equal(status.status,'COMMITTED');assert.deepEqual(status.result,first);}
   const api=await statusHandler(c,d,i)(requestFor(i));assert.equal(api.status,200);const body=await api.json();assert.equal(body.status,'COMMITTED');
   assert.deepEqual(body.canonical.gross,first.gross);
   assert.deepEqual(first.gross,{team_1:i.team_1_gross_scores,team_2:i.team_2_gross_scores});
   assert.deepEqual(body.canonical.strokes,first.strokes);assert.deepEqual(body.canonical.net,first.net);
   assert.equal(first.gross.team_1.length,format==='BB'?2:1);assert.equal(first.gross.team_2.length,format==='BB'?2:1);
   assert.deepEqual(canonicalState(c,d,match),before);
   return{format,replayDenied:replay.code,newScoreDenied:true,recoveryChecks:100,apiStatus:body.status,noWrites:true};
  });
  await run(`P2C-A-FINAL-${format}`,`full ${format} lost final-hole acknowledgement remains recoverable after Finalize`,async()=>{
   const d=cloneScoreProofDatabase(fixture,`final_${format.toLowerCase()}`);let last,lastResult;
   for(let hole=1;hole<=18;hole++){last=inputFor(c,d,match,hole);
    if(hole===18){await assert.rejects(adapter(c,d,last,{lost:true}),{name:'TimeoutError'});lastResult=recover(c,d,last).result;}
    else lastResult=score(c,d,last);assert.equal(lastResult.code,'ACCEPTED');}
   const final=rpc(c,d,'finalize_production_match',inputFor(c,d,match,18,{key:'final',director:true}));assert.equal(final.ok,true,JSON.stringify(final));
   const before=canonicalState(c,d,match);assert.equal(before.match.status,'FINAL');
   await assert.rejects(adapter(c,d,inputFor(c,d,match,1,{key:'final-denied',team_1_gross_scores:format==='BB'?[9,9]:[9]})),
    error=>['UNAUTHORIZED','PERMISSION_STALE','SCORING_LOCKED','MATCH_FINAL'].includes(error.code));
   const response=await statusHandler(c,d,last)(requestFor(last));assert.equal(response.status,200);
   const recovered=await response.json();assert.equal(recovered.status,'COMMITTED');assert.equal(recovered.mutationId,last.mutation_key);
   for(const field of ['gross','strokes','net'])assert.deepEqual(recovered.canonical[field],lastResult[field]);
   assert.deepEqual(recover(c,d,last).result,lastResult);assert.deepEqual(canonicalState(c,d,match),before);
   return{format,holes:18,final:true,lostFinalHoleAcknowledgement:true,finalHoleRecovery:'COMMITTED',newScoreDenied:true,
    pwaAdapter:'persistParticipantScore',actualStatusHandler:true,postFinalizeApiStatus:'COMMITTED',postFinalizePwaWriteDenied:true,
    noRecoveryWrites:true,providerBoundary:'INJECTED_LOCAL_SQL'};
  });
 }
 await run('P2C-A-ROUND-LOCK','supported whole-round Lock revokes all12 matches while original owned receipt stays recoverable',async()=>{
  const d=cloneScoreProofDatabase(fixture,'round_lock'),i=inputFor(c,d);const accepted=score(c,d,i);assert.equal(accepted.code,'ACCEPTED');
  // Actual atomic round RPC and its actual preflight; do not manufacture the
  // revoked state or substitute any additional runtime/readiness/actor guards.
  const fingerprint=sql(c,d,"select production_control.round_scoring_state_v1(3)->>'fingerprint'");
  const roundInput=runtimeScope({round:3,operation:'LOCK',operation_id:proofMutationId('recovery-round-lock'),
   expected_fingerprint:fingerprint,authorization:{tournament_id:'2026',role:'DIRECTOR',
    player_id:syntheticDirector.playerId,auth_user_id:syntheticDirector.authUserId}});
  const locked=rpc(c,d,'mutate_production_round_scoring_v1',roundInput);assert.equal(locked.ok,true,JSON.stringify(locked));
  assert.equal(locked.receipt.operation,'LOCK');assert.equal(locked.receipt.affectedMatches.length,12);
  assert.equal(locked.data.summary.locked,12);assert.equal(locked.data.summary.accessActive,0);
  const authority=JSON.parse(sql(c,d,`select jsonb_build_object('matches',count(*),'locked',count(*)filter(where m.scoring_locked),
   'activePermissions',(select count(*)from scoring_authority.scoring_permissions p join scoring_authority.matches pm using(match_id)
    where pm.tournament_id='2026' and pm.round_number=3 and(p.can_score or p.revoked_at is null)))
   from scoring_authority.matches m where m.tournament_id='2026' and m.round_number=3`));
  assert.deepEqual(authority,{matches:12,locked:12,activePermissions:0});
  const before=canonicalState(c,d);assert.deepEqual(recover(c,d,i).result,accepted);
  const api=await statusHandler(c,d,i)(requestFor(i));assert.equal(api.status,200);assert.equal((await api.json()).status,'COMMITTED');
  const denied=score(c,d,inputFor(c,d,undefined,2,{key:'after-whole-round-lock'}));assert.equal(denied.ok,false);
  assert.ok(['UNAUTHORIZED','PERMISSION_STALE','SCORING_LOCKED'].includes(denied.code),JSON.stringify(denied));
  assert.deepEqual(canonicalState(c,d),before);
  return{round:3,actualRoundRpc:true,affectedMatches:12,activePermissions:0,status:'COMMITTED',newScoreDenied:denied.code,
   noRecoveryWrites:true,additionalGuardSubstitutions:false,
   limitation:'Existing Phase1 synthetic runtime boundary remains; actual round operation/readiness/actor functions execute. Not hosted round control.'};
 });
 await run('P2C-A-NO-WRITE-LOCK','receipt recovery completes while another transaction holds the same match write lock',async()=>{
  const d=cloneScoreProofDatabase(fixture,'read_without_write_lock'),i=inputFor(c,d);const accepted=score(c,d,i);assert.equal(accepted.code,'ACCEPTED');
  const before=canonicalState(c,d),holder=openSqlSession(c,d),reader=openSqlSession(c,d);let began;
  try{
   await holder.query('begin');assert.equal(await holder.query(`select match_id from scoring_authority.matches where match_id='2026-R3-12' for update`),i.match_id);
   // Verify an independent would-be writer cannot acquire that lock. Recovery
   // must finish before the holder rolls back, not merely after eventual unlock.
   const writer=sqlResult(c,d,"\\set VERBOSITY verbose\nbegin;select match_id from scoring_authority.matches where match_id='2026-R3-12' for update nowait;rollback");
   assert.notEqual(writer.status,0);assert.match(writer.stderr,/55P03/);
   assert.equal(await reader.query('show statement_timeout'),'1s');began=performance.now();
   const result=JSON.parse(await reader.query(`begin read only;${rpcSql(recoveryName,i)};commit`));
   const recoveryMs=performance.now()-began;assert.equal(result.status,'COMMITTED');assert.deepEqual(result.result,accepted);
   const stillHeld=sqlResult(c,d,"\\set VERBOSITY verbose\nbegin;select match_id from scoring_authority.matches where match_id='2026-R3-12' for update nowait;rollback");
   assert.notEqual(stillHeld.status,0);assert.match(stillHeld.stderr,/55P03/);
   assert.deepEqual(canonicalState(c,d),before);
   return{status:'COMMITTED',independentWriterSqlstate:'55P03',writerLockStillHeldAtReadCompletion:true,
    normalStatementTimeoutMs:1000,recoveryMs,readOnlyTransaction:true,noRecoveryWrites:true,
    limitation:'Single isolated lock-behavior observation, not a latency distribution or provider contention benchmark.'};
  }finally{await Promise.resolve().then(()=>holder.query('rollback')).catch(()=>{});await Promise.allSettled([holder.close(),reader.close()]);}
 });
 await run('P2C-A-CORRECTION','lost correction acknowledgement resolves distinctly from the original receipt',async()=>{
  const d=cloneScoreProofDatabase(fixture,'correction');const first=inputFor(c,d);const a=score(c,d,first);
  const correction=inputFor(c,d,undefined,1,{key:'correction',team_1_gross_scores:[9]});
  await assert.rejects(adapter(c,d,correction,{lost:true}),{name:'TimeoutError'});const b=recover(c,d,correction).result;
  assert.equal(b.code,'ACCEPTED');assert.notDeepEqual(a.gross,b.gross);control(c,d,first.match_id,'SCORING_LOCK','lock');
  const before=canonicalState(c,d);assert.deepEqual(recover(c,d,first).result,a);assert.deepEqual(recover(c,d,correction).result,b);
  assert.deepEqual(canonicalState(c,d),before);
  return{originalRevision:a.hole_revision,correctionRevision:b.hole_revision,currentReceiptNotConfused:true,lostCorrectionAcknowledgement:true,noRecoveryWrites:true};
 });
 await run('P2C-A-EARLY','Singles clinch and Nassau mid-round acknowledgements recover before Hole18',async()=>{
  const formats=[];
  for(const [format,match] of [['BB','2026-R1-1'],['SC','2026-R2-1'],['SI','2026-R3-12']]){
   const d=cloneScoreProofDatabase(fixture,`early_${format.toLowerCase()}`),oracle=scoringOracle(c,d,match);let last,result;
   for(let hole=1;hole<=10;hole++){
    const zero=Array(format==='BB'?2:1).fill(5),allocation=oracle.hole(hole,zero,zero).strokes;
    last=inputFor(c,d,match,hole,{team_1_gross_scores:allocation.team_1.map(n=>4+n),team_2_gross_scores:allocation.team_2.map(n=>5+n)});
    if(hole===10){await assert.rejects(adapter(c,d,last,{lost:true}),{name:'TimeoutError'});result=recover(c,d,last).result;}
    else result=score(c,d,last);
    assert.equal(result.code,'ACCEPTED');assert.equal(result.match.clinched,format==='SI'&&hole===10);
   }
   assert.equal(result.match.running_result,format==='SI'?'Team 1 wins 10 & 8':'Team 1 10 UP through 10');control(c,d,match,'SCORING_LOCK','early-lock');
   const before=canonicalState(c,d,match);assert.equal(before.holes.length,10);assert.equal(before.match.clinched,format==='SI');
   assert.deepEqual(recover(c,d,last).result,result);assert.deepEqual(canonicalState(c,d,match),before);
   formats.push({format,observedHole:10,decisiveHole:format==='SI'?10:null,clinched:format==='SI',result:result.match.running_result,recovery:'COMMITTED'});
  }
  return{formats,lostAcknowledgement:true,noRecoveryWrites:true,
   limitation:'Singles clinches at10; Best Ball/Scramble Nassau formats correctly remain unclinched before18. Existing Finalize requires complete18-hole golf. No rule or admission changed.'};
 });
 await run('P2C-A-HALVED','all formats recover a lost final-hole acknowledgement after a halved Finalize',async()=>{
  const formats=[];
  for(const [format,match] of [['BB','2026-R1-1'],['SC','2026-R2-1'],['SI','2026-R3-12']]){
   const d=cloneScoreProofDatabase(fixture,`halved_${format.toLowerCase()}`),oracle=scoringOracle(c,d,match);let last,result;
   for(let hole=1;hole<=18;hole++){
    const zero=Array(format==='BB'?2:1).fill(5),allocation=oracle.hole(hole,zero,zero).strokes;
    last=inputFor(c,d,match,hole,{team_1_gross_scores:allocation.team_1.map(n=>5+n),team_2_gross_scores:allocation.team_2.map(n=>5+n)});
    if(hole===18){await assert.rejects(adapter(c,d,last,{lost:true}),{name:'TimeoutError'});result=recover(c,d,last).result;}
    else result=score(c,d,last);
    assert.equal(result.code,'ACCEPTED');assert.equal(result.hole_winner,'Halved');assert.deepEqual(result.net,{team_1:5,team_2:5});
   }
   const final=rpc(c,d,'finalize_production_match',inputFor(c,d,match,18,{key:'halved-final',director:true}));
   assert.equal(final.code,'FINALIZED');assert.equal(final.result_winner,'Halved');assert.equal(final.team_1_points,1.5);assert.equal(final.team_2_points,1.5);
   const before=canonicalState(c,d,match);assert.deepEqual(recover(c,d,last).result,result);assert.deepEqual(canonicalState(c,d,match),before);
   formats.push({format,holes:18,result:'Halved',points:[1.5,1.5],recovery:'COMMITTED'});
  }
  return{formats,lostFinalHoleAcknowledgement:true,noRecoveryWrites:true};
 });
 await run('P2C-A-PROCESS-RESTART','fresh API process resolves durable receipt after the submitting process exits and Lock',async()=>{
  const d=cloneScoreProofDatabase(fixture,'process_restart'),i=inputFor(c,d);
  const committed=await recoveryProcess(c,d,i,'commit-lose-response');assert.equal(committed.code,77,committed.diagnostics);
  assert.equal(committed.messages.length,0,'Submitting child must not deliver a canonical response');
  assert.equal(canonicalState(c,d).holes.length,1);control(c,d,i.match_id,'SCORING_LOCK','restart-lock');
  const before=canonicalState(c,d),fresh=await recoveryProcess(c,d,i,'recover');assert.equal(fresh.code,0,fresh.diagnostics);
  assert.notEqual(fresh.pid,committed.pid);assert.equal(fresh.messages.length,1);const response=fresh.messages[0];
  assert.equal(response.type,'response');assert.equal(response.status,200);assert.equal(response.body.status,'COMMITTED');
  assert.equal(response.body.mutationId,i.mutation_key);assert.deepEqual(response.body.canonical.gross,recover(c,d,i).result.gross);
  assert.deepEqual(canonicalState(c,d),before);
  return{submitExit:77,submissionAcknowledgementDelivered:false,submitPid:committed.pid,recoveryPid:fresh.pid,
   newProcess:true,status:'COMMITTED',actualPwaAdapter:true,actualStatusHandler:true,actualPostgresql:true,noRecoveryWrites:true,
   identity:'INJECTED_SYNTHETIC_CURRENT_IDENTITY',provider:'LOCAL_UNIX_SOCKET_SQL',hostedHttp:'NOT PROVEN'};
 });
 await run('P2C-A-NO-CHANGE','NO_CHANGE under a new ID cannot be falsely attributed as COMMITTED',()=>{
  const d=cloneScoreProofDatabase(fixture,'noop');const first=inputFor(c,d);score(c,d,first);
  const another=inputFor(c,d,undefined,1,{key:'same-gross-new-id'});assert.equal(score(c,d,another).code,'NO_CHANGE');
  assert.equal(recover(c,d,another).status,'UNKNOWN');assert.equal(canonicalState(c,d).receipts.length,1);
  return{newId:'UNKNOWN',existingId:recover(c,d,first).status};
 });
 await run('P2C-A-LEGACY','legacy receipt without immutable Auth association is UNKNOWN',()=>{
  const d=cloneScoreProofDatabase(fixture,'legacy');const i=inputFor(c,d);score(c,d,i);
  // Synthetic legacy schema state. Never infer/backfill from the current link.
  sql(c,d,'update scoring_authority.score_mutations set originating_auth_user_id=null',{role:''});
  const before=canonicalState(c,d);assert.equal(recover(c,d,i).status,'UNKNOWN');assert.deepEqual(canonicalState(c,d),before);
  return{legacyUnbound:'UNKNOWN',backfilled:false};
 });
 await run('P2C-A-ENUMERATION','other owner, other match, missing and random IDs do not disclose receipts',()=>{
  const d=cloneScoreProofDatabase(fixture,'enum');const i=inputFor(c,d);score(c,d,i);
  const others=JSON.parse(sql(c,d,`select jsonb_agg(player_id order by player_id) from scoring_authority.match_participants where match_id='2026-R3-12'`));
  const sameMatch=others.find(p=>p!==i.authorization.player_id);
  const foreign=player=>({...i,authorization:{...i.authorization,player_id:player,auth_user_id:`10000000-0000-4000-8000-${String(Number(player.slice(1))).padStart(12,'0')}`}});
  for(const attempt of [foreign(sameMatch),foreign('P01'),{...i,mutation_key:proofMutationId('random')},
    {...i,match_id:'missing-match',authorization:{...i.authorization,match_id:'missing-match'}}]){
   const r=recover(c,d,attempt);assert.equal(r.status,'UNKNOWN');assert.equal(r.result,undefined);
   assert.deepEqual(Object.keys(r).sort(),['contract','match_id','mutation_key','ok','status']);
  }
  return{sameMatchOtherParticipant:'UNKNOWN',otherMatchParticipant:'UNKNOWN',random:'UNKNOWN',noExistenceDisclosure:true};
 });
 for(const change of ['UNLINK','UNVERIFY','ROLE_REVOKE'])await run(`P2C-A-DENY-${change}`,`${change} denies both receipt and write authority`,()=>{
  const d=cloneScoreProofDatabase(fixture,change.toLowerCase());const i=inputFor(c,d);score(c,d,i);
  const auth=i.authorization.auth_user_id;
  sql(c,d,change==='UNLINK'?`update participant_identity.user_player_links set status='REVOKED',revoked_at=now() where auth_user_id='${auth}'`:
   change==='UNVERIFY'?`update auth.users set email_confirmed_at=null where id='${auth}'`:
   `update participant_identity.tournament_roles set role_active=false,revoked_at=now() where auth_user_id='${auth}'`,{role:''});
  const result=sqlResult(c,d,`\\set VERBOSITY verbose\n${rpcSql(recoveryName,i)};`);assert.notEqual(result.status,0);assert.match(result.stderr,/42501/);
  const write=sqlResult(c,d,`\\set VERBOSITY verbose\n${rpcSql('submit_production_hole_score',i)};`);assert.notEqual(write.status,0);assert.match(write.stderr,/42501/);
  return{sqlstate:'42501',privacyPreserved:true,scoreWriteDenied:true};
 });
 await run('P2C-A-SPOOF','mismatched Auth/player and tournament bindings fail closed',()=>{
  const d=cloneScoreProofDatabase(fixture,'spoof');const i=inputFor(c,d);score(c,d,i);const before=canonicalState(c,d);
  for(const attempt of [
   {...i,authorization:{...i.authorization,auth_user_id:'10000000-0000-4000-8000-000000000001'}},
   {...i,authorization:{...i.authorization,player_id:'P01'}},
   {...i,authorization:{...i.authorization,tournament_id:'2027'}},
   {...i,authorization:{...i.authorization,match_id:'2026-R1-1'}}]){
   const r=sqlResult(c,d,`\\set VERBOSITY verbose\n${rpcSql(recoveryName,attempt)};`);
   assert.notEqual(r.status,0);assert.match(r.stderr,/42501|22023/);
  }
  assert.deepEqual(canonicalState(c,d),before);return{bindingDenials:4,noCanonicalChanges:true};
 });
 await run('P2C-A-REASSIGNED','a newly valid account linked to the same golfer cannot claim the original account receipt',()=>{
  const d=cloneScoreProofDatabase(fixture,'reassigned');const i=inputFor(c,d);score(c,d,i);
  const oldAuth=i.authorization.auth_user_id,player=i.authorization.player_id,newAuth='10000000-0000-4000-8000-000000000099';
  // Synthetic identity reassignment only. Competitive facts and old receipt stay immutable.
  sql(c,d,`update participant_identity.user_player_links set status='REVOKED',revoked_at=now() where auth_user_id='${oldAuth}';
   update participant_identity.participant_auth_identifiers set status='REVOKED',revoked_at=now() where auth_user_id='${oldAuth}';
   insert into auth.users(id,email,email_confirmed_at)values('${newAuth}','replacement@synthetic.invalid',now());
   insert into participant_identity.user_player_links(auth_user_id,player_id,status,link_method,email_identity_hash)
    values('${newAuth}','${player}','ACTIVE','SYNTHETIC_FIXTURE',repeat('9',64));
   insert into participant_identity.participant_auth_identifiers(player_id,auth_user_id,identifier_type,normalized_value_private,status,
    verified_at,verification_source,source_system,created_by,updated_by)
    values('${player}','${newAuth}','EMAIL','replacement@synthetic.invalid','VERIFIED',now(),'SYNTHETIC_FIXTURE','SYNTHETIC_FIXTURE','fixture','fixture');
   insert into participant_identity.tournament_roles(tournament_id,auth_user_id,role,granted_by)
    values('2026','${newAuth}','PARTICIPANT','fixture');`,{role:''});
  const changed={...i,authorization:{...i.authorization,auth_user_id:newAuth}};
  assert.equal(recover(c,d,changed).status,'UNKNOWN');
  const second=inputFor(c,d,undefined,2,{key:'new-valid-account'});second.authorization.auth_user_id=newAuth;
  assert.equal(score(c,d,second).code,'ACCEPTED');assert.equal(recover(c,d,second).status,'COMMITTED');
  assert.equal(recover(c,d,changed).status,'UNKNOWN');
  return{samePlayerNewAuth:'UNKNOWN_FOR_OLD_RECEIPT',newAccountOwnReceipt:'COMMITTED',currentIdentityNotHistoricalOwnership:true};
 });
 await run('P2C-A-DELETED','supported local account deletion preserves receipt but revokes recovery',()=>{
  const d=cloneScoreProofDatabase(fixture,'deleted');const i=inputFor(c,d);score(c,d,i);const auth=i.authorization.auth_user_id;
  const deletion=JSON.parse(sql(c,d,`select public.initiate_account_deletion_v1('${auth}'::uuid,'01234567-0000-4000-8000-000000000001'::uuid);`));
  assert.equal(deletion.status,'READY');
  // Exact supported cleanup trigger, synthetic auth table only; no provider request.
  sql(c,d,`delete from auth.users where id='${auth}'::uuid`,{role:''});
  const state=canonicalState(c,d);assert.equal(state.receipts.length,1);assert.equal(state.receipts[0].originating_auth_user_id,auth);
  const r=sqlResult(c,d,`\\set VERBOSITY verbose\n${rpcSql(recoveryName,i)};`);assert.notEqual(r.status,0);assert.match(r.stderr,/42501/);
  assert.deepEqual(canonicalState(c,d),state);return{syntheticAuthDeleted:true,canonicalReceiptRetained:true,recoveryDenied:'42501',providerDeletionTested:false};
 });
 await run('P2C-A-RUNTIME','recovery still calls current read-admission guard',()=>{
  const d=cloneScoreProofDatabase(fixture,'runtime');const i=inputFor(c,d);score(c,d,i);
  const scoped=runtimeScope(i);scoped.project_ref='wrong-isolated-resource';
  const r=sqlResult(c,d,`\\set VERBOSITY verbose\nselect public.${recoveryName}(${jsonLiteral(scoped)});`);
  assert.notEqual(r.status,0);assert.match(r.stderr,/RELIABILITY_LOCAL_READ_SCOPE_DENIED/);
  return{guardExecuted:true,wrongResourceDenied:true,realHostedAdmission:'NOT PROVEN'};
 });
 await run('P2C-A-TIMEOUT','real database timeout during recovery leaves score intact and retry resolves',()=>{
  const d=cloneScoreProofDatabase(fixture,'timeout');const i=inputFor(c,d);score(c,d,i);const before=canonicalState(c,d);
  sql(c,d,`create or replace function production_control.assert_production_cutover_read_scope(input jsonb,required_phase text)
   returns production_control.resource_scope language plpgsql security definer set search_path=pg_catalog,production_control as $$
   declare value production_control.resource_scope%rowtype;begin perform pg_sleep(0.05);select * into value from production_control.resource_scope limit 1;return value;end$$;`,{role:''});
  const r=sqlResult(c,d,`\\set VERBOSITY verbose\nset statement_timeout='1ms';${rpcSql(recoveryName,i)};`);
  assert.notEqual(r.status,0);assert.match(r.stderr,/57014/);assert.deepEqual(canonicalState(c,d),before);
  assert.equal(recover(c,d,i).status,'COMMITTED');assert.deepEqual(canonicalState(c,d),before);
  return{sqlstate:'57014',canonicalIntact:true,retryResult:'COMMITTED',faultPoint:'synthetic read-admission boundary'};
 });
 await run('P2C-A-ACL','real end-user roles cannot read receipts; private helper denies all API roles',()=>{
  const d=cloneScoreProofDatabase(fixture,'acl');const i=inputFor(c,d);score(c,d,i);let denials=0;
  for(const role of ['anon','authenticated','service_role']){
   const statements=[`select production_control.read_score_mutation_status_v1(${jsonLiteral(i)},'2026')`];
   if(role!=='service_role')statements.push(`select * from scoring_authority.score_mutations limit 1`);
   for(const statement of statements){
    const result=sqlResult(c,d,`\\set VERBOSITY verbose\n begin;set local role ${role};${statement};rollback;`);
    assert.notEqual(result.status,0,`${role}: ${statement}`);assert.match(result.stderr,/42501/);denials++;
   }
  }
  for(const role of ['anon','authenticated']){
   const result=sqlResult(c,d,`\\set VERBOSITY verbose\n begin;set local role ${role};${rpcSql(recoveryName,i)};rollback;`);
   assert.notEqual(result.status,0);assert.match(result.stderr,/42501/);denials++;
  }
  // Migration002 already grants trusted service_role SELECT. It is not an end-user
  // role; local compatibility fixture lacks hosted BYPASSRLS. Do not invent a new
  // denial requirement or mislabel this local RLS result as provider-role proof.
  assert.equal(sql(c,d,"select has_table_privilege('service_role','scoring_authority.score_mutations','SELECT')"),'t');
  const serviceVisibleRows=Number(sql(c,d,`begin;set local role service_role;select count(*) from scoring_authority.score_mutations;rollback;`));
  const accepted=JSON.parse(sql(c,d,`begin;set local role service_role;${rpcSql(recoveryName,i)};rollback;`));assert.equal(accepted.status,'COMMITTED');
  return{actualRoleDenials:denials,servicePublicRpc:'COMMITTED',trustedServiceTableSelect:'PREEXISTING GRANT',serviceVisibleRows,
   hostedServiceBypassRls:'NOT PROVEN',rlsFlagOnlyNotFullPolicyMatrix:true};
 });
 await run('P2C-A-INFLIGHT','invisible inflight receipt is UNKNOWN; commit resolves and rollback stays unknown',async()=>{
  const d=cloneScoreProofDatabase(fixture,'inflight');const i=inputFor(c,d);const session=openSqlSession(c,d);
  try{await session.query('begin');const first=JSON.parse(await session.query(rpcSql('submit_production_hole_score',i)));assert.equal(first.code,'ACCEPTED');
   assert.equal(recover(c,d,i).status,'UNKNOWN');await session.query('commit');assert.deepEqual(recover(c,d,i).result,first);
   const second=inputFor(c,d,undefined,2);await session.query('begin');await session.query(rpcSql('submit_production_hole_score',second));
   assert.equal(recover(c,d,second).status,'UNKNOWN');await session.query('rollback');assert.equal(recover(c,d,second).status,'UNKNOWN');
   return{inflight:'UNKNOWN',committed:'COMMITTED',knownTestRollbackEndpoint:'UNKNOWN',noFalseNegative:true};
  }finally{await Promise.resolve().then(()=>session.query('rollback')).catch(()=>{});await session.close();}
 });
 await run('P2C-A-READONLY','status executes inside READ ONLY transaction and creates no audit or derived demand',()=>{
  const d=cloneScoreProofDatabase(fixture,'readonly');const i=inputFor(c,d);score(c,d,i);const before=canonicalState(c,d);
  const r=JSON.parse(sql(c,d,`begin read only;${rpcSql(recoveryName,i)};commit;`));assert.equal(r.status,'COMMITTED');
  assert.deepEqual(canonicalState(c,d),before);return{readOnlyTransaction:true,noCanonicalAuditWrites:true};
 });
 await run('P2C-F-PWA','shipping PWA persistence adapter survives lost ack and new status resolves after Lock',async()=>{
  const d=cloneScoreProofDatabase(fixture,'pwa');const i=inputFor(c,d);
  await assert.rejects(adapter(c,d,i,{lost:true}),{name:'TimeoutError'});assert.equal(canonicalState(c,d).holes.length,1);
  control(c,d,i.match_id,'SCORING_LOCK','lock');const h=statusHandler(c,d,i);
  const body=await (await h(requestFor(i))).json();assert.equal(body.status,'COMMITTED');
  await assert.rejects(adapter(c,d,inputFor(c,d,undefined,2,{key:'denied'})),error=>['UNAUTHORIZED','PERMISSION_STALE','SCORING_LOCKED'].includes(error.code));
  assert.equal(canonicalState(c,d).holes.length,1);
  return{adapter:'persistParticipantScore',lostAckAfterSqlCommit:true,recovery:'COMMITTED',newScoreDenied:true,
   providerBoundary:'INJECTED_LOCAL_SQL',pwaUiCallsRecovery:false};
 });
 await run('P2C-F-PWA-REPLAY','shipping adapter same-ID replay, conflict and next-hole retain response shape',async()=>{
  const d=cloneScoreProofDatabase(fixture,'pwa_retry');const i=inputFor(c,d);const a=await adapter(c,d,i);const b=await adapter(c,d,i);
  assert.equal(a.result.hole.Revision,1);assert.equal(b.result.idempotent,true);
  await assert.rejects(adapter(c,d,{...i,team_1_gross_scores:[9]}),{code:'IDEMPOTENCY_CONFLICT'});
  const next=await adapter(c,d,inputFor(c,d,undefined,2));assert.equal(next.result.matchRevision,2);
  assert.equal(canonicalState(c,d).holes.length,2);return{replay:true,conflict:'IDEMPOTENCY_CONFLICT',nextHole:2};
 });
 for(const [format,match] of [['BB','2026-R1-1'],['SC','2026-R2-1'],['SI','2026-R3-12']])await run(`P2C-F-MOBILE-${format}`,`unchanged mobile backend ${format} DTO from candidate SQL`,async()=>{
  const d=cloneScoreProofDatabase(fixture,`mobile_${format.toLowerCase()}`);const i=inputFor(c,d,match,1);
  const id={...identityFor(i),context:{matches:[{matchId:match,format,round:format==='BB'?1:format==='SC'?2:3,status:'LIVE',canScore:true,permissionRevision:1}]}};
  const body={matchId:match,holeNumber:1,teamOneGrossScores:i.team_1_gross_scores,teamTwoGrossScores:i.team_2_gross_scores,
   mutationId:i.mutation_key,expectedMatchRevision:0,expectedHoleRevision:0};
  const deps={scoringAuthorityEnvironment:()=>({resolved:'supabase'}),requireScoringReadSource:()=>({resolved:'supabase'}),
   authorizeMatchAccess:async()=>({payload:{allowed:true,permission_revision:1,can_score:true,match_status:'LIVE'}}),
   persistParticipantScore:args=>persistParticipantScore({...args,env:{},dependencies:{requireScoringAuthority:()=>({resolved:'supabase',productionDeployment:false}),
    submitCanonicalHoleScore:async input=>({payload:score(c,d,runtimeScope(input)),durationMs:0})}})};
  const result=await mobileScoringHoleResult(id,body,{env:{},dependencies:deps});assert.equal(result.status,200);assert.equal(result.body.data.accepted,true);
  const replay=await mobileScoringHoleResult(id,body,{env:{},dependencies:deps});assert.equal(replay.body.data.idempotent,true);
  const asErrorResponse=async promise=>{try{await promise;assert.fail('Expected mobile scoring failure');}catch(error){return mobileApiErrorResult(error);}};
  const conflict=await asErrorResponse(mobileScoringHoleResult(id,{...body,teamOneGrossScores:body.teamOneGrossScores.map(n=>n+1)},{env:{},dependencies:deps}));
  assert.equal(conflict.status,409);assert.equal(conflict.body.error.code,'IDEMPOTENCY_CONFLICT');
  const beforeTimeout=canonicalState(c,d,match),held=openSqlSession(c,d);let timeout,actualTimeout=false;
  try{
   await held.query('begin');await held.query(`select match_id from scoring_authority.matches where match_id=${jsonLiteral(match)}#>>'{}' for update`);
   const timed=inputFor(c,d,match,2,{key:'mobile-timeout-'+format});
   const timedBody={...body,holeNumber:2,mutationId:timed.mutation_key,expectedMatchRevision:timed.expected_match_revision,expectedHoleRevision:0};
   const timeoutDeps={...deps,persistParticipantScore:args=>persistParticipantScore({...args,env:{},dependencies:{
    requireScoringAuthority:()=>({resolved:'supabase',productionDeployment:false}),submitCanonicalHoleScore:async input=>{
     const failed=sqlResult(c,d,`\\set VERBOSITY verbose\nbegin;set local statement_timeout='25ms';${rpcSql('submit_production_hole_score',runtimeScope(input))};commit;`);
     assert.notEqual(failed.status,0);assert.match(failed.stderr,/57014/);actualTimeout=true;
     throw Object.assign(new Error('Isolated actual PostgreSQL statement timeout'),{code:'57014'});
    }}})};
   timeout=await asErrorResponse(mobileScoringHoleResult(id,timedBody,{env:{},dependencies:timeoutDeps}));
   assert.equal(actualTimeout,true);assert.equal(timeout.status,500);assert.equal(timeout.body.error.code,'INTERNAL_ERROR');
  }finally{await held.query('rollback');await held.close();}
  assert.deepEqual(canonicalState(c,d,match),beforeTimeout);
  assert.equal(canonicalState(c,d,match).holes.length,1);
  evidence.nativeResponses.push({format,request:body,accepted:result.body,replay:replay.body,conflict:conflict.body,timeout:timeout.body});
  return{mobileBackendDto:'PASS',conflict:'IDEMPOTENCY_CONFLICT',actualSqlstate:'57014',timeoutExternalCode:'INTERNAL_ERROR',
   timeoutRollbackVerified:true,shippingNativeSourceChanged:false,decoder:'SEPARATE_REQUIRED_PROOF'};
 });
 }finally{
  evidence.completedAt=new Date().toISOString();evidence.summary={total:evidence.tests.length,passed:evidence.tests.filter(x=>x.result==='PASS').length,
   failed:evidence.tests.filter(x=>x.result!=='PASS').length};
  await destroyIsolatedCluster(c);evidence.clusterDestroyed=true;await mkdir(path.dirname(outcomePath),{recursive:true});
  await writeFile(outcomePath,JSON.stringify(evidence,null,2)+'\n');
 }
});
